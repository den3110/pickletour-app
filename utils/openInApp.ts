// src/utils/openInApp.ts
import { router } from "expo-router";

export type OpenInAppOptions = {
  title?: string;
  incognito?: boolean;
};

export function sanitizeUrl(u: string) {
  if (!u) return "about:blank";
  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(u);
  if (!hasScheme) return `https://${u}`;
  return u;
}

/** Gọi ở bất kỳ đâu để mở trình duyệt trong app */
export function openInApp(url: string, opts: OpenInAppOptions = {}) {
  const safe = sanitizeUrl(url);
  router.push({
    pathname: "/browser",
    params: {
      url: encodeURIComponent(safe),
      title: opts.title || "",
      incognito: opts.incognito ? "1" : "0",
    },
  });
}
