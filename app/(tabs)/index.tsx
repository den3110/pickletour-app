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
  DeviceEventEmitter,
  Easing,
} from "react-native";
import { Stack, router } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { useSelector, useDispatch } from "react-redux";
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
import { useReauthQuery } from "@/slices/usersApiSlice";
import { setCredentials } from "@/slices/authSlice";
import { saveUserInfo } from "@/utils/authStorage";
import ImageViewing from "react-native-image-viewing";
import { useRatingPrompt } from "@/hooks/useRatingPrompt";
import LeaderboardSection from "@/components/home/LeaderboardSection";

/* ---------- Lottie asset ---------- */
const BG_3D = require("@/assets/lottie/bg-3d.json");

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = SCREEN_WIDTH * 0.8;
const CARD_MARGIN = 16;

/* ---------- Fallback Data ---------- */
const FALLBACK = {
  address: "Abcd, abcd, abcd",
  phone: "012345678",
  email: "support@pickletour.vn",
  support: {
    generalEmail: "support@pickletour.vn",
    generalPhone: "0123456789",
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
    icon: "school",
    iconLib: "Ionicons",
    title: "Hướng dẫn",
    color: "#FFA502",
    link: "/guide",
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
    icon: "videocam",
    iconLib: "Ionicons",
    title: "Live",
    color: "#FD79A8",
    link: "/live/home",
  },
  {
    id: 7,
    icon: "calculator",
    iconLib: "Ionicons",
    title: "Chấm trình",
    color: "#00B894",
    link: "/levelpoint",
  },
  {
    id: 8,
    icon: "people-circle",
    iconLib: "Ionicons",
    title: "Câu lạc bộ",
    color: "#FDCB6E",
    link: "/clubs",
  },
  {
    id: 9,
    icon: "tennisball",
    iconLib: "Ionicons",
    title: "Trận đấu",
    color: "#74B9FF",
    link: "/match/stack",
  },
  {
    id: 10,
    icon: "chatbox-ellipses",
    iconLib: "Ionicons",
    title: "Hỗ trợ / Góp ý",
    color: "#2ECC71",
    link: "/support",
  },
  {
    id: 11,
    icon: "locate", // icon cho Radar / Quanh đây
    iconLib: "Ionicons",
    title: "Quanh đây", // hoặc "PickleRadar" nếu bạn thích brand hơn
    color: "#6C5CE7",
    link: "/radar", // màn hình radar mình vừa code
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
      style={{ color: tint, fontWeight: "700" }}
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
      style={{ flexDirection: "row", alignItems: "center", marginVertical: 8 }}
    >
      <View style={{ width: 36, alignItems: "center", marginRight: 12 }}>
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontWeight: "700",
            fontSize: 13,
            color,
            marginBottom: 2,
            opacity: 0.7,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          {label}
        </Text>
        {typeof children === "string" ? (
          <Text style={{ fontSize: 16, color, fontWeight: "500" }}>
            {children}
          </Text>
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
      activeOpacity={0.8}
      onPress={onPress}
      style={{
        width: 50,
        height: 50,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: bg,
        shadowColor: bg,
        shadowOpacity: 0.4,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
      }}
    >
      {children}
    </TouchableOpacity>
  );
}

const ZALO_SRC = require("@/assets/images/icon-zalo.png");

/* ---------- 🆕 ANIMATION WRAPPER (Fade In Up) ---------- */
// Thành phần giúp các section xuất hiện mượt mà
function FadeInSection({ delay = 0, children }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        delay,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        delay,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
    >
      {children}
    </Animated.View>
  );
}

/* ---------- 🆕 PRO Animated Button Component ---------- */
function ProButton({ onPress, children, colors, style, icon }) {
  const scaleVal = useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    Animated.spring(scaleVal, { toValue: 0.96, useNativeDriver: true }).start();
  };
  const onPressOut = () => {
    Animated.spring(scaleVal, {
      toValue: 1,
      friction: 5,
      tension: 40,
      useNativeDriver: true,
    }).start();
  };

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={[styles.proButtonContainer, style]}
    >
      <Animated.View
        style={{ transform: [{ scale: scaleVal }], width: "100%" }}
      >
        <LinearGradient
          colors={colors || ["#FF6B6B", "#FF8E53"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.proButtonGradient}
        >
          <LinearGradient
            colors={["rgba(255,255,255,0.3)", "rgba(255,255,255,0)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 0.5 }}
            style={styles.proButtonGloss}
          />
          <View style={styles.proButtonContent}>
            {icon && <View style={{ marginRight: 8 }}>{icon}</View>}
            {children}
          </View>
        </LinearGradient>
      </Animated.View>
    </TouchableOpacity>
  );
}

/* ---------- 🆕 Animated Status Chip ---------- */
function AnimatedStatusChip() {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.05,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      style={[styles.statusBadgeOnImage, { transform: [{ scale: scaleAnim }] }]}
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
  }, []);

  return (
    <Animated.View
      style={{
        opacity: fadeAnim,
        transform: [{ scale: scaleAnim }],
        marginBottom: 16,
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
    </Animated.View>
  );
}

/* ---------- Athlete Island Card ---------- */
function AthleteIsland() {
  const userInfo = useSelector((s) => s.auth?.userInfo);
  const goProfile = React.useCallback(() => router.push("/profile/stack"), []);

  // Logic Rank & Role
  const rankNo = userInfo?.rankNo ?? userInfo?.rank?.rankNo ?? null;
  let rankDisplay = "Chưa xếp hạng",
    rankIcon = "star-border",
    rankColor = "#9AA0A6";

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
  }

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

  const avatarUrl = normalizeUrl(userInfo?.avatar);
  const name = userInfo?.name || "Người dùng";

  // Render
  return (
    <View style={styles.islandContainer}>
      <AnimatedLogo />

      {/* Premium Island Card with Drop Shadow */}
      <View style={styles.athleteIslandWrapper}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={userInfo ? goProfile : () => router.push("/login")}
          style={styles.athleteIslandContent}
        >
          {/* Left: Avatar */}
          <View style={styles.avatarContainer}>
            {!userInfo ? (
              <LottieView
                source={require("@/assets/lottie/humans.json")}
                autoPlay
                loop
                style={styles.avatar}
                speed={0.4}
              />
            ) : (
              <Image
                source={{ uri: normalizeUrl(avatarUrl) }}
                style={styles.avatar}
                contentFit="cover"
                transition={500}
              />
            )}
            {userInfo && (
              <View style={[styles.avatarBorder, { borderColor: rankColor }]} />
            )}
          </View>

          {/* Center: Info */}
          <View style={styles.nameContainer}>
            <Text style={styles.athleteName} numberOfLines={1}>
              {userInfo ? name : "Bắt đầu hành trình"}
            </Text>
            <Text style={styles.athleteTitle}>
              {userInfo ? roleUser() : "Cùng PickleTour"}
            </Text>
          </View>

          {/* Right: Action or Rank */}
          {userInfo ? (
            <LinearGradient
              colors={[rankColor, "#FF8E53"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.rankBadge}
            >
              <MaterialIcons name={rankIcon} size={14} color="#FFFFFF" />
              <Text style={styles.rankText}>{rankDisplay}</Text>
            </LinearGradient>
          ) : (
            <LinearGradient
              colors={["#4ECDC4", "#45B7D1"]}
              style={styles.loginBadge}
            >
              <Text style={styles.loginButtonText}>Đăng nhập</Text>
            </LinearGradient>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* ---------- Feature Item (Interactive) ---------- */
function FeatureItem({ item, theme }) {
  const isDark = !!theme?.dark;
  const bg = theme?.colors?.card ?? (isDark ? "#14171c" : "#ffffff");
  const text = theme?.colors?.text ?? (isDark ? "#ffffff" : "#111111");
  const scaleVal = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    if (!item.link) return;
    if (typeof item.link === "string") {
      item.link.startsWith("http")
        ? openURL(item.link)
        : router.push(item.link);
    }
  };

  const onPressIn = () =>
    Animated.spring(scaleVal, { toValue: 0.9, useNativeDriver: true }).start();
  const onPressOut = () =>
    Animated.spring(scaleVal, {
      toValue: 1,
      friction: 3,
      tension: 40,
      useNativeDriver: true,
    }).start();

  const renderIcon = () => {
    const iconProps = { name: item.icon, size: 26, color: item.color };
    const Lib =
      { Ionicons, MaterialIcons, FontAwesome, FontAwesome5 }[item.iconLib] ||
      Ionicons;
    return <Lib {...iconProps} />;
  };

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={handlePress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={{ width: "22%", marginBottom: 16 }}
    >
      <Animated.View
        style={{ alignItems: "center", transform: [{ scale: scaleVal }] }}
      >
        <View
          style={[
            styles.featureIconContainer,
            {
              backgroundColor: isDark ? "#1F2229" : "#FFF",
              shadowColor: item.color,
            },
          ]}
        >
          <View
            style={[
              styles.featureIconBg,
              { backgroundColor: item.color + "15" },
            ]}
          >
            {renderIcon()}
          </View>
        </View>
        <Text style={[styles.featureTitle, { color: text }]} numberOfLines={2}>
          {item.title}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

/* ---------- Features Grid ---------- */
/* ---------- Features Grid ---------- */
function FeaturesGrid() {
  const theme = useTheme();
  const isDark = !!theme?.dark;
  const text = theme?.colors?.text ?? (isDark ? "#ffffff" : "#111111");

  // --- FIX LOGIC CĂN HÀNG ---
  const NUM_COLUMNS = 4;
  // Tính xem hàng cuối còn thiếu bao nhiêu item để đủ 4
  const remainder = FEATURES.length % NUM_COLUMNS;
  const emptySlots = remainder === 0 ? 0 : NUM_COLUMNS - remainder;
  // --------------------------

  return (
    <View style={styles.featuresContainer}>
      <Text style={[styles.sectionTitle, { color: text }]}>
        Tính năng PickleTour
      </Text>
      <View style={styles.featuresGrid}>
        {FEATURES.map((item) => (
          <FeatureItem key={item.id} item={item} theme={theme} />
        ))}

        {/* Render các View rỗng có cùng chiều rộng (22%) để đẩy item về bên trái */}
        {Array.from({ length: emptySlots }).map((_, index) => (
          <View key={`empty-${index}`} style={{ width: "22%" }} />
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
      <View style={styles.tournamentImageContainer}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => setImageVisible(true)}
        >
          <Image
            source={{ uri: normalizeUrl(imageUri) }}
            style={styles.tournamentImage}
            contentFit="cover"
            transition={500}
          />
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.6)"]}
            style={styles.tournamentImageGradient}
          />
          <AnimatedStatusChip />
        </TouchableOpacity>
      </View>

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
          <View style={styles.separator} />

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
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: "#FFA502",
                }}
              />
              <Text style={[styles.registrationText, { color: subtext }]}>
                {tournament.registered}/{tournament.maxPairs} vận động viên
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>

      <View style={styles.tournamentActions}>
        <ProButton
          onPress={() => router.push(`/tournament/${tournament._id}/register`)}
          colors={["#FF9F43", "#EE5A24"]}
          icon={<Ionicons name="trophy-outline" size={20} color="#FFFFFF" />}
        >
          <Text style={styles.proButtonText}>ĐĂNG KÝ NGAY</Text>
        </ProButton>
      </View>

      <ImageViewing
        images={[{ uri: imageUri }]}
        imageIndex={0}
        visible={imageVisible}
        onRequestClose={() => setImageVisible(false)}
        swipeToCloseEnabled
        backgroundColor={isDark ? "rgba(0,0,0,0.95)" : "rgba(255,255,255,0.95)"}
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
      flatListRef.current.scrollToIndex({ index, animated: true });
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
      {/* 🛑 GIỮ NGUYÊN HEADER CŨ THEO YÊU CẦU */}
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
        activeOpacity={0.8}
        onPress={() => router.push("/tournament/stack")}
        style={styles.viewAllContainerNew}
      >
        <View
          style={[
            styles.viewAllButtonNew,
            { backgroundColor: isDark ? "#1F2229" : "#FFF" },
          ]}
        >
          <Text
            style={[styles.viewAllTextNew, { color: isDark ? "#FFF" : "#333" }]}
          >
            Xem tất cả giải đấu
          </Text>
          <View style={styles.viewAllIconCircle}>
            <Ionicons name="chevron-forward" size={16} color="#FFF" />
          </View>
        </View>
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
          transition={500}
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
          onPress={() => router.push(`/news/${news.slug}`)}
          style={styles.newsDetailLink}
        >
          <Text style={styles.newsDetailText}>Đọc tiếp</Text>
          <Ionicons name="chevron-forward" size={16} color="#A29BFE" />
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
  const { data: news, isLoading } = useGetNewsQuery(undefined, {
    refetchOnFocus: false,
  });
  const topNews = useMemo(
    () => (Array.isArray(news) ? news.slice(0, 5) : []),
    [news]
  );

  if (isLoading || topNews.length === 0) return null;

  return (
    <View style={styles.newsSection}>
      <View style={styles.newsSectionHeaderRow}>
        <View style={styles.newsHeaderContainer}>
          <View style={styles.newsHeaderDecor} />
          <Text style={[styles.newsHeaderTitle, { color: text }]}>
            Tin tức nổi bật
          </Text>
        </View>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => router.push("/news")}
          style={styles.seeMoreButtonNew}
        >
          <Text style={styles.seeMoreTextNew}>Xem thêm</Text>
          <Ionicons name="chevron-forward" size={14} color="#6C5CE7" />
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

/* ---------- Contact Card ---------- */
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
              {info?.socials?.facebook && (
                <SocialButton
                  bg="#1877F2"
                  onPress={() => openURL(info.socials.facebook)}
                >
                  <FontAwesome name="facebook" size={24} color="#fff" />
                </SocialButton>
              )}
              {info?.socials?.youtube && (
                <SocialButton
                  bg="#FF0000"
                  onPress={() => openURL(info.socials.youtube)}
                >
                  <AntDesign name="youtube" size={24} color="#fff" />
                </SocialButton>
              )}
              {info?.socials?.zalo && (
                <SocialButton
                  bg="#0068FF"
                  onPress={() => openURL(info.socials.zalo)}
                >
                  <Image
                    source={ZALO_SRC}
                    style={{ width: 24, height: 24 }}
                    contentFit="contain"
                  />
                </SocialButton>
              )}
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
  const scrollViewRef = React.useRef(null);
  React.useEffect(() => {
    const listener = DeviceEventEmitter.addListener(
      "SCROLL_TO_TOP",
      (tabName) => {
        if (tabName === "index")
          scrollViewRef.current?.scrollTo({ y: 0, animated: true });
      }
    );
    return () => listener.remove();
  }, []);
  const dispatch = useDispatch();
  const userInfo = useSelector((s) => s.auth?.userInfo);
  const hasRankNo = Number.isFinite(
    +(userInfo?.rankNo ?? userInfo?.rank?.rankNo ?? NaN)
  );
  const { data: reauthData } = useReauthQuery(undefined, {
    skip: !userInfo || hasRankNo,
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
        ref={scrollViewRef}
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
          <FadeInSection delay={100}>
            <AthleteIsland />
          </FadeInSection>
        </View>

        <View style={{ height: 16 }} />
        <FadeInSection delay={300}>
          <FeaturesGrid />
        </FadeInSection>

        <View style={{ height: 24 }} />
        <FadeInSection delay={500}>
          <TournamentsSection />
        </FadeInSection>

        <View style={{ height: 24 }} />
        <FadeInSection delay={700}>
          <NewsSection />
        </FadeInSection>

        <View style={{ height: 24 }} />
        <FadeInSection delay={900}>
          <LeaderboardSection />
        </FadeInSection>

        <View style={{ height: 16 }} />
        <FadeInSection delay={1100}>
          <View style={{ paddingHorizontal: 16 }}>
            <ContactCard />
          </View>
        </FadeInSection>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  hero3dWrap: {
    width: "100%",
    height: 240,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
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
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderRadius: 20,
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

  /* 💎 PREMIUM ATHLETE ISLAND */
  athleteIslandWrapper: {
    width: "100%",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  athleteIslandContent: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.96)",
    borderRadius: 24,
    paddingVertical: 14,
    paddingHorizontal: 16,
    width: "100%",
    gap: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.6)",
  },
  avatarContainer: { position: "relative" },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#F0F0F0",
  },
  avatarBorder: {
    position: "absolute",
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
  },
  nameContainer: { flex: 1, justifyContent: "center" },
  athleteName: {
    fontSize: 17,
    fontWeight: "800",
    color: "#111111",
    marginBottom: 4,
  },
  athleteTitle: { fontSize: 13, color: "#666666", fontWeight: "600" },
  rankBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    gap: 4,
    shadowColor: "#FF8E53",
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  loginBadge: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    shadowColor: "#45B7D1",
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  rankText: { fontSize: 12, fontWeight: "700", color: "#FFFFFF" },
  loginButtonText: { fontSize: 13, fontWeight: "700", color: "#FFFFFF" },

  featuresContainer: { paddingHorizontal: 16 },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  featuresGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },

  /* 💎 GLASS-MORPHISM FEATURE ITEM */
  featureIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  featureIconBg: {
    width: 60,
    height: 60,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  featureTitle: {
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 14,
    height: 28,
  },

  tournamentsSection: { marginBottom: 8 },
  /* OLD HEADER STYLES */
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

  tournamentsList: { paddingHorizontal: 16, paddingVertical: 8 },

  /* 💎 PREMIUM TOURNAMENT CARD */
  tournamentCard: {
    width: CARD_WIDTH,
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  tournamentImageContainer: { position: "relative" },
  tournamentImage: { width: "100%", height: 190, backgroundColor: "#f0f0f0" },
  tournamentImageGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 100,
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
    elevation: 5,
  },
  statusBadgeGradient: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    gap: 4,
  },
  statusBadgeText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  tournamentInfo: { padding: 18, paddingBottom: 14, gap: 10 },
  tournamentName: {
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 24,
    height: 48,
  },
  separator: { height: 1, backgroundColor: "rgba(0,0,0,0.05)", width: "100%" },
  tournamentMetaRow: { gap: 8 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  metaText: { fontSize: 14, flex: 1, fontWeight: "500" },
  registrationInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 6,
  },
  registrationText: { fontSize: 13, fontWeight: "600" },
  tournamentActions: { padding: 12, paddingTop: 0 },

  /* 💎 PRO BUTTON STYLES */
  proButtonContainer: {
    borderRadius: 18,
    shadowColor: "#EE5A24",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  proButtonGradient: {
    borderRadius: 18,
    padding: 1,
    position: "relative",
    overflow: "hidden",
  },
  proButtonGloss: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "50%",
    opacity: 0.6,
  },
  proButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.2)",
    borderRadius: 18,
  },
  proButtonText: {
    fontSize: 16,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: 1,
    textShadowColor: "rgba(0,0,0,0.15)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  /* 💎 NEW VIEW ALL BUTTON */
  viewAllContainerNew: {
    marginTop: 12,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  viewAllButtonNew: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 30,
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(128,128,128,0.1)",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  viewAllTextNew: { fontSize: 15, fontWeight: "700" },
  viewAllIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#4ECDC4",
    alignItems: "center",
    justifyContent: "center",
  },

  newsSection: { marginBottom: 8 },
  newsSectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 16,
    marginBottom: 12,
  },
  newsHeaderContainer: { flexDirection: "row", alignItems: "center", gap: 10 },
  newsHeaderDecor: {
    width: 5,
    height: 24,
    backgroundColor: "#6C5CE7",
    borderRadius: 3,
  },
  newsHeaderTitle: { fontSize: 20, fontWeight: "800", letterSpacing: -0.5 },
  seeMoreButtonNew: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(108, 92, 231, 0.08)",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 4,
  },
  seeMoreTextNew: { fontSize: 12, fontWeight: "700", color: "#6C5CE7" },
  newsList: { paddingHorizontal: 16, paddingVertical: 8 },

  /* 💎 PREMIUM NEWS CARD */
  newsCard: {
    width: CARD_WIDTH * 0.85,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  newsImage: { width: "100%", height: 150, backgroundColor: "#f0f0f0" },
  newsInfo: { padding: 14, gap: 8 },
  newsTitle: { fontSize: 15, fontWeight: "700", lineHeight: 20, height: 60 },
  newsMetaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  newsDate: { fontSize: 12, fontWeight: "500" },
  newsActions: { padding: 14, paddingTop: 0 },
  newsDetailLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingVertical: 4,
  },
  newsDetailText: { fontSize: 14, fontWeight: "700", color: "#A29BFE" },

  card: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 24,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  contactHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  contactTitle: { fontSize: 20, fontWeight: "800", letterSpacing: 0.3 },
  socialContainer: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.05)",
  },
  socialLabel: { fontSize: 14, fontWeight: "600", marginBottom: 12 },
  socialButtons: { flexDirection: "row", gap: 16, flexWrap: "wrap" },
});
