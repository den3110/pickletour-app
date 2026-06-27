import {
  getMatchSideDisplayName,
  getPairDisplayName,
  getPlayerDisplayName,
  normalizeMatchDisplay,
} from "@/utils/matchDisplay";

const SNAPSHOT_PARAM = "refereeMatchSnapshot";

const trimText = (value) => (value == null ? "" : String(value).trim());

const isReferenceLabel = (value) =>
  /^(?:[WL]\s*-|V\d+(?:-|$))/i.test(trimText(value));

const isUsefulLabel = (value) => {
  const text = trimText(value);
  if (!text) return false;
  if (/^(BYE|TBD|Registration|Doi [AB]|Chua co doi|\u2014|-)$/i.test(text)) {
    return false;
  }
  return !isReferenceLabel(text);
};

const compactPlayer = (player, source) => {
  if (!player || typeof player !== "object") return null;

  const id =
    player?._id ??
    player?.id ??
    player?.uid ??
    player?.user?._id ??
    player?.user?.id ??
    player?.user ??
    "";
  const displayName = getPlayerDisplayName(player, source);
  const nickname =
    trimText(player?.nickname) ||
    trimText(player?.nickName) ||
    trimText(player?.nick) ||
    trimText(player?.user?.nickname) ||
    trimText(player?.user?.nickName);
  const fullName =
    trimText(player?.fullName) ||
    trimText(player?.name) ||
    trimText(player?.user?.fullName) ||
    trimText(player?.user?.name);
  const avatar =
    trimText(player?.avatar) ||
    trimText(player?.avatarURL) ||
    trimText(player?.photoURL) ||
    trimText(player?.picture);

  if (!id && !displayName && !nickname && !fullName) return null;

  return {
    ...(id ? { _id: String(id), id: String(id), uid: String(id) } : {}),
    ...(nickname ? { nickname, nickName: nickname } : {}),
    ...(fullName ? { fullName, name: fullName } : {}),
    ...(displayName ? { displayName } : {}),
    ...(avatar ? { avatar } : {}),
  };
};

const compactPair = (pair, source) => {
  if (!pair || typeof pair !== "object") return null;

  const player1 = compactPlayer(pair?.player1, source);
  const player2 = compactPlayer(pair?.player2, source);
  const players = Array.isArray(pair?.players)
    ? pair.players
        .map((player) => compactPlayer(player, source))
        .filter(Boolean)
        .slice(0, 2)
    : [];
  const pairName = getPairDisplayName(pair, source);
  const usefulName = isUsefulLabel(pairName) ? pairName : "";
  const id = pair?._id ?? pair?.id ?? "";

  if (!player1 && !player2 && !players.length && !usefulName) return null;

  return {
    ...(id ? { _id: String(id), id: String(id) } : {}),
    ...(player1 ? { player1 } : {}),
    ...(player2 ? { player2 } : {}),
    ...(players.length ? { players } : {}),
    ...(usefulName
      ? {
          name: usefulName,
          displayName: usefulName,
          teamName: usefulName,
        }
      : {}),
  };
};

const sideLabel = (match, side) => {
  const key = side === "B" ? "B" : "A";
  const candidates = [
    match?.[`__side${key}`],
    match?.[`resolvedSideName${key}`],
    match?.[`team${key}Name`],
    match?.[`pair${key}Name`],
    match?.[`side${key}Name`],
    getMatchSideDisplayName(match, key, ""),
  ];
  return candidates.find(isUsefulLabel) || "";
};

export const buildRefereeMatchRoute = (match, extraParams = {}) => {
  const id = trimText(match?._id ?? match?.id ?? match?.matchId);
  const normalized = normalizeMatchDisplay(match || {});
  const sideA = sideLabel(normalized, "A");
  const sideB = sideLabel(normalized, "B");
  const pairA = compactPair(normalized?.pairA, normalized);
  const pairB = compactPair(normalized?.pairB, normalized);
  const snapshot = {
    ...(id ? { _id: id, id, matchId: id } : {}),
    ...(normalized?.displayNameMode
      ? { displayNameMode: normalized.displayNameMode }
      : {}),
    tournament: {
      ...(normalized?.tournament?.eventType
        ? { eventType: normalized.tournament.eventType }
        : {}),
      ...(normalized?.tournament?.displayNameMode
        ? { displayNameMode: normalized.tournament.displayNameMode }
        : {}),
      ...(normalized?.tournament?.nameDisplayMode
        ? { nameDisplayMode: normalized.tournament.nameDisplayMode }
        : {}),
    },
    ...(pairA ? { pairA } : {}),
    ...(pairB ? { pairB } : {}),
    ...(sideA
      ? {
          __sideA: sideA,
          resolvedSideNameA: sideA,
          teamAName: sideA,
          pairAName: sideA,
        }
      : {}),
    ...(sideB
      ? {
          __sideB: sideB,
          resolvedSideNameB: sideB,
          teamBName: sideB,
          pairBName: sideB,
        }
      : {}),
  };

  return {
    pathname: `/match/${id}/referee`,
    params: {
      ...extraParams,
      ...(id ? { matchId: id } : {}),
      [SNAPSHOT_PARAM]: JSON.stringify(snapshot),
    },
  };
};

export const parseRefereeMatchSnapshotParam = (value) => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === "object"
      ? normalizeMatchDisplay(parsed)
      : null;
  } catch {
    return null;
  }
};

const pairHasNamedPlayer = (pair) =>
  Boolean(
    pair &&
      typeof pair === "object" &&
      (getPlayerDisplayName(pair?.player1, pair) ||
        getPlayerDisplayName(pair?.player2, pair) ||
        (Array.isArray(pair?.players) &&
          pair.players.some((player) => getPlayerDisplayName(player, pair))))
  );

const shouldUseSnapshotPair = (currentPair, snapshotPair) => {
  if (!snapshotPair) return false;
  if (!currentPair) return true;
  const currentName = getPairDisplayName(currentPair, currentPair);
  if (!pairHasNamedPlayer(currentPair) && pairHasNamedPlayer(snapshotPair)) {
    return true;
  }
  const snapshotName = getPairDisplayName(snapshotPair, snapshotPair);
  return isReferenceLabel(currentName) && isUsefulLabel(snapshotName);
};

const mergeSideNames = (next, snapshot, side) => {
  const key = side === "B" ? "B" : "A";
  const label = sideLabel(next, key) || sideLabel(snapshot, key);
  if (!label) return;
  next[`__side${key}`] = label;
  next[`resolvedSideName${key}`] = label;
  next[`team${key}Name`] = label;
  next[`pair${key}Name`] = label;
};

export const mergeRefereeMatchSnapshot = (match, snapshot) => {
  if (!snapshot) return match || null;
  if (!match) return snapshot;

  const normalizedMatch = normalizeMatchDisplay(match);
  const normalizedSnapshot = normalizeMatchDisplay(snapshot);
  const next = {
    ...normalizedSnapshot,
    ...normalizedMatch,
    tournament:
      normalizedMatch?.tournament || normalizedSnapshot?.tournament
        ? {
            ...(normalizedSnapshot?.tournament || {}),
            ...(normalizedMatch?.tournament || {}),
          }
        : normalizedMatch?.tournament,
  };

  if (shouldUseSnapshotPair(normalizedMatch?.pairA, normalizedSnapshot?.pairA)) {
    next.pairA = normalizedSnapshot.pairA;
  }
  if (shouldUseSnapshotPair(normalizedMatch?.pairB, normalizedSnapshot?.pairB)) {
    next.pairB = normalizedSnapshot.pairB;
  }

  mergeSideNames(next, normalizedSnapshot, "A");
  mergeSideNames(next, normalizedSnapshot, "B");

  return normalizeMatchDisplay(next, normalizedSnapshot);
};
