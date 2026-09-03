// app/live/studio.tsx
import React from "react";
import {
  View,
} from "react-native";
import { Text } from "@/components/ui/i18nText";

export default function LiveRoute() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text>Studio đã chuyển sang PickleTour Live</Text>
    </View>
  );
}
