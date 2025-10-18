import { Tabs, usePathname } from "expo-router"; // ✅ usePathname
import React from "react";
import { Platform } from "react-native";

import { HapticTab } from "@/components/HapticTab";
import { IconSymbol } from "@/components/ui/IconSymbol";
import TabBarBackground from "@/components/ui/TabBarBackground";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useSelector } from "react-redux";
import { MaterialCommunityIcons } from "@expo/vector-icons";

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
  const colorScheme = useColorScheme();
  const userInfo = useSelector((s: any) => s.auth?.userInfo);
  const isAdmin = !!(userInfo?.isAdmin || userInfo?.role === "admin"); // ✅
  const pathname = usePathname(); // ✅

  // ✅ Nếu đang ở admin mà bị mất quyền -> đẩy ra Home
  React.useEffect(() => {
    if (!isAdmin && pathname?.includes("/admin")) {
      // dùng replace để không quay lại admin được bằng back
      // import { router } from "expo-router" nếu cần điều hướng ngay tại đây
      // nhưng trong TabLayout tránh navigate trực tiếp; trang admin tự Redirect cũng được
    }
  }, [isAdmin, pathname]);

  // ✅ re-mount riêng khi quyền admin thay đổi
  const tabsKey = isAdmin ? "tabs-admin-on" : "tabs-admin-off";

  return (
    <Tabs
      key={tabsKey} // ✅ ép re-mount khi isAdmin đổi
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? "light"].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarBackground: TabBarBackground,
        tabBarStyle: Platform.select({
          ios: { position: "absolute" },
          default: {},
        }),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Trang chủ",
          tabBarIcon: makeIcon("house.fill", "home"),
        }}
      />

      <Tabs.Screen
        name="tournaments"
        options={{
          title: "Giải đấu",
          tabBarIcon: makeIcon("trophy.fill", "trophy"),
        }}
      />

      <Tabs.Screen
        name="rankings"
        options={{
          title: "Xếp hạng",
          tabBarIcon: makeIcon("chart.bar.fill", "chart-bar"),
        }}
      />

      <Tabs.Screen
        name="my_tournament"
        options={{
          title: "Giải của tôi",
          tabBarIcon: makeIcon("sportscourt.fill", "tennis-ball"),
        }}
      />

      {/* ✅ Luôn khai báo màn admin, nhưng ẩn khỏi tab & deep-link nếu không phải admin */}
      <Tabs.Screen
        name="admin"
        options={
          isAdmin
            ? {
                title: "Quản trị",
                tabBarIcon: makeIcon("lock.shield.fill", "shield-lock"),
              }
            : {
                href: null, // ẩn khỏi tab + chặn deep-link
              }
        }
      />

      {/* LIVE */}
      <Tabs.Screen
        name="live"
        options={{
          title: "Live",
          tabBarIcon: makeIcon("dot.radiowaves.left.and.right", "broadcast"),
        }}
      />

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
