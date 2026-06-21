// app/news/index.jsx
import React, { useMemo, useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Animated,
  RefreshControl,
} from "react-native";
import { Stack, router } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useGetNewsQuery } from "@/slices/newsApiSlice";
import { normalizeUrl } from "@/utils/normalizeUri";

const FALLBACK_IMG =
  "https://dummyimage.com/600x400/A29BFE/ffffff&text=Pickleball+News";

/* ========== Utils ========== */
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

/* ========== Shimmer & Skeleton ========== */
function Shimmer({
  style,
  base = "#e6e8ee",
  highlight = "rgba(255,255,255,0.35)",
  radius = 10,
}) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(anim, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-200, 200],
  });

  return (
    <View
      style={[
        { overflow: "hidden", backgroundColor: base, borderRadius: radius },
        style,
      ]}
    >
      <Animated.View
        style={[StyleSheet.absoluteFillObject, { transform: [{ translateX }] }]}
      >
        <LinearGradient
          colors={["transparent", highlight, "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ width: 200, height: "100%" }}
        />
      </Animated.View>
    </View>
  );
}

function NewsCardSkeleton({ theme }) {
  const isDark = !!theme?.dark;
  const card = theme?.colors?.card ?? (isDark ? "#14171c" : "#ffffff");
  const base = isDark ? "#1f2430" : "#eef1f6";
  const chip = isDark ? "#242a36" : "#e9ecf2";

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: card, borderColor: "transparent" },
      ]}
    >
      <Shimmer style={{ height: 170 }} base={base} radius={0} />
      <View style={{ padding: 12, gap: 8 }}>
        <Shimmer style={{ height: 16, width: "86%" }} base={base} />
        <Shimmer style={{ height: 12, width: "70%" }} base={base} />
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            marginTop: 2,
          }}
        >
          <Shimmer
            style={{ height: 11, width: 90, backgroundColor: chip }}
            base={base}
            radius={999}
          />
        </View>
        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
          <Shimmer
            style={{ height: 18, width: 64, backgroundColor: chip }}
            base={base}
            radius={999}
          />
          <Shimmer
            style={{ height: 18, width: 48, backgroundColor: chip }}
            base={base}
            radius={999}
          />
          <Shimmer
            style={{ height: 18, width: 72, backgroundColor: chip }}
            base={base}
            radius={999}
          />
        </View>
        <Shimmer
          style={{ height: 32, width: 110, alignSelf: "flex-start" }}
          base={base}
          radius={10}
        />
      </View>
    </View>
  );
}

function NewsListSkeleton({ theme }) {
  const data = new Array(6).fill(0).map((_, i) => i);
  return (
    <FlatList
      data={data}
      keyExtractor={(i) => `s-${i}`}
      renderItem={() => <NewsCardSkeleton theme={theme} />}
      contentContainerStyle={styles.listContent}
      scrollEnabled={false}
    />
  );
}

/* ========== Item ========== */
function NewsListItem({ item, theme }) {
  const isDark = !!theme?.dark;
  const bg = theme?.colors?.card ?? (isDark ? "#14171c" : "#ffffff");
  const text = theme?.colors?.text ?? (isDark ? "#ffffff" : "#111111");
  const sub = isDark ? "#b0b0b0" : "#666666";
  const border = theme?.colors?.border ?? (isDark ? "#2a2e35" : "#e0e0e0");

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => router.push(`/news/${item.slug}`)}
      style={[styles.card, { backgroundColor: bg, borderColor: border }]}
    >
      <View style={styles.imageWrap}>
        <Image
          source={{
            uri: normalizeUrl(item.thumbImageUrl || item.heroImageUrl || FALLBACK_IMG),
          }}
          style={styles.image}
          contentFit="cover"
          transition={200}
        />
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.7)"]}
          style={styles.imageOverlay}
        />
        {item.sourceName ? (
          <View style={styles.sourceBadge}>
            <Text style={styles.sourceText} numberOfLines={1}>
              {item.sourceName}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.info}>
        <Text style={[styles.title, { color: text }]} numberOfLines={2}>
          {item.title}
        </Text>

        {item.summary ? (
          <Text style={[styles.summary, { color: sub }]} numberOfLines={2}>
            {item.summary}
          </Text>
        ) : null}

        <View style={styles.metaRow}>
          <Ionicons name="time-outline" size={14} color={sub} />
          <Text style={[styles.metaText, { color: sub }]}>
            {formatDate(item.originalPublishedAt || item.createdAt)}
          </Text>
        </View>

        {Array.isArray(item.tags) && item.tags.length > 0 && (
          <View style={styles.tagsRow}>
            {item.tags.slice(0, 3).map((tag) => (
              <View key={tag} style={styles.tagChip}>
                <Text style={styles.tagText}>#{tag}</Text>
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => router.push(`/news/${item.slug}`)}
          style={styles.detailBtnWrapper}
        >
          <LinearGradient
            colors={["#A29BFE", "#FD79A8"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.detailBtn}
          >
            <Text style={styles.detailBtnText}>Chi tiết</Text>
            <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

/* ========== Screen ========== */
export default function NewsListScreen() {
  const theme = useTheme();
  const isDark = !!theme?.dark;
  const bg = theme?.colors?.background ?? (isDark ? "#020817" : "#f5f7fb");

  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight(); // chính xác chiều cao header hiện tại
  const topOffset = headerHeight; // tránh nội dung bị che bởi header trong suốt

  const { data, isLoading, isError, refetch, isFetching } = useGetNewsQuery(
    { limit: 50 },
    { refetchOnFocus: true }
  );

  const [searchVisible, setSearchVisible] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [sortMode, setSortMode] = useState("latest");

  const items = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const filteredItems = useMemo(() => {
    let list = [...items];
    const q = searchText.trim().toLowerCase();
    if (q) {
      list = list.filter((n) => {
        const title = (n.title || "").toLowerCase();
        const summary = (n.summary || "").toLowerCase();
        const source = (n.sourceName || "").toLowerCase();
        const tags = Array.isArray(n.tags)
          ? n.tags.join(" ").toLowerCase()
          : "";
        return (
          title.includes(q) ||
          summary.includes(q) ||
          source.includes(q) ||
          tags.includes(q)
        );
      });
    }
    list.sort((a, b) => {
      const da = new Date(a.originalPublishedAt || a.createdAt || 0).getTime();
      const db = new Date(b.originalPublishedAt || b.createdAt || 0).getTime();
      return sortMode === "oldest" ? da - db : db - da;
    });
    return list;
  }, [items, searchText, sortMode]);

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: "",
          headerTitleAlign: "left",
          headerShadowVisible: false,
          headerTransparent: true,
          headerStyle: { backgroundColor: "transparent" },
          headerBackground: () => (
            <LinearGradient
              colors={[
                "rgba(9,9,20,0.98)",
                "rgba(79,70,229,0.98)",
                "rgba(9,9,20,0.0)",
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={{ flex: 1 }}
            />
          ),
          headerLeft: () => (
            <View style={styles.newsHeaderPill}>
              <View style={styles.newsHeaderDot} />
              <Text style={styles.newsHeaderTitle}>PickleTour News</Text>
            </View>
          ),
          headerRight: () => (
            <View style={styles.newsHeaderRight}>
              <TouchableOpacity
                onPress={() => setSearchVisible((v) => !v)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="search" size={20} color="#FFFFFF" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() =>
                  setSortMode((m) => (m === "latest" ? "oldest" : "latest"))
                }
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.headerRightSpacer}
              >
                <Ionicons name="options" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          ),
        }}
      />

      <View
        style={[
          styles.container,
          {
            backgroundColor: bg,
            paddingTop: topOffset,
          },
        ]}
      >
        {searchVisible && (
          <View style={styles.searchBarWrap}>
            <Ionicons
              name="search"
              size={18}
              color="#A29BFE"
              style={{ marginRight: 6 }}
            />
            <TextInput
              placeholder="Tìm bài viết, nguồn, tag..."
              placeholderTextColor="#9aa0b1"
              value={searchText}
              onChangeText={setSearchText}
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {searchText.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchText("")}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={18} color="#9aa0b1" />
              </TouchableOpacity>
            )}
          </View>
        )}

        {items.length > 0 && !isLoading && (
          <View style={styles.sortBar}>
            <Ionicons
              name={
                sortMode === "latest"
                  ? "time-outline"
                  : "arrow-down-circle-outline"
              }
              size={14}
              color="#9aa0b1"
            />
            <Text style={styles.sortText}>
              {sortMode === "latest" ? "Sắp xếp: Mới nhất" : "Sắp xếp: Cũ nhất"}
            </Text>
          </View>
        )}

        {isLoading ? (
          <NewsListSkeleton theme={theme} />
        ) : isError ? (
          <View style={styles.centerWrap}>
            <Text style={styles.errorText}>Không tải được tin tức.</Text>
            <TouchableOpacity onPress={refetch} style={styles.retryBtn}>
              <Text style={styles.retryText}>Thử lại</Text>
            </TouchableOpacity>
          </View>
        ) : filteredItems.length === 0 ? (
          <View style={styles.centerWrap}>
            <Text style={styles.emptyText}>Không có bài viết phù hợp.</Text>
          </View>
        ) : (
          <FlatList
            data={filteredItems}
            keyExtractor={(item) => item.slug}
            renderItem={({ item }) => (
              <NewsListItem item={item} theme={theme} />
            )}
            contentContainerStyle={styles.listContent}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={isFetching}
                onRefresh={refetch}
                tintColor="#A29BFE"
                colors={["#A29BFE", "#FD79A8"]}
                progressBackgroundColor={isDark ? "#020817" : "#f5f7fb"}
              />
            }
          />
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { padding: 16, paddingBottom: 32, gap: 16 },
  card: {
    borderWidth: 1,
    borderRadius: 18,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  imageWrap: { position: "relative", height: 170 },
  image: { width: "100%", height: "100%" },
  imageOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 70,
  },
  sourceBadge: {
    position: "absolute",
    left: 10,
    bottom: 10,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  sourceText: { color: "#fff", fontSize: 10, fontWeight: "600" },
  info: { padding: 12, gap: 6 },
  title: { fontSize: 16, fontWeight: "700" },
  summary: { fontSize: 13 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  metaText: { fontSize: 11 },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 },
  tagChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: "rgba(162,155,254,0.15)",
  },
  tagText: { fontSize: 10, color: "#A29BFE", fontWeight: "600" },
  detailBtnWrapper: {
    marginTop: 8,
    borderRadius: 10,
    overflow: "hidden",
    alignSelf: "flex-start",
  },
  detailBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 6,
  },
  detailBtnText: { fontSize: 13, fontWeight: "700", color: "#FFFFFF" },
  centerWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 8,
  },
  errorText: { fontSize: 14, color: "#ff4d4f", textAlign: "center" },
  emptyText: { fontSize: 14, color: "#888" },
  retryBtn: {
    marginTop: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#A29BFE",
  },
  retryText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  newsHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 4,
    gap: 8,
  },
  newsHeaderDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#FFFFFF",
    opacity: 0.95,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  newsHeaderTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: 0.8,
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  newsHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.26)",
  },
  searchBarWrap: {
    marginHorizontal: 16,
    marginBottom: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: "rgba(6,10,18,0.98)",
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
    gap: 6,
  },
  searchInput: { flex: 1, fontSize: 13, color: "#e4e7ed" },
  sortBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: 18,
    marginBottom: 4,
  },
  sortText: { fontSize: 11, color: "#9aa0b1" },
  headerRightSpacer: { marginLeft: 10 },
  newsHeaderPill: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 4,
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
});
