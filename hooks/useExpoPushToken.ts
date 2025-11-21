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

// Hiển thị banner khi app đang foreground (iOS)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ===== Keys trong SecureStore =====
// NOTE: apiSlice đang đọc "deviceId" và "pushToken"
export const LEGACY_DEVICE_ID_KEY = "PT_DEVICE_ID";
export const DEVICE_ID_KEY = "deviceId";
export const PUSH_TOKEN_KEY = "pushToken";

async function getOrCreateDeviceId() {
  // 1) Thử key chuẩn
  let id = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (id) return id;

  // 2) Tương thích ngược: nếu có key cũ thì copy sang key mới
  const legacy = await SecureStore.getItemAsync(LEGACY_DEVICE_ID_KEY);
  if (legacy) {
    await SecureStore.setItemAsync(DEVICE_ID_KEY, legacy);
    return legacy;
  }

  // 3) Tạo mới, lưu cả hai key (để code cũ vẫn chạy được)
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

  // Lấy thông tin đăng nhập hiện tại từ Redux
  const auth = useSelector((s: any) => s.auth?.userInfo);

  // RTK Query mutation để đăng ký token lên server
  const [registerPushToken] = useRegisterPushTokenMutation();

  // Gửi token lên server
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
    } catch (e) {
      if (__DEV__) console.log("registerPushToken failed", e);
    }
  };

  useEffect(() => {
    (async () => {
      if (Platform.OS === "web") return; // skip web
      if (!Device.isDevice) return;

      // Android: thiết lập channel
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "default",
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#FF231F7C",
        });
      }

      // Quyền thông báo
      const { status: existing } = await Notifications.getPermissionsAsync();
      let finalStatus = existing;
      if (existing !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== "granted") {
        // ❌ Không có quyền → xoá token khỏi SecureStore (tránh gửi header cũ)
        await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY);
        setToken(null);
        return;
      }

      // ProjectId từ EAS
      const projectId =
        (Constants?.expoConfig?.extra as any)?.eas?.projectId ??
        (Constants as any)?.easConfig?.projectId;
      if (!projectId) {
        if (__DEV__) console.warn("Missing EAS projectId for push token");
        return;
      }

      // Lấy token & lưu vào SecureStore để apiSlice gửi X-Push-Token
      const token = (await Notifications.getExpoPushTokenAsync({ projectId }))
        .data;
      setToken(token);
      console.log("token", token)
      await SecureStore.setItemAsync(PUSH_TOKEN_KEY, token);

      // Gửi ngay nếu đã đăng nhập sẵn
      await syncPushToken(token);
    })();

    const sub1 = Notifications.addNotificationReceivedListener(() => {});
    const sub2 = Notifications.addNotificationResponseReceivedListener(
      () => {}
    );
    return () => {
      sub1.remove();
      sub2.remove();
    };
    // giữ init 1 lần
  }, []);

  // Re-sync khi user đăng nhập/đăng xuất hoặc token refresh
  useEffect(() => {
    if (expoPushToken && auth?._id) {
      syncPushToken(expoPushToken);
    }
  }, [auth?._id, expoPushToken]);

  return expoPushToken;
}
