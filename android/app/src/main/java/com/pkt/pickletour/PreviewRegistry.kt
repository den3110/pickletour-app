package com.pkt.pickletour

import com.pedro.library.view.OpenGlView

/**
 * Singleton registry to hold reference to OpenGlView for native module access
 */
object PreviewRegistry {
    @Volatile
    var openGlView: OpenGlView? = null
}
