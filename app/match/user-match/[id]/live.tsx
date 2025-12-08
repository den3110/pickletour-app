// app/match/[id]/live.jsx
import React from "react";
import { TouchableOpacity } from "react-native";
import { Stack, useLocalSearchParams, router } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";

// ✅ Đổi path này cho khớp với chỗ bạn đang để file LiveLikeFBScreenKey

export default function LiveUserMatchScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams();

  // id từ route /match/[id]/live
  const matchId =
    typeof id === "string" ? id : Array.isArray(id) ? id[0] : "";

  const textColor = theme?.colors?.text ?? "#111827";

  return (
    <>
      {/* ✅ Bọc lại màn live gốc */}
      
    </>
  );
}
