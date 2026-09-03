// Games hub — 3 icon: Poker (đã có), Sâm (sắp ra mắt), Phỏm (sắp ra mắt).
import {
  Ionicons,
  MaterialCommunityIcons } from "@expo/vector-icons";
import { Stack,
  router } from "expo-router";
import React from "react";
import { Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "@/components/ui/i18nText";
import { SafeAreaView } from "react-native-safe-area-context";

type GameTile = {
  id: string;
  title: string;
  subtitle: string;
  iconLib: "Ionicons" | "MaterialCommunityIcons";
  icon: string;
  color: string;
  route: string;
  isNew?: boolean;
  isSoon?: boolean;
};

const GAMES: GameTile[] = [
  {
    id: "poker",
    title: "Poker",
    subtitle: "Texas Hold'em · 6 ghế",
    iconLib: "MaterialCommunityIcons",
    icon: "cards-playing-outline",
    color: "#DC2626",
    route: "/poker",
  },
  {
    id: "sam",
    title: "Sâm",
    subtitle: "Sâm Lốc · 4 người · 10 lá",
    iconLib: "MaterialCommunityIcons",
    icon: "cards-outline",
    color: "#7C3AED",
    route: "/sam",
    isNew: true,
  },
  {
    id: "phom",
    title: "Phỏm",
    subtitle: "Tá lả · 4 người · hạ phỏm/ù",
    iconLib: "MaterialCommunityIcons",
    icon: "cards-club",
    color: "#059669",
    route: "/phom",
    isNew: true,
  },
  {
    id: "caro",
    title: "Caro",
    subtitle: "Gomoku · 2 người · 5 liên tiếp",
    iconLib: "MaterialCommunityIcons",
    icon: "grid",
    color: "#EF4444",
    route: "/caro",
    isNew: true,
  },
  {
    id: "xiangqi",
    title: "Cờ Tướng",
    subtitle: "Xiangqi · 2 người · bắt Tướng",
    iconLib: "MaterialCommunityIcons",
    icon: "chess-knight",
    color: "#B45309",
    route: "/xiangqi",
    isNew: true,
  },
  {
    id: "chess",
    title: "Cờ Vua",
    subtitle: "Chess · 2 người · chiếu bí",
    iconLib: "MaterialCommunityIcons",
    icon: "chess-king",
    color: "#0F172A",
    route: "/chess",
    isNew: true,
  },
];

export default function GamesHubScreen() {
  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: "Games",
          headerBackTitle: "Trang chủ",
        }}
      />
      <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        >
          <Text style={styles.headerText}>Chọn game để chơi</Text>
          <Text style={styles.subHeaderText}>
            Chơi online cùng bạn bè, mời và chat trong game.
          </Text>

          <View style={styles.grid}>
            {GAMES.map((g) => (
              <Pressable
                key={g.id}
                onPress={() => router.push(g.route as any)}
                style={({ pressed }) => [
                  styles.tile,
                  pressed && { opacity: 0.7, transform: [{ scale: 0.98 }] },
                ]}
              >
                <View
                  style={[
                    styles.iconWrap,
                    { backgroundColor: g.color + "1A" },
                  ]}
                >
                  {g.iconLib === "Ionicons" ? (
                    <Ionicons
                      name={g.icon as any}
                      size={38}
                      color={g.color}
                    />
                  ) : (
                    <MaterialCommunityIcons
                      name={g.icon as any}
                      size={40}
                      color={g.color}
                    />
                  )}
                  {g.isNew && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>Mới</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.title}>{g.title}</Text>
                <Text style={styles.subtitle} numberOfLines={2}>
                  {g.subtitle}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={16} color="#64748B" />
            <Text style={styles.infoText}>
              Chip vui chơi, không đổi tiền thật. Sâm và Phỏm đang phát triển —
              nhấn để đăng ký nhận thông báo khi ra mắt.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  headerText: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 4,
  },
  subHeaderText: {
    fontSize: 13,
    color: "#64748B",
    marginBottom: 20,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
  },
  tile: {
    width: "31%",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    minHeight: 140,
  },
  iconWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -8,
    backgroundColor: "#EF4444",
    borderWidth: 2,
    borderColor: "#fff",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  badgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 2,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 11,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 14,
  },
  infoBox: {
    flexDirection: "row",
    gap: 8,
    marginTop: 24,
    padding: 12,
    backgroundColor: "#F1F5F9",
    borderRadius: 10,
    alignItems: "flex-start",
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: "#475569",
    lineHeight: 17,
  },
});
