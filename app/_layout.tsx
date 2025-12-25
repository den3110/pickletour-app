import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { useFonts } from "expo-font";
import { router, Stack, usePathname, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import {
  ActivityIndicator,
  View,
  AppState,
  InteractionManager,
  DeviceEventEmitter,
  Platform,
  BackHandler,
  Alert,
  TouchableOpacity,
} from "react-native";
import "react-native-reanimated";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import * as Notifications from "expo-notifications";
import * as Linking from "expo-linking";

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
import analytics from "@/utils/analytics";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import {
  increaseLaunchCountAndGet,
  initInstallDateIfNeeded,
} from "@/services/ratingService";
import { Ionicons } from "@expo/vector-icons";

// app/_layout.tsx
if (__DEV__) {
  require("../dev/reactotron");
  require("../dev/ws-logger");
}

console.log("Is Fabric Enabled:", global.nativeFabricUIManager ? "YES" : "NO");

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

/* ===================== STATE MACHINE ===================== */
type AppLifecycle =
  | { phase: "initializing" }
  | { phase: "splash-hiding" }
  | { phase: "ready" }
  | { phase: "navigating"; target: string };
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

const isExpoGo = Constants.appOwnership === "expo";

export default function RootLayout() {
  const segments = useSegments();

  const clarityInitRef = React.useRef(false);
  const clarityModRef = React.useRef<any>(null);

  // Initialize analytics
  useEffect(() => {
    if (isExpoGo) return;
    analytics.init();
  }, []);

  // Track screen changes
  useEffect(() => {
    if (isExpoGo) return;
    const screenName = segments.join("/") || "(tabs)";
    analytics.logScreenView(screenName);
  }, [segments]);

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

  /* ==================== STATE MACHINE NAVIGATION ==================== */
  const [lifecycle, setLifecycle] = React.useState<AppLifecycle>({
    phase: "initializing",
  });

  const navigationQueue = React.useRef<string[]>([]);
  const hiddenRef = React.useRef(false);
  const [firstFrameDone, setFirstFrameDone] = React.useState(false);

  // Transition to ready
  const transitionToReady = React.useCallback(() => {
    setLifecycle((prev) => {
      if (prev.phase === "ready" || prev.phase === "navigating") return prev;
      return { phase: "ready" };
    });
  }, []);

  // Hide splash
  const hideSplashSafe = React.useCallback(async () => {
    if (hiddenRef.current) return;
    if (lifecycle.phase !== "initializing") return;

    setLifecycle({ phase: "splash-hiding" });

    try {
      await SplashScreen.hideAsync();
    } catch {
    } finally {
      await new Promise((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve(null));
        });
      });

      hiddenRef.current = true;
      transitionToReady();

      setTimeout(() => SplashScreen.hideAsync().catch(() => {}), 300);
    }
  }, [lifecycle.phase, transitionToReady]);

  const onLayoutRoot = React.useCallback(() => {
    if (!firstFrameDone) setFirstFrameDone(true);
  }, [firstFrameDone]);

  // Trigger hide splash
  React.useEffect(() => {
    if (firstFrameDone && fontsReady && lifecycle.phase === "initializing") {
      hideSplashSafe();
    }
  }, [firstFrameDone, fontsReady, lifecycle.phase, hideSplashSafe]);

  // Failsafe hide toàn cục
  React.useEffect(() => {
    const t = setTimeout(() => {
      if (
        lifecycle.phase === "initializing" ||
        lifecycle.phase === "splash-hiding"
      ) {
        if (__DEV__) {
          console.warn("⚠️ Force transition to ready after timeout");
        }
        transitionToReady();
      }
    }, SPLASH_GLOBAL_FAILSAFE_MS);
    return () => clearTimeout(t);
  }, [lifecycle.phase, transitionToReady]);

  // Ensure hide khi app trở lại foreground
  React.useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") {
        if (
          lifecycle.phase === "initializing" ||
          lifecycle.phase === "splash-hiding"
        ) {
          hideSplashSafe();
        }
      }
    });
    return () => sub.remove();
  }, [lifecycle.phase, hideSplashSafe]);

  // ✅ Global Android back button handler
  React.useEffect(() => {
    if (Platform.OS !== "android") return;

    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        const { router } = require("expo-router");

        // Check if can go back
        if (router.canGoBack()) {
          router.back();
          return true;
        }

        // Can't go back, check current route
        const currentSegments = router.segments || [];
        const isAtTabs =
          currentSegments.length === 0 ||
          currentSegments[0] === "(tabs)" ||
          (currentSegments.length === 1 && currentSegments[0] === "(tabs)");

        if (!isAtTabs) {
          // Not at tabs, go to tabs
          router.replace("/(tabs)");
          return true;
        }

        // At tabs, show exit confirmation
        Alert.alert("Thoát ứng dụng", "Bạn có muốn thoát PickleTour?", [
          { text: "Hủy", style: "cancel" },
          { text: "Thoát", onPress: () => BackHandler.exitApp() },
        ]);
        return true;
      }
    );

    return () => backHandler.remove();
  }, []);

  // Queue navigation with proper stack
  const queueNavigation = React.useCallback(
    (url: string) => {
      if (lifecycle.phase === "ready") {
        setLifecycle({ phase: "navigating", target: url });
      } else {
        if (!navigationQueue.current.includes(url)) {
          navigationQueue.current.push(url);
        }
      }
    },
    [lifecycle.phase]
  );

  // Process queue when ready
  React.useEffect(() => {
    if (lifecycle.phase === "ready" && navigationQueue.current.length > 0) {
      const target = navigationQueue.current[0];
      navigationQueue.current = [];
      setLifecycle({ phase: "navigating", target });
    }
  }, [lifecycle.phase]);

  // ✅ Actual navigation with stack building
  React.useEffect(() => {
    if (lifecycle.phase !== "navigating") return;

    const { router } = require("expo-router");
    const target = lifecycle.target;

    InteractionManager.runAfterInteractions(() => {
      if (__DEV__) {
        console.log("🚀 Navigating:", target);
      }

      // Check if cold start (no back stack)
      const isColdStart = !router.canGoBack();

      if (isColdStart && target !== "/(tabs)") {
        // Cold start to deep link: ensure home in stack first
        if (__DEV__) {
          console.log("🔥 Cold start detected, building stack...");
        }

        // Go to home first
        router.replace("/(tabs)");

        // Then push target
        setTimeout(() => {
          router.push(target);
          setLifecycle({ phase: "ready" });
        }, 100);
      } else {
        // Normal navigation or already at tabs
        if (target === "/(tabs)") {
          router.replace(target);
        } else {
          router.push(target);
        }
        setLifecycle({ phase: "ready" });
      }
    });
  }, [lifecycle]);

  /* -------------------- Notification routing -------------------- */
  const lastHandledIdRef = React.useRef<string | null>(null);

  const extractUrl = React.useCallback(
    (n?: Notifications.Notification | null) => {
      const data: any = n?.request?.content?.data ?? {};
      return (
        data?.url ?? (data?.matchId ? `/match/${data.matchId}/home` : null)
      );
    },
    []
  );

  React.useEffect(() => {
    let sub: Notifications.Subscription | null = null;

    (async () => {
      if (Platform.OS === "ios") {
        await new Promise((resolve) => setImmediate(resolve));
      }

      const resp = await Notifications.getLastNotificationResponseAsync();
      const n = resp?.notification;
      const id = n?.request?.identifier ?? "";

      if (id && id !== lastHandledIdRef.current) {
        lastHandledIdRef.current = id;
        const url = extractUrl(n);
        if (url) {
          queueNavigation(url);
        }
      }
    })();

    sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      const n = resp?.notification;
      const id = n?.request?.identifier ?? "";

      if (id && id === lastHandledIdRef.current) return;

      lastHandledIdRef.current = id || String(Date.now());
      const url = extractUrl(n);
      if (url) {
        queueNavigation(url);
      }
    });

    return () => {
      if (sub) sub.remove();
    };
  }, [queueNavigation, extractUrl]);

  /* -------------------- Deep Linking Handler -------------------- */
  const lastHandledDeepLinkRef = React.useRef<string | null>(null);

  const parseDeepLink = React.useCallback((url: string) => {
    try {
      const parsed = Linking.parse(url);
      const { hostname, path, queryParams } = parsed;

      if (__DEV__) {
        console.log("🔗 Deep Link Parsed:", {
          url,
          hostname,
          path,
          queryParams,
        });
      }

      if (path) {
        if (path.startsWith("tournament/")) {
          const segments = path.split("/");
          const id = segments[1];
          if (id) {
            if (segments[2] === "register") {
              return `/tournament/${id}/register`;
            } else if (segments[2] === "checkin") {
              return `/tournament/${id}/checkin`;
            } else if (segments[2] === "bracket") {
              return `/tournament/${id}/bracket`;
            } else if (segments[2] === "schedule") {
              return `/tournament/${id}/schedule`;
            } else if (segments[2] === "home") {
              return `/tournament/${id}/home`;
            } else {
              return `/tournament/${id}/home`;
            }
          }
        } else if (path.startsWith("match/")) {
          const segments = path.split("/");
          const id = segments[1];
          if (id) {
            if (segments[2] === "referee") {
              return `/match/${id}/referee`;
            } else {
              return `/match/${id}/home`;
            }
          }
        } else if (path.startsWith("live/")) {
          const id = path.split("/")[1];
          if (id) {
            return `/live/${id}`;
          } else {
            return "/live/home";
          }
        } else if (path.startsWith("profile/")) {
          const username = path.split("/")[1];
          if (username) {
            return `/profile/${username}`;
          }
        } else if (path.startsWith("clubs")) {
          return "/clubs";
        } else if (path.startsWith("levelpoint")) {
          return "/levelpoint";
        }
      }

      return "/(tabs)";
    } catch (error) {
      console.error("Deep Link Parse Error:", error);
      return null;
    }
  }, []);

  React.useEffect(() => {
    let linkingSubscription: { remove: () => void } | null = null;

    (async () => {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl && initialUrl !== lastHandledDeepLinkRef.current) {
        if (__DEV__) {
          console.log("🔗 Initial Deep Link:", initialUrl);
        }
        lastHandledDeepLinkRef.current = initialUrl;
        const targetPath = parseDeepLink(initialUrl);
        if (targetPath) {
          queueNavigation(targetPath);
        }
      }
    })();

    linkingSubscription = Linking.addEventListener("url", (event) => {
      const url = event.url;
      if (url && url !== lastHandledDeepLinkRef.current) {
        if (__DEV__) {
          console.log("🔗 Deep Link Received:", url);
        }
        lastHandledDeepLinkRef.current = url;
        const targetPath = parseDeepLink(url);
        if (targetPath) {
          queueNavigation(targetPath);
        }
      }
    });

    return () => {
      if (linkingSubscription) {
        linkingSubscription.remove();
      }
    };
  }, [parseDeepLink, queueNavigation]);

  useEffect(() => {
    (async () => {
      await initInstallDateIfNeeded();
      await increaseLaunchCountAndGet();
    })();
  }, []);

  React.useEffect(() => {
    if (isExpoGo) return;
    if (clarityInitRef.current) return;

    const projectId = process.env.EXPO_PUBLIC_CLARITY_PROJECT_ID;
    if (!projectId) return;

    clarityInitRef.current = true;

    (async () => {
      try {
        const mod = await import("@microsoft/react-native-clarity");
        clarityModRef.current = mod;

        // init
        mod.initialize(projectId, {
          // logLevel: __DEV__ ? mod.LogLevel.Verbose : mod.LogLevel.None,
        });
      } catch (e) {
        if (__DEV__) console.warn("Clarity init failed:", e);
      }
    })();
  }, []);

  React.useEffect(() => {
    if (isExpoGo) return;

    const mod = clarityModRef.current;
    if (!mod?.setCurrentScreenName) return;

    const screenName = segments.join("/") || "(tabs)";
    try {
      mod.setCurrentScreenName(screenName);
    } catch {}
  }, [segments]);

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
                    Platform.OS === "android" ? "top" : "",
                    Platform.OS === "android" ? "bottom" : "",
                  ]}
                >
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
                            headerLeft: () => (
                              <TouchableOpacity
                                onPress={() => router.back()}
                                style={{
                                  paddingHorizontal: 8,
                                  paddingVertical: 4,
                                }}
                              >
                                <Ionicons name="chevron-back" size={24} />
                              </TouchableOpacity>
                            ),
                          }}
                        />
                        <Stack.Screen
                          name="forgot-password"
                          options={{
                            title: "Quên mật khẩu",
                            headerTitleAlign: "center",
                            headerLeft: () => (
                              <TouchableOpacity
                                onPress={() => router.back()}
                                style={{
                                  paddingHorizontal: 8,
                                  paddingVertical: 4,
                                }}
                              >
                                <Ionicons name="chevron-back" size={24} />
                              </TouchableOpacity>
                            ),
                          }}
                        />
                        <Stack.Screen
                          name="levelpoint"
                          options={{
                            title: "Tự chấm trình",
                            headerTitleAlign: "center",
                            headerLeft: () => (
                              <TouchableOpacity
                                onPress={() => router.back()}
                                style={{
                                  paddingHorizontal: 8,
                                  paddingVertical: 4,
                                }}
                              >
                                <Ionicons name="chevron-back" size={24} />
                              </TouchableOpacity>
                            ),
                          }}
                        />

                        <Stack.Screen
                          name="tournament/[id]/checkin"
                          options={{
                            title: "Check-in giải đấu",
                            headerTitleAlign: "center",
                            headerLeft: () => (
                              <TouchableOpacity
                                onPress={() => router.back()}
                                style={{
                                  paddingHorizontal: 8,
                                  paddingVertical: 4,
                                }}
                              >
                                <Ionicons name="chevron-back" size={24} />
                              </TouchableOpacity>
                            ),
                          }}
                        />

                        <Stack.Screen
                          name="tournament/[id]/register"
                          options={{
                            title: "Đăng ký giải đấu",
                            headerTitleAlign: "center",
                            headerLeft: () => (
                              <TouchableOpacity
                                onPress={() => router.back()}
                                style={{
                                  paddingHorizontal: 8,
                                  paddingVertical: 4,
                                }}
                              >
                                <Ionicons name="chevron-back" size={24} />
                              </TouchableOpacity>
                            ),
                          }}
                        />
                        <Stack.Screen
                          options={{
                            title: "Duyệt định danh",
                            headerLeft: () => (
                              <TouchableOpacity
                                onPress={() => router.back()}
                                style={{
                                  paddingHorizontal: 8,
                                  paddingVertical: 4,
                                }}
                              >
                                <Ionicons name="chevron-back" size={24} />
                              </TouchableOpacity>
                            ),
                          }}
                          name="user/[id]/kyc"
                        />
                        <Stack.Screen
                          options={{
                            title: "Chấm trình",
                            headerLeft: () => (
                              <TouchableOpacity
                                onPress={() => router.back()}
                                style={{
                                  paddingHorizontal: 8,
                                  paddingVertical: 4,
                                }}
                              >
                                <Ionicons name="chevron-back" size={24} />
                              </TouchableOpacity>
                            ),
                          }}
                          name="user/[id]/grade"
                        />
                        <Stack.Screen
                          name="tournament/[id]/draw"
                          options={{
                            title: "Bốc thăm giải đấu",
                            headerTitleAlign: "center",
                            headerLeft: () => (
                              <TouchableOpacity
                                onPress={() => router.back()}
                                style={{
                                  paddingHorizontal: 8,
                                  paddingVertical: 4,
                                }}
                              >
                                <Ionicons name="chevron-back" size={24} />
                              </TouchableOpacity>
                            ),
                          }}
                        />
                        <Stack.Screen
                          name="tournament/[id]/bracket"
                          options={{
                            title: "Sơ đồ giải đấu",
                            headerTitleAlign: "center",
                            headerLeft: () => (
                              <TouchableOpacity
                                onPress={() => router.back()}
                                style={{
                                  paddingHorizontal: 8,
                                  paddingVertical: 4,
                                }}
                              >
                                <Ionicons name="chevron-back" size={24} />
                              </TouchableOpacity>
                            ),
                          }}
                        />
                        <Stack.Screen
                          name="tournament/[id]/home"
                          options={{
                            title: "Tổng quan giải đấu",
                            headerTitleAlign: "center",
                            headerLeft: () => (
                              <TouchableOpacity
                                onPress={() => router.back()}
                                style={{
                                  paddingHorizontal: 8,
                                  paddingVertical: 4,
                                }}
                              >
                                <Ionicons name="chevron-back" size={24} />
                              </TouchableOpacity>
                            ),
                          }}
                        />
                        <Stack.Screen
                          name="tournament/[id]/index"
                          options={{
                            title: "Giải đấu",
                            headerTitleAlign: "center",
                            headerLeft: () => (
                              <TouchableOpacity
                                onPress={() => router.back()}
                                style={{
                                  paddingHorizontal: 8,
                                  paddingVertical: 4,
                                }}
                              >
                                <Ionicons name="chevron-back" size={24} />
                              </TouchableOpacity>
                            ),
                          }}
                        />
                        <Stack.Screen
                          name="tournament/[id]/manage"
                          options={{
                            headerTitleAlign: "center",
                            headerLeft: () => (
                              <TouchableOpacity
                                onPress={() => router.back()}
                                style={{
                                  paddingHorizontal: 8,
                                  paddingVertical: 4,
                                }}
                              >
                                <Ionicons name="chevron-back" size={24} />
                              </TouchableOpacity>
                            ),
                          }}
                        />
                        <Stack.Screen
                          name="tournament/[id]/schedule"
                          options={{
                            headerTitleAlign: "center",
                            headerLeft: () => (
                              <TouchableOpacity
                                onPress={() => router.back()}
                                style={{
                                  paddingHorizontal: 8,
                                  paddingVertical: 4,
                                }}
                              >
                                <Ionicons name="chevron-back" size={24} />
                              </TouchableOpacity>
                            ),
                          }}
                        />
                        <Stack.Screen
                          name="tournament/[id]/referee"
                          options={{
                            headerTitleAlign: "center",
                            headerLeft: () => (
                              <TouchableOpacity
                                onPress={() => router.back()}
                                style={{
                                  paddingHorizontal: 8,
                                  paddingVertical: 4,
                                }}
                              >
                                <Ionicons name="chevron-back" size={24} />
                              </TouchableOpacity>
                            ),
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
                            headerLeft: () => (
                              <TouchableOpacity
                                onPress={() => router.back()}
                                style={{
                                  paddingHorizontal: 8,
                                  paddingVertical: 4,
                                }}
                              >
                                <Ionicons name="chevron-back" size={24} />
                              </TouchableOpacity>
                            ),
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
                          name="reset-password"
                          options={{
                            title: "Đặt lại mật khẩu",
                            headerTitleAlign: "center",
                            headerLeft: () => (
                              <TouchableOpacity
                                onPress={() => router.back()}
                                style={{
                                  paddingHorizontal: 8,
                                  paddingVertical: 4,
                                }}
                              >
                                <Ionicons name="chevron-back" size={24} />
                              </TouchableOpacity>
                            ),
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

                      <StatusBar
                        style={isDark ? "light" : "dark"}
                        backgroundColor={bg}
                        animated
                      />

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
