import React from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import * as SplashScreen from "expo-splash-screen";

type AppBootSplashProps = {
  isAppReady: boolean;
};

export default function AppBootSplash({ isAppReady }: AppBootSplashProps) {
  const [isAnimationComplete, setIsAnimationComplete] = React.useState(false);
  const hasStartedRef = React.useRef(false);
  const overlayOpacity = React.useRef(new Animated.Value(1)).current;
  const logoScale = React.useRef(new Animated.Value(0.84)).current;
  const logoTranslateY = React.useRef(new Animated.Value(0)).current;
  const textOpacity = React.useRef(new Animated.Value(0)).current;
  const textTranslateY = React.useRef(new Animated.Value(14)).current;

  React.useEffect(() => {
    if (!isAppReady || hasStartedRef.current) {
      return;
    }

    hasStartedRef.current = true;
    SplashScreen.hideAsync().catch(() => {});

    Animated.sequence([
      Animated.parallel([
        Animated.timing(textOpacity, {
          toValue: 1,
          duration: 320,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(textTranslateY, {
          toValue: 0,
          duration: 360,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(logoScale, {
          toValue: 1.04,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(450),
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 260,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(logoTranslateY, {
          toValue: -10,
          duration: 260,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(textOpacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      setIsAnimationComplete(true);
    });
  }, [
    isAppReady,
    logoScale,
    logoTranslateY,
    overlayOpacity,
    textOpacity,
    textTranslateY,
  ]);

  if (isAnimationComplete) {
    return null;
  }

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.overlay, { opacity: overlayOpacity }]}
    >
      <View style={styles.content}>
        <Animated.View
          style={{
            transform: [{ translateY: logoTranslateY }, { scale: logoScale }],
          }}
        >
          <Image
            source={require("../assets/images/icon-no-background.png")}
            style={styles.logo}
            contentFit="contain"
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.brandWrap,
            {
              opacity: textOpacity,
              transform: [{ translateY: textTranslateY }],
            },
          ]}
        >
          <Text style={styles.brandText}>PickleTour</Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    zIndex: 99999,
    elevation: 99999,
  },
  content: {
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: 136,
    height: 136,
  },
  brandWrap: {
    position: "absolute",
    top: 156,
    alignItems: "center",
  },
  brandText: {
    fontSize: 30,
    fontWeight: "800",
    color: "#071b36",
    letterSpacing: 0.4,
  },
});
