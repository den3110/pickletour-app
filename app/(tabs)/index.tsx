// app/index.jsx  (Home)
import React, { useMemo, useEffect, useRef, useState } from "react";
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  Platform,
  Linking,
  Alert,
  TouchableOpacity,
  Animated,
  FlatList,
  Dimensions,
} from "react-native";
import { Stack, router } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { useSelector } from "react-redux";
import Hero from "@/components/Hero";
import {
  AntDesign,
  FontAwesome,
  MaterialIcons,
  Ionicons,
  FontAwesome5,
} from "@expo/vector-icons";
import { Image } from "expo-image";
import { useGetContactContentQuery } from "@/slices/cmsApiSlice";
import { useGetTournamentsQuery } from "@/slices/tournamentsApiSlice";
import { useGetNewsQuery } from "@/slices/newsApiSlice";
import LottieView from "lottie-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { normalizeUrl } from "@/utils/normalizeUri";
import { useGetFeaturedLeaderboardQuery } from "@/slices/leaderboardApiSlice";
import { useDispatch } from "react-redux";
import { useReauthQuery } from "@/slices/usersApiSlice";
import { setCredentials } from "@/slices/authSlice";
import { saveUserInfo } from "@/utils/authStorage";
import ImageViewing from "react-native-image-viewing";
import TestNotificationButton from "@/tests/TestNotifcation";
/* ---------- Lottie asset ---------- */
const BG_3D = require("@/assets/lottie/bg-3d.json");

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = SCREEN_WIDTH * 0.8;
const CARD_MARGIN = 16;

/* ---------- Fallback ---------- */
const FALLBACK = {
  address: "Abcd, abcd, abcd",
  phone: "012345678",
  email: "support@pickletour.vn",
  support: {
    generalEmail: "support@pickletour.vn",
    generalPhone: "0123456789",
    scoringEmail: "support@pickletour.vn",
    scoringPhone: "0123456789",
    salesEmail: "support@pickletour.vn",
  },
  socials: {
    facebook: "https://facebook.com",
    youtube: "https://youtube.com",
    zalo: "#",
  },
};

/* ---------- Features Data ---------- */
const FEATURES = [
  {
    id: 1,
    icon: "calendar",
    iconLib: "Ionicons",
    title: "Lịch thi đấu",
    color: "#FF6B6B",
    link: "/schedule",
  },
  {
    id: 2,
    icon: "trophy",
    iconLib: "Ionicons",
    title: "Bảng xếp hạng",
    color: "#4ECDC4",
    link: "/rankings/stack",
  },
  {
    id: 3,
    icon: "stats-chart",
    iconLib: "Ionicons",
    title: "Thống kê",
    color: "#45B7D1",
    link: "/stats/user",
  },
  {
    id: 4,
    icon: "school", // 🔁 đổi icon cho hợp “Hướng dẫn”
    iconLib: "Ionicons",
    title: "Hướng dẫn", // 🔁 đổi tiêu đề
    color: "#FFA502",
    link: "/guide", // 🔁 trỏ sang màn mới
  },
  {
    id: 5,
    icon: "newspaper",
    iconLib: "Ionicons",
    title: "Tin tức",
    color: "#A29BFE",
    link: "/news",
  },
  {
    id: 6,
    icon: "videocam", // 🔧 Đổi icon cho Live
    iconLib: "Ionicons",
    title: "Live", // 🔧 Đổi từ "Video" thành "Live"
    color: "#FD79A8",
    link: "/live/home",
  },
  {
    id: 7,
    icon: "calculator", // 🔧 Icon cho chấm điểm
    iconLib: "Ionicons",
    title: "Chấm trình", // 🔧 Đổi từ "Địa điểm" thành "Chấm điểm"
    color: "#00B894",
    link: "/levelpoint",
  },
  {
    id: 8,
    icon: "people-circle", // 🔧 Icon cho câu lạc bộ
    iconLib: "Ionicons",
    title: "Câu lạc bộ", // 🔧 Đổi từ "Vé tham gia" thành "Câu lạc bộ"
    color: "#FDCB6E",
    link: "/clubs",
  },
];
/* ---------- Mock Leaderboard Data ---------- */
const LEADERBOARD_DATA = [
  {
    id: 1,
    rank: 1,
    name: "Nguyễn Văn A",
    avatar: "https://i.pravatar.cc/150?img=12",
    achievement: "🏆 Vô địch MB D-Joy Tour 2025",
    tier: "gold",
  },
  {
    id: 2,
    rank: 2,
    name: "Trần Thị B",
    avatar: "https://i.pravatar.cc/150?img=45",
    achievement: "🥈 Á quân Vietnam Masters",
    tier: "silver",
  },
  {
    id: 3,
    rank: 3,
    name: "Lê Văn C",
    avatar: "https://i.pravatar.cc/150?img=33",
    achievement: "🥉 Hạng 3 PPA Vietnam Cup",
    tier: "bronze",
  },
];

/* ---------- Utils ---------- */
function openURL(url) {
  if (!url) return;
  Linking.canOpenURL(url)
    .then((ok) =>
      ok ? Linking.openURL(url) : Alert.alert("Lỗi", "Không mở được liên kết.")
    )
    .catch(() => Alert.alert("Lỗi", "Không mở được liên kết."));
}

function formatDate(d) {
  if (!d) return "-";
  try {
    const dt = new Date(d);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const day = String(dt.getDate()).padStart(2, "0");
    return `${day}/${m}/${y}`;
  } catch {
    return "-";
  }
}

function LinkText({ text, url, tint }) {
  if (!text) return <Text style={{ color: "#9aa0a6" }}>—</Text>;
  return (
    <Text
      style={{
        color: tint,
        fontWeight: Platform.select({ ios: "600", android: "700" }),
      }}
      onPress={() => openURL(url)}
      suppressHighlighting
    >
      {text}
    </Text>
  );
}

function InfoRow({ icon, label, children, color }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        marginVertical: 8,
      }}
    >
      <View style={{ width: 32, alignItems: "center", marginRight: 10 }}>
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{ fontWeight: "700", fontSize: 14, color, marginBottom: 4 }}
        >
          {label}
        </Text>
        {typeof children === "string" ? (
          <Text style={{ fontSize: 15, color }}>{children}</Text>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

function SocialButton({ onPress, children, bg }) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      style={{
        width: 48,
        height: 48,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: bg,
        shadowColor: "#000",
        shadowOpacity: 0.2,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: 4,
      }}
    >
      {children}
    </TouchableOpacity>
  );
}

const ZALO_SRC = require("@/assets/images/icon-zalo.png");

/* ---------- 🆕 Animated Gradient Button Component ---------- */
function AnimatedGradientButton({ onPress, children, colors, style }) {
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: false,
        }),
        Animated.timing(animatedValue, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: false,
        }),
      ])
    ).start();
  }, []);

  const interpolatedColors = animatedValue.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [colors[0], colors[1], colors[0]],
  });

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[styles.registerButtonWrapper, style]}
    >
      <Animated.View
        style={[styles.registerButton, { backgroundColor: interpolatedColors }]}
      >
        {children}
      </Animated.View>
    </TouchableOpacity>
  );
}

/* ---------- 🆕 Animated Status Chip ---------- */
function AnimatedStatusChip() {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scaleAnim, {
            toValue: 1.05,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 0.8,
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
          Animated.timing(opacityAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.statusBadgeOnImage,
        {
          transform: [{ scale: scaleAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      <LinearGradient
        colors={["#4ECDC4", "#45B7D1"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.statusBadgeGradient}
      >
        <Ionicons name="time-outline" size={14} color="#FFFFFF" />
        <Text style={styles.statusBadgeText}>Sắp diễn ra</Text>
      </LinearGradient>
    </Animated.View>
  );
}

/* ---------- Animated PickleTour Logo ---------- */
function AnimatedLogo() {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 20,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 3000,
          useNativeDriver: true,
        }),
        Animated.timing(rotateAnim, {
          toValue: 0,
          duration: 3000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["-2deg", "2deg"],
  });

  return (
    <Animated.View
      style={{
        opacity: fadeAnim,
        transform: [{ scale: scaleAnim }, { rotate }],
        marginBottom: 12,
      }}
    >
      <LinearGradient
        colors={["#FF6B6B", "#4ECDC4", "#45B7D1"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.logoGradient}
      >
        <Text style={styles.logoText}>PickleTour</Text>
      </LinearGradient>

      <View style={styles.logoGlow}>
        <Text style={[styles.logoText, { color: "transparent" }]}>
          PickleTour
        </Text>
      </View>
    </Animated.View>
  );
}

/* ---------- Athlete Island Card với thông tin thật ---------- */
function AthleteIsland() {
  const userInfo = useSelector((s) => s.auth?.userInfo);
  const goProfile = React.useCallback(() => {
    router.push("/profile/stack");
  }, []);

  const rankNo = userInfo?.rankNo ?? userInfo?.rank?.rankNo ?? null; // CHANGED: dùng rankNo

  let rankDisplay = "";
  let rankIcon = "emoji-events";
  let rankColor = "#FFD700";

  if (Number.isFinite(rankNo)) {
    if (rankNo <= 100) {
      rankDisplay = `TOP ${rankNo}`;
      rankIcon = "emoji-events";
      rankColor = "#FFD700";
    } else {
      rankDisplay = `Hạng ${rankNo}`;
      rankIcon = "military-tech";
      rankColor = "#FFA502";
    }
  } else {
    rankDisplay = "Chưa xếp hạng";
    rankIcon = "star-border";
    rankColor = "#9AA0A6";
  }

  const avatarUrl =
    normalizeUrl(userInfo?.avatar) || "https://i.pravatar.cc/150?img=12";
  const name = userInfo?.name || "Người dùng";
  // console.log(userInfo?.role);
  const roleUser = () => {
    switch (userInfo?.role) {
      case "user":
        return "Vận động viên";
      case "referee":
        return "Trọng tài";
      case "admin":
        return "Admin";
      default:
        return "Khách";
    }
  };
  // 🆕 Trường hợp chưa đăng nhập
  if (!userInfo) {
    return (
      <View style={styles.islandContainer}>
        <AnimatedLogo />

        <View style={styles.athleteIsland}>
          <View style={styles.avatarContainer}>
            {/* Lottie avatar placeholder */}
            <LottieView
              source={require("@/assets/lottie/humans.json")}
              autoPlay
              loop
              style={styles.avatar}
              speed={0.4}
            />
          </View>

          <View style={styles.nameContainer}>
            <Text style={styles.athleteName}>Bắt đầu hành trình</Text>
            <Text style={styles.athleteTitle}>Cùng PickleTour</Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push("/login")}
            style={styles.loginButton}
          >
            <LinearGradient
              colors={["#4ECDC4", "#45B7D1"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.loginButtonGradient}
            >
              <Text style={styles.loginButtonText}>Đăng nhập</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.islandContainer}>
      <AnimatedLogo />

      <View style={styles.athleteIsland}>
        {/* Avatar -> Profile */}
        <TouchableOpacity
          style={styles.avatarContainer}
          activeOpacity={0.85}
          onPress={goProfile}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Image
            source={{ uri: normalizeUrl(avatarUrl) }}
            style={styles.avatar}
            contentFit="cover"
            transition={200}
          />
          <View style={styles.avatarBorder} />
        </TouchableOpacity>

        {/* Tên -> Profile */}
        <TouchableOpacity
          style={styles.nameContainer}
          activeOpacity={0.85}
          onPress={goProfile}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.athleteName} numberOfLines={1}>
            {name}
          </Text>

          <Text style={styles.athleteTitle}>{roleUser()}</Text>
        </TouchableOpacity>

        <LinearGradient
          colors={[rankColor, rankColor === "#FFD700" ? "#FFA500" : "#FF6B6B"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.rankBadge}
        >
          <MaterialIcons name={rankIcon} size={16} color="#FFFFFF" />
          <Text style={styles.rankText}>{rankDisplay}</Text>
        </LinearGradient>
      </View>
    </View>
  );
}

/* ---------- Feature Item - Fixed alignment ---------- */
function FeatureItem({ item, theme }) {
  const isDark = !!theme?.dark;
  const bg = theme?.colors?.card ?? (isDark ? "#14171c" : "#ffffff");
  const text = theme?.colors?.text ?? (isDark ? "#ffffff" : "#111111");
  const handlePress = () => {
    if (!item.link) return;

    if (typeof item.link === "string") {
      // External link
      if (item.link.startsWith("http")) {
        openURL(item.link);
        return;
      }

      // Internal route
      if (item.link.startsWith("/")) {
        router.push(item.link);
        return;
      }
    }
  };
  const renderIcon = () => {
    const iconProps = { name: item.icon, size: 28, color: item.color };

    switch (item.iconLib) {
      case "Ionicons":
        return <Ionicons {...iconProps} />;
      case "MaterialIcons":
        return <MaterialIcons {...iconProps} />;
      case "FontAwesome":
        return <FontAwesome {...iconProps} />;
      case "FontAwesome5":
        return <FontAwesome5 {...iconProps} />;
      default:
        return <Ionicons {...iconProps} />;
    }
  };

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={handlePress}
      style={[styles.featureItem, { backgroundColor: bg }]}
    >
      <View
        style={[
          styles.featureIconWrapper,
          { backgroundColor: `${item.color}15` },
        ]}
      >
        {renderIcon()}
      </View>
      <Text style={[styles.featureTitle, { color: text }]} numberOfLines={2}>
        {item.title}
      </Text>
    </TouchableOpacity>
  );
}

/* ---------- Features Grid ---------- */
function FeaturesGrid() {
  const theme = useTheme();
  const isDark = !!theme?.dark;
  const text = theme?.colors?.text ?? (isDark ? "#ffffff" : "#111111");

  return (
    <View style={styles.featuresContainer}>
      <Text style={[styles.sectionTitle, { color: text }]}>
        Tính năng PickleTour
      </Text>
      {__DEV__ && <TestNotificationButton />}
      <View style={styles.featuresGrid}>
        {FEATURES.map((item) => (
          <FeatureItem key={item.id} item={item} theme={theme} />
        ))}
      </View>
    </View>
  );
}

/* ---------- Tournament Card ---------- */
function TournamentCard({ tournament, theme }) {
  const isDark = !!theme?.dark;
  const bg = theme?.colors?.card ?? (isDark ? "#1a1d23" : "#ffffff");
  const text = theme?.colors?.text ?? (isDark ? "#ffffff" : "#111111");
  const subtext = isDark ? "#b0b0b0" : "#666666";
  const border = theme?.colors?.border ?? (isDark ? "#2a2e35" : "#e0e0e0");

  // 🔹 Nền cho image viewer theo theme
  const viewerBackground = isDark
    ? "rgba(0,0,0,0.98)"
    : "rgba(255,255,255,0.98)";

  const [imageVisible, setImageVisible] = useState(false);

  const imageUri =
    normalizeUrl(tournament.image) ||
    "https://dummyimage.com/600x400/4ECDC4/ffffff&text=Tournament";

  return (
    <View
      style={[
        styles.tournamentCard,
        { backgroundColor: bg, borderColor: border },
      ]}
    >
      {/* ... phần card y như cũ ... */}
      {/* Phần image: bấm vào chỉ mở viewer, KHÔNG điều hướng */}
      <View style={styles.tournamentImageContainer}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => setImageVisible(true)}
        >
          <Image
            source={{ uri: imageUri }}
            style={styles.tournamentImage}
            contentFit="cover"
            transition={200}
          />
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.7)"]}
            style={styles.tournamentImageGradient}
          />
          <AnimatedStatusChip />
        </TouchableOpacity>
      </View>

      {/* Phần info: bấm vào sẽ đi tới đăng ký */}
      <TouchableOpacity
        activeOpacity={0.95}
        onPress={() => router.push(`/tournament/${tournament._id}/register`)}
      >
        <View style={styles.tournamentInfo}>
          <Text
            style={[styles.tournamentName, { color: text }]}
            numberOfLines={2}
          >
            {tournament.name}
          </Text>

          <View style={styles.tournamentMetaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="calendar" size={16} color="#4ECDC4" />
              <Text style={[styles.metaText, { color: subtext }]}>
                {formatDate(tournament.startDate)}
              </Text>
            </View>

            <View style={styles.metaItem}>
              <Ionicons name="location" size={16} color="#FF6B6B" />
              <Text
                style={[styles.metaText, { color: subtext }]}
                numberOfLines={1}
              >
                {tournament.location || "Chưa có"}
              </Text>
            </View>
          </View>

          <View style={styles.registrationInfo}>
            <Ionicons name="people" size={16} color="#FFA502" />
            <Text style={[styles.registrationText, { color: subtext }]}>
              {tournament.registered}/{tournament.maxPairs} đã đăng ký
            </Text>
          </View>
        </View>
      </TouchableOpacity>

      <View style={styles.tournamentActions}>
        <AnimatedGradientButton
          onPress={() => router.push(`/tournament/${tournament._id}/register`)}
          colors={["#FF6B6B", "#FFA502", "#FFD700"]}
        >
          <Ionicons name="calendar-outline" size={20} color="#FFFFFF" />
          <Text style={styles.registerButtonText}>Đăng ký giải đấu</Text>
        </AnimatedGradientButton>
      </View>
      <ImageViewing
        images={[{ uri: imageUri }]}
        imageIndex={0}
        visible={imageVisible}
        onRequestClose={() => setImageVisible(false)}
        swipeToCloseEnabled
        backgroundColor={viewerBackground} // ✅ nền theo theme
      />
    </View>
  );
}

/* ---------- Tournaments Section ---------- */
function TournamentsSection() {
  const theme = useTheme();
  const flatListRef = useRef(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const isDark = !!theme?.dark;
  const bgColor = theme?.colors?.background ?? (isDark ? "#0b0f14" : "#f5f7fb");

  const { data: tournaments, isLoading } = useGetTournamentsQuery(
    { sportType: "2", groupId: "0" },
    { refetchOnFocus: false }
  );

  const upcomingTournaments = useMemo(() => {
    if (!Array.isArray(tournaments)) return [];
    return tournaments.filter((t) => t.status === "upcoming").slice(0, 5);
  }, [tournaments]);

  const scrollToIndex = (index) => {
    if (flatListRef.current && upcomingTournaments.length > 0) {
      flatListRef.current.scrollToIndex({
        index,
        animated: true,
      });
      setCurrentIndex(index);
    }
  };

  const handlePrev = () => {
    const newIndex =
      currentIndex > 0 ? currentIndex - 1 : upcomingTournaments.length - 1;
    scrollToIndex(newIndex);
  };

  const handleNext = () => {
    const newIndex =
      currentIndex < upcomingTournaments.length - 1 ? currentIndex + 1 : 0;
    scrollToIndex(newIndex);
  };

  if (isLoading || upcomingTournaments.length === 0) return null;

  return (
    <View style={styles.tournamentsSection}>
      <View style={styles.sectionHeaderWrapper}>
        <LinearGradient
          colors={["#FF6B6B", "#4ECDC4", "#45B7D1"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.sectionHeader}
        >
          <Ionicons name="trophy" size={24} color="#FFFFFF" />
          <Text style={styles.sectionHeaderText}>
            Đăng ký tham gia giải đấu
          </Text>
          <Ionicons name="trophy" size={24} color="#FFFFFF" />
        </LinearGradient>

        <View style={[styles.triangleLeft, { borderLeftColor: bgColor }]} />
        <View style={[styles.triangleRight, { borderRightColor: bgColor }]} />
      </View>

      <View style={styles.navigationContainer}>
        <TouchableOpacity
          onPress={handlePrev}
          style={styles.navArrow}
          activeOpacity={0.7}
        >
          <LinearGradient
            colors={["#4ECDC4", "#45B7D1"]}
            style={styles.navArrowGradient}
          >
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleNext}
          style={styles.navArrow}
          activeOpacity={0.7}
        >
          <LinearGradient
            colors={["#4ECDC4", "#45B7D1"]}
            style={styles.navArrowGradient}
          >
            <Ionicons name="chevron-forward" size={24} color="#FFFFFF" />
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={flatListRef}
        data={upcomingTournaments}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => String(item._id)}
        renderItem={({ item }) => (
          <TournamentCard tournament={item} theme={theme} />
        )}
        contentContainerStyle={styles.tournamentsList}
        snapToInterval={CARD_WIDTH + CARD_MARGIN}
        decelerationRate="fast"
        onMomentumScrollEnd={(event) => {
          const index = Math.round(
            event.nativeEvent.contentOffset.x / (CARD_WIDTH + CARD_MARGIN)
          );
          setCurrentIndex(index);
        }}
        ItemSeparatorComponent={() => <View style={{ width: CARD_MARGIN }} />}
      />

      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => router.push("/tournament/stack")}
        style={styles.viewAllContainer}
      >
        <LinearGradient
          colors={["#4ECDC4", "#45B7D1"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.viewAllButton}
        >
          <Text style={styles.viewAllText}>Xem tất cả giải đấu</Text>
          <Ionicons name="arrow-forward-circle" size={24} color="#FFFFFF" />
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

/* ---------- News Card ---------- */
function NewsCard({ news, theme }) {
  const isDark = !!theme?.dark;
  const bg = theme?.colors?.card ?? (isDark ? "#1a1d23" : "#ffffff");
  const text = theme?.colors?.text ?? (isDark ? "#ffffff" : "#111111");
  const subtext = isDark ? "#b0b0b0" : "#666666";
  const border = theme?.colors?.border ?? (isDark ? "#2a2e35" : "#e0e0e0");

  return (
    <View
      style={[styles.newsCard, { backgroundColor: bg, borderColor: border }]}
    >
      <TouchableOpacity
        activeOpacity={0.95}
        onPress={() => router.push(`/news/${news.slug}`)}
      >
        <Image
          source={{
            uri:
              normalizeUrl(news.thumbImageUrl) ||
              "https://dummyimage.com/400x300/A29BFE/ffffff&text=News",
          }}
          style={styles.newsImage}
          contentFit="cover"
          transition={200}
        />

        <View style={styles.newsInfo}>
          <Text style={[styles.newsTitle, { color: text }]} numberOfLines={3}>
            {news.title}
          </Text>

          <View style={styles.newsMetaRow}>
            <Ionicons name="time-outline" size={14} color={subtext} />
            <Text style={[styles.newsDate, { color: subtext }]}>
              {formatDate(news.originalPublishedAt || news.createdAt)}
            </Text>
          </View>
        </View>
      </TouchableOpacity>

      <View style={styles.newsActions}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => router.push(`/news/${news.slug}`)}
          style={styles.detailButtonWrapper}
        >
          <LinearGradient
            colors={["#A29BFE", "#FD79A8"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.detailButton}
          >
            <Text style={styles.detailButtonText}>Chi tiết</Text>
            <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* ---------- News Section ---------- */
function NewsSection() {
  const theme = useTheme();
  const isDark = !!theme?.dark;
  const text = theme?.colors?.text ?? (isDark ? "#ffffff" : "#111111");
  const bgColor = theme?.colors?.background ?? (isDark ? "#0b0f14" : "#f5f7fb");

  const { data: news, isLoading } = useGetNewsQuery(undefined, {
    refetchOnFocus: false,
  });

  const topNews = useMemo(() => {
    if (!Array.isArray(news)) return [];
    return news.slice(0, 5);
  }, [news]);

  if (isLoading || topNews.length === 0) return null;

  return (
    <View style={styles.newsSection}>
      <View style={styles.newsSectionHeaderRow}>
        <LinearGradient
          colors={["#A29BFE", "#FD79A8"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.newsSectionHeader}
        >
          <Ionicons name="newspaper" size={22} color="#FFFFFF" />
          <Text style={styles.newsSectionHeaderText}>
            Tin tức & Sự kiện nổi bật
          </Text>
        </LinearGradient>

        <View
          style={[styles.triangleRightNews, { borderRightColor: bgColor }]}
        />

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => router.push("/news")}
          style={styles.seeMoreButton}
        >
          <Text style={[styles.seeMoreText, { color: text }]}>Xem thêm</Text>
          <Ionicons name="arrow-forward" size={16} color={text} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={topNews}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => String(item._id)}
        renderItem={({ item }) => <NewsCard news={item} theme={theme} />}
        contentContainerStyle={styles.newsList}
        ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
      />
    </View>
  );
}

/* ---------- Leaderboard Card ---------- */
function LeaderboardCard({ athlete, theme }) {
  const isDark = !!theme?.dark;
  const bg = theme?.colors?.card ?? (isDark ? "#1a1d23" : "#ffffff");
  const text = theme?.colors?.text ?? (isDark ? "#ffffff" : "#111111");
  const subtext = isDark ? "#b0b0b0" : "#666666";

  const borderColors = {
    gold: ["#FFD700", "#FFA500", "#FFD700"],
    silver: ["#C0C0C0", "#E8E8E8", "#C0C0C0"],
    bronze: ["#CD7F32", "#E9967A", "#CD7F32"],
  };

  return (
    <LinearGradient
      colors={borderColors[athlete.tier]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.leaderboardCardGradient}
    >
      <View style={[styles.leaderboardCard, { backgroundColor: bg }]}>
        <View style={styles.leaderboardRank}>
          <Text style={styles.leaderboardRankText}>#{athlete.rank}</Text>
        </View>

        <Image
          source={{ uri: normalizeUrl(athlete.avatar) }}
          style={styles.leaderboardAvatar}
          contentFit="cover"
          transition={200}
        />

        <View style={styles.leaderboardInfo}>
          <Text
            style={[styles.leaderboardName, { color: text }]}
            numberOfLines={1}
          >
            {athlete.name}
          </Text>
          <Text
            style={[styles.leaderboardAchievement, { color: subtext }]}
            numberOfLines={2}
          >
            {athlete.achievement}
          </Text>
        </View>
      </View>
    </LinearGradient>
  );
}

/* ---------- Leaderboard Section ---------- */
function LeaderboardSection() {
  const theme = useTheme();
  const { data, isLoading, isError } = useGetFeaturedLeaderboardQuery({
    sinceDays: 90,
    limit: 5,
    minMatches: 3,
    sportType: "2", // nếu backend của bạn có lọc theo sportType; bỏ nếu không dùng
  });

  const items = Array.isArray(data?.items) ? data.items : [];

  const decorateTier = (rank) =>
    rank === 1
      ? "gold"
      : rank === 2
      ? "silver"
      : rank === 3
      ? "bronze"
      : "bronze";
  return (
    <View style={styles.leaderboardSection}>
      <View style={styles.leaderboardBackground}>
        <LottieView
          source={BG_3D}
          autoPlay
          speed={0.5}
          loop
          resizeMode="cover"
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
        <View style={styles.leaderboardOverlay} />
      </View>

      <View style={styles.leaderboardHeaderContainer}>
        <LinearGradient
          colors={["#FFD700", "#FFA500"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.leaderboardHeader}
        >
          <Ionicons name="podium" size={28} color="#FFFFFF" />
          <Text style={styles.leaderboardHeaderText}>
            Bảng xếp hạng nổi bật
          </Text>
          <Ionicons name="podium" size={28} color="#FFFFFF" />
        </LinearGradient>
      </View>

      <View style={styles.leaderboardCards}>
        {isLoading && (
          <>
            {/* Skeleton đơn giản */}
            <View style={[styles.leaderboardCardGradient, { opacity: 0.6 }]}>
              <View
                style={[
                  styles.leaderboardCard,
                  { backgroundColor: "#00000020" },
                ]}
              />
            </View>
            <View style={[styles.leaderboardCardGradient, { opacity: 0.6 }]}>
              <View
                style={[
                  styles.leaderboardCard,
                  { backgroundColor: "#00000020" },
                ]}
              />
            </View>
            <View style={[styles.leaderboardCardGradient, { opacity: 0.6 }]}>
              <View
                style={[
                  styles.leaderboardCard,
                  { backgroundColor: "#00000020" },
                ]}
              />
            </View>
          </>
        )}

        {!isLoading &&
          !isError &&
          items.map((u) => (
            <LeaderboardCard
              key={String(u.userId)}
              theme={theme}
              athlete={{
                id: String(u.userId),
                rank: u.rank,
                name: u.name,
                avatar:
                  normalizeUrl(u.avatar) || "https://i.pravatar.cc/150?img=12",
                achievement: u.achievement,
                tier: decorateTier(u.rank),
              }}
            />
          ))}
      </View>
    </View>
  );
}

/* ---------- Contact Card - Improved ---------- */
function ContactCard() {
  const theme = useTheme();
  const isDark = !!theme?.dark;
  const bg = theme?.colors?.card ?? (isDark ? "#14171c" : "#ffffff");
  const border = theme?.colors?.border ?? (isDark ? "#2a2e35" : "#e7eaf0");
  const text = theme?.colors?.text ?? (isDark ? "#ffffff" : "#111111");
  const sub = isDark ? "#c9c9c9" : "#555555";
  const tint = theme?.colors?.primary ?? (isDark ? "#7cc0ff" : "#0a84ff");

  const { data, isLoading, isError } = useGetContactContentQuery();
  const info = useMemo(
    () => (isLoading ? null : isError ? FALLBACK : { ...FALLBACK, ...data }),
    [data, isLoading, isError]
  );

  return (
    <View style={[styles.card, { backgroundColor: bg, borderColor: border }]}>
      <View style={styles.contactHeader}>
        <MaterialIcons name="support-agent" size={28} color={tint} />
        <Text style={[styles.contactTitle, { color: text }]}>
          Liên hệ & Hỗ trợ
        </Text>
      </View>

      {info ? (
        <>
          <InfoRow
            color={text}
            label="Địa chỉ"
            icon={
              <MaterialIcons name="location-on" size={24} color="#FF6B6B" />
            }
          >
            <Text style={{ color: text }}>{info.address || "—"}</Text>
          </InfoRow>

          <InfoRow
            color={text}
            label="Điện thoại"
            icon={<MaterialIcons name="phone" size={24} color="#4ECDC4" />}
          >
            <LinkText
              text={info.phone}
              url={info.phone ? `tel:${info.phone}` : undefined}
              tint={tint}
            />
          </InfoRow>

          <InfoRow
            color={text}
            label="Email"
            icon={<MaterialIcons name="email" size={24} color="#A29BFE" />}
          >
            <LinkText
              text={info.email}
              url={info.email ? `mailto:${info.email}` : undefined}
              tint={tint}
            />
          </InfoRow>

          <View style={styles.socialContainer}>
            <Text style={[styles.socialLabel, { color: sub }]}>
              Kết nối với chúng tôi
            </Text>
            <View style={styles.socialButtons}>
              {info?.socials?.facebook ? (
                <SocialButton
                  bg="#1877F2"
                  onPress={() => openURL(info.socials.facebook)}
                >
                  <FontAwesome name="facebook" size={24} color="#fff" />
                </SocialButton>
              ) : null}

              {info?.socials?.youtube ? (
                <SocialButton
                  bg="#FF0000"
                  onPress={() => openURL(info.socials.youtube)}
                >
                  <AntDesign name="youtube" size={24} color="#fff" />
                </SocialButton>
              ) : null}

              {info?.socials?.zalo ? (
                <SocialButton
                  bg="#0068FF"
                  onPress={() => openURL(info.socials.zalo)}
                >
                  <Image
                    source={ZALO_SRC}
                    style={{ width: 24, height: 24 }}
                    contentFit="contain"
                    transition={120}
                  />
                </SocialButton>
              ) : null}
            </View>
          </View>
        </>
      ) : (
        <Text style={{ color: sub }}>Đang tải…</Text>
      )}
    </View>
  );
}

export default function HomeScreen() {
  const dispatch = useDispatch();
  const userInfo = useSelector((s) => s.auth?.userInfo);

  // Có rankNo chưa?
  const hasRankNo = Number.isFinite(
    +(userInfo?.rankNo ?? userInfo?.rank?.rankNo ?? NaN)
  );

  // Gọi reauth nếu đã đăng nhập mà chưa có rankNo
  const { data: reauthData } = useReauthQuery(undefined, {
    skip: !userInfo || hasRankNo,
    // refetchOnMountOrArgChange: true, // nếu muốn mỗi lần vào màn hình
  });

  useEffect(() => {
    if (reauthData) {
      const normalized = reauthData?.user
        ? { ...reauthData.user, token: reauthData.token }
        : reauthData;
      dispatch(setCredentials(normalized));
      saveUserInfo(normalized);
    }
  }, [reauthData, dispatch]);
  const theme = useTheme();
  const bg = theme?.colors?.background ?? "#ffffff";

  return (
    <>
      <Stack.Screen
        options={{
          title: "",
          headerTitleAlign: "left",
          headerLeft: () => (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginLeft: -8,
              }}
            >
              <LinearGradient
                colors={["#FF6B6B", "#4ECDC4", "#45B7D1"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 12,
                }}
              >
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: "900",
                    color: "#FFFFFF",
                    letterSpacing: 1,
                  }}
                >
                  PickleTour
                </Text>
              </LinearGradient>
            </View>
          ),
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push("/notifications")}
              style={{
                marginRight: 8,
                padding: 8,
                borderRadius: 20,
                backgroundColor: theme?.colors?.card ?? "#fff",
              }}
            >
              <Ionicons
                name="notifications"
                size={24}
                color={theme?.colors?.primary ?? "#0a84ff"}
              />
            </TouchableOpacity>
          ),
        }}
      />
      <ScrollView
        style={{ backgroundColor: bg }}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        <View style={styles.hero3dWrap}>
          <LottieView
            source={BG_3D}
            autoPlay
            speed={0.2}
            loop
            resizeMode="cover"
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />
          <AthleteIsland />
        </View>

        <View style={{ height: 16 }} />

        <FeaturesGrid />

        <View style={{ height: 24 }} />

        <TournamentsSection />

        <View style={{ height: 24 }} />

        <NewsSection />

        <View style={{ height: 24 }} />

        <LeaderboardSection />

        <View style={{ height: 16 }} />

        <View style={{ paddingHorizontal: 16 }}>
          <ContactCard />
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  hero3dWrap: {
    width: "100%",
    height: 240,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    overflow: "hidden",
    marginBottom: 8,
    justifyContent: "center",
    alignItems: "center",
  },

  islandContainer: {
    alignItems: "center",
    width: "100%",
    paddingHorizontal: 20,
  },

  logoGradient: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 16,
    shadowColor: "#4ECDC4",
    shadowOpacity: 0.5,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },

  logoText: {
    fontSize: 32,
    fontWeight: "900",
    color: "#FFFFFF",
    textAlign: "center",
    letterSpacing: 2,
    fontStyle: "italic",
    textShadowColor: "rgba(0, 0, 0, 0.3)",
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
    ...Platform.select({
      ios: { fontFamily: "System" },
      android: { fontFamily: "sans-serif-condensed" },
    }),
  },

  logoGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingVertical: 8,
    shadowColor: "#45B7D1",
    shadowOpacity: 0.8,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
  },

  athleteIsland: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    width: "100%",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    gap: 12,
  },

  avatarContainer: {
    position: "relative",
  },

  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "transparent",
  },

  avatarBorder: {
    position: "absolute",
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: "#FFD700",
  },

  nameContainer: {
    flex: 1,
    justifyContent: "center",
  },

  athleteName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111111",
    marginBottom: 2,
  },

  athleteTitle: {
    fontSize: 12,
    color: "#666666",
    fontWeight: "500",
  },

  rankBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 4,
    shadowColor: "#FFD700",
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },

  rankText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },

  featuresContainer: {
    paddingHorizontal: 16,
  },

  sectionTitle: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 16,
    letterSpacing: 0.5,
  },

  featuresGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },

  featureItem: {
    width: "22%",
    aspectRatio: 1,
    borderRadius: 16,
    padding: 8,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    marginBottom: 12,
  },

  featureIconWrapper: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },

  featureTitle: {
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 13,
  },

  tournamentsSection: {
    marginBottom: 8,
  },

  sectionHeaderWrapper: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 16,
    position: "relative",
  },

  sectionHeader: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 12,
    borderRadius: 12,
  },

  triangleLeft: {
    position: "absolute",
    left: 0,
    width: 0,
    height: 0,
    borderTopWidth: 24,
    borderBottomWidth: 24,
    borderLeftWidth: 20,
    borderStyle: "solid",
    backgroundColor: "transparent",
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    zIndex: 1,
  },

  triangleRight: {
    position: "absolute",
    right: 0,
    width: 0,
    height: 0,
    borderTopWidth: 24,
    borderBottomWidth: 24,
    borderRightWidth: 20,
    borderStyle: "solid",
    backgroundColor: "transparent",
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    zIndex: 1,
  },

  sectionHeaderText: {
    fontSize: 18,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },

  navigationContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    marginBottom: 12,
  },

  navArrow: {
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },

  navArrowGradient: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },

  tournamentsList: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },

  tournamentCard: {
    width: CARD_WIDTH,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 2,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },

  tournamentImageContainer: {
    position: "relative",
  },

  tournamentImage: {
    width: "100%",
    height: 180,
    backgroundColor: "#f0f0f0",
  },

  tournamentImageGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
  },

  statusBadgeOnImage: {
    position: "absolute",
    top: 12,
    right: 12,
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },

  statusBadgeGradient: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    gap: 4,
  },

  statusBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },

  tournamentInfo: {
    padding: 16,
    gap: 10,
  },

  tournamentName: {
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 24,
  },

  tournamentMetaRow: {
    gap: 8,
  },

  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  metaText: {
    fontSize: 14,
    flex: 1,
  },

  registrationInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(128, 128, 128, 0.2)",
  },

  registrationText: {
    fontSize: 13,
    fontWeight: "600",
  },

  tournamentActions: {
    padding: 12,
    paddingTop: 0,
  },

  registerButtonWrapper: {
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: "#FF6B6B",
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },

  registerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    gap: 8,
  },

  registerButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },

  viewAllContainer: {
    paddingHorizontal: 16,
    marginTop: 12,
  },

  viewAllButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    gap: 10,
    shadowColor: "#4ECDC4",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },

  viewAllText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },

  newsSection: {
    marginBottom: 8,
  },

  newsSectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 12,
    position: "relative",
  },

  newsSectionHeader: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 8,
  },

  triangleRightNews: {
    // position: "absolute",
    // right: -80, // Vị trí bên phải, tránh nút "Xem thêm"
    // width: 0,
    // height: 0,
    // borderTopWidth: 24,
    // borderBottomWidth: 24,
    // borderRightWidth: 20, // 🔧 Tăng từ 16 lên 20 cho rõ hơn
    // borderStyle: "solid",
    // backgroundColor: "transparent",
    // borderTopColor: "transparent",
    // borderBottomColor: "transparent",
    // zIndex: 1,
  },

  newsSectionHeaderText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  seeMoreButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
  },

  seeMoreText: {
    fontSize: 13,
    fontWeight: "700",
  },

  newsList: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },

  newsCard: {
    width: CARD_WIDTH * 0.85,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 2,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },

  newsImage: {
    width: "100%",
    height: 140,
    backgroundColor: "#f0f0f0",
  },

  newsInfo: {
    padding: 12,
    gap: 8,
  },

  newsTitle: {
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },

  newsMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  newsDate: {
    fontSize: 12,
  },

  newsActions: {
    padding: 12,
    paddingTop: 0,
  },

  detailButtonWrapper: {
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#A29BFE",
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },

  detailButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    gap: 6,
  },

  detailButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },

  leaderboardSection: {
    position: "relative",
    paddingVertical: 24,
    marginHorizontal: 16,
    borderRadius: 20,
    overflow: "hidden",
  },

  leaderboardBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },

  leaderboardOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },

  leaderboardHeaderContainer: {
    alignItems: "center",
    marginBottom: 20,
  },

  leaderboardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 16,
    gap: 12,
    shadowColor: "#FFD700",
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },

  leaderboardHeaderText: {
    fontSize: 20,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },

  leaderboardCards: {
    gap: 16,
    paddingHorizontal: 8,
  },

  leaderboardCardGradient: {
    borderRadius: 16,
    padding: 3,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },

  leaderboardCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },

  leaderboardRank: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 215, 0, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },

  leaderboardRankText: {
    fontSize: 18,
    fontWeight: "900",
    color: "#FFD700",
  },

  leaderboardAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#f0f0f0",
  },

  leaderboardInfo: {
    flex: 1,
    gap: 4,
  },

  leaderboardName: {
    fontSize: 16,
    fontWeight: "700",
  },

  leaderboardAchievement: {
    fontSize: 13,
    lineHeight: 18,
  },

  card: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },

  contactHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: "rgba(128, 128, 128, 0.1)",
  },

  contactTitle: {
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 0.3,
  },

  socialContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(128, 128, 128, 0.1)",
  },

  socialLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 12,
  },

  socialButtons: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
  },
  loginButton: {
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#4ECDC4",
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },

  loginButtonGradient: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },

  loginButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
});
