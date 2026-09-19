// Owner: xem lại 1 đoạn recording — play/pause/seek/mute.
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View, StyleSheet, TouchableOpacity, ActivityIndicator, StatusBar, Alert, PanResponder,
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
function fmtImouLocalTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export default function ImouPlaybackViewScreen() {
  const { deviceId, begin, end, title } = useLocalSearchParams<{
    deviceId: string; begin: string; end: string; title?: string;
  }>();
  const theme = useTheme();
  const C = useMemo(() => pal(!!theme.dark), [theme.dark]);
  const { native: ImouNative, VideoView } = useMemo(loadImouNative, []);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "starting" | "playing" | "paused" | "error" | "ended">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [progress, setProgress] = useState(0);
  const [seekDrag, setSeekDrag] = useState<number | null>(null);
  const [barWidth, setBarWidth] = useState(0);
  const sessionRef = useRef<string | null>(null);

  const beginDate = useMemo(() => parseImouTime(String(begin) || ""), [begin]);
  const endDate = useMemo(() => parseImouTime(String(end) || ""), [end]);
  const totalSec = useMemo(() => (beginDate && endDate ? Math.max(1, Math.floor((endDate.getTime() - beginDate.getTime()) / 1000)) : 0), [beginDate, endDate]);

  useEffect(() => {
    if (!ImouNative || !deviceId || !begin || !end) return;
    let cancelled = false;
    (async () => {
      setStatus("starting"); setErrorMsg(null); setProgress(0);
      try {
        const sess: any = await ImouNative.startPlayback(deviceId, begin, end, { withAudio: !muted });
        if (cancelled) { try { await ImouNative.stopSession(sess.sessionId); } catch {} return; }
        sessionRef.current = sess.sessionId;
        setSessionId(sess.sessionId);
        setStatus("playing");
      } catch (e: any) {
        if (!cancelled) { setStatus("error"); setErrorMsg(e?.message || "Không mở được playback"); }
      }
    })();
    return () => {
      cancelled = true;
      if (sessionRef.current) { try { ImouNative.stopSession(sessionRef.current); } catch {} sessionRef.current = null; }
    };
  }, [deviceId, begin, end]);

  useEffect(() => {
    if (status !== "playing" || !totalSec) return;
    const t = setInterval(() => {
      setProgress((p) => {
        const n = p + 1;
        if (n >= totalSec) { setStatus("ended"); return totalSec; }
        return n;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [status, totalSec]);

  useEffect(() => {
    if (!showControls) return;
    const t = setTimeout(() => setShowControls(false), 4000);
    return () => clearTimeout(t);
  }, [showControls]);

  const togglePlayPause = async () => {
    if (!sessionId || !ImouNative) return;
    try {
      if (status === "playing") { await ImouNative.setPaused(sessionId, true); setStatus("paused"); }
      else if (status === "paused") { await ImouNative.setPaused(sessionId, false); setStatus("playing"); }
      else if (status === "ended") {
        // restart from begin
        try { await ImouNative.stopSession(sessionId); } catch {}
        setProgress(0); setStatus("starting");
        const sess: any = await ImouNative.startPlayback(deviceId, begin, end, { withAudio: !muted });
        sessionRef.current = sess.sessionId; setSessionId(sess.sessionId); setStatus("playing");
      }
    } catch (e: any) { Alert.alert("Lỗi", e?.message || "Không đổi trạng thái được"); }
  };

  const doMute = async (next: boolean) => {
    setMuted(next);
    if (!sessionId || !ImouNative) return;
    try { await ImouNative.setMuted(sessionId, next); } catch {}
  };

  const seekTo = async (sec: number) => {
    if (!ImouNative || !deviceId || !beginDate) return;
    const target = new Date(beginDate.getTime() + sec * 1000);
    try {
      if (sessionRef.current) { try { await ImouNative.stopSession(sessionRef.current); } catch {} sessionRef.current = null; }
      setStatus("starting"); setProgress(sec);
      const sess: any = await ImouNative.startPlayback(deviceId, fmtImouLocalTime(target), end, { withAudio: !muted });
      sessionRef.current = sess.sessionId; setSessionId(sess.sessionId); setStatus("playing");
    } catch (e: any) { Alert.alert("Lỗi", e?.message || "Seek thất bại"); }
  };

  const seekBarRef = useRef<View>(null);
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      if (!barWidth || !totalSec) return;
      const x = e.nativeEvent.locationX;
      const sec = Math.max(0, Math.min(totalSec, Math.round((x / barWidth) * totalSec)));
      setSeekDrag(sec);
    },
    onPanResponderMove: (e) => {
      if (!barWidth || !totalSec) return;
      const x = e.nativeEvent.locationX;
      const sec = Math.max(0, Math.min(totalSec, Math.round((x / barWidth) * totalSec)));
      setSeekDrag(sec);
    },
    onPanResponderRelease: async () => {
      if (seekDrag != null) { await seekTo(seekDrag); setSeekDrag(null); }
    },
    onPanResponderTerminate: () => setSeekDrag(null),
  }), [barWidth, totalSec, seekDrag]);

  if (!ImouNative || !VideoView) {
    return (
      <SafeAreaView style={[styles.errRoot, { backgroundColor: C.bg }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <StatusBar barStyle="light-content" />
        <Ionicons name="alert-circle" size={48} color={C.warning} />
        <Text style={{ color: C.text, fontWeight: "800", fontSize: 16 }}>Module camera chưa build</Text>
        <TouchableOpacity onPress={() => router.back()} style={[styles.errBtn, { backgroundColor: C.accent }]}>
          <Text style={{ color: C.onAccent, fontWeight: "800" }}>Quay lại</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const displaySec = seekDrag != null ? seekDrag : progress;
  const pct = totalSec ? (displaySec / totalSec) * 100 : 0;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="light-content" />

      <TouchableOpacity activeOpacity={1} onPress={() => setShowControls((v) => !v)} style={styles.videoWrap}>
        {sessionId ? (
          <VideoView sessionId={sessionId} resizeMode="contain" style={StyleSheet.absoluteFillObject}
            onError={(e: any) => { setStatus("error"); setErrorMsg(e?.message || "Player lỗi"); }}
          />
        ) : null}

        {(status === "starting" || status === "idle") && (
          <View style={styles.overlayCenter}>
            <ActivityIndicator color="#fff" size="large" />
            <Text style={styles.overlayText}>Đang tải playback…</Text>
          </View>
        )}
        {status === "error" && (
          <View style={styles.overlayCenter}>
            <Ionicons name="warning" size={40} color={C.warning} />
            <Text style={styles.overlayText}>{errorMsg}</Text>
          </View>
        )}
        {status === "ended" && (
          <View style={styles.overlayCenter}>
            <Ionicons name="checkmark-circle" size={40} color={C.success} />
            <Text style={styles.overlayText}>Đã kết thúc</Text>
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
                {beginDate ? beginDate.toLocaleString("vi-VN") : ""}
              </Text>
            </View>
            <TouchableOpacity onPress={() => doMute(!muted)} hitSlop={12} style={styles.iconBtnDark}>
              <Ionicons name={muted ? "volume-mute" : "volume-high"} size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      )}

      {showControls && (
        <SafeAreaView edges={["bottom"]} style={styles.bottomBar} pointerEvents="box-none">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text style={styles.timeText}>{fmtHMS(displaySec)}</Text>
            <View
              ref={seekBarRef}
              onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
              style={styles.seekBarWrap}
              {...panResponder.panHandlers}
            >
              <View style={styles.seekBarTrack}>
                <View style={[styles.seekBarFill, { width: `${pct}%`, backgroundColor: C.accent }]} />
                <View style={[styles.seekKnob, { left: `${pct}%`, backgroundColor: C.accent }]} />
              </View>
            </View>
            <Text style={styles.timeText}>{fmtHMS(totalSec)}</Text>
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity onPress={() => seekTo(Math.max(0, progress - 10))} style={styles.actionBtn}>
              <Ionicons name="play-back" size={22} color="#fff" />
              <Text style={styles.actionLabel}>-10s</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={togglePlayPause} style={[styles.actionBtn, styles.playBtn, { backgroundColor: C.accent }]}>
              <Ionicons
                name={status === "playing" ? "pause" : status === "ended" ? "refresh" : "play"}
                size={28}
                color={C.onAccent}
              />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => seekTo(Math.min(totalSec - 1, progress + 10))} style={styles.actionBtn}>
              <Ionicons name="play-forward" size={22} color="#fff" />
              <Text style={styles.actionLabel}>+10s</Text>
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
  overlayCenter: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "rgba(0,0,0,0.4)" },
  overlayText: { color: "#fff", fontSize: 13 },
  topBar: { position: "absolute", top: 0, left: 0, right: 0 },
  topRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: "rgba(0,0,0,0.35)" },
  topTitle: { color: "#fff", fontWeight: "800", fontSize: 15 },
  topSub: { color: "rgba(255,255,255,0.75)", fontSize: 11, marginTop: 1 },
  iconBtnDark: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.15)" },
  bottomBar: { position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 8, backgroundColor: "rgba(0,0,0,0.4)", gap: 12 },
  timeText: { color: "#fff", fontSize: 12, fontWeight: "700", minWidth: 48, textAlign: "center" },
  seekBarWrap: { flex: 1, height: 32, justifyContent: "center" },
  seekBarTrack: { height: 4, backgroundColor: "rgba(255,255,255,0.3)", borderRadius: 2, position: "relative" },
  seekBarFill: { height: 4, borderRadius: 2 },
  seekKnob: { position: "absolute", top: -6, width: 16, height: 16, borderRadius: 8, marginLeft: -8 },
  actionRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 24 },
  actionBtn: { alignItems: "center", gap: 2, padding: 8 },
  actionLabel: { color: "#fff", fontSize: 10, fontWeight: "800" },
  playBtn: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", padding: 0 },
  errRoot: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 8 },
  errBtn: { marginTop: 12, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999 },
});
