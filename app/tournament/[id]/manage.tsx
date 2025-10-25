// app/(app)/admin/tournament/[id]/ManageScreen.jsx
import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from "react";
import {
  ActivityIndicator,
  Alert as RNAlert,
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  ScrollView,
} from "react-native";
import { Stack, useLocalSearchParams, router } from "expo-router";
import { useSelector } from "react-redux";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
// ======= expo modules for export/share =======
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";

import {
  useGetTournamentQuery,
  useAdminGetBracketsQuery,
  useAdminListMatchesByTournamentQuery,
  useAdminSetMatchLiveUrlMutation,
} from "@/slices/tournamentsApiSlice";

import ResponsiveMatchViewer from "@/components/match/ResponsiveMatchViewer";
import { useSocket } from "@/context/SocketContext";

/** ==== import 4 sheets (gorhom) ==== */
import ManageRefereesSheet from "@/components/sheets/ManageRefereesSheet";
import AssignCourtSheet from "@/components/sheets/AssignCourtSheet";
import AssignRefSheet from "@/components/sheets/AssignRefSheet";
import CourtManagerSheet from "@/components/sheets/CourtManagerSheet";
import LiveSetupSheet from "@/components/sheets/LiveSetupSheet";

/* ---------------- helpers ---------------- */
const TYPE_LABEL = (t) => {
  const key = String(t || "").toLowerCase();
  if (key === "group") return "Vòng bảng";
  if (key === "po" || key === "playoff") return "Playoff";
  if (key === "knockout" || key === "ko") return "Knockout";
  if (key === "double_elim" || key === "doubleelim") return "Double Elim";
  if (key === "roundelim" || key === "round_elim" || key === "round-elim")
    return "Round Elim";
  if (key === "swiss") return "Swiss";
  if (key === "gsl") return "GSL";
  return t || "Khác";
};
const personNickname = (p) =>
  p?.nickName || p?.nickname || p?.displayName || p?.fullName || p?.name || "—";
const playerName = personNickname;

const pairLabel = (pair) => {
  if (!pair) return "—";
  if (pair.name) return pair.name;
  const ps = [pair.player1, pair.player2].filter(Boolean).map(playerName);
  return ps.join(" / ") || "—";
};
const matchCode = (m) => m?.code || `R${m?.round ?? "?"}-${m?.order ?? "?"}`;

const hasVal = (v) =>
  v === 0 ||
  typeof v === "number" ||
  (typeof v === "string" && v.trim() !== "");
const scoreText = (m) => {
  if (typeof m?.scoreText === "string" && m.scoreText.trim())
    return m.scoreText;
  const arr =
    (Array.isArray(m?.gameScores) && m.gameScores) ||
    (Array.isArray(m?.sets) && m.sets) ||
    (Array.isArray(m?.scores) && m.scores) ||
    [];
  if (!arr.length) return "";
  return arr
    .map((s) => `${s?.a ?? s?.home ?? 0}-${s?.b ?? s?.away ?? 0}`)
    .join(", ");
};
const courtNameOf = (m) =>
  (typeof m?.court?.name === "string" && m.court.name) ||
  (typeof m?.courtLabel === "string" && m.courtLabel) ||
  (typeof m?.courtName === "string" && m.courtName) ||
  "";

// Chuẩn hoá status
const normStatus = (s) => {
  const k = String(s || "").toLowerCase();
  if (
    [
      "finished",
      "done",
      "completed",
      "final",
      "ended",
      "over",
      "closed",
    ].includes(k)
  )
    return "finished";
  if (["live", "playing", "inprogress", "ongoing"].includes(k)) return "live";
  if (["assigned", "on_court", "oncourt"].includes(k)) return "assigned";
  if (["queued", "queue"].includes(k)) return "queued";
  if (["scheduled", "created", "pending"].includes(k)) return "scheduled";
  return k;
};

// status helpers
const isLive = (m) => normStatus(m?.status) === "live";
const isFinished = (m) => normStatus(m?.status) === "finished";
const isAssigned = (m) => !!courtNameOf(m);
const isPendingNotAssigned = (m) =>
  !isLive(m) &&
  !isFinished(m) &&
  !isAssigned(m) &&
  [
    "scheduled",
    "queued",
    "pending",
    "assigning",
    "created",
    "assigned",
  ].includes(String(m?.status || "").toLowerCase());

// ——— special ordering: KO always last, RoundElim just before KO
const typeOrderWeight = (t) => {
  const k = String(t || "").toLowerCase();
  if (k === "group") return 1;
  if (k === "po" || k === "playoff") return 2;
  if (k === "swiss") return 3;
  if (k === "gsl") return 4;
  if (k === "double_elim" || k === "doubleelim") return 5;
  if (k === "roundelim" || k === "round_elim" || k === "round-elim")
    return 9_998;
  if (k === "knockout" || k === "ko") return 9_999;
  return 7_000;
};

const IconBtn = ({ name, onPress, color = "#111", size = 18, style }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [style, pressed && { opacity: 0.8 }]}
  >
    <MaterialIcons name={name} size={size} color={color} />
  </Pressable>
);

// Trọng tài của trận
const _extractRefereeIds = (m) => {
  if (!m) return [];
  const raw = m.referees ?? m.referee ?? m.judges ?? [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr
    .map((r) =>
      String(r?.user?._id ?? r?.user ?? r?._id ?? r?.id ?? (r || "")).trim()
    )
    .filter(Boolean);
};
const isUserRefereeOfMatch = (m, user) => {
  if (!user?._id) return false;
  const myId = String(user._id);
  const refIds = _extractRefereeIds(m).map(String);
  return refIds.includes(myId);
};
const refereeNames = (m) => {
  const list = m?.referees || m?.refs || m?.assignedReferees || null;
  if (Array.isArray(list) && list.length)
    return list.map((u) => personNickname(u)).join(", ");
  const r1 = m?.referee || m?.mainReferee || null;
  return r1 ? personNickname(r1) : "";
};

// Đường dẫn “trang bắt trận”
const refereeRouteOf = (m) => `/match/${m._id}/referee`;

/* ====== HTML builders (PDF/Word & Biên bản TT) ====== */
const buildRefReportHTML = ({
  tourName,
  code,
  court,
  referee,
  team1,
  team2,
  logoUrl,
}) => {
  const css = `
    *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;margin:16px}
    table{width:100%;border-collapse:collapse}
    td,th{border:1px solid #000;padding:6px;font-size:12px}
    .no-border td,.no-border th{border:none}
    .title{font-size:22px;font-weight:700;text-align:left}
    .section-title{font-weight:700}
    .small{font-size:11px}
  `;
  const pointRow = () => `
    <tr>
      <td style="border:1px solid black"></td>
      ${Array.from(
        { length: 22 },
        (_, i) =>
          `<td style="border:1px solid black">${
            i < 10 ? `&nbsp;${i}&nbsp;` : i
          }</td>`
      ).join("")}
      <td style="border:1px solid black"></td>
      <td style="border:1px solid black"></td>
      <td style="border:1px solid black"></td>
    </tr>`;
  return `<!DOCTYPE html>
  <html><head><meta charset="utf-8" />
    <title>Biên bản trọng tài - ${code}</title>
    <style>${css}</style>
  </head>
  <body>
    <table class="no-border" style="width:100%">
      <tr class="no-border">
        <td class="no-border" style="width:96px"><img style="width:96px" src="${
          logoUrl || ""
        }" alt="logo" /></td>
        <td class="no-border" colspan="3"><div class="title">${
          tourName || ""
        }</div></td>
      </tr>
      <tr>
        <td rowspan="2">TRẬN ĐẤU:</td>
        <td rowspan="2"><div style="font-weight:700;font-size:22px">${code}</div></td>
        <td style="width:100px">SÂN:</td>
        <td style="min-width:150px"><b>${court || ""}</b></td>
      </tr>
      <tr>
        <td style="width:100px">TRỌNG TÀI:</td>
        <td style="min-width:150px"><b>${referee || ""}</b></td>
      </tr>
    </table>
    <br/>
    <table>
      <tr><td>ĐỘI 1</td><td colspan="26"><b>${team1 || ""}</b></td></tr>
      <tr><td>SERVER</td><td colspan="22">ĐIỂM</td><td colspan="2">TIMEOUT</td><td>TW/TF</td></tr>
      ${pointRow()}${pointRow()}${pointRow()}
    </table>
    <br/>
    <div style="height:90px;">
      <table class="no-border" style="width:100%">
        <tr class="no-border">
          <td class="no-border" style="text-align:center;width:300px"><b>Đội thắng</b></td>
          <td class="no-border" style="text-align:center;width:300px"><b>Trọng tài</b></td>
          <td class="no-border" style="text-align:center;width:300px"><b>Đội thua</b></td>
        </tr>
      </table>
    </div>
    <table>
      <tr><td>ĐỘI 2</td><td colspan="26"><b>${team2 || ""}</b></td></tr>
      <tr><td>SERVER</td><td colspan="22">ĐIỂM</td><td colspan="2">TIMEOUT</td><td>TW/TF</td></tr>
      ${pointRow()}${pointRow()}${pointRow()}
    </table>
  </body></html>`;
};

const buildExportHTML = ({ tourName, typeLabel, sections }) => {
  const css = `
    body{font-family:Arial,Helvetica,sans-serif;margin:16px}
    h1{font-size:20px;margin:0 0 6px}
    h2{font-size:14px;margin:14px 0 8px}
    .sub{color:#666;font-size:12px;margin-bottom:10px}
    table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #ddd;padding:6px;font-size:12px}
    th{background:#f1f5f9;text-align:left}
  `;
  const now = new Date().toLocaleString();
  const blocks = sections
    .map(
      (sec) => `
      <h2>${sec.title}</h2>
      <table>
        <thead><tr>
          <th>Mã</th><th>Cặp A</th><th>Cặp B</th><th>Sân</th><th>Thứ tự</th><th>Tỉ số</th>
        </tr></thead>
        <tbody>
          ${sec.rows
            .map(
              (r) =>
                `<tr>${r
                  .map((c) => `<td>${c == null ? "" : String(c)}</td>`)
                  .join("")}</tr>`
            )
            .join("")}
        </tbody>
      </table>
    `
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"/><style>${css}</style></head>
  <body>
    <h1>Quản lý giải: ${tourName || ""}</h1>
    <div class="sub">Loại: ${typeLabel} • Xuất lúc: ${now}</div>
    ${blocks}
  </body>
  </html>`;
};

/* ---------------- THEME TOKENS ---------------- */
function getThemeTokens(colors, dark) {
  const tint = colors.primary;
  const muted = dark ? "#9aa0a6" : "#64748b";
  const placeholder = dark ? "#8b97a8" : "#94a3b8";
  const disabled = dark ? "#475569" : "#94a3b8";

  // chips
  const chipDefaultBg = dark ? "#1f2937" : "#eef2f7";
  const chipDefaultFg = dark ? "#e5e7eb" : "#263238";
  const chipInfoBg = dark ? "#0f2536" : "#e0f2fe";
  const chipInfoFg = dark ? "#93c5fd" : "#075985";

  // status / semantic
  const infoBg = chipInfoBg;
  const infoBorder = dark ? "#1e3a5f" : "#bfdbfe";
  const infoText = chipInfoFg;

  const warnBg = dark ? "#3b2f08" : "#fffbeb";
  const warnBorder = dark ? "#a16207" : "#f59e0b";
  const warnText = dark ? "#fde68a" : "#92400e";

  const dangerBg = dark ? "#3b0d0d" : "#fee2e2";
  const dangerBorder = dark ? "#7f1d1d" : "#ef4444";
  const dangerText = dark ? "#fecaca" : "#991b1b";

  const successBg = dark ? "#102a12" : "#dcfce7";
  const successFg = dark ? "#86efac" : "#166534";

  const courtBg = dark ? "#241b4b" : "#ede9fe";
  const courtFg = dark ? "#c4b5fd" : "#5b21b6";

  const statusTone = (s) => {
    const k = String(s || "").toLowerCase();
    if (k === "scheduled")
      return {
        bg: dark ? "#1f2937" : "#e5e7eb",
        fg: dark ? "#e5e7eb" : "#111827",
        label: "Chưa xếp",
      };
    if (k === "queued")
      return { bg: chipInfoBg, fg: chipInfoFg, label: "Trong hàng chờ" };
    if (k === "assigned")
      return { bg: courtBg, fg: courtFg, label: "Đã gán sân" };
    if (k === "live")
      return {
        bg: dark ? "#3b2308" : "#fff7ed",
        fg: dark ? "#fdba74" : "#9a3412",
        label: "Đang thi đấu",
      };
    if (k === "finished")
      return { bg: successBg, fg: successFg, label: "Đã kết thúc" };
    return { bg: chipDefaultBg, fg: chipDefaultFg, label: s || "—" };
  };

  return {
    tint,
    muted,
    placeholder,
    disabled,
    chipDefaultBg,
    chipDefaultFg,
    chipInfoBg,
    chipInfoFg,
    infoBg,
    infoBorder,
    infoText,
    warnBg,
    warnBorder,
    warnText,
    dangerBg,
    dangerBorder,
    dangerText,
    successBg,
    successFg,
    courtBg,
    courtFg,
    statusTone,
  };
}

/* ---------------- main ---------------- */
export default function ManageScreen() {
  const { id } = useLocalSearchParams();
  const tid = Array.isArray(id) ? id[0] : id;

  const { colors, dark } = useTheme();
  const t = useMemo(() => getThemeTokens(colors, dark), [colors, dark]);

  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const me = useSelector((s) => s.auth?.userInfo || null);

  // socket
  const socket = useSocket();
  const liveMapRef = useRef(new Map());
  const pendingRef = useRef(new Map());
  const rafRef = useRef(null);
  const [liveBump, setLiveBump] = useState(0);
  const joinedMatchesRef = useRef(new Set());
  const lastSnapshotAtRef = useRef(new Map());
  const requestSnapshot = useCallback(
    (mid) => {
      if (!socket || !mid) return;
      const now = Date.now();
      const last = lastSnapshotAtRef.current.get(mid) || 0;
      if (now - last < 600) return;
      lastSnapshotAtRef.current.set(mid, now);
      socket.emit("match:snapshot:request", { matchId: mid });
    },
    [socket]
  );

  // Refs callback
  const queueUpsertRef = useRef(null);
  const requestSnapshotRef = useRef(null);
  useEffect(() => {
    queueUpsertRef.current = (payload) => {
      const incRaw = payload?.data ?? payload?.match ?? payload;
      const id = incRaw?._id ?? incRaw?.id ?? incRaw?.matchId;
      if (!id) return;
      const inc = { ...(incRaw || {}), _id: String(id) };

      if (Array.isArray(inc.scores) && !inc.gameScores)
        inc.gameScores = inc.scores;
      if (typeof inc.score_text === "string" && !inc.scoreText)
        inc.scoreText = inc.score_text;

      const normalizeEntity = (v) => {
        if (v == null) return v;
        if (typeof v === "string" || typeof v === "number") return v;
        if (typeof v === "object") {
          return {
            _id: v._id ?? (typeof v.id === "string" ? v.id : undefined),
            name:
              (typeof v.name === "string" && v.name) ||
              (typeof v.label === "string" && v.label) ||
              (typeof v.title === "string" && v.title) ||
              "",
          };
        }
        return v;
      };
      if (inc.court) inc.court = normalizeEntity(inc.court);

      pendingRef.current.set(String(inc._id), inc);
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        if (!pendingRef.current.size) return;
        const mp = liveMapRef.current;
        for (const [mid, inc2] of pendingRef.current) {
          const cur = mp.get(mid);
          const vNew = Number(inc2?.liveVersion ?? inc2?.version ?? 0);
          const vOld = Number(cur?.liveVersion ?? cur?.version ?? 0);
          const merged =
            !cur || vNew >= vOld ? { ...(cur || {}), ...inc2 } : cur;
          mp.set(mid, merged);
        }
        pendingRef.current.clear();
        setLiveBump((x) => x + 1);
      });
    };
    requestSnapshotRef.current = requestSnapshot;
  }, [requestSnapshot]);

  // Queries
  const {
    data: tour,
    isLoading: tourLoading,
    isFetching: tourFetching,
    error: tourErr,
    refetch: refetchTour,
  } = useGetTournamentQuery(tid, {
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  const {
    data: bracketsData = [],
    isLoading: brLoading,
    isFetching: brFetching,
    error: brErr,
    refetch: refetchBrackets,
  } = useAdminGetBracketsQuery(tid, {
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  const {
    data: matchPage,
    isLoading: mLoading,
    isFetching: mFetching,
    error: mErr,
    refetch: refetchMatches,
  } = useAdminListMatchesByTournamentQuery(
    { tid, page: 1, pageSize: 1000 },
    { refetchOnFocus: true, refetchOnReconnect: true }
  );

  const [setLiveUrl, { isLoading: savingVideo }] =
    useAdminSetMatchLiveUrlMutation();

  const refetchMatchesRef = useRef(refetchMatches);
  const refetchBracketsRef = useRef(refetchBrackets);
  useEffect(() => {
    refetchMatchesRef.current = refetchMatches;
  }, [refetchMatches]);
  useEffect(() => {
    refetchBracketsRef.current = refetchBrackets;
  }, [refetchBrackets]);

  // Quyền
  const isAdmin = !!(
    me?.isAdmin ||
    me?.role === "admin" ||
    (Array.isArray(me?.roles) && me.roles.includes("admin"))
  );
  const isManager = useMemo(() => {
    if (!me?._id || !tour) return false;
    if (String(tour.createdBy) === String(me._id)) return true;
    if (Array.isArray(tour.managers)) {
      return tour.managers.some((m) => String(m?.user ?? m) === String(me._id));
    }
    return !!tour?.isManager;
  }, [tour, me]);
  const canManage = isAdmin || isManager;

  // Tabs động (KO cuối cùng, Round Elim ngay trước KO)
  const typesAvailable = useMemo(() => {
    const uniq = new Map();
    (bracketsData || []).forEach((b) => {
      const t = (b?.type || "").toString().toLowerCase();
      if (!t) return;
      if (!uniq.has(t))
        uniq.set(t, {
          type: t,
          label: TYPE_LABEL(t),
          weight: typeOrderWeight(t),
        });
    });
    if (uniq.size === 0)
      uniq.set("group", { type: "group", label: "Vòng bảng", weight: 1 });

    const arr = Array.from(uniq.values());
    arr.sort((a, b) => a.weight - b.weight);
    return arr;
  }, [bracketsData]);

  const [tab, setTab] = useState(typesAvailable[0]?.type || "group");
  useEffect(() => {
    const existed = typesAvailable.some((t) => t.type === tab);
    const fallback = typesAvailable[0]?.type || "group";
    if (!existed && fallback && fallback !== tab) {
      setTab(fallback);
    }
  }, [typesAvailable, tab]);

  // Lọc/sort controls
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState("time"); // "round" | "order" | "time"
  const [sortDir, setSortDir] = useState("asc");

  // allMatches
  const allMatches = useMemo(
    () => (Array.isArray(matchPage?.list) ? matchPage.list : []),
    [matchPage?.list]
  );

  /* ======== Realtime: seed map từ API & listen socket ======== */
  const seededFingerprintRef = useRef("");
  useEffect(() => {
    if (!allMatches.length) return;
    const fp = allMatches
      .map((m) =>
        [
          String(m?._id || ""),
          String(m?.liveVersion ?? m?.version ?? m?.updatedAt ?? ""),
        ].join(":")
      )
      .join("|");
    if (fp === seededFingerprintRef.current) return;
    seededFingerprintRef.current = fp;

    const mp = new Map();
    for (const m of allMatches) if (m?._id) mp.set(String(m._id), m);
    liveMapRef.current = mp;
    setLiveBump((x) => x + 1);
  }, [allMatches]);

  // listeners
  useEffect(() => {
    if (!socket) return;

    const onConnected = () => {
      joinedMatchesRef.current.forEach((mid) => {
        socket.emit("match:join", { matchId: mid });
        requestSnapshotRef.current?.(mid);
      });
    };
    const onUpsert = (payload) => queueUpsertRef.current?.(payload);
    const onRemove = (payload) => {
      const id = String(payload?.id ?? payload?._id ?? "");
      if (!id) return;
      if (liveMapRef.current.has(id)) {
        liveMapRef.current.delete(id);
        setLiveBump((x) => x + 1);
      }
    };

    const lastRefillAtRef = { current: 0 };
    const onRefilled = () => {
      const now = Date.now();
      if (now - lastRefillAtRef.current < 800) return;
      lastRefillAtRef.current = now;
      refetchMatchesRef.current?.();
      refetchBracketsRef.current?.();
    };

    const applyDirectMerge = (raw) => {
      const mp = liveMapRef.current;
      const incRaw = raw?.data ?? raw?.match ?? raw;
      const id = incRaw?._id ?? incRaw?.id ?? incRaw?.matchId;
      if (!id) return;
      const _id = String(id);
      const cur = mp.get(_id);

      const inc = { ...(incRaw || {}), _id };
      if (Array.isArray(inc.scores) && !inc.gameScores)
        inc.gameScores = inc.scores;
      if (inc.score_text && !inc.scoreText) inc.scoreText = inc.score_text;
      if (inc.state && !inc.status) inc.status = inc.state;
      if (inc.match_status && !inc.status) inc.status = inc.match_status;
      if (inc.updated_at && !inc.updatedAt) inc.updatedAt = inc.updated_at;
      if (inc.status) inc.status = normStatus(inc.status);
      if (inc.court && typeof inc.court === "object") {
        inc.court = {
          _id:
            inc.court._id ??
            (typeof inc.court.id === "string" ? inc.court.id : undefined),
          name: inc.court.name || inc.court.label || inc.court.title || "",
        };
      }

      const curStatus = normStatus(cur?.status);
      const newStatus = normStatus(inc?.status);
      const tNew = Date.parse(inc?.updatedAt ?? inc?.liveAt ?? 0);
      const tOld = Date.parse(cur?.updatedAt ?? cur?.liveAt ?? 0);
      const vNew = Number(inc?.liveVersion ?? inc?.version ?? NaN);
      const vOld = Number(cur?.liveVersion ?? cur?.version ?? NaN);

      let accept = !cur;
      if (!accept) {
        if (Number.isFinite(tNew) && Number.isFinite(tOld))
          accept = tNew >= tOld;
        else if (Number.isFinite(vNew) && Number.isFinite(vOld))
          accept = vNew >= vOld;
        if (!accept && (newStatus === "finished" || inc?.winner)) accept = true;
        if (!accept && newStatus && newStatus !== curStatus) accept = true;
      }

      if (!accept) return;
      const next = { ...(cur || {}), ...inc };
      mp.set(_id, next);
      setLiveBump((x) => x + 1);
    };

    const onScoreUpdated = (payload) => {
      const mid = String(payload?.matchId ?? payload?.id ?? payload?._id ?? "");
      if (
        !payload?.data &&
        !payload?.match &&
        Object.keys(payload || {}).length <= 2
      ) {
        if (mid) requestSnapshotRef.current?.(mid);
        return;
      }
      applyDirectMerge(payload);
    };

    socket.on("connect", onConnected);
    socket.on("match:update", onUpsert);
    socket.on("match:snapshot", onUpsert);
    socket.on("score:updated", onScoreUpdated);
    socket.on("match:deleted", onRemove);
    socket.on("draw:refilled", onRefilled);
    socket.on("bracket:updated", onRefilled);

    return () => {
      socket.off("connect", onConnected);
      socket.off("match:update", onUpsert);
      socket.off("match:snapshot", onUpsert);
      socket.off("score:updated", onScoreUpdated);
      socket.off("match:deleted", onRemove);
      socket.off("draw:refilled", onRefilled);
      socket.off("bracket:updated", onRefilled);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [socket]);

  // join ALL matches
  const allMatchIds = useMemo(() => {
    if (!allMatches.length) return [];
    return allMatches.map((m) => String(m?._id)).filter(Boolean);
  }, [allMatches]);

  useEffect(() => {
    if (!socket) return;
    const cur = joinedMatchesRef.current;

    allMatchIds.forEach((mid) => {
      if (!cur.has(mid)) {
        socket.emit("match:join", { matchId: mid });
        requestSnapshot(mid);
        cur.add(mid);
      }
    });
    cur.forEach((mid) => {
      if (!allMatchIds.includes(mid)) {
        socket.emit("match:leave", { matchId: mid });
        cur.delete(mid);
      }
    });

    return () => {
      cur.forEach((mid) => socket.emit("match:leave", { matchId: mid }));
      cur.clear();
    };
  }, [socket, allMatchIds, requestSnapshot]);

  // matches đã merge realtime (chỉ của giải hiện tại)
  const mergedAllMatches = useMemo(() => {
    const vals = Array.from(liveMapRef.current.values());
    return vals.filter(
      (m) => String(m?.tournament?._id || m?.tournament) === String(tid)
    );
  }, [tid, liveBump]);

  // ======== Sắp xếp ========
  const bucketWeight = (m) =>
    isLive(m)
      ? 0
      : isAssigned(m) && !isFinished(m)
      ? 1
      : isPendingNotAssigned(m)
      ? 2
      : isFinished(m)
      ? 3
      : 4;

  const secondaryCmp = (a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortKey === "order") {
      if ((a?.order ?? 0) !== (b?.order ?? 0))
        return ((a?.order ?? 0) - (b?.order ?? 0)) * dir;
      if ((a?.round ?? 0) !== (b?.round ?? 0))
        return ((a?.round ?? 0) - (b?.round ?? 0)) * dir;
      const ta = new Date(a?.scheduledAt || a?.createdAt || 0).getTime();
      const tb = new Date(b?.scheduledAt || b?.createdAt || 0).getTime();
      return (ta - tb) * dir;
    }
    if (sortKey === "time") {
      const ta = new Date(a?.scheduledAt || a?.createdAt || 0).getTime();
      const tb = new Date(b?.scheduledAt || b?.createdAt || 0).getTime();
      if (ta !== tb) return (ta - tb) * dir;
      if ((a?.round ?? 0) !== (b?.round ?? 0))
        return ((a?.round ?? 0) - (b?.round ?? 0)) * dir;
      return ((a?.order ?? 0) - (b?.order ?? 0)) * dir;
    }
    // default: round
    if ((a?.round ?? 0) !== (b?.round ?? 0))
      return ((a?.round ?? 0) - (b?.round ?? 0)) * dir;
    if ((a?.order ?? 0) !== (b?.order ?? 0))
      return ((a?.order ?? 0) - (b?.order ?? 0)) * dir;
    const ta = new Date(a?.scheduledAt || a?.createdAt || 0).getTime();
    const tb = new Date(b?.scheduledAt || b?.createdAt || 0).getTime();
    return (ta - tb) * dir;
  };

  const filterSortMatches = useCallback(
    (list) => {
      const kw = q.trim().toLowerCase();
      return list
        .filter((m) => {
          if (!kw) return true;
          const text = [
            matchCode(m),
            pairLabel(m?.pairA),
            pairLabel(m?.pairB),
            m?.status,
            m?.video,
            courtNameOf(m),
            scoreText(m),
          ]
            .join(" ")
            .toLowerCase();
          return text.includes(kw);
        })
        .sort((a, b) => {
          const wa = bucketWeight(a);
          const wb = bucketWeight(b);
          if (wa !== wb) return wa - wb;
          return secondaryCmp(a, b);
        });
    },
    [q, sortKey, sortDir]
  );

  // Viewer
  const [viewer, setViewer] = useState({ open: false, matchId: null });
  const openMatch = (mid) => setViewer({ open: true, matchId: mid });
  const closeMatch = () => setViewer({ open: false, matchId: null });

  // Video dialog
  const [videoDlg, setVideoDlg] = useState({
    open: false,
    match: null,
    url: "",
  });
  const openVideoDlg = (m) =>
    setVideoDlg({ open: true, match: m, url: m?.video || "" });
  const closeVideoDlg = () =>
    setVideoDlg({ open: false, match: null, url: "" });
  const onSaveVideo = async () => {
    try {
      if (!videoDlg.match?._id) return;
      await setLiveUrl({
        matchId: videoDlg.match._id,
        video: videoDlg.url || "",
      }).unwrap();
      closeVideoDlg();
      RNAlert.alert(
        "Thành công",
        videoDlg.url ? "Đã gán link video" : "Đã xoá link video"
      );
      refetchMatches();
    } catch (e) {
      RNAlert.alert(
        "Lỗi",
        e?.data?.message || e?.error || "Không lưu được link video"
      );
    }
  };

  // Refresh
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    try {
      setRefreshing(true);
      await Promise.all([refetchTour(), refetchBrackets(), refetchMatches()]);
    } finally {
      setRefreshing(false);
    }
  };

  // Guards
  const isInitialLoading = tourLoading || brLoading || mLoading;
  const hasError = tourErr || brErr || mErr;

  // Brackets theo tab
  const bracketsOfTab = useMemo(() => {
    const list = (bracketsData || []).filter(
      (b) => String(b?.type || "").toLowerCase() === String(tab).toLowerCase()
    );
    return list.sort((a, b) => {
      if ((a?.stage ?? 0) !== (b?.stage ?? 0))
        return (a?.stage ?? 0) - (b?.stage ?? 0);
      if ((a?.order ?? 0) !== (b?.order ?? 0))
        return (a?.order ?? 0) - (b?.order ?? 0);
      return new Date(a?.createdAt || 0) - new Date(b?.createdAt || 0);
    });
  }, [bracketsData, tab]);

  /* ----------- EXPORT ----------- */
  const buildRowsForBracket = useCallback((matches) => {
    return matches.map((m) => {
      const code = matchCode(m);
      const a = pairLabel(m?.pairA);
      const b = pairLabel(m?.pairB);
      const court = courtNameOf(m) || "—";
      const order =
        Number.isFinite(m?.order) || typeof m?.order === "number"
          ? `T${Number(m.order) + 1}`
          : "—";
      const score = scoreText(m) || "—";
      return [code, a, b, court, order, score];
    });
  }, []);

  const buildExportPayload = useCallback(() => {
    const payload = [];
    for (const b of bracketsOfTab) {
      const bid = String(b?._id);
      const matches = mergedAllMatches.filter(
        (m) => String(m?.bracket?._id || m?.bracket) === bid
      );
      const list = filterSortMatches(matches);
      payload.push({
        title: `${b?.name || "Bracket"} — ${TYPE_LABEL(b?.type)}`,
        rows: buildRowsForBracket(list),
      });
    }
    return payload;
  }, [bracketsOfTab, mergedAllMatches, filterSortMatches, buildRowsForBracket]);

  // Helper: share hoặc mở preview nếu chia sẻ không khả dụng
  const shareOrPreview = async (fileUri, { mimeType, uti, title }) => {
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType,
          UTI: uti,
          dialogTitle: title || "Chia sẻ tệp",
        });
        return;
      }
    } catch (e) {}
    try {
      const ok = await Linking.openURL(fileUri);
      if (!ok) throw new Error("openURL returned false");
    } catch (e) {
      RNAlert.alert(
        "Không thể mở/chia sẻ tệp",
        `Tệp đã được lưu tại:\n${fileUri}\n\nBạn có thể mở thủ công trong ứng dụng Files/Quản lý tệp.`
      );
    }
  };

  // === PDF
  const handleExportPDF = useCallback(async () => {
    try {
      const sections = buildExportPayload();
      if (!sections.length) {
        RNAlert.alert("Thông báo", "Không có dữ liệu để xuất.");
        return;
      }
      const html = buildExportHTML({
        tourName: tour?.name || "",
        typeLabel: TYPE_LABEL(tab),
        sections,
      });
      const { uri } = await Print.printToFileAsync({ html });
      await shareOrPreview(uri, {
        mimeType: "application/pdf",
        uti: "com.adobe.pdf",
        title: "Xuất PDF",
      });
    } catch (e) {
      RNAlert.alert("Lỗi", "Xuất PDF thất bại.");
    }
  }, [buildExportPayload, tab, tour?.name]);

  // === Word
  const handleExportWord = useCallback(async () => {
    try {
      const sections = buildExportPayload();
      if (!sections.length) {
        RNAlert.alert("Thông báo", "Không có dữ liệu để xuất.");
        return;
      }
      const html = buildExportHTML({
        tourName: tour?.name || "",
        typeLabel: TYPE_LABEL(tab),
        sections,
      });
      const content = `\ufeff${html}`;
      const safeName = (tour?.name || "export")
        .replace(/[^\p{L}\p{N}]+/gu, "_")
        .replace(/^_+|_+$/g, "")
        .toLowerCase();
      const fileName = `tournament_${safeName}_${tab}_${new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/[:T]/g, "-")}.doc`;
      const fileUri = FileSystem.cacheDirectory + fileName;
      await FileSystem.writeAsStringAsync(fileUri, content, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      await shareOrPreview(fileUri, {
        mimeType: "application/msword",
        uti: "com.microsoft.word.doc",
        title: "Xuất Word",
      });
    } catch (e) {
      RNAlert.alert("Lỗi", "Xuất Word thất bại.");
    }
  }, [buildExportPayload, tab, tour?.name]);

  /* ----------- SHEET STATES ----------- */
  const [refMgrOpen, setRefMgrOpen] = useState(false);
  const [assignCourtSheet, setAssignCourtSheet] = useState({
    open: false,
    match: null,
  });
  const [assignRefSheet, setAssignRefSheet] = useState({
    open: false,
    match: null,
  });
  const [courtMgrSheet, setCourtMgrSheet] = useState({
    open: false,
    bracket: null,
  });
  const [liveSetupSheet, setLiveSetupSheet] = useState({
    open: false,
    bracket: null,
  });

  /* ----------- small UI (THEMED) ----------- */
  const Pill = ({ label, kind = "default" }) => {
    const st =
      kind === "primary"
        ? { bg: t.chipInfoBg, fg: t.chipInfoFg }
        : { bg: t.chipDefaultBg, fg: t.chipDefaultFg };
    return (
      <View
        style={{
          backgroundColor: st.bg,
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: 8,
        }}
      >
        <Text style={{ color: st.fg, fontSize: 12 }}>{label}</Text>
      </View>
    );
  };

  const StatusPill = ({ status }) => {
    const v = t.statusTone(status);
    return (
      <View
        style={{
          backgroundColor: v.bg,
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: 8,
        }}
      >
        <Text style={{ color: v.fg, fontSize: 12 }}>{v.label}</Text>
      </View>
    );
  };

  const MiniChipBtn = ({ icon, label, onPress, color = colors.primary }) => (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.miniBtn,
        { borderColor: color, paddingHorizontal: 10, paddingVertical: 6 },
        pressed && { opacity: 0.9 },
      ]}
    >
      <MaterialIcons name={icon} size={16} color={color} />
      <Text
        style={{ color, fontSize: 12, fontWeight: "700" }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );

  const VideoPill = ({ has }) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          backgroundColor: has ? t.successBg : t.chipDefaultBg,
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: 999,
        }}
      >
        <MaterialIcons
          name="videocam"
          size={14}
          color={has ? t.successFg : t.chipDefaultFg}
        />
        <Text
          style={{ color: has ? t.successFg : t.chipDefaultFg, fontSize: 12 }}
        >
          Video
        </Text>
      </View>
    </View>
  );

  const CourtPill = ({ name }) =>
    name ? (
      <View
        style={{
          backgroundColor: t.courtBg,
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: 999,
        }}
      >
        <Text style={{ color: t.courtFg, fontSize: 12 }} numberOfLines={1}>
          {name}
        </Text>
      </View>
    ) : null;

  const ScorePill = ({ textVal }) =>
    textVal ? (
      <View
        style={{
          borderColor: colors.border,
          borderWidth: 1,
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: 8,
        }}
      >
        <Text style={{ color: colors.text, fontSize: 12, fontWeight: "700" }}>
          {textVal}
        </Text>
      </View>
    ) : null;

  const ActionButtons = ({ m }) => {
    const has = !!m?.video;
    const canStart = isUserRefereeOfMatch(m, me) && m?.status !== "finished";
    const onOpenRefNote = async () => {
      try {
        const html = buildRefReportHTML({
          tourName: tour?.name || "",
          code: matchCode(m),
          court: courtNameOf(m),
          referee: refereeNames(m),
          team1: pairLabel(m?.pairA),
          team2: pairLabel(m?.pairB),
          logoUrl: "",
        });
        const { uri } = await Print.printToFileAsync({ html });
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: "Biên bản trọng tài",
        });
      } catch (e) {
        RNAlert.alert("Lỗi", "Không xuất được biên bản.");
      }
    };

    /* ===== EdgeFadedHScroll: Horizontal Scroll + fade hint ===== */
    const EdgeFadedHScroll = ({
      children,
      contentContainerStyle,
      style,
      bgColor = "#fff",
      chevronColor = "#94a3b8",
      ...props
    }) => {
      const [state, setState] = React.useState({
        canScroll: false,
        showL: false,
        showR: false,
      });
      const boxW = React.useRef(0);
      const contentW = React.useRef(0);

      const update = React.useCallback((x = 0) => {
        const can = contentW.current > boxW.current + 2;
        const showL = can && x > 2;
        const maxX = Math.max(0, contentW.current - boxW.current);
        const showR = can && x < maxX - 2;
        setState({ canScroll: can, showL, showR });
      }, []);

      return (
        <View
          onLayout={(e) => {
            boxW.current = e.nativeEvent.layout.width || 0;
            update(0);
          }}
          style={[{ position: "relative" }, style]}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            onContentSizeChange={(w) => {
              contentW.current = w || 0;
              update(0);
            }}
            onScroll={(e) => update(e.nativeEvent.contentOffset.x || 0)}
            scrollEventThrottle={16}
            contentContainerStyle={contentContainerStyle}
            {...props}
          >
            {children}
          </ScrollView>

          {/* LEFT hint */}
          {state.canScroll && state.showL && (
            <>
              <LinearGradient
                pointerEvents="none"
                colors={[bgColor, "transparent"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.fadeLeft}
              />
              <View pointerEvents="none" style={[styles.chev, { left: 4 }]}>
                <MaterialIcons
                  name="chevron-left"
                  size={16}
                  color={chevronColor}
                />
              </View>
            </>
          )}

          {/* RIGHT hint */}
          {state.canScroll && state.showR && (
            <>
              <LinearGradient
                pointerEvents="none"
                colors={["transparent", bgColor]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.fadeRight}
              />
              <View pointerEvents="none" style={[styles.chev, { right: 4 }]}>
                <MaterialIcons
                  name="chevron-right"
                  size={16}
                  color={chevronColor}
                />
              </View>
            </>
          )}
        </View>
      );
    };

    return (
      <EdgeFadedHScroll
        contentContainerStyle={styles.actionsWrap}
        bgColor={colors.card} // màu nền để fade đúng với card
        chevronColor={t.muted} // màu mũi tên “hint”
      >
        <MiniChipBtn icon="print" label="Biên bản TT" onPress={onOpenRefNote} />
        <MiniChipBtn
          icon="stadium"
          label="Gán sân"
          onPress={() => setAssignCourtSheet({ open: true, match: m })}
        />
        <MiniChipBtn
          icon="how-to-reg"
          label="Gán trọng tài"
          onPress={() => setAssignRefSheet({ open: true, match: m })}
        />
        {canStart && (
          <MiniChipBtn
            icon="play-arrow"
            label="Bắt trận"
            onPress={() => router.push(refereeRouteOf(m))}
          />
        )}
        {has && (
          <MiniChipBtn
            icon="open-in-new"
            label="Mở"
            onPress={() =>
              Linking.openURL(m.video).catch(() =>
                RNAlert.alert("Lỗi", "Không mở được liên kết.")
              )
            }
          />
        )}
        <MiniChipBtn
          icon="edit"
          label={has ? "Sửa video" : "Thêm video"}
          onPress={() => openVideoDlg(m)}
        />
        {has && (
          <MiniChipBtn
            icon="link-off"
            label="Xoá"
            color="#ef4444"
            onPress={() => setVideoDlg({ open: true, match: m, url: "" })}
          />
        )}
      </EdgeFadedHScroll>
    );
  };

  /* ----------- row render ----------- */
  const renderMatchRow = ({ item: m }) => {
    const hasVideo = !!m?.video;
    const score = scoreText(m);
    const courtLabel = courtNameOf(m);
    const ordNum =
      typeof m?.order === "number"
        ? m.order
        : m?.order != null
        ? parseInt(String(m?.order), 10)
        : null;

    return (
      <Pressable
        onPress={() => openMatch(m._id)}
        style={({ pressed }) => [
          styles.matchRow,
          { borderColor: colors.border, backgroundColor: colors.card },
          pressed && { opacity: 0.95 },
        ]}
      >
        <ActionButtons m={m} />
        <View style={styles.contentBlock}>
          <Text
            style={[styles.code, { color: colors.text }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {matchCode(m)}
          </Text>
          <Text
            style={{ color: colors.text }}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {pairLabel(m?.pairA)}
          </Text>
          <Text
            style={{ color: colors.text }}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {pairLabel(m?.pairB)}
          </Text>

          <View style={styles.metaRow}>
            <StatusPill status={m?.status} />
            <CourtPill name={courtLabel} />
            <ScorePill textVal={score} />
            <Text style={{ color: t.muted, fontSize: 12 }}>
              Vòng {m?.round ?? "—"} • Thứ tự{" "}
              {ordNum != null && !Number.isNaN(ordNum) ? ordNum + 1 : "—"}
            </Text>
            <VideoPill has={hasVideo} />
          </View>
        </View>
      </Pressable>
    );
  };

  const renderBracket = ({ item: b }) => {
    const bid = String(b?._id);
    const matches = mergedAllMatches.filter(
      (m) => String(m?.bracket?._id || m?.bracket) === bid
    );
    const list = filterSortMatches(matches);
    const listVersion = `${sortKey}|${sortDir}|${q}|${liveBump}`;

    return (
      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginBottom: 10,
            flexWrap: "wrap",
          }}
        >
          <Text
            style={[styles.bracketTitle, { color: colors.text }]}
            numberOfLines={1}
          >
            {b?.name || "Bracket"}
          </Text>

          {/* Quản lý sân (open sheet) */}
          <MiniChipBtn
            icon="stadium"
            label="Quản lý sân"
            onPress={() => setCourtMgrSheet({ open: true, bracket: b })}
          />
          <MiniChipBtn
            icon="settings"
            label="Thiết lập LIVE"
            onPress={() => setLiveSetupSheet({ open: true, bracket: b })}
          />
          <Pill label={TYPE_LABEL(b?.type)} />
          {typeof b?.stage === "number" ? (
            <Pill label={`Stage ${b.stage}`} />
          ) : null}
          <Pill label={`${list.length} trận`} kind="primary" />
        </View>

        {list.length === 0 ? (
          <View style={[styles.emptyBox, { borderColor: colors.border }]}>
            <Text style={{ color: t.muted }}>Chưa có trận nào.</Text>
          </View>
        ) : (
          <FlatList
            data={list}
            keyExtractor={(m) => String(m._id)}
            renderItem={renderMatchRow}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            scrollEnabled={false}
            extraData={listVersion}
          />
        )}
      </View>
    );
  };

  // ===== Header-right dropdown w/ anchor =====
  const [hdrMenuOpen, setHdrMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const hdrBtnRef = useRef(null);

  /* ----------- guards ----------- */
  if (isInitialLoading) {
    return (
      <>
        <Stack.Screen
          options={{ title: "Quản lý giải", headerTitleAlign: "center" }}
        />
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </>
    );
  }

  if (hasError) {
    return (
      <>
        <Stack.Screen
          options={{ title: "Quản lý giải", headerTitleAlign: "center" }}
        />
        <View style={[styles.screen, { backgroundColor: colors.background }]}>
          <View
            style={[
              styles.alert,
              { borderColor: t.dangerBorder, backgroundColor: t.dangerBg },
            ]}
          >
            <Text style={{ color: t.dangerText }}>
              {tourErr?.data?.message ||
                brErr?.data?.message ||
                mErr?.data?.message ||
                "Lỗi tải dữ liệu"}
            </Text>
          </View>
        </View>
      </>
    );
  }

  if (!canManage) {
    return (
      <>
        <Stack.Screen
          options={{
            title: `Quản lý giải: ${tour?.name || ""}`,
            headerTitleAlign: "center",
          }}
        />
        <View style={[styles.screen, { backgroundColor: colors.background }]}>
          <View
            style={[
              styles.alert,
              { borderColor: t.warnBorder, backgroundColor: t.warnBg },
            ]}
          >
            <Text style={{ color: t.warnText }}>
              Bạn không có quyền truy cập trang này.
            </Text>
          </View>
          <View style={{ marginTop: 12 }}>
            <BtnOutline onPress={() => router.push(`/tournament/${tid}/home`)}>
              Quay lại trang giải
            </BtnOutline>
          </View>
        </View>
      </>
    );
  }

  const MenuItem = ({ icon, label, onPress, danger }) => (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.9 }]}
    >
      <MaterialIcons
        name={icon}
        size={18}
        color={danger ? "#ef4444" : colors.text}
        style={{ marginRight: 8 }}
      />
      <Text
        style={{
          color: danger ? "#ef4444" : colors.text,
          fontSize: 14,
          fontWeight: "600",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );

  /* ----------- render ----------- */
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: `Quản lý giải: ${tour?.name || ""}`,
          headerTitleAlign: "center",
          headerRight: () => (
            <Pressable
              ref={hdrBtnRef}
              onPress={() => {
                hdrBtnRef.current?.measureInWindow?.((x, y, w, h) => {
                  setMenuAnchor({ x, y, width: w, height: h });
                  setHdrMenuOpen(true);
                }) || setHdrMenuOpen(true);
              }}
              style={({ pressed }) => [
                { paddingHorizontal: 8, paddingVertical: 4 },
                pressed && { opacity: 0.7 },
              ]}
              hitSlop={12}
            >
              <MaterialIcons name="more-vert" size={22} color={colors.text} />
            </Pressable>
          ),
        }}
      />

      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        {/* Controls */}
        <View
          style={[
            styles.toolbar,
            { borderColor: colors.border, backgroundColor: colors.card },
          ]}
        >
          <View style={[styles.inputWrap, { borderColor: colors.border }]}>
            <MaterialIcons name="search" size={18} color={t.muted} />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="Tìm trận, cặp đấu, link…"
              placeholderTextColor={t.placeholder}
              value={q}
              onChangeText={setQ}
            />
          </View>

          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <PickerChip
              label={`Sắp xếp: ${
                sortKey === "time"
                  ? "Thời gian"
                  : sortKey === "order"
                  ? "Thứ tự"
                  : "Vòng"
              }`}
              onPress={() =>
                setSortKey((k) =>
                  k === "time" ? "round" : k === "round" ? "order" : "time"
                )
              }
              icon="sort"
              colorsTheme={{ bg: t.chipDefaultBg, fg: t.chipDefaultFg }}
            />
            <PickerChip
              label={`Chiều: ${sortDir === "asc" ? "Tăng" : "Giảm"}`}
              onPress={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              icon={sortDir === "asc" ? "arrow-upward" : "arrow-downward"}
              colorsTheme={{ bg: t.chipDefaultBg, fg: t.chipDefaultFg }}
            />
            <Pill
              label={`${bracketsOfTab.length} bracket • ${TYPE_LABEL(tab)}`}
            />
          </View>
        </View>

        {/* Tabs động */}
        <View style={[styles.tabs, { borderColor: colors.border }]}>
          {typesAvailable.map((tTab) => {
            const active = tTab.type === tab;
            return (
              <Pressable
                key={tTab.type}
                onPress={() => setTab(tTab.type)}
                style={({ pressed }) => [
                  styles.tabItem,
                  {
                    backgroundColor: active ? colors.primary : "transparent",
                    borderColor: active ? colors.primary : colors.border,
                  },
                  pressed && { opacity: 0.95 },
                ]}
              >
                <Text
                  style={{
                    color: active ? "#fff" : colors.text,
                    fontWeight: "700",
                  }}
                >
                  {TYPE_LABEL(tTab.type)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* List brackets */}
        <FlatList
          data={bracketsOfTab}
          keyExtractor={(b) => String(b._id)}
          renderItem={renderBracket}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          refreshing={refreshing || tourFetching || brFetching || mFetching}
          onRefresh={onRefresh}
          contentContainerStyle={{ paddingBottom: 24 }}
          ListEmptyComponent={
            <View
              style={[
                styles.alert,
                { borderColor: t.infoBorder, backgroundColor: t.infoBg },
              ]}
            >
              <Text style={{ color: t.infoText }}>
                Chưa có bracket thuộc loại {TYPE_LABEL(tab)}.
              </Text>
            </View>
          }
          extraData={liveBump}
        />
        {/* Viewer */}
        <ResponsiveMatchViewer
          open={viewer.open}
          matchId={viewer.matchId}
          onClose={closeMatch}
        />
        {/* Modal gán link video */}
        <Modal
          visible={videoDlg.open}
          transparent
          animationType="fade"
          onRequestClose={closeVideoDlg}
        >
          <View style={styles.modalBackdrop}>
            <Pressable style={{ flex: 1 }} onPress={closeVideoDlg} />
            <View
              style={[
                styles.modalCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <Text
                  style={{
                    color: colors.text,
                    fontWeight: "700",
                    fontSize: 16,
                  }}
                >
                  {(videoDlg?.match &&
                    (videoDlg.match.code || matchCode(videoDlg.match))) ||
                    ""}{" "}
                  — Link video
                </Text>
                <IconBtn
                  name="close"
                  color={colors.text}
                  size={20}
                  onPress={closeVideoDlg}
                />
              </View>

              <View style={[styles.inputWrap, { borderColor: colors.border }]}>
                <MaterialIcons name="link" size={18} color={t.muted} />
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="URL video (YouTube/Facebook/TikTok/M3U8…)"
                  placeholderTextColor={t.placeholder}
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={videoDlg.url}
                  onChangeText={(v) => setVideoDlg((s) => ({ ...s, url: v }))}
                />
              </View>
              <Text style={{ color: t.muted, fontSize: 12, marginTop: 4 }}>
                Dán link live hoặc VOD. Để trống rồi Lưu để xoá link.
              </Text>

              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "flex-end",
                  gap: 8,
                  marginTop: 12,
                }}
              >
                <BtnOutline onPress={closeVideoDlg} tint={colors.primary}>
                  Huỷ
                </BtnOutline>
                <BtnPrimary
                  onPress={onSaveVideo}
                  disabled={savingVideo}
                  tint={colors.primary}
                >
                  {savingVideo
                    ? "Đang lưu…"
                    : videoDlg.url
                    ? "Lưu link"
                    : "Xoá link"}
                </BtnPrimary>
              </View>
            </View>
            <Pressable style={{ flex: 1 }} onPress={closeVideoDlg} />
          </View>
        </Modal>

        {/* ===== Header dropdown ===== */}
        <Modal
          visible={hdrMenuOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setHdrMenuOpen(false)}
        >
          <View style={{ flex: 1 }}>
            <Pressable
              style={styles.menuBackdrop}
              onPress={() => setHdrMenuOpen(false)}
            />
            <View
              pointerEvents="box-none"
              style={{
                position: "absolute",
                top: menuAnchor
                  ? Math.max(
                      (insets.top || 0) + 4,
                      menuAnchor.y + (menuAnchor.height || 0) + 4
                    )
                  : (insets.top || 0) + 8,
                right: menuAnchor
                  ? Math.max(
                      8,
                      width - (menuAnchor.x + (menuAnchor.width || 0))
                    )
                  : 12,
              }}
            >
              <View
                style={[
                  styles.menuBox,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <MenuItem
                  icon="groups"
                  label="Quản lý trọng tài"
                  onPress={() => {
                    setHdrMenuOpen(false);
                    setRefMgrOpen(true);
                  }}
                />
                <MenuItem
                  icon="picture-as-pdf"
                  label="Xuất PDF"
                  onPress={async () => {
                    setHdrMenuOpen(false);
                    await handleExportPDF();
                  }}
                />
                <MenuItem
                  icon="description"
                  label="Xuất Word"
                  onPress={async () => {
                    setHdrMenuOpen(false);
                    await handleExportWord();
                  }}
                />
                <MenuItem
                  icon="home"
                  label="Trang giải"
                  onPress={() => {
                    setHdrMenuOpen(false);
                    router.push(`/tournament/${tid}/home`);
                  }}
                />
                {isAdmin && (
                  <MenuItem
                    icon="casino"
                    label="Bốc thăm"
                    onPress={() => {
                      setHdrMenuOpen(false);
                      router.push(`/tournament/${tid}/draw`);
                    }}
                  />
                )}
              </View>
            </View>
          </View>
        </Modal>

        {/* ===== SHEETS (gorhom) ===== */}
        <ManageRefereesSheet
          open={refMgrOpen}
          onClose={() => setRefMgrOpen(false)}
          tournamentId={tid}
          onChanged={() => {}}
        />
        <AssignCourtSheet
          open={assignCourtSheet.open}
          onClose={() => setAssignCourtSheet({ open: false, match: null })}
          tournamentId={tid}
          match={assignCourtSheet.match}
          onAssigned={() => refetchMatches()}
        />
        <AssignRefSheet
          open={assignRefSheet.open}
          onClose={() => setAssignRefSheet({ open: false, match: null })}
          tournamentId={tid}
          match={assignRefSheet.match}
          onChanged={() => refetchMatches()}
        />
        <CourtManagerSheet
          open={courtMgrSheet.open}
          onClose={() => setCourtMgrSheet({ open: false, bracket: null })}
          tournamentId={tid}
          bracketId={String(courtMgrSheet.bracket?._id || "")}
          bracketName={courtMgrSheet.bracket?.name}
          tournamentName={tour?.name}
        />
        <LiveSetupSheet
          open={liveSetupSheet.open}
          onClose={() => setLiveSetupSheet({ open: false, bracket: null })}
          tournamentId={tid}
          bracketId={String(liveSetupSheet.bracket?._id || "")}
          bracketName={liveSetupSheet.bracket?.name}
        />
      </View>
    </View>
  );
}

/* ---------------- small UI (buttons/chips) ---------------- */
function BtnPrimary({ onPress, children, disabled, tint }) {
  const bg = disabled ? "#94a3b8" : tint || "#0a84ff";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg },
        pressed && !disabled && { opacity: 0.9 },
      ]}
    >
      <Text style={{ color: "#fff", fontWeight: "700" }}>{children}</Text>
    </Pressable>
  );
}
function BtnOutline({ onPress, children, tint }) {
  const color = tint || "#0a84ff";
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        { borderWidth: 1, borderColor: color, backgroundColor: "transparent" },
        pressed && { opacity: 0.95 },
      ]}
    >
      <Text style={{ color, fontWeight: "700" }}>{children}</Text>
    </Pressable>
  );
}
function PickerChip({ label, onPress, icon, colorsTheme }) {
  const bg = colorsTheme?.bg ?? "#eef2f7";
  const fg = colorsTheme?.fg ?? "#263238";
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          backgroundColor: bg,
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 999,
        },
        pressed && { opacity: 0.9 },
      ]}
    >
      {icon ? <MaterialIcons name={icon} size={16} color={fg} /> : null}
      <Text style={{ color: fg, fontSize: 12, fontWeight: "600" }}>
        {label}
      </Text>
    </Pressable>
  );
}

/* ---------------- styles ---------------- */
const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  tabs: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 12,
    padding: 4,
    gap: 8,
    marginBottom: 12,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },

  toolbar: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
    gap: 10,
  },
  inputWrap: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: Platform.select({ ios: 10, android: 8 }),
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  input: { flex: 1, fontSize: 15 },

  card: { borderWidth: 1, borderRadius: 14, padding: 12 },
  bracketTitle: { fontSize: 16, fontWeight: "700" },

  /* match row */
  matchRow: { borderWidth: 1, borderRadius: 12, padding: 10 },
  actionsWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingRight: 4,
  },
  contentBlock: { marginTop: 8, gap: 2 },
  metaRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    marginTop: 6,
    flexWrap: "wrap",
  },

  code: { fontWeight: "700", marginBottom: 4 },

  btn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
  miniBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
  },

  alert: { borderWidth: 1, borderRadius: 12, padding: 12, marginVertical: 8 },
  emptyBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 560,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
  },

  // header dropdown
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.001)",
  },
  menuBox: {
    minWidth: 220,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 6,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 6,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  fadeLeft: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 18,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    zIndex: 2,
  },
  fadeRight: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 18,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    zIndex: 2,
  },
  chev: {
    position: "absolute",
    top: "50%",
    marginTop: -8,
    padding: 2,
    borderRadius: 999,
    zIndex: 3,
  },
});
