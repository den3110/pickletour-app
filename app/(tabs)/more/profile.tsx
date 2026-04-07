import ProfileScreen from "@/screens/profile";
import { Stack } from "expo-router";
import React from "react";

export default function MoreProfileScreen() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ProfileScreen isBack />
    </>
  );
}
