import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { memo, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { FEED_COLORS } from "@/components/feed/FeedDesign";
import { Text } from "@/components/ui/i18nText";

export const NOTIFICATION_COLORS = {
  ...FEED_COLORS,
  purple: "#8B5CF6",
  green: "#22D879",
  gold: "#FFB000",
  coral: "#FF4D67",
} as const;

export const NotificationsPage = memo(function NotificationsPage({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <LinearGradient
      colors={[NOTIFICATION_COLORS.background, NOTIFICATION_COLORS.backgroundAlt]}
      start={{ x: 0.12, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={styles.page}
    >
      <View pointerEvents="none" style={styles.ambientTop} />
      <View pointerEvents="none" style={styles.ambientBottom} />
      {children}
    </LinearGradient>
  );
});

export const NotificationsHeader = memo(function NotificationsHeader({
  unreadCount,
}: {
  unreadCount: number;
}) {
  return (
    <View style={styles.header}>
      <View pointerEvents="none" style={styles.heroVisual}>
        <View style={styles.heroHalo} />
        <View style={styles.ball}>
          <View style={[styles.ballHole, styles.ballHoleOne]} />
          <View style={[styles.ballHole, styles.ballHoleTwo]} />
          <View style={[styles.ballHole, styles.ballHoleThree]} />
        </View>
        <LinearGradient
          colors={["#14C9FF", "#2765FF", "#7547E8"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.bellCircle}
        >
          <Ionicons name="notifications" size={50} color="#EAF8FF" />
        </LinearGradient>
        {unreadCount > 0 ? (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadBadgeText}>
              {unreadCount > 99 ? "99+" : unreadCount}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.headerCopy}>
        <View style={styles.titleRow}>
          <Text style={styles.titleWhite}>Thông </Text>
          <Text style={styles.titleAccent}>báo</Text>
        </View>
        <Text style={styles.subtitle}>
          Không bỏ lỡ bất kỳ hoạt động nào từ cộng đồng
        </Text>
        <Text style={styles.subtitleAccent}>Pickleball Việt Nam</Text>
      </View>
    </View>
  );
});

export const NotificationSectionHeader = memo(function NotificationSectionHeader({
  title,
  canMarkAll,
  onMarkAll,
}: {
  title: string;
  canMarkAll?: boolean;
  onMarkAll?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {canMarkAll && onMarkAll ? (
        <Pressable
          accessibilityRole="button"
          onPress={onMarkAll}
          style={({ pressed }) => [styles.markAllButton, pressed && styles.pressed]}
        >
          <Ionicons
            name="checkmark-done-circle-outline"
            size={17}
            color={NOTIFICATION_COLORS.primary}
          />
          <Text style={styles.markAllText}>Đánh dấu đã đọc tất cả</Text>
        </Pressable>
      ) : null}
    </View>
  );
});

export const NotificationSkeleton = memo(function NotificationSkeleton() {
  return (
    <View style={styles.skeletonList}>
      {[0, 1, 2, 3].map((item) => (
        <View key={item} style={styles.skeletonCard}>
          <View style={styles.skeletonIcon} />
          <View style={styles.skeletonCopy}>
            <View style={styles.skeletonTitle} />
            <View style={styles.skeletonBody} />
            <View style={styles.skeletonTime} />
          </View>
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  page: { flex: 1, overflow: "hidden" },
  ambientTop: {
    position: "absolute",
    top: -130,
    right: -100,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: "rgba(8,189,245,0.09)",
  },
  ambientBottom: {
    position: "absolute",
    left: -180,
    bottom: 80,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: "rgba(139,92,246,0.04)",
  },
  header: {
    height: 196,
    marginHorizontal: 16,
    justifyContent: "center",
    overflow: "hidden",
  },
  headerCopy: { zIndex: 2, maxWidth: "72%", paddingTop: 7 },
  titleRow: { flexDirection: "row", alignItems: "center" },
  titleWhite: {
    color: NOTIFICATION_COLORS.text,
    fontSize: 37,
    lineHeight: 44,
    fontWeight: "900",
    letterSpacing: -1.25,
  },
  titleAccent: {
    color: NOTIFICATION_COLORS.primary,
    fontSize: 37,
    lineHeight: 44,
    fontWeight: "900",
    letterSpacing: -1.25,
    textShadowColor: "rgba(8,189,245,0.28)",
    textShadowRadius: 9,
  },
  subtitle: {
    color: NOTIFICATION_COLORS.textSoft,
    fontSize: 14.5,
    lineHeight: 20,
    marginTop: 6,
  },
  subtitleAccent: {
    color: NOTIFICATION_COLORS.primary,
    fontSize: 14.5,
    lineHeight: 20,
    fontWeight: "700",
  },
  heroVisual: {
    position: "absolute",
    right: -2,
    top: 27,
    width: 145,
    height: 145,
  },
  heroHalo: {
    position: "absolute",
    right: 0,
    top: 0,
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: "rgba(22,119,255,0.13)",
    shadowColor: NOTIFICATION_COLORS.primary,
    shadowOpacity: 0.38,
    shadowRadius: 22,
  },
  bellCircle: {
    position: "absolute",
    right: 6,
    top: 29,
    width: 86,
    height: 86,
    borderRadius: 43,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(188,235,255,0.48)",
    transform: [{ rotate: "9deg" }],
  },
  ball: {
    position: "absolute",
    left: 1,
    bottom: 12,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#A6E92E",
    shadowColor: "#75D20B",
    shadowOpacity: 0.38,
    shadowRadius: 8,
  },
  ballHole: {
    position: "absolute",
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#315E13",
  },
  ballHoleOne: { top: 8, left: 16 },
  ballHoleTwo: { top: 23, right: 7 },
  ballHoleThree: { bottom: 7, left: 10 },
  unreadBadge: {
    position: "absolute",
    right: 0,
    top: 17,
    minWidth: 34,
    height: 34,
    paddingHorizontal: 7,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: NOTIFICATION_COLORS.coral,
    borderWidth: 2,
    borderColor: "#FFB0BD",
    shadowColor: NOTIFICATION_COLORS.coral,
    shadowOpacity: 0.48,
    shadowRadius: 8,
  },
  unreadBadgeText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  sectionHeader: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 14,
    marginTop: 4,
    marginBottom: 8,
  },
  sectionTitle: {
    color: NOTIFICATION_COLORS.text,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "900",
  },
  markAllButton: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(8,35,64,0.8)",
    borderWidth: 1,
    borderColor: "rgba(8,189,245,0.28)",
  },
  markAllText: {
    color: NOTIFICATION_COLORS.textMuted,
    fontSize: 11,
    fontWeight: "700",
  },
  pressed: { opacity: 0.78 },
  skeletonList: { paddingHorizontal: 12, gap: 9 },
  skeletonCard: {
    minHeight: 92,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(90,180,230,0.14)",
    backgroundColor: "rgba(7,28,53,0.75)",
  },
  skeletonIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(92,125,161,0.15)",
  },
  skeletonCopy: { flex: 1, gap: 7 },
  skeletonTitle: { width: "64%", height: 12, borderRadius: 6, backgroundColor: "rgba(143,170,200,0.2)" },
  skeletonBody: { width: "88%", height: 10, borderRadius: 5, backgroundColor: "rgba(143,170,200,0.13)" },
  skeletonTime: { width: "28%", height: 8, borderRadius: 4, backgroundColor: "rgba(143,170,200,0.1)" },
});
