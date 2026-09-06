import { Stack } from "expo-router";
import { useTheme } from "@react-navigation/native";

export default function OwnerLayout() {
  const theme = useTheme();
  const dark = !!theme.dark;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: dark ? "#121829" : "#ffffff" },
        headerTintColor: dark ? "#f8fafc" : "#0f172a",
        headerShadowVisible: false,
        headerBackTitle: "Quay lại",
        contentStyle: { backgroundColor: dark ? "#0a0e1a" : "#f5f7fb" },
      }}
    />
  );
}
