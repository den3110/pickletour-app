import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Alert,
  Clipboard,
  useColorScheme,
  Platform,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import InfoModal from "./InfoModal";
import { useTheme } from "@react-navigation/native";
import { WebView } from "react-native-webview";
import { normalizeUrl } from "@/utils/normalizeUri";

/* ============================
 * THEME TOKENS
 * ============================ */
function useThemeTokens() {
  const navTheme = useTheme?.();
  const sysScheme = useColorScheme?.() ?? "light";
  const isDark =
    typeof navTheme?.dark === "boolean" ? navTheme.dark : sysScheme === "dark";
  const scheme = isDark ? "dark" : "light";

  const tint = navTheme?.colors?.primary ?? (isDark ? "#7cc0ff" : "#0a84ff");
  const textPrimary =
    navTheme?.colors?.text ?? (isDark ? "#ffffff" : "#0f172a");
  const textSecondary = isDark ? "#cbd5e1" : "#475569";
  const muted = isDark ? "#9aa4b2" : "#666";

  const cardBg = navTheme?.colors?.card ?? (isDark ? "#111214" : "#ffffff");
  const cardBorder =
    navTheme?.colors?.border ?? (isDark ? "#3a3b40" : "#e5e7eb");
  const thumbBg = isDark ? "#1e293b" : "#f0f0f0";

  const badgeNeutralBg = isDark ? "#334155" : "#e0e0e0";
  const badgeNeutralText = isDark ? "#e2e8f0" : "#475569";

  return {
    scheme,
    tint,
    textPrimary,
    textSecondary,
    muted,
    cardBg,
    cardBorder,
    thumbBg,
    badgeNeutralBg,
    badgeNeutralText,
  };
}

/* ============================
 * HELPERS
 * ============================ */
function useImageFallback(candidates = []) {
  const list = useMemo(
    () => (Array.isArray(candidates) ? candidates.filter(Boolean) : []),
    [candidates]
  );
  const [idx, setIdx] = useState(0);
  const src = list[idx] || null;
  const onError = () => setIdx((i) => i + 1);
  return { src, onError, list, hasMore: idx < list.length - 1 };
}

function timeAgo(date) {
  if (!date) return "";
  const d = new Date(date);
  const diff = Math.max(0, Date.now() - d.getTime());
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s trước`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m trước`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h trước`;
  const day = Math.floor(hr / 24);
  return `${day}d trước`;
}

const providerMeta = {
  facebook: {
    label: "Facebook",
    icon: "👥",
    color: "#1877f2",
  },
};

function parseVT(code) {
  if (!code) return { v: null, b: null, t: null };
  const m1 = String(code).match(/^V(\d+)-T(\d+)$/i);
  if (m1) return { v: Number(m1[1]), b: null, t: Number(m1[2]) };
  const m2 = String(code).match(/^V(\d+)-B(\d+)-T(\d+)$/i);
  if (m2) return { v: Number(m2[1]), b: Number(m2[2]), t: Number(m2[3]) };
  return { v: null, b: null, t: null };
}

const VI_STATUS_LABELS = {
  scheduled: "Đã lên lịch",
  queued: "Chờ thi đấu",
  assigned: "Đã gán sân",
  finished: "Đã kết thúc",
  ended: "Đã kết thúc",
  paused: "Tạm dừng",
  canceled: "Đã hủy",
};
const viStatus = (s) =>
  s
    ? String(s).toLowerCase() === "live"
      ? "LIVE"
      : VI_STATUS_LABELS[String(s).toLowerCase()] || s
    : "-";

function makeCacheKey(uri, hint = "") {
  try {
    const u = new URL(uri);
    const base = `${u.hostname}${u.pathname}`.replace(/[^a-z0-9/._-]/gi, "_");
    return `${hint}:${base}`;
  } catch {
    return `${hint}:${String(uri).slice(0, 120)}`;
  }
}

const BLURHASH =
  "|rF?hV%2WCj[ayj[a|j[az_NaeWBj@ayfRayfQfQM{M|azj[azf6fQfQfQIpWXo";

/* fallback HTML */
function wrapFbEmbed(htmlRaw = "", tick = 0) {
  return `
    <!doctype html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1" />
        <style>
          html,body {
            margin:0;
            padding:0;
            background:#000;
            height:100%;
            overflow:hidden;
          }
          .wrap {
            position:relative;
            width:100%;
            height:100%;
            overflow:hidden;
          }
          iframe {
            position:absolute;
            top:0;
            left:0;
            width:100%;
            height:100%;
            border:0;
          }
        </style>
      </head>
      <body>
        <div class="wrap">
          ${htmlRaw}
        </div>
        <!-- tick: ${tick} -->
      </body>
    </html>
  `;
}

/* build plugin url từ watch url */
function buildFbPluginUrl(watchUrl) {
  if (!watchUrl) return null;
  const base = "https://www.facebook.com/plugins/video.php";
  const qs = `href=${encodeURIComponent(
    watchUrl
  )}&show_text=0&width=560&autoplay=1&mute=0&adapt_container_width=true`;
  return `${base}?${qs}`;
}

function isFbLoginUrl(url = "") {
  const u = url.toLowerCase();
  return (
    u.includes("facebook.com/login") ||
    u.includes("m.facebook.com/login") ||
    u.includes("facebook.com/checkpoint") ||
    u.includes("facebook.com/confirm")
  );
}

/* ============================
 * COMPONENT
 * ============================ */
export default function LiveMatchCard({
  item = {},
  autoEmbedRefreshMs = 60000,
}) {
  const T = useThemeTokens();
  const [infoVisible, setInfoVisible] = useState(false);

  const m = item || {};
  const fb = m.facebookLive || {};

  // lấy ra URL gốc (watch/permalink)
  const baseWatchUrl =
    fb.video_permalink_url ||
    fb.permalink_url ||
    fb.watch_url ||
    fb.embed_url ||
    (fb.videoId
      ? `https://www.facebook.com/watch/?v=${fb.videoId}`
      : fb.id
      ? `https://www.facebook.com/watch/?v=${fb.id}`
      : "");

  // plugin URL (ưu tiên)
  const pluginUrl = buildFbPluginUrl(baseWatchUrl);

  // HTML embed BE bắn về
  const rawEmbedHtml =
    m.embed_html || m.embedHtml || fb.embed_html || fb.embedHtml || null;

  // thumbnail
  const fbThumb =
    m.embed_thumbnail ||
    fb.embed_thumbnail ||
    fb.thumbnail_url ||
    fb.picture ||
    (fb.id ? `https://graph.facebook.com/${fb.id}/picture?type=large` : null);

  const heroCandidates = [fbThumb].filter(Boolean);
  const {
    src: heroSrc,
    onError: heroErr,
    list: heroList,
  } = useImageFallback(heroCandidates);

  useEffect(() => {
    if (heroList.length > 0) {
      ExpoImage.prefetch(heroList, { cachePolicy: "memory-disk" });
    }
  }, [heroList.join("|")]);

  const cacheKey = makeCacheKey(
    heroSrc || baseWatchUrl || m.code || m._id || "match",
    "fb"
  );

  const primary = baseWatchUrl
    ? {
        provider: "facebook",
        watchUrl: baseWatchUrl,
        embedHtml: rawEmbedHtml,
        thumbnails: fbThumb ? [fbThumb] : [],
      }
    : null;
  const sessions = primary ? [primary] : [];

  const isLive =
    String(m.status || "").toLowerCase() === "live" || !!primary || false;
  const hasAny = !!primary;

  const copyToClipboard = async (text, message = "Đã copy!") => {
    try {
      await Clipboard.setString(text);
      Alert.alert("Thành công", message);
    } catch {
      Alert.alert("Lỗi", "Copy không thành công!");
    }
  };

  const openUrl = async (url) => {
    if (!url) {
      Alert.alert("Lỗi", "Không có link phát.");
      return;
    }
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert("Lỗi", "Không thể mở link này");
      }
    } catch {
      Alert.alert("Lỗi", "Đã có lỗi xảy ra");
    }
  };

  const vt = parseVT(m.code);

  // webview state
  const [embedTick, setEmbedTick] = useState(0);
  const [webOk, setWebOk] = useState(true);
  const webRef = useRef(null);

  const hasEmbed = !!(pluginUrl || rawEmbedHtml);

  // auto reload
  useEffect(() => {
    if (!hasEmbed) return;
    if (!autoEmbedRefreshMs || autoEmbedRefreshMs < 5000) return;

    const id = setInterval(() => {
      if (!webOk) return;
      if (Platform.OS === "android" && webRef.current?.reload) {
        webRef.current.reload();
      } else {
        setEmbedTick((t) => t + 1);
      }
    }, autoEmbedRefreshMs);

    return () => clearInterval(id);
  }, [hasEmbed, autoEmbedRefreshMs, webOk]);

  // BE đổi embed -> thử lại
  useEffect(() => {
    if (pluginUrl || rawEmbedHtml) {
      setEmbedTick((t) => t + 1);
      setWebOk(true);
    }
  }, [pluginUrl, rawEmbedHtml]);

  const handleManualReload = () => {
    if (!hasEmbed) return;
    setWebOk(true);
    if (Platform.OS === "android" && webRef.current?.reload) {
      webRef.current.reload();
    } else {
      setEmbedTick((t) => t + 1);
    }
  };

  // user agent giả mobile
  const fbUA =
    Platform.OS === "ios"
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
      : "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36";

  return (
    <>
      <View
        style={[
          styles.card,
          { backgroundColor: T.cardBg, borderColor: T.cardBorder },
        ]}
      >
        {/* EMBED */}
        {hasEmbed && webOk ? (
          <View style={styles.embedContainer}>
            <TouchableOpacity
              onPress={handleManualReload}
              style={styles.reloadBtn}
              activeOpacity={0.7}
            >
              <Text style={styles.reloadBtnText}>↻</Text>
            </TouchableOpacity>

            <WebView
              key={`fb-embed-${m._id || m.code || "x"}-${embedTick}`}
              ref={webRef}
              originWhitelist={["*"]}
              source={
                pluginUrl
                  ? { uri: pluginUrl }
                  : { html: wrapFbEmbed(rawEmbedHtml, embedTick) }
              }
              style={styles.webview}
              scrollEnabled={false}
              javaScriptEnabled
              domStorageEnabled
              sharedCookiesEnabled
              thirdPartyCookiesEnabled
              setSupportMultipleWindows={false}
              allowsFullscreenVideo
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              userAgent={fbUA}
              onNavigationStateChange={(nav) => {
                if (isFbLoginUrl(nav.url)) {
                  // FB bắt login -> thôi bỏ WebView, show fallback
                  setWebOk(false);
                }
              }}
              onError={() => setWebOk(false)}
              onHttpError={() => setWebOk(false)}
            />
          </View>
        ) : (
          // FALLBACK
          <View
            style={[styles.thumbnailContainer, { backgroundColor: T.thumbBg }]}
          >
            {heroSrc ? (
              <ExpoImage
                source={{ uri: normalizeUrl(heroSrc), cacheKey }}
                style={styles.thumbnail}
                onError={heroErr}
                contentFit="cover"
                cachePolicy="memory-disk"
                recyclingKey={cacheKey}
                placeholder={{ blurhash: BLURHASH }}
                transition={120}
                priority="high"
              />
            ) : (
              <View style={styles.thumbFallback}>
                <Text style={{ color: T.muted, fontSize: 12 }}>
                  Không load được embed FB
                </Text>
              </View>
            )}

            {baseWatchUrl ? (
              <TouchableOpacity
                style={styles.openFbBtn}
                onPress={() => openUrl(baseWatchUrl)}
              >
                <Text style={styles.openFbBtnText}>👥 Mở Facebook</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        {/* Content */}
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.cardHeader}>
            <View style={styles.titleRow}>
              <Text
                style={[styles.matchCode, { color: T.textPrimary }]}
                numberOfLines={2}
              >
                {m.code || "Match"}
              </Text>

              {isLive ? (
                <View style={[styles.badge, styles.liveBadge]}>
                  <Text style={styles.liveBadgeText}>LIVE</Text>
                </View>
              ) : hasAny ? (
                <View style={[styles.badge, styles.readyBadge]}>
                  <Text style={styles.readyBadgeText}>Chuẩn bị</Text>
                </View>
              ) : (
                <View
                  style={[styles.badge, { backgroundColor: T.badgeNeutralBg }]}
                >
                  <Text
                    style={[
                      styles.normalBadgeText,
                      { color: T.badgeNeutralText },
                    ]}
                  >
                    {viStatus(m.status)}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.vtChips}>
              {Number.isInteger(vt.v) && (
                <View style={[styles.vtChip, { borderColor: T.cardBorder }]}>
                  <Text style={[styles.vtChipText, { color: T.muted }]}>
                    V{vt.v}
                  </Text>
                </View>
              )}
              {Number.isInteger(vt.b) && (
                <View style={[styles.vtChip, { borderColor: T.cardBorder }]}>
                  <Text style={[styles.vtChipText, { color: T.muted }]}>
                    B{vt.b}
                  </Text>
                </View>
              )}
              {Number.isInteger(vt.t) && (
                <View style={[styles.vtChip, { borderColor: T.cardBorder }]}>
                  <Text style={[styles.vtChipText, { color: T.muted }]}>
                    T{vt.t}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Meta */}
          <Text
            style={[styles.metaText, { color: T.textSecondary }]}
            numberOfLines={1}
          >
            {viStatus(m.status)}
            {m.courtLabel && ` • Sân: ${m.courtLabel}`}
            {m.updatedAt && ` • ${timeAgo(m.updatedAt)}`}
          </Text>

          {/* Primary FB btn */}
          {primary ? (
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                { backgroundColor: providerMeta.facebook.color },
              ]}
              onPress={() => openUrl(primary.watchUrl)}
            >
              <Text style={styles.primaryBtnText}>
                {providerMeta.facebook.icon} Xem trên Facebook
              </Text>
            </TouchableOpacity>
          ) : (
            <Text style={[styles.noSession, { color: T.muted }]}>
              Chưa có phiên live đã xác minh.
            </Text>
          )}

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[
                styles.actionBtn,
                { borderColor: T.cardBorder, backgroundColor: T.cardBg },
              ]}
              onPress={() => setInfoVisible(true)}
            >
              <Text style={[styles.actionBtnText, { color: T.textSecondary }]}>
                ℹ️ Chi tiết
              </Text>
            </TouchableOpacity>
            {m.code && (
              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  { borderColor: T.cardBorder, backgroundColor: T.cardBg },
                ]}
                onPress={() => copyToClipboard(m.code, "Đã copy mã trận!")}
              >
                <Text
                  style={[styles.actionBtnText, { color: T.textSecondary }]}
                >
                  📋 Copy mã
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      <InfoModal
        visible={infoVisible}
        onClose={() => setInfoVisible(false)}
        match={m}
        sessions={sessions}
        onCopy={copyToClipboard}
        onOpenUrl={openUrl}
      />
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    overflow: "hidden",
    borderWidth: 1,
  },
  embedContainer: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#000",
    overflow: "hidden",
  },
  webview: {
    flex: 1,
    backgroundColor: "transparent",
  },
  reloadBtn: {
    position: "absolute",
    top: 6,
    right: 6,
    zIndex: 20,
    backgroundColor: "rgba(0,0,0,0.4)",
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  reloadBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  thumbnailContainer: {
    width: "100%",
    aspectRatio: 16 / 9,
  },
  thumbnail: { width: "100%", height: "100%" },
  thumbFallback: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  openFbBtn: {
    position: "absolute",
    bottom: 8,
    right: 8,
    backgroundColor: "rgba(24,119,242,0.9)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  openFbBtnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 12,
  },
  content: { padding: 12 },
  cardHeader: { marginBottom: 8 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  matchCode: {
    fontSize: 16,
    fontWeight: "700",
    flex: 1,
    marginRight: 8,
  },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  liveBadge: { backgroundColor: "#f44336" },
  liveBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  readyBadge: { backgroundColor: "#ff9800" },
  readyBadgeText: { color: "#fff", fontSize: 11, fontWeight: "600" },
  normalBadgeText: { fontSize: 11, fontWeight: "600" },

  vtChips: { flexDirection: "row", gap: 4 },
  vtChip: {
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  vtChipText: { fontSize: 11 },

  metaText: { fontSize: 12, marginBottom: 12 },

  primaryBtn: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 8,
  },
  primaryBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  noSession: { fontSize: 13, textAlign: "center", paddingVertical: 12 },

  actions: { flexDirection: "row", gap: 8 },
  actionBtn: {
    flex: 1,
    borderWidth: 1,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: "center",
  },
  actionBtnText: { fontSize: 12, fontWeight: "600" },
});

