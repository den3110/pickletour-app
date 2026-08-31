// app/live/event.tsx — Xem live giải đấu (Heineken Pickleball World Cup 2026)
// Nhiều sân · nhiều góc camera. 2 tab: Trực tiếp / Xem lại.
import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

import analytics from "@/utils/analytics";
import {
  useGetEventLiveQuery,
  useTrackEventLiveViewMutation,
} from "@/slices/eventLiveApiSlice";

// Origin THẬT để YouTube cho phép nhúng (baseUrl=youtube.com khiến YT coi như
// tự-nhúng-vào-chính-mình -> lỗi 152 cho MỌI video). Dùng pickletour.vn.
const EMBED_ORIGIN = "https://pickletour.vn";

// HTML nhúng iframe YouTube — autoplay=1&mute=1 tự phát ngay trong WebView.
// Bắt buộc kèm enablejsapi + origin, và WebView baseUrl phải = EMBED_ORIGIN.
function buildEmbedHtml(videoId: string, muted: boolean) {
  const p = [
    "autoplay=1",
    `mute=${muted ? 1 : 0}`,
    "playsinline=1",
    "rel=0",
    "modestbranding=1",
    "iv_load_policy=3",
    "fs=1",
    "controls=1",
    "color=white",
    "enablejsapi=1",
    `origin=${encodeURIComponent(EMBED_ORIGIN)}`,
  ].join("&");
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>*{margin:0;padding:0;box-sizing:border-box}html,body{height:100%;background:#000;overflow:hidden}
.w{position:absolute;inset:0}iframe{width:100%;height:100%;border:0;display:block}</style>
</head><body><div class="w">
<iframe src="https://www.youtube.com/embed/${videoId}?${p}"
 allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
 allowfullscreen></iframe>
</div></body></html>`;
}

const BG = "#0a0e1a";
const CARD = "#121829";
const BORDER = "rgba(255,255,255,0.08)";
const TXT = "#f8fafc";
const SUB = "#94a3b8";
const RED = "#dc2626";

const ANGLE_COLOR: Record<string, string> = {
  kitchen: "#22c55e",
  overhead: "#a855f7",
  baseline: "#f59e0b",
  side: "#38bdf8",
  main: "#3b82f6",
};
const angleColor = (a?: string) => ANGLE_COLOR[String(a || "main")] || "#3b82f6";

type Feed = {
  videoId: string;
  title: string;
  thumbnail?: string;
  angle?: string;
  angleLabel?: string;
  angleLabelDisplay?: string;
  courtLabel?: string;
  embeddable?: boolean;
};

const ytWatchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;
const openYouTube = (id: string) => Linking.openURL(ytWatchUrl(id)).catch(() => {});
type Court = {
  courtKey: string | null;
  courtLabel: string;
  angles?: Feed[];
  videos?: Feed[];
};

export default function EventLiveScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const playerW = width;
  const playerH = Math.round((playerW * 9) / 16);

  const { data, isLoading, isFetching, refetch, isError } =
    useGetEventLiveQuery(undefined, {
      pollingInterval: 60000,
      refetchOnMountOrArgChange: true,
    });

  const [tab, setTab] = useState<"live" | "replay">("live");
  const [current, setCurrent] = useState<Feed | null>(null);
  const [trackView] = useTrackEventLiveViewMutation();
  // Ghi nhận lượt dùng (1 lần khi mở màn) — cho thống kê web/app.
  useEffect(() => {
    trackView({ platform: Platform.OS }).catch(() => {});
    try {
      analytics.logEvent?.("event_live_open", { platform: Platform.OS });
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Phát tắt tiếng để autoplay chạy ngay (không lộ nút to "Watch on YouTube").
  const [muted, setMuted] = useState(true);
  useEffect(() => {
    setMuted(true);
  }, [current?.videoId]);

  const live: Court[] = data?.live || [];
  const replays: Court[] = data?.replays || [];
  const liveCamCount = useMemo(
    () => live.reduce((n, c) => n + (c.angles?.length || 0), 0),
    [live],
  );

  // Tự chọn feed đầu tiên khi có dữ liệu — ưu tiên luồng NHÚNG được.
  useEffect(() => {
    if (current) return;
    const liveFeeds = live.flatMap((c) => c.angles || []);
    const replayFeeds = replays.flatMap((c) => c.videos || []);
    const first =
      liveFeeds.find((f) => f.embeddable !== false) ||
      liveFeeds[0] ||
      replayFeeds.find((f) => f.embeddable !== false) ||
      replayFeeds[0];
    if (first) {
      setCurrent(first);
      if (!live.length && replays.length) setTab("replay");
    }
  }, [live, replays, current]);

  useEffect(() => {
    if (!live.length && replays.length) setTab("replay");
  }, [live.length, replays.length]);

  const eventName = data?.eventName || "Giải đấu trực tiếp";

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={TXT} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.hTitle} numberOfLines={1}>
            {eventName}
          </Text>
          <View style={styles.hMetaRow}>
            {liveCamCount > 0 ? (
              <View style={styles.liveDotRow}>
                <View style={styles.liveDot} />
                <Text style={styles.hMeta}>{liveCamCount} cam trực tiếp</Text>
              </View>
            ) : (
              <Text style={styles.hMeta}>Chưa có luồng trực tiếp</Text>
            )}
          </View>
        </View>
        <Pressable onPress={() => refetch()} hitSlop={12} style={styles.iconBtn}>
          <Ionicons name="refresh" size={20} color={SUB} />
        </Pressable>
      </View>

      {/* Player */}
      <View style={{ width: playerW, height: playerH, backgroundColor: "#000" }}>
        {current && current.embeddable === false ? (
          // Kênh tắt nhúng (vd FPT Bóng Đá) -> không phát trong app được.
          <View style={styles.noEmbed}>
            <Ionicons name="logo-youtube" size={40} color="#ff2d2d" />
            <Text style={styles.noEmbedTitle}>
              Luồng này chỉ xem được trên YouTube
            </Text>
            <Text style={styles.noEmbedSub} numberOfLines={2}>
              Kênh nguồn không cho phép nhúng video.
            </Text>
            <Pressable
              onPress={() => openYouTube(current.videoId)}
              style={styles.noEmbedBtn}
            >
              <Ionicons name="play" size={16} color="#0a0e1a" />
              <Text style={styles.noEmbedBtnText}>Mở trên YouTube</Text>
            </Pressable>
          </View>
        ) : current ? (
          <>
            <WebView
              key={`${current.videoId}-${muted ? "m" : "s"}`}
              style={{ width: playerW, height: playerH, backgroundColor: "#000" }}
              source={{
                html: buildEmbedHtml(current.videoId, muted),
                baseUrl: EMBED_ORIGIN,
              }}
              originWhitelist={["*"]}
              javaScriptEnabled
              domStorageEnabled
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              allowsFullscreenVideo
              androidLayerType="hardware"
              scrollEnabled={false}
              bounces={false}
            />
            {/* Overlay che thanh tiêu đề/kênh YouTube ở góc trên */}
            <View pointerEvents="none" style={styles.playerTopMask} />
            {muted ? (
              <Pressable onPress={() => setMuted(false)} style={styles.unmuteBtn}>
                <Ionicons name="volume-high" size={16} color="#fff" />
                <Text style={styles.unmuteText}>Bật tiếng</Text>
              </Pressable>
            ) : null}
          </>
        ) : (
          <View style={styles.playerEmpty}>
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: SUB }}>Chưa có video để phát</Text>
            )}
          </View>
        )}
      </View>

      {current ? (
        <View style={styles.nowRow}>
          <View
            style={[styles.anglePill, { backgroundColor: angleColor(current.angle) }]}
          />
          <Text style={styles.nowText} numberOfLines={1}>
            {current.courtLabel}
            {current.angleLabelDisplay ? ` · ${current.angleLabelDisplay}` : ""}
          </Text>
        </View>
      ) : null}

      {/* Tabs */}
      <View style={styles.tabs}>
        <TabBtn
          label="Trực tiếp"
          active={tab === "live"}
          badge={liveCamCount || undefined}
          onPress={() => setTab("live")}
        />
        <TabBtn
          label="Xem lại"
          active={tab === "replay"}
          onPress={() => setTab("replay")}
        />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 24 }}
        refreshControl={
          <RefreshControl
            refreshing={isFetching}
            onRefresh={refetch}
            tintColor="#fff"
          />
        }
      >
        {isError ? (
          <EmptyState
            icon="cloud-offline-outline"
            text="Không tải được dữ liệu. Kéo xuống để thử lại."
          />
        ) : tab === "live" ? (
          live.length === 0 ? (
            <EmptyState
              icon="videocam-off-outline"
              text="Hiện chưa có sân nào phát trực tiếp. Hãy quay lại sau nhé!"
            />
          ) : (
            live.map((court) => (
              <CourtCard
                key={`l-${court.courtKey ?? court.courtLabel}`}
                court={court}
                feeds={court.angles || []}
                currentId={current?.videoId}
                onPick={setCurrent}
              />
            ))
          )
        ) : replays.length === 0 ? (
          <EmptyState icon="film-outline" text="Chưa có video xem lại." />
        ) : (
          replays.map((court) => (
            <ReplayGroup
              key={`r-${court.courtKey ?? court.courtLabel}`}
              court={court}
              videos={court.videos || []}
              onPick={(f) => {
                setCurrent(f);
              }}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

function TabBtn({
  label,
  active,
  badge,
  onPress,
}: {
  label: string;
  active: boolean;
  badge?: number;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.tabBtn, active && styles.tabBtnActive]}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
      {badge ? (
        <View style={styles.tabBadge}>
          <Text style={styles.tabBadgeText}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function CourtCard({
  court,
  feeds,
  currentId,
  onPick,
}: {
  court: Court;
  feeds: Feed[];
  currentId?: string;
  onPick: (f: Feed) => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Ionicons name="tennisball-outline" size={16} color={RED} />
        <Text style={styles.cardTitle}>{court.courtLabel}</Text>
        <View style={styles.miniLive}>
          <View style={styles.liveDot} />
          <Text style={styles.miniLiveText}>LIVE</Text>
        </View>
      </View>
      <View style={styles.angleWrap}>
        {feeds.map((f) => {
          const on = f.videoId === currentId;
          const c = angleColor(f.angle);
          return (
            <Pressable
              key={f.videoId}
              onPress={() => onPick(f)}
              style={[
                styles.angleBtn,
                { borderColor: c },
                on && { backgroundColor: c },
              ]}
            >
              <Ionicons
                name={
                  f.embeddable === false
                    ? "logo-youtube"
                    : on
                      ? "play"
                      : "videocam-outline"
                }
                size={13}
                color={f.embeddable === false ? "#ff2d2d" : on ? "#0a0e1a" : c}
              />
              <Text
                style={[styles.angleText, { color: on ? "#0a0e1a" : "#e2e8f0" }]}
                numberOfLines={1}
              >
                {f.angleLabelDisplay || f.angleLabel || "Toàn cảnh"}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function ReplayGroup({
  court,
  videos,
  onPick,
}: {
  court: Court;
  videos: Feed[];
  onPick: (f: Feed) => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Ionicons name="albums-outline" size={16} color={SUB} />
        <Text style={styles.cardTitle}>{court.courtLabel}</Text>
      </View>
      {videos.map((f) => (
        <Pressable key={f.videoId} onPress={() => onPick(f)} style={styles.replayRow}>
          <View style={styles.thumbWrap}>
            {f.thumbnail ? (
              <Image source={{ uri: f.thumbnail }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, styles.thumbEmpty]}>
                <Ionicons name="film-outline" size={20} color={SUB} />
              </View>
            )}
            <View style={styles.playOverlay}>
              <Ionicons name="play-circle" size={30} color="rgba(255,255,255,0.92)" />
            </View>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.replayTitle} numberOfLines={2}>
              {f.title}
            </Text>
            <View style={styles.replayMeta}>
              <View
                style={[styles.dotSm, { backgroundColor: angleColor(f.angle) }]}
              />
              <Text style={styles.replaySub} numberOfLines={1}>
                {f.angleLabelDisplay || f.angleLabel || "Toàn cảnh"}
              </Text>
            </View>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function EmptyState({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={40} color={SUB} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  iconBtn: { padding: 4 },
  hTitle: { color: TXT, fontSize: 16, fontWeight: "800" },
  hMetaRow: { marginTop: 2 },
  hMeta: { color: SUB, fontSize: 12 },
  liveDotRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ff2d2d",
  },
  playerEmpty: { flex: 1, alignItems: "center", justifyContent: "center" },
  noEmbed: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 24,
  },
  noEmbedTitle: {
    color: TXT,
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
  },
  noEmbedSub: { color: SUB, fontSize: 12.5, textAlign: "center" },
  noEmbedBtn: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
  },
  noEmbedBtnText: { color: "#0a0e1a", fontWeight: "800", fontSize: 13.5 },
  playerTopMask: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 40,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  unmuteBtn: {
    position: "absolute",
    left: 12,
    bottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.72)",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  unmuteText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  nowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: CARD,
  },
  anglePill: { width: 10, height: 10, borderRadius: 5 },
  nowText: { color: TXT, fontSize: 13, fontWeight: "600", flex: 1 },
  tabs: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  tabBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
  },
  tabBtnActive: { backgroundColor: RED, borderColor: RED },
  tabText: { color: SUB, fontWeight: "700", fontSize: 13 },
  tabTextActive: { color: "#fff" },
  tabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  tabBadgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  card: {
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 12,
    marginBottom: 12,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  cardTitle: { color: TXT, fontSize: 15, fontWeight: "800", flex: 1 },
  miniLive: { flexDirection: "row", alignItems: "center", gap: 5 },
  miniLiveText: { color: "#ff6b6b", fontSize: 11, fontWeight: "800" },
  angleWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  angleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    maxWidth: "100%",
  },
  angleText: { fontSize: 13, fontWeight: "700", maxWidth: 180 },
  replayRow: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 8,
    alignItems: "center",
  },
  thumbWrap: { width: 120, height: 68, borderRadius: 8, overflow: "hidden" },
  thumb: { width: "100%", height: "100%", backgroundColor: "#000" },
  thumbEmpty: { alignItems: "center", justifyContent: "center" },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  replayTitle: { color: TXT, fontSize: 13, fontWeight: "600" },
  replayMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  dotSm: { width: 7, height: 7, borderRadius: 4 },
  replaySub: { color: SUB, fontSize: 12, flex: 1 },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 64, gap: 12 },
  emptyText: { color: SUB, fontSize: 14, textAlign: "center", paddingHorizontal: 32 },
});
