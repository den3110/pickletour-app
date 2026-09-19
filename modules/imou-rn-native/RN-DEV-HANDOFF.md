# `imou-rn-native` — Hướng dẫn tích hợp cho đội RN

Tài liệu hand-off dành cho dev RN tích hợp `imou-rn-native` vào app production.
Đọc xong file này là đủ. Chi tiết kiến trúc + protocol xem [INTEGRATION.md](./INTEGRATION.md).

---

## TL;DR — Module làm được gì

Một thư viện native iOS+Android cho phép RN app:
- **Xem live HEVC + H.264** camera Imou (Bể Cá / xuantran / hồ phải đã verify)
- **Playback SD card** theo time range hoặc list recordings
- **Snapshot** một frame ra JPEG (cache hoặc lưu Photos/Gallery)
- **Audio AAC LC** đồng bộ với video
- **Picture-in-Picture** iOS 15+
- **PTZ** pan/tilt/zoom relative + absolute zoom theo X level (xuantran 40× verified)
- **Auto-reconnect** khi mất TCP, **12002 auto-relogin** khi session expire
- **Không cần Imou Open API** — đăng nhập trực tiếp bằng phone + password
- **Không có FFmpeg** — VideoToolbox / MediaCodec hardware decode. Bundle iOS ~250KB, Android ~400KB

---

## 1. Cài đặt

```bash
yarn add file:./imou-rn-native       # hoặc git+ssh URL nếu publish
cd ios && pod install
```

**Yêu cầu:**
- iOS 15+ (cần `AVSampleBufferDisplayLayer.controlTimebase`)
- Android API 23+ (Marshmallow), NDK 26+ (app's `build.gradle`: `ndkVersion = "27.1.12297006"`)
- React Native 0.72+ (Fabric hoặc Legacy đều OK)
- JDK 17 (AGP 8 requirement)

### Permissions

**iOS `Info.plist`:**
```xml
<key>NSAppTransportSecurity</key>
<dict>
  <key>NSAllowsArbitraryLoads</key>
  <true/>
</dict>
<key>UIBackgroundModes</key>
<array><string>audio</string></array>      <!-- cho PiP -->
<key>NSPhotoLibraryAddUsageDescription</key>
<string>Lưu ảnh chụp từ camera vào thư viện.</string>
```

**Android `AndroidManifest.xml`:**
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<!-- saveToGallery API ≤28 cần permission này; API 29+ scoped storage tự lo -->
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE"
                 android:maxSdkVersion="28" />
<application android:usesCleartextTraffic="true" ...>
```

---

## 2. API surface

```typescript
import { ImouNative, ImouVideoView, ImouCaptcha } from 'imou-rn-native';
```

### Auth

```typescript
// Login bằng phone + password. Pop captcha event nếu Imou yêu cầu.
await ImouNative.login({ phone: '869941629', areaCode: '84', password: '...' });

// Mount <ImouCaptcha /> ở root để handle Geetest captcha tự động.
<ImouCaptcha />

// Check session hiện tại còn valid (boot app)
const ok = await ImouNative.isLoggedIn();   // bool

// Logout
await ImouNative.logout();
```

**Captcha flow:** module tự emit `captchaRequired` event khi Imou đòi.
`<ImouCaptcha />` listen event, hiện WebView Geetest slide-puzzle, gọi
`submitCaptcha()` khi user xong. Không cần code thêm.

**Auto-relogin (12002):** sau login lần đầu, module cache phone/areaCode/password
vào Keychain (iOS) / EncryptedSharedPreferences (Android). Khi cloud trả code
12002 (session bị invalidate), module tự retry login + replay call. Xem
section [Events](#events) ở dưới.

### Devices

```typescript
type Camera = {
  deviceId: string;     // identifier
  name: string;         // display name
  model: string;
  productId: string;    // '' cho legacy Lechange
  online: boolean;
};

const cams: Camera[] = await ImouNative.listDevices();
```

### Live view

```typescript
type Session = { sessionId: string };

const session = await ImouNative.startLive(deviceId, {
  quality: 'hd',           // hoặc 'sd' (sub stream ~1/4 bitrate)
  withAudio: true,         // default true
});

// Mount view — module render hardware-decoded frames vào surface
<ImouVideoView
  sessionId={session.sessionId}
  style={{ width: '100%', aspectRatio: 16 / 9 }}
  resizeMode="contain"     // 'contain' | 'cover'
  onReady={() => {}}
  onError={(e) => {}}
/>
```

⚠️ **Android: KHÔNG set `backgroundColor` trên `<ImouVideoView/>`.** SurfaceView
dùng punch-through hole; backgroundColor tô đè lên hole sẽ che video. Set lên
container wrapping nếu cần:

```tsx
<View style={{ backgroundColor: '#000' }}>
  <ImouVideoView sessionId={sid} style={{ width: '100%', aspectRatio: 16/9 }} />
</View>
```

### Runtime controls

```typescript
await ImouNative.setMuted(sessionId, true);    // mute audio instant
await ImouNative.setPaused(sessionId, true);   // freeze video (stream tiếp drain)
// HD/SD: cần stop + start lại
await ImouNative.stopSession(sessionId);
const s = await ImouNative.startLive(devId, { quality: 'sd' });
```

### PTZ (cameras có `cm_ptz` capability — xuantran, speed-dome, vv)

```typescript
// Relative move 8 hướng với speed + duration
await ImouNative.ptzMove(deviceId, {
  h: 0.7,            // -1..1: ngang (âm = trái, dương = phải)
  v: 0.5,            // -1..1: dọc  (âm = xuống, dương = lên)
  zoom: 0,           // -1..1: zoom relative (âm = wide, dương = tele)
  durationMs: 500,   // 1..99999, default 500
});

// Reset PTZ về vị trí mặc định
await ImouNative.ptzReset(deviceId);
```

**Caveat:** sau `ptzMove`, camera bận xử lý ~1s. `ptzReset` ngay sau đó server
hay trả `code=10002 'request time out'`. Debounce trong UX.

**PTZ service khác nhau theo camera (verify live):** không phải cam nào cũng
dùng `PtzMoveEight` (22100). Speed-dome (xuantran) = 22100; nhiều PT-cam (vd
Cam pick 2 `IPC-S7XE`) chỉ nhận `PtzMoveFour` (24300) — gọi 22100 trả device
error **40999**. `ptzMove` tự **cascade 22100 → 24300 → 24500 (TwoLR)** và
**cache service chạy được per-device**, nên JS chỉ cần gọi `ptzMove` như nhau
cho mọi loại cam. Nếu cam đang busy, cả variant đúng cũng có thể trả 40999 tạm
thời — tap lại là được (cache chưa set thì cascade thử lại từ đầu).

#### Auto-nhận diện khả năng PTZ → render UI đúng theo cam

```typescript
const cap = await ImouNative.getPtzCapability(deviceId);
// cap.move: 'eight' (speed-dome 8 hướng) | 'four' (PT 4 hướng)
//         | 'twoLR' (pan trái-phải) | 'none' (cam cố định)
// cap.zoom: boolean — có optical zoom hay không
```

Probe **không di chuyển cam** (gửi move với `h=v=zoom=0, dur=1` cho từng
service + `GetZoomFocus`): service hỗ trợ trả `10000`, không hỗ trợ trả `40999`.
Kết quả cache per-device. Verify live: xuantran→`{move:'eight',zoom:true}`,
Cam pick 2→`{move:'four',zoom:false}`, cam cố định→`{move:'none',zoom:false}`.

App dùng `cap` để **chỉ hiện controls cam hỗ trợ**: 'eight' = pad 8 hướng,
'four' = 4 hướng (không chéo), 'twoLR' = chỉ ←/→, 'none' = ẩn pad; nút Zoom +
badge zoom chỉ hiện khi `cap.zoom`. Xem `ZoomBadge`/`ViewScreen` trong
`ImouTestApp/App.tsx`. Lưu ý: nếu probe chỉ nhận `12099` (cam offline/unknown)
thì KHÔNG cache → lần sau (khi cam online) sẽ nhận diện lại.

### Absolute zoom (zoom theo X level)

Đơn vị **gốc** của Imou cloud là **normalized [0..1]** (0=widest, 1=max optical).
Số "×" KHÔNG tồn tại trong cloud — xem `#### maxX` bên dưới.

```typescript
// Cách 1 — normalized trực tiếp (đúng đơn vị cloud, không cần maxX):
await ImouNative.setZoomLevel(deviceId, { level: 0.5 });
const level = await ImouNative.getZoomLevel(deviceId);   // 0..1, vị trí THẬT

// Cách 2 — theo "×", cần maxX app đã lưu cho cam (user nhập lúc add cam):
await ImouNative.setZoomX(deviceId, 25, maxX);           // 25×
const x = await ImouNative.getZoomX(deviceId, maxX);     // 1..maxX
// Helper thuần JS nếu cần tự convert:
import { zoomXToNormalized, zoomNormalizedToX } from 'imou-rn-native';
```

**Ground-truth (verify live trên xuantran `DH-SD-6A9230U-HN`):**
- `getZoomLevel` đọc service 22400 ref `22421` — server trả **JSON number** (vd
  `0.2366`), không phải string. *(iOS bug cũ: `as? String` fail → luôn 0.0. Đã
  fix — parse cả number lẫn string.)*
- `setZoomLevel` (service 25100) output `25121` **chỉ echo lại request**, KHÔNG
  phải vị trí thật. Vị trí thật chỉ đọc qua `getZoomLevel` sau khi optics settle.
- Optical zoom **rời rạc + phi tuyến**: set 0.0 → đọc lại `0.0078125` (1/128);
  set 25× → Get có thể 23.6×. Không phải bug — bước thấu kính vật lý. Camera mất
  1-3s di chuyển ống kính.

#### maxX — Imou KHÔNG expose qua API → user tự nhập

**Đã verify exhaustive** (standard_model services + properties + live probe):
cloud chỉ dùng normalized 0..1. Max optical zoom (×) KHÔNG có ở bất kỳ
endpoint/property nào. Imou app gốc cũng chỉ hiển thị **slider 0..1**, không có "×".

**Cách chốt (theo yêu cầu sản phẩm):** user **tự nhập maxX khi add cam** (vào bể),
sửa qua **nút edit thông số riêng**. App persist maxX theo `deviceId`
(AsyncStorage/DB). `Camera.model` (vd `DH-SD-6A9230U-HN`) chỉ dùng làm **gợi ý**,
không phải nguồn chính xác. Xem reference impl: `ZoomInput` trong
`example`/`ImouTestApp/App.tsx` (per-camera `maxXStore` + nút "✎ Sửa").

`setZoomLevel`/`getZoomLevel` chỉ nhận/trả normalized 0..1 — module không assume
gì về camera spec; `setZoomX`/`getZoomX` là tiện ích nhận maxX từ app.

### Playback (SD card)

```typescript
// Option 1: list recordings (hỗ trợ trên cameras mới)
try {
  const recs = await ImouNative.listRecordings(deviceId, '2026-06-02');
  // [{ begin: '20260602T085030', end: '...', durationS: 30, typeName: 'motion' }, ...]
} catch (err) {
  // Legacy Lechange trả 10003 — fallback time-range manual
}

// Option 2: play time range (cho mọi camera, kể cả legacy không list được)
const begin = '20260602T080000';   // LOCAL time, không phải UTC
const end   = '20260602T083000';
const s = await ImouNative.startPlayback(deviceId, begin, end, {
  encrypt: 2,            // 2 (legacy AES) hoặc 3 (newer wsse) — module tự thử
  withAudio: true,
});
// Mount <ImouVideoView sessionId={s.sessionId} /> như live
```

### Snapshot

```typescript
const { uri } = await ImouNative.snapshot(deviceId);
// uri = file://.../snap-xxx.jpg (cache dir)

// Lưu thẳng vào Photos library (iOS) / Pictures/Imou (Android MediaStore)
const r = await ImouNative.snapshot(deviceId, { saveToGallery: true });
// r = { uri, savedToGallery: true }  (Android side-effect, fail không throw)
```

### Picture-in-Picture (iOS 15+, KHÔNG có Android)

```typescript
await ImouNative.startPiP(sessionId);   // mở PiP overlay
await ImouNative.stopPiP(sessionId);    // đóng
```

Trên Android trả về reject với message "not implemented" — PiP Android là
Activity-level (`enterPictureInPictureMode`), không phải module-level. App
phải tự config Activity nếu cần.

### Stop / cleanup

```typescript
await ImouNative.stopSession(sessionId);
// Đóng socket, dừng decoder, free buffers. LUÔN gọi khi unmount view.
```

---

## 3. Events

```typescript
// Stream errors — sub.remove() để unsubscribe.
const errSub = ImouNative.onError((e: { code: string; message: string; sessionId?: string }) => {
  switch (e.code) {
    case 'reconnecting':
      // Stream tạm thời ngắt — module đang exp-backoff retry.
      // message: "attempt=N nextDelayMs=M". KHÔNG fatal.
      showBanner('Đang kết nối lại...');
      break;
    case 'producer_failed':
      // Fatal — chỉ raise cho playback (live retry vô hạn).
      Alert.alert('Stream chết', e.message);
      break;
    default:
      Alert.alert(e.code, e.message);
  }
});

// Captcha (handled by <ImouCaptcha />, KHÔNG cần listen tay)
const capSub = ImouNative.onCaptchaRequired((e) => {});

// Session expired (12002) — module TỰ relogin từ cached creds, event chỉ
// thông báo để app show spinner. Nếu relogin fail (vd captcha required mới),
// call gốc reject như bình thường.
const expSub = ImouNative.onSessionExpired?.((e: { reason: string }) => {
  showSpinner('Đang đăng nhập lại...');
});

// Cleanup
return () => {
  errSub.remove();
  capSub.remove();
  expSub?.remove();
};
```

---

## 4. Resilience features (mới)

### Auto-reconnect trên TCP drop

Module tự retry LIVE stream khi mất kết nối (server EOF, network blip, socket
reset):

- Exp backoff: 1s → 2s → 4s → 8s → 16s → 30s (cap)
- Reset về 1s khi stream chạy ổn > 25 frames
- Emit `error("reconnecting", "attempt=N nextDelayMs=M")` mỗi lần retry
- Cancel sạch khi user gọi `stopSession`
- **Playback không retry** — URL time-bounded, server reject re-open

### 12002 auto-relogin

Khi SaaS trả code `12002` (session expire / contention với app Imou official):

1. Module emit `sessionExpired` event để app show spinner.
2. Đọc cached `LoginCreds` (phone/areaCode/password, lưu Keychain/EncryptedSharedPreferences khi user login).
3. Gọi `AuthFlow.startLogin` lấy session mới.
4. Retry SaaS call gốc một lần với session mới.

Nếu không có creds cached (boot lần đầu), event vẫn fire nhưng retry fail
→ call bubble lỗi 12002 lên JS → app phải redirect login.

---

## 5. Recommended app structure

```typescript
// App.tsx
function App() {
  useEffect(() => {
    const errSub = ImouNative.onError(e => {
      if (e.code === 'reconnecting') return;  // ignore, module tự handle
      Alert.alert('Stream error', e.message);
    });
    const expSub = ImouNative.onSessionExpired?.(() => {
      // Hiện toast / spinner, đợi module relogin xong
    });
    return () => { errSub.remove(); expSub?.remove(); };
  }, []);
  // ...
}

// CameraScreen.tsx
function CameraScreen({ camera }: { camera: Camera }) {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await ImouNative.startLive(camera.deviceId, { quality: 'hd' });
      if (!cancelled) setSession(s);
    })();
    return () => {
      cancelled = true;
      if (session) ImouNative.stopSession(session.sessionId).catch(() => {});
    };
  }, [camera.deviceId]);

  return (
    <View>
      {session && (
        <ImouVideoView
          sessionId={session.sessionId}
          style={{ width: '100%', aspectRatio: 16/9 }}
        />
      )}
      {/* PTZ pad, snapshot button, vv */}
    </View>
  );
}
```

---

## 6. Test account (DEMO — dùng cho dev)

```
phone:     869941629
areaCode:  84
password:  HoangHuyen@0810
```

Cameras trong account:

| Name | Codec | Tính năng đặc biệt | Test verified |
|---|---|---|---|
| Bể Cá | HEVC, 25 fps | Audio AAC 16 kHz | live HEVC + audio (Android + iOS) |
| hồ phải | H.264, ~20 fps | Legacy Lechange (productId='') | live H.264 |
| xuantran | HEVC | **PTZ + 40× optical zoom** | PTZ 8 hướng + setZoomLevel verified |

⚠️ **Session contention:** app Imou official + headless session từ module
share cùng account → login mới invalidate session cũ với 12002. Auto-relogin
sẽ tự handle, nhưng nếu cả 2 mở cùng lúc thì sẽ loop. UX nên cảnh báo user.

---

## 7. Cảnh báo + debug

### iOS

- **`AVAudioSession` xung đột**: app khác (Music, FaceTime) chiếm độc quyền —
  module dùng `.mixWithOthers` để né, nhưng vẫn có lúc bị take-over.
- **Camera không có mic**: vài camera Imou đời cũ disable audio capture.
- **Filter logcat**: `[Player.`, `[HEVCRenderer]`, `[DhRtspClient]`, `[DhHttpClient]`, `[AACRenderer]`, `FigVideoQueueGM`

### Android

- **`<ImouVideoView/>` đừng set `backgroundColor`** (xem above).
- **JDK 17** bắt buộc — AGP 8 yêu cầu. Mac: `brew install openjdk@17`.
- **`adb reverse tcp:8081 tcp:8081`** khi dev với Metro — emulator không tự
  forward port. Re-run sau mỗi lần `pm clear` / `uninstall`.
- **Headless emulator** đôi khi không render SurfaceView trong `screencap` —
  log thấy `HEVCRenderer: output format changed` nhưng screenshot đen. Bật
  windowed emulator để verify mắt thường.
- **NDK version**: app `build.gradle` cần `ndkVersion = "27.1.12297006"`
  (hoặc bất cứ NDK 26+ nào installed cho RN 0.74).
- **Filter logcat**: `adb logcat -s ImouPlayer:I HEVCRenderer:I AACRenderer:I DhRtspClient:I ImouRN:I`

### Common SaaS error codes

| Code | Ý nghĩa | App nên làm |
|---|---|---|
| `10000` | OK | — |
| `10002` | request timeout | retry 1-2s sau |
| `10003` | server error / unsupported | `listRecordings` legacy Lechange — fallback time-range |
| `12002` | session expired | Module tự relogin. App show spinner, nếu vẫn fail thì redirect login |
| `12100` | user no right | productId sai hoặc account không có quyền |
| `13002` | device offline | Camera tắt nguồn / mất mạng |

---

## 8. Roadmap chưa làm

| Tính năng | Effort | Ưu tiên |
|---|---|---|
| Two-way talk (mic → camera) | 5-7 day, cần reverse Frida cho backchannel endpoint | High |
| Camera settings (mic/IR/motion toggles) | 1-2 day, đã có service IDs từ standard_model | High |
| Event/alarm list | 1-2 day, `device.event.GetXxx` API | Medium |
| PiP Android | 1-2 day, cần Activity-level config từ host app | Medium |
| Snapshot saveToGallery iOS đã có | done — Android cũng đã có | — |
| Verify Android trên device thật | 0.5 day | High before ship |
| Cloud recording playback | unknown — Imou cloud SDK khác local SD | Low |
| Multi-camera grid | 1-2 day, mostly RN-side layout + multiple sessions | Medium |

---

## 9. Build instructions cho dev

### iOS

```bash
# Lần đầu / sau khi sửa native code
cd ImouTestApp
yarn install
cd ios && pod install && cd ..

# Build (rebuild thường)
xcodebuild -workspace ios/ImouTestApp.xcworkspace -scheme ImouTestApp \
  -configuration Debug -sdk iphonesimulator \
  -destination 'id=<SIMULATOR_UDID>' CODE_SIGNING_ALLOWED=NO build

# Run Metro + launch
node node_modules/react-native/cli.js start --port 8081 &
xcrun simctl launch <SIMULATOR_UDID> org.reactjs.native.example.ImouTestApp
```

Nếu module đang dev (file: link), sau mỗi edit source:
```bash
rsync -a --delete imou-rn-native/ios/ ImouTestApp/node_modules/imou-rn-native/ios/
rsync -a --delete imou-rn-native/src/ ImouTestApp/node_modules/imou-rn-native/src/
cd ImouTestApp/ios && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install
```

### Android

```bash
cd ImouTestApp
yarn install

export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools

# Boot emulator (lần đầu mất ~2 phút)
emulator -avd pixel_5 -no-snapshot &
adb wait-for-device

# Map Metro port (sau mỗi reboot/reinstall)
adb reverse tcp:8081 tcp:8081

# Build + install
cd android && ./gradlew :app:assembleDebug -x lint
adb install -r app/build/outputs/apk/debug/app-debug.apk

# Metro
node node_modules/react-native/cli.js start --port 8081 &

# Launch
adb shell am start -n com.imoutestapp/.MainActivity
adb logcat -s ImouPlayer:I HEVCRenderer:I AACRenderer:I DhRtspClient:I ImouRN:I
```

Sau mỗi edit module native:
```bash
rsync -a --delete imou-rn-native/android/ ImouTestApp/node_modules/imou-rn-native/android/
rsync -a --delete imou-rn-native/src/    ImouTestApp/node_modules/imou-rn-native/src/
```

(yarn `file:` link là COPY chứ không symlink — phải rsync source vào node_modules.)

---

## 10. Liên hệ + báo lỗi

Khi báo bug, cung cấp:
- Platform + version (iOS sim/device + Xcode / Android API + manufacturer)
- Tên camera + `deviceId` + `productId`
- Console log filtered (xem § 7 above)
- Nếu vấn đề về timing/lag: tshark pcap port 9132 hoặc 5050
- Screenshot / video reproduce nếu UI

**Mọi tính năng đã ✅ verified trong roadmap đều có log evidence** — xem
[CHANGELOG-android-2026-06-02.md](./CHANGELOG-android-2026-06-02.md) để biết
trạng thái live-verified vs code-only của từng method.
