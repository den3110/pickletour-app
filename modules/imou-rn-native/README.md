# imou-rn-native

> Native React Native module cho Imou Life cameras — port toàn bộ `imou-pkg` (Python) sang Swift + Kotlin native. **App đứng riêng, không cần backend server.** Direct HEVC decode qua VideoToolbox / MediaCodec → latency ~150-300ms (giống app Imou gốc).

**Trạng thái:** ✅ Live verified iOS + Android emulator (live HEVC + H.264, AAC,
PTZ, absolute zoom, auto-reconnect, 12002 auto-relogin). Cần E2E trên Android
device thật trước ship.

📖 Đọc theo thứ tự:
1. **[`RN-DEV-HANDOFF.md`](RN-DEV-HANDOFF.md)** — quick start cho dev RN tích hợp
2. [`INTEGRATION.md`](INTEGRATION.md) — full API + kiến trúc chi tiết
3. [`CHANGELOG-android-2026-06-02.md`](CHANGELOG-android-2026-06-02.md) — log + evidence cho từng feature
4. [`RFC.md`](RFC.md) — design rationale (vì sao 2 queue, codec auto-detect, vv)

## TL;DR

```
┌───────── React Native (TS) ─────────┐
│  ImouNative.login(), .listDevices() │
│  <ImouVideoView sessionId={...} />  │
└──────────────┬──────────────────────┘
               │ NativeModule bridge
   ┌───────────┴────────────┐
   ▼                        ▼
 iOS Swift              Android Kotlin
 - CryptoCore           - CryptoCore
 - DHAVParser           - DHAVParser
 - DhHttpClient         - DhHttpClient
 - DhRtspClient         - DhRtspClient
 - SaaSClient           - SaaSClient
 - Player (FFmpegKit)   - Player (FFmpegKit)
```

## Cấu trúc thư mục

```
imou-rn-native/
├── RFC.md                       ← design doc + roadmap
├── package.json
├── imou-rn-native.podspec
├── src/index.ts                 ← TypeScript surface
├── ios/
│   ├── CryptoCore.swift            ← ✅ implemented + unit-tested
│   ├── DHAVParser.swift            ← ✅ implemented + unit-tested
│   ├── SaaSClient.swift            ← ✅ implemented (HMAC signing, UA, AuthCtx builders)
│   ├── AuthFlow.swift              ← ✅ login pipeline + Keychain session store
│   ├── DhHttpClient.swift          ← ✅ playback transport (HTTP-tunnel + WSSE)
│   ├── DhRtspClient.swift          ← ✅ live transport (DH/RTP/TCP)
│   ├── ApiClient.swift             ← ✅ list devices/recordings, playback URL, device password
│   ├── Player.swift                ← ✅ producer + FFmpegKit transcode → HLS file
│   ├── ImouNativeModule.swift      ← ✅ RN bridge (login/devices/sessions)
│   ├── ImouNativeModule.m          ← ✅ obj-c export shim
│   ├── ImouVideoViewManager.swift  ← ✅ <ImouVideoView /> via AVPlayer
│   ├── ImouVideoViewManager.m      ← ✅ obj-c export
│   └── Tests/
│       ├── CryptoCoreTests.swift
│       └── DHAVParserTests.swift
├── android/
│   ├── build.gradle
│   └── src/main/java/com/imou/rn/native/
│       ├── CryptoCore.kt           ← ✅ implemented + unit-tested
│       ├── DHAVParser.kt           ← ✅ implemented + unit-tested
│       ├── SaaSClient.kt           ← ✅ implemented (OkHttp + HMAC signing)
│       ├── AuthFlow.kt             ← ✅ login pipeline + EncryptedSharedPreferences
│       ├── DhHttpClient.kt         ← ✅ playback transport
│       ├── DhRtspClient.kt         ← ✅ live transport
│       ├── ApiClient.kt            ← ✅ high-level API
│       ├── Player.kt               ← ✅ producer + FFmpegKit + named pipe
│       ├── ImouNativeModule.kt     ← ✅ RN bridge + package registration
│       └── ImouVideoViewManager.kt ← ✅ <ImouVideoView /> via MediaPlayer
└── tests/fixtures/              ← captured frames for parity testing
    ├── imou-pb-enc2.raw         ← encrypt=2 sample (3.85 MB)
    └── imou-pb-enc3.raw         ← encrypt=3 sample (289 KB)
```

## Architecture

```
JS (TS) → ImouNative bridge → Swift/Kotlin native modules:
  Network: DhRtspClient / DhHttpClient
  Crypto:  CryptoCore (PBKDF2, AES-ECB/OFB/CBC, WSSE)
  Parse:   DHAVParser (TLV walker, frame asm, decrypt)
  Video:   HEVCNalExtractor → HEVCRenderer
             → AVSampleBufferDisplayLayer (iOS)
             → MediaCodec → Surface (Android)
  Audio:   AACRenderer
             → AudioToolbox + AVAudioEngine (iOS)
             → MediaCodec + AudioTrack (Android)
```

**Không transcode, không HLS server, không FFmpegKit dependency.** Tất cả qua OS-level hardware codecs.

## Modules implemented

| Component | iOS | Android | Status |
|---|---|---|---|
| Crypto (PBKDF2, AES, HMAC, WSSE) | `CryptoCore.swift` | `CryptoCore.kt` | ✅ + unit tests |
| DHAV TLV walker + decrypt | `DHAVParser.swift` | `DHAVParser.kt` | ✅ + unit tests |
| HEVC NAL extractor | `HEVCNalExtractor.swift` | `HEVCNalExtractor.kt` | ✅ |
| HEVC direct renderer | `HEVCRenderer.swift` (VTBox) | `HEVCRenderer.kt` (MediaCodec) | ✅ |
| AAC direct renderer | `AACRenderer.swift` (AudioTBox) | `AACRenderer.kt` (MediaCodec) | ✅ |
| HMAC-signed HTTPS client | `SaaSClient.swift` | `SaaSClient.kt` | ✅ |
| Login + Geetest pipeline | `AuthFlow.swift` | `AuthFlow.kt` | ✅ |
| Session persistence | Keychain | EncryptedSharedPreferences | ✅ |
| Playback transport (HTTP+WSSE) | `DhHttpClient.swift` | `DhHttpClient.kt` | ✅ |
| Live transport (DH/RTP/TCP) | `DhRtspClient.swift` | `DhRtspClient.kt` | ✅ |
| High-level API client | `ApiClient.swift` | `ApiClient.kt` | ✅ |
| Snapshot capture | `Snapshot.swift` (VTBox) | `Snapshot.kt` (MediaCodec) | ✅ |
| Player orchestrator | `Player.swift` | `Player.kt` | ✅ |
| RN bridge | `ImouNativeModule.swift+.m` | `ImouNativeModule.kt` + Package | ✅ |
| `<ImouVideoView />` | `ImouVideoViewManager.swift+.m` | `ImouVideoViewManager.kt` | ✅ |
| `<ImouCaptcha />` (JS) | `src/ImouCaptcha.tsx` (cross-platform via WebView) | ✅ |

## Còn lại (chỉ thiếu device testing)

| Task | Effort | Notes |
|---|---|---|
| Real-device E2E test (iPhone + Android) | 2 days | Login → live → playback → snapshot → stop |
| Memory leak audit | 1 day | Test session start/stop loop, watch retain cycles |
| Network resilience | 1 day | Wifi → 4G handoff, relay timeout recovery |
| Polish UX | 1-2 days | Loading states, error UX, retry button |

**Total remaining: ~5-6 ngày** of device + polish work.

## Reference

| Câu hỏi | Tìm ở |
|---|---|
| Protocol signing keys, login flow | `imou-pkg/imou/auth.py`, `crypto.py` |
| DHAV frame format spec | memory `[imou_decrypter_jni]` Sessions 5-7 |
| AES key derivation formulas | memory `[imou_decrypter_jni]` Session 7 |
| WSSE auth (encrypt=3) | memory `[imou_decrypter_jni]` Session 7 footer |
| Geetest captcha integration | `imou-rn-geetest/` (đã có skeleton) |
| WebView fallback flow | `imou-rn-webview/` |
| End-to-end Python reference | `imou-pkg/imou/` toàn bộ |
| HTTP bridge sample (current MVP) | `imou-pkg/imou/webview.py` |

## Testing strategy

**Parity tests:** mỗi component port có unit test so sánh với Python reference.

```bash
# iOS
cd ios && xcodebuild test -scheme ImouRnNative-Tests

# Android
cd android && ./gradlew test
```

Verified ground truths (fixtures `tests/fixtures/`):

- `vodFrameKey('5858CBDPSF15233', 'L28F4128')` = `70263a9c67009bf2d67aee495c25f5b0`
- enc2 first I-frame VPS bytes = `0000000140010c01ffff01600000030000030000030000030096ac0900000001`
- WSSE digest (nonce=zeros, time=2026-06-01T09:21:42Z, pwd=L28F4128) = `CU0AQEUqwtmnhRgcQO9hji7FORU=`

## License

MIT — module này chỉ implement protocol, **không bundle binary của Dahua/Imou**. Nếu bạn cần cấp phép thương mại từ Dahua cho SDK chính thức, xem [LeChange OpenSDK](https://open.lechange.com/) thay thế.
