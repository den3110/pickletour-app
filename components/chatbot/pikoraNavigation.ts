import { Platform } from "react-native";
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";

import type {
  PikoraAction,
  PikoraSessionFocus,
  PikoraSessionFocusEntity,
  PikoraUiSurface,
} from "./pikoraTypes";
import { normalizeSessionFocus } from "./pikoraUtils";

type NavigationResolution = {
  internalPath: string | null;
  externalUrl: string | null;
  degraded?: boolean;
};

type RunActionOptions = {
  currentPath: string;
  currentUrl: string;
  currentParams?: Record<string, unknown>;
  presentation: PikoraUiSurface;
  getActionHandler?: (
    key?: string | null,
  ) => ((value?: string, payload?: Record<string, unknown>, action?: PikoraAction) => unknown) | null;
  closeOverlay?: () => void;
};

function createStudioCourtPath(
  tournamentId?: string,
  bracketId?: string,
  courtId?: string,
) {
  const params = new URLSearchParams();
  if (tournamentId) params.set("tournamentId", tournamentId);
  if (bracketId) params.set("bracketId", bracketId);
  if (courtId) params.set("courtId", courtId);

  const base =
    Platform.OS === "ios"
      ? "pickletour-live://stream"
      : "/live/studio_court_android";
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

function normalizeBrowserPath(rawPath: string) {
  const path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  const url = new URL(path, "https://pickletour.local");
  const segments = url.pathname.split("/").filter(Boolean);

  if (!segments.length) {
    return "/(tabs)";
  }

  if (segments[0] === "pickle-ball" && segments[1] === "rankings") {
    return "/(tabs)/rankings";
  }

  if (segments[0] === "pickle-ball" && segments[1] === "tournaments") {
    return "/(tabs)/tournaments";
  }

  if (segments[0] === "profile") {
    return "/(tabs)/profile";
  }

  if (segments[0] === "my-tournaments") {
    return "/(tabs)/my_tournament";
  }

  if (segments[0] === "clubs" && segments[1]) {
    return `/clubs/${segments[1]}`;
  }

  if (segments[0] === "clubs") {
    return "/clubs";
  }

  if (segments[0] === "news" && segments[1]) {
    return `/news/${segments[1]}`;
  }

  if (segments[0] === "news") {
    return "/news";
  }

  if (segments[0] === "user" && segments[1]) {
    return `/profile/${segments[1]}`;
  }

  if (segments[0] === "contact") {
    return "/contact";
  }

  if (segments[0] === "levelpoint") {
    return "/levelpoint";
  }

  if (segments[0] === "login") {
    return "/login";
  }

  if (segments[0] === "register" && segments[1] === "otp") {
    return "/register";
  }

  if (segments[0] === "register") {
    return "/register";
  }

  if (segments[0] === "verify-otp") {
    return "/verify-otp";
  }

  if (segments[0] === "forgot-password") {
    return "/forgot-password";
  }

  if (segments[0] === "settings" && segments[1] === "facebook") {
    return "/settings/facebook-pages";
  }

  if (segments[0] === "settings") {
    return "/(tabs)/profile";
  }

  if (segments[0] === "admin") {
    return "/admin/home";
  }

  if (
    segments[0] === "live" &&
    segments[2] === "brackets" &&
    segments[4] === "live-studio"
  ) {
    return createStudioCourtPath(segments[1], segments[3], segments[5]);
  }

  if (segments[0] === "live") {
    return "/(tabs)/live";
  }

  if (segments[0] === "studio" && segments[1] === "live") {
    return "/live/studio";
  }

  if (segments[0] === "streaming") {
    const courtId = segments[1] || String(url.searchParams.get("courtId") || "");
    return createStudioCourtPath(
      String(url.searchParams.get("tournamentId") || ""),
      String(url.searchParams.get("bracketId") || ""),
      courtId,
    );
  }

  if (segments[0] === "tournament" && segments[1]) {
    const tournamentId = segments[1];

    if (!segments[2]) {
      return `/tournament/${tournamentId}/home`;
    }

    if (segments[2] === "overview") {
      return `/tournament/${tournamentId}/home`;
    }

    if (segments[2] === "schedule") {
      return `/tournament/${tournamentId}/schedule`;
    }

    if (segments[2] === "register") {
      return `/tournament/${tournamentId}/register`;
    }

    if (segments[2] === "checkin") {
      return `/tournament/${tournamentId}/checkin`;
    }

    if (segments[2] === "manage") {
      return `/tournament/${tournamentId}/manage`;
    }

    if (segments[2] === "referee") {
      return `/tournament/${tournamentId}/referee`;
    }

    if (segments[2] === "bracket") {
      return `/tournament/${tournamentId}/bracket`;
    }

    if (segments[2] === "draw" && segments[3] === "live") {
      const view = url.searchParams.get("view");
      return view
        ? `/tournament/${tournamentId}/draw?view=${encodeURIComponent(view)}`
        : `/tournament/${tournamentId}/draw`;
    }

    if (segments[2] === "draw") {
      const params = new URLSearchParams();
      const view = url.searchParams.get("view");
      const bracketId = url.searchParams.get("bracketId");
      if (view) params.set("view", view);
      if (bracketId) params.set("bracketId", bracketId);
      const query = params.toString();
      return query
        ? `/tournament/${tournamentId}/draw?${query}`
        : `/tournament/${tournamentId}/draw`;
    }

    if (segments[2] === "brackets" && segments[3] && segments[4] === "draw") {
      return `/tournament/${tournamentId}/draw?bracketId=${encodeURIComponent(
        segments[3],
      )}`;
    }
  }

  if (segments[0] === "bracket" && segments[1]) {
    return `/tournament/${segments[1]}/bracket`;
  }

  if (segments[0] === "schedule" && segments[1]) {
    return `/tournament/${segments[1]}/schedule`;
  }

  return url.pathname + (url.search || "");
}

function normalizeCustomScheme(rawValue: string) {
  const withoutScheme = rawValue.replace(/^pickletour(app)?:\/\//i, "");
  const path = withoutScheme.startsWith("/") ? withoutScheme : `/${withoutScheme}`;
  return normalizeBrowserPath(path);
}

function isExpoDevelopmentClientLink(rawValue: string) {
  try {
    const parsed = Linking.parse(rawValue);
    const hostname = String(parsed.hostname || "").toLowerCase();
    const path = String(parsed.path || "").toLowerCase();
    return hostname === "expo-development-client" || path === "expo-development-client";
  } catch {
    return false;
  }
}

function createResolutionFromPath(path: string): NavigationResolution {
  if (/^pickletour-live:\/\//i.test(path)) {
    return { internalPath: null, externalUrl: path };
  }

  return { internalPath: path, externalUrl: null };
}

function normalizeExpoDevLink(rawValue: string) {
  try {
    const parsed = Linking.parse(rawValue);
    const rawPath = String(parsed.path || "").replace(/^\/+/, "");
    const normalizedPath = rawPath.replace(/^--\/?/, "");

    if (!normalizedPath) {
      return null;
    }

    const params = new URLSearchParams();
    Object.entries(parsed.queryParams || {}).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((item) => {
          if (item != null) params.append(key, String(item));
        });
        return;
      }

      if (value != null) {
        params.set(key, String(value));
      }
    });

    const query = params.toString();
    const nextPath = `/${normalizedPath}${query ? `?${query}` : ""}`;
    return normalizeBrowserPath(nextPath);
  } catch {
    return null;
  }
}

export function resolvePikoraNavigationTarget(
  target?: string | null,
): NavigationResolution {
  const value = String(target || "").trim();
  if (!value) {
    return { internalPath: null, externalUrl: null };
  }

  if (/^pickletour(app)?:\/\//i.test(value)) {
    if (isExpoDevelopmentClientLink(value)) {
      return { internalPath: null, externalUrl: null };
    }

    return createResolutionFromPath(normalizeCustomScheme(value));
  }

  if (/^pickletour-live:\/\//i.test(value)) {
    return {
      internalPath: null,
      externalUrl: value,
    };
  }

  if (/^exp(s)?:\/\//i.test(value)) {
    return {
      internalPath: normalizeExpoDevLink(value),
      externalUrl: null,
    };
  }

  if (/^https?:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      if (/(^|\.)pickletour\.vn$/i.test(parsed.hostname)) {
        return createResolutionFromPath(
          normalizeBrowserPath(
            `${parsed.pathname}${parsed.search}${parsed.hash}`,
          ),
        );
      }
    } catch {
      return { internalPath: null, externalUrl: value };
    }

    return { internalPath: null, externalUrl: value };
  }

  return createResolutionFromPath(normalizeBrowserPath(value));
}

async function openResolvedTarget(
  target: string,
  presentation: PikoraUiSurface,
  closeOverlay?: () => void,
) {
  const resolved = resolvePikoraNavigationTarget(target);

  if (resolved.internalPath) {
    if (presentation === "overlay") {
      closeOverlay?.();
    }
    router.push(resolved.internalPath as any);
    return {
      status: resolved.degraded ? "degraded" : "executed",
      detail: resolved.internalPath,
    };
  }

  if (resolved.externalUrl) {
    if (presentation === "overlay") {
      closeOverlay?.();
    }
    await Linking.openURL(resolved.externalUrl);
    return { status: "executed", detail: resolved.externalUrl };
  }

  throw new Error("Hành động này chưa được hỗ trợ trên mobile.");
}

function buildNextQueryPath(currentPath: string, key: string, value: string) {
  const parsed = new URL(
    currentPath.startsWith("/") ? currentPath : `/${currentPath}`,
    "https://pickletour.local",
  );
  if (value) {
    parsed.searchParams.set(key, value);
  } else {
    parsed.searchParams.delete(key);
  }
  const query = parsed.searchParams.toString();
  return `${parsed.pathname}${query ? `?${query}` : ""}`;
}

function buildSessionFocusLabel(sessionFocus?: PikoraSessionFocus | null) {
  const normalized = normalizeSessionFocus(sessionFocus);
  if (!normalized?.activeType) return "";
  const entity = normalized[normalized.activeType] as PikoraSessionFocusEntity | null;
  return entity?.label || "";
}

export async function runPikoraAction(
  action: PikoraAction,
  options: RunActionOptions,
) {
  const payload =
    action?.payload && typeof action.payload === "object"
      ? (action.payload as Record<string, unknown>)
      : {};
  const handlerKey =
    String(payload.handlerKey || action?.type || "").trim() || null;
  const handler = options.getActionHandler?.(handlerKey);

  switch (String(action?.type || "").trim()) {
    case "navigate":
    case "open_new_tab": {
      const target =
        action?.path ||
        String(payload.path || payload.url || action?.value || payload.value || "");
      if (!target) {
        throw new Error("Thiếu đích điều hướng.");
      }
      return openResolvedTarget(String(target), options.presentation, options.closeOverlay);
    }
    case "copy_link": {
      const target =
        action?.path ||
        String(payload.path || payload.url || action?.value || payload.value || "") ||
        options.currentUrl;
      if (!target) {
        throw new Error("Thiếu liên kết để sao chép.");
      }
      await Clipboard.setStringAsync(String(target));
      return { status: "executed", detail: String(target) };
    }
    case "copy_current_url": {
      await Clipboard.setStringAsync(options.currentUrl);
      return { status: "executed", detail: options.currentUrl };
    }
    case "copy_text": {
      const text = String(action?.value || payload.value || "");
      if (!text) {
        throw new Error("Thiếu nội dung để sao chép.");
      }
      await Clipboard.setStringAsync(text);
      return { status: "executed", detail: text.slice(0, 48) };
    }
    case "set_query_param": {
      const key = String(payload.key || "").trim();
      if (!key) {
        throw new Error("Thiếu khóa query.");
      }
      const nextPath = buildNextQueryPath(
        options.currentPath,
        key,
        String(payload.value || ""),
      );
      if (options.presentation === "overlay") {
        options.closeOverlay?.();
      }
      router.replace(nextPath as any);
      return { status: "executed", detail: nextPath };
    }
    case "session_focus_pin": {
      return {
        status: "executed",
        detail: buildSessionFocusLabel(payload.sessionFocus as PikoraSessionFocus),
      };
    }
    case "focus_element":
    case "prefill_text":
    case "set_page_state":
    case "scroll_to_section":
    case "open_dialog": {
      if (typeof handler === "function") {
        await handler(
          String(payload.value || action?.value || ""),
          payload,
          action,
        );
        return { status: "executed", detail: handlerKey || action.type };
      }

      const target = String(payload.path || payload.url || action?.path || "");
      if (target) {
        const result = await openResolvedTarget(
          target,
          options.presentation,
          options.closeOverlay,
        );
        return { status: "degraded", detail: result.detail };
      }

      throw new Error("Màn hình hiện tại chưa hỗ trợ thao tác này.");
    }
    default:
      throw new Error("Hành động này chưa được hỗ trợ trên mobile.");
  }
}
