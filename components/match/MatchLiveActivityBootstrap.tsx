import { useCallback, useEffect, useRef } from "react";
import * as Application from "expo-application";
import { AppState, Platform } from "react-native";
import { useSelector } from "react-redux";
import { getOrCreatePushDeviceId } from "@/services/deviceIdentity";
import {
  listMatchLiveActivities,
  pruneMatchLiveActivities,
} from "@/services/matchLiveActivity";
import { useSyncLiveActivitiesMutation } from "@/slices/pushApiSlice";

const buildActivitiesSignature = (activities: any[]) =>
  activities
    .map((item) =>
      [
        String(item?.matchId || ""),
        String(item?.activityId || ""),
        String(item?.status || ""),
        String(item?.pushToken || ""),
      ].join(":"),
    )
    .sort()
    .join("|");

export default function MatchLiveActivityBootstrap() {
  const auth = useSelector((s: any) => s.auth?.userInfo);
  const [syncLiveActivities] = useSyncLiveActivitiesMutation();
  const lastSyncSignatureRef = useRef<string | null>(null);

  const reconcile = useCallback(() => {
    if (Platform.OS !== "ios") return;

    void pruneMatchLiveActivities({
      keepLiveOnly: false,
      dismissalPolicy: "immediate",
    });
  }, []);

  const syncRemoteRegistrations = useCallback(async () => {
    if (Platform.OS !== "ios") return;
    if (!auth?._id) return;

    const snapshot = await listMatchLiveActivities();
    if (!snapshot?.remoteUpdateSupported) return;
    const activities = Array.isArray(snapshot?.activities)
      ? snapshot.activities.map((item) => ({
          matchId: String(item?.matchId || ""),
          activityId: String(item?.activityId || ""),
          pushToken:
            typeof item?.pushToken === "string" && item.pushToken.trim()
              ? item.pushToken.trim()
              : null,
          status:
            typeof item?.status === "string" && item.status.trim()
              ? item.status.trim()
              : null,
          matchCode:
            typeof item?.matchCode === "string" && item.matchCode.trim()
              ? item.matchCode.trim()
              : null,
        }))
      : [];

    const normalizedActivities = activities.filter(
      (item) => item.matchId && item.activityId,
    );

    const signature = buildActivitiesSignature(normalizedActivities);
    if (signature === lastSyncSignatureRef.current) return;

    try {
      const deviceId = await getOrCreatePushDeviceId();
      const appVersion = `${Application.nativeApplicationVersion ?? "0"}.${
        Application.nativeBuildVersion ?? "0"
      }`;

      await syncLiveActivities({
        deviceId,
        platform: "ios",
        appVersion,
        activities: normalizedActivities,
      }).unwrap();

      lastSyncSignatureRef.current = signature;
    } catch (error) {
      if (__DEV__) {
        console.warn("[MatchLiveActivity] sync registrations failed", error);
      }
    }
  }, [auth?._id, syncLiveActivities]);

  useEffect(() => {
    reconcile();
    void syncRemoteRegistrations();
  }, [reconcile, syncRemoteRegistrations]);

  useEffect(() => {
    if (Platform.OS !== "ios") return;

    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        reconcile();
        void syncRemoteRegistrations();
      }
    });

    return () => sub.remove();
  }, [reconcile, syncRemoteRegistrations]);

  useEffect(() => {
    if (Platform.OS !== "ios") return;

    const timer = setInterval(() => {
      void syncRemoteRegistrations();
    }, 15000);

    return () => clearInterval(timer);
  }, [syncRemoteRegistrations]);

  useEffect(() => {
    if (Platform.OS !== "ios" || auth?._id) return;
    lastSyncSignatureRef.current = null;
  }, [auth?._id]);

  return null;
}
