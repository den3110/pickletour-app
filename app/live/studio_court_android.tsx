import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";

import { useGetContactContentQuery } from "@/slices/cmsApiSlice";

function normalizeParam(value: string | string[] | undefined, fallback = "") {
  if (Array.isArray(value)) {
    return String(value[0] || fallback).trim();
  }
  return String(value || fallback).trim();
}

function buildQuery(obj: Record<string, string | null | undefined>) {
  return Object.entries(obj)
    .filter(([, value]) => value && String(value).trim() !== "")
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
    )
    .join("&");
}

function buildLiveStudioUrl({
  tournamentId,
  bracketId,
  courtId,
  matchId,
  pageId,
}: {
  tournamentId?: string;
  bracketId?: string;
  courtId?: string;
  matchId?: string;
  pageId?: string;
}) {
  const qs = buildQuery({ tournamentId, bracketId, courtId, matchId, pageId });
  return qs ? `pickletour-live://stream?${qs}` : "pickletour-live://stream";
}

function buildLiveAuthHref(liveAppUrl: string) {
  const authQuery = [
    `client_id=${encodeURIComponent("pickletour-live-app")}`,
    `redirect_uri=${encodeURIComponent("pickletour-live://auth")}`,
    `scope=${encodeURIComponent("live_app_access")}`,
  ].join("&");

  const continueUrl = `https://pickletour.vn/api/api/oauth/authorize?response_type=code&${authQuery}`;
  return `/live-auth?continueUrl=${encodeURIComponent(
    continueUrl,
  )}&targetUrl=${encodeURIComponent(liveAppUrl)}&callbackUri=${encodeURIComponent(
    "pickletour-live://auth-init",
  )}`;
}

function resolveLiveAppStoreUrl(contactContent: any) {
  const apps = contactContent?.apps || {};
  return (
    String(apps?.liveAppApk || "").trim() ||
    String(apps?.playStore || "").trim() ||
    String(apps?.apkPickleTour || "").trim() ||
    ""
  );
}

export default function StudioCourtAndroidRedirectPage() {
  const params = useLocalSearchParams<{
    tid?: string | string[];
    tournamentId?: string | string[];
    bracketId?: string | string[];
    courtId?: string | string[];
    matchId?: string | string[];
    pageId?: string | string[];
  }>();
  const { data: contactContent } = useGetContactContentQuery();

  const tournamentId = useMemo(
    () => normalizeParam(params.tid || params.tournamentId),
    [params.tid, params.tournamentId],
  );
  const bracketId = useMemo(
    () => normalizeParam(params.bracketId),
    [params.bracketId],
  );
  const courtId = useMemo(() => normalizeParam(params.courtId), [params.courtId]);
  const matchId = useMemo(() => normalizeParam(params.matchId), [params.matchId]);
  const pageId = useMemo(() => normalizeParam(params.pageId), [params.pageId]);
  const liveAppUrl = useMemo(
    () => buildLiveStudioUrl({ tournamentId, bracketId, courtId, matchId, pageId }),
    [bracketId, courtId, matchId, pageId, tournamentId],
  );
  const authHref = useMemo(() => buildLiveAuthHref(liveAppUrl), [liveAppUrl]);
  const storeUrl = useMemo(
    () => resolveLiveAppStoreUrl(contactContent),
    [contactContent],
  );

  const [message, setMessage] = useState("Đang mở PickleTour Live...");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const openLiveApp = async () => {
      try {
        setError("");
        setMessage("Đang mở PickleTour Live...");
        await Linking.openURL(liveAppUrl);
        if (!cancelled) setMessage("Đã gửi yêu cầu mở PickleTour Live.");
      } catch {
        if (!cancelled) {
          setMessage("Không thấy app PickleTour Live trên thiết bị này.");
          setError("Bạn có thể xác thực lại hoặc mở trang cài app live riêng.");
        }
      }
    };

    openLiveApp();

    return () => {
      cancelled = true;
    };
  }, [liveAppUrl]);

  return (
    <View style={styles.page}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.card}>
        <Text style={styles.eyebrow}>PICKLETOUR LIVE</Text>
        <Text style={styles.title}>Mở app live riêng</Text>
        <Text style={styles.body}>
          PickleTour sẽ chuyển sân hoặc trận hiện tại sang app PickleTour Live
          để vận hành phát video.
        </Text>

        {error ? (
          <View style={styles.alert}>
            <Text style={styles.alertText}>{error}</Text>
          </View>
        ) : (
          <View style={styles.progressRow}>
            <ActivityIndicator color="#25c2a0" />
            <Text style={styles.body}>{message}</Text>
          </View>
        )}

        <Pressable
          onPress={() =>
            Linking.openURL(liveAppUrl).catch(() =>
              setError("Không mở được PickleTour Live."),
            )
          }
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>Mở PickleTour Live</Text>
        </Pressable>

        <Pressable
          onPress={() => router.replace(authHref)}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>Xác thực bằng PickleTour</Text>
        </Pressable>

        {!!storeUrl && (
          <Pressable
            onPress={() =>
              Linking.openURL(storeUrl).catch(() =>
                setError("Không mở được trang cài PickleTour Live."),
              )
            }
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>Cài PickleTour Live</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#071018",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 28,
    backgroundColor: "#101820",
    padding: 24,
    gap: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  eyebrow: {
    color: "#7cc0ff",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  title: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "800",
  },
  body: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 15,
    lineHeight: 22,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  alert: {
    borderRadius: 18,
    backgroundColor: "rgba(255,107,107,0.14)",
    padding: 14,
  },
  alertText: {
    color: "#ff8b8b",
    fontSize: 14,
    lineHeight: 20,
  },
  primaryButton: {
    height: 52,
    borderRadius: 999,
    backgroundColor: "#25c2a0",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#04110b",
    fontWeight: "800",
    fontSize: 15,
  },
  secondaryButton: {
    height: 48,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
});
