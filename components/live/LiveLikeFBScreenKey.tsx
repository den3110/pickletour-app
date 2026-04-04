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
  findNodeHandle,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons as Icon } from "@expo/vector-icons";
import { PinchGestureHandler, State } from "react-native-gesture-handler";
import { useCompatSfx } from "@/lib/expoMediaCompat";
import * as Haptics from "expo-haptics";
import * as ScreenOrientation from "expo-screen-orientation";
import * as Brightness from "expo-brightness"; // ✅ THÊM
import throttle from "lodash/throttle";
import { NetworkStatsBottomSheet } from "./components/Networkstatsbottomsheet";

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
import { useGetOverlayConfigQuery } from "@/slices/overlayApiSlice";

/* ====== Socket ====== */
import { useSocket } from "@/context/SocketContext";
import GapWarningOverlay from "./components/GapWarningOverlay";
import StoppingOverlay from "./components/StoppingOverlay";
// import LiveTimerBar from "./components/LiveTimerBar";
import { videoUploader } from "@/utils/videoUploader";
import { getPairDisplayName } from "@/utils/matchDisplay";

/* ====== Native camera/rtmp ====== */
const COMPONENT_NAME = "RtmpPreviewView";
(UIManager as any).getViewManagerConfig?.(COMPONENT_NAME);
const _CachedRtmpPreviewView =
  (global as any).__RtmpPreviewView ||
  requireNativeComponent<{}>(COMPONENT_NAME);
(global as any).__RtmpPreviewView = _CachedRtmpPreviewView;
const RtmpPreviewView = _CachedRtmpPreviewView;
const Live = (NativeModules as any).FacebookLiveModule;

// ✅ Import Native Timer View (có cache, tránh register 2 lần)
const TIMER_COMPONENT_NAME = "LiveTimerView";

// Gọi trước để RN load view config (không bắt buộc nhưng an toàn)
(UIManager as any).getViewManagerConfig?.(TIMER_COMPONENT_NAME);

const _CachedLiveTimerView =
  (global as any).__LiveTimerView ||
  requireNativeComponent<{ startTimeMs: number }>(TIMER_COMPONENT_NAME);

(global as any).__LiveTimerView = _CachedLiveTimerView;

const LiveTimerView = _CachedLiveTimerView;

const BatterySaverOverlay = React.memo(
  ({
    visible,
    isRecording,
    onToggle,
    startAt,
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

/* ====== Overlay URL builder ====== */
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

  return `${baseUrl}/overlay/score?${params}`;
};

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
  | "720p60"
  | "720p30"
  | "720p24"
  | "540p30"
  | "480p30"
  | "480p24";

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

const GAP_WAIT_MS = 10 * 60 * 1000;
const GAP_WARN_MS = 10 * 1000;

/* ====== Utils ====== */
const SFX = {
  torchOn: torch_on,
  torchOff: torch_off,
  micOn: mic_on,
  micOff: mic_off,
} as const;
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
  return useCompatSfx(SFX, SFX_VOLUME);
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

const formatDuration = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
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
  const [networkStatsVisible, setNetworkStatsVisible] = useState(false);
  /* ==== States ==== */
  const [mode, setMode] = useState<Mode>("idle");
  const [statusText, setStatusText] = useState<string>(
    "Đang chờ trận được gán (assigned) vào sân…"
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

  // ✅ THÊM: States cho 2 tính năng mới
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
  const overlayReadyRef = useRef(false);
  const shouldResumeLiveRef = useRef(false);
  const previewRetryRef = useRef<{ cancel: boolean }>({ cancel: false });
  const chosenProfileRef = useRef<StreamProfile | null>(null);
  const autoProfileRef = useRef<StreamProfile | null>(null);
  const kickPreviewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  // 👇👇 THÊM 2 REF NÀY ĐỂ FIX LỖI NHẢY DỮ LIỆU 👇👇
  const socketHasDataRef = useRef(false); // Đánh dấu socket đã bắt đầu bắn tin
  const latestValidDataRef = useRef<any>(null); // Lưu trữ dữ liệu đầy đủ gần nhất
  // ✅ THÊM: stageName cache (socket thiếu thì dùng cái cũ)
  const stageNameCacheRef = useRef<string>("");

  /* ==== Gap ==== */
  const [gapWarnVisible, setGapWarnVisible] = useState(false);
  const gapWaitingRef = useRef(false);
  const gapTenMinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    // ✅ SỬA: Tăng interval check
    if (now - lastZoomSendTimeRef.current < MIN_ZOOM_SEND_INTERVAL) {
      pendingZoomRef.current = rounded;

      if (zoomDebounceTimerRef.current) {
        clearTimeout(zoomDebounceTimerRef.current);
      }

      // ✅ SỬA: Tăng debounce timeout từ MIN_ZOOM_SEND_INTERVAL → MIN_ZOOM_SEND_INTERVAL * 1.5
      zoomDebounceTimerRef.current = setTimeout(() => {
        const finalZoom = pendingZoomRef.current;
        if (finalZoom != null && finalZoom !== lastSentZoomRef.current) {
          Live.setZoom?.(finalZoom);
          lastSentZoomRef.current = finalZoom;
          lastZoomSendTimeRef.current = Date.now();
        }
        pendingZoomRef.current = null;
        zoomDebounceTimerRef.current = null;
      }, 800); // ✅ 800ms thay vì 300ms

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
    const maxAttempts = 15; // Tăng số lần retry
    previewRetryRef.current.cancel = false;

    while (
      !previewRetryRef.current.cancel &&
      !startedPreviewRef.current &&
      attempts < maxAttempts
    ) {
      try {
        log(`preview → attempt ${attempts + 1}/${maxAttempts}`);

        // Đợi thêm ở lần đầu để surface có thời gian khởi tạo
        if (attempts === 0) {
          await new Promise((r) => setTimeout(r, 500));
        }

        await Live.enableAutoRotate?.(true);
        await Live.startPreview?.();

        // Reset zoom
        zoomUIRef.current = 1;
        setZoomUI(1);
        lastSentZoomRef.current = 1;
        Live.setZoom?.(1);

        startedPreviewRef.current = true;
        lastSuccessfulPreviewRef.current = Date.now();
        recoveryAttemptsRef.current = 0; // Reset recovery counter on success

        log(`preview → started after ${attempts + 1} attempts`);
        return true;
      } catch (e: any) {
        const msg = String(e?.message || e);
        const isSurfaceError = /surface|invalid|illegalargument/i.test(msg);

        log(`preview → attempt ${attempts + 1} failed: ${msg}`);

        // Exponential backoff với max delay
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

        // ✅ CRITICAL: Stop preview TRƯỚC khi change orientation
        if (startedPreviewRef.current) {
          try {
            log("orientation → stopping preview before change");
            await Live.stopPreview?.();
            startedPreviewRef.current = false;
            // Đợi surface destroy hoàn toàn
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

        // ✅ Đợi lâu hơn cho surface recreate
        log("orientation → waiting for surface recreate...");
        await new Promise((r) => setTimeout(r, 1500));

        setOrientation(choice);

        // ✅ Restart preview với retry
        log("orientation → restarting preview...");
        await new Promise((r) => setTimeout(r, 500));
        const success = await startPreviewWithRetry();

        if (!success) {
          log("orientation → preview restart failed, will retry...");
          // Retry thêm lần nữa
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
    // Clear previous kick
    if (kickPreviewDebounceRef.current) {
      clearTimeout(kickPreviewDebounceRef.current);
    }

    // Debounce 300ms (tăng từ 200ms)
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

      try {
        if (gapTenMinTimerRef.current) clearTimeout(gapTenMinTimerRef.current);
      } catch {}

      (async () => {
        try {
          await Live.enableAutoRotate?.(true);
        } catch {}
        try {
          await Live.overlayRemove?.();
          overlayReadyRef.current = false;
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
      log(`AppState → ${nextState}`);

      if (nextState === "active") {
        previewRetryRef.current.cancel = false;

        // Đợi app fully active
        await new Promise((r) => setTimeout(r, 1000));

        if (!startedPreviewRef.current) {
          log("AppState → preview not started, attempting start...");

          // Multiple attempts với increasing delays
          for (let i = 0; i < 3; i++) {
            await new Promise((r) => setTimeout(r, 500 * (i + 1)));
            const success = await startPreviewWithRetry();
            if (success) {
              log(`AppState → preview started on attempt ${i + 1}`);
              break;
            }
          }
        } else if (Platform.OS === "ios") {
          // iOS: refresh preview
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
          // Android: verify surface is still valid
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
        // Background
        previewRetryRef.current.cancel = true;

        // Đợi trước khi stop
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

  // ✅ Stop stream nhưng giữ preview + giữ overlay (logo/sponsor không reload)
  const stopStreamOnlyNative = useCallback(async () => {
    try {
      await Live.stopStreamOnly?.();
      return;
    } catch (e) {
      log("⚠️ stopStreamOnlyNative failed", e);
    }
    // Nếu native chưa có stopStreamOnly thì fallback (sẽ reset overlay)
    try {
      await Live.stop?.();
    } catch {}
  }, []);

  /* ==== Query ==== */
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
      statusMatch: cm?.status || null,
      isBreak: cm?.isBreak || null,
    });
  }, [courtData, courtsFetching, courtsLoading, courtsError, shouldPoll]);

  const matchObj = courtData?.match ?? null;
  const currentMatchId: string | null = matchObj?._id ?? null;
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

  const { data: overlayConfig, isLoading: overlayConfigLoading } =
    useGetOverlayConfigQuery(overlayParams, {
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
        log("createLiveSession → FAILED", e);
        return null;
      }
    },
    [createLiveSession]
  );

  /* ==== Gap ==== */
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

    // ✅ Đổi text, bỏ "(tối đa 10 phút)"
    setStatusText("Không còn trận — đang chờ trận mới…");

    // ❌ Không đặt timeout nữa, nên sẽ không bao giờ auto tắt
    // gapTenMinTimerRef.current = setTimeout(() => {
    //   setGapWarnVisible(true);
    // }, GAP_WAIT_MS);
  }, [clearGapTimers]);

  const handleGapAutoStop = useCallback(async () => {
    try {
      await (notifyStreamEnded as any)({
        matchId: currentMatchRef.current,
        platform: "all",
      }).unwrap?.();
    } catch {}
    await stopStreamOnlyNative();
    setMode("idle");
    setStatusText("Đang chờ trận được gán (assigned) vào sân…");
    currentMatchRef.current = null;
    lastUrlRef.current = null;
    setLiveStartAt(null);
    clearGapTimers();
    return;
    setStatusText("Đã kết thúc buổi phát.");
    clearGapTimers();
  }, [notifyStreamEnded, stopNativeNow, clearGapTimers]);

  const cancelAutoStop = useCallback(() => {
    beginGapWait();
  }, [beginGapWait]);

  /* ==== Socket overlay ==== */
  const { data: overlaySnapshot } = useGetOverlaySnapshotQuery(
    currentMatchId || "",
    {
      skip: !currentMatchId || mode !== "live",
      pollingInterval: 0,
      refetchOnMountOrArgChange: true,
    }
  );

  const updateOverlayNow = useMemo(
    () =>
      throttle(async (incomingData: any) => {
        if (mode !== "live" || !incomingData) return;

        /* --- LOGIC MERGE DỮ LIỆU (ĐÃ FIX) --- */
        let finalData = incomingData;

        // Kiểm tra xem dữ liệu mới có thông tin đội không (hay chỉ có điểm)
        const hasTeamInfo =
          incomingData?.pairA ||
          incomingData?.pairB ||
          incomingData?.teams ||
          incomingData?.teamA ||
          incomingData?.teamB;
        const safeStr = (val: any, fallback = "") =>
          val != null ? String(val) : fallback;
        const getStageName = (d: any) => {
          const s = safeStr(
            d?.stageName || d?.stage?.name || d?.stage?.title,
            ""
          );
          return s.trim();
        };

        if (hasTeamInfo) {
          // ✅ merge vào cache, không overwrite stageName rỗng
          const prev = latestValidDataRef.current;
          latestValidDataRef.current = { ...(prev || {}), ...incomingData };

          const incomingStage = getStageName(incomingData);
          const prevStage = getStageName(prev);
          if (!incomingStage && prevStage) {
            latestValidDataRef.current.stageName = prev.stageName;
          }
        } else if (latestValidDataRef.current) {
          finalData = { ...latestValidDataRef.current, ...incomingData };

          if (!finalData.pairA)
            finalData.pairA = latestValidDataRef.current.pairA;
          if (!finalData.pairB)
            finalData.pairB = latestValidDataRef.current.pairB;
          if (!finalData.teams)
            finalData.teams = latestValidDataRef.current.teams;
          if (!finalData.tournament)
            finalData.tournament = latestValidDataRef.current.tournament;

          // ✅ stageName: nếu incoming thiếu → giữ từ cache
          if (
            !getStageName(finalData) &&
            getStageName(latestValidDataRef.current)
          ) {
            finalData.stageName = latestValidDataRef.current.stageName;
          }
        } else {
          // ❗ LẦN ĐẦU, CHƯA CÓ CACHE → vẫn dùng incomingData, KHÔNG return nữa
          finalData = incomingData;
        }

        if (LOG) {
          console.log("overlay data source", finalData);
        }

        try {
          // Helper functions
          const safeStr = (val: any, fallback = "") =>
            val != null ? String(val) : fallback;
          const safeNum = (val: any, fallback = 0) =>
            typeof val === "number" ? val : fallback;
          const safeBool = (val: any) => Boolean(val);

          // Get names
          const p1 = finalData.pairA || finalData.teams?.A;
          const p2 = finalData.pairB || finalData.teams?.B;

          // Logic lấy tên hiển thị
          const getNm = (p: any, def: string) => {
            if (!p) return def;
            return (
              getPairDisplayName(p, finalData) ||
              p.teamName ||
              p.displayName ||
              p.name ||
              def
            );
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
          const stageName =
            getStageName(finalData) ||
            getStageName(latestValidDataRef.current) ||
            safeStr(finalData?.bracket?.name, "");

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
            // ✅ truyền thẳng stageName riêng cho native
            stageName,
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
          // log("overlayUpdate → OK");
        } catch (e) {
          log("overlayUpdate → error", e);
        }
      }, 500), // 🔥 Throttle 500ms
    [mode, overlayConfig]
  );

  // ✅ Khi overlayConfig load xong, re-push overlay 1 lần để lấy logo giải + sponsors
  useEffect(() => {
    // Chỉ làm khi đang live
    if (mode !== "live") return;
    if (!overlayConfig) return;

    // Ưu tiên data đầy đủ nhất hiện có:
    // 1) Cache từ socket / lần update gần nhất
    // 2) Snapshot từ RTK
    // 3) matchObj từ courtData (fallback cuối)
    const baseData = latestValidDataRef.current || overlaySnapshot || matchObj;

    if (!baseData) {
      // Chưa có gì để vẽ overlay → đợi socket/snapshot sau
      return;
    }

    log("overlayConfig → re-push overlay with tournament logo & sponsors", {
      hasCache: !!latestValidDataRef.current,
      hasSnapshot: !!overlaySnapshot,
    });

    updateOverlayNow(baseData);
  }, [overlayConfig, mode, overlaySnapshot, matchObj, updateOverlayNow]);

  // Effect 1: Socket Listeners
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
        // 🚩 Đánh dấu là Socket đã có dữ liệu, cấm API snapshot ghi đè
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
  }, [currentMatchId, socket, mode, updateOverlayNow, overlayConfig]);

  // Effect 2: Initial API Snapshot (Chỉ chạy 1 lần đầu nếu socket chưa về)
  useEffect(() => {
    if (
      mode === "live" &&
      overlaySnapshot &&
      !socketHasDataRef.current // 🚩 Chỉ update nếu socket chưa đè
    ) {
      log("overlaySnapshot → initial load from RTK");
      updateOverlayNow(overlaySnapshot);
    }
  }, [overlaySnapshot, mode, updateOverlayNow, overlayConfig]);

  /* ==== Start for match ==== */
  const lastAutoStartedForRef = useRef<string | null>(null);

  const startForMatch = useCallback(
    async (mid: string) => {
      if (!orientationChosen) {
        setStatusText("Vui lòng chọn Dọc hoặc Ngang để bắt đầu phát.");
        return false;
      }

      // ✅ THÊM: Kiểm tra surface state trước
      try {
        const surfaceState = await Live.getSurfaceState?.();
        log("startForMatch → surface state:", surfaceState);

        if (!surfaceState?.surfaceValid) {
          setStatusText("Đang khởi động camera...");

          // Restart preview
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
        log("startForMatch → getSurfaceState error (ignored):", e);
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

        // ✅ Start với retry wrapper
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
              // Not a surface error, don't retry
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

          if (!overlayReadyRef.current) {
            await Live.overlayLoad("", fw, fh, "tl", 100, 100, 0, 0);
            overlayReadyRef.current = true;
          }
          await Live.overlaySetVisible?.(true);
          log("overlay → loaded (native)");
        } catch (e) {
          log("overlay → failed (native)", e);
        }

        lastUrlRef.current = rtmpUrl;
        currentMatchRef.current = mid;
        setLiveStartAt(Date.now());
        // 👇👇 THÊM 2 DÒNG NÀY ĐỂ RESET CACHE KHI LIVE MỚI 👇👇
        socketHasDataRef.current = false;
        latestValidDataRef.current = null;
        // ✅ reset stageName cache cho match mới
        stageNameCacheRef.current = "";
        setMode("live");
        setStatusText("Đang LIVE…");

        // Recording setup
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

  useFocusEffect(
    useCallback(() => {
      log("focus → screen focused");
      previewRetryRef.current.cancel = false;

      // Delay để screen mount xong
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
    if (Platform.OS !== "android") return;

    const eventEmitter = new NativeEventEmitter(
      NativeModules.FacebookLiveModule
    );

    const errorSub = eventEmitter.addListener(
      "onConnectionFailed",
      async (event) => {
        const reason = String(event?.reason || "").toLowerCase();

        // ✅ THÊM: Handle network disconnect
        if (
          reason.includes("connection") ||
          reason.includes("network") ||
          reason.includes("timeout")
        ) {
          log("🔴 Connection error detected:", reason);

          // Auto-retry stream nếu vẫn có match
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

            // Stop everything
            try {
              await Live.stopPreview?.();
              startedPreviewRef.current = false;
            } catch {}

            // Wait for surface to stabilize
            await new Promise((r) => setTimeout(r, 2000));

            // Retry preview
            const success = await startPreviewWithRetry();

            if (success) {
              setSurfaceError(false);
              log("✅ Recovery successful");

              // If was live, try to restart stream
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

  // Periodic surface health check during live
  useEffect(() => {
    if (Platform.OS !== "android" || mode !== "live") return;

    const healthCheck = setInterval(async () => {
      try {
        const state = await Live.getSurfaceState?.();

        if (state && !state.surfaceValid && state.isStreaming) {
          log("⚠️ Surface unhealthy during stream!");

          // Attempt soft recovery - just restart preview
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
      } catch (e) {
        // Ignore errors - this is just a health check
      }
    }, 15000); // Check every 15s

    return () => clearInterval(healthCheck);
  }, [mode]);

  useEffect(() => {
    return () => {
      if (pendingUploads > 0) {
        log("⚠️ Component unmounting with pending uploads, cancelling...");
        videoUploader.cancelAllUploads();
      }
    };
  }, [pendingUploads]);

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
          await stopStreamOnlyNative();
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
            await stopStreamOnlyNative();
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
          await stopStreamOnlyNative();
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

  /* ==== Manual finish ==== */
  const STOP_DURATION_MS = 5000;

  const handleFinishPress = useCallback(() => {
    setMode("stopping");
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const handleStopDone = useCallback(async () => {
    // ✅ 1. Chuyển UI ngay lập tức - Không đợi cleanup
    setMode("ended");
    setStatusText("Đã kết thúc buổi phát trực tiếp.");
    log("🎬 UI switched to ended - cleanup starting in background");

    // ✅ 2. Cleanup chạy ngầm - Không block UI
    Promise.all([
      // Backend notification
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

      // Native cleanup
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

  // ✅ THÊM: Toggle overlay UI handler
  // ✅ SỬA: Toggle overlay handler
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

  // ✅ SỬA: Battery saver handler - Thực sự control brightness
  const toggleBatterySaver = useCallback(async () => {
    const nextMode = !batterySaverMode;
    setBatterySaverMode(nextMode);
    await Haptics.selectionAsync();

    if (nextMode) {
      try {
        // Save current brightness
        const current = await Brightness.getBrightnessAsync();
        brightnessBeforeSaverRef.current = current;

        // Set minimum brightness
        await Brightness.setBrightnessAsync(0.01);

        // Turn off torch
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
        // Restore brightness
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
      const stepped = Math.round(desired * 2) / 2; // 0.5 steps

      if (Math.abs(stepped - zoomUIRef.current) >= 0.3) {
        // Tăng từ 0.15 → 0.3
        zoomUIRef.current = stepped;
        // ❌ BỎ: setZoomUI(stepped);
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

      // ✅ CHỈ update UI KHI gesture kết thúc
      setZoomUI(stepped);

      Live.setZoom?.(stepped);
      lastSentZoomRef.current = stepped;
      lastZoomSendTimeRef.current = Date.now();
    }
  }, []);

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
        {/* Zoom + clock */}
        {/* Zoom + Timer + LIVE badge */}
        {(mode === "live" || mode === "stopping") && (
          <>
            {/* LIVE badge */}
            <View
              style={[
                styles.liveTopLeft,
                { top: safeTop + 8, left: safeLeft + 12 },
              ]}
            >
              <View style={styles.livePill}>
                <Text style={styles.livePillTxt}>LIVE</Text>
              </View>
              {/* ✅ NATIVE TIMER VIEW: No JS re-renders */}
              <LiveTimerView
                style={{ width: 80, height: 32 }}
                startTimeMs={liveStartAt || 0}
              />
            </View>

            {/* Zoom badge vẫn dùng zoomUI từ cha, nhưng KHÔNG còn re-render theo timer */}
            <ZoomBadge zoom={zoomUI} top={safeTop + 8} right={safeRight + 8} />
          </>
        )}

        {/* Recording */}
        {mode === "live" && isRecording && (
          <View
            style={[
              styles.recordingBadge,
              {
                top: safeTop + 46, // ✅ Dưới timer bar
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

        {/* LIVE */}
        {mode === "live" && (
          <BatterySaverOverlay
            visible={batterySaverMode}
            isRecording={isRecording}
            onToggle={toggleBatterySaver}
            startAt={liveStartAt}
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

            {/* Overlay preview ON/OFF (chỉ ảnh hưởng preview) */}
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
            {/* ✅ THÊM: Network Stats Button */}
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

        {/* ✅ THÊM: Network Stats Bottom Sheet */}
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
              style={[
                styles.qualitySheet,
                { paddingBottom: safeBottom + 16, paddingLeft: safeLeft },
              ]}
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
    marginRight: 8, // ✅ Add margin for spacing
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

  // ✅ THÊM: Battery Saver Styles
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
  timerBadge: {
    position: "absolute",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  timerBadgeContent: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    gap: 6,
  },
  timerBadgeText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
});
