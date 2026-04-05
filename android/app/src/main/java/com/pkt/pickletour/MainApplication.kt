package com.pkt.pickletour

import android.app.Application
import android.content.Context
import android.content.res.Configuration
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint
import com.facebook.react.defaults.DefaultReactNativeHost
import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ExpoReactHostFactory

class MainApplication : Application(), ReactApplication {
  private val jsMainModulePath = ".expo/.virtual-metro-entry"

  override val reactNativeHost: ReactNativeHost =
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> =
            PackageList(this).packages.apply {
              // Packages that cannot be autolinked yet can be added manually here, for example:
              // add(FacebookLivePackage()) // disabled - no longer using Facebook Live native module
            }

        override fun getJSMainModuleName(): String = jsMainModulePath

        override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

        override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED

        override fun getJSBundleFile(): String? =
            resolveHotUpdaterBundleFile() ?: super.getJSBundleFile()
      }

  override val reactHost: ReactHost
    get() =
        ExpoReactHostFactory.getDefaultReactHost(
            context = applicationContext,
            packageList = PackageList(reactNativeHost).packages,
            jsMainModulePath = jsMainModulePath,
            jsBundleFilePath = resolveHotUpdaterBundleFile(),
            useDevSupport = BuildConfig.DEBUG,
        )

  override fun onCreate() {
    super.onCreate()
    DefaultNewArchitectureEntryPoint.releaseLevel =
        try {
          ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
        } catch (e: IllegalArgumentException) {
          ReleaseLevel.STABLE
        }
    loadReactNative(this)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }

  private fun resolveHotUpdaterBundleFile(): String? =
      runCatching {
            val hotUpdaterClass = Class.forName("com.hotupdater.HotUpdater")
            val bundleMethod =
                hotUpdaterClass.methods.firstOrNull { method ->
                  method.name == "getJSBundleFile" &&
                      method.parameterTypes.contentEquals(arrayOf(Context::class.java))
                }

            if (bundleMethod != null) {
              bundleMethod.invoke(null, applicationContext) as? String
            } else {
              val companion = hotUpdaterClass.getField("Companion").get(null)
              val companionMethod =
                  companion.javaClass.getMethod("getJSBundleFile", Context::class.java)
              companionMethod.invoke(companion, applicationContext) as? String
            }
          }
          .getOrNull()
}
