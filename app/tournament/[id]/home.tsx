// app/(admin)/tournaments/[id]/OverviewScreen.jsx
// A React Native screen that mirrors src/pages/admin/TournamentOverviewPage.jsx (web/MUI) as closely as possible.
// - Uses Expo + expo-router
// - Uses RTK Query hooks from your existing slices (same as web)
// - No extra UI libs; small Chip/Pill/Progress components are implemented locally
// - Table UI is reproduced with FlatList row items

import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  Linking,
  Platform,
  ScrollView,
  useColorScheme,
} from "react-native";
import { useSelector } from "react-redux";
import { router, useLocalSearchParams } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { useTheme } from "@react-navigation/native";

// ==== RTK Query hooks (adjust aliases to your project if needed) ====
import {
  useGetTournamentQuery,
  useGetRegistrationsQuery,
  useAdminGetBracketsQuery,
  useAdminListMatchesByTournamentQuery,
} from "@/slices/tournamentsApiSlice";

/* ======================== Helpers ======================== */
const TYPE_LABEL = (t) => {
  const key = String(t || "").toLowerCase();
  if (key === "group") return "Vòng bảng";
  if (key === "po" || key === "playoff") return "Playoff";
  if (key === "knockout" || key === "ko") return "Knockout";
  if (key === "double_elim" || key === "doubleelim") return "Double Elim";
  if (key === "swiss") return "Swiss";
  if (key === "gsl") return "GSL";
  return t || "Khác";
};
const playerName = (p) =>
  p?.fullName || p?.name || p?.nickName || p?.nickname || "—";
const pairLabel = (pair) => {
  if (!pair) return "—";
  if (pair.name) return pair.name;
  const ps = [pair.player1, pair.player2].filter(Boolean).map(playerName);
  return ps.join(" / ") || "—";
};
const matchCode = (m) =>
  m?.code || `R${m?.round ?? "?"}#${(m?.order ?? 0) + 1}`;
const safeDate = (d) => (d ? new Date(d) : null);
const fmtDate = (d) => {
  if (!d) return "—";
  try {
    const dt = new Date(d);
    const s = dt.toLocaleString?.() || dt.toISOString?.();
    return s?.replace("T", " ").slice(0, 19);
  } catch {
    return String(d);
  }
};

/* ======================== Theme tokens ======================== */
function useTokens() {
  const navTheme = useTheme?.() || {};
  const scheme = useColorScheme?.() || "light";
  const dark =
    typeof navTheme.dark === "boolean" ? navTheme.dark : scheme === "dark";

  const primary = navTheme?.colors?.primary ?? (dark ? "#7cc0ff" : "#1976d2");
  const text = navTheme?.colors?.text ?? (dark ? "#f5f7fa" : "#111");
  const card = navTheme?.colors?.card ?? (dark ? "#16181c" : "#ffffff");
  const border = navTheme?.colors?.border ?? (dark ? "#2f3237" : "#e0e0e0");
  const background =
    navTheme?.colors?.background ?? (dark ? "#0b0d10" : "#f7f8fb");

  return {
    dark,
    colors: { primary, text, card, border, background },
    // text/muted
    muted: dark ? "#9aa0a6" : "#616161",
    // surfaces
    divider: dark ? "#2a2e33" : "#eeeeee",
    headerBg: dark ? "#101418" : "#fafafa",
    track: dark ? "#2a2f36" : "#eeeeee",
    // chip palettes
    chipDefaultBg: dark ? "#1f2937" : "#eeeeee",
    chipDefaultFg: dark ? "#e5e7eb" : "#263238",
    chipDefaultBd: dark ? "#334155" : "#e0e0e0",

    chipInfoBg: dark ? "#0f2536" : "#e3f2fd",
    chipInfoFg: dark ? "#93c5fd" : "#1565c0",
    chipInfoBd: dark ? "#1e3a5f" : "#bbdefb",

    chipWarnBg: dark ? "#3a2308" : "#fff8e1",
    chipWarnFg: dark ? "#ffddb0" : "#ef6c00",
    chipWarnBd: dark ? "#6b3d0b" : "#ffe0b2",

    chipSuccessBg: dark ? "#0f2d1a" : "#e8f5e9",
    chipSuccessFg: dark ? "#8de4b5" : "#2e7d32",
    chipSuccessBd: dark ? "#1c5a39" : "#c8e6c9",
  };
}

/* ======================== Main Screen ======================== */
export default function OverviewScreen() {
  const t = useTokens();
  const { id } = useLocalSearchParams();
  const me = useSelector((s) => s.auth?.userInfo || null);

  // 1) Data
  const {
    data: tour,
    isLoading: tourLoading,
    error: tourErr,
  } = useGetTournamentQuery(id);
  const {
    data: regs = [],
    isLoading: regsLoading,
    error: regsErr,
  } = useGetRegistrationsQuery(id);
  const {
    data: brackets = [],
    isLoading: brLoading,
    error: brErr,
  } = useAdminGetBracketsQuery(id);
  const {
    data: matchPage,
    isLoading: mLoading,
    error: mErr,
  } = useAdminListMatchesByTournamentQuery({
    tid: id,
    page: 1,
    pageSize: 2000,
  });
  const allMatches = matchPage?.list || [];

  // 2) Permissions
  const isAdmin = !!(
    me?.isAdmin ||
    me?.role === "admin" ||
    (Array.isArray(me?.roles) && me.roles.includes("admin"))
  );
  const isManager = useMemo(() => {
    if (!me?._id || !tour) return false;
    if (String(tour.createdBy) === String(me._id)) return true;
    if (Array.isArray(tour?.managers))
      return tour.managers.some((m) => String(m?.user ?? m) === String(me._id));
    return !!tour?.isManager;
  }, [tour, me]);
  const canManage = isAdmin || isManager;

  // 3) KPIs
  const regTotal = regs.length;
  const regPaid = useMemo(
    () => regs.filter((r) => r?.payment?.status === "Paid").length,
    [regs]
  );
  const regCheckin = useMemo(
    () => regs.filter((r) => !!r?.checkinAt).length,
    [regs]
  );
  const videoCount = useMemo(
    () => allMatches.filter((m) => !!m?.video).length,
    [allMatches]
  );

  const matchStatusCount = useMemo(() => {
    const init = {
      scheduled: 0,
      queued: 0,
      assigned: 0,
      live: 0,
      finished: 0,
      other: 0,
    };
    for (const m of allMatches) {
      const s = String(m?.status || "").toLowerCase();
      if (s in init) init[s] += 1;
      else init.other += 1;
    }
    return init;
  }, [allMatches]);

  // 4) Bracket progress
  const bracketProgress = useMemo(() => {
    const byId = new Map();
    (brackets || []).forEach((b) =>
      byId.set(String(b._id), {
        _id: String(b._id),
        name: b?.name || "Bracket",
        type: b?.type || "",
        stage: b?.stage,
        total: 0,
        finished: 0,
      })
    );
    for (const m of allMatches) {
      const bid = String(m?.bracket?._id || m?.bracket || "");
      if (!byId.has(bid)) continue;
      const rec = byId.get(bid);
      rec.total += 1;
      if (m?.status === "finished") rec.finished += 1;
    }
    return Array.from(byId.values()).sort((a, b) => {
      if ((a.stage ?? 0) !== (b.stage ?? 0))
        return (a.stage ?? 0) - (b.stage ?? 0);
      return (TYPE_LABEL(a.type) || "").localeCompare(TYPE_LABEL(b.type) || "");
    });
  }, [brackets, allMatches]);

  // 5) Upcoming / Recent
  const now = Date.now();
  const upcoming = useMemo(
    () =>
      allMatches
        .filter((m) => {
          const s = String(m?.status || "");
          return (
            s === "scheduled" ||
            s === "queued" ||
            s === "assigned" ||
            (safeDate(m?.scheduledAt)?.getTime() ?? 0) >= now
          );
        })
        .sort((a, b) => {
          const ta =
            safeDate(a?.scheduledAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
          const tb =
            safeDate(b?.scheduledAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
          return ta - tb;
        })
        .slice(0, 10),
    [allMatches, now]
  );

  const recent = useMemo(
    () =>
      allMatches
        .filter((m) => m?.status === "finished")
        .sort((a, b) => {
          const ta = safeDate(a?.finishedAt)?.getTime() ?? 0;
          const tb = safeDate(b?.finishedAt)?.getTime() ?? 0;
          return tb - ta;
        })
        .slice(0, 10),
    [allMatches]
  );

  // 6) Viewer modal (themed)
  const [viewer, setViewer] = useState({ open: false, matchId: null });
  const openMatch = (mid) => setViewer({ open: true, matchId: mid });
  const closeMatch = () => setViewer({ open: false, matchId: null });
  const viewedMatch = useMemo(
    () => allMatches.find((m) => String(m._id) === String(viewer.matchId)),
    [allMatches, viewer.matchId]
  );

  const MatchViewerModal = ({ visible, match, onClose }) => {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <View
          style={[styles.modalRoot, { backgroundColor: t.colors.background }]}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <Text style={[styles.modalTitle, { color: t.colors.text }]}>
              Chi tiết trận
            </Text>
            <View style={{ flex: 1 }} />
            <Pressable onPress={onClose} style={styles.iconBtn}>
              <MaterialIcons name="close" size={22} color={t.colors.text} />
            </Pressable>
          </View>
          {!match ? (
            <ActivityIndicator color={t.colors.primary} />
          ) : (
            <View style={{ gap: 8 }}>
              <Text style={[styles.label, { color: t.muted }]}>Mã trận</Text>
              <Text style={[styles.value, { color: t.colors.text }]}>
                {matchCode(match)}
              </Text>
              <Text style={[styles.label, { color: t.muted }]}>Cặp A</Text>
              <Text style={[styles.value, { color: t.colors.text }]}>
                {pairLabel(match?.pairA)}
              </Text>
              <Text style={[styles.label, { color: t.muted }]}>Cặp B</Text>
              <Text style={[styles.value, { color: t.colors.text }]}>
                {pairLabel(match?.pairB)}
              </Text>
              <Text style={[styles.label, { color: t.muted }]}>Trạng thái</Text>
              <StatusPill status={match?.status} />
              {!!match?.video && (
                <Pressable
                  onPress={() => Linking.openURL(String(match.video))}
                  style={[
                    styles.btn,
                    {
                      alignSelf: "flex-start",
                      backgroundColor: t.colors.card,
                      borderWidth: 1,
                      borderColor: t.colors.border,
                    },
                  ]}
                >
                  <MaterialIcons
                    name="open-in-new"
                    size={16}
                    color={t.colors.text}
                  />
                  <Text style={[styles.btnText, { color: t.colors.text }]}>
                    {" "}
                    Mở video
                  </Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      </Modal>
    );
  };

  /* ===== Guards ===== */
  if (tourLoading || regsLoading || brLoading || mLoading) {
    return (
      <View style={[styles.center, { backgroundColor: t.colors.background }]}>
        <ActivityIndicator color={t.colors.primary} />
      </View>
    );
  }
  if (tourErr || regsErr || brErr || mErr) {
    const msg =
      tourErr?.data?.message ||
      regsErr?.data?.message ||
      brErr?.data?.message ||
      mErr?.data?.message ||
      "Lỗi tải dữ liệu";
    return (
      <View style={[styles.page, { backgroundColor: t.colors.background }]}>
        <View
          style={[
            styles.card,
            { backgroundColor: t.chipWarnBg, borderColor: t.chipWarnBd },
          ]}
        >
          <Text style={{ color: t.chipWarnFg }}>{String(msg)}</Text>
        </View>
      </View>
    );
  }
  if (!canManage) {
    return (
      <View style={[styles.page, { backgroundColor: t.colors.background }]}>
        <View
          style={[
            styles.card,
            { backgroundColor: t.chipWarnBg, borderColor: t.chipWarnBd },
          ]}
        >
          <Text style={{ color: t.chipWarnFg, marginBottom: 8 }}>
            Bạn không có quyền truy cập trang này.
          </Text>
          <Pressable
            style={[
              styles.btn,
              {
                backgroundColor: t.colors.card,
                borderWidth: 1,
                borderColor: t.colors.border,
              },
            ]}
            onPress={() => router.push(`/tournament/${id}/home`)}
          >
            <Text style={[styles.btnText, { color: t.colors.text }]}>
              Quay lại trang giải
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  /* ======================== Themed atoms ======================== */
  const Card = ({ children, style }) => (
    <View
      style={[
        styles.card,
        {
          backgroundColor: t.colors.card,
          borderColor: t.colors.border,
          shadowColor: t.dark ? "transparent" : "#000",
        },
        style,
      ]}
    >
      {children}
    </View>
  );
  const Row = ({ children, style, onPress }) => (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.row,
        style,
        pressed && onPress ? { opacity: 0.85 } : null,
      ]}
    >
      {children}
    </Pressable>
  );
  const HStack = ({ children, style }) => (
    <View style={[styles.hstack, style]}>{children}</View>
  );
  const VStack = ({ children, style }) => (
    <View style={[styles.vstack, style]}>{children}</View>
  );
  const Spacer = () => <View style={{ flex: 1 }} />;

  const Chip = ({ label, icon, outlined, style }) => (
    <View
      style={[
        outlined
          ? {
              flexDirection: "row",
              alignItems: "center",
              borderWidth: 1,
              borderColor: t.colors.border,
              borderRadius: 16,
              paddingVertical: 3,
              paddingHorizontal: 8,
              backgroundColor: t.colors.card,
            }
          : {
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: t.chipDefaultBg,
              borderRadius: 16,
              paddingVertical: 3,
              paddingHorizontal: 8,
            },
        style,
      ]}
    >
      {icon}
      <Text
        style={{
          fontSize: 12,
          color: outlined ? t.colors.text : t.chipDefaultFg,
          marginLeft: icon ? 4 : 0,
        }}
      >
        {label}
      </Text>
    </View>
  );

  const StatusPill = ({ status }) => {
    const k = String(status || "").toLowerCase();
    const map = {
      scheduled: {
        bg: t.chipDefaultBg,
        fg: t.chipDefaultFg,
        label: "Chưa xếp",
      },
      queued: { bg: t.chipInfoBg, fg: t.chipInfoFg, label: "Trong hàng chờ" },
      assigned: {
        bg: t.chipDefaultBg,
        fg: t.chipDefaultFg,
        label: "Đã gán sân",
      },
      live: { bg: t.chipWarnBg, fg: t.chipWarnFg, label: "Đang thi đấu" },
      finished: {
        bg: t.chipSuccessBg,
        fg: t.chipSuccessFg,
        label: "Đã kết thúc",
      },
    };
    const v = map[k] || {
      bg: t.chipDefaultBg,
      fg: t.chipDefaultFg,
      label: status || "—",
    };
    return (
      <View
        style={{
          borderRadius: 12,
          paddingVertical: 3,
          paddingHorizontal: 8,
          backgroundColor: v.bg,
        }}
      >
        <Text style={{ fontSize: 12, fontWeight: "600", color: v.fg }}>
          {v.label}
        </Text>
      </View>
    );
  };

  const ProgressBar = ({ value, height = 8 }) => (
    <View
      style={{
        width: "100%",
        backgroundColor: t.track,
        borderRadius: 6,
        overflow: "hidden",
        height,
      }}
    >
      <View
        style={{
          height: "100%",
          width: `${Math.max(0, Math.min(100, value))}%`,
          backgroundColor: t.colors.primary,
        }}
      />
    </View>
  );

  const ListHeader = ({ columns = [] }) => (
    <Row
      style={{
        backgroundColor: t.headerBg,
        borderTopLeftRadius: 8,
        borderTopRightRadius: 8,
      }}
    >
      {columns.map((c, idx) => (
        <Cell key={idx} flex={[1, 3, 3, 3, 2][idx] || 2} isHeader>
          {c}
        </Cell>
      ))}
    </Row>
  );

  const Cell = ({ children, flex = 1, align = "left", isHeader }) => (
    <View style={{ flex, paddingVertical: 8, paddingHorizontal: 8 }}>
      <Text
        style={[
          isHeader
            ? { fontSize: 12, color: t.muted, fontWeight: "600" }
            : { fontSize: 13, color: t.colors.text },
          align === "right" && { textAlign: "right" },
        ]}
        numberOfLines={2}
      >
        {children}
      </Text>
    </View>
  );

  const EmptyRow = ({ text }) => (
    <View style={{ padding: 12 }}>
      <Text style={{ color: t.muted }}>{text}</Text>
    </View>
  );

  const IconCircle = ({ name }) => (
    <View
      style={[
        styles.iconCircle,
        { backgroundColor: t.chipDefaultBg, borderColor: t.colors.border },
      ]}
    >
      <MaterialIcons name={name} size={20} color={t.colors.text} />
    </View>
  );

  /* ======================== UI ======================== */
  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.colors.background }}>
      <View style={[styles.page, { backgroundColor: t.colors.background }]}>
        {/* Header */}
        <Text
          style={[styles.title, { marginBottom: 10, color: t.colors.text }]}
          numberOfLines={1}
        >
          Tổng quan: {tour?.name}
        </Text>
        <HStack style={{ alignItems: "center", marginBottom: 12 }}>
          <HStack style={{ gap: 8 }}>
            <Pressable
              style={[
                styles.btn,
                {
                  backgroundColor: t.colors.card,
                  borderWidth: 1,
                  borderColor: t.colors.border,
                },
              ]}
              onPress={() => router.push(`/tournament/${id}/register`)}
            >
              <Text style={[styles.btnText, { color: t.colors.text }]}>
                Đăng ký
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.btn,
                {
                  backgroundColor: t.colors.card,
                  borderWidth: 1,
                  borderColor: t.colors.border,
                },
              ]}
              onPress={() => router.push(`/tournament/${id}/manage`)}
            >
              <Text style={[styles.btnText, { color: t.colors.text }]}>
                Quản lý giải
              </Text>
            </Pressable>
            <Pressable
              style={[styles.btnPrimary, { backgroundColor: t.colors.primary }]}
              onPress={() => router.push(`/tournament/${id}/draw`)}
            >
              <Text style={styles.btnPrimaryText}>Bốc thăm</Text>
            </Pressable>
          </HStack>
        </HStack>

        {/* KPI cards */}
        <HStack style={{ gap: 10, flexWrap: "wrap" }}>
          {/* Tổng đăng ký */}
          <Card style={{ flexBasis: "48%", flexGrow: 1 }}>
            <HStack style={{ alignItems: "center", gap: 12 }}>
              <IconCircle name="groups" />
              <VStack style={{ flex: 1 }}>
                <Text style={[styles.caption, { color: t.muted }]}>
                  Tổng đăng ký
                </Text>
                <Text style={[styles.kpi, { color: t.colors.text }]}>
                  {regTotal}
                </Text>
              </VStack>
            </HStack>
            <View style={[styles.divider, { backgroundColor: t.divider }]} />
            <HStack style={{ gap: 6, flexWrap: "wrap" }}>
              <Chip
                outlined
                icon={
                  <MaterialIcons
                    name="attach-money"
                    size={14}
                    color={t.colors.text}
                  />
                }
                label={`Đã nộp: ${regPaid}`}
              />
              <Chip
                outlined
                icon={
                  <MaterialIcons
                    name="check-circle"
                    size={14}
                    color={t.colors.text}
                  />
                }
                label={`Check-in: ${regCheckin}`}
              />
            </HStack>
          </Card>

          {/* Trận theo trạng thái */}
          <Card style={{ flexBasis: "48%", flexGrow: 1 }}>
            <HStack style={{ alignItems: "center", gap: 12 }}>
              <IconCircle name="sports-score" />
              <VStack style={{ flex: 1 }}>
                <Text style={[styles.caption, { color: t.muted }]}>
                  Trận theo trạng thái
                </Text>
                <HStack style={{ flexWrap: "wrap", gap: 6 }}>
                  {Object.entries(matchStatusCount).map(([k, v]) =>
                    k === "other" || v === 0 ? null : (
                      <Chip key={k} label={`${k}:${v}`} outlined />
                    )
                  )}
                </HStack>
              </VStack>
            </HStack>
            <View style={[styles.divider, { backgroundColor: t.divider }]} />
            <VStack style={{ gap: 8 }}>
              {["scheduled", "queued", "assigned", "live", "finished"].map(
                (k) => {
                  const total = allMatches.length || 1;
                  const val = matchStatusCount[k] || 0;
                  const pct = Math.round((val * 100) / total);
                  return (
                    <VStack key={k}>
                      <Text style={[styles.caption, { color: t.muted }]}>
                        {k} • {val}/{allMatches.length}
                      </Text>
                      <ProgressBar value={pct} height={6} />
                    </VStack>
                  );
                }
              )}
            </VStack>
          </Card>

          {/* Video gắn với trận */}
          <Card style={{ flexBasis: "48%", flexGrow: 1 }}>
            <HStack style={{ alignItems: "center", gap: 12 }}>
              <IconCircle name="movie" />
              <VStack style={{ flex: 1 }}>
                <Text style={[styles.caption, { color: t.muted }]}>
                  Video gắn với trận
                </Text>
                <Text style={[styles.kpi, { color: t.colors.text }]}>
                  {videoCount}
                </Text>
              </VStack>
            </HStack>
            <View style={[styles.divider, { backgroundColor: t.divider }]} />
            <Text style={[styles.caption, { color: t.muted }]}>
              Số trận đã gán URL video (live/VOD).
            </Text>
          </Card>

          {/* Tiến độ tổng */}
          <Card style={{ flexBasis: "48%", flexGrow: 1 }}>
            <HStack style={{ alignItems: "center", gap: 12 }}>
              <IconCircle name="done-all" />
              <VStack style={{ flex: 1 }}>
                <Text style={[styles.caption, { color: t.muted }]}>
                  Tiến độ tổng
                </Text>
                <Text style={[styles.kpi, { color: t.colors.text }]}>
                  {matchStatusCount.finished}/{allMatches.length}
                </Text>
              </VStack>
            </HStack>
            <View style={[styles.divider, { backgroundColor: t.divider }]} />
            <ProgressBar
              value={Math.round(
                ((matchStatusCount.finished || 0) * 100) /
                  (allMatches.length || 1)
              )}
              height={8}
            />
          </Card>
        </HStack>

        {/* Bracket progress */}
        <Card style={{ marginTop: 12 }}>
          <HStack style={{ alignItems: "center", marginBottom: 8 }}>
            <Text style={[styles.sectionTitle, { color: t.colors.text }]}>
              Tiến độ các bracket
            </Text>
            <Spacer />
            <Chip outlined label={`${brackets.length} bracket`} />
          </HStack>
          {bracketProgress.length === 0 ? (
            <View
              style={[
                styles.alert,
                { backgroundColor: t.chipInfoBg, borderColor: t.chipInfoBd },
              ]}
            >
              <Text style={{ color: t.chipInfoFg }}>Chưa có bracket nào.</Text>
            </View>
          ) : (
            <FlatList
              data={bracketProgress}
              keyExtractor={(b) => b._id}
              renderItem={({ item: b }) => {
                const pct = Math.round(
                  ((b.finished || 0) * 100) / (b.total || 1)
                );
                return (
                  <Card style={{ marginBottom: 8 }}>
                    <VStack style={{ gap: 6 }}>
                      <HStack
                        style={{
                          alignItems: "center",
                          gap: 6,
                          flexWrap: "wrap",
                        }}
                      >
                        <Text
                          style={[styles.subtitle, { color: t.colors.text }]}
                          numberOfLines={1}
                        >
                          {b.name}
                        </Text>
                        <Chip outlined label={TYPE_LABEL(b.type)} />
                        {typeof b.stage === "number" && (
                          <Chip outlined label={`Stage ${b.stage}`} />
                        )}
                      </HStack>
                      <Text style={[styles.caption, { color: t.muted }]}>
                        {b.finished}/{b.total} trận đã xong
                      </Text>
                      <ProgressBar value={pct} height={8} />
                    </VStack>
                  </Card>
                );
              }}
            />
          )}
        </Card>

        {/* Two columns: Upcoming & Recent (stacked on mobile) */}
        <HStack style={{ gap: 12, flexWrap: "wrap", marginTop: 12 }}>
          {/* Upcoming */}
          <Card style={{ flexBasis: "100%", flexGrow: 1 }}>
            <HStack style={{ alignItems: "center", marginBottom: 6 }}>
              <MaterialIcons name="schedule" size={18} color={t.colors.text} />
              <Text
                style={[
                  styles.sectionTitle,
                  { marginLeft: 6, color: t.colors.text },
                ]}
              >
                Trận sắp diễn ra
              </Text>
              <Spacer />
              <Chip outlined label={`${upcoming.length}`} />
            </HStack>
            <ListHeader
              columns={["Mã", "Cặp A", "Cặp B", "Giờ", "Trạng thái"]}
            />
            {upcoming.length === 0 ? (
              <EmptyRow text="Không có trận sắp diễn ra." />
            ) : (
              <FlatList
                data={upcoming}
                keyExtractor={(m) => String(m._id)}
                renderItem={({ item: m }) => (
                  <Row onPress={() => openMatch(m._id)}>
                    <Cell flex={1}>{matchCode(m)}</Cell>
                    <Cell flex={3}>{pairLabel(m?.pairA)}</Cell>
                    <Cell flex={3}>{pairLabel(m?.pairB)}</Cell>
                    <Cell flex={3}>{fmtDate(m?.scheduledAt)}</Cell>
                    <Cell flex={2} align="right">
                      <StatusPill status={m?.status} />
                    </Cell>
                  </Row>
                )}
                ItemSeparatorComponent={() => (
                  <View
                    style={[styles.separator, { backgroundColor: t.divider }]}
                  />
                )}
              />
            )}
          </Card>

          {/* Recent finished */}
          <Card style={{ flexBasis: "100%", flexGrow: 1 }}>
            <HStack style={{ alignItems: "center", marginBottom: 6 }}>
              <MaterialIcons
                name="play-circle"
                size={18}
                color={t.colors.text}
              />
              <Text
                style={[
                  styles.sectionTitle,
                  { marginLeft: 6, color: t.colors.text },
                ]}
              >
                Kết quả mới xong
              </Text>
              <Spacer />
              <Chip outlined label={`${recent.length}`} />
            </HStack>
            <ListHeader
              columns={["Mã", "Cặp A", "Cặp B", "Kết thúc", "Video"]}
            />
            {recent.length === 0 ? (
              <EmptyRow text="Chưa có trận nào kết thúc." />
            ) : (
              <FlatList
                data={recent}
                keyExtractor={(m) => String(m._id)}
                renderItem={({ item: m }) => (
                  <Row onPress={() => openMatch(m._id)}>
                    <Cell flex={1}>{matchCode(m)}</Cell>
                    <Cell flex={3}>{pairLabel(m?.pairA)}</Cell>
                    <Cell flex={3}>{pairLabel(m?.pairB)}</Cell>
                    <Cell flex={3}>{fmtDate(m?.finishedAt)}</Cell>
                    <Cell flex={2} align="right">
                      {m?.video ? (
                        <Pressable
                          style={styles.iconBtn}
                          onPress={() => Linking.openURL(String(m.video))}
                        >
                          <MaterialIcons
                            name="open-in-new"
                            size={18}
                            color={t.colors.text}
                          />
                        </Pressable>
                      ) : (
                        <Chip outlined label="—" />
                      )}
                    </Cell>
                  </Row>
                )}
                ItemSeparatorComponent={() => (
                  <View
                    style={[styles.separator, { backgroundColor: t.divider }]}
                  />
                )}
              />
            )}
          </Card>
        </HStack>

        {/* Viewer modal */}
        <MatchViewerModal
          visible={viewer.open}
          match={viewedMatch}
          onClose={closeMatch}
        />
      </View>
    </ScrollView>
  );
}

/* ======================== Styles (layout/spacing only) ======================== */
const styles = StyleSheet.create({
  page: { flex: 1, padding: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  title: { fontSize: 20, fontWeight: "600" },
  sectionTitle: { fontSize: 18, fontWeight: "600" },
  subtitle: { fontSize: 14, fontWeight: "600" },
  caption: { fontSize: 12 },
  kpi: { fontSize: 18, fontWeight: "700" },

  card: {
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  divider: { height: 1, marginVertical: 10 },

  hstack: { flexDirection: "row" },
  vstack: { flexDirection: "column" },

  row: { flexDirection: "row", alignItems: "center" },
  separator: { height: 1 },

  alert: { borderRadius: 10, padding: 12, borderWidth: 1 },

  btn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  btnText: { fontWeight: "600" },
  btnPrimary: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  btnPrimaryText: { color: "#fff", fontWeight: "700" },
  iconBtn: { padding: 6, alignItems: "center", justifyContent: "center" },

  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },

  modalRoot: { flex: 1, padding: 16 },
  modalTitle: { fontSize: 18, fontWeight: "700" },
  label: { fontSize: 12 },
  value: { fontSize: 14, fontWeight: "600" },
});
