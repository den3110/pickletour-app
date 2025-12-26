import React from "react";
import { TouchableOpacity, View, StyleSheet } from "react-native";

export default function RadarActionPill({
  onPress,
  disabled,
  backgroundColor,
  children,
  style,
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.btn,
        { backgroundColor: backgroundColor || "rgba(255,255,255,0.95)" },
        disabled && { opacity: 0.6 },
        style,
      ]}
    >
      <View style={styles.inner}>{children}</View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    justifyContent: "center",
  },
  inner: { flexDirection: "row", alignItems: "center" },
});
