import PikoraScreen from "@/components/chatbot/PikoraScreen";
import { router, Stack } from "expo-router";
import React from "react";

export default function MoreChatScreen() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <PikoraScreen
        bottomPaddingOffset={0}
        onBack={() =>
          router.canGoBack() ? router.back() : router.replace("/more")
        }
      />
    </>
  );
}
