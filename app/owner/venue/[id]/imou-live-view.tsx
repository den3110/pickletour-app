// Owner: xem live 1 cam Imou (full-screen) — PTZ, zoom, snapshot, ghi hình, đổi cam.
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, StatusBar, Alert,
} from "react-native";
import { Text } from "@/components/ui/i18nText";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { pal } from "@/utils/courtFormat";
import { useGetVenueQuery } from "@/slices/venuesApiSlice";
import { venueCams, type CourtCam } from "@/utils/imouCams";

function loadImouNative(): { native: any | null; VideoView: any | null } {
  try {
    const mod = require("imou-rn-native");
    return { native: mod.default || mod, VideoView: mod.ImouVideoView };
  } catch { return { native: null, VideoView: null }; }
}

interface PtzCap { move: "eight" | "four" | "twoLR" | "none"; zoom: boolean }

export default function ImouLiveViewScreen() {
  const { id, deviceId: initialDevice } = useLocalSearchParams<{ id: string; deviceId: string }>();
  const theme = useTheme();
  const C = useMemo(() => pal(!!theme.dark), [theme.dark]);
  const { native: ImouNative, VideoView } = useMemo(loadImouNative, []);

  const { data: venue } = useGetVenueQuery(id, { skip: !id });
  const cams: CourtCam[] = useMemo(() => venueCams(venue), [venue]);

  const [activeDeviceId, setActiveDeviceId] = useState<string>(String(initialDevice || ""));
  const activeCam = cams.find((c) => c.deviceId === activeDeviceId);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "starting" | "live" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [quality, setQuality] = useState<"hd" | "sd">("hd");
  const [muted, setMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [ptzCap, setPtzCap] = useState<PtzCap | null>(null);
  const [recording, setRecording] = useState(false);
  const [zoomPct, setZoomPct] = useState<number | null>(null);
  const sessionRef = useRef<string | null>(null);
  const [restartKey, setRestartKey] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const retryTimerRef = useRef<any>(null);
  const MAX_RETRIES = 5;

  useEffect(() => {
    if (!ImouNative || !activeDeviceId) return;
    let cancelled = false;
    (async () => {
      if (sessionRef.current) {
        try { await ImouNative.stopSession(sessionRef.current); } catch {}
        sessionRef.current = null;
      }
      setStatus("starting"); setErrorMsg(null);
      try {
        const sess: any = await ImouNative.startLive(activeDeviceId, { quality, withAudio: !muted });
        if (cancelled) { try { await ImouNative.stopSession(sess.sessionId); } catch {} return; }
        sessionRef.current = sess.sessionId;
        setSessionId(sess.sessionId);
        setStatus("live");
      } catch (e: any) {
        if (!cancelled) { setStatus("error"); setErrorMsg(e?.message || "Không mở được stream"); }
      }
    })();
    return () => {
      cancelled = true;
      if (sessionRef.current) { try { ImouNative.stopSession(sessionRef.current); } catch {} sessionRef.current = null; }
      if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    };
  }, [activeDeviceId, quality, restartKey]);

  useEffect(() => {
    if (!ImouNative || !activeDeviceId) return;
    let c = false;
    (async () => {
      try { const cap: PtzCap = await ImouNative.getPtzCapability(activeDeviceId); if (!c) setPtzCap(cap); }
      catch { if (!c) setPtzCap({ move: "none", zoom: false }); }
    })();
    return () => { c = true; };
  }, [activeDeviceId]);

  useEffect(() => {
    if (!ImouNative || !ptzCap?.zoom || !activeDeviceId) return;
    let c = false;
    (async () => {
      try { const n: number = await ImouNative.getZoomLevel(activeDeviceId); if (!c) setZoomPct(Math.round(n * 100)); } catch {}
    })();
    return () => { c = true; };
  }, [activeDeviceId, ptzCap?.zoom]);

  useEffect(() => {
    if (!showControls) return;
    const t = setTimeout(() => setShowControls(false), 4000);
    return () => clearTimeout(t);
  }, [showControls]);

  const doMute = async (next: boolean) => {
    setMuted(next);
    if (!sessionId || !ImouNative) return;
    try { await ImouNative.setMuted(sessionId, next); } catch {}
  };
  const doPtz = async (h: number, v: number) => {
    if (!ImouNative || !activeDeviceId) return;
    try { await ImouNative.ptzMove(activeDeviceId, { h, v, zoom: 0, durationMs: 400 }); }
    catch (e: any) { Alert.alert("Lỗi", e?.message || "Không điều khiển được"); }
  };
  const doPtzReset = async () => {
    if (!ImouNative || !activeDeviceId) return;
    try { await ImouNative.ptzReset(activeDeviceId); }
    catch (e: any) { Alert.alert("Lỗi", e?.message || "Reset thất bại"); }
  };
  const doZoom = async (delta: number) => {
    if (!ImouNative || !activeDeviceId || !ptzCap?.zoom) return;
    try {
      const cur: number = await ImouNative.getZoomLevel(activeDeviceId);
      const next = Math.min(1, Math.max(0, cur + delta));
      await ImouNative.setZoomLevel(activeDeviceId, { level: next });
      setZoomPct(Math.round(next * 100));
    } catch (e: any) { Alert.alert("Lỗi", e?.message || "Zoom thất bại"); }
  };
  const doSnapshot = async () => {
    if (!ImouNative || !activeDeviceId) return;
    try {
      const res: any = await ImouNative.snapshot(activeDeviceId, { saveToGallery: true });
      Alert.alert("Chụp ảnh", res?.savedToGallery ? "Đã lưu ảnh vào Photos" : "Đã chụp ảnh");
    } catch (e: any) { Alert.alert("Lỗi", e?.message || "Không chụp được"); }
  };
  const doRecord = async () => {
    if (!ImouNative || !sessionId) return;
    try {
      if (!recording) {
        await ImouNative.startRecording(sessionId);
        setRecording(true);
      } else {
        const res: any = await ImouNative.stopRecording(sessionId, { saveToGallery: true });
        setRecording(false);
        Alert.alert("Ghi hình", res?.savedToGallery ? "Đã lưu clip vào Photos" : "Đã ghi xong");
      }
    } catch (e: any) { setRecording(false); Alert.alert("Lỗi", e?.message || "Lỗi ghi hình"); }
  };

  if (!ImouNative || !VideoView) {
    return (
      <SafeAreaView style={[styles.errRoot, { backgroundColor: C.bg }]}>
        <StatusBar barStyle="light-content" />
        <Ionicons name="alert-circle" size={48} color={C.warning} />
        <Text style={{ color: C.text, fontWeight: "800", fontSize: 16 }}>Module camera chưa build</Text>
        <Text style={{ color: C.sub, fontSize: 13, textAlign: "center" }}>
          `imou-rn-native` chưa được link vào bản build này. Cần rebuild qua Xcode.
        </Text>
        <TouchableOpacity onPress={() => router.back()} style={[styles.errBtn, { backgroundColor: C.accent }]}>
          <Text style={{ color: C.onAccent, fontWeight: "800" }}>Quay lại</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="light-content" />

      <TouchableOpacity activeOpacity={1} onPress={() => setShowControls((v) => !v)} style={styles.videoWrap}>
        {sessionId ? (
          <VideoView sessionId={sessionId} resizeMode="contain" style={StyleSheet.absoluteFillObject}
            onError={(e: any) => {
              const msg = String(e?.code || "") + " " + String(e?.message || "");
              if (/closed|reconnect|network|disconnect|timeout|io\(/i.test(msg)) {
                if (retryTimerRef.current) return;
                setRetryCount((n) => {
                  if (n >= MAX_RETRIES) {
                    setStatus("error"); setErrorMsg(`Kết nối lỗi sau ${MAX_RETRIES} lần thử.`);
                    return n;
                  }
                  const delay = 1000 * Math.pow(2, n);
                  retryTimerRef.current = setTimeout(() => {
                    retryTimerRef.current = null;
                    setStatus("starting"); setRestartKey((k) => k + 1);
                  }, delay);
                  return n + 1;
                });
              } else {
                setStatus("error"); setErrorMsg(e?.message || "Player lỗi");
              }
            }}
          />
        ) : null}

        {(status === "starting" || status === "idle") && (
          <View style={styles.overlayCenter}>
            <ActivityIndicator color="#fff" size="large" />
            <Text style={styles.overlayText}>Đang mở stream…</Text>
          </View>
        )}
        {status === "error" && (
          <View style={styles.overlayCenter}>
            <Ionicons name="warning" size={40} color={C.warning} />
            <Text style={styles.overlayText}>{errorMsg}</Text>
            <TouchableOpacity onPress={() => { setRetryCount(0); setRestartKey((k) => k + 1); }} style={[styles.retryBtn, { backgroundColor: C.accent }]}>
              <Text style={{ color: C.onAccent, fontWeight: "800" }}>Thử lại</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>

      {/* Top bar */}
      {showControls && (
        <SafeAreaView edges={["top"]} style={styles.topBar} pointerEvents="box-none">
          <View style={styles.topRow}>
            <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.iconBtnDark}>
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.topTitle} numberOfLines={1}>{activeCam?.courtName || "Live"}</Text>
              <Text style={styles.topSub} numberOfLines={1}>📷 {activeCam?.camName}</Text>
            </View>
            <TouchableOpacity
              onPress={() => router.push({
                pathname: "/owner/venue/[id]/imou-playback-list" as any,
                params: { id, deviceId: activeDeviceId },
              })}
              hitSlop={12}
              style={styles.iconBtnDark}
            >
              <Ionicons name="film-outline" size={20} color="#fff" />
            </TouchableOpacity>
            {status === "live" && (
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveBadgeText}>LIVE</Text>
              </View>
            )}
          </View>
        </SafeAreaView>
      )}

      {/* Bottom controls */}
      {showControls && (
        <SafeAreaView edges={["bottom"]} style={styles.bottomBar} pointerEvents="box-none">
          <View style={styles.rowInline}>
            <TouchableOpacity onPress={() => setQuality(quality === "hd" ? "sd" : "hd")} style={styles.chipDark}>
              <Ionicons name={quality === "hd" ? "sparkles" : "flash-outline"} size={14} color="#fff" />
              <Text style={styles.chipDarkText}>{quality === "hd" ? "HD" : "SD tiết kiệm"}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => doMute(!muted)} style={styles.chipDark}>
              <Ionicons name={muted ? "volume-mute" : "volume-high"} size={14} color="#fff" />
              <Text style={styles.chipDarkText}>{muted ? "Tắt tiếng" : "Bật tiếng"}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.actionRow}>
            <ActionBtn icon="camera" label="Chụp" onPress={doSnapshot} />
            <ActionBtn
              icon={recording ? "square" : "radio-button-on"}
              iconColor={recording ? "#fff" : "#EF4444"}
              bg={recording ? "#DC2626" : "rgba(255,255,255,0.15)"}
              label={recording ? "Dừng ghi" : "Ghi hình"}
              onPress={doRecord}
              disabled={status !== "live"}
            />
            {ptzCap?.zoom && (
              <>
                <ActionBtn icon="remove" label="Zoom−" onPress={() => doZoom(-0.1)} />
                <ActionBtn icon="add" label="Zoom+" onPress={() => doZoom(0.1)} />
              </>
            )}
          </View>

          {ptzCap && ptzCap.move !== "none" && (
            <View style={styles.dpadWrap}>
              <View style={styles.dpadRow}>
                <View style={styles.dpadSpace} />
                <DpadBtn icon="chevron-up" onPress={() => doPtz(0, 0.6)} />
                <View style={styles.dpadSpace} />
              </View>
              <View style={styles.dpadRow}>
                <DpadBtn icon="chevron-back" onPress={() => doPtz(-0.6, 0)} />
                <TouchableOpacity onPress={doPtzReset} style={styles.dpadCenter}>
                  <Ionicons name="scan" size={20} color="#fff" />
                </TouchableOpacity>
                <DpadBtn icon="chevron-forward" onPress={() => doPtz(0.6, 0)} />
              </View>
              <View style={styles.dpadRow}>
                <View style={styles.dpadSpace} />
                <DpadBtn icon="chevron-down" onPress={() => doPtz(0, -0.6)} />
                <View style={styles.dpadSpace} />
              </View>
              {zoomPct != null && (
                <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, marginTop: 4 }}>Zoom {zoomPct}%</Text>
              )}
            </View>
          )}

          {cams.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
              {cams.map((c) => {
                const on = c.deviceId === activeDeviceId;
                return (
                  <TouchableOpacity
                    key={c.key}
                    onPress={() => { setRetryCount(0); setActiveDeviceId(c.deviceId); }}
                    style={[styles.switcherChip, on && styles.switcherChipActive]}
                  >
                    <Ionicons name="videocam" size={12} color={on ? "#0F172A" : "#fff"} />
                    <Text style={[styles.switcherText, on && { color: "#0F172A" }]} numberOfLines={1}>
                      {c.courtName} · {c.camName}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </SafeAreaView>
      )}
    </View>
  );
}

function ActionBtn({ icon, label, onPress, disabled, iconColor = "#fff", bg }: any) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.6}
      style={[styles.actionBtn, bg ? { backgroundColor: bg } : null, disabled && { opacity: 0.4 }]}>
      <Ionicons name={icon} size={22} color={iconColor} />
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}
function DpadBtn({ icon, onPress }: any) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.6} style={styles.dpadBtn}>
      <Ionicons name={icon} size={28} color="#fff" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  videoWrap: { flex: 1, backgroundColor: "#000", position: "relative" },
  overlayCenter: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "rgba(0,0,0,0.4)" },
  overlayText: { color: "#fff", fontSize: 13 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999, marginTop: 8 },
  topBar: { position: "absolute", top: 0, left: 0, right: 0 },
  topRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: "rgba(0,0,0,0.35)" },
  topTitle: { color: "#fff", fontWeight: "800", fontSize: 15 },
  topSub: { color: "rgba(255,255,255,0.75)", fontSize: 11, marginTop: 1 },
  iconBtnDark: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.15)" },
  liveBadge: { flexDirection: "row", gap: 5, alignItems: "center", backgroundColor: "rgba(220,38,38,0.9)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" },
  liveBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  bottomBar: { position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 8, backgroundColor: "rgba(0,0,0,0.4)", gap: 10 },
  rowInline: { flexDirection: "row", gap: 8 },
  chipDark: { flexDirection: "row", gap: 5, alignItems: "center", backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  chipDarkText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  actionRow: { flexDirection: "row", justifyContent: "space-around", gap: 8 },
  actionBtn: { flex: 1, alignItems: "center", gap: 4, paddingVertical: 10, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.15)" },
  actionLabel: { color: "#fff", fontSize: 11, fontWeight: "800" },
  dpadWrap: { alignItems: "center", gap: 4, marginTop: 4 },
  dpadRow: { flexDirection: "row", gap: 4 },
  dpadBtn: { width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.15)" },
  dpadSpace: { width: 48, height: 48 },
  dpadCenter: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
  switcherChip: { flexDirection: "row", gap: 4, alignItems: "center", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.15)", maxWidth: 190 },
  switcherChipActive: { backgroundColor: "#fff" },
  switcherText: { color: "#fff", fontSize: 11, fontWeight: "800", maxWidth: 160 },
  errRoot: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 8 },
  errBtn: { marginTop: 12, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999 },
});
