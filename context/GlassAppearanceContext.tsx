import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { IOS_26_LIQUID_GLASS_ENABLED } from "@/utils/nativeTabs";

export const LIQUID_GLASS_HIGHLIGHT_PREF_KEY =
  "pickletour:liquid-glass-highlight-enabled";

type GlassAppearanceContextValue = {
  isLiquidGlassAvailable: boolean;
  isLiquidGlassEnabled: boolean;
  isPreferenceLoaded: boolean;
  liquidGlassPreferenceEnabled: boolean;
  setLiquidGlassPreferenceEnabled: (enabled: boolean) => Promise<void>;
};

const fallbackValue: GlassAppearanceContextValue = {
  isLiquidGlassAvailable: IOS_26_LIQUID_GLASS_ENABLED,
  // Default OFF: "Giao diện nổi bật" (Liquid Glass) only turns on when the
  // user explicitly enables it in Profile settings.
  isLiquidGlassEnabled: false,
  isPreferenceLoaded: false,
  liquidGlassPreferenceEnabled: false,
  setLiquidGlassPreferenceEnabled: async () => {},
};

const GlassAppearanceContext =
  createContext<GlassAppearanceContextValue>(fallbackValue);

export function GlassAppearanceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isPreferenceLoaded, setIsPreferenceLoaded] = useState(false);
  // Default OFF — only stored "1" (user explicitly enabled) turns it on.
  const [liquidGlassPreferenceEnabled, setPreferenceEnabled] = useState(false);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(LIQUID_GLASS_HIGHLIGHT_PREF_KEY)
      .then((stored) => {
        if (!mounted) return;
        setPreferenceEnabled(stored === "1");
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setIsPreferenceLoaded(true);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const setLiquidGlassPreferenceEnabled = useCallback(async (enabled: boolean) => {
    setPreferenceEnabled(enabled);
    await AsyncStorage.setItem(
      LIQUID_GLASS_HIGHLIGHT_PREF_KEY,
      enabled ? "1" : "0",
    );
  }, []);

  const value = useMemo(
    () => ({
      isLiquidGlassAvailable: IOS_26_LIQUID_GLASS_ENABLED,
      isLiquidGlassEnabled:
        IOS_26_LIQUID_GLASS_ENABLED && liquidGlassPreferenceEnabled,
      isPreferenceLoaded,
      liquidGlassPreferenceEnabled,
      setLiquidGlassPreferenceEnabled,
    }),
    [
      isPreferenceLoaded,
      liquidGlassPreferenceEnabled,
      setLiquidGlassPreferenceEnabled,
    ],
  );

  return (
    <GlassAppearanceContext.Provider value={value}>
      {children}
    </GlassAppearanceContext.Provider>
  );
}

export function useLiquidGlassPreference() {
  return useContext(GlassAppearanceContext);
}

export function useLiquidGlassEnabled() {
  return useContext(GlassAppearanceContext).isLiquidGlassEnabled;
}
