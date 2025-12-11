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
  requireNativeComponent,
  UIManager,
  NativeEventEmitter,
} from "react-native";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons as Icon } from "@expo/vector-icons";
import { PinchGestureHandler, State } from "react-native-gesture-handler";
import { Audio } from "expo-av";
import * as Haptics from "expo-haptics";
import * as ScreenOrientation from "expo-screen-orientation";
import * as Brightness from "expo-brightness";
import throttle from "lodash/throttle";

import { NetworkStatsBottomSheet } from "../components/Networkstatsbottomsheet";
import StoppingOverlay from "../components/StoppingOverlay";
import GapWarningOverlay from "../components/GapWarningOverlay"; // <- không dùng nữa nhưng giữ import nếu còn dùng chỗ khác

/* ====== SFX ====== */
import torch_on from "@/assets/sfx/click4.mp3";
import torch_off from "@/assets/sfx/click4.mp3";
import mic_on from "@/assets/sfx/click4.mp3";
import mic_off from "@/assets/sfx/click4.mp3";

/* ====== RTK Query ====== */
import {
  // useGetCurrentMatchByCourtQuery, // ❌ bỏ
  useCreateLiveSessionMutation,
  useNotifyStreamStartedMutation,
  useNotifyStreamEndedMutation,
  useGetOverlaySnapshotQuery,
  useGetUserMatchDetailsQuery, // ✅ dùng hook mới
} from "@/slices/liveStreamingApiSlice";
import { useGetOverlayConfigQuery } from "@/slices/overlayApiSlice";

/* ====== Socket ====== */
import { useSocket } from "@/context/SocketContext";
import { videoUploader } from "@/utils/videoUploader";
import { useUserMatchHeader } from "@/hooks/useUserMatchHeader";

/* ====== Native camera/rtmp ====== */
const COMPONENT_NAME = "RtmpPreviewView";
(UIManager as any).getViewManagerConfig?.(COMPONENT_NAME);
const _CachedRtmpPreviewView =
  (global as any).__RtmpPreviewView ||
  requireNativeComponent<{}>(COMPONENT_NAME);
(global as any).__RtmpPreviewView = _CachedRtmpPreviewView;
const RtmpPreviewView = _CachedRtmpPreviewView;
const Live = (NativeModules as any).FacebookLiveModule;

// ✅ Native Timer View (debounce timer JS)
const TIMER_COMPONENT_NAME = "LiveTimerView";
(UIManager as any).getViewManagerConfig?.(TIMER_COMPONENT_NAME);

const _CachedLiveTimerView =
  (global as any).__LiveTimerView ||
  requireNativeComponent<{ startTimeMs: number }>(TIMER_COMPONENT_NAME);

(global as any).__LiveTimerView = _CachedLiveTimerView;
const LiveTimerView = _CachedLiveTimerView;

/* ================================================================================== */
/*                              Battery Saver Overlay                                 */
/* ================================================================================== */

const BatterySaverOverlay = React.memo(
  ({
    visible,
    isRecording,
    onToggle,
  }: {
    visible: boolean;
    isRecording: boolean;
    onToggle: () => void;
  }) => {
    if (!visible) return null;

    return (
      <Pressable
        style={styles.batterySaverOverlay}
        onPress={onToggle}
        activeOpacity={1}
      >
        <View style={styles.batterySaverOverlay}>
          <View style={styles.batterySaverContent}>
            <Icon name="battery-charging" size={48} color="#4ade80" />
            <Text style={styles.batterySaverTitle}>Chế độ tiết kiệm pin</Text>
            <Text style={styles.batterySaverDesc}>
              Camera đang live bình thường{"\n"}
              Màn hình tắt để tiết kiệm pin
            </Text>

            <View style={styles.batterySaverStats}>
              <View style={styles.batterySaverStat}>
                <Icon name="record-circle" size={16} color="#E53935" />
                <Text style={styles.batterySaverStatText}>LIVE</Text>
              </View>

              {isRecording && (
                <View style={styles.batterySaverStat}>
                  <Icon name="record" size={16} color="#dc2626" />
                  <Text style={styles.batterySaverStatText}>REC</Text>
                </View>
              )}
            </View>
            <Text style={styles.batterySaverHint}>
              Nhấn nút pin để tắt chế độ tiết kiệm pin
            </Text>
          </View>
        </View>
      </Pressable>
    );
  }
);

/* ====== Overlay helper ====== */
const getMatchIdFromPayload = (data: any): string | null => {
  if (!data) return null;
  if (typeof data._id === "string") return data._id;
  if (typeof data.id === "string") return data.id;
  if (typeof data.matchId === "string") return data.matchId;
  if (data.match) {
    if (typeof data.match._id === "string") return data.match._id;
    if (typeof data.match.id === "string") return data.match.id;
  }
  return null;
};

/* ====== DEBUG ====== */
const LOG = true;
const log = (...args: any[]) =>
  LOG && console.log("[LiveUserMatch]", new Date().toISOString(), ...args);

/* ====== Types ====== */
type Mode = "idle" | "live" | "stopping" | "ended";
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

type Props = {
  tournamentHref?: string;
  homeHref?: string;
  onFinishedGoToTournament?: () => void;
  onFinishedGoHome?: () => void;
  matchId: string; // ✅ trận giao hữu / user match
  autoOnLive?: boolean;
};

/* ====== Quality presets ====== */
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

const ZoomBadge = React.memo(
  ({ zoom, top, right }: { zoom: number; top: number; right: number }) => {
    return (
      <View style={[styles.zoomBadge, { top, right }]}>
        <Text style={styles.zoomBadgeTxt}>{zoom.toFixed(1)}x</Text>
      </View>
    );
  }
);

export default function LiveLikeFBUserMatchScreen({
  tournamentHref,
  homeHref,
  onFinishedGoToTournament,
  onFinishedGoHome,
  matchId,
  autoOnLive = true,
}: Props) {
  const params = useLocalSearchParams();
  const { userMatch } = params;
  useUserMatchHeader(userMatch && "user");
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const playSfx = useSfx();
  const socket = useSocket();

  const safeTop = insets.top ?? 0;
  const safeBottom = insets.bottom ?? 0;
  const safeLeft = insets.left ?? 0;
  const safeRight = insets.right ?? 0;

  const [networkStatsVisible, setNetworkStatsVisible] = useState(false);

  /* ==== States ==== */
  const [mode, setMode] = useState<Mode>("idle");
  const [statusText, setStatusText] = useState<string>(
    "Đang chuẩn bị trận giao hữu…"
  );
  const [torchOn, setTorchOn] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [liveStartAt, setLiveStartAt] = useState<number | null>(null);

  // Surface error recovery
  const [surfaceError, setSurfaceError] = useState(false);
  const recoveryAttemptsRef = useRef(0);
  const MAX_RECOVERY_ATTEMPTS = 3;
  const lastSuccessfulPreviewRef = useRef<number>(0);

  /* ==== Orientation ==== */
  const [orientation, setOrientation] = useState<Orient | null>(null);
  const [locking, setLocking] = useState(false);
  const orientationChosen = orientation !== null;

  /* ==== Recording ==== */
  const [isRecording, setIsRecording] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<number, number>>(
    {}
  );
  const [pendingUploads, setPendingUploads] = useState(0);

  // Battery saver
  const [overlayVisibleOnUI, setOverlayVisibleOnUI] = useState(true);
  const [batterySaverMode, setBatterySaverMode] = useState(false);
  const brightnessBeforeSaverRef = useRef<number>(1);

  useEffect(() => {
    const unsubscribe = videoUploader.onProgress((progress) => {
      setUploadProgress(progress);
      const pending = Object.values(progress).filter(
        (p) => p > 0 && p < 100 && p !== -1
      ).length;
      setPendingUploads(pending);
    });
    return unsubscribe;
  }, []);

  const unlockOrientation = useCallback(async () => {
    try {
      await ScreenOrientation.unlockAsync();
    } catch {}
    try {
      await Live.enableAutoRotate?.(true);
    } catch {}
  }, []);

  /* ==== Refs ==== */
  const startedPreviewRef = useRef(false);
  const lastUrlRef = useRef<string | null>(null);
  const currentMatchRef = useRef<string | null>(null);
  const previewRetryRef = useRef<{ cancel: boolean }>({ cancel: false });
  const chosenProfileRef = useRef<StreamProfile | null>(null);
  const autoProfileRef = useRef<StreamProfile | null>(null);
  const kickPreviewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  // overlay cache
  const socketHasDataRef = useRef(false);
  const latestValidDataRef = useRef<any>(null);

  /* ==== Zoom ==== */
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
  const MIN_ZOOM_SEND_INTERVAL = 500;
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
      }, 800);

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

  /* ==== Quality ==== */
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

  /* ==== Preview bootstrap ==== */
  const startPreviewWithRetry = useCallback(async () => {
    if (startedPreviewRef.current) {
      if (Platform.OS === "ios") {
        try {
          await Live.refreshPreview?.();
          log("preview → refreshed (iOS)");
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
    const maxAttempts = 15;
    previewRetryRef.current.cancel = false;

    while (
      !previewRetryRef.current.cancel &&
      !startedPreviewRef.current &&
      attempts < maxAttempts
    ) {
      try {
        log(`preview → attempt ${attempts + 1}/${maxAttempts}`);

        if (attempts === 0) {
          await new Promise((r) => setTimeout(r, 500));
        }

        await Live.enableAutoRotate?.(true);
        await Live.startPreview?.();

        zoomUIRef.current = 1;
        setZoomUI(1);
        lastSentZoomRef.current = 1;
        Live.setZoom?.(1);

        startedPreviewRef.current = true;
        lastSuccessfulPreviewRef.current = Date.now();
        recoveryAttemptsRef.current = 0;

        log(`preview → started after ${attempts + 1} attempts`);
        return true;
      } catch (e: any) {
        const msg = String(e?.message || e);
        const isSurfaceError = /surface|invalid|illegalargument/i.test(msg);

        log(`preview → attempt ${attempts + 1} failed: ${msg}`);

        const baseDelay = isSurfaceError ? 300 : 150;
        const delay = Math.min(baseDelay * Math.pow(1.5, attempts), 2000);

        log(`preview → waiting ${delay}ms before retry...`);
        await new Promise((r) => setTimeout(r, delay));
      }
      attempts += 1;
    }

    log("preview → not started (retry exhausted/cancelled)");
    return startedPreviewRef.current;
  }, []);

  const applyOrientationChoice = useCallback(
    async (choice: Orient) => {
      setLocking(true);
      try {
        await Haptics.selectionAsync();

        if (startedPreviewRef.current) {
          try {
            log("orientation → stopping preview before change");
            await Live.stopPreview?.();
            startedPreviewRef.current = false;
            await new Promise((r) => setTimeout(r, 300));
          } catch (e) {
            log("orientation → stopPreview error (ignored):", e);
          }
        }

        await ScreenOrientation.lockAsync(
          choice === "portrait"
            ? ScreenOrientation.OrientationLock.PORTRAIT
            : ScreenOrientation.OrientationLock.LANDSCAPE
        );

        await Live.enableAutoRotate?.(false);
        await Live.lockOrientation?.(choice.toUpperCase());

        log("orientation → waiting for surface recreate...");
        await new Promise((r) => setTimeout(r, 1500));

        setOrientation(choice);

        log("orientation → restarting preview...");
        await new Promise((r) => setTimeout(r, 500));
        const success = await startPreviewWithRetry();

        if (!success) {
          log("orientation → preview restart failed, will retry...");
          await new Promise((r) => setTimeout(r, 1000));
          await startPreviewWithRetry();
        }
      } catch (e) {
        log("❌ Orientation lock failed", e);
      }
      setLocking(false);
    },
    [startPreviewWithRetry]
  );

  const kickPreview = useCallback(async () => {
    if (kickPreviewDebounceRef.current) {
      clearTimeout(kickPreviewDebounceRef.current);
    }

    kickPreviewDebounceRef.current = setTimeout(async () => {
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

      log("kickPreview → starting preview...");
      await startPreviewWithRetry();
    }, 300);
  }, [startPreviewWithRetry]);

  useEffect(() => {
    Live.enableThermalProtect?.(false);

    return () => {
      log("component → unmounting, full cleanup...");

      if (kickPreviewDebounceRef.current) {
        clearTimeout(kickPreviewDebounceRef.current);
      }

      previewRetryRef.current.cancel = true;

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

        log("component → cleanup done");
      })();
    };
  }, [unlockOrientation]);

  useFocusEffect(
    useCallback(() => {
      log("focus → screen focused");
      previewRetryRef.current.cancel = false;

      const initTimer = setTimeout(() => {
        kickPreview();
      }, 300);

      return () => {
        log("focus → screen unfocused");
        clearTimeout(initTimer);
        previewRetryRef.current.cancel = true;

        (async () => {
          try {
            if (startedPreviewRef.current) {
              await Live.stopPreview?.();
              startedPreviewRef.current = false;
              log("focus-cleanup → stopPreview done");
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
      log(`AppState → ${nextState}`);

      if (nextState === "active") {
        previewRetryRef.current.cancel = false;

        await new Promise((r) => setTimeout(r, 1000));

        if (!startedPreviewRef.current) {
          log("AppState → preview not started, attempting start...");

          for (let i = 0; i < 3; i++) {
            await new Promise((r) => setTimeout(r, 500 * (i + 1)));
            const success = await startPreviewWithRetry();
            if (success) {
              log(`AppState → preview started on attempt ${i + 1}`);
              break;
            }
          }
        } else if (Platform.OS === "ios") {
          await new Promise((r) => setTimeout(r, 500));
          try {
            await Live.refreshPreview?.();
            log("AppState → preview refreshed (iOS)");
          } catch (e) {
            log("AppState → refresh failed, restarting...", e);
            startedPreviewRef.current = false;
            await startPreviewWithRetry();
          }
        } else if (Platform.OS === "android") {
          try {
            const state = await Live.getSurfaceState?.();
            log("AppState → surface state:", state);

            if (!state?.surfaceValid) {
              log("AppState → surface invalid, restarting preview...");
              startedPreviewRef.current = false;
              await new Promise((r) => setTimeout(r, 500));
              await startPreviewWithRetry();
            }
          } catch (e) {
            log("AppState → getSurfaceState error:", e);
          }
        }
      } else {
        previewRetryRef.current.cancel = true;

        await new Promise((r) => setTimeout(r, 100));

        try {
          if (startedPreviewRef.current) {
            await Live.stopPreview?.();
            startedPreviewRef.current = false;
            log("AppState → preview stopped");
          }
        } catch (e) {
          log("AppState → stopPreview error:", e);
        }
      }
    };

    const sub = AppState.addEventListener("change", handler);
    return () => sub.remove();
  }, [mode, startPreviewWithRetry]);

  /* ==== Adaptive profile ==== */
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

    if (isRecording) {
      try {
        await videoUploader.stopRecording();
        setIsRecording(false);
        log("🎥 Recording stopped");

        setTimeout(() => {
          videoUploader
            .cleanupOldRecordings(5)
            .catch((e) => log("⚠️ Cleanup failed:", e));
        }, 2000);
      } catch (e) {
        log("⚠️ Recording stop failed:", e);
      }
    }

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
  }, [isRecording]);

  /* ==== Query (match by user) ==== */
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

  const shouldPoll = isFocused && appActive && !!matchId;

  const {
    data: matchData,
    isFetching: matchFetching,
    isLoading: matchLoading,
    error: matchError,
  } = useGetUserMatchDetailsQuery(matchId, {
    skip: !shouldPoll,
    pollingInterval: shouldPoll ? 5000 : 0,
    refetchOnMountOrArgChange: true,
  });

  useEffect(() => {
    log("poll-config", { shouldPoll, matchId });
  }, [shouldPoll, matchId]);

  useEffect(() => {
    if (!shouldPoll) return;
    if (matchError) {
      log("match error", matchError);
      return;
    }
    if (matchLoading) {
      log("match loading…");
      return;
    }
    if (matchFetching) log("match fetching…");

    const m = (matchData as any)?.match ?? matchData ?? null;

    log("match ok", {
      currentMatchId: m?._id || null,
      statusMatch: m?.status || null,
      isBreak: m?.isBreak || null,
    });
  }, [matchData, matchFetching, matchLoading, matchError, shouldPoll]);

  const matchObj = (matchData as any)?.match ?? matchData ?? null;
  const currentMatchId: string | null = matchObj?._id ?? matchId ?? null;
  const currentMatchStatus: string | null = matchObj?.status ?? null;

  const overlayTournamentId =
    matchObj?.tournament?._id || matchObj?.tournamentId || null;

  const overlayParams = useMemo(() => {
    const params: Record<string, any> = {
      limit: 12,
      featured: "1",
    };

    if (overlayTournamentId) {
      params.tournamentId = overlayTournamentId;
    }

    return params;
  }, [overlayTournamentId]);

  const { data: overlayConfig } = useGetOverlayConfigQuery(overlayParams, {
    skip: mode !== "live",
    pollingInterval: 0,
    refetchOnMountOrArgChange: true,
  });

  useEffect(() => {
    if (overlayConfig) {
      log("Overlay config loaded", {
        webLogoUrl: overlayConfig.webLogoUrl,
        sponsorsCount: overlayConfig.sponsors?.length || 0,
      });
    }
  }, [overlayConfig]);

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

  /* ==== Mutations ==== */
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
        alert(e?.data?.message || "Không thể tạo live session.");
        log("createLiveSession → FAILED", e);
        return null;
      }
    },
    [createLiveSession]
  );

  /* ==== Overlay snapshot + socket ==== */
  const { data: overlaySnapshot } = useGetOverlaySnapshotQuery(
    currentMatchId || "",
    {
      skip: !currentMatchId || mode !== "live",
      pollingInterval: 0,
      refetchOnMountOrArgChange: true,
    }
  );

  const [realtimeOverlayData, setRealtimeOverlayData] = useState<any>(null);

  const updateOverlayNow = useMemo(
    () =>
      throttle(async (incomingData: any) => {
        if (mode !== "live" || !incomingData) return;

        let finalData = incomingData;

        const hasTeamInfo =
          incomingData.pairA || incomingData.pairB || incomingData.teams;

        if (hasTeamInfo) {
          latestValidDataRef.current = incomingData;
        } else {
          if (latestValidDataRef.current) {
            finalData = { ...latestValidDataRef.current, ...incomingData };

            if (!finalData.pairA)
              finalData.pairA = latestValidDataRef.current.pairA;
            if (!finalData.pairB)
              finalData.pairB = latestValidDataRef.current.pairB;
            if (!finalData.teams)
              finalData.teams = latestValidDataRef.current.teams;
            if (!finalData.tournament)
              finalData.tournament = latestValidDataRef.current.tournament;
          } else {
            return;
          }
        }

        if (LOG) {
          console.log("overlay data source", finalData);
        }

        try {
          const safeStr = (val: any, fallback = "") =>
            val != null ? String(val) : fallback;
          const safeNum = (val: any, fallback = 0) =>
            typeof val === "number" ? val : fallback;
          const safeBool = (val: any) => Boolean(val);

          const p1 = finalData.pairA || finalData.teams?.A;
          const p2 = finalData.pairB || finalData.teams?.B;

          const getNm = (p: any, def: string) => {
            if (!p) return def;
            if (p.name) return p.name;
            if (p.teamName) return p.teamName;
            const pl1 =
              p.player1?.nickName ||
              p.player1?.fullName ||
              p.player1?.displayName ||
              "";
            const pl2 =
              p.player2?.nickName ||
              p.player2?.fullName ||
              p.player2?.displayName ||
              "";
            if (p.player2)
              return pl1 && pl2 ? `${pl1} / ${pl2}` : pl1 || pl2 || def;
            return pl1 || def;
          };

          const teamAName = getNm(p1, "Team A");
          const teamBName = getNm(p2, "Team B");

          const currentIdx = finalData.currentGame || 0;
          const currentScore =
            finalData.gameScores && finalData.gameScores[currentIdx]
              ? finalData.gameScores[currentIdx]
              : { a: 0, b: 0 };

          const sponsorLogos = Array.isArray(overlayConfig?.sponsors)
            ? overlayConfig.sponsors.map((s: any) => s?.logoUrl).filter(Boolean)
            : [];

          const logoTournamentUrl = overlayConfig?.tournamentImageUrl;

          const overlayData = {
            theme: safeStr(
              finalData?.tournament?.overlay?.theme ||
                finalData?.bracket?.overlay?.theme,
              "dark"
            ),
            size: safeStr(
              finalData?.tournament?.overlay?.size ||
                finalData?.bracket?.overlay?.size,
              "md"
            ),
            accentA: safeStr(
              finalData?.tournament?.overlay?.accentA ||
                finalData?.bracket?.overlay?.accentA,
              "#25C2A0"
            ),
            accentB: safeStr(
              finalData?.tournament?.overlay?.accentB ||
                finalData?.bracket?.overlay?.accentB,
              "#4F46E5"
            ),
            rounded: safeNum(
              finalData?.tournament?.overlay?.rounded ||
                finalData?.bracket?.overlay?.rounded,
              18
            ),
            shadow: safeBool(
              finalData?.tournament?.overlay?.shadow ??
                finalData?.bracket?.overlay?.shadow ??
                true
            ),
            showSets: safeBool(
              finalData?.tournament?.overlay?.showSets ??
                finalData?.bracket?.overlay?.showSets ??
                true
            ),
            nameScale: safeNum(
              finalData?.tournament?.overlay?.nameScale ||
                finalData?.bracket?.overlay?.nameScale,
              1.0
            ),
            scoreScale: safeNum(
              finalData?.tournament?.overlay?.scoreScale ||
                finalData?.bracket?.overlay?.scoreScale,
              1.0
            ),

            tournamentName: safeStr(finalData?.tournament?.name),
            courtName: safeStr(finalData?.court?.name || finalData?.courtName),
            tournamentLogoUrl: logoTournamentUrl,
            phaseText: safeStr(finalData?.bracket?.name),
            roundLabel: safeStr(finalData?.roundCode),

            teamAName,
            teamBName,

            scoreA: safeNum(currentScore.a, 0),
            scoreB: safeNum(currentScore.b, 0),

            serveSide: safeStr(finalData?.serve?.side, "A").toUpperCase(),
            serveCount: Math.max(
              1,
              Math.min(2, safeNum(finalData?.serve?.server, 1))
            ),

            isBreak: safeBool(finalData?.isBreak?.active || false),
            breakNote: safeStr(finalData?.isBreak?.note || ""),
            breakTeams: `${teamAName} vs ${teamBName}`,
            breakRound: safeStr(
              finalData?.roundCode || finalData?.bracket?.name
            ),

            isDefaultDesign: false,
            overlayEnabled: true,
            webLogoUrl:
              "https://pickletour.vn/uploads/avatars/1765084294948-1764152220888-1762020439803-photo_2025-11-02_00-50-33-1-1764152220890.jpg",
            sponsorLogos,

            showClock: false,
            scaleScore: 0.5,
            showTime: true,
            overlayVersion: 2,

            sets: Array.isArray(finalData?.gameScores)
              ? finalData.gameScores.map((g: any, i: number) => ({
                  index: i + 1,
                  a: g?.a ?? null,
                  b: g?.b ?? null,
                  winner: g?.winner || "",
                  current: i === (finalData?.currentGame || 0),
                }))
              : [],
          };

          await Live.overlayUpdate?.(overlayData);
        } catch (e) {
          log("overlayUpdate → error", e);
        }
      }, 500),
    [mode, overlayConfig]
  );

  useEffect(() => {
    if (!currentMatchId || !socket || mode !== "live") {
      return;
    }

    log("socket → joining match room for overlay", currentMatchId);
    socket.emit("match:join", { matchId: currentMatchId });

    const onUpdate = (data?: any) => {
      const payloadMatchId = getMatchIdFromPayload(data);
      const activeMatchId = currentMatchRef.current;

      if (
        !payloadMatchId ||
        !activeMatchId ||
        payloadMatchId !== activeMatchId
      ) {
        return;
      }

      if (data) {
        socketHasDataRef.current = true;
        updateOverlayNow(data);
      }
    };

    socket.on("match:snapshot", onUpdate);
    socket.on("score:updated", onUpdate);

    return () => {
      log("socket → leaving match room", currentMatchId);
      socket.emit("match:leave", { matchId: currentMatchId });
      socket.off("match:snapshot", onUpdate);
      socket.off("score:updated", onUpdate);
    };
  }, [currentMatchId, socket, mode, updateOverlayNow]);

  useEffect(() => {
    if (mode === "live" && overlaySnapshot && !socketHasDataRef.current) {
      log("overlaySnapshot → initial load from RTK");
      updateOverlayNow(overlaySnapshot);
    }
  }, [overlaySnapshot, mode, updateOverlayNow]);

  /* ==== Start for match ==== */
  const lastAutoStartedForRef = useRef<string | null>(null);

  const startForMatch = useCallback(
    async (mid: string) => {
      if (!orientationChosen) {
        setStatusText("Vui lòng chọn Dọc hoặc Ngang để bắt đầu phát.");
        return false;
      }

      try {
        const surfaceState = await Live.getSurfaceState?.();
        log("startForMatch → surface state:", surfaceState);

        if (!surfaceState?.surfaceValid) {
          setStatusText("Đang khởi động camera...");

          startedPreviewRef.current = false;
          await new Promise((r) => setTimeout(r, 500));
          const previewOk = await startPreviewWithRetry();

          if (!previewOk) {
            setStatusText("❌ Không thể khởi động camera");
            Alert.alert("Lỗi", "Không thể khởi động camera. Vui lòng thử lại.");
            return false;
          }
        }
      } catch (e) {
        console.log(e)
        log("startForMatch → getSurfaceState error (ignored):", e);
      }

      setStatusText("Trận đã sẵn sàng — chuẩn bị phát…");

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

        let startSuccess = false;
        let lastError: any = null;

        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            log(`startForMatch → attempt ${attempt + 1}/3`);
            await startNative(rtmpUrl, profile);
            startSuccess = true;
            break;
          } catch (e: any) {
            lastError = e;
            const msg = String(e?.message || e);

            if (/surface|invalid/i.test(msg)) {
              log(`startForMatch → surface error, waiting before retry...`);
              await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
            } else {
              break;
            }
          }
        }

        if (!startSuccess) {
          throw lastError || new Error("Failed to start stream");
        }

        try {
          const fw = profile.width;
          const fh = profile.height;

          await Live.overlayLoad("", fw, fh, "tl", 100, 100, 0, 0);
          await Live.overlaySetVisible?.(true);
          log("overlay → loaded (native)");
        } catch (e) {
          log("overlay → failed (native)", e);
        }

        lastUrlRef.current = rtmpUrl;
        currentMatchRef.current = mid;
        setLiveStartAt(Date.now());
        socketHasDataRef.current = false;
        latestValidDataRef.current = null;
        setMode("live");
        setStatusText("Đang LIVE…");

        setTimeout(async () => {
          try {
            const support = await Live.checkRecordingSupport?.();
            console.log("🎥 Recording support:", support);

            if (!support?.supported) {
              console.warn("⚠️ Recording not supported:", support?.reason);
              return;
            }

            if (!support?.isStreaming) {
              console.warn("⚠️ Stream not active");
              return;
            }

            await videoUploader.startRecording(mid);
            setIsRecording(true);
            log("🎥 Recording started");
          } catch (e) {
            console.log("⚠️ Recording start failed (non-critical):", e);
          }
        }, 2000);

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
      startPreviewWithRetry,
    ]
  );

  /* ==== Android native error events ==== */
  useEffect(() => {
    if (Platform.OS !== "android") return;

    const eventEmitter = new NativeEventEmitter(
      NativeModules.FacebookLiveModule
    );

    const errorSub = eventEmitter.addListener(
      "onConnectionFailed",
      async (event) => {
        const reason = String(event?.reason || "").toLowerCase();

        if (
          reason.includes("connection") ||
          reason.includes("network") ||
          reason.includes("timeout")
        ) {
          log("🔴 Connection error detected:", reason);

          if (
            mode === "live" &&
            currentMatchRef.current &&
            lastUrlRef.current
          ) {
            log("🔄 Attempting stream reconnect...");
            setStatusText("Đang kết nối lại...");

            await new Promise((r) => setTimeout(r, 3000));

            try {
              const profile = chosenProfileRef.current;
              if (profile && lastUrlRef.current) {
                await startNative(lastUrlRef.current, profile);
                log("✅ Stream reconnected");
                setStatusText("Đang LIVE…");
              }
            } catch (e) {
              log("❌ Reconnect failed:", e);
              setStatusText("Mất kết nối. Đang thử lại...");
            }
          }
        }

        if (reason.includes("surface") || reason.includes("invalid")) {
          log("🔴 Surface error detected:", reason);
          setSurfaceError(true);

          if (recoveryAttemptsRef.current < MAX_RECOVERY_ATTEMPTS) {
            recoveryAttemptsRef.current += 1;
            log(
              `🔄 Recovery attempt ${recoveryAttemptsRef.current}/${MAX_RECOVERY_ATTEMPTS}`
            );

            try {
              await Live.stopPreview?.();
              startedPreviewRef.current = false;
            } catch {}

            await new Promise((r) => setTimeout(r, 2000));

            const success = await startPreviewWithRetry();

            if (success) {
              setSurfaceError(false);
              log("✅ Recovery successful");

              if (mode === "live" && currentMatchRef.current) {
                log("🔄 Restarting stream...");
                await new Promise((r) => setTimeout(r, 1000));
                await startForMatch(currentMatchRef.current);
              }
            } else {
              log("❌ Recovery failed");
            }
          } else {
            log("❌ Max recovery attempts reached");
            Alert.alert(
              "Lỗi Camera",
              "Không thể khởi động camera. Vui lòng thử lại sau hoặc khởi động lại ứng dụng.",
              [
                {
                  text: "Thử lại",
                  onPress: async () => {
                    recoveryAttemptsRef.current = 0;
                    await startPreviewWithRetry();
                  },
                },
                {
                  text: "Quay lại",
                  onPress: () => router.back(),
                  style: "cancel",
                },
              ]
            );
          }
        }
      }
    );

    return () => errorSub.remove();
  }, [mode, startPreviewWithRetry, startForMatch]);

  /* ==== Surface health check ==== */
  useEffect(() => {
    if (Platform.OS !== "android" || mode !== "live") return;

    const healthCheck = setInterval(async () => {
      try {
        const state = await Live.getSurfaceState?.();

        if (state && !state.surfaceValid && state.isStreaming) {
          log("⚠️ Surface unhealthy during stream!");

          try {
            await Live.stopPreview?.();
            await new Promise((r) => setTimeout(r, 500));

            if (await Live.getSurfaceState?.().then((s) => s?.surfaceValid)) {
              await Live.startPreview?.();
              log("✅ Soft recovery successful");
            }
          } catch (e) {
            log("❌ Soft recovery failed:", e);
          }
        }
      } catch (e) {}
    }, 15000);

    return () => clearInterval(healthCheck);
  }, [mode]);

  /* ==== Cancel uploads on unmount ==== */
  useEffect(() => {
    return () => {
      if (pendingUploads > 0) {
        log("⚠️ Component unmounting with pending uploads, cancelling...");
        videoUploader.cancelAllUploads();
      }
    };
  }, [pendingUploads]);

  /* ==== Auto-on-LIVE logic (friendly match) ==== */
  useEffect(() => {
    if (!autoOnLive || !matchId) return;

    if (!orientationChosen) {
      if (currentMatchId) {
        setStatusText("Trận đã sẵn sàng. Chọn Dọc hoặc Ngang để bắt đầu phát.");
      } else {
        setStatusText("Chọn Dọc/Ngang để chuẩn bị phát.");
      }
      return;
    }

    if (!matchObj) {
      setStatusText("Đang tải thông tin trận đấu…");
      return;
    }

    // Nếu match đang LIVE
    if (currentMatchStatus === "live" && currentMatchId) {
      // chưa từng start
      if (!currentMatchRef.current) {
        (async () => {
          const ok = await startForMatch(currentMatchId);
          if (ok) lastAutoStartedForRef.current = currentMatchId;
        })();
        return;
      }

      // đang live trận khác (props đổi matchId)
      if (
        currentMatchRef.current &&
        currentMatchRef.current !== currentMatchId
      ) {
        (async () => {
          log("switch match: stop current then start (user match)", {
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
        return;
      }

      // Đã live đúng trận rồi
      if (mode === "live") {
        setStatusText("Đang LIVE…");
      }
      return;
    }

    // Match KHÔNG ở trạng thái LIVE
    if (mode === "live" || mode === "stopping") {
      (async () => {
        setStatusText(
          "Trận đã không còn ở trạng thái LIVE — dừng phát và chờ cập nhật…"
        );
        try {
          await (notifyStreamEnded as any)({
            matchId: currentMatchRef.current,
            platform: "all",
          }).unwrap?.();
        } catch {}
        await stopNativeNow();
        setMode("idle");
      })();
    } else {
      if (currentMatchStatus === "finished" || currentMatchStatus === "ended") {
        setStatusText("Trận giao hữu đã kết thúc.");
      } else {
        setStatusText(
          "Trận chưa ở trạng thái LIVE — chờ BTC / host chuyển sang LIVE…"
        );
      }
    }
  }, [
    autoOnLive,
    matchId,
    currentMatchId,
    currentMatchStatus,
    mode,
    orientationChosen,
    matchObj,
    startForMatch,
    stopNativeNow,
    notifyStreamEnded,
  ]);

  /* ==== Manual finish ==== */
  const STOP_DURATION_MS = 5000;

  const handleFinishPress = useCallback(() => {
    setMode("stopping");
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const handleStopDone = useCallback(async () => {
    setMode("ended");
    setStatusText("Đã kết thúc buổi phát trực tiếp.");
    log("🎬 UI switched to ended - cleanup starting in background");

    Promise.all([
      (async () => {
        try {
          await (notifyStreamEnded as any)({
            matchId: currentMatchRef.current,
            platform: "all",
          }).unwrap?.();
          log("✅ BE notified: stream ended");
        } catch (e) {
          log("⚠️ BE notification failed (non-critical)", e);
        }
      })(),
      (async () => {
        try {
          await stopNativeNow();
          log("✅ Native cleanup completed");
        } catch (e) {
          log("⚠️ Native cleanup error", e);
        }
      })(),
    ]).catch((e) => {
      log("⚠️ Some cleanup failed (non-critical)", e);
    });
  }, [stopNativeNow, notifyStreamEnded]);

  const handleStopCancel = useCallback(() => {
    setMode("live");
  }, []);

  /* ==== Toggles ==== */
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

  const toggleOverlayUI = useCallback(async () => {
    const nextVisible = !overlayVisibleOnUI;
    setOverlayVisibleOnUI(nextVisible);
    await Haptics.selectionAsync();

    try {
      await Live.overlaySetVisibleOnPreview?.(nextVisible);
      log(
        `🎨 Overlay UI: ${
          nextVisible ? "visible" : "hidden"
        } (stream unchanged)`
      );
    } catch (e) {
      log("⚠️ Toggle overlay UI error", e);
      setOverlayVisibleOnUI(!nextVisible);
    }
  }, [overlayVisibleOnUI]);

  const toggleBatterySaver = useCallback(async () => {
    const nextMode = !batterySaverMode;
    setBatterySaverMode(nextMode);
    await Haptics.selectionAsync();

    if (nextMode) {
      try {
        const current = await Brightness.getBrightnessAsync();
        brightnessBeforeSaverRef.current = current;

        await Brightness.setBrightnessAsync(0.01);

        if (torchOn) {
          setTorchOn(false);
          await Live.toggleTorch(false);
        }

        log("🔋 Battery Saver Mode: ON (brightness: 0.01)");
      } catch (e) {
        log("⚠️ Battery saver setup error", e);
      }
    } else {
      try {
        const saved = brightnessBeforeSaverRef.current;
        await Brightness.setBrightnessAsync(saved);

        log("🔋 Battery Saver Mode: OFF (brightness restored)");
      } catch (e) {
        log("⚠️ Battery saver cleanup error", e);
      }
    }
  }, [batterySaverMode, torchOn]);

  /* ==== Pinch ==== */
  const onPinchEvent = useCallback(
    (e: any) => {
      if (Platform.OS !== "ios") return;
      if (locking) return;

      const scale = e?.nativeEvent?.scale ?? 1;
      const desired = clampZoomUI(pinchBaseRef.current * scale);
      const stepped = Math.round(desired * 2) / 2;

      if (Math.abs(stepped - zoomUIRef.current) >= 0.3) {
        zoomUIRef.current = stepped;
        sendZoomRAF(stepped);
      }
    },
    [sendZoomRAF, locking]
  );

  const onPinchStateChange = useCallback((e: any) => {
    if (Platform.OS !== "ios") return;
    const st = e?.nativeEvent?.state;

    if (st === State.BEGAN) {
      pinchBaseRef.current = zoomUIRef.current;
    } else if (st === State.END || st === State.CANCELLED) {
      const stepped = Math.round(zoomUIRef.current * 2) / 2;
      zoomUIRef.current = stepped;

      setZoomUI(stepped);

      Live.setZoom?.(stepped);
      lastSentZoomRef.current = stepped;
      lastZoomSendTimeRef.current = Date.now();
    }
  }, []);

  /* ================================================================================== */
  /*                                       UI                                           */
  /* ================================================================================== */

  return (
    <View style={{ flex: 1, backgroundColor: "black" }}>
      <PinchGestureHandler
        enabled={!locking}
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
        {/* LIVE badge + timer + zoom */}
        {(mode === "live" || mode === "stopping") && (
          <>
            <View
              style={[
                styles.liveTopLeft,
                { top: safeTop + 8, left: safeLeft + 12 },
              ]}
            >
              <View style={styles.livePill}>
                <Text style={styles.livePillTxt}>LIVE</Text>
              </View>
              <LiveTimerView
                style={{ width: 80, height: 32 }}
                startTimeMs={liveStartAt || 0}
              />
            </View>

            <ZoomBadge zoom={zoomUI} top={safeTop + 8} right={safeRight + 8} />
          </>
        )}

        {/* Recording badge */}
        {mode === "live" && isRecording && (
          <View
            style={[
              styles.recordingBadge,
              {
                top: safeTop + 46,
                left: safeLeft + 12,
              },
            ]}
          >
            <View style={styles.recordingDot} />
            <Text style={styles.recordingText}>REC</Text>
          </View>
        )}

        {/* Upload progress */}
        {pendingUploads > 0 && (
          <View
            style={[
              styles.uploadBadge,
              { top: safeTop + 80, left: safeLeft + 12 },
            ]}
          >
            <ActivityIndicator size="small" color="#fff" />
            <Text style={styles.uploadText}>
              Uploading {pendingUploads} chunk{pendingUploads > 1 ? "s" : ""}
            </Text>
          </View>
        )}

        {/* Upload failed */}
        {Object.values(uploadProgress).some((p) => p === -1) && (
          <View
            style={[
              styles.uploadFailedBadge,
              { top: safeTop + 80, right: safeRight + 12 },
            ]}
          >
            <Icon name="alert-circle" size={14} color="#fff" />
            <Text style={styles.uploadFailedText}>Upload lỗi</Text>
          </View>
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

        {/* LIVE – Battery saver */}
        {mode === "live" && (
          <BatterySaverOverlay
            visible={batterySaverMode}
            isRecording={isRecording}
            onToggle={toggleBatterySaver}
          />
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

        {/* ENDED */}
        {mode === "ended" && (
          <View
            style={[
              styles.overlay,
              {
                top: safeTop,
                right: safeRight,
                left: safeLeft,
                bottom: safeBottom,
              },
            ]}
          >
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
                <Text style={styles.endedBtnTxt}>Về danh sách trận đấu</Text>
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

        {/* BOTTOM CONTROL BAR */}
        {mode === "live" && (
          <View
            style={[
              styles.liveBottomBar,
              {
                left: safeLeft + 12,
                right: safeRight + 12,
                bottom: safeBottom + 16,
              },
            ]}
          >
            {/* Đổi camera */}
            <Pressable
              disabled={mode !== "live"}
              onPress={onSwitch}
              style={({ pressed }) => [
                styles.bottomIconBtn,
                mode !== "live" && styles.bottomIconBtnDisabled,
                pressed && mode === "live" && { opacity: 0.7 },
              ]}
            >
              <Icon name="camera-switch" size={22} color="#fff" />
            </Pressable>

            {/* Đèn pin */}
            <Pressable
              disabled={mode !== "live"}
              onPress={onToggleTorch}
              style={({ pressed }) => [
                styles.bottomIconBtn,
                mode !== "live" && styles.bottomIconBtnDisabled,
                torchOn && styles.bottomIconBtnActive,
                pressed && mode === "live" && { opacity: 0.7 },
              ]}
            >
              <Icon
                name={torchOn ? "flashlight" : "flashlight-off"}
                size={22}
                color="#fff"
              />
            </Pressable>

            {/* Mic */}
            <Pressable
              disabled={mode !== "live"}
              onPress={onToggleMic}
              style={({ pressed }) => [
                styles.bottomIconBtn,
                mode !== "live" && styles.bottomIconBtnDisabled,
                micMuted && styles.bottomIconBtnActive,
                pressed && mode === "live" && { opacity: 0.7 },
              ]}
            >
              <Icon
                name={micMuted ? "microphone-off" : "microphone"}
                size={22}
                color="#fff"
              />
            </Pressable>

            {/* Overlay preview ON/OFF */}
            <Pressable
              disabled={mode !== "live"}
              onPress={toggleOverlayUI}
              style={({ pressed }) => [
                styles.bottomIconBtn,
                mode !== "live" && styles.bottomIconBtnDisabled,
                overlayVisibleOnUI && styles.bottomIconBtnActive,
                pressed && mode === "live" && { opacity: 0.7 },
              ]}
            >
              <Icon
                name={overlayVisibleOnUI ? "television-play" : "television-off"}
                size={22}
                color="#fff"
              />
            </Pressable>

            {/* Network Stats */}
            <Pressable
              disabled={mode !== "live"}
              onPress={() => setNetworkStatsVisible(true)}
              style={({ pressed }) => [
                styles.bottomIconBtn,
                mode !== "live" && styles.bottomIconBtnDisabled,
                networkStatsVisible && styles.bottomIconBtnActive,
                pressed && mode === "live" && { opacity: 0.7 },
              ]}
            >
              <Icon name="chart-line" size={22} color="#fff" />
            </Pressable>

            {/* Battery saver */}
            <Pressable
              disabled={mode !== "live"}
              onPress={toggleBatterySaver}
              style={({ pressed }) => [
                styles.bottomIconBtn,
                mode !== "live" && styles.bottomIconBtnDisabled,
                batterySaverMode && styles.bottomIconBtnActive,
                pressed && mode === "live" && { opacity: 0.7 },
              ]}
            >
              <Icon
                name={batterySaverMode ? "battery" : "battery-outline"}
                size={22}
                color="#fff"
              />
            </Pressable>

            {/* Chọn chất lượng */}
            <Pressable
              disabled={mode !== "live"}
              onPress={() => setQualityMenuVisible(true)}
              style={({ pressed }) => [
                styles.bottomQualityBtn,
                mode !== "live" && styles.bottomIconBtnDisabled,
                pressed && mode === "live" && { opacity: 0.7 },
              ]}
            >
              <Icon name="video-high-definition" size={20} color="#fff" />
              <Text style={styles.bottomQualityTxt}>
                {qualityChoice === "auto"
                  ? autoQualityLabel ?? "Auto"
                  : QUALITY_PRESETS[qualityChoice]?.shortLabel ??
                    QUALITY_PRESETS[qualityChoice].label}
              </Text>
            </Pressable>

            {/* Nút Finish */}
            <Pressable
              disabled={mode !== "live"}
              onPress={mode === "live" ? handleFinishPress : undefined}
              style={({ pressed }) => [
                styles.finishBtn,
                mode !== "live" && styles.bottomIconBtnDisabled,
                pressed && mode === "live" && { opacity: 0.85 },
              ]}
            >
              <Text style={styles.finishTxt}>
                {mode === "stopping" ? "Đang dừng…" : "Kết thúc"}
              </Text>
            </Pressable>
          </View>
        )}

        {/* Network Stats Bottom Sheet */}
        <NetworkStatsBottomSheet
          visible={networkStatsVisible}
          onClose={() => setNetworkStatsVisible(false)}
          isRecording={isRecording}
        />

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
                  <Icon name="phone-rotate-portrait" size={32} color="#fff" />
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
                  <Icon name="phone-rotate-landscape" size={32} color="#fff" />
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
                  Trận đã sẵn sàng • Sau khi chọn, hệ thống sẽ tự bắt đầu phát.
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

  zoomBadge: {
    position: "absolute",
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  zoomBadgeTxt: { color: "#fff", fontWeight: "800", fontSize: 13 },

  recordingBadge: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(220, 38, 38, 0.9)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 6,
  },
  recordingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#fff",
  },
  recordingText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
  },

  uploadBadge: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(59, 130, 246, 0.9)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 6,
  },
  uploadText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  uploadFailedBadge: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(239, 68, 68, 0.9)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  uploadFailedText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
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
    flexDirection: "row",
    alignItems: "center",
  },
  livePill: {
    backgroundColor: "#E53935",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 8,
  },
  livePillTxt: { color: "#fff", fontWeight: "800", fontSize: 12 },

  liveBottomBar: {
    position: "absolute",
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
  bottomIconBtnDisabled: {
    opacity: 0.3,
  },
  bottomIconBtnActive: {
    backgroundColor: "rgba(74, 222, 128, 0.2)",
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
  gateBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
    marginTop: 8,
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

  // Battery Saver Styles
  batterySaverOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
  batterySaverContent: {
    alignItems: "center",
    paddingHorizontal: 32,
  },
  batterySaverTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
    marginTop: 16,
    textAlign: "center",
  },
  batterySaverDesc: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 20,
  },
  batterySaverStats: {
    flexDirection: "row",
    marginTop: 24,
    gap: 16,
  },
  batterySaverStat: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
  },
  batterySaverStatText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  batterySaverHint: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 12,
    marginTop: 32,
    textAlign: "center",
  },
});
