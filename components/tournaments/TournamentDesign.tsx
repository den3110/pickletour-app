import React, { memo, type ReactNode } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  useWindowDimensions,
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

export const TOURNAMENT_COLORS = {
  background: "#020B1C",
  backgroundAlt: "#06152B",
  surface: "rgba(7, 27, 52, 0.9)",
  surfaceStrong: "rgba(8, 31, 58, 0.97)",
  primary: "#08BDF5",
  secondary: "#1677FF",
  success: "#22D879",
  text: "#FFFFFF",
  textSoft: "#DCEBFA",
  textMuted: "#8FAAC8",
  border: "rgba(80,170,230,0.25)",
} as const;

export type TournamentFilterKey = "upcoming" | "ongoing" | "finished";

export type TournamentAction = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  primary?: boolean;
  warning?: boolean;
};

export const TournamentPage = memo(function TournamentPage({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <LinearGradient
      colors={[TOURNAMENT_COLORS.background, TOURNAMENT_COLORS.backgroundAlt]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={styles.page}
    >
      <View pointerEvents="none" style={styles.ambientTop} />
      <View pointerEvents="none" style={styles.ambientSide} />
      {children}
    </LinearGradient>
  );
});

const TournamentGradientTitle = memo(function TournamentGradientTitle() {
  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel="Giải đấu"
      style={styles.titleLine}
    >
      <Text style={styles.titleWhite}>Giải</Text>
      <Svg
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        width={74}
        height={43}
        viewBox="0 0 74 43"
      >
        <Defs>
          <SvgLinearGradient id="tournamentTitleGradient" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#54E4FF" />
            <Stop offset="0.55" stopColor="#08BDF5" />
            <Stop offset="1" stopColor="#1677FF" />
          </SvgLinearGradient>
        </Defs>
        <SvgText
          x="0"
          y="33"
          fill="url(#tournamentTitleGradient)"
          fontSize="34"
          fontWeight="900"
          letterSpacing="-0.8"
        >
          đấu
        </SvgText>
      </Svg>
    </View>
  );
});

export const TournamentHeader = memo(function TournamentHeader({
  isBack,
  onBack,
}: {
  isBack?: boolean;
  onBack?: () => void;
}) {
  return (
    <View style={styles.header}>
      <View pointerEvents="none" style={styles.heroArtwork}>
        <LinearGradient
          colors={["rgba(8,189,245,0)", "rgba(8,189,245,0.13)"]}
          style={StyleSheet.absoluteFill}
        />
        <MaterialCommunityIcons
          name="table-tennis"
          size={116}
          color="rgba(92,220,255,0.19)"
          style={styles.paddle}
        />
        <View style={styles.ball}>
          <View style={[styles.ballHole, { top: 8, left: 10 }]} />
          <View style={[styles.ballHole, { top: 16, right: 7 }]} />
          <View style={[styles.ballHole, { bottom: 7, left: 18 }]} />
        </View>
      </View>

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
        <TournamentGradientTitle />
      </View>
      <Text style={styles.subtitle} numberOfLines={2}>
        Khám phá các giải đấu pickleball hấp dẫn
      </Text>
    </View>
  );
});

export const TournamentSearch = memo(function TournamentSearch({
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
      <Ionicons name="search" size={24} color="#9CC6EA" />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        returnKeyType="search"
        placeholder="Tìm kiếm giải đấu..."
        placeholderTextColor={TOURNAMENT_COLORS.textMuted}
        style={styles.searchInput}
      />
      {value.length > 0 ? (
        <Pressable accessibilityLabel="Xóa tìm kiếm" hitSlop={10} onPress={onClear}>
          <Ionicons name="close-circle" size={19} color={TOURNAMENT_COLORS.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
});

const FILTERS: {
  key: TournamentFilterKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: "upcoming", label: "Sắp diễn ra", icon: "calendar-outline" },
  { key: "ongoing", label: "Đang diễn ra", icon: "play-circle-outline" },
  { key: "finished", label: "Đã kết thúc", icon: "trophy-outline" },
];

export const TournamentFilters = memo(function TournamentFilters({
  active,
  onChange,
}: {
  active: TournamentFilterKey;
  onChange: (key: TournamentFilterKey) => void;
}) {
  return (
    <View style={styles.filters}>
      {FILTERS.map((filter) => {
        const selected = filter.key === active;
        const content = (
          <>
            <Ionicons
              name={filter.icon}
              size={16}
              color={selected ? "#FFFFFF" : "#9ABBE0"}
            />
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.82}
              style={[styles.filterText, selected && styles.filterTextActive]}
            >
              {filter.label}
            </Text>
          </>
        );
        return (
          <Pressable
            key={filter.key}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(filter.key)}
            style={({ pressed }) => [styles.filterPressable, pressed && styles.pressed]}
          >
            {selected ? (
              <LinearGradient
                colors={[TOURNAMENT_COLORS.primary, TOURNAMENT_COLORS.secondary]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.filterActive}
              >
                {content}
              </LinearGradient>
            ) : (
              <View style={styles.filterInactive}>{content}</View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
});

export const DateFilter = memo(function DateFilter({
  label,
  active,
  onPress,
  onClear,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  onClear?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.dateFilter, active && styles.dateFilterActive, pressed && styles.pressed]}
    >
      <Ionicons
        name="calendar-outline"
        size={17}
        color={active ? TOURNAMENT_COLORS.primary : "#9ABBE0"}
      />
      <Text numberOfLines={1} style={[styles.dateFilterText, active && styles.dateFilterTextActive]}>
        {label}
      </Text>
      {active && onClear ? (
        <Pressable
          accessibilityLabel="Xóa lọc theo ngày"
          hitSlop={10}
          onPress={(event) => {
            event.stopPropagation();
            onClear();
          }}
        >
          <Ionicons name="close-circle" size={17} color={TOURNAMENT_COLORS.primary} />
        </Pressable>
      ) : null}
    </Pressable>
  );
});

export const TournamentCard = memo(function TournamentCard({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.cardShadow, style]}>
      <LinearGradient
        colors={["rgba(8,36,66,0.98)", "rgba(4,22,44,0.99)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        {children}
      </LinearGradient>
    </View>
  );
});

const STATUS_TONES: Record<string, { color: string; label: string }> = {
  upcoming: { color: "#08BDF5", label: "Sắp diễn ra" },
  ongoing: { color: "#22D879", label: "Đang diễn ra" },
  finished: { color: "#22D879", label: "Đã kết thúc" },
};

export const TournamentStatus = memo(function TournamentStatus({ status }: { status?: string }) {
  const tone = STATUS_TONES[status || "finished"] || STATUS_TONES.finished;
  return (
    <View style={styles.statusBadge}>
      <View style={[styles.statusDot, { backgroundColor: tone.color, shadowColor: tone.color }]} />
      <Text style={styles.statusText}>{tone.label}</Text>
    </View>
  );
});

export const TournamentCover = memo(function TournamentCover({
  image,
  title,
  status,
  mode,
  onPress,
}: {
  image?: string | null;
  title: string;
  status?: string;
  mode?: string;
  onPress: () => void;
}) {
  const normalizedMode = String(mode || "").toLowerCase();
  return (
    <>
      <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.coverPressed}>
        <View style={styles.cover}>
          <ExpoImage
            source={{ uri: normalizeUrl(image) || "https://dummyimage.com/1200x675/081b33/8faac8&text=Pickletour" }}
            style={styles.coverImage}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
          <LinearGradient
            pointerEvents="none"
            colors={["rgba(2,11,28,0.04)", "rgba(2,11,28,0.12)", "rgba(2,11,28,0.62)"]}
            locations={[0, 0.56, 1]}
            style={StyleSheet.absoluteFill}
          />
          <TournamentStatus status={status} />
          {normalizedMode === "mlp" || normalizedMode === "team" ? (
            <View style={styles.modeBadge}>
              <MaterialCommunityIcons
                name={normalizedMode === "mlp" ? "trophy-award" : "account-group-outline"}
                size={14}
                color="#FFE071"
              />
              <Text style={styles.modeText}>{normalizedMode === "mlp" ? "MLP" : "Đồng đội"}</Text>
            </View>
          ) : null}
        </View>
      </Pressable>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.titlePressable, pressed && styles.pressed]}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {title}
        </Text>
      </Pressable>
    </>
  );
});

function TournamentInfoItem({
  icon,
  label,
  value,
  lines = 2,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  lines?: number;
}) {
  return (
    <View style={styles.infoItem}>
      <Ionicons name={icon} size={23} color={TOURNAMENT_COLORS.primary} />
      <View style={styles.infoCopy}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue} numberOfLines={lines}>
          {value}
        </Text>
      </View>
    </View>
  );
}

export const TournamentInfo = memo(function TournamentInfo({
  date,
  location,
  registration,
}: {
  date: string;
  location: string;
  registration: string;
}) {
  const { width } = useWindowDimensions();
  const compact = width < 405;

  if (compact) {
    return (
      <View style={styles.infoGridCompact}>
        <View style={styles.infoCompactTop}>
          <TournamentInfoItem icon="calendar-clear-outline" label="Thời gian" value={date} />
          <View style={styles.infoDivider} />
          <TournamentInfoItem icon="people-outline" label="Đăng ký" value={registration} />
        </View>
        <View style={styles.infoCompactLocation}>
          <TournamentInfoItem icon="location-outline" label="Địa điểm" value={location} lines={3} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.infoGrid}>
      <TournamentInfoItem icon="calendar-clear-outline" label="Thời gian" value={date} />
      <View style={styles.infoDivider} />
      <TournamentInfoItem icon="location-outline" label="Địa điểm" value={location} />
      <View style={styles.infoDivider} />
      <TournamentInfoItem icon="people-outline" label="Đăng ký" value={registration} />
    </View>
  );
});

export const TournamentActions = memo(function TournamentActions({
  actions,
}: {
  actions: TournamentAction[];
}) {
  if (!actions.length) return null;
  return (
    <View style={styles.actions}>
      {actions.map((action) => {
        const content = (
          <>
            <Ionicons
              name={action.icon}
              size={18}
              color={action.warning ? "#1A1200" : action.primary ? "#031526" : TOURNAMENT_COLORS.textSoft}
            />
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.78}
              style={[
                styles.actionText,
                action.primary && styles.actionTextPrimary,
                action.warning && styles.actionTextWarning,
              ]}
            >
              {action.label}
            </Text>
          </>
        );
        return (
          <Pressable
            key={action.key}
            accessibilityRole="button"
            onPress={action.onPress}
            style={({ pressed }) => [styles.actionPressable, pressed && styles.pressed]}
          >
            {action.primary ? (
              <LinearGradient
                colors={action.warning ? ["#FFB547", "#F59E0B"] : ["#27D5F8", "#08BDF5"]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.actionPrimary}
              >
                {content}
              </LinearGradient>
            ) : (
              <View style={styles.actionSecondary}>{content}</View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
});

export const ZaloButton = memo(function ZaloButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.zaloButton, pressed && styles.pressed]}
    >
      <View style={styles.zaloMark}>
        <Text style={styles.zaloMarkText}>Zalo</Text>
      </View>
      <Text style={styles.zaloText}>Nhóm Zalo</Text>
      <Ionicons name="chevron-forward" size={19} color="#168AFF" />
    </Pressable>
  );
});

export const TournamentList = React.forwardRef<FlatList<any>, FlatListProps<any>>(
  function TournamentList(props, ref) {
    return <FlatList ref={ref} {...props} />;
  },
);

const styles = StyleSheet.create({
  page: { flex: 1, overflow: "hidden" },
  ambientTop: {
    position: "absolute",
    top: -100,
    right: -90,
    width: 290,
    height: 290,
    borderRadius: 145,
    backgroundColor: "rgba(8,189,245,0.09)",
  },
  ambientSide: {
    position: "absolute",
    top: 360,
    left: -150,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "rgba(22,119,255,0.05)",
  },
  header: {
    minHeight: 112,
    paddingTop: 8,
    paddingBottom: 12,
    justifyContent: "center",
    overflow: "hidden",
  },
  heroArtwork: {
    position: "absolute",
    top: -8,
    right: -14,
    width: 180,
    height: 124,
    borderBottomLeftRadius: 72,
    overflow: "hidden",
  },
  paddle: { position: "absolute", top: -5, right: 18, transform: [{ rotate: "-13deg" }] },
  ball: {
    position: "absolute",
    right: 5,
    bottom: 3,
    width: 43,
    height: 43,
    borderRadius: 22,
    backgroundColor: "rgba(157,233,64,0.62)",
    shadowColor: "#A8F04D",
    shadowOpacity: 0.18,
    shadowRadius: 12,
  },
  ballHole: { position: "absolute", width: 5, height: 5, borderRadius: 3, backgroundColor: "rgba(4,31,27,0.6)" },
  headerTitleRow: { flexDirection: "row", alignItems: "center", zIndex: 2 },
  backButton: {
    width: 34,
    height: 34,
    marginRight: 6,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(7,27,52,0.72)",
    borderWidth: 1,
    borderColor: TOURNAMENT_COLORS.border,
  },
  titleLine: { flexDirection: "row", alignItems: "center", height: 44 },
  titleWhite: { color: "#FFFFFF", fontSize: 34, lineHeight: 42, fontWeight: "900", letterSpacing: -0.9, marginRight: 7 },
  subtitle: { color: TOURNAMENT_COLORS.textMuted, fontSize: 14.5, lineHeight: 20, fontWeight: "500", maxWidth: "76%", zIndex: 2 },
  search: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 16,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "rgba(118,184,232,0.48)",
    backgroundColor: "rgba(7,29,56,0.85)",
    shadowColor: "#020B1C",
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    marginBottom: 14,
  },
  searchInput: { flex: 1, height: "100%", paddingVertical: 0, color: TOURNAMENT_COLORS.text, fontSize: 16 },
  filters: { flexDirection: "row", gap: 8, marginBottom: 12 },
  filterPressable: { flex: 1, minWidth: 0, borderRadius: 17 },
  filterActive: { minHeight: 46, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 17, shadowColor: TOURNAMENT_COLORS.primary, shadowOpacity: 0.22, shadowRadius: 10 },
  filterInactive: { minHeight: 46, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 17, borderWidth: 1, borderColor: "rgba(98,164,217,0.35)", backgroundColor: "rgba(5,24,47,0.72)" },
  filterText: { color: "#9ABBE0", fontSize: 13, fontWeight: "700", textAlign: "center" },
  filterTextActive: { color: "#FFFFFF", fontWeight: "800" },
  dateFilter: { alignSelf: "flex-start", minHeight: 40, maxWidth: "100%", flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, borderColor: "rgba(98,164,217,0.34)", backgroundColor: "rgba(6,25,49,0.74)", marginBottom: 16 },
  dateFilterActive: { borderColor: "rgba(8,189,245,0.62)", backgroundColor: "rgba(8,107,166,0.18)" },
  dateFilterText: { color: "#9ABBE0", fontSize: 13.5, fontWeight: "700", flexShrink: 1 },
  dateFilterTextActive: { color: TOURNAMENT_COLORS.primary },
  cardShadow: { borderRadius: 24, shadowColor: "#000000", shadowOpacity: 0.38, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  card: { borderRadius: 24, overflow: "hidden", borderWidth: 1, borderColor: "rgba(8,189,245,0.48)" },
  cover: { position: "relative", width: "100%", aspectRatio: 16 / 8.1, overflow: "hidden", backgroundColor: "#081B33" },
  coverImage: { width: "100%", height: "100%" },
  coverPressed: { opacity: 0.92 },
  statusBadge: { position: "absolute", top: 12, left: 12, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18, borderWidth: 1, borderColor: "rgba(255,255,255,0.24)", backgroundColor: "rgba(2,11,28,0.74)" },
  statusDot: { width: 8, height: 8, borderRadius: 4, shadowOpacity: 0.9, shadowRadius: 5, shadowOffset: { width: 0, height: 0 } },
  statusText: { color: "#FFFFFF", fontSize: 12.5, fontWeight: "800" },
  modeBadge: { position: "absolute", top: 12, right: 12, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 17, borderWidth: 1, borderColor: "rgba(255,205,61,0.72)", backgroundColor: "rgba(35,26,2,0.67)" },
  modeText: { color: "#FFE071", fontSize: 12, fontWeight: "800" },
  titlePressable: { paddingHorizontal: 14, paddingTop: 13, paddingBottom: 8 },
  cardTitle: { color: TOURNAMENT_COLORS.text, fontSize: 18.5, lineHeight: 24, fontWeight: "900", letterSpacing: -0.25 },
  infoGrid: { flexDirection: "row", alignItems: "stretch", paddingHorizontal: 13, paddingVertical: 9 },
  infoGridCompact: { paddingHorizontal: 13, paddingVertical: 8 },
  infoCompactTop: { flexDirection: "row", alignItems: "stretch", paddingBottom: 8 },
  infoCompactLocation: { paddingTop: 9, borderTopWidth: 1, borderTopColor: "rgba(80,170,230,0.18)" },
  infoItem: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "flex-start", gap: 7, paddingHorizontal: 3 },
  infoCopy: { flex: 1, minWidth: 0 },
  infoLabel: { color: TOURNAMENT_COLORS.textMuted, fontSize: 10.5, lineHeight: 14, fontWeight: "600", marginBottom: 2 },
  infoValue: { color: TOURNAMENT_COLORS.textSoft, fontSize: 12.5, lineHeight: 16, fontWeight: "800" },
  infoDivider: { width: 1, marginHorizontal: 4, backgroundColor: "rgba(80,170,230,0.18)" },
  actions: { flexDirection: "row", gap: 8, paddingHorizontal: 13, paddingTop: 8, paddingBottom: 10 },
  actionPressable: { flex: 1, minWidth: 0, borderRadius: 15 },
  actionSecondary: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 7, borderRadius: 15, borderWidth: 1, borderColor: "rgba(8,189,245,0.48)", backgroundColor: "rgba(4,23,46,0.72)" },
  actionPrimary: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 7, borderRadius: 15, shadowColor: TOURNAMENT_COLORS.primary, shadowOpacity: 0.22, shadowRadius: 9, shadowOffset: { width: 0, height: 4 } },
  actionText: { color: TOURNAMENT_COLORS.textSoft, fontSize: 12.5, fontWeight: "800", textAlign: "center" },
  actionTextPrimary: { color: "#031526" },
  actionTextWarning: { color: "#1A1200" },
  zaloButton: { minHeight: 48, marginHorizontal: 13, marginBottom: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 15, borderWidth: 1, borderColor: "rgba(22,138,255,0.72)", backgroundColor: "rgba(5,61,123,0.2)" },
  zaloMark: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#1677FF" },
  zaloMarkText: { color: "#FFFFFF", fontSize: 7, fontWeight: "900", letterSpacing: -0.3 },
  zaloText: { color: "#168AFF", fontSize: 14, fontWeight: "800" },
  pressed: { opacity: 0.84, transform: [{ scale: 0.985 }] },
});
