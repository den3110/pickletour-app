// Placeholder — Phỏm (Tá lả) chưa phát hành.
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Stack, router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function PhomComingSoonScreen() {
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Phỏm (Tá lả)", headerBackTitle: "Games" }} />
      <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
        <View style={styles.content}>
          <View style={styles.iconCircle}>
            <MaterialCommunityIcons
              name="cards-club"
              size={80}
              color="#059669"
            />
          </View>
          <Text style={styles.title}>Phỏm (Tá lả)</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Sắp ra mắt</Text>
          </View>
          <Text style={styles.desc}>
            Phỏm — game bài truyền thống miền Bắc, 4 người chơi, mỗi người 9
            lá. Ghép phỏm (3+ lá cùng bậc hoặc liên tiếp cùng chất), ù/móm
            tính điểm cuối ván.
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
    backgroundColor: "#D1FAE5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    color: "#0F172A",
    textAlign: "center",
  },
  badge: {
    backgroundColor: "#059669",
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
    backgroundColor: "#059669",
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
