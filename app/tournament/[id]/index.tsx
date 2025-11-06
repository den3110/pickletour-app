import { Stack } from "expo-router";
import React, { useRef } from "react";
import { SafeAreaView, Text, View } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import LottieView from "lottie-react-native";

const Index = () => {
  const animRef = useRef(null);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            flexGrow: 1,
            padding: 16,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <LottieView
            ref={animRef}
            source={require("@/assets/lottie/err_404.json")}
            autoPlay
            loop
            style={{ width: 220, height: 220 }}
          />
          <Text style={{ marginTop: 12, fontSize: 16, fontWeight: "600" }}>
            Trang không tồn tại
          </Text>
        </ScrollView>
      </SafeAreaView>
    </>
  );
};

export default Index;
