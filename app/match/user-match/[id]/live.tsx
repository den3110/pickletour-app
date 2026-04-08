import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@react-navigation/native";
import { useSelector } from "react-redux";

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

function buildNativeUserMatchLiveUrl(matchId: string, accessToken: string) {
  const qs = buildQuery({
    matchId,
    launchMode: "user_match",
    accessToken,
  });
  return qs ? `pickletour-live://stream?${qs}` : "pickletour-live://stream";
}

function resolveLiveAppStoreUrl(contactContent: any) {
  const apps = contactContent?.apps || {};
  if (Platform.OS === "android") {
    return (
      String(apps?.liveAppApk || "").trim() ||
      String(apps?.playStore || "").trim() ||
      String(apps?.apkPickleTour || "").trim() ||
      ""
    );
  }
  return String(apps?.liveAppIos || "").trim() || String(apps?.appStore || "").trim() || "";
}

export default function UserMatchLiveLauncher() {
  const theme = useTheme();
  const params = useLocalSearchParams<{
    id?: string | string[];
  }>();
  const { data: contactContent } = useGetContactContentQuery();
  const userInfo = useSelector((state: any) => state.auth?.userInfo || null);

  const matchId = useMemo(() => normalizeParam(params.id), [params.id]);
  const accessToken = useMemo(
    () => String(userInfo?.token || "").trim(),
    [userInfo?.token],
  );
  const storeUrl = useMemo(
    () => resolveLiveAppStoreUrl(contactContent),
    [contactContent],
  );
  const nativeUrl = useMemo(
    () => buildNativeUserMatchLiveUrl(matchId, accessToken),
    [accessToken, matchId],
  );

  const [message, setMessage] = useState("Đang mở PickleTour Live...");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!matchId) {
        setError("Thiếu matchId để mở live.");
        return;
      }

      if (!accessToken) {
        setError("Bạn cần đăng nhập PickleTour trước khi mở app live.");
        return;
      }

      try {
        setError("");
        setMessage("Đang mở PickleTour Live...");
        await Linking.openURL(nativeUrl);
        if (cancelled) return;
        setMessage("Đã gửi yêu cầu mở PickleTour Live.");
      } catch {
        if (cancelled) return;
        if (storeUrl) {
          try {
            setMessage("Không thấy app, đang chuyển sang trang cài PickleTour Live...");
            await Linking.openURL(storeUrl);
            if (cancelled) return;
            setMessage("Đã mở trang cài PickleTour Live.");
            return;
          } catch {
            if (cancelled) return;
          }
        }
        setError("Thiết bị chưa cài PickleTour Live hoặc không mở được app.");
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [accessToken, matchId, nativeUrl, storeUrl]);

  const textColor = theme.colors?.text ?? "#111827";
  const cardColor = theme.colors?.card ?? "#ffffff";
  const borderColor = theme.colors?.border ?? "#dbe2ea";
  const primaryColor = theme.colors?.primary ?? "#2563EB";
  const mutedColor = theme.dark ? "#94a3b8" : "#64748b";
  const bgColor = theme.dark ? "#020617" : "#f8fafc";
  const softColor = theme.dark ? "#111827" : "#eef2ff";
  const dangerBg = theme.dark ? "rgba(248,113,113,0.16)" : "#fef2f2";
  const dangerText = theme.dark ? "#fca5a5" : "#b91c1c";

  return (
    <SafeAreaView style={[styles.page, { backgroundColor: bgColor }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View
        style={[
          styles.card,
          {
            backgroundColor: cardColor,
            borderColor,
          },
        ]}
      >
        <View style={[styles.badge, { backgroundColor: softColor }]}>
          <Text style={[styles.badgeText, { color: primaryColor }]}>
            PICKLETOUR LIVE
          </Text>
        </View>

        <Text style={[styles.title, { color: textColor }]}>
          Mở app live riêng cho trận này
        </Text>
        <Text style={[styles.body, { color: mutedColor }]}>
          PickleTour sẽ chuyển trận đấu hiện tại sang app PickleTour Live để phát
          video bằng camera native.
        </Text>

        {error ? (
          <View style={[styles.alert, { backgroundColor: dangerBg }]}>
            <Text style={[styles.alertText, { color: dangerText }]}>{error}</Text>
          </View>
        ) : (
          <View style={styles.progressRow}>
            <ActivityIndicator color={primaryColor} />
            <Text style={[styles.body, { color: mutedColor, flex: 1 }]}>
              {message}
            </Text>
          </View>
        )}

        <View style={styles.actions}>
          <Pressable
            onPress={() => {
              setError("");
              Linking.openURL(nativeUrl).catch(() => {
                setError("Không mở được PickleTour Live.");
              });
            }}
            style={[styles.primaryButton, { backgroundColor: primaryColor }]}
          >
            <Ionicons name="radio" size={18} color="#fff" />
            <Text style={styles.primaryButtonText}>Mở PickleTour Live</Text>
          </Pressable>

          {!!storeUrl && (
            <Pressable
              onPress={() => {
                Linking.openURL(storeUrl).catch(() => {
                  setError("Không mở được trang cài PickleTour Live.");
                });
              }}
              style={[styles.secondaryButton, { borderColor }]}
            >
              <Text style={[styles.secondaryButtonText, { color: textColor }]}>
                Cài PickleTour Live
              </Text>
            </Pressable>
          )}

          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={[styles.backButtonText, { color: mutedColor }]}>
              Quay lại
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  card: {
    borderRadius: 28,
    borderWidth: 1,
    padding: 24,
    gap: 18,
  },
  badge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    lineHeight: 34,
  },
  body: {
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
    padding: 14,
  },
  alertText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  actions: {
    gap: 12,
  },
  primaryButton: {
    height: 52,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
  },
  secondaryButton: {
    height: 48,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: "700",
  },
  backButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 4,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: "700",
  },
});
