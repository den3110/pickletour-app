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

import LiveMatchCard from "./LiveMatchCard";
import { useGetLiveMatchesQuery } from "@/slices/liveApiSlice";
import FiltersBottomSheet from "./FiltersModal";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSocket } from "@/context/SocketContext";
import { useSocketRoomSet } from "@/hooks/useSocketRoomSet";

const LIMIT = 12;
const STATUS_OPTIONS = ["scheduled", "queued", "assigned", "live", "finished"];
const REALTIME_REFETCH_MIN_GAP_MS = 1500;

function normalizeTournamentId(value) {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }
  if (typeof value === "object") {
    return String(value?._id || value?.id || "").trim();
  }
  return "";
}

function useThemeTokens() {
  const navTheme = useTheme?.();
  const sysScheme = useColorScheme?.() ?? "light";
  const isDark = typeof navTheme?.dark === "boolean" ? navTheme.dark : sysScheme === "dark";

  return useMemo(
    () => ({
      scheme: isDark ? "dark" : "light",
      tint: navTheme?.colors?.primary ?? (isDark ? "#7cc0ff" : "#0a84ff"),
      textPrimary: navTheme?.colors?.text ?? (isDark ? "#ffffff" : "#0f172a"),
      textSecondary: isDark ? "#d1d1d1" : "#475569",
      placeholder: isDark ? "#9aa4b2" : "#94a3b8",
      pageBg: navTheme?.colors?.background ?? (isDark ? "#0b0c0f" : "#f6f7fb"),
      cardBg: navTheme?.colors?.card ?? (isDark ? "#111214" : "#ffffff"),
      cardBorder: navTheme?.colors?.border ?? (isDark ? "#3a3b40" : "#e5e7eb"),
      chip: {
        bg: isDark ? "rgba(199,210,254,0.16)" : "#e3f2fd",
        text: isDark ? "#e0e7ff" : "#1976d2",
      },
      skeleton: {
        base: isDark ? "#1a1c20" : "#e9eef5",
        shine: isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.55)",
      },
    }),
    [isDark, navTheme]
  );
}

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

const Shimmer = memo(function Shimmer({ style, shineColor }) {
  const translate = useRef(new Animated.Value(-1)).current;
  const widthRef = useRef(300);

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
    <View
      style={[{ overflow: "hidden" }, style]}
      onLayout={(e) => {
        widthRef.current = e.nativeEvent.layout.width || 300;
      }}
    >
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

const SkeletonCard = memo(function SkeletonCard({ T }) {
  return (
    <View style={[styles.skelCard, { backgroundColor: T.cardBg, borderColor: T.cardBorder }]}>
      <View
        style={{
          width: "100%",
          aspectRatio: 16 / 9,
          backgroundColor: T.skeleton.base,
          overflow: "hidden",
        }}
      >
        <Shimmer style={{ flex: 1 }} shineColor={T.skeleton.shine} />
      </View>
      <View style={{ padding: 12 }}>
        <View
          style={{
            width: "60%",
            height: 16,
            backgroundColor: T.skeleton.base,
            borderRadius: 4,
            overflow: "hidden",
          }}
        >
          <Shimmer style={{ flex: 1 }} shineColor={T.skeleton.shine} />
        </View>
        <View
          style={{
            width: "40%",
            height: 12,
            backgroundColor: T.skeleton.base,
            borderRadius: 4,
            marginTop: 8,
            overflow: "hidden",
          }}
        >
          <Shimmer style={{ flex: 1 }} shineColor={T.skeleton.shine} />
        </View>
      </View>
    </View>
  );
});

const Header = memo(function Header({
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
  isBack,
  T,
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerTopRow}>
        {isBack && (
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={T.textPrimary} />
          </TouchableOpacity>
        )}
        <Text style={[styles.headerTitle, { color: T.textPrimary }]}>Trận trực tiếp</Text>
      </View>

      <View style={[styles.searchBar, { backgroundColor: T.cardBg, borderColor: T.cardBorder }]}>
        <Ionicons name="search" size={18} color={T.placeholder} style={{ marginRight: 8 }} />
        <TextInput
          style={[styles.searchInput, { color: T.textPrimary }]}
          value={keyword}
          onChangeText={setKeyword}
          placeholder="Tìm mã trận, sân..."
          placeholderTextColor={T.placeholder}
          returnKeyType="search"
        />
        {keyword.length > 0 && (
          <TouchableOpacity onPress={() => setKeyword("")} style={styles.clearBtn}>
            <Text style={[styles.clearBtnText, { color: T.textSecondary }]}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.filterBtn, { backgroundColor: T.cardBg, borderColor: T.cardBorder }]}
          onPress={onOpenFilters}
        >
          <Text style={[styles.iconText, { color: T.textPrimary }]}>⚙️</Text>
          <Text style={[styles.filterBtnText, { color: T.textPrimary }]}>
            Bộ lọc {activeFilters > 0 ? `(${activeFilters})` : ""}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.refreshBtn, { backgroundColor: T.cardBg, borderColor: T.cardBorder }]}
          onPress={onManualRefresh}
          disabled={isFetching && isManualRefreshing}
        >
          {isFetching && isManualRefreshing ? (
            <ActivityIndicator size="small" color={T.tint} />
          ) : (
            <Text style={[styles.iconText, { color: T.textPrimary }]}>🔄</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.statsRow}>
        <Text style={[styles.statsText, { color: T.textSecondary }]}>
          ▶️ {total} luồng • cập nhật {updatedAgoSec}s trước
        </Text>
      </View>

      {activeFilters > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsRow}
          contentContainerStyle={styles.chipsContent}
        >
          {statuses.length !== STATUS_OPTIONS.length && (
            <View style={[styles.chip, { backgroundColor: T.chip.bg }]}>
              <Text style={[styles.chipText, { color: T.chip.text }]} numberOfLines={1}>
                Trạng thái: {statuses.join(", ")}
              </Text>
            </View>
          )}
          {windowHours !== 8 && (
            <View style={[styles.chip, { backgroundColor: T.chip.bg }]}>
              <Text style={[styles.chipText, { color: T.chip.text }]}>Cửa sổ: {windowHours}h</Text>
            </View>
          )}
          {!excludeFinished && (
            <View style={[styles.chip, { backgroundColor: T.chip.bg }]}>
              <Text style={[styles.chipText, { color: T.chip.text }]}>Gồm finished</Text>
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

export default function LiveMatchesScreen({ isBack = false }) {
  const T = useThemeTokens();
  const insets = useSafeAreaInsets();
  const bottomSheetRef = useRef(null);
  const socket = useSocket();
  const realtimeRefetchTimerRef = useRef(null);
  const lastRealtimeRefetchAtRef = useRef(0);

  const [keyword, setKeyword] = useState("");
  const debouncedKeyword = useDebouncedValue(keyword, 350);

  const [statuses, setStatuses] = useState([...STATUS_OPTIONS]);
  const [excludeFinished, setExcludeFinished] = useState(true);
  const [windowHours, setWindowHours] = useState(8);
  const [page, setPage] = useState(1);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshSec, setRefreshSec] = useState(15);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);

  const qArgs = useMemo(() => {
    const filteredStatuses = excludeFinished
      ? statuses.filter((s) => s !== "finished")
      : statuses;

    const args = {
      keyword: debouncedKeyword,
      page,
      limit: LIMIT,
      statuses: filteredStatuses.join(","),
      windowMs: windowHours * 3600 * 1000,
    };
    if (!excludeFinished) args.excludeFinished = false;
    return args;
  }, [debouncedKeyword, page, statuses, excludeFinished, windowHours]);

  const { data, isLoading, isFetching, refetch } = useGetLiveMatchesQuery(qArgs, {
    refetchOnFocus: false,
    refetchOnReconnect: true,
  });

  const items = useMemo(() => {
    const raw = Array.isArray(data?.items) ? data.items : [];
    return raw.map((m) => ({ ...m, matchId: m.matchId || m._id }));
  }, [data?.items]);
  const tournamentRoomIds = useMemo(() => {
    const ids = new Set();

    if (qArgs?.tournamentId) {
      const id = normalizeTournamentId(qArgs.tournamentId);
      if (id) ids.add(id);
    }

    const buckets = Array.isArray(data?.tournaments) ? data.tournaments : [];
    for (const bucket of buckets) {
      const id = normalizeTournamentId(bucket?._id || bucket?.id);
      if (id) ids.add(id);
    }

    for (const item of items) {
      const id = normalizeTournamentId(item?.tournament?._id || item?.tournament);
      if (id) ids.add(id);
    }

    return Array.from(ids);
  }, [data?.tournaments, items, qArgs?.tournamentId]);
  const tournamentRoomIdsKey = useMemo(
    () => tournamentRoomIds.join("|"),
    [tournamentRoomIds]
  );

  const total = data?.count ?? items.length;

  const tick = useTickingAgo();
  const lastFetchRef = useRef(Date.now());
  useEffect(() => {
    if (!isFetching) {
      lastFetchRef.current = Date.now();
      setIsManualRefreshing(false);
    }
  }, [isFetching]);

  const updatedAgoSec = Math.max(0, Math.floor((tick - lastFetchRef.current) / 1000));

  const activeFilters = useMemo(
    () =>
      (statuses.length !== STATUS_OPTIONS.length ? 1 : 0) +
      (excludeFinished ? 0 : 1) +
      (windowHours !== 8 ? 1 : 0) +
      (!autoRefresh || refreshSec !== 15 ? 1 : 0),
    [statuses.length, excludeFinished, windowHours, autoRefresh, refreshSec]
  );

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => refetch(), Math.max(5, refreshSec) * 1000);
    return () => clearInterval(id);
  }, [autoRefresh, refreshSec, refetch]);

  const scheduleRealtimeRefetch = useCallback(
    (delayMs = 250) => {
      const now = Date.now();
      const gapMs = Math.max(
        0,
        REALTIME_REFETCH_MIN_GAP_MS - (now - lastRealtimeRefetchAtRef.current)
      );
      const waitMs = Math.max(delayMs, gapMs);

      if (realtimeRefetchTimerRef.current) return;
      realtimeRefetchTimerRef.current = setTimeout(() => {
        realtimeRefetchTimerRef.current = null;
        lastRealtimeRefetchAtRef.current = Date.now();
        refetch();
      }, waitMs);
    },
    [refetch]
  );

  useEffect(
    () => () => {
      if (realtimeRefetchTimerRef.current) {
        clearTimeout(realtimeRefetchTimerRef.current);
        realtimeRefetchTimerRef.current = null;
      }
    },
    []
  );

  useSocketRoomSet(socket, tournamentRoomIds, {
    subscribeEvent: "tournament:subscribe",
    unsubscribeEvent: "tournament:unsubscribe",
    payloadKey: "tournamentId",
  });

  useEffect(() => {
    if (!socket) return;

    const onTournamentMatchUpdate = (payload = {}) => {
      const type = String(payload?.type || "").trim().toLowerCase();
      if (type.startsWith("score:") || type.startsWith("serve:")) return;

      const tournamentId = normalizeTournamentId(
        payload?.tournamentId ||
          payload?.data?.tournament?._id ||
          payload?.data?.tournament
      );
      if (
        tournamentId &&
        tournamentRoomIds.length > 0 &&
        !tournamentRoomIds.includes(tournamentId)
      ) {
        return;
      }

      scheduleRealtimeRefetch();
    };

    const onTournamentInvalidate = (payload = {}) => {
      const tournamentId = normalizeTournamentId(payload?.tournamentId);
      if (
        tournamentId &&
        tournamentRoomIds.length > 0 &&
        !tournamentRoomIds.includes(tournamentId)
      ) {
        return;
      }
      scheduleRealtimeRefetch(150);
    };

    const onConnect = () => {
      if (tournamentRoomIds.length > 0) {
        scheduleRealtimeRefetch(150);
      }
    };

    socket.on("tournament:match:update", onTournamentMatchUpdate);
    socket.on("tournament:invalidate", onTournamentInvalidate);
    socket.on("connect", onConnect);

    return () => {
      socket.off("tournament:match:update", onTournamentMatchUpdate);
      socket.off("tournament:invalidate", onTournamentInvalidate);
      socket.off("connect", onConnect);
    };
  }, [socket, scheduleRealtimeRefetch, tournamentRoomIds, tournamentRoomIdsKey]);

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

  const renderItem = useCallback(({ item }) => <LiveMatchCard item={item} />, []);

  const keyExtractor = useCallback((item) => item.matchId || item._id, []);

  const headerEl = useMemo(
    () => (
      <Header
        keyword={keyword}
        setKeyword={setKeyword}
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
        isBack={isBack}
        T={T}
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
      isBack,
      T,
    ]
  );

  const showSkeleton = (isLoading || (isFetching && items.length === 0)) && !isManualRefreshing;

  const skeletonEl = useMemo(
    () => (
      <View>
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} T={T} />
        ))}
      </View>
    ),
    [T]
  );

  const renderEmpty = useCallback(
    () => (
      <View style={styles.emptyContainer}>
        <Text style={[styles.emptyTitle, { color: T.textPrimary }]}>Không có trận phù hợp</Text>
        <Text style={[styles.emptySubtitle, { color: T.textSecondary }]}>
          Thử điều chỉnh bộ lọc hoặc tìm kiếm khác
        </Text>
      </View>
    ),
    [T.textPrimary, T.textSecondary]
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: T.pageBg }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <FlatList
          data={items}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ListHeaderComponent={headerEl}
          ListEmptyComponent={showSkeleton ? skeletonEl : renderEmpty}
          onRefresh={handlePullToRefresh}
          refreshing={isManualRefreshing && isFetching}
          contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={true}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={10}
        />
      </KeyboardAvoidingView>

      <FiltersBottomSheet
        ref={bottomSheetRef}
        initial={{ statuses, excludeFinished, windowHours, autoRefresh, refreshSec }}
        onApply={applyFilters}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { paddingHorizontal: 12 },
  header: { marginBottom: 16 },
  headerTopRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  backBtn: { paddingRight: 8, paddingVertical: 4, marginRight: 4 },
  headerTitle: { fontSize: 20, fontWeight: "700" },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 12 : 8,
    marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 15, padding: 0 },
  clearBtn: { padding: 4, marginLeft: 4 },
  clearBtnText: { fontSize: 18 },
  actionRow: { flexDirection: "row", alignItems: "center", marginBottom: 12, gap: 8 },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    flex: 1,
    borderWidth: 1,
  },
  iconText: { fontSize: 18 },
  filterBtnText: { marginLeft: 8, fontSize: 14, fontWeight: "600" },
  refreshBtn: {
    borderWidth: 1,
    padding: 10,
    borderRadius: 10,
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  statsRow: { marginBottom: 8 },
  statsText: { fontSize: 13, fontWeight: "500" },
  chipsRow: { marginBottom: 0 },
  chipsContent: { paddingRight: 12 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginRight: 8, maxWidth: 220 },
  chipText: { fontSize: 12, fontWeight: "500" },
  skelCard: { padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
  emptyContainer: { paddingVertical: 80, alignItems: "center" },
  emptyTitle: { fontSize: 18, fontWeight: "600", marginBottom: 8 },
  emptySubtitle: { fontSize: 14, textAlign: "center", paddingHorizontal: 32 },
});
