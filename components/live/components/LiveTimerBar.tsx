// components/LiveTimerBar.tsx
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

// ✅ CACHE Native Component - Giống pattern RtmpPreviewView
const COMPONENT_NAME = "LiveTimerView";
let NativeLiveTimerView: any = null;

if (Platform.OS === "android") {
  (UIManager as any).getViewManagerConfig?.(COMPONENT_NAME);
  const _CachedLiveTimerView =
    (global as any).__LiveTimerView ||
    requireNativeComponent<NativeLiveTimerViewProps>(COMPONENT_NAME);
  (global as any).__LiveTimerView = _CachedLiveTimerView;
  NativeLiveTimerView = _CachedLiveTimerView;
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

  // ✅ Fallback cho iOS hoặc khi native component chưa sẵn sàng
  if (Platform.OS !== "android" || !NativeLiveTimerView) {
    return (
      <View
        style={[
          styles.wrap,
          {
            top: safeTop + 8,
            left: safeLeft + 60,
            right: safeRight + 60,
          },
        ]}
        pointerEvents="none"
      >
        <View style={styles.badge}>
          <View style={styles.dot} />
          <Text style={styles.text}>00:00</Text>
        </View>
      </View>
    );
  }

  return (
    <NativeLiveTimerView
      startTimeMs={liveStartAt}
      style={[
        styles.wrap,
        {
          top: safeTop + 8,
          left: safeLeft + 60,
          right: safeRight + 60,
        },
      ]}
      pointerEvents="none"
    />
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    alignSelf: "center",
  },
  // Fallback styles
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#17C964",
    marginRight: 6,
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
