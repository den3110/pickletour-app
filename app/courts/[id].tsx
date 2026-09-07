// app/courts/[id].tsx — Chi tiết cụm sân + chọn giờ trống + đặt sân
import React, { useMemo, useState, useCallback } from "react";
import {
  View,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  Linking,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Text } from "@/components/ui/i18nText";
import { Ionicons } from "@expo/vector-icons";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { useSelector } from "react-redux";
import { useGetVenueQuery, useGetVenueAvailabilityQuery } from "@/slices/venuesApiSlice";
import { useCreateBookingMutation } from "@/slices/bookingsApiSlice";
import { useLazyValidatePromoQuery } from "@/slices/venueOwnerApiSlice";
import { useGetReviewSummaryQuery } from "@/slices/reviewApiSlice";
import { useListVenuePackagesQuery, usePurchasePackageMutation, useMyPackagesQuery } from "@/slices/packagesApiSlice";
import VenueMiniMap from "@/components/courts/VenueMiniMap";
import { fmtVND, pal, toDateInput, addDays, WEEKDAYS_SHORT, weekdayOf } from "@/utils/courtFormat";

type Slot = { start: string; end: string; price: number; booked: boolean; past: boolean };
type Sel = { courtId: string; courtName: string; slots: Slot[] } | null;

export default function VenueDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const C = useMemo(() => pal(!!theme.dark), [theme.dark]);
  const me = useSelector((s: any) => s.auth?.userInfo);

  const today = toDateInput();
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(today, i)), [today]);
  const [date, setDate] = useState(today);

  const { data: venue, isLoading } = useGetVenueQuery(id, { skip: !id });
  const { data: avail, isFetching: loadingAvail } = useGetVenueAvailabilityQuery(
    { venueId: id, date },
    { skip: !id },
  );
  const [createBooking, { isLoading: booking }] = useCreateBookingMutation();

  const [sel, setSel] = useState<Sel>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [promo, setPromo] = useState("");
  const [promoInfo, setPromoInfo] = useState<any>(null); // { discount, reason, ok }
  const [validatePromo, { isFetching: checkingPromo }] = useLazyValidatePromoQuery();
  const [usePkg, setUsePkg] = useState<any>(null); // gói giờ được chọn để thanh toán

  const { data: reviewSum } = useGetReviewSummaryQuery({ targetType: "venue", targetId: id }, { skip: !id });
  const { data: venuePackages } = useListVenuePackagesQuery(id, { skip: !id });
  const { data: myPkgs } = useMyPackagesQuery(undefined, { skip: !me });
  const [purchasePackage, { isLoading: purchasing }] = usePurchasePackageMutation();
  const [pkgBank, setPkgBank] = useState<any>(null); // { bank, packageName } sau khi mua

  // Chọn slot: giữ dải liên tiếp trên cùng 1 sân; bấm slot đã chọn ở cuối → bỏ bớt
  const toggleSlot = useCallback((court: any, slot: Slot) => {
    if (slot.booked || slot.past) return;
    setSel((prev) => {
      if (!prev || prev.courtId !== String(court._id)) {
        return { courtId: String(court._id), courtName: court.name, slots: [slot] };
      }
      const idx = prev.slots.findIndex((s) => s.start === slot.start);
      if (idx >= 0) {
        const next = prev.slots.slice(0, idx);
        return next.length ? { ...prev, slots: next } : null;
      }
      const last = prev.slots[prev.slots.length - 1];
      const first = prev.slots[0];
      if (slot.start === last.end) return { ...prev, slots: [...prev.slots, slot] };
      if (slot.end === first.start) return { ...prev, slots: [slot, ...prev.slots] };
      return { courtId: String(court._id), courtName: court.name, slots: [slot] };
    });
  }, []);

  const total = sel ? sel.slots.reduce((s, x) => s + (Number(x.price) || 0), 0) : 0;
  const start = sel?.slots[0]?.start;
  const end = sel?.slots[sel.slots.length - 1]?.end;

  const openConfirm = () => {
    if (!me) {
      Alert.alert("Cần đăng nhập", "Đăng nhập để đặt sân.", [
        { text: "Huỷ", style: "cancel" },
        { text: "Đăng nhập", onPress: () => router.push("/login") },
      ]);
      return;
    }
    setName(me?.name || "");
    setPhone(me?.phone || "");
    setNote("");
    setPromo("");
    setPromoInfo(null);
    setUsePkg(null);
    setConfirmOpen(true);
  };

  // Gói còn hiệu lực ở sân này, đủ số giờ cho lượt đang chọn
  const durMin = sel ? sel.slots.length * (venue?.slotMinutes || 60) : 0;
  const eligiblePkgs = useMemo(
    () =>
      (Array.isArray(myPkgs) ? myPkgs : []).filter(
        (p: any) =>
          p.status === "active" &&
          String(p.venue?._id || p.venue) === String(id) &&
          (!p.expiresAt || new Date(p.expiresAt).getTime() > Date.now()) &&
          (p.type === "period" || p.minutesRemaining >= durMin),
      ),
    [myPkgs, id, durMin],
  );

  const buyPackage = async (pkg: any) => {
    if (!me) { router.push("/login"); return; }
    try {
      const r: any = await purchasePackage({ venueId: id, packageId: pkg._id }).unwrap();
      setPkgBank({ bank: r.bank, packageName: pkg.name, price: pkg.price });
    } catch (e: any) {
      Alert.alert("Lỗi", e?.data?.message || "Không mua được gói");
    }
  };

  const checkPromo = async () => {
    const code = promo.trim().toUpperCase();
    if (!code) { setPromoInfo(null); return; }
    try {
      const r: any = await validatePromo({ venueId: id, code, total }).unwrap();
      setPromoInfo(r);
    } catch {
      setPromoInfo({ ok: false, discount: 0, reason: "Không kiểm tra được mã" });
    }
  };

  const discount = promoInfo?.ok ? promoInfo.discount : 0;
  const payable = Math.max(0, total - discount);

  const submit = async () => {
    if (!sel || !start || !end) return;
    try {
      const b: any = await createBooking({
        venueId: id,
        courtId: sel.courtId,
        date,
        start,
        end,
        customerName: name,
        customerPhone: phone,
        note,
        promoCode: !usePkg && promoInfo?.ok ? promo.trim().toUpperCase() : undefined,
        packagePurchaseId: usePkg?._id,
      }).unwrap();
      setConfirmOpen(false);
      setSel(null);
      router.push({ pathname: "/courts/booking/[id]", params: { id: String(b._id) } });
    } catch (e: any) {
      Alert.alert("Đặt sân thất bại", e?.data?.message || "Vui lòng thử lại.");
    }
  };

  const hoursToday = venue?.openHours?.[weekdayOf(date)];

  if (isLoading || !venue) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Stack.Screen options={{ title: "Sân" }} />
        <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{ title: venue.name || "Sân" }} />
      <ScrollView contentContainerStyle={{ paddingBottom: sel ? 120 : 30 }}>
        {venue.images?.[0] ? (
          <Image source={{ uri: venue.images[0] }} style={styles.cover} />
        ) : null}
        <View style={{ padding: 14 }}>
          <Text style={[styles.title, { color: C.text }]}>{venue.name}</Text>
          <TouchableOpacity
            style={styles.row}
            onPress={() => {
              const q = encodeURIComponent([venue.address, venue.province].filter(Boolean).join(", "));
              if (q) Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`);
            }}
          >
            <Ionicons name="location-outline" size={15} color={C.sub} />
            <Text style={[styles.sub, { color: C.sub, textDecorationLine: "underline" }]}>
              {[venue.address, venue.province].filter(Boolean).join(", ") || "—"}
            </Text>
          </TouchableOpacity>
          {!!venue.phone && (
            <TouchableOpacity style={styles.row} onPress={() => Linking.openURL(`tel:${venue.phone}`)}>
              <Ionicons name="call-outline" size={15} color={C.sub} />
              <Text style={[styles.sub, { color: C.accent }]}>{venue.phone}</Text>
            </TouchableOpacity>
          )}
          <View style={styles.row}>
            <Ionicons name="time-outline" size={15} color={C.sub} />
            <Text style={[styles.sub, { color: C.sub }]}>
              {hoursToday?.closed ? "Đóng cửa" : `${hoursToday?.open || "--"} – ${hoursToday?.close || "--"}`}
              {venue.slotMinutes ? ` · bước ${venue.slotMinutes}'` : ""}
            </Text>
          </View>
          {!!venue.description && (
            <Text style={[styles.desc, { color: C.text }]}>{venue.description}</Text>
          )}
          {Array.isArray(venue.amenities) && venue.amenities.length > 0 && (
            <View style={styles.chips}>
              {venue.amenities.map((a: string) => (
                <View key={a} style={[styles.chip, { backgroundColor: C.field }]}>
                  <Text style={{ color: C.sub, fontSize: 12 }}>{a}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {venue.locationGeo?.lat && venue.locationGeo?.lon ? (
          <VenueMiniMap lat={venue.locationGeo.lat} lon={venue.locationGeo.lon} name={venue.name} accent={C.accent} card={C.card} sub={C.sub} />
        ) : null}

        {/* Đánh giá */}
        <TouchableOpacity style={[styles.reviewBtn, { borderColor: C.border }]} onPress={() => router.push({ pathname: "/courts/reviews/[id]", params: { id } })}>
          <Ionicons name="star" size={16} color="#f59e0b" />
          <Text style={{ color: C.text, fontWeight: "700", flex: 1 }}>
            {reviewSum?.summary?.count ? `Đánh giá ${reviewSum.summary.avg?.toFixed(1)}★ · ${reviewSum.summary.count} lượt` : "Đánh giá sân"}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={C.sub} />
        </TouchableOpacity>

        {/* Gói giờ / thẻ tháng */}
        {Array.isArray(venuePackages) && venuePackages.length > 0 && (
          <View style={{ paddingHorizontal: 14, marginTop: 10 }}>
            <Text style={{ color: C.text, fontWeight: "800", marginBottom: 8 }}>Gói giờ / thẻ tháng</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {venuePackages.map((p: any) => (
                <View key={p._id} style={[styles.pkgCard, { backgroundColor: C.card, borderColor: C.border }]}>
                  <Text style={{ color: C.text, fontWeight: "800" }} numberOfLines={1}>{p.name}</Text>
                  <Text style={{ color: C.sub, fontSize: 12, marginTop: 2 }}>{p.type === "credits" ? `${p.hours} giờ` : "Không giới hạn"} · {p.validDays} ngày</Text>
                  <Text style={{ color: C.accent, fontWeight: "900", fontSize: 16, marginTop: 6 }}>{fmtVND(p.price)}</Text>
                  <TouchableOpacity style={[styles.pkgBuy, { backgroundColor: C.accent, opacity: purchasing ? 0.6 : 1 }]} disabled={purchasing} onPress={() => buyPackage(p)}>
                    <Text style={{ color: "#0a0e1a", fontWeight: "800", fontSize: 12 }}>Mua gói</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Ngày */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 8 }}>
          {days.map((d) => {
            const on = d === date;
            const [, m, dd] = d.split("-");
            return (
              <TouchableOpacity
                key={d}
                onPress={() => { setDate(d); setSel(null); }}
                style={[styles.day, { backgroundColor: on ? C.accent : C.card, borderColor: on ? C.accent : C.border }]}
              >
                <Text style={{ color: on ? "#0a0e1a" : C.sub, fontSize: 12, fontWeight: "700" }}>{WEEKDAYS_SHORT[weekdayOf(d)]}</Text>
                <Text style={{ color: on ? "#0a0e1a" : C.text, fontSize: 16, fontWeight: "800" }}>{dd}/{m}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Lưới giờ trống theo sân */}
        <View style={{ padding: 14, gap: 14 }}>
          {loadingAvail && !avail ? (
            <ActivityIndicator color={C.accent} />
          ) : (avail?.courts || []).length === 0 ? (
            <Text style={{ color: C.sub }}>Sân chưa mở đặt chỗ.</Text>
          ) : (
            (avail?.courts || []).map((court: any) => (
              <View key={court._id} style={[styles.courtCard, { backgroundColor: C.card, borderColor: C.border }]}>
                <Text style={[styles.courtName, { color: C.text }]}>{court.name}</Text>
                {court.closed ? (
                  <Text style={{ color: C.sub, fontSize: 13 }}>Đóng cửa ngày này</Text>
                ) : (
                  <View style={styles.slotWrap}>
                    {court.slots.map((s: Slot) => {
                      const picked = sel?.courtId === String(court._id) && sel.slots.some((x) => x.start === s.start);
                      const disabled = s.booked || s.past;
                      return (
                        <TouchableOpacity
                          key={s.start}
                          disabled={disabled}
                          onPress={() => toggleSlot(court, s)}
                          style={[
                            styles.slot,
                            { borderColor: picked ? C.accent : C.border, backgroundColor: picked ? C.accent : disabled ? C.field : "transparent", opacity: disabled ? 0.45 : 1 },
                          ]}
                        >
                          <Text style={{ color: picked ? "#0a0e1a" : C.text, fontWeight: "700", fontSize: 13 }}>{s.start}</Text>
                          <Text style={{ color: picked ? "#0a0e1a" : C.sub, fontSize: 10 }}>
                            {s.booked ? "Đã đặt" : s.past ? "Đã qua" : fmtVND(s.price)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Thanh chọn */}
      {sel && start && end && (
        <View style={[styles.bar, { backgroundColor: C.card, borderColor: C.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.text, fontWeight: "800" }}>{sel.courtName} · {start} → {end}</Text>
            <Text style={{ color: C.accent, fontWeight: "900", fontSize: 18 }}>{fmtVND(total)}</Text>
          </View>
          <TouchableOpacity style={[styles.btn, { backgroundColor: C.accent }]} onPress={openConfirm}>
            <Text style={{ color: "#0a0e1a", fontWeight: "800" }}>Đặt sân</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Xác nhận */}
      <Modal visible={confirmOpen} transparent animationType="slide" onRequestClose={() => setConfirmOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalWrap}>
          <View style={[styles.modal, { backgroundColor: C.card }]}>
            <Text style={[styles.title, { color: C.text, marginBottom: 6 }]}>Xác nhận đặt sân</Text>
            <Text style={{ color: C.sub, marginBottom: 10 }}>
              {venue.name} · {sel?.courtName} · {date.split("-").reverse().join("/")} · {start} → {end}
            </Text>
            <TextInput style={[styles.input, { backgroundColor: C.field, color: C.text }]} placeholder="Tên người đặt" placeholderTextColor={C.sub} value={name} onChangeText={setName} />
            <TextInput style={[styles.input, { backgroundColor: C.field, color: C.text }]} placeholder="Số điện thoại" placeholderTextColor={C.sub} keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
            <TextInput style={[styles.input, { backgroundColor: C.field, color: C.text, height: 70 }]} placeholder="Ghi chú (tuỳ chọn)" placeholderTextColor={C.sub} multiline value={note} onChangeText={(t) => setNote(t.slice(0, 500))} />
            {/* Thanh toán bằng gói */}
            {eligiblePkgs.length > 0 && (
              <View style={{ marginBottom: 10 }}>
                <Text style={{ color: C.sub, fontSize: 13, marginBottom: 6 }}>Thanh toán bằng gói</Text>
                {eligiblePkgs.map((p: any) => {
                  const on = usePkg?._id === p._id;
                  return (
                    <TouchableOpacity key={p._id} onPress={() => setUsePkg(on ? null : p)} style={[styles.pkgOpt, { borderColor: on ? C.accent : C.border, backgroundColor: on ? `${C.accent}18` : "transparent" }]}>
                      <Ionicons name={on ? "checkmark-circle" : "ellipse-outline"} size={18} color={on ? C.accent : C.sub} />
                      <Text style={{ color: C.text, flex: 1 }}>{p.packageName}{p.type === "credits" ? ` · còn ${Math.floor(p.minutesRemaining / 60)}h${p.minutesRemaining % 60 ? `${p.minutesRemaining % 60}'` : ""}` : ""}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Mã giảm giá */}
            {!usePkg && (
            <>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
              <TextInput style={[styles.input, { backgroundColor: C.field, color: C.text, flex: 1, marginBottom: 0 }]} placeholder="Mã giảm giá" placeholderTextColor={C.sub} autoCapitalize="characters" value={promo} onChangeText={setPromo} />
              <TouchableOpacity style={[styles.btn, { paddingHorizontal: 18, backgroundColor: C.field }]} onPress={checkPromo} disabled={checkingPromo}>
                <Text style={{ color: C.text, fontWeight: "700" }}>{checkingPromo ? "…" : "Áp dụng"}</Text>
              </TouchableOpacity>
            </View>
            {promoInfo && (
              <Text style={{ color: promoInfo.ok ? "#22c55e" : "#ef4444", fontSize: 12, marginBottom: 8 }}>
                {promoInfo.ok ? `Đã áp mã · giảm ${fmtVND(promoInfo.discount)}` : promoInfo.reason}
              </Text>
            )}
            </>
            )}
            {/* Tổng thanh toán */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 12 }}>
              <Text style={{ color: C.sub }}>Thanh toán</Text>
              <View style={{ alignItems: "flex-end" }}>
                {usePkg ? (
                  <Text style={{ color: "#22c55e", fontWeight: "900", fontSize: 18 }}>Dùng gói</Text>
                ) : (
                  <>
                    {discount > 0 && <Text style={{ color: C.sub, fontSize: 13, textDecorationLine: "line-through" }}>{fmtVND(total)}</Text>}
                    <Text style={{ color: C.accent, fontWeight: "900", fontSize: 20 }}>{fmtVND(payable)}</Text>
                  </>
                )}
              </View>
            </View>
            <Text style={{ color: C.sub, fontSize: 12, marginBottom: 12 }}>
              {usePkg
                ? "Thanh toán bằng gói — xác nhận ngay, không cần chuyển khoản."
                : "Sau khi đặt, bạn chuyển khoản qua QR và gửi bill để chủ sân duyệt. Đơn giữ chỗ 30 phút."}
            </Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity style={[styles.btn, { flex: 1, borderWidth: 1, borderColor: C.border }]} onPress={() => setConfirmOpen(false)}>
                <Text style={{ color: C.sub, fontWeight: "700" }}>Huỷ</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, { flex: 1, backgroundColor: C.accent, opacity: booking ? 0.6 : 1 }]} disabled={booking} onPress={submit}>
                <Text style={{ color: "#0a0e1a", fontWeight: "800" }}>{booking ? "Đang đặt…" : "Xác nhận"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Mua gói: QR chuyển khoản */}
      <Modal visible={!!pkgBank} transparent animationType="slide" onRequestClose={() => setPkgBank(null)}>
        <View style={styles.modalWrap}>
          <View style={[styles.modal, { backgroundColor: C.card, alignItems: "center" }]}>
            <Text style={[styles.title, { color: C.text, marginBottom: 4 }]}>Mua {pkgBank?.packageName}</Text>
            <Text style={{ color: C.sub, marginBottom: 10 }}>Chuyển khoản để chủ sân kích hoạt gói</Text>
            {pkgBank?.bank?.qrUrl ? <Image source={{ uri: pkgBank.bank.qrUrl }} style={{ width: 200, height: 200, borderRadius: 12, backgroundColor: "#fff" }} resizeMode="contain" /> : null}
            <Text style={{ color: C.accent, fontWeight: "900", fontSize: 22, marginTop: 10 }}>{fmtVND(pkgBank?.price)}</Text>
            {pkgBank?.bank?.bankAccountNumber ? <Text style={{ color: C.text, marginTop: 4 }}>{pkgBank.bank.bankShortName} · {pkgBank.bank.bankAccountNumber}</Text> : null}
            {pkgBank?.bank?.memo ? <Text style={{ color: C.sub, marginTop: 2 }}>ND: {pkgBank.bank.memo}</Text> : null}
            <TouchableOpacity style={[styles.btn, { backgroundColor: C.accent, marginTop: 16, alignSelf: "stretch" }]} onPress={() => { setPkgBank(null); router.push("/courts/my-packages"); }}>
              <Text style={{ color: "#0a0e1a", fontWeight: "800", textAlign: "center" }}>Đã chuyển khoản</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { width: "100%", height: 200 },
  reviewBtn: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 14, marginTop: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1 },
  pkgCard: { width: 160, borderRadius: 12, borderWidth: 1, padding: 12 },
  pkgBuy: { marginTop: 8, paddingVertical: 8, borderRadius: 8, alignItems: "center" },
  pkgOpt: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 6 },
  title: { fontSize: 20, fontWeight: "900" },
  row: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  sub: { fontSize: 13, flexShrink: 1 },
  desc: { fontSize: 14, lineHeight: 20, marginTop: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  day: { width: 62, paddingVertical: 8, borderRadius: 12, borderWidth: 1, alignItems: "center" },
  courtCard: { borderRadius: 14, borderWidth: 1, padding: 12 },
  courtName: { fontSize: 15, fontWeight: "800", marginBottom: 8 },
  slotWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  slot: { width: "22.5%", paddingVertical: 8, borderRadius: 10, borderWidth: 1, alignItems: "center" },
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    paddingBottom: 28,
    borderTopWidth: 1,
  },
  btn: { paddingHorizontal: 22, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  modalWrap: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" },
  modal: { padding: 18, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 34 },
  input: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginBottom: 10 },
});
