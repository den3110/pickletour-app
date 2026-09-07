// app/courts/my-packages.tsx — Gói giờ / thẻ tháng của tôi
import React, { useMemo } from "react";
import { View, FlatList, StyleSheet, RefreshControl, ActivityIndicator } from "react-native";
import { Text } from "@/components/ui/i18nText";
import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { useSelector } from "react-redux";
import { useMyPackagesQuery } from "@/slices/packagesApiSlice";
import { fmtVND, pal, dLabel } from "@/utils/courtFormat";

const STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: "Chờ kích hoạt", color: "#f59e0b" },
  active: { label: "Đang dùng", color: "#22c55e" },
  expired: { label: "Hết hạn", color: "#94a3b8" },
  cancelled: { label: "Đã huỷ", color: "#ef4444" },
};

export default function MyPackagesScreen() {
  const theme = useTheme();
  const C = useMemo(() => pal(!!theme.dark), [theme.dark]);
  const me = useSelector((s: any) => s.auth?.userInfo);
  const { data, isLoading, isFetching, refetch } = useMyPackagesQuery(undefined, { skip: !me });
  const items: any[] = data || [];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{ title: "Gói của tôi" }} />
      {isLoading ? <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} /> : (
        <FlatList
          data={items}
          keyExtractor={(p) => String(p._id)}
          contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} />}
          ListEmptyComponent={<Text style={{ color: C.sub, textAlign: "center", marginTop: 40 }}>Bạn chưa mua gói nào.</Text>}
          renderItem={({ item: p }) => {
            const st = STATUS[p.status] || STATUS.pending;
            const expired = p.expiresAt && new Date(p.expiresAt).getTime() < Date.now();
            return (
              <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ color: C.text, fontWeight: "800", fontSize: 15 }}>{p.packageName}</Text>
                  <View style={[styles.chip, { backgroundColor: `${st.color}26` }]}><Text style={{ color: st.color, fontWeight: "700", fontSize: 11 }}>{expired ? "Hết hạn" : st.label}</Text></View>
                </View>
                <Text style={{ color: C.sub, fontSize: 13, marginTop: 4 }}>{p.venue?.name || "Sân"} · {fmtVND(p.price)}</Text>
                {p.type === "credits" ? (
                  <Text style={{ color: C.accent, fontWeight: "700", marginTop: 6 }}>Còn {Math.floor(p.minutesRemaining / 60)}h{p.minutesRemaining % 60 ? ` ${p.minutesRemaining % 60}'` : ""} / {Math.floor(p.minutesTotal / 60)}h</Text>
                ) : (
                  <Text style={{ color: C.accent, fontWeight: "700", marginTop: 6 }}>Không giới hạn</Text>
                )}
                {p.expiresAt ? <Text style={{ color: C.sub, fontSize: 12, marginTop: 2 }}>{expired ? "Đã hết hạn" : `Hạn dùng đến ${dLabel(p.expiresAt)}`}</Text> : null}
                {p.status === "pending" && <Text style={{ color: "#f59e0b", fontSize: 12, marginTop: 4 }}>Chờ chủ sân kích hoạt sau khi nhận chuyển khoản.</Text>}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 12 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
});
