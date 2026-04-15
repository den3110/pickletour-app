import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Animated, View, Text } from "react-native";
import { Image } from "expo-image";
import * as SplashScreen from "expo-splash-screen";

interface AppBootSplashProps {
  isAppReady: boolean;
}

export default function AppBootSplash({ isAppReady }: AppBootSplashProps) {
  const [isAnimationComplete, setIsAnimationComplete] = useState(false);
  const containerOpacity = useRef(new Animated.Value(1)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textTranslateY = useRef(new Animated.Value(15)).current;

  useEffect(() => {
    if (isAppReady) {
      // 1. Hide the native splash screen immediately so our identical view takes over
      SplashScreen.hideAsync().catch(() => { /* Ignore errors */ });

      // 2. Play the entrance animation
      Animated.sequence([
        Animated.parallel([
          Animated.spring(logoScale, {
            toValue: 1,
            useNativeDriver: true,
            tension: 50,
            friction: 7,
          }),
          Animated.timing(textOpacity, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.spring(textTranslateY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 60,
            friction: 8,
          }),
        ]),
        // 3. Hold for a moment
        Animated.delay(800),
        // 4. Fade out everything to reveal the app
        Animated.timing(containerOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setIsAnimationComplete(true);
      });
    }
  }, [isAppReady, logoScale, textOpacity, textTranslateY, containerOpacity]);

  if (isAnimationComplete) {
    return null;
  }

  return (
    <Animated.View style={[s.container, { opacity: containerOpacity }]} pointerEvents="none">
      <View style={s.content}>
        <Animated.View style={{ transform: [{ scale: logoScale }] }}>
          <Image
            source={require("../assets/images/icon-no-background.png")}
            style={s.logo}
            contentFit="contain"
          />
        </Animated.View>
        <Animated.View style={{ opacity: textOpacity, transform: [{ translateY: textTranslateY }], alignItems: "center" }}>
          <Text style={s.brandText}>PickleTour</Text>
          <Text style={s.sloganText}>Cộng đồng Pickleball của bạn</Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#ffffff",
    zIndex: 99999, // Make sure it sits on top of everything
    alignItems: "center",
    justifyContent: "center",
    elevation: 99999,
  },
  content: {
    alignItems: "center",
  },
  logo: {
    width: 136,
    height: 136,
    marginBottom: 16,
  },
  brandText: {
    fontSize: 34,
    fontWeight: "900",
    color: "#1976d2", // Brand primary blue instead of black
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  sloganText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#64748b",
    letterSpacing: 0.5,
  },
});

