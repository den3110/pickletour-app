import { Stack } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { pal } from "@/utils/courtFormat";

export default function CourtsLayout() {
  const theme = useTheme();
  const C = pal(!!theme.dark);
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: C.bg },
        headerTintColor: C.text,
        headerTitleStyle: { fontWeight: "800", fontSize: 17 },
        headerShadowVisible: false,
        headerBackTitle: "Quay lại",
        headerBackTitleVisible: false,
        contentStyle: { backgroundColor: C.bg },
      }}
    />
  );
}
