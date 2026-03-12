package com.pkt.pickletour

import android.app.Activity
import android.app.ActivityManager
import android.content.Context
import android.content.ComponentCallbacks2
import android.os.SystemClock
import com.facebook.react.bridge.LifecycleEventListener
import java.lang.reflect.Method
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.PorterDuff
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.TrafficStats
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.util.Size
import android.view.Choreographer
import android.view.OrientationEventListener
import android.view.Surface
import android.view.SurfaceHolder
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.FrameLayout
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.pedro.common.ConnectChecker
import com.pedro.library.rtmp.RtmpCamera2
import com.pedro.library.view.OpenGlView
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.abs

/** View registry để native có thể lấy đúng OpenGlView hiện đang hiển thị */
object PreviewRegistry {
  @Volatile
  var openGlView: OpenGlView? = null
}

class FacebookLiveModule(private val reactCtx: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactCtx), ConnectChecker, LifecycleEventListener, ComponentCallbacks2 {

  companion object {
    private const val TAG = "FacebookLiveModule"
    private const val ENABLE_LOGS = false
    private const val ENABLE_RECORDING_LOGS = false
    private const val OVERLAY_UPDATE_DEBOUNCE_MS = 50L
    private const val STATS_UPDATE_INTERVAL_MS = 1000L

    private val overlayLock = Any()

    private fun log(msg: String) {
      if (ENABLE_LOGS) Log.d(TAG, msg)
    }

    private fun rlog(msg: String) {
      if (ENABLE_RECORDING_LOGS) Log.d(TAG, "LOG RECORDING: $msg")
    }
  }
  init {
    // ✅ Tự xử lý pause/destroy + áp lực bộ nhớ để giảm crash trên Android
    reactCtx.addLifecycleEventListener(this)
    reactCtx.registerComponentCallbacks(this)
  }

  override fun invalidate() {
    try { reactCtx.unregisterComponentCallbacks(this) } catch (_: Throwable) {}
    try { reactCtx.removeLifecycleEventListener(this) } catch (_: Throwable) {}
    super.invalidate()
  }

  override fun onHostResume() {
    // no-op (JS sẽ tự gọi start lại nếu cần)
  }

  override fun onHostPause() {
    // Safety: tránh crash camera/encoder khi app background
    runOnMain {
      try {
        synchronized(overlayLock) {
          overlayVisible = false
          updateOverlayTickerLocked()
        }
        try { overlayFilter?.let { glSetAlpha(it, 0f) } } catch (_: Throwable) {}
        // ✅ FIX: Use delayed stop to avoid ViewGroup IndexOutOfBoundsException
        safeStopStream(stopPreview = false)
      } catch (_: Throwable) {}
    }
  }

  override fun onHostDestroy() {
    // Best-effort cleanup
    runOnMain {
      try {
        stopNetworkStatsTracking()
        // ✅ FIX: Use delayed stop to avoid ViewGroup IndexOutOfBoundsException
        safeStopStream(stopPreview = true)
        overlaySuspendInternal(freeMemory = true, aggressiveImages = true)
      } catch (_: Throwable) {}
    }
  }

  override fun onTrimMemory(level: Int) {
    // Khi hệ thống báo thiếu RAM -> giải phóng GPU/bitmap để không crash
    val aggressive = level >= ComponentCallbacks2.TRIM_MEMORY_RUNNING_CRITICAL
    runOnMain {
      try {
        overlaySuspendInternal(freeMemory = aggressive, aggressiveImages = aggressive)
      } catch (_: Throwable) {}
    }
  }

  override fun onLowMemory() {
    runOnMain {
      try {
        overlaySuspendInternal(freeMemory = true, aggressiveImages = true)
      } catch (_: Throwable) {}
    }
  }


  // ================== Camera/RTMP ==================
  private var rtmpCamera2: RtmpCamera2? = null
  private var lastUrl: String? = null
  private var lastW = 1280
  private var lastH = 720
  private var lastFps = 24
  private var lastBitrate = 2_800_000
  private var currentRotation = 0
  private var autoRotateEnabled = false
  private val main = Handler(Looper.getMainLooper())

  /** ✅ Prepared flag: đã prepare audio/video ít nhất 1 lần */
  @Volatile
  private var isPrepared = false

  // ================== Overlay update debounce ==================
  private var pendingOverlayUpdate: ReadableMap? = null
  private var overlayUpdateRunnable: Runnable? = null
  private val overlayUpdateHandler = Handler(Looper.getMainLooper())

  // ================== Recording ==================
  private var isRecording = false
  private var recordingPath: String? = null
  private var recordingStartTime: Long = 0L
  private var chunkDurationMs = 60 * 1000L
  private var chunkIndex = 0
  private val recordingHandler = Handler(Looper.getMainLooper())
  private var chunkRunnable: Runnable? = null

  // ================== Hidden preview ==================
  private var hiddenPreview: OpenGlView? = null

  private val facingEnum by lazy {
    Class.forName("com.pedro.encoder.input.video.CameraHelper\$Facing")
  }
  private val facingBACK by lazy { facingEnum.getField("BACK").get(null) }
  private val facingFRONT by lazy { facingEnum.getField("FRONT").get(null) }
  private var currentFacing: Any? = null

  private enum class ForcedOrientation { AUTO, LANDSCAPE, PORTRAIT }
  private var forcedOrientation: ForcedOrientation = ForcedOrientation.AUTO

  private enum class OverlayMode { NONE, GL_VIEW_FILTER, BITMAP }
  private var overlayMode: OverlayMode = OverlayMode.NONE

  private var overlayHost: FrameLayout? = null
  private var overlayNativeView: ScoreOverlayView? = null
  private var overlayFilter: Any? = null
  private var overlayVisible: Boolean = false

  // BITMAP overlay: render theo nhu cầu (không loop 12fps nữa) để giảm GPU/RAM
  private var overlayShowClock: Boolean = false
  private var overlaySetImageMethod: Method? = null
  private val overlayRenderHandler = Handler(Looper.getMainLooper())
  private var overlayLastRenderAtMs: Long = 0L
  private var overlayRenderScheduled: Boolean = false
  private val overlayRenderMinIntervalMs: Long = 80L // ~12.5fps max khi cần (thực tế thường thấp hơn)

  private var overlayTickerRunning: Boolean = false
  private val overlayTickerHandler = Handler(Looper.getMainLooper())
  private val overlayTickerRunnable = object : Runnable {
    override fun run() {
      runOnMain {
        synchronized(overlayLock) {
          if (!overlayTickerRunning) return@runOnMain
          requestOverlayBitmapRenderLocked("clockTick")
          overlayTickerHandler.postDelayed(this, 1000L)
        }
      }
    }
  }


  private var overlayMeasureW = 0
  private var overlayMeasureH = 0

  private var bmpFrameCallback: Choreographer.FrameCallback? = null
  private var reuseBitmap: Bitmap? = null
  private val choreographer by lazy { Choreographer.getInstance() }
  private var overlayTargetFps: Int = 12
  private var overlayFrameNs: Long = 1_000_000_000L / overlayTargetFps
  private var lastBitmapDrawNs: Long = 0L

  // ================== NETWORK STATS TRACKING ==================
  private var networkStatsStartRx: Long = 0L
  private var networkStatsStartTx: Long = 0L
  private var streamStartTime: Long = 0L
  private var lastNetworkStatsTime: Long = 0L
  private var lastRxBytes: Long = 0L
  private var lastTxBytes: Long = 0L
  private var currentUploadSpeedBps: Long = 0L
  private var currentDownloadSpeedBps: Long = 0L
  private val statsHandler = Handler(Looper.getMainLooper())
  private var statsRunnable: Runnable? = null

  private var statsOverlayView: StreamStatsOverlayView? = null
  private var statsOverlayHost: FrameLayout? = null
  private var statsOverlayEnabled = false

  // ================== ✅ SURFACE SAFETY ==================
  @Volatile private var surfaceReady = false
  @Volatile private var surfaceRecreating = false
  private var surfaceCallbackRegistered = false

  // ================== ✅ SURFACE GATE (NON-BLOCKING) ==================
  private val surfaceGateLock = Any()
  private val surfaceGateQueue = ArrayDeque<() -> Unit>()
  @Volatile private var surfaceGateTimeoutRunnable: Runnable? = null

  private fun runOnMain(block: () -> Unit) {
    if (Looper.myLooper() == Looper.getMainLooper()) block() else main.post(block)
  }

  /**
   * ✅ FIX: Safe stop stream with delay to avoid ViewGroup IndexOutOfBoundsException
   * Delay allows Android's ViewRootImpl.performTraversals() to complete before modifying view hierarchy
   */
  private fun safeStopStream(
    stopPreview: Boolean = false,
    onComplete: (() -> Unit)? = null
  ) {
    rtmpCamera2?.let { cam ->
      if (!cam.isStreaming && !cam.isOnPreview) {
        onComplete?.invoke()
        return
      }
      // Post delay to allow ViewGroup traversal to complete (fixes gatherTransparentRegion crash)
      main.postDelayed({
        try {
          if (cam.isStreaming) {
            cam.stopStream()
            isPrepared = false
          }
          if (stopPreview && cam.isOnPreview) {
            cam.stopPreview()
          }
        } catch (e: Throwable) {
          log("⚠️ safeStopStream error (ignored): $e")
        } finally {
          onComplete?.invoke()
        }
      }, 50) // 50ms delay - enough for UI traversal but not noticeable to user
    } ?: run { onComplete?.invoke() }
  }

  private fun drainSurfaceGate(tag: String) {
    runOnMain {
      if (!isSurfaceValid()) return@runOnMain

      val actions = mutableListOf<() -> Unit>()
      synchronized(surfaceGateLock) {
        while (surfaceGateQueue.isNotEmpty()) actions.add(surfaceGateQueue.removeFirst())

        surfaceGateTimeoutRunnable?.let { main.removeCallbacks(it) }
        surfaceGateTimeoutRunnable = null
      }

      if (actions.isNotEmpty()) log("✅ [$tag] Draining surface gate actions: ${actions.size}")
      actions.forEach {
        try { it() } catch (e: Throwable) { log("❌ [$tag] gated action error: $e") }
      }
    }
  }

  private fun runWhenSurfaceReady(
    tag: String,
    timeoutMs: Long = 3000L,
    onTimeout: (() -> Unit)? = null,
    action: () -> Unit
  ) {
    runOnMain {
      try { ensureCamera() } catch (_: Throwable) {}
      if (isSurfaceValid()) {
        action()
        return@runOnMain
      }

      synchronized(surfaceGateLock) {
        surfaceGateQueue.addLast(action)

        if (surfaceGateTimeoutRunnable == null) {
          surfaceGateTimeoutRunnable = Runnable {
            val dropped = mutableListOf<() -> Unit>()
            synchronized(surfaceGateLock) {
              while (surfaceGateQueue.isNotEmpty()) dropped.add(surfaceGateQueue.removeFirst())
              surfaceGateTimeoutRunnable = null
            }
            log("❌ [$tag] Surface timeout after ${timeoutMs}ms, dropped=${dropped.size}")
            onTimeout?.invoke()
          }
          main.postDelayed(surfaceGateTimeoutRunnable!!, timeoutMs)
        }

        log("⏳ [$tag] Queued action (surface not ready). queue=${surfaceGateQueue.size}")
      }
    }
  }

  private fun isSurfaceRelatedError(t: Throwable): Boolean {
    val msg = (t.message ?: "").lowercase()
    return msg.contains("surface") || msg.contains("invalid") || msg.contains("egl")
  }

  private fun runSurfaceOp(
    tag: String,
    timeoutMs: Long = 3000L,
    maxAttempts: Int = 3,
    attempt: Int = 1,
    onError: (Throwable) -> Unit,
    block: () -> Unit
  ) {
    runWhenSurfaceReady(
      tag = tag,
      timeoutMs = timeoutMs,
      onTimeout = { onError(IllegalStateException("Surface not ready (timeout)")) }
    ) {
      try {
        block()
      } catch (t: Throwable) {
        if (attempt < maxAttempts && isSurfaceRelatedError(t)) {
          log("⚠️ [$tag] surface error attempt $attempt/$maxAttempts: $t")
          main.postDelayed({
            runSurfaceOp(tag, timeoutMs, maxAttempts, attempt + 1, onError, block)
          }, 200L * attempt)
        } else {
          onError(t)
        }
      }
    }
  }

  // ================== Surface Callback ==================
  private val surfaceCallback = object : SurfaceHolder.Callback {
    override fun surfaceCreated(holder: SurfaceHolder) {
      log("🟢 Surface CREATED")
      surfaceReady = true
      surfaceRecreating = false
      drainSurfaceGate("surfaceCreated")
      main.postDelayed({ autoRecoverPreviewIfNeeded() }, 300)
    }

    override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
      log("🔄 Surface CHANGED: ${width}x${height}")
      surfaceReady = true
      surfaceRecreating = false
      drainSurfaceGate("surfaceChanged")
    }

    override fun surfaceDestroyed(holder: SurfaceHolder) {
      log("🔴 Surface DESTROYED")
      surfaceReady = false
      surfaceRecreating = true
      isPrepared = false

      runOnMain {
        try {
          rtmpCamera2?.let { cam ->
            if (cam.isOnPreview && !cam.isStreaming) {
              cam.stopPreview()
              log("⏹️ Preview stopped on surface destroy")
            }
          }
        } catch (e: Throwable) {
          log("⚠️ Stop preview on destroy error: $e")
        }
      }
    }
  }

  /** Check if surface is currently valid */
  private fun isSurfaceValid(): Boolean {
    if (!surfaceReady || surfaceRecreating) {
      log("⚠️ Surface state: ready=$surfaceReady, recreating=$surfaceRecreating")
      return false
    }
    return try {
      val view = PreviewRegistry.openGlView ?: hiddenPreview
      val holder = view?.holder
      val surface = holder?.surface
      val isValid = surface?.isValid == true
      if (!isValid) log("⚠️ Surface.isValid = false")
      isValid
    } catch (e: Throwable) {
      log("❌ isSurfaceValid() error: $e")
      false
    }
  }
  @Volatile private var registeredHolder: SurfaceHolder? = null
  /** Register surface callback if not already registered */
  private fun ensureSurfaceCallback(view: OpenGlView) {
    val holder = view.holder
    if (registeredHolder === holder) return

    try { registeredHolder?.removeCallback(surfaceCallback) } catch (_: Throwable) {}
    try {
      holder.removeCallback(surfaceCallback)
      holder.addCallback(surfaceCallback)
      registeredHolder = holder
      surfaceCallbackRegistered = true

      surfaceReady = holder.surface?.isValid == true
      surfaceRecreating = false
    } catch (e: Throwable) {
      log("❌ Failed to register surface callback: $e")
    }
  }

  override fun getName(): String  = "FacebookLiveModule"

  // ================== SAFE HELPERS ==================
  private fun currentActivityOrNull(): Activity? {
    return try { reactCtx.currentActivity } catch (_: Throwable) { null }
  }

  private fun ensureHiddenPreview(): OpenGlView? {
    if (hiddenPreview != null) return hiddenPreview
    return try {
      val ctx = reactCtx.applicationContext
      val v = OpenGlView(ctx)
      v.holder?.setFixedSize(1, 1)
      hiddenPreview = v
      v
    } catch (e: Throwable) {
      log("❌ cannot create hidden preview: $e")
      null
    }
  }

  private fun getCurrentNetworkType(): String {
    return try {
      val cm = reactCtx.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        ?: return "Unknown"
      val network = cm.activeNetwork ?: return "No Connection"
      val caps = cm.getNetworkCapabilities(network) ?: return "Unknown"
      when {
        caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "WiFi"
        caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "Cellular"
        caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "Ethernet"
        else -> "Unknown"
      }
    } catch (_: Throwable) {
      "Unknown"
    }
  }

  private fun startNetworkStatsTracking() {
    try {
      val uid = android.os.Process.myUid()
      networkStatsStartRx = TrafficStats.getUidRxBytes(uid)
      networkStatsStartTx = TrafficStats.getUidTxBytes(uid)
      streamStartTime = System.currentTimeMillis()
      lastNetworkStatsTime = streamStartTime
      lastRxBytes = networkStatsStartRx
      lastTxBytes = networkStatsStartTx

      log("📊 Network tracking started")
      StreamStatsOverlayRegistry.startTimersFrom(streamStartTime)
      scheduleStatsUpdate()
    } catch (e: Throwable) {
      log("❌ Cannot start network tracking: $e")
    }
  }

  private fun stopNetworkStatsTracking() {
    statsRunnable?.let { statsHandler.removeCallbacks(it) }
    statsRunnable = null

    try {
      val uid = android.os.Process.myUid()
      val currentRx = TrafficStats.getUidRxBytes(uid)
      val currentTx = TrafficStats.getUidTxBytes(uid)

      val totalRx = currentRx - networkStatsStartRx
      val totalTx = currentTx - networkStatsStartTx
      val durationMs = System.currentTimeMillis() - streamStartTime

      log("📊 Network tracking stopped: TX=${formatBytes(totalTx)}, RX=${formatBytes(totalRx)}")

      sendEvent("onNetworkStatsUpdate", Arguments.createMap().apply {
        putDouble("totalUploadMB", totalTx / (1024.0 * 1024.0))
        putDouble("totalDownloadMB", totalRx / (1024.0 * 1024.0))
        putDouble("durationSeconds", durationMs / 1000.0)
        putBoolean("isFinal", true)
      })
    } catch (e: Throwable) {
      log("❌ Error stopping network tracking: $e")
    }

    try { StreamStatsOverlayRegistry.stopTimers() } catch (_: Throwable) {}
    try { StreamStatsOverlayRegistry.clearAll() } catch (_: Throwable) {}

    networkStatsStartRx = 0L
    networkStatsStartTx = 0L
    streamStartTime = 0L
    currentUploadSpeedBps = 0L
    currentDownloadSpeedBps = 0L
  }

  private fun scheduleStatsUpdate() {
    statsRunnable?.let { statsHandler.removeCallbacks(it) }
    statsRunnable = object : Runnable {
      override fun run() {
        updateNetworkStats()
        statsHandler.postDelayed(this, STATS_UPDATE_INTERVAL_MS)
      }
    }
    statsHandler.postDelayed(statsRunnable!!, STATS_UPDATE_INTERVAL_MS)
  }

  private fun updateNetworkStats() {
    try {
      val uid = android.os.Process.myUid()
      val currentRx = TrafficStats.getUidRxBytes(uid)
      val currentTx = TrafficStats.getUidTxBytes(uid)
      val now = System.currentTimeMillis()

      if (lastNetworkStatsTime > 0) {
        val deltaTime = now - lastNetworkStatsTime
        if (deltaTime > 0) {
          val deltaRx = currentRx - lastRxBytes
          val deltaTx = currentTx - lastTxBytes
          currentUploadSpeedBps = (deltaTx * 8 * 1000) / deltaTime
          currentDownloadSpeedBps = (deltaRx * 8 * 1000) / deltaTime
        }
      }

      lastRxBytes = currentRx
      lastTxBytes = currentTx
      lastNetworkStatsTime = now

      val totalRx = currentRx - networkStatsStartRx
      val totalTx = currentTx - networkStatsStartTx
      val durationSec = ((now - streamStartTime) / 1000).toInt()

      sendEvent("onNetworkStatsUpdate", Arguments.createMap().apply {
        putDouble("uploadSpeedMbps", currentUploadSpeedBps / 1_000_000.0)
        putDouble("downloadSpeedMbps", currentDownloadSpeedBps / 1_000_000.0)
        putDouble("totalUploadMB", totalTx / (1024.0 * 1024.0))
        putDouble("totalDownloadMB", totalRx / (1024.0 * 1024.0))
        putInt("durationSeconds", durationSec)
        putBoolean("isFinal", false)
      })

      StreamStatsOverlayRegistry.updateAll(
        uploadBps = currentUploadSpeedBps,
        downloadBps = currentDownloadSpeedBps,
        totalTx = totalTx,
        totalRx = totalRx,
        bitrate = lastBitrate.toLong(),
        fps = lastFps,
        res = "${lastW}x${lastH}",
        netType = getCurrentNetworkType(),
        recording = isRecording
      )
    } catch (e: Throwable) {
      log("❌ Error updating network stats: $e")
    }
  }

  private fun formatBytes(bytes: Long): String {
    return when {
      bytes >= 1_073_741_824 -> String.format("%.2f GB", bytes / 1_073_741_824.0)
      bytes >= 1_048_576 -> String.format("%.2f MB", bytes / 1_048_576.0)
      bytes >= 1_024 -> String.format("%.2f KB", bytes / 1_024.0)
      else -> "$bytes B"
    }
  }

  // ================== Stats overlay ==================
  @ReactMethod
  fun enableStatsOverlay(enabled: Boolean, promise: Promise) {
    runOnMain {
      try {
        if (enabled) {
          if (statsOverlayView == null) {
            val act = currentActivityOrNull()
            if (act == null) {
              promise.reject("NO_ACTIVITY", "Activity not available")
              return@runOnMain
            }

            statsOverlayView = StreamStatsOverlayView(act)
            statsOverlayView?.setPosition(StreamStatsOverlayView.Position.TOP_RIGHT)

            val decor = act.window?.decorView as? ViewGroup
            if (decor == null) {
              promise.reject("NO_DECOR", "DecorView not available")
              return@runOnMain
            }

            statsOverlayHost = FrameLayout(act).apply {
              layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
              )
              isClickable = false
              isFocusable = false
            }

            statsOverlayHost?.addView(
              statsOverlayView,
              FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
              )
            )

            decor.addView(statsOverlayHost)
            log("✅ Stats overlay created and added")
          }

          statsOverlayView?.visibility = View.VISIBLE
          statsOverlayEnabled = true
        } else {
          statsOverlayView?.visibility = View.GONE
          statsOverlayEnabled = false
        }

        promise.resolve(null)
      } catch (e: Throwable) {
        log("❌ Error enabling stats overlay: $e")
        promise.reject("OVERLAY_ERROR", e.message)
      }
    }
  }

  @ReactMethod
  fun setStatsOverlayPosition(position: String, promise: Promise) {
    runOnMain {
      try {
        val pos = when (position.uppercase()) {
          "TOP_LEFT" -> StreamStatsOverlayView.Position.TOP_LEFT
          "TOP_RIGHT" -> StreamStatsOverlayView.Position.TOP_RIGHT
          "BOTTOM_LEFT" -> StreamStatsOverlayView.Position.BOTTOM_LEFT
          "BOTTOM_RIGHT" -> StreamStatsOverlayView.Position.BOTTOM_RIGHT
          else -> StreamStatsOverlayView.Position.TOP_RIGHT
        }

        statsOverlayView?.setPosition(pos)
        promise.resolve(null)
      } catch (e: Throwable) {
        promise.reject("POSITION_ERROR", e.message)
      }
    }
  }

  @ReactMethod
  fun getNetworkStats(promise: Promise) {
    runOnMain {
      try {
        if (streamStartTime == 0L) {
          promise.resolve(Arguments.createMap().apply { putBoolean("streaming", false) })
          return@runOnMain
        }

        val uid = android.os.Process.myUid()
        val currentRx = TrafficStats.getUidRxBytes(uid)
        val currentTx = TrafficStats.getUidTxBytes(uid)

        val totalRx = currentRx - networkStatsStartRx
        val totalTx = currentTx - networkStatsStartTx
        val durationMs = System.currentTimeMillis() - streamStartTime

        promise.resolve(Arguments.createMap().apply {
          putBoolean("streaming", true)
          putDouble("uploadSpeedMbps", currentUploadSpeedBps / 1_000_000.0)
          putDouble("downloadSpeedMbps", currentDownloadSpeedBps / 1_000_000.0)
          putDouble("totalUploadMB", totalTx / (1024.0 * 1024.0))
          putDouble("totalDownloadMB", totalRx / (1024.0 * 1024.0))
          putDouble("durationSeconds", durationMs / 1000.0)
          putString("networkType", getCurrentNetworkType())
        })
      } catch (e: Throwable) {
        promise.reject("GET_STATS_ERROR", e.message)
      }
    }
  }

  // ✅ Debug surface state
  @ReactMethod
  fun getSurfaceState(promise: Promise) {
    runOnMain {
      try {
        val result = Arguments.createMap().apply {
          putBoolean("surfaceReady", surfaceReady)
          putBoolean("surfaceRecreating", surfaceRecreating)
          putBoolean("surfaceValid", isSurfaceValid())
          putBoolean("callbackRegistered", surfaceCallbackRegistered)
          putBoolean("hasOpenGlView", PreviewRegistry.openGlView != null)
          putBoolean("isStreaming", rtmpCamera2?.isStreaming == true)
          putBoolean("isOnPreview", rtmpCamera2?.isOnPreview == true)
          putBoolean("isPrepared", isPrepared)
        }
        promise.resolve(result)
      } catch (e: Throwable) {
        promise.reject("SURFACE_STATE_ERROR", e.message)
      }
    }
  }

  // ================== Camera setup ==================
  private fun ensureCamera(): RtmpCamera2? {
    val view = PreviewRegistry.openGlView ?: ensureHiddenPreview()
    if (view == null) {
      log("❌ OpenGlView null → cannot init camera")
      return null
    }

    ensureSurfaceCallback(view)

    val okFill = trySetPreviewFill(view)
    if (!okFill) applyCenterCropFallback(view)

    if (rtmpCamera2 == null) {
      try {
        rtmpCamera2 = RtmpCamera2(view, this)
        log("✅ RtmpCamera2 created")
      } catch (e: Throwable) {
        log("❌ Cannot create RtmpCamera2: $e")
        return null
      }
    }
    return rtmpCamera2
  }

  private fun isOnCellular(): Boolean {
    return try {
      val cm = reactCtx.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        ?: return false
      val network = cm.activeNetwork ?: return false
      val caps = cm.getNetworkCapabilities(network) ?: return false
      caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)
    } catch (_: Throwable) {
      false
    }
  }

  private fun trySetPreviewFill(view: OpenGlView): Boolean {
    return try {
      val pkg = view.javaClass.`package`?.name ?: "com.pedro.library.view"
      val enumCls = Class.forName("$pkg.AspectRatioMode")
      val fill = enumCls.enumConstants?.firstOrNull { it.toString().equals("FILL", true) }
      val m = view.javaClass.getMethod("setAspectRatioMode", enumCls)
      if (fill != null) { m.invoke(view, fill); true } else false
    } catch (_: Throwable) { false }
  }

  private fun applyCenterCropFallback(view: View) {
    val recalc = {
      val vw = view.width
      val vh = view.height
      if (vw > 0 && vh > 0 && lastW > 0 && lastH > 0) {
        val viewAR = vw.toFloat() / vh
        val encAR = lastW.toFloat() / lastH
        val (sx, sy) = if (viewAR > encAR) {
          viewAR / encAR to 1f
        } else {
          1f to (encAR / viewAR)
        }
        view.pivotX = vw / 2f
        view.pivotY = vh / 2f
        view.scaleX = sx
        view.scaleY = sy
      }
    }
    view.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ -> recalc() }
    main.post { recalc() }
  }

  // ================== Preview sizing / prepare ==================
  private fun rotationToDeg(rot: Int) = when (rot) {
    Surface.ROTATION_0 -> 0
    Surface.ROTATION_90 -> 90
    Surface.ROTATION_180 -> 180
    Surface.ROTATION_270 -> 270
    else -> 0
  }

  private fun getDisplayRotationDegrees(): Int {
    PreviewRegistry.openGlView?.display?.rotation?.let { return rotationToDeg(it) }
    val wm = reactCtx.getSystemService(Context.WINDOW_SERVICE) as? WindowManager
    @Suppress("DEPRECATION")
    wm?.defaultDisplay?.rotation?.let { return rotationToDeg(it) }
    return 0
  }

  private data class WH(val w: Int, val h: Int) {
    fun ar() = w.toDouble() / h.toDouble()
  }

  private fun getSupportedSizes(cam: RtmpCamera2, facing: Any?): List<WH> {
    try {
      val list: List<*> = if (facing === facingFRONT)
        (cam.javaClass.getMethod("getResolutionsFront").invoke(cam) as List<*>)
      else
        (cam.javaClass.getMethod("getResolutionsBack").invoke(cam) as List<*>)

      val sizes = mutableListOf<WH>()
      for (s in list) {
        try {
          val sz = s as Size
          sizes.add(WH(sz.width, sz.height))
        } catch (_: Throwable) {
          try {
            val w = s!!::class.java.getMethod("getWidth").invoke(s) as Int
            val h = s::class.java.getMethod("getHeight").invoke(s) as Int
            sizes.add(WH(w, h))
          } catch (_: Throwable) {}
        }
      }
      if (sizes.isNotEmpty()) return sizes
    } catch (_: Throwable) {}

    return listOf(
      WH(1920, 1080),
      WH(1280, 720),
      WH(960, 540),
      WH(854, 480),
      WH(640, 360)
    )
  }

  private fun pickBestSize(cam: RtmpCamera2, wantPortrait: Boolean): WH {
    val targetAR = if (wantPortrait) 9.0 / 16.0 else 16.0 / 9.0
    log("📱 Want ${if (wantPortrait) "Portrait 9:16" else "Landscape 16:9"}, targetAR=$targetAR")

    val sizes = getSupportedSizes(cam, currentFacing ?: facingBACK)
      .distinctBy { it.w to it.h }
      .filter { it.w * it.h <= 1920 * 1080 }

    val candidates = sizes.filter { size -> abs(size.ar() - targetAR) < 0.1 }
    if (candidates.isNotEmpty()) {
      val best = candidates.maxByOrNull { it.w * it.h }!!
      log("✅ Picked: ${best.w}x${best.h} (ar=${best.ar()}, match)")
      return best
    }

    val fallback = sizes.sortedWith(compareBy({ abs(it.ar() - targetAR) }, { -it.w * it.h })).firstOrNull()
    if (fallback != null) {
      log("⚠️ Fallback: ${fallback.w}x${fallback.h} (ar=${fallback.ar()})")
      return fallback
    }

    val def = if (wantPortrait) WH(720, 1280) else WH(1280, 720)
    log("🔴 Using default: ${def.w}x${def.h}")
    return def
  }

  private fun prepareVideoCompat(cam: RtmpCamera2, w: Int, h: Int, fps: Int, bitrate: Int, rot: Int): Boolean {
    try {
      val m = cam.javaClass.getMethod(
        "prepareVideo",
        Int::class.javaPrimitiveType, Int::class.javaPrimitiveType,
        Int::class.javaPrimitiveType, Int::class.javaPrimitiveType,
        Int::class.javaPrimitiveType
      )
      val ok = (m.invoke(cam, w, h, fps, bitrate, rot) as? Boolean) == true
      if (ok) return true
    } catch (_: Throwable) {}

    return try {
      val m2 = cam.javaClass.getMethod(
        "prepareVideo",
        Int::class.javaPrimitiveType, Int::class.javaPrimitiveType,
        Int::class.javaPrimitiveType, Int::class.javaPrimitiveType
      )
      val ok = (m2.invoke(cam, w, h, fps, bitrate) as? Boolean) == true
      try { cam.javaClass.getMethod("setVideoRotation", Int::class.javaPrimitiveType).invoke(cam, rot) } catch (_: Throwable) {}
      ok
    } catch (_: Throwable) { false }
  }

  private fun startPreviewWithSize(cam: RtmpCamera2, w: Int, h: Int) {
    try {
      if (currentFacing == null) currentFacing = facingBACK
      val m = cam.javaClass.getMethod(
        "startPreview",
        facingEnum,
        Int::class.javaPrimitiveType,
        Int::class.javaPrimitiveType
      )
      m.invoke(cam, currentFacing, w, h)
      return
    } catch (_: Throwable) {}

    try {
      val m2 = cam.javaClass.getMethod(
        "startPreview",
        Int::class.javaPrimitiveType,
        Int::class.javaPrimitiveType
      )
      m2.invoke(cam, w, h)
      return
    } catch (_: Throwable) {}

    cam.startPreview()
  }

  private fun chooseAndPrepare(cam: RtmpCamera2, fps: Int, bitrate: Int, wantPortrait: Boolean, rotWanted: Int): Boolean {
    val best = pickBestSize(cam, wantPortrait)
    lastW = best.w
    lastH = best.h

    log("🎥 Preparing: ${best.w}x${best.h} @ ${fps}fps, rotation=$rotWanted, bitrate=$bitrate")
    val ok = prepareVideoCompat(cam, best.w, best.h, fps, bitrate, rotWanted)
    if (ok) {
      startPreviewWithSize(cam, best.w, best.h)
      PreviewRegistry.openGlView?.let { v ->
        val filled = trySetPreviewFill(v)
        if (!filled) {
          log("⚠️ AspectRatioMode.FILL not available, using center-crop fallback")
          applyCenterCropFallback(v)
        }
      }
    }
    return ok
  }

  // ================== Orientation listener ==================
  private val orientationListener = object : OrientationEventListener(reactCtx) {
    override fun onOrientationChanged(o: Int) {
      if (!autoRotateEnabled) return
      if (forcedOrientation != ForcedOrientation.AUTO) return
      val rot = getDisplayRotationDegrees()
      if (rot != currentRotation) {
        currentRotation = rot
        reprepareWithRotation(rot)
      }
    }
  }

  private fun reprepareWithRotation(rot: Int) {
    runOnMain {
      val cam = rtmpCamera2 ?: return@runOnMain
      val url = lastUrl
      val wasStreaming = cam.isStreaming

      val wantPortrait = when (forcedOrientation) {
        ForcedOrientation.PORTRAIT -> true
        ForcedOrientation.LANDSCAPE -> false
        ForcedOrientation.AUTO -> (rot == 0 || rot == 180)
      }
      val rotWanted = if (wantPortrait) 90 else 0

      runSurfaceOp(
        tag = "reprepareWithRotation",
        timeoutMs = 5000,
        maxAttempts = 3,
        onError = { e -> log("❌ reprepareWithRotation failed: $e") }
      ) {
        try { if (wasStreaming) cam.stopStream() } catch (e: Throwable) { log("⚠️ stopStream error: $e") }
        try { if (cam.isOnPreview) cam.stopPreview() } catch (e: Throwable) { log("⚠️ stopPreview error: $e") }

        val audioOk = try { cam.prepareAudio() } catch (_: Throwable) { false }
        if (!audioOk) throw IllegalStateException("prepareAudio failed")

        val videoOk = chooseAndPrepare(cam, lastFps, lastBitrate, wantPortrait, rotWanted)
        if (!videoOk) throw IllegalStateException("prepareVideo failed")

        isPrepared = true

        if (url != null && wasStreaming) {
          cam.startStream(url)
        }

        // Overlay refresh sizing (nếu đang có)
        val fw = lastW
        val fh = lastH
        overlayMeasureW = 0
        overlayMeasureH = 0
        overlayNativeView?.let { nv ->
          (nv.layoutParams as? FrameLayout.LayoutParams)?.let { lp ->
            lp.width = fw
            lp.height = fh
            nv.layoutParams = lp
          }
          try { forceMeasureLayout(nv, fw, fh) } catch (_: Throwable) {}
        }

        overlayFilter?.let { setFilterFullScreen(it) }
        glSetAlpha(overlayFilter, if (overlayVisible) 1f else 0f)

        PreviewRegistry.openGlView?.let { v ->
          if (!trySetPreviewFill(v)) applyCenterCropFallback(v)
        }

        log("✅ reprepareWithRotation completed")
      }
    }
  }

  // ================== Auto recover ==================
  @Volatile private var isRecovering = false

  private fun autoRecoverPreviewIfNeeded() {
    if (isRecovering) return
    val cam = rtmpCamera2 ?: return

    if (cam.isStreaming && !cam.isOnPreview) {
      isRecovering = true
      runSurfaceOp(
        tag = "autoRecoverPreview",
        timeoutMs = 3000,
        maxAttempts = 3,
        onError = { e ->
          isRecovering = false
          log("❌ Auto-recover failed: $e")
        }
      ) {
        startPreviewWithSize(cam, lastW, lastH)
        isRecovering = false
        log("✅ Preview auto-recovered")
      }
    }
  }

  // ================== React Methods (Camera/Stream) ==================
  @ReactMethod
  fun startPreview(promise: Promise) {
    runOnMain {
      val pOnce = PromiseOnce(promise)
      runSurfaceOp(
        tag = "startPreview",
        timeoutMs = 5000,
        maxAttempts = 3,
        onError = { e -> pOnce.reject("PREVIEW_START_ERR", e.message ?: e.toString()) }
      ) {
        val cam = ensureCamera()
        if (cam == null) {
          pOnce.reject("PREVIEW_START_ERR", "Camera not ready")
          return@runSurfaceOp
        }

        if (cam.isOnPreview) {
          pOnce.resolve(null)
          return@runSurfaceOp
        }

        if (currentFacing == null) currentFacing = facingBACK

        val rot = getDisplayRotationDegrees()
        val wantPortrait = when (forcedOrientation) {
          ForcedOrientation.PORTRAIT -> true
          ForcedOrientation.LANDSCAPE -> false
          ForcedOrientation.AUTO -> (rot == 0 || rot == 180)
        }
        val best = pickBestSize(cam, wantPortrait)
        startPreviewWithSize(cam, best.w, best.h)

        pOnce.resolve(null)
      }
    }
  }

  @ReactMethod
  fun stopPreview(promise: Promise) {
    runOnMain {
      try {
        rtmpCamera2?.let { if (it.isOnPreview) it.stopPreview() }
        isPrepared = false
        promise.resolve(null)
      } catch (t: Throwable) {
        promise.reject("PREVIEW_STOP_ERR", t)
      }
    }
  }

  @ReactMethod
  fun lockOrientation(mode: String) {
    runOnMain {
      forcedOrientation = when (mode.uppercase()) {
        "LANDSCAPE" -> ForcedOrientation.LANDSCAPE
        "PORTRAIT" -> ForcedOrientation.PORTRAIT
        else -> ForcedOrientation.AUTO
      }
      log("🔒 lockOrientation = $forcedOrientation")
    }
  }

  /**
   * ✅ HOT SWITCH:
   * - Nếu đang streaming: stopStream -> startStream(newUrl) (GIỮ preview/camera)
   * - Nếu chưa streaming: prepare (1 lần) rồi startStream
   */
  @ReactMethod
  fun start(streamUrl: String, bitrate: Int, width: Int, height: Int, fps: Int, promise: Promise) {
    runOnMain {
      val pOnce = PromiseOnce(promise)
      runSurfaceOp(
        tag = "startStream",
        timeoutMs = 5000,
        maxAttempts = 3,
        onError = { e -> pOnce.reject("START_ERROR", e.message ?: e.toString()) }
      ) {
        log("=== STREAM START / HOT SWITCH ===")

        val cam = ensureCamera()
        if (cam == null) {
          pOnce.reject("START_ERROR", "Camera not ready")
          return@runSurfaceOp
        }

        // ✅ Hot switch URL khi đang stream
        if (cam.isStreaming) {
          if (lastUrl == streamUrl) {
            pOnce.resolve(null)
            return@runSurfaceOp
          }

          try { stopNetworkStatsTracking() } catch (_: Throwable) {}
          try { cam.stopStream() } catch (e: Throwable) { log("⚠️ stopStream (hot switch) error: $e") }

          // ✅ FIX: stopStream có thể làm encoder mất prepared
          isPrepared = false

          lastUrl = streamUrl

          try {
            cam.startStream(streamUrl)
          } catch (t: Throwable) {
            if (isNotPreparedError(t)) {
              log("⚠️ startStream failed (not prepared) -> re-prepare & retry (hot switch)")

              val rotWanted = currentRotation // 0 hoặc 90 (đã lưu)
              val wantPortrait = rotWanted == 90

              val audioOk = try { cam.prepareAudio() } catch (_: Throwable) { false }
              if (!audioOk) {
                pOnce.reject("PREPARE_FAILED", "prepareAudio failed (retry)")
                return@runSurfaceOp
              }

              val videoOk = chooseAndPrepare(cam, lastFps, lastBitrate, wantPortrait, rotWanted)
              if (!videoOk) {
                pOnce.reject("PREPARE_FAILED", "prepareVideo failed (retry)")
                return@runSurfaceOp
              }

              isPrepared = true
              cam.startStream(streamUrl)
            } else {
              throw t
            }
          }

          startNetworkStatsTracking()
          statsOverlayView?.startTimer()
          pOnce.resolve(null)
          return@runSurfaceOp
        }

        // set profile
        lastUrl = streamUrl
        val onCell = isOnCellular()
        if (onCell) {
          lastFps = 20
          lastBitrate = 550_000
          overlaySetFpsInternal(6) // ✅ thật sự 6fps
          log("📶 CELLULAR mode: ${lastFps}fps, ${lastBitrate}bps")
        } else {
          lastFps = fps.takeIf { it >= 15 } ?: 20
          lastBitrate = (bitrate * 0.8).toInt()
          log("📶 WIFI mode: ${lastFps}fps, ${lastBitrate}bps")
        }

        if (currentFacing == null) currentFacing = facingBACK

        val wantPortrait = when (forcedOrientation) {
          ForcedOrientation.PORTRAIT -> true
          ForcedOrientation.LANDSCAPE -> false
          ForcedOrientation.AUTO -> height > width
        }
        val rotWanted = if (wantPortrait) 90 else 0
        currentRotation = rotWanted

        // ✅ Prepare only when needed
        if (!isPrepared) {
          val audioOk = try { cam.prepareAudio() } catch (_: Throwable) { false }
          if (!audioOk) {
            pOnce.reject("PREPARE_FAILED", "prepareAudio failed")
            return@runSurfaceOp
          }

          val videoOk = chooseAndPrepare(cam, lastFps, lastBitrate, wantPortrait, rotWanted)
          if (!videoOk) {
            pOnce.reject("PREPARE_FAILED", "prepareVideo failed")
            return@runSurfaceOp
          }

          isPrepared = true
        } else {
          // Ensure preview exists
          if (!cam.isOnPreview) {
            startPreviewWithSize(cam, lastW, lastH)
          }
        }

        try {
          cam.startStream(streamUrl)
        } catch (t: Throwable) {
          if (isNotPreparedError(t)) {
            log("⚠️ startStream failed (not prepared) -> re-prepare & retry")

            isPrepared = false

            val audioOk = try { cam.prepareAudio() } catch (_: Throwable) { false }
            if (!audioOk) {
              pOnce.reject("PREPARE_FAILED", "prepareAudio failed (retry)")
              return@runSurfaceOp
            }

            val videoOk = chooseAndPrepare(cam, lastFps, lastBitrate, wantPortrait, rotWanted)
            if (!videoOk) {
              pOnce.reject("PREPARE_FAILED", "prepareVideo failed (retry)")
              return@runSurfaceOp
            }

            isPrepared = true
            cam.startStream(streamUrl)
          } else {
            throw t
          }
        }
        startNetworkStatsTracking()
        statsOverlayView?.startTimer()

        log("=== STREAM STARTED SUCCESSFULLY ===")
        pOnce.resolve(null)
      }
    }
  }

  /**
   * ✅ Stop theo kiểu “kết thúc trận”:
   * - chỉ stopStream
   * - giữ preview/camera sống (để trận sau start lại nhanh và tránh SIGABRT stop-start)
   */
  @ReactMethod
  fun stop(promise: Promise) {
    runOnMain {
      try {
        stopNetworkStatsTracking()

        if (isRecording) {
          chunkRunnable?.let { recordingHandler.removeCallbacks(it) }
          try { rtmpCamera2?.stopRecord() } catch (_: Throwable) {}
          isRecording = false
        }

        // ✅ KHÔNG destroy overlay ở đây (để chuyển live/hot switch không phải init lại logo/sponsor)
        synchronized(overlayLock) {
          overlayVisible = false
          updateOverlayTickerLocked()
        }
        try { overlayFilter?.let { glSetAlpha(it, 0f) } } catch (_: Throwable) {}

        // ✅ FIX: Use delayed stop to avoid ViewGroup IndexOutOfBoundsException
        safeStopStream(stopPreview = false)

        promise.resolve(null)
      } catch (t: Throwable) {
        log("❌ stop error: $t")
        promise.reject("STOP_ERROR", t.message ?: t.toString())
      }
    }
  }


  private fun isNotPreparedError(t: Throwable): Boolean {
    val msg = (t.message ?: "").lowercase()
    return msg.contains("not prepared") || msg.contains("videoencoder not prepared")
  }

  /** ✅ Release là full cleanup thật sự */
  @ReactMethod
  fun release(promise: Promise) {
    runOnMain {
      try {
        stopNetworkStatsTracking()

        statsOverlayView?.cleanup()
        statsOverlayHost?.let { (it.parent as? ViewGroup)?.removeView(it) }
        statsOverlayView = null
        statsOverlayHost = null
        statsOverlayEnabled = false

        overlayRemoveInternal()

        // Unregister surface callback
        try {
          PreviewRegistry.openGlView?.holder?.removeCallback(surfaceCallback)
          surfaceCallbackRegistered = false
        } catch (_: Throwable) {}

        // ✅ FIX: Use delayed stop to avoid ViewGroup IndexOutOfBoundsException
        safeStopStream(stopPreview = true)

        try {
          chunkRunnable?.let { recordingHandler.removeCallbacks(it) }
          chunkRunnable = null
          if (isRecording) {
            try { rtmpCamera2?.stopRecord() } catch (_: Throwable) {}
            isRecording = false
          }
        } catch (_: Throwable) {}

        rtmpCamera2 = null
        hiddenPreview = null

        surfaceReady = false
        surfaceRecreating = false
        isPrepared = false

        log("✅ Released")
        promise.resolve(null)
      } catch (t: Throwable) {
        log("❌ release error: $t")
        promise.reject("RELEASE_ERROR", t.message ?: t.toString())
      }
    }
  }

  @ReactMethod
  fun switchCamera(promise: Promise) {
    runOnMain {
      val pOnce = PromiseOnce(promise)
      runSurfaceOp(
        tag = "switchCamera",
        timeoutMs = 4000,
        maxAttempts = 3,
        onError = { e -> pOnce.reject("SWITCH_ERROR", e.message ?: e.toString()) }
      ) {
        val cam = ensureCamera()
        if (cam == null) {
          pOnce.reject("SWITCH_ERROR", "Camera not ready")
          return@runSurfaceOp
        }

        cam.switchCamera()
        currentFacing = if (currentFacing === facingBACK) facingFRONT else facingBACK

        // reprepare nếu cần (để rotation/size ổn)
        val rot = getDisplayRotationDegrees()
        reprepareWithRotation(rot)

        pOnce.resolve(null)
      }
    }
  }

  @ReactMethod
  fun toggleTorch(on: Boolean, promise: Promise) {
    runOnMain {
      try {
        val cam = ensureCamera()
        if (cam == null) {
          promise.reject("TORCH_ERROR", "camera not ready")
          return@runOnMain
        }
        if (on) cam.enableLantern() else cam.disableLantern()
        promise.resolve(null)
      } catch (t: Throwable) {
        promise.reject("TORCH_ERROR", t)
      }
    }
  }

  @ReactMethod
  fun toggleMic(on: Boolean, promise: Promise) {
    runOnMain {
      try {
        val cam = ensureCamera()
        if (cam == null) {
          promise.reject("MIC_ERROR", "camera not ready")
          return@runOnMain
        }
        if (on) cam.enableAudio() else cam.disableAudio()
        promise.resolve(null)
      } catch (t: Throwable) {
        promise.reject("MIC_ERROR", t)
      }
    }
  }

  @ReactMethod
  fun setVideoBitrateOnFly(bitrate: Int) {
    runOnMain {
      try { rtmpCamera2?.setVideoBitrateOnFly(bitrate) } catch (_: Throwable) {}
    }
  }

  @ReactMethod
  fun setZoom(level: Double) {
    runOnMain {
      try {
        val cam = ensureCamera() ?: return@runOnMain
        try {
          cam.javaClass.getMethod("setZoom", Float::class.javaPrimitiveType)
            .invoke(cam, level.toFloat())
        } catch (_: Throwable) {
          val mgr = cam.javaClass.getMethod("getCamera2ApiManager").invoke(cam)
          try {
            mgr.javaClass.getMethod("setZoom", Float::class.javaPrimitiveType)
              .invoke(mgr, level.toFloat())
          } catch (_: Throwable) {
            mgr.javaClass.getMethod("setZoom", Int::class.javaPrimitiveType)
              .invoke(mgr, (level * 10f).toInt())
          }
        }
      } catch (_: Throwable) {}
    }
  }

  @ReactMethod
  fun enableAutoRotate(on: Boolean) {
    runOnMain {
      autoRotateEnabled = on
      if (on) orientationListener.enable() else orientationListener.disable()
    }
  }

  // ================== Overlay GL helpers ==================
  private fun newInstance(vararg classNames: String): Any? {
    for (n in classNames) {
      try { return Class.forName(n).getConstructor().newInstance() } catch (_: Throwable) {}
    }
    return null
  }

  private fun createAndroidViewFilter(): Any? = newInstance(
    "com.pedro.encoder.input.gl.render.filters.AndroidViewFilterRender",
    "com.pedro.encoder.input.gl.render.filters.object.AndroidViewFilterRender",
    "com.pedro.encoder.input.gl.render.filters.android.AndroidViewFilterRender"
  )

  private fun createImageObjectFilter(): Any? = newInstance(
    "com.pedro.encoder.input.gl.render.filters.`object`.ImageObjectFilterRender",
    "com.pedro.encoder.input.gl.render.filters.object.ImageObjectFilterRender"
  )

  private val baseFilterCls by lazy {
    Class.forName("com.pedro.encoder.input.gl.render.filters.BaseFilterRender")
  }

  private fun glAddFilter(filter: Any) {
    val cam = rtmpCamera2 ?: return
    val gl = cam.glInterface ?: return
    try { gl.javaClass.getMethod("addFilter", baseFilterCls).invoke(gl, filter) }
    catch (_: Throwable) {
      try { gl.javaClass.getMethod("setFilter", baseFilterCls).invoke(gl, filter) } catch (_: Throwable) {}
    }
  }

  private fun glRemoveFilter(filter: Any?) {
    val gl = rtmpCamera2?.glInterface ?: return
    if (filter == null) return
    try { gl.javaClass.getMethod("removeFilter", baseFilterCls).invoke(gl, filter) }
    catch (_: Throwable) {
      try { filter.javaClass.getMethod("setAlpha", Float::class.javaPrimitiveType).invoke(filter, 0f) } catch (_: Throwable) {}
    }
  }

  private fun glSetAlpha(filter: Any?, a: Float) {
    if (filter == null) return
    try { filter.javaClass.getMethod("setAlpha", Float::class.javaPrimitiveType).invoke(filter, a) }
    catch (_: Throwable) {}
  }

  private fun forceMeasureLayout(v: View, w: Int, h: Int) {
    if (overlayMeasureW == w && overlayMeasureH == h) return
    val wSpec = View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY)
    val hSpec = View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY)
    v.measure(wSpec, hSpec)
    v.layout(0, 0, w, h)
    overlayMeasureW = w
    overlayMeasureH = h
  }

  private fun ensureOffscreenHost(wPx: Int, hPx: Int): FrameLayout? {
    return synchronized(overlayLock) {
      val act = currentActivityOrNull()
      if (act == null) {
        log("⚠️ No activity -> không tạo overlayHost")
        return@synchronized null
      }
      val decor = act.window?.decorView as? ViewGroup
      if (decor == null) {
        log("⚠️ No decorView")
        return@synchronized null
      }

      val host = overlayHost ?: FrameLayout(act).also { overlayHost = it }

      host.setBackgroundColor(Color.TRANSPARENT)
      host.alpha = 1f
      host.isClickable = false
      host.isFocusable = false
      host.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
      host.setWillNotDraw(false)
      host.setLayerType(View.LAYER_TYPE_HARDWARE, null)

      val lp = (host.layoutParams as? FrameLayout.LayoutParams)
        ?: FrameLayout.LayoutParams(2, 2)
      lp.width = 2
      lp.height = 2
      lp.gravity = android.view.Gravity.TOP or android.view.Gravity.START
      host.layoutParams = lp

      if (host.parent !== decor) {
        try {
          (host.parent as? ViewGroup)?.removeView(host)
          decor.addView(host, lp)
          log("✅ overlayHost added to decor")
        } catch (e: Throwable) {
          log("❌ Failed to add overlayHost: $e")
          return@synchronized null
        }
      }

      host.x = 0f
      host.y = 0f
      host
    }
  }

  private fun setFilterFullScreen(filter: Any) {
    try {
      val posEnum =
        try { Class.forName("com.pedro.encoder.input.gl.render.filters.object.position.TranslateTo") }
        catch (_: Throwable) { Class.forName("com.pedro.encoder.input.gl.render.filters.object.TranslateTo") }

      try { filter.javaClass.getMethod("setPosition", posEnum).invoke(filter, posEnum.getField("CENTER").get(null)) } catch (_: Throwable) {}
      try { filter.javaClass.getMethod("setScale", Float::class.javaPrimitiveType, Float::class.javaPrimitiveType).invoke(filter, 100f, 100f) } catch (_: Throwable) {}
      try { filter.javaClass.getMethod("setPosition", Float::class.javaPrimitiveType, Float::class.javaPrimitiveType).invoke(filter, 0f, 0f) } catch (_: Throwable) {}
    } catch (_: Throwable) {}
  }

  private fun buildNativeOverlay(wPx: Int, hPx: Int): ScoreOverlayView? {
    val act = currentActivityOrNull() ?: return null
    return ScoreOverlayView(act).apply {
      layoutParams = FrameLayout.LayoutParams(wPx, hPx)
      setBackgroundColor(Color.TRANSPARENT)
      alpha = 1f
      visibility = View.VISIBLE
      setWillNotDraw(false)
      setLayerType(View.LAYER_TYPE_SOFTWARE, null)
    }
  }

  private fun startBitmapLoop(wPx: Int, hPx: Int) {
    synchronized(overlayLock) {
      stopBitmapLoop()

      val filter = overlayFilter
      val nv = overlayNativeView
      if (filter == null || nv == null) {
        log("⚠️ Cannot start bitmap loop - filter or view null")
        return
      }

      val bmMethod = try { filter.javaClass.getMethod("setImage", Bitmap::class.java) }
      catch (_: Throwable) { log("❌ No setImage method"); null } ?: return

      if (reuseBitmap == null || reuseBitmap?.width != wPx || reuseBitmap?.height != hPx) {
        try { reuseBitmap?.recycle() } catch (_: Throwable) {}
        reuseBitmap = Bitmap.createBitmap(wPx, hPx, Bitmap.Config.ARGB_8888)
      }

      lastBitmapDrawNs = 0L

      try { forceMeasureLayout(nv, wPx, hPx) } catch (_: Throwable) {}

      bmpFrameCallback = Choreographer.FrameCallback {
        synchronized(overlayLock) {
          val now = System.nanoTime()
          if (now - lastBitmapDrawNs >= overlayFrameNs) {
            try {
              val currentNv = overlayNativeView
              val currentBitmap = reuseBitmap
              val currentFilter = overlayFilter

              if (currentNv == null || currentBitmap == null || currentFilter == null || !currentNv.isAttachedToWindow) {
                lastBitmapDrawNs = now
              } else {
                try { currentNv.invalidate() } catch (_: Throwable) {}

                val canvas = Canvas(currentBitmap)
                canvas.drawColor(Color.TRANSPARENT, PorterDuff.Mode.CLEAR)
                currentNv.draw(canvas)

                bmMethod.invoke(currentFilter, currentBitmap)
                glSetAlpha(currentFilter, if (overlayVisible) 1f else 0f)
                lastBitmapDrawNs = now
              }
            } catch (e: Throwable) {
              log("❌ Bitmap draw error: $e")
            }
          }

          if (bmpFrameCallback != null) {
            choreographer.postFrameCallback(bmpFrameCallback!!)
          }
        }
      }

      choreographer.postFrameCallback(bmpFrameCallback!!)
      log("🎨 Bitmap loop started @ ${overlayTargetFps}fps")
    }
  }

  private fun stopBitmapLoop() {
    synchronized(overlayLock) {
      try {
        bmpFrameCallback?.let { choreographer.removeFrameCallback(it) }
      } catch (e: Throwable) {
        log("❌ removeFrameCallback error: $e")
      }
      bmpFrameCallback = null

      try { reuseBitmap?.recycle() } catch (_: Throwable) {}
      reuseBitmap = null
    }
  }

  // ================== Overlay React APIs ==================
  @ReactMethod
  fun overlayLoad(
    url: String,
    widthDp: Int,
    heightDp: Int,
    corner: String,
    scaleW: Int,
    scaleH: Int,
    marginXDp: Int,
    marginYDp: Int,
    promise: Promise
  ) {
    runOnMain {
      val pOnce = PromiseOnce(promise)
      try {
        runSurfaceOp(pOnce, allowCreateCamera = true) {
          synchronized(overlayLock) {
            val wPx = lastW
            val hPx = lastH

            if (wPx <= 0 || hPx <= 0) {
              pOnce.reject("OVERLAY_SIZE_INVALID", "Invalid size $wPx x $hPx")
              return@runSurfaceOp
            }

            val host = ensureOffscreenHost(wPx, hPx)
            if (host == null) {
              pOnce.reject("OVERLAY_HOST_ERROR", "No activity/decorView")
              return@runSurfaceOp
            }

            // ✅ Reuse overlayNativeView (logo/sponsor được cache trong view)
            val nativeView = overlayNativeView ?: buildNativeOverlay(wPx, hPx).also { overlayNativeView = it }

            if (nativeView.parent != host) {
              try { (nativeView.parent as? ViewGroup)?.removeView(nativeView) } catch (_: Throwable) {}
              try { host.removeAllViews() } catch (_: Throwable) {}
              host.addView(nativeView)
            }

            // ensure size
            nativeView.layoutParams = FrameLayout.LayoutParams(wPx, hPx)
            forceMeasureLayout(nativeView, wPx, hPx)

            nativeView.configureLayout(corner, scaleW, marginXDp, marginYDp)
            nativeView.applyScaleY(scaleH)
            nativeView.updateRotation(currentRotation)

            // ✅ Filter: remove cũ, add mới (nhưng không đụng vào nativeView/images)
            try { overlayFilter?.let { glRemoveFilter(it) } } catch (_: Throwable) {}
            overlayFilter = null
            overlayMode = OverlayMode.NONE
            overlaySetImageMethod = null

            // Try AndroidViewFilter (ưu tiên, nhẹ hơn bitmap)
            val viewFilter = try { createAndroidViewFilter(nativeView) } catch (_: Throwable) { null }

            if (viewFilter != null) {
              try { nativeView.setLayerType(View.LAYER_TYPE_HARDWARE, null) } catch (_: Throwable) {}
              try { glSetFilterSize(viewFilter, wPx, hPx) } catch (_: Throwable) {}
              try { glAddFilter(viewFilter) } catch (_: Throwable) {}

              overlayFilter = viewFilter
              overlayMode = OverlayMode.GL_VIEW_FILTER
              overlayVisible = true
              try { glSetAlpha(viewFilter, 1f) } catch (_: Throwable) {}
              // no bitmap loop/ticker needed
              overlayShowClock = false
              updateOverlayTickerLocked()

              pOnce.resolve(true)
              return@runSurfaceOp
            }

            // Fallback BITMAP filter (render theo nhu cầu)
            val bmpFilter = try { createImageObjectFilter() } catch (t: Throwable) {
              pOnce.reject("OVERLAY_FILTER_ERROR", t.message ?: t.toString())
              return@runSurfaceOp
            }

            try { nativeView.setLayerType(View.LAYER_TYPE_SOFTWARE, null) } catch (_: Throwable) {}
            try { glSetFilterSize(bmpFilter, wPx, hPx) } catch (_: Throwable) {}
            try { glAddFilter(bmpFilter) } catch (_: Throwable) {}

            overlayFilter = bmpFilter
            overlayMode = OverlayMode.BITMAP
            overlayVisible = true
            try { glSetAlpha(bmpFilter, 1f) } catch (_: Throwable) {}

            // render 1 frame ngay để overlay xuất hiện
            requestOverlayBitmapRenderLocked("overlayLoad")
            updateOverlayTickerLocked()

            pOnce.resolve(true)
          }
        }
      } catch (t: Throwable) {
        pOnce.reject("OVERLAY_LOAD_ERROR", t.message ?: t.toString())
      }
    }
  }


  @ReactMethod
  fun overlayUpdate(data: ReadableMap, promise: Promise) {
    runOnMain {
      val pOnce = PromiseOnce(promise)
      try {
        synchronized(overlayLock) {
          val view = overlayNativeView
          if (view == null) {
            pOnce.resolve(null)
            return@runOnMain
          }

          // track showClock để ticker bitmap chỉ chạy khi cần
          try {
            if (data.hasKey("showClock")) {
              overlayShowClock = data.getBoolean("showClock")
            }
          } catch (_: Throwable) {}

          view.updateState(data)

          if (overlayMode == OverlayMode.BITMAP) {
            requestOverlayBitmapRenderLocked("overlayUpdate")
            updateOverlayTickerLocked()
          }
        }

        pOnce.resolve(null)
      } catch (t: Throwable) {
        pOnce.reject("OVERLAY_UPDATE_ERROR", t.message ?: t.toString())
      }
    }
  }


  @ReactMethod
  @ReactMethod
  fun overlaySetVisible(visible: Boolean, promise: Promise) {
    runOnMain {
      try {
        synchronized(overlayLock) {
          overlayVisible = visible
          try { overlayFilter?.let { glSetAlpha(it, if (visible) 1f else 0f) } } catch (_: Throwable) {}

          if (overlayMode == OverlayMode.BITMAP) {
            if (visible) requestOverlayBitmapRenderLocked("setVisible")
            updateOverlayTickerLocked()
          }
        }
        promise.resolve(null)
      } catch (t: Throwable) {
        promise.reject("OVERLAY_VISIBLE_ERROR", t)
      }
    }
  }


  @ReactMethod
  fun overlaySetFps(fps: Int) {
    runOnMain { overlaySetFpsInternal(fps) }
  }

  private fun overlaySetFpsInternal(fps: Int) {
    val f = fps.coerceIn(1, 60) // ✅ cho phép <10 (cellular 6fps)
    overlayTargetFps = f
    overlayFrameNs = 1_000_000_000L / overlayTargetFps
  }

  private fun requestOverlayBitmapRenderLocked(reason: String) {
    if (overlayMode != OverlayMode.BITMAP) return
    if (overlayFilter == null) return
    if (overlayNativeView == null) return
    // Coalesce + throttle
    val now = SystemClock.uptimeMillis()
    val since = now - overlayLastRenderAtMs
    val delay = if (since >= overlayRenderMinIntervalMs) 0L else (overlayRenderMinIntervalMs - since)

    overlayRenderHandler.removeCallbacks(overlayRenderRunnable)
    overlayRenderHandler.postDelayed(overlayRenderRunnable, delay)
    overlayRenderScheduled = true
  }

  private val overlayRenderRunnable = Runnable {
    runOnMain {
      synchronized(overlayLock) {
        overlayRenderScheduled = false
        renderOverlayBitmapNowLocked()
        overlayLastRenderAtMs = SystemClock.uptimeMillis()
      }
    }
  }

  private fun renderOverlayBitmapNowLocked() {
    if (overlayMode != OverlayMode.BITMAP) return
    val filter = overlayFilter ?: return
    val nv = overlayNativeView ?: return

    // cache method setImage(Bitmap)
    if (overlaySetImageMethod == null) {
      overlaySetImageMethod = try {
        filter.javaClass.getMethod("setImage", Bitmap::class.java)
      } catch (_: Throwable) {
        null
      }
    }
    val setImage = overlaySetImageMethod ?: return

    val w = lastW
    val h = lastH
    if (w <= 0 || h <= 0) return

    if (reuseBitmap == null || reuseBitmap?.width != w || reuseBitmap?.height != h || reuseBitmap?.isRecycled == true) {
      try { reuseBitmap?.recycle() } catch (_: Throwable) {}
      reuseBitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    }

    val bmp = reuseBitmap ?: return

    // ensure layout đúng size (offscreen host vẫn measure, nhưng chắc ăn)
    try { forceMeasureLayout(nv, w, h) } catch (_: Throwable) {}

    try {
      val canvas = Canvas(bmp)
      canvas.drawColor(Color.TRANSPARENT, PorterDuff.Mode.CLEAR)
      nv.draw(canvas)
      setImage.invoke(filter, bmp)
      // alpha theo visible
      try { glSetAlpha(filter, if (overlayVisible) 1f else 0f) } catch (_: Throwable) {}
    } catch (t: Throwable) {
      log("renderOverlayBitmapNowLocked error: $t")
    }
  }

  private fun updateOverlayTickerLocked() {
    val needTicker = overlayMode == OverlayMode.BITMAP && overlayVisible && overlayShowClock
    if (needTicker && !overlayTickerRunning) {
      overlayTickerRunning = true
      overlayTickerHandler.removeCallbacks(overlayTickerRunnable)
      overlayTickerHandler.postDelayed(overlayTickerRunnable, 1000L)
    } else if (!needTicker && overlayTickerRunning) {
      overlayTickerRunning = false
      overlayTickerHandler.removeCallbacks(overlayTickerRunnable)
    }
  }

  private fun overlaySuspendInternal(freeMemory: Boolean, aggressiveImages: Boolean) {
    synchronized(overlayLock) {
      overlayVisible = false
      try { overlayFilter?.let { glSetAlpha(it, 0f) } } catch (_: Throwable) {}

      // stop ticker + pending renders
      overlayTickerRunning = false
      overlayTickerHandler.removeCallbacks(overlayTickerRunnable)
      overlayRenderHandler.removeCallbacks(overlayRenderRunnable)
      overlayRenderScheduled = false

      if (aggressiveImages) {
        try { overlayNativeView?.trimMemory(true) } catch (_: Throwable) {}
      }

      if (freeMemory) {
        try { overlayFilter?.let { glRemoveFilter(it) } } catch (_: Throwable) {}
        overlayFilter = null
        overlayMode = OverlayMode.NONE
        overlaySetImageMethod = null
        try { reuseBitmap?.recycle() } catch (_: Throwable) {}
        reuseBitmap = null
      }
    }
  }

  @ReactMethod
  fun overlaySuspend(freeMemory: Boolean, aggressiveImages: Boolean, promise: Promise) {
    runOnMain {
      try {
        overlaySuspendInternal(freeMemory = freeMemory, aggressiveImages = aggressiveImages)
        promise.resolve(null)
      } catch (t: Throwable) {
        promise.reject("OVERLAY_SUSPEND_ERROR", t.message ?: t.toString())
      }
    }
  }


  private fun overlayRemoveInternal() {
    runOnMain {
      synchronized(overlayLock) {
        log("🗑️ Removing overlay...")

        overlayUpdateRunnable?.let { overlayUpdateHandler.removeCallbacks(it) }
        overlayUpdateRunnable = null
        pendingOverlayUpdate = null

        try { glRemoveFilter(overlayFilter) } catch (e: Throwable) { log("❌ glRemoveFilter error: $e") }
        try { stopBitmapLoop() } catch (e: Throwable) { log("❌ stopBitmapLoop error: $e") }

        overlayVisible = false
        overlayFilter = null
        overlayMode = OverlayMode.NONE

        try {
          overlayNativeView?.let { view ->
            try { view.clearCache() } catch (e: Throwable) { log("❌ clearCache error: $e") }
            try { (view.parent as? ViewGroup)?.removeView(view) } catch (e: Throwable) { log("❌ removeView error: $e") }
          }
        } catch (e: Throwable) {
          log("❌ Overlay view cleanup error: $e")
        }
        overlayNativeView = null

        try {
          overlayHost?.let { host ->
            try { (host.parent as? ViewGroup)?.removeView(host) } catch (e: Throwable) { log("❌ removeHost error: $e") }
          }
        } catch (e: Throwable) {
          log("❌ Overlay host cleanup error: $e")
        }
        overlayHost = null

        overlayMeasureW = 0
        overlayMeasureH = 0

        log("✅ Overlay removed completely")
      }
    }
  }

  @ReactMethod
  fun overlayRemove(promise: Promise) {
    runOnMain {
      try {
        overlayRemoveInternal()
        promise.resolve(null)
      } catch (t: Throwable) {
        promise.reject("OVERLAY_REMOVE_ERROR", t)
      }
    }
  }

  // ================== Recording ==================
  private fun getRecordingDir(): File? {
    return try {
      val dir = reactCtx.getExternalFilesDir(null)?.let { File(it, "recordings") }
        ?: File(reactCtx.filesDir, "recordings")
      if (!dir.exists()) dir.mkdirs()
      dir
    } catch (e: Throwable) {
      log("❌ Cannot create recording dir: $e")
      null
    }
  }

  private fun generateRecordingPath(matchId: String?, index: Int = 0): String? {
    val dir = getRecordingDir() ?: return null
    val timestamp = System.currentTimeMillis()
    val mid = matchId ?: "unknown"
    val suffix = if (index > 0) "_part${index}" else ""
    return "${dir.absolutePath}/live_${mid}_${timestamp}${suffix}.mp4"
  }

  @ReactMethod
  fun startRecording(matchId: String, promise: Promise) {
    runOnMain {
      try {
        rlog("startRecording() called, matchId: $matchId")

        val cam = rtmpCamera2
        if (cam == null) {
          promise.reject("RECORDING_ERROR", "Camera not initialized")
          return@runOnMain
        }

        if (!cam.isStreaming) {
          promise.reject("RECORDING_ERROR", "Stream not active")
          return@runOnMain
        }

        if (isRecording) {
          promise.reject("RECORDING_ERROR", "Already recording")
          return@runOnMain
        }

        val path = generateRecordingPath(matchId, chunkIndex)
        if (path == null) {
          promise.reject("RECORDING_ERROR", "Cannot create recording path")
          return@runOnMain
        }

        try {
          cam.startRecord(path)

          isRecording = true
          recordingPath = path
          recordingStartTime = System.currentTimeMillis()
          chunkIndex = 0

          scheduleChunkRotation(matchId)

          val result = Arguments.createMap().apply {
            putString("path", path)
            putBoolean("recording", true)
          }
          promise.resolve(result)
        } catch (e: Throwable) {
          rlog("❌ startRecord() exception: ${e.message}")
          promise.reject("RECORDING_ERROR", e.message ?: e.toString())
        }
      } catch (e: Throwable) {
        promise.reject("RECORDING_ERROR", e.message ?: e.toString())
      }
    }
  }

  private fun scheduleChunkRotation(matchId: String) {
    chunkRunnable?.let { recordingHandler.removeCallbacks(it) }

    chunkRunnable = object : Runnable {
      override fun run() {
        if (!isRecording) return

        try {
          val cam = rtmpCamera2 ?: return

          try {
            cam.stopRecord()
            recordingPath?.let { path ->
              val file = File(path)
              val eventData = Arguments.createMap().apply {
                putString("path", path)
                putInt("chunkIndex", chunkIndex)
                putDouble("fileSizeMB", file.length() / (1024.0 * 1024.0))
                putString("matchId", matchId)
                putBoolean("isFinal", false)
              }
              sendEvent("onRecordingChunkComplete", eventData)
            }
          } catch (e: Throwable) {
            rlog("❌ stopRecord() failed: ${e.message}")
          }

          chunkIndex += 1
          val nextPath = generateRecordingPath(matchId, chunkIndex)

          if (nextPath != null) {
            try {
              recordingStartTime = System.currentTimeMillis()
              cam.startRecord(nextPath)
              recordingPath = nextPath
              recordingHandler.postDelayed(this, chunkDurationMs)
            } catch (e: Throwable) {
              rlog("❌ Next chunk start failed: ${e.message}")
              isRecording = false
            }
          } else {
            isRecording = false
          }
        } catch (e: Throwable) {
          rlog("❌ Chunk rotation crashed: ${e.message}")
          isRecording = false
        }
      }
    }

    recordingHandler.postDelayed(chunkRunnable!!, chunkDurationMs)
  }

  @ReactMethod
  fun stopRecording(promise: Promise) {
    runOnMain {
      try {
        if (!isRecording) {
          promise.resolve(null)
          return@runOnMain
        }

        chunkRunnable?.let { recordingHandler.removeCallbacks(it) }
        chunkRunnable = null

        val cam = rtmpCamera2
        if (cam != null) {
          try {
            cam.stopRecord()
            recordingPath?.let { path ->
              val file = File(path)
              val eventData = Arguments.createMap().apply {
                putString("path", path)
                putInt("chunkIndex", chunkIndex)
                putBoolean("isFinal", true)
                putDouble("fileSizeMB", file.length() / (1024.0 * 1024.0))
              }
              sendEvent("onRecordingChunkComplete", eventData)
            }
          } catch (e: Throwable) {
            rlog("❌ stopRecord() failed: ${e.message}")
          }
        }

        val totalDuration = (System.currentTimeMillis() - recordingStartTime) / 1000

        val result = Arguments.createMap().apply {
          putString("lastPath", recordingPath)
          putInt("totalChunks", chunkIndex + 1)
          putDouble("totalDurationSeconds", totalDuration.toDouble())
        }

        isRecording = false
        recordingPath = null
        chunkIndex = 0

        promise.resolve(result)
      } catch (e: Throwable) {
        promise.reject("RECORDING_ERROR", e.message ?: e.toString())
      }
    }
  }

  @ReactMethod
  fun deleteRecordingFile(path: String, promise: Promise) {
    runOnMain {
      try {
        val cleanPath = if (path.startsWith("file://")) path.removePrefix("file://") else path
        val f = File(cleanPath)
        if (!f.exists()) {
          promise.resolve(false)
          return@runOnMain
        }
        promise.resolve(f.delete())
      } catch (e: Throwable) {
        promise.reject("DELETE_ERROR", e.message ?: e.toString())
      }
    }
  }

  @ReactMethod
  fun getRecordingStatus(promise: Promise) {
    runOnMain {
      val result = Arguments.createMap().apply {
        putBoolean("recording", isRecording)
        putString("currentPath", recordingPath)
        putInt("chunkIndex", chunkIndex)
        if (isRecording) {
          val durationMs = System.currentTimeMillis() - recordingStartTime
          putDouble("durationSeconds", durationMs / 1000.0)
        }
      }
      promise.resolve(result)
    }
  }

  // ================== Profiles / capabilities ==================
  @ReactMethod
  fun suggestProfile(promise: Promise) {
    runOnMain {
      try {
        val cam = ensureCamera()
        if (cam == null) {
          promise.reject("SUGGEST_PROFILE_ERR", "camera not ready")
          return@runOnMain
        }
        val sizes = getSupportedSizes(cam, currentFacing ?: facingBACK)
        val can1080 = sizes.any { (it.w == 1920 && it.h == 1080) || (it.w == 1080 && it.h == 1920) }
        val can720 = sizes.any { (it.w == 1280 && it.h == 720) || (it.w == 720 && it.h == 1280) }

        val am = reactCtx.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val mi = ActivityManager.MemoryInfo().also { am.getMemoryInfo(it) }
        val memGb = (mi.totalMem / (1024.0 * 1024 * 1024))
        val cores = Runtime.getRuntime().availableProcessors()
        val sdk = Build.VERSION.SDK_INT

        val perfScore = (
          (if (sdk >= 33) 40 else if (sdk >= 29) 30 else if (sdk >= 26) 20 else 10) +
            (cores.coerceAtMost(8) * 5) +
            ((memGb.coerceAtMost(8.0) / 8.0) * 30)
          ).toInt().coerceIn(30, 95)

        val out = Arguments.createMap()
        if (can1080 && perfScore >= 80) {
          out.putInt("width", 1920); out.putInt("height", 1080)
          out.putInt("fps", 30); out.putInt("bitrate", 4_500_000)
        } else if (can720 && perfScore >= 65) {
          out.putInt("width", 1280); out.putInt("height", 720)
          out.putInt("fps", 30); out.putInt("bitrate", 3_800_000)
        } else if (can720 && perfScore >= 55) {
          out.putInt("width", 1280); out.putInt("height", 720)
          out.putInt("fps", 24); out.putInt("bitrate", 3_000_000)
        } else {
          out.putInt("width", 1280); out.putInt("height", 720)
          out.putInt("fps", 24); out.putInt("bitrate", 2_800_000)
        }
        promise.resolve(out)
      } catch (t: Throwable) {
        promise.reject("SUGGEST_PROFILE_ERR", t)
      }
    }
  }

  @ReactMethod
  fun canDo1080p(promise: Promise) {
    runOnMain {
      try {
        val cam = ensureCamera()
        if (cam == null) { promise.resolve(false); return@runOnMain }
        val sizes = getSupportedSizes(cam, currentFacing ?: facingBACK)
        val ok = sizes.any { (it.w == 1920 && it.h == 1080) || (it.w == 1080 && it.h == 1920) }
        promise.resolve(ok)
      } catch (_: Throwable) {
        promise.resolve(false)
      }
    }
  }

  @ReactMethod
  fun canDo720p60(promise: Promise) {
    runOnMain {
      try {
        val cam = ensureCamera()
        if (cam == null) { promise.resolve(false); return@runOnMain }

        val sizes = getSupportedSizes(cam, currentFacing ?: facingBACK)
        val ok720 = sizes.any { (it.w == 1280 && it.h == 720) || (it.w == 720 && it.h == 1280) }

        val am = reactCtx.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val mi = ActivityManager.MemoryInfo().also { am.getMemoryInfo(it) }
        val memGb = (mi.totalMem / (1024.0 * 1024 * 1024))
        val cores = Runtime.getRuntime().availableProcessors()

        val ok = ok720 && Build.VERSION.SDK_INT >= 29 && cores >= 6 && memGb >= 4
        promise.resolve(ok)
      } catch (_: Throwable) {
        promise.resolve(false)
      }
    }
  }

  // ================== Event emitter ==================
  private fun sendEvent(event: String, params: WritableMap = Arguments.createMap()) {
    try {
      reactCtx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(event, params)
    } catch (e: Throwable) {
      rlog("❌ Failed to emit event '$event': ${e.message}")
    }
  }

  // ================== ConnectChecker ==================
  override fun onConnectionStarted(url: String) {
    sendEvent("onConnectionStarted", Arguments.createMap().apply { putString("url", url) })
  }

  override fun onConnectionSuccess() {
    sendEvent("onConnectionSuccess")
  }

  override fun onNewBitrate(bitrate: Long) {
    sendEvent("onNewBitrate", Arguments.createMap().apply { putDouble("bitrate", bitrate.toDouble()) })
  }

  override fun onConnectionFailed(reason: String) {
    log("❌ onConnectionFailed: $reason")
    sendEvent("onConnectionFailed", Arguments.createMap().apply { putString("reason", reason) })
  }

  override fun onDisconnect() {
    sendEvent("onDisconnect")
  }

  override fun onAuthError() {
    sendEvent("onAuthError")
  }

  override fun onAuthSuccess() {
    sendEvent("onAuthSuccess")
  }

  // ================== PromiseOnce helper ==================
  private class PromiseOnce(private val promise: Promise) {
    private val done = AtomicBoolean(false)

    fun resolve(value: Any?) {
      if (done.compareAndSet(false, true)) promise.resolve(value)
    }

    fun reject(code: String, message: String?) {
      if (done.compareAndSet(false, true)) promise.reject(code, message)
    }

    fun reject(code: String, throwable: Throwable) {
      if (done.compareAndSet(false, true)) promise.reject(code, throwable)
    }

    fun reject(code: String, message: String?, throwable: Throwable) {
      if (done.compareAndSet(false, true)) promise.reject(code, message, throwable)
    }
  }
}