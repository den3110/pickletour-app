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
  withSequence,
  Easing,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const TAB_BAR_HEIGHT = 70;
const FLOATING_BUTTON_SIZE = 64;

interface CustomTabBarPremiumProps extends BottomTabBarProps {
  isDark: boolean;
}

export function CustomTabBarPremium({
  state,
  descriptors,
  navigation,
  isDark,
}: CustomTabBarPremiumProps) {
  const centerIndex = Math.floor(state.routes.length / 2);

  const renderTabButton = (route: any, index: number) => {
    const { options } = descriptors[route.key];
    const isFocused = state.index === index;

    // 🎨 Animations
    const scale = useSharedValue(isFocused ? 1 : 0.85);
    const opacity = useSharedValue(isFocused ? 1 : 0.5);
    const translateY = useSharedValue(0);
    const rotate = useSharedValue(0);

    React.useEffect(() => {
      scale.value = withSpring(isFocused ? 1 : 0.85, {
        damping: 12,
        stiffness: 100,
      });
      opacity.value = withTiming(isFocused ? 1 : 0.5, { duration: 200 });

      if (isFocused && index === centerIndex) {
        translateY.value = withSequence(
          withSpring(-5, { damping: 8 }),
          withSpring(0, { damping: 8 })
        );
        rotate.value = withSequence(
          withTiming(360, {
            duration: 500,
            easing: Easing.bezier(0.25, 0.1, 0.25, 1),
          }),
          withTiming(0, { duration: 0 })
        );
      }
    }, [isFocused]);

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [
        { scale: scale.value },
        { translateY: translateY.value },
        { rotate: `${rotate.value}deg` },
      ],
      opacity: opacity.value,
    }));

    const onPress = () => {
      if (Platform.OS === "ios") {
        Haptics.impactAsync(
          isFocused
            ? Haptics.ImpactFeedbackStyle.Medium
            : Haptics.ImpactFeedbackStyle.Light
        );
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
      if (Platform.OS === "ios") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      navigation.emit({
        type: "tabLongPress",
        target: route.key,
      });
    };

    // 🌟 FLOATING CENTER BUTTON
    if (index === centerIndex) {
      return (
        <View key={route.key} style={styles.floatingButtonContainer}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            onPress={onPress}
            onLongPress={onLongPress}
            activeOpacity={0.8}
          >
            <Animated.View style={[styles.floatingButton, animatedStyle]}>
              <View
                style={[
                  styles.glowRing,
                  { opacity: isFocused ? 0.3 : 0 },
                ]}
              />
              <LinearGradient
                colors={
                  isFocused
                    ? isDark
                      ? ["#667eea", "#764ba2"]
                      : ["#4facfe", "#00f2fe"]
                    : isDark
                    ? ["#3A3A3C", "#2C2C2E"]
                    : ["#E5E5EA", "#D1D1D6"]
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.gradientButton}
              >
                {options.tabBarIcon?.({
                  focused: isFocused,
                  color: isFocused
                    ? "#FFFFFF"
                    : isDark
                    ? "#8E8E93"
                    : "#8E8E93",
                  size: 30,
                })}
                {isFocused && (
                  <View style={styles.activeDot}>
                    <View style={styles.activeDotInner} />
                  </View>
                )}
              </LinearGradient>
            </Animated.View>
          </TouchableOpacity>
        </View>
      );
    }

    // 📱 REGULAR TAB
    return (
      <TouchableOpacity
        key={route.key}
        accessibilityRole="button"
        accessibilityState={isFocused ? { selected: true } : {}}
        onPress={onPress}
        onLongPress={onLongPress}
        style={styles.tabButton}
        activeOpacity={0.7}
      >
        <Animated.View style={[styles.tabButtonInner, animatedStyle]}>
          {isFocused && (
            <View
              style={[
                styles.activePill,
                {
                  backgroundColor: isDark
                    ? "rgba(102, 126, 234, 0.15)"
                    : "rgba(0, 122, 255, 0.1)",
                },
              ]}
            />
          )}
          {options.tabBarIcon?.({
            focused: isFocused,
            color: isFocused
              ? isDark
                ? "#667eea"
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
                { backgroundColor: isDark ? "#667eea" : "#007AFF" },
              ]}
            />
          )}
        </Animated.View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.notchContainer}>
        <BlurView
          intensity={isDark ? 90 : 100}
          tint={isDark ? "dark" : "light"}
          style={[
            styles.notchBlur,
            {
              backgroundColor: isDark
                ? "rgba(28, 28, 30, 0.7)"
                : "rgba(255, 255, 255, 0.7)",
            },
          ]}
        />
      </View>

      <BlurView
        intensity={isDark ? 95 : 100}
        tint={isDark ? "dark" : "light"}
        style={styles.blurView}
      >
        <LinearGradient
          colors={
            isDark
              ? ["rgba(28, 28, 30, 0.8)", "rgba(28, 28, 30, 0.95)"]
              : ["rgba(255, 255, 255, 0.8)", "rgba(255, 255, 255, 0.95)"]
          }
          style={styles.tabBarContent}
        >
          {state.routes.map((route, index) => renderTabButton(route, index))}
        </LinearGradient>

        <LinearGradient
          colors={
            isDark
              ? ["rgba(102, 126, 234, 0.3)", "rgba(118, 75, 162, 0.3)"]
              : ["rgba(79, 172, 254, 0.3)", "rgba(0, 242, 254, 0.3)"]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.topBorderGradient}
        />
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  notchContainer: {
    position: "absolute",
    bottom: TAB_BAR_HEIGHT - 15,
    left: SCREEN_WIDTH / 2 - 50,
    width: 100,
    height: 30,
    overflow: "hidden",
    zIndex: 1,
  },
  notchBlur: {
    flex: 1,
    borderTopLeftRadius: 50,
    borderTopRightRadius: 50,
  },
  blurView: {
    overflow: "hidden",
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  tabBarContent: {
    flexDirection: "row",
    height: TAB_BAR_HEIGHT,
    paddingBottom: Platform.OS === "ios" ? 20 : 10,
  },
  topBorderGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 2,
  },
  tabButton: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  tabButtonInner: {
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  activePill: {
    position: "absolute",
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  activeIndicator: {
    position: "absolute",
    bottom: -8,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  floatingButtonContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    marginTop: -FLOATING_BUTTON_SIZE / 2 - 5,
  },
  floatingButton: {
    width: FLOATING_BUTTON_SIZE,
    height: FLOATING_BUTTON_SIZE,
    justifyContent: "center",
    alignItems: "center",
  },
  glowRing: {
    position: "absolute",
    width: FLOATING_BUTTON_SIZE + 20,
    height: FLOATING_BUTTON_SIZE + 20,
    borderRadius: (FLOATING_BUTTON_SIZE + 20) / 2,
    backgroundColor: "#667eea",
    zIndex: 0,
  },
  gradientButton: {
    width: FLOATING_BUTTON_SIZE,
    height: FLOATING_BUTTON_SIZE,
    borderRadius: FLOATING_BUTTON_SIZE / 2,
    justifyContent: "center",
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#667eea",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
      },
      android: {
        elevation: 15,
      },
    }),
  },
  activeDot: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  activeDotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FFFFFF",
  },
});