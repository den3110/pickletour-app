// app/(tabs)/live.tsx
import FacebookLiveScreen from "@/components/FacebookLiveScreen";
import LiveMatchesScreen from "@/components/live_list/LiveMatchesScreen";
import React from "react";
import { View } from "react-native";

export default function LiveRoute() {
  // return <FacebookLiveScreen />;
  return <LiveMatchesScreen />
}
