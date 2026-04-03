// hooks/useExpoPushToken.ts
import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import * as Application from "expo-application";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";
import { useSelector } from "react-redux";

import {
  loadExpoNotifications,
  notificationsRequireNativeBuild,
} from "@/lib/expoNotifications";
import { useRegisterPushTokenMutation } from "@/slices/pushApiSlice";

export const LEGACY_DEVICE_ID_KEY = "PT_DEVICE_ID";
export const DEVICE_ID_KEY = "deviceId";
export const PUSH_TOKEN_KEY = "pushToken";

async function getOrCreateDeviceId() {
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

export function useExpoPushToken() {
  const [expoPushToken, setToken] = useState<string | null>(null);
  const auth = useSelector((s: any) => s.auth?.userInfo);
  const [registerPushToken] = useRegisterPushTokenMutation();

  const syncPushToken = useCallback(
    async (token: string | null) => {
      if (!token) return;
      if (!auth?._id) return;

      try {
        const deviceId = await getOrCreateDeviceId();
        const appVersion = `${Application.nativeApplicationVersion ?? "0"}.${
          Application.nativeBuildVersion ?? "0"
        }`;
        const platform = Platform.OS === "ios" ? "ios" : "android";

        await registerPushToken({
          token,
          platform,
          deviceId,
          appVersion,
        }).unwrap();

        if (__DEV__) {
          console.log("Push token registered:", token);
        }
      } catch (error) {
        if (__DEV__) {
          console.log("registerPushToken failed", error);
        }
      }
    },
    [auth?._id, registerPushToken]
  );

  useEffect(() => {
    let cancelled = false;
    let receivedSub: { remove: () => void } | null = null;
    let responseSub: { remove: () => void } | null = null;

    void (async () => {
      if (Platform.OS === "web") {
        console.log("Push notifications are not supported on web.");
        return;
      }

      if (!Device.isDevice) {
        console.log("Push notifications require a physical device.");
        return;
      }

      if (notificationsRequireNativeBuild) {
        console.warn(
          "Push notifications require a development build. Expo Go does not support this flow."
        );
        return;
      }

      const Notifications = await loadExpoNotifications();
      if (!Notifications || cancelled) {
        return;
      }

      receivedSub = Notifications.addNotificationReceivedListener(
        (notification) => {
          console.log("Notification received:", notification);
        }
      );

      responseSub = Notifications.addNotificationResponseReceivedListener(
        (response) => {
          console.log("Notification tapped:", response);
        }
      );

      if (Platform.OS === "android") {
        try {
          await Notifications.setNotificationChannelAsync("default", {
            name: "default",
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: "#FF231F7C",
          });
          console.log("Android notification channel created");
        } catch (error) {
          console.error("Failed to create notification channel:", error);
        }
      }

      console.log("Checking notification permissions...");
      const { status: existing } = await Notifications.getPermissionsAsync();
      console.log("Current permission status:", existing);

      let finalStatus = existing;
      if (existing !== "granted") {
        console.log("Requesting notification permissions...");
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
        console.log("New permission status:", finalStatus);
      }

      if (cancelled) {
        return;
      }

      if (finalStatus !== "granted") {
        console.warn("Notification permission denied");
        await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY);
        setToken(null);
        return;
      }

      const projectId =
        (Constants?.expoConfig?.extra as any)?.eas?.projectId ??
        (Constants as any)?.easConfig?.projectId;

      if (!projectId) {
        console.error("Missing EAS projectId. Run 'eas build:configure'.");
        return;
      }

      console.log("Getting Expo push token for project:", projectId);

      try {
        const tokenData = await Notifications.getExpoPushTokenAsync({
          projectId,
        });
        const deviceTokenData = await Notifications.getDevicePushTokenAsync();

        if (cancelled) {
          return;
        }

        const token = tokenData.data;
        console.log("Got Expo push token:", token);
        console.log("Got device push token:", deviceTokenData.data);
        setToken(token);
        await SecureStore.setItemAsync(PUSH_TOKEN_KEY, token);
        await syncPushToken(token);
      } catch (error) {
        console.error("Failed to get push token:", error);
      }
    })();

    return () => {
      cancelled = true;
      receivedSub?.remove();
      responseSub?.remove();
    };
  }, [syncPushToken]);

  useEffect(() => {
    if (expoPushToken && auth?._id) {
      syncPushToken(expoPushToken);
    }
  }, [auth?._id, expoPushToken, syncPushToken]);

  return expoPushToken;
}
