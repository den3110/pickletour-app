package com.pkt.pickletour

import android.content.Context
import android.graphics.*
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.View
import kotlin.math.roundToInt
import android.view.MotionEvent

/**
 * Native View hiển thị real-time streaming stats với smooth timer
 * - Upload/Download speed
 * - Total data sent/received  
 * - Stream duration (SMOOTH COUNTING - updates every second internally)
 * - Current bitrate
 * - FPS
 * - Resolution
 */
class StreamStatsOverlayView(context: Context) : View(context) {

  companion object {
    private const val TAG = "StreamStatsOverlay"
    private const val ENABLE_LOGS = false
    private const val TIMER_UPDATE_INTERVAL_MS = 1000L // Update every 1 second
    
    private fun log(msg: String) {
      if (ENABLE_LOGS) Log.d(TAG, msg)
    }
  }

  // ================== Paint objects ==================
  private val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.parseColor("#CC000000") // Semi-transparent black
    style = Paint.Style.FILL
  }

  private val titlePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.WHITE
    textSize = 32f
    typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
  }

  private val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.parseColor("#AAAAAA") // Light gray
    textSize = 28f
  }

  private val valuePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.parseColor("#00FF00") // Green
    textSize = 28f
    typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
  }

  private val warningPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.parseColor("#FFAA00") // Orange
    textSize = 28f
    typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
  }

  private val errorPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.parseColor("#FF0000") // Red
    textSize = 28f
    typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
  }

  // ================== Stats data ==================
  private var uploadSpeedBps: Long = 0L
  private var downloadSpeedBps: Long = 0L
  private var totalBytesSent: Long = 0L
  private var totalBytesReceived: Long = 0L
  
  // ✅ SMOOTH TIMER - Internal tracking
  private var timerStartTimestamp: Long = 0L
  private var isTimerRunning: Boolean = false
  private val timerHandler = Handler(Looper.getMainLooper())
  private var timerRunnable: Runnable? = null
  
  private var currentBitrate: Long = 0L
  private var currentFps: Int = 0
  private var resolution: String = ""
  private var networkType: String = "Unknown"
  private var droppedFrames: Int = 0
  private var isRecording: Boolean = false

  // ================== Layout config ==================
  private var padding = 24f
  private var lineHeight = 40f
  private var cornerRadius = 16f
  private var position = Position.TOP_RIGHT
  private var alpha = 0.9f

  enum class Position {
    TOP_LEFT,
    TOP_RIGHT,
    BOTTOM_LEFT,
    BOTTOM_RIGHT
  }

  // 🆕 Scroll state
  private var scrollOffset = 0f
  private var lastContentHeight = 0f
  private var maxScroll = 0f
  private var lastTouchY = 0f
  private var isDragging = false

  init {
    // cho phép nhận touch
    isClickable = true
  }

  // ================== Timer methods ==================
  /**
   * Start internal smooth timer
   */
  fun startTimer() {
    if (isTimerRunning) {
      log("⚠️ Timer already running")
      return
    }
    
    timerStartTimestamp = System.currentTimeMillis()
    isTimerRunning = true
    scheduleTimerUpdate()
    
    log("⏱️ Timer started at: $timerStartTimestamp")
  }

   /**
   * Đồng bộ timer theo mốc global (streamStartTime)
   */
    fun syncTimer(startTimestamp: Long) {
        timerStartTimestamp = startTimestamp
        if (!isTimerRunning) {
        isTimerRunning = true
        scheduleTimerUpdate()
        }
        log("⏱️ Timer synced to: $timerStartTimestamp")
    }


   /**
   * Stop internal timer
   */
  fun stopTimer() {
    if (!isTimerRunning) {
      log("⚠️ Timer not running")
      return
    }

    isTimerRunning = false
    timerRunnable?.let { timerHandler.removeCallbacks(it) }
    timerRunnable = null
    // KHÔNG reset timerStartTimestamp ở đây, chỉ khi cleanup
    log("⏹️ Timer stopped")
  }


  /**
   * Get current duration in seconds
   */
  private fun getCurrentDuration(): Long {
    if (!isTimerRunning || timerStartTimestamp == 0L) return 0L
    return (System.currentTimeMillis() - timerStartTimestamp) / 1000L
  }

  /**
   * Schedule next timer update
   */
  private fun scheduleTimerUpdate() {
    timerRunnable = Runnable {
      if (!isTimerRunning) return@Runnable
      
      // Trigger redraw to update duration display
      invalidate()
      
      // Schedule next update
      scheduleTimerUpdate()
    }
    
    timerHandler.postDelayed(timerRunnable!!, TIMER_UPDATE_INTERVAL_MS)
  }

  // ================== Update methods ==================
  /**
   * Update stats (duration is now calculated internally)
   */
  fun updateStats(
    uploadBps: Long,
    downloadBps: Long,
    totalTx: Long,
    totalRx: Long,
    bitrate: Long,
    fps: Int,
    res: String,
    netType: String,
    dropped: Int,
    recording: Boolean
  ) {
    uploadSpeedBps = uploadBps
    downloadSpeedBps = downloadBps
    totalBytesSent = totalTx
    totalBytesReceived = totalRx
    currentBitrate = bitrate
    currentFps = fps
    resolution = res
    networkType = netType
    droppedFrames = dropped
    isRecording = recording
    
    invalidate() // Trigger redraw
  }

  /**
   * ✅ BACKWARD COMPATIBILITY: Old signature with durationSec param
   * This is ignored, internal timer is used instead
   */
  @Deprecated("Use updateStats() without durationSec - timer is now internal")
  fun updateStats(
    uploadBps: Long,
    downloadBps: Long,
    totalTx: Long,
    totalRx: Long,
    @Suppress("UNUSED_PARAMETER") durationSec: Long, // ← IGNORED
    bitrate: Long,
    fps: Int,
    res: String,
    netType: String,
    dropped: Int,
    recording: Boolean
  ) {
    // Call new version without durationSec
    updateStats(
      uploadBps = uploadBps,
      downloadBps = downloadBps,
      totalTx = totalTx,
      totalRx = totalRx,
      bitrate = bitrate,
      fps = fps,
      res = res,
      netType = netType,
      dropped = dropped,
      recording = recording
    )
  }

  fun clearStats() {
    uploadSpeedBps = 0L
    downloadSpeedBps = 0L
    totalBytesSent = 0L
    totalBytesReceived = 0L
    currentBitrate = 0L
    currentFps = 0
    resolution = ""
    networkType = "Unknown"
    droppedFrames = 0
    isRecording = false
    
    invalidate()
  }

  fun setPosition(pos: Position) {
    position = pos
    invalidate()
  }

  fun setOverlayAlpha(a: Float) {
    alpha = a.coerceIn(0f, 1f)
    bgPaint.alpha = (alpha * 204).toInt() // 0.8 * 255
    invalidate()
  }

  // ================== Draw ==================
  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)

    if (width == 0 || height == 0) return

    // Calculate content size
    val lines = buildStatLines()
    val maxWidth = lines.maxOfOrNull { titlePaint.measureText(it) } ?: 0f
    val contentWidth = maxWidth + padding * 2
    val contentHeight = (lines.size * lineHeight) + padding * 2

    // 🆕 lưu lại để clamp scroll
    lastContentHeight = contentHeight
    val visibleHeight = height.toFloat() - padding * 2
    maxScroll = if (contentHeight > visibleHeight) {
      contentHeight - visibleHeight
    } else {
      0f
    }

    // Calculate position như cũ
    val (x, y) = when (position) {
      Position.TOP_LEFT -> Pair(padding, padding)
      Position.TOP_RIGHT -> Pair(width - contentWidth - padding, padding)
      Position.BOTTOM_LEFT -> Pair(padding, height - contentHeight - padding)
      Position.BOTTOM_RIGHT -> Pair(width - contentWidth - padding, height - contentHeight - padding)
    }

    // Draw background with rounded corners
    val bgRect = RectF(x, y, x + contentWidth, y + contentHeight)
    canvas.drawRoundRect(bgRect, cornerRadius, cornerRadius, bgPaint)

    // 🆕 trừ scrollOffset khi vẽ text
    var currentY = y + padding + 32f - scrollOffset
    lines.forEachIndexed { index, line ->
      val paint = when {
        index == 0 -> titlePaint // Title
        line.contains("⚠") -> warningPaint
        line.contains("❌") -> errorPaint
        else -> valuePaint
      }

      // nếu muốn tối ưu có thể check currentY trong vùng visible rồi mới vẽ
      canvas.drawText(line, x + padding, currentY, paint)
      currentY += lineHeight
    }
  }

  override fun onTouchEvent(event: MotionEvent): Boolean {
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        // không cho parent (ScrollView, sheet…) cướp touch trong lúc kéo
        parent?.requestDisallowInterceptTouchEvent(true)
        lastTouchY = event.y
        isDragging = true
        return true
      }

      MotionEvent.ACTION_MOVE -> {
        if (!isDragging) {
          lastTouchY = event.y
          isDragging = true
        }
        val dy = lastTouchY - event.y   // kéo lên -> dy > 0
        lastTouchY = event.y

        if (maxScroll > 0f) {
          scrollOffset = (scrollOffset + dy).coerceIn(0f, maxScroll)
          invalidate()
        }
        return true
      }

      MotionEvent.ACTION_UP,
      MotionEvent.ACTION_CANCEL -> {
        isDragging = false
        parent?.requestDisallowInterceptTouchEvent(false)
        return true
      }
    }

    return super.onTouchEvent(event)
  }

  private fun buildStatLines(): List<String> {
    val lines = mutableListOf<String>()
    
    // Title
    lines.add("📊 STREAM STATS")
    
    // ✅ Duration - Use internal timer (SMOOTH!)
    lines.add("⏱ Duration: ${formatDuration(getCurrentDuration())}")
    
    // Upload speed (most important)
    val uploadStatus = when {
      uploadSpeedBps < 500_000 -> "❌"
      uploadSpeedBps < 1_000_000 -> "⚠"
      else -> "✅"
    }
    lines.add("$uploadStatus Upload: ${formatSpeed(uploadSpeedBps)}")
    
    // Download speed
    lines.add("📥 Download: ${formatSpeed(downloadSpeedBps)}")
    
    // Total data
    lines.add("📊 Sent: ${formatBytes(totalBytesSent)}")
    lines.add("📊 Received: ${formatBytes(totalBytesReceived)}")
    
    // Bitrate
    val bitrateStatus = when {
      currentBitrate < 500_000 -> "⚠"
      else -> "✅"
    }
    lines.add("$bitrateStatus Bitrate: ${formatBitrate(currentBitrate)}")
    
    // FPS
    val fpsStatus = when {
      currentFps < 15 -> "❌"
      currentFps < 24 -> "⚠"
      else -> "✅"
    }
    lines.add("$fpsStatus FPS: $currentFps")
    
    // Resolution
    if (resolution.isNotEmpty()) {
      lines.add("📺 Resolution: $resolution")
    }
    
    // Network type
    lines.add("📶 Network: $networkType")
    
    // Dropped frames
    if (droppedFrames > 0) {
      lines.add("⚠ Dropped: $droppedFrames frames")
    }
    
    // Recording indicator
    if (isRecording) {
      lines.add("🔴 RECORDING")
    }
    
    return lines
  }

  // ================== Formatting helpers ==================
  private fun formatSpeed(bps: Long): String {
    return when {
      bps >= 1_000_000 -> String.format("%.2f Mbps", bps / 1_000_000.0)
      bps >= 1_000 -> String.format("%.2f Kbps", bps / 1_000.0)
      else -> "$bps bps"
    }
  }

  private fun formatBitrate(bps: Long): String {
    return when {
      bps >= 1_000_000 -> String.format("%.1f Mbps", bps / 1_000_000.0)
      bps >= 1_000 -> String.format("%.0f Kbps", bps / 1_000.0)
      else -> "$bps bps"
    }
  }

  private fun formatBytes(bytes: Long): String {
    return when {
      bytes >= 1_073_741_824 -> String.format("%.2f GB", bytes / 1_073_741_824.0) // 1024^3
      bytes >= 1_048_576 -> String.format("%.2f MB", bytes / 1_048_576.0) // 1024^2
      bytes >= 1_024 -> String.format("%.2f KB", bytes / 1_024.0)
      else -> "$bytes B"
    }
  }

  private fun formatDuration(seconds: Long): String {
    val hours = seconds / 3600
    val minutes = (seconds % 3600) / 60
    val secs = seconds % 60
    
    return when {
      hours > 0 -> String.format("%d:%02d:%02d", hours, minutes, secs)
      else -> String.format("%02d:%02d", minutes, secs)
    }
  }

  // ================== Lifecycle ==================
  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    log("✅ Overlay attached to window")
    // 👉 Đăng ký vào registry
    StreamStatsOverlayRegistry.register(this)
  }

   override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    stopTimer() // Auto cleanup timer
    // 👉 Hủy đăng ký
    StreamStatsOverlayRegistry.unregister(this)
    log("❌ Overlay detached from window")
  }

  // ================== Memory cleanup ==================
  // ================== Memory cleanup ==================
  fun cleanup() {
    log("🧹 Cleaning up StreamStatsOverlayView")

    // Stop timer first
    stopTimer()

    // Clear stats
    uploadSpeedBps = 0L
    downloadSpeedBps = 0L
    totalBytesSent = 0L
    totalBytesReceived = 0L
    currentBitrate = 0L
    currentFps = 0
    resolution = ""
    networkType = "Unknown"
    droppedFrames = 0
    isRecording = false

    timerStartTimestamp = 0L
  }
}