// components/GapWarningOverlay.tsx
import React, { useEffect, useState } from "react";
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

interface NativeCountdownOverlayProps {
  mode: "stopping" | "gap";
  durationMs: number;
  safeBottom: number;
  isRunning: boolean;
  onDone: () => void;
  onCancel: () => void;
  style?: ViewStyle;
}

const COMPONENT_NAME = "CountdownOverlayView";

// ✅ SỬA: Load component cho cả Android và iOS
let NativeCountdownOverlay: any = null;

try {
  // Android cần check config view manager
  if (Platform.OS === 'android') {
    if ((UIManager as any).getViewManagerConfig?.(COMPONENT_NAME)) {
      NativeCountdownOverlay = requireNativeComponent<NativeCountdownOverlayProps>(COMPONENT_NAME);
    }
  } else {
    // iOS cứ require thẳng, nếu native chưa link nó sẽ báo lỗi đỏ (dễ debug hơn là ẩn đi)
    NativeCountdownOverlay = requireNativeComponent<NativeCountdownOverlayProps>(COMPONENT_NAME);
  }
} catch (e) {
  console.warn("CountdownOverlayView not found:", e);
}

function GapWarningOverlay({ durationMs, safeBottom, onDone, onCancel }: Props) {
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    // Delay nhỏ để đảm bảo view native đã mount xong trước khi start animation
    const timer = setTimeout(() => {
      setIsRunning(true);
    }, 100);
    
    return () => {
      clearTimeout(timer);
      setIsRunning(false);
    };
  }, []);

  // ✅ SỬA: Bỏ điều kiện chặn iOS
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