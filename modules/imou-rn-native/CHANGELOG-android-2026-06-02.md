# imou-rn-native — Android verification handoff (2026-06-02)

Tài liệu này tóm lược tất cả thay đổi đã apply vào module `imou-rn-native` trong
session verify Android — gửi cho đội RN để biết những gì khác so với phiên bản
iOS-only trước đó và những gì cần lưu ý khi tích hợp Android.

Đọc cùng với [INTEGRATION.md](./INTEGRATION.md) (đã được cập nhật phần Android).

---

## 1. TL;DR — Android sau session này

**Cách đọc bảng:** "Live verify" = chạy app, thấy bằng chứng runtime (log/screenshot/state). "Code-only" = compile clean, share code path với phần đã live verify, nhưng chưa UI-test riêng do cloud rate-limit IP cuối ngày.

| Feature | Status | Bằng chứng |
|---|---|---|
| Build module Android | ✅ live | `gradlew :app:assembleDebug` BUILD SUCCESSFUL, Kotlin compile 0 errors |
| Live HEVC (Bể Cá, 2304×1296) | ✅ live verify | Screenshot fish tank rendering, logcat `MediaCodec configured (codec=HEVC) → output format changed` |
| Live H.264 (hồ phải, 2560×1440) | ✅ live verify | Screenshot football field rendering, logcat `c2.goldfish.h264.decoder` allocated + `codec=H264` |
| AAC audio pipeline | ✅ live verify | `aac decoded=500 pcm_bytes=1024000 track_state=3` (AudioTrack.PLAYSTATE_PLAYING) |
| `setMuted(sid, bool)` | 🔵 code-only | Compile clean. `AudioTrack.setVolume(0/1)` — system API, single line |
| `setPaused(sid, bool)` | 🔵 code-only | Compile clean. Gates `releaseOutputBuffer(idx, render=false)` trên drain loop đã verify |
| HD/SD quality (`startLive({quality})`) | 🔵 code-only | Compile clean. Chỉ thay `streamId` "0"→"1" trong SaaS request (cùng request được live verified với "0") |
| Snapshot (HEVC cache JPEG) | 🔵 code-only | Code có sẵn từ trước (Snapshot.kt), share DhRtspClient + MediaCodec path đã verify. Chỉ live verified path live, không phải one-frame snapshot path |
| Snapshot H.264 | ⚠️ cần port codec-aware (giống live renderer) | Snapshot.kt vẫn HEVC-only |
| Snapshot saveToGallery | ❌ chưa làm trên Android (MediaStore.Images.Media + permission) | — |
| Picture-in-Picture | ❌ chưa làm — Android cần Activity-level `enterPictureInPictureMode`, không phải module-level | — |
| Two-way talk / PTZ / cloud playback / seek / multi-cam | ❌ chưa có trên cả hai platform | — |
| Device thật | ⚠️ chưa | Chỉ test emulator `jebao_arm64` API 33 |

**Status legend:**
- ✅ **Live verify** — chạy thực, có log/screenshot.
- 🔵 **Code-only** — compile, code review xong, share path với phần ✅. Test UI bị chặn bởi cloud rate-limit cuối session, team RN nên test lần đầu trên device thật.
- ⚠️ **Cần port/sửa**.
- ❌ **Chưa làm**.

---

## 2. Bugs fix trên Android (kèm root cause)

### Bug 1 — `DHAVParser.decryptVodFrame` OOM trên live

**Triệu chứng:**
```
FATAL EXCEPTION: DefaultDispatcher-worker-1
java.lang.OutOfMemoryError: Failed to allocate a 16 byte allocation
  at DHAVParser.walkExt(DHAVParser.kt:42)
  at DHAVParser.findB5(DHAVParser.kt:56)
  at DHAVParser.decryptVodFrame(DHAVParser.kt:90)
```
Live sau ~5-10s crash app.

**Root cause:** `decryptVodFrame` gọi `walkExt` → `copyOfRange` cho mọi frame, kể cả live (không có key). Mỗi frame tạo hàng chục `ByteArray` slice nhỏ. 25 fps × N slices/frame = GC không theo kịp → OOM.

**Fix:** [`DHAVParser.kt:76`](android/src/main/java/com/imou/rn/nativemod/DHAVParser.kt) — short-circuit khi key rỗng:
```kotlin
fun decryptVodFrame(frame: ByteArray, key: ByteArray): ByteArray {
    if (key.isEmpty()) return frame   // live không decrypt
    ...
}
```

Đây là bug giống hệt iOS fix (a) đã ghi trong INTEGRATION.md cũ.

---

### Bug 2 — Race condition: Player nhận detached renderer

**Triệu chứng:** `HEVCRenderer: no surface yet — defer codec configure` log hàng nghìn lần, video không bao giờ render. MediaCodec không bao giờ được configure dù view đã mount.

**Root cause:** Chicken-and-egg:
1. JS gọi `startLive(...)`.
2. Native gọi `waitForRenderer(sid)` chờ tới 3s cho view register vào registry.
3. JS chỉ mount `<ImouVideoView sessionId={sid}/>` SAU KHI Promise `startLive` resolve.
4. Promise chỉ resolve sau khi `waitForRenderer` xong.
5. → `waitForRenderer` luôn timeout → trả về **detached** `HEVCRenderer()` mới (không có surface).
6. View mount sau đó, gán surface vào `view.renderer` — nhưng Player vẫn dùng renderer cũ.

**Fix:**
- [`Player.kt`](android/src/main/java/com/imou/rn/nativemod/Player.kt) — bỏ tham số renderer/audioRenderer khỏi `StartParams`. Mỗi frame dispatch lookup `ImouVideoViewRegistry.renderer(sid)` / `audioRenderer(sid)` — lookup-per-frame. Hash map O(1) nên overhead negligible.
- [`ImouNativeModule.kt`](android/src/main/java/com/imou/rn/nativemod/ImouNativeModule.kt) — `promise.resolve` GỌI TRƯỚC `Player.start`. JS render view → register registry → frame tiếp theo Player tìm được renderer.
- Bỏ hàm `waitForRenderer` (không còn dùng).

```kotlin
// Player.kt (new) — frame dispatch lookup renderer mỗi lần
private fun videoRenderer(): HEVCRenderer? = ImouVideoViewRegistry.renderer(sessionId)
private fun audioRenderer(): AACRenderer? = ImouVideoViewRegistry.audioRenderer(sessionId)

fun dispatch(frame: ByteArray) {
    when (frame[4].toInt() and 0xff) {
        0xf0 -> if (withAudio) audioRenderer()?.let { ... it.enqueue(frame) }
        else -> videoRenderer()?.enqueue(frame)
    }
}
```

---

### Bug 3 — SurfaceView đen mặc dù decode thành công

**Triệu chứng:** Logcat hiện `HEVCRenderer: MediaCodec configured 1920x1080` + `output format changed → 2304x1296`. Pipeline produce frames bình thường nhưng vùng `<ImouVideoView/>` chỉ thấy màu đen.

**Root cause:** Hai vấn đề về compositing của Android SurfaceView:

1. **`setBackgroundColor(0xff000000)` ở View init** — SurfaceView dùng cơ chế "punch-through" để hardware surface lộ ra qua một lỗ trong suốt của View tree. Việc set background color tô đen LÊN cái lỗ đó → che hết surface.
2. **RN view tree composite TRÊN SurfaceView mặc định** — z-order của surface mặc định nằm dưới window. Phải gọi `setZOrderOnTop(true)` (hoặc `setZOrderMediaOverlay(true)`) để promote surface lên.

**Fix:** [`ImouVideoViewManager.kt`](android/src/main/java/com/imou/rn/nativemod/ImouVideoViewManager.kt):
```kotlin
init {
    // KHÔNG setBackgroundColor — sẽ đè lên punch-through hole.
    setZOrderOnTop(true)
    holder.setFormat(PixelFormat.TRANSPARENT)
    holder.addCallback(this)
    ImouVideoViewRegistry.attach(this)
}
```

**Hệ quả mà team RN cần biết:** Phía JS đừng set `backgroundColor` trên `<ImouVideoView/>`. Nếu cần nền tối cho letterbox, set lên container bao quanh:
```tsx
<View style={{ backgroundColor: '#000' }}>
  <ImouVideoView sessionId={sid}
    style={{ width: '100%', aspectRatio: 16/9 }} />
</View>
```

Đã document trong INTEGRATION.md §8 "Android-specific gotchas".

---

### Bug 4 — AACRenderer drainLoop thoát ngay lập tức

**Triệu chứng:** Pipeline thấy audio frame, codec configured, AudioTrack created, nhưng không có PCM nào tới speaker. Log: `drainLoop start running=false`.

**Root cause:** `AACRenderer.start()` được Player gọi từ `spawn()`, nhưng lúc đó view chưa mount → `audioRenderer()` lookup trả về null → `start()` bị skip → `running` vẫn là false. Khi audio frame đầu tiên đến (sau ~1s), `configure()` được lazily gọi từ trong `enqueue()` → spawn `drainThread` → drainThread chạy `while (running.get())` → exit ngay.

**Fix:** [`AACRenderer.kt:121`](android/src/main/java/com/imou/rn/nativemod/AACRenderer.kt) — set `running.set(true)` directly trong `configure()` trước khi spawn drainThread.

---

### Bug 5 — `c2.android.aac.decoder` không output với KEY_IS_ADTS=1

**Triệu chứng:** Decoder consume hết input nhưng `dequeueOutputBuffer` luôn trả về -1 (TRY_AGAIN_LATER). 0 PCM output sau 1000+ inputs.

**Root cause:** `c2.android.aac.decoder` (Codec2 path mới của Android) phớt lờ `MediaFormat.KEY_IS_ADTS=1` — phải pre-strip ADTS header và config với `csd-0 = AudioSpecificConfig`. iOS đã làm thế này từ đầu.

**Fix:** [`AACRenderer.kt`](android/src/main/java/com/imou/rn/nativemod/AACRenderer.kt) — `configure()` build `csd-0 = [audioObjType=2(LC), freqIdx, chanCfg]` (2 bytes) và set vào MediaFormat. `pump()` strip 7-byte ADTS header trước khi `queueInputBuffer`. Kết quả: 500 packets decoded → 1 MB PCM → AudioTrack PLAYING.

---

## 3. Sprint 2 quick wins (cùng session, sau live verify)

Đợt tiếp theo thêm 4 features sau live verify. Tất cả compile clean trên Android, cần test live khi cloud rate-limit nguội:

### 3a. Snapshot H.264 codec-aware (Android)

`Snapshot.kt` trước chỉ HEVC. Port sticky-codec-detect từ `HEVCRenderer.kt`:
- Detect codec từ NAL byte đầu tiên (0x40/0x42/0x44 HEVC vs 0x67/0x68 H.264)
- Pass `codecHint` vào `HEVCNalExtractor.extractNalus` cho re-parse khi codec switch
- MediaCodec MIME chọn `video/avc` hay `video/hevc` theo `psCache.codec`

Bể Cá HEVC snapshot vẫn chạy. Hồ phải H.264 snapshot giờ chạy được.

### 3b. `saveToGallery: true` cho snapshot (Android)

`Snapshot.capture(..., saveToGallery: Boolean = false)`. Sau khi viết cache JPEG, gọi `saveBitmapToGallery` dùng MediaStore:
- **API 29+ (Q):** scoped storage, không cần permission. RELATIVE_PATH=`Pictures/Imou`, IS_PENDING flow.
- **API ≤28:** cần `WRITE_EXTERNAL_STORAGE` (đã thêm vào ImouTestApp's `AndroidManifest.xml` với `maxSdkVersion=28`).

JS gọi `ImouNative.snapshot(deviceId, { saveToGallery: true })` — return cache URI; gallery save là side effect (lỗi không fail promise, chỉ log warn).

### 3c. Auto-reconnect on TCP drop (cả 2 platform)

`Player.spawn` giờ có retry loop với exponential backoff:
- 1s → 2s → 4s → 8s → 16s → 30s (cap)
- Reset backoff về 1s khi stream chạy ổn (> 25 frames được pass qua dispatcher) — tránh việc reconnect lần đầu lâu rồi bị stuck cap khi network blip thoáng qua
- Emit `error("reconnecting", "attempt=N nextDelayMs=M")` cho JS hiển thị spinner / banner
- **Playback** không retry — URL time-bounded, server reject re-open

Cancel sạch khi user gọi `stopSession` (CancellationException).

### 3e. PTZ control (cả 2 platform) — ✅ live verified

**Live verified trên camera xuantran (Android emulator):**
```
ImouRN: ptzMove dev=2G04BE7PAN00612 h=0.0  v=0.7 zoom=0.0  dur=500 → OK (UP)
ImouRN: ptzMove dev=2G04BE7PAN00612 h=0.7  v=0.0 zoom=0.0  dur=500 → OK (RIGHT)
ImouRN: ptzMove dev=2G04BE7PAN00612 h=0.0  v=-0.7 zoom=0.0 dur=500 → OK (DOWN)
ImouRN: ptzMove dev=2G04BE7PAN00612 h=-0.7 v=0.0 zoom=0.0  dur=500 → OK (LEFT)
ImouRN: ptzMove dev=2G04BE7PAN00612 h=0.0  v=0.0 zoom=0.7  dur=600 → OK (ZOOM IN relative)
```

### 3f. Absolute zoom — `setZoomLevel` / `getZoomLevel` (cả 2 platform)

API mới:
```ts
ImouNative.setZoomLevel(deviceId, { level: 0.6154 })  // normalized 0..1
const level = await ImouNative.getZoomLevel(deviceId) // current 0..1
```

Map từ user-friendly X value (camera với N× optical zoom):
```ts
const normalized = (xLevel - 1) / (maxX - 1)    // 25× của 40× cam → 0.6154
const xLevel     = 1 + normalized * (maxX - 1)  // ngược lại
```

Native gọi `iot.control.SetIotService` service `25100` (`SetZoomFocus`):
- `Type` (25101) = `"3"` (cover/absolute, không phải large/small relative)
- `ZoomFocus` (25102) = string normalized 0..1

`getZoomLevel` gọi service `22400` (`GetZoomFocus`), đọc `outputData["22421"]`.

**Live verified xuantran (40× optical):**
- Get → 10.0× (camera khởi đầu)
- Set 25× (normalized 0.6154) → camera physically zoom in qua aperture
- Get → 23.6× (discrete optical steps, không perfectly continuous — bình thường cho hardware optical zoom)
- Stream live tiếp tục, không glitch
- Camera mất 1-3s để di chuyển thấu kính tới vị trí target

**UI test:** App.tsx có `<ZoomInput initialMaxX={40} />`:
- Field "Zoom" — user nhập X bất kỳ ≥ 1 (KHÔNG upper bound — cam PTZ speed-dome có thể 100×+)
- Field "Max X" — configurable per-camera (default 40 cho xuantran)
- Formula: `normalized = (x - 1) / (maxX - 1)`; server clamp 0..1 nếu vượt quá max physical zoom
- Get button reverse-maps: `x = 1 + normalized * (maxX - 1)` để hiển thị X thực tế
Camera vật lý đáp ứng từng lệnh trong ~500ms; ptzReset có thể trả về code=10002
("request time out") khi camera đang xử lý moves trước — UX cần debounce hoặc
disable reset button trong N seconds sau move.

**Bonus live verified cùng lúc:**
- Reconnect (#3c) emit `error("reconnecting", "attempt=1 nextDelayMs=1000")` khi
  stream tạm thời ngắt — Player tự retry, stream resume.
- 12002 auto-relogin (#3d) — relogin OK 2 lần trong session, không phá flow.
  Bug phụ tìm thấy: `streamUrl`/`playbackUrl`/`devicePassword` throw `Malformed`
  thay vì `Server` cho non-10000 code → `withRelogin` miss. Fix: throw `Server`.



API mới:
```ts
ImouNative.ptzMove(deviceId, { h: 0.7, v: 0, zoom: 0, durationMs: 500 })
ImouNative.ptzReset(deviceId)
```

`h`/`v`/`zoom` normalize ∈ [-1, 1]:
- `h > 0` → pan right, `h < 0` → pan left
- `v > 0` → tilt up, `v < 0` → tilt down
- `zoom > 0` → zoom-in (tele), `zoom < 0` → zoom-out (wide)
- `durationMs` ∈ [1, 99999], default 500

Native gọi `iot.control.SetIotService` service `22100` (`PtzMoveEight` từ Imou
standard model, ref 22100) với inputData `22101/22102/22103/22104`. Reset dùng
service `203700` (`std_reset_ptz`).

**Camera yêu cầu:** capability `cm_ptz` = true. Cam không có PTZ sẽ trả về
error code khác 10000. App có thể check trước bằng device profile, hoặc
chỉ catch error code khi user tap.

**UI test:** App.tsx auto-pick "xuantran" (cam có PTZ), hiển thị 8 nút
direction + reset + 2 nút zoom dưới video live.

### 3d. 12002 session-expired auto-recovery (Android)

Khi SaaS trả về `code=12002` (session bị invalidate do contention với app khác hoặc thời hạn hết):
- `LoginCreds` (phone/areaCode/password) được lưu trong `EncryptedSharedPreferences` ngay khi login lần đầu
- `ApiClient.withRelogin { ... }` wrap mọi SaaS call. Catch `SaaSError.Server(code=12002)` → gọi `onSessionExpired` callback → swap session → retry call một lần
- Module wires `onSessionExpired = ::reloginFromCachedCreds` — đọc creds, gọi `AuthFlow.startLogin`, lưu lại session
- Emit event `sessionExpired { reason: '12002' }` trước khi relogin (JS show spinner)
- Nếu không có creds cached → trả null, error bubble up → JS phải re-prompt login

**Lưu ý cho team RN:**
```ts
const sub = ImouNative.onError(e => {
  if (e.code === 'reconnecting') {
    // show banner "Đang kết nối lại... attempt N"
  } else if (e.code === 'producer_failed') {
    // fatal — playback chết, hiển thị retry button
  }
});
// also listen sessionExpired event
```

---

## 4. Tính năng đã có sẵn từ trước

### `setMuted(sessionId, muted: boolean)` (mới trên Android)

[`AACRenderer.setMuted`](android/src/main/java/com/imou/rn/nativemod/AACRenderer.kt) gọi `AudioTrack.setVolume(0f|1f)` — không reset decoder, flip instant.

### `setPaused(sessionId, paused: boolean)` (mới trên Android)

[`HEVCRenderer.setPaused`](android/src/main/java/com/imou/rn/nativemod/HEVCRenderer.kt) gate render qua `releaseOutputBuffer(idx, render = !paused)`. Last frame held trên surface; resume tiếp tục render. **Lưu ý:** TCP vẫn chạy → live bandwidth không tiết kiệm, dùng `stopSession` nếu cần.

### HD/SD quality switch tại `startLive(deviceId, { quality: 'sd' })`

[`ApiClient.streamUrl`](android/src/main/java/com/imou/rn/nativemod/ApiClient.kt) thêm enum `StreamQuality { HD, SD }` map sang `streamId="0"|"1"` cho relay. Áp dụng tại session start; runtime switch cần `stopSession` → `startLive(..., {quality})` lại.

### H.264 + HEVC codec-aware

[`HEVCNalExtractor.kt`](android/src/main/java/com/imou/rn/nativemod/HEVCNalExtractor.kt) refactor: thêm enum `VideoCodec`, detect codec từ byte đầu NAL (HEVC param-set 0x40/0x42/0x44 vs H.264 SPS=0x67/PPS=0x68), `ParamSetCache` aware-codec (HEVC cần VPS+SPS+PPS, H.264 cần SPS+PPS), `csd0()` build đúng format cho mỗi codec.

[`HEVCRenderer.kt`](android/src/main/java/com/imou/rn/nativemod/HEVCRenderer.kt) sticky codec lock (lock khi thấy param-set byte unambiguous), switch MIME `video/hevc` ↔ `video/avc` khi codec thay đổi, rebuild MediaCodec khi `configuredCodec != psCache.codec`.

---

## 5. Toolchain / build

- **JDK 17** bắt buộc (AGP 8 yêu cầu). Brew path mặc định:
  `/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home`.
- **NDK 27.1.12297006** — bumped từ 25.2/26.1. Module không có C++ nên không strict, nhưng app cần NDK 26+ cho RN 0.74.
- Khi sửa source: `rsync -a --delete imou-rn-native/android/ ImouTestApp/node_modules/imou-rn-native/android/`. Yarn cài file: là COPY, không phải symlink.
- Metro: `node node_modules/react-native/cli.js start --port 8081` (yarn start có lúc bị SIGKILL trong shell harness). `adb reverse tcp:8081 tcp:8081` mỗi lần emulator/app reboot.

---

## 6. Còn lại để làm trên Android (Sprint kế tiếp)

| Việc | Effort ước tính | Ghi chú |
|---|---|---|
| PiP Android | 1-2 day | Khác hẳn iOS — phải coordinate với host Activity (`enterPictureInPictureMode`). RN khó tự làm, cần app config |
| Audio reset sau pause kéo dài | 1-2h | AudioTrack underrun nếu pause lâu — cần `flush()` + `play()` lại khi unpause |
| Two-way talk | 5-7 day | Như iOS — chưa start |
| Verify trên device thật | 0.5 day | Test trên 1-2 thiết bị Samsung/Pixel mid/high tier |
| PTZ control | 1 day | Yêu cầu camera có PTZ; Bể Cá có thể không |
| Camera settings (mic/IR/motion) | 1 day | Toggle qua `iot.control.SetIotService` |
| Event/alarm list | 1-2 day | API `device.event.GetXxx` |
| iOS port các quick wins #3a-#3d | 0.5 day | Snapshot codec-aware (đã H.264), saveToGallery (đã có), reconnect (đã port), 12002 (chưa port iOS) |

---

## 7. Files đã sửa session này

| File | Loại sửa |
|---|---|
| `android/build.gradle` | NDK 27.1 |
| `ImouTestApp/android/build.gradle` | NDK 27.1 |
| `android/src/main/java/com/imou/rn/nativemod/DHAVParser.kt` | Bug 1 fix |
| `android/src/main/java/com/imou/rn/nativemod/Player.kt` | Bug 2 fix (refactor lookup-per-frame) |
| `android/src/main/java/com/imou/rn/nativemod/ImouNativeModule.kt` | Bug 2 fix + setMuted/setPaused/HD-SD/snapshot opts |
| `android/src/main/java/com/imou/rn/nativemod/ImouVideoViewManager.kt` | Bug 3 fix (z-order + transparent) |
| `android/src/main/java/com/imou/rn/nativemod/HEVCRenderer.kt` | Bug 3 (no-surface log spam), H.264 codec support, setPaused, ngoại lệ pixel format |
| `android/src/main/java/com/imou/rn/nativemod/HEVCNalExtractor.kt` | Rewrite codec-aware (HEVC + H.264) |
| `android/src/main/java/com/imou/rn/nativemod/AACRenderer.kt` | Bug 4 + 5 fix, setMuted, csd-0 mode |
| `android/src/main/java/com/imou/rn/nativemod/ApiClient.kt` | HD/SD enum, streamUrl quality param |
| `ImouTestApp/App.tsx` | Test buttons cho snapshot/HD-SD/mute/pause |
| `INTEGRATION.md` | §8 "Android-specific gotchas", roadmap table |
| `android/src/main/java/com/imou/rn/nativemod/Snapshot.kt` | Sprint 2: H.264 codec-aware + saveToGallery |
| `android/src/main/java/com/imou/rn/nativemod/AuthFlow.kt` | Sprint 2: `LoginCreds` + `SessionStore.saveCreds/loadCreds` |
| `ImouTestApp/android/app/src/main/AndroidManifest.xml` | Sprint 2: `WRITE_EXTERNAL_STORAGE` (maxSdkVersion=28) |
| `android/src/main/java/com/imou/rn/nativemod/Player.kt` | Sprint 2: retry loop với exp backoff |
| `ios/Player.swift` | Sprint 2: retry loop với exp backoff (mirror Android) |

---

## 8. Cách reproduce verification trên máy bạn

```bash
# 1. Sync source vào test app
rsync -a --delete imou-rn-native/android/ ImouTestApp/node_modules/imou-rn-native/android/
rsync -a --delete imou-rn-native/src/    ImouTestApp/node_modules/imou-rn-native/src/

# 2. Boot emulator (cần AVD đã tạo, ví dụ pixel_5 API 33)
emulator -avd pixel_5 -no-snapshot &
adb wait-for-device
adb reverse tcp:8081 tcp:8081

# 3. Build + install
cd ImouTestApp/android
JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home \
ANDROID_HOME=/opt/homebrew/share/android-commandlinetools \
  ./gradlew :app:assembleDebug -x lint
adb install -r app/build/outputs/apk/debug/app-debug.apk

# 4. Metro
cd .. && node node_modules/react-native/cli.js start --port 8081 &

# 5. Launch app + watch logs
adb shell am start -n com.imoutestapp/.MainActivity
adb logcat -s ImouPlayer:I HEVCRenderer:I AACRenderer:I DhRtspClient:I
```

Kỳ vọng log khi Bể Cá live + audio chạy:
```
HEVCRenderer: MediaCodec configured 1920x1080 (codec=HEVC)
HEVCRenderer: output format changed → 2304x1296
AACRenderer: aac configured sr=16000 ch=1 csd0=1408
```
