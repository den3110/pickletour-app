# RFC — `imou-rn-native`: native RN module cho Imou Life protocol

**Trạng thái**: research / design (chưa có code production)
**Audience**: kỹ sư RN + mobile (iOS/Android) implement module này
**Mục tiêu**: thay thế Python backend (`imou-pkg`) bằng module RN native — app đứng riêng, không cần server side-cart

---

## 1. Mục tiêu & non-goals

### Mục tiêu
- App RN gọi 1 module duy nhất, **không cần backend Python**
- Hoạt động trên **iOS + Android** (arm64 + armv7)
- Login headless, list cams, live view, SD playback (cả encrypt=2 và encrypt=3)
- Render trực tiếp vào `<Video>` / native SurfaceView, không phụ thuộc HLS server bên ngoài
- Hiệu năng: live < 1s start-time, playback < 2s buffer

### Non-goals (giai đoạn 1)
- Cấu hình thiết bị (setup Wi-Fi, OTA, v.v.) — chỉ xem
- P2P direct (NAT traversal) — relay là đủ; chỉ làm khi user yêu cầu low-latency
- Tự render UI playback bar — để RN/JS làm

---

## 2. So sánh 3 cách tiếp cận

### **Option A — Full native rewrite** ⭐ KHUYẾN NGHỊ

Port `imou-pkg` Python → Swift (iOS) + Kotlin (Android) trực tiếp. Crypto bằng CommonCrypto/javax.crypto. Networking bằng URLSession/OkHttp. Video qua **FFmpegKit** mobile (DHAV demuxer có sẵn từ FFmpeg 6+).

| Pros | Cons |
|---|---|
| ✅ Hoàn toàn legal (chỉ implement protocol, không copy code Dahua) | ❌ ~3-4 tuần dev/platform để parity với Python |
| ✅ Bundle size nhỏ (~6-8 MB cho FFmpegKit-min) | ❌ Maintain 2 code base song song iOS/Android |
| ✅ Không phụ thuộc Dahua SDK license | |
| ✅ Có sẵn Python reference để debug từng bước | |
| ✅ Auth Geetest đã có skeleton ở `imou-rn-geetest` | |

### **Option B — Bundle `libCommonSDK.so` + JNI wrapper**

Trích `libCommonSDK.so` (Android, arm64-v8a, 25 MB) từ APK Imou Life, viết JNI wrapper từ Java class `com.lechange.common.*`. iOS không có `.dylib` tương ứng → vẫn phải rewrite cho iOS.

| Pros | Cons |
|---|---|
| ✅ Android dùng ngay decoder + protocol gốc → 0 risk decode quirk | ❌ Bundle size +25 MB chỉ riêng `libCommonSDK.so` |
| ✅ Có sẵn MIKEY-PSK, P2P, các tính năng hidden | ❌ **License rủi ro**: redistribute `.so` của Dahua mà không có thỏa thuận |
| | ❌ iOS vẫn phải native rewrite → effort vẫn lớn |
| | ❌ Khó debug khi crash bên trong `.so` (stripped, no symbols) |
| | ❌ Cập nhật bản app official → có thể không tương thích |

### **Option C — Embed Imou OpenSDK / LeChange SDK chính thức**

Dahua/LeChange công bố **OpenSDK** cho 3rd-party app:
- Android: `com.lechange.opensdk:opensdk` (AAR, ~30 MB)
- iOS: `LCOpenSDK_For_iOS` framework

Đăng ký account `open.lechange.com` → free tier ~30 cam/account, có docs đầy đủ.

| Pros | Cons |
|---|---|
| ✅ Có docs chính thức, support email | ❌ **YÊU CẦU app key/secret riêng** — phải đăng ký thương mại với Dahua |
| ✅ Stable, được Dahua maintain | ❌ Phải dùng Open API cho login (user đã từ chối path này) |
| ✅ Cả iOS + Android | ❌ Quota/billing — không phải miễn phí thực sự cho production |
| | ❌ Account user Imou Life **không tương thích** với OpenSDK API |

### Recommendation

→ **Option A** (full native rewrite). Lý do quyết định:
1. User đã từ chối Open API (Option C)
2. Bundle `.so` Dahua (Option B) là rủi ro pháp lý cao + iOS không có .so
3. Option A leverage được toàn bộ RE work đã làm — protocol đã hiểu kỹ
4. Có Python reference (`imou-pkg`) để parity-test từng bước

---

## 3. Kiến trúc đề xuất

```
┌──────────────────────────────────────────────────────────────┐
│                    React Native (TypeScript)                  │
│  src/index.ts ─ ImouNative.login() / .devices() / .play(...)  │
└──────────────────────────────┬───────────────────────────────┘
                               │ NativeModule bridge
                ┌──────────────┴──────────────┐
                ▼                              ▼
┌────────────────────────────┐  ┌────────────────────────────┐
│   iOS — Swift              │  │  Android — Kotlin          │
│   ImouNativeModule.swift   │  │  ImouNativeModule.kt       │
│   ├ CryptoCore.swift       │  │  ├ CryptoCore.kt           │
│   ├ DHAVParser.swift       │  │  ├ DHAVParser.kt           │
│   ├ DhRtspClient.swift     │  │  ├ DhRtspClient.kt         │
│   ├ DhHttpClient.swift     │  │  ├ DhHttpClient.kt         │
│   ├ SaaSClient.swift       │  │  ├ SaaSClient.kt           │
│   ├ AuthFlow.swift         │  │  ├ AuthFlow.kt             │
│   └ Player.swift           │  │  └ Player.kt               │
│      ─ FFmpegKit / VTbox   │  │     ─ FFmpegKit / MediaCodec│
└────────────────────────────┘  └────────────────────────────┘
                ▼                              ▼
       ┌─────────────────────────────────────────────┐
       │     Imou Cloud + Relay + Camera             │
       └─────────────────────────────────────────────┘
```

**Shared layer C++ (optional):** crypto + DHAV parser có thể viết bằng C++ shared và bridge cả 2 platform. Trade-off: thêm complexity build. Đề xuất là **giữ Swift/Kotlin riêng** cho v1 — dễ debug, đủ hiệu năng (crypto chỉ ~256 byte/frame).

---

## 4. Module breakdown

### 4.1. `CryptoCore` (~200 LoC mỗi platform)

Port từ `imou/crypto.py`:

| Function | iOS (CommonCrypto/CryptoKit) | Android (javax.crypto) |
|---|---|---|
| MD5 hex upper | `Insecure.MD5.hash(...)` | `MessageDigest.getInstance("MD5")` |
| PBKDF2-HMAC-SHA256 | `CCKeyDerivationPBKDF` | `SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")` |
| AES-256-CBC PKCS7 | `CryptoKit.AES.GCM` or `CCCrypt` | `Cipher.getInstance("AES/CBC/PKCS5Padding")` |
| AES-128-ECB | `CCCrypt(kCCAlgorithmAES, kCCOptionECBMode, ...)` | `Cipher.getInstance("AES/ECB/NoPadding")` |
| AES-256-OFB | `CCCrypt(... kCCAlgorithmAES, kCCModeOFB)` | `Cipher.getInstance("AES/OFB/NoPadding")` |
| HMAC-SHA256 b64 | `CryptoKit.HMAC` | `Mac.getInstance("HmacSHA256")` |

**Key derivations (giữ nguyên Python formula):**
- `vodFrameKey(devSn, devPwd) -> 16B`
- `vodFrameKeyEnc3(devSn, devPwd) -> 32B`
- `deviceAesKey(devSn) -> 32B` (cho cred decrypt)

### 4.2. `DHAVParser` (~150 LoC)

Port từ `imou/crypto.py` + `imou/dh_rtsp.decrypt_dhav_stream`:
- `walkExtHdr(ext) -> [TLV]` — robust (unknown byte = 2-byte entry, fix Session 7)
- `findB5(ext) -> Data?`
- `hasExtType(ext, type) -> Bool`
- `decryptVodFrame(frame, key) -> Data` — auto-detect enc2/enc3 từ ext
- `assembleFrames(chunks: AsyncSequence<Data>) -> AsyncSequence<Data>` — find DHAV magic, extract size from offset 12

### 4.3. `DhHttpClient` (~250 LoC) — playback transport

Port từ `imou/dh_rtsp.DhHttpSession`:
- TCP connect tới relay:9132
- Gửi `GET /vod/...rtpxav?... HTTP/1.0` + headers (`Accept: application/x-rtsp-tunnelled`, optional WSSE)
- Parse response header: `Private-Length` (SDP), `Session-Id`
- Đọc interleaved binary: `$<channel:u8><length:u16-BE><RTP-header-12B><DHAV-payload>`
- Yield chunks vào `DHAVParser.assembleFrames`

**WSSE auth (encrypt=3):**
```swift
let nonceHex = SecureRandom().hexString(16)
let created = ISO8601DateFormatter().string(...)
let digest = SHA1(nonceHex + created + devPwd).base64
let wsseHeader = """
Authorization: WSSE profile="UsernameToken"
WSSE: UsernameToken Username="admin", PasswordDigest="\(digest)", Nonce="\(nonceHex)", Created="\(created)"
"""
```

### 4.4. `DhRtspClient` (~300 LoC) — live transport

Port từ `imou/dh_rtsp.DhRtspSession`:
- RTSP OPTIONS / DESCRIBE / SETUP / PLAY / TEARDOWN
- **Critical**: `Transport: DH/RTP/TCP;unicast;interleaved=0-1` (Dahua packetization, không phải stock RTP/AVP)
- Audio: thêm SETUP cho `trackID=1` với `interleaved=2-3`

### 4.5. `SaaSClient` (~400 LoC) — HTTPS API

Port từ `imou/_http.py` + `imou/api.py`:
- `POST https://<host>/pcs/v1/<method>` với HMAC-SHA256 b64 signature
- 4 loại auth key:
  - `account\<phone>` → `MD5(MD5(password))`
  - `default\<AppKey>` → `MD5(AppSecret)`
  - `uuid\<id>` (Login) → raw token
  - `uuid\<id>` (data API) → `MD5(token)`
- Wrapper methods: `getToken`, `checkGeetest4`, `login`, `getDeviceList`, `setIotService`, `verifyPassword`, `getPlaybackTransferStreamUrlByTime`, ...

### 4.6. `AuthFlow` (~200 LoC + Geetest skeleton)

- Reuse `imou-rn-geetest` cho UI captcha (đã có skeleton)
- Pipeline: `GetToken` → nếu cần captcha → render Geetest (RN modal) → `CheckGeeTest4` → `GetToken` lại → `user.account.Login`
- Session persistence:
  - iOS: Keychain (`kSecAttrAccessibleAfterFirstUnlock`)
  - Android: EncryptedSharedPreferences (Jetpack Security)

### 4.7. `Player` (~500 LoC) — video render

**Đề xuất**: dùng [FFmpegKit](https://github.com/arthenica/ffmpeg-kit) (LGPLv3, đã build sẵn binary):
- Bundle FFmpegKit "min-gpl" hoặc "video-stt" (~30 MB iOS / 25 MB Android) — đảm bảo có `dhav` demuxer + HEVC + AAC decoder
- ⚠️ FFmpegKit-min KHÔNG có `dhav` demuxer; cần build custom: `--enable-demuxer=dhav --enable-demuxer=mov --enable-decoder=hevc --enable-decoder=aac`
- Hoặc: dùng [mobile-ffmpeg fork](https://github.com/tanersener/ffmpeg-kit) custom build

**Pipeline:**
```
DhHttpClient/DhRtspClient stream
   ↓ Data chunks
DHAVParser.assembleFrames + decryptVodFrame
   ↓ plaintext DHAV frames (HEVC NALs + AAC)
FFmpeg AVIOContext (custom read callback) → DHAV demuxer
   ↓ video packets + audio packets
HEVC decoder (hardware: VideoToolbox / MediaCodec)
   ↓ CVPixelBuffer / Surface
Render: MTKView (iOS) / SurfaceView (Android)
   ← React Native: expose qua viewManager
Audio: AAC decoder → AudioQueue / AudioTrack
```

**Alternative**: tự viết DHAV demuxer (đơn giản, ~200 LoC) + dùng AVFoundation / MediaCodec trực tiếp cho HEVC. Bỏ FFmpeg → giảm bundle 25 MB.

Đề xuất: **FFmpeg cho v1** (less risk), **native decoder cho v2** (tối ưu bundle).

---

## 5. TypeScript surface API

```typescript
// src/index.ts

export interface Camera {
  deviceId: string;
  name: string;
  model: string;
  productId: string;
  online: boolean;
}

export interface Recording {
  begin: string;        // YYYYMMDDTHHMMSS
  end: string;
  durationS: number;
  typeName: 'motion' | 'manual' | 'schedule' | 'alarm';
}

export interface ImouNative {
  // ─── Auth ─────────────────────────────────────────────
  login(opts: {
    phone: string;
    password: string;
    areaCode: string;
    captchaSolver?: 'webview' | { apiKey: string };
  }): Promise<void>;
  logout(): Promise<void>;
  isLoggedIn(): Promise<boolean>;

  // ─── Devices ──────────────────────────────────────────
  listDevices(): Promise<Camera[]>;
  listRecordings(deviceId: string, date: string): Promise<Recording[]>;

  // ─── Video (returns a viewTag to attach to <ImouVideoView>) ─────
  startLive(deviceId: string): Promise<{ sessionId: string }>;
  startPlayback(
    deviceId: string,
    begin: string,
    end: string,
    opts?: { encrypt?: 2 | 3; withAudio?: boolean }
  ): Promise<{ sessionId: string }>;
  stopSession(sessionId: string): Promise<void>;

  // ─── Snapshot ─────────────────────────────────────────
  snapshot(deviceId: string): Promise<{ uri: string }>;   // JPEG file URI
}

// React component wrapping native view
export const ImouVideoView: React.ComponentType<{
  sessionId: string;
  onError?: (e: { code: string; message: string }) => void;
  onReady?: () => void;
  resizeMode?: 'cover' | 'contain';
  style?: ViewStyle;
}>;
```

---

## 6. Roadmap & effort estimate

| Phase | Scope | Effort (per platform) | Total |
|---|---|---|---|
| **0. RFC + skeleton** | This doc, dir structure, package.json/podspec/gradle, stub TS interface | 1 ngày | 1 ngày |
| **1. Crypto + DHAV parser** | Port `imou.crypto` + `imou.dh_rtsp.decrypt_dhav_stream` → Swift + Kotlin. Unit tests bằng captured frame fixtures. | 2 ngày | 4 ngày |
| **2. SaaS API + Auth** | `pcs/v1` signing, Geetest integration (reuse skeleton), session persistence | 3 ngày | 6 ngày |
| **3. Playback transport** | `DhHttpClient` + WSSE auth, AsyncSequence/Flow integration | 2 ngày | 4 ngày |
| **4. Live transport** | `DhRtspClient` (DESCRIBE/SETUP/PLAY) | 2 ngày | 4 ngày |
| **5. Video render (FFmpeg)** | Bundle FFmpegKit custom build, custom AVIO callback, hook to MTKView/SurfaceView | 4 ngày | 8 ngày |
| **6. ViewManager + RN bridge** | `ImouVideoView` native component, viewTag → session mapping | 2 ngày | 4 ngày |
| **7. Integration test** | End-to-end on physical iPhone + Android device, multi-cam test, session edge cases | 3 ngày | 3 ngày |
| **8. Polish** | Error mapping, logging, snapshot, audio toggle, low-bandwidth detection | 3 ngày | 3 ngày |
| **TOTAL** | | | **~37 ngày dev** (~7-8 tuần với 1 dev/platform parallel) |

Có thể **giảm xuống ~4 tuần** nếu:
- 1 dev iOS + 1 dev Android làm song song
- Skip live (chỉ playback) cho MVP
- Bỏ FFmpeg, dùng AVFoundation/MediaCodec trực tiếp + tự viết DHAV demuxer

---

## 7. Risks & mitigations

| Risk | Mức độ | Mitigation |
|---|---|---|
| FFmpegKit không có `dhav` demuxer trong prebuild | High | Build custom với `--enable-demuxer=dhav`, hoặc viết DHAV demuxer tự thân (~200 LoC) |
| HEVC reference quirk (POC out of range) trong stream gốc | Medium | Walker fix đã giải quyết — I-frame decrypt đúng → ffmpeg/MediaCodec/VideoToolbox decode được |
| Session contention (1 session/account) | High | UI flow: cảnh báo user nếu app official mở; auto re-login |
| Bundle size > 50 MB | Medium | FFmpeg custom build min profile (~15 MB), drop unused codecs |
| App Store reject vì reverse engineer | Low | Module CHỈ implement protocol, không bundle binary từ Dahua. Có thể default disable cho App Store nếu cần |
| Camera firmware update đổi protocol | Low | Đã RE đầy đủ; thay đổi sẽ qua MQTT service codes — easy to patch |
| Geetest captcha v4 thay đổi | Medium | Reuse 2captcha as fallback; UI flow đã có ở `imou-rn-webview` |

---

## 8. License notes

- **FFmpegKit**: LGPLv3 default — link dynamic được. App store OK nếu link dynamic + cung cấp source link.
- **Open-source crypto**: Apple CommonCrypto (Apache 2 effectively), Android javax.crypto (Apache 2). OK.
- **Imou/Dahua protocol**: không có copyright trên protocol design (clean-room reimplementation từ RE). OK.
- **Đừng bundle**: `libCommonSDK.so` (Dahua proprietary), bất kỳ file `.dex/.aar` nào từ Imou Life APK.

---

## 9. Acceptance criteria

| Criteria | Verified by |
|---|---|
| Login với 2captcha → có session, list được cams | iOS XCTest + Android JUnit |
| `vodFrameKey('5858CBDPSF15233', 'L28F4128') == 70263a9c67009bf2d67aee495c25f5b0` | Unit test fixture |
| Decrypt I-frame từ `/tmp/imou-pb-enc2.raw` ra `00 00 00 01 40 01 0c 01...` | Unit test fixture |
| Decrypt enc3 I-frame ra valid VPS NAL | Unit test fixture |
| Live view Cam pick 2 → 5s không lỗi | E2E manual test |
| SD playback 60s → mượt 14fps, có audio | E2E manual test |
| Bundle size <= 50 MB (iOS ipa, Android aab arm64) | CI gate |
| App start cold → live view ready < 3s | Performance test |

---

## 10. Bootstrap checklist (next 1-2 days)

- [x] RFC này
- [ ] `imou-rn-native/` directory skeleton: `ios/`, `android/`, `src/`, `native/`
- [ ] `package.json` (template từ `imou-rn-geetest`)
- [ ] `imou-rn-native.podspec` cho iOS
- [ ] `android/build.gradle` cho Android
- [ ] `src/index.ts` với interface TypeScript đầy đủ (chưa connect native)
- [ ] Swift stubs: `ImouNativeModule.swift`, `CryptoCore.swift`
- [ ] Kotlin stubs: `ImouNativeModule.kt`, `CryptoCore.kt`
- [ ] First implementation: **CryptoCore + DHAVParser** với unit test (PORT TỪ Python — easiest, no protocol involved)
- [ ] Test fixtures: copy `/tmp/imou-pb-enc2.raw`, `/tmp/imou-pb-enc3.raw` vào `tests/fixtures/`

---

## 11. References (đã có sẵn trong repo)

- Python reference impl: `imou-pkg/imou/` — đặc biệt `crypto.py`, `dh_rtsp.py`, `api.py`
- Auth + signing protocol: memory `[session_2026-06-01_handover]` § 1
- DHAV format spec: memory `[imou_decrypter_jni]` § "DHAV frame structure"
- encrypt=2 formula: memory `[imou_decrypter_jni]` Session 5
- encrypt=3 formula: memory `[imou_decrypter_jni]` Session 7
- WSSE auth: memory `[imou_decrypter_jni]` Session 7 (footer)
- Ghidra project (libCommonSDK.so disassembly): `~/ghidra-projects/imou.rep/`
- Geetest UI skeleton: `imou-rn-geetest/`
- WebView fallback path: `imou-rn-webview/`

---

**TL;DR**: Full native rewrite (~7-8 tuần với 2 dev), leverage Python reference + Ghidra RE đã có. Start với crypto + DHAV (easiest, đo được parity), rồi protocol clients, cuối cùng video render.
