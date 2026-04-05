import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme,
} from "react-native";
import { useTheme } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import FiltersBottomSheet from "./FiltersModal";
import LiveMatchCard from "./LiveMatchCard";
import { useGetLiveMatchesQuery } from "@/slices/liveApiSlice";
import { useSocket } from "@/context/SocketContext";
import { useSocketRoomSet } from "@/hooks/useSocketRoomSet";
import { sid } from "./liveUtils";

const LIMIT = 24;
const STATUS_OPTIONS = ["scheduled", "queued", "assigned", "live", "finished"];
const DEFAULT_STATUSES = ["scheduled", "queued", "assigned", "live"];
const DEFAULT_FILTERS = {
  statuses: DEFAULT_STATUSES,
  excludeFinished: true,
  windowHours: 24,
  autoRefresh: true,
  refreshSec: 15,
};
const REALTIME_REFETCH_MIN_GAP_MS = 1500;

function useThemeTokens() {
  const navTheme = useTheme?.();
  const sysScheme = useColorScheme?.() ?? "light";
  const isDark = typeof navTheme?.dark === "boolean" ? navTheme.dark : sysScheme === "dark";

  return {
    isDark,
    tint: navTheme?.colors?.primary ?? (isDark ? "#6ee7d8" : "#0f766e"),
    textPrimary: navTheme?.colors?.text ?? (isDark ? "#ffffff" : "#102a26"),
    textSecondary: isDark ? "#b8c4c2" : "#5b6f6a",
    pageBg: navTheme?.colors?.background ?? (isDark ? "#091513" : "#f5f3ec"),
    cardBg: navTheme?.colors?.card ?? (isDark ? "#10201d" : "#fffdf8"),
    border: navTheme?.colors?.border ?? (isDark ? "#25423d" : "#d9e7e2"),
    softBg: isDark ? "#17312d" : "#eef6f3",
  };
}

function useTickingAgo() {
  const [ts, setTs] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return ts;
}

function useDebouncedValue(value: string, delay = 320) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [delay, value]);
  return debounced;
}

function FeedSkeleton({ T }: any) {
  return (
    <View style={styles.skeletonWrap}>
      {Array.from({ length: 3 }).map((_, index) => (
        <View
          key={index}
          style={[
            styles.skeletonCard,
            {
              backgroundColor: T.cardBg,
              borderColor: T.border,
            },
          ]}
        >
          <View style={[styles.skeletonMedia, { backgroundColor: T.softBg }]} />
          <View style={styles.skeletonBody}>
            <View style={[styles.skeletonLineLg, { backgroundColor: T.softBg }]} />
            <View style={[styles.skeletonLineSm, { backgroundColor: T.softBg }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const LiveMatchesFeed = memo(function LiveMatchesFeed() {
  const T = useThemeTokens();
  const insets = useSafeAreaInsets();
  const bottomSheetRef = useRef<any>(null);
  const socket = useSocket();
  const realtimeRefetchTimerRef = useRef<any>(null);
  const lastRealtimeRefetchAtRef = useRef(0);
  const lastFetchRef = useRef(Date.now());

  const [keyword, setKeyword] = useState("");
  const [statuses, setStatuses] = useState([...DEFAULT_STATUSES]);
  const [excludeFinished, setExcludeFinished] = useState(DEFAULT_FILTERS.excludeFinished);
  const [windowHours, setWindowHours] = useState(DEFAULT_FILTERS.windowHours);
  const [autoRefresh, setAutoRefresh] = useState(DEFAULT_FILTERS.autoRefresh);
  const [refreshSec, setRefreshSec] = useState(DEFAULT_FILTERS.refreshSec);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);

  const debouncedKeyword = useDebouncedValue(keyword, 320);

  const queryArgs = useMemo(() => {
    const filteredStatuses = excludeFinished
      ? statuses.filter((status) => status !== "finished")
      : statuses;

    return {
      keyword: debouncedKeyword,
      page: 1,
      limit: LIMIT,
      statuses: filteredStatuses.join(","),
      windowMs: windowHours * 3600 * 1000,
      excludeFinished,
    };
  }, [debouncedKeyword, excludeFinished, statuses, windowHours]);

  const { data, isLoading, isFetching, refetch } = useGetLiveMatchesQuery(queryArgs, {
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  const items = useMemo(() => {
    const raw = Array.isArray(data?.items) ? data.items : [];
    return raw.map((match) => ({ ...match, matchId: match?.matchId || match?._id }));
  }, [data?.items]);

  const tournamentRoomIds = useMemo(() => {
    const ids = new Set<string>();

    const tournamentBuckets = Array.isArray(data?.tournaments) ? data.tournaments : [];
    tournamentBuckets.forEach((bucket) => {
      const key = sid(bucket?._id || bucket?.id);
      if (key) ids.add(key);
    });

    items.forEach((match) => {
      const key = sid(match?.tournament?._id || match?.tournament);
      if (key) ids.add(key);
    });

    return Array.from(ids);
  }, [data?.tournaments, items]);

  useEffect(() => {
    if (!isFetching) {
      lastFetchRef.current = Date.now();
      setIsManualRefreshing(false);
    }
  }, [isFetching]);

  const tick = useTickingAgo();
  const updatedAgoSec = Math.max(0, Math.floor((tick - lastFetchRef.current) / 1000));

  const activeFilters = useMemo(
    () =>
      (statuses.join(",") !== DEFAULT_FILTERS.statuses.join(",") ? 1 : 0) +
      (excludeFinished !== DEFAULT_FILTERS.excludeFinished ? 1 : 0) +
      (windowHours !== DEFAULT_FILTERS.windowHours ? 1 : 0) +
      (autoRefresh !== DEFAULT_FILTERS.autoRefresh ||
      refreshSec !== DEFAULT_FILTERS.refreshSec
        ? 1
        : 0),
    [autoRefresh, excludeFinished, refreshSec, statuses, windowHours]
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
    onResync: () => {
      scheduleRealtimeRefetch(150);
    },
  });

  useEffect(() => {
    if (!socket) return;

    const onTournamentMatchUpdate = (payload: any = {}) => {
      const type = String(payload?.type || "").trim().toLowerCase();
      if (type.startsWith("score:") || type.startsWith("serve:")) return;

      const tournamentId = sid(
        payload?.tournamentId ||
          payload?.data?.tournament?._id ||
          payload?.data?.tournament
      );
      if (tournamentId && tournamentRoomIds.length > 0 && !tournamentRoomIds.includes(tournamentId)) {
        return;
      }

      scheduleRealtimeRefetch();
    };

    const onTournamentInvalidate = (payload: any = {}) => {
      const tournamentId = sid(payload?.tournamentId);
      if (tournamentId && tournamentRoomIds.length > 0 && !tournamentRoomIds.includes(tournamentId)) {
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
  }, [scheduleRealtimeRefetch, socket, tournamentRoomIds]);

  const handleApplyFilters = useCallback((filters: any) => {
    setStatuses(filters?.statuses || [...STATUS_OPTIONS]);
    setExcludeFinished(typeof filters?.excludeFinished === "boolean" ? filters.excludeFinished : true);
    setWindowHours(filters?.windowHours || 24);
    setAutoRefresh(typeof filters?.autoRefresh === "boolean" ? filters.autoRefresh : true);
    setRefreshSec(filters?.refreshSec || 15);
  }, []);

  const handleRefresh = useCallback(() => {
    setIsManualRefreshing(true);
    refetch();
  }, [refetch]);

  const listHeader = useMemo(
    () => (
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: T.textPrimary }]}>Đang phát quanh các sân</Text>
            <Text style={[styles.subtitle, { color: T.textSecondary }]}>
              Theo dõi các trận chuẩn bị vào sân, đã gán sân và đang phát theo thời gian thực.
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleRefresh}
            style={[styles.refreshBtn, { backgroundColor: T.cardBg, borderColor: T.border }]}
          >
            {isFetching && isManualRefreshing ? (
              <ActivityIndicator size="small" color={T.tint} />
            ) : (
              <Ionicons name="refresh" size={18} color={T.textPrimary} />
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.summaryRow}>
          <StatCard label="Luồng hiển thị" value={String(data?.count || items.length)} T={T} />
          <StatCard label="Đang live" value={String(data?.countLive || 0)} T={T} />
          <StatCard label="Cập nhật" value={`${updatedAgoSec}s`} T={T} />
        </View>

        <View style={[styles.searchBar, { backgroundColor: T.cardBg, borderColor: T.border }]}>
          <Ionicons name="search" size={18} color={T.textSecondary} />
          <TextInput
            value={keyword}
            onChangeText={setKeyword}
            placeholder="Tìm theo mã trận, sân hoặc giải..."
            placeholderTextColor={T.textSecondary}
            style={[styles.searchInput, { color: T.textPrimary }]}
            returnKeyType="search"
          />
          {keyword ? (
            <TouchableOpacity onPress={() => setKeyword("")}>
              <Ionicons name="close-circle" size={18} color={T.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            onPress={() => {
              Keyboard.dismiss();
              bottomSheetRef.current?.expand?.();
            }}
            style={[styles.filterBtn, { backgroundColor: T.cardBg, borderColor: T.border }]}
          >
            <Ionicons name="options-outline" size={18} color={T.textPrimary} />
            <Text style={[styles.filterBtnText, { color: T.textPrimary }]}>
              Bộ lọc {activeFilters > 0 ? `(${activeFilters})` : ""}
            </Text>
          </TouchableOpacity>
        </View>

        {activeFilters > 0 ? (
          <View style={styles.chipWrap}>
            {statuses.join(",") !== DEFAULT_FILTERS.statuses.join(",") ? (
              <FilterChip label={`Trạng thái: ${statuses.join(", ")}`} T={T} />
            ) : null}
            {windowHours !== DEFAULT_FILTERS.windowHours ? (
              <FilterChip label={`Khung giờ: ${windowHours}h`} T={T} />
            ) : null}
            {excludeFinished !== DEFAULT_FILTERS.excludeFinished ? (
              <FilterChip label="Có cả trận đã xong" T={T} />
            ) : null}
            {autoRefresh !== DEFAULT_FILTERS.autoRefresh ||
            refreshSec !== DEFAULT_FILTERS.refreshSec ? (
              <FilterChip label={`Tự làm mới: ${autoRefresh ? `${refreshSec}s` : "Tắt"}`} T={T} />
            ) : null}
          </View>
        ) : null}
      </View>
    ),
    [
      T,
      activeFilters,
      data?.count,
      data?.countLive,
      handleRefresh,
      isFetching,
      isManualRefreshing,
      items.length,
      keyword,
      refreshSec,
      statuses,
      updatedAgoSec,
      windowHours,
      excludeFinished,
      autoRefresh,
    ]
  );

  const showSkeleton = (isLoading || (isFetching && items.length === 0)) && !isManualRefreshing;

  return (
    <View style={[styles.container, { backgroundColor: T.pageBg }]}>
      <FlatList
        data={items}
        keyExtractor={(item) => sid(item?.matchId || item?._id)}
        renderItem={({ item }) => <LiveMatchCard item={item} />}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          showSkeleton ? (
            <FeedSkeleton T={T} />
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="videocam-off-outline" size={38} color={T.textSecondary} />
              <Text style={[styles.emptyTitle, { color: T.textPrimary }]}>
                Chưa có trận phù hợp
              </Text>
              <Text style={[styles.emptyText, { color: T.textSecondary }]}>
                Thử nới rộng cửa sổ thời gian hoặc bật thêm trạng thái trong bộ lọc.
              </Text>
            </View>
          )
        }
        refreshing={isManualRefreshing && isFetching}
        onRefresh={handleRefresh}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: Math.max(insets.bottom, 18) + 24,
        }}
        showsVerticalScrollIndicator={false}
      />

      <FiltersBottomSheet
        ref={bottomSheetRef}
        initial={{ statuses, excludeFinished, windowHours, autoRefresh, refreshSec }}
        defaults={DEFAULT_FILTERS}
        onApply={handleApplyFilters}
      />
    </View>
  );
});

function StatCard({ label, value, T }: any) {
  return (
    <View style={[styles.statCard, { backgroundColor: T.cardBg, borderColor: T.border }]}>
      <Text style={[styles.statLabel, { color: T.textSecondary }]}>{label}</Text>
      <Text style={[styles.statValue, { color: T.textPrimary }]}>{value}</Text>
    </View>
  );
}

function FilterChip({ label, T }: any) {
  return (
    <View style={[styles.filterChip, { backgroundColor: T.softBg, borderColor: T.border }]}>
      <Text style={[styles.filterChipText, { color: T.textPrimary }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    marginBottom: 18,
    gap: 14,
  },
  titleRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "500",
  },
  refreshBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryRow: {
    flexDirection: "row",
    gap: 10,
  },
  statCard: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "800",
  },
  searchBar: {
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    minHeight: 52,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  actionsRow: {
    flexDirection: "row",
  },
  filterBtn: {
    minHeight: 44,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
  },
  filterBtnText: {
    fontSize: 14,
    fontWeight: "700",
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
    maxWidth: "100%",
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "700",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 56,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "800",
    marginTop: 14,
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },
  skeletonWrap: {
    gap: 14,
  },
  skeletonCard: {
    borderRadius: 22,
    borderWidth: 1,
    overflow: "hidden",
  },
  skeletonMedia: {
    aspectRatio: 16 / 9,
  },
  skeletonBody: {
    padding: 16,
    gap: 10,
  },
  skeletonLineLg: {
    width: "72%",
    height: 18,
    borderRadius: 9,
  },
  skeletonLineSm: {
    width: "48%",
    height: 12,
    borderRadius: 999,
  },
});

export default LiveMatchesFeed;
