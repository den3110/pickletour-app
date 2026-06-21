import React from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { BlurView, type BlurViewProps } from "expo-blur";
import { GlassView, type GlassViewProps } from "expo-glass-effect";

import { IOS_26_LIQUID_GLASS_ENABLED } from "@/utils/nativeTabs";

type AppleLiquidGlassViewProps = BlurViewProps & {
  glassEffectStyle?: GlassViewProps["glassEffectStyle"];
  glassTintColor?: GlassViewProps["tintColor"];
  glassColorScheme?: GlassViewProps["colorScheme"];
  isInteractive?: GlassViewProps["isInteractive"];
  fallback?: "blur" | "view";
};

export default function AppleLiquidGlassView({
  blurMethod,
  blurReductionFactor,
  blurTarget,
  experimentalBlurMethod,
  fallback = "blur",
  glassColorScheme = "auto",
  glassEffectStyle = "regular",
  glassTintColor,
  intensity = 50,
  isInteractive = false,
  tint = "default",
  ...viewProps
}: AppleLiquidGlassViewProps) {
  if (IOS_26_LIQUID_GLASS_ENABLED) {
    const flattenedStyle = StyleSheet.flatten(viewProps.style) as
      | ViewStyle
      | undefined;
    const { backgroundColor, ...glassStyle } = flattenedStyle ?? {};
    const inferredTintColor =
      typeof backgroundColor === "string" ? backgroundColor : undefined;

    return (
      <GlassView
        {...viewProps}
        colorScheme={glassColorScheme}
        glassEffectStyle={glassEffectStyle}
        isInteractive={isInteractive}
        style={glassStyle}
        tintColor={glassTintColor ?? inferredTintColor}
      />
    );
  }

  if (fallback === "view") {
    return <View {...viewProps} />;
  }

  return (
    <BlurView
      {...viewProps}
      blurMethod={blurMethod}
      blurReductionFactor={blurReductionFactor}
      blurTarget={blurTarget}
      experimentalBlurMethod={experimentalBlurMethod}
      intensity={intensity}
      tint={tint}
    />
  );
}
