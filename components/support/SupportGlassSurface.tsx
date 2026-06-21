import React from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";

import AppleLiquidGlassView from "@/components/ui/AppleLiquidGlassView";
import { IOS_26_LIQUID_GLASS_ENABLED } from "@/utils/nativeTabs";

type SupportGlassSurfaceProps = {
  active?: boolean;
  children: React.ReactNode;
  effect?: "clear" | "regular";
  isDark: boolean;
  style?: StyleProp<ViewStyle>;
  tintAlpha?: number;
  tone?: "default" | "accent" | "field";
};

function glassTint(
  isDark: boolean,
  active = false,
  alpha?: number,
  tone: SupportGlassSurfaceProps["tone"] = active ? "accent" : "default"
) {
  if (tone === "field") {
    return isDark
      ? `rgba(58, 66, 86, ${alpha ?? 0.68})`
      : `rgba(255, 255, 255, ${alpha ?? 0.82})`;
  }

  if (tone === "accent") {
    return isDark
      ? `rgba(10, 132, 255, ${alpha ?? 0.34})`
      : `rgba(255, 255, 255, ${alpha ?? 0.78})`;
  }

  return isDark
    ? `rgba(28, 30, 36, ${alpha ?? 0.62})`
    : `rgba(255, 255, 255, ${alpha ?? 0.72})`;
}

export default function SupportGlassSurface({
  active = false,
  children,
  effect = "regular",
  isDark,
  style,
  tintAlpha,
  tone,
}: SupportGlassSurfaceProps) {
  return (
    <AppleLiquidGlassView
      fallback="view"
      glassColorScheme={isDark ? "dark" : "light"}
      glassEffectStyle={effect}
      glassTintColor={glassTint(isDark, active, tintAlpha, tone)}
      isInteractive={active}
      style={[
        style,
        IOS_26_LIQUID_GLASS_ENABLED && styles.glassSurface,
        tone === "field" && IOS_26_LIQUID_GLASS_ENABLED && styles.fieldSurface,
        active && IOS_26_LIQUID_GLASS_ENABLED && styles.activeSurface,
      ]}
    >
      {children}
    </AppleLiquidGlassView>
  );
}

const styles = StyleSheet.create({
  activeSurface: {
    borderColor: "rgba(255,255,255,0.34)",
    shadowOpacity: 0.18,
  },
  fieldSurface: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.36)",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
  },
  glassSurface: {
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.24)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
  },
});
