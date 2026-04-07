import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@react-navigation/native";
import { router, Stack } from "expo-router";
import React from "react";
import { useSelector } from "react-redux";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { buildLoginHref } from "@/services/authSession";

const MORE_ITEMS = [
  {
    key: "my_tournament",
    title: "Giải của tôi",
    description: "Theo dõi các giải đã tham gia, lịch đấu và kết quả cá nhân.",
    icon: "trophy-outline" as const,
    route: "/more/my_tournament",
    accent: "#F59E0B",
  },
  {
    key: "chat",
    title: "Trợ lý Pikora",
    description: "Mở trợ lý AI để hỏi nhanh, tìm luồng và thao tác ngay trong app.",
    icon: "sparkles-outline" as const,
    route: "/more/chat",
    accent: "#10A37F",
  },
  {
    key: "profile",
    title: "Hồ sơ",
    description: "Cập nhật hồ sơ, định danh và toàn bộ thông tin tài khoản.",
    icon: "person-circle-outline" as const,
    route: "/more/profile",
    accent: "#8B5CF6",
  },
];

export default function MoreIndexScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const userInfo = useSelector((state: any) => state.auth?.userInfo || null);
  const isDark = theme.dark;
  const isAuthed = Boolean(userInfo?.token || userInfo?._id || userInfo?.email);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      edges={["top", "left", "right"]}
    >
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: 18,
            paddingBottom: insets.bottom + 28,
          },
        ]}
      >
        <View
          style={[
            styles.heroCard,
            {
              backgroundColor: theme.colors.card,
              borderColor: isDark ? "rgba(255,255,255,0.08)" : "#E5E7EB",
            },
          ]}
        >
          <View
            style={[
              styles.heroBadge,
              {
                backgroundColor: isDark
                  ? "rgba(139,92,246,0.18)"
                  : "rgba(139,92,246,0.10)",
              },
            ]}
          >
            <Ionicons
              name="apps-outline"
              size={16}
              color={theme.colors.primary}
            />
            <Text
              style={[
                styles.heroBadgeText,
                {
                  color: theme.colors.primary,
                },
              ]}
            >
              Điều hướng mở rộng
            </Text>
          </View>

          <Text
            style={[
              styles.heroTitle,
              {
                color: theme.colors.text,
              },
            ]}
          >
            More
          </Text>

          <Text
            style={[
              styles.heroDescription,
              {
                color: isDark ? "#A1A1AA" : "#52525B",
              },
            ]}
          >
            Các mục phụ được gom về đây để giữ native tab trên iOS 26 gọn và ổn
            định hơn.
          </Text>
        </View>

        <View style={styles.section}>
          <Text
            style={[
              styles.sectionTitle,
              {
                color: isDark ? "#A1A1AA" : "#71717A",
              },
            ]}
          >
            Truy cập nhanh
          </Text>

          {MORE_ITEMS.map((item) => (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              onPress={() =>
                router.push(
                  (!isAuthed && item.key === "profile"
                    ? buildLoginHref("/more/profile")
                    : item.route) as any,
                )
              }
              style={({ pressed }) => [
                styles.itemCard,
                {
                  backgroundColor: theme.colors.card,
                  borderColor: isDark ? "rgba(255,255,255,0.08)" : "#E5E7EB",
                  opacity: pressed ? 0.92 : 1,
                },
              ]}
            >
              <View
                style={[
                  styles.itemIconWrap,
                  {
                    backgroundColor: `${item.accent}18`,
                  },
                ]}
              >
                <Ionicons name={item.icon} size={22} color={item.accent} />
              </View>

              <View style={styles.itemBody}>
                <Text
                  style={[
                    styles.itemTitle,
                    {
                      color: theme.colors.text,
                    },
                  ]}
                >
                  {item.title}
                </Text>
                <Text
                  style={[
                    styles.itemDescription,
                    {
                      color: isDark ? "#A1A1AA" : "#52525B",
                    },
                  ]}
                >
                  {item.description}
                </Text>
              </View>

              <Ionicons
                name="chevron-forward"
                size={20}
                color={isDark ? "#71717A" : "#A1A1AA"}
              />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 18,
    gap: 18,
  },
  heroCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  heroBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  heroBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  heroTitle: {
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  heroDescription: {
    fontSize: 14,
    lineHeight: 21,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
  },
  itemIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  itemBody: {
    flex: 1,
    marginRight: 12,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  itemDescription: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 19,
  },
});
