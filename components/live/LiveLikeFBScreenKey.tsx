// LiveLikeFBScreenKey.tsx
// AUTO-LIVE theo sân (Assigned → LIVE), mỗi trận = 1 video riêng:
// - Có match → tạo liveSession → pick RTMP → start stream + overlay
// - Hết match → stop stream ngay, KHÔNG đóng app; chờ 10 phút, rồi cảnh báo 10s (Huỷ để tiếp tục chờ)
// - Có match mới trong lúc chờ → start stream mới
// - Adaptive chất lượng/FPS theo máy (native hint nếu có; fallback an toàn)
// - Tối ưu nhiệt/ram: thermalProtect(optional), dọn overlay/view khi stop, release(optional)
// - NEW: Gate chọn orientation Dọc/Ngang trước khi bắt đầu phát

import React, { useCallback, useEffect, useRef, useState } from "react";
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
import * as ScreenOrientation from "expo-screen-orientation";

/* ====== SFX ====== */
import torch_on from "@/assets/sfx/click4.mp3";
import torch_off from "@/assets/sfx/click4.mp3";
import mic_on from "@/assets/sfx/click4.mp3";
import mic_off from "@/assets/sfx/click4.mp3";

/* ====== RTK Query ====== */
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

/* ====== Overlay URL builder ====== */
const overlayUrlForMatch = (mid?: string | null) =>
  mid
    ? process.env.EXPO_PUBLIC_BASE_URL +
      `/overlay/score?matchId=${mid}&theme=dark&size=md&showSets=1&autoNext=1&overlay=1&scale-score=.5`
    : null;

/* ====== DEBUG ====== */
const LOG = true;
const log = (...args: any[]) =>
  LOG && console.log("[LiveLikeFB]", new Date().toISOString(), ...args);

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
  tid: string;
  bid: string;
  courtId: string;
  autoOnLive?: boolean; // default: true
};
type StreamProfile = {
  bitrate: number;
  width: number;
  height: number;
  fps: number;
};
type Orient = "portrait" | "landscape";

/* ====== Gap timers (giữa trận) ====== */
const GAP_WAIT_MS = 10 * 60 * 1000; // 10 phút chờ match mới
const GAP_WARN_MS = 10 * 1000; // 10s cảnh báo tự tắt

/* ====== Utils ====== */
const SFX = {
  torchOn: torch_on,
  torchOff: torch_off,
  micOn: mic_on,
  micOff: mic_off,
} as const;
type SfxKey = keyof typeof SFX;
const SFX_VOLUME = 1;

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

/** Chuẩn hoá RTMP outputs từ liveData */
const normalizeDestinationsFromLiveData = (liveData: any): Dest[] => {
  const outs: Dest[] = [];
  try {
    const p = liveData?.platforms || {};
    const primary = liveData?.primary || {};
    const push = (platform?: string, node?: any) => {
      if (!node) return;
      const server_url = node.server_url;
      const stream_key = node.stream_key;
      const secure_stream_url = node.secure_stream_url;
      if (server_url || stream_key || secure_stream_url) {
        outs.push({ platform, server_url, stream_key, secure_stream_url });
      }
    };
    push("facebook", p?.facebook?.live);
    if (primary?.platform === "facebook") push("facebook", primary);
    push("youtube", p?.youtube?.live);
    if (primary?.platform === "youtube") push("youtube", primary);
    push("tiktok", p?.tiktok?.live);
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

  /* ==== Orientation gate (NEW) ==== */
  const [orientation, setOrientation] = useState<Orient | null>(null);
  const [locking, setLocking] = useState(false);
  const orientationChosen = orientation !== null;

  const applyOrientationChoice = useCallback(
    async (choice: Orient) => {
      setLocking(true);
      try {
        await Haptics.selectionAsync();
        // Khoá xoay OS (ưu tiên expo)
        await ScreenOrientation.lockAsync(
          choice === "portrait"
            ? ScreenOrientation.OrientationLock.PORTRAIT
            : ScreenOrientation.OrientationLock.LANDSCAPE
        );
      } catch {}
      try {
        // Nếu native có hỗ trợ khoá riêng (optional)
        await Live.enableAutoRotate?.(false);
        await Live.lockOrientation?.(choice.toUpperCase());
      } catch {}
      setOrientation(choice);
      setLocking(false);
    },
    []
  );

  const unlockOrientation = useCallback(async () => {
    try {
      await ScreenOrientation.unlockAsync();
    } catch {}
    try {
      await Live.enableAutoRotate?.(true);
    } catch {}
  }, []);

  /* ==== Streaming refs ==== */
  const startedPreviewRef = useRef(false);
  const lastUrlRef = useRef<string | null>(null);
  const currentMatchRef = useRef<string | null>(null);
  const shouldResumeLiveRef = useRef(false);
  const previewRetryRef = useRef<{ cancel: boolean }>({ cancel: false });
  const chosenProfileRef = useRef<StreamProfile | null>(null);

  /* ==== Gap wait / warn ==== */
  const [gapWarnVisible, setGapWarnVisible] = useState(false);
  const [gapWarnProgress, setGapWarnProgress] = useState(0);
  const gapWaitingRef = useRef(false);
  const gapTenMinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gapWarnTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gapWarnDeadlineRef = useRef<number | null>(null);

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
    if (mode === "live" || mode === "stopping")
      t = setInterval(() => setElapsed((s) => s + 1), 1000);
    else setElapsed(0);
    return () => t && clearInterval(t);
  }, [mode]);

  /* ==== Preview bootstrap ==== */
  const startPreviewWithRetry = useCallback(async () => {
    if (startedPreviewRef.current) return true;
    const okPerm = await ensurePermissions();
    if (!okPerm) {
      Alert.alert("Thiếu quyền", "Cần cấp quyền Camera & Micro để livestream.");
      return false;
    }
    let attempts = 0;
    const maxAttempts = 20;
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
    previewRetryRef.current.cancel = false;

    while (
      !previewRetryRef.current.cancel &&
      !startedPreviewRef.current &&
      attempts < maxAttempts
    ) {
      try {
        // Cho phép xoay lúc preview để người dùng dễ chọn
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
        await delay(/surface|invalid|illegalargument/i.test(msg) ? 150 : 120);
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

  // App unmount cleanup + thermal protect
  useEffect(() => {
    Live.enableThermalProtect?.(true);
    return () => {
      previewRetryRef.current.cancel = true;
      try {
        clearTimeout(gapTenMinTimerRef.current!);
      } catch {}
      try {
        clearInterval(gapWarnTimerRef.current!);
      } catch {}
      (async () => {
        try {
          await Live.enableAutoRotate?.(true);
        } catch {}
        try {
          await Live.overlayRemove?.();
        } catch {}
        try {
          await Live.stopPreview?.();
          startedPreviewRef.current = false;
        } catch {}
        try {
          await Live.stop?.();
        } catch {}
        try {
          await Live.release?.();
        } catch {}
        await unlockOrientation();
      })();
    };
  }, [unlockOrientation]);

  // Focus/blur giữ preview ổn định
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

  // AppState: resume preview & stream nếu cần
  useEffect(() => {
    const handler = async (nextState: AppStateStatus) => {
      if (nextState === "active") {
        previewRetryRef.current.cancel = false;
        if (!startedPreviewRef.current) await startPreviewWithRetry();
        if (shouldResumeLiveRef.current && lastUrlRef.current) {
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
  }, [mode, startPreviewWithRetry]);

  /* ==== Adaptive profile (orientation-aware) ==== */
  const pickAdaptiveProfile = useCallback(
    async (orient: Orient): Promise<StreamProfile> => {
      // 1) hỏi native (nếu có)
      try {
        const p = await Live.suggestProfile?.(); // {bitrate,width,height,fps}
        if (p && p.width && p.height && p.fps && p.bitrate) {
          log("suggestProfile(native)", p);
          const base: StreamProfile = p;
          return orient === "portrait"
            ? { ...base, width: Math.min(base.width, base.height), height: Math.max(base.width, base.height) }
            : { ...base, width: Math.max(base.width, base.height), height: Math.min(base.width, base.height) };
        }
      } catch {}

      // 2) heuristics đơn giản (landscape là chuẩn; portrait thì swap)
      let can1080 = false,
        can720p60 = false,
        perfScore = 50;
      try {
        can1080 = !!(await Live.canDo1080p?.());
      } catch {}
      try {
        can720p60 = !!(await Live.canDo720p60?.());
      } catch {}
      try {
        const s = await Live.getPerfScore?.();
        if (typeof s === "number") perfScore = s;
      } catch {}

      let base: StreamProfile;
      if (can1080 || perfScore >= 80)
        base = { width: 1920, height: 1080, fps: 30, bitrate: 4_500_000 };
      else if (can720p60 || perfScore >= 65)
        base = { width: 1280, height: 720, fps: 30, bitrate: 3_800_000 };
      else if (perfScore >= 55)
        base = { width: 1280, height: 720, fps: 24, bitrate: 3_000_000 };
      else base = { width: 1280, height: 720, fps: 24, bitrate: 2_800_000 };

      if (orient === "portrait") {
        return { ...base, width: Math.min(base.width, base.height), height: Math.max(base.width, base.height) };
      }
      return base;
    },
    []
  );

  /* ==== Native start/stop ==== */
  const startNative = useCallback(
    async (url: string, profile: StreamProfile) => {
      log("Live.start", { url: maskUrl(url), profile });
      await Live.start(
        url,
        profile.bitrate,
        profile.width,
        profile.height,
        profile.fps
      );
      log("Live.start → OK");
    },
    []
  );

  const stopNativeNow = useCallback(async () => {
    log("Live.stop → begin");
    try {
      await Live.overlayRemove?.();
    } catch (e) {
      log("overlayRemove error", e);
    }
    try {
      await Live.stop?.();
    } catch (e) {
      log("Live.stop error", e);
    }
    setTorchOn(false);
    setMicMuted(false);
    setElapsed(0);
    lastUrlRef.current = null;
    log("Live.stop → done");
  }, []);

  /* ===================== Poll court ===================== */
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
    log("court ok", { court: court?.name, currentMatchId: cm?._id || null });
  }, [courtData, courtsFetching, courtsLoading, courtsError, shouldPoll]);

  const currentMatchId: string | null = courtData?.match?._id || null;

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

  /* ===================== Gap wait helpers ===================== */
  const clearGapTimers = useCallback(() => {
    gapWaitingRef.current = false;
    try {
      if (gapTenMinTimerRef.current) clearTimeout(gapTenMinTimerRef.current);
    } catch {}
    try {
      if (gapWarnTimerRef.current) clearInterval(gapWarnTimerRef.current);
    } catch {}
    gapTenMinTimerRef.current = null;
    gapWarnTimerRef.current = null;
    gapWarnDeadlineRef.current = null;
    setGapWarnVisible(false);
    setGapWarnProgress(0);
  }, []);

  const beginGapWait = useCallback(() => {
    clearGapTimers();
    gapWaitingRef.current = true;
    setStatusText("Không còn trận — đang chờ trận mới… (tối đa 10 phút)");
    gapTenMinTimerRef.current = setTimeout(() => {
      // Hiện cảnh báo 10s
      setGapWarnVisible(true);
      setGapWarnProgress(0);
      gapWarnDeadlineRef.current = Date.now() + GAP_WARN_MS;
      gapWarnTimerRef.current = setInterval(() => {
        const deadline = gapWarnDeadlineRef.current ?? Date.now();
        const remaining = Math.max(0, deadline - Date.now());
        const pct = Math.min(1, (GAP_WARN_MS - remaining) / GAP_WARN_MS);
        setGapWarnProgress(pct);
        if (remaining <= 0) {
          try {
            clearInterval(gapWarnTimerRef.current!);
          } catch {}
          gapWarnTimerRef.current = null;
          (async () => {
            try {
              await (notifyStreamEnded as any)({
                matchId: currentMatchRef.current,
                platform: "all",
              }).unwrap?.();
            } catch {}
            await stopNativeNow();
            setMode("ended");
            setStatusText("Đã kết thúc buổi phát.");
            clearGapTimers();
          })();
        }
      }, 50);
    }, GAP_WAIT_MS);
  }, [clearGapTimers, notifyStreamEnded, stopNativeNow]);

  const cancelAutoStop = useCallback(() => {
    // Huỷ countdown 10s và tiếp tục chờ thêm 10 phút nữa
    try {
      clearInterval(gapWarnTimerRef.current!);
    } catch {}
    gapWarnTimerRef.current = null;
    setGapWarnVisible(false);
    setGapWarnProgress(0);
    beginGapWait();
  }, [beginGapWait]);

  /* ===================== Start/Stop per match ===================== */
  const startForMatch = useCallback(
    async (mid: string) => {
      if (!orientationChosen) {
        setStatusText("Vui lòng chọn Dọc hoặc Ngang để bắt đầu phát.");
        return false;
      }
      setStatusText("Sân đã có trận — chuẩn bị phát…");
      const url = await ensureOutputsForMatch(mid);
      if (!url) {
        setStatusText("❌ Backend chưa trả outputs cho trận này.");
        Alert.alert("Không thể phát", "Chưa có RTMPS URL từ server.");
        return false;
      }
      try {
        await Haptics.selectionAsync();
        // Khoá orientation ngay trước khi start để không bị xoay khi live
        try {
          await ScreenOrientation.lockAsync(
            orientation === "portrait"
              ? ScreenOrientation.OrientationLock.PORTRAIT
              : ScreenOrientation.OrientationLock.LANDSCAPE
          );
          await Live.enableAutoRotate?.(false);
          await Live.lockOrientation?.(orientation!.toUpperCase());
        } catch {}
        const profile = await pickAdaptiveProfile(orientation!);
        chosenProfileRef.current = profile;
        await startNative(url, profile);

        // Overlay theo match
        const oUrl = overlayUrlForMatch(mid);
        if (oUrl) {
          try {
            await Live.overlayLoad(oUrl, 0, 0, "CENTER", 100, 100, 0, 0);
            await Live.overlaySetVisible?.(true);
            log("overlay → loaded (full)", oUrl);
          } catch (e) {
            log("overlay → failed", e);
          }
        }

        lastUrlRef.current = url;
        currentMatchRef.current = mid;
        setMode("live");
        setStatusText("Đang LIVE…");
        try {
          await (notifyStreamStarted as any)({
            matchId: mid,
            platform: "all",
          }).unwrap?.();
        } catch {}
        log("startForMatch → LIVE", { matchId: mid, profile });
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
      notifyStreamStarted,
      orientation,
      orientationChosen,
      pickAdaptiveProfile,
      startNative,
    ]
  );

  // Auto điều khiển theo currentMatchId (mỗi trận 1 video riêng)
  const lastAutoStartedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!autoOnLive || !courtId) return;

    // Nếu chưa chọn orientation, không start — nhắc chọn
    if (!orientationChosen) {
      if (currentMatchId) {
        setStatusText(
          "Sân đã có trận. Chọn chế độ Dọc hoặc Ngang để bắt đầu phát."
        );
      } else {
        setStatusText("Chọn Dọc/Ngang và chờ trận được gán vào sân…");
      }
      return;
    }

    // Có match mới
    if (currentMatchId) {
      // Huỷ timers nếu có
      clearGapTimers();
      if (
        currentMatchRef.current &&
        currentMatchRef.current !== currentMatchId
      ) {
        // Đang live trận A → chuyển sang trận B
        if (mode === "live" || mode === "stopping") {
          (async () => {
            log("switch match: stop current then start", {
              prev: currentMatchRef.current,
              next: currentMatchId,
            });
            try {
              await (notifyStreamEnded as any)({
                matchId: currentMatchRef.current,
                platform: "all",
              }).unwrap?.();
            } catch {}
            await stopNativeNow(); // stop RTMP ngay
            setMode("idle");
            const ok = await startForMatch(currentMatchId);
            if (ok) lastAutoStartedForRef.current = currentMatchId;
          })();
        } else {
          (async () => {
            const ok = await startForMatch(currentMatchId);
            if (ok) lastAutoStartedForRef.current = currentMatchId;
          })();
        }
      } else if (!currentMatchRef.current) {
        // Chưa live, có match → start
        (async () => {
          const ok = await startForMatch(currentMatchId);
          if (ok) lastAutoStartedForRef.current = currentMatchId;
        })();
      } else {
        // Đang live đúng match → giữ nguyên
        if (mode === "live") setStatusText("Đang LIVE…");
      }
      return;
    }

    // Không còn match (kết thúc trận hiện tại)
    if (!currentMatchId) {
      if (mode === "live" || mode === "stopping") {
        (async () => {
          setStatusText("🔔 Trận đã kết thúc — dừng phát và chờ trận mới…");
          try {
            await (notifyStreamEnded as any)({
              matchId: currentMatchRef.current,
              platform: "all",
            }).unwrap?.();
          } catch {}
          await stopNativeNow(); // dừng RTMP NGAY để tách video
          setMode("idle");
          beginGapWait(); // chờ 10 phút rồi cảnh báo 10s
        })();
      } else {
        if (!gapWaitingRef.current && !gapWarnVisible) beginGapWait();
        setStatusText("Đang chờ trận được gán (assigned) vào sân…");
      }
      currentMatchRef.current = null;
      lastAutoStartedForRef.current = null;
      return;
    }
  }, [
    autoOnLive,
    courtId,
    currentMatchId,
    mode,
    startForMatch,
    stopNativeNow,
    notifyStreamEnded,
    beginGapWait,
    clearGapTimers,
    gapWarnVisible,
    orientationChosen,
  ]);

  /* ====== Manual finish flow ====== */
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

        {/* IDLE (đang chờ trận) */}
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
              <View
                style={[
                  styles.goLiveWrap,
                  {
                    bottom:
                      Platform.OS === "ios"
                        ? insets.bottom + 100
                        : 16 + insets.bottom,
                  },
                ]}
              >
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

        {/* STOPPING (manual) */}
        {mode === "stopping" && (
          <View style={styles.overlay}>
            <Text style={styles.overlayTitle}>Đang kết thúc buổi phát</Text>
            <DottedCircleProgress progress={stopProgress} size={140} dotSize={8} />
            <Text style={styles.progressText}>
              Sẽ kết thúc sau {Math.max(0, Math.ceil((1 - stopProgress) * 5))}s
            </Text>
            <Pressable
              style={[styles.cancelBigBtn, { bottom: 16 + insets.bottom }]}
              onPress={cancelStopping}
            >
              <Text style={styles.cancelBigTxt}>Huỷ</Text>
            </Pressable>
          </View>
        )}

        {/* GAP WARNING (sau 10 phút không có trận) */}
        {gapWarnVisible && (
          <View style={styles.overlay}>
            <Text style={styles.overlayTitle}>
              Không có trận mới — sẽ tự dừng sau ít giây
            </Text>
            <DottedCircleProgress progress={gapWarnProgress} size={140} dotSize={8} />
            <Text style={styles.progressText}>
              Sẽ dừng sau {Math.max(0, Math.ceil((1 - gapWarnProgress) * 10))}s
            </Text>
            <Pressable
              style={[styles.cancelBigBtn, { bottom: 16 + insets.bottom }]}
              onPress={cancelAutoStop}
            >
              <Text style={styles.cancelBigTxt}>
                Huỷ (tiếp tục chờ 10 phút)
              </Text>
            </Pressable>
          </View>
        )}

        {/* ENDED */}
        {mode === "ended" && (
          <View style={styles.overlay}>
            <Text style={styles.endedTitle}>Đã kết thúc buổi phát trực tiếp</Text>
            <View style={[styles.endedBtns, { bottom: 16 + insets.bottom }]}>
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

        {/* ORIENTATION GATE (NEW) — hiển thị NGAY khi vào màn hình cho đến khi chọn */}
        {!orientationChosen && (
          <View style={styles.gateWrap} pointerEvents="auto">
            <View style={styles.gateCard}>
              <Text style={styles.gateTitle}>Chọn chế độ phát trực tiếp</Text>
              <Text style={styles.gateSub}>Bạn muốn live Dọc hay Ngang?</Text>

              <View style={styles.gateRow}>
                <Pressable
                  disabled={locking}
                  onPress={() => applyOrientationChoice("portrait")}
                  style={({ pressed }) => [
                    styles.gateBtn,
                    styles.gateBtnPortrait,
                    pressed && styles.gateBtnPressed,
                  ]}
                >
                  <Text style={styles.gateEmoji}>📱↕️</Text>
                  <Text style={styles.gateBtnText}>Dọc</Text>
                </Pressable>

                <Pressable
                  disabled={locking}
                  onPress={() => applyOrientationChoice("landscape")}
                  style={({ pressed }) => [
                    styles.gateBtn,
                    styles.gateBtnLandscape,
                    pressed && styles.gateBtnPressed,
                  ]}
                >
                  <Text style={styles.gateEmoji}>📱↔️</Text>
                  <Text style={styles.gateBtnText}>Ngang</Text>
                </Pressable>
              </View>

              {locking && (
                <View style={{ marginTop: 10, alignItems: "center" }}>
                  <ActivityIndicator color="#fff" />
                  <Text style={styles.gateHint}>Đang khoá xoay…</Text>
                </View>
              )}

              {!!currentMatchId && (
                <Text style={styles.gateHint2}>
                  Sân đã có trận • Sau khi chọn, hệ thống sẽ tự bắt đầu phát.
                </Text>
              )}
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

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

  /* Orientation Gate */
  gateWrap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.75)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  gateCard: {
    width: "92%",
    maxWidth: 420,
    borderRadius: 16,
    backgroundColor: "rgba(30,30,30,0.95)",
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  gateTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  gateSub: {
    color: "rgba(255,255,255,0.85)",
    textAlign: "center",
    marginTop: 6,
    marginBottom: 12,
  },
  gateRow: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "center",
  },
  gateBtn: {
    flex: 1,
    minHeight: 90,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  gateBtnPortrait: {
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  gateBtnLandscape: {
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  gateBtnPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.99 }],
  },
  gateEmoji: { fontSize: 26, marginBottom: 8 },
  gateBtnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  gateHint: { color: "#fff", marginTop: 8, fontSize: 12 },
  gateHint2: {
    color: "rgba(255,255,255,0.7)",
    marginTop: 12,
    fontSize: 12,
    textAlign: "center",
  },
});
