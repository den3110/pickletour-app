// components/StoppingOverlay.tsx
import React, { useRef, useEffect } from "react";
import {
  requireNativeComponent,
  ViewStyle,
  StyleSheet,
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

// 👉 Không check UIManager, không try/catch, không fallback RN
const NativeCountdownOverlay =
  requireNativeComponent<NativeCountdownOverlayProps>(COMPONENT_NAME);

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
