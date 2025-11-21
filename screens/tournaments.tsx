// app/(app)/tournaments/DashboardScreen.jsx
import { useGetTournamentsQuery } from "@/slices/tournamentsApiSlice";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
  Dimensions,
} from "react-native";
import { useSelector } from "react-redux";
import { Image as ExpoImage } from "expo-image";
import { normalizeUrl } from "@/utils/normalizeUri";
import { useTheme } from "@react-navigation/native";
import ImageView from "react-native-image-viewing";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

const BANNER_RATIO = 16 / 9;
const SKELETON_COUNT = 4;

// --- Constants ---
const TABS = [
  { key: "upcoming", label: "Sắp diễn ra" },
  { key: "ongoing", label: "Đang đấu" },
  { key: "finished", label: "Đã kết thúc" },
];

const STATUS_CONFIG = {
  upcoming: { label: "Sắp diễn ra", color: "#0ea5e9" },
  ongoing: { label: "Đang diễn ra", color: "#22c55e" },
  finished: { label: "Đã kết thúc", color: "#64748b" },
};

function formatDate(d) {
  if (!d) return "--/--";
  try {
    const dt = new Date(d);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const day = String(dt.getDate()).padStart(2, "0");
    return `${day}/${m}/${y}`;
  } catch {
    return "--/--";
  }
}

/* ---------- Theme Tokens (Cập nhật màu Warning Orange) ---------- */
function useModernTheme() {
  const scheme = useColorScheme() || "light";
  const isDark = scheme === "dark";
  const navTheme = useTheme();
  const primaryColor = navTheme?.colors?.primary ?? "#3b82f6";

  return {
    isDark,
    colors: {
      bg: isDark ? "#0f172a" : "#f8fafc",
      card: isDark ? "#1e293b" : "#ffffff",
      text: isDark ? "#f1f5f9" : "#0f172a",
      textSec: isDark ? "#94a3b8" : "#64748b",
      border: isDark ? "#334155" : "#e2e8f0",
      primary: primaryColor,
      success: "#10b981",
      warning: "#f97316",
      inputBg: isDark ? "#334155" : "#f1f5f9",
    },
    // Shadow mạnh hơn cho Card
    cardShadow: {
      shadowColor: isDark ? "#000" : "#1e293b",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.5 : 0.15,
      shadowRadius: 16,
      elevation: 8,
    },
    btnShadow: {
      shadowColor: primaryColor,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 4,
    },
    successShadow: {
      shadowColor: "#10b981",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 4,
    },
    warningShadow: {
      shadowColor: "#f97316",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 4,
    },
  };
}

/* ---------- Components ---------- */
function usePulse() {
  const v = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(v, {
          toValue: 0.5,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return v;
}

function SkeletonBlock({ style }) {
  const theme = useModernTheme();
  const opacity = usePulse();
  const bg = theme.isDark ? "#334155" : "#cbd5e1";
  return (
    <Animated.View
      style={[{ backgroundColor: bg, opacity, borderRadius: 6 }, style]}
    />
  );
}

function SkeletonCard() {
  const theme = useModernTheme();
  return (
    <View
      style={[
        styles.cardContainer,
        { backgroundColor: theme.colors.card },
        theme.shadow,
      ]}
    >
      <SkeletonBlock
        style={{
          width: "100%",
          aspectRatio: BANNER_RATIO,
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          borderRadius: 0,
        }}
      />
      <View style={{ padding: 14, gap: 10 }}>
        <SkeletonBlock style={{ height: 22, width: "90%" }} />
        <SkeletonBlock style={{ height: 14, width: "60%" }} />
        <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
          <SkeletonBlock style={{ height: 40, width: 110, borderRadius: 20 }} />
          <SkeletonBlock style={{ height: 40, width: 90, borderRadius: 20 }} />
        </View>
      </View>
    </View>
  );
}

function MetaRow({ icon, text, theme }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Ionicons name={icon} size={15} color={theme.colors.textSec} />
      <Text
        style={{ fontSize: 13, color: theme.colors.textSec, fontWeight: "500" }}
        numberOfLines={1}
      >
        {text}
      </Text>
    </View>
  );
}

function TabPill({ label, active, onPress, theme }) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.tabPill,
        active
          ? {
              backgroundColor: theme.colors.text,
              borderColor: theme.colors.text,
            }
          : {
              backgroundColor: "transparent",
              borderColor: theme.colors.border,
            },
      ]}
    >
      <Text
        style={{
          fontSize: 13,
          fontWeight: "600",
          color: active ? theme.colors.card : theme.colors.textSec,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const btnBaseStyle = {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  paddingVertical: 10,
  paddingHorizontal: 16, // Tăng padding ngang lên lại
  borderRadius: 30, // PILL SHAPE
  minHeight: 40,
};

/* ---------- 3. NÚT BẤM ĐẸP (NEW STYLES) ---------- */
// Nút Primary (BLUE)
function PrimaryBtn({ onPress, children, theme, icon }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        btnBaseStyle,
        { backgroundColor: theme.colors.primary, marginBottom: 10 }, // Thêm margin bottom để cách nút phía dưới
        theme.btnShadow,
        pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
      ]}
    >
      {icon && (
        <Ionicons
          name={icon}
          size={16}
          color="#fff"
          style={{ marginRight: 6 }}
        />
      )}
      <Text style={styles.btnTextWhite}>{children}</Text>
    </Pressable>
  );
}

// Nút Success (GREEN)
function SuccessBtn({ onPress, children, theme, icon }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        btnBaseStyle,
        { backgroundColor: theme.colors.success, marginBottom: 10 },
        theme.successShadow,
        pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
      ]}
    >
      {icon && (
        <Ionicons
          name={icon}
          size={16}
          color="#fff"
          style={{ marginRight: 6 }}
        />
      )}
      <Text style={styles.btnTextWhite}>{children}</Text>
    </Pressable>
  );
}

// Nút Warning (ORANGE) - Dùng cho Đăng ký
function WarningBtn({ onPress, children, theme, icon }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        btnBaseStyle,
        { backgroundColor: theme.colors.warning, marginBottom: 10 },
        theme.warningShadow,
        pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
      ]}
    >
      {icon && (
        <Ionicons
          name={icon}
          size={16}
          color="#fff"
          style={{ marginRight: 6 }}
        />
      )}
      <Text style={styles.btnTextWhite}>{children}</Text>
    </Pressable>
  );
}

// Nút Outline (OUTLINE)
function OutlineBtn({ onPress, children, theme, icon }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        btnBaseStyle,
        {
          backgroundColor: "transparent",
          borderWidth: 1.5,
          borderColor: theme.colors.border,
          paddingVertical: 8.5, // Điều chỉnh bù trừ border
          marginBottom: 10,
        },
        pressed && { backgroundColor: theme.colors.text + "08" },
      ]}
    >
      {icon && (
        <Ionicons
          name={icon}
          size={16}
          color={theme.colors.text}
          style={{ marginRight: 6 }}
        />
      )}
      <Text
        style={{ fontWeight: "700", color: theme.colors.text, fontSize: 13 }}
      >
        {children}
      </Text>
    </Pressable>
  );
}
/* ---------- Main Screen ---------- */
export default function TournamentDashboardScreen({ isBack = false }) {
  const theme = useModernTheme();

  // --- Logic Auth (Giữ nguyên) ---
  const me = useSelector((s) => s.auth?.userInfo || null);
  const isAdmin = !!(
    me?.isAdmin ||
    me?.role === "admin" ||
    (Array.isArray(me?.roles) && me.roles.includes("admin"))
  );
  const isManagerOf = (tt) => {
    if (!me?._id) return false;
    if (String(tt?.createdBy) === String(me._id)) return true;
    if (Array.isArray(tt?.managers)) {
      return tt.managers.some((m) => String(m?.user ?? m) === String(me._id));
    }
    if (typeof tt?.isManager !== "undefined") return !!tt.isManager;
    return false;
  };
  const canManage = (tt) => isAdmin || isManagerOf(tt);

  const { sportType = "2", groupId = "0", status, q } = useLocalSearchParams();

  const initialTab = TABS.some((t) => t.key === String(status))
    ? String(status)
    : "upcoming";
  const [tab, setTab] = useState(initialTab);
  const [keyword, setKeyword] = useState(q ? String(q) : "");
  const [search, setSearch] = useState(q ? String(q).toLowerCase() : "");

  useEffect(() => {
    const tt = setTimeout(() => setSearch(keyword.trim().toLowerCase()), 300);
    return () => clearTimeout(tt);
  }, [keyword]);

  const {
    data: tournaments,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useGetTournamentsQuery(
    { sportType, groupId },
    { refetchOnFocus: true, refetchOnReconnect: true }
  );

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    try {
      setRefreshing(true);
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const [preview, setPreview] = useState(null);

  const filtered = useMemo(() => {
    const list = Array.isArray(tournaments) ? tournaments : [];
    return list
      .filter((tt) => tt.status === tab)
      .filter((tt) =>
        search ? tt.name?.toLowerCase().includes(search) : true
      );
  }, [tournaments, tab, search]);

  const onPressCard = (tt) => router.push(`/tournament/${tt._id}`);

  // === RENDER ITEM ===
  const renderItem = ({ item: tt }) => {
    const statusMeta = STATUS_CONFIG[tt.status] || STATUS_CONFIG.finished;

    return (
      <View
        style={[
          styles.cardContainer,
          {
            backgroundColor: theme.colors.card,
            borderWidth: theme.isDark ? 0 : 0.5,
            borderColor: theme.isDark ? "transparent" : "#e2e8f0",
          },
          theme.shadow,
        ]}
      >
        {/* Ảnh Bìa */}
        <View>
          <Pressable onPress={() => setPreview(tt.image)} activeOpacity={0.9}>
            <ExpoImage
              source={{
                uri:
                  normalizeUrl(tt.image) ||
                  "https://dummyimage.com/1200x675/cccccc/ffffff&text=No+Image",
              }}
              style={styles.cardImage}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          </Pressable>
          <View style={styles.statusBadgeOverlay}>
            <View
              style={[styles.statusDot, { backgroundColor: statusMeta.color }]}
            />
            <Text style={styles.statusTextOverlay}>{statusMeta.label}</Text>
          </View>
        </View>

        <View style={{ padding: 14 }}>
          <Pressable onPress={() => onPressCard(tt)}>
            <Text
              style={[styles.cardTitle, { color: theme.colors.text }]}
              numberOfLines={2}
            >
              {tt.name}
            </Text>
          </Pressable>

          <View style={{ gap: 6, marginTop: 8, marginBottom: 16 }}>
            <MetaRow
              theme={theme}
              icon="calendar-clear-outline"
              text={`${formatDate(tt.startDate)} - ${formatDate(tt.endDate)}`}
            />
            <MetaRow
              theme={theme}
              icon="location-outline"
              text={tt.location || "Địa điểm chưa cập nhật"}
            />
            <MetaRow
              theme={theme}
              icon="people-outline"
              text={`Đã đăng ký: ${tt.registered}/${tt.maxPairs}`}
            />
          </View>

          {/* Divider mờ */}
          <View
            style={{
              height: 1,
              backgroundColor: theme.colors.border,
              marginBottom: 12,
              opacity: 0.5,
            }}
          />

          {/* KHU VỰC NÚT BẤM:
            - Logic giữ nguyên.
            - Style mới (Pill shape).
            - Thêm icon minh họa cho sinh động.
          */}
          <View
            style={{
              flexDirection: "row",
              gap: 10,
              flexWrap: "wrap",
              marginTop: 4,
              marginBottom: -10,
            }}
          >
            {canManage(tt) ? (
              <>
                {/* 1. Lịch đấu (BLUE) */}
                <PrimaryBtn
                  theme={theme}
                  icon="calendar-outline"
                  onPress={() => router.push(`/tournament/${tt._id}/schedule`)}
                >
                  Lịch đấu
                </PrimaryBtn>
                {/* 2. Đăng ký (ORANGE) */}
                <WarningBtn
                  theme={theme}
                  icon="person-add-outline"
                  onPress={() => router.push(`/tournament/${tt._id}/register`)}
                >
                  Đăng ký
                </WarningBtn>
                {/* 3. Check-in (GREEN) */}
                <SuccessBtn
                  theme={theme}
                  icon="qr-code-outline"
                  onPress={() => router.push(`/tournament/${tt._id}/checkin`)}
                >
                  Check-in
                </SuccessBtn>
                {/* 4. Sơ đồ (OUTLINE) */}
                <OutlineBtn
                  theme={theme}
                  icon="git-network-outline"
                  onPress={() =>
                    router.push({
                      pathname: "/tournament/[id]/bracket",
                      params: { id: tt._id },
                    })
                  }
                >
                  Sơ đồ
                </OutlineBtn>
              </>
            ) : tt.status === "upcoming" ? (
              <>
                {/* Đăng ký (ORANGE) */}
                <WarningBtn
                  theme={theme}
                  icon="person-add-outline"
                  onPress={() => router.push(`/tournament/${tt._id}/register`)}
                >
                  Đăng ký
                </WarningBtn>
                <OutlineBtn
                  theme={theme}
                  icon="git-network-outline"
                  onPress={() =>
                    router.push({
                      pathname: "/tournament/[id]/bracket",
                      params: { id: tt._id },
                    })
                  }
                >
                  Sơ đồ
                </OutlineBtn>
              </>
            ) : tt.status === "ongoing" ? (
              <>
                {/* Lịch đấu (BLUE) */}
                <PrimaryBtn
                  theme={theme}
                  icon="calendar-outline"
                  onPress={() => router.push(`/tournament/${tt._id}/schedule`)}
                >
                  Lịch đấu
                </PrimaryBtn>
                {/* Check-in (GREEN) */}
                <SuccessBtn
                  theme={theme}
                  icon="qr-code-outline"
                  onPress={() => router.push(`/tournament/${tt._id}/checkin`)}
                >
                  Check-in
                </SuccessBtn>
                {/* Sơ đồ (OUTLINE) */}
                <OutlineBtn
                  theme={theme}
                  icon="git-network-outline"
                  onPress={() =>
                    router.push({
                      pathname: "/tournament/[id]/bracket",
                      params: { id: tt._id },
                    })
                  }
                >
                  Sơ đồ
                </OutlineBtn>
              </>
            ) : (
              <>
                <OutlineBtn
                  theme={theme}
                  icon="git-network-outline"
                  onPress={() =>
                    router.push({
                      pathname: "/tournament/[id]/bracket",
                      params: { id: tt._id },
                    })
                  }
                >
                  Xem sơ đồ
                </OutlineBtn>
              </>
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          {isBack && (
            <Pressable
              onPress={() => router.back()}
              hitSlop={10}
              style={{ marginRight: 10 }}
            >
              <Ionicons
                name="chevron-back"
                size={28}
                color={theme.colors.text}
              />
            </Pressable>
          )}
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
            Giải đấu
          </Text>
        </View>

        {/* Search */}
        <View
          style={[
            styles.searchBox,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Ionicons name="search" size={20} color={theme.colors.textSec} />
          <TextInput
            style={[styles.searchInput, { color: theme.colors.text }]}
            placeholder="Tìm kiếm giải đấu..."
            placeholderTextColor={theme.colors.textSec}
            value={keyword}
            onChangeText={setKeyword}
          />
          {keyword.length > 0 && (
            <Pressable onPress={() => setKeyword("")}>
              <Ionicons
                name="close-circle"
                size={18}
                color={theme.colors.textSec}
              />
            </Pressable>
          )}
        </View>

        {/* Tabs */}
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
          {TABS.map((t) => (
            <TabPill
              key={t.key}
              label={t.label}
              active={tab === t.key}
              onPress={() => setTab(t.key)}
              theme={theme}
            />
          ))}
        </View>

        {/* Error & List */}
        {!!error && (
          <View
            style={[
              styles.errorBox,
              { backgroundColor: "#fef2f2", borderColor: "#fca5a5" },
            ]}
          >
            <Ionicons name="alert-circle" size={20} color="#ef4444" />
            <Text style={{ color: "#b91c1c", flex: 1 }}>
              {error?.data?.message || error?.error || "Có lỗi xảy ra"}
            </Text>
          </View>
        )}

        {!error && (
          <View style={{ flex: 1 }}>
            {isLoading || isFetching ? (
              <FlatList
                data={Array.from({ length: SKELETON_COUNT })}
                keyExtractor={(_, i) => `sk-${i}`}
                renderItem={() => <SkeletonCard />}
                ItemSeparatorComponent={() => <View style={{ height: 20 }} />}
                contentContainerStyle={{ paddingBottom: 30 }}
              />
            ) : (
              <FlatList
                data={filtered}
                keyExtractor={(item) => String(item._id)}
                renderItem={renderItem}
                contentContainerStyle={{ paddingBottom: 100 }}
                ItemSeparatorComponent={() => <View style={{ height: 20 }} />}
                refreshing={refreshing}
                onRefresh={onRefresh}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                  <View style={styles.emptyState}>
                    <MaterialCommunityIcons
                      name="trophy-broken"
                      size={64}
                      color={theme.colors.border}
                    />
                    <Text
                      style={{
                        color: theme.colors.textSec,
                        marginTop: 12,
                        fontSize: 16,
                      }}
                    >
                      Không tìm thấy giải đấu nào.
                    </Text>
                  </View>
                }
              />
            )}
          </View>
        )}
      </View>

      <ImageView
        images={[{ uri: normalizeUrl(preview) }]}
        imageIndex={0}
        visible={!!preview}
        onRequestClose={() => setPreview(null)}
        swipeToCloseEnabled
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },
  cardContainer: {
    borderRadius: 20,
    marginBottom: 6, // Tăng từ 2 lên 6 để shadow bottom hiện rõ hơn
    overflow: Platform.OS === "android" ? "hidden" : "visible", // Android cần hidden cho border radius
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    marginTop: Platform.OS === "android" ? 10 : 0,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    marginBottom: 16,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    height: "100%",
    fontSize: 16,
  },
  tabPill: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  cardContainer: {
    borderRadius: 20, // Bo góc Card to hơn
    marginBottom: 2,
  },
  cardImage: {
    width: "100%",
    aspectRatio: BANNER_RATIO,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  statusBadgeOverlay: {
    position: "absolute",
    top: 12,
    left: 12,
    backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusTextOverlay: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  cardTitle: {
    fontSize: 19, // To hơn 1 chút
    fontWeight: "700",
    marginBottom: 4,
    lineHeight: 28,
  },

  // === NÚT BẤM PRO STYLE ===
  btnBase: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 30, // PILL SHAPE
  },
  btnTextWhite: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },

  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
  },
});
