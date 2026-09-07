// app/courts/my-bookings.tsx — Lịch đặt sân của tôi
import React, { useMemo } from "react";
import { View, FlatList, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator, Linking } from "react-native";
import { Text } from "@/components/ui/i18nText";
import { Ionicons } from "@expo/vector-icons";
import { Stack, router } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { useSelector } from "react-redux";
import { useListMyBookingsQuery } from "@/slices/bookingsApiSlice";
import { fmtVND, pal, dLabel, tLabel, toDateInput, addDays, BOOKING_STATUS } from "@/utils/courtFormat";

// Thêm lượt đặt vào Google Calendar (mở app/web lịch, không cần quyền native)
function addToCalendar(b: any) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const g = (d: string) => {
    const x = new Date(d);
    return `${x.getUTCFullYear()}${pad(x.getUTCMonth() + 1)}${pad(x.getUTCDate())}T${pad(x.getUTCHours())}${pad(x.getUTCMinutes())}00Z`;
  };
  const title = `Đặt sân ${b.venue?.name || ""}${b.court?.name ? ` - ${b.court.name}` : ""}`.trim();
  const details = `Mã đặt ${b.code || ""}. Mở app PickleTour để xem chi tiết.`;
  const loc = [b.venue?.name, b.venue?.address].filter(Boolean).join(", ");
  const url =
    `https://calendar.google.com/calendar/render?action=TEMPLATE` +
    `&text=${encodeURIComponent(title)}` +
    `&dates=${g(b.startAt)}/${g(b.endAt)}` +
    `&details=${encodeURIComponent(details)}` +
    `&location=${encodeURIComponent(loc)}`;
  Linking.openURL(url).catch(() => {});
}

// Đặt lại: mở lại cụm sân, chọn ngày cùng thứ tuần sau
function rebook(b: any) {
  const venueId = b.venue?._id || b.venue;
  if (!venueId) return;
  let nextDate = "";
  try {
    const d = new Date(b.startAt);
    d.setDate(d.getDate() + 7);
    nextDate = toDateInput(d);
    if (nextDate < toDateInput()) nextDate = toDateInput();
  } catch {}
  router.push({ pathname: "/courts/[id]", params: { id: String(venueId), ...(nextDate ? { date: nextDate } : {}) } });
}
import { Chip, Empty, PrimaryButton, shadow, R, SP } from "@/components/courts/ui";

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
        <Empty C={C} icon="lock-closed-outline" title="Đăng nhập để xem lượt đặt" action={<PrimaryButton C={C} label="Đăng nhập" onPress={() => router.push("/login")} />} />
      ) : isLoading ? (
        <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(b) => String(b._id)}
          contentContainerStyle={{ padding: SP.lg, paddingBottom: 48 }}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} />}
          ListEmptyComponent={<Empty C={C} title="Chưa có lượt đặt nào" subtitle="Tìm một sân và đặt khung giờ bạn thích." action={<PrimaryButton C={C} icon="search" label="Tìm sân để đặt" onPress={() => router.push("/courts")} />} />}
          renderItem={({ item: b }) => {
            const st = BOOKING_STATUS[b.status] || BOOKING_STATUS.pending;
            const needAction = b.status === "pending";
            return (
              <TouchableOpacity activeOpacity={0.88} onPress={() => router.push({ pathname: "/courts/booking/[id]", params: { id: String(b._id) } })} style={[styles.card, { backgroundColor: C.card, borderColor: needAction ? st.color : C.border }, shadow(C.dark, 1)]}>
                <View style={[styles.dateBox, { backgroundColor: `${st.color}1a` }]}>
                  <Text style={{ color: st.color, fontWeight: "900", fontSize: 18, letterSpacing: -0.3 }}>{dLabel(b.startAt)}</Text>
                  <Text style={{ color: st.color, fontWeight: "700", fontSize: 12, marginTop: 2 }}>{tLabel(b.startAt)}</Text>
                  <Text style={{ color: st.color, fontSize: 11, opacity: 0.8 }}>→ {tLabel(b.endAt)}</Text>
                </View>
                <View style={{ flex: 1, padding: 12, minWidth: 0 }}>
                  <Text style={{ color: C.text, fontWeight: "800", fontSize: 15 }} numberOfLines={1}>{b.venue?.name || "Sân"}</Text>
                  <Text style={{ color: C.sub, fontSize: 12.5, marginTop: 2 }} numberOfLines={1}>{b.court?.name} · #{b.code}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    <Chip C={C} color={st.color} label={st.label} small />
                    <Text style={{ color: C.text, fontWeight: "800", fontSize: 13 }}>{fmtVND(b.totalPrice)}</Text>
                    {b.ticket?.checkedInAt && <Ionicons name="checkmark-circle" size={16} color={C.success} />}
                  </View>
                  {needAction && (
                    <Text style={{ color: st.color, fontSize: 12, marginTop: 6, fontWeight: "700" }}>
                      {b.payment?.rejectReason
                        ? "Bill bị từ chối — gửi lại"
                        : b.holdExpiresAt
                        ? `Chưa thanh toán — giữ chỗ đến ${tLabel(b.holdExpiresAt)}`
                        : "Chưa thanh toán — bấm để gửi bill"}
                    </Text>
                  )}
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                    <TouchableOpacity onPress={() => rebook(b)} hitSlop={6} style={[styles.miniBtn, { borderColor: C.border }]}>
                      <Ionicons name="repeat" size={14} color={C.accent} />
                      <Text style={{ color: C.text, fontWeight: "700", fontSize: 12 }}>Đặt lại</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => addToCalendar(b)} hitSlop={6} style={[styles.miniBtn, { borderColor: C.border }]}>
                      <Ionicons name="calendar-outline" size={14} color={C.accent} />
                      <Text style={{ color: C.text, fontWeight: "700", fontSize: 12 }}>Thêm vào lịch</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={{ justifyContent: "center", paddingRight: 10 }}><Ionicons name="chevron-forward" size={18} color={C.muted} /></View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", borderRadius: R.lg, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden", marginBottom: SP.md },
  dateBox: { width: 90, alignItems: "center", justifyContent: "center", padding: 10 },
  miniBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
});
