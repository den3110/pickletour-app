/* eslint-disable react/prop-types */
// ModernBracketShared.tsx
// Shared card + palette + label humanizer cho bản sơ đồ v4 modern trên mobile.
// KHÔNG đụng logic sinh label — chỉ post-process nhãn tham chiếu và render đẹp hơn.

import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  Animated,
  Easing,
  StyleSheet,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

/* ================= constants ================= */
export const MODERN_CARD_W = 260;
export const MODERN_CARD_MIN_H = 132;

/* ================= palettes ================= */
// KO đếm ngược từ Chung kết (gold) ra ngoài
const ACCENTS_FROM_FINAL = [
  "#f59e0b", // Chung kết — gold
  "#ec4899", // Bán kết — rose
  "#8b5cf6", // Tứ kết — violet
  "#3b82f6", // Vòng 16 — blue
  "#06b6d4", // Vòng 32 — cyan
  "#14b8a6", // Vòng 64 — teal
  "#64748b", // sâu hơn — slate
];

// Palette xuôi cho Round Elim / Playoff
const ACCENTS_FORWARD = [
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#06b6d4",
  "#14b8a6",
];

export function accentForRound(colIndex: number, totalCols: number): string {
  const fromEnd = Math.max(0, totalCols - 1 - colIndex);
  return ACCENTS_FROM_FINAL[Math.min(fromEnd, ACCENTS_FROM_FINAL.length - 1)];
}

export function accentForIndex(i: number): string {
  return ACCENTS_FORWARD[Math.min(Math.max(0, i), ACCENTS_FORWARD.length - 1)];
}

/* Avatar màu ổn định theo tên đội */
const AVATAR_COLORS = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#10b981",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#6366f1",
];
function colorForName(name?: string): string {
  const s = String(name || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/* ================= alpha & darken helpers ================= */
function hex2rgb(hex: string): [number, number, number] {
  const m = hex.replace("#", "").padStart(6, "0");
  return [
    parseInt(m.substring(0, 2), 16),
    parseInt(m.substring(2, 4), 16),
    parseInt(m.substring(4, 6), 16),
  ];
}
export function rgba(hex: string, a: number): string {
  const [r, g, b] = hex2rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
export function darken(hex: string, amt: number): string {
  const [r, g, b] = hex2rgb(hex);
  const f = 1 - Math.min(1, Math.max(0, amt));
  return `rgb(${Math.round(r * f)},${Math.round(g * f)},${Math.round(b * f)})`;
}
export function lighten(hex: string, amt: number): string {
  const [r, g, b] = hex2rgb(hex);
  const f = Math.min(1, Math.max(0, amt));
  return `rgb(${Math.round(r + (255 - r) * f)},${Math.round(g + (255 - g) * f)},${Math.round(b + (255 - b) * f)})`;
}

/* ================= label translator ================= */
export type HumanizedLabel = {
  text: string;
  kind:
    | "bye"
    | "winner-ref"
    | "loser-ref"
    | "group-rank"
    | "match-ref"
    | "pending"
    | "team";
  tooltip?: string;
};

/**
 * Chuyển nhãn tham chiếu (W-V1-T16, L-V2-T3, V1-B1-T2, BYE) sang human-readable.
 * Return null nếu không match pattern → coi là tên đội thật, giữ nguyên.
 */
export function humanizeSeedRefLabel(raw: unknown): HumanizedLabel | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;

  if (/^\s*BYE\s*$/i.test(s)) {
    return {
      text: "Miễn đấu",
      kind: "bye",
      tooltip: "Đội được vào thẳng vòng sau",
    };
  }

  let m = s.match(/^([WL])-V(\d+)-T(\d+)$/i);
  if (m) {
    const isW = m[1].toUpperCase() === "W";
    return {
      text: isW ? `Chờ thắng T${m[3]}·V${m[2]}` : `Chờ thua T${m[3]}·V${m[2]}`,
      kind: isW ? "winner-ref" : "loser-ref",
      tooltip: isW
        ? `Đội thắng Trận ${m[3]} - Vòng ${m[2]}`
        : `Đội thua Trận ${m[3]} - Vòng ${m[2]}`,
    };
  }

  m = s.match(/^V(\d+)-B([A-Za-z0-9]+)-T(\d+)$/i);
  if (m) {
    return {
      text: `Hạng ${m[3]} Bảng ${m[2]}`,
      kind: "group-rank",
      tooltip: `Đội đứng hạng ${m[3]} của bảng ${m[2]} (Giai đoạn ${m[1]})`,
    };
  }

  m = s.match(/^V(\d+)-T(\d+)$/i);
  if (m) {
    return {
      text: `Chờ T${m[2]}·V${m[1]}`,
      kind: "match-ref",
      tooltip: `Chờ kết quả Trận ${m[2]} - Vòng ${m[1]}`,
    };
  }

  if (/^(TBD|Registration|Chưa có đội)$/i.test(s)) {
    return { text: "Chưa có đội", kind: "pending", tooltip: "Chưa xác định" };
  }

  return null;
}

/* ================= score helpers ================= */
function readScoreEntry(entry: any, key: string): number {
  return Number(entry?.[key] ?? entry?.[key.toUpperCase()] ?? 0);
}
function gameScoresOf(match: any) {
  return (Array.isArray(match?.gameScores)
    ? match.gameScores
    : Array.isArray(match?.scores)
      ? match.scores
      : []
  ).map((item: any) => ({
    a: readScoreEntry(item, "a"),
    b: readScoreEntry(item, "b"),
  }));
}
function matchRules(match: any) {
  return {
    pointsToWin: Math.max(
      1,
      Number(match?.rules?.pointsToWin ?? match?.pointsToWin ?? 11) || 11,
    ),
    winByTwo: Boolean(match?.rules?.winByTwo ?? true),
  };
}
function isGameWin(a = 0, b = 0, pointsToWin = 11, winByTwo = true) {
  const max = Math.max(Number(a || 0), Number(b || 0));
  const min = Math.min(Number(a || 0), Number(b || 0));
  if (max < Number(pointsToWin || 11)) return false;
  return winByTwo ? max - min >= 2 : max - min >= 1;
}
export function scoreForSide(m: any, side: "A" | "B"): string | number {
  if (!m) return "";
  const games = gameScoresOf(m);
  const n = games.length;
  if (n >= 2) {
    const { pointsToWin, winByTwo } = matchRules(m);
    let wa = 0;
    let wb = 0;
    for (const g of games) {
      if (!isGameWin(g?.a, g?.b, pointsToWin, winByTwo)) continue;
      if ((g?.a ?? 0) > (g?.b ?? 0)) wa += 1;
      else if ((g?.b ?? 0) > (g?.a ?? 0)) wb += 1;
    }
    return side === "A" ? wa : wb;
  }
  if (n === 1) {
    const g = games[0];
    return side === "A" ? (g?.a ?? "") : (g?.b ?? "");
  }
  if (Number.isFinite(m.scoreA) && Number.isFinite(m.scoreB)) {
    return side === "A" ? m.scoreA : m.scoreB;
  }
  return "";
}

/* ================= misc helpers ================= */
function initialsOf(name?: string): string {
  if (!name) return "?";
  const t = String(name)
    .replace(/\(.*?\)/g, "")
    .trim();
  if (!t) return "?";
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}
const isByeText = (s?: string) => /^\s*BYE\s*$/i.test(String(s || ""));
function timeShort(ts?: any): string {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}
function courtNameOf(m: any): string {
  const c = m?.court;
  if (!c) return "";
  if (typeof c === "string") return c;
  return c?.name || c?.title || c?.label || "";
}
function hasVideoOf(m: any): boolean {
  return !!(
    m?.video ||
    m?.streamUrl ||
    m?.videoUrl ||
    m?.stream?.url ||
    m?.overlay?.live ||
    m?.overlay?.roomId ||
    m?.broadcast?.url
  );
}

type StatusMeta = {
  key: "finished" | "live" | "ready" | "planned";
  label: string;
  bg: string;
  fg: string;
  border: string;
};
function statusMetaOf(m: any, isDark: boolean): StatusMeta {
  const st = String(m?.status || "").toLowerCase();
  if (st === "finished") {
    return {
      key: "finished",
      label: "Đã đấu",
      bg: rgba("#22c55e", 0.14),
      fg: isDark ? "#86efac" : "#166534",
      border: rgba("#22c55e", 0.4),
    };
  }
  if (st === "live") {
    return {
      key: "live",
      label: "Đang đấu",
      bg: rgba("#f59e0b", 0.18),
      fg: isDark ? "#fbbf24" : "#b45309",
      border: rgba("#f59e0b", 0.55),
    };
  }
  if (st === "assigned" || st === "queued") {
    return {
      key: "ready",
      label: "Sẵn sàng",
      bg: rgba("#3b82f6", 0.12),
      fg: isDark ? "#93c5fd" : "#1d4ed8",
      border: rgba("#3b82f6", 0.35),
    };
  }
  return {
    key: "planned",
    label: "Chưa diễn ra",
    bg: rgba("#94a3b8", 0.15),
    fg: isDark ? "#cbd5e1" : "#475569",
    border: rgba("#94a3b8", 0.4),
  };
}

function matchCodeOf(m: any, baseRoundStart = 1): string {
  if (!m) return "";
  const r = Number(m?.round ?? 1);
  const disp = Number.isFinite(r) ? baseRoundStart + (r - 1) : r;
  const t = Number.isFinite(Number(m?.order)) ? Number(m.order) + 1 : "?";
  return `V${disp}-T${t}`;
}

/* ================= Toggle chip (v4 / v1) ================= */
export function ModernBracketToggle({
  isV4,
  onToggle,
  t,
}: {
  isV4: boolean;
  onToggle: () => void;
  t: any;
}) {
  const bg = isV4 ? "#3b82f6" : t?.chipInfoBg || "#eef2f7";
  const fg = isV4 ? "#fff" : t?.chipInfoFg || "#263238";
  const border = isV4 ? "#3b82f6" : t?.chipInfoBd || "#e2e8f0";
  return (
    <View
      style={{
        flexDirection: "row",
        gap: 6,
        marginBottom: 8,
        marginTop: 4,
        alignItems: "center",
      }}
    >
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [
          {
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 999,
            backgroundColor: bg,
            borderWidth: 1,
            borderColor: border,
            opacity: pressed ? 0.8 : 1,
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
          },
        ]}
      >
        <Text style={{ fontSize: 13 }}>✨</Text>
        <Text
          style={{
            color: fg,
            fontWeight: "800",
            fontSize: 12,
            letterSpacing: 0.3,
          }}
        >
          {isV4 ? "Bản mới (đang xem)" : "Xem bản sơ đồ mới"}
        </Text>
      </Pressable>
    </View>
  );
}

/* ================= Round header chip ================= */
export function ModernRoundChip({
  title,
  count,
  accent,
  isFinal,
}: {
  title: string;
  count?: number;
  accent: string;
  isFinal?: boolean;
}) {
  return (
    <LinearGradient
      colors={[accent, darken(accent, 0.28)]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={sharedStyles.chip}
    >
      <Text style={{ fontSize: 13 }}>{isFinal ? "🏆" : "🎖️"}</Text>
      <Text style={sharedStyles.chipText}>{title}</Text>
      {count != null && count > 0 && (
        <Text style={sharedStyles.chipSub}>· {count}</Text>
      )}
    </LinearGradient>
  );
}

/* ================= Team row ================= */
function TeamRow({
  label,
  score,
  isWinner,
  isLive,
  isFinished,
  humanized,
  isDark,
}: {
  label: string;
  score: string | number;
  isWinner: boolean;
  isLive: boolean;
  isFinished: boolean;
  humanized: HumanizedLabel | null;
  isDark: boolean;
}) {
  const isPending = humanized && humanized.kind !== "team";
  const isBye = humanized?.kind === "bye";
  const displayLabel = humanized ? humanized.text : label;
  const teamColor = colorForName(displayLabel);
  const won = isWinner && isFinished;

  const rowBg = won
    ? rgba("#22c55e", 0.14)
    : "transparent";
  const borderLeft = won
    ? "#22c55e"
    : "transparent";

  const scoreBg = won
    ? "#22c55e"
    : isLive
      ? "#f59e0b"
      : isDark
        ? "rgba(255,255,255,0.08)"
        : "rgba(15,23,42,0.06)";
  const scoreFg = won || isLive ? "#fff" : isDark ? "#f8fafc" : "#0f172a";

  return (
    <View
      style={[
        sharedStyles.row,
        { backgroundColor: rowBg, borderLeftColor: borderLeft },
      ]}
    >
      <View
        style={[
          sharedStyles.avatar,
          {
            backgroundColor: isBye
              ? rgba(isDark ? "#94a3b8" : "#94a3b8", 0.2)
              : isPending
                ? rgba("#3b82f6", 0.15)
                : teamColor,
            borderColor: won
              ? "#22c55e"
              : isBye || isPending
                ? "transparent"
                : rgba(teamColor, 0.3),
          },
        ]}
      >
        <Text
          style={{
            color: isBye
              ? isDark
                ? "#94a3b8"
                : "#94a3b8"
              : isPending
                ? "#3b82f6"
                : "#fff",
            fontWeight: "800",
            fontSize: 11,
          }}
        >
          {isBye ? "⊝" : isPending ? "⏳" : initialsOf(displayLabel)}
        </Text>
      </View>
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          fontSize: 13,
          fontWeight: won ? "800" : "500",
          color: isBye || isPending
            ? isDark
              ? "#94a3b8"
              : "#64748b"
            : won
              ? isDark
                ? "#86efac"
                : "#15803d"
              : isDark
                ? "#f8fafc"
                : "#0f172a",
          fontStyle: isBye || isPending ? "italic" : "normal",
        }}
      >
        {displayLabel}
      </Text>
      <View
        style={[
          sharedStyles.scoreBox,
          { backgroundColor: scoreBg },
        ]}
      >
        <Text
          style={{
            color: scoreFg,
            fontWeight: "800",
            fontSize: 14,
            fontVariant: ["tabular-nums"],
          }}
        >
          {score !== "" && score != null ? String(score) : "–"}
        </Text>
      </View>
    </View>
  );
}

/* ================= VS divider ================= */
function VsDivider({ accent, isDark }: { accent: string; isDark: boolean }) {
  return (
    <View style={sharedStyles.vsWrap}>
      <View
        style={[
          sharedStyles.vsLine,
          { backgroundColor: rgba(accent, 0.3) },
        ]}
      />
      <Text
        style={{
          fontSize: 9,
          fontWeight: "900",
          color: isDark ? lighten(accent, 0.4) : darken(accent, 0.1),
          letterSpacing: 1.2,
        }}
      >
        VS
      </Text>
      <View
        style={[
          sharedStyles.vsLine,
          { backgroundColor: rgba(accent, 0.3) },
        ]}
      />
    </View>
  );
}

/* ================= Live pulse dot ================= */
function LivePulseDot({ color = "#f59e0b" }: { color?: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.2] });
  const opacity = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 1],
  });
  return (
    <Animated.View
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: color,
        transform: [{ scale }],
        opacity,
        marginRight: 4,
      }}
    />
  );
}

/* ================= Champion trophy floating ================= */
function ChampionBadge() {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -5],
  });
  return (
    <Animated.View
      style={[
        sharedStyles.championBadge,
        { transform: [{ translateY }] },
      ]}
    >
      <LinearGradient
        colors={["#fbbf24", "#d97706"]}
        style={sharedStyles.championBadgeInner}
      >
        <Text style={{ fontSize: 18 }}>🏆</Text>
      </LinearGradient>
    </Animated.View>
  );
}

/* ================= Modern seed card (main) ================= */
export type ResolveSideLabel = (m: any, side: "A" | "B") => string;

export function ModernSeedCard({
  seed,
  onOpenMatch,
  championMatchId,
  resolveSideLabel,
  baseRoundStart = 1,
  accent = "#3b82f6",
  isDark,
  cardWidth = MODERN_CARD_W,
  nodeKey,
}: {
  seed: any;
  onOpenMatch?: (m: any) => void;
  championMatchId?: string | number | null;
  resolveSideLabel?: ResolveSideLabel;
  baseRoundStart?: number;
  accent?: string;
  isDark: boolean;
  cardWidth?: number;
  nodeKey?: string;
}) {
  const m = seed?.__match || null;

  const rawA = resolveSideLabel?.(m, "A") ?? (m ? "—" : "Chưa có đội");
  const rawB = resolveSideLabel?.(m, "B") ?? (m ? "—" : "Chưa có đội");
  const humA = humanizeSeedRefLabel(rawA);
  const humB = humanizeSeedRefLabel(rawB);

  const isByeA = humA?.kind === "bye" || isByeText(rawA);
  const isByeB = humB?.kind === "bye" || isByeText(rawB);
  const isByeMatch = isByeA || isByeB;

  const status = String(m?.status || "").toLowerCase();
  const isFinished = status === "finished";
  const isLive = status === "live";
  const winA = !isByeMatch && isFinished && m?.winner === "A";
  const winB = !isByeMatch && isFinished && m?.winner === "B";

  const sA = m ? scoreForSide(m, "A") : "";
  const sB = m ? scoreForSide(m, "B") : "";

  const isChampion =
    !!m &&
    !!championMatchId &&
    String(m._id) === String(championMatchId) &&
    (winA || winB);

  const meta = statusMetaOf(m, isDark);
  const code = matchCodeOf(m, baseRoundStart);
  const timeStr = timeShort(m?.scheduledAt || m?.startedAt || m?.assignedAt);
  const courtStr = courtNameOf(m);
  const hasVid = hasVideoOf(m);
  const clickable = !!m && !m.__syntheticByeAdvance;

  const cardBg = isDark ? "#16181c" : "#ffffff";
  const borderColor = isChampion
    ? rgba("#f59e0b", 0.85)
    : isLive
      ? rgba("#f59e0b", 0.7)
      : rgba(accent, isDark ? 0.5 : 0.35);

  return (
    <Pressable
      onPress={() => clickable && onOpenMatch?.(m)}
      style={({ pressed }) => [
        sharedStyles.card,
        {
          width: cardWidth,
          backgroundColor: cardBg,
          borderColor,
          borderTopColor: isChampion ? "#f59e0b" : accent,
          borderTopWidth: 3,
          opacity: pressed && clickable ? 0.85 : 1,
          shadowColor: isChampion ? "#f59e0b" : accent,
          shadowOpacity: isChampion ? 0.4 : 0.2,
          shadowRadius: isChampion ? 12 : 6,
          shadowOffset: { width: 0, height: 3 },
          elevation: isChampion ? 6 : 3,
        },
      ]}
    >
      {isChampion && <ChampionBadge />}

      {/* Header gradient */}
      <LinearGradient
        colors={[
          rgba(accent, isDark ? 0.28 : 0.14),
          rgba(accent, isDark ? 0.1 : 0.04),
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          sharedStyles.header,
          { borderBottomColor: rgba(accent, 0.3) },
        ]}
      >
        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
          {isLive && <LivePulseDot />}
          <Text
            style={{
              fontSize: 11,
              fontWeight: "900",
              color: isDark ? lighten(accent, 0.35) : darken(accent, 0.15),
              letterSpacing: 0.4,
            }}
          >
            {code}
          </Text>
          <View
            style={{
              backgroundColor: meta.bg,
              borderRadius: 4,
              paddingHorizontal: 5,
              paddingVertical: 1,
              marginLeft: 6,
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontWeight: "700",
                color: meta.fg,
              }}
            >
              {meta.label}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {!!timeStr && (
            <Text
              style={{
                fontSize: 10,
                color: isDark ? "#cbd5e1" : "#64748b",
              }}
            >
              🕐 {timeStr}
            </Text>
          )}
          {!!courtStr && (
            <Text
              style={{
                fontSize: 10,
                color: isDark ? "#cbd5e1" : "#64748b",
                maxWidth: 50,
              }}
              numberOfLines={1}
            >
              🏟 {courtStr}
            </Text>
          )}
          {hasVid && (
            <Text
              style={{
                fontSize: 11,
                color: "#3b82f6",
              }}
            >
              🎥
            </Text>
          )}
        </View>
      </LinearGradient>

      {/* Team rows */}
      <View style={{ paddingHorizontal: 6, paddingVertical: 6, gap: 2 }}>
        <TeamRow
          label={rawA}
          score={sA}
          isWinner={winA}
          isLive={isLive}
          isFinished={isFinished}
          humanized={humA}
          isDark={isDark}
        />
        <VsDivider accent={accent} isDark={isDark} />
        <TeamRow
          label={rawB}
          score={sB}
          isWinner={winB}
          isLive={isLive}
          isFinished={isFinished}
          humanized={humB}
          isDark={isDark}
        />
      </View>
      {nodeKey ? <View testID={`mkb-card-${nodeKey}`} /> : null}
    </Pressable>
  );
}

/* ================= styles ================= */
const sharedStyles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "visible",
    marginVertical: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomWidth: 1,
    borderStyle: "dashed",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderLeftWidth: 3,
    minHeight: 34,
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreBox: {
    minWidth: 30,
    height: 26,
    paddingHorizontal: 6,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  vsWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    marginVertical: -1,
  },
  vsLine: {
    flex: 1,
    height: 1,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0.4,
  },
  chipSub: {
    fontSize: 10.5,
    fontWeight: "700",
    color: "rgba(255,255,255,0.85)",
  },
  championBadge: {
    position: "absolute",
    top: -14,
    right: -10,
    zIndex: 10,
  },
  championBadgeInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#f59e0b",
    shadowOpacity: 0.6,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
});
