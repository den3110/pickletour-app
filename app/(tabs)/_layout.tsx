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
import { CustomTabBar } from "@/components/tabbar/Customtabbar";

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
  triggerPlay,
}: {
  color: string;
  size?: number;
  focused?: boolean;
  triggerPlay?: number;
}) {
  const lottieRef = React.useRef<LottieView>(null);

  React.useEffect(() => {
    if (focused) {
      lottieRef.current?.reset?.();
      lottieRef.current?.play?.();
    } else {
      lottieRef.current?.reset?.();
    }
  }, [focused]);

  React.useEffect(() => {
    if (focused && triggerPlay && triggerPlay > 0) {
      lottieRef.current?.reset?.();
      lottieRef.current?.play?.();
    }
  }, [triggerPlay, focused]);

  if (!focused) {
    return Platform.OS === "ios" ? (
      <IconSymbol size={size} name="house.fill" color={color} />
    ) : (
      <MaterialCommunityIcons name="home" size={size} color={color} />
    );
  }

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

  const isAuthed = React.useMemo(
    () => !!(userInfo?._id || userInfo?.email || userInfo?.token),
    [userInfo?._id, userInfo?.email, userInfo?.token]
  );

  const isDark = colorScheme === "dark";

  const [homeAnimTrigger, setHomeAnimTrigger] = React.useState(0);

  // 🎨 Custom TabBar với floating button
  const renderTabBar = React.useCallback(
    (props: any) => <CustomTabBar {...props} isDark={isDark} />,
    [isDark]
  );

  return (
    <Tabs
      tabBar={renderTabBar}
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? "light"].tint,
        headerShown: false,
        tabBarHideOnKeyboard: true,
      }}
    >
      {/* 🏠 Trang chủ - Tab 1 */}
      <Tabs.Screen
        name="index"
        listeners={{
          tabPress: () => {
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
              triggerPlay={homeAnimTrigger}
            />
          ),
        }}
      />

      {/* 🏆 Giải đấu - Tab 2 */}
      <Tabs.Screen
        name="tournaments"
        options={{
          title: "Giải đấu",
          tabBarIcon: makeIcon("trophy.fill", "trophy"),
        }}
      />

      {/* 📊 Xếp hạng (BXH) - Tab 3 - FLOATING BUTTON Ở GIỮA */}
      <Tabs.Screen
        name="rankings"
        options={{
          title: "Xếp hạng",
          tabBarIcon: makeIcon("chart.bar.fill", "chart-bar"),
        }}
      />

      {/* 🎾 Giải của tôi - Tab 4 */}
      <Tabs.Screen
        name="my_tournament"
        options={{
          title: "Giải của tôi",
          tabBarIcon: makeIcon("sportscourt.fill", "tennis-ball"),
        }}
      />

      {/* 👤 Hồ sơ - Tab 5 */}
      <Tabs.Screen
        name="profile"
        options={{
          title: "Hồ sơ",
          tabBarIcon: makeIcon("person.crop.circle.fill", "account-circle"),
        }}
      />

      {/* 🔒 Quản trị - Ẩn khỏi tab bar */}
      <Tabs.Screen
        name="admin"
        options={{
          href: null, // Ẩn hoàn toàn
        }}
      />

      {/* 📡 Live - Ẩn khỏi tab bar */}
      <Tabs.Screen
        name="live"
        options={{
          href: null, // Ẩn hoàn toàn
        }}
      />
    </Tabs>
  );
}
