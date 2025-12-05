// src/components/AskForReviewGateModal.jsx
import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TouchableWithoutFeedback,
  Linking,
  useColorScheme,
} from "react-native";
import * as StoreReview from "expo-store-review";

const PRIMARY = "#2563EB";

const DARK_PALETTE = {
  backdrop: "rgba(0,0,0,0.55)",
  cardBg: "#111827",
  title: "#F9FAFB",
  subtitle: "#9CA3AF",
  secondaryText: "#E5E7EB",
  border: "#4B5563",
  primary: PRIMARY,
  primaryText: "#FFFFFF",
};

const LIGHT_PALETTE = {
  backdrop: "rgba(15,23,42,0.25)",
  cardBg: "#FFFFFF",
  title: "#111827",
  subtitle: "#4B5563",
  secondaryText: "#374151",
  border: "#E5E7EB",
  primary: PRIMARY,
  primaryText: "#FFFFFF",
};

export default function AskForReviewGateModal({
  visible,
  onClose,
  onNeedFeedback, // để mở màn góp ý nội bộ nếu bạn muốn
  mode, // optional: "light" | "dark" | undefined
}) {
  const systemScheme = useColorScheme();
  const isDark =
    mode === "dark" || (!mode && systemScheme === "dark");

  const palette = isDark ? DARK_PALETTE : LIGHT_PALETTE;

  const handleGood = async () => {
    try {
      const isAvailable = await StoreReview.isAvailableAsync();
      if (isAvailable) {
        await StoreReview.requestReview();
      } else {
        const url = StoreReview.storeUrl();
        if (url) await Linking.openURL(url);
      }
    } catch (e) {
      console.log("rating error", e);
    } finally {
      onClose && onClose();
    }
  };

  const handleBad = () => {
    if (onNeedFeedback) onNeedFeedback();
    onClose && onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={[styles.backdrop, { backgroundColor: palette.backdrop }]}>
          <TouchableWithoutFeedback>
            <View style={[styles.card, { backgroundColor: palette.cardBg }]}>
              <Text style={[styles.title, { color: palette.title }]}>
                Bạn thấy PickleTour thế nào?
              </Text>
              <Text style={[styles.subtitle, { color: palette.subtitle }]}>
                Nếu thấy app hữu ích, cho tụi mình một lời đánh giá nhỏ xíu để
                có động lực cải thiện tiếp nha
              </Text>

              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[
                    styles.badBtn,
                    { borderColor: palette.border },
                  ]}
                  onPress={handleBad}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.badText,
                      { color: palette.secondaryText },
                    ]}
                  >
                    Không ổn lắm
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.goodBtn,
                    { backgroundColor: palette.primary },
                  ]}
                  onPress={handleGood}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.goodText,
                      { color: palette.primaryText },
                    ]}
                  >
                    Rất hài lòng, cho 5★
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  card: {
    width: "100%",
    borderRadius: 18,
    padding: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 18,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  badBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  badText: {
    fontWeight: "500",
    fontSize: 14,
  },
  goodBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  goodText: {
    fontWeight: "600",
    fontSize: 14,
  },
});
