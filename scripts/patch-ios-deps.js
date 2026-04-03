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

patchFile("node_modules/expo-image/ios/ExpoImage.podspec", [
  replaceOnce(
    "  s.dependency 'SDWebImageWebPCoder', '~> 0.14.6'\n",
    "",
    "ExpoImage WebP pod dependency"
  ),
]);

patchFile("node_modules/expo-image/ios/Coders/WebPCoder.swift", [
  replaceOnce(
    "internal import SDWebImage\ninternal import SDWebImageWebPCoder\n",
    `internal import SDWebImage

internal let imageCoderOptionUseAppleWebpCodec = SDImageCoderOption(rawValue: "useAppleWebpCodec")

/**
 Uses Apple's built-in animated WebP coder only.
 The libwebp-backed SDWebImageWebPCoder conflicts with Skia's vendored libwebp
 when this app links both expo-image and react-native-skia statically.
 */
`,
    "ExpoImage WebPCoder imports"
  ),
  replaceOnce(
    "internal let imageCoderOptionUseAppleWebpCodec = SDImageCoderOption(rawValue: \"useAppleWebpCodec\")\n",
    "",
    "ExpoImage WebPCoder option declaration"
  ),
  replaceOnce(
    "  private var coder: SDAnimatedImageCoder {\n" +
      "    if let instantiatedCoder {\n" +
      "      return instantiatedCoder\n" +
      "    }\n" +
      "    return SDImageAWebPCoder.shared\n" +
      "  }\n",
    "  private var coder: SDAnimatedImageCoder {\n" +
      "    if let instantiatedCoder {\n" +
      "      return instantiatedCoder\n" +
      "    }\n" +
      "    return SDImageAWebPCoder.shared\n" +
      "  }\n",
    "ExpoImage WebPCoder default coder"
  ),
  replaceOnce(
    "    self.instantiatedCoder = {\n" +
      "      if options?[imageCoderOptionUseAppleWebpCodec] as? Bool ?? false {\n" +
      "        return SDImageAWebPCoder(animatedImageData: data, options: options)\n" +
      "      }\n" +
      "      return SDImageWebPCoder(animatedImageData: data, options: options)\n" +
      "    }()\n",
    "    self.instantiatedCoder = SDImageAWebPCoder.init(animatedImageData: data, options: options)\n",
    "ExpoImage WebPCoder instantiated coder"
  ),
]);

patchFile("node_modules/expo-image-manipulator/ios/ExpoImageManipulator.podspec", [
  replaceOnce(
    "  s.dependency 'ExpoModulesCore'\n",
    "  s.dependency 'ExpoModulesCore'\n  s.dependency 'SDWebImage', '~> 5.21.0'\n",
    "ExpoImageManipulator SDWebImage dependency"
  ),
]);

patchFile("node_modules/expo-image-manipulator/ios/ImageManipulatorModule.swift", [
  replaceOnce(
    "import ExpoModulesCore\ninternal import SDWebImageWebPCoder\n",
    "import ExpoModulesCore\n",
    "ExpoImageManipulator WebPCoder import"
  ),
]);

patchFile("node_modules/expo-image-manipulator/ios/ImageManipulatorUtils.swift", [
  replaceOnce(
    "internal import SDWebImageWebPCoder\n",
    "internal import SDWebImage\n",
    "ExpoImageManipulator utils import"
  ),
  replaceOnce(
    "    return SDImageWebPCoder.shared.encodedData(with: image, format: .webP, options: [.encodeCompressionQuality: compression])\n",
    "    return SDImageAWebPCoder.shared.encodedData(with: image, format: .webP, options: [.encodeCompressionQuality: compression])\n",
    "ExpoImageManipulator WebP encoder"
  ),
]);
