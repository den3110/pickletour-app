// app/courts/my-bookings.tsx — Lịch đặt sân của tôi
import React, { useMemo } from "react";
import { View, FlatList, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator } from "react-native";
import { Text } from "@/components/ui/i18nText";
import { Ionicons } from "@expo/vector-icons";
import { Stack, router } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { useSelector } from "react-redux";
import { useListMyBookingsQuery } from "@/slices/bookingsApiSlice";
import { fmtVND, pal, dLabel, tLabel, BOOKING_STATUS } from "@/utils/courtFormat";

export default function MyBookingsScreen() {
  const theme = useTheme();
  const C = useMemo(() => pal(!!theme.dark), [theme.dark]);
  const me = useSelector((s: any) => s.auth?.userInfo);
  const { data, isLoading, isFetching, refetch } = useListMyBookingsQuery({}, { skip: !me });
  const items: any[] = data || [];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{ title: "Lịch đặt sân của tôi" }} />
      {!me ? (
        <View style={styles.empty}>
          <Text style={{ color: C.sub, marginBottom: 12 }}>Đăng nhập để xem lượt đặt của bạn.</Text>
          <TouchableOpacity style={[styles.btn, { backgroundColor: C.accent }]} onPress={() => router.push("/login")}>
            <Text style={{ color: "#0a0e1a", fontWeight: "800" }}>Đăng nhập</Text>
          </TouchableOpacity>
        </View>
      ) : isLoading ? (
        <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(b) => String(b._id)}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={44} color={C.sub} />
              <Text style={{ color: C.sub, marginVertical: 12 }}>Chưa có lượt đặt nào.</Text>
              <TouchableOpacity style={[styles.btn, { backgroundColor: C.accent }]} onPress={() => router.push("/courts")}>
                <Text style={{ color: "#0a0e1a", fontWeight: "800" }}>Tìm sân để đặt</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item: b }) => {
            const st = BOOKING_STATUS[b.status] || BOOKING_STATUS.pending;
            const needAction = b.status === "pending";
            return (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => router.push({ pathname: "/courts/booking/[id]", params: { id: String(b._id) } })}
                style={[styles.card, { backgroundColor: C.card, borderColor: needAction ? st.color : C.border }]}
              >
                <View style={[styles.dateBox, { backgroundColor: `${st.color}1f` }]}>
                  <Text style={{ color: st.color, fontWeight: "900", fontSize: 18 }}>{dLabel(b.startAt)}</Text>
                  <Text style={{ color: st.color, fontWeight: "700", fontSize: 12 }}>{tLabel(b.startAt)}</Text>
                  <Text style={{ color: st.color, fontSize: 11, opacity: 0.8 }}>→ {tLabel(b.endAt)}</Text>
                </View>
                <View style={{ flex: 1, padding: 12, minWidth: 0 }}>
                  <Text style={{ color: C.text, fontWeight: "800", fontSize: 15 }} numberOfLines={1}>{b.venue?.name || "Sân"}</Text>
                  <Text style={{ color: C.sub, fontSize: 13 }} numberOfLines={1}>{b.court?.name} · #{b.code}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    <View style={[styles.chip, { backgroundColor: `${st.color}26` }]}>
                      <Text style={{ color: st.color, fontWeight: "700", fontSize: 11 }}>{st.label}</Text>
                    </View>
                    <Text style={{ color: C.text, fontWeight: "700", fontSize: 13 }}>{fmtVND(b.totalPrice)}</Text>
                    {b.ticket?.checkedInAt && <Ionicons name="checkmark-circle" size={16} color="#22c55e" />}
                  </View>
                  {needAction && (
                    <Text style={{ color: st.color, fontSize: 12, marginTop: 6, fontWeight: "700" }}>
                      {b.payment?.rejectReason ? "Bill bị từ chối — gửi lại" : "Chưa thanh toán — bấm để gửi bill"}
                    </Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={18} color={C.sub} style={{ alignSelf: "center", marginRight: 8 }} />
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", borderRadius: 14, borderWidth: 1, overflow: "hidden", marginBottom: 12 },
  dateBox: { width: 88, alignItems: "center", justifyContent: "center", padding: 10 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  empty: { alignItems: "center", paddingTop: 60, paddingHorizontal: 24 },
  btn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
});
