// LiveLikeFBScreenKey.tsx (React Native / Expo)
// AUTO-LIVE (Assigned → LIVE) — poll court → tự start stream
// Thêm HTML Overlay (giống OBS) qua URL, có retry an toàn, không chặn luồng live

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  Platform,
  PermissionsAndroid,
  ViewStyle,
  NativeModules,
  AppState,
  AppStateStatus,
  ActivityIndicator,
} from "react-native";
import { requireNativeComponent, UIManager } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons as Icon } from "@expo/vector-icons";
import { PinchGestureHandler, State } from "react-native-gesture-handler";
import { Audio } from "expo-av";
import * as Haptics from "expo-haptics";

/* ====== SFX ====== */
import torch_on from "@/assets/sfx/click4.mp3";
import torch_off from "@/assets/sfx/click4.mp3";
import mic_on from "@/assets/sfx/click4.mp3";
import mic_off from "@/assets/sfx/click4.mp3";

/* ====== RTK Query: giống web ====== */
import {
  useGetCurrentMatchByCourtQuery,
  useCreateLiveSessionMutation,
  useNotifyStreamStartedMutation,
  useNotifyStreamEndedMutation,
} from "@/slices/liveStreamingApiSlice";

/* ====== Native camera/rtmp ====== */
const COMPONENT_NAME = "RtmpPreviewView";
(UIManager as any).getViewManagerConfig?.(COMPONENT_NAME);
const _CachedRtmpPreviewView =
  (global as any).__RtmpPreviewView ||
  requireNativeComponent<{}>(COMPONENT_NAME);
(global as any).__RtmpPreviewView = _CachedRtmpPreviewView;
const RtmpPreviewView = _CachedRtmpPreviewView;
const Live = (NativeModules as any).FacebookLiveModule;

// ==== DEBUG helpers ====
const LOG = true;
const log = (...args: any[]) =>
  LOG && console.log("[LiveLikeFB]", new Date().toISOString(), ...args);

const maskUrl = (u?: string | null) => {
  if (!u) return u;
  try {
    const trimmed = u.replace(/\/$/, "");
    const idx = trimmed.lastIndexOf("/");
    if (idx < 0) return u;
    const head = trimmed.slice(0, idx + 1);
    const key = trimmed.slice(idx + 1);
    const tail = key.slice(-6);
    return `${head}****${tail}`;
  } catch {
    return u;
  }
};

/* ====== Types ====== */
type Mode = "idle" | "live" | "stopping" | "ended";
type Dest = {
  platform?: string;
  server_url?: string;
  stream_key?: string;
  secure_stream_url?: string;
};

type Props = {
  tournamentHref?: string;
  homeHref?: string;
  onFinishedGoToTournament?: () => void;
  onFinishedGoHome?: () => void;

  tid: string; // giữ cho navigate nếu cần
  bid: string; // giữ cho navigate nếu cần
  courtId: string;

  autoOnLive?: boolean; // default: true (Assigned → LIVE)
};

/* ====== HTML Overlay (giống OBS) ====== */
const OVERLAY_BASE = process.env.EXPO_PUBLIC_API_URL; // <— chỉnh host của bạn

const buildOverlayUrl = (matchId?: string | null) =>
  matchId
    ? `${OVERLAY_BASE}/overlay/score?matchId=${matchId}&theme=dark&size=md&showSets=0`
    : null;

/* ====== Utils ====== */
const SFX = {
  torchOn: torch_on,
  torchOff: torch_off,
  micOn: mic_on,
  micOff: mic_off,
} as const;
type SfxKey = keyof typeof SFX;
const SFX_VOLUME = 1;

function useSfx() {
  const soundsRef = useRef<Record<SfxKey, Audio.Sound | null>>({
    torchOn: null,
    torchOff: null,
    micOn: null,
    micOff: null,
  });
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          allowsRecordingIOS: true,
          interruptionModeIOS: Audio.INTERRUPTION_MODE_IOS_MIX_WITH_OTHERS,
          interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DUCK_OTHERS,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
          staysActiveInBackground: false,
        });
        for (const key of Object.keys(SFX) as SfxKey[]) {
          const { sound } = await Audio.Sound.createAsync(SFX[key], {
            volume: SFX_VOLUME,
            isLooping: false,
            shouldPlay: false,
          });
          if (mounted) soundsRef.current[key] = sound;
          else await sound.unloadAsync();
        }
      } catch {}
    })();
    return () => {
      mounted = false;
      (async () => {
        for (const key of Object.keys(SFX) as SfxKey[]) {
          try {
            await soundsRef.current[key]?.unloadAsync();
          } catch {}
          soundsRef.current[key] = null;
        }
      })();
    };
  }, []);
  const play = useCallback(async (key: SfxKey) => {
    const s = soundsRef.current[key];
    if (!s) return;
    try {
      await s.setVolumeAsync(SFX_VOLUME ?? 0.3);
      await s.setPositionAsync(0);
      await s.playAsync();
    } catch {
      try {
        await s.stopAsync();
        await s.playAsync();
      } catch {}
    }
  }, []);
  return play;
}

async function ensurePermissions() {
  if (Platform.OS !== "android") return true;
  const res = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.CAMERA,
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
  ]);
  return Object.values(res).every(
    (v) => v === PermissionsAndroid.RESULTS.GRANTED
  );
}

/** Rút destinations giống web: từ liveData.platforms/primary/destinations */
const normalizeDestinationsFromLiveData = (liveData: any): Dest[] => {
  const outs: Dest[] = [];
  try {
    const p = liveData?.platforms || {};
    const primary = liveData?.primary || {};

    // Facebook
    if (p?.facebook?.live?.server_url || p?.facebook?.live?.stream_key) {
      outs.push({
        platform: "facebook",
        server_url: p.facebook.live.server_url,
        stream_key: p.facebook.live.stream_key,
        secure_stream_url: p.facebook.live.secure_stream_url,
      });
    }
    if (primary?.platform === "facebook") {
      outs.push({
        platform: "facebook",
        server_url: primary.server_url,
        stream_key: primary.stream_key,
        secure_stream_url: primary.secure_stream_url,
      });
    }

    // YouTube
    if (p?.youtube?.live?.server_url || p?.youtube?.live?.stream_key) {
      outs.push({
        platform: "youtube",
        server_url: p.youtube.live.server_url,
        stream_key: p.youtube.live.stream_key,
        secure_stream_url: p.youtube.live.secure_stream_url,
      });
    }
    if (primary?.platform === "youtube") {
      outs.push({
        platform: "youtube",
        server_url: primary.server_url,
        stream_key: primary.stream_key,
        secure_stream_url: primary.secure_stream_url,
      });
    }

    // TikTok
    if (p?.tiktok?.live?.server_url || p?.tiktok?.live?.stream_key) {
      outs.push({
        platform: "tiktok",
        server_url: p.tiktok.live.server_url,
        stream_key: p.tiktok.live.stream_key,
        secure_stream_url: p.tiktok.live.secure_stream_url,
      });
    }

    // Fallback: destinations[]
    if (Array.isArray(liveData?.destinations)) {
      for (const d of liveData.destinations) {
        outs.push({
          platform: String(d?.platform || "").toLowerCase() || undefined,
          server_url: d?.server_url,
          stream_key: d?.stream_key,
          secure_stream_url: d?.secure_stream_url,
        });
      }
    }
  } catch (e) {
    console.warn("normalizeDestinationsFromLiveData error", e);
  }

  // Chuẩn hoá secure_stream_url → (server_url, stream_key)
  return outs
    .map((d) => {
      let {
        platform,
        server_url = "",
        stream_key = "",
        secure_stream_url = "",
      } = d || {};
      if ((!server_url || !stream_key) && secure_stream_url) {
        const trimmed = secure_stream_url.replace(/\/$/, "");
        const idx = trimmed.lastIndexOf("/");
        if (idx >= 0) {
          server_url ||= trimmed.slice(0, idx);
          stream_key ||= trimmed.slice(idx + 1);
        }
      }
      return { platform, server_url, stream_key, secure_stream_url };
    })
    .filter((x) => x.server_url && x.stream_key);
};

const pickStreamUrl = (dests: Dest[]): string | null => {
  if (!dests?.length) return null;
  const order = ["facebook", "youtube", "tiktok"];
  const chosen =
    dests.find((d) => order.includes(String(d.platform))) || dests[0];
  if (!chosen) return null;
  if (chosen.secure_stream_url) return chosen.secure_stream_url;
  const base = chosen.server_url!.endsWith("/")
    ? chosen.server_url!.slice(0, -1)
    : chosen.server_url!;
  return `${base}/${chosen.stream_key!}`;
};

/* ====== Small UI piece ====== */
function DottedCircleProgress({
  progress,
  size = 140,
  dotSize = 8,
  count = 30,
  color = "#fff",
  trackColor = "rgba(255,255,255,0.2)",
}: {
  progress: number;
  size?: number;
  dotSize?: number;
  count?: number;
  color?: string;
  trackColor?: string;
}) {
  const N = Math.max(6, count);
  const R = size / 2 - dotSize - 2;
  const lit = Math.round(Math.max(0, Math.min(1, progress)) * N);
  return (
    <View style={{ width: size, height: size }}>
      {Array.from({ length: N }).map((_, i) => {
        const t = (i / N) * Math.PI * 2 - Math.PI / 2;
        const cx = size / 2 + R * Math.cos(t) - dotSize / 2;
        const cy = size / 2 + R * Math.sin(t) - dotSize / 2;
        const on = i < lit;
        return (
          <View
            key={i}
            style={{
              position: "absolute",
              left: cx,
              top: cy,
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
              backgroundColor: on ? color : trackColor,
            }}
          />
        );
      })}
    </View>
  );
}

/* ================================================================================== */

export default function LiveLikeFBScreenKey({
  tournamentHref,
  homeHref,
  onFinishedGoToTournament,
  onFinishedGoHome,
  tid,
  bid,
  courtId,
  autoOnLive = true,
}: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const playSfx = useSfx();

  /* ==== Modes & UI ==== */
  const [mode, setMode] = useState<Mode>("idle");
  const [statusText, setStatusText] = useState<string>(
    "Đang chờ trận được gán (assigned) vào sân…"
  );
  const [torchOn, setTorchOn] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  /* ==== Overlay ==== */
  const [showScoreOverlay, setShowScoreOverlay] = useState(true);
  const overlaySupportedRef = useRef<boolean>(false);

  /* ==== Streaming refs ==== */
  const startedPreviewRef = useRef(false);
  const lastUrlRef = useRef<string | null>(null);
  const currentMatchRef = useRef<string | null>(null);
  const shouldResumeLiveRef = useRef(false);
  const switchingRef = useRef(false);
  const previewRetryRef = useRef<{ cancel: boolean }>({ cancel: false });

  /* ==== Zoom (UI & throttle) ==== */
  const clampZoomUI = (z: number) => Math.min(2, Math.max(0.5, z));
  const zoomUIRef = useRef(1);
  const [zoomUI, setZoomUI] = useState(1);
  const pinchBaseRef = useRef(1);
  const rafIdRef = useRef<number | null>(null);
  const pendingZoomRef = useRef<number | null>(null);
  const lastSentZoomRef = useRef(1);
  const isFrontRef = useRef(false);

  const sendZoomRAF = useCallback((z: number) => {
    pendingZoomRef.current = z;
    if (rafIdRef.current != null) return;
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      const v = pendingZoomRef.current;
      pendingZoomRef.current = null;
      if (v != null && v !== lastSentZoomRef.current) {
        Live.setZoom?.(v);
        lastSentZoomRef.current = v;
      }
    });
  }, []);

  /* ==== Insets & timer ==== */
  const IOS_BUMP = 100;
  const bottomBump =
    Platform.OS === "ios" ? insets.bottom + IOS_BUMP : 16 + insets.bottom;

  useEffect(() => {
    let t: ReturnType<typeof setInterval> | null = null;
    if (mode === "live" || mode === "stopping") {
      t = setInterval(() => setElapsed((s) => s + 1), 1000);
    } else {
      setElapsed(0);
    }
    return () => t && clearInterval(t);
  }, [mode]);

  /* ==== Preview bootstrap (FIX surface invalid) ==== */
  const startPreviewWithRetry = useCallback(async () => {
    if (startedPreviewRef.current) return true;
    const okPerm = await ensurePermissions();
    if (!okPerm) {
      Alert.alert("Thiếu quyền", "Cần cấp quyền Camera & Micro để livestream.");
      return false;
    }

    let attempts = 0;
    const maxAttempts = 20; // ~3s với delay 150ms
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
    previewRetryRef.current.cancel = false;

    while (
      !previewRetryRef.current.cancel &&
      !startedPreviewRef.current &&
      attempts < maxAttempts
    ) {
      try {
        await Live.enableAutoRotate?.(true);
        await Live.startPreview?.();
        zoomUIRef.current = 1;
        setZoomUI(1);
        lastSentZoomRef.current = 1;
        Live.setZoom?.(1);
        startedPreviewRef.current = true;
        log("preview → started");
        return true;
      } catch (e: any) {
        const msg = String(e?.message || e);
        if (/surface/i.test(msg) || /invalid|illegalargument/i.test(msg)) {
          await delay(150);
        } else {
          await delay(120);
        }
      }
      attempts += 1;
    }
    log("preview → not started (retry exhausted/cancelled)");
    return startedPreviewRef.current;
  }, []);

  const kickPreview = useCallback(async () => {
    if (startedPreviewRef.current) return;
    await startPreviewWithRetry();
  }, [startPreviewWithRetry]);

  // Unmount cleanup
  useEffect(() => {
    return () => {
      previewRetryRef.current.cancel = true;
      (async () => {
        try {
          await Live.enableAutoRotate?.(false);
          if (startedPreviewRef.current) {
            await Live.stopPreview?.();
            startedPreviewRef.current = false;
          }
          // Ẩn overlay khi unmount để giải phóng
          await Live.setOverlayVisible?.(false);
        } catch {}
      })();
    };
  }, []);

  // Focus/blur → giữ camera ổn định khi back/forward
  useFocusEffect(
    useCallback(() => {
      previewRetryRef.current.cancel = false;
      kickPreview();
      return () => {
        previewRetryRef.current.cancel = true;
        (async () => {
          try {
            if (mode === "live" || mode === "stopping")
              shouldResumeLiveRef.current = true;
            if (startedPreviewRef.current) {
              await Live.stopPreview?.();
              startedPreviewRef.current = false;
            }
          } catch {}
        })();
      };
    }, [kickPreview, mode])
  );

  /* ==== Apply HTML Overlay an toàn (retry) ==== */
  const applyHtmlOverlay = useCallback(
    async (mid: string | null) => {
      const overlayUrl = buildOverlayUrl(mid || undefined);
      // Kiểm tra khả năng overlay mới
      overlaySupportedRef.current =
        !!Live?.setOverlayUrl &&
        !!Live?.setOverlayRelWidth &&
        !!Live?.setOverlayPosition &&
        !!Live?.setOverlayVisible;

      if (!overlayUrl || !overlaySupportedRef.current) {
        log("overlay not supported or empty url — skip");
        return;
      }

      const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

      // Thêm anchor nếu native có
      try {
        await Live.setOverlayAnchor?.("topLeft"); // optional
      } catch {}

      // Đợi GL/WebView ổn định một nhịp
      await delay(500);

      const MAX_TRIES = 6;
      for (let i = 0; i < MAX_TRIES; i++) {
        try {
          //   await Live.setOverlayUrl(overlayUrl);
          await Live.setOverlayRelWidth(0.2); // 20% bề rộng video
          // Nếu gốc toạ độ top-left: (0.05, 0.08) = lệch 5% từ trái, 8% từ trên
          // Nếu gốc bottom-left thì tuỳ native sẽ map nội bộ
          await Live.setOverlayPosition(0.05, 0.08);
          await Live.setOverlayFps?.(10); // 5–10fps nhẹ mà mượt
          await Live.setOverlayVisible(!!showScoreOverlay);
          log("overlay applied (try", i + 1, ")", overlayUrl);
          return;
        } catch (e) {
          log("overlay apply failed (try", i + 1, ")", e);
          await delay(350);
        }
      }
      // Không throw — overlay fail vẫn live bình thường
    },
    [showScoreOverlay]
  );

  // AppState: resume preview & stream + re-apply overlay nếu cần
  useEffect(() => {
    const handler = async (nextState: AppStateStatus) => {
      if (nextState === "active") {
        previewRetryRef.current.cancel = false;
        if (!startedPreviewRef.current) await startPreviewWithRetry();
        if (shouldResumeLiveRef.current && lastUrlRef.current) {
          try {
            log("resume → start", maskUrl(lastUrlRef.current));
            await startNative(lastUrlRef.current);
            setMode("live");

            // Re-apply HTML overlay (không chặn, có retry)
            applyHtmlOverlay(currentMatchRef.current);

            // Fallback overlay cũ nếu cần
            if (!overlaySupportedRef.current && showScoreOverlay) {
              try {
                await Live.setScoreVisible?.(true);
              } catch {}
            }
          } catch (e) {
            log("resume → failed", e);
          }
          shouldResumeLiveRef.current = false;
        }
      } else {
        previewRetryRef.current.cancel = true;
        if (mode === "live" || mode === "stopping")
          shouldResumeLiveRef.current = true;
        try {
          if (startedPreviewRef.current) {
            await Live.stopPreview?.();
            startedPreviewRef.current = false;
          }
        } catch {}
      }
    };
    const sub = AppState.addEventListener("change", handler);
    return () => sub.remove();
  }, [mode, startPreviewWithRetry, applyHtmlOverlay, showScoreOverlay]);

  /* ==== Native start/stop ==== */
  const startNative = useCallback(async (url: string) => {
    log("Live.start", { url: maskUrl(url) });
    try {
      await Live.start(url, 3_800_000, 1280, 720, 30); // 720p30, ~3.8Mbps
    } catch (error) {
      console.error("Live start error:", error);
      Alert.alert("Lỗi", "Không thể bắt đầu live: " + error.message);
      return;
    }
    log("Live.start → OK");
  }, []);
  const stopNativeNow = useCallback(async () => {
    log("Live.stop → begin");
    try {
      await Live.setOverlayVisible?.(false); // ẩn overlay HTML nếu có
    } catch {}
    try {
      await Live.stop();
    } catch (e) {
      log("Live.stop error", e);
    }
    try {
      await Live.stopPreview?.();
      startedPreviewRef.current = false;
    } catch (e) {
      log("Live.stopPreview error", e);
    }
    setTorchOn(false);
    setMicMuted(false);
    setElapsed(0);
    setStatusText("Đang chờ trận được gán (assigned) vào sân…");
    zoomUIRef.current = 1;
    setZoomUI(1);
    lastSentZoomRef.current = 1;
    lastUrlRef.current = null;
    log("Live.stop → done");
  }, []);

  /* ===================== RTK Query: poll court by courtId ===================== */
  const [isFocused, setIsFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, [])
  );
  const [appActive, setAppActive] = useState(true);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) =>
      setAppActive(s === "active")
    );
    return () => sub.remove();
  }, []);
  const shouldPoll = isFocused && appActive && !!courtId;

  const {
    data: courtData,
    isFetching: courtsFetching,
    isLoading: courtsLoading,
    error: courtsError,
  } = useGetCurrentMatchByCourtQuery(courtId, {
    skip: !shouldPoll,
    pollingInterval: shouldPoll ? 5000 : 0,
    refetchOnMountOrArgChange: true,
  });

  useEffect(() => {
    log("poll-config", { shouldPoll, courtId });
  }, [shouldPoll, courtId]);

  useEffect(() => {
    if (!shouldPoll) return;
    if (courtsError) {
      log("court error", courtsError);
      return;
    }
    if (courtsLoading) {
      log("court loading…");
      return;
    }
    if (courtsFetching) log("court fetching…");

    const court = courtData?.court;
    const cm = courtData?.match || null;
    log("court ok", {
      court: court?.name,
      currentMatchId: cm?._id || null,
    });
  }, [courtData, courtsFetching, courtsLoading, courtsError, shouldPoll]);

  const currentMatchId: string | null = courtData?.match?._id || null;

  /* ==== Extract score from match data (fallback overlay cũ) ==== */
  const extractScore = useCallback((match: any): string | null => {
    if (!match) return null;

    if (
      typeof match.homeScore === "number" &&
      typeof match.awayScore === "number"
    ) {
      return `${match.homeScore} - ${match.awayScore}`;
    }

    if (
      typeof match.team1Score === "number" &&
      typeof match.team2Score === "number"
    ) {
      return `${match.team1Score} - ${match.team2Score}`;
    }

    if (
      match?.score &&
      typeof match.score.home === "number" &&
      typeof match.score.away === "number"
    ) {
      return `${match.score.home} - ${match.score.away}`;
    }

    if (
      match?.homeTeam?.score !== undefined &&
      match?.awayTeam?.score !== undefined
    ) {
      return `${match.homeTeam.score} - ${match.awayTeam.score}`;
    }

    if (Array.isArray(match?.teams) && match.teams.length >= 2) {
      const s1 = match.teams[0]?.score;
      const s2 = match.teams[1]?.score;
      if (s1 !== undefined && s2 !== undefined) {
        return `${s1} - ${s2}`;
      }
    }

    return "0 - 0";
  }, []);

  const currentScore = useMemo(() => {
    return extractScore(courtData?.match);
  }, [courtData?.match, extractScore]);

  /* ==== Update overlay khi state đổi ==== */
  // 1) Toggle show/hide overlay
  const toggleScoreOverlay = useCallback(async () => {
    try {
      const next = !showScoreOverlay;
      setShowScoreOverlay(next);

      // Ưu tiên overlay HTML
      if (overlaySupportedRef.current) {
        await Live.setOverlayVisible?.(next);
        return;
      }

      // Fallback overlay cũ
      await Live.setScoreVisible?.(next);
      if (next && currentScore) {
        await Live.updateScore?.(currentScore);
      }
    } catch (e) {
      log("toggle overlay visible failed", e);
    }
  }, [showScoreOverlay, currentScore]);

  // 2) Khi điểm đổi (chỉ dùng cho fallback overlay cũ)
  useEffect(() => {
    const run = async () => {
      if (overlaySupportedRef.current) return; // dùng HTML overlay rồi
      if (!showScoreOverlay) {
        try {
          await Live.setScoreVisible?.(false);
        } catch {}
        return;
      }
      if (mode === "live" && currentScore) {
        try {
          await Live.updateScore?.(currentScore);
          await Live.setScoreVisible?.(true);
        } catch (e) {
          log("updateScore overlay (fallback) failed", e);
        }
      }
    };
    run();
  }, [mode, currentScore, showScoreOverlay]);

  /* ===================== create live session (idempotent) ===================== */
  const [createLiveSession] = useCreateLiveSessionMutation();
  const [notifyStreamStarted] = useNotifyStreamStartedMutation();
  const [notifyStreamEnded] = useNotifyStreamEndedMutation();

  const ensureOutputsForMatch = useCallback(
    async (mid: string): Promise<string | null> => {
      setStatusText("⚙️ Đang tạo live session…");
      try {
        const res =
          (await (createLiveSession as any)({ matchId: mid }).unwrap?.()) ??
          (await (createLiveSession as any)({ matchId: mid }).unwrap());
        const dests = normalizeDestinationsFromLiveData(res);
        const url = pickStreamUrl(dests);
        log("ensureOutputsForMatch → url", { matchId: mid, url: maskUrl(url) });
        return url;
      } catch (e) {
        log("createLiveSession → FAILED", e);
        return null;
      }
    },
    [createLiveSession]
  );

  const startForMatch = useCallback(
    async (mid: string) => {
      setStatusText("Sân đã có trận (assigned) — chuẩn bị phát…");
      const url = await ensureOutputsForMatch(mid);
      if (!url) {
        setStatusText("❌ Backend chưa trả outputs cho trận này.");
        Alert.alert("Không thể phát", "Chưa có RTMPS URL từ server.");
        return false;
      }
      try {
        await Haptics.selectionAsync();
        await startNative(url);

        lastUrlRef.current = url;
        currentMatchRef.current = mid;
        setMode("live");
        setStatusText("Đang LIVE…");

        // Áp HTML overlay (retry, không chặn)
        applyHtmlOverlay(mid);

        // Fallback overlay cũ nếu chưa hỗ trợ overlay HTML
        if (!overlaySupportedRef.current && showScoreOverlay && currentScore) {
          try {
            await Live.updateScore?.(currentScore);
            await Live.setScoreVisible?.(true);
          } catch {}
        }

        try {
          await (notifyStreamStarted as any)({
            matchId: mid,
            platform: "all",
          }).unwrap?.();
        } catch {}

        log("startForMatch → LIVE", { matchId: mid });
        return true;
      } catch (e: any) {
        setStatusText("❌ Không thể bắt đầu phát");
        Alert.alert("Không thể phát", e?.message || String(e));
        log("startForMatch → FAILED", e);
        return false;
      }
    },
    [
      ensureOutputsForMatch,
      startNative,
      notifyStreamStarted,
      applyHtmlOverlay,
      showScoreOverlay,
      currentScore,
    ]
  );

  // Auto: chỉ cần có currentMatch → phát (switch nếu khác)
  const lastAutoStartedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!autoOnLive || !courtId) return;

    // 1) Không còn trận assigned → dừng nếu đang phát
    if (!currentMatchId) {
      if (mode === "live" || mode === "stopping") {
        (async () => {
          setStatusText("🔔 Không còn trận được gán — dừng phát…");
          try {
            await (notifyStreamEnded as any)({
              matchId: currentMatchRef.current,
              platform: "all",
            }).unwrap?.();
          } catch {}
          await stopNativeNow();
          setMode("ended");
        })();
      } else {
        setStatusText("Đang chờ trận được gán (assigned) vào sân…");
      }
      currentMatchRef.current = null;
      lastAutoStartedForRef.current = null;
      return;
    }

    // 2) Có trận mới được assign → chuyển/khởi động
    if (
      lastAutoStartedForRef.current !== currentMatchId &&
      !switchingRef.current
    ) {
      switchingRef.current = true;
      (async () => {
        try {
          if (mode === "live" || mode === "stopping") {
            log("auto(assign): switching match → stop current then start", {
              prev: lastAutoStartedForRef.current,
              next: currentMatchId,
            });
            try {
              await (notifyStreamEnded as any)({
                matchId: currentMatchRef.current,
                platform: "all",
              }).unwrap?.();
            } catch {}
            await stopNativeNow();
            setMode("idle");
          } else {
            log("auto(assign): start new match", { next: currentMatchId });
          }
          const ok = await startForMatch(currentMatchId);
          if (ok) lastAutoStartedForRef.current = currentMatchId;
        } finally {
          switchingRef.current = false;
        }
      })();
    } else {
      if (mode === "live") setStatusText("Đang LIVE…");
    }
  }, [
    autoOnLive,
    courtId,
    currentMatchId,
    mode,
    startForMatch,
    stopNativeNow,
    notifyStreamEnded,
  ]);

  /* ====== Finish flow (manual stop) ====== */
  const STOP_DURATION_MS = 5000;
  const stopIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopDeadlineRef = useRef<number | null>(null);
  const [stopProgress, setStopProgress] = useState(0);
  const clearStopTimer = useCallback(() => {
    if (stopIntervalRef.current) {
      clearInterval(stopIntervalRef.current);
      stopIntervalRef.current = null;
    }
    stopDeadlineRef.current = null;
  }, []);
  const beginFinish = useCallback(async () => {
    await Haptics.selectionAsync();
    setStopProgress(0);
    setMode("stopping");
    stopDeadlineRef.current = Date.now() + STOP_DURATION_MS;
    stopIntervalRef.current = setInterval(async () => {
      const deadline = stopDeadlineRef.current ?? Date.now();
      const remaining = Math.max(0, deadline - Date.now());
      const pct = Math.min(
        1,
        (STOP_DURATION_MS - remaining) / STOP_DURATION_MS
      );
      setStopProgress(pct);
      if (remaining <= 0) {
        clearStopTimer();
        try {
          await (notifyStreamEnded as any)({
            matchId: currentMatchRef.current,
            platform: "all",
          }).unwrap?.();
        } catch {}
        await stopNativeNow();
        setMode("ended");
      }
    }, 50);
  }, [STOP_DURATION_MS, clearStopTimer, stopNativeNow, notifyStreamEnded]);
  const cancelStopping = useCallback(() => {
    clearStopTimer();
    setStopProgress(0);
    setMode("live");
  }, [clearStopTimer]);
  useEffect(() => () => clearStopTimer(), [clearStopTimer]);

  /* ====== Toggles ====== */
  const onSwitch = useCallback(async () => {
    isFrontRef.current = !isFrontRef.current;
    await Live.switchCamera();
    if (isFrontRef.current && zoomUIRef.current < 1) {
      zoomUIRef.current = 1;
      setZoomUI(1);
      lastSentZoomRef.current = 1;
      Live.setZoom?.(1);
    } else {
      Live.setZoom?.(zoomUIRef.current);
    }
    await Haptics.selectionAsync();
  }, []);
  const onToggleTorch = useCallback(async () => {
    const next = !torchOn;
    setTorchOn(next);
    playSfx(next ? "torchOn" : "torchOff");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await Live.toggleTorch(next);
    } catch {
      setTorchOn(!next);
      playSfx(!next ? "torchOn" : "torchOff");
    }
  }, [torchOn, playSfx]);
  const onToggleMic = useCallback(async () => {
    const nextMuted = !micMuted;
    setMicMuted(nextMuted);
    playSfx(nextMuted ? "micOff" : "micOn");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await Live.toggleMic?.(!nextMuted);
    } catch {
      setMicMuted(!nextMuted);
      playSfx(!nextMuted ? "micOff" : "micOn");
    }
  }, [micMuted, playSfx]);

  /* ====== Pinch to zoom (iOS) ====== */
  const onPinchEvent = useCallback(
    (e: any) => {
      if (Platform.OS !== "ios") return;
      const scale = e?.nativeEvent?.scale ?? 1;
      const desired = clampZoomUI(pinchBaseRef.current * scale);
      const stepped = Math.round(desired * 10) / 10;
      if (stepped !== zoomUIRef.current) {
        zoomUIRef.current = stepped;
        setZoomUI(stepped);
        sendZoomRAF(stepped);
      }
    },
    [sendZoomRAF]
  );
  const onPinchStateChange = useCallback((e: any) => {
    if (Platform.OS !== "ios") return;
    const st = e?.nativeEvent?.state;
    if (st === State.BEGAN) {
      pinchBaseRef.current = zoomUIRef.current;
    } else if (st === State.END || st === State.CANCELLED) {
      const stepped = Math.round(zoomUIRef.current * 10) / 10;
      zoomUIRef.current = stepped;
      setZoomUI(stepped);
      Live.setZoom?.(stepped);
      lastSentZoomRef.current = stepped;
    }
  }, []);

  /* ====== UI ====== */
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <View style={{ flex: 1, backgroundColor: "black" }}>
      <PinchGestureHandler
        onGestureEvent={onPinchEvent}
        onHandlerStateChange={onPinchStateChange}
      >
        <View style={{ flex: 1 }}>
          <RtmpPreviewView
            style={styles.preview as ViewStyle}
            collapsable={false}
            onLayout={kickPreview}
          />
        </View>
      </PinchGestureHandler>

      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        {/* TOP ACTIONS */}
        <View style={styles.topButtonsRow} pointerEvents="box-none">
          <Pressable
            onPress={onToggleTorch}
            style={styles.roundBtn}
            hitSlop={10}
          >
            <Icon
              name={torchOn ? "flashlight-off" : "flashlight"}
              size={20}
              color="#fff"
            />
          </Pressable>
          <Pressable onPress={toggleScoreOverlay}>
            <Text style={styles.liveIcon}>
              {showScoreOverlay ? "📊" : "📊🚫"}
            </Text>
          </Pressable>
          <Pressable onPress={onSwitch} style={styles.roundBtn} hitSlop={10}>
            <Icon name="camera-switch" size={20} color="#fff" />
          </Pressable>
          <Pressable onPress={onToggleMic} style={styles.roundBtn} hitSlop={10}>
            <Icon
              name={micMuted ? "microphone-off" : "microphone"}
              size={20}
              color="#fff"
            />
          </Pressable>
        </View>

        {/* Zoom + clock in-live */}
        {(mode === "live" || mode === "stopping") && (
          <>
            <View style={styles.zoomBadge}>
              <Text style={styles.zoomBadgeTxt}>{zoomUI.toFixed(1)}x</Text>
            </View>
            <View style={styles.statusBarRow}>
              <Text style={styles.statusClock}>
                {mm}:{ss}
              </Text>
              <View style={styles.greenDot} />
            </View>
          </>
        )}

        {/* IDLE */}
        {mode === "idle" && (
          <View style={styles.centerOverlay}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.idleText}>{statusText}</Text>
            {!!currentMatchRef.current && (
              <Text style={styles.idleSub}>
                Match: {currentMatchRef.current}
              </Text>
            )}
          </View>
        )}

        {/* LIVE */}
        {mode === "live" && (
          <>
            <View style={styles.liveTopLeft}>
              <View style={styles.livePill}>
                <Text style={styles.livePillTxt}>LIVE</Text>
              </View>
              {/* Nếu muốn hiện điểm ngay trên UI (ngoài overlay) */}
              {currentScore && (
                <View
                  style={[
                    styles.livePill,
                    { marginLeft: 8, backgroundColor: "rgba(0,0,0,0.7)" },
                  ]}
                >
                  <Text style={styles.livePillTxt}>{currentScore}</Text>
                </View>
              )}
            </View>
            <View
              style={[styles.liveBottomBar, { bottom: 14 + insets.bottom }]}
            >
              <Pressable onPress={onSwitch}>
                <Text style={styles.liveIcon}>🔄</Text>
              </Pressable>
              <Pressable onPress={onToggleMic}>
                <Text style={styles.liveIcon}>{micMuted ? "🎤🚫" : "🎤"}</Text>
              </Pressable>
              <Pressable onPress={onToggleTorch}>
                <Text style={styles.liveIcon}>{torchOn ? "⚡️" : "⚡"}</Text>
              </Pressable>
              {Platform.OS !== "ios" && (
                <Pressable style={styles.finishBtn} onPress={beginFinish}>
                  <Text style={styles.finishTxt}>Finish</Text>
                </Pressable>
              )}
            </View>
            {Platform.OS === "ios" && (
              <View style={[styles.goLiveWrap, { bottom: bottomBump }]}>
                <Pressable
                  style={[styles.goLiveBtn, { backgroundColor: "#FF3B30" }]}
                  onPress={beginFinish}
                >
                  <Text style={[styles.goLiveTxt, { fontWeight: "800" }]}>
                    Finish
                  </Text>
                </Pressable>
              </View>
            )}
          </>
        )}

        {/* STOPPING */}
        {mode === "stopping" && (
          <View style={styles.overlay}>
            <Text style={styles.overlayTitle}>Đang kết thúc buổi phát</Text>
            <DottedCircleProgress
              progress={stopProgress}
              size={140}
              dotSize={8}
            />
            <Text style={styles.progressText}>
              Sẽ kết thúc sau {Math.max(0, Math.ceil((1 - stopProgress) * 5))}s
            </Text>
            <Pressable
              style={[styles.cancelBigBtn, { bottom: bottomBump }]}
              onPress={cancelStopping}
            >
              <Text style={styles.cancelBigTxt}>Huỷ</Text>
            </Pressable>
          </View>
        )}

        {/* ENDED */}
        {mode === "ended" && (
          <View style={styles.overlay}>
            <Text style={styles.endedTitle}>
              Đã kết thúc buổi phát trực tiếp
            </Text>
            <View style={[styles.endedBtns, { bottom: bottomBump }]}>
              <Pressable
                style={[styles.endedBtn, { backgroundColor: "#1877F2" }]}
                onPress={() => {
                  if (onFinishedGoToTournament)
                    return onFinishedGoToTournament();
                  router.push(tournamentHref ?? "/tournament");
                }}
              >
                <Text style={styles.endedBtnTxt}>Về trang giải đấu</Text>
              </Pressable>
              <Pressable
                style={[styles.endedBtn, { backgroundColor: "#444" }]}
                onPress={() => {
                  if (onFinishedGoHome) return onFinishedGoHome();
                  router.push(homeHref ?? "/");
                }}
              >
                <Text style={styles.endedBtnTxt}>Về trang chủ</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

/* ====== Styles ====== */
const styles = StyleSheet.create({
  preview: StyleSheet.absoluteFillObject as ViewStyle,

  topButtonsRow: {
    position: "absolute",
    top: 16,
    left: 16,
    right: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    zIndex: 999,
  },
  roundBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
  },

  // Zoom badge
  zoomBadge: {
    position: "absolute",
    top: 16,
    right: 16,
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  zoomBadgeTxt: { color: "#fff", fontWeight: "800", fontSize: 13 },

  statusBarRow: {
    position: "absolute",
    top: 4,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  statusClock: { color: "#fff", fontWeight: "700", fontSize: 14 },
  greenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#17C964",
    marginLeft: 8,
  },

  // IDLE overlay
  centerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  idleText: {
    color: "#fff",
    marginTop: 10,
    fontWeight: "700",
    fontSize: 16,
    textAlign: "center",
  },
  idleSub: { color: "rgba(255,255,255,0.8)", marginTop: 4, fontSize: 12 },

  liveTopLeft: {
    position: "absolute",
    top: 10,
    left: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  livePill: {
    backgroundColor: "#E53935",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  livePillTxt: { color: "#fff", fontWeight: "800", fontSize: 12 },

  liveBottomBar: {
    position: "absolute",
    left: 10,
    right: 10,
    backgroundColor: "rgba(0,0,0,0.75)",
    borderRadius: 10,
    height: 44,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  liveIcon: { color: "#fff", fontSize: 18, marginHorizontal: 8 },

  finishBtn: {
    marginLeft: "auto",
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  finishTxt: { color: "#111", fontWeight: "800" },

  // overlays
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  overlayTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 14,
  },
  progressText: { color: "#fff", marginTop: 12, fontWeight: "600" },

  goLiveWrap: { position: "absolute", left: 16, right: 16 },
  goLiveBtn: {
    height: 46,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  goLiveTxt: { color: "#fff", fontSize: 16, fontWeight: "800" },

  cancelBigBtn: {
    position: "absolute",
    alignSelf: "center",
    paddingHorizontal: 22,
    height: 42,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBigTxt: { color: "#fff", fontSize: 16, fontWeight: "700" },

  endedTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 12,
  },
  endedBtns: { position: "absolute", left: 16, right: 16 },
  endedBtn: {
    height: 46,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  endedBtnTxt: { color: "#fff", fontSize: 16, fontWeight: "800" },
});
