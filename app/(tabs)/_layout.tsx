import { t } from "@/utils/i18n";
import { router, Tabs, usePathname } from "expo-router";
import React from "react";
import { DeviceEventEmitter, Platform } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import LottieView from "lottie-react-native";
import { useSelector } from "react-redux";

import { IconSymbol } from "@/components/ui/IconSymbol";
import { useColorScheme } from "@/hooks/useColorScheme";
import { buildLoginHref } from "@/services/authSession";
import { FacebookTabBar } from "@/components/tabbar/FacebookTabBar";
import { useNotifUnreadCountQuery } from "@/slices/notificationCenterApiSlice";
import { SHOULD_RENDER_NATIVE_LOTTIE } from "@/utils/runtimeSafety";

const HOME_LOTTIE = SHOULD_RENDER_NATIVE_LOTTIE
  ? require("@/assets/lottie/home-lt-icon.json")
  : null;

const ACTIVE_TAB_TINT = {
  light: "#1877F2",
  dark: "#4599FF",
};

const SCROLL_TO_TOP_EVENT = "SCROLL_TO_TOP";
// freezeOnBlur: tạm dừng render (nhẹ, không đụng view tree) — safe cả 2 platform
// detachInactiveScreens: gỡ view ra khỏi native tree, khi switch tab nhanh dễ gây
// stuck (view cũ chưa attach lại thì user đã chuyển tab tiếp) → giữ nguyên tất cả
// screen trong view tree, chỉ freeze để tiết kiệm CPU.
const FREEZE_INACTIVE = true;

const HOME_LOTTIE_COLOR_FILTERS = (color: string) => [
  { keypath: "Fill 1", color },
  { keypath: "Group 1.Fill 1", color },
  { keypath: "Group 2.Fill 1", color },
  { keypath: "Home Outlines.Group 1.Fill 1", color },
  { keypath: "Home Outlines.Group 2.Fill 1", color },
];

const TAB_ROOT_PATHS: Record<string, string> = {
  index: "/",
  feed: "/feed",
  notifications: "/notifications",
  tournaments: "/tournaments",
  rankings: "/rankings",
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
  const TabIcon = ({ color, size = 26 }: { color: string; size?: number }) =>
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
  size = 26,
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

  if (!focused || !SHOULD_RENDER_NATIVE_LOTTIE || !HOME_LOTTIE) {
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
      style={{ width: size + 4, height: size + 4, marginTop: 1 }}
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

  const { data: unreadData } = useNotifUnreadCountQuery(undefined, {
    skip: !isAuthed,
    pollingInterval: 30000,
  });
  const unreadCount = Number(unreadData?.count || 0);

  const renderTabBar = React.useCallback(
    (props: any) => <FacebookTabBar {...props} isDark={isDark} />,
    [isDark],
  );

  return (
    <Tabs
      tabBar={renderTabBar}
      screenOptions={{
        tabBarActiveTintColor: activeTabTint,
        headerShown: false,
        tabBarHideOnKeyboard: true,
        // Bỏ lazy — mount TẤT CẢ tab từ đầu để switch tab tức thời, không race
        // giữa mount+navigate lúc user tap nhanh. Trade-off: memory ban đầu cao
        // hơn ~15MB, đổi lại UX tab switch mượt và tab bar luôn sync với screen.
        lazy: false,
        freezeOnBlur: FREEZE_INACTIVE,
        detachInactiveScreens: false,
        animation: "none",
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
          title: t("Trang chủ"),
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
        name="feed"
        listeners={({ navigation }) => ({
          tabPress: () => {
            if (navigation.isFocused()) {
              DeviceEventEmitter.emit(SCROLL_TO_TOP_EVENT, "feed");
            }
          },
        })}
        options={{
          title: t("Bảng tin"),
          tabBarIcon: makeIcon("newspaper.fill", "newspaper-variant"),
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
          title: t("Giải đấu"),
          tabBarIcon: makeIcon("trophy.fill", "trophy"),
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
          title: t("Xếp hạng"),
          tabBarIcon: makeIcon("chart.bar.fill", "chart-bar"),
        }}
      />

      <Tabs.Screen
        name="notifications"
        listeners={({ navigation }) => ({
          tabPress: () => {
            if (navigation.isFocused()) {
              DeviceEventEmitter.emit(SCROLL_TO_TOP_EVENT, "notifications");
            }
          },
        })}
        options={{
          title: t("Thông báo"),
          tabBarIcon: makeIcon("bell.fill", "bell"),
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
        }}
      />

      <Tabs.Screen
        name="more"
        listeners={({ navigation }) => ({
          tabPress: () => {
            if (navigation.isFocused()) {
              DeviceEventEmitter.emit(SCROLL_TO_TOP_EVENT, "more");
            }
          },
        })}
        options={{
          title: t("Khác"),
          tabBarIcon: makeIcon("ellipsis.circle.fill", "dots-horizontal-circle"),
        }}
      />

      {/* Hidden tab routes (still navigable, not shown in tab bar) */}
      <Tabs.Screen name="my_tournament" options={{ href: null }} />
      <Tabs.Screen name="chat" options={{ href: null }} />
      <Tabs.Screen
        name="profile"
        options={{ href: null }}
        listeners={() => ({
          tabPress: (event) => {
            if (!isAuthed) {
              event.preventDefault();
              router.replace(buildLoginHref("/profile") as any);
            }
          },
        })}
      />
      <Tabs.Screen name="admin" options={{ href: null }} />
    </Tabs>
  );
}
