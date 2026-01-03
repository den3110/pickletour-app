// app/contact/index.jsx — Mobile "Giải của tôi" + sticky header + expo-image cache
// - Guard đăng nhập (skipToken) + LoginPrompt
// - Realtime socket: match rooms + bracket rooms
// - Banner có nút Thu gọn/Mở rộng (finished mặc định thu gọn)
// - Sắp xếp TRONG MỖI GIẢI: LIVE → UPCOMING → FINISHED (phụ theo thời gian)
// - Điểm số ưu tiên scoreText, fallback gameScores/sets
// - NEW: Skeleton loading cho danh sách giải + trận

import {
  // SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import React, {
  useMemo,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import {
    SafeAreaView,
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import { Stack, router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { MaterialIcons } from "@expo/vector-icons";
import { useSelector } from "react-redux";
import { skipToken } from "@reduxjs/toolkit/query";
import { useListMyTournamentsQuery } from "@/slices/tournamentsApiSlice";
import ResponsiveMatchViewer from "@/components/match/ResponsiveMatchViewer";
import { normalizeUrl } from "@/utils/normalizeUri";
import { useSocket } from "@/context/SocketContext";
import { useTheme } from "@react-navigation/native";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";

/* ================= Theme ================= */
function useThemeTokens() {
  // 1) Lấy theme từ React Navigation (nếu có)
  const navTheme = useTheme?.() || {};
  // 2) Fallback: nếu đứng ngoài ThemeProvider, dùng system scheme
  const scheme = useColorScheme?.() || "light";
  const isDark =
    typeof navTheme.dark === "boolean" ? navTheme.dark : scheme === "dark";

  const primary = navTheme?.colors?.primary ?? (isDark ? "#7cc0ff" : "#0a84ff");
  const text = navTheme?.colors?.text ?? (isDark ? "#f7f7f7" : "#0b1220");
  const cardBg = navTheme?.colors?.card ?? (isDark ? "#11161c" : "#ffffff");
  const border = navTheme?.colors?.border ?? (isDark ? "#212a33" : "#e8edf3");
  const bg = navTheme?.colors?.background ?? (isDark ? "#0b0f14" : "#fafbff");

  return {
    isDark,
    // base palette
    colors: {
      primary,
      text,
      card: cardBg,
      border,
      background: bg,
    },

    // text phụ & nền phụ
    sub: isDark ? "#b9c1cc" : "#586174",
    muted: isDark ? "#0f141a" : "#f3f6fb",
    inputBg: isDark ? "#0f141a" : "#f5f7fb",

    // chips
    chipBg: isDark ? "#121a22" : "#eef2f7",

    // accents
    tint: primary,
    success: "#22c55e",
    danger: "#ef4444",
    warning: "#f59e0b",
    shadow: "rgba(16,24,40,0.08)",

    // info chips (xanh nhạt)
    chipInfoBg: isDark ? "#1f2937" : "#eef2f7",
    chipInfoFg: isDark ? "#e5e7eb" : "#263238",
    chipInfoBd: isDark ? "#334155" : "#e2e8f0",
  };
}
function toneColor(tone, tokens) {
  switch (tone) {
    case "live":
    case "ongoing":
      return tokens.warning;
    case "scheduled":
    case "upcoming":
      return tokens.tint;
    case "finished":
      return tokens.success;
    default:
      return tokens.tint;
  }
}

/* ================= Utils ================= */
const dateFmt = (s) => {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
};
const stripVN = (s = "") =>
  String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
const nameWithNick = (p) => {
  if (!p) return "—";
  const nick = p.nickName || p.nickname || p.nick || p.alias;
  return nick?.trim() || p.fullName || p.name || "—";
};
const teamLabel = (team, eventType) => {
  if (!team) return "—";
  if (team.name) return team.name;
  const players =
    team.players ||
    team.members ||
    [team.player1, team.player2].filter(Boolean) ||
    [];
  if (!players.length) return "—";
  if (eventType === "single") return nameWithNick(players[0]);
  if (players.length === 1) return nameWithNick(players[0]);
  return `${nameWithNick(players[0])} & ${nameWithNick(players[1])}`;
};
function roundText(m) {
  if (m.roundName) return m.roundName;
  if (m.phase) return m.phase;
  if (Number.isFinite(m.rrRound)) return `Vòng bảng ${m.rrRound}`;
  if (Number.isFinite(m.swissRound)) return `Swiss ${m.swissRound}`;
  if (Number.isFinite(m.round)) return `Vòng ${m.round}`;
  return "—";
}
const isLive = (m) =>
  ["live", "ongoing", "playing", "inprogress"].includes(
    String(m?.status || "").toLowerCase()
  );
const isFinished = (m) => String(m?.status || "").toLowerCase() === "finished";
const isScheduled = (m) =>
  [
    "scheduled",
    "upcoming",
    "pending",
    "queued",
    "assigning",
    "assigned",
  ].includes(String(m?.status || "").toLowerCase());
const statusRank = (m) =>
  isLive(m) ? 0 : isScheduled(m) ? 1 : isFinished(m) ? 2 : 3;
const whenOf = (m) =>
  new Date(
    m?.scheduledAt || m?.startTime || m?.time || m?.createdAt || 0
  ).getTime() || 0;

/* ================= Small UI bits ================= */
function ChipToggle({ active, label, onPress, tokens, style, tone }) {
  const c = toneColor(tone, tokens);
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: active ? c + "1a" : tokens.chipBg,
          borderColor: active ? c : tokens.colors.border,
        },
        style,
      ]}
    >
      <Text
        style={{
          fontSize: 12,
          fontWeight: "700",
          color: active ? c : tokens.sub,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
function StatusChip({ status, tokens }) {
  const c =
    status === "live"
      ? tokens.warning
      : status === "finished"
      ? tokens.success
      : tokens.tint;
  const bg = c + "22";
  const fg = c;
  return (
    <View
      style={[styles.chip, { backgroundColor: bg, borderColor: "transparent" }]}
    >
      <Text style={{ fontSize: 12, fontWeight: "700", color: fg }}>
        {status === "live"
          ? "Đang diễn ra"
          : status === "finished"
          ? "Đã kết thúc"
          : "Sắp diễn ra"}
      </Text>
    </View>
  );
}
function SmallMeta({ icon, text, tokens }) {
  return (
    <View style={styles.metaItem}>
      <MaterialIcons name={icon} size={14} color={tokens.sub} />
      <Text
        style={{ color: tokens.sub, fontSize: 12, marginLeft: 6 }}
        numberOfLines={1}
      >
        {text}
      </Text>
    </View>
  );
}

/* ====== Điểm số: ưu tiên scoreText, fallback gameScores/sets ====== */
function formatScoreFromMatch(m) {
  if (typeof m?.scoreText === "string" && m.scoreText.trim()) {
    return m.scoreText.trim();
  }
  const arr =
    (Array.isArray(m?.gameScores) && m.gameScores.length && m.gameScores) ||
    (Array.isArray(m?.sets) && m.sets) ||
    [];
  if (!arr.length) return "—";
  return arr
    .map((s) => `${s.a ?? s.home ?? 0}-${s.b ?? s.away ?? 0}`)
    .join("  |  ");
}
function ScoreBadgeFromMatch({ m, tokens }) {
  const text = formatScoreFromMatch(m);
  return (
    <View
      style={[
        styles.scoreBadge,
        { backgroundColor: tokens.muted, borderColor: tokens.colors.border },
      ]}
    >
      <Text style={{ fontWeight: "700", color: tokens.colors.text }}>
        {text}
      </Text>
    </View>
  );
}

/* ========== Skeleton components ========== */

function SkeletonBlock({
  width = "100%",
  height = 14,
  radius = 8,
  style,
  tokens,
}) {
  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: tokens.muted,
          overflow: "hidden",
        },
        style,
      ]}
    />
  );
}

function SkeletonMatchRow({ tokens }) {
  return (
    <View
      style={[
        styles.matchRow,
        {
          borderColor: tokens.colors.border,
          backgroundColor: tokens.colors.card,
        },
      ]}
    >
      <View style={[styles.matchAccent, { backgroundColor: tokens.muted }]} />
      <View style={{ flex: 1, gap: 8 }}>
        <SkeletonBlock tokens={tokens} width="70%" height={14} />
        <SkeletonBlock tokens={tokens} width="55%" height={14} />
        <SkeletonBlock
          tokens={tokens}
          width={90}
          height={18}
          radius={10}
          style={{ marginTop: 2 }}
        />
        <View
          style={{
            flexDirection: "row",
            gap: 12,
            marginTop: 4,
          }}
        >
          <SkeletonBlock tokens={tokens} width={80} height={12} />
          <SkeletonBlock tokens={tokens} width={70} height={12} />
          <SkeletonBlock tokens={tokens} width={60} height={12} />
        </View>
      </View>
      <View style={styles.chev}>
        <SkeletonBlock tokens={tokens} width={16} height={16} radius={8} />
      </View>
    </View>
  );
}

function SkeletonTournamentCard({ tokens }) {
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: tokens.colors.card,
          borderColor: tokens.colors.border,
          shadowColor: tokens.shadow,
        },
      ]}
    >
      {/* Banner skeleton */}
      <View style={styles.bannerContainer}>
        <SkeletonBlock tokens={tokens} width="100%" height="100%" radius={0} />
      </View>

      <View style={{ padding: 14, gap: 10 }}>
        {/* Meta date + title */}
        <SkeletonBlock tokens={tokens} width="70%" height={18} />
        <SkeletonBlock tokens={tokens} width="45%" height={14} />

        {/* Search skeleton */}
        <SkeletonBlock
          tokens={tokens}
          width="100%"
          height={36}
          radius={12}
          style={{ marginTop: 4 }}
        />

        {/* Filter chips */}
        <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
          <SkeletonBlock tokens={tokens} width={90} height={26} radius={999} />
          <SkeletonBlock tokens={tokens} width={100} height={26} radius={999} />
          <SkeletonBlock tokens={tokens} width={96} height={26} radius={999} />
        </View>

        {/* A few match rows */}
        <View style={{ gap: 10, marginTop: 8 }}>
          <SkeletonMatchRow tokens={tokens} />
          <SkeletonMatchRow tokens={tokens} />
        </View>
      </View>
    </View>
  );
}

function SkeletonHeader({ tokens }) {
  return (
    <View
      style={[
        styles.stickyHeader,
        {
          backgroundColor: tokens.colors.background,
          borderBottomColor: tokens.colors.border,
        },
      ]}
    >
      <View style={styles.pageHeader}>
        <SkeletonBlock
          tokens={tokens}
          width={140}
          height={22}
          radius={6}
          style={{ marginBottom: 10, marginTop: 4 }}
        />
        <SkeletonBlock
          tokens={tokens}
          width="100%"
          height={38}
          radius={12}
          style={{ marginBottom: 8 }}
        />
        <SkeletonBlock tokens={tokens} width={160} height={14} radius={6} />
      </View>
    </View>
  );
}

/* ================= Rows / Cards ================= */
function MatchRow({ m, onPress, tokens, eventType }) {
  const a = m.teamA || m.home || m.teams?.[0] || m.pairA;
  const b = m.teamB || m.away || m.teams?.[1] || m.pairB;
  const status = m.status || (m.winner ? "finished" : "scheduled");
  const court = m.courtName || m.court || "";
  const when = m.scheduledAt || m.startTime || m.time;

  const accent =
    status === "live"
      ? tokens.warning
      : status === "finished"
      ? tokens.success
      : tokens.tint;

  return (
    <Pressable
      onPress={() => onPress?.(m)}
      style={({ pressed }) => [
        styles.matchRow,
        {
          borderColor: tokens.colors.border,
          backgroundColor: tokens.colors.card,
          opacity: pressed ? 0.9 : 1,
          shadowColor: tokens.shadow,
        },
      ]}
    >
      <View style={[styles.matchAccent, { backgroundColor: accent }]} />
      <View style={{ flex: 1, gap: 6 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text
            numberOfLines={1}
            style={[styles.team, { color: tokens.colors.text }]}
          >
            {teamLabel(a, eventType)}
          </Text>
          <StatusChip status={status} tokens={tokens} />
        </View>
        <Text
          numberOfLines={1}
          style={[styles.team, { color: tokens.colors.text }]}
        >
          {teamLabel(b, eventType)}
        </Text>

        {/* realtime score */}
        <ScoreBadgeFromMatch m={m} tokens={tokens} />

        <View style={styles.metaRow}>
          <SmallMeta icon="event" text={dateFmt(when)} tokens={tokens} />
          {!!court && (
            <SmallMeta
              icon="sports-tennis"
              text={`Sân ${court}`}
              tokens={tokens}
            />
          )}
          <SmallMeta icon="schedule" text={roundText(m)} tokens={tokens} />
        </View>
      </View>

      <View style={styles.chev}>
        <MaterialIcons name="chevron-right" size={22} color={tokens.sub} />
      </View>
    </Pressable>
  );
}

/** ===== Banner: expo-image + gradient + nút collapse/expand ===== */
function Banner({ t, tokens, collapsed, onToggle }) {
  const status = t.status;
  const statusText =
    status === "ongoing"
      ? "Đang diễn ra"
      : status === "finished"
      ? "Đã kết thúc"
      : "Sắp diễn ra";
  const statusColor =
    status === "ongoing"
      ? tokens.warning
      : status === "finished"
      ? tokens.success
      : tokens.tint;

  const uri = t.image || t.cover || t.bannerUrl || null;

  return (
    <View style={styles.bannerWrap}>
      <View style={styles.bannerContainer}>
        {uri ? (
          <Image
            source={{ uri: normalizeUrl(uri) }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={250}
            cachePolicy="memory-disk"
            recyclingKey={String(t._id || uri)}
            priority="high"
          />
        ) : (
          <View
            style={[StyleSheet.absoluteFill, { backgroundColor: "#11161c" }]}
          />
        )}

        {/* Lớp tối nhẹ + gradient đáy */}
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: "rgba(0,0,0,0.22)" },
          ]}
        />
        <LinearGradient
          colors={["rgba(0,0,0,0.00)", "rgba(0,0,0,0.55)"]}
          style={StyleSheet.absoluteFill}
        />

        {/* Nội dung */}
        <View style={styles.bannerInner}>
          <View style={{ flex: 1 }}>
            <Text
              numberOfLines={2}
              style={[styles.bannerTitle, { color: "#fff" }]}
            >
              {t.name || "Giải đấu"}
            </Text>
            {!!t.location && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginTop: 6,
                }}
              >
                <MaterialIcons name="location-pin" size={16} color="#fff" />
                <Text
                  numberOfLines={1}
                  style={{ color: "#fff", marginLeft: 6, opacity: 0.9 }}
                >
                  {t.location}
                </Text>
              </View>
            )}
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={[styles.statusTag, { backgroundColor: statusColor }]}>
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>
                {statusText}
              </Text>
            </View>

            {/* Nút toggle collapse */}
            <Pressable
              onPress={onToggle}
              style={({ pressed }) => [
                styles.bannerToggleBtn,
                {
                  backgroundColor: "rgba(255,255,255,0.14)",
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={collapsed ? "Mở chi tiết" : "Thu gọn"}
            >
              <MaterialIcons
                name={collapsed ? "expand-more" : "expand-less"}
                size={18}
                color="#fff"
              />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

/* ===== TournamentCard ===== */
function TournamentCard({ t, onOpenMatch, tokens }) {
  // Collapse toàn bộ nội dung dưới banner (mặc định finished → collapsed)
  const [collapsed, setCollapsed] = useState(t.status === "finished");

  // "Xem thêm" chỉ điều khiển số lượng hiển thị
  const [expanded, setExpanded] = useState(false);
  const [matchQuery, setMatchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState(
    new Set(["scheduled", "live", "finished"])
  );

  const matches = Array.isArray(t.matches) ? t.matches : [];

  // lọc + SẮP XẾP: LIVE → UPCOMING → FINISHED (phụ theo thời gian)
  const filteredSortedMatches = useMemo(() => {
    const q = stripVN(matchQuery);
    const base = matches.filter((m) => {
      const status = m.status || (m.winner ? "finished" : "scheduled");
      if (!statusFilter.has(status)) return false;
      if (!q) return true;
      const a = m.teamA || m.home || m.teams?.[0] || m.pairA;
      const b = m.teamB || m.away || m.teams?.[1] || m.pairB;
      const hay = [
        teamLabel(a, t.eventType),
        teamLabel(b, t.eventType),
        roundText(m),
        m.courtName || m.court || "",
      ]
        .map(stripVN)
        .join(" | ");
      return hay.includes(q);
    });

    // sort theo rank rồi theo thời gian tăng dần
    return base.slice().sort((a, b) => {
      const ra = statusRank(a);
      const rb = statusRank(b);
      if (ra !== rb) return ra - rb;
      const wa = whenOf(a);
      const wb = whenOf(b);
      return wa - wb;
    });
  }, [matches, matchQuery, statusFilter, t.eventType]);

  const shown = expanded
    ? filteredSortedMatches
    : filteredSortedMatches.slice(0, 5);
  const hasMore = filteredSortedMatches.length > shown.length;

  const toggleStatus = (key) =>
    setStatusFilter((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      if (n.size === 0) n.add(key);
      return n;
    });

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: tokens.colors.card,
          borderColor: tokens.colors.border,
          shadowColor: tokens.shadow,
        },
      ]}
    >
      <Banner
        t={t}
        tokens={tokens}
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
      />

      {/* Nội dung có thể thu gọn toàn bộ */}
      {!collapsed && (
        <View style={{ padding: 14, gap: 10 }}>
          {/* Meta date */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <MaterialIcons name="calendar-month" size={18} color={tokens.sub} />
            <Text style={{ color: tokens.sub, fontSize: 13 }}>
              {(t.startDate || t.startAt) && (t.endDate || t.endAt)
                ? `${dateFmt(t.startDate || t.startAt)}  →  ${dateFmt(
                    t.endDate || t.endAt
                  )}`
                : "—"}
            </Text>
          </View>

          {/* SEARCH MATCHES + FILTERS */}
          <View
            style={[
              styles.searchRow,
              {
                backgroundColor: tokens.inputBg,
                borderColor: tokens.colors.border,
              },
            ]}
          >
            <MaterialIcons name="search" size={18} color={tokens.sub} />
            <TextInput
              placeholder="Tìm trận (VĐV, vòng, sân...)"
              placeholderTextColor={tokens.sub}
              value={matchQuery}
              onChangeText={setMatchQuery}
              style={[styles.input]}
            />
            {matchQuery ? (
              <Pressable onPress={() => setMatchQuery("")}>
                <MaterialIcons name="close" size={18} color={tokens.sub} />
              </Pressable>
            ) : null}
          </View>

          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <ChipToggle
              label="Sắp diễn ra"
              active={statusFilter.has("scheduled")}
              onPress={() => toggleStatus("scheduled")}
              tokens={tokens}
              tone="upcoming"
            />
            <ChipToggle
              label="Đang diễn ra"
              active={statusFilter.has("live")}
              onPress={() => toggleStatus("live")}
              tokens={tokens}
              tone="ongoing"
            />
            <ChipToggle
              label="Đã kết thúc"
              active={statusFilter.has("finished")}
              onPress={() => toggleStatus("finished")}
              tokens={tokens}
              tone="finished"
            />
            {!!matchQuery || statusFilter.size !== 3 ? (
              <Pressable
                onPress={() => {
                  setMatchQuery("");
                  setStatusFilter(new Set(["scheduled", "live", "finished"]));
                }}
              >
                <Text
                  style={{ color: tokens.tint, fontWeight: "700", padding: 6 }}
                >
                  Reset
                </Text>
              </Pressable>
            ) : null}
          </View>

          {/* LIST MATCHES */}
          {filteredSortedMatches.length === 0 ? (
            <View
              style={[
                styles.emptyMatches,
                { borderColor: tokens.colors.border },
              ]}
            >
              <Text style={{ fontSize: 28, marginBottom: 4 }}>🎾</Text>
              <Text style={{ color: tokens.sub }}>
                Không có trận phù hợp bộ lọc.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {shown.map((m) => (
                <MatchRow
                  key={m._id}
                  m={m}
                  onPress={onOpenMatch}
                  tokens={tokens}
                  eventType={t.eventType}
                />
              ))}

              {hasMore && (
                <Pressable
                  onPress={() => setExpanded((v) => !v)}
                  style={[
                    styles.showMoreBtn,
                    {
                      borderColor: tokens.colors.border,
                      backgroundColor: tokens.muted,
                    },
                  ]}
                >
                  <Text
                    style={{ color: tokens.colors.text, fontWeight: "700" }}
                  >
                    {expanded
                      ? "Thu gọn"
                      : `Xem tất cả ${filteredSortedMatches.length} trận`}
                  </Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

/* ======= Login Prompt ======= */
function LoginPrompt({ tokens }) {
  const goLogin = useCallback(() => {
    router.push("/login");
  }, []);
  return (
    <View
      style={[styles.loginWrap, { backgroundColor: tokens.colors.background }]}
    >
      <View
        style={[
          styles.loginCard,
          {
            backgroundColor: tokens.colors.card,
            borderColor: tokens.colors.border,
          },
        ]}
      >
        <View
          style={[styles.lockIcon, { backgroundColor: tokens.tint + "1A" }]}
        >
          <MaterialIcons name="lock" size={28} color={tokens.tint} />
        </View>
        <Text style={[styles.loginTitle, { color: tokens.colors.text }]}>
          Hãy đăng nhập để xem{" "}
          <Text style={{ fontWeight: "700" }}>Giải của tôi</Text>
        </Text>
        <Text style={{ color: tokens.sub, textAlign: "center", marginTop: 6 }}>
          Sau khi đăng nhập, bạn sẽ thấy danh sách các giải mình đã tham gia,
          lịch thi đấu và kết quả cá nhân.
        </Text>

        <Pressable
          onPress={goLogin}
          style={({ pressed }) => [
            styles.loginBtn,
            {
              backgroundColor: tokens.tint,
              opacity: pressed ? 0.9 : 1,
              shadowColor: tokens.shadow,
            },
          ]}
        >
          <MaterialIcons name="login" size={18} color="#fff" />
          <Text style={{ color: "#fff", fontWeight: "800", marginLeft: 8 }}>
            Đăng nhập
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ================= Page ================= */
export default function MyTournament() {
  const tokens = useThemeTokens();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [matchId, setMatchId] = useState(null);

  const socket = useSocket();

  const { userInfo } = useSelector((s) => s?.auth || {});
  const isAuthed = !!(userInfo?.token || userInfo?._id || userInfo?.email);

  const queryArg = isAuthed
    ? { withMatches: 1, matchLimit: 200, page: 1, limit: 50 }
    : skipToken;
  const { data, isLoading, isError, refetch, isFetching } =
    useListMyTournamentsQuery(queryArg);

  /* ========= Realtime layer ========= */
  const liveMapRef = useRef(new Map()); // id → match
  const pendingRef = useRef(new Map());
  const rafRef = useRef(null);
  const [liveBump, setLiveBump] = useState(0);
  const joinedMatchesRef = useRef(new Set()); // Set<matchId>
  const subscribedBracketsRef = useRef(new Set()); // Set<bracketId>

  const tournamentsRaw = useMemo(() => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.items)) return data.items;
    return [];
  }, [data]);

  const matchesKey = useMemo(() => {
    const ids =
      tournamentsRaw
        .flatMap((t) => (Array.isArray(t.matches) ? t.matches : []))
        .map((m) => String(m._id))
        .filter(Boolean)
        .sort() || [];
    return ids.join(",");
  }, [tournamentsRaw]);

  const bracketsKey = useMemo(() => {
    const ids =
      tournamentsRaw
        .flatMap((t) => (Array.isArray(t.matches) ? t.matches : []))
        .map((m) => String(m?.bracket?._id || m?.bracket))
        .filter(Boolean)
        .sort() || [];
    return Array.from(new Set(ids)).join(",");
  }, [tournamentsRaw]);

  const flushPending = useCallback(() => {
    if (!pendingRef.current.size) return;
    const mp = liveMapRef.current;
    for (const [mid, inc] of pendingRef.current) {
      const cur = mp.get(mid);
      mp.set(mid, { ...(cur || {}), ...inc });
    }
    pendingRef.current.clear();
    setLiveBump((x) => x + 1);
  }, []);

  const queueUpsert = useCallback(
    (payload) => {
      const incRaw = payload?.data ?? payload?.match ?? payload;
      const inc = incRaw?._id ? incRaw : null;
      if (!inc) return;

      const normalizeEntity = (v) => {
        if (v == null) return v;
        if (typeof v === "string" || typeof v === "number") return v;
        if (typeof v === "object") {
          return {
            _id: v._id ?? (typeof v.id === "string" ? v.id : undefined),
            name:
              (typeof v.name === "string" && v.name) ||
              (typeof v.label === "string" && v.label) ||
              (typeof v.title === "string" && v.title) ||
              "",
          };
        }
        return v;
      };
      if (inc.court) inc.court = normalizeEntity(inc.court);
      if (inc.venue) inc.venue = normalizeEntity(inc.venue);
      if (inc.location) inc.location = normalizeEntity(inc.location);

      pendingRef.current.set(String(inc._id), inc);
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        flushPending();
      });
    },
    [flushPending]
  );

  // Seed từ API
  useEffect(() => {
    const mp = new Map();
    for (const t of tournamentsRaw) {
      const list = Array.isArray(t.matches) ? t.matches : [];
      for (const m of list) if (m?._id) mp.set(String(m._id), m);
    }
    liveMapRef.current = mp;
    setLiveBump((x) => x + 1);
  }, [tournamentsRaw]);

  // Socket listeners
  useEffect(() => {
    if (!socket) return;

    const onUpsert = (payload) => queueUpsert(payload);
    const onRemove = (payload) => {
      const id = String(payload?.id ?? payload?._id ?? "");
      if (!id) return;
      if (liveMapRef.current.has(id)) {
        liveMapRef.current.delete(id);
        setLiveBump((x) => x + 1);
      }
    };
    const onRefilled = () => {
      refetch();
    };
    const onConnected = () => {
      subscribedBracketsRef.current.forEach((bid) =>
        socket.emit("draw:subscribe", { bracketId: bid })
      );
      joinedMatchesRef.current.forEach((mid) => {
        socket.emit("match:join", { matchId: mid });
        socket.emit("match:snapshot:request", { matchId: mid });
      });
    };

    socket.on("connect", onConnected);
    socket.on("match:update", onUpsert);
    socket.on("match:patched", onUpsert);
    socket.on("match:snapshot", onUpsert);
    socket.on("score:updated", onUpsert);
    socket.on("score:update", onUpsert);
    socket.on("match:deleted", onRemove);
    socket.on("draw:refilled", onRefilled);
    socket.on("bracket:updated", onRefilled);

    return () => {
      socket.off("connect", onConnected);
      socket.off("match:update", onUpsert);
      socket.off("match:patched", onUpsert);
      socket.off("match:snapshot", onUpsert);
      socket.off("score:updated", onUpsert);
      socket.off("score:update", onUpsert);
      socket.off("match:deleted", onRemove);
      socket.off("draw:refilled", onRefilled);
      socket.off("bracket:updated", onRefilled);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [socket, queueUpsert, refetch]);

  // Subscribe/unsubscribe brackets theo diff
  useEffect(() => {
    if (!socket) return;
    const nextIds = bracketsKey ? bracketsKey.split(",") : [];
    const cur = subscribedBracketsRef.current;
    const nextSet = new Set(nextIds);

    nextSet.forEach((bid) => {
      if (!cur.has(bid)) socket.emit("draw:subscribe", { bracketId: bid });
    });
    cur.forEach((bid) => {
      if (!nextSet.has(bid))
        socket.emit("draw:unsubscribe", { bracketId: bid });
    });
    subscribedBracketsRef.current = nextSet;

    return () => {
      nextSet.forEach((bid) =>
        socket.emit("draw:unsubscribe", { bracketId: bid })
      );
    };
  }, [socket, bracketsKey]);

  // Join/leave match rooms theo diff
  useEffect(() => {
    if (!socket) return;

    const nextIds =
      tournamentsRaw
        .flatMap((t) => (Array.isArray(t.matches) ? t.matches : []))
        .map((m) => String(m._id))
        .filter(Boolean) ?? [];

    const curSet = joinedMatchesRef.current;
    const nextSet = new Set(nextIds);

    nextSet.forEach((mid) => {
      if (!curSet.has(mid)) {
        socket.emit("match:join", { matchId: mid });
        socket.emit("match:snapshot:request", { matchId: mid });
      }
    });
    curSet.forEach((mid) => {
      if (!nextSet.has(mid)) socket.emit("match:leave", { matchId: mid });
    });

    joinedMatchesRef.current = nextSet;

    return () => {
      nextSet.forEach((mid) => socket.emit("match:leave", { matchId: mid }));
    };
  }, [socket, matchesKey, tournamentsRaw]);

  // Merge realtime vào từng giải
  const liveMatchesByTid = useMemo(() => {
    const mp = new Map();
    const all = Array.from(liveMapRef.current.values());
    for (const m of all) {
      const tid = m?.tournament?._id || m?.tournament;
      if (!tid) continue;
      const k = String(tid);
      if (!mp.has(k)) mp.set(k, []);
      mp.get(k).push(m);
    }
    return mp;
  }, [liveBump]);

  const tournamentsMerged = useMemo(() => {
    return tournamentsRaw.map((t) => {
      const merged = liveMatchesByTid.get(String(t._id));
      return merged ? { ...t, matches: merged } : t;
    });
  }, [tournamentsRaw, liveMatchesByTid]);

  /* ========= GLOBAL filter ========= */
  const [tourQuery, setTourQuery] = useState("");
  const [tourStatus, setTourStatus] = useState(
    new Set(["upcoming", "ongoing", "finished"])
  );
  const tournaments = useMemo(() => {
    const q = stripVN(tourQuery);
    return tournamentsMerged.filter((t) => {
      if (!tourStatus.has(t.status)) return false;
      if (!q) return true;
      const hay = [t.name, t.location].map(stripVN).join(" | ");
      return hay.includes(q);
    });
  }, [tournamentsMerged, tourQuery, tourStatus]);

  const handleOpenMatch = useCallback((m) => {
    setMatchId(m?._id);
    setOpen(true);
  }, []);

  const StickyHeader = (
    <View
      style={[
        styles.stickyHeader,
        {
          backgroundColor: tokens.colors.background,
          borderBottomColor: tokens.colors.border,
        },
      ]}
    >
      <View style={styles.pageHeader}>
        <Text style={[styles.pageTitle, { color: tokens.colors.text }]}>
          Giải của tôi
        </Text>

        <View
          style={[
            styles.searchRow,
            {
              backgroundColor: tokens.inputBg,
              borderColor: tokens.colors.border,
              marginTop: 10,
            },
          ]}
        >
          <MaterialIcons name="search" size={18} color={tokens.sub} />
          <TextInput
            placeholder="Tìm giải (tên, địa điểm)"
            placeholderTextColor={tokens.sub}
            value={tourQuery}
            onChangeText={setTourQuery}
            style={styles.input}
          />
          {tourQuery ? (
            <Pressable onPress={() => setTourQuery("")}>
              <MaterialIcons name="close" size={18} color={tokens.sub} />
            </Pressable>
          ) : null}
        </View>

        {!!tournaments?.length && (
          <Text style={[styles.pageSub, { color: tokens.sub }]}>
            {tournaments.length} giải phù hợp
          </Text>
        )}
      </View>
    </View>
  );

  const EmptyState = (
    <View style={styles.emptyWrap}>
      <Text style={{ fontSize: 42, marginBottom: 6 }}>🏆</Text>
      <Text
        style={{ color: tokens.colors.text, fontWeight: "800", fontSize: 16 }}
      >
        Chưa có giải nào
      </Text>
      <Text style={{ color: tokens.sub, marginTop: 4, textAlign: "center" }}>
        Tham gia giải để theo dõi lịch đấu và kết quả của bạn tại đây.
      </Text>
    </View>
  );

  return (
    <BottomSheetModalProvider>
      <SafeAreaView
        style={{ flex: 1, backgroundColor: tokens.colors.background }}
      >
        <Stack.Screen
          options={{ title: "Giải của tôi", headerTitleAlign: "center" }}
        />

        {!isAuthed ? (
          <LoginPrompt tokens={tokens} />
        ) : isLoading ? (
          // 🔥 Skeleton loading
          <FlatList
            data={[1, 2, 3]}
            keyExtractor={(i) => String(i)}
            renderItem={() => <SkeletonTournamentCard tokens={tokens} />}
            contentContainerStyle={[
              styles.screen,
              {
                backgroundColor: tokens.colors.background,
                paddingBottom: (insets?.bottom ?? 0) + 28,
              },
            ]}
            ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
            ListHeaderComponent={<SkeletonHeader tokens={tokens} />}
            ListFooterComponent={
              <View style={{ height: (insets?.bottom ?? 0) + 12 }} />
            }
          />
        ) : (
          <FlatList
            data={tournaments}
            keyExtractor={(t) => String(t._id)}
            contentContainerStyle={[
              styles.screen,
              {
                backgroundColor: tokens.colors.background,
                paddingBottom: (insets?.bottom ?? 0) + 28,
              },
            ]}
            ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
            renderItem={({ item }) => (
              <TournamentCard
                t={item}
                onOpenMatch={handleOpenMatch}
                tokens={tokens}
              />
            )}
            ListHeaderComponent={StickyHeader}
            stickyHeaderIndices={[0]}
            contentInset={{ bottom: insets?.bottom ?? 0 }}
            scrollIndicatorInsets={{ bottom: insets?.bottom ?? 0 }}
            removeClippedSubviews={
              Platform.OS === "android" ? false : undefined
            }
            ListEmptyComponent={EmptyState}
            refreshControl={
              <RefreshControl
                refreshing={isFetching}
                onRefresh={refetch}
                tintColor={tokens.tint}
                colors={[tokens.tint]}
                progressBackgroundColor={tokens.colors.card}
              />
            }
            ListFooterComponent={
              <View style={{ height: (insets?.bottom ?? 0) + 12 }} />
            }
          />
        )}

        <ResponsiveMatchViewer
          open={open}
          matchId={matchId}
          onClose={() => setOpen(false)}
        />
      </SafeAreaView>
    </BottomSheetModalProvider>
  );
}

/* ================= Styles ================= */
const styles = StyleSheet.create({
  screen: { padding: 16, paddingTop: 0 },

  stickyHeader: {
    zIndex: 10,
    elevation: 3,
    borderBottomWidth: 1,
  },
  pageHeader: { paddingBottom: 10 },
  pageTitle: {
    fontSize: 20,
    fontWeight: Platform.select({ ios: "700", android: "700", default: "700" }),
  },
  pageSub: { marginTop: 6 },

  searchRow: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: Platform.select({ ios: 10, android: 6 }),
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  input: {
    flex: 1,
    paddingVertical: Platform.select({ ios: 6, android: 2 }),
    fontSize: 14,
  },

  card: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: "hidden",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },

  /* Banner */
  bannerWrap: { width: "100%" },
  bannerContainer: {
    width: "100%",
    height: 140,
    overflow: "hidden",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: "#11161c",
  },
  bannerInner: {
    flex: 1,
    padding: 14,
    paddingTop: 18,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    justifyContent: "space-between",
  },
  bannerTitle: {
    fontSize: 18,
    fontWeight: Platform.select({
      ios: "800",
      android: "700",
      default: "700",
    }),
  },
  statusTag: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  bannerToggleBtn: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },

  chip: {
    paddingHorizontal: 10,
    paddingVertical: Platform.select({ ios: 6, android: 4 }),
    borderRadius: 999,
    borderWidth: 1,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 4,
  },
  metaItem: { flexDirection: "row", alignItems: "center" },

  team: {
    fontSize: 15,
    fontWeight: Platform.select({
      ios: "700",
      android: "700",
      default: "700",
    }),
  },
  matchRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    gap: 12,
  },
  matchAccent: { width: 4, borderRadius: 999 },
  scoreBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 2,
  },
  chev: { alignSelf: "center", paddingLeft: 8 },

  showMoreBtn: {
    alignSelf: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },

  emptyWrap: {
    paddingTop: 40,
    paddingBottom: 80,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  emptyMatches: {
    backgroundColor: "transparent",
    borderStyle: "dashed",
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },

  /* Login prompt */
  loginWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  loginCard: {
    width: "100%",
    maxWidth: 520,
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
  },
  lockIcon: {
    width: 56,
    height: 56,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  loginTitle: {
    fontSize: 18,
    fontWeight: Platform.select({
      ios: "800",
      android: "700",
      default: "800",
    }),
    textAlign: "center",
  },
  loginBtn: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
});
