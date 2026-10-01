// Điều khiển luồng live từ app PickleTour (admin). App → backend proxy → control-server
// desktop (Tailscale). Điện thoại KHÔNG cần Tailscale.
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from "react-native";
import { Text } from "@/components/ui/i18nText";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, Redirect, router } from "expo-router";
import { useSelector } from "react-redux";
import { useTheme } from "@react-navigation/native";
import * as Clipboard from "expo-clipboard";
import { MaterialIcons } from "@expo/vector-icons";
import {
  useGetLiveMachinesQuery,
  useLiveControlCallMutation,
  useCreateCommentaryTokenMutation,
} from "@/slices/liveControlApiSlice";

const CORNERS = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;
const CORNER_LABEL: Record<string, string> = {
  "top-left": "Trên·Trái",
  "top-right": "Trên·Phải",
  "bottom-left": "Dưới·Trái",
  "bottom-right": "Dưới·Phải",
};
const OPACITY_PRESETS = [50, 60, 70, 80, 90, 100];

export default function LiveControlScreen() {
  const theme = useTheme();
  const isDark = theme.dark;
  const userInfo = useSelector((s: any) => s.auth?.userInfo);
  const isAdmin = !!(userInfo?.isAdmin || userInfo?.role === "admin" || userInfo?.isSuperAdmin);
  const isCommentator = !!userInfo?.isCommentator;
  const canAccess = isAdmin || isCommentator;
  // Bình luận viên (không phải admin): chỉ xem + bình luận, ẩn mọi điều khiển.
  const commentaryOnly = !isAdmin;

  const C = {
    bg: isDark ? theme.colors.background : "#F8FAFC",
    card: isDark ? "#111827" : "#FFFFFF",
    border: isDark ? "rgba(255,255,255,0.1)" : "#E2E8F0",
    text: theme.colors.text,
    sub: isDark ? "#94A3B8" : "#64748B",
    primary: "#0EA5E9",
    danger: "#EF4444",
    ok: "#22C55E",
    chipOff: isDark ? "#1E293B" : "#EEF2F7",
  };

  const { data: machinesData, isLoading: loadingMachines, refetch: refetchMachines } =
    useGetLiveMachinesQuery(undefined, { pollingInterval: 20000, skip: !canAccess });
  const machines: any[] = machinesData?.machines || [];
  const [machineId, setMachineId] = useState<string>("");
  const [callMut] = useLiveControlCallMutation();
  const [createCommentaryToken] = useCreateCommentaryTokenMutation();

  const [snap, setSnap] = useState<any>({ perf: {}, sessions: [] });
  const [opacity, setOpacity] = useState<number>(100);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const pollRef = useRef<any>(null);

  // Chọn máy online đầu tiên khi có danh sách.
  useEffect(() => {
    if (!machineId && machines.length) {
      const online = machines.find((m) => m.online) || machines[0];
      if (online) setMachineId(online.machineId);
    }
  }, [machines, machineId]);

  const call = useCallback(
    async (path: string, method = "GET", body?: any) => {
      if (!machineId) throw new Error("Chưa chọn máy");
      return callMut({ machineId, path, method, body }).unwrap();
    },
    [machineId, callMut]
  );

  const loadState = useCallback(async () => {
    if (!machineId) return;
    try {
      const d = await call("/api/state");
      setSnap({ perf: d?.perf || {}, sessions: d?.sessions || [] });
      setErr("");
    } catch (e: any) {
      setErr(e?.data?.message || e?.message || "Không kết nối được máy live");
    }
  }, [machineId, call]);

  const loadOpacity = useCallback(async () => {
    if (!machineId) return;
    try {
      const d = await call("/api/get-opacity");
      if (d?.opacity != null) setOpacity(Math.round(Number(d.opacity) * 100));
    } catch {}
  }, [machineId, call]);

  // Poll state mỗi 5s theo máy đang chọn.
  useEffect(() => {
    if (!machineId) return;
    loadState();
    loadOpacity();
    pollRef.current = setInterval(loadState, 5000);
    return () => clearInterval(pollRef.current);
  }, [machineId, loadState, loadOpacity]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetchMachines();
    await loadState();
    setRefreshing(false);
  };

  const withBusy = async (fn: () => Promise<any>, okMsg?: string) => {
    setBusy(true);
    try {
      await fn();
      await loadState();
      if (okMsg) Alert.alert("OK", okMsg);
    } catch (e: any) {
      Alert.alert("Lỗi", e?.data?.message || e?.message || "Thử lại");
    } finally {
      setBusy(false);
    }
  };

  const stopCourt = (s: any) =>
    Alert.alert("Dừng sân?", `Dừng live ${s.court || "sân"}?`, [
      { text: "Huỷ", style: "cancel" },
      { text: "Dừng", style: "destructive", onPress: () => withBusy(() => call("/api/stop", "POST", { sid: s.sid })) },
    ]);
  const stopAll = () =>
    Alert.alert("Dừng tất cả?", "Dừng TẤT CẢ sân đang live?", [
      { text: "Huỷ", style: "cancel" },
      { text: "Dừng hết", style: "destructive", onPress: () => withBusy(() => call("/api/stop-all", "POST", {})) },
    ]);
  const cycleLayout = (s: any, key: string) => {
    const cur = s.layout?.[key] || "top-left";
    const next = CORNERS[(CORNERS.indexOf(cur) + 1) % CORNERS.length];
    const layout = { ...(s.layout || {}), [key]: next };
    withBusy(() => call("/api/set-layout", "POST", { sid: s.sid, layout }));
  };
  const toggleTs = (s: any, on: boolean) =>
    withBusy(() => call("/api/set-ts-cover", "POST", { sid: s.sid, hideTimestamp: on }));
  const applyOpacity = (pct: number) => {
    setOpacity(pct);
    withBusy(() => call("/api/set-opacity", "POST", { opacity: pct / 100 }));
  };
  const copy = async (url: string) => {
    try { await Clipboard.setStringAsync(url); Alert.alert("Đã copy", url); } catch {}
  };
  // Mở trang bình luận viên (mic → luồng live) cho 1 sân.
  const openCommentary = async (s: any) => {
    try {
      const d: any = await createCommentaryToken({ machineId, sid: s.sid, courtName: s.court || "" }).unwrap();
      await Linking.openURL(d.url);
    } catch (e: any) {
      Alert.alert("Lỗi", e?.data?.message || e?.message || "Không tạo được liên kết bình luận");
    }
  };

  if (!canAccess) return <Redirect href="/(tabs)/more" />;

  const sessions: any[] = snap.sessions || [];
  const perf = snap.perf || {};

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={["top", "left", "right"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { borderColor: C.border }]}>
        <Text style={[styles.h1, { color: C.text }]}>{commentaryOnly ? "🎙️ Bình luận Live" : "🎬 Điều khiển Live"}</Text>
      </View>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
      >
        {/* Chọn máy */}
        {loadingMachines ? (
          <ActivityIndicator color={C.primary} style={{ marginVertical: 20 }} />
        ) : machines.length === 0 ? (
          <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={{ color: C.text, fontWeight: "700" }}>Chưa có máy PC live nào online</Text>
            <Text style={{ color: C.sub, marginTop: 6, fontSize: 13 }}>
              Trên app desktop: đăng nhập admin + bật “Điều khiển từ xa” (control server) + máy phải trong Tailscale cùng máy chủ.
            </Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            {machines.map((m) => {
              const sel = m.machineId === machineId;
              return (
                <Pressable
                  key={m.machineId}
                  onPress={() => setMachineId(m.machineId)}
                  style={[styles.machineChip, { backgroundColor: sel ? C.primary : C.chipOff, borderColor: C.border }]}
                >
                  <View style={[styles.dot, { backgroundColor: m.online ? C.ok : C.sub }]} />
                  <Text style={{ color: sel ? "#fff" : C.text, fontWeight: "700", fontSize: 13 }}>
                    {m.label || m.machineId}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {!!machineId && (
          <>
            {/* Thêm sân live / hẹn giờ (chỉ admin) */}
            {!commentaryOnly && (
              <Pressable
                onPress={() => router.push(`/admin/live-add?machineId=${encodeURIComponent(machineId)}` as any)}
                style={[styles.addBtn, { backgroundColor: C.primary }]}
              >
                <Text style={{ color: "#fff", fontWeight: "800" }}>＋ Thêm sân live / Hẹn giờ</Text>
              </Pressable>
            )}

            {/* Perf + lỗi */}
            <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
              <Text style={{ color: C.sub, fontSize: 13 }}>
                {perf.cpuModel ? `${perf.cpuModel} · ${perf.cpuCount || "?"} lõi · ` : ""}
                CPU {perf.cpuPct == null ? "…" : perf.cpuPct + "%"} · còn ~{perf.moreCourts == null ? "…" : perf.moreCourts} sân
              </Text>
              {!!err && <Text style={{ color: C.danger, marginTop: 6, fontSize: 13 }}>{err}</Text>}
            </View>

            {/* Độ hiển thị overlay (chung) — chỉ admin */}
            {!commentaryOnly && (
              <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
                <Text style={{ color: C.text, fontWeight: "700" }}>🎚️ Độ hiển thị overlay (chung mọi sân)</Text>
                <View style={styles.presetRow}>
                  {OPACITY_PRESETS.map((p) => (
                    <Pressable
                      key={p}
                      onPress={() => applyOpacity(p)}
                      style={[styles.preset, { backgroundColor: opacity === p ? C.primary : C.chipOff, borderColor: C.border }]}
                    >
                      <Text style={{ color: opacity === p ? "#fff" : C.text, fontWeight: "700", fontSize: 13 }}>{p}%</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {/* Nút dừng tất cả — chỉ admin */}
            {!commentaryOnly && sessions.length > 0 && (
              <Pressable onPress={stopAll} style={[styles.stopAll, { borderColor: C.danger }]}>
                <Text style={{ color: C.danger, fontWeight: "800" }}>■ Dừng tất cả</Text>
              </Pressable>
            )}

            {/* Danh sách sân */}
            {sessions.length === 0 ? (
              <Text style={{ color: C.sub, textAlign: "center", marginTop: 20 }}>
                Không có sân nào đang live trên máy này.
              </Text>
            ) : (
              sessions.map((s) => (
                <View key={s.sid} style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
                  <View style={styles.rowBetween}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: C.text, fontWeight: "800", fontSize: 16 }}>
                        {s.court || "Sân"}{" "}
                        <Text style={{ color: s.status === "live" ? C.ok : C.sub, fontSize: 12 }}>
                          {String(s.status || "").toUpperCase()}
                        </Text>
                      </Text>
                      <Text style={{ color: C.sub, fontSize: 13, marginTop: 2 }}>{s.tournament || ""}</Text>
                      <Text style={{ color: C.sub, fontSize: 13 }}>
                        Trận: {s.match || "—"}
                        {s.bitrateKbps ? ` · ${(s.bitrateKbps / 1000).toFixed(2)}Mbps` : ""}
                        {s.speed ? ` · ${Number(s.speed).toFixed(2)}×` : ""}
                      </Text>
                    </View>
                    <View style={{ gap: 6 }}>
                      <Pressable onPress={() => openCommentary(s)} style={[styles.micBtn, { borderColor: C.primary }]}>
                        <MaterialIcons name="mic" size={15} color={C.primary} />
                        <Text style={{ color: C.primary, fontWeight: "700", fontSize: 12 }}>Bình luận</Text>
                      </Pressable>
                      {!commentaryOnly && (
                        <Pressable onPress={() => stopCourt(s)} style={[styles.stopBtn, { backgroundColor: C.danger }]}>
                          <Text style={{ color: "#fff", fontWeight: "700" }}>■ Dừng</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>

                  {/* Link xem + điều khiển (chỉ admin) */}
                  {!commentaryOnly && (s.watchUrls || []).map((u: string) => (
                    <View key={u} style={[styles.linkRow, { borderColor: C.border }]}>
                      <Pressable style={{ flex: 1 }} onPress={() => Linking.openURL(u)}>
                        <Text numberOfLines={1} style={{ color: C.primary, fontSize: 12 }}>↗ {u}</Text>
                      </Pressable>
                      <Pressable onPress={() => copy(u)} style={styles.copyBtn}>
                        <MaterialIcons name="content-copy" size={16} color={C.sub} />
                      </Pressable>
                    </View>
                  ))}

                  {/* Vị trí overlay + ẩn ngày giờ (chỉ admin) */}
                  {!commentaryOnly && (
                    <>
                      <Text style={{ color: C.sub, fontSize: 12, marginTop: 10 }}>Vị trí overlay (chạm để đổi)</Text>
                      <View style={styles.layRow}>
                        {[["scoreboard", "Bảng điểm"], ["brand", "Logo"], ["sponsor", "Tài trợ"]].map(([k, label]) => (
                          <Pressable key={k} onPress={() => cycleLayout(s, k)} style={[styles.layBtn, { borderColor: C.border, backgroundColor: C.chipOff }]}>
                            <Text style={{ color: C.sub, fontSize: 10 }}>{label}</Text>
                            <Text style={{ color: C.text, fontSize: 12, fontWeight: "700" }}>
                              {CORNER_LABEL[s.layout?.[k] || "top-left"]}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                      <View style={[styles.rowBetween, { marginTop: 10 }]}>
                        <Text style={{ color: C.text, fontSize: 14 }}>Ẩn ngày giờ camera (làm mờ)</Text>
                        <Switch value={!!s.hideTimestamp} onValueChange={(v) => toggleTs(s, v)} />
                      </View>
                      {s.hideTimestamp ? (
                        <Text style={{ color: C.sub, fontSize: 11 }}>Bật/tắt sẽ khởi động lại luồng ~vài giây.</Text>
                      ) : null}
                    </>
                  )}
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
      {busy && (
        <View style={styles.busyOverlay}>
          <ActivityIndicator color="#fff" size="large" />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  h1: { fontSize: 20, fontWeight: "800" },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 12 },
  addBtn: { borderRadius: 12, paddingVertical: 13, alignItems: "center", marginBottom: 12 },
  machineChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, marginRight: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  preset: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  stopAll: { borderWidth: 1.5, borderRadius: 12, paddingVertical: 12, alignItems: "center", marginBottom: 12 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  stopBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, alignItems: "center" },
  micBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1.5 },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginTop: 8 },
  copyBtn: { padding: 4 },
  layRow: { flexDirection: "row", gap: 8, marginTop: 6 },
  layBtn: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 8, alignItems: "center" },
  busyOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.25)", alignItems: "center", justifyContent: "center" },
});
