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

function NativeVideo({
  source,
  style,
  shouldPlay,
  useNativeControls,
  resizeMode,
  onLoad,
  onPlaybackStatusUpdate,
}: CompatVideoProps) {
  const { Video } = require("expo-av");
  return (
    <Video
      style={style}
      source={source}
      useNativeControls={useNativeControls}
      shouldPlay={shouldPlay}
      resizeMode={resizeMode}
      onLoad={onLoad}
      onPlaybackStatusUpdate={onPlaybackStatusUpdate}
    />
  );
}

export function CompatVideo(props: CompatVideoProps) {
  return isExpoGo ? <ExpoGoVideo {...props} /> : <NativeVideo {...props} />;
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
        if (isExpoGo) {
          const { createAudioPlayer, setAudioModeAsync } = require("expo-audio");
          await setAudioModeAsync({
            playsInSilentMode: true,
            interruptionMode: "mixWithOthers",
            shouldPlayInBackground: false,
          });

          const nextPlayers = {} as Record<SfxKey, any>;
          for (const key of Object.keys(sourcesRef.current) as SfxKey[]) {
            const player = createAudioPlayer(sourcesRef.current[key]);
            player.volume = volume;
            nextPlayers[key] = player;
          }

          if (cancelled) {
            for (const key of Object.keys(nextPlayers) as SfxKey[]) {
              try {
                nextPlayers[key]?.remove?.();
              } catch {}
            }
            return;
          }

          playersRef.current = nextPlayers;
          return;
        }

        const { Audio } = require("expo-av");
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          allowsRecordingIOS: true,
          interruptionModeIOS: Audio.INTERRUPTION_MODE_IOS_MIX_WITH_OTHERS,
          interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DUCK_OTHERS,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
          staysActiveInBackground: false,
        });

        const nextSounds = {} as Record<SfxKey, any>;
        for (const key of Object.keys(sourcesRef.current) as SfxKey[]) {
          const { sound } = await Audio.Sound.createAsync(
            sourcesRef.current[key],
            {
              volume,
              isLooping: false,
              shouldPlay: false,
            }
          );
          if (cancelled) {
            await sound.unloadAsync();
            continue;
          }
          nextSounds[key] = sound;
        }

        if (!cancelled) {
          playersRef.current = nextSounds;
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
            if (isExpoGo) {
              currentPlayers[key]?.remove?.();
            } else {
              await currentPlayers[key]?.unloadAsync?.();
            }
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
        if (isExpoGo) {
          player.volume = volume;
          await player.seekTo(0);
          player.play();
          return;
        }

        await player.setVolumeAsync(volume);
        await player.setPositionAsync(0);
        await player.playAsync();
      } catch {
        if (!isExpoGo) {
          try {
            await player.stopAsync();
            await player.playAsync();
          } catch {}
        }
      }
    },
    [volume]
  );

  return play;
}
