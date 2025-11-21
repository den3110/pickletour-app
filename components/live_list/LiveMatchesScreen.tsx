import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  memo,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Platform,
  Keyboard,
  ActivityIndicator,
  SafeAreaView,
  KeyboardAvoidingView,
  useColorScheme,
  Animated,
  Easing,
} from "react-native";
import { useTheme } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import LottieView from "lottie-react-native";

import LiveMatchCard from "./LiveMatchCard";
import { useGetLiveMatchesQuery } from "@/slices/liveApiSlice";
import FiltersBottomSheet from "./FiltersModal";

const LIMIT = 12;
const STATUS_OPTIONS = ["scheduled", "queued", "assigned", "live", "finished"];

/* ============================
 * THEME TOKENS (light/dark)
 * ============================ */
function useThemeTokens() {
  const navTheme = useTheme?.();
  const sysScheme = useColorScheme?.() ?? "light";
  const isDark =
    typeof navTheme?.dark === "boolean" ? navTheme.dark : sysScheme === "dark";
  const scheme = isDark ? "dark" : "light";

  const tint = navTheme?.colors?.primary ?? (isDark ? "#7cc0ff" : "#0a84ff");
  const textPrimary =
    navTheme?.colors?.text ?? (isDark ? "#ffffff" : "#0f172a");
  const textSecondary = isDark ? "#d1d1d1" : "#475569";
  const placeholder = isDark ? "#9aa4b2" : "#94a3b8";
  const pageBg =
    navTheme?.colors?.background ?? (isDark ? "#0b0c0f" : "#f6f7fb");
  const cardBg = navTheme?.colors?.card ?? (isDark ? "#111214" : "#ffffff");
  const cardBorder =
    navTheme?.colors?.border ?? (isDark ? "#3a3b40" : "#e5e7eb");

  const chip = {
    bg: isDark ? "rgba(199,210,254,0.16)" : "#e3f2fd",
    text: isDark ? "#e0e7ff" : "#1976d2",
  };

  // skeleton tones
  const skelBase = isDark ? "#1a1c20" : "#e9eef5";
  const skelShine = isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.55)";

  return {
    scheme,
    tint,
    textPrimary,
    textSecondary,
    placeholder,
    pageBg,
    cardBg,
    cardBorder,
    chip,
    skeleton: { base: skelBase, shine: skelShine },
    isDark,
  };
}

/* ============ utilities ============ */
function useTickingAgo() {
  const [ts, setTs] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return ts;
}
function useDebouncedValue(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/* ============ Shimmer Skeleton ============ */
const Shimmer = memo(function Shimmer({ style, shineColor }) {
  const translate = useRef(new Animated.Value(-1)).current;
  const widthRef = useRef(300);
  const onLayout = useCallback((e) => {
    widthRef.current = e.nativeEvent.layout.width || 300;
  }, []);
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(translate, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [translate]);

  const transformX = translate.interpolate({
    inputRange: [-1, 1],
    outputRange: [-widthRef.current, widthRef.current],
  });

  return (
    <View style={[{ overflow: "hidden" }, style]} onLayout={onLayout}>
      <Animated.View
        style={{
          position: "absolute",
          left: -widthRef.current,
          top: 0,
          bottom: 0,
          width: widthRef.current * 2,
          transform: [{ translateX: transformX }],
        }}
      >
        <LinearGradient
          colors={["transparent", shineColor, "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
    </View>
  );
});

const SkeletonBlock = memo(function SkeletonBlock({ T, w, h, r = 8, style }) {
  return (
    <View
      style={[
        {
          width: w,
          height: h,
          borderRadius: r,
          backgroundColor: T.skeleton.base,
          overflow: "hidden",
        },
        style,
      ]}
    >
      <Shimmer style={{ flex: 1 }} shineColor={T.skeleton.shine} />
    </View>
  );
});

const SkeletonCard = memo(function SkeletonCard({ T }) {
  return (
    <View
      style={[
        styles.skelCard,
        { backgroundColor: T.cardBg, borderColor: T.cardBorder },
      ]}
    >
      {/* top row: code + small tag */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <SkeletonBlock T={T} w={120} h={14} />
        <SkeletonBlock T={T} w={64} h={14} />
        <View style={{ flex: 1 }} />
        <SkeletonBlock T={T} w={40} h={14} />
      </View>

      {/* title row */}
      <SkeletonBlock T={T} w={"80%"} h={18} style={{ marginTop: 12 }} />
      <SkeletonBlock T={T} w={"50%"} h={14} style={{ marginTop: 8 }} />

      {/* footer chips */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginTop: 14,
        }}
      >
        <SkeletonBlock T={T} w={76} h={24} r={12} />
        <SkeletonBlock T={T} w={64} h={24} r={12} />
        <SkeletonBlock T={T} w={56} h={24} r={12} />
      </View>
    </View>
  );
});

const SkeletonList = memo(function SkeletonList({ T, count = 6 }) {
  return (
    <View style={{ paddingHorizontal: 0 }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} T={T} />
      ))}
    </View>
  );
});

/* ============ Header ============ */
const Header = memo(function Header(props) {
  const T = useThemeTokens();
  const {
    keyword,
    setKeyword,
    onOpenFilters,
    onManualRefresh,
    isFetching,
    isManualRefreshing,
    activeFilters,
    total,
    updatedAgoSec,
    statuses,
    excludeFinished,
    windowHours,
    autoRefresh,
    refreshSec,
    searchInputRef,
    setSearchFocused,
    onSubmitSearch,
  } = props;

  return (
    <View style={styles.header}>
      {/* Search Bar */}
      <View
        style={[
          styles.searchBar,
          { backgroundColor: T.cardBg, borderColor: T.cardBorder },
        ]}
      >
        <LottieView
          source={require("@/assets/lottie/empty-search.json")}
          autoPlay
          loop
          style={styles.searchLottie}
        />
        <TextInput
          ref={searchInputRef}
          style={[styles.searchInput, { color: T.textPrimary }]}
          value={keyword}
          onChangeText={(text) => setKeyword(text)}
          placeholder="Tìm mã trận, sân, nền tảng..."
          placeholderTextColor={T.placeholder}
          returnKeyType="search"
          blurOnSubmit={true}
          onSubmitEditing={() => {
            Keyboard.dismiss();
            onSubmitSearch();
          }}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {keyword.length > 0 && (
          <TouchableOpacity
            onPress={() => {
              setKeyword("");
            }}
            style={styles.clearBtn}
            activeOpacity={0.6}
          >
            <Text style={[styles.clearBtnText, { color: T.textSecondary }]}>
              ✕
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Action Buttons */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[
            styles.filterBtn,
            { backgroundColor: T.cardBg, borderColor: T.cardBorder },
          ]}
          onPress={() => {
            Keyboard.dismiss();
            onOpenFilters();
          }}
          activeOpacity={0.7}
        >
          <Text style={[styles.iconText, { color: T.textPrimary }]}>⚙️</Text>
          <Text style={[styles.filterBtnText, { color: T.textPrimary }]}>
            Bộ lọc {activeFilters > 0 ? `(${activeFilters})` : ""}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.refreshBtn,
            { backgroundColor: T.cardBg, borderColor: T.cardBorder },
            isFetching && isManualRefreshing && styles.refreshBtnDisabled,
          ]}
          onPress={onManualRefresh}
          disabled={isFetching && isManualRefreshing}
          activeOpacity={0.7}
        >
          {isFetching && isManualRefreshing ? (
            <ActivityIndicator size="small" color={T.tint} />
          ) : (
            <Text style={[styles.iconText, { color: T.textPrimary }]}>🔄</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <Text style={[styles.statsText, { color: T.textSecondary }]}>
          ▶️ {total} luồng • cập nhật {updatedAgoSec}s trước
        </Text>
      </View>

      {/* Active Filters Chips */}
      {activeFilters > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsRow}
          contentContainerStyle={styles.chipsContent}
          keyboardShouldPersistTaps="handled"
          directionalLockEnabled={true}
          nestedScrollEnabled={false}
        >
          {statuses.length !== STATUS_OPTIONS.length && (
            <View style={[styles.chip, { backgroundColor: T.chip.bg }]}>
              <Text
                style={[styles.chipText, { color: T.chip.text }]}
                numberOfLines={1}
              >
                Trạng thái: {statuses.join(", ")}
              </Text>
            </View>
          )}
          {windowHours !== 8 && (
            <View style={[styles.chip, { backgroundColor: T.chip.bg }]}>
              <Text style={[styles.chipText, { color: T.chip.text }]}>
                Cửa sổ: {windowHours}h
              </Text>
            </View>
          )}
          {!excludeFinished && (
            <View style={[styles.chip, { backgroundColor: T.chip.bg }]}>
              <Text style={[styles.chipText, { color: T.chip.text }]}>
                Gồm finished
              </Text>
            </View>
          )}
          {(!autoRefresh || refreshSec !== 15) && (
            <View style={[styles.chip, { backgroundColor: T.chip.bg }]}>
              <Text style={[styles.chipText, { color: T.chip.text }]}>
                Auto: {autoRefresh ? `${refreshSec}s` : "Tắt"}
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
});

/* ============ Screen ============ */
export default function LiveMatchesScreen() {
  const T = useThemeTokens();
  const insets = useSafeAreaInsets();
  const bottomSheetRef = useRef(null);
  const searchInputRef = useRef(null);

  const [keyword, setKeyword] = useState("");
  const debouncedKeyword = useDebouncedValue(keyword, 350);

  const [statuses, setStatuses] = useState([...STATUS_OPTIONS]);
  const [excludeFinished, setExcludeFinished] = useState(true);
  const [windowHours, setWindowHours] = useState(8);
  const [page, setPage] = useState(1); // vẫn giữ nhưng BE trả 1 trang
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshSec, setRefreshSec] = useState(15);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  // ép refetch ngay khi submit search (không chờ debounce)
  const submitSearchTick = useRef(0);
  const bumpSubmitTick = () => (submitSearchTick.current += 1);

  // Query args
  const qArgs = useMemo(() => {
    const filteredStatuses = excludeFinished
      ? statuses.filter((s) => s !== "finished")
      : statuses;

    const args = {
      keyword: debouncedKeyword,
      page: page - 1,
      limit: LIMIT,
      statuses: filteredStatuses.join(","), // BE hiện chưa dùng nhưng để đó
      windowMs: windowHours * 3600 * 1000,
      _submitTick: submitSearchTick.current,
    };
    if (!excludeFinished) args.excludeFinished = false;
    return args;
  }, [debouncedKeyword, page, statuses, excludeFinished, windowHours]);

  const { data, isLoading, isFetching, refetch } = useGetLiveMatchesQuery(
    qArgs,
    {
      refetchOnFocus: false,
      refetchOnReconnect: true,
    }
  );

  // chuẩn hoá items theo BE mới
  const items = useMemo(() => {
    const raw = Array.isArray(data?.items) ? data.items : [];
    return raw.map((m) => ({
      ...m,
      matchId: m.matchId || m._id, // để RN keyExtractor dùng được
    }));
  }, [data]);

  const total = data?.count ?? items.length;

  // updatedAgo
  const tick = useTickingAgo();
  const lastFetchRef = useRef(Date.now());
  useEffect(() => {
    if (!isFetching) {
      lastFetchRef.current = Date.now();
      setIsManualRefreshing(false);
    }
  }, [isFetching]);
  const updatedAgoSec = Math.max(
    0,
    Math.floor((tick - lastFetchRef.current) / 1000)
  );

  const activeFilters =
    (statuses.length !== STATUS_OPTIONS.length ? 1 : 0) +
    (excludeFinished ? 0 : 1) +
    (windowHours !== 8 ? 1 : 0) +
    (!autoRefresh || refreshSec !== 15 ? 1 : 0);

  // Auto-refresh — TẮT khi đang focus ô search
  useEffect(() => {
    if (!autoRefresh || searchFocused) return;
    const id = setInterval(() => {
      refetch();
    }, Math.max(5, refreshSec) * 1000);
    return () => clearInterval(id);
  }, [autoRefresh, refreshSec, refetch, searchFocused]);

  const handleOpenFilters = useCallback(() => {
    Keyboard.dismiss();
    bottomSheetRef.current?.expand?.();
  }, []);

  const handleManualRefresh = useCallback(() => {
    setIsManualRefreshing(true);
    refetch();
  }, [refetch]);

  const applyFilters = useCallback((filters) => {
    setStatuses(filters.statuses);
    setExcludeFinished(filters.excludeFinished);
    setWindowHours(filters.windowHours);
    setAutoRefresh(filters.autoRefresh);
    setRefreshSec(filters.refreshSec);
    setPage(1);
    bottomSheetRef.current?.close?.();
  }, []);

  const handlePullToRefresh = useCallback(() => {
    setIsManualRefreshing(true);
    refetch();
  }, [refetch]);

  const renderItem = useCallback(
    ({ item }) => <LiveMatchCard item={item} />,
    []
  );

  const headerEl = useMemo(
    () => (
      <Header
        key="header"
        keyword={keyword}
        setKeyword={(s) => {
          setKeyword(s);
          setPage(1);
        }}
        onOpenFilters={handleOpenFilters}
        onManualRefresh={handleManualRefresh}
        isFetching={isFetching}
        isManualRefreshing={isManualRefreshing}
        activeFilters={activeFilters}
        total={total}
        updatedAgoSec={updatedAgoSec}
        statuses={statuses}
        excludeFinished={excludeFinished}
        windowHours={windowHours}
        autoRefresh={autoRefresh}
        refreshSec={refreshSec}
        searchInputRef={searchInputRef}
        setSearchFocused={setSearchFocused}
        onSubmitSearch={() => {
          bumpSubmitTick();
          refetch();
        }}
      />
    ),
    [
      keyword,
      handleOpenFilters,
      handleManualRefresh,
      isFetching,
      isManualRefreshing,
      activeFilters,
      total,
      updatedAgoSec,
      statuses,
      excludeFinished,
      windowHours,
      autoRefresh,
      refreshSec,
      // intentionally keep searchInputRef/setSearchFocused stable
    ]
  );

  // Skeleton logic: show when initial loading or fetching with no data; hide during manual pull-to-refresh spinner
  const showSkeleton =
    (isLoading || (isFetching && items.length === 0)) && !isManualRefreshing;

  const skeletonEl = useMemo(() => <SkeletonList T={T} />, [T.scheme]);

  const renderEmpty = useCallback(() => {
    return (
      <View style={styles.emptyContainer}>
        <LottieView
          source={require("@/assets/lottie/empty-search.json")}
          autoPlay
          loop
          style={styles.emptyLottie}
        />
        <Text style={[styles.emptyTitle, { color: T.textPrimary }]}>
          Không có trận phù hợp
        </Text>
        <Text style={[styles.emptySubtitle, { color: T.textSecondary }]}>
          Thử điều chỉnh bộ lọc hoặc tìm kiếm khác
        </Text>
      </View>
    );
  }, [T.textPrimary, T.textSecondary]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: T.pageBg }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <FlatList
          data={items}
          keyExtractor={(item) => item.matchId || item._id}
          renderItem={renderItem}
          ListHeaderComponent={headerEl}
          ListFooterComponent={null}
          extraData={T.scheme}
          ListEmptyComponent={showSkeleton ? skeletonEl : renderEmpty}
          onRefresh={handlePullToRefresh}
          refreshing={isManualRefreshing && isFetching}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: Math.max(insets.bottom, 16) + 8 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "on-drag" : "none"}
          onScrollBeginDrag={() => {
            if (Platform.OS === "android") Keyboard.dismiss();
          }}
          removeClippedSubviews={false}
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={10}
          scrollEnabled
        />
      </KeyboardAvoidingView>

      <FiltersBottomSheet
        ref={bottomSheetRef}
        initial={{
          statuses,
          excludeFinished,
          windowHours,
          autoRefresh,
          refreshSec,
        }}
        onApply={applyFilters}
      />
    </SafeAreaView>
  );
}

/* ============ styles ============ */
const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { padding: 12 },
  header: { marginBottom: 16 },

  /* search */
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 12 : 8,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  searchLottie: { width: 20, height: 20, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, padding: 0 },
  clearBtn: { padding: 4, marginLeft: 4 },
  clearBtnText: { fontSize: 18 },

  /* actions */
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 8,
  },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    flex: 1,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  iconText: { fontSize: 18 },
  filterBtnText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: "600",
  },
  refreshBtn: {
    borderWidth: 1,
    padding: 10,
    borderRadius: 10,
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  refreshBtnDisabled: { opacity: 0.6 },

  /* stats + chips */
  statsRow: { marginBottom: 8 },
  statsText: { fontSize: 13, fontWeight: "500" },
  chipsRow: { marginBottom: 0 },
  chipsContent: { paddingRight: 12 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    maxWidth: 220,
  },
  chipText: { fontSize: 12, fontWeight: "500" },

  /* skeleton cards */
  skelCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },

  /* empty */
  emptyContainer: { paddingVertical: 80, alignItems: "center" },
  emptyLottie: { width: 160, height: 160, marginBottom: 16, opacity: 0.9 },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 32,
  },
});
