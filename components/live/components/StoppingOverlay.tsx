// components/GapWarningOverlay.tsx (Hoặc StoppingOverlay.tsx)
import React from "react";
import { 
  requireNativeComponent, 
  ViewStyle, 
  StyleSheet, 
  Platform, 
  UIManager 
} from "react-native";

type Props = {
  durationMs: number;
  safeBottom: number;
  onDone: () => void;
  onCancel: () => void;
};

// Interface bỏ isRunning
interface NativeCountdownOverlayProps {
  mode: "stopping" | "gap";
  durationMs: number;
  safeBottom: number;
  onDone: () => void;
  onCancel: () => void;
  style?: ViewStyle;
}

const COMPONENT_NAME = "CountdownOverlayView";
let NativeCountdownOverlay: any = null;

try {
  if (Platform.OS === 'android') {
    if ((UIManager as any).getViewManagerConfig?.(COMPONENT_NAME)) {
      NativeCountdownOverlay = requireNativeComponent<NativeCountdownOverlayProps>(COMPONENT_NAME);
    }
  } else {
    // iOS
    NativeCountdownOverlay = requireNativeComponent<NativeCountdownOverlayProps>(COMPONENT_NAME);
  }
} catch (e) {
  console.warn("CountdownOverlayView not found:", e);
}

// ✅ Component gọn nhẹ, Native tự chạy khi render
function GapWarningOverlay({ durationMs, safeBottom, onDone, onCancel }: Props) {
  if (!NativeCountdownOverlay) return null;

  return (
    <NativeCountdownOverlay
      mode="gap" // hoặc "stopping" bên file kia
      durationMs={durationMs}
      safeBottom={safeBottom}
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