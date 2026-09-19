# imou-rn-native — Hướng dẫn tích hợp cho đội React Native

> Thư viện native (Swift iOS + Kotlin Android) cho phép ứng dụng React Native
> xem trực tiếp camera Imou (live + playback SD card) **không cần backend
> server, không qua FFmpeg, không dùng Open API.** Đăng nhập trực tiếp bằng
> số điện thoại + mật khẩu Imou, tự kéo stream RTSP/HTTP-tunnel từ relay cloud,
> giải mã HEVC/H.264 bằng `VideoToolbox` / `MediaCodec` rồi render vào
> `AVSampleBufferDisplayLayer` / `SurfaceView`.

**Status hiện tại:**
- **iOS:** Hoàn thiện, verify trên simulator + thiết bị thật.
- **Android:** Live HEVC + H.264 verify trên emulator (Bể Cá HEVC 2304×1296,
  hồ phải H.264 2560×1440 — codec auto-detect). AAC audio pipeline verify
  end-to-end (PCM tới AudioTrack, state=PLAYING). `setMuted`, `setPaused`,
  HD/SD quality switch, snapshot — code-complete, dùng chung pipeline đã
  verify. PiP Android chưa có (cơ chế khác hẳn iOS, Activity-level). Xem
  [Android-specific gotchas](#android-specific-gotchas) + [CHANGELOG handoff](./CHANGELOG-android-2026-06-02.md).

**Performance verified (iOS):**
- Bể Cá (HEVC, 25 fps): 40 s+ liên tục, queue ổn định 4-5 s buffer.
- Hồ phải (H.264, ~20 fps): 30 s+ liên tục, 21 fps sustained.
- Audio AAC 16 kHz mono: decoded ~16 packets/s, đồng bộ với video qua AVAudioEngine.
- Bundle iOS: ~250 KB. Android: ~400 KB. Không có FFmpegKit.
- Latency: ~200-300 ms end-to-end.

**Performance verified (Android emulator, jebao_arm64 API 33):**
- Bể Cá HEVC: MediaCodec `c2.goldfish.hevc.decoder` configured 1920×1080 →
  output 2304×1296, frames hiển thị mượt trên SurfaceView.
- AAC decoder `c2.android.aac.decoder` khởi tạo + nhận frames OK.

---

## 🔥 Cập nhật 2026-06-03 (đọc trước nếu đang tích hợp)

Tóm tắt **bugs đã fix + tính năng mới** session này (chi tiết ở các section bên dưới):

### 🐛 Bugs đã fix
1. **Playback nhiễu/lag/màn xám** — relay bơm burst → renderer quá tải. Đã thêm
   **flow-control** (pace realtime + backpressure). iOS + Android.
2. **LIVE green-screen thi thoảng** — decoder `.failed` nhưng code nhồi P-frame
   ngay → đứng xanh. Đã sửa: failed → flush + **bắt buộc chờ keyframe**. iOS + Android.
2b. **LIVE green-flash ~200ms khi mới mở stream** — VideoToolbox + display
   layer present 1-3 frame đầu với colorspace chưa locked → green tint mỏng phủ
   lên scene thật. Đã sửa: **ẩn layer cho đến khi enqueue ≥ 6 frame** (steady
   state ~240ms; user thấy khung đen rồi vào ảnh sạch, không còn xanh). iOS.
   Verified live trên xuantran (HEVC) — ảnh sạch tuyệt đối ngay khi hiện.
3. **`listRecordings` 10003 trên cam legacy LeChange** — dùng sai method/payload.
   Đã sửa dùng đúng `iot.control.SetService` (giống app Imou gốc). iOS + Android.
4. **Snapshot `noKeyframe` trên cam H.264** (iOS) — `buildFormatDesc` chỉ HEVC.
   Đã sửa codec-aware. iOS.
5. **PTZ `40999` trên PT-cam** — cam khác nhau dùng service khác (`PtzMoveEight`
   22100 vs `PtzMoveFour` 24300). Đã cascade + cache per-device. iOS + Android.
6. **iOS `getZoomLevel` luôn trả 0.0** — server trả JSON number, code cũ cast String
   fail. Đã fix parse cả 2.

### ✨ Tính năng mới
1. **`onPlaybackProgress`** event — thanh tua (positionSec/durationSec, ~1/s).
2. **`startRecording`/`stopRecording`** — quay đoạn ĐANG XEM ra .mp4 (như nút
   record của Imou; KHÔNG có "download" riêng).
3. **`getPtzCapability(deviceId)`** — tự nhận diện loại pan/tilt + có zoom hay
   không, để app render đúng controls.
4. **`listEventRecordings`** (lib Python imou-pkg) — list clip alarm + thumbnail
   (service 90800). Spec sẵn cho team port sang RN nếu cần — xem `RN-API-FIXES-2026-06-02.md`.

### ⚠️ Status build
- **iOS**: **build SUCCEEDED + verify live** trên simulator iPhone 17 Pro Max
  (tất cả 6 fix + 3 feature mới).
- **Android**: **compileDebugKotlin SUCCESSFUL**, **chưa verify live trên emulator**
  (port 8081 bị chiếm bởi AquaCedrus của user khi research). Đề nghị team test
  Android end-to-end trước khi ship.

---

## 1. Cài đặt

```bash
yarn add file:./imou-rn-native     # hoặc git+ssh URL nếu đã publish
cd ios && pod install
```

Android tự pick up qua autolinking.

### Yêu cầu

| Platform | Phiên bản | Ghi chú |
|---|---|---|
| iOS | 15.0+ | Có hỗ trợ `AVSampleBufferDisplayLayer.controlTimebase` |
| Android | API 23+ (Marshmallow) | `MediaCodec` HEVC + H.264 |
| React Native | 0.72+ | Cấu hình arch mới (Fabric) hoặc cũ đều ok |

### Permissions

**iOS** (`Info.plist`):
```xml
<key>NSAllowsArbitraryLoads</key>
<true/>
<!-- Stream qua HTTP/RTSP plain TCP đến cloud relay, không phải HTTPS. -->
```

**Android** (`AndroidManifest.xml`):
```xml
<uses-permission android:name="android.permission.INTERNET" />
<application android:usesCleartextTraffic="true" ... >
```

---

## 2. API surface

```typescript
import { ImouNative, ImouVideoView } from 'imou-rn-native';
```

### Login flow

```typescript
import { ImouNative, ImouCaptcha } from 'imou-rn-native';

// Login bằng phone + password (Imou account)
await ImouNative.login({
  phone: '869941629',
  areaCode: '84',                 // Vietnam = 84
  password: 'YOUR_PASSWORD',
  captchaSolver: { mode: 'webview' }, // Geetest qua react-native-webview
});

// Session được persist tự động (Keychain trên iOS, EncryptedSharedPrefs Android).
// Khi mở app lại không cần login nữa, kiểm tra bằng:
const ok = await ImouNative.isLoggedIn();

await ImouNative.logout();        // khi user logout chủ động
```

#### Xử lý captcha

Imou đôi khi yêu cầu giải captcha Geetest v4 (thường khi đăng nhập từ thiết bị
mới hoặc nhiều lần). Bridge sẽ emit event `captchaRequired`. JS phải render
Geetest modal và gọi `submitCaptcha`:

```tsx
import { ImouNative, ImouCaptcha } from 'imou-rn-native';

function App() {
  return <ImouCaptcha />;   // mount 1 lần ở root, tự nghe event
}
```

`ImouCaptcha` đã được implement sẵn dùng `react-native-webview`. Nếu cần custom
UI, lắng nghe `ImouNative.onCaptchaRequired(...)` và gọi
`ImouNative.submitCaptcha(...)` khi user giải xong.

### Liệt kê cameras

```typescript
const cams: Camera[] = await ImouNative.listDevices();
// Camera = { deviceId, name, model, productId, online }
```

`productId` rỗng (`''`) → camera Lechange đời cũ. Module xử lý đặc biệt
trong nội bộ; JS không cần care.

### Live view

```tsx
import { ImouVideoView, ImouNative } from 'imou-rn-native';

function LiveScreen({ deviceId }) {
  const [sid, setSid] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const session = await ImouNative.startLive(deviceId, {
        withAudio: true,
        quality: 'hd',          // 'hd' (default) hoặc 'sd' tiết kiệm băng thông
      });
      if (!cancelled) setSid(session.sessionId);
    })();
    return () => {
      cancelled = true;
      if (sid) ImouNative.stopSession(sid).catch(() => {});
    };
  }, [deviceId]);

  if (!sid) return <Text>Đang kết nối…</Text>;
  return (
    <ImouVideoView
      sessionId={sid}
      style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' }}
      resizeMode="contain"
    />
  );
}
```

#### Runtime controls

Các method dưới đây tác động lên session đang chạy mà không cần restart:

```typescript
// Mute / unmute audio — tức thì, không restart stream
await ImouNative.setMuted(sessionId, true);   // mute
await ImouNative.setMuted(sessionId, false);  // unmute

// Pause / resume video presentation (timebase rate = 0/1)
// Stream vẫn drain ngầm. Phù hợp với playback. Cho live, dùng
// stopSession nếu thật sự muốn release băng thông.
await ImouNative.setPaused(sessionId, true);
await ImouNative.setPaused(sessionId, false);

// Chuyển HD ↔ SD: hiện cần stop + start lại với quality khác
await ImouNative.stopSession(sessionId);
const s = await ImouNative.startLive(deviceId, { quality: 'sd' });
```

#### PTZ control (cameras có `cm_ptz` capability)

```typescript
// Relative move 8 hướng + zoom với speed normalized + duration
await ImouNative.ptzMove(deviceId, {
  h: 0.7,           // -1..1: ngang (âm = trái, dương = phải)
  v: 0.5,           // -1..1: dọc  (âm = xuống, dương = lên)
  zoom: 0,          // -1..1: zoom relative (âm = wide, dương = tele)
  durationMs: 500,  // 1..99999, default 500
});

// Reset PTZ về vị trí mặc định
await ImouNative.ptzReset(deviceId);
```

> **PTZ service tự thích ứng:** cam khác nhau dùng service move khác nhau —
> speed-dome = `PtzMoveEight` (22100), nhiều PT-cam (vd `IPC-S7XE`) chỉ nhận
> `PtzMoveFour` (24300) và trả device error **40999** với 22100. `ptzMove` tự
> cascade **22100 → 24300 → 24500** + cache per-device, JS gọi như nhau.

Tất cả components có thể bằng 0 — pan thuần không zoom: `{ h: 0.7, v: 0, zoom: 0 }`.

#### Absolute zoom (zoom theo X level)

```typescript
// Đơn vị gốc cloud = normalized 0..1 (0=widest, 1=max optical):
await ImouNative.setZoomLevel(deviceId, { level: 0.5 });
const level = await ImouNative.getZoomLevel(deviceId);   // 0..1, vị trí THẬT

// Theo "×" — cần maxX app đã lưu cho cam (user nhập lúc add cam):
await ImouNative.setZoomX(deviceId, 25, maxX);
const x = await ImouNative.getZoomX(deviceId, maxX);     // 1..maxX
```

**Lưu ý (verify live trên xuantran `DH-SD-6A9230U-HN`):**
- `getZoomLevel` luôn trả normalized 0..1 — vị trí vật lý THẬT camera báo về.
  Server trả ref `22421` dạng **JSON number** (iOS bug cũ `as? String` → 0.0,
  đã fix). App tự nhân maxX để ra "×".
- `setZoomLevel` output `25121` chỉ **echo request**, không phải vị trí thật.
- Server clamp 0..1 — pass `level: 2.0` → camera đi tới zoom physical max.
- Optical zoom **rời rạc**. Set 25× rồi Get có thể 23.6× / 26.2× — bước thấu kính,
  không phải bug. Set 0.0 → đọc lại 0.0078 (quantize ~1/128). Camera mất 1-3s.

**maxX (giới hạn zoom) — Imou KHÔNG expose:** đã đào exhaustive
`standard_platform.json` + `standard_model.json` (services + properties) +
live probe — tất cả zoom đều normalized 0..1, KHÔNG có endpoint trả max X.
Imou app gốc cũng chỉ hiện slider 0..1, không có "×". **Cách chốt:** user tự
nhập maxX khi add cam (vào bể), sửa qua nút edit riêng; app persist theo
`deviceId`. `Camera.model` chỉ là gợi ý. Reference: `ZoomInput` trong `ImouTestApp/App.tsx`.

**Cameras KHÔNG có PTZ:** SaaS trả về error code khác 10000 — promise reject với
`ptz_failed` / `zoom_failed`. App nên check device capability trước hoặc catch lỗi.

#### Picture-in-Picture (iOS 15+)

```typescript
await ImouNative.startPiP(sessionId);   // mở PiP overlay
await ImouNative.stopPiP(sessionId);    // đóng
```

**Cấu hình bắt buộc** trong `Info.plist`:

```xml
<key>UIBackgroundModes</key>
<array>
  <string>audio</string>
</array>
```

Không có `audio` background mode, hệ thống tự kill audio (và PiP layer)
khi app vào background. Nếu user không cần audio trong PiP, vẫn nên giữ
key này — `AVPictureInPictureController` requires nó.

### Playback (SD card)

```typescript
// Bước 1 (optional): list recordings — giờ chạy CHO MỌI cam (cả legacy LeChange).
const recs = await ImouNative.listRecordings(deviceId, '2026-06-02');
// [{ begin, end, durationS, typeName }, ...]
// ⚠️ FIX 2026-06-02: cam legacy LeChange (productId='') trước đây trả 10003.
// Đã sửa: dùng iot.control.SetService thay vì SetIotService + đảo lại
// 24102=END/24103=BEGIN + bỏ field thừa. Verify live trên "hồ phải" (374 record/ngày).

// Bước 2: stream playback theo time range bất kỳ
const session = await ImouNative.startPlayback(
  deviceId,
  '20260602T100000',    // begin: yyyyMMddTHHmmss (LOCAL TIME)
  '20260602T103000',    // end
  { encrypt: 2, withAudio: true }
);

// Render giống live
<ImouVideoView sessionId={session.sessionId} ... />
```

> **⚠️ Múi giờ:** chuỗi `begin/end` phải là **LOCAL time của user**, không phải
> UTC. Camera lưu recording theo giờ thiết bị (thường là giờ địa phương). Format
> đúng từ `Date`:
> ```ts
> const pad = (n: number) => n.toString().padStart(2, '0');
> const fmtLocal = (d: Date) =>
>   `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}T` +
>   `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
> ```
> Không dùng `d.toISOString()` vì nó trả UTC.

`encrypt`: 2 hoặc 3 — phải khớp với cách camera mã hoá frame (sử dụng `2` mặc
định, retry với `3` nếu thấy hình bị nhiễu).

#### Thanh tua (seek bar) — `onPlaybackProgress` event

```typescript
// Subscribe khi mount playback view
const sub = ImouNative.onPlaybackProgress((e) => {
  // e.sessionId, e.positionSec, e.durationSec — emit ~1 lần/giây
  setProgress(e.positionSec / e.durationSec);
  setTimeLabel(`${fmt(e.positionSec)} / ${fmt(e.durationSec)}`);
});
// Khi user kéo slider → thả tay: TUA = stop + startPlayback ở mốc mới
const onSeek = async (frac: number) => {
  const targetSec = frac * durationSec;
  const newBegin = addSecondsToHHMMSS(originalBegin, targetSec);  // helper bên app
  await ImouNative.stopSession(session.sessionId);
  const s = await ImouNative.startPlayback(deviceId, newBegin, originalEnd);
  setSession(s);
};
sub.remove();   // unmount
```

> ⚠️ **Relay là stream 1 chiều** → không scrub mượt frame-by-frame như local file.
> Mỗi lần tua = **mở lại** ở mốc mới (~1-2s). UX chuẩn: kéo thumb → **chỉ apply
> khi thả tay** (`onSlidingComplete`), không seek mỗi pixel.

#### Record session đang xem (như nút record của Imou)

```typescript
// Đang xem playback (hoặc live) → bấm "Record" → quay đoạn ĐANG XEM ra .mp4
await ImouNative.startRecording(session.sessionId);
// ... user xem tiếp, sau muốn dừng:
const { uri, savedToGallery } = await ImouNative.stopRecording(
  session.sessionId,
  { saveToGallery: true }
);
// uri = file://.../imou-rec-xxx.mp4
// savedToGallery: lưu vào Photos (iOS) / MediaStore Movies/Imou (Android)
```

> **Không có `download`/`save_playback`** — Imou app gốc cũng KHÔNG có download
> riêng, dùng đúng cơ chế record session đang xem. Native passthrough remux
> DHAV→MP4 (AVAssetWriter / MediaMuxer), KHÔNG re-encode → file size nhỏ, chất
> lượng nguyên bản. Permission `NSPhotoLibraryAddUsageDescription` (iOS) /
> `WRITE_EXTERNAL_STORAGE` (Android ≤28) cần thiết khi `saveToGallery=true`.
> Verify live iOS: 8s playback → MP4 1920×1080 H.264, ảnh thật xem được.

### Snapshot (ảnh tĩnh)

```typescript
// Mặc định chỉ lưu vào tmp directory + trả URI
const { uri } = await ImouNative.snapshot(deviceId);
// uri = file://.../snap-xxx.jpg

// Tuỳ chọn: lưu thẳng vào Photos library
const r = await ImouNative.snapshot(deviceId, { saveToGallery: true });
// r = { uri, savedToGallery: true }
```

> 🐛 **FIX 2026-06-02 (iOS):** snapshot trước đây ném `noKeyframe` ("Lỗi snapshot")
> trên cam H.264 (vd hồ phải). Nguyên nhân: `Snapshot.swift` chỉ xử lý HEVC
> (`buildFormatDesc` đòi VPS — H.264 không có). Đã sửa codec-aware (HEVC:
> VPS+SPS+PPS; H.264: SPS+PPS) + sticky codec detect. Verify live: hồ phải
> H.264 → JPEG 1920×1080 OK, xuantran HEVC không regression.

Tự ghép 1 GOP từ live RTSP, decode 1 frame, lưu JPEG vào tmp directory.

**Lưu Photos:** thêm vào `Info.plist`:

```xml
<key>NSPhotoLibraryAddUsageDescription</key>
<string>Lưu ảnh chụp từ camera vào thư viện ảnh.</string>
```

Lần đầu gọi sẽ pop dialog xin quyền `.addOnly`. Method trả về
`savedToGallery: false` nếu user từ chối — không throw.

### Audio

Audio được render tự động khi `withAudio: true` (default). Pipeline:

```
DHAV audio frame (type=0xf0) → strip ADTS header → AudioToolbox
AudioConverter (AAC LC → Float32 PCM) → AVAudioPlayerNode →
AVAudioEngine → speaker
```

Format thường gặp: **AAC LC 16 kHz mono**. Module tự parse ADTS header để cấu
hình converter, không cần khai báo gì từ JS.

iOS audio session config: `.playback` category với `.mixWithOthers` để không
độc chiếm — app khác (vd. Music app) vẫn phát được khi user mở camera. Có thể
override bằng cách config `AVAudioSession.sharedInstance()` ở app-level trước
khi `startLive`.

Để tắt audio (tiết kiệm CPU + băng thông SDP), pass `withAudio: false`:

```typescript
ImouNative.startLive(deviceId, { withAudio: false });
```

### Stop / cleanup

```typescript
await ImouNative.stopSession(sessionId);
```

Đóng socket, dừng decoder, free CMSampleBuffer queue. **Luôn** gọi khi unmount
view hoặc khi chuyển sang session khác. Native không tự collect nếu JS quên.

### Error events

```typescript
const sub = ImouNative.onError((e) => {
  // e = { sessionId?, code, message }
  switch (e.code) {
    case 'reconnecting':
      // Stream tạm thời ngắt — Player đang tự retry với exp backoff.
      // message: "attempt=N nextDelayMs=M"
      // KHÔNG fatal — hiển thị spinner / banner. Sẽ tự resume.
      break;
    case 'producer_failed':
      // Fatal cho session (chỉ phát ra cho playback, hoặc khi user gọi
      // stopSession). Live tự retry vô hạn nên ít khi raise lỗi này.
      break;
    default:
      Alert.alert('Stream error', `${e.code}: ${e.message}`);
  }
});

// Session expired (12002) — module tự relogin từ cached creds.
// Event chỉ thông báo để app show spinner trong lúc relogin.
const expSub = ImouNative.onSessionExpired?.((e) => {
  // e = { reason: '12002' }
  // 1-2s sau module sẽ retry call gốc với session mới. Nếu fail (creds sai,
  // captcha required, vv), call sẽ reject như bình thường — app cần fallback
  // qua flow login đầy đủ.
});
```

#### `reconnecting` event (auto-retry trên TCP drop)

Module tự retry khi stream LIVE bị ngắt giữa chừng (server-side EOF, network
blip, socket reset). Backoff exponential 1s → 2s → 4s → ... → 30s cap; reset
về 1s khi connection chạy ổn > 25 frames.

**Không retry** cho playback — URL có time range, server reject re-open.

**Không retry** khi user `stopSession()` — coroutine cancel sạch.

#### `sessionExpired` event (12002 auto-relogin)

Khi cloud SaaS trả về code 12002 (session bị invalidate do contention với
app Imou official, hoặc token expire), module:

1. Emit `sessionExpired` event để app hiển thị spinner.
2. Đọc cached `LoginCreds` (lưu Keychain trên iOS, EncryptedSharedPreferences
   trên Android, ghi khi user login lần đầu).
3. Gọi `AuthFlow.startLogin(phone, areaCode, password)` để lấy session mới.
4. Retry SaaS call gốc một lần với session mới.

Nếu không có creds cached (lần đầu mở app), event vẫn fire nhưng retry fail
→ call bubble lỗi 12002 lên JS như bình thường — app phải redirect login.

---

## 3. Mã lỗi cloud thường gặp

| Code | Ý nghĩa | Xử lý |
|---|---|---|
| `10000` | success | — |
| `10002` | request timeout | retry sau 1-2s |
| `10003` | internal server error | gặp với `listRecordings` cho legacy Lechange — fallback time-range thủ công |
| `12002` | **session expired** | Module TỰ relogin từ cached creds (xem `sessionExpired` event). Nếu thiếu creds, app cần redirect login |
| `12100` | user no right | sai `productId` hoặc account không có quyền — check lại |
| `13002` | device offline | camera tắt nguồn/mất mạng |
| `12010` / time out | service không tồn tại trên device đó | thường legacy device — dùng API path khác |
| `11001` | bad request | body params thiếu/sai |

**Khi gặp `12002`:** session bị invalidate. Lý do thường:
- App Imou chính chủ vừa login (server chỉ cho 1 active session/tài khoản).
- Token hết hạn (~7 ngày).
- Đăng nhập từ thiết bị khác.

JS nên catch error chứa "12002", clear session local + redirect về login screen.

---

## 4. `<ImouVideoView />` chi tiết

Props:

| Prop | Type | Default | Mô tả |
|---|---|---|---|
| `sessionId` | string | bắt buộc | id từ `startLive` / `startPlayback` |
| `style` | ViewStyle | — | width/height bắt buộc set |
| `resizeMode` | `'cover'` \| `'contain'` \| `'stretch'` | `'contain'` | giống `<Image />` |
| `onReady` | `(e) => void` | — | fire khi frame đầu tiên render được |
| `onError` | `(e) => void` | — | render-side error (decoder lỗi, layer dispose, …) |

Component này tự bind vào internal `Player` qua `sessionId`. Một Player chỉ hỗ
trợ 1 view, đừng render `<ImouVideoView sessionId={sid} />` ở 2 chỗ khác nhau
cho cùng `sid` — chỉ chỗ mount sau cùng nhận frame.

**Lifecycle:** view tự cleanup khi unmount. Nhưng *Player vẫn tiếp tục* chạy
trong native vì có thể view khác sẽ mount lại với cùng `sessionId`. Để thật sự
dừng decoding + đóng socket, gọi `ImouNative.stopSession(sid)` từ JS khi user
rời màn hình.

---

## 5. Kiến trúc + những điều cần biết

### Stack tổng thể

```
ImouNative.startLive(deviceId)
   ├─ ApiClient.listDevices() → tìm camera, lấy productId
   ├─ ApiClient.streamUrl()   → cloud relay trả về rtsp:// URL
   └─ Player.start(.live, streamUrl) → spawn Task.detached
                                       │
                ┌──────────────────────┴────────────────────┐
                │                                            │
        Recv thread (POSIX socket)              Render serial queue (renderQ)
        ─ DhRtspClient / DhHttpClient            ─ asm.push(chunk) — DHAV reassembly
        ─ parse RTSP interleaved $...            ─ HEVCRenderer.enqueue(frame)
        ─ chunks → onChunk closure                  ├─ extract NALs (Annex-B)
                                                    ├─ build CMSampleBuffer
                                                    └─ layer.enqueue(sample)
                                                                │
                                                  AVSampleBufferDisplayLayer
                                                  (hardware decode + render)
```

### Vì sao 2 queue?

Trên iOS sim, nếu chạy render *trên cùng thread* với recv loop, parse + decode
mất ~30 ms/frame và làm chậm việc đọc TCP. TCP receive window co lại từ 130 KB
xuống 38 KB trong 3 s, cloud relay áp backpressure rồi dừng đẩy data hoàn
toàn. Producer/consumer pattern (recv → renderQ.async) cho phép recv drain
TCP buffer ở full speed (~43 chunks/s steady).

Verified bằng Wireshark (`tshark -i en0 host <relay-ip>`):
- Python tham chiếu (cùng máy, blocking socket): RWIN giữ ổn ~130 KB suốt 30 s.
- Swift dùng NWConnection async/await per chunk: RWIN sụp xuống 38 KB sau ~3 s,
  data dừng sau ~10 s.
- Swift dùng POSIX socket + dedicated renderQ: tương đương Python.

### Codec auto-detect (HEVC vs H.264)

Camera cùng tài khoản có thể stream codec khác nhau:
- Bể Cá → HEVC (H.265)
- Hồ phải → H.264 (legacy Lechange)

Module phát hiện codec từ byte đầu của NAL đầu tiên có ý nghĩa
(`HEVC SPS = 0x42` vs `H.264 SPS = 0x67`) rồi lock sticky — slice NAL ở giữa
stream không gây flip-flop. Format description được build bằng
`CMVideoFormatDescriptionCreateFromHEVCParameterSets` hoặc
`CMVideoFormatDescriptionCreateFromH264ParameterSets` tương ứng.

### PTS pacing

DHAV header của Imou chứa timestamp **theo giây** (không phải mili giây như tên
trường gợi ý) ở offset `0x10..0x13`. Nếu dùng nguyên thì 25 frame trong cùng
giây có cùng PTS → layer trình bày tất cả cùng lúc rồi đứng 1 giây chờ giây
tiếp theo. Triệu chứng: "load từng giây".

Fix: PTS = `frameIdx × (1/25 s)`. Layer's `controlTimebase` source-clock host,
bắt đầu rate = 0, được kick lên rate = 1.0 ngay khi frame đầu đến. Cho buffer
~3-5 s tự nhiên (LWM=1s, HWM=2s mặc định của layer).

### Live vs Playback transport

| Mode | Transport | Port | Codec |
|---|---|---|---|
| Live | RTSP `DH/RTP/TCP` (custom Dahua profile) | 9132 (relay) | HEVC hoặc H.264 |
| Playback | HTTP tunnel GET `/vod/playback.rtpxav?...` | 9132 (relay) | tương tự |

Cả 2 đều dùng cùng cloud relay nhưng schema URL khác. Module tự chọn client
dựa trên scheme của URL (`rtsp://` → `DhRtspClient`, `http://` hoặc playback
path → `DhHttpClient`).

Playback với `encrypt=2` hoặc `encrypt=3` thì cần WSSE auth header và per-frame
AES decrypt (key derive từ device password, đã wrap sẵn — JS không cần biết).

---

## 6. Test account (DEMO, dùng để thử trên emulator/dev)

```
phone:      869941629
areaCode:   84
password:   HoangHuyen@0810
```

Cameras gắn với account này:

| Tên | deviceId | Codec | Trạng thái |
|---|---|---|---|
| Bể Cá | 7595AAKPSF53C50 | HEVC | online (đời mới) |
| hồ phải | 8H080FCPBVE52B7 | H.264 | online (Lechange đời cũ, productId rỗng) |
| Su Bon | 65982BBPSF8E25D | — | thường offline |
| Cam Pick 1 | 028AFBCPSFBB79F | — | thường offline |
| Cam pick 2 | 5858CBDPSF15233 | — | thường offline |

**⚠️ Session contention:** Imou cloud chỉ cho 1 active session per account. Nếu
app gốc Imou mở trên điện thoại khác cùng login → app dev sẽ bị kick (lỗi
`12002`). Khi dev test, dùng tài khoản riêng hoặc đảm bảo app gốc đã logout.

---

## 7. Sample ứng dụng

Thư mục `example/App.tsx` chứa demo flow đầy đủ:
- LoginScreen
- DevicesList
- ViewScreen (tabs Live + Playback)
- Snapshot button

Trong repo dev có thể tham khảo `ImouTestApp/App.tsx` — đã chạy thật trên iOS
simulator + iPhone device.

---

## 8. Troubleshooting

### "load nhanh nhưng video không mượt, có cảm giác load từng giây"

DHAV timestamp resolution issue. Đã fix trong bản hiện tại. Nếu vẫn còn, check
xem build có đúng version chứa `globalFrameIdx`-based PTS không
(`HEVCRenderer.swift:computePts`).

### "frame đầu hiện rồi đứng 5 giây mới play tiếp"

Race condition giữa `reset()` (dispatch main) và `computePts` (renderQ). Đã
fix bằng việc reset timebase **synchronously** từ renderQ. Verify file
`HEVCRenderer.swift:reset()` không còn `DispatchQueue.main.async` quanh
`CMTimebaseSetRate/SetTime`.

### Hình ảnh bị khối màu nhiễu lúc đầu vài giây

Decoder chưa khoá được IDR frame. Module có IDR-gate
(`awaitingKeyframe`) — slice NAL bị drop cho tới khi gặp IDR đầu tiên sau
mỗi rebuild format desc. Nếu vẫn thấy artifact, xem log `[HEVCRenderer]
droppedAwaitKf=N`. Có thể tăng `liveBufferLag` từ 200 ms lên 500 ms.

### Stream dừng sau 6-15 giây

Khả năng là decoder không kịp dẫn đến TCP backpressure. Verify:
1. `DhRtspClient.swift` dùng POSIX `Darwin.socket` (không phải `NWConnection`)
2. `Player.swift` dispatch render qua `renderQ.async { ... }`, không inline.

Nếu cả 2 đều OK mà vẫn dừng, capture pcap (`tshark -i en0 host <relay-ip>`) +
gửi cho team native để diff với baseline Python.

### "Start live failed: code 12002"

Session expired. Force re-login.

### Android-specific gotchas

Những điểm Android khác iOS, dev RN cần biết khi style `<ImouVideoView />`:

1. **Đừng set `backgroundColor` lên `<ImouVideoView />`.**
   SurfaceView dùng cơ chế "punch-through": surface là 1 hardware layer
   composite RIÊNG, View tree để lại 1 cái hole trong suốt để surface lộ
   ra. Set `backgroundColor` của View sẽ tô màu LÊN cái hole đó → video bị
   che đen. Nếu cần nền tối cho letterbox, set lên **container** bao quanh
   `<ImouVideoView />` thay vì chính nó:
   ```tsx
   <View style={{ backgroundColor: '#000' }}>
     <ImouVideoView sessionId={sid}
       style={{ width: '100%', aspectRatio: 16/9 }} />
   </View>
   ```

2. **`<ImouVideoView />` chiếm z-order trên cùng trong vùng bounds của nó.**
   Module dùng `setZOrderOnTop(true)` để surface render ABOVE RN view tree
   (tránh bị overlay che). Hệ quả: RN children/overlays nằm CÙNG TỌA ĐỘ
   với `<ImouVideoView />` sẽ ở DƯỚI video. Overlay (controls, badge, …)
   phải nằm ngoài bounds, hoặc đặt trong sibling View đè ngoài (chứ không
   phải child của ImouVideoView).

3. **NDK version**: project app cần `ndkVersion = "27.1.12297006"`
   (hoặc bất kỳ NDK 26+ nào installed). Module không có C++ source nên
   không strict, nhưng RN 0.74+ cần NDK 26 trở lên.

4. **`adb reverse tcp:8081 tcp:8081`** khi chạy Metro trên máy dev — bằng
   không emulator không kết nối được packager. Phải re-run sau mỗi lần
   uninstall/reinstall app.

5. **Headless emulator + `screencap`**: nếu chụp ảnh emulator không thấy
   video (đen) nhưng log `HEVCRenderer: output format changed` xuất hiện
   thì là quirk của headless screencap với SurfaceView layer — đổi sang
   emulator có cửa sổ (`-no-window` bỏ ra) để verify mắt thường.

### Audio không có tiếng

Đã có audio từ bản hiện tại. Nếu vẫn không nghe tiếng:

1. **Kiểm tra `withAudio` flag**: `startLive(deviceId, { withAudio: true })` —
   nếu set `false` thì audio bị disable hoàn toàn.
2. **iOS Simulator + Mac mute**: simulator phát qua loa Mac. Kiểm tra volume
   Mac (System Settings → Sound) + nút mute trên simulator title bar.
3. **Console log nên thấy**:
   ```
   [AACRenderer] configuring: 16000.0Hz 1ch
   [AACRenderer] engine started OK
   [AACRenderer] decoded=100 packets, ... player.isPlaying=true
   ```
   Nếu thấy `FillComplexBuffer status=-50`: format mismatch — báo bug.
4. **AVAudioSession xung đột**: app khác đang chiếm session độc quyền
   (Apple Music, FaceTime, …). Module dùng `.mixWithOthers` để né nhưng vẫn
   có lúc bị take-over.
5. **Camera không có mic**: vài camera Imou đời cũ disable audio capture.
   Check trong app Imou gốc xem có tiếng không.

---

## 9. Roadmap / hạn chế hiện tại

**Legend:** ✅ live verified trên thiết bị thật/sim · 🔵 code-complete, chưa UI test riêng nhưng share path với phần đã verify · ⚠️ partial / có caveat · ❌ chưa làm

| Tính năng | iOS | Android |
|---|---|---|
| Build module | ✅ | ✅ |
| Login + captcha (Geetest) | ✅ | ✅ |
| Session persist (Keychain / EncryptedSharedPreferences) | ✅ | ✅ |
| `listDevices` | ✅ | ✅ |
| `listRecordings` | ✅ | ✅ |
| Live HEVC | ✅ verified | ✅ verified (Bể Cá 2304×1296) |
| Live H.264 | ✅ verified | ✅ verified (hồ phải 2560×1440) |
| Codec auto-switch (HEVC ↔ H.264) | ✅ | ✅ |
| Playback HEVC + H.264 | ✅ | 🔵 |
| AAC audio output | ✅ verified | ✅ pipeline verified (PCM → AudioTrack PLAYING) |
| `setMuted` / `setPaused` | ✅ | 🔵 |
| HD/SD quality switch | ✅ | 🔵 |
| Snapshot (cache JPEG) HEVC | ✅ | 🔵 |
| Snapshot H.264 codec-aware | ✅ | 🔵 (port codec-aware xong) |
| `saveToGallery` snapshot | ✅ Photos library | 🔵 MediaStore (Pictures/Imou) |
| Picture-in-Picture | ✅ iOS 15+ | ❌ Activity-level — cần app config |
| **Auto-reconnect TCP drop** (exp backoff 1-30s) | ✅ | ✅ |
| **12002 session-expired auto-relogin** | ✅ | ✅ |
| **PTZ `ptzMove` + `ptzReset`** | 🔵 | ✅ live verified xuantran (UP/DOWN/LEFT/RIGHT/ZOOM in) |
| **Absolute zoom `setZoomLevel` / `getZoomLevel`** | 🔵 | ✅ live verified (Get 10× → Set 25× → Get 23.6×) |
| Device thật | ✅ | ⚠️ mới chỉ emulator |
| Two-way talk (mic → camera) | ❌ | ❌ |
| Cloud recording playback | ❌ | ❌ |
| Seek / speed trong playback | ❌ | ❌ |
| Multi-camera grid | ❌ | ❌ |

**Caveat ptzReset:** server đôi khi trả code `10002` "request timeout" nếu camera
đang busy xử lý `ptzMove` trước đó. App nên debounce hoặc disable Reset button
trong N giây sau move.

**Caveat absolute zoom:** optical zoom có discrete steps. Set 25× rồi Get có thể
trả về 23.6× hoặc 26.2× — phụ thuộc bước thấu kính camera, không phải bug.

---

## 10. Liên hệ + báo lỗi

Khi báo bug, cung cấp:
- iOS sim/device version + Xcode version
- Tên camera + `deviceId` + `productId`
- Console log có filter `[Player.`, `[HEVCRenderer]`, `[DhRtspClient]`,
  `[DhHttpClient]`, `FigVideoQueueGM`
- Nếu vấn đề về timing/lag: `tshark` pcap capture port 9132

Source ở `imou-rn-native/ios/*.swift` và `imou-rn-native/android/.../*.kt`.
