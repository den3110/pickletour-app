import React from "react";
import { ScrollView, View } from "react-native";
import Hero from "@/components/Hero";

export default function HomeScreen() {
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
      <Hero />
      {/* Bạn có thể thêm các section khác phía dưới */}
      <View style={{ height: 8 }} />
    </ScrollView>
  );
}
