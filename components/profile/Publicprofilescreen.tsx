/* eslint-disable react/prop-types */
import React, { useMemo, useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
  Share,
  Clipboard,
  Alert,
  ActivityIndicator,
  StatusBar,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useSelector } from "react-redux";
import * as Haptics from "expo-haptics";
import { useTheme } from "@react-navigation/native";

import ImageViewing from "react-native-image-viewing";

import {
  Ionicons,
  MaterialCommunityIcons,
  FontAwesome5,
} from "@expo/vector-icons";

import {
  useGetPublicProfileQuery,
  useGetRatingHistoryQuery,
  useGetMatchHistoryQuery,
  useDeleteRatingHistoryMutation,
} from "@/slices/usersApiSlice";
import { useLocalSearchParams, router } from "expo-router";
import { normalizeUrl } from "@/utils/normalizeUri";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const HEADER_HEIGHT = 350;
const AVATAR_SIZE = 120;
const isSmallDevice = SCREEN_WIDTH <= 360;

/* ---------- CONSTANTS & UTILS ---------- */
const AVA_PLACE = "https://dummyimage.com/160x160/cccccc/ffffff&text=?";
const tz = { timeZone: "Asia/Bangkok" };

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

// 🟢 Helper lấy thông tin trạng thái KYC
const getKycStatusMeta = (status) => {
  switch (status) {
    case "verified":
      return {
        label: "Đã xác thực",
        color: "#4CAF50",
        icon: "checkmark-circle",
      }; // Xanh lá
    case "pending":
      return { label: "Chờ duyệt", color: "#FF9800", icon: "time" }; // Cam
    case "rejected":
      return { label: "Bị từ chối", color: "#F44336", icon: "alert-circle" }; // Đỏ
    default:
      return null;
  }
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

const StatCard = ({ icon, value, label, gradient }) => (
  <LinearGradient
    colors={gradient}
    start={{ x: 0, y: 0 }}
    end={{ x: 1, y: 1 }}
    style={[styles.statCard, isSmallDevice && styles.statCardSmall]}
  >
    <View style={styles.statIconContainer}>{icon}</View>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </LinearGradient>
);

const InfoBadge = ({ icon, text, color = "#666", bgColor }) => (
  <View
    style={[
      styles.badge,
      {
        borderColor: bgColor ? "transparent" : color,
        backgroundColor: bgColor || "transparent",
      },
    ]}
  >
    {icon}
    <Text style={[styles.badgeText, { color: bgColor ? "#FFF" : color }]}>
      {text}
    </Text>
  </View>
);

const MatchCard = ({ match, userId, onPress, colors }) => {
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
      <View
        style={[styles.matchCardContainer, { backgroundColor: colors.card }]}
      >
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
            <Text style={[styles.matchDate, { color: colors.subText }]}>
              {fmtDT(match.dateTime)}
            </Text>
            <Text style={[styles.tournamentName, { color: colors.text }]}>
              {match.tournament?.name || "Giao hữu"}
            </Text>
          </View>
        </View>

        <View style={styles.teamsVerticalContainer}>
          <View
            style={[styles.teamSection, { backgroundColor: colors.bgMuted }]}
          >
            <View style={styles.teamPlayers}>
              {match.team1?.map((p, i) => (
                <PlayerRowCompact
                  key={i}
                  player={p}
                  highlight={winnerA}
                  colors={colors}
                />
              ))}
            </View>
          </View>
          <View style={styles.scoreDisplayContainer}>
            <Text style={[styles.scoreDisplayText, { color: colors.text }]}>
              {match.scoreText || "VS"}
            </Text>
          </View>
          <View
            style={[styles.teamSection, { backgroundColor: colors.bgMuted }]}
          >
            <View style={styles.teamPlayers}>
              {match.team2?.map((p, i) => (
                <PlayerRowCompact
                  key={i}
                  player={p}
                  highlight={winnerB}
                  colors={colors}
                />
              ))}
            </View>
          </View>
        </View>

        {match.video && (
          <TouchableOpacity
            style={[
              styles.videoButton,
              { borderTopColor: colors.border || "#F0F0F0" },
            ]}
          >
            <Ionicons name="play-circle" size={18} color="#FF3B30" />
            <Text style={styles.videoText}>Video</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
};

const PlayerRowCompact = ({ player, highlight, colors }) => {
  const up = (player?.delta ?? 0) > 0;
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
        style={[styles.playerAvatarCompact, { borderColor: colors.card }]}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={150}
      />
      <View style={styles.playerInfoCompact}>
        <Text
          style={[
            styles.playerNameCompact,
            { color: colors.text },
            highlight && { color: colors.primary, fontWeight: "700" },
          ]}
          numberOfLines={1}
        >
          {name}
        </Text>
        {player?.postScore !== undefined && player?.postScore !== null && (
          <View style={styles.scoreChangeCompact}>
            <Text
              style={[styles.scoreChangeTextCompact, { color: colors.subText }]}
            >
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

const RatingHistoryRow = ({
  item,
  prevItem,
  isAdmin,
  isDeleting,
  onDelete,
  colors,
}) => {
  const singleDelta = prevItem ? item.single - prevItem.single : 0;
  const doubleDelta = prevItem ? item.double - prevItem.double : 0;

  return (
    <View
      style={[
        styles.ratingRow,
        { backgroundColor: colors.card },
        isSmallDevice && styles.ratingRowSmall,
      ]}
    >
      {isAdmin && (
        <TouchableOpacity
          style={styles.deleteItemButton}
          onPress={onDelete}
          disabled={isDeleting}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          {isDeleting ? (
            <ActivityIndicator size="small" color="#FF3B30" />
          ) : (
            <Ionicons name="trash-outline" size={18} color="#FF3B30" />
          )}
        </TouchableOpacity>
      )}

      <View style={styles.ratingLeft}>
        <Text style={[styles.ratingDate, { color: colors.text }]}>
          {fmtDate(item.scoredAt)}
        </Text>
        <Text style={[styles.ratingScorer, { color: colors.subText }]}>
          {item.scorer?.name || "Hệ thống"}
        </Text>
      </View>
      <View
        style={[styles.ratingScores, isSmallDevice && styles.ratingScoresSmall]}
      >
        <View
          style={[styles.ratingScoreBadge, { backgroundColor: colors.bgMuted }]}
        >
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
        <View
          style={[
            styles.ratingScoreBadge,
            { backgroundColor: colors.isDark ? "#1A2733" : "#E3F2FD" },
          ]}
        >
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

const InfoItem = ({ label, value, copyable, onCopy, colors }) => {
  const display =
    value === null || value === undefined || value === "" ? "—" : value;

  return (
    <View style={styles.infoItem}>
      <Text style={[styles.infoLabel, { color: colors.subText }]}>{label}</Text>
      <View style={styles.infoValueContainer}>
        <Text
          style={[styles.infoValue, { color: colors.text }]}
          numberOfLines={2}
        >
          {display}
        </Text>
        {copyable && display !== "—" && (
          <TouchableOpacity
            onPress={() => onCopy(display, label)}
            style={styles.copyButton}
          >
            <Ionicons name="copy-outline" size={16} color={colors.subText} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

/* ---------- SKELETON COMPONENTS ---------- */
const SkeletonItem = ({
  width,
  height,
  borderRadius = 4,
  style,
  baseColor,
}) => {
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
          backgroundColor: baseColor || "#E1E9EE",
          opacity: animatedValue,
        },
        style,
      ]}
    />
  );
};

const ProfileSkeleton = ({ isDark }) => {
  const skelColor = isDark ? "#333" : "#E1E9EE";
  const bgColor = isDark ? "#121212" : "#F5F7FA";
  const cardColor = isDark ? "#1E1E1E" : "#FFF";

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: bgColor }]}
      edges={["top"]}
    >
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
            backgroundColor: isDark ? "#2C2C2E" : "#D1D5DB",
            borderBottomLeftRadius: 24,
            borderBottomRightRadius: 24,
          }}
        />
        <View style={{ marginBottom: 12, alignItems: "center" }}>
          <SkeletonItem
            width={AVATAR_SIZE}
            height={AVATAR_SIZE}
            borderRadius={AVATAR_SIZE / 2}
            baseColor={skelColor}
            style={{ borderWidth: 4, borderColor: cardColor }}
          />
        </View>
        <SkeletonItem
          width={200}
          height={28}
          borderRadius={8}
          baseColor={skelColor}
          style={{ marginBottom: 8 }}
        />
        <SkeletonItem
          width={120}
          height={20}
          borderRadius={16}
          baseColor={skelColor}
          style={{ marginBottom: 16 }}
        />
      </View>
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 20 }}>
        <View style={{ flexDirection: "row", gap: 12, marginBottom: 24 }}>
          {[1, 2, 3].map((i) => (
            <View
              key={i}
              style={{
                flex: 1,
                height: 100,
                backgroundColor: cardColor,
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
                baseColor={skelColor}
                style={{ marginBottom: 8 }}
              />
              <SkeletonItem
                width={40}
                height={20}
                borderRadius={4}
                baseColor={skelColor}
              />
            </View>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
};

/* ---------- MAIN COMPONENT ---------- */
export default function PublicProfileScreen() {
  const theme = useTheme();
  const isDark = theme.dark;

  // 🟢 Theme Colors
  const colors = {
    isDark,
    primary: theme.colors.primary || "#6366F1",
    bg: isDark ? "#121212" : "#F5F7FA",
    card: isDark ? "#1E1E1E" : "#FFFFFF",
    text: isDark ? "#FFFFFF" : "#333333",
    subText: isDark ? "#A0A0A0" : "#666666",
    border: isDark ? "#333333" : "#E0E0E0",
    bgMuted: isDark ? "#2C2C2E" : "#F8F9FA",
    tabActive: "#6366F1",
    tabInactive: isDark ? "#A0A0A0" : "#666666",
  };

  const params = useLocalSearchParams();
  const { id } = params;
  const [activeTab, setActiveTab] = useState(0);
  const scrollY = new Animated.Value(0);
  const scrollViewRef = React.useRef(null);

  const [isImageViewVisible, setIsImageViewVisible] = useState(false);
  const [isAvatarLoading, setIsAvatarLoading] = useState(false);

  // Queries
  const baseQ = useGetPublicProfileQuery(id);
  const rateQ = useGetRatingHistoryQuery(id);
  const matchQ = useGetMatchHistoryQuery(id);

  const [deleteHistory, { isLoading: deleting }] =
    useDeleteRatingHistoryMutation();
  const [deletingId, setDeletingId] = useState(null);

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

  // 🟢 2. Tính toán trạng thái KYC & Logic hiển thị nút
  const kycStatusMeta = getKycStatusMeta(base?.cccdStatus);
  const showKycCheckButton =
    isAdminViewer &&
    ["pending", "verified", "rejected"].includes(base?.cccdStatus);

  // Latest ratings (Logic giữ nguyên)
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

  const handleMatchPress = (matchId) => {
    router.push(`/match/${matchId}/home`);
  };

  const handleCheckKyc = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Điều hướng tới màn soi KYC
    router.push(`/user/${uid}/kyc`);
  };

  const handleDeleteHistory = (h) => {
    if (!isAdminViewer) return;
    const historyId = h?._id ?? h?.id;
    const targetUid = h?.user?._id || id;

    if (!historyId || !targetUid) {
      Alert.alert("Lỗi", "Thiếu ID, không thể xoá.");
      return;
    }

    Alert.alert(
      "Xoá chấm trình?",
      "Bạn có chắc chắn muốn xoá mục lịch sử điểm trình này? Hành động không thể hoàn tác.",
      [
        { text: "Huỷ", style: "cancel" },
        {
          text: "Xoá",
          style: "destructive",
          onPress: async () => {
            try {
              setDeletingId(historyId);
              await deleteHistory({
                userId: String(targetUid),
                historyId: String(historyId),
              }).unwrap();
              setPageRate(1);
              await rateQ.refetch?.();
              Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success
              );
              Alert.alert("Thành công", "Đã xoá một mục lịch sử điểm trình.");
            } catch (e) {
              Alert.alert("Lỗi", "Xoá thất bại. Vui lòng thử lại.");
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]
    );
  };

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
    return <ProfileSkeleton isDark={isDark} />;
  }

  if (baseQ.error) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={64} color="#F44336" />
          <Text style={[styles.errorText, { color: colors.subText }]}>
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

  const avatarUrl = normalizeUrl(base?.avatar) || AVA_PLACE;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.bg }]}
      edges={["top"]}
    >
      <StatusBar barStyle="light-content" />

      {/* Animated Header */}
      <Animated.View style={[styles.header, { opacity: headerOpacity }]}>
        <LinearGradient
          colors={["#6366F1", "#8B5CF6", "#EC4899"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <View style={styles.headerCircle1} />
          <View style={styles.headerCircle2} />

          <Animated.View
            style={[
              styles.avatarContainer,
              { transform: [{ scale: avatarScale }] },
            ]}
          >
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => setIsImageViewVisible(true)}
              style={[styles.avatarWrapper, { borderColor: colors.card }]}
            >
              <Image
                source={{ uri: avatarUrl }}
                style={styles.avatar}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={200}
                onLoadStart={() => setIsAvatarLoading(true)}
                onLoad={() => setIsAvatarLoading(false)}
              />
              {isAvatarLoading && (
                <View style={styles.avatarLoadingOverlay}>
                  <ActivityIndicator size="small" color="#FFF" />
                </View>
              )}
            </TouchableOpacity>

            {base?.isAdmin && (
              <View
                style={[styles.verifiedBadge, { borderColor: colors.card }]}
              >
                <Ionicons name="shield-checkmark" size={20} color="#FFF" />
              </View>
            )}
          </Animated.View>

          <Text style={styles.userName}>
            {base?.name || base?.fullName || "Người dùng"}
          </Text>
          <View style={styles.nicknameContainer}>
            <Text style={styles.userNickname}>
              @{base?.nickname || "no_nick"}
            </Text>
          </View>

          {/* 🟢 5. CONTAINER NÀY ĐÃ CẬP NHẬT WRAP & CENTER */}
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

            {/* 🟢 3. Chip trạng thái KYC */}
            {kycStatusMeta && (
              <InfoBadge
                icon={
                  <Ionicons name={kycStatusMeta.icon} size={14} color="#FFF" />
                }
                text={kycStatusMeta.label}
                bgColor={kycStatusMeta.color}
              />
            )}

            {/* 🟢 4. Nút Xem KYC (Chỉ hiện khi cần thiết) */}
            {showKycCheckButton && (
              <TouchableOpacity
                onPress={handleCheckKyc}
                style={styles.adminKycButton}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name="card-account-details-outline"
                  size={14}
                  color="#FFF"
                />
                <Text style={styles.adminKycText}>Xem KYC</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Ionicons name="chevron-back" size={24} color="#FFF" />
          </TouchableOpacity>

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
            gradient={["#6366F1", "#8B5CF6"]}
          />
          <StatCard
            icon={<FontAwesome5 name="trophy" size={28} color="#FFF" />}
            value={`${wins} (${winRate}%)`}
            label="Chiến thắng"
            gradient={["#F59E0B", "#EF4444"]}
          />
          <StatCard
            icon={<Ionicons name="trending-up" size={32} color="#FFF" />}
            value={`${num(latestSingle)} / ${num(latestDouble)}`}
            label="Điểm Đơn/Đôi"
            gradient={["#10B981", "#059669"]}
          />
        </View>

        {/* Tab Navigation */}
        <View style={styles.tabContainer}>
          <View style={[styles.tabWrapper, { backgroundColor: colors.card }]}>
            {["Hồ sơ", "Lịch sử thi đấu", "Điểm trình"].map((tab, index) => (
              <TouchableOpacity
                key={index}
                style={[styles.tab, activeTab === index && styles.tabActive]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setActiveTab(index);
                  scrollViewRef.current?.scrollTo({ y: 0, animated: true });
                }}
              >
                <Text
                  style={[
                    styles.tabText,
                    { color: colors.tabInactive },
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
              <View style={[styles.section, { backgroundColor: colors.card }]}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  Giới thiệu
                </Text>
                <Text style={[styles.bioText, { color: colors.subText }]}>
                  {base?.bio || "Chưa có thông tin."}
                </Text>
              </View>
              <View style={[styles.section, { backgroundColor: colors.card }]}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  Thông tin cơ bản
                </Text>
                <View style={styles.infoGrid}>
                  {hasData(base?.name || base?.fullName) && (
                    <InfoItem
                      label="Họ và tên"
                      value={base?.name || base?.fullName}
                      colors={colors}
                    />
                  )}
                  {hasData(base?.nickname) && (
                    <InfoItem
                      label="Nickname"
                      value={base?.nickname}
                      copyable
                      onCopy={handleCopy}
                      colors={colors}
                    />
                  )}
                  {hasData(genderInfo.label) && (
                    <InfoItem
                      label="Giới tính"
                      value={genderInfo.label}
                      colors={colors}
                    />
                  )}
                  {hasData(base?.province) && (
                    <InfoItem
                      label="Tỉnh thành"
                      value={base?.province}
                      colors={colors}
                    />
                  )}
                  {hasData(dob) && (
                    <InfoItem
                      label="Ngày sinh"
                      value={fmtDate(dob)}
                      colors={colors}
                    />
                  )}
                  {hasData(calcAge(dob)) && (
                    <InfoItem
                      label="Tuổi"
                      value={`${calcAge(dob)} tuổi`}
                      colors={colors}
                    />
                  )}
                  {hasData(handLabel) && (
                    <InfoItem
                      label="Tay thuận"
                      value={handLabel}
                      colors={colors}
                    />
                  )}
                </View>
              </View>
              <View style={[styles.section, { backgroundColor: colors.card }]}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  Thông tin thi đấu
                </Text>
                <View style={styles.infoGrid}>
                  {hasData(clubName) && (
                    <InfoItem
                      label="CLB chính"
                      value={clubName}
                      colors={colors}
                    />
                  )}
                  <InfoItem
                    label="Điểm đơn"
                    value={num(latestSingle)}
                    colors={colors}
                  />
                  <InfoItem
                    label="Điểm đôi"
                    value={num(latestDouble)}
                    colors={colors}
                  />
                  <InfoItem
                    label="Tổng trận"
                    value={`${totalMatches || 0} trận`}
                    colors={colors}
                  />
                  <InfoItem
                    label="Thắng / Tỷ lệ"
                    value={`${wins || 0} (${winRate}%)`}
                    colors={colors}
                  />
                </View>
              </View>
              {canSeeSensitive && hasContactBlock && (
                <View
                  style={[styles.section, { backgroundColor: colors.card }]}
                >
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>
                    Thông tin liên hệ
                  </Text>
                  <View style={styles.infoGrid}>
                    {hasData(base?.phone) && (
                      <InfoItem
                        label="Số điện thoại"
                        value={base?.phone}
                        copyable
                        onCopy={handleCopy}
                        colors={colors}
                      />
                    )}
                    {hasData(base?.email) && (
                      <InfoItem
                        label="Email"
                        value={base?.email}
                        copyable
                        onCopy={handleCopy}
                        colors={colors}
                      />
                    )}
                    {hasData(base?.address || base?.street) && (
                      <InfoItem
                        label="Địa chỉ"
                        value={base?.address || base?.street}
                        colors={colors}
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
                    color={isDark ? "#333" : "#E0E0E0"}
                  />
                  <Text style={[styles.emptyText, { color: colors.subText }]}>
                    Chưa có dữ liệu trận đấu
                  </Text>
                </View>
              ) : (
                <>
                  {matchPaged.map((match) => (
                    <MatchCard
                      key={match._id}
                      match={match}
                      userId={uid}
                      colors={colors}
                      onPress={() =>
                        handleMatchPress(match._id || match.id || match.code)
                      }
                    />
                  ))}
                  {matchRaw.length > matchPerPage && (
                    <View style={styles.pagination}>
                      <TouchableOpacity
                        style={[
                          styles.pageButton,
                          { backgroundColor: colors.card },
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
                        <Ionicons
                          name="chevron-back"
                          size={20}
                          color={colors.subText}
                        />
                      </TouchableOpacity>
                      <Text style={[styles.pageText, { color: colors.text }]}>
                        {pageMatch} /{" "}
                        {Math.ceil(matchRaw.length / matchPerPage)}
                      </Text>
                      <TouchableOpacity
                        style={[
                          styles.pageButton,
                          { backgroundColor: colors.card },
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
                          color={colors.subText}
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
                  <Ionicons
                    name="stats-chart"
                    size={64}
                    color={isDark ? "#333" : "#E0E0E0"}
                  />
                  <Text style={[styles.emptyText, { color: colors.subText }]}>
                    Chưa có lịch sử điểm
                  </Text>
                </View>
              ) : (
                <>
                  {ratePaged.map((item, index) => {
                    const prevItem =
                      index < ratePaged.length - 1
                        ? ratePaged[index + 1]
                        : null;
                    return (
                      <RatingHistoryRow
                        key={item._id || item.id}
                        item={item}
                        prevItem={prevItem}
                        isAdmin={isAdminViewer}
                        colors={colors}
                        isDeleting={
                          deleting && deletingId === (item._id || item.id)
                        }
                        onDelete={() => handleDeleteHistory(item)}
                      />
                    );
                  })}
                  {ratingRaw.length > ratePerPage && (
                    <View style={styles.pagination}>
                      <TouchableOpacity
                        style={[
                          styles.pageButton,
                          { backgroundColor: colors.card },
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
                        <Ionicons
                          name="chevron-back"
                          size={20}
                          color={colors.subText}
                        />
                      </TouchableOpacity>
                      <Text style={[styles.pageText, { color: colors.text }]}>
                        {pageRate} / {Math.ceil(ratingRaw.length / ratePerPage)}
                      </Text>
                      <TouchableOpacity
                        style={[
                          styles.pageButton,
                          { backgroundColor: colors.card },
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
                          color={colors.subText}
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

      {/* 🟢 6. Image Viewer với Theme Support */}
      <ImageViewing
        images={[{ uri: avatarUrl }]}
        imageIndex={0}
        visible={isImageViewVisible}
        onRequestClose={() => setIsImageViewVisible(false)}
        swipeToCloseEnabled
        doubleTapToZoomEnabled
        // 🟢 Nền đen cho Dark Mode, Trắng cho Light Mode (hoặc đen luôn nếu muốn)
        backgroundColor={isDark ? "#000000" : "#FFFFFF"}
        FooterComponent={() => (
          <View style={{ padding: 20, alignItems: "center", marginBottom: 20 }}>
            <Text
              style={{
                color: isDark ? "#FFF" : "#333",
                fontSize: 16,
                fontWeight: "600",
              }}
            >
              {base?.name || "Ảnh đại diện"}
            </Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

/* ---------- STYLES ---------- */
const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    textAlign: "center",
    marginTop: 16,
  },
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
  avatarWrapper: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 4,
    overflow: "hidden",
    position: "relative",
  },
  avatar: {
    width: "100%",
    height: "100%",
  },
  avatarLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
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
    zIndex: 5,
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
    flexWrap: "wrap", // 🟢 Cho phép xuống dòng
    justifyContent: "center", // 🟢 Căn giữa
    gap: 8,
    alignItems: "center",
    maxWidth: "90%",
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
  adminKycButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#F59E0B",
    gap: 4,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  adminKycText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFF",
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: HEADER_HEIGHT + 20,
    paddingBottom: 40,
  },
  statsContainer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 24,
  },
  statsContainerSmall: {
    flexDirection: "column",
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
  tabContainer: {
    marginBottom: 20,
    paddingHorizontal: 16,
  },
  tabWrapper: {
    flexDirection: "row",
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
  },
  tabTextActive: {
    color: "#FFF",
  },
  tabContent: {
    paddingHorizontal: 16,
  },
  profileTab: {
    gap: 20,
  },
  section: {
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
    marginBottom: 16,
  },
  bioText: {
    fontSize: 14,
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
    fontWeight: "500",
    flex: 1,
  },
  copyButton: {
    padding: 4,
  },
  matchTab: {
    gap: 16,
  },
  matchCard: {
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 12,
  },
  matchCardContainer: {
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
    marginBottom: 2,
  },
  tournamentName: {
    fontSize: 13,
    fontWeight: "600",
  },
  teamsVerticalContainer: {
    gap: 12,
  },
  teamSection: {
    borderRadius: 12,
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
  },
  videoText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FF3B30",
  },
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
  },
  playerInfoCompact: {
    flex: 1,
    minWidth: 0,
  },
  playerNameCompact: {
    fontSize: 13,
    fontWeight: "500",
  },
  scoreChangeCompact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  scoreChangeTextCompact: {
    fontSize: 11,
  },
  deltaTextCompact: {
    fontSize: 10,
    fontWeight: "700",
  },
  ratingTab: {
    gap: 12,
  },
  ratingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    position: "relative",
  },
  ratingRowSmall: {
    flexDirection: "column",
    alignItems: "flex-start",
  },
  deleteItemButton: {
    position: "absolute",
    top: 10,
    right: 10,
    zIndex: 10,
    padding: 4,
    borderRadius: 8,
    backgroundColor: "rgba(255,59,48,0.1)",
  },
  ratingLeft: {
    flex: 1,
    paddingRight: 32,
  },
  ratingDate: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  ratingScorer: {
    fontSize: 12,
  },
  ratingScores: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  ratingScoresSmall: {
    marginTop: 8,
    alignSelf: "stretch",
    justifyContent: "flex-start",
  },
  ratingScoreBadge: {
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
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    marginTop: 16,
  },
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
  },
});
