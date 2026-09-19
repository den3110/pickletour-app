// ImouVideoViewManager.swift — RN ViewManager for <ImouVideoView />.
//
// Hosts an AVSampleBufferDisplayLayer. The HEVCRenderer pushes
// CMSampleBuffers into it for hardware decode + render. Audio is
// played in parallel by AACRenderer (see ImouNativeModule).

import UIKit
import AVFoundation
import AVKit
import React

public final class ImouVideoView: UIView {
  private(set) public var displayLayer = AVSampleBufferDisplayLayer()
  /// Lazy PiP controller — created the first time JS calls startPiP for
  /// this view's sessionId.
  public var pipController: AVPictureInPictureController?

  @objc public var onReady: RCTDirectEventBlock?
  @objc public var onError: RCTDirectEventBlock?
  @objc public var sessionId: NSString? { didSet { attachSession() } }
  @objc public var resizeMode: NSString = "contain" {
    didSet { applyResizeMode() }
  }

  public override init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = .black
    displayLayer.frame = bounds
    displayLayer.backgroundColor = UIColor.black.cgColor
    // GREEN-FLASH FIX (live): VTDecompressionSession + AVSampleBufferDisplayLayer
    // present 1-3 frame đầu với colorspace chưa locked → green tint. Ẩn layer
    // tới khi đã enqueue ≥ warmupFrames, lúc đó decoder steady state. Wrapper
    // view màu đen → user thấy "khung đen" thay vì "khung xanh" trong ~200ms.
    displayLayer.isHidden = true
    applyResizeMode()
    layer.addSublayer(displayLayer)
    // Install a control timebase. Set rate=0 initially — the renderer
    // starts the timebase when the first sample's PTS arrives (Apple
    // sample-code pattern). Without an explicit, properly-started
    // timebase the layer presents samples ASAP on iOS 17 (sbuf queue
    // stays empty, max PTS nan), which visually looks like "load từng
    // giây" stutter when chunks arrive in small TCP bursts.
    var timebase: CMTimebase?
    let st = CMTimebaseCreateWithSourceClock(
      allocator: kCFAllocatorDefault,
      sourceClock: CMClockGetHostTimeClock(),
      timebaseOut: &timebase
    )
    if st == noErr, let tb = timebase {
      CMTimebaseSetTime(tb, time: .zero)
      CMTimebaseSetRate(tb, rate: 0.0)
      displayLayer.controlTimebase = tb
    }
    // Register globally so the native module's Player can find this view
    // by sessionId.
    ImouVideoViewRegistry.shared.attach(view: self)
  }
  required init?(coder: NSCoder) { fatalError() }

  public override func layoutSubviews() {
    super.layoutSubviews()
    displayLayer.frame = bounds
  }

  deinit {
    ImouVideoViewRegistry.shared.detach(view: self)
  }

  /// Renderer gọi sau khi đã enqueue đủ warmup frames để fade-in layer (chống
  /// green-flash đầu live). Idempotent — gọi nhiều lần OK.
  public func revealLayer() {
    DispatchQueue.main.async { [weak self] in
      guard let self = self, self.displayLayer.isHidden else { return }
      self.displayLayer.isHidden = false
    }
  }

  private func attachSession() {
    let sid = (sessionId as String?) ?? ""
    guard !sid.isEmpty else { return }
    // Mỗi lần đổi session → reset cờ ẩn (HD/SD switch, playback ↔ live).
    displayLayer.isHidden = true
    ImouVideoViewRegistry.shared.notifySessionAssigned(view: self, sessionId: sid)
    // Connect this view's displayLayer to the Player's renderer so frames
    // start showing up. Player created up-front in startLive/startPlayback
    // → its renderer exists by the time the view mounts.
    if let player = Player.get(sid) {
      player.renderer.displayLayer = displayLayer
      player.renderer.imouView = self
      onReady?([:])
    } else {
      // Player not yet created (race) — retry briefly.
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
        guard let self = self,
              let p = Player.get(sid) else { return }
        p.renderer.displayLayer = self.displayLayer
        p.renderer.imouView = self
        self.onReady?([:])
      }
    }
  }

  private func applyResizeMode() {
    let mode = resizeMode as String
    if mode == "cover" {
      displayLayer.videoGravity = .resizeAspectFill
    } else if mode == "stretch" {
      displayLayer.videoGravity = .resize
    } else {
      displayLayer.videoGravity = .resizeAspect
    }
  }
}

/// Tracks ImouVideoView ↔ sessionId bindings so the native module can
/// retrieve the right HEVCRenderer when starting a Player session.
public final class ImouVideoViewRegistry {
  public static let shared = ImouVideoViewRegistry()
  private var bySession: [String: WeakBox<ImouVideoView>] = [:]
  private var all: [WeakBox<ImouVideoView>] = []
  private let lock = NSLock()

  public func attach(view: ImouVideoView) {
    lock.lock(); all.append(WeakBox(view)); lock.unlock()
  }
  public func detach(view: ImouVideoView) {
    lock.lock()
    all.removeAll { $0.value === view }
    bySession = bySession.filter { _, box in box.value !== view }
    lock.unlock()
  }
  public func notifySessionAssigned(view: ImouVideoView, sessionId: String) {
    lock.lock()
    bySession[sessionId] = WeakBox(view)
    lock.unlock()
  }
  public func view(forSessionId sid: String) -> ImouVideoView? {
    lock.lock(); defer { lock.unlock() }
    return bySession[sid]?.value
  }
}

final class WeakBox<T: AnyObject> {
  weak var value: T?
  init(_ v: T?) { self.value = v }
}

@objc(ImouVideoViewManager)
public final class ImouVideoViewManager: RCTViewManager {
  public override static func requiresMainQueueSetup() -> Bool { true }
  public override func view() -> UIView! { return ImouVideoView() }
}
