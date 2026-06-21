import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as ScreenOrientation from "expo-screen-orientation";
import { StatusBar } from "expo-status-bar";
import { createVideoPlayer, VideoView } from "expo-video";
import { router } from "expo-router";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  useWindowDimensions,
  View,
  ViewToken,
} from "react-native";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { useIsFocused } from "@react-navigation/native";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ResponsiveMatchViewer from "@/components/match/ResponsiveMatchViewer";
import { CompatVideo as Video } from "@/lib/expoMediaCompat";
import { useGetLiveFeedProbeQuery, useGetLiveFeedQuery } from "@/slices/liveApiSlice";
import { normalizeUrl } from "@/utils/normalizeUri";
import AppleLiquidGlassView from "@/components/ui/AppleLiquidGlassView";
import { IOS_26_LIQUID_GLASS_ENABLED } from "@/utils/nativeTabs";

import { getLiveMatchCourtText } from "./courtDisplay";
import InfoModal from "./InfoModal";
import {
  buildCanonicalSessions,
  getLiveSessions,
  getLiveStatusLabel,
  sid,
  timeAgo,
} from "./liveUtils";

const FEED_LIMIT = 8;
const GLOBAL_MUTE_KEY = "pickletour-live-global-muted-v1";
const BLURHASH = "|rF?hV%2WCj[ayj[a|j[az_NaeWBj@ayfRayfQfQM{M|azj[azf6fQfQfQIpWXo";
const MODE_CHIPS = [
  { value: "all", label: "Tất cả" },
  { value: "live", label: "Live" },
  { value: "replay", label: "Replay" },
];

function LiveGlassSurface({
  children,
  effect = "regular",
  interactive = false,
  style,
  tintColor = "rgba(6,10,16,0.58)",
}: {
  children?: React.ReactNode;
  effect?: "regular" | "clear";
  interactive?: boolean;
  style?: any;
  tintColor?: string;
}) {
  return (
    <AppleLiquidGlassView
      fallback="view"
      glassColorScheme="dark"
      glassEffectStyle={effect}
      glassTintColor={tintColor}
      isInteractive={interactive}
      style={style}
    >
      {children}
    </AppleLiquidGlassView>
  );
}

function asTrimmed(value: any) {
  return String(value || "").trim();
}

function isNativeSharedObjectError(error: any) {
  const message = String(error?.message || error || "");
  return (
    message.includes("NativeSharedObjectNotFoundException") ||
    message.includes("native shared object")
  );
}

function safeNativePlayerNumber(player: any, key: string, fallback = 0) {
  try {
    const value = Number(player?.[key] || fallback);
    return Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function safeNativePlayerSet(
  player: any,
  key: string,
  value: any,
  onInvalid?: (error: any) => void
) {
  try {
    if (!player) return false;
    player[key] = value;
    return true;
  } catch (error) {
    if (isNativeSharedObjectError(error)) onInvalid?.(error);
    return false;
  }
}

function safeNativePlayerCall<T = any>(
  player: any,
  method: string,
  args: any[] = [],
  onInvalid?: (error: any) => void
) {
  try {
    const action = player?.[method];
    if (typeof action !== "function") return undefined;
    return action.apply(player, args) as T;
  } catch (error) {
    if (isNativeSharedObjectError(error)) onInvalid?.(error);
    return undefined;
  }
}

function relativeTime(value?: string | number | Date | null) {
  return timeAgo(value);
}

function extractScoreTuple(score: any) {
  if (!score || typeof score !== "object") return null;
  const left =
    score.scoreA ?? score.teamA ?? score.sideA ?? score.a ?? score.left ?? score.home ?? null;
  const right =
    score.scoreB ?? score.teamB ?? score.sideB ?? score.b ?? score.right ?? score.away ?? null;
  if (Number.isFinite(Number(left)) && Number.isFinite(Number(right))) {
    return [Number(left), Number(right)];
  }
  return null;
}

function statusTone(status?: string | null) {
  switch (asTrimmed(status).toLowerCase()) {
    case "live":
      return {
        text: "#ffffff",
        background: "rgba(255, 86, 105, 0.96)",
        border: "rgba(255, 129, 145, 0.84)",
      };
    case "finished":
      return {
        text: "#8df0cb",
        background: "rgba(52, 211, 153, 0.16)",
        border: "rgba(52, 211, 153, 0.34)",
      };
    default:
      return {
        text: "#f6d365",
        background: "rgba(246, 211, 101, 0.16)",
        border: "rgba(246, 211, 101, 0.3)",
      };
  }
}

function buildGradientColors(item: any) {
  const seed = sid(item?._id || item?.tournament?._id || item?.code || "feed");
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(index);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  const secondaryHue = (hue + 54) % 360;
  return [
    `hsl(${hue}, 72%, 28%)`,
    `hsl(${secondaryHue}, 74%, 14%)`,
    `hsl(${(secondaryHue + 28) % 360}, 64%, 10%)`,
  ];
}

function buildInitials(value: any) {
  const text = asTrimmed(value);
  if (!text) return "PT";
  const parts = text
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return "PT";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

function getFeedTitle(item: any) {
  const teamA = asTrimmed(item?.teamAName || item?.pairA?.name || "Đội A");
  const teamB = asTrimmed(item?.teamBName || item?.pairB?.name || "Đội B");
  return `${teamA} vs ${teamB}`;
}

function getFeedSubtitle(item: any) {
  return (
    asTrimmed(item?.displayCode) ||
    asTrimmed(getLiveMatchCourtText(item)) ||
    asTrimmed(item?.courtLabel) ||
    asTrimmed(item?.tournament?.name) ||
    "PickleTour Live"
  );
}

function buildFeedTags(item: any, scoreTuple: number[] | null) {
  const tags: string[] = [];
  const pushTag = (value: any) => {
    const normalized = asTrimmed(value);
    if (!normalized) return;
    tags.push(normalized.startsWith("#") ? normalized : `#${normalized}`);
  };

  pushTag(item?.displayCode);
  pushTag(getLiveMatchCourtText(item) || item?.courtLabel);
  if (item?.currentGame > 0) pushTag(`Game ${item.currentGame}`);
  if (scoreTuple) pushTag(`${scoreTuple[0]}-${scoreTuple[1]}`);
  pushTag(getLiveStatusLabel(item?.status));
  return tags.slice(0, 4);
}

function buildFeedCodeChipLabel(item: any) {
  const code = asTrimmed(item?.displayCode || item?.code || item?.globalCode);
  return code ? `Mã ${code}` : "";
}

function buildFeedStageChipLabel(item: any) {
  const direct = asTrimmed(item?.stageLabel);
  if (direct) return direct;

  const phase = asTrimmed(item?.phase).toLowerCase();
  const branch = asTrimmed(item?.branch).toLowerCase();
  const bracketType = asTrimmed(item?.bracket?.type).toLowerCase();

  if (item?.meta?.thirdPlace === true || branch === "consol") return "Tranh 3-4";
  if (phase === "grand_final" || branch === "gf") return "Chung kết tổng";
  if (
    phase === "group" ||
    item?.pool?.name ||
    ["group", "round_robin", "gsl"].includes(bracketType)
  ) {
    return "Vòng bảng";
  }
  if (phase === "losers" || branch === "lb") return "Nhánh thua";
  if (phase === "winners" || branch === "wb") return "Nhánh thắng";
  return "";
}

function isNativeSession(session: any) {
  if (!session) return false;
  const key = asTrimmed(session?.key).toLowerCase();
  const kind = asTrimmed(session?.kind).toLowerCase();
  if (key === "server2") return true;
  return ["file", "hls", "delayed_manifest"].includes(kind);
}

function getFeedSessions(item: any) {
  const canonical = buildCanonicalSessions(item);
  if (canonical.length > 0) return canonical;
  return getLiveSessions(item);
}

function selectFeedSession(item: any) {
  const sessions = getFeedSessions(item);
  const preferredKey = asTrimmed(item?.feedPreferredStreamKey);
  return (
    sessions.find((session: any) => asTrimmed(session?.key) === preferredKey) ||
    sessions.find((session: any) => asTrimmed(session?.key) === asTrimmed(item?.defaultStreamKey)) ||
    sessions.find((session: any) => session?.primary && session?.ready !== false) ||
    sessions.find((session: any) => session?.ready !== false) ||
    sessions[0] ||
    null
  );
}

function buildPlaybackSnapshotKey(item: any, session?: any) {
  const itemKey = sid(item?._id || item?.matchId || item?.id || item?.globalCode || item?.code || "feed");
  const sessionKey = sid(
    asTrimmed(
      session?.key ||
        session?.directUrl ||
        session?.manifestUrl ||
        session?.pluginUrl ||
        session?.watchUrl ||
        session?.openUrl ||
        "session"
    )
  );
  return `${itemKey}:${sessionKey}`;
}

function buildNativeVideoSource(session: any) {
  const uri = normalizeUrl(asTrimmed(session?.directUrl || session?.manifestUrl || ""));
  if (!uri) return null;

  const key = asTrimmed(session?.key).toLowerCase();
  const kind = asTrimmed(session?.kind).toLowerCase();

  return {
    uri,
    contentType:
      key === "server2" || kind === "hls" || kind === "delayed_manifest" ? "hls" : "auto",
  };
}

function showNotice(message: string) {
  if (Platform.OS === "android") {
    ToastAndroid.show(message, ToastAndroid.SHORT);
    return;
  }
  Alert.alert("Thông báo", message);
}

function buildPlayerHtml(embedHtml: string) {
  return `<!DOCTYPE html>
  <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      <style>
        html, body {
          margin: 0;
          padding: 0;
          background: #000;
          height: 100%;
          overflow: hidden;
        }
        body {
          display: flex;
          align-items: center;
          justify-content: center;
        }
        iframe, video {
          width: 100%;
          height: 100%;
          border: 0;
        }
      </style>
    </head>
    <body>${embedHtml}</body>
  </html>`;
}

function FeedVideoSurface({
  session,
  shouldPlay,
  muted,
  startPosition = 0,
  useNativeControls = false,
  onPlaybackStatusUpdate,
  pointerEvents = "none",
  resizeMode = "cover",
}: {
  session?: any;
  shouldPlay: boolean;
  muted: boolean;
  startPosition?: number;
  useNativeControls?: boolean;
  onPlaybackStatusUpdate?: (status: any) => void;
  pointerEvents?: "auto" | "none" | "box-none" | "box-only";
  resizeMode?: "contain" | "cover";
}) {
  if (!session) return null;

  if (session?.embedHtml) {
    return (
      <WebView
        source={{ html: buildPlayerHtml(session.embedHtml) }}
        style={StyleSheet.absoluteFill}
        javaScriptEnabled
        domStorageEnabled
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        pointerEvents={pointerEvents}
      />
    );
  }

  if (session?.pluginUrl) {
    return (
      <WebView
        source={{ uri: normalizeUrl(session.pluginUrl) }}
        style={StyleSheet.absoluteFill}
        javaScriptEnabled
        domStorageEnabled
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        pointerEvents={pointerEvents}
      />
    );
  }

  if (session?.directUrl || session?.manifestUrl) {
    return (
      <Video
        style={StyleSheet.absoluteFill}
        source={{ uri: normalizeUrl(session?.directUrl || session?.manifestUrl) }}
        shouldPlay={shouldPlay}
        shouldLoop
        muted={muted}
        startPosition={startPosition}
        pointerEvents={pointerEvents}
        useNativeControls={useNativeControls}
        resizeMode={resizeMode}
        onPlaybackStatusUpdate={onPlaybackStatusUpdate}
      />
    );
  }

  return null;
}

function SharedNativeVideoSurface({
  player,
  pointerEvents = "none",
  resizeMode = "cover",
}: {
  player: any;
  pointerEvents?: "auto" | "none" | "box-none" | "box-only";
  resizeMode?: "contain" | "cover";
}) {
  if (!player) return null;

  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      pointerEvents={pointerEvents}
      nativeControls={false}
      contentFit={resizeMode}
      fullscreenOptions={{ enable: false }}
    />
  );
}

function formatPlaybackTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "00:00";
  const totalSeconds = Math.floor(value);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function FullscreenNativeVideoPlayer({
  session,
  visible,
  muted,
  startPosition = 0,
  shouldPlayOnOpen = true,
  playerOverride,
  onPlaybackStateChange,
  onToggleMuted,
  onClose,
}: {
  session: any;
  visible: boolean;
  muted: boolean;
  startPosition?: number;
  shouldPlayOnOpen?: boolean;
  playerOverride?: any;
  onPlaybackStateChange?: (state: any) => void;
  onToggleMuted: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressWidthRef = useRef(0);
  const [internalPlayer] = useState(() => createVideoPlayer(null));
  const player = playerOverride || internalPlayer;
  const ownsPlayer = !playerOverride;
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedPosition, setBufferedPosition] = useState(0);
  const [playerError, setPlayerError] = useState("");
  const playbackSnapshotRef = useRef({
    currentTime: 0,
    duration: 0,
    bufferedPosition: 0,
    isPlaying: false,
    isLoaded: false,
    error: "",
  });

  const source = useMemo(() => buildNativeVideoSource(session), [session]);

  const clearControlsTimer = useCallback(() => {
    if (controlsTimerRef.current) {
      clearTimeout(controlsTimerRef.current);
      controlsTimerRef.current = null;
    }
  }, []);

  const scheduleHideControls = useCallback(() => {
    clearControlsTimer();
    if (!isPlaying || isEnded) return;
    controlsTimerRef.current = setTimeout(() => {
      setControlsVisible(false);
    }, 2200);
  }, [clearControlsTimer, isEnded, isPlaying]);

  const showControls = useCallback(() => {
    setControlsVisible(true);
  }, []);

  const syncStateFromPlayer = useCallback(
    (fallbackPlaying = shouldPlayOnOpen) => {
      const nextCurrentTime = safeNativePlayerNumber(player, "currentTime", startPosition || 0);
      const nextDuration = safeNativePlayerNumber(
        player,
        "duration",
        playbackSnapshotRef.current.duration || 0
      );
      const nextBufferedPosition = safeNativePlayerNumber(player, "bufferedPosition");
      let nextIsPlaying = fallbackPlaying;
      let nextStatus = "";
      try {
        nextIsPlaying = typeof player.playing === "boolean" ? player.playing : fallbackPlaying;
        nextStatus = String(player.status || "");
      } catch {
        // no-op
      }
      const nextIsLoaded =
        nextStatus === "readyToPlay" || nextDuration > 0 || nextCurrentTime > 0;

      setIsLoaded(nextIsLoaded);
      setIsPlaying(Boolean(nextIsPlaying));
      setIsEnded(Boolean(nextDuration > 0 && nextCurrentTime >= nextDuration && !nextIsPlaying));
      setCurrentTime(nextCurrentTime);
      setDuration(nextDuration);
      setBufferedPosition(nextBufferedPosition);
      setPlayerError("");

      const nextState = {
        currentTime: nextCurrentTime,
        duration: nextDuration,
        bufferedPosition: nextBufferedPosition,
        isPlaying: Boolean(nextIsPlaying),
        isLoaded: nextIsLoaded,
        error: "",
      };
      playbackSnapshotRef.current = nextState;
      publishPlaybackState(nextState);
    },
    [player, publishPlaybackState, shouldPlayOnOpen, startPosition]
  );

  const publishPlaybackState = useCallback(
    (patch: any = {}) => {
      const previous = playbackSnapshotRef.current;
      const next = {
        currentTime: Number.isFinite(Number(patch?.currentTime))
          ? Number(patch.currentTime)
          : previous.currentTime,
        duration: Number.isFinite(Number(patch?.duration)) ? Number(patch.duration) : previous.duration,
        bufferedPosition: Number.isFinite(Number(patch?.bufferedPosition))
          ? Number(patch.bufferedPosition)
          : previous.bufferedPosition,
        isPlaying:
          typeof patch?.isPlaying === "boolean" ? patch.isPlaying : previous.isPlaying,
        isLoaded:
          typeof patch?.isLoaded === "boolean" ? patch.isLoaded : previous.isLoaded,
        error: typeof patch?.error === "string" ? patch.error : previous.error,
        didJustFinish: Boolean(patch?.didJustFinish),
      };
      playbackSnapshotRef.current = next;
      onPlaybackStateChange?.(next);
    },
    [onPlaybackStateChange]
  );

  useEffect(() => {
    safeNativePlayerSet(player, "timeUpdateEventInterval", 0.25);
    if (ownsPlayer) {
      safeNativePlayerSet(player, "loop", false);
    }
  }, [ownsPlayer, player]);

  useEffect(() => {
    safeNativePlayerSet(player, "muted", muted);
  }, [muted, player]);

  useEffect(() => {
    const subscriptions: { remove: () => void }[] = [];
    const addPlayerListener = (eventName: string, listener: (event: any) => void) => {
      const subscription = safeNativePlayerCall<{ remove: () => void }>(player, "addListener", [
        eventName,
        listener,
      ]);
      if (!subscription) return false;
      subscriptions.push(subscription);
      return true;
    };
    const removeSubscriptions = () => {
      subscriptions.forEach((subscription) => {
        try {
          subscription.remove();
        } catch {
          // no-op
        }
      });
    };

    const didAttachListeners = [
      addPlayerListener("sourceLoad", ({ duration: nextDuration }: any) => {
        const resolvedDuration = Number(
          nextDuration || safeNativePlayerNumber(player, "duration")
        );
        setIsLoaded(true);
        setDuration(resolvedDuration);
        setPlayerError("");
        publishPlaybackState({
          isLoaded: true,
          duration: resolvedDuration,
          error: "",
        });
      }),
      addPlayerListener("playingChange", ({ isPlaying: nextIsPlaying }: any) => {
        setIsPlaying(Boolean(nextIsPlaying));
        publishPlaybackState({
          isPlaying: Boolean(nextIsPlaying),
        });
      }),
      addPlayerListener("timeUpdate", ({ currentTime: nextTime, bufferedPosition: nextBuffered }: any) => {
        const resolvedDuration = safeNativePlayerNumber(
          player,
          "duration",
          playbackSnapshotRef.current.duration || 0
        );
        setCurrentTime(Number(nextTime || 0));
        setBufferedPosition(Number(nextBuffered || 0));
        if (resolvedDuration > 0) {
          setDuration(resolvedDuration);
        }
        publishPlaybackState({
          currentTime: Number(nextTime || 0),
          bufferedPosition: Number(nextBuffered || 0),
          duration: resolvedDuration > 0 ? resolvedDuration : undefined,
        });
      }),
      addPlayerListener("playToEnd", () => {
        setIsEnded(true);
        setIsPlaying(false);
        setControlsVisible(true);
        publishPlaybackState({
          currentTime: safeNativePlayerNumber(player, "currentTime"),
          duration: safeNativePlayerNumber(player, "duration"),
          isPlaying: false,
          didJustFinish: true,
        });
      }),
      addPlayerListener("statusChange", ({ status, error }: any) => {
        if (status === "error") {
          const nextError = error?.message ?? "Không phát được video.";
          setPlayerError(nextError);
          setControlsVisible(true);
          publishPlaybackState({
            error: nextError,
            isPlaying: false,
          });
          return;
        }
        if (status === "readyToPlay") {
          publishPlaybackState({
            isLoaded: true,
            duration: safeNativePlayerNumber(player, "duration"),
            error: "",
          });
        }
      }),
    ].every(Boolean);

    if (!didAttachListeners) {
      removeSubscriptions();
      return undefined;
    }

    return removeSubscriptions;
  }, [player, publishPlaybackState]);

  useEffect(() => {
    let cancelled = false;

    if (!visible || (!source && ownsPlayer)) {
      if (ownsPlayer) {
        safeNativePlayerCall(player, "pause");
      }
      return undefined;
    }

    setControlsVisible(true);
    setIsEnded(false);
    setPlayerError("");
    if (!ownsPlayer) {
      syncStateFromPlayer(shouldPlayOnOpen);
      if (shouldPlayOnOpen === false) {
        safeNativePlayerCall(player, "pause");
      } else {
        safeNativePlayerCall(player, "play");
      }
      return undefined;
    }

    setIsLoaded(false);
    setCurrentTime(startPosition > 0 ? startPosition : 0);
    setDuration(0);
    setBufferedPosition(0);
    playbackSnapshotRef.current = {
      currentTime: startPosition > 0 ? startPosition : 0,
      duration: 0,
      bufferedPosition: 0,
      isPlaying: false,
      isLoaded: false,
      error: "",
    };
    publishPlaybackState(playbackSnapshotRef.current);

    (async () => {
      try {
        await player.replaceAsync(source);
        if (cancelled) return;
        if (Number.isFinite(startPosition) && startPosition > 0) {
          safeNativePlayerSet(player, "currentTime", startPosition);
        }
        if (shouldPlayOnOpen === false) {
          safeNativePlayerCall(player, "pause");
        } else {
          safeNativePlayerCall(player, "play");
        }
      } catch (error: any) {
        if (cancelled) return;
        const nextError = error?.message ?? "Không phát được video.";
        setPlayerError(nextError);
        publishPlaybackState({
          error: nextError,
          isPlaying: false,
        });
      }
    })();

    return () => {
      cancelled = true;
      if (ownsPlayer) {
        safeNativePlayerCall(player, "pause");
      }
    };
  }, [ownsPlayer, player, publishPlaybackState, shouldPlayOnOpen, source, startPosition, syncStateFromPlayer, visible]);

  useEffect(() => {
    if (!visible) {
      clearControlsTimer();
      setControlsVisible(true);
      return undefined;
    }

    if (controlsVisible) scheduleHideControls();
    else clearControlsTimer();

    return clearControlsTimer;
  }, [clearControlsTimer, controlsVisible, scheduleHideControls, visible]);

  useEffect(() => {
    return () => {
      clearControlsTimer();
      if (ownsPlayer && !__DEV__) {
        safeNativePlayerCall(internalPlayer, "release");
      }
    };
  }, [clearControlsTimer, internalPlayer, ownsPlayer]);

  const progressRatio =
    duration > 0 ? Math.max(0, Math.min(1, currentTime / duration)) : 0;
  const bufferedRatio =
    duration > 0 ? Math.max(progressRatio, Math.min(1, bufferedPosition / duration)) : 0;

  const bumpControls = useCallback(() => {
    showControls();
    scheduleHideControls();
  }, [scheduleHideControls, showControls]);

  const handleTogglePlayback = useCallback(() => {
    if (isEnded) {
      safeNativePlayerCall(player, "replay");
      setIsEnded(false);
      bumpControls();
      return;
    }

    if (isPlaying) {
      safeNativePlayerCall(player, "pause");
      showControls();
      clearControlsTimer();
      return;
    }

    safeNativePlayerCall(player, "play");
    bumpControls();
  }, [bumpControls, clearControlsTimer, isEnded, isPlaying, player, showControls]);

  const handleSeekBy = useCallback(
    (seconds: number) => {
      if (!isLoaded) return;
      safeNativePlayerCall(player, "seekBy", [seconds]);
      setIsEnded(false);
      bumpControls();
    },
    [bumpControls, isLoaded, player]
  );

  const handleSeekTo = useCallback(
    (event: any) => {
      if (!duration || !progressWidthRef.current) return;
      const locationX = Number(event?.nativeEvent?.locationX || 0);
      const ratio = Math.max(0, Math.min(1, locationX / progressWidthRef.current));
      const nextTime = ratio * duration;
      safeNativePlayerSet(player, "currentTime", nextTime);
      setCurrentTime(nextTime);
      setIsEnded(false);
      bumpControls();
    },
    [bumpControls, duration, player]
  );

  return (
    <Pressable style={styles.fullscreenModal} onPress={controlsVisible ? undefined : showControls}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        nativeControls={false}
        contentFit="contain"
        fullscreenOptions={{ enable: false }}
      />

      {!isLoaded && !playerError ? (
        <View style={styles.fullscreenLoaderWrap} pointerEvents="none">
          <ActivityIndicator size="large" color="#ffffff" />
        </View>
      ) : null}

      {controlsVisible ? (
        <View style={styles.fullscreenChrome}>
          <LinearGradient
            colors={["rgba(0,0,0,0.72)", "transparent"]}
            style={[styles.fullscreenTopFade, { paddingTop: insets.top + 10 }]}
          >
            <View style={styles.fullscreenTopBar}>
              <TouchableOpacity onPress={onClose} activeOpacity={0.9} style={styles.fullscreenControlButton}>
                <Ionicons name="contract-outline" size={20} color="#ffffff" />
              </TouchableOpacity>

              <View style={styles.fullscreenTitleWrap}>
                <Text style={styles.fullscreenTitle} numberOfLines={1}>
                  {session?.displayLabel || session?.label || "Video"}
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => {
                  onToggleMuted();
                  bumpControls();
                }}
                activeOpacity={0.9}
                style={styles.fullscreenControlButton}
              >
                <Ionicons
                  name={muted ? "volume-mute-outline" : "volume-high-outline"}
                  size={20}
                  color="#ffffff"
                />
              </TouchableOpacity>
            </View>
          </LinearGradient>

          <View style={styles.fullscreenCenterTap}>
            <View style={styles.fullscreenCenterControlsRow}>
              <TouchableOpacity
                onPress={() => handleSeekBy(-10)}
                activeOpacity={0.9}
                style={styles.fullscreenSkipButton}
              >
                <Ionicons name="play-back" size={24} color="#ffffff" />
                <Text style={styles.fullscreenSkipButtonText}>10s</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleTogglePlayback}
                activeOpacity={0.9}
                style={styles.fullscreenPlayButton}
              >
                <Ionicons
                  name={isPlaying && !isEnded ? "pause" : "play"}
                  size={34}
                  color="#ffffff"
                  style={!isPlaying || isEnded ? { marginLeft: 2 } : null}
                />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleSeekBy(10)}
                activeOpacity={0.9}
                style={styles.fullscreenSkipButton}
              >
                <Ionicons name="play-forward" size={24} color="#ffffff" />
                <Text style={styles.fullscreenSkipButtonText}>10s</Text>
              </TouchableOpacity>
            </View>
          </View>

          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.82)"]}
            style={styles.fullscreenBottomFade}
          >
            {playerError ? (
              <Text style={styles.fullscreenErrorText}>{playerError}</Text>
            ) : null}

            <View style={styles.fullscreenBottomBar}>
              <View style={styles.fullscreenSeekRow}>
                <Text style={styles.fullscreenTimeText}>{formatPlaybackTime(currentTime)}</Text>

                <Pressable
                  style={styles.fullscreenProgressWrap}
                  onLayout={(event) => {
                    progressWidthRef.current = event.nativeEvent.layout.width;
                  }}
                  onPress={handleSeekTo}
                >
                  <View style={styles.fullscreenProgressTrack}>
                    <View
                      style={[styles.fullscreenProgressBuffered, { width: `${bufferedRatio * 100}%` }]}
                    />
                    <View
                      style={[styles.fullscreenProgressFill, { width: `${progressRatio * 100}%` }]}
                    />
                  </View>
                </Pressable>

                <Text style={styles.fullscreenTimeText}>{formatPlaybackTime(duration)}</Text>
              </View>
            </View>
          </LinearGradient>
        </View>
      ) : null}
    </Pressable>
  );
}

function IconCircleButton({
  icon,
  label,
  onPress,
  disabled = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      disabled={disabled}
      style={[styles.railItem, disabled && styles.railItemDisabled]}
    >
      <LiveGlassSurface
        interactive={!disabled}
        tintColor="rgba(255,255,255,0.14)"
        style={[styles.railButton, disabled && styles.railButtonDisabled]}
      >
        <Ionicons name={icon} size={20} color="#ffffff" />
      </LiveGlassSurface>
      <Text style={styles.railLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function ModeChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.9}
    >
      <LiveGlassSurface
        interactive
        tintColor={active ? "rgba(37,244,238,0.46)" : "rgba(6,10,16,0.58)"}
        style={[styles.modeChip, active ? styles.modeChipActive : null]}
      >
        <Text style={[styles.modeChipText, active ? styles.modeChipTextActive : null]}>{label}</Text>
      </LiveGlassSurface>
    </TouchableOpacity>
  );
}

const FeedSlide = memo(function FeedSlide({
  item,
  height,
  topInset,
  bottomInset,
  isActive,
  shouldRenderPlayer,
  globalMuted,
  onOpenInfo,
  onOpenViewer,
  onOpenFullscreen,
  sharedNativePlayer,
  sharedNativePlayerKey,
  onToggleMuted,
  onOpenExternal,
}: any) {
  const session = useMemo(() => selectFeedSession(item), [item]);
  const sessions = useMemo(() => getFeedSessions(item), [item]);
  const scoreTuple = useMemo(() => extractScoreTuple(item?.score), [item?.score]);
  const posterUrl = normalizeUrl(asTrimmed(item?.posterUrl || item?.poster_url || ""));
  const tournamentImage = normalizeUrl(asTrimmed(item?.tournament?.image || item?.tournament?.logo || ""));
  const tournamentName = asTrimmed(item?.tournament?.name) || "PickleTour Live";
  const subtitle = getFeedSubtitle(item);
  const title = getFeedTitle(item);
  const statusMeta = statusTone(item?.status);
  const codeChipLabel = buildFeedCodeChipLabel(item);
  const stageChipLabel = buildFeedStageChipLabel(item);
  const replayState = asTrimmed(item?.replayState).toLowerCase();
  const isNative = isNativeSession(session);
  const canMute = Boolean(session && isNative);
  const playerResizeMode = asTrimmed(item?.preferredObjectFit).toLowerCase() === "contain"
    ? "contain"
    : "cover";
  const primaryOpenUrl = normalizeUrl(
    asTrimmed(item?.primaryOpenUrl || session?.watchUrl || session?.openUrl || "")
  );
  const metaText = item?.updatedAt ? relativeTime(item.updatedAt) : getLiveStatusLabel(item?.status);
  const tags = useMemo(() => buildFeedTags(item, scoreTuple), [item, scoreTuple]);
  const gradientColors = useMemo(() => buildGradientColors(item), [item]);
  const showProcessingState =
    asTrimmed(item?.status).toLowerCase() === "finished" && replayState === "processing";
  const showTemporaryReplayHint =
    asTrimmed(item?.status).toLowerCase() === "finished" && replayState === "temporary";
  const canOpenViewer = Boolean(sid(item?._id || item?.matchId || item?.id));
  const canOpenFullscreen = Boolean(session);
  const playbackKey = buildPlaybackSnapshotKey(item, session);
  const usingSharedNativePlayer = Boolean(isNative && sharedNativePlayer && sharedNativePlayerKey === playbackKey);
  const openLink = useCallback(() => {
    if (primaryOpenUrl) onOpenExternal(primaryOpenUrl);
  }, [onOpenExternal, primaryOpenUrl]);

  return (
    <View style={[styles.slide, { height }]}>
      <LinearGradient colors={gradientColors} style={StyleSheet.absoluteFill} />

      {posterUrl ? (
        <ExpoImage
          source={{ uri: posterUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          placeholder={{ blurhash: BLURHASH }}
          transition={120}
        />
      ) : null}

      {shouldRenderPlayer && session ? (
        <View style={StyleSheet.absoluteFill}>
          {usingSharedNativePlayer ? (
            <SharedNativeVideoSurface
              player={sharedNativePlayer}
              pointerEvents="none"
              resizeMode={playerResizeMode}
            />
          ) : !isNative ? (
            <FeedVideoSurface
              session={session}
              shouldPlay={isActive}
              muted={globalMuted}
              pointerEvents="none"
              useNativeControls={false}
              resizeMode={playerResizeMode}
            />
          ) : null}
        </View>
      ) : null}

      <LinearGradient
        colors={[
          "rgba(4,8,14,0.62)",
          "rgba(4,8,14,0.18)",
          "rgba(0,0,0,0.52)",
          "rgba(0,0,0,0.92)",
        ]}
        locations={[0, 0.22, 0.62, 1]}
        style={StyleSheet.absoluteFill}
      />

      {showProcessingState ? (
        <View style={styles.processingWrap}>
          <ActivityIndicator size="large" color="#ffffff" />
          <Text style={styles.processingTitle}>Video đang được xử lý</Text>
          <Text style={styles.processingText}>
            Bản replay đầy đủ sẽ hiển thị sau khi hệ thống ghép xong video.
          </Text>
        </View>
      ) : null}

      <View style={[styles.cardTopChips, { top: topInset + 82 }]}>
        <LiveGlassSurface
          tintColor={statusMeta.background}
          style={[
            styles.statusChip,
            {
              backgroundColor: statusMeta.background,
              borderColor: statusMeta.border,
            },
          ]}
        >
          <Text style={[styles.statusChipText, { color: statusMeta.text }]}>
            {getLiveStatusLabel(item?.status)}
          </Text>
        </LiveGlassSurface>

        {codeChipLabel ? (
          <LiveGlassSurface effect="clear" tintColor="rgba(7,12,18,0.52)" style={styles.metaChip}>
            <Text style={styles.metaChipText}>{codeChipLabel}</Text>
          </LiveGlassSurface>
        ) : null}

        {stageChipLabel ? (
          <LiveGlassSurface
            effect="clear"
            tintColor="rgba(37,244,238,0.16)"
            style={[styles.metaChip, styles.metaChipAccent]}
          >
            <Text style={[styles.metaChipText, styles.metaChipAccentText]}>{stageChipLabel}</Text>
          </LiveGlassSurface>
        ) : null}

        {showTemporaryReplayHint ? (
          <LiveGlassSurface
            effect="clear"
            tintColor="rgba(37,244,238,0.16)"
            style={[styles.metaChip, styles.metaChipAccent]}
          >
            <Text style={[styles.metaChipText, styles.metaChipAccentText]}>Đang phát bản tạm</Text>
          </LiveGlassSurface>
        ) : null}
      </View>

      <View style={[styles.bottomOverlay, { bottom: bottomInset + 18 }]}>
        <LiveGlassSurface
          effect="clear"
          tintColor="rgba(6,10,16,0.34)"
          style={[styles.infoColumn, IOS_26_LIQUID_GLASS_ENABLED && styles.infoGlassPanel]}
        >
          <View style={styles.creatorRow}>
            <View style={[styles.avatarFallback, !tournamentImage ? { backgroundColor: "rgba(37,244,238,0.24)" } : null]}>
              {tournamentImage ? (
                <ExpoImage
                  source={{ uri: tournamentImage }}
                  style={styles.avatarImage}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={100}
                />
              ) : (
                <Text style={styles.avatarText}>{buildInitials(tournamentName)}</Text>
              )}
            </View>

            <View style={styles.creatorTextWrap}>
              <Text style={styles.tournamentName} numberOfLines={1}>
                {tournamentName}
              </Text>
              <Text style={styles.subtitleText} numberOfLines={1}>
                {subtitle}
              </Text>
            </View>

            <LiveGlassSurface effect="clear" tintColor="rgba(7,12,18,0.44)" style={styles.timePill}>
              <Ionicons name="time-outline" size={12} color="rgba(255,255,255,0.74)" />
              <Text style={styles.timePillText}>{metaText}</Text>
            </LiveGlassSurface>
          </View>

          <Text style={styles.matchTitle} numberOfLines={2}>
            {title}
          </Text>

          <View style={styles.tagsWrap}>
            {tags.map((tag) => (
              <Text key={`${sid(item)}:${tag}`} style={styles.tagText}>
                {tag}
              </Text>
            ))}
          </View>

          <View style={styles.infoActionsRow}>
            {scoreTuple ? (
              <LiveGlassSurface effect="clear" tintColor="rgba(7,12,18,0.5)" style={styles.scorePill}>
                <Ionicons name="trophy-outline" size={13} color="#ffffff" />
                <Text style={styles.scorePillText}>
                  {scoreTuple[0]} - {scoreTuple[1]}
                </Text>
              </LiveGlassSurface>
            ) : null}

            {sessions.length > 0 ? (
              <LiveGlassSurface effect="clear" tintColor="rgba(7,12,18,0.5)" style={styles.scorePill}>
                <Ionicons name="layers-outline" size={13} color="#ffffff" />
                <Text style={styles.scorePillText}>{sessions.length} nguồn</Text>
              </LiveGlassSurface>
            ) : null}

            <TouchableOpacity
              onPress={() => onOpenViewer(item)}
              disabled={!canOpenViewer}
              activeOpacity={0.9}
              style={!canOpenViewer ? styles.detailPillDisabled : null}
            >
              <LiveGlassSurface
                interactive={canOpenViewer}
                tintColor="rgba(37,244,238,0.46)"
                style={styles.detailPill}
              >
                <Ionicons name="open-outline" size={14} color="#07111a" />
                <Text style={styles.detailPillText}>Xem trận</Text>
              </LiveGlassSurface>
            </TouchableOpacity>
          </View>
        </LiveGlassSurface>

        <LiveGlassSurface
          effect="clear"
          tintColor="rgba(6,10,16,0.28)"
          style={styles.railColumnGlass}
        >
          <View style={styles.railColumn}>
            {canOpenFullscreen ? (
              <IconCircleButton
                icon="phone-landscape-outline"
                label="Ngang"
                onPress={() => onOpenFullscreen(item, session, isActive)}
              />
            ) : null}
            <IconCircleButton icon="information-circle-outline" label="Info" onPress={() => onOpenInfo(item)} />
            <IconCircleButton
              icon="open-outline"
              label="Mở link"
              onPress={openLink}
              disabled={!primaryOpenUrl}
            />
            {canMute ? (
              <IconCircleButton
                icon={globalMuted ? "volume-mute-outline" : "volume-high-outline"}
                label={globalMuted ? "Bật tiếng" : "Tắt tiếng"}
                onPress={onToggleMuted}
              />
            ) : null}
          </View>
        </LiveGlassSurface>
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: isActive ? "100%" : "0%" }]} />
      </View>
    </View>
  );
});

function FeedFullscreenModal({
  item,
  visible,
  muted,
  sharedNativePlayer,
  sharedNativePlayerKey,
  startPosition = 0,
  shouldPlayOnOpen = true,
  onPlaybackStateChange,
  onToggleMuted,
  onClose,
}: {
  item: any;
  visible: boolean;
  muted: boolean;
  sharedNativePlayer?: any;
  sharedNativePlayerKey?: string;
  startPosition?: number;
  shouldPlayOnOpen?: boolean;
  onPlaybackStateChange?: (session: any, state: any) => void;
  onToggleMuted: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const session = useMemo(() => (item ? selectFeedSession(item) : null), [item]);
  const canMute = isNativeSession(session);
  const playbackKey = useMemo(
    () => (item && session ? buildPlaybackSnapshotKey(item, session) : ""),
    [item, session]
  );
  const useSharedNativePlayer = Boolean(
    canMute && sharedNativePlayer && sharedNativePlayerKey && sharedNativePlayerKey === playbackKey
  );

  return (
    <Modal
      visible={visible}
      animationType="none"
      presentationStyle="fullScreen"
      statusBarTranslucent
      supportedOrientations={["landscape-left", "landscape-right"]}
      onRequestClose={onClose}
    >
      <View style={styles.fullscreenModal}>
        <StatusBar hidden />

        {canMute ? (
          <FullscreenNativeVideoPlayer
            session={session}
            visible={visible}
            muted={muted}
            playerOverride={useSharedNativePlayer ? sharedNativePlayer : undefined}
            startPosition={startPosition}
            shouldPlayOnOpen={shouldPlayOnOpen}
            onPlaybackStateChange={(state) => onPlaybackStateChange?.(session, state)}
            onToggleMuted={onToggleMuted}
            onClose={onClose}
          />
        ) : (
          <>
            <FeedVideoSurface
              session={session}
              shouldPlay={visible}
              muted={muted}
              pointerEvents="auto"
              useNativeControls={false}
              resizeMode="contain"
            />

            <LinearGradient
              colors={["rgba(0,0,0,0.72)", "transparent"]}
              style={[styles.fullscreenTopFade, { paddingTop: insets.top + 10 }]}
            >
              <View style={styles.fullscreenTopBar}>
                <TouchableOpacity
                  onPress={onClose}
                  activeOpacity={0.9}
                  style={styles.fullscreenControlButton}
                >
                  <Ionicons name="contract-outline" size={20} color="#ffffff" />
                </TouchableOpacity>

                <View style={styles.fullscreenTitleWrap}>
                  <Text style={styles.fullscreenTitle} numberOfLines={1}>
                    {session?.displayLabel || session?.label || "Nguồn nhúng"}
                  </Text>
                </View>

                <View style={styles.fullscreenControlSpacer} />
              </View>
            </LinearGradient>
          </>
        )}
      </View>
    </Modal>
  );
}

export default function MobileLiveFeedScreen({ isBack = false }: { isBack?: boolean }) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const isFocused = useIsFocused();
  const [sharedNativePlayer, setSharedNativePlayer] = useState(() => createVideoPlayer(null));
  const sharedNativePlayerRef = useRef(sharedNativePlayer);
  const listRef = useRef<FlatList>(null);
  const previousActiveIndexRef = useRef(0);
  const lockedActiveIndexRef = useRef<number | null>(null);
  const restoringPortraitRef = useRef(false);
  const playbackSnapshotsRef = useRef<Record<string, any>>({});
  const sharedPlayerTargetRef = useRef<{ item: any; session: any; key: string }>({
    item: null,
    session: null,
    key: "",
  });
  const [listHeight, setListHeight] = useState(windowHeight);
  const [page, setPage] = useState(1);
  const [activeIndex, setActiveIndex] = useState(0);
  const [lockedActiveIndex, setLockedActiveIndex] = useState<number | null>(null);
  const [mode, setMode] = useState("all");
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [hasPendingNewItems, setHasPendingNewItems] = useState(false);
  const [globalMuted, setGlobalMuted] = useState(true);
  const [muteHydrated, setMuteHydrated] = useState(false);
  const [infoMatch, setInfoMatch] = useState<any>(null);
  const [viewerMatch, setViewerMatch] = useState<any>(null);
  const [fullscreenMatch, setFullscreenMatch] = useState<any>(null);
  const [fullscreenVisible, setFullscreenVisible] = useState(false);
  const [isRestoringPortrait, setIsRestoringPortrait] = useState(false);
  const [sharedNativePlayerKey, setSharedNativePlayerKey] = useState("");
  const [fullscreenPlaybackSeed, setFullscreenPlaybackSeed] = useState({
    startPosition: 0,
    shouldPlay: true,
  });
  const slideHeight = Math.max(1, listHeight || windowHeight);
  const fullscreenAttached = fullscreenVisible;
  const effectiveActiveIndex = lockedActiveIndex ?? activeIndex;
  const isPortraitViewport = windowHeight >= windowWidth;
  const topChromePadding = insets.top + (isBack ? 8 : 10);
  const topGradientHeight = insets.top + (isBack ? 132 : 150);

  useEffect(() => {
    sharedNativePlayerRef.current = sharedNativePlayer;
  }, [sharedNativePlayer]);

  useEffect(() => {
    lockedActiveIndexRef.current = lockedActiveIndex;
  }, [lockedActiveIndex]);

  useEffect(() => {
    restoringPortraitRef.current = isRestoringPortrait;
  }, [isRestoringPortrait]);

  const feedArgs = useMemo(
    () => ({
      page,
      limit: FEED_LIMIT,
      mode,
      q: "",
      tournamentId: "",
      source: "all",
      replayState: "all",
      sort: "smart",
    }),
    [mode, page]
  );

  const probeArgs = useMemo(
    () => ({
      page: 1,
      limit: FEED_LIMIT,
      mode,
      q: "",
      tournamentId: "",
      source: "all",
      replayState: "all",
      sort: "smart",
    }),
    [mode]
  );

  const {
    data: feedData,
    isLoading,
    isFetching,
    refetch: refetchFeed,
  } = useGetLiveFeedQuery(feedArgs, {
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  const { data: probeData, refetch: refetchProbe } = useGetLiveFeedProbeQuery(probeArgs, {
    pollingInterval: 15000,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  const items = useMemo(() => (Array.isArray(feedData?.items) ? feedData.items : []), [feedData?.items]);
  const summary = feedData?.meta?.summary || {};
  const totalCount = Math.max(0, Number(feedData?.count || summary?.total || 0));
  const pages = Math.max(1, Number(feedData?.pages || 1));
  const liveCount = useMemo(
    () =>
      Number(summary?.live || 0) ||
      items.filter((item: any) => asTrimmed(item?.status).toLowerCase() === "live").length,
    [items, summary?.live]
  );
  const infoSessions = useMemo(() => (infoMatch ? getFeedSessions(infoMatch) : []), [infoMatch]);
  const activeItem = items[effectiveActiveIndex] || null;
  const activeSession = useMemo(() => (activeItem ? selectFeedSession(activeItem) : null), [activeItem]);
  const activeNativePlayerKey = useMemo(
    () =>
      activeItem && activeSession && isNativeSession(activeSession)
        ? buildPlaybackSnapshotKey(activeItem, activeSession)
        : "",
    [activeItem, activeSession]
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const stored = await AsyncStorage.getItem(GLOBAL_MUTE_KEY);
        if (cancelled) return;
        if (stored === "false") setGlobalMuted(false);
      } catch {
        // no-op
      } finally {
        if (!cancelled) setMuteHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!muteHydrated) return;
    AsyncStorage.setItem(GLOBAL_MUTE_KEY, globalMuted ? "true" : "false").catch(() => {});
  }, [globalMuted, muteHydrated]);

  useEffect(() => {
    if (!isFocused || fullscreenAttached) return undefined;

    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    return undefined;
  }, [fullscreenAttached, isFocused]);

  useEffect(() => {
    if (!fullscreenAttached || !isFocused) return undefined;

    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});

    const backSubscription = fullscreenVisible
      ? BackHandler.addEventListener("hardwareBackPress", () => {
          setFullscreenVisible(false);
          return true;
        })
      : null;

    return () => {
      backSubscription?.remove();
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, [fullscreenAttached, fullscreenVisible, isFocused]);

  useEffect(() => {
    if (!isFetching) {
      setManualRefreshing(false);
    }
  }, [isFetching]);

  useEffect(() => {
    if (!items.length) {
      setActiveIndex(0);
      previousActiveIndexRef.current = 0;
      return;
    }

    setActiveIndex((prev) => {
      const next = Math.min(prev, items.length - 1);
      previousActiveIndexRef.current = next;
      return next;
    });
  }, [items.length]);

  useEffect(() => {
    const probeItems = Array.isArray(probeData?.items) ? probeData.items : [];
    if (!items.length || !probeItems.length) return;
    const currentTopIds = items
      .slice(0, probeItems.length)
      .map((item: any) => sid(item))
      .join("|");
    const nextTopIds = probeItems.map((item: any) => sid(item)).join("|");
    if (currentTopIds && nextTopIds && currentTopIds !== nextTopIds) {
      setHasPendingNewItems(true);
    }
  }, [items, probeData?.items]);

  useEffect(() => {
    if (!listRef.current || !items.length) return;
    listRef.current.scrollToOffset({
      animated: false,
      offset: previousActiveIndexRef.current * slideHeight,
    });
  }, [items.length, slideHeight]);

  const handleOpenExternal = useCallback(async (url?: string | null) => {
    const target = normalizeUrl(asTrimmed(url));
    if (!target) return;
    try {
      await Linking.openURL(target);
    } catch {
      showNotice("Không mở được liên kết");
    }
  }, []);

  const handleCopy = useCallback(async (value?: string | null, message = "Đã sao chép") => {
    const text = asTrimmed(value);
    if (!text) return;
    await Clipboard.setStringAsync(text);
    showNotice(message);
  }, []);

  const handleRefresh = useCallback(() => {
    setManualRefreshing(true);
    setHasPendingNewItems(false);
    setLockedActiveIndex(null);
    setActiveIndex(0);
    previousActiveIndexRef.current = 0;
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    Haptics.selectionAsync().catch(() => {});

    if (page !== 1) {
      setPage(1);
    } else {
      refetchFeed();
    }
    refetchProbe();
  }, [page, refetchFeed, refetchProbe]);

  const handleModeChange = useCallback(
    (nextMode: string) => {
      if (nextMode === mode) return;
      Haptics.selectionAsync().catch(() => {});
      setMode(nextMode);
      setHasPendingNewItems(false);
      setLockedActiveIndex(null);
      setActiveIndex(0);
      previousActiveIndexRef.current = 0;
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
      setPage(1);
    },
    [mode]
  );

  const handleLoadMore = useCallback(() => {
    if (isFetching || page >= pages || !items.length) return;
    setPage((prev) => prev + 1);
  }, [isFetching, items.length, page, pages]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/");
  }, []);

  const getPlaybackSnapshot = useCallback((item: any, session?: any) => {
    const resolvedSession = session || selectFeedSession(item);
    return playbackSnapshotsRef.current[buildPlaybackSnapshotKey(item, resolvedSession)] || null;
  }, []);

  const handlePlaybackSnapshotChange = useCallback((item: any, session: any, status: any) => {
    if (!item || !session) return;
    const snapshotKey = buildPlaybackSnapshotKey(item, session);
    const previous = playbackSnapshotsRef.current[snapshotKey] || {};
    const nextCurrentTime = Number.isFinite(Number(status?.currentTime))
      ? Number(status.currentTime)
      : previous.currentTime ?? 0;
    const nextDuration = Number.isFinite(Number(status?.duration))
      ? Number(status.duration)
      : previous.duration ?? 0;
    const nextSnapshot = {
      ...previous,
      currentTime: nextCurrentTime,
      duration: nextDuration,
      isPlaying:
        typeof status?.isPlaying === "boolean" ? status.isPlaying : previous.isPlaying ?? false,
      isLoaded:
        typeof status?.isLoaded === "boolean" ? status.isLoaded : previous.isLoaded ?? false,
      updatedAt: Date.now(),
    };
    if (status?.didJustFinish) {
      nextSnapshot.isPlaying = false;
      nextSnapshot.currentTime = nextDuration || nextCurrentTime;
    }
    playbackSnapshotsRef.current[snapshotKey] = nextSnapshot;
  }, []);

  const recreateSharedNativePlayer = useCallback(() => {
    safeNativePlayerCall(sharedNativePlayerRef.current, "release");
    sharedPlayerTargetRef.current = {
      item: null,
      session: null,
      key: "",
    };
    setSharedNativePlayerKey("");
    setSharedNativePlayer(createVideoPlayer(null));
  }, []);

  useEffect(() => {
    if (
      !safeNativePlayerSet(
        sharedNativePlayer,
        "timeUpdateEventInterval",
        0.25,
        recreateSharedNativePlayer
      )
    ) {
      return undefined;
    }
    if (!safeNativePlayerSet(sharedNativePlayer, "loop", true, recreateSharedNativePlayer)) {
      return undefined;
    }

    return () => {
      if (!__DEV__) {
        safeNativePlayerCall(sharedNativePlayer, "release");
      }
    };
  }, [recreateSharedNativePlayer, sharedNativePlayer]);

  useEffect(() => {
    safeNativePlayerSet(sharedNativePlayer, "muted", globalMuted, recreateSharedNativePlayer);
  }, [globalMuted, recreateSharedNativePlayer, sharedNativePlayer]);

  useEffect(() => {
    const publishForTarget = (status: any) => {
      const target = sharedPlayerTargetRef.current;
      if (!target?.item || !target?.session) return;
      handlePlaybackSnapshotChange(target.item, target.session, status);
    };

    const subscriptions: { remove: () => void }[] = [];
    const addSharedListener = (eventName: string, listener: (event: any) => void) => {
      const subscription = safeNativePlayerCall<{ remove: () => void }>(
        sharedNativePlayer,
        "addListener",
        [eventName, listener],
        recreateSharedNativePlayer
      );
      if (!subscription) return false;
      subscriptions.push(subscription);
      return true;
    };
    const removeSubscriptions = () => {
      subscriptions.forEach((subscription) => {
        try {
          subscription.remove();
        } catch {
          // no-op
        }
      });
    };

    const didAttachListeners = [
      addSharedListener("sourceLoad", ({ duration }: any) => {
        publishForTarget({
          isLoaded: true,
          currentTime: safeNativePlayerNumber(sharedNativePlayer, "currentTime"),
          duration: Number(duration || safeNativePlayerNumber(sharedNativePlayer, "duration")),
          bufferedPosition: safeNativePlayerNumber(sharedNativePlayer, "bufferedPosition"),
          error: "",
        });
      }),
      addSharedListener("playingChange", ({ isPlaying }: any) => {
        publishForTarget({
          isPlaying: Boolean(isPlaying),
          currentTime: safeNativePlayerNumber(sharedNativePlayer, "currentTime"),
          duration: safeNativePlayerNumber(sharedNativePlayer, "duration"),
          bufferedPosition: safeNativePlayerNumber(sharedNativePlayer, "bufferedPosition"),
        });
      }),
      addSharedListener("timeUpdate", ({ currentTime, bufferedPosition }: any) => {
        publishForTarget({
          currentTime: Number(currentTime || 0),
          duration: safeNativePlayerNumber(sharedNativePlayer, "duration"),
          bufferedPosition: Number(bufferedPosition || 0),
        });
      }),
      addSharedListener("playToEnd", () => {
        publishForTarget({
          currentTime: safeNativePlayerNumber(sharedNativePlayer, "currentTime"),
          duration: safeNativePlayerNumber(sharedNativePlayer, "duration"),
          bufferedPosition: safeNativePlayerNumber(sharedNativePlayer, "bufferedPosition"),
          isPlaying: false,
          didJustFinish: true,
        });
      }),
      addSharedListener("statusChange", ({ status, error }: any) => {
        if (status === "error") {
          publishForTarget({
            error: error?.message ?? "Không phát được video.",
            isPlaying: false,
          });
          return;
        }
        if (status === "readyToPlay") {
          publishForTarget({
            isLoaded: true,
            currentTime: safeNativePlayerNumber(sharedNativePlayer, "currentTime"),
            duration: safeNativePlayerNumber(sharedNativePlayer, "duration"),
            bufferedPosition: safeNativePlayerNumber(sharedNativePlayer, "bufferedPosition"),
            error: "",
          });
        }
      }),
    ].every(Boolean);

    if (!didAttachListeners) {
      removeSubscriptions();
      return undefined;
    }

    return removeSubscriptions;
  }, [handlePlaybackSnapshotChange, recreateSharedNativePlayer, sharedNativePlayer]);

  useEffect(() => {
    if (!isFocused || !activeItem || !activeSession || !activeNativePlayerKey) {
      if (!fullscreenAttached) {
        safeNativePlayerCall(sharedNativePlayer, "pause", [], recreateSharedNativePlayer);
        sharedPlayerTargetRef.current = {
          item: null,
          session: null,
          key: "",
        };
        setSharedNativePlayerKey("");
      }
      return undefined;
    }

    const source = buildNativeVideoSource(activeSession);
    if (!source) {
      setSharedNativePlayerKey("");
      return undefined;
    }

    const previousTargetKey = sharedPlayerTargetRef.current.key;
    sharedPlayerTargetRef.current = {
      item: activeItem,
      session: activeSession,
      key: activeNativePlayerKey,
    };

    if (previousTargetKey === activeNativePlayerKey) {
      if (!fullscreenAttached) {
        setSharedNativePlayerKey(activeNativePlayerKey);
        safeNativePlayerCall(sharedNativePlayer, "play", [], recreateSharedNativePlayer);
      }
      return undefined;
    }

    let cancelled = false;
    const snapshot = getPlaybackSnapshot(activeItem, activeSession);
    setSharedNativePlayerKey("");

    (async () => {
      try {
        await sharedNativePlayer.replaceAsync(source);
        if (cancelled) return;
        const resumeTime = Number.isFinite(Number(snapshot?.currentTime)) ? Number(snapshot.currentTime) : 0;
        if (resumeTime > 0) {
          safeNativePlayerSet(
            sharedNativePlayer,
            "currentTime",
            resumeTime,
            recreateSharedNativePlayer
          );
        }
        if (!fullscreenAttached) {
          setSharedNativePlayerKey(activeNativePlayerKey);
          safeNativePlayerCall(sharedNativePlayer, "play", [], recreateSharedNativePlayer);
        }
      } catch (error: any) {
        if (isNativeSharedObjectError(error)) {
          recreateSharedNativePlayer();
        }
        handlePlaybackSnapshotChange(activeItem, activeSession, {
          error: error?.message ?? "Không phát được video.",
          isPlaying: false,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    activeItem,
    activeNativePlayerKey,
    activeSession,
    fullscreenAttached,
    getPlaybackSnapshot,
    handlePlaybackSnapshotChange,
    isFocused,
    recreateSharedNativePlayer,
    sharedNativePlayer,
  ]);

  const handleOpenFullscreen = useCallback((item: any, session?: any, shouldPlay = true) => {
    if (!item) return;
    const itemIndex = items.findIndex(
      (entry: any) => sid(entry?._id || entry?.matchId || entry?.id) === sid(item?._id || item?.matchId || item?.id)
    );
    const snapshot = getPlaybackSnapshot(item, session);
    Haptics.selectionAsync().catch(() => {});
    setIsRestoringPortrait(false);
    if (itemIndex >= 0) {
      setLockedActiveIndex(itemIndex);
      setActiveIndex(itemIndex);
      previousActiveIndexRef.current = itemIndex;
    }
    setFullscreenPlaybackSeed({
      startPosition: Number.isFinite(Number(snapshot?.currentTime)) ? Number(snapshot.currentTime) : 0,
      shouldPlay:
        typeof snapshot?.isPlaying === "boolean" ? snapshot.isPlaying : shouldPlay,
    });
    setFullscreenMatch(item);
    setFullscreenVisible(true);
  }, [getPlaybackSnapshot, items]);

  const handleCloseFullscreen = useCallback(() => {
    setIsRestoringPortrait(true);
    setFullscreenVisible(false);
    setFullscreenMatch(null);
  }, []);

  useEffect(() => {
    if (lockedActiveIndex == null) return undefined;
    if (fullscreenAttached || isRestoringPortrait) return undefined;

    previousActiveIndexRef.current = lockedActiveIndex;
    setActiveIndex(lockedActiveIndex);
    listRef.current?.scrollToOffset({
      offset: slideHeight * lockedActiveIndex,
      animated: false,
    });

    const timer = setTimeout(() => {
      setLockedActiveIndex(null);
    }, 260);

    return () => clearTimeout(timer);
  }, [fullscreenAttached, isRestoringPortrait, lockedActiveIndex, slideHeight]);

  useEffect(() => {
    if (lockedActiveIndex == null) return;
    if (lockedActiveIndex < items.length) return;
    setLockedActiveIndex(null);
  }, [items.length, lockedActiveIndex]);

  useEffect(() => {
    if (!isRestoringPortrait) return undefined;

    const restoreIndex = lockedActiveIndexRef.current ?? previousActiveIndexRef.current ?? 0;
    if (isPortraitViewport) {
      listRef.current?.scrollToOffset({
        offset: slideHeight * restoreIndex,
        animated: false,
      });
    }

    const timer = setTimeout(() => {
      setIsRestoringPortrait(false);
    }, isPortraitViewport ? 90 : 260);

    return () => clearTimeout(timer);
  }, [isPortraitViewport, isRestoringPortrait, slideHeight]);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (lockedActiveIndexRef.current != null || restoringPortraitRef.current) return;
      const next = viewableItems
        .map((token) => (typeof token.index === "number" ? token.index : -1))
        .filter((index) => index >= 0)
        .sort((left, right) => left - right)[0];

      if (typeof next !== "number") return;
      if (previousActiveIndexRef.current === next) return;

      previousActiveIndexRef.current = next;
      setActiveIndex(next);
      Haptics.selectionAsync().catch(() => {});
    }
  );

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 80,
    minimumViewTime: 120,
  });

  const renderItem = useCallback(
    ({ item, index }: { item: any; index: number }) => (
      <FeedSlide
        item={item}
        height={slideHeight}
        topInset={insets.top}
        bottomInset={insets.bottom}
        isActive={isFocused && effectiveActiveIndex === index}
        shouldRenderPlayer={isFocused && !fullscreenAttached && effectiveActiveIndex === index}
        globalMuted={globalMuted}
        onOpenInfo={setInfoMatch}
        onOpenViewer={setViewerMatch}
        onOpenFullscreen={handleOpenFullscreen}
        sharedNativePlayer={sharedNativePlayer}
        sharedNativePlayerKey={sharedNativePlayerKey}
        onToggleMuted={() => setGlobalMuted((prev) => !prev)}
        onOpenExternal={handleOpenExternal}
      />
    ),
    [
      effectiveActiveIndex,
      fullscreenAttached,
      globalMuted,
      handleOpenExternal,
      handleOpenFullscreen,
      insets.bottom,
      insets.top,
      isFocused,
      sharedNativePlayer,
      sharedNativePlayerKey,
      slideHeight,
    ]
  );

  const keyExtractor = useCallback((item: any) => sid(item?._id || item?.matchId || item?.id), []);

  const refreshing = manualRefreshing && isFetching;

  return (
    <BottomSheetModalProvider>
      <View
        style={styles.screen}
        onLayout={(event) => {
          const nextHeight = Math.max(1, Math.round(event.nativeEvent.layout.height));
          if (Math.abs(nextHeight - slideHeight) > 1) {
            setListHeight(nextHeight);
          }
        }}
      >
      <StatusBar style="light" translucent backgroundColor="transparent" />

      <FlatList
        ref={listRef}
        data={items}
        extraData={`${effectiveActiveIndex}:${globalMuted}:${isFocused}:${sid(fullscreenMatch)}:${fullscreenVisible}:${sharedNativePlayerKey}`}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        pagingEnabled
        decelerationRate="fast"
        snapToAlignment="start"
        disableIntervalMomentum
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.45}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        windowSize={3}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
        getItemLayout={(_, index) => ({
          length: slideHeight,
          offset: slideHeight * index,
          index,
        })}
        onViewableItemsChanged={onViewableItemsChanged.current}
        viewabilityConfig={viewabilityConfig.current}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#ffffff"
            progressViewOffset={insets.top + 72}
          />
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={[styles.emptyState, { height: slideHeight }]}>
              <LiveGlassSurface
                effect="clear"
                tintColor="rgba(6,10,16,0.52)"
                style={styles.emptyGlassCard}
              >
                <ActivityIndicator size="large" color="#ffffff" />
                <Text style={styles.emptyTitle}>Đang tải live feed</Text>
                <Text style={styles.emptyText}>App đang lấy danh sách stream giống smart feed trên web.</Text>
              </LiveGlassSurface>
            </View>
          ) : (
            <View style={[styles.emptyState, { height: slideHeight }]}>
              <LiveGlassSurface
                effect="clear"
                tintColor="rgba(6,10,16,0.52)"
                style={styles.emptyGlassCard}
              >
                <Ionicons name="videocam-off-outline" size={44} color="rgba(255,255,255,0.72)" />
                <Text style={styles.emptyTitle}>Chưa có video phù hợp</Text>
                <Text style={styles.emptyText}>
                  Khi có trận đang live hoặc replay công khai, feed sẽ tự xuất hiện ở đây.
                </Text>
              </LiveGlassSurface>
            </View>
          )
        }
      />

      {isRestoringPortrait ? <View pointerEvents="none" style={styles.orientationTransitionCover} /> : null}

      <LinearGradient
        colors={["rgba(0,0,0,0.62)", "transparent"]}
        style={[styles.topGradient, { height: topGradientHeight }]}
        pointerEvents="none"
      />

      <View pointerEvents="box-none" style={styles.topChrome}>
        <View style={[styles.topChromeInner, { paddingTop: topChromePadding }]}>
          <View style={styles.chromeLeft}>
            <View style={styles.feedHeaderRow}>
              {isBack ? (
                <TouchableOpacity onPress={handleBack} activeOpacity={0.9}>
                  <LiveGlassSurface
                    interactive
                    tintColor="rgba(6,10,16,0.62)"
                    style={styles.backButton}
                  >
                    <Ionicons name="chevron-back" size={23} color="#ffffff" />
                  </LiveGlassSurface>
                </TouchableOpacity>
              ) : null}

              <LiveGlassSurface
                effect="clear"
                tintColor="rgba(6,10,16,0.62)"
                style={styles.feedBadge}
              >
                <Text style={styles.feedBadgeText} numberOfLines={1}>
                  {`PickleTour Feed${liveCount ? ` · ${liveCount} LIVE` : ""}`}
                </Text>
              </LiveGlassSurface>
            </View>

            <View style={styles.modeRow}>
              {MODE_CHIPS.map((chip) => {
                const count =
                  chip.value === "live"
                    ? Number(summary?.live || 0)
                    : chip.value === "replay"
                    ? Number(summary?.completeReplay || 0)
                    : totalCount;
                return (
                  <ModeChip
                    key={chip.value}
                    label={count > 0 ? `${chip.label} (${count})` : chip.label}
                    active={chip.value === mode}
                    onPress={() => handleModeChange(chip.value)}
                  />
                );
              })}
            </View>

            {hasPendingNewItems ? (
              <TouchableOpacity onPress={handleRefresh} activeOpacity={0.9}>
                <LiveGlassSurface
                  interactive
                  tintColor="rgba(255,107,87,0.46)"
                  style={styles.pendingChip}
                >
                  <Ionicons name="sparkles-outline" size={13} color="#08110f" />
                  <Text style={styles.pendingChipText}>Có trận mới</Text>
                </LiveGlassSurface>
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.chromeRight}>
            <TouchableOpacity onPress={handleRefresh} activeOpacity={0.9}>
              <LiveGlassSurface
                interactive
                tintColor="rgba(6,10,16,0.62)"
                style={styles.chromeButton}
              >
              {isFetching ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Ionicons name="refresh" size={20} color="#ffffff" />
              )}
              </LiveGlassSurface>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {items.length ? (
        <View pointerEvents="none" style={[styles.counterWrap, { bottom: insets.bottom + 8 }]}>
          <LiveGlassSurface effect="clear" tintColor="rgba(6,10,16,0.58)" style={styles.counterGlass}>
            <Text style={styles.counterText}>
              {Math.min(effectiveActiveIndex + 1, items.length)} / {items.length}
            </Text>
          </LiveGlassSurface>
        </View>
      ) : null}

      {isFetching && page > 1 ? (
        <View pointerEvents="none" style={[styles.loadMoreWrap, { bottom: insets.bottom + 48 }]}>
          <LiveGlassSurface effect="clear" tintColor="rgba(6,10,16,0.58)" style={styles.loadMoreGlass}>
            <ActivityIndicator size="small" color="#ffffff" />
          </LiveGlassSurface>
        </View>
      ) : null}

      <FeedFullscreenModal
        item={fullscreenMatch}
        visible={Boolean(fullscreenMatch) && fullscreenVisible}
        muted={globalMuted}
        sharedNativePlayer={sharedNativePlayer}
        sharedNativePlayerKey={sharedNativePlayerKey}
        startPosition={fullscreenPlaybackSeed.startPosition}
        shouldPlayOnOpen={fullscreenPlaybackSeed.shouldPlay}
        onPlaybackStateChange={(session, state) =>
          handlePlaybackSnapshotChange(fullscreenMatch, session, state)
        }
        onToggleMuted={() => setGlobalMuted((prev) => !prev)}
        onClose={handleCloseFullscreen}
      />

      <InfoModal
        visible={Boolean(infoMatch)}
        onClose={() => setInfoMatch(null)}
        match={infoMatch || {}}
        sessions={infoSessions}
        onCopy={handleCopy}
        onOpenUrl={handleOpenExternal}
      />

      <ResponsiveMatchViewer
        open={Boolean(viewerMatch)}
        matchId={viewerMatch?._id || viewerMatch?.matchId || ""}
        courtStationId={viewerMatch?.courtStationId || ""}
        initialMatch={viewerMatch || null}
        onClose={() => setViewerMatch(null)}
      />
      </View>
    </BottomSheetModalProvider>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#03060a",
  },
  orientationTransitionCover: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#03060a",
    zIndex: 20,
  },
  slide: {
    width: "100%",
    overflow: "hidden",
    backgroundColor: "#05070b",
  },
  fullscreenModal: {
    flex: 1,
    backgroundColor: "#000000",
  },
  fullscreenLoaderWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  fullscreenChrome: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
  },
  fullscreenTopFade: {
    paddingHorizontal: 18,
    paddingBottom: 22,
  },
  fullscreenTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  fullscreenTitleWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  fullscreenTitle: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
  fullscreenControlSpacer: {
    width: 42,
    height: 42,
  },
  fullscreenControlButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(6,10,16,0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    zIndex: 4,
  },
  fullscreenCenterTap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  fullscreenCenterControlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
  },
  fullscreenPlayButton: {
    width: 86,
    height: 86,
    borderRadius: 43,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(6,10,16,0.56)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  fullscreenSkipButton: {
    width: 74,
    height: 74,
    borderRadius: 37,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    backgroundColor: "rgba(6,10,16,0.44)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  fullscreenSkipButtonText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "800",
  },
  fullscreenBottomFade: {
    paddingHorizontal: 18,
    paddingTop: 28,
    paddingBottom: 18,
  },
  fullscreenErrorText: {
    color: "#ffb4a8",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 12,
  },
  fullscreenBottomBar: {
    gap: 12,
  },
  fullscreenSeekRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  fullscreenTimeText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    minWidth: 44,
  },
  fullscreenProgressWrap: {
    flex: 1,
    justifyContent: "center",
    paddingVertical: 12,
  },
  fullscreenProgressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.22)",
    overflow: "hidden",
  },
  fullscreenProgressBuffered: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(255,255,255,0.38)",
  },
  fullscreenProgressFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "#25f4ee",
  },
  topGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  topChrome: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  topChromeInner: {
    paddingHorizontal: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  chromeLeft: {
    flex: 1,
    gap: 8,
  },
  feedHeaderRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chromeRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(6,10,16,0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  feedBadge: {
    alignSelf: "flex-start",
    flexShrink: 1,
    maxWidth: "100%",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "rgba(6,10,16,0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  feedBadgeText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
  },
  modeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  modeChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "rgba(6,10,16,0.66)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  modeChipActive: {
    backgroundColor: "#25f4ee",
    borderColor: "rgba(37,244,238,0.7)",
  },
  modeChipText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
  },
  modeChipTextActive: {
    color: "#07111a",
  },
  pendingChip: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "#ff6b57",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pendingChipText: {
    color: "#08110f",
    fontSize: 12,
    fontWeight: "800",
  },
  chromeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(6,10,16,0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  cardTopChips: {
    position: "absolute",
    left: 14,
    right: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  statusChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  metaChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(7,12,18,0.58)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  metaChipAccent: {
    borderColor: "rgba(37,244,238,0.24)",
  },
  metaChipText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
  },
  metaChipAccentText: {
    color: "#25f4ee",
  },
  bottomOverlay: {
    position: "absolute",
    left: 16,
    right: 10,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
  },
  infoColumn: {
    flex: 1,
    maxWidth: "75%",
    gap: 10,
  },
  infoGlassPanel: {
    maxWidth: "78%",
    padding: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  creatorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(37,244,238,0.9)",
    backgroundColor: "rgba(14,18,26,0.92)",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
  creatorTextWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  tournamentName: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
  subtitleText: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 11,
    fontWeight: "500",
  },
  timePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(7,12,18,0.48)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  timePillText: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 10,
    fontWeight: "800",
  },
  matchTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 21,
  },
  tagsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tagText: {
    color: "#25f4ee",
    fontSize: 11,
    fontWeight: "800",
  },
  infoActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  scorePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(7,12,18,0.56)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  scorePillText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "800",
  },
  detailPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#25f4ee",
  },
  detailPillDisabled: {
    opacity: 0.45,
  },
  detailPillText: {
    color: "#07111a",
    fontSize: 11,
    fontWeight: "800",
  },
  railColumnGlass: {
    borderRadius: 28,
    paddingHorizontal: 6,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(6,10,16,0.22)",
  },
  railColumn: {
    alignItems: "center",
    gap: 14,
    paddingBottom: 6,
  },
  railItem: {
    alignItems: "center",
    gap: 6,
  },
  railItemDisabled: {
    opacity: 0.46,
  },
  railButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  railButtonDisabled: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  railLabel: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 11,
    fontWeight: "700",
  },
  processingWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 10,
  },
  processingTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
  },
  processingText: {
    color: "rgba(255,255,255,0.74)",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    maxWidth: 320,
  },
  progressTrack: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#ff6b57",
  },
  counterWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  counterText: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    fontSize: 11,
    fontWeight: "800",
    color: "#ffffff",
  },
  counterGlass: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(6,10,16,0.62)",
  },
  loadMoreWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  loadMoreGlass: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(6,10,16,0.62)",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 12,
    backgroundColor: "#03060a",
  },
  emptyGlassCard: {
    width: "100%",
    maxWidth: 330,
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingVertical: 24,
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(6,10,16,0.54)",
  },
  emptyTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
  },
  emptyText: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    maxWidth: 320,
  },
});
