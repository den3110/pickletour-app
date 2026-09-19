// PlaybackDownloader.swift — `Recorder`: ghi (record) session đang xem ra .mp4.
//
// Giống nút "record" của app Imou: user xem live/playback, bấm record → quay
// lại đoạn ĐANG XEM từ lúc bấm tới lúc stop. KHÔNG mở stream riêng — Player
// đẩy (feed) chính các DHAV video frame đang render vào đây.
//
//   DHAV video frame → HEVCNalExtractor (codec-aware) → CMSampleBuffer
//     (compressed, passthrough) → AVAssetWriterInput → .mp4
//
// PTS: wall-clock từ frame đầu (DHAV ts@0x10 không tăng cho SD). v1 VIDEO-ONLY.

import Foundation
import AVFoundation
import VideoToolbox

public final class Recorder {

  public let fileURL: URL
  private let psCache = HEVCNalExtractor.ParamSetCache()
  private var detectedCodec: VideoCodec?
  private var fmtDesc: CMVideoFormatDescription?
  private var audioFmtDesc: CMAudioFormatDescription?
  private var writer: AVAssetWriter?
  private var videoInput: AVAssetWriterInput?
  private var audioInput: AVAssetWriterInput?
  private var audioSampleRate: Double = 0
  private var started = false
  private var startWall: Date?
  private var frameCount = 0          // tổng video frames đã ghi thành công
  private var audioFrameCount: Int64 = 0
  private var droppedAppend = 0       // append() return false (reject)
  private let videoTimescale: CMTimeScale = 25_000     // 1ms-precision tại 25fps
  private let assumedFps: Int64 = 25
  private let lock = NSLock()   // serialize append (renderQ) vs finish (module)

  /// Seed param-sets (VPS/SPS/PPS) lấy từ renderer đang chạy — để record giữa
  /// chừng vẫn build được format desc ngay (param-sets chỉ gửi lúc stream start).
  public func seedParamSets(vps: Data?, sps: Data, pps: Data, codec: VideoCodec) {
    lock.lock(); defer { lock.unlock() }
    if fmtDesc != nil { return }
    detectedCodec = codec
    fmtDesc = try? buildFormatDesc(vps: vps, sps: sps, pps: pps, codec: codec)
    NSLog("[Recorder] seeded paramsets codec=\(codec) ok=\(fmtDesc != nil)")
  }

  /// Seed audio (AAC) config. PHẢI gọi TRƯỚC keyframe đầu — vì AVAssetWriter
  /// chỉ accept add input trước startWriting. Nếu gọi muộn → audio bỏ qua.
  public func seedAudio(sampleRate: Double, channels: UInt32) {
    lock.lock(); defer { lock.unlock() }
    if audioFmtDesc != nil || started { return }
    audioSampleRate = sampleRate
    // Build CMAudioFormatDescription cho AAC LC. Apple yêu cầu ASBD chính xác
    // + magic cookie (ESDS) để mux MP4 đọc lại được. Không có cookie thì player
    // nhiều khi không biết decode → muted track. Build ESDS thủ công bên dưới.
    var asbd = AudioStreamBasicDescription(
      mSampleRate: sampleRate, mFormatID: kAudioFormatMPEG4AAC,
      mFormatFlags: 0,
      mBytesPerPacket: 0, mFramesPerPacket: 1024,
      mBytesPerFrame: 0, mChannelsPerFrame: channels,
      mBitsPerChannel: 0, mReserved: 0)
    var fmt: CMAudioFormatDescription?
    // Magic cookie cho AAC LC = **full ESDS atom** (không chỉ AudioSpecificConfig
    // 2 byte). AVAssetWriter ghi cookie này vào esds box của MP4; thiếu thì
    // ffmpeg/QuickTime decode sai channels/sr.
    //   ASC bits: ObjectType(5)=2 (AAC LC) | SR-index(4) | channelCfg(4) | pad(3)
    let srTable: [Double: UInt8] = [
      96000:0, 88200:1, 64000:2, 48000:3, 44100:4, 32000:5,
      24000:6, 22050:7, 16000:8, 12000:9, 11025:10, 8000:11, 7350:12,
    ]
    let srIdx = srTable[sampleRate] ?? 8
    let chCfg = UInt8(min(channels, 7))
    let asc: [UInt8] = [(2 << 3) | (srIdx >> 1),
                       ((srIdx & 0x01) << 7) | (chCfg << 3)]
    // ESDS structure (ISO/IEC 14496-1):
    //   ES_Descr (0x03) { ES_ID(2)=0 | flags(1)=0 | DecoderConfigDescr | SLConfigDescr }
    //   DecoderConfigDescr (0x04) { ObjectType=0x40 | (streamType=5<<2 | up=0 | rsv=1)=0x15
    //                               | bufSize(3) | maxBitrate(4) | avgBitrate(4) | DSI }
    //   DSI (0x05) { ASC }
    //   SLConfigDescr (0x06) { predefined=0x02 (MP4) }
    let dsi: [UInt8] = [0x05, UInt8(asc.count)] + asc
    let dcdBody: [UInt8] = [
      0x40, 0x15,
      0x00, 0x18, 0x00,                    // bufferSizeDB = 6144
      0x00, 0x00, 0x80, 0x00,              // maxBitrate
      0x00, 0x00, 0x80, 0x00,              // avgBitrate
    ] + dsi
    let dcd: [UInt8] = [0x04, UInt8(dcdBody.count)] + dcdBody
    let sl: [UInt8] = [0x06, 0x01, 0x02]
    let esBody: [UInt8] = [0x00, 0x00, 0x00] + dcd + sl      // ES_ID(2)=0 + flags(1)=0
    let cookie: [UInt8] = [0x03, UInt8(esBody.count)] + esBody
    let st = cookie.withUnsafeBufferPointer { ptr -> OSStatus in
      CMAudioFormatDescriptionCreate(
        allocator: kCFAllocatorDefault, asbd: &asbd,
        layoutSize: 0, layout: nil,
        magicCookieSize: cookie.count, magicCookie: ptr.baseAddress,
        extensions: nil, formatDescriptionOut: &fmt)
    }
    audioFmtDesc = (st == noErr) ? fmt : nil
    NSLog("[Recorder] seeded audio \(sampleRate)Hz \(channels)ch ok=\(audioFmtDesc != nil)")
  }

  public init() {
    fileURL = URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
      .appendingPathComponent("imou-rec-\(UUID().uuidString).mp4")
    try? FileManager.default.removeItem(at: fileURL)
  }

  /// Feed 1 DHAV **video** frame (gọi từ Player render path). No-op nếu đã finish.
  public func append(_ frame: Data) {
    lock.lock(); defer { lock.unlock() }
    if videoInput == nil && started { return }   // đã finish
    guard frame.count > 0x18 else { return }
    let ft = frame[frame.startIndex + 4]
    guard ft == 0xfd || ft == 0xfc else { return }
    let extHdrLen = Int(frame[frame.startIndex + 0x16])
    let pStart = frame.startIndex + 0x18 + extHdrLen
    let pEnd = frame.endIndex - 8
    guard pStart < pEnd else { return }
    let payload = frame.subdata(in: pStart..<pEnd)
    let nalus = HEVCNalExtractor.extractNalus(payload, codecHint: detectedCodec)
    if nalus.isEmpty { return }
    // Param-sets thường chỉ gửi lúc stream START → nếu record giữa chừng sẽ
    // miss; vì vậy Player seedParamSets() từ renderer (đã cache sẵn) để fmtDesc
    // có ngay. KHÔNG overwrite detectedCodec sau khi đã seed — giữ codec đúng
    // mà renderer đã xác định, tránh sticky đoán nhầm từ slice giữa stream.
    if fmtDesc == nil {
      if detectedCodec == nil { detectedCodec = nalus.first?.codec }
      psCache.absorb(nalus)
      if psCache.isComplete, let sps = psCache.sps, let pps = psCache.pps {
        fmtDesc = try? buildFormatDesc(vps: psCache.vps, sps: sps, pps: pps,
                                        codec: psCache.codec)
      }
    }
    guard let fd = fmtDesc else { return }

    if writer == nil {
      guard let w = try? AVAssetWriter(outputURL: fileURL, fileType: .mp4) else { return }
      let vi = AVAssetWriterInput(mediaType: .video, outputSettings: nil,
                                   sourceFormatHint: fd)
      vi.expectsMediaDataInRealTime = true
      guard w.canAdd(vi) else { return }
      w.add(vi)
      // Audio track (passthrough AAC) — chỉ add nếu đã seed audio.
      if let aFmt = audioFmtDesc {
        let ai = AVAssetWriterInput(mediaType: .audio, outputSettings: nil,
                                     sourceFormatHint: aFmt)
        ai.expectsMediaDataInRealTime = true
        if w.canAdd(ai) { w.add(ai); audioInput = ai }
      }
      writer = w; videoInput = vi
    }
    guard let vi = videoInput, let w = writer else { return }

    let isKey = nalus.contains { $0.type.isKeyframe }
    if !started {
      if !isKey { return }                 // MP4 phải bắt đầu bằng keyframe
      w.startWriting(); w.startSession(atSourceTime: .zero)
      started = true; startWall = Date()
      NSLog("[Recorder] started writing (codec=\(psCache.codec))")
    }
    let dataNals = nalus.filter { $0.type.isKeyframe || $0.type == .slice }
    if dataNals.isEmpty { return }
    let blob = HEVCNalExtractor.toLengthPrefixed(dataNals)
    // STRICT-MONOTONIC PTS: frame counter × 1/fps. Trước dùng wall-clock
    // (resolution ms), khi frame đến burst nhiều frame cùng ms → cùng PTS →
    // AVAssetWriterInput reject silent → MP4 chỉ giữ 1 frame (đứng hình).
    let pts = CMTime(value: Int64(frameCount) * Int64(videoTimescale) / assumedFps,
                     timescale: videoTimescale)
    guard let sample = try? makeSample(blob: blob, fmt: fd, pts: pts) else { return }
    if !vi.isReadyForMoreMediaData {
      droppedAppend += 1   // writer backlog, drop frame này
      return
    }
    if vi.append(sample) {
      frameCount += 1
    } else {
      droppedAppend += 1
      NSLog("[Recorder] vi.append REJECT pts=\(pts.seconds) status=\(writer?.status.rawValue ?? -1) err=\(writer?.error?.localizedDescription ?? "nil")")
    }
  }

  /// Feed 1 DHAV **audio** frame (ft=0xf0). Tách payload ADTS sau header 7B.
  public func appendAudio(_ frame: Data) {
    lock.lock(); defer { lock.unlock() }
    guard let ai = audioInput, let aFmt = audioFmtDesc, started else { return }
    if !ai.isReadyForMoreMediaData { return }
    guard frame.count > 0x20, frame.prefix(4) == Data("DHAV".utf8) else { return }
    let b = frame.startIndex
    guard frame[b + 4] == 0xf0 else { return }
    let extLen = Int(frame[b + 0x16])
    let pStart = b + 0x18 + extLen
    let pEnd = frame.endIndex - 8
    guard pStart + 7 < pEnd else { return }
    guard frame[pStart] == 0xFF, (frame[pStart + 1] & 0xF0) == 0xF0 else { return }
    let len = (Int(frame[pStart + 3] & 0x03) << 11)
            | (Int(frame[pStart + 4]) << 3)
            | (Int(frame[pStart + 5]) >> 5)
    let actualEnd = min(pStart + len, pEnd)
    guard actualEnd > pStart + 7 else { return }
    // Raw AAC payload (1024 samples @ sampleRate, không ADTS header).
    let payload = frame.subdata(in: (pStart + 7)..<actualEnd)

    // PTS audio strictly monotonic: counter × 1024 / sampleRate.
    let ts = CMTimeScale(audioSampleRate)
    let pts = CMTime(value: audioFrameCount * 1024, timescale: ts)
    var bb: CMBlockBuffer?
    let alloc = CMBlockBufferCreateWithMemoryBlock(
      allocator: kCFAllocatorDefault, memoryBlock: nil, blockLength: payload.count,
      blockAllocator: nil, customBlockSource: nil, offsetToData: 0,
      dataLength: payload.count, flags: 0, blockBufferOut: &bb)
    guard alloc == kCMBlockBufferNoErr, let bb = bb else { return }
    _ = payload.withUnsafeBytes {
      CMBlockBufferReplaceDataBytes(with: $0.baseAddress!, blockBuffer: bb,
                                    offsetIntoDestination: 0, dataLength: payload.count)
    }
    var timing = CMSampleTimingInfo(duration: CMTime(value: 1024, timescale: ts),
                                     presentationTimeStamp: pts, decodeTimeStamp: .invalid)
    var sz = payload.count
    var sample: CMSampleBuffer?
    let st = CMSampleBufferCreateReady(
      allocator: kCFAllocatorDefault, dataBuffer: bb, formatDescription: aFmt,
      sampleCount: 1, sampleTimingEntryCount: 1, sampleTimingArray: &timing,
      sampleSizeEntryCount: 1, sampleSizeArray: &sz, sampleBufferOut: &sample)
    guard st == noErr, let sample = sample else { return }
    if ai.append(sample) { audioFrameCount += 1 }
  }

  /// Finalize → file URL (nil nếu chưa ghi được frame nào).
  public func finish() async -> URL? {
    lock.lock()
    let ok = started && frameCount > 0
    let w = writer, vi = videoInput
    writer = nil; videoInput = nil; audioInput = nil
    lock.unlock()
    NSLog("[Recorder] finish: started=\(started) frames=\(frameCount) audio=\(audioFrameCount) dropped=\(droppedAppend)")
    guard ok, let w = w, let vi = vi else { return nil }
    vi.markAsFinished()
    audioInput?.markAsFinished()
    await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in
      w.finishWriting { c.resume() }
    }
    NSLog("[Recorder] finishWriting → status=\(w.status.rawValue) err=\(w.error?.localizedDescription ?? "nil")")
    return w.status == .completed ? fileURL : nil
  }

  // MARK: – Internals

  private func makeSample(blob: Data, fmt: CMVideoFormatDescription,
                          pts: CMTime) throws -> CMSampleBuffer {
    var bb: CMBlockBuffer?
    let alloc = CMBlockBufferCreateWithMemoryBlock(
      allocator: kCFAllocatorDefault, memoryBlock: nil, blockLength: blob.count,
      blockAllocator: nil, customBlockSource: nil, offsetToData: 0,
      dataLength: blob.count, flags: 0, blockBufferOut: &bb)
    guard alloc == kCMBlockBufferNoErr, let bb = bb else {
      throw NSError(domain: "rec", code: 1)
    }
    _ = blob.withUnsafeBytes {
      CMBlockBufferReplaceDataBytes(with: $0.baseAddress!, blockBuffer: bb,
                                    offsetIntoDestination: 0, dataLength: blob.count)
    }
    var timing = CMSampleTimingInfo(duration: CMTime(value: 1, timescale: 25),
                                     presentationTimeStamp: pts, decodeTimeStamp: .invalid)
    var sizeArr = blob.count
    var sample: CMSampleBuffer?
    let st = CMSampleBufferCreateReady(
      allocator: kCFAllocatorDefault, dataBuffer: bb, formatDescription: fmt,
      sampleCount: 1, sampleTimingEntryCount: 1, sampleTimingArray: &timing,
      sampleSizeEntryCount: 1, sampleSizeArray: &sizeArr, sampleBufferOut: &sample)
    guard st == noErr, let sample = sample else { throw NSError(domain: "rec", code: 2) }
    return sample
  }

  /// Codec-aware format desc (HEVC: VPS+SPS+PPS; H.264: SPS+PPS).
  private func buildFormatDesc(vps: Data?, sps s: Data, pps p: Data,
                               codec: VideoCodec) throws -> CMVideoFormatDescription {
    var fmt: CMVideoFormatDescription?
    let status: OSStatus
    switch codec {
    case .hevc:
      guard let v = vps else { throw NSError(domain: "rec", code: 3) }
      status = v.withUnsafeBytes { vR in s.withUnsafeBytes { sR in p.withUnsafeBytes { pR in
        let ptrs: [UnsafePointer<UInt8>] = [
          vR.bindMemory(to: UInt8.self).baseAddress!,
          sR.bindMemory(to: UInt8.self).baseAddress!,
          pR.bindMemory(to: UInt8.self).baseAddress!]
        let sizes = [v.count, s.count, p.count]
        return ptrs.withUnsafeBufferPointer { pb in sizes.withUnsafeBufferPointer { sb in
          CMVideoFormatDescriptionCreateFromHEVCParameterSets(
            allocator: kCFAllocatorDefault, parameterSetCount: 3,
            parameterSetPointers: pb.baseAddress!, parameterSetSizes: sb.baseAddress!,
            nalUnitHeaderLength: 4, extensions: nil, formatDescriptionOut: &fmt)
        }}
      }}}
    case .h264:
      status = s.withUnsafeBytes { sR in p.withUnsafeBytes { pR in
        let ptrs: [UnsafePointer<UInt8>] = [
          sR.bindMemory(to: UInt8.self).baseAddress!,
          pR.bindMemory(to: UInt8.self).baseAddress!]
        let sizes = [s.count, p.count]
        return ptrs.withUnsafeBufferPointer { pb in sizes.withUnsafeBufferPointer { sb in
          CMVideoFormatDescriptionCreateFromH264ParameterSets(
            allocator: kCFAllocatorDefault, parameterSetCount: 2,
            parameterSetPointers: pb.baseAddress!, parameterSetSizes: sb.baseAddress!,
            nalUnitHeaderLength: 4, formatDescriptionOut: &fmt)
        }}
      }}
    }
    guard status == noErr, let fmt = fmt else { throw NSError(domain: "rec", code: 4) }
    return fmt
  }
}
