import { getLiveMatchCourtText } from "./courtDisplay";

export function sid(value: any) {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }
  return String(value?._id || value?.id || "").trim();
}

export function timeAgo(date?: string | number | Date | null) {
  if (!date) return "";
  const stamp = new Date(date).getTime();
  if (!Number.isFinite(stamp)) return "";
  const diff = Math.max(0, Date.now() - stamp);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s trước`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m trước`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h trước`;
  const day = Math.floor(hr / 24);
  return `${day}d trước`;
}

export function hostOf(url?: string | null) {
  try {
    return new URL(String(url || "")).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function isFinishedLikeStatus(status?: string | null) {
  return ["finished", "ended", "stopped"].includes(
    String(status || "")
      .trim()
      .toLowerCase()
  );
}

export function getLiveStatusLabel(status?: string | null) {
  const statusMap: Record<string, string> = {
    scheduled: "Đã lên lịch",
    queued: "Chờ thi đấu",
    assigned: "Đã gán sân",
    live: "Đang phát",
    finished: "Đã kết thúc",
    ended: "Đã kết thúc",
    paused: "Tạm dừng",
    canceled: "Đã hủy",
    cancelled: "Đã hủy",
  };

  return statusMap[String(status || "").toLowerCase()] || String(status || "-");
}

export function getLiveTeamLine(match: any = {}) {
  const teamA = match?.pairA?.name || "Đội A";
  const teamB = match?.pairB?.name || "Đội B";
  return `${teamA} vs ${teamB}`;
}

export function getLiveMatchTitle(match: any = {}) {
  return (
    match?.displayCode ||
    match?.code ||
    match?.labelKey ||
    match?.globalCode ||
    "Trận đấu"
  );
}

export function getLiveMatchSubtitle(match: any = {}) {
  const tournament = String(match?.tournament?.name || "").trim();
  const teamLine = getLiveTeamLine(match);
  if (tournament) return `${teamLine} • ${tournament}`;
  return teamLine;
}

export function buildFacebookPluginUrl(watchUrl?: string | null) {
  if (!watchUrl) return null;
  return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(
    watchUrl
  )}&show_text=0&width=560&autoplay=1&mute=0`;
}

export function buildCanonicalSessions(match: any = {}) {
  const defaultStreamKey =
    typeof match?.defaultStreamKey === "string" ? match.defaultStreamKey : "";
  const streams = Array.isArray(match?.streams) ? match.streams : [];

  return streams
    .filter(
      (stream) =>
        stream &&
        typeof stream === "object" &&
        (typeof stream?.playUrl === "string" || typeof stream?.openUrl === "string")
    )
    .sort((a, b) => Number(a?.priority || 99) - Number(b?.priority || 99))
    .map((stream) => {
      const playUrl =
        typeof stream?.playUrl === "string" ? stream.playUrl.trim() : "";
      const openUrl =
        typeof stream?.openUrl === "string" ? stream.openUrl.trim() : "";
      const embedHtml =
        typeof stream?.embedHtml === "string" ? stream.embedHtml.trim() : "";
      const explicitEmbedUrl =
        typeof stream?.embedUrl === "string" ? stream.embedUrl.trim() : "";
      const url = playUrl || openUrl;
      const kind = String(stream?.kind || "")
        .trim()
        .toLowerCase();
      const primary =
        (defaultStreamKey && String(stream?.key || "") === defaultStreamKey) ||
        Boolean(stream?.primary);
      if (!url) return null;

      if (kind === "iframe_html" && embedHtml) {
        return {
          key: stream?.key || "server1",
          provider: "facebook",
          kind: "iframe_html",
          label: stream?.displayLabel || "Server 1",
          providerLabel: stream?.providerLabel || "Facebook",
          watchUrl: openUrl || url,
          openUrl: openUrl || url,
          embedHtml,
          canInlineEmbed: true,
          primary,
          ready: stream?.ready !== false,
          delaySeconds: Number(stream?.delaySeconds || 0),
        };
      }

      if (kind === "facebook") {
        return {
          key: stream?.key || "server1",
          provider: "facebook",
          kind: "iframe",
          label: stream?.displayLabel || "Server 1",
          providerLabel: stream?.providerLabel || "Facebook",
          watchUrl: openUrl || url,
          openUrl: openUrl || url,
          pluginUrl: explicitEmbedUrl || buildFacebookPluginUrl(url),
          canInlineEmbed: true,
          primary,
          ready: stream?.ready !== false,
          delaySeconds: Number(stream?.delaySeconds || 0),
        };
      }

      if (kind === "file" || kind === "hls") {
        return {
          key: stream?.key || kind || "stream",
          provider: kind,
          kind,
          label: stream?.displayLabel || "Video",
          providerLabel: stream?.providerLabel || "PickleTour",
          watchUrl: openUrl || url,
          openUrl: openUrl || url,
          directUrl: playUrl || url,
          canInlineEmbed: true,
          primary,
          ready: stream?.ready !== false,
          delaySeconds: Number(stream?.delaySeconds || 0),
        };
      }

      if (kind === "delayed_manifest") {
        return {
          key: stream?.key || "server2",
          provider: "server2",
          kind,
          label: stream?.displayLabel || "Server 2",
          providerLabel: stream?.providerLabel || "PickleTour CDN",
          watchUrl: openUrl || "",
          openUrl: openUrl || "",
          directUrl: url,
          manifestUrl: url,
          canInlineEmbed: true,
          primary,
          ready: stream?.ready !== false,
          delaySeconds: Number(stream?.delaySeconds || 0),
          disabledReason:
            typeof stream?.disabledReason === "string"
              ? stream.disabledReason
              : "",
        };
      }

      return {
        key: stream?.key || "stream",
        provider: kind || "stream",
        kind,
        label: stream?.displayLabel || "Stream",
        providerLabel: stream?.providerLabel || "Stream",
        watchUrl: openUrl || url,
        openUrl: openUrl || url,
        directUrl: playUrl || url,
        canInlineEmbed: true,
        primary,
        ready: stream?.ready !== false,
        delaySeconds: Number(stream?.delaySeconds || 0),
      };
    })
    .filter(Boolean);
}

export function getLiveSessions(match: any = {}) {
  const canonicalSessions = buildCanonicalSessions(match);
  if (canonicalSessions.length > 0) return canonicalSessions;

  const fb = match?.facebookLive || {};
  const baseWatchUrl =
    fb.video_permalink_url ||
    fb.permalink_url ||
    fb.watch_url ||
    fb.embed_url ||
    (fb.videoId ? `https://www.facebook.com/watch/?v=${fb.videoId}` : "") ||
    (fb.id ? `https://www.facebook.com/watch/?v=${fb.id}` : "");

  if (!baseWatchUrl) return [];

  return [
    {
      key: "server1",
      provider: "facebook",
      kind: fb.embed_html ? "iframe_html" : "iframe",
      label: "Server 1",
      providerLabel: "Facebook",
      watchUrl: baseWatchUrl,
      openUrl: baseWatchUrl,
      pluginUrl: fb.embed_url || buildFacebookPluginUrl(baseWatchUrl),
      embedHtml: fb.embed_html || "",
      canInlineEmbed: true,
      primary: true,
      ready: true,
      delaySeconds: 0,
    },
  ];
}

export function getPreferredLiveSession(match: any = {}, sessionsArg?: any[]) {
  const sessions = Array.isArray(sessionsArg) ? sessionsArg : getLiveSessions(match);
  const finishedLike =
    isFinishedLikeStatus(match?.status) ||
    isFinishedLikeStatus(match?.facebookLive?.status);
  const readyServer2 =
    sessions.find((session) => session?.key === "server2" && session?.ready !== false) ||
    null;

  return (
    (finishedLike && readyServer2) ||
    sessions.find((session) => session?.primary && session?.ready !== false) ||
    sessions.find((session) => session?.ready !== false) ||
    sessions[0] ||
    null
  );
}

export function buildStationSearchText(station: any = {}) {
  return [
    station?.name,
    station?.code,
    station?.cluster?.name,
    station?.currentMatch?.code,
    station?.currentMatch?.displayCode,
    station?.currentMatch?.tournament?.name,
    getLiveTeamLine(station?.currentMatch),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function mergeUniqueMatches(currentItems: any[] = [], nextItems: any[] = []) {
  const seen = new Set<string>();
  const merged: any[] = [];

  [...currentItems, ...nextItems].forEach((item) => {
    const key = sid(item?._id || item?.matchId || item?.id);
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push(item);
  });

  return merged;
}

export function groupMatchesByTournament(items: any[] = []) {
  const map = new Map();

  items.forEach((item) => {
    const tournamentKey = sid(item?.tournament?._id || item?.tournament?.name || "unknown");
    const current =
      map.get(tournamentKey) || {
        key: tournamentKey,
        tournament: item?.tournament || { name: "Không rõ giải" },
        items: [],
      };

    current.items.push(item);
    map.set(tournamentKey, current);
  });

  return Array.from(map.values());
}

export function buildLiveInfoMatch(match: any = {}) {
  return {
    ...match,
    courtLabel: getLiveMatchCourtText(match) || match?.courtLabel || "",
  };
}
