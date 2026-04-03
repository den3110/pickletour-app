import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_PREFIX = "PT_REFEREE_LIVE_SYNC_V1";

function storageKey(matchId) {
  return `${STORAGE_PREFIX}:${String(matchId || "").trim()}`;
}

export function createEmptyLiveSyncState(matchId) {
  return {
    matchId: String(matchId || ""),
    snapshot: null,
    featureEnabled: true,
    mode: "offline_sync_v1",
    settingsUpdatedAt: null,
    lastAckedServerVersion: 0,
    queue: [],
    owner: null,
    lastRejectedBatch: [],
    updatedAt: null,
  };
}

export async function loadRefereeLiveSyncState(matchId) {
  if (!matchId) return createEmptyLiveSyncState(matchId);
  try {
    const raw = await AsyncStorage.getItem(storageKey(matchId));
    if (!raw) return createEmptyLiveSyncState(matchId);
    const parsed = JSON.parse(raw);
    return {
      ...createEmptyLiveSyncState(matchId),
      ...parsed,
      matchId: String(matchId),
      queue: Array.isArray(parsed?.queue) ? parsed.queue : [],
      lastRejectedBatch: Array.isArray(parsed?.lastRejectedBatch)
        ? parsed.lastRejectedBatch
        : [],
    };
  } catch {
    return createEmptyLiveSyncState(matchId);
  }
}

export async function saveRefereeLiveSyncState(matchId, state) {
  if (!matchId) return;
  const nextState = {
    ...createEmptyLiveSyncState(matchId),
    ...(state || {}),
    matchId: String(matchId),
    updatedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(storageKey(matchId), JSON.stringify(nextState));
}

export async function clearRefereeLiveSyncState(matchId) {
  if (!matchId) return;
  await AsyncStorage.removeItem(storageKey(matchId));
}
