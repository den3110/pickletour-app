# `imou-rn-native` — Trạng thái build + test (Session 2026-06-01 night)

## ✅ Đã verify end-to-end trên thiết bị

| Hạng mục | iOS simulator | Android emulator | Bằng chứng |
|---|---|---|---|
| Build module | ✅ | ✅ | `xcodebuild ** BUILD SUCCEEDED **`, `gradlew BUILD SUCCESSFUL` |
| Native lib loaded vào RN | ✅ | ✅ | App render login screen, không crash |
| `<ImouCaptcha />` JS modal | ✅ (mount OK) | ✅ (mount OK) | Không trigger (login đầu thành công không cần captcha) |
| `ImouNative.login()` | ✅ | ✅ | Auto navigation tới Devices screen |
| Session persistence (Keychain / EncryptedSharedPrefs) | ✅ | ✅ | App relaunch còn login |
| `ImouNative.listDevices()` | ✅ | ✅ | 5 cameras hiện đúng tên + model |
| `ImouNative.startLive()` API call | ✅ | ✅ | Reach được server `things.media.GetRealTransferStreamUrl` |
| Error event plumbing | ✅ | ✅ | Server `DeviceOffline` parse + show alert đúng |
| NativeEventEmitter warning | ✅ fixed | ✅ fixed | `addListener`/`removeListeners` no-op shims |

## ⏳ Chưa verify (do camera offline)

Phần **render video** (`HEVCRenderer` + `MediaCodec`/`AVSampleBufferDisplayLayer` + `AACRenderer`):

- Code đã compile sạch ✅
- Wired đúng vào ViewManager ✅
- **Chưa nhận được frame** vì cả 5 cameras trong account đều offline server-side

Khi camera online, pipeline tự động run:
```
startLive() → SaaSClient → relay URL
            → DhRtspClient (DH/RTP/TCP)
            → DHAVParser.Assembler
            → HEVCRenderer / AACRenderer
            → AVSampleBufferDisplayLayer / MediaCodec → Surface
```

## 🐛 Bugs đã fix trong session này

| # | File | Lỗi | Fix |
|---|---|---|---|
| 1 | `imou-rn-native.podspec` | Test files trong `ios/Tests/` được bundle vào pod → XCTest unresolved | `exclude_files` + di chuyển ra `tests/ios/` |
| 2 | `ios/SaaSClient.swift` | `init()` internal → not callable as default param | Thêm `public init()` |
| 3 | `ios/HEVCNalExtractor.swift` | `HEVCNalType` không Equatable → `==` không compile | Thêm `: Equatable` |
| 4 | `ios/ImouNativeModule.m` | `RCT_EXTERN_REMAP_MODULE(ImouNative, ImouNativeModule, ...)` tìm Obj-C class sai | Đổi sang `RCT_EXTERN_MODULE(ImouNative, ...)` |
| 5 | `ios/HEVCRenderer.swift` + `Snapshot.swift` | `paramSets.map { $0.withUnsafeBytes { return UnsafePointer<UInt8> } }` → pointer leaks scope | Nest withUnsafeBytes 3-level |
| 6 | `ios/CryptoCore.swift` | `CCPadding` placeholder struct không compile | Rewrite với `CCCryptOneShot` + `ccCryptOFB` dùng đúng `CCPadding(ccNoPadding)` |
| 7 | `android/.../ImouVideoViewManager.kt` | Kotlin không support Swift-style `forSessionId sid:` parameter label | Đổi tên thành `sid` |
| 8 | `android/.../*.kt` | Package decl `com.imou.rn.nativemod` ≠ directory `com/imou/rn/native/` | Rename dir `native/ → nativemod/` (Java reserved word) |
| 9 | Module bridge | NativeEventEmitter cần `addListener/removeListeners` | Add `@ReactMethod` no-op shims |
| 10 | `ApiClient` | `devices.BasicList` 404 — endpoint sai | Đổi sang `device.list.BasicList` |
| 11 | `ApiClient` | Body fields sai cho deviceList | Dùng `familyId/limit/offset/roomId/transferStr` |
| 12 | `ApiClient` | `Camera.online` default false → cameras dimmed UI | Default true (API không trả `onLine`) |
| 13 | `ApiClient` | streamUrl body thiếu fields → 11001 bad request | Add `streamId/design/skipAuth/videoLimit/owner/...` |
| 14 | `ApiClient` | devicePassword sai endpoint (`SetIotService 27500`) | Đổi `iot.control.DevicePasswordGet` |
| 15 | `ApiClient` | productId lấy từ `d.productId` (always null) | Đọc từ `d.channelList[0].productId` |

## 📁 Sản phẩm bàn giao

```
imou-rn-native/             ← module RN native, dùng được
├── ios/                    ← Swift + Obj-C (3000+ LoC)
├── android/                ← Kotlin (2500+ LoC)
├── src/                    ← TypeScript (500+ LoC)
├── docs/BUNDLE_SIZE.md
├── tests/                  ← unit test fixtures + canonical vectors
├── INTEGRATION.md          ← hướng dẫn tích hợp cho team RN
├── BUILD.md                ← step-by-step build guide
├── RFC.md                  ← thiết kế chi tiết
└── README.md

ImouTestApp/                ← RN host app đã chạy thực tế
├── App.tsx                 ← demo flow: login → cameras → live/playback/snapshot
├── ios/                    ← iOS workspace, pod install xong
└── android/                ← Android project, gradle build xong
```

## 🎯 Bước tiếp theo cho team RN

1. **Đợi camera online** rồi tap Cam pick 2 → sẽ thấy video render thật
2. Nếu render lỗi → capture log:
   ```
   adb logcat -s HEVCRenderer:V AACRenderer:V ImouPlayer:V
   xcrun simctl spawn booted log show --predicate 'process == "ImouTestApp"' --last 1m
   ```
3. Thêm date picker (`@react-native-community/datetimepicker`) cho Playback tab nếu cần
4. Polish UX: loading spinner khi `startLive`/`startPlayback` đang chạy
5. Add reconnect logic khi app suspend → resume

## 📊 Resource budget (đo từ build thực)

| Metric | iOS | Android |
|---|---|---|
| Module Swift/Kotlin LoC | 3058 | 2489 |
| APK/IPA size (Debug) | ~85 MB | 125 MB |
| Module-only size delta | ~250 KB (ipa) | ~400 KB (aar) |
| Build time (incremental) | ~25s | ~16s |
| Build time (clean) | ~3 min | ~1.5 min |

## License + Production checklist còn thiếu

- [ ] Xóa hardcoded test credentials trong `example/App.tsx` ([line 116-117](example/App.tsx))
- [ ] Release config — tránh đẩy log spam ở prod
- [ ] Code sign iOS — hiện build với `CODE_SIGNING_ALLOWED=NO`
- [ ] ProGuard/R8 rules cho Android release build (cần keep `ImouNativeModule`, `ImouVideoViewManager`, MediaCodec class names)
- [ ] App Store privacy manifest cho NSAppTransportSecurity exception
- [ ] Network security config Android — restrict cleartext to relay hosts only
