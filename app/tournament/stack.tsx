// app/(tabs)/live.tsx
import TournamentDashboardScreen from "@/screens/tournaments";
import { Stack } from "expo-router";
import React from "react";

export default function TournamentStack() {
  // return <FacebookLiveScreen />;
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <TournamentDashboardScreen isBack />
    </>
  );
}
