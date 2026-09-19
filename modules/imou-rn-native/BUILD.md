# BUILD — Hướng dẫn build + iterate trên device

> Mục tiêu: build `imou-rn-native` trong app RN có sẵn của bạn, fix bug khi gặp, lặp đến lúc xem được camera.

---

## 1. Setup app project (host RN)

Module này KHÔNG có app RN riêng. Bạn cần một RN app làm host. Cách nhanh:

```bash
# Option A: dùng app RN có sẵn của bạn
cd path/to/your-rn-app

# Option B: tạo mới để test
npx @react-native-community/cli@latest init ImouTestApp --version 0.74
cd ImouTestApp
```

Yêu cầu:
- RN ≥ **0.72**
- iOS deployment target ≥ **15.0** — edit `ios/Podfile`:
  ```ruby
  platform :ios, '15.0'
  ```
- Android `minSdk ≥ 23` — edit `android/build.gradle`:
  ```gradle
  buildscript {
    ext {
      minSdkVersion = 23
      compileSdkVersion = 34
      ndkVersion = "25.2.9519653"
    }
  }
  ```

---

## 2. Link module

### Cách 1 — link local (recommended cho dev/debug)

```bash
# Trong RN app:
yarn add file:../path/to/imou-rn-native
yarn add react-native-webview
```

Or with relative path in `package.json`:
```json
{
  "dependencies": {
    "imou-rn-native": "file:../imou-rn-native",
    "react-native-webview": "^13.0.0"
  }
}
```

Then:
```bash
yarn install
```

### Cách 2 — npm publish (cho production)

```bash
cd imou-rn-native
npm publish    # hoặc private registry
# Sau đó app:
yarn add imou-rn-native react-native-webview
```

---

## 3. iOS: pod install

```bash
cd ios
bundle install   # nếu lần đầu
pod install      # link native module + react-native-webview
cd ..
```

Sau khi pod install xong, kiểm tra:
```bash
grep "ImouRnNative\|imou-rn-native" ios/Podfile.lock
# Phải thấy entry
```

### iOS — `Info.plist` setup

Thêm vào `ios/<YourApp>/Info.plist`:

```xml
<key>NSAppTransportSecurity</key>
<dict>
  <key>NSAllowsArbitraryLoads</key>
  <true/>
</dict>

<!-- Optional: nếu muốn snapshot lưu vào Photo Library -->
<key>NSPhotoLibraryAddUsageDescription</key>
<string>Lưu snapshot từ camera</string>

<!-- Audio playback in background (nếu cần) -->
<key>UIBackgroundModes</key>
<array>
  <string>audio</string>
</array>
```

---

## 4. Android: gradle sync + manifest

Mở Android Studio hoặc:

```bash
cd android
./gradlew :app:dependencies | grep imou-rn-native
# Phải thấy entry trong dependency tree
```

### Android — `AndroidManifest.xml`

```xml
<manifest ...>
  <uses-permission android:name="android.permission.INTERNET" />
  <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

  <application
    android:usesCleartextTraffic="true"   <!-- cho relay TCP plain -->
    ...>
  </application>
</manifest>
```

### Android — `MainApplication.kt` (RN 0.72+)

Auto-link sẽ tự pick up `ImouNativePackage`. Verify:

```kotlin
override fun getPackages(): List<ReactPackage> =
    PackageList(this).packages.apply {
      // Auto-added by react-native-link or autolinking.
      // Should contain ImouNativePackage now.
    }
```

Nếu autolink không hoạt động, thêm manual:

```kotlin
import com.imou.rn.nativemod.ImouNativePackage

override fun getPackages() = PackageList(this).packages + listOf(
  ImouNativePackage()
)
```

---

## 5. Code App.tsx

Copy nguyên file [`example/App.tsx`](example/App.tsx) đè lên `App.tsx` của bạn, hoặc tự viết theo template trong [INTEGRATION.md](INTEGRATION.md).

---

## 6. Build lần đầu

### iOS

```bash
yarn start                  # Terminal 1: Metro
yarn ios --simulator='iPhone 15'  # Terminal 2
# hoặc
yarn ios --device='<Tên iPhone>'
```

### Android

```bash
yarn start                # Terminal 1: Metro
yarn android              # Terminal 2 (sẽ install + chạy)
# hoặc qua adb cho device:
adb devices               # verify device connected
yarn android              # autodetect
```

---

## 7. Errors thường gặp + fix

### iOS

| Error | Fix |
|---|---|
| `'data(for:)' is only available in iOS 15.0+` | Bump `platform :ios, '15.0'` trong Podfile |
| `Cannot find type 'AVSampleBufferDisplayLayer' in scope` | `import AVFoundation` đã có; check iOS target |
| `Use of unresolved identifier 'kVTDecodeFrame_EnableAsynchronousDecompression'` | Đảm bảo `import VideoToolbox` + iOS 11+ |
| `'sampleTimingArray' parameter signature mismatch` | Update Xcode lên 14+ (CMSampleBufferCreateReady API stable) |
| `linking against arm64` errors | `pod install` again, clean Build Folder (Cmd+Shift+K) |

### Android

| Error | Fix |
|---|---|
| `Package com.imou.rn.native does not exist` | Đã fix — package giờ là `com.imou.rn.nativemod` |
| `MediaCodec.createDecoderByType("video/hevc") failed` | Device không support HEVC. Test trên device Android 5+ |
| `EncryptedSharedPreferences requires API 23+` | Bump `minSdk = 23` |
| `Default interface method requires API 24+` | Dùng `kotlin_jvm_target = "17"` trong app gradle |
| `Class not found ImouNativePackage` | MainApplication chưa add package — xem § 4 |

### Runtime

| Error | Fix |
|---|---|
| Login fail with `12000` | Sai số điện thoại — bỏ số 0 đầu khi có areaCode |
| Login stuck → captcha modal không hiện | Chưa mount `<ImouCaptcha />` trong App root |
| `Player error: not_logged_in` | Session expired — gọi lại `login()` |
| Video đen / không frame | Xem § 8 — capture log |
| Audio crash | Tạm pass `withAudio: false` để isolate |
| `Producer error: connection timeout` | Camera offline hoặc network unstable |

---

## 8. Khi gặp bug — chia sẻ log cho tôi

### iOS log

```bash
yarn react-native log-ios

# Hoặc trong Xcode: View → Debug Area → Activate Console
# Filter: "imou-rn-native"
```

### Android log

```bash
adb logcat -s ReactNative:V ReactNativeJS:V ImouPlayer:V HEVCRenderer:V AACRenderer:V

# Hoặc Android Studio Logcat tab, filter "imou\|ImouPlayer\|HEVCRenderer"
```

### Khi báo bug cho tôi, paste:
1. Full error message (file + line nếu có)
2. Platform (iOS/Android + version)
3. Action trigger (login / startLive / startPlayback / etc.)
4. Optional: device model

---

## 9. Iteration loop

```
┌──────────────────┐
│ Build (yarn ios) │
└────────┬─────────┘
         │ fail
         ▼
┌──────────────────────┐
│ Copy error → message │
│ tôi → tôi sửa code  │
└────────┬─────────────┘
         │ rebuild
         ▼
┌────────────────────┐
│ Runtime test       │
└────────┬───────────┘
         │ fail / unexpected
         ▼
┌──────────────────────────┐
│ Capture log → message tôi│
└────────┬─────────────────┘
         │ fix
         ▼
   ... lặp đến khi xem được camera
```

Expected: ~5-15 iterations để build + chạy clean trên cả 2 platform.

---

## 10. Smoke test sau build

Khi build OK, test theo thứ tự:

1. **Login flow** — đăng nhập account thật, Geetest có thể hiện
2. **List devices** — phải thấy camera xuất hiện
3. **Snapshot** — gọi `snapshot(deviceId)` → mở file URI
4. **Live view** — `startLive` → phải thấy hình + nghe tiếng
5. **Playback** — `listRecordings` → chọn 1 cái → `startPlayback`

Mỗi bước fail → log → tôi fix.

---

## 11. Performance baseline (kỳ vọng)

| Metric | Expected | Acceptable |
|---|---|---|
| Time-to-first-frame (live) | <500 ms | <1.5 s |
| Time-to-first-frame (playback) | <800 ms | <2 s |
| FPS (live, 14fps source) | 14 | ≥10 |
| Memory per session | 30-50 MB | <80 MB |
| CPU phone (idle stream) | 5-10% | <20% |

Nếu performance dưới mức "acceptable", capture log + memory profile để debug.

---

## 12. Production checklist (trước khi ship)

- [ ] Build pass cả iOS + Android
- [ ] Login OK trên cả 2 platform
- [ ] Live view 30 phút không crash, không leak memory
- [ ] Playback đủ độ dài clip (test ≥ 5 phút)
- [ ] Snapshot lưu file OK
- [ ] App background → foreground vẫn play
- [ ] Wifi → 4G handoff không crash
- [ ] Test trên ≥ 3 thiết bị (iPhone 12+, Android 8+ device chính)
- [ ] Bundle size analyze (không có .so lạ)
- [ ] No `console.warn`/`NSLog` spam ở production build
