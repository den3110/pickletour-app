/* eslint-disable react/prop-types */
// ModernGroupStageRN.tsx
// Bản v4 — layer HIỂN THỊ mới cho VÒNG BẢNG trên mobile.
// KHÔNG đụng logic tính standings / matchRows — nhận payload đã chuẩn hoá
// từ bracket.tsx và chỉ lo render. Bản classic giữ nguyên (gate v4).

import React, { useEffect, useRef } from "react";
import {
  View,
  Pressable,
  Animated,
  Easing,
  StyleSheet,
} from "react-native";
import { Text } from "@/components/ui/i18nText";
import { LinearGradient } from "expo-linear-gradient";
import { rgba, darken, lighten } from "./ModernBracketShared";

/* ================= palette accent theo index bảng ================= */
const GROUP_ACCENTS = [
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#06b6d4",
  "#14b8a6",
  "#6366f1",
  "#f97316",
];
const accentForGroup = (i: number) =>
  GROUP_ACCENTS[Math.max(0, i) % GROUP_ACCENTS.length];

/* Avatar màu ổn định theo tên đội (đồng bộ ModernBracketShared) */
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

const PLACEHOLDER_RE = /^(Đội\s+\d+|TBD|Chưa có đội|Registration.*)$/i;
const isPlaceholderName = (s?: string) =>
  PLACEHOLDER_RE.test(String(s || "").trim());

/* ================= types ================= */
export type ModernGroupMatchRow = {
  _id: string;
  code: string;
  aName: string;
  bName: string;
  time?: string;
  court?: string;
  score?: string;
  match?: any;
  isPlaceholder?: boolean;
};

export type ModernGroupStandingRow = {
  id: string;
  name: string;
  pts: number;
  diff: number;
  rank: number;
  isMine?: boolean;
};

export type ModernGroupEntry = {
  key: string;
  labelNumeric: number;
  codeLabel?: string;
  teamCount: number;
  isMine?: boolean;
  pointsCfg: { win?: number; draw?: number; loss?: number };
  matchRows: ModernGroupMatchRow[];
  standingRows: ModernGroupStandingRow[];
};

/* ================= status meta ================= */
function statusMetaOf(m: any, isDark: boolean) {
  const st = String(m?.status || "").toLowerCase();
  if (st === "finished")
    return {
      key: "finished" as const,
      label: "Đã đấu",
      color: "#22c55e",
      bg: rgba("#22c55e", 0.14),
      fg: isDark ? "#86efac" : "#166534",
    };
  if (st === "live")
    return {
      key: "live" as const,
      label: "Đang đấu",
      color: "#f59e0b",
      bg: rgba("#f59e0b", 0.18),
      fg: isDark ? "#fbbf24" : "#b45309",
    };
  if (st === "assigned" || st === "queued")
    return {
      key: "ready" as const,
      label: "Sẵn sàng",
      color: "#3b82f6",
      bg: rgba("#3b82f6", 0.12),
      fg: isDark ? "#93c5fd" : "#1d4ed8",
    };
  return {
    key: "planned" as const,
    label: "Chưa diễn ra",
    color: "#94a3b8",
    bg: rgba("#94a3b8", 0.16),
    fg: isDark ? "#cbd5e1" : "#475569",
  };
}

/* ================= live pulse ================= */
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
  const scale = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.8, 1.2],
  });
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });
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

/* ================= team avatar ================= */
function TeamAvatar({
  name,
  size = 24,
  muted,
}: {
  name?: string;
  size?: number;
  muted?: boolean;
}) {
  const c = muted ? "#94a3b8" : colorForName(name);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: muted ? rgba("#94a3b8", 0.35) : c,
        borderWidth: 2,
        borderColor: rgba(c, 0.3),
      }}
    >
      <Text
        style={{
          color: "#fff",
          fontWeight: "800",
          fontSize: size * 0.4,
        }}
      >
        {muted ? "⏳" : initialsOf(name)}
      </Text>
    </View>
  );
}

/* ================= match card ================= */
function ModernGroupMatchCard({
  row,
  accent,
  isDark,
  onOpenMatch,
}: {
  row: ModernGroupMatchRow;
  accent: string;
  isDark: boolean;
  onOpenMatch?: (m: any) => void;
}) {
  const m = row.match;
  const meta = statusMetaOf(m, isDark);
  const isLive = meta.key === "live";
  const isFinished = meta.key === "finished";
  const clickable = !row.isPlaceholder && !!m;
  const winner = isFinished ? String(m?.winner || "") : "";
  const phA = isPlaceholderName(row.aName);
  const phB = isPlaceholderName(row.bName);

  const scoreMatch = String(row.score || "")
    .trim()
    .match(/^(\d+)\s*[-–]\s*(\d+)$/);
  const scorePair = scoreMatch ? [scoreMatch[1], scoreMatch[2]] : null;

  const sideRow = (name: string, side: "A" | "B", ph: boolean) => {
    const won = winner === side;
    const scoreVal = scorePair ? scorePair[side === "A" ? 0 : 1] : null;
    return (
      <View
        style={[
          styles.teamRow,
          {
            backgroundColor: won ? rgba("#22c55e", 0.12) : "transparent",
            borderLeftColor: won ? "#22c55e" : "transparent",
          },
        ]}
      >
        <TeamAvatar name={name} muted={ph} />
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            fontSize: 13,
            fontWeight: won ? "800" : "500",
            fontStyle: ph ? "italic" : "normal",
            color: ph
              ? isDark
                ? "#94a3b8"
                : "#94a3b8"
              : won
                ? isDark
                  ? "#86efac"
                  : "#15803d"
                : isDark
                  ? "#f8fafc"
                  : "#0f172a",
          }}
        >
          {name}
        </Text>
        {scoreVal != null && (
          <View
            style={[
              styles.scoreBox,
              {
                backgroundColor: won
                  ? "#22c55e"
                  : isLive
                    ? "#f59e0b"
                    : isDark
                      ? "rgba(255,255,255,0.08)"
                      : "rgba(15,23,42,0.06)",
              },
            ]}
          >
            <Text
              style={{
                color:
                  won || isLive ? "#fff" : isDark ? "#f8fafc" : "#0f172a",
                fontWeight: "800",
                fontSize: 14,
                fontVariant: ["tabular-nums"],
              }}
            >
              {scoreVal}
            </Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <Pressable
      onPress={() => clickable && onOpenMatch?.(m)}
      style={({ pressed }) => [
        styles.matchCard,
        {
          backgroundColor: isDark ? "#16181c" : "#ffffff",
          borderColor: isLive
            ? rgba("#f59e0b", 0.7)
            : rgba(accent, isDark ? 0.4 : 0.25),
          borderTopColor: isLive ? "#f59e0b" : accent,
          opacity: pressed && clickable ? 0.85 : 1,
          shadowColor: isLive ? "#f59e0b" : accent,
        },
      ]}
    >
      {/* header */}
      <LinearGradient
        colors={[
          rgba(accent, isDark ? 0.26 : 0.12),
          rgba(accent, isDark ? 0.08 : 0.03),
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.matchHeader, { borderBottomColor: rgba(accent, 0.3) }]}
      >
        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
          {isLive && <LivePulseDot />}
          <Text
            style={{
              fontSize: 11,
              fontWeight: "900",
              letterSpacing: 0.4,
              color: isDark ? lighten(accent, 0.35) : darken(accent, 0.15),
            }}
          >
            {row.code}
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
            <Text style={{ fontSize: 10, fontWeight: "700", color: meta.fg }}>
              {meta.label}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {!!row.time && (
            <Text
              style={{ fontSize: 10, color: isDark ? "#cbd5e1" : "#64748b" }}
            >
              🕐 {row.time}
            </Text>
          )}
          {!!row.court && (
            <Text
              numberOfLines={1}
              style={{
                fontSize: 10,
                color: isDark ? "#cbd5e1" : "#64748b",
                maxWidth: 70,
              }}
            >
              🏟 {row.court}
            </Text>
          )}
          {!scorePair && !!row.score && (
            <Text
              style={{
                fontSize: 12,
                fontWeight: "800",
                color: isDark ? "#f8fafc" : "#0f172a",
              }}
            >
              {row.score}
            </Text>
          )}
        </View>
      </LinearGradient>

      {/* teams */}
      <View style={{ paddingHorizontal: 6, paddingVertical: 6, gap: 2 }}>
        {sideRow(row.aName, "A", phA)}
        <View style={styles.vsWrap}>
          <View style={[styles.vsLine, { backgroundColor: rgba(accent, 0.3) }]} />
          <Text
            style={{
              fontSize: 9,
              fontWeight: "900",
              letterSpacing: 1.2,
              color: isDark ? lighten(accent, 0.4) : darken(accent, 0.1),
            }}
          >
            VS
          </Text>
          <View style={[styles.vsLine, { backgroundColor: rgba(accent, 0.3) }]} />
        </View>
        {sideRow(row.bName, "B", phB)}
      </View>
    </Pressable>
  );
}

/* ================= standings row ================= */
const MEDAL_COLORS: [string, string][] = [
  ["#fbbf24", "#d97706"], // gold
  ["#e2e8f0", "#94a3b8"], // silver
  ["#d6a06b", "#92600d"], // bronze
];

function ModernStandingRowRN({
  row,
  accent,
  isDark,
}: {
  row: ModernGroupStandingRow;
  accent: string;
  isDark: boolean;
}) {
  const rankIdx = (row.rank || 1) - 1;
  const medal = rankIdx >= 0 && rankIdx < 3 ? MEDAL_COLORS[rankIdx] : null;
  const diff = Number(row.diff) || 0;
  return (
    <View
      style={[
        styles.standRow,
        {
          backgroundColor: row.isMine
            ? rgba("#3b82f6", isDark ? 0.14 : 0.07)
            : isDark
              ? "rgba(255,255,255,0.03)"
              : "rgba(15,23,42,0.02)",
          borderColor: row.isMine
            ? rgba("#3b82f6", 0.35)
            : isDark
              ? "rgba(255,255,255,0.07)"
              : "rgba(15,23,42,0.07)",
        },
      ]}
    >
      {medal ? (
        <LinearGradient colors={medal} style={styles.rankBadge}>
          <Text style={styles.rankBadgeText}>{row.rank}</Text>
        </LinearGradient>
      ) : (
        <View
          style={[
            styles.rankBadge,
            {
              backgroundColor: isDark
                ? "rgba(255,255,255,0.08)"
                : "rgba(15,23,42,0.06)",
            },
          ]}
        >
          <Text
            style={[
              styles.rankBadgeText,
              { color: isDark ? "#f8fafc" : "#0f172a" },
            ]}
          >
            {row.rank}
          </Text>
        </View>
      )}
      <TeamAvatar name={row.name} size={22} muted={isPlaceholderName(row.name)} />
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          fontSize: 13,
          fontWeight: row.isMine ? "800" : "600",
          color: row.isMine
            ? isDark
              ? "#93c5fd"
              : "#1d4ed8"
            : isDark
              ? "#f8fafc"
              : "#0f172a",
        }}
      >
        {row.name}
      </Text>
      <LinearGradient
        colors={[accent, darken(accent, 0.25)]}
        style={styles.ptsBadge}
      >
        <Text style={styles.ptsBadgeText}>{row.pts}đ</Text>
      </LinearGradient>
      <Text
        style={{
          width: 40,
          textAlign: "right",
          fontSize: 12,
          fontWeight: "700",
          fontVariant: ["tabular-nums"],
          color:
            diff > 0
              ? isDark
                ? "#86efac"
                : "#15803d"
              : diff < 0
                ? isDark
                  ? "#fca5a5"
                  : "#b91c1c"
                : isDark
                  ? "#94a3b8"
                  : "#64748b",
        }}
      >
        {diff > 0 ? `+${diff}` : String(diff)}
      </Text>
    </View>
  );
}

/* ================= group card ================= */
function ModernGroupCardRN({
  entry,
  index,
  isDark,
  onOpenMatch,
}: {
  entry: ModernGroupEntry;
  index: number;
  isDark: boolean;
  onOpenMatch?: (m: any) => void;
}) {
  const accent = accentForGroup(index);
  const total = entry.matchRows?.length || 0;
  const done = entry.matchRows.filter(
    (r) => String(r.match?.status || "").toLowerCase() === "finished",
  ).length;
  const live = entry.matchRows.filter(
    (r) => String(r.match?.status || "").toLowerCase() === "live",
  ).length;
  const progress = total ? done / total : 0;

  return (
    <View
      style={[
        styles.groupCard,
        {
          backgroundColor: isDark ? "#101216" : "#fbfcfe",
          borderColor: entry.isMine
            ? rgba("#3b82f6", 0.5)
            : rgba(accent, isDark ? 0.4 : 0.25),
          shadowColor: entry.isMine ? "#3b82f6" : accent,
        },
      ]}
    >
      {/* header gradient */}
      <LinearGradient
        colors={[accent, darken(accent, 0.35)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.groupHeader}
      >
        <View style={styles.headerDeco1} />
        <View style={styles.headerDeco2} />
        <View
          style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
        >
          <View style={[styles.groupLetter]}>
            <Text
              style={{ color: accent, fontWeight: "900", fontSize: 19 }}
            >
              {entry.codeLabel
                ? String(entry.codeLabel).slice(0, 2).toUpperCase()
                : entry.labelNumeric}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={{
                color: "#fff",
                fontWeight: "900",
                fontSize: 16,
              }}
            >
              Bảng {entry.labelNumeric}
              {entry.codeLabel ? ` · ${entry.codeLabel}` : ""}
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                marginTop: 3,
                flexWrap: "wrap",
              }}
            >
              <Text style={styles.headerMeta}>👥 {entry.teamCount} đội</Text>
              <Text style={styles.headerMeta}>
                {done}/{total} trận xong
              </Text>
              {live > 0 && (
                <View
                  style={{ flexDirection: "row", alignItems: "center" }}
                >
                  <LivePulseDot color="#fff" />
                  <Text
                    style={[styles.headerMeta, { fontWeight: "800" }]}
                  >
                    {live} đang đấu
                  </Text>
                </View>
              )}
              {entry.isMine && (
                <View style={styles.minePill}>
                  <Text
                    style={{
                      fontSize: 10.5,
                      fontWeight: "800",
                      color: "#fff",
                    }}
                  >
                    ⭐ Bảng của tôi
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
        {/* progress bar */}
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressBar,
              { width: `${Math.round(progress * 100)}%` },
            ]}
          />
        </View>
      </LinearGradient>

      {/* body */}
      <View style={{ padding: 12 }}>
        <Text
          style={[
            styles.sectionLabel,
            { color: isDark ? lighten(accent, 0.35) : darken(accent, 0.12) },
          ]}
        >
          TRẬN TRONG BẢNG
        </Text>
        {entry.matchRows?.length ? (
          <View style={{ gap: 10, marginBottom: 14 }}>
            {entry.matchRows.map((r) => (
              <ModernGroupMatchCard
                key={r._id}
                row={r}
                accent={accent}
                isDark={isDark}
                onOpenMatch={onOpenMatch}
              />
            ))}
          </View>
        ) : (
          <View
            style={[
              styles.emptyBox,
              {
                borderColor: isDark
                  ? "rgba(255,255,255,0.12)"
                  : "rgba(15,23,42,0.12)",
              },
            ]}
          >
            <Text
              style={{ color: isDark ? "#94a3b8" : "#64748b", fontSize: 13 }}
            >
              Chưa có trận nào.
            </Text>
          </View>
        )}

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            marginBottom: 8,
          }}
        >
          <Text style={{ fontSize: 13 }}>🏆</Text>
          <Text
            style={[
              styles.sectionLabel,
              {
                marginBottom: 0,
                color: isDark ? lighten(accent, 0.35) : darken(accent, 0.12),
              },
            ]}
          >
            BẢNG XẾP HẠNG
          </Text>
          <View style={{ flex: 1 }} />
          <Text
            style={{ fontSize: 10.5, color: isDark ? "#94a3b8" : "#64748b" }}
          >
            Thắng +{entry.pointsCfg?.win ?? 3} · Thua +
            {entry.pointsCfg?.loss ?? 0}
          </Text>
        </View>
        {entry.standingRows?.length ? (
          <View style={{ gap: 6 }}>
            {entry.standingRows.map((row) => (
              <ModernStandingRowRN
                key={row.id}
                row={row}
                accent={accent}
                isDark={isDark}
              />
            ))}
          </View>
        ) : (
          <View
            style={[
              styles.emptyBox,
              {
                borderColor: isDark
                  ? "rgba(255,255,255,0.12)"
                  : "rgba(15,23,42,0.12)",
              },
            ]}
          >
            <Text
              style={{ color: isDark ? "#94a3b8" : "#64748b", fontSize: 13 }}
            >
              Chưa có dữ liệu BXH.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

/* ================= main ================= */
export default function ModernGroupStageRN({
  groups,
  isDark,
  onOpenMatch,
  zoom = 1,
}: {
  groups: ModernGroupEntry[];
  isDark: boolean;
  onOpenMatch?: (m: any) => void;
  zoom?: number;
}) {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  if (!groups?.length) {
    return (
      <View
        style={[
          styles.emptyBox,
          {
            borderColor: isDark
              ? "rgba(255,255,255,0.12)"
              : "rgba(15,23,42,0.12)",
          },
        ]}
      >
        <Text style={{ color: isDark ? "#94a3b8" : "#64748b", fontSize: 13 }}>
          Không có bảng nào khớp bộ lọc.
        </Text>
      </View>
    );
  }
  return (
    <View
      style={{
        gap: 14,
        transform: [{ scale: safeZoom }],
        transformOrigin: "top left",
      }}
    >
      {groups.map((entry, i) => (
        <ModernGroupCardRN
          key={entry.key}
          entry={entry}
          index={entry.labelNumeric ? entry.labelNumeric - 1 : i}
          isDark={isDark}
          onOpenMatch={onOpenMatch}
        />
      ))}
    </View>
  );
}

/* ================= styles ================= */
const styles = StyleSheet.create({
  groupCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  groupHeader: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    overflow: "hidden",
  },
  headerDeco1: {
    position: "absolute",
    right: -28,
    top: -34,
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  headerDeco2: {
    position: "absolute",
    right: 40,
    bottom: -44,
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  groupLetter: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  headerMeta: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "rgba(255,255,255,0.9)",
  },
  minePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.22)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.45)",
  },
  progressTrack: {
    marginTop: 10,
    height: 5,
    borderRadius: 99,
    backgroundColor: "rgba(255,255,255,0.22)",
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    borderRadius: 99,
    backgroundColor: "#fff",
  },
  sectionLabel: {
    fontSize: 11.5,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 8,
  },
  matchCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderTopWidth: 3,
    overflow: "hidden",
    shadowOpacity: 0.14,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  matchHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderStyle: "dashed",
  },
  teamRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderLeftWidth: 3,
    minHeight: 34,
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
  standRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  rankBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  rankBadgeText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 11.5,
  },
  ptsBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  ptsBadgeText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  emptyBox: {
    padding: 14,
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
  },
});
