import React, { memo, type ReactNode } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
  type FlatListProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Text as SvgText,
} from "react-native-svg";

import { Text } from "@/components/ui/i18nText";
import { TextInput } from "@/components/ui/i18nTextInput";
import { normalizeUrl } from "@/utils/normalizeUri";

export const RANKING_COLORS = {
  background: "#020B1C",
  backgroundAlt: "#06152B",
  surface: "rgba(8, 29, 55, 0.88)",
  surfaceStrong: "rgba(11, 35, 64, 0.96)",
  primary: "#00BFFF",
  secondary: "#1677FF",
  success: "#22D879",
  score: "#FFAA00",
  text: "#FFFFFF",
  textSoft: "#D7E5F5",
  textMuted: "#8FA8C7",
  border: "rgba(120,180,230,0.25)",
} as const;

export const RankingPage = memo(function RankingPage({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <LinearGradient
      colors={[RANKING_COLORS.background, RANKING_COLORS.backgroundAlt]}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={styles.page}
    >
      <View pointerEvents="none" style={styles.ambientTop} />
      <View pointerEvents="none" style={styles.ambientSide} />
      {children}
    </LinearGradient>
  );
});

const GradientTitle = memo(function GradientTitle() {
  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel="Bảng xếp hạng"
      style={styles.titleLine}
    >
      <Text style={styles.titleWhite}>Bảng</Text>
      <Svg
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        width={166}
        height={42}
        viewBox="0 0 166 42"
        style={styles.titleGradientSvg}
      >
        <Defs>
          <SvgLinearGradient id="rankingTitleGradient" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#4DE1FF" />
            <Stop offset="0.52" stopColor="#00BFFF" />
            <Stop offset="1" stopColor="#1677FF" />
          </SvgLinearGradient>
        </Defs>
        <SvgText
          x="0"
          y="32"
          fill="url(#rankingTitleGradient)"
          fontSize="31"
          fontWeight="900"
          letterSpacing="-0.7"
        >
          xếp hạng
        </SvgText>
      </Svg>
    </View>
  );
});

export const RankingHeader = memo(function RankingHeader({
  isBack,
  onBack,
  rightAccessory,
}: {
  isBack?: boolean;
  onBack?: () => void;
  rightAccessory?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      <View pointerEvents="none" style={styles.sportArtwork}>
        <MaterialCommunityIcons
          name="table-tennis"
          size={112}
          color="rgba(82, 203, 255, 0.12)"
          style={styles.paddleIcon}
        />
        <View style={styles.ball}>
          <View style={[styles.ballHole, { top: 9, left: 10 }]} />
          <View style={[styles.ballHole, { top: 17, right: 8 }]} />
          <View style={[styles.ballHole, { bottom: 8, left: 18 }]} />
        </View>
      </View>

      <View style={styles.headerTopRow}>
        <View style={styles.headerTitleRow}>
          {isBack ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Quay lại"
              hitSlop={12}
              onPress={onBack}
              style={styles.backButton}
            >
              <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
            </Pressable>
          ) : null}
          <View style={styles.headerCopy}>
            <GradientTitle />
          </View>
        </View>
        {rightAccessory ? (
          <View style={styles.headerAccessory}>{rightAccessory}</View>
        ) : null}
      </View>
      <Text style={styles.subtitle} numberOfLines={2}>
        Cập nhật thứ hạng vận động viên theo điểm thi đấu
      </Text>
    </View>
  );
});

export const RankingSearch = memo(function RankingSearch({
  value,
  onChangeText,
  onClear,
}: {
  value: string;
  onChangeText: (value: string) => void;
  onClear: () => void;
}) {
  return (
    <View style={styles.search}>
      <Ionicons name="search" size={23} color="#91B7DA" />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="Tìm kiếm tên, số điện thoại..."
        placeholderTextColor="#7895B5"
        returnKeyType="search"
        style={styles.searchInput}
      />
      {value ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Xóa tìm kiếm"
          hitSlop={10}
          onPress={onClear}
        >
          <Ionicons name="close-circle" size={19} color="#8FA8C7" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
});

type ScoreType = "single" | "double" | "mix";

export const RankingFilters = memo(function RankingFilters({
  value,
  options,
  expanded,
  onChange,
  onToggleFilters,
}: {
  value: ScoreType;
  options: { value: ScoreType; label: string }[];
  expanded: boolean;
  onChange: (value: ScoreType) => void;
  onToggleFilters: () => void;
}) {
  return (
    <View style={styles.filtersRow}>
      <View style={styles.segment}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <TouchableOpacity
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              activeOpacity={0.84}
              onPress={() => onChange(option.value)}
              style={[styles.segmentButton, active && styles.segmentButtonActive]}
            >
              {active ? (
                <LinearGradient
                  pointerEvents="none"
                  colors={["#00C8FF", "#1677FF"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
              ) : null}
              <Text
                style={[
                  styles.segmentLabel,
                  active && styles.segmentLabelActive,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        activeOpacity={0.84}
        onPress={onToggleFilters}
        style={[styles.filterButton, expanded && styles.filterButtonActive]}
      >
        <Ionicons name="options-outline" size={18} color="#D7E5F5" />
        <Text style={styles.filterButtonText}>Bộ lọc</Text>
      </TouchableOpacity>
    </View>
  );
});

export const ScoreRange = memo(function ScoreRange({
  values,
  children,
  active,
  onClear,
}: {
  values: [number, number];
  children: ReactNode;
  active?: boolean;
  onClear?: () => void;
}) {
  return (
    <View style={styles.rangeSection}>
      <View style={styles.rangeTitleRow}>
        <Text style={styles.rangeTitle}>Lọc theo điểm trình</Text>
        {active ? (
          <TouchableOpacity activeOpacity={0.8} onPress={onClear}>
            <Text style={styles.rangeClear}>Đặt lại</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={styles.rangeSlider}>{children}</View>
      <View style={styles.rangeValues}>
        <Text style={styles.rangeValue}>{values[0].toFixed(1)}</Text>
        <Text style={styles.rangeValue}>{values[1].toFixed(1)}</Text>
      </View>
    </View>
  );
});

export const ScoreLegend = memo(function ScoreLegend({
  items,
}: {
  items: { label: string; color: string }[];
}) {
  return (
    <View style={styles.legend}>
      {items.map((item) => (
        <View key={item.label} style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: item.color }]} />
          <Text style={styles.legendLabel}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
});

export const RankBadge = memo(function RankBadge({
  rank,
  medal,
}: {
  rank: number;
  medal?: "gold" | "silver" | "bronze" | null;
}) {
  const palette =
    medal === "gold"
      ? ["#FFF1A6", "#FFB800", "#9A6100"]
      : medal === "silver"
        ? ["#F4FAFF", "#AFC7DC", "#60778E"]
        : medal === "bronze"
          ? ["#FFD0A7", "#C77B45", "#704022"]
          : ["#3E6B91", "#214662", "#132E46"];
  const topThree = Boolean(medal);

  return (
    <View style={[styles.rankBadgeWrap, !topThree && styles.rankBadgePlainWrap]}>
      {topThree ? (
        <MaterialCommunityIcons
          name="crown"
          size={18}
          color={palette[0]}
          style={styles.rankCrown}
        />
      ) : null}
      <LinearGradient
        colors={palette as [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={[styles.rankBadge, !topThree && styles.rankBadgePlain]}
      >
        <Text style={[styles.rankNumber, !topThree && styles.rankNumberPlain]}>
          {rank}
        </Text>
      </LinearGradient>
      {topThree ? <View style={[styles.rankNotch, { borderTopColor: palette[2] }]} /> : null}
    </View>
  );
});

export const PlayerAvatar = memo(function PlayerAvatar({
  uri,
  medal,
  onPress,
}: {
  uri: string;
  medal?: "gold" | "silver" | "bronze" | null;
  onPress: () => void;
}) {
  const ring =
    medal === "gold"
      ? "#FFD34D"
      : medal === "silver"
        ? "#AFCDE8"
        : medal === "bronze"
          ? "#D88A55"
          : "#1CAFE8";
  return (
    <TouchableOpacity activeOpacity={0.86} onPress={onPress}>
      <View style={[styles.avatarRing, { borderColor: ring }]}>
        <ExpoImage
          source={normalizeUrl(uri)}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={180}
          style={styles.avatar}
        />
      </View>
    </TouchableOpacity>
  );
});

export const PlayerBadges = memo(function PlayerBadges({
  children,
}: {
  children: ReactNode;
}) {
  return <View style={styles.playerBadges}>{children}</View>;
});

export const PlayerScore = memo(function PlayerScore({
  label,
  value,
  color = RANKING_COLORS.score,
  delta,
}: {
  label: string;
  value: string;
  color?: string;
  delta?: number | null;
}) {
  const hasDelta = Number.isFinite(delta) && delta !== 0;
  return (
    <View style={styles.playerScore}>
      <Text style={styles.playerScoreLabel}>{label}</Text>
      <View style={styles.playerScoreValueRow}>
        <Text style={[styles.playerScoreValue, { color }]} adjustsFontSizeToFit>
          {value}
        </Text>
        {hasDelta ? (
          <Text
            style={[
              styles.playerScoreDelta,
              { color: Number(delta) > 0 ? RANKING_COLORS.success : "#FF5C68" },
            ]}
          >
            {Number(delta) > 0 ? "▲" : "▼"} {Number(delta) > 0 ? "+" : ""}
            {delta}
          </Text>
        ) : null}
      </View>
    </View>
  );
});

export type PlayerAction = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color?: string;
  onPress?: () => void;
  disabled?: boolean;
};

export const PlayerActions = memo(function PlayerActions({
  actions,
}: {
  actions: PlayerAction[];
}) {
  return (
    <View style={styles.actions}>
      {actions.map((action) => (
        <TouchableOpacity
          key={action.key}
          accessibilityRole="button"
          activeOpacity={0.78}
          disabled={action.disabled || !action.onPress}
          onPress={action.onPress}
          style={[styles.action, action.disabled && styles.actionDisabled]}
        >
          <Ionicons
            name={action.icon}
            size={17}
            color={action.color || RANKING_COLORS.textSoft}
          />
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.78}
            style={[styles.actionLabel, { color: action.color || RANKING_COLORS.textSoft }]}
          >
            {action.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
});

export const RankingList = React.forwardRef<FlatList<any>, FlatListProps<any>>(
  function RankingList(props, ref) {
    return <FlatList ref={ref} {...props} />;
  },
);

export const PremiumRankingCard = memo(function PremiumRankingCard({
  medal,
  children,
  style,
}: {
  medal?: "gold" | "silver" | "bronze" | null;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const palette =
    medal === "gold"
      ? {
          border: "#F6C94D",
          colors: ["rgba(92,67,15,0.78)", "rgba(8,30,52,0.97)", "rgba(8,24,43,0.99)"],
          shadow: "#FFCC40",
        }
      : medal === "silver"
        ? {
            border: "#83A9CB",
            colors: ["rgba(43,76,104,0.72)", "rgba(8,30,52,0.97)", "rgba(8,24,43,0.99)"],
            shadow: "#8FC7EF",
          }
        : medal === "bronze"
          ? {
              border: "#B87346",
              colors: ["rgba(91,51,30,0.7)", "rgba(8,30,52,0.97)", "rgba(8,24,43,0.99)"],
              shadow: "#C98558",
            }
          : {
              border: RANKING_COLORS.border,
              colors: ["rgba(13,38,65,0.96)", "rgba(5,22,42,0.98)"],
              shadow: "#000000",
            };
  return (
    <LinearGradient
      colors={palette.colors as [string, string, ...string[]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.rankingCard,
        medal === "gold" && styles.rankingCardHero,
        { borderColor: palette.border, shadowColor: palette.shadow },
        style,
      ]}
    >
      {medal ? (
        <MaterialCommunityIcons
          pointerEvents="none"
          name="crown"
          size={118}
          color={medal === "gold" ? "rgba(255,204,64,0.07)" : "rgba(220,236,250,0.045)"}
          style={styles.cardWatermark}
        />
      ) : null}
      {children}
    </LinearGradient>
  );
});

const styles = StyleSheet.create({
  page: { flex: 1, overflow: "hidden" },
  ambientTop: {
    position: "absolute",
    top: -110,
    right: -120,
    width: 310,
    height: 310,
    borderRadius: 155,
    backgroundColor: "rgba(0,191,255,0.12)",
  },
  ambientSide: {
    position: "absolute",
    top: 360,
    left: -120,
    width: 230,
    height: 420,
    borderRadius: 120,
    backgroundColor: "rgba(22,119,255,0.07)",
  },
  header: {
    minHeight: 104,
    paddingTop: 7,
    paddingBottom: 11,
    overflow: "hidden",
  },
  sportArtwork: {
    position: "absolute",
    top: 20,
    right: -18,
    width: 126,
    height: 104,
    opacity: 0.72,
  },
  paddleIcon: { position: "absolute", top: -18, right: -12, transform: [{ rotate: "-16deg" }] },
  ball: {
    position: "absolute",
    right: 8,
    bottom: 1,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(174,255,55,0.18)",
    borderWidth: 1,
    borderColor: "rgba(191,255,82,0.3)",
  },
  ballHole: { position: "absolute", width: 5, height: 5, borderRadius: 3, backgroundColor: "rgba(2,11,28,0.65)" },
  headerTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 45 },
  headerTitleRow: { flex: 1, flexDirection: "row", alignItems: "center", minWidth: 0 },
  headerCopy: { flex: 1, minWidth: 0 },
  titleLine: { height: 42, flexDirection: "row", alignItems: "center", flexWrap: "nowrap" },
  titleWhite: { color: "#FFFFFF", fontSize: 31, lineHeight: 38, fontWeight: "900", letterSpacing: -0.9 },
  titleGradientSvg: { marginLeft: 7, flexShrink: 0 },
  subtitle: { color: "#9DB9D6", fontSize: 12.5, lineHeight: 17, fontWeight: "500", marginTop: 1, paddingRight: 76 },
  backButton: { width: 38, height: 38, marginRight: 8, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(10,35,64,0.78)", borderWidth: 1, borderColor: RANKING_COLORS.border },
  headerAccessory: { marginLeft: 7, zIndex: 2 },
  search: { height: 54, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, borderRadius: 17, backgroundColor: "rgba(7,27,52,0.84)", borderWidth: 1, borderColor: "rgba(111,182,234,0.42)", shadowColor: "#00BFFF", shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
  searchInput: { flex: 1, height: "100%", marginLeft: 11, color: "#FFFFFF", fontSize: 15.5, fontWeight: "500" },
  filtersRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 },
  segment: { flex: 1, minWidth: 0, flexDirection: "row", gap: 6 },
  segmentButton: { flex: 1, height: 38, minWidth: 0, alignItems: "center", justifyContent: "center", overflow: "hidden", borderRadius: 19, borderWidth: 1, borderColor: "rgba(84,151,204,0.42)", backgroundColor: "rgba(3,18,38,0.65)" },
  segmentButtonActive: { borderColor: "rgba(82,214,255,0.92)", shadowColor: "#00BFFF", shadowOpacity: 0.28, shadowRadius: 8 },
  segmentLabel: { color: "#91A9C7", fontSize: 13, fontWeight: "700" },
  segmentLabelActive: { color: "#FFFFFF", fontWeight: "900" },
  filterButton: { height: 38, minWidth: 91, paddingHorizontal: 11, borderRadius: 19, borderWidth: 1, borderColor: "rgba(111,171,218,0.5)", backgroundColor: "rgba(10,31,56,0.88)", flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center" },
  filterButtonActive: { borderColor: "rgba(0,191,255,0.72)", backgroundColor: "rgba(12,48,80,0.94)" },
  filterButtonText: { color: "#D7E5F5", fontSize: 12, fontWeight: "800" },
  rangeSection: { marginTop: 12 },
  rangeTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 20 },
  rangeTitle: { color: "#D7E5F5", fontSize: 13, fontWeight: "800" },
  rangeClear: { color: "#00BFFF", fontSize: 12, fontWeight: "800" },
  rangeSlider: { marginTop: 1, marginHorizontal: -2 },
  rangeValues: { marginTop: -2, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 2 },
  rangeValue: { color: "#E8F4FF", fontSize: 12, fontWeight: "800", fontVariant: ["tabular-nums"] },
  legend: { marginTop: 10, minHeight: 48, flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", rowGap: 7, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 15, borderWidth: 1, borderColor: RANKING_COLORS.border, backgroundColor: "rgba(9,33,61,0.82)" },
  legendItem: { width: "48%", flexDirection: "row", alignItems: "center" },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 7, shadowOpacity: 0.5, shadowRadius: 4 },
  legendLabel: { color: "#A9C0D9", fontSize: 11.5, fontWeight: "600" },
  rankBadgeWrap: { width: 43, alignItems: "center", marginRight: 9, paddingTop: 2 },
  rankBadgePlainWrap: { justifyContent: "center", paddingTop: 8 },
  rankCrown: { marginBottom: -4, zIndex: 2 },
  rankBadge: { width: 39, minHeight: 53, alignItems: "center", justifyContent: "center", borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  rankBadgePlain: { minHeight: 39, borderRadius: 20 },
  rankNumber: { color: "#FFFFFF", fontSize: 20, lineHeight: 24, fontWeight: "900", textShadowColor: "rgba(0,0,0,0.4)", textShadowRadius: 3 },
  rankNumberPlain: { fontSize: 15 },
  rankNotch: { width: 0, height: 0, borderLeftWidth: 19.5, borderRightWidth: 19.5, borderTopWidth: 10, borderLeftColor: "transparent", borderRightColor: "transparent" },
  avatarRing: { width: 74, height: 74, borderRadius: 37, padding: 3, borderWidth: 2, backgroundColor: "rgba(2,11,28,0.86)", shadowColor: "#00BFFF", shadowOpacity: 0.18, shadowRadius: 9 },
  avatar: { width: "100%", height: "100%", borderRadius: 33 },
  playerBadges: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  playerScore: { flex: 1, minWidth: 0, paddingVertical: 10, paddingHorizontal: 11 },
  playerScoreLabel: { color: "#91AFCE", fontSize: 10.5, fontWeight: "800", letterSpacing: 0.35 },
  playerScoreValueRow: { flexDirection: "row", alignItems: "baseline", gap: 7, marginTop: 3 },
  playerScoreValue: { flexShrink: 1, color: "#FFAA00", fontSize: 25, lineHeight: 29, fontWeight: "900", fontVariant: ["tabular-nums"] },
  playerScoreDelta: { flexShrink: 0, fontSize: 11.5, fontWeight: "900", fontVariant: ["tabular-nums"] },
  actions: { flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 10, marginTop: 11, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(120,180,230,0.2)" },
  action: { flex: 1, minWidth: 0, height: 34, paddingHorizontal: 5, borderRadius: 17, flexDirection: "row", gap: 4, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(10,34,60,0.72)", borderWidth: 1, borderColor: "rgba(103,169,218,0.25)" },
  actionDisabled: { opacity: 0.45 },
  actionLabel: { flexShrink: 1, color: "#D7E5F5", fontSize: 10.5, fontWeight: "700" },
  rankingCard: { position: "relative", overflow: "hidden", borderRadius: 22, borderWidth: 1, padding: 14, marginBottom: 13, shadowOpacity: 0.16, shadowRadius: 15, shadowOffset: { width: 0, height: 7 }, elevation: 4 },
  rankingCardHero: { borderWidth: 1.5, shadowOpacity: 0.28, shadowRadius: 20 },
  cardWatermark: { position: "absolute", right: -15, bottom: -18, transform: [{ rotate: "-7deg" }] },
});
