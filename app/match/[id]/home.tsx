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
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { skipToken } from "@reduxjs/toolkit/query";
import Toast from "react-native-toast-message";

import { useGetMatchPublicQuery } from "@/slices/tournamentsApiSlice";
import { useSocket } from "@/context/SocketContext";
import MatchContent from "@/components/match/MatchContent";

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
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
          headerLeft: () => (
            <Pressable
              onPress={() => router.replace("/(tabs)")}
              hitSlop={12}
              style={{ paddingHorizontal: 6, paddingVertical: 4 }}
            >
              <MaterialIcons name="arrow-back" size={22} color="#0f172a" />
            </Pressable>
          ),
          headerRight: () => (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Pressable
                onPress={onRefresh}
                hitSlop={12}
                style={{ paddingHorizontal: 6, paddingVertical: 4 }}
              >
                <MaterialIcons name="refresh" size={22} color="#0f172a" />
              </Pressable>
            </View>
          ),
        }}
      />

      {!id ? (
        <View style={[styles.center, { paddingTop: insets.top + 24 }]}>
          <Text style={styles.err}>Thiếu tham số id của trận.</Text>
        </View>
      ) : isLoading && !match ? (
        <ScrollView
          contentContainerStyle={[
            styles.center,
            { paddingTop: insets.top + 24 },
          ]}
          refreshControl={
            <RefreshControl refreshing={isFetching} onRefresh={onRefresh} />
          }
        >
          <ActivityIndicator />
          <Text style={{ marginTop: 8, color: "#64748b" }}>Đang tải…</Text>
        </ScrollView>
      ) : !match ? (
        <ScrollView
          contentContainerStyle={[
            styles.center,
            { paddingTop: insets.top + 24 },
          ]}
          refreshControl={
            <RefreshControl refreshing={isFetching} onRefresh={onRefresh} />
          }
        >
          <Text style={styles.err}>Không tìm thấy dữ liệu trận.</Text>
          <Pressable onPress={onRefresh} style={styles.retry}>
            <MaterialIcons name="refresh" size={18} color="#0f172a" />
            <Text style={styles.retryText}>Thử lại</Text>
          </Pressable>
        </ScrollView>
      ) : (
        <MatchContent
          m={match}
          isLoading={isLoading}
          liveLoading={isFetching}
          onSaved={onRefresh}
        />
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
  err: { color: "#b91c1c", fontWeight: "600" },
  retry: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    marginTop: 6,
    backgroundColor: "#fff",
  },
  retryText: { color: "#0f172a", fontWeight: "600" },
});
