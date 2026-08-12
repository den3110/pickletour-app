// Placeholder — Cờ Vua chưa phát hành.
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Stack, router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ChessComingSoon() {
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Cờ Vua", headerBackTitle: "Games" }} />
      <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
        <View style={styles.content}>
          <View style={styles.iconCircle}>
            <MaterialCommunityIcons name="chess-king" size={80} color="#0F172A" />
          </View>
          <Text style={styles.title}>Cờ Vua (Chess)</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Sắp ra mắt</Text>
          </View>
          <Text style={styles.desc}>
            Cờ Vua — bàn 8×8, 32 quân (King/Queen/Rook/Bishop/Knight/Pawn),
            2 người chơi, chiếu tướng thắng.
          </Text>
          <Text style={styles.desc}>
            Rule engine với castling / en passant / promotion / checkmate
            detection đang được xây. Chờ bản kế nhé!
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
    backgroundColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  title: { fontSize: 28, fontWeight: "900", color: "#0F172A", textAlign: "center" },
  badge: {
    backgroundColor: "#0F172A",
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
    backgroundColor: "#0F172A",
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 999,
  },
  btnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
