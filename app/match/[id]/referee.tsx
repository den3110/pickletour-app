import React, { useCallback, useMemo, useRef } from "react";
import { AppState, InteractionManager } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import * as ScreenOrientation from "expo-screen-orientation";

import RefereeJudgePanel from "@/components/match/RefereeScorePanel.native";

export default function RefereeScreen() {
  const params = useLocalSearchParams();

  const matchId = useMemo(() => String(params?.id ?? ""), [params?.id]);

  const appState = useRef(AppState.currentState);
  const isUnmounting = useRef(false);
  const orientationTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  useFocusEffect(
    useCallback(() => {
      isUnmounting.current = false;
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
