package com.pkt.pickletour

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class FacebookLivePackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(
            FacebookLiveModule(reactContext)
        )
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return listOf(
            RtmpPreviewViewManager(),
            RtmpSurfaceViewManager(),
            LiveTimerViewManager(),
            ScoreOverlayViewManager(),
            StreamStatsOverlayViewManager(),
            CountdownOverlayViewManager()
        )
    }
}
