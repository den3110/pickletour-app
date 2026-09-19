# Bundle size

## Current footprint

`imou-rn-native` chỉ dùng API hệ thống (no third-party native libs).

| Platform | Added bundle size |
|---|---|
| iOS (arm64) | **~250 KB** — Swift code stripped + system frameworks |
| Android (arm64-v8a + armv7) | **~400 KB** — Kotlin class files + OkHttp + AndroidX Security |

### Vì sao nhỏ?

So với approach truyền thống (`react-native-video` + HLS server hoặc FFmpegKit):

| Component | Truyền thống | `imou-rn-native` |
|---|---|---|
| HEVC decoder | FFmpegKit (libavcodec, ~25 MB) | **OS-level** (VideoToolbox/MediaCodec, 0 KB extra) |
| HEVC encoder transcode | FFmpegKit h264_videotoolbox (~15 MB chain) | **Bỏ — render trực tiếp HEVC, no transcode** |
| AAC decoder | FFmpegKit fdk-aac | **OS-level** (AudioToolbox/MediaCodec, 0 KB extra) |
| HLS server | nginx/Python service | **Bỏ — direct decode** |
| Network | OkHttp/URLSession (system) | URLSession (iOS) / OkHttp ~1.5 MB (Android) |

**Net savings vs FFmpegKit-based**: ~30 MB on iOS, ~40 MB on Android.

## Phụ thuộc kéo theo (npm)

Peer dependencies app project sẽ tự cài:
- `react-native-webview` (~1 MB) — chỉ dùng cho Geetest captcha modal khi login

Nếu app **không cần Geetest** (dùng pre-imported session), có thể skip
`react-native-webview` bằng cách KHÔNG mount `<ImouCaptcha />` và import từ
`imou-rn-native/src/index` thay vì entry chính.

## Verify

```bash
# iOS
xcodebuild -workspace ios/MyApp.xcworkspace -scheme MyApp \
  -configuration Release -sdk iphoneos -derivedDataPath build/
du -sh build/Build/Products/Release-iphoneos/MyApp.app/Frameworks/ImouRnNative*

# Android
./gradlew :imou-rn-native:assembleRelease
ls -lh node_modules/imou-rn-native/android/build/outputs/aar/*.aar
unzip -l *.aar | grep -E "\.(so|class|jar)$"
```

Expected output: no `.so` files from our module (all system codecs).
