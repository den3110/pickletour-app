import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Dimensions,
} from "react-native";
import { MaterialCommunityIcons as Icon } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StreamStatsOverlayNativeView } from "./StreamStatsOverlayView.native"; // 👈 chỉnh path nếu khác

interface NetworkStatsBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  isRecording?: boolean;
}

const SHEET_HEIGHT = 380;
const { height: SCREEN_HEIGHT } = Dimensions.get("window");

export const NetworkStatsBottomSheet: React.FC<
  NetworkStatsBottomSheetProps
> = ({ visible, onClose, isRecording = false }) => {
  const insets = useSafeAreaInsets();
  const safeTop = insets.top ?? 0;
  const safeBottom = insets.bottom ?? 0;
  const safeLeft = insets.left ?? 0;
  const safeRight = insets.right ?? 0;
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  // Animation mở/đóng sheet
  useEffect(() => {
    Animated.spring(translateY, {
      toValue: visible ? 0 : SCREEN_HEIGHT,
      useNativeDriver: true,
      damping: 20,
      stiffness: 90,
    }).start();
  }, [visible, translateY]);

  if (!visible) return null;

  return (
    <View style={[styles.container, {top: safeTop, left: safeLeft, right: safeRight, bottom: safeBottom}]} pointerEvents="box-none">
      {/* Backdrop */}
      <Pressable style={styles.backdrop} onPress={onClose} activeOpacity={1} />

      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheet,
          {
            paddingBottom: insets.bottom + 16,
            transform: [{ translateY }],
          },
        ]}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Icon name="chart-line" size={24} color="#4ade80" />
            <Text style={styles.title}>Network Statistics</Text>
          </View>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Icon name="close" size={24} color="#fff" />
          </Pressable>
        </View>

        {/* Content */}
        <View style={styles.content}>
          {/* ✅ Cục native hiển thị stats (dùng timer + updateStats nội bộ) */}
          <View style={styles.overlayCard}>
            <StreamStatsOverlayNativeView
              style={styles.overlayNative}
              position="TOP_LEFT" // hoặc TOP_LEFT/BOTTOM_LEFT/BOTTOM_RIGHT
              alpha={0.9}
            />
          </View>

          {/* Status Indicators */}
          <View style={styles.statusRow}>
            {isRecording && (
              <View style={styles.statusBadge}>
                <View style={styles.recordingDot} />
                <Text style={styles.statusText}>Recording</Text>
              </View>
            )}
          </View>

          <Text style={styles.infoText}>
            Stats hiển thị trực tiếp từ native • cập nhật mỗi giây
          </Text>
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  sheet: {
    backgroundColor: "#1a1a1a",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    maxHeight: SHEET_HEIGHT,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  title: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  overlayCard: {
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#000",
    height: 220, // tuỳ chỉnh
    marginBottom: 16,
  },
  overlayNative: {
    width: "100%",
    height: "100%",
  },
  statusRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
    flexWrap: "wrap",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(74, 222, 128, 0.2)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
  },
  recordingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#ef4444",
  },
  statusText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  infoText: {
    color: "#6b7280",
    fontSize: 11,
    textAlign: "center",
    marginTop: 12,
    fontStyle: "italic",
  },
});
