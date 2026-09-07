// app/owner/venue/[id]/index.tsx — Bảng điều khiển cụm sân: lịch đặt trong ngày + thao tác
import React, { useMemo, useState } from "react";
import { View, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator, Image, Modal, Alert, Linking } from "react-native";
import { Text } from "@/components/ui/i18nText";
import { Ionicons } from "@expo/vector-icons";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { useGetVenueQuery } from "@/slices/venuesApiSlice";
import {
  useListVenueBookingsQuery,
  useApproveBookingMutation,
  useRejectBookingMutation,
  useCheckInBookingMutation,
  useUpdateBookingStatusMutation,
} from "@/slices/bookingsApiSlice";
import { fmtVND, pal, tLabel, toDateInput, addDays, dtLabel, BOOKING_STATUS } from "@/utils/courtFormat";

const MGMT = [
  { key: "walkin", label: "Đặt hộ", icon: "person-add-outline", route: "walkin" },
  { key: "products", label: "Bán hàng", icon: "cart-outline", route: "products" },
  { key: "packages", label: "Gói/thẻ", icon: "card-outline", route: "packages" },
  { key: "recurring", label: "Định kỳ", icon: "repeat-outline", route: "recurring" },
  { key: "blocks", label: "Khoá sân", icon: "lock-closed-outline", route: "blocks" },
  { key: "promos", label: "Mã giảm", icon: "pricetag-outline", route: "promos" },
  { key: "analytics", label: "Phân tích", icon: "pie-chart-outline", route: "analytics" },
  { key: "revenue", label: "Doanh thu", icon: "bar-chart-outline", route: "revenue" },
  { key: "edit", label: "Cài đặt sân", icon: "settings-outline", route: "edit" },
];
// "Đặt hộ" tái dùng màn đặt công khai (owner → tự confirmed)
const openTile = (m: any, id: string) =>
  m.key === "walkin"
    ? router.push({ pathname: "/courts/[id]", params: { id } })
    : router.push({ pathname: `/owner/venue/[id]/${m.route}` as any, params: { id } });

export default function OwnerVenueHub() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const C = useMemo(() => pal(!!theme.dark), [theme.dark]);
  const [date, setDate] = useState(toDateInput());
  const [bill, setBill] = useState<any>(null);

  const { data: venue } = useGetVenueQuery(id, { skip: !id });
  const { data, isLoading, isFetching, refetch } = useListVenueBookingsQuery({ venueId: id, date });
  const [approve, { isLoading: approving }] = useApproveBookingMutation();
  const [reject, { isLoading: rejecting }] = useRejectBookingMutation();
  const [checkIn] = useCheckInBookingMutation();
  const [updateStatus] = useUpdateBookingStatusMutation();

  const items: any[] = data || [];
  const revenue = items.filter((b) => b.payment?.status === "Paid").reduce((s, b) => s + (Number(b.totalPrice) || 0), 0);
  const awaiting = items.filter((b) => b.status === "awaiting_approval").length;

  const run = async (fn: () => Promise<any>) => {
    try { await fn(); } catch (e: any) { Alert.alert("Lỗi", e?.data?.message || "Thao tác thất bại"); }
  };

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(toDateInput(), i)), []);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen
        options={{
          title: venue?.name || "Cụm sân",
          headerRight: () => (
            <TouchableOpacity onPress={() => router.push("/owner/scan")} hitSlop={8}>
              <Ionicons name="qr-code-outline" size={22} color={C.accent} />
            </TouchableOpacity>
          ),
        }}
      />
      <ScrollView
        contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} />}
      >
        {/* Menu quản lý */}
        <View style={styles.grid}>
          {MGMT.map((m) => (
            <TouchableOpacity
              key={m.key}
              style={[styles.tile, { backgroundColor: C.card, borderColor: C.border }]}
              onPress={() => openTile(m, id)}
            >
              <Ionicons name={m.icon as any} size={22} color={C.accent} />
              <Text style={{ color: C.text, fontSize: 12, fontWeight: "700", marginTop: 4 }}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Chọn ngày */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 14 }} contentContainerStyle={{ gap: 8 }}>
          {days.map((d) => {
            const on = d === date;
            const [, m, dd] = d.split("-");
            return (
              <TouchableOpacity key={d} onPress={() => setDate(d)} style={[styles.day, { backgroundColor: on ? C.accent : C.card, borderColor: on ? C.accent : C.border }]}>
                <Text style={{ color: on ? "#0a0e1a" : C.text, fontWeight: "800" }}>{dd}/{m}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 12, marginBottom: 6 }}>
          <Text style={{ color: C.sub }}>{items.filter((b) => b.status !== "cancelled").length} lượt · thu {fmtVND(revenue)}</Text>
          {awaiting > 0 && <Text style={{ color: "#f59e0b", fontWeight: "700" }}>{awaiting} bill chờ duyệt</Text>}
        </View>

        {isLoading ? (
          <ActivityIndicator color={C.accent} style={{ marginTop: 20 }} />
        ) : items.length === 0 ? (
          <Text style={{ color: C.sub, textAlign: "center", marginTop: 24 }}>Chưa có lượt đặt trong ngày.</Text>
        ) : (
          items.map((b) => {
            const st = BOOKING_STATUS[b.status] || BOOKING_STATUS.pending;
            const paid = b.payment?.status === "Paid";
            const checkedIn = !!b.ticket?.checkedInAt;
            return (
              <View key={b._id} style={[styles.card, { backgroundColor: C.card, borderColor: b.status === "awaiting_approval" ? "#38bdf8" : C.border }]}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ color: C.text, fontWeight: "800" }}>{tLabel(b.startAt)}–{tLabel(b.endAt)} · {b.court?.name}</Text>
                  <View style={[styles.badge, { backgroundColor: `${st.color}26` }]}>
                    <Text style={{ color: st.color, fontWeight: "700", fontSize: 11 }}>{st.label}</Text>
                  </View>
                </View>
                <Text style={{ color: C.sub, marginTop: 4 }}>
                  {b.customerName || b.user?.name || "Khách"}{b.customerPhone || b.user?.phone ? ` · ${b.customerPhone || b.user?.phone}` : ""} · <Text style={{ color: C.text, fontWeight: "700" }}>{fmtVND(b.totalPrice)}</Text>
                </Text>
                {checkedIn && <Text style={{ color: "#22c55e", fontSize: 12, marginTop: 2 }}>✓ Check-in {dtLabel(b.ticket.checkedInAt)}</Text>}

                <View style={styles.actions}>
                  {b.payment?.proofUrl && (
                    <TouchableOpacity style={[styles.actBtn, { backgroundColor: b.status === "awaiting_approval" ? "#38bdf8" : C.field }]} onPress={() => setBill(b)}>
                      <Ionicons name="receipt-outline" size={15} color={b.status === "awaiting_approval" ? "#0a0e1a" : C.text} />
                      <Text style={{ color: b.status === "awaiting_approval" ? "#0a0e1a" : C.text, fontWeight: "700", fontSize: 12 }}>{b.status === "awaiting_approval" ? "Duyệt bill" : "Xem bill"}</Text>
                    </TouchableOpacity>
                  )}
                  {b.status === "confirmed" && !checkedIn && (
                    <TouchableOpacity style={[styles.actBtn, { backgroundColor: "#22c55e" }]} onPress={() => run(() => checkIn({ token: b.ticket?.token, venueId: id }).unwrap())}>
                      <Ionicons name="checkmark-done" size={15} color="#0a0e1a" />
                      <Text style={{ color: "#0a0e1a", fontWeight: "700", fontSize: 12 }}>Check-in</Text>
                    </TouchableOpacity>
                  )}
                  {!paid && b.status !== "cancelled" && (
                    <TouchableOpacity style={[styles.actBtn, { borderWidth: 1, borderColor: "#22c55e" }]} onPress={() => run(() => approve({ id: b._id, venueId: id }).unwrap())}>
                      <Text style={{ color: "#22c55e", fontWeight: "700", fontSize: 12 }}>Đã thu tiền</Text>
                    </TouchableOpacity>
                  )}
                  {["pending", "awaiting_approval", "confirmed"].includes(b.status) && (
                    <TouchableOpacity style={[styles.actBtn, { borderWidth: 1, borderColor: C.border }]} onPress={() => Alert.alert("Huỷ lượt đặt", `#${b.code}?`, [{ text: "Không" }, { text: "Huỷ đơn", style: "destructive", onPress: () => run(() => updateStatus({ id: b._id, status: "cancelled", venueId: id }).unwrap()) }])}>
                      <Text style={{ color: C.sub, fontWeight: "700", fontSize: 12 }}>Huỷ</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Modal duyệt bill */}
      <Modal visible={!!bill} transparent animationType="slide" onRequestClose={() => setBill(null)}>
        <View style={styles.modalWrap}>
          <View style={[styles.modal, { backgroundColor: C.card }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <Text style={{ color: C.text, fontWeight: "800", fontSize: 16 }}>Bill · #{bill?.code}</Text>
              <TouchableOpacity onPress={() => setBill(null)}><Ionicons name="close" size={22} color={C.sub} /></TouchableOpacity>
            </View>
            {bill && (
              <>
                <Text style={{ color: C.sub, marginBottom: 8 }}>
                  {bill.customerName || bill.user?.name} · {tLabel(bill.startAt)}–{tLabel(bill.endAt)} · {fmtVND(bill.totalPrice)}
                </Text>
                {bill.payment?.proofUrl ? (
                  <TouchableOpacity onPress={() => Linking.openURL(bill.payment.proofUrl)}>
                    <Image source={{ uri: bill.payment.proofUrl }} style={styles.billImg} resizeMode="contain" />
                  </TouchableOpacity>
                ) : null}
                {bill.status === "awaiting_approval" && (
                  <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                    <TouchableOpacity
                      style={[styles.mBtn, { borderWidth: 1, borderColor: "#ef4444" }]}
                      disabled={rejecting}
                      onPress={() => Alert.prompt ? Alert.prompt("Từ chối bill", "Lý do:", (reason) => run(async () => { await reject({ id: bill._id, reason: reason || "", venueId: id }).unwrap(); setBill(null); })) : run(async () => { await reject({ id: bill._id, reason: "", venueId: id }).unwrap(); setBill(null); })}
                    >
                      <Text style={{ color: "#ef4444", fontWeight: "800" }}>Từ chối</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.mBtn, { backgroundColor: "#22c55e" }]}
                      disabled={approving}
                      onPress={() => run(async () => { await approve({ id: bill._id, venueId: id }).unwrap(); setBill(null); })}
                    >
                      <Text style={{ color: "#0a0e1a", fontWeight: "800" }}>Duyệt — đã nhận tiền</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tile: { width: "31.5%", aspectRatio: 1.35, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  day: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  card: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 10 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  actBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  modalWrap: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" },
  modal: { padding: 16, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 34, maxHeight: "88%" },
  billImg: { width: "100%", height: 340, borderRadius: 10, backgroundColor: "#000" },
  mBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center" },
});
