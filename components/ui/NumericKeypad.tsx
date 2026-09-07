// components/ui/NumericKeypad.tsx — Bàn phím số riêng của PickleTour (style thể thao).
// Thay bàn phím số hệ thống (lệ thuộc locale: dấu "," / "." thất thường) bằng keypad nhất quán,
// luôn có dấu "." khi cho phép số thập phân, có ⌫ và nút Xong. Hiển thị giá trị đang nhập ở đầu.
import React, { useEffect, useRef } from "react";
import { Modal, View, TouchableOpacity, StyleSheet, Animated, Platform, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Text } from "@/components/ui/i18nText";

export type KeypadMode = "decimal" | "integer" | "phone";

type Props = {
  visible: boolean;
  value: string;
  mode?: KeypadMode;
  label?: string;
  placeholder?: string;
  maxLength?: number;
  onChange: (next: string) => void;
  onDone: () => void;
};

const ACCENT = "#22c1d6";
const NAVY = "#0b1220";

function applyKey(value: string, key: string, mode: KeypadMode, maxLength?: number): string {
  if (key === "⌫") return value.slice(0, -1);
  if (key === "C") return "";
  if (key === ".") {
    if (mode !== "decimal") return value;
    if (value.includes(".")) return value;
    return value === "" ? "0." : value + ".";
  }
  if (key === "+") return mode === "phone" && value === "" ? "+" : value;
  // chữ số
  if (maxLength && value.length >= maxLength) return value;
  if (mode !== "phone" && value === "0" && key !== ".") return key; // tránh 007
  return value + key;
}

export default function NumericKeypad({ visible, value, mode = "decimal", label, placeholder, maxLength, onChange, onDone }: Props) {
  const slide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(slide, { toValue: visible ? 1 : 0, duration: 180, useNativeDriver: true }).start();
  }, [visible, slide]);

  const press = (k: string) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onChange(applyKey(value, k, mode, maxLength));
  };

  const thirdKey = mode === "decimal" ? "." : mode === "phone" ? "+" : "";
  const rows: string[][] = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    [thirdKey, "0", "⌫"],
  ];

  const shown = value !== "" ? value : "";

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDone} statusBarTranslucent>
      {/* Chạm ngoài để đóng */}
      <Pressable style={styles.backdrop} onPress={onDone} />
      <Animated.View style={[styles.sheet, { transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [320, 0] }) }] }]}>
        <LinearGradient colors={[NAVY, "#0f2a3a"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
          <View pointerEvents="none" style={styles.glow} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={styles.brandDot}><Ionicons name="tennisball" size={12} color={NAVY} /></View>
            <Text style={styles.brand}>PickleTour</Text>
            <View style={{ flex: 1 }} />
            {!!label && <Text style={styles.label} numberOfLines={1}>{label}</Text>}
          </View>
          <View style={styles.displayRow}>
            <Text style={[styles.display, !shown && { color: "rgba(255,255,255,0.35)" }]} numberOfLines={1} adjustsFontSizeToFit>
              {shown || placeholder || "0"}
            </Text>
            {!!value && (
              <TouchableOpacity onPress={() => press("C")} hitSlop={8} style={styles.clearBtn}>
                <Ionicons name="close-circle" size={20} color="rgba(255,255,255,0.7)" />
              </TouchableOpacity>
            )}
          </View>
        </LinearGradient>

        <View style={styles.keys}>
          {rows.map((row, ri) => (
            <View key={ri} style={styles.row}>
              {row.map((k, ki) => {
                if (k === "") return <View key={ki} style={[styles.key, { backgroundColor: "transparent", shadowOpacity: 0, elevation: 0 }]} />;
                const isBack = k === "⌫";
                return (
                  <TouchableOpacity key={ki} activeOpacity={0.7} onPress={() => press(k)} onLongPress={isBack ? () => press("C") : undefined} style={[styles.key, isBack && styles.keyBack]}>
                    {isBack ? <Ionicons name="backspace-outline" size={24} color="#fff" /> : <Text style={[styles.keyText, k === "." && { fontSize: 30, lineHeight: 30 }]}>{k}</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
          <TouchableOpacity activeOpacity={0.85} onPress={onDone} style={styles.done}>
            <Ionicons name="checkmark" size={20} color={NAVY} />
            <Text style={styles.doneText}>Xong</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(2,6,23,0.35)" },
  sheet: { backgroundColor: "#0f172a", borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: "hidden", paddingBottom: Platform.OS === "ios" ? 22 : 12 },
  header: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 12, overflow: "hidden" },
  glow: { position: "absolute", width: 220, height: 220, borderRadius: 110, backgroundColor: "rgba(34,193,214,0.18)", top: -120, right: -60 },
  brandDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: ACCENT, alignItems: "center", justifyContent: "center" },
  brand: { color: "#fff", fontWeight: "900", fontSize: 13, letterSpacing: 0.6 },
  label: { color: "rgba(255,255,255,0.65)", fontSize: 12, fontWeight: "600", maxWidth: 180 },
  displayRow: { flexDirection: "row", alignItems: "center", marginTop: 8, gap: 10 },
  display: { flex: 1, color: "#fff", fontWeight: "900", fontSize: 32, letterSpacing: -0.5, textAlign: "right", fontVariant: ["tabular-nums"] },
  clearBtn: { padding: 2 },
  keys: { paddingHorizontal: 10, paddingTop: 10, gap: 8 },
  row: { flexDirection: "row", gap: 8 },
  key: {
    flex: 1, height: 54, borderRadius: 14, backgroundColor: "#1e293b", alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  keyBack: { backgroundColor: "#334155" },
  keyText: { color: "#fff", fontSize: 24, fontWeight: "800", lineHeight: 28 },
  done: { height: 50, borderRadius: 14, backgroundColor: ACCENT, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, marginTop: 2 },
  doneText: { color: NAVY, fontWeight: "900", fontSize: 16, letterSpacing: 0.3 },
});
