/* eslint-disable react/prop-types */
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
  Share,
  Clipboard,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
// Note: LinearGradient only used for header and stat cards now
import { BlurView } from "expo-blur";
import { useSelector } from "react-redux";
import * as Haptics from "expo-haptics";

// Icons - sử dụng expo vector icons
import {
  Ionicons,
  MaterialCommunityIcons,
  FontAwesome5,
} from "@expo/vector-icons";

import {
  useGetPublicProfileQuery,
  useGetRatingHistoryQuery,
  useGetMatchHistoryQuery,
} from "@/slices/usersApiSlice";
import { useLocalSearchParams } from "expo-router";
import { normalizeUrl } from "@/utils/normalizeUri";
import { router } from "expo-router";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const HEADER_HEIGHT = 350;
const AVATAR_SIZE = 120;
const isSmallDevice = SCREEN_WIDTH <= 360; // 👈 thêm: nhận diện máy nhỏ

/* ---------- CONSTANTS & UTILS ---------- */
const AVA_PLACE = "https://dummyimage.com/160x160/cccccc/ffffff&text=?";
const tz = { timeZone: "Asia/Bangkok" };

// Formatters
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

const calcAge = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  if (age < 0 || age > 120) return "—";
  return age;
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
  if (!s) return false;
  if (s === "—") return false;
  return true;
};

/* ---------- SUB-COMPONENTS ---------- */

// Modern Stat Card
const StatCard = ({ icon, value, label, color, gradient }) => (
  <LinearGradient
    colors={gradient}
    start={{ x: 0, y: 0 }}
    end={{ x: 1, y: 1 }}
    style={[styles.statCard, isSmallDevice && styles.statCardSmall]} // 👈 thêm responsive
  >
    <View style={styles.statIconContainer}>{icon}</View>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </LinearGradient>
);

// Info Badge
const InfoBadge = ({ icon, text, color = "#666" }) => (
  <View style={[styles.badge, { borderColor: color }]}>
    {icon}
    <Text style={[styles.badgeText, { color }]}>{text}</Text>
  </View>
);

// Match Card
const MatchCard = ({ match, userId, onPress }) => {
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
      <View style={styles.matchCardContainer}>
        {/* Header: Result Badge + Date + Tournament */}
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
            <Text style={styles.matchDate} numberOfLines={1}>
              {fmtDT(match.dateTime)}
            </Text>
            <Text style={styles.tournamentName} numberOfLines={1}>
              {match.tournament?.name || "Giao hữu"}
            </Text>
          </View>
        </View>

        {/* Teams & Score - Vertical Layout */}
        <View style={styles.teamsVerticalContainer}>
          {/* Team 1 */}
          <View style={styles.teamSection}>
            <View style={styles.teamPlayers}>
              {match.team1?.map((p, i) => (
                <PlayerRowCompact key={i} player={p} highlight={winnerA} />
              ))}
            </View>
          </View>

          {/* Score Display */}
          <View style={styles.scoreDisplayContainer}>
            <Text style={styles.scoreDisplayText}>
              {match.scoreText || "VS"}
            </Text>
          </View>

          {/* Team 2 */}
          <View style={styles.teamSection}>
            <View style={styles.teamPlayers}>
              {match.team2?.map((p, i) => (
                <PlayerRowCompact key={i} player={p} highlight={winnerB} />
              ))}
            </View>
          </View>
        </View>

        {/* Video Button */}
        {match.video && (
          <TouchableOpacity style={styles.videoButton}>
            <Ionicons name="play-circle" size={18} color="#FF3B30" />
            <Text style={styles.videoText}>Video</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
};

// Compact Player Row for Match Card
const PlayerRowCompact = ({ player, highlight }) => {
  const up = (player?.delta ?? 0) > 0;
  const down = (player?.delta ?? 0) < 0;
  const name =
    player?.user?.nickname ||
    player?.user?.fullName ||
    player?.nickname ||
    player?.fullName ||
    "N/A";

  return (
    <View style={styles.playerRowCompact}>
      <Image
        source={{ uri: normalizeUrl(player?.avatar) || AVA_PLACE }}
        style={styles.playerAvatarCompact}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={150}
      />
      <View style={styles.playerInfoCompact}>
        <Text
          style={[
            styles.playerNameCompact,
            highlight && styles.playerNameHighlight,
          ]}
          numberOfLines={1}
        >
          {name}
        </Text>
        {player?.postScore !== undefined && player?.postScore !== null && (
          <View style={styles.scoreChangeCompact}>
            <Text style={styles.scoreChangeTextCompact}>
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
      </View>
    </View>
  );
};

// Player Row
const PlayerRow = ({ player, highlight, isWinSide }) => {
  const up = (player?.delta ?? 0) > 0;
  const down = (player?.delta ?? 0) < 0;
  const name =
    player?.user?.nickname ||
    player?.user?.fullName ||
    player?.nickname ||
    player?.fullName ||
    "N/A";

  return (
    <View style={styles.playerRow}>
      <Image
        source={{ uri: normalizeUrl(player?.avatar) || AVA_PLACE }}
        style={styles.playerAvatar}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={150}
      />
      <View style={styles.playerInfo}>
        <Text
          style={[
            styles.playerName,
            highlight && styles.playerNameHighlight,
            { color: isWinSide ? "#FFF" : "#333" },
          ]}
          numberOfLines={1}
        >
          {name}
        </Text>
        {player?.postScore !== undefined && player?.postScore !== null && (
          <View style={styles.scoreChange}>
            <Text
              style={[
                styles.scoreChangeText,
                { color: isWinSide ? "rgba(255,255,255,0.8)" : "#666" },
              ]}
            >
              {num(player.preScore)} → {num(player.postScore)}
            </Text>
            {Number.isFinite(+player.delta) && player.delta !== 0 && (
              <Text
                style={[
                  styles.deltaText,
                  { color: up ? "#4CAF50" : "#F44336" },
                ]}
              >
                {up ? "+" : ""}
                {numFloat(player.delta)}
              </Text>
            )}
          </View>
        )}
      </View>
    </View>
  );
};

// Rating History Row
const RatingHistoryRow = ({ item, prevItem }) => {
  // Calculate delta from previous record
  const singleDelta = prevItem ? item.single - prevItem.single : 0;
  const doubleDelta = prevItem ? item.double - prevItem.double : 0;

  return (
    <View style={[styles.ratingRow, isSmallDevice && styles.ratingRowSmall]}>
      <View style={styles.ratingLeft}>
        <Text style={styles.ratingDate}>{fmtDate(item.scoredAt)}</Text>
        <Text style={styles.ratingScorer}>
          {item.scorer?.name || "Hệ thống"}
        </Text>
      </View>
      <View
        style={[styles.ratingScores, isSmallDevice && styles.ratingScoresSmall]}
      >
        <View style={styles.ratingScoreBadge}>
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
        <View style={[styles.ratingScoreBadge, { backgroundColor: "#E3F2FD" }]}>
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
      </View>
    </View>
  );
};

// Info Item for Profile Tab
const InfoItem = ({ label, value, copyable, onCopy }) => {
  const display =
    value === null || value === undefined || value === "" ? "—" : value;

  return (
    <View style={styles.infoItem}>
      <Text style={styles.infoLabel}>{label}</Text>
      <View style={styles.infoValueContainer}>
        <Text style={styles.infoValue} numberOfLines={2}>
          {display}
        </Text>
        {copyable && display !== "—" && (
          <TouchableOpacity
            onPress={() => onCopy(display, label)}
            style={styles.copyButton}
          >
            <Ionicons name="copy-outline" size={16} color="#666" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

/* ---------- SKELETON COMPONENTS ---------- */
const SkeletonItem = ({ width, height, borderRadius = 4, style }) => {
  const animatedValue = React.useRef(new Animated.Value(0.3)).current;

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
          backgroundColor: "#E1E9EE",
          opacity: animatedValue,
        },
        style,
      ]}
    />
  );
};

const ProfileSkeleton = () => {
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header Skeleton */}
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
            backgroundColor: "#D1D5DB", // Giả lập màu nền gradient tối hơn chút
            borderBottomLeftRadius: 24,
            borderBottomRightRadius: 24,
          }}
        />

        {/* Avatar Placeholder */}
        <View style={{ marginBottom: 12, alignItems: "center" }}>
          <SkeletonItem
            width={AVATAR_SIZE}
            height={AVATAR_SIZE}
            borderRadius={AVATAR_SIZE / 2}
            style={{ borderWidth: 4, borderColor: "white" }}
          />
        </View>

        {/* Name & Info Placeholder */}
        <SkeletonItem
          width={200}
          height={28}
          borderRadius={8}
          style={{ marginBottom: 8 }}
        />
        <SkeletonItem
          width={120}
          height={20}
          borderRadius={16}
          style={{ marginBottom: 16 }}
        />

        {/* Badges */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <SkeletonItem width={80} height={24} borderRadius={16} />
          <SkeletonItem width={60} height={24} borderRadius={16} />
        </View>
      </View>

      {/* Body Content */}
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 20 }}>
        {/* Stats Cards Skeleton */}
        <View style={{ flexDirection: "row", gap: 12, marginBottom: 24 }}>
          {[1, 2, 3].map((i) => (
            <View
              key={i}
              style={{
                flex: 1,
                height: 100,
                backgroundColor: "#FFF",
                borderRadius: 16,
                padding: 10,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <SkeletonItem
                width={30}
                height={30}
                borderRadius={15}
                style={{ marginBottom: 8 }}
              />
              <SkeletonItem width={40} height={20} borderRadius={4} />
            </View>
          ))}
        </View>

        {/* Tabs Skeleton */}
        <View
          style={{
            flexDirection: "row",
            marginBottom: 20,
            backgroundColor: "#FFF",
            borderRadius: 12,
            padding: 4,
          }}
        >
          <View
            style={{
              flex: 1,
              height: 36,
              backgroundColor: "#E0E0E0",
              borderRadius: 8,
              marginRight: 4,
            }}
          />
          <View style={{ flex: 1, height: 36 }} />
          <View style={{ flex: 1, height: 36 }} />
        </View>

        {/* List Items Skeleton (Mô phỏng info item) */}
        <View
          style={{
            gap: 16,
            backgroundColor: "#FFF",
            borderRadius: 16,
            padding: 20,
          }}
        >
          {[1, 2, 3, 4].map((i) => (
            <View
              key={i}
              style={{ flexDirection: "row", justifyContent: "space-between" }}
            >
              <SkeletonItem width={80} height={16} />
              <SkeletonItem width={120} height={16} />
            </View>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
};

/* ---------- MAIN COMPONENT ---------- */
export default function PublicProfileScreen() {
  const params = useLocalSearchParams();
  const { id } = params;
  const [activeTab, setActiveTab] = useState(0);
  const scrollY = new Animated.Value(0);
  const scrollViewRef = React.useRef(null);

  // Queries
  const baseQ = useGetPublicProfileQuery(id);
  const rateQ = useGetRatingHistoryQuery(id);
  const matchQ = useGetMatchHistoryQuery(id);

  const base = baseQ.data || {};
  const ratingRaw = Array.isArray(rateQ.data?.history)
    ? rateQ.data.history
    : rateQ.data?.items || [];
  const matchRaw = Array.isArray(matchQ.data)
    ? matchQ.data
    : matchQ.data?.items || [];

  // Auth viewer
  const { userInfo } = useSelector((state) => state.auth || {});
  const baseId = base?._id || "";
  const viewerId = userInfo?._id || userInfo?.id;
  const isSelf = viewerId && baseId && String(viewerId) === String(baseId);
  const isAdminViewer =
    userInfo?.isAdmin ||
    userInfo?.role === "admin" ||
    (Array.isArray(userInfo?.roles) && userInfo.roles.includes("admin"));
  const canSeeSensitive = isSelf || isAdminViewer;

  // Latest ratings
  const latestSingle = useMemo(() => {
    if (ratingRaw.length) {
      const v = Number(ratingRaw[0]?.single);
      if (Number.isFinite(v)) return v;
    }
    const fallback =
      base?.levelPoint?.single ?? base?.levelPoint?.score ?? undefined;
    const v2 = Number(fallback);
    return Number.isFinite(v2) ? v2 : NaN;
  }, [ratingRaw, base]);

  const latestDouble = useMemo(() => {
    if (ratingRaw.length) {
      const v = Number(ratingRaw[0]?.double);
      if (Number.isFinite(v)) return v;
    }
    const fallback = base?.levelPoint?.double ?? undefined;
    const v2 = Number(fallback);
    return Number.isFinite(v2) ? v2 : NaN;
  }, [ratingRaw, base]);

  // Derived stats
  const uid = base?._id || id;
  const { totalMatches, wins, winRate } = useMemo(() => {
    let total = 0;
    let w = 0;
    for (const m of matchRaw) {
      const inA = (m?.team1 || []).some((p) => (p?._id || p?.id) === uid);
      const inB = (m?.team2 || []).some((p) => (p?._id || p?.id) === uid);
      if (!inA && !inB) continue;
      total++;
      if ((inA && m?.winner === "A") || (inB && m?.winner === "B")) w++;
    }
    const rate = total ? Math.round((w / total) * 100) : 0;
    return { totalMatches: total, wins: w, winRate: rate };
  }, [matchRaw, uid]);

  // Pagination
  const [pageMatch, setPageMatch] = useState(1);
  const matchPerPage = 5;
  const matchPaged = matchRaw.slice(
    (pageMatch - 1) * matchPerPage,
    pageMatch * matchPerPage
  );

  const [pageRate, setPageRate] = useState(1);
  const ratePerPage = 8;
  const ratePaged = ratingRaw.slice(
    (pageRate - 1) * ratePerPage,
    pageRate * ratePerPage
  );

  // Handlers
  const handleShare = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await Share.share({
        message: `Xem hồ sơ của ${base?.name || "người chơi"} trên PickleTour`,
        url: `pickletour://profile/${id}`,
      });
    } catch (error) {
      console.log(error);
    }
  };

  const handleCopy = (value, label) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Clipboard.setString(String(value));
    Alert.alert("Đã sao chép", `${label}: ${value}`);
  };

  // Derived data
  const genderInfo = getGenderInfo(base?.gender);
  const handLabel = getHandLabel(
    base?.playHand || base?.hand || base?.handedness || base?.dominantHand
  );
  const dob = base?.dob || base?.birthday || base?.dateOfBirth;
  const clubName =
    base?.clubName ||
    base?.mainClub?.name ||
    base?.primaryClub?.name ||
    base?.club?.name;

  // Animated header
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

  if (baseQ.isLoading) {
    return <ProfileSkeleton />;
  }
  
  if (baseQ.error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={64} color="#F44336" />
          <Text style={styles.errorText}>
            Không tìm thấy người dùng hoặc có lỗi xảy ra
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const hasContactBlock =
    hasData(base?.phone) ||
    hasData(base?.email) ||
    hasData(base?.address || base?.street);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Animated Header */}
      <Animated.View
        style={[
          styles.header,
          {
            opacity: headerOpacity,
          },
        ]}
      >
        <LinearGradient
          colors={["#6366F1", "#8B5CF6", "#EC4899"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          {/* Decorative circles */}
          <View style={styles.headerCircle1} />
          <View style={styles.headerCircle2} />

          {/* Avatar */}
          <Animated.View
            style={[
              styles.avatarContainer,
              {
                transform: [{ scale: avatarScale }],
              },
            ]}
          >
            <Image
              source={{ uri: normalizeUrl(base?.avatar) || AVA_PLACE }}
              style={styles.avatar}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={150}
            />
            {base?.isAdmin && (
              <View style={styles.verifiedBadge}>
                <Ionicons name="shield-checkmark" size={20} color="#FFF" />
              </View>
            )}
          </Animated.View>

          {/* Name & Info */}
          <Text style={styles.userName}>
            {base?.name || base?.fullName || "Người dùng"}
          </Text>
          <View style={styles.nicknameContainer}>
            <Text style={styles.userNickname}>
              @{base?.nickname || "no_nick"}
            </Text>
          </View>

          {/* Quick Info Badges */}
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
                    genderInfo.label === "Nam" ? "gender-male" : "gender-female"
                  }
                  size={14}
                  color="#FFF"
                />
              }
              text={genderInfo.label}
              color="#FFF"
            />
          </View>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Ionicons name="chevron-back" size={24} color="#FFF" />
          </TouchableOpacity>

          {/* Share Button */}
          <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
            <Ionicons name="share-social" size={20} color="#FFF" />
          </TouchableOpacity>
        </LinearGradient>
      </Animated.View>

      <Animated.ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
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
            color="#6366F1"
            gradient={["#6366F1", "#8B5CF6"]}
          />
          <StatCard
            icon={<FontAwesome5 name="trophy" size={28} color="#FFF" />}
            value={`${wins} (${winRate}%)`}
            label="Chiến thắng"
            color="#F59E0B"
            gradient={["#F59E0B", "#EF4444"]}
          />
          <StatCard
            icon={<Ionicons name="trending-up" size={32} color="#FFF" />}
            value={`${num(latestSingle)} / ${num(latestDouble)}`}
            label="Điểm Đơn/Đôi"
            color="#10B981"
            gradient={["#10B981", "#059669"]}
          />
        </View>

        {/* Tab Navigation */}
        <View style={styles.tabContainer}>
          <View style={styles.tabWrapper}>
            {["Hồ sơ", "Lịch sử thi đấu", "Điểm trình"].map((tab, index) => (
              <TouchableOpacity
                key={index}
                style={[styles.tab, activeTab === index && styles.tabActive]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setActiveTab(index);
                  // Scroll to top when changing tab
                  scrollViewRef.current?.scrollTo({ y: 0, animated: true });
                }}
              >
                <Text
                  style={[
                    styles.tabText,
                    activeTab === index && styles.tabTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {tab}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Tab Content */}
        <View style={styles.tabContent}>
          {/* Tab 0: Profile Details */}
          {activeTab === 0 && (
            <View style={styles.profileTab}>
              {/* Bio */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Giới thiệu</Text>
                <Text style={styles.bioText}>
                  {base?.bio || "Chưa có thông tin."}
                </Text>
              </View>

              {/* Basic Info */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Thông tin cơ bản</Text>
                <View style={styles.infoGrid}>
                  {hasData(base?.name || base?.fullName) && (
                    <InfoItem
                      label="Họ và tên"
                      value={base?.name || base?.fullName}
                    />
                  )}
                  {hasData(base?.nickname) && (
                    <InfoItem
                      label="Nickname"
                      value={base?.nickname}
                      copyable
                      onCopy={handleCopy}
                    />
                  )}
                  {hasData(genderInfo.label) && (
                    <InfoItem label="Giới tính" value={genderInfo.label} />
                  )}
                  {hasData(base?.province) && (
                    <InfoItem label="Tỉnh thành" value={base?.province} />
                  )}
                  {hasData(dob) && (
                    <InfoItem label="Ngày sinh" value={fmtDate(dob)} />
                  )}
                  {hasData(calcAge(dob)) && (
                    <InfoItem label="Tuổi" value={`${calcAge(dob)} tuổi`} />
                  )}
                  {hasData(handLabel) && (
                    <InfoItem label="Tay thuận" value={handLabel} />
                  )}
                </View>
              </View>

              {/* Competition Info */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Thông tin thi đấu</Text>
                <View style={styles.infoGrid}>
                  {hasData(clubName) && (
                    <InfoItem label="CLB chính" value={clubName} />
                  )}
                  <InfoItem label="Điểm đơn" value={num(latestSingle)} />
                  <InfoItem label="Điểm đôi" value={num(latestDouble)} />
                  <InfoItem
                    label="Tổng trận"
                    value={`${totalMatches || 0} trận`}
                  />
                  <InfoItem
                    label="Thắng / Tỷ lệ"
                    value={`${wins || 0} (${winRate}%)`}
                  />
                </View>
              </View>

              {/* Contact Info (if permitted) */}
              {canSeeSensitive && hasContactBlock && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Thông tin liên hệ</Text>
                  <View style={styles.infoGrid}>
                    {hasData(base?.phone) && (
                      <InfoItem
                        label="Số điện thoại"
                        value={base?.phone}
                        copyable
                        onCopy={handleCopy}
                      />
                    )}
                    {hasData(base?.email) && (
                      <InfoItem
                        label="Email"
                        value={base?.email}
                        copyable
                        onCopy={handleCopy}
                      />
                    )}
                    {hasData(base?.address || base?.street) && (
                      <InfoItem
                        label="Địa chỉ"
                        value={base?.address || base?.street}
                      />
                    )}
                  </View>
                </View>
              )}
            </View>
          )}

          {/* Tab 1: Match History */}
          {activeTab === 1 && (
            <View style={styles.matchTab}>
              {matchPaged.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <MaterialCommunityIcons
                    name="tennis-ball"
                    size={64}
                    color="#E0E0E0"
                  />
                  <Text style={styles.emptyText}>Chưa có dữ liệu trận đấu</Text>
                </View>
              ) : (
                <>
                  {matchPaged.map((match) => (
                    <MatchCard key={match._id} match={match} userId={uid} />
                  ))}
                  {matchRaw.length > matchPerPage && (
                    <View style={styles.pagination}>
                      <TouchableOpacity
                        style={[
                          styles.pageButton,
                          pageMatch === 1 && styles.pageButtonDisabled,
                        ]}
                        onPress={() => {
                          setPageMatch((p) => Math.max(1, p - 1));
                          scrollViewRef.current?.scrollTo({
                            y: 0,
                            animated: true,
                          });
                        }}
                        disabled={pageMatch === 1}
                      >
                        <Ionicons name="chevron-back" size={20} color="#666" />
                      </TouchableOpacity>
                      <Text style={styles.pageText}>
                        {pageMatch} /{" "}
                        {Math.ceil(matchRaw.length / matchPerPage)}
                      </Text>
                      <TouchableOpacity
                        style={[
                          styles.pageButton,
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
                          scrollViewRef.current?.scrollTo({
                            y: 0,
                            animated: true,
                          });
                        }}
                        disabled={
                          pageMatch >= Math.ceil(matchRaw.length / matchPerPage)
                        }
                      >
                        <Ionicons
                          name="chevron-forward"
                          size={20}
                          color="#666"
                        />
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              )}
            </View>
          )}

          {/* Tab 2: Rating History */}
          {activeTab === 2 && (
            <View style={styles.ratingTab}>
              {ratePaged.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="stats-chart" size={64} color="#E0E0E0" />
                  <Text style={styles.emptyText}>Chưa có lịch sử điểm</Text>
                </View>
              ) : (
                <>
                  {ratePaged.map((item, index) => {
                    // Get previous item for delta calculation
                    const prevItem =
                      index < ratePaged.length - 1
                        ? ratePaged[index + 1]
                        : null;
                    return (
                      <RatingHistoryRow
                        key={item._id || item.id}
                        item={item}
                        prevItem={prevItem}
                      />
                    );
                  })}
                  {ratingRaw.length > ratePerPage && (
                    <View style={styles.pagination}>
                      <TouchableOpacity
                        style={[
                          styles.pageButton,
                          pageRate === 1 && styles.pageButtonDisabled,
                        ]}
                        onPress={() => {
                          setPageRate((p) => Math.max(1, p - 1));
                          scrollViewRef.current?.scrollTo({
                            y: 0,
                            animated: true,
                          });
                        }}
                        disabled={pageRate === 1}
                      >
                        <Ionicons name="chevron-back" size={20} color="#666" />
                      </TouchableOpacity>
                      <Text style={styles.pageText}>
                        {pageRate} / {Math.ceil(ratingRaw.length / ratePerPage)}
                      </Text>
                      <TouchableOpacity
                        style={[
                          styles.pageButton,
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
                          scrollViewRef.current?.scrollTo({
                            y: 0,
                            animated: true,
                          });
                        }}
                        disabled={
                          pageRate >= Math.ceil(ratingRaw.length / ratePerPage)
                        }
                      >
                        <Ionicons
                          name="chevron-forward"
                          size={20}
                          color="#666"
                        />
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              )}
            </View>
          )}
        </View>
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

/* ---------- STYLES ---------- */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7FA",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: 16,
    color: "#666",
    marginTop: 12,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  errorText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginTop: 16,
  },

  /* Header */
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
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
  avatarContainer: {
    position: "relative",
    marginBottom: 12,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 4,
    borderColor: "#FFF",
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
    borderColor: "#FFF",
  },
  userName: {
    fontSize: 24,
    fontWeight: "800",
    color: "#FFF",
    marginBottom: 8,
  },
  nicknameContainer: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 16,
  },
  userNickname: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFF",
  },
  quickInfoContainer: {
    flexDirection: "row",
    gap: 8,
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
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
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

  /* ScrollView */
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: HEADER_HEIGHT + 20,
    paddingBottom: 40,
  },

  /* Stats */
  statsContainer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 24,
  },
  statsContainerSmall: {
    flexDirection: "column", // 👈 nhỏ thì xếp dọc
  },
  statCard: {
    flex: 1,
    padding: 16,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 120,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  statCardSmall: {
    width: "100%",
    alignSelf: "stretch",
  },
  statIconContainer: {
    marginBottom: 8,
  },
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

  /* Tabs */
  tabContainer: {
    marginBottom: 20,
    paddingHorizontal: 16,
  },
  tabWrapper: {
    flexDirection: "row",
    backgroundColor: "#FFF",
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
  tabActive: {
    backgroundColor: "#6366F1",
  },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
  },
  tabTextActive: {
    color: "#FFF",
  },

  /* Tab Content */
  tabContent: {
    paddingHorizontal: 16,
  },

  /* Profile Tab */
  profileTab: {
    gap: 20,
  },
  section: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
    marginBottom: 16,
  },
  bioText: {
    fontSize: 14,
    color: "#666",
    lineHeight: 22,
  },
  infoGrid: {
    gap: 16,
  },
  infoItem: {
    gap: 4,
  },
  infoLabel: {
    fontSize: 12,
    color: "#999",
    fontWeight: "600",
    textTransform: "uppercase",
  },
  infoValueContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  infoValue: {
    fontSize: 15,
    color: "#333",
    fontWeight: "500",
    flex: 1,
  },
  copyButton: {
    padding: 4,
  },

  /* Match Tab */
  matchTab: {
    gap: 16,
  },
  matchCard: {
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 12,
  },
  matchCardContainer: {
    backgroundColor: "#FFF",
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
  matchHeaderRight: {
    flex: 1,
    alignItems: "flex-end",
  },
  matchDate: {
    fontSize: 11,
    color: "#999",
    marginBottom: 2,
  },
  tournamentName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
  },
  teamsVerticalContainer: {
    gap: 12,
  },
  teamSection: {
    borderRadius: 12,
    backgroundColor: "#F8F9FA",
    padding: 12,
  },
  teamPlayers: {
    gap: 8,
  },
  scoreDisplayContainer: {
    alignItems: "center",
    paddingVertical: 8,
  },
  scoreDisplayText: {
    fontSize: 20,
    fontWeight: "900",
    color: "#333",
    letterSpacing: 2,
  },
  videoButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingTop: 12,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
  },
  videoText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FF3B30",
  },

  /* Player Row Compact (for Match Cards) */
  playerRowCompact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  playerAvatarCompact: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#FFF",
  },
  playerInfoCompact: {
    flex: 1,
    minWidth: 0,
  },
  playerNameCompact: {
    fontSize: 13,
    fontWeight: "500",
    color: "#333",
  },
  playerNameHighlight: {
    fontWeight: "700",
    color: "#1976D2",
  },
  scoreChangeCompact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  scoreChangeTextCompact: {
    fontSize: 11,
    color: "#666",
  },
  deltaTextCompact: {
    fontSize: 10,
    fontWeight: "700",
  },

  /* Rating Tab */
  ratingTab: {
    gap: 12,
  },
  ratingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FFF",
    padding: 16,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  ratingRowSmall: {
    flexDirection: "column", // 👈 nhỏ thì chia 2 dòng
    alignItems: "flex-start",
  },
  ratingLeft: {
    flex: 1,
  },
  ratingDate: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  ratingScorer: {
    fontSize: 12,
    color: "#999",
  },
  ratingScores: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap", // 👈 tránh tràn trên màn nhỏ
  },
  ratingScoresSmall: {
    marginTop: 8,
    alignSelf: "stretch",
    justifyContent: "flex-start",
  },
  ratingScoreBadge: {
    backgroundColor: "#F3E5F5",
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
  ratingDelta: {
    fontSize: 10,
    fontWeight: "700",
  },

  /* Empty State */
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: "#999",
    marginTop: 16,
  },

  /* Pagination */
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
    backgroundColor: "#FFF",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  pageButtonDisabled: {
    opacity: 0.3,
  },
  pageText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },
});
