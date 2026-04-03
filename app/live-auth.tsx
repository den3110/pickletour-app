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
import { useSelector } from "react-redux";

import { useIssueOsAuthTokenMutation } from "@/slices/usersApiSlice";

function normalizeParam(value: string | string[] | undefined, fallback = "") {
  if (Array.isArray(value)) {
    return String(value[0] || fallback).trim();
  }
  return String(value || fallback).trim();
}

function appendQuery(url: string, key: string, value: string) {
  try {
    const joiner = url.includes("?") ? "&" : "?";
    return `${url}${joiner}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  } catch {
    return url;
  }
}

export default function LiveAuthScreen() {
  const params = useLocalSearchParams<{
    continueUrl?: string | string[];
    targetUrl?: string | string[];
    callbackUri?: string | string[];
  }>();

  const continueUrl = useMemo(
    () => normalizeParam(params.continueUrl),
    [params.continueUrl],
  );
  const targetUrl = useMemo(
    () => normalizeParam(params.targetUrl),
    [params.targetUrl],
  );
  const callbackUri = useMemo(
    () => normalizeParam(params.callbackUri, "pickletour-live://auth-init"),
    [params.callbackUri],
  );

  const userInfo = useSelector((state: any) => state.auth?.userInfo);
  const [issueOsAuthToken, { isLoading }] = useIssueOsAuthTokenMutation();
  const [message, setMessage] = useState(
    "Đang chuẩn bị xác thực PickleTour Live...",
  );
  const [error, setError] = useState("");

  const returnTo = useMemo(() => {
    if (!continueUrl) return "/login";

    const nextParams = new URLSearchParams();
    nextParams.set("continueUrl", continueUrl);
    nextParams.set("callbackUri", callbackUri);
    if (targetUrl) {
      nextParams.set("targetUrl", targetUrl);
    }
    return `/live-auth?${nextParams.toString()}`;
  }, [callbackUri, continueUrl, targetUrl]);

  const openWebFallback = async (fallbackMessage?: string) => {
    if (!continueUrl) {
      setError("Không thể mở luồng xác thực web.");
      return;
    }

    if (fallbackMessage) {
      setMessage(fallbackMessage);
    }

    try {
      await Linking.openURL(continueUrl);
    } catch {
      setError("Không thể mở luồng xác thực web.");
    }
  };

  useEffect(() => {
    if (!continueUrl) {
      setError("Thiếu yêu cầu xác thực từ PickleTour Live.");
      return;
    }

    if (!userInfo?.token) {
      router.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setMessage("Đang lấy phiên xác thực PickleTour...");
        const res = await issueOsAuthToken().unwrap();
        const osAuthToken = String(res?.osAuthToken || "").trim();
        if (!osAuthToken) {
          throw new Error("Không lấy được phiên xác thực PickleTour.");
        }

        let callbackUrl = appendQuery(callbackUri, "osAuthToken", osAuthToken);
        if (targetUrl) {
          callbackUrl = appendQuery(callbackUrl, "targetUrl", targetUrl);
        }
        if (continueUrl) {
          callbackUrl = appendQuery(callbackUrl, "continueUrl", continueUrl);
        }

        if (cancelled) return;

        setMessage("Đang quay lại PickleTour Live...");
        try {
          await Linking.openURL(callbackUrl);
        } catch {
          if (cancelled) return;
          await openWebFallback(
            "Không mở lại được PickleTour Live. Chuyển sang xác thực web...",
          );
        }
      } catch (e: any) {
        if (cancelled) return;
        setError(
          String(
            e?.data?.message ||
              e?.message ||
              "Không thể chuyển phiên đăng nhập sang PickleTour Live.",
          ),
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [callbackUri, continueUrl, issueOsAuthToken, returnTo, targetUrl, userInfo?.token]);

  return (
    <View style={styles.page}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.card}>
        <Text style={styles.eyebrow}>PICKLETOUR</Text>
        <Text style={styles.title}>Tiếp tục với PickleTour</Text>
        <Text style={styles.body}>
          Dùng phiên đăng nhập hiện tại của PickleTour để cấp quyền cho
          PickleTour Live.
        </Text>

        {error ? (
          <View style={styles.alert}>
            <Text style={styles.alertText}>{error}</Text>
          </View>
        ) : (
          <View style={styles.progressRow}>
            <ActivityIndicator color="#25c2a0" />
            <Text style={styles.body}>
              {isLoading ? "Đang xác thực..." : message}
            </Text>
          </View>
        )}

        <Pressable onPress={() => openWebFallback()} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Mở web thay thế</Text>
        </Pressable>

        <Pressable onPress={() => router.replace("/(tabs)")} style={styles.ghostButton}>
          <Text style={styles.ghostButtonText}>Quay lại PickleTour</Text>
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
  secondaryButton: {
    height: 52,
    borderRadius: 999,
    backgroundColor: "#25c2a0",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    color: "#04110b",
    fontWeight: "800",
    fontSize: 15,
  },
  ghostButton: {
    height: 48,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  ghostButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
});
