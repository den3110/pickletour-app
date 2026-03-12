package com.pkt.pickletour

import java.lang.ref.WeakReference

/**
 * Singleton registry to hold StreamStatsOverlayView references for native module updates
 */
object StreamStatsOverlayRegistry {
    private val views = mutableListOf<WeakReference<StreamStatsOverlayView>>()

    fun register(view: StreamStatsOverlayView) {
        // Clean up stale references
        views.removeAll { it.get() == null }
        // Add new reference
        views.add(WeakReference(view))
    }

    fun unregister(view: StreamStatsOverlayView) {
        views.removeAll { it.get() == null || it.get() === view }
    }

    fun updateAll(
        uploadBps: Long,
        downloadBps: Long,
        totalTx: Long,
        totalRx: Long,
        bitrate: Long,
        fps: Int,
        resolution: String,
        networkType: String,
        droppedFrames: Int,
        isRecording: Boolean
    ) {
        views.forEach { ref ->
            ref.get()?.post {
                ref.get()?.updateStats(
                    uploadBps,
                    downloadBps,
                    totalTx,
                    totalRx,
                    bitrate,
                    fps,
                    resolution,
                    networkType,
                    droppedFrames,
                    isRecording
                )
            }
        }
    }

    fun getActiveView(): StreamStatsOverlayView? {
        views.removeAll { it.get() == null }
        return views.lastOrNull()?.get()
    }
}
