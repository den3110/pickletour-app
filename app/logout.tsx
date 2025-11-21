// app/logout.jsx
import React, { useEffect, useRef } from "react";
import { View, Text, ActivityIndicator, Platform } from "react-native";
import { Stack, router } from "expo-router";
import { useDispatch } from "react-redux";
import * as SecureStore from "expo-secure-store";

import { logout as logoutAction } from "@/slices/authSlice";
import apiSlice from "@/slices/apiSlice";
import { useLogoutMutation } from "@/slices/usersApiSlice";
import { useUnregisterPushTokenMutation } from "@/slices/pushApiSlice";
import { DEVICE_ID_KEY } from "@/hooks/useExpoPushToken";

export default function LogoutScreen() {
  const dispatch = useDispatch();
  const [logoutApi] = useLogoutMutation();
  const [unregisterDeviceToken] = useUnregisterPushTokenMutation();
  const once = useRef(false);

  useEffect(() => {
    const run = async () => {
      if (once.current) return;
      once.current = true;
      try {
        // 1) Gỡ push token nếu có
        try {
          const deviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
          if (deviceId) {
            await unregisterDeviceToken({ deviceId }).unwrap();
          }
        } catch (e) {
          if (__DEV__) console.log("unregister push token failed:", e);
        }

        // 2) Gọi API logout (không chặn luồng nếu fail)
        try {
          await logoutApi().unwrap();
        } catch (e) {
          if (__DEV__) console.log("logout api failed:", e);
        }
      } finally {
        // 3) Reset local state rồi chuyển sang /login
        // dispatch(apiSlice.util.resetApiState());
        dispatch(logoutAction());

        // Chút delay nhỏ để tránh đua điều hướng
        setTimeout(
          () => {
            router.replace("/login");
          },
          Platform.OS === "android" ? 300 : 150
        );
      }
    };
    run();
  }, [dispatch, logoutApi, unregisterDeviceToken]);

  return (
    <>
      <Stack.Screen
        options={{
          title: "Đăng xuất",
          headerTitleAlign: "center",
          gestureEnabled: false,
          headerShown: false,
        }}
      />
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <ActivityIndicator />
        <Text style={{ marginTop: 12, fontWeight: "700" }}>
          Đang đăng xuất…
        </Text>
        <Text style={{ marginTop: 6, opacity: 0.7, textAlign: "center" }}>
          Vui lòng đợi trong giây lát.
        </Text>
      </View>
    </>
  );
}
