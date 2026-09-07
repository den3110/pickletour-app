import { t } from "@/utils/i18n";
/**
 * Expo Update Modal - VIP UI với progress bar
 */

import React, { useMemo } from "react";
import {
  Modal,
  View,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
} from "react-native";
import { Text } from "@/components/ui/i18nText";
import { useThemeTokens, type ThemeTokens } from "@/hooks/useThemeTokens";

interface Props {
  visible: boolean;
  status: "idle" | "checking" | "downloading" | "done" | "error";
  onClose?: () => void;
}

const ExpoUpdateModal: React.FC<Props> = ({ visible, status, onClose }) => {
  const C = useThemeTokens();
  const styles = useMemo(() => mk_styles(C), [C]);
  const statusConfig = {
    idle: {
      title: "",
      text: "",
      showSpinner: false,
      showProgress: false,
    },
    checking: {
      title: t("Kiểm tra cập nhật"),
      text: "Đang kiểm tra phiên bản mới...",
      showSpinner: true,
      showProgress: false,
    },
    downloading: {
      title: t("Đang cập nhật"),
      text: "Đang tải bản cập nhật mới...",
      showSpinner: true,
      showProgress: true,
    },
    done: {
      title: t("✅ Hoàn tất"),
      text: "Ứng dụng sẽ khởi động lại...",
      showSpinner: false,
      showProgress: false,
    },
    error: {
      title: t("❌ Lỗi"),
      text: "Không thể cập nhật. Thử lại sau.",
      showSpinner: false,
      showProgress: false,
    },
  };

  const config = statusConfig[status] || statusConfig.idle;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Icon/Spinner */}
          {config.showSpinner && (
            <ActivityIndicator
              size="large"
              color="#1976d2"
              style={styles.spinner}
            />
          )}

          {/* Title */}
          <Text style={styles.title}>{config.title}</Text>

          {/* Progress bar khi downloading */}
          {config.showProgress && (
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View style={styles.progressFillAnimated} />
              </View>
            </View>
          )}

          {/* Status text */}
          <Text style={styles.text}>{config.text}</Text>

          {/* Close button for error */}
          {status === "error" && (
            <TouchableOpacity style={styles.button} onPress={onClose}>
              <Text style={styles.buttonText}>Đóng</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
};

const { width } = Dimensions.get("window");

const mk_styles = (C: ThemeTokens) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: C.overlay,
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    width: width * 0.85,
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  spinner: {
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: C.text,
    marginBottom: 8,
    textAlign: "center",
  },
  text: {
    fontSize: 15,
    color: C.sub,
    textAlign: "center",
    lineHeight: 22,
  },
  progressContainer: {
    width: "100%",
    marginVertical: 16,
  },
  progressBar: {
    height: 6,
    backgroundColor: C.border,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFillAnimated: {
    height: "100%",
    backgroundColor: "#1976d2",
    borderRadius: 3,
    width: "100%",
    // CSS animation không có trong RN, dùng Animated hoặc reanimated nếu cần
  },
  button: {
    marginTop: 20,
    backgroundColor: "#1976d2",
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});

export default ExpoUpdateModal;
