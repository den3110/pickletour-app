import { router, Tabs, usePathname } from "expo-router";
import React from "react";
import {
  DeviceEventEmitter,
  DynamicColorIOS,
  Platform,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import LottieView from "lottie-react-native";
import { useSelector } from "react-redux";

import { IconSymbol } from "@/components/ui/IconSymbol";
import { useColorScheme } from "@/hooks/useColorScheme";
import { buildLoginHref } from "@/services/authSession";
import { CustomTabBar } from "@/components/tabbar/Customtabbar";
import { IOS_26_NATIVE_TABS_ENABLED } from "@/utils/nativeTabs";

const HOME_LOTTIE = require("@/assets/lottie/home-lt-icon.json");
const CHATBOT_ICON = require("@/assets/images/icon-chatbot.png");

const ACTIVE_TAB_TINT = {
  light: "#8B5CF6",
  dark: "#A78BFA",
};

const SCROLL_TO_TOP_EVENT = "SCROLL_TO_TOP";

const HOME_LOTTIE_COLOR_FILTERS = (color: string) => [
  { keypath: "Fill 1", color },
  { keypath: "Group 1.Fill 1", color },
  { keypath: "Group 2.Fill 1", color },
  { keypath: "Home Outlines.Group 1.Fill 1", color },
  { keypath: "Home Outlines.Group 2.Fill 1", color },
];

const TAB_ROOT_PATHS: Record<string, string> = {
  index: "/",
  tournaments: "/tournaments",
  live: "/live",
  rankings: "/rankings",
  my_tournament: "/my_tournament",
  chat: "/chat",
  profile: "/profile",
  more: "/more",
};

const normalizePathname = (value?: string | null) => {
  const raw = String(value || "").trim();
  if (!raw) return "/";
  if (raw === "/") return "/";
  return raw.replace(/\/+$/, "") || "/";
};

const isCurrentTabRoot = (pathname: string, tabName: string) => {
  const normalizedPathname = normalizePathname(pathname);
  const targetPath = TAB_ROOT_PATHS[tabName];
  if (!targetPath) return false;
  return normalizedPathname === normalizePathname(targetPath);
};

const makeIcon = (
  sfName: string,
  androidName: keyof typeof MaterialCommunityIcons.glyphMap,
) => {
  const TabIcon = ({ color, size = 28 }: { color: string; size?: number }) =>
    Platform.OS === "ios" ? (
      <IconSymbol size={size} name={sfName} color={color} />
    ) : (
      <MaterialCommunityIcons name={androidName} size={size} color={color} />
    );

  TabIcon.displayName = `TabIcon(${sfName})`;
  return TabIcon;
};

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
  const pathname = usePathname();
  const userInfo = useSelector((state: any) => state.auth?.userInfo || null);
  const isDark = colorScheme === "dark";
  const isAuthed = Boolean(userInfo?.token || userInfo?._id || userInfo?.email);
  const activeTabTint =
    colorScheme === "dark" ? ACTIVE_TAB_TINT.dark : ACTIVE_TAB_TINT.light;
  const [homeAnimTrigger, setHomeAnimTrigger] = React.useState(0);

  const renderTabBar = React.useCallback(
    (props: any) => <CustomTabBar {...props} isDark={isDark} />,
    [isDark],
  );

  const emitScrollToTopIfNeeded = React.useCallback(
    (tabName: string) => {
      if (isCurrentTabRoot(pathname, tabName)) {
        DeviceEventEmitter.emit(SCROLL_TO_TOP_EVENT, tabName);
      }
    },
    [pathname],
  );

  if (IOS_26_NATIVE_TABS_ENABLED) {
    const { NativeTabs } = require("expo-router/unstable-native-tabs");
    const inactiveTabColor = DynamicColorIOS({
      light: "#6B7280",
      dark: "#9CA3AF",
    });

    return (
      <NativeTabs
        blurEffect="systemChromeMaterial"
        disableTransparentOnScrollEdge
        tintColor={activeTabTint}
        iconColor={{
          default: inactiveTabColor,
          selected: activeTabTint,
        }}
        labelStyle={{
          default: {
            color: inactiveTabColor,
            fontSize: 10.5,
            fontWeight: "600",
          },
          selected: {
            color: activeTabTint,
            fontSize: 10.5,
            fontWeight: "600",
          },
        }}
      >
        <NativeTabs.Trigger
          name="index"
          listeners={{
            tabPress: () => emitScrollToTopIfNeeded("index"),
          }}
        >
          <NativeTabs.Trigger.Icon
            sf={{ default: "house.fill", selected: "house.fill" }}
          />
          <NativeTabs.Trigger.Label>Trang chủ</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger
          name="tournaments"
          listeners={{
            tabPress: () => emitScrollToTopIfNeeded("tournaments"),
          }}
        >
          <NativeTabs.Trigger.Icon
            sf={{ default: "trophy.fill", selected: "trophy.fill" }}
          />
          <NativeTabs.Trigger.Label>Giải đấu</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger
          name="rankings"
          listeners={{
            tabPress: () => emitScrollToTopIfNeeded("rankings"),
          }}
        >
          <NativeTabs.Trigger.Icon
            sf={{ default: "chart.bar.fill", selected: "chart.bar.fill" }}
          />
          <NativeTabs.Trigger.Label>Xếp hạng</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger
          name="live"
          listeners={{
            tabPress: () => emitScrollToTopIfNeeded("live"),
          }}
        >
          <NativeTabs.Trigger.Icon
            sf="dot.radiowaves.left.and.right"
          />
          <NativeTabs.Trigger.Label>Live</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger
          name="more"
          listeners={{
            tabPress: () => emitScrollToTopIfNeeded("more"),
          }}
        >
          <NativeTabs.Trigger.Icon
            sf={{
              default: "ellipsis.circle.fill",
              selected: "ellipsis.circle.fill",
            }}
          />
          <NativeTabs.Trigger.Label>More</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    );
  }

  return (
    <Tabs
      tabBar={renderTabBar}
      screenOptions={{
        tabBarActiveTintColor: activeTabTint,
        headerShown: false,
        tabBarHideOnKeyboard: true,
      }}
    >
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
          tabBarIcon: makeIcon(
            "dot.radiowaves.left.and.right",
            "access-point",
          ),
        }}
      />

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

      <Tabs.Screen
        name="profile"
        listeners={({ navigation }) => ({
          tabPress: (event) => {
            if (!isAuthed) {
              event.preventDefault();
              router.replace(buildLoginHref("/profile") as any);
              return;
            }
            if (navigation.isFocused()) {
              DeviceEventEmitter.emit(SCROLL_TO_TOP_EVENT, "profile");
            }
          },
        })}
        options={{
          title: "Hồ sơ",
          tabBarIcon: makeIcon(
            "person.crop.circle.fill",
            "account-circle",
          ),
        }}
      />

      <Tabs.Screen
        name="admin"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
        name="more"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
