import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { useFonts } from "expo-font";
import { router, Stack, useSegments } from "expo-router";
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
  Text,
  TextInput,
  TouchableOpacity,
} from "react-native";
import "react-native-reanimated";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import * as Linking from "expo-linking";
import * as Device from "expo-device";

import { useColorScheme } from "@/hooks/useColorScheme";
import { setCredentials } from "@/slices/authSlice";
import store from "@/store";
import { loadUserInfo } from "@/utils/authStorage";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Provider, useSelector } from "react-redux";
import { SocketProvider } from "../context/SocketContext";
import { ChatBotPageContextProvider } from "@/context/ChatBotPageContext";
import { PikoraHost } from "@/components/chatbot/PikoraHost";
import { PikoraProvider } from "@/components/chatbot/PikoraProvider";
import { resolvePikoraNavigationTarget } from "@/components/chatbot/pikoraNavigation";
import { useExpoPushToken } from "@/hooks/useExpoPushToken";
import { loadExpoNotifications } from "@/lib/expoNotifications";
import ForceUpdateModal from "@/components/ForceUpdateModal";
import HotUpdateModal from "@/components/HotUpdateModal";
import MatchLiveActivityBootstrap from "@/components/match/MatchLiveActivityBootstrap";
import { useLazyGetProfileQuery } from "@/slices/usersApiSlice";
// HotUpdater: import động để tránh crash trên Expo Go
let HotUpdater: any = null;
if (Constants.appOwnership !== "expo") {
  try {
    HotUpdater = require("@hot-updater/react-native").HotUpdater;
  } catch (e) {
    if (__DEV__) console.warn("HotUpdater not available (Expo Go?):", e);
  }
}
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

// Keep app typography stable when the device uses larger accessibility text.
if (!Text.defaultProps) {
  Text.defaultProps = {};
}
if (!TextInput.defaultProps) {
  TextInput.defaultProps = {};
}
Text.defaultProps.allowFontScaling = false;
Text.defaultProps.maxFontSizeMultiplier = 1;
TextInput.defaultProps.allowFontScaling = false;
TextInput.defaultProps.maxFontSizeMultiplier = 1;

console.log("Is Fabric Enabled:", global.nativeFabricUIManager ? "YES" : "NO");

const SPLASH_FONT_FAILSAFE_MS = 1500;
const SPLASH_GLOBAL_FAILSAFE_MS = 5000;
const PREF_THEME_KEY = "PREF_THEME"; // "system" | "light" | "dark"
const HOT_UPDATE_NOTIFY_EVENT = "hotupdater:notify";
const HOT_UPDATE_NOTIFY_KEY = "__PICKLETOUR_HOTUPDATE_NOTIFY__";
const HOT_UPDATE_RELOAD_EVENT = "hotupdater:before-reload";
const HOT_UPDATE_RELOAD_KEY = "__PICKLETOUR_HOTUPDATE_RELOAD__";
const HOT_UPDATE_PENDING_KEY = "__PICKLETOUR_HOTUPDATE_PENDING__";
const HOT_UPDATE_TELEMETRY_PATH = "/api/ota/report-status";
const HOT_UPDATE_API_FALLBACK = "https://pickletour.vn/api";

type HotUpdateTelemetryStatus =
  | "update_available"
  | "dismissed"
  | "downloading"
  | "downloaded"
  | "promoted"
  | "recovered"
  | "failed";

type PendingHotUpdatePayload = {
  bundleId: string;
  platform: "ios" | "android";
  appVersion: string;
  channel: string;
  currentBundleId?: string;
  message?: string;
  downloadedAt: string;
};

const normalizeBaseUrl = (value?: string | null) =>
  String(value || "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .replace(/\/+$/, "");

const HOT_UPDATE_API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

const createHotUpdateEventId = () =>
  `hu_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

const getHotUpdateDeviceId = async () => {
  let deviceId = await SecureStore.getItemAsync("deviceId");
  if (!deviceId) {
    deviceId = Math.random().toString(36).slice(2);
    await SecureStore.setItemAsync("deviceId", deviceId);
  }
  return deviceId;
};

const getHotUpdateAppVersion = () =>
  String(
    Constants.expoConfig?.version ||
      Constants.expoConfig?.extra?.APP_VERSION ||
      "0.0.0",
  );

const savePendingHotUpdate = async (payload: PendingHotUpdatePayload) => {
  await SecureStore.setItemAsync(
    HOT_UPDATE_PENDING_KEY,
    JSON.stringify(payload),
  );
};

const getPendingHotUpdate =
  async (): Promise<PendingHotUpdatePayload | null> => {
    try {
      const raw = await SecureStore.getItemAsync(HOT_UPDATE_PENDING_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as PendingHotUpdatePayload;
    } catch {
      return null;
    }
  };

const clearPendingHotUpdate = async () => {
  await SecureStore.deleteItemAsync(HOT_UPDATE_PENDING_KEY);
};

const reportHotUpdateTelemetry = async ({
  status,
  bundleId,
  currentBundleId,
  channel,
  appVersion,
  message,
  errorMessage,
  errorCode,
  duration,
}: {
  status: HotUpdateTelemetryStatus;
  bundleId?: string | null;
  currentBundleId?: string | null;
  channel?: string | null;
  appVersion?: string | null;
  message?: string | null;
  errorMessage?: string | null;
  errorCode?: string | null;
  duration?: number | null;
}) => {
  try {
    const deviceId = await getHotUpdateDeviceId();
    const response = await fetch(
      `${HOT_UPDATE_API_BASE_URL}${HOT_UPDATE_TELEMETRY_PATH}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventId: createHotUpdateEventId(),
          platform: Platform.OS,
          bundleId: bundleId || undefined,
          currentBundleId: currentBundleId || undefined,
          appVersion: appVersion || getHotUpdateAppVersion(),
          channel: channel || "production",
          status,
          message: message || undefined,
          errorMessage: errorMessage || undefined,
          errorCode: errorCode || undefined,
          duration:
            typeof duration === "number" && Number.isFinite(duration)
              ? duration
              : undefined,
          deviceInfo: {
            deviceId,
            model: Device.modelName || Device.deviceName || undefined,
            osVersion: Device.osVersion || undefined,
            brand: Device.brand || undefined,
          },
        }),
      },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.warn(
        "[HotUpdater] Telemetry request failed:",
        response.status,
        text,
      );
      return false;
    }

    return true;
  } catch (error) {
    console.warn("[HotUpdater] Telemetry error:", error);
    return false;
  }
};

const handleHotUpdateNotifyTelemetry = async (payload: {
  status: "PROMOTED" | "RECOVERED" | "STABLE";
  crashedBundleId?: string;
}) => {
  const pending = await getPendingHotUpdate();

  if (payload.status === "RECOVERED") {
    await reportHotUpdateTelemetry({
      status: "recovered",
      bundleId: payload.crashedBundleId || pending?.bundleId,
      currentBundleId: pending?.currentBundleId,
      channel: pending?.channel,
      appVersion: pending?.appVersion,
      errorMessage: "Ứng dụng đã tự khôi phục về bundle ổn định sau lỗi OTA.",
    });
    await clearPendingHotUpdate();
    return;
  }

  if (!pending?.bundleId) {
    return;
  }

  if (payload.status === "PROMOTED" || payload.status === "STABLE") {
    const success = await reportHotUpdateTelemetry({
      status: "promoted",
      bundleId: pending.bundleId,
      channel: pending.channel,
      appVersion: pending.appVersion,
      message: pending.message,
    });

    if (success) {
      await clearPendingHotUpdate();
    }
  }
};

const publishHotUpdateNotify = (payload: {
  status: "PROMOTED" | "RECOVERED" | "STABLE";
  crashedBundleId?: string;
}) => {
  (globalThis as any)[HOT_UPDATE_NOTIFY_KEY] = payload;
  DeviceEventEmitter.emit(HOT_UPDATE_NOTIFY_EVENT, payload);
};

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

function AuthSessionSync() {
  const userInfo = useSelector((state: any) => state.auth?.userInfo || null);
  const [triggerProfile] = useLazyGetProfileQuery();
  const lastSyncAtRef = React.useRef(0);

  React.useEffect(() => {
    if (!userInfo?.token) return;

    const syncProfile = () => {
      const now = Date.now();
      if (now - lastSyncAtRef.current < 5000) return;
      lastSyncAtRef.current = now;
      triggerProfile();
    };

    syncProfile();

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        syncProfile();
      }
    });

    return () => sub.remove();
  }, [triggerProfile, userInfo?.token]);

  return null;
}

const isExpoGo = Constants.appOwnership === "expo";

function RootLayout() {
  const segments = useSegments();

  const clarityInitRef = React.useRef(false);
  const clarityModRef = React.useRef<any>(null);
  const otaCheckInFlightRef = React.useRef(false);
  const otaLastCheckAtRef = React.useRef(0);
  const otaIgnoredUpdateIdRef = React.useRef<string | null>(null);
  const otaInitialCheckDoneRef = React.useRef(false);

  const [hotUpdateVisible, setHotUpdateVisible] = React.useState(false);
  const [hotUpdateProgress, setHotUpdateProgress] = React.useState(0);
  const [hotUpdateStatus, setHotUpdateStatus] = React.useState<
    "downloading" | "done" | "error"
  >("downloading");
  const [hotUpdateMessage, setHotUpdateMessage] = React.useState<string | null>(
    null,
  );

  // Initialize analytics
  useEffect(() => {
    if (isExpoGo) return;
    analytics.init();
  }, []);

  const startHotUpdate = React.useCallback(async (updateInfo: any) => {
    if (!HotUpdater || !updateInfo?.updateBundle) return;

    const startedAt = Date.now();
    const pendingPayload: PendingHotUpdatePayload = {
      bundleId: String(updateInfo?.id || ""),
      platform: Platform.OS as "ios" | "android",
      appVersion: getHotUpdateAppVersion(),
      channel: String(updateInfo?.channel || "production"),
      currentBundleId: updateInfo?.currentBundleId
        ? String(updateInfo.currentBundleId)
        : undefined,
      message: updateInfo?.message ? String(updateInfo.message) : undefined,
      downloadedAt: new Date().toISOString(),
    };

    otaCheckInFlightRef.current = true;
    otaIgnoredUpdateIdRef.current = null;
    setHotUpdateVisible(true);
    setHotUpdateStatus("downloading");
    setHotUpdateProgress(0);
    setHotUpdateMessage(
      updateInfo?.message || "Đang tải bản cập nhật mới cho ứng dụng.",
    );

    try {
      void reportHotUpdateTelemetry({
        status: "downloading",
        bundleId: pendingPayload.bundleId,
        currentBundleId: pendingPayload.currentBundleId,
        channel: pendingPayload.channel,
        appVersion: pendingPayload.appVersion,
        message: pendingPayload.message,
      });

      const success = await updateInfo.updateBundle();
      if (!success) {
        throw new Error("Không thể tải bản cập nhật.");
      }

      await savePendingHotUpdate(pendingPayload);
      await reportHotUpdateTelemetry({
        status: "downloaded",
        bundleId: pendingPayload.bundleId,
        currentBundleId: pendingPayload.currentBundleId,
        channel: pendingPayload.channel,
        appVersion: pendingPayload.appVersion,
        message: pendingPayload.message,
        duration: Date.now() - startedAt,
      });

      setHotUpdateProgress(1);
      setHotUpdateStatus("done");
      setHotUpdateMessage("Bản cập nhật đã tải xong. Đang mở lại ứng dụng...");

      setTimeout(() => {
        (globalThis as any)[HOT_UPDATE_RELOAD_KEY] = true;
        DeviceEventEmitter.emit(HOT_UPDATE_RELOAD_EVENT);
        HotUpdater.reload().catch((error: unknown) => {
          (globalThis as any)[HOT_UPDATE_RELOAD_KEY] = false;
          console.error("[HotUpdater] Reload error:", error);
          void clearPendingHotUpdate();
          void reportHotUpdateTelemetry({
            status: "failed",
            bundleId: pendingPayload.bundleId,
            currentBundleId: pendingPayload.currentBundleId,
            channel: pendingPayload.channel,
            appVersion: pendingPayload.appVersion,
            message: pendingPayload.message,
            errorMessage:
              error instanceof Error
                ? error.message
                : "Không thể reload ứng dụng sau OTA.",
            duration: Date.now() - startedAt,
          });
          setHotUpdateStatus("error");
          setHotUpdateMessage(
            "Tải xong bản cập nhật nhưng không thể mở lại ứng dụng.",
          );
        });
      }, 700);
    } catch (error) {
      console.error("[HotUpdater] Download error:", error);
      await clearPendingHotUpdate();
      await reportHotUpdateTelemetry({
        status: "failed",
        bundleId: pendingPayload.bundleId,
        currentBundleId: pendingPayload.currentBundleId,
        channel: pendingPayload.channel,
        appVersion: pendingPayload.appVersion,
        message: pendingPayload.message,
        errorMessage:
          error instanceof Error ? error.message : "Không thể tải bundle OTA.",
        duration: Date.now() - startedAt,
      });
      setHotUpdateStatus("error");
      setHotUpdateMessage("Không thể tải bản cập nhật. Vui lòng thử lại sau.");
      otaCheckInFlightRef.current = false;
    }
  }, []);

  const checkForHotUpdate = React.useCallback(async () => {
    if (isExpoGo || !HotUpdater || otaCheckInFlightRef.current) return;

    const now = Date.now();
    if (now - otaLastCheckAtRef.current < 15000) return;
    otaLastCheckAtRef.current = now;
    otaCheckInFlightRef.current = true;

    try {
      try {
        const killSwitchRes = await fetch(
          `${HOT_UPDATE_API_BASE_URL}/api/settings/ota-allowed`,
          {
            headers: { "Cache-Control": "no-cache" },
          },
        );
        if (killSwitchRes.ok) {
          const killSwitchData = await killSwitchRes.json();
          if (killSwitchData && killSwitchData.allowed === false) {
            if (__DEV__)
              console.log("[HotUpdater] OTA updates disabled remotely.");
            otaCheckInFlightRef.current = false;
            return;
          }
        }
      } catch (err) {
        if (__DEV__)
          console.warn("[HotUpdater] Failed to fetch OTA kill switch", err);
      }

      const updateInfo = await HotUpdater.checkForUpdate({
        updateStrategy: "appVersion",
        requestTimeout: 8000,
      });

      if (!updateInfo) {
        otaCheckInFlightRef.current = false;
        return;
      }
      if (otaIgnoredUpdateIdRef.current === updateInfo.id) {
        otaCheckInFlightRef.current = false;
        return;
      }

      const isForceUpdate = updateInfo.shouldForceUpdate === true;
      const title = isForceUpdate
        ? "Cần cập nhật ứng dụng"
        : "Có bản cập nhật mới";
      const message =
        updateInfo.message ||
        "Đã có bản cập nhật mới. Bạn có muốn tải và áp dụng ngay bây giờ không?";

      const buttons = isForceUpdate
        ? [
            {
              text: "Cập nhật",
              onPress: () => {
                void startHotUpdate(updateInfo);
              },
            },
          ]
        : [
            {
              text: "Để sau",
              style: "cancel" as const,
              onPress: () => {
                otaIgnoredUpdateIdRef.current = updateInfo.id;
                void reportHotUpdateTelemetry({
                  status: "dismissed",
                  bundleId: updateInfo?.id,
                  currentBundleId: updateInfo?.currentBundleId,
                  channel: updateInfo?.channel,
                  appVersion: getHotUpdateAppVersion(),
                  message: updateInfo?.message,
                });
                otaCheckInFlightRef.current = false;
              },
            },
            {
              text: "Cập nhật",
              onPress: () => {
                void startHotUpdate(updateInfo);
              },
            },
          ];

      void reportHotUpdateTelemetry({
        status: "update_available",
        bundleId: updateInfo?.id,
        currentBundleId: updateInfo?.currentBundleId,
        channel: updateInfo?.channel,
        appVersion: getHotUpdateAppVersion(),
        message: updateInfo?.message,
      });
      Alert.alert(title, message, buttons, { cancelable: false });
      otaCheckInFlightRef.current = false;
    } catch (error) {
      console.error("[HotUpdater] Check error:", error);
      otaCheckInFlightRef.current = false;
    }
  }, [startHotUpdate]);

  React.useEffect(() => {
    if (isExpoGo || !HotUpdater) return;

    const unsubscribe = HotUpdater.addListener(
      "onProgress",
      ({ progress }: { progress: number }) => {
        setHotUpdateProgress(progress || 0);
      },
    );

    return unsubscribe;
  }, []);

  React.useEffect(() => {
    const showNotify = (payload?: {
      status: "PROMOTED" | "RECOVERED" | "STABLE";
      crashedBundleId?: string;
    }) => {
      if (!payload || payload.status === "STABLE") return;

      if (payload.status === "PROMOTED") {
        Toast.show({
          type: "success",
          text1: "Ứng dụng đã được cập nhật",
          text2: "Bản cập nhật mới đã được áp dụng thành công.",
        });
        return;
      }

      Toast.show({
        type: "error",
        text1: "Đã khôi phục bản ổn định",
        text2: "Ứng dụng đã tự rollback về bản an toàn.",
      });
    };

    const initialPayload = (globalThis as any)[HOT_UPDATE_NOTIFY_KEY];
    if (initialPayload) {
      delete (globalThis as any)[HOT_UPDATE_NOTIFY_KEY];
      showNotify(initialPayload);
    }

    const sub = DeviceEventEmitter.addListener(
      HOT_UPDATE_NOTIFY_EVENT,
      showNotify,
    );
    return () => sub.remove();
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
    "system",
  );

  // 🔄 Overlay khi đổi theme
  const [themeApplying, setThemeApplying] = React.useState(false);
  const themeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
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
      },
    );
    return () => sub.remove();
  }, []);

  // 3) Resolve theme
  const resolvedScheme =
    prefTheme === "system" ? systemScheme : (prefTheme as "light" | "dark");
  const isDark = resolvedScheme === "dark";

  const navTheme = React.useMemo(
    () => (isDark ? AppDarkTheme : AppLightTheme),
    [isDark],
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

  React.useEffect(() => {
    if (isExpoGo || !HotUpdater) return;
    if (lifecycle.phase !== "ready") return;
    if (otaInitialCheckDoneRef.current) return;

    otaInitialCheckDoneRef.current = true;
    const timer = setTimeout(() => {
      void checkForHotUpdate();
    }, 2000);

    return () => clearTimeout(timer);
  }, [lifecycle.phase, checkForHotUpdate]);

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
        if (lifecycle.phase === "ready") {
          void checkForHotUpdate();
        }
        if (
          lifecycle.phase === "initializing" ||
          lifecycle.phase === "splash-hiding"
        ) {
          hideSplashSafe();
        }
      }
    });
    return () => sub.remove();
  }, [lifecycle.phase, hideSplashSafe, checkForHotUpdate]);

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
      },
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
    [lifecycle.phase],
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

  const extractUrl = React.useCallback((n?: any | null) => {
    const data: any = n?.request?.content?.data ?? {};
    return data?.url ?? (data?.matchId ? `/match/${data.matchId}/home` : null);
  }, []);

  React.useEffect(() => {
    let active = true;
    let sub: { remove: () => void } | null = null;

    void (async () => {
      const Notifications = await loadExpoNotifications();
      if (!Notifications || !active) {
        return;
      }

      if (Platform.OS === "ios") {
        await new Promise((resolve) => setImmediate(resolve));
      }

      try {
        const resp = await Notifications.getLastNotificationResponseAsync();
        if (!active) {
          return;
        }

        const n = resp?.notification;
        const id = n?.request?.identifier ?? "";

        if (id && id !== lastHandledIdRef.current) {
          lastHandledIdRef.current = id;
          const url = extractUrl(n);
          if (url) {
            queueNavigation(url);
          }
        }
      } catch (error) {
        if (__DEV__) {
          console.warn(
            "[Notifications] Failed to read initial response:",
            error,
          );
        }
      }

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
    })();

    return () => {
      active = false;
      if (sub) sub.remove();
    };
  }, [queueNavigation, extractUrl]);

  /* -------------------- Deep Linking Handler -------------------- */
  const lastHandledDeepLinkRef = React.useRef<string | null>(null);

  const parseDeepLink = React.useCallback((url: string) => {
    try {
      const parsed = Linking.parse(url);
      const { hostname, path, queryParams, scheme } = parsed;

      if (__DEV__) {
        console.log("🔗 Deep Link Parsed:", {
          url,
          scheme,
          hostname,
          path,
          queryParams,
        });
      }

      // Ignore Expo / Dev Client bootstrap URLs on cold start.
      if (
        (
          /^exp(s)?$/i.test(String(scheme || "")) ||
          String(hostname || "").toLowerCase() === "expo-development-client"
        ) &&
        (!path || path === "/" || path === "--" || path === "--/" || path === "expo-development-client")
      ) {
        return null;
      }

      const resolved = resolvePikoraNavigationTarget(url);
      return resolved.internalPath || null;
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

    const projectId = process.env.EXPO_PUBLIC_CLARITY_REACT_NATIVE_PROJECT_ID;
    if (!projectId) return;

    clarityInitRef.current = true;

    (async () => {
      try {
        const mod = await import("@microsoft/react-native-clarity");
        clarityModRef.current = mod;

        // init
        mod.initialize(projectId, {
          logLevel: mod.LogLevel.None,
        });
        console.log("initialized clarity");
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
              <AuthSessionSync />
              <MatchLiveActivityBootstrap />
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
                      <ChatBotPageContextProvider>
                        <PikoraProvider>
                          <Stack
                            screenOptions={{
                              headerStyle: {
                                backgroundColor: navTheme.colors.card,
                              },
                              headerTintColor: navTheme.colors.text,
                              contentStyle: {
                                backgroundColor: bg,
                              },

                              // ✅ GLOBAL: tất cả chevron-back tự ăn theme (theo tintColor)
                              headerLeft: ({ canGoBack, tintColor }) => {
                                if (!canGoBack) return null;
                                return (
                                  <TouchableOpacity
                                    onPress={() => router.back()}
                                    style={{
                                      paddingHorizontal: 8,
                                      paddingVertical: 4,
                                    }}
                                    hitSlop={{
                                      top: 10,
                                      bottom: 10,
                                      left: 10,
                                      right: 10,
                                    }}
                                  >
                                    <Ionicons
                                      name="chevron-back"
                                      size={24}
                                      color={tintColor ?? navTheme.colors.text}
                                    />
                                  </TouchableOpacity>
                                );
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
                              }}
                            />

                            <Stack.Screen
                              name="forgot-password"
                              options={{
                                title: "Quên mật khẩu",
                                headerTitleAlign: "center",
                              }}
                            />

                            <Stack.Screen
                              name="levelpoint"
                              options={{
                                title: "Tự chấm trình",
                                headerTitleAlign: "center",
                              }}
                            />

                            <Stack.Screen
                              name="tournament/[id]/checkin"
                              options={{
                                title: "Check-in giải đấu",
                                headerTitleAlign: "center",
                              }}
                            />

                            <Stack.Screen
                              name="tournament/[id]/register"
                              options={{
                                title: "Đăng ký giải đấu",
                                headerTitleAlign: "center",
                              }}
                            />

                            <Stack.Screen
                              options={{
                                title: "Duyệt định danh",
                              }}
                              name="user/[id]/kyc"
                            />

                            <Stack.Screen
                              options={{
                                title: "Chấm trình",
                              }}
                              name="user/[id]/grade"
                            />

                            <Stack.Screen
                              name="tournament/[id]/draw"
                              options={{
                                title: "Bốc thăm giải đấu",
                                headerTitleAlign: "center",
                              }}
                            />

                            <Stack.Screen
                              name="tournament/[id]/bracket"
                              options={{
                                title: "Sơ đồ giải đấu",
                                headerTitleAlign: "center",
                              }}
                            />

                            <Stack.Screen
                              name="tournament/[id]/home"
                              options={{
                                title: "Tổng quan giải đấu",
                                headerTitleAlign: "center",
                              }}
                            />

                            <Stack.Screen
                              name="tournament/[id]/index"
                              options={{
                                title: "Giải đấu",
                                headerTitleAlign: "center",
                              }}
                            />

                            <Stack.Screen
                              name="tournament/[id]/manage"
                              options={{
                                headerTitleAlign: "center",
                              }}
                            />

                            <Stack.Screen
                              name="tournament/[id]/schedule"
                              options={{
                                headerTitleAlign: "center",
                              }}
                            />

                            <Stack.Screen
                              name="tournament/[id]/referee"
                              options={{
                                headerTitleAlign: "center",
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
                              name="radar/index"
                              options={{
                                headerShown: false,
                              }}
                            />

                            <Stack.Screen
                              name="clubs/[id]/index"
                              options={{
                                headerShown: false,
                              }}
                            />

                            <Stack.Screen
                              name="guide/index"
                              options={{
                                headerTitleAlign: "center",
                                headerTintColor: navTheme.colors.primary,
                                headerTitleStyle: {
                                  color: navTheme.colors.text,
                                  fontWeight: "700",
                                },
                              }}
                            />

                            <Stack.Screen
                              name="reset-password"
                              options={{
                                title: "Đặt lại mật khẩu",
                                headerTitleAlign: "center",
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

                          <PikoraHost />

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
                        </PikoraProvider>
                      </ChatBotPageContextProvider>
                    </ThemeProvider>
                  </View>
                </SafeAreaView>
              </SafeAreaProvider>
            </Boot>
          </SocketProvider>
          <ForceUpdateModal />
          <HotUpdateModal
            visible={hotUpdateVisible}
            progress={hotUpdateProgress}
            status={hotUpdateStatus}
            message={hotUpdateMessage}
            isDark={isDark}
            accentColor={navTheme.colors.primary}
            onClose={() => {
              setHotUpdateVisible(false);
              setHotUpdateProgress(0);
              setHotUpdateStatus("downloading");
              setHotUpdateMessage(null);
              otaCheckInFlightRef.current = false;
            }}
          />
          <Toast />
        </BottomSheetModalProvider>
      </GestureHandlerRootView>
    </Provider>
  );
}

// ✅ Expo Go: bỏ qua HotUpdater (native module không khả dụng)
const ExportedLayout = HotUpdater
  ? HotUpdater.wrap({
      baseURL: "https://hot-updater.datistpham.workers.dev/api/check-update",
      updateMode: "manual",
      requestTimeout: 8000,
      onNotifyAppReady: (result: {
        status: "PROMOTED" | "RECOVERED" | "STABLE";
        crashedBundleId?: string;
      }) => {
        void handleHotUpdateNotifyTelemetry(result);
        publishHotUpdateNotify(result);
      },
    })(RootLayout)
  : RootLayout;

export default ExportedLayout;
