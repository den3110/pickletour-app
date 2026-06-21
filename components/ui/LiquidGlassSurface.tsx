import React from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";

import AppleLiquidGlassView from "@/components/ui/AppleLiquidGlassView";
import { IOS_26_LIQUID_GLASS_ENABLED } from "@/utils/nativeTabs";

type LiquidGlassTone = "default" | "accent" | "field" | "danger";

type LiquidGlassSurfaceProps = {
  active?: boolean;
  children: React.ReactNode;
  effect?: "clear" | "regular";
  fallback?: "blur" | "view";
  isDark: boolean;
  style?: StyleProp<ViewStyle>;
  tintAlpha?: number;
  tone?: LiquidGlassTone;
};

function glassTint(
  isDark: boolean,
  tone: LiquidGlassTone,
  active: boolean,
  alpha?: number
) {
  if (tone === "field") {
    return isDark
      ? `rgba(45, 52, 70, ${alpha ?? 0.68})`
      : `rgba(255, 255, 255, ${alpha ?? 0.82})`;
  }

  if (tone === "accent" || active) {
    return isDark
      ? `rgba(10, 132, 255, ${alpha ?? 0.34})`
      : `rgba(255, 255, 255, ${alpha ?? 0.78})`;
  }

  if (tone === "danger") {
    return isDark
      ? `rgba(80, 24, 32, ${alpha ?? 0.56})`
      : `rgba(255, 245, 246, ${alpha ?? 0.82})`;
  }

  return isDark
    ? `rgba(24, 27, 34, ${alpha ?? 0.62})`
    : `rgba(255, 255, 255, ${alpha ?? 0.74})`;
}

export default function LiquidGlassSurface({
  active = false,
  children,
  effect = "regular",
  fallback = "view",
  isDark,
  style,
  tintAlpha,
  tone = active ? "accent" : "default",
}: LiquidGlassSurfaceProps) {
  return (
    <AppleLiquidGlassView
      fallback={fallback}
      glassColorScheme={isDark ? "dark" : "light"}
      glassEffectStyle={effect}
      glassTintColor={glassTint(isDark, tone, active, tintAlpha)}
      isInteractive={active}
      style={[
        IOS_26_LIQUID_GLASS_ENABLED && styles.surface,
        tone === "field" && IOS_26_LIQUID_GLASS_ENABLED && styles.field,
        active && IOS_26_LIQUID_GLASS_ENABLED && styles.active,
        style,
      ]}
    >
      {children}
    </AppleLiquidGlassView>
  );
}

const styles = StyleSheet.create({
  active: {
    borderColor: "rgba(255,255,255,0.34)",
    shadowOpacity: 0.18,
  },
  field: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.36)",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
  },
  surface: {
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.24)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
  },
});
