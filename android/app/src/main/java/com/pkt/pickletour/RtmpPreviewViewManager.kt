package com.pkt.pickletour

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.pedro.library.view.OpenGlView

/**
 * ViewManager for RTMP Preview (OpenGlView from RootEncoder)
 */
class RtmpPreviewViewManager : SimpleViewManager<OpenGlView>() {

    companion object {
        const val REACT_CLASS = "RtmpPreviewView"
    }

    override fun getName(): String = REACT_CLASS

    override fun createViewInstance(context: ThemedReactContext): OpenGlView {
        val view = OpenGlView(context)
        // Register view for native module access
        PreviewRegistry.openGlView = view
        return view
    }

    override fun onDropViewInstance(view: OpenGlView) {
        super.onDropViewInstance(view)
        if (PreviewRegistry.openGlView === view) {
            PreviewRegistry.openGlView = null
        }
    }
}
