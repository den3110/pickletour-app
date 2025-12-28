/* eslint-disable react/prop-types */
import React, { useMemo, useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
  Share,
  Clipboard,
  Alert,
  ActivityIndicator,
  StatusBar,
  Platform,
  RefreshControl,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useSelector } from "react-redux";
import * as Haptics from "expo-haptics";
import { useTheme } from "@react-navigation/native";
import * as Linking from "expo-linking";
import ImageViewing from "react-native-image-viewing";

import BottomSheet, {
  BottomSheetView,
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetModalProvider,
} from "@gorhom/bottom-sheet";

import {
  Ionicons,
  MaterialCommunityIcons,
  FontAwesome5,
} from "@expo/vector-icons";

import {
  useGetPublicProfileQuery,
  useGetRatingHistoryQuery,
  useGetMatchHistoryQuery,
  useDeleteRatingHistoryMutation,
  useGetUserAchievementsQuery,
} from "@/slices/usersApiSlice";
import { useLocalSearchParams, router } from "expo-router";
import { normalizeUrl } from "@/utils/normalizeUri";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const HEADER_HEIGHT = 350;
const AVATAR_SIZE = 120;
const isSmallDevice = SCREEN_WIDTH <= 360;
const TAB_BAR_HEIGHT = 52;

/* ---------- CONSTANTS & UTILS ---------- */
const AVA_PLACE = "https://dummyimage.com/160x160/cccccc/ffffff&text=?";
const tz = { timeZone: "Asia/Bangkok" };

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString("vi-VN", tz) : "—";

const fmtDT = (iso) =>
  iso
    ? new Date(iso).toLocaleString("vi-VN", {
        ...tz,
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
      })
    : "—";

const fmtShortDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}`;
};

const num = (v, digits = 3) =>
  Number.isFinite(+v) ? Number(v).toFixed(digits) : "—";
const numFloat = (v, digits = 3) =>
  Number.isFinite(+v) ? Number(v).toFixed(digits) : "—";

const getGenderInfo = (g) => {
  if (g === null || g === undefined) return { label: "Khác", color: "#9E9E9E" };
  const s = String(g).toLowerCase().trim();
  if (["1", "male", "m", "nam"].includes(s))
    return { label: "Nam", color: "#2196F3" };
  if (["2", "female", "f", "nu", "nữ"].includes(s))
    return { label: "Nữ", color: "#E91E63" };
  return { label: "Khác", color: "#9E9E9E" };
};

const getKycStatusMeta = (status) => {
  switch (status) {
    case "verified":
      return {
        label: "Đã xác thực",
        color: "#4CAF50",
        icon: "checkmark-circle",
        bgColor: "#E8F5E9",
      };
    case "pending":
      return {
        label: "Đang xác thực",
        color: "#FF9800",
        icon: "time",
        bgColor: "#FFF3E0",
      };
    case "rejected":
      return {
        label: "Bị từ chối",
        color: "#F44336",
        icon: "close-circle",
        bgColor: "#FFEBEE",
      };
    default:
      return {
        label: "Chưa xác thực",
        color: "#9E9E9E",
        icon: "shield-outline",
        bgColor: "#F5F5F5",
      };
  }
};

const calcAge = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age < 0 || age > 120 ? "—" : age;
};

const getHandLabel = (h) => {
  if (!h) return null;
  const s = String(h).toLowerCase();
  if (["left", "trai", "l"].includes(s)) return "Tay trái";
  if (["right", "phai", "r"].includes(s)) return "Tay phải";
  if (["both", "ambi", "2", "hai tay"].includes(s)) return "Hai tay";
  return h;
};

const hasData = (v) => {
  if (v === null || v === undefined) return false;
  if (typeof v === "number") return true;
  const s = String(v).trim();
  return s && s !== "—";
};

function getSPC(base) {
  const s = base?.spc;
  if (!s || typeof s !== "object") return null;
  const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const m = s.meta || {};
  return {
    single: toNum(s.single),
    double: toNum(s.double),
    meta: {
      sportId: m.sportId ?? null,
      description: m.description ?? null,
      scoredAt: m.scoredAt ?? null,
      joinDate: m.joinDate ?? null,
      source: m.source ?? null,
    },
  };
}

/* ---------- SUB-COMPONENTS ---------- */

const StatCard = React.memo(({ icon, value, label, gradient, onPress }) => (
  <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={{ flex: 1 }}>
    <LinearGradient
      colors={gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.statCard, isSmallDevice && styles.statCardSmall]}
    >
      <View style={styles.statIconContainer}>{icon}</View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={styles.statCardTapHint}>
        <Ionicons
          name="chevron-forward"
          size={14}
          color="rgba(255,255,255,0.6)"
        />
      </View>
    </LinearGradient>
  </TouchableOpacity>
));

const InfoBadge = React.memo(
  ({ icon, text, color = "#666", bgColor, textColor }) => (
    <View
      style={[
        styles.badge,
        {
          borderColor: bgColor ? "transparent" : color,
          backgroundColor: bgColor || "transparent",
        },
      ]}
    >
      {icon}
      <Text
        style={[
          styles.badgeText,
          { color: textColor ? textColor : bgColor ? "#FFF" : color },
        ]}
      >
        {text}
      </Text>
    </View>
  )
);

const KycBadge = React.memo(({ status }) => {
  const meta = getKycStatusMeta(status);
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      style={[styles.kycBadge, { backgroundColor: meta.bgColor }]}
    >
      <Ionicons name={meta.icon} size={14} color={meta.color} />
      <Text style={[styles.kycBadgeText, { color: meta.color }]}>
        {meta.label}
      </Text>
    </TouchableOpacity>
  );
});

/* ======= (RESTORE OLD UI) Match History Components ======= */

const PlayerRowCompact = React.memo(({ player, highlight, colors }) => {
  const up = (player?.delta ?? 0) > 0;
  const name =
    player?.user?.nickname ||
    player?.user?.fullName ||
    player?.nickname ||
    player?.fullName ||
    "N/A";

  const spcObj = player?.spc || player?.user?.spc || {};
  const scS = Number.isFinite(Number(spcObj.single))
    ? Number(spcObj.single)
    : null;
  const scD = Number.isFinite(Number(spcObj.double))
    ? Number(spcObj.double)
    : null;

  return (
    <View style={styles.playerRowCompact}>
      <Image
        source={{ uri: normalizeUrl(player?.avatar) || AVA_PLACE }}
        style={[styles.playerAvatarCompact, { borderColor: colors.card }]}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={150}
      />
      <View style={styles.playerInfoCompact}>
        <Text
          style={[
            styles.playerNameCompact,
            { color: colors.text },
            highlight && { color: colors.primary, fontWeight: "700" },
          ]}
          numberOfLines={1}
        >
          {name}
        </Text>

        <View style={styles.playerStatsRow}>
          {player?.postScore !== undefined && player?.postScore !== null && (
            <View style={styles.scoreChangeCompact}>
              <Text
                style={[
                  styles.scoreChangeTextCompact,
                  { color: colors.subText },
                ]}
              >
                {num(player.preScore)} → {num(player.postScore)}
              </Text>
              {Number.isFinite(+player.delta) && player.delta !== 0 && (
                <Text
                  style={[
                    styles.deltaTextCompact,
                    { color: up ? "#4CAF50" : "#F44336" },
                  ]}
                >
                  {up ? "+" : ""}
                  {numFloat(player.delta)}
                </Text>
              )}
            </View>
          )}

          {(scS !== null || scD !== null) && (
            <View style={styles.scChipsRow}>
              {scS !== null && (
                <View style={[styles.scChip, { backgroundColor: "#dcfce7" }]}>
                  <Text style={[styles.scChipTxt, { color: "#166534" }]}>
                    S: {num(scS)}
                  </Text>
                </View>
              )}
              {scD !== null && (
                <View style={[styles.scChip, { backgroundColor: "#fef9c3" }]}>
                  <Text style={[styles.scChipTxt, { color: "#854d0e" }]}>
                    D: {num(scD)}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    </View>
  );
});

const MatchCard = React.memo(({ match, userId, onPress, colors }) => {
  const winnerA = match.winner === "A";
  const winnerB = match.winner === "B";
  const myInA = match.team1?.some((p) => (p._id || p.id) === userId);
  const myInB = match.team2?.some((p) => (p._id || p.id) === userId);
  const isMyWin = (myInA && winnerA) || (myInB && winnerB);

  return (
    <TouchableOpacity
      style={styles.matchCard}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View
        style={[styles.matchCardContainer, { backgroundColor: colors.card }]}
      >
        <View style={styles.matchHeader}>
          <View
            style={[
              styles.resultBadge,
              { backgroundColor: isMyWin ? "#4CAF50" : "#9E9E9E" },
            ]}
          >
            <Text style={styles.resultText}>{isMyWin ? "THẮNG" : "THUA"}</Text>
          </View>
          <View style={styles.matchHeaderRight}>
            <Text style={[styles.matchDate, { color: colors.subText }]}>
              {fmtDT(match.dateTime)}
            </Text>
            <Text style={[styles.tournamentName, { color: colors.text }]}>
              {match.tournament?.name || "Giao hữu"}
            </Text>
          </View>
        </View>

        <View style={styles.teamsVerticalContainer}>
          <View
            style={[styles.teamSection, { backgroundColor: colors.bgMuted }]}
          >
            <View style={styles.teamPlayers}>
              {match.team1?.map((p, i) => (
                <PlayerRowCompact
                  key={`t1-${i}`}
                  player={p}
                  highlight={winnerA}
                  colors={colors}
                />
              ))}
            </View>
          </View>

          <View style={styles.scoreDisplayContainer}>
            <Text style={[styles.scoreDisplayText, { color: colors.text }]}>
              {match.scoreText || "VS"}
            </Text>
          </View>

          <View
            style={[styles.teamSection, { backgroundColor: colors.bgMuted }]}
          >
            <View style={styles.teamPlayers}>
              {match.team2?.map((p, i) => (
                <PlayerRowCompact
                  key={`t2-${i}`}
                  player={p}
                  highlight={winnerB}
                  colors={colors}
                />
              ))}
            </View>
          </View>
        </View>

        {match.video && (
          <TouchableOpacity
            style={[
              styles.videoButton,
              { borderTopColor: colors.border || "#F0F0F0" },
            ]}
            activeOpacity={0.8}
          >
            <Ionicons name="play-circle" size={18} color="#FF3B30" />
            <Text style={styles.videoText}>Video</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
});

/* ======= Rating History Row (keep stable + avoid unused delete mutation) ======= */
const RatingHistoryRow = React.memo(
  ({ item, prevItem, isAdmin, isDeleting, onDelete, colors }) => {
    const singleDelta =
      prevItem &&
      Number.isFinite(item.single) &&
      Number.isFinite(prevItem.single)
        ? item.single - prevItem.single
        : 0;
    const doubleDelta =
      prevItem &&
      Number.isFinite(item.double) &&
      Number.isFinite(prevItem.double)
        ? item.double - prevItem.double
        : 0;

    const noteText =
      item?.notes ??
      item?.note ??
      item?.remark ??
      item?.comment ??
      item?.meta?.notes ??
      item?.meta?.note ??
      "";

    return (
      <View style={[styles.ratingRow, { backgroundColor: colors.card }]}>
        {isAdmin && (
          <TouchableOpacity
            style={styles.deleteItemButton}
            onPress={onDelete}
            disabled={isDeleting}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            {isDeleting ? (
              <ActivityIndicator size="small" color="#FF3B30" />
            ) : (
              <Ionicons name="trash-outline" size={18} color="#FF3B30" />
            )}
          </TouchableOpacity>
        )}

        <View style={styles.ratingLeft}>
          <Text style={[styles.ratingDate, { color: colors.text }]}>
            {fmtDate(item.scoredAt)}
          </Text>

          <Text style={[styles.ratingScorer, { color: colors.subText }]}>
            {item.scorer?.name || "Hệ thống"}
          </Text>

          {hasData(noteText) && (
            <Text
              style={[styles.ratingNote, { color: colors.subText }]}
              numberOfLines={4}
            >
              Ghi chú: {String(noteText)}
            </Text>
          )}
        </View>

        <View style={styles.ratingScores}>
          {Number.isFinite(item.single) && (
            <View
              style={[
                styles.ratingScoreBadge,
                { backgroundColor: colors.bgMuted },
              ]}
            >
              <Text style={styles.ratingScoreLabel}>Đơn</Text>
              <Text style={styles.ratingScoreValue}>{num(item.single)}</Text>
              {singleDelta !== 0 && (
                <Text
                  style={[
                    styles.ratingDelta,
                    { color: singleDelta > 0 ? "#4CAF50" : "#F44336" },
                  ]}
                >
                  {singleDelta > 0 ? "+" : ""}
                  {numFloat(singleDelta)}
                </Text>
              )}
            </View>
          )}

          {Number.isFinite(item.double) && (
            <View
              style={[
                styles.ratingScoreBadge,
                { backgroundColor: colors.isDark ? "#1A2733" : "#E3F2FD" },
              ]}
            >
              <Text style={[styles.ratingScoreLabel, { color: "#1976D2" }]}>
                Đôi
              </Text>
              <Text style={[styles.ratingScoreValue, { color: "#1976D2" }]}>
                {num(item.double)}
              </Text>
              {doubleDelta !== 0 && (
                <Text
                  style={[
                    styles.ratingDelta,
                    { color: doubleDelta > 0 ? "#4CAF50" : "#F44336" },
                  ]}
                >
                  {doubleDelta > 0 ? "+" : ""}
                  {numFloat(doubleDelta)}
                </Text>
              )}
            </View>
          )}
        </View>
      </View>
    );
  }
);

const InfoItem = React.memo(({ label, value, copyable, onCopy, colors }) => {
  const display =
    value === null || value === undefined || value === "" ? "—" : value;
  return (
    <View style={styles.infoItem}>
      <Text style={[styles.infoLabel, { color: colors.subText }]}>{label}</Text>
      <View style={styles.infoValueContainer}>
        <Text
          style={[styles.infoValue, { color: colors.text }]}
          numberOfLines={2}
        >
          {display}
        </Text>
        {copyable && display !== "—" && (
          <TouchableOpacity
            onPress={() => onCopy(display, label)}
            style={styles.copyButton}
          >
            <Ionicons name="copy-outline" size={16} color={colors.subText} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
});

const SkeletonItem = React.memo(
  ({ width, height, borderRadius = 4, style, baseColor }) => {
    const animatedValue = useRef(new Animated.Value(0.3)).current;
    React.useEffect(() => {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(animatedValue, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(animatedValue, {
            toValue: 0.3,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    }, [animatedValue]);
    return (
      <Animated.View
        style={[
          {
            width,
            height,
            borderRadius,
            backgroundColor: baseColor || "#E1E9EE",
            opacity: animatedValue,
          },
          style,
        ]}
      />
    );
  }
);

const ProfileSkeleton = React.memo(({ isDark }) => {
  const skelColor = isDark ? "#333" : "#E1E9EE";
  const bgColor = isDark ? "#121212" : "#F5F7FA";
  const cardColor = isDark ? "#1E1E1E" : "#FFF";
  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: bgColor }]}
      edges={["top"]}
    >
      <View
        style={{ height: HEADER_HEIGHT, alignItems: "center", paddingTop: 60 }}
      >
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "100%",
            backgroundColor: isDark ? "#2C2C2E" : "#D1D5DB",
            borderBottomLeftRadius: 24,
            borderBottomRightRadius: 24,
          }}
        />
        <SkeletonItem
          width={AVATAR_SIZE}
          height={AVATAR_SIZE}
          borderRadius={AVATAR_SIZE / 2}
          baseColor={skelColor}
          style={{ borderWidth: 4, borderColor: cardColor, marginBottom: 12 }}
        />
        <SkeletonItem
          width={200}
          height={28}
          borderRadius={8}
          baseColor={skelColor}
          style={{ marginBottom: 8 }}
        />
        <SkeletonItem
          width={120}
          height={20}
          borderRadius={16}
          baseColor={skelColor}
        />
      </View>
    </SafeAreaView>
  );
});

/* ======= (RESTORE OLD UI) Achievements Components ======= */
const getTopStyle = (k) => {
  if (!Number.isFinite(k) || k > 8) return { bg: "#F3F4F6", fg: "#374151" };
  if (k === 1) return { bg: "#DCFCE7", fg: "#166534" };
  if (k === 2) return { bg: "#FEF9C3", fg: "#854D0E" };
  if (k <= 4) return { bg: "#E0E7FF", fg: "#3730A3" };
  return { bg: "#E0F2FE", fg: "#075985" };
};
const fmtRate = (v) => (Number.isFinite(v) ? `${v.toFixed(1)}%` : "—");

const KpiCard = React.memo(({ title, value, sub, colors }) => (
  <View
    style={[
      styles.kpiCard,
      { backgroundColor: colors.card, borderColor: colors.border },
    ]}
  >
    <Text style={[styles.kpiTitle, { color: colors.text }]} numberOfLines={1}>
      {title}
    </Text>
    <Text style={[styles.kpiValue, { color: colors.primary }]}>{value}</Text>
    {sub ? (
      <Text
        style={[styles.kpiSub, { color: colors.subText }]}
        numberOfLines={1}
      >
        {sub}
      </Text>
    ) : null}
  </View>
));

const AchievementRow = React.memo(({ data, colors }) => {
  const { bg, fg } = getTopStyle(data?.topK);
  return (
    <View
      style={[
        styles.achRowCard,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <Text style={[styles.achRowTitle, { color: colors.text }]}>
        {data.tournamentName}
      </Text>

      <View style={styles.achRowLine}>
        <Text style={[styles.achRowLabel, { color: colors.subText }]}>
          Bracket
        </Text>
        <Text style={{ color: colors.text, fontWeight: "700" }}>
          {data.bracketName}
        </Text>
      </View>

      <View style={styles.achRowLine}>
        <Text style={[styles.achRowLabel, { color: colors.subText }]}>Top</Text>
        <View style={[styles.achChip, { backgroundColor: bg }]}>
          <Text style={[styles.achChipText, { color: fg }]}>
            {data.positionLabel || (data.topK ? `Top ${data.topK}` : "—")}
          </Text>
        </View>
      </View>

      <View style={styles.achRowLine}>
        <Text style={[styles.achRowLabel, { color: colors.subText }]}>
          W/L/WR
        </Text>
        <Text style={{ color: colors.text }}>
          {data.stats?.wins ?? 0}/{data.stats?.losses ?? 0} •{" "}
          {Number.isFinite(data.stats?.winRate)
            ? `${data.stats.winRate.toFixed(1)}%`
            : "—"}
        </Text>
      </View>

      <View style={styles.achRowLine}>
        <Text style={[styles.achRowLabel, { color: colors.subText }]}>
          Cuối cùng
        </Text>
        <Text style={{ color: colors.text }}>
          {data.lastMatchAt ? fmtDate(data.lastMatchAt) : "—"}
        </Text>
      </View>
    </View>
  );
});

const AchievementsTab = React.memo(({ data, loading, error, colors }) => {
  if (loading)
    return (
      <View style={styles.centerBox}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  if (error)
    return (
      <View style={styles.centerBox}>
        <Text style={{ color: colors.subText }}>
          Không thể tải dữ liệu thành tích
        </Text>
      </View>
    );

  const sum = data?.summary || {};
  const perT = Array.isArray(data?.perTournament) ? data.perTournament : [];

  return (
    <View style={styles.achTabContainer}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        Thống kê tổng quan
      </Text>
      <View style={styles.kpiGrid}>
        <KpiCard
          title="Trận đấu"
          value={sum.totalPlayed ?? 0}
          sub={`${sum.wins ?? 0} Thắng - ${sum.losses ?? 0} Thua`}
          colors={colors}
        />
        <KpiCard
          title="Tỉ lệ thắng"
          value={fmtRate(sum.winRate)}
          sub={`Chuỗi thắng dài nhất: ${sum.longestWinStreak ?? 0}`}
          colors={colors}
        />
        <KpiCard
          title="Danh hiệu"
          value={sum.titles ?? 0}
          sub={`Thành tích tốt nhất: ${sum.careerBestLabel ?? "—"}`}
          colors={colors}
        />
        <KpiCard
          title="Streak hiện tại"
          value={sum.currentStreak ?? 0}
          sub="Trận thắng/thua liên tiếp"
          colors={colors}
        />
      </View>

      <View style={{ height: 16 }} />
      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        Thành tích theo giải
      </Text>

      {!perT.length ? (
        <Text
          style={{ color: colors.subText, textAlign: "center", marginTop: 12 }}
        >
          Chưa có dữ liệu giải đấu
        </Text>
      ) : (
        <View style={{ gap: 12 }}>
          {perT.map((item, idx) => (
            <AchievementRow key={idx} data={item} colors={colors} />
          ))}
        </View>
      )}
    </View>
  );
});

/* ---------- Charts (used by stats sheet) ---------- */
const RatingLineChart = React.memo(({ data, colors, type = "double" }) => {
  const chartData = useMemo(() => {
    const filtered = (data || [])
      .filter((r) => Number.isFinite(type === "single" ? r.single : r.double))
      .slice(0, 10)
      .reverse();
    return filtered.map((r) => ({
      date: fmtShortDate(r.scoredAt),
      value: type === "single" ? r.single : r.double,
    }));
  }, [data, type]);

  if (chartData.length < 2)
    return (
      <View style={styles.noChartData}>
        <Text style={{ color: colors.subText }}>
          Cần ít nhất 2 điểm dữ liệu
        </Text>
      </View>
    );

  const values = chartData.map((d) => d.value);
  const maxVal = Math.max(...values);
  const minVal = Math.min(...values);
  const padding = (maxVal - minVal) * 0.1 || 0.05;
  const chartMax = maxVal + padding;
  const chartMin = Math.max(0, minVal - padding);
  const range = chartMax - chartMin || 0.1;

  const chartHeight = 140;
  const chartWidth = SCREEN_WIDTH - 100;

  const points = chartData.map((d, i) => ({
    x: (i / (chartData.length - 1)) * chartWidth,
    y: chartHeight - ((d.value - chartMin) / range) * chartHeight,
    value: d.value,
    date: d.date,
  }));

  const gradientColors =
    type === "single" ? ["#10B981", "#059669"] : ["#3B82F6", "#1D4ED8"];

  return (
    <View style={styles.lineChartContainer}>
      <View style={styles.lineChartYAxis}>
        <Text style={[styles.axisLabel, { color: colors.subText }]}>
          {chartMax.toFixed(2)}
        </Text>
        <Text style={[styles.axisLabel, { color: colors.subText }]}>
          {((chartMax + chartMin) / 2).toFixed(2)}
        </Text>
        <Text style={[styles.axisLabel, { color: colors.subText }]}>
          {chartMin.toFixed(2)}
        </Text>
      </View>

      <View
        style={[
          styles.lineChartArea,
          { width: chartWidth, height: chartHeight },
        ]}
      >
        {[0, 0.5, 1].map((ratio, i) => (
          <View
            key={i}
            style={[
              styles.gridLine,
              { top: ratio * chartHeight, backgroundColor: colors.border },
            ]}
          />
        ))}

        {points.map((point, i) => {
          if (i === points.length - 1) return null;
          const nextPoint = points[i + 1];
          const length = Math.sqrt(
            Math.pow(nextPoint.x - point.x, 2) +
              Math.pow(nextPoint.y - point.y, 2)
          );
          const angle =
            (Math.atan2(nextPoint.y - point.y, nextPoint.x - point.x) * 180) /
            Math.PI;

          return (
            <View
              key={i}
              style={[
                styles.lineSegment,
                {
                  width: length,
                  left: point.x,
                  top: point.y,
                  transform: [{ rotate: `${angle}deg` }],
                  backgroundColor: gradientColors[0],
                },
              ]}
            />
          );
        })}

        {points.map((point, i) => (
          <View
            key={`p-${i}`}
            style={[
              styles.linePoint,
              {
                left: point.x - 6,
                top: point.y - 6,
                backgroundColor: gradientColors[0],
                borderColor: colors.card,
              },
            ]}
          />
        ))}

        <View style={styles.xAxisLabels}>
          {points
            .filter(
              (_, i) =>
                i === 0 ||
                i === points.length - 1 ||
                i === Math.floor(points.length / 2)
            )
            .map((point, i) => (
              <Text
                key={i}
                style={[
                  styles.xAxisLabel,
                  { color: colors.subText, left: point.x - 15 },
                ]}
              >
                {point.date}
              </Text>
            ))}
        </View>
      </View>
    </View>
  );
});

const SimpleBarChart = React.memo(
  ({ chartData, maxValue, gradient, colors }) => {
    if (!chartData?.length)
      return (
        <View style={styles.noChartData}>
          <Text style={{ color: colors.subText }}>Chưa có dữ liệu</Text>
        </View>
      );

    return (
      <View style={styles.simpleChart}>
        <View style={styles.chartBars}>
          {chartData.map((item, index) => {
            const height = maxValue > 0 ? (item.value / maxValue) * 120 : 0;
            return (
              <View key={index} style={styles.chartBarContainer}>
                <Text style={[styles.chartBarValue, { color: colors.text }]}>
                  {item.value}
                </Text>
                <LinearGradient
                  colors={gradient}
                  style={[styles.chartBar, { height: Math.max(height, 4) }]}
                />
                <Text
                  style={[styles.chartBarLabel, { color: colors.subText }]}
                  numberOfLines={1}
                >
                  {item.label}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  }
);

/* ---------- MAIN COMPONENT ---------- */
export default function PublicProfileScreen() {
  const theme = useTheme();
  const isDark = theme.dark;

  const colors = useMemo(
    () => ({
      isDark,
      primary: theme.colors.primary || "#6366F1",
      bg: isDark ? "#121212" : "#F5F7FA",
      card: isDark ? "#1E1E1E" : "#FFFFFF",
      text: isDark ? "#FFFFFF" : "#333333",
      subText: isDark ? "#A0A0A0" : "#666666",
      border: isDark ? "#333333" : "#E0E0E0",
      bgMuted: isDark ? "#2C2C2E" : "#F8F9FA",
      tabActive: "#6366F1",
      tabInactive: isDark ? "#A0A0A0" : "#666666",
    }),
    [isDark, theme.colors.primary]
  );

  const { id } = useLocalSearchParams();
  const [activeTab, setActiveTab] = useState(0);

  const scrollY = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef(null);
  const [tabBarY, setTabBarY] = useState(0);
  const [isTabBarSticky, setIsTabBarSticky] = useState(false);

  const [isImageViewVisible, setIsImageViewVisible] = useState(false);
  const [isAvatarLoading, setIsAvatarLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // bottom sheets
  const shareSheetRef = useRef(null);
  const statsSheetRef = useRef(null);
  const [statsSheetType, setStatsSheetType] = useState(null);
  const shareSnapPoints = useMemo(() => ["45%"], []);
  const statsSnapPoints = useMemo(() => ["55%", "90%"], []);

  // Queries
  const baseQ = useGetPublicProfileQuery(id);
  const rateQ = useGetRatingHistoryQuery(id);
  const matchQ = useGetMatchHistoryQuery(id);
  const achQ = useGetUserAchievementsQuery(id);

  const [deleteHistory, { isLoading: deleting }] =
    useDeleteRatingHistoryMutation();
  const [deletingId, setDeletingId] = useState(null);

  const base = baseQ.data || {};
  const ratingRaw = Array.isArray(rateQ.data?.history)
    ? rateQ.data.history
    : rateQ.data?.items || [];
  const matchRaw = Array.isArray(matchQ.data)
    ? matchQ.data
    : matchQ.data?.items || [];

  const sc = useMemo(() => getSPC(base), [base]);

  const { userInfo } = useSelector((state) => state.auth || {});
  const baseId = base?._id || "";
  const viewerId = userInfo?._id || userInfo?.id;
  const isSelf = viewerId && baseId && String(viewerId) === String(baseId);
  const isAdminViewer =
    userInfo?.isAdmin ||
    userInfo?.role === "admin" ||
    (Array.isArray(userInfo?.roles) && userInfo.roles.includes("admin"));
  const canSeeSensitive = isSelf || isAdminViewer;

  const isOnline = base?.isOnline || base?.status === "online";
  const lastSeen = base?.lastSeen;

  const latestSingle = useMemo(() => {
    for (const r of ratingRaw) if (Number.isFinite(r.single)) return r.single;
    const fb = base?.levelPoint?.single ?? base?.levelPoint?.score;
    return Number.isFinite(Number(fb)) ? Number(fb) : NaN;
  }, [ratingRaw, base]);

  const latestDouble = useMemo(() => {
    for (const r of ratingRaw) if (Number.isFinite(r.double)) return r.double;
    const fb = base?.levelPoint?.double;
    return Number.isFinite(Number(fb)) ? Number(fb) : NaN;
  }, [ratingRaw, base]);

  const uid = base?._id || id;

  const { totalMatches, wins, losses, winRate } = useMemo(() => {
    let total = 0,
      w = 0,
      l = 0;
    for (const m of matchRaw) {
      const inA = (m?.team1 || []).some((p) => (p?._id || p?.id) === uid);
      const inB = (m?.team2 || []).some((p) => (p?._id || p?.id) === uid);
      if (!inA && !inB) continue;
      total++;
      if ((inA && m?.winner === "A") || (inB && m?.winner === "B")) w++;
      else l++;
    }
    return {
      totalMatches: total,
      wins: w,
      losses: l,
      winRate: total ? Math.round((w / total) * 100) : 0,
    };
  }, [matchRaw, uid]);

  // Paging
  const [pageMatch, setPageMatch] = useState(1);
  const matchPerPage = 5;
  const matchPaged = useMemo(
    () =>
      matchRaw.slice((pageMatch - 1) * matchPerPage, pageMatch * matchPerPage),
    [matchRaw, pageMatch]
  );

  const [pageRate, setPageRate] = useState(1);
  const ratePerPage = 8;
  const ratePaged = useMemo(
    () => ratingRaw.slice((pageRate - 1) * ratePerPage, pageRate * ratePerPage),
    [ratingRaw, pageRate]
  );

  // Stats sheet data
  const matchStatsData = useMemo(() => {
    const monthlyMap = {};
    matchRaw.forEach((m) => {
      if (!m.dateTime) return;
      const d = new Date(m.dateTime);
      const k = `${d.getMonth() + 1}/${d.getFullYear()}`;
      monthlyMap[k] = (monthlyMap[k] || 0) + 1;
    });
    const monthlyMatches = Object.entries(monthlyMap)
      .map(([month, count]) => ({ month, count }))
      .slice(-6);

    const thisMonth = new Date();
    const thisMonthKey = `${
      thisMonth.getMonth() + 1
    }/${thisMonth.getFullYear()}`;

    return {
      totalMatches,
      thisMonth: monthlyMap[thisMonthKey] || 0,
      avgPerMonth:
        monthlyMatches.length > 0
          ? monthlyMatches.reduce((s, m) => s + m.count, 0) /
            monthlyMatches.length
          : 0,
      monthlyMatches,
    };
  }, [matchRaw, totalMatches]);

  const winStatsData = useMemo(() => {
    let streak = 0,
      lastResult = null;
    for (const m of matchRaw) {
      const inA = (m?.team1 || []).some((p) => (p?._id || p?.id) === uid);
      const inB = (m?.team2 || []).some((p) => (p?._id || p?.id) === uid);
      if (!inA && !inB) continue;

      const isWin = (inA && m?.winner === "A") || (inB && m?.winner === "B");
      if (lastResult === null) {
        lastResult = isWin;
        streak = 1;
      } else if (lastResult === isWin) streak++;
      else break;
    }
    return { wins, losses, winRate, streak: lastResult ? streak : -streak };
  }, [matchRaw, uid, wins, losses, winRate]);

  const ratingStatsData = useMemo(() => {
    if (!ratingRaw.length) return null;
    const singles = ratingRaw
      .filter((r) => Number.isFinite(r.single))
      .map((r) => r.single);
    const doubles = ratingRaw
      .filter((r) => Number.isFinite(r.double))
      .map((r) => r.double);

    const highestDouble = doubles.length ? Math.max(...doubles) : null;
    const lowestDouble = doubles.length ? Math.min(...doubles) : null;
    const firstDouble = doubles.length ? doubles[doubles.length - 1] : null;
    const lastDouble = doubles.length ? doubles[0] : null;

    const doubleChange =
      firstDouble !== null && lastDouble !== null
        ? lastDouble - firstDouble
        : 0;

    return {
      latestSingle,
      latestDouble,
      totalRatings: ratingRaw.length,
      highestDouble,
      lowestDouble,
      doubleChange,
      ratingHistory: ratingRaw,
      hasSingleData: singles.length >= 2,
      hasDoubleData: doubles.length >= 2,
    };
  }, [ratingRaw, latestSingle, latestDouble]);

  // Refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await Promise.all([
        baseQ.refetch?.(),
        rateQ.refetch?.(),
        matchQ.refetch?.(),
        achQ.refetch?.(),
      ]);
    } catch (e) {
      // ignore
    } finally {
      setRefreshing(false);
    }
  }, [baseQ, rateQ, matchQ, achQ]);

  const handleCopy = useCallback((value, label) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Clipboard.setString(String(value));
    Alert.alert("Đã sao chép", `${label}: ${value}`);
  }, []);

  const handleMatchPress = useCallback((matchId) => {
    router.push(`/match/${matchId}/home`);
  }, []);

  const handleDeleteHistory = useCallback(
    (h) => {
      if (!isAdminViewer) return;
      const historyId = h?._id ?? h?.id;
      const targetUid = h?.user?._id || id;
      if (!historyId || !targetUid) {
        Alert.alert("Lỗi", "Thiếu ID, không thể xoá.");
        return;
      }
      Alert.alert(
        "Xoá chấm trình?",
        "Bạn có chắc chắn muốn xoá mục lịch sử điểm trình này? Hành động không thể hoàn tác.",
        [
          { text: "Huỷ", style: "cancel" },
          {
            text: "Xoá",
            style: "destructive",
            onPress: async () => {
              try {
                setDeletingId(historyId);
                await deleteHistory({
                  userId: String(targetUid),
                  historyId: String(historyId),
                }).unwrap();
                setPageRate(1);
                await rateQ.refetch?.();
                Haptics.notificationAsync(
                  Haptics.NotificationFeedbackType.Success
                );
                Alert.alert("Thành công", "Đã xoá một mục lịch sử điểm trình.");
              } catch (e) {
                Alert.alert("Lỗi", "Xoá thất bại. Vui lòng thử lại.");
              } finally {
                setDeletingId(null);
              }
            },
          },
        ]
      );
    },
    [isAdminViewer, id, deleteHistory, rateQ]
  );

  const handleTabPress = useCallback(
    (index) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setActiveTab(index);

      if (index === 0) {
        requestAnimationFrame(() =>
          scrollViewRef.current?.scrollTo({ y: 0, animated: true })
        );
      } else {
        const targetY =
          tabBarY - (Platform.OS === "ios" ? 44 : 0) + TAB_BAR_HEIGHT + 16;
        requestAnimationFrame(() =>
          scrollViewRef.current?.scrollTo({
            y: Math.max(0, targetY),
            animated: true,
          })
        );
      }
    },
    [tabBarY]
  );

  // share sheet
  const profileUrl = `https://pickletour.com/user/${id}`;

  const handleOpenShareSheet = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    shareSheetRef.current?.expand();
  }, []);

  const shareOptions = useMemo(
    () => [
      {
        id: "copy",
        icon: "copy-outline",
        label: "Sao chép liên kết",
        color: "#6366F1",
        onPress: async () => {
          Clipboard.setString(profileUrl);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert("Đã sao chép");
          shareSheetRef.current?.close();
        },
      },
      {
        id: "share",
        icon: "share-outline",
        label: "Chia sẻ",
        color: "#10B981",
        onPress: async () => {
          try {
            await Share.share({
              message: `Xem hồ sơ của ${
                base?.name || "người chơi"
              } trên PickleTour\n${profileUrl}`,
            });
          } catch (e) {}
          shareSheetRef.current?.close();
        },
      },
      {
        id: "facebook",
        icon: "logo-facebook",
        label: "Facebook",
        color: "#1877F2",
        onPress: async () => {
          await Linking.openURL(
            `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
              profileUrl
            )}`
          );
          shareSheetRef.current?.close();
        },
      },
      {
        id: "messenger",
        icon: "chatbubble-ellipses",
        label: "Messenger",
        color: "#0084FF",
        onPress: async () => {
          const url = `fb-messenger://share?link=${encodeURIComponent(
            profileUrl
          )}`;
          if (await Linking.canOpenURL(url)) await Linking.openURL(url);
          else Alert.alert("Không thể mở Messenger");
          shareSheetRef.current?.close();
        },
      },
      {
        id: "zalo",
        icon: "chatbubbles",
        label: "Zalo",
        color: "#0068FF",
        onPress: async () => {
          await Linking.openURL(
            `https://zalo.me/share?url=${encodeURIComponent(profileUrl)}`
          );
          shareSheetRef.current?.close();
        },
      },
    ],
    [base?.name, profileUrl]
  );

  // stats sheet
  const handleOpenStatsSheet = useCallback((type) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStatsSheetType(type);
    statsSheetRef.current?.snapToIndex(0);
  }, []);

  const renderBackdrop = useCallback(
    (props) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
        style={{ zIndex: 1000 }}
      />
    ),
    []
  );

  const renderStatsContent = useCallback(() => {
    const config =
      {
        matches: {
          title: "Thống kê trận đấu",
          icon: "tennis",
          gradient: ["#6366F1", "#8B5CF6"],
        },
        wins: {
          title: "Thống kê chiến thắng",
          icon: "trophy",
          gradient: ["#F59E0B", "#EF4444"],
        },
        rating: {
          title: "Biểu đồ điểm trình",
          icon: "trending-up",
          gradient: ["#10B981", "#059669"],
        },
      }[statsSheetType] || {};

    return (
      <BottomSheetScrollView style={styles.bottomSheetScrollView}>
        <View style={styles.bottomSheetHeader}>
          <LinearGradient
            colors={config.gradient || ["#6366F1", "#8B5CF6"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.bottomSheetIcon}
          >
            {statsSheetType === "wins" ? (
              <FontAwesome5 name={config.icon} size={20} color="#FFF" />
            ) : (
              <MaterialCommunityIcons
                name={config.icon}
                size={24}
                color="#FFF"
              />
            )}
          </LinearGradient>
          <Text style={[styles.bottomSheetTitle, { color: colors.text }]}>
            {config.title}
          </Text>
        </View>

        {statsSheetType === "matches" && (
          <View style={styles.statsContent}>
            <View style={styles.statsRow}>
              <View
                style={[styles.statBox, { backgroundColor: colors.bgMuted }]}
              >
                <Text style={[styles.statBoxValue, { color: colors.primary }]}>
                  {matchStatsData?.totalMatches || 0}
                </Text>
                <Text style={[styles.statBoxLabel, { color: colors.subText }]}>
                  Tổng trận
                </Text>
              </View>
              <View
                style={[styles.statBox, { backgroundColor: colors.bgMuted }]}
              >
                <Text style={[styles.statBoxValue, { color: "#10B981" }]}>
                  {matchStatsData?.thisMonth || 0}
                </Text>
                <Text style={[styles.statBoxLabel, { color: colors.subText }]}>
                  Tháng này
                </Text>
              </View>
              <View
                style={[styles.statBox, { backgroundColor: colors.bgMuted }]}
              >
                <Text style={[styles.statBoxValue, { color: "#F59E0B" }]}>
                  {matchStatsData?.avgPerMonth?.toFixed(1) || "0"}
                </Text>
                <Text style={[styles.statBoxLabel, { color: colors.subText }]}>
                  TB/Tháng
                </Text>
              </View>
            </View>

            <Text style={[styles.chartTitle, { color: colors.text }]}>
              Trận đấu 6 tháng gần nhất
            </Text>
            <SimpleBarChart
              chartData={
                matchStatsData?.monthlyMatches?.map((m) => ({
                  label: m.month,
                  value: m.count,
                })) || []
              }
              maxValue={Math.max(
                ...(matchStatsData?.monthlyMatches?.map((m) => m.count) || [1])
              )}
              gradient={["#6366F1", "#8B5CF6"]}
              colors={colors}
            />
          </View>
        )}

        {statsSheetType === "wins" && (
          <View style={styles.statsContent}>
            <View style={styles.winRateContainer}>
              <View
                style={[styles.winRateCircle, { borderColor: colors.primary }]}
              >
                <Text style={[styles.winRateValue, { color: colors.primary }]}>
                  {winStatsData?.winRate || 0}%
                </Text>
                <Text style={[styles.winRateLabel, { color: colors.subText }]}>
                  Tỷ lệ thắng
                </Text>
              </View>
            </View>

            <View style={styles.statsRow}>
              <View style={[styles.statBox, { backgroundColor: "#E8F5E9" }]}>
                <Text style={[styles.statBoxValue, { color: "#4CAF50" }]}>
                  {winStatsData?.wins || 0}
                </Text>
                <Text style={[styles.statBoxLabel, { color: "#2E7D32" }]}>
                  Thắng
                </Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: "#FFEBEE" }]}>
                <Text style={[styles.statBoxValue, { color: "#F44336" }]}>
                  {winStatsData?.losses || 0}
                </Text>
                <Text style={[styles.statBoxLabel, { color: "#C62828" }]}>
                  Thua
                </Text>
              </View>
              <View
                style={[styles.statBox, { backgroundColor: colors.bgMuted }]}
              >
                <Text style={[styles.statBoxValue, { color: colors.text }]}>
                  {Math.abs(winStatsData?.streak || 0)}
                </Text>
                <Text style={[styles.statBoxLabel, { color: colors.subText }]}>
                  {(winStatsData?.streak || 0) >= 0
                    ? "Chuỗi thắng"
                    : "Chuỗi thua"}
                </Text>
              </View>
            </View>

            <View style={styles.winLossBarContainer}>
              <Text style={[styles.chartTitle, { color: colors.text }]}>
                Phân bố kết quả
              </Text>
              <View style={styles.winLossBar}>
                <View
                  style={[
                    styles.winBar,
                    {
                      flex: winStatsData?.wins || 1,
                      backgroundColor: "#4CAF50",
                    },
                  ]}
                />
                <View
                  style={[
                    styles.lossBar,
                    {
                      flex: winStatsData?.losses || 1,
                      backgroundColor: "#F44336",
                    },
                  ]}
                />
              </View>
              <View style={styles.winLossLabels}>
                <Text style={{ color: "#4CAF50", fontWeight: "600" }}>
                  {totalMatches > 0
                    ? (
                        ((winStatsData?.wins || 0) / totalMatches) *
                        100
                      ).toFixed(1)
                    : 0}
                  %
                </Text>
                <Text style={{ color: "#F44336", fontWeight: "600" }}>
                  {totalMatches > 0
                    ? (
                        ((winStatsData?.losses || 0) / totalMatches) *
                        100
                      ).toFixed(1)
                    : 0}
                  %
                </Text>
              </View>
            </View>
          </View>
        )}

        {statsSheetType === "rating" && ratingStatsData && (
          <View style={styles.statsContent}>
            <View style={styles.statsRow}>
              <View style={[styles.statBox, { backgroundColor: "#E8F5E9" }]}>
                <Text style={[styles.statBoxValue, { color: "#4CAF50" }]}>
                  {num(ratingStatsData.latestSingle)}
                </Text>
                <Text style={[styles.statBoxLabel, { color: "#2E7D32" }]}>
                  Điểm Đơn
                </Text>
              </View>

              <View style={[styles.statBox, { backgroundColor: "#E3F2FD" }]}>
                <Text style={[styles.statBoxValue, { color: "#1976D2" }]}>
                  {num(ratingStatsData.latestDouble)}
                </Text>
                <Text style={[styles.statBoxLabel, { color: "#1565C0" }]}>
                  Điểm Đôi
                </Text>
              </View>

              <View
                style={[styles.statBox, { backgroundColor: colors.bgMuted }]}
              >
                <Text style={[styles.statBoxValue, { color: colors.text }]}>
                  {ratingStatsData.totalRatings || 0}
                </Text>
                <Text style={[styles.statBoxLabel, { color: colors.subText }]}>
                  Lượt chấm
                </Text>
              </View>
            </View>

            {ratingStatsData.hasDoubleData && (
              <>
                <Text style={[styles.chartTitle, { color: colors.text }]}>
                  Biến động điểm Đôi
                </Text>
                <RatingLineChart
                  data={ratingStatsData.ratingHistory}
                  colors={colors}
                  type="double"
                />
              </>
            )}

            {ratingStatsData.hasSingleData && (
              <>
                <Text
                  style={[
                    styles.chartTitle,
                    { color: colors.text, marginTop: 16 },
                  ]}
                >
                  Biến động điểm Đơn
                </Text>
                <RatingLineChart
                  data={ratingStatsData.ratingHistory}
                  colors={colors}
                  type="single"
                />
              </>
            )}

            {!ratingStatsData.hasDoubleData &&
              !ratingStatsData.hasSingleData && (
                <View style={styles.noChartData}>
                  <Text style={{ color: colors.subText }}>
                    Cần ít nhất 2 điểm dữ liệu
                  </Text>
                </View>
              )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </BottomSheetScrollView>
    );
  }, [
    statsSheetType,
    colors,
    matchStatsData,
    winStatsData,
    ratingStatsData,
    totalMatches,
  ]);

  const genderInfo = useMemo(() => getGenderInfo(base?.gender), [base?.gender]);
  const handLabel = useMemo(
    () =>
      getHandLabel(
        base?.playHand || base?.hand || base?.handedness || base?.dominantHand
      ),
    [base]
  );
  const dob = base?.dob || base?.birthday || base?.dateOfBirth;
  const clubName =
    base?.clubName ||
    base?.mainClub?.name ||
    base?.primaryClub?.name ||
    base?.club?.name;

  const headerOpacity = scrollY.interpolate({
    inputRange: [0, HEADER_HEIGHT - 100],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  const avatarScale = scrollY.interpolate({
    inputRange: [0, HEADER_HEIGHT - 100],
    outputRange: [1, 0.6],
    extrapolate: "clamp",
  });

  const handleScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: true,
        listener: (e) => {
          if (tabBarY > 0)
            setIsTabBarSticky(e.nativeEvent.contentOffset.y > tabBarY - 60);
        },
      }),
    [scrollY, tabBarY]
  );

  const onTabBarLayout = useCallback(
    (e) => setTabBarY(e.nativeEvent.layout.y),
    []
  );

  if (baseQ.isLoading) return <ProfileSkeleton isDark={isDark} />;

  if (baseQ.error) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={64} color="#F44336" />
          <Text style={[styles.errorText, { color: colors.subText }]}>
            Không tìm thấy người dùng
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const hasContactBlock =
    hasData(base?.phone) ||
    hasData(base?.email) ||
    hasData(base?.address || base?.street);
  const avatarUrl = normalizeUrl(base?.avatar) || AVA_PLACE;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.bg }]}
      edges={["top"]}
    >
      <BottomSheetModalProvider>
        <StatusBar barStyle="light-content" />

        {/* Sticky Tab Bar */}
        {isTabBarSticky && (
          <View
            style={[
              styles.stickyTabBar,
              {
                backgroundColor: colors.card,
                borderBottomColor: colors.border,
              },
            ]}
          >
            <View style={styles.stickyTabWrapper}>
              {["Hồ sơ", "Lịch sử thi đấu", "Điểm trình", "Thành tích"].map(
                (tab, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.stickyTab,
                      activeTab === index && [
                        styles.stickyTabActive,
                        { backgroundColor: colors.tabActive },
                      ],
                    ]}
                    onPress={() => handleTabPress(index)}
                  >
                    <Text
                      style={[
                        styles.stickyTabText,
                        { color: colors.tabInactive },
                        activeTab === index && styles.stickyTabTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {tab}
                    </Text>
                  </TouchableOpacity>
                )
              )}
            </View>
          </View>
        )}

        {/* Animated Header */}
        <Animated.View style={[styles.header, { opacity: headerOpacity }]}>
          <LinearGradient
            colors={["#6366F1", "#8B5CF6", "#EC4899"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerGradient}
          >
            <View style={styles.headerCircle1} />
            <View style={styles.headerCircle2} />

            <Animated.View
              style={[
                styles.avatarContainer,
                { transform: [{ scale: avatarScale }] },
              ]}
            >
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => setIsImageViewVisible(true)}
                style={[styles.avatarWrapper, { borderColor: colors.card }]}
              >
                <Image
                  source={{ uri: avatarUrl }}
                  style={styles.avatar}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={200}
                  onLoadStart={() => setIsAvatarLoading(true)}
                  onLoad={() => setIsAvatarLoading(false)}
                />
                {isAvatarLoading && (
                  <View style={styles.avatarLoadingOverlay}>
                    <ActivityIndicator size="small" color="#FFF" />
                  </View>
                )}

                <View
                  style={[
                    styles.onlineStatusBadge,
                    {
                      backgroundColor: isOnline ? "#4CAF50" : "#9E9E9E",
                      borderColor: colors.card,
                    },
                  ]}
                />
              </TouchableOpacity>

              {base?.isAdmin && (
                <View
                  style={[styles.verifiedBadge, { borderColor: colors.card }]}
                >
                  <Ionicons name="shield-checkmark" size={20} color="#FFF" />
                </View>
              )}
            </Animated.View>

            <Text style={styles.userName}>
              {base?.name || base?.fullName || "Người dùng"}
            </Text>

            <View style={styles.nicknameContainer}>
              <Text style={styles.userNickname}>
                @{base?.nickname || "no_nick"}
              </Text>
            </View>

            <View style={styles.quickInfoContainer}>
              {hasData(base?.province) && (
                <InfoBadge
                  icon={<Ionicons name="location" size={14} color="#FFF" />}
                  text={base.province}
                  color="#FFF"
                />
              )}

              <InfoBadge
                icon={
                  <MaterialCommunityIcons
                    name={
                      genderInfo.label === "Nam"
                        ? "gender-male"
                        : "gender-female"
                    }
                    size={14}
                    color="#FFF"
                  />
                }
                text={genderInfo.label}
                color="#FFF"
              />
              <KycBadge status={base?.cccdStatus} />

              {sc?.single != null && (
                <InfoBadge
                  text={`SC Đơn: ${num(sc.single)}`}
                  bgColor="#dcfce7"
                  textColor="#166534"
                />
              )}
              {sc?.double != null && (
                <InfoBadge
                  text={`SC Đôi: ${num(sc.double)}`}
                  bgColor="#fef9c3"
                  textColor="#854d0e"
                />
              )}
            </View>

            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
              activeOpacity={0.8}
            >
              <Ionicons name="chevron-back" size={24} color="#FFF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.shareButton}
              onPress={handleOpenShareSheet}
            >
              <Ionicons name="share-social" size={20} color="#FFF" />
            </TouchableOpacity>
          </LinearGradient>
        </Animated.View>

        <Animated.ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
              progressViewOffset={HEADER_HEIGHT}
            />
          }
        >
          {/* Stats Cards */}
          <View
            style={[
              styles.statsContainer,
              isSmallDevice && styles.statsContainerSmall,
            ]}
          >
            <StatCard
              icon={
                <MaterialCommunityIcons name="tennis" size={32} color="#FFF" />
              }
              value={totalMatches}
              label="Tổng trận"
              gradient={["#6366F1", "#8B5CF6"]}
              onPress={() => handleOpenStatsSheet("matches")}
            />
            <StatCard
              icon={<FontAwesome5 name="trophy" size={28} color="#FFF" />}
              value={`${wins} (${winRate}%)`}
              label="Chiến thắng"
              gradient={["#F59E0B", "#EF4444"]}
              onPress={() => handleOpenStatsSheet("wins")}
            />
            <StatCard
              icon={<Ionicons name="trending-up" size={32} color="#FFF" />}
              value={`${num(latestSingle)} / ${num(latestDouble)}`}
              label="Điểm Đơn/Đôi"
              gradient={["#10B981", "#059669"]}
              onPress={() => handleOpenStatsSheet("rating")}
            />
          </View>

          {/* Tab Navigation */}
          <View style={styles.tabContainer} onLayout={onTabBarLayout}>
            <View style={[styles.tabWrapper, { backgroundColor: colors.card }]}>
              {["Hồ sơ", "Lịch sử thi đấu", "Điểm trình", "Thành tích"].map(
                (tab, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.tab,
                      activeTab === index && styles.tabActive,
                    ]}
                    onPress={() => handleTabPress(index)}
                  >
                    <Text
                      style={[
                        styles.tabText,
                        { color: colors.tabInactive },
                        activeTab === index && styles.tabTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {tab}
                    </Text>
                  </TouchableOpacity>
                )
              )}
            </View>
          </View>

          {/* Tab Content */}
          <View style={styles.tabContent}>
            {/* TAB 0 */}
            {activeTab === 0 && (
              <View style={styles.profileTab}>
                <View
                  style={[styles.section, { backgroundColor: colors.card }]}
                >
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>
                    Giới thiệu
                  </Text>
                  <Text style={[styles.bioText, { color: colors.subText }]}>
                    {base?.bio || "Chưa có thông tin."}
                  </Text>
                </View>

                <View
                  style={[styles.section, { backgroundColor: colors.card }]}
                >
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>
                    Thông tin cơ bản
                  </Text>
                  <View style={styles.infoGrid}>
                    {hasData(base?.name || base?.fullName) && (
                      <InfoItem
                        label="Họ và tên"
                        value={base?.name || base?.fullName}
                        colors={colors}
                      />
                    )}
                    {hasData(base?.nickname) && (
                      <InfoItem
                        label="Nickname"
                        value={base?.nickname}
                        copyable
                        onCopy={handleCopy}
                        colors={colors}
                      />
                    )}
                    {hasData(genderInfo.label) && (
                      <InfoItem
                        label="Giới tính"
                        value={genderInfo.label}
                        colors={colors}
                      />
                    )}
                    {hasData(base?.province) && (
                      <InfoItem
                        label="Tỉnh thành"
                        value={base?.province}
                        colors={colors}
                      />
                    )}
                    {hasData(dob) && (
                      <InfoItem
                        label="Ngày sinh"
                        value={fmtDate(dob)}
                        colors={colors}
                      />
                    )}
                    {hasData(calcAge(dob)) && (
                      <InfoItem
                        label="Tuổi"
                        value={`${calcAge(dob)} tuổi`}
                        colors={colors}
                      />
                    )}
                    {hasData(handLabel) && (
                      <InfoItem
                        label="Tay thuận"
                        value={handLabel}
                        colors={colors}
                      />
                    )}
                  </View>
                </View>

                <View
                  style={[styles.section, { backgroundColor: colors.card }]}
                >
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>
                    Thông tin thi đấu
                  </Text>
                  <View style={styles.infoGrid}>
                    {hasData(clubName) && (
                      <InfoItem
                        label="CLB chính"
                        value={clubName}
                        colors={colors}
                      />
                    )}
                    <InfoItem
                      label="Điểm đơn"
                      value={num(latestSingle)}
                      colors={colors}
                    />
                    <InfoItem
                      label="Điểm đôi"
                      value={num(latestDouble)}
                      colors={colors}
                    />
                    <InfoItem
                      label="Tổng trận"
                      value={`${totalMatches || 0} trận`}
                      colors={colors}
                    />
                    <InfoItem
                      label="Thắng / Tỷ lệ"
                      value={`${wins || 0} (${winRate}%)`}
                      colors={colors}
                    />
                  </View>
                </View>

                {canSeeSensitive && hasContactBlock && (
                  <View
                    style={[styles.section, { backgroundColor: colors.card }]}
                  >
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>
                      Thông tin liên hệ
                    </Text>
                    <View style={styles.infoGrid}>
                      {hasData(base?.phone) && (
                        <InfoItem
                          label="Số điện thoại"
                          value={base?.phone}
                          copyable
                          onCopy={handleCopy}
                          colors={colors}
                        />
                      )}
                      {hasData(base?.email) && (
                        <InfoItem
                          label="Email"
                          value={base?.email}
                          copyable
                          onCopy={handleCopy}
                          colors={colors}
                        />
                      )}
                      {hasData(base?.address || base?.street) && (
                        <InfoItem
                          label="Địa chỉ"
                          value={base?.address || base?.street}
                          colors={colors}
                        />
                      )}
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* TAB 1 (RESTORED OLD UI) */}
            {activeTab === 1 && (
              <View style={styles.matchTab}>
                {matchPaged.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <MaterialCommunityIcons
                      name="tennis-ball"
                      size={64}
                      color={isDark ? "#333" : "#E0E0E0"}
                    />
                    <Text style={[styles.emptyText, { color: colors.subText }]}>
                      Chưa có dữ liệu trận đấu
                    </Text>
                  </View>
                ) : (
                  <>
                    {matchPaged.map((match) => (
                      <MatchCard
                        key={match._id || match.id || match.code}
                        match={match}
                        userId={uid}
                        colors={colors}
                        onPress={() =>
                          handleMatchPress(match._id || match.id || match.code)
                        }
                      />
                    ))}

                    {matchRaw.length > matchPerPage && (
                      <View style={styles.pagination}>
                        <TouchableOpacity
                          style={[
                            styles.pageButton,
                            { backgroundColor: colors.card },
                            pageMatch === 1 && styles.pageButtonDisabled,
                          ]}
                          onPress={() => {
                            setPageMatch((p) => Math.max(1, p - 1));
                            Haptics.impactAsync(
                              Haptics.ImpactFeedbackStyle.Light
                            );
                            const targetY =
                              tabBarY -
                              (Platform.OS === "ios" ? 44 : 0) +
                              TAB_BAR_HEIGHT +
                              16;
                            requestAnimationFrame(() => {
                              scrollViewRef.current?.scrollTo({
                                y: Math.max(0, targetY),
                                animated: true,
                              });
                            });
                          }}
                          disabled={pageMatch === 1}
                        >
                          <Ionicons
                            name="chevron-back"
                            size={20}
                            color={colors.subText}
                          />
                        </TouchableOpacity>

                        <Text style={[styles.pageText, { color: colors.text }]}>
                          {pageMatch} /{" "}
                          {Math.ceil(matchRaw.length / matchPerPage)}
                        </Text>

                        <TouchableOpacity
                          style={[
                            styles.pageButton,
                            { backgroundColor: colors.card },
                            pageMatch >=
                              Math.ceil(matchRaw.length / matchPerPage) &&
                              styles.pageButtonDisabled,
                          ]}
                          onPress={() => {
                            setPageMatch((p) =>
                              Math.min(
                                Math.ceil(matchRaw.length / matchPerPage),
                                p + 1
                              )
                            );
                            Haptics.impactAsync(
                              Haptics.ImpactFeedbackStyle.Light
                            );
                            const targetY =
                              tabBarY -
                              (Platform.OS === "ios" ? 44 : 0) +
                              TAB_BAR_HEIGHT +
                              16;
                            requestAnimationFrame(() => {
                              scrollViewRef.current?.scrollTo({
                                y: Math.max(0, targetY),
                                animated: true,
                              });
                            });
                          }}
                          disabled={
                            pageMatch >=
                            Math.ceil(matchRaw.length / matchPerPage)
                          }
                        >
                          <Ionicons
                            name="chevron-forward"
                            size={20}
                            color={colors.subText}
                          />
                        </TouchableOpacity>
                      </View>
                    )}
                  </>
                )}
              </View>
            )}

            {/* TAB 2 */}
            {activeTab === 2 && (
              <View style={styles.ratingTab}>
                {ratePaged.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Ionicons
                      name="stats-chart"
                      size={64}
                      color={isDark ? "#333" : "#E0E0E0"}
                    />
                    <Text style={[styles.emptyText, { color: colors.subText }]}>
                      Chưa có lịch sử điểm
                    </Text>
                  </View>
                ) : (
                  <>
                    {ratePaged.map((item, index) => {
                      const prevItem =
                        index < ratePaged.length - 1
                          ? ratePaged[index + 1]
                          : null;
                      return (
                        <RatingHistoryRow
                          key={item._id || item.id}
                          item={item}
                          prevItem={prevItem}
                          isAdmin={isAdminViewer}
                          colors={colors}
                          isDeleting={
                            deleting && deletingId === (item._id || item.id)
                          }
                          onDelete={() => handleDeleteHistory(item)}
                        />
                      );
                    })}

                    {ratingRaw.length > ratePerPage && (
                      <View style={styles.pagination}>
                        <TouchableOpacity
                          style={[
                            styles.pageButton,
                            { backgroundColor: colors.card },
                            pageRate === 1 && styles.pageButtonDisabled,
                          ]}
                          onPress={() => {
                            setPageRate((p) => Math.max(1, p - 1));
                            Haptics.impactAsync(
                              Haptics.ImpactFeedbackStyle.Light
                            );
                            const targetY =
                              tabBarY -
                              (Platform.OS === "ios" ? 44 : 0) +
                              TAB_BAR_HEIGHT +
                              16;
                            requestAnimationFrame(() => {
                              scrollViewRef.current?.scrollTo({
                                y: Math.max(0, targetY),
                                animated: true,
                              });
                            });
                          }}
                          disabled={pageRate === 1}
                        >
                          <Ionicons
                            name="chevron-back"
                            size={20}
                            color={colors.subText}
                          />
                        </TouchableOpacity>

                        <Text style={[styles.pageText, { color: colors.text }]}>
                          {pageRate} /{" "}
                          {Math.ceil(ratingRaw.length / ratePerPage)}
                        </Text>

                        <TouchableOpacity
                          style={[
                            styles.pageButton,
                            { backgroundColor: colors.card },
                            pageRate >=
                              Math.ceil(ratingRaw.length / ratePerPage) &&
                              styles.pageButtonDisabled,
                          ]}
                          onPress={() => {
                            setPageRate((p) =>
                              Math.min(
                                Math.ceil(ratingRaw.length / ratePerPage),
                                p + 1
                              )
                            );
                            Haptics.impactAsync(
                              Haptics.ImpactFeedbackStyle.Light
                            );
                            const targetY =
                              tabBarY -
                              (Platform.OS === "ios" ? 44 : 0) +
                              TAB_BAR_HEIGHT +
                              16;
                            requestAnimationFrame(() => {
                              scrollViewRef.current?.scrollTo({
                                y: Math.max(0, targetY),
                                animated: true,
                              });
                            });
                          }}
                          disabled={
                            pageRate >=
                            Math.ceil(ratingRaw.length / ratePerPage)
                          }
                        >
                          <Ionicons
                            name="chevron-forward"
                            size={20}
                            color={colors.subText}
                          />
                        </TouchableOpacity>
                      </View>
                    )}
                  </>
                )}
              </View>
            )}

            {/* TAB 3 (RESTORED OLD UI) */}
            {activeTab === 3 && (
              <AchievementsTab
                data={achQ.data}
                loading={achQ.isLoading}
                error={achQ.error}
                colors={colors}
              />
            )}
          </View>
        </Animated.ScrollView>

        {/* Avatar Viewer */}
        <ImageViewing
          images={[{ uri: avatarUrl }]}
          imageIndex={0}
          visible={isImageViewVisible}
          onRequestClose={() => setIsImageViewVisible(false)}
          swipeToCloseEnabled
          doubleTapToZoomEnabled
          backgroundColor={isDark ? "#000000" : "#FFFFFF"}
          FooterComponent={() => (
            <View
              style={{ padding: 20, alignItems: "center", marginBottom: 20 }}
            >
              <Text
                style={{
                  color: isDark ? "#FFF" : "#333",
                  fontSize: 16,
                  fontWeight: "600",
                }}
              >
                {base?.name || "Ảnh đại diện"}
              </Text>
              {!isOnline && lastSeen && (
                <Text
                  style={{
                    color: isDark ? "#A0A0A0" : "#666",
                    fontSize: 12,
                    marginTop: 4,
                  }}
                >
                  Truy cập lần cuối: {fmtDT(lastSeen)}
                </Text>
              )}
            </View>
          )}
        />

        {/* Share Bottom Sheet */}
        <BottomSheet
          ref={shareSheetRef}
          index={-1}
          snapPoints={shareSnapPoints}
          enablePanDownToClose
          backdropComponent={renderBackdrop}
          backgroundStyle={{ backgroundColor: colors.card }}
          handleIndicatorStyle={{ backgroundColor: colors.border }}
          containerStyle={{ zIndex: 1000 }}
        >
          <BottomSheetView style={styles.sheetContainer}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>
              Chia sẻ hồ sơ
            </Text>

            <View style={styles.shareList}>
              {shareOptions.map((opt) => (
                <TouchableOpacity
                  key={opt.id}
                  style={[
                    styles.shareRow,
                    { borderBottomColor: colors.border },
                  ]}
                  activeOpacity={0.8}
                  onPress={opt.onPress}
                >
                  <View
                    style={[
                      styles.shareIconWrap,
                      { backgroundColor: `${opt.color}1A` },
                    ]}
                  >
                    <Ionicons name={opt.icon} size={18} color={opt.color} />
                  </View>
                  <Text style={[styles.shareLabel, { color: colors.text }]}>
                    {opt.label}
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={colors.subText}
                  />
                </TouchableOpacity>
              ))}
            </View>
          </BottomSheetView>
        </BottomSheet>

        {/* Stats Bottom Sheet */}
        <BottomSheet
          ref={statsSheetRef}
          index={-1}
          snapPoints={statsSnapPoints}
          enablePanDownToClose
          backdropComponent={renderBackdrop}
          backgroundStyle={{ backgroundColor: colors.card }}
          handleIndicatorStyle={{ backgroundColor: colors.border }}
          containerStyle={{ zIndex: 1000 }}
        >
          {renderStatsContent()}
        </BottomSheet>
      </BottomSheetModalProvider>
    </SafeAreaView>
  );
}

/* ---------- STYLES ---------- */
const styles = StyleSheet.create({
  container: { flex: 1 },

  centerBox: { padding: 20, justifyContent: "center", alignItems: "center" },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  errorText: { fontSize: 16, textAlign: "center", marginTop: 16 },

  header: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 10 },
  headerGradient: {
    height: HEADER_HEIGHT,
    paddingTop: 60,
    alignItems: "center",
    position: "relative",
    overflow: "hidden",
  },
  headerCircle1: {
    position: "absolute",
    top: -40,
    right: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  headerCircle2: {
    position: "absolute",
    bottom: -20,
    left: 60,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.1)",
  },

  avatarContainer: { position: "relative", marginBottom: 12 },
  avatarWrapper: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 4,
    overflow: "hidden",
    position: "relative",
  },
  avatar: { width: "100%", height: "100%" },
  avatarLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  onlineStatusBadge: {
    position: "absolute",
    bottom: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 3,
  },
  verifiedBadge: {
    position: "absolute",
    bottom: 4,
    right: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#6366F1",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    zIndex: 5,
  },

  userName: { fontSize: 24, fontWeight: "800", color: "#FFF", marginBottom: 8 },
  nicknameContainer: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 16,
  },
  userNickname: { fontSize: 15, fontWeight: "600", color: "#FFF" },

  quickInfoContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    alignItems: "center",
    maxWidth: "90%",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
  },
  badgeText: { fontSize: 12, fontWeight: "600" },

  kycBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  kycBadgeText: { fontSize: 12, fontWeight: "700" },

  shareButton: {
    position: "absolute",
    top: 60,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  backButton: {
    position: "absolute",
    top: 60,
    left: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },

  scrollView: { flex: 1 },
  scrollContent: { paddingTop: HEADER_HEIGHT + 8, paddingBottom: 40 },

  statsContainer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 16,
  },
  statsContainerSmall: { flexDirection: "column" },
  statCard: {
    flex: 1,
    padding: 16,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 110,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  statCardSmall: { width: "100%", alignSelf: "stretch" },
  statIconContainer: { marginBottom: 8 },
  statValue: {
    fontSize: 20,
    fontWeight: "800",
    color: "#FFF",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    color: "rgba(255,255,255,0.9)",
    textAlign: "center",
    fontWeight: "600",
  },
  statCardTapHint: { position: "absolute", right: 10, top: 10, opacity: 0.9 },

  stickyTabBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: TAB_BAR_HEIGHT + (Platform.OS === "ios" ? 44 : 0),
    paddingTop: Platform.OS === "ios" ? 44 : 0,
    zIndex: 100,
    borderBottomWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  stickyTabWrapper: {
    flexDirection: "row",
    height: TAB_BAR_HEIGHT,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  stickyTab: {
    flex: 1,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 8,
  },
  stickyTabActive: { backgroundColor: "#6366F1" },
  stickyTabText: { fontSize: 12, fontWeight: "600" },
  stickyTabTextActive: { color: "#FFF" },

  tabContainer: { marginBottom: 16, paddingHorizontal: 16 },
  tabWrapper: {
    flexDirection: "row",
    borderRadius: 12,
    padding: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  tabActive: { backgroundColor: "#6366F1" },
  tabText: { fontSize: 13, fontWeight: "600" },
  tabTextActive: { color: "#FFF" },

  tabContent: { paddingHorizontal: 16 },
  profileTab: { gap: 20 },

  section: {
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: { fontSize: 18, fontWeight: "700", marginBottom: 16 },
  bioText: { fontSize: 14, lineHeight: 22 },

  infoGrid: { gap: 16 },
  infoItem: { gap: 4 },
  infoLabel: { fontSize: 12, fontWeight: "600", textTransform: "uppercase" },
  infoValueContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  infoValue: { fontSize: 15, fontWeight: "500", flex: 1 },
  copyButton: { padding: 4 },

  /* ===== match tab (old UI) ===== */
  matchTab: { gap: 16 },
  matchCard: { borderRadius: 16, overflow: "hidden", marginBottom: 12 },
  matchCardContainer: {
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  resultBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: "flex-start",
  },
  resultText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#FFF",
    letterSpacing: 0.5,
  },
  matchHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 12,
  },
  matchHeaderRight: { flex: 1, alignItems: "flex-end" },
  matchDate: { fontSize: 11, marginBottom: 2 },
  tournamentName: { fontSize: 13, fontWeight: "600" },
  teamsVerticalContainer: { gap: 12 },
  teamSection: { borderRadius: 12, padding: 12 },
  teamPlayers: { gap: 8 },
  scoreDisplayContainer: { alignItems: "center", paddingVertical: 8 },
  scoreDisplayText: { fontSize: 20, fontWeight: "900", letterSpacing: 2 },
  videoButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingTop: 12,
    marginTop: 12,
    borderTopWidth: 1,
  },
  videoText: { fontSize: 12, fontWeight: "600", color: "#FF3B30" },

  playerRowCompact: { flexDirection: "row", alignItems: "center", gap: 10 },
  playerAvatarCompact: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
  },
  playerInfoCompact: { flex: 1, minWidth: 0 },
  playerNameCompact: { fontSize: 13, fontWeight: "500" },
  playerStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
    flexWrap: "wrap",
  },
  scoreChangeCompact: { flexDirection: "row", alignItems: "center", gap: 6 },
  scoreChangeTextCompact: { fontSize: 11 },
  deltaTextCompact: { fontSize: 10, fontWeight: "700" },
  scChipsRow: { flexDirection: "row", gap: 4 },
  scChip: { paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 },
  scChipTxt: { fontSize: 10, fontWeight: "700" },

  /* rating tab */
  ratingTab: { gap: 12 },
  ratingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    position: "relative",
  },
  deleteItemButton: {
    position: "absolute",
    top: 10,
    right: 10,
    zIndex: 10,
    padding: 4,
    borderRadius: 8,
    backgroundColor: "rgba(255,59,48,0.1)",
  },
  ratingLeft: { flex: 1, paddingRight: 32 },
  ratingDate: { fontSize: 14, fontWeight: "600", marginBottom: 4 },
  ratingScorer: { fontSize: 12 },
  ratingScores: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  ratingScoreBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
    minWidth: 70,
  },
  ratingScoreLabel: {
    fontSize: 10,
    color: "#9C27B0",
    fontWeight: "600",
    marginBottom: 4,
  },
  ratingScoreValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#9C27B0",
    marginBottom: 2,
  },
  ratingDelta: { fontSize: 10, fontWeight: "700" },
  ratingNote: { fontSize: 12, marginTop: 6, lineHeight: 16 },

  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyText: { fontSize: 16, marginTop: 16 },

  pagination: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
    marginTop: 20,
  },
  pageButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  pageButtonDisabled: { opacity: 0.3 },
  pageText: { fontSize: 14, fontWeight: "600" },

  /* achievements tab (old UI) */
  achTabContainer: { gap: 16 },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  kpiCard: {
    width: "48%",
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 4,
  },
  kpiTitle: { fontWeight: "700", fontSize: 13 },
  kpiValue: { fontSize: 22, fontWeight: "800" },
  kpiSub: { fontSize: 11 },

  achRowCard: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  achRowTitle: { fontWeight: "700", fontSize: 15, marginBottom: 4 },
  achRowLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  achRowLabel: { width: 80, fontSize: 12 },
  achChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  achChipText: { fontSize: 11, fontWeight: "700" },

  /* BottomSheet - share */
  sheetContainer: { paddingHorizontal: 16, paddingTop: 6 },
  sheetTitle: { fontSize: 16, fontWeight: "800", marginBottom: 12 },
  shareList: { borderRadius: 12, overflow: "hidden" },
  shareRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  shareIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  shareLabel: { flex: 1, fontSize: 14, fontWeight: "700" },

  /* BottomSheet - stats */
  bottomSheetScrollView: { paddingHorizontal: 16 },
  bottomSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 6,
    marginBottom: 12,
  },
  bottomSheetIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  bottomSheetTitle: { fontSize: 16, fontWeight: "800" },

  statsContent: { paddingBottom: 8 },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  statBox: { flex: 1, borderRadius: 14, padding: 12, alignItems: "center" },
  statBoxValue: { fontSize: 20, fontWeight: "900" },
  statBoxLabel: { fontSize: 11, marginTop: 2, fontWeight: "700" },

  chartTitle: { fontSize: 13, fontWeight: "800", marginBottom: 10 },

  simpleChart: { paddingVertical: 8 },
  chartBars: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  chartBarContainer: { width: 44, alignItems: "center" },
  chartBarValue: { fontSize: 12, fontWeight: "800", marginBottom: 6 },
  chartBar: { width: 18, borderRadius: 9 },
  chartBarLabel: { fontSize: 10, marginTop: 6, textAlign: "center" },

  winRateContainer: { alignItems: "center", marginBottom: 14 },
  winRateCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  winRateValue: { fontSize: 26, fontWeight: "900" },
  winRateLabel: { fontSize: 12, fontWeight: "700", marginTop: 2 },

  winLossBarContainer: { marginTop: 10 },
  winLossBar: {
    height: 14,
    borderRadius: 8,
    overflow: "hidden",
    flexDirection: "row",
  },
  winBar: { height: 14 },
  lossBar: { height: 14 },
  winLossLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },

  /* Line chart */
  noChartData: { paddingVertical: 18, alignItems: "center" },
  lineChartContainer: { flexDirection: "row", gap: 10, marginBottom: 12 },
  lineChartYAxis: { width: 56, justifyContent: "space-between" },
  axisLabel: { fontSize: 10, fontWeight: "700" },
  lineChartArea: { position: "relative" },
  gridLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    opacity: 0.6,
  },
  lineSegment: { position: "absolute", height: 2, transformOrigin: "left" },
  linePoint: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  xAxisLabels: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: -16,
    height: 16,
  },
  xAxisLabel: { position: "absolute", fontSize: 10, fontWeight: "700" },
});
