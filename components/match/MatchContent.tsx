// app/screens/PickleBall/match/MatchContent.native.jsx
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  forwardRef,
  memo,
} from "react";
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
  useColorScheme,
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
import {
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetBackdrop,
} from "@gorhom/bottom-sheet";
import { useCreateFacebookLiveForMatchMutation } from "@/slices/adminMatchLiveApiSlice";
import { useRouter } from "expo-router";
import { useSocket } from "@/context/SocketContext";

/* =====================================
 * THEME TOKENS (giống phong cách Hero)
 * ===================================== */
function useThemeTokens() {
  const scheme = useColorScheme() ?? "light";

  return useMemo(() => {
    const tint = scheme === "dark" ? "#7cc0ff" : "#0a84ff";
    const textPrimary = scheme === "dark" ? "#ffffff" : "#0f172a";
    const textSecondary = scheme === "dark" ? "#d1d1d1" : "#334155";

    const pageBg = scheme === "dark" ? "#0b0c0f" : "#f6f7fb";

    const cardBg = scheme === "dark" ? "#111214" : "#ffffff";
    const cardBorder = scheme === "dark" ? "#3a3b40" : "#e5e7eb";

    const softBg = scheme === "dark" ? "#1e1f23" : "#eef1f6";
    const softBg2 = scheme === "dark" ? "#17181c" : "#f8fafc";
    const softBorder = scheme === "dark" ? "#3a3b40" : "#cbd5e1";

    const banner = {
      live: {
        bg: scheme === "dark" ? "rgba(124,192,255,0.18)" : "#e3f2fd",
        text: scheme === "dark" ? "#d7ebff" : "#0f172a",
      },
      info: {
        bg: scheme === "dark" ? "rgba(148,163,184,0.18)" : "#f1f5f9",
        text: scheme === "dark" ? "#e2e8f0" : "#0f172a",
      },
    };

    const chip = {
      bg: scheme === "dark" ? "rgba(199,210,254,0.16)" : "#eef2ff",
      bd: scheme === "dark" ? "#6366f1" : "#c7d2fe",
      text: scheme === "dark" ? "#e0e7ff" : "#3730a3",
    };

    const success = {
      bgSoft: scheme === "dark" ? "rgba(16,185,129,0.18)" : "#ecfdf5",
      bdSoft: scheme === "dark" ? "#34d399" : "#a7f3d0",
      text: scheme === "dark" ? "#a7f3d0" : "#065f46",
    };

    const danger = {
      bgSoft: scheme === "dark" ? "rgba(248,113,113,0.16)" : "#fff1f2",
      bdSoft: scheme === "dark" ? "#f87171" : "#fecaca",
      text: scheme === "dark" ? "#fecaca" : "#b91c1c",
    };

    return {
      scheme,
      tint,
      textPrimary,
      textSecondary,
      pageBg,
      cardBg,
      cardBorder,
      softBg,
      softBg2,
      softBorder,
      banner,
      chip,
      success,
      danger,
    };
  }, [scheme]);
}

/* =============== OVERLAY helpers =============== */

const sid = (x) => {
  if (!x) return "";
  const v = x?._id ?? x?.id ?? x;
  return v ? String(v) : "";
};
const getMatchIdFromPayload = (payload = {}) =>
  sid(payload.matchId) ||
  sid(payload.match) ||
  sid(payload.id) ||
  sid(payload._id) ||
  sid(payload?.data?.matchId) ||
  sid(payload?.data?.match) ||
  sid(payload?.snapshot?._id) ||
  "";
const isSameId = (a, b) => a && b && String(a) === String(b);

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
    const cand = [m?.v, m?.V, m?.roundV, m?.meta?.v];
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
      }
    }
  }
  return { v, t };
};

// ---- NEW: depLabel theo chuẩn web: W/L-V{round}-T{order+1} ----
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
function smartDepLabel(m, prevDep) {
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
const PlayerLink = memo(
  ({ person, onOpen, align = "left", serving = false }) => {
    const T = useThemeTokens();
    if (!person) return null;
    const uid =
      person?.user?._id ||
      person?.user?.id ||
      person?.user ||
      person?._id ||
      person?.id ||
      null;

    const handlePress = useCallback(() => {
      if (uid && onOpen) onOpen(uid);
    }, [uid, onOpen]);

    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          justifyContent: align === "right" ? "flex-end" : "flex-start",
        }}
      >
        <Text
          onPress={handlePress}
          style={[
            styles.linkText,
            { color: T.tint },
            align === "right" && { textAlign: "right" },
          ]}
        >
          {nameWithNick(person)}
        </Text>
        {serving && (
          <MaterialIcons name="sports-tennis" size={14} color={T.tint} />
        )}
      </View>
    );
  }
);

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
function useLockedMatch(m, { loading }) {
  const [lockedId, setLockedId] = useState(() => (m?._id ? String(m._id) : ""));
  const [view, setView] = useState(() => (m?._id ? m : null));

  useEffect(() => {
    if (!lockedId && m?._id) {
      setLockedId(String(m._id));
      setView(m);
    }
  }, [m?._id, lockedId, m]);

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
  if (/(\.m3u8)(\?|$)/i.test(u.pathname + u.search)) {
    return { kind: "hls", canEmbed: true, embedUrl: url, aspect };
  }

  // MP4/WebM/OGG
  if (/(\.mp4|webm|ogv?)(\?|$)/i.test(u.pathname)) {
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
const AspectBox = memo(({ ratio = 16 / 9, children }) => {
  const T = useThemeTokens();
  return (
    <View
      style={[
        styles.aspectBox,
        { aspectRatio: ratio, backgroundColor: T.cardBg },
      ]}
    >
      {children}
    </View>
  );
});

/* ---------- StreamPlayer (RN) ---------- */
const StreamPlayer = memo(({ stream }) => {
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
});

/* ---------- Banner trạng thái ---------- */
const StatusBanner = memo(({ status, hasStreams }) => {
  const T = useThemeTokens();
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

  const sty = status === "live" ? T.banner.live : T.banner.info;

  return (
    <View style={[styles.banner, { backgroundColor: sty.bg }]}>
      <Text style={[styles.bannerText, { color: sty.text }]}>▶ {text}</Text>
    </View>
  );
});

/* ---------- Segmented Control: Status ---------- */
const SegmentedStatus = memo(({ value, onChange, disabled }) => {
  const T = useThemeTokens();
  const items = useMemo(
    () => [
      { key: "scheduled", label: "Scheduled" },
      { key: "live", label: "Live" },
      { key: "finished", label: "Finished" },
    ],
    []
  );

  return (
    <View
      style={[
        styles.segment,
        { backgroundColor: T.softBg, borderColor: T.softBorder },
      ]}
    >
      {items.map((it) => {
        const active = value === it.key;
        return (
          <TouchableOpacity
            key={it.key}
            style={[
              styles.segmentItem,
              active && { backgroundColor: T.tint },
              disabled && { opacity: 0.6 },
            ]}
            onPress={() => !disabled && value !== it.key && onChange?.(it.key)}
            disabled={disabled}
          >
            <Text
              style={[
                styles.segmentLabel,
                { color: T.textPrimary },
                active && styles.segmentLabelActive,
              ]}
            >
              {it.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
});

/* ---------- Nút có icon trái ---------- */
const AdminBtn = memo(
  ({ style, textStyle, icon, label, onPress, disabled }) => {
    const T = useThemeTokens();
    return (
      <TouchableOpacity
        style={[
          styles.btn,
          { backgroundColor: T.cardBg, borderColor: T.softBorder },
          style,
        ]}
        onPress={onPress}
        disabled={disabled}
      >
        <View style={styles.btnContent}>
          {!!icon && (
            <MaterialIcons
              name={icon}
              size={18}
              style={[styles.btnIcon, { color: T.textPrimary }, textStyle]}
            />
          )}
          <Text style={[styles.btnText, { color: T.textPrimary }, textStyle]}>
            {label}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }
);

/* ============== LIVE UTILS (destinations + studio url) ============== */
const encodeB64Json = (obj) => {
  try {
    return Buffer.from(JSON.stringify(obj), "utf8").toString("base64");
  } catch {
    return "";
  }
};

const splitRtmpUrl = (url) => {
  if (!url || !/^rtmps?:\/\//i.test(url))
    return { server_url: "", stream_key: "" };
  try {
    const idx = url.lastIndexOf("/");
    if (idx === -1) return { server_url: url, stream_key: "" };
    return { server_url: url.slice(0, idx), stream_key: url.slice(idx + 1) };
  } catch {
    return { server_url: "", stream_key: "" };
  }
};
const normDest = (platform, raw = {}) => {
  const p = (platform || raw.platform || "").toLowerCase();
  let server_url = raw.server_url || "";
  let stream_key = raw.stream_key || "";
  const secure_stream_url = raw.secure_stream_url || "";

  if ((!server_url || !stream_key) && secure_stream_url) {
    const s = splitRtmpUrl(secure_stream_url);
    server_url = server_url || s.server_url;
    stream_key = stream_key || s.stream_key;
  }

  return {
    platform: p,
    id: raw.id,
    server_url,
    stream_key,
    secure_stream_url,
    permalink_url: raw.permalink_url,
    watch_url: raw.watch_url,
    room_url: raw.room_url,
    extras: raw.extras,
  };
};
const extractDestinations = (data, match) => {
  const out = [];
  if (Array.isArray(data?.destinations) && data.destinations.length) {
    data.destinations.forEach((d) => out.push(normDest(d.platform, d)));
  }
  if (
    (data?.server_url || data?.secure_stream_url || data?.stream_key) &&
    !out.length
  ) {
    out.push(normDest("facebook", data));
  }
  const fb = match?.facebookLive || {};
  const yt = match?.youtubeLive || {};
  const tt = match?.tiktokLive || {};
  const hasAnyFb =
    fb.server_url || fb.stream_key || fb.permalink_url || fb.secure_stream_url;
  const hasAnyYt = yt.server_url || yt.stream_key || yt.watch_url;
  const hasAnyTt =
    tt.server_url || tt.stream_key || tt.room_url || tt.secure_stream_url;
  if (!out.length && (hasAnyFb || hasAnyYt || hasAnyTt)) {
    if (hasAnyFb) out.push(normDest("facebook", fb));
    if (hasAnyYt) out.push(normDest("youtube", yt));
    if (hasAnyTt) out.push(normDest("tiktok", tt));
  }
  const seen = new Set();
  return out.filter((d) => {
    const k = [d.platform, d.id, d.server_url, d.stream_key].join("|");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

const buildStudioParams = (baseOrigin, data, match, overlayUrl) => {
  const params = {};
  if (match?._id) params.matchId = String(match._id);
  params.baseOrigin = baseOrigin || "https://pickletour.vn";
  if (overlayUrl) params.overlayUrl = String(overlayUrl);

  const dests = extractDestinations(data, match);

  const minimal = dests.map((d) => ({
    platform: d.platform,
    server_url: d.server_url || d.secure_stream_url || "",
    stream_key: d.stream_key || "",
    secure_stream_url: d.secure_stream_url || "",
  }));
  const d64 = encodeB64Json(minimal);
  if (d64) params.d64 = d64;

  const fb = dests.find((d) => d.platform === "facebook");
  if (fb) {
    let k = fb.stream_key;
    if (!k && fb.secure_stream_url)
      k = splitRtmpUrl(fb.secure_stream_url).stream_key;
    if (k) params.key = String(k);
    const facebook = {
      server_url: fb.server_url || "",
      stream_key: fb.stream_key || "",
      secure_stream_url: fb.secure_stream_url || "",
      permalink_url: fb.permalink_url || "",
      pageId: fb.extras?.pageId || "",
    };
    params.facebook_d64 = encodeB64Json(facebook);
  }

  const yt = dests.find((d) => d.platform === "youtube");
  if (yt && (yt.server_url || yt.stream_key || yt.secure_stream_url)) {
    const y =
      yt.server_url && yt.stream_key ? yt : splitRtmpUrl(yt.secure_stream_url);
    const ysrv = yt.server_url || y.server_url || "";
    const ykey = yt.stream_key || y.stream_key || "";
    if (ysrv) params.yt_server = String(ysrv);
    if (ykey) params.yt = String(ykey);
    const youtube = {
      server_url: ysrv,
      stream_key: ykey,
      secure_stream_url: yt.secure_stream_url || "",
      watch_url: yt.watch_url || "",
    };
    params.youtube_d64 = encodeB64Json(youtube);
  }

  const tt = dests.find((d) => d.platform === "tiktok");
  if (tt && (tt.server_url || tt.stream_key || tt.secure_stream_url)) {
    const t =
      tt.server_url && tt.stream_key ? tt : splitRtmpUrl(tt.secure_stream_url);
    const tsrv = tt.server_url || t.server_url || "";
    const tkey = tt.stream_key || t.stream_key || "";
    if (tsrv) params.tt_server = String(tsrv);
    if (tkey) params.tt = String(tkey);
    const tiktok = {
      server_url: tsrv,
      stream_key: tkey,
      secure_stream_url: tt.secure_stream_url || "",
      room_url: tt.room_url || "",
    };
    params.tiktok_d64 = encodeB64Json(tiktok);
  }

  params.raw_d64 = encodeB64Json({ data, extracted: dests });

  Object.keys(params).forEach((k) => {
    if (typeof params[k] !== "string") params[k] = String(params[k]);
  });

  return params;
};

function buildStudioUrlMobile(baseUrl, data, match, baseOrigin) {
  let base = baseUrl || "/live/studio";
  const origin = baseOrigin || "https://pickletour.vn";
  if (typeof base === "string" && /^https?:\/\//i.test(base)) {
    try {
      const parsed = new URL(base);
      base = parsed.pathname + (parsed.search || "");
    } catch {}
  }
  const u = new URL(base, origin);
  if (match?._id) u.searchParams.set("matchId", String(match._id));
  const dests = extractDestinations(data, match);
  if (dests.length) {
    const minimal = dests.map((d) => ({
      platform: d.platform,
      server_url: d.server_url || d.secure_stream_url || "",
      stream_key: d.stream_key || "",
      secure_stream_url: d.secure_stream_url || "",
    }));
    const d64 = encodeB64Json(minimal);
    if (d64) u.searchParams.set("d64", d64);

    const fb = dests.find((d) => d.platform === "facebook");
    if (fb) {
      let fbKey = fb.stream_key;
      if (!fbKey && fb.secure_stream_url)
        fbKey = splitRtmpUrl(fb.secure_stream_url).stream_key;
      if (fbKey) u.searchParams.set("key", fbKey);
    }
    const yt = dests.find((d) => d.platform === "youtube");
    if (yt && (yt.server_url || yt.stream_key || yt.secure_stream_url)) {
      const y =
        yt.server_url && yt.stream_key
          ? yt
          : splitRtmpUrl(yt.secure_stream_url);
      const ysrv = yt.server_url || y.server_url;
      const ykey = yt.stream_key || y.stream_key;
      if (ysrv) u.searchParams.set("yt_server", ysrv);
      if (ykey) u.searchParams.set("yt", ykey);
    }
    const tt = dests.find((d) => d.platform === "tiktok");
    if (tt && (tt.server_url || tt.stream_key || tt.secure_stream_url)) {
      const t =
        tt.server_url && tt.stream_key
          ? tt
          : splitRtmpUrl(tt.secure_stream_url);
      const tsrv = tt.server_url || t.server_url;
      const tkey = tt.stream_key || t.stream_key;
      if (tsrv) u.searchParams.set("tt_server", tsrv);
      if (tkey) u.searchParams.set("tt", tkey);
    }
  }
  return u.toString();
}

/* ---------- BottomSheet: LIVE info ---------- */
const LineBox = memo(({ label, value, hidden, onCopy, onOpen }) => {
  const T = useThemeTokens();
  if (!value) return null;

  const handleCopy = useCallback(() => {
    if (onCopy) onCopy(value);
  }, [onCopy, value]);

  const handleOpen = useCallback(() => {
    if (onOpen) onOpen(value);
  }, [onOpen, value]);

  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 12, color: T.textSecondary }}>{label}</Text>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <View
          style={[
            styles.overlayBox,
            { flex: 1, backgroundColor: T.softBg2, borderColor: T.softBorder },
          ]}
        >
          <Text
            style={[styles.monoText, { color: T.textPrimary }]}
            numberOfLines={1}
          >
            {hidden ? "••••••••••••" : value}
          </Text>
        </View>
        {onCopy && (
          <TouchableOpacity
            style={[styles.btn, { borderColor: T.softBorder }]}
            onPress={handleCopy}
          >
            <MaterialIcons
              name="content-copy"
              size={18}
              color={T.textPrimary}
            />
          </TouchableOpacity>
        )}
        {onOpen && (
          <TouchableOpacity
            style={[styles.btn, { borderColor: T.softBorder }]}
            onPress={handleOpen}
          >
            <MaterialIcons name="open-in-new" size={18} color={T.textPrimary} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
});

const DestinationCard = memo(({ d, onCopy }) => {
  const T = useThemeTokens();
  const openUrl = d.permalink_url || d.watch_url || d.room_url || null;

  const handleOpenUrl = useCallback(() => {
    if (openUrl) Linking.openURL(openUrl);
  }, [openUrl]);

  return (
    <View
      style={{
        padding: 10,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: T.cardBorder,
        gap: 8,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <MaterialIcons name="live-tv" size={18} color={T.textPrimary} />
        <Text style={{ fontWeight: "700", color: T.textPrimary }}>
          {(d.platform || "").toUpperCase()} {d.id ? `#${d.id}` : ""}
        </Text>
        <View style={{ flex: 1 }} />
        {openUrl && (
          <TouchableOpacity onPress={handleOpenUrl}>
            <MaterialIcons name="open-in-new" size={18} color={T.textPrimary} />
          </TouchableOpacity>
        )}
      </View>
      {d.server_url && (
        <LineBox label="Server URL" value={d.server_url} onCopy={onCopy} />
      )}
      {d.stream_key && (
        <LineBox
          label="Stream Key"
          value={d.stream_key}
          onCopy={onCopy}
          hidden
        />
      )}
      {d.platform === "facebook" && d.extras?.pageId && (
        <LineBox
          label="Facebook Page ID"
          value={String(d.extras.pageId)}
          onCopy={onCopy}
        />
      )}
    </View>
  );
});

const LiveInfoSheet = memo(
  forwardRef(function LiveInfoSheet({ match, data, baseOrigin, onClose }, ref) {
    const T = useThemeTokens();
    const router = useRouter();
    const snapPoints = useMemo(() => ["60%", "92%"], []);
    const overlayPref = data?.overlay_url || "";
    const studioParams = useMemo(
      () => buildStudioParams(baseOrigin, data, match, overlayPref),
      [baseOrigin, data, match, overlayPref]
    );
    const studioPath = useMemo(
      () => data?.studio_route || data?.studio_path || "/live/studio",
      [data]
    );

    const closeSheetsThenGoStudio = useCallback(() => {
      ref?.current?.dismiss?.();
      onClose?.();

      setTimeout(() => {
        router.push({ pathname: studioPath, params: studioParams });
      }, 100); // ✅ tăng delay để tránh giật
    }, [router, studioPath, studioParams, onClose, ref]);

    const renderBackdrop = useCallback(
      (props) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={0.5}
        />
      ),
      []
    );

    const copy = useCallback(async (v) => {
      try {
        await Clipboard.setStringAsync(v || "");
        Toast.show({ type: "success", text1: "Đã copy" });
      } catch {}
    }, []);

    const destinations = useMemo(
      () => extractDestinations(data, match),
      [data, match]
    );

    const primaryLink = useMemo(
      () => data?.permalink_url || data?.watch_url || null,
      [data]
    );

    const handleOpenPrimaryLink = useCallback(() => {
      if (primaryLink) Linking.openURL(primaryLink);
    }, [primaryLink]);

    const handleOpenOverlay = useCallback(() => {
      if (data?.overlay_url) Linking.openURL(data.overlay_url);
    }, [data?.overlay_url]);

    return (
      <BottomSheetModal
        ref={ref}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        onDismiss={onClose}
        enableDynamicSizing={false}
        animateOnMount
      >
        <BottomSheetScrollView
          contentContainerStyle={{ padding: 14, gap: 12 }}
          removeClippedSubviews
          showsVerticalScrollIndicator={false}
        >
          <Text style={{ fontWeight: "800", color: T.textPrimary }}>
            LIVE Outputs (#{match?.code || String(match?._id || "").slice(-5)})
          </Text>

          <View style={{ gap: 10 }}>
            {data?.secure_stream_url &&
              !(data?.server_url || data?.stream_key) && (
                <LineBox
                  label="Secure Stream URL (RTMPS)"
                  value={data.secure_stream_url}
                  onCopy={copy}
                />
              )}
            {data?.server_url && (
              <LineBox
                label="Server URL (RTMPS)"
                value={data.server_url}
                onCopy={copy}
              />
            )}
            {data?.stream_key && (
              <LineBox
                label="Stream Key"
                value={data.stream_key}
                onCopy={copy}
                hidden
              />
            )}
          </View>

          <View style={{ gap: 10 }}>
            <Text style={{ fontWeight: "700", color: T.textPrimary }}>
              Overlay & Studio
            </Text>
            {data?.overlay_url && (
              <LineBox
                label="Overlay URL (Browser Source)"
                value={data.overlay_url}
                onCopy={copy}
                onOpen={handleOpenOverlay}
              />
            )}
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                style={[
                  styles.btn,
                  { borderColor: T.softBorder, backgroundColor: T.cardBg },
                ]}
                onPress={closeSheetsThenGoStudio}
              >
                <Text
                  style={[
                    styles.btnText,
                    { color: T.textPrimary, fontWeight: "700" },
                  ]}
                >
                  Open Studio
                </Text>
              </TouchableOpacity>
              {primaryLink && (
                <TouchableOpacity
                  style={[
                    styles.btn,
                    { borderColor: T.softBorder, backgroundColor: T.cardBg },
                  ]}
                  onPress={handleOpenPrimaryLink}
                >
                  <Text
                    style={[
                      styles.btnText,
                      { color: T.textPrimary, fontWeight: "700" },
                    ]}
                  >
                    Open Live
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {!!destinations.length && (
            <View style={{ gap: 8 }}>
              <Text style={{ fontWeight: "700", color: T.textPrimary }}>
                Destinations
              </Text>
              <View style={{ gap: 8 }}>
                {destinations.map((d, i) => (
                  <DestinationCard
                    key={`${d.platform}-${d.id || i}`}
                    d={d}
                    onCopy={copy}
                  />
                ))}
              </View>
            </View>
          )}

          <View style={{ height: 8 }} />
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  })
);

/* ---------- Thanh công cụ quản trị ---------- */
const AdminToolbar = memo(
  ({
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
  }) => {
    const T = useThemeTokens();
    const confirmWinner = useCallback(
      (side) => {
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
      },
      [onSetWinner]
    );

    return (
      <View
        style={[
          styles.adminCard,
          { backgroundColor: T.cardBg, borderColor: T.cardBorder },
        ]}
      >
        <View style={styles.adminHeader}>
          <Text style={[styles.adminTitle, { color: T.textPrimary }]}>
            QUẢN TRỊ TRẬN
          </Text>
          <Text style={[styles.adminSub, { color: T.textSecondary }]}>
            Chỉnh sửa tỉ số • Đặt đội thắng • Đổi trạng thái
          </Text>
        </View>

        <View style={styles.adminRow}>
          <Text style={[styles.rowLabel, { color: T.textSecondary }]}>
            Trạng thái
          </Text>
          <SegmentedStatus
            value={status}
            onChange={(s) => onSetStatus?.(s)}
            disabled={busy}
          />
        </View>

        <View style={styles.adminRow}>
          <Text style={[styles.rowLabel, { color: T.textSecondary }]}>
            Tỉ số
          </Text>
          {!editMode ? (
            <AdminBtn
              icon="edit"
              label="Chỉnh sửa tỉ số"
              onPress={onEnterEdit}
              disabled={busy}
            />
          ) : (
            <View style={styles.rowWrap}>
              <AdminBtn
                icon="save"
                label="Lưu tỉ số"
                onPress={onSave}
                disabled={busy}
                style={[
                  styles.btnPrimary,
                  { backgroundColor: T.tint, borderColor: T.tint },
                ]}
                textStyle={[styles.btnPrimaryText]}
              />
              <AdminBtn
                icon="undo"
                label="Hoàn tác"
                onPress={onReset}
                disabled={busy}
              />
              <AdminBtn
                icon="add"
                label="Thêm set"
                onPress={onAddSet}
                disabled={busy}
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

        <View style={styles.adminRow}>
          <Text style={[styles.rowLabel, { color: T.textSecondary }]}>
            Kết quả
          </Text>
          <View style={styles.rowWrap}>
            <AdminBtn
              icon="emoji-events"
              label="Đặt A thắng"
              onPress={() => confirmWinner("A")}
              disabled={busy}
              style={[
                styles.btnSuccessOutline,
                {
                  backgroundColor: T.success.bgSoft,
                  borderColor: T.success.bdSoft,
                },
              ]}
              textStyle={{ color: T.success.text, fontWeight: "700" }}
            />
            <AdminBtn
              icon="emoji-events"
              label="Đặt B thắng"
              onPress={() => confirmWinner("B")}
              disabled={busy}
              style={[
                styles.btnSuccessOutline,
                {
                  backgroundColor: T.success.bgSoft,
                  borderColor: T.success.bdSoft,
                },
              ]}
              textStyle={{ color: T.success.text, fontWeight: "700" }}
            />
          </View>
        </View>
      </View>
    );
  }
);

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
  if (m?.liveBy) {
    push(m.liveBy);
    if (m.liveBy.user) push(m.liveBy.user);
    if (m.liveBy._id || m.liveBy.id) push(m.liveBy._id || m.liveBy.id);
  }
  push(m?.referee);
  push(m?.assignedReferee);
  if (Array.isArray(m?.referees))
    for (const it of m.referees) {
      push(it);
      if (it?.user) push(it.user);
    }
  push(m?.meta?.referee);
  if (Array.isArray(m?.meta?.referees))
    for (const it of m.meta.referees) {
      push(it);
      if (it?.user) push(it.user);
    }
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
  const T = useThemeTokens();
  const socket = useSocket();

  const { userInfo } = useSelector((s) => s.auth || {});
  const roleStr = String(userInfo?.role || "").toLowerCase();
  const roles = useMemo(
    () =>
      new Set(
        [...(userInfo?.roles || []), ...(userInfo?.permissions || [])]
          .filter(Boolean)
          .map((x) => String(x).toLowerCase())
      ),
    [userInfo]
  );

  const tour =
    m?.tournament && typeof m.tournament === "object" ? m.tournament : null;

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

  const [profileOpen, setProfileOpen] = useState(false);
  const [profileUserId, setProfileUserId] = useState(null);
  const openProfile = useCallback((uid) => {
    if (!uid) return;
    const norm = uid?._id || uid?.id || uid?.userId || uid?.uid || uid || null;
    if (norm) {
      setProfileUserId(String(norm));
      setProfileOpen(true);
    }
  }, []);
  const closeProfile = useCallback(() => setProfileOpen(false), []);

  const loading = Boolean(isLoading || liveLoading);
  const {
    lockedId,
    view: mm,
    setView,
    waiting,
  } = useLockedMatch(m, { loading });
  const showSpinnerDelayed = useDelayedFlag(waiting, 250);

  const [localPatch, setLocalPatch] = useState(null);
  useEffect(() => {
    setLocalPatch(null);
  }, [lockedId]);

  const merged = useMemo(
    () => (localPatch ? { ...(mm || {}), ...localPatch } : mm || null),
    [mm, localPatch]
  );

  // giữ onSaved mới nhất cho debounce
  const onSavedRef = useRef(onSaved);
  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  const debouncedRefreshRef = useRef(null);
  const debouncedRefresh = useCallback(() => {
    if (debouncedRefreshRef.current) clearTimeout(debouncedRefreshRef.current);
    debouncedRefreshRef.current = setTimeout(() => {
      onSavedRef.current?.();
    }, 200);
  }, []);

  const applyLocalScoreIfAny = useCallback((payload = {}) => {
    const gameScores =
      payload.gameScores ??
      payload.scores ??
      payload.data?.gameScores ??
      payload.data?.scores ??
      payload.snapshot?.gameScores;

    if (Array.isArray(gameScores)) {
      setLocalPatch((p) => ({ ...(p || {}), gameScores }));
    }
  }, []);

  const applyLocalStreamIfAny = useCallback((payload = {}) => {
    const snap = payload.snapshot || payload.data || payload || {};

    const candidates = [
      snap.video,
      snap.videoUrl,
      snap.meta?.video,
      snap.link,
      snap.url,
      snap.sources?.video,
    ]
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter(Boolean);

    const streamsArr =
      snap.streams ||
      snap.meta?.streams ||
      snap.links?.items ||
      snap.sources?.items ||
      [];

    const hasVideo = candidates.length > 0;
    const hasStreams = Array.isArray(streamsArr) && streamsArr.length > 0;
    if (!hasVideo && !hasStreams) return;

    setLocalPatch((p) => {
      const next = { ...(p || {}) };
      if (hasVideo) {
        const v = candidates[0];
        next.video = v;
        next.videoUrl = v;
        next.meta = { ...(next.meta || {}), video: v };
      }
      if (hasStreams) {
        next.streams = streamsArr;
        next.meta = { ...(next.meta || {}), streams: streamsArr };
      }
      return next;
    });
  }, []);

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

  useEffect(() => {
    if (!socket || !lockedId) return;

    const forThis = (payload) =>
      isSameId(getMatchIdFromPayload(payload), lockedId);

    const SCORE_EVENTS = [
      "score:updated",
      "score:patched",
      "score:added",
      "score:undone",
      "match:snapshot",
    ];
    const REFRESH_EVENTS = [
      "match:patched",
      "match:started",
      "match:finished",
      "match:forfeited",
      "draw:matchUpdated",
      "match:teamsUpdated",
      "status:updated",
    ];
    const STREAM_EVENTS = ["match:snapshot", "stream:updated", "video:set"];

    const onScore = (payload = {}) => {
      if (!forThis(payload)) return;
      applyLocalScoreIfAny(payload);

      const hasScores = Array.isArray(
        payload.gameScores ??
          payload.scores ??
          payload.data?.gameScores ??
          payload.data?.scores ??
          payload.snapshot?.gameScores
      );
      if (!hasScores) debouncedRefresh();
    };

    const onGenericRefresh = (payload = {}) => {
      if (!forThis(payload)) return;
      debouncedRefresh();
    };

    const onStream = (payload = {}) => {
      if (!forThis(payload)) return;
      applyLocalStreamIfAny(payload);
    };

    SCORE_EVENTS.forEach((ev) => socket.on(ev, onScore));
    REFRESH_EVENTS.forEach((ev) => socket.on(ev, onGenericRefresh));
    STREAM_EVENTS.forEach((ev) => socket.on(ev, onStream));

    return () => {
      SCORE_EVENTS.forEach((ev) => socket.off(ev, onScore));
      REFRESH_EVENTS.forEach((ev) => socket.off(ev, onGenericRefresh));
      STREAM_EVENTS.forEach((ev) => socket.off(ev, onStream));
      if (debouncedRefreshRef.current) {
        clearTimeout(debouncedRefreshRef.current);
        debouncedRefreshRef.current = null;
      }
    };
  }, [
    socket,
    lockedId,
    applyLocalScoreIfAny,
    applyLocalStreamIfAny,
    debouncedRefresh,
  ]);

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
  // ===== Serve detection (ai đang giao) =====
  const _idOf = (p) =>
    (p?.user?._id ||
      p?.user?.id ||
      p?._id ||
      p?.id ||
      p?.userId ||
      p?.uid ||
      p) &&
    String(
      p?.user?._id || p?.user?.id || p?._id || p?.id || p?.userId || p?.uid || p
    );

  function _parseServeCode(x) {
    if (!x) return {};
    const s = String(x).toUpperCase();
    const m = s.match(/\b([AB])\s*-?\s*([12])?\b/);
    if (m) return { side: m[1], member: m[2] ? parseInt(m[2], 10) : null };
    return {};
  }

  function resolveServeFlags(m, { isSingle }) {
    const flags = { a1: false, a2: false, b1: false, b2: false };
    if (!m) return flags;

    const A1 = _idOf(m?.pairA?.player1);
    const A2 = _idOf(m?.pairA?.player2);
    const B1 = _idOf(m?.pairB?.player1);
    const B2 = _idOf(m?.pairB?.player2);

    const ids = new Set();
    const push = (v) => {
      const id = _idOf(v);
      if (id) ids.add(id);
    };

    // Các khả năng lưu user đang giao
    push(m?.serveUser);
    push(m?.serveBy);
    push(m?.serverUser);
    push(m?.serverUserId);
    push(m?.servingUser);
    push(m?.servingUserId);
    push(m?.meta?.serveUser);
    push(m?.serve?.user);
    push(m?.serve?.userId);
    push(m?.serve?.by);
    push(m?.refState?.serve?.user);
    (Array.isArray(m?.servers) ? m.servers : []).forEach(push);
    (Array.isArray(m?.serves) ? m.serves : []).forEach(push);

    let matched = false;
    if (ids.size) {
      if (A1 && ids.has(A1)) flags.a1 = matched = true;
      if (A2 && ids.has(A2)) flags.a2 = matched = true;
      if (B1 && ids.has(B1)) flags.b1 = matched = true;
      if (B2 && ids.has(B2)) flags.b2 = matched = true;
    }
    if (matched) return flags;

    // Không có userId -> thử theo mã/side
    const codeSources = [
      m?.serve?.code,
      m?.serveCode,
      m?.rally?.server,
      m?.refState?.serve,
      m?.meta?.serveCode,
      typeof m?.serve === "string" ? m?.serve : null,
      typeof m?.server === "string" ? m?.server : null,
    ].filter(Boolean);

    let side = null;
    let member = null;
    for (const c of codeSources) {
      const r = _parseServeCode(c);
      if (r.side) {
        side = r.side;
        member = r.member ?? member;
        break;
      }
    }
    if (!side) {
      side = (
        m?.serve?.side ||
        m?.serveSide ||
        m?.currentServeSide ||
        m?.serverSide ||
        ""
      )
        .toString()
        .toUpperCase();
      member =
        m?.serve?.member ??
        m?.serve?.player ??
        m?.serve?.index ??
        m?.serve?.playerIdx ??
        null;
    }
    if (side === "A") {
      if (member === 2 && A2) flags.a2 = true;
      else flags.a1 = true; // mặc định A1 (single cũng A1)
    } else if (side === "B") {
      if (member === 2 && B2) flags.b2 = true;
      else flags.b1 = true; // mặc định B1
    }
    return flags;
  }

  const isRefereeHere = isUserRefereeOfMatch(userInfo, merged);

  const status = merged?.status || "scheduled";
  const shownGameScores = merged?.gameScores ?? [];

  const streams = useMemo(() => normalizeStreams(merged || {}), [merged]);
  const pickInitialIndex = useCallback((arr) => {
    if (!arr.length) return -1;
    const primary = arr.findIndex((s) => s.primary);
    if (primary >= 0) return primary;
    const emb = arr.findIndex((s) => s.canEmbed);
    if (emb >= 0) return emb;
    return 0;
  }, []);

  const [activeIdx, setActiveIdx] = useState(() => pickInitialIndex(streams));
  const [showPlayer, setShowPlayer] = useState(false);

  useEffect(() => {
    setActiveIdx(pickInitialIndex(streams));
    setShowPlayer(false);
  }, [lockedId, pickInitialIndex, streams]);

  const activeStream = useMemo(
    () =>
      activeIdx >= 0 && activeIdx < streams.length ? streams[activeIdx] : null,
    [activeIdx, streams]
  );

  const displayTime = useMemo(
    () => toDateSafe(pickDisplayTime(merged)),
    [merged]
  );
  const timeLabel = useMemo(() => {
    if (!displayTime) return null;
    if (status !== "finished") return `Giờ đấu: ${formatClock(displayTime)}`;
    return `Bắt đầu: ${formatClock(displayTime)}`;
  }, [displayTime, status]);

  const overlayBase = useMemo(
    () => resolveWebBase(merged?.tournament, merged?.overlay),
    [merged?.tournament, merged?.overlay]
  );
  const overlayUrl = useMemo(
    () =>
      buildOverlayUrl(overlayBase, lockedId, {
        theme: T.scheme,
        size: "md",
        showSets: true,
        autoNext: true,
      }),
    [overlayBase, lockedId, T.scheme]
  );
  // ===== Edit scores (Native) =====
  const [editMode, setEditMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editScores, setEditScores] = useState(() => [
    ...(merged?.gameScores ?? []),
  ]);

  // Khi bấm "Chỉnh sửa tỉ số":
  // - Bật editMode
  // - Nếu chưa có set nào thì tạo 1 set {a:0, b:0} để luôn có ô input
  const enterEdit = useCallback(() => {
    setEditMode(true);
    setEditScores((prev) => {
      const arr = Array.isArray(prev) ? [...prev] : [];
      return arr.length ? arr : [{ a: 0, b: 0 }];
    });
  }, []);

  const exitEdit = useCallback(() => setEditMode(false), []);

  // Cho editScores luôn follow gameScores từ server/socket
  // nhưng nếu đang edit và server trả về rỗng thì giữ lại ít nhất 1 set
  useEffect(() => {
    const base = [...(merged?.gameScores ?? [])];

    setEditScores((prev) => {
      if (editMode) {
        if (base.length > 0) {
          // có điểm -> input nhảy theo điểm mới
          return base;
        }
        // không có điểm mà đang edit -> giữ input cũ hoặc tạo 1 set
        return prev && prev.length ? prev : [{ a: 0, b: 0 }];
      }

      // không ở chế độ edit -> bám đúng dữ liệu server
      return base;
    });
  }, [lockedId, merged?.gameScores, editMode]);

  const sanitizeInt = useCallback((v) => {
    const n = parseInt(String(v ?? "").replace(/[^\d]/g, ""), 10);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(n, 99);
  }, []);

  const setCell = useCallback(
    (idx, side, val) => {
      setEditScores((old) => {
        const arr = [...(Array.isArray(old) ? old : [])];
        while (arr.length <= idx) arr.push({ a: 0, b: 0 });
        const row = { ...(arr[idx] || { a: 0, b: 0 }) };
        row[side] = sanitizeInt(val);
        arr[idx] = row;
        return arr;
      });
    },
    [sanitizeInt]
  );

  const addSet = useCallback(
    () => setEditScores((old) => [...(old || []), { a: 0, b: 0 }]),
    []
  );
  const removeSet = useCallback(
    (idx) => setEditScores((old) => (old || []).filter((_, i) => i !== idx)),
    []
  );
  const resetEdits = useCallback(
    () => setEditScores([...(merged?.gameScores ?? [])]),
    [merged?.gameScores]
  );

  const [adminPatchMatch] = useAdminPatchMatchMutation();

  const doPatch = useCallback(
    async (body, { successMsg = "Đã cập nhật." } = {}) => {
      if (!lockedId) return;
      setBusy(true);
      try {
        await adminPatchMatch({ id: lockedId, body }).unwrap();
        Toast.show({ type: "success", text1: successMsg });
        onSaved?.();
      } catch (e) {
        const msg = e?.data?.message || e?.message || "Không cập nhật được";
        Toast.show({ type: "error", text1: "Lỗi", text2: msg });
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [adminPatchMatch, lockedId, onSaved]
  );

  const handleSaveScores = useCallback(async () => {
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
  }, [canManage, lockedId, doPatch, editScores, status, exitEdit]);

  const handleSetWinner = useCallback(
    async (side) => {
      if (!canManage || !lockedId) return;
      try {
        await doPatch(
          { winner: side, status: "finished" },
          { successMsg: `Đã đặt đội ${side} thắng.` }
        );
        setLocalPatch((p) => ({ ...(p || {}), status: "finished" }));
      } catch {}
    },
    [canManage, lockedId, doPatch]
  );

  const handleSetStatus = useCallback(
    async (newStatus) => {
      if (!canManage || !lockedId) return;
      try {
        const body =
          newStatus === "finished"
            ? { status: newStatus }
            : { status: newStatus, winner: "" };
        await doPatch(body, { successMsg: `Đã đổi trạng thái: ${newStatus}` });
        setLocalPatch((p) => ({ ...(p || {}), status: newStatus }));
      } catch {}
    },
    [canManage, lockedId, doPatch]
  );

  const { A: setsA, B: setsB } = useMemo(
    () => countGamesWon(shownGameScores),
    [shownGameScores]
  );

  const [createLive, { isLoading: creatingLive }] =
    useCreateFacebookLiveForMatchMutation();
  const liveSheetRef = useRef(null);
  const [liveData, setLiveData] = useState(null);

  const presentLiveSheet = useCallback(() => {
    liveSheetRef.current?.present?.();
  }, []);

  const prefillFromMatch = useCallback(() => {
    const fb = merged?.facebookLive || {};
    const yt = merged?.youtubeLive || {};
    const tt = merged?.tiktokLive || {};
    const destinations = [];
    const hasAnyFb =
      fb.server_url ||
      fb.stream_key ||
      fb.permalink_url ||
      fb.secure_stream_url;
    const hasAnyYt = yt.server_url || yt.stream_key || yt.watch_url;
    const hasAnyTt =
      tt.server_url || tt.stream_key || tt.room_url || tt.secure_stream_url;
    if (hasAnyFb)
      destinations.push({
        platform: "facebook",
        ...fb,
        extras: { pageId: fb.pageId },
      });
    if (hasAnyYt) destinations.push({ platform: "youtube", ...yt });
    if (hasAnyTt) destinations.push({ platform: "tiktok", ...tt });

    setLiveData((prev) => ({
      ...(prev || {}),
      server_url:
        (hasAnyFb && fb.server_url) ||
        (hasAnyYt && yt.server_url) ||
        prev?.server_url ||
        "",
      stream_key:
        (hasAnyFb && fb.stream_key) ||
        (hasAnyYt && yt.stream_key) ||
        prev?.stream_key ||
        "",
      secure_stream_url:
        (hasAnyFb && fb.secure_stream_url) || prev?.secure_stream_url || "",
      permalink_url:
        (hasAnyFb && fb.permalink_url) || prev?.permalink_url || "",
      overlay_url: overlayUrl || prev?.overlay_url || "",
      studio_url: prev?.studio_url || "",
      destinations: destinations.length
        ? destinations
        : prev?.destinations || [],
      note: prev?.note || "",
    }));
  }, [merged, overlayUrl]);

  const handleCreateLive = useCallback(async () => {
    if (!lockedId) return;
    try {
      const res = await createLive(lockedId).unwrap();
      const { errors, ...clean } = res || {};
      setLiveData(clean);
      presentLiveSheet();
    } catch (err) {
      Toast.show({
        type: "error",
        text1: "Không tạo được LIVE",
        text2: "Mở thông tin đã có (nếu có).",
      });
      prefillFromMatch();
      presentLiveSheet();
    }
  }, [lockedId, createLive, presentLiveSheet, prefillFromMatch]);

  const handleOpenLiveInfo = useCallback(() => {
    prefillFromMatch();
    presentLiveSheet();
  }, [prefillFromMatch, presentLiveSheet]);

  const showSpinner = waiting && showSpinnerDelayed;
  const showError = !waiting && !mm;

  const isSingle = useMemo(
    () =>
      String(merged?.tournament?.eventType || "").toLowerCase() === "single",
    [merged?.tournament?.eventType]
  );
  const serveFlags = useMemo(
    () => resolveServeFlags(merged, { isSingle }),
    [merged, isSingle]
  );
  const teamAName = useMemo(() => {
    if (merged?.pairA) {
      return [merged?.pairA?.player1, !isSingle && merged?.pairA?.player2]
        .filter(Boolean)
        .map((p) => nameWithNick(p))
        .join(" & ");
    }
    if (merged?.previousA) return smartDepLabel(merged, merged.previousA);
    return seedLabel(merged?.seedA);
  }, [merged, isSingle]);

  const teamBName = useMemo(() => {
    if (merged?.pairB) {
      return [merged?.pairB?.player1, !isSingle && merged?.pairB?.player2]
        .filter(Boolean)
        .map((p) => nameWithNick(p))
        .join(" & ");
    }
    if (merged?.previousB) return smartDepLabel(merged, merged.previousB);
    return seedLabel(merged?.seedB);
  }, [merged, isSingle]);

  const togglePlayer = useCallback(() => setShowPlayer((v) => !v), []);

  const handleCopyOverlay = useCallback(async () => {
    try {
      await Clipboard.setStringAsync(overlayUrl);
      Toast.show({
        type: "success",
        text1: "Đã copy link overlay",
      });
    } catch {
      Toast.show({ type: "error", text1: "Copy thất bại" });
    }
  }, [overlayUrl]);

  const handleOpenOverlay = useCallback(() => {
    Linking.openURL(overlayUrl);
  }, [overlayUrl]);

  const handleOpenActiveStream = useCallback(() => {
    if (activeStream?.url) Linking.openURL(activeStream.url);
  }, [activeStream]);

  if (showSpinner) {
    return (
      <View style={styles.centerBox}>
        <ActivityIndicator />
      </View>
    );
  }
  if (showError) {
    return (
      <View
        style={[
          styles.card,
          { padding: 12, backgroundColor: T.cardBg, borderColor: T.cardBorder },
        ]}
      >
        <Text
          style={[styles.errorText, { color: T.danger?.text || "#f87171" }]}
        >
          Không tải được dữ liệu trận.
        </Text>
      </View>
    );
  }
  if (!merged) return <View style={{ paddingVertical: 8 }} />;

  return (
    <>
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { backgroundColor: "transparent" },
        ]}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
      >
        <StatusBanner status={status} hasStreams={streams.length > 0} />

        {activeStream && (
          <View style={{ gap: 8 }}>
            <View style={styles.rowWrap}>
              {activeStream.canEmbed && (
                <TouchableOpacity
                  style={[
                    styles.btn,
                    { borderColor: T.softBorder, backgroundColor: T.cardBg },
                    showPlayer && {
                      backgroundColor: T.tint,
                      borderColor: T.tint,
                    },
                    styles.btnFluid,
                  ]}
                  onPress={togglePlayer}
                  disabled={busy}
                >
                  <Text
                    style={[
                      styles.btnText,
                      {
                        color: showPlayer ? "#fff" : T.textPrimary,
                        fontWeight: "700",
                      },
                    ]}
                  >
                    ▶ {showPlayer ? "Thu gọn video" : "Xem video trong nền"}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[
                  styles.btn,
                  styles.btnFluid,
                  { backgroundColor: T.cardBg, borderColor: T.softBorder },
                ]}
                onPress={handleOpenActiveStream}
                disabled={busy}
              >
                <Text style={[styles.btnText, { color: T.textPrimary }]}>
                  Mở link trực tiếp ↗
                </Text>
              </TouchableOpacity>
            </View>

            {showPlayer && activeStream.canEmbed && (
              <StreamPlayer stream={activeStream} />
            )}
          </View>
        )}

        {overlayUrl && canSeeOverlay && (
          <View
            style={[
              styles.card,
              { backgroundColor: T.cardBg, borderColor: T.cardBorder },
            ]}
          >
            <Text style={[styles.cardTitle, { color: T.textPrimary }]}>
              Overlay tỉ số trực tiếp
            </Text>
            <View style={styles.rowWrap}>
              <View
                style={[
                  styles.overlayBox,
                  {
                    flexGrow: 1,
                    minWidth: 220,
                    backgroundColor: T.softBg2,
                    borderColor: T.softBorder,
                  },
                ]}
              >
                <Text
                  style={[styles.monoText, { color: T.textSecondary }]}
                  numberOfLines={1}
                >
                  {overlayUrl}
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.btn,
                  styles.btnFluid,
                  { backgroundColor: T.cardBg, borderColor: T.softBorder },
                ]}
                onPress={handleCopyOverlay}
              >
                <Text style={[styles.btnText, { color: T.textPrimary }]}>
                  Copy link
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.btn,
                  styles.btnFluid,
                  { backgroundColor: T.tint, borderColor: T.tint },
                ]}
                onPress={handleOpenOverlay}
              >
                <Text style={styles.btnPrimaryText}>Mở overlay</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.caption, { color: T.textSecondary }]}>
              Mẹo: dán link này vào OBS/StreamYard (Browser Source) để hiển thị
              tỉ số.
            </Text>

            {canManage && (
              <View style={[styles.rowWrap, { marginTop: 10 }]}>
                <AdminBtn
                  icon="live-tv"
                  label={creatingLive ? "Đang tạo LIVE…" : "Tạo LIVE"}
                  onPress={handleCreateLive}
                  disabled={creatingLive}
                  style={{ minWidth: 140 }}
                  textStyle={{ fontWeight: "700" }}
                />
                <AdminBtn
                  icon="info-outline"
                  label="Mở thông tin LIVE"
                  onPress={handleOpenLiveInfo}
                  style={{ minWidth: 160 }}
                />
              </View>
            )}
          </View>
        )}

        <View
          style={[
            styles.card,
            { backgroundColor: T.cardBg, borderColor: T.cardBorder },
          ]}
        >
          <Text style={[styles.cardTitle, { color: T.textPrimary }]}>
            Điểm số
          </Text>

          <View style={[styles.row, { alignItems: "flex-start" }]}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={[styles.muted, { color: T.textSecondary }]}>
                Đội A
              </Text>
              {merged?.pairA ? (
                <View style={styles.teamWrap}>
                  <PlayerLink
                    person={merged.pairA?.player1}
                    onOpen={openProfile}
                    serving={!!serveFlags.a1}
                  />
                  {!isSingle && merged.pairA?.player2 && (
                    <>
                      <Text style={[styles.andText, { color: T.textPrimary }]}>
                        {" "}
                        &{" "}
                      </Text>
                      <PlayerLink
                        person={merged.pairA.player2}
                        onOpen={openProfile}
                        serving={!!serveFlags.a2}
                      />
                    </>
                  )}
                </View>
              ) : (
                <Text style={[styles.teamText, { color: T.textPrimary }]}>
                  {merged?.previousA
                    ? smartDepLabel(merged, merged.previousA)
                    : seedLabel(merged?.seedA)}
                </Text>
              )}
            </View>

            <View style={{ minWidth: 140, alignItems: "center" }}>
              {status === "live" && (
                <Text style={[styles.mutedSmall, { color: T.textSecondary }]}>
                  Ván hiện tại
                </Text>
              )}
              <Text style={[styles.bigScore, { color: T.textPrimary }]}>
                {lastGameScore(shownGameScores).a ?? 0} –{" "}
                {lastGameScore(shownGameScores).b ?? 0}
              </Text>
              <Text style={[styles.muted, { color: T.textSecondary }]}>
                Sets: {countGamesWon(shownGameScores).A} –{" "}
                {countGamesWon(shownGameScores).B}
              </Text>
            </View>

            <View style={{ flex: 1, paddingLeft: 8 }}>
              <Text
                style={[
                  styles.muted,
                  { textAlign: "right", color: T.textSecondary },
                ]}
              >
                Đội B
              </Text>
              {merged?.pairB ? (
                <View style={styles.teamWrapRight}>
                  <PlayerLink
                    person={merged.pairB?.player1}
                    onOpen={openProfile}
                    align="right"
                    serving={!!serveFlags.b1}
                  />
                  {!isSingle && merged.pairB?.player2 && (
                    <>
                      <Text
                        style={[
                          styles.andText,
                          { textAlign: "right", color: T.textPrimary },
                        ]}
                      >
                        {" "}
                        &{" "}
                      </Text>
                      <PlayerLink
                        person={merged.pairB.player2}
                        onOpen={openProfile}
                        align="right"
                        serving={!!serveFlags.b2}
                      />
                    </>
                  )}
                </View>
              ) : (
                <Text
                  style={[
                    styles.teamText,
                    { textAlign: "right", color: T.textPrimary },
                  ]}
                >
                  {merged?.previousB
                    ? smartDepLabel(merged, merged.previousB)
                    : seedLabel(merged?.seedB)}
                </Text>
              )}
            </View>
          </View>

          {!!(editMode ? editScores?.length : shownGameScores?.length) && (
            <View style={{ marginTop: 12 }}>
              <View
                style={[
                  styles.tableRow,
                  {
                    backgroundColor: T.softBg2,
                    borderBottomColor: T.cardBorder,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.tableCell,
                    { flex: 1, color: T.textSecondary },
                  ]}
                >
                  Set
                </Text>
                <Text
                  style={[
                    styles.tableCell,
                    styles.centerCell,
                    { color: T.textSecondary },
                  ]}
                >
                  A
                </Text>
                <Text
                  style={[
                    styles.tableCell,
                    styles.centerCell,
                    { color: T.textSecondary },
                  ]}
                >
                  B
                </Text>
                {canManage && editMode && (
                  <Text style={[styles.tableCell, styles.centerCell]} />
                )}
              </View>
              {(editMode ? editScores : shownGameScores).map((g, idx) => (
                <View
                  key={idx}
                  style={[styles.tableRow, { borderBottomColor: T.cardBorder }]}
                >
                  <Text
                    style={[
                      styles.tableCell,
                      { flex: 1, color: T.textPrimary },
                    ]}
                  >
                    {idx + 1}
                  </Text>
                  <View style={[styles.tableCell, styles.centerCell]}>
                    {canManage && editMode ? (
                      <TextInput
                        style={[
                          styles.inputScore,
                          {
                            borderColor: T.softBorder,
                            color: T.textPrimary,
                            backgroundColor: T.cardBg,
                          },
                        ]}
                        placeholderTextColor={T.textSecondary}
                        keyboardType="number-pad"
                        value={String(g?.a ?? 0)}
                        onChangeText={(t) => setCell(idx, "a", t)}
                        maxLength={2}
                      />
                    ) : (
                      <Text style={{ color: T.textPrimary }}>{g?.a ?? 0}</Text>
                    )}
                  </View>
                  <View style={[styles.tableCell, styles.centerCell]}>
                    {canManage && editMode ? (
                      <TextInput
                        style={[
                          styles.inputScore,
                          {
                            borderColor: T.softBorder,
                            color: T.textPrimary,
                            backgroundColor: T.cardBg,
                          },
                        ]}
                        placeholderTextColor={T.textSecondary}
                        keyboardType="number-pad"
                        value={String(g?.b ?? 0)}
                        onChangeText={(t) => setCell(idx, "b", t)}
                        maxLength={2}
                      />
                    ) : (
                      <Text style={{ color: T.textPrimary }}>{g?.b ?? 0}</Text>
                    )}
                  </View>
                  {canManage && editMode && (
                    <View style={[styles.tableCell, styles.centerCell]}>
                      <TouchableOpacity
                        style={[
                          styles.btnXS,
                          {
                            backgroundColor: T.danger.bgSoft,
                            borderColor: T.danger.bdSoft,
                          },
                        ]}
                        onPress={() => removeSet(idx)}
                        disabled={busy}
                      >
                        <Text
                          style={{
                            color: T.danger.text,
                            fontWeight: "700",
                            fontSize: 12,
                          }}
                        >
                          Xoá
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}

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

        <PublicProfileDialog
          open={profileOpen}
          onClose={closeProfile}
          userId={profileUserId}
        />
      </ScrollView>

      {canManage && (
        <LiveInfoSheet
          ref={liveSheetRef}
          match={merged}
          data={liveData || { overlay_url: overlayUrl }}
          baseOrigin={overlayBase}
          onClose={() => {}}
        />
      )}
    </>
  );
}

/* ---------- Chip nhỏ (themed) ---------- */
const Chip = memo(({ label }) => {
  const T = useThemeTokens();
  return (
    <View
      style={[
        styles.chip,
        { backgroundColor: T.chip.bg, borderColor: T.chip.bd },
      ]}
    >
      <Text style={[styles.chipText, { color: T.chip.text }]}>{label}</Text>
    </View>
  );
});

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

/* ---------- Styles (layout + base only) ---------- */
const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  centerBox: {
    paddingVertical: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  linkText: {
    fontWeight: "600",
    flexShrink: 0,
  },
  andText: {
    fontWeight: "700",
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
  bannerText: {},
  card: {
    borderRadius: 10,
    borderWidth: 1,
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
    borderRadius: 8,
    paddingHorizontal: 10,
    justifyContent: "center",
  },
  caption: { fontSize: 12 },
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
  btnText: { textAlign: "center" },
  btnPrimary: {},
  btnPrimaryText: { color: "#fff", fontWeight: "700", textAlign: "center" },
  btnXS: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  muted: {},
  mutedSmall: { fontSize: 12 },
  teamText: { fontSize: 16, fontWeight: "700" },
  bigScore: { fontSize: 28, fontWeight: "800" },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 8,
    borderBottomWidth: 1,
    alignItems: "center",
  },
  tableCell: { flex: 1, fontSize: 14 },
  centerCell: { alignItems: "center" },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: { fontSize: 12 },
  aspectBox: {
    width: "100%",
    borderRadius: 10,
    overflow: "hidden",
  },
  errorText: { fontWeight: "600" },
  inputScore: {
    width: 56,
    height: 36,
    borderWidth: 1,
    borderRadius: 8,
    textAlign: "center",
    paddingHorizontal: 8,
    paddingVertical: 6,
  },

  adminCard: {
    borderRadius: 12,
    borderWidth: 1,
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
  },
  adminSub: {
    fontSize: 12,
  },
  adminRow: {
    gap: 8,
  },
  rowLabel: {
    fontSize: 12,
    fontWeight: "600",
  },

  segment: {
    flexDirection: "row",
    borderRadius: 999,
    padding: 4,
    gap: 4,
    borderWidth: 1,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    alignItems: "center",
  },
  segmentLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  segmentLabelActive: {
    color: "#fff",
    fontWeight: "800",
  },

  btnContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  btnIcon: {},
  btnSuccessOutline: {},
  btnGhost: {},
});
