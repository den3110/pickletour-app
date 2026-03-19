import React from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type HotUpdateModalStatus = "downloading" | "done" | "error";

type Props = {
  visible: boolean;
  progress: number;
  status: HotUpdateModalStatus;
  message?: string | null;
  onClose?: () => void;
  isDark?: boolean;
  accentColor?: string;
};

const { width } = Dimensions.get("window");

const clampProgress = (value: number) => Math.max(0, Math.min(1, value || 0));

export default function HotUpdateModal({
  visible,
  progress,
  status,
  message,
  onClose,
  isDark = false,
  accentColor = isDark ? "#A78BFA" : "#8B5CF6",
}: Props) {
  const progressAnim = React.useRef(new Animated.Value(0)).current;
  const [trackWidth, setTrackWidth] = React.useState(0);
  const [animatedPct, setAnimatedPct] = React.useState(0);

  const normalizedProgress = clampProgress(progress);
  const isDownloading = status === "downloading";
  const isDone = status === "done";
  const isError = status === "error";

  React.useEffect(() => {
    const listenerId = progressAnim.addListener(({ value }) => {
      const next = Math.max(0, Math.min(100, Math.round(value * 100)));
      setAnimatedPct((prev) => (prev === next ? prev : next));
    });

    return () => {
      progressAnim.removeListener(listenerId);
    };
  }, [progressAnim]);

  React.useEffect(() => {
    if (!visible) {
      progressAnim.stopAnimation();
      progressAnim.setValue(0);
      setAnimatedPct(0);
      return;
    }

    Animated.timing(progressAnim, {
      toValue: normalizedProgress,
      duration: isDownloading ? 380 : 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [isDownloading, normalizedProgress, progressAnim, visible]);

  const animatedWidth =
    trackWidth > 0
      ? progressAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, trackWidth],
          extrapolate: "clamp",
        })
      : 0;

  const title = isDone ? "Cập nhật hoàn tất" : "Cập nhật ứng dụng";
  const statusText = isDownloading
    ? "Đang tải bản cập nhật..."
    : isDone
    ? "Hoàn tất"
    : "Lỗi cập nhật";

  const resolvedMessage =
    message ||
    (isDownloading
      ? "Đang tải bản cập nhật mới."
      : isDone
      ? "Bản cập nhật đã tải xong. Đang mở lại ứng dụng..."
      : "Không thể tải bản cập nhật. Vui lòng thử lại sau.");

  const colors = {
    overlay: "rgba(0,0,0,0.6)",
    card: isDark ? "#171717" : "#ffffff",
    title: isDark ? "#f5f5f5" : "#1a1a1a",
    subtitle: isDark ? "#a3a3a3" : "#666666",
    status: isDark ? "#d4d4d4" : "#444444",
    border: isDark ? "#2a2a2a" : "#e5e7eb",
    progressTrack: isDark ? "#2f2f2f" : "#e5e7eb",
    secondaryButton: isDark ? "#262626" : "#f3f4f6",
    secondaryButtonText: isDark ? "#f5f5f5" : "#444444",
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <View
          style={[
            styles.container,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={[styles.title, { color: colors.title }]}>{title}</Text>

          <Text style={[styles.message, { color: colors.subtitle }]}>
            {resolvedMessage}
          </Text>

          {isDownloading && (
            <View style={styles.progressWrap}>
              <View
                style={[
                  styles.progressBg,
                  { backgroundColor: colors.progressTrack },
                ]}
                onLayout={(event) => {
                  const nextWidth = event.nativeEvent.layout.width;
                  setTrackWidth((prev) => (prev === nextWidth ? prev : nextWidth));
                }}
              >
                <Animated.View
                  style={[
                    styles.progressFillWrap,
                    {
                      width: animatedWidth,
                      opacity: animatedPct === 0 ? 0 : 1,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.progressFill,
                      { backgroundColor: accentColor },
                    ]}
                  />
                </Animated.View>
              </View>
              <Text style={[styles.progressText, { color: accentColor }]}>
                {animatedPct}%
              </Text>
            </View>
          )}

          <View style={styles.statusWrap}>
            {isDownloading && <ActivityIndicator size="small" color={accentColor} />}
            <Text style={[styles.statusText, { color: colors.status }]}>
              {statusText}
            </Text>
          </View>

          {isError && (
            <TouchableOpacity
              style={[styles.btnSecondary, { backgroundColor: colors.secondaryButton }]}
              onPress={onClose}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.btnSecondaryText,
                  { color: colors.secondaryButtonText },
                ]}
              >
                Đóng
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    width: width * 0.85,
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 18,
  },
  progressWrap: {
    width: "100%",
    marginBottom: 16,
  },
  progressBg: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFillWrap: {
    height: "100%",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    width: "100%",
    height: "100%",
    borderRadius: 4,
  },
  progressText: {
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 8,
  },
  statusWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusText: {
    fontSize: 15,
  },
  btnSecondary: {
    marginTop: 20,
    minWidth: 120,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 10,
    alignItems: "center",
  },
  btnSecondaryText: {
    fontSize: 16,
    fontWeight: "600",
  },
});
