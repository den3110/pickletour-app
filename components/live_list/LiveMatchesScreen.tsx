import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import LiveMatchesFeed from "./LiveMatchesFeed";
import LiveMatchCard from "./LiveMatchCard";
import ResponsiveMatchViewer from "@/components/match/ResponsiveMatchViewer";
import {
  useGetLiveClusterQuery,
  useGetLiveClustersQuery,
  useGetLiveMatchesQuery,
} from "@/slices/liveApiSlice";
import {
  buildStationSearchText,
  getLiveMatchSubtitle,
  getLiveMatchTitle,
  getLiveStatusLabel,
  groupMatchesByTournament,
  mergeUniqueMatches,
  sid,
} from "./liveUtils";

const SEGMENTS = [
  { key: "clusters", label: "Cụm sân", icon: "apps-outline" },
  { key: "live", label: "Đang phát", icon: "radio-outline" },
  { key: "archive", label: "Đã live", icon: "albums-outline" },
];
const ARCHIVE_LIMIT = 12;

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
    heroStart: isDark ? "#14332d" : "#fff1da",
    heroEnd: isDark ? "#0d1f1b" : "#dff6ef",
    highlight: isDark ? "rgba(110,231,216,0.14)" : "rgba(15,118,110,0.1)",
  };
}

function useDebouncedValue(value: string, delay = 320) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [delay, value]);
  return debounced;
}

export default function LiveMatchesScreen({ isBack = false }: { isBack?: boolean }) {
  const T = useThemeTokens();
  const [segment, setSegment] = useState("clusters");
  const [selectedClusterId, setSelectedClusterId] = useState("");
  const [selectedStation, setSelectedStation] = useState<any>(null);

  const {
    data: clusters = [],
    isFetching: isFetchingClusters,
    refetch: refetchClusters,
  } = useGetLiveClustersQuery(undefined, {
    pollingInterval: 15000,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  const {
    data: clusterDetail,
    isFetching: isFetchingCluster,
    refetch: refetchCluster,
  } = useGetLiveClusterQuery(selectedClusterId, {
    skip: !selectedClusterId,
    pollingInterval: 5000,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  useEffect(() => {
    if (!clusters.length) {
      setSelectedClusterId("");
      return;
    }

    setSelectedClusterId((prev) =>
      prev && clusters.some((cluster: any) => sid(cluster) === prev) ? prev : sid(clusters[0])
    );
  }, [clusters]);

  useEffect(() => {
    if (!selectedStation) return;
    const stations = Array.isArray(clusterDetail?.stations) ? clusterDetail.stations : [];
    const refreshed = stations.find((station: any) => sid(station) === sid(selectedStation));
    if (refreshed) setSelectedStation(refreshed);
  }, [clusterDetail?.stations, selectedStation]);

  const selectedCluster = useMemo(
    () => clusters.find((cluster: any) => sid(cluster) === selectedClusterId) || null,
    [clusters, selectedClusterId]
  );

  const totalStations = useMemo(
    () => clusters.reduce((sum: number, cluster: any) => sum + Number(cluster?.stationsCount || 0), 0),
    [clusters]
  );
  const totalLiveStations = useMemo(
    () => clusters.reduce((sum: number, cluster: any) => sum + Number(cluster?.liveCount || 0), 0),
    [clusters]
  );
  const heroSubtitle = useMemo(() => {
    if (segment === "clusters") {
      return "Chọn cụm sân và theo dõi đúng sân vật lý đang lên sóng, giống luồng xem trên web.";
    }
    if (segment === "live") {
      return "Theo dõi luồng đang phát, trận sắp vào sân và các thay đổi được đẩy gần như thời gian thực.";
    }
    return "Lọc theo giải đấu để xem lại các trận đã phát có video hoặc stream công khai.";
  }, [segment]);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: T.pageBg }]} edges={["top", "left", "right"]}>
      <View style={styles.chrome}>
        <LinearGradient
          colors={[T.heroStart, T.heroEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { borderColor: T.border }]}
        >
          <View style={styles.heroTopRow}>
            <View style={styles.heroTitleWrap}>
              {isBack ? (
                <TouchableOpacity
                  onPress={() => router.back()}
                  style={[styles.backBtn, { backgroundColor: T.highlight, borderColor: T.border }]}
                >
                  <Ionicons name="chevron-back" size={18} color={T.textPrimary} />
                </TouchableOpacity>
              ) : null}
              <View style={{ flex: 1 }}>
                <Text style={[styles.eyebrow, { color: T.tint }]}>PickleTour Live</Text>
                <Text style={[styles.heroTitle, { color: T.textPrimary }]}>Hub xem live trên app</Text>
              </View>
            </View>
          </View>

          <Text style={[styles.heroSubtitle, { color: T.textSecondary }]}>{heroSubtitle}</Text>

          <View style={styles.heroStats}>
            <HeroStat label="Cụm mở" value={String(clusters.length)} T={T} />
            <HeroStat label="Sân đang live" value={String(totalLiveStations)} T={T} />
            <HeroStat label="Sân có nội dung" value={String(totalStations)} T={T} />
          </View>
        </LinearGradient>

        <View style={[styles.segmentWrap, { backgroundColor: T.softBg, borderColor: T.border }]}>
          {SEGMENTS.map((item) => {
            const active = item.key === segment;
            return (
              <TouchableOpacity
                key={item.key}
                onPress={() => setSegment(item.key)}
                style={[
                  styles.segmentBtn,
                  {
                    backgroundColor: active ? T.cardBg : "transparent",
                    borderColor: active ? T.border : "transparent",
                  },
                ]}
              >
                <Ionicons
                  name={item.icon as any}
                  size={16}
                  color={active ? T.textPrimary : T.textSecondary}
                />
                <Text
                  style={[
                    styles.segmentText,
                    { color: active ? T.textPrimary : T.textSecondary },
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.body}>
        {segment === "clusters" ? (
          <LiveClustersPane
            T={T}
            clusters={clusters}
            selectedClusterId={selectedClusterId}
            selectedCluster={selectedCluster}
            clusterDetail={clusterDetail}
            isFetchingClusters={isFetchingClusters}
            isFetchingCluster={isFetchingCluster}
            onSelectCluster={setSelectedClusterId}
            onRefresh={() => {
              refetchClusters();
              if (selectedClusterId) refetchCluster();
            }}
            onOpenStation={setSelectedStation}
          />
        ) : null}

        {segment === "live" ? <LiveMatchesFeed /> : null}

        {segment === "archive" ? <LiveArchivePane T={T} /> : null}
      </View>

      <ResponsiveMatchViewer
        open={Boolean(selectedStation)}
        matchId={selectedStation?.currentMatch?._id || ""}
        onClose={() => setSelectedStation(null)}
      />
    </SafeAreaView>
  );
}

function LiveClustersPane({
  T,
  clusters,
  selectedClusterId,
  selectedCluster,
  clusterDetail,
  isFetchingClusters,
  isFetchingCluster,
  onSelectCluster,
  onRefresh,
  onOpenStation,
}: any) {
  const [keyword, setKeyword] = useState("");

  const stations = useMemo(() => {
    const base = Array.isArray(clusterDetail?.stations)
      ? clusterDetail.stations
      : Array.isArray(selectedCluster?.stations)
      ? selectedCluster.stations
      : [];

    const query = String(keyword || "").trim().toLowerCase();
    if (!query) return base;
    return base.filter((station: any) => buildStationSearchText(station).includes(query));
  }, [clusterDetail?.stations, keyword, selectedCluster?.stations]);

  const summary = useMemo(() => {
    const total = stations.length;
    const live = stations.filter((station: any) => String(station?.status || "").toLowerCase() === "live").length;
    const active = stations.filter((station: any) => Boolean(station?.currentMatch)).length;
    return { total, live, active };
  }, [stations]);
  const refreshing = isFetchingClusters || isFetchingCluster;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.sectionHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.sectionTitle, { color: T.textPrimary }]}>Live theo cụm sân</Text>
          <Text style={[styles.sectionText, { color: T.textSecondary }]}>
            Chạm vào một sân để mở viewer bám theo sân đó. Khi trận đổi trên sân, viewer sẽ đi cùng trận mới.
          </Text>
        </View>
        {refreshing ? <ActivityIndicator color={T.tint} /> : null}
      </View>

      <View style={[styles.searchBar, { backgroundColor: T.cardBg, borderColor: T.border }]}>
        <Ionicons name="search" size={18} color={T.textSecondary} />
        <TextInput
          value={keyword}
          onChangeText={setKeyword}
          placeholder="Tìm theo sân, mã trận hoặc giải..."
          placeholderTextColor={T.textSecondary}
          style={[styles.searchInput, { color: T.textPrimary }]}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.clusterRail}>
        {clusters.map((cluster: any) => {
          const active = sid(cluster) === selectedClusterId;
          return (
            <TouchableOpacity
              key={sid(cluster)}
              onPress={() => onSelectCluster(sid(cluster))}
              style={[
                styles.clusterCard,
                {
                  backgroundColor: active ? T.cardBg : T.softBg,
                  borderColor: active ? T.tint : T.border,
                },
              ]}
            >
              <Text style={[styles.clusterName, { color: T.textPrimary }]} numberOfLines={1}>
                {cluster?.name || "Cụm sân"}
              </Text>
              <Text style={[styles.clusterVenue, { color: T.textSecondary }]} numberOfLines={2}>
                {cluster?.venueName || cluster?.description || "Cụm sân PickleTour"}
              </Text>
              <View style={styles.clusterMetaRow}>
                <Pill label={`${cluster?.stationsCount || 0} sân`} T={T} />
                <Pill label={`${cluster?.liveCount || 0} live`} tone="accent" T={T} />
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {selectedCluster ? (
        <View style={[styles.summaryCard, { backgroundColor: T.cardBg, borderColor: T.border }]}>
          <View style={styles.summaryHead}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.summaryTitle, { color: T.textPrimary }]}>
                {clusterDetail?.cluster?.name || selectedCluster?.name}
              </Text>
              <Text style={[styles.summaryText, { color: T.textSecondary }]}>
                {clusterDetail?.cluster?.venueName ||
                  selectedCluster?.venueName ||
                  clusterDetail?.cluster?.description ||
                  selectedCluster?.description ||
                  "Không có mô tả"}
              </Text>
            </View>
            <View style={styles.summaryBadges}>
              <Pill label={`${summary.total} sân`} T={T} />
              <Pill label={`${summary.live} live`} tone="accent" T={T} />
              <Pill label={`${summary.active} có trận`} T={T} />
            </View>
          </View>
        </View>
      ) : null}

      {stations.length === 0 ? (
        <View style={[styles.emptyBox, { backgroundColor: T.cardBg, borderColor: T.border }]}>
          <Ionicons name="tv-outline" size={34} color={T.textSecondary} />
          <Text style={[styles.emptyTitle, { color: T.textPrimary }]}>
            {keyword ? "Không tìm thấy sân phù hợp" : "Cụm này chưa có sân sẵn sàng"}
          </Text>
          <Text style={[styles.emptyText, { color: T.textSecondary }]}>
            {keyword
              ? "Thử đổi từ khóa hoặc chuyển sang cụm sân khác."
              : "Chỉ những sân đang có trận live với video công khai mới xuất hiện ở đây."}
          </Text>
        </View>
      ) : (
        stations.map((station: any) => (
          <TouchableOpacity
            key={sid(station)}
            onPress={() => station?.currentMatch && onOpenStation(station)}
            activeOpacity={station?.currentMatch ? 0.9 : 1}
            style={[styles.stationCard, { backgroundColor: T.cardBg, borderColor: T.border }]}
          >
            <View style={styles.stationHead}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.stationTitle, { color: T.textPrimary }]}>
                  {station?.name || station?.code || "Sân"}
                </Text>
                <Text style={[styles.stationCode, { color: T.textSecondary }]}>
                  {station?.code || sid(station)}
                </Text>
              </View>
              <Pill
                label={String(station?.status || "").toLowerCase() === "live" ? "Live" : getLiveStatusLabel(station?.status)}
                tone={String(station?.status || "").toLowerCase() === "live" ? "accent" : "default"}
                T={T}
              />
            </View>

            {station?.currentMatch ? (
              <>
                <Text style={[styles.stationMatchTitle, { color: T.textPrimary }]}>
                  {getLiveMatchTitle(station.currentMatch)}
                </Text>
                <Text style={[styles.stationMatchSubtitle, { color: T.textSecondary }]}>
                  {getLiveMatchSubtitle(station.currentMatch)}
                </Text>
                <View style={styles.stationFooter}>
                  <View style={[styles.viewerBtn, { backgroundColor: T.tint }]}>
                    <Ionicons name="play-circle-outline" size={18} color="#ffffff" />
                    <Text style={styles.viewerBtnText}>Xem sân này</Text>
                  </View>
                </View>
              </>
            ) : (
              <Text style={[styles.stationMatchSubtitle, { color: T.textSecondary }]}>
                Sân này hiện chưa có trận để xem.
              </Text>
            )}
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

function LiveArchivePane({ T }: any) {
  const [keyword, setKeyword] = useState("");
  const [archiveTournamentId, setArchiveTournamentId] = useState("all");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<any[]>([]);
  const debouncedKeyword = useDebouncedValue(keyword, 320);

  useEffect(() => {
    setPage(1);
    setItems([]);
  }, [archiveTournamentId, debouncedKeyword]);

  const queryArgs = useMemo(
    () => ({
      statuses: "finished",
      excludeFinished: false,
      all: true,
      keyword: debouncedKeyword,
      tournamentId: archiveTournamentId === "all" ? "" : archiveTournamentId,
      page,
      limit: ARCHIVE_LIMIT,
    }),
    [archiveTournamentId, debouncedKeyword, page]
  );

  const {
    data,
    isLoading,
    isFetching,
    refetch,
  } = useGetLiveMatchesQuery(queryArgs, {
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  useEffect(() => {
    const nextItems = Array.isArray(data?.items) ? data.items : [];
    setItems((current) => (page === 1 ? nextItems : mergeUniqueMatches(current, nextItems)));
  }, [data?.items, page]);

  const archiveTournaments = useMemo(() => {
    const raw = Array.isArray(data?.tournaments) ? data.tournaments : [];
    return [{ _id: "all", name: "Tất cả giải", count: data?.count || 0 }, ...raw];
  }, [data?.count, data?.tournaments]);

  const archiveGroups = useMemo(() => groupMatchesByTournament(items), [items]);
  const pages = Math.max(1, Number(data?.pages || 1));
  const count = Number(data?.count || 0);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isFetching && page === 1}
          onRefresh={() => {
            setPage(1);
            setItems([]);
            refetch();
          }}
        />
      }
    >
      <View style={styles.sectionHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.sectionTitle, { color: T.textPrimary }]}>Kho trận đã live</Text>
          <Text style={[styles.sectionText, { color: T.textSecondary }]}>
            Lọc theo giải đấu hoặc tìm trực tiếp theo mã trận để mở lại đúng video đã phát.
          </Text>
        </View>
        {isFetching ? <ActivityIndicator color={T.tint} /> : null}
      </View>

      <View style={[styles.searchBar, { backgroundColor: T.cardBg, borderColor: T.border }]}>
        <Ionicons name="search" size={18} color={T.textSecondary} />
        <TextInput
          value={keyword}
          onChangeText={setKeyword}
          placeholder="Tìm theo mã trận hoặc tên giải..."
          placeholderTextColor={T.textSecondary}
          style={[styles.searchInput, { color: T.textPrimary }]}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.clusterRail}>
        {archiveTournaments.map((tournament: any) => {
          const active = archiveTournamentId === sid(tournament?._id);
          return (
            <TouchableOpacity
              key={sid(tournament?._id)}
              onPress={() => setArchiveTournamentId(sid(tournament?._id))}
              style={[
                styles.filterTab,
                {
                  backgroundColor: active ? T.cardBg : T.softBg,
                  borderColor: active ? T.tint : T.border,
                },
              ]}
            >
              <Text style={[styles.filterTabText, { color: T.textPrimary }]}>
                {tournament?.name || "Không rõ giải"}
              </Text>
              <Text style={[styles.filterTabCount, { color: T.textSecondary }]}>
                {tournament?.count || 0} trận
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={[styles.summaryCard, { backgroundColor: T.cardBg, borderColor: T.border }]}>
        <View style={styles.summaryHead}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.summaryTitle, { color: T.textPrimary }]}>Các trận đã từng lên sóng</Text>
            <Text style={[styles.summaryText, { color: T.textSecondary }]}>
              Hiện có {count} trận có thể xem lại trong bộ lọc đang chọn.
            </Text>
          </View>
          <Pill label={`Trang ${page}/${pages}`} T={T} />
        </View>
      </View>

      {isLoading && items.length === 0 ? (
        <View style={[styles.emptyBox, { backgroundColor: T.cardBg, borderColor: T.border }]}>
          <ActivityIndicator color={T.tint} />
          <Text style={[styles.emptyTitle, { color: T.textPrimary }]}>Đang tải archive</Text>
          <Text style={[styles.emptyText, { color: T.textSecondary }]}>
            Hệ thống đang gom các trận đã live và nguồn xem lại.
          </Text>
        </View>
      ) : archiveGroups.length === 0 ? (
        <View style={[styles.emptyBox, { backgroundColor: T.cardBg, borderColor: T.border }]}>
          <Ionicons name="archive-outline" size={34} color={T.textSecondary} />
          <Text style={[styles.emptyTitle, { color: T.textPrimary }]}>Chưa có trận phù hợp</Text>
          <Text style={[styles.emptyText, { color: T.textSecondary }]}>
            Thử xóa từ khóa tìm kiếm hoặc chuyển sang giải đấu khác.
          </Text>
        </View>
      ) : (
        archiveGroups.map((group: any) => (
          <View key={group.key} style={styles.archiveGroup}>
            <Text style={[styles.archiveGroupTitle, { color: T.textPrimary }]}>
              {group?.tournament?.name || "Không rõ giải"}
            </Text>
            {group.items.map((item: any) => (
              <LiveMatchCard key={sid(item?._id || item?.matchId)} item={item} />
            ))}
          </View>
        ))
      )}

      {page < pages ? (
        <TouchableOpacity
          onPress={() => setPage((current) => current + 1)}
          style={[styles.loadMoreBtn, { backgroundColor: T.cardBg, borderColor: T.border }]}
        >
          {isFetching && page > 1 ? (
            <ActivityIndicator color={T.tint} />
          ) : (
            <>
              <Ionicons name="chevron-down-outline" size={18} color={T.textPrimary} />
              <Text style={[styles.loadMoreText, { color: T.textPrimary }]}>Tải thêm trận đã live</Text>
            </>
          )}
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}

function HeroStat({ label, value, T }: any) {
  return (
    <View style={[styles.heroStat, { backgroundColor: T.highlight, borderColor: T.border }]}>
      <Text style={[styles.heroStatLabel, { color: T.textSecondary }]}>{label}</Text>
      <Text style={[styles.heroStatValue, { color: T.textPrimary }]}>{value}</Text>
    </View>
  );
}

function Pill({ label, tone = "default", T }: any) {
  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: tone === "accent" ? T.highlight : T.softBg,
          borderColor: tone === "accent" ? T.tint : T.border,
        },
      ]}
    >
      <Text style={[styles.pillText, { color: T.textPrimary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  chrome: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 12,
  },
  hero: {
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 14,
  },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  heroTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: "800",
  },
  heroSubtitle: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "500",
  },
  heroStats: {
    flexDirection: "row",
    gap: 10,
  },
  heroStat: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  heroStatLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 5,
  },
  heroStatValue: {
    fontSize: 18,
    fontWeight: "800",
  },
  segmentWrap: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 6,
    flexDirection: "row",
    gap: 6,
  },
  segmentBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: "800",
  },
  body: {
    flex: 1,
    marginTop: 6,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 28,
    gap: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 6,
  },
  sectionText: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "500",
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
  clusterRail: {
    gap: 10,
    paddingRight: 6,
  },
  clusterCard: {
    width: 220,
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  clusterName: {
    fontSize: 16,
    fontWeight: "800",
  },
  clusterVenue: {
    fontSize: 12,
    lineHeight: 18,
    minHeight: 36,
  },
  clusterMetaRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  pill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  pillText: {
    fontSize: 12,
    fontWeight: "800",
  },
  summaryCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
  },
  summaryHead: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 4,
  },
  summaryText: {
    fontSize: 13,
    lineHeight: 19,
  },
  summaryBadges: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  emptyBox: {
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 34,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "800",
    marginTop: 12,
    marginBottom: 6,
    textAlign: "center",
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },
  stationCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  stationHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  stationTitle: {
    fontSize: 17,
    fontWeight: "800",
    marginBottom: 4,
  },
  stationCode: {
    fontSize: 12,
    fontWeight: "600",
  },
  stationMatchTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  stationMatchSubtitle: {
    fontSize: 13,
    lineHeight: 19,
  },
  stationFooter: {
    flexDirection: "row",
  },
  viewerBtn: {
    minHeight: 44,
    borderRadius: 16,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  viewerBtnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
  filterTab: {
    minWidth: 148,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 4,
  },
  filterTabCount: {
    fontSize: 12,
    fontWeight: "600",
  },
  archiveGroup: {
    gap: 12,
  },
  archiveGroupTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  loadMoreBtn: {
    minHeight: 50,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  loadMoreText: {
    fontSize: 14,
    fontWeight: "800",
  },
});
