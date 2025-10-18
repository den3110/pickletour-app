// hooks/useDeviceId.ts
import * as SecureStore from "expo-secure-store";
import * as Random from "expo-random";
import { useEffect, useState } from "react";

const KEY = "PT_DEVICE_ID";

async function getOrCreateDeviceId() {
  let id = await SecureStore.getItemAsync(KEY);
  if (!id) {
    const bytes = await Random.getRandomBytesAsync(16);
    id = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    await SecureStore.setItemAsync(KEY, id);
  }
  return id;
}

export function useDeviceId() {
  const [deviceId, setId] = useState<string | null>(null);
  useEffect(() => {
    getOrCreateDeviceId().then(setId);
  }, []);
  return deviceId;
}
