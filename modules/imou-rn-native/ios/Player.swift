// Player.swift — direct-decode pipeline (no FFmpegKit transcode).
//
//   Transport (DhHttpClient / DhRtspClient) → DHAV chunks
//      ↓
//   DHAVParser.Assembler — assemble+decrypt frames
//      ↓
//   Demultiplex: video (0xfd/0xfc) → HEVCRenderer
//                audio (0xf0)       → AACRenderer (TODO §audio)
//      ↓
//   AVSampleBufferDisplayLayer (video) + AVAudioEngine (audio)
//
// Latency: ~150-300ms end-to-end (vs HLS ~1500ms). Matches Imou app.

import Foundation
import AVFoundation

public final class Player {

  public enum Mode {
    case live
    case playback(begin: String, end: String, encrypt: Int)
  }

  public struct StartParams {
    public let sessionId: String
    public let mode: Mode
    public let streamUrl: String
    public let decryptKey: Data            // 16B enc2, 32B enc3, empty for live
    public let wssePassword: String?       // encrypt=3 only
    public let withAudio: Bool
    public let onError: ((String, String) -> Void)?
    /// Playback only: (positionSec, durationSec) — throttled ~1/sec for the
    /// seek-bar thumb. nil for live.
    public var onProgress: ((Double, Double) -> Void)? = nil
  }

  /// Renderer owned by this Player. Created up-front; the View hooks its
  /// displayLayer into this renderer when it mounts.
  public let renderer = HEVCRenderer()
  public let audioRenderer = AACRenderer()

  // MARK: – Session registry

  private static var sessions: [String: Player] = [:]
  private static let regLock = NSLock()

  public static func register(_ id: String, player: Player) {
    regLock.lock(); sessions[id] = player; regLock.unlock()
  }
  public static func get(_ id: String) -> Player? {
    regLock.lock(); defer { regLock.unlock() }
    return sessions[id]
  }
  public static func stop(_ id: String) {
    regLock.lock()
    let p = sessions.removeValue(forKey: id)
    regLock.unlock()
    p?.teardown()
  }

  // MARK: – Lifecycle

  public let sessionId: String
  private let mode: Mode
  private var task: Task<Void, Never>?
  private let withAudio: Bool
  private let onError: ((String, String) -> Void)?
  private let onProgress: ((Double, Double) -> Void)?

  private init(_ p: StartParams) {
    self.sessionId = p.sessionId
    self.mode = p.mode
    self.withAudio = p.withAudio
    self.onError = p.onError
    self.onProgress = p.onProgress
  }

  // MARK: – Recording (ghi session đang xem ra .mp4 — như nút record của Imou)

  private let recLock = NSLock()
  private var recorder: Recorder?

  /// Bắt đầu ghi từ bây giờ. Trả file:// path sẽ ghi vào.
  public func startRecording() -> String {
    recLock.lock(); defer { recLock.unlock() }
    let r = Recorder()
    // Seed param-sets từ renderer (đã cache từ đầu stream) → record giữa chừng
    // vẫn build format desc ngay, chỉ chờ IDR slice kế để bắt đầu.
    if let ps = renderer.paramSetsSnapshot() {
      r.seedParamSets(vps: ps.vps, sps: ps.sps, pps: ps.pps, codec: ps.codec)
    }
    // Seed audio config (AAC) nếu audioRenderer đã parse ADTS — phải gọi TRƯỚC
    // keyframe đầu (writer chỉ add input trước startWriting).
    if let ac = audioRenderer.audioConfigSnapshot() {
      r.seedAudio(sampleRate: ac.sampleRate, channels: ac.channels)
    }
    recorder = r
    return r.fileURL.absoluteString
  }
  /// Dừng ghi + finalize. Trả file:// path (nil nếu chưa ghi được frame).
  public func stopRecording() async -> String? {
    recLock.lock(); let r = recorder; recorder = nil; recLock.unlock()
    return await r?.finish()?.absoluteString
  }
  /// Tap mọi frame (video + audio) vào recorder nếu đang record.
  /// Phân biệt ft=0xfd/0xfc (video) vs 0xf0 (audio).
  fileprivate func feedRecorder(_ frame: Data) {
    recLock.lock(); let r = recorder; recLock.unlock()
    guard let r = r, frame.count > 4 else { return }
    let ft = frame[frame.startIndex + 4]
    if ft == 0xf0 { r.appendAudio(frame) }
    else if ft == 0xfd || ft == 0xfc { r.append(frame) }
  }

  public static func start(_ params: StartParams) -> Player {
    let p = Player(params)
    register(params.sessionId, player: p)
    p.spawn(streamUrl: params.streamUrl,
            decryptKey: params.decryptKey,
            wssePassword: params.wssePassword)
    return p
  }

  private func spawn(streamUrl: String, decryptKey: Data, wssePassword: String?) {
    let mode = self.mode
    let sid = self.sessionId
    let renderer = self.renderer
    let audio = self.audioRenderer
    let withAudio = self.withAudio
    let onError = self.onError
    let onProgress = self.onProgress
    let recordTap: (Data) -> Void = { [weak self] f in self?.feedRecorder(f) }
    // Tổng thời lượng đoạn playback (giây) từ [begin, end].
    let durationSec: Double = {
      if case let .playback(begin, end, _) = mode {
        let f = DateFormatter()
        f.dateFormat = "yyyyMMdd'T'HHmmss"
        f.timeZone = TimeZone(secondsFromGMT: 0)
        f.locale = Locale(identifier: "en_US_POSIX")
        if let b = f.date(from: begin), let e = f.date(from: end) {
          return max(0, e.timeIntervalSince(b))
        }
      }
      return 0
    }()

    audio.enabled = withAudio
    if withAudio { audio.start() }

    task = Task.detached(priority: .userInitiated) { [weak self] in
      guard let self = self else { return }
      // Live reconnect state: exponential backoff capped at 30s.
      // Playback exits on first error (URL is time-bounded).
      var backoffMs: UInt64 = 1_000
      var attempt = 0
      let maxBackoffMs: UInt64 = 30_000
      reconnectLoop: while !Task.isCancelled {
      do {
      // Dedicated serial queue for the HEVC parse + decode pipeline.
      // Decoupling render from recv lets the recv thread drain TCP at full
      // speed even when the renderer slows down — without this, TCP RWIN
      // shrinks (verified via Wireshark: iOS sim went 131K → 107K window
      // in 1s) and the server throttles, then stops sending entirely.
      let renderQ = DispatchQueue(label: "imou.render.\(sid)", qos: .userInitiated)
      func dispatch(_ frame: Data, isLive: Bool) {
        let ft = frame.count > 4 ? frame[frame.startIndex + 4] : 0
        if ft == 0xf0 {
          renderQ.async { audio.enqueue(dhavFrame: frame) }
        } else {
          renderQ.async { renderer.enqueue(dhavFrame: frame, isLive: isLive) }
        }
      }

        switch mode {
        case .live:
          NSLog("[Player.\(sid)] LIVE start url=\(streamUrl.prefix(80))…")
          let client = DhRtspClient(.init(url: streamUrl, audio: withAudio))
          try await client.open()
          NSLog("[Player.\(sid)] LIVE rtsp open OK, entering chunk loop")
          renderer.reset()
          let asm = DHAVParser.Assembler(key: Data())
          var chunksIn = 0
          var lastLog = Date()
          do {
            var rendCount = 0
            try await client.runChunkLoop { chunk in
              chunksIn += 1
              renderQ.async {
                asm.push(chunk)
                for frame in asm.popFrames() {
                  rendCount += 1
                  let ft = frame.count > 4 ? frame[frame.startIndex + 4] : 0
                  if ft == 0xf0 { audio.enqueue(dhavFrame: frame); recordTap(frame) }
                  else { renderer.enqueue(dhavFrame: frame, isLive: true); recordTap(frame) }
                }
              }
              if Date().timeIntervalSince(lastLog) >= 5 {
                NSLog("[Player.\(sid)] chunks=\(chunksIn) rendered=\(rendCount) asmBuf=\(asm.bufLen)")
                lastLog = Date()
              }
              return true
            }
            NSLog("[Player.\(sid)] LIVE runChunkLoop exited (task cancelled)")
            // Stable stream → reset backoff so next disconnect retries
            // immediately rather than waiting 30s from a prior long retry.
            if chunksIn > 25 { backoffMs = 1_000; attempt = 0 }
          } catch {
            NSLog("[Player.\(sid)] LIVE runChunkLoop THROW: \(error)")
            if chunksIn > 25 { backoffMs = 1_000; attempt = 0 }
            throw error
          }
          client.close()

        case .playback:
          NSLog("[Player.\(sid)] PLAYBACK start url=\(streamUrl.prefix(80))…")
          let cfg = DhHttpClient.Config(
            url: streamUrl, audio: withAudio,
            wssePassword: wssePassword
          )
          let client = DhHttpClient(cfg)
          try await client.open()
          NSLog("[Player.\(sid)] PLAYBACK http open OK, entering chunk loop")
          renderer.reset()
          let asm = DHAVParser.Assembler(key: decryptKey)
          var chunksIn = 0
          var lastLog = Date()
          var playbackStart: Date? = nil     // mốc frame video đầu (wall-clock)
          var lastProgress = Date(timeIntervalSince1970: 0)
          // FLOW-CONTROL playback: relay bơm cả clip dạng BURST → nếu enqueue hết
          // ngay thì AVSampleBufferDisplayLayer quá tải → nhiễu + lag. Giải pháp:
          //  (1) semaphore chặn số chunk-block đang chờ (backpressure → TCP chậm lại),
          //  (2) pace enqueue theo realtime (chỉ đọc trước ~readAhead giây).
          let pbSem = DispatchSemaphore(value: 12)
          let pbFps = 25.0
          let readAheadSec = 1.0
          var producedVideo = 0
          do {
            try await client.runChunkLoop { chunk in
              chunksIn += 1
              pbSem.wait()                      // backpressure: chờ render kịp
              renderQ.async {
                asm.push(chunk)
                for frame in asm.popFrames() {
                  let ft = frame.count > 4 ? frame[frame.startIndex + 4] : 0
                  if ft == 0xf0 { audio.enqueue(dhavFrame: frame); recordTap(frame) }
                  else {
                    if playbackStart == nil { playbackStart = Date() }
                    // Pace: nếu đang chạy trước realtime quá readAhead thì ngủ bù.
                    let expected = Double(producedVideo) / pbFps
                    let actual = Date().timeIntervalSince(playbackStart!)
                    let ahead = expected - actual
                    if ahead > readAheadSec {
                      Thread.sleep(forTimeInterval: min(ahead - readAheadSec, 1.0))
                    }
                    producedVideo += 1
                    renderer.enqueue(dhavFrame: frame, isLive: false)
                    recordTap(frame)
                    // Progress (~1/sec) — dùng cùng mốc playbackStart.
                    if let op = onProgress {
                      let now = Date()
                      let elapsed = now.timeIntervalSince(playbackStart ?? now)
                      let pos = durationSec > 0 ? min(max(0, elapsed), durationSec)
                                               : max(0, elapsed)
                      if now.timeIntervalSince(lastProgress) >= 1.0 {
                        lastProgress = now
                        op(pos, durationSec)
                      }
                    }
                  }
                }
                pbSem.signal()
              }
              if Date().timeIntervalSince(lastLog) >= 5 {
                NSLog("[Player.\(sid)] PLAYBACK chunks=\(chunksIn) produced=\(producedVideo)")
                lastLog = Date()
              }
              return true
            }
            NSLog("[Player.\(sid)] PLAYBACK runChunkLoop exited")
          } catch {
            NSLog("[Player.\(sid)] PLAYBACK runChunkLoop THROW: \(error)")
            throw error
          }
          client.close()
          // Playback ends cleanly — no retry.
          if case .playback = mode { break reconnectLoop }
        }
      } catch {
        NSLog("[imou-rn-native] producer error \(sid) attempt=\(attempt): \(error)")
        if case .playback = mode {
          onError?("producer_failed", "\(error)")
          break reconnectLoop
        }
      }
      // Live: reconnect with exponential backoff (1s → 2s → 4s … 30s).
      attempt += 1
      onError?("reconnecting", "attempt=\(attempt) nextDelayMs=\(backoffMs)")
      do { try await Task.sleep(nanoseconds: backoffMs * 1_000_000) }
      catch { break reconnectLoop }
      backoffMs = min(backoffMs * 2, maxBackoffMs)
      }
    }
  }

  private func teardown() {
    task?.cancel()
    task = nil
    renderer.reset()
    audioRenderer.stop()
  }
}
