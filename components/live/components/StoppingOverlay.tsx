// components/StoppingOverlay.tsx
import React, { useRef, useEffect, useState } from "react";
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
  isRunning: boolean; // ✅ THÊM: Cần thiết để kích hoạt animation trên iOS
  onDone: () => void;
  onCancel: () => void;
  style?: ViewStyle;
}

const COMPONENT_NAME = "CountdownOverlayView";
let NativeCountdownOverlay: any = null;

// ✅ SỬA: Load native component cho cả 2 nền tảng
try {
  if (Platform.OS === 'android') {
    if ((UIManager as any).getViewManagerConfig?.(COMPONENT_NAME)) {
      NativeCountdownOverlay = requireNativeComponent<NativeCountdownOverlayProps>(COMPONENT_NAME);
    }
  } else {
    // iOS không cần check UIManager, cứ require là được
    NativeCountdownOverlay = requireNativeComponent<NativeCountdownOverlayProps>(COMPONENT_NAME);
  }
} catch (e) {
  console.warn("CountdownOverlayView not found:", e);
}

function StoppingOverlay({ durationMs, safeBottom, onDone, onCancel }: Props) {
  const onDoneRef = useRef(onDone);
  const onCancelRef = useRef(onCancel);
  const mountedRef = useRef(false);
  
  // ✅ THÊM: State để kích hoạt animation
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    onDoneRef.current = onDone;
    onCancelRef.current = onCancel;
  }, [onDone, onCancel]);

  useEffect(() => {
    mountedRef.current = true;

    // ✅ THÊM: Delay nhỏ để đảm bảo native view đã mount rồi mới start timer
    const timer = setTimeout(() => {
      if (mountedRef.current) {
        setIsRunning(true);
      }
    }, 100);

    return () => {
      mountedRef.current = false;
      clearTimeout(timer);
    };
  }, []);

  // ✅ SỬA: Bỏ chặn iOS, chỉ return null nếu không tìm thấy native module
  if (!NativeCountdownOverlay) {
    return null;
  }

  const handleDone = () => {
    if (!mountedRef.current) {
      return;
    }
    onDoneRef.current();
  };

  const handleCancel = () => {
    if (!mountedRef.current) {
      return;
    }
    onCancelRef.current();
  };

  return (
    <NativeCountdownOverlay
      mode="stopping"
      durationMs={durationMs}
      safeBottom={safeBottom}
      isRunning={isRunning} // ✅ Truyền prop này xuống
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