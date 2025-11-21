import { useRouter } from "expo-router";
import { Pressable, Text } from "react-native";

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
