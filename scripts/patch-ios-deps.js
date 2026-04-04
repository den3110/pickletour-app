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
