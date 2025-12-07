// components/StoppingOverlay.tsx
import React, { useRef, useEffect } from "react";
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
  onDone: () => void;
  onCancel: () => void;
  style?: ViewStyle;
}

const COMPONENT_NAME = "CountdownOverlayView";
let NativeCountdownOverlay: any = null;

// ✅ FIX 1: Load native component cho cả Android và iOS
try {
  if (Platform.OS === "android") {
    // Android cần check ViewManagerConfig để tránh crash nếu module chưa link
    if ((UIManager as any).getViewManagerConfig?.(COMPONENT_NAME)) {
      NativeCountdownOverlay = requireNativeComponent<NativeCountdownOverlayProps>(COMPONENT_NAME);
    }
  } else {
    // iOS: require trực tiếp
    NativeCountdownOverlay = requireNativeComponent<NativeCountdownOverlayProps>(COMPONENT_NAME);
  }
} catch (e) {
  console.warn("CountdownOverlayView not found:", e);
}

function StoppingOverlay({ durationMs, safeBottom, onDone, onCancel }: Props) {
  const onDoneRef = useRef(onDone);
  const onCancelRef = useRef(onCancel);
  const mountedRef = useRef(false);

  useEffect(() => {
    onDoneRef.current = onDone;
    onCancelRef.current = onCancel;
  }, [onDone, onCancel]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ✅ FIX 2: Bỏ điều kiện chặn iOS. Chỉ return null nếu không tìm thấy Native Module.
  if (!NativeCountdownOverlay) {
    return null;
  }

  // Wrapper callbacks để đảm bảo an toàn khi component unmount
  const handleDone = () => {
    if (!mountedRef.current) return;
    onDoneRef.current();
  };

  const handleCancel = () => {
    if (!mountedRef.current) return;
    onCancelRef.current();
  };

  return (
    <NativeCountdownOverlay
      mode="stopping"
      durationMs={durationMs}
      safeBottom={safeBottom}
      onDone={handleDone}
      onCancel={handleCancel}
      style={styles.overlay}
    />
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
});

export default React.memo(StoppingOverlay);