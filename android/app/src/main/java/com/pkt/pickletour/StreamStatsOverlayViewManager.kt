package com.pkt.pickletour

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

/**
 * ViewManager for StreamStatsOverlayView
 */
class StreamStatsOverlayViewManager : SimpleViewManager<StreamStatsOverlayView>() {

    companion object {
        const val REACT_CLASS = "StreamStatsOverlayView"
    }

    override fun getName(): String = REACT_CLASS

    override fun createViewInstance(context: ThemedReactContext): StreamStatsOverlayView {
        val view = StreamStatsOverlayView(context)
        StreamStatsOverlayRegistry.register(view)
        return view
    }

    @ReactProp(name = "visible")
    fun setVisible(view: StreamStatsOverlayView, visible: Boolean) {
        view.visibility = if (visible) android.view.View.VISIBLE else android.view.View.GONE
    }

    @ReactProp(name = "position")
    fun setPosition(view: StreamStatsOverlayView, position: String?) {
        position?.let {
            val pos = when (it.uppercase()) {
                "TOP_LEFT" -> StreamStatsOverlayView.Position.TOP_LEFT
                "TOP_RIGHT" -> StreamStatsOverlayView.Position.TOP_RIGHT
                "BOTTOM_LEFT" -> StreamStatsOverlayView.Position.BOTTOM_LEFT
                "BOTTOM_RIGHT" -> StreamStatsOverlayView.Position.BOTTOM_RIGHT
                else -> StreamStatsOverlayView.Position.TOP_RIGHT
            }
            view.setPosition(pos)
        }
    }

    override fun onDropViewInstance(view: StreamStatsOverlayView) {
        super.onDropViewInstance(view)
        StreamStatsOverlayRegistry.unregister(view)
        view.cleanup()
    }
}
