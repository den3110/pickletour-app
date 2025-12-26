// ios/RtmpPreviewViewManager.swift
// ✅ FIXED: videoGravity = .resizeAspect để preview khớp với stream FB Live

import Foundation
import HaishinKit
import AVFoundation
import React

// Giống Android PreviewRegistry: giữ tham chiếu view preview
@objc class IOSPreviewRegistry: NSObject {
  @objc static var hkView: MTHKView?
}

@objc(RtmpPreviewViewManager)
class RtmpPreviewViewManager: RCTViewManager {
  override static func requiresMainQueueSetup() -> Bool { true }
  
  override func view() -> UIView! {
    let v = MTHKView(frame: .zero) // Metal view
    
    // ✅ FIX: Đổi từ .resizeAspectFill sang .resizeAspect
    // - .resizeAspectFill: crop video để fill view (KHÔNG thấy full frame)
    // - .resizeAspect: letterbox, giữ nguyên aspect ratio, thấy ĐÚNG cái FB nhận
    // - .resize: stretch full (méo hình nếu aspect ratio khác)
    v.videoGravity = .resizeAspect
    
    IOSPreviewRegistry.hkView = v
    return v
  }
  
  deinit {
    if let v = IOSPreviewRegistry.hkView {
      if v.superview == nil {
        IOSPreviewRegistry.hkView = nil
      }
    }
  }
}