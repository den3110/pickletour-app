const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");

function patchFile(relativePath, transforms) {
  const absolutePath = path.join(projectRoot, relativePath);

  if (!fs.existsSync(absolutePath)) {
    console.log(`[patch-ios-deps] Skip missing file: ${relativePath}`);
    return;
  }

  const original = fs.readFileSync(absolutePath, "utf8");
  let next = original;

  for (const transform of transforms) {
    next = transform(next, relativePath);
  }

  if (next !== original) {
    fs.writeFileSync(absolutePath, next);
    console.log(`[patch-ios-deps] Patched ${relativePath}`);
    return;
  }

  console.log(`[patch-ios-deps] Already patched ${relativePath}`);
}

function replaceOnce(searchValue, replaceValue, label) {
  return (contents, relativePath) => {
    if (contents.includes(replaceValue)) {
      return contents;
    }

    if (!contents.includes(searchValue)) {
      throw new Error(`[patch-ios-deps] Could not find ${label} in ${relativePath}`);
    }

    return contents.replace(searchValue, replaceValue);
  };
}

function ensurePatchedOrThrow(contents, next, relativePath, label, legacyTokens) {
  if (next !== contents) {
    return next;
  }

  if (legacyTokens.some((token) => contents.includes(token))) {
    throw new Error(`[patch-ios-deps] Could not find ${label} in ${relativePath}`);
  }

  return contents;
}

patchFile("node_modules/expo-image/ios/ExpoImage.podspec", [
  replaceOnce(
    "  s.dependency 'SDWebImageWebPCoder', '~> 0.14.6'\n",
    "",
    "ExpoImage WebP pod dependency"
  ),
]);

patchFile("node_modules/expo-image/ios/Coders/WebPCoder.swift", [
  (contents, relativePath) => {
    let next = contents;

    next = next.replace(
      "internal import SDWebImage\ninternal import SDWebImageWebPCoder\n",
      `internal import SDWebImage

internal let imageCoderOptionUseAppleWebpCodec = SDImageCoderOption(rawValue: "useAppleWebpCodec")

/**
 Uses Apple's built-in animated WebP coder only.
 The libwebp-backed SDWebImageWebPCoder conflicts with Skia's vendored libwebp
 when this app links both expo-image and react-native-skia statically.
 */
`
    );

    if (!next.includes('internal let imageCoderOptionUseAppleWebpCodec = SDImageCoderOption(rawValue: "useAppleWebpCodec")')) {
      next = next.replace(
        "internal import SDWebImage\n\n",
        `internal import SDWebImage

internal let imageCoderOptionUseAppleWebpCodec = SDImageCoderOption(rawValue: "useAppleWebpCodec")

`
      );
    }

    next = next.replace(
      /\/\*\*\n A composite WebP coder[\s\S]*?\*\/\n/s,
      `/**
 Uses Apple's built-in animated WebP coder only.
 The libwebp-backed SDWebImageWebPCoder conflicts with Skia's vendored libwebp
 when this app links both expo-image and react-native-skia statically.
 */
`
    );

    next = next.replace(
      `/**
 Uses Apple's built-in animated WebP coder only.
 The libwebp-backed SDWebImageWebPCoder conflicts with Skia's vendored libwebp
 when this app links both expo-image and react-native-skia statically.
 */

/**
 Uses Apple's built-in animated WebP coder only.
 The libwebp-backed SDWebImageWebPCoder conflicts with Skia's vendored libwebp
 when this app links both expo-image and react-native-skia statically.
 */
`,
      `/**
 Uses Apple's built-in animated WebP coder only.
 The libwebp-backed SDWebImageWebPCoder conflicts with Skia's vendored libwebp
 when this app links both expo-image and react-native-skia statically.
 */
`
    );

    next = next.replace("  private var useAppleWebpCodec: Bool = true\n", "");

    next = next.replace(
      "    return self.useAppleWebpCodec ? SDImageAWebPCoder.shared : SDImageWebPCoder.shared\n",
      "    return SDImageAWebPCoder.shared\n"
    );

    next = next.replace(
      "    self.useAppleWebpCodec = options?[imageCoderOptionUseAppleWebpCodec] as? Bool ?? true\n",
      ""
    );

    next = next.replace(
      "    self.instantiatedCoder = self.useAppleWebpCodec\n" +
        "      ? SDImageAWebPCoder.init(animatedImageData: data, options: options)\n" +
        "      : SDImageWebPCoder.init(animatedImageData: data, options: options)\n",
      "    self.instantiatedCoder = SDImageAWebPCoder.init(animatedImageData: data, options: options)\n"
    );

    return ensurePatchedOrThrow(
      contents,
      next,
      relativePath,
      "ExpoImage WebPCoder source",
      [
        "internal import SDWebImageWebPCoder",
        "SDImageWebPCoder.shared",
        "SDImageWebPCoder.init(animatedImageData: data, options: options)",
      ]
    );
  },
]);

patchFile("node_modules/expo-image-manipulator/ios/ExpoImageManipulator.podspec", [
  replaceOnce(
    "  s.dependency 'ExpoModulesCore'\n",
    "  s.dependency 'ExpoModulesCore'\n  s.dependency 'SDWebImage', '~> 5.21.0'\n",
    "ExpoImageManipulator SDWebImage dependency"
  ),
]);

patchFile("node_modules/expo-image-manipulator/ios/ImageManipulatorModule.swift", [
  (contents, relativePath) => {
    const next = contents.replace(
      "import ExpoModulesCore\ninternal import SDWebImageWebPCoder\n",
      "import ExpoModulesCore\n"
    );

    return ensurePatchedOrThrow(
      contents,
      next,
      relativePath,
      "ExpoImageManipulator WebPCoder import",
      ["internal import SDWebImageWebPCoder"]
    );
  },
]);

patchFile("node_modules/expo-image-manipulator/ios/ImageManipulatorUtils.swift", [
  (contents, relativePath) => {
    let next = contents.replace(
      "internal import SDWebImageWebPCoder\n",
      "internal import SDWebImage\n"
    );

    next = next.replace(
      "    return SDImageWebPCoder.shared.encodedData(with: image, format: .webP, options: [.encodeCompressionQuality: compression])\n",
      "    return SDImageAWebPCoder.shared.encodedData(with: image, format: .webP, options: [.encodeCompressionQuality: compression])\n"
    );

    return ensurePatchedOrThrow(
      contents,
      next,
      relativePath,
      "ExpoImageManipulator WebP source",
      [
        "internal import SDWebImageWebPCoder",
        "SDImageWebPCoder.shared.encodedData",
      ]
    );
  },
]);

patchFile("node_modules/expo-camera/ios/Current/CameraSessionManager.swift", [
  (contents, relativePath) => {
    let next = contents;

    next = next.replace(
      "    if delegate.mode == .video {\n" +
        "      if self.videoFileOutput == nil {\n",
      "    if delegate.mode == .video {\n" +
        "      self.removePhotoOutput(withSessionConfiguration: false)\n" +
        "      if self.videoFileOutput == nil {\n"
    );

    next = next.replace(
      "    } else {\n" +
        "      self.cleanupMovieFileCapture(withSessionConfiguration: false)\n" +
        "      self.updateSessionPreset(preset: delegate.pictureSize.toCapturePreset(), withSessionConfiguration: false)\n" +
        "    }\n",
      "    } else {\n" +
        "      self.cleanupMovieFileCapture(withSessionConfiguration: false)\n" +
        "      self.setupPhotoOutput(withSessionConfiguration: false)\n" +
        "      self.updateSessionPreset(preset: delegate.pictureSize.toCapturePreset(), withSessionConfiguration: false)\n" +
        "    }\n"
    );

    if (!next.includes("func setupPhotoOutput(withSessionConfiguration: Bool = true) -> AVCapturePhotoOutput?")) {
      next = next.replace(
        "  func stopSession() {\n",
        `  @discardableResult
  func setupPhotoOutput(withSessionConfiguration: Bool = true) -> AVCapturePhotoOutput? {
    if let photoOutput {
      return photoOutput
    }

    let output = AVCapturePhotoOutput()
    output.isLivePhotoCaptureEnabled = false

    if withSessionConfiguration {
      session.beginConfiguration()
    }
    defer {
      if withSessionConfiguration {
        session.commitConfiguration()
      }
    }

    if session.canAddOutput(output) {
      session.addOutput(output)
      photoOutput = output
      return output
    }

    return nil
  }

  func removePhotoOutput(withSessionConfiguration: Bool = true) {
    guard let photoOutput else {
      return
    }
    if withSessionConfiguration {
      session.beginConfiguration()
    }
    defer {
      if withSessionConfiguration {
        session.commitConfiguration()
      }
    }
    if session.outputs.contains(photoOutput) {
      session.removeOutput(photoOutput)
    }
    self.photoOutput = nil
  }

  func stopSession() {
`
      );
    }

    next = next.replace(
      "    for output in session.outputs {\n" +
        "      session.removeOutput(output)\n" +
        "    }\n" +
        "    session.commitConfiguration()\n",
      "    for output in session.outputs {\n" +
        "      session.removeOutput(output)\n" +
        "    }\n" +
        "    photoOutput = nil\n" +
        "    videoFileOutput = nil\n" +
        "    session.commitConfiguration()\n"
    );

    if (!next.includes("func ensurePhotoOutput() async -> AVCapturePhotoOutput?")) {
      next = next.replace(
        "  var currentPhotoOutput: AVCapturePhotoOutput? {\n" +
          "    return photoOutput\n" +
          "  }\n\n" +
          "  var currentVideoFileOutput: AVCaptureMovieFileOutput? {\n",
        `  var currentPhotoOutput: AVCapturePhotoOutput? {
    return photoOutput
  }

  func ensurePhotoOutput() async -> AVCapturePhotoOutput? {
    if let photoOutput {
      return photoOutput
    }

    guard let delegate else {
      return nil
    }

    return await withCheckedContinuation { continuation in
      delegate.sessionQueue.async {
        continuation.resume(returning: self.setupPhotoOutput())
      }
    }
  }

  var currentVideoFileOutput: AVCaptureMovieFileOutput? {
`
      );
    }

    next = next.replace(
      "    let photoOutput = AVCapturePhotoOutput()\n" +
        "    photoOutput.isLivePhotoCaptureEnabled = false\n" +
        "    session.beginConfiguration()\n" +
        "    if session.canAddOutput(photoOutput) {\n" +
        "      session.addOutput(photoOutput)\n" +
        "      self.photoOutput = photoOutput\n" +
        "    }\n\n" +
        "    let preset = delegate.mode == .video\n",
      "    session.beginConfiguration()\n\n" +
        "    let preset = delegate.mode == .video\n"
    );

    return ensurePatchedOrThrow(
      contents,
      next,
      relativePath,
      "ExpoCamera iOS lazy photo output",
      [
        "    let photoOutput = AVCapturePhotoOutput()",
        "      self.photoOutput = photoOutput",
      ]
    );
  },
]);

patchFile("node_modules/expo-camera/ios/Current/CameraView.swift", [
  (contents, relativePath) => {
    const next = contents.replaceAll(
      "guard let photoOutput = sessionManager.currentPhotoOutput else",
      "guard let photoOutput = await sessionManager.ensurePhotoOutput() else"
    );

    return ensurePatchedOrThrow(
      contents,
      next,
      relativePath,
      "ExpoCamera iOS lazy takePicture output",
      ["sessionManager.currentPhotoOutput"]
    );
  },
]);

patchFile("node_modules/expo-camera/android/build.gradle", [
  (contents, relativePath) => {
    const next = contents.replace(
      '  add(barcodeDependencyConfiguration, "com.google.android.gms:play-services-code-scanner:16.1.0")\n',
      '  add("compileOnly", "com.google.android.gms:play-services-code-scanner:16.1.0")\n'
    );

    return ensurePatchedOrThrow(
      contents,
      next,
      relativePath,
      "ExpoCamera Google code scanner dependency",
      ['add(barcodeDependencyConfiguration, "com.google.android.gms:play-services-code-scanner:16.1.0")']
    );
  },
]);

patchFile("node_modules/expo-camera/android/src/main/java/expo/modules/camera/CameraViewModule.kt", [
  (contents, relativePath) => {
    let next = contents;

    next = next.replace(
      "import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions\n",
      ""
    );
    next = next.replace(
      "import com.google.mlkit.vision.codescanner.GmsBarcodeScanning\n",
      ""
    );

    next = next.replace(
      /    \/\/ Aligned with iOS which has the same property\. True when ML Kit is available\.\n    \/\/ False on Horizon OS \(Quest devices\) and devices without Google Play Services\.\n    Property\("isModernBarcodeScannerAvailable"\) \{\n      !VRUtilities\.isQuest\(\) && CameraUtils\.isMLKitAvailable\(appContext\.reactContext\)\n    \}\n/s,
      `    // Disabled here because Google Code Scanner launches Google Play Services
    // activities that crash on some Android devices. CameraView inline barcode
    // scanning still uses ML Kit below.
    Property("isModernBarcodeScannerAvailable") {
      false
    }
`
    );

    next = next.replace(
      /    AsyncFunction\("launchScanner"\) \{ settings: BarcodeSettings, promise: Promise ->[\s\S]*?\n    \}\n\n    AsyncFunction\("dismissScanner"\)/,
      `    AsyncFunction("launchScanner") { _: BarcodeSettings, promise: Promise ->
      promise.reject(CameraExceptions.GooglePlayServicesUnavailableException())
    }

    AsyncFunction("dismissScanner")`
    );

    return ensurePatchedOrThrow(
      contents,
      next,
      relativePath,
      "ExpoCamera Google code scanner launch",
      [
        "GmsBarcodeScannerOptions",
        "GmsBarcodeScanning",
        "scanner.startScan()",
        "!VRUtilities.isQuest() && CameraUtils.isMLKitAvailable(appContext.reactContext)",
      ]
    );
  },
]);
