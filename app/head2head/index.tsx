// app/head2head/index.jsx
import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Animated,
  TextInput,
  FlatList,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { Image } from "expo-image";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { useSelector } from "react-redux";
import { normalizeUrl } from "@/utils/normalizeUri";
import { useSearchUserQuery } from "@/slices/usersApiSlice";
import {
  useGetHead2HeadQuery,
  useGetHead2HeadMatchesQuery,
  useGetFrequentOpponentsQuery,
  useGetPlayerStatsQuery,
} from "@/slices/headtoheadApiSlice";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const AVATAR_SIZE = 100;

const H2H_MATCHES_PAGE_SIZE = 10;

/* =========================
 * Animated Stat Bar
 * ========================= */
const AnimatedStatBar = ({
  leftValue,
  rightValue,
  leftColor,
  rightColor,
  label,
  theme,
}) => {
  const animatedWidth = useRef(new Animated.Value(0)).current;
  const total = leftValue + rightValue || 1;
  const leftPercent = (leftValue / total) * 100;

  useEffect(() => {
    Animated.spring(animatedWidth, {
      toValue: leftPercent,
      tension: 50,
      friction: 8,
      useNativeDriver: false,
    }).start();
  }, [leftPercent]);

  const isDark = theme?.dark;

  return (
    <View style={styles.statBarContainer}>
      <Text style={[styles.statBarValue, { color: leftColor }]}>
        {leftValue}
      </Text>
      <View style={styles.statBarMiddle}>
        <Text
          style={[styles.statBarLabel, { color: isDark ? "#888" : "#666" }]}
        >
          {label}
        </Text>
        <View
          style={[
            styles.statBarTrack,
            { backgroundColor: isDark ? "#2a2a2a" : "#e0e0e0" },
          ]}
        >
          <Animated.View
            style={[
              styles.statBarFillLeft,
              {
                backgroundColor: leftColor,
                width: animatedWidth.interpolate({
                  inputRange: [0, 100],
                  outputRange: ["0%", "100%"],
                }),
              },
            ]}
          />
          <View
            style={[
              styles.statBarFillRight,
              { backgroundColor: rightColor, flex: 1 },
            ]}
          />
        </View>
      </View>
      <Text style={[styles.statBarValue, { color: rightColor }]}>
        {rightValue}
      </Text>
    </View>
  );
};

/* =========================
 * VS Badge
 * ========================= */
const VSBadge = () => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scaleAnim, {
            toValue: 1.1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(rotateAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(scaleAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(rotateAnim, {
            toValue: 0,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]),
      ])
    ).start();
  }, []);

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["-5deg", "5deg"],
  });

  return (
    <Animated.View
      style={[
        styles.vsBadge,
        { transform: [{ scale: scaleAnim }, { rotate }] },
      ]}
    >
      <LinearGradient
        colors={["#FF6B6B", "#FF8E53"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.vsBadgeGradient}
      >
        <Text style={styles.vsText}>VS</Text>
      </LinearGradient>
    </Animated.View>
  );
};

/* =========================
 * Player Card
 * ========================= */
const PlayerCard = ({ player, side, onPress, theme, isSelected }) => {
  const isDark = theme?.dark;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.95,
      useNativeDriver: true,
    }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 3,
      useNativeDriver: true,
    }).start();
  };

  const borderColor = side === "left" ? "#4ECDC4" : "#FF6B6B";

  const getScore = (type) => {
    if (!player) return null;
    if (type === "double") {
      return (
        player.double ??
        player.score?.double ??
        player.localRatings?.doubles ??
        null
      );
    }
    return (
      player.single ??
      player.score?.single ??
      player.localRatings?.singles ??
      null
    );
  };

  const doubleScore = getScore("double");
  const singleScore = getScore("single");

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={styles.playerCardWrapper}
    >
      <Animated.View
        style={[styles.playerCard, { transform: [{ scale: scaleAnim }] }]}
      >
        <LinearGradient
          colors={isDark ? ["#1a1a2e", "#16213e"] : ["#ffffff", "#f8f9fa"]}
          style={[
            styles.playerCardInner,
            {
              borderColor: isSelected
                ? borderColor
                : isDark
                ? "#333"
                : "#e0e0e0",
              borderWidth: isSelected ? 2 : 1,
            },
          ]}
        >
          {player ? (
            <>
              <View style={[styles.avatarWrapper, { borderColor }]}>
                <Image
                  source={{ uri: normalizeUrl(player.avatar) }}
                  style={styles.playerAvatar}
                  contentFit="cover"
                  transition={300}
                />
                {player.cccdStatus === "verified" && (
                  <View style={styles.verifiedBadge}>
                    <Ionicons name="checkmark" size={10} color="#fff" />
                  </View>
                )}
              </View>

              <Text
                style={[
                  styles.playerName,
                  { color: isDark ? "#fff" : "#1a1a2e" },
                ]}
                numberOfLines={1}
              >
                {player.nickname || player.name}
              </Text>

              <View style={styles.playerStats}>
                <View style={styles.miniStat}>
                  <Text style={[styles.miniStatValue, { color: borderColor }]}>
                    {doubleScore != null
                      ? Number(doubleScore).toFixed(2)
                      : "---"}
                  </Text>
                  <Text
                    style={[
                      styles.miniStatLabel,
                      { color: isDark ? "#888" : "#666" },
                    ]}
                  >
                    Đôi
                  </Text>
                </View>

                <View
                  style={[
                    styles.statDivider,
                    { backgroundColor: isDark ? "#333" : "#e0e0e0" },
                  ]}
                />

                <View style={styles.miniStat}>
                  <Text style={[styles.miniStatValue, { color: borderColor }]}>
                    {singleScore != null
                      ? Number(singleScore).toFixed(2)
                      : "---"}
                  </Text>
                  <Text
                    style={[
                      styles.miniStatLabel,
                      { color: isDark ? "#888" : "#666" },
                    ]}
                  >
                    Đơn
                  </Text>
                </View>
              </View>
            </>
          ) : (
            <>
              <View style={[styles.avatarPlaceholder, { borderColor }]}>
                <Ionicons name="person-add" size={32} color={borderColor} />
              </View>
              <Text
                style={[
                  styles.selectPlayerText,
                  { color: isDark ? "#888" : "#666" },
                ]}
              >
                Chọn người chơi
              </Text>
            </>
          )}
        </LinearGradient>
      </Animated.View>
    </TouchableOpacity>
  );
};

/* =========================
 * Search Modal
 * ========================= */
const PlayerSearchModal = ({
  visible,
  onClose,
  onSelect,
  theme,
  excludeId,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const isDark = theme?.dark;

  const {
    data: searchResults,
    isLoading,
    isFetching,
  } = useSearchUserQuery(searchQuery, {
    skip: searchQuery.length < 2,
  });

  const filteredResults = useMemo(() => {
    if (!searchResults) return [];
    return searchResults
      .filter((u) => String(u._id) !== String(excludeId))
      .map((u) => ({
        ...u,
        single:
          typeof u.score?.single === "number"
            ? u.score.single
            : u.single ?? null,
        double:
          typeof u.score?.double === "number"
            ? u.score.double
            : u.double ?? null,
      }));
  }, [searchResults, excludeId]);

  if (!visible) return null;

  return (
    <View style={styles.modalOverlay}>
      <BlurView intensity={isDark ? 40 : 20} style={StyleSheet.absoluteFill} />
      <View
        style={[
          styles.modalContent,
          {
            backgroundColor: isDark
              ? "rgba(20,20,30,0.95)"
              : "rgba(255,255,255,0.98)",
          },
        ]}
      >
        <View style={styles.modalHeader}>
          <Text
            style={[styles.modalTitle, { color: isDark ? "#fff" : "#1a1a2e" }]}
          >
            Tìm người chơi
          </Text>
          <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
            <Ionicons name="close" size={24} color={isDark ? "#fff" : "#333"} />
          </TouchableOpacity>
        </View>

        <View
          style={[
            styles.searchInputWrapper,
            { backgroundColor: isDark ? "#1a1a2e" : "#f0f0f0" },
          ]}
        >
          <Ionicons name="search" size={20} color={isDark ? "#888" : "#666"} />
          <TextInput
            style={[styles.searchInput, { color: isDark ? "#fff" : "#1a1a2e" }]}
            placeholder="Nhập tên hoặc nickname..."
            placeholderTextColor={isDark ? "#666" : "#999"}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Ionicons
                name="close-circle"
                size={20}
                color={isDark ? "#666" : "#999"}
              />
            </TouchableOpacity>
          )}
        </View>

        {(isLoading || isFetching) && (
          <ActivityIndicator style={{ marginTop: 20 }} color="#4ECDC4" />
        )}

        <FlatList
          data={filteredResults}
          keyExtractor={(item) => String(item._id)}
          style={styles.searchResultsList}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode={
            Platform.OS === "ios" ? "interactive" : "on-drag"
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.searchResultItem,
                { backgroundColor: isDark ? "#1a1a2e" : "#f8f9fa" },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onSelect(item);
              }}
              activeOpacity={0.7}
            >
              <Image
                source={{ uri: normalizeUrl(item.avatar) }}
                style={styles.searchResultAvatar}
                contentFit="cover"
              />
              <View style={styles.searchResultInfo}>
                <Text
                  style={[
                    styles.searchResultName,
                    { color: isDark ? "#fff" : "#1a1a2e" },
                  ]}
                  numberOfLines={1}
                >
                  {item.nickname || item.name}
                </Text>
                <Text
                  style={[
                    styles.searchResultSub,
                    { color: isDark ? "#888" : "#666" },
                  ]}
                >
                  {item.province || "Chưa có tỉnh/thành"}
                </Text>
              </View>
              <View style={styles.searchResultStats}>
                <Text style={styles.searchResultStatText}>
                  Đôi:{" "}
                  {typeof item.double === "number"
                    ? item.double.toFixed(2)
                    : "---"}
                </Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            searchQuery.length >= 2 && !isLoading && !isFetching ? (
              <View style={styles.emptySearch}>
                <Ionicons
                  name="search-outline"
                  size={48}
                  color={isDark ? "#444" : "#ccc"}
                />
                <Text
                  style={[
                    styles.emptySearchText,
                    { color: isDark ? "#666" : "#999" },
                  ]}
                >
                  Không tìm thấy người chơi
                </Text>
              </View>
            ) : null
          }
        />
      </View>
    </View>
  );
};

/* =========================
 * Match History Item (pressable)
 * ========================= */
const MatchHistoryItem = ({ match, player1Id, theme, onPress }) => {
  const isDark = theme?.dark;
  const isWinner = String(match.winnerId) === String(player1Id);

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={[
        styles.matchHistoryItem,
        { backgroundColor: isDark ? "#1a1a2e" : "#fff" },
      ]}
    >
      <View
        style={[
          styles.matchResultIndicator,
          { backgroundColor: isWinner ? "#4ECDC4" : "#FF6B6B" },
        ]}
      />
      <View style={styles.matchHistoryContent}>
        <View style={styles.matchHistoryHeader}>
          <Text
            style={[
              styles.matchHistoryTitle,
              { color: isDark ? "#fff" : "#1a1a2e" },
            ]}
            numberOfLines={1}
          >
            {match.tournamentName || "Trận giao hữu"}
          </Text>
          <Text
            style={[
              styles.matchHistoryDate,
              { color: isDark ? "#666" : "#999" },
            ]}
          >
            {match?.date
              ? new Date(match.date).toLocaleDateString("vi-VN")
              : ""}
          </Text>
        </View>

        <View style={styles.matchScoreRow}>
          <Text
            style={[
              styles.matchScore,
              { color: isWinner ? "#4ECDC4" : "#FF6B6B" },
            ]}
          >
            {match.score1} - {match.score2}
          </Text>
          <View
            style={[
              styles.matchResultBadge,
              { backgroundColor: isWinner ? "#4ECDC420" : "#FF6B6B20" },
            ]}
          >
            <Text
              style={[
                styles.matchResultText,
                { color: isWinner ? "#4ECDC4" : "#FF6B6B" },
              ]}
            >
              {isWinner ? "THẮNG" : "THUA"}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};

/* =========================
 * Player Stats Card (getPlayerStats)
 * ========================= */
const PlayerStatsCard = ({ title, theme, data, loading }) => {
  const isDark = theme?.dark;

  return (
    <View
      style={[
        styles.playerStatsCard,
        { backgroundColor: isDark ? "#12121a" : "#fff" },
      ]}
    >
      <View style={styles.playerStatsCardHeader}>
        <Text
          style={[
            styles.playerStatsCardTitle,
            { color: isDark ? "#fff" : "#1a1a2e" },
          ]}
        >
          {title}
        </Text>

        {loading ? <ActivityIndicator size="small" color="#4ECDC4" /> : null}
      </View>

      {!loading && data?.stats ? (
        <View style={styles.playerStatsGrid}>
          <View style={styles.playerStatsCell}>
            <Text
              style={[
                styles.playerStatsValue,
                { color: isDark ? "#fff" : "#1a1a2e" },
              ]}
            >
              {data.stats.totalMatches ?? 0}
            </Text>
            <Text
              style={[
                styles.playerStatsLabel,
                { color: isDark ? "#888" : "#666" },
              ]}
            >
              Trận
            </Text>
          </View>

          <View style={styles.playerStatsCell}>
            <Text style={[styles.playerStatsValue, { color: "#4ECDC4" }]}>
              {data.stats.wins ?? 0}
            </Text>
            <Text
              style={[
                styles.playerStatsLabel,
                { color: isDark ? "#888" : "#666" },
              ]}
            >
              Thắng
            </Text>
          </View>

          <View style={styles.playerStatsCell}>
            <Text style={[styles.playerStatsValue, { color: "#FF6B6B" }]}>
              {data.stats.losses ?? 0}
            </Text>
            <Text
              style={[
                styles.playerStatsLabel,
                { color: isDark ? "#888" : "#666" },
              ]}
            >
              Thua
            </Text>
          </View>

          <View style={styles.playerStatsCell}>
            <Text
              style={[
                styles.playerStatsValue,
                { color: isDark ? "#fff" : "#1a1a2e" },
              ]}
            >
              {data.stats.winRate ?? 0}%
            </Text>
            <Text
              style={[
                styles.playerStatsLabel,
                { color: isDark ? "#888" : "#666" },
              ]}
            >
              Win rate
            </Text>
          </View>

          <View style={styles.playerStatsCellWide}>
            <View style={styles.streakRow}>
              <MaterialCommunityIcons
                name="fire"
                size={18}
                color={
                  data?.stats?.currentStreak?.type === "win"
                    ? "#4ECDC4"
                    : "#FF6B6B"
                }
              />
              <Text
                style={[
                  styles.streakText,
                  { color: isDark ? "#fff" : "#1a1a2e" },
                ]}
              >
                Streak:{" "}
                <Text style={{ fontWeight: "900" }}>
                  {data?.stats?.currentStreak?.count ?? 0}
                </Text>{" "}
                ({data?.stats?.currentStreak?.type || "none"})
              </Text>
            </View>
          </View>
        </View>
      ) : loading ? null : (
        <Text
          style={[styles.playerStatsEmpty, { color: isDark ? "#777" : "#888" }]}
        >
          Chưa có dữ liệu thống kê
        </Text>
      )}
    </View>
  );
};

/* =========================
 * Opponent List Section (getFrequentOpponents)
 * ========================= */
const OpponentItem = ({ item, theme, onPress }) => {
  const isDark = theme?.dark;
  const u = item?.user;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={[
        styles.oppItem,
        { backgroundColor: isDark ? "#1a1a2e" : "#f8f9fa" },
      ]}
    >
      <Image
        source={{ uri: normalizeUrl(u?.avatar) }}
        style={styles.oppAvatar}
        contentFit="cover"
      />
      <View style={{ flex: 1 }}>
        <Text
          style={[styles.oppName, { color: isDark ? "#fff" : "#1a1a2e" }]}
          numberOfLines={1}
        >
          {u?.nickname || u?.name || "Unknown"}
        </Text>
        <Text
          style={[styles.oppSub, { color: isDark ? "#888" : "#666" }]}
          numberOfLines={1}
        >
          {u?.province || "Chưa có tỉnh/thành"} • {item?.matchCount || 0} trận
        </Text>
      </View>
      <View style={styles.oppRight}>
        <Text style={styles.oppRate}>{item?.winRate ?? 0}%</Text>
        <Text
          style={[styles.oppRateLabel, { color: isDark ? "#888" : "#666" }]}
        >
          win
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const FrequentOpponentsSection = ({
  title,
  theme,
  data,
  loading,
  onPickOpponent,
  onScrollTop, // ✅ NEW
}) => {
  const isDark = theme?.dark;

  return (
    <View
      style={[
        styles.opponentsSection,
        { backgroundColor: isDark ? "#12121a" : "#fff" },
      ]}
    >
      <View style={styles.historyHeader}>
        <Text
          style={[styles.sectionTitle, { color: isDark ? "#fff" : "#1a1a2e" }]}
        >
          {title}
        </Text>
        {loading ? <ActivityIndicator size="small" color="#4ECDC4" /> : null}
      </View>

      {!loading && Array.isArray(data) && data.length ? (
        <View style={{ gap: 10 }}>
          {data.slice(0, 6).map((item) => (
            <OpponentItem
              key={String(item?.user?._id)}
              item={item}
              theme={theme}
              onPress={() => {
                onScrollTop?.(); // ✅ scroll top trước
                onPickOpponent?.(item?.user); // ✅ rồi set player
              }}
            />
          ))}
        </View>
      ) : loading ? null : (
        <Text
          style={[styles.playerStatsEmpty, { color: isDark ? "#777" : "#888" }]}
        >
          Chưa có dữ liệu đối thủ thường gặp
        </Text>
      )}
    </View>
  );
};

/* =========================
 * "See all" modal (Head2HeadMatches pagination)
 * ========================= */
const Head2HeadMatchesModal = ({
  visible,
  onClose,
  theme,
  player1Id,
  player2Id,
  onPressMatch,
}) => {
  const isDark = theme?.dark;

  const [page, setPage] = useState(1);
  const [items, setItems] = useState([]);
  const [hasMore, setHasMore] = useState(false);

  const skip = !visible || !player1Id || !player2Id;

  const { data, isLoading, isFetching } = useGetHead2HeadMatchesQuery(
    { player1Id, player2Id, page, limit: H2H_MATCHES_PAGE_SIZE },
    { skip }
  );

  // reset khi mở modal / đổi cặp
  useEffect(() => {
    if (!visible) return;
    setPage(1);
    setItems([]);
    setHasMore(false);
  }, [visible, player1Id, player2Id]);

  // merge data
  useEffect(() => {
    if (!visible) return;
    if (!data) return;

    const newMatches = Array.isArray(data.matches) ? data.matches : [];
    const pg = data.pagination || {};
    const more = !!pg.hasMore;

    setHasMore(more);

    setItems((prev) => {
      if (page === 1) return newMatches;
      const seen = new Set(prev.map((x) => String(x._id)));
      const merged = [...prev];
      for (const m of newMatches) {
        if (!seen.has(String(m._id))) merged.push(m);
      }
      return merged;
    });
  }, [data, page, visible]);

  const loadMore = () => {
    if (isLoading || isFetching) return;
    if (!hasMore) return;
    setPage((p) => p + 1);
  };

  if (!visible) return null;

  return (
    <View style={styles.modalOverlay}>
      <BlurView intensity={isDark ? 40 : 20} style={StyleSheet.absoluteFill} />

      <View
        style={[
          styles.modalContent,
          {
            height: "85%",
            backgroundColor: isDark
              ? "rgba(20,20,30,0.95)"
              : "rgba(255,255,255,0.98)",
          },
        ]}
      >
        <View style={styles.modalHeader}>
          <Text
            style={[styles.modalTitle, { color: isDark ? "#fff" : "#1a1a2e" }]}
          >
            Tất cả trận đối đầu
          </Text>
          <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
            <Ionicons name="close" size={24} color={isDark ? "#fff" : "#333"} />
          </TouchableOpacity>
        </View>

        {isLoading && page === 1 ? (
          <View style={{ paddingTop: 30 }}>
            <ActivityIndicator size="large" color="#4ECDC4" />
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => String(item._id)}
            showsVerticalScrollIndicator={false}
            onEndReachedThreshold={0.3}
            onEndReached={loadMore}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={
              Platform.OS === "ios" ? "interactive" : "on-drag"
            }
            renderItem={({ item }) => (
              <MatchHistoryItem
                match={item}
                player1Id={player1Id}
                theme={theme}
                onPress={() => onPressMatch?.(item)}
              />
            )}
            ListFooterComponent={
              hasMore ? (
                <View style={{ paddingVertical: 16 }}>
                  <ActivityIndicator color="#4ECDC4" />
                </View>
              ) : (
                <View style={{ height: 16 }} />
              )
            }
            ListEmptyComponent={
              <View style={styles.emptySearch}>
                <MaterialCommunityIcons
                  name="sword-cross"
                  size={60}
                  color={isDark ? "#444" : "#ccc"}
                />
                <Text
                  style={[
                    styles.emptySearchText,
                    { color: isDark ? "#666" : "#999" },
                  ]}
                >
                  Chưa có trận đối đầu
                </Text>
              </View>
            }
          />
        )}
      </View>
    </View>
  );
};

/* =========================
 * Main Screen
 * ========================= */
export default function Head2HeadScreen() {
  const theme = useTheme();
  const router = useRouter();
  const isDark = theme?.dark;
  const currentUser = useSelector((s) => s.auth?.userInfo);
  const scrollRef = useRef(null);

  const scrollToTop = () => {
    // ScrollView
    scrollRef.current?.scrollTo?.({ y: 0, animated: true });

    // nếu sau này đổi sang FlatList thì dùng:
    // scrollRef.current?.scrollToOffset?.({ offset: 0, animated: true });
  };
  const [player1, setPlayer1] = useState(currentUser || null);
  const [player2, setPlayer2] = useState(null);

  const [searchModalVisible, setSearchModalVisible] = useState(false);
  const [selectingSide, setSelectingSide] = useState(null); // "left" | "right"

  const [matchesModalVisible, setMatchesModalVisible] = useState(false);

  const bothPlayersSelected = !!player1?._id && !!player2?._id;

  const goToMatch = (matchId) => {
    if (!matchId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: "/match/[id]/home",
      params: { id: String(matchId), isBack: true },
    });
  };

  const {
    data: h2hData,
    isLoading: h2hLoading,
    isFetching: h2hFetching,
  } = useGetHead2HeadQuery(
    { player1Id: player1?._id, player2Id: player2?._id },
    { skip: !bothPlayersSelected }
  );

  const hasData = !!(h2hData && (h2hData.totalMatches || 0) > 0);

  // Player stats (overall)
  const {
    data: p1Stats,
    isLoading: p1StatsLoading,
    isFetching: p1StatsFetching,
  } = useGetPlayerStatsQuery(
    { playerId: player1?._id },
    { skip: !player1?._id }
  );

  const {
    data: p2Stats,
    isLoading: p2StatsLoading,
    isFetching: p2StatsFetching,
  } = useGetPlayerStatsQuery(
    { playerId: player2?._id },
    { skip: !player2?._id }
  );

  // Frequent opponents
  const {
    data: p1Opps,
    isLoading: p1OppsLoading,
    isFetching: p1OppsFetching,
  } = useGetFrequentOpponentsQuery(
    { playerId: player1?._id, limit: 10 },
    { skip: !player1?._id }
  );

  const {
    data: p2Opps,
    isLoading: p2OppsLoading,
    isFetching: p2OppsFetching,
  } = useGetFrequentOpponentsQuery(
    { playerId: player2?._id, limit: 10 },
    { skip: !player2?._id }
  );

  const handleSelectPlayer = (side) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectingSide(side);
    setSearchModalVisible(true);
  };

  const handlePlayerSelected = (picked) => {
    if (!picked?._id) return;

    if (selectingSide === "left") {
      setPlayer1(picked);
      // tránh chọn trùng
      if (String(picked._id) === String(player2?._id)) setPlayer2(null);
    } else {
      setPlayer2(picked);
      if (String(picked._id) === String(player1?._id)) setPlayer1(null);
    }

    setSearchModalVisible(false);
    setSelectingSide(null);
  };

  const handleSwapPlayers = () => {
    if (!player1 && !player2) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPlayer1(player2);
    setPlayer2(player1);
  };

  const pickOpponentForSide = (targetSide, user) => {
    if (!user?._id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (targetSide === "right") {
      // set player2
      if (String(user._id) === String(player1?._id)) return;
      setPlayer2(user);
    } else {
      // set player1
      if (String(user._id) === String(player2?._id)) return;
      setPlayer1(user);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "Đối đầu",
          headerTitleStyle: { fontWeight: "800" },
          headerBackTitle: "Quay lại",
        }}
      />

      <ScrollView
        ref={scrollRef}
        style={[
          styles.container,
          { backgroundColor: isDark ? "#0a0a0f" : "#f5f7fb" },
        ]}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
      >
        {/* ===== HERO ===== */}
        <LinearGradient
          colors={
            isDark
              ? ["#1a1a2e", "#16213e", "#0f0f1a"]
              : ["#4ECDC4", "#45B7D1", "#4ECDC4"]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroSection}
        >
          <View style={styles.playersRow}>
            <PlayerCard
              player={player1}
              side="left"
              onPress={() => handleSelectPlayer("left")}
              theme={theme}
              isSelected={!!player1}
            />

            <View style={styles.vsContainer}>
              <VSBadge />
              {player1 && player2 && (
                <TouchableOpacity
                  style={styles.swapButton}
                  onPress={handleSwapPlayers}
                  activeOpacity={0.7}
                >
                  <Ionicons name="swap-horizontal" size={20} color="#fff" />
                </TouchableOpacity>
              )}
            </View>

            <PlayerCard
              player={player2}
              side="right"
              onPress={() => handleSelectPlayer("right")}
              theme={theme}
              isSelected={!!player2}
            />
          </View>

          {/* Quick stats */}
          {bothPlayersSelected && h2hData && (
            <View style={styles.quickStats}>
              <View style={styles.quickStatItem}>
                <Text style={styles.quickStatValue}>
                  {h2hData.totalMatches || 0}
                </Text>
                <Text style={styles.quickStatLabel}>Trận đấu</Text>
              </View>
              <View style={styles.quickStatDivider} />
              <View style={styles.quickStatItem}>
                <Text style={[styles.quickStatValue, { color: "#4ECDC4" }]}>
                  {h2hData.player1Wins || 0}
                </Text>
                <Text style={styles.quickStatLabel}>Thắng</Text>
              </View>
              <View style={styles.quickStatDivider} />
              <View style={styles.quickStatItem}>
                <Text style={[styles.quickStatValue, { color: "#FF6B6B" }]}>
                  {h2hData.player2Wins || 0}
                </Text>
                <Text style={styles.quickStatLabel}>Thua</Text>
              </View>
            </View>
          )}

          {bothPlayersSelected && (h2hLoading || h2hFetching) && (
            <View style={styles.quickStats}>
              <ActivityIndicator color="#fff" size="small" />
            </View>
          )}
        </LinearGradient>

        {/* ===== OVERALL PLAYER STATS (NEW) ===== */}
        {(player1?._id || player2?._id) && (
          <View style={{ marginTop: 20 }}>
            <PlayerStatsCard
              title={`Thống kê ${
                player1?.nickname || player1?.name || "Người chơi A"
              }`}
              theme={theme}
              data={p1Stats}
              loading={p1StatsLoading || p1StatsFetching}
            />
            {player2?._id ? (
              <PlayerStatsCard
                title={`Thống kê ${
                  player2?.nickname || player2?.name || "Người chơi B"
                }`}
                theme={theme}
                data={p2Stats}
                loading={p2StatsLoading || p2StatsFetching}
              />
            ) : null}
          </View>
        )}

        {/* ===== LOADING H2H ===== */}
        {bothPlayersSelected && (h2hLoading || h2hFetching) && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#4ECDC4" />
            <Text
              style={[styles.loadingText, { color: isDark ? "#888" : "#666" }]}
            >
              Đang tải dữ liệu đối đầu...
            </Text>
          </View>
        )}

        {/* ===== NO MATCHES STATE ===== */}
        {bothPlayersSelected &&
          !h2hLoading &&
          !h2hFetching &&
          (h2hData?.totalMatches ?? 0) === 0 && (
            <View
              style={[
                styles.noMatchesContainer,
                { backgroundColor: isDark ? "#12121a" : "#fff" },
              ]}
            >
              <MaterialCommunityIcons
                name="sword-cross"
                size={60}
                color={isDark ? "#444" : "#ccc"}
              />
              <Text
                style={[
                  styles.noMatchesTitle,
                  { color: isDark ? "#fff" : "#1a1a2e" },
                ]}
              >
                Chưa có trận đấu nào
              </Text>
              <Text
                style={[
                  styles.noMatchesSubtitle,
                  { color: isDark ? "#666" : "#999" },
                ]}
              >
                Hai người chơi này chưa từng gặp nhau trong các giải đấu
              </Text>
            </View>
          )}

        {/* ===== STATS COMPARISON ===== */}
        {bothPlayersSelected && hasData && (
          <View
            style={[
              styles.statsSection,
              { backgroundColor: isDark ? "#12121a" : "#fff" },
            ]}
          >
            <Text
              style={[
                styles.sectionTitle,
                { color: isDark ? "#fff" : "#1a1a2e" },
              ]}
            >
              So sánh chỉ số đối đầu
            </Text>

            <AnimatedStatBar
              leftValue={h2hData.player1Wins || 0}
              rightValue={h2hData.player2Wins || 0}
              leftColor="#4ECDC4"
              rightColor="#FF6B6B"
              label="Số trận thắng"
              theme={theme}
            />

            <AnimatedStatBar
              leftValue={h2hData.player1Sets || 0}
              rightValue={h2hData.player2Sets || 0}
              leftColor="#4ECDC4"
              rightColor="#FF6B6B"
              label="Số set thắng"
              theme={theme}
            />

            <AnimatedStatBar
              leftValue={h2hData.player1Points || 0}
              rightValue={h2hData.player2Points || 0}
              leftColor="#4ECDC4"
              rightColor="#FF6B6B"
              label="Tổng điểm"
              theme={theme}
            />

            <AnimatedStatBar
              leftValue={h2hData.player1AvgScore || 0}
              rightValue={h2hData.player2AvgScore || 0}
              leftColor="#4ECDC4"
              rightColor="#FF6B6B"
              label="Điểm TB/trận"
              theme={theme}
            />
          </View>
        )}

        {/* ===== MATCH HISTORY ===== */}
        {bothPlayersSelected && (h2hData?.matches?.length || 0) > 0 && (
          <View
            style={[
              styles.historySection,
              { backgroundColor: isDark ? "#12121a" : "#fff" },
            ]}
          >
            <View style={styles.historyHeader}>
              <Text
                style={[
                  styles.sectionTitle,
                  { color: isDark ? "#fff" : "#1a1a2e" },
                ]}
              >
                Lịch sử đối đầu
              </Text>

              <TouchableOpacity
                style={styles.seeAllBtn}
                activeOpacity={0.8}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setMatchesModalVisible(true);
                }}
              >
                <Text style={styles.seeAllText}>Xem tất cả</Text>
                <Ionicons name="chevron-forward" size={16} color="#4ECDC4" />
              </TouchableOpacity>
            </View>

            {h2hData.matches.slice(0, 5).map((match) => (
              <MatchHistoryItem
                key={String(match._id)}
                match={match}
                player1Id={player1?._id}
                theme={theme}
                onPress={() => goToMatch(match._id)}
              />
            ))}
          </View>
        )}

        {/* ===== FREQUENT OPPONENTS (NEW) ===== */}
        {!!player1?._id && (
          <FrequentOpponentsSection
            title={`Đối thủ thường gặp của ${
              player1?.nickname || player1?.name || "Player A"
            }`}
            theme={theme}
            data={p1Opps}
            loading={p1OppsLoading || p1OppsFetching}
            onPickOpponent={(u) => pickOpponentForSide("right", u)} // tap => set player2
            onScrollTop={scrollToTop} // ✅ NEW
          />
        )}

        {!!player2?._id && (
          <FrequentOpponentsSection
            title={`Đối thủ thường gặp của ${
              player2?.nickname || player2?.name || "Player B"
            }`}
            theme={theme}
            data={p2Opps}
            loading={p2OppsLoading || p2OppsFetching}
            onPickOpponent={(u) => pickOpponentForSide("left", u)} // tap => set player1
            onScrollTop={scrollToTop} // ✅ NEW
          />
        )}

        {/* ===== EMPTY STATE ===== */}
        {!player1?._id || !player2?._id ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons
              name="fencing"
              size={80}
              color={isDark ? "#333" : "#ccc"}
            />
            <Text
              style={[
                styles.emptyTitle,
                { color: isDark ? "#fff" : "#1a1a2e" },
              ]}
            >
              Chọn 2 người chơi để so sánh
            </Text>
            <Text
              style={[
                styles.emptySubtitle,
                { color: isDark ? "#666" : "#999" },
              ]}
            >
              Xem lịch sử đối đầu, thống kê chi tiết, đối thủ thường gặp...
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {/* ===== SEARCH MODAL ===== */}
      <PlayerSearchModal
        visible={searchModalVisible}
        onClose={() => {
          setSearchModalVisible(false);
          setSelectingSide(null);
        }}
        onSelect={handlePlayerSelected}
        theme={theme}
        excludeId={selectingSide === "left" ? player2?._id : player1?._id}
      />

      {/* ===== SEE ALL MATCHES MODAL (NEW) ===== */}
      <Head2HeadMatchesModal
        visible={matchesModalVisible}
        onClose={() => setMatchesModalVisible(false)}
        theme={theme}
        player1Id={player1?._id}
        player2Id={player2?._id}
        onPressMatch={(m) => {
          setMatchesModalVisible(false);
          goToMatch(m?._id);
        }}
      />
    </>
  );
}

/* =========================
 * Styles
 * ========================= */
const styles = StyleSheet.create({
  container: { flex: 1 },
  contentContainer: { paddingBottom: 100 },

  heroSection: {
    paddingTop: 20,
    paddingBottom: 24,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  playersRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  playerCardWrapper: { flex: 1, maxWidth: SCREEN_WIDTH * 0.38 },
  playerCard: { borderRadius: 20, overflow: "hidden" },
  playerCardInner: {
    alignItems: "center",
    paddingVertical: 20,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
  },
  avatarWrapper: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 3,
    padding: 3,
    marginBottom: 12,
  },
  playerAvatar: {
    width: "100%",
    height: "100%",
    borderRadius: AVATAR_SIZE / 2,
  },
  verifiedBadge: {
    position: "absolute",
    bottom: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#4ECDC4",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  avatarPlaceholder: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 2,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  playerName: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },
  selectPlayerText: { fontSize: 14, fontWeight: "600" },
  playerStats: { flexDirection: "row", alignItems: "center", gap: 12 },
  miniStat: { alignItems: "center" },
  miniStatValue: { fontSize: 16, fontWeight: "800" },
  miniStatLabel: { fontSize: 11, fontWeight: "500", marginTop: 2 },
  statDivider: { width: 1, height: 24 },

  vsContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  vsBadge: {
    shadowColor: "#FF6B6B",
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  vsBadgeGradient: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
  },
  vsText: { fontSize: 18, fontWeight: "900", color: "#fff", letterSpacing: 1 },
  swapButton: {
    marginTop: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },

  quickStats: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
    gap: 24,
  },
  quickStatItem: { alignItems: "center" },
  quickStatValue: { fontSize: 24, fontWeight: "900", color: "#fff" },
  quickStatLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255,255,255,0.7)",
    marginTop: 4,
  },
  quickStatDivider: {
    width: 1,
    height: 30,
    backgroundColor: "rgba(255,255,255,0.2)",
  },

  statsSection: {
    marginHorizontal: 16,
    marginTop: 20,
    padding: 20,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  sectionTitle: { fontSize: 18, fontWeight: "800", marginBottom: 16 },

  statBarContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 12,
  },
  statBarValue: {
    width: 36,
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
  },
  statBarMiddle: { flex: 1 },
  statBarLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
    textAlign: "center",
  },
  statBarTrack: {
    height: 8,
    borderRadius: 4,
    flexDirection: "row",
    overflow: "hidden",
  },
  statBarFillLeft: {
    height: "100%",
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
  },
  statBarFillRight: {
    height: "100%",
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },

  historySection: {
    marginHorizontal: 16,
    marginTop: 20,
    padding: 20,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  seeAllBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  seeAllText: { fontSize: 14, fontWeight: "600", color: "#4ECDC4" },

  matchHistoryItem: {
    flexDirection: "row",
    borderRadius: 12,
    marginBottom: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  matchResultIndicator: { width: 4 },
  matchHistoryContent: { flex: 1, padding: 14 },
  matchHistoryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  matchHistoryTitle: { fontSize: 14, fontWeight: "600", flex: 1 },
  matchHistoryDate: { fontSize: 12, fontWeight: "500" },
  matchScoreRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  matchScore: { fontSize: 20, fontWeight: "900" },
  matchResultBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  matchResultText: { fontSize: 12, fontWeight: "800" },

  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginTop: 20,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 14,
    fontWeight: "500",
    marginTop: 8,
    textAlign: "center",
    lineHeight: 20,
  },

  // Modal base
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    zIndex: 1000,
  },
  modalContent: {
    height: "75%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: "800" },
  modalCloseBtn: { padding: 8 },

  searchInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    gap: 12,
  },
  searchInput: { flex: 1, fontSize: 16, fontWeight: "500" },
  searchResultsList: { marginTop: 16 },
  searchResultItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 16,
    marginBottom: 8,
    gap: 12,
  },
  searchResultAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#f0f0f0",
  },
  searchResultInfo: { flex: 1 },
  searchResultName: { fontSize: 15, fontWeight: "700" },
  searchResultSub: { fontSize: 13, fontWeight: "500", marginTop: 2 },
  searchResultStats: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(78, 205, 196, 0.1)",
    borderRadius: 8,
  },
  searchResultStatText: { fontSize: 12, fontWeight: "700", color: "#4ECDC4" },
  emptySearch: { alignItems: "center", paddingVertical: 40 },
  emptySearchText: { fontSize: 14, fontWeight: "500", marginTop: 12 },

  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  loadingText: { fontSize: 14, fontWeight: "500", marginTop: 12 },

  noMatchesContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 40,
    marginHorizontal: 16,
    marginTop: 20,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  noMatchesTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginTop: 16,
    textAlign: "center",
  },
  noMatchesSubtitle: {
    fontSize: 14,
    fontWeight: "500",
    marginTop: 8,
    textAlign: "center",
    lineHeight: 20,
  },

  // Player stats cards
  playerStatsCard: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 18,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  playerStatsCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  playerStatsCardTitle: { fontSize: 16, fontWeight: "800" },
  playerStatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 12,
    gap: 10,
  },
  playerStatsCell: {
    width: (SCREEN_WIDTH - 16 * 2 - 16 * 2 - 10) / 2, // rough
    padding: 12,
    borderRadius: 14,
    backgroundColor: "rgba(78, 205, 196, 0.08)",
  },
  playerStatsCellWide: {
    width: "100%",
    padding: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255, 107, 107, 0.08)",
  },
  playerStatsValue: { fontSize: 18, fontWeight: "900" },
  playerStatsLabel: { fontSize: 12, fontWeight: "600", marginTop: 4 },
  playerStatsEmpty: { marginTop: 10, fontSize: 13, fontWeight: "600" },
  streakRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  streakText: { fontSize: 13, fontWeight: "700" },

  // Opponents
  opponentsSection: {
    marginHorizontal: 16,
    marginTop: 20,
    padding: 20,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  oppItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 16,
    gap: 12,
  },
  oppAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#eee",
  },
  oppName: { fontSize: 14, fontWeight: "800" },
  oppSub: { fontSize: 12, fontWeight: "600", marginTop: 3 },
  oppRight: { alignItems: "flex-end" },
  oppRate: { fontSize: 14, fontWeight: "900", color: "#4ECDC4" },
  oppRateLabel: { fontSize: 11, fontWeight: "700", marginTop: 2 },
});
