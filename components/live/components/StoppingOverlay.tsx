// components/StoppingOverlay.tsx
import React, { useRef, useEffect } from "react";
import {
  requireNativeComponent,
  ViewStyle,
  StyleSheet,
  Platform,
  UIManager,
  View,
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

(UIManager as any).getViewManagerConfig?.(COMPONENT_NAME);
const _CachedCountdownOverlay =
  (global as any).__CountdownOverlayView ||
  requireNativeComponent<NativeCountdownOverlayProps>(COMPONENT_NAME);
(global as any).__CountdownOverlayView = _CachedCountdownOverlay;
NativeCountdownOverlay = _CachedCountdownOverlay;

function StoppingOverlay({ durationMs, safeBottom, onDone, onCancel }: Props) {
  const onDoneRef = useRef(onDone);
  const onCancelRef = useRef(onCancel);
  const mountedRef = useRef(false);

  useEffect(() => {
    onDoneRef.current = onDone;
    onCancelRef.current = onCancel;
  }, [onDone, onCancel]);

  useEffect(() => {
    // ✅ Log để debug
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  if (!NativeCountdownOverlay) {
    return null;
  }

  // ✅ Wrapper callbacks để đảm bảo chỉ gọi 1 lần
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
    <View
      style={[
        StyleSheet.absoluteFillObject,
        {
          // ✅ luôn nổi lên trên mọi thứ khác
          zIndex: 9999,
          elevation: Platform.OS === "android" ? 9999 : 0,
        },
      ]}
      // ✅ RẤT QUAN TRỌNG: phải cho phép nhận touch
      pointerEvents="auto"
    >
      <NativeCountdownOverlay
        mode="stopping"
        durationMs={durationMs}
        safeBottom={safeBottom}
        onDone={handleDone}
        onCancel={handleCancel}
        style={styles.overlay}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
});

export default React.memo(StoppingOverlay);
