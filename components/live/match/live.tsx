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
  ActivityIndicator,
  requireNativeComponent,
  UIManager,
} from "react-native";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons as Icon } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ScreenOrientation from "expo-screen-orientation";
import * as Brightness from "expo-brightness";
import throttle from "lodash/throttle";

/* ====== Components ====== */
import { NetworkStatsBottomSheet } from "@/components/live/components/Networkstatsbottomsheet";
import StoppingOverlay from "@/components/live/components/StoppingOverlay";

/* ====== API & Context ====== */
import {
  useCreateLiveSessionMutation,
  useNotifyStreamStartedMutation,
  useNotifyStreamEndedMutation,
  useGetOverlaySnapshotQuery,
  useGetUserMatchDetailsQuery,
} from "@/slices/liveStreamingApiSlice";
import { useSocket } from "@/context/SocketContext";
import { videoUploader } from "@/utils/videoUploader";
import { useUserMatchHeader } from "@/hooks/useUserMatchHeader";

/* ====== Native Modules ====== */
const COMPONENT_NAME = "RtmpPreviewView";
(UIManager as any).getViewManagerConfig?.(COMPONENT_NAME);
const RtmpPreviewView =
  (global as any).__RtmpPreviewView ||
  requireNativeComponent<{}>(COMPONENT_NAME);
(global as any).__RtmpPreviewView = RtmpPreviewView;
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

/* ====== HELPER: Extract Config ====== */
const extractLiveConfig = (liveData: any) => {
  if (!liveData?.facebook) return null;
  const fb = liveData.facebook;
  let rtmpUrl = fb.secure_stream_url;
  if (!rtmpUrl && fb.server_url && fb.stream_key) {
    const base = fb.server_url.endsWith("/")
      ? fb.server_url.slice(0, -1)
      : fb.server_url;
    rtmpUrl = `${base}/${fb.stream_key}`;
  }
  return { rtmpUrl, facebook: fb };
};

// Helper lấy tên hiển thị
const getPairDisplayName = (pair: any, defaultName: string) => {
  if (!pair) return defaultName;
  if (pair.teamName) return pair.teamName;
  const p1 =
    pair.player1?.nickName ||
    pair.player1?.fullName ||
    pair.player1?.displayName ||
    "";
  if (pair.player2) {
    const p2 =
      pair.player2?.nickName ||
      pair.player2?.fullName ||
      pair.player2?.displayName ||
      "";
    return p1 && p2 ? `${p1} / ${p2}` : p1 || p2 || defaultName;
  }
  return p1 || defaultName;
};

/* ====== TYPES & PRESETS ====== */
type Mode = "idle" | "live" | "stopping" | "ended";
type Orient = "portrait" | "landscape";
type QualityId =
  | "auto"
  | "1080p30"
  | "1080p60"
  | "720p60"
  | "720p30"
  | "480p30";

type StreamProfile = {
  bitrate: number;
  width: number;
  height: number;
  fps: number;
};

// ✅ KHÔI PHỤC: Cấu hình chất lượng
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
  auto: { label: "Tự động (Khuyên dùng)", shortLabel: "Auto" },
  "720p30": {
    label: "720p • 30fps (4G)",
    shortLabel: "720p30",
    width: 1280,
    height: 720,
    fps: 30,
    bitrate: 4_000_000,
  },
  "720p60": {
    label: "720p • 60fps (Mượt)",
    shortLabel: "720p60",
    width: 1280,
    height: 720,
    fps: 60,
    bitrate: 5_000_000,
  },
  "1080p30": {
    label: "1080p • 30fps (WiFi mạnh)",
    shortLabel: "1080p30",
    width: 1920,
    height: 1080,
    fps: 30,
    bitrate: 5_000_000,
  },
  "1080p60": {
    label: "1080p • 60fps (Rất nét)",
    shortLabel: "1080p60",
    width: 1920,
    height: 1080,
    fps: 60,
    bitrate: 6_500_000,
  },
  "480p30": {
    label: "480p • 30fps (Tiết kiệm)",
    shortLabel: "480p",
    width: 854,
    height: 480,
    fps: 30,
    bitrate: 2_000_000,
  },
};

/* ================================================================================== */
/* MAIN COMPONENT                                                                     */
/* ================================================================================== */

type Props = {
  matchId: string;
  homeHref?: string;
  onFinished?: () => void;
};

export default function LiveUserMatchScreen({
  matchId,
  homeHref,
  onFinished,
}: Props) {
  const params = useLocalSearchParams();
  const { userMatch } = params;
  useUserMatchHeader(userMatch && "user");
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const socket = useSocket();

  // Safe Areas
  const safeTop = insets.top || 0;
  const safeBottom = insets.bottom || 0;
  const safeLeft = insets.left || 0;
  const safeRight = insets.right || 0;

  /* ==== States ==== */
  const [mode, setMode] = useState<Mode>("idle");
  const [statusText, setStatusText] = useState(
    "Vui lòng chọn chế độ Dọc hoặc Ngang"
  );
  const [liveStartAt, setLiveStartAt] = useState<number | null>(null);

  // Hardware states
  const [torchOn, setTorchOn] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [isFront, setIsFront] = useState(false);

  // UI States
  const [networkStatsVisible, setNetworkStatsVisible] = useState(false);
  const [batterySaverMode, setBatterySaverMode] = useState(false);
  const brightnessBeforeSaverRef = useRef<number>(1);

  // ✅ KHÔI PHỤC: State cho menu chất lượng
  const [qualityMenuVisible, setQualityMenuVisible] = useState(false);
  const [qualityChoice, setQualityChoice] = useState<QualityId>("auto");
  const qualityChoiceRef = useRef<QualityId>("auto"); // Dùng ref để access trong function async

  // Recording
  const [isRecording, setIsRecording] = useState(false);
  const [pendingUploads, setPendingUploads] = useState(0);

  // Orientation
  const [orientation, setOrientation] = useState<Orient | null>(null);
  const [locking, setLocking] = useState(false);
  const orientationChosen = orientation !== null;

  /* ==== Refs ==== */
  const startedPreviewRef = useRef(false);
  const lastUrlRef = useRef<string | null>(null);
  const chosenProfileRef = useRef<StreamProfile | null>(null);
  const previewRetryRef = useRef(false);

  /* ==== Queries ==== */
  const { data: matchData } = useGetUserMatchDetailsQuery(matchId, {
    pollingInterval: mode === "live" ? 5000 : 0,
    skip: !matchId || mode === "ended",
  });

  const [createLiveSession] = useCreateLiveSessionMutation();
  const [notifyStreamStarted] = useNotifyStreamStartedMutation();
  const [notifyStreamEnded] = useNotifyStreamEndedMutation();

  /* ==== Logic 1: Auto Stop ==== */
  useEffect(() => {
    if (matchData && mode === "live") {
      if (matchData.status === "finished") {
        console.log(
          "[LiveUserMatch] Match finished detected, stopping stream..."
        );
        handleStopDone();
      }
    }
  }, [matchData, mode]);

  /* ==== Logic 2: Start Preview ==== */
  const startPreview = useCallback(async () => {
    if (startedPreviewRef.current) return;
    const perm = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.CAMERA,
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    ]);
    const granted = Object.values(perm).every(
      (v) => v === PermissionsAndroid.RESULTS.GRANTED
    );

    if (!granted) {
      Alert.alert("Thiếu quyền", "Cần quyền Camera & Mic để Live.");
      return;
    }
    try {
      await Live.enableAutoRotate?.(true);
      await Live.startPreview?.();
      startedPreviewRef.current = true;
      Live.setZoom?.(1);
    } catch (e) {
      console.log("Start preview failed", e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      startPreview();
      return () => {
        previewRetryRef.current = true;
        Live.stopPreview?.().catch(() => {});
        startedPreviewRef.current = false;
      };
    }, [startPreview])
  );

  /* ==== Logic 3: Handle Quality Selection ==== */
  const handleQualitySelect = useCallback((id: QualityId) => {
    setQualityChoice(id);
    qualityChoiceRef.current = id;
    setQualityMenuVisible(false);
  }, []);

  /* ==== Logic 4: Chọn hướng & Start Stream ==== */
  const applyOrientationChoice = async (choice: Orient) => {
    setLocking(true);
    await Haptics.selectionAsync();
    try {
      if (startedPreviewRef.current) {
        await Live.stopPreview?.().catch(() => {});
        startedPreviewRef.current = false;
        await new Promise((r) => setTimeout(r, 200));
      }

      await ScreenOrientation.lockAsync(
        choice === "portrait"
          ? ScreenOrientation.OrientationLock.PORTRAIT
          : ScreenOrientation.OrientationLock.LANDSCAPE
      );

      await Live.enableAutoRotate?.(false);
      await Live.lockOrientation?.(choice.toUpperCase());

      setOrientation(choice);

      await new Promise((r) => setTimeout(r, 800));
      await Live.startPreview?.();
      startedPreviewRef.current = true;

      await startStreamForMatch(choice);
    } catch (e) {
      Alert.alert("Lỗi", "Không thể xoay màn hình.");
    } finally {
      setLocking(false);
    }
  };

  const startStreamForMatch = async (orient: Orient) => {
    setStatusText("Đang khởi tạo Live Session...");

    try {
      const res = await createLiveSession({ matchId }).unwrap();
      const config = extractLiveConfig(res);
      if (!config || !config.rtmpUrl)
        throw new Error("Không lấy được RTMP URL");

      const rtmpUrl = config.rtmpUrl;
      lastUrlRef.current = rtmpUrl;

      // ✅ KHÔI PHỤC: Logic chọn profile dựa trên QualityChoice
      const choice = qualityChoiceRef.current;
      const preset = QUALITY_PRESETS[choice];

      let width = 0;
      let height = 0;
      let bitrate = 4000000;
      let fps = 30;

      if (choice === "auto") {
        // Auto: 720p mặc định
        width = orient === "portrait" ? 720 : 1280;
        height = orient === "portrait" ? 1280 : 720;
        bitrate = 4000000;
        fps = 30;
      } else if (preset && preset.width && preset.height) {
        // Custom Quality: Đảo chiều nếu là Portrait
        if (orient === "portrait") {
          width = Math.min(preset.width, preset.height);
          height = Math.max(preset.width, preset.height);
        } else {
          width = Math.max(preset.width, preset.height);
          height = Math.min(preset.width, preset.height);
        }
        bitrate = preset.bitrate || 4000000;
        fps = preset.fps || 30;
      }

      const profile: StreamProfile = { width, height, fps, bitrate };
      chosenProfileRef.current = profile;

      setStatusText(
        `Đang phát ${fps}fps (${choice === "auto" ? "Auto" : choice})...`
      );

      await Live.start(rtmpUrl, profile.bitrate, width, height, profile.fps);

      setLiveStartAt(Date.now());
      setMode("live");
      setStatusText("Đang LIVE...");

      notifyStreamStarted({ matchId, platform: "all" }).catch(() => {});

      setTimeout(() => {
        videoUploader
          .startRecording(matchId)
          .then(() => {
            setIsRecording(true);
          })
          .catch((e) => console.log("Recording failed", e));
      }, 1000);

      Live.overlayLoad("", width, height, "tl", 100, 100, 0, 0).catch(() => {});
      Live.overlaySetVisible?.(true);
    } catch (e: any) {
      setStatusText("Lỗi khởi tạo");
      Alert.alert("Lỗi", e?.message || "Không thể bắt đầu Live");
      setMode("idle");
    }
  };

  /* ==== Logic 5: Stop Stream ==== */
  const handleStopDone = useCallback(async () => {
    setMode("ended");
    setStatusText("Buổi phát đã kết thúc");

    try {
      if (isRecording) {
        await videoUploader.stopRecording();
        setIsRecording(false);
      }
      await Live.stop?.();
      await Live.stopPreview?.();
      startedPreviewRef.current = false;
      await notifyStreamEnded({ matchId, platform: "all" }).unwrap();
    } catch (e) {
      console.log("Cleanup error", e);
    }
  }, [isRecording, matchId, notifyStreamEnded]);

  /* ==== Logic 6: Overlay ==== */
  const { data: overlaySnapshot } = useGetOverlaySnapshotQuery(matchId, {
    skip: mode !== "live",
  });

  const updateOverlayNow = useCallback(
    throttle(async (data: any) => {
      if (mode !== "live" || !data) return;

      try {
        const teamA = getPairDisplayName(data.pairA, "Team A");
        const teamB = getPairDisplayName(data.pairB, "Team B");

        const currentIdx = data.currentGame || 0;
        const currentScore =
          data.gameScores && data.gameScores[currentIdx]
            ? data.gameScores[currentIdx]
            : { a: 0, b: 0 };

        const overlayData = {
          theme: "dark",
          size: "md",
          tournamentName: data.title || "Giao Hữu",
          courtName: data.courtLabel || data.location?.name || "",
          teamAName: teamA,
          teamBName: teamB,
          scoreA: currentScore.a || 0,
          scoreB: currentScore.b || 0,
          serveSide: data.serve?.side?.toUpperCase() || "A",
          serveCount: data.serve?.server || 1,
          overlayEnabled: true,
          isDefaultDesign: false,
          // Configs
          webLogoUrl:
            "https://pickletour.vn/uploads/avatars/1765084294948-1764152220888-1762020439803-photo_2025-11-02_00-50-33-1-1764152220890.jpg",
          //   sponsorLogos,
          scaleScore: 0.5,
          showTime: true,
          overlayVersion: 2,
          sets: Array.isArray(data.gameScores)
            ? data.gameScores.map((g: any, i: number) => ({
                index: i + 1,
                a: g?.a ?? 0,
                b: g?.b ?? 0,
                current: i === currentIdx,
              }))
            : [],
        };

        await Live.overlayUpdate?.(overlayData);
      } catch (e) {
        console.log("Overlay update failed", e);
      }
    }, 1000),
    [mode]
  );

  useEffect(() => {
    if (mode !== "live" || !socket) return;
    socket.emit("match:join", { matchId });
    const onUpdate = (data: any) => {
      const incId = data._id || data.matchId || data.id;
      if (incId === matchId) updateOverlayNow(data);
    };
    socket.on("match:snapshot", onUpdate);
    socket.on("score:updated", onUpdate);
    if (overlaySnapshot) updateOverlayNow(overlaySnapshot);
    return () => {
      socket.emit("match:leave", { matchId });
      socket.off("match:snapshot");
      socket.off("score:updated");
    };
  }, [mode, socket, matchId, overlaySnapshot]);

  /* ==== Hardware Toggles ==== */
  const onSwitchCamera = async () => {
    setIsFront(!isFront);
    await Live.switchCamera();
  };
  const onToggleTorch = async () => {
    if (isFront) return;
    const next = !torchOn;
    setTorchOn(next);
    Live.toggleTorch(next).catch(() => setTorchOn(!next));
  };
  const toggleBatterySaver = async () => {
    const next = !batterySaverMode;
    setBatterySaverMode(next);
    if (next) {
      brightnessBeforeSaverRef.current = await Brightness.getBrightnessAsync();
      await Brightness.setBrightnessAsync(0.01);
      if (torchOn) onToggleTorch();
    } else {
      await Brightness.setBrightnessAsync(brightnessBeforeSaverRef.current);
    }
  };

  /* ==== UI RENDER ==== */
  return (
    <View style={{ flex: 1, backgroundColor: "black" }}>
      {/* 1. PREVIEW */}
      <View style={{ flex: 1 }}>
        <RtmpPreviewView style={StyleSheet.absoluteFill as ViewStyle} />
      </View>

      {/* 2. LAYOUT LAYERS */}
      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        {/* HEADER */}
        {mode === "live" && (
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
            {isRecording && (
              <View
                style={[
                  styles.recordingBadge,
                  { top: safeTop + 46, left: safeLeft + 12 },
                ]}
              >
                <View style={styles.recordingDot} />
                <Text style={styles.recordingText}>REC</Text>
              </View>
            )}
          </>
        )}

        {/* IDLE */}
        {mode === "idle" && !orientationChosen && (
          <View style={styles.centerOverlay}>
            <Text style={styles.idleText}>{statusText}</Text>
          </View>
        )}

        {/* BATTERY SAVER */}
        {batterySaverMode && (
          <Pressable
            style={styles.batterySaverOverlay}
            onPress={toggleBatterySaver}
          >
            <Icon name="battery-charging" size={48} color="#4ade80" />
            <Text style={styles.batterySaverTitle}>Tiết kiệm pin</Text>
            <Text style={{ color: "#aaa", marginTop: 8 }}>
              Chạm để bật lại màn hình
            </Text>
          </Pressable>
        )}

        {/* STOPPING */}
        {mode === "stopping" && (
          <StoppingOverlay
            durationMs={3000}
            safeBottom={safeBottom}
            onCancel={() => setMode("live")}
            onDone={handleStopDone}
          />
        )}

        {/* ENDED */}
        {mode === "ended" && (
          <View style={styles.overlay}>
            <Text style={styles.endedTitle}>Trận đấu đã kết thúc</Text>
            <Pressable
              style={[styles.endedBtn, { backgroundColor: "#444" }]}
              onPress={() => {
                if (onFinished) onFinished();
                else if (homeHref) router.replace(homeHref);
                else router.back();
              }}
            >
              <Text style={styles.endedBtnTxt}>Thoát</Text>
            </Pressable>
          </View>
        )}

        {/* BOTTOM BAR */}
        {mode === "live" && (
          <View
            style={[
              styles.liveBottomBar,
              {
                bottom: safeBottom + 16,
                left: safeLeft + 12,
                right: safeRight + 12,
              },
            ]}
          >
            <Pressable onPress={onSwitchCamera} style={styles.bottomIconBtn}>
              <Icon name="camera-switch" size={24} color="#fff" />
            </Pressable>
            <Pressable
              onPress={onToggleTorch}
              style={[styles.bottomIconBtn, torchOn && styles.activeBtn]}
            >
              <Icon
                name={torchOn ? "flashlight" : "flashlight-off"}
                size={24}
                color="#fff"
              />
            </Pressable>
            <Pressable
              onPress={() => {
                setMicMuted(!micMuted);
                Live.toggleMic?.(!micMuted);
              }}
              style={[styles.bottomIconBtn, micMuted && styles.activeBtn]}
            >
              <Icon
                name={micMuted ? "microphone-off" : "microphone"}
                size={24}
                color="#fff"
              />
            </Pressable>
            <Pressable
              onPress={() => setNetworkStatsVisible(true)}
              style={styles.bottomIconBtn}
            >
              <Icon name="chart-line" size={24} color="#fff" />
            </Pressable>

            <Pressable
              onPress={toggleBatterySaver}
              style={[
                styles.bottomIconBtn,
                batterySaverMode && styles.activeBtn,
              ]}
            >
              <Icon
                name={batterySaverMode ? "battery" : "battery-outline"}
                size={24}
                color="#fff"
              />
            </Pressable>

            {/* ✅ KHÔI PHỤC: Nút chọn Quality */}
            <Pressable
              onPress={() => setQualityMenuVisible(true)}
              style={styles.bottomQualityBtn}
            >
              <Icon name="video-high-definition" size={20} color="#fff" />
              <Text style={styles.bottomQualityTxt}>
                {qualityChoice === "auto"
                  ? "Auto"
                  : QUALITY_PRESETS[qualityChoice]?.shortLabel}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setMode("stopping")}
              style={styles.finishBtn}
            >
              <Text style={styles.finishTxt}>Kết thúc</Text>
            </Pressable>
          </View>
        )}

        {/* GATE */}
        {!orientationChosen && mode === "idle" && (
          <View style={styles.gateWrap}>
            <View style={styles.gateCard}>
              <Text style={styles.gateTitle}>Chọn chế độ Live</Text>
              <View style={styles.gateRow}>
                <Pressable
                  disabled={locking}
                  onPress={() => applyOrientationChoice("portrait")}
                  style={styles.gateBtn}
                >
                  <Icon name="phone-rotate-portrait" size={32} color="#fff" />
                  <Text style={styles.gateBtnText}>Dọc</Text>
                </Pressable>
                <Pressable
                  disabled={locking}
                  onPress={() => applyOrientationChoice("landscape")}
                  style={styles.gateBtn}
                >
                  <Icon name="phone-rotate-landscape" size={32} color="#fff" />
                  <Text style={styles.gateBtnText}>Ngang</Text>
                </Pressable>
              </View>
              {locking && (
                <ActivityIndicator color="#fff" style={{ marginTop: 20 }} />
              )}
            </View>
          </View>
        )}

        {/* ✅ KHÔI PHỤC: Quality Menu Sheet */}
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
                Sẽ áp dụng cho lần phát tiếp theo.
              </Text>
              {(Object.keys(QUALITY_PRESETS) as QualityId[]).map((id) => {
                const preset = QUALITY_PRESETS[id];
                const active = id === qualityChoice;
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

        <NetworkStatsBottomSheet
          visible={networkStatsVisible}
          onClose={() => setNetworkStatsVisible(false)}
          isRecording={isRecording}
        />
      </View>
    </View>
  );
}

/* ====== STYLES ====== */
const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
  },
  centerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
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
  recordingBadge: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(220, 38, 38, 0.9)",
    padding: 6,
    borderRadius: 6,
    gap: 6,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#fff",
  },
  recordingText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  idleText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  liveBottomBar: {
    position: "absolute",
    backgroundColor: "rgba(0,0,0,0.8)",
    borderRadius: 12,
    height: 60,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    justifyContent: "space-between",
  },
  bottomIconBtn: {
    width: 40,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  activeBtn: { backgroundColor: "rgba(255,255,255,0.2)" },
  // ✅ Style cho nút Quality nhỏ ở dưới
  bottomQualityBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    height: 44,
  },
  bottomQualityTxt: { color: "#fff", fontSize: 11, marginLeft: 4 },
  finishBtn: {
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingHorizontal: 16,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  finishTxt: { color: "#000", fontWeight: "800", fontSize: 14 },
  endedTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 20,
  },
  endedBtn: {
    width: 150,
    height: 44,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  endedBtnTxt: { color: "#fff", fontWeight: "bold" },
  gateWrap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.9)",
    justifyContent: "center",
    alignItems: "center",
  },
  gateCard: {
    width: "80%",
    backgroundColor: "#222",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
  },
  gateTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 20,
  },
  gateRow: { flexDirection: "row", gap: 16 },
  gateBtn: {
    flex: 1,
    height: 100,
    backgroundColor: "#333",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  gateBtnText: { color: "#fff", marginTop: 8, fontWeight: "600" },
  batterySaverOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 999,
  },
  batterySaverTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
    marginTop: 16,
  },
  // ✅ Style cho Quality Menu Sheet
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
    paddingVertical: 12,
    borderRadius: 10,
    paddingHorizontal: 10,
    marginBottom: 4,
  },
  qualityItemActive: { backgroundColor: "rgba(255,255,255,0.08)" },
  qualityItemLabel: { color: "#fff", fontSize: 14, fontWeight: "600" },
});
