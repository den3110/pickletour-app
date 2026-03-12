package com.pkt.pickletour

import com.facebook.react.bridge.ReadableMap
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

/**
 * ViewManager for ScoreOverlayView
 */
class ScoreOverlayViewManager : SimpleViewManager<ScoreOverlayView>() {

    companion object {
        const val REACT_CLASS = "ScoreOverlayView"
    }

    override fun getName(): String = REACT_CLASS

    override fun createViewInstance(context: ThemedReactContext): ScoreOverlayView {
        return ScoreOverlayView(context)
    }

    @ReactProp(name = "config")
    fun setConfig(view: ScoreOverlayView, config: ReadableMap?) {
        config?.let {
            val corner = if (it.hasKey("corner")) it.getString("corner") ?: "tl" else "tl"
            val scale = if (it.hasKey("scale")) it.getDouble("scale").toFloat() else 1f
            val marginX = if (it.hasKey("marginX")) it.getInt("marginX") else 16
            val marginY = if (it.hasKey("marginY")) it.getInt("marginY") else 16
            view.configureLayout(corner, scale, marginX, marginY)
        }
    }

    @ReactProp(name = "state")
    fun setState(view: ScoreOverlayView, state: ReadableMap?) {
        state?.let { view.updateState(it) }
    }

    override fun onDropViewInstance(view: ScoreOverlayView) {
        super.onDropViewInstance(view)
        view.clearCache()
    }
}
