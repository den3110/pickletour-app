// app/owner/venue/[id]/index.tsx — Bảng điều khiển cụm sân: hero + menu + lịch đặt trong ngày
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
import DateTimePickerModal from "react-native-modal-datetime-picker";
import { useGetMyVenueAccessQuery } from "@/slices/venueStaffApiSlice";
import { fmtVND, pal, tLabel, toDateInput, addDays, dLabel, dtLabel, BOOKING_STATUS } from "@/utils/courtFormat";
import { Hero, Tile, SectionHeader, Card, Chip, Empty, PrimaryButton, GhostButton, SheetHandle, shadow, R, SP } from "@/components/courts/ui";

// perm = quyền cần để thấy tile (null = luôn hiện cho ai vào được hub)
const MGMT = [
  { key: "walkin", label: "Đặt hộ", icon: "person-add-outline", route: "walkin", tint: "#22c1d6", perm: "bookings.manage" },
  { key: "products", label: "Bán hàng", icon: "cart-outline", route: "products", tint: "#f59e0b", perm: "pos.sell" },
  { key: "events", label: "Sự kiện", icon: "ticket-outline", route: "events", tint: "#e11d48", perm: "events.manage" },
  { key: "packages", label: "Gói / thẻ", icon: "card-outline", route: "packages", tint: "#8b5cf6", perm: "packages.manage" },
  { key: "recurring", label: "Định kỳ", icon: "repeat-outline", route: "recurring", tint: "#0ea5e9", perm: "recurring.manage" },
  { key: "blocks", label: "Khoá sân", icon: "lock-closed-outline", route: "blocks", tint: "#64748b", perm: "blocks.manage" },
  { key: "promos", label: "Mã giảm", icon: "pricetag-outline", route: "promos", tint: "#ec4899", perm: "promos.manage" },
  { key: "analytics", label: "Phân tích", icon: "pie-chart-outline", route: "analytics", tint: "#10b981", perm: "analytics.view" },
  { key: "revenue", label: "Doanh thu", icon: "bar-chart-outline", route: "revenue", tint: "#22c55e", perm: "revenue.view" },
  { key: "staff", label: "Nhân viên", icon: "people-outline", route: "staff", tint: "#6366f1", perm: "staff.manage" },
  { key: "edit", label: "Cài đặt sân", icon: "settings-outline", route: "edit", tint: "#94a3b8", perm: "venue.edit" },
];
// "Đặt hộ" tái dùng màn đặt công khai (owner → tự confirmed)
const openTile = (m: any, id: string) =>
  m.key === "walkin"
    ? router.push({ pathname: "/courts/[id]", params: { id, walkin: "1" } })
    : router.push({ pathname: `/owner/venue/[id]/${m.route}` as any, params: { id } });

export default function OwnerVenueHub() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const C = useMemo(() => pal(!!theme.dark), [theme.dark]);
  const today = toDateInput();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [picker, setPicker] = useState<null | "from" | "to">(null);
  const [bill, setBill] = useState<any>(null);

  const { data: venue } = useGetVenueQuery(id, { skip: !id });
  const { data: access } = useGetMyVenueAccessQuery(id, { skip: !id });
  const canManage = !!access?.canManage;
  const myPerms: string[] = access?.permissions || [];
  const can = (p?: string) => canManage || !p || myPerms.includes(p);
  const tiles = useMemo(() => MGMT.filter((m) => can(m.perm)), [access]); // eslint-disable-line
  const canViewBookings = can("bookings.view");
  // Hero luôn hiển thị số liệu HÔM NAY; danh sách lịch đặt lọc theo khoảng from→to
  const { data: todayData } = useListVenueBookingsQuery({ venueId: id, date: today }, { skip: !id || !canViewBookings });
  const { data, isLoading, isFetching, refetch } = useListVenueBookingsQuery({ venueId: id, from, to }, { skip: !id || !canViewBookings });
  const [approve, { isLoading: approving }] = useApproveBookingMutation();
  const [reject, { isLoading: rejecting }] = useRejectBookingMutation();
  const [checkIn] = useCheckInBookingMutation();
  const [updateStatus] = useUpdateBookingStatusMutation();

  const todayItems: any[] = todayData || [];
  const active = todayItems.filter((b) => b.status !== "cancelled");
  const revenue = todayItems.filter((b) => b.payment?.status === "Paid").reduce((s, b) => s + (Number(b.totalPrice) || 0), 0);
  const awaiting = todayItems.filter((b) => b.status === "awaiting_approval").length;

  const items: any[] = data || [];
  const multiDay = from !== to;
  const rangeAwaiting = items.filter((b) => b.status === "awaiting_approval").length;
  const rangeRevenue = items.filter((b) => b.payment?.status === "Paid").reduce((s, b) => s + (Number(b.totalPrice) || 0), 0);
  const setPreset = (f: string, t: string) => { setFrom(f); setTo(t); };

  const run = async (fn: () => Promise<any>) => {
    try { await fn(); } catch (e: any) { Alert.alert("Lỗi", e?.data?.message || "Thao tác thất bại"); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen
        options={{
          title: venue?.name || "Cụm sân",
          headerRight: () => (
            <TouchableOpacity onPress={() => router.push("/owner/scan")} hitSlop={8} style={[styles.hdrBtn, { backgroundColor: C.accentSoft }]}>
              <Ionicons name="qr-code-outline" size={18} color={C.accent} />
            </TouchableOpacity>
          ),
        }}
      />
      <ScrollView
        contentContainerStyle={{ padding: SP.lg, paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} />}
      >
        {/* Hero */}
        <Hero C={C}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            {venue?.images?.[0] ? (
              <Image source={{ uri: venue.images[0] }} style={styles.heroImg} />
            ) : (
              <View style={[styles.heroImg, { backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" }]}>
                <Ionicons name="tennisball" size={26} color="#fff" />
              </View>
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.heroTitle} numberOfLines={1}>{venue?.name || "Cụm sân"}</Text>
              <Text style={styles.heroSub} numberOfLines={1}>
                {[venue?.address, venue?.province].filter(Boolean).join(", ") || "Chưa có địa chỉ"}
              </Text>
            </View>
          </View>
          <View style={styles.heroStats}>
            <HeroStat label="Lượt hôm nay" value={String(active.length)} />
            <View style={styles.heroDivider} />
            <HeroStat label="Đã thu" value={fmtVND(revenue)} />
            <View style={styles.heroDivider} />
            <HeroStat label="Chờ duyệt" value={String(awaiting)} highlight={awaiting > 0} />
          </View>
        </Hero>

        {/* Menu */}
        {tiles.length > 0 && (
          <>
            <SectionHeader C={C} title="Quản lý" right={access?.roleLabel && !canManage ? <Chip C={C} color={C.accent} label={access.roleLabel} small /> : null} />
            <View style={styles.grid}>
              {tiles.map((m) => (
                <Tile key={m.key} C={C} icon={m.icon} label={m.label} tint={m.tint} onPress={() => openTile(m, id)} />
              ))}
            </View>
          </>
        )}

        {/* Lịch đặt */}
        {canViewBookings && (
        <>
        <SectionHeader
          C={C}
          title="Lịch đặt"
          right={rangeAwaiting > 0 ? <Chip C={C} color={C.warning} label={`${rangeAwaiting} bill chờ duyệt`} small /> : null}
        />
        {/* Bộ lọc khoảng ngày */}
        <View style={styles.rangeRow}>
          <TouchableOpacity style={[styles.dateBtn, { backgroundColor: C.card, borderColor: C.border }]} onPress={() => setPicker("from")}>
            <Ionicons name="calendar-outline" size={15} color={C.accent} />
            <View>
              <Text style={{ color: C.muted, fontSize: 10 }}>Từ ngày</Text>
              <Text style={{ color: C.text, fontWeight: "700", fontSize: 13 }}>{from.split("-").reverse().join("/")}</Text>
            </View>
          </TouchableOpacity>
          <Ionicons name="arrow-forward" size={16} color={C.muted} />
          <TouchableOpacity style={[styles.dateBtn, { backgroundColor: C.card, borderColor: C.border }]} onPress={() => setPicker("to")}>
            <Ionicons name="calendar-outline" size={15} color={C.accent} />
            <View>
              <Text style={{ color: C.muted, fontSize: 10 }}>Đến ngày</Text>
              <Text style={{ color: C.text, fontWeight: "700", fontSize: 13 }}>{to.split("-").reverse().join("/")}</Text>
            </View>
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginHorizontal: -SP.lg }} contentContainerStyle={{ paddingHorizontal: SP.lg, gap: 8, paddingVertical: 2 }}>
          {[
            { k: "today", lbl: "Hôm nay", f: today, t: today },
            { k: "7d", lbl: "7 ngày tới", f: today, t: addDays(today, 6) },
            { k: "30d", lbl: "30 ngày tới", f: today, t: addDays(today, 29) },
            { k: "past7", lbl: "7 ngày qua", f: addDays(today, -6), t: today },
          ].map((p) => {
            const on = from === p.f && to === p.t;
            return (
              <TouchableOpacity key={p.k} onPress={() => setPreset(p.f, p.t)} style={[styles.presetChip, { backgroundColor: on ? C.accent : C.field }]}>
                <Text style={{ color: on ? C.onAccent : C.text, fontWeight: "700", fontSize: 12 }}>{p.lbl}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        {multiDay && (
          <View style={{ flexDirection: "row", gap: 16, marginTop: 8 }}>
            <Text style={{ color: C.sub, fontSize: 12.5 }}>{items.length} lượt</Text>
            <Text style={{ color: C.sub, fontSize: 12.5 }}>Đã thu: <Text style={{ color: C.success, fontWeight: "700" }}>{fmtVND(rangeRevenue)}</Text></Text>
          </View>
        )}

        <View style={{ marginTop: SP.md }}>
          {isLoading ? (
            <ActivityIndicator color={C.accent} style={{ marginTop: 20 }} />
          ) : items.length === 0 ? (
            <Card C={C} pad={0}><Empty C={C} title="Chưa có lượt đặt" subtitle="Khoảng thời gian này chưa có khách đặt sân." /></Card>
          ) : (
            items.map((b) => {
              const st = BOOKING_STATUS[b.status] || BOOKING_STATUS.pending;
              const paid = b.payment?.status === "Paid";
              const checkedIn = !!b.ticket?.checkedInAt;
              const awaitingBill = b.status === "awaiting_approval";
              return (
                <Card key={b._id} C={C} pad={0} style={[{ marginBottom: SP.md, overflow: "hidden" }, awaitingBill && { borderColor: C.info, borderWidth: 1 }]}>
                  <View style={{ flexDirection: "row" }}>
                    <View style={[styles.timeCol, { backgroundColor: `${st.color}18` }]}>
                      {multiDay && <Text style={{ color: st.color, fontWeight: "800", fontSize: 11, marginBottom: 1 }}>{dLabel(b.startAt)}</Text>}
                      <Text style={{ color: st.color, fontWeight: "900", fontSize: 16 }}>{tLabel(b.startAt)}</Text>
                      <Text style={{ color: st.color, fontSize: 11, opacity: 0.85 }}>→ {tLabel(b.endAt)}</Text>
                    </View>
                    <View style={{ flex: 1, padding: 12, minWidth: 0 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <Text style={{ color: C.text, fontWeight: "800", flex: 1 }} numberOfLines={1}>
                          {b.customerName || b.user?.name || "Khách"}
                        </Text>
                        <Chip C={C} color={st.color} label={st.label} small />
                      </View>
                      <Text style={{ color: C.sub, fontSize: 12.5, marginTop: 3 }} numberOfLines={1}>
                        {b.court?.name}{b.customerPhone || b.user?.phone ? ` · ${b.customerPhone || b.user?.phone}` : ""} · <Text style={{ color: C.text, fontWeight: "700" }}>{fmtVND(b.totalPrice)}</Text>
                      </Text>
                      {checkedIn && <Text style={{ color: C.success, fontSize: 12, marginTop: 3, fontWeight: "700" }}>✓ Check-in {dtLabel(b.ticket.checkedInAt)}</Text>}
                      <View style={styles.actions}>
                        {b.payment?.proofUrl && (
                          <ActBtn C={C} icon="receipt-outline" label={awaitingBill ? "Duyệt bill" : "Xem bill"} primary={awaitingBill} color={C.info} onPress={() => setBill(b)} />
                        )}
                        {b.status === "confirmed" && !checkedIn && (
                          <ActBtn C={C} icon="checkmark-done" label="Check-in" primary color={C.success} onPress={() => run(() => checkIn({ token: b.ticket?.token, venueId: id }).unwrap())} />
                        )}
                        {!paid && b.status !== "cancelled" && (
                          <ActBtn C={C} icon="cash-outline" label="Đã thu" color={C.success} onPress={() => run(() => approve({ id: b._id, venueId: id }).unwrap())} />
                        )}
                        {["pending", "awaiting_approval", "confirmed"].includes(b.status) && (
                          <ActBtn C={C} icon="close" label="Huỷ" color={C.muted} onPress={() => Alert.alert("Huỷ lượt đặt", `#${b.code}?`, [{ text: "Không" }, { text: "Huỷ đơn", style: "destructive", onPress: () => run(() => updateStatus({ id: b._id, status: "cancelled", venueId: id }).unwrap()) }])} />
                        )}
                      </View>
                    </View>
                  </View>
                </Card>
              );
            })
          )}
        </View>
        </>
        )}
      </ScrollView>

      {/* Modal duyệt bill */}
      <Modal visible={!!bill} transparent animationType="slide" onRequestClose={() => setBill(null)}>
        <View style={styles.modalWrap}>
          <View style={[styles.modal, { backgroundColor: C.card }, shadow(C.dark, 3)]}>
            <SheetHandle C={C} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <Text style={{ color: C.text, fontWeight: "900", fontSize: 18 }}>Bill chuyển khoản</Text>
              <TouchableOpacity onPress={() => setBill(null)} style={[styles.hdrBtn, { backgroundColor: C.field }]}><Ionicons name="close" size={18} color={C.sub} /></TouchableOpacity>
            </View>
            {bill && (
              <>
                <Text style={{ color: C.sub, marginBottom: 12 }}>
                  #{bill.code} · {bill.customerName || bill.user?.name} · {tLabel(bill.startAt)}–{tLabel(bill.endAt)} · <Text style={{ color: C.text, fontWeight: "800" }}>{fmtVND(bill.totalPrice)}</Text>
                </Text>
                {bill.payment?.proofUrl ? (
                  <TouchableOpacity activeOpacity={0.9} onPress={() => Linking.openURL(bill.payment.proofUrl)}>
                    <Image source={{ uri: bill.payment.proofUrl }} style={[styles.billImg, { borderColor: C.border }]} resizeMode="contain" />
                  </TouchableOpacity>
                ) : null}
                {bill.status === "awaiting_approval" && (
                  <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
                    <GhostButton
                      C={C}
                      color={C.danger}
                      label="Từ chối"
                      disabled={rejecting}
                      style={{ flex: 1, borderColor: C.danger }}
                      onPress={() => (Alert as any).prompt
                        ? (Alert as any).prompt("Từ chối bill", "Lý do:", (reason: string) => run(async () => { await reject({ id: bill._id, reason: reason || "", venueId: id }).unwrap(); setBill(null); }))
                        : run(async () => { await reject({ id: bill._id, reason: "", venueId: id }).unwrap(); setBill(null); })}
                    />
                    <PrimaryButton C={C} color={C.success} icon="checkmark-circle" label="Duyệt — đã nhận tiền" disabled={approving} style={{ flex: 1.4 }} onPress={() => run(async () => { await approve({ id: bill._id, venueId: id }).unwrap(); setBill(null); })} />
                  </View>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Chọn ngày (từ / đến) — xem lịch đặt bất kỳ khoảng thời gian */}
      <DateTimePickerModal
        isVisible={!!picker}
        mode="date"
        date={new Date(`${(picker === "to" ? to : from)}T12:00:00`)}
        onConfirm={(d) => {
          const s = toDateInput(d);
          if (picker === "from") { setFrom(s); if (s > to) setTo(s); }
          else if (picker === "to") { setTo(s); if (s < from) setFrom(s); }
          setPicker(null);
        }}
        onCancel={() => setPicker(null)}
      />
    </View>
  );
}

function HeroStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Text style={{ color: highlight ? "#fde68a" : "#fff", fontWeight: "900", fontSize: 17, letterSpacing: -0.3 }} numberOfLines={1}>{value}</Text>
      <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function ActBtn({ C, icon, label, onPress, primary, color }: any) {
  const c = color || C.accent;
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={[styles.act, primary ? { backgroundColor: c } : { backgroundColor: `${c}1a` }]}>
      <Ionicons name={icon} size={14} color={primary ? "#06111f" : c} />
      <Text style={{ color: primary ? "#06111f" : c, fontWeight: "700", fontSize: 12 }}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  hdrBtn: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  heroImg: { width: 58, height: 58, borderRadius: 16, borderWidth: 2, borderColor: "rgba(255,255,255,0.35)" },
  heroTitle: { color: "#fff", fontWeight: "900", fontSize: 19, letterSpacing: -0.3 },
  heroSub: { color: "rgba(255,255,255,0.72)", fontSize: 12.5, marginTop: 3 },
  heroStats: { flexDirection: "row", alignItems: "center", marginTop: 18, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.22)" },
  heroDivider: { width: StyleSheet.hairlineWidth, height: 28, backgroundColor: "rgba(255,255,255,0.22)" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  rangeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  dateBtn: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  presetChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  timeCol: { width: 82, alignItems: "center", justifyContent: "center", paddingVertical: 12 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  act: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 10 },
  modalWrap: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(2,6,23,0.6)" },
  modal: { padding: SP.xl, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, paddingBottom: 36, maxHeight: "88%" },
  billImg: { width: "100%", height: 340, borderRadius: R.md, backgroundColor: "#000", borderWidth: StyleSheet.hairlineWidth },
});
