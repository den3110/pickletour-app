// app/(app)/admin/match/[id]/referee.jsx
import React, { useMemo, useCallback } from "react";
import {
  ActivityIndicator,
  View,
  Text,
  StyleSheet,
  ScrollView,
} from "react-native";
import { Stack, useLocalSearchParams, router } from "expo-router";
import { useSelector } from "react-redux";
import { MaterialIcons } from "@expo/vector-icons";
import Ripple from "react-native-material-ripple";

import { useGetMatchQuery } from "@/slices/tournamentsApiSlice";
import ResponsiveMatchViewer from "@/components/match/ResponsiveMatchViewer";
import RefereeJudgePanel from "@/components/match/RefereeScorePanel.native";
import { SafeAreaView } from "react-native-safe-area-context";

/* ---------- helpers ---------- */
const textOf = (v) => {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
    return String(v);
  if (typeof v === "object")
    return v.name || v.label || v.title || v.message || v.error || "";
  return "";
};

const extractRefereeIds = (m) => {
  if (!m) return [];
  const raw = m.referees ?? m.referee ?? m.judges ?? [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr
    .map((r) => String(r?.user?._id ?? r?.user ?? r?._id ?? r?.id ?? (r || "")))
    .filter(Boolean);
};

const isMeAdmin = (me) =>
  !!(me?.isAdmin || me?.role === "admin" || me?.roles?.includes?.("admin"));

const isMeManagerOfTournament = (me, match) => {
  if (!me?._id || !match?.tournament) return false;
  const t = match.tournament;
  if (String(t.createdBy) === String(me._id)) return true;
  if (Array.isArray(t.managers)) {
    return t.managers.some((m) => String(m?.user ?? m) === String(me._id));
  }
  return !!t?.isManager;
};

const isMeRefereeOfMatch = (me, match) => {
  if (!me?._id || !match) return false;
  const myId = String(me._id);
  return extractRefereeIds(match).includes(myId);
};

/* ---------- small header btn ---------- */
function HeaderRefresh({ isFetching, onPress }) {
  return (
    <Ripple onPress={onPress} style={st.iconBtn}>
      {isFetching ? (
        <ActivityIndicator size="small" />
      ) : (
        <MaterialIcons name="refresh" size={20} color="#111827" />
      )}
    </Ripple>
  );
}

/* ---------- page ---------- */
export default function RefereeScreen() {
  const params = useLocalSearchParams();
  // đảm bảo luôn là string ổn định
  const matchId = useMemo(() => String(params?.id ?? ""), [params?.id]);

  const me = useSelector((s) => s.auth?.userInfo || null);

  const {
    data: match,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useGetMatchQuery(matchId, {
    skip: !matchId,
    refetchOnFocus: false,
    refetchOnReconnect: false,
    pollingInterval: 0,
  });

  const canControl = useMemo(() => {
    if (!me || !match) return false;
    return (
      isMeAdmin(me) ||
      isMeManagerOfTournament(me, match) ||
      isMeRefereeOfMatch(me, match)
    );
  }, [me, match]);

  const title = useMemo(
    () =>
      (match?.code && `Trọng tài: ${match.code}`) ||
      `Trọng tài #${matchId.slice(-6)}`,
    [match?.code, matchId]
  );

  const handleRefetch = useCallback(() => refetch(), [refetch]);

  /* ---------- guards ---------- */
  if (isLoading && !match) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={st.center}>
          <ActivityIndicator />
        </View>
      </>
    );
  }
  if (error) {
    return (
      <>
        <View style={[st.card, st.cardError]}>
          <Text style={st.errorText}>
            {textOf(error?.data?.message) ||
              textOf(error?.error) ||
              "Lỗi tải trận"}
          </Text>
          <View style={{ height: 8 }} />
          <Ripple onPress={handleRefetch} style={st.btnOutline}>
            <MaterialIcons name="refresh" size={16} color="#111827" />
            <Text style={st.btnOutlineText}>Thử lại</Text>
          </Ripple>
        </View>
      </>
    );
  }
  if (!match) return null;

  return (
    <>
      <Stack.Screen
        options={{
          title,
          headerTitleAlign: "center",
          headerRight: () => (
            <HeaderRefresh isFetching={isFetching} onPress={handleRefetch} />
          ),
        }}
      />

      <View style={st.screen}>
        {/* Banner nếu không có quyền điều khiển */}
        {!canControl && (
          <View style={[st.card, st.cardWarn]}>
            <MaterialIcons name="visibility" size={18} color="#92400e" />
            <Text style={[st.warnText, { marginLeft: 6 }]}>
              Bạn không phải trọng tài/admin của trận này. Hiển thị chế độ xem.
            </Text>
          </View>
        )}

        {/* Khu vực trọng tài / Viewer */}
        {canControl ? (
          // ❗ KHÔNG truyền inline onPatched để tránh effect loop ở child
          <ScrollView style={{ flex: 1 }}>
            <RefereeJudgePanel matchId={matchId} />
            <View style={{ marginBottom: 20 }}></View>
          </ScrollView>
        ) : (
          <ScrollView style={{ flex: 1 }}>
            <RefereeJudgePanel matchId={matchId} />
            <View style={{ marginBottom: 20 }}></View>
          </ScrollView>
        )}
      </View>
    </>
  );
}

/* ---------- styles ---------- */
const st = StyleSheet.create({
  screen: { flex: 1, padding: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 12,
  },
  cardWarn: {
    backgroundColor: "#fffbeb",
    borderColor: "#fef3c7",
    flexDirection: "row",
    alignItems: "center",
  },
  warnText: { color: "#92400e", fontWeight: "700" },

  cardError: {
    margin: 16,
    backgroundColor: "#fee2e2",
    borderColor: "#fecaca",
    alignItems: "center",
  },
  errorText: { color: "#111827", textAlign: "center" },

  btnOutline: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff",
  },
  btnOutlineText: { color: "#111827", fontWeight: "700" },

  iconBtn: { padding: 6, borderRadius: 8, backgroundColor: "#f8fafc" },
});
