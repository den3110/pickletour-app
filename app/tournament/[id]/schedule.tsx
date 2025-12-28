// app/tournament/[id]/EnhancedSchedule.jsx
/* eslint-disable react/prop-types */
import {
  Ionicons,
  MaterialCommunityIcons,
  MaterialIcons,
} from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  useColorScheme,
  View,
  Animated,
  Easing,
  Platform, // Cần cho shadow/elevation
} from "react-native";
import { useSelector } from "react-redux";

import ResponsiveMatchViewer from "@/components/match/ResponsiveMatchViewer";
import {
  useGetTournamentQuery,
  useListPublicMatchesByTournamentQuery,
  useListTournamentBracketsQuery,
} from "@/slices/tournamentsApiSlice";
import { useSocket } from "@/context/SocketContext";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";

/* ----------------------------------------------------- */
/* ------------------- CÁC HÀM HELPER VÀ LOGIC GIỮ NGUYÊN ------------------- */
/* ----------------------------------------------------- */

// Hàm Helpers từ code gốc (giữ nguyên logic)
const _idsFromList = (list) => {
  if (!list) return [];
  const arr = Array.isArray(list) ? list : [list];
  return arr
    .map((x) => String(x?.user?._id ?? x?.user ?? x?._id ?? x?.id ?? x).trim())
    .filter(Boolean);
};
const _hasMe = (list, me) => {
  if (!me?._id) return false;
  const my = String(me._id);
  return _idsFromList(list).includes(my);
};
const isAdminUser = (me) =>
  !!(
    me?.isAdmin ||
    me?.role === "admin" ||
    (Array.isArray(me?.roles) && me.roles.includes("admin"))
  );
const isManagerOfTournament = (tour, me) => {
  if (!tour || !me?._id) return false;
  const my = String(me._id);
  const createdBy = String(tour?.createdBy?._id ?? tour?.createdBy ?? "");
  if (createdBy && createdBy === my) return true;
  if (tour?.isManager) return true;
  if (_hasMe(tour?.managers, me)) return true;
  if (_hasMe(tour?.admins, me)) return true;
  if (_hasMe(tour?.organizers, me)) return true;
  return false;
};
const isRefereeOfTournament = (tour, matches, me) => {
  if (!me?._id) return false;
  if (_hasMe(tour?.referees, me)) return true;
  if (_hasMe(tour?.judges, me)) return true;
  if (_hasMe(tour?.scorers, me)) return true;
  if (Array.isArray(matches)) {
    for (const m of matches) {
      const raw = m?.referees ?? m?.referee ?? m?.judges ?? [];
      const arr = Array.isArray(raw) ? raw : [raw];
      const ids = _idsFromList(arr);
      if (ids.includes(String(me._id))) return true;
    }
  }
  return false;
};
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

function orderKey(m) {
  const bo = m?.bracket?.order ?? 9999;
  const r = m?.round ?? 9999;
  const o = m?.order ?? 9999;
  const codeNum =
    typeof m?.code === "string" ? Number(m.code.replace(/[^\d]/g, "")) : 9999;
  const ts = m?.createdAt ? new Date(m.createdAt).getTime() : 9e15;
  return [bo, r, o, codeNum, ts];
}
function pairToName(pair) {
  if (!pair) return null;
  const p1 = pair.player1?.nickName || pair.player1?.fullName;
  const p2 = pair.player2?.nickName || pair.player2?.fullName;
  const name = [p1, p2].filter(Boolean).join(" / ");
  return name || null;
}
function seedToName(seed) {
  return seed?.label || null;
}
function teamNameFrom(m, side) {
  if (!m) return "TBD";
  const pair = side === "A" ? m.pairA : m.pairB;
  const seed = side === "A" ? m.seedA : m.seedB;
  return pairToName(pair) || seedToName(seed) || "TBD";
}
function scoreText(m) {
  if (typeof m?.scoreText === "string" && m.scoreText.trim())
    return m.scoreText;
  if (Array.isArray(m?.gameScores) && m.gameScores.length) {
    return m.gameScores.map((s) => `${s?.a ?? 0}-${s?.b ?? 0}`).join(", ");
  }
  return "";
}
function courtNameOf(m) {
  return (
    (m?.courtName && m.courtName.trim()) ||
    m?.court?.name ||
    m?.courtLabel ||
    "Chưa phân sân"
  );
}
const hasAssignedCourt = (m) =>
  String(courtNameOf(m)).toLowerCase().includes("chưa phân sân") === false;

/* ----------------------------------------------------- */
/* ------------------- THEME VÀ UTILITY REDESIGN ------------------- */
/* ----------------------------------------------------- */

// Theme Tối giản & Hiện đại
function useThemeTokens() {
  const scheme = useColorScheme() ?? "light";
  const isDark = scheme === "dark";
  return useMemo(
    () => ({
      scheme,
      // Base (Tối giản hơn)
      bg: isDark ? "#080a0e" : "#f5f8fa", // Nền tổng thể rất nhạt
      cardBg: isDark ? "#101317" : "#ffffff", // Thẻ nền sạch
      softBg: isDark ? "#1b1e22" : "#f0f4f7",
      border: isDark ? "#2a2f36" : "#e2e8ec", // Viền mỏng
      text: isDark ? "#eef1f5" : "#1e293b",
      textSecondary: isDark ? "#cbd5e1" : "#475569",
      muted: isDark ? "#94a3b8" : "#64748b",
      icon: isDark ? "#d1d5db" : "#334155",
      // Primary/Accent
      tint: isDark ? "#63b3ed" : "#1a73e8", // Xanh dương hiện đại
      accentBg: isDark ? "rgba(99, 179, 237, 0.15)" : "#e6f0ff",
      // Status Colors
      live: "#e65100", // Cam cháy (Live) - Mạnh mẽ hơn
      liveSoft: isDark ? "rgba(230,81,0,0.15)" : "#fff8e6",
      upcoming: "#4a4e53", // Xám đậm (Finished)
      finished: "#0b6623", // Xanh lá cây đậm (Upcoming)
      // Chip variants
      chipLiveBg: "#e65100", // Live chip nền đầy đủ màu
      chipLiveFg: "#ffffff",
      chipFinishedBg: isDark ? "#1c2128" : "#f0f4f7",
      chipFinishedFg: isDark ? "#eef1f5" : "#1e293b",
      // Alerts & Tabs
      infoBg: isDark ? "rgba(30, 144, 255, 0.1)" : "#e8f0fe",
      infoBd: isDark ? "#1d4ed8" : "#bfdbfe",
      infoText: isDark ? "#a0c4ff" : "#1a73e8",
      tabBg: isDark ? "#1c1e22" : "#f8fafc",
      tabBd: isDark ? "#2a2f36" : "#e2e8f0",
      tabActiveBg: isDark ? "rgba(99, 179, 237, 0.15)" : "#e6f0ff",
      tabActiveBd: isDark ? "#63b3ed" : "#90caf9",
      tabText: isDark ? "#d1d5db" : "#334155",
      tabTextActive: isDark ? "#cde9ff" : "#1a73e8",
      // Skeleton
      skeleton: isDark ? "rgba(255,255,255,0.08)" : "#e5e7eb",
    }),
    [scheme]
  );
}

function getChipColors(type, T) {
  switch (type) {
    case "live":
      return { bg: T.chipLiveBg, fg: T.chipLiveFg, bd: T.chipLiveBg };
    case "finished":
      return {
        bg: T.chipFinishedBg,
        fg: T.chipFinishedFg,
        bd: T.border,
      };
    case "outlined":
      return {
        bg: "transparent",
        fg: T.muted,
        bd: T.border,
      };
    case "default":
    default:
      return {
        bg: T.softBg,
        fg: T.text,
        bd: "transparent",
      };
  }
}

/* ----------------------------------------------------- */
/* ------------------- CÁC COMPONENT UI REDESIGN ------------------- */
/* ----------------------------------------------------- */

function Chip({ text, type = "default", icon, theme, style }) {
  const c = getChipColors(type, theme);
  const isOutline = type === "outlined" || type === "finished";

  return (
    <View
      style={[
        stylesNew.chip,
        {
          backgroundColor: c.bg,
          borderColor: c.bd,
          borderWidth: isOutline ? 1 : 0,
        },
        style,
      ]}
    >
      {!!icon && <View style={{ marginRight: 4 }}>{icon}</View>}
      <Text
        style={[
          stylesNew.chipText,
          { color: c.fg },
          (type === "live" || type === "finished") && { fontWeight: "700" },
        ]}
        numberOfLines={1}
      >
        {text}
      </Text>
    </View>
  );
}
function ChipRow({ children, style }) {
  return <View style={[stylesNew.chipRow, style]}>{children}</View>;
}

function StatusChip({ m, theme }) {
  if (isLive(m))
    return (
      <Chip
        theme={theme}
        type="live"
        text="LIVE"
        icon={
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: theme.chipLiveFg,
              marginRight: 2,
            }}
          />
        }
      />
    );
  if (isFinished(m))
    return (
      <Chip
        theme={theme}
        type="finished"
        text="KẾT THÚC"
        icon={
          <MaterialIcons name="check" size={12} color={theme.chipFinishedFg} />
        }
      />
    );
  return (
    <Chip
      theme={theme}
      type="outlined"
      text="SẮP DIỄN RA"
      icon={<MaterialIcons name="schedule" size={12} color={theme.muted} />}
    />
  );
}

/* Match Card (Redesign Triệt để) */
function MatchCard({ m, onOpenMatch, theme }) {
  const isLiveMatch = isLive(m);
  const isFinishMatch = isFinished(m);
  const statusColor = isLiveMatch
    ? theme.live
    : isFinishMatch
    ? theme.finished
    : theme.upcoming;
  const winnerSide = m?.winner === "A" ? "A" : m?.winner === "B" ? "B" : null;
  const teamA = teamNameFrom(m, "A");
  const teamB = teamNameFrom(m, "B");
  const score = scoreText(m);

  const [isPressing, setIsPressing] = useState(false);

  // Animation cho Live match
  const pulseAnim = useRef(new Animated.Value(0.2)).current;
  useEffect(() => {
    if (isLiveMatch) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.6,
            duration: 1000,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0.2,
            duration: 1000,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(0);
    }
  }, [isLiveMatch, pulseAnim]);

  const stripOpacity = isLiveMatch ? pulseAnim : 1;

  return (
    <Pressable
      onPress={() => onOpenMatch?.(m._id)}
      onPressIn={() => setIsPressing(true)}
      onPressOut={() => setIsPressing(false)}
      style={[
        stylesNew.matchCard,
        {
          backgroundColor: theme.cardBg,
          borderColor: theme.border,
          transform: [{ scale: isPressing ? 0.99 : 1 }],
          ...Platform.select({
            ios: {
              shadowColor: statusColor,
              shadowOpacity: isLiveMatch ? 0.3 : 0.05,
              shadowRadius: isLiveMatch ? 8 : 4,
              shadowOffset: { height: isLiveMatch ? 4 : 2, width: 0 },
            },
            android: {
              elevation: isLiveMatch ? 6 : 1,
            },
          }),
        },
      ]}
    >
      {/* 1. Status Strip (Hiệu ứng Live Pulse) */}
      <Animated.View
        style={[
          stylesNew.statusBar,
          { backgroundColor: statusColor, opacity: stripOpacity },
        ]}
      />

      <View style={stylesNew.matchCardInner}>
        {/* Row 1: Code + Metadata */}
        <View style={stylesNew.matchHeader}>
          <Text style={[stylesNew.matchCode, { color: theme.muted }]}>
            {m.code || "Trận"}
          </Text>
          <View style={{ flex: 1, minWidth: 0 }} />
          <StatusChip m={m} theme={theme} />
        </View>

        {/* Row 2: Teams & Score (Phần quan trọng nhất) */}
        <View style={stylesNew.matchTeamsAndScore}>
          {/* Team A */}
          <View style={{ flex: 1, alignItems: "flex-start" }}>
            <Text
              style={[
                stylesNew.teamName,
                {
                  color:
                    winnerSide === "A" || !isFinishMatch
                      ? theme.text
                      : theme.muted,
                },
                winnerSide === "A" && { fontWeight: "900", color: theme.tint }, // Bold/Accent for Winner
              ]}
              numberOfLines={1}
            >
              {teamA}
            </Text>
          </View>

          {/* Score Center */}
          <View style={stylesNew.scoreCenter}>
            {score ? (
              <Text style={[stylesNew.scoreText, { color: statusColor }]}>
                {score.replace(/, /g, " - ")}
              </Text>
            ) : (
              <Text style={[stylesNew.scoreText, { color: theme.muted }]}>
                vs
              </Text>
            )}
          </View>

          {/* Team B */}
          <View style={{ flex: 1, alignItems: "flex-end" }}>
            <Text
              style={[
                stylesNew.teamName,
                {
                  color:
                    winnerSide === "B" || !isFinishMatch
                      ? theme.text
                      : theme.muted,
                },
                winnerSide === "B" && { fontWeight: "900", color: theme.tint }, // Bold/Accent for Winner
              ]}
              numberOfLines={1}
            >
              {teamB}
            </Text>
          </View>
        </View>

        {/* Row 3: Metadata (Court, Bracket) */}
        <View style={stylesNew.matchMeta}>
          <ChipRow style={{ justifyContent: "center", marginTop: 4 }}>
            <Chip
              theme={theme}
              type="default"
              text={courtNameOf(m)}
              icon={
                <MaterialIcons
                  name="sports-handball"
                  size={12}
                  color={theme.textSecondary}
                />
              }
            />
            <Chip
              theme={theme}
              type="outlined"
              text={m.bracket?.name || m.phase || "Bracket"}
            />
          </ChipRow>
        </View>
      </View>
    </Pressable>
  );
}

/* Row cho Court Status (Compact & Orderly) */
// 1. Live Banner Row (Nhấn mạnh score và đội)
function MatchBannerRow({ m, onOpenMatch, theme }) {
  const score = scoreText(m);
  const teamA = teamNameFrom(m, "A");
  const teamB = teamNameFrom(m, "B");

  return (
    <Pressable
      key={m._id}
      onPress={() => onOpenMatch?.(m._id)}
      style={({ pressed }) => [
        stylesNew.bannerRow,
        { opacity: pressed ? 0.8 : 1 },
        { borderColor: theme.live },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[stylesNew.bannerCode, { color: theme.live }]}>
          {m.code || "Trận"}
        </Text>
        <Text
          style={[stylesNew.bannerTeam, { color: theme.text }]}
          numberOfLines={1}
        >
          {teamA}
        </Text>
        <Text
          style={[stylesNew.bannerTeam, { color: theme.text }]}
          numberOfLines={1}
        >
          {teamB}
        </Text>
      </View>
      <View style={stylesNew.bannerScore}>
        <Text style={[stylesNew.bannerScoreText, { color: theme.live }]}>
          {score || "LIVE"}
        </Text>
      </View>
    </Pressable>
  );
}

// 2. Queue Row (Tối giản)
function MatchQueueRow({ m, onOpenMatch, theme, order }) {
  const teamA = teamNameFrom(m, "A");
  const teamB = teamNameFrom(m, "B");

  return (
    <Pressable
      key={m._id}
      onPress={() => onOpenMatch?.(m._id)}
      style={({ pressed }) => [
        stylesNew.queueRowRedesign,
        { opacity: pressed ? 0.8 : 1 },
      ]}
    >
      <View style={[stylesNew.orderBadge, { backgroundColor: theme.accentBg }]}>
        <Text style={{ fontSize: 11, fontWeight: "700", color: theme.tint }}>
          {order}
        </Text>
      </View>
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
        <Text
          style={[
            stylesNew.queueMatchCode,
            { color: theme.muted, marginRight: 8 },
          ]}
          numberOfLines={1}
        >
          {m.code || "Trận"}
        </Text>
        <Text
          style={[stylesNew.queueVsText, { color: theme.textSecondary }]}
          numberOfLines={1}
        >
          {teamA} vs {teamB}
        </Text>
      </View>
    </Pressable>
  );
}

/* Court Card (Redesign - Live Banner & Compact Queue) */
function CourtStatusCard({ court, queueLimit = 4, onOpenMatch, theme }) {
  const hasLive = court.live.length > 0;
  const hasQueue = court.queue.length > 0;
  const isUnassigned = court.name.toLowerCase().includes("chưa phân sân");

  return (
    <View
      style={[
        stylesNew.statusCard,
        { borderColor: theme.border, backgroundColor: theme.cardBg },
      ]}
    >
      <View style={stylesNew.statusCardHead}>
        <Text
          style={[
            stylesNew.statusCourtName,
            { color: theme.text, opacity: isUnassigned ? 0.7 : 1 },
          ]}
        >
          <MaterialCommunityIcons
            name={isUnassigned ? "alert-circle-outline" : "tennis"}
            size={16}
            color={isUnassigned ? theme.muted : theme.tint}
            style={{ marginRight: 4 }}
          />{" "}
          {court.name}
        </Text>
        <Chip
          theme={theme}
          type="outlined"
          text={`(${court.live.length} Live`}
        />
      </View>

      {/* Live Matches (As a Banner/Primary focus) */}
      {hasLive && (
        <View
          style={[
            stylesNew.courtSection,
            stylesNew.liveBanner,
            {
              borderBottomColor: theme.border,
              backgroundColor: theme.liveSoft,
            },
          ]}
        >
          <Text
            style={[
              stylesNew.sectionLabel,
              { color: theme.live, marginBottom: 8 },
            ]}
          >
            <MaterialCommunityIcons
              name="lightning-bolt"
              size={14}
              color={theme.live}
            />{" "}
            ĐANG DIỄN RA
          </Text>
          {court.live.map((m) => (
            <View key={m._id} style={stylesNew.liveMatchBanner}>
              <MatchBannerRow
                key={m._id}
                m={m}
                onOpenMatch={onOpenMatch}
                theme={theme}
                isLive={true}
              />
            </View>
          ))}
        </View>
      )}

      {/* Queue Matches (Compact List) */}
      {hasQueue && !isUnassigned && (
        <View style={stylesNew.courtSection}>
          <Text
            style={[
              stylesNew.sectionLabel,
              { color: theme.textSecondary, marginBottom: 8 },
            ]}
          >
            <MaterialIcons
              name="format-list-numbered"
              size={14}
              color={theme.textSecondary}
            />{" "}
            HÀNG CHỜ ({court.queue.length})
          </Text>
          {court.queue.slice(0, queueLimit).map((m, index) => (
            <MatchQueueRow
              key={m._id}
              m={m}
              onOpenMatch={onOpenMatch}
              theme={theme}
              order={index + 1}
            />
          ))}
          {court.queue.length > queueLimit && (
            <Text
              style={[
                stylesNew.queueMoreText,
                { color: theme.muted, marginTop: 8 },
              ]}
            >
              ... và {court.queue.length - queueLimit} trận tiếp theo
            </Text>
          )}
        </View>
      )}

      {isUnassigned && !hasLive && !hasQueue && (
        <Text
          style={[
            stylesNew.queueMoreText,
            { color: theme.muted, padding: 8, textAlign: "center" },
          ]}
        >
          Chưa có trận đấu nào được gán cho sân này.
        </Text>
      )}
    </View>
  );
}

/* ----------------------------------------------------- */
/* ------------------- SKELETON REDESIGN ------------------- */
/* ----------------------------------------------------- */
function Pulse({ style, theme }) {
  const opacity = React.useRef(new Animated.Value(0.6)).current;
  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.quad),
        }),
        Animated.timing(opacity, {
          toValue: 0.6,
          duration: 700,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.quad),
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View
      style={[
        { backgroundColor: theme.skeleton, borderRadius: 8 },
        style,
        { opacity },
      ]}
    />
  );
}
function Line({ w = "100%", h = 12, style, theme }) {
  return (
    <Pulse
      theme={theme}
      style={[{ width: w, height: h, borderRadius: 6 }, style]}
    />
  );
}
function Circle({ size = 24, style, theme }) {
  return (
    <Pulse
      theme={theme}
      style={[{ width: size, height: size, borderRadius: size / 2 }, style]}
    />
  );
}
function ChipGhost({ w = 70, theme }) {
  return (
    <Pulse theme={theme} style={{ width: w, height: 18, borderRadius: 999 }} />
  );
}
function CourtStatusCardSkeleton({ theme }) {
  return (
    <View
      style={[
        stylesNew.statusCard,
        { borderColor: theme.border, backgroundColor: theme.cardBg },
      ]}
    >
      <View style={stylesNew.statusCardHead}>
        <Line theme={theme} w={120} h={16} />
        <ChipGhost theme={theme} w={80} />
      </View>
      <View
        style={[stylesNew.courtSection, { borderBottomColor: theme.border }]}
      >
        <Line theme={theme} w={100} h={14} style={{ marginBottom: 12 }} />
        <View style={stylesNew.liveMatchBanner}>
          <View
            style={[
              stylesNew.bannerRow,
              {
                borderLeftWidth: 0,
                paddingVertical: 10,
                alignItems: "stretch",
              },
            ]}
          >
            <View style={{ flex: 1, gap: 4 }}>
              <Line theme={theme} w={40} h={12} />
              <Line theme={theme} w={"80%"} h={14} />
              <Line theme={theme} w={"80%"} h={14} />
            </View>
            <Line theme={theme} w={40} h={20} />
          </View>
        </View>
      </View>
      <View style={stylesNew.courtSection}>
        <Line theme={theme} w={120} h={14} style={{ marginBottom: 12 }} />
        {[...Array(2)].map((_, i) => (
          <View
            key={i}
            style={[stylesNew.queueRowRedesign, { paddingVertical: 8 }]}
          >
            <Circle theme={theme} size={18} />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Line theme={theme} w={"70%"} h={14} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
function MatchCardSkeleton({ theme }) {
  return (
    <View
      style={[
        stylesNew.matchCard,
        {
          backgroundColor: theme.cardBg,
          borderColor: theme.border,
          height: 130,
          paddingVertical: 12,
        },
      ]}
    >
      <View
        style={[stylesNew.statusBar, { backgroundColor: theme.skeleton }]}
      />
      <View style={stylesNew.matchCardInner}>
        {/* Row 1: Header */}
        <View style={stylesNew.matchHeader}>
          <Line theme={theme} w={40} h={14} />
          <View style={{ flex: 1, minWidth: 0 }} />
          <ChipGhost theme={theme} w={80} />
        </View>
        {/* Row 2: Teams & Score */}
        <View
          style={[
            stylesNew.matchTeamsAndScore,
            { marginVertical: 8, paddingHorizontal: 4 },
          ]}
        >
          <Line theme={theme} w={"35%"} h={18} />
          <Line theme={theme} w={40} h={22} />
          <Line theme={theme} w={"35%"} h={18} />
        </View>
        {/* Row 3: Meta */}
        <View
          style={[
            stylesNew.matchMeta,
            { flexDirection: "row", justifyContent: "center", gap: 6 },
          ]}
        >
          <ChipGhost theme={theme} w={100} />
          <ChipGhost theme={theme} w={90} />
        </View>
      </View>
    </View>
  );
}
function PageSkeleton({ theme }) {
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 900;

  if (isLargeScreen) {
    return (
      <View style={[stylesNew.container, { flexDirection: "row" }]}>
        {/* Cột Status (Tương đương 1/3) */}
        <View style={{ flex: 1, minWidth: 300, maxWidth: 400, gap: 12 }}>
          <View
            style={[
              stylesNew.card,
              { borderColor: theme.border, backgroundColor: theme.cardBg },
            ]}
          >
            <View style={stylesNew.cardHeader}>
              <Circle theme={theme} size={18} />
              <View style={{ marginLeft: 8 }}>
                <Line theme={theme} w={160} h={16} />
              </View>
            </View>
            <CourtStatusCardSkeleton theme={theme} />
            <CourtStatusCardSkeleton theme={theme} />
          </View>
        </View>
        {/* Cột All Matches (Tương đương 2/3) */}
        <View style={{ flex: 2, minWidth: 400, marginLeft: 12, gap: 12 }}>
          <View
            style={[
              stylesNew.card,
              { borderColor: theme.border, backgroundColor: theme.cardBg },
            ]}
          >
            <View style={stylesNew.cardHeader}>
              <Line theme={theme} w={200} h={16} />
            </View>
            <View style={{ gap: 8 }}>
              {[...Array(6)].map((_, i) => (
                <MatchCardSkeleton key={i} theme={theme} />
              ))}
            </View>
          </View>
        </View>
      </View>
    );
  }

  // Layout 1 cột trên màn hình nhỏ (Mobile/Tablet dọc)
  return (
    <ScrollView contentContainerStyle={stylesNew.container}>
      <View
        style={[
          stylesNew.card,
          { borderColor: theme.border, backgroundColor: theme.cardBg },
        ]}
      >
        <View style={stylesNew.cardHeader}>
          <Circle theme={theme} size={18} />
          <View style={{ marginLeft: 8 }}>
            <Line theme={theme} w={160} h={16} />
          </View>
        </View>
        <CourtStatusCardSkeleton theme={theme} />
        <CourtStatusCardSkeleton theme={theme} />
      </View>

      <View
        style={[
          stylesNew.card,
          { borderColor: theme.border, backgroundColor: theme.cardBg },
        ]}
      >
        <View style={stylesNew.cardHeader}>
          <Line theme={theme} w={200} h={16} />
        </View>
        <View style={{ gap: 8 }}>
          {[...Array(6)].map((_, i) => (
            <MatchCardSkeleton key={i} theme={theme} />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

/* ----------------------------------------------------- */
/* ------------------- MAIN COMPONENT ------------------- */
/* ----------------------------------------------------- */

export default function TournamentScheduleNative() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const me = useSelector((s) => s.auth?.userInfo || null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all"); // all | live | upcoming | finished
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedMatchId, setSelectedMatchId] = useState(null);

  const T = useThemeTokens();
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 900;
  const queueLimit = width >= 900 ? 6 : width >= 600 ? 4 : 3;

  // --- Data Fetching & Realtime Logic (Giữ nguyên logic gốc) ---
  const {
    data: tournament,
    isLoading: tLoading,
    error: tError,
  } = useGetTournamentQuery(id);
  const {
    data: matchesResp,
    isLoading: mLoading,
    error: mError,
    refetch: refetchMatches,
  } = useListPublicMatchesByTournamentQuery({
    tid: id,
    params: { limit: 1000 },
  });
  const { data: brackets = [], refetch: refetchBrackets } =
    useListTournamentBracketsQuery(id, {
      refetchOnMountOrArgChange: true,
      refetchOnFocus: true,
      refetchOnReconnect: true,
    });
  const loading = tLoading || mLoading;
  const errorMsg =
    (tError && (tError.data?.message || tError.error)) ||
    (mError && (mError.data?.message || mError.error));

  // Realtime layer (Giữ nguyên logic gốc: socket, liveMapRef, flushPending, queueUpsert, diffSet, useEffects...)
  const socket = useSocket();
  const liveMapRef = useRef(new Map());
  const [liveBump, setLiveBump] = useState(0);
  const pendingRef = useRef(new Map());
  const rafRef = useRef(null);
  const subscribedBracketsRef = useRef(new Set());
  const joinedMatchesRef = useRef(new Set());

  useEffect(() => {
    const mp = new Map();
    const list = matchesResp?.list || [];
    for (const m of list) if (m?._id) mp.set(String(m._id), m);
    liveMapRef.current = mp;
    setLiveBump((x) => x + 1);
  }, [matchesResp]);

  const flushPending = useCallback(() => {
    if (!pendingRef.current.size) return;
    const mp = liveMapRef.current;
    for (const [mid, inc] of pendingRef.current) {
      const cur = mp.get(mid);
      const vNew = Number(inc?.liveVersion ?? inc?.version ?? 0);
      const vOld = Number(cur?.liveVersion ?? cur?.version ?? 0);
      const merged = !cur || vNew >= vOld ? { ...(cur || {}), ...inc } : cur;
      mp.set(mid, merged);
    }
    pendingRef.current.clear();
    setLiveBump((x) => x + 1);
  }, []);

  const queueUpsert = useCallback(
    (incRaw) => {
      const inc = incRaw?.data ?? incRaw?.match ?? incRaw;
      if (!inc?._id) return;
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

  const diffSet = (currentSet, nextArr) => {
    const nextSet = new Set(nextArr);
    const added = [];
    const removed = [];
    nextSet.forEach((id) => {
      if (!currentSet.has(id)) added.push(id);
    });
    currentSet.forEach((id) => {
      if (!nextSet.has(id)) removed.push(id);
    });
    return { added, removed, nextSet };
  };

  useEffect(() => {
    if (!socket) return;
    const onUpsert = (p) => queueUpsert(p);
    const onRemove = (payload) => {
      const id = String(payload?.id ?? payload?._id ?? "");
      if (!id) return;
      if (liveMapRef.current.has(id)) {
        liveMapRef.current.delete(id);
        setLiveBump((x) => x + 1);
      }
    };
    const onRefilled = () => {
      refetchMatches();
      refetchBrackets();
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
    socket.on("match:snapshot", onUpsert);
    socket.on("score:updated", onUpsert);
    socket.on("match:deleted", onRemove);
    socket.on("draw:refilled", onRefilled);
    socket.on("bracket:updated", onRefilled);
    return () => {
      socket.off("connect", onConnected);
      socket.off("match:update", onUpsert);
      socket.off("match:snapshot", onUpsert);
      socket.off("score:updated", onUpsert);
      socket.off("match:deleted", onRemove);
      socket.off("draw:refilled", onRefilled);
      socket.off("bracket:updated", onRefilled);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [socket, queueUpsert, refetchMatches, refetchBrackets]);

  const bracketsKey = useMemo(
    () =>
      (brackets || [])
        .map((b) => String(b._id))
        .filter(Boolean)
        .sort()
        .join(","),
    [brackets]
  );
  useEffect(() => {
    if (!socket) return;
    const nextIds =
      (brackets || []).map((b) => String(b._id)).filter(Boolean) ?? [];
    const { added, removed, nextSet } = diffSet(
      subscribedBracketsRef.current,
      nextIds
    );
    added.forEach((bid) => socket.emit("draw:subscribe", { bracketId: bid }));
    removed.forEach((bid) =>
      socket.emit("draw:unsubscribe", { bracketId: bid })
    );
    subscribedBracketsRef.current = nextSet;
    return () => {
      nextSet.forEach((bid) =>
        socket.emit("draw:unsubscribe", { bracketId: bid })
      );
    };
  }, [socket, bracketsKey]);

  const matchesKey = useMemo(
    () =>
      ((matchesResp?.list || []).map((m) => String(m._id)) || [])
        .filter(Boolean)
        .sort()
        .join(","),
    [matchesResp]
  );
  useEffect(() => {
    if (!socket) return;
    const nextIds =
      (matchesResp?.list || []).map((m) => String(m._id)).filter(Boolean) ?? [];
    const { added, removed, nextSet } = diffSet(
      joinedMatchesRef.current,
      nextIds
    );
    added.forEach((mid) => {
      socket.emit("match:join", { matchId: mid });
      socket.emit("match:snapshot:request", { matchId: mid });
    });
    removed.forEach((mid) => socket.emit("match:leave", { matchId: mid }));
    joinedMatchesRef.current = nextSet;
    return () => {
      nextSet.forEach((mid) => socket.emit("match:leave", { matchId: mid }));
    };
  }, [socket, matchesKey]);

  // --- Data Processing (Giữ nguyên logic xử lý data) ---
  const matches = useMemo(
    () =>
      Array.from(liveMapRef.current.values()).filter(
        (m) => String(m?.tournament?._id || m?.tournament) === String(id)
      ),
    [id, liveBump]
  );
  const admin = useMemo(() => isAdminUser(me), [me]);
  const manager = useMemo(
    () => isManagerOfTournament(tournament, me) || admin,
    [tournament, me, admin]
  );
  const referee = useMemo(
    () => isRefereeOfTournament(tournament, matches, me),
    [tournament, matches, me]
  );
  const allSorted = useMemo(() => {
    return [...matches].sort((a, b) => {
      const ak = orderKey(a);
      const bk = orderKey(b);
      for (let i = 0; i < ak.length; i++)
        if (ak[i] !== bk[i]) return ak[i] - bk[i];
      return 0;
    });
  }, [matches]);

  const filteredAll = useMemo(() => {
    const qnorm = q.trim().toLowerCase();
    let res = allSorted.filter((m) => {
      if (status === "live" && !isLive(m)) return false;
      if (
        status === "upcoming" &&
        !(isScheduled(m) && !isLive(m) && !isFinished(m))
      )
        return false;
      if (status === "finished" && !isFinished(m)) return false;
      if (!qnorm) return true;
      const hay = [
        m.code,
        teamNameFrom(m, "A"),
        teamNameFrom(m, "B"),
        m.bracket?.name,
        courtNameOf(m),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(qnorm);
    });

    // Cải tiến UX: Đẩy trận đã kết thúc xuống cuối khi ở tab "Tất cả"
    if (status === "all") {
      const notFinished = res.filter((m) => !isFinished(m));
      const finished = res.filter((m) => isFinished(m));
      res = [...notFinished, ...finished];
    }
    return res;
  }, [allSorted, q, status]);

  const courts = useMemo(() => {
    const map = new Map();
    allSorted.forEach((m) => {
      const name = courtNameOf(m);
      if (!map.has(name)) map.set(name, { name, live: [], queue: [] });

      if (isLive(m)) {
        map.get(name).live.push(m);
      } else if (!isFinished(m) && hasAssignedCourt(m)) {
        map.get(name).queue.push(m);
      }
    });

    const byKey = (a, b) => {
      const ak = orderKey(a);
      const bk = orderKey(b);
      for (let i = 0; i < ak.length; i++)
        if (ak[i] !== bk[i]) return ak[i] - bk[i];
      return 0;
    };
    map.forEach((v) => {
      v.live.sort(byKey);
      v.queue.sort(byKey);
    });

    // Ưu tiên: Trận đang Live > Queue có sân > Chưa phân sân
    const list = Array.from(map.values());
    list.sort((a, b) => {
      const aUn = a.name && a.name.toLowerCase().includes("chưa phân sân");
      const bUn = b.name && b.name.toLowerCase().includes("chưa phân sân");
      const aLiveCount = a.live.length;
      const bLiveCount = b.live.length;

      if (aLiveCount > bLiveCount) return -1;
      if (aLiveCount < bLiveCount) return 1;

      if (aUn && !bUn) return 1;
      if (!aUn && bUn) return -1;
      return 0;
    });
    return list;
  }, [allSorted]);

  // --- Viewer Logic ---
  const openViewer = useCallback((mid) => {
    setSelectedMatchId(mid);
    setViewerOpen(true);
  }, []);
  const closeViewer = useCallback(() => {
    setViewerOpen(false);
    setSelectedMatchId(null);
  }, []);

  // --- Render ---

  // Component cho phần Filter và Tabs (để tái sử dụng cho layout 2 cột)
  const FilterAndTabs = (
    <View
      style={[
        stylesNew.filterContainer,
        {
          backgroundColor: T.cardBg,
          borderBottomColor: T.border,
        },
      ]}
    >
      <View
        style={[
          stylesNew.searchInputWrapper,
          { backgroundColor: T.softBg, borderColor: T.border },
        ]}
      >
        <MaterialIcons name="search" size={18} color={T.muted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Tìm mã trận, người chơi, sân, bracket…"
          style={[
            stylesNew.searchInput,
            {
              color: T.text,
              backgroundColor: "transparent",
            },
          ]}
          placeholderTextColor={T.muted}
        />
      </View>

      <View style={stylesNew.statusTabs}>
        {[
          { key: "all", label: "Tất cả" },
          { key: "live", label: "Đang diễn ra" },
          { key: "upcoming", label: "Sắp diễn ra" },
          { key: "finished", label: "Đã diễn ra" },
        ].map((it) => {
          const active = status === it.key;
          return (
            <Pressable
              key={it.key}
              onPress={() => setStatus(it.key)}
              style={[
                stylesNew.tab,
                {
                  backgroundColor: T.tabBg,
                  borderColor: T.tabBd,
                },
                active && {
                  backgroundColor: T.tabActiveBg,
                  borderColor: T.tabActiveBd,
                },
              ]}
            >
              <Text
                style={[
                  stylesNew.tabText,
                  { color: T.tabText },
                  active && { color: T.tabTextActive, fontWeight: "700" },
                ]}
              >
                {it.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  // Nội dung của cột Status (Trực tiếp trên sân)
  const CourtStatusContent = (
    <View
      style={[
        stylesNew.card,
        { borderColor: T.border, backgroundColor: T.cardBg },
      ]}
    >
      <View style={stylesNew.cardHeader}>
        <MaterialCommunityIcons name="stadium" size={18} color={T.tint} />
        <View style={{ marginLeft: 8 }}>
          <Text style={[stylesNew.cardTitle, { color: T.text }]}>
            Trạng thái trực tiếp
          </Text>
          <Text style={[stylesNew.cardSub, { color: T.textSecondary }]}>
            Đang diễn ra & Hàng chờ
          </Text>
        </View>
      </View>
      {courts.length === 0 ? (
        <View
          style={[
            stylesNew.alertInfo,
            { borderColor: T.infoBd, backgroundColor: T.infoBg },
          ]}
        >
          <Text style={[stylesNew.alertInfoText, { color: T.infoText }]}>
            Chưa có trận nào được gán sân hoặc đang diễn ra.
          </Text>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          {courts.map((c) => (
            <CourtStatusCard
              key={c.name}
              court={c}
              queueLimit={queueLimit}
              onOpenMatch={openViewer}
              theme={T}
            />
          ))}
        </View>
      )}
    </View>
  );

  // Nội dung của cột All Matches (Danh sách đầy đủ)
  const AllMatchesContent = (
    <View
      style={[
        stylesNew.card,
        { borderColor: T.border, backgroundColor: T.cardBg },
        isLargeScreen && { flex: 1 },
      ]}
    >
      <View style={stylesNew.cardHeader}>
        <View>
          <Text style={[stylesNew.cardTitle, { color: T.text }]}>
            Danh sách tất cả các trận
          </Text>
          <Text style={[stylesNew.cardSub, { color: T.textSecondary }]}>
            Sắp xếp theo thứ tự trận đấu ({filteredAll.length} trận)
          </Text>
        </View>
      </View>

      {filteredAll.length === 0 ? (
        <View
          style={[
            stylesNew.alertInfo,
            { borderColor: T.infoBd, backgroundColor: T.infoBg },
          ]}
        >
          <Text style={[stylesNew.alertInfoText, { color: T.infoText }]}>
            Không có trận phù hợp bộ lọc hiện tại.
          </Text>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {filteredAll.map((m) => (
            <MatchCard key={m._id} m={m} onOpenMatch={openViewer} theme={T} />
          ))}
        </View>
      )}
    </View>
  );

  // Layout Responsive
  const ResponsiveContent = useMemo(() => {
    if (loading) return <PageSkeleton theme={T} />;

    if (errorMsg && !loading)
      return (
        <View
          style={[
            stylesNew.alertError,
            {
              borderColor: T.errBd,
              backgroundColor: T.errBg,
              margin: 12,
            },
          ]}
        >
          <Text style={[stylesNew.alertErrorText, { color: T.errText }]}>
            {String(errorMsg)}
          </Text>
        </View>
      );

    if (isLargeScreen) {
      // Layout 2 cột (Master/Detail)
      return (
        <View style={[stylesNew.container, { flexDirection: "row" }]}>
          {/* Cột Trạng thái trực tiếp (Status Panel) */}
          <View style={{ flex: 1, minWidth: 300, maxWidth: 400, gap: 12 }}>
            {/* Bộ lọc cho cột List (All Matches) */}
            <View style={{ paddingBottom: 0 }}>{FilterAndTabs}</View>
            {CourtStatusContent}
          </View>
          {/* Cột Danh sách đầy đủ (All Matches List) */}
          <ScrollView
            style={{ flex: 2, minWidth: 400, marginLeft: 12 }}
            contentContainerStyle={{ gap: 12, paddingBottom: 24 }}
          >
            {AllMatchesContent}
          </ScrollView>
        </View>
      );
    }

    // Layout 1 cột (Mobile/Tablet dọc)
    return (
      <ScrollView contentContainerStyle={stylesNew.container}>
        {FilterAndTabs}
        {CourtStatusContent}
        {AllMatchesContent}
      </ScrollView>
    );
  }, [
    loading,
    errorMsg,
    T,
    isLargeScreen,
    FilterAndTabs,
    CourtStatusContent,
    AllMatchesContent,
  ]);

  return (
    <BottomSheetModalProvider>
      <Stack.Screen
        options={{
          title: `Lịch thi đấu${
            tournament?.name ? ` – ${tournament.name}` : ""
          }`,
          headerStyle: { backgroundColor: T.cardBg },
          headerTitleStyle: { color: T.text },
          headerShadowVisible: false,
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
              hitSlop={12}
              style={{ paddingHorizontal: 6, paddingVertical: 4 }}
            >
              {/* Đã đổi sang Ionicons chevron-back, mình tăng size lên 24 cho cân đối */}
              <Ionicons name="chevron-back" size={24} color={T.text} />
            </Pressable>
          ),
          headerRight: () => {
            if (manager || referee)
              return (
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {manager && (
                    <Pressable
                      onPress={() => router.push(`/tournament/${id}/manage`)}
                      style={({ pressed }) => [
                        { padding: 6, opacity: pressed ? 0.6 : 1 },
                      ]}
                    >
                      <View
                        style={[
                          stylesNew.headerBtn,
                          { borderColor: T.border, backgroundColor: T.softBg },
                        ]}
                      >
                        <MaterialIcons
                          name="admin-panel-settings"
                          size={16}
                          color={T.text}
                        />
                        <Text
                          style={[stylesNew.headerBtnText, { color: T.text }]}
                        >
                          {admin ? "Admin" : "Quản lý"}
                        </Text>
                      </View>
                    </Pressable>
                  )}
                  {referee && (
                    <Pressable
                      onPress={() => router.push(`/tournament/${id}/referee`)}
                      style={({ pressed }) => [
                        { padding: 6, opacity: pressed ? 0.6 : 1 },
                      ]}
                    >
                      <View
                        style={[
                          stylesNew.headerBtn,
                          { borderColor: T.border, backgroundColor: T.softBg },
                        ]}
                      >
                        <MaterialIcons name="rule" size={16} color={T.text} />
                        <Text
                          style={[stylesNew.headerBtnText, { color: T.text }]}
                        >
                          Chấm trận
                        </Text>
                      </View>
                    </Pressable>
                  )}
                </View>
              );
          },
        }}
      />

      <View style={{ flex: 1, backgroundColor: T.bg }}>
        {/* Content (Responsive Layout) */}
        {ResponsiveContent}

        {/* Viewer (Bottom Sheet) */}
        <ResponsiveMatchViewer
          open={viewerOpen}
          matchId={selectedMatchId}
          onClose={closeViewer}
        />
      </View>
    </BottomSheetModalProvider>
  );
}

/* ----------------------------------------------------- */
/* ------------------- STYLES REDESIGN (stylesNew) ------------------- */
/* ----------------------------------------------------- */

const stylesNew = StyleSheet.create({
  container: { padding: 12, gap: 12, flexGrow: 1 },

  // --- Header & Filters ---
  headerBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderRadius: 999,
  },
  headerBtnText: { marginLeft: 4, fontSize: 13, fontWeight: "600" },

  filterContainer: {
    paddingHorizontal: 0, // Bỏ padding ngang để nó tự căn với container
    paddingTop: 0,
    paddingBottom: 0,
    borderBottomWidth: 0, // Bỏ viền dưới
  },
  searchInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    marginLeft: 8,
  },
  statusTabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 12,
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  tabText: { fontSize: 13 },

  // --- Card / Base ---
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 12,
  },
  cardTitle: { fontSize: 16, fontWeight: "800" },
  cardSub: { fontSize: 12, marginTop: 2 },

  // --- Chip ---
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    minHeight: 20,
    overflow: "hidden",
  },
  chipText: { fontSize: 11, fontWeight: "600" },

  // --- Match Card (Redesign) ---
  matchCard: {
    position: "relative",
    borderRadius: 16, // Góc bo lớn hơn
    borderWidth: 1,
    overflow: "hidden",
    padding: 12,
    paddingLeft: 12,
  },
  statusBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 6, // Thanh trạng thái dày hơn
    opacity: 1,
  },
  matchCardInner: {
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  matchHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  matchCode: { fontWeight: "600", fontSize: 12 },

  matchTeamsAndScore: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: 4,
  },
  teamName: {
    fontSize: 15,
    fontWeight: "600",
    flexShrink: 1,
    paddingHorizontal: 4, // Khoảng trống quanh tên đội
  },
  scoreCenter: {
    width: 80, // Chiều rộng cố định cho Score/VS
    alignItems: "center",
  },
  scoreText: {
    fontSize: 18,
    fontWeight: "900", // Siêu đậm
  },
  matchMeta: {
    marginTop: 8,
  },

  // --- Court Status Card (Redesign) ---
  statusCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  statusCardHead: {
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statusCourtName: {
    fontSize: 15,
    fontWeight: "800",
    flexDirection: "row",
    alignItems: "center",
  },
  courtSection: {
    paddingVertical: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    flexDirection: "row",
    alignItems: "center",
  },
  liveBanner: {
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1, // Viền cho banner live
  },
  liveMatchBanner: {
    marginVertical: 4,
  },
  bannerRow: {
    padding: 8,
    borderLeftWidth: 4, // Live indicator mỏng
    borderRadius: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  bannerCode: { fontSize: 12, fontWeight: "700", opacity: 0.8 },
  bannerTeam: { fontSize: 14, fontWeight: "600", marginTop: 2 },
  bannerScore: {
    width: 60,
    alignItems: "flex-end",
  },
  bannerScoreText: {
    fontSize: 18,
    fontWeight: "900",
  },

  queueRowRedesign: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 6,
  },
  orderBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  queueMatchCode: { fontWeight: "700", fontSize: 12 },
  queueVsText: { fontSize: 13, flexShrink: 1 },
  queueMoreText: {
    fontSize: 12,
    fontStyle: "italic",
    paddingHorizontal: 8,
    textAlign: "center",
  },
  // --- Alerts (giữ nguyên) ---
  alertInfo: {
    borderWidth: 1,
    padding: 12,
    borderRadius: 10,
  },
  alertInfoText: { fontSize: 13 },
  alertError: {
    borderWidth: 1,
    padding: 12,
    borderRadius: 10,
  },
  alertErrorText: { fontSize: 14 },
});
