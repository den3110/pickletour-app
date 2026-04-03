import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

export const LEGACY_DEVICE_ID_KEY = "PT_DEVICE_ID";
export const DEVICE_ID_KEY = "deviceId";

export async function getOrCreatePushDeviceId() {
  let id = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (id) return id;

  const legacy = await SecureStore.getItemAsync(LEGACY_DEVICE_ID_KEY);
  if (legacy) {
    await SecureStore.setItemAsync(DEVICE_ID_KEY, legacy);
    return legacy;
  }

  const bytes = await Crypto.getRandomBytesAsync(16);
  id = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  await Promise.all([
    SecureStore.setItemAsync(DEVICE_ID_KEY, id),
    SecureStore.setItemAsync(LEGACY_DEVICE_ID_KEY, id),
  ]);

  return id;
}
