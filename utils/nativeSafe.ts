// utils/nativeSafe.ts
import { Platform, NativeModules, NativeEventEmitter, UIManager } from 'react-native';

/**
 * ✅ Safe wrapper cho tất cả native modules và components
 * Tự động return null trên iOS, không crash app
 */

/* ==================== HELPERS ==================== */

function getSafeNativeModule<T = any>(moduleName: string): T | null {
  if (Platform.OS !== 'android') {
    return null;
  }

  try {
    const module = NativeModules[moduleName];
    if (!module) {
      if (__DEV__) {
        console.warn(`[NativeSafe] Module "${moduleName}" not found`);
      }
      return null;
    }
    return module as T;
  } catch (error) {
    if (__DEV__) {
      console.error(`[NativeSafe] Error loading module "${moduleName}":`, error);
    }
    return null;
  }
}

function getSafeNativeComponent(componentName: string): any {
  if (Platform.OS !== 'android') {
    return null;
  }

  try {
    (UIManager as any).getViewManagerConfig?.(componentName);
    
    const cachedKey = `__${componentName}`;
    
    if (!(global as any)[cachedKey]) {
      const { requireNativeComponent } = require('react-native');
      (global as any)[cachedKey] = requireNativeComponent(componentName);
    }
    
    return (global as any)[cachedKey];
  } catch (error) {
    if (__DEV__) {
      console.error(`[NativeSafe] Error loading component "${componentName}":`, error);
    }
    return null;
  }
}

/* ==================== EXPORTS ==================== */

// Facebook Live Module
export const FacebookLiveModule = getSafeNativeModule("FacebookLiveModule");
export const LiveEmitter = FacebookLiveModule 
  ? new NativeEventEmitter(FacebookLiveModule)
  : null;

// Native Components
export const RtmpPreviewView = getSafeNativeComponent('RtmpPreviewView');
export const CountdownOverlayView = getSafeNativeComponent('CountdownOverlayView');

// Availability checks
export const isFacebookLiveAvailable = Platform.OS === 'android' && !!FacebookLiveModule;
export const isRtmpPreviewAvailable = Platform.OS === 'android' && !!RtmpPreviewView;
export const isCountdownOverlayAvailable = Platform.OS === 'android' && !!CountdownOverlayView;

// Legacy exports for backward compatibility
export const Live = FacebookLiveModule;