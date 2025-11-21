import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
// ✅ dùng Lottie thay icon
import LottieView from "lottie-react-native";
export const Section = ({ title, subtitle, children }: any) => (
  <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {!!subtitle && <Text style={styles.sectionSub}>{subtitle}</Text>}
    <View style={{ height: 8 }} />
    {children}
  </View>
);

export const GlassCard = ({ children, style }: any) => (
  <View style={[styles.glass, style]}>
    <BlurView
      intensity={Platform.OS === "ios" ? 30 : 20}
      tint="dark"
      style={StyleSheet.absoluteFill}
    />
    <LinearGradient
      colors={["#0b1220AA", "#0b122055"]}
      style={StyleSheet.absoluteFill}
    />
    <View style={{ padding: 12 }}>{children}</View>
  </View>
);

export const PrimaryBtn = ({ title, onPress, small, style, disabled }: any) => (
  <TouchableOpacity
    activeOpacity={0.9}
    disabled={disabled}
    onPress={onPress}
    style={[styles.pBtn, small && styles.pBtnSmall, style]}
  >
    <LinearGradient
      colors={["#4ECDC4", "#45B7D1"]}
      style={StyleSheet.absoluteFill}
    />
    <Text style={styles.pBtnText}>{title}</Text>
  </TouchableOpacity>
);

export const SecondaryBtn = ({ title, onPress, small, style }: any) => (
  <TouchableOpacity
    activeOpacity={0.9}
    onPress={onPress}
    style={[styles.sBtn, small && styles.sBtnSmall, style]}
  >
    <Text style={styles.sBtnText}>{title}</Text>
  </TouchableOpacity>
);

export const DangerGhostBtn = ({ title, onPress, small, style }: any) => (
  <TouchableOpacity
    activeOpacity={0.9}
    onPress={onPress}
    style={[styles.dBtn, small && styles.dBtnSmall, style]}
  >
    <Text style={styles.dBtnText}>{title}</Text>
  </TouchableOpacity>
);

export const Badge = ({ text }: { text: string }) => (
  <View style={styles.badge}>
    <Text style={styles.badgeText}>{text}</Text>
  </View>
);

export const EmptyState = ({
  label,
  icon, // giữ lại cho tương thích cũ, không dùng nữa
  size = 120,
  speed = 1,
}: {
  label: string;
  icon?: any;
  size?: number;
  speed?: number;
}) => (
  <View
    style={{
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 22,
    }}
  >
    <LottieView
      source={require("@/assets/lottie/empty.json")}
      autoPlay
      loop
      speed={speed}
      style={{ width: size, height: size }}
    />
    <Text style={{ color: "#7f92b3", marginTop: 6 }}>{label}</Text>
  </View>
);

export const ProgressBar = ({ progress }: { progress: number }) => (
  <View style={styles.progressWrap}>
    <View
      style={[
        styles.progressFill,
        { width: `${Math.min(100, Math.max(0, progress * 100))}%` },
      ]}
    />
  </View>
);

const styles = StyleSheet.create({
  sectionTitle: { color: "#93a9c9", fontWeight: "800", fontSize: 18 },
  sectionSub: { color: "#93a9c9", marginTop: 2 },
  glass: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#253046",
  },
  pBtn: {
    minWidth: 140,
    height: 42,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  pBtnSmall: { minWidth: 96, height: 34 },
  pBtnText: { color: "#06101a", fontWeight: "800" },
  sBtn: {
    minWidth: 120,
    height: 42,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#122036",
    borderWidth: 1,
    borderColor: "#263551",
    paddingHorizontal: 16,
  },
  sBtnSmall: { minWidth: 96, height: 34 },
  sBtnText: { color: "#cce9ff", fontWeight: "700" },
  dBtn: {
    minWidth: 120,
    height: 42,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2a0f15",
    borderWidth: 1,
    borderColor: "#652d34",
    paddingHorizontal: 16,
  },
  dBtnSmall: { minWidth: 96, height: 34 },
  dBtnText: { color: "#ffb4bd", fontWeight: "700" },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#0b1220AA",
    borderWidth: 1,
    borderColor: "#2a3447",
  },
  badgeText: { color: "#bfe6ff", fontSize: 12 },
  progressWrap: {
    height: 6,
    borderRadius: 999,
    backgroundColor: "#1a2334",
    overflow: "hidden",
  },
  progressFill: { height: 6, backgroundColor: "#45B7D1" },
});
