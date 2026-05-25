import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Animated, View, Text } from "react-native";
import { Image } from "expo-image";
import * as SplashScreen from "expo-splash-screen";

// Global flag: splash chỉ hiện đúng 1 lần duy nhất trong session
let __splashAlreadyShown__ = false;

interface AppBootSplashProps {
  isAppReady: boolean;
  isDark?: boolean;
}

export default function AppBootSplash({ isAppReady, isDark = false }: AppBootSplashProps) {
  const [isAnimationComplete, setIsAnimationComplete] = useState(
    __splashAlreadyShown__,
  );
  const containerOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isAppReady) {
      SplashScreen.hideAsync().catch(() => {});

      if (__splashAlreadyShown__) {
        setIsAnimationComplete(true);
        return;
      }

      __splashAlreadyShown__ = true;

      // Giữ splash 1 giây rồi fade out
      Animated.sequence([
        Animated.delay(1000),
        Animated.timing(containerOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setIsAnimationComplete(true);
      });
    }
  }, [isAppReady, containerOpacity]);

  if (isAnimationComplete) {
    return null;
  }

  return (
    <Animated.View
      style={[
        s.container,
        { opacity: containerOpacity, backgroundColor: isDark ? "#0b0c10" : "#ffffff" },
      ]}
      pointerEvents="none"
    >
      <View style={s.content}>
        <Image
          source={require("../assets/images/icon-no-background.png")}
          style={s.logo}
          contentFit="contain"
        />
        <View style={s.textContainer}>
          <Text style={[s.brandText, { color: isDark ? "#7cc0ff" : "#1976d2" }]}>
            PickleTour
          </Text>
          <Text style={[s.sloganText, { color: isDark ? "#94a3b8" : "#64748b" }]}>
            Cộng đồng Pickleball của bạn
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99999,
    alignItems: "center",
    justifyContent: "center",
    elevation: 99999,
  },
  content: {
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: 180,
    height: 180,
  },
  textContainer: {
    marginTop: 16,
    alignItems: "center",
  },
  brandText: {
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  sloganText: {
    fontSize: 14,
    fontWeight: "500",
    letterSpacing: 0.5,
  },
});
