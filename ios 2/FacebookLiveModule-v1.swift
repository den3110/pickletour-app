// FacebookLiveModule.swift
// ✅ NATIVE OVERLAY: ScoreOverlayView thay WKWebView
// Zoom debounce + orientation lock + overlay fit video size (HaishinKit 1.6.2)

import AVFoundation
import CoreImage
import Foundation
import HaishinKit
import Logboard
import Metal
import React
import UIKit
import VideoToolbox

// MARK: - Logger
private let hkLogger = LBLogger.with("FacebookLiveModule")

// MARK: - FacebookLiveModule

@objc(FacebookLiveModule)
class FacebookLiveModule: RCTEventEmitter {

  // MARK: - Core RTMP

  private let connection = RTMPConnection()
  private let stream: RTMPStream
  // ✅ THÊM DÒNG NÀY:
  private let recorder = HKStreamRecorder()

  // MARK: - State

  private var pendingPublishName: String?
  private var bitrateTimer: Timer?
  private var lastUrl: String?

  private var lastW: Int = 1280
  private var lastH: Int = 720
  private var lastFps: Int = 30
  private var lastBitrate: Int = 3_800_000

  private var autoRotate: Bool = false

  // 👉 THÊM: Stream stats overlay (network)
  private var statsStartTime: TimeInterval = 0
  private var statsTotalBytesSent: Int64 = 0
  private var statsTotalBytesReceived: Int64 = 0  // hiện chưa đo download, sẽ tăng sau nếu cần

  // Camera / Zoom
  private var currentPosition: AVCaptureDevice.Position = .back
  private var currentCamera: AVCaptureDevice?
  private var currentZoomUI: CGFloat = 1.0
  private var usingUltraWide: Bool = false
  private let switchDown: CGFloat = 0.85
  private let switchUp: CGFloat = 1.15
  private let zoomRampRate: Float = 6.0

  private var zoomOperationQueue = DispatchQueue(
    label: "com.pickletour.zoom", qos: .userInteractive)
  private var pendingZoomOperation: DispatchWorkItem?
  private var isZoomInProgress: Bool = false
  private var lastZoomTime: CFTimeInterval = 0
  private let minZoomInterval: CFTimeInterval = 0.05

  // Orientation
  private enum ForcedOrientation {
    case auto, landscape, portrait
  }
  private var forcedOrientation: ForcedOrientation = .auto

  // MARK: - ✅ NATIVE Overlay System (ScoreOverlayView)

  private var overlayNativeView: ScoreOverlayView?
  private var overlayHostContainer: UIView?

  // Snapshot cache
  private var overlayImageCache: CIImage?
  private var overlayVisible: Bool = false  // Visible on STREAM
  private var overlayVisibleOnPreview: Bool = true  // ✅ NEW: Visible on PREVIEW only
  private var overlayNativeReady: Bool = false
  private var overlayLoadCompletion: RCTPromiseResolveBlock?

  // Event-driven capture
  private var overlayCaptureTimer: Timer?
  private var overlayDirty: Bool = false
  private var overlayCaptureInFlight: Bool = false
  private var lastOverlayCapture: CFTimeInterval = 0
  private var overlayMaxCaptureFPS: Double = 10.0

  private var overlayEffect: OverlayVideoEffect?

  // Debug counters
  private var captureNotVisibleLogCount = 0
  private var captureNotReadyLogCount = 0
  private var captureNilLogCount = 0
  private var captureFrameCount = 0
  private var cacheUpdateCount = 0
  private var overlayCallCount = 0
  private var overlayNotVisibleCount = 0
  private var overlayNoCacheCount = 0
  private var overlayScaleLogCount = 0

  // MARK: - Thermal Protection

  private var thermalProtect: Bool = true
  private var currentThermalState: ProcessInfo.ThermalState = .nominal
  private var originalBitrate: Int = 0
  private var thermalObserver: NSObjectProtocol?

  private var isRecording: Bool = false
  private var recordingPath: String?
  private var recordingStartTime: TimeInterval = 0
  private var recordingChunkIndex: Int = 0
  private var recordingChunkDurationMs: Int = 60_000  // 60s như Android

  private var recordingTimer: Timer?
  private var recordingMatchId: String?

  // MARK: - Init / Deinit

  override init() {
    self.stream = RTMPStream(connection: connection)
    super.init()
    // ✅ THÊM DÒNG NÀY ĐỂ KÍCH HOẠT TÍNH NĂNG GHI FILE:
    self.stream.addOutput(self.recorder)

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
      "onRecordingChunkComplete",  // ✅ THÊM
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

    // ✅ FIX (HaishinKit 1.6.2): Set Sample Rate ở đây
    try s.setPreferredSampleRate(44_100)

    try s.setActive(true, options: [])
    hkLogger.info("AudioSession configured (44.1kHz preferred)")
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

    // reset stats
    statsStartTime = Date().timeIntervalSince1970
    statsTotalBytesSent = 0
    statsTotalBytesReceived = 0

    bitrateTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
      guard let self = self else { return }

      // Bytes/s -> bps
      let bytesOutPerSec = Int64(self.connection.currentBytesOutPerSecond)
      let uploadBps = Int(bytesOutPerSec * 8)

      // Cộng dồn total TX (approx)
      self.statsTotalBytesSent += bytesOutPerSec

      // Gửi event cũ cho JS (không thay đổi behaviour)
      self.sendEvent(withName: "onNewBitrate", body: ["bitrate": uploadBps])

      // Tính duration
      let duration = Int64(Date().timeIntervalSince1970 - self.statsStartTime)

      // Tạo payload stats cho overlay
      let data = StreamStatsOverlayData(
        uploadBps: Int64(uploadBps),
        downloadBps: 0,  // hiện iOS pub RTMP gần như không có download đáng kể, tạm để 0
        totalTx: self.statsTotalBytesSent,
        totalRx: self.statsTotalBytesReceived,
        durationSec: duration,
        bitrate: Int64(self.lastBitrate),
        fps: self.lastFps,
        resolution: "\(self.lastW)x\(self.lastH)",
        netType: "Unknown",  // TODO: có thể dùng NWPathMonitor để detect wifi/4G/5G
        droppedFrames: 0,  // TODO: nếu cần, có thể đọc thêm từ HaishinKit
        recording: false  // TODO: sau này nếu có flag recording, truyền thật vào đây
      )

      StreamStatsOverlayRegistry.shared.updateStats(data)
    }

    if let t = bitrateTimer {
      RunLoop.main.add(t, forMode: .common)
    }
    hkLogger.debug("Bitrate timer + stats overlay started")
  }

  @objc private func orientationChanged() {
    guard autoRotate else { return }
    updateStreamOrientation()
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

  // MARK: - Recording helpers

  private func recordingsDirectory() -> URL? {
    let fm = FileManager.default

    if let dir = fm.urls(for: .documentDirectory, in: .userDomainMask).first {
      let recDir = dir.appendingPathComponent("recordings", isDirectory: true)
      if !fm.fileExists(atPath: recDir.path) {
        do {
          try fm.createDirectory(at: recDir, withIntermediateDirectories: true, attributes: nil)
        } catch {
          hkLogger.error("Cannot create recordings dir: \(error)")
          return nil
        }
      }
      return recDir
    }
    return nil
  }

  private func generateRecordingPath(matchId: String?, index: Int) -> String? {
    guard let dir = recordingsDirectory() else { return nil }
    let ts = Int(Date().timeIntervalSince1970 * 1000)
    let mid = matchId ?? "unknown"
    let suffix = index > 0 ? "_part\(index)" : ""
    let fileName = "live_\(mid)_\(ts)\(suffix).mp4"
    return dir.appendingPathComponent(fileName).path
  }

  private func emitChunkEvent(
    path: String,
    index: Int,
    isFinal: Bool,
    matchId: String?
  ) {
    let fm = FileManager.default
    var fileSizeMB: Double = 0
    if let attrs = try? fm.attributesOfItem(atPath: path),
      let size = attrs[.size] as? NSNumber
    {
      fileSizeMB = size.doubleValue / (1024.0 * 1024.0)
    }

    let body: [String: Any] = [
      "path": path,
      "chunkIndex": index,
      "isFinal": isFinal,
      "fileSizeMB": fileSizeMB,
      "matchId": matchId as Any,
    ]

    sendEvent(withName: "onRecordingChunkComplete", body: body)
    hkLogger.info("🎬 Emitted chunk \(index) isFinal=\(isFinal) size=\(fileSizeMB)MB")
  }

  private func stopRecordingTimer() {
    recordingTimer?.invalidate()
    recordingTimer = nil
  }

  // MARK: - Orientation helpers

  private func currentVideoOrientation() -> AVCaptureVideoOrientation {
    switch forcedOrientation {
    case .portrait:
      return .portrait
    case .landscape:
      return .landscapeRight
    case .auto:
      let o = UIDevice.current.orientation
      switch o {
      case .landscapeLeft:
        return .landscapeRight
      case .landscapeRight:
        return .landscapeLeft
      case .portraitUpsideDown:
        return .portraitUpsideDown
      default:
        return .portrait
      }
    }
  }

  private func updateStreamOrientation() {
    let o = currentVideoOrientation()

    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }

      let session = self.stream.mixer.session
      for output in session.outputs {
        for connection in output.connections {
          guard let videoConn = connection as? AVCaptureConnection else { continue }
          if videoConn.isVideoOrientationSupported {
            videoConn.videoOrientation = o
          }
        }
      }

      // ✅ FIX (HaishinKit 1.6.2): Dùng connection.connected thay cho stream.readyState
      if self.connection.connected {
        var v = self.stream.videoSettings
        // Cập nhật lại kích thước video cho encoder khi xoay để tránh bị Facebook bóp về 360p
        v.videoSize = CGSize(width: self.lastW, height: self.lastH)
        self.stream.videoSettings = v
      }

      hkLogger.info("updateStreamOrientation = \(o.rawValue)")
    }
  }
  private func currentVideoSizeForOverlay() -> (width: Int, height: Int) {
    var w = lastW
    var h = lastH

    if w <= 0 || h <= 0 {
      w = 1280
      h = 720
    }

    let o = currentVideoOrientation()
    switch o {
    case .portrait, .portraitUpsideDown:
      if w > h { swap(&w, &h) }
    case .landscapeLeft, .landscapeRight:
      if w < h { swap(&w, &h) }
    @unknown default:
      break
    }

    return (w, h)
  }

  // MARK: - Zoom Helpers

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

  private func ensureCameraAndRampZoom() {
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
      hkLogger.info(
        "Camera switch required: \(currentCamera?.localizedName ?? "nil") -> \(target.localizedName)"
      )

      currentCamera?.cancelVideoZoomRamp()

      DispatchQueue.main.async { [weak self] in
        guard let self = self else { return }

        self.stream.attachCamera(target) { [weak self] error in
          guard let self = self else { return }
          hkLogger.error("attachCamera error: \(error)")
          self.isZoomInProgress = false
        }

        self.currentCamera = target
        self.applyZoomToCamera(target)
      }
    } else {
      applyZoomToCamera(target)
    }
  }

  private func applyZoomToCamera(_ device: AVCaptureDevice) {
    do {
      try device.lockForConfiguration()
    } catch {
      hkLogger.error("Cannot lock camera for zoom: \(error)")
      isZoomInProgress = false
      return
    }

    let z = deviceZoomFactor(for: device, uiZoom: currentZoomUI)

    if device.isRampingVideoZoom {
      device.cancelVideoZoomRamp()
    }

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
    hkLogger.info(
      "Thermal=\(state.rawValue) bitrate=\(newBitrate) overlayMaxFPS=\(newOverlayMaxFPS)")
  }

  // MARK: - ✅ NATIVE Overlay Helpers

  private func cleanupOverlayResources() {
    overlayCaptureTimer?.invalidate()
    overlayCaptureTimer = nil

    overlayImageCache = nil
    overlayNativeReady = false
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

  // MARK: - ✅ RN Overlay APIs (NATIVE)

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

      guard let hkView = IOSPreviewRegistry.hkView else {
        hkLogger.error("No HKView for overlay")
        reject("OVERLAY_ERROR", "Preview view not registered", nil)
        return
      }

      hkView.layoutIfNeeded()
      let previewBounds = hkView.bounds

      let host = UIView(frame: previewBounds)
      host.backgroundColor = .clear
      host.isUserInteractionEnabled = false
      host.clipsToBounds = false
      host.alpha = 0.0  // 🔴 ẨN overlay riêng trên preview, tránh bị lặp

      hkView.addSubview(host)
      hkView.bringSubviewToFront(host)

      self.overlayHostContainer = host

      let nativeView = ScoreOverlayView(frame: host.bounds)
      nativeView.backgroundColor = .clear

      let scaleScore = CGFloat(truncating: scaleW)
      let marginX = CGFloat(truncating: marginXDp)
      let marginY = CGFloat(truncating: marginYDp)

      nativeView.configureLayout(
        corner: corner,
        scaleScore: scaleScore,
        marginX: marginX,
        marginY: marginY
      )

      host.addSubview(nativeView)

      self.overlayNativeView = nativeView
      self.overlayNativeReady = true

      // 🔴 Stream vẫn có overlay, nhưng preview đang tắt
      self.overlayVisible = true  // áp vào stream
      self.overlayVisibleOnPreview = false  // mặc định KHÔNG hiện trên preview
      self.overlayDirty = true

      let effect = OverlayVideoEffect(module: self)
      self.overlayEffect = effect
      _ = self.stream.registerVideoEffect(effect)
      hkLogger.info("OverlayVideoEffect registered (native)")

      self.startOverlayCapture(
        width: Int(previewBounds.width),
        height: Int(previewBounds.height)
      )

      hkLogger.info("🌐 Native overlay loaded on HKView")
      resolve(["success": true])
    }
  }

  // ✅ NEW: overlayUpdate - Nhận data từ JS và forward tới native view
  @objc(overlayUpdate:resolver:rejecter:)
  func overlayUpdate(
    _ data: NSDictionary,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async { [weak self] in
      guard let self = self else {
        reject("OVERLAY_ERROR", "Module released", nil)
        return
      }

      guard let nativeView = self.overlayNativeView else {
        reject("OVERLAY_ERROR", "Overlay not loaded", nil)
        return
      }

      guard self.overlayNativeReady else {
        reject("OVERLAY_ERROR", "Overlay not ready", nil)
        return
      }

      // ✅ Convert NSDictionary to Swift Dictionary
      guard let dataDict = data as? [String: Any] else {
        reject("OVERLAY_ERROR", "Invalid data format", nil)
        return
      }

      if LOG {
        hkLogger.debug("overlayUpdate → \(dataDict.keys.joined(separator: ", "))")
      }

      // ✅ Forward to native view
      nativeView.updateState(dataDict)

      // ✅ Mark dirty để capture lại frame
      self.overlayDirty = true

      resolve(["success": true])
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
      hkLogger.info("Overlay visible (stream)=\(visible)")
      resolve(nil)
    }
  }

  // ✅ NEW: Toggle overlay on preview ONLY (không ảnh hưởng stream)
  @objc(overlaySetVisibleOnPreview:resolver:rejecter:)
  func overlaySetVisibleOnPreview(
    _ visible: Bool,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async { [weak self] in
      guard let self = self else {
        resolve(nil)
        return
      }

      self.overlayVisibleOnPreview = visible

      // 🔴 Điều khiển bằng alpha của host container để không ảnh hưởng capture
      self.overlayHostContainer?.alpha = visible ? 1.0 : 0.0

      hkLogger.info("Overlay visible (preview)=\(visible), stream unchanged")
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

    overlayNativeView?.removeFromSuperview()
    overlayNativeView = nil

    overlayHostContainer?.removeFromSuperview()
    overlayHostContainer = nil

    hkLogger.info("Overlay removed (native)")
  }

  // MARK: - ✅ NATIVE Overlay Capture

  private func startOverlayCapture(width: Int, height: Int) {
    overlayCaptureTimer?.invalidate()

    guard overlayNativeView != nil else {
      hkLogger.error("Cannot start capture: nativeView nil")
      return
    }

    let timer = Timer.scheduledTimer(
      withTimeInterval: 0.25,
      repeats: true
    ) { [weak self] _ in
      self?.captureOverlayFrame()
    }
    RunLoop.main.add(timer, forMode: .common)
    overlayCaptureTimer = timer
    hkLogger.info(
      "Overlay capture timer started (native) size=\(width)x\(height) maxFPS=\(overlayMaxCaptureFPS)"
    )
  }

  @objc private func captureOverlayFrame() {
    guard overlayVisible else {
      if captureNotVisibleLogCount < 3 {
        hkLogger.warn("captureOverlayFrame: overlay not visible")
        captureNotVisibleLogCount += 1
      }
      return
    }

    guard overlayNativeReady else {
      if captureNotReadyLogCount < 3 {
        hkLogger.warn("captureOverlayFrame: overlay not ready")
        captureNotReadyLogCount += 1
      }
      return
    }

    guard let nativeView = overlayNativeView else {
      if captureNilLogCount < 3 {
        hkLogger.warn("captureOverlayFrame: nativeView nil")
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

    let bounds = nativeView.bounds
    let screenScale = UIScreen.main.scale

    captureFrameCount += 1
    if captureFrameCount % 60 == 0 {
      hkLogger.debug("📸 Capture (native): bounds=\(bounds) scale=\(screenScale)")
    }

    autoreleasepool {
      // ✅ Render native view to image
      let format = UIGraphicsImageRendererFormat()
      format.scale = screenScale
      format.opaque = false
      format.preferredRange = .standard

      let image = UIGraphicsImageRenderer(size: bounds.size, format: format)
        .image { ctx in
          nativeView.layer.render(in: ctx.cgContext)
        }

      self.overlayCaptureInFlight = false

      if let cg = image.cgImage {
        self.overlayImageCache = CIImage(cgImage: cg)
        self.overlayDirty = false
        self.cacheUpdateCount += 1

        if self.cacheUpdateCount % 60 == 0 {
          hkLogger.info("✅ Native render: \(cg.width)x\(cg.height) px")
        }
      }
    }
  }

  // ✅ Composite overlay lên video
  func currentOverlayImage(for base: CIImage) -> CIImage? {
    overlayCallCount += 1

    if overlayCallCount % 60 == 0 {
      hkLogger.debug("🎭 overlay: vis=\(overlayVisible) cache=\(overlayImageCache != nil)")
    }

    guard overlayVisible else {
      if overlayNotVisibleCount < 3 {
        hkLogger.warn("🎭 Not visible")
        overlayNotVisibleCount += 1
      }
      return nil
    }

    guard var overlay = overlayImageCache else {
      if overlayNoCacheCount < 5 {
        hkLogger.warn("🎭 No cache")
        overlayNoCacheCount += 1
      }
      return nil
    }

    let baseRect = base.extent
    let overlayRect = overlay.extent

    guard baseRect.width > 0, baseRect.height > 0,
      overlayRect.width > 0, overlayRect.height > 0
    else {
      hkLogger.warn("🎭 Invalid rect: base=\(baseRect) overlay=\(overlayRect)")
      return nil
    }

    if overlayScaleLogCount < 5 {
      hkLogger.info("🎭 Composite: base=\(baseRect) overlay=\(overlayRect)")
      overlayScaleLogCount += 1
    }

    // ✅ CASE 1: Already correct size - just align origin
    let widthDiff = abs(overlayRect.width - baseRect.width)
    let heightDiff = abs(overlayRect.height - baseRect.height)

    if widthDiff < 2 && heightDiff < 2 {
      let placed = overlay.transformed(
        by: CGAffineTransform(
          translationX: baseRect.minX - overlayRect.minX,
          y: baseRect.minY - overlayRect.minY
        )
      )

      if overlayScaleLogCount < 5 {
        hkLogger.info("✅ Fit: \(placed.extent)")
      }

      return placed
    }

    // ✅ CASE 2: Need scaling

    // Step 1: Normalize to (0,0)
    if overlayRect.minX != 0 || overlayRect.minY != 0 {
      overlay = overlay.transformed(
        by: CGAffineTransform(
          translationX: -overlayRect.minX,
          y: -overlayRect.minY
        )
      )
    }

    // Step 2: Scale exactly
    let sx = baseRect.width / overlay.extent.width
    let sy = baseRect.height / overlay.extent.height

    let scaled = overlay.transformed(
      by: CGAffineTransform(scaleX: sx, y: sy)
    )

    // Step 3: Crop exactly
    let cropRect = CGRect(
      x: 0,
      y: 0,
      width: baseRect.width,
      height: baseRect.height
    )
    let cropped = scaled.cropped(to: cropRect)

    // Step 4: Place at base origin
    let placed = cropped.transformed(
      by: CGAffineTransform(
        translationX: baseRect.minX,
        y: baseRect.minY
      )
    )

    if overlayScaleLogCount < 5 {
      hkLogger.info(
        "✅ Scaled (\(String(format: "%.2f", sx)),\(String(format: "%.2f", sy))): \(placed.extent)")
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

    if can1080 && score >= 85 {
      profile = ["width": 1920, "height": 1080, "fps": 30, "bitrate": 5_000_000]
    } else if score >= 65 {
      profile = ["width": 1280, "height": 720, "fps": 30, "bitrate": 4_000_000]
    } else if score >= 55 {
      profile = ["width": 1280, "height": 720, "fps": 30, "bitrate": 3_500_000]
    } else {
      profile = ["width": 1280, "height": 720, "fps": 24, "bitrate": 3_000_000]
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
    updateStreamOrientation()
  }

  @objc(enableAutoRotate:)
  func enableAutoRotate(_ on: Bool) {
    autoRotate = on
    hkLogger.info("autoRotate=\(on)")
    if on {
      updateStreamOrientation()
    }
  }

  @objc(enableThermalProtect:)
  func enableThermalProtect(_ on: Bool) {
    thermalProtect = on
    if on {
      startThermalMonitoring()
    } else {
      stopThermalMonitoring()
    }
  }

  @objc(release:rejecter:)
  func release(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      hkLogger.info("Releasing module")

      self.pendingZoomOperation?.cancel()
      self.isZoomInProgress = false

      self.overlayRemoveInternal()
      self.stopThermalMonitoring()
      self.bitrateTimer?.invalidate()
      self.bitrateTimer = nil
      StreamStatsOverlayRegistry.shared.clearAll()

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
        // Cấu hình Audio Session (Sample rate 44.1kHz đã được set trong hàm này)
        try self.ensureAudioSession()

        self.stream.frameRate = Double(self.lastFps)

        // 1. Session Preset (Độ phân giải đầu vào Camera)
        if self.lastW >= 1920 || self.lastH >= 1080 {
          self.stream.sessionPreset = .hd1920x1080
        } else {
          self.stream.sessionPreset = .hd1280x720
        }

        // 2. Video Settings (Cấu hình Encoder đầu ra)
        var v = self.stream.videoSettings

        // 🔴 FIX QUAN TRỌNG: Phải set VideoSize cho Encoder
        // Nếu thiếu dòng này, FB sẽ hiểu sai metadata và ép về 360p
        v.videoSize = CGSize(width: self.lastW, height: self.lastH)

        v.bitRate = UInt32(max(0, self.lastBitrate))
        v.maxKeyFrameIntervalDuration = 2
        v.scalingMode = .trim  // Giúp crop hình chuẩn hơn

        // Profile Level
        if self.lastW >= 1920 || self.lastH >= 1080 {
          v.profileLevel = kVTProfileLevel_H264_High_AutoLevel as String
        } else {
          v.profileLevel = kVTProfileLevel_H264_Main_AutoLevel as String
        }

        self.stream.videoSettings = v

        // 3. Audio Settings
        var a = self.stream.audioSettings
        a.bitRate = 128_000
        // ❌ ĐÃ XÓA DÒNG GÂY LỖI: a.sampleRate = 44_100
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
          self.updateStreamOrientation()
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
      hkLogger.info("start stream")

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

      // 1. Session Preset (Độ phân giải đầu vào từ Camera)
      if self.lastW >= 1920 || self.lastH >= 1080 {
        self.stream.sessionPreset = .hd1920x1080
      } else {
        self.stream.sessionPreset = .hd1280x720
      }

      self.stream.frameRate = Double(self.lastFps)

      // 2. Video Settings (Độ phân giải đầu ra Encoder gửi lên FB)
      var v = self.stream.videoSettings

      // ✅ FIX QUAN TRỌNG: Set cứng Video Size Output
      // Nếu không có dòng này, FB sẽ nhận sai metadata và ép về 360p
      v.videoSize = CGSize(width: self.lastW, height: self.lastH)

      v.bitRate = UInt32(max(0, self.lastBitrate))
      v.maxKeyFrameIntervalDuration = 2  // Bắt buộc = 2 cho Facebook
      v.scalingMode = .trim

      // Profile Level
      if self.lastW >= 1920 || self.lastH >= 1080 {
        v.profileLevel = kVTProfileLevel_H264_High_AutoLevel as String
        hkLogger.info("Configuring 1080p: H264 High Profile")
      } else {
        v.profileLevel = kVTProfileLevel_H264_Main_AutoLevel as String
        hkLogger.info("Configuring 720p: H264 Main Profile")
      }

      self.stream.videoSettings = v

      // 3. Audio Settings
      var a = self.stream.audioSettings
      a.bitRate = 128_000
      // ❌ ĐÃ XÓA DÒNG GÂY LỖI: a.sampleRate = 44_100
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
        self.updateStreamOrientation()
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

      self.pendingZoomOperation?.cancel()
      self.isZoomInProgress = false

      self.overlayRemoveInternal()

      // ⏹ stop recording nếu còn
      if self.isRecording {
        self.stopRecordingTimer()
        self.recorder.stopRecording()
        if let path = self.recordingPath {
          self.emitChunkEvent(
            path: path,
            index: self.recordingChunkIndex,
            isFinal: true,
            matchId: self.recordingMatchId
          )
        }
        self.isRecording = false
        self.recordingPath = nil
        self.recordingMatchId = nil
        self.recordingChunkIndex = 0
      }

      self.stopThermalMonitoring()
      self.bitrateTimer?.invalidate()
      self.bitrateTimer = nil
      StreamStatsOverlayRegistry.shared.clearAll()

      self.stream.close()
      self.connection.close()

      self.stream.attachCamera(nil)
      self.stream.attachAudio(nil)
      IOSPreviewRegistry.hkView?.attachStream(nil)

      self.lastUrl = nil
      resolve(nil)
    }
  }

  // MARK: - Recording control (RN API)

  @objc(startRecording:resolver:rejecter:)
  func startRecording(
    _ matchId: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      hkLogger.info("startRecording(matchId=\(matchId)) called")

      // phải đang streaming
      guard self.connection.connected else {
        reject("RECORDING_ERROR", "Stream not active", nil)
        return
      }

      // tránh start 2 lần
      if self.isRecording {
        reject("RECORDING_ERROR", "Already recording", nil)
        return
      }

      guard let path = self.generateRecordingPath(matchId: matchId, index: 0) else {
        reject("RECORDING_ERROR", "Cannot create recording path", nil)
        return
      }

      // HaishinKit: startRecording -> filePath
      self.recorder.startRecording(path, settings: nil)

      self.isRecording = true
      self.recordingPath = path
      self.recordingStartTime = Date().timeIntervalSince1970
      self.recordingChunkIndex = 0
      self.recordingMatchId = matchId

      // schedule chunk rotation
      self.stopRecordingTimer()
      self.recordingTimer = Timer.scheduledTimer(
        withTimeInterval: Double(self.recordingChunkDurationMs) / 1000.0, repeats: true
      ) { [weak self] _ in
        self?.rotateRecordingChunk()
      }
      if let t = self.recordingTimer {
        RunLoop.main.add(t, forMode: .common)
      }

      resolve([
        "path": path,
        "recording": true,
      ])
    }
  }

  private func rotateRecordingChunk() {
    guard isRecording else { return }

    DispatchQueue.main.async {
      hkLogger.info("rotateRecordingChunk index=\(self.recordingChunkIndex)")

      // Stop current recording vào file hiện tại
      self.recorder.stopRecording()

      if let currentPath = self.recordingPath {
        self.emitChunkEvent(
          path: currentPath,
          index: self.recordingChunkIndex,
          isFinal: false,
          matchId: self.recordingMatchId
        )
      }

      self.recordingChunkIndex += 1

      guard let matchId = self.recordingMatchId,
        let nextPath = self.generateRecordingPath(matchId: matchId, index: self.recordingChunkIndex)
      else {
        hkLogger.error("Cannot create next chunk path, stop recording")
        self.isRecording = false
        self.stopRecordingTimer()
        return
      }

      // start file mới
      self.recordingPath = nextPath
      self.recordingStartTime = Date().timeIntervalSince1970

      self.recorder.startRecording(nextPath, settings: nil)
      hkLogger.info("Recording next chunk path=\(nextPath)")
    }
  }
  @objc(stopRecording:rejecter:)
  func stopRecording(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      hkLogger.info("stopRecording() called")

      guard self.isRecording else {
        resolve(nil)
        return
      }

      self.stopRecordingTimer()

      // stop current recording
      self.recorder.stopRecording()

      let totalChunks = self.recordingChunkIndex + 1
      let durationSec = Date().timeIntervalSince1970 - self.recordingStartTime

      if let path = self.recordingPath {
        self.emitChunkEvent(
          path: path,
          index: self.recordingChunkIndex,
          isFinal: true,
          matchId: self.recordingMatchId
        )
      }

      let result: [String: Any] = [
        "lastPath": self.recordingPath as Any,
        "totalChunks": totalChunks,
        "totalDurationSeconds": durationSec,
      ]

      self.isRecording = false
      self.recordingPath = nil
      self.recordingMatchId = nil
      self.recordingChunkIndex = 0

      resolve(result)
    }
  }

  @objc(checkRecordingSupport:rejecter:)
  func checkRecordingSupport(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    // HaishinKit RTMPStream luôn support recording qua mixer
    let supported = true

    let result: [String: Any] = [
      "supported": supported,
      "isStreaming": self.connection.connected,
      "library": "HaishinKit",
      "className": "RTMPStream",
    ]
    resolve(result)
  }

  @objc(getRecordingStatus:rejecter:)
  func getRecordingStatus(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    var body: [String: Any] = [
      "recording": isRecording,
      "currentPath": recordingPath as Any,
      "chunkIndex": recordingChunkIndex,
    ]

    if isRecording {
      let duration = Date().timeIntervalSince1970 - recordingStartTime
      body["durationSeconds"] = duration
    }

    resolve(body)
  }

  @objc(deleteRecordingFile:resolver:rejecter:)
  func deleteRecordingFile(
    _ path: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let cleaned: String
    if path.hasPrefix("file://") {
      cleaned = String(path.dropFirst("file://".count))
    } else {
      cleaned = path
    }

    let fm = FileManager.default
    if !fm.fileExists(atPath: cleaned) {
      resolve(false)
      return
    }

    do {
      try fm.removeItem(atPath: cleaned)
      resolve(true)
    } catch {
      hkLogger.error("deleteRecordingFile error: \(error)")
      reject("DELETE_ERROR", error.localizedDescription, error)
    }
  }

  // MARK: - Controls

  @objc(switchCamera:rejecter:)
  func switchCamera(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
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

      DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
        self.ensureCameraAndRampZoom()
        self.updateStreamOrientation()
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

  @objc(setZoom:)
  func setZoom(_ factor: NSNumber) {
    let newZoom = max(0.5, min(2.0, CGFloat(truncating: factor)))

    pendingZoomOperation?.cancel()

    let work = DispatchWorkItem { [weak self] in
      guard let self = self else { return }

      DispatchQueue.main.async {
        self.currentZoomUI = newZoom
        self.ensureCameraAndRampZoom()
      }
    }

    pendingZoomOperation = work
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

// ✅ THÊM: Debug flag
private let LOG = false
