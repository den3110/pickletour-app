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
 * THEME TOKENS (Modernized)
 * ===================================== */
function useThemeTokens() {
  const scheme = useColorScheme() ?? "light";

  return useMemo(() => {
    const isDark = scheme === "dark";
    // Modern colors palette
    const tint = isDark ? "#60a5fa" : "#2563eb"; // Blue 500/600 modernized
    const textPrimary = isDark ? "#f8fafc" : "#1e293b"; // Slate 50/800
    const textSecondary = isDark ? "#94a3b8" : "#64748b"; // Slate 400/500

    const pageBg = isDark ? "#0f172a" : "#f8fafc"; // Slate 900 / 50
    const cardBg = isDark ? "#1e293b" : "#ffffff";
    const cardBorder = isDark ? "#334155" : "#e2e8f0"; // Subtle border

    const softBg = isDark ? "#334155" : "#f1f5f9";
    const softBg2 = isDark ? "#0f172a" : "#f8fafc";
    const softBorder = isDark ? "#475569" : "#cbd5e1";

    const banner = {
      live: {
        bg: isDark ? "rgba(14, 165, 233, 0.2)" : "#e0f2fe", // Sky
        text: isDark ? "#7dd3fc" : "#0284c7",
      },
      info: {
        bg: isDark ? "rgba(100, 116, 139, 0.2)" : "#f1f5f9", // Slate
        text: isDark ? "#cbd5e1" : "#475569",
      },
    };

    const chip = {
      bg: isDark ? "rgba(99, 102, 241, 0.15)" : "#eef2ff", // Indigo
      bd: isDark ? "#6366f1" : "#c7d2fe",
      text: isDark ? "#a5b4fc" : "#4338ca",
    };

    const success = {
      bgSoft: isDark ? "rgba(34, 197, 94, 0.15)" : "#dcfce7",
      bdSoft: isDark ? "#22c55e" : "#86efac",
      text: isDark ? "#4ade80" : "#166534",
    };

    const danger = {
      bgSoft: isDark ? "rgba(239, 68, 68, 0.15)" : "#fee2e2",
      bdSoft: isDark ? "#ef4444" : "#fca5a5",
      text: isDark ? "#f87171" : "#991b1b",
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
      // Shadow style chung
      shadow: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: isDark ? 0.3 : 0.05,
        shadowRadius: 12,
        elevation: 3,
      },
    };
  }, [scheme]);
}

/* =============== OVERLAY helpers (Giữ nguyên logic) =============== */
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
      return "Sắp diễn ra";
    case "live":
      return "Đang diễn ra";
    case "assigned":
      return "Chuẩn bị";
    case "finished":
      return "Đã kết thúc";
    default:
      return "Chưa đấu";
  }
}

/* ---------- PlayerLink (Styling Upgraded) ---------- */
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
      <TouchableOpacity
        onPress={handlePress}
        style={[
          styles.playerLinkContainer,
          align === "right" && { flexDirection: "row-reverse" },
        ]}
      >
        {serving && (
          <MaterialIcons name="sports-tennis" size={16} color={T.tint} />
        )}
        <Text
          style={[
            styles.linkText,
            { color: T.textPrimary }, // Dùng textPrimary để dễ đọc hơn
            align === "right" && { textAlign: "right" },
          ]}
          numberOfLines={1}
        >
          {nameWithNick(person)}
        </Text>
      </TouchableOpacity>
    );
  }
);

/* ---------- Hooks: chống nháy (Giữ nguyên) ---------- */
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

/* ---------- LOCK: chỉ cập nhật đúng match đang mở (Giữ nguyên) ---------- */
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

/* ---------- Time helpers (Giữ nguyên) ---------- */
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

/* ---------- Streams (Giữ nguyên) ---------- */
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
        { aspectRatio: ratio, backgroundColor: "#000" },
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

/* ---------- Banner trạng thái (Styled) ---------- */
/* ---------- Banner trạng thái (Có nút thu gọn) ---------- */
const StatusBanner = memo(({ status, hasStreams, expanded, onToggle }) => {
  const T = useThemeTokens();

  // Chỉ hiện nút thu gọn nếu trận đang LIVE và có Stream
  const canToggle = status === "live" && hasStreams;

  const text =
    status === "live"
      ? hasStreams
        ? expanded
          ? "Trận đang live. Bạn có thể xem trực tiếp bên dưới."
          : "Trận đang live (Bấm để xem video)."
        : "Trận đang live — chưa có link phát."
      : status === "finished"
      ? "Trận đấu đã kết thúc."
      : "Trận đấu chưa bắt đầu.";

  const sty = status === "live" ? T.banner.live : T.banner.info;
  const icon =
    status === "live"
      ? "fiber-manual-record"
      : status === "finished"
      ? "flag"
      : "schedule";

  return (
    <TouchableOpacity
      disabled={!canToggle}
      onPress={onToggle}
      activeOpacity={0.7}
      style={[
        styles.bannerContainer,
        { backgroundColor: sty.bg },
        // Nếu thu gọn thì bo tròn đều, nếu mở rộng thì có thể style khác (ở đây giữ nguyên cho đẹp)
      ]}
    >
      <MaterialIcons name={icon} size={18} color={sty.text} />

      <Text style={[styles.bannerText, { color: sty.text }]}>{text}</Text>

      {/* Nút mũi tên thu gọn/mở rộng */}
      {canToggle && (
        <MaterialIcons
          name={expanded ? "expand-less" : "expand-more"}
          size={24}
          color={sty.text}
        />
      )}
    </TouchableOpacity>
  );
});

/* ---------- Segmented Control: Status (Pill Style) ---------- */
const SegmentedStatus = memo(({ value, onChange, disabled }) => {
  const T = useThemeTokens();
  const items = useMemo(
    () => [
      { key: "scheduled", label: "Chưa đấu" },
      { key: "live", label: "Live" },
      { key: "finished", label: "Kết thúc" },
    ],
    []
  );

  return (
    <View style={[styles.segmentContainer, { backgroundColor: T.softBg }]}>
      {items.map((it) => {
        const active = value === it.key;
        return (
          <TouchableOpacity
            key={it.key}
            style={[
              styles.segmentBtn,
              active && [
                styles.segmentBtnActive,
                {
                  backgroundColor: T.cardBg,
                  shadowColor: T.shadow.shadowColor,
                },
              ],
              disabled && { opacity: 0.6 },
            ]}
            onPress={() => !disabled && value !== it.key && onChange?.(it.key)}
            disabled={disabled}
          >
            <Text
              style={[
                styles.segmentText,
                { color: active ? T.tint : T.textSecondary },
                active && { fontWeight: "700" },
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

/* ---------- Nút có icon (Modern) ---------- */
const AdminBtn = memo(
  ({ style, textStyle, icon, label, onPress, disabled, variant = "soft" }) => {
    const T = useThemeTokens();
    // soft: bg nhạt + text đậm
    // primary: bg tint + text trắng
    const bg = variant === "primary" ? T.tint : T.softBg;
    const fg = variant === "primary" ? "#fff" : T.textPrimary;

    return (
      <TouchableOpacity
        style={[
          styles.modernBtn,
          { backgroundColor: bg },
          disabled && { opacity: 0.6 },
          style,
        ]}
        onPress={onPress}
        disabled={disabled}
      >
        {!!icon && <MaterialIcons name={icon} size={18} color={fg} />}
        <Text style={[styles.modernBtnText, { color: fg }, textStyle]}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  }
);

/* ============== LIVE UTILS (Giữ nguyên logic) ============== */
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
    <View style={{ gap: 4 }}>
      <Text
        style={{
          fontSize: 11,
          color: T.textSecondary,
          fontWeight: "600",
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
      <View
        style={[
          styles.inputRow,
          { backgroundColor: T.softBg2, borderColor: T.softBorder },
        ]}
      >
        <Text
          style={[styles.monoText, { color: T.textPrimary, flex: 1 }]}
          numberOfLines={1}
        >
          {hidden ? "••••••••••••" : value}
        </Text>
        <View style={{ flexDirection: "row" }}>
          {onCopy && (
            <TouchableOpacity style={styles.iconBtn} onPress={handleCopy}>
              <MaterialIcons
                name="content-copy"
                size={18}
                color={T.textSecondary}
              />
            </TouchableOpacity>
          )}
          {onOpen && (
            <TouchableOpacity style={styles.iconBtn} onPress={handleOpen}>
              <MaterialIcons
                name="open-in-new"
                size={18}
                color={T.textSecondary}
              />
            </TouchableOpacity>
          )}
        </View>
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
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: T.cardBorder,
        backgroundColor: T.cardBg,
        gap: 8,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <MaterialIcons name="live-tv" size={18} color={T.tint} />
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
      }, 100);
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
        backgroundStyle={{ backgroundColor: T.pageBg }}
      >
        <BottomSheetScrollView
          contentContainerStyle={{ padding: 16, gap: 16 }}
          removeClippedSubviews
          showsVerticalScrollIndicator={false}
        >
          <Text
            style={{ fontWeight: "800", color: T.textPrimary, fontSize: 18 }}
          >
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

          <View style={{ gap: 12 }}>
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
            <View style={{ flexDirection: "row", gap: 12 }}>
              <AdminBtn
                label="Open Studio"
                onPress={closeSheetsThenGoStudio}
                style={{ flex: 1 }}
              />
              {primaryLink && (
                <AdminBtn
                  label="Open Live"
                  onPress={handleOpenPrimaryLink}
                  style={{ flex: 1 }}
                />
              )}
            </View>
          </View>

          {!!destinations.length && (
            <View style={{ gap: 12 }}>
              <Text style={{ fontWeight: "700", color: T.textPrimary }}>
                Destinations
              </Text>
              <View style={{ gap: 12 }}>
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

          <View style={{ height: 24 }} />
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  })
);

/* ---------- Thanh công cụ quản trị (Redesigned) ---------- */
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
          "Kết thúc trận đấu",
          `Xác nhận đội ${side} chiến thắng?`,
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
          styles.card,
          {
            backgroundColor: T.cardBg,
            borderColor: T.tint,
            borderWidth: 1,
            marginTop: 16,
            ...T.shadow,
          },
        ]}
      >
        <View style={styles.cardHeader}>
          <MaterialIcons name="admin-panel-settings" size={20} color={T.tint} />
          <Text style={[styles.cardHeaderTitle, { color: T.textPrimary }]}>
            QUẢN TRỊ TRẬN ĐẤU
          </Text>
        </View>

        <View style={{ gap: 16 }}>
          <View>
            <Text style={[styles.sectionLabel, { color: T.textSecondary }]}>
              TRẠNG THÁI
            </Text>
            <SegmentedStatus
              value={status}
              onChange={(s) => onSetStatus?.(s)}
              disabled={busy}
            />
          </View>

          <View>
            <Text style={[styles.sectionLabel, { color: T.textSecondary }]}>
              TỈ SỐ & SETS
            </Text>
            {!editMode ? (
              <AdminBtn
                icon="edit"
                label="Chỉnh sửa tỉ số"
                onPress={onEnterEdit}
                disabled={busy}
              />
            ) : (
              <View style={{ gap: 8 }}>
                <View style={styles.grid2}>
                  <AdminBtn
                    icon="save"
                    label="Lưu"
                    onPress={onSave}
                    disabled={busy}
                    variant="primary"
                  />
                  <AdminBtn
                    icon="close"
                    label="Hủy"
                    onPress={onExitEdit}
                    disabled={busy}
                  />
                </View>
                <View style={styles.grid2}>
                  <AdminBtn
                    icon="add"
                    label="Thêm Set"
                    onPress={onAddSet}
                    disabled={busy}
                  />
                  <AdminBtn
                    icon="undo"
                    label="Reset"
                    onPress={onReset}
                    disabled={busy}
                  />
                </View>
              </View>
            )}
          </View>

          <View>
            <Text style={[styles.sectionLabel, { color: T.textSecondary }]}>
              KẾT QUẢ
            </Text>
            <View style={styles.grid2}>
              <AdminBtn
                icon="emoji-events"
                label="Đội A Thắng"
                onPress={() => confirmWinner("A")}
                disabled={busy}
                style={{ backgroundColor: T.success.bgSoft }}
                textStyle={{ color: T.success.text }}
              />
              <AdminBtn
                icon="emoji-events"
                label="Đội B Thắng"
                onPress={() => confirmWinner("B")}
                disabled={busy}
                style={{ backgroundColor: T.success.bgSoft }}
                textStyle={{ color: T.success.text }}
              />
            </View>
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

/* ---------- BottomSheet: MATCH RULES (Luật thi đấu) ---------- */
const RuleRow = memo(({ icon, label, value }) => {
  const T = useThemeTokens();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: T.softBg, // Đường kẻ mờ
        gap: 12,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: T.softBg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MaterialIcons name={icon} size={20} color={T.tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 11, color: T.textSecondary, marginBottom: 2 }}>
          {label}
        </Text>
        <Text style={{ fontSize: 14, fontWeight: "600", color: T.textPrimary }}>
          {value}
        </Text>
      </View>
    </View>
  );
});

const MatchRulesSheet = memo(
  forwardRef(function MatchRulesSheet({ match, timeLabel, status }, ref) {
    const T = useThemeTokens();
    const snapPoints = useMemo(() => ["50%"], []);
    const r = match?.rules || {};

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

    return (
      <BottomSheetModal
        ref={ref}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: T.pageBg }}
      >
        <BottomSheetScrollView contentContainerStyle={{ padding: 16 }}>
          <Text
            style={{
              fontSize: 18,
              fontWeight: "800",
              color: T.textPrimary,
              marginBottom: 16,
              textAlign: "center",
            }}
          >
            Thông tin trận đấu
          </Text>

          {/* Danh sách thông tin với Icon */}
          <View>
            <RuleRow
              icon="schedule"
              label="Thời gian"
              value={timeLabel || "Chưa xác định"}
            />
            <RuleRow
              icon="layers" // Icon thể hiện các set đấu
              label="Thể thức (Best Of)"
              value={`Đấu ${r.bestOf ?? 3} thắng ${Math.ceil(
                (r.bestOf ?? 3) / 2
              )}`}
            />
            <RuleRow
              icon="sports-score"
              label="Điểm thắng mỗi set"
              value={`${r.pointsToWin ?? 11} điểm`}
            />
            <RuleRow
              icon="exposure-plus-2" // Icon +2
              label="Luật cách biệt"
              value={
                r.winByTwo
                  ? "Phải thắng cách biệt 2 điểm"
                  : "Sudden Death (Điểm vàng)"
              }
            />
            {match?.liveBy?.name && (
              <RuleRow
                icon="sports" // Icon cái còi hoặc trọng tài
                label="Trọng tài điều khiển"
                value={match.liveBy.name}
              />
            )}
            <RuleRow
              icon="info-outline"
              label="Trạng thái"
              value={formatStatus(status)}
            />
          </View>
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  })
);

/* ===================== Component chính (Native) ===================== */
function MatchContent({ m, isLoading, liveLoading, onSaved }) {
  const T = useThemeTokens();
  const socket = useSocket();
  // 1. Khai báo Ref
  const rulesSheetRef = useRef(null);

  // 2. Hàm mở Sheet
  const handleOpenRules = useCallback(() => {
    rulesSheetRef.current?.present();
  }, []);
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
  const [isLiveExpanded, setLiveExpanded] = useState(true);
  const toggleLiveSection = useCallback(() => {
    setLiveExpanded((prev) => !prev);
  }, []);
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
  // 1. Logic tạo nội dung chi tiết
  const showMatchRules = useCallback(() => {
    const r = merged?.rules || {};

    // Tạo danh sách các thông tin chi tiết
    const lines = [
      `🕒 Thời gian: ${timeLabel || "Chưa có"}`,
      `🏆 Thể thức: Best of ${r.bestOf ?? 3} (Đấu ${
        r.bestOf ?? 3
      } thắng ${Math.ceil((r.bestOf ?? 3) / 2)})`,
      `🎯 Điểm thắng: ${r.pointsToWin ?? 11} điểm`,
      `⚖️ Luật cách biệt: ${
        r.winByTwo
          ? "Phải thắng cách biệt 2 điểm (+2)"
          : "Không áp dụng (Sudden Death)"
      }`,
      merged?.liveBy?.name ? `👮 Trọng tài: ${merged.liveBy.name}` : null,
      `🚩 Trạng thái: ${formatStatus(status)}`,
    ].filter(Boolean); // Lọc bỏ dòng null

    // Hiển thị Alert
    Alert.alert(
      "Chi tiết trận đấu",
      lines.join("\n\n"), // Xuống dòng cho dễ đọc
      [{ text: "Đóng", style: "cancel" }]
    );
  }, [merged, timeLabel, status]);

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
        <ActivityIndicator size="large" color={T.tint} />
      </View>
    );
  }
  if (showError) {
    return (
      <View
        style={[
          styles.card,
          {
            padding: 16,
            backgroundColor: T.cardBg,
            borderColor: T.cardBorder,
            ...T.shadow,
          },
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
        contentContainerStyle={[styles.container, { paddingBottom: 100 }]}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
      >
        <StatusBanner
          status={status}
          hasStreams={streams.length > 0}
          expanded={isLiveExpanded}
          onToggle={toggleLiveSection}
        />

        {activeStream && isLiveExpanded && (
          <View
            style={[styles.cardNoPad, { backgroundColor: "#000", ...T.shadow }]}
          >
            {activeStream.canEmbed ? (
              <>
                <StreamPlayer stream={activeStream} />
                {showPlayer && (
                  <TouchableOpacity
                    style={styles.streamLinkBtn}
                    onPress={handleOpenActiveStream}
                  >
                    <Text style={styles.streamLinkText}>
                      Mở bằng ứng dụng ngoài ↗
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <View style={{ padding: 16, alignItems: "center", gap: 12 }}>
                <Text style={{ color: "#fff" }}>
                  Video không hỗ trợ phát trực tiếp trong ứng dụng.
                </Text>
                <TouchableOpacity
                  style={[styles.btn, { backgroundColor: "#fff" }]}
                  onPress={handleOpenActiveStream}
                >
                  <Text style={{ fontWeight: "700" }}>Mở Link Gốc</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {overlayUrl && canSeeOverlay && (
          <View
            style={[
              styles.card,
              {
                backgroundColor: T.cardBg,
                borderColor: T.cardBorder,
                ...T.shadow,
              },
            ]}
          >
            <View style={styles.cardHeader}>
              <MaterialIcons name="layers" size={20} color={T.textPrimary} />
              <Text style={[styles.cardHeaderTitle, { color: T.textPrimary }]}>
                OVERLAY TỈ SỐ
              </Text>
            </View>

            <View
              style={[
                styles.inputRow,
                { backgroundColor: T.softBg2, borderColor: T.softBorder },
              ]}
            >
              <Text
                style={[styles.monoText, { color: T.textSecondary, flex: 1 }]}
                numberOfLines={1}
              >
                {overlayUrl}
              </Text>
              <TouchableOpacity onPress={handleCopyOverlay}>
                <MaterialIcons name="content-copy" size={20} color={T.tint} />
              </TouchableOpacity>
            </View>

            <View style={styles.grid2}>
              <AdminBtn
                icon="open-in-new"
                label="Mở Overlay"
                onPress={handleOpenOverlay}
              />
              {canManage && (
                <AdminBtn
                  icon="live-tv"
                  label={creatingLive ? "Đang tạo..." : "Tạo LIVE"}
                  onPress={handleCreateLive}
                  disabled={creatingLive}
                  variant="primary"
                />
              )}
            </View>
            {canManage && (
              <TouchableOpacity
                style={{ alignSelf: "center", marginTop: 8 }}
                onPress={handleOpenLiveInfo}
              >
                <Text
                  style={{
                    color: T.textSecondary,
                    fontSize: 12,
                    textDecorationLine: "underline",
                  }}
                >
                  Xem thông tin Server/Key
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* SCORE CARD (MAIN) */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: T.cardBg,
              borderColor: T.cardBorder,
              ...T.shadow,
            },
          ]}
        >
          <View style={styles.scoreHeader}>
            <Text style={[styles.cardLabel, { color: T.textSecondary }]}>
              TỈ SỐ TRẬN ĐẤU
            </Text>
            <Chip label={formatStatus(status)} />
          </View>

          <View style={styles.matchupContainer}>
            {/* TEAM A */}
            <View style={styles.teamColumn}>
              {merged?.pairA ? (
                <View style={styles.avatarsColumn}>
                  <PlayerLink
                    person={merged.pairA?.player1}
                    onOpen={openProfile}
                    serving={!!serveFlags.a1}
                  />
                  {!isSingle && (
                    <PlayerLink
                      person={merged.pairA?.player2}
                      onOpen={openProfile}
                      serving={!!serveFlags.a2}
                    />
                  )}
                </View>
              ) : (
                <Text
                  style={[styles.placeholderTeam, { color: T.textPrimary }]}
                >
                  {merged?.previousA
                    ? smartDepLabel(merged, merged.previousA)
                    : seedLabel(merged?.seedA)}
                </Text>
              )}
            </View>

            {/* BIG SCORE */}
            <View style={styles.scoreColumn}>
              <Text style={[styles.bigScore, { color: T.textPrimary }]}>
                {lastGameScore(shownGameScores).a ?? 0} -{" "}
                {lastGameScore(shownGameScores).b ?? 0}
              </Text>
              <Text style={[styles.setScore, { color: T.textSecondary }]}>
                Sets: {setsA} - {setsB}
              </Text>
            </View>

            {/* TEAM B */}
            <View style={styles.teamColumn}>
              {merged?.pairB ? (
                <View
                  style={[styles.avatarsColumn, { alignItems: "flex-end" }]}
                >
                  <PlayerLink
                    person={merged.pairB?.player1}
                    onOpen={openProfile}
                    align="right"
                    serving={!!serveFlags.b1}
                  />
                  {!isSingle && (
                    <PlayerLink
                      person={merged.pairB?.player2}
                      onOpen={openProfile}
                      align="right"
                      serving={!!serveFlags.b2}
                    />
                  )}
                </View>
              ) : (
                <Text
                  style={[
                    styles.placeholderTeam,
                    { color: T.textPrimary, textAlign: "right" },
                  ]}
                >
                  {merged?.previousB
                    ? smartDepLabel(merged, merged.previousB)
                    : seedLabel(merged?.seedB)}
                </Text>
              )}
            </View>
          </View>

          {/* GAME SCORES TABLE */}
          {(editMode || shownGameScores.length > 0) && (
            <View
              style={[
                styles.scoreTable,
                { backgroundColor: T.softBg2, borderColor: T.softBorder },
              ]}
            >
              <View style={styles.tableHeader}>
                <Text
                  style={[styles.th, { color: T.textSecondary, flex: 0.5 }]}
                >
                  SET
                </Text>
                <Text style={[styles.th, { color: T.textSecondary }]}>
                  TEAM A
                </Text>
                <Text style={[styles.th, { color: T.textSecondary }]}>
                  TEAM B
                </Text>
                {canManage && editMode && <View style={{ width: 40 }} />}
              </View>

              {(editMode ? editScores : shownGameScores).map((g, idx) => (
                <View
                  key={idx}
                  style={[styles.tableRow, { borderTopColor: T.softBorder }]}
                >
                  <Text
                    style={[styles.td, { color: T.textSecondary, flex: 0.5 }]}
                  >
                    {idx + 1}
                  </Text>

                  <View style={styles.tdCenter}>
                    {canManage && editMode ? (
                      <TextInput
                        style={[
                          styles.scoreInput,
                          {
                            color: T.textPrimary,
                            backgroundColor: T.cardBg,
                            borderColor: T.softBorder,
                          },
                        ]}
                        value={String(g?.a ?? 0)}
                        keyboardType="numeric"
                        onChangeText={(v) => setCell(idx, "a", v)}
                        maxLength={2}
                      />
                    ) : (
                      <Text
                        style={[styles.scoreCellText, { color: T.textPrimary }]}
                      >
                        {g?.a ?? 0}
                      </Text>
                    )}
                  </View>

                  <View style={styles.tdCenter}>
                    {canManage && editMode ? (
                      <TextInput
                        style={[
                          styles.scoreInput,
                          {
                            color: T.textPrimary,
                            backgroundColor: T.cardBg,
                            borderColor: T.softBorder,
                          },
                        ]}
                        value={String(g?.b ?? 0)}
                        keyboardType="numeric"
                        onChangeText={(v) => setCell(idx, "b", v)}
                        maxLength={2}
                      />
                    ) : (
                      <Text
                        style={[styles.scoreCellText, { color: T.textPrimary }]}
                      >
                        {g?.b ?? 0}
                      </Text>
                    )}
                  </View>

                  {canManage && editMode && (
                    <TouchableOpacity
                      style={styles.iconBtn}
                      onPress={() => removeSet(idx)}
                    >
                      <MaterialIcons
                        name="delete-outline"
                        size={20}
                        color={T.danger.text}
                      />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* META CHIPS */}
          {/* META CHIPS */}
          <View style={styles.metaContainer}>
            {timeLabel && <Chip label={timeLabel} onPress={handleOpenRules} />}
            <Chip
              label={`BO${merged?.rules?.bestOf ?? 3}`}
              onPress={handleOpenRules}
            />
            <Chip
              label={`Win: ${merged?.rules?.pointsToWin ?? 11}`}
              onPress={handleOpenRules}
            />

            {merged?.liveBy?.name && (
              <Chip
                label={`Trọng tài: ${merged.liveBy.name}`}
                onPress={handleOpenRules}
              />
            )}
            {merged?.rules?.winByTwo && (
              <Chip label="+2" onPress={handleOpenRules} />
            )}
          </View>
        </View>

        {/* ADMIN TOOLBAR */}
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

        <View style={{ height: 40 }} />
        <PublicProfileDialog
          open={profileOpen}
          onClose={closeProfile}
          userId={profileUserId}
        />
      </ScrollView>

      <MatchRulesSheet
        ref={rulesSheetRef}
        match={merged}
        timeLabel={timeLabel}
        status={status}
      />

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

/* ---------- Chip Component ---------- */
/* ---------- Chip Component (Updated) ---------- */
const Chip = memo(({ label, onPress }) => {
  const T = useThemeTokens();
  // Nếu có onPress thì dùng TouchableOpacity, không thì dùng View thường
  const Wrapper = onPress ? TouchableOpacity : View;

  return (
    <Wrapper
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        styles.chip,
        { backgroundColor: T.chip.bg, borderColor: T.chip.bd },
      ]}
    >
      <Text style={[styles.chipText, { color: T.chip.text }]}>{label}</Text>
    </Wrapper>
  );
});

/* ---------- Styling System (New & Improved) ---------- */
const styles = StyleSheet.create({
  container: {
    padding: 6,
    gap: 16,
  },
  centerBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  // Banner
  bannerContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    gap: 8,
  },
  bannerText: {
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },

  // Card Generic
  card: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
  },
  cardNoPad: {
    borderRadius: 16,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  cardHeaderTitle: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // Score Section
  scoreHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  matchupContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  teamColumn: {
    flex: 1,
    gap: 8,
  },
  avatarsColumn: {
    gap: 8,
  },
  scoreColumn: {
    alignItems: "center",
    paddingHorizontal: 10,
  },
  bigScore: {
    fontSize: 42,
    fontWeight: "800",
    lineHeight: 48,
    fontVariant: ["tabular-nums"],
  },
  setScore: {
    fontSize: 13,
    fontWeight: "600",
  },
  placeholderTeam: {
    fontSize: 14,
    fontWeight: "600",
    opacity: 0.7,
  },

  // Player Link
  playerLinkContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  linkText: {
    fontSize: 14,
    fontWeight: "600",
  },

  // Score Table
  scoreTable: {
    marginTop: 20,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderTopWidth: 1,
  },
  th: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },
  td: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  tdCenter: {
    flex: 1,
    alignItems: "center",
  },
  scoreCellText: {
    fontSize: 16,
    fontWeight: "700",
  },
  scoreInput: {
    width: 44,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
    padding: 0,
  },

  // Meta Chips
  metaContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 16,
    justifyContent: "center",
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 11,
    fontWeight: "700",
  },

  // Inputs & Helpers
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
    marginBottom: 10,
  },
  monoText: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 12,
  },

  // Stream
  aspectBox: {
    width: "100%",
  },
  streamLinkBtn: {
    padding: 12,
    alignItems: "flex-end",
    backgroundColor: "#111",
  },
  streamLinkText: {
    color: "#bbb",
    fontSize: 12,
    fontWeight: "600",
  },

  // Admin Controls
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  grid2: {
    flexDirection: "row",
    gap: 12,
  },
  modernBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  modernBtnText: {
    fontSize: 13,
    fontWeight: "700",
  },

  // Segment
  segmentContainer: {
    flexDirection: "row",
    padding: 4,
    borderRadius: 12,
  },
  segmentBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 10,
  },
  segmentBtnActive: {
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: "600",
  },

  iconBtn: {
    padding: 4,
  },
  // Button styles cũ (giữ lại cho tương thích nếu cần)
  btn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  btnFluid: { minWidth: 100, flex: 1 },
  btnText: { fontWeight: "600" },
  btnPrimaryText: { color: "#fff", fontWeight: "700" },
  errorText: { fontWeight: "600", textAlign: "center" },
});

/* ---------- Logic Comparators (Giữ nguyên) ---------- */
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
