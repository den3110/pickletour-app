// components/market/StarRatingRN.tsx — hiển thị / chọn số sao (mobile)
import React from "react";
import { View, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function StarRatingRN({
  value = 0,
  size = 18,
  onChange,
  color = "#f59e0b",
}: {
  value?: number;
  size?: number;
  onChange?: (v: number) => void;
  color?: string;
}) {
  const interactive = typeof onChange === "function";
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {[1, 2, 3, 4, 5].map((i) => {
        const name = value >= i ? "star" : value >= i - 0.5 ? "star-half" : "star-outline";
        const Star = (
          <Ionicons name={name as any} size={size} color={value >= i - 0.5 ? color : "#CBD5E1"} />
        );
        return interactive ? (
          <TouchableOpacity key={i} onPress={() => onChange!(i)} hitSlop={4} style={{ padding: 1 }}>
            {Star}
          </TouchableOpacity>
        ) : (
          <View key={i} style={{ padding: 0.5 }}>{Star}</View>
        );
      })}
    </View>
  );
}
