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
import { useIsFocused } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ResponsiveMatchViewer from "@/components/match/ResponsiveMatchViewer";
import {
  useGetTournamentQuery,
  useListTournamentBracketsQuery,
  useListPublicMatchesByTournamentQuery,
  useVerifyRefereeQuery,
} from "@/slices/tournamentsApiSlice";
import { useSocket } from "@/context/SocketContext";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetModalProvider,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import {
  getMatchCourtStationName,
  getMatchDisplayCode,
  getMatchPayloadId,
  getMatchSideDisplayName,
  getPairDisplayName,
  isNewerOrEqualMatchPayload,
  isLightweightMatchPayload,
  mergeMatchPayload,
  normalizeMatchDisplay,
} from "@/utils/matchDisplay";
import { useSocketRoomSet } from "@/hooks/useSocketRoomSet";
import { formatKnockoutRoundLabelByTeamCount } from "@/utils/tournamentRoundLabels";

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
function pairToName(pair, source) {
  return getPairDisplayName(pair, source) || null;
}
function seedToName(seed) {
  return seed?.label || null;
}

const isByeSeed = (seed) =>
  seed?.type === "bye" ||
  String(seed?.label || "").trim().toUpperCase() === "BYE";

const isUsefulTeamName = (value) => {
  const text = String(value || "").trim();
  if (!text) return false;
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return ![
    "bye",
    "tbd",
    "registration",
    "chua co doi",
    "-",
    "--",
    "—",
  ].includes(normalized);
};

const matchCodeOf = (m) => {
  const direct =
    getMatchDisplayCode(m) ||
    m?.displayCode ||
    m?.code ||
    m?.matchCode ||
    m?.slotCode ||
    m?.globalCode;
  if (direct) return String(direct).trim();
  const round = Number(m?.round ?? m?.roundNo ?? m?.roundIndex);
  const order = Number(m?.order ?? m?.orderNo ?? m?.slot ?? m?.index);
  if (Number.isFinite(round) && Number.isFinite(order)) {
    return `V${round}-T${order + 1}`;
  }
  return "";
};

const refMatchId = (ref) =>
  String(
    ref?._id ??
      ref?.id ??
      ref?.matchId ??
      ref?.match ??
      ref?.ref?.matchId ??
      ref?.ref?.match ??
      ""
  ).trim();

const seedSourceMatch = (seed, matchIndex) => {
  if (!seed || !matchIndex) return null;
  const id = refMatchId(seed);
  if (id && matchIndex.get(id)) return matchIndex.get(id);
  const labelCode = String(seed?.label || "").match(
    /\b(?:V\d+(?:-B[^-\s]+)?(?:-NT)?-T\d+|WB\d+-T\d+|LB\d+-T\d+|GF(?:\d+)?-T\d+)\b/i
  )?.[0];
  if (!labelCode) return null;
  const normalized = labelCode.toUpperCase();
  for (const source of matchIndex.values()) {
    if (matchCodeOf(source).toUpperCase() === normalized) return source;
  }
  return null;
};

const bracketIdOfMatch = (m) =>
  String(m?.bracket?._id ?? m?.bracket ?? m?.bracketId ?? "").trim();

const roundNumberOfMatch = (m) => {
  const value = Number(m?.round ?? m?.roundNo ?? m?.roundIndex);
  if (Number.isFinite(value)) return value;
  const parsed = matchCodeOf(m).match(/^V(\d+)(?:-[^-]+)?-T\d+$/i);
  return parsed ? Number(parsed[1]) : NaN;
};

const orderNumberOfMatch = (m) => {
  const value = Number(m?.order ?? m?.orderNo ?? m?.slot ?? m?.index);
  if (Number.isFinite(value)) return value;
  const parsed = matchCodeOf(m).match(/^V\d+(?:-[^-]+)?-T(\d+)$/i);
  return parsed ? Number(parsed[1]) - 1 : NaN;
};

const sameScheduleBranch = (a, b) => {
  if (String(a?.branch || "main") !== String(b?.branch || "main")) return false;
  if (String(a?.phase || "") !== String(b?.phase || "")) return false;
  return true;
};

const inferPreviousRoundSourceMatch = (m, side, matchIndex) => {
  if (!m || !matchIndex) return null;
  const round = roundNumberOfMatch(m);
  if (!Number.isFinite(round) || round <= 1) return null;

  const bracketId = bracketIdOfMatch(m);
  const candidates = Array.from(matchIndex.values()).filter((candidate) => {
    if (!candidate) return false;
    const candidateBracketId = bracketIdOfMatch(candidate);
    if (bracketId && candidateBracketId && candidateBracketId !== bracketId) return false;
    return sameScheduleBranch(candidate, m);
  });

  const byOrder = (a, b) => orderNumberOfMatch(a) - orderNumberOfMatch(b);
  const currentRound = candidates
    .filter((candidate) => roundNumberOfMatch(candidate) === round)
    .sort(byOrder);
  const previousRound = candidates
    .filter((candidate) => roundNumberOfMatch(candidate) === round - 1)
    .sort(byOrder);
  if (!previousRound.length) return null;

  const currentIndex = currentRound.findIndex(
    (candidate) => String(candidate?._id || "") === String(m?._id || "")
  );
  const order = currentIndex >= 0 ? currentIndex : orderNumberOfMatch(m);
  if (!Number.isFinite(order)) return null;

  const sourceSlot = order * 2 + (side === "B" ? 1 : 0);
  return previousRound[sourceSlot] || null;
};

function teamNameFrom(m, side, matchIndex = null, depth = 0) {
  if (!m) return "TBD";
  if (depth > 10) return "TBD";
  const pair = side === "A" ? m.pairA : m.pairB;
  const seed = side === "A" ? m.seedA : m.seedB;
  const resolved =
    side === "A"
      ? m.__sideA || m.resolvedSideNameA || m.teamAName || m.sideAName
      : m.__sideB || m.resolvedSideNameB || m.teamBName || m.sideBName;
  const pairName = pairToName(pair, m);
  if (isUsefulTeamName(pairName)) return pairName;
  if (isUsefulTeamName(resolved)) return String(resolved).trim();
  if (isByeSeed(seed)) return "BYE";

  const seedType = String(seed?.type || "");
  const isLoserSeed =
    seedType === "stageMatchLoser" || seedType === "matchLoser";
  const isWinnerSeed =
    seedType === "stageMatchWinner" || seedType === "matchWinner";
  const prev = side === "A" ? m.previousA : m.previousB;
  const sourceId = refMatchId(prev);
  const sourceMatch =
    (sourceId && matchIndex?.get(sourceId)) ||
    (prev && typeof prev === "object" ? prev : null) ||
    ((isWinnerSeed || isLoserSeed) ? seedSourceMatch(seed, matchIndex) : null) ||
    inferPreviousRoundSourceMatch(m, side, matchIndex);

  if (sourceMatch) {
    const sourceByeA = isByeSeed(sourceMatch.seedA);
    const sourceByeB = isByeSeed(sourceMatch.seedB);

    if (sourceByeA || sourceByeB) {
      if (isLoserSeed || (sourceByeA && sourceByeB)) return "BYE";
      const carriedSide = sourceByeA ? "B" : "A";
      const carried = teamNameFrom(
        sourceMatch,
        carriedSide,
        matchIndex,
        depth + 1
      );
      if (isUsefulTeamName(carried)) return carried;
    }

    if (String(sourceMatch.status || "").toLowerCase() === "finished") {
      const winnerSide = sourceMatch.winner === "A" ? "A" : "B";
      const sourceSide = isLoserSeed
        ? winnerSide === "A"
          ? "B"
          : "A"
        : winnerSide;
      const carried = teamNameFrom(sourceMatch, sourceSide, matchIndex, depth + 1);
      if (isUsefulTeamName(carried)) return carried;
    }

    const code = matchCodeOf(sourceMatch);
    if (code) return `${isLoserSeed ? "L" : "W"}-${code}`;
  }

  const fallbackName = getMatchSideDisplayName(
    seed ? { ...m, [side === "A" ? "seedA" : "seedB"]: seed } : m,
    side,
    ""
  );
  if (isUsefulTeamName(fallbackName)) return fallbackName;

  return seedToName(seed) || "TBD";
}

function resolveScheduleSides(rawList) {
  const matchIndex = new Map();
  (rawList || []).forEach((match) => {
    if (match?._id) matchIndex.set(String(match._id), match);
  });

  return (rawList || []).map((match) => ({
    ...match,
    __sideA: teamNameFrom(match, "A", matchIndex),
    __sideB: teamNameFrom(match, "B", matchIndex),
  }));
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
  const stationName = getMatchCourtStationName(m);
  if (stationName) return stationName;
  return (
    (m?.courtName && m.courtName.trim()) ||
    m?.court?.name ||
    m?.courtLabel ||
    "Chưa phân sân"
  );
}
const hasAssignedCourt = (m) =>
  String(courtNameOf(m)).toLowerCase().includes("chưa phân sân") === false;

const STATUS_TABS = [
  { key: "all", label: "Tất cả", icon: null },
  { key: "live", label: "Đang diễn ra", icon: "fire" },
  { key: "upcoming", label: "Sắp tới", icon: null },
  { key: "finished", label: "Đã kết thúc", icon: null },
];
const STATUS_KEYS = new Set(STATUS_TABS.map((tab) => tab.key));

const normalizeParam = (value) => {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw == null ? "" : String(raw).trim();
};

const getBracketId = (value) =>
  String(
    value?.bracket?._id ??
      value?.bracket ??
      value?.bracketId ??
      value?._id ??
      value?.id ??
      ""
  ).trim();

const getBracketName = (value, fallback = "Bracket") => {
  const name =
    value?.bracket?.name ??
    value?.name ??
    value?.title ??
    value?.label ??
    value?.type;
  return String(name || fallback).trim();
};

const isKnockoutBracketType = (bracket) => {
  const type = String(bracket?.type || bracket?.format || "").toLowerCase();
  if (
    !type ||
    type.includes("group") ||
    type.includes("playoff") ||
    type.includes("roundelim") ||
    type === "po"
  )
    return false;
  return (
    type.includes("knockout") ||
    type.includes("singleelim") ||
    type.includes("single-elim") ||
    type.includes("single_elim") ||
    type === "ko"
  );
};

const readBracketScale = (bracket) => {
  const candidates = [
    bracket?.drawSize,
    bracket?.size,
    bracket?.scale,
    bracket?.noTeams,
    bracket?.teamCount,
    bracket?.participantCount,
    bracket?.prefill?.seeds?.length,
    bracket?.prefill?.pairs?.length ? bracket.prefill.pairs.length * 2 : null,
  ];
  for (const candidate of candidates) {
    const n = Number(candidate);
    if (Number.isFinite(n) && n > 1) return n;
  }
  return 0;
};

const roundsCountForBracket = (bracket, matchesOfBracket = []) => {
  const rounds = matchesOfBracket
    .map((m) => Number(m?.round ?? m?.roundNo ?? m?.roundIndex ?? 1))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (rounds.length)
    return Math.max(1, Math.max(...rounds) - Math.min(...rounds) + 1);
  const scale = readBracketScale(bracket);
  return scale ? Math.max(1, Math.ceil(Math.log2(scale))) : 1;
};

const scheduleRoundLabel = (match, matchesOfBracket = []) => {
  const round = Number(match?.round ?? match?.roundNo ?? match?.roundIndex ?? 1) || 1;
  const bracket =
    match?.bracket && typeof match.bracket === "object" ? match.bracket : null;
  if (!isKnockoutBracketType(bracket)) return `Vòng ${round}`;

  const totalRounds = roundsCountForBracket(bracket, matchesOfBracket);
  const remainingRounds = Math.max(1, totalRounds - round + 1);
  const drawSize = 2 ** remainingRounds;

  return formatKnockoutRoundLabelByTeamCount(drawSize, {
    fallback: `Vòng ${round}`,
  });
};

/* ----------------------------------------------------- */
/* ------------------- THEME VÀ UTILITY REDESIGN ------------------- */
/* ----------------------------------------------------- */

// Theme Tối giản & Hiện đại
const scheduleMatchStageChipLabel = (match, matchesOfBracket = []) => {
  const round = roundNumberOfMatch(match) || 1;
  const bracket =
    match?.bracket && typeof match.bracket === "object" ? match.bracket : null;
  if (!isKnockoutBracketType(bracket)) return null;

  const totalRounds = roundsCountForBracket(bracket, matchesOfBracket);
  const remainingRounds = Math.max(1, totalRounds - round + 1);
  const drawSize = 2 ** remainingRounds;
  const roundMatches = (Array.isArray(matchesOfBracket) ? matchesOfBracket : [])
    .filter((candidate) => roundNumberOfMatch(candidate) === round)
    .filter((candidate) => sameScheduleBranch(candidate, match))
    .sort((a, b) => orderNumberOfMatch(a) - orderNumberOfMatch(b));
  const matchIndex = roundMatches.findIndex(
    (candidate) => String(candidate?._id || "") === String(match?._id || "")
  );
  const fallbackIndex = orderNumberOfMatch(match);
  const displayIndex =
    matchIndex >= 0
      ? matchIndex + 1
      : Number.isFinite(fallbackIndex)
        ? fallbackIndex + 1
        : 1;

  return (
    formatKnockoutRoundLabelByTeamCount(drawSize, {
      includeIndex: true,
      index: displayIndex,
    }) || null
  );
};

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

function getStageChipColors(label, T) {
  const text = String(label || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const isDark = T.scheme === "dark";
  if (text.includes("chung ket")) {
    return {
      bg: isDark ? "rgba(251, 191, 36, 0.18)" : "#fff7cc",
      fg: isDark ? "#fde68a" : "#92400e",
      bd: isDark ? "rgba(251, 191, 36, 0.44)" : "#facc15",
    };
  }
  if (text.includes("ban ket")) {
    return {
      bg: isDark ? "rgba(168, 85, 247, 0.2)" : "#f3e8ff",
      fg: isDark ? "#d8b4fe" : "#7e22ce",
      bd: isDark ? "rgba(168, 85, 247, 0.48)" : "#c084fc",
    };
  }
  if (text.includes("tu ket")) {
    return {
      bg: isDark ? "rgba(59, 130, 246, 0.2)" : "#dbeafe",
      fg: isDark ? "#93c5fd" : "#1d4ed8",
      bd: isDark ? "rgba(59, 130, 246, 0.5)" : "#60a5fa",
    };
  }
  if (/\b1[/-]\d+\b/.test(text)) {
    return {
      bg: isDark ? "rgba(20, 184, 166, 0.18)" : "#ccfbf1",
      fg: isDark ? "#5eead4" : "#0f766e",
      bd: isDark ? "rgba(20, 184, 166, 0.44)" : "#2dd4bf",
    };
  }
  return null;
}

/* ----------------------------------------------------- */
/* ------------------- CÁC COMPONENT UI REDESIGN ------------------- */
/* ----------------------------------------------------- */

function Chip({ text, type = "default", icon, theme, style, colorsOverride }) {
  const c = colorsOverride || getChipColors(type, theme);
  const isOutline = type === "outlined" || type === "finished";

  return (
    <View
      style={[
        stylesNew.chip,
        {
          backgroundColor: c.bg,
          borderColor: c.bd,
          borderWidth: colorsOverride || isOutline ? 1 : 0,
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
function MatchCard({
  m,
  onOpenMatch,
  theme,
  resolveTeamName = teamNameFrom,
  matchesOfBracket = [],
}) {
  const isLiveMatch = isLive(m);
  const isFinishMatch = isFinished(m);
  const statusColor = isLiveMatch
    ? theme.live
    : isFinishMatch
    ? theme.finished
    : theme.upcoming;
  const winnerSide = m?.winner === "A" ? "A" : m?.winner === "B" ? "B" : null;
  const teamA = resolveTeamName(m, "A");
  const teamB = resolveTeamName(m, "B");
  const score = scoreText(m);
  const stageLabel = scheduleMatchStageChipLabel(m, matchesOfBracket);

  const [isPressing, setIsPressing] = useState(false);

  // Animation cho Live match
  const pulseAnim = useRef(new Animated.Value(0.2)).current;
  const screenFocused = useIsFocused();
  useEffect(() => {
    if (!isLiveMatch || !screenFocused) {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
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
    );
    loop.start();
    return () => loop.stop();
  }, [isLiveMatch, pulseAnim, screenFocused]);

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
            {stageLabel ? (
              <Chip
                theme={theme}
                type="outlined"
                text={stageLabel}
                colorsOverride={getStageChipColors(stageLabel, theme)}
              />
            ) : null}
          </ChipRow>
        </View>
      </View>
    </Pressable>
  );
}

/* Row cho Court Status (Compact & Orderly) */
// 1. Live Banner Row (Nhấn mạnh score và đội)
function MatchBannerRow({ m, onOpenMatch, theme, resolveTeamName = teamNameFrom }) {
  const score = scoreText(m);
  const teamA = resolveTeamName(m, "A");
  const teamB = resolveTeamName(m, "B");

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
function MatchQueueRow({
  m,
  onOpenMatch,
  theme,
  order,
  resolveTeamName = teamNameFrom,
}) {
  const teamA = resolveTeamName(m, "A");
  const teamB = resolveTeamName(m, "B");

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
function CourtStatusCard({
  court,
  queueLimit = 4,
  onOpenMatch,
  theme,
  resolveTeamName = teamNameFrom,
}) {
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
                resolveTeamName={resolveTeamName}
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
              resolveTeamName={resolveTeamName}
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
  const routeParams = useLocalSearchParams();
  const id = normalizeParam(routeParams.id);
  const router = useRouter();
  const me = useSelector((s) => s.auth?.userInfo || null);
  const [q, setQ] = useState("");
  const routeTab = normalizeParam(routeParams.tab || routeParams.status);
  const routeBracket = normalizeParam(routeParams.bracket);
  const routeRound = normalizeParam(routeParams.round);
  const [status, setStatus] = useState(
    STATUS_KEYS.has(routeTab) ? routeTab : "all"
  ); // all | live | upcoming | finished
  const [selectedBracket, setSelectedBracket] = useState(routeBracket || "all");
  const [selectedRound, setSelectedRound] = useState(routeRound || "all");
  const lastRouteTabRef = useRef(routeTab);
  const lastRouteBracketRef = useRef(routeBracket);
  const lastRouteRoundRef = useRef(routeRound);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedMatchId, setSelectedMatchId] = useState(null);

  const T = useThemeTokens();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 900;
  const queueLimit = width >= 900 ? 6 : width >= 600 ? 4 : 3;
  const filterSheetRef = useRef(null);
  const filterSheetSnapPoints = useMemo(() => ["45%", "78%"], []);

  // --- Data Fetching & Realtime Logic (Giữ nguyên logic gốc) ---
  const {
    data: tournament,
    isLoading: tLoading,
    error: tError,
    refetch: refetchTournament,
  } = useGetTournamentQuery(id);
  const {
    data: matchesResp,
    isLoading: mLoading,
    error: mError,
    refetch: refetchMatches,
  } = useListPublicMatchesByTournamentQuery({
    tid: id,
  });
  const {
    data: brackets = [],
    isLoading: bLoading,
    refetch: refetchBrackets,
  } = useListTournamentBracketsQuery(id, { skip: !id });
  const loading = tLoading || mLoading || bLoading;
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
    const mp = new Map(liveMapRef.current);
    let changed = false;
    const list = (matchesResp?.list || []).map((m) =>
      normalizeMatchDisplay(m, tournament)
    );
    for (const m of list) {
      if (!m?._id) continue;
      const id = String(m._id);
      const cur = mp.get(id);
      if (cur && !isNewerOrEqualMatchPayload(cur, m)) continue;
      const merged =
        mergeMatchPayload(cur, m, cur || tournament) ||
        normalizeMatchDisplay(m, cur || tournament);
      if (!merged) continue;
      mp.set(id, merged);
      changed = true;
    }
    if (!changed && mp.size === liveMapRef.current.size) return;
    liveMapRef.current = mp;
    setLiveBump((x) => x + 1);
  }, [matchesResp, tournament]);

  const flushPending = useCallback(() => {
    if (!pendingRef.current.size) return;
    const mp = liveMapRef.current;
    let changed = false;
    for (const [mid, inc] of pendingRef.current) {
      const cur = mp.get(mid);
      if (cur && !isNewerOrEqualMatchPayload(cur, inc)) continue;
      const merged =
        mergeMatchPayload(cur, inc, cur || tournament) ||
        normalizeMatchDisplay(inc, cur || tournament);
      if (!merged) continue;
      mp.set(mid, merged);
      changed = true;
    }
    pendingRef.current.clear();
    if (changed) setLiveBump((x) => x + 1);
  }, [tournament]);

  const queueUpsert = useCallback(
    (incRaw) => {
      const id = getMatchPayloadId(incRaw);
      if (!id) return;
      if (isLightweightMatchPayload(incRaw)) {
        socket?.emit("match:snapshot:request", { matchId: id });
        return;
      }
      const payload = incRaw?.data ?? incRaw?.match ?? incRaw;
      const key = String(id);
      const inc = normalizeMatchDisplay(payload, tournament);
      const base = pendingRef.current.get(key) || liveMapRef.current.get(key);
      if (base && !isNewerOrEqualMatchPayload(base, inc)) return;
      pendingRef.current.set(
        key,
        mergeMatchPayload(base, inc, base || tournament) ||
          normalizeMatchDisplay(inc, base || tournament)
      );
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        flushPending();
      });
    },
    [flushPending, socket, tournament]
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

  const tournamentRoomIds = useMemo(
    () => (id ? [String(id)] : []),
    [id]
  );

  useSocketRoomSet(socket, tournamentRoomIds, {
    subscribeEvent: "tournament:subscribe",
    unsubscribeEvent: "tournament:unsubscribe",
    payloadKey: "tournamentId",
    onResync: () => {
      refetchTournament?.();
      refetchMatches?.();
      refetchBrackets?.();
    },
  });

  useEffect(() => {
    if (!socket) return;
    const onUpsert = (p) => queueUpsert(p);
    const onInvalidate = (payload) => {
      const tournamentId = String(payload?.tournamentId || "").trim();
      if (tournamentId && tournamentId !== String(id || "").trim()) return;
      refetchTournament?.();
      refetchMatches?.();
      refetchBrackets?.();
    };
    const onRemove = (payload) => {
      const id = String(payload?.id ?? payload?._id ?? "");
      if (!id) return;
      if (liveMapRef.current.has(id)) {
        liveMapRef.current.delete(id);
        setLiveBump((x) => x + 1);
      }
    };

    socket.on("tournament:match:update", onUpsert);
    socket.on("tournament:invalidate", onInvalidate);
    socket.on("match:deleted", onRemove);
    return () => {
      socket.off("tournament:match:update", onUpsert);
      socket.off("tournament:invalidate", onInvalidate);
      socket.off("match:deleted", onRemove);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [
    socket,
    queueUpsert,
    id,
    refetchBrackets,
    refetchMatches,
    refetchTournament,
  ]);

  const bracketsKey = useMemo(
    () =>
      (brackets || [])
        .map((b) => String(b._id))
        .filter(Boolean)
        .sort()
        .join(","),
    [brackets]
  );
  const matchesKey = useMemo(
    () =>
      ((matchesResp?.list || []).map((m) => String(m._id)) || [])
        .filter(Boolean)
        .sort()
        .join(","),
    [matchesResp]
  );
  useEffect(() => {
    subscribedBracketsRef.current = new Set();
    joinedMatchesRef.current = new Set();
  }, [bracketsKey, matchesKey]);

  const liveMatchesSnapshot = useMemo(
    () => (liveBump < 0 ? [] : Array.from(liveMapRef.current.values())),
    [liveBump]
  );

  // --- Data Processing (Giữ nguyên logic xử lý data) ---
  const matches = useMemo(
    () =>
      liveMatchesSnapshot.filter(
        (m) => String(m?.tournament?._id || m?.tournament) === String(id)
      ),
    [id, liveMatchesSnapshot]
  );
  const bracketById = useMemo(() => {
    const map = new Map();
    (brackets || []).forEach((bracket) => {
      const bracketId = getBracketId(bracket);
      if (bracketId) map.set(bracketId, bracket);
    });
    return map;
  }, [brackets]);
  const enrichedMatches = useMemo(
    () => {
      const withBracketDetails = matches.map((m) => {
        const bracketId = getBracketId(m);
        const bracketDetail = bracketById.get(bracketId);
        if (!bracketDetail) return m;
        const currentBracket =
          m?.bracket && typeof m.bracket === "object" ? m.bracket : {};
        return {
          ...m,
          bracket: {
            ...bracketDetail,
            ...currentBracket,
          },
        };
      });
      return resolveScheduleSides(withBracketDetails);
    },
    [bracketById, matches]
  );
  const admin = useMemo(() => isAdminUser(me), [me]);
  const manager = useMemo(
    () => isManagerOfTournament(tournament, me) || admin,
    [tournament, me, admin]
  );
  const inferredReferee = useMemo(
    () => isRefereeOfTournament(tournament, matches, me),
    [tournament, matches, me]
  );
  const { data: refereeCheck } = useVerifyRefereeQuery(id, {
    skip: !id || !me?._id,
  });
  const referee = !!(inferredReferee || refereeCheck?.isReferee);
  const allSorted = useMemo(() => {
    return [...enrichedMatches].sort((a, b) => {
      const ak = orderKey(a);
      const bk = orderKey(b);
      for (let i = 0; i < ak.length; i++)
        if (ak[i] !== bk[i]) return ak[i] - bk[i];
      return 0;
    });
  }, [enrichedMatches]);
  const matchIndex = useMemo(() => {
    const map = new Map();
    allSorted.forEach((match) => {
      if (match?._id) map.set(String(match._id), match);
    });
    return map;
  }, [allSorted]);
  const resolveTeamName = useCallback(
    (match, side) => teamNameFrom(match, side, matchIndex),
    [matchIndex]
  );

  const hasRouteStatus = STATUS_KEYS.has(routeTab);
  useEffect(() => {
    if (routeTab === lastRouteTabRef.current) return;
    lastRouteTabRef.current = routeTab;
    if (STATUS_KEYS.has(routeTab)) setStatus(routeTab);
  }, [routeTab]);
  useEffect(() => {
    if (routeBracket === lastRouteBracketRef.current) return;
    lastRouteBracketRef.current = routeBracket;
    setSelectedBracket(routeBracket || "all");
  }, [routeBracket]);
  useEffect(() => {
    if (routeRound === lastRouteRoundRef.current) return;
    lastRouteRoundRef.current = routeRound;
    setSelectedRound(routeRound || "all");
  }, [routeRound]);

  const syncRouteParams = useCallback(
    (next = {}) => {
      router.setParams({
        tab: next.status ?? status,
        bracket: next.bracket ?? selectedBracket,
        round: next.round ?? selectedRound,
      });
    },
    [router, selectedBracket, selectedRound, status]
  );

  const selectStatus = useCallback(
    (nextStatus) => {
      setStatus(nextStatus);
      syncRouteParams({ status: nextStatus });
    },
    [syncRouteParams]
  );

  const matchesByBracket = useMemo(() => {
    const map = new Map();
    allSorted.forEach((m) => {
      const bracketId = getBracketId(m) || "unknown";
      if (!map.has(bracketId)) map.set(bracketId, []);
      map.get(bracketId).push(m);
    });
    return map;
  }, [allSorted]);

  const bracketOptions = useMemo(() => {
    const map = new Map();
    (brackets || []).forEach((bracket, index) => {
      const bracketId = getBracketId(bracket);
      if (!bracketId) return;
      map.set(bracketId, {
        key: bracketId,
        label: getBracketName(bracket, `Bracket ${index + 1}`),
        order: Number(bracket?.order ?? index),
      });
    });
    allSorted.forEach((m, index) => {
      const bracketId = getBracketId(m);
      if (!bracketId || map.has(bracketId)) return;
      map.set(bracketId, {
        key: bracketId,
        label: getBracketName(m, `Bracket ${index + 1}`),
        order: Number(m?.bracket?.order ?? index),
      });
    });
    const options = Array.from(map.values()).sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.label.localeCompare(b.label);
    });
    return [{ key: "all", label: "Tất cả bracket" }, ...options];
  }, [allSorted, brackets]);

  const matchesAfterBracket = useMemo(() => {
    if (selectedBracket === "all") return allSorted;
    return allSorted.filter((m) => getBracketId(m) === selectedBracket);
  }, [allSorted, selectedBracket]);

  const roundOptions = useMemo(() => {
    const map = new Map();
    matchesAfterBracket.forEach((m) => {
      const round = Number(m?.round ?? m?.roundNo ?? m?.roundIndex ?? 1) || 1;
      const bracketId = getBracketId(m) || "unknown";
      const matchesOfBracket = matchesByBracket.get(bracketId) || [];
      if (!map.has(String(round))) {
        map.set(String(round), {
          key: String(round),
          label: scheduleRoundLabel(m, matchesOfBracket),
          order: round,
        });
      }
    });
    const options = Array.from(map.values()).sort((a, b) => a.order - b.order);
    return [{ key: "all", label: "Tất cả vòng" }, ...options];
  }, [matchesAfterBracket, matchesByBracket]);

  useEffect(() => {
    if (loading || selectedBracket === "all") return;
    if (!bracketOptions.some((option) => option.key === selectedBracket)) {
      setSelectedBracket("all");
      setSelectedRound("all");
      syncRouteParams({ bracket: "all", round: "all" });
    }
  }, [bracketOptions, loading, selectedBracket, syncRouteParams]);

  useEffect(() => {
    if (loading || selectedRound === "all") return;
    if (!roundOptions.some((option) => option.key === selectedRound)) {
      setSelectedRound("all");
      syncRouteParams({ round: "all" });
    }
  }, [loading, roundOptions, selectedRound, syncRouteParams]);

  const hasLiveMatches = useMemo(() => allSorted.some(isLive), [allSorted]);
  useEffect(() => {
    if (hasRouteStatus || loading || allSorted.length === 0) return;
    const nextStatus = hasLiveMatches ? "live" : "all";
    setStatus((prev) => (prev === nextStatus ? prev : nextStatus));
    if (nextStatus === "live") syncRouteParams({ status: nextStatus });
  }, [allSorted.length, hasLiveMatches, hasRouteStatus, loading, syncRouteParams]);

  const selectBracket = useCallback(
    (nextBracket) => {
      setSelectedBracket(nextBracket);
      setSelectedRound("all");
      syncRouteParams({ bracket: nextBracket, round: "all" });
    },
    [syncRouteParams]
  );

  const selectRound = useCallback(
    (nextRound) => {
      setSelectedRound(nextRound);
      syncRouteParams({ round: nextRound });
    },
    [syncRouteParams]
  );

  const selectedBracketLabel = useMemo(
    () =>
      bracketOptions.find((option) => option.key === selectedBracket)?.label ||
      "Tất cả bracket",
    [bracketOptions, selectedBracket]
  );
  const selectedRoundLabel = useMemo(
    () =>
      roundOptions.find((option) => option.key === selectedRound)?.label ||
      "Tất cả vòng",
    [roundOptions, selectedRound]
  );
  const activeFilterCount =
    (selectedBracket !== "all" ? 1 : 0) + (selectedRound !== "all" ? 1 : 0);
  const openFilterSheet = useCallback(() => {
    filterSheetRef.current?.present?.();
  }, []);
  const closeFilterSheet = useCallback(() => {
    filterSheetRef.current?.dismiss?.();
  }, []);
  const resetBracketRoundFilters = useCallback(() => {
    selectBracket("all");
  }, [selectBracket]);
  const renderFilterBackdrop = useCallback(
    (props) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
        opacity={0.45}
      />
    ),
    []
  );

  const filteredAll = useMemo(() => {
    const qnorm = q.trim().toLowerCase();
    let res = allSorted.filter((m) => {
      if (selectedBracket !== "all" && getBracketId(m) !== selectedBracket)
        return false;
      if (
        selectedRound !== "all" &&
        String(Number(m?.round ?? m?.roundNo ?? m?.roundIndex ?? 1) || 1) !==
          selectedRound
      )
        return false;
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
        resolveTeamName(m, "A"),
        resolveTeamName(m, "B"),
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
  }, [allSorted, q, resolveTeamName, selectedBracket, selectedRound, status]);

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
  const renderFilterOptionGroup = (label, options, selected, onSelect) => {
    if (!options || options.length <= 1) return null;
    return (
      <View style={stylesNew.filterSheetGroup}>
        <Text style={[stylesNew.filterLabel, { color: T.textSecondary }]}>
          {label}
        </Text>
        <View style={stylesNew.sheetOptionWrap}>
          {options.map((option) => {
            const active = selected === option.key;
            const stageColors =
              label === "Vòng" ? getStageChipColors(option.label, T) : null;
            return (
              <Pressable
                key={option.key}
                onPress={() => onSelect(option.key)}
                style={[
                  stylesNew.optionChip,
                  {
                    backgroundColor: stageColors?.bg || T.tabBg,
                    borderColor: stageColors?.bd || T.tabBd,
                  },
                  active && {
                    backgroundColor: stageColors?.bg || T.tabActiveBg,
                    borderColor: stageColors?.bd || T.tabActiveBd,
                  },
                ]}
              >
                <Text
                  style={[
                    stylesNew.optionChipText,
                    { color: stageColors?.fg || T.tabText },
                    active && {
                      color: stageColors?.fg || T.tabTextActive,
                      fontWeight: "800",
                    },
                  ]}
                  numberOfLines={1}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  };

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
        {STATUS_TABS.map((it) => {
          const active = status === it.key;
          const hotLiveTab = it.key === "live" && hasLiveMatches;
          return (
            <Pressable
              key={it.key}
              onPress={() => selectStatus(it.key)}
              style={[
                stylesNew.tab,
                {
                  backgroundColor: T.tabBg,
                  borderColor: T.tabBd,
                },
                hotLiveTab && {
                  borderColor: T.live,
                },
                active && {
                  backgroundColor: T.tabActiveBg,
                  borderColor: T.tabActiveBd,
                },
              ]}
            >
              <View style={stylesNew.tabContent}>
                {it.icon && hotLiveTab ? (
                  <MaterialCommunityIcons
                    name="fire"
                    size={14}
                    color={active ? T.tabTextActive : T.live}
                  />
                ) : null}
                <Text
                  style={[
                    stylesNew.tabText,
                    { color: T.tabText },
                    active && { color: T.tabTextActive, fontWeight: "700" },
                  ]}
                >
                  {it.label}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={openFilterSheet}
        style={({ pressed }) => [
          stylesNew.filterSummaryButton,
          {
            backgroundColor: T.softBg,
            borderColor: activeFilterCount ? T.tabActiveBd : T.border,
            opacity: pressed ? 0.82 : 1,
          },
        ]}
      >
        <View style={stylesNew.filterSummaryLeft}>
          <MaterialIcons
            name="tune"
            size={18}
            color={activeFilterCount ? T.tint : T.icon}
          />
          <Text style={[stylesNew.filterSummaryTitle, { color: T.text }]}>
            Bộ lọc
          </Text>
          {activeFilterCount ? (
            <View
              style={[
                stylesNew.filterCountBadge,
                { backgroundColor: T.tint },
              ]}
            >
              <Text style={stylesNew.filterCountText}>
                {activeFilterCount}
              </Text>
            </View>
          ) : null}
        </View>
        <Text
          style={[stylesNew.filterSummaryValue, { color: T.textSecondary }]}
          numberOfLines={1}
        >
          {selectedBracketLabel} · {selectedRoundLabel}
        </Text>
        <MaterialIcons name="expand-more" size={20} color={T.muted} />
      </Pressable>
    </View>
  );

  // Nội dung của cột Status (Trực tiếp trên sân)
  const FilterSheet = (
    <BottomSheetModal
      ref={filterSheetRef}
      snapPoints={filterSheetSnapPoints}
      topInset={Math.max(insets.top, 12)}
      enablePanDownToClose
      backdropComponent={renderFilterBackdrop}
      handleIndicatorStyle={{ backgroundColor: T.muted }}
      backgroundStyle={{ backgroundColor: T.cardBg }}
      enableDynamicSizing={false}
    >
      <BottomSheetScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          stylesNew.filterSheetContent,
          { paddingBottom: Math.max(insets.bottom, 16) + 12 },
        ]}
      >
        <View style={stylesNew.filterSheetHeader}>
          <View>
            <Text style={[stylesNew.filterSheetEyebrow, { color: T.tint }]}>
              Lịch thi đấu
            </Text>
            <Text style={[stylesNew.filterSheetTitle, { color: T.text }]}>
              Bộ lọc
            </Text>
          </View>
          <Pressable
            onPress={resetBracketRoundFilters}
            style={({ pressed }) => [
              stylesNew.filterResetButton,
              {
                backgroundColor: T.softBg,
                borderColor: T.border,
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          >
            <Text style={[stylesNew.filterResetText, { color: T.tint }]}>
              Đặt lại
            </Text>
          </Pressable>
        </View>

        {renderFilterOptionGroup(
          "Bracket",
          bracketOptions,
          selectedBracket,
          selectBracket
        )}
        {renderFilterOptionGroup("Vòng", roundOptions, selectedRound, selectRound)}

        <Pressable
          onPress={closeFilterSheet}
          style={({ pressed }) => [
            stylesNew.filterApplyButton,
            { backgroundColor: T.tint, opacity: pressed ? 0.82 : 1 },
          ]}
        >
          <Text style={stylesNew.filterApplyText}>Áp dụng</Text>
        </Pressable>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );

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
              resolveTeamName={resolveTeamName}
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
            <MatchCard
              key={m._id}
              m={m}
              onOpenMatch={openViewer}
              theme={T}
              resolveTeamName={resolveTeamName}
              matchesOfBracket={matchesByBracket.get(getBracketId(m) || "unknown") || []}
            />
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
        {FilterSheet}

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
  tabContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  tabText: { fontSize: 13 },
  filterBlock: {
    marginBottom: 10,
  },
  filterLabel: {
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 6,
    textTransform: "uppercase",
  },
  filterSummaryButton: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  filterSummaryLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  filterSummaryTitle: {
    fontSize: 13,
    fontWeight: "800",
  },
  filterSummaryValue: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "right",
  },
  filterCountBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  filterCountText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "800",
  },
  filterSheetContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 18,
  },
  filterSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  filterSheetEyebrow: {
    fontSize: 12,
    fontWeight: "700",
  },
  filterSheetTitle: {
    fontSize: 20,
    fontWeight: "900",
    marginTop: 2,
  },
  filterResetButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  filterResetText: {
    fontSize: 12,
    fontWeight: "800",
  },
  filterSheetGroup: {
    gap: 8,
  },
  sheetOptionWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterApplyButton: {
    minHeight: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  filterApplyText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },
  optionScrollContent: {
    gap: 6,
    paddingRight: 12,
  },
  optionChip: {
    maxWidth: 180,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  optionChipText: {
    fontSize: 12,
    fontWeight: "600",
  },

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
