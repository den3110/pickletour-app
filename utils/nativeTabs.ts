import { Platform } from "react-native";
import {
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from "expo-glass-effect";

function getIosMajorVersion() {
  if (Platform.OS !== "ios") return 0;

  const rawVersion = Platform.Version;
  if (typeof rawVersion === "number" && Number.isFinite(rawVersion)) {
    return Math.trunc(rawVersion);
  }

  const major = String(rawVersion || "")
    .trim()
    .match(/^\d+/)?.[0];

  return major ? Number(major) : 0;
}

export const IOS_PLATFORM_MAJOR_VERSION = getIosMajorVersion();

function getIos26LiquidGlassEnabled() {
  if (Platform.OS !== "ios" || IOS_PLATFORM_MAJOR_VERSION < 26) {
    return false;
  }

  try {
    return isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  } catch {
    return false;
  }
}

export const IOS_26_LIQUID_GLASS_ENABLED = getIos26LiquidGlassEnabled();

export const IOS_26_NATIVE_TABS_ENABLED = IOS_26_LIQUID_GLASS_ENABLED;

type AuxiliaryRouteName = "chat" | "profile" | "my_tournament";

const AUXILIARY_MORE_ROUTES: Record<AuxiliaryRouteName, string> = {
  chat: "/more/chat",
  profile: "/more/profile",
  my_tournament: "/more/my_tournament",
};

const normalizePathname = (value?: string | null) => {
  const raw = String(value || "").trim();
  if (!raw) return "/";
  if (raw === "/") return "/";
  return raw.replace(/\/+$/, "") || "/";
};

export function resolveAuxiliaryTabPath(routeName: AuxiliaryRouteName) {
  return IOS_26_NATIVE_TABS_ENABLED
    ? AUXILIARY_MORE_ROUTES[routeName]
    : `/${routeName}`;
}

export function normalizeAppRoutePath(rawPath?: string | null) {
  const raw = String(rawPath || "").trim();
  if (!raw) return "/";

  const nextUrl = new URL(
    raw.startsWith("/") ? raw : `/${raw}`,
    "https://pickletour.local",
  );

  let pathname = normalizePathname(nextUrl.pathname);

  if (
    pathname === "/(tabs)" ||
    pathname === "/(tabs)/index" ||
    pathname === "/index"
  ) {
    pathname = "/";
  } else if (pathname.startsWith("/(tabs)/")) {
    pathname = normalizePathname(pathname.slice("/(tabs)".length));
  }

  if (pathname === "/profile") {
    pathname = resolveAuxiliaryTabPath("profile");
  } else if (pathname === "/chat") {
    pathname = resolveAuxiliaryTabPath("chat");
  } else if (pathname === "/my_tournament") {
    pathname = resolveAuxiliaryTabPath("my_tournament");
  }

  return `${pathname}${nextUrl.search}${nextUrl.hash}`;
}
