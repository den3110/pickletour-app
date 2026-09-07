// app/courts/booking/[id].tsx — Chi tiết đơn: QR chuyển khoản, gửi bill, vé QR, huỷ
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
  RefreshControl,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Clipboard from "expo-clipboard";
import { Text } from "@/components/ui/i18nText";
import { Ionicons } from "@expo/vector-icons";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useTheme } from "@react-navigation/native";
import {
  useGetBookingQuery,
  useSubmitPaymentProofMutation,
  useUpdateBookingStatusMutation,
} from "@/slices/bookingsApiSlice";
import { useCreateInviteMutation } from "@/slices/playApiSlice";
import { useUploadImageToFolderMutation } from "@/slices/uploadApiSlice";
import { prepareSupportImageForUpload } from "@/utils/supportImageUpload";
import TicketQrRN from "@/components/courts/TicketQrRN";
import { BankLogo } from "@/components/courts/BankPicker";
import { fmtVND, pal, dLabel, tLabel, dtLabel, BOOKING_STATUS } from "@/utils/courtFormat";
import { Hero, Chip, shadow, R, SP } from "@/components/courts/ui";

export default function BookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const C = useMemo(() => pal(!!theme.dark), [theme.dark]);

  const { data: b, isLoading, isFetching, refetch } = useGetBookingQuery(id, {
    skip: !id,
    pollingInterval: 15000, // cập nhật khi chủ sân duyệt
  });
  const [upload, { isLoading: uploading }] = useUploadImageToFolderMutation();
  const [submitProof, { isLoading: submitting }] = useSubmitPaymentProofMutation();
  const [updateStatus, { isLoading: cancelling }] = useUpdateBookingStatusMutation();
  const [createInvite, { isLoading: creatingInvite }] = useCreateInviteMutation();
  const [note, setNote] = useState("");
  const [localPreview, setLocalPreview] = useState("");
  // Đếm ngược giữ chỗ (đơn pending)
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!b?.holdExpiresAt || b.status !== "pending") return;
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, [b?.holdExpiresAt, b?.status]);
  const holdLeftMin = b?.holdExpiresAt ? Math.max(0, Math.ceil((new Date(b.holdExpiresAt).getTime() - now) / 60000)) : null;

  const openPlay = async () => {
    try {
      const inv: any = await createInvite({
        title: `Tìm người chơi tại ${b?.venue?.name || "sân"}`,
        province: b?.venue?.province || "",
        courtName: `${b?.venue?.name || ""}${b?.court?.name ? ` · ${b.court.name}` : ""}`,
        playAt: b?.startAt,
        durationMin: b?.durationMin || 60,
        slots: 2,
        venue: b?.venue?._id,
        booking: b?._id,
      }).unwrap();
      Alert.alert("Đã mở kèo", "Kèo tìm người chơi đã được đăng.", [
        { text: "Xem kèo", onPress: () => router.push({ pathname: "/play/[id]", params: { id: String(inv?._id || inv?.id) } }) },
        { text: "OK" },
      ]);
    } catch (e: any) {
      Alert.alert("Lỗi", e?.data?.message || "Không mở được kèo.");
    }
  };

  const st = BOOKING_STATUS[b?.status] || BOOKING_STATUS.pending;
  const needPay = ["pending", "awaiting_approval"].includes(b?.status);
  const rejected = b?.status === "pending" && !!b?.payment?.rejectReason;
  const canCancel = ["pending", "awaiting_approval", "confirmed"].includes(b?.status);
  const bank = b?.bank || {};
  const busy = uploading || submitting;

  const sendBill = async (asset: { uri: string; fileName?: string; mimeType?: string; fileSize?: number }) => {
    try {
      setLocalPreview(asset.uri);
      const file = await prepareSupportImageForUpload(
        { uri: asset.uri, name: asset.fileName, mime: asset.mimeType, size: asset.fileSize },
        "booking_bill",
      );
      const res: any = await upload({
        folder: "booking-bills",
        file,
        options: { format: "webp", width: 1280, height: 1280, quality: 82 },
      }).unwrap();
      const url = res?.url || res?.data?.url;
      if (!url) throw new Error("Tải ảnh thất bại");
      await submitProof({ id, imageUrl: url, note: note.trim() }).unwrap();
      Alert.alert("Đã gửi bill", "Chủ sân sẽ duyệt và bạn nhận vé QR ngay khi được xác nhận.");
    } catch (e: any) {
      setLocalPreview("");
      Alert.alert("Gửi bill thất bại", e?.data?.message || e?.message || "Vui lòng thử lại.");
    }
  };

  const pickFromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return Alert.alert("Cần quyền camera", "Cho phép camera để chụp bill.");
    const r = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (!r.canceled && r.assets?.[0]) sendBill(r.assets[0] as any);
  };
  const pickFromLibrary = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (!r.canceled && r.assets?.[0]) sendBill(r.assets[0] as any);
  };

  const cancel = () =>
    Alert.alert("Huỷ lượt đặt", "Bạn chắc chắn muốn huỷ?", [
      { text: "Không", style: "cancel" },
      {
        text: "Huỷ đơn",
        style: "destructive",
        onPress: async () => {
          try {
            await updateStatus({ id, status: "cancelled", venueId: b?.venue?._id }).unwrap();
          } catch (e: any) {
            Alert.alert("Lỗi", e?.data?.message || "Không huỷ được.");
          }
        },
      },
    ]);

  const copy = async (v: string, label: string) => {
    await Clipboard.setStringAsync(String(v));
    Alert.alert("Đã sao chép", label);
  };

  if (isLoading || !b) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Stack.Screen options={{ title: "Lượt đặt" }} />
        <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{ title: `#${b.code}` }} />
      <ScrollView
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: SP.lg, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} />}
      >
        {/* Tóm tắt */}
        <Hero C={C} colors={b.status === "confirmed" ? (["#0f172a", "#14532d"] as [string, string]) : b.status === "cancelled" ? (["#1f2937", "#374151"] as [string, string]) : C.heroGrad} style={{ marginBottom: SP.md }}>
          <View style={styles.rowBetween}>
            <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: "700", letterSpacing: 0.8 }}>#{b.code}</Text>
            <View style={{ backgroundColor: "rgba(255,255,255,0.16)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, flexDirection: "row", alignItems: "center", gap: 5 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: st.color }} />
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>{st.label}</Text>
            </View>
          </View>
          <Text style={styles.title} numberOfLines={2}>{b.venue?.name}</Text>
          <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, marginTop: 2 }} numberOfLines={1}>{b.court?.name} · {b.venue?.address || b.venue?.province || ""}</Text>
          <View style={styles.heroRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroLabel}>Thời gian</Text>
              <Text style={styles.heroVal}>{dLabel(b.startAt)}</Text>
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13, marginTop: 1 }}>{tLabel(b.startAt)} → {tLabel(b.endAt)}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.heroLabel}>Tổng tiền</Text>
              <Text style={[styles.heroVal, { fontSize: 22 }]}>{fmtVND(b.totalPrice)}</Text>
              <Text style={{ color: b.payment?.status === "Paid" ? "#86efac" : "#fde68a", fontSize: 12, fontWeight: "700", marginTop: 1 }}>
                {b.payment?.status === "Paid" ? "Đã thanh toán" : "Chưa thanh toán"}
              </Text>
            </View>
          </View>
          {b.ticket?.checkedInAt && (
            <View style={styles.checkedPill}>
              <Ionicons name="checkmark-circle" size={15} color="#86efac" />
              <Text style={{ color: "#86efac", fontWeight: "700", fontSize: 12.5 }}>Đã check-in {dtLabel(b.ticket.checkedInAt)}</Text>
            </View>
          )}
        </Hero>

        {/* Thanh toán + bill */}
        {needPay && (
          <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }, shadow(C.dark, 1)]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <View style={[styles.secIcon, { backgroundColor: b.status === "awaiting_approval" ? "rgba(56,189,248,0.16)" : C.accentSoft }]}>
                <Ionicons name={b.status === "awaiting_approval" ? "hourglass" : "qr-code"} size={16} color={b.status === "awaiting_approval" ? C.info : C.accent} />
              </View>
              <Text style={[styles.section, { color: C.text }]}>
                {b.status === "awaiting_approval" ? "Bill đã gửi — chờ chủ sân duyệt" : "Thanh toán qua QR"}
              </Text>
            </View>
            {rejected && (
              <View style={[styles.alert, { backgroundColor: "rgba(239,68,68,0.12)" }]}>
                <Text style={{ color: "#ef4444", fontWeight: "700" }}>Bill bị từ chối: {b.payment.rejectReason}</Text>
                <Text style={{ color: "#ef4444", fontSize: 12 }}>Vui lòng kiểm tra và gửi lại bill.</Text>
              </View>
            )}
            {b.status === "pending" && holdLeftMin !== null && (
              <View style={[styles.alert, { backgroundColor: holdLeftMin <= 3 ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.12)", flexDirection: "row", alignItems: "center", gap: 8 }]}>
                <Ionicons name="timer-outline" size={16} color={holdLeftMin <= 3 ? C.danger : C.warning} />
                <Text style={{ color: holdLeftMin <= 3 ? C.danger : C.warning, fontWeight: "700", fontSize: 13, flex: 1 }}>
                  {holdLeftMin > 0 ? `Giữ chỗ đến ${tLabel(b.holdExpiresAt)} · còn ${holdLeftMin} phút` : "Hết hạn giữ chỗ — đơn sẽ tự huỷ"}
                </Text>
              </View>
            )}
            {b.status === "pending" && !rejected && (
              <Text style={{ color: C.sub, fontSize: 12, marginBottom: 10 }}>
                Chuyển khoản đúng số tiền &amp; nội dung, rồi chụp bill gửi lên trong {b.holdMinutes || 15} phút, quá hạn đơn tự huỷ.
              </Text>
            )}

            {bank.qrUrl ? (
              <View style={{ alignItems: "center", marginVertical: 8 }}>
                <View style={[styles.qrFrame, shadow(C.dark, 2)]}>
                  <Image source={{ uri: bank.qrUrl }} style={styles.qr} resizeMode="contain" />
                </View>
                <Text style={{ color: C.muted, fontSize: 11.5, marginTop: 8 }}>Quét bằng app ngân hàng — số tiền & nội dung đã điền sẵn</Text>
              </View>
            ) : (
              <View style={[styles.alert, { backgroundColor: "rgba(245,158,11,0.12)" }]}>
                <Text style={{ color: "#f59e0b", fontWeight: "700" }}>Sân chưa cấu hình tài khoản nhận tiền — liên hệ chủ sân.</Text>
              </View>
            )}
            <View style={[styles.bankBox, { backgroundColor: C.cardAlt, borderColor: C.border }]}>
              <View style={styles.bankRow}>
                <Text style={{ color: C.sub, fontSize: 12.5 }}>Số tiền</Text>
                <Text style={{ color: C.accent, fontWeight: "900", fontSize: 20, letterSpacing: -0.3 }}>{fmtVND(bank.amount || b.totalPrice)}</Text>
              </View>
              {!!bank.bankAccountNumber && (
                <TouchableOpacity onPress={() => copy(bank.bankAccountNumber, "Số tài khoản")} style={[styles.bankRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    {bank.bankCode ? <BankLogo code={bank.bankCode} size={22} /> : null}
                    <Text style={{ color: C.sub, fontSize: 12.5 }}>{bank.bankShortName || "STK"}</Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={{ color: C.text, fontWeight: "800", fontSize: 15 }}>{bank.bankAccountNumber}</Text>
                    <Ionicons name="copy-outline" size={15} color={C.accent} />
                  </View>
                </TouchableOpacity>
              )}
              {!!bank.bankAccountName && (
                <View style={[styles.bankRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border }]}>
                  <Text style={{ color: C.sub, fontSize: 12.5 }}>Chủ TK</Text>
                  <Text style={{ color: C.text, fontWeight: "700", fontSize: 13 }}>{bank.bankAccountName}</Text>
                </View>
              )}
              {!!bank.memo && (
                <TouchableOpacity onPress={() => copy(bank.memo, "Nội dung chuyển khoản")} style={[styles.bankRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border }]}>
                  <Text style={{ color: C.sub, fontSize: 12.5 }}>Nội dung</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={{ color: C.text, fontWeight: "800", fontSize: 13 }}>{bank.memo}</Text>
                    <Ionicons name="copy-outline" size={15} color={C.accent} />
                  </View>
                </TouchableOpacity>
              )}
            </View>

            {(localPreview || b.payment?.proofUrl) && (
              <Image source={{ uri: localPreview || b.payment.proofUrl }} style={styles.proof} resizeMode="contain" />
            )}
            {b.status === "awaiting_approval" && !localPreview && (
              <Text style={{ color: C.sub, fontSize: 12, textAlign: "center", marginBottom: 8 }}>
                Gửi lúc {dtLabel(b.payment?.proofAt)} · có thể gửi lại ảnh khác
              </Text>
            )}
            <TextInput
              style={[styles.input, { backgroundColor: C.field, color: C.text }]}
              placeholder="Ghi chú cho chủ sân (tuỳ chọn)"
              placeholderTextColor={C.sub}
              value={note}
              onChangeText={(t) => setNote(t.slice(0, 300))}
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity activeOpacity={0.85} style={[styles.btn, { flex: 1.3, backgroundColor: C.accent, opacity: busy ? 0.6 : 1 }, shadow(C.dark, 2)]} disabled={busy} onPress={pickFromCamera}>
                <Ionicons name="camera" size={18} color={C.onAccent} />
                <Text style={[styles.btnText, { color: C.onAccent }]}>{busy ? "Đang gửi…" : "Chụp bill"}</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.85} style={[styles.btn, { flex: 1, borderWidth: 1, borderColor: C.border, opacity: busy ? 0.6 : 1 }]} disabled={busy} onPress={pickFromLibrary}>
                <Ionicons name="images-outline" size={18} color={C.text} />
                <Text style={[styles.btnText, { color: C.text }]}>Chọn ảnh</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Vé QR */}
        {b.status === "confirmed" && (
          <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border, alignItems: "center" }, shadow(C.dark, 2)]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "stretch", marginBottom: 12 }}>
              <View style={[styles.secIcon, { backgroundColor: "rgba(34,197,94,0.16)" }]}><Ionicons name="ticket" size={16} color={C.success} /></View>
              <Text style={[styles.section, { color: C.text }]}>Vé vào sân</Text>
              <Chip C={C} color={C.success} label="Hợp lệ" small style={{ marginLeft: "auto" }} />
            </View>
            <View style={[styles.qrFrame, shadow(C.dark, 2)]}>
              <TicketQrRN token={b.ticket?.token} size={220} />
            </View>
            <Text style={{ color: C.text, fontWeight: "800", fontSize: 16, marginTop: 12, letterSpacing: 1 }}>#{b.code}</Text>
            <Text style={{ color: C.sub, fontSize: 12.5, marginTop: 4, textAlign: "center", lineHeight: 18 }}>
              {b.ticket?.checkedInAt ? "Vé đã được sử dụng." : "Đưa mã QR này cho chủ sân quét khi đến sân."}
            </Text>
            <TouchableOpacity activeOpacity={0.85} style={[styles.btn, { backgroundColor: "#6366f1", alignSelf: "stretch", marginTop: 16, opacity: creatingInvite ? 0.6 : 1 }, shadow(C.dark, 2)]} disabled={creatingInvite} onPress={openPlay}>
              <Ionicons name="people" size={18} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Mở kèo tìm người chơi</Text>
            </TouchableOpacity>
          </View>
        )}

        {b.status === "cancelled" && (
          <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border, flexDirection: "row", alignItems: "center", gap: 12 }]}>
            <View style={[styles.secIcon, { backgroundColor: C.field }]}><Ionicons name="close-circle" size={18} color={C.muted} /></View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontWeight: "700" }}>Lượt đặt đã huỷ</Text>
              {!!b.cancelReason && <Text style={{ color: C.sub, fontSize: 12.5, marginTop: 2 }}>{b.cancelReason}</Text>}
            </View>
            <TouchableOpacity onPress={() => router.replace({ pathname: "/courts/[id]", params: { id: String(b.venue?._id) } })}>
              <Text style={{ color: C.accent, fontWeight: "800", fontSize: 13 }}>Đặt lại →</Text>
            </TouchableOpacity>
          </View>
        )}

        {canCancel && (
          <TouchableOpacity onPress={cancel} disabled={cancelling} style={{ alignSelf: "center", marginTop: 8, paddingVertical: 10, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="trash-outline" size={15} color={C.danger} />
            <Text style={{ color: C.danger, fontWeight: "700" }}>Huỷ lượt đặt</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: R.lg, borderWidth: StyleSheet.hairlineWidth, padding: SP.lg, marginBottom: SP.md },
  title: { color: "#fff", fontSize: 21, fontWeight: "900", letterSpacing: -0.4, marginTop: 10 },
  heroRow: { flexDirection: "row", alignItems: "flex-end", marginTop: 16, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.22)" },
  heroLabel: { color: "rgba(255,255,255,0.65)", fontSize: 11, fontWeight: "600", letterSpacing: 0.5, marginBottom: 3 },
  heroVal: { color: "#fff", fontWeight: "900", fontSize: 16, letterSpacing: -0.3 },
  checkedPill: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: "rgba(34,197,94,0.18)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, marginTop: 12 },
  section: { fontSize: 15, fontWeight: "800" },
  secIcon: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  alert: { padding: 12, borderRadius: R.sm, marginBottom: 10 },
  qrFrame: { padding: 10, borderRadius: R.md, backgroundColor: "#fff" },
  qr: { width: 200, height: 200, borderRadius: 8, backgroundColor: "#fff" },
  bankBox: { borderRadius: R.md, borderWidth: StyleSheet.hairlineWidth, marginVertical: 10, overflow: "hidden" },
  bankRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10 },
  proof: { width: "100%", height: 220, borderRadius: R.sm, marginBottom: 8, backgroundColor: "#000" },
  input: { borderRadius: R.sm, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, marginBottom: 10 },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 13, borderRadius: R.md },
  btnText: { fontWeight: "800", fontSize: 15 },
});
