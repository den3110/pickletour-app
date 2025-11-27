// hooks/useExpoPushToken.ts
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import * as Application from "expo-application";
import { useSelector } from "react-redux";
import { useRegisterPushTokenMutation } from "@/slices/pushApiSlice";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

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

  const syncPushToken = async (token: string | null) => {
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
        console.log("✅ Push token registered:", token);
      }
    } catch (e) {
      if (__DEV__) console.log("❌ registerPushToken failed", e);
    }
  };

  useEffect(() => {
    (async () => {
      if (Platform.OS === "web") {
        console.log("⚠️ Push notifications not supported on web");
        return;
      }
      
      if (!Device.isDevice) {
        console.log("⚠️ Must use physical device for push notifications");
        return;
      }

      // ✅ Check nếu đang chạy trong Expo Go
      const isExpoGo = Constants.appOwnership === "expo";
      if (isExpoGo) {
        console.warn("⚠️ Push notifications require a development build. Run 'eas build --profile development --platform android'");
        return;
      }

      // Android: Setup notification channel
      if (Platform.OS === "android") {
        try {
          await Notifications.setNotificationChannelAsync("default", {
            name: "default",
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: "#FF231F7C",
          });
          console.log("✅ Android notification channel created");
        } catch (e) {
          console.error("❌ Failed to create notification channel:", e);
        }
      }

      // ✅ Request permissions với logs chi tiết
      console.log("📱 Checking notification permissions...");
      const { status: existing } = await Notifications.getPermissionsAsync();
      console.log("   Current permission status:", existing);
      
      let finalStatus = existing;
      
      if (existing !== "granted") {
        console.log("📱 Requesting notification permissions...");
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
        console.log("   New permission status:", finalStatus);
      }

      if (finalStatus !== "granted") {
        console.warn("❌ Notification permission denied");
        await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY);
        setToken(null);
        return;
      }

      console.log("✅ Notification permission granted");

      // Get project ID
      const projectId =
        (Constants?.expoConfig?.extra as any)?.eas?.projectId ??
        (Constants as any)?.easConfig?.projectId;
        
      if (!projectId) {
        console.error("❌ Missing EAS projectId. Run 'eas build:configure'");
        return;
      }

      console.log("📱 Getting Expo push token...");
      console.log("   Project ID:", projectId);

      try {
        const tokenData = await Notifications.getExpoPushTokenAsync({ 
          projectId 
        });
        const token = tokenData.data;
        
        console.log("✅ Got push token:", token);
        setToken(token);
        await SecureStore.setItemAsync(PUSH_TOKEN_KEY, token);
        await syncPushToken(token);
      } catch (e) {
        console.error("❌ Failed to get push token:", e);
      }
    })();

    const sub1 = Notifications.addNotificationReceivedListener((notification) => {
      console.log("📬 Notification received:", notification);
    });
    
    const sub2 = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log("👆 Notification tapped:", response);
    });
    
    return () => {
      sub1.remove();
      sub2.remove();
    };
  }, []);

  useEffect(() => {
    if (expoPushToken && auth?._id) {
      syncPushToken(expoPushToken);
    }
  }, [auth?._id, expoPushToken]);

  return expoPushToken;
}