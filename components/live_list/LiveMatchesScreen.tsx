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
  StatusBar,
  Platform,
  Keyboard,
  ActivityIndicator,
  SafeAreaView,
  KeyboardAvoidingView,
  useColorScheme,
} from "react-native";
import LiveMatchCard from "./LiveMatchCard";
import { useGetLiveMatchesQuery } from "@/slices/liveApiSlice";
import FiltersBottomSheet from "./FiltersModal";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@react-navigation/native";

const LIMIT = 12;
const STATUS_OPTIONS = ["scheduled", "queued", "assigned", "live", "finished"];

/* ============================
 * THEME TOKENS (light/dark)
 * ============================ */
function useThemeTokens() {
  // Ưu tiên theme từ react-navigation, fallback hệ thống
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
  };
}

// ===== utilities =====
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

// ===== Header (memo) =====
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
        <Text style={[styles.searchIcon, { color: T.textSecondary }]}>🔍</Text>
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
  const [page, setPage] = useState(1);
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
      statuses: filteredStatuses.join(","),
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

  // Auto-refresh — TẮT khi đang focus ô search
  useEffect(() => {
    if (!autoRefresh || searchFocused) return;
    const id = setInterval(() => {
      refetch();
    }, Math.max(5, refreshSec) * 1000);
    return () => clearInterval(id);
  }, [autoRefresh, refreshSec, refetch, searchFocused]);

  const items = data?.items || [];
  const total = data?.rawCount ?? 0;
  const pages = data?.pages || 1;

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
    ]
  );

  const footerEl = useMemo(() => {
    if (pages <= 1) return null;
    return (
      <View style={styles.pagination}>
        <TouchableOpacity
          style={[
            styles.pageBtn,
            { backgroundColor: T.cardBg, borderColor: T.cardBorder },
            page <= 1 && styles.pageBtnDisabled,
          ]}
          onPress={() => {
            Keyboard.dismiss();
            setPage((p) => Math.max(1, p - 1));
          }}
          disabled={page <= 1}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.pageBtnText,
              { color: T.tint },
              page <= 1 && { color: T.textSecondary },
            ]}
          >
            ← Trước
          </Text>
        </TouchableOpacity>

        <View style={styles.pageInfo}>
          <Text style={[styles.pageText, { color: T.textPrimary }]}>
            {page}
          </Text>
          <Text style={[styles.pageTextSeparator, { color: T.textSecondary }]}>
            /
          </Text>
          <Text style={[styles.pageTextTotal, { color: T.textSecondary }]}>
            {pages}
          </Text>
        </View>

        <TouchableOpacity
          style={[
            styles.pageBtn,
            { backgroundColor: T.cardBg, borderColor: T.cardBorder },
            page >= pages && styles.pageBtnDisabled,
          ]}
          onPress={() => {
            Keyboard.dismiss();
            setPage((p) => Math.min(pages, p + 1));
          }}
          disabled={page >= pages}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.pageBtnText,
              { color: T.tint },
              page >= pages && { color: T.textSecondary },
            ]}
          >
            Sau →
          </Text>
        </TouchableOpacity>
      </View>
    );
  }, [page, pages, T.scheme, T.cardBg, T.cardBorder, T.tint, T.textSecondary, T.textPrimary]);

  const renderEmpty = useCallback(
    () => (
      <View style={styles.emptyContainer}>
        <Text style={[styles.emptyIcon, { color: T.textSecondary }]}>🔍</Text>
        <Text style={[styles.emptyTitle, { color: T.textPrimary }]}>
          Không có trận phù hợp
        </Text>
        <Text style={[styles.emptySubtitle, { color: T.textSecondary }]}>
          Thử điều chỉnh bộ lọc hoặc tìm kiếm khác
        </Text>
      </View>
    ),
    [T.textPrimary, T.textSecondary]
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: T.pageBg }]}>
      {/* <StatusBar
        barStyle={T.scheme === "dark" ? "light-content" : "dark-content"}
        backgroundColor={T.pageBg}
      /> */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <FlatList
          data={items}
          keyExtractor={(item) => item.matchId}
          renderItem={renderItem}
          ListHeaderComponent={headerEl}
          ListFooterComponent={footerEl}
          extraData={T.scheme}
          ListEmptyComponent={!isLoading && renderEmpty}
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
  searchIcon: { fontSize: 18, marginRight: 8 },
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

  /* pagination */
  pagination: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  pageBtn: {
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    minWidth: 90,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  pageBtnDisabled: { opacity: 0.4 },
  pageBtnText: {
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  pageInfo: { flexDirection: "row", alignItems: "baseline" },
  pageText: { fontSize: 18, fontWeight: "700" },
  pageTextSeparator: { fontSize: 14, marginHorizontal: 4 },
  pageTextTotal: { fontSize: 14, fontWeight: "500" },

  /* empty */
  emptyContainer: { paddingVertical: 80, alignItems: "center" },
  emptyIcon: { fontSize: 48, marginBottom: 16, opacity: 0.5 },
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
