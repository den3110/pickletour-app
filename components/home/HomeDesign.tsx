import React, { memo, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Text } from "@/components/ui/i18nText";

export const HOME_COLORS = {
  background: "#020B1C",
  backgroundAlt: "#06152B",
  surface: "rgba(7,27,52,0.9)",
  surfaceStrong: "rgba(8,31,58,0.97)",
  primary: "#08BDF5",
  secondary: "#1677FF",
  success: "#22D879",
  warning: "#FFB000",
  text: "#FFFFFF",
  textSoft: "#DCEBFA",
  textMuted: "#8FAAC8",
  border: "rgba(90,180,230,0.25)",
} as const;

export const HomePage = memo(function HomePage({ children }: { children: ReactNode }) {
  return (
    <LinearGradient
      colors={[HOME_COLORS.background, HOME_COLORS.backgroundAlt]}
      start={{ x: 0.12, y: 0 }}
      end={{ x: 0.88, y: 1 }}
      style={styles.page}
    >
      <View pointerEvents="none" style={styles.ambientTop} />
      <View pointerEvents="none" style={styles.ambientMid} />
      {children}
    </LinearGradient>
  );
});

const QUICK_ACTIONS: {
  key: string;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
}[] = [
  {
    key: "courts",
    title: "Đặt sân",
    description: "Tìm sân và đặt lịch",
    icon: "calendar-clear-outline",
    route: "/courts",
  },
  {
    key: "schedule",
    title: "Lịch thi đấu",
    description: "Theo dõi trận của bạn",
    icon: "time-outline",
    route: "/schedule",
  },
  {
    key: "tournaments",
    title: "Giải đấu",
    description: "Khám phá giải mới",
    icon: "trophy-outline",
    route: "/tournament/stack",
  },
  {
    key: "rankings",
    title: "Bảng xếp hạng",
    description: "Theo dõi thứ hạng",
    icon: "podium-outline",
    route: "/rankings/stack",
  },
];

export const QuickActions = memo(function QuickActions() {
  return (
    <View style={styles.quickSection}>
      <View style={styles.quickHeader}>
        <View>
          <Text style={styles.quickTitle}>Lối tắt của bạn</Text>
          <Text style={styles.quickSubtitle}>Chơi, thi đấu và kết nối nhanh hơn</Text>
        </View>
        <Ionicons name="flash-outline" size={20} color={HOME_COLORS.primary} />
      </View>

      <View style={styles.quickGrid}>
        {QUICK_ACTIONS.map((action) => (
          <Pressable
            key={action.key}
            accessibilityRole="button"
            onPress={() => router.push(action.route as never)}
            style={({ pressed }) => [styles.quickPressable, pressed && styles.pressed]}
          >
            <LinearGradient
              colors={["rgba(12,48,82,0.92)", "rgba(5,25,49,0.96)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.quickCard}
            >
              <View style={styles.quickIcon}>
                <Ionicons name={action.icon} size={22} color={HOME_COLORS.primary} />
              </View>
              <View style={styles.quickCopy}>
                <Text style={styles.quickCardTitle} numberOfLines={2}>
                  {action.title}
                </Text>
                <Text style={styles.quickDescription} numberOfLines={2}>
                  {action.description}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#6687A8" />
            </LinearGradient>
          </Pressable>
        ))}
      </View>
    </View>
  );
});

export const HomeSectionHeader = memo(function HomeSectionHeader({
  title,
  subtitle,
  count,
  icon = "grid-outline",
}: {
  title: string;
  subtitle?: string;
  count?: number;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionCopy}>
        <View style={styles.sectionTitleRow}>
          <View style={styles.sectionAccent} />
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {typeof count === "number" ? (
        <View style={styles.sectionCount}>
          <Ionicons name={icon} size={13} color={HOME_COLORS.primary} />
          <Text style={styles.sectionCountText}>{count}</Text>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  page: { flex: 1, overflow: "hidden" },
  ambientTop: {
    position: "absolute",
    top: -120,
    right: -100,
    width: 310,
    height: 310,
    borderRadius: 155,
    backgroundColor: "rgba(8,189,245,0.1)",
  },
  ambientMid: {
    position: "absolute",
    top: 560,
    left: -160,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "rgba(22,119,255,0.05)",
  },
  quickSection: { paddingHorizontal: 16, marginBottom: 14 },
  quickHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 11,
  },
  quickTitle: { color: HOME_COLORS.text, fontSize: 18, lineHeight: 23, fontWeight: "900" },
  quickSubtitle: { color: HOME_COLORS.textMuted, fontSize: 11.5, lineHeight: 16, marginTop: 2 },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  quickPressable: { width: "48.7%", minWidth: 0, borderRadius: 18 },
  quickCard: {
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: HOME_COLORS.border,
  },
  quickIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(8,189,245,0.12)",
    borderWidth: 1,
    borderColor: "rgba(8,189,245,0.25)",
  },
  quickCopy: { flex: 1, minWidth: 0 },
  quickCardTitle: { color: HOME_COLORS.textSoft, fontSize: 12.5, lineHeight: 15, fontWeight: "800" },
  quickDescription: { color: HOME_COLORS.textMuted, fontSize: 9.5, lineHeight: 12, marginTop: 2 },
  pressed: { opacity: 0.84, transform: [{ scale: 0.985 }] },
  sectionHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 14 },
  sectionCopy: { flex: 1, minWidth: 0 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionAccent: { width: 4, height: 19, borderRadius: 2, backgroundColor: HOME_COLORS.primary },
  sectionTitle: { color: HOME_COLORS.text, fontSize: 20, lineHeight: 25, fontWeight: "900", letterSpacing: -0.35 },
  sectionSubtitle: { color: HOME_COLORS.textMuted, fontSize: 12, lineHeight: 17, marginTop: 4, marginLeft: 12 },
  sectionCount: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 14, backgroundColor: "rgba(8,189,245,0.11)", borderWidth: 1, borderColor: "rgba(8,189,245,0.22)" },
  sectionCountText: { color: HOME_COLORS.primary, fontSize: 12, fontWeight: "800" },
});
