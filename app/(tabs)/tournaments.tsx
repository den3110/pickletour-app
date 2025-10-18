// app/(app)/tournaments/DashboardScreen.jsx
import { useGetTournamentsQuery } from "@/slices/tournamentsApiSlice";
import { router, Stack, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Modal,
  Platform,
  Pressable,
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

const SKELETON_COUNT = 6;
const BANNER_RATIO = 16 / 9; // Ảnh đầu card tỉ lệ 16:9

const TABS = ["upcoming", "ongoing", "finished"];
const STATUS_LABEL = {
  upcoming: "Sắp diễn ra",
  ongoing: "Đang diễn ra",
  finished: "Đã diễn ra",
};
const STATUS_BG = {
  upcoming: "#0288d1",
  ongoing: "#2e7d32",
  finished: "#9e9e9e",
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

  const scheme = useColorScheme() ?? "light";
  const tint = scheme === "dark" ? "#7cc0ff" : "#0a84ff";
  const bg = scheme === "dark" ? "#0b0d10" : "#f5f7fb";
  const cardBg = scheme === "dark" ? "#16181c" : "#ffffff";
  const border = scheme === "dark" ? "#2e2f33" : "#e4e8ef";
  const text = scheme === "dark" ? "#f7f7f7" : "#111";
  const subtext = scheme === "dark" ? "#c9c9c9" : "#555";
  const skBase = scheme === "dark" ? "#22262c" : "#e9eef5";

  const me = useSelector((s) => s.auth?.userInfo || null);
  const isAdmin = !!(
    me?.isAdmin ||
    me?.role === "admin" ||
    (Array.isArray(me?.roles) && me.roles.includes("admin"))
  );
  const isManagerOf = (t) => {
    if (!me?._id) return false;
    if (String(t?.createdBy) === String(me._id)) return true;
    if (Array.isArray(t?.managers)) {
      return t.managers.some((m) => String(m?.user ?? m) === String(me._id));
    }
    if (typeof t?.isManager !== "undefined") return !!t.isManager;
    return false;
  };
  const canManage = (t) => isAdmin || isManagerOf(t);

  // /tournaments/DashboardScreen?sportType=2&groupId=0&status=ongoing&q=abc
  const { sportType = "2", groupId = "0", status, q } = useLocalSearchParams();

  const initialTab = TABS.includes(String(status))
    ? String(status)
    : "upcoming";
  const [tab, setTab] = useState(initialTab);

  const [keyword, setKeyword] = useState(q ? String(q) : "");
  const [search, setSearch] = useState(q ? String(q).toLowerCase() : "");

  useEffect(() => {
    const t = setTimeout(() => setSearch(keyword.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
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

  const [preview, setPreview] = useState(null);

  const filtered = useMemo(() => {
    const list = Array.isArray(tournaments) ? tournaments : [];
    return list
      .filter((t) => t.status === tab)
      .filter((t) => (search ? t.name?.toLowerCase().includes(search) : true));
  }, [tournaments, tab, search]);

  const onPressCard = (t) => router.push(`/tournament/${t._id}`);

  // === Card render: Ảnh full width ở trên, nội dung bên dưới ===
  const renderItem = ({ item: t }) => (
    <View
      style={[styles.card, { backgroundColor: cardBg, borderColor: border }]}
    >
      {/* Ảnh trên cùng, full width */}
      <Pressable
        onPress={() => setPreview(t.image)}
        style={{ marginBottom: 10 }}
      >
        <ExpoImage
          source={{
            uri:
              normalizeUrl(t.image) ||
              "https://dummyimage.com/1200x675/cccccc/ffffff&text=No+Image",
          }}
          style={{
            width: "100%",
            aspectRatio: BANNER_RATIO,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: border,
          }}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={120}
          recyclingKey={String(t._id)}
        />
      </Pressable>

      {/* Nội dung */}
      <View style={{ gap: 6 }}>
        <Pressable onPress={() => onPressCard(t)}>
          <Text style={[styles.title, { color: text }]} numberOfLines={2}>
            {t.name}
          </Text>
        </Pressable>

        <Text style={{ color: subtext, marginTop: 2 }}>
          Đăng ký đến {formatDate(t.registrationDeadline)}
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
          <StatusChip status={t.status} />
          <InfoChip
            label={`Thời gian: ${formatDate(t.startDate)} – ${formatDate(
              t.endDate
            )}`}
          />
          <InfoChip label={`Địa điểm: ${t.location || "-"}`} />
          <InfoChip label={`Đăng ký: ${t.registered}/${t.maxPairs}`} />
        </View>

        <View
          style={{
            flexDirection: "row",
            gap: 8,
            flexWrap: "wrap",
            marginTop: 10,
          }}
        >
          {t.status === "ongoing" ? (
            <PrimaryBtn
              onPress={() => router.push(`/tournament/${t._id}/schedule`)}
            >
              Lịch đấu
            </PrimaryBtn>
          ) : (
            <PrimaryBtn
              onPress={() => router.push(`/tournament/${t._id}/register`)}
            >
              Đăng ký
            </PrimaryBtn>
          )}
          {t.status === "ongoing" && canManage(t) && (
            <PrimaryBtn
              onPress={() => router.push(`/tournament/${t._id}/register`)}
            >
              Đăng ký
            </PrimaryBtn>
          )}
          <SuccessBtn
            onPress={() => router.push(`/tournament/${t._id}/checkin`)}
          >
            Check-in
          </SuccessBtn>
          <OutlineBtn
            onPress={() =>
              router.push({
                pathname: "/tournament/[id]/bracket",
                params: { id: t._id },
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

  return (
    <>
      <View
        style={[
          styles.screen,
          { backgroundColor: bg },
          isIOS && { marginBottom: 70 },
        ]}
      >
        {/* Tabs */}
        <TabsBar
          value={tab}
          onChange={setTab}
          tint={tint}
          text={text}
          border={border}
        />

        {/* Search */}
        <TextInput
          value={keyword}
          onChangeText={setKeyword}
          placeholder="Tìm kiếm tên giải"
          placeholderTextColor="#9aa0a6"
          style={[
            styles.input,
            { borderColor: border, color: text, backgroundColor: cardBg },
          ]}
        />

        {/* Lỗi */}
        {!!error && (
          <View
            style={[
              styles.alert,
              { borderColor: "#ef4444", backgroundColor: "#fee2e2" },
            ]}
          >
            <Text style={{ color: "#991b1b" }}>
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
                    border={border}
                    cardBg={cardBg}
                    skBase={skBase}
                  />
                )}
                contentContainerStyle={{ paddingBottom: 24 }}
                ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
                refreshing={refreshing}
                onRefresh={onRefresh}
                ListFooterComponent={
                  isFetching && !isLoading ? (
                    <View style={{ paddingTop: 8, alignItems: "center" }}>
                      <Text style={{ color: subtext, fontSize: 12 }}>
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
                      { borderColor: "#0284c7", backgroundColor: "#e0f2fe" },
                    ]}
                  >
                    <Text style={{ color: "#075985" }}>
                      Không có giải nào phù hợp.
                    </Text>
                  </View>
                }
              />
            )}
          </>
        )}

        {/* Preview modal */}
        <Modal
          visible={!!preview}
          transparent
          animationType="fade"
          onRequestClose={() => setPreview(null)}
        >
          <View style={styles.modalBackdrop}>
            <Pressable style={{ flex: 1 }} onPress={() => setPreview(null)} />
            <View
              style={[
                styles.modalCard,
                { backgroundColor: cardBg, borderColor: border },
              ]}
            >
              <Pressable
                onPress={() => setPreview(null)}
                style={styles.closeBtn}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>×</Text>
              </Pressable>

              <ExpoImage
                source={
                  normalizeUrl(preview) ||
                  "https://dummyimage.com/1200x675/cccccc/ffffff&text=Preview"
                }
                contentFit="contain"
                style={{
                  width: "100%",
                  aspectRatio: BANNER_RATIO,
                  borderRadius: 12,
                }}
                transition={150}
                cachePolicy="memory-disk"
              />
            </View>
            <Pressable style={{ flex: 1 }} onPress={() => setPreview(null)} />
          </View>
        </Modal>
      </View>
    </>
  );
}

/* ---------- Small UI pieces ---------- */
function TabsBar({ value, onChange, tint, text, border }) {
  return (
    <View style={[styles.tabs, { borderColor: border }]}>
      {TABS.map((v) => {
        const active = v === value;
        return (
          <Pressable
            key={v}
            onPress={() => onChange(v)}
            style={({ pressed }) => [
              styles.tabItem,
              {
                backgroundColor: active ? tint : "transparent",
                borderColor: active ? tint : border,
              },
              pressed && { opacity: 0.95 },
            ]}
          >
            <Text style={{ color: active ? "#fff" : text, fontWeight: "700" }}>
              {STATUS_LABEL[v]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function StatusChip({ status }) {
  const bg = STATUS_BG[status] || "#9e9e9e";
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
function InfoChip({ label }) {
  return (
    <View
      style={{
        backgroundColor: "#eef2f7",
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 8,
      }}
    >
      <Text style={{ color: "#263238", fontSize: 12 }}>{label}</Text>
    </View>
  );
}
function PrimaryBtn({ onPress, children }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        styles.btnPrimary,
        pressed && { opacity: 0.9 },
      ]}
    >
      <Text style={styles.btnTextWhite}>{children}</Text>
    </Pressable>
  );
}
function SuccessBtn({ onPress, children }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: "#16a34a" },
        pressed && { opacity: 0.9 },
      ]}
    >
      <Text style={styles.btnTextWhite}>{children}</Text>
    </Pressable>
  );
}
function OutlineBtn({ onPress, children }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        styles.btnOutline,
        pressed && { opacity: 0.95 },
      ]}
    >
      <Text style={{ fontWeight: "700", color: "#0a84ff" }}>{children}</Text>
    </Pressable>
  );
}

/* ---------- Styles ---------- */
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
  btn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  btnPrimary: { backgroundColor: "#0a84ff" },
  btnOutline: {
    borderWidth: 1,
    borderColor: "#0a84ff",
    backgroundColor: "transparent",
  },
  btnTextWhite: { color: "#fff", fontWeight: "700" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 560,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
  },
  closeBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.6)",
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
});
