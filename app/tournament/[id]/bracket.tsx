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
  Linking,
  RefreshControl,
  useWindowDimensions,
  type LayoutChangeEvent,
} from "react-native";
import PropTypes from "prop-types";
import { useRoute, useTheme, useColorScheme } from "@react-navigation/native";
import WebViewComp from "react-native-webview";
import { useSelector } from "react-redux";
// ====== RTK Query (điều chỉnh alias cho phù hợp dự án RN của bạn) ======
import {
  useGetTournamentQuery,
  useListTournamentBracketsQuery,
  useListTournamentMatchesQuery,
} from "@/slices/tournamentsApiSlice";

import { useSocket } from "@/context/SocketContext";
import ResponsiveMatchViewer from "@/components/match/ResponsiveMatchViewer";
import { StatusBar } from "expo-status-bar";
import * as ScreenOrientation from "expo-screen-orientation";
import {
  BottomSheetModal,
  BottomSheetModalProvider,
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import {
  getMatchCourtDisplayText,
  getMatchPayloadId,
  getPairDisplayName,
  getPlayerDisplayName,
  isNewerOrEqualMatchPayload,
  isLightweightMatchPayload,
  mergeMatchPayload,
  normalizeMatchDisplay,
} from "@/utils/matchDisplay";
import { useSocketRoomSet } from "@/hooks/useSocketRoomSet";
import Ripple from "react-native-material-ripple";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatKnockoutRoundLabelByMatchCount } from "@/utils/tournamentRoundLabels";

/* ---------- Theme tokens (giống DashboardScreen) ---------- */
function useTokens() {
  const navTheme = useTheme?.() || {};
  const scheme = useColorScheme?.() || "light";
  const dark =
    typeof navTheme.dark === "boolean" ? navTheme.dark : scheme === "dark";

  const primary = navTheme?.colors?.primary ?? (dark ? "#7cc0ff" : "#0a84ff");
  const text = navTheme?.colors?.text ?? (dark ? "#f7f7f7" : "#111");
  const card = navTheme?.colors?.card ?? (dark ? "#16181c" : "#ffffff");
  const border = navTheme?.colors?.border ?? (dark ? "#2e2f33" : "#e4e8ef");
  const background =
    navTheme?.colors?.background ?? (dark ? "#0b0d10" : "#f5f7fb");

  return {
    dark,
    colors: { primary, text, card, border, background },

    muted: dark ? "#9aa0a6" : "#6b7280",
    subtext: dark ? "#c9c9c9" : "#555",
    skeletonBase: dark ? "#22262c" : "#e9eef5",
    headerBg: dark ? "#101418" : "#eef3f7",
    divider: dark ? "#2a2e33" : "#e5e7eb",

    chipInfoBg: dark ? "#1f2937" : "#eef2f7",
    chipInfoFg: dark ? "#e5e7eb" : "#263238",
    chipInfoBd: dark ? "#334155" : "#e2e8f0",

    chipErrBg: dark ? "#3b0d0d" : "#fee2e2",
    chipErrFg: dark ? "#fecaca" : "#991b1b",
    chipErrBd: dark ? "#7f1d1d" : "#fecaca",

    chipInfo2Bg: dark ? "#0f2536" : "#e0f2fe",
    chipInfo2Fg: dark ? "#93c5fd" : "#075985",
    chipInfo2Bd: dark ? "#1e3a5f" : "#bae6fd",

    success: dark ? "#22c55e" : "#16a34a",
  };
}

/* ===================== Helpers (names) ===================== */
// (giữ nguyên các helper cũ để không ảnh hưởng nơi khác nếu còn dùng)
export const safePairName = (pair, eventType = "double", source = null) => {
  return getPairDisplayName(pair, source || pair) || "—";
};

export const preferName = (p, source) =>
  getPlayerDisplayName(p, source) || "N/A";

export const preferNick = (p, source) => getPlayerDisplayName(p, source) || "";

/* 🆕 Helpers: nhận diện đăng ký của chính user trong giải */
const getUserIdFromUserInfo = (u) =>
  String(
    u?._id ||
      u?.id ||
      u?.user?._id ||
      u?.user?.id ||
      u?.profile?._id ||
      u?.profile?.id ||
      u?.account?._id ||
      u?.account?.id ||
      ""
  );
function regIncludesUser(reg, userId) {
  if (!userId || !reg) return false;
  const ids = new Set();
  // singles
  if (reg.player) {
    ids.add(
      String(
        reg.player._id ||
          reg.player.id ||
          reg.player.user?._id ||
          reg.player.user?.id ||
          ""
      )
    );
  }
  // doubles/pairs
  if (reg.pair) {
    const p1 = reg.pair.player1 || reg.pair.p1;
    const p2 = reg.pair.player2 || reg.pair.p2;
    if (p1)
      ids.add(String(p1._id || p1.id || p1.user?._id || p1.user?.id || ""));
    if (p2)
      ids.add(String(p2._id || p2.id || p2.user?._id || p2.user?.id || ""));
  }
  return ids.has(String(userId));
}

function collectMyRegIdsFromTour(tour, userId) {
  const set = new Set();
  const regs = Array.isArray(tour?.registrations) ? tour.registrations : [];
  regs.forEach((r) => {
    const rid = String(r?._id || r?.id || "");
    if (!rid) return;
    if (regIncludesUser(r, userId)) set.add(rid);
  });
  return set;
}

// === NEW: luôn ưu tiên chỉ hiện nickname ===
export const safePairNick = (pair, eventType = "double", source = null) => {
  return getPairDisplayName(pair, source || pair) || "—";
};

export const pairLabelNickOnly = (pair, eventType = "double", source = null) =>
  safePairNick(pair, eventType, source);

// (giữ để backward-compat ở file khác nếu có import)
export const nameWithNick = (p) => {
  return getPlayerDisplayName(p) || "—";
};
export const pairLabelWithNick = (pair, eventType = "double", source = null) => {
  return getPairDisplayName(pair, source || pair) || "—";
};

/* ----- V/T helpers (đồng bộ với web) ----- */
const extractCurrentV = (m) => {
  const tryStrings = [
    m?.codeResolved,
    m?.globalCodeV,
    m?.globalCode,
    m?.code,
    m?.displayCode,
    m?.meta?.code,
    m?.slotCode,
  ];
  for (const s of tryStrings) {
    if (typeof s === "string") {
      const k = s.match(/\bV(\d+)-T(\d+)\b/i);
      if (k) return parseInt(k[1], 10);
    }
  }
  const nums = [m?.round, m?.V, m?.meta?.v]
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n));
  return nums.length ? nums[0] : null;
};
const smartDepLabel = (m, prevDep) => {
  const raw = depLabel(prevDep);
  const currV = extractCurrentV(m);
  // ép V = (V hiện tại - 1) nếu bắt được; fallback giữ nguyên
  return String(raw).replace(/\b([WL])-V(\d+)-T(\d+)\b/gi, (_s, wl, v, t) => {
    const pv = parseInt(v, 10);
    const newV = currV != null ? Math.max(1, currV - 1) : pv;
    return `${wl}-V${newV}-T${t}`;
  });
};

const normalizeLooseLabel = (value) =>
  String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const isPendingTeamLabel = (value) => {
  const normalized = normalizeLooseLabel(value);
  return (
    !normalized ||
    normalized === "chua co doi" ||
    normalized === "tbd" ||
    normalized === "registration"
  );
};

const isByeLabel = (value) => /^bye$/i.test(String(value || "").trim());
const visibleTeamLabel = (value) =>
  isPendingTeamLabel(value) ? "—" : String(value || "").trim();
const hasResolvedPair = (pair) =>
  Boolean(
    pair &&
      (pair?.player1 ||
        pair?.player2 ||
        pair?.name ||
        pair?.teamName ||
        pair?.label ||
        pair?.displayName)
  );
const normalizeSeedRefLabel = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, "-");
const isUsefulSideLabel = (value) => {
  const text = String(value || "").trim();
  return !!text && !isPendingTeamLabel(text) && !isByeLabel(text);
};
const isByeSeed = (seed) =>
  seed?.type === "bye" ||
  (typeof seed?.label === "string" && /\bBYE\b/i.test(seed.label));
const isByeMatchObj = (m) => !!m && (isByeSeed(m?.seedA) || isByeSeed(m?.seedB));
const isThirdPlaceMatch = (m) => {
  if (!m) return false;
  const type = String(m?.bracket?.type || m?.format || "").toLowerCase();
  if (["roundelim", "po", "playoff"].includes(type)) return false;
  if (m.isThirdPlace === true || m?.meta?.thirdPlace === true) return true;
  const label = String(m?.meta?.stageLabel || m?.roundName || "").toLowerCase();
  return label.includes("hạng 3") || label.includes("3/4");
};
const extractDisplayCodeText = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";
  const match = text.match(
    /\b(?:V\d+(?:-B[^-\s]+)?(?:-NT)?-T\d+|WB\d+-T\d+|LB\d+-T\d+|GF(?:\d+)?-T\d+)\b/i
  );
  return match ? match[0].toUpperCase() : "";
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
      return g ? `V${st}-B${g}-T${r}` : `V${st}-T${r}`;
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
      return `W-V${r}-T${t}`;
    }
    case "matchLoser": {
      const r = seed.ref?.round ?? "?";
      const t = (seed.ref?.order ?? -1) + 1;
      return `L-V${r}-T${t}`;
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
  const t = (prev.order ?? -1) + 1;
  // Chuẩn mới: W-Vx-Ty (đồng bộ web)
  return `W-V${r}-T${t}`;
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

/* ========= META tổng quan ========= */
function computeMetaBar(brackets, tour) {
  const regSet = new Set();
  (brackets || []).forEach((b) =>
    (b?.groups || []).forEach((g) =>
      (g?.regIds || []).forEach((rid) => rid && regSet.add(String(rid)))
    )
  );
  const totalTeamsFromGroups = regSet.size;
  const totalTeamsFromTour =
    Number(tour?.stats?.registrationsCount) ||
    (Array.isArray(tour?.registrations) ? tour.registrations.length : 0) ||
    0;
  const totalTeams = totalTeamsFromGroups || totalTeamsFromTour || 0;

  let checkedIn = 0;
  if (Array.isArray(tour?.registrations)) {
    checkedIn = tour.registrations.filter(
      (r) =>
        r?.checkinAt ||
        r?.checkedIn === true ||
        r?.checkin === true ||
        String(r?.checkin?.status || "").toLowerCase() === "checked-in"
    ).length;
  } else if (Number.isFinite(tour?.stats?.checkedInCount)) {
    checkedIn = Number(tour.stats.checkedInCount) || 0;
  }
  const checkinLabel =
    totalTeams > 0
      ? `${checkedIn}/${totalTeams}`
      : checkedIn
      ? String(checkedIn)
      : "—";

  const locationText =
    tour?.venue?.name ||
    tour?.location?.name ||
    tour?.location ||
    tour?.place?.name ||
    "—";

  return { totalTeams, checkinLabel, locationText };
}

// ====== Meta KO giống web ======
const displayOrder = (m) =>
  Number.isFinite(Number(m?.order)) ? Number(m.order) + 1 : "?";

// Mã PO/KO: luôn có -T..., ưu tiên API nếu đã có -T; nếu thiếu thì tự tính
const matchApiCode = (m, fallbackOrder) => {
  const candidates = [
    m?.codeResolved,
    m?.globalCodeV,
    m?.globalCode,
    m?.code,
  ].filter((s) => typeof s === "string" && s.trim().length);
  // đã chuẩn có -T
  for (const s of candidates) {
    if (/V\d+-T\d+/i.test(s)) return s;
  }
  // thiếu -T -> chuẩn hoá từ round/order
  const r = Number.isFinite(m?.round) ? m.round : "?";
  const t = Number.isFinite(m?.order)
    ? m.order + 1
    : Number.isFinite(fallbackOrder)
    ? fallbackOrder
    : null;
  return `V${r}${t ? `-T${t}` : ""}`;
};

// Ưu tiên mã vòng bảng dạng #Vx-By#z do API trả về (codeGroup / codeResolved / code / globalCode...)
// Mã vòng bảng: CHUẨN hoá về Vx-By-Tz (loại '#' nếu có)
const groupCodeOf = (m, fallback) => {
  const cand = [
    m?.codeGroup,
    m?.codeResolved,
    m?.globalCodeV,
    m?.globalCode,
    m?.code,
  ].find((c) => typeof c === "string" && c.trim().length);
  if (cand) {
    // 1) đã đúng chuẩn
    const ok = cand.match(/^V(\d+)-B([A-Za-z0-9]+)-T(\d+)$/i);
    if (ok) return `V${ok[1]}-B${ok[2]}-T${ok[3]}`;
    // 2) dạng cũ: #Vx-By#z hoặc Vx-By#z -> chuyển sang Vx-By-Tz
    const old = cand.match(/^#?V(\d+)-B([A-Za-z0-9]+)#(\d+)$/i);
    if (old) return `V${old[1]}-B${old[2]}-T${old[3]}`;
  }
  return fallback;
};

const timeShort = (ts) => {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
};
const kickoffTime = (m) => {
  const st = String(m?.status || "").toLowerCase();
  if (st === "live" || st === "finished")
    return m?.startedAt || m?.scheduledAt || m?.assignedAt || null;
  return m?.scheduledAt || m?.assignedAt || null;
};
const courtName = (m) =>
  getMatchCourtDisplayText(m) || m?.venue?.name || m?.court?.name || m?.court || "";
const getVideoUrl = (m) =>
  m?.streamUrl || m?.videoUrl || m?.stream?.url || m?.broadcast?.url || null;
const hasVideo = (m) => !!getVideoUrl(m);
// trạng thái vẫn giữ màu đặc thù để phân biệt nhanh
const statusColors = (m) => {
  const st = String(m?.status || "").toLowerCase();
  if (st === "finished") return { bg: "#2e7d32", fg: "#fff", key: "done" };
  if (st === "live") return { bg: "#ef6c00", fg: "#fff", key: "live" };
  const ready =
    (m?.pairA || m?.pairB) && (m?.assignedAt || m?.court || m?.scheduledAt);
  if (ready) return { bg: "#f9a825", fg: "#111", key: "ready" };
  return { bg: "#9e9e9e", fg: "#fff", key: "planned" };
};
// ====== Tính tỉ số bên phải theo luật đề bài ======
function computeRightScore(m) {
  if (!m) return "";
  const gs = Array.isArray(m.gameScores) ? m.gameScores : [];
  const finished = String(m.status || "").toLowerCase() === "finished";
  const live = String(m.status || "").toLowerCase() === "live";

  const last = gs.length
    ? gs[gs.length - 1]
    : { a: m.scoreA ?? 0, b: m.scoreB ?? 0 };

  // Đếm số set thắng
  let A = 0,
    B = 0;
  for (const g of gs) {
    if ((g?.a ?? 0) > (g?.b ?? 0)) A++;
    else if ((g?.b ?? 0) > (g?.a ?? 0)) B++;
  }

  // Trận chỉ có/đang ở game đầu → luôn hiện điểm game
  if (gs.length <= 1) {
    if (Number.isFinite(last?.a) && Number.isFinite(last?.b))
      return `${last.a} – ${last.b}`;
    if (Number.isFinite(m.scoreA) && Number.isFinite(m.scoreB))
      return `${m.scoreA} – ${m.scoreB}`;
    return live ? "LIVE" : "";
  }

  // Khi tỉ số set đang/đã là 1–0 (hoặc 0–1) → ưu tiên điểm game hiện tại
  if ((A === 1 && B === 0) || (A === 0 && B === 1)) {
    if (Number.isFinite(last?.a) && Number.isFinite(last?.b))
      return `${last.a} – ${last.b}`;
  }

  // Còn lại: hiện số set thắng
  return `${A} – ${B}`;
}

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

function roundsCountForBracket(bracket, matchesOfThis = []) {
  const type = String(bracket?.type || "").toLowerCase();
  if (type === "group") return 1;

  if (type === "roundelim") {
    let rounds =
      Number(bracket?.meta?.maxRounds) ||
      Number(bracket?.config?.roundElim?.maxRounds) ||
      0;
    if (!rounds) {
      const maxRound =
        Math.max(
          0,
          ...(matchesOfThis || []).map((m) => Number(m.round || 1))
        ) || 1;
      rounds = Math.max(1, maxRound);
    }
    return rounds;
  }

  const roundsFromMatches = (() => {
    const rs = (matchesOfThis || []).map((m) => Number(m.round || 1));
    if (!rs.length) return 0;
    return Math.max(1, Math.max(...rs) - Math.min(...rs) + 1);
  })();
  if (roundsFromMatches) return roundsFromMatches;

  const firstPairs =
    (Array.isArray(bracket?.prefill?.seeds) && bracket.prefill.seeds.length) ||
    (Array.isArray(bracket?.prefill?.pairs) && bracket.prefill.pairs.length) ||
    0;
  if (firstPairs > 0) return Math.ceil(Math.log2(firstPairs * 2));

  const scale = readBracketScale(bracket);
  if (scale) return Math.ceil(Math.log2(scale));

  return 1;
}

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

// === Hoàn tất vòng bảng theo từng bảng/nhóm ===
function expectedRRMatches(n) {
  if (!Number.isFinite(n) || n < 2) return 0;
  return (n * (n - 1)) / 2;
}
function countGroupSize(bracket, g) {
  const actual = Array.isArray(g?.regIds) ? g.regIds.length : 0;
  const expected =
    Number(g?.expectedSize ?? bracket?.config?.roundRobin?.groupSize ?? 0) || 0;
  return actual || expected || 0;
}
function buildCompletedGroupAliasSet(brackets, byBracket) {
  const done = new Set(); // key: `${stage}|${alias}`
  (brackets || [])
    .filter((b) => b?.type === "group")
    .forEach((b) => {
      const stageNo = Number(b?.stage ?? b?.stageIndex ?? 0) || 0;
      const { byRegId } = buildGroupIndex(b);
      const finishedCount = new Map(); // key -> số trận finished

      (byBracket[b._id] || []).forEach((m) => {
        const aId = m?.pairA?._id && String(m.pairA._id);
        const bId = m?.pairB?._id && String(m.pairB._id);
        if (!aId || !bId) return;
        const ga = byRegId.get(aId);
        const gb = byRegId.get(bId);
        if (!ga || !gb || ga !== gb) return;
        const finished = String(m?.status || "").toLowerCase() === "finished";
        if (finished) finishedCount.set(ga, (finishedCount.get(ga) || 0) + 1);
      });

      (b?.groups || []).forEach((g, gi) => {
        const key = String(g.name || g.code || g._id || String(gi + 1)).trim();
        const n = countGroupSize(b, g);
        const need = expectedRRMatches(n);
        const have = finishedCount.get(key) || 0;
        if (need > 0 && have >= need) {
          const aliases = new Set([
            key,
            String(g.code || "").trim(),
            String(g.name || "").trim(),
            String(g._id || "").trim(),
            String(gi + 1), // đề phòng seed dùng số thứ tự
          ]);
          aliases.forEach((a) => {
            if (a) done.add(`${stageNo}|${a}`);
          });
        }
      });
    });
  return done;
}

// Khi bảng đã hoàn tất nhưng KO chưa "gán pair", suy luận đội từ BXH
function resolvePairFromGroupRankSeed(seed, brackets, byBracket, eventType) {
  try {
    if (!seed || seed.type !== "groupRank") return null;
    const st = Number(seed.ref?.stage ?? seed.ref?.stageIndex ?? 0) || 0;
    const gc = String(seed.ref?.groupCode ?? "").trim();
    const rk = Number(seed.ref?.rank ?? 0) || 0;
    if (!gc || rk < 1) return null;

    const b = (brackets || []).find(
      (x) =>
        x?.type === "group" && Number(x?.stage ?? x?.stageIndex ?? 0) === st
    );
    if (!b) return null;

    const standings = computeGroupTablesForBracket(
      b,
      byBracket[b._id] || [],
      eventType
    );
    if (!standings?.groups?.length) return null;

    // nhóm khớp theo nhiều alias
    const g = standings.groups.find(
      (gg) =>
        String(gg.key) === gc ||
        String(gg.label) === gc ||
        String(gg.key) ===
          String(
            (b.groups || []).find(
              (raw, i) =>
                String(raw.code || "").trim() === gc ||
                String(raw.name || "").trim() === gc ||
                String(i + 1) === gc ||
                String(raw._id || "").trim() === gc
            )?.name || ""
          )
    );
    if (!g) return null;
    const row = g.rows?.[rk - 1];
    return row?.pair || null;
  } catch {
    return null;
  }
}

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
    // 🆕 Nếu tổng set thắng đúng 1 (1–0 hoặc 0–1) → hiện điểm game
    if (gw.A + gw.B === 1) {
      const g = lastGameScoreLocal(m.gameScores || []);
      if (Number.isFinite(g.a) && Number.isFinite(g.b)) return `${g.a}-${g.b}`;
    }
    // Mặc định: hiện số set thắng
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
    const code = `V${stageNo}-B${groupIndexOneBased}-T${idx + 1}`;
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
  return (
    formatKnockoutRoundLabelByMatchCount(matchesCount) ||
    `Vòng ${matchesCount * 2} đội`
  );
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
  const prefillSeeds = Array.isArray(bracket?.prefill?.seeds)
    ? bracket.prefill.seeds
    : [];
  const prefillRoundOneTeams = prefillSeeds.map((entry) => ({
    A: seedLabel(entry?.A),
    B: seedLabel(entry?.B),
  }));
  const r1FromPrefill =
    prefillSeeds.length ? prefillSeeds.length : 0;
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
      teams:
        r === 1 && prefillRoundOneTeams[i]
          ? [
              { name: prefillRoundOneTeams[i].A },
              { name: prefillRoundOneTeams[i].B },
            ]
          : [{ name: "Chưa có đội" }, { name: "Chưa có đội" }],
    }));

    const ms = (brMatches || [])
      .filter((m) => (m.round || 1) === r)
      .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));

    ms.forEach((m, idx) => {
      let i = Number.isInteger(m.order)
        ? m.order
        : seeds.findIndex((s) => s.__match === null);
      if (i < 0 || i >= seeds.length) i = Math.min(idx, seeds.length - 1);
      const fallbackTeams = r === 1 ? prefillRoundOneTeams[i] || null : null;
      const nameA = resolveSideLabel(m, "A");
      const nameB = resolveSideLabel(m, "B");

      seeds[i] = {
        id: m._id || `re-${r}-${i}`,
        __match: m,
        __round: r,
        teams: [
          {
            name: isPendingTeamLabel(nameA)
              ? fallbackTeams?.A || nameA
              : nameA,
          },
          {
            name: isPendingTeamLabel(nameB)
              ? fallbackTeams?.B || nameB
              : nameB,
          },
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

/* ===================== Tiny UI helpers (THEMED) ===================== */
const Chip = ({ label, tone = "default", style, bgColor, fgColor, t }) => {
  const base = {
    borderColor: t.colors.border,
    backgroundColor: t.colors.card,
  };
  const toneStyles =
    tone === "primary"
      ? {
          borderColor: t.chipInfo2Bd,
          backgroundColor: t.chipInfo2Bg,
          color: t.chipInfo2Fg,
        }
      : tone === "warn"
      ? {
          borderColor: t.chipErrBd,
          backgroundColor: t.chipErrBg,
          color: t.chipErrFg,
        }
      : { color: t.chipInfoFg };
  const bg = bgColor ?? toneStyles.backgroundColor ?? base.backgroundColor;
  const fg = fgColor ?? toneStyles.color ?? t.colors.text;
  const bd = toneStyles.borderColor ?? base.borderColor;

  return (
    <View
      style={[styles.chip, { borderColor: bd, backgroundColor: bg }, style]}
    >
      <Text style={[styles.chipText, { color: fg }]}>{label}</Text>
    </View>
  );
};

const Card = ({ children, style, onPress, disabled, t }) => {
  const baseStyle = [
    styles.card,
    { borderColor: t.colors.border, backgroundColor: t.colors.card },
    style,
    disabled && { opacity: 0.6 },
  ];
  if (onPress) {
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={disabled ? undefined : onPress}
        style={baseStyle}
      >
        {children}
      </TouchableOpacity>
    );
  }
  return <View style={baseStyle}>{children}</View>;
};

const SectionTitle = ({ children, mb = 8, t }) => (
  <Text
    style={[styles.sectionTitle, { marginBottom: mb, color: t.colors.text }]}
  >
    {children}
  </Text>
);

/* 🆕 Checkbox item (themed) */
const CheckItem = ({ checked, label, onToggle, disabled, t }) => (
  <Pressable
    onPress={disabled ? undefined : onToggle}
    style={[styles.checkItem, disabled && { opacity: 0.5 }]}
    hitSlop={6}
  >
    <View
      style={[
        styles.checkBox,
        { borderColor: t.muted, backgroundColor: t.colors.card },
        checked && {
          backgroundColor: t.colors.primary,
          borderColor: t.colors.primary,
        },
      ]}
    >
      {checked ? (
        <Text style={[styles.checkMark, { color: "#fff" }]}>✓</Text>
      ) : null}
    </View>
    <Text style={[styles.checkLabel, { color: t.colors.text }]}>{label}</Text>
  </Pressable>
);

/* ===================== Fullscreen FAB (themed) ===================== */
const FullscreenFAB = ({ onPress, bottomGap = 80, t }) => (
  <View
    style={[
      styles.fullFab,
      {
        bottom: bottomGap,
        backgroundColor: t.colors.card,
        borderColor: t.colors.border,
        shadowColor: t.dark ? "#000" : "#000",
      },
    ]}
  >
    <Pressable style={styles.fullFabBtn} onPress={onPress} hitSlop={10}>
      <Text style={[styles.fullFabIcon, { color: t.colors.text }]}>⛶</Text>
    </Pressable>
  </View>
);

const CloseFullscreenBtn = ({ onPress, t }) => (
  <Pressable style={styles.fullCloseBtn} onPress={onPress} hitSlop={10}>
    <Text style={styles.fullCloseTxt}>✕</Text>
  </Pressable>
);

/* ===================== Simple Tabs (themed) ===================== */
const TabsBar = ({ items, value, onChange, t }) => (
  <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    contentContainerStyle={styles.tabsContainer}
  >
    {items.map((node, i) => {
      const active = value === i;
      return (
        <Pressable
          key={i}
          onPress={() => onChange(i)}
          style={[
            styles.tabItem,
            {
              borderColor: active ? t.colors.primary : t.colors.border,
              backgroundColor: active
                ? t.dark
                  ? "#0b2741"
                  : t.chipInfo2Bg
                : t.colors.card,
            },
            active && styles.tabItemActive,
          ]}
        >
          {typeof node === "string" ? (
            <Text
              style={[
                styles.tabText,
                {
                  color: active
                    ? t.dark
                      ? t.chipInfo2Fg
                      : "#0d47a1"
                    : t.colors.text,
                },
                active && styles.tabTextActive,
              ]}
            >
              {node}
            </Text>
          ) : (
            node
          )}
        </Pressable>
      );
    })}
  </ScrollView>
);

// ===================== Filter Bottom Sheet (themed) =====================
const FilterSheet = React.forwardRef(
  (
    {
      filterItems,
      selectedGroupKeys,
      onToggleKey,
      myRegIds,
      onShowAll,
      onSelectAll,
      onOnlyMine,
      onApply,
      t,
    },
    ref
  ) => {
    const insets = useSafeAreaInsets();
    const snapPoints = React.useMemo(() => ["50%", "90%"], []);

    const renderBackdrop = React.useCallback(
      (props) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          pressBehavior="close"
        />
      ),
      []
    );

    const handleApply = React.useCallback(() => {
      onApply?.();
      ref?.current?.dismiss?.();
    }, [onApply, ref]);

    return (
      <BottomSheetModal
        ref={ref}
        snapPoints={snapPoints}
        topInset={Math.max(insets.top, 12)}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        handleIndicatorStyle={{ backgroundColor: t.muted }}
        backgroundStyle={{ backgroundColor: t.colors.card }}
        enableDynamicSizing={false}
      >
        <BottomSheetScrollView
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingBottom: Math.max(insets.bottom, 16),
            gap: 10,
          }}
        >
          <Text style={[styles.sectionTitle, { color: t.colors.text }]}>
            Bộ lọc bảng
          </Text>

          <View style={[styles.filterRowWrap, { marginTop: 6 }]}>
            {filterItems.map((it) => (
              <CheckItem
                key={it.key}
                checked={selectedGroupKeys.has(it.key)}
                onToggle={() => onToggleKey(it.key)}
                label={it.label}
                t={t}
              />
            ))}
          </View>

          <View style={styles.sheetActions}>
            <Pressable
              onPress={onShowAll}
              style={[
                styles.filterBtn,
                {
                  borderColor: t.colors.border,
                  backgroundColor: t.colors.card,
                },
              ]}
            >
              <Text style={[styles.filterBtnText, { color: t.colors.text }]}>
                Bỏ chọn tất cả
              </Text>
            </Pressable>
            <Pressable
              onPress={onSelectAll}
              style={[
                styles.filterBtn,
                {
                  borderColor: t.colors.border,
                  backgroundColor: t.colors.card,
                },
              ]}
            >
              <Text style={[styles.filterBtnText, { color: t.colors.text }]}>
                Chọn tất cả
              </Text>
            </Pressable>
          </View>

          <Pressable
            onPress={handleApply}
            style={[styles.applyBtn, { backgroundColor: t.colors.primary }]}
          >
            <Text style={styles.applyBtnText}>Áp dụng</Text>
          </Pressable>
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  }
);
FilterSheet.displayName = "FilterSheet";

/* ===================== Match Modal (themed) ===================== */
const MatchModal = ({ visible, match, onClose, eventType, t }) => {
  if (!match) return null;
  const a = match.pairA
    ? pairLabelNickOnly(match.pairA, eventType, match)
    : smartDepLabel(match, match.previousA) || seedLabel(match.seedA);
  const b = match.pairB
    ? pairLabelNickOnly(match.pairB, eventType, match)
    : smartDepLabel(match, match.previousB) || seedLabel(match.seedB);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalBackdrop}>
        <View
          style={[
            styles.modalCard,
            { backgroundColor: t.colors.card, borderColor: t.colors.border },
          ]}
        >
          <Text style={[styles.modalTitle, { color: t.colors.text }]}>
            Chi tiết trận
          </Text>
          <Text style={[styles.modalLine, { color: t.colors.text }]}>
            <Text style={styles.bold}>A:</Text> {a}
          </Text>
          <Text style={[styles.modalLine, { color: t.colors.text }]}>
            <Text style={styles.bold}>B:</Text> {b}
          </Text>
          <Text style={[styles.modalLine, { color: t.colors.text }]}>
            Trạng thái: {resultLabel(match)}
          </Text>
          <Pressable
            onPress={onClose}
            style={[styles.closeBtn, { backgroundColor: t.colors.primary }]}
          >
            <Text style={styles.closeBtnText}>Đóng</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

const VideoModal = ({ visible, url, onClose, t }) => {
  if (!visible) return null;
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalBackdrop}>
        <View
          style={[
            styles.modalCard,
            {
              height: 320,
              backgroundColor: t.colors.card,
              borderColor: t.colors.border,
            },
          ]}
        >
          <Text style={[styles.modalTitle, { color: t.colors.text }]}>
            Xem video
          </Text>
          {WebViewComp ? (
            <WebViewComp
              source={{ uri: url }}
              style={{ flex: 1, borderRadius: 8 }}
            />
          ) : (
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: t.colors.text }}>
                Thiếu react-native-webview.
              </Text>
              <Pressable
                onPress={() => Linking.openURL(url)}
                style={[
                  styles.closeBtn,
                  {
                    alignSelf: "center",
                    marginTop: 12,
                    backgroundColor: t.colors.primary,
                  },
                ]}
              >
                <Text style={styles.closeBtnText}>Mở trong trình duyệt</Text>
              </Pressable>
            </View>
          )}
          <Pressable
            onPress={onClose}
            style={[
              styles.closeBtn,
              { marginTop: 10, backgroundColor: t.colors.primary },
            ]}
          >
            <Text style={styles.closeBtnText}>Đóng</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

/* ===================== Bracket columns (RN) ===================== */
const BRACKET_ZOOM_MIN = 0.4;
const BRACKET_ZOOM_MAX = 1.6;
const BRACKET_ZOOM_STEP = 0.1;
const BRACKET_CONNECTOR_THICKNESS = 2;

type BracketLayoutRect = { x: number; y: number; w: number; h: number };
type BracketLayoutInput =
  | BracketLayoutRect
  | { x: number; y: number; width: number; height: number }
  | null;
type TerminalLayoutHandler = (rect: BracketLayoutRect | null) => void;
type BracketColumnsProps = {
  rounds: any[];
  onOpenMatch?: any;
  championMatchId?: any;
  focusRegId?: any;
  setFocusRegId?: any;
  onOpenVideo?: any;
  t: any;
  mirror?: boolean;
  canvasOnly?: boolean;
  externalZoom?: number;
  onTerminalLayout?: TerminalLayoutHandler | null;
};
type SymmetricKnockoutColumnsProps = Omit<
  BracketColumnsProps,
  "mirror" | "canvasOnly" | "externalZoom" | "onTerminalLayout"
>;

const clampBracketZoom = (value) =>
  Math.min(BRACKET_ZOOM_MAX, Math.max(BRACKET_ZOOM_MIN, value));

const getInitialBracketZoom = (width) => {
  if (!Number.isFinite(width)) return 0.75;
  if (width < 380) return 0.62;
  if (width < 480) return 0.68;
  if (width < 768) return 0.78;
  return 1;
};

function buildSymmetricSlotCounts(rounds: any[] = []) {
  const counts = (rounds || []).map((round) =>
    Math.max(1, Array.isArray(round?.seeds) ? round.seeds.length : 0)
  );
  if (!counts.length) return counts;

  counts[counts.length - 1] = 1;
  for (let index = counts.length - 2; index >= 0; index -= 1) {
    counts[index] = Math.max(counts[index], counts[index + 1] * 2);
  }
  return counts;
}

function makeSymmetricSpacer(round: any, slotIndex: number) {
  return {
    id: `symmetric-spacer-${round?.title || "round"}-${slotIndex}`,
    __match: null,
    __round: round?.seeds?.[0]?.__round || 1,
    __symmetricSpacer: true,
    teams: [],
  };
}

function fillSymmetricSlots(round: any, slotCount: number) {
  const seeds = Array.isArray(round?.seeds) ? round.seeds : [];
  const safeCount = Math.max(slotCount, seeds.length, 1);
  const slots = Array.from({ length: safeCount }, (_, index) =>
    makeSymmetricSpacer(round, index)
  );
  seeds.forEach((seed, index) => {
    if (index < slots.length) slots[index] = seed;
  });
  return slots;
}

function splitKnockoutRound(
  round: any,
  side: "left" | "right",
  slotCount: number
) {
  const seeds = fillSymmetricSlots(round, slotCount);
  const mid = Math.ceil(seeds.length / 2);
  const sourceSeeds = side === "left" ? seeds.slice(0, mid) : seeds.slice(mid);
  return {
    ...round,
    seeds: sourceSeeds.map((seed, index) => ({
      ...seed,
      __symmetricOriginalIndex: side === "left" ? index : mid + index,
    })),
  };
}

const ZoomControlsRN = ({ zoom, onZoomOut, onZoomIn, onReset, t }) => (
  <View
    style={[
      styles.bracketZoomBar,
      { borderColor: t.colors.border, backgroundColor: t.colors.card },
    ]}
  >
    <Pressable
      accessibilityLabel="Thu nhỏ sơ đồ"
      disabled={zoom <= BRACKET_ZOOM_MIN}
      hitSlop={8}
      onPress={onZoomOut}
      style={[styles.zoomBtn, zoom <= BRACKET_ZOOM_MIN && styles.zoomBtnOff]}
    >
      <Text style={[styles.zoomBtnText, { color: t.colors.text }]}>-</Text>
    </Pressable>
    <Pressable
      accessibilityLabel="Về kích thước mặc định"
      hitSlop={8}
      onPress={onReset}
      style={styles.zoomValueBtn}
    >
      <Text style={[styles.zoomValueText, { color: t.colors.text }]}>
        {Math.round(zoom * 100)}%
      </Text>
    </Pressable>
    <Pressable
      accessibilityLabel="Phóng to sơ đồ"
      disabled={zoom >= BRACKET_ZOOM_MAX}
      hitSlop={8}
      onPress={onZoomIn}
      style={[styles.zoomBtn, zoom >= BRACKET_ZOOM_MAX && styles.zoomBtnOff]}
    >
      <Text style={[styles.zoomBtnText, { color: t.colors.text }]}>+</Text>
    </Pressable>
  </View>
);

const getSeedLayoutKey = (seed, fallbackRound, fallbackOrder) => {
  const match = seed?.__match;
  const round = Number(match?.round ?? seed?.__round ?? fallbackRound);
  const order = Number(match?.order ?? fallbackOrder);
  if (!Number.isFinite(round) || !Number.isFinite(order)) return "";
  return `${round}:${order}`;
};

const normalizeLayoutCode = (value) => extractDisplayCodeText(value);

const normalizeLayoutName = (value) => {
  const text = String(value || "").trim();
  if (!text || isPendingTeamLabel(text) || isByeLabel(text)) return "";
  if (normalizeLayoutCode(text)) return "";
  return text.replace(/\s*\([AB]\)\s*$/i, "").replace(/\s+/g, " ").toLowerCase();
};

const getSeedLayoutCodes = (seed, fallbackOrder) => {
  const match = seed?.__match;
  if (!match) return [];
  return [
    matchApiCode(match, fallbackOrder),
    match?.displayCode,
    match?.codeDisplay,
    match?.codeResolved,
    match?.globalCodeV,
    match?.globalCode,
    match?.code,
    match?.matchCode,
    match?.slotCode,
    match?.bracketCode,
    match?.labelKey,
    match?.meta?.code,
    match?.meta?.label,
  ]
    .map(normalizeLayoutCode)
    .filter(Boolean);
};

const getSeedSourceCode = (source) =>
  [source?.label, source?.ref?.label]
    .map(normalizeLayoutCode)
    .find(Boolean) || "";

const getSeedSourceRefs = (seed) => {
  const match = seed?.__match;
  if (!match) return [];
  const refs = [];
  const pushRef = (ref) => {
    if (!ref) return;
    const key = ref.code
      ? `code:${ref.code}`
      : ref.name
      ? `name:${ref.name}`
      : `match:${ref.round}:${ref.order}`;
    if (
      refs.some((item) => {
        const itemKey = item.code
          ? `code:${item.code}`
          : item.name
          ? `name:${item.name}`
          : `match:${item.round}:${item.order}`;
        return itemKey === key;
      })
    ) {
      return;
    }
    refs.push(ref);
  };

  [match.seedA, match.seedB].forEach((source) => {
    const type = String(source?.type || "");
    if (
      type !== "stageMatchLoser" &&
      type !== "stageMatchWinner" &&
      type !== "matchLoser" &&
      type !== "matchWinner"
    ) {
      return;
    }

    const code = getSeedSourceCode(source);
    if (code) {
      pushRef({ code });
      return;
    }

    const round = Number(source?.ref?.round);
    const order = Number(source?.ref?.order);
    if (Number.isFinite(round) && Number.isFinite(order)) {
      pushRef({ round, order });
    }
  });

  (seed?.teams || []).forEach((team) => {
    const code = normalizeLayoutCode(team?.name);
    if (code) {
      pushRef({ code });
      return;
    }

    const name = normalizeLayoutName(team?.name);
    if (name) pushRef({ name });
  });

  return refs;
};

const getMatchRefId = (value) =>
  value && typeof value === "object"
    ? String(value._id ?? value.id ?? "")
    : String(value ?? "");

const BracketColumns = ({
  rounds,
  onOpenMatch,
  championMatchId,
  focusRegId,
  setFocusRegId,
  onOpenVideo,
  t,
  mirror = false,
  canvasOnly = false,
  externalZoom = undefined,
  onTerminalLayout = null,
}: BracketColumnsProps) => {
  const { width: windowWidth } = useWindowDimensions();
  const initialZoom = useMemo(
    () => getInitialBracketZoom(windowWidth),
    [windowWidth]
  );
  const [zoom, setZoom] = useState(initialZoom);
  const [contentSize, setContentSize] = useState({ width: 0, height: 0 });
  const zoomTouchedRef = useRef(false);

  useEffect(() => {
    if (!zoomTouchedRef.current) setZoom(initialZoom);
  }, [initialZoom]);

  const setUserZoom = useCallback((next) => {
    zoomTouchedRef.current = true;
    setZoom((prev) =>
      clampBracketZoom(typeof next === "function" ? next(prev) : next)
    );
  }, []);

  const zoomOut = useCallback(
    () => setUserZoom((z) => Number((z - BRACKET_ZOOM_STEP).toFixed(2))),
    [setUserZoom]
  );
  const zoomIn = useCallback(
    () => setUserZoom((z) => Number((z + BRACKET_ZOOM_STEP).toFixed(2))),
    [setUserZoom]
  );
  const resetZoom = useCallback(() => {
    zoomTouchedRef.current = false;
    setZoom(initialZoom);
  }, [initialZoom]);

  const onCanvasLayout = useCallback((e) => {
    const { width, height } = e.nativeEvent.layout;
    setContentSize((prev) =>
      Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1
        ? prev
        : { width, height }
    );
  }, []);

  const activeZoom =
    Number.isFinite(Number(externalZoom)) && Number(externalZoom) > 0
      ? Number(externalZoom)
      : zoom;
  const hasMeasuredCanvas = contentSize.width > 0 && contentSize.height > 0;
  const scaledFrameStyle = hasMeasuredCanvas
    ? {
        width: Math.ceil(contentSize.width * activeZoom),
        height: Math.ceil(contentSize.height * activeZoom),
      }
    : null;
  const scaledCanvasStyle =
    hasMeasuredCanvas && activeZoom !== 1
      ? ({
          transform: [{ scale: activeZoom }],
          transformOrigin: "top left",
        } as any)
      : null;

  // ===== BYE helpers =====
  const isByeName = isByeLabel;
  const seedHasBye = useCallback((seed) => {
    const a = seed?.teams?.[0]?.name || "";
    const b = seed?.teams?.[1]?.name || "";
    return isByeName(a) || isByeName(b);
  }, [isByeName]);
  const nonByeName = useCallback((seed) => {
    const a = seed?.teams?.[0]?.name || "";
    const b = seed?.teams?.[1]?.name || "";
    if (isByeName(a) && !isByeName(b) && !isPendingTeamLabel(b)) return b;
    if (isByeName(b) && !isByeName(a) && !isPendingTeamLabel(a)) return a;
    return null;
  }, [isByeName]);
  // đo cột/ô để vẽ connector
  const [colRects, setColRects] = useState({});
  const [wrapRects, setWrapRects] = useState({});

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

  const viewRounds = useMemo(() => {
    const copy = (rounds || []).map((r) => ({
      ...r,
      seeds: (r.seeds || []).map((s) => ({
        ...s,
        teams: (
          s.teams || [{ name: "Chưa có đội" }, { name: "Chưa có đội" }]
        ).map((t) => ({ ...t })),
      })),
    }));
    for (let c = 0; c < copy.length - 1; c++) {
      const cur = copy[c];
      const nxt = copy[c + 1];
      if (!cur?.seeds?.length || !nxt?.seeds?.length) continue;
      cur.seeds.forEach((s, i) => {
        if (!seedHasBye(s)) return;
        const adv = nonByeName(s);
        if (!adv) return;
        const dstIdx = Math.floor(i / 2);
        const side = i % 2; // 0 => A, 1 => B
        if (nxt.seeds[dstIdx]) {
          const curName = nxt.seeds[dstIdx].teams?.[side]?.name;
          if (isPendingTeamLabel(curName) || isByeLabel(curName)) {
            nxt.seeds[dstIdx].teams[side] = { name: adv };
          }
        }
      });
    }
    return copy;
  }, [rounds, seedHasBye, nonByeName]);

  const ROUND_GAP = 64;
  const INNER_GAP = 36;
  const EXTRA_SLOT = 16;
  const [baseCardH, setBaseCardH] = useState(78);

  const slotH0 = Math.max(
    baseCardH + INNER_GAP * 2 + EXTRA_SLOT,
    72 + INNER_GAP * 2
  );
  const slotHeight = useCallback(
    (col) => slotH0 * Math.pow(2, col),
    [slotH0]
  );

  const layoutIndex = useMemo(() => {
    const byKey = new Map();
    const byCode = new Map();
    const byName = new Map();

    viewRounds.forEach((round, col) => {
      (round?.seeds || []).forEach((seed, index) => {
        const cell = { col, idx: index };
        const layoutKey = getSeedLayoutKey(seed, col + 1, index);
        if (layoutKey) byKey.set(layoutKey, cell);

        const pushCode = (code) => {
          if (!code) return;
          if (!byCode.has(code)) byCode.set(code, []);
          byCode.get(code).push(cell);
        };
        const pushName = (name) => {
          if (!name) return;
          if (!byName.has(name)) byName.set(name, []);
          byName.get(name).push(cell);
        };

        getSeedLayoutCodes(seed, index + 1).forEach(pushCode);
        if (seedHasBye(seed)) {
          pushCode(normalizeLayoutCode(nonByeName(seed)));
          pushName(normalizeLayoutName(nonByeName(seed)));
        }
      });
    });

    return { byKey, byCode, byName };
  }, [viewRounds, seedHasBye, nonByeName]);

  const getSourceCellsForSeed = useCallback(
    (seed, targetCol) => {
      const cells = [];
      const seen = new Set();
      const prevCol = targetCol - 1;
      const pushCell = (cell) => {
        if (!cell || cell.col !== prevCol) return;
        const key = `${cell.col}:${cell.idx}`;
        if (seen.has(key)) return;
        seen.add(key);
        cells.push(cell);
      };

      getSeedSourceRefs(seed).forEach((ref) => {
        if (ref.code) {
          (layoutIndex.byCode.get(ref.code) || []).forEach(pushCell);
        } else if (ref.name) {
          (layoutIndex.byName.get(ref.name) || []).forEach(pushCell);
        } else if (Number.isFinite(ref.round) && Number.isFinite(ref.order)) {
          pushCell(layoutIndex.byKey.get(`${ref.round}:${ref.order}`));
        }
      });

      const match = seed?.__match;
      [match?.previousA, match?.previousB].forEach((previous) => {
        pushCell(locByMatchId.get(getMatchRefId(previous)));
      });

      return cells;
    },
    [layoutIndex, locByMatchId]
  );

  const getStructuralSourceCells = useCallback(
    (targetCol, targetIdx) => {
      const prevCol = targetCol - 1;
      if (prevCol < 0) return [];
      const prevSeeds = viewRounds?.[prevCol]?.seeds || [];
      return [targetIdx * 2, targetIdx * 2 + 1]
        .filter((idx) => prevSeeds[idx])
        .map((idx) => ({ col: prevCol, idx }));
    },
    [viewRounds]
  );

  const getVisualSourceCellsForSeed = useCallback(
    (seed, targetCol, targetIdx) => {
      const cells = [];
      const seen = new Set();
      const pushCell = (cell) => {
        if (!cell) return;
        const key = `${cell.col}:${cell.idx}`;
        if (seen.has(key)) return;
        seen.add(key);
        cells.push(cell);
      };

      const explicitCells = getSourceCellsForSeed(seed, targetCol);
      const structuralCells = getStructuralSourceCells(targetCol, targetIdx);
      explicitCells.forEach(pushCell);

      const structuralKeys = new Set(
        structuralCells.map((cell) => `${cell.col}:${cell.idx}`)
      );
      const explicitTouchesPair = explicitCells.some((cell) =>
        structuralKeys.has(`${cell.col}:${cell.idx}`)
      );
      const pairHasBye = structuralCells.some((cell) =>
        seedHasBye(viewRounds?.[cell.col]?.seeds?.[cell.idx])
      );

      if (!explicitCells.length || explicitTouchesPair || pairHasBye) {
        structuralCells.forEach(pushCell);
      }

      return cells;
    },
    [getSourceCellsForSeed, getStructuralSourceCells, seedHasBye, viewRounds]
  );

  const seedLayout = useMemo(() => {
    const positionsByCell = new Map();
    const out = {};

    viewRounds.forEach((round, col) => {
      out[col] = {};
      const wrapH = slotHeight(col);
      let lastBottom = 0;

      (round?.seeds || []).forEach((seed, index) => {
        const sourceCenters = [];
        const pushSourceCenter = (source) => {
          if (Number.isFinite(source?.centerY)) {
            sourceCenters.push(source.centerY);
          }
        };

        getVisualSourceCellsForSeed(seed, col, index).forEach((cell) => {
          pushSourceCenter(positionsByCell.get(`${cell.col}:${cell.idx}`));
        });

        const fallbackCenter = index * wrapH + wrapH / 2;
        let centerY = sourceCenters.length
          ? sourceCenters.reduce((sum, value) => sum + value, 0) /
            sourceCenters.length
          : fallbackCenter;
        let top = Math.max(0, lastBottom, centerY - wrapH / 2);
        centerY = top + wrapH / 2;
        lastBottom = top + wrapH;

        const node = { top, centerY, height: wrapH };
        out[col][index] = node;
        positionsByCell.set(`${col}:${index}`, node);
      });
    });

    return out;
  }, [viewRounds, getVisualSourceCellsForSeed, slotHeight]);

  const getSeedMarginTop = useCallback(
    (col, index) => {
      const current = seedLayout[col]?.[index];
      if (!current) return 0;
      if (index === 0) return current.top;

      const previous = seedLayout[col]?.[index - 1];
      if (!previous) return current.top;
      return Math.max(0, current.top - (previous.top + previous.height));
    },
    [seedLayout]
  );

  const absWrap = useCallback(
    (c, i) => {
      const col = colRects[c];
      const wr = wrapRects[c]?.[i];
      if (!col || !wr) return null;
      return { x: col.x + wr.x, y: col.y + wr.y, w: wr.w, h: wr.h };
    },
    [colRects, wrapRects]
  );

  useEffect(() => {
    if (!onTerminalLayout) return;

    const lastCol = viewRounds.length - 1;
    const terminalIndex = (viewRounds[lastCol]?.seeds || []).findIndex(
      (seed: { __symmetricSpacer?: boolean } | null | undefined) =>
        !seed?.__symmetricSpacer
    );
    if (lastCol < 0 || terminalIndex < 0 || !contentSize.width) {
      onTerminalLayout(null);
      return;
    }

    const rect = absWrap(lastCol, terminalIndex);
    if (!rect) {
      onTerminalLayout(null);
      return;
    }

    onTerminalLayout({
      ...rect,
      x: mirror ? contentSize.width - rect.x - rect.w : rect.x,
    });
  }, [absWrap, contentSize.width, mirror, onTerminalLayout, viewRounds]);

  // connectors
  const connectors = useMemo(() => {
    const L = [];
    const TH = BRACKET_CONNECTOR_THICKNESS;
    const OUT = 22;
    const TO_DST = 16;
    const color = t.dark ? "#9aa0a6" : "#263238";
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
              backgroundColor: color,
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
              backgroundColor: color,
            },
          ]}
        />
      );

    for (let c = 0; c < viewRounds.length - 1; c++) {
      const nextSeeds = viewRounds[c + 1]?.seeds || [];
      for (let j = 0; j < nextSeeds.length; j++) {
        const dst = absWrap(c + 1, j);
        if (!dst) continue;

        let srcIdxs = getVisualSourceCellsForSeed(nextSeeds[j], c + 1, j).map(
          (cell) => cell.idx
        );
        if (!srcIdxs.length) {
          const a = 2 * j;
          const b = 2 * j + 1;
          if (absWrap(c, a)) srcIdxs.push(a);
          if (absWrap(c, b)) srcIdxs.push(b);
        }
        srcIdxs = Array.from(new Set(srcIdxs));

        const sources = srcIdxs
          .map((idx) => absWrap(c, idx))
          .filter(Boolean)
          .sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2));
        if (!sources.length) continue;

        const xd = dst.x;
        const yd = dst.y + dst.h / 2;
        const rightMax = Math.max(...sources.map((src) => src.x + src.w));
        const busX = Math.min(xd - TO_DST, rightMax + OUT);

        if (sources.length === 1) {
          const src = sources[0];
          const x = src.x + src.w;
          const y = src.y + src.h / 2;
          if (Math.abs(y - yd) < 1) {
            pushH(x, y, xd - x, `h-single-${c}-${j}`);
          } else {
            pushH(x, y, busX - x, `h-single-a-${c}-${j}`);
            pushV(busX, Math.min(y, yd), Math.abs(yd - y), `v-single-${c}-${j}`);
            pushH(busX, yd, xd - busX, `h-single-b-${c}-${j}`);
          }
          continue;
        }

        const sourceYs = sources.map((src) => src.y + src.h / 2);
        const minY = Math.min(...sourceYs, yd);
        const maxY = Math.max(...sourceYs, yd);

        sources.forEach((src, idx) => {
          const x = src.x + src.w;
          const y = src.y + src.h / 2;
          pushH(x, y, busX - x, `h-src-${c}-${j}-${idx}`);
        });
        pushV(busX, minY, maxY - minY, `v-${c}-${j}`);
        pushH(busX, yd, xd - busX, `h-dst-${c}-${j}`);
      }
    }
    return L;
  }, [viewRounds, getVisualSourceCellsForSeed, absWrap, t.dark]);

  const canvasNode = (
    <View style={[styles.bracketScaleFrame, scaledFrameStyle]}>
          <View
            onLayout={onCanvasLayout}
            style={[
              styles.roundsRow,
              styles.bracketCanvas,
              mirror && styles.bracketMirrorCanvas,
              hasMeasuredCanvas && activeZoom !== 1 && styles.bracketScaledCanvas,
              scaledCanvasStyle,
            ]}
          >
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              {connectors}
            </View>

            {viewRounds.map((r, colIdx) => (
              <View
                key={colIdx}
                style={[
                  styles.roundCol,
                  {
                    marginRight:
                      canvasOnly && colIdx === viewRounds.length - 1
                        ? 0
                        : ROUND_GAP,
                  },
                ]}
                onLayout={(e) => {
                  const { x, y, width: w, height: h } = e.nativeEvent.layout;
                  setColRect(colIdx, { x, y, w, h });
                }}
              >
                <View style={styles.roundTitleWrap}>
                  <Text
                    style={[
                      styles.roundTitle,
                      { backgroundColor: t.headerBg, color: t.colors.text },
                    ]}
                  >
                    {r.title}
                  </Text>
                </View>

                {(r.seeds || []).map((s, i) => {
              const wrapH = slotHeight(colIdx);
              if (s?.__symmetricSpacer) {
                return (
                  <View
                    key={`${colIdx}-${i}`}
                    style={[
                      styles.seedWrap,
                      {
                        height: wrapH,
                        marginTop: getSeedMarginTop(colIdx, i),
                        paddingVertical: INNER_GAP,
                        opacity: 0,
                      },
                    ]}
                    onLayout={(e: LayoutChangeEvent) => {
                      const { x, y, width: w, height: h } = e.nativeEvent.layout;
                      setWrapRect(colIdx, i, { x, y, w, h });
                    }}
                  />
                );
              }
              const m = s.__match || null;
              const isChampion =
                m &&
                championMatchId &&
                String(m._id) === String(championMatchId) &&
                (m.winner === "A" || m.winner === "B");

              const rawNameA = s.teams?.[0]?.name || "Chưa có đội";
              const rawNameB = s.teams?.[1]?.name || "Chưa có đội";
              const pendingA = isPendingTeamLabel(rawNameA);
              const pendingB = isPendingTeamLabel(rawNameB);
              const nameA = visibleTeamLabel(rawNameA);
              const nameB = visibleTeamLabel(rawNameB);
              const byeCard =
                isByeLabel(rawNameA) ||
                isByeLabel(rawNameB) ||
                m?.seedA?.type === "bye" ||
                m?.seedB?.type === "bye";
              const status = byeCard
                ? "Qua vòng (BYE)"
                : m
                ? resultLabel(m)
                : "Chưa diễn ra";

              return (
                <View
                  key={`${colIdx}-${i}`}
                  style={[
                    styles.seedWrap,
                    {
                      height: wrapH,
                      marginTop: getSeedMarginTop(colIdx, i),
                      paddingVertical: INNER_GAP,
                    },
                  ]}
                  onLayout={(e) => {
                    const { x, y, width: w, height: h } = e.nativeEvent.layout;
                    setWrapRect(colIdx, i, { x, y, w, h });
                  }}
                >
                  <Card
                    onPress={m ? () => onOpenMatch(m) : undefined}
                    disabled={!m}
                    t={t}
                    style={[
                      styles.seedBox,
                      {
                        borderColor: t.colors.border,
                        backgroundColor: t.colors.card,
                        shadowColor: t.dark ? "#000" : "#000",
                      },
                      mirror && styles.bracketMirrorCard,
                      isChampion && styles.seedChampion,
                    ]}
                    onLayout={(e) => {
                      const h = e.nativeEvent.layout.height;
                      if (h && Math.abs(h - baseCardH) > 1) setBaseCardH(h);
                    }}
                  >
                    {isChampion && <Text style={styles.trophy}>🏆</Text>}
                    {m?.status === "live" && <View style={styles.liveDot} />}
                    {/* Header */}
                    {m &&
                      (() => {
                        const code = matchApiCode(m, i + 1);
                        const t0 = timeShort(kickoffTime(m));
                        const c0 = courtName(m);
                        const vid = hasVideo(m);

                        if (byeCard) {
                          return (
                            <View
                              style={[
                                styles.seedHeader,
                                {
                                  borderBottomColor: t.divider,
                                  backgroundColor: t.headerBg,
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.seedHeaderCode,
                                  { color: t.colors.text },
                                ]}
                                numberOfLines={1}
                              >
                                {code}
                              </Text>
                              <View style={styles.seedHeaderMeta}>
                                {!!t0 && (
                                  <Text
                                    style={[
                                      styles.seedHeaderText,
                                      { color: t.colors.text },
                                    ]}
                                    numberOfLines={1}
                                  >
                                    ⏰ {t0}
                                  </Text>
                                )}
                                {!!c0 && (
                                  <Text
                                    style={[
                                      styles.seedHeaderText,
                                      { color: t.colors.text },
                                    ]}
                                    numberOfLines={1}
                                  >
                                    🏟️ {c0}
                                  </Text>
                                )}
                                {!!vid && (
                                  <Pressable
                                    onPress={() => onOpenVideo?.(m)}
                                    hitSlop={8}
                                  >
                                    <Text
                                      style={[
                                        styles.seedHeaderText,
                                        { color: t.colors.text },
                                      ]}
                                    >
                                      🎥
                                    </Text>
                                  </Pressable>
                                )}
                              </View>
                            </View>
                          );
                        }
                        const color = statusColors(m);
                        return (
                          <View
                            style={[
                              styles.seedHeader,
                              {
                                backgroundColor: color.bg,
                                borderBottomColor: t.divider,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.seedHeaderCode,
                                { color: color.fg },
                              ]}
                              numberOfLines={1}
                            >
                              {code}
                            </Text>
                            <View style={styles.seedHeaderMeta}>
                              {!!t0 && (
                                <Text
                                  style={[
                                    styles.seedHeaderText,
                                    { color: color.fg },
                                  ]}
                                  numberOfLines={1}
                                >
                                  ⏰ {t0}
                                </Text>
                              )}
                              {!!c0 && (
                                <Text
                                  style={[
                                    styles.seedHeaderText,
                                    { color: color.fg },
                                  ]}
                                  numberOfLines={1}
                                >
                                  🏟️ {c0}
                                </Text>
                              )}
                              {!!vid && (
                                <Pressable
                                  onPress={() => onOpenVideo?.(m)}
                                  hitSlop={8}
                                >
                                  <Text
                                    style={[
                                      styles.seedHeaderText,
                                      { color: color.fg },
                                    ]}
                                  >
                                    🎥
                                  </Text>
                                </Pressable>
                              )}
                            </View>
                          </View>
                        );
                      })()}
                    {/* Content */}
                    <View style={styles.seedContent}>
                      <View style={{ flex: 1 }}>
                        {(() => {
                          const widA = m?.winner === "A";
                          const widB = m?.winner === "B";
                          const aId = m?.pairA?._id && String(m.pairA._id);
                          const bId = m?.pairB?._id && String(m.pairB._id);
                          const hiA =
                            focusRegId &&
                            aId &&
                            String(focusRegId) === String(aId);
                          const hiB =
                            focusRegId &&
                            bId &&
                            String(focusRegId) === String(bId);

                          return (
                            <>
                              <Pressable
                                onPress={() =>
                                  aId && setFocusRegId?.(hiA ? null : aId)
                                }
                                hitSlop={6}
                                disabled={!aId}
                                style={[
                                  styles.teamLine,
                                  widA && styles.teamWin,
                                  hiA && styles.teamHighlight,
                                ]}
                              >
                                <Text
                                  numberOfLines={3}
                                  style={[
                                    styles.teamText,
                                    { color: t.colors.text },
                                    widA && styles.teamTextWin,
                                    pendingA && [
                                      styles.teamTextPending,
                                      { color: t.subtext },
                                    ],
                                  ]}
                                >
                                  {nameA}
                                  {!pendingA && (
                                    <Text
                                      style={[
                                        styles.sideTag,
                                        { color: t.subtext },
                                      ]}
                                    >
                                      (A)
                                    </Text>
                                  )}
                                </Text>
                              </Pressable>
                              <Pressable
                                onPress={() =>
                                  bId && setFocusRegId?.(hiB ? null : bId)
                                }
                                hitSlop={6}
                                disabled={!bId}
                                style={[
                                  styles.teamLine,
                                  widB && styles.teamWin,
                                  hiB && styles.teamHighlight,
                                ]}
                              >
                                <Text
                                  numberOfLines={3}
                                  style={[
                                    styles.teamText,
                                    { color: t.colors.text },
                                    widB && styles.teamTextWin,
                                    pendingB && [
                                      styles.teamTextPending,
                                      { color: t.subtext },
                                    ],
                                  ]}
                                >
                                  {nameB}
                                  {!pendingB && (
                                    <Text
                                      style={[
                                        styles.sideTag,
                                        { color: t.subtext },
                                      ]}
                                    >
                                      {" "}
                                      (B)
                                    </Text>
                                  )}
                                </Text>
                              </Pressable>
                            </>
                          );
                        })()}
                      </View>

                      <View style={styles.scoreBox}>
                        <Text
                          style={[styles.scoreText, { color: t.colors.text }]}
                        >
                          {m && !byeCard ? computeRightScore(m) : ""}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.seedMeta, { color: t.subtext }]}>
                      {status}
                    </Text>
                  </Card>
                </View>
              );
                })}
              </View>
            ))}
          </View>
        </View>
  );

  if (canvasOnly) return canvasNode;

  return (
    <View>
      <View style={styles.bracketZoomWrap}>
        <ZoomControlsRN
          zoom={zoom}
          onZoomOut={zoomOut}
          onZoomIn={zoomIn}
          onReset={resetZoom}
          t={t}
        />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
        directionalLockEnabled
        contentContainerStyle={styles.bracketScrollContent}
      >
        {canvasNode}
      </ScrollView>
    </View>
  );
};

/* ===================== Component chính (RN) ===================== */
const SymmetricKnockoutColumns = ({
  rounds,
  onOpenMatch,
  championMatchId,
  focusRegId,
  setFocusRegId,
  onOpenVideo,
  t,
}: SymmetricKnockoutColumnsProps) => {
  const { width: windowWidth } = useWindowDimensions();
  const initialZoom = useMemo(
    () => getInitialBracketZoom(windowWidth),
    [windowWidth]
  );
  const [zoom, setZoom] = useState(initialZoom);
  const [contentSize, setContentSize] = useState({ width: 0, height: 0 });
  const [bridgeRects, setBridgeRects] = useState<
    Record<string, BracketLayoutRect>
  >({});
  const zoomTouchedRef = useRef(false);

  useEffect(() => {
    if (!zoomTouchedRef.current) setZoom(initialZoom);
  }, [initialZoom]);

  const setUserZoom = useCallback((next: number | ((value: number) => number)) => {
    zoomTouchedRef.current = true;
    setZoom((prev) =>
      clampBracketZoom(typeof next === "function" ? next(prev) : next)
    );
  }, []);

  const zoomOut = useCallback(
    () => setUserZoom((z) => Number((z - BRACKET_ZOOM_STEP).toFixed(2))),
    [setUserZoom]
  );
  const zoomIn = useCallback(
    () => setUserZoom((z) => Number((z + BRACKET_ZOOM_STEP).toFixed(2))),
    [setUserZoom]
  );
  const resetZoom = useCallback(() => {
    zoomTouchedRef.current = false;
    setZoom(initialZoom);
  }, [initialZoom]);

  const onContentLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setContentSize((prev) =>
      Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1
        ? prev
        : { width, height }
    );
  }, []);

  const setBridgeRect = useCallback(
    (key: string, layout: BracketLayoutInput) => {
      if (!layout) {
        setBridgeRects((prev) => {
          if (!prev[key]) return prev;
          const next = { ...prev };
          delete next[key];
          return next;
        });
        return;
      }

      const measured = layout as Partial<BracketLayoutRect> & {
        width?: number;
        height?: number;
      };
      const next = {
        x: layout.x,
        y: layout.y,
        w: Number.isFinite(measured.w)
          ? Number(measured.w)
          : Number(measured.width),
        h: Number.isFinite(measured.h)
          ? Number(measured.h)
          : Number(measured.height),
      };
      setBridgeRects((prev) => {
        const current = prev[key];
        if (
          current &&
          Math.abs(current.x - next.x) < 1 &&
          Math.abs(current.y - next.y) < 1 &&
          Math.abs(current.w - next.w) < 1 &&
          Math.abs(current.h - next.h) < 1
        ) {
          return prev;
        }
        return { ...prev, [key]: next };
      });
    },
    []
  );
  const setLeftTerminalRect = useCallback(
    (rect: BracketLayoutRect | null) => setBridgeRect("leftTerminal", rect),
    [setBridgeRect]
  );
  const setFinalTerminalRect = useCallback(
    (rect: BracketLayoutRect | null) => setBridgeRect("finalTerminal", rect),
    [setBridgeRect]
  );
  const setRightTerminalRect = useCallback(
    (rect: BracketLayoutRect | null) => setBridgeRect("rightTerminal", rect),
    [setBridgeRect]
  );

  const slotCounts = useMemo(() => buildSymmetricSlotCounts(rounds), [rounds]);
  const { leftRounds, rightRounds, finalRound } = useMemo(() => {
    const safeRounds = rounds || [];
    const branchRounds = safeRounds.slice(0, -1);
    const final = safeRounds[safeRounds.length - 1] || null;
    return {
      leftRounds: branchRounds
        .map((round: any, index: number) =>
          splitKnockoutRound(round, "left", slotCounts[index])
        )
        .filter((round: any) => (round?.seeds || []).length > 0),
      rightRounds: branchRounds
        .map((round: any, index: number) =>
          splitKnockoutRound(round, "right", slotCounts[index])
        )
        .filter((round: any) => (round?.seeds || []).length > 0),
      finalRound: final,
    };
  }, [rounds, slotCounts]);

  const finalOnlyRounds = finalRound
    ? [{ ...finalRound, seeds: finalRound.seeds?.slice(0, 1) || [] }]
    : [];
  const hasBranches = leftRounds.length > 0 || rightRounds.length > 0;
  const hasMeasuredContent = contentSize.width > 0 && contentSize.height > 0;
  const scaledFrameStyle = hasMeasuredContent
    ? {
        width: Math.ceil(contentSize.width * zoom),
        height: Math.ceil(contentSize.height * zoom),
      }
    : null;
  const scaledContentStyle =
    hasMeasuredContent && zoom !== 1
      ? ({
          transform: [{ scale: zoom }],
          transformOrigin: "top left",
        } as any)
      : null;

  const bridgeLines = useMemo(() => {
    const leftWrap = bridgeRects.leftWrap;
    const rightWrap = bridgeRects.rightWrap;
    const finalColumn = bridgeRects.finalColumn;
    const finalWrap = bridgeRects.finalWrap;
    const leftTerminal = bridgeRects.leftTerminal;
    const rightTerminal = bridgeRects.rightTerminal;
    const finalTerminal = bridgeRects.finalTerminal;

    if (!finalColumn || !finalWrap || !finalTerminal) return null;

    const absoluteRect = (
      outer?: BracketLayoutRect,
      inner?: BracketLayoutRect,
      rect?: BracketLayoutRect
    ): BracketLayoutRect | null =>
      outer && inner && rect
        ? {
            x: outer.x + inner.x + rect.x,
            y: outer.y + inner.y + rect.y,
            w: rect.w,
            h: rect.h,
          }
        : null;
    const branchRect = (
      outer?: BracketLayoutRect,
      rect?: BracketLayoutRect
    ): BracketLayoutRect | null =>
      outer && rect
        ? {
            x: outer.x + rect.x,
            y: outer.y + rect.y,
            w: rect.w,
            h: rect.h,
          }
        : null;

    const finalRect = absoluteRect(finalColumn, finalWrap, finalTerminal);
    if (!finalRect) return null;
    const leftRect = branchRect(leftWrap, leftTerminal);
    const rightRect = branchRect(rightWrap, rightTerminal);

    const color = "rgba(25,118,210,0.42)";
    const makeHorizontal = (
      fromX: number,
      toX: number,
      y: number,
      key: string
    ): React.ReactNode | null => {
      const left = Math.floor(Math.min(fromX, toX));
      const right = Math.ceil(Math.max(fromX, toX));
      const width = right - left;
      if (width <= 0) return null;
      return (
        <View
          key={key}
          pointerEvents="none"
          style={[
            styles.symmetricFinalBridge,
            {
              left,
              top: Math.round(y - BRACKET_CONNECTOR_THICKNESS / 2),
              width,
              backgroundColor: color,
            },
          ]}
        />
      );
    };
    const makeVertical = (
      x: number,
      fromY: number,
      toY: number,
      key: string
    ): React.ReactNode | null => {
      const top = Math.floor(Math.min(fromY, toY));
      const bottom = Math.ceil(Math.max(fromY, toY));
      const height = bottom - top;
      if (height <= 0) return null;
      return (
        <View
          key={key}
          pointerEvents="none"
          style={[
            styles.symmetricFinalBridge,
            {
              left: Math.round(x - BRACKET_CONNECTOR_THICKNESS / 2),
              top,
              width: BRACKET_CONNECTOR_THICKNESS,
              height,
              backgroundColor: color,
            },
          ]}
        />
      );
    };
    const makeConnector = (
      fromX: number,
      fromY: number,
      toX: number,
      toY: number,
      key: string
    ): Array<React.ReactNode | null> => {
      if (Math.abs(fromY - toY) < 1) {
        return [makeHorizontal(fromX, toX, fromY, `${key}-h`)].filter(Boolean);
      }

      const midX = Math.round((fromX + toX) / 2);
      return [
        makeHorizontal(fromX, midX, fromY, `${key}-h1`),
        makeVertical(midX, fromY, toY, `${key}-v`),
        makeHorizontal(midX, toX, toY, `${key}-h2`),
      ].filter(Boolean);
    };

    return [
      ...(leftRect
        ? makeConnector(
            leftRect.x + leftRect.w,
            leftRect.y + leftRect.h / 2,
            finalRect.x,
            finalRect.y + finalRect.h / 2,
            "left"
          )
        : []),
      ...(rightRect
        ? makeConnector(
            finalRect.x + finalRect.w,
            finalRect.y + finalRect.h / 2,
            rightRect.x,
            rightRect.y + rightRect.h / 2,
            "right"
          )
        : []),
    ].filter(Boolean);
  }, [bridgeRects]);

  if (!hasBranches) {
    return (
      <BracketColumns
        rounds={finalOnlyRounds}
        onOpenMatch={onOpenMatch}
        championMatchId={championMatchId}
        focusRegId={focusRegId}
        setFocusRegId={setFocusRegId}
        onOpenVideo={onOpenVideo}
        t={t}
      />
    );
  }

  return (
    <View>
      <View style={styles.bracketZoomWrap}>
        <ZoomControlsRN
          zoom={zoom}
          onZoomOut={zoomOut}
          onZoomIn={zoomIn}
          onReset={resetZoom}
          t={t}
        />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
        directionalLockEnabled
        contentContainerStyle={styles.bracketScrollContent}
      >
        <View style={[styles.bracketScaleFrame, scaledFrameStyle]}>
          <View
            onLayout={onContentLayout}
            style={[
              styles.symmetricKoRow,
              hasMeasuredContent && zoom !== 1 && styles.bracketScaledCanvas,
              scaledContentStyle,
            ]}
          >
            <View
              onLayout={(e: LayoutChangeEvent) =>
                setBridgeRect("leftWrap", e.nativeEvent.layout)
              }
              style={styles.symmetricBranchWrap}
            >
              <BracketColumns
                rounds={leftRounds}
                onOpenMatch={onOpenMatch}
                championMatchId={championMatchId}
                focusRegId={focusRegId}
                setFocusRegId={setFocusRegId}
                onOpenVideo={onOpenVideo}
                t={t}
                canvasOnly
                externalZoom={1}
                onTerminalLayout={setLeftTerminalRect}
              />
            </View>

            <View pointerEvents="none" style={styles.symmetricBridgeLayer}>
              {bridgeLines}
            </View>

            <View
              onLayout={(e: LayoutChangeEvent) =>
                setBridgeRect("finalColumn", e.nativeEvent.layout)
              }
              style={styles.symmetricFinalColumn}
            >
              <View
                onLayout={(e: LayoutChangeEvent) =>
                  setBridgeRect("finalWrap", e.nativeEvent.layout)
                }
                style={styles.symmetricFinalCardWrap}
              >
                <BracketColumns
                  rounds={finalOnlyRounds}
                  onOpenMatch={onOpenMatch}
                  championMatchId={championMatchId}
                  focusRegId={focusRegId}
                  setFocusRegId={setFocusRegId}
                  onOpenVideo={onOpenVideo}
                  t={t}
                  canvasOnly
                  externalZoom={1}
                  onTerminalLayout={setFinalTerminalRect}
                />
              </View>
            </View>

            <View
              onLayout={(e: LayoutChangeEvent) =>
                setBridgeRect("rightWrap", e.nativeEvent.layout)
              }
              style={styles.symmetricBranchWrap}
            >
              <BracketColumns
                rounds={rightRounds}
                onOpenMatch={onOpenMatch}
                championMatchId={championMatchId}
                focusRegId={focusRegId}
                setFocusRegId={setFocusRegId}
                onOpenVideo={onOpenVideo}
                t={t}
                canvasOnly
                externalZoom={1}
                mirror
                onTerminalLayout={setRightTerminalRect}
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

export default function TournamentBracketRN({ tourId: tourIdProp }) {
  const t = useTokens();
  const route = useRoute();
  const socket = useSocket();
  const userInfo = useSelector((s) => s.auth?.userInfo);
  const myUserId = useMemo(() => getUserIdFromUserInfo(userInfo), [userInfo]);
  const [focusRegId, setFocusRegId] = useState(null);
  const [videoState, setVideoState] = useState({ visible: false, url: "" });
  const openVideoFor = useCallback((m) => {
    const u = getVideoUrl(m);
    if (u) setVideoState({ visible: true, url: u });
  }, []);
  const closeVideo = useCallback(
    () => setVideoState({ visible: false, url: "" }),
    []
  );
  const [selectedGroupKeys, setSelectedGroupKeys] = useState(new Set());
  const [onlyMyGroups, setOnlyMyGroups] = useState(false);

  const tourId =
    tourIdProp ||
    route?.params?.id ||
    route?.params?.tourId ||
    route?.params?.tournamentId;

  const {
    data: tour,
    isLoading: l1,
    error: e1,
    refetch: refetchTour,
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
    { tournamentId: tourId, view: "bracket" },
    {
      skip: !tourId,
      refetchOnMountOrArgChange: false,
      refetchOnFocus: false,
      refetchOnReconnect: false,
    }
  );

  const loading = l1 || l2 || l3;
  const error = e1 || e2 || e3;

  /* ===== live layer ===== */
  const liveMapRef = useRef(new Map());
  const [liveBump, setLiveBump] = useState(0);
  const pendingRef = useRef(new Map());
  const rafRef = useRef(null);
  const bracketIdsRef = useRef(new Set());

  const flushPending = useCallback(() => {
    if (!pendingRef.current.size) return;
    const mp = liveMapRef.current;
    let changed = false;
    for (const [id, inc] of pendingRef.current) {
      const cur = mp.get(id);
      if (cur && !isNewerOrEqualMatchPayload(cur, inc)) continue;
      const merged =
        mergeMatchPayload(cur, inc, cur || tour) ||
        normalizeMatchDisplay(inc, cur || tour);
      if (!merged) continue;
      mp.set(id, merged);
      changed = true;
    }
    pendingRef.current.clear();
    if (changed) setLiveBump((x) => x + 1);
  }, [tour]);

  const queueUpsert = useCallback(
    (incRaw) => {
      const id = getMatchPayloadId(incRaw);
      if (!id) return;
      if (isLightweightMatchPayload(incRaw)) {
        socket?.emit("match:snapshot:request", { matchId: id });
        return;
      }
      const payload = incRaw?.data ?? incRaw?.match ?? incRaw;
      const key = String(id);
      const inc = normalizeMatchDisplay(payload, tour);
      const base = pendingRef.current.get(key) || liveMapRef.current.get(key);
      if (base && !isNewerOrEqualMatchPayload(base, inc)) return;
      pendingRef.current.set(
        key,
        mergeMatchPayload(base, inc, base || tour) ||
          normalizeMatchDisplay(inc, base || tour)
      );
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        flushPending();
      });
    },
    [flushPending, socket, tour]
  );

  const filterSheetRef = useRef(null);
  const openFilterSheet = useCallback(() => {
    filterSheetRef.current?.present();
  }, []);
  const closeFilterSheet = useCallback(
    () => filterSheetRef.current?.dismiss(),
    []
  );

  const onToggleKey = useCallback((key) => {
    setSelectedGroupKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      await Promise.all([
        refetchTour?.(),
        refetchBrackets?.(),
        refetchMatches?.(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [refetchTour, refetchBrackets, refetchMatches]);

  const bracketIds = useMemo(
    () => (brackets || []).map((b) => String(b._id)),
    [brackets]
  );
  useEffect(() => {
    bracketIdsRef.current = new Set(bracketIds.filter(Boolean));
  }, [bracketIds]);

  useSocketRoomSet(socket, bracketIds, {
    subscribeEvent: "draw:subscribe",
    unsubscribeEvent: "draw:unsubscribe",
    payloadKey: "bracketId",
    onResync: () => {
      handleRefresh();
    },
  });
  const initialSeededRef = useRef(false);

  useEffect(() => {
    if (!Array.isArray(allMatchesFetched)) return;

    if (!initialSeededRef.current) {
      const mp = new Map();
      for (const m of allMatchesFetched.map((item) =>
        normalizeMatchDisplay(item, tour)
      )) {
        if (m?._id) mp.set(String(m._id), m);
      }
      liveMapRef.current = mp;
      initialSeededRef.current = true;
      setLiveBump((x) => x + 1);
      return;
    }

    const mp = liveMapRef.current || new Map();
    let changed = false;

    const seen = new Set();
    for (const m of allMatchesFetched.map((item) =>
      normalizeMatchDisplay(item, tour)
    )) {
      if (!m?._id) continue;
      const id = String(m._id);
      seen.add(id);

      const cur = mp.get(id);
      if (!cur) {
        mp.set(id, m);
        changed = true;
        continue;
      }
      if (!isNewerOrEqualMatchPayload(cur, m)) continue;
      const merged =
        mergeMatchPayload(cur, m, cur || tour) ||
        normalizeMatchDisplay(m, cur || tour);
      if (!merged) continue;
      if (JSON.stringify(merged) === JSON.stringify(cur)) continue;
      mp.set(id, merged);
      changed = true;
    }

    if (changed) {
      liveMapRef.current = mp;
      setLiveBump((x) => x + 1);
    }
  }, [allMatchesFetched, tour]);

  useEffect(() => {
    if (!socket) return;
    const onUpsert = (payload) => queueUpsert(payload);
    socket.on("draw:match:update", onUpsert);

    return () => {
      socket.off("draw:match:update", onUpsert);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [socket, queueUpsert, tourId]);

  const matchesMerged = useMemo(
    () =>
      Array.from(liveMapRef.current.values()).filter(
        (m) => String(m.tournament?._id || m.tournament) === String(tourId)
      ),
    [tourId, liveBump]
  );

  const myRegIds = useMemo(() => {
    const set = new Set();
    if (Array.isArray(tour?.registrations)) {
      tour.registrations.forEach((r) => {
        if (regIncludesUser(r, myUserId)) {
          const rid = String(r?._id || r?.id || "");
          if (rid) set.add(rid);
        }
      });
    }
    const pushIfMine = (pair) => {
      if (!pair) return;
      const tmpReg = { pair };
      if (regIncludesUser(tmpReg, myUserId)) {
        if (pair?._id) set.add(String(pair._id));
        if (pair?.registrationId) set.add(String(pair.registrationId));
        if (pair?.regId) set.add(String(pair.regId));
      }
    };
    (matchesMerged || []).forEach((m) => {
      pushIfMine(m?.pairA);
      pushIfMine(m?.pairB);
    });
    return set;
  }, [tour?.registrations, matchesMerged, myUserId]);

  const byBracket = useMemo(() => {
    const m = {};
    (brackets || []).forEach((b) => (m[b._id] = []));
    (matchesMerged || []).forEach((mt) => {
      const bid = mt.bracket?._id || mt.bracket;
      if (m[bid]) m[bid].push(mt);
    });
    return m;
  }, [brackets, matchesMerged]);

  const bracketById = useMemo(() => {
    const mp = new Map();
    (brackets || []).forEach((b) => {
      const id = String(b?._id || "");
      if (id) mp.set(id, b);
    });
    return mp;
  }, [brackets]);

  const matchRefIndex = useMemo(() => {
    const byId = new Map();
    const byBracketRoundOrder = new Map();
    const byStageRoundOrder = new Map();
    const byDisplayCode = new Map();

    for (const m of matchesMerged || []) {
      const id = String(m?._id || "");
      const bracketId = String(m?.bracket?._id || m?.bracket || "");
      const bracketObj =
        (m?.bracket && typeof m.bracket === "object" ? m.bracket : null) ||
        bracketById.get(bracketId) ||
        null;
      const stageNum = Number(
        bracketObj?.stage ?? m?.stage ?? m?.stageIndex ?? NaN
      );
      const roundNum = Number(m?.round);
      const orderNum = Number(m?.order);

      if (id) byId.set(id, m);

      const codeCandidates = [
        m?.displayCode,
        m?.codeResolved,
        m?.codeDisplay,
        m?.globalCodeV,
        m?.globalCode,
        m?.code,
        m?.matchCode,
        m?.slotCode,
        m?.bracketCode,
        m?.labelKey,
        m?.meta?.code,
        m?.meta?.label,
      ];
      for (const value of codeCandidates) {
        const code = extractDisplayCodeText(value);
        if (code) byDisplayCode.set(code.toUpperCase(), m);
      }

      if (bracketId && Number.isFinite(roundNum) && Number.isFinite(orderNum)) {
        byBracketRoundOrder.set(`${bracketId}:${roundNum}:${orderNum}`, m);
      }
      if (Number.isFinite(stageNum) && Number.isFinite(roundNum) && Number.isFinite(orderNum)) {
        byStageRoundOrder.set(`${stageNum}:${roundNum}:${orderNum}`, m);
      }
    }

    return { byId, byBracketRoundOrder, byStageRoundOrder, byDisplayCode };
  }, [matchesMerged, bracketById]);

  const baseRoundStartByBracketId = useMemo(() => {
    const out = new Map();
    let sum = 0;

    for (const bracket of brackets || []) {
      const bracketId = String(bracket?._id || "");
      if (!bracketId) continue;
      out.set(bracketId, sum + 1);
      sum += roundsCountForBracket(bracket, byBracket?.[bracket._id] || []);
    }

    return out;
  }, [brackets, byBracket]);

  const firstBracketIdByStage = useMemo(() => {
    const out = new Map();

    for (const bracket of brackets || []) {
      const bracketId = String(bracket?._id || "");
      const stageNum = Number(bracket?.stage ?? bracket?.stageIndex ?? NaN);
      if (!bracketId || !Number.isFinite(stageNum) || out.has(stageNum)) {
        continue;
      }
      out.set(stageNum, bracketId);
    }

    return out;
  }, [brackets]);

  const completedGroupAliasSet = useMemo(
    () => buildCompletedGroupAliasSet(brackets, byBracket),
    [brackets, byBracket]
  );

  const [tab, setTab] = useState(0);
  useEffect(() => {
    if (tab >= (brackets?.length || 0)) setTab(0);
  }, [brackets?.length]);

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

  const findSourceMatchFromSeed = useCallback(
    (ownerMatch, seed) => {
      if (!seed) return null;

      const matchId = String(seed?.ref?.matchId || "");
      if (matchId && matchRefIndex.byId.has(matchId)) {
        return matchRefIndex.byId.get(matchId);
      }

      const labelCode = extractDisplayCodeText(seed?.label);
      if (labelCode) {
        const labelHit = matchRefIndex.byDisplayCode.get(labelCode.toUpperCase());
        if (labelHit) return labelHit;
      }

      const roundNum = Number(seed?.ref?.round);
      const orderNum = Number(seed?.ref?.order);
      if (!Number.isFinite(roundNum) || !Number.isFinite(orderNum)) {
        return null;
      }

      const stageNum = Number(seed?.ref?.stageIndex ?? seed?.ref?.stage);
      if (Number.isFinite(stageNum)) {
        const hit = matchRefIndex.byStageRoundOrder.get(
          `${stageNum}:${roundNum}:${orderNum}`
        );
        if (hit) return hit;
      }

      const bracketId = String(
        ownerMatch?.bracket?._id || ownerMatch?.bracket || ""
      );
      if (bracketId) {
        return (
          matchRefIndex.byBracketRoundOrder.get(
            `${bracketId}:${roundNum}:${orderNum}`
          ) || null
        );
      }

      return null;
    },
    [matchRefIndex]
  );

  const getDisplayCodeForMatch = useCallback(
    (sourceMatch) => {
      if (!sourceMatch) return "";

      const candidates = [
        sourceMatch?.displayCode,
        sourceMatch?.codeDisplay,
        sourceMatch?.codeResolved,
        sourceMatch?.globalCodeV,
        sourceMatch?.globalCode,
        sourceMatch?.code,
        sourceMatch?.matchCode,
        sourceMatch?.slotCode,
        sourceMatch?.bracketCode,
        sourceMatch?.labelKey,
        sourceMatch?.meta?.code,
        sourceMatch?.meta?.label,
      ];
      for (const candidate of candidates) {
        const hit = extractDisplayCodeText(candidate);
        if (hit) return hit;
      }

      const bracketId = String(
        sourceMatch?.bracket?._id || sourceMatch?.bracket || ""
      );
      const baseRoundStart = baseRoundStartByBracketId.get(bracketId);
      const roundNum = Number(sourceMatch?.round);
      const orderNum = Number(sourceMatch?.order);
      const branch = String(
        sourceMatch?.branch || sourceMatch?.phase || ""
      ).toLowerCase();
      const isLosersBranch = branch === "lb" || branch === "losers";

      if (
        Number.isFinite(baseRoundStart) &&
        Number.isFinite(roundNum) &&
        Number.isFinite(orderNum)
      ) {
        const prefix = `V${baseRoundStart + roundNum - 1}`;
        return isLosersBranch
          ? `${prefix}-NT-T${orderNum + 1}`
          : `${prefix}-T${orderNum + 1}`;
      }

      return "";
    },
    [baseRoundStartByBracketId]
  );

  const resolveSeedReferenceLabel = useCallback(
    (seed, ownerMatch = null) => {
      if (!seed || !seed.type) return seedLabel(seed);

      const type = String(seed?.type || "");
      const isWinnerSeed =
        type === "stageMatchWinner" || type === "matchWinner";
      const isLoserSeed =
        type === "stageMatchLoser" || type === "matchLoser";

      if (!isWinnerSeed && !isLoserSeed) return seedLabel(seed);

      const prefix = isLoserSeed ? "L" : "W";
      const sourceMatch = findSourceMatchFromSeed(ownerMatch, seed);
      const sourceCode = getDisplayCodeForMatch(sourceMatch);
      if (sourceCode) return `${prefix}-${sourceCode}`;

      const stageNum = Number(seed?.ref?.stageIndex ?? seed?.ref?.stage);
      const roundNum = Number(seed?.ref?.round);
      const orderNum = Number(seed?.ref?.order);
      const bracketId = firstBracketIdByStage.get(stageNum);
      const baseRoundStart = bracketId
        ? baseRoundStartByBracketId.get(bracketId)
        : null;

      if (
        Number.isFinite(baseRoundStart) &&
        Number.isFinite(roundNum) &&
        Number.isFinite(orderNum)
      ) {
        return `${prefix}-V${baseRoundStart + roundNum - 1}-T${orderNum + 1}`;
      }

      const rawCode = extractDisplayCodeText(seed?.label);
      if (rawCode) return `${prefix}-${rawCode}`;

      return seedLabel({ ...seed, label: "" });
    },
    [
      findSourceMatchFromSeed,
      getDisplayCodeForMatch,
      firstBracketIdByStage,
      baseRoundStartByBracketId,
    ]
  );

  const getPlannedSeedForMatchSide = useCallback(
    (match, side) => {
      if (!match || !current) return null;

      const localRound = Number(match?.round || 1);
      const codeOrder = Number(
        extractDisplayCodeText(match?.code || match?.displayCode || "").match(
          /-T(\d+)/i
        )?.[1]
      );
      const localOrder = Number(
        match?.order ??
          match?.meta?.order ??
          (Number.isFinite(codeOrder) ? codeOrder - 1 : NaN)
      );
      if (!Number.isFinite(localOrder)) return null;

      const matchBracketId = String(match?.bracket?._id || match?.bracket || "");
      const currentBracketId = String(current?._id || "");
      const matchBracket =
        match?.bracket && typeof match.bracket === "object" ? match.bracket : null;
      const sourceBracket =
        matchBracketId && currentBracketId && matchBracketId === currentBracketId
          ? current
          : matchBracket;
      const sourceType = String(
        sourceBracket?.type || matchBracket?.type || match?.format || ""
      ).toLowerCase();
      if (sourceType !== "knockout") return null;

      if (localRound > 1) {
        const bracketMatches = matchBracketId
          ? byBracket?.[matchBracketId] || []
          : currentMatches;
        const sameBranch = (candidate) =>
          String(candidate?.branch || "main") ===
            String(match?.branch || "main") &&
          String(candidate?.phase || "") === String(match?.phase || "") &&
          isThirdPlaceMatch(candidate) === isThirdPlaceMatch(match);
        const byOrder = (a, b) => Number(a?.order || 0) - Number(b?.order || 0);
        const currentRoundMatches = bracketMatches
          .filter((candidate) => Number(candidate?.round || 1) === localRound)
          .filter(sameBranch)
          .sort(byOrder);
        const currentIndex = currentRoundMatches.findIndex(
          (candidate) => String(candidate?._id || "") === String(match?._id || "")
        );
        const sourceSlot =
          (currentIndex >= 0 ? currentIndex : localOrder) * 2 +
          (side === "B" ? 1 : 0);
        const previousRoundMatches = bracketMatches
          .filter((candidate) => Number(candidate?.round || 1) === localRound - 1)
          .filter(sameBranch)
          .sort(byOrder);
        const sourceMatch = previousRoundMatches[sourceSlot] || null;
        const sourceRound = Number(sourceMatch?.round ?? localRound - 1);
        const sourceOrder = Number(
          sourceMatch?.order ?? localOrder * 2 + (side === "B" ? 1 : 0)
        );
        const stageIndex =
          Number(
            sourceMatch?.bracket?.stage ??
              sourceBracket?.stage ??
              matchBracket?.stage ??
              current?.stage ??
              current?.stageIndex ??
              0
          ) || 0;
        const ref = {
          stage: stageIndex,
          stageIndex,
          round: sourceRound,
          order: sourceOrder,
        };
        if (sourceMatch?._id) ref.matchId = sourceMatch._id;

        return {
          type: "stageMatchWinner",
          ref,
          label: `W-V${localRound - 1}-T${sourceOrder + 1}`,
        };
      }

      const seedRows = Array.isArray(sourceBracket?.prefill?.seeds)
        ? sourceBracket.prefill.seeds
        : Array.isArray(sourceBracket?.config?.blueprint?.seeds)
        ? sourceBracket.config.blueprint.seeds
        : [];
      if (!seedRows.length) return null;

      const pairNo = localOrder + 1;
      const planned =
        seedRows.find((entry) => Number(entry?.pair) === pairNo) ||
        seedRows[localOrder] ||
        null;
      const plannedSeed = side === "A" ? planned?.A : planned?.B;
      return plannedSeed?.type ? plannedSeed : null;
    },
    [byBracket, current, currentMatches]
  );

  const [isFullscreen, setIsFullscreen] = useState(false);
  const enterFullscreen = useCallback(() => setIsFullscreen(true), []);
  const exitFullscreen = useCallback(() => setIsFullscreen(false), []);
  useEffect(() => {
    (async () => {
      try {
        await ScreenOrientation.lockAsync(
          isFullscreen
            ? ScreenOrientation.OrientationLock.LANDSCAPE
            : ScreenOrientation.OrientationLock.PORTRAIT_UP
        );
      } catch {}
    })();
  }, [isFullscreen]);
  useEffect(() => {
    return () => {
      ScreenOrientation.unlockAsync().catch(() => {});
    };
  }, []);

  const resolveSideLabel = useCallback(
    (m, side) => {
      const eventType = tour?.eventType;
      if (!m) return "Chưa có đội";

      const rawSeed = side === "A" ? m.seedA : m.seedB;
      const pair = side === "A" ? m.pairA : m.pairB;
      const plannedSeed = getPlannedSeedForMatchSide(m, side);
      const seedType = String(rawSeed?.type || "");
      const isEmptyRegistrationSeed =
        seedType === "registration" &&
        !rawSeed?.label &&
        !rawSeed?.ref?.registration &&
        !rawSeed?.ref?.reg &&
        !rawSeed?.ref?.id &&
        !rawSeed?.ref?._id;
      const seed =
        rawSeed?.type && !isEmptyRegistrationSeed
          ? rawSeed
          : plannedSeed || rawSeed;

      if (hasResolvedPair(pair)) return pairLabelNickOnly(pair, eventType, m);

      if (seed?.type === "groupRank") {
        const st = Number(seed.ref?.stage ?? seed.ref?.stageIndex ?? 0) || 0;
        const gc = String(seed.ref?.groupCode ?? "").trim();

        const groupReady = gc && completedGroupAliasSet.has(`${st}|${gc}`);
        if (!groupReady) {
          return resolveSeedReferenceLabel(seed, m);
        }

        const inferred =
          resolvePairFromGroupRankSeed(seed, brackets, byBracket, eventType) ||
          null;
        if (inferred) return pairLabelNickOnly(inferred, eventType, tour);

        return seedLabel(seed);
      }

      const prev = side === "A" ? m.previousA : m.previousB;
      if (prev) {
        const prevId =
          typeof prev === "object" && prev?._id
            ? String(prev._id)
            : String(prev);
        const pm =
          matchIndex.get(prevId) || (typeof prev === "object" ? prev : null);

        if (pm && isByeMatchObj(pm)) {
          const isLoserSeed =
            seed?.type === "stageMatchLoser" || seed?.type === "matchLoser";
          if (isLoserSeed) return "BYE";

          const byeA = isByeSeed(pm?.seedA);
          const byeB = isByeSeed(pm?.seedB);
          const winSide = byeA && byeB ? null : byeA ? "B" : byeB ? "A" : null;
          if (!winSide) return "BYE";

          if (winSide) {
            const carried = resolveSideLabel(pm, winSide);
            if (isUsefulSideLabel(carried)) return carried;

            const fromSeed = resolveSeedReferenceLabel(
              pm[`seed${winSide}`],
              pm
            );
            if (isUsefulSideLabel(fromSeed)) return fromSeed;

            const winPair = pm[`pair${winSide}`];
            if (hasResolvedPair(winPair)) {
              return pairLabelNickOnly(winPair, eventType, pm);
            }
          }

          const carriedCode = getDisplayCodeForMatch(pm);
          if (carriedCode) return `W-${carriedCode}`;
          const refLabel = resolveSeedReferenceLabel(seed, m);
          if (isUsefulSideLabel(refLabel)) return refLabel;
        }

        if (pm && pm.status === "finished" && pm.winner) {
          const winnerSide = pm.winner === "A" ? "A" : "B";
          const wp = winnerSide === "A" ? pm.pairA : pm.pairB;
          if (hasResolvedPair(wp)) return pairLabelNickOnly(wp, eventType, pm);

          const carried = resolveSideLabel(pm, winnerSide);
          if (isUsefulSideLabel(carried)) return carried;
        }

        const carriedCode = getDisplayCodeForMatch(pm);
        if (carriedCode) return `W-${carriedCode}`;

        const refLabel = resolveSeedReferenceLabel(seed, m);
        if (isUsefulSideLabel(refLabel)) return refLabel;

        return smartDepLabel(m, prev);
      }

      if (seed && seed.type) {
        const sourceRefLabel = normalizeSeedRefLabel(
          resolveSeedReferenceLabel(seed, m)
        );
        const sourceMatch = findSourceMatchFromSeed(m, seed);
        const isWinnerSeed =
          seed?.type === "stageMatchWinner" || seed?.type === "matchWinner";
        const isLoserSeed =
          seed?.type === "stageMatchLoser" || seed?.type === "matchLoser";

        if (
          sourceMatch &&
          (isWinnerSeed || isLoserSeed) &&
          isByeMatchObj(sourceMatch)
        ) {
          const byeA = isByeSeed(sourceMatch?.seedA);
          const byeB = isByeSeed(sourceMatch?.seedB);
          if (isLoserSeed || (byeA && byeB)) return "BYE";
          const winSide = byeA ? "B" : byeB ? "A" : null;

          if (winSide) {
            const carried = resolveSideLabel(sourceMatch, winSide);
            if (isUsefulSideLabel(carried)) return carried;

            const fromSeed = resolveSeedReferenceLabel(
              sourceMatch[`seed${winSide}`],
              sourceMatch
            );
            if (isUsefulSideLabel(fromSeed)) return fromSeed;

            const carriedPair = sourceMatch[`pair${winSide}`];
            if (hasResolvedPair(carriedPair)) {
              return pairLabelNickOnly(carriedPair, eventType, sourceMatch);
            }
          }
        }

        if (sourceMatch?.status === "finished" && sourceMatch?.winner) {
          const sourceSide = isLoserSeed
            ? sourceMatch.winner === "A"
              ? "B"
              : "A"
            : sourceMatch.winner === "A"
            ? "A"
            : "B";
          const sourcePair =
            sourceSide === "A" ? sourceMatch.pairA : sourceMatch.pairB;

          if (hasResolvedPair(sourcePair)) {
            return pairLabelNickOnly(sourcePair, eventType, sourceMatch);
          }

          const carried = resolveSideLabel(sourceMatch, sourceSide);
          if (isUsefulSideLabel(carried)) return carried;
        }

        if ((isWinnerSeed || isLoserSeed) && isUsefulSideLabel(sourceRefLabel)) {
          return sourceRefLabel;
        }

        return resolveSeedReferenceLabel(seed, m);
      }
      return "Chưa có đội";
    },
    [
      matchIndex,
      tour?.eventType,
      completedGroupAliasSet,
      brackets,
      byBracket,
      findSourceMatchFromSeed,
      getDisplayCodeForMatch,
      getPlannedSeedForMatchSide,
      resolveSeedReferenceLabel,
    ]
  );

  const prefillRounds = useMemo(() => {
    if (!current?.prefill) return null;
    const r = buildRoundsFromPrefill(current.prefill, current?.ko);
    return r && r.length ? r : null;
  }, [current]);

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

  const groupsList = useMemo(
    () => (current?.type === "group" ? current?.groups || [] : []),
    [current]
  );
  const groupMineMap = useMemo(() => {
    const mp = new Map();
    const myGroupByMatch = new Set();
    (currentMatches || []).forEach((m) => {
      const iAmInA = regIncludesUser({ pair: m.pairA }, myUserId);
      const iAmInB = regIncludesUser({ pair: m.pairB }, myUserId);
      if (iAmInA || iAmInB) {
        const key = matchGroupLabel(m);
        if (key) myGroupByMatch.add(String(key));
      }
    });
    groupsList.forEach((g, gi) => {
      const key = String(g.name || g.code || g._id || String(gi + 1));
      const ids = (g?.regIds || []).map(String);
      const viaIds = ids.some((rid) => myRegIds.has(rid));
      const viaMatch = myGroupByMatch.has(key);
      mp.set(key, viaIds || viaMatch);
    });
    return mp;
  }, [groupsList, myRegIds, currentMatches, myUserId]);

  const filterItems = useMemo(
    () =>
      groupsList.map((g, gi) => {
        const key = String(g.name || g.code || g._id || String(gi + 1));
        const isMine = !!groupMineMap.get(key);
        const label = `Bảng ${gi + 1}${isMine ? " (bảng của tôi)" : ""}`;
        return { key, label, isMine, index: gi + 1 };
      }),
    [groupsList, groupMineMap]
  );

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
      const code = groupCodeOf(m, `V${stageNo}-B${bIndex}-T${seq}`);
      const time = formatTime(pickGroupKickoffTime(m));
      const court = courtName(m);
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
        t={t}
        style={{
          borderColor: t.chipErrBd,
          backgroundColor: t.chipErrBg,
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
          <Chip label="LIVE" tone="warn" t={t} />
          <Text
            style={[styles.subTitle, { marginLeft: 8, color: t.colors.text }]}
          >
            Trận đang diễn ra (Vòng bảng)
          </Text>
        </View>
        {rows.map((r) => {
          const color = r.match
            ? statusColors(r.match)
            : { bg: t.muted, fg: t.colors.text };
          return (
            <Card
              key={r.id}
              onPress={() => openMatch(r.match)}
              t={t}
              style={styles.rowCard}
            >
              <View style={styles.rowHeader}>
                <Chip
                  label={r.code}
                  bgColor={color.bg}
                  fgColor={color.fg}
                  t={t}
                />
                <Text
                  style={[styles.bold, { fontSize: 13, color: t.colors.text }]}
                >
                  {r.score || "LIVE"}
                </Text>
              </View>
              <Text
                style={[styles.rowMain, { color: t.colors.text }]}
                numberOfLines={2}
              >
                {r.aName}{" "}
                <Text style={{ opacity: 0.6, color: t.subtext }}>vs</Text>{" "}
                {r.bName}
              </Text>
              <View style={styles.rowMetaWrap}>
                <Chip label={r.time || "—"} t={t} />
                {!!r.court && <Chip label={r.court} t={t} />}
                {hasVideo(r.match) && (
                  <Pressable onPress={() => openVideoFor(r.match)}>
                    <Chip label="Xem video 🎥" t={t} />
                  </Pressable>
                )}
              </View>
            </Card>
          );
        })}
      </Card>
    );
  };

  const metaBar = useMemo(
    () => computeMetaBar(brackets, tour),
    [brackets, tour]
  );

  if (!tourId) {
    return (
      <View style={[styles.center, { backgroundColor: t.colors.background }]}>
        <Text style={{ color: t.colors.text }}>Thiếu tournamentId.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: t.colors.background }]}>
        <ActivityIndicator />
      </View>
    );
  }
  if (error) {
    return (
      <View
        style={[styles.centerPad, { backgroundColor: t.colors.background }]}
      >
        <Text style={{ color: t.chipErrFg }}>
          {error?.data?.message || error?.error || "Lỗi tải dữ liệu."}
        </Text>
      </View>
    );
  }
  if (!brackets.length) {
    return (
      <View
        style={[styles.centerPad, { backgroundColor: t.colors.background }]}
      >
        <Text style={{ color: t.colors.text }}>
          Chưa có bracket nào cho giải này.
        </Text>
      </View>
    );
  }

  const tabLabels = brackets.map((b) => {
    const ty =
      b.type === "group"
        ? "Group"
        : b.type === "roundElim"
        ? "Round Elim"
        : "Knockout";
    return (
      <View key={b._id} style={{ flexDirection: "row", alignItems: "center" }}>
        <Text style={{ fontWeight: "600", color: t.colors.text }}>
          {b.name}
        </Text>
        <Chip label={ty} style={{ marginLeft: 8 }} t={t} />
      </View>
    );
  });

  const renderGroupBlocks = () => {
    const groups = groupsList;

    const stageNo = current?.stage || 1;
    const { starts, sizeOf } = buildGroupStarts(current);
    const sData = standingsData || {
      groups: [],
      points: { win: 3, draw: 1, loss: 0 },
    };

    const visibleGroups = groups
      .filter((g, gi) => {
        const key = String(g.name || g.code || g._id || String(gi + 1));
        if (onlyMyGroups && !groupMineMap.get(key)) return false;
        if (selectedGroupKeys.size > 0 && !selectedGroupKeys.has(key))
          return false;
        return true;
      })
      .sort((a, b) => {
        const ia = groups.indexOf(a);
        const ib = groups.indexOf(b);
        const ka = String(a.name || a.code || a._id || String(ia + 1));
        const kb = String(b.name || b.code || b._id || String(ib + 1));
        const ma = groupMineMap.get(ka) ? 1 : 0;
        const mb = groupMineMap.get(kb) ? 1 : 0;
        return mb - ma || ia - ib;
      });

    return (
      <View style={{ gap: 12 }}>
        <View style={{ alignItems: "flex-start" }}>
          <Ripple
            onPress={openFilterSheet}
            style={[
              styles.sheetTriggerBtn,
              { borderColor: t.colors.border, backgroundColor: t.colors.card },
            ]}
            hitSlop={8}
          >
            <Text style={[styles.sheetTriggerText, { color: t.colors.text }]}>
              🔎 Bộ lọc bảng
            </Text>
          </Ripple>
        </View>

        {!visibleGroups.length && (
          <Card t={t} style={{ padding: 12 }}>
            <Text style={{ color: t.colors.text }}>
              Không có bảng nào khớp bộ lọc.
            </Text>
          </Card>
        )}
        {visibleGroups.map((g) => {
          const gi = groups.indexOf(g);
          const key = String(g.name || g.code || g._id || String(gi + 1));
          const labelNumeric = gi + 1;
          const size = sizeOf(g);
          const startIdx = starts.get(key) || 1;
          const isMineGroup = groupMineMap.get(key);
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
              const code = groupCodeOf(
                m,
                `V${stageNo}-B${labelNumeric}-T${idx + 1}`
              );
              const aName = resolveSideLabel(m, "A");
              const bName = resolveSideLabel(m, "B");
              const time = formatTime(pickGroupKickoffTime(m));
              const court = courtName(m);
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
            <Card
              key={key}
              t={t}
              style={isMineGroup ? styles.groupMineCard : null}
            >
              <View style={styles.groupHeader}>
                <Chip label={`Bảng ${labelNumeric}`} tone="primary" t={t} />
                {(g.name || g.code) && (
                  <Chip label={`Mã: ${g.name || g.code}`} t={t} />
                )}
                <Chip label={`Số đội: ${size || 0}`} t={t} />
                {isMineGroup && <Chip label="⭐ Bảng của tôi" t={t} />}
              </View>

              <SectionTitle t={t}>Trận trong bảng</SectionTitle>
              <View style={{ gap: 8, marginBottom: 8 }}>
                {matchRows.length ? (
                  matchRows.map((r) => {
                    const color = r.match
                      ? statusColors(r.match)
                      : { bg: t.muted, fg: t.colors.text };
                    return (
                      <Card
                        key={r._id}
                        onPress={() =>
                          !r.isPlaceholder && r.match
                            ? openMatch(r.match)
                            : undefined
                        }
                        disabled={!!r.isPlaceholder || !r.match}
                        t={t}
                        style={styles.rowCard}
                      >
                        <View style={styles.rowHeader}>
                          <Chip
                            label={r.code}
                            bgColor={color.bg}
                            fgColor={color.fg}
                            t={t}
                          />
                          <Text
                            style={[
                              styles.bold,
                              { fontSize: 13, color: t.colors.text },
                            ]}
                          >
                            {r.score || "—"}
                          </Text>
                        </View>
                        <Text
                          style={[styles.rowMain, { color: t.colors.text }]}
                          numberOfLines={2}
                        >
                          {r.aName}{" "}
                          <Text style={{ opacity: 0.6, color: t.subtext }}>
                            vs
                          </Text>{" "}
                          {r.bName}
                        </Text>
                        <View style={styles.rowMetaWrap}>
                          <Chip label={r.time || "—"} t={t} />
                          {!!r.court && <Chip label={r.court} t={t} />}
                        </View>
                      </Card>
                    );
                  })
                ) : (
                  <Card t={t} style={{ padding: 12, alignItems: "center" }}>
                    <Text style={{ color: t.colors.text }}>
                      Chưa có trận nào.
                    </Text>
                  </Card>
                )}
              </View>

              <SectionTitle t={t}>Bảng xếp hạng</SectionTitle>
              <View style={styles.legendWrap}>
                <Chip label={`Thắng +${pointsCfg.win ?? 3}`} t={t} />
                <Chip label={`Thua +${pointsCfg.loss ?? 0}`} t={t} />
                <Chip label={`Hiệu số = Điểm ghi - Điểm thua`} t={t} />
              </View>

              {gStand?.rows?.length ? (
                <View style={{ gap: 8 }}>
                  {gStand.rows.map((row, idx) => {
                    const name = row.pair
                      ? safePairNick(row.pair, tour?.eventType, tour)
                      : row.name || "—";
                    const pts = Number(row.pts ?? 0);
                    const diff = Number.isFinite(row.pointDiff)
                      ? row.pointDiff
                      : row.setDiff ?? 0;
                    const rank = row.rank || idx + 1;
                    const isMyRow = myRegIds.has(String(row.id || ""));
                    return (
                      <View
                        key={row.id || `row-${idx}`}
                        style={[
                          styles.rankRow,
                          { borderBottomColor: t.divider },
                          isMyRow && {
                            backgroundColor: t.dark
                              ? "rgba(124, 189, 255, 0.12)"
                              : "rgba(25,118,210,0.08)",
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.rankBadge,
                            { backgroundColor: t.chipInfoBg },
                          ]}
                        >
                          <Text
                            style={[
                              styles.bold,
                              { fontSize: 12, color: t.colors.text },
                            ]}
                          >
                            {idx + 1}
                          </Text>
                        </View>
                        <Text
                          style={[styles.rankName, { color: t.colors.text }]}
                          numberOfLines={2}
                        >
                          {name}
                        </Text>
                        <View style={styles.rankChips}>
                          <Chip label={`Điểm: ${pts}`} t={t} />
                          <Chip label={`Hiệu số: ${diff}`} t={t} />
                          {/* <Chip label={`Hạng: ${rank}`} tone="primary" t={t} /> */}
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <Card t={t} style={{ padding: 12, alignItems: "center" }}>
                  <Text style={{ color: t.colors.text }}>
                    Chưa có dữ liệu BXH.
                  </Text>
                </Card>
              )}
            </Card>
          );
        })}
      </View>
    );
  };

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
        focusRegId={focusRegId}
        setFocusRegId={setFocusRegId}
        onOpenVideo={openVideoFor}
        t={t}
      />
    );
  };

  const renderKO = () => {
    const championGate = computeChampionGate(currentMatches);
    const finalMatchId = championGate.allowed ? championGate.matchId : null;
    const championPair = championGate.allowed ? championGate.pair : null;

    const scaleForCurrent = readBracketScale(current);
    const uniqueRoundsCount = new Set(currentMatches.map((m) => m.round ?? 1))
      .size;
    const roundsFromScale = scaleForCurrent
      ? Math.ceil(Math.log2(scaleForCurrent))
      : 0;
    const minRoundsForCurrent = Math.max(uniqueRoundsCount, roundsFromScale);

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
            <Chip label={`Bắt đầu: ${current.ko.startKey}`} t={t} />
          )}
          {!!current?.prefill?.isVirtual && (
            <Chip label="Prefill ảo" tone="warn" t={t} />
          )}
          {!!current?.prefill?.source?.fromName && (
            <Chip label={`Nguồn: ${current.prefill.source.fromName}`} t={t} />
          )}
          {!!current?.prefill?.roundKey && (
            <Chip label={`RoundKey: ${current.prefill.roundKey}`} t={t} />
          )}
        </View>

        {!!championPair && (
          <Card
            t={t}
            style={{
              padding: 10,
              borderColor: t.success,
              backgroundColor: t.dark ? "rgba(34,197,94,0.12)" : "#f1fff2",
            }}
          >
            <Text style={{ color: t.colors.text }}>
              Vô địch:{" "}
              <Text style={styles.bold}>
                {pairLabelNickOnly(championPair, tour?.eventType, tour)}
              </Text>
            </Text>
          </Card>
        )}

        <SymmetricKnockoutColumns
          rounds={roundsToRender}
          onOpenMatch={openMatch}
          championMatchId={finalMatchId}
          focusRegId={focusRegId}
          setFocusRegId={setFocusRegId}
          onOpenVideo={openVideoFor}
          t={t}
        />
        {currentMatches.length === 0 && prefillRounds && (
          <Text style={[styles.note, { color: t.subtext }]}>
            * Đang hiển thị khung <Text style={styles.bold}>prefill</Text>
            {current?.prefill?.isVirtual ? " (ảo theo seeding)" : ""} bắt đầu từ{" "}
            <Text style={styles.bold}>
              {current?.ko?.startKey || current?.prefill?.roundKey || "?"}
            </Text>
            . Khi có trận thật, nhánh sẽ tự cập nhật.
          </Text>
        )}
        {currentMatches.length === 0 && !prefillRounds && (
          <Text style={[styles.note, { color: t.subtext }]}>
            * Chưa bốc thăm / chưa lấy đội từ vòng trước — tạm hiển thị khung
            theo <Text style={styles.bold}>quy mô</Text>. Khi có trận thật,
            nhánh sẽ tự cập nhật.
          </Text>
        )}
      </View>
    );
  };

  const renderREBracketOnly = () => {
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
        focusRegId={focusRegId}
        setFocusRegId={setFocusRegId}
        onOpenVideo={openVideoFor}
        t={t}
      />
    );
  };

  const renderKOBracketOnly = () => {
    const championGate = computeChampionGate(currentMatches);
    const finalMatchId = championGate.allowed ? championGate.matchId : null;
    const scaleForCurrent = readBracketScale(current);
    const uniqueRoundsCount = new Set(currentMatches.map((m) => m.round ?? 1))
      .size;
    const roundsFromScale = scaleForCurrent
      ? Math.ceil(Math.log2(scaleForCurrent))
      : 0;
    const minRoundsForCurrent = Math.max(uniqueRoundsCount, roundsFromScale);
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
        : (current?.prefill &&
            buildRoundsFromPrefill(current.prefill, current?.ko)) ||
          (current?.drawRounds
            ? buildEmptyRoundsByScale(2 ** current.drawRounds)
            : buildEmptyRoundsByScale(scaleForCurrent || 4));

    return (
      <SymmetricKnockoutColumns
        rounds={roundsToRender}
        onOpenMatch={openMatch}
        championMatchId={finalMatchId}
        focusRegId={focusRegId}
        setFocusRegId={setFocusRegId}
        onOpenVideo={openVideoFor}
        t={t}
      />
    );
  };

  return (
    <BottomSheetModalProvider>
      <View style={{ flex: 1, backgroundColor: t.colors.background }}>
        <ScrollView
          contentContainerStyle={[
            styles.screen,
            { backgroundColor: t.colors.background },
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
        >
          <Text style={[styles.title, { color: t.colors.text }]}>
            Sơ đồ giải: {tour?.name}
          </Text>
          <Card t={t} style={styles.metaCard}>
            <View style={styles.metaRow}>
              <Chip label={`Số đội: ${metaBar.totalTeams}`} t={t} />
              <Chip label={`Check-in: ${metaBar.checkinLabel}`} t={t} />
              <Chip label={`Địa điểm: ${metaBar.locationText}`} t={t} />
            </View>

            <View style={{ marginTop: 8, gap: 6 }}>
              <Text style={[styles.metaSmall, { color: t.subtext }]}>
                <Text style={styles.bold}>Chú thích:</Text> R/V: Vòng; T: Trận;
                B: Bảng/Trận; W: Thắng; L: Thua; BYE: Ưu tiên
              </Text>

              <View style={styles.colorLegendWrap}>
                <View style={styles.colorLegendItem}>
                  <View
                    style={[styles.colorDot, { backgroundColor: "#2e7d32" }]}
                  />
                  <Text style={[styles.metaSmall, { color: t.subtext }]}>
                    Xanh: hoàn thành
                  </Text>
                </View>
                <View style={styles.colorLegendItem}>
                  <View
                    style={[styles.colorDot, { backgroundColor: "#ef6c00" }]}
                  />
                  <Text style={[styles.metaSmall, { color: t.subtext }]}>
                    Đỏ: đang thi đấu
                  </Text>
                </View>
                <View style={styles.colorLegendItem}>
                  <View
                    style={[styles.colorDot, { backgroundColor: "#f9a825" }]}
                  />
                  <Text style={[styles.metaSmall, { color: t.subtext }]}>
                    Vàng: chuẩn bị
                  </Text>
                </View>
                <View style={styles.colorLegendItem}>
                  <View
                    style={[styles.colorDot, { backgroundColor: "#9e9e9e" }]}
                  />
                  <Text style={[styles.metaSmall, { color: t.subtext }]}>
                    Ghi: dự kiến
                  </Text>
                </View>
              </View>
            </View>
          </Card>

          <TabsBar items={tabLabels} value={tab} onChange={setTab} t={t} />

          {current?.type === "group" ? (
            <View style={{ gap: 12 }}>
              <Card t={t}>
                <Text style={[styles.subTitle, { color: t.colors.text }]}>
                  Vòng bảng: {current.name}
                </Text>
                {renderLiveSpotlight()}
                {renderGroupBlocks()}
              </Card>
            </View>
          ) : current?.type === "roundElim" ? (
            <Card t={t}>
              <Text style={[styles.subTitle, { color: t.colors.text }]}>
                Vòng loại rút gọn (Round Elimination): {current.name}
              </Text>
              {renderRE()}
              {currentMatches.length === 0 && (
                <Text style={[styles.note, { color: t.subtext }]}>
                  * Chưa bốc cặp — đang hiển thị khung theo vòng cắt (V1..Vk).
                </Text>
              )}
            </Card>
          ) : (
            <Card t={t}>
              <Text style={[styles.subTitle, { color: t.colors.text }]}>
                Nhánh knock-out: {current?.name}
              </Text>
              {renderKO()}
            </Card>
          )}

          <ResponsiveMatchViewer
            open={open}
            matchId={activeMatchId}
            onClose={closeMatch}
          />
          <VideoModal
            visible={videoState.visible}
            url={videoState.url}
            onClose={closeVideo}
            t={t}
          />
        </ScrollView>

        {current && current.type !== "group" && !isFullscreen && (
          <FullscreenFAB onPress={enterFullscreen} bottomGap={80} t={t} />
        )}

        {isFullscreen && current && current.type !== "group" && (
          <View
            style={[
              styles.fullOverlay,
              { backgroundColor: t.colors.background },
            ]}
          >
            <StatusBar hidden />
            <CloseFullscreenBtn onPress={exitFullscreen} t={t} />
            <ScrollView
              style={styles.fullScroll}
              contentContainerStyle={{ padding: 8 }}
              nestedScrollEnabled
              directionalLockEnabled
              showsVerticalScrollIndicator
            >
              {current.type === "roundElim"
                ? renderREBracketOnly()
                : renderKOBracketOnly()}
            </ScrollView>
          </View>
        )}
        <FilterSheet
          ref={filterSheetRef}
          filterItems={filterItems}
          selectedGroupKeys={selectedGroupKeys}
          onToggleKey={onToggleKey}
          myRegIds={myRegIds}
          onShowAll={() => setSelectedGroupKeys(new Set())}
          onSelectAll={() =>
            setSelectedGroupKeys(new Set(filterItems.map((f) => f.key)))
          }
          onOnlyMine={() => {
            setSelectedGroupKeys(new Set());
            setOnlyMyGroups(true);
          }}
          t={t}
        />
      </View>
    </BottomSheetModalProvider>
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
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    marginRight: 6,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  card: {
    borderWidth: 1,
    borderRadius: 12,
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
    marginRight: 8,
  },
  tabItemActive: {},
  tabText: { fontWeight: "600" },
  tabTextActive: {},

  // rows
  rowCard: { padding: 10 },
  rowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  rowHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
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
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  rankName: { flex: 1, fontWeight: "600" },
  rankChips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },

  // bracket
  bracketZoomWrap: {
    alignItems: "flex-end",
    marginBottom: 8,
  },
  bracketZoomBar: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 999,
    padding: 2,
  },
  zoomBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  zoomBtnOff: {
    opacity: 0.4,
  },
  zoomBtnText: {
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 20,
  },
  zoomValueBtn: {
    minWidth: 48,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  zoomValueText: {
    fontSize: 12,
    fontWeight: "800",
  },
  bracketScrollContent: {
    paddingBottom: 6,
  },
  bracketScaleFrame: {
    position: "relative",
    overflow: "visible",
  },
  bracketScaledCanvas: {
    position: "absolute",
    left: 0,
    top: 0,
  },
  bracketMirrorCanvas: {
    transform: [{ scaleX: -1 }],
  },
  bracketMirrorCard: {
    transform: [{ scaleX: -1 }],
  },
  symmetricBridgeLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  symmetricBranchWrap: {
    zIndex: 1,
  },
  symmetricKoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 42,
    position: "relative",
  },
  symmetricFinalColumn: {
    alignSelf: "stretch",
    justifyContent: "center",
    position: "relative",
    zIndex: 1,
  },
  symmetricFinalCardWrap: {
    zIndex: 1,
  },
  symmetricFinalBridge: {
    position: "absolute",
    height: BRACKET_CONNECTOR_THICKNESS,
    zIndex: 0,
  },
  roundsRow: { flexDirection: "row", gap: 30 },
  seedBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  seedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  seedContent: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
  },
  scoreBox: {
    minWidth: 44,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  scoreText: { fontWeight: "800", fontSize: 16 },
  seedChampion: {
    borderColor: "#f44336",
    shadowColor: "#f44336",
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
    elevation: 2,
  },
  teamLine: {
    borderLeftWidth: 4,
    borderLeftColor: "transparent",
    borderRadius: 4,
    paddingLeft: 8,
    paddingVertical: 5,
    marginBottom: 4,
  },
  teamWin: { borderLeftColor: "#f44336" },
  teamHighlight: {
    backgroundColor: "rgba(25,118,210,0.12)",
    borderLeftColor: "#1976d2",
    shadowColor: "#1976d2",
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  teamText: { fontSize: 14, lineHeight: 18 },
  teamTextPending: { opacity: 0.58, fontWeight: "500" },
  teamTextWin: { fontWeight: "800" },
  sideTag: { opacity: 0.65, fontWeight: "700" },
  seedMeta: { opacity: 0.7, fontSize: 12, marginTop: 2 },
  trophy: { position: "absolute", right: 6, top: -14, fontSize: 16 },
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
    borderWidth: 1,
    padding: 16,
  },
  modalTitle: { fontSize: 16, fontWeight: "800", marginBottom: 8 },
  modalLine: { marginTop: 4 },
  bold: { fontWeight: "800" },
  closeBtn: {
    marginTop: 12,
    alignSelf: "flex-end",
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
  note: { marginTop: 8, fontSize: 12 },
  bracketCanvas: {
    position: "relative",
    paddingTop: 4,
  },

  connector: {
    position: "absolute",
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
  },

  // slot bọc card (để canh lưới)
  seedWrap: {
    justifyContent: "center",
  },
  metaCard: { padding: 12 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  metaSmall: { fontSize: 12 },

  colorLegendWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "center",
  },
  colorLegendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  colorDot: { width: 12, height: 12, borderRadius: 3 },

  seedHeaderCode: {
    fontWeight: "800",
  },
  seedHeaderMeta: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  seedHeaderText: {
    fontSize: 12,
    fontWeight: "600",
  },

  /* ===== Fullscreen styles ===== */
  fullFab: {
    position: "absolute",
    right: 12,
    zIndex: 1000,
    borderWidth: 1,
    borderRadius: 999,
    padding: 6,
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 6,
  },
  fullFabBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
  },
  fullFabIcon: { fontSize: 16, fontWeight: "800" },
  fullOverlay: {
    position: "absolute",
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    padding: 8,
    zIndex: 2000,
  },
  fullCloseBtn: {
    position: "absolute",
    left: 10,
    top: 10,
    zIndex: 2100,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  fullCloseTxt: { color: "#fff", fontWeight: "800", fontSize: 14 },
  fullScroll: {
    flex: 1,
  },

  /* 🆕 Filter styles */
  filterBar: {
    padding: 10,
  },

  sheetContent: { paddingHorizontal: 12, paddingBottom: 12 },
  sheetActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    flexWrap: "wrap",
  },
  sheetTriggerBtn: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  sheetTriggerText: { fontWeight: "700" },
  filterRowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  checkItem: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 6,
    marginBottom: 6,
  },
  checkBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  checkBoxChecked: {},
  checkMark: { fontSize: 12, lineHeight: 12 },
  checkLabel: { fontSize: 13, fontWeight: "600" },
  filterActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
    flexWrap: "wrap",
  },
  filterBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  filterBtnText: { fontWeight: "700", fontSize: 12 },

  /* 🆕 Highlight card cho “Bảng của tôi” */
  groupMineCard: {
    borderColor: "#1976d2",
    backgroundColor: "rgba(25,118,210,0.05)",
  },
  applyBtn: {
    marginTop: 4,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  applyBtnText: {
    color: "#fff",
    fontWeight: "700",
  },
});
