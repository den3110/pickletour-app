// app/(tabs)/live.tsx
import ProfileScreen from "@/screens/profile";
import { Stack } from "expo-router";
import React from "react";

export default function ProfileStack() {
  // return <FacebookLiveScreen />;
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ProfileScreen isBack />
    </>
  );
}
