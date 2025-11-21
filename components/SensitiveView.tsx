// components/SensitiveView.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  AppState,
  AppStateStatus,
  Animated,
  Easing,
  Platform,
} from "react-native";
import * as ScreenCapture from "expo-screen-capture";
import { BlurView } from "expo-blur";

type Props = {
  children: React.ReactNode;
  enabled?: boolean; // mặc định true
  blurOnCapture?: boolean; // blur khi phát hiện screenshot / app vào nền
  blurIntensity?: number; // 0-100
  showWatermark?: boolean; // watermark động
  watermarkText?: string;
};

export default function SensitiveView({
  children,
  enabled = true,
  blurOnCapture = true,
  blurIntensity = 40,
  showWatermark = true,
  watermarkText = "CONFIDENTIAL",
}: Props) {
  const [justScreenshot, setJustScreenshot] = useState(false);
  const [inBackground, setInBackground] = useState(false);
  const timeRef = useRef<NodeJS.Timeout | null>(null);

  // 1) Bật/tắt ngăn chụp màn hình ở mức OS
  useEffect(() => {
    let active = true;
    (async () => {
      if (!enabled) {
        await ScreenCapture.allowScreenCaptureAsync().catch(() => {});
        return;
      }
      await ScreenCapture.preventScreenCaptureAsync().catch(() => {});
    })();
    return () => {
      if (active) {
        ScreenCapture.allowScreenCaptureAsync().catch(() => {});
        active = false;
      }
    };
  }, [enabled]);

  // 2) Lắng nghe sự kiện screenshot (CHỈ sửa chỗ này so với bản cũ)
  useEffect(() => {
    const subShot = ScreenCapture.addScreenshotListener(() => {
      setJustScreenshot(true);
      if (timeRef.current) clearTimeout(timeRef.current);
      timeRef.current = setTimeout(() => setJustScreenshot(false), 2500);
    });
    return () => {
      subShot.remove();
      if (timeRef.current) clearTimeout(timeRef.current);
    };
  }, []);

  // 3) Che App Switcher preview (khi app vào nền) bằng blur overlay
  useEffect(() => {
    const onChange = (state: AppStateStatus) =>
      setInBackground(state !== "active");
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, []);

  // 4) Watermark động
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.timing(anim, {
        toValue: 1,
        duration: 6000,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      })
    ).start();
  }, [anim]);

  const translate = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-20, 20],
  });

  // ĐÃ SỬA: không còn isRecording
  const shouldBlur = blurOnCapture && (justScreenshot || inBackground);

  return (
    <View style={styles.container}>
      {children}

      {showWatermark && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.watermarkWrap,
            {
              transform: [
                { translateX: translate },
                { translateY: translate },
                { rotate: "-24deg" },
              ],
              opacity: shouldBlur ? 0.7 : 0.25,
            },
          ]}
        >
          {[...Array(6)].map((_, row) => (
            <View key={`wm-row-${row}`} style={styles.watermarkRow}>
              {[...Array(3)].map((__, col) => (
                <View key={`wm-${row}-${col}`} style={styles.watermarkItem}>
                  {/* Nếu muốn dùng chữ thật: thay block này bằng <Text style={styles.watermarkText}>{watermarkText}</Text> */}
                  <View style={styles.watermarkTextBox}>
                    <View style={styles.watermarkTextInner}>
                      <View
                        style={[styles.watermarkBlock, { opacity: 0.08 }]}
                      />
                    </View>
                  </View>
                </View>
              ))}
            </View>
          ))}
        </Animated.View>
      )}

      {shouldBlur && (
        <BlurView
          intensity={blurIntensity}
          tint={Platform.OS === "ios" ? "systemChromeMaterial" : "dark"}
          style={StyleSheet.absoluteFill}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  watermarkWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  watermarkRow: { flexDirection: "row", marginVertical: 16 },
  watermarkItem: { marginHorizontal: 24 },
  watermarkTextBox: {
    width: 280,
    height: 80,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.15)",
    borderRadius: 12,
  },
  watermarkTextInner: { position: "absolute", width: "90%", height: "70%" },
  watermarkBlock: {
    width: "100%",
    height: "100%",
    backgroundColor: "#fff",
    borderRadius: 10,
  },
  // watermarkText: { color: "rgba(255,255,255,0.35)", fontSize: 18, fontWeight: "700", letterSpacing: 1 },
});
