// app/(app)/tournaments/DashboardScreen.jsx
import { useGetTournamentsQuery } from "@/slices/tournamentsApiSlice";
import { router, Stack, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import { useSelector } from "react-redux";
import { Image as ExpoImage } from "expo-image";
import { normalizeUrl } from "@/utils/normalizeUri";
import { usePlatform } from "@/hooks/usePlatform";
import { useTheme } from "@react-navigation/native";

/* ✅ New: preview viewer dùng react-native-image-viewing + Expo Image cache */
import ImageView from "react-native-image-viewing";

const SKELETON_COUNT = 6;
const BANNER_RATIO = 16 / 9; // Ảnh đầu card tỉ lệ 16:9

const TABS = ["upcoming", "ongoing", "finished"];
const STATUS_LABEL = {
  upcoming: "Sắp diễn ra",
  ongoing: "Đang diễn ra",
  finished: "Đã diễn ra",
};

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

/* ---------- Theme tokens ---------- */
function useTokens() {
  const navTheme = useTheme?.() || {};
  const scheme = useColorScheme?.() || "light";
  const dark =
    typeof navTheme.dark === "boolean" ? navTheme.dark : scheme === "dark";

  const primary = navTheme?.colors?.primary ?? (dark ? "#7cc0ff" : "#0a84ff");
  const text = navTheme?.colors?.text ?? (dark ? "#f7f7f7" : "#111");
  const card = navTheme?.colors?.card ?? (dark ? "#16181c" : "#ffffff");
  const border = navTheme?.colors?.border ?? (dark ? "#2e2f33" : "#e4e8ef");
  const background =
    navTheme?.colors?.background ?? (dark ? "#0b0d10" : "#f5f7fb");

  return {
    dark,
    colors: { primary, text, card, border, background },

    muted: dark ? "#9aa0a6" : "#6b7280",
    subtext: dark ? "#c9c9c9" : "#555",
    skeletonBase: dark ? "#22262c" : "#e9eef5",
    headerBg: dark ? "#101418" : "#f1f5f9",
    divider: dark ? "#2a2e33" : "#e5e7eb",

    // Chips
    chipInfoBg: dark ? "#1f2937" : "#eef2f7",
    chipInfoFg: dark ? "#e5e7eb" : "#263238",
    chipInfoBd: dark ? "#334155" : "#e2e8f0",

    chipErrBg: dark ? "#3b0d0d" : "#fee2e2",
    chipErrFg: dark ? "#fecaca" : "#991b1b",
    chipErrBd: dark ? "#7f1d1d" : "#fecaca",

    chipInfo2Bg: dark ? "#0f2536" : "#e0f2fe",
    chipInfo2Fg: dark ? "#93c5fd" : "#075985",
    chipInfo2Bd: dark ? "#1e3a5f" : "#bae6fd",

    success: dark ? "#22c55e" : "#16a34a",

    // Status chip bg
    status: {
      upcoming: dark ? "#0b5fad" : "#0288d1",
      ongoing: dark ? "#1c6b2a" : "#2e7d32",
      finished: dark ? "#5f6368" : "#9e9e9e",
    },
  };
}

/* ---------- Skeleton utilities ---------- */
function usePulse() {
  const v = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(v, {
          toValue: 0.6,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return v;
}

function Skeleton({ style, bg }) {
  const opacity = usePulse();
  return (
    <Animated.View
      style={[{ backgroundColor: bg, opacity, borderRadius: 8 }, style]}
    />
  );
}

/** Skeleton card: Ảnh full width phía trên + các dòng text/chip/btn bên dưới */
function SkeletonCard({ border, cardBg, skBase }) {
  return (
    <View
      style={[styles.card, { backgroundColor: cardBg, borderColor: border }]}
    >
      {/* Ảnh skeleton */}
      <Skeleton
        style={{
          width: "100%",
          aspectRatio: BANNER_RATIO,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: border,
        }}
        bg={skBase}
      />
      {/* Nội dung skeleton */}
      <View style={{ gap: 8 }}>
        <Skeleton style={{ height: 18, width: "85%" }} bg={skBase} />
        <Skeleton style={{ height: 14, width: "55%" }} bg={skBase} />
        <View
          style={{
            flexDirection: "row",
            gap: 8,
            flexWrap: "wrap",
            marginTop: 2,
          }}
        >
          <Skeleton
            style={{ height: 18, width: 90, borderRadius: 10 }}
            bg={skBase}
          />
          <Skeleton
            style={{ height: 18, width: 180, borderRadius: 8 }}
            bg={skBase}
          />
          <Skeleton
            style={{ height: 18, width: 140, borderRadius: 8 }}
            bg={skBase}
          />
          <Skeleton
            style={{ height: 18, width: 100, borderRadius: 8 }}
            bg={skBase}
          />
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <Skeleton
            style={{ height: 36, width: 100, borderRadius: 10 }}
            bg={skBase}
          />
          <Skeleton
            style={{ height: 36, width: 100, borderRadius: 10 }}
            bg={skBase}
          />
          <Skeleton
            style={{ height: 36, width: 100, borderRadius: 10 }}
            bg={skBase}
          />
        </View>
      </View>
    </View>
  );
}

export default function TournamentDashboardScreen() {
  const { isIOS } = usePlatform();
  const t = useTokens();

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

  // /tournaments/DashboardScreen?sportType=2&groupId=0&status=ongoing&q=abc
  const { sportType = "2", groupId = "0", status, q } = useLocalSearchParams();

  const initialTab = TABS.includes(String(status))
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
    isFetching, // hiển thị skeleton mỗi lần refetch
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

  const [preview, setPreview] = useState(null); // string | null

  const filtered = useMemo(() => {
    const list = Array.isArray(tournaments) ? tournaments : [];
    return list
      .filter((tt) => tt.status === tab)
      .filter((tt) =>
        search ? tt.name?.toLowerCase().includes(search) : true
      );
  }, [tournaments, tab, search]);

  const onPressCard = (tt) => router.push(`/tournament/${tt._id}`);

  // === Card render: Ảnh full width ở trên, nội dung bên dưới ===
  const renderItem = ({ item: tt }) => (
    <View
      style={[
        styles.card,
        { backgroundColor: t.colors.card, borderColor: t.colors.border },
      ]}
    >
      {/* Ảnh trên cùng, full width */}
      <Pressable
        onPress={() => setPreview(tt.image)}
        style={{ marginBottom: 10 }}
      >
        <ExpoImage
          source={{
            uri:
              normalizeUrl(tt.image) ||
              "https://dummyimage.com/1200x675/cccccc/ffffff&text=No+Image",
          }}
          style={{
            width: "100%",
            aspectRatio: BANNER_RATIO,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: t.colors.border,
          }}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={120}
          recyclingKey={String(tt._id)}
        />
      </Pressable>

      {/* Nội dung */}
      <View style={{ gap: 6 }}>
        <Pressable onPress={() => onPressCard(tt)}>
          <Text
            style={[styles.title, { color: t.colors.text }]}
            numberOfLines={2}
          >
            {tt.name}
          </Text>
        </Pressable>

        <Text style={{ color: t.subtext, marginTop: 2 }}>
          Đăng ký đến {formatDate(tt.registrationDeadline)}
        </Text>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginTop: 8,
            flexWrap: "wrap",
          }}
        >
          <StatusChip status={tt.status} t={t} />
          <InfoChip
            t={t}
            label={`Thời gian: ${formatDate(tt.startDate)} – ${formatDate(
              tt.endDate
            )}`}
          />
          <InfoChip t={t} label={`Địa điểm: ${tt.location || "-"}`} />
          <InfoChip t={t} label={`Đăng ký: ${tt.registered}/${tt.maxPairs}`} />
        </View>

        <View
          style={{
            flexDirection: "row",
            gap: 8,
            flexWrap: "wrap",
            marginTop: 10,
          }}
        >
          {tt.status === "ongoing" ? (
            <PrimaryBtn
              t={t}
              onPress={() => router.push(`/tournament/${tt._id}/schedule`)}
            >
              Lịch đấu
            </PrimaryBtn>
          ) : (
            <PrimaryBtn
              t={t}
              onPress={() => router.push(`/tournament/${tt._id}/register`)}
            >
              Đăng ký
            </PrimaryBtn>
          )}
          {tt.status === "ongoing" && canManage(tt) && (
            <PrimaryBtn
              t={t}
              onPress={() => router.push(`/tournament/${tt._id}/register`)}
            >
              Đăng ký
            </PrimaryBtn>
          )}
          <SuccessBtn
            t={t}
            onPress={() => router.push(`/tournament/${tt._id}/checkin`)}
          >
            Check-in
          </SuccessBtn>
          <OutlineBtn
            t={t}
            onPress={() =>
              router.push({
                pathname: "/tournament/[id]/bracket",
                params: { id: tt._id },
              })
            }
          >
            Sơ đồ
          </OutlineBtn>
        </View>
      </View>
    </View>
  );

  const showSkeleton = isLoading || isFetching;
  const skeletonData = useMemo(
    () => Array.from({ length: SKELETON_COUNT }, (_, i) => ({ id: `sk-${i}` })),
    []
  );

  /* ✅ Viewer: dùng react-native-image-viewing + Expo Image làm ImageComponent */
  const normalizedPreview =
    normalizeUrl(preview) ||
    "https://dummyimage.com/1200x675/cccccc/ffffff&text=Preview";

  // Map resizeMode -> contentFit cho ExpoImage để vẫn tương thích với viewer
  const CachedImage = (props) => {
    const { resizeMode, ...rest } = props || {};
    const fit =
      resizeMode === "contain"
        ? "contain"
        : resizeMode === "cover"
        ? "cover"
        : "cover";
    return (
      <ExpoImage
        {...rest}
        contentFit={fit}
        cachePolicy="memory-disk"
        transition={120}
      />
    );
  };

  const viewerImages = [{ uri: normalizedPreview }];

  return (
    <SafeAreaView style={{flex: 1}}>
      <View
        style={[
          styles.screen,
          { backgroundColor: t.colors.background },
        ]}
      >
        {/* Tabs */}
        <TabsBar value={tab} onChange={setTab} t={t} />

        {/* Search */}
        <TextInput
          value={keyword}
          onChangeText={setKeyword}
          placeholder="Tìm kiếm tên giải"
          placeholderTextColor={t.muted}
          style={[
            styles.input,
            {
              borderColor: t.colors.border,
              color: t.colors.text,
              backgroundColor: t.colors.card,
            },
          ]}
        />

        {/* Lỗi */}
        {!!error && (
          <View
            style={[
              styles.alert,
              { borderColor: t.chipErrBd, backgroundColor: t.chipErrBg },
            ]}
          >
            <Text style={{ color: t.chipErrFg }}>
              {error?.data?.message || error?.error || "Đã có lỗi xảy ra."}
            </Text>
          </View>
        )}

        {/* Danh sách */}
        {!error && (
          <>
            {showSkeleton ? (
              <FlatList
                data={skeletonData}
                keyExtractor={(item) => item.id}
                renderItem={() => (
                  <SkeletonCard
                    border={t.colors.border}
                    cardBg={t.colors.card}
                    skBase={t.skeletonBase}
                  />
                )}
                contentContainerStyle={{ paddingBottom: 24 }}
                ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
                refreshing={refreshing}
                onRefresh={onRefresh}
                ListFooterComponent={
                  isFetching && !isLoading ? (
                    <View style={{ paddingTop: 8, alignItems: "center" }}>
                      <Text style={{ color: t.subtext, fontSize: 12 }}>
                        Đang tải dữ liệu…
                      </Text>
                    </View>
                  ) : null
                }
              />
            ) : (
              <FlatList
                data={filtered}
                keyExtractor={(item) => String(item._id)}
                renderItem={renderItem}
                refreshing={refreshing}
                onRefresh={onRefresh}
                contentContainerStyle={{ paddingBottom: 24 }}
                ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
                ListEmptyComponent={
                  <View
                    style={[
                      styles.alert,
                      {
                        borderColor: t.chipInfo2Bd,
                        backgroundColor: t.chipInfo2Bg,
                      },
                    ]}
                  >
                    <Text style={{ color: t.chipInfo2Fg }}>
                      Không có giải nào phù hợp.
                    </Text>
                  </View>
                }
              />
            )}
          </>
        )}
          <ImageView
            images={viewerImages}
            imageIndex={0}
            visible={!!preview}
            onRequestClose={() => setPreview(null)}
            swipeToCloseEnabled
            doubleTapToZoomEnabled
            backgroundColor="rgba(0,0,0,0.95)"
            /* Dùng Expo Image để cache */
            ImageComponent={CachedImage}
            HeaderComponent={() => (
              <Pressable
                onPress={() => setPreview(null)}
                style={styles.viewerClose}
              >
                <Text
                  style={{ color: "#fff", fontWeight: "700", fontSize: 20 }}
                >
                  ×
                </Text>
              </Pressable>
            )}
          />
        {/* ✅ Preview image viewer */}
      </View>
    </SafeAreaView>
  );
}

/* ---------- Small UI pieces (themed via t prop) ---------- */
function TabsBar({ value, onChange, t }) {
  return (
    <View
      style={[
        styles.tabs,
        { borderColor: t.colors.border, backgroundColor: t.colors.card },
      ]}
    >
      {TABS.map((v) => {
        const active = v === value;
        return (
          <Pressable
            key={v}
            onPress={() => onChange(v)}
            style={({ pressed }) => [
              styles.tabItem,
              {
                backgroundColor: active ? t.colors.primary : "transparent",
                borderColor: active ? t.colors.primary : t.colors.border,
              },
              pressed && { opacity: 0.95 },
            ]}
          >
            <Text
              style={{
                color: active ? "#fff" : t.colors.text,
                fontWeight: "700",
              }}
            >
              {STATUS_LABEL[v]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function StatusChip({ status, t }) {
  const bg = t.status[status] || t.status.finished;
  return (
    <View
      style={{
        backgroundColor: bg,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
      }}
    >
      <Text style={{ color: "#fff", fontSize: 12 }}>
        {STATUS_LABEL[status] || status}
      </Text>
    </View>
  );
}
function InfoChip({ label, t }) {
  return (
    <View
      style={{
        backgroundColor: t.chipInfoBg,
        borderColor: t.chipInfoBd,
        borderWidth: 1,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 8,
      }}
    >
      <Text style={{ color: t.chipInfoFg, fontSize: 12 }}>{label}</Text>
    </View>
  );
}
function PrimaryBtn({ onPress, children, t }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: t.colors.primary },
        pressed && { opacity: 0.9 },
      ]}
    >
      <Text style={styles.btnTextWhite}>{children}</Text>
    </Pressable>
  );
}
function SuccessBtn({ onPress, children, t }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: t.success },
        pressed && { opacity: 0.9 },
      ]}
    >
      <Text style={styles.btnTextWhite}>{children}</Text>
    </Pressable>
  );
}
function OutlineBtn({ onPress, children, t }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        {
          borderWidth: 1,
          borderColor: t.colors.primary,
          backgroundColor: "transparent",
        },
        pressed && { opacity: 0.95 },
      ]}
    >
      <Text style={{ fontWeight: "700", color: t.colors.primary }}>
        {children}
      </Text>
    </Pressable>
  );
}

/* ---------- Styles (layout/spacing only) ---------- */
const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.select({ ios: 12, android: 10 }),
    marginBottom: 12,
    fontSize: 16,
  },
  tabs: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 12,
    padding: 4,
    gap: 8,
    marginBottom: 12,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  alert: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginVertical: 8,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    gap: 10, // khoảng cách giữa ảnh và nội dung
  },
  title: { fontSize: 16, fontWeight: "700" },
  btn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
  btnTextWhite: { color: "#fff", fontWeight: "700" },

  /* Close ở header của viewer */
  viewerClose: {
    position: "absolute",
    top: 14,
    right: 14,
    backgroundColor: "rgba(0,0,0,0.6)",
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
});
