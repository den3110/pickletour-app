// app/marketplace/saved.tsx — tin đã lưu (mobile)
import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import MarketCard from "@/components/market/MarketCard";
import {
  useSavedMarketListingsQuery,
  useToggleSaveMarketMutation,
} from "@/slices/marketApiSlice";

const BLUE = "#0d6efd";

export default function SavedScreen() {
  const { width } = useWindowDimensions();
  const { data, isLoading, refetch } = useSavedMarketListingsQuery(1);
  const [toggleSave] = useToggleSaveMarketMutation();
  const items = data?.items || [];
  const cardW = (width - 12 * 3) / 2;

  useFocusEffect(
    React.useCallback(() => {
      refetch();
    }, [refetch])
  );

  const onToggleSave = async (item: any) => {
    try {
      await toggleSave(item._id).unwrap();
      refetch();
    } catch {}
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#EEF0F3" }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color="#111827" />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "900", marginLeft: 4 }}>🔖 Tin đã lưu</Text>
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
          renderItem={({ item }) => (
            <MarketCard item={item} width={cardW} onToggleSave={onToggleSave} canSave={!item.isOwner} />
          )}
          ListEmptyComponent={
            <View style={{ alignItems: "center", marginTop: 60 }}>
              <Text style={{ fontSize: 44 }}>🔖</Text>
              <Text style={{ color: "#64748B", marginTop: 8, fontWeight: "600" }}>Bạn chưa lưu tin nào</Text>
              <TouchableOpacity
                onPress={() => router.push("/marketplace" as any)}
                style={{ marginTop: 16, backgroundColor: BLUE, paddingHorizontal: 22, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" }}
              >
                <Text style={{ color: "#fff", fontWeight: "800" }}>Khám phá Chợ</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
