import * as ImageManipulator from "expo-image-manipulator";

export type PickedUploadImage = {
  uri: string;
  name?: string;
  mime?: string;
  size?: number;
};

const { SaveFormat } = ImageManipulator;

function imageNameForUpload(img: PickedUploadImage, fallbackPrefix: string) {
  const fallback = `${fallbackPrefix}_${Date.now()}`;
  const rawName =
    img.name || img.uri.split(/[\\/]/).pop() || `${fallback}.jpg`;
  const withoutExt = rawName.replace(/\.[^/.]+$/, "") || fallback;
  return `${withoutExt}.jpg`;
}

export async function prepareSupportImageForUpload(
  img: PickedUploadImage,
  fallbackPrefix = "support",
) {
  const converted = await ImageManipulator.manipulateAsync(img.uri, [], {
    compress: 0.88,
    format: SaveFormat.JPEG,
  });

  return {
    uri: converted.uri,
    name: imageNameForUpload(img, fallbackPrefix),
    type: "image/jpeg",
    size: img.size || 0,
  };
}
