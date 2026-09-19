#import <React/RCTViewManager.h>

@interface RCT_EXTERN_MODULE(ImouVideoViewManager, RCTViewManager)
RCT_EXPORT_VIEW_PROPERTY(sessionId, NSString)
RCT_EXPORT_VIEW_PROPERTY(resizeMode, NSString)
RCT_EXPORT_VIEW_PROPERTY(onReady, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onError, RCTDirectEventBlock)
@end
