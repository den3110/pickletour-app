// app/events/[id].tsx — Người chơi: chi tiết sự kiện + đăng ký + vé + gửi bill
import React, { useMemo, useState } from "react";
import { View, ScrollView, TouchableOpacity, StyleSheet, Alert, Image, ActivityIndicator, RefreshControl, Linking } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Clipboard from "expo-clipboard";
import { Text } from "@/components/ui/i18nText";
import { Ionicons } from "@expo/vector-icons";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { useSelector } from "react-redux";
import { useGetEventQuery, useRegisterEventMutation, useSubmitEventProofMutation, useCancelMyEventRegMutation } from "@/slices/eventsApiSlice";
import { useUploadImageToFolderMutation } from "@/slices/uploadApiSlice";
import { prepareSupportImageForUpload } from "@/utils/supportImageUpload";
import TicketQrRN from "@/components/courts/TicketQrRN";
import { BankLogo } from "@/components/courts/BankPicker";
import { fmtVND, pal, dtLabel } from "@/utils/courtFormat";
import { Hero, Card, Chip, PrimaryButton, shadow, R, SP } from "@/components/courts/ui";

const GENDER_LABEL: any = { any: "Mọi giới tính", male: "Chỉ nam", female: "Chỉ nữ", balanced: "Cân bằng nam/nữ" };

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const C = useMemo(() => pal(!!theme.dark), [theme.dark]);
  const me = useSelector((s: any) => s.auth?.userInfo);
  const { data: ev, isLoading, isFetching, refetch } = useGetEventQuery(id, { skip: !id, pollingInterval: 20000 });
  const [register, { isLoading: registering }] = useRegisterEventMutation();
  const [upload, { isLoading: uploading }] = useUploadImageToFolderMutation();
  const [submitProof, { isLoading: submitting }] = useSubmitEventProofMutation();
  const [cancelReg] = useCancelMyEventRegMutation();
  const [localPreview, setLocalPreview] = useState("");

  if (isLoading || !ev) {
    return <View style={{ flex: 1, backgroundColor: C.bg }}><Stack.Screen options={{ title: "Sự kiện" }} /><ActivityIndicator color={C.accent} style={{ marginTop: 40 }} /></View>;
  }

  const my = ev.myRegistration;
  const st = ev.stats || {};
  const full = (st.registered || 0) >= ev.capacity;
  const cancelled = ev.status === "cancelled";
  const bank = my?.bank || {};
  const needPay = my && my.payment?.status !== "Paid" && ev.paymentMode === "online" && ev.price > 0;

  const doRegister = async () => {
    if (!me) return Alert.alert("Cần đăng nhập", "Đăng nhập để đăng ký sự kiện.", [{ text: "Để sau" }, { text: "Đăng nhập", onPress: () => router.push("/login") }]);
    try { await register({ eventId: id }).unwrap(); Alert.alert("Đã đăng ký", ev.price > 0 && ev.paymentMode === "online" ? "Vui lòng chuyển khoản và gửi bill để giữ suất." : "Hẹn gặp bạn tại sự kiện!"); }
    catch (e: any) { Alert.alert("Không đăng ký được", e?.data?.message || "Vui lòng thử lại."); }
  };

  const sendBill = async (asset: any) => {
    try {
      setLocalPreview(asset.uri);
      const file = await prepareSupportImageForUpload({ uri: asset.uri, name: asset.fileName, mime: asset.mimeType, size: asset.fileSize }, "event_bill");
      const res: any = await upload({ folder: "event-bills", file, options: { format: "webp", width: 1280, height: 1280, quality: 82 } }).unwrap();
      const url = res?.url || res?.data?.url;
      if (!url) throw new Error("Tải ảnh thất bại");
      await submitProof({ regId: my._id, imageUrl: url }).unwrap();
      Alert.alert("Đã gửi bill", "Chủ sân sẽ xác nhận suất của bạn.");
    } catch (e: any) { setLocalPreview(""); Alert.alert("Lỗi", e?.data?.message || e?.message || "Gửi bill thất bại."); }
  };
  const pickBill = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 });
    if (!r.canceled && r.assets?.[0]) sendBill(r.assets[0]);
  };
  const copy = async (v: string) => { await Clipboard.setStringAsync(String(v)); Alert.alert("Đã sao chép", v); };
  const busy = uploading || submitting;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{ title: "Sự kiện" }} />
      <ScrollView contentContainerStyle={{ padding: SP.lg, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} />}>
        <Hero C={C} colors={cancelled ? (["#1f2937", "#374151"] as [string, string]) : C.heroGrad}>
          <Text style={{ color: "#fff", fontWeight: "900", fontSize: 22, letterSpacing: -0.4 }}>{ev.title}</Text>
          <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 13.5, marginTop: 4 }}>{ev.venue?.name} · {dtLabel(ev.startAt)} → {dtLabel(ev.endAt).split(" ").slice(-1)[0]}</Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            <Chip C={C} color="#fff" label={`${st.registered || 0}/${ev.capacity} suất`} small />
            <Chip C={C} color="#fde68a" label={ev.price > 0 ? fmtVND(ev.price) : "Miễn phí"} small />
          </View>
        </Hero>

        {/* Yêu cầu tham gia */}
        <Card C={C} style={{ marginTop: SP.md }}>
          <Row C={C} icon="people-outline" label="Số suất" value={`${st.registered || 0}/${ev.capacity} (còn ${Math.max(0, ev.capacity - (st.registered || 0))})`} />
          <Row C={C} icon="male-female-outline" label="Giới tính" value={GENDER_LABEL[ev.genderPolicy] || "Mọi giới tính"} />
          {(ev.skillMin > 0 || ev.skillMax > 0) && <Row C={C} icon="trophy-outline" label="Điểm trình" value={`${ev.skillMin || 0}${ev.skillMax > 0 ? ` – ${ev.skillMax}` : "+"}`} />}
          <Row C={C} icon="location-outline" label="Địa điểm" value={[ev.venue?.address, ev.venue?.province].filter(Boolean).join(", ") || ev.venue?.name} onPress={() => router.push({ pathname: "/courts/[id]", params: { id: String(ev.venue?._id) } })} />
          {!!ev.description && <Text style={{ color: C.sub, fontSize: 13.5, lineHeight: 20, marginTop: 8 }}>{ev.description}</Text>}
        </Card>

        {/* Trạng thái đăng ký / hành động */}
        {cancelled ? (
          <Card C={C} style={{ marginTop: SP.md, alignItems: "center" }}><Text style={{ color: C.danger, fontWeight: "700" }}>Sự kiện đã bị huỷ.</Text></Card>
        ) : !my ? (
          <PrimaryButton C={C} icon="ticket" label={full ? "Đã đủ suất" : registering ? "Đang đăng ký…" : ev.price > 0 ? `Đăng ký · ${fmtVND(ev.price)}` : "Đăng ký tham gia"} disabled={full || registering} onPress={doRegister} style={{ marginTop: SP.lg }} />
        ) : (
          <Card C={C} style={{ marginTop: SP.md }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: C.text, fontWeight: "800" }}>Vé của bạn · {my.code}</Text>
              <Chip C={C} color={my.payment?.status === "Paid" ? C.success : C.warning} label={my.payment?.status === "Paid" ? "Đã thanh toán" : "Chưa thanh toán"} small />
            </View>

            {needPay && (
              <View style={{ marginTop: 12 }}>
                {bank.qrUrl ? (
                  <View style={{ alignItems: "center" }}>
                    <View style={[styles.qrFrame, shadow(C.dark, 2)]}><Image source={{ uri: bank.qrUrl }} style={{ width: 190, height: 190 }} resizeMode="contain" /></View>
                  </View>
                ) : null}
                <View style={[styles.bankBox, { backgroundColor: C.cardAlt, borderColor: C.border }]}>
                  <View style={styles.bankRow}><Text style={{ color: C.sub, fontSize: 12.5 }}>Số tiền</Text><Text style={{ color: C.accent, fontWeight: "900", fontSize: 18 }}>{fmtVND(bank.amount || ev.price)}</Text></View>
                  {!!bank.bankAccountNumber && (
                    <TouchableOpacity onPress={() => copy(bank.bankAccountNumber)} style={[styles.bankRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border }]}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>{bank.bankCode ? <BankLogo code={bank.bankCode} size={22} /> : null}<Text style={{ color: C.sub, fontSize: 12.5 }}>{bank.bankShortName || "STK"}</Text></View>
                      <Text style={{ color: C.text, fontWeight: "800" }}>{bank.bankAccountNumber} <Ionicons name="copy-outline" size={13} color={C.accent} /></Text>
                    </TouchableOpacity>
                  )}
                  {!!bank.memo && <TouchableOpacity onPress={() => copy(bank.memo)} style={[styles.bankRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border }]}><Text style={{ color: C.sub, fontSize: 12.5 }}>Nội dung</Text><Text style={{ color: C.text, fontWeight: "800", fontSize: 13 }}>{bank.memo} <Ionicons name="copy-outline" size={13} color={C.accent} /></Text></TouchableOpacity>}
                </View>
                {(localPreview || my.payment?.proofUrl) && <Image source={{ uri: localPreview || my.payment.proofUrl }} style={styles.proof} resizeMode="contain" />}
                <PrimaryButton C={C} icon="camera" label={busy ? "Đang gửi…" : my.payment?.proofUrl ? "Gửi lại bill" : "Gửi bill chuyển khoản"} disabled={busy} onPress={pickBill} style={{ marginTop: 10 }} />
              </View>
            )}

            {(my.payment?.status === "Paid" || ev.paymentMode === "onsite" || ev.price === 0) && (
              <View style={{ alignItems: "center", marginTop: 14 }}>
                <View style={[styles.qrFrame, shadow(C.dark, 2)]}><TicketQrRN token={my.ticket?.token} size={190} prefix="ptev:" /></View>
                <Text style={{ color: C.sub, fontSize: 12.5, marginTop: 8, textAlign: "center" }}>{my.ticket?.checkedInAt ? "Đã check-in." : "Đưa mã QR này cho chủ sân khi đến."}</Text>
                {ev.paymentMode === "onsite" && my.payment?.status !== "Paid" && <Text style={{ color: C.warning, fontSize: 12, marginTop: 4 }}>Thanh toán tại sân.</Text>}
              </View>
            )}

            <TouchableOpacity onPress={() => Alert.alert("Huỷ đăng ký?", "", [{ text: "Không" }, { text: "Huỷ vé", style: "destructive", onPress: () => cancelReg(my._id).unwrap().then(() => refetch()).catch((e: any) => Alert.alert("Lỗi", e?.data?.message || "Thất bại")) }])} style={{ alignSelf: "center", marginTop: 14, padding: 8 }}>
              <Text style={{ color: C.danger, fontWeight: "700" }}>Huỷ đăng ký</Text>
            </TouchableOpacity>
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

function Row({ C, icon, label, value, onPress }: any) {
  const body = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 5 }}>
      <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: C.accentSoft, alignItems: "center", justifyContent: "center" }}><Ionicons name={icon} size={14} color={C.accent} /></View>
      <Text style={{ color: C.sub, fontSize: 13, width: 82 }}>{label}</Text>
      <Text style={{ color: C.text, fontSize: 13.5, fontWeight: "600", flex: 1 }} numberOfLines={2}>{value}</Text>
      {onPress ? <Ionicons name="chevron-forward" size={15} color={C.muted} /> : null}
    </View>
  );
  return onPress ? <TouchableOpacity onPress={onPress}>{body}</TouchableOpacity> : body;
}
const styles = StyleSheet.create({
  qrFrame: { padding: 10, borderRadius: R.md, backgroundColor: "#fff" },
  bankBox: { borderRadius: R.md, borderWidth: StyleSheet.hairlineWidth, marginTop: 10, overflow: "hidden" },
  bankRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10 },
  proof: { width: "100%", height: 200, borderRadius: R.sm, marginTop: 8, backgroundColor: "#000" },
});
