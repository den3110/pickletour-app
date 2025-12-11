// app/match/[id]/home.tsx
import React, { useEffect, useMemo, useCallback } from "react";
import {
  ActivityIndicator,
  View,
  Text,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useColorScheme,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { skipToken } from "@reduxjs/toolkit/query";
import Toast from "react-native-toast-message";

import { useGetMatchPublicQuery } from "@/slices/tournamentsApiSlice";
import { useSocket } from "@/context/SocketContext";
import MatchContent from "@/components/match/MatchContent";

/* ---------- theme tokens ---------- */
function useThemeTokens() {
  const scheme = useColorScheme() ?? "light";
  const dark = scheme === "dark";
  return {
    scheme,
    bg: dark ? "#0b0d10" : "#f6f8fc",
    cardBg: dark ? "#111214" : "#ffffff",
    border: dark ? "#2a2f36" : "#cbd5e1",
    text: dark ? "#e5e7eb" : "#0f172a",
    subtext: dark ? "#cbd5e1" : "#64748b",
    tint: dark ? "#7cc0ff" : "#0a84ff",
    errBg: dark ? "rgba(239,68,68,0.12)" : "#fee2e2",
    errBd: dark ? "#fca5a5" : "#fecaca",
    errText: dark ? "#fecaca" : "#b91c1c",
  };
}

/* ---------- helpers: derive title ---------- */
function pickCode(m: any): string | null {
  const tryStrings = [
    m?.displayCode,
    m?.displayName,
    m?.matchCode,
    m?.code,
    m?.label,
    m?.slotCode,
    m?.bracketCode,
    m?.bracketLabel,
    m?.meta?.code,
    m?.meta?.label,
  ];
  for (const s of tryStrings) {
    if (typeof s === "string" && s.trim()) return s.trim();
  }
  return null;
}
function preferName(p: any) {
  return (
    (p?.nickname && String(p.nickname).trim()) ||
    (p?.name && String(p.name).trim()) ||
    (p?.nickname && String(p.nickname).trim()) ||
    ""
  );
}
function buildVsTitle(m: any): string {
  if (!m) return "Chi tiết trận";
  const code = pickCode(m);
  const a = m?.pairA
    ? [m?.pairA?.player1, m?.pairA?.player2]
        .filter(Boolean)
        .map(preferName)
        .join(" & ")
    : "";
  const b = m?.pairB
    ? [m?.pairB?.player1, m?.pairB?.player2]
        .filter(Boolean)
        .map(preferName)
        .join(" & ")
    : "";
  if (a || b) {
    const vs = [a || "Đội A", b || "Đội B"].join(" vs ");
    return code ? `${code} • ${vs}` : vs;
  }
  return code || "Chi tiết trận";
}

/* ---------- page ---------- */
export default function MatchHomePage() {
  const { id, isBack } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const T = useThemeTokens();
  const matchId = id ? String(id) : "";

  const { data, isLoading, isFetching, refetch, error } =
    useGetMatchPublicQuery(matchId ? matchId : (skipToken as any));

  // Chuẩn hoá object trận từ API
  const match = useMemo(() => data ?? null, [data]);
  const title = useMemo(() => buildVsTitle(match), [match]);

  // Refresh thủ công
  const onRefresh = useCallback(async () => {
    try {
      await refetch().unwrap();
      Toast.show({ type: "success", text1: "Đã làm mới dữ liệu trận" });
    } catch (e: any) {
      const msg = e?.data?.message || e?.message || "Không làm mới được";
      Toast.show({ type: "error", text1: "Lỗi", text2: msg });
    }
  }, [refetch]);

  // Báo lỗi tải
  useEffect(() => {
    if (error) {
      const msg =
        (error as any)?.data?.message ||
        (error as any)?.error ||
        "Không tải được dữ liệu trận";
      Toast.show({ type: "error", text1: "Lỗi", text2: msg });
    }
  }, [error]);

  /* ---------- socket realtime (giống RefereeJudgePanel) ---------- */
  const socket = useSocket();
  useEffect(() => {
    if (!socket || !matchId) return;

    const handlePatchedEvent = (p: any) => {
      const idGot =
        p?.matchId || p?.data?._id || p?._id || p?.match?.id || p?.match?._id;
      if (String(idGot || "") === String(matchId)) {
        refetch();
      }
    };

    socket.emit("match:join", { matchId });
    socket.on("status:updated", handlePatchedEvent);
    socket.on("score:updated", handlePatchedEvent);
    socket.on("winner:updated", handlePatchedEvent);
    socket.on("match:patched", handlePatchedEvent);
    socket.on("match:snapshot", handlePatchedEvent);

    return () => {
      socket.emit("match:leave", { matchId });
      socket.off("status:updated", handlePatchedEvent);
      socket.off("score:updated", handlePatchedEvent);
      socket.off("winner:updated", handlePatchedEvent);
      socket.off("match:patched", handlePatchedEvent);
      socket.off("match:snapshot", handlePatchedEvent);
    };
  }, [socket, matchId, refetch]);

  return (
    <>
      <Stack.Screen
        options={{
          title,
          headerBackVisible: false,
          headerStyle: { backgroundColor: T.cardBg },
          headerTitleStyle: { color: T.text },
          headerTintColor: T.text,
          headerLeft: () => (
            <Pressable
              onPress={() => {
                if (isBack) {
                  router.back();
                } else {
                  router.replace("/(tabs)");
                }
              }}
              hitSlop={12}
              style={{ paddingHorizontal: 6, paddingVertical: 4 }}
            >
              <Ionicons name="chevron-back" size={22} color={T.text} />
            </Pressable>
          ),
          headerRight: () => (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Pressable
                onPress={onRefresh}
                hitSlop={12}
                style={{ paddingHorizontal: 6, paddingVertical: 4 }}
              >
                <MaterialIcons name="refresh" size={22} color={T.text} />
              </Pressable>
            </View>
          ),
        }}
      />

      {!id ? (
        <View
          style={[
            styles.center,
            { paddingTop: insets.top + 24, backgroundColor: T.bg },
          ]}
        >
          <Text style={[styles.err, { color: T.errText }]}>
            Thiếu tham số id của trận.
          </Text>
        </View>
      ) : isLoading && !match ? (
        <ScrollView
          style={{ backgroundColor: T.bg }}
          contentContainerStyle={[
            styles.center,
            { paddingTop: insets.top + 24 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={isFetching}
              onRefresh={onRefresh}
              colors={[T.tint]} // Android
              tintColor={T.tint} // iOS
              progressBackgroundColor={T.cardBg}
            />
          }
        >
          <ActivityIndicator color={T.tint} />
          <Text style={{ marginTop: 8, color: T.subtext }}>Đang tải…</Text>
        </ScrollView>
      ) : !match ? (
        <ScrollView
          style={{ backgroundColor: T.bg }}
          contentContainerStyle={[
            styles.center,
            { paddingTop: insets.top + 24 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={isFetching}
              onRefresh={onRefresh}
              colors={[T.tint]}
              tintColor={T.tint}
              progressBackgroundColor={T.cardBg}
            />
          }
        >
          <Text style={[styles.err, { color: T.errText }]}>
            Không tìm thấy dữ liệu trận.
          </Text>
          <Pressable
            onPress={onRefresh}
            style={[
              styles.retry,
              { borderColor: T.border, backgroundColor: T.cardBg },
            ]}
          >
            <MaterialIcons name="refresh" size={18} color={T.text} />
            <Text style={[styles.retryText, { color: T.text }]}>Thử lại</Text>
          </Pressable>
        </ScrollView>
      ) : (
        <View style={{ flex: 1, backgroundColor: T.bg }}>
          <MatchContent
            m={match}
            isLoading={isLoading}
            liveLoading={isFetching}
            onSaved={onRefresh}
          />
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    gap: 8,
  },
  err: { fontWeight: "600" },
  retry: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 8,
    marginTop: 6,
  },
  retryText: { fontWeight: "600" },
});
