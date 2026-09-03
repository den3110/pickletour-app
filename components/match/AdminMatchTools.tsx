/* eslint-disable react/prop-types */
// AdminMatchTools.tsx
// Bộ công cụ quản trị trận nâng cao trên mobile — parity với web MatchContent:
//   • Chỉnh đội A/B (chọn registration / BYE / đội thắng từ trận khác / swap)
//   • Gán sân (court station theo cụm sân của giải, assign/free/force)
//   • Gán trọng tài (list trọng tài giải + checkbox, batch update)
//   • Cài đặt trận (BO / điểm chạm / cách 2 / cap / timeout)
// Chỉ render khi canManage (admin/manager) — caller tự gate.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Switch,
  useColorScheme,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { TextInput } from "@/components/ui/i18nTextInput";
import { Text } from "@/components/ui/i18nText";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import { skipToken } from "@reduxjs/toolkit/query";

import {
  useAdminPatchMatchMutation,
  useUpdateMatchSettingsMutation,
  useAdminSwapMatchTeamsMutation,
} from "@/slices/matchesApiSlice";
import {
  useListTournamentRefereesQuery,
  useBatchAssignRefereeMutation,
} from "@/slices/refereeScopeApiSlice";
import {
  useSearchRegistrationsQuery,
  useAdminGetMatchRefereesQuery,
  useListTournamentMatchesQuery,
} from "@/slices/tournamentsApiSlice";
import {
  useGetTournamentCourtClusterOptionsQuery,
  useGetTournamentCourtClusterRuntimeQuery,
  useAssignTournamentMatchToCourtStationMutation,
  useFreeTournamentCourtStationMutation,
} from "@/slices/courtClustersAdminApiSlice";

/* ================= theme (mirror MatchContent tokens) ================= */
function useTokens() {
  const scheme = useColorScheme() ?? "light";
  const isDark = scheme === "dark";
  return useMemo(
    () => ({
      isDark,
      tint: isDark ? "#60a5fa" : "#2563eb",
      textPrimary: isDark ? "#f8fafc" : "#1e293b",
      textSecondary: isDark ? "#94a3b8" : "#64748b",
      pageBg: isDark ? "#0f172a" : "#f8fafc",
      cardBg: isDark ? "#1e293b" : "#ffffff",
      cardBorder: isDark ? "#334155" : "#e2e8f0",
      softBg: isDark ? "#334155" : "#f1f5f9",
      inputBg: isDark ? "#0f172a" : "#fff",
      success: isDark ? "#4ade80" : "#166534",
      successBg: isDark ? "rgba(34,197,94,0.15)" : "#dcfce7",
      warn: isDark ? "#fbbf24" : "#b45309",
      warnBg: isDark ? "rgba(245,158,11,0.15)" : "#fef3c7",
      danger: isDark ? "#f87171" : "#991b1b",
      dangerBg: isDark ? "rgba(239,68,68,0.15)" : "#fee2e2",
    }),
    [isDark],
  );
}

/* ================= small helpers ================= */
const sid = (x: any): string => {
  if (!x) return "";
  const v = x?._id ?? x?.id ?? x;
  return v ? String(v) : "";
};
const personLabel = (p: any): string =>
  p?.nickname || p?.nickName || p?.displayName || p?.fullName || p?.name || "?";
const pairLabelOf = (pair: any, isSingle?: boolean): string => {
  if (!pair) return "";
  if (pair.__bye) return "BYE (miễn đấu)";
  const p1 = personLabel(pair?.player1);
  const p2 = personLabel(pair?.player2);
  if (isSingle || !pair?.player2) return p1;
  return `${p1} / ${p2}`;
};
const matchCodeLabel = (m: any): string => {
  const direct =
    m?.displayCode || m?.code || m?.matchCode || m?.slotCode || m?.labelKey;
  if (direct) return String(direct);
  const r = Number(m?.round || 1);
  const t = Number(m?.order || 0) + 1;
  return `V${r}-T${t}`;
};
const seedLabelOf = (seed: any): string =>
  seed?.label || (seed?.type === "bye" ? "BYE" : "") || "";

const BYE_OPTION = { _id: "__BYE__", __bye: true } as const;

/* ================= shared UI bits ================= */
function ToolBtn({
  icon,
  label,
  onPress,
  disabled,
  T,
  warn,
}: {
  icon: any;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  T: ReturnType<typeof useTokens>;
  warn?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        st.toolBtn,
        {
          backgroundColor: warn ? T.warnBg : T.softBg,
          borderColor: T.cardBorder,
          opacity: disabled ? 0.5 : pressed ? 0.75 : 1,
        },
      ]}
    >
      <MaterialIcons name={icon} size={17} color={warn ? T.warn : T.tint} />
      <Text
        style={{
          fontWeight: "700",
          fontSize: 13,
          color: warn ? T.warn : T.textPrimary,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SheetShell({
  visible,
  title,
  onClose,
  children,
  footer,
  T,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  T: ReturnType<typeof useTokens>;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={st.sheetBackdrop}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <SafeAreaView
          edges={["bottom"]}
          style={[
            st.sheetBody,
            { backgroundColor: T.pageBg, borderColor: T.cardBorder },
          ]}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            keyboardVerticalOffset={40}
          >
            <View style={[st.sheetHandleWrap]}>
              <View style={[st.sheetHandle, { backgroundColor: T.cardBorder }]} />
            </View>
            <View style={st.sheetHeader}>
              <Text
                style={{ fontSize: 16, fontWeight: "800", color: T.textPrimary }}
              >
                {title}
              </Text>
              <Pressable onPress={onClose} hitSlop={10}>
                <MaterialIcons name="close" size={22} color={T.textSecondary} />
              </Pressable>
            </View>
            <View style={{ maxHeight: 520 }}>{children}</View>
            {footer ? <View style={st.sheetFooter}>{footer}</View> : null}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function PrimaryBtn({
  label,
  onPress,
  disabled,
  loading,
  T,
  danger,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  T: ReturnType<typeof useTokens>;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        st.primaryBtn,
        {
          backgroundColor: danger ? "#dc2626" : T.tint,
          opacity: disabled || loading ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

function SearchInput({
  value,
  onChangeText,
  placeholder,
  T,
}: {
  value: string;
  onChangeText: (s: string) => void;
  placeholder: string;
  T: ReturnType<typeof useTokens>;
}) {
  return (
    <View
      style={[
        st.searchWrap,
        { backgroundColor: T.inputBg, borderColor: T.cardBorder },
      ]}
    >
      <MaterialIcons name="search" size={18} color={T.textSecondary} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={T.textSecondary}
        style={{ flex: 1, color: T.textPrimary, fontSize: 14, padding: 0 }}
        autoCapitalize="none"
      />
    </View>
  );
}

function useDebounced(value: string, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/* =====================================================================
 * 1) GÁN TRỌNG TÀI
 * =================================================================== */
function RefereeSheet({
  visible,
  onClose,
  tournamentId,
  matchId,
  onSaved,
  T,
}: any) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [selected, setSelected] = useState<string[]>([]);
  const [inited, setInited] = useState(false);

  const { data: referees = [], isFetching } = useListTournamentRefereesQuery(
    visible && tournamentId ? { tid: tournamentId, q: dq, limit: 100 } : skipToken,
  );
  const { data: assigned = [], isFetching: loadingAssigned } =
    useAdminGetMatchRefereesQuery(
      visible && tournamentId && matchId
        ? { tid: tournamentId, matchId }
        : skipToken,
    );

  useEffect(() => {
    if (!visible) {
      setSelected([]);
      setInited(false);
      setQ("");
    }
  }, [visible]);
  useEffect(() => {
    if (!visible || inited || loadingAssigned) return;
    setSelected((assigned || []).map((u: any) => sid(u)));
    setInited(true);
  }, [visible, inited, loadingAssigned, assigned]);

  // Giữ trọng tài đã gán trực tiếp (ngoài scope giải) vẫn hiển thị
  const display = useMemo(() => {
    const byId = new Map<string, any>();
    (referees || []).forEach((u: any) => u?._id && byId.set(sid(u), u));
    (assigned || []).forEach((u: any) => {
      if (u?._id && !byId.has(sid(u))) byId.set(sid(u), u);
    });
    return Array.from(byId.values());
  }, [referees, assigned]);

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const [batchAssign, { isLoading: saving }] = useBatchAssignRefereeMutation();
  const handleSave = async () => {
    try {
      await batchAssign({ ids: [matchId], referees: selected }).unwrap();
      Toast.show({
        type: "success",
        text1:
          selected.length > 0
            ? `Đã gán ${selected.length} trọng tài`
            : "Đã gỡ hết trọng tài",
      });
      onSaved?.();
      onClose();
    } catch (e: any) {
      Toast.show({
        type: "error",
        text1: "Lỗi",
        text2: e?.data?.message || "Cập nhật trọng tài thất bại",
      });
    }
  };

  return (
    <SheetShell
      visible={visible}
      title="Gán trọng tài"
      onClose={onClose}
      T={T}
      footer={
        <PrimaryBtn
          label={`Lưu (${selected.length} đang chọn)`}
          onPress={handleSave}
          loading={saving}
          T={T}
        />
      }
    >
      <View style={{ paddingHorizontal: 16, gap: 10 }}>
        <SearchInput
          value={q}
          onChangeText={setQ}
          placeholder="Tìm tên / nickname / email..."
          T={T}
        />
        <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
          {isFetching && !display.length ? (
            <ActivityIndicator style={{ marginVertical: 24 }} />
          ) : !display.length ? (
            <Text
              style={{
                textAlign: "center",
                color: T.textSecondary,
                marginVertical: 24,
              }}
            >
              Không có trọng tài nào trong giải.
            </Text>
          ) : (
            display.map((u: any) => {
              const id = sid(u);
              const checked = selected.includes(id);
              return (
                <Pressable
                  key={id}
                  onPress={() => toggle(id)}
                  style={[
                    st.pickRow,
                    {
                      backgroundColor: checked ? T.successBg : T.cardBg,
                      borderColor: checked ? T.success : T.cardBorder,
                    },
                  ]}
                >
                  <View
                    style={[
                      st.avatarSm,
                      { backgroundColor: checked ? T.tint : T.softBg },
                    ]}
                  >
                    <Text
                      style={{
                        color: checked ? "#fff" : T.textPrimary,
                        fontWeight: "800",
                        fontSize: 12,
                      }}
                    >
                      {(personLabel(u)[0] || "U").toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={{ fontWeight: "700", color: T.textPrimary }}
                      numberOfLines={1}
                    >
                      {personLabel(u)}
                    </Text>
                    {!!(u?.email || u?.phone) && (
                      <Text
                        style={{ fontSize: 11.5, color: T.textSecondary }}
                        numberOfLines={1}
                      >
                        {u?.email || u?.phone}
                      </Text>
                    )}
                  </View>
                  <MaterialIcons
                    name={checked ? "check-box" : "check-box-outline-blank"}
                    size={22}
                    color={checked ? T.success : T.textSecondary}
                  />
                </Pressable>
              );
            })
          )}
        </ScrollView>
      </View>
    </SheetShell>
  );
}

/* =====================================================================
 * 2) GÁN SÂN
 * =================================================================== */
function CourtSheet({
  visible,
  onClose,
  tournamentId,
  matchId,
  isAdmin,
  onSaved,
  T,
}: any) {
  const [clusterId, setClusterId] = useState<string>("");

  const { data: optionsData, isFetching: loadingClusters } =
    useGetTournamentCourtClusterOptionsQuery(
      visible && tournamentId ? tournamentId : skipToken,
    );
  const clusters = useMemo(() => {
    const items = Array.isArray(optionsData?.items) ? optionsData.items : [];
    const selectedIds = Array.isArray(optionsData?.selectedIds)
      ? optionsData.selectedIds.map(String)
      : [];
    // Ưu tiên cụm đã gắn với giải
    return items.filter(
      (c: any) => !selectedIds.length || selectedIds.includes(sid(c)),
    );
  }, [optionsData]);

  useEffect(() => {
    if (!visible) setClusterId("");
    else if (clusters.length && !clusterId) setClusterId(sid(clusters[0]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, clusters]);

  const { data: runtime, isFetching: loadingRuntime, refetch } =
    useGetTournamentCourtClusterRuntimeQuery(
      visible && tournamentId && clusterId
        ? { tournamentId, clusterId }
        : skipToken,
    );
  const stations = runtime?.stations || [];

  const [assignMatch, { isLoading: assigning }] =
    useAssignTournamentMatchToCourtStationMutation();
  const [freeStation, { isLoading: freeing }] =
    useFreeTournamentCourtStationMutation();

  const doAssign = async (stationId: string, force = false) => {
    try {
      await assignMatch({ tournamentId, stationId, matchId, force }).unwrap();
      Toast.show({ type: "success", text1: "Đã gán trận vào sân." });
      onSaved?.();
      refetch();
    } catch (e: any) {
      const msg = e?.data?.message || "Gán sân thất bại";
      if (!force && isAdmin) {
        Alert.alert("Không gán được", `${msg}\n\nGán đè (force)?`, [
          { text: "Huỷ" },
          {
            text: "Gán đè",
            style: "destructive",
            onPress: () => doAssign(stationId, true),
          },
        ]);
      } else {
        Toast.show({ type: "error", text1: "Lỗi", text2: msg });
      }
    }
  };

  const doFree = async (stationId: string) => {
    try {
      await freeStation({ tournamentId, stationId }).unwrap();
      Toast.show({ type: "success", text1: "Đã gỡ trận khỏi sân." });
      onSaved?.();
      refetch();
    } catch (e: any) {
      Toast.show({
        type: "error",
        text1: "Lỗi",
        text2: e?.data?.message || "Gỡ sân thất bại",
      });
    }
  };

  const statusColorOf = (s: string) => {
    const v = String(s || "").toLowerCase();
    if (v === "idle") return "#22c55e";
    if (v === "assigned") return "#f59e0b";
    if (v === "live") return "#ef4444";
    return "#94a3b8";
  };
  const statusLabelOf = (s: string) => {
    const v = String(s || "").toLowerCase();
    if (v === "idle") return "Sẵn sàng";
    if (v === "assigned") return "Đã gán";
    if (v === "live") return "Đang live";
    if (v === "maintenance") return "Bảo trì";
    return v || "—";
  };

  const busy = assigning || freeing;

  return (
    <SheetShell visible={visible} title="Gán sân" onClose={onClose} T={T}>
      <View style={{ paddingHorizontal: 16, gap: 10 }}>
        {loadingClusters ? (
          <ActivityIndicator style={{ marginVertical: 20 }} />
        ) : !clusters.length ? (
          <Text
            style={{
              textAlign: "center",
              color: T.textSecondary,
              marginVertical: 20,
            }}
          >
            Giải chưa gắn cụm sân nào. Vào trang quản lý giải để thêm cụm sân.
          </Text>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {clusters.map((c: any) => {
                  const id = sid(c);
                  const active = id === clusterId;
                  return (
                    <Pressable
                      key={id}
                      onPress={() => setClusterId(id)}
                      style={[
                        st.clusterChip,
                        {
                          backgroundColor: active ? T.tint : T.softBg,
                          borderColor: active ? T.tint : T.cardBorder,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: active ? "#fff" : T.textPrimary,
                          fontWeight: "700",
                          fontSize: 12.5,
                        }}
                      >
                        {c?.name || "Cụm sân"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>

            <ScrollView style={{ maxHeight: 380 }}>
              {loadingRuntime && !stations.length ? (
                <ActivityIndicator style={{ marginVertical: 24 }} />
              ) : !stations.length ? (
                <Text
                  style={{
                    textAlign: "center",
                    color: T.textSecondary,
                    marginVertical: 24,
                  }}
                >
                  Cụm này chưa có sân nào.
                </Text>
              ) : (
                <View style={{ gap: 8, paddingBottom: 8 }}>
                  {stations.map((stn: any) => {
                    const stId = sid(stn);
                    const curId = sid(stn?.currentMatch?._id || stn?.currentMatch);
                    const isThisMatch = curId && curId === String(matchId);
                    const color = statusColorOf(stn?.status);
                    const curCode = stn?.currentMatch
                      ? matchCodeLabel(stn.currentMatch)
                      : "";
                    return (
                      <View
                        key={stId}
                        style={[
                          st.stationRow,
                          {
                            backgroundColor: T.cardBg,
                            borderColor: isThisMatch ? T.tint : T.cardBorder,
                            borderWidth: isThisMatch ? 2 : 1,
                          },
                        ]}
                      >
                        <View
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 5,
                            backgroundColor: color,
                          }}
                        />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text
                            style={{ fontWeight: "800", color: T.textPrimary }}
                            numberOfLines={1}
                          >
                            {stn?.name || "Sân"}
                          </Text>
                          <Text
                            style={{ fontSize: 11.5, color: T.textSecondary }}
                            numberOfLines={1}
                          >
                            {statusLabelOf(stn?.status)}
                            {curCode
                              ? ` · ${curCode}${isThisMatch ? " (trận này)" : ""}`
                              : ""}
                          </Text>
                        </View>
                        {isThisMatch ? (
                          <Pressable
                            onPress={() => doFree(stId)}
                            disabled={busy}
                            style={[st.stationBtn, { backgroundColor: T.dangerBg }]}
                          >
                            <Text
                              style={{
                                color: T.danger,
                                fontWeight: "800",
                                fontSize: 12,
                              }}
                            >
                              Gỡ sân
                            </Text>
                          </Pressable>
                        ) : (
                          <Pressable
                            onPress={() =>
                              Alert.alert(
                                "Gán sân",
                                `Gán trận này vào "${stn?.name || "sân"}"?`,
                                [
                                  { text: "Huỷ" },
                                  { text: "Gán", onPress: () => doAssign(stId) },
                                ],
                              )
                            }
                            disabled={busy}
                            style={[st.stationBtn, { backgroundColor: T.successBg }]}
                          >
                            <Text
                              style={{
                                color: T.success,
                                fontWeight: "800",
                                fontSize: 12,
                              }}
                            >
                              Gán
                            </Text>
                          </Pressable>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          </>
        )}
      </View>
    </SheetShell>
  );
}

/* =====================================================================
 * 3) CHỈNH ĐỘI A/B
 * =================================================================== */
function TeamsSheet({
  visible,
  onClose,
  tournamentId,
  matchId,
  match,
  isSingle,
  onSaved,
  T,
}: any) {
  const [selA, setSelA] = useState<any>(null);
  const [selB, setSelB] = useState<any>(null);
  const [pickerSide, setPickerSide] = useState<"A" | "B" | null>(null);
  const [swapMode, setSwapMode] = useState(false);
  const [q, setQ] = useState("");
  const dq = useDebounced(q);

  // Prefill từ match hiện tại
  useEffect(() => {
    if (!visible) {
      setPickerSide(null);
      setSwapMode(false);
      setQ("");
      return;
    }
    const initSide = (pair: any, seed: any) => {
      if (pair) return pair;
      if (seed?.type === "bye") return BYE_OPTION;
      if (seed?.type === "stageMatchWinner" && seed?.ref?.matchId) {
        return {
          _id: `__WINNER__${sid(seed.ref.matchId)}`,
          __winnerSource: true,
          sourceMatchId: sid(seed.ref.matchId),
          label: seed?.label || "Đội thắng từ trận",
        };
      }
      return null;
    };
    setSelA(initSide(match?.pairA, match?.seedA));
    setSelB(initSide(match?.pairB, match?.seedB));
  }, [visible, match]);

  const { data: regs = [], isFetching: searching } = useSearchRegistrationsQuery(
    visible && tournamentId ? { id: tournamentId, q: dq, limit: 200 } : skipToken,
  );

  const { data: allMatches = [], isFetching: loadingMatches } =
    useListTournamentMatchesQuery(
      visible && tournamentId ? { tournamentId, limit: 1000 } : skipToken,
    );

  const bracketKey = sid(match?.bracket?._id || match?.bracket);
  const swapOptions = useMemo(
    () =>
      (allMatches || [])
        .filter((m: any) => {
          const id = sid(m);
          if (!id || id === String(matchId)) return false;
          const bId = sid(m?.bracket?._id || m?.bracket);
          return !bracketKey || bId === bracketKey;
        })
        .sort(
          (a: any, b: any) =>
            Number(a?.round || 0) - Number(b?.round || 0) ||
            Number(a?.order || 0) - Number(b?.order || 0),
        ),
    [allMatches, matchId, bracketKey],
  );

  // Winner-source options: trận khác bracket, hoặc cùng bracket vòng trước
  const winnerOptions = useMemo(() => {
    const targetRound = Number(match?.round);
    return (allMatches || [])
      .filter((m: any) => {
        const id = sid(m);
        if (!id || id === String(matchId)) return false;
        const bId = sid(m?.bracket?._id || m?.bracket);
        const r = Number(m?.round);
        return (
          bId !== bracketKey ||
          !Number.isFinite(targetRound) ||
          (Number.isFinite(r) && r < targetRound)
        );
      })
      .map((m: any) => ({
        _id: `__WINNER__${sid(m)}`,
        __winnerSource: true,
        sourceMatchId: sid(m),
        label: `W-${matchCodeLabel(m)}`,
      }));
  }, [allMatches, matchId, bracketKey, match?.round]);

  const optionLabel = (v: any) => {
    if (!v) return "— Trống —";
    if (v.__bye) return "BYE (miễn đấu)";
    if (v.__winnerSource) return v.label || "Đội thắng từ trận";
    return pairLabelOf(v, isSingle);
  };

  const [adminPatchMatch, { isLoading: savingTeams }] =
    useAdminPatchMatchMutation();
  const [swapTeams, { isLoading: swapping }] = useAdminSwapMatchTeamsMutation();

  const handleSave = async () => {
    const sidePayload = (side: "A" | "B", value: any) => {
      const pairKey = side === "A" ? "pairA" : "pairB";
      const byeKey = side === "A" ? "byeA" : "byeB";
      const seedKey = side === "A" ? "seedA" : "seedB";
      if (value?.__winnerSource) {
        return {
          [pairKey]: null,
          [byeKey]: false,
          [seedKey]: {
            type: "stageMatchWinner",
            ref: { matchId: value.sourceMatchId },
            label: optionLabel(value),
          },
        };
      }
      if (value?.__bye) {
        return {
          [pairKey]: null,
          [byeKey]: true,
          [seedKey]: { type: "bye", ref: null, label: "BYE" },
        };
      }
      if (!value) {
        return { [pairKey]: null, [byeKey]: false, [seedKey]: null };
      }
      return { [pairKey]: sid(value), [byeKey]: false };
    };
    try {
      await adminPatchMatch({
        id: matchId,
        body: { ...sidePayload("A", selA), ...sidePayload("B", selB) },
      }).unwrap();
      Toast.show({ type: "success", text1: "Đã lưu đội A/B." });
      onSaved?.();
      onClose();
    } catch (e: any) {
      Toast.show({
        type: "error",
        text1: "Lưu đội thất bại",
        text2: e?.data?.message || e?.message,
      });
    }
  };

  const handleSwapWith = async (target: any) => {
    try {
      await swapTeams({ id: matchId, targetMatchId: sid(target) }).unwrap();
      Toast.show({ type: "success", text1: "Đã swap 2 trận." });
      onSaved?.();
      onClose();
    } catch (e: any) {
      Toast.show({
        type: "error",
        text1: "Swap thất bại",
        text2: e?.data?.message || e?.message,
      });
    }
  };

  const matchSideLabel = (m: any, side: "A" | "B") => {
    const pair = side === "A" ? m?.pairA : m?.pairB;
    if (pair) return pairLabelOf(pair, isSingle);
    const seed = side === "A" ? m?.seedA : m?.seedB;
    return seedLabelOf(seed) || `Đội ${side}`;
  };

  /* ---- picker view ---- */
  if (pickerSide) {
    const choose = (v: any) => {
      if (pickerSide === "A") setSelA(v);
      else setSelB(v);
      setPickerSide(null);
      setQ("");
    };
    return (
      <SheetShell
        visible={visible}
        title={`Chọn đội ${pickerSide}`}
        onClose={() => setPickerSide(null)}
        T={T}
      >
        <View style={{ paddingHorizontal: 16, gap: 10 }}>
          <SearchInput
            value={q}
            onChangeText={setQ}
            placeholder="Tìm VĐV / SĐT / mã đăng ký..."
            T={T}
          />
          <ScrollView style={{ maxHeight: 400 }} keyboardShouldPersistTaps="handled">
            <View style={{ gap: 6, paddingBottom: 10 }}>
              <Pressable
                onPress={() => choose(null)}
                style={[st.pickRow, { backgroundColor: T.cardBg, borderColor: T.cardBorder }]}
              >
                <MaterialIcons name="clear" size={18} color={T.textSecondary} />
                <Text style={{ color: T.textSecondary, fontWeight: "600" }}>
                  — Trống —
                </Text>
              </Pressable>
              <Pressable
                onPress={() => choose(BYE_OPTION)}
                style={[st.pickRow, { backgroundColor: T.cardBg, borderColor: T.cardBorder }]}
              >
                <MaterialIcons name="block" size={18} color={T.warn} />
                <Text style={{ color: T.textPrimary, fontWeight: "700" }}>
                  BYE (miễn đấu)
                </Text>
              </Pressable>

              {searching && !regs.length ? (
                <ActivityIndicator style={{ marginVertical: 16 }} />
              ) : (
                (regs || []).map((r: any) => (
                  <Pressable
                    key={sid(r)}
                    onPress={() => choose(r)}
                    style={[
                      st.pickRow,
                      { backgroundColor: T.cardBg, borderColor: T.cardBorder },
                    ]}
                  >
                    <MaterialIcons name="people" size={18} color={T.tint} />
                    <Text
                      style={{ flex: 1, color: T.textPrimary, fontWeight: "600" }}
                      numberOfLines={1}
                    >
                      {pairLabelOf(r, isSingle)}
                    </Text>
                  </Pressable>
                ))
              )}

              {!!winnerOptions.length && (
                <>
                  <Text
                    style={{
                      marginTop: 8,
                      fontSize: 11.5,
                      fontWeight: "800",
                      color: T.textSecondary,
                      letterSpacing: 0.5,
                    }}
                  >
                    ĐỘI THẮNG TỪ TRẬN KHÁC
                  </Text>
                  {winnerOptions.slice(0, 50).map((w: any) => (
                    <Pressable
                      key={w._id}
                      onPress={() => choose(w)}
                      style={[
                        st.pickRow,
                        { backgroundColor: T.cardBg, borderColor: T.cardBorder },
                      ]}
                    >
                      <MaterialIcons
                        name="emoji-events"
                        size={18}
                        color="#f59e0b"
                      />
                      <Text
                        style={{ flex: 1, color: T.textPrimary, fontWeight: "600" }}
                        numberOfLines={1}
                      >
                        {w.label}
                      </Text>
                    </Pressable>
                  ))}
                </>
              )}
            </View>
          </ScrollView>
        </View>
      </SheetShell>
    );
  }

  /* ---- swap-with-match view ---- */
  if (swapMode) {
    return (
      <SheetShell
        visible={visible}
        title="Swap đội với trận khác"
        onClose={() => setSwapMode(false)}
        T={T}
      >
        <View style={{ paddingHorizontal: 16 }}>
          <ScrollView style={{ maxHeight: 420 }}>
            {loadingMatches && !swapOptions.length ? (
              <ActivityIndicator style={{ marginVertical: 20 }} />
            ) : !swapOptions.length ? (
              <Text
                style={{
                  textAlign: "center",
                  color: T.textSecondary,
                  marginVertical: 20,
                }}
              >
                Không có trận nào cùng bracket để swap.
              </Text>
            ) : (
              <View style={{ gap: 6, paddingBottom: 10 }}>
                {swapOptions.map((m: any) => (
                  <Pressable
                    key={sid(m)}
                    onPress={() =>
                      Alert.alert(
                        "Swap 2 trận",
                        `Đổi toàn bộ đội của trận này với ${matchCodeLabel(m)}?`,
                        [
                          { text: "Huỷ" },
                          {
                            text: "Swap",
                            style: "destructive",
                            onPress: () => handleSwapWith(m),
                          },
                        ],
                      )
                    }
                    disabled={swapping}
                    style={[
                      st.pickRow,
                      { backgroundColor: T.cardBg, borderColor: T.cardBorder },
                    ]}
                  >
                    <MaterialIcons name="swap-horiz" size={18} color={T.tint} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontWeight: "800", color: T.textPrimary }}>
                        {matchCodeLabel(m)}
                      </Text>
                      <Text
                        style={{ fontSize: 11.5, color: T.textSecondary }}
                        numberOfLines={1}
                      >
                        {matchSideLabel(m, "A")} vs {matchSideLabel(m, "B")}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      </SheetShell>
    );
  }

  /* ---- main view ---- */
  return (
    <SheetShell
      visible={visible}
      title="Chỉnh đội A / B"
      onClose={onClose}
      T={T}
      footer={
        <PrimaryBtn
          label="Lưu đội A/B"
          onPress={handleSave}
          loading={savingTeams}
          T={T}
        />
      }
    >
      <View style={{ paddingHorizontal: 16, gap: 10 }}>
        {(["A", "B"] as const).map((side) => {
          const val = side === "A" ? selA : selB;
          return (
            <Pressable
              key={side}
              onPress={() => setPickerSide(side)}
              style={[
                st.teamSlot,
                { backgroundColor: T.cardBg, borderColor: T.cardBorder },
              ]}
            >
              <View
                style={[
                  st.avatarSm,
                  { backgroundColor: side === "A" ? "#3b82f6" : "#ec4899" },
                ]}
              >
                <Text style={{ color: "#fff", fontWeight: "900", fontSize: 12 }}>
                  {side}
                </Text>
              </View>
              <Text
                style={{
                  flex: 1,
                  fontWeight: "700",
                  color: val ? T.textPrimary : T.textSecondary,
                  fontStyle: val ? "normal" : "italic",
                }}
                numberOfLines={1}
              >
                {optionLabel(val)}
              </Text>
              <MaterialIcons name="edit" size={17} color={T.tint} />
            </Pressable>
          );
        })}

        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable
            onPress={() => {
              const a = selA;
              setSelA(selB);
              setSelB(a);
            }}
            style={[
              st.secondaryBtn,
              { borderColor: T.cardBorder, backgroundColor: T.softBg, flex: 1 },
            ]}
          >
            <MaterialIcons name="swap-vert" size={16} color={T.tint} />
            <Text style={{ fontWeight: "700", color: T.textPrimary, fontSize: 12.5 }}>
              Đổi A ↔ B
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setSwapMode(true)}
            style={[
              st.secondaryBtn,
              { borderColor: T.cardBorder, backgroundColor: T.softBg, flex: 1 },
            ]}
          >
            <MaterialIcons name="swap-horiz" size={16} color={T.tint} />
            <Text style={{ fontWeight: "700", color: T.textPrimary, fontSize: 12.5 }}>
              Swap với trận khác
            </Text>
          </Pressable>
        </View>
        <Text style={{ fontSize: 11.5, color: T.textSecondary }}>
          Chọn đội từ danh sách đăng ký, BYE, hoặc “đội thắng từ trận khác”.
          Lưu sẽ ghi đè cặp đấu hiện tại của trận.
        </Text>
      </View>
    </SheetShell>
  );
}

/* =====================================================================
 * 4) CÀI ĐẶT TRẬN
 * =================================================================== */
const clampInt = (v: any, min: number, max: number) => {
  const n = parseInt(String(v ?? "").replace(/[^\d]/g, ""), 10);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
};

function OptionPills({
  options,
  value,
  onChange,
  T,
}: {
  options: { value: any; label: string }[];
  value: any;
  onChange: (v: any) => void;
  T: ReturnType<typeof useTokens>;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
      {options.map((o) => {
        const active = String(o.value) === String(value);
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            style={[
              st.pill,
              {
                backgroundColor: active ? T.tint : T.softBg,
                borderColor: active ? T.tint : T.cardBorder,
              },
            ]}
          >
            <Text
              style={{
                color: active ? "#fff" : T.textPrimary,
                fontWeight: "700",
                fontSize: 12.5,
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function NumField({
  label,
  value,
  onChangeText,
  T,
}: {
  label: string;
  value: string;
  onChangeText: (s: string) => void;
  T: ReturnType<typeof useTokens>;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 11.5, color: T.textSecondary, marginBottom: 4 }}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType="number-pad"
        style={[
          st.numInput,
          {
            backgroundColor: T.inputBg,
            borderColor: T.cardBorder,
            color: T.textPrimary,
          },
        ]}
      />
    </View>
  );
}

function SettingsSheet({ visible, onClose, matchId, match, onSaved, T }: any) {
  const [bestOf, setBestOf] = useState(1);
  const [pointsToWin, setPointsToWin] = useState(11);
  const [winByTwo, setWinByTwo] = useState(true);
  const [capMode, setCapMode] = useState("none");
  const [capPoints, setCapPoints] = useState("");
  const [timeoutPerGame, setTimeoutPerGame] = useState("2");
  const [timeoutMinutes, setTimeoutMinutes] = useState("1");
  const [medicalTimeouts, setMedicalTimeouts] = useState("1");

  useEffect(() => {
    if (!visible) return;
    const r = match?.rules || {};
    setBestOf(Number(r.bestOf) || 1);
    setPointsToWin(Number(r.pointsToWin) || 11);
    setWinByTwo(r.winByTwo !== false);
    setCapMode(r.cap?.mode || "none");
    setCapPoints(r.cap?.points != null ? String(r.cap.points) : "");
    setTimeoutPerGame(String(clampInt(match?.timeoutPerGame ?? 2, 0, 10)));
    setTimeoutMinutes(String(clampInt(match?.timeoutMinutes ?? 1, 0, 10)));
    setMedicalTimeouts(String(clampInt(match?.medicalTimeouts ?? 1, 0, 10)));
  }, [visible, match]);

  const [updateSettings, { isLoading: saving }] =
    useUpdateMatchSettingsMutation();

  const handleSave = async () => {
    const cap =
      capMode === "none"
        ? { mode: "none", points: null }
        : { mode: capMode, points: clampInt(capPoints, pointsToWin + 1, 99) };
    if (capMode !== "none" && (!cap.points || cap.points <= pointsToWin)) {
      Toast.show({ type: "error", text1: "Điểm cap phải lớn hơn điểm chạm" });
      return;
    }
    try {
      await updateSettings({
        matchId,
        bestOf: Number(bestOf),
        pointsToWin: Number(pointsToWin),
        winByTwo: Boolean(winByTwo),
        cap,
        timeoutPerGame: clampInt(timeoutPerGame, 0, 10),
        timeoutMinutes: clampInt(timeoutMinutes, 0, 10),
        medicalTimeouts: clampInt(medicalTimeouts, 0, 10),
      }).unwrap();
      Toast.show({ type: "success", text1: "Đã lưu cài đặt trận" });
      onSaved?.();
      onClose();
    } catch (e: any) {
      Toast.show({
        type: "error",
        text1: "Lưu thất bại",
        text2: e?.data?.message || e?.error,
      });
    }
  };

  return (
    <SheetShell
      visible={visible}
      title="Cài đặt trận đấu"
      onClose={onClose}
      T={T}
      footer={
        <PrimaryBtn label="Lưu cài đặt" onPress={handleSave} loading={saving} T={T} />
      }
    >
      <ScrollView style={{ maxHeight: 440 }}>
        <View style={{ paddingHorizontal: 16, gap: 14, paddingBottom: 10 }}>
          <View>
            <Text style={[st.fieldLabel, { color: T.textPrimary }]}>
              Số set thi đấu (BO)
            </Text>
            <OptionPills
              options={[
                { value: 1, label: "BO1" },
                { value: 3, label: "BO3" },
                { value: 5, label: "BO5" },
              ]}
              value={bestOf}
              onChange={setBestOf}
              T={T}
            />
          </View>

          <View>
            <Text style={[st.fieldLabel, { color: T.textPrimary }]}>
              Điểm chạm mỗi set
            </Text>
            <OptionPills
              options={[
                { value: 11, label: "11 điểm" },
                { value: 15, label: "15 điểm" },
                { value: 21, label: "21 điểm" },
              ]}
              value={pointsToWin}
              onChange={setPointsToWin}
              T={T}
            />
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text style={[st.fieldLabel, { color: T.textPrimary, marginBottom: 0 }]}>
              Phải cách 2 điểm (win by two)
            </Text>
            <Switch value={winByTwo} onValueChange={setWinByTwo} />
          </View>

          <View>
            <Text style={[st.fieldLabel, { color: T.textPrimary }]}>
              Cap điểm (giới hạn trần)
            </Text>
            <OptionPills
              options={[
                { value: "none", label: "Không cap" },
                { value: "hard", label: "Cap cứng" },
                { value: "soft", label: "Cap mềm" },
              ]}
              value={capMode}
              onChange={setCapMode}
              T={T}
            />
            {capMode !== "none" && (
              <View style={{ marginTop: 8, width: 140 }}>
                <NumField
                  label={`Điểm cap (> ${pointsToWin})`}
                  value={capPoints}
                  onChangeText={setCapPoints}
                  T={T}
                />
              </View>
            )}
          </View>

          <View>
            <Text style={[st.fieldLabel, { color: T.textPrimary }]}>Timeout</Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <NumField
                label="Số timeout / set"
                value={timeoutPerGame}
                onChangeText={setTimeoutPerGame}
                T={T}
              />
              <NumField
                label="Phút mỗi timeout"
                value={timeoutMinutes}
                onChangeText={setTimeoutMinutes}
                T={T}
              />
              <NumField
                label="Timeout y tế"
                value={medicalTimeouts}
                onChangeText={setMedicalTimeouts}
                T={T}
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </SheetShell>
  );
}

/* =====================================================================
 * MAIN — section 4 nút + sheets
 * =================================================================== */
export default function AdminMatchTools({
  tournamentId,
  matchId,
  match,
  isSingle,
  isAdmin,
  onSaved,
}: {
  tournamentId: string | null;
  matchId: string | null;
  match: any;
  isSingle?: boolean;
  isAdmin?: boolean;
  onSaved?: () => void;
}) {
  const T = useTokens();
  const [openSheet, setOpenSheet] = useState<
    null | "teams" | "court" | "ref" | "settings"
  >(null);
  const close = useCallback(() => setOpenSheet(null), []);

  const disabledCommon = !matchId;
  const needTour = !tournamentId;

  return (
    <>
      <View>
        <Text style={[st.sectionLabel, { color: T.textSecondary }]}>
          CÔNG CỤ NÂNG CAO
        </Text>
        <View style={st.grid2}>
          <ToolBtn
            icon="groups"
            label="Chỉnh đội A/B"
            onPress={() => setOpenSheet("teams")}
            disabled={disabledCommon || needTour}
            T={T}
          />
          <ToolBtn
            icon="stadium"
            label="Gán sân"
            onPress={() => setOpenSheet("court")}
            disabled={disabledCommon || needTour}
            T={T}
          />
        </View>
        <View style={[st.grid2, { marginTop: 8 }]}>
          <ToolBtn
            icon="gavel"
            label="Gán trọng tài"
            onPress={() => setOpenSheet("ref")}
            disabled={disabledCommon || needTour}
            T={T}
          />
          <ToolBtn
            icon="tune"
            label="Cài đặt trận"
            onPress={() => setOpenSheet("settings")}
            disabled={disabledCommon}
            T={T}
            warn
          />
        </View>
      </View>

      <TeamsSheet
        visible={openSheet === "teams"}
        onClose={close}
        tournamentId={tournamentId}
        matchId={matchId}
        match={match}
        isSingle={isSingle}
        onSaved={onSaved}
        T={T}
      />
      <CourtSheet
        visible={openSheet === "court"}
        onClose={close}
        tournamentId={tournamentId}
        matchId={matchId}
        isAdmin={isAdmin}
        onSaved={onSaved}
        T={T}
      />
      <RefereeSheet
        visible={openSheet === "ref"}
        onClose={close}
        tournamentId={tournamentId}
        matchId={matchId}
        onSaved={onSaved}
        T={T}
      />
      <SettingsSheet
        visible={openSheet === "settings"}
        onClose={close}
        matchId={matchId}
        match={match}
        onSaved={onSaved}
        T={T}
      />
    </>
  );
}

/* ================= styles ================= */
const st = StyleSheet.create({
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  grid2: {
    flexDirection: "row",
    gap: 8,
  },
  toolBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheetBody: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    paddingBottom: 4,
  },
  sheetHandleWrap: {
    alignItems: "center",
    paddingTop: 8,
  },
  sheetHandle: {
    width: 42,
    height: 5,
    borderRadius: 99,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sheetFooter: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  primaryBtn: {
    height: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 42,
  },
  pickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
  },
  avatarSm: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  teamSlot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  clusterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  stationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  stationBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6,
  },
  numInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 40,
    fontSize: 14,
    fontWeight: "700",
  },
});
