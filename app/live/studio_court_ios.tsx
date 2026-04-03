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

function buildNativeLiveStudioUrl({
  courtId,
  matchId,
  pageId,
}: {
  courtId?: string;
  matchId?: string;
  pageId?: string;
}) {
  const qs = buildQuery({ courtId, matchId, pageId });
  return qs ? `pickletour-live://stream?${qs}` : "pickletour-live://stream";
}

function buildIosLiveAuthHref(nativeUrl: string) {
  const authQuery = [
    `client_id=${encodeURIComponent("pickletour-live-app")}`,
    `redirect_uri=${encodeURIComponent("pickletour-live://auth")}`,
    `scope=${encodeURIComponent("live_app_access")}`,
  ].join("&");

  const continueUrl = `https://pickletour.vn/oauth/authorize?response_type=code&${authQuery}`;
  return `/live-auth?continueUrl=${encodeURIComponent(
    continueUrl,
  )}&targetUrl=${encodeURIComponent(nativeUrl)}&callbackUri=${encodeURIComponent(
    "pickletour-live://auth-init",
  )}`;
}

export default function StudioCourtIOSRedirectPage() {
  const params = useLocalSearchParams<{
    courtId?: string | string[];
    matchId?: string | string[];
    pageId?: string | string[];
  }>();

  const courtId = useMemo(() => normalizeParam(params.courtId), [params.courtId]);
  const matchId = useMemo(() => normalizeParam(params.matchId), [params.matchId]);
  const pageId = useMemo(() => normalizeParam(params.pageId), [params.pageId]);
  const nativeUrl = useMemo(
    () => buildNativeLiveStudioUrl({ courtId, matchId, pageId }),
    [courtId, matchId, pageId],
  );
  const fallbackHref = useMemo(() => buildIosLiveAuthHref(nativeUrl), [nativeUrl]);
  const [message, setMessage] = useState("Đang chuyển sang PickleTour Live...");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await Linking.openURL(nativeUrl);
      } catch {
        if (cancelled) return;
        setMessage("Không thấy app PickleTour Live, chuyển sang bước xác thực...");
        router.replace(fallbackHref);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fallbackHref, nativeUrl]);

  return (
    <View style={styles.page}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.card}>
        <Text style={styles.eyebrow}>PICKLETOUR LIVE</Text>
        <Text style={styles.title}>Mở app live riêng trên iPhone</Text>
        <Text style={styles.body}>
          Luồng iOS cũ trong app chính đã được thay bằng app độc lập
          PickleTour Live.
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
            Linking.openURL(nativeUrl).catch(() =>
              setError("Không mở được PickleTour Live."),
            )
          }
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>Mở PickleTour Live</Text>
        </Pressable>

        <Pressable
          onPress={() => router.replace(fallbackHref)}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>Xác thực bằng PickleTour</Text>
        </Pressable>
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
