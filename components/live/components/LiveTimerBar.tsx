// ========== THAY THẾ TOÀN BỘ FILE components/LiveTimerBar.tsx ==========

import React from "react";
import {
  requireNativeComponent,
  ViewStyle,
  StyleSheet,
  Platform,
  UIManager,
  View,
  Text,
} from "react-native";

type Mode = "idle" | "live" | "stopping" | "ended";

type Props = {
  mode: Mode;
  liveStartAt: number | null;
  safeTop: number;
  safeLeft: number;
  safeRight: number;
};

interface NativeLiveTimerViewProps {
  startTimeMs: number;
  style?: ViewStyle;
}

const COMPONENT_NAME = "LiveTimerView";
let NativeLiveTimerView: any = null;

if (Platform.OS === "android") {
  try {
    (UIManager as any).getViewManagerConfig?.(COMPONENT_NAME);
    const _CachedLiveTimerView =
      (global as any).__LiveTimerView ||
      requireNativeComponent<NativeLiveTimerViewProps>(COMPONENT_NAME);
    (global as any).__LiveTimerView = _CachedLiveTimerView;
    NativeLiveTimerView = _CachedLiveTimerView;
  } catch (e) {
    console.warn("LiveTimerView not available:", e);
  }
}

const LiveTimerBar: React.FC<Props> = ({
  mode,
  liveStartAt,
  safeTop,
  safeLeft,
  safeRight,
}) => {
  if (!liveStartAt || (mode !== "live" && mode !== "stopping")) {
    return null;
  }

  // ✅ Native component for Android
  if (Platform.OS === "android" && NativeLiveTimerView) {
    return (
      <View
        style={[
          styles.container,
          {
            top: safeTop + 8, // ✅ Sát trên hơn
            left: safeLeft,
            right: safeRight,
          },
        ]}
      >
        <NativeLiveTimerView
          startTimeMs={liveStartAt}
          style={styles.timerView}
        />
      </View>
    );
  }

  // ✅ Fallback for iOS
  return (
    <View
      style={[
        styles.container,
        {
          top: safeTop + 8,
          left: safeLeft,
          right: safeRight,
        },
      ]}
    >
      <View style={styles.fallbackBadge}>
        <View style={styles.dot} />
        <Text style={styles.text}>LIVE</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    flexDirection: "row",
    justifyContent: "center", // ✅ CENTER horizontally
    alignItems: "center",
    zIndex: 10,
  },
  timerView: {
    alignSelf: "center",
  },
  fallbackBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#17C964",
    marginRight: 8,
  },
  text: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },
});

export default React.memo(
  LiveTimerBar,
  (prev, next) =>
    prev.mode === next.mode &&
    prev.liveStartAt === next.liveStartAt &&
    prev.safeTop === next.safeTop
);
