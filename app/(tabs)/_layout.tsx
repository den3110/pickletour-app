import { Tabs } from "expo-router";
import React from "react";
import { Platform, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSelector } from "react-redux";
import { BlurView } from "expo-blur";
import { useTheme } from "@react-navigation/native";

import { HapticTab } from "@/components/HapticTab";
import { IconSymbol } from "@/components/ui/IconSymbol";

const makeIcon = (
  sfName: string,
  androidName: keyof typeof MaterialCommunityIcons.glyphMap
) => {
  return ({ color, size = 28 }: { color: string; size?: number }) =>
    Platform.OS === "ios" ? (
      <IconSymbol size={size} name={sfName} color={color} />
    ) : (
      <MaterialCommunityIcons name={androidName} size={size} color={color} />
    );
};

export default function TabLayout() {
  const theme = useTheme();
  const isDark = !!theme?.dark;
  const activeTint = theme?.colors?.primary ?? (isDark ? "#7cc0ff" : "#0a84ff");

  const userInfo = useSelector((s: any) => s.auth?.userInfo);
  const isAdmin = React.useMemo(
    () => !!(userInfo?.isAdmin || userInfo?.role === "admin"),
    [userInfo?.isAdmin, userInfo?.role]
  );

  // 🎨 Custom TabBar Background Component (uses resolved theme, not system)
  const TabBarBackground = React.useCallback(() => {
    return (
      <BlurView
        intensity={isDark ? 80 : 100}
        tint={isDark ? "dark" : "light"}
        style={StyleSheet.absoluteFill}
      />
    );
  }, [isDark]);

  return (
    <Tabs
      screenOptions={{
        // dùng màu từ ThemeProvider -> đổi ngay khi user chọn theme
        tabBarActiveTintColor: activeTint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarBackground: TabBarBackground,

        // 💎 Liquid Glass Styling
        tabBarStyle: Platform.select({
          ios: {
            position: "absolute",
            backgroundColor: "transparent",
            borderTopWidth: 0,
            elevation: 0,
            shadowOpacity: 0,
            // 🎨 Thêm padding để đẹp hơn
            paddingTop: 8,
            height: 88,
          },
          android: {
            position: "absolute",
            backgroundColor: isDark
              ? "rgba(17, 18, 20, 0.9)"
              : "rgba(255, 255, 255, 0.9)",
            borderTopWidth: 0,
            elevation: 8,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: 0.1,
            shadowRadius: 8,
            paddingTop: 8,
            height: 72,
          },
        }),

        // 🎨 Label styling
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
        },

        // 🎨 Icon container styling
        tabBarIconStyle: {
          marginTop: 4,
        },
      }}
    >
      {/* 🏠 Trang chủ */}
      <Tabs.Screen
        name="index"
        options={{
          title: "Trang chủ",
          tabBarIcon: makeIcon("house.fill", "home"),
        }}
      />

      {/* 🏆 Giải đấu */}
      <Tabs.Screen
        name="tournaments"
        options={{
          title: "Giải đấu",
          tabBarIcon: makeIcon("trophy.fill", "trophy"),
        }}
      />

      {/* 📊 Xếp hạng */}
      <Tabs.Screen
        name="rankings"
        options={{
          title: "Xếp hạng",
          tabBarIcon: makeIcon("chart.bar.fill", "chart-bar"),
        }}
      />

      {/* 🎾 Giải của tôi */}
      <Tabs.Screen
        name="my_tournament"
        options={{
          title: "Giải của tôi",
          tabBarIcon: makeIcon("sportscourt.fill", "tennis-ball"),
        }}
      />

      {/* 🔒 Quản trị */}
      <Tabs.Screen
        name="admin"
        options={
          isAdmin
            ? {
                title: "Quản trị",
                tabBarIcon: makeIcon("lock.shield.fill", "shield-lock"),
              }
            : { href: null }
        }
      />

      {/* 📡 Live */}
      <Tabs.Screen
        name="live"
        options={{
          title: "Live",
          tabBarIcon: makeIcon(
            "dot.radiowaves.left.and.right",
            "broadcast"
          ),
        }}
      />

      {/* 👤 Hồ sơ */}
      <Tabs.Screen
        name="profile"
        options={{
          title: "Hồ sơ",
          tabBarIcon: makeIcon("person.crop.circle.fill", "account-circle"),
        }}
      />
    </Tabs>
  );
}
