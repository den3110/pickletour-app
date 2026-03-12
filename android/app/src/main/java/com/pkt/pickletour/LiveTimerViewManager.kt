package com.pkt.pickletour

import com.facebook.react.bridge.ReadableMap
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

/**
 * ViewManager for LiveTimerView
 */
class LiveTimerViewManager : SimpleViewManager<LiveTimerView>() {

    companion object {
        const val REACT_CLASS = "LiveTimerView"
    }

    override fun getName(): String = REACT_CLASS

    override fun createViewInstance(context: ThemedReactContext): LiveTimerView {
        return LiveTimerView(context)
    }

    @ReactProp(name = "isRunning")
    fun setIsRunning(view: LiveTimerView, running: Boolean) {
        if (running) {
            // Start with current time if not already set
            view.startTimer(System.currentTimeMillis())
        } else {
            view.stopTimer()
        }
    }

    @ReactProp(name = "startTime")
    fun setStartTime(view: LiveTimerView, startTime: Double) {
        view.startTimer(startTime.toLong())
    }

    override fun onDropViewInstance(view: LiveTimerView) {
        super.onDropViewInstance(view)
        view.stopTimer()
    }
}
