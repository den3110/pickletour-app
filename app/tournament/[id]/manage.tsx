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
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  ScrollView,
  Animated,
} from "react-native";
import { Stack, useLocalSearchParams, router } from "expo-router";
import { useSelector } from "react-redux";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
// Export/Share
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";

import {
  useGetTournamentQuery,
  useAdminGetBracketsQuery,
  useAdminListMatchesByTournamentQuery,
  useAdminSetMatchLiveUrlMutation,
  useAdminBatchSetMatchLiveUrlMutation, // ⬅️ NEW (batch video)
} from "@/slices/tournamentsApiSlice";

import {
  useBatchAssignRefereeMutation, // ⬅️ NEW (batch referee)
  useListTournamentRefereesQuery, // ⬅️ NEW (referee options)
} from "@/slices/refereeScopeApiSlice";

import ResponsiveMatchViewer from "@/components/match/ResponsiveMatchViewer";
import { useSocket } from "@/context/SocketContext";

// Sheets có sẵn
import ManageRefereesSheet from "@/components/sheets/ManageRefereesSheet";
import AssignCourtSheet from "@/components/sheets/AssignCourtSheet";
import AssignRefSheet from "@/components/sheets/AssignRefSheet";
import CourtManagerSheet from "@/components/sheets/CourtManagerSheet";
import LiveSetupSheet from "@/components/sheets/LiveSetupSheet";
import { Platform } from "react-native";

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

const pairIdOf = (p) => {
  if (!p) return "";
  if (typeof p === "string") return p;
  if (typeof p === "number") return String(p);
  return (
    p._id ||
    p.id ||
    p.pairId ||
    (p.player1?._id && p.player2?._id
      ? `${p.player1._id}__${p.player2._id}`
      : "")
  );
};

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

// KO luôn sau cùng, RoundElim ngay trước KO
const typeOrderWeight = (t) => {
  const k = String(t || "").toLowerCase();
  if (k === "group") return 1;
  if (k === "po" || k === "playoff") return 2;
  if (k === "swiss") return 3;
  if (k === "gsl") return 4;
  if (k === "double_elim" || k === "doubleelim") return 5;
  if (k === "roundelim" || k === "round_elim" || k === "round-elim")
    return 9998;
  if (k === "knockout" || k === "ko") return 9999;
  return 7000;
};

const IconBtn = ({ name, onPress, color = "#111", size = 18, style }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [style, pressed && { opacity: 0.8 }]}
  >
    <MaterialIcons name={name} size={size} color={color} />
  </Pressable>
);

// Trọng tài
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

const refereeRouteOf = (m) => `/match/${m._id}/referee`;

/* ====== HTML builders ====== */
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
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>${css}</style></head><body>
    <table class="no-border" style="width:100%">
      <tr class="no-border">
        <td class="no-border" style="width:96px"><img style="width:96px" src="${
          logoUrl || ""
        }" alt="logo"/></td>
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
    <div style="height:90px;"></div>
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
      </table>`
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"/><style>${css}</style></head>
  <body>
    <h1>Quản lý giải: ${tourName || ""}</h1>
    <div class="sub">Loại: ${typeLabel} • Xuất lúc: ${now}</div>
    ${blocks}
  </body></html>`;
};

/* ---------------- THEME TOKENS ---------------- */
function getThemeTokens(colors, dark) {
  const tint = colors.primary;
  const muted = dark ? "#9aa0a6" : "#64748b";
  const placeholder = dark ? "#8b97a8" : "#94a3b8";
  const disabled = dark ? "#475569" : "#94a3b8";

  const chipDefaultBg = dark ? "#1f2937" : "#eef2f7";
  const chipDefaultFg = dark ? "#e5e7eb" : "#263238";
  const chipInfoBg = dark ? "#0f2536" : "#e0f2fe";
  const chipInfoFg = dark ? "#93c5fd" : "#075985";

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

/* ---------- small local UI comps ---------- */
const BtnOutline = ({ onPress, children }) => {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.border,
        },
        pressed && { opacity: 0.9 },
      ]}
    >
      <Text style={{ color: colors.text, fontWeight: "700" }}>{children}</Text>
    </Pressable>
  );
};

const PickerChip = ({ label, onPress, icon, colorsTheme }) => {
  const { colors, dark } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 999,
          backgroundColor: colorsTheme?.bg,
        },
        pressed && { opacity: 0.9 },
      ]}
    >
      {icon ? (
        <MaterialIcons name={icon} size={14} color={colorsTheme?.fg} />
      ) : null}
      <Text style={{ color: colorsTheme?.fg, fontSize: 12, fontWeight: "700" }}>
        {label}
      </Text>
    </Pressable>
  );
};

const MenuItem = ({ icon, label, onPress, danger }) => {
  const { colors, dark } = useTheme();

  return (
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
};

/* ---------------- main ---------------- */
export default function ManageScreen() {
  const { id } = useLocalSearchParams();
  const tid = Array.isArray(id) ? id[0] : id;

  const { colors, dark } = useTheme();
  const t = useMemo(() => getThemeTokens(colors, dark), [colors, dark]);

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

  const [setLiveUrl] = useAdminSetMatchLiveUrlMutation();
  const [batchSetLiveUrl, { isLoading: batchingVideo }] =
    useAdminBatchSetMatchLiveUrlMutation(); // NEW

  // Batch referee APIs
  const {
    data: refData,
    isLoading: refsLoading,
    error: refsErr,
  } = useListTournamentRefereesQuery({ tid }, { skip: false }); // NEW
  const [batchAssign, { isLoading: batchingRefs }] =
    useBatchAssignRefereeMutation(); // NEW

  // Keep refs to refetchers
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
    if (Array.isArray(tour.managers))
      return tour.managers.some((m) => String(m?.user ?? m) === String(me._id));
    return !!tour?.isManager;
  }, [tour, me]);
  const canManage = isAdmin || isManager;

  // Tabs
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
    return Array.from(uniq.values()).sort((a, b) => a.weight - b.weight);
  }, [bracketsData]);

  const [tab, setTab] = useState(typesAvailable[0]?.type || "group");
  useEffect(() => {
    if (!typesAvailable.some((t) => t.type === tab)) {
      setTab(typesAvailable[0]?.type || "group");
    }
  }, [typesAvailable, tab]);

  // Lọc/sort
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState("time"); // "round" | "order" | "time"
  const [sortDir, setSortDir] = useState("asc");

  // allMatches
  const allMatches = useMemo(
    () => (Array.isArray(matchPage?.list) ? matchPage.list : []),
    [matchPage?.list]
  );

  /* ======== Realtime: seed & listen ======== */
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

  useEffect(() => {
    if (!socket) return;

    const queueUpsert = (payload) => {
      const incRaw = payload?.data ?? payload?.match ?? payload;
      const id = incRaw?._id ?? incRaw?.id ?? incRaw?.matchId;
      if (!id) return;
      const inc = { ...(incRaw || {}), _id: String(id) };

      if (Array.isArray(inc.scores) && !inc.gameScores)
        inc.gameScores = inc.scores;
      if (typeof inc.score_text === "string" && !inc.scoreText)
        inc.scoreText = inc.score_text;

      if (inc.court && typeof inc.court === "object") {
        inc.court = {
          _id:
            inc.court._id ??
            (typeof inc.court.id === "string" ? inc.court.id : undefined),
          name: inc.court.name || inc.court.label || inc.court.title || "",
        };
      }

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

    const onConnected = () => {
      joinedMatchesRef.current.forEach((mid) => {
        socket.emit("match:join", { matchId: mid });
        requestSnapshot(mid);
      });
    };
    const onRemove = (payload) => {
      const id = String(payload?.id ?? payload?._id ?? "");
      if (!id) return;
      if (liveMapRef.current.has(id)) {
        liveMapRef.current.delete(id);
        setLiveBump((x) => x + 1);
      }
    };

    let lastRefill = 0;
    const onRefilled = () => {
      const now = Date.now();
      if (now - lastRefill < 800) return;
      lastRefill = now;
      refetchMatchesRef.current?.();
      refetchBracketsRef.current?.();
    };

    socket.on("connect", onConnected);
    socket.on("match:update", queueUpsert);
    socket.on("match:snapshot", queueUpsert);
    socket.on("score:updated", queueUpsert);
    socket.on("match:deleted", onRemove);
    socket.on("draw:refilled", onRefilled);
    socket.on("bracket:updated", onRefilled);

    return () => {
      socket.off("connect", onConnected);
      socket.off("match:update", queueUpsert);
      socket.off("match:snapshot", queueUpsert);
      socket.off("score:updated", queueUpsert);
      socket.off("match:deleted", onRemove);
      socket.off("draw:refilled", onRefilled);
      socket.off("bracket:updated", onRefilled);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [socket, requestSnapshot]);

  // join ALL matches for room updates
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

  // merged matches chỉ của giải hiện tại
  const mergedAllMatches = useMemo(() => {
    const vals = Array.from(liveMapRef.current.values());
    return vals.filter(
      (m) => String(m?.tournament?._id || m?.tournament) === String(tid)
    );
  }, [tid, liveBump]);

  // Busy map cho cặp
  const liveBusyByPairId = useMemo(() => {
    const mp = new Map();
    for (const m of mergedAllMatches) {
      if (!isLive(m)) continue;
      const mid = String(m._id);
      const court = courtNameOf(m);
      const push = (p) => {
        const pid = pairIdOf(p);
        if (!pid) return;
        const arr = mp.get(pid) || [];
        arr.push({ matchId: mid, court });
        mp.set(pid, arr);
      };
      push(m.pairA);
      push(m.pairB);
    }
    return mp;
  }, [mergedAllMatches]);

  // Sort helpers
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
    // default round
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

  // Single video dialog
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

  // ======= NEW: Selection like Web =======
  const [selectedMatchIds, setSelectedMatchIds] = useState(() => new Set());
  const [selBump, setSelBump] = useState(0);
  const toggleSelectMatch = useCallback((mid) => {
    setSelectedMatchIds((prev) => {
      const next = new Set(prev);
      const key = String(mid);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setSelBump((x) => x + 1);
  }, []);
  const clearSelection = useCallback(() => {
    setSelectedMatchIds(new Set());
    setSelBump((x) => x + 1);
  }, []);
  const isAllSelectedIn = useCallback(
    (arr) =>
      arr.length > 0 && arr.every((m) => selectedMatchIds.has(String(m._id))),
    [selectedMatchIds]
  );
  const toggleSelectAllIn = useCallback((arr, checked) => {
    setSelectedMatchIds((prev) => {
      const next = new Set(prev);
      arr.forEach((m) => {
        const key = String(m._id);
        if (checked) next.add(key);
        else next.delete(key);
      });
      return next;
    });
    setSelBump((x) => x + 1);
  }, []);

  // ======= NEW: Batch dialogs state =======
  const [batchRefDlg, setBatchRefDlg] = useState({ open: false });
  const [pickedRefs, setPickedRefs] = useState([]);
  const refOptions = useMemo(() => {
    const list = Array.isArray(refData?.items)
      ? refData.items
      : Array.isArray(refData)
      ? refData
      : [];
    return list;
  }, [refData]);
  const idOfRef = (r) => String(r?._id ?? r?.id ?? "");
  const labelOfRef = (r) =>
    r?.name || r?.nickname || (idOfRef(r) ? `#${idOfRef(r).slice(-4)}` : "");

  const [batchVideoDlg, setBatchVideoDlg] = useState({ open: false, url: "" });

  const submitBatchAssign = useCallback(async () => {
    const ids = Array.from(selectedMatchIds);
    const refs = pickedRefs.map(idOfRef).filter(Boolean);
    if (!ids.length) return RNAlert.alert("Thông báo", "Chưa chọn trận nào.");
    if (!refs.length)
      return RNAlert.alert("Thông báo", "Hãy chọn ít nhất 1 trọng tài.");
    try {
      await batchAssign({ ids, referees: refs }).unwrap();
      RNAlert.alert("Thành công", `Đã gán trọng tài cho ${ids.length} trận`);
      setBatchRefDlg({ open: false });
      setPickedRefs([]);
      clearSelection();
      await refetchMatches?.();
    } catch (e) {
      RNAlert.alert("Lỗi", e?.data?.message || "Gán trọng tài thất bại");
    }
  }, [
    selectedMatchIds,
    pickedRefs,
    batchAssign,
    clearSelection,
    refetchMatches,
  ]);

  const submitBatchSetVideo = useCallback(async () => {
    const ids = Array.from(selectedMatchIds);
    const url = (batchVideoDlg.url || "").trim();
    if (!ids.length) return RNAlert.alert("Thông báo", "Chưa chọn trận nào.");
    if (!url) return RNAlert.alert("Thông báo", "Hãy nhập link video hợp lệ.");
    try {
      await batchSetLiveUrl({ ids, video: url }).unwrap();
      RNAlert.alert("Thành công", `Đã gán video cho ${ids.length} trận`);
      setBatchVideoDlg({ open: false, url: "" });
      clearSelection();
      await refetchMatches?.();
    } catch (e) {
      RNAlert.alert("Lỗi", e?.data?.message || "Gán video thất bại");
    }
  }, [
    selectedMatchIds,
    batchVideoDlg.url,
    batchSetLiveUrl,
    clearSelection,
    refetchMatches,
  ]);

  /* ----------- Sheets state (giữ nguyên) ----------- */
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

  /* ----------- small THEMED chips ----------- */
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
  const BusyChip = ({ court }) => (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        backgroundColor: "#fef3c7",
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 999,
      }}
    >
      <MaterialIcons name="warning" size={12} color="#b45309" />
      <Text style={{ color: "#b45309", fontSize: 11, fontWeight: "600" }}>
        Đang thi đấu{court ? ` (${court})` : ""}
      </Text>
    </View>
  );
  const MiniChipBtn = ({ icon, label, onPress, color = colors.primary }) => (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.miniBtn,
        { borderColor: color },
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

  // Edge-fade horizontal scroller cho ActionButtons
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
      } catch {
        RNAlert.alert("Lỗi", "Không xuất được biên bản.");
      }
    };
    return (
      <EdgeFadedHScroll
        contentContainerStyle={styles.actionsWrap}
        bgColor={colors.card}
        chevronColor={t.muted}
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

  /* ----------- row render (with selection) ----------- */
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

    const isThisMatchLive = isLive(m);
    const isThisMatchFinished = isFinished(m);

    const pAId = pairIdOf(m?.pairA);
    const pBId = pairIdOf(m?.pairB);

    const busyInfoA =
      !isThisMatchFinished &&
      !isThisMatchLive &&
      pAId &&
      liveBusyByPairId.has(pAId)
        ? liveBusyByPairId.get(pAId).find((x) => x.matchId !== String(m._id))
        : null;
    const busyInfoB =
      !isThisMatchFinished &&
      !isThisMatchLive &&
      pBId &&
      liveBusyByPairId.has(pBId)
        ? liveBusyByPairId.get(pBId).find((x) => x.matchId !== String(m._id))
        : null;

    const checked = selectedMatchIds.has(String(m._id));

    return (
      <Pressable
        onPress={() => openMatch(m._id)}
        style={({ pressed }) => [
          styles.matchRow,
          { borderColor: colors.border, backgroundColor: colors.card },
          pressed && { opacity: 0.95 },
        ]}
      >
        {/* ⬇️ Dòng riêng cho checkbox chọn item */}
        <Pressable
          onPress={(e) => {
            e?.stopPropagation?.();
            toggleSelectMatch(m._id);
          }}
          style={({ pressed }) => [
            styles.selectRow,
            { borderColor: colors.border },
            pressed && { opacity: 0.9 },
          ]}
        >
          <MaterialIcons
            name={checked ? "check-box" : "check-box-outline-blank"}
            size={20}
            color={checked ? colors.primary : t.muted}
          />
          <Text
            style={{
              color: colors.text,
              fontWeight: "700",
            }}
          >
            {checked ? "Đã chọn" : ""}
          </Text>
          <View style={{ flex: 1 }} />
          {/* hiển thị mã trận nhỏ bên phải cho tiện nhìn */}
          <Text style={{ color: t.muted, fontSize: 12 }}>{matchCode(m)}</Text>
        </Pressable>

        {/* Action buttons */}
        <ActionButtons m={m} />

        {/* Nội dung */}
        <View style={styles.contentBlock}>
          <Text style={[styles.code, { color: colors.text }]} numberOfLines={1}>
            {matchCode(m)}
          </Text>

          {/* Pair A */}
          <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
            <Text style={{ color: colors.text }} numberOfLines={1}>
              {pairLabel(m?.pairA)}
            </Text>
            {busyInfoA ? <BusyChip court={busyInfoA.court} /> : null}
          </View>

          {/* Pair B */}
          <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
            <Text style={{ color: colors.text }} numberOfLines={1}>
              {pairLabel(m?.pairB)}
            </Text>
            {busyInfoB ? <BusyChip court={busyInfoB.court} /> : null}
          </View>

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
    const listVersion = `${sortKey}|${sortDir}|${q}|${liveBump}|${selBump}`;

    const allSelected = isAllSelectedIn(list);
    const selectedCount = list.filter((m) =>
      selectedMatchIds.has(String(m._id))
    ).length;

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
          <Pill label={TYPE_LABEL(b?.type)} />
          {typeof b?.stage === "number" ? (
            <Pill label={`Stage ${b.stage}`} />
          ) : null}
          <Pill label={`${list.length} trận`} kind="primary" />
        </View>

        {/* Select-all row (mobile) */}
        {list.length > 0 && (
          <View style={styles.selectAllRow}>
            <Pressable
              onPress={() => toggleSelectAllIn(list, !allSelected)}
              style={({ pressed }) => [
                { flexDirection: "row", alignItems: "center", gap: 8 },
                pressed && { opacity: 0.9 },
              ]}
            >
              <MaterialIcons
                name={
                  allSelected
                    ? "check-box"
                    : selectedCount > 0
                    ? "indeterminate-check-box"
                    : "check-box-outline-blank"
                }
                size={18}
                color={colors.text}
              />
              <Text style={{ color: colors.text, fontWeight: "700" }}>
                {allSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}
              </Text>
            </Pressable>
            {selectedCount > 0 ? (
              <Pill label={`${selectedCount} đã chọn`} />
            ) : null}
          </View>
        )}

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

  // Header dropdown (đơn giản)
  const [hdrMenuOpen, setHdrMenuOpen] = useState(false);

  /* ----------- guards ----------- */
  const isInitialLoading = tourLoading || brLoading || mLoading;
  const hasError = tourErr || brErr || mErr;

  if (isInitialLoading) {
    return (
      <>
        <Stack.Screen
          options={{ title: "Quản lý giải", headerTitleAlign: "center" }}
        />
        <View style={[styles.center]}>
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
        <View style={[styles.screen]}>
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
        <View style={[styles.screen]}>
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

  /* ----------- render ----------- */
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: `Quản lý giải: ${tour?.name || ""}`,
          headerTitleAlign: "center",
          headerRight: () => (
            <Pressable
              onPress={() => setHdrMenuOpen(true)}
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

      <View style={[styles.screen]}>
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
              label={`${
                typesAvailable.length ? bracketsOfTab.length : 0
              } bracket • ${TYPE_LABEL(tab)}`}
            />
          </View>
        </View>

        {/* Tabs */}
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

        {/* Brackets list */}
        <FlatList
          data={bracketsOfTab}
          keyExtractor={(b) => String(b._id)}
          renderItem={renderBracket}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          refreshing={refreshing || tourFetching || brFetching || mFetching}
          onRefresh={onRefresh}
          contentContainerStyle={{
            paddingBottom: 24 + (selectedMatchIds.size > 0 ? 70 : 0),
          }}
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
          extraData={`${liveBump}|${selBump}`}
        />

        {/* Viewer */}
        <ResponsiveMatchViewer
          open={viewer.open}
          matchId={viewer.matchId}
          onClose={closeMatch}
        />

        {/* Floating action bar when selected > 0 */}
        {selectedMatchIds.size > 0 && (
          <View
            style={[
              styles.bottomBar,
              {
                paddingBottom: 8 + insets.bottom,
                backgroundColor: colors.card,
                borderTopColor: colors.border,
              },
            ]}
          >
            <View
              style={[
                styles.bottomRow,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Pill
                label={`Đã chọn ${selectedMatchIds.size} trận`}
                kind="primary"
              />

              {/* Scroll ngang có fade & mũi tên: dùng lại EdgeFadedHScroll ở trên */}
              <View style={{ flex: 1 }}>
                <EdgeFadedHScroll
                  contentContainerStyle={styles.bottomActions}
                  bgColor={colors.card}
                  chevronColor={t.muted}
                  fadeWidth={28}
                  threshold={12}
                  style={{ maxHeight: 40 }}
                >
                  <BtnOutline onPress={() => setBatchRefDlg({ open: true })}>
                    <Text style={{ fontWeight: "700", color: colors.text }}>
                      Gán trọng tài
                    </Text>
                  </BtnOutline>

                  <BtnOutline
                    onPress={() => setBatchVideoDlg({ open: true, url: "" })}
                  >
                    <Text style={{ fontWeight: "700", color: colors.text }}>
                      Gán video
                    </Text>
                  </BtnOutline>

                  <BtnOutline onPress={clearSelection}>
                    <Text style={{ fontWeight: "700", color: colors.text }}>
                      Bỏ chọn
                    </Text>
                  </BtnOutline>
                </EdgeFadedHScroll>
              </View>
            </View>
          </View>
        )}

        {/* ==== Header Menu ==== */}
        <Modal
          visible={hdrMenuOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setHdrMenuOpen(false)}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setHdrMenuOpen(false)}
          >
            <View />
          </Pressable>
          <View
            style={[
              styles.menuCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setHdrMenuOpen(false);
                setRefMgrOpen(true);
              }}
            >
              <MaterialIcons
                name="how-to-reg"
                size={18}
                color={colors.text}
                style={{ marginRight: 8 }}
              />
              <Text style={{ color: colors.text, fontWeight: "700" }}>
                Quản lý trọng tài
              </Text>
            </Pressable>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setHdrMenuOpen(false);
                setCourtMgrSheet({ open: true, bracket: null });
              }}
            >
              <MaterialIcons
                name="stadium"
                size={18}
                color={colors.text}
                style={{ marginRight: 8 }}
              />
              <Text style={{ color: colors.text, fontWeight: "700" }}>
                Quản lý sân
              </Text>
            </Pressable>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setHdrMenuOpen(false);
                setLiveSetupSheet({ open: true, bracket: null });
              }}
            >
              <MaterialIcons
                name="movie"
                size={18}
                color={colors.text}
                style={{ marginRight: 8 }}
              />
              <Text style={{ color: colors.text, fontWeight: "700" }}>
                Thiết lập LIVE
              </Text>
            </Pressable>
            <View style={{ height: 8 }} />
            <Pressable
              style={styles.menuItem}
              onPress={async () => {
                setHdrMenuOpen(false);
                try {
                  const sections = buildExportPayload();
                  if (!sections.length)
                    return RNAlert.alert(
                      "Thông báo",
                      "Không có dữ liệu để xuất."
                    );
                  const html = buildExportHTML({
                    tourName: tour?.name || "",
                    typeLabel: TYPE_LABEL(tab),
                    sections,
                  });
                  const { uri } = await Print.printToFileAsync({ html });
                  await Sharing.shareAsync(uri, {
                    mimeType: "application/pdf",
                    dialogTitle: "Xuất PDF",
                  });
                } catch {
                  RNAlert.alert("Lỗi", "Xuất PDF thất bại.");
                }
              }}
            >
              <MaterialIcons
                name="picture-as-pdf"
                size={18}
                color={colors.text}
                style={{ marginRight: 8 }}
              />
              <Text style={{ color: colors.text, fontWeight: "700" }}>
                Xuất PDF
              </Text>
            </Pressable>
            <Pressable
              style={styles.menuItem}
              onPress={async () => {
                setHdrMenuOpen(false);
                try {
                  const sections = buildExportPayload();
                  if (!sections.length)
                    return RNAlert.alert(
                      "Thông báo",
                      "Không có dữ liệu để xuất."
                    );
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
                  await Sharing.shareAsync(fileUri, {
                    mimeType: "application/msword",
                    dialogTitle: "Xuất Word",
                  });
                } catch {
                  RNAlert.alert("Lỗi", "Xuất Word thất bại.");
                }
              }}
            >
              <MaterialIcons
                name="description"
                size={18}
                color={colors.text}
                style={{ marginRight: 8 }}
              />
              <Text style={{ color: colors.text, fontWeight: "700" }}>
                Xuất Word
              </Text>
            </Pressable>
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
        </Modal>

        {/* ====== Single video modal ====== */}
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
                  placeholder="URL video (YouTube/Facebook/TikTok/M3U8...)"
                  placeholderTextColor={t.placeholder}
                  value={videoDlg.url}
                  onChangeText={(s) => setVideoDlg((v) => ({ ...v, url: s }))}
                />
              </View>

              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "flex-end",
                  gap: 8,
                  marginTop: 10,
                }}
              >
                <BtnOutline onPress={closeVideoDlg}>Đóng</BtnOutline>
                <BtnOutline onPress={onSaveVideo}>
                  <Text style={{ color: colors.text, fontWeight: "700" }}>
                    Lưu
                  </Text>
                </BtnOutline>
              </View>
            </View>
          </View>
        </Modal>

        {/* ====== NEW: Batch Referee modal ====== */}
        <Modal
          visible={batchRefDlg.open}
          transparent
          animationType="fade"
          onRequestClose={() => setBatchRefDlg({ open: false })}
        >
          <View style={styles.modalBackdrop}>
            <Pressable
              style={{ flex: 1 }}
              onPress={() => setBatchRefDlg({ open: false })}
            />
            <View
              style={[
                styles.modalCard,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  maxHeight: 460,
                },
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
                  Gán trọng tài cho {selectedMatchIds.size} trận
                </Text>
                <IconBtn
                  name="close"
                  color={colors.text}
                  size={20}
                  onPress={() => setBatchRefDlg({ open: false })}
                />
              </View>

              <View
                style={[
                  styles.inputWrap,
                  { borderColor: colors.border, marginBottom: 10 },
                ]}
              >
                <MaterialIcons name="search" size={18} color={t.muted} />
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="Tìm trọng tài (tên, nickname...)"
                  placeholderTextColor={t.placeholder}
                  onChangeText={() => {}}
                />
              </View>

              <ScrollView style={{ maxHeight: 320 }}>
                {refsErr ? (
                  <Text style={{ color: t.warnText }}>
                    Không tải được danh sách trọng tài.
                  </Text>
                ) : refsLoading ? (
                  <Text style={{ color: t.muted }}>Đang tải…</Text>
                ) : refOptions.length === 0 ? (
                  <Text style={{ color: t.muted }}>
                    Chưa có trọng tài trong giải.
                  </Text>
                ) : (
                  refOptions.map((r) => {
                    const id = idOfRef(r);
                    const chosen = pickedRefs.some((x) => idOfRef(x) === id);
                    return (
                      <Pressable
                        key={id}
                        onPress={() =>
                          setPickedRefs((prev) =>
                            chosen
                              ? prev.filter((x) => idOfRef(x) !== id)
                              : [...prev, r]
                          )
                        }
                        style={({ pressed }) => [
                          styles.refRow,
                          { borderColor: colors.border },
                          pressed && { opacity: 0.9 },
                        ]}
                      >
                        <MaterialIcons
                          name={
                            chosen ? "check-box" : "check-box-outline-blank"
                          }
                          size={18}
                          color={chosen ? colors.primary : t.muted}
                          style={{ marginRight: 8 }}
                        />
                        <Text style={{ color: colors.text, fontWeight: "700" }}>
                          {r?.name || r?.nickname || "—"}
                        </Text>
                        {r?.nickname && r?.name ? (
                          <Text style={{ color: t.muted, marginLeft: 6 }}>
                            ({r.nickname})
                          </Text>
                        ) : null}
                      </Pressable>
                    );
                  })
                )}
              </ScrollView>

              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "flex-end",
                  gap: 8,
                  marginTop: 10,
                }}
              >
                <BtnOutline onPress={() => setBatchRefDlg({ open: false })}>
                  Đóng
                </BtnOutline>
                <Pressable
                  onPress={submitBatchAssign}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    {
                      backgroundColor: colors.primary,
                      opacity: pressed || batchingRefs ? 0.9 : 1,
                    },
                  ]}
                  disabled={
                    batchingRefs ||
                    pickedRefs.length === 0 ||
                    selectedMatchIds.size === 0
                  }
                >
                  <Text style={{ color: "#fff", fontWeight: "800" }}>Gán</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* ====== NEW: Batch Video modal ====== */}
        <Modal
          visible={batchVideoDlg.open}
          transparent
          animationType="fade"
          onRequestClose={() => setBatchVideoDlg({ open: false, url: "" })}
        >
          <View style={styles.modalBackdrop}>
            <Pressable
              style={{ flex: 1 }}
              onPress={() => setBatchVideoDlg({ open: false, url: "" })}
            />
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
                  Gán video cho {selectedMatchIds.size} trận
                </Text>
                <IconBtn
                  name="close"
                  color={colors.text}
                  size={20}
                  onPress={() => setBatchVideoDlg({ open: false, url: "" })}
                />
              </View>

              <View style={[styles.inputWrap, { borderColor: colors.border }]}>
                <MaterialIcons name="link" size={18} color={t.muted} />
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="URL video (Facebook/YouTube/M3U8...)"
                  placeholderTextColor={t.placeholder}
                  value={batchVideoDlg.url}
                  onChangeText={(s) =>
                    setBatchVideoDlg((v) => ({ ...v, url: s }))
                  }
                />
              </View>

              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "flex-end",
                  gap: 8,
                  marginTop: 10,
                }}
              >
                <BtnOutline
                  onPress={() => setBatchVideoDlg({ open: false, url: "" })}
                >
                  Đóng
                </BtnOutline>
                <Pressable
                  onPress={submitBatchSetVideo}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    {
                      backgroundColor: colors.primary,
                      opacity: pressed || batchingVideo ? 0.9 : 1,
                    },
                  ]}
                  disabled={
                    batchingVideo ||
                    !batchVideoDlg.url.trim() ||
                    selectedMatchIds.size === 0
                  }
                >
                  <Text style={{ color: "#fff", fontWeight: "800" }}>Gán</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* ===== Sheets có sẵn ===== */}
        <ManageRefereesSheet
          open={refMgrOpen}
          onClose={() => setRefMgrOpen(false)}
          tournamentId={tid}
          onChanged={() => {
            refetchMatches?.();
            refetchBrackets?.();
          }}
        />
        <AssignCourtSheet
          open={assignCourtSheet.open}
          onClose={() => setAssignCourtSheet({ open: false, match: null })}
          match={assignCourtSheet.match}
          tournamentId={tid}
          onAssigned={() => refetchMatches?.()}
        />
        <AssignRefSheet
          open={assignRefSheet.open}
          onClose={() => setAssignRefSheet({ open: false, match: null })}
          match={assignRefSheet.match}
          tournamentId={tid}
          onChanged={() => refetchMatches?.()}
        />
        <CourtManagerSheet
          open={courtMgrSheet.open}
          onClose={() => setCourtMgrSheet({ open: false, bracket: null })}
          tournamentId={tid}
          bracketId={null}
          bracketName=""
          tournamentName={tour?.name || ""}
        />
        <LiveSetupSheet
          open={liveSetupSheet.open}
          onClose={() => setLiveSetupSheet({ open: false, bracket: null })}
          tournamentId={tid}
          bracketId={null}
        />
      </View>
    </View>
  );

  // ===== Export payload builder (reuse in header menu) =====
  function buildRowsForBracket(matches) {
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
  }
  function buildExportPayload() {
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
  }
}

/* ---------------- styles ---------------- */
const styles = StyleSheet.create({
  screen: { flex: 1, padding: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  alert: { borderWidth: 1, borderRadius: 12, padding: 12 },
  toolbar: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
    gap: 10,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  input: { flex: 1, fontSize: 14, paddingVertical: 4 },
  tabs: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    paddingVertical: 6,
    borderBottomWidth: 1,
    marginBottom: 12,
  },
  tabItem: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  bracketTitle: { fontSize: 16, fontWeight: "800" },
  emptyBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },

  matchRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    position: "relative",
  },

  /* ⬇️ dòng riêng cho checkbox của từng item */
  selectRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    marginBottom: 8,
  },

  contentBlock: { gap: 6, marginTop: 6 },
  code: { fontSize: 14, fontWeight: "800" },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },

  miniBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  actionsWrap: { paddingRight: 6, gap: 6, alignItems: "center" },

  fadeLeft: { position: "absolute", left: 0, top: 0, bottom: 0, width: 18 },
  fadeRight: { position: "absolute", right: 0, top: 0, bottom: 0, width: 18 },
  chev: {
    position: "absolute",
    top: "50%",
    marginTop: -8,
    padding: 2,
    borderRadius: 999,
    zIndex: 3,
  },

  selectAllRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    // shadow
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.12,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: -2 },
      },
      android: { elevation: 10 },
    }),
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
  },
  bottomActions: {
    gap: 8,
    alignItems: "center",
    paddingRight: 6, // để EdgeFadedHScroll có chỗ fade
  },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
  modalCard: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 20,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
  },
  menuCard: {
    position: "absolute",
    right: 12,
    top: 56,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 6,
    minWidth: 220,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  refRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  primaryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
});
