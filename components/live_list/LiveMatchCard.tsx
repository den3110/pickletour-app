import React, { useState, useCallback, memo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  useColorScheme,
  Platform,
  SafeAreaView,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { useTheme } from "@react-navigation/native";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { normalizeUrl } from "@/utils/normalizeUri";

const BLURHASH = "|rF?hV%2WCj[ayj[a|j[az_NaeWBj@ayfRayfQfQM{M|azj[azf6fQfQfQIpWXo";

function useThemeTokens() {
  const navTheme = useTheme?.();
  const sysScheme = useColorScheme?.() ?? "light";
  const isDark = typeof navTheme?.dark === "boolean" ? navTheme.dark : sysScheme === "dark";

  return {
    isDark,
    textPrimary: navTheme?.colors?.text ?? (isDark ? "#ffffff" : "#0f172a"),
    textSecondary: isDark ? "#cbd5e1" : "#475569",
    cardBg: navTheme?.colors?.card ?? (isDark ? "#111214" : "#ffffff"),
    cardBorder: navTheme?.colors?.border ?? (isDark ? "#3a3b40" : "#e5e7eb"),
  };
}

const parseVT = (code) => {
  if (!code) return { v: null, b: null, t: null };
  const m1 = String(code).match(/^V(\d+)-T(\d+)$/i);
  if (m1) return { v: Number(m1[1]), b: null, t: Number(m1[2]) };
  const m2 = String(code).match(/^V(\d+)-B(\d+)-T(\d+)$/i);
  if (m2) return { v: Number(m2[1]), b: Number(m2[2]), t: Number(m2[3]) };
  return { v: null, b: null, t: null };
};

const buildFbPluginUrl = (watchUrl) => {
  if (!watchUrl) return null;
  return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(watchUrl)}&show_text=0&width=560&autoplay=1&mute=0`;
};

const getStatusText = (status) => {
  const statusMap = {
    scheduled: "Đã lên lịch",
    queued: "Chờ thi đấu",
    assigned: "Đã gán sân",
    live: "Đang phát",
    finished: "Đã kết thúc",
    ended: "Đã kết thúc",
    paused: "Tạm dừng",
    canceled: "Đã hủy",
  };
  return statusMap[String(status || "").toLowerCase()] || status;
};

const LiveMatchCard = memo(
  function LiveMatchCard({ item = {} }) {
    const T = useThemeTokens();
    const [playerVisible, setPlayerVisible] = useState(false);

    const m = item || {};
    const fb = m.facebookLive || {};

    const baseWatchUrl =
      fb.video_permalink_url ||
      fb.permalink_url ||
      fb.watch_url ||
      fb.embed_url ||
      (fb.videoId ? `https://www.facebook.com/watch/?v=${fb.videoId}` : "");

    const thumbnail =
      m.embed_thumbnail ||
      fb.embed_thumbnail ||
      fb.thumbnail_url ||
      fb.picture ||
      (fb.id ? `https://graph.facebook.com/${fb.id}/picture?type=large` : null);

    const pluginUrl = buildFbPluginUrl(baseWatchUrl);
    const vt = parseVT(m.code);
    const isLive = String(m.status || "").toLowerCase() === "live";

    const handleOpenPlayer = useCallback(() => {
      if (baseWatchUrl) setPlayerVisible(true);
    }, [baseWatchUrl]);

    const handleClosePlayer = useCallback(() => {
      setPlayerVisible(false);
    }, []);

    return (
      <>
        <TouchableOpacity
          style={[styles.card, { backgroundColor: T.cardBg, borderColor: T.cardBorder }]}
          onPress={handleOpenPlayer}
          activeOpacity={0.8}
        >
          {/* Thumbnail */}
          <View style={styles.thumbnailWrapper}>
            {thumbnail ? (
              <ExpoImage
                source={{ uri: normalizeUrl(thumbnail) }}
                style={styles.thumbnail}
                contentFit="cover"
                cachePolicy="memory-disk"
                placeholder={{ blurhash: BLURHASH }}
                transition={100}
              />
            ) : (
              <View style={[styles.noThumb, { backgroundColor: T.isDark ? "#1a1a1a" : "#e0e0e0" }]}>
                <Ionicons name="videocam-outline" size={40} color={T.textSecondary} />
              </View>
            )}

            {/* Play Icon */}
            <View style={styles.playOverlay}>
              <View style={styles.playButton}>
                <Ionicons name="play" size={28} color="#fff" />
              </View>
            </View>

            {/* LIVE Badge */}
            {isLive && (
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveBadgeText}>LIVE</Text>
              </View>
            )}
          </View>

          {/* Info */}
          <View style={styles.cardContent}>
            <View style={styles.titleRow}>
              <Text style={[styles.matchCode, { color: T.textPrimary }]} numberOfLines={1}>
                {m.code || "Match"}
              </Text>
              {(vt.v || vt.t) && (
                <View style={styles.vtChips}>
                  {vt.v && <Text style={[styles.vtText, { color: T.textSecondary }]}>V{vt.v}</Text>}
                  {vt.t && <Text style={[styles.vtText, { color: T.textSecondary }]}>T{vt.t}</Text>}
                </View>
              )}
            </View>

            {m.courtLabel && (
              <Text style={[styles.courtText, { color: T.textSecondary }]} numberOfLines={1}>
                🏟️ {m.courtLabel}
              </Text>
            )}

            <Text style={[styles.statusText, { color: T.textSecondary }]}>
              {isLive ? "🔴 Đang phát trực tiếp" : getStatusText(m.status)}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Player Modal */}
        <Modal
          visible={playerVisible}
          animationType="fade"
          presentationStyle="fullScreen"
          onRequestClose={handleClosePlayer}
          statusBarTranslucent
        >
          <SafeAreaView style={styles.modal}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={handleClosePlayer} style={styles.closeBtn}>
                <Ionicons name="close-circle" size={36} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.modalTitle} numberOfLines={1}>
                {m.code}
              </Text>
            </View>

            {/* Player */}
            <View style={styles.playerContainer}>
              {pluginUrl ? (
                <WebView
                  source={{ uri: pluginUrl }}
                  style={styles.webview}
                  javaScriptEnabled
                  domStorageEnabled
                  allowsFullscreenVideo
                  allowsInlineMediaPlayback
                  mediaPlaybackRequiresUserAction={false}
                />
              ) : (
                <View style={styles.noVideo}>
                  <Ionicons name="videocam-off" size={64} color="rgba(255,255,255,0.5)" />
                  <Text style={styles.noVideoText}>Video không khả dụng</Text>
                </View>
              )}
            </View>

            {/* Footer */}
            {m.courtLabel && (
              <View style={styles.modalFooter}>
                <Text style={styles.footerText}>🏟️ {m.courtLabel}</Text>
                {isLive && <Text style={styles.footerLive}>🔴 LIVE</Text>}
              </View>
            )}
          </SafeAreaView>
        </Modal>
      </>
    );
  },
  (prev, next) =>
    prev.item._id === next.item._id &&
    prev.item.code === next.item.code &&
    prev.item.status === next.item.status
);

export default LiveMatchCard;

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    marginBottom: 12,
    overflow: "hidden",
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },

  thumbnailWrapper: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#000",
    position: "relative",
  },

  thumbnail: {
    width: "100%",
    height: "100%",
  },

  noThumb: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },

  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.25)",
    justifyContent: "center",
    alignItems: "center",
  },

  playButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.9)",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 8,
  },

  liveBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(244, 67, 54, 0.95)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    gap: 5,
  },

  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#fff",
  },

  liveBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },

  cardContent: {
    padding: 12,
  },

  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },

  matchCode: {
    fontSize: 15,
    fontWeight: "700",
    flex: 1,
    marginRight: 8,
  },

  vtChips: {
    flexDirection: "row",
    gap: 6,
  },

  vtText: {
    fontSize: 11,
    fontWeight: "600",
  },

  courtText: {
    fontSize: 12,
    marginBottom: 4,
  },

  statusText: {
    fontSize: 11,
    fontWeight: "600",
  },

  // Modal
  modal: {
    flex: 1,
    backgroundColor: "#000",
  },

  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
  },

  closeBtn: {
    marginRight: 12,
  },

  modalTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },

  playerContainer: {
    flex: 1,
    justifyContent: "center",
  },

  webview: {
    flex: 1,
    backgroundColor: "#000",
  },

  noVideo: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },

  noVideoText: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 16,
    marginTop: 16,
  },

  modalFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
  },

  footerText: {
    color: "rgba(255, 255, 255, 0.9)",
    fontSize: 14,
  },

  footerLive: {
    color: "#f44336",
    fontSize: 13,
    fontWeight: "700",
  },
});