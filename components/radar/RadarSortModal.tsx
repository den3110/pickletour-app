import React from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
} from "react-native";
import { BlurView } from "expo-blur";

export default function RadarSortModal({
  visible,
  onClose,
  options,
  value,
  onSelect,
  isDark,
  modalBg,
  textMain,
  textSub,
  accentColor,
  borderColor,
}) {
  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <BlurView
              intensity={40}
              tint={isDark ? "dark" : "light"}
              style={[styles.content, { backgroundColor: modalBg }]}
            >
              <Text style={[styles.title, { color: textMain }]}>Sắp xếp</Text>

              <View style={{ width: "100%", gap: 10 }}>
                {options.map((opt) => {
                  const active = opt.key === value;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      onPress={() => {
                        onSelect(opt.key);
                        onClose();
                      }}
                      style={[
                        styles.row,
                        {
                          borderColor: active ? accentColor : borderColor,
                          backgroundColor: active
                            ? "rgba(249,115,22,0.12)"
                            : "transparent",
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: active ? accentColor : textSub,
                          fontWeight: active ? "800" : "700",
                        }}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Text style={{ color: textSub, fontWeight: "700" }}>Đóng</Text>
              </TouchableOpacity>
            </BlurView>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    width: "86%",
    borderRadius: 24,
    padding: 18,
    alignItems: "center",
    overflow: "hidden",
  },
  title: { fontSize: 16, fontWeight: "900", marginBottom: 14 },
  row: {
    width: "100%",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  closeBtn: { marginTop: 14, padding: 10 },
});
