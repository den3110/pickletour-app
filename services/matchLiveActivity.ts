import { NativeModules, Platform } from "react-native";
import {
  getMatchCourtDisplayText,
  getMatchDisplayCode,
  getMatchDisplayStatus,
  getPairDisplayName,
  normalizeMatchDisplay,
} from "@/utils/matchDisplay";

type MatchRulesOverride = {
  bestOf?: number | null;
  pointsToWin?: number | null;
  winByTwo?: boolean | null;
};

type MatchScoreOverride = {
  scoreA?: number | null;
  scoreB?: number | null;
  setsA?: number | null;
  setsB?: number | null;
  gameIndex?: number | null;
};

type MatchServeOverride = {
  side?: string | null;
  server?: number | null;
};

type MatchLiveActivityBuildOptions = {
  rules?: MatchRulesOverride | null;
  score?: MatchScoreOverride | null;
  serve?: MatchServeOverride | null;
  source?: string | null;
};

type MatchLiveActivityPayload = {
  matchId: string;
  status: string;
  phaseLabel: string;
  isBreakActive: boolean;
  breakNote: string;
  breakExpectedResumeAt: number | null;
  matchCode: string;
  courtName: string;
  source: string;
  teamAName: string;
  teamBName: string;
  teamAShortName: string;
  teamBShortName: string;
  scoreA: number;
  scoreB: number;
  setsA: number;
  setsB: number;
  gameIndex: number;
  bestOf: number;
  pointsToWin: number;
  winByTwo: boolean;
  servingSide: string;
  serverNumber: number;
  winnerSide: string;
  isUserMatch: boolean;
  startedAt: number | null;
  updatedAt: number;
};

type MatchLiveActivitySyncOptions = {
  endOthers?: boolean;
  staleAfterSeconds?: number;
  dismissalPolicy?: "default" | "immediate";
};

type MatchLiveActivityPruneOptions = {
  keepLiveOnly?: boolean;
  maxAgeSeconds?: number;
  dismissalPolicy?: "default" | "immediate";
};

type MatchLiveActivityEndOptions = {
  staleAfterSeconds?: number;
  dismissalPolicy?: "default" | "immediate";
};

type MatchLiveActivitySupportResponse = {
  supported: boolean;
  reason?: string;
  activitiesEnabled?: boolean;
  remoteUpdateSupported?: boolean;
  systemVersion?: string;
};

export type MatchLiveActivityListItem = {
  activityId: string;
  matchId: string;
  matchCode?: string;
  status?: string;
  pushToken?: string | null;
  updatedAt?: number;
};

type MatchLiveActivityNativeModule = {
  isSupported: () => Promise<MatchLiveActivitySupportResponse>;
  list: () => Promise<{
    ok: boolean;
    reason?: string;
    activeCount?: number;
    remoteUpdateSupported?: boolean;
    activities?: MatchLiveActivityListItem[];
  }>;
  sync: (
    payload: MatchLiveActivityPayload,
    options?: MatchLiveActivitySyncOptions,
  ) => Promise<Record<string, unknown>>;
  end: (
    matchId: string,
    payload?: MatchLiveActivityPayload | null,
    options?: MatchLiveActivityEndOptions,
  ) => Promise<Record<string, unknown>>;
  prune: (
    options?: MatchLiveActivityPruneOptions,
  ) => Promise<Record<string, unknown>>;
};

const NativeModule: MatchLiveActivityNativeModule | null =
  Platform.OS === "ios"
    ? (NativeModules.PickletourMatchLiveActivityModule as MatchLiveActivityNativeModule | undefined) ||
      null
    : null;

const DEFAULT_STALE_AFTER_SECONDS = 120;
const PRUNE_MAX_AGE_SECONDS = 60 * 60 * 6;

const toInt = (value: unknown, fallback = 0) => {
  const next = Number(value);
  return Number.isFinite(next) ? Math.trunc(next) : fallback;
};

const toBool = (value: unknown, fallback = false) => {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
};

const toDateSeconds = (value: unknown): number | null => {
  if (value == null) return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 1_000_000_000_000) return Math.round(value / 1000);
    if (value > 1_000_000_000) return Math.round(value);
  }

  if (typeof value === "string" && value.trim()) {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) {
      return toDateSeconds(asNumber);
    }
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return Math.round(parsed / 1000);
    }
  }

  return null;
};

const normalizeStatus = (match: any) => {
  const status = getMatchDisplayStatus(match) || "scheduled";
  if (status === "assigned") return "assigned";
  if (status === "queued") return "queued";
  if (status === "finished") return "finished";
  if (status === "live") return "live";
  return "scheduled";
};

const phaseLabelForStatus = (status: string) => {
  switch (status) {
    case "live":
      return "Đang diễn ra";
    case "assigned":
      return "Đã vào sân";
    case "queued":
      return "Đang chờ";
    case "finished":
      return "Kết thúc";
    default:
      return "Sắp đấu";
  }
};

const getBreakState = (match: any) => {
  const raw = match?.isBreak;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      active: false,
      afterGame: null as number | null,
      type: "",
      side: "",
      note: "",
      expectedResumeAt: null as number | null,
    };
  }

  const rawNote = String(raw.note || "").trim();
  const rawType = String(raw.type || "").trim().toLowerCase();
  const notePrefix = rawNote.split(":")[0]?.trim().toLowerCase() || "";
  const type =
    rawType === "timeout" || rawType === "medical"
      ? rawType
      : notePrefix === "timeout" || notePrefix === "medical"
        ? notePrefix
        : "";
  const sideToken = rawNote.split(":")[1]?.trim().toUpperCase() || "";
  const side = sideToken === "A" || sideToken === "B" ? sideToken : "";

  return {
    active: Boolean(raw.active),
    afterGame: typeof raw.afterGame === "number" ? raw.afterGame : null,
    type,
    side,
    note: rawNote,
    expectedResumeAt: toDateSeconds(raw.expectedResumeAt),
  };
};

const buildBreakPresentation = (
  breakState: {
    active: boolean;
    afterGame: number | null;
    type: string;
    side: string;
    note: string;
    expectedResumeAt: number | null;
  },
  gameIndex: number,
) => {
  if (!breakState.active) {
    return {
      phaseLabel: "",
      note: "",
    };
  }

  const sideShort = breakState.side ? ` ${breakState.side}` : "";
  const sideLong = breakState.side ? ` đội ${breakState.side}` : "";
  const systemNote =
    breakState.note &&
    (breakState.note.toLowerCase() === breakState.type ||
      breakState.note.toLowerCase() === `${breakState.type}:${breakState.side.toLowerCase()}`);
  const customNote = systemNote ? "" : breakState.note;

  if (breakState.type === "timeout") {
    return {
      phaseLabel: `Timeout${sideShort}`,
      note: customNote || `Timeout${sideLong}`.trim(),
    };
  }

  if (breakState.type === "medical") {
    return {
      phaseLabel: `Y tế${sideShort}`,
      note: customNote || `Nghỉ y tế${sideLong}`.trim(),
    };
  }

  if (!customNote) {
    const nextGame =
      typeof breakState.afterGame === "number"
        ? Math.max(1, breakState.afterGame + 2)
        : Math.max(1, gameIndex + 1);
    return {
      phaseLabel: `Chờ game ${nextGame}`,
      note: `Chờ bắt đầu game ${nextGame}`,
    };
  }

  return {
    phaseLabel: "Tạm nghỉ",
    note: customNote,
  };
};

const shortNameForSide = (value: string, fallback: string) => {
  const trimmed = String(value || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!trimmed) return fallback;

  const words = trimmed.split(" ").filter(Boolean);
  if (words.length >= 2) {
    return words
      .slice(0, 2)
      .map((part) => part.slice(0, 1).toUpperCase())
      .join("");
  }

  return trimmed.slice(0, 3).toUpperCase();
};

const needWins = (bestOf = 1) => Math.floor(Math.max(1, bestOf) / 2) + 1;

const isGameWin = (
  a = 0,
  b = 0,
  pointsToWin = 11,
  winByTwo = true,
) => {
  const high = Math.max(a, b);
  const low = Math.min(a, b);
  if (high < pointsToWin) return false;
  return winByTwo ? high - low >= 2 : high - low >= 1;
};

const deriveSetWins = (
  gameScores: { a?: number; b?: number }[],
  pointsToWin: number,
  winByTwo: boolean,
) => {
  let setsA = 0;
  let setsB = 0;

  for (const game of gameScores) {
    const scoreA = toInt(game?.a, 0);
    const scoreB = toInt(game?.b, 0);

    if (!isGameWin(scoreA, scoreB, pointsToWin, winByTwo)) {
      continue;
    }

    if (scoreA > scoreB) setsA += 1;
    if (scoreB > scoreA) setsB += 1;
  }

  return { setsA, setsB };
};

const normalizeServeSide = (value: unknown) =>
  String(value || "").toUpperCase() === "B" ? "B" : "A";

const normalizeWinnerSide = (value: unknown) => {
  const winner = String(value || "").toUpperCase();
  return winner === "B" ? "B" : winner === "A" ? "A" : "";
};

const shouldTrackStatus = (status: string) =>
  ["scheduled", "queued", "assigned", "live", "finished"].includes(status);

export const buildMatchLiveActivityPayload = (
  matchInput: any,
  options: MatchLiveActivityBuildOptions = {},
): MatchLiveActivityPayload | null => {
  const match = normalizeMatchDisplay(matchInput) ?? matchInput;
  const matchId = String(
    match?._id ?? match?.matchId ?? match?.id ?? "",
  ).trim();

  if (!matchId) return null;

  const status = normalizeStatus(match);
  if (!shouldTrackStatus(status)) return null;

  const rules = {
    bestOf: Math.max(1, toInt(options.rules?.bestOf ?? match?.rules?.bestOf, 1)),
    pointsToWin: Math.max(
      1,
      toInt(options.rules?.pointsToWin ?? match?.rules?.pointsToWin, 11),
    ),
    winByTwo: toBool(
      options.rules?.winByTwo ?? match?.rules?.winByTwo,
      true,
    ),
  };

  const gameScores = Array.isArray(match?.gameScores) ? match.gameScores : [];
  const lastIndex = Math.max(0, gameScores.length - 1);
  const currentIndex = Math.min(
    lastIndex,
    Math.max(
      0,
      toInt(options.score?.gameIndex ?? match?.currentGame ?? lastIndex, lastIndex),
    ),
  );
  const currentGame = gameScores[currentIndex] || {};
  const derivedSets = deriveSetWins(
    gameScores,
    rules.pointsToWin,
    rules.winByTwo,
  );
  const scoreA = Math.max(
    0,
    toInt(options.score?.scoreA ?? currentGame?.a ?? 0, 0),
  );
  const scoreB = Math.max(
    0,
    toInt(options.score?.scoreB ?? currentGame?.b ?? 0, 0),
  );
  const setsA = Math.max(
    0,
    toInt(options.score?.setsA ?? derivedSets.setsA, 0),
  );
  const setsB = Math.max(
    0,
    toInt(options.score?.setsB ?? derivedSets.setsB, 0),
  );
  const fallbackWinner =
    setsA >= needWins(rules.bestOf)
      ? "A"
      : setsB >= needWins(rules.bestOf)
        ? "B"
        : "";
  const breakState = getBreakState(match);
  const breakPresentation = buildBreakPresentation(breakState, currentIndex);
  const phaseLabel =
    status === "live" && breakState.active
      ? breakPresentation.phaseLabel
      : phaseLabelForStatus(status);
  const startedAt =
    status === "live"
      ? toDateSeconds(match?.startedAt ?? match?.liveStartedAt ?? match?.updatedAt)
      : null;
  const updatedAt =
    toDateSeconds(match?.updatedAt ?? match?.updated_at ?? new Date().toISOString()) ??
    Math.round(Date.now() / 1000);
  const teamAName = getPairDisplayName(match?.pairA, match) || "Doi A";
  const teamBName = getPairDisplayName(match?.pairB, match) || "Doi B";
  const matchCode = getMatchDisplayCode(match) || `MATCH-${matchId.slice(-6).toUpperCase()}`;

  return {
    matchId,
    status,
    phaseLabel,
    isBreakActive: breakState.active,
    breakNote: breakPresentation.note,
    breakExpectedResumeAt: breakState.expectedResumeAt,
    matchCode,
    courtName: getMatchCourtDisplayText(match) || "",
    source: String(options.source || "match"),
    teamAName,
    teamBName,
    teamAShortName: shortNameForSide(teamAName, "A"),
    teamBShortName: shortNameForSide(teamBName, "B"),
    scoreA,
    scoreB,
    setsA,
    setsB,
    gameIndex: currentIndex,
    bestOf: rules.bestOf,
    pointsToWin: rules.pointsToWin,
    winByTwo: rules.winByTwo,
    servingSide: normalizeServeSide(
      options.serve?.side ?? match?.serve?.side,
    ),
    serverNumber: Math.max(
      1,
      Math.min(
        2,
        toInt(
          options.serve?.server ??
            match?.serve?.order ??
            match?.serve?.server ??
            1,
          1,
        ),
      ),
    ),
    winnerSide: normalizeWinnerSide(match?.winner || fallbackWinner),
    isUserMatch: Boolean(match?.userMatch || match?.isUserMatch),
    startedAt,
    updatedAt,
  };
};

export const isMatchLiveActivityAvailable = () =>
  Platform.OS === "ios" && Boolean(NativeModule);

export async function getMatchLiveActivitySupport() {
  if (!NativeModule) {
    return {
      supported: false,
      reason: "unavailable",
    } satisfies MatchLiveActivitySupportResponse;
  }

  try {
    return await NativeModule.isSupported();
  } catch (error: any) {
    return {
      supported: false,
      reason: error?.message || "support-check-failed",
    } satisfies MatchLiveActivitySupportResponse;
  }
}

export async function listMatchLiveActivities() {
  if (!NativeModule || typeof NativeModule.list !== "function") {
    return {
      ok: false,
      reason: "unavailable",
      activities: [],
    };
  }

  try {
    const result = await NativeModule.list();
    return {
      ...result,
      activities: Array.isArray(result?.activities) ? result.activities : [],
    };
  } catch (error: any) {
    return {
      ok: false,
      reason: error?.message || "list-failed",
      activities: [],
    };
  }
}

export async function syncMatchLiveActivity(
  payload: MatchLiveActivityPayload | null,
  options: MatchLiveActivitySyncOptions = {},
) {
  if (!NativeModule || !payload?.matchId) {
    return { ok: false, reason: "unavailable" };
  }

  try {
    return await NativeModule.sync(payload, {
      endOthers: options.endOthers ?? true,
      staleAfterSeconds:
        options.staleAfterSeconds ?? DEFAULT_STALE_AFTER_SECONDS,
      dismissalPolicy: options.dismissalPolicy ?? "default",
    });
  } catch (error: any) {
    if (__DEV__) {
      console.warn("[MatchLiveActivity] sync failed", error);
    }
    return {
      ok: false,
      reason: error?.message || "sync-failed",
    };
  }
}

export async function endMatchLiveActivity(
  matchId: string,
  payload: MatchLiveActivityPayload | null = null,
  options: MatchLiveActivityEndOptions = {},
) {
  if (!NativeModule || !matchId) {
    return { ok: false, reason: "unavailable" };
  }

  try {
    return await NativeModule.end(matchId, payload, {
      staleAfterSeconds:
        options.staleAfterSeconds ?? DEFAULT_STALE_AFTER_SECONDS,
      dismissalPolicy: options.dismissalPolicy ?? "default",
    });
  } catch (error: any) {
    if (__DEV__) {
      console.warn("[MatchLiveActivity] end failed", error);
    }
    return {
      ok: false,
      reason: error?.message || "end-failed",
    };
  }
}

export async function pruneMatchLiveActivities(
  options: MatchLiveActivityPruneOptions = {},
) {
  if (!NativeModule) {
    return { ok: false, reason: "unavailable" };
  }

  try {
    return await NativeModule.prune({
      keepLiveOnly: options.keepLiveOnly ?? false,
      maxAgeSeconds: options.maxAgeSeconds ?? PRUNE_MAX_AGE_SECONDS,
      dismissalPolicy: options.dismissalPolicy ?? "default",
    });
  } catch (error: any) {
    if (__DEV__) {
      console.warn("[MatchLiveActivity] prune failed", error);
    }
    return {
      ok: false,
      reason: error?.message || "prune-failed",
    };
  }
}
