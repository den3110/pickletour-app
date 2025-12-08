// app/match/[id]/live.jsx
import React from "react";
import { TouchableOpacity } from "react-native";
import { Stack, useLocalSearchParams, router } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import LiveUserMatchScreen from "@/components/live/match/live";

// ✅ Đổi path này cho khớp với chỗ bạn đang để file LiveLikeFBScreenKey

export default function UserMatchLive() {
  const theme = useTheme();
  const { id } = useLocalSearchParams();

  // id từ route /match/[id]/live
  const matchId = typeof id === "string" ? id : Array.isArray(id) ? id[0] : "";

  const textColor = theme?.colors?.text ?? "#111827";

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      {/* ✅ Bọc lại màn live gốc */}
      <LiveUserMatchScreen
        // tạm dùng matchId làm tid/bid cho dễ debug (nếu bên trong có log)
        matchId={matchId}
        bid={matchId}
        // user match không gắn sân → để courtId rỗng để skip polling theo sân
        autoOnLive={true}
        // khi end live → quay về list user match
        tournamentHref="/matches/stack"
        homeHref="/"
        onFinishedGoToTournament={() => router.push("/matches/stack")}
        onFinishedGoHome={() => router.push("/")}
      />
    </>
  );
}
