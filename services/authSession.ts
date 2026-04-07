import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

import { DEVICE_ID_KEY } from "./deviceIdentity";

type DeviceTokenPayload = {
  deviceId: string;
};

type LiveActivityPayload = {
  deviceId: string;
  platform: "ios";
  activities: [];
};

type LogoutFlowOptions = {
  logoutApiCall?: (() => Promise<unknown>) | null;
  unregisterDeviceToken?: ((payload: DeviceTokenPayload) => Promise<unknown>) | null;
  syncLiveActivities?: ((payload: LiveActivityPayload) => Promise<unknown>) | null;
  onDebugLog?: ((label: string, error: unknown) => void) | null;
};

const safeDebugLog = (
  logger: LogoutFlowOptions["onDebugLog"],
  label: string,
  error: unknown,
) => {
  if (typeof logger === "function") {
    logger(label, error);
  }
};

export async function runMobileLogoutFlow({
  logoutApiCall,
  unregisterDeviceToken,
  syncLiveActivities,
  onDebugLog,
}: LogoutFlowOptions) {
  let deviceId = "";

  try {
    deviceId = String((await SecureStore.getItemAsync(DEVICE_ID_KEY)) || "").trim();
  } catch (error) {
    safeDebugLog(onDebugLog, "read_device_id_failed", error);
  }

  if (deviceId && Platform.OS === "ios" && syncLiveActivities) {
    try {
      await syncLiveActivities({
        deviceId,
        platform: "ios",
        activities: [],
      });
    } catch (error) {
      safeDebugLog(onDebugLog, "sync_live_activities_failed", error);
    }
  }

  if (deviceId && unregisterDeviceToken) {
    try {
      await unregisterDeviceToken({ deviceId });
    } catch (error) {
      safeDebugLog(onDebugLog, "unregister_push_token_failed", error);
    }
  }

  if (logoutApiCall) {
    try {
      await logoutApiCall();
    } catch (error) {
      safeDebugLog(onDebugLog, "logout_api_failed", error);
    }
  }
}

export function buildLoginHref(returnTo = "/") {
  return `/login?returnTo=${encodeURIComponent(returnTo)}`;
}
