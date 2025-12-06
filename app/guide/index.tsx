// app/guides/index.jsx
import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TouchableWithoutFeedback,
  useWindowDimensions,
} from "react-native";
import { Stack, router } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import YoutubePlayer from "react-native-youtube-iframe";
import * as Haptics from "expo-haptics";
import { useGetGuideFeedUrlQuery } from "@/slices/guidesApiSlice";

// Lấy nội dung giữa <tag>...</tag>
function extractTag(tag, text) {
  if (!text) return "";
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`);
  const m = text.match(re);
  return m ? m[1].trim() : "";
}

// Parse XML YouTube feed thành array video
function parseYouTubeFeed(xml) {
  if (!xml) return [];
  const parts = xml.split("<entry>").slice(1); // bỏ phần header

  const videos = parts
    .map((chunk) => {
      const entry = chunk.split("</entry>")[0];

      const videoId = extractTag("yt:videoId", entry);
      const title = extractTag("title", entry);
      const published = extractTag("published", entry);

      // thumbnail
      let thumbnail = "";
      const thumbMatch = entry.match(/media:thumbnail[^>]+url="([^"]+)"/);
      if (thumbMatch && thumbMatch[1]) {
        thumbnail = thumbMatch[1];
      } else if (videoId) {
        thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      }

      // description (để dành nếu cần sau)
      const description = extractTag("media:description", entry);

      // statistics: views
      let viewCount = null;
      const statsMatch = entry.match(/<media:statistics[^>]*>/);
      if (statsMatch && statsMatch[0]) {
        const tag = statsMatch[0];
        const vMatch = tag.match(/views="(\d+)"/);
        if (vMatch && vMatch[1]) {
          viewCount = parseInt(vMatch[1], 10);
        }
      }

      // starRating count (tạm coi như số lượt "đánh giá"/"like")
      let ratingCount = null;
      const ratingMatch = entry.match(/<media:starRating[^>]*>/);
      if (ratingMatch && ratingMatch[0]) {
        const tag = ratingMatch[0];
        const rMatch = tag.match(/count="(\d+)"/);
        if (rMatch && rMatch[1]) {
          ratingCount = parseInt(rMatch[1], 10);
        }
      }

      return {
        id: videoId,
        videoId,
        title,
        published,
        thumbnail,
        description,
        viewCount,
        ratingCount,
      };
    })
    .filter((v) => !!v.videoId);

  return videos;
}

function formatDate(d) {
  if (!d) return "";
  try {
    const dt = new Date(d);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const day = String(dt.getDate()).padStart(2, "0");
    return `${day}/${m}/${y}`;
  } catch {
    return "";
  }
}

function formatCount(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "";
  if (num >= 1_000_000)
    return (num / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return num.toString();
}

/* ========== Skeleton ========== */

function SkeletonBlock({
  width = "100%",
  height = 14,
  radius = 8,
  style,
  isDark,
}) {
  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: isDark ? "#1f2933" : "#e3e7f0",
        },
        style,
      ]}
    />
  );
}

function SkeletonItem({ isDark, cardBg }) {
  return (
    <View style={[styles.item, { backgroundColor: cardBg }]}>
      <View
        style={[
          styles.thumbnail,
          {
            backgroundColor: isDark ? "#2b3038" : "#dde3ee",
          },
        ]}
      />
      <View style={styles.itemContent}>
        <SkeletonBlock isDark={isDark} width="80%" height={14} />
        <View style={{ marginTop: 6 }}>
          <SkeletonBlock isDark={isDark} width="40%" height={12} />
        </View>
        <View style={[styles.chipsRow, { marginTop: 8 }]}>
          <SkeletonBlock isDark={isDark} width={90} height={18} radius={999} />
          <SkeletonBlock isDark={isDark} width={80} height={18} radius={999} />
        </View>
      </View>
      <SkeletonBlock isDark={isDark} width={18} height={18} radius={9} />
    </View>
  );
}

export default function GuidesScreen() {
  const theme = useTheme();
  const isDark = !!theme?.dark;
  const bg = isDark ? "#0b0f14" : "#f5f7fb";
  const cardBg = isDark ? "#14171c" : "#ffffff";
  const textColor = isDark ? "#ffffff" : "#111111";
  const subColor = isDark ? "#9aa0a6" : "#666666";
  const primary = theme?.colors?.primary ?? "#FF6B6B";

  const { width } = useWindowDimensions();
  const PREVIEW_RATIO = 16 / 9;
  const previewVideoWidth = Math.min(width * 0.9, 420);
  const previewVideoHeight = previewVideoWidth / PREVIEW_RATIO;

  const [videos, setVideos] = useState([]);
  // loading: chỉ dùng cho "initial / retry load" => show skeleton
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  // preview nhỏ khi long-press
  const [preview, setPreview] = useState({
    visible: false,
    video: null,
  });
  const longPressRef = useRef(false);

  // Lấy feed URL từ API (System settings)
  const {
    data: guideConfig,
    isLoading: guideLoading,
    isError: guideError,
  } = useGetGuideFeedUrlQuery();

  const fetchFeed = useCallback(async ({ url, showSkeleton = false } = {}) => {
    if (!url) return;
    try {
      setError("");
      if (showSkeleton) {
        setLoading(true);
      }
      const res = await fetch(url);
      const text = await res.text();
      const parsed = parseYouTubeFeed(text);
      setVideos(parsed);
    } catch (e) {
      console.log("Fetch feed error", e);
      setError("Không tải được danh sách video. Vui lòng thử lại.");
    } finally {
      if (showSkeleton) {
        setLoading(false);
      }
      setRefreshing(false);
    }
  }, []);

  // Initial load: chờ API trả URL, KHÔNG dùng default
  useEffect(() => {
    if (guideLoading) {
      // vẫn đang chờ API → giữ loading = true, skeleton
      return;
    }

    const url = (guideConfig?.guideUrl || "").trim();

    if (!url) {
      // API xong nhưng không có URL → không fetch, show error
      setLoading(false);
      setVideos([]);
      if (guideError) {
        setError("Không tải được cấu hình hướng dẫn.");
      } else {
        setError("Chưa cấu hình URL hướng dẫn.");
      }
      return;
    }

    // Có URL từ API → fetch với skeleton
    fetchFeed({ url, showSkeleton: true });
  }, [guideLoading, guideConfig, guideError, fetchFeed]);

  const onRefresh = () => {
    const url = (guideConfig?.guideUrl || "").trim();
    if (!url) {
      setRefreshing(false);
      return;
    }
    setRefreshing(true);
    fetchFeed({ url, showSkeleton: false });
  };

  const openPreview = async (video) => {
    if (!video) return;

    // 🔔 Rung nhẹ khi mở preview
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {
      if (__DEV__) console.log("Haptics error", e);
    }

    longPressRef.current = true;
    setPreview({ visible: true, video });
  };

  const closePreview = () => {
    longPressRef.current = false;
    setPreview({ visible: false, video: null });
  };

  const buildRoute = (video) => ({
    pathname: "/guide/[videoId]", // giữ như bạn đang dùng
    params: {
      videoId: video.videoId,
      title: video.title,
      published: video.published || "",
      views: typeof video.viewCount === "number" ? String(video.viewCount) : "",
      likes:
        typeof video.ratingCount === "number" ? String(video.ratingCount) : "",
    },
  });

  const handleItemPress = (video) => {
    // nếu vừa long-press thì bỏ onPress lần này, chỉ mở preview
    if (longPressRef.current) {
      longPressRef.current = false;
      return;
    }
    if (!video?.videoId) return;
    router.push(buildRoute(video));
  };

  const goToDetailFromPreview = (video) => {
    if (!video?.videoId) return;
    closePreview();
    router.push(buildRoute(video));
  };

  const renderItem = ({ item }) => {
    const viewsLabel = formatCount(item.viewCount);
    const likesLabel = formatCount(item.ratingCount);

    return (
      <TouchableOpacity
        activeOpacity={0.8}
        delayLongPress={300}
        onLongPress={() => openPreview(item)}
        onPress={() => handleItemPress(item)}
        style={[styles.item, { backgroundColor: cardBg }]}
      >
        <Image
          source={{ uri: item.thumbnail }}
          style={styles.thumbnail}
          contentFit="cover"
          transition={200}
        />

        <View style={styles.itemContent}>
          <Text style={[styles.title, { color: textColor }]} numberOfLines={2}>
            {item.title}
          </Text>

          <View style={styles.metaRow}>
            <Ionicons
              name="time-outline"
              size={14}
              color={subColor}
              style={{ marginRight: 4 }}
            />
            <Text style={[styles.date, { color: subColor }]}>
              {formatDate(item.published)}
            </Text>
          </View>

          <View style={styles.chipsRow}>
            {viewsLabel ? (
              <View style={styles.chip}>
                <Ionicons
                  name="eye-outline"
                  size={12}
                  color="#9AA0A6"
                  style={{ marginRight: 4 }}
                />
                <Text style={styles.chipText}>{viewsLabel} lượt xem</Text>
              </View>
            ) : null}

            {likesLabel ? (
              <View style={styles.chip}>
                <Ionicons
                  name="thumbs-up-outline"
                  size={12}
                  color="#9AA0A6"
                  style={{ marginRight: 4 }}
                />
                <Text style={styles.chipText}>{likesLabel} đánh giá</Text>
              </View>
            ) : null}
          </View>
        </View>

        <Ionicons name="chevron-forward" size={20} color={subColor} />
      </TouchableOpacity>
    );
  };

  const showSkeleton = loading && !refreshing;

  return (
    <>
      <Stack.Screen
        options={{
          title: "Hướng dẫn",
          headerTitleAlign: "center",
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.back()}
              style={{ paddingHorizontal: 8, paddingVertical: 4 }}
            >
              <Ionicons name="chevron-back" size={24} />
            </TouchableOpacity>
          ),
          headerBackTitle: "Quay lại",
        }}
      />
      <View style={[styles.container, { backgroundColor: bg }]}>
        {showSkeleton ? (
          <FlatList
            data={[1, 2, 3, 4, 5, 6]}
            keyExtractor={(item) => String(item)}
            renderItem={() => <SkeletonItem isDark={isDark} cardBg={cardBg} />}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            ListHeaderComponent={
              <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
                <SkeletonBlock
                  isDark={isDark}
                  width={180}
                  height={18}
                  radius={6}
                  style={{ marginBottom: 4 }}
                />
                <SkeletonBlock
                  isDark={isDark}
                  width={240}
                  height={12}
                  radius={6}
                />
              </View>
            }
          />
        ) : error ? (
          <View style={styles.center}>
            <Text style={{ color: textColor, marginBottom: 12 }}>{error}</Text>
            <TouchableOpacity
              style={[styles.retryBtn, { borderColor: primary }]}
              onPress={() => {
                const url = (guideConfig?.guideUrl || "").trim();
                if (!url) return;
                fetchFeed({ url, showSkeleton: true });
              }}
            >
              <Ionicons name="refresh" size={18} color={primary} />
              <Text style={[styles.retryText, { color: primary }]}>
                Thử lại
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={videos}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={{ color: subColor }}>Chưa có video nào.</Text>
              </View>
            }
          />
        )}
      </View>

      {/* ===== Preview video khi ấn giữ ===== */}
      <Modal
        visible={preview.visible}
        transparent
        animationType="fade"
        onRequestClose={closePreview}
      >
        {/* Bấm ra ngoài để tắt */}
        <TouchableWithoutFeedback onPress={closePreview}>
          <View style={styles.previewBackdrop}>
            {/* Bấm vào card thì không tắt overlay */}
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={[styles.previewCard, { backgroundColor: cardBg }]}>
                {/* Player 16:9 */}
                <View
                  style={[
                    styles.previewVideoWrap,
                    {
                      width: previewVideoWidth,
                      height: previewVideoHeight,
                    },
                  ]}
                >
                  {preview.video?.videoId ? (
                    <>
                      <YoutubePlayer
                        videoId={preview.video.videoId}
                        play={true}
                        width={previewVideoWidth}
                        height={previewVideoHeight}
                        onError={(e) => console.log("Preview YT error:", e)}
                      />

                      {/* Lớp chạm để mở full screen */}
                      <TouchableOpacity
                        activeOpacity={0.9}
                        style={styles.previewTapLayer}
                        onPress={() => goToDetailFromPreview(preview.video)}
                      >
                        <View style={styles.previewTapContent}>
                          <Ionicons
                            name="open-outline"
                            size={18}
                            color="#fff"
                          />
                          <Text style={styles.previewTapText}>
                            Mở toàn màn hình
                          </Text>
                        </View>
                      </TouchableOpacity>
                    </>
                  ) : null}
                </View>

                {/* Title + meta */}
                <Text
                  style={[styles.previewTitle, { color: textColor }]}
                  numberOfLines={2}
                >
                  {preview.video?.title || ""}
                </Text>

                <View style={styles.previewMetaRow}>
                  {preview.video?.published ? (
                    <View style={styles.previewMetaChip}>
                      <Ionicons
                        name="time-outline"
                        size={12}
                        color="#9AA0A6"
                        style={{ marginRight: 4 }}
                      />
                      <Text style={styles.previewMetaText}>
                        {formatDate(preview.video.published)}
                      </Text>
                    </View>
                  ) : null}

                  {typeof preview.video?.viewCount === "number" ? (
                    <View style={styles.previewMetaChip}>
                      <Ionicons
                        name="eye-outline"
                        size={12}
                        color="#9AA0A6"
                        style={{ marginRight: 4 }}
                      />
                      <Text style={styles.previewMetaText}>
                        {formatCount(preview.video.viewCount)} lượt xem
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    padding: 10,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  thumbnail: {
    width: 100,
    height: 60,
    borderRadius: 10,
    backgroundColor: "#ccc",
  },
  itemContent: {
    flex: 1,
    marginHorizontal: 10,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  date: {
    fontSize: 12,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 6,
    gap: 6,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  chipText: {
    fontSize: 11,
    color: "#9AA0A6",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  retryText: {
    fontSize: 13,
    fontWeight: "600",
  },

  // ===== Preview styles =====
  previewBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  previewCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 16,
    padding: 12,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  previewVideoWrap: {
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  previewTapLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: 8,
  },
  previewTapContent: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  previewTapText: {
    color: "#fff",
    marginLeft: 6,
    fontSize: 13,
    fontWeight: "600",
  },
  previewTitle: {
    marginTop: 10,
    fontSize: 15,
    fontWeight: "700",
  },
  previewMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  previewMetaChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  previewMetaText: {
    fontSize: 11,
    color: "#9AA0A6",
  },
});
