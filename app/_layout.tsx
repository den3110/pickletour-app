

import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import {
  ActivityIndicator,
  View,
  AppState,
  InteractionManager,
  DeviceEventEmitter,
  Platform,
} from "react-native";
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
import * as SecureStore from "expo-secure-store";
// app/_layout.tsx
if (__DEV__) {
  require("../dev/reactotron");
  require("../dev/ws-logger");
}
const SPLASH_FONT_FAILSAFE_MS = 1500;
const SPLASH_GLOBAL_FAILSAFE_MS = 5000;
const PREF_THEME_KEY = "PREF_THEME"; // "system" | "light" | "dark"

// 🔒 Guard: tránh gọi preventAutoHideAsync nhiều lần khi HMR/Fast Refresh
declare global {
  // eslint-disable-next-line no-var
  var __SPLASH_LOCKED__: boolean;
}
if (!global.__SPLASH_LOCKED__) {
  global.__SPLASH_LOCKED__ = true;
  SplashScreen.preventAutoHideAsync().catch(() => {});
}

/* ===================== THEME ONLY ===================== */
const BRAND_LIGHT = "#1976d2";
const BRAND_DARK = "#7cc0ff";

const AppLightTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: BRAND_LIGHT,
    background: "#ffffff",
    card: "#ffffff",
    text: "#0f172a",
    border: "#e5e7eb",
    notification: BRAND_LIGHT,
  },
};

const AppDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: BRAND_DARK,
    background: "#0b0c10",
    card: "#111214",
    text: "#e5e7eb",
    border: "#2f3339",
    notification: BRAND_DARK,
  },
};
/* ===================================================== */

function Boot({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = React.useState(false);
  useExpoPushToken();

  React.useEffect(() => {
    let done = false;
    const guard = setTimeout(() => {
      if (!done) setReady(true);
    }, 2000);

    (async () => {
      try {
        const cached = await loadUserInfo();
        if (cached) store.dispatch(setCredentials(cached));
      } finally {
        done = true;
        clearTimeout(guard);
        setReady(true);
      }
    })();

    return () => clearTimeout(guard);
  }, []);

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
  // 1) Scheme hệ thống
  const systemScheme = useColorScheme(); // "light" | "dark"
  // 2) Pref đọc từ SecureStore
  const [prefTheme, setPrefTheme] = React.useState<"system" | "light" | "dark">(
    "system"
  );

  // 🔄 Overlay khi đổi theme
  const [themeApplying, setThemeApplying] = React.useState(false);
  const themeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  // Đọc PREF_THEME lúc boot + khi app active
  const loadPrefTheme = React.useCallback(async () => {
    try {
      const t = (await SecureStore.getItemAsync(PREF_THEME_KEY)) as
        | "system"
        | "light"
        | "dark"
        | null;
      setPrefTheme(t || "system");
    } catch {}
  }, []);
  React.useEffect(() => {
    loadPrefTheme();
  }, [loadPrefTheme]);

  React.useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") loadPrefTheme();
    });
    return () => sub.remove();
  }, [loadPrefTheme]);

  // Lắng nghe đổi theme runtime
  React.useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      "theme:changed",
      async (mode: "system" | "light" | "dark") => {
        setThemeApplying(true);
        setPrefTheme(mode);
        try {
          await SecureStore.setItemAsync(PREF_THEME_KEY, mode);
        } catch {}
      }
    );
    return () => sub.remove();
  }, []);

  // 3) Resolve theme
  const resolvedScheme =
    prefTheme === "system" ? systemScheme : (prefTheme as "light" | "dark");
  const isDark = resolvedScheme === "dark";

  const navTheme = React.useMemo(
    () => (isDark ? AppDarkTheme : AppLightTheme),
    [isDark]
  );
  const bg = navTheme.colors.background;

  // Tắt overlay sau khi theme áp dụng
  React.useEffect(() => {
    if (!themeApplying) return;
    if (themeTimerRef.current) {
      clearTimeout(themeTimerRef.current);
      themeTimerRef.current = null;
    }
    const raf = requestAnimationFrame(() => {
      themeTimerRef.current = setTimeout(() => {
        setThemeApplying(false);
        DeviceEventEmitter.emit("theme:applied");
        themeTimerRef.current = null;
      }, 200);
    });
    return () => {
      cancelAnimationFrame(raf);
      if (themeTimerRef.current) {
        clearTimeout(themeTimerRef.current);
        themeTimerRef.current = null;
      }
    };
  }, [navTheme, themeApplying]);

  // Fonts + failsafe
  const [fontsLoaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });
  const [fontTimeout, setFontTimeout] = React.useState(false);
  React.useEffect(() => {
    const t = setTimeout(() => setFontTimeout(true), SPLASH_FONT_FAILSAFE_MS);
    return () => clearTimeout(t);
  }, []);
  const fontsReady = fontsLoaded || fontTimeout;

  // Splash hide control
  const hiddenRef = React.useRef(false);
  const [firstFrameDone, setFirstFrameDone] = React.useState(false);

  const hideSplashSafe = React.useCallback(() => {
    if (hiddenRef.current) return;
    (async () => {
      try {
        await SplashScreen.hideAsync();
      } catch {
      } finally {
        hiddenRef.current = true; // chỉ chốt sau khi gọi hide
        // double-tap an toàn
        setTimeout(() => SplashScreen.hideAsync().catch(() => {}), 300);
      }
    })();
  }, []);

  const onLayoutRoot = React.useCallback(() => {
    if (!firstFrameDone) setFirstFrameDone(true);
  }, [firstFrameDone]);

  React.useEffect(() => {
    if (firstFrameDone && fontsReady) hideSplashSafe();
  }, [firstFrameDone, fontsReady, hideSplashSafe]);

  // Failsafe hide toàn cục
  React.useEffect(() => {
    const t = setTimeout(() => {
      if (!hiddenRef.current) hideSplashSafe();
    }, SPLASH_GLOBAL_FAILSAFE_MS);
    return () => clearTimeout(t);
  }, [hideSplashSafe]);

  // Ensure hide khi app trở lại foreground
  React.useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active" && !hiddenRef.current) hideSplashSafe();
    });
    return () => sub.remove();
  }, [hideSplashSafe]);

  /* -------------------- Notification routing -------------------- */
  const pendingUrlRef = React.useRef<string | null>(null);
  const lastHandledIdRef = React.useRef<string | null>(null);

  const extractUrl = (n?: Notifications.Notification | null) => {
    const data: any = n?.request?.content?.data ?? {};
    return data?.url ?? (data?.matchId ? `/match/${data.matchId}/home` : null);
  };

  const navigateIfReady = React.useCallback(() => {
    if (!hiddenRef.current) return;
    const url = pendingUrlRef.current;
    if (!url) return;
    const { router } = require("expo-router");
    InteractionManager.runAfterInteractions(() => {
      router.replace(url);
      pendingUrlRef.current = null;
    });
  }, []);

  React.useEffect(() => {
    let sub: Notifications.Subscription | null = null;

    (async () => {
      const resp = await Notifications.getLastNotificationResponseAsync();
      const n = resp?.notification;
      const id = n?.request?.identifier ?? "";
      if (id && id !== lastHandledIdRef.current) {
        lastHandledIdRef.current = id;
        pendingUrlRef.current = extractUrl(n);
        navigateIfReady();
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
                  style={{ flex: 1, backgroundColor: bg }}
                  edges={[
                    // "left",
                    // "right",
                    Platform.OS === "android" ? "top" : "",
                    Platform.OS === "android" ? "bottom" : "",
                  ]}
                >
                  {/* ⚠️ onLayout cần collapsable={false} để chắc chắn fire trên Android */}
                  <View
                    style={{ flex: 1 }}
                    onLayout={onLayoutRoot}
                    collapsable={false}
                  >
                    <ThemeProvider value={navTheme}>
                      <Stack
                        screenOptions={{
                          headerStyle: {
                            backgroundColor: navTheme.colors.card,
                          },
                          headerTintColor: navTheme.colors.text,
                          contentStyle: {
                            backgroundColor: bg,
                          },
                        }}
                      >
                        <Stack.Screen
                          name="(tabs)"
                          options={{ headerShown: false }}
                        />
                        <Stack.Screen
                          name="register"
                          options={{
                            title: "Đăng ký",
                            headerTitleAlign: "center",
                            headerTintColor: navTheme.colors.primary,
                            headerBackVisible: true,
                            headerBackTitle: "Quay lại",
                            headerBackTitleVisible: true,
                            headerTitleStyle: {
                              color: navTheme.colors.text,
                              fontWeight: "700",
                            },
                          }}
                        />
                        <Stack.Screen
                          name="forgot-password"
                          options={{
                            title: "Quên mật khẩu",
                            headerTitleAlign: "center",
                            headerTintColor: navTheme.colors.primary,
                            headerBackVisible: true,
                            headerBackTitle: "Quay lại",
                            headerBackTitleVisible: true,
                            headerTitleStyle: {
                              color: navTheme.colors.text,
                              fontWeight: "700",
                            },
                          }}
                        />
                        <Stack.Screen
                          name="levelpoint"
                          options={{
                            title: "Tự chấm trình",
                            headerTitleAlign: "center",
                            headerTintColor: navTheme.colors.primary,
                            headerBackVisible: true,
                            headerBackTitle: "Quay lại",
                            headerBackTitleVisible: true,
                            headerTitleStyle: {
                              color: navTheme.colors.text,
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
                            headerTintColor: navTheme.colors.primary,
                            headerTitleStyle: {
                              color: navTheme.colors.text,
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
                            headerTintColor: navTheme.colors.primary,
                            headerTitleStyle: {
                              color: navTheme.colors.text,
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
                            headerTintColor: navTheme.colors.primary,
                            headerTitleStyle: {
                              color: navTheme.colors.text,
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
                            headerTintColor: navTheme.colors.primary,
                            headerTitleStyle: {
                              color: navTheme.colors.text,
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
                            headerTintColor: navTheme.colors.primary,
                            headerTitleStyle: {
                              color: navTheme.colors.text,
                              fontWeight: "700",
                            },
                          }}
                        />
                        <Stack.Screen
                          name="tournament/[id]/index"
                          options={{
                            title: "Giải đấu",
                            headerTitleAlign: "center",
                            headerBackTitle: "Quay lại",
                            headerTintColor: navTheme.colors.primary,
                            headerTitleStyle: {
                              color: navTheme.colors.text,
                              fontWeight: "700",
                            },
                          }}
                        />
                        <Stack.Screen
                          name="tournament/[id]/manage"
                          options={{
                            headerTitleAlign: "center",
                            headerBackTitle: "Quay lại",
                            headerTintColor: navTheme.colors.primary,
                            headerTitleStyle: {
                              color: navTheme.colors.text,
                              fontWeight: "700",
                            },
                          }}
                        />
                        <Stack.Screen
                          name="tournament/[id]/schedule"
                          options={{
                            headerTitleAlign: "center",
                            headerBackTitle: "Quay lại",
                            headerTintColor: navTheme.colors.primary,
                            headerTitleStyle: {
                              color: navTheme.colors.text,
                              fontWeight: "700",
                            },
                          }}
                        />
                        <Stack.Screen
                          name="tournament/[id]/referee"
                          options={{
                            headerTitleAlign: "center",
                            headerBackTitle: "Quay lại",
                            headerTintColor: navTheme.colors.primary,
                            headerTitleStyle: {
                              color: navTheme.colors.text,
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
                            headerTintColor: navTheme.colors.primary,
                            headerTitleStyle: {
                              color: navTheme.colors.text,
                              fontWeight: "700",
                            },
                          }}
                        />
                        <Stack.Screen
                          name="live/home"
                          options={{
                            headerShown: false,
                          }}
                        />
                        <Stack.Screen
                          name="admin/home"
                          options={{
                            headerShown: false,
                          }}
                        />
                        <Stack.Screen
                          name="clubs"
                          options={{
                            headerShown: false,
                          }}
                        />
                        <Stack.Screen
                          name="login"
                          options={{
                            headerShown: false,
                          }}
                        />

                        <Stack.Screen
                          name="404"
                          options={{
                            headerTitleAlign: "center",
                            headerBackTitle: "Quay lại",
                            headerTintColor: navTheme.colors.primary,
                            headerTitleStyle: {
                              color: navTheme.colors.text,
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
                            headerTintColor: navTheme.colors.primary,
                            headerTitleStyle: {
                              color: navTheme.colors.text,
                              fontWeight: "700",
                            },
                          }}
                        />
                      </Stack>

                      {/* ✅ StatusBar khớp theo theme đã resolve */}
                      <StatusBar
                        style={isDark ? "light" : "dark"}
                        backgroundColor={bg}
                        animated
                      />

                      {/* 🔄 Overlay khi đang áp dụng theme */}
                      {themeApplying && (
                        <View
                          pointerEvents="auto"
                          style={{
                            position: "absolute",
                            left: 0,
                            right: 0,
                            top: 0,
                            bottom: 0,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: "rgba(0,0,0,0.25)",
                          }}
                        >
                          <ActivityIndicator
                            size="large"
                            color={navTheme.colors.primary}
                          />
                        </View>
                      )}
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
