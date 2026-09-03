// app/marketplace/mine.tsx — tin của tôi (mobile)
import React, { useState } from "react";
import {
  View,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { Text } from "@/components/ui/i18nText";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import MarketCard from "@/components/market/MarketCard";
import { useMyMarketListingsQuery } from "@/slices/marketApiSlice";

const BLUE = "#0d6efd";
const TABS = [
  { key: "", label: "Tất cả" },
  { key: "available", label: "Đang bán" },
  { key: "reserved", label: "Giữ chỗ" },
  { key: "sold", label: "Đã bán" },
  { key: "hidden", label: "Đã ẩn" },
];

export default function MyListingsScreen() {
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState("");
  const { data, isLoading, refetch } = useMyMarketListingsQuery(tab || undefined);
  const items = data?.items || [];
  const cardW = (width - 12 * 3) / 2;

  useFocusEffect(
    React.useCallback(() => {
      refetch();
    }, [refetch])
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#EEF0F3" }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color="#111827" />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "900", marginLeft: 4, flex: 1 }}>📦 Tin của tôi</Text>
        <TouchableOpacity onPress={() => router.push("/marketplace/new" as any)} hitSlop={8}>
          <Ionicons name="add-circle" size={26} color={BLUE} />
        </TouchableOpacity>
      </View>

      <View style={{ backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#EEF0F3" }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}>
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <TouchableOpacity
                key={t.key || "all"}
                onPress={() => setTab(t.key)}
                style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: active ? BLUE : "#F1F5F9" }}
              >
                <Text style={{ fontWeight: "700", color: active ? "#fff" : "#334155" }}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={BLUE} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => String(it._id)}
          numColumns={2}
          columnWrapperStyle={{ paddingHorizontal: 12, gap: 12 }}
          contentContainerStyle={{ paddingTop: 12, paddingBottom: 40 }}
          renderItem={({ item }) => <MarketCard item={item} width={cardW} canSave={false} />}
          ListEmptyComponent={
            <View style={{ alignItems: "center", marginTop: 60 }}>
              <Text style={{ fontSize: 44 }}>📦</Text>
              <Text style={{ color: "#64748B", marginTop: 8, fontWeight: "600" }}>Chưa có tin nào ở mục này</Text>
              <TouchableOpacity
                onPress={() => router.push("/marketplace/new" as any)}
                style={{ marginTop: 16, backgroundColor: BLUE, paddingHorizontal: 22, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" }}
              >
                <Text style={{ color: "#fff", fontWeight: "800" }}>Đăng tin mới</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
