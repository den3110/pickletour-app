/**
 * OTA Update Progress Modal
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

interface OTAProgressModalProps {
  visible: boolean;
  progress: number; // 0-1
  status: "checking" | "downloading" | "installing" | "done" | "error";
  version?: string;
  onRestart?: () => void;
  onClose?: () => void;
}

const OTAProgressModal: React.FC<OTAProgressModalProps> = ({
  visible,
  progress,
  status,
  version,
  onRestart,
  onClose,
}) => {
  const percentage = Math.round(progress * 100);

  const getStatusText = () => {
    switch (status) {
      case "checking":
        return "Đang kiểm tra cập nhật...";
      case "downloading":
        return `Đang tải: ${percentage}%`;
      case "installing":
        return "Đang cài đặt...";
      case "done":
        return "✅ Cập nhật thành công!";
      case "error":
        return "❌ Lỗi cập nhật";
      default:
        return "";
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <Text style={styles.title}>
            {status === "done" ? "Cập nhật hoàn tất" : "Cập nhật ứng dụng"}
          </Text>

          {version && <Text style={styles.version}>Phiên bản {version}</Text>}

          {/* Progress */}
          {(status === "downloading" || status === "installing") && (
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View
                  style={[styles.progressFill, { width: `${percentage}%` }]}
                />
              </View>
              <Text style={styles.progressText}>{percentage}%</Text>
            </View>
          )}

          {/* Status */}
          <View style={styles.statusContainer}>
            {status !== "done" && status !== "error" && (
              <ActivityIndicator
                size="small"
                color="#1976d2"
                style={styles.spinner}
              />
            )}
            <Text style={styles.statusText}>{getStatusText()}</Text>
          </View>

          {/* Buttons */}
          {status === "done" && (
            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={styles.buttonSecondary}
                onPress={onClose}
              >
                <Text style={styles.buttonSecondaryText}>Để sau</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.buttonPrimary}
                onPress={onRestart}
              >
                <Text style={styles.buttonPrimaryText}>Khởi động lại</Text>
              </TouchableOpacity>
            </View>
          )}

          {status === "error" && (
            <TouchableOpacity style={styles.buttonPrimary} onPress={onClose}>
              <Text style={styles.buttonPrimaryText}>Đóng</Text>
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
    backgroundColor: "rgba(0, 0, 0, 0.6)",
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
  progressContainer: {
    width: "100%",
    marginBottom: 16,
  },
  progressBar: {
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
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  spinner: {
    marginRight: 8,
  },
  statusText: {
    fontSize: 15,
    color: "#444",
  },
  buttonContainer: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  buttonPrimary: {
    flex: 1,
    backgroundColor: "#1976d2",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonPrimaryText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonSecondary: {
    flex: 1,
    backgroundColor: "#f3f4f6",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonSecondaryText: {
    color: "#444",
    fontSize: 16,
    fontWeight: "600",
  },
});

export default OTAProgressModal;
