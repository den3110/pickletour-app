import { useEffect, useMemo, useRef } from "react";
import { AppState, Platform } from "react-native";
import {
  buildMatchLiveActivityPayload,
  endMatchLiveActivity,
  isMatchLiveActivityAvailable,
  syncMatchLiveActivity,
} from "@/services/matchLiveActivity";

type UseMatchLiveActivityOptions = {
  enabled?: boolean;
  cleanupOnUnmount?: boolean;
  cleanupOnDisable?: boolean;
  preserveLiveOnUnmount?: boolean;
  rules?: {
    bestOf?: number | null;
    pointsToWin?: number | null;
    winByTwo?: boolean | null;
  } | null;
  score?: {
    scoreA?: number | null;
    scoreB?: number | null;
    setsA?: number | null;
    setsB?: number | null;
    gameIndex?: number | null;
  } | null;
  serve?: {
    side?: string | null;
    server?: number | null;
  } | null;
  source?: string | null;
  debounceMs?: number;
};

const SHOULD_SKIP = !isMatchLiveActivityAvailable();

export function useMatchLiveActivity(
  match: any,
  options: UseMatchLiveActivityOptions = {},
) {
  const enabled = options.enabled ?? true;
  const cleanupOnUnmount = options.cleanupOnUnmount ?? true;
  const cleanupOnDisable = options.cleanupOnDisable ?? false;
  const preserveLiveOnUnmount = options.preserveLiveOnUnmount ?? true;
  const debounceMs = Math.max(0, options.debounceMs ?? 180);

  const payload = useMemo(
    () =>
      enabled && Platform.OS === "ios"
        ? buildMatchLiveActivityPayload(match, {
            rules: options.rules,
            score: options.score,
            serve: options.serve,
            source: options.source,
          })
        : null,
    [
      enabled,
      match,
      options.rules,
      options.score,
      options.serve,
      options.source,
    ],
  );

  const payloadKey = useMemo(
    () => (payload ? JSON.stringify(payload) : ""),
    [payload],
  );
  const latestPayloadRef = useRef(payload);
  const wasEnabledRef = useRef(enabled);

  useEffect(() => {
    latestPayloadRef.current = payload;
  }, [payload]);

  useEffect(() => {
    const wasEnabled = wasEnabledRef.current;
    wasEnabledRef.current = enabled;

    if (SHOULD_SKIP || !cleanupOnDisable) return;
    if (!wasEnabled || enabled) return;

    const current = latestPayloadRef.current;
    if (!current?.matchId) return;

    if (preserveLiveOnUnmount && current.status === "live") {
      return;
    }

    void endMatchLiveActivity(current.matchId, current, {
      dismissalPolicy: "immediate",
    });
  }, [enabled, cleanupOnDisable, preserveLiveOnUnmount]);

  useEffect(() => {
    if (SHOULD_SKIP || !enabled || !payload?.matchId) return;

    const timer = setTimeout(() => {
      void syncMatchLiveActivity(payload);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [enabled, payload, payloadKey, debounceMs]);

  useEffect(() => {
    if (SHOULD_SKIP || !enabled) return;

    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") return;
      const current = latestPayloadRef.current;
      if (!current?.matchId) return;
      void syncMatchLiveActivity(current);
    });

    return () => sub.remove();
  }, [enabled]);

  useEffect(() => {
    return () => {
      if (SHOULD_SKIP || !cleanupOnUnmount) return;

      const current = latestPayloadRef.current;
      if (!current?.matchId) return;

      if (preserveLiveOnUnmount && current.status === "live") {
        return;
      }

      void endMatchLiveActivity(current.matchId, current, {
        dismissalPolicy: "immediate",
      });
    };
  }, [cleanupOnUnmount, preserveLiveOnUnmount]);
}
