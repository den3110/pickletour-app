import React, { useCallback, useMemo, useRef } from "react";
import { AppState, DeviceEventEmitter, InteractionManager } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import * as ScreenOrientation from "expo-screen-orientation";

import RefereeJudgePanel from "@/components/match/RefereeScorePanel.native";

const HOT_UPDATE_RELOAD_EVENT = "hotupdater:before-reload";
const HOT_UPDATE_RELOAD_KEY = "__PICKLETOUR_HOTUPDATE_RELOAD__";

export default function RefereeScreen() {
  const params = useLocalSearchParams();

  const matchId = useMemo(() => String(params?.id ?? ""), [params?.id]);

  const appState = useRef(AppState.currentState);
  const isUnmounting = useRef(false);
  const skipOrientationRestore = useRef(
    Boolean((globalThis as any)[HOT_UPDATE_RELOAD_KEY]),
  );
  const orientationTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  React.useEffect(() => {
    if ((globalThis as any)[HOT_UPDATE_RELOAD_KEY]) {
      skipOrientationRestore.current = true;
    }

    const sub = DeviceEventEmitter.addListener(HOT_UPDATE_RELOAD_EVENT, () => {
      skipOrientationRestore.current = true;
    });

    return () => sub.remove();
  }, []);

  useFocusEffect(
    useCallback(() => {
      isUnmounting.current = false;
      skipOrientationRestore.current = Boolean(
        (globalThis as any)[HOT_UPDATE_RELOAD_KEY],
      );
      orientationTimeouts.current.forEach(clearTimeout);
      orientationTimeouts.current = [];

      (async () => {
        try {
          await ScreenOrientation.unlockAsync();
          await ScreenOrientation.lockAsync(
            ScreenOrientation.OrientationLock.LANDSCAPE
          );
        } catch (error) {
          console.warn("Lock landscape error:", error);
        }
      })();

      const subscription = AppState.addEventListener(
        "change",
        (nextAppState) => {
          if (
            appState.current.match(/inactive|background/) &&
            nextAppState === "active" &&
            !isUnmounting.current
          ) {
            (async () => {
              try {
                await ScreenOrientation.lockAsync(
                  ScreenOrientation.OrientationLock.LANDSCAPE
                );
              } catch (error) {
                console.warn("Re-lock landscape error:", error);
              }
            })();
          }
          appState.current = nextAppState;
        }
      );

      return () => {
        isUnmounting.current = true;
        subscription.remove();

        orientationTimeouts.current.forEach(clearTimeout);
        orientationTimeouts.current = [];

        if (
          skipOrientationRestore.current ||
          (globalThis as any)[HOT_UPDATE_RELOAD_KEY]
        ) {
          return;
        }

        InteractionManager.runAfterInteractions(() => {
          if (!isUnmounting.current) return;

          const timeoutId = setTimeout(async () => {
            if (!isUnmounting.current) return;
            try {
              await ScreenOrientation.unlockAsync();
              await ScreenOrientation.lockAsync(
                ScreenOrientation.OrientationLock.PORTRAIT_UP
              );
            } catch (error) {
              console.warn("Cleanup orientation error:", error);
            }
          }, 200);

          orientationTimeouts.current.push(timeoutId);
        });
      };
    }, [])
  );

  if (!matchId) return null;

  return <RefereeJudgePanel matchId={matchId} />;
}
