import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  StatusBar,
  Alert,
  Platform,
  PermissionsAndroid,
  ViewStyle,
  NativeModules,
  AppState,
  AppStateStatus,
} from "react-native";
import { requireNativeComponent, UIManager } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons as Icon } from "@expo/vector-icons";
import { PinchGestureHandler, State } from "react-native-gesture-handler";

import { Audio } from "expo-av";
import * as Haptics from "expo-haptics";
import torch_on from "../assets/sfx/click4.mp3";
import torch_off from "../assets/sfx/click4.mp3";
import mic_on from "../assets/sfx/click4.mp3";
import mic_off from "../assets/sfx/click4.mp3";

const SFX = {
  torchOn: torch_on,
  torchOff: torch_off,
  micOn: mic_on,
  micOff: mic_off,
} as const;
type SfxKey = keyof typeof SFX;
const SFX_VOLUME = 1;

const COMPONENT_NAME = "RtmpPreviewView";
(UIManager as any).getViewManagerConfig?.(COMPONENT_NAME);
const _CachedRtmpPreviewView =
  (global as any).__RtmpPreviewView ||
  requireNativeComponent<{}>(COMPONENT_NAME);
(global as any).__RtmpPreviewView = _CachedRtmpPreviewView;
const RtmpPreviewView = _CachedRtmpPreviewView;

const Live = (NativeModules as any).FacebookLiveModule;

type Mode = "pre" | "countdown" | "live" | "stopping" | "ended";
const DEFAULT_FB_SERVER = "rtmps://live-api-s.facebook.com:443/rtmp/";

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
      const dict = soundsRef.current;
      (async () => {
        for (const k of Object.keys(dict) as SfxKey[]) {
          try {
            await dict[k]?.unloadAsync();
          } catch {}
          dict[k] = null;
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

function buildUrl(
  useFullUrl: boolean,
  fullUrl: string,
  server: string,
  key: string
) {
  if (useFullUrl) return (fullUrl || "").trim();
  const s = (server || DEFAULT_FB_SERVER).trim();
  const base = s.endsWith("/") ? s : s + "/";
  return key.trim() ? base + key.trim() : "";
}

// ---- Dotted circular progress (no lib)
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

type Props = {
  tournamentHref?: string;
  homeHref?: string;
  onFinishedGoToTournament?: () => void;
  onFinishedGoHome?: () => void;
};

export default function LiveLikeFBScreenKey(props: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>("pre");
  const [torchOn, setTorchOn] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [count, setCount] = useState(3);

  // Inputs
  const [useFullUrl, setUseFullUrl] = useState(true);
  const [fullUrl, setFullUrl] = useState("");
  const [server, setServer] = useState(DEFAULT_FB_SERVER);
  const [streamKey, setStreamKey] = useState("");

  // Refs
  const startedPreviewRef = useRef(false);
  const lastUrlRef = useRef<string | null>(null);
  const shouldResumeLiveRef = useRef(false);

  // Zoom (UI & raf throttle)
  const clampZoomUI = (z: number) => Math.min(2, Math.max(0.5, z));
  const zoomUIRef = useRef(1); // giá trị UI thực tế
  const [zoomUI, setZoomUI] = useState(1); // để render badge
  const pinchBaseRef = useRef(1);
  const rafIdRef = useRef<number | null>(null);
  const pendingZoomRef = useRef<number | null>(null);
  const lastSentZoomRef = useRef(1);
  const isFrontRef = useRef(false); // toggle khi switchCamera

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

  const playSfx = useSfx();

  // iOS-only bump
  const IOS_BUMP = 100;
  const bottomBump =
    Platform.OS === "ios" ? insets.bottom + IOS_BUMP : 16 + insets.bottom;

  // Elapsed timer (live & stopping)
  const shouldResetElapsedRef = useRef(false);
  useEffect(() => {
    let t: ReturnType<typeof setInterval> | null = null;
    if (mode === "live" || mode === "stopping") {
      if (mode === "live" && shouldResetElapsedRef.current) {
        setElapsed(0);
        shouldResetElapsedRef.current = false;
      }
      t = setInterval(() => setElapsed((s) => s + 1), 1000);
    }
    return () => t && clearInterval(t);
  }, [mode]);

  // Preview bootstrap
  const kickPreview = useCallback(async () => {
    if (startedPreviewRef.current) return;
    const ok = await ensurePermissions();
    if (!ok) {
      Alert.alert("Thiếu quyền", "Cần cấp quyền Camera & Micro để livestream.");
      return;
    }
    try {
      await Live.enableAutoRotate?.(true);
      await Live.startPreview?.();
      // set zoom UI 1.0 khi khởi động
      zoomUIRef.current = 1;
      setZoomUI(1);
      lastSentZoomRef.current = 1;
      Live.setZoom?.(1);
      startedPreviewRef.current = true;
    } catch {
      requestAnimationFrame(() => {
        Live.startPreview?.()
          .then(() => {
            zoomUIRef.current = 1;
            setZoomUI(1);
            lastSentZoomRef.current = 1;
            Live.setZoom?.(1);
            startedPreviewRef.current = true;
          })
          .catch(() => {});
      });
    }
  }, []);

  // Cleanup unmount
  useEffect(() => {
    return () => {
      (async () => {
        try {
          await Live.enableAutoRotate?.(false);
          if (startedPreviewRef.current) {
            await Live.stopPreview?.();
            startedPreviewRef.current = false;
          }
        } catch {}
      })();
    };
  }, []);

  // Focus lifecycle
  useFocusEffect(
    useCallback(() => {
      kickPreview();
      return () => {
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

  // AppState lifecycle
  useEffect(() => {
    const handler = async (nextState: AppStateStatus) => {
      if (nextState === "active") {
        if (!startedPreviewRef.current) await kickPreview();
        if (shouldResumeLiveRef.current && lastUrlRef.current) {
          try {
            await startNative(lastUrlRef.current);
            setMode("live");
          } catch {}
          shouldResumeLiveRef.current = false;
        }
      } else {
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
  }, [kickPreview, mode]);

  // Clock
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  // Start native
  const startNative = useCallback(async (url: string) => {
    await Live.start(url, 3_800_000, 1280, 720, 30);
  }, []);

  // Go live
  const onGoLive = useCallback(async () => {
    const url = buildUrl(useFullUrl, fullUrl, server, streamKey);
    if (!url) {
      Alert.alert(
        "Thiếu stream URL",
        "Hãy nhập Full RTMPS URL hoặc Server + Stream Key."
      );
      return;
    }
    lastUrlRef.current = url;
    setMode("countdown");
    setCount(3);
    shouldResetElapsedRef.current = true;

    let started = false;
    const runner = setInterval(async () => {
      setCount((c) => {
        if (c === 2 && !started) {
          started = true;
          startNative(url).catch((e: any) => {
            clearInterval(runner);
            setMode("pre");
            Alert.alert("Không thể phát", e?.message || String(e));
          });
        }
        if (c <= 1) {
          clearInterval(runner);
          setMode("live");
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }, [useFullUrl, fullUrl, server, streamKey, startNative]);

  // ===== Finish flow (5s)
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

  const resetAfterEnded = useCallback(async () => {
    try {
      await Live.stop();
    } catch {}
    try {
      await Live.stopPreview?.();
      startedPreviewRef.current = false;
    } catch {}
    shouldResumeLiveRef.current = false;
    lastUrlRef.current = null;

    // reset UI
    setTorchOn(false);
    setMicMuted(false);
    setElapsed(0);
    setCount(3);
    setStopProgress(0);
    zoomUIRef.current = 1;
    setZoomUI(1);
    lastSentZoomRef.current = 1;
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
        await resetAfterEnded();
        setMode("ended");
      }
    }, 50);
  }, [STOP_DURATION_MS, clearStopTimer, resetAfterEnded]);

  const cancelStopping = useCallback(() => {
    clearStopTimer();
    setStopProgress(0);
    setMode("live");
  }, [clearStopTimer]);

  useEffect(() => () => clearStopTimer(), [clearStopTimer]);

  // Navigation after ended
  const goTournament = useCallback(() => {
    if (props.onFinishedGoToTournament) return props.onFinishedGoToTournament();
    router.push(props.tournamentHref ?? "/tournament");
  }, [router, props.onFinishedGoToTournament, props.tournamentHref]);

  const goHome = useCallback(() => {
    if (props.onFinishedGoHome) return props.onFinishedGoHome();
    router.push(props.homeHref ?? "/");
  }, [router, props.onFinishedGoHome, props.homeHref]);

  // Toggles
  const onSwitch = useCallback(async () => {
    isFrontRef.current = !isFrontRef.current;
    await Live.switchCamera();
    // nếu chuyển sang front mà zoom < 1.0 thì clamp UI luôn
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

  const cancelCountdown = useCallback(async () => {
    setMode("pre");
    shouldResetElapsedRef.current = false;
    try {
      await Live.stop();
    } catch {}
    shouldResumeLiveRef.current = false;
    lastUrlRef.current = null;
    try {
      await Live.startPreview?.();
      zoomUIRef.current = 1;
      setZoomUI(1);
      lastSentZoomRef.current = 1;
      Live.setZoom?.(1);
      startedPreviewRef.current = true;
    } catch {}
  }, []);

  // Pinch to zoom (iOS)
  const onPinchEvent = useCallback(
    (e: any) => {
      if (Platform.OS !== "ios") return;
      const scale = e?.nativeEvent?.scale ?? 1;
      const desired = clampZoomUI(pinchBaseRef.current * scale);
      const stepped = Math.round(desired * 10) / 10; // bước 0.1
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
      // đảm bảo gửi phát cuối
      const stepped = Math.round(zoomUIRef.current * 10) / 10;
      zoomUIRef.current = stepped;
      setZoomUI(stepped);
      Live.setZoom?.(stepped);
      lastSentZoomRef.current = stepped;
    }
  }, []);

  // ===== UI
  return (
    <View style={{ flex: 1, backgroundColor: "black" }}>
      {/* <StatusBar
        barStyle="light-content"
        translucent
        backgroundColor="transparent"
      /> */}

      <PinchGestureHandler
        onGestureEvent={onPinchEvent}
        onHandlerStateChange={onPinchStateChange}
      >
        <View style={{ flex: 1 }}>
          <RtmpPreviewView
            style={styles.preview as ViewStyle}
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

        {/* Zoom badge (LIVE & STOPPING) */}
        {(mode === "live" || mode === "stopping") && (
          <View style={styles.zoomBadge}>
            <Text style={styles.zoomBadgeTxt}>{zoomUI.toFixed(1)}x</Text>
          </View>
        )}

        {/* Clock */}
        {(mode === "live" || mode === "stopping") && (
          <View style={styles.statusBarRow}>
            <Text style={styles.statusClock}>
              {mm}:{ss}
            </Text>
            <View style={styles.greenDot} />
          </View>
        )}

        {/* ==== PRE MODE ==== */}
        {mode === "pre" && (
          <>
            <View style={styles.selectorRow}>
              <Pressable
                onPress={() => setUseFullUrl(true)}
                style={[
                  styles.selectorBtn,
                  useFullUrl && styles.selectorActive,
                ]}
              >
                <Text
                  style={[
                    styles.selectorTxt,
                    useFullUrl && styles.selectorTxtActive,
                  ]}
                >
                  Full RTMPS URL
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setUseFullUrl(false)}
                style={[
                  styles.selectorBtn,
                  !useFullUrl && styles.selectorActive,
                ]}
              >
                <Text
                  style={[
                    styles.selectorTxt,
                    !useFullUrl && styles.selectorTxtActive,
                  ]}
                >
                  Server + Key
                </Text>
              </Pressable>
            </View>

            {useFullUrl ? (
              <View style={styles.formWrap}>
                <Text style={styles.label}>Secure Stream URL</Text>
                <TextInput
                  style={styles.input}
                  placeholder="rtmps://live-api-s.facebook.com:443/rtmp/<STREAM_KEY?...>"
                  placeholderTextColor="rgba(255,255,255,0.55)"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={fullUrl}
                  onChangeText={setFullUrl}
                />
              </View>
            ) : (
              <View style={styles.formWrap}>
                <Text style={styles.label}>Server</Text>
                <TextInput
                  style={styles.input}
                  placeholder={DEFAULT_FB_SERVER}
                  placeholderTextColor="rgba(255,255,255,0.55)"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={server}
                  onChangeText={setServer}
                />
                <Text style={[styles.label, { marginTop: 10 }]}>
                  Stream Key
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="<STREAM_KEY?...params>"
                  placeholderTextColor="rgba(255,255,255,0.55)"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={streamKey}
                  onChangeText={setStreamKey}
                />
              </View>
            )}

            <View style={[styles.goLiveWrap, { bottom: bottomBump }]}>
              <Pressable
                style={[styles.goLiveBtn, { backgroundColor: "#1877F2" }]}
                onPress={onGoLive}
              >
                <Text style={styles.goLiveTxt}>Go Live</Text>
              </Pressable>
            </View>
          </>
        )}

        {/* ==== COUNTDOWN ==== */}
        {mode === "countdown" && (
          <View style={styles.countdownWrap}>
            <Text style={styles.countNum}>{count}</Text>
            <Text
              style={[
                styles.countHint,
                { bottom: Platform.OS === "ios" ? bottomBump + 20 : 70 },
              ]}
            >
              Starting live broadcast...
            </Text>
            <Pressable style={styles.cancelBtn} onPress={cancelCountdown}>
              <Text style={styles.cancelTxt}>✕</Text>
            </Pressable>
          </View>
        )}

        {/* ==== LIVE MODE ==== */}
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

        {/* ==== STOPPING ==== */}
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

        {/* ==== ENDED ==== */}
        {mode === "ended" && (
          <View style={styles.overlay}>
            <Text style={styles.endedTitle}>
              Đã kết thúc buổi phát trực tiếp
            </Text>
            <View style={[styles.endedBtns, { bottom: bottomBump }]}>
              <Pressable
                style={[styles.endedBtn, { backgroundColor: "#1877F2" }]}
                onPress={goTournament}
              >
                <Text style={styles.endedBtnTxt}>Về trang giải đấu</Text>
              </Pressable>
              <Pressable
                style={[styles.endedBtn, { backgroundColor: "#444" }]}
                onPress={goHome}
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

  selectorRow: {
    position: "absolute",
    top: 68,
    left: 16,
    right: 16,
    flexDirection: "row",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 10,
    padding: 4,
  },
  selectorBtn: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  selectorActive: { backgroundColor: "#fff" },
  selectorTxt: { color: "#fff", fontWeight: "700" },
  selectorTxtActive: { color: "#111" },

  formWrap: { position: "absolute", top: 116, left: 16, right: 16 },
  label: { color: "rgba(255,255,255,0.9)", fontWeight: "700", marginBottom: 6 },
  input: {
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: 10,
    color: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  goLiveWrap: { position: "absolute", left: 16, right: 16 },
  goLiveBtn: {
    height: 46,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  goLiveTxt: { color: "#fff", fontSize: 16, fontWeight: "800" },

  countdownWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "black",
  },
  countNum: { color: "#fff", fontSize: 120, fontWeight: "800" },
  countHint: { position: "absolute", color: "rgba(255,255,255,0.8)" },
  cancelBtn: {
    position: "absolute",
    bottom: 22,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelTxt: { color: "#fff", fontSize: 24, fontWeight: "800" },

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
  progressText: { color: "#fff", marginTop: 80, fontWeight: "600" },

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
