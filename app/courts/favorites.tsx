// app/courts/favorites.tsx — Sân yêu thích (danh sách cụm sân đã lưu)
import React, { useMemo } from "react";
import { View, FlatList, TouchableOpacity, Image, StyleSheet, RefreshControl, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Text } from "@/components/ui/i18nText";
import { Ionicons } from "@expo/vector-icons";
import { Stack, router } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { useListFavoriteVenuesQuery } from "@/slices/venuesApiSlice";
import { fmtVND, pal } from "@/utils/courtFormat";
import { Empty, shadow, R, SP } from "@/components/courts/ui";

export default function FavoriteVenuesScreen() {
  const theme = useTheme();
  const C = useMemo(() => pal(!!theme.dark), [theme.dark]);
  const { data, isLoading, isFetching, refetch } = useListFavoriteVenuesQuery(undefined);
  const items: any[] = Array.isArray(data) ? data : data?.items || [];

  const renderCard = ({ item: v }: any) => (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => router.push({ pathname: "/courts/[id]", params: { id: String(v._id) } })}
      style={[styles.card, { backgroundColor: C.card, borderColor: C.border }, shadow(C.dark, 2)]}
    >
      <View>
        {v.images?.[0] ? (
          <Image source={{ uri: v.images[0] }} style={styles.cover} />
        ) : (
          <LinearGradient colors={C.heroGrad} style={[styles.cover, { alignItems: "center", justifyContent: "center" }]}>
            <Ionicons name={v.sport === "tennis" ? "tennisball" : "location"} size={40} color="rgba(255,255,255,0.6)" />
          </LinearGradient>
        )}
        <LinearGradient colors={["rgba(2,6,23,0)", "rgba(2,6,23,0.75)"]} style={styles.coverShade} />
        <View style={styles.coverBottom}>
          <Text style={styles.coverTitle} numberOfLines={1}>{v.name}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Ionicons name="location" size={12} color="rgba(255,255,255,0.85)" />
            <Text style={styles.coverSub} numberOfLines={1}>{[v.address, v.province].filter(Boolean).join(", ") || "—"}</Text>
          </View>
        </View>
        <View style={styles.heart}>
          <Ionicons name="heart" size={15} color="#ef4444" />
        </View>
      </View>
      <View style={styles.cardFoot}>
        <View>
          <Text style={{ color: C.sub, fontSize: 11 }}>Giá từ</Text>
          <Text style={{ color: C.accent, fontWeight: "900", fontSize: 16, letterSpacing: -0.3 }}>{v.defaultPricePerHour ? `${fmtVND(v.defaultPricePerHour)}/giờ` : "Liên hệ"}</Text>
        </View>
        <View style={[styles.bookBtn, { backgroundColor: C.accent }]}>
          <Text style={{ color: C.onAccent, fontWeight: "800", fontSize: 12.5 }}>Đặt sân</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{ title: "Sân yêu thích" }} />
      {isLoading ? (
        <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(v) => String(v._id)}
          contentContainerStyle={{ padding: SP.lg, paddingBottom: 48 }}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} />}
          ListEmptyComponent={<Empty C={C} icon="heart-outline" title="Chưa có sân yêu thích" subtitle="Mở một cụm sân và bấm ♥ để lưu." />}
          renderItem={renderCard}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: R.lg, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden", marginBottom: SP.lg },
  cover: { width: "100%", height: 168 },
  coverShade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 96 },
  coverBottom: { position: "absolute", left: 14, right: 14, bottom: 12 },
  coverTitle: { color: "#fff", fontWeight: "900", fontSize: 18, letterSpacing: -0.3 },
  coverSub: { color: "rgba(255,255,255,0.85)", fontSize: 12.5, flexShrink: 1 },
  heart: { position: "absolute", top: 12, right: 12, width: 30, height: 30, borderRadius: 15, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  cardFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 12 },
  bookBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
});
