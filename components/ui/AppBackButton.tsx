import { Ionicons } from "@expo/vector-icons";
import { Href, router } from "expo-router";
import { Pressable, StyleSheet } from "react-native";

type AppBackButtonProps = {
  color?: string;
  fallbackHref?: Href;
};

export default function AppBackButton({
  color = "#FFFFFF",
  fallbackHref = "/",
}: AppBackButtonProps) {
  const handlePress = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace(fallbackHref);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Quay lại"
      hitSlop={8}
      onPress={handlePress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Ionicons name="chevron-back" size={24} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.55,
  },
});
