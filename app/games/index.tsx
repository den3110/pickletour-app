import { t } from "@/utils/i18n";
// Games hub — 3 icon: Poker (đã có), Sâm (sắp ra mắt), Phỏm (sắp ra mắt).
import {
  Ionicons,
  MaterialCommunityIcons } from "@expo/vector-icons";
import { Stack,
  router } from "expo-router";
import React, { useMemo } from "react";
import { Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "@/components/ui/i18nText";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemeTokens, type ThemeTokens } from "@/hooks/useThemeTokens";

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
    title: t("Sâm"),
    subtitle: "Sâm Lốc · 4 người · 10 lá",
    iconLib: "MaterialCommunityIcons",
    icon: "cards-outline",
    color: "#7C3AED",
    route: "/sam",
    isNew: true,
  },
  {
    id: "phom",
    title: t("Phỏm"),
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
    title: t("Cờ Tướng"),
    subtitle: "Xiangqi · 2 người · bắt Tướng",
    iconLib: "MaterialCommunityIcons",
    icon: "chess-knight",
    color: "#B45309",
    route: "/xiangqi",
    isNew: true,
  },
  {
    id: "chess",
    title: t("Cờ Vua"),
    subtitle: "Chess · 2 người · chiếu bí",
    iconLib: "MaterialCommunityIcons",
    icon: "chess-king",
    // màu cờ vua = màu chữ theo theme (đen ở sáng, sáng ở tối) — xử lý trong component
    color: "#0F172A",
    route: "/chess",
    isNew: true,
  },
];

export default function GamesHubScreen() {
  const C = useThemeTokens();
  const styles = useMemo(() => mk_styles(C), [C]);
  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: "Games",
          headerBackTitle: t("Trang chủ"),
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
            {GAMES.map((g) => {
              const tileColor = g.id === "chess" ? C.text : g.color;
              return (
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
                    { backgroundColor: tileColor + "1A" },
                  ]}
                >
                  {g.iconLib === "Ionicons" ? (
                    <Ionicons
                      name={g.icon as any}
                      size={38}
                      color={tileColor}
                    />
                  ) : (
                    <MaterialCommunityIcons
                      name={g.icon as any}
                      size={40}
                      color={tileColor}
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
              );
            })}
          </View>

          <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={16} color={C.sub} />
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

const mk_styles = (C: ThemeTokens) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  headerText: {
    fontSize: 20,
    fontWeight: "800",
    color: C.text,
    marginBottom: 4,
  },
  subHeaderText: {
    fontSize: 13,
    color: C.sub,
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
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.border,
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
    borderColor: C.card,
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
    color: C.text,
    marginBottom: 2,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 11,
    color: C.sub,
    textAlign: "center",
    lineHeight: 14,
  },
  infoBox: {
    flexDirection: "row",
    gap: 8,
    marginTop: 24,
    padding: 12,
    backgroundColor: C.field,
    borderRadius: 10,
    alignItems: "flex-start",
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: C.text3,
    lineHeight: 17,
  },
});
