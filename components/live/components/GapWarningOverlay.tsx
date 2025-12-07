// components/GapWarningOverlay.tsx
import React, { useEffect, useState } from "react";
import {
  requireNativeComponent,
  ViewStyle,
  StyleSheet,
  Platform,
  UIManager,
} from "react-native";

type Props = {
  durationMs: number;
  safeBottom: number;
  onDone: () => void;
  onCancel: () => void;
};

interface NativeCountdownOverlayProps {
  mode: "stopping" | "gap";
  durationMs: number;
  safeBottom: number;
  isRunning: boolean;
  onDone: () => void;
  onCancel: () => void;
  style?: ViewStyle;
}

// ✅ DÙNG CÙNG CACHED COMPONENT
const COMPONENT_NAME = "CountdownOverlayView";
let NativeCountdownOverlay: any = null;

(UIManager as any).getViewManagerConfig?.(COMPONENT_NAME);
const _CachedCountdownOverlay =
  (global as any).__CountdownOverlayView ||
  requireNativeComponent<NativeCountdownOverlayProps>(COMPONENT_NAME);
(global as any).__CountdownOverlayView = _CachedCountdownOverlay;
NativeCountdownOverlay = _CachedCountdownOverlay;

function GapWarningOverlay({
  durationMs,
  safeBottom,
  onDone,
  onCancel,
}: Props) {
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsRunning(true);
    }, 50);

    return () => {
      clearTimeout(timer);
      setIsRunning(false);
    };
  }, []);

  if (!NativeCountdownOverlay) {
    return null;
  }

  return (
    <NativeCountdownOverlay
      mode="gap"
      durationMs={durationMs}
      safeBottom={safeBottom}
      isRunning={isRunning}
      onDone={onDone}
      onCancel={onCancel}
      style={styles.overlay}
    />
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
});

export default React.memo(GapWarningOverlay);
