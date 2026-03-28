// src/hooks/useLiveMatch.js
import { useEffect, useMemo, useRef, useState } from "react";
import { useSocket } from "@/context/SocketContext";
import {
  extractMatchPayload,
  getMatchPayloadId,
  isLightweightMatchPayload,
  isNewerOrEqualMatchPayload,
  mergeMatchPayload,
  normalizeMatchDisplay,
} from "@/utils/matchDisplay";

/**
 * Realtime match state over Socket.IO
 * - Uses the singleton socket from SocketContext
 * - Auto join/leave `match:<matchId>`
 * - Accepts `match:snapshot`, `match:update`, `score:updated`
 * - Lightweight payloads only trigger snapshot refresh; they never replace identity
 */
export function useLiveMatch(matchId, token) {
  const socket = useSocket();
  const [state, setState] = useState({ loading: true, data: null });
  const mountedRef = useRef(false);

  useEffect(() => {
    setState({ loading: Boolean(matchId), data: null });
  }, [matchId]);

  useEffect(() => {
    if (!socket) return;
    if (token && !socket.connected && !socket.active) {
      socket.auth = { ...(socket.auth || {}), token };
      socket.connect();
    }
  }, [socket, token]);

  useEffect(() => {
    if (!socket || !matchId) return;
    mountedRef.current = true;

    const requestSnapshot = () =>
      socket.emit?.("match:snapshot:request", { matchId });

    const isForThisMatch = (payload) => {
      const got = getMatchPayloadId(payload);
      return Boolean(got) && String(got) === String(matchId);
    };

    const applyIncoming = (payload, { allowLightweight = false } = {}) => {
      if (!mountedRef.current) return;
      if (!isForThisMatch(payload)) return;
      const extracted = extractMatchPayload(payload);
      const incoming = normalizeMatchDisplay(extracted);
      if (!incoming) return;
      if (!allowLightweight && isLightweightMatchPayload(payload)) {
        requestSnapshot();
        return;
      }

      setState((prev) => {
        const next = prev.data
          ? mergeMatchPayload(prev.data, incoming, prev.data)
          : incoming;

        if (!next) return prev;
        if (prev.data && !isNewerOrEqualMatchPayload(prev.data, next)) {
          return prev;
        }
        return { loading: false, data: next };
      });
    };

    const onSnapshot = (payload) =>
      applyIncoming(payload, { allowLightweight: true });
    const onUpdate = (payload) => applyIncoming(payload);
    const onScoreUpdated = (payload) => applyIncoming(payload);

    socket.emit("match:join", { matchId });
    socket.on("match:snapshot", onSnapshot);
    socket.on("match:update", onUpdate);
    socket.on("score:updated", onScoreUpdated);

    return () => {
      mountedRef.current = false;
      socket.emit("match:leave", { matchId });
      socket.off("match:snapshot", onSnapshot);
      socket.off("match:update", onUpdate);
      socket.off("score:updated", onScoreUpdated);
    };
  }, [socket, matchId]);

  const api = useMemo(
    () => ({
      start: (refereeId) => socket?.emit("match:start", { matchId, refereeId }),
      pointA: (step = 1) =>
        socket?.emit("match:point", { matchId, team: "A", step }),
      pointB: (step = 1) =>
        socket?.emit("match:point", { matchId, team: "B", step }),
      undo: () => socket?.emit("match:undo", { matchId }),
      finish: (winner) => socket?.emit("match:finish", { matchId, winner }),
      forfeit: (winner, reason = "forfeit") =>
        socket?.emit("match:forfeit", { matchId, winner, reason }),
      setRules: (rules) => socket?.emit("match:rules", { matchId, rules }),
      assignCourt: (courtId) =>
        socket?.emit("match:court", { matchId, courtId }),
      scheduleAt: (datetimeISO) =>
        socket?.emit("match:schedule", { matchId, scheduledAt: datetimeISO }),
    }),
    [socket, matchId]
  );

  return { ...state, api };
}
