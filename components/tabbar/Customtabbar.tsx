import React from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Dimensions,
} from "react-native";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import Svg, { Path } from "react-native-svg";

// Không cần dùng useSafeAreaInsets cho tính toán chiều cao trên Android nữa để tránh bị đẩy cao
// import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const TAB_BAR_HEIGHT = 65;
const FLOATING_BUTTON_SIZE = 60;
const CURVE_WIDTH = 100;
const CURVE_HEIGHT = 20;

interface CustomTabBarProps extends BottomTabBarProps {
  isDark: boolean;
}

export function CustomTabBar({
  state,
  descriptors,
  navigation,
  isDark,
}: CustomTabBarProps) {
  // 🔧 FIX ANDROID:
  // Trên iOS: Cần đệm 20px cho thanh vuốt về Home.
  // Trên Android: Đặt là 0 hoặc nhỏ (ví dụ 4) để TabBar sát đáy, không bị nav bar đẩy lên.
  const extraPaddingBottom = Platform.OS === "ios" ? 20 : 0;

  const visibleRoutes = state.routes.filter((route) => {
    const { options } = descriptors[route.key];
    return options.href !== null;
  });

  const floatingButtonIndex = visibleRoutes.findIndex(
    (route) => route.name === "rankings"
  );

  const renderTabButton = (route: any, visibleIndex: number) => {
    const { options } = descriptors[route.key];
    const originalIndex = state.routes.findIndex((r) => r.key === route.key);
    const isFocused = state.index === originalIndex;

    const scale = useSharedValue(isFocused ? 1 : 0.9);
    const opacity = useSharedValue(isFocused ? 1 : 0.6);

    React.useEffect(() => {
      scale.value = withSpring(isFocused ? 1 : 0.9, {
        damping: 15,
        stiffness: 150,
      });
      opacity.value = withTiming(isFocused ? 1 : 0.6, { duration: 200 });
    }, [isFocused]);

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [{ scale: scale.value }],
      opacity: opacity.value,
    }));

    const onPress = () => {
      if (Platform.OS === "ios") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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

    // Nút giữa (Floating) - Chỉ render placeholder ở đây
    if (visibleIndex === floatingButtonIndex) {
      return (
        <View
          key={route.key}
          style={[styles.floatingContainer, { height: TAB_BAR_HEIGHT }]} // Giữ chỗ đúng bằng chiều cao chuẩn
        />
      );
    }

    // Tab thường
    return (
      <TouchableOpacity
        key={route.key}
        accessibilityRole="button"
        accessibilityState={isFocused ? { selected: true } : {}}
        accessibilityLabel={options.tabBarAccessibilityLabel}
        testID={options.tabBarTestID}
        onPress={onPress}
        onLongPress={onLongPress}
        style={styles.tabButton}
        activeOpacity={0.7}
      >
        <Animated.View style={[styles.tabButtonInner, animatedStyle]}>
          {options.tabBarIcon?.({
            focused: isFocused,
            color: isFocused
              ? isDark
                ? "#4A90E2"
                : "#007AFF"
              : isDark
              ? "#8E8E93"
              : "#8E8E93",
            size: 24,
          })}

          {isFocused && (
            <View
              style={[
                styles.activeIndicator,
                {
                  backgroundColor: isDark ? "#4A90E2" : "#007AFF",
                },
              ]}
            />
          )}
        </Animated.View>
      </TouchableOpacity>
    );
  };

  const bgColor = "transparent";

  return (
    <View
      style={[
        styles.wrapper,
        {
          // Chiều cao tổng = 65 (Tab) + 20 (Curve) + Padding đáy (0 ở Android)
          height: TAB_BAR_HEIGHT + CURVE_HEIGHT + extraPaddingBottom,
          bottom: 0,
        },
      ]}
    >
      {/* Floating Button (Absolute - nằm đè lên trên cùng) */}
      <View style={styles.floatingButtonAbsolute}>
        {visibleRoutes.map((route, visibleIndex) => {
          if (visibleIndex === floatingButtonIndex) {
            const { options } = descriptors[route.key];
            const originalIndex = state.routes.findIndex(
              (r) => r.key === route.key
            );
            const isFocused = state.index === originalIndex;

            const onPress = () => {
              if (Platform.OS === "ios") {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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

            return (
              <TouchableOpacity
                key={route.key}
                onPress={onPress}
                activeOpacity={0.85}
                style={styles.absoluteFloatingTouch}
              >
                <View
                  style={[
                    styles.absoluteFloatingButton,
                    {
                      backgroundColor: isFocused
                        ? isDark
                          ? "#4A90E2"
                          : "#007AFF"
                        : isDark
                        ? "#3A3A3C"
                        : "#F2F2F7",
                    },
                  ]}
                >
                  {options.tabBarIcon?.({
                    focused: isFocused,
                    color: isFocused
                      ? "#FFFFFF"
                      : isDark
                      ? "#FFFFFF"
                      : "#007AFF",
                    size: 30,
                  })}
                </View>
              </TouchableOpacity>
            );
          }
          return null;
        })}
      </View>

      {/* TabBar Container */}
      <View style={styles.tabBarContainer}>
        {/* Đường cong Svg */}
        <View style={styles.curveWrapper}>
          <Svg
            width={SCREEN_WIDTH}
            height={CURVE_HEIGHT + 10}
            style={styles.curveSvg}
          >
            <Path
              d={`
                M 0,${CURVE_HEIGHT + 10}
                L 0,${CURVE_HEIGHT}
                L ${(SCREEN_WIDTH - CURVE_WIDTH) / 2},${CURVE_HEIGHT}
                Q ${(SCREEN_WIDTH - CURVE_WIDTH) / 2},0 ${
                SCREEN_WIDTH / 2 - FLOATING_BUTTON_SIZE / 2 - 10
              },0
                L ${SCREEN_WIDTH / 2 + FLOATING_BUTTON_SIZE / 2 + 10},0
                Q ${(SCREEN_WIDTH + CURVE_WIDTH) / 2},0 ${
                (SCREEN_WIDTH + CURVE_WIDTH) / 2
              },${CURVE_HEIGHT}
                L ${SCREEN_WIDTH},${CURVE_HEIGHT}
                L ${SCREEN_WIDTH},${CURVE_HEIGHT + 10}
                Z
              `}
              fill={bgColor}
            />
          </Svg>
        </View>

        {/* BlurView chứa nội dung Tab */}
        <BlurView
          intensity={isDark ? 90 : 100}
          tint={isDark ? "dark" : "light"}
          style={styles.blurView}
        >
          <View
            style={[
              styles.tabBarContent,
              {
                backgroundColor: isDark
                  ? "rgba(28, 28, 30, 0.85)"
                  : "rgba(255, 255, 255, 0.85)",

                // Chiều cao background = 65 + padding (để phủ kín đáy)
                height: TAB_BAR_HEIGHT + extraPaddingBottom,

                // 🔧 QUAN TRỌNG: Không dùng paddingBottom cho content nữa
                // để tránh đẩy icon lên trên
                paddingBottom: 0,
              },
            ]}
          >
            {visibleRoutes.map((route, visibleIndex) => {
              return renderTabButton(route, visibleIndex);
            })}
          </View>
        </BlurView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 0,
    right: 0,
  },
  floatingButtonAbsolute: {
    position: "absolute",
    top: 0,
    left: SCREEN_WIDTH / 2 - FLOATING_BUTTON_SIZE / 2,
    zIndex: 999,
  },
  absoluteFloatingTouch: {
    width: FLOATING_BUTTON_SIZE,
    height: FLOATING_BUTTON_SIZE,
  },
  absoluteFloatingButton: {
    width: FLOATING_BUTTON_SIZE,
    height: FLOATING_BUTTON_SIZE,
    borderRadius: FLOATING_BUTTON_SIZE / 2,
    justifyContent: "center",
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  tabBarContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  curveWrapper: {
    position: "absolute",
    top: -CURVE_HEIGHT,
    left: 0,
    right: 0,
    height: CURVE_HEIGHT + 10,
    zIndex: 1,
  },
  curveSvg: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  blurView: {
    overflow: "visible",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  tabBarContent: {
    flexDirection: "row",
    // 🔧 Căn chỉnh icon lên phía trên (top) của vùng chứa
    alignItems: "flex-start",
    borderTopWidth: 0.5,
    borderTopColor: "rgba(0, 0, 0, 0.1)",
  },
  tabButton: {
    flex: 1,
    // 🔧 Set cứng chiều cao nút bằng đúng 65px
    // Việc này đảm bảo icon luôn nằm giữa vùng 65px chuẩn, bất kể padding bên dưới dài bao nhiêu
    height: TAB_BAR_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
  },
  tabButtonInner: {
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  activeIndicator: {
    position: "absolute",
    bottom: -4,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  floatingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  floatingButton: {
    width: FLOATING_BUTTON_SIZE,
    height: FLOATING_BUTTON_SIZE,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  outerRing: {
    position: "absolute",
    width: FLOATING_BUTTON_SIZE + 12,
    height: FLOATING_BUTTON_SIZE + 12,
    borderRadius: (FLOATING_BUTTON_SIZE + 12) / 2,
    borderWidth: 3,
  },
  floatingButtonInner: {
    width: FLOATING_BUTTON_SIZE,
    height: FLOATING_BUTTON_SIZE,
    borderRadius: FLOATING_BUTTON_SIZE / 2,
    justifyContent: "center",
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  activeDotSmall: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  activeDotInner: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});
