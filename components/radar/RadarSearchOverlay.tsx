import React from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";

export default function RadarSearchOverlay({
  visible,
  value,
  onChange,
  onClose,
  isDark,
  textColor,
  pillBg,
}) {
  if (!visible) return null;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <BlurView
        intensity={40}
        tint={isDark ? "dark" : "light"}
        style={[styles.bar, { backgroundColor: pillBg }]}
      >
        <Ionicons name="search" size={18} color={textColor} />
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder="Tìm theo tên / CLB / status..."
          placeholderTextColor={isDark ? "#94A3B8" : "#9CA3AF"}
          style={[styles.input, { color: textColor }]}
          autoFocus
          returnKeyType="search"
        />
        <TouchableOpacity onPress={onClose} hitSlop={10}>
          <Ionicons name="close" size={20} color={textColor} />
        </TouchableOpacity>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 16,
    right: 16,
    top: Platform.OS === "android" ? 64 : 54,
    zIndex: 50,
  },
  bar: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    overflow: "hidden",
  },
  input: { flex: 1, fontSize: 14 },
});
