/**
 * OTA Progress Modal - Simple version
 */

import React from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
} from "react-native";

interface Props {
  visible: boolean;
  progress: number;
  status: "idle" | "checking" | "downloading" | "done" | "error";
  version?: string;
  onRestart?: () => void;
  onClose?: () => void;
}

const OTAProgressModal: React.FC<Props> = ({
  visible,
  progress,
  status,
  version,
  onRestart,
  onClose,
}) => {
  const pct = Math.round(progress * 100);

  const statusText = {
    idle: "",
    checking: "Đang kiểm tra...",
    downloading: `Đang tải: ${pct}%`,
    done: "✅ Hoàn tất!",
    error: "❌ Lỗi",
  }[status];

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>
            {status === "done" ? "Cập nhật hoàn tất" : "Cập nhật ứng dụng"}
          </Text>

          {version && <Text style={styles.version}>Phiên bản {version}</Text>}

          {status === "downloading" && (
            <View style={styles.progressWrap}>
              <View style={styles.progressBg}>
                <View style={[styles.progressFill, { width: `${pct}%` }]} />
              </View>
              <Text style={styles.progressText}>{pct}%</Text>
            </View>
          )}

          <View style={styles.statusWrap}>
            {status !== "done" && status !== "error" && (
              <ActivityIndicator size="small" color="#1976d2" />
            )}
            <Text style={styles.statusText}>{statusText}</Text>
          </View>

          {status === "done" && (
            <View style={styles.buttons}>
              <TouchableOpacity style={styles.btnSecondary} onPress={onClose}>
                <Text style={styles.btnSecondaryText}>Để sau</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnPrimary} onPress={onRestart}>
                <Text style={styles.btnPrimaryText}>Khởi động lại</Text>
              </TouchableOpacity>
            </View>
          )}

          {status === "error" && (
            <TouchableOpacity style={styles.btnPrimary} onPress={onClose}>
              <Text style={styles.btnPrimaryText}>Đóng</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
};

const { width } = Dimensions.get("window");

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    width: width * 0.85,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 4,
  },
  version: {
    fontSize: 14,
    color: "#666",
    marginBottom: 20,
  },
  progressWrap: {
    width: "100%",
    marginBottom: 16,
  },
  progressBg: {
    height: 8,
    backgroundColor: "#e5e7eb",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#1976d2",
    borderRadius: 4,
  },
  progressText: {
    fontSize: 14,
    color: "#1976d2",
    fontWeight: "600",
    textAlign: "center",
    marginTop: 8,
  },
  statusWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    gap: 8,
  },
  statusText: {
    fontSize: 15,
    color: "#444",
  },
  buttons: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  btnPrimary: {
    flex: 1,
    backgroundColor: "#1976d2",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  btnPrimaryText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  btnSecondary: {
    flex: 1,
    backgroundColor: "#f3f4f6",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  btnSecondaryText: {
    color: "#444",
    fontSize: 16,
    fontWeight: "600",
  },
});

export default OTAProgressModal;