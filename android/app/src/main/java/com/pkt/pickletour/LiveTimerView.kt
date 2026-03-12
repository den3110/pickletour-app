// android/app/src/main/java/com/pkt/pickletour/LiveTimerView.kt
package com.pkt.pickletour

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Region  // ✅ THÊM
import android.graphics.Typeface
import android.os.Handler
import android.os.Looper
import android.view.View
import java.util.concurrent.TimeUnit

class LiveTimerView(context: Context) : View(context) {
    
    private val backgroundPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#99000000")
        style = Paint.Style.FILL
    }
    
    private val dotPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#17C964")
        style = Paint.Style.FILL
    }
    
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        textSize = dpToPx(13f)
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        textAlign = Paint.Align.LEFT
    }
    
    private val handler = Handler(Looper.getMainLooper())
    private var startTimeMs: Long = 0
    private var isRunning = false
    private var currentTimeText = "00:00"
    
    private val bounds = RectF()
    private val textBounds = android.graphics.Rect()
    
    private val updateRunnable = object : Runnable {
        override fun run() {
            if (!isRunning) return
            
            val elapsedMs = System.currentTimeMillis() - startTimeMs
            val seconds = TimeUnit.MILLISECONDS.toSeconds(elapsedMs).toInt()
            
            val minutes = seconds / 60
            val secs = seconds % 60
            currentTimeText = String.format("%02d:%02d", minutes, secs)
            
            invalidate()
            
            val msUntilNextSecond = 1000 - (elapsedMs % 1000)
            handler.postDelayed(this, msUntilNextSecond)
        }
    }
    
    fun startTimer(startTimeMs: Long) {
        android.util.Log.d("LiveTimerView", "🚀 startTimer: $startTimeMs")
        this.startTimeMs = startTimeMs
        isRunning = true
        handler.removeCallbacks(updateRunnable)
        handler.post(updateRunnable)
    }
    
    fun stopTimer() {
        android.util.Log.d("LiveTimerView", "⏹️ stopTimer")
        isRunning = false
        handler.removeCallbacks(updateRunnable)
        currentTimeText = "00:00"
        invalidate()
    }
    
    // ✅ FIX CRASH: Override gatherTransparentRegion
    override fun gatherTransparentRegion(region: Region?): Boolean {
        // Don't participate in transparent region gathering
        // This prevents IndexOutOfBoundsException on Android 11
        return true
    }
    
    // ✅ FIX: Proper lifecycle management
    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        android.util.Log.d("LiveTimerView", "✅ Attached to window")
        requestLayout()
    }
    
    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val testText = "00:00:00"
        textPaint.getTextBounds(testText, 0, testText.length, textBounds)
        
        val dotSize = dpToPx(8f)
        val spacing = dpToPx(8f)
        val padding = dpToPx(12f)
        
        val contentWidth = (padding + dotSize + spacing + textBounds.width() + padding).toInt()
        val contentHeight = dpToPx(32f).toInt()
        
        // ✅ Ensure minimum size
        val finalWidth = maxOf(contentWidth, dpToPx(80f).toInt())
        val finalHeight = maxOf(contentHeight, dpToPx(32f).toInt())
        
        setMeasuredDimension(
            resolveSize(finalWidth, widthMeasureSpec),
            resolveSize(finalHeight, heightMeasureSpec)
        )
    }
    
    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        
        val w = width.toFloat()
        val h = height.toFloat()
        
        if (w <= 0 || h <= 0) return
        
        // Draw rounded background
        bounds.set(0f, 0f, w, h)
        canvas.drawRoundRect(bounds, h / 2f, h / 2f, backgroundPaint)
        
        // ✅ Calculate content width for centering
        textPaint.getTextBounds(currentTimeText, 0, currentTimeText.length, textBounds)
        
        val dotSize = dpToPx(8f)
        val spacing = dpToPx(8f)
        val contentWidth = dotSize + spacing + textBounds.width()
        
        // ✅ Center content horizontally
        val startX = (w - contentWidth) / 2f
        
        // Draw green dot
        val dotRadius = dotSize / 2f
        val dotCenterX = startX + dotRadius
        val dotCenterY = h / 2f
        canvas.drawCircle(dotCenterX, dotCenterY, dotRadius, dotPaint)
        
        // Draw timer text
        val textX = dotCenterX + dotRadius + spacing
        val textY = h / 2f - (textPaint.ascent() + textPaint.descent()) / 2f
        canvas.drawText(currentTimeText, textX, textY, textPaint)
    }
    
    private fun dpToPx(dp: Float): Float {
        return dp * context.resources.displayMetrics.density
    }
    
    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        android.util.Log.d("LiveTimerView", "❌ Detached from window")
        stopTimer()
        handler.removeCallbacksAndMessages(null)
    }
}