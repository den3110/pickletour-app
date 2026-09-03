import {
  useRouter } from "expo-router";
import { Pressable,
} from "react-native";
import { Text } from "@/components/ui/i18nText";

function BackText() {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.back()}
      hitSlop={10}
      style={{ paddingHorizontal: 8 }}
    >
      <Text style={{ color: "#1976d2", fontWeight: "700" }}>Quay lại</Text>
    </Pressable>
  );
}

export default BackText
