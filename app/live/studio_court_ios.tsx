// app/live/studio_court.ios.tsx
import React, { useMemo } from "react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Platform, View, Text } from "react-native";

// ✅ Import component cho iOS
import LiveLikeFBScreenKey from "@/components/live/LiveLikeFBScreenKey";

/* helpers */
function toBool(v: any, def = false) {
  if (v == null) return def;
  const s = String(v).trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(s);
}

function toStr(v: any, def = "") {
  return (v == null ? def : String(v)).trim();
}

function safeAtobUtf8(b64: string) {
  try {
    return decodeURIComponent(escape(globalAtob(b64)));
  } catch {
    try {
      return globalAtob(b64);
    } catch {}
  }
  return "";
}

const globalAtob =
  typeof atob !== "undefined"
    ? atob
    : (b64: string) =>
        Buffer.from(
          b64.replace(/-/g, "+").replace(/_/g, "/"),
          "base64"
        ).toString("binary");

function splitRtmpUrl(url?: string) {
  const u = (url || "").trim().replace(/\/$/, "");
  if (!u || !/^rtmps?:\/\//i.test(u)) return { server_url: "", stream_key: "" };
  const idx = u.lastIndexOf("/");
  if (idx < 0) return { server_url: u, stream_key: "" };
  return { server_url: u.slice(0, idx), stream_key: u.slice(idx + 1) };
}

type Dest = {
  platform?: string;
  server_url?: string;
  stream_key?: string;
  secure_stream_url?: string;
};

function normalizeDest(d: any): Dest {
  const platform = String(d?.platform || "").toLowerCase() || "facebook";
  let server_url = d?.server_url || "";
  let stream_key = d?.stream_key || "";
  const secure_stream_url = d?.secure_stream_url || "";
  if ((!server_url || !stream_key) && secure_stream_url) {
    const s = splitRtmpUrl(secure_stream_url);
    server_url = server_url || s.server_url;
    stream_key = stream_key || s.stream_key;
  }
  return { platform, server_url, stream_key, secure_stream_url };
}

export default function StudioCourtIOSPage() {
  const router = useRouter();
  const p = useLocalSearchParams<{
    tid?: string;
    bid?: string;
    courtId?: string;

    autoOnLive?: string;
    autoCreateIfMissing?: string;

    tournamentHref?: string;
    homeHref?: string;

    useFullUrl?: string;
    fullUrl?: string;
    server?: string;
    key?: string;

    d64?: string;
  }>();

  /* required ids */
  const tid = toStr(p.tid);
  const bid = toStr(p.bid);
  const courtId = toStr(p.courtId);

  /* options */
  const autoOnLive = toBool(p.autoOnLive, true);
  const autoCreateIfMissing = toBool(p.autoCreateIfMissing, false);

  const tournamentHref = toStr(p.tournamentHref);
  const homeHref = toStr(p.homeHref);

  /* prefill from query directly */
  let initialUseFullUrl =
    p.useFullUrl != null ? toBool(p.useFullUrl, true) : undefined;
  let initialFullUrl = toStr(p.fullUrl);
  let initialServer = toStr(p.server);
  let initialStreamKey = toStr(p.key);

  /* prefill from d64 if missing */
  if (!initialFullUrl && !initialServer && !initialStreamKey && p.d64) {
    try {
      const decoded = safeAtobUtf8(String(p.d64));
      const arr = JSON.parse(decoded);
      if (Array.isArray(arr) && arr.length) {
        const dests = arr.map(normalizeDest);
        const fb = dests.find((d) => d.platform === "facebook") || dests[0];
        if (fb) {
          if (fb.secure_stream_url) {
            initialUseFullUrl = initialUseFullUrl ?? true;
            initialFullUrl = initialFullUrl || fb.secure_stream_url;
          } else if (fb.server_url && fb.stream_key) {
            initialUseFullUrl = initialUseFullUrl ?? false;
            initialServer = initialServer || fb.server_url;
            initialStreamKey = initialStreamKey || fb.stream_key;
          }
        }
      }
    } catch {}
  }

  /* if still undefined, deduce mode by fields */
  if (initialUseFullUrl === undefined) {
    if (initialFullUrl) initialUseFullUrl = true;
    else if (initialServer && initialStreamKey) initialUseFullUrl = false;
    else initialUseFullUrl = true;
  }

  const title = useMemo(
    () => `Live Studio (iOS) — Court ${courtId ? courtId.slice(-4) : ""}`,
    [courtId]
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
          title,
        }}
      />
      <LiveLikeFBScreenKey
        // AUTO-LIVE (RTK Query bên trong component)
        tid={tid}
        bid={bid}
        courtId={courtId}
        autoOnLive={autoOnLive}
        autoCreateIfMissing={autoCreateIfMissing}
        
        // Prefill phát
        initialUseFullUrl={initialUseFullUrl}
        initialFullUrl={initialFullUrl}
        initialServer={initialServer}
        initialStreamKey={initialStreamKey}
        
        // Điều hướng khi kết thúc
        tournamentHref={tournamentHref || `/tournament/${tid}/manage`}
        homeHref={homeHref || "/"}
        onFinishedGoToTournament={() =>
          router.replace(tournamentHref || `/tournament/${tid}/manage`)
        }
        onFinishedGoHome={() => router.replace(homeHref || "/")}
      />
    </>
  );
}