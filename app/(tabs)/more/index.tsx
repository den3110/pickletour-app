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
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import AppleLiquidGlassView from "@/components/ui/AppleLiquidGlassView";
import { buildLoginHref } from "@/services/authSession";
import { IOS_26_LIQUID_GLASS_ENABLED } from "@/utils/nativeTabs";

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

function MoreGlassSurface({
  children,
  effect = "regular",
  interactive = false,
  style,
  tintColor,
}: {
  children?: React.ReactNode;
  effect?: "regular" | "clear";
  interactive?: boolean;
  style?: StyleProp<ViewStyle>;
  tintColor?: string;
}) {
  const theme = useTheme();
  const isDark = theme.dark;

  return (
    <AppleLiquidGlassView
      fallback="view"
      glassColorScheme={isDark ? "dark" : "light"}
      glassEffectStyle={effect}
      glassTintColor={
        tintColor ??
        (isDark ? "rgba(18,20,26,0.62)" : "rgba(255,255,255,0.72)")
      }
      isInteractive={interactive}
      style={style}
    >
      {children}
    </AppleLiquidGlassView>
  );
}

export default function MoreIndexScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const userInfo = useSelector((state: any) => state.auth?.userInfo || null);
  const isDark = theme.dark;
  const isAuthed = Boolean(userInfo?.token || userInfo?._id || userInfo?.email);
  const pageBg = isDark ? theme.colors.background : "#F8FAFC";
  const cardBg = isDark ? theme.colors.card : "rgba(255,255,255,0.9)";
  const borderColor = isDark ? "rgba(255,255,255,0.08)" : "#E2E8F0";
  const subText = isDark ? "#A1A1AA" : "#64748B";

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: pageBg }}
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
        <MoreGlassSurface
          effect="clear"
          tintColor={
            isDark ? "rgba(17,19,24,0.58)" : "rgba(255,255,255,0.68)"
          }
          style={[
            styles.heroCard,
            IOS_26_LIQUID_GLASS_ENABLED && [
              styles.heroCardGlass,
              {
                shadowColor: isDark ? "#8B5CF6" : "#CBD5E1",
                shadowOpacity: isDark ? 0.2 : 0.16,
              },
            ],
            {
              backgroundColor: cardBg,
              borderColor,
            },
          ]}
        >
          <MoreGlassSurface
            effect="clear"
            tintColor={
              isDark ? "rgba(139,92,246,0.26)" : "rgba(139,92,246,0.18)"
            }
            style={[
              styles.heroBadge,
              {
                backgroundColor: isDark
                  ? "rgba(139,92,246,0.18)"
                  : "rgba(139,92,246,0.10)",
              },
              IOS_26_LIQUID_GLASS_ENABLED && styles.heroBadgeGlass,
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
              Tiện ích bổ sung
            </Text>
          </MoreGlassSurface>

          <Text
            style={[
              styles.heroTitle,
              {
                color: theme.colors.text,
              },
            ]}
          >
            Khám phá thêm
          </Text>

          <Text
            style={[
              styles.heroDescription,
              {
                color: subText,
              },
            ]}
          >
            Truy cập nhanh hồ sơ, trợ lý và các tiện ích cá nhân của PickleTour
            trong một nơi gọn gàng hơn.
          </Text>
        </MoreGlassSurface>

        <View style={styles.section}>
          <Text
            style={[
              styles.sectionTitle,
              {
                color: isDark ? "#A1A1AA" : "#64748B",
              },
            ]}
          >
            Lối tắt nhanh
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
                styles.itemPressable,
                {
                  opacity: pressed ? 0.92 : 1,
                },
              ]}
            >
              <MoreGlassSurface
                interactive
                effect="clear"
                tintColor={
                  isDark ? "rgba(17,19,24,0.58)" : "rgba(255,255,255,0.66)"
                }
                style={[
                  styles.itemCard,
                  IOS_26_LIQUID_GLASS_ENABLED && [
                    styles.itemCardGlass,
                    {
                      shadowOpacity: isDark ? 0.24 : 0.08,
                    },
                  ],
                  {
                    backgroundColor: cardBg,
                    borderColor,
                  },
                ]}
              >
                <MoreGlassSurface
                  effect="clear"
                  tintColor={`${item.accent}24`}
                  style={[
                    styles.itemIconWrap,
                    IOS_26_LIQUID_GLASS_ENABLED && styles.itemIconGlass,
                    {
                      backgroundColor: `${item.accent}18`,
                    },
                  ]}
                >
                  <Ionicons name={item.icon} size={22} color={item.accent} />
                </MoreGlassSurface>

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
                        color: subText,
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
              </MoreGlassSurface>
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
  heroCardGlass: {
    borderColor: "rgba(255,255,255,0.18)",
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    overflow: "hidden",
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
  heroBadgeGlass: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    overflow: "hidden",
  },
  heroBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  heroTitle: {
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: 0,
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
  itemPressable: {
    borderRadius: 20,
  },
  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
  },
  itemCardGlass: {
    borderColor: "rgba(255,255,255,0.16)",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.24,
    shadowRadius: 18,
    overflow: "hidden",
  },
  itemIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  itemIconGlass: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    overflow: "hidden",
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
