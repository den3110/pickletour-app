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
  Keyboard,
  Modal,
  SafeAreaView
} from "react-native";
import { useSelector } from "react-redux";
import { Image as ExpoImage } from "expo-image";
import { normalizeUrl } from "@/utils/normalizeUri";
import { useTheme } from "@react-navigation/native";
import ImageView from "react-native-image-viewing";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import {
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Calendar } from "react-native-calendars";

const ViewerImage = (props) => {
  return (
    <ExpoImage {...props} cachePolicy="memory-disk" contentFit="contain" />
  );
};

const BANNER_RATIO = 16 / 9;
const SKELETON_COUNT = 4;

// --- Constants ---
const TABS = [
  { key: "upcoming", label: "Sắp diễn ra" },
  { key: "ongoing", label: "Đang diễn ra" },
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

function toDateId(d) {
  if (!d) return null;
  try {
    const dt = new Date(d);
    return dt.toISOString().slice(0, 10); // YYYY-MM-DD
  } catch {
    return null;
  }
}

function fromDateId(id) {
  if (!id) return null;
  return new Date(id + "T00:00:00");
}

/* ---------- Theme Tokens ---------- */
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

/* ---------- Skeleton ---------- */
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
        theme.cardShadow,
      ]}
    >
      <SkeletonBlock
        style={{
          width: "100%",
          aspectRatio: BANNER_RATIO,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
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
  paddingHorizontal: 16,
  borderRadius: 30,
  minHeight: 40,
};

/* ---------- Buttons ---------- */
function PrimaryBtn({ onPress, children, theme, icon }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        btnBaseStyle,
        { backgroundColor: theme.colors.primary, marginBottom: 10 },
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
          paddingVertical: 8.5,
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
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme() ?? "light";
  const isDark = scheme === "dark";

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

  // --- Date range filter ---
  const [dateModalVisible, setDateModalVisible] = useState(false);
  const [fromDate, setFromDate] = useState(null); // Date | null
  const [toDate, setToDate] = useState(null); // Date | null
  const [rangeDraft, setRangeDraft] = useState({ start: null, end: null }); // 'YYYY-MM-DD'

  const hasDateFilter = !!(fromDate && toDate);
  const canApply = !!(rangeDraft.start && rangeDraft.end);
  const isPickingStart = !rangeDraft.start;
  const isPickingEnd = !!rangeDraft.start && !rangeDraft.end;

  const stepLabel = isPickingStart
    ? "Chọn ngày bắt đầu"
    : isPickingEnd
    ? "Chọn ngày kết thúc"
    : "Đã chọn xong khoảng ngày";

  const hintLabel = isPickingStart
    ? "Chạm vào một ngày trong lịch để chọn ngày bắt đầu."
    : isPickingEnd
    ? "Chọn ngày kết thúc, sau đó bấm nút Áp dụng để lọc."
    : "Kiểm tra lại khoảng ngày rồi bấm Áp dụng để lọc kết quả.";

  const applyLabel = isPickingStart
    ? "Chọn ngày bắt đầu"
    : isPickingEnd
    ? "Chọn ngày kết thúc"
    : "Áp dụng";

  const openDateModal = () => {
    setRangeDraft({
      start: toDateId(fromDate),
      end: toDateId(toDate),
    });
    setDateModalVisible(true);
  };

  const clearDateFilter = () => {
    setFromDate(null);
    setToDate(null);
  };

  const filtered = useMemo(() => {
    const list = Array.isArray(tournaments) ? tournaments : [];
    return list
      .filter((tt) => tt.status === tab)
      .filter((tt) => (search ? tt.name?.toLowerCase().includes(search) : true))
      .filter((tt) => {
        if (!fromDate && !toDate) return true;
        if (!tt.startDate) return true;
        const s = new Date(tt.startDate);
        if (fromDate && s < fromDate) return false;
        if (toDate && s > toDate) return false;
        return true;
      });
  }, [tournaments, tab, search, fromDate, toDate]);

  const onPressCard = (tt) => router.push(`/tournament/${tt._id}`);

  // === RENDER ITEM ===
  const renderItem = ({ item: tt }) => {
    const statusMeta = STATUS_CONFIG[tt.status] || STATUS_CONFIG.finished;

    const onPressSchedule = () => router.push(`/tournament/${tt._id}/schedule`);
    const onPressRegister = () => router.push(`/tournament/${tt._id}/register`);
    const onPressBracket = () =>
      router.push({
        pathname: "/tournament/[id]/bracket",
        params: { id: tt._id },
      });

    const showRegister = canManage(tt) || tt.status === "upcoming";

    return (
      <View
        style={[
          styles.cardContainer,
          {
            backgroundColor: theme.colors.card,
            borderWidth: theme.isDark ? 0 : 0.5,
            borderColor: theme.isDark ? "transparent" : "#e2e8f0",
          },
          theme.cardShadow,
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

          {/* Divider */}
          <View
            style={{
              height: 1,
              backgroundColor: theme.colors.border,
              marginBottom: 12,
              opacity: 0.5,
            }}
          />

          {/* Buttons */}
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              justifyContent: "center",
              alignItems: "center",
              gap: 10,
              marginTop: 4,
              marginBottom: -10,
            }}
          >
            {/* ✅ FIX: Lịch đấu luôn hiện cho mọi user (kể cả khách) ở mọi trạng thái */}
            <PrimaryBtn
              theme={theme}
              icon="calendar-outline"
              onPress={onPressSchedule}
            >
              Lịch đấu
            </PrimaryBtn>

            {/* Đăng ký: giữ logic cũ (manager/admin luôn có, còn user thường chỉ upcoming) */}
            {showRegister && (
              <WarningBtn
                theme={theme}
                icon="person-add-outline"
                onPress={onPressRegister}
              >
                Đăng ký
              </WarningBtn>
            )}

            {/* Sơ đồ luôn hiện như trước */}
            <OutlineBtn
              theme={theme}
              icon="git-network-outline"
              onPress={onPressBracket}
            >
              {tt.status === "finished" ? "Xem sơ đồ" : "Sơ đồ"}
            </OutlineBtn>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View style={styles.container}>
        {/* ✅ FlatList bọc tất cả (kể cả Header) */}
        {isLoading || isFetching ? (
          <FlatList
            ListHeaderComponent={
              <View style={{ marginBottom: 10 }}>
                {/* Header Title */}
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
                  <Text
                    style={[styles.headerTitle, { color: theme.colors.text }]}
                  >
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
                  <Ionicons
                    name="search"
                    size={20}
                    color={theme.colors.textSec}
                  />
                  <TextInput
                    style={[styles.searchInput, { color: theme.colors.text }]}
                    placeholder="Tìm kiếm giải đấu..."
                    placeholderTextColor={theme.colors.textSec}
                    value={keyword}
                    onChangeText={setKeyword}
                    returnKeyType="search"
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

                {/* Tabs + Date filter */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 6,
                    gap: 8,
                    flexWrap: "wrap",
                    justifyContent: "space-between",
                  }}
                >
                  <View style={{ flexDirection: "row", gap: 8, flexShrink: 1 }}>
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

                  <Pressable
                    onPress={openDateModal}
                    style={({ pressed }) => [
                      styles.dateFilterPill,
                      {
                        backgroundColor: hasDateFilter
                          ? theme.colors.primary + "12"
                          : theme.colors.card,
                        borderColor: hasDateFilter
                          ? theme.colors.primary
                          : theme.colors.border,
                      },
                      pressed && { opacity: 0.9, transform: [{ scale: 0.97 }] },
                    ]}
                  >
                    <Ionicons
                      name="calendar-outline"
                      size={14}
                      color={
                        hasDateFilter
                          ? theme.colors.primary
                          : theme.colors.textSec
                      }
                      style={{ marginRight: 4 }}
                    />
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.dateFilterLabel,
                        {
                          color: hasDateFilter
                            ? theme.colors.primary
                            : theme.colors.textSec,
                        },
                      ]}
                    >
                      {hasDateFilter
                        ? `${formatDate(fromDate)} ~ ${formatDate(toDate)}`
                        : "Lọc theo ngày"}
                    </Text>

                    {hasDateFilter && (
                      <View
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: theme.colors.primary,
                          marginHorizontal: 4,
                        }}
                      />
                    )}

                    {hasDateFilter && (
                      <Pressable
                        hitSlop={8}
                        onPress={(e) => {
                          e.stopPropagation();
                          clearDateFilter();
                        }}
                        style={{ marginLeft: 2 }}
                      >
                        <Ionicons
                          name="close-circle"
                          size={14}
                          color={theme.colors.primary}
                        />
                      </Pressable>
                    )}
                  </Pressable>
                </View>

                {/* Error Message if any */}
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
              </View>
            }
            data={Array.from({ length: SKELETON_COUNT })}
            keyExtractor={(_, i) => `sk-${i}`}
            renderItem={() => <SkeletonCard />}
            ItemSeparatorComponent={() => <View style={{ height: 20 }} />}
            contentContainerStyle={{ paddingBottom: 30 }}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
          />
        ) : (
          <FlatList
            ListHeaderComponent={
              <View style={{ marginBottom: 10 }}>
                {/* Header Title */}
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
                  <Text
                    style={[styles.headerTitle, { color: theme.colors.text }]}
                  >
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
                  <Ionicons
                    name="search"
                    size={20}
                    color={theme.colors.textSec}
                  />
                  <TextInput
                    style={[styles.searchInput, { color: theme.colors.text }]}
                    placeholder="Tìm kiếm giải đấu..."
                    placeholderTextColor={theme.colors.textSec}
                    value={keyword}
                    onChangeText={setKeyword}
                    returnKeyType="search"
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

                {/* Tabs + Date filter */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 6,
                    gap: 8,
                    flexWrap: "wrap",
                    justifyContent: "space-between",
                  }}
                >
                  <View style={{ flexDirection: "row", gap: 8, flexShrink: 1 }}>
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

                  <Pressable
                    onPress={openDateModal}
                    style={({ pressed }) => [
                      styles.dateFilterPill,
                      {
                        backgroundColor: hasDateFilter
                          ? theme.colors.primary + "12"
                          : theme.colors.card,
                        borderColor: hasDateFilter
                          ? theme.colors.primary
                          : theme.colors.border,
                      },
                      pressed && { opacity: 0.9, transform: [{ scale: 0.97 }] },
                    ]}
                  >
                    <Ionicons
                      name="calendar-outline"
                      size={14}
                      color={
                        hasDateFilter
                          ? theme.colors.primary
                          : theme.colors.textSec
                      }
                      style={{ marginRight: 4 }}
                    />
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.dateFilterLabel,
                        {
                          color: hasDateFilter
                            ? theme.colors.primary
                            : theme.colors.textSec,
                        },
                      ]}
                    >
                      {hasDateFilter
                        ? `${formatDate(fromDate)} ~ ${formatDate(toDate)}`
                        : "Lọc theo ngày"}
                    </Text>

                    {hasDateFilter && (
                      <View
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: theme.colors.primary,
                          marginHorizontal: 4,
                        }}
                      />
                    )}

                    {hasDateFilter && (
                      <Pressable
                        hitSlop={8}
                        onPress={(e) => {
                          e.stopPropagation();
                          clearDateFilter();
                        }}
                        style={{ marginLeft: 2 }}
                      >
                        <Ionicons
                          name="close-circle"
                          size={14}
                          color={theme.colors.primary}
                        />
                      </Pressable>
                    )}
                  </Pressable>
                </View>

                {/* Error Message if any */}
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
              </View>
            }
            data={filtered}
            keyExtractor={(item) => String(item._id)}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: 100 }}
            ItemSeparatorComponent={() => <View style={{ height: 20 }} />}
            refreshing={refreshing}
            onRefresh={onRefresh}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
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

      {/* Date range modal */}
      <Modal
        visible={dateModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setDateModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[styles.modalCard, { backgroundColor: theme.colors.card }]}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: theme.colors.primary,
                textAlign: "center",
                marginBottom: 2,
              }}
            >
              {stepLabel}
            </Text>

            <Text
              style={{
                fontSize: 11,
                color: theme.colors.textSec,
                textAlign: "center",
                marginBottom: 8,
              }}
            >
              {hintLabel}
            </Text>

            <Calendar
              markingType="period"
              onDayPress={(day) => {
                const date = day.dateString; // 'YYYY-MM-DD'
                setRangeDraft((prev) => {
                  if (!prev.start || (prev.start && prev.end)) {
                    return { start: date, end: null };
                  }
                  if (date < prev.start) {
                    return { start: date, end: prev.start };
                  }
                  if (date === prev.start) {
                    return { start: date, end: date };
                  }
                  return { start: prev.start, end: date };
                });
              }}
              markedDates={(() => {
                const { start, end } = rangeDraft;
                if (!start && !end) return {};

                const marked = {};
                if (start && !end) {
                  marked[start] = {
                    startingDay: true,
                    endingDay: true,
                    color: "#0ea5e9",
                    textColor: "#fff",
                  };
                  return marked;
                }
                if (start && end) {
                  if (start === end) {
                    marked[start] = {
                      startingDay: true,
                      endingDay: true,
                      color: "#0ea5e9",
                      textColor: "#fff",
                    };
                    return marked;
                  }
                  const startDate = new Date(start);
                  const endDate = new Date(end);
                  const dayMs = 24 * 60 * 60 * 1000;
                  for (
                    let d = new Date(startDate);
                    d <= endDate;
                    d = new Date(d.getTime() + dayMs)
                  ) {
                    const id = d.toISOString().slice(0, 10);
                    if (id === start) {
                      marked[id] = {
                        startingDay: true,
                        color: "#0ea5e9",
                        textColor: "#fff",
                      };
                    } else if (id === end) {
                      marked[id] = {
                        endingDay: true,
                        color: "#0ea5e9",
                        textColor: "#fff",
                      };
                    } else {
                      marked[id] = {
                        color: "#bae6fd",
                        textColor: "#0f172a",
                      };
                    }
                  }
                }
                return marked;
              })()}
              theme={{
                backgroundColor: theme.colors.card,
                calendarBackground: theme.colors.card,
                textSectionTitleColor: theme.colors.textSec,
                dayTextColor: theme.colors.text,
                monthTextColor: theme.colors.text,
                arrowColor: theme.colors.text,
                todayTextColor: theme.colors.primary,
              }}
            />

            <View style={styles.modalBtnRow}>
              <Pressable
                onPress={() => setDateModalVisible(false)}
                style={styles.modalTextBtn}
              >
                <Text
                  style={{ color: theme.colors.textSec, fontWeight: "600" }}
                >
                  Đóng
                </Text>
              </Pressable>

              <Pressable
                disabled={!canApply}
                onPress={() => {
                  if (!canApply) return;
                  const { start, end } = rangeDraft;
                  setFromDate(start ? fromDateId(start) : null);
                  setToDate(end ? fromDateId(end) : null);
                  setDateModalVisible(false);
                }}
                style={[
                  styles.modalApplyBtn,
                  {
                    backgroundColor: canApply
                      ? theme.colors.primary
                      : theme.colors.text,
                    opacity: canApply ? 1 : 0.6,
                  },
                ]}
              >
                <Text
                  style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}
                >
                  {applyLabel}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <ImageView
        images={[{ uri: normalizeUrl(preview) }]}
        imageIndex={0}
        visible={!!preview}
        onRequestClose={() => setPreview(null)}
        swipeToCloseEnabled
        ImageComponent={ViewerImage}
        backgroundColor={isDark ? "#0b0b0c" : "#ffffff"}
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
    marginBottom: 6,
    overflow: Platform.OS === "android" ? "hidden" : "visible",
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
    fontSize: 19,
    fontWeight: "700",
    marginBottom: 4,
    lineHeight: 28,
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
  dateFilterPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: 240,
  },
  dateFilterLabel: {
    fontSize: 12,
    fontWeight: "600",
    flexShrink: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 16,
    padding: 12,
  },
  modalBtnRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 12,
    gap: 8,
  },
  modalTextBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modalApplyBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
});
