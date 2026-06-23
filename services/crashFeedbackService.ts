import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";

const PENDING_JS_CRASH_KEY = "@pickletour/pending-js-crash-feedback";

type CrashFeedbackSource = "js" | "native";

export type PendingCrashFeedback = {
  id: string;
  source: CrashFeedbackSource;
  occurredAt: string;
  message: string;
  name?: string;
  stack?: string;
  isFatal?: boolean;
  appVersion?: string;
  buildNumber?: string;
  platform: string;
  osVersion?: string | null;
  deviceModel?: string | null;
};

declare global {
  var __PICKLETOUR_JS_CRASH_REPORTER_INSTALLED__: boolean | undefined;
}

const truncate = (value: unknown, max = 4000) =>
  String(value ?? "")
    .replace(/\u0000/g, "")
    .slice(0, max);

const createCrashId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;

const getAppVersion = () =>
  String(
    Constants.expoConfig?.version ||
      Constants.expoConfig?.extra?.APP_VERSION ||
      "0.0.0",
  );

const getBuildNumber = () => {
  const expoCfg = (Constants.expoConfig ?? {}) as any;
  if (Platform.OS === "ios") return String(expoCfg?.ios?.buildNumber || "");
  const versionCode = expoCfg?.android?.versionCode;
  return Number.isFinite(versionCode) ? String(versionCode) : "";
};

const getDeviceModel = () =>
  [Device.brand, Device.modelName || Device.deviceName]
    .filter(Boolean)
    .join(" ")
    .trim();

const normalizeError = (
  error: unknown,
  isFatal?: boolean,
): PendingCrashFeedback => {
  const err = error as Error | null | undefined;
  const message =
    truncate(err?.message || error || "Ứng dụng bị văng do lỗi JavaScript", 800) ||
    "Ứng dụng bị văng do lỗi JavaScript";

  return {
    id: createCrashId("js"),
    source: "js",
    occurredAt: new Date().toISOString(),
    message,
    name: truncate(err?.name || "JavaScriptError", 120),
    stack: truncate(err?.stack || "", 5000),
    isFatal: Boolean(isFatal),
    appVersion: getAppVersion(),
    buildNumber: getBuildNumber(),
    platform: Platform.OS,
    osVersion: Device.osVersion,
    deviceModel: getDeviceModel(),
  };
};

export async function recordJsCrashForFeedback(
  error: unknown,
  isFatal?: boolean,
) {
  if (!isFatal) return;
  const payload = normalizeError(error, isFatal);
  await AsyncStorage.setItem(PENDING_JS_CRASH_KEY, JSON.stringify(payload));
}

export async function triggerCrashFeedbackTestCrash() {
  const error = new Error("Admin test crash feedback từ trang hồ sơ");
  await recordJsCrashForFeedback(error, true).catch(() => {});

  try {
    if (Constants.appOwnership !== "expo") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const crashlytics = require("@react-native-firebase/crashlytics").default;
      crashlytics().crash();
      return;
    }
  } catch {}

  setTimeout(() => {
    throw error;
  }, 0);
}

export async function getPendingCrashFeedback(): Promise<PendingCrashFeedback | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_JS_CRASH_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PendingCrashFeedback;
      if (parsed?.id && parsed?.source === "js") return parsed;
    }
  } catch {}

  try {
    if (Constants.appOwnership === "expo") return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crashlytics = require("@react-native-firebase/crashlytics").default;
    const didCrash = await crashlytics().didCrashOnPreviousExecution();
    if (!didCrash) return null;

    return {
      id: createCrashId("native"),
      source: "native",
      occurredAt: new Date().toISOString(),
      message: "Ứng dụng bị văng ở lần mở trước.",
      appVersion: getAppVersion(),
      buildNumber: getBuildNumber(),
      platform: Platform.OS,
      osVersion: Device.osVersion,
      deviceModel: getDeviceModel(),
    };
  } catch {
    return null;
  }
}

export async function clearPendingCrashFeedback(reportId?: string) {
  try {
    if (reportId) {
      const raw = await AsyncStorage.getItem(PENDING_JS_CRASH_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PendingCrashFeedback;
        if (parsed?.id && parsed.id !== reportId) return;
      }
    }
    await AsyncStorage.removeItem(PENDING_JS_CRASH_KEY);
  } catch {}
}

export function buildCrashFeedbackDetails(report: PendingCrashFeedback) {
  const lines = [
    "--- Thông tin lỗi tự động ---",
    `Nguồn phát hiện: ${report.source === "js" ? "JavaScript" : "Crashlytics"}`,
    `Thời điểm ghi nhận: ${report.occurredAt}`,
    `Phiên bản app: ${report.appVersion || "không rõ"}`,
    report.buildNumber ? `Build: ${report.buildNumber}` : "",
    `Nền tảng: ${report.platform}`,
    report.osVersion ? `OS: ${report.osVersion}` : "",
    report.deviceModel ? `Thiết bị: ${report.deviceModel}` : "",
    report.name ? `Tên lỗi: ${report.name}` : "",
    report.message ? `Thông báo lỗi: ${report.message}` : "",
    report.stack ? `Stack:\n${report.stack}` : "",
  ];

  return lines.filter(Boolean).join("\n");
}

export function installJsCrashReporter() {
  if (global.__PICKLETOUR_JS_CRASH_REPORTER_INSTALLED__) return;

  const errorUtils = (global as any).ErrorUtils;
  if (!errorUtils?.setGlobalHandler || !errorUtils?.getGlobalHandler) return;

  const previousHandler = errorUtils.getGlobalHandler();
  global.__PICKLETOUR_JS_CRASH_REPORTER_INSTALLED__ = true;

  errorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
    const passToPreviousHandler = () => {
      if (typeof previousHandler === "function") {
        previousHandler(error, isFatal);
        return;
      }

      throw error;
    };

    if (isFatal) {
      let didPass = false;
      let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

      const passOnce = () => {
        if (didPass) return;
        didPass = true;
        if (fallbackTimer) clearTimeout(fallbackTimer);
        passToPreviousHandler();
      };

      fallbackTimer = setTimeout(passOnce, 1200);
      recordJsCrashForFeedback(error, isFatal)
        .catch(() => {})
        .finally(passOnce);
      return;
    }

    passToPreviousHandler();
  });
}
