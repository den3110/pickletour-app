import { Tabs } from "expo-router";
import React from "react";
import { Platform, DeviceEventEmitter } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSelector } from "react-redux";
import { Image } from "expo-image";

import { IconSymbol } from "@/components/ui/IconSymbol";
import { useColorScheme } from "@/hooks/useColorScheme";
import { CustomTabBar } from "@/components/tabbar/Customtabbar";
import LottieView from "lottie-react-native";

/** Lottie icon cho tab Home (active) */
const HOME_LOTTIE = require("@/assets/lottie/home-lt-icon.json");
/** Icon bot mới */
const CHATBOT_ICON = require("@/assets/images/icon-chatbot.png");
const ACTIVE_TAB_TINT = {
  light: "#8B5CF6",
  dark: "#A78BFA",
};
const HOME_LOTTIE_COLOR_FILTERS = (color: string) => [
  { keypath: "Fill 1", color },
  { keypath: "Group 1.Fill 1", color },
  { keypath: "Group 2.Fill 1", color },
  { keypath: "Home Outlines.Group 1.Fill 1", color },
  { keypath: "Home Outlines.Group 2.Fill 1", color },
];

// Event constant cho scroll to top
const SCROLL_TO_TOP_EVENT = "SCROLL_TO_TOP";

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
      colorFilters={HOME_LOTTIE_COLOR_FILTERS(color)}
      style={{ width: size + 6, height: size + 6, marginTop: 2 }}
      pointerEvents="none"
    />
  );
});

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const userInfo = useSelector((s: any) => s.auth?.userInfo);
  const activeTabTint =
    colorScheme === "dark" ? ACTIVE_TAB_TINT.dark : ACTIVE_TAB_TINT.light;

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
        tabBarActiveTintColor: activeTabTint,
        headerShown: false,
        tabBarHideOnKeyboard: true,
      }}
    >
      {/* 🏠 Trang chủ - Tab 1 */}
      <Tabs.Screen
        name="index"
        listeners={({ navigation }) => ({
          tabPress: () => {
            if (navigation.isFocused()) {
              DeviceEventEmitter.emit(SCROLL_TO_TOP_EVENT, "index");
            }
            setHomeAnimTrigger((prev) => prev + 1);
          },
        })}
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
        listeners={({ navigation }) => ({
          tabPress: () => {
            if (navigation.isFocused()) {
              DeviceEventEmitter.emit(SCROLL_TO_TOP_EVENT, "tournaments");
            }
          },
        })}
        options={{
          title: "Giải đấu",
          tabBarIcon: makeIcon("trophy.fill", "trophy"),
        }}
      />

      {/* 📡 Live - Tab 3 */}
      <Tabs.Screen
        name="live"
        listeners={({ navigation }) => ({
          tabPress: () => {
            if (navigation.isFocused()) {
              DeviceEventEmitter.emit(SCROLL_TO_TOP_EVENT, "live");
            }
          },
        })}
        options={{
          title: "Live",
          tabBarIcon: makeIcon("dot.radiowaves.left.and.right", "access-point"),
        }}
      />

      {/* 📊 Xếp hạng - Tab 4 (Floating giữa) */}
      <Tabs.Screen
        name="rankings"
        listeners={({ navigation }) => ({
          tabPress: () => {
            if (navigation.isFocused()) {
              DeviceEventEmitter.emit(SCROLL_TO_TOP_EVENT, "rankings");
            }
          },
        })}
        options={{
          title: "Xếp hạng",
          tabBarIcon: makeIcon("chart.bar.fill", "chart-bar"),
        }}
      />

      {/* 🎾 Giải của tôi - Tab 5 */}
      <Tabs.Screen
        name="my_tournament"
        listeners={({ navigation }) => ({
          tabPress: () => {
            if (navigation.isFocused()) {
              DeviceEventEmitter.emit(SCROLL_TO_TOP_EVENT, "my_tournament");
            }
          },
        })}
        options={{
          title: "Giải của tôi",
          tabBarIcon: makeIcon("sportscourt.fill", "tennis-ball"),
        }}
      />

      {/* 🤖 Trợ lý AI - Tab 6 (dùng expo-image cho ảnh bot) */}
      <Tabs.Screen
        name="chat"
        listeners={({ navigation }) => ({
          tabPress: () => {
            if (navigation.isFocused()) {
              DeviceEventEmitter.emit(SCROLL_TO_TOP_EVENT, "chat");
            }
          },
        })}
        options={{
          title: "Trợ lý",
          tabBarIcon: ({ size = 28, focused }) => (
            <Image
              source={CHATBOT_ICON}
              style={{
                width: size + 4,
                height: size + 4,
                opacity: focused ? 1 : 0.7,
              }}
              contentFit="contain"
            />
          ),
        }}
      />

      {/* 👤 Hồ sơ - Tab 7 */}
      <Tabs.Screen
        name="profile"
        listeners={({ navigation }) => ({
          tabPress: () => {
            if (navigation.isFocused()) {
              DeviceEventEmitter.emit(SCROLL_TO_TOP_EVENT, "profile");
            }
          },
        })}
        options={{
          title: "Hồ sơ",
          tabBarIcon: makeIcon("person.crop.circle.fill", "account-circle"),
        }}
      />

      {/* 🔒 Quản trị - Ẩn khỏi tab bar */}
      <Tabs.Screen
        name="admin"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
