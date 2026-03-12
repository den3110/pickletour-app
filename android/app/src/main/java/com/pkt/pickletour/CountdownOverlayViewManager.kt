package com.pkt.pickletour

import com.facebook.react.bridge.ReadableMap
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

/**
 * ViewManager for CountdownOverlayView
 */
class CountdownOverlayViewManager : SimpleViewManager<CountdownOverlayView>() {

    companion object {
        const val REACT_CLASS = "CountdownOverlayView"
    }

    override fun getName(): String = REACT_CLASS

    override fun createViewInstance(context: ThemedReactContext): CountdownOverlayView {
        return CountdownOverlayView(context)
    }

    @ReactProp(name = "mode")
    fun setMode(view: CountdownOverlayView, mode: String?) {
        mode?.let { view.setMode(it) }
    }

    @ReactProp(name = "duration")
    fun setDuration(view: CountdownOverlayView, duration: Double) {
        view.setDuration(duration.toLong())
    }

    @ReactProp(name = "isRunning")
    fun setIsRunning(view: CountdownOverlayView, running: Boolean) {
        if (running) {
            view.start()
        } else {
            view.stop()
        }
    }

    @ReactProp(name = "visible")
    fun setVisible(view: CountdownOverlayView, visible: Boolean) {
        view.visibility = if (visible) android.view.View.VISIBLE else android.view.View.GONE
    }

    override fun onDropViewInstance(view: CountdownOverlayView) {
        super.onDropViewInstance(view)
        view.stop()
    }
}
