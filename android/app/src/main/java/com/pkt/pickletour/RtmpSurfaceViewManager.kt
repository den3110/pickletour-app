package com.pkt.pickletour

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp
import com.pedro.library.view.OpenGlView

/**
 * ViewManager for RTMP Surface View (RtmpSurfaceView) - used by RtmpSurfaceView.tsx
 * This is an alias for RtmpPreviewView used in different components
 */
class RtmpSurfaceViewManager : SimpleViewManager<OpenGlView>() {

    companion object {
        const val REACT_CLASS = "RtmpSurfaceView"
    }

    override fun getName(): String = REACT_CLASS

    override fun createViewInstance(context: ThemedReactContext): OpenGlView {
        val view = OpenGlView(context)
        // Register view for native module access
        PreviewRegistry.openGlView = view
        return view
    }

    @ReactProp(name = "facing")
    fun setFacing(view: OpenGlView, facing: String?) {
        // Facing is handled by FacebookLiveModule.switchCamera()
    }

    @ReactProp(name = "autoPreview")
    fun setAutoPreview(view: OpenGlView, autoPreview: Boolean) {
        // Auto preview is handled by FacebookLiveModule
    }

    override fun onDropViewInstance(view: OpenGlView) {
        super.onDropViewInstance(view)
        if (PreviewRegistry.openGlView === view) {
            PreviewRegistry.openGlView = null
        }
    }
}
