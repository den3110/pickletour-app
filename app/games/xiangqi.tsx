// Placeholder — Cờ Tướng chưa phát hành.
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Stack, router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function XiangqiComingSoon() {
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Cờ Tướng", headerBackTitle: "Games" }} />
      <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
        <View style={styles.content}>
          <View style={styles.iconCircle}>
            <MaterialCommunityIcons name="chess-knight" size={80} color="#B45309" />
          </View>
          <Text style={styles.title}>Cờ Tướng (Xiangqi)</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Sắp ra mắt</Text>
          </View>
          <Text style={styles.desc}>
            Cờ Tướng — bàn 9×10 có sông, 32 quân (Tướng/Sĩ/Tượng/Xe/Mã/Pháo/Tốt),
            2 người chơi, chiếu bí thắng.
          </Text>
          <Text style={styles.desc}>
            Rule engine với validation nước đi + kiểm tra chiếu/bí đang được
            xây. Chờ bản kế nhé!
          </Text>
          <Pressable
            onPress={() => router.back()}
            style={styles.btn}
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
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  title: { fontSize: 28, fontWeight: "900", color: "#0F172A", textAlign: "center" },
  badge: {
    backgroundColor: "#B45309",
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
    backgroundColor: "#B45309",
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 999,
  },
  btnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
