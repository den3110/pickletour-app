import React, { useState, useMemo, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Alert,
  Clipboard,
  useColorScheme,
} from "react-native";
import { Image as ExpoImage } from "expo-image"; // 👈 expo-image (có cache)
import InfoModal from "./InfoModal";
import { useTheme } from "@react-navigation/native";

/* ============================
 * THEME TOKENS
 * ============================ */
function useThemeTokens() {
  // Ưu tiên theme từ react-navigation; fallback hệ thống nếu app chưa set
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

// ---- helpers ----
function useImageFallback(candidates = []) {
  const list = React.useMemo(
    () => (Array.isArray(candidates) ? candidates.filter(Boolean) : []),
    [candidates]
  );
  const [idx, setIdx] = React.useState(0);
  const src = list[idx] || null;
  const onError = () => setIdx((i) => i + 1);
  return { src, onError, hasMore: idx < list.length - 1, list };
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

const providerMeta = (p) =>
  p === "youtube"
    ? { label: "YouTube", icon: "▶️", color: "#ff0000" }
    : p === "facebook"
    ? { label: "Facebook", icon: "👥", color: "#1877f2" }
    : { label: p || "Stream", icon: "📺", color: "#666" };

const byPriority = (a, b) =>
  (({ youtube: 1, facebook: 2 }[a.provider] || 99) -
  ({ youtube: 1, facebook: 2 }[b.provider] || 99));

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

function parseYouTubeId(url = "") {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.split("/").filter(Boolean)[0] || null;
    }
    if (u.searchParams.get("v")) return u.searchParams.get("v");
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0] === "embed" && parts[1]) return parts[1];
    if (parts[0] === "shorts" && parts[1]) return parts[1];
    return null;
  } catch {
    return null;
  }
}
function ytThumbCandidates(videoId) {
  if (!videoId) return [];
  return [
    `https://i.ytimg.com/vi/${videoId}/maxresdefault_live.jpg`,
    `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/sddefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  ];
}

// 👇 cacheKey ổn định (tránh signed URL/query)
function makeCacheKey(uri, hint = "") {
  try {
    const u = new URL(uri);
    const base = `${u.hostname}${u.pathname}`.replace(/[^a-z0-9/._-]/gi, "_");
    return `${hint}:${base}`;
  } catch {
    return `${hint}:${String(uri).slice(0, 120)}`;
  }
}

// Blurhash placeholder nhẹ nhàng (có thể thay bằng của bạn)
const BLURHASH =
  "|rF?hV%2WCj[ayj[a|j[az_NaeWBj@ayfRayfQfQM{M|azj[azf6fQfQfQIpWXo"; // sample

export default function LiveMatchCard({ item }) {
  const T = useThemeTokens();

  const [infoVisible, setInfoVisible] = useState(false);
  const [showAllSessions, setShowAllSessions] = useState(false);

  const m = item?.match || {};
  const sessionsAll = Array.isArray(item?.sessions) ? item.sessions : [];
  const sessions = sessionsAll
    .filter((s) => s.platformVerified && s.watchUrl)
    .sort(byPriority);

  const primary = sessions[0] || null;
  const secondary = sessions.slice(1);

  const isLive =
    String(m?.status || "").toLowerCase() === "live" || sessions.length > 0;
  const hasAny = sessionsAll.length > 0;

  const copyToClipboard = async (text, message = "Đã copy!") => {
    try {
      await Clipboard.setString(text);
      Alert.alert("Thành công", message);
    } catch {
      Alert.alert("Lỗi", "Copy không thành công!");
    }
  };

  const openUrl = async (url) => {
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

  // ---- thumbnail candidates (provided -> auto youtube) ----
  const providedThumbs = Array.isArray(primary?.thumbnails)
    ? primary.thumbnails
    : [];
  let autoThumbs = [];
  if (primary?.provider === "youtube") {
    const yid =
      primary.platformLiveId || parseYouTubeId(primary.watchUrl || "");
    if (yid) autoThumbs = ytThumbCandidates(yid);
  }
  const heroCandidates = [...providedThumbs, ...autoThumbs];

  const {
    src: heroSrc,
    onError: heroErr,
    list: heroList,
  } = useImageFallback(heroCandidates);

  // ---- Prefetch & cache to disk/memory (ấm cache cho list) ----
  useEffect(() => {
    if (heroList.length > 0) {
      ExpoImage.prefetch(heroList, { cachePolicy: "memory-disk" });
    }
  }, [heroList.join("|")]);

  const cacheKey =
    primary?.provider === "youtube"
      ? makeCacheKey(
          heroSrc || "",
          `yt:${parseYouTubeId(primary?.watchUrl || "") || "unknown"}`
        )
      : makeCacheKey(heroSrc || "", "img");

  return (
    <>
      <View
        style={[
          styles.card,
          { backgroundColor: T.cardBg, borderColor: T.cardBorder },
        ]}
      >
        {/* Thumbnail (expo-image + cache) */}
        <View
          style={[styles.thumbnailContainer, { backgroundColor: T.thumbBg }]}
        >
          {heroSrc && (
            <ExpoImage
              source={{ uri: heroSrc, cacheKey }} // 👈 cacheKey tuỳ biến
              style={styles.thumbnail}
              onError={heroErr}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={cacheKey}
              placeholder={{ blurhash: BLURHASH }}
              transition={120}
              priority="high"
            />
          )}

          {primary?.provider && (
            <View
              style={[
                styles.providerBadge,
                { backgroundColor: providerMeta(primary.provider).color },
              ]}
            >
              <Text style={styles.providerBadgeText}>
                {providerMeta(primary.provider).icon}{" "}
                {providerMeta(primary.provider).label}
              </Text>
            </View>
          )}
        </View>

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

          {/* Primary */}
          {primary ? (
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                { backgroundColor: providerMeta(primary.provider).color },
              ]}
              onPress={() => openUrl(primary.watchUrl)}
            >
              <Text style={styles.primaryBtnText}>
                {providerMeta(primary.provider).icon} Xem trên{" "}
                {providerMeta(primary.provider).label}
              </Text>
            </TouchableOpacity>
          ) : (
            <Text style={[styles.noSession, { color: T.muted }]}>
              Chưa có phiên live đã xác minh.
            </Text>
          )}

          {/* Secondary */}
          {secondary.length > 0 && (
            <View style={styles.secondaryRow}>
              {(showAllSessions ? secondary : secondary.slice(0, 2)).map(
                (s, i) => {
                  const meta = providerMeta(s.provider);
                  return (
                    <TouchableOpacity
                      key={i}
                      style={[styles.secondaryBtn, { borderColor: T.tint }]}
                      onPress={() => openUrl(s.watchUrl)}
                    >
                      <Text
                        style={[styles.secondaryBtnText, { color: T.tint }]}
                      >
                        {meta.icon} {meta.label}
                      </Text>
                    </TouchableOpacity>
                  );
                }
              )}
              {secondary.length > 2 && !showAllSessions && (
                <TouchableOpacity
                  style={[styles.moreBtn, { borderColor: T.cardBorder }]}
                  onPress={() => setShowAllSessions(true)}
                >
                  <Text
                    style={[styles.moreBtnText, { color: T.textSecondary }]}
                  >
                    +{secondary.length - 2}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
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
  thumbnailContainer: {
    width: "100%",
    aspectRatio: 16 / 9,
  },
  thumbnail: { width: "100%", height: "100%" },
  providerBadge: {
    position: "absolute",
    right: 8,
    bottom: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  providerBadgeText: { color: "#fff", fontSize: 11, fontWeight: "600" },

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

  /* badges */
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  liveBadge: { backgroundColor: "#f44336" },
  liveBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  readyBadge: { backgroundColor: "#ff9800" },
  readyBadgeText: { color: "#fff", fontSize: 11, fontWeight: "600" },
  normalBadgeText: { fontSize: 11, fontWeight: "600" },

  /* VT chips */
  vtChips: { flexDirection: "row", gap: 4 },
  vtChip: {
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  vtChipText: { fontSize: 11 },

  metaText: { fontSize: 12, marginBottom: 12 },

  /* primary & secondary buttons */
  primaryBtn: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 8,
  },
  primaryBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  noSession: { fontSize: 13, textAlign: "center", paddingVertical: 12 },

  secondaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },
  secondaryBtn: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  secondaryBtnText: { fontSize: 12, fontWeight: "600" },
  moreBtn: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  moreBtnText: { fontSize: 12, fontWeight: "600" },

  /* actions */
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
