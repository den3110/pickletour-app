// components/NativeLikeTabBar.tsx
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, Platform, StyleSheet } from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  interpolate,
  Extrapolate,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

type Props = {
  state: any;
  descriptors: Record<
    string,
    {
      options: any;
    }
  >;
  navigation: any;
};

const SPRING = { mass: 0.8, stiffness: 220, damping: 22 };
const TIMING = { duration: 220 };

export default function NativeLikeTabBar({
  state,
  descriptors,
  navigation,
}: Props) {
  const insets = useSafeAreaInsets();
  const routes = state.routes as any[];
  const activeIndex = state.index as number;

  // lấy palette từ screenOptions (nếu có) hoặc fallback
  const { tabBarActiveTintColor, tabBarInactiveTintColor } =
    descriptors[routes[0].key]?.options || {};
  const active =
    tabBarActiveTintColor ?? (Platform.OS === "ios" ? "#0A84FF" : "#2d7eff");
  const inactive = tabBarInactiveTintColor ?? "#98A2B3";

  // đo layout từng tab để chạy “pill”
  const [layouts, setLayouts] = useState<{ x: number; w: number }[]>(
    Array.from({ length: routes.length }, () => ({ x: 0, w: 0 }))
  );
  const ready = layouts.every((l) => l.w > 0);
  const onItemLayout = (i: number) => (e: any) => {
    const { x, width } = e.nativeEvent.layout;
    setLayouts((prev) => {
      const next = [...prev];
      next[i] = { x, w: width };
      return next;
    });
  };

  // animated “pill”
  const pillX = useSharedValue(0);
  const pillW = useSharedValue(0);

  useEffect(() => {
    if (!ready) return;
    const { x, w } = layouts[activeIndex] || { x: 0, w: 0 };
    const inset = 10;
    pillX.value = withSpring(x + inset, SPRING);
    pillW.value = withSpring(Math.max(0, w - inset * 2), SPRING);
  }, [activeIndex, ready, layouts]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillX.value }],
    width: pillW.value,
  }));

  const Container = Platform.OS === "ios" ? BlurView : View;
  const containerProps =
    Platform.OS === "ios" ? { intensity: 22, tint: "default" as const } : {};

  return (
    <View
      pointerEvents="box-none"
      style={{ paddingBottom: Math.max(insets.bottom, 8) }}
    >
      <View style={styles.outerPad}>
        <Container {...containerProps} style={styles.shell}>
          {/* liquid pill */}
          <Animated.View
            pointerEvents="none"
            style={[styles.pill, { backgroundColor: active + "22" }, pillStyle]}
          />

          <View style={styles.row}>
            {routes.map((route, i) => {
              const { options } = descriptors[route.key];
              const label = options.title ?? route.name;
              const focused = i === activeIndex;

              // dùng chính tabBarIcon user đã truyền trong <Tabs.Screen />
              const renderIcon = () => {
                const icon = options.tabBarIcon;
                if (typeof icon === "function") {
                  return icon({
                    focused,
                    color: focused ? active : inactive,
                    size: 22,
                  });
                }
                // fallback
                return null;
              };

              const onPress = () => {
                const event = navigation.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented) {
                  Haptics.selectionAsync().catch(() => {});
                  navigation.navigate(route.name);
                }
              };

              const onLongPress = () => {
                navigation.emit({ type: "tabLongPress", target: route.key });
              };

              return (
                <TabItem
                  key={route.key}
                  focused={focused}
                  active={active}
                  inactive={inactive}
                  label={label}
                  renderIcon={renderIcon}
                  onPress={onPress}
                  onLongPress={onLongPress}
                  onLayout={onItemLayout(i)}
                />
              );
            })}
          </View>
        </Container>
      </View>
    </View>
  );
}

function TabItem({
  focused,
  active,
  inactive,
  label,
  renderIcon,
  onPress,
  onLongPress,
  onLayout,
}: {
  focused: boolean;
  active: string;
  inactive: string;
  label: string;
  renderIcon: () => React.ReactNode;
  onPress: () => void;
  onLongPress: () => void;
  onLayout: any;
}) {
  // ripple nhỏ
  const ripple = useSharedValue(0);
  const rStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(ripple.value, [0, 1], [0.2, 1], Extrapolate.CLAMP) },
    ],
    opacity: interpolate(ripple.value, [0, 1], [0.35, 0], Extrapolate.CLAMP),
  }));

  const iconAnim = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    iconAnim.value = withSpring(focused ? 1 : 0, SPRING);
  }, [focused]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(iconAnim.value, [0, 1], [2, -1]) }],
  }));

  return (
    <Pressable
      onLayout={onLayout}
      onPress={() => {
        ripple.value = 0;
        ripple.value = withTiming(1, TIMING);
        onPress();
      }}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.item, pressed && { opacity: 0.88 }]}
    >
      <Animated.View
        pointerEvents="none"
        style={[styles.ripple, rStyle, { backgroundColor: active + "44" }]}
      />
      <Animated.View style={iconStyle}>{renderIcon()}</Animated.View>
      <Text
        numberOfLines={1}
        style={[styles.label, { color: focused ? active : inactive }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outerPad: { paddingHorizontal: 12 },
  shell: {
    borderRadius: 26,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor:
      Platform.OS === "android" ? "rgba(255,255,255,0.9)" : "transparent",
    ...Platform.select({
      android: { elevation: 12 },
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.12,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
      },
    }),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 2,
  },
  item: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { marginTop: 3, fontSize: 11.5, fontWeight: "600" },
  pill: { position: "absolute", top: 6, bottom: 6, borderRadius: 20 },
  ripple: {
    position: "absolute",
    width: 42,
    height: 42,
    borderRadius: 21,
    top: 2,
  },
});
