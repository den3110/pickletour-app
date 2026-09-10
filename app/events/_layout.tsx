import { Stack } from "expo-router";
import { useTheme } from "@react-navigation/native";
import AppBackButton from "@/components/ui/AppBackButton";
import { pal } from "@/utils/courtFormat";

export default function EventsLayout() {
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
        headerLeft: ({ tintColor }) => (
          <AppBackButton color={tintColor ?? C.text} />
        ),
        contentStyle: { backgroundColor: C.bg },
      }}
    />
  );
}
