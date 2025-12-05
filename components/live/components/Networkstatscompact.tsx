import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Dimensions,
  NativeModules,
  NativeEventEmitter,
} from "react-native";
import { MaterialCommunityIcons as Icon } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { FacebookLiveModule } = NativeModules;

interface NetworkStats {
  uploadSpeedMbps: number;
  downloadSpeedMbps: number;
  totalUploadMB: number;
  totalDownloadMB: number;
  durationSeconds: number;
  networkType?: string;
  isFinal: boolean;
}

interface NetworkStatsCompactProps {
  visible: boolean;
  onClose: () => void;
  isRecording?: boolean;
}

const SHEET_HEIGHT = 260;
const { height: SCREEN_HEIGHT } = Dimensions.get("window");

export const NetworkStatsCompact: React.FC<NetworkStatsCompactProps> = ({
  visible,
  onClose,
  isRecording = false,
}) => {
  const insets = useSafeAreaInsets();
  const [stats, setStats] = useState<NetworkStats | null>(null);
  const [translateY] = useState(new Animated.Value(SCREEN_HEIGHT));

  useEffect(() => {
    Animated.spring(translateY, {
      toValue: visible ? 0 : SCREEN_HEIGHT,
      useNativeDriver: true,
      damping: 20,
      stiffness: 90,
    }).start();
  }, [visible, translateY]);

  useEffect(() => {
    if (!visible) return;

    const eventEmitter = new NativeEventEmitter(FacebookLiveModule);
    const subscription = eventEmitter.addListener(
      "onNetworkStatsUpdate",
      (data: NetworkStats) => setStats(data)
    );

    const loadInitialStats = async () => {
      try {
        const initialStats = await FacebookLiveModule.getNetworkStats();
        if (initialStats.streaming) setStats(initialStats);
      } catch (e) {
        console.log("Failed to load initial stats:", e);
      }
    };

    loadInitialStats();
    return () => subscription.remove();
  }, [visible]);

  const formatDuration = useCallback((seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(
        secs
      ).padStart(2, "0")}`;
    }
    return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(
      2,
      "0"
    )}`;
  }, []);

  const getSpeedColor = useCallback((mbps: number): string => {
    if (mbps >= 1.0) return "#4ade80";
    if (mbps >= 0.5) return "#facc15";
    return "#ef4444";
  }, []);

  if (!visible) return null;

  return (
    <View style={styles.container} pointerEvents="box-none">
      <Pressable style={styles.backdrop} onPress={onClose} activeOpacity={1} />

      <Animated.View
        style={[
          styles.sheet,
          {
            paddingBottom: insets.bottom + 16,
            transform: [{ translateY }],
          },
        ]}
      >
        <View style={styles.dragHandle} />

        <View style={styles.header}>
          <Icon name="chart-line" size={20} color="#4ade80" />
          <Text style={styles.title}>Network Stats</Text>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Icon name="chevron-down" size={20} color="#9ca3af" />
          </Pressable>
        </View>

        {stats ? (
          <View style={styles.content}>
            {/* Main Stats Grid */}
            <View style={styles.statsGrid}>
              {/* Upload Speed */}
              <View style={[styles.statCard, styles.statCardHighlight]}>
                <Icon
                  name="upload"
                  size={20}
                  color={getSpeedColor(stats.uploadSpeedMbps)}
                />
                <Text style={styles.statCardLabel}>Upload</Text>
                <Text
                  style={[
                    styles.statCardValue,
                    { color: getSpeedColor(stats.uploadSpeedMbps) },
                  ]}
                >
                  {stats.uploadSpeedMbps.toFixed(2)}
                </Text>
                <Text style={styles.statCardUnit}>Mbps</Text>
              </View>

              {/* Total Upload */}
              <View style={styles.statCard}>
                <Icon name="cloud-upload" size={20} color="#9ca3af" />
                <Text style={styles.statCardLabel}>Total</Text>
                <Text style={styles.statCardValue}>
                  {stats.totalUploadMB.toFixed(1)}
                </Text>
                <Text style={styles.statCardUnit}>MB</Text>
              </View>

              {/* Duration */}
              <View style={styles.statCard}>
                <Icon name="clock-outline" size={20} color="#9ca3af" />
                <Text style={styles.statCardLabel}>Duration</Text>
                <Text style={styles.statCardValue}>
                  {formatDuration(stats.durationSeconds)}
                </Text>
                <Text style={styles.statCardUnit}>time</Text>
              </View>
            </View>

            {/* Bottom Info Bar */}
            <View style={styles.infoBar}>
              {stats.networkType && (
                <View style={styles.infoItem}>
                  <Icon name="wifi" size={14} color="#6b7280" />
                  <Text style={styles.infoText}>{stats.networkType}</Text>
                </View>
              )}

              {isRecording && (
                <View style={styles.infoItem}>
                  <View style={styles.recordingDot} />
                  <Text style={styles.infoText}>Recording</Text>
                </View>
              )}

              <View style={styles.infoItem}>
                <Icon name="download" size={14} color="#6b7280" />
                <Text style={styles.infoText}>
                  {stats.downloadSpeedMbps.toFixed(2)} Mbps
                </Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Icon name="information-outline" size={32} color="#6b7280" />
            <Text style={styles.emptyText}>No data</Text>
          </View>
        )}
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
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  sheet: {
    backgroundColor: "#1a1a1a",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    maxHeight: SHEET_HEIGHT,
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
    position: "relative",
  },
  title: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    marginLeft: 8,
  },
  closeBtn: {
    position: "absolute",
    right: 20,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  statsGrid: {
    flexDirection: "row",
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  statCardHighlight: {
    backgroundColor: "rgba(74, 222, 128, 0.08)",
    borderColor: "rgba(74, 222, 128, 0.2)",
  },
  statCardLabel: {
    color: "#9ca3af",
    fontSize: 10,
    fontWeight: "600",
    marginTop: 6,
    textTransform: "uppercase",
  },
  statCardValue: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
    marginTop: 4,
  },
  statCardUnit: {
    color: "#6b7280",
    fontSize: 10,
    marginTop: 2,
  },
  infoBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
  },
  infoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  infoText: {
    color: "#9ca3af",
    fontSize: 11,
    fontWeight: "500",
  },
  recordingDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#ef4444",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
  },
  emptyText: {
    color: "#6b7280",
    fontSize: 12,
    marginTop: 8,
  },
});