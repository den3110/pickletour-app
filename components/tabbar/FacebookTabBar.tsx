import React from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "@/components/ui/i18nText";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";

interface Props extends BottomTabBarProps {
  isDark: boolean;
}

const HIDDEN_ROUTES = new Set([
  "admin",
  "my_tournament",
  "chat",
  "profile",
  "live",
]);

const shouldHideRoute = (routeName?: string) => {
  const n = String(routeName || "").trim().toLowerCase();
  if (HIDDEN_ROUTES.has(n)) return true;
  if (n.startsWith("admin/") || n.startsWith("more/")) return true;
  return false;
};

// Per-tab accent colors — vibrant sport palette
const TAB_ACCENTS: Record<string, string> = {
  index: "#1877F2",         // Home — blue
  feed: "#8B5CF6",          // Feed — purple
  tournaments: "#F59E0B",   // Tournament — gold/amber
  rankings: "#10B981",      // Rankings — emerald
  notifications: "#EF4444", // Notifications — red
  more: "#64748B",          // More — slate
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function TabItem({
  route,
  options,
  isFocused,
  isDark,
  onPress,
  onLongPress,
}: {
  route: any;
  options: any;
  isFocused: boolean;
  isDark: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const scale = useSharedValue(isFocused ? 1 : 0.94);
  const pillOpacity = useSharedValue(isFocused ? 1 : 0);

  React.useEffect(() => {
    scale.value = withSpring(isFocused ? 1 : 0.94, {
      damping: 14,
      stiffness: 220,
    });
    pillOpacity.value = withSpring(isFocused ? 1 : 0, {
      damping: 18,
      stiffness: 200,
    });
  }, [isFocused]);

  const iconAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const pillAnimStyle = useAnimatedStyle(() => ({
    opacity: pillOpacity.value,
    transform: [{ scale: 0.9 + pillOpacity.value * 0.15 }],
  }));

  const accent = TAB_ACCENTS[route.name] || "#1877F2";
  const inactiveColor = isDark ? "#8E8E93" : "#8A8F98";
  const iconColor = isFocused ? accent : inactiveColor;
  const labelColor = isFocused ? accent : inactiveColor;

  const label =
    typeof options.tabBarLabel === "string"
      ? options.tabBarLabel
      : typeof options.title === "string"
      ? options.title
      : route.name;
  const badge = (options as any).tabBarBadge;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={isFocused ? { selected: true } : {}}
      accessibilityLabel={options.tabBarAccessibilityLabel || label}
      onPress={onPress}
      onLongPress={onLongPress}
      android_ripple={{
        color: accent + "22",
        borderless: true,
        radius: 36,
      }}
      style={styles.tab}
    >
      <View style={styles.iconWrap}>
        <Animated.View
          style={[
            styles.pill,
            { backgroundColor: accent + (isDark ? "33" : "22") },
            pillAnimStyle,
          ]}
        />
        <Animated.View style={iconAnimStyle}>
          {options.tabBarIcon?.({
            focused: isFocused,
            color: iconColor,
            size: 24,
          })}
        </Animated.View>
        {badge != null && (
          <View style={styles.badgeShadow}>
            <LinearGradient
              colors={["#FF4D4F", "#E41E3F"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.badge}
            >
              <Text style={styles.badgeText} numberOfLines={1}>
                {typeof badge === "number" && badge > 99
                  ? "99+"
                  : String(badge)}
              </Text>
            </LinearGradient>
          </View>
        )}
      </View>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        allowFontScaling={false}
        style={[
          styles.label,
          { color: labelColor, fontWeight: isFocused ? "800" : "600" },
        ]}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

export function FacebookTabBar({
  state,
  descriptors,
  navigation,
  isDark,
}: Props) {
  const insets = useSafeAreaInsets();

  const visibleRoutes = React.useMemo(
    () =>
      state.routes.filter((route) => {
        const opt = descriptors[route.key].options;
        if (shouldHideRoute(route.name)) return false;
        return opt.href !== null;
      }),
    [descriptors, state.routes],
  );

  const bottomPad = Math.max(insets.bottom, Platform.OS === "ios" ? 8 : 6);

  return (
    <View style={styles.outer} pointerEvents="box-none">
      {/* Accent top gradient line */}
      <LinearGradient
        colors={["#1877F2", "#8B5CF6", "#F59E0B", "#10B981", "#EF4444"]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.topAccent}
      />
      <View
        style={[
          styles.wrapper,
          {
            backgroundColor: isDark ? "#111214" : "#FFFFFF",
            paddingBottom: bottomPad,
            shadowOpacity: isDark ? 0.35 : 0.08,
          },
        ]}
      >
        {visibleRoutes.map((route) => {
          const { options } = descriptors[route.key];
          const originalIndex = state.routes.findIndex(
            (r) => r.key === route.key,
          );
          const isFocused = state.index === originalIndex;

          const onPress = () => {
            if (Platform.OS === "ios") {
              Haptics.selectionAsync();
            }
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };
          const onLongPress = () => {
            navigation.emit({
              type: "tabLongPress",
              target: route.key,
            });
          };

          return (
            <TabItem
              key={route.key}
              route={route}
              options={options}
              isFocused={isFocused}
              isDark={isDark}
              onPress={onPress}
              onLongPress={onLongPress}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    position: "relative",
  },
  topAccent: {
    height: 2,
    width: "100%",
  },
  wrapper: {
    flexDirection: "row",
    paddingTop: 8,
    paddingHorizontal: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowRadius: 10,
    elevation: 8,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 2,
    paddingHorizontal: 2,
    minWidth: 0,
  },
  iconWrap: {
    width: 48,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  pill: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    borderRadius: 16,
  },
  label: {
    fontSize: 10,
    marginTop: 4,
    textAlign: "center",
    width: "100%",
    letterSpacing: 0.2,
  },
  badgeShadow: {
    position: "absolute",
    top: -3,
    right: -6,
    borderRadius: 10,
    shadowColor: "#E41E3F",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 12,
  },
});
