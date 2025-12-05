import React from "react";
import { requireNativeComponent, StyleProp, ViewStyle } from "react-native";

type Props = {
  style?: StyleProp<ViewStyle>;
  position?: "TOP_LEFT" | "TOP_RIGHT" | "BOTTOM_LEFT" | "BOTTOM_RIGHT";
  alpha?: number;
};

const NativeStreamStatsOverlay =
  requireNativeComponent<Props>("StreamStatsOverlayView");

export const StreamStatsOverlayNativeView: React.FC<Props> = (props) => {
  return <NativeStreamStatsOverlay {...props} />;
};
