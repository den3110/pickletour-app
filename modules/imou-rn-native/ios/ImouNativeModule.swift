// ImouNativeModule.swift — React Native bridge.
//
// Exposed methods (1:1 with src/index.ts):
//   login(opts) -> Void
//   submitCaptcha(resp) -> Void   (continuation after captchaRequired event)
//   logout() -> Void
//   isLoggedIn() -> Bool
//   listDevices() -> [Camera]
//   listRecordings(deviceId, date) -> [Recording]
//   startLive(deviceId) -> {sessionId}
//   startPlayback(deviceId, begin, end, opts) -> {sessionId}
//   stopSession(sessionId) -> Void
//   snapshot(deviceId) -> {uri}
//
// Events:
//   captchaRequired { challengeId, captchaId, riskType }
//   sessionReady { sessionId }
//   error { sessionId, code, message }

import Foundation
import React
import Photos
import AVKit

@objc(ImouNative)
public final class ImouNativeModule: RCTEventEmitter {

  // Pending captcha challenges keyed by ID — JS resolves via submitCaptcha
  private var pendingCaptcha: [String: (CheckedContinuation<ImouSession, Error>, String, String, String, String)] = [:]
  private let lock = NSLock()

  private var auth = AuthFlow()
  private var api: ApiClient?

  override public static func requiresMainQueueSetup() -> Bool { false }
  override public func supportedEvents() -> [String]! {
    return ["captchaRequired", "sessionReady", "error", "sessionExpired",
            "playbackProgress"]
  }

  // ─── Auth ─────────────────────────────────────────────────────────────

  @objc(login:resolver:rejecter:)
  public func login(_ opts: [String: Any],
                    resolver resolve: @escaping RCTPromiseResolveBlock,
                    rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let phone = opts["phone"] as? String,
          let pwd = opts["password"] as? String,
          let area = opts["areaCode"] as? String else {
      reject("bad_args", "phone/password/areaCode required", nil); return
    }
    Task {
      do {
        // Phase 1
        let session: ImouSession
        do {
          session = try await auth.startLogin(phone: phone, areaCode: area, password: pwd)
        } catch AuthError.captchaRequired(let meta, let cid) {
          // Suspend: emit event + park continuation, JS will call submitCaptcha
          let challengeId = UUID().uuidString
          let sess: ImouSession = try await withCheckedThrowingContinuation { cont in
            lock.lock()
            pendingCaptcha[challengeId] = (cont, phone, area, pwd, meta)
            lock.unlock()
            self.sendEvent(withName: "captchaRequired", body: [
              "challengeId": challengeId,
              "captchaId": cid,
              "riskType": "Login",
            ])
          }
          session = sess
        }
        try SessionStore.save(session)
        try SessionStore.saveCreds(LoginCreds(phone: phone, areaCode: area, password: pwd))
        api = ApiClient(session, onSessionExpired: { [weak self] in
          await self?.reloginFromCachedCreds()
        })
        resolve(nil)
      } catch {
        reject("login_failed", "\(error)", error)
      }
    }
  }

  /// Called by ApiClient when SaaS returns code 12002. Emits `sessionExpired`
  /// event so JS can show a spinner, then re-runs the saved login.
  private func reloginFromCachedCreds() async -> ImouSession? {
    self.sendEvent(withName: "sessionExpired", body: ["reason": "12002"])
    guard let c = SessionStore.loadCreds() else {
      NSLog("[imou-rn-native] 12002 but no cached creds — JS must re-prompt login")
      return nil
    }
    do {
      let s = try await auth.startLogin(phone: c.phone, areaCode: c.areaCode,
                                         password: c.password)
      try? SessionStore.save(s)
      NSLog("[imou-rn-native] 12002 auto-relogin OK")
      return s
    } catch {
      NSLog("[imou-rn-native] 12002 relogin failed: \(error)")
      return nil
    }
  }

  @objc(submitCaptcha:resolver:rejecter:)
  public func submitCaptcha(_ resp: [String: Any],
                             resolver resolve: @escaping RCTPromiseResolveBlock,
                             rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let cid = resp["challengeId"] as? String,
          let lot = resp["lotNumber"] as? String,
          let cap = resp["captchaOutput"] as? String,
          let tok = resp["passToken"] as? String,
          let gen = resp["genTime"] as? String else {
      reject("bad_args", "incomplete captcha response", nil); return
    }
    lock.lock()
    let pending = pendingCaptcha.removeValue(forKey: cid)
    lock.unlock()
    guard let (cont, phone, area, pwd, meta) = pending else {
      reject("unknown_challenge", "challengeId not found", nil); return
    }
    Task {
      do {
        let session = try await auth.completeWithCaptcha(
          phone: phone, areaCode: area, password: pwd,
          solution: .init(lotNumber: lot, captchaOutput: cap,
                          passToken: tok, genTime: gen),
          captchaMetaData: meta
        )
        cont.resume(returning: session)
        resolve(nil)
      } catch {
        cont.resume(throwing: error)
        reject("captcha_failed", "\(error)", error)
      }
    }
  }

  @objc(logout:rejecter:)
  public func logout(resolver resolve: @escaping RCTPromiseResolveBlock,
                     rejecter reject: @escaping RCTPromiseRejectBlock) {
    SessionStore.clear()
    api = nil
    resolve(nil)
  }

  @objc(isLoggedIn:rejecter:)
  public func isLoggedIn(resolver resolve: @escaping RCTPromiseResolveBlock,
                         rejecter reject: @escaping RCTPromiseRejectBlock) {
    do {
      let s = try SessionStore.load()
      if let s = s {
        api = ApiClient(s, onSessionExpired: { [weak self] in
          await self?.reloginFromCachedCreds()
        })
      }
      resolve(s != nil)
    } catch {
      resolve(false)
    }
  }

  // ─── Devices ─────────────────────────────────────────────────────────

  @objc(listDevices:rejecter:)
  public func listDevices(resolver resolve: @escaping RCTPromiseResolveBlock,
                           rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let api = ensureApi(reject: reject) else { return }
    Task {
      do {
        let cams = try await api.listDevices()
        resolve(cams.map { [
          "deviceId": $0.deviceId, "name": $0.name,
          "model": $0.model, "productId": $0.productId,
          "online": $0.online,
        ] })
      } catch { reject("list_failed", "\(error)", error) }
    }
  }

  @objc(listRecordings:date:resolver:rejecter:)
  public func listRecordings(_ deviceId: String, date: String,
                              resolver resolve: @escaping RCTPromiseResolveBlock,
                              rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let api = ensureApi(reject: reject) else { return }
    Task {
      do {
        let cams = try await api.listDevices()
        guard let cam = cams.first(where: { $0.deviceId == deviceId }) else {
          throw NSError(domain: "imou", code: 1, userInfo: [NSLocalizedDescriptionKey: "device not found"])
        }
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(secondsFromGMT: 0)
        guard let d0 = f.date(from: date) else {
          throw NSError(domain: "imou", code: 2, userInfo: [NSLocalizedDescriptionKey: "bad date"])
        }
        let d1 = d0.addingTimeInterval(86400 - 1)
        let recs = try await api.listRecordings(
          deviceId: deviceId, productId: cam.productId,
          begin: d0, end: d1)
        resolve(recs.map { [
          "begin": $0.begin, "end": $0.end,
          "durationS": $0.durationS, "typeName": $0.typeName,
        ] })
      } catch { reject("list_rec_failed", "\(error)", error) }
    }
  }

  @objc(listEventRecordings:date:resolver:rejecter:)
  public func listEventRecordings(_ deviceId: String, date: String,
                                   resolver resolve: @escaping RCTPromiseResolveBlock,
                                   rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let api = ensureApi(reject: reject) else { return }
    Task {
      do {
        let cams = try await api.listDevices()
        guard let cam = cams.first(where: { $0.deviceId == deviceId }) else {
          throw NSError(domain: "imou", code: 1, userInfo: [NSLocalizedDescriptionKey: "device not found"])
        }
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(secondsFromGMT: 0)
        guard let d0 = f.date(from: date) else {
          throw NSError(domain: "imou", code: 2, userInfo: [NSLocalizedDescriptionKey: "bad date"])
        }
        let d1 = d0.addingTimeInterval(86400 - 1)
        let evs = try await api.listEventRecordings(
          deviceId: deviceId, productId: cam.productId, begin: d0, end: d1)
        resolve(evs)
      } catch { reject("list_event_failed", "\(error)", error) }
    }
  }

  // ─── Sessions ────────────────────────────────────────────────────────

  @objc(startLive:opts:resolver:rejecter:)
  public func startLive(_ deviceId: String, opts: [String: Any],
                         resolver resolve: @escaping RCTPromiseResolveBlock,
                         rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let api = ensureApi(reject: reject) else { return }
    let withAudio = (opts["withAudio"] as? Bool) ?? true
    let qualityStr = (opts["quality"] as? String) ?? "hd"
    let quality: ApiClient.StreamQuality = (qualityStr == "sd") ? .sd : .hd
    Task {
      do {
        let cams = try await api.listDevices()
        guard let cam = cams.first(where: { $0.deviceId == deviceId }) else {
          throw NSError(domain: "imou", code: 1, userInfo: nil)
        }
        let url = try await api.streamUrl(deviceId: deviceId,
                                           productId: cam.productId,
                                           quality: quality)
        let sid = "live-\(UUID().uuidString.prefix(8))"
        _ = Player.start(.init(
          sessionId: sid, mode: .live, streamUrl: url,
          decryptKey: Data(), wssePassword: nil,
          withAudio: withAudio,
          onError: { [weak self] code, msg in
            self?.sendEvent(withName: "error", body: [
              "sessionId": sid, "code": code, "message": msg
            ])
          }
        ))
        resolve(["sessionId": sid])
      } catch { reject("start_live_failed", "\(error)", error) }
    }
  }

  @objc(startPlayback:begin:end:opts:resolver:rejecter:)
  public func startPlayback(_ deviceId: String, begin: String, end: String,
                             opts: [String: Any],
                             resolver resolve: @escaping RCTPromiseResolveBlock,
                             rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let api = ensureApi(reject: reject) else { return }
    let encrypt = (opts["encrypt"] as? Int) ?? 2
    Task {
      do {
        let cams = try await api.listDevices()
        guard let cam = cams.first(where: { $0.deviceId == deviceId }) else {
          throw NSError(domain: "imou", code: 1, userInfo: nil)
        }
        let url = try await api.playbackUrl(
          deviceId: deviceId, productId: cam.productId,
          begin: begin, end: end, encrypt: encrypt
        )
        let creds = try await api.devicePassword(deviceId: deviceId, productId: cam.productId)
        let key = encrypt == 3
          ? CryptoCore.vodFrameKeyEnc3(devSn: deviceId, devPwd: creds.pwd)
          : CryptoCore.vodFrameKey(devSn: deviceId, devPwd: creds.pwd)
        let wsse = encrypt == 3 ? creds.pwd : nil
        let sid = "pb-\(UUID().uuidString.prefix(8))"
        let withAudio = (opts["withAudio"] as? Bool) ?? true
        _ = Player.start(.init(
          sessionId: sid,
          mode: .playback(begin: begin, end: end, encrypt: encrypt),
          streamUrl: url, decryptKey: key, wssePassword: wsse,
          withAudio: withAudio,
          onError: { [weak self] code, msg in
            self?.sendEvent(withName: "error", body: [
              "sessionId": sid, "code": code, "message": msg
            ])
          },
          onProgress: { [weak self] pos, dur in
            self?.sendEvent(withName: "playbackProgress", body: [
              "sessionId": sid, "positionSec": pos, "durationSec": dur
            ])
          }
        ))
        resolve(["sessionId": sid])
      } catch { reject("start_pb_failed", "\(error)", error) }
    }
  }

  // ─── Recording (ghi session đang xem ra .mp4 — như nút record của Imou) ──

  @objc(startRecording:resolver:rejecter:)
  public func startRecording(_ sessionId: String,
                              resolver resolve: @escaping RCTPromiseResolveBlock,
                              rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let p = Player.get(sessionId) else {
      NSLog("[ImouRN] RECORD start FAIL no_session \(sessionId)")
      reject("no_session", "no active session \(sessionId)", nil); return
    }
    let path = p.startRecording()
    NSLog("[ImouRN] RECORD start sid=\(sessionId) → \(path)")
    resolve(nil)
  }

  @objc(stopRecording:opts:resolver:rejecter:)
  public func stopRecording(_ sessionId: String, opts: [String: Any],
                            resolver resolve: @escaping RCTPromiseResolveBlock,
                            rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let p = Player.get(sessionId) else {
      reject("no_session", "no active session \(sessionId)", nil); return
    }
    let saveToGallery = (opts["saveToGallery"] as? Bool) ?? false
    Task {
      guard let path = await p.stopRecording(), let url = URL(string: path) else {
        NSLog("[ImouRN] RECORD stop FAIL no frames sid=\(sessionId)")
        reject("record_failed", "no frames recorded", nil); return
      }
      NSLog("[ImouRN] RECORD stop OK sid=\(sessionId) → \(path)")
      var result: [String: Any] = ["uri": path]
      if saveToGallery {
        result["savedToGallery"] = (try? await Self.saveVideoToPhotos(fileURL: url)) ?? false
      }
      resolve(result)
    }
  }

  @objc(stopSession:resolver:rejecter:)
  public func stopSession(_ sessionId: String,
                           resolver resolve: @escaping RCTPromiseResolveBlock,
                           rejecter reject: @escaping RCTPromiseRejectBlock) {
    Player.stop(sessionId)
    resolve(nil)
  }

  // ─── Runtime controls ───────────────────────────────────────────────

  @objc(setMuted:muted:resolver:rejecter:)
  public func setMuted(_ sessionId: String, muted: Bool,
                        resolver resolve: @escaping RCTPromiseResolveBlock,
                        rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let p = Player.get(sessionId) else {
      reject("no_session", "session not found", nil); return
    }
    p.audioRenderer.setMuted(muted)
    resolve(nil)
  }

  @objc(setPaused:paused:resolver:rejecter:)
  public func setPaused(_ sessionId: String, paused: Bool,
                         resolver resolve: @escaping RCTPromiseResolveBlock,
                         rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let p = Player.get(sessionId) else {
      reject("no_session", "session not found", nil); return
    }
    p.renderer.setPaused(paused)
    p.audioRenderer.setMuted(paused)  // also silence audio while paused
    resolve(nil)
  }

  // ─── Picture-in-Picture ─────────────────────────────────────────────

  @objc(startPiP:resolver:rejecter:)
  public func startPiP(_ sessionId: String,
                        resolver resolve: @escaping RCTPromiseResolveBlock,
                        rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      guard let view = ImouVideoViewRegistry.shared.view(forSessionId: sessionId) else {
        reject("no_view", "no ImouVideoView bound to sessionId", nil); return
      }
      guard AVPictureInPictureController.isPictureInPictureSupported() else {
        reject("unsupported", "PiP not supported on this device", nil); return
      }
      if view.pipController == nil {
        // Build a content source from the layer + a minimal delegate
        // (PiP requires playbackDelegate but for live streams most
        // playback controls aren't meaningful — we wire up no-ops).
        let source = AVPictureInPictureController.ContentSource(
          sampleBufferDisplayLayer: view.displayLayer,
          playbackDelegate: ImouPiPPlaybackDelegate.shared
        )
        view.pipController = AVPictureInPictureController(contentSource: source)
        view.pipController?.canStartPictureInPictureAutomaticallyFromInline = true
      }
      view.pipController?.startPictureInPicture()
      resolve(nil)
    }
  }

  @objc(stopPiP:resolver:rejecter:)
  public func stopPiP(_ sessionId: String,
                       resolver resolve: @escaping RCTPromiseResolveBlock,
                       rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      guard let view = ImouVideoViewRegistry.shared.view(forSessionId: sessionId) else {
        reject("no_view", "no ImouVideoView bound to sessionId", nil); return
      }
      view.pipController?.stopPictureInPicture()
      resolve(nil)
    }
  }

  // ─── PTZ ─────────────────────────────────────────────────────────────

  @objc(ptzMove:opts:resolver:rejecter:)
  public func ptzMove(_ deviceId: String, opts: [String: Any],
                       resolver resolve: @escaping RCTPromiseResolveBlock,
                       rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let api = ensureApi(reject: reject) else { return }
    let h = (opts["h"] as? Double) ?? 0.0
    let v = (opts["v"] as? Double) ?? 0.0
    let zoom = (opts["zoom"] as? Double) ?? 0.0
    let dur = (opts["durationMs"] as? Int) ?? 500
    Task {
      do {
        let cams = try await api.listDevices()
        guard let cam = cams.first(where: { $0.deviceId == deviceId }) else {
          throw NSError(domain: "imou", code: 1, userInfo: nil)
        }
        try await api.ptzMove(deviceId: deviceId, productId: cam.productId,
                              h: h, v: v, zoom: zoom, durationMs: dur)
        resolve(nil)
      } catch { reject("ptz_failed", "\(error)", error) }
    }
  }

  @objc(setZoomLevel:opts:resolver:rejecter:)
  public func setZoomLevel(_ deviceId: String, opts: [String: Any],
                            resolver resolve: @escaping RCTPromiseResolveBlock,
                            rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let api = ensureApi(reject: reject) else { return }
    let level = (opts["level"] as? Double) ?? 0.0
    Task {
      do {
        let cams = try await api.listDevices()
        guard let cam = cams.first(where: { $0.deviceId == deviceId }) else {
          throw NSError(domain: "imou", code: 1, userInfo: nil)
        }
        try await api.setZoomLevel(deviceId: deviceId, productId: cam.productId,
                                    level: level)
        resolve(nil)
      } catch { reject("zoom_failed", "\(error)", error) }
    }
  }

  @objc(getZoomLevel:resolver:rejecter:)
  public func getZoomLevel(_ deviceId: String,
                            resolver resolve: @escaping RCTPromiseResolveBlock,
                            rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let api = ensureApi(reject: reject) else { return }
    Task {
      do {
        let cams = try await api.listDevices()
        guard let cam = cams.first(where: { $0.deviceId == deviceId }) else {
          throw NSError(domain: "imou", code: 1, userInfo: nil)
        }
        let level = try await api.getZoomLevel(deviceId: deviceId,
                                                productId: cam.productId)
        resolve(level)
      } catch { reject("zoom_get_failed", "\(error)", error) }
    }
  }

  @objc(getPtzCapability:resolver:rejecter:)
  public func getPtzCapability(_ deviceId: String,
                                resolver resolve: @escaping RCTPromiseResolveBlock,
                                rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let api = ensureApi(reject: reject) else { return }
    Task {
      do {
        let cams = try await api.listDevices()
        guard let cam = cams.first(where: { $0.deviceId == deviceId }) else {
          throw NSError(domain: "imou", code: 1, userInfo: nil)
        }
        let cap = try await api.getPtzCapability(deviceId: deviceId,
                                                  productId: cam.productId)
        resolve(cap)
      } catch { reject("ptz_cap_failed", "\(error)", error) }
    }
  }

  @objc(ptzReset:resolver:rejecter:)
  public func ptzReset(_ deviceId: String,
                        resolver resolve: @escaping RCTPromiseResolveBlock,
                        rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let api = ensureApi(reject: reject) else { return }
    Task {
      do {
        let cams = try await api.listDevices()
        guard let cam = cams.first(where: { $0.deviceId == deviceId }) else {
          throw NSError(domain: "imou", code: 1, userInfo: nil)
        }
        try await api.ptzReset(deviceId: deviceId, productId: cam.productId)
        resolve(nil)
      } catch { reject("ptz_reset_failed", "\(error)", error) }
    }
  }

  // ─── Resolution ──────────────────────────────────────────────────────

  @objc(setResolution:code:resolver:rejecter:)
  public func setResolution(_ deviceId: String, code: NSNumber,
                             resolver resolve: @escaping RCTPromiseResolveBlock,
                             rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let api = ensureApi(reject: reject) else { return }
    Task {
      do {
        let cams = try await api.listDevices()
        guard let cam = cams.first(where: { $0.deviceId == deviceId }) else {
          throw NSError(domain: "imou", code: 1, userInfo: nil)
        }
        try await api.setResolution(deviceId: deviceId, productId: cam.productId, code: code.intValue)
        resolve(nil)
      } catch { reject("set_resolution_failed", "\(error)", error) }
    }
  }

  // ─── Snapshot ────────────────────────────────────────────────────────

  @objc(snapshot:opts:resolver:rejecter:)
  public func snapshot(_ deviceId: String, opts: [String: Any],
                        resolver resolve: @escaping RCTPromiseResolveBlock,
                        rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let api = ensureApi(reject: reject) else { return }
    let saveToGallery = (opts["saveToGallery"] as? Bool) ?? false
    Task {
      do {
        let cams = try await api.listDevices()
        guard let cam = cams.first(where: { $0.deviceId == deviceId }) else {
          throw NSError(domain: "imou", code: 1, userInfo: nil)
        }
        let url = try await api.streamUrl(deviceId: deviceId, productId: cam.productId)
        let file = try await Snapshot.capture(streamUrl: url)
        var result: [String: Any] = ["uri": file.absoluteString]
        if saveToGallery {
          let ok = try await Self.saveImageToPhotos(fileURL: file)
          result["savedToGallery"] = ok
        }
        resolve(result)
      } catch { reject("snapshot_failed", "\(error)", error) }
    }
  }

  // ─── Photos library save ────────────────────────────────────────────

  /// Save a JPEG file to the user's Photos library. Requests permission if
  /// not yet granted. Returns true on success.
  static func saveImageToPhotos(fileURL: URL) async throws -> Bool {
    // Request permission (.addOnly is enough — we only insert, don't read).
    let status: PHAuthorizationStatus = await withCheckedContinuation { cont in
      PHPhotoLibrary.requestAuthorization(for: .addOnly) { s in cont.resume(returning: s) }
    }
    guard status == .authorized || status == .limited else { return false }
    return try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Bool, Error>) in
      PHPhotoLibrary.shared().performChanges({
        let req = PHAssetCreationRequest.forAsset()
        req.addResource(with: .photo, fileURL: fileURL, options: nil)
      }, completionHandler: { ok, err in
        if let err = err { cont.resume(throwing: err) }
        else { cont.resume(returning: ok) }
      })
    }
  }

  static func saveVideoToPhotos(fileURL: URL) async throws -> Bool {
    let status: PHAuthorizationStatus = await withCheckedContinuation { cont in
      PHPhotoLibrary.requestAuthorization(for: .addOnly) { s in cont.resume(returning: s) }
    }
    guard status == .authorized || status == .limited else { return false }
    return try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Bool, Error>) in
      PHPhotoLibrary.shared().performChanges({
        let req = PHAssetCreationRequest.forAsset()
        req.addResource(with: .video, fileURL: fileURL, options: nil)
      }, completionHandler: { ok, err in
        if let err = err { cont.resume(throwing: err) }
        else { cont.resume(returning: ok) }
      })
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────

  private func ensureApi(reject: RCTPromiseRejectBlock) -> ApiClient? {
    if let a = api { return a }
    do {
      if let s = try SessionStore.load() {
        let a = ApiClient(s, onSessionExpired: { [weak self] in
          await self?.reloginFromCachedCreds()
        })
        self.api = a; return a
      }
    } catch {}
    reject("not_logged_in", "call ImouNative.login() first", nil)
    return nil
  }
}
