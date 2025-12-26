// FacebookLiveModule.swift - FIXED VERSION
// Fix crash khi zoom nhanh: debounce + queue + safety checks

import AVFoundation
import Foundation
import HaishinKit
import Logboard
import Metal
import React
import UIKit
import VideoToolbox
import WebKit

// MARK: - Logger
private let hkLogger = LBLogger.with("FacebookLiveModule")

// MARK: - FacebookLiveModule

@objc(FacebookLiveModule)
class FacebookLiveModule: RCTEventEmitter {

  // MARK: - Core RTMP

  private let connection = RTMPConnection()
  private let stream: RTMPStream

  // MARK: - State

  private var pendingPublishName: String?
  private var bitrateTimer: Timer?
  private var lastUrl: String?

  private var lastW: Int = 1280
  private var lastH: Int = 720
  private var lastFps: Int = 30
  private var lastBitrate: Int = 3_800_000

  private var autoRotate: Bool = false

  // Camera / Zoom - FIXED với debounce và queue
  private var currentPosition: AVCaptureDevice.Position = .back
  private var currentCamera: AVCaptureDevice?
  private var currentZoomUI: CGFloat = 1.0
  private var usingUltraWide: Bool = false
  private let switchDown: CGFloat = 0.85  // ✅ tăng gap để tránh switch liên tục
  private let switchUp: CGFloat = 1.15
  private let zoomRampRate: Float = 6.0   // ✅ giảm tốc độ ramp
  
  // ✅ NEW: Zoom operation queue & debounce
  private var zoomOperationQueue = DispatchQueue(label: "com.pickletour.zoom", qos: .userInteractive)
  private var pendingZoomOperation: DispatchWorkItem?
  private var isZoomInProgress: Bool = false
  private var lastZoomTime: CFTimeInterval = 0
  private let minZoomInterval: CFTimeInterval = 0.05  // min 50ms giữa các zoom operation

  // Orientation
  private enum ForcedOrientation {
    case auto, landscape, portrait
  }
  private var forcedOrientation: ForcedOrientation = .auto

  // MARK: - Overlay system (WKWebView → CIImage → VideoEffect)

  private var overlayWebView: WKWebView?
  private var overlayHost: UIView?
  private var overlayDisplayLink: CADisplayLink?

  // Snapshot cache
  private var overlayImageCache: CIImage?
  private var overlayVisible: Bool = false
  private var overlayWebViewReady: Bool = false
  private var overlayLoadCompletion: RCTPromiseResolveBlock?

  // NEW: event-driven, throttled capture
  private var overlayCaptureTimer: Timer?
  private var overlayDirty: Bool = false
  private var overlayCaptureInFlight: Bool = false
  private var lastOverlayCapture: CFTimeInterval = 0
  private var overlayMaxCaptureFPS: Double = 2.0

  private var overlayEffect: OverlayVideoEffect?

  // Debug counters
  private var captureNotVisibleLogCount = 0
  private var captureNotReadyLogCount = 0
  private var captureNilLogCount = 0
  private var captureFrameCount = 0
  private var snapshotNilImageCount = 0
  private var cacheUpdateCount = 0
  private var overlayCallCount = 0
  private var overlayNotVisibleCount = 0
  private var overlayNoCacheCount = 0
  private var overlayScaleLogCount = 0
  private var effectNoOverlayCount = 0
  private var effectCompositeCount = 0

  // MARK: - Thermal Protection

  private var thermalProtect: Bool = true
  private var currentThermalState: ProcessInfo.ThermalState = .nominal
  private var originalBitrate: Int = 0
  private var thermalObserver: NSObjectProtocol?

  // MARK: - Init / Deinit

  override init() {
    self.stream = RTMPStream(connection: connection)
    super.init()

    LBLogger.with(HaishinKitIdentifier).level = .warn
    hkLogger.level = .info

    connection.addEventListener(
      .rtmpStatus,
      selector: #selector(rtmpStatusHandler(_:)),
      observer: self
    )
    connection.addEventListener(
      .ioError,
      selector: #selector(rtmpErrorHandler(_:)),
      observer: self
    )

    NotificationCenter.default.addObserver(
      self,
      selector: #selector(orientationChanged),
      name: UIDevice.orientationDidChangeNotification,
      object: nil
    )
    UIDevice.current.beginGeneratingDeviceOrientationNotifications()

    hkLogger.info("FacebookLiveModule initialized")
  }

  deinit {
    UIDevice.current.endGeneratingDeviceOrientationNotifications()
    NotificationCenter.default.removeObserver(self)
    bitrateTimer?.invalidate()
    overlayDisplayLink?.invalidate()
    
    // ✅ Cancel pending zoom operations
    pendingZoomOperation?.cancel()
    
    cleanupOverlayResources()
    stopThermalMonitoring()
    hkLogger.info("FacebookLiveModule deinitialized")
  }

  // MARK: - React Native

  override static func requiresMainQueueSetup() -> Bool { true }

  override func supportedEvents() -> [String]! {
    return [
      "onConnectionStarted",
      "onConnectionSuccess",
      "onNewBitrate",
      "onConnectionFailed",
      "onDisconnect",
      "onAuthError",
      "onAuthSuccess",
    ]
  }

  // MARK: - Helpers

  private func ensureAudioSession() throws {
    let s = AVAudioSession.sharedInstance()
    try s.setCategory(
      .playAndRecord,
      mode: .videoRecording,
      options: [.defaultToSpeaker, .allowBluetooth, .mixWithOthers]
    )
    try s.setActive(true, options: [])
    hkLogger.info("AudioSession configured")
  }

  private func backWide() -> AVCaptureDevice? {
    if let d = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) {
      return d
    }
    let ds = AVCaptureDevice.DiscoverySession(
      deviceTypes: [
        .builtInDualCamera, .builtInDualWideCamera, .builtInTripleCamera,
        .builtInTelephotoCamera, .builtInWideAngleCamera,
      ],
      mediaType: .video,
      position: .back
    )
    return ds.devices.first
  }

  private func backUltra() -> AVCaptureDevice? {
    AVCaptureDevice.default(.builtInUltraWideCamera, for: .video, position: .back)
  }

  private func frontCam() -> AVCaptureDevice? {
    if let d = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front) {
      return d
    }
    let ds = AVCaptureDevice.DiscoverySession(
      deviceTypes: [.builtInWideAngleCamera],
      mediaType: .video,
      position: .front
    )
    return ds.devices.first
  }

  private func attachPreviewIfNeeded() {
    guard let hkView = IOSPreviewRegistry.hkView else {
      hkLogger.warn("Preview view not registered")
      return
    }

    DispatchQueue.main.async {
      hkView.attachStream(self.stream)
      hkView.setNeedsLayout()
      hkView.layoutIfNeeded()
      hkLogger.info("Preview attached")
    }
  }

  private func splitRtmpURL(_ full: String) -> (String, String)? {
    var s = full.trimmingCharacters(in: .whitespacesAndNewlines)
    if s.hasSuffix("/") { s.removeLast() }
    guard let idx = s.lastIndex(of: "/") else { return nil }
    let base = String(s[..<idx])
    let name = String(s[s.index(after: idx)...])
    return (base, name)
  }

  private func startBitrateTimer() {
    bitrateTimer?.invalidate()
    bitrateTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
      guard let self = self else { return }
      let bps = Int(Double(self.connection.currentBytesOutPerSecond) * 8.0)
      self.sendEvent(withName: "onNewBitrate", body: ["bitrate": bps])
    }
    if let t = bitrateTimer {
      RunLoop.main.add(t, forMode: .common)
    }
    hkLogger.debug("Bitrate timer started")
  }

  @objc private func orientationChanged() {
    guard autoRotate else { return }
  }

  private func debugStreamState() {
    hkLogger.info(
      """
      Stream:
        size=\(lastW)x\(lastH) fps=\(lastFps) bitrate=\(lastBitrate)
        camera=\(currentCamera?.localizedName ?? "nil")
      """
    )
  }

  // MARK: - Zoom Helpers - FIXED VERSION

  private func clampDeviceZoom(_ device: AVCaptureDevice, _ desired: CGFloat) -> CGFloat {
    let minF = device.minAvailableVideoZoomFactor
    let maxF = min(2.0, device.maxAvailableVideoZoomFactor)
    return max(minF, min(desired, maxF))
  }

  private func deviceZoomFactor(for device: AVCaptureDevice, uiZoom: CGFloat) -> CGFloat {
    var ui = max(0.5, min(2.0, uiZoom))
    if device.position == .front { ui = max(1.0, ui) }

    if device.deviceType == .builtInUltraWideCamera {
      let mapped = (ui <= 1.0) ? (ui * 2.0) : ui
      return clampDeviceZoom(device, mapped)
    }

    let mapped = max(1.0, ui)
    return clampDeviceZoom(device, mapped)
  }

  private func targetBackCameraFor(uiZoom: CGFloat) -> AVCaptureDevice? {
    guard currentPosition == .back else { return frontCam() }
    let wantUltra: Bool
    if uiZoom <= switchDown {
      wantUltra = true
    } else if uiZoom >= switchUp {
      wantUltra = false
    } else {
      wantUltra = usingUltraWide
    }
    usingUltraWide = wantUltra
    return wantUltra ? (backUltra() ?? backWide()) : (backWide() ?? backUltra())
  }

  // ✅ FIXED: Zoom với safety checks và serial execution
  private func ensureCameraAndRampZoom() {
    // Safety check
    guard !isZoomInProgress else {
      hkLogger.debug("Zoom already in progress, skipping")
      return
    }
    
    let now = CACurrentMediaTime()
    guard now - lastZoomTime >= minZoomInterval else {
      hkLogger.debug("Zoom too frequent, skipping")
      return
    }
    
    isZoomInProgress = true
    lastZoomTime = now
    
    let desired: AVCaptureDevice? =
      (currentPosition == .front) ? frontCam() : targetBackCameraFor(uiZoom: currentZoomUI)
    
    guard let target = desired else {
      isZoomInProgress = false
      return
    }

    let needSwitch = (currentCamera?.uniqueID != target.uniqueID)
    
    if needSwitch {
      hkLogger.info("Camera switch required: \(currentCamera?.localizedName ?? "nil") -> \(target.localizedName)")
      
      // ✅ Cancel any ongoing zoom ramp
      currentCamera?.cancelVideoZoomRamp()
      
      // ✅ Switch camera on main queue
      DispatchQueue.main.async { [weak self] in
        guard let self = self else { return }
        
        self.stream.attachCamera(target) { [weak self] error in
          guard let self = self else { return }
          
          if let error = error {
            hkLogger.error("attachCamera error: \(error)")
            self.isZoomInProgress = false
            return
          }
          
          self.currentCamera = target
          
          // ✅ Apply zoom after camera switch
          self.applyZoomToCamera(target)
        }
      }
    } else {
      // ✅ Same camera, just zoom
      applyZoomToCamera(target)
    }
  }
  
  // ✅ NEW: Separate method to apply zoom safely
  private func applyZoomToCamera(_ device: AVCaptureDevice) {
    guard device.lockForConfiguration() == nil else {
      do {
        try device.lockForConfiguration()
      } catch {
        hkLogger.error("Cannot lock camera for zoom: \(error)")
        isZoomInProgress = false
        return
      }
    }
    
    let z = deviceZoomFactor(for: device, uiZoom: currentZoomUI)
    
    // ✅ Cancel any pending ramp
    if device.isRampingVideoZoom {
      device.cancelVideoZoomRamp()
    }
    
    // ✅ Apply zoom with ramp
    device.ramp(toVideoZoomFactor: z, withRate: zoomRampRate)
    device.unlockForConfiguration()
    
    isZoomInProgress = false
  }

  // MARK: - Thermal Monitoring

  private func startThermalMonitoring() {
    guard #available(iOS 13.0, *), thermalProtect else { return }
    stopThermalMonitoring()
    thermalObserver = NotificationCenter.default.addObserver(
      forName: ProcessInfo.thermalStateDidChangeNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      self?.handleThermalChange()
    }
    handleThermalChange()
    hkLogger.debug("Thermal monitoring ON")
  }

  private func stopThermalMonitoring() {
    if let obs = thermalObserver {
      NotificationCenter.default.removeObserver(obs)
      thermalObserver = nil
      hkLogger.debug("Thermal monitoring OFF")
    }
  }

  @available(iOS 13.0, *)
  private func handleThermalChange() {
    let state = ProcessInfo.processInfo.thermalState
    guard state != currentThermalState else { return }
    currentThermalState = state
    guard originalBitrate > 0 else { return }

    let newBitrate: Int
    let newOverlayMaxFPS: Int

    switch state {
    case .critical:
      newBitrate = Int(Double(originalBitrate) * 0.3)
      newOverlayMaxFPS = 4
    case .serious:
      newBitrate = Int(Double(originalBitrate) * 0.5)
      newOverlayMaxFPS = 6
    case .fair:
      newBitrate = Int(Double(originalBitrate) * 0.7)
      newOverlayMaxFPS = 8
    case .nominal:
      newBitrate = originalBitrate
      newOverlayMaxFPS = 10
    @unknown default:
      return
    }

    lastBitrate = newBitrate
    var v = stream.videoSettings
    v.bitRate = UInt32(max(0, newBitrate))
    stream.videoSettings = v

    overlaySetFpsInternal(newOverlayMaxFPS)
    hkLogger.info("Thermal=\(state.rawValue) bitrate=\(newBitrate) overlayMaxFPS=\(newOverlayMaxFPS)")
  }

  // MARK: - Overlay helpers

  private func cleanupOverlayResources() {
    overlayDisplayLink?.invalidate()
    overlayDisplayLink = nil

    overlayCaptureTimer?.invalidate()
    overlayCaptureTimer = nil

    overlayImageCache = nil
    overlayWebViewReady = false
    overlayLoadCompletion = nil
    overlayVisible = false
    overlayDirty = false
    overlayCaptureInFlight = false

    hkLogger.debug("Overlay resources cleaned")
  }

  private func forceInitialCapture() {
    hkLogger.info("forceInitialCapture → mark overlayDirty")
    overlayDirty = true
  }

  // MARK: - RN overlay APIs

  @objc(overlayLoad:widthDp:heightDp:corner:scaleW:scaleH:marginXDp:marginYDp:resolver:rejecter:)
  func overlayLoad(
    _ url: String,
    widthDp: NSNumber,
    heightDp: NSNumber,
    corner: String,
    scaleW: NSNumber,
    scaleH: NSNumber,
    marginXDp: NSNumber,
    marginYDp: NSNumber,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {

    DispatchQueue.main.async { [weak self] in
      guard let self = self else {
        reject("OVERLAY_ERROR", "Module released", nil)
        return
      }

      self.overlayRemoveInternal()

      guard
        let windowScene = UIApplication.shared.connectedScenes
          .compactMap({ $0 as? UIWindowScene })
          .first(where: { $0.activationState == .foregroundActive }),
        let window = windowScene.windows.first(where: { $0.isKeyWindow })
      else {
        hkLogger.error("No keyWindow for overlay")
        reject("OVERLAY_ERROR", "No key window", nil)
        return
      }

      let scale = UIScreen.main.scale
      let targetW = (widthDp.intValue > 0 ? widthDp.intValue : self.lastW)
      let targetH = (heightDp.intValue > 0 ? heightDp.intValue : self.lastH)

      var finalURL = url
      if var comps = URLComponents(string: url) {
        var qs = comps.queryItems ?? []
        qs.append(URLQueryItem(name: "width", value: "\(targetW)"))
        qs.append(URLQueryItem(name: "height", value: "\(targetH)"))
        comps.queryItems = qs
        if let u = comps.url {
          finalURL = u.absoluteString
        }
      }

      let hostFrame = CGRect(
        x: -CGFloat(targetW) / scale - 20,
        y: -CGFloat(targetH) / scale - 20,
        width: CGFloat(targetW) / scale,
        height: CGFloat(targetH) / scale
      )

      let host = UIView(frame: hostFrame)
      host.backgroundColor = .clear
      host.isUserInteractionEnabled = false
      host.clipsToBounds = false
      window.addSubview(host)
      self.overlayHost = host

      hkLogger.info("Overlay host frame(off-screen)=\(hostFrame) target=\(targetW)x\(targetH)")

      let config = WKWebViewConfiguration()
      config.allowsInlineMediaPlayback = true
      config.mediaTypesRequiringUserActionForPlayback = []
      config.allowsPictureInPictureMediaPlayback = false
      config.preferences.javaScriptEnabled = true
      config.preferences.javaScriptCanOpenWindowsAutomatically = false
      if #available(iOS 14.0, *) {
        config.defaultWebpagePreferences.allowsContentJavaScript = true
      }

      let preScript = """
        (function() {
          function setupVisibilityHack() {
            try {
              Object.defineProperty(document, 'hidden', { get: () => false });
              Object.defineProperty(document, 'visibilityState', { get: () => 'visible' });
            } catch (e) {
              console.log('[Native] visibility patch error', e);
            }
          }

          function notifyChangedThrottled() {
            try {
              var now = Date.now();
              if (window.__overlayLastNotify && now - window.__overlayLastNotify < 400) {
                return;
              }
              window.__overlayLastNotify = now;
              if (window.webkit &&
                  window.webkit.messageHandlers &&
                  window.webkit.messageHandlers.overlayChanged) {
                window.webkit.messageHandlers.overlayChanged.postMessage('dirty');
              }
            } catch (e) {
              console.log('[Native] overlayChanged postMessage error', e);
            }
          }

          document.addEventListener('DOMContentLoaded', function() {
            try {
              setupVisibilityHack();
              const style = document.createElement('style');
              style.textContent = '*{animation-duration:0s !important;transition-duration:0s !important;}';
              document.head.appendChild(style);
            } catch (e) {
              console.log('[Native] DOMContentLoaded error', e);
            }

            try {
              const obs = new MutationObserver(function() {
                notifyChangedThrottled();
              });
              obs.observe(document.body || document.documentElement, {
                attributes: true,
                childList: true,
                subtree: true,
                characterData: true
              });
              notifyChangedThrottled();
            } catch (e) {
              console.log('[Native] MutationObserver error', e);
              notifyChangedThrottled();
            }
          });

          console.log('[Native] overlay bootstrap injected');
        })();
        """
      let script = WKUserScript(
        source: preScript,
        injectionTime: .atDocumentStart,
        forMainFrameOnly: true
      )
      config.userContentController.addUserScript(script)
      config.userContentController.add(self, name: "overlayChanged")

      let webView = WKWebView(frame: host.bounds, configuration: config)
      webView.isOpaque = false
      webView.backgroundColor = .clear
      webView.scrollView.isScrollEnabled = false
      webView.scrollView.backgroundColor = .clear
      webView.navigationDelegate = self

      host.addSubview(webView)
      self.overlayWebView = webView
      self.overlayLoadCompletion = resolve
      self.overlayWebViewReady = false
      self.overlayVisible = false
      self.overlayImageCache = nil
      self.overlayDirty = false

      guard let u = URL(string: finalURL) else {
        hkLogger.error("Invalid overlay URL: \(finalURL)")
        self.overlayRemoveInternal()
        reject("OVERLAY_URL", "Invalid URL", nil)
        return
      }

      hkLogger.info("Overlay loading url=\(finalURL)")
      webView.load(URLRequest(url: u))

      DispatchQueue.main.asyncAfter(deadline: .now() + 5.0) { [weak self] in
        guard let self = self else { return }
        if !self.overlayWebViewReady {
          hkLogger.warn("Overlay WebView timeout → start capture fallback")
          self.overlayWebViewReady = true
          self.forceInitialCapture()
          if let web = self.overlayWebView {
            let w = Int(web.bounds.width * UIScreen.main.scale)
            let h = Int(web.bounds.height * UIScreen.main.scale)
            self.overlayVisible = true
            self.startOverlayCapture(width: w, height: h)
          }
          self.overlayLoadCompletion?(nil)
          self.overlayLoadCompletion = nil
        }
      }
    }
  }

  @objc(overlaySetVisible:resolver:rejecter:)
  func overlaySetVisible(
    _ visible: Bool,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async { [weak self] in
      guard let self = self else {
        resolve(nil)
        return
      }
      self.overlayVisible = visible
      if !visible {
        self.overlayImageCache = nil
        self.overlayDirty = false
      } else {
        self.overlayDirty = true
      }
      hkLogger.info("Overlay visible=\(visible)")
      resolve(nil)
    }
  }

  @objc(overlaySetFps:)
  func overlaySetFps(_ fps: NSNumber) {
    overlaySetFpsInternal(fps.intValue)
  }

  private func overlaySetFpsInternal(_ fps: Int) {
    let clamped = max(1, min(10, fps))
    overlayMaxCaptureFPS = Double(clamped)
    hkLogger.debug("Overlay max capture FPS=\(overlayMaxCaptureFPS)")
  }

  @objc(overlayRemove:rejecter:)
  func overlayRemove(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async { [weak self] in
      self?.overlayRemoveInternal()
      resolve(nil)
    }
  }

  private func overlayRemoveInternal() {
    cleanupOverlayResources()

    if let effect = overlayEffect {
      _ = stream.unregisterVideoEffect(effect)
      overlayEffect = nil
    }

    if let web = overlayWebView {
      web.navigationDelegate = nil
      web.configuration.userContentController.removeScriptMessageHandler(forName: "overlayChanged")
      web.removeFromSuperview()
    }
    overlayWebView = nil
    overlayHost?.removeFromSuperview()
    overlayHost = nil

    hkLogger.info("Overlay removed")
  }

  // MARK: - Start lightweight overlay capture

  private func startOverlayCapture(width: Int, height: Int) {
    overlayCaptureTimer?.invalidate()
    overlayDisplayLink?.invalidate()
    overlayDisplayLink = nil

    guard overlayWebView != nil else {
      hkLogger.error("Cannot start capture: webView nil")
      return
    }

    if overlayEffect == nil {
      let effect = OverlayVideoEffect(module: self)
      overlayEffect = effect
      _ = stream.registerVideoEffect(effect)
      hkLogger.info("OverlayVideoEffect registered")
    }

    let timer = Timer.scheduledTimer(
      withTimeInterval: 0.25,
      repeats: true
    ) { [weak self] _ in
      self?.captureOverlayFrame()
    }
    RunLoop.main.add(timer, forMode: .common)
    overlayCaptureTimer = timer
    hkLogger.info("Overlay capture timer started size=\(width)x\(height) maxFPS=\(overlayMaxCaptureFPS)")
  }

  @objc private func captureOverlayFrame() {
    guard overlayVisible else {
      if captureNotVisibleLogCount < 3 {
        hkLogger.warn("captureOverlayFrame: overlay not visible")
        captureNotVisibleLogCount += 1
      }
      return
    }

    guard overlayWebViewReady else {
      if captureNotReadyLogCount < 3 {
        hkLogger.warn("captureOverlayFrame: webView not ready")
        captureNotReadyLogCount += 1
      }
      return
    }

    guard let webView = overlayWebView else {
      if captureNilLogCount < 3 {
        hkLogger.warn("captureOverlayFrame: webView nil")
        captureNilLogCount += 1
      }
      return
    }

    guard overlayDirty || overlayImageCache == nil else { return }

    let now = CACurrentMediaTime()
    let minInterval = 1.0 / overlayMaxCaptureFPS
    if now - lastOverlayCapture < minInterval { return }
    lastOverlayCapture = now

    if overlayCaptureInFlight {
      return
    }
    overlayCaptureInFlight = true

    let scale = UIScreen.main.scale
    let size = CGSize(
      width: webView.bounds.width * scale,
      height: webView.bounds.height * scale
    )

    captureFrameCount += 1
    if captureFrameCount % 60 == 0 {
      hkLogger.debug("captureOverlayFrame size=\(size)")
    }

    autoreleasepool {
      if #available(iOS 13.0, *) {
        let config = WKSnapshotConfiguration()
        config.rect = webView.bounds
        config.snapshotWidth = NSNumber(value: Double(size.width))

        webView.takeSnapshot(with: config) { [weak self] image, error in
          guard let self = self else { return }
          self.overlayCaptureInFlight = false

          if let error = error {
            hkLogger.error("Snapshot error: \(error.localizedDescription)")
            return
          }
          guard let image = image, let cg = image.cgImage else {
            if self.snapshotNilImageCount < 5 {
              hkLogger.warn("Snapshot returned nil")
              self.snapshotNilImageCount += 1
            }
            return
          }
          self.overlayImageCache = CIImage(cgImage: cg)
          self.cacheUpdateCount += 1
          self.overlayDirty = false
        }
      } else {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1.0
        format.opaque = false
        format.preferredRange = .standard

        let renderer = UIGraphicsImageRenderer(size: size, format: format)
        let image = renderer.image { ctx in
          webView.layer.render(in: ctx.cgContext)
        }

        self.overlayCaptureInFlight = false
        if let cg = image.cgImage {
          self.overlayImageCache = CIImage(cgImage: cg)
          self.overlayDirty = false
        }
      }
    }
  }

  func currentOverlayImage(for base: CIImage) -> CIImage? {
    overlayCallCount += 1
    if overlayCallCount % 60 == 0 {
      hkLogger.debug(
        "currentOverlayImage call visible=\(overlayVisible) cache=\(overlayImageCache != nil)")
    }

    guard overlayVisible else {
      if overlayNotVisibleCount < 3 {
        hkLogger.warn("currentOverlayImage: overlay not visible")
        overlayNotVisibleCount += 1
      }
      return nil
    }

    guard let overlay = overlayImageCache else {
      if overlayNoCacheCount < 5 {
        hkLogger.warn("currentOverlayImage: cache nil")
        overlayNoCacheCount += 1
      }
      return nil
    }

    let baseSize = base.extent.size
    let overlaySize = overlay.extent.size

    guard baseSize.width > 0, baseSize.height > 0,
      overlaySize.width > 0, overlaySize.height > 0
    else {
      return nil
    }

    let scale = min(
      baseSize.width / overlaySize.width,
      baseSize.height / overlaySize.height
    )

    let scaledW = overlaySize.width * scale
    let scaledH = overlaySize.height * scale

    let tx = (baseSize.width - scaledW) / 2.0
    let ty = (baseSize.height - scaledH) / 2.0

    let scaled = overlay.transformed(
      by: CGAffineTransform(scaleX: scale, y: scale)
    )
    let placed = scaled.transformed(
      by: CGAffineTransform(translationX: tx, y: ty)
    )

    if overlayScaleLogCount < 3 {
      hkLogger.debug(
        "Overlay fit center overlay=\(overlaySize) base=\(baseSize) scale=\(scale) tx=\(tx) ty=\(ty)"
      )
      overlayScaleLogCount += 1
    }

    return placed
  }

  // MARK: - Capability Queries

  @objc(suggestProfile:rejecter:)
  func suggestProfile(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let memGB = Double(ProcessInfo.processInfo.physicalMemory) / (1024 * 1024 * 1024)
    let cores = ProcessInfo.processInfo.processorCount

    var score = 50
    if #available(iOS 15.0, *) {
      score += 30
    } else if #available(iOS 14.0, *) {
      score += 20
    }
    score += min(cores * 5, 40)
    score += Int((memGB / 8.0) * 30)
    score = max(30, min(95, score))

    let can1080 = canSupport1080p()

    let profile: [String: Any]
    if can1080 && score >= 80 {
      profile = ["width": 1920, "height": 1080, "fps": 30, "bitrate": 4_500_000]
    } else if score >= 65 {
      profile = ["width": 1280, "height": 720, "fps": 24, "bitrate": 3_800_000]
    } else if score >= 55 {
      profile = ["width": 1280, "height": 720, "fps": 24, "bitrate": 3_000_000]
    } else {
      profile = ["width": 1280, "height": 720, "fps": 24, "bitrate": 2_800_000]
    }

    hkLogger.info("Suggested profile: \(profile)")
    resolve(profile)
  }

  @objc(canDo1080p:rejecter:)
  func canDo1080p(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    resolve(canSupport1080p())
  }

  private func canSupport1080p() -> Bool {
    guard let device = backWide() ?? frontCam() else { return false }
    return device.formats.contains { format in
      let d = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
      return (d.width == 1920 && d.height == 1080) || (d.width == 1080 && d.height == 1920)
    }
  }

  @objc(canDo720p60:rejecter:)
  func canDo720p60(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let memGB = Double(ProcessInfo.processInfo.physicalMemory) / (1024 * 1024 * 1024)
    let cores = ProcessInfo.processInfo.processorCount
    let can = (cores >= 6 && memGB >= 4.0)
    resolve(can)
  }

  @objc(getPerfScore:rejecter:)
  func getPerfScore(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let memGB = Double(ProcessInfo.processInfo.physicalMemory) / (1024 * 1024 * 1024)
    let cores = ProcessInfo.processInfo.processorCount

    var score = 50
    if #available(iOS 15.0, *) {
      score += 30
    } else if #available(iOS 14.0, *) {
      score += 20
    }
    score += min(cores * 5, 40)
    score += Int((memGB / 8.0) * 30)
    score = max(30, min(95, score))

    resolve(score)
  }

  // MARK: - Orientation Control

  @objc(lockOrientation:)
  func lockOrientation(_ mode: String) {
    let m = mode.uppercased()
    if m == "LANDSCAPE" {
      forcedOrientation = .landscape
    } else if m == "PORTRAIT" {
      forcedOrientation = .portrait
    } else {
      forcedOrientation = .auto
    }
    hkLogger.info("lockOrientation=\(forcedOrientation)")
  }

  @objc(enableAutoRotate:)
  func enableAutoRotate(_ on: Bool) {
    autoRotate = on
    hkLogger.info("autoRotate=\(on)")
  }

  // MARK: - Thermal Protect Control

  @objc(enableThermalProtect:)
  func enableThermalProtect(_ on: Bool) {
    thermalProtect = on
    if on {
      startThermalMonitoring()
    } else {
      stopThermalMonitoring()
    }
  }

  // MARK: - Release

  @objc(release:rejecter:)
  func release(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      hkLogger.info("Releasing module")

      // ✅ Cancel pending zoom
      self.pendingZoomOperation?.cancel()
      self.isZoomInProgress = false

      self.overlayRemoveInternal()
      self.stopThermalMonitoring()
      self.bitrateTimer?.invalidate()
      self.bitrateTimer = nil

      if self.connection.connected {
        self.stream.close()
        self.connection.close()
      }

      self.stream.attachCamera(nil)
      self.stream.attachAudio(nil)
      IOSPreviewRegistry.hkView?.attachStream(nil)

      resolve(nil)
    }
  }

  // MARK: - Preview

  @objc(startPreview:rejecter:)
  func startPreview(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      hkLogger.info("startPreview")

      do {
        try self.ensureAudioSession()

        self.stream.frameRate = Double(self.lastFps)

        if self.lastW >= 1920 || self.lastH >= 1080 {
          self.stream.sessionPreset = .hd1920x1080
        } else {
          self.stream.sessionPreset = .hd1280x720
        }

        var v = self.stream.videoSettings
        v.bitRate = UInt32(max(0, self.lastBitrate))
        v.maxKeyFrameIntervalDuration = 3
        v.profileLevel = String(kVTProfileLevel_H264_Main_AutoLevel)
        self.stream.videoSettings = v

        var a = self.stream.audioSettings
        a.bitRate = 128_000
        self.stream.audioSettings = a

        if let mic = AVCaptureDevice.default(for: .audio) {
          self.stream.attachAudio(mic)
        }

        self.currentCamera =
          (self.currentPosition == .front)
          ? self.frontCam()
          : self.targetBackCameraFor(uiZoom: self.currentZoomUI)

        guard let camera = self.currentCamera else {
          reject("CAMERA_ERROR", "No camera device", nil)
          return
        }

        self.stream.attachCamera(camera) { error in
          hkLogger.error("startPreview attachCamera error: \(error)")
          reject("PREVIEW_START_ERR", error.localizedDescription, error)
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
          self.ensureCameraAndRampZoom()
          self.attachPreviewIfNeeded()
          self.debugStreamState()
          resolve(nil)
        }
      } catch {
        hkLogger.error("startPreview error: \(error)")
        reject("PREVIEW_START_ERR", error.localizedDescription, error)
      }
    }
  }

  @objc(stopPreview:rejecter:)
  func stopPreview(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      hkLogger.info("stopPreview")
      
      // ✅ Cancel zoom operations
      self.pendingZoomOperation?.cancel()
      self.isZoomInProgress = false
      
      IOSPreviewRegistry.hkView?.attachStream(nil)
      self.stream.attachCamera(nil)
      self.stream.attachAudio(nil)
      resolve(nil)
    }
  }

  @objc(refreshPreview:rejecter:)
  func refreshPreview(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      self.attachPreviewIfNeeded()
      resolve(nil)
    }
  }

  // MARK: - Start/Stop Streaming

  @objc(start:bitrate:width:height:fps:resolver:rejecter:)
  func start(
    _ url: String,
    bitrate: NSNumber,
    width: NSNumber,
    height: NSNumber,
    fps: NSNumber,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {

    DispatchQueue.main.async {
      hkLogger.info("start stream \(url)")

      guard let parts = self.splitRtmpURL(url) else {
        reject("URL_PARSE_ERR", "Invalid RTMP(S) URL", nil)
        return
      }

      do { try self.ensureAudioSession() } catch {
        reject("AUDIO_SESSION_ERR", error.localizedDescription, error)
        return
      }

      self.lastUrl = url
      self.lastBitrate = bitrate.intValue
      self.lastW = width.intValue
      self.lastH = height.intValue
      self.lastFps = fps.intValue
      self.originalBitrate = self.lastBitrate

      if self.lastW >= 1920 || self.lastH >= 1080 {
        self.stream.sessionPreset = .hd1920x1080
      } else {
        self.stream.sessionPreset = .hd1280x720
      }

      self.stream.frameRate = Double(self.lastFps)

      var v = self.stream.videoSettings
      v.bitRate = UInt32(max(0, self.lastBitrate))
      v.maxKeyFrameIntervalDuration = 3
      v.profileLevel = String(kVTProfileLevel_H264_Main_AutoLevel)
      self.stream.videoSettings = v

      var a = self.stream.audioSettings
      a.bitRate = 128_000
      self.stream.audioSettings = a

      if let mic = AVCaptureDevice.default(for: .audio) {
        self.stream.attachAudio(mic)
      }

      self.currentCamera =
        (self.currentPosition == .front)
        ? self.frontCam()
        : self.targetBackCameraFor(uiZoom: self.currentZoomUI)

      guard let camera = self.currentCamera else {
        reject("CAMERA_ERROR", "No camera", nil)
        return
      }

      self.stream.attachCamera(camera) { error in
        hkLogger.error("start attachCamera error: \(error)")
        reject("CAMERA_ATTACH_ERROR", error.localizedDescription, error)
      }

      DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
        self.ensureCameraAndRampZoom()
        self.attachPreviewIfNeeded()

        let (base, publishName) = parts
        self.pendingPublishName = publishName

        self.sendEvent(withName: "onConnectionStarted", body: ["url": url])
        self.connection.connect(base)
        self.startBitrateTimer()
        self.startThermalMonitoring()
        self.debugStreamState()
        resolve(nil)
      }
    }
  }

  @objc(stop:rejecter:)
  func stop(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      hkLogger.info("stop stream")

      // ✅ Cancel zoom operations
      self.pendingZoomOperation?.cancel()
      self.isZoomInProgress = false

      self.overlayRemoveInternal()
      self.stopThermalMonitoring()
      self.bitrateTimer?.invalidate()
      self.bitrateTimer = nil

      self.stream.close()
      self.connection.close()

      self.stream.attachCamera(nil)
      self.stream.attachAudio(nil)
      IOSPreviewRegistry.hkView?.attachStream(nil)

      self.lastUrl = nil
      resolve(nil)
    }
  }

  // MARK: - Controls

  @objc(switchCamera:rejecter:)
  func switchCamera(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      // ✅ Cancel any ongoing zoom
      self.currentCamera?.cancelVideoZoomRamp()
      self.pendingZoomOperation?.cancel()
      self.isZoomInProgress = false
      
      self.currentPosition = (self.currentPosition == .back) ? .front : .back

      self.currentCamera =
        (self.currentPosition == .front)
        ? self.frontCam()
        : self.targetBackCameraFor(uiZoom: self.currentZoomUI)

      guard let camera = self.currentCamera else {
        reject("SWITCH_ERROR", "No camera", nil)
        return
      }

      self.stream.attachCamera(camera) { error in
        reject("SWITCH_ERROR", error.localizedDescription, error)
      }
      
      // ✅ Reset zoom sau khi switch
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
        self.ensureCameraAndRampZoom()
      }
      
      hkLogger.info("switchCamera -> \(self.currentPosition == .front ? "front" : "back")")
      resolve(nil)
    }
  }

  @objc(toggleTorch:resolver:rejecter:)
  func toggleTorch(
    _ on: Bool,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      guard let device = self.currentCamera, device.hasTorch else {
        resolve(nil)
        return
      }
      do {
        try device.lockForConfiguration()
        if on {
          try device.setTorchModeOn(level: AVCaptureDevice.maxAvailableTorchLevel)
        } else {
          device.torchMode = .off
        }
        device.unlockForConfiguration()
        hkLogger.info("Torch=\(on)")
        resolve(nil)
      } catch {
        reject("TORCH_ERROR", error.localizedDescription, error)
      }
    }
  }

  @objc(toggleMic:resolver:rejecter:)
  func toggleMic(
    _ on: Bool,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      if on {
        if let mic = AVCaptureDevice.default(for: .audio) {
          self.stream.attachAudio(mic)
        }
      } else {
        self.stream.attachAudio(nil)
      }
      hkLogger.info("Mic=\(on)")
      resolve(nil)
    }
  }

  // ✅ FIXED: setZoom với debounce
  @objc(setZoom:)
  func setZoom(_ factor: NSNumber) {
    let newZoom = max(0.5, min(2.0, CGFloat(truncating: factor)))
    
    // ✅ Cancel pending operation
    pendingZoomOperation?.cancel()
    
    // ✅ Create new debounced operation
    let work = DispatchWorkItem { [weak self] in
      guard let self = self else { return }
      
      DispatchQueue.main.async {
        self.currentZoomUI = newZoom
        self.ensureCameraAndRampZoom()
      }
    }
    
    pendingZoomOperation = work
    
    // ✅ Execute after short delay (debounce)
    zoomOperationQueue.asyncAfter(deadline: .now() + 0.05, execute: work)
  }

  @objc(setVideoBitrateOnFly:)
  func setVideoBitrateOnFly(_ bps: NSNumber) {
    DispatchQueue.main.async {
      var v = self.stream.videoSettings
      let intBps = Int(truncating: bps)
      v.bitRate = UInt32(max(0, intBps))
      self.stream.videoSettings = v
      self.lastBitrate = intBps
      hkLogger.info("Bitrate on fly=\(bps)")
    }
  }

  // MARK: - RTMP Events

  @objc private func rtmpStatusHandler(_ notification: Notification) {
    let e = Event.from(notification)
    guard
      let data = e.data as? ASObject,
      let code = data["code"] as? String
    else { return }

    hkLogger.info("RTMP status: \(code)")

    switch code {
    case RTMPConnection.Code.connectSuccess.rawValue:
      sendEvent(withName: "onConnectionSuccess", body: nil)
      if let name = pendingPublishName {
        stream.publish(name)
        pendingPublishName = nil
        hkLogger.info("Publishing: \(name)")
      }
    case RTMPConnection.Code.connectClosed.rawValue:
      sendEvent(withName: "onDisconnect", body: nil)
    case RTMPConnection.Code.connectRejected.rawValue:
      sendEvent(withName: "onAuthError", body: ["reason": "connectRejected"])
    default:
      if code.lowercased().contains("failed") {
        sendEvent(withName: "onConnectionFailed", body: ["reason": code])
      }
    }
  }

  @objc private func rtmpErrorHandler(_ notification: Notification) {
    hkLogger.error("RTMP IO Error")
    sendEvent(withName: "onConnectionFailed", body: ["reason": "ioError"])
  }
}

// MARK: - WKNavigationDelegate

extension FacebookLiveModule: WKNavigationDelegate {
  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    hkLogger.info("Overlay WebView didFinish url=\(webView.url?.absoluteString ?? "nil")")

    DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
      guard let self = self else { return }

      webView.setNeedsDisplay()
      webView.layoutIfNeeded()

      webView.evaluateJavaScript("document.body.innerHTML.length") { result, error in
        if let error = error {
          hkLogger.error("Overlay JS length error: \(error.localizedDescription)")
        } else {
          hkLogger.info("Overlay HTML length=\(result ?? 0)")
        }
      }

      DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { [weak self] in
        guard let self = self else { return }

        self.overlayWebViewReady = true
        hkLogger.info("overlayWebViewReady = true")

        self.forceInitialCapture()

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
          guard let self = self else { return }

          if let web = self.overlayWebView {
            let w = Int(web.bounds.width * UIScreen.main.scale)
            let h = Int(web.bounds.height * UIScreen.main.scale)
            self.overlayVisible = true
            self.startOverlayCapture(width: w, height: h)
            hkLogger.info("Overlay system fully initialized size=\(w)x\(h)")
          }

          self.overlayLoadCompletion?(nil)
          self.overlayLoadCompletion = nil
        }
      }
    }
  }

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    hkLogger.error("Overlay WebView load failed: \(error.localizedDescription)")
    overlayLoadCompletion?(["error": error.localizedDescription])
    overlayLoadCompletion = nil
  }

  func webView(
    _ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!,
    withError error: Error
  ) {
    hkLogger.error("Overlay WebView provisional load failed: \(error.localizedDescription)")
    overlayLoadCompletion?(["error": error.localizedDescription])
    overlayLoadCompletion = nil
  }
}

// MARK: - WKScriptMessageHandler

extension FacebookLiveModule: WKScriptMessageHandler {
  func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
    if message.name == "overlayChanged" {
      overlayDirty = true
    }
  }
}

// MARK: - OverlayVideoEffect

final class OverlayVideoEffect: VideoEffect {
  weak var module: FacebookLiveModule?
  private var noOverlayCount = 0
  private var compositeCount = 0

  init(module: FacebookLiveModule) {
    self.module = module
    super.init()
  }

  override func execute(_ image: CIImage, info: CMSampleBuffer?) -> CIImage {
    guard let overlay = module?.currentOverlayImage(for: image) else {
      if noOverlayCount < 5 {
        hkLogger.warn("OverlayVideoEffect.execute: no overlay")
        noOverlayCount += 1
      }
      return image
    }

    guard let filter = CIFilter(name: "CISourceOverCompositing") else {
      hkLogger.error("CISourceOverCompositing not available")
      return image
    }

    filter.setValue(overlay, forKey: kCIInputImageKey)
    filter.setValue(image, forKey: kCIInputBackgroundImageKey)

    guard let result = filter.outputImage else {
      hkLogger.error("Overlay filter output nil")
      return image
    }

    if compositeCount < 5 {
      hkLogger.info(
        "Overlay composited OK input=\(image.extent) overlay=\(overlay.extent) out=\(result.extent)"
      )
      compositeCount += 1
    }

    return result
  }
}