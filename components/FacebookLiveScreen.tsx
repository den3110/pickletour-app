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
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons as Icon } from "@expo/vector-icons";

// 🔊 SFX + Haptics
import { Audio } from "expo-av";
import * as Haptics from "expo-haptics";
// ✅ mới (ESM import)
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

// GIỮ TÊN CŨ
const COMPONENT_NAME = "RtmpPreviewView";
(UIManager as any).getViewManagerConfig?.(COMPONENT_NAME);

const _CachedRtmpPreviewView =
  (global as any).__RtmpPreviewView ||
  requireNativeComponent<{}>(COMPONENT_NAME);
(global as any).__RtmpPreviewView = _CachedRtmpPreviewView;

const RtmpPreviewView = _CachedRtmpPreviewView;
const Live = (NativeModules as any).FacebookLiveModule;

type Mode = "pre" | "countdown" | "live";
const DEFAULT_FB_SERVER = "rtmps://live-api-s.facebook.com:443/rtmp/";

// 🔊 Hook preload & play SFX
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
        // cấu hình nhỏ để beep vẫn phát khi iOS đang silent
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          allowsRecordingIOS: true, // cho phép vừa thu vừa phát
          interruptionModeIOS: Audio.INTERRUPTION_MODE_IOS_MIX_WITH_OTHERS,
          interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DUCK_OTHERS, // ❗
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false, // phát qua loa ngoài
          staysActiveInBackground: false,
        });
        // preload
        for (const key of Object.keys(SFX) as SfxKey[]) {
          const { sound } = await Audio.Sound.createAsync(SFX[key], {
            volume: SFX_VOLUME,
            isLooping: false,
            shouldPlay: false,
          });
          if (mounted) soundsRef.current[key] = sound;
          else await sound.unloadAsync();
        }
      } catch {
        // ignore
      }
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

export default function LiveLikeFBScreenKey() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>("pre");
  const [torchOn, setTorchOn] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [count, setCount] = useState(3);

  // stream inputs
  const [useFullUrl, setUseFullUrl] = useState(true);
  const [fullUrl, setFullUrl] = useState("");
  const [server, setServer] = useState(DEFAULT_FB_SERVER);
  const [streamKey, setStreamKey] = useState("");

  const startedPreviewRef = useRef(false);
  const lastUrlRef = useRef<string | null>(null);
  const shouldResumeLiveRef = useRef(false);

  // 🔊 SFX player
  const playSfx = useSfx();

  // Timer hiển thị thời gian live
  useEffect(() => {
    let t: any;
    if (mode === "live") {
      setElapsed(0);
      t = setInterval(() => setElapsed((s) => s + 1), 1000);
    }
    return () => t && clearInterval(t);
  }, [mode]);

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
      startedPreviewRef.current = true;
    } catch {
      requestAnimationFrame(() => {
        Live.startPreview?.()
          .then(() => {
            startedPreviewRef.current = true;
          })
          .catch(() => {});
      });
    }
  }, []);

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

  useFocusEffect(
    useCallback(() => {
      kickPreview();
      return () => {
        (async () => {
          try {
            if (mode === "live") {
              shouldResumeLiveRef.current = true;
            }
            if (startedPreviewRef.current) {
              await Live.stopPreview?.();
              startedPreviewRef.current = false;
            }
          } catch {}
        })();
      };
    }, [kickPreview, mode])
  );

  useEffect(() => {
    const handler = async (nextState: AppStateStatus) => {
      if (nextState === "active") {
        if (!startedPreviewRef.current) {
          await kickPreview();
        }
        if (shouldResumeLiveRef.current && lastUrlRef.current) {
          try {
            await startNative(lastUrlRef.current);
            setMode("live");
          } catch {}
          shouldResumeLiveRef.current = false;
        }
      } else {
        if (mode === "live") {
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
  }, [kickPreview, mode]);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  const startNative = useCallback(async (url: string) => {
    await Live.start(url, 3_800_000, 1280, 720, 30);
  }, []);

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

  const onFinish = useCallback(async () => {
    try {
      await Live.stop();
    } catch {}
    setMode("pre");
    shouldResumeLiveRef.current = false;
    lastUrlRef.current = null;
    try {
      await Live.startPreview?.();
      startedPreviewRef.current = true;
    } catch {}
  }, []);

  const onSwitch = useCallback(async () => {
    await Live.switchCamera();
    Haptics.selectionAsync();
  }, []);

  const onToggleTorch = useCallback(async () => {
    const next = !torchOn;
    setTorchOn(next);
    // 🔊 & 💥 ngay khi người dùng nhấn để phản hồi tức thì
    playSfx(next ? "torchOn" : "torchOff");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await Live.toggleTorch(next);
    } catch {
      // rollback nếu native fail (hiếm)
      setTorchOn(!next);
      playSfx(!next ? "torchOn" : "torchOff");
    }
  }, [torchOn, playSfx]);

  const onToggleMic = useCallback(async () => {
    const nextMuted = !micMuted;
    setMicMuted(nextMuted);
    // native toggleMic(on:boolean): mic ON khi không muted
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
    try {
      await Live.stop();
    } catch {}
    shouldResumeLiveRef.current = false;
    lastUrlRef.current = null;
    try {
      await Live.startPreview?.();
      startedPreviewRef.current = true;
    } catch {}
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: "black" }}>
      <StatusBar
        barStyle="light-content"
        translucent
        backgroundColor="transparent"
      />

      <RtmpPreviewView
        style={styles.preview as ViewStyle}
        onLayout={kickPreview}
      />

      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        {/* CỤM 3 NÚT */}
        <View style={styles.topButtonsRow} pointerEvents="box-none">
          <Pressable
            onPress={onToggleTorch}
            style={styles.roundBtn}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Toggle torch"
          >
            <Icon
              name={torchOn ? "flashlight-off" : "flashlight"}
              size={20}
              color="#fff"
            />
          </Pressable>

          <Pressable
            onPress={onSwitch}
            style={styles.roundBtn}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Switch camera"
          >
            <Icon name="camera-switch" size={20} color="#fff" />
          </Pressable>

          <Pressable
            onPress={onToggleMic}
            style={styles.roundBtn}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Toggle microphone"
          >
            <Icon
              name={micMuted ? "microphone-off" : "microphone"}
              size={20}
              color="#fff"
            />
          </Pressable>
        </View>

        {mode === "live" && (
          <View style={styles.statusBarRow}>
            <Text style={styles.statusClock}>
              {mm}:{ss}
            </Text>
            <View style={styles.greenDot} />
          </View>
        )}

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

            <View style={[styles.goLiveWrap, { bottom: 16 + insets.bottom }]}>
              <Pressable
                style={[styles.goLiveBtn, { backgroundColor: "#1877F2" }]}
                onPress={onGoLive}
              >
                <Text style={styles.goLiveTxt}>Go Live</Text>
              </Pressable>
            </View>
          </>
        )}

        {mode === "countdown" && (
          <View style={styles.countdownWrap}>
            <Text style={styles.countNum}>{count}</Text>
            <Text style={styles.countHint}>Starting live broadcast...</Text>
            <Pressable style={styles.cancelBtn} onPress={cancelCountdown}>
              <Text style={styles.cancelTxt}>✕</Text>
            </Pressable>
          </View>
        )}

        {mode === "live" && (
          <>
            <View style={styles.liveTopLeft}>
              <View style={styles.livePill}>
                <Text style={styles.livePillTxt}>LIVE</Text>
              </View>
            </View>
            <View style={styles.liveBottomBar}>
              <Pressable onPress={onSwitch}>
                <Text style={styles.liveIcon}>🔄</Text>
              </Pressable>
              <Pressable onPress={onToggleMic}>
                <Text style={styles.liveIcon}>{micMuted ? "🎤🚫" : "🎤"}</Text>
              </Pressable>
              <Pressable onPress={onToggleTorch}>
                <Text style={styles.liveIcon}>{torchOn ? "⚡️" : "⚡"}</Text>
              </Pressable>
              <Pressable style={styles.finishBtn} onPress={onFinish}>
                <Text style={styles.finishTxt}>Finish</Text>
              </Pressable>
            </View>
          </>
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
  roundTxt: { color: "#fff", fontSize: 18 },

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

  goLiveWrap: { position: "absolute", bottom: 98, left: 16, right: 16 },
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
  countHint: {
    position: "absolute",
    bottom: 70,
    color: "rgba(255,255,255,0.8)",
  },
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
    bottom: 14,
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
});
