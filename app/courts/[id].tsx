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
import { LinearGradient } from "expo-linear-gradient";
import VenueMiniMap from "@/components/courts/VenueMiniMap";
import { fmtVND, pal, toDateInput, addDays, weekdayOf } from "@/utils/courtFormat";
import { DateStrip, SectionHeader, SheetHandle, shadow, R, SP } from "@/components/courts/ui";

type Slot = { start: string; end: string; price: number; booked: boolean; past: boolean };
type Sel = { courtId: string; courtName: string; slots: Slot[] } | null;

export default function VenueDetailScreen() {
  const { id, walkin } = useLocalSearchParams<{ id: string; walkin?: string }>();
  const asOwner = walkin === "1"; // chủ sân "Đặt hộ" khách vãng lai → đơn xác nhận ngay
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
    const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(String(date)) ? date : toDateInput();
    try {
      const b: any = await createBooking({
        venueId: id,
        courtId: sel.courtId,
        date: safeDate,
        start,
        end,
        customerName: name,
        customerPhone: phone,
        note,
        promoCode: !usePkg && promoInfo?.ok ? promo.trim().toUpperCase() : undefined,
        packagePurchaseId: usePkg?._id,
        asOwner: asOwner || undefined,
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
        {/* Cover + tên sân phủ gradient */}
        <View>
          {venue.images?.[0] ? (
            <Image source={{ uri: venue.images[0] }} style={styles.cover} />
          ) : (
            <LinearGradient colors={C.heroGrad} style={[styles.cover, { alignItems: "center", justifyContent: "center" }]}>
              <Ionicons name="tennisball" size={54} color="rgba(255,255,255,0.5)" />
            </LinearGradient>
          )}
          <LinearGradient colors={["rgba(2,6,23,0)", "rgba(2,6,23,0.82)"]} style={styles.coverShade} />
          <View style={styles.coverBottom}>
            <Text style={styles.coverTitle} numberOfLines={2}>{venue.name}</Text>
            {reviewSum?.summary?.count ? (
              <View style={styles.ratingPill}>
                <Ionicons name="star" size={12} color="#f5b301" />
                <Text style={{ color: "#fff", fontSize: 12, fontWeight: "800" }}>{reviewSum.summary.avg?.toFixed(1)} · {reviewSum.summary.count} đánh giá</Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={[styles.infoCard, { backgroundColor: C.card, borderColor: C.border }, shadow(C.dark, 2)]}>
          <TouchableOpacity
            style={styles.row}
            onPress={() => {
              const q = encodeURIComponent([venue.address, venue.province].filter(Boolean).join(", "));
              if (q) Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`);
            }}
          >
            <View style={[styles.rowIcon, { backgroundColor: C.accentSoft }]}><Ionicons name="location" size={14} color={C.accent} /></View>
            <Text style={[styles.sub, { color: C.text }]}>
              {[venue.address, venue.province].filter(Boolean).join(", ") || "—"}
            </Text>
            <Ionicons name="open-outline" size={14} color={C.muted} />
          </TouchableOpacity>
          {!!venue.phone && (
            <TouchableOpacity style={styles.row} onPress={() => Linking.openURL(`tel:${venue.phone}`)}>
              <View style={[styles.rowIcon, { backgroundColor: C.accentSoft }]}><Ionicons name="call" size={14} color={C.accent} /></View>
              <Text style={[styles.sub, { color: C.accent, fontWeight: "700" }]}>{venue.phone}</Text>
            </TouchableOpacity>
          )}
          <View style={styles.row}>
            <View style={[styles.rowIcon, { backgroundColor: C.accentSoft }]}><Ionicons name="time" size={14} color={C.accent} /></View>
            <Text style={[styles.sub, { color: C.text }]}>
              {hoursToday?.closed ? "Đóng cửa" : `${hoursToday?.open || "--"} – ${hoursToday?.close || "--"}`}
              {venue.slotMinutes ? ` · bước ${venue.slotMinutes}'` : ""}
            </Text>
          </View>
          {!!venue.description && (
            <Text style={[styles.desc, { color: C.sub }]}>{venue.description}</Text>
          )}
          {Array.isArray(venue.amenities) && venue.amenities.length > 0 && (
            <View style={styles.chips}>
              {venue.amenities.map((a: string) => (
                <View key={a} style={[styles.chip, { backgroundColor: C.field }]}>
                  <Ionicons name="checkmark-circle" size={12} color={C.success} />
                  <Text style={{ color: C.text, fontSize: 12, fontWeight: "600" }}>{a}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {venue.locationGeo?.lat && venue.locationGeo?.lon ? (
          <VenueMiniMap lat={venue.locationGeo.lat} lon={venue.locationGeo.lon} name={venue.name} accent={C.accent} card={C.card} sub={C.sub} />
        ) : null}

        {/* Đánh giá */}
        <TouchableOpacity activeOpacity={0.85} style={[styles.reviewBtn, { backgroundColor: C.card, borderColor: C.border }, shadow(C.dark, 1)]} onPress={() => router.push({ pathname: "/courts/reviews/[id]", params: { id } })}>
          <View style={[styles.rowIcon, { backgroundColor: "rgba(245,179,1,0.16)" }]}><Ionicons name="star" size={14} color="#f5b301" /></View>
          <Text style={{ color: C.text, fontWeight: "700", flex: 1 }}>
            {reviewSum?.summary?.count ? `${reviewSum.summary.avg?.toFixed(1)}★ · ${reviewSum.summary.count} đánh giá` : "Xem & viết đánh giá"}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={C.muted} />
        </TouchableOpacity>

        {/* Gói giờ / thẻ tháng */}
        {Array.isArray(venuePackages) && venuePackages.length > 0 && (
          <View style={{ paddingHorizontal: SP.lg }}>
            <SectionHeader C={C} title="Gói giờ / thẻ tháng" style={{ marginTop: SP.lg }} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginHorizontal: -SP.lg }} contentContainerStyle={{ gap: 10, paddingHorizontal: SP.lg, paddingBottom: 6 }}>
              {venuePackages.map((p: any) => (
                <LinearGradient key={p._id} colors={C.heroGradAlt} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.pkgCard, shadow(C.dark, 2)]}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name={p.type === "credits" ? "hourglass" : "infinite"} size={14} color="#fde68a" />
                    <Text style={{ color: "#fff", fontWeight: "800" }} numberOfLines={1}>{p.name}</Text>
                  </View>
                  <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 12, marginTop: 4 }}>{p.type === "credits" ? `${p.hours} giờ chơi` : "Không giới hạn"} · {p.validDays} ngày</Text>
                  <Text style={{ color: "#fff", fontWeight: "900", fontSize: 18, marginTop: 8, letterSpacing: -0.3 }}>{fmtVND(p.price)}</Text>
                  <TouchableOpacity style={[styles.pkgBuy, { backgroundColor: "#fff", opacity: purchasing ? 0.6 : 1 }]} disabled={purchasing} onPress={() => buyPackage(p)}>
                    <Text style={{ color: "#0f172a", fontWeight: "800", fontSize: 12 }}>Mua gói</Text>
                  </TouchableOpacity>
                </LinearGradient>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Ngày */}
        <View style={{ paddingHorizontal: SP.lg }}>
          <SectionHeader C={C} title="Chọn ngày & giờ" right={<Text style={{ color: C.sub, fontSize: 12 }}>Chạm để chọn nhiều khung liên tiếp</Text>} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: SP.lg, paddingBottom: 4 }}>
          <DateStrip C={C} dates={days} value={date} onChange={(d) => { setDate(d); setSel(null); }} />
        </ScrollView>

        {/* Lưới giờ trống theo sân */}
        <View style={{ padding: SP.lg, gap: SP.md }}>
          {loadingAvail && !avail ? (
            <ActivityIndicator color={C.accent} />
          ) : (avail?.courts || []).length === 0 ? (
            <View style={[styles.courtCard, { backgroundColor: C.card, borderColor: C.border, alignItems: "center" }]}>
              <Ionicons name="lock-closed-outline" size={22} color={C.muted} />
              <Text style={{ color: C.sub, marginTop: 6 }}>Sân chưa mở đặt chỗ.</Text>
            </View>
          ) : (
            (avail?.courts || []).map((court: any) => {
              const isActive = sel?.courtId === String(court._id);
              const freeCount = court.closed ? 0 : court.slots.filter((s: Slot) => !s.booked && !s.past).length;
              return (
                <View key={court._id} style={[styles.courtCard, { backgroundColor: C.card, borderColor: isActive ? C.accent : C.border }, shadow(C.dark, 1)]}>
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
                    <View style={[styles.courtIcon, { backgroundColor: isActive ? C.accent : C.accentSoft }]}>
                      <Ionicons name="tennisball" size={14} color={isActive ? C.onAccent : C.accent} />
                    </View>
                    <Text style={[styles.courtName, { color: C.text }]}>{court.name}</Text>
                    {!court.closed && (
                      <Text style={{ color: freeCount ? C.success : C.muted, fontSize: 12, fontWeight: "700" }}>{freeCount ? `${freeCount} khung trống` : "Hết chỗ"}</Text>
                    )}
                  </View>
                  {court.closed ? (
                    <Text style={{ color: C.sub, fontSize: 13 }}>Đóng cửa ngày này</Text>
                  ) : (
                    <View style={styles.slotWrap}>
                      {court.slots.map((s: Slot) => {
                        const picked = isActive && sel!.slots.some((x) => x.start === s.start);
                        const disabled = s.booked || s.past;
                        return (
                          <TouchableOpacity
                            key={s.start}
                            disabled={disabled}
                            activeOpacity={0.8}
                            onPress={() => toggleSlot(court, s)}
                            style={[
                              styles.slot,
                              picked
                                ? { backgroundColor: C.accent, borderColor: C.accent }
                                : disabled
                                ? { backgroundColor: C.field, borderColor: "transparent", opacity: 0.5 }
                                : { backgroundColor: C.cardAlt, borderColor: C.border },
                              picked ? shadow(C.dark, 2) : null,
                            ]}
                          >
                            <Text style={{ color: picked ? C.onAccent : C.text, fontWeight: "800", fontSize: 13 }}>{s.start}</Text>
                            <Text style={{ color: picked ? C.onAccent : disabled ? C.muted : C.sub, fontSize: 10, marginTop: 2 }} numberOfLines={1}>
                              {s.booked ? "Đã đặt" : s.past ? "Đã qua" : fmtVND(s.price)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Thanh chọn */}
      {sel && start && end && (
        <View style={[styles.bar, { backgroundColor: C.card, borderColor: C.border }, shadow(C.dark, 3)]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: C.sub, fontSize: 12 }} numberOfLines={1}>{sel.courtName} · {date.split("-").reverse().slice(0, 2).join("/")}</Text>
            <Text style={{ color: C.text, fontWeight: "800", fontSize: 14, marginTop: 1 }}>{start} → {end}</Text>
            <Text style={{ color: C.accent, fontWeight: "900", fontSize: 19, letterSpacing: -0.3 }}>{fmtVND(total)}</Text>
          </View>
          <TouchableOpacity activeOpacity={0.85} style={[styles.btn, { backgroundColor: C.accent }, shadow(C.dark, 2)]} onPress={openConfirm}>
            <Text style={{ color: C.onAccent, fontWeight: "800", fontSize: 15 }}>Đặt sân</Text>
            <Ionicons name="arrow-forward" size={16} color={C.onAccent} />
          </TouchableOpacity>
        </View>
      )}

      {/* Xác nhận */}
      <Modal visible={confirmOpen} transparent animationType="slide" onRequestClose={() => setConfirmOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalWrap}>
          <View style={[styles.modal, { backgroundColor: C.card }, shadow(C.dark, 3)]}>
            <SheetHandle C={C} />
            <Text style={[styles.title, { color: C.text, marginBottom: 6 }]}>{asOwner ? "Đặt hộ khách (chủ sân)" : "Xác nhận đặt sân"}</Text>
            <View style={[styles.summaryBox, { backgroundColor: C.accentSoft }]}>
              <Ionicons name="calendar" size={16} color={C.accent} />
              <Text style={{ color: C.text, fontWeight: "700", flex: 1, fontSize: 13 }} numberOfLines={2}>
                {venue.name} · {sel?.courtName}{"\n"}
                <Text style={{ color: C.sub, fontWeight: "600" }}>{date.split("-").reverse().join("/")} · {start} → {end}</Text>
              </Text>
            </View>
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
              {asOwner
                ? "Đơn đặt hộ được xác nhận ngay, thu tiền tại quầy."
                : usePkg
                ? "Thanh toán bằng gói — xác nhận ngay, không cần chuyển khoản."
                : "Sau khi đặt, bạn chuyển khoản qua QR và gửi bill để chủ sân duyệt. Đơn chỉ giữ chỗ 15 phút — quá hạn sẽ tự huỷ."}
            </Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity style={[styles.btn, { flex: 1, borderWidth: 1, borderColor: C.border }]} onPress={() => setConfirmOpen(false)}>
                <Text style={{ color: C.sub, fontWeight: "700" }}>Huỷ</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, { flex: 1.5, backgroundColor: C.accent, opacity: booking ? 0.6 : 1 }, shadow(C.dark, 2)]} disabled={booking} onPress={submit}>
                <Text style={{ color: C.onAccent, fontWeight: "800", fontSize: 15 }}>{booking ? "Đang đặt…" : "Xác nhận đặt"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Mua gói: QR chuyển khoản */}
      <Modal visible={!!pkgBank} transparent animationType="slide" onRequestClose={() => setPkgBank(null)}>
        <View style={styles.modalWrap}>
          <View style={[styles.modal, { backgroundColor: C.card, alignItems: "center" }, shadow(C.dark, 3)]}>
            <SheetHandle C={C} />
            <Text style={[styles.title, { color: C.text, marginBottom: 4 }]}>Mua {pkgBank?.packageName}</Text>
            <Text style={{ color: C.sub, marginBottom: 14 }}>Chuyển khoản để chủ sân kích hoạt gói</Text>
            {pkgBank?.bank?.qrUrl ? (
              <View style={[styles.qrFrame, shadow(C.dark, 2)]}>
                <Image source={{ uri: pkgBank.bank.qrUrl }} style={{ width: 200, height: 200, borderRadius: 12, backgroundColor: "#fff" }} resizeMode="contain" />
              </View>
            ) : null}
            <Text style={{ color: C.accent, fontWeight: "900", fontSize: 24, marginTop: 12, letterSpacing: -0.4 }}>{fmtVND(pkgBank?.price)}</Text>
            {pkgBank?.bank?.bankAccountNumber ? <Text style={{ color: C.text, marginTop: 4, fontWeight: "700" }}>{pkgBank.bank.bankShortName} · {pkgBank.bank.bankAccountNumber}</Text> : null}
            {pkgBank?.bank?.memo ? <Text style={{ color: C.sub, marginTop: 2 }}>Nội dung: <Text style={{ color: C.text, fontWeight: "700" }}>{pkgBank.bank.memo}</Text></Text> : null}
            <TouchableOpacity style={[styles.btn, { backgroundColor: C.accent, marginTop: 18, alignSelf: "stretch" }, shadow(C.dark, 2)]} onPress={() => { setPkgBank(null); router.push("/courts/my-packages"); }}>
              <Ionicons name="checkmark-circle" size={18} color={C.onAccent} />
              <Text style={{ color: C.onAccent, fontWeight: "800", fontSize: 15 }}>Đã chuyển khoản</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { width: "100%", height: 240 },
  coverShade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 150 },
  coverBottom: { position: "absolute", left: SP.lg, right: SP.lg, bottom: 30 },
  coverTitle: { color: "#fff", fontWeight: "900", fontSize: 24, letterSpacing: -0.5, lineHeight: 30 },
  ratingPill: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.16)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, marginTop: 8 },
  infoCard: { marginHorizontal: SP.lg, marginTop: -18, borderRadius: R.lg, borderWidth: StyleSheet.hairlineWidth, padding: SP.lg, gap: 4 },
  reviewBtn: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: SP.lg, marginTop: SP.md, paddingVertical: 12, paddingHorizontal: 14, borderRadius: R.md, borderWidth: StyleSheet.hairlineWidth },
  pkgCard: { width: 176, borderRadius: R.lg, padding: 14, overflow: "hidden" },
  pkgBuy: { marginTop: 10, paddingVertical: 8, borderRadius: 10, alignItems: "center" },
  pkgOpt: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 12, padding: 10, marginBottom: 6 },
  title: { fontSize: 20, fontWeight: "900", letterSpacing: -0.3 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
  rowIcon: { width: 28, height: 28, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  sub: { fontSize: 13.5, flex: 1 },
  desc: { fontSize: 13.5, lineHeight: 20, marginTop: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  courtCard: { borderRadius: R.lg, borderWidth: StyleSheet.hairlineWidth, padding: 14 },
  courtIcon: { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center", marginRight: 8 },
  courtName: { fontSize: 15, fontWeight: "800", flex: 1 },
  slotWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  slot: { width: "22.6%", paddingVertical: 9, borderRadius: R.sm, borderWidth: StyleSheet.hairlineWidth, alignItems: "center" },
  summaryBox: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: R.sm, marginBottom: 12 },
  qrFrame: { padding: 8, borderRadius: R.md, backgroundColor: "#fff" },
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: SP.lg,
    paddingBottom: 30,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: R.xl,
    borderTopRightRadius: R.xl,
  },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 22, paddingVertical: 14, borderRadius: R.md },
  modalWrap: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(2,6,23,0.6)" },
  modal: { padding: SP.xl, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, paddingBottom: 36 },
  input: { borderRadius: R.sm, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 10 },
});
