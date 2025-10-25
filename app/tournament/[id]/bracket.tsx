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
import Ripple from "react-native-material-ripple";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
const courtName = (m) => m?.venue?.name || m?.court?.name || m?.court || "";
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

/* ===================== Match Modal (themed) ===================== */
const MatchModal = ({ visible, match, onClose, eventType, t }) => {
  if (!match) return null;
  const a = match.pairA
    ? pairLabelNickOnly(match.pairA, eventType)
    : smartDepLabel(match, match.previousA) || seedLabel(match.seedA);
  const b = match.pairB
    ? pairLabelNickOnly(match.pairB, eventType)
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
const BracketColumns = ({
  rounds,
  onOpenMatch,
  championMatchId,
  focusRegId,
  setFocusRegId,
  onOpenVideo,
  t,
}) => {
  // ===== BYE helpers =====
  const isByeName = (s) => typeof s === "string" && /^BYE$/i.test(s.trim());
  const seedHasBye = (seed) => {
    const a = seed?.teams?.[0]?.name || "";
    const b = seed?.teams?.[1]?.name || "";
    return isByeName(a) || isByeName(b);
  };
  const nonByeName = (seed) => {
    const a = seed?.teams?.[0]?.name || "";
    const b = seed?.teams?.[1]?.name || "";
    if (isByeName(a) && !isByeName(b)) return b;
    if (isByeName(b) && !isByeName(a)) return a;
    return null;
  };
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
          if (!curName || /^(Chưa có đội|BYE)$/i.test(curName)) {
            nxt.seeds[dstIdx].teams[side] = { name: adv };
          }
        }
      });
    }
    return copy;
  }, [rounds]);

  const ROUND_GAP = 56;
  const INNER_GAP = 24;
  const EXTRA_SLOT = 6;
  const [baseCardH, setBaseCardH] = useState(56);

  const slotH0 = Math.max(
    baseCardH + INNER_GAP * 2 + EXTRA_SLOT,
    72 + INNER_GAP * 2
  );
  const slotHeight = (col) => slotH0 * Math.pow(2, col);

  const tallest = useMemo(() => {
    const hs = Object.entries(colRects).map(([c, r]) => {
      const n = viewRounds[c]?.seeds?.length || 0;
      return n * slotHeight(Number(c));
    });
    return hs.length ? Math.max(...hs) : 0;
  }, [colRects, viewRounds, slotH0]);

  const colTopOffset = useMemo(() => {
    const out = {};
    viewRounds.forEach((r, c) => {
      const n = r.seeds?.length || 0;
      const h = n * slotHeight(c);
      out[c] = Math.max(0, (tallest - h) / 2);
    });
    return out;
  }, [viewRounds, tallest, slotH0]);

  const absWrap = useCallback(
    (c, i) => {
      const col = colRects[c];
      const wr = wrapRects[c]?.[i];
      if (!col || !wr) return null;
      return { x: col.x + wr.x, y: col.y + wr.y, w: wr.w, h: wr.h };
    },
    [colRects, wrapRects]
  );

  // connectors
  const connectors = useMemo(() => {
    const L = [];
    const TH = 2;
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
    const idOf = (v) =>
      v && typeof v === "object"
        ? String(v._id ?? v.id ?? "")
        : String(v ?? "");

    for (let c = 0; c < viewRounds.length - 1; c++) {
      const nextSeeds = viewRounds[c + 1]?.seeds || [];
      for (let j = 0; j < nextSeeds.length; j++) {
        const dst = absWrap(c + 1, j);
        if (!dst) continue;

        let srcIdxs = [];
        const m = nextSeeds[j].__match;
        if (m) {
          const la = locByMatchId.get(idOf(m.previousA));
          const lb = locByMatchId.get(idOf(m.previousB));
          if (la?.col === c) srcIdxs.push(la.idx);
          if (lb?.col === c) srcIdxs.push(lb.idx);
        }
        const a = 2 * j,
          b = 2 * j + 1;
        if (!srcIdxs.includes(a) && absWrap(c, a)) srcIdxs.push(a);
        if (!srcIdxs.includes(b) && absWrap(c, b)) srcIdxs.push(b);
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
  }, [viewRounds, locByMatchId, colRects, wrapRects, absWrap, slotH0, t.dark]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      nestedScrollEnabled
      directionalLockEnabled
    >
      <View style={[styles.roundsRow, styles.bracketCanvas]}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {connectors}
        </View>

        {viewRounds.map((r, colIdx) => (
          <View
            key={colIdx}
            style={[
              styles.roundCol,
              { marginRight: 56, marginTop: colTopOffset[colIdx] || 0 },
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
              const m = s.__match || null;
              const isChampion =
                m &&
                championMatchId &&
                String(m._id) === String(championMatchId) &&
                (m.winner === "A" || m.winner === "B");

              const nameA = s.teams?.[0]?.name || "Chưa có đội";
              const nameB = s.teams?.[1]?.name || "Chưa có đội";
              const byeCard =
                /^(BYE)$/i.test(nameA) ||
                /^(BYE)$/i.test(nameB) ||
                m?.seedA?.type === "bye" ||
                m?.seedB?.type === "bye";
              const status = byeCard
                ? "Qua vòng (BYE)"
                : m
                ? resultLabel(m)
                : "Chưa diễn ra";

              const wrapH = slotHeight(colIdx);

              return (
                <View
                  key={`${colIdx}-${i}`}
                  style={[
                    styles.seedWrap,
                    { height: wrapH, paddingVertical: 24 },
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
                                  ]}
                                >
                                  {nameA}
                                  <Text
                                    style={[
                                      styles.sideTag,
                                      { color: t.subtext },
                                    ]}
                                  >
                                    (A)
                                  </Text>
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
                                  ]}
                                >
                                  {nameB}
                                  <Text
                                    style={[
                                      styles.sideTag,
                                      { color: t.subtext },
                                    ]}
                                  >
                                    {" "}
                                    (B)
                                  </Text>
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
    </ScrollView>
  );
};

/* ===================== Component chính (RN) ===================== */
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

  /* ===== live layer ===== */
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

  const refetchBracketsRef = useRef(refetchBrackets);
  const refetchMatchesRef = useRef(refetchMatches);
  useEffect(() => {
    refetchBracketsRef.current = refetchBrackets;
  }, [refetchBrackets]);
  useEffect(() => {
    refetchMatchesRef.current = refetchMatches;
  }, [refetchMatches]);

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
  const matchIds = useMemo(
    () => (allMatchesFetched || []).map((m) => String(m._id)).filter(Boolean),
    [allMatchesFetched]
  );
  const initialSeededRef = useRef(false);

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
    socket.on("match:snapshot", onUpsert);
    socket.on("score:updated", onUpsert);
    socket.on("match:deleted", onRemove);
    socket.on("draw:refilled", onRefilled);
    socket.on("bracket:updated", onRefilled);

    return () => {
      socket.off("connect", onConnect);
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

      const seed = side === "A" ? m.seedA : m.seedB;

      if (seed?.type === "groupRank") {
        const st = Number(seed.ref?.stage ?? seed.ref?.stageIndex ?? 0) || 0;
        const gc = String(seed.ref?.groupCode ?? "").trim();

        const groupReady = gc && completedGroupAliasSet.has(`${st}|${gc}`);
        if (!groupReady) {
          return seedLabel(seed);
        }

        const pair = side === "A" ? m.pairA : m.pairB;
        if (pair) return pairLabelNickOnly(pair, eventType);

        const inferred =
          resolvePairFromGroupRankSeed(seed, brackets, byBracket, eventType) ||
          null;
        if (inferred) return pairLabelNickOnly(inferred, eventType);

        return seedLabel(seed);
      }

      const pair = side === "A" ? m.pairA : m.pairB;
      if (pair) return pairLabelNickOnly(pair, eventType);

      const prev = side === "A" ? m.previousA : m.previousB;
      if (prev) {
        const prevId =
          typeof prev === "object" && prev?._id
            ? String(prev._id)
            : String(prev);
        const pm =
          matchIndex.get(prevId) || (typeof prev === "object" ? prev : null);
        if (pm && pm.status === "finished" && pm.winner) {
          const wp = pm.winner === "A" ? pm.pairA : pm.pairB;
          if (wp) return pairLabelNickOnly(wp, eventType);
        }
        return smartDepLabel(m, prev);
      }

      if (seed && seed.type) return seedLabel(seed);
      return "Chưa có đội";
    },
    [matchIndex, tour?.eventType, completedGroupAliasSet, brackets, byBracket]
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
                      ? safePairNick(row.pair, tour?.eventType)
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
                          <Chip label={`Hạng: ${rank}`} tone="primary" t={t} />
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
                {pairLabelNickOnly(championPair, tour?.eventType)}
              </Text>
            </Text>
          </Card>
        )}

        <BracketColumns
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
      <BracketColumns
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
  roundsRow: { flexDirection: "row", gap: 30 },
  seedBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  seedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
    paddingBottom: 4,
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
    paddingLeft: 6,
    paddingVertical: 2,
    marginBottom: 2,
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
  teamText: { fontSize: 13 },
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
