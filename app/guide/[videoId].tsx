// app/guides/[videoId].jsx
import React, { useCallback, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
  useWindowDimensions,
  TouchableOpacity,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "@react-navigation/native";
import YoutubePlayer from "react-native-youtube-iframe";
import { Ionicons } from "@expo/vector-icons";

function formatCount(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "";
  if (num >= 1_000_000)
    return (num / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return num.toString();
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

export default function GuideVideoScreen() {
  const { videoId, title, views, likes, published } = useLocalSearchParams();
  const router = useRouter();
  const vid = Array.isArray(videoId) ? videoId[0] : videoId;
  const titleStr = Array.isArray(title) ? title[0] : title;
  const viewsStr = Array.isArray(views) ? views[0] : views;
  const likesStr = Array.isArray(likes) ? likes[0] : likes;
  const publishedStr = Array.isArray(published) ? published[0] : published;

  const theme = useTheme();
  const primary = theme?.colors?.primary ?? "#FF6B6B";
  const textColor = theme?.colors?.text ?? "#ffffff";
  const bg = theme?.colors?.background ?? "#000";

  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const [playing, setPlaying] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  const playerRef = useRef(null);

  const onStateChange = useCallback((state) => {
    if (state === "ended") {
      setPlaying(false);
    }
  }, []);

  const viewsLabel = formatCount(viewsStr);
  const likesLabel = formatCount(likesStr);
  const dateLabel = formatDate(publishedStr);

  // 🔥 Luôn giữ đúng 16:9 và fit mọi loại màn hình
  const VIDEO_RATIO = 16 / 9;
  const heightBasedOnWidth = width / VIDEO_RATIO;
  let videoWidth = width;
  let videoHeight = heightBasedOnWidth;

  if (heightBasedOnWidth > height) {
    // Không đủ chiều cao -> fit theo chiều cao
    videoHeight = height;
    videoWidth = height * VIDEO_RATIO;
  }

  if (!vid) {
    return (
      <>
        <Stack.Screen
          options={{
            title: "Video hướng dẫn",
          }}
        />
        <View style={[styles.center, { backgroundColor: bg }]}>
          <Text style={{ color: textColor }}>Không tìm thấy video.</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: titleStr || "Video hướng dẫn",
          headerTitleAlign: "center",
          // Landscape: ẩn header cho cảm giác fullscreen
          // headerLeft: () => (
          //   <TouchableOpacity
          //     onPress={() => router.back()}
          //     style={{ paddingHorizontal: 8, paddingVertical: 4 }}
          //   >
          //     <Ionicons name="chevron-back" size={24} />
          //   </TouchableOpacity>
          // ),
          headerShown: !isLandscape,
        }}
      />
      <View style={[styles.container, { backgroundColor: bg }]}>
        {error ? (
          <View style={styles.center}>
            <Text style={{ color: textColor, textAlign: "center" }}>
              {error || "Không phát được video."}
            </Text>
          </View>
        ) : (
          <View
            style={isLandscape ? styles.playerLandscape : styles.playerPortrait}
          >
            {!ready && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color={primary} />
                <Text style={{ color: "#ffffff", marginTop: 8 }}>
                  Đang tải video…
                </Text>
              </View>
            )}

            <YoutubePlayer
              ref={playerRef}
              width={videoWidth}
              height={videoHeight}
              play={playing}
              videoId={vid}
              onChangeState={onStateChange}
              onReady={() => setReady(true)}
              onError={(e) => {
                console.log("YT error:", e);
                setError("Không phát được video (YouTube báo lỗi).");
              }}
            />
          </View>
        )}

        {/* Chỉ hiện info khi màn dọc cho đỡ chật */}
        {!isLandscape && (
          <View style={styles.info}>
            <Text
              style={[styles.title, { color: textColor }]}
              numberOfLines={3}
            >
              {titleStr}
            </Text>

            <View style={styles.metaRow}>
              {viewsLabel ? (
                <View style={styles.metaChip}>
                  <Ionicons
                    name="eye-outline"
                    size={14}
                    color="#9AA0A6"
                    style={{ marginRight: 4 }}
                  />
                  <Text style={styles.metaText}>{viewsLabel} lượt xem</Text>
                </View>
              ) : null}

              {likesLabel ? (
                <View style={styles.metaChip}>
                  <Ionicons
                    name="thumbs-up-outline"
                    size={14}
                    color="#9AA0A6"
                    style={{ marginRight: 4 }}
                  />
                  <Text style={styles.metaText}>{likesLabel} lượt thích</Text>
                </View>
              ) : null}

              {dateLabel ? (
                <View style={styles.metaChip}>
                  <Ionicons
                    name="time-outline"
                    size={14}
                    color="#9AA0A6"
                    style={{ marginRight: 4 }}
                  />
                  <Text style={styles.metaText}>{dateLabel}</Text>
                </View>
              ) : null}
            </View>
          </View>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Portrait: player ở trên, căn giữa theo chiều ngang
  playerPortrait: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
  },

  // Landscape: view full màn, video căn giữa
  playerLandscape: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },

  info: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },

  title: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
  },

  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },

  metaText: {
    fontSize: 12,
    color: "#9AA0A6",
  },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
    zIndex: 10,
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
});
