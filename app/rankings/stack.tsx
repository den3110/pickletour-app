// app/(tabs)/live.tsx
import RankingListScreen from "@/screens/rankings";
import { Stack } from "expo-router";
import React from "react";

export default function RankingsStack() {
  // return <FacebookLiveScreen />;
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <RankingListScreen isBack />
    </>
  );
}
