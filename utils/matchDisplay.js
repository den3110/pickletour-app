const trim = (value) => (value && String(value).trim()) || "";

export const resolveDisplayMode = (...sources) => {
  for (const source of sources) {
    const raw =
      source?.displayNameMode ||
      source?.nameDisplayMode ||
      source?.tournament?.displayNameMode ||
      source?.tournament?.nameDisplayMode;
    if (raw === "fullName") return "fullName";
    if (raw === "nickname") return "nickname";
  }
  return "nickname";
};

export const getPlayerNickname = (player) =>
  trim(player?.nickname) ||
  trim(player?.nickName) ||
  trim(player?.nick) ||
  trim(player?.user?.nickname) ||
  trim(player?.user?.nickName) ||
  trim(player?.user?.nick) ||
  "";

export const getPlayerFullName = (player) =>
  trim(player?.fullName) ||
  trim(player?.name) ||
  trim(player?.user?.fullName) ||
  trim(player?.user?.name) ||
  trim(player?.shortName) ||
  getPlayerNickname(player);

export const getPlayerDisplayName = (player, source) => {
  if (!player) return "";
  const mode = resolveDisplayMode(player, source);
  return (
    trim(player?.displayName) ||
    (mode === "fullName"
      ? getPlayerFullName(player) || getPlayerNickname(player)
      : getPlayerNickname(player) ||
        trim(player?.shortName) ||
        getPlayerFullName(player)) ||
    ""
  );
};

export const normalizePlayerDisplay = (player, source) => {
  if (!player) return null;
  if (typeof player !== "object") {
    return {
      _id: player,
      nickname: "",
      nickName: "",
      fullName: "",
      name: "",
      displayName: "",
      displayNameMode: resolveDisplayMode(source),
    };
  }

  const mode = resolveDisplayMode(player, source);
  const nickname = getPlayerNickname(player);
  const fullName = getPlayerFullName(player);
  const displayName = getPlayerDisplayName(player, source);

  return {
    ...player,
    _id: player?._id ?? player?.id ?? player,
    nickname,
    nickName: nickname || player?.nickName || "",
    fullName,
    name: fullName,
    displayName,
    displayNameMode: mode,
  };
};

export const getPairDisplayName = (pair, source) => {
  if (!pair) return "";
  const mode = resolveDisplayMode(pair, source);
  const player1 = normalizePlayerDisplay(pair?.player1, mode);
  const player2 = normalizePlayerDisplay(pair?.player2, mode);
  const joined = [player1?.displayName, player2?.displayName]
    .filter(Boolean)
    .join(" / ");

  return (
    trim(pair?.displayName) ||
    joined ||
    trim(pair?.teamName) ||
    trim(pair?.label) ||
    trim(pair?.title) ||
    trim(pair?.name) ||
    ""
  );
};

export const normalizePairDisplay = (pair, source) => {
  if (!pair || typeof pair !== "object") return pair;
  const mode = resolveDisplayMode(pair, source);
  const player1 = normalizePlayerDisplay(pair?.player1, mode);
  const player2 = normalizePlayerDisplay(pair?.player2, mode);
  return {
    ...pair,
    _id: pair?._id ?? pair?.id ?? pair,
    player1,
    player2,
    displayName: getPairDisplayName({ ...pair, player1, player2 }, mode),
    displayNameMode: mode,
  };
};

const normalizeTeamDisplay = (team, source) => {
  if (!team || typeof team !== "object") return team;
  const mode = resolveDisplayMode(team, source);
  const players = Array.isArray(team?.players)
    ? team.players.map((player) => normalizePlayerDisplay(player, mode))
    : [];
  const displayName =
    trim(team?.displayName) ||
    trim(team?.name) ||
    players.map((player) => player?.displayName).filter(Boolean).join(" / ") ||
    trim(team?.teamName) ||
    trim(team?.label) ||
    "";
  return {
    ...team,
    players,
    name: displayName || team?.name || "",
    displayName,
    displayNameMode: mode,
  };
};

const normalizeRefEntity = (entity) => {
  if (!entity || typeof entity !== "object") return entity;
  return {
    ...entity,
    _id: entity?._id ?? entity?.id ?? entity,
  };
};

export const normalizeMatchDisplay = (match, fallbackSource = null) => {
  if (!match || typeof match !== "object") return match;

  const mode = resolveDisplayMode(match, fallbackSource);
  const hasGameScores = Array.isArray(match?.gameScores);
  const hasScores = Array.isArray(match?.scores);
  const scoreList = hasGameScores ? match.gameScores : hasScores ? match.scores : undefined;
  const matchIdValue =
    match?._id ?? match?.id ?? match?.matchId ?? fallbackSource?._id;
  const liveVersion = match?.liveVersion ?? match?.version;

  const tournament =
    match?.tournament && typeof match.tournament === "object"
      ? {
          ...match.tournament,
          _id: match.tournament?._id ?? match.tournament?.id ?? match.tournament,
          nameDisplayMode: mode,
          displayNameMode: mode,
        }
      : match?.tournament;

  const pairA = normalizePairDisplay(match?.pairA, match);
  const pairB = normalizePairDisplay(match?.pairB, match);

  const next = {
    ...match,
    tournament,
    pairA,
    pairB,
    teams:
      match?.teams && typeof match.teams === "object"
        ? {
            ...match.teams,
            A: normalizeTeamDisplay(match.teams?.A, mode),
            B: normalizeTeamDisplay(match.teams?.B, mode),
          }
        : match?.teams,
    court: normalizeRefEntity(match?.court),
    bracket: normalizeRefEntity(match?.bracket),
    previousA: normalizeRefEntity(match?.previousA),
    previousB: normalizeRefEntity(match?.previousB),
    nextMatch: normalizeRefEntity(match?.nextMatch),
    displayNameMode: mode,
  };

  if (matchIdValue) {
    next._id = matchIdValue;
    next.matchId = String(matchIdValue);
  }
  if (Array.isArray(scoreList)) next.gameScores = scoreList;
  if (match?.scoreText != null || match?.score_text != null) {
    next.scoreText = match?.scoreText ?? match?.score_text;
  }
  if (match?.status != null || match?.state != null || match?.match_status != null) {
    next.status = match?.status ?? match?.state ?? match?.match_status;
  }
  if (match?.updatedAt != null || match?.updated_at != null) {
    next.updatedAt = match?.updatedAt ?? match?.updated_at;
  }
  if (liveVersion != null) {
    next.liveVersion = liveVersion;
    next.version = liveVersion;
  }

  return next;
};

export const extractMatchPayload = (raw) =>
  raw?.data ?? raw?.match ?? raw?.snapshot ?? raw;

export const getMatchPayloadId = (raw) => {
  const payload = extractMatchPayload(raw);
  return String(
    payload?._id ??
      payload?.id ??
      raw?.matchId ??
      raw?.id ??
      raw?._id ??
      payload?.matchId ??
      ""
  );
};

export const isLightweightMatchPayload = (raw) => {
  const payload = extractMatchPayload(raw);
  if (!payload || typeof payload !== "object") return true;

  const informativeKeys = Object.keys(payload).filter((key) => {
    if (payload[key] == null) return false;
    return ![
      "_id",
      "id",
      "matchId",
      "type",
      "kind",
      "source",
      "at",
      "ts",
      "timestamp",
    ].includes(key);
  });

  return informativeKeys.length === 0;
};

export const isNewerOrEqualMatchPayload = (current, incoming) => {
  const next = normalizeMatchDisplay(incoming, current);
  const currentVersion = Number(
    current?.liveVersion ?? current?.version ?? Number.NaN
  );
  const nextVersion = Number(next?.liveVersion ?? next?.version ?? Number.NaN);

  if (Number.isFinite(currentVersion) && Number.isFinite(nextVersion)) {
    return nextVersion >= currentVersion;
  }

  const currentTime = Date.parse(current?.updatedAt ?? current?.liveAt ?? 0);
  const nextTime = Date.parse(next?.updatedAt ?? next?.liveAt ?? 0);

  if (Number.isFinite(currentTime) && Number.isFinite(nextTime)) {
    return nextTime >= currentTime;
  }

  return true;
};

const mergePlayer = (current, incoming, source) => {
  if (incoming == null) return normalizePlayerDisplay(current, source);
  if (typeof incoming !== "object") return normalizePlayerDisplay(incoming, source);
  return normalizePlayerDisplay({ ...(current || {}), ...incoming }, source);
};

const mergePair = (current, incoming, source) => {
  if (incoming == null) return normalizePairDisplay(current, source);
  if (typeof incoming !== "object") return incoming;
  return normalizePairDisplay(
    {
      ...(current || {}),
      ...incoming,
      player1: mergePlayer(current?.player1, incoming?.player1, source),
      player2: mergePlayer(current?.player2, incoming?.player2, source),
    },
    source
  );
};

export const mergeMatchPayload = (current, raw, fallbackSource = null) => {
  const incomingRaw = extractMatchPayload(raw);
  if (!incomingRaw || typeof incomingRaw !== "object") return current || null;
  const incoming = normalizeMatchDisplay(incomingRaw, fallbackSource || current);
  if (!current) return incoming;

  const merged = {
    ...current,
    ...incoming,
    tournament:
      incoming?.tournament && typeof incoming.tournament === "object"
        ? { ...(current?.tournament || {}), ...incoming.tournament }
        : current?.tournament,
    bracket:
      incoming?.bracket && typeof incoming.bracket === "object"
        ? { ...(current?.bracket || {}), ...incoming.bracket }
        : current?.bracket,
    court:
      incoming?.court && typeof incoming.court === "object"
        ? { ...(current?.court || {}), ...incoming.court }
        : incoming?.court ?? current?.court,
    previousA:
      incoming?.previousA && typeof incoming.previousA === "object"
        ? { ...(current?.previousA || {}), ...incoming.previousA }
        : incoming?.previousA ?? current?.previousA,
    previousB:
      incoming?.previousB && typeof incoming.previousB === "object"
        ? { ...(current?.previousB || {}), ...incoming.previousB }
        : incoming?.previousB ?? current?.previousB,
    nextMatch:
      incoming?.nextMatch && typeof incoming.nextMatch === "object"
        ? { ...(current?.nextMatch || {}), ...incoming.nextMatch }
        : incoming?.nextMatch ?? current?.nextMatch,
    pairA: mergePair(current?.pairA, incoming?.pairA, incoming),
    pairB: mergePair(current?.pairB, incoming?.pairB, incoming),
    teams:
      incoming?.teams && typeof incoming.teams === "object"
        ? {
            ...(current?.teams || {}),
            ...incoming.teams,
            A: incoming.teams?.A
              ? normalizeTeamDisplay(
                  { ...(current?.teams?.A || {}), ...incoming.teams.A },
                  incoming
                )
              : current?.teams?.A,
            B: incoming.teams?.B
              ? normalizeTeamDisplay(
                  { ...(current?.teams?.B || {}), ...incoming.teams.B },
                  incoming
                )
              : current?.teams?.B,
          }
        : current?.teams,
  };

  return normalizeMatchDisplay(merged, fallbackSource || current);
};
