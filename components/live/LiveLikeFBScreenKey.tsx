// LiveLikeFBScreenKey.tsx
// AUTO-LIVE theo sân (Assigned → LIVE), mỗi trận = 1 video riêng
// - Có match → gọi createLiveSession (BE mới: chỉ tạo Facebook Live, giữ page bận) → lấy RTMPS → start stream + overlay
// - Hết match → stop stream ngay, KHÔNG đóng app; chờ 10 phút, rồi cảnh báo 10s (Huỷ để tiếp tục chờ)
// - Có match mới trong lúc chờ → start stream mới
// - Adaptive chất lượng/FPS theo máy (native hint nếu có; fallback an toàn)
// - Tối ưu nhiệt/ram: thermalProtect(optional), dọn overlay/view khi stop, release(optional)
// - NEW: Gate chọn orientation Dọc/Ngang trước khi bắt đầu phát
// - NEW: Chỉ phát live khi match.status === "live"
// - NEW: Native overlay thay WebView (Android), iOS giữ WebView
// - NEW: Socket realtime thay polling - PARSE DATA TRỰC TIẾP

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
  requireNativeComponent,
  UIManager,
} from "react-native";
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
  useGetOverlaySnapshotQuery,
} from "@/slices/liveStreamingApiSlice";

/* ====== Socket ====== */
import { useSocket } from "@/context/SocketContext";
import GapWarningOverlay from "./components/GapWarningOverlay";
import StoppingOverlay from "./components/StoppingOverlay";
import LiveTimerBar from "./components/LiveTimerBar";

/* ====== Native camera/rtmp ====== */
const COMPONENT_NAME = "RtmpPreviewView";
(UIManager as any).getViewManagerConfig?.(COMPONENT_NAME);
const _CachedRtmpPreviewView =
  (global as any).__RtmpPreviewView ||
  requireNativeComponent<{}>(COMPONENT_NAME);
(global as any).__RtmpPreviewView = _CachedRtmpPreviewView;
const RtmpPreviewView = _CachedRtmpPreviewView;
const Live = (NativeModules as any).FacebookLiveModule;

/* ====== Overlay URL builder (our canonical URL) ====== */
const overlayUrlForMatch = (mid?: string | null): string | null => {
  if (!mid || !process.env.EXPO_PUBLIC_BASE_URL) return null;

  const baseUrl = process.env.EXPO_PUBLIC_BASE_URL;
  const params = new URLSearchParams({
    matchId: mid,
    theme: "dark",
    size: "md",
    showSets: "1",
    autoNext: "1",
    overlay: "1",
    "scale-score": ".5",
    isactivebreak: "1",
    slimit: "12",
  });
  console.log(`${baseUrl}/overlay/score?${params}`);

  return `${baseUrl}/overlay/score?${params}`;
};

/* ====== DEBUG ====== */
const LOG = false;
const log = (...args: any[]) =>
  LOG && console.log("[LiveLikeFB]", new Date().toISOString(), ...args);

/* ====== Types ====== */
type Mode = "idle" | "live" | "stopping" | "ended";
type Props = {
  tournamentHref?: string;
  homeHref?: string;
  onFinishedGoToTournament?: () => void;
  onFinishedGoHome?: () => void;
  tid: string;
  bid: string;
  courtId: string;
  autoOnLive?: boolean;
};
type StreamProfile = {
  bitrate: number;
  width: number;
  height: number;
  fps: number;
};
type Orient = "portrait" | "landscape";

type QualityId =
  | "auto"
  | "1080p30"
  | "1080p60"
  | "720p60"
  | "720p30"
  | "720p24"
  | "540p30"
  | "480p30"
  | "480p24";

/* Preset giống kiểu chọn chất lượng YouTube */
const QUALITY_PRESETS: Record<
  QualityId,
  {
    label: string;
    shortLabel?: string;
    width?: number;
    height?: number;
    fps?: number;
    bitrate?: number;
  }
> = {
  auto: {
    label: "Tự động (khuyến nghị)",
    shortLabel: "Auto",
  },

  "720p30": {
    label: "720p • 30fps (Khuyến nghị 4G)",
    shortLabel: "720p30",
    width: 1280,
    height: 720,
    fps: 30,
    bitrate: 4_000_000,
  },
  "720p60": {
    label: "720p • 60fps",
    shortLabel: "720p60",
    width: 1280,
    height: 720,
    fps: 60,
    bitrate: 5_000_000,
  },
  "720p24": {
    label: "720p • 24fps",
    shortLabel: "720p24",
    width: 1280,
    height: 720,
    fps: 24,
    bitrate: 3_000_000,
  },

  "1080p30": {
    label: "1080p • 30fps (Cần WiFi tốt)",
    shortLabel: "1080p30",
    width: 1920,
    height: 1080,
    fps: 30,
    bitrate: 5_000_000,
  },
  "1080p60": {
    label: "1080p • 60fps (Cần WiFi)",
    shortLabel: "1080p60",
    width: 1920,
    height: 1080,
    fps: 60,
    bitrate: 6_500_000,
  },

  "540p30": {
    label: "540p • 30fps (4G yếu)",
    shortLabel: "540p",
    width: 960,
    height: 540,
    fps: 30,
    bitrate: 2_500_000,
  },

  "480p30": {
    label: "480p • 30fps",
    shortLabel: "480p30",
    width: 854,
    height: 480,
    fps: 30,
    bitrate: 2_000_000,
  },
  "480p24": {
    label: "480p • 24fps",
    shortLabel: "480p24",
    width: 854,
    height: 480,
    fps: 24,
    bitrate: 1_800_000,
  },
};

/* ====== Gap timers (giữa trận) ====== */
const GAP_WAIT_MS = 10 * 60 * 1000;
const GAP_WARN_MS = 10 * 1000;

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

/* ====== BE: parse FB RTMPS ====== */
const extractFacebookLiveFromResponse = (liveData: any) => {
  if (!liveData || typeof liveData !== "object") return null;

  const fb = liveData.facebook || null;

  let rtmpUrl: string | null = null;
  if (fb?.secure_stream_url) {
    rtmpUrl = fb.secure_stream_url;
  } else if (fb?.server_url && fb?.stream_key) {
    const base = fb.server_url.endsWith("/")
      ? fb.server_url.slice(0, -1)
      : fb.server_url;
    rtmpUrl = `${base}/${fb.stream_key}`;
  }

  return {
    rtmpUrl,
    facebook: fb,
  };
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
  const socket = useSocket();

  const safeTop = insets.top ?? 0;
  const safeBottom = insets.bottom ?? 0;
  const safeLeft = insets.left ?? 0;
  const safeRight = insets.right ?? 0;

  /* ==== Modes & UI ==== */
  const [mode, setMode] = useState<Mode>("idle");
  const [statusText, setStatusText] = useState<string>(
    "Đang chờ trận được gán (assigned) vào sân…"
  );
  const [torchOn, setTorchOn] = useState(false);
  const [micMuted, setMicMuted] = useState(false);

  // ⏱️ Thời điểm bắt đầu live, dùng cho đồng hồ (tách sang component riêng)
  const [liveStartAt, setLiveStartAt] = useState<number | null>(null);

  /* ==== Orientation gate ==== */
  const [orientation, setOrientation] = useState<Orient | null>(null);
  const [locking, setLocking] = useState(false);
  const orientationChosen = orientation !== null;

  const applyOrientationChoice = useCallback(async (choice: Orient) => {
    setLocking(true);
    try {
      await Haptics.selectionAsync();
      await ScreenOrientation.lockAsync(
        choice === "portrait"
          ? ScreenOrientation.OrientationLock.PORTRAIT
          : ScreenOrientation.OrientationLock.LANDSCAPE
      );
    } catch {}
    try {
      await Live.enableAutoRotate?.(false);
      await Live.lockOrientation?.(choice.toUpperCase());
    } catch {}
    setOrientation(choice);
    setLocking(false);
  }, []);

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
  const autoProfileRef = useRef<StreamProfile | null>(null);

  /* ==== Gap wait / warn ==== */
  const [gapWarnVisible, setGapWarnVisible] = useState(false);
  const gapWaitingRef = useRef(false);
  const gapTenMinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ==== Zoom (UI & throttle) ==== */
  const clampZoomUI = (z: number) => Math.min(2, Math.max(0.5, z));
  const zoomUIRef = useRef(1);
  const [zoomUI, setZoomUI] = useState(1);
  const pinchBaseRef = useRef(1);
  const rafIdRef = useRef<number | null>(null);
  const pendingZoomRef = useRef<number | null>(null);
  const lastSentZoomRef = useRef(1);
  const zoomDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const lastZoomSendTimeRef = useRef(0);
  const MIN_ZOOM_SEND_INTERVAL = 100;
  const isFrontRef = useRef(false);

  const sendZoomRAF = useCallback((z: number) => {
    const now = Date.now();
    const rounded = Math.round(z * 10) / 10;

    if (rounded === lastSentZoomRef.current) return;

    if (now - lastZoomSendTimeRef.current < MIN_ZOOM_SEND_INTERVAL) {
      pendingZoomRef.current = rounded;

      if (zoomDebounceTimerRef.current) {
        clearTimeout(zoomDebounceTimerRef.current);
      }

      zoomDebounceTimerRef.current = setTimeout(() => {
        const finalZoom = pendingZoomRef.current;
        if (finalZoom != null && finalZoom !== lastSentZoomRef.current) {
          Live.setZoom?.(finalZoom);
          lastSentZoomRef.current = finalZoom;
          lastZoomSendTimeRef.current = Date.now();
        }
        pendingZoomRef.current = null;
        zoomDebounceTimerRef.current = null;
      }, MIN_ZOOM_SEND_INTERVAL);

      return;
    }

    pendingZoomRef.current = rounded;

    if (rafIdRef.current != null) return;

    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      const v = pendingZoomRef.current;
      pendingZoomRef.current = null;

      if (v != null && v !== lastSentZoomRef.current) {
        Live.setZoom?.(v);
        lastSentZoomRef.current = v;
        lastZoomSendTimeRef.current = Date.now();
      }
    });
  }, []);

  useEffect(() => {
    return () => {
      if (zoomDebounceTimerRef.current) {
        clearTimeout(zoomDebounceTimerRef.current);
      }
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  /* ====== Quality state (menu bottom) ====== */
  const [qualityMenuVisible, setQualityMenuVisible] = useState(false);
  const [qualityChoice, setQualityChoice] = useState<QualityId>("720p30");
  const qualityChoiceRef = useRef<QualityId>("720p30");
  const currentQualityPreset = QUALITY_PRESETS[qualityChoice];
  const [autoQualityLabel, setAutoQualityLabel] = useState<string | null>(null);

  const handleQualitySelect = useCallback((id: QualityId) => {
    qualityChoiceRef.current = id;
    setQualityChoice((prev) => (prev === id ? prev : id));
    setQualityMenuVisible(false);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const p = await Live.suggestProfile?.();
        if (!mounted || !p) return;

        const width = p.width;
        const height = p.height;
        const fps = p.fps;
        const bitrate = p.bitrate;

        if (
          typeof width === "number" &&
          typeof height === "number" &&
          typeof fps === "number" &&
          typeof bitrate === "number"
        ) {
          const profile: StreamProfile = {
            width,
            height,
            fps,
            bitrate,
          };
          autoProfileRef.current = profile;

          if (width === 1280 && height === 720) {
            setAutoQualityLabel(`Auto (720p ${fps}fps)`);
          } else {
            setAutoQualityLabel(
              `Auto (${profile.width}x${profile.height} ${profile.fps}fps)`
            );
          }

          log("suggestProfile(preload)", profile);
        }
      } catch (e) {
        log("suggestProfile(preload) error", e);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  /* ==== Preview bootstrap (iOS freeze fix) ==== */
  const startPreviewWithRetry = useCallback(async () => {
    if (startedPreviewRef.current) {
      if (Platform.OS === "ios") {
        try {
          await Live.refreshPreview?.();
          log("preview → refreshPreview(iOS)");
        } catch (e) {
          log("preview → refreshPreview error", e);
        }
      }
      return true;
    }

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
    if (startedPreviewRef.current) {
      if (Platform.OS === "ios") {
        try {
          await Live.refreshPreview?.();
          log("kickPreview → refreshPreview(iOS)");
        } catch (e) {
          log("kickPreview → refreshPreview error", e);
        }
      }
      return;
    }
    await startPreviewWithRetry();
  }, [startPreviewWithRetry]);

  useEffect(() => {
    Live.enableThermalProtect?.(true);
    return () => {
      previewRetryRef.current.cancel = true;
      try {
        if (gapTenMinTimerRef.current) clearTimeout(gapTenMinTimerRef.current);
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

  useFocusEffect(
    useCallback(() => {
      previewRetryRef.current.cancel = false;
      kickPreview();

      return () => {
        previewRetryRef.current.cancel = true;
        (async () => {
          try {
            if (startedPreviewRef.current) {
              await Live.stopPreview?.();
              startedPreviewRef.current = false;
              log("focus-cleanup → stopPreview");
            }
          } catch (e) {
            log("focus-cleanup → stopPreview error", e);
          }
        })();
      };
    }, [kickPreview])
  );

  useEffect(() => {
    const handler = async (nextState: AppStateStatus) => {
      if (nextState === "active") {
        previewRetryRef.current.cancel = false;
        if (!startedPreviewRef.current) {
          await startPreviewWithRetry();
        } else if (Platform.OS === "ios") {
          try {
            await Live.refreshPreview?.();
            log("preview → AppState active refresh (iOS)");
          } catch (e) {
            log("preview → AppState active refresh failed (iOS)", e);
          }
        }
        if (shouldResumeLiveRef.current && lastUrlRef.current) {
          shouldResumeLiveRef.current = false;
        }
      } else {
        previewRetryRef.current.cancel = true;
        if (mode === "live" || mode === "stopping") {
          shouldResumeLiveRef.current = true;
        }
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

  /* ==== Adaptive profile (orientation-aware + quality choice) ==== */
  const pickAdaptiveProfile = useCallback(
    async (orient: Orient): Promise<StreamProfile> => {
      const finalize = (profile: StreamProfile): StreamProfile => {
        if (orient === "portrait") {
          return {
            ...profile,
            width: Math.min(profile.width, profile.height),
            height: Math.max(profile.width, profile.height),
          };
        }
        return {
          ...profile,
          width: Math.max(profile.width, profile.height),
          height: Math.min(profile.width, profile.height),
        };
      };

      const choice = qualityChoiceRef.current;

      if (choice !== "auto") {
        const preset = QUALITY_PRESETS[choice];
        if (
          preset &&
          preset.width &&
          preset.height &&
          preset.fps &&
          preset.bitrate
        ) {
          return finalize({
            width: preset.width,
            height: preset.height,
            fps: preset.fps,
            bitrate: preset.bitrate,
          });
        }
      }

      if (autoProfileRef.current) {
        log("suggestProfile(cached)", autoProfileRef.current);
        return finalize(autoProfileRef.current);
      }

      try {
        const p = await Live.suggestProfile?.();
        if (p && p.width && p.height && p.fps && p.bitrate) {
          const base: StreamProfile = {
            width: p.width,
            height: p.height,
            fps: p.fps,
            bitrate: p.bitrate,
          };
          autoProfileRef.current = base;
          log("suggestProfile(native)", base);
          return finalize(base);
        }
      } catch {}

      let can1080 = false;
      let can720p60 = false;
      let perfScore = 50;
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

      return finalize(base);
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
    setLiveStartAt(null);
    lastUrlRef.current = null;
    log("Live.stop → done");
  }, []);

  // ✅ CHỈ fetch initial data, KHÔNG polling
  const { data: courtData, refetch: refetchCourt } =
    useGetCurrentMatchByCourtQuery(courtId, {
      skip: !courtId,
      pollingInterval: 0,
      refetchOnMountOrArgChange: true,
    });

  // ✅ State để lưu match data realtime từ socket
  const [currentMatchData, setCurrentMatchData] = useState<any>(null);

  // ✅ Merge initial data từ RTK Query vào state
  useEffect(() => {
    if (courtData?.match) {
      log("Initial court data loaded", {
        matchId: courtData.match._id,
        status: courtData.match.status,
      });
      setCurrentMatchData(courtData.match);
    }
  }, [courtData]);

  // ✅ ĐỊNH NGHĨA HÀM BÊN NGOÀI useEffect
  const onCourtSnapshot = useCallback((data: any) => {
    log("socket → court:snapshot", {
      courtId: data?.court?._id,
      matchId: data?.match?._id,
      status: data?.match?.status,
    });

    if (data?.match) {
      setCurrentMatchData((prev: any) => {
        // Chỉ update nếu thực sự khác
        if (
          prev?._id === data.match._id &&
          prev?.status === data.match.status &&
          prev?.isBreak === data.match.isBreak
        ) {
          return prev; // Không trigger re-render
        }
        return data.match;
      });
    }
  }, []); // ✅ Không dependency vì dùng functional update

  // ✅ SOCKET REALTIME cho Court Updates
  useEffect(() => {
    if (!courtId || !socket) {
      log("socket → skip (no courtId or socket)");
      return;
    }

    log("socket → joining court room", courtId);
    socket.emit("court:join", { courtId });

    socket.on("court:snapshot", onCourtSnapshot);

    if (socket.connected) {
      socket.emit("court:get-snapshot", { courtId });
    }

    return () => {
      log("socket → leaving court room", courtId);
      socket.emit("court:leave", { courtId });
      socket.off("court:snapshot", onCourtSnapshot);
    };
  }, [courtId, socket, onCourtSnapshot]);


  // ✅ FALLBACK: Refetch 10s một lần nếu socket disconnect
  useEffect(() => {
    if (!courtId || socket?.connected) return;

    log("socket disconnected → fallback refetch every 10s");
    const interval = setInterval(() => {
      log("fallback → refetching court data");
      refetchCourt();
    }, 10000);

    return () => clearInterval(interval);
  }, [courtId, socket?.connected, refetchCourt]);

  // ✅ Dùng currentMatchData thay vì courtData?.match
  const matchObj = currentMatchData ?? null;
  const currentMatchId: string | null = matchObj?._id ?? null;
  const currentMatchStatus: string | null = matchObj?.status ?? null;

  // ✅ Log để debug
  useEffect(() => {
    log("Current match state", {
      matchId: currentMatchId,
      status: currentMatchStatus,
      isBreak: matchObj?.isBreak,
      socketConnected: socket?.connected,
    });
  }, [
    currentMatchId,
    currentMatchStatus,
    matchObj?.isBreak,
    socket?.connected,
  ]);

  /* ===================== create live session ===================== */
  const [createLiveSession] = useCreateLiveSessionMutation();
  const [notifyStreamStarted] = useNotifyStreamStartedMutation();
  const [notifyStreamEnded] = useNotifyStreamEndedMutation();

  const ensureOutputsForMatch = useCallback(
    async (
      mid: string
    ): Promise<{
      rtmpUrl: string;
      facebook: any;
    } | null> => {
      setStatusText("⚙️ Đang tạo live session…");
      try {
        const res =
          (await (createLiveSession as any)({ matchId: mid }).unwrap?.()) ??
          (await (createLiveSession as any)({ matchId: mid }).unwrap());

        const parsed = extractFacebookLiveFromResponse(res);
        if (!parsed || !parsed.rtmpUrl) {
          log("ensureOutputsForMatch → no RTMP from BE", res);
          return null;
        }

        log("ensureOutputsForMatch → url", {
          matchId: mid,
          url: maskUrl(parsed.rtmpUrl),
          page: parsed.facebook?.pageName || parsed.facebook?.pageId,
        });

        return {
          rtmpUrl: parsed.rtmpUrl,
          facebook: parsed.facebook,
        };
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
    gapTenMinTimerRef.current = null;
    setGapWarnVisible(false);
  }, []);

  const beginGapWait = useCallback(() => {
    clearGapTimers();
    gapWaitingRef.current = true;
    setStatusText("Không còn trận — đang chờ trận mới… (tối đa 10 phút)");
    gapTenMinTimerRef.current = setTimeout(() => {
      setGapWarnVisible(true);
    }, GAP_WAIT_MS);
  }, [clearGapTimers]);

  const handleGapAutoStop = useCallback(async () => {
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
  }, [notifyStreamEnded, stopNativeNow, clearGapTimers]);

  const cancelAutoStop = useCallback(() => {
    // Huỷ đếm 10s, nhưng tiếp tục chờ thêm 10 phút nữa
    beginGapWait();
  }, [beginGapWait]);

  /* ===================== ✅ SOCKET cho Overlay - PARSE DATA TRỰC TIẾP ===================== */
  const { data: overlaySnapshot } = useGetOverlaySnapshotQuery(
    currentMatchId || "",
    {
      skip: !currentMatchId || mode !== "live",
      pollingInterval: 0,
      refetchOnMountOrArgChange: true,
    }
  );

  // ✅ State để lưu realtime overlay data từ socket
  const [realtimeOverlayData, setRealtimeOverlayData] = useState<any>(null);

  // ✅ Hàm update overlay - extract ra ngoài để gọi trực tiếp
  const updateOverlayNow = useCallback(
    async (dataSource: any) => {
      if (!dataSource || mode !== "live" || Platform.OS !== "android") return;

      if (LOG) {
        console.log("overlay data source", dataSource);
      }

      try {
        const safeStr = (val: any, fallback = "") =>
          val != null ? String(val) : fallback;
        const safeNum = (val: any, fallback = 0) =>
          typeof val === "number" ? val : fallback;
        const safeBool = (val: any) => Boolean(val);

        // Build overlay data theo format ScoreOverlayView.kt
        
        const overlayData = {
          // Theme settings từ tournament.overlay hoặc bracket.overlay
          theme: safeStr(
            dataSource?.tournament?.overlay?.theme ||
              dataSource?.bracket?.overlay?.theme,
            "dark"
          ),
          size: safeStr(
            dataSource?.tournament?.overlay?.size ||
              dataSource?.bracket?.overlay?.size,
            "md"
          ),
          accentA: safeStr(
            dataSource?.tournament?.overlay?.accentA ||
              dataSource?.bracket?.overlay?.accentA,
            "#25C2A0"
          ),
          accentB: safeStr(
            dataSource?.tournament?.overlay?.accentB ||
              dataSource?.bracket?.overlay?.accentB,
            "#4F46E5"
          ),
          rounded: safeNum(
            dataSource?.tournament?.overlay?.rounded ||
              dataSource?.bracket?.overlay?.rounded,
            18
          ),
          shadow: safeBool(
            dataSource?.tournament?.overlay?.shadow ??
              dataSource?.bracket?.overlay?.shadow ??
              true
          ),
          showSets: safeBool(
            dataSource?.tournament?.overlay?.showSets ??
              dataSource?.bracket?.overlay?.showSets ??
              true
          ),
          nameScale: safeNum(
            dataSource?.tournament?.overlay?.nameScale ||
              dataSource?.bracket?.overlay?.nameScale,
            1.0
          ),
          scoreScale: safeNum(
            dataSource?.tournament?.overlay?.scoreScale ||
              dataSource?.bracket?.overlay?.scoreScale,
            1.0
          ),

          // Tournament info
          tournamentName: safeStr(dataSource?.tournament?.name),
          courtName: safeStr(dataSource?.court?.name || dataSource?.courtName),
          tournamentLogoUrl: safeStr(dataSource?.tournament?.image),
          phaseText: safeStr(dataSource?.bracket?.name),
          roundLabel: safeStr(dataSource?.roundCode),

          // Team info
          teamAName: safeStr(
            dataSource?.teams?.A?.name ||
              `${dataSource?.pairA?.player1?.nickname || "Team A"}`,
            "Team A"
          ),
          teamBName: safeStr(
            dataSource?.teams?.B?.name ||
              `${dataSource?.pairB?.player1?.nickname || "Team B"}`,
            "Team B"
          ),

          // Current scores
          scoreA: safeNum(
            dataSource?.gameScores?.[dataSource?.currentGame || 0]?.a,
            0
          ),
          scoreB: safeNum(
            dataSource?.gameScores?.[dataSource?.currentGame || 0]?.b,
            0
          ),

          // Serve info
          serveSide: safeStr(dataSource?.serve?.side, "A").toUpperCase(),
          serveCount: Math.max(
            1,
            Math.min(2, safeNum(dataSource?.serve?.server, 1))
          ),

          // Break info
          isBreak: safeBool(dataSource?.isBreak?.active || false),
          breakNote: safeStr(dataSource?.isBreak?.note || ""),
          breakTeams: `${safeStr(
            dataSource?.teams?.A?.name || "Team A"
          )} vs ${safeStr(dataSource?.teams?.B?.name || "Team B")}`,
          breakRound: safeStr(
            dataSource?.roundCode || dataSource?.bracket?.name
          ),

          // Design mode
          isDefaultDesign: false,

          // Overlay extras
          overlayEnabled: true,
          webLogoUrl: safeStr(
            process.env.EXPO_PUBLIC_WEB_LOGO_URL ||
              dataSource?.tournament?.overlay?.logoUrl ||
              dataSource?.bracket?.overlay?.logoUrl
          ),
          sponsorLogos: [],

          // Display settings
          showClock: false,
          scaleScore: 0.5,

          // Sets data
          sets: Array.isArray(dataSource?.gameScores)
            ? dataSource.gameScores.map((g: any, i: number) => ({
                index: i + 1,
                a: g?.a ?? null,
                b: g?.b ?? null,
                winner: g?.winner || "",
                current: i === (dataSource?.currentGame || 0),
              }))
            : [],
        };

        if (LOG) {
          console.log("overlayUpdate → calling", overlayData);
        }
        await Live.overlayUpdate?.(overlayData);
        log("overlayUpdate → OK");
      } catch (e) {
        log("overlayUpdate → error", e);
      }
    },
    [mode]
  );

  // ✅ Socket listener cho overlay realtime - GỌI TRỰC TIẾP
  useEffect(() => {
    if (!currentMatchId || !socket || mode !== "live") {
      return;
    }

    log("socket → joining match room for overlay", currentMatchId);
    socket.emit("match:join", { matchId: currentMatchId });

    // ✅ Handler cho match snapshot (full overlay data)
    const onMatchSnapshot = (data?: any) => {
      log("socket → match:snapshot received", data);
      if (data) {
        setRealtimeOverlayData(data);
        // ✅ GỌI UPDATE NGAY LẬP TỨC
        updateOverlayNow(data);
      }
    };

    // ✅ Handler cho score update (full data)
    const onScoreUpdate = (data?: any) => {
      log("socket → score:updated received", data);
      if (data) {
        setRealtimeOverlayData(data);
        // ✅ GỌI UPDATE NGAY LẬP TỨC
        updateOverlayNow(data);
      }
    };

    socket.on("match:snapshot", onMatchSnapshot);
    socket.on("score:updated", onScoreUpdate);

    return () => {
      log("socket → leaving match room", currentMatchId);
      socket.emit("match:leave", { matchId: currentMatchId });
      socket.off("match:snapshot", onMatchSnapshot);
      socket.off("score:updated", onScoreUpdate);
    };
  }, [currentMatchId, socket, mode, updateOverlayNow]);

  // ✅ Fallback useEffect cho initial load từ RTK query
  useEffect(() => {
    if (!overlaySnapshot || realtimeOverlayData || mode !== "live") return;

    log("overlaySnapshot → initial load from RTK");
    updateOverlayNow(overlaySnapshot);
  }, [overlaySnapshot, realtimeOverlayData, mode, updateOverlayNow]);

  /* ===================== ✅ Start/Stop per match ===================== */
  const lastAutoStartedForRef = useRef<string | null>(null);

  const startForMatch = useCallback(
    async (mid: string) => {
      if (!orientationChosen) {
        setStatusText("Vui lòng chọn Dọc hoặc Ngang để bắt đầu phát.");
        return false;
      }
      setStatusText("Sân đã có trận — chuẩn bị phát…");

      const liveInfo = await ensureOutputsForMatch(mid);
      if (!liveInfo) {
        setStatusText("❌ Backend chưa trả RTMP cho trận này.");
        Alert.alert("Không thể phát", "Chưa có RTMPS URL từ server.");
        return false;
      }

      const { rtmpUrl } = liveInfo;

      try {
        await Haptics.selectionAsync();
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
        await startNative(rtmpUrl, profile);

        // ✅ OVERLAY: Android = Native, iOS = WebView
        if (Platform.OS === "android") {
          try {
            const fw = profile.width;
            const fh = profile.height;

            await Live.overlayLoad("", fw, fh, "tl", 100, 100, 0, 0);
            await Live.overlaySetVisible?.(true);
            log("overlay → loaded (native)");
          } catch (e) {
            log("overlay → failed (native)", e);
          }
        } else if (Platform.OS === "ios") {
          const oUrl = overlayUrlForMatch(mid);
          if (oUrl) {
            try {
              await Live.overlayLoad(oUrl, 0, 0, "CENTER", 100, 100, 0, 0);
              await Live.overlaySetVisible?.(true);
              log("overlay → loaded (webview)", oUrl);
            } catch (e) {
              log("overlay → failed (webview)", e);
            }
          }
        }

        lastUrlRef.current = rtmpUrl;
        currentMatchRef.current = mid;
        setLiveStartAt(Date.now());
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

  useEffect(() => {
    if (!autoOnLive || !courtId) return;

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

    if (currentMatchId && currentMatchStatus !== "live") {
      if (mode === "live" || mode === "stopping") {
        (async () => {
          setStatusText(
            "Trận đã gán nhưng chưa ở trạng thái LIVE — dừng phát và chờ…"
          );
          try {
            await (notifyStreamEnded as any)({
              matchId: currentMatchRef.current,
              platform: "all",
            }).unwrap?.();
          } catch {}
          await stopNativeNow();
          setMode("idle");
          if (!gapWaitingRef.current && !gapWarnVisible) {
            beginGapWait();
          }
        })();
      } else {
        setStatusText(
          "Trận đã gán nhưng chưa ở trạng thái LIVE — đang chờ BE chuyển sang live…"
        );
        if (!gapWaitingRef.current && !gapWarnVisible) {
          beginGapWait();
        }
      }
      return;
    }

    if (currentMatchId && currentMatchStatus === "live") {
      clearGapTimers();

      if (
        currentMatchRef.current &&
        currentMatchRef.current !== currentMatchId
      ) {
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
            await stopNativeNow();
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
        return;
      }

      if (!currentMatchRef.current) {
        (async () => {
          const ok = await startForMatch(currentMatchId);
          if (ok) lastAutoStartedForRef.current = currentMatchId;
        })();
        return;
      }

      if (mode === "live") {
        setStatusText("Đang LIVE…");
      }
      return;
    }

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
          await stopNativeNow();
          setMode("idle");
          beginGapWait();
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
    currentMatchStatus,
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
  /* ====== Manual finish flow (đếm trong component con, không setInterval ở parent) ====== */
  const STOP_DURATION_MS = 5000;

  const handleFinishPress = useCallback(() => {
    // Đổi mode trước cho UI nhảy ngay
    setMode("stopping");

    // Haptics chạy async, không block UI
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const handleStopDone = useCallback(async () => {
    try {
      await (notifyStreamEnded as any)({
        matchId: currentMatchRef.current,
        platform: "all",
      }).unwrap?.();
    } catch {}
    await stopNativeNow();
    setMode("ended");
  }, [notifyStreamEnded, stopNativeNow]);

  const handleStopCancel = useCallback(() => {
    setMode("live");
  }, []);

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
      lastZoomSendTimeRef.current = Date.now();
    }
  }, []);

  /* ====== Live timer effect ====== */

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

      <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, {}]}>
        {/* Zoom + clock in-live */}
        {(mode === "live" || mode === "stopping") && (
          <>
            <View
              style={[
                styles.zoomBadge,
                { top: safeTop + 8, right: safeRight + 8 },
              ]}
            >
              <Text style={styles.zoomBadgeTxt}>{zoomUI.toFixed(1)}x</Text>
            </View>

            {/* ⏱️ Đồng hồ live tách riêng để re-render nhẹ hơn */}
            <LiveTimerBar
              mode={mode}
              liveStartAt={liveStartAt}
              safeTop={safeTop}
              safeLeft={safeLeft}
              safeRight={safeRight}
            />
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
            <View
              style={[
                styles.liveTopLeft,
                { top: safeTop + 6, left: safeLeft + 12 },
              ]}
            >
              <View style={styles.livePill}>
                <Text style={styles.livePillTxt}>LIVE</Text>
              </View>
            </View>

            <View
              style={[
                styles.liveBottomBar,
                {
                  bottom: 14 + safeBottom,
                  left: 10 + safeLeft,
                  right: 10 + safeRight,
                },
              ]}
            >
              <Pressable
                onPress={onSwitch}
                style={styles.bottomIconBtn}
                hitSlop={10}
              >
                <Icon name="camera-switch" size={22} color="#fff" />
              </Pressable>

              <Pressable
                onPress={onToggleMic}
                style={styles.bottomIconBtn}
                hitSlop={10}
              >
                <Icon
                  name={micMuted ? "microphone-off" : "microphone"}
                  size={22}
                  color="#fff"
                />
              </Pressable>

              <Pressable
                onPress={onToggleTorch}
                style={styles.bottomIconBtn}
                hitSlop={10}
              >
                <Icon
                  name={torchOn ? "flashlight-off" : "flashlight"}
                  size={22}
                  color="#fff"
                />
              </Pressable>

              <Pressable
                onPress={() => setQualityMenuVisible(true)}
                style={styles.bottomQualityBtn}
                hitSlop={10}
              >
                <Icon name="cog" size={20} color="#fff" />
                <Text style={styles.bottomQualityTxt}>
                  {qualityChoice === "auto" && autoQualityLabel
                    ? autoQualityLabel
                    : currentQualityPreset.shortLabel ??
                      currentQualityPreset.label}
                </Text>
              </Pressable>

              <Pressable
                style={styles.finishBtn}
                onPress={handleFinishPress}
                hitSlop={10}
              >
                <Text style={styles.finishTxt}>Finish</Text>
              </Pressable>
            </View>
          </>
        )}

        {/* STOPPING */}
        {mode === "stopping" && (
          <StoppingOverlay
            key="stopping-overlay"
            durationMs={STOP_DURATION_MS}
            safeBottom={safeBottom}
            onCancel={handleStopCancel}
            onDone={handleStopDone}
          />
        )}

        {/* GAP WARNING */}
        {gapWarnVisible && (
          <GapWarningOverlay
            durationMs={GAP_WARN_MS}
            safeBottom={safeBottom}
            onCancel={cancelAutoStop}
            onDone={handleGapAutoStop}
          />
        )}

        {/* ENDED */}
        {mode === "ended" && (
          <View style={styles.overlay}>
            <Text style={styles.endedTitle}>
              Đã kết thúc buổi phát trực tiếp
            </Text>
            <View style={[styles.endedBtns, { bottom: 16 + safeBottom }]}>
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

        {/* QUALITY MENU */}
        {qualityMenuVisible && (
          <View style={styles.qualityOverlay} pointerEvents="auto">
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setQualityMenuVisible(false)}
            />
            <View
              style={[styles.qualitySheet, { paddingBottom: safeBottom + 16 }]}
            >
              <Text style={styles.qualityTitle}>Chất lượng video</Text>
              <Text style={styles.qualitySubtitle}>
                Áp dụng cho lần phát tiếp theo. Đang chọn:{" "}
                {qualityChoice === "auto" && autoQualityLabel
                  ? autoQualityLabel
                  : currentQualityPreset.label}
              </Text>

              {(Object.keys(QUALITY_PRESETS) as QualityId[]).map((id) => {
                const preset = QUALITY_PRESETS[id];
                const active = id === qualityChoice;

                if (id === "auto") {
                  return (
                    <Pressable
                      key={id}
                      onPress={() => handleQualitySelect(id)}
                      style={[
                        styles.qualityItem,
                        active && styles.qualityItemActive,
                      ]}
                    >
                      <View>
                        <Text style={styles.qualityItemLabel}>
                          {autoQualityLabel ?? preset.label}
                        </Text>
                        <Text style={styles.qualityItemSub}>
                          Hệ thống tự tối ưu theo máy và mạng
                        </Text>
                      </View>
                      {active && (
                        <Icon name="check-circle" size={22} color="#4ade80" />
                      )}
                    </Pressable>
                  );
                }

                return (
                  <Pressable
                    key={id}
                    onPress={() => handleQualitySelect(id)}
                    style={[
                      styles.qualityItem,
                      active && styles.qualityItemActive,
                    ]}
                  >
                    <View>
                      <Text style={styles.qualityItemLabel}>
                        {preset.label}
                      </Text>
                    </View>
                    {active && (
                      <Icon name="check-circle" size={22} color="#4ade80" />
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* ORIENTATION GATE */}
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
                <View
                  style={{
                    marginTop: 10,
                    alignItems: "center",
                  }}
                >
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
  idleSub: {
    color: "rgba(255,255,255,0.8)",
    marginTop: 4,
    fontSize: 12,
  },
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
    height: 50,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  bottomIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },
  bottomQualityBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    marginLeft: 4,
    marginRight: 8,
  },
  bottomQualityTxt: {
    color: "#fff",
    fontSize: 12,
    marginLeft: 6,
  },
  liveIcon: { color: "#fff", fontSize: 18, marginHorizontal: 8 },
  finishBtn: {
    marginLeft: "auto",
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  finishTxt: { color: "#111", fontWeight: "800", fontSize: 14 },
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
  progressText: {
    color: "#fff",
    marginTop: 12,
    fontWeight: "600",
  },
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
  cancelBigTxt: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
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
  gateBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
  gateHint: { color: "#fff", marginTop: 8, fontSize: 12 },
  gateHint2: {
    color: "rgba(255,255,255,0.7)",
    marginTop: 12,
    fontSize: 12,
    textAlign: "center",
  },
  qualityOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  qualitySheet: {
    backgroundColor: "rgba(18,18,18,0.98)",
    paddingHorizontal: 16,
    paddingTop: 14,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  qualityTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  qualitySubtitle: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    marginBottom: 10,
  },
  qualityItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 10,
    paddingHorizontal: 10,
    marginBottom: 4,
  },
  qualityItemActive: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  qualityItemLabel: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  qualityItemSub: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    marginTop: 2,
  },
  hdProcessingBanner: {
    position: "absolute",
    backgroundColor: "rgba(255, 165, 0, 0.95)",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  hdProcessingText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  hdProcessingSub: {
    color: "rgba(255, 255, 255, 0.95)",
    fontSize: 10,
    marginTop: 2,
  },
});
