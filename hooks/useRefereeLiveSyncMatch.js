import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { useSelector } from "react-redux";
import { useSocket } from "@/context/SocketContext";
import {
  extractMatchPayload,
  extractMatchPatchPayload,
  getMatchPayloadId,
  isLightweightMatchPayload,
  isNewerOrEqualMatchPayload,
  mergeMatchPayload,
  normalizeMatchDisplay,
} from "@/utils/matchDisplay";
import { BASE_URL, getDeviceId, getDeviceName } from "@/slices/apiSlice";
import {
  applyLiveSyncEventLocally,
  createClientLiveSyncEvent,
  rebuildLiveSyncSnapshot,
} from "@/utils/liveSyncReducer";
import {
  createEmptyLiveSyncState,
  loadRefereeLiveSyncState,
  saveRefereeLiveSyncState,
} from "@/utils/refereeLiveSyncStorage";

function trim(value) {
  return (value && String(value).trim()) || "";
}

async function parseJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function buildRequestError(payload, fallback = "Request failed") {
  const error = new Error(
    trim(payload?.message) || trim(payload?.code) || fallback
  );
  error.data = payload || null;
  return error;
}

export function useRefereeLiveSyncMatch(
  matchId,
  tokenFromArg,
  options = {}
) {
  const enabled = options?.enabled !== false;
  const socket = useSocket();
  const mountedRef = useRef(false);
  const persistRef = useRef(createEmptyLiveSyncState(matchId));
  const dataRef = useRef(null);
  const syncInFlightRef = useRef(null);
  const bootstrapInFlightRef = useRef(null);
  const claimInFlightRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);
  const netOnlineRef = useRef(null);
  const deviceRef = useRef({ deviceId: "", deviceName: "" });
  const { userInfo } = useSelector((state) => state.auth || {});
  const token = tokenFromArg || userInfo?.token || "";

  const [state, setState] = useState(() => ({
    loading: enabled && Boolean(matchId),
    data: null,
    error: null,
    owner: null,
    pendingCount: 0,
    online: true,
    syncing: false,
    claiming: false,
    lastRejectedBatch: [],
  }));

  const mergeAuthoritativeSnapshot = useCallback((snapshot, queue) => {
    const normalized = normalizeMatchDisplay(snapshot);
    if (!normalized) return null;
    return rebuildLiveSyncSnapshot(normalized, queue);
  }, []);

  const persistState = useCallback(async (nextPartial) => {
    const next = {
      ...persistRef.current,
      ...(nextPartial || {}),
      matchId: String(matchId || ""),
    };
    persistRef.current = next;
    if (matchId) {
      await saveRefereeLiveSyncState(matchId, next);
    }
  }, [matchId]);

  const setDerivedState = useCallback((updater) => {
    setState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (next && Object.prototype.hasOwnProperty.call(next, "data")) {
        dataRef.current = next.data;
      }
      return next;
    });
  }, []);

  const decorateOwner = useCallback(
    (owner) => {
      if (!owner) return null;
      const currentUserId = trim(userInfo?._id);
      const currentDeviceId = trim(deviceRef.current.deviceId);
      const ownerUserId = trim(owner.userId);
      const ownerDeviceId = trim(owner.deviceId);
      const isSelf =
        ownerUserId && currentUserId
          ? ownerUserId === currentUserId
          : Boolean(currentDeviceId) && ownerDeviceId === currentDeviceId;
      return {
        ...owner,
        isSelf,
      };
    },
    [userInfo?._id]
  );

  const httpRequest = useCallback(
    async (path, { method = "GET", body, headers = {} } = {}) => {
      const [deviceId, deviceName] = await Promise.all([
        getDeviceId(),
        getDeviceName(),
      ]);
      deviceRef.current = { deviceId, deviceName };
      const response = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "X-Device-Id": deviceId,
          "X-Device-Name": deviceName,
          ...(headers || {}),
        },
        body: body ? JSON.stringify({ ...body, deviceId, deviceName }) : undefined,
      });
      const json = await parseJsonSafe(response);
      if (!response.ok) {
        const error = buildRequestError(json, "Request failed");
        error.status = response.status;
        throw error;
      }
      return json || {};
    },
    [token]
  );

  const socketRequest = useCallback(
    async (eventName, body = {}, { timeoutMs = 5000 } = {}) => {
      if (!socket?.connected) {
        const error = buildRequestError(
          { code: "socket_unavailable", message: "Socket is not connected" },
          "Socket is not connected"
        );
        error.code = "socket_unavailable";
        throw error;
      }

      const [deviceId, deviceName] = await Promise.all([
        getDeviceId(),
        getDeviceName(),
      ]);
      deviceRef.current = { deviceId, deviceName };

      return await new Promise((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          const error = buildRequestError(
            { code: "socket_timeout", message: "Socket request timed out" },
            "Socket request timed out"
          );
          error.code = "socket_timeout";
          reject(error);
        }, timeoutMs);

        try {
          socket.emit(
            eventName,
            {
              matchId,
              ...body,
            },
            (response = {}) => {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              if (!response?.ok) {
                reject(buildRequestError(response, "Socket request failed"));
                return;
              }
              resolve(response);
            }
          );
        } catch (error) {
          clearTimeout(timer);
          reject(error);
        }
      });
    },
    [socket, matchId]
  );

  const request = useCallback(
    async (
      path,
      {
        method = "GET",
        body,
        socketBody,
        headers,
        socketEvent = "",
        socketFirst = true,
        timeoutMs = 5000,
      } = {}
    ) => {
      const shouldTrySocket =
        socketFirst && Boolean(socketEvent) && Boolean(socket?.connected);
      if (shouldTrySocket) {
        try {
          return await socketRequest(
            socketEvent,
            socketBody ?? body ?? {},
            { timeoutMs }
          );
        } catch (error) {
          if (
            error?.code !== "socket_unavailable" &&
            error?.code !== "socket_timeout"
          ) {
            throw error;
          }
        }
      }

      return httpRequest(path, { method, body, headers });
    },
    [socket, socketRequest, httpRequest]
  );

  const applyRemoteSnapshot = useCallback(
    async (snapshot, { force = false, owner = undefined } = {}) => {
      if (!snapshot) return null;
      const queue = Array.isArray(persistRef.current.queue)
        ? persistRef.current.queue
        : [];
      const rebuilt = mergeAuthoritativeSnapshot(snapshot, force ? [] : queue);
      if (!rebuilt) return null;

      setDerivedState((prev) => {
        const nextOwner =
          owner !== undefined ? decorateOwner(owner) : prev.owner;
        const nextData =
          force || !prev.data
            ? rebuilt
            : (() => {
                const merged = mergeMatchPayload(prev.data, rebuilt, prev.data);
                if (!merged) return rebuilt;
                if (
                  !force &&
                  prev.data &&
                  !isNewerOrEqualMatchPayload(prev.data, merged)
                ) {
                  return prev.data;
                }
                return merged;
              })();
        dataRef.current = nextData;
        return {
          ...prev,
          loading: false,
          data: nextData,
          error: null,
          owner: nextOwner,
          pendingCount: force ? 0 : queue.length,
        };
      });

      await persistState({
        snapshot: normalizeMatchDisplay(snapshot),
        owner:
          owner !== undefined
            ? decorateOwner(owner)
            : persistRef.current.owner,
      });
      return rebuilt;
    },
    [decorateOwner, mergeAuthoritativeSnapshot, persistState, setDerivedState]
  );

  const bootstrap = useCallback(async () => {
    if (!enabled || !matchId || !token) return null;
    if (bootstrapInFlightRef.current) return bootstrapInFlightRef.current;

    const run = (async () => {
      try {
        const result = await request(
          `/api/referee/matches/${matchId}/live-sync/bootstrap`,
          {
            socketEvent: "match:live:bootstrap",
          }
        );
        const owner = decorateOwner(result?.owner || null);
        await persistState({
          snapshot: normalizeMatchDisplay(result?.snapshot || null),
          lastAckedServerVersion: Number(result?.serverVersion || 0),
          owner,
        });
        await applyRemoteSnapshot(result?.snapshot, { owner });
        return result;
      } catch (error) {
        if (!mountedRef.current) return null;
        setDerivedState((prev) => ({ ...prev, loading: false, error }));
        return null;
      } finally {
        bootstrapInFlightRef.current = null;
      }
    })();

    bootstrapInFlightRef.current = run;
    return run;
  }, [
    decorateOwner,
    enabled,
    matchId,
    token,
    request,
    persistState,
    applyRemoteSnapshot,
    setDerivedState,
  ]);

  const claim = useCallback(async () => {
    if (!enabled || !matchId || !token) return null;
    if (claimInFlightRef.current) return claimInFlightRef.current;
    setDerivedState((prev) => ({ ...prev, claiming: true }));

    const run = (async () => {
      try {
        const result = await request(
          `/api/referee/matches/${matchId}/live-sync/claim`,
          {
            method: "POST",
            socketEvent: "match:live:claim",
          }
        );
        const owner = decorateOwner(result?.owner || null);
        await persistState({
          owner,
          snapshot: normalizeMatchDisplay(
            result?.snapshot || persistRef.current.snapshot
          ),
          lastAckedServerVersion: Number(
            result?.serverVersion ||
              persistRef.current.lastAckedServerVersion ||
              0
          ),
        });
        await applyRemoteSnapshot(result?.snapshot, { owner });
        return result;
      } catch (error) {
        const owner = decorateOwner(error?.data?.owner || null);
        const snapshot = error?.data?.snapshot || null;
        if (snapshot) {
          await persistState({
            owner,
            snapshot: normalizeMatchDisplay(snapshot),
          });
          await applyRemoteSnapshot(snapshot, { owner, force: false });
        } else {
          setDerivedState((prev) => ({ ...prev, owner }));
        }
        return null;
      } finally {
        claimInFlightRef.current = null;
        if (mountedRef.current) {
          setDerivedState((prev) => ({ ...prev, claiming: false }));
        }
      }
    })();

    claimInFlightRef.current = run;
    return run;
  }, [
    decorateOwner,
    enabled,
    matchId,
    token,
    request,
    applyRemoteSnapshot,
    persistState,
    setDerivedState,
  ]);

  const release = useCallback(async () => {
    if (!enabled || !matchId || !token) return null;
    try {
      return await request(`/api/referee/matches/${matchId}/live-sync/release`, {
        method: "POST",
        socketEvent: "match:live:release",
      });
    } catch {
      return null;
    }
  }, [enabled, matchId, token, request]);

  const discardRejected = useCallback(async () => {
    const snapshot = persistRef.current.snapshot;
    persistRef.current = {
      ...persistRef.current,
      queue: [],
      lastRejectedBatch: [],
    };
    await persistState({
      queue: [],
      lastRejectedBatch: [],
      snapshot,
    });
    setDerivedState((prev) => ({
      ...prev,
      lastRejectedBatch: [],
      pendingCount: 0,
      data: snapshot ? mergeAuthoritativeSnapshot(snapshot, []) : prev.data,
    }));
  }, [mergeAuthoritativeSnapshot, persistState, setDerivedState]);

  const syncNow = useCallback(async () => {
    if (!enabled || !matchId || !token) return null;
    if (syncInFlightRef.current) return syncInFlightRef.current;
    const initialQueue = Array.isArray(persistRef.current.queue)
      ? persistRef.current.queue
      : [];
    if (!initialQueue.length) return null;

    const run = (async () => {
      setDerivedState((prev) => ({ ...prev, syncing: true }));
      try {
        let lastResult = null;

        while (true) {
          const queue = Array.isArray(persistRef.current.queue)
            ? [...persistRef.current.queue]
            : [];
          if (!queue.length) return lastResult;

          const result = await request(
            `/api/referee/matches/${matchId}/live-sync/sync`,
            {
              method: "POST",
              socketEvent: "match:live:sync",
              body: {
                lastKnownServerVersion: Number(
                  persistRef.current.lastAckedServerVersion || 0
                ),
                events: queue,
              },
            },
          );

          const acked = new Set(result?.ackedClientEventIds || []);
          const currentQueue = Array.isArray(persistRef.current.queue)
            ? persistRef.current.queue
            : [];
          const remainingQueue = currentQueue.filter(
            (event) => !acked.has(String(event?.clientEventId || ""))
          );
          const rejected = Array.isArray(result?.rejectedEvents)
            ? result.rejectedEvents
            : [];
          const hasOwnershipConflict = rejected.some(
            (item) => item?.code === "ownership_conflict"
          );
          const owner = decorateOwner(result?.owner || null);

          const nextPersist = {
            queue: remainingQueue,
            owner,
            lastAckedServerVersion: Number(
              result?.serverVersion ||
                persistRef.current.lastAckedServerVersion ||
                0
            ),
            snapshot: normalizeMatchDisplay(
              result?.snapshot || persistRef.current.snapshot
            ),
            lastRejectedBatch: rejected,
          };

          await persistState(nextPersist);

          if (result?.snapshot) {
            await applyRemoteSnapshot(result.snapshot, {
              owner,
              force: hasOwnershipConflict,
            });
          } else {
            setDerivedState((prev) => ({
              ...prev,
              owner,
              pendingCount: remainingQueue.length,
              lastRejectedBatch: rejected,
            }));
          }

          setDerivedState((prev) => ({
            ...prev,
            owner,
            pendingCount: remainingQueue.length,
            lastRejectedBatch: rejected,
          }));

          lastResult = result;

          if (hasOwnershipConflict || rejected.length > 0) {
            return result;
          }
          if (!remainingQueue.length) {
            return result;
          }
        }
      } catch (error) {
        setDerivedState((prev) => ({ ...prev, error }));
        return null;
      } finally {
        syncInFlightRef.current = null;
        if (mountedRef.current) {
          setDerivedState((prev) => ({ ...prev, syncing: false }));
        }
      }
    })();

    syncInFlightRef.current = run;
    return run;
  }, [
    decorateOwner,
    enabled,
    matchId,
    token,
    request,
    persistState,
    applyRemoteSnapshot,
    setDerivedState,
  ]);

  const refreshOwnership = useCallback(async () => {
    if (!enabled || !matchId || !token) return null;
    await bootstrap();
    const owner = persistRef.current.owner;
    if (!owner || owner.isSelf) {
      await claim();
    }
    await syncNow();
    return persistRef.current.owner;
  }, [enabled, matchId, token, bootstrap, claim, syncNow]);

  const takeover = useCallback(async () => {
    if (!enabled || !matchId || !token) return null;
    setDerivedState((prev) => ({ ...prev, claiming: true }));
    try {
      const result = await request(
        `/api/referee/matches/${matchId}/live-sync/takeover`,
        {
          method: "POST",
          socketEvent: "match:live:takeover",
        }
      );
      const owner = decorateOwner(result?.owner || null);
      await persistState({
        owner,
        snapshot: normalizeMatchDisplay(result?.snapshot || persistRef.current.snapshot),
        lastAckedServerVersion: Number(
          result?.serverVersion || persistRef.current.lastAckedServerVersion || 0
        ),
      });
      await applyRemoteSnapshot(result?.snapshot, {
        owner,
        force: true,
      });
      await syncNow();
      return result;
    } finally {
      if (mountedRef.current) {
        setDerivedState((prev) => ({ ...prev, claiming: false }));
      }
    }
  }, [
    decorateOwner,
    enabled,
    matchId,
    token,
    request,
    persistState,
    applyRemoteSnapshot,
    syncNow,
    setDerivedState,
  ]);

  const enqueueEvent = useCallback(
    async (type, payload = {}) => {
      if (!enabled || !matchId) return null;
      const baseVersion =
        Number(dataRef.current?.liveVersion || 0) ||
        Number(persistRef.current.lastAckedServerVersion || 0);
      const event = createClientLiveSyncEvent(type, payload, baseVersion);
      const nextQueue = [...(persistRef.current.queue || []), event];
      const sourceSnapshot = dataRef.current || persistRef.current.snapshot;
      const optimistic = applyLiveSyncEventLocally(sourceSnapshot, event);
      dataRef.current = optimistic;
      await persistState({
        queue: nextQueue,
        snapshot: normalizeMatchDisplay(persistRef.current.snapshot),
      });
      setDerivedState((prev) => ({
        ...prev,
        data: optimistic || prev.data,
        pendingCount: nextQueue.length,
        error: null,
      }));
      const onlineNow = state.online;
      const owner = persistRef.current.owner;
      if (onlineNow && (!owner || owner.isSelf)) {
        syncNow();
      }
      return event;
    },
    [
      enabled,
      matchId,
      state.online,
      persistState,
      setDerivedState,
      syncNow,
    ]
  );

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled || !matchId) {
      dataRef.current = null;
      setState({
        loading: false,
        data: null,
        error: null,
        owner: null,
        pendingCount: 0,
        online: true,
        syncing: false,
        claiming: false,
        lastRejectedBatch: [],
      });
      return () => {
        mountedRef.current = false;
      };
    }

    (async () => {
      const [deviceId, deviceName] = await Promise.all([
        getDeviceId(),
        getDeviceName(),
      ]);
      deviceRef.current = { deviceId, deviceName };
      const stored = await loadRefereeLiveSyncState(matchId);
      if (!mountedRef.current) return;
      persistRef.current = stored;
      dataRef.current = stored.snapshot
        ? rebuildLiveSyncSnapshot(stored.snapshot, stored.queue)
        : null;
      setState((prev) => ({
        ...prev,
        loading: true,
        data: dataRef.current,
        owner: decorateOwner(stored.owner || null),
        pendingCount: Array.isArray(stored.queue) ? stored.queue.length : 0,
        lastRejectedBatch: Array.isArray(stored.lastRejectedBatch)
          ? stored.lastRejectedBatch
          : [],
      }));
      await refreshOwnership();
    })();

    return () => {
      mountedRef.current = false;
    };
  }, [decorateOwner, enabled, matchId, refreshOwnership]);

  useEffect(() => {
    if (!enabled || !matchId) return;
    netOnlineRef.current = null;
    const unsubscribe = NetInfo.addEventListener((netState) => {
      const online = Boolean(
        netState.isConnected && netState.isInternetReachable !== false
      );
      const prevOnline = netOnlineRef.current;
      netOnlineRef.current = online;
      setDerivedState((prev) => ({ ...prev, online }));
      if (prevOnline === null) return;
      if (!prevOnline && online) {
        refreshOwnership();
      }
    });
    return () => unsubscribe();
  }, [enabled, matchId, refreshOwnership, setDerivedState]);

  useEffect(() => {
    if (!enabled || !matchId) return;
    const subscription = AppState.addEventListener("change", (nextState) => {
      const wasBackground = appStateRef.current !== "active";
      appStateRef.current = nextState;
      if (nextState === "active" && wasBackground) {
        refreshOwnership();
      }
      if (nextState !== "active") {
        release();
      }
    });
    return () => subscription.remove();
  }, [enabled, matchId, refreshOwnership, release]);

  useEffect(() => {
    if (!enabled || !matchId || !socket) return;
    const isForThisMatch = (payload) =>
      String(getMatchPayloadId(payload) || "") === String(matchId);

    const requestSnapshot = () =>
      socket.emit?.("match:snapshot:request", { matchId });

    const applyIncoming = async (payload, { allowLightweight = false } = {}) => {
      if (!mountedRef.current || !isForThisMatch(payload)) return;
      if (!allowLightweight && isLightweightMatchPayload(payload)) {
        requestSnapshot();
        return;
      }
      const extracted = extractMatchPayload(payload);
      const incoming = normalizeMatchDisplay(extracted);
      if (!incoming) return;
      const queue = Array.isArray(persistRef.current.queue)
        ? persistRef.current.queue
        : [];
      const shouldOverlayQueue = queue.length > 0 && !syncInFlightRef.current;
      const baseSnapshot =
        shouldOverlayQueue
          ? rebuildLiveSyncSnapshot(incoming, queue)
          : incoming;
      setDerivedState((prev) => {
        const nextData = prev.data
          ? mergeMatchPayload(prev.data, baseSnapshot, prev.data)
          : baseSnapshot;
        if (!nextData) return prev;
        if (prev.data && !isNewerOrEqualMatchPayload(prev.data, nextData)) {
          return prev;
        }
        dataRef.current = nextData;
        return { ...prev, loading: false, data: nextData };
      });
      await persistState({ snapshot: incoming });
    };

    const onSnapshot = (payload) =>
      applyIncoming(payload, { allowLightweight: true });
    const onUpdate = (payload) => applyIncoming(payload);
    const onScore = (payload) => applyIncoming(payload);
    const onPatched = async (payload) => {
      if (!mountedRef.current || !isForThisMatch(payload)) return;
      const patch = extractMatchPatchPayload(payload);
      if (!patch) return;

      const mergedSnapshot = mergeMatchPayload(
        persistRef.current.snapshot || dataRef.current || patch,
        patch,
        persistRef.current.snapshot || dataRef.current || patch
      );
      if (!mergedSnapshot) return;

      const queue = Array.isArray(persistRef.current.queue)
        ? persistRef.current.queue
        : [];
      const shouldOverlayQueue = queue.length > 0 && !syncInFlightRef.current;
      const nextData =
        shouldOverlayQueue
          ? rebuildLiveSyncSnapshot(mergedSnapshot, queue)
          : mergedSnapshot;

      dataRef.current = nextData;
      await persistState({ snapshot: normalizeMatchDisplay(mergedSnapshot) });
      setDerivedState((prev) => ({
        ...prev,
        loading: false,
        data: prev.data
          ? mergeMatchPayload(prev.data, nextData, prev.data)
          : nextData,
      }));
    };
    const onOwnershipChanged = (payload = {}) => {
      if (String(payload?.matchId || "") !== String(matchId)) return;
      const owner = decorateOwner(payload?.owner || null);
      persistRef.current = { ...persistRef.current, owner };
      setDerivedState((prev) => ({ ...prev, owner }));
    };

    socket.emit("match:join", { matchId });
    socket.on("match:snapshot", onSnapshot);
    socket.on("match:update", onUpdate);
    socket.on("score:updated", onScore);
    socket.on("match:patched", onPatched);
    socket.on("match:ownership_changed", onOwnershipChanged);
    return () => {
      socket.emit("match:leave", { matchId });
      socket.off("match:snapshot", onSnapshot);
      socket.off("match:update", onUpdate);
      socket.off("score:updated", onScore);
      socket.off("match:patched", onPatched);
      socket.off("match:ownership_changed", onOwnershipChanged);
    };
  }, [decorateOwner, enabled, matchId, socket, persistState, setDerivedState]);

  useEffect(() => {
    if (!enabled || !matchId || !state.online || !token) return;
    const owner = persistRef.current.owner;
    if (!owner?.isSelf) return;
    const interval = setInterval(() => {
      claim();
    }, 10000);
    return () => clearInterval(interval);
  }, [enabled, matchId, state.online, token, claim, state.owner]);

  const api = useMemo(
    () => ({
      start: () => enqueueEvent("start"),
      pointA: (step = 1) => enqueueEvent("point", { team: "A", step }),
      pointB: (step = 1) => enqueueEvent("point", { team: "B", step }),
      setServe: ({ side, server, serverId = null } = {}) =>
        enqueueEvent("serve", { side, server, serverId }),
      setSlotsBase: ({ base, layout = null, serve = null } = {}) =>
        enqueueEvent("slots", { base, layout, serve }),
      undo: () => enqueueEvent("undo"),
      finish: (winner, reason = "") =>
        enqueueEvent("finish", { winner, reason }),
      forfeit: (winner, reason = "forfeit") =>
        enqueueEvent("forfeit", { winner, reason }),
      nextGame: ({ autoNext, userMatch = false } = {}) =>
        request(`/api/referee/matches/${matchId}/score`, {
          method: "PATCH",
          body: { autoNext, userMatch },
          headers: userMatch ? { "X-Pkt-Match-Kind": "user" } : undefined,
          socketEvent: "match:nextGame",
        }),
      setBreak: ({ userMatch = false, ...payload } = {}) =>
        request(`/api/referee/matches/${matchId}/break`, {
          method: "PUT",
          body: { ...payload, userMatch },
          headers: userMatch ? { "X-Pkt-Match-Kind": "user" } : undefined,
          socketEvent: "match:break:set",
        }),
      assignCourt: (input = {}) => {
        const payload =
          typeof input === "string" ? { courtId: input } : input || {};
        const {
          courtId,
          force = false,
          allowReassignLive = false,
        } = payload;
        return request(`/api/referee/matches/${matchId}/assign-court`, {
          method: "POST",
          body: { courtId, force, allowReassignLive },
          socketEvent: "match:court:assign",
        });
      },
      unassignCourt: ({ toStatus } = {}) =>
        request(`/api/referee/matches/${matchId}/unassign-court`, {
          method: "POST",
          body: { toStatus },
          socketEvent: "match:court:unassign",
        }),
      listCourts: ({ includeBusy = false, cluster, status } = {}) => {
        const query = [
          `includeBusy=${includeBusy ? "1" : "0"}`,
          cluster ? `cluster=${encodeURIComponent(String(cluster))}` : "",
          status ? `status=${encodeURIComponent(String(status))}` : "",
        ]
          .filter(Boolean)
          .join("&");

        return request(`/api/referee/matches/${matchId}/courts?${query}`, {
          method: "GET",
          socketBody: {
            includeBusy: Boolean(includeBusy),
            ...(cluster ? { cluster } : {}),
            ...(status ? { status } : {}),
          },
          socketEvent: "match:courts:list",
        });
      },
      updateSettings: ({ userMatch = false, ...payload } = {}) =>
        request(`/api/matches/${matchId}/update`, {
          method: "PATCH",
          body: { ...payload, userMatch },
          headers: userMatch ? { "X-Pkt-Match-Kind": "user" } : undefined,
          socketEvent: "match:settings:update",
        }),
    }),
    [enqueueEvent, matchId, request]
  );

  const sync = useMemo(
    () => ({
      enabled: true,
      owner: state.owner,
      isOwner: Boolean(state.owner?.isSelf),
      pendingCount: state.pendingCount,
      online: state.online,
      syncing: state.syncing,
      claiming: state.claiming,
      lastRejectedBatch: state.lastRejectedBatch,
      hasConflict: state.lastRejectedBatch.some(
        (item) => item?.code === "ownership_conflict"
      ),
      claim,
      takeover,
      syncNow,
      discardRejected,
      release,
    }),
    [
      state.owner,
      state.pendingCount,
      state.online,
      state.syncing,
      state.claiming,
      state.lastRejectedBatch,
      claim,
      takeover,
      syncNow,
      discardRejected,
      release,
    ]
  );

  return {
    loading: state.loading,
    data: state.data,
    error: state.error,
    api,
    sync,
    refetch: bootstrap,
  };
}
