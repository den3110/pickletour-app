import { Tabs } from "expo-router";
import React from "react";
import { Platform, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSelector } from "react-redux";
import { BlurView } from "expo-blur";
import LottieView from "lottie-react-native";

import { HapticTab } from "@/components/HapticTab";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";

/** Lottie icon cho tab Home (active) */
const HOME_LOTTIE = require("@/assets/lottie/home-lt-icon.json");

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

/** Icon Home: active = Lottie, inactive = icon cũ */
const HomeTabIcon = React.memo(function HomeTabIcon({
  color,
  size = 28,
  focused,
  triggerPlay, // 🔥 Nhận trigger từ parent
}: {
  color: string;
  size?: number;
  focused?: boolean;
  triggerPlay?: number; // counter để trigger animation
}) {
  const lottieRef = React.useRef<LottieView>(null);

  // 🔥 Khi focused = true lần đầu → play animation
  React.useEffect(() => {
    if (focused) {
      lottieRef.current?.reset?.();
      lottieRef.current?.play?.();
    } else {
      lottieRef.current?.reset?.();
    }
  }, [focused]);

  // 🔥 Khi triggerPlay thay đổi (tab được nhấn lại) → replay animation
  React.useEffect(() => {
    if (focused && triggerPlay && triggerPlay > 0) {
      lottieRef.current?.reset?.();
      lottieRef.current?.play?.();
    }
  }, [triggerPlay, focused]);

  if (!focused) {
    // Inactive → icon cũ theo platform, giữ màu theo `color`
    return Platform.OS === "ios" ? (
      <IconSymbol size={size} name="house.fill" color={color} />
    ) : (
      <MaterialCommunityIcons name="home" size={size} color={color} />
    );
  }

  // Active → Lottie
  return (
    <LottieView
      ref={lottieRef}
      source={HOME_LOTTIE}
      autoPlay={false}
      loop={false}
      style={{ width: size + 6, height: size + 6, marginTop: 2 }}
      pointerEvents="none"
    />
  );
});

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const userInfo = useSelector((s: any) => s.auth?.userInfo);

  const isAdmin = React.useMemo(
    () => !!(userInfo?.isAdmin || userInfo?.role === "admin"),
    [userInfo?.isAdmin, userInfo?.role]
  );

  // 🆕 Xác định đã đăng nhập chưa
  const isAuthed = React.useMemo(
    () => !!(userInfo?._id || userInfo?.email || userInfo?.token),
    [userInfo?._id, userInfo?.email, userInfo?.token]
  );

  const isDark = colorScheme === "dark";

  // 🔥 State để trigger animation khi nhấn lại tab Home
  const [homeAnimTrigger, setHomeAnimTrigger] = React.useState(0);

  // Custom TabBar Background
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
        tabBarActiveTintColor: Colors[colorScheme ?? "light"].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarBackground: TabBarBackground,
      }}
    >
      {/* 🏠 Trang chủ (active = Lottie, inactive = icon cũ) */}
      <Tabs.Screen
        name="index"
        listeners={{
          tabPress: () => {
            // 🔥 Mỗi lần ấn tab Home → increment trigger để replay animation
            setHomeAnimTrigger((prev) => prev + 1);
          },
        }}
        options={{
          title: "Trang chủ",
          tabBarIcon: ({ color, size, focused }) => (
            <HomeTabIcon
              color={color}
              size={size}
              focused={focused}
              triggerPlay={homeAnimTrigger} // 🔥 Pass trigger vào
            />
          ),
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
          tabBarIcon: makeIcon("dot.radiowaves.left.and.right", "broadcast"),
        }}
      />

      {/* 👤 Hồ sơ — ẩn nếu chưa đăng nhập */}
      <Tabs.Screen
        name="profile"
        options={
          isAuthed
            ? {
                title: "Hồ sơ",
                tabBarIcon: makeIcon(
                  "person.crop.circle.fill",
                  "account-circle"
                ),
              }
            : { href: null }
        }
      />
    </Tabs>
  );
}
