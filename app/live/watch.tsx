// Trang xem video trận đấu toàn màn hình (thay cho FeedFullscreenModal cũ —
// modal landscape hay bị đen hình/chỉ có tiếng). Đây là MỘT TRANG expo-router
// thật sự: WebView/VideoView render ổn định, khoá landscape khi vào, trả
// orientation khi thoát, controls overlay tự ẩn.
import {
  Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router,
  useLocalSearchParams } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import { StatusBar } from "expo-status-bar";
import { useVideoPlayer,
  VideoView } from "expo-video";
import React,
  { useCallback,
  useEffect,
  useMemo,
  useRef,
  useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Text } from "@/components/ui/i18nText";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

import {
  consumeLiveWatchPayload,
} from "@/components/live_list/liveWatchHandoff";
import {
  buildCanonicalSessions,
  fixFacebookOpenUrl,
  getLiveMatchSubtitle,
  getLiveMatchTitle,
  getLiveSessions,
  getLiveStatusLabel,
  sid,
} from "@/components/live_list/liveUtils";
import { normalizeUrl } from "@/utils/normalizeUri";

const CONTROLS_HIDE_MS = 4000;

const asTrimmed = (v: any) => String(v ?? "").trim();

function isNativeSession(session: any) {
  if (!session) return false;
  const key = asTrimmed(session?.key).toLowerCase();
  const kind = asTrimmed(session?.kind).toLowerCase();
  if (key === "server2") return true;
  return ["file", "hls", "delayed_manifest"].includes(kind);
}

function getSessions(item: any) {
  const canonical = buildCanonicalSessions(item);
  if (canonical.length > 0) return canonical;
  return getLiveSessions(item);
}

function buildEmbedHtml(embedHtml: string) {
  return `<!DOCTYPE html>
  <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      <style>
        html, body { margin:0; padding:0; background:#000; height:100%; overflow:hidden; }
        body { display:flex; align-items:center; justify-content:center; }
        iframe, video { width:100%; height:100%; border:0; }
      </style>
    </head>
    <body>${embedHtml}</body>
  </html>`;
}

function NativePlayerView({
  uri,
  startPosition,
  shouldPlay,
}: {
  uri: string;
  startPosition: number;
  shouldPlay: boolean;
}) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.muted = false;
    if (startPosition > 0) {
      try {
        p.currentTime = startPosition;
      } catch {}
    }
    if (shouldPlay) p.play();
  });

  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="contain"
      nativeControls
      allowsFullscreen={false}
      allowsPictureInPicture={false}
    />
  );
}

export default function LiveWatchScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const insets = useSafeAreaInsets();

  // Payload từ màn feed (item quá lớn để đi qua params)
  const payload = useMemo(
    () => consumeLiveWatchPayload(asTrimmed(params?.id)),
    [params?.id],
  );
  const item = payload?.item || null;

  const sessions = useMemo(() => (item ? getSessions(item) : []), [item]);
  const initialKey = asTrimmed(payload?.sessionKey);
  const [activeKey, setActiveKey] = useState(() => {
    const found =
      sessions.find((s: any) => asTrimmed(s?.key) === initialKey) ||
      sessions.find((s: any) => s?.primary && s?.ready !== false) ||
      sessions.find((s: any) => s?.ready !== false) ||
      sessions[0];
    return asTrimmed(found?.key);
  });
  const session =
    sessions.find((s: any) => asTrimmed(s?.key) === activeKey) ||
    sessions[0] ||
    null;

  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_MS);
  }, []);

  const toggleControls = useCallback(() => {
    setControlsVisible((prev) => {
      const next = !prev;
      if (next) scheduleHide();
      return next;
    });
  }, [scheduleHide]);

  useEffect(() => {
    scheduleHide();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [scheduleHide]);

  // Khoá landscape khi vào trang, trả tự do khi thoát (app orientation: default)
  useEffect(() => {
    ScreenOrientation.lockAsync(
      ScreenOrientation.OrientationLock.LANDSCAPE,
    ).catch(() => {});
    return () => {
      ScreenOrientation.unlockAsync().catch(() => {});
    };
  }, []);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, []);

  const openUrl = useMemo(() => {
    const raw =
      asTrimmed(session?.watchUrl) ||
      asTrimmed(session?.openUrl) ||
      asTrimmed(item?.primaryOpenUrl);
    return normalizeUrl(fixFacebookOpenUrl(raw, item?.facebookLive));
  }, [session, item]);

  const handleOpenExternal = useCallback(() => {
    if (openUrl) Linking.openURL(openUrl).catch(() => {});
  }, [openUrl]);

  const title = item ? getLiveMatchTitle(item) : "Trận đấu";
  const subtitle = item ? getLiveMatchSubtitle(item) : "";
  const statusLabel = getLiveStatusLabel(item?.status);
  const isLive = asTrimmed(item?.status).toLowerCase() === "live";

  const native = isNativeSession(session);
  const nativeUri = normalizeUrl(
    asTrimmed(session?.directUrl || session?.manifestUrl),
  );

  let playerNode: React.ReactNode = null;
  if (!item) {
    playerNode = (
      <View style={styles.centerBox}>
        <Text style={styles.emptyText}>
          Không tìm thấy dữ liệu video. Vui lòng quay lại và thử lại.
        </Text>
        <TouchableOpacity style={styles.emptyBtn} onPress={handleBack}>
          <Text style={styles.emptyBtnText}>Quay lại</Text>
        </TouchableOpacity>
      </View>
    );
  } else if (native && nativeUri) {
    playerNode = (
      <NativePlayerView
        key={`${sid(item?._id)}-${activeKey}`}
        uri={nativeUri}
        startPosition={Number(payload?.startPosition) || 0}
        shouldPlay={payload?.shouldPlay !== false}
      />
    );
  } else if (session?.embedHtml) {
    playerNode = (
      <WebView
        key={`html-${activeKey}`}
        source={{ html: buildEmbedHtml(session.embedHtml) }}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
      />
    );
  } else if (session?.pluginUrl) {
    playerNode = (
      <WebView
        key={`plugin-${activeKey}`}
        source={{ uri: normalizeUrl(session.pluginUrl) }}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        startInLoadingState
        renderLoading={() => (
          <View style={[StyleSheet.absoluteFill, styles.centerBox]}>
            <ActivityIndicator size="large" color="#25f4ee" />
          </View>
        )}
      />
    );
  } else {
    playerNode = (
      <View style={styles.centerBox}>
        <Text style={styles.emptyText}>
          Nguồn video chưa sẵn sàng để phát trong ứng dụng.
        </Text>
        {openUrl ? (
          <TouchableOpacity style={styles.emptyBtn} onPress={handleOpenExternal}>
            <Text style={styles.emptyBtnText}>Mở link ngoài ↗</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar hidden />

      <Pressable style={StyleSheet.absoluteFill} onPress={toggleControls}>
        {playerNode}
      </Pressable>

      {controlsVisible && item ? (
        <>
          {/* Top bar */}
          <LinearGradient
            colors={["rgba(0,0,0,0.82)", "transparent"]}
            style={[styles.topFade, { paddingTop: Math.max(insets.top, 10) }]}
            pointerEvents="box-none"
          >
            <View style={styles.topBar} pointerEvents="box-none">
              <TouchableOpacity
                onPress={handleBack}
                activeOpacity={0.85}
                style={styles.roundBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="chevron-back" size={22} color="#fff" />
              </TouchableOpacity>

              <View style={styles.titleWrap}>
                <Text style={styles.title} numberOfLines={1}>
                  {title}
                </Text>
                {subtitle ? (
                  <Text style={styles.subtitle} numberOfLines={1}>
                    {subtitle}
                  </Text>
                ) : null}
              </View>

              <View
                style={[styles.statusPill, isLive && styles.statusPillLive]}
              >
                {isLive ? <View style={styles.liveDot} /> : null}
                <Text style={styles.statusText}>
                  {isLive ? "LIVE" : statusLabel}
                </Text>
              </View>
            </View>
          </LinearGradient>

          {/* Bottom bar */}
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.85)"]}
            style={[
              styles.bottomFade,
              { paddingBottom: Math.max(insets.bottom, 12) },
            ]}
            pointerEvents="box-none"
          >
            {sessions.length > 1 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.sourceRow}
              >
                {sessions.map((s: any) => {
                  const key = asTrimmed(s?.key);
                  const selected = key === activeKey;
                  return (
                    <TouchableOpacity
                      key={key || s?.label}
                      onPress={() => {
                        setActiveKey(key);
                        scheduleHide();
                      }}
                      activeOpacity={0.85}
                      style={[
                        styles.sourceChip,
                        selected && styles.sourceChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.sourceChipText,
                          selected && styles.sourceChipTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        {s?.label || s?.providerLabel || "Nguồn"}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : null}

            <View style={styles.actionRow} pointerEvents="box-none">
              {openUrl ? (
                <TouchableOpacity
                  onPress={handleOpenExternal}
                  activeOpacity={0.85}
                  style={styles.actionBtn}
                >
                  <Ionicons name="open-outline" size={16} color="#fff" />
                  <Text style={styles.actionText}>Mở link ngoài</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </LinearGradient>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  webview: { flex: 1, backgroundColor: "#000" },
  centerBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    padding: 24,
    backgroundColor: "#000",
  },
  emptyText: { color: "rgba(255,255,255,0.85)", textAlign: "center", fontSize: 14 },
  emptyBtn: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  emptyBtnText: { color: "#fff", fontWeight: "700" },
  topFade: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 14,
    paddingBottom: 26,
  },
  topBar: { flexDirection: "row", alignItems: "center", gap: 10 },
  roundBtn: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  titleWrap: { flex: 1 },
  title: { color: "#fff", fontWeight: "800", fontSize: 15 },
  subtitle: { color: "rgba(255,255,255,0.72)", fontSize: 12, marginTop: 2 },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  statusPillLive: { backgroundColor: "rgba(239,68,68,0.92)" },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: "#fff",
  },
  statusText: { color: "#fff", fontWeight: "800", fontSize: 11 },
  bottomFade: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 26,
    paddingHorizontal: 14,
    gap: 10,
  },
  sourceRow: { gap: 8, paddingRight: 12 },
  sourceChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "transparent",
  },
  sourceChipActive: {
    backgroundColor: "rgba(37,244,238,0.92)",
    borderColor: "rgba(37,244,238,0.92)",
  },
  sourceChipText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  sourceChipTextActive: { color: "#06222a" },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  actionText: { color: "#fff", fontWeight: "700", fontSize: 12 },
});
