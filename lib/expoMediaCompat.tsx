/* eslint-disable @typescript-eslint/no-require-imports */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Constants from "expo-constants";
import type { StyleProp, ViewStyle } from "react-native";

export const isExpoGo = Constants.appOwnership === "expo";

type VideoSourceLike = any;
type PlaybackStatusLike = {
  isLoaded?: boolean;
  didJustFinish?: boolean;
  error?: string;
};
type VideoLoadLike = {
  naturalSize?: {
    width: number;
    height: number;
  };
};
type CompatVideoProps = {
  source: VideoSourceLike;
  style?: StyleProp<ViewStyle>;
  shouldPlay?: boolean;
  useNativeControls?: boolean;
  resizeMode?: "contain" | "cover" | "stretch";
  onLoad?: (meta: VideoLoadLike) => void;
  onPlaybackStatusUpdate?: (status: PlaybackStatusLike) => void;
};

function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

function getVideoSourceKey(source: VideoSourceLike) {
  if (source == null) return "null";
  if (typeof source === "string" || typeof source === "number") {
    return String(source);
  }
  if (typeof source === "object") {
    if (typeof source.uri === "string") return source.uri;
    if (typeof source.assetId === "number") return `asset:${source.assetId}`;
    try {
      return JSON.stringify(source);
    } catch {
      return "object";
    }
  }
  return String(source);
}

function ExpoGoVideo({
  source,
  style,
  shouldPlay = false,
  useNativeControls = true,
  resizeMode = "contain",
  onLoad,
  onPlaybackStatusUpdate,
}: CompatVideoProps) {
  const onLoadRef = useLatest(onLoad);
  const onPlaybackStatusUpdateRef = useLatest(onPlaybackStatusUpdate);
  const sourceRef = useLatest(source);
  const { createVideoPlayer, VideoView } = useMemo(
    () => require("expo-video"),
    []
  );
  const [player] = useState(() => createVideoPlayer(null));
  const sourceKey = useMemo(() => getVideoSourceKey(source), [source]);
  const contentFit = resizeMode === "stretch" ? "fill" : resizeMode;

  useEffect(() => {
    let cancelled = false;
    if (sourceRef.current == null) return undefined;

    (async () => {
      try {
        await player.replaceAsync(sourceRef.current);
        if (cancelled) return;
        if (shouldPlay) {
          player.play();
        } else {
          player.pause();
        }
      } catch (error: any) {
        onPlaybackStatusUpdateRef.current?.({
          isLoaded: false,
          didJustFinish: false,
          error: error?.message ?? String(error),
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [player, shouldPlay, sourceKey, sourceRef, onPlaybackStatusUpdateRef]);

  useEffect(() => {
    if (shouldPlay) {
      player.play();
    } else {
      player.pause();
    }
  }, [player, shouldPlay]);

  useEffect(() => {
    const loadSub = player.addListener(
      "sourceLoad",
      ({ availableVideoTracks }: any) => {
        const track =
          availableVideoTracks?.find(
            (item: any) => item?.size?.width && item?.size?.height
          ) ?? availableVideoTracks?.[0];
        const width = track?.size?.width;
        const height = track?.size?.height;
        if (width && height) {
          onLoadRef.current?.({ naturalSize: { width, height } });
        }
      }
    );

    const endSub = player.addListener("playToEnd", () => {
      onPlaybackStatusUpdateRef.current?.({
        isLoaded: true,
        didJustFinish: true,
      });
    });

    const statusSub = player.addListener(
      "statusChange",
      ({ status, error }: any) => {
        if (status === "error") {
          onPlaybackStatusUpdateRef.current?.({
            isLoaded: false,
            didJustFinish: false,
            error: error?.message ?? "Video playback error",
          });
          return;
        }
        if (status === "readyToPlay") {
          onPlaybackStatusUpdateRef.current?.({
            isLoaded: true,
            didJustFinish: false,
          });
        }
      }
    );

    return () => {
      loadSub.remove();
      endSub.remove();
      statusSub.remove();
    };
  }, [player, onLoadRef, onPlaybackStatusUpdateRef]);

  useEffect(() => {
    return () => {
      player.release();
    };
  }, [player]);

  return (
    <VideoView
      player={player}
      style={style}
      nativeControls={useNativeControls}
      contentFit={contentFit}
    />
  );
}

export function CompatVideo(props: CompatVideoProps) {
  return <ExpoGoVideo {...props} />;
}

export function useCompatSfx<SfxKey extends string>(
  sources: Record<SfxKey, any>,
  volume = 1
) {
  const playersRef = useRef<Record<SfxKey, any>>({} as Record<SfxKey, any>);
  const sourcesRef = useRef(sources);

  useEffect(() => {
    sourcesRef.current = sources;
  }, [sources]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { createAudioPlayer, setAudioModeAsync } = require("expo-audio");
        await setAudioModeAsync({
          allowsRecording: false,
          interruptionMode: "duckOthers",
          playsInSilentMode: true,
          shouldPlayInBackground: false,
          shouldRouteThroughEarpiece: false,
        });

        const nextPlayers = {} as Record<SfxKey, any>;
        for (const key of Object.keys(sourcesRef.current) as SfxKey[]) {
          const player = createAudioPlayer(sourcesRef.current[key], {
            keepAudioSessionActive: true,
          });
          player.loop = false;
          player.volume = volume;
          if (cancelled) {
            player.remove();
            continue;
          }
          nextPlayers[key] = player;
        }

        if (!cancelled) {
          playersRef.current = nextPlayers;
        }
      } catch {
        // Intentionally ignore sound initialization errors.
      }
    })();

    return () => {
      cancelled = true;
      const currentPlayers = playersRef.current;
      playersRef.current = {} as Record<SfxKey, any>;

      (async () => {
        for (const key of Object.keys(currentPlayers) as SfxKey[]) {
          try {
            currentPlayers[key]?.remove?.();
          } catch {}
        }
      })();
    };
  }, [sources, volume]);

  const play = useCallback(
    async (key: SfxKey) => {
      const player = playersRef.current[key];
      if (!player) return;

      try {
        player.volume = volume;
        player.pause?.();
        await player.seekTo(0);
        player.play();
      } catch {
        try {
          player.pause?.();
          await player.seekTo(0);
          player.play();
        } catch {}
      }
    },
    [volume]
  );

  return play;
}
