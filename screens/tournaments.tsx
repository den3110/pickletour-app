// app/(app)/tournaments/DashboardScreen.jsx
import {
  useGetTournamentsQuery } from "@/slices/tournamentsApiSlice";
import { router,
  useLocalSearchParams } from "expo-router";
import React,
  { useEffect,
  useMemo,
  useRef,
  useState } from "react";
import {
  Animated,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  useColorScheme,
  View,
  Modal,
  SafeAreaView as RNSafeAreaView,
} from "react-native";
import { Text } from "@/components/ui/i18nText";
import { SafeAreaView as EdgeSafeAreaView } from "react-native-safe-area-context";
import { useSelector } from "react-redux";
import { Image as ExpoImage } from "expo-image";
import { normalizeUrl } from "@/utils/normalizeUri";
import { useTheme } from "@react-navigation/native";
import ImageView from "react-native-image-viewing";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Calendar } from "react-native-calendars";
import AppleLiquidGlassView from "@/components/ui/AppleLiquidGlassView";
import { IOS_26_LIQUID_GLASS_ENABLED } from "@/utils/nativeTabs";
import {
  DateFilter,
  TournamentActions,
  TournamentCard as PremiumTournamentCard,
  TournamentCover,
  TournamentFilters,
  TournamentHeader,
  TournamentInfo,
  TournamentList,
  TournamentPage,
  TournamentSearch,
  TOURNAMENT_COLORS,
  ZaloButton,
  type TournamentAction,
  type TournamentFilterKey,
} from "@/components/tournaments/TournamentDesign";

// Nhóm Zalo cộng đồng — fallback khi giải chưa đặt link Zalo riêng.
const DEFAULT_ZALO_GROUP = "https://zalo.me/g/yarnhm129";

const ViewerImage = (props) => {
  return (
    <ExpoImage {...props} cachePolicy="memory-disk" contentFit="contain" />
  );
};

const BANNER_RATIO = 16 / 9;
const SKELETON_COUNT = 4;

// --- Constants ---
const TABS = [
  { key: "upcoming", label: "Sắp diễn ra" },
  { key: "ongoing", label: "Đang diễn ra" },
  { key: "finished", label: "Đã kết thúc" },
];

function formatDate(d) {
  if (!d) return "--/--";
  try {
    const dt = new Date(d);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const day = String(dt.getDate()).padStart(2, "0");
    return `${day}/${m}/${y}`;
  } catch {
    return "--/--";
  }
}

function toDateId(d) {
  if (!d) return null;
  try {
    const dt = new Date(d);
    return dt.toISOString().slice(0, 10); // YYYY-MM-DD
  } catch {
    return null;
  }
}

function fromDateId(id) {
  if (!id) return null;
  return new Date(id + "T00:00:00");
}

/* ---------- Theme Tokens ---------- */
function useModernTheme() {
  const scheme = useColorScheme() || "light";
  const navTheme = useTheme() as any;
  const v2 = navTheme?.version === "v2";
  // V2 Modern luôn nền tối navy; nếu không, theo nav theme (dark/light).
  const isDark = v2 || !!navTheme?.dark || scheme === "dark";
  const primaryColor = navTheme?.colors?.primary ?? "#3b82f6";

  return {
    isDark,
    colors: {
      bg: v2 ? TOURNAMENT_COLORS.background : isDark ? "#0f1115" : "#f8fafc",
      card: v2 ? TOURNAMENT_COLORS.surfaceStrong : isDark ? "#181a20" : "#ffffff",
      text: v2 ? TOURNAMENT_COLORS.text : isDark ? "#ffffff" : "#0f172a",
      textSec: v2 ? TOURNAMENT_COLORS.textMuted : isDark ? "#848E9C" : "#64748b",
      border: v2 ? TOURNAMENT_COLORS.border : isDark ? "#262932" : "#e2e8f0",
      primary: v2 ? TOURNAMENT_COLORS.primary : primaryColor,
      success: "#10b981",
      warning: "#f97316",
      inputBg: v2 ? "rgba(255,255,255,0.06)" : isDark ? "#20232b" : "#f1f5f9",
    },
    cardShadow: {
      shadowColor: isDark ? "#000" : "#1e293b",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.5 : 0.15,
      shadowRadius: 16,
      elevation: 8,
    },
    btnShadow: {
      shadowColor: primaryColor,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 4,
    },
    successShadow: {
      shadowColor: "#10b981",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 4,
    },
    warningShadow: {
      shadowColor: "#f97316",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 4,
    },
  };
}

/* ---------- Skeleton ---------- */
function usePulse() {
  const v = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(v, {
          toValue: 0.5,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return v;
}

function SkeletonBlock({ style }) {
  const theme = useModernTheme();
  const opacity = usePulse();
  const bg = theme.isDark ? "#334155" : "#cbd5e1";
  return (
    <Animated.View
      style={[{ backgroundColor: bg, opacity, borderRadius: 6 }, style]}
    />
  );
}

function SkeletonCard() {
  const theme = useModernTheme();
  return (
    <AppleLiquidGlassView
      fallback="view"
      glassColorScheme={theme.isDark ? "dark" : "light"}
      glassEffectStyle="regular"
      glassTintColor={
        theme.isDark ? "rgba(15, 23, 42, 0.58)" : "rgba(255, 255, 255, 0.58)"
      }
      style={[
        styles.cardContainer,
        { backgroundColor: theme.colors.card },
        IOS_26_LIQUID_GLASS_ENABLED && styles.glassCard,
        theme.cardShadow,
      ]}
    >
      <SkeletonBlock
        style={{
          width: "100%",
          aspectRatio: BANNER_RATIO,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          borderRadius: 0,
        }}
      />
      <View style={{ padding: 14, gap: 10 }}>
        <SkeletonBlock style={{ height: 22, width: "90%" }} />
        <SkeletonBlock style={{ height: 14, width: "60%" }} />
        <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
          <SkeletonBlock style={{ height: 40, width: 110, borderRadius: 20 }} />
          <SkeletonBlock style={{ height: 40, width: 90, borderRadius: 20 }} />
        </View>
      </View>
    </AppleLiquidGlassView>
  );
}

function TournamentListHeader({
  isBack,
  theme,
  keyword,
  setKeyword,
  tab,
  setTab,
  openDateModal,
  hasDateFilter,
  fromDate,
  toDate,
  clearDateFilter,
  error,
}) {
  return (
    <View style={styles.listHeader}>
      <TournamentHeader isBack={isBack} onBack={() => router.back()} />
      <TournamentSearch
        value={keyword}
        onChangeText={setKeyword}
        onClear={() => setKeyword("")}
      />
      <TournamentFilters
        active={tab as TournamentFilterKey}
        onChange={(nextTab) => setTab(nextTab)}
      />
      <DateFilter
        active={hasDateFilter}
        label={
          hasDateFilter
            ? `${formatDate(fromDate)} – ${formatDate(toDate)}`
            : "Lọc theo ngày"
        }
        onPress={openDateModal}
        onClear={clearDateFilter}
      />

      {!!error && (
        <AppleLiquidGlassView
          fallback="view"
          glassColorScheme={theme.isDark ? "dark" : "light"}
          glassEffectStyle="regular"
          glassTintColor="rgba(254, 226, 226, 0.72)"
          style={[
            styles.errorBox,
            { backgroundColor: "#fef2f2", borderColor: "#fca5a5" },
            IOS_26_LIQUID_GLASS_ENABLED && styles.glassControl,
          ]}
        >
          <Ionicons name="alert-circle" size={20} color="#ef4444" />
          <Text style={{ color: "#b91c1c", flex: 1 }}>
            {error?.data?.message || error?.error || "Có lỗi xảy ra"}
          </Text>
        </AppleLiquidGlassView>
      )}
    </View>
  );
}

/* ---------- Main Screen ---------- */
export default function TournamentDashboardScreen({ isBack = false }) {
  const theme = useModernTheme();
  const scheme = useColorScheme() ?? "light";
  const isDark = scheme === "dark";

  const me = useSelector((s) => s.auth?.userInfo || null);
  const isAdmin = !!(
    me?.isAdmin ||
    me?.role === "admin" ||
    (Array.isArray(me?.roles) && me.roles.includes("admin"))
  );

  const isManagerOf = (tt) => {
    if (!me?._id) return false;
    if (String(tt?.createdBy) === String(me._id)) return true;
    if (Array.isArray(tt?.managers)) {
      return tt.managers.some((m) => String(m?.user ?? m) === String(me._id));
    }
    if (typeof tt?.isManager !== "undefined") return !!tt.isManager;
    return false;
  };
  const canManage = (tt) => isAdmin || isManagerOf(tt);

  // Trọng tài của giải: user.referee.tournaments[] chứa id giải này,
  // hoặc backend đã trả cờ tt.isReferee cho current user.
  const refereeTournamentIds = useMemo(() => {
    const set = new Set();
    const src = me?.referee?.tournaments;
    if (Array.isArray(src)) {
      for (const x of src) {
        const id = x?._id || x?.tournament?._id || x?.tournament || x;
        if (id) set.add(String(id));
      }
    }
    return set;
  }, [me?.referee?.tournaments]);

  const isRefereeOf = (tt) => {
    if (!me?._id) return false;
    if (typeof tt?.isReferee !== "undefined") return !!tt.isReferee;
    return refereeTournamentIds.has(String(tt?._id));
  };

  const { sportType = "2", groupId = "0", status, q } = useLocalSearchParams();

  const initialTab = TABS.some((t) => t.key === String(status))
    ? String(status)
    : "upcoming";
  const [tab, setTab] = useState(initialTab);
  const [keyword, setKeyword] = useState(q ? String(q) : "");
  const [search, setSearch] = useState(q ? String(q).toLowerCase() : "");

  useEffect(() => {
    const tt = setTimeout(() => setSearch(keyword.trim().toLowerCase()), 300);
    return () => clearTimeout(tt);
  }, [keyword]);

  const {
    data: tournaments,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useGetTournamentsQuery(
    { sportType, groupId },
    { refetchOnFocus: true, refetchOnReconnect: true }
  );

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    try {
      setRefreshing(true);
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const [preview, setPreview] = useState(null);

  // --- Date range filter ---
  const [dateModalVisible, setDateModalVisible] = useState(false);
  const [fromDate, setFromDate] = useState(null); // Date | null
  const [toDate, setToDate] = useState(null); // Date | null
  const [rangeDraft, setRangeDraft] = useState({ start: null, end: null }); // 'YYYY-MM-DD'

  const hasDateFilter = !!(fromDate && toDate);
  const canApply = !!(rangeDraft.start && rangeDraft.end);
  const isPickingStart = !rangeDraft.start;
  const isPickingEnd = !!rangeDraft.start && !rangeDraft.end;

  const stepLabel = isPickingStart
    ? "Chọn ngày bắt đầu"
    : isPickingEnd
    ? "Chọn ngày kết thúc"
    : "Đã chọn xong khoảng ngày";

  const hintLabel = isPickingStart
    ? "Chạm vào một ngày trong lịch để chọn ngày bắt đầu."
    : isPickingEnd
    ? "Chọn ngày kết thúc, sau đó bấm nút Áp dụng để lọc."
    : "Kiểm tra lại khoảng ngày rồi bấm Áp dụng để lọc kết quả.";

  const applyLabel = isPickingStart
    ? "Chọn ngày bắt đầu"
    : isPickingEnd
    ? "Chọn ngày kết thúc"
    : "Áp dụng";

  const openDateModal = () => {
    setRangeDraft({
      start: toDateId(fromDate),
      end: toDateId(toDate),
    });
    setDateModalVisible(true);
  };

  const clearDateFilter = () => {
    setFromDate(null);
    setToDate(null);
  };

  const filtered = useMemo(() => {
    const list = Array.isArray(tournaments) ? tournaments : [];
    return list
      .filter((tt) => tt.status === tab)
      .filter((tt) => (search ? tt.name?.toLowerCase().includes(search) : true))
      .filter((tt) => {
        if (!fromDate && !toDate) return true;
        if (!tt.startDate) return true;
        const s = new Date(tt.startDate);
        if (fromDate && s < fromDate) return false;
        if (toDate && s > toDate) return false;
        return true;
      });
  }, [tournaments, tab, search, fromDate, toDate]);

  const onPressCard = (tt) => router.push(`/tournament/${tt._id}`);

  // === RENDER ITEM ===
  const renderItem = ({ item: tt }) => {
    const onPressSchedule = () => router.push(`/tournament/${tt._id}/schedule`);
    const onPressRegister = () => router.push(`/tournament/${tt._id}/register`);
    const onPressBracket = () =>
      router.push({
        pathname: "/tournament/[id]/bracket",
        params: { id: tt._id },
      });
    const onPressReferee = () =>
      router.push(`/tournament/${tt._id}/referee`);

    const isRefereeOfThis = isRefereeOf(tt);
    // Trọng tài → thay nút Đăng ký bằng nút Chấm trận.
    const showRegister =
      !isRefereeOfThis && (canManage(tt) || tt.status === "upcoming");

    const actions: TournamentAction[] = [];
    if (Number((tt as any)?.matchesTotal) > 0) {
      actions.push({
        key: "schedule",
        label: "Lịch đấu",
        icon: "calendar-outline",
        onPress: onPressSchedule,
      });
    }
    if (isRefereeOfThis) {
      actions.push({
        key: "referee",
        label: "Chấm trận",
        icon: "create-outline",
        onPress: onPressReferee,
        primary: true,
        warning: true,
      });
    } else if (showRegister) {
      actions.push({
        key: "register",
        label: "Đăng ký",
        icon: "person-add-outline",
        onPress: onPressRegister,
        primary: true,
      });
    }
    if (Number((tt as any)?.bracketsTotal) > 0) {
      actions.push({
        key: "bracket",
        label: tt.status === "finished" ? "Xem sơ đồ" : "Sơ đồ",
        icon: "git-network-outline",
        onPress: onPressBracket,
      });
    }

    return (
      <PremiumTournamentCard>
        <TournamentCover
          image={tt.image}
          title={tt.name || "Giải đấu Pickletour"}
          status={tt.status}
          mode={(tt as any)?.tournamentMode}
          onPress={() => onPressCard(tt)}
        />
        <TournamentInfo
          date={`${formatDate(tt.startDate)}\n– ${formatDate(tt.endDate)}`}
          location={tt.location || "Chưa cập nhật"}
          registration={
            Number(tt.maxPairs) > 0
              ? `${tt.registered ?? 0}/${tt.maxPairs}`
              : `${tt.registered ?? 0}`
          }
        />
        <TournamentActions actions={actions} />
        <ZaloButton
          onPress={() =>
            Linking.openURL((tt as any)?.zaloGroupUrl || DEFAULT_ZALO_GROUP)
          }
        />
      </PremiumTournamentCard>
    );
  };

  const screenContent = (
    <TournamentPage>
      <View style={styles.container}>
        {/* ✅ FlatList bọc tất cả (kể cả Header) */}
        {isLoading || isFetching ? (
          <TournamentList
            ListHeaderComponent={
              <TournamentListHeader
                isBack={isBack}
                theme={theme}
                keyword={keyword}
                setKeyword={setKeyword}
                tab={tab}
                setTab={setTab}
                openDateModal={openDateModal}
                hasDateFilter={hasDateFilter}
                fromDate={fromDate}
                toDate={toDate}
                clearDateFilter={clearDateFilter}
                error={error}
              />
            }
            data={Array.from({ length: SKELETON_COUNT })}
            keyExtractor={(_, i) => `sk-${i}`}
            renderItem={() => <SkeletonCard />}
            ItemSeparatorComponent={() => <View style={{ height: 20 }} />}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
          />
        ) : (
          <TournamentList
            ListHeaderComponent={
              <TournamentListHeader
                isBack={isBack}
                theme={theme}
                keyword={keyword}
                setKeyword={setKeyword}
                tab={tab}
                setTab={setTab}
                openDateModal={openDateModal}
                hasDateFilter={hasDateFilter}
                fromDate={fromDate}
                toDate={toDate}
                clearDateFilter={clearDateFilter}
                error={error}
              />
            }
            data={filtered}
            keyExtractor={(item) => String(item._id)}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={{ height: 20 }} />}
            refreshing={refreshing}
            onRefresh={onRefresh}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <MaterialCommunityIcons
                  name="trophy-broken"
                  size={64}
                  color={theme.colors.border}
                />
                <Text
                  style={{
                    color: theme.colors.textSec,
                    marginTop: 12,
                    fontSize: 16,
                  }}
                >
                  Không tìm thấy giải đấu nào.
                </Text>
              </View>
            }
          />
        )}
      </View>

      {/* Date range modal */}
      <Modal
        visible={dateModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setDateModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <AppleLiquidGlassView
            fallback="view"
            glassColorScheme={theme.isDark ? "dark" : "light"}
            glassEffectStyle="regular"
            glassTintColor={
              theme.isDark
                ? "rgba(15, 23, 42, 0.7)"
                : "rgba(255, 255, 255, 0.7)"
            }
            style={[
              styles.modalCard,
              { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
              IOS_26_LIQUID_GLASS_ENABLED && styles.glassModal,
            ]}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: theme.colors.primary,
                textAlign: "center",
                marginBottom: 2,
              }}
            >
              {stepLabel}
            </Text>

            <Text
              style={{
                fontSize: 11,
                color: theme.colors.textSec,
                textAlign: "center",
                marginBottom: 8,
              }}
            >
              {hintLabel}
            </Text>

            <Calendar
              markingType="period"
              onDayPress={(day) => {
                const date = day.dateString; // 'YYYY-MM-DD'
                setRangeDraft((prev) => {
                  if (!prev.start || (prev.start && prev.end)) {
                    return { start: date, end: null };
                  }
                  if (date < prev.start) {
                    return { start: date, end: prev.start };
                  }
                  if (date === prev.start) {
                    return { start: date, end: date };
                  }
                  return { start: prev.start, end: date };
                });
              }}
              markedDates={(() => {
                const { start, end } = rangeDraft;
                if (!start && !end) return {};

                const marked = {};
                if (start && !end) {
                  marked[start] = {
                    startingDay: true,
                    endingDay: true,
                    color: "#0ea5e9",
                    textColor: "#fff",
                  };
                  return marked;
                }
                if (start && end) {
                  if (start === end) {
                    marked[start] = {
                      startingDay: true,
                      endingDay: true,
                      color: "#0ea5e9",
                      textColor: "#fff",
                    };
                    return marked;
                  }
                  const startDate = new Date(start);
                  const endDate = new Date(end);
                  const dayMs = 24 * 60 * 60 * 1000;
                  for (
                    let d = new Date(startDate);
                    d <= endDate;
                    d = new Date(d.getTime() + dayMs)
                  ) {
                    const id = d.toISOString().slice(0, 10);
                    if (id === start) {
                      marked[id] = {
                        startingDay: true,
                        color: "#0ea5e9",
                        textColor: "#fff",
                      };
                    } else if (id === end) {
                      marked[id] = {
                        endingDay: true,
                        color: "#0ea5e9",
                        textColor: "#fff",
                      };
                    } else {
                      marked[id] = {
                        color: "#bae6fd",
                        textColor: "#0f172a",
                      };
                    }
                  }
                }
                return marked;
              })()}
              theme={{
                backgroundColor: IOS_26_LIQUID_GLASS_ENABLED
                  ? "transparent"
                  : theme.colors.card,
                calendarBackground: IOS_26_LIQUID_GLASS_ENABLED
                  ? "transparent"
                  : theme.colors.card,
                textSectionTitleColor: theme.colors.textSec,
                dayTextColor: theme.colors.text,
                monthTextColor: theme.colors.text,
                arrowColor: theme.colors.text,
                todayTextColor: theme.colors.primary,
              }}
            />

            <View style={styles.modalBtnRow}>
              <Pressable
                onPress={() => setDateModalVisible(false)}
                style={styles.modalTextBtn}
              >
                <Text
                  style={{ color: theme.colors.textSec, fontWeight: "600" }}
                >
                  Đóng
                </Text>
              </Pressable>

              <Pressable
                disabled={!canApply}
                onPress={() => {
                  if (!canApply) return;
                  const { start, end } = rangeDraft;
                  setFromDate(start ? fromDateId(start) : null);
                  setToDate(end ? fromDateId(end) : null);
                  setDateModalVisible(false);
                }}
                style={[
                  styles.modalApplyBtn,
                  {
                    backgroundColor: canApply
                      ? theme.colors.primary
                      : theme.colors.text,
                    opacity: canApply ? 1 : 0.6,
                  },
                ]}
              >
                <Text
                  style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}
                >
                  {applyLabel}
                </Text>
              </Pressable>
            </View>
          </AppleLiquidGlassView>
        </View>
      </Modal>

      <ImageView
        images={[{ uri: normalizeUrl(preview) }]}
        imageIndex={0}
        visible={!!preview}
        onRequestClose={() => setPreview(null)}
        swipeToCloseEnabled
        ImageComponent={ViewerImage}
        backgroundColor={isDark ? "#0b0b0c" : "#ffffff"}
      />
    </TournamentPage>
  );

  if (IOS_26_LIQUID_GLASS_ENABLED) {
    return (
      <EdgeSafeAreaView
        edges={["top"]}
        style={{ flex: 1, backgroundColor: TOURNAMENT_COLORS.background }}
      >
        {screenContent}
      </EdgeSafeAreaView>
    );
  }

  return (
    <RNSafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      {screenContent}
    </RNSafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },
  listHeader: {
    marginBottom: 2,
  },
  listContent: {
    paddingBottom: 112,
  },
  cardContainer: {
    borderRadius: 20,
    marginBottom: 6,
    overflow: Platform.OS === "android" ? "hidden" : "visible",
  },
  glassCard: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    marginTop: Platform.OS === "android" ? 10 : 0,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: 0,
  },
  backButtonGlassWrap: {
    marginRight: 10,
  },
  backButtonGlass: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    marginBottom: 16,
    gap: 8,
  },
  glassControl: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
  },
  actionGlassBtn: {
    borderWidth: 1,
    paddingVertical: 8.5,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    height: "100%",
    fontSize: 16,
  },
  filtersRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  tabsRow: {
    flexDirection: "row",
    gap: 8,
    flexShrink: 1,
  },
  tabPill: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  glassPill: {
    borderWidth: 1,
  },
  cardMediaWrap: {
    position: "relative",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },
  cardImage: {
    width: "100%",
    aspectRatio: BANNER_RATIO,
  },
  cardMediaScrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "72%",
  },
  cardTitleOnImage: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 11,
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.3,
    lineHeight: 25,
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  /* ===== Meta 3 cột (theo mẫu) ===== */
  metaGrid: {
    flexDirection: "row",
    alignItems: "stretch",
    marginTop: 4,
    marginBottom: 14,
  },
  metaCol: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 2,
  },
  metaColLabel: {
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 0.2,
    marginBottom: 2,
    textTransform: "uppercase",
  },
  metaColValue: { fontSize: 12.5, fontWeight: "800", lineHeight: 16 },
  metaDividerV: { width: 1, alignSelf: "stretch", marginVertical: 4, opacity: 0.6 },
  /* ===== Nút hành động (theo mẫu) ===== */
  tBtnRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  tBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 14,
    minHeight: 48,
  },
  tBtnOutline: { borderWidth: 1.5, backgroundColor: "transparent" },
  tBtnSolid: {
    shadowOpacity: 0.42,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  tBtnText: { textAlign: "center", fontSize: 12.5, fontWeight: "800" },
  tBtnZalo: {
    flex: 0,
    alignSelf: "center",
    minWidth: 190,
    borderWidth: 1.5,
    borderColor: "rgba(10,132,255,0.45)",
    backgroundColor: "rgba(10,132,255,0.08)",
    paddingHorizontal: 22,
    marginTop: 2,
  },
  tBtnZaloText: { color: "#0A84FF" },
  statusBadgeOverlay: {
    position: "absolute",
    top: 12,
    left: 12,
    backgroundColor: "rgba(2,8,20,0.6)",
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    shadowOpacity: 0.9,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  statusTextOverlay: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  formatBadgeMlp: {
    position: "absolute",
    top: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#f59e0b",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  formatBadgeTeam: {
    position: "absolute",
    top: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#6366f1",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  formatBadgeText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 11,
    letterSpacing: 0.8,
  },
  cardTitle: {
    fontSize: 19,
    fontWeight: "700",
    marginBottom: 4,
    lineHeight: 28,
  },
  btnTextWhite: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
  },
  dateFilterPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: 240,
  },
  filterActiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginHorizontal: 4,
  },
  dateFilterLabel: {
    fontSize: 12,
    fontWeight: "600",
    flexShrink: 1,
  },
  transparentFill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 16,
    padding: 12,
  },
  glassModal: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  modalBtnRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 12,
    gap: 8,
  },
  modalTextBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modalApplyBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
});
