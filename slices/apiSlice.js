// src/slices/apiSlice.js
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import Constants from "expo-constants";
import { router } from "expo-router";
import { Platform } from "react-native";
import * as Application from "expo-application";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";

// ================= Base URL =================
const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  Constants.expoConfig?.extra?.API_URL ||
  "http://192.168.0.105:5001";

// ============== Helpers ==============
function sanitizeHeaderValue(v, max = 120) {
  try {
    return String(v ?? "")
      .replace(/[\r\n]/g, " ")
      .slice(0, max);
  } catch {
    return "";
  }
}

// Cache deviceId để không gọi SecureStore nhiều lần
let _deviceIdCache = null;
async function getDeviceId() {
  if (_deviceIdCache) return _deviceIdCache;
  let id = await SecureStore.getItemAsync("deviceId");
  if (!id) {
    id = Math.random().toString(36).slice(2);
    await SecureStore.setItemAsync("deviceId", id);
  }
  _deviceIdCache = id;
  return id;
}

// Cache deviceName (tên người dùng đặt cho máy)
let _deviceNameCache = null;
async function getDeviceName() {
  if (_deviceNameCache) return _deviceNameCache;
  try {
    let name = Device.deviceName ?? null;
    if (!name) {
      const brand = Device.brand || "";
      const model = Device.modelName || "";
      name =
        `${brand} ${model}`.trim() ||
        `${Platform.OS} ${Device.osVersion ?? ""}`;
    }
    name = sanitizeHeaderValue(name);
    _deviceNameCache = name;
    return name;
  } catch {
    const fallback = sanitizeHeaderValue(
      Device.modelName || String(Platform.OS)
    );
    _deviceNameCache = fallback;
    return fallback;
  }
}

// NEW: Cache push token (đã lưu sau khi đăng ký Expo Notifications)
let _pushTokenCache = null;
async function getPushToken() {
  if (_pushTokenCache) return _pushTokenCache;
  // bạn nhớ tự lưu token này sau khi gọi Notifications.getExpoPushTokenAsync
  // ví dụ: await SecureStore.setItemAsync("pushToken", token.data);
  const t = await SecureStore.getItemAsync("pushToken");
  _pushTokenCache = t || null;
  return _pushTokenCache;
}

// Tên "chi tiết" thiết bị (marketing-like)
function getDetailedDeviceFields() {
  const brandRaw = Device.brand || (Platform.OS === "ios" ? "Apple" : "");
  const modelNameRaw = Device.modelName || "";
  const modelIdRaw = Device.modelId || "";

  const brand = sanitizeHeaderValue(brandRaw);
  let modelName = sanitizeHeaderValue(
    Platform.OS === "android" ? modelNameRaw.replace(/_/g, " ") : modelNameRaw
  );
  const modelId = sanitizeHeaderValue(modelIdRaw, 60);

  let marketing = modelName;
  if (brand && modelName) {
    const starts = modelName.toLowerCase().startsWith(brand.toLowerCase());
    marketing = starts ? modelName : `${brand} ${modelName}`;
  } else if (brand) {
    marketing = brand;
  } else if (modelName) {
    marketing = modelName;
  } else {
    marketing = `${Platform.OS}`;
  }
  marketing = sanitizeHeaderValue(marketing);

  return { brand, modelName, modelId, marketing };
}

// ============== Raw baseQuery (headers) ==============
const rawBaseQuery = fetchBaseQuery({
  baseUrl: BASE_URL,
  prepareHeaders: async (headers, { getState }) => {
    // 1) Authorization
    const token = getState()?.auth?.userInfo?.token;
    if (token) headers.set("Authorization", `Bearer ${token}`);

    // 2) Version & device headers
    const [deviceId, deviceName, pushToken] = await Promise.all([
      getDeviceId(),
      getDeviceName(),
      getPushToken(), // NEW
    ]);

    const { brand, modelName, modelId, marketing } = getDetailedDeviceFields();

    const expoCfg = Constants.expoConfig ?? {};
    const appVersion =
      expoCfg?.version ?? Application.nativeApplicationVersion ?? "0.0.0";

    // Build number theo platform
    let buildNumber = 0;
    if (Platform.OS === "ios") {
      const fromConfig = parseInt(expoCfg?.ios?.buildNumber ?? "", 10);
      if (Number.isFinite(fromConfig)) {
        buildNumber = fromConfig;
      } else {
        const envBuild = Number(process.env.EXPO_PUBLIC_APP_BUILD ?? NaN);
        buildNumber = Number.isFinite(envBuild)
          ? envBuild
          : parseInt(Application.nativeBuildVersion ?? "0", 10) || 0;
      }
    } else {
      const fromConfig = expoCfg?.android?.versionCode;
      if (Number.isFinite(fromConfig)) {
        buildNumber = Number(fromConfig);
      } else {
        const envBuild = Number(process.env.EXPO_PUBLIC_APP_BUILD ?? NaN);
        buildNumber = Number.isFinite(envBuild)
          ? envBuild
          : parseInt(Application.nativeBuildVersion ?? "0", 10) || 0;
      }
    }

    headers.set("X-Platform", Platform.OS); // ios | android
    headers.set("X-App-Version", String(appVersion));
    headers.set("X-Build", String(buildNumber));
    headers.set("X-Device-Id", deviceId);
    headers.set("X-Device-Name", deviceName);
    headers.set("X-Device-Brand", brand);
    headers.set("X-Device-Model", marketing);
    headers.set("X-Device-Model-Name", modelName);
    headers.set("X-Device-Model-Id", modelId);

    // NEW: Gửi push token nếu có (đã sanitize)
    if (pushToken) {
      headers.set("X-Push-Token", sanitizeHeaderValue(pushToken, 260)); // Expo token dài ~50-60, để 260 dư dả
    }

    return headers;
  },
});

// ============== Helpers điều hướng ==============
function redirectTo404() {
  try {
    router.replace("/404");
  } catch (e) {
    console.log("redirectTo404 error:", e);
    router.replace("/(tabs)");
  }
}

function redirectTo403() {
  try {
    router.replace("/403");
  } catch (e) {
    console.log("redirectTo403 error:", e);
    router.replace("/(tabs)");
  }
}

// ============== Wrapper baseQuery (xử lý status) ==============
const baseQuery = async (args, api, extraOptions) => {
  const result = await rawBaseQuery(args, api, extraOptions);
  const status = result?.error?.status;

  if (status === 401) {
    try {
      api.dispatch({ type: "auth/logout" });
      api.dispatch(apiSlice.util.resetApiState());
    } catch {}
    return result;
  }

  if (status === 403) {
    try {
      // redirectTo403();
    } catch {}
    return result;
  }

  if (status === 404 && !extraOptions?.skip404Redirect) {
    redirectTo404();
  }

  if (status === 426) {
    api.dispatch({
      type: "version/forceOpen",
      payload: result?.error?.data || {},
    });
  }

  return result;
};

// ============== API Slice ==============
export const apiSlice = createApi({
  reducerPath: "api",
  baseQuery,
  tagTypes: [
    "User",
    "Assessment",
    "Ranking",
    "Tournaments",
    "Registrations",
    "RegInvites",
    "Draw",
    "Match",
    "ADMIN_BRACKETS",
    "ADMIN_MATCHES",
    "TournamentMatches",
    "MyTournaments",
    "Matches",
    "AppVersion",
    "Me",
    "MeScore",
    "RatingHistory",
    "Complaints",
    "Tournament",
    "Registration",
    "Achievements",
    "Court",
    "Courts",
    "MatchReferees",
    "TOURNAMENT_REFEREES",
    "RefereeSearch",
    "TournamentReferees",
    "MatchesByTournament",
    "ADMIN_QUEUE", 
    "ADMIN_COURTS"
  ],
  endpoints: () => ({}),
});

export default apiSlice;
