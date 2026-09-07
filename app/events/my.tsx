// app/events/my.tsx — Vé sự kiện của tôi
import React, { useMemo } from "react";
import { View, FlatList, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator } from "react-native";
import { Text } from "@/components/ui/i18nText";
import { Ionicons } from "@expo/vector-icons";
import { Stack, router } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { useSelector } from "react-redux";
import { useListMyEventRegsQuery } from "@/slices/eventsApiSlice";
import { fmtVND, pal, dtLabel } from "@/utils/courtFormat";
import { Chip, Empty, PrimaryButton, shadow, R, SP } from "@/components/courts/ui";

export default function MyEventsScreen() {
  const theme = useTheme();
  const C = useMemo(() => pal(!!theme.dark), [theme.dark]);
  const me = useSelector((s: any) => s.auth?.userInfo);
  const { data, isLoading, isFetching, refetch } = useListMyEventRegsQuery(undefined, { skip: !me });
  const items: any[] = data || [];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{ title: "Sự kiện của tôi" }} />
      {!me ? (
        <Empty C={C} icon="lock-closed-outline" title="Đăng nhập để xem vé" action={<PrimaryButton C={C} label="Đăng nhập" onPress={() => router.push("/login")} />} />
      ) : isLoading ? (
        <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(r) => String(r._id)}
          contentContainerStyle={{ padding: SP.lg, paddingBottom: 48 }}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} />}
          ListEmptyComponent={<Empty C={C} icon="ticket-outline" title="Chưa có vé sự kiện" subtitle="Tìm sự kiện đánh social ở trang sân." />}
          renderItem={({ item: r }) => {
            const ev = r.event || {};
            const cancelled = r.status === "cancelled" || ev.status === "cancelled";
            const paid = r.payment?.status === "Paid";
            return (
              <TouchableOpacity activeOpacity={0.9} onPress={() => router.push({ pathname: "/events/[id]", params: { id: String(ev._id) } })} style={[styles.card, { backgroundColor: C.card, borderColor: C.border }, shadow(C.dark, 1)]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: C.text, fontWeight: "800", fontSize: 15 }} numberOfLines={1}>{ev.title || "Sự kiện"}</Text>
                  <Text style={{ color: C.sub, fontSize: 12.5, marginTop: 2 }} numberOfLines={1}>{ev.venue?.name} · {dtLabel(ev.startAt)}</Text>
                  <View style={{ flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    {cancelled ? <Chip C={C} color={C.danger} label="Đã huỷ" small /> : <Chip C={C} color={paid ? C.success : C.warning} label={paid ? "Đã thanh toán" : "Chưa thanh toán"} small />}
                    <Chip C={C} color={C.accent} label={r.price > 0 ? fmtVND(r.price) : "Miễn phí"} small />
                    {r.ticket?.checkedInAt && <Ionicons name="checkmark-circle" size={16} color={C.success} />}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={C.muted} />
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: R.lg, borderWidth: StyleSheet.hairlineWidth, padding: 14, marginBottom: SP.md },
});
