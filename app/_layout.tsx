import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack, useRootNavigationState } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { ActivityIndicator, View, AppState, InteractionManager } from "react-native";
import "react-native-reanimated";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import * as Notifications from "expo-notifications";

import { useColorScheme } from "@/hooks/useColorScheme";
import { setCredentials } from "@/slices/authSlice";
import store from "@/store";
import { loadUserInfo } from "@/utils/authStorage";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Provider } from "react-redux";
import { SocketProvider } from "../context/SocketContext";
import { useExpoPushToken } from "@/hooks/useExpoPushToken";
import ForceUpdateModal from "@/components/ForceUpdateModal";
import Toast from "react-native-toast-message";

const SPLASH_FAILSAFE_MS = 1500;

SplashScreen.preventAutoHideAsync().catch(() => {}); // chỉ 1 lần

if (__DEV__) {
  require("./dev/reactotron");
  require("./dev/ws-logger");
}

function Boot({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = React.useState(false);
  useExpoPushToken();

  React.useEffect(() => {
    (async () => {
      try {
        const cached = await loadUserInfo();
        if (cached) store.dispatch(setCredentials(cached));
      } finally {
        setReady(true);
      }
    })();
  }, []);

  // Trong lúc boot vẫn render view riêng, KHÔNG ảnh hưởng onLayout của root
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }
  return <>{children}</>;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const bg = isDark ? "#000" : "#fff"; // nền phù hợp hệ thống

  const [fontsLoaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });
  const [fontTimeout, setFontTimeout] = React.useState(false);
  React.useEffect(() => {
    const t = setTimeout(() => setFontTimeout(true), SPLASH_FAILSAFE_MS);
    return () => clearTimeout(t);
  }, []);
  const fontsReady = fontsLoaded || fontTimeout;

  // ✅ KHÔNG phụ thuộc navReady nữa để hide splash
  const hiddenRef = React.useRef(false);
  const [firstFrameDone, setFirstFrameDone] = React.useState(false);

  const hideSplashSafe = React.useCallback(() => {
    if (hiddenRef.current) return;
    hiddenRef.current = true;
    SplashScreen.hideAsync().catch(() => {});
    setTimeout(() => SplashScreen.hideAsync().catch(() => {}), 400);
  }, []);

  // gọi khi view root layout xong frame đầu (onLayout là đủ)
  const onLayoutRoot = React.useCallback(() => {
    if (!firstFrameDone) setFirstFrameDone(true);
  }, []);

  // ✅ Ẩn splash: chỉ cần frame đầu + font sẵn sàng (fail-open)
  React.useEffect(() => {
    if (firstFrameDone && fontsReady) hideSplashSafe();
  }, [firstFrameDone, fontsReady, hideSplashSafe]);

  // iOS: khi active lại mà chưa hide (hiếm), ép hide
  React.useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active" && !hiddenRef.current) hideSplashSafe();
    });
    return () => sub.remove();
  }, [hideSplashSafe]);

  /* -------------------- Notification routing -------------------- */
  const pendingUrlRef = React.useRef<string | null>(null);
  const lastHandledIdRef = React.useRef<string | null>(null);

  // helper: rút URL từ payload
  const extractUrl = (n?: Notifications.Notification | null) => {
    const data: any = n?.request?.content?.data ?? {};
    return data?.url ?? (data?.matchId ? `/match/${data.matchId}/home` : null);
  };

  // chỉ điều hướng khi splash đã hide và nav đã render
  const navigateIfReady = React.useCallback(() => {
    if (!hiddenRef.current) return; // đợi hide xong
    const url = pendingUrlRef.current;
    if (!url) return;
    const { router } = require("expo-router");
    InteractionManager.runAfterInteractions(() => {
      router.replace(url); // replace để tránh stack kỳ lạ lúc cold-start
      pendingUrlRef.current = null;
    });
  }, []);

  // Đăng ký listener NGAY khi mount (không chờ navReady)
  React.useEffect(() => {
    let sub: Notifications.Subscription | null = null;

    (async () => {
      const resp = await Notifications.getLastNotificationResponseAsync();
      const n = resp?.notification;
      const id = n?.request?.identifier ?? "";
      if (id && id !== lastHandledIdRef.current) {
        lastHandledIdRef.current = id;
        pendingUrlRef.current = extractUrl(n);
        navigateIfReady(); // thử điều hướng nếu đã hide
      }
    })();

    sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      const n = resp?.notification;
      const id = n?.request?.identifier ?? "";
      if (id && id === lastHandledIdRef.current) return;
      lastHandledIdRef.current = id || String(Date.now());
      pendingUrlRef.current = extractUrl(n);
      navigateIfReady();
    });

    return () => {
      if (sub) sub.remove();
    };
  }, [navigateIfReady]);

  // khi vừa hide xong → điều hướng nếu có pending url
  React.useEffect(() => {
    if (hiddenRef.current) navigateIfReady();
  }, [firstFrameDone, fontsReady, navigateIfReady]);

  return (
    <Provider store={store}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <BottomSheetModalProvider>
          <SocketProvider>
            <Boot>
              <SafeAreaProvider>
                <SafeAreaView
                  style={{ flex: 1 }}
                  edges={["top", "left", "right"]}
                >
                  <View style={{ flex: 1 }} onLayout={onLayoutRoot}>
                    <ThemeProvider
                      value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
                    >
                      <Stack>
                        <Stack.Screen
                          name="(tabs)"
                          options={{ headerShown: false }}
                        />
                        <Stack.Screen
                          name="login"
                          options={{ headerShown: false }}
                        />
                        <Stack.Screen
                          name="register"
                          options={{
                            title: "Đăng ký",
                            headerTitleAlign: "center",
                            headerTintColor: "#1976d2",
                            headerBackVisible: true,
                            headerBackTitle: "Quay lại",
                            headerBackTitleVisible: true,
                            headerTitleStyle: {
                              color: "#000",
                              fontWeight: "700",
                            },
                          }}
                        />
                        <Stack.Screen
                          name="forgot-password"
                          options={{
                            title: "Quên mật khẩu",
                            headerTitleAlign: "center",
                            headerTintColor: "#1976d2",
                            headerBackVisible: true,
                            headerBackTitle: "Quay lại",
                            headerBackTitleVisible: true,
                            headerTitleStyle: {
                              color: "#000",
                              fontWeight: "700",
                            },
                          }}
                        />
                        <Stack.Screen
                          name="levelpoint"
                          options={{
                            title: "Tự chấm trình",
                            headerTitleAlign: "center",
                            headerTintColor: "#1976d2",
                            headerBackVisible: true,
                            headerBackTitle: "Quay lại",
                            headerBackTitleVisible: true,
                            headerTitleStyle: {
                              color: "#000",
                              fontWeight: "700",
                            },
                          }}
                        />
                        <Stack.Screen
                          name="tournament/[id]/register"
                          options={{
                            title: "Đăng ký giải đấu",
                            headerTitleAlign: "center",
                            headerBackTitle: "Quay lại",
                            headerTintColor: "#1976d2",
                            headerTitleStyle: {
                              color: "#000",
                              fontWeight: "700",
                            },
                          }}
                        />
                        <Stack.Screen
                          name="tournament/[id]/checkin"
                          options={{
                            title: "Check-in giải đấu",
                            headerTitleAlign: "center",
                            headerBackTitle: "Quay lại",
                            headerTintColor: "#1976d2",
                            headerTitleStyle: {
                              color: "#000",
                              fontWeight: "700",
                            },
                          }}
                        />
                        <Stack.Screen
                          name="tournament/[id]/draw"
                          options={{
                            title: "Bốc thăm giải đấu",
                            headerTitleAlign: "center",
                            headerBackTitle: "Quay lại",
                            headerTintColor: "#1976d2",
                            headerTitleStyle: {
                              color: "#000",
                              fontWeight: "700",
                            },
                          }}
                        />
                        <Stack.Screen
                          name="tournament/[id]/bracket"
                          options={{
                            title: "Sơ đồ giải đấu",
                            headerTitleAlign: "center",
                            headerBackTitle: "Quay lại",
                            headerTintColor: "#1976d2",
                            headerTitleStyle: {
                              color: "#000",
                              fontWeight: "700",
                            },
                          }}
                        />
                        <Stack.Screen
                          name="tournament/[id]/home"
                          options={{
                            title: "Tổng quan giải đấu",
                            headerTitleAlign: "center",
                            headerBackTitle: "Quay lại",
                            headerTintColor: "#1976d2",
                            headerTitleStyle: {
                              color: "#000",
                              fontWeight: "700",
                            },
                          }}
                        />
                        <Stack.Screen
                          name="tournament/[id]/manage"
                          options={{
                            headerTitleAlign: "center",
                            headerBackTitle: "Quay lại",
                            headerTintColor: "#1976d2",
                            headerTitleStyle: {
                              color: "#000",
                              fontWeight: "700",
                            },
                          }}
                        />
                        <Stack.Screen
                          name="tournament/[id]/schedule"
                          options={{
                            headerTitleAlign: "center",
                            headerBackTitle: "Quay lại",
                            headerTintColor: "#1976d2",
                            headerTitleStyle: {
                              color: "#000",
                              fontWeight: "700",
                            },
                          }}
                        />
                        <Stack.Screen
                          name="tournament/[id]/referee"
                          options={{
                            headerTitleAlign: "center",
                            headerBackTitle: "Quay lại",
                            headerTintColor: "#1976d2",
                            headerTitleStyle: {
                              color: "#000",
                              fontWeight: "700",
                            },
                          }}
                        />
                        <Stack.Screen
                          name="match/[id]/referee"
                          options={{ headerShown: false }}
                        />
                        <Stack.Screen
                          name="contact"
                          options={{
                            headerTitleAlign: "center",
                            headerBackTitle: "Quay lại",
                            headerTintColor: "#1976d2",
                            headerTitleStyle: {
                              color: "#000",
                              fontWeight: "700",
                            },
                          }}
                        />
                        <Stack.Screen
                          name="404"
                          options={{
                            headerTitleAlign: "center",
                            headerBackTitle: "Quay lại",
                            headerTintColor: "#1976d2",
                            headerTitleStyle: {
                              color: "#000",
                              fontWeight: "700",
                            },
                          }}
                        />
                        <Stack.Screen name="+not-found" />
                        <Stack.Screen
                          name="403"
                          options={{
                            headerTitleAlign: "center",
                            headerBackTitle: "Quay lại",
                            headerTintColor: "#1976d2",
                            headerTitleStyle: {
                              color: "#000",
                              fontWeight: "700",
                            },
                          }}
                        />
                      </Stack>
                      <StatusBar
                        style={isDark ? "dark" : "light"}
                        backgroundColor={bg}
                      />
                    </ThemeProvider>
                  </View>
                </SafeAreaView>
              </SafeAreaProvider>
            </Boot>
          </SocketProvider>
        </BottomSheetModalProvider>
        <ForceUpdateModal />
        <Toast />
      </GestureHandlerRootView>
    </Provider>
  );
}
