const EMPTY_VALUES = new Set(["", "null", "undefined", "nan"]);

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const unwrapPayload = (raw) => {
  if (!isObject(raw)) return raw ?? {};
  return raw.data ?? raw.result ?? raw.payload ?? raw;
};

export const toPositiveNumber = (value) => {
  if (value === null || value === undefined) return null;
  if (isObject(value)) return null;

  const normalized = String(value).trim().replace(",", ".");
  if (EMPTY_VALUES.has(normalized.toLowerCase())) return null;

  const number = Number(normalized);
  return Number.isFinite(number) && number > 0 ? number : null;
};

export const isValidRankNo = (value) => toPositiveNumber(value) !== null;

export const getRankNoFromPayload = (raw) => {
  const payload = unwrapPayload(raw);
  const rankObject = isObject(payload?.rank) ? payload.rank : null;
  const rankingObject = isObject(payload?.ranking) ? payload.ranking : null;

  const candidates = [
    payload?.rankNo,
    payload?.rank_no,
    payload?.rankNumber,
    payload?.rank_number,
    payload?.rankingNo,
    payload?.ranking_no,
    payload?.position,
    payload?.positionNo,
    payload?.no,
    payload?.order,
    payload?.place,
    payload?.myRank,
    payload?.overallRank,
    rankObject?.rankNo,
    rankObject?.rank_no,
    rankObject?.rankNumber,
    rankObject?.rank_number,
    rankObject?.position,
    rankObject?.no,
    rankObject?.order,
    rankObject?.place,
    rankingObject?.rankNo,
    rankingObject?.rank_no,
    rankingObject?.rankNumber,
    rankingObject?.rank_number,
    rankingObject?.rank,
    rankingObject?.position,
    rankingObject?.no,
    rankingObject?.order,
    rankingObject?.place,
    !isObject(payload?.rank) ? payload?.rank : null,
    !isObject(payload?.ranking) ? payload?.ranking : null,
  ];

  for (const candidate of candidates) {
    const rankNo = toPositiveNumber(candidate);
    if (rankNo !== null) return rankNo;
  }

  return null;
};

export const getRankTotalFromPayload = (raw) => {
  const payload = unwrapPayload(raw);
  const rankObject = isObject(payload?.rank) ? payload.rank : null;
  const rankingObject = isObject(payload?.ranking) ? payload.ranking : null;

  return (
    toPositiveNumber(payload?.rankTotal) ??
    toPositiveNumber(payload?.totalRank) ??
    toPositiveNumber(payload?.total) ??
    toPositiveNumber(rankObject?.rankTotal) ??
    toPositiveNumber(rankObject?.totalRank) ??
    toPositiveNumber(rankObject?.total) ??
    toPositiveNumber(rankingObject?.rankTotal) ??
    toPositiveNumber(rankingObject?.totalRank) ??
    toPositiveNumber(rankingObject?.total) ??
    null
  );
};

export const getBestRatingScore = (...sources) => {
  const values = [];

  sources.forEach((source) => {
    const payload = unwrapPayload(source);
    if (!isObject(payload)) return;

    const rankObject = isObject(payload.rank) ? payload.rank : null;
    const rankingObject = isObject(payload.ranking) ? payload.ranking : null;
    const ratingObject = isObject(payload.rating) ? payload.rating : null;
    const scoreObject = isObject(payload.score) ? payload.score : null;

    values.push(
      payload.ratingDouble,
      payload.ratingSingle,
      payload.double,
      payload.single,
      payload.mix,
      payload.score,
      payload.points,
      payload.point,
      rankObject?.ratingDouble,
      rankObject?.ratingSingle,
      rankObject?.double,
      rankObject?.single,
      rankObject?.mix,
      rankObject?.score,
      rankObject?.points,
      rankingObject?.ratingDouble,
      rankingObject?.ratingSingle,
      rankingObject?.double,
      rankingObject?.single,
      rankingObject?.mix,
      rankingObject?.score,
      rankingObject?.points,
      ratingObject?.double,
      ratingObject?.single,
      ratingObject?.mix,
      ratingObject?.score,
      scoreObject?.double,
      scoreObject?.single,
      scoreObject?.mix,
      scoreObject?.value,
    );
  });

  const scores = values
    .map(toPositiveNumber)
    .filter((value) => value !== null);

  return scores.length ? Math.max(...scores) : null;
};

export const formatRatingScore = (value) => {
  const score = toPositiveNumber(value);
  if (score === null) return "";
  if (score < 10) return score.toFixed(2);
  if (score < 100) return score.toFixed(1);
  return String(Math.round(score * 10) / 10);
};
