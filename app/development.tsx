import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Stack } from "expo-router";
import LottieView from "lottie-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@react-navigation/native";
import { SHOULD_RENDER_NATIVE_LOTTIE } from "@/utils/runtimeSafety";

export default function DevelopmentScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  return (
    <>
      <View
        style={[
          styles.container,
          {
            paddingTop: insets.top + 24,
            paddingBottom: insets.bottom + 24,
            backgroundColor: colors.background,
          },
        ]}
      >
        <Stack.Screen
          options={{
            title: "Đang phát triển",
            headerShown: true,
            headerBackTitle: "Quay lại",
          }}
        />

        <View style={styles.centerWrap}>
          {SHOULD_RENDER_NATIVE_LOTTIE ? (
            <LottieView
              source={require("@/assets/lottie/development.json")}
              autoPlay
              loop
              style={styles.lottie}
            />
          ) : null}

          <Text style={[styles.title, { color: colors.text }]}>
            Chức năng đang phát triển
          </Text>
          <Text style={[styles.sub, { color: colors.text + "99" }]}>
            Tính năng này sẽ sớm có mặt. Vui lòng quay lại sau.
          </Text>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
  },
  centerWrap: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  lottie: {
    width: 240,
    height: 240,
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
  },
  sub: {
    marginTop: 6,
    fontSize: 14,
    textAlign: "center",
  },
});
