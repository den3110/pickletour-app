// app/logout.jsx
import React, { useEffect, useRef } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { Stack, router } from "expo-router";
import { useDispatch } from "react-redux";

import { logout as logoutAction } from "@/slices/authSlice";
import { useLogoutMutation } from "@/slices/usersApiSlice";
import {
  useSyncLiveActivitiesMutation,
  useUnregisterPushTokenMutation,
} from "@/slices/pushApiSlice";
import { buildLoginHref, runMobileLogoutFlow } from "@/services/authSession";

export default function LogoutScreen() {
  const dispatch = useDispatch();
  const [logoutApi] = useLogoutMutation();
  const [unregisterDeviceToken] = useUnregisterPushTokenMutation();
  const [syncLiveActivities] = useSyncLiveActivitiesMutation();
  const once = useRef(false);

  useEffect(() => {
    const run = async () => {
      if (once.current) return;
      once.current = true;

      await runMobileLogoutFlow({
        logoutApiCall: () => logoutApi().unwrap(),
        unregisterDeviceToken: (payload) => unregisterDeviceToken(payload).unwrap(),
        syncLiveActivities: (payload) => syncLiveActivities(payload).unwrap(),
        onDebugLog: (label, error) => {
          if (__DEV__) {
            console.log(`[logout-screen] ${label}:`, error);
          }
        },
      });

      dispatch(logoutAction());
      router.replace(buildLoginHref("/"));
    };
    run();
  }, [dispatch, logoutApi, syncLiveActivities, unregisterDeviceToken]);

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
