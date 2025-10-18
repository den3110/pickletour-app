// app/screens/PickleBall/match/MatchContent.native.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Platform,
  TextInput,
  Alert,
  Switch,
} from "react-native";
import Constants from "expo-constants";
import { useSelector } from "react-redux";
import { WebView } from "react-native-webview";
import { Video } from "expo-av";
import * as Clipboard from "expo-clipboard";
import Toast from "react-native-toast-message";
import { MaterialIcons } from "@expo/vector-icons";
import { useAdminPatchMatchMutation } from "@/slices/matchesApiSlice";
import PublicProfileDialog from "../PublicProfileDialog";
import RefereeJudgePanel from "./RefereeScorePanel.native";
import { useVerifyManagerQuery } from "@/slices/tournamentsApiSlice";
import { skipToken } from "@reduxjs/toolkit/query";

// === OVERLAY: helpers ===
const _safeURL = (u) => {
  try {
    const x = new URL(u);
    return x;
  } catch {
    try {
      const x = new URL(`https://${u}`);
      return x;
    } catch {
      return null;
    }
  }
};
function resolveWebBase(tour, overlayCfg) {
  const envBase =
    (typeof process !== "undefined" &&
      process?.env?.EXPO_PUBLIC_WEB_BASE_URL) ||
    Constants?.expoConfig?.extra?.WEB_BASE_URL ||
    Constants?.expoConfig?.extra?.WEB_BASE ||
    "";

  const candidates = [
    overlayCfg?.host,
    overlayCfg?.base,
    tour?.links?.web,
    tour?.links?.public,
    tour?.webUrl,
    tour?.site,
    tour?.domain && `https://${tour.domain}`,
    envBase,
    "https://pickletour.vn",
  ].filter(Boolean);

  for (const c of candidates) {
    const u = _safeURL(c);
    if (u) return u.origin;
  }
  return "https://pickletour.vn";
}

function buildOverlayUrl(base, matchId, { theme, size, showSets, autoNext }) {
  if (!base || !matchId) return "";
  const qp = new URLSearchParams({
    matchId: String(matchId),
    theme: theme || "dark",
    size: size || "md",
    showSets: showSets ? "1" : "0",
    autoNext: autoNext ? "1" : "0",
  });
  return `${base}/overlay/score?${qp.toString()}`;
}

/* ---------- name helpers ---------- */
export const preferName = (p) =>
  (p?.fullName && String(p.fullName).trim()) ||
  (p?.name && String(p.name).trim()) ||
  (p?.nickname && String(p.nickname).trim()) ||
  "N/A";

export const preferNick = (p) =>
  (p?.nickname && String(p.nickname).trim()) ||
  (p?.nickName && String(p.nickName).trim()) ||
  (p?.nick && String(p.nick).trim()) ||
  (p?.user?.nickname && String(p.user.nickname).trim()) ||
  (p?.user?.nickName && String(p.user.nickName).trim()) ||
  (p?.user?.nick && String(p.user.nick).trim()) ||
  "";

export const nameWithNick = (p) => {
  if (!p) return "—";
  const nk = preferNick(p);
  const nm =
    (p?.fullName && String(p.fullName).trim()) ||
    (p?.name && String(p.name).trim()) ||
    (p?.user?.fullName && String(p.user.fullName).trim()) ||
    (p?.user?.name && String(p.user.name).trim()) ||
    "";
  return nk || nm || "—";
};

/* ---------- seed/dep label ---------- */
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

// ——— Parse V/T từ mã trận hiện tại (Vx-Ty) ———
const parseVT = (m) => {
  const tryStrings = [
    m?.code,
    m?.name,
    m?.label,
    m?.displayCode,
    m?.displayName,
    m?.matchCode,
    m?.slotCode,
    m?.bracketCode,
    m?.bracketLabel,
    m?.meta?.code,
    m?.meta?.label,
  ];
  let v = null,
    t = null;
  for (const s of tryStrings) {
    if (typeof s === "string") {
      const k = s.match(/\bV(\d+)-T(\d+)\b/i);
      if (k) {
        v = parseInt(k[1], 10);
        t = parseInt(k[2], 10);
        break;
      }
    }
  }
  if (v == null) {
    const cand = [m?.v, m?.V, m?.roundV, m?.round, m?.meta?.v];
    for (const c of cand) {
      const n = Number(c);
      if (Number.isFinite(n)) {
        v = n;
        break;
      }
    }
  }
  if (t == null) {
    const cand = [
      m?.t,
      m?.T,
      m?.order,
      m?.matchOrder,
      m?.meta?.t,
      m?.meta?.order,
    ];
    for (const c of cand) {
      const n = Number(c);
      if (Number.isFinite(n)) {
        t = n >= 1 ? n : n + 1;
        break;
      } // order 0-based -> +1
    }
  }
  return { v, t };
};

// ——— Suy ra W/L từ prevDep nếu có, mặc định W ———

// ——— Tạo label prev dựa vào code hiện tại (chuẩn KO):
// A: W-V(v-1)-T(2*t-1), B: W-V(v-1)-T(2*t) ———
const prevLabelByCurrent = (m, side, prevDep) => {
  const { v, t } = parseVT(m);
  if (Number.isFinite(v) && Number.isFinite(t) && v > 1) {
    const prevV = v - 1;
    const prevT = side === "A" ? 2 * t - 1 : 2 * t;
    const wl = inferWL(prevDep) || "W";
    return `${wl}-V${prevV}-T${prevT}`;
  }
  // fallback: dùng prevDep nếu có, cuối cùng là TBD
  return prevDep ? depLabel(prevDep) : "TBD";
};

// ---- NEW: depLabel theo chuẩn web: W/L-V{round}-T{order+1} ----
const inferWL = (prev) => {
  const t = String(
    prev?.type || prev?.source || prev?.from || ""
  ).toLowerCase();
  const loser = prev?.loser === true || t.includes("loser");
  const winner = prev?.winner === true || t.includes("winner");
  if (loser && !winner) return "L";
  return "W";
};
const _num = (v) => (Number.isFinite(Number(v)) ? Number(v) : NaN);
const _inferWL = (prev) => {
  const t = String(
    prev?.type || prev?.source || prev?.from || ""
  ).toLowerCase();
  if (prev?.loser === true || t.includes("loser")) return "L";
  return "W";
};
export const depLabel = (prev) => {
  if (!prev) return "TBD";
  const wl = _inferWL(prev);
  const r =
    _num(prev?.round) ??
    _num(prev?.v) ??
    _num(prev?.V) ??
    _num(prev?.ref?.round) ??
    "?";
  const orderRaw =
    _num(prev?.order) ?? _num(prev?.idx) ?? _num(prev?.ref?.order) ?? 0;
  const t = Number.isFinite(orderRaw) ? orderRaw + 1 : 1;
  return `${wl}-V${r}-T${t}`;
};

/* ====================== current V helpers (label fix) ====================== */
function extractCurrentV(m) {
  const tryStrings = [
    m?.code,
    m?.name,
    m?.label,
    m?.displayCode,
    m?.displayName,
    m?.matchCode,
    m?.slotCode,
    m?.bracketCode,
    m?.bracketLabel,
    m?.meta?.code,
    m?.meta?.label,
  ];
  for (const s of tryStrings) {
    if (typeof s === "string") {
      const k = s.match(/\bV(\d+)-T(\d+)\b/i);
      if (k) return parseInt(k[1], 10);
    }
  }
  const nums = [m?.v, m?.V, m?.roundV, m?.meta?.v]
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n));
  return nums.length ? nums[0] : null;
}

function isGroupPrev(prev) {
  const t = String(
    prev?.type || prev?.source || prev?.from || ""
  ).toLowerCase();
  return (
    t.includes("grouprank") || !!prev?.ref?.groupCode || t.includes("group")
  );
}

function smartDepLabel(m, prevDep) {
  // y hệt web: lấy depLabel(prev) rồi dịch V về vòng trước của match hiện tại
  const raw = depLabel(prevDep);
  const currV = extractCurrentV(m);
  return String(raw).replace(/\b([WL])-V(\d+)-T(\d+)\b/gi, (_s, wl, v, t) => {
    const pv = parseInt(v, 10);
    const newV =
      currV != null
        ? Math.max(1, currV - 1)
        : m?.prevBracket?.type !== "group"
        ? pv + 2
        : pv + 1;
    return `${wl}-V${newV}-T${t}`;
  });
}

function formatStatus(status) {
  switch (status) {
    case "scheduled":
      return "Chưa diễn ra";
    case "live":
      return "Đang diễn ra";
    case "assigned":
      return "Chuẩn bị";
    case "finished":
      return "Đã diễn ra";
    default:
      return "Chưa diễn ra";
  }
}

/* ---------- PlayerLink ---------- */
function PlayerLink({ person, onOpen, align = "left" }) {
  if (!person) return null;
  const uid =
    person?.user?._id ||
    person?.user?.id ||
    person?.user ||
    person?._id ||
    person?.id ||
    null;

  const handlePress = () => uid && onOpen?.(uid);

  return (
    <Text
      onPress={handlePress}
      style={[styles.linkText, align === "right" && { textAlign: "right" }]}
    >
      {nameWithNick(person)}
    </Text>
  );
}

/* ---------- Hooks: chống nháy ---------- */
function useDelayedFlag(flag, ms = 250) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let t;
    if (flag) t = setTimeout(() => setShow(true), ms);
    else setShow(false);
    return () => clearTimeout(t);
  }, [flag, ms]);
  return show;
}

/* ---------- LOCK: chỉ cập nhật đúng match đang mở ---------- */
/** Khóa id trận đầu tiên nhận qua prop m; về sau chỉ nhận update khi id khớp. */
function useLockedMatch(m, { loading }) {
  const [lockedId, setLockedId] = useState(() => (m?._id ? String(m._id) : ""));
  const [view, setView] = useState(() => (m?._id ? m : null));

  // Lần đầu có m => khóa
  useEffect(() => {
    if (!lockedId && m?._id) {
      setLockedId(String(m._id));
      setView(m);
    }
  }, [m?._id, lockedId, m]);

  // Nếu m cập nhật nhưng id trùng lockedId => nhận; khác id => bỏ qua
  useEffect(() => {
    if (!m) return;
    if (lockedId && String(m._id) === lockedId) {
      setView((prev) => (isMatchEqual(prev, m) ? prev : m));
    } else if (!lockedId && m?._id) {
      setLockedId(String(m._id));
      setView(m);
    }
  }, [m, lockedId]);

  const waiting = loading && !view;
  return { lockedId, view, setView, waiting };
}

/* ---------- Time helpers ---------- */
function ts(x) {
  if (!x) return 0;
  const d = typeof x === "number" ? new Date(x) : new Date(String(x));
  const t = d.getTime();
  return Number.isFinite(t) ? t : 0;
}
function toDateSafe(x) {
  const t = ts(x);
  return t ? new Date(t) : null;
}
function pickDisplayTime(m) {
  return m?.scheduledAt ?? m?.startedAt ?? m?.assignedAt ?? null;
}
function formatClock(d) {
  if (!d) return "";
  const pad = (n) => String(n).padStart(2, "0");
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const dd = pad(d.getDate());
  const MM = pad(d.getMonth() + 1);
  return `${hh}:${mm} • ${dd}/${MM}`;
}
function isMatchEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a._id !== b._id) return false;
  if (a.status !== b.status) return false;

  const ra = a.rules || {};
  const rb = b.rules || {};
  if ((ra.bestOf ?? 3) !== (rb.bestOf ?? 3)) return false;
  if ((ra.pointsToWin ?? 11) !== (rb.pointsToWin ?? 11)) return false;
  if ((ra.winByTwo ?? false) !== (rb.winByTwo ?? false)) return false;

  const gsA = JSON.stringify(a.gameScores || []);
  const gsB = JSON.stringify(b.gameScores || []);
  if (gsA !== gsB) return false;

  if (ts(a.scheduledAt) !== ts(b.scheduledAt)) return false;
  if (ts(a.startedAt) !== ts(b.startedAt)) return false;
  if (ts(a.assignedAt) !== ts(b.assignedAt)) return false;
  if (ts(a.finishedAt) !== ts(b.finishedAt)) return false;

  const saA = a.seedA ?? null;
  const saB = b.seedA ?? null;
  const sbA = a.seedB ?? null;
  const sbB = b.seedB ?? null;

  const paA = a.pairA?._id ?? a.pairA ?? null;
  const paB = b.pairA?._id ?? b.pairA ?? null;
  const pbA = a.pairB?._id ?? a.pairB ?? null;
  const pbB = b.pairB?._id ?? b.pairB ?? null;

  return saA === saB && sbA === sbB && paA === paB && pbA === pbB;
}
function lastGameScore(gameScores) {
  if (!Array.isArray(gameScores) || !gameScores.length) return { a: 0, b: 0 };
  return gameScores[gameScores.length - 1] || { a: 0, b: 0 };
}
function countGamesWon(gameScores) {
  let A = 0,
    B = 0;
  for (const g of gameScores || []) {
    if ((g?.a ?? 0) > (g?.b ?? 0)) A++;
    else if ((g?.b ?? 0) > (g?.a ?? 0)) B++;
  }
  return { A, B };
}

/* ---------- Streams ---------- */
function safeURL(url) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}
function providerLabel(kind, fallback = "Link") {
  switch (kind) {
    case "yt":
      return "YouTube";
    case "vimeo":
      return "Vimeo";
    case "twitch":
      return "Twitch";
    case "facebook":
      return "Facebook";
    case "hls":
      return "HLS";
    case "file":
      return "Video";
    case "iframe":
      return "Embed";
    default:
      return fallback;
  }
}
function isNonEmptyString(x) {
  return typeof x === "string" && x.trim().length > 0;
}
function detectEmbed(url) {
  const u = safeURL(url);
  if (!u) return { kind: "unknown", canEmbed: false, aspect: "16:9" };

  const host = u.hostname.toLowerCase();
  const path = u.pathname;
  let aspect = "16:9";

  // YouTube
  const ytId = (() => {
    if (host.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return v;
      const parts = path.split("/").filter(Boolean);
      if (parts.length >= 2 && ["live", "shorts", "embed"].includes(parts[0])) {
        if (parts[0] === "shorts") aspect = "9:16";
        return parts[1];
      }
    }
    if (host === "youtu.be") {
      return path.replace(/^\/+/, "").split("/")[0];
    }
    return null;
  })();
  if (ytId) {
    return {
      kind: "yt",
      canEmbed: true,
      embedUrl: `https://www.youtube.com/embed/${ytId}`,
      allow:
        "autoplay; encrypted-media; picture-in-picture; web-share; fullscreen",
      aspect,
    };
  }

  // Vimeo
  if (host.includes("vimeo.com")) {
    const m = path.match(/\/(\d+)/);
    if (m?.[1]) {
      return {
        kind: "vimeo",
        canEmbed: true,
        embedUrl: `https://player.vimeo.com/video/${m[1]}`,
        allow: "autoplay; fullscreen; picture-in-picture",
        aspect,
      };
    }
  }

  // Twitch
  if (host.includes("twitch.tv")) {
    const videoMatch = path.match(/\/videos\/(\d+)/);
    if (videoMatch?.[1]) {
      return {
        kind: "twitch",
        canEmbed: true,
        embedUrl: `https://player.twitch.tv/?video=${videoMatch[1]}&parent=localhost`,
        allow: "autoplay; encrypted-media; picture-in-picture; fullscreen",
        aspect,
      };
    }
    const channelMatch = path.split("/").filter(Boolean)[0];
    if (channelMatch) {
      return {
        kind: "twitch",
        canEmbed: true,
        embedUrl: `https://player.twitch.tv/?channel=${channelMatch}&parent=localhost`,
        allow: "autoplay; encrypted-media; picture-in-picture; fullscreen",
        aspect,
      };
    }
  }

  // Facebook
  if (host.includes("facebook.com") || host.includes("fb.watch")) {
    const href = encodeURIComponent(url);
    return {
      kind: "facebook",
      canEmbed: true,
      embedUrl: `https://www.facebook.com/plugins/video.php?href=${href}&show_text=false&width=1280`,
      allow: "autoplay; encrypted-media; picture-in-picture; fullscreen",
      aspect,
    };
  }

  // HLS
  if (/\.(m3u8)(\?|$)/i.test(u.pathname + u.search)) {
    return { kind: "hls", canEmbed: true, embedUrl: url, aspect };
  }

  // MP4/WebM/OGG
  if (/\.(mp4|webm|ogv?)(\?|$)/i.test(u.pathname)) {
    return { kind: "file", canEmbed: true, embedUrl: url, aspect };
  }

  // Google Drive preview
  if (host.includes("drive.google.com")) {
    const m = url.match(/\/file\/d\/([^/]+)\//);
    if (m?.[1]) {
      return {
        kind: "iframe",
        canEmbed: true,
        embedUrl: `https://drive.google.com/file/d/${m[1]}/preview`,
        allow: "autoplay; encrypted-media; picture-in-picture; fullscreen",
        aspect,
      };
    }
  }

  return {
    kind: "iframe",
    canEmbed: true,
    embedUrl: url,
    allow: "autoplay; fullscreen; picture-in-picture",
    aspect,
  };
}
function normalizeStreams(m) {
  const out = [];
  const seen = new Set();

  const pushUrl = (url, { label, primary = false } = {}) => {
    if (!isNonEmptyString(url)) return;
    const u = url.trim();
    if (seen.has(u)) return;
    const det = detectEmbed(u);
    out.push({
      label: label || (primary ? "Video" : providerLabel(det.kind, "Link")),
      url: u,
      primary,
      ...det,
    });
    seen.add(u);
  };

  if (isNonEmptyString(m?.video)) pushUrl(m.video, { primary: true });

  const singles = [
    ["Video", m?.videoUrl],
    ["Stream", m?.stream],
    ["Link", m?.link],
    ["URL", m?.url],
    ["Video", m?.meta?.video],
    ["Video", m?.meta?.videoUrl],
    ["Stream", m?.meta?.stream],
    ["Link", m?.links?.video],
    ["Stream", m?.links?.stream],
    ["URL", m?.links?.url],
    ["Video", m?.sources?.video],
    ["Stream", m?.sources?.stream],
    ["URL", m?.sources?.url],
  ];
  for (const [label, val] of singles)
    if (isNonEmptyString(val)) pushUrl(val, { label });

  const asStrArray = (arr) =>
    Array.isArray(arr) ? arr.filter(isNonEmptyString) : [];
  for (const url of asStrArray(m?.videos)) pushUrl(url, { label: "Video" });
  for (const url of asStrArray(m?.links)) pushUrl(url, { label: "Link" });
  for (const url of asStrArray(m?.sources)) pushUrl(url, { label: "Nguồn" });

  const pushList = (list) => {
    for (const it of Array.isArray(list) ? list : []) {
      const url = it?.url || it?.href || it?.src;
      const label = it?.label;
      pushUrl(url, { label });
    }
  };
  pushList(m?.streams);
  pushList(m?.meta?.streams);
  pushList(m?.links?.items);
  pushList(m?.sources?.items);

  return out;
}

/* ---------- AspectBox (RN) ---------- */
function AspectBox({ ratio = 16 / 9, children }) {
  return (
    <View style={[styles.aspectBox, { aspectRatio: ratio }]}>{children}</View>
  );
}

/* ---------- StreamPlayer (RN) ---------- */
function StreamPlayer({ stream }) {
  const [ratio, setRatio] = useState(
    stream?.aspect === "9:16" ? 9 / 16 : 16 / 9
  );

  useEffect(() => {
    setRatio(stream?.aspect === "9:16" ? 9 / 16 : 16 / 9);
  }, [stream?.aspect, stream?.embedUrl]);

  if (!stream || !stream.canEmbed) return null;

  switch (stream.kind) {
    case "yt":
    case "vimeo":
    case "twitch":
    case "facebook":
    case "iframe":
      return (
        <AspectBox ratio={ratio}>
          <WebView
            source={{ uri: stream.embedUrl }}
            style={{ flex: 1 }}
            allowsFullscreenVideo
            mediaPlaybackRequiresUserAction={false}
          />
        </AspectBox>
      );
    case "hls":
    case "file":
      return (
        <AspectBox ratio={ratio}>
          <Video
            style={{ width: "100%", height: "100%" }}
            source={{ uri: stream.embedUrl }}
            useNativeControls
            shouldPlay
            resizeMode="contain"
            onLoad={(meta) => {
              const w = meta?.naturalSize?.width;
              const h = meta?.naturalSize?.height;
              if (w && h) setRatio(w / h);
            }}
          />
        </AspectBox>
      );
    default:
      return null;
  }
}

/* ---------- Banner trạng thái ---------- */
function StatusBanner({ status, hasStreams }) {
  const text =
    status === "live"
      ? hasStreams
        ? "Trận đang live — bạn có thể mở liên kết hoặc xem trong nền."
        : "Trận đang live — chưa có link."
      : status === "finished"
      ? hasStreams
        ? "Trận đã diễn ra — bạn có thể mở liên kết hoặc xem lại trong nền."
        : "Trận đã diễn ra. Chưa có liên kết video."
      : hasStreams
      ? "Trận chưa diễn ra — đã có liên kết sẵn."
      : "Trận chưa diễn ra. Chưa có liên kết video.";

  return (
    <View
      style={[
        styles.banner,
        status === "live" ? styles.bannerLive : styles.bannerInfo,
      ]}
    >
      <Text style={styles.bannerText}>▶ {text}</Text>
    </View>
  );
}

/* ---------- Segmented Control: Status ---------- */
function SegmentedStatus({ value, onChange, disabled }) {
  const items = [
    { key: "scheduled", label: "Scheduled" },
    { key: "live", label: "Live" },
    { key: "finished", label: "Finished" },
  ];
  return (
    <View style={styles.segment}>
      {items.map((it) => {
        const active = value === it.key;
        return (
          <TouchableOpacity
            key={it.key}
            style={[
              styles.segmentItem,
              active && styles.segmentItemActive,
              disabled && { opacity: 0.6 },
            ]}
            onPress={() => !disabled && value !== it.key && onChange?.(it.key)}
            disabled={disabled}
          >
            <Text
              style={[styles.segmentLabel, active && styles.segmentLabelActive]}
            >
              {it.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/* ---------- Nút có icon trái ---------- */
function AdminBtn({ style, textStyle, icon, label, onPress, disabled }) {
  return (
    <TouchableOpacity
      style={[styles.btn, style]}
      onPress={onPress}
      disabled={disabled}
    >
      <View style={styles.btnContent}>
        {!!icon && (
          <MaterialIcons
            name={icon}
            size={18}
            style={[styles.btnIcon, textStyle]}
          />
        )}
        <Text style={[styles.btnText, textStyle]}>{label}</Text>
      </View>
    </TouchableOpacity>
  );
}

/* ---------- Thanh công cụ quản trị ---------- */
function AdminToolbar({
  status,
  editMode,
  busy,
  onEnterEdit,
  onSave,
  onReset,
  onAddSet,
  onExitEdit,
  onSetStatus,
  onSetWinner,
}) {
  const confirmWinner = (side) => {
    Alert.alert(
      "Xác nhận",
      `Kết thúc trận và đặt đội ${side} thắng?`,
      [
        { text: "Huỷ" },
        {
          text: "Xác nhận",
          style: "destructive",
          onPress: () => onSetWinner?.(side),
        },
      ],
      { cancelable: true }
    );
  };

  return (
    <View style={styles.adminCard}>
      <View style={styles.adminHeader}>
        <Text style={styles.adminTitle}>QUẢN TRỊ TRẬN</Text>
        <Text style={styles.adminSub}>
          Chỉnh sửa tỉ số • Đặt đội thắng • Đổi trạng thái
        </Text>
      </View>

      {/* Hàng 1: Segmented Status */}
      <View style={styles.adminRow}>
        <Text style={styles.rowLabel}>Trạng thái</Text>
        <SegmentedStatus
          value={status}
          onChange={(s) => onSetStatus?.(s)}
          disabled={busy}
        />
      </View>

      {/* Hàng 2: Nhóm chỉnh sửa tỉ số */}
      <View style={styles.adminRow}>
        <Text style={styles.rowLabel}>Tỉ số</Text>
        {!editMode ? (
          <AdminBtn
            icon="edit"
            label="Chỉnh sửa tỉ số"
            onPress={onEnterEdit}
            disabled={busy}
            style={styles.btnOutline}
          />
        ) : (
          <View style={styles.rowWrap}>
            <AdminBtn
              icon="save"
              label="Lưu tỉ số"
              onPress={onSave}
              disabled={busy}
              style={styles.btnPrimary}
              textStyle={styles.btnPrimaryText}
            />
            <AdminBtn
              icon="undo"
              label="Hoàn tác"
              onPress={onReset}
              disabled={busy}
              style={styles.btnOutline}
            />
            <AdminBtn
              icon="add"
              label="Thêm set"
              onPress={onAddSet}
              disabled={busy}
              style={styles.btnOutline}
            />
            <AdminBtn
              icon="close"
              label="Thoát sửa"
              onPress={onExitEdit}
              disabled={busy}
              style={styles.btnGhost}
            />
          </View>
        )}
      </View>

      {/* Hàng 3: Đặt đội thắng nhanh */}
      <View style={styles.adminRow}>
        <Text style={styles.rowLabel}>Kết quả</Text>
        <View style={styles.rowWrap}>
          <AdminBtn
            icon="emoji-events"
            label="Đặt A thắng"
            onPress={() => confirmWinner("A")}
            disabled={busy}
            style={styles.btnSuccessOutline}
            textStyle={styles.btnSuccessText}
          />
          <AdminBtn
            icon="emoji-events"
            label="Đặt B thắng"
            onPress={() => confirmWinner("B")}
            disabled={busy}
            style={styles.btnSuccessOutline}
            textStyle={styles.btnSuccessText}
          />
        </View>
      </View>
    </View>
  );
}

function _getIdLike(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x._id || x.id || x.userId || x.uid || x.email || null;
}

function _collectPossibleRefereeIds(m) {
  const ids = new Set();
  const push = (v) => {
    const id = _getIdLike(v);
    if (id) ids.add(String(id));
  };
  // Một số field có thể tồn tại tuỳ backend:
  // liveBy: { _id?, id?, user? }
  if (m?.liveBy) {
    push(m.liveBy);
    if (m.liveBy.user) push(m.liveBy.user);
    if (m.liveBy._id || m.liveBy.id) push(m.liveBy._id || m.liveBy.id);
  }
  // referee / assignedReferee
  push(m?.referee);
  push(m?.assignedReferee);
  // referees (array)
  if (Array.isArray(m?.referees))
    for (const it of m.referees) {
      push(it);
      if (it?.user) push(it.user);
    }
  // meta.{referee,referees}
  push(m?.meta?.referee);
  if (Array.isArray(m?.meta?.referees))
    for (const it of m.meta.referees) {
      push(it);
      if (it?.user) push(it.user);
    }
  // permissions.refereeId?
  push(m?.permissions?.refereeId);
  return ids;
}

function amRefereeOfThisMatch(me, m) {
  const my = _getIdLike(me) || _getIdLike(me?.user);
  if (!my) return false;
  const ids = _collectPossibleRefereeIds(m);
  return ids.has(String(my));
}

/* ===================== Component chính (Native) ===================== */
function MatchContent({ m, isLoading, liveLoading, onSaved }) {
  const { userInfo } = useSelector((s) => s.auth || {});
  const roleStr = String(userInfo?.role || "").toLowerCase();
  const roles = new Set(
    [...(userInfo?.roles || []), ...(userInfo?.permissions || [])]
      .filter(Boolean)
      .map((x) => String(x).toLowerCase())
  );

  const tour =
    m?.tournament && typeof m.tournament === "object" ? m.tournament : null;

  const ownerId =
    (tour?.owner &&
      (tour.owner._id || tour.owner.id || tour.owner.userId || tour.owner)) ||
    (tour?.createdBy &&
      (tour.createdBy._id ||
        tour.createdBy.id ||
        tour.createdBy.userId ||
        tour.createdBy)) ||
    (tour?.organizer &&
      (tour.organizer._id ||
        tour.organizer.id ||
        tour.organizer.userId ||
        tour.organizer)) ||
    null;

  const { data: verifyRes, isFetching: verifyingMgr } = useVerifyManagerQuery(
    tour?._id ? tour?._id : skipToken
  );
  const isManager = !!verifyRes?.isManager;
  const isAdmin = !!(
    userInfo?.isAdmin ||
    roleStr === "admin" ||
    roles.has("admin") ||
    roles.has("superadmin") ||
    roles.has("tournament:admin")
  );

  const canManage = isAdmin || isManager;

  const canSeeOverlay = canManage;

  // Popup hồ sơ
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileUserId, setProfileUserId] = useState(null);
  const openProfile = (uid) => {
    if (!uid) return;
    const norm = uid?._id || uid?.id || uid?.userId || uid?.uid || uid || null;
    if (norm) {
      setProfileUserId(String(norm));
      setProfileOpen(true);
    }
  };
  const closeProfile = () => setProfileOpen(false);

  // LOCK theo match id (thay cho useShowAfterFetch/useThrottledStable)
  const loading = Boolean(isLoading || liveLoading);
  const {
    lockedId,
    view: mm,
    setView,
    waiting,
  } = useLockedMatch(m, {
    loading,
  });
  const showSpinnerDelayed = useDelayedFlag(waiting, 250);

  // ===== Local patch (scores/status/teams) =====
  const [localPatch, setLocalPatch] = useState(null);
  useEffect(() => {
    setLocalPatch(null); // đổi trận -> bỏ patch
  }, [lockedId]);

  const merged = useMemo(
    () => (localPatch ? { ...(mm || {}), ...localPatch } : mm || null),
    [mm, localPatch]
  );

  // xác định có phải trọng tài được gán cho trận này không
  const myIdForCheck =
    userInfo?._id ||
    userInfo?.id ||
    userInfo?.userId ||
    userInfo?.uid ||
    userInfo?.email;
  const isMyRef = useMemo(
    () => amRefereeOfThisMatch({ _id: myIdForCheck }, merged || {}),
    [
      myIdForCheck,
      merged?._id,
      merged?.liveBy,
      merged?.referee,
      merged?.referees,
    ]
  );

  function collectIds(x) {
    if (!x) return [];
    if (Array.isArray(x))
      return x
        .map((u) => u?._id || u?.id || u?.userId || u)
        .filter(Boolean)
        .map(String);
    return [x?._id || x?.id || x?.userId || x].filter(Boolean).map(String);
  }
  function isUserRefereeOfMatch(userInfo, m) {
    const uid = String(
      userInfo?._id ||
        userInfo?.id ||
        userInfo?.userId ||
        userInfo?.uid ||
        userInfo?.email ||
        ""
    );
    if (!uid || !m) return false;
    const pool = new Set([
      ...collectIds(m.referee),
      ...collectIds(m.referees),
      ...collectIds(m.judges),
      ...collectIds(m.liveBy),
      ...collectIds(m.meta?.referees),
      ...collectIds(m.meta?.referee),
    ]);
    return pool.has(uid);
  }

  const isRefereeHere = isUserRefereeOfMatch(userInfo, merged);

  const status = merged?.status || "scheduled";
  const shownGameScores = merged?.gameScores ?? [];

  // Streams
  const streams = useMemo(() => normalizeStreams(merged || {}), [merged]);
  const pickInitialIndex = (arr) => {
    if (!arr.length) return -1;
    const primary = arr.findIndex((s) => s.primary);
    if (primary >= 0) return primary;
    const emb = arr.findIndex((s) => s.canEmbed);
    if (emb >= 0) return emb;
    return 0;
  };
  const [activeIdx, setActiveIdx] = useState(pickInitialIndex(streams));
  const [showPlayer, setShowPlayer] = useState(false);
  useEffect(() => {
    setActiveIdx(pickInitialIndex(streams));
    setShowPlayer(false);
  }, [lockedId]); // chỉ khi đổi trận

  const activeStream =
    activeIdx >= 0 && activeIdx < streams.length ? streams[activeIdx] : null;

  // Overlay & time
  const displayTime = toDateSafe(pickDisplayTime(merged));
  const timeLabel =
    displayTime && status !== "finished"
      ? `Giờ đấu: ${formatClock(displayTime)}`
      : displayTime && status === "finished"
      ? `Bắt đầu: ${formatClock(displayTime)}`
      : null;

  const overlayUrl = `https://pickletour.vn/overlay/score?matchId=${lockedId}&theme=dark&size=md&showSets=1&autoNext=1`;

  // Ưu tiên: nếu backend đã có overlayUrl thì vẫn hiển thị (Custom);
  // còn link chính “giống web” là builtinOverlayUrl.

  // Admin edit states
  const [editMode, setEditMode] = useState(false);
  const enterEdit = () => setEditMode(true);
  const exitEdit = () => setEditMode(false);
  const [busy, setBusy] = useState(false);
  const [editScores, setEditScores] = useState([...(shownGameScores || [])]);

  useEffect(() => {
    setEditScores([...(merged?.gameScores ?? [])]);
  }, [lockedId, merged?.gameScores]);

  const sanitizeInt = (v) => {
    const n = parseInt(String(v ?? "").replace(/[^\d]/g, ""), 10);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(n, 99);
  };
  const setCell = (idx, side, val) => {
    setEditScores((old) => {
      const arr = [...(Array.isArray(old) ? old : [])];
      while (arr.length <= idx) arr.push({ a: 0, b: 0 });
      const row = { ...(arr[idx] || { a: 0, b: 0 }) };
      row[side] = sanitizeInt(val);
      arr[idx] = row;
      return arr;
    });
  };
  const addSet = () => setEditScores((old) => [...(old || []), { a: 0, b: 0 }]);
  const removeSet = (idx) =>
    setEditScores((old) => (old || []).filter((_, i) => i !== idx));
  const resetEdits = () => setEditScores([...(merged?.gameScores ?? [])]);

  // RTK mutation
  const [adminPatchMatch] = useAdminPatchMatchMutation();

  const doPatch = async (body, { successMsg = "Đã cập nhật." } = {}) => {
    if (!lockedId) return;
    setBusy(true);
    try {
      await adminPatchMatch({ id: lockedId, body }).unwrap();
      Toast.show({ type: "success", text1: successMsg });
      onSaved?.(); // parent có refetch list cũng không làm dialog “nhảy” vì đã LOCK
    } catch (e) {
      const msg = e?.data?.message || e?.message || "Không cập nhật được";
      Toast.show({ type: "error", text1: "Lỗi", text2: msg });
      throw e;
    } finally {
      setBusy(false);
    }
  };

  const handleSaveScores = async () => {
    if (!canManage || !lockedId) return;
    try {
      await doPatch(
        {
          gameScores: editScores,
          ...(status !== "finished" ? { winner: "" } : {}),
        },
        { successMsg: "Đã lưu tỉ số." }
      );
      setLocalPatch((p) => ({ ...(p || {}), gameScores: editScores }));
      exitEdit();
    } catch {}
  };

  const handleSetWinner = async (side /* 'A' | 'B' */) => {
    if (!canManage || !lockedId) return;
    try {
      await doPatch(
        { winner: side, status: "finished" },
        { successMsg: `Đã đặt đội ${side} thắng.` }
      );
      setLocalPatch((p) => ({ ...(p || {}), status: "finished" }));
    } catch {}
  };

  const handleSetStatus = async (newStatus) => {
    if (!canManage || !lockedId) return;
    try {
      const body =
        newStatus === "finished"
          ? { status: newStatus }
          : { status: newStatus, winner: "" };
      await doPatch(body, { successMsg: `Đã đổi trạng thái: ${newStatus}` });
      setLocalPatch((p) => ({ ...(p || {}), status: newStatus }));
    } catch {}
  };

  const { A: setsA, B: setsB } = countGamesWon(shownGameScores);

  // Render states
  const showSpinner = waiting && showSpinnerDelayed;
  const showError = !waiting && !mm;

  if (showSpinner) {
    return (
      <View style={styles.centerBox}>
        <ActivityIndicator />
      </View>
    );
  }
  if (showError) {
    return (
      <View style={[styles.card, { padding: 12 }]}>
        <Text style={styles.errorText}>Không tải được dữ liệu trận.</Text>
      </View>
    );
  }
  if (!merged) return <View style={{ paddingVertical: 8 }} />;

  const isSingle =
    String(merged?.tournament?.eventType || "").toLowerCase() === "single";

  // Nhãn đội để truyền cho panel trọng tài
  const teamAName = merged?.pairA
    ? [merged?.pairA?.player1, !isSingle && merged?.pairA?.player2]
        .filter(Boolean)
        .map((p) => nameWithNick(p))
        .join(" & ")
    : merged?.previousA
    ? smartDepLabel(merged, merged.previousA)
    : seedLabel(merged?.seedA);

  const teamBName = merged?.pairB
    ? [merged?.pairB?.player1, !isSingle && merged?.pairB?.player2]
        .filter(Boolean)
        .map((p) => nameWithNick(p))
        .join(" & ")
    : merged?.previousB
    ? smartDepLabel(merged, merged.previousB)
    : seedLabel(merged?.seedB);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Banner trạng thái */}
      <StatusBanner status={status} hasStreams={streams.length > 0} />

      {/* Khu video */}
      {activeStream && (
        <View style={{ gap: 8 }}>
          <View style={styles.rowWrap}>
            {activeStream.canEmbed && (
              <TouchableOpacity
                style={[
                  styles.btn,
                  showPlayer ? styles.btnPrimary : styles.btnOutline,
                  styles.btnFluid,
                ]}
                onPress={() => setShowPlayer((v) => !v)}
                disabled={busy}
              >
                <Text
                  style={showPlayer ? styles.btnPrimaryText : styles.btnText}
                >
                  ▶ {showPlayer ? "Thu gọn video" : "Xem video trong nền"}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.btn, styles.btnOutline, styles.btnFluid]}
              onPress={() => Linking.openURL(activeStream.url)}
              disabled={busy}
            >
              <Text style={styles.btnText}>Mở link trực tiếp ↗</Text>
            </TouchableOpacity>
          </View>

          {showPlayer && activeStream.canEmbed && (
            <StreamPlayer stream={activeStream} />
          )}
        </View>
      )}

      {/* Overlay */}
      {overlayUrl && canSeeOverlay && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Overlay tỉ số trực tiếp</Text>
          <View style={styles.rowWrap}>
            <View style={[styles.overlayBox, { flexGrow: 1, minWidth: 220 }]}>
              <Text style={styles.monoText}>{overlayUrl}</Text>
            </View>
            <TouchableOpacity
              style={[styles.btn, styles.btnOutline, styles.btnFluid]}
              onPress={async () => {
                try {
                  await Clipboard.setStringAsync(overlayUrl);
                  Toast.show({
                    type: "success",
                    text1: "Đã copy link overlay",
                  });
                } catch {
                  Toast.show({ type: "error", text1: "Copy thất bại" });
                }
              }}
            >
              <Text style={styles.btnText}>Copy link</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, styles.btnFluid]}
              onPress={() => Linking.openURL(overlayUrl)}
            >
              <Text style={styles.btnPrimaryText}>Mở overlay</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.caption}>
            Mẹo: dán link này vào OBS/StreamYard (Browser Source) để hiển thị tỉ
            số.
          </Text>
        </View>
      )}

      {/* Điểm số */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Điểm số</Text>

        <View style={[styles.row, { alignItems: "flex-start" }]}>
          {/* Đội A */}
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={styles.muted}>Đội A</Text>
            {merged?.pairA ? (
              <View style={styles.teamWrap}>
                <PlayerLink
                  person={merged.pairA?.player1}
                  onOpen={openProfile}
                />
                {!isSingle && merged.pairA?.player2 && (
                  <>
                    <Text style={styles.andText}> & </Text>
                    <PlayerLink
                      person={merged.pairA.player2}
                      onOpen={openProfile}
                    />
                  </>
                )}
              </View>
            ) : (
              <Text style={styles.teamText}>
                {merged?.previousA
                  ? smartDepLabel(merged, merged.previousA)
                  : seedLabel(merged?.seedA)}
              </Text>
            )}
          </View>

          {/* Điểm hiện tại */}
          <View style={{ minWidth: 140, alignItems: "center" }}>
            {status === "live" && (
              <Text style={styles.mutedSmall}>Ván hiện tại</Text>
            )}
            <Text style={styles.bigScore}>
              {lastGameScore(shownGameScores).a ?? 0} –{" "}
              {lastGameScore(shownGameScores).b ?? 0}
            </Text>
            <Text style={styles.muted}>
              Sets: {countGamesWon(shownGameScores).A} –{" "}
              {countGamesWon(shownGameScores).B}
            </Text>
          </View>

          {/* Đội B */}
          <View style={{ flex: 1, paddingLeft: 8 }}>
            <Text style={[styles.muted, { textAlign: "right" }]}>Đội B</Text>
            {merged?.pairB ? (
              <View style={styles.teamWrapRight}>
                <PlayerLink
                  person={merged.pairB?.player1}
                  onOpen={openProfile}
                  align="right"
                />
                {!isSingle && merged.pairB?.player2 && (
                  <>
                    <Text style={[styles.andText, { textAlign: "right" }]}>
                      {"  &  "}
                    </Text>
                    <PlayerLink
                      person={merged.pairB.player2}
                      onOpen={openProfile}
                      align="right"
                    />
                  </>
                )}
              </View>
            ) : (
              <Text style={[styles.teamText, { textAlign: "right" }]}>
                {merged?.previousB
                  ? smartDepLabel(merged, merged.previousB)
                  : seedLabel(merged?.seedB)}
              </Text>
            )}
          </View>
        </View>

        {/* Bảng set điểm */}
        {!!(editMode ? editScores?.length : shownGameScores?.length) && (
          <View style={{ marginTop: 12 }}>
            <View style={[styles.tableRow, styles.tableHeader]}>
              <Text style={[styles.tableCell, { flex: 1 }]}>Set</Text>
              <Text style={[styles.tableCell, styles.centerCell]}>A</Text>
              <Text style={[styles.tableCell, styles.centerCell]}>B</Text>
              {canManage && editMode && (
                <Text style={[styles.tableCell, styles.centerCell]} />
              )}
            </View>
            {(editMode ? editScores : shownGameScores).map((g, idx) => (
              <View key={idx} style={styles.tableRow}>
                <Text style={[styles.tableCell, { flex: 1 }]}>{idx + 1}</Text>
                <View style={[styles.tableCell, styles.centerCell]}>
                  {canManage && editMode ? (
                    <TextInput
                      style={styles.inputScore}
                      keyboardType="number-pad"
                      value={String(g?.a ?? 0)}
                      onChangeText={(t) => setCell(idx, "a", t)}
                      maxLength={2}
                    />
                  ) : (
                    <Text>{g?.a ?? 0}</Text>
                  )}
                </View>
                <View style={[styles.tableCell, styles.centerCell]}>
                  {canManage && editMode ? (
                    <TextInput
                      style={styles.inputScore}
                      keyboardType="number-pad"
                      value={String(g?.b ?? 0)}
                      onChangeText={(t) => setCell(idx, "b", t)}
                      maxLength={2}
                    />
                  ) : (
                    <Text>{g?.b ?? 0}</Text>
                  )}
                </View>
                {canManage && editMode && (
                  <View style={[styles.tableCell, styles.centerCell]}>
                    <TouchableOpacity
                      style={[styles.btnXS, styles.btnDangerOutline]}
                      onPress={() => removeSet(idx)}
                      disabled={busy}
                    >
                      <Text style={styles.btnDangerText}>Xoá</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Chips rule + trạng thái */}
        <View style={styles.chipsWrap}>
          {timeLabel && <Chip label={timeLabel} />}
          <Chip label={`BO: ${merged?.rules?.bestOf ?? 3}`} />
          <Chip label={`Điểm thắng: ${merged?.rules?.pointsToWin ?? 11}`} />
          {merged?.rules?.winByTwo && <Chip label="Phải chênh 2" />}
          {merged?.liveBy?.name && (
            <Chip label={`Trọng tài: ${merged.liveBy.name}`} />
          )}
          <Chip label={`Trạng thái: ${formatStatus(status)}`} />
        </View>

        {/* Panel chấm điểm dành cho TRỌNG TÀI được gán */}
        {isRefereeHere && merged?._id && (
          <View style={{ marginTop: 12 }}>
            <Text style={[styles.rowLabel, { marginBottom: 6 }]}>
              Bàn chấm (trọng tài)
            </Text>
            <RefereeJudgePanel matchId={String(merged._id)} />
          </View>
        )}

        {/* Admin toolbar */}
        {canManage && (
          <AdminToolbar
            status={status}
            editMode={editMode}
            busy={busy}
            onEnterEdit={enterEdit}
            onSave={handleSaveScores}
            onReset={resetEdits}
            onAddSet={addSet}
            onExitEdit={exitEdit}
            onSetStatus={handleSetStatus}
            onSetWinner={handleSetWinner}
          />
        )}
      </View>

      {/* Popup hồ sơ VĐV */}
      <PublicProfileDialog
        open={profileOpen}
        onClose={closeProfile}
        userId={profileUserId}
      />
    </ScrollView>
  );
}

/* ---------- Chip nhỏ ---------- */
function Chip({ label }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}

function makePropSignature(m) {
  if (!m) return "";
  const r = m.rules || {};
  const gs = Array.isArray(m.gameScores) ? m.gameScores : [];
  const last = gs.length ? gs[gs.length - 1] : { a: 0, b: 0 };
  return [
    m._id,
    m.status,
    r.bestOf ?? 3,
    r.pointsToWin ?? 11,
    r.winByTwo ? 1 : 0,
    gs.length,
    last?.a ?? 0,
    last?.b ?? 0,
  ].join("|");
}

export default React.memo(MatchContent, (prev, next) => {
  if (prev.isLoading !== next.isLoading) return false;
  if (prev.liveLoading !== next.liveLoading) return false;
  return makePropSignature(prev.m) === makePropSignature(next.m);
});

/* ---------- Styles ---------- */
const styles = StyleSheet.create({
  container: {
    // padding: 12,
    gap: 12,
  },
  centerBox: {
    paddingVertical: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  linkText: {
    color: "#1976d2",
    fontWeight: "600",
    flexShrink: 0,
  },
  andText: {
    fontWeight: "700",
    color: "#0f172a",
  },
  teamWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  teamWrapRight: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    justifyContent: "flex-end",
  },
  banner: {
    padding: 12,
    borderRadius: 8,
  },
  bannerLive: { backgroundColor: "#e3f2fd" },
  bannerInfo: { backgroundColor: "#f1f5f9" },
  bannerText: { color: "#0f172a" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 12,
    gap: 8,
  },
  cardTitle: { fontWeight: "700", fontSize: 16, marginBottom: 4 },
  monoText: {
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
  },
  overlayBox: {
    minHeight: 40,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingHorizontal: 10,
    justifyContent: "center",
    backgroundColor: "#f9fafb",
  },
  caption: { color: "#64748b", fontSize: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  btn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  btnFluid: {
    minWidth: 140,
  },
  btnOutline: { backgroundColor: "#fff", borderColor: "#cbd5e1" },
  btnGhost: { backgroundColor: "#fff", borderColor: "transparent" },
  btnText: { color: "#0f172a", textAlign: "center" },
  btnPrimary: { backgroundColor: "#1976d2", borderColor: "#1976d2" },
  btnPrimaryText: { color: "#fff", fontWeight: "700", textAlign: "center" },
  btnXS: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  btnDangerOutline: {
    backgroundColor: "#fff",
    borderColor: "#fecaca",
  },
  btnDangerText: {
    color: "#b91c1c",
    fontSize: 12,
    fontWeight: "700",
  },
  muted: { color: "#64748b" },
  mutedSmall: { color: "#64748b", fontSize: 12 },
  teamText: { fontSize: 16, fontWeight: "700" },
  bigScore: { fontSize: 28, fontWeight: "800" },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    alignItems: "center",
  },
  tableHeader: {
    backgroundColor: "#f8fafc",
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  tableCell: { flex: 1, fontSize: 14 },
  centerCell: { alignItems: "center" },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#eef2ff",
    borderWidth: 1,
    borderColor: "#c7d2fe",
  },
  chipText: { fontSize: 12, color: "#3730a3" },
  aspectBox: {
    width: "100%",
    backgroundColor: "#000",
    borderRadius: 10,
    overflow: "hidden",
  },
  errorText: { color: "#b91c1c", fontWeight: "600" },
  inputScore: {
    width: 56,
    height: 36,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    textAlign: "center",
    paddingHorizontal: 8,
    paddingVertical: 6,
  },

  /* ===== Admin toolbar ===== */
  adminCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 12,
    gap: 12,
    marginTop: 12,
  },
  adminHeader: {
    gap: 2,
  },
  adminTitle: {
    fontSize: 12,
    letterSpacing: 1,
    fontWeight: "800",
    color: "#0f172a",
  },
  adminSub: {
    fontSize: 12,
    color: "#64748b",
  },
  adminRow: {
    gap: 8,
  },
  rowLabel: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: "600",
  },

  /* segmented */
  segment: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderRadius: 999,
    padding: 4,
    gap: 4,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    alignItems: "center",
  },
  segmentItemActive: {
    backgroundColor: "#1976d2",
  },
  segmentLabel: {
    fontSize: 13,
    color: "#0f172a",
    fontWeight: "600",
  },
  segmentLabelActive: {
    color: "#fff",
    fontWeight: "800",
  },

  /* buttons (kế thừa cái cũ) */
  btnContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  btnIcon: {
    color: "#0f172a",
  },
  btnSuccessOutline: {
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
  },
  btnSuccessText: {
    color: "#065f46",
    fontWeight: "700",
  },
});
