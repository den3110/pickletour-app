// android/app/src/main/java/com/pkt/pickletour/CountdownOverlayView.kt
package com.pkt.pickletour

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import android.widget.TextView
import androidx.appcompat.widget.AppCompatTextView
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.uimanager.events.RCTEventEmitter
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

class CountdownOverlayView(context: Context) : FrameLayout(context) {
    
    private val titleText: AppCompatTextView
    private val progressView: DottedProgressView
    private val countdownText: AppCompatTextView
    private val cancelButton: TextView
    
    private var durationMs: Long = 5000
    private var startTimeMs: Long = 0
    private var isRunning = false
    private val handler = Handler(Looper.getMainLooper())

    private val updateRunnable = object : Runnable {
    override fun run() {
        if (!isRunning) return
        
        val elapsedMs = System.currentTimeMillis() - startTimeMs
        val progress = min(1f, elapsedMs.toFloat() / durationMs)
        val remainingMs = (durationMs - elapsedMs).coerceAtLeast(0)
        val remainingSec = (remainingMs / 1000f).toInt() + 1
        
        progressView.setProgress(progress)
        countdownText.text = "Sẽ ${if (mode == "stopping") "kết thúc" else "dừng"} sau ${remainingSec}s"
        
        if (progress >= 1f) {
            android.util.Log.d("CountdownOverlay", "✅ Countdown finished, sending onDone")
            // ✅ Stop TRƯỚC KHI gọi event
            stop()
            sendEvent("onDone")
            return
        }
        
        handler.postDelayed(this, 16) // ~60fps
        }
    }
    
    private var mode: String = "stopping" // "stopping" hoặc "gap"
    
    init {
        setBackgroundColor(Color.parseColor("#D9000000"))
        
        // Title
        titleText = AppCompatTextView(context).apply {
            layoutParams = LayoutParams(
                LayoutParams.WRAP_CONTENT,
                LayoutParams.WRAP_CONTENT
            ).apply {
                gravity = Gravity.CENTER_HORIZONTAL
                topMargin = dpToPx(200f)
            }
            setTextColor(Color.WHITE)
            textSize = 18f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            text = "Đang kết thúc buổi phát"
            gravity = Gravity.CENTER
        }
        addView(titleText)
        
        // Progress circle
        progressView = DottedProgressView(context).apply {
            layoutParams = LayoutParams(
                dpToPx(140f),
                dpToPx(140f)
            ).apply {
                gravity = Gravity.CENTER
            }
        }
        addView(progressView)
        
        // Countdown text
        countdownText = AppCompatTextView(context).apply {
            layoutParams = LayoutParams(
                LayoutParams.WRAP_CONTENT,
                LayoutParams.WRAP_CONTENT
            ).apply {
                gravity = Gravity.CENTER_HORIZONTAL
                topMargin = dpToPx(400f)
            }
            setTextColor(Color.WHITE)
            textSize = 14f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
            text = "Sẽ kết thúc sau 5s"
        }
        addView(countdownText)
        
        // Cancel button
        cancelButton = AppCompatTextView(context).apply {
            layoutParams = LayoutParams(
                LayoutParams.WRAP_CONTENT,
                dpToPx(42f)
            ).apply {
                gravity = Gravity.CENTER_HORIZONTAL or Gravity.BOTTOM
                bottomMargin = dpToPx(16f)
            }
            setBackgroundColor(Color.parseColor("#33FFFFFF"))
            setTextColor(Color.WHITE)
            textSize = 16f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            text = "Huỷ"
            gravity = Gravity.CENTER
            setPadding(dpToPx(22f), 0, dpToPx(22f), 0)
            
            background = createRoundedBackground(Color.parseColor("#33FFFFFF"), dpToPx(8f).toFloat())
            
            setOnClickListener {
                sendEvent("onCancel")
            }
        }
        addView(cancelButton)
        
        // ✅ AUTO-START khi view được attach
        addOnAttachStateChangeListener(object : View.OnAttachStateChangeListener {
            override fun onViewAttachedToWindow(v: View) {
                android.util.Log.d("CountdownOverlay", "📎 View attached")
                post {
                    if (!isRunning && durationMs > 0) {
                        start()
                    }
                }
            }
            
            override fun onViewDetachedFromWindow(v: View) {
                android.util.Log.d("CountdownOverlay", "📌 View detached - stopping")
                // ✅ Đảm bảo stop khi component bị unmount
                handler.removeCallbacks(updateRunnable)
                stop()
            }
        })
    }
    
    fun setMode(newMode: String) {
        mode = newMode
        if (mode == "gap") {
            titleText.text = "Không có trận mới — sẽ tự dừng sau ít giây"
            cancelButton.text = "Huỷ (tiếp tục chờ 10 phút)"
        } else {
            titleText.text = "Đang kết thúc buổi phát"
            cancelButton.text = "Huỷ"
        }
    }
    
    fun setDuration(ms: Long) {
        durationMs = ms
    }
    
    fun setSafeBottom(px: Float) {
        val params = cancelButton.layoutParams as LayoutParams
        val totalMargin = dpToPx(16f) + px.toInt()
        params.bottomMargin = totalMargin
        cancelButton.layoutParams = params
    }
    
    fun start() {
        // ✅ Nếu đang chạy rồi thì không start lại
        if (isRunning) {
            android.util.Log.d("CountdownOverlay", "⚠️ Already running, skipping start")
            return
        }
        
        android.util.Log.d("CountdownOverlay", "▶️ START - mode: $mode, duration: ${durationMs}ms")
        startTimeMs = System.currentTimeMillis()
        isRunning = true
        handler.removeCallbacks(updateRunnable)
        handler.post(updateRunnable)
    }
    
    fun stop() {
        isRunning = false
        handler.removeCallbacks(updateRunnable)
        progressView.setProgress(0f)
    }
    
    private fun sendEvent(eventName: String) {
        val reactContext = context as? ReactContext ?: return
        val event = Arguments.createMap()
        reactContext.getJSModule(RCTEventEmitter::class.java)
            .receiveEvent(id, eventName, event)
    }
    
    private fun dpToPx(dp: Float): Int {
        return (dp * context.resources.displayMetrics.density).toInt()
    }
    
    private fun createRoundedBackground(color: Int, radius: Float): android.graphics.drawable.GradientDrawable {
        return android.graphics.drawable.GradientDrawable().apply {
            setColor(color)
            cornerRadius = radius
        }
    }
    
    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        stop()
        handler.removeCallbacksAndMessages(null)
    }
}

// Inner class for dotted circle progress
class DottedProgressView(context: Context) : View(context) {
    
    private val dotCount = 30
    private val dotSize = dpToPx(8f)
    private val dotRadius = dotSize / 2f
    
    private val activePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        style = Paint.Style.FILL
    }
    
    private val inactivePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#33FFFFFF")
        style = Paint.Style.FILL
    }
    
    private var progress = 0f
    private val dots = mutableListOf<Pair<Float, Float>>()
    
    init {
        setBackgroundColor(Color.TRANSPARENT)
    }
    
    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        calculateDots()
    }
    
    private fun calculateDots() {
        dots.clear()
        val centerX = width / 2f
        val centerY = height / 2f
        val radius = (min(width, height) / 2f) - dotRadius - dpToPx(2f)
        
        for (i in 0 until dotCount) {
            val angle = (i.toFloat() / dotCount) * Math.PI * 2 - Math.PI / 2
            val x = centerX + radius * cos(angle).toFloat()
            val y = centerY + radius * sin(angle).toFloat()
            dots.add(Pair(x, y))
        }
    }
    
    fun setProgress(p: Float) {
        progress = p.coerceIn(0f, 1f)
        invalidate()
    }
    
    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        
        val litCount = (progress * dotCount).toInt()
        
        dots.forEachIndexed { index, (x, y) ->
            val paint = if (index < litCount) activePaint else inactivePaint
            canvas.drawCircle(x, y, dotRadius, paint)
        }
    }
    
    private fun dpToPx(dp: Float): Float {
        return dp * context.resources.displayMetrics.density
    }
}