// Placeholder — Sâm Lốc chưa phát hành.
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Stack, router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function SamComingSoonScreen() {
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Sâm Lốc", headerBackTitle: "Games" }} />
      <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
        <View style={styles.content}>
          <View style={styles.iconCircle}>
            <MaterialCommunityIcons
              name="cards-outline"
              size={80}
              color="#7C3AED"
            />
          </View>
          <Text style={styles.title}>Sâm Lốc</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Sắp ra mắt</Text>
          </View>
          <Text style={styles.desc}>
            Sâm Lốc — game bài dân gian miền Nam, 4 người chơi, mỗi người 10
            lá. Chơi combo (đôi, sảnh, tứ quý), ai hết bài trước thắng.
          </Text>
          <Text style={styles.desc}>
            Chúng tôi đang hoàn thiện luật chơi, giao diện quay ngang và tính
            năng mời bạn / chat trong bàn.
          </Text>

          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.btn,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={styles.btnText}>Quay lại Games</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  iconCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "#EDE9FE",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    color: "#0F172A",
  },
  badge: {
    backgroundColor: "#7C3AED",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
  },
  badgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  desc: {
    fontSize: 14,
    color: "#475569",
    textAlign: "center",
    lineHeight: 21,
    maxWidth: 340,
  },
  btn: {
    marginTop: 20,
    backgroundColor: "#7C3AED",
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 999,
  },
  btnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
});
