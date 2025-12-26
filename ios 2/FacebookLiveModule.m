// ios/FacebookLiveModule.m
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(FacebookLiveModule, RCTEventEmitter)

RCT_EXTERN_METHOD(startPreview:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(stopPreview:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(start:(NSString *)url
                  bitrate:(nonnull NSNumber *)bitrate
                  width:(nonnull NSNumber *)width
                  height:(nonnull NSNumber *)height
                  fps:(nonnull NSNumber *)fps
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(stop:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(switchCamera:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(toggleTorch:(BOOL)on
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(toggleMic:(BOOL)on
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(setVideoBitrateOnFly:(nonnull NSNumber *)bps)

RCT_EXTERN_METHOD(enableAutoRotate:(BOOL)on)
RCT_EXTERN_METHOD(setZoom:(nonnull NSNumber *)factor)

// NEW: Overlay methods
RCT_EXTERN_METHOD(overlayLoad:(NSString *)url
                  widthDp:(nonnull NSNumber *)widthDp
                  heightDp:(nonnull NSNumber *)heightDp
                  corner:(NSString *)corner
                  scaleW:(nonnull NSNumber *)scaleW
                  scaleH:(nonnull NSNumber *)scaleH
                  marginXDp:(nonnull NSNumber *)marginXDp
                  marginYDp:(nonnull NSNumber *)marginYDp
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(overlaySetVisible:(BOOL)visible
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(overlaySetFps:(nonnull NSNumber *)fps)

RCT_EXTERN_METHOD(overlayRemove:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

// NEW: Thermal & capability methods
RCT_EXTERN_METHOD(enableThermalProtect:(BOOL)on)

RCT_EXTERN_METHOD(lockOrientation:(NSString *)mode)

RCT_EXTERN_METHOD(suggestProfile:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(canDo1080p:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(canDo720p60:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getPerfScore:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(release:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end