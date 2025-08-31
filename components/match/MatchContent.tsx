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
} from "react-native";
import { useSelector } from "react-redux";
import { WebView } from "react-native-webview";
import { Video } from "expo-av";
import * as Clipboard from "expo-clipboard";

// import { depLabel, seedLabel, nameWithNick } from "../TournamentBracket";
import PublicProfileDialog from "../PublicProfileDialog";

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

export const nameWithNick = (p) => {
  if (!p) return "—";
  const nm = preferName(p);
  const nk = preferNick(p);
  if (!nk) return nm;
  return nm.toLowerCase() === nk.toLowerCase() ? nm : `${nm} (${nk})`;
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

/* ===================== PlayerLink (không cắt …) ===================== */
function PlayerLink({ person, onOpen, align = "left" }) {
  if (!person) return null;
  const uid =
    person?.user?._id ||
    person?.user?.id ||
    person?.user ||
    person?._id ||
    person?.id ||
    null;

  const handlePress = () => {
    if (!uid) return;
    onOpen?.(uid);
  };

  return (
    <Text
      onPress={handlePress}
      style={[styles.linkText, align === "right" && { textAlign: "right" }]}
    >
      {nameWithNick(person)}
    </Text>
  );
}

/* ===================== Hooks: chống nháy & tiện ích ===================== */
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
function useThrottledStable(
  value,
  { interval = 280, isEqual = (a, b) => a === b } = {}
) {
  const [display, setDisplay] = useState(value ?? null);
  const latestRef = useRef(value);
  const timerRef = useRef(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    latestRef.current = value;
    if (!mountedRef.current) {
      mountedRef.current = true;
      setDisplay(value ?? null);
      return;
    }
    if (isEqual(value, display)) return;
    if (timerRef.current) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setDisplay(latestRef.current ?? null);
    }, interval);
  }, [value, display, interval, isEqual]);

  useEffect(() => () => timerRef.current && clearTimeout(timerRef.current), []);
  return display;
}
function useShowAfterFetch(m, loading) {
  const [display, setDisplay] = useState(null);
  const shownIdRef = useRef(null);
  const selectedId = m?._id ?? null;

  useEffect(() => {
    if (loading) {
      if (selectedId !== shownIdRef.current) setDisplay(null);
      return;
    }
    setDisplay(m ?? null);
    shownIdRef.current = selectedId;
  }, [selectedId, loading, m]);

  const waitingNewSelection =
    loading || (selectedId && selectedId !== shownIdRef.current);
  return [display, waitingNewSelection];
}

/* ===================== Time helpers & compare ===================== */
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

/* ===================== Stream detect & normalize ===================== */
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
  for (const [label, val] of singles) {
    if (isNonEmptyString(val)) pushUrl(val, { label });
  }

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

/* ===================== AspectBox (RN) ===================== */
function AspectBox({ ratio = 16 / 9, children }) {
  return (
    <View style={[styles.aspectBox, { aspectRatio: ratio }]}>{children}</View>
  );
}

/* ===================== StreamPlayer (RN) ===================== */
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

/* ===================== Banner trạng thái ===================== */
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

/* ===================== Component chính ===================== */
export default function MatchContent({ m, isLoading, liveLoading }) {
  const { userInfo } = useSelector((s) => s.auth || {});
  const roleStr = String(userInfo?.role || "").toLowerCase();
  const roles = new Set(
    [...(userInfo?.roles || []), ...(userInfo?.permissions || [])]
      .filter(Boolean)
      .map((x) => String(x).toLowerCase())
  );

  const isAdmin = !!(
    userInfo?.isAdmin ||
    roleStr === "admin" ||
    roles.has("admin") ||
    roles.has("superadmin") ||
    roles.has("tournament:admin")
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

  const managerIds = new Set(
    [
      ...(tour?.managers || []),
      ...(tour?.organizers || []),
      ...(tour?.staff || []),
      ...(tour?.moderators || []),
    ]
      .map((u) =>
        typeof u === "string"
          ? u
          : u?._id || u?.id || u?.userId || u?.uid || u?.email
      )
      .filter(Boolean)
  );

  const canManageFlag =
    m?.permissions?.canManage ||
    tour?.permissions?.canManage ||
    userInfo?.permissions?.includes?.("tournament:manage");

  const isManager = !!(
    tour &&
    (managerIds.has(
      userInfo?._id || userInfo?.id || userInfo?.userId || userInfo?.uid
    ) ||
      ownerId ===
        (userInfo?._id || userInfo?.id || userInfo?.userId || userInfo?.uid) ||
      canManageFlag)
  );

  const canSeeOverlay = isAdmin || isManager;

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

  const loading = Boolean(isLoading || liveLoading);
  const [baseMatch, waitingNewSelection] = useShowAfterFetch(m, loading);
  const showSpinnerDelayed = useDelayedFlag(waitingNewSelection, 250);
  const mm = useThrottledStable(baseMatch, {
    interval: 280,
    isEqual: isMatchEqual,
  });

  // Streams & chọn stream
  const streams = useMemo(() => normalizeStreams(mm || {}), [mm]);
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
  }, [mm?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeStream =
    activeIdx >= 0 && activeIdx < streams.length ? streams[activeIdx] : null;

  // Status & time
  const status = mm?.status || "scheduled";
  const displayTime = toDateSafe(pickDisplayTime(mm));
  const timeLabel =
    displayTime && status !== "finished"
      ? `Giờ đấu: ${formatClock(displayTime)}`
      : displayTime && status === "finished"
      ? `Bắt đầu: ${formatClock(displayTime)}`
      : null;

  // helper nhỏ: lấy chuỗi nếu là string & non-empty
  const asStr = (v) => (typeof v === "string" ? v.trim() : "");

  // helper: thử bốc url từ object config
  const pickUrlFromObj = (o) =>
    asStr(o?.url) ||
    asStr(o?.link) ||
    asStr(o?.href) ||
    asStr(o?.pageUrl) ||
    asStr(o?.webUrl) ||
    "";

  // ---- thay cho block overlay cũ ----
  const overlayCfg =
    (mm?.overlay && typeof mm.overlay === "object" ? mm.overlay : null) ||
    (mm?.meta?.overlay && typeof mm.meta.overlay === "object"
      ? mm.meta.overlay
      : null);

  // overlayUrl
  const overlayUrl =
    asStr(mm?.overlayUrl) ||
    asStr(mm?.meta?.overlayUrl) ||
    pickUrlFromObj(overlayCfg) ||
    "";

  // Render states
  const showSpinner = waitingNewSelection && showSpinnerDelayed;
  const showError = !waitingNewSelection && !baseMatch;

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
  if (!mm) return <View style={{ paddingVertical: 8 }} />;

  const isSingle = String(mm?.tournament?.eventType).toLowerCase() === "single";

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Banner trạng thái */}
      <StatusBanner status={status} hasStreams={streams.length > 0} />

      {/* Khu video: đúng 2 nút theo yêu cầu */}
      {activeStream && (
        <View style={{ gap: 8 }}>
          <View style={styles.rowWrap}>
            {activeStream.canEmbed && (
              <TouchableOpacity
                style={[
                  styles.btn,
                  showPlayer ? styles.btnPrimary : styles.btnOutline,
                ]}
                onPress={() => setShowPlayer((v) => !v)}
              >
                <Text
                  style={showPlayer ? styles.btnPrimaryText : styles.btnText}
                >
                  ▶ {showPlayer ? "Thu gọn video" : "Xem video trong nền"}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.btn, styles.btnOutline]}
              onPress={() => Linking.openURL(activeStream.url)}
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
            <View style={[styles.overlayBox]}>
              <Text style={styles.monoText}>{overlayUrl}</Text>
            </View>
            <View style={styles.row}>
              <TouchableOpacity
                style={[styles.btn, styles.btnOutline]}
                onPress={async () => {
                  try {
                    await Clipboard.setStringAsync(overlayUrl);
                  } catch (e) {}
                }}
              >
                <Text style={styles.btnText}>Copy link</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary]}
                onPress={() => Linking.openURL(overlayUrl)}
              >
                <Text style={styles.btnPrimaryText}>Mở overlay</Text>
              </TouchableOpacity>
            </View>
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
            {mm?.pairA ? (
              <View style={styles.teamWrap}>
                <PlayerLink person={mm.pairA?.player1} onOpen={openProfile} />
                {!isSingle && mm.pairA?.player2 && (
                  <>
                    <Text style={styles.andText}> & </Text>
                    <PlayerLink
                      person={mm.pairA.player2}
                      onOpen={openProfile}
                    />
                  </>
                )}
              </View>
            ) : (
              <Text style={styles.teamText}>
                {mm?.previousA ? depLabel(mm.previousA) : seedLabel(mm?.seedA)}
              </Text>
            )}
          </View>

          {/* Điểm hiện tại */}
          <View style={{ minWidth: 140, alignItems: "center" }}>
            {mm?.status === "live" && (
              <Text style={styles.mutedSmall}>Ván hiện tại</Text>
            )}
            <Text style={styles.bigScore}>
              {lastGameScore(mm?.gameScores).a} –{" "}
              {lastGameScore(mm?.gameScores).b}
            </Text>
            <Text style={styles.muted}>
              Sets: {countGamesWon(mm?.gameScores).A} –{" "}
              {countGamesWon(mm?.gameScores).B}
            </Text>
          </View>

          {/* Đội B */}
          <View style={{ flex: 1, paddingLeft: 8 }}>
            <Text style={[styles.muted, { textAlign: "right" }]}>Đội B</Text>
            {mm?.pairB ? (
              <View style={styles.teamWrapRight}>
                <PlayerLink
                  person={mm.pairB?.player1}
                  onOpen={openProfile}
                  align="right"
                />
                {!isSingle && mm.pairB?.player2 && (
                  <>
                    <Text style={[styles.andText, { textAlign: "right" }]}>
                      {"  &  "}
                    </Text>
                    <PlayerLink
                      person={mm.pairB.player2}
                      onOpen={openProfile}
                      align="right"
                    />
                  </>
                )}
              </View>
            ) : (
              <Text style={[styles.teamText, { textAlign: "right" }]}>
                {mm?.previousB ? depLabel(mm.previousB) : seedLabel(mm?.seedB)}
              </Text>
            )}
          </View>
        </View>

        {/* Bảng set điểm */}
        {!!mm?.gameScores?.length && (
          <View style={{ marginTop: 12 }}>
            <View style={[styles.tableRow, styles.tableHeader]}>
              <Text style={[styles.tableCell, { flex: 1 }]}>Set</Text>
              <Text style={[styles.tableCell, styles.centerCell]}>A</Text>
              <Text style={[styles.tableCell, styles.centerCell]}>B</Text>
            </View>
            {mm.gameScores.map((g, idx) => (
              <View key={idx} style={styles.tableRow}>
                <Text style={[styles.tableCell, { flex: 1 }]}>{idx + 1}</Text>
                <Text style={[styles.tableCell, styles.centerCell]}>
                  {g.a ?? 0}
                </Text>
                <Text style={[styles.tableCell, styles.centerCell]}>
                  {g.b ?? 0}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Chips */}
        <View style={styles.chipsWrap}>
          {timeLabel && <Chip label={timeLabel} />}
          <Chip label={`BO: ${mm.rules?.bestOf ?? 3}`} />
          <Chip label={`Điểm thắng: ${mm.rules?.pointsToWin ?? 11}`} />
          {mm.rules?.winByTwo && <Chip label="Phải chênh 2" />}
          {mm.referee?.name && <Chip label={`Trọng tài: ${mm.referee.name}`} />}
        </View>
      </View>

      {/* Popup hồ sơ VĐV (giữ nguyên import) */}
      <PublicProfileDialog
        open={profileOpen}
        onClose={closeProfile}
        userId={profileUserId}
      />
    </ScrollView>
  );
}

/* ===================== Chip nhỏ ===================== */
function Chip({ label }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}

/* ===================== Styles ===================== */
const styles = StyleSheet.create({
  container: {
    padding: 12,
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
    // Hiển thị đầy đủ, cho phép xuống dòng
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
  bannerLive: {
    backgroundColor: "#e3f2fd",
  },
  bannerInfo: {
    backgroundColor: "#f1f5f9",
  },
  bannerText: {
    color: "#0f172a",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 12,
    gap: 8,
  },
  cardTitle: {
    fontWeight: "700",
    fontSize: 16,
    marginBottom: 4,
  },
  monoText: {
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
  },
  overlayBox: {
    flex: 1,
    minHeight: 40,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingHorizontal: 10,
    justifyContent: "center",
    backgroundColor: "#f9fafb",
    marginRight: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  btn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  btnOutline: {
    backgroundColor: "#fff",
    borderColor: "#cbd5e1",
  },
  btnText: {
    color: "#0f172a",
  },
  btnPrimary: {
    backgroundColor: "#1976d2",
    borderColor: "#1976d2",
  },
  btnPrimaryText: {
    color: "#fff",
    fontWeight: "700",
  },
  muted: {
    color: "#64748b",
  },
  mutedSmall: {
    color: "#64748b",
    fontSize: 12,
  },
  teamText: {
    fontSize: 16,
    fontWeight: "700",
  },
  bigScore: {
    fontSize: 28,
    fontWeight: "800",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  tableHeader: {
    backgroundColor: "#f8fafc",
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  tableCell: {
    flex: 1,
    fontSize: 14,
  },
  centerCell: {
    textAlign: "center",
  },
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#eef2ff",
    borderWidth: 1,
    borderColor: "#c7d2fe",
  },
  chipText: {
    fontSize: 12,
    color: "#3730a3",
  },
  aspectBox: {
    width: "100%",
    backgroundColor: "#000",
    borderRadius: 10,
    overflow: "hidden",
  },
  errorText: {
    color: "#b91c1c",
    fontWeight: "600",
  },
});
