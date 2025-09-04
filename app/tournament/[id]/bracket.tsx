// src/screens/tournament/TournamentBracket.native.js
import React, {
  useMemo,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Modal,
  Pressable,
} from "react-native";
import PropTypes from "prop-types";
import { useRoute } from "@react-navigation/native";

// ====== RTK Query (điều chỉnh alias cho phù hợp dự án RN của bạn) ======
import {
  useGetTournamentQuery,
  useListTournamentBracketsQuery,
  useListTournamentMatchesQuery,
} from "@/slices/tournamentsApiSlice";

import { useSocket } from "@/context/SocketContext";
import ResponsiveMatchViewer from "@/components/match/ResponsiveMatchViewer";

/* ===================== Helpers (names) ===================== */
// (giữ nguyên các helper cũ để không ảnh hưởng nơi khác nếu còn dùng)
export const safePairName = (pair, eventType = "double") => {
  if (!pair) return "—";
  const p1 =
    pair.player1?.fullName ||
    pair.player1?.name ||
    pair.player1?.nickname ||
    "N/A";
  const p2 =
    pair.player2?.fullName ||
    pair.player2?.name ||
    pair.player2?.nickname ||
    "";
  const isSingle = String(eventType).toLowerCase() === "single";
  if (isSingle) return p1;
  return p2 ? `${p1} & ${p2}` : p1;
};

export const preferName = (p) =>
  (p?.fullName && String(p.fullName).trim()) ||
  (p?.name && String(p.name).trim()) ||
  (p?.nickname && String(p.nickname).trim()) ||
  "N/A";

export const preferNick = (p) =>
  (p?.nickname && String(p.nickname).trim()) ||
  (p?.nickName && String(p.nickName).trim()) ||
  (p?.nick && String(p.nick).trim()) ||
  "";

// === NEW: luôn ưu tiên chỉ hiện nickname ===
export const safePairNick = (pair, eventType = "double") => {
  if (!pair) return "—";
  const n1 = preferNick(pair.player1) || "N/A";
  const n2 = preferNick(pair.player2) || "";
  const isSingle = String(eventType).toLowerCase() === "single";
  return isSingle ? n1 : n2 ? `${n1} & ${n2}` : n1;
};

export const pairLabelNickOnly = (pair, eventType = "double") =>
  safePairNick(pair, eventType);

// (giữ để backward-compat ở file khác nếu có import)
export const nameWithNick = (p) => {
  if (!p) return "—";
  const nm = preferName(p);
  const nk = preferNick(p);
  if (!nk) return nm;
  return nm.toLowerCase() === nk.toLowerCase() ? nm : `${nm} (${nk})`;
};
export const pairLabelWithNick = (pair, eventType = "double") => {
  if (!pair) return "—";
  const isSingle = String(eventType).toLowerCase() === "single";
  const a = nameWithNick(pair.player1);
  if (isSingle) return a;
  const b = pair.player2 ? nameWithNick(pair.player2) : "";
  return b ? `${a} & ${b}` : a;
};

/* ----- seed label helpers ----- */
export const seedLabel = (seed) => {
  if (!seed || !seed.type) return "Chưa có đội";
  if (seed.label) return seed.label;

  switch (seed.type) {
    case "groupRank": {
      const st = seed.ref?.stage ?? seed.ref?.stageIndex ?? "?";
      const g = seed.ref?.groupCode;
      const r = seed.ref?.rank ?? "?";
      return g ? `V${st}-B${g}-#${r}` : `V${st}-#${r}`;
    }
    case "stageMatchWinner": {
      const r = seed.ref?.round ?? "?";
      const t = (seed.ref?.order ?? -1) + 1;
      return `W-V${r}-T${t}`;
    }
    case "stageMatchLoser": {
      const r = seed.ref?.round ?? "?";
      const t = (seed.ref?.order ?? -1) + 1;
      return `L-V${r}-T${t}`;
    }
    case "matchWinner": {
      const r = seed.ref?.round ?? "?";
      const t = (seed.ref?.order ?? -1) + 1;
      return `W-R${r} #${t}`;
    }
    case "matchLoser": {
      const r = seed.ref?.round ?? "?";
      const t = (seed.ref?.order ?? -1) + 1;
      return `L-R${r} #${t}`;
    }
    case "bye":
      return "BYE";
    case "registration":
      return "Registration";
    default:
      return "TBD";
  }
};

export const depLabel = (prev) => {
  if (!prev) return "TBD";
  const r = prev.round ?? "?";
  const idx = (prev.order ?? 0) + 1;
  return `Winner of R${r} #${idx}`;
};

export const resultLabel = (m) => {
  if (m?.status === "finished") {
    if (m?.winner === "A") return "Đội A thắng";
    if (m?.winner === "B") return "Đội B thắng";
    return "Hoà/Không xác định";
  }
  if (m?.status === "live") return "Đang diễn ra";
  return "Chưa diễn ra";
};

const ceilPow2 = (n) => Math.pow(2, Math.ceil(Math.log2(Math.max(1, n || 1))));
const readBracketScale = (br) => {
  const teamsFromRoundKey = (k) => {
    if (!k) return 0;
    const up = String(k).toUpperCase();
    if (up === "F") return 2;
    if (up === "SF") return 4;
    if (up === "QF") return 8;
    if (/^R\d+$/i.test(up)) return parseInt(up.slice(1), 10);
    return 0;
  };
  const fromKey =
    teamsFromRoundKey(br?.ko?.startKey) ||
    teamsFromRoundKey(br?.prefill?.roundKey);

  const fromPrefillPairs = Array.isArray(br?.prefill?.pairs)
    ? br.prefill.pairs.length * 2
    : 0;
  const fromPrefillSeeds = Array.isArray(br?.prefill?.seeds)
    ? br.prefill.seeds.length * 2
    : 0;

  const cands = [
    br?.drawScale,
    br?.targetScale,
    br?.maxSlots,
    br?.capacity,
    br?.size,
    br?.scale,
    br?.meta?.drawSize,
    br?.meta?.scale,
    fromKey,
    fromPrefillPairs,
    fromPrefillSeeds,
  ]
    .map((x) => Number(x))
    .filter((x) => Number.isFinite(x) && x >= 2);

  if (!cands.length) return 0;
  return ceilPow2(Math.max(...cands));
};

/* ===================== Champion gate ===================== */
function computeChampionGate(allMatches) {
  const M = (allMatches || []).slice();
  if (!M.length) return { allowed: false, matchId: null, pair: null };

  const byR = new Map();
  for (const m of M) {
    const r = Number(m.round || 1);
    byR.set(r, (byR.get(r) || 0) + 1);
  }
  const rounds = Array.from(byR.keys()).sort((a, b) => a - b);
  if (!rounds.length) return { allowed: false, matchId: null, pair: null };

  const rmin = rounds[0];
  const rmax = rounds[rounds.length - 1];

  for (let r = rmin; r <= rmax; r++)
    if (!byR.get(r)) return { allowed: false, matchId: null, pair: null };

  const c0 = byR.get(rmin) || 0;
  if (rounds.length === 1) {
    if (c0 !== 1) return { allowed: false, matchId: null, pair: null };
    const finals = M.filter((m) => Number(m.round || 1) === rmax);
    const fm = finals.length === 1 ? finals[0] : null;
    const done =
      fm &&
      String(fm.status || "").toLowerCase() === "finished" &&
      (fm.winner === "A" || fm.winner === "B");
    const champion = done ? (fm.winner === "A" ? fm.pairA : fm.pairB) : null;
    return {
      allowed: !!done,
      matchId: done ? fm._id || null : null,
      pair: champion,
    };
  }

  if (c0 < 2) return { allowed: false, matchId: null, pair: null };

  let exp = c0;
  for (let r = rmin + 1; r <= rmax; r++) {
    const cr = byR.get(r);
    const maxAllowed = Math.ceil(exp / 2);
    if (!Number.isFinite(cr) || cr < 1 || cr > maxAllowed) {
      return { allowed: false, matchId: null, pair: null };
    }
    exp = cr;
  }
  if (byR.get(rmax) !== 1) return { allowed: false, matchId: null, pair: null };

  const finals = M.filter((m) => Number(m.round || 1) === rmax);
  const fm = finals.length === 1 ? finals[0] : null;
  if (
    !fm ||
    String(fm.status || "").toLowerCase() !== "finished" ||
    !fm.winner
  ) {
    return { allowed: false, matchId: null, pair: null };
  }
  const champion = fm.winner === "A" ? fm.pairA : fm.pairB;
  return { allowed: true, matchId: fm._id || null, pair: champion };
}

/* ===================== Group helpers ===================== */
function buildGroupIndex(bracket) {
  const byKey = new Map();
  const byRegId = new Map();
  for (const g of bracket?.groups || []) {
    const key = String(g.name || g.code || g._id || "").trim() || "—";
    const label = key;
    const regSet = new Set(g.regIds?.map(String) || []);
    byKey.set(key, { label, regSet });
    regSet.forEach((rid) => byRegId.set(String(rid), key));
  }
  return { byKey, byRegId };
}
function lastGameScoreLocal(gameScores) {
  if (!Array.isArray(gameScores) || !gameScores.length) return { a: 0, b: 0 };
  return gameScores[gameScores.length - 1] || { a: 0, b: 0 };
}
function countGamesWonLocal(gameScores) {
  let A = 0,
    B = 0;
  for (const g of gameScores || []) {
    if ((g?.a ?? 0) > (g?.b ?? 0)) A++;
    else if ((g?.b ?? 0) > (g?.a ?? 0)) B++;
  }
  return { A, B };
}
function sumPointsLocal(gameScores) {
  let a = 0,
    b = 0;
  for (const g of gameScores || []) {
    a += Number(g?.a ?? 0);
    b += Number(g?.b ?? 0);
  }
  return { a, b };
}

function computeGroupTablesForBracket(bracket, matches, eventType) {
  const { byKey, byRegId } = buildGroupIndex(bracket);
  const PWIN = bracket?.config?.roundRobin?.points?.win ?? 3;
  const PDRAW = bracket?.config?.roundRobin?.points?.draw ?? 1;
  const PLOSS = bracket?.config?.roundRobin?.points?.loss ?? 0;

  const stats = new Map();

  const ensureRow = (key, regId, pairObj) => {
    if (!stats.has(key)) stats.set(key, new Map());
    const g = stats.get(key);
    if (!g.has(regId)) {
      g.set(regId, {
        id: regId,
        pair: pairObj || null,
        played: 0,
        win: 0,
        draw: 0,
        loss: 0,
        sf: 0,
        sa: 0,
        pf: 0,
        pa: 0,
        setDiff: 0,
        pointDiff: 0,
        pts: 0,
      });
    } else if (pairObj && !g.get(regId).pair) {
      g.get(regId).pair = pairObj;
    }
    return g.get(regId);
  };

  (matches || []).forEach((m) => {
    const aId = m.pairA?._id && String(m.pairA._id);
    const bId = m.pairB?._id && String(m.pairB._id);
    if (!aId || !bId) return;

    const ga = byRegId.get(aId);
    const gb = byRegId.get(bId);
    if (!ga || !gb || ga !== gb) return;

    const rowA = ensureRow(ga, aId, m.pairA);
    const rowB = ensureRow(gb, bId, m.pairB);

    const finished = String(m.status || "").toLowerCase() === "finished";
    if (!finished) return;

    const winner = String(m.winner || "").toUpperCase();
    const gw = countGamesWonLocal(m.gameScores || []);
    const pt = sumPointsLocal(m.gameScores || []);

    rowA.played += 1;
    rowB.played += 1;

    rowA.sf += gw.A;
    rowA.sa += gw.B;
    rowB.sf += gw.B;
    rowB.sa += gw.A;

    rowA.pf += pt.a;
    rowA.pa += pt.b;
    rowB.pf += pt.b;
    rowB.pa += pt.a;

    if (winner === "A") {
      rowA.win += 1;
      rowB.loss += 1;
      rowA.pts += PWIN;
      rowB.pts += PLOSS;
    } else if (winner === "B") {
      rowB.win += 1;
      rowA.loss += 1;
      rowB.pts += PWIN;
      rowA.pts += PLOSS;
    } else {
      rowA.draw += 1;
      rowB.draw += 1;
      rowA.pts += PDRAW;
      rowB.pts += PDRAW;
    }

    rowA.setDiff = rowA.sf - rowA.sa;
    rowB.setDiff = rowB.sf - rowB.sa;
    rowA.pointDiff = rowA.pf - rowA.pa;
    rowB.pointDiff = rowB.pf - rowB.pa;
  });

  const cmpForGroup = () => (x, y) => {
    if (y.pts !== x.pts) return y.pts - x.pts;
    if (y.setDiff !== x.setDiff) return y.setDiff - x.setDiff;
    if (y.pointDiff !== x.pointDiff) return y.pointDiff - x.pointDiff;
    const nx = safePairNick(x.pair, eventType) || "";
    const ny = safePairNick(y.pair, eventType) || "";
    return nx.localeCompare(ny);
  };

  const out = [];
  for (const [key, { label, regSet }] of byKey.entries()) {
    const rowsMap = stats.get(key) || new Map();
    const filteredRows = Array.from(rowsMap.values()).filter((r) =>
      regSet.has(String(r.id))
    );
    filteredRows.forEach((r) => {
      r.setDiff = r.sf - r.sa;
      r.pointDiff = r.pf - r.pa;
    });
    const rows = filteredRows.sort(cmpForGroup(key));
    out.push({ key, label, rows });
  }

  return {
    groups: out,
    points: {
      win: bracket?.config?.roundRobin?.points?.win ?? 3,
      draw: bracket?.config?.roundRobin?.points?.draw ?? 1,
      loss: bracket?.config?.roundRobin?.points?.loss ?? 0,
    },
  };
}

/* ===== BXH + Matches Fallback cho vòng bảng ===== */
function rrPairsDefaultOrder(n) {
  if (n === 3)
    return [
      [1, 2],
      [2, 3],
      [3, 1],
    ];
  const pairs = [];
  for (let i = 1; i <= n - 1; i++) {
    for (let j = i + 1; j <= n; j++) pairs.push([i, j]);
  }
  return pairs;
}
function buildGroupStarts(bracket) {
  const starts = new Map();
  let acc = 1;
  const groups = bracket?.groups || [];
  const sizeOf = (g) => {
    const actual = Array.isArray(g?.regIds) ? g.regIds.length : 0;
    const expected =
      Number(g?.expectedSize ?? bracket?.config?.roundRobin?.groupSize ?? 0) ||
      0;
    return actual || expected || 0;
  };
  groups.forEach((g, idx) => {
    const key = String(g.name || g.code || g._id || String(idx + 1));
    starts.set(key, acc);
    acc += sizeOf(g);
  });
  return { starts, sizeOf };
}
function formatTime(ts) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString("vi-VN");
  } catch {
    return "";
  }
}
function pickGroupKickoffTime(m) {
  if (!m) return null;
  const st = String(m.status || "").toLowerCase();
  if (st === "live" || st === "finished") {
    return m.startedAt || m.scheduledAt || m.assignedAt || null;
  }
  return m.scheduledAt || m.assignedAt || null;
}
function scoreLabel(m) {
  if (!m) return "";
  const st = String(m.status || "").toLowerCase();
  if (st === "finished") {
    const gw = countGamesWonLocal(m.gameScores || []);
    if (gw.A || gw.B) return `${gw.A}-${gw.B}`;
    if (Number.isFinite(m.scoreA) && Number.isFinite(m.scoreB))
      return `${m.scoreA}-${m.scoreB}`;
    return "Kết thúc";
  }
  if (st === "live") {
    const g = lastGameScoreLocal(m.gameScores || []);
    if (Number.isFinite(g.a) && Number.isFinite(g.b))
      return `${g.a}-${g.b} (live)`;
    return "LIVE";
  }
  return "";
}
function buildGroupPlaceholderMatches({
  stageNo,
  groupIndexOneBased,
  groupKey,
  teamStartIndex,
  teamCount,
}) {
  const pairs = rrPairsDefaultOrder(teamCount);
  return pairs.map(([i, j], idx) => {
    const nameA = `Đội ${teamStartIndex + (i - 1)}`;
    const nameB = `Đội ${teamStartIndex + (j - 1)}`;
    const code = `#V${stageNo}-B${groupIndexOneBased}#${idx + 1}`;
    return {
      _id: `pf-${groupKey}-${idx + 1}`,
      isPlaceholder: true,
      code,
      aName: nameA,
      bName: nameB,
      time: "",
      court: "",
      score: "",
    };
  });
}
function buildStandingsWithFallback(bracket, matchesReal, eventType) {
  const real = computeGroupTablesForBracket(
    bracket,
    matchesReal,
    eventType
  ) || {
    groups: [],
    points: { win: 3, draw: 1, loss: 0 },
  };
  const mapReal = new Map((real.groups || []).map((g) => [String(g.key), g]));
  const { starts, sizeOf } = buildGroupStarts(bracket);

  const groups = (bracket?.groups || []).map((g, idx) => {
    const key = String(g.name || g.code || g._id || String(idx + 1));
    const existing = mapReal.get(key);
    if (existing && existing.rows?.length) return existing;

    const size = sizeOf(g);
    const start = starts.get(key) || 1;
    const rows = Array.from({ length: size }, (_, j) => ({
      id: `pf-${key}-${j + 1}`,
      pair: null,
      name: `Đội ${start + j}`,
      pts: 0,
      setDiff: 0,
      pointDiff: 0,
      rank: "—",
    }));
    return { key, label: key, rows };
  });

  return { groups, points: real.points };
}

/* ===================== KO / RoundElim builders ===================== */
const koRoundTitle = (matchesCount) => {
  const teams = matchesCount * 2;
  if (matchesCount === 1) return "Chung kết";
  if (matchesCount === 2) return "Bán kết";
  if (matchesCount === 4) return "Tứ kết";
  return `Vòng ${teams} đội`;
};
function buildRoundsFromPrefill(prefill, koMeta) {
  const useSeeds =
    prefill && Array.isArray(prefill.seeds) && prefill.seeds.length > 0;
  const usePairs =
    !useSeeds && Array.isArray(prefill?.pairs) && prefill.pairs.length > 0;
  if (!useSeeds && !usePairs) return [];

  const firstCount = useSeeds ? prefill.seeds.length : prefill.pairs.length;
  const totalRounds =
    (koMeta && Number(koMeta.rounds)) ||
    Math.ceil(Math.log2(Math.max(2, firstCount * 2)));

  const rounds = [];
  let cnt = firstCount;
  for (let r = 1; r <= totalRounds && cnt >= 1; r++) {
    const seeds = Array.from({ length: cnt }, (_, i) => {
      if (r === 1) {
        if (useSeeds) {
          const s = prefill.seeds[i] || {};
          const nameA = seedLabel(s.A);
          const nameB = seedLabel(s.B);
          return {
            id: `pf-${r}-${i}`,
            __match: null,
            __round: r,
            teams: [{ name: nameA }, { name: nameB }],
          };
        } else {
          const p = prefill.pairs[i] || {};
          const nameA = p?.a?.name || "Chưa có đội";
          const nameB = p?.b?.name || "Chưa có đội";
          return {
            id: `pf-${r}-${i}`,
            __match: null,
            __round: r,
            teams: [{ name: nameA }, { name: nameB }],
          };
        }
      }
      return {
        id: `pf-${r}-${i}`,
        __match: null,
        __round: r,
        teams: [{ name: "Chưa có đội" }, { name: "Chưa có đội" }],
      };
    });

    rounds.push({
      title: koRoundTitle(cnt),
      seeds,
    });
    cnt = Math.floor(cnt / 2);
  }
  const last = rounds[rounds.length - 1];
  if (last) last.seeds = last.seeds.map((s) => ({ ...s, __lastCol: true }));
  return rounds;
}
function buildEmptyRoundsByScale(scale /* 2^n */) {
  const rounds = [];
  let matches = Math.max(1, Math.floor(scale / 2));
  let r = 1;
  while (matches >= 1) {
    const seeds = Array.from({ length: matches }, (_, i) => ({
      id: `placeholder-${r}-${i}`,
      __match: null,
      __round: r,
      teams: [{ name: "Chưa có đội" }, { name: "Chưa có đội" }],
    }));
    rounds.push({
      title: koRoundTitle(matches),
      seeds,
    });
    matches = Math.floor(matches / 2);
    r += 1;
  }
  const last = rounds[rounds.length - 1];
  if (last) last.seeds = last.seeds.map((s) => ({ ...s, __lastCol: true }));
  return rounds;
}
function buildRoundElimRounds(bracket, brMatches, resolveSideLabel) {
  const r1FromPrefill =
    Array.isArray(bracket?.prefill?.seeds) && bracket.prefill.seeds.length
      ? bracket.prefill.seeds.length
      : 0;
  const r1FromMatches = (brMatches || []).filter(
    (m) => (m.round || 1) === 1
  ).length;
  const r1Pairs = Math.max(1, r1FromPrefill || r1FromMatches || 1);

  let k =
    Number(bracket?.meta?.maxRounds) ||
    Number(bracket?.config?.roundElim?.maxRounds) ||
    0;
  if (!k) {
    const maxR =
      Math.max(
        0,
        ...((brMatches || []).map((m) => Number(m.round || 1)) || [])
      ) || 1;
    k = Math.max(1, maxR);
  }

  const matchesInRound = (r) => {
    if (r === 1) return r1Pairs;
    let prev = r1Pairs;
    for (let i = 2; i <= r; i++) prev = Math.floor(prev / 2) || 1;
    return Math.max(1, prev);
  };

  const rounds = [];
  for (let r = 1; r <= k; r++) {
    const need = matchesInRound(r);
    const seeds = Array.from({ length: need }, (_, i) => ({
      id: `re-${r}-${i}`,
      __match: null,
      __round: r,
      teams: [{ name: "Chưa có đội" }, { name: "Chưa có đội" }],
    }));

    const ms = (brMatches || [])
      .filter((m) => (m.round || 1) === r)
      .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));

    ms.forEach((m, idx) => {
      let i = Number.isInteger(m.order)
        ? m.order
        : seeds.findIndex((s) => s.__match === null);
      if (i < 0 || i >= seeds.length) i = Math.min(idx, seeds.length - 1);

      seeds[i] = {
        id: m._id || `re-${r}-${i}`,
        __match: m,
        __round: r,
        teams: [
          { name: resolveSideLabel(m, "A") },
          { name: resolveSideLabel(m, "B") },
        ],
      };
    });

    rounds.push({ title: `Vòng ${r}`, seeds });
  }
  const last = rounds[rounds.length - 1];
  if (last) last.seeds = last.seeds.map((s) => ({ ...s, __lastCol: true }));
  return rounds;
}
function buildRoundsWithPlaceholders(
  brMatches,
  resolveSideLabel,
  { minRounds = 0, extendForward = true, expectedFirstRoundPairs = 0 } = {}
) {
  const real = (brMatches || [])
    .slice()
    .sort(
      (a, b) =>
        (a.round || 1) - (b.round || 1) || (a.order || 0) - (b.order || 0)
    );

  const roundsHave = Array.from(new Set(real.map((m) => m.round || 1))).sort(
    (a, b) => a - b
  );
  const lastRound = roundsHave.length ? Math.max(...roundsHave) : 1;

  let firstRound = roundsHave.length ? Math.min(...roundsHave) : 1;
  const haveColsInitial = roundsHave.length ? lastRound - firstRound + 1 : 1;
  if (minRounds && haveColsInitial < minRounds)
    firstRound = Math.max(1, lastRound - (minRounds - 1));

  const countByRoundReal = {};
  real.forEach((m) => {
    const r = m.round || 1;
    countByRoundReal[r] = (countByRoundReal[r] || 0) + 1;
  });

  const seedsCount = {};
  if (firstRound === 1 && expectedFirstRoundPairs > 0) {
    seedsCount[1] = Math.max(countByRoundReal[1] || 0, expectedFirstRoundPairs);
  } else if (countByRoundReal[lastRound]) {
    seedsCount[lastRound] = countByRoundReal[lastRound];
  } else {
    seedsCount[lastRound] = 1;
  }

  for (let r = lastRound - 1; r >= firstRound; r--) {
    seedsCount[r] = countByRoundReal[r] || (seedsCount[r + 1] || 1) * 2;
  }

  if (extendForward) {
    let cur = firstRound;
    if (firstRound !== 1 && seedsCount[1]) cur = 1;
    while ((seedsCount[cur] || 1) > 1) {
      const nxt = cur + 1;
      seedsCount[nxt] = Math.ceil((seedsCount[cur] || 1) / 2);
      cur = nxt;
    }
  }

  const roundNums = Object.keys(seedsCount)
    .map(Number)
    .sort((a, b) => a - b);
  const res = roundNums.map((r) => {
    const need = seedsCount[r];
    const seeds = Array.from({ length: need }, (_, i) => [
      { name: "Chưa có đội" },
      { name: "Chưa có đội" },
    ]).map((teams, i) => ({
      id: `placeholder-${r}-${i}`,
      __match: null,
      __round: r,
      teams,
    }));

    const ms = real
      .filter((m) => (m.round || 1) === r)
      .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));

    ms.forEach((m, idx) => {
      let i = Number.isInteger(m.order)
        ? m.order
        : seeds.findIndex((s) => s.__match === null);
      if (i < 0 || i >= seeds.length) i = Math.min(idx, seeds.length - 1);

      seeds[i] = {
        id: m._id || `${r}-${i}`,
        __match: m,
        __round: r,
        teams: [
          { name: resolveSideLabel(m, "A") },
          { name: resolveSideLabel(m, "B") },
        ],
      };
    });

    return { title: koRoundTitle(need), seeds };
  });

  const last = res[res.length - 1];
  if (last) last.seeds = last.seeds.map((s) => ({ ...s, __lastCol: true }));
  return res;
}

/* ===================== Tiny UI helpers ===================== */
const Chip = ({ label, tone = "default", style }) => (
  <View
    style={[
      styles.chip,
      tone === "primary" && styles.chipPrimary,
      tone === "warn" && styles.chipWarn,
      style,
    ]}
  >
    <Text style={styles.chipText}>{label}</Text>
  </View>
);

const Card = ({ children, style, onPress, disabled }) => {
  if (onPress) {
    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={disabled ? undefined : onPress}
        style={[styles.card, style, disabled && { opacity: 0.6 }]}
      >
        {children}
      </TouchableOpacity>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
};

const SectionTitle = ({ children, mb = 8 }) => (
  <Text style={[styles.sectionTitle, { marginBottom: mb }]}>{children}</Text>
);

/* ===================== Simple Tabs ===================== */
const TabsBar = ({ items, value, onChange }) => (
  <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    contentContainerStyle={styles.tabsContainer}
  >
    {items.map((node, i) => (
      <Pressable
        key={i}
        onPress={() => onChange(i)}
        style={[styles.tabItem, value === i && styles.tabItemActive]}
      >
        {typeof node === "string" ? (
          <Text style={[styles.tabText, value === i && styles.tabTextActive]}>
            {node}
          </Text>
        ) : (
          node
        )}
      </Pressable>
    ))}
  </ScrollView>
);

/* ===================== Match Modal (thay cho ResponsiveMatchViewer) ===================== */
const MatchModal = ({ visible, match, onClose, eventType }) => {
  if (!match) return null;
  const a = match.pairA
    ? pairLabelNickOnly(match.pairA, eventType) // CHỈ NICK
    : depLabel(match.previousA) || seedLabel(match.seedA);
  const b = match.pairB
    ? pairLabelNickOnly(match.pairB, eventType) // CHỈ NICK
    : depLabel(match.previousB) || seedLabel(match.seedB);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Chi tiết trận</Text>
          <Text style={styles.modalLine}>
            <Text style={styles.bold}>A:</Text> {a}
          </Text>
          <Text style={styles.modalLine}>
            <Text style={styles.bold}>B:</Text> {b}
          </Text>
          <Text style={styles.modalLine}>Trạng thái: {resultLabel(match)}</Text>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>Đóng</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

/* ===================== Bracket columns (RN) ===================== */
/* ===================== Bracket columns – centered grid like react-brackets ===================== */
const BracketColumns = ({ rounds, onOpenMatch, championMatchId }) => {
  // đo cột/ô để vẽ connector
  const [colRects, setColRects] = useState({}); // { [col]: {x,y,w,h} }
  const [wrapRects, setWrapRects] = useState({}); // { [col]: { [idx]: {x,y,w,h} } }

  const setColRect = useCallback((c, r) => {
    setColRects((p) =>
      p[c] && JSON.stringify(p[c]) === JSON.stringify(r) ? p : { ...p, [c]: r }
    );
  }, []);
  const setWrapRect = useCallback((c, i, r) => {
    setWrapRects((p) => {
      const pr = p[c] || {};
      if (pr[i] && JSON.stringify(pr[i]) === JSON.stringify(r)) return p;
      return { ...p, [c]: { ...pr, [i]: r } };
    });
  }, []);

  // map matchId -> {col, idx} (để nối theo previousA/previousB)
  const locByMatchId = useMemo(() => {
    const mp = new Map();
    rounds.forEach((r, col) =>
      (r.seeds || []).forEach((s, i) => {
        const id = s?.__match?._id;
        if (id) mp.set(String(id), { col, idx: i });
      })
    );
    return mp;
  }, [rounds]);

  // ==== grid/spacing giống wiki ====
  const ROUND_GAP = 56; // khoảng cách ngang giữa các vòng
  const INNER_GAP = 6; // khoảng cách dọc trong slot giữa card & mép
  const [baseCardH, setBaseCardH] = useState(56); // đo từ ô đầu tiên

  // round 0 slotH = cardH + INNER_GAP*2, round k slotH = slotH0 * 2^k
  const slotH0 = Math.max(baseCardH + INNER_GAP * 2, 72 + INNER_GAP * 2);
  const slotHeight = (col) => slotH0 * Math.pow(2, col);

  // căn giữa toàn cột
  const tallest = useMemo(() => {
    const hs = Object.entries(colRects).map(([c, r]) => {
      const n = rounds[c]?.seeds?.length || 0;
      return n * slotHeight(Number(c));
    });
    return hs.length ? Math.max(...hs) : 0;
  }, [colRects, rounds, slotH0]);

  const colTopOffset = useMemo(() => {
    const out = {};
    rounds.forEach((r, c) => {
      const n = r.seeds?.length || 0;
      const h = n * slotHeight(c);
      out[c] = Math.max(0, (tallest - h) / 2);
    });
    return out;
  }, [rounds, tallest, slotH0]);

  // helper: toạ độ tuyệt đối của slot wrapper (dùng cho connector)
  const absWrap = useCallback(
    (c, i) => {
      const col = colRects[c];
      const wr = wrapRects[c]?.[i];
      if (!col || !wr) return null;
      return { x: col.x + wr.x, y: col.y + wr.y, w: wr.w, h: wr.h };
    },
    [colRects, wrapRects]
  );

  // ===== vẽ connector 3-khúc, ưu tiên previousA/previousB =====
  const connectors = useMemo(() => {
    const L = [];
    const TH = 2;
    const OUT = 22; // từ cạnh phải nguồn ra “bus” dọc
    const TO_DST = 16; // từ bus tới mép trái đích
    const pushH = (x, y, w, k) =>
      w > 0 &&
      L.push(
        <View
          key={k}
          pointerEvents="none"
          style={[
            styles.connector,
            {
              left: Math.round(x),
              top: Math.round(y - TH / 2),
              width: Math.round(w),
              height: TH,
            },
          ]}
        />
      );
    const pushV = (x, y, h, k) =>
      h > 0 &&
      L.push(
        <View
          key={k}
          pointerEvents="none"
          style={[
            styles.connector,
            {
              left: Math.round(x - TH / 2),
              top: Math.round(y),
              width: TH,
              height: Math.round(h),
            },
          ]}
        />
      );
    const idOf = (v) =>
      v && typeof v === "object"
        ? String(v._id ?? v.id ?? "")
        : String(v ?? "");

    for (let c = 0; c < rounds.length - 1; c++) {
      const nextSeeds = rounds[c + 1]?.seeds || [];
      for (let j = 0; j < nextSeeds.length; j++) {
        const dst = absWrap(c + 1, j);
        if (!dst) continue;

        // tìm 2 nguồn
        const m = nextSeeds[j].__match;
        let srcIdxs = [];
        if (m) {
          const la = locByMatchId.get(idOf(m.previousA));
          const lb = locByMatchId.get(idOf(m.previousB));
          if (la?.col === c) srcIdxs.push(la.idx);
          if (lb?.col === c) srcIdxs.push(lb.idx);
        }
        if (srcIdxs.length < 2) {
          // fallback 2j,2j+1
          const a = 2 * j,
            b = 2 * j + 1;
          if (absWrap(c, a)) srcIdxs.push(a);
          if (absWrap(c, b)) srcIdxs.push(b);
        }
        if (srcIdxs.length < 2) continue;

        const r1 = absWrap(c, srcIdxs[0]);
        const r2 = absWrap(c, srcIdxs[1]);
        if (!r1 || !r2) continue;

        const sTop = r1.y <= r2.y ? r1 : r2;
        const sBot = r1.y <= r2.y ? r2 : r1;

        const x1 = sTop.x + sTop.w;
        const y1 = sTop.y + sTop.h / 2;
        const x2 = sBot.x + sBot.w;
        const y2 = sBot.y + sBot.h / 2;

        const xd = dst.x;
        const yd = dst.y + dst.h / 2;

        const rightMax = Math.max(x1, x2);
        const busX = Math.min(xd - TO_DST, rightMax + OUT);
        const midY = (y1 + y2) / 2;

        pushH(x1, y1, busX - x1, `h-a-${c}-${j}`);
        pushH(x2, y2, busX - x2, `h-b-${c}-${j}`);
        pushV(busX, Math.min(y1, y2), Math.abs(y2 - y1), `v-${c}-${j}`);
        pushH(busX, midY, xd - TO_DST - busX, `h-c-${c}-${j}`);
        pushV(
          xd - TO_DST,
          Math.min(midY, yd),
          Math.abs(yd - midY),
          `v2-${c}-${j}`
        );
        pushH(xd - TO_DST, yd, TO_DST, `h-d-${c}-${j}`);
      }
    }
    return L;
  }, [rounds, locByMatchId, colRects, wrapRects, absWrap, slotH0]);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={[styles.roundsRow, styles.bracketCanvas]}>
        {/* overlay connectors */}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {connectors}
        </View>

        {rounds.map((r, colIdx) => (
          <View
            key={colIdx}
            style={[
              styles.roundCol,
              { marginRight: ROUND_GAP, marginTop: colTopOffset[colIdx] || 0 },
            ]}
            onLayout={(e) => {
              const { x, y, width: w, height: h } = e.nativeEvent.layout;
              setColRect(colIdx, { x, y, w, h });
            }}
          >
            <View style={styles.roundTitleWrap}>
              <Text style={styles.roundTitle}>{r.title}</Text>
            </View>

            {(r.seeds || []).map((s, i) => {
              const m = s.__match || null;
              const isChampion =
                m &&
                championMatchId &&
                String(m._id) === String(championMatchId) &&
                (m.winner === "A" || m.winner === "B");

              const nameA = s.teams?.[0]?.name || "Chưa có đội";
              const nameB = s.teams?.[1]?.name || "Chưa có đội";
              const status = m ? resultLabel(m) : "Chưa diễn ra";

              const wrapH = slotHeight(colIdx);

              return (
                <View
                  key={`${colIdx}-${i}`}
                  style={[
                    styles.seedWrap,
                    { height: wrapH, paddingVertical: INNER_GAP },
                  ]}
                  onLayout={(e) => {
                    const { x, y, width: w, height: h } = e.nativeEvent.layout;
                    setWrapRect(colIdx, i, { x, y, w, h });
                  }}
                >
                  <Card
                    onPress={m ? () => onOpenMatch(m) : undefined}
                    disabled={!m}
                    style={[styles.seedBox, isChampion && styles.seedChampion]}
                    onLayout={(e) => {
                      // đo 1 lần để lấy baseCardH
                      if (
                        colIdx === 0 &&
                        i === 0 &&
                        !Number.isFinite(baseCardH)
                      )
                        return;
                      const h = e.nativeEvent.layout.height;
                      if (h && Math.abs(h - baseCardH) > 1) setBaseCardH(h);
                    }}
                  >
                    {isChampion && <Text style={styles.trophy}>🏆</Text>}
                    {m?.status === "live" && <View style={styles.liveDot} />}
                    <Text style={styles.seedLine} numberOfLines={3}>
                      {nameA}
                    </Text>
                    <Text style={styles.seedLine} numberOfLines={3}>
                      {nameB}
                    </Text>
                    <Text style={styles.seedMeta}>{status}</Text>
                  </Card>
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </ScrollView>
  );
};

/* ===================== Component chính (RN) ===================== */
export default function TournamentBracketRN({ tourId: tourIdProp }) {
  const route = useRoute();
  const socket = useSocket();

  const tourId =
    tourIdProp ||
    route?.params?.id ||
    route?.params?.tourId ||
    route?.params?.tournamentId;

  const {
    data: tour,
    isLoading: l1,
    error: e1,
  } = useGetTournamentQuery(tourId, { skip: !tourId });

  const {
    data: brackets = [],
    isLoading: l2,
    error: e2,
    refetch: refetchBrackets,
  } = useListTournamentBracketsQuery(tourId, { skip: !tourId });

  const {
    data: allMatchesFetched = [],
    isLoading: l3,
    error: e3,
    refetch: refetchMatches,
  } = useListTournamentMatchesQuery(
    { tournamentId: tourId },
    {
      skip: !tourId,
      refetchOnMountOrArgChange: true,
      refetchOnFocus: true,
      refetchOnReconnect: true,
    }
  );

  const loading = l1 || l2 || l3;
  const error = e1 || e2 || e3;

  /* ===== live layer: Map(id → match) & merge ===== */
  const liveMapRef = useRef(new Map());
  const [liveBump, setLiveBump] = useState(0);
  const pendingRef = useRef(new Map());
  const rafRef = useRef(null);

  const flushPending = useCallback(() => {
    if (!pendingRef.current.size) return;
    const mp = liveMapRef.current;
    for (const [id, inc] of pendingRef.current) {
      const cur = mp.get(id);
      const vNew = Number(inc?.liveVersion ?? inc?.version ?? 0);
      const vOld = Number(cur?.liveVersion ?? cur?.version ?? 0);
      const merged = !cur || vNew >= vOld ? { ...(cur || {}), ...inc } : cur;
      mp.set(id, merged);
    }
    pendingRef.current.clear();
    setLiveBump((x) => x + 1);
  }, []);

  const queueUpsert = useCallback(
    (incRaw) => {
      const inc = incRaw?.data ?? incRaw?.match ?? incRaw;
      if (!inc?._id) return;
      const id = String(inc._id);
      pendingRef.current.set(id, inc);
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        flushPending();
      });
    },
    [flushPending]
  );

  /* ===== GIỮ refetch STABLE, không đưa vào deps ===== */
  const refetchBracketsRef = useRef(refetchBrackets);
  const refetchMatchesRef = useRef(refetchMatches);
  useEffect(() => {
    refetchBracketsRef.current = refetchBrackets;
  }, [refetchBrackets]);
  useEffect(() => {
    refetchMatchesRef.current = refetchMatches;
  }, [refetchMatches]);

  /* ===== RÚT GỌN DEPS: bracketIds & matchIds ===== */
  const bracketIds = useMemo(
    () => (brackets || []).map((b) => String(b._id)),
    [brackets]
  );
  const matchIds = useMemo(
    () => (allMatchesFetched || []).map((m) => String(m._id)).filter(Boolean),
    [allMatchesFetched]
  );
  // đặt cùng scope với các ref khác
  const initialSeededRef = useRef(false);

  // ưu tiên liveVersion → version → updatedAt
  const versionOf = (m) => {
    const v = Number(m?.liveVersion ?? m?.version ?? NaN);
    if (!Number.isFinite(v)) {
      const t = new Date(m?.updatedAt ?? m?.createdAt ?? 0).getTime();
      return Number.isFinite(t) ? t : 0;
    }
    return v;
  };

  useEffect(() => {
    if (!Array.isArray(allMatchesFetched)) return;

    // lần đầu: seed toàn bộ
    if (!initialSeededRef.current) {
      const mp = new Map();
      for (const m of allMatchesFetched) {
        if (m?._id) mp.set(String(m._id), m);
      }
      liveMapRef.current = mp;
      initialSeededRef.current = true;
      setLiveBump((x) => x + 1);
      return;
    }

    // các lần sau: MERGE theo phiên bản, không replace map
    const mp = liveMapRef.current || new Map();
    let changed = false;

    const seen = new Set();
    for (const m of allMatchesFetched) {
      if (!m?._id) continue;
      const id = String(m._id);
      seen.add(id);

      const cur = mp.get(id);
      if (!cur) {
        mp.set(id, m);
        changed = true;
        continue;
      }
      const vNew = versionOf(m);
      const vOld = versionOf(cur);

      // chỉ ghi đè khi dữ liệu fetch mới hơn (hoặc ngang → merge nông để điền field thiếu)
      if (vNew > vOld) {
        mp.set(id, m);
        changed = true;
      } else if (vNew === vOld) {
        const merged = { ...cur, ...m };
        if (merged !== cur) {
          mp.set(id, merged);
          changed = true;
        }
      }
    }

    if (changed) {
      liveMapRef.current = mp;
      setLiveBump((x) => x + 1);
    }
  }, [allMatchesFetched]);
  /* ===== SOCKET EFFECT (ổn định, không lặp) ===== */
  useEffect(() => {
    if (!socket) return;

    const joined = new Set();

    const subscribeDrawRooms = () => {
      try {
        bracketIds.forEach((bid) =>
          socket.emit("draw:subscribe", { bracketId: bid })
        );
      } catch {}
    };
    const unsubscribeDrawRooms = () => {
      try {
        bracketIds.forEach((bid) =>
          socket.emit("draw:unsubscribe", { bracketId: bid })
        );
      } catch {}
    };

    const joinAllMatches = () => {
      try {
        matchIds.forEach((mid) => {
          if (!joined.has(mid)) {
            socket.emit("match:join", { matchId: mid });
            socket.emit("match:snapshot:request", { matchId: mid });
            joined.add(mid);
          }
        });
      } catch {}
    };

    const onConnect = () => {
      subscribeDrawRooms();
      joinAllMatches();
    };

    const onUpsert = (payload) => queueUpsert(payload);
    const onRemove = (payload) => {
      const id = String(payload?.id ?? payload?._id ?? "");
      if (!id) return;
      if (liveMapRef.current.has(id)) {
        liveMapRef.current.delete(id);
        setLiveBump((x) => x + 1);
      }
    };
    const onRefilled = () => {
      refetchBracketsRef.current?.();
      refetchMatchesRef.current?.();
    };

    if (socket.connected) onConnect();

    socket.on("connect", onConnect);
    socket.on("match:update", onUpsert);
    socket.on("match:snapshot", onUpsert);
    socket.on("score:updated", onUpsert);
    socket.on("match:deleted", onRemove);
    socket.on("draw:refilled", onRefilled);
    socket.on("bracket:updated", onRefilled);

    return () => {
      socket.off("connect", onConnect);
      socket.off("match:update", onUpsert);
      socket.off("match:snapshot", onUpsert);
      socket.off("score:updated", onUpsert);
      socket.off("match:deleted", onRemove);
      socket.off("draw:refilled", onRefilled);
      socket.off("bracket:updated", onRefilled);
      unsubscribeDrawRooms();
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [socket, queueUpsert, bracketIds.join(","), matchIds.join(",")]);

  const matchesMerged = useMemo(
    () =>
      Array.from(liveMapRef.current.values()).filter(
        (m) => String(m.tournament?._id || m.tournament) === String(tourId)
      ),
    [tourId, liveBump]
  );

  const byBracket = useMemo(() => {
    const m = {};
    (brackets || []).forEach((b) => (m[b._id] = []));
    (matchesMerged || []).forEach((mt) => {
      const bid = mt.bracket?._id || mt.bracket;
      if (m[bid]) m[bid].push(mt);
    });
    return m;
  }, [brackets, matchesMerged]);

  // Tabs state
  const [tab, setTab] = useState(0);
  useEffect(() => {
    if (tab >= (brackets?.length || 0)) setTab(0);
  }, [brackets?.length]);

  // Modal viewer
  const [open, setOpen] = useState(false);
  const [activeMatchId, setActiveMatchId] = useState(null);
  const matchIndex = useMemo(() => {
    const mp = new Map();
    for (const m of matchesMerged) mp.set(String(m._id), m);
    return mp;
  }, [matchesMerged]);
  const activeMatch = activeMatchId
    ? matchIndex.get(String(activeMatchId))
    : null;
  const openMatch = (m) => {
    setActiveMatchId(m._id);
    setOpen(true);
  };
  const closeMatch = () => setOpen(false);

  const current = brackets?.[tab] || null;
  const currentMatches = useMemo(
    () => (current ? byBracket[current._id] || [] : []),
    [byBracket, current]
  );

  // resolveSideLabel → CHỈ HIỆN NICKNAME
  const resolveSideLabel = useCallback(
    (m, side) => {
      const eventType = tour?.eventType;
      if (!m) return "Chưa có đội";
      const pair = side === "A" ? m.pairA : m.pairB;
      if (pair) return pairLabelNickOnly(pair, eventType); // 👈

      const prev = side === "A" ? m.previousA : m.previousB;
      const seed = side === "A" ? m.seedA : m.seedB;

      if (prev) {
        const prevId =
          typeof prev === "object" && prev?._id
            ? String(prev._id)
            : String(prev);
        const pm =
          matchIndex.get(prevId) || (typeof prev === "object" ? prev : null);
        if (pm && pm.status === "finished" && pm.winner) {
          const wp = pm.winner === "A" ? pm.pairA : pm.pairB;
          if (wp) return pairLabelNickOnly(wp, eventType); // 👈
        }
        return depLabel(prev);
      }

      if (seed && seed.type) return seedLabel(seed);
      return "Chưa có đội";
    },
    [matchIndex, tour?.eventType]
  );

  // Prefill rounds
  const prefillRounds = useMemo(() => {
    if (!current?.prefill) return null;
    const r = buildRoundsFromPrefill(current.prefill, current?.ko);
    return r && r.length ? r : null;
  }, [current]);

  // Group indexing
  const { byRegId: groupIndex } = useMemo(
    () => buildGroupIndex(current || {}),
    [current]
  );
  const matchGroupLabel = (m) => {
    const aId = m.pairA?._id && String(m.pairA._id);
    const bId = m.pairB?._id && String(m.pairB._id);
    const ga = aId && groupIndex.get(aId);
    const gb = bId && groupIndex.get(bId);
    return ga && gb && ga === gb ? ga : null;
  };

  // Standings data
  const standingsData = useMemo(() => {
    if (!current || current.type !== "group") return null;
    return buildStandingsWithFallback(current, currentMatches, tour?.eventType);
  }, [current, currentMatches, tour?.eventType]);

  const scaleForCurrent = readBracketScale(current);
  const uniqueRoundsCount = new Set(currentMatches.map((m) => m.round ?? 1))
    .size;
  const roundsFromScale = scaleForCurrent
    ? Math.ceil(Math.log2(scaleForCurrent))
    : 0;
  const minRoundsForCurrent = Math.max(uniqueRoundsCount, roundsFromScale);

  // Live spotlight (simple list RN)
  const liveSpotlight = useMemo(() => {
    if (!current || current.type !== "group") return [];
    return (currentMatches || [])
      .filter((m) => String(m.status || "").toLowerCase() === "live")
      .sort((a, b) => {
        const ao = a?.court?.order ?? 9999;
        const bo = b?.court?.order ?? 9999;
        if (ao !== bo) return ao - bo;
        const at = new Date(a.updatedAt || a.scheduledAt || 0).getTime();
        const bt = new Date(b.updatedAt || b.scheduledAt || 0).getTime();
        return bt - at;
      });
  }, [current, currentMatches]);

  const renderLiveSpotlight = () => {
    if (!liveSpotlight.length) return null;

    const stageNo = current?.stage || 1;

    const groupOrderMap = new Map(
      (current?.groups || []).map((g, gi) => {
        const key = String(g.name || g.code || g._id || String(gi + 1));
        return [key, gi + 1];
      })
    );

    const byGroup = new Map();
    (currentMatches || []).forEach((m) => {
      const key = matchGroupLabel(m);
      if (!key) return;
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key).push(m);
    });

    const seqIndexByMatchId = new Map();
    for (const [key, arr] of byGroup.entries()) {
      arr
        .slice()
        .sort(
          (a, b) =>
            (a.round || 1) - (b.round || 1) || (a.order ?? 0) - (b.order ?? 0)
        )
        .forEach((m, idx) => {
          seqIndexByMatchId.set(String(m._id), idx + 1);
        });
    }

    const rows = liveSpotlight.map((m) => {
      const gKey = matchGroupLabel(m) || "?";
      const aName = resolveSideLabel(m, "A");
      const bName = resolveSideLabel(m, "B");
      const bIndex = groupOrderMap.get(gKey) ?? "?";
      const seq = seqIndexByMatchId.get(String(m._id)) ?? "?";
      const code = `#V${stageNo}-B${bIndex}#${seq}`;
      const time = formatTime(pickGroupKickoffTime(m));
      const court = m?.venue?.name || m?.court?.name || m?.court || "";
      const score = scoreLabel(m);
      return {
        id: String(m._id),
        code,
        aName,
        bName,
        time,
        court,
        score,
        match: m,
      };
    });

    return (
      <Card
        style={{
          borderColor: "#f7c2be",
          backgroundColor: "#fff6f6",
          marginBottom: 12,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <Chip label="LIVE" tone="warn" />
          <Text style={[styles.subTitle, { marginLeft: 8 }]}>
            Trận đang diễn ra (Vòng bảng)
          </Text>
        </View>
        {rows.map((r) => (
          <Card
            key={r.id}
            onPress={() => openMatch(r.match)}
            style={styles.rowCard}
          >
            <View style={styles.rowHeader}>
              <Chip label={r.code} />
              <Text style={[styles.bold, { fontSize: 13 }]}>
                {r.score || "LIVE"}
              </Text>
            </View>
            <Text style={styles.rowMain} numberOfLines={2}>
              {r.aName} <Text style={{ opacity: 0.6 }}>vs</Text> {r.bName}
            </Text>
            <View style={styles.rowMetaWrap}>
              <Chip label={r.time || "—"} />
              {!!r.court && <Chip label={r.court} />}
            </View>
          </Card>
        ))}
      </Card>
    );
  };

  if (!tourId) {
    return (
      <View style={styles.center}>
        <Text>Thiếu tournamentId.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.centerPad}>
        <Text style={{ color: "#b00020" }}>
          {error?.data?.message || error?.error || "Lỗi tải dữ liệu."}
        </Text>
      </View>
    );
  }
  if (!brackets.length) {
    return (
      <View style={styles.centerPad}>
        <Text>Chưa có bracket nào cho giải này.</Text>
      </View>
    );
  }

  const tabLabels = brackets.map((b) => {
    const t =
      b.type === "group"
        ? "Group"
        : b.type === "roundElim"
        ? "Round Elim"
        : "Knockout";
    return (
      <View key={b._id} style={{ flexDirection: "row", alignItems: "center" }}>
        <Text style={{ fontWeight: "600" }}>{b.name}</Text>
        <Chip label={t} style={{ marginLeft: 8 }} />
      </View>
    );
  });

  // ======= GROUP UI =======
  const renderGroupBlocks = () => {
    const groups = current?.groups || [];
    if (!groups.length) {
      return (
        <Card style={{ padding: 12, alignItems: "center" }}>
          <Text>Chưa có cấu hình bảng.</Text>
        </Card>
      );
    }

    const stageNo = current?.stage || 1;
    const { starts, sizeOf } = buildGroupStarts(current);
    const sData = standingsData || {
      groups: [],
      points: { win: 3, draw: 1, loss: 0 },
    };

    return (
      <View style={{ gap: 12 }}>
        {groups.map((g, gi) => {
          const key = String(g.name || g.code || g._id || String(gi + 1));
          const labelNumeric = gi + 1;
          const size = sizeOf(g);
          const startIdx = starts.get(key) || 1;

          const realMatches = currentMatches
            .filter((m) => matchGroupLabel(m) === key)
            .sort(
              (a, b) =>
                (a.round || 1) - (b.round || 1) ||
                (a.order || 0) - (b.order || 0)
            );

          let matchRows = [];
          if (realMatches.length) {
            matchRows = realMatches.map((m, idx) => {
              const code = `#V${stageNo}-B${labelNumeric}#${idx + 1}`;
              const aName = resolveSideLabel(m, "A");
              const bName = resolveSideLabel(m, "B");
              const time = formatTime(pickGroupKickoffTime(m));
              const court = m?.venue?.name || m?.court?.name || m?.court || "";
              const score = scoreLabel(m);
              return {
                _id: String(m._id),
                code,
                aName,
                bName,
                time,
                court,
                score,
                match: m,
              };
            });
          } else {
            if (size > 1) {
              matchRows = buildGroupPlaceholderMatches({
                stageNo,
                groupIndexOneBased: labelNumeric,
                groupKey: key,
                teamStartIndex: startIdx,
                teamCount: size,
              });
            } else {
              matchRows = [];
            }
          }

          const gStand = (sData.groups || []).find(
            (x) => String(x.key) === String(key)
          );
          const pointsCfg = sData.points || { win: 3, draw: 1, loss: 0 };

          return (
            <Card key={key}>
              {/* header */}
              <View style={styles.groupHeader}>
                <Chip label={`Bảng ${labelNumeric}`} tone="primary" />
                {(g.name || g.code) && (
                  <Chip label={`Mã: ${g.name || g.code}`} />
                )}
                <Chip label={`Số đội: ${size || 0}`} />
              </View>

              {/* Trận trong bảng */}
              <SectionTitle>Trận trong bảng</SectionTitle>
              <View style={{ gap: 8, marginBottom: 8 }}>
                {matchRows.length ? (
                  matchRows.map((r) => (
                    <Card
                      key={r._id}
                      onPress={() =>
                        !r.isPlaceholder && r.match
                          ? openMatch(r.match)
                          : undefined
                      }
                      disabled={!!r.isPlaceholder || !r.match}
                      style={styles.rowCard}
                    >
                      <View style={styles.rowHeader}>
                        <Chip label={r.code} />
                        <Text style={[styles.bold, { fontSize: 13 }]}>
                          {r.score || "—"}
                        </Text>
                      </View>
                      <Text style={styles.rowMain} numberOfLines={2}>
                        {r.aName} <Text style={{ opacity: 0.6 }}>vs</Text>{" "}
                        {r.bName}
                      </Text>
                      <View style={styles.rowMetaWrap}>
                        <Chip label={r.time || "—"} />
                        {!!r.court && <Chip label={r.court} />}
                      </View>
                    </Card>
                  ))
                ) : (
                  <Card style={{ padding: 12, alignItems: "center" }}>
                    <Text>Chưa có trận nào.</Text>
                  </Card>
                )}
              </View>

              {/* BXH */}
              <SectionTitle>Bảng xếp hạng</SectionTitle>
              <View style={styles.legendWrap}>
                <Chip label={`Thắng +${pointsCfg.win ?? 3}`} />
                <Chip label={`Thua +${pointsCfg.loss ?? 0}`} />
                <Chip label={`Hòa +${pointsCfg.draw ?? 1}`} />
                <Chip label={`Hiệu số = Điểm ghi - Điểm thua`} />
              </View>

              {gStand?.rows?.length ? (
                <View style={{ gap: 8 }}>
                  {gStand.rows.map((row, idx) => {
                    const name = row.pair
                      ? safePairNick(row.pair, tour?.eventType) // 👈 CHỈ NICK
                      : row.name || "—";
                    const pts = Number(row.pts ?? 0);
                    const diff = Number.isFinite(row.pointDiff)
                      ? row.pointDiff
                      : row.setDiff ?? 0;
                    const rank = row.rank || idx + 1;
                    return (
                      <View key={row.id || `row-${idx}`} style={styles.rankRow}>
                        <View style={styles.rankBadge}>
                          <Text style={[styles.bold, { fontSize: 12 }]}>
                            {idx + 1}
                          </Text>
                        </View>
                        <Text style={[styles.rankName]} numberOfLines={2}>
                          {name}
                        </Text>
                        <View style={styles.rankChips}>
                          <Chip label={`Điểm: ${pts}`} />
                          <Chip label={`Hiệu số: ${diff}`} />
                          <Chip label={`Hạng: ${rank}`} tone="primary" />
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <Card style={{ padding: 12, alignItems: "center" }}>
                  <Text>Chưa có dữ liệu BXH.</Text>
                </Card>
              )}
            </Card>
          );
        })}
      </View>
    );
  };

  // ======= KO / RE render =======
  const renderRE = () => {
    const reRounds = buildRoundElimRounds(
      current,
      currentMatches,
      resolveSideLabel
    );
    return (
      <BracketColumns
        rounds={reRounds}
        onOpenMatch={openMatch}
        championMatchId={null}
      />
    );
  };

  const renderKO = () => {
    const championGate = computeChampionGate(currentMatches);
    const finalMatchId = championGate.allowed ? championGate.matchId : null;
    const championPair = championGate.allowed ? championGate.pair : null;

    const expectedFirstRoundPairs =
      Array.isArray(current?.prefill?.seeds) && current.prefill.seeds.length
        ? current.prefill.seeds.length
        : Array.isArray(current?.prefill?.pairs) && current.prefill.pairs.length
        ? current.prefill.pairs.length
        : scaleForCurrent
        ? Math.floor(scaleForCurrent / 2)
        : 0;

    const roundsToRender =
      currentMatches.length > 0
        ? buildRoundsWithPlaceholders(currentMatches, resolveSideLabel, {
            minRounds: minRoundsForCurrent,
            extendForward: true,
            expectedFirstRoundPairs,
          })
        : prefillRounds
        ? prefillRounds
        : current.drawRounds && current.drawRounds > 0
        ? buildEmptyRoundsByScale(2 ** current.drawRounds)
        : buildEmptyRoundsByScale(scaleForCurrent || 4);

    return (
      <View>
        <View style={styles.koMeta}>
          {!!current?.ko?.startKey && (
            <Chip label={`Bắt đầu: ${current.ko.startKey}`} />
          )}
          {!!current?.prefill?.isVirtual && (
            <Chip label="Prefill ảo" tone="warn" />
          )}
          {!!current?.prefill?.source?.fromName && (
            <Chip label={`Nguồn: ${current.prefill.source.fromName}`} />
          )}
          {!!current?.prefill?.roundKey && (
            <Chip label={`RoundKey: ${current.prefill.roundKey}`} />
          )}
        </View>

        {!!championPair && (
          <Card
            style={{
              padding: 10,
              borderColor: "#a5d6a7",
              backgroundColor: "#f1fff2",
            }}
          >
            <Text>
              Vô địch:{" "}
              <Text style={styles.bold}>
                {pairLabelNickOnly(championPair, tour?.eventType)}
              </Text>
            </Text>
          </Card>
        )}

        <BracketColumns
          rounds={roundsToRender}
          onOpenMatch={openMatch}
          championMatchId={finalMatchId}
        />

        {currentMatches.length === 0 && prefillRounds && (
          <Text style={styles.note}>
            * Đang hiển thị khung <Text style={styles.bold}>prefill</Text>
            {current?.prefill?.isVirtual ? " (ảo theo seeding)" : ""} bắt đầu từ{" "}
            <Text style={styles.bold}>
              {current?.ko?.startKey || current?.prefill?.roundKey || "?"}
            </Text>
            . Khi có trận thật, nhánh sẽ tự cập nhật.
          </Text>
        )}
        {currentMatches.length === 0 && !prefillRounds && (
          <Text style={styles.note}>
            * Chưa bốc thăm / chưa lấy đội từ vòng trước — tạm hiển thị khung
            theo <Text style={styles.bold}>quy mô</Text>. Khi có trận thật,
            nhánh sẽ tự cập nhật.
          </Text>
        )}
      </View>
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.title}>Sơ đồ giải: {tour?.name}</Text>

      <TabsBar items={tabLabels} value={tab} onChange={setTab} />

      {current?.type === "group" ? (
        <View style={{ gap: 12 }}>
          <Card>
            <Text style={styles.subTitle}>Vòng bảng: {current.name}</Text>
            {renderLiveSpotlight()}
            {renderGroupBlocks()}
          </Card>
        </View>
      ) : current?.type === "roundElim" ? (
        <Card>
          <Text style={styles.subTitle}>
            Vòng loại rút gọn (Round Elimination): {current.name}
          </Text>
          {renderRE()}
          {currentMatches.length === 0 && (
            <Text style={styles.note}>
              * Chưa bốc cặp — đang hiển thị khung theo vòng cắt (V1..Vk).
            </Text>
          )}
        </Card>
      ) : (
        <Card>
          <Text style={styles.subTitle}>Nhánh knock-out: {current?.name}</Text>
          {renderKO()}
        </Card>
      )}

      <ResponsiveMatchViewer
        open={open}
        matchId={activeMatchId}
        onClose={closeMatch}
      />
    </ScrollView>
  );
}

TournamentBracketRN.propTypes = {
  tourId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
};

/* ===================== Styles ===================== */
const styles = StyleSheet.create({
  screen: {
    padding: 12,
    gap: 12,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  centerPad: {
    padding: 16,
    alignItems: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    marginVertical: 8,
  },
  subTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: "#d0d0d0",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#fff",
    marginRight: 6,
  },
  chipPrimary: {
    borderColor: "#1976d2",
    backgroundColor: "#e3f2fd",
  },
  chipWarn: {
    borderColor: "#f44336",
    backgroundColor: "#ffebee",
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  card: {
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 12,
    backgroundColor: "#fff",
    padding: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  tabsContainer: {
    gap: 8,
    paddingVertical: 4,
  },
  tabItem: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#fafafa",
    marginRight: 8,
  },
  tabItemActive: {
    borderColor: "#1976d2",
    backgroundColor: "#e3f2fd",
  },
  tabText: { fontWeight: "600" },
  tabTextActive: { color: "#0d47a1" },

  // rows
  rowCard: { padding: 10 },
  rowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  rowMain: { fontWeight: "600", lineHeight: 18 },
  rowMetaWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },

  // rankings
  legendWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },
  rankRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eee",
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#eef2f7",
    alignItems: "center",
    justifyContent: "center",
  },
  rankName: { flex: 1, fontWeight: "600" },
  rankChips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },

  // bracket
  roundsRow: { flexDirection: "row", gap: 12 },
  seedBox: {
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    backgroundColor: "#fff",
  },
  seedChampion: {
    borderColor: "#f44336",
    shadowColor: "#f44336",
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
    elevation: 2,
  },
  seedLine: {
    borderLeftWidth: 3,
    borderLeftColor: "transparent",
    paddingLeft: 6,
  },
  seedMeta: { opacity: 0.7, fontSize: 12, marginTop: 2 },
  trophy: { position: "absolute", right: 6, top: 4, fontSize: 16 },
  liveDot: {
    position: "absolute",
    right: 6,
    bottom: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#f44336",
  },

  // modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    borderRadius: 12,
    backgroundColor: "#fff",
    padding: 16,
  },
  modalTitle: { fontSize: 16, fontWeight: "800", marginBottom: 8 },
  modalLine: { marginTop: 4 },
  bold: { fontWeight: "800" },
  closeBtn: {
    marginTop: 12,
    alignSelf: "flex-end",
    backgroundColor: "#1976d2",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  closeBtnText: { color: "#fff", fontWeight: "700" },

  // group header
  groupHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
    alignItems: "center",
  },

  // KO meta
  koMeta: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },

  // footnote
  note: { marginTop: 8, fontSize: 12, opacity: 0.7 },
  bracketCanvas: {
    position: "relative",
    paddingTop: 4,
  },

  connector: {
    position: "absolute",
    backgroundColor: "#263238",
    opacity: 0.9,
    borderRadius: 1,
  },

  // cột & tiêu đề
  roundCol: {
    minWidth: 220,
  },
  roundTitleWrap: {
    alignItems: "center",
    marginBottom: 12,
  },
  roundTitle: {
    fontWeight: "700",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "#eef3f7",
    color: "#394a59",
  },

  // slot bọc card (để canh lưới)
  seedWrap: {
    justifyContent: "center",
  },
});
