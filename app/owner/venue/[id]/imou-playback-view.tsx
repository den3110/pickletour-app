// Owner: xem lại 1 đoạn recording — progress native, seek giữ vị trí, preload
// clip kế → swap liền mạch (tham khảo PickleBook owner-app PlaybackViewScreen).
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, StyleSheet, TouchableOpacity, ActivityIndicator, StatusBar, Alert,
  PanResponder, Share, Platform,
} from "react-native";
import { Text } from "@/components/ui/i18nText";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { pal } from "@/utils/courtFormat";

function loadImouNative(): { native: any | null; VideoView: any | null } {
  try {
    const mod = require("imou-rn-native");
    return { native: mod.default || mod, VideoView: mod.ImouVideoView };
  } catch { return { native: null, VideoView: null }; }
}

function fmtHMS(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "00:00";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
function parseImouTime(s: string): Date | null {
  const m = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}
// Cam ghi theo giờ local VN — KHÔNG dùng toISOString (UTC lệch 7h).
function fmtImouLocalTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
function hm(s: string) { return `${s.slice(9, 11)}:${s.slice(11, 13)}`; }

interface QueueItem { begin: string; end: string; title?: string }
interface PreloadInfo { sessionId: string; begin: string; end: string; title?: string }

const MAX_RETRIES = 5;

// Capture gesture để tap/scroll bên ngoài không nuốt drag trên thanh tua.
const SeekBar: React.FC<{ frac: number; accent: string; onScrub: (f: number) => void; onRelease: (f: number) => void }> =
  ({ frac, accent, onScrub, onRelease }) => {
    const trackRef = useRef<View>(null);
    const leftRef = useRef(0);
    const widthRef = useRef(1);
    const measure = () => {
      trackRef.current?.measureInWindow((x, _y, w) => { leftRef.current = x; if (w > 0) widthRef.current = w; });
    };
    const toNorm = (px: number) => Math.max(0, Math.min(1, (px - leftRef.current) / (widthRef.current || 1)));
    const pan = useRef(PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => { measure(); onScrub(toNorm(e.nativeEvent.pageX)); },
      onPanResponderMove: (e) => { onScrub(toNorm(e.nativeEvent.pageX)); },
      onPanResponderRelease: (e) => { onRelease(toNorm(e.nativeEvent.pageX)); },
      onPanResponderTerminate: (e) => { onRelease(toNorm(e.nativeEvent.pageX)); },
    })).current;
    return (
      <View ref={trackRef} onLayout={measure} style={styles.seekTouch} {...pan.panHandlers}>
        <View style={styles.seekTrack}>
          <View style={[styles.seekFill, { width: `${frac * 100}%`, backgroundColor: accent }]} />
        </View>
        <View style={[styles.seekThumb, { left: `${frac * 100}%`, backgroundColor: accent }]} />
      </View>
    );
  };

export default function ImouPlaybackViewScreen() {
  const params = useLocalSearchParams<{ deviceId: string; begin: string; end: string; title?: string; queue?: string }>();
  const deviceId = String(params.deviceId || "");
  const theme = useTheme();
  const C = useMemo(() => pal(!!theme.dark), [theme.dark]);
  const { native: ImouNative, VideoView } = useMemo(loadImouNative, []);

  const [segment, setSegment] = useState<QueueItem>({
    begin: String(params.begin || ""), end: String(params.end || ""), title: params.title ? String(params.title) : undefined,
  });
  const [queue, setQueue] = useState<QueueItem[]>(() => {
    try { return params.queue ? JSON.parse(String(params.queue)) : []; } catch { return []; }
  });
  const { begin, end, title } = segment;
  const [autoNext, setAutoNext] = useState(true);
  const autoAdvanceRef = useRef(false);

  const segBeginDate = useMemo(() => parseImouTime(begin), [begin]);
  const segEndDate = useMemo(() => parseImouTime(end), [end]);
  const segDurationSec = useMemo(() => {
    if (!segBeginDate || !segEndDate) return 0;
    return Math.max(0, Math.round((segEndDate.getTime() - segBeginDate.getTime()) / 1000));
  }, [segBeginDate, segEndDate]);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "starting" | "live" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [progressPos, setProgressPos] = useState(0);
  const sessionOffsetRef = useRef(0);
  const [sessionOffset, setSessionOffset] = useState(0);
  const [scrubFrac, setScrubFrac] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadStart, setDownloadStart] = useState<number | null>(null);
  const sessionRef = useRef<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const retryTimerRef = useRef<any>(null);
  const [retryingIn, setRetryingIn] = useState<{ n: number; at: number } | null>(null);
  const [nativeReconnecting, setNativeReconnecting] = useState<number | null>(null);
  // Có frame thật chưa: progress đầu tiên của session = decoder đã chạy.
  const [gotFrame, setGotFrame] = useState(false);

  const [preload, setPreload] = useState<PreloadInfo | null>(null);
  const preloadRef = useRef<PreloadInfo | null>(null);
  const preloadTriggeredRef = useRef(false);

  const startSessionAt = useCallback(async (offsetSec: number) => {
    if (!ImouNative || !segBeginDate) return;
    if (sessionRef.current) {
      try { await ImouNative.stopSession(sessionRef.current); } catch {}
      sessionRef.current = null;
      setSessionId(null);
    }
    // Seek phá quỹ đạo → preload cũ vô nghĩa.
    if (preloadRef.current) {
      try { await ImouNative.stopSession(preloadRef.current.sessionId); } catch {}
      preloadRef.current = null;
      setPreload(null);
    }
    preloadTriggeredRef.current = false;
    if (downloading) { setDownloading(false); setDownloadStart(null); }
    setStatus("starting"); setErrorMsg(null); setGotFrame(false);
    sessionOffsetRef.current = offsetSec;
    setSessionOffset(offsetSec);
    setProgressPos(0);
    const newBegin = fmtImouLocalTime(new Date(segBeginDate.getTime() + offsetSec * 1000));
    try {
      const sess: any = await ImouNative.startPlayback(deviceId, newBegin, end, { withAudio: !muted, encrypt: 2 });
      sessionRef.current = sess.sessionId;
      setSessionId(sess.sessionId);
      setStatus("live");
      setPaused(false);
    } catch (e: any) {
      setStatus("error");
      setErrorMsg(e?.message || "Không mở được bản ghi");
    }
  }, [ImouNative, segBeginDate, deviceId, end, muted, downloading]);

  useEffect(() => {
    startSessionAt(0);
    return () => {
      if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
      if (sessionRef.current) { try { ImouNative?.stopSession(sessionRef.current); } catch {} sessionRef.current = null; }
      if (preloadRef.current) { try { ImouNative?.stopSession(preloadRef.current.sessionId); } catch {} preloadRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ImouNative || !sessionId) return;
    try {
      const sub = ImouNative.onPlaybackProgress((e: any) => {
        if (e.sessionId !== sessionId) return;
        setNativeReconnecting(null);
        setGotFrame(true);
        setProgressPos(e.positionSec || 0);
      });
      return () => { try { sub.remove(); } catch {} };
    } catch { /* no progress support */ }
  }, [ImouNative, sessionId]);

  // Fallback nếu native không emit progress (ít khi) → bỏ overlay sau 4s.
  useEffect(() => {
    if (!sessionId || gotFrame) return;
    const t = setTimeout(() => setGotFrame(true), 4000);
    return () => clearTimeout(t);
  }, [sessionId, gotFrame]);

  const posRef = useRef({ offset: 0, progress: 0 });
  useEffect(() => { posRef.current = { offset: sessionOffset, progress: progressPos }; }, [sessionOffset, progressPos]);
  const segDurRef = useRef(0);
  useEffect(() => { segDurRef.current = segDurationSec; }, [segDurationSec]);
  const queueRef = useRef<QueueItem[]>(queue);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  const startSessionAtRef = useRef(startSessionAt);
  useEffect(() => { startSessionAtRef.current = startSessionAt; }, [startSessionAt]);

  const scheduleRetry = useCallback(() => {
    if (retryTimerRef.current) return;
    setRetryCount((n) => {
      if (n >= MAX_RETRIES) {
        setStatus("error");
        setErrorMsg(`Kết nối lỗi sau ${MAX_RETRIES} lần thử. Kiểm tra mạng.`);
        setRetryingIn(null);
        return n;
      }
      const delay = 1000 * Math.pow(2, n);
      const restoreAt = posRef.current.offset + posRef.current.progress;
      setRetryingIn({ n: n + 1, at: restoreAt });
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        setRetryingIn(null);
        startSessionAtRef.current(restoreAt);
      }, delay);
      return n + 1;
    });
  }, []);

  const handleClipEnded = useCallback(() => {
    setProgressPos(Math.max(0.1, segDurRef.current - posRef.current.offset));
  }, []);

  // Prop onError của VideoView là prop chết → lỗi phải nghe ở cấp module.
  useEffect(() => {
    if (!ImouNative) return;
    const errSub = ImouNative.onError?.((e: any) => {
      const sid = e?.sessionId;
      if (sid && preloadRef.current && sid === preloadRef.current.sessionId) {
        try { ImouNative.stopSession?.(sid); } catch {}
        preloadRef.current = null;
        setPreload(null);
        preloadTriggeredRef.current = false;
        return;
      }
      if (sid && sessionRef.current && sid !== sessionRef.current) return;
      const code = String(e?.code || "");
      const msg = String(e?.message || "");
      if (code === "reconnecting") {
        const m = msg.match(/attempt=(\d+)/);
        setNativeReconnecting(m ? +m[1] : 1);
        return;
      }
      const watched = posRef.current.offset + posRef.current.progress;
      if (/closed/i.test(msg) && segDurRef.current > 0 && segDurRef.current - watched <= 3) {
        handleClipEnded();
        return;
      }
      if (/closed|network|disconnect|timeout|io\(|producer_failed/i.test(code + " " + msg)) {
        setNativeReconnecting(null);
        scheduleRetry();
      } else {
        setStatus("error");
        setErrorMsg(msg || code || "Player lỗi");
      }
    });
    return () => { errSub?.remove?.(); };
  }, [ImouNative, scheduleRetry, handleClipEnded]);

  useEffect(() => { if (progressPos > 0 && retryCount > 0) setRetryCount(0); }, [progressPos, retryCount]);

  useEffect(() => {
    if (!showControls) return;
    const t = setTimeout(() => setShowControls(false), 4000);
    return () => clearTimeout(t);
  }, [showControls, paused]);

  useEffect(() => { autoAdvanceRef.current = false; preloadTriggeredRef.current = false; }, [segment.begin]);

  const absPosForEnd = sessionOffset + progressPos;

  // Còn <2s → mở session clip kế ẩn (opacity 0) để decoder warmup sẵn.
  useEffect(() => {
    if (!autoNext || preloadTriggeredRef.current || preload) return;
    if (!queue.length || segDurationSec <= 0 || progressPos <= 0) return;
    if (segDurationSec - absPosForEnd > 2) return;
    preloadTriggeredRef.current = true;
    const next = queue[0];
    (async () => {
      if (!ImouNative) return;
      try {
        const sess: any = await ImouNative.startPlayback(deviceId, next.begin, next.end, { withAudio: false, encrypt: 2 });
        const info = { sessionId: sess.sessionId, begin: next.begin, end: next.end, title: next.title };
        preloadRef.current = info;
        setPreload(info);
      } catch { /* fallback restart bên dưới */ }
    })();
  }, [absPosForEnd, segDurationSec, queue, autoNext, preload, progressPos, ImouNative, deviceId]);

  // Hết clip: có preload → swap tại chỗ (0 giật); không → start lại clip kế.
  useEffect(() => {
    if (!autoNext || autoAdvanceRef.current) return;
    if (segDurationSec <= 0 || progressPos <= 0 || !queue.length) return;
    if (segDurationSec - absPosForEnd > 0.3) return;
    autoAdvanceRef.current = true;
    const next = queue[0];
    if (preload && preload.begin === next.begin) {
      const pre = preload;
      const oldSid = sessionRef.current;
      sessionRef.current = pre.sessionId;
      setSessionId(pre.sessionId);
      setSegment({ begin: pre.begin, end: pre.end, title: pre.title });
      setSessionOffset(0); sessionOffsetRef.current = 0;
      setProgressPos(0);
      setStatus("live"); setPaused(false); setGotFrame(true);
      if (ImouNative && !muted) ImouNative.setMuted?.(pre.sessionId, false).catch(() => {});
      if (oldSid) ImouNative?.stopSession(oldSid).catch(() => {});
      preloadRef.current = null;
      setPreload(null);
      setQueue((q) => q.slice(1));
    } else {
      // Preload chưa kịp/fail → mở thẳng clip kế (chịu ~1-2s đen).
      setSegment({ begin: next.begin, end: next.end, title: next.title });
      setQueue((q) => q.slice(1));
      (async () => {
        if (!ImouNative) return;
        const oldSid = sessionRef.current;
        sessionRef.current = null;
        if (oldSid) { try { await ImouNative.stopSession(oldSid); } catch {} }
        setStatus("starting"); setGotFrame(false); setProgressPos(0);
        setSessionOffset(0); sessionOffsetRef.current = 0;
        try {
          const sess: any = await ImouNative.startPlayback(deviceId, next.begin, next.end, { withAudio: !muted, encrypt: 2 });
          sessionRef.current = sess.sessionId;
          setSessionId(sess.sessionId);
          setStatus("live"); setPaused(false);
        } catch (e: any) {
          setStatus("error"); setErrorMsg(e?.message || "Không mở được clip kế");
        }
      })();
    }
  }, [absPosForEnd, segDurationSec, preload, autoNext, progressPos, queue, ImouNative, muted, deviceId]);

  const absPos = sessionOffset + progressPos;
  const totalDur = segDurationSec;
  const displayFrac = scrubFrac != null ? scrubFrac : (totalDur > 0 ? Math.min(1, absPos / totalDur) : 0);
  const displayPos = scrubFrac != null ? Math.round(scrubFrac * totalDur) : absPos;

  const cancelRetry = () => {
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    setRetryCount(0); setRetryingIn(null); setNativeReconnecting(null);
  };
  const doSeek = (frac: number) => {
    if (totalDur <= 0) return;
    cancelRetry();
    startSessionAt(Math.max(0, Math.min(totalDur - 1, Math.round(frac * totalDur))));
  };
  const doSkip = (delta: number) => {
    if (totalDur <= 0) return;
    cancelRetry();
    startSessionAt(Math.max(0, Math.min(totalDur - 1, absPos + delta)));
  };
  const doReconnect = () => { cancelRetry(); setErrorMsg(null); startSessionAt(sessionOffset + progressPos); };

  const doTogglePause = async () => {
    if (!sessionId || !ImouNative) return;
    try { await ImouNative.setPaused(sessionId, !paused); setPaused((v) => !v); }
    catch (e: any) { Alert.alert("Lỗi", e?.message || "Không đổi trạng thái được"); }
  };
  const doMute = async (next: boolean) => {
    setMuted(next);
    if (!sessionId || !ImouNative) return;
    try { await ImouNative.setMuted(sessionId, next); } catch {}
  };
  const doSnapshot = async () => {
    if (!ImouNative) return;
    try {
      const res: any = await ImouNative.snapshot(deviceId, { saveToGallery: true });
      Alert.alert("Chụp ảnh", res?.savedToGallery ? "Đã lưu ảnh vào Photos" : "Đã chụp");
    } catch (e: any) { Alert.alert("Lỗi", e?.message || "Không chụp được"); }
  };
  const doDownload = async () => {
    if (!ImouNative || !sessionId) return;
    if (!downloading) {
      try {
        await ImouNative.startRecording(sessionId);
        setDownloading(true); setDownloadStart(absPos);
      } catch (e: any) { Alert.alert("Lỗi", e?.message || "Không bắt đầu tải được"); }
      return;
    }
    try {
      const res: any = await ImouNative.stopRecording(sessionId, { saveToGallery: true });
      setDownloading(false); setDownloadStart(null);
      const uri: string | undefined = res?.uri;
      const savedMsg = res?.savedToGallery ? "Đã lưu clip vào Photos" : "Đã tải xong";
      if (uri && Platform.OS !== "web") {
        Alert.alert("Đã tải clip", `${savedMsg}. Chia sẻ ngay?`, [
          { text: "Xong" },
          { text: "Chia sẻ", onPress: () => Share.share({ url: uri, message: "Clip từ PickleTour" }).catch(() => {}) },
        ]);
      } else Alert.alert("Tải clip", savedMsg);
    } catch (e: any) { setDownloading(false); Alert.alert("Lỗi", e?.message || "Lỗi lưu clip"); }
  };

  if (!ImouNative || !VideoView) {
    return (
      <SafeAreaView style={[styles.errRoot, { backgroundColor: C.bg }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Ionicons name="alert-circle" size={48} color={C.warning} />
        <Text style={{ color: C.text, fontWeight: "800", fontSize: 16 }}>Module camera chưa build</Text>
        <TouchableOpacity onPress={() => router.back()} style={[styles.errBtn, { backgroundColor: C.accent }]}>
          <Text style={{ color: C.onAccent, fontWeight: "800" }}>Quay lại</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const dlDurSec = downloadStart != null ? Math.max(0, absPos - downloadStart) : 0;
  const loadingOverlay = status === "starting" || (status === "live" && !gotFrame);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="light-content" />

      <TouchableOpacity activeOpacity={1} onPress={() => setShowControls((v) => !v)} style={styles.videoWrap}>
        {/* key={sessionId}: view + layer mới mỗi session, không dính frame cũ. */}
        {sessionId ? (
          <VideoView key={sessionId} sessionId={sessionId} resizeMode="contain" style={StyleSheet.absoluteFillObject} />
        ) : null}
        {preload ? (
          <VideoView key={preload.sessionId} sessionId={preload.sessionId} resizeMode="contain"
            style={[StyleSheet.absoluteFillObject, { opacity: 0 }]} />
        ) : null}

        {loadingOverlay && !retryingIn && (
          <View style={styles.overlayCenter}>
            <ActivityIndicator color="#fff" size="large" />
            <Text style={styles.overlayText}>Đang mở bản ghi…</Text>
          </View>
        )}
        {retryingIn && (
          <View style={styles.overlayCenter}>
            <ActivityIndicator color="#fff" size="large" />
            <Text style={styles.overlayText}>Đang kết nối lại ({retryingIn.n}/{MAX_RETRIES})…</Text>
            <Text style={styles.overlayHint}>Sẽ tiếp tục từ {fmtHMS(retryingIn.at)}</Text>
          </View>
        )}
        {nativeReconnecting != null && !retryingIn && (
          <View style={styles.reconBadge} pointerEvents="none">
            <ActivityIndicator size="small" color="#fff" />
            <Text style={styles.reconBadgeText}>Đang nối lại ({nativeReconnecting}/3)…</Text>
          </View>
        )}
        {status === "error" && (
          <View style={styles.overlayCenter}>
            <Ionicons name="warning" size={40} color={C.warning} />
            <Text style={styles.overlayText} numberOfLines={3}>{errorMsg}</Text>
            <Text style={styles.overlayHint}>Đoạn này: {hm(begin)} → {hm(end)}</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <TouchableOpacity onPress={doReconnect} style={[styles.retryBtn, { backgroundColor: C.accent }]}>
                <Ionicons name="refresh" size={16} color={C.onAccent} />
                <Text style={{ color: C.onAccent, fontWeight: "800" }}>Kết nối lại</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.back()} style={[styles.retryBtn, { backgroundColor: "rgba(255,255,255,0.15)" }]}>
                <Text style={{ color: "#fff", fontWeight: "800" }}>Đóng</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </TouchableOpacity>

      {showControls && (
        <SafeAreaView edges={["top"]} style={styles.topBar} pointerEvents="box-none">
          <View style={styles.topRow}>
            <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.iconBtnDark}>
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.topTitle} numberOfLines={1}>{title || "Xem lại"}</Text>
              <Text style={styles.topSub} numberOfLines={1}>
                {begin.slice(6, 8)}/{begin.slice(4, 6)} · {hm(begin)} → {hm(end)}
              </Text>
            </View>
            <TouchableOpacity onPress={doReconnect} hitSlop={8} style={styles.iconBtnDark}>
              <Ionicons name="refresh" size={18} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => queue.length > 0 && setAutoNext((v) => !v)}
              hitSlop={8}
              style={[styles.autoChip, autoNext && queue.length > 0 && { backgroundColor: "#fff" }, queue.length === 0 && { opacity: 0.5 }]}
            >
              <Ionicons
                name={queue.length === 0 ? "checkmark-done" : autoNext ? "infinite" : "infinite-outline"}
                size={12}
                color={autoNext && queue.length > 0 ? "#0F172A" : "#fff"}
              />
              <Text style={[styles.autoChipText, autoNext && queue.length > 0 && { color: "#0F172A" }]}>
                {queue.length === 0 ? "Cuối cùng" : autoNext ? `Auto ×${queue.length}` : "Auto tắt"}
              </Text>
              {preload && <View style={styles.preloadDot} />}
            </TouchableOpacity>
            {downloading && (
              <View style={styles.dlBadge}>
                <View style={styles.dlDot} />
                <Text style={styles.dlBadgeText}>ĐANG TẢI {fmtHMS(dlDurSec)}</Text>
              </View>
            )}
          </View>
        </SafeAreaView>
      )}

      {showControls && (
        <SafeAreaView edges={["bottom"]} style={styles.bottomBar} pointerEvents="box-none">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={styles.timeText}>{fmtHMS(displayPos)}</Text>
            <View style={{ flex: 1 }}>
              <SeekBar
                frac={displayFrac}
                accent={C.accent}
                onScrub={(f) => setScrubFrac(f)}
                onRelease={(f) => { setScrubFrac(null); doSeek(f); }}
              />
            </View>
            <Text style={styles.timeText}>{fmtHMS(totalDur)}</Text>
          </View>

          <View style={styles.playRow}>
            <TouchableOpacity onPress={() => doSkip(-10)} style={styles.skipBtn}>
              <Ionicons name="play-back" size={22} color="#fff" />
              <Text style={styles.skipLabel}>10s</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={doTogglePause} style={[styles.playBtn, { backgroundColor: C.accent }]}>
              <Ionicons name={paused ? "play" : "pause"} size={30} color={C.onAccent} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => doSkip(10)} style={styles.skipBtn}>
              <Ionicons name="play-forward" size={22} color="#fff" />
              <Text style={styles.skipLabel}>10s</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => doMute(!muted)} style={styles.chipDark}>
              <Ionicons name={muted ? "volume-mute" : "volume-high"} size={16} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity onPress={doSnapshot} style={styles.actionBtn}>
              <Ionicons name="camera" size={22} color="#fff" />
              <Text style={styles.actionLabel}>Chụp</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={doDownload} disabled={status !== "live"}
              style={[styles.actionBtn, downloading && { backgroundColor: "#DC2626" }, status !== "live" && { opacity: 0.4 }]}>
              <Ionicons name={downloading ? "square" : "download-outline"} size={22} color="#fff" />
              <Text style={styles.actionLabel}>{downloading ? "Dừng tải" : "Tải clip"}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  videoWrap: { flex: 1, backgroundColor: "#000", position: "relative" },
  overlayCenter: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#000", padding: 24 },
  overlayText: { color: "#fff", fontSize: 13, textAlign: "center" },
  overlayHint: { color: "rgba(255,255,255,0.6)", fontSize: 11, textAlign: "center" },
  reconBadge: {
    position: "absolute", top: 90, alignSelf: "center", flexDirection: "row", gap: 6, alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
  },
  reconBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  retryBtn: { flexDirection: "row", gap: 6, alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999 },
  topBar: { position: "absolute", top: 0, left: 0, right: 0 },
  topRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: "rgba(0,0,0,0.35)" },
  topTitle: { color: "#fff", fontWeight: "800", fontSize: 15 },
  topSub: { color: "rgba(255,255,255,0.75)", fontSize: 11, marginTop: 1 },
  iconBtnDark: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.15)" },
  autoChip: { flexDirection: "row", gap: 4, alignItems: "center", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.15)" },
  autoChipText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  preloadDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#22c55e", marginLeft: 2 },
  dlBadge: { flexDirection: "row", gap: 5, alignItems: "center", backgroundColor: "rgba(220,38,38,0.9)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  dlDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" },
  dlBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  bottomBar: { position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8, backgroundColor: "rgba(0,0,0,0.4)", gap: 10 },
  timeText: { color: "#fff", fontSize: 12, fontWeight: "700", minWidth: 44, textAlign: "center" },
  seekTouch: { height: 36, justifyContent: "center" },
  seekTrack: { height: 4, backgroundColor: "rgba(255,255,255,0.3)", borderRadius: 2, overflow: "hidden" },
  seekFill: { height: 4, borderRadius: 2 },
  seekThumb: { position: "absolute", top: 10, width: 16, height: 16, borderRadius: 8, marginLeft: -8 },
  playRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 20 },
  skipBtn: { alignItems: "center", gap: 2, padding: 6 },
  skipLabel: { color: "#fff", fontSize: 10, fontWeight: "800" },
  playBtn: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  chipDark: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.15)" },
  actionRow: { flexDirection: "row", gap: 8 },
  actionBtn: { flex: 1, alignItems: "center", gap: 4, paddingVertical: 10, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.15)" },
  actionLabel: { color: "#fff", fontSize: 11, fontWeight: "800" },
  errRoot: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 8 },
  errBtn: { marginTop: 12, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999 },
});
