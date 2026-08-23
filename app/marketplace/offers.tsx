// app/marketplace/offers.tsx — các đề nghị mua tôi đã gửi
import React from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { formatPrice, firstImage } from "@/constants/market";
import {
  useMyMarketOffersQuery,
  useCancelMarketOfferMutation,
} from "@/slices/marketApiSlice";

const BLUE = "#0d6efd";
const STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: "Chờ phản hồi", color: "#d97706" },
  accepted: { label: "Đã chấp nhận", color: "#16a34a" },
  rejected: { label: "Đã từ chối", color: "#dc2626" },
  cancelled: { label: "Đã huỷ", color: "#6b7280" },
};

export default function MyOffersScreen() {
  const { data, isLoading, refetch } = useMyMarketOffersQuery();
  const [cancelOffer] = useCancelMarketOfferMutation();
  const items = data?.items || [];

  useFocusEffect(
    React.useCallback(() => {
      refetch();
    }, [refetch])
  );

  const onCancel = (offerId: string) => {
    Alert.alert("Huỷ đề nghị", "Bạn chắc chắn muốn huỷ?", [
      { text: "Không", style: "cancel" },
      {
        text: "Huỷ đề nghị",
        style: "destructive",
        onPress: async () => {
          try {
            await cancelOffer(offerId).unwrap();
            refetch();
          } catch {}
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#EEF0F3" }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color="#111827" />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "900", marginLeft: 4 }}>🏷️ Đề nghị của tôi</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={BLUE} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(o) => String(o._id)}
          contentContainerStyle={{ padding: 12, gap: 10 }}
          renderItem={({ item: o }) => {
            const l = o.listing || {};
            const st = STATUS[o.status] || STATUS.pending;
            const img = firstImage(l);
            return (
              <View style={{ flexDirection: "row", gap: 10, backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#EAECEF", padding: 10, alignItems: "center" }}>
                <TouchableOpacity
                  onPress={() => l._id && router.push(`/marketplace/${l._id}` as any)}
                  style={{ width: 66, height: 66, borderRadius: 10, overflow: "hidden", backgroundColor: "#F1F5F9" }}
                >
                  {img ? (
                    <Image source={{ uri: img }} style={{ width: "100%", height: "100%" }} />
                  ) : (
                    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontSize: 26 }}>🛍️</Text>
                    </View>
                  )}
                </TouchableOpacity>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontWeight: "700", color: "#111827" }} onPress={() => l._id && router.push(`/marketplace/${l._id}` as any)}>
                    {l.title || "Sản phẩm"}
                  </Text>
                  <Text style={{ fontSize: 12, color: "#64748B" }}>Giá đăng: {formatPrice(l.price, "sell")}</Text>
                  <Text style={{ fontSize: 13.5, fontWeight: "800", color: BLUE }}>Bạn đề nghị: {formatPrice(o.amount, "sell")}</Text>
                  {!!o.message && (
                    <Text numberOfLines={1} style={{ fontSize: 12, color: "#94A3B8", fontStyle: "italic" }}>“{o.message}”</Text>
                  )}
                </View>
                <View style={{ alignItems: "flex-end", gap: 6 }}>
                  <View style={{ backgroundColor: st.color, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 }}>
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 11 }}>{st.label}</Text>
                  </View>
                  {o.status === "pending" && (
                    <TouchableOpacity onPress={() => onCancel(o._id)}>
                      <Text style={{ color: "#94A3B8", fontSize: 12, fontWeight: "600" }}>Huỷ</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={{ alignItems: "center", marginTop: 60 }}>
              <Text style={{ fontSize: 44 }}>🏷️</Text>
              <Text style={{ color: "#64748B", marginTop: 8, fontWeight: "600" }}>Bạn chưa gửi đề nghị nào</Text>
              <TouchableOpacity onPress={() => router.push("/marketplace" as any)} style={{ marginTop: 16, backgroundColor: BLUE, paddingHorizontal: 22, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: "#fff", fontWeight: "800" }}>Khám phá Chợ</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
