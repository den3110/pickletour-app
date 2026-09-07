// app/courts/booking/[id].tsx — Chi tiết đơn: QR chuyển khoản, gửi bill, vé QR, huỷ
import React, { useMemo, useState } from "react";
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
import { fmtVND, pal, dLabel, tLabel, dtLabel, BOOKING_STATUS } from "@/utils/courtFormat";

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
        contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} />}
      >
        {/* Tóm tắt */}
        <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
          <View style={styles.rowBetween}>
            <Text style={[styles.title, { color: C.text }]} numberOfLines={1}>{b.venue?.name}</Text>
            <View style={[styles.chip, { backgroundColor: `${st.color}26` }]}>
              <Text style={{ color: st.color, fontWeight: "800", fontSize: 12 }}>{st.label}</Text>
            </View>
          </View>
          <Text style={{ color: C.sub, marginTop: 4 }}>{b.court?.name} · {b.venue?.address || b.venue?.province || ""}</Text>
          <Text style={{ color: C.text, fontWeight: "700", marginTop: 6 }}>
            {dLabel(b.startAt)} · {tLabel(b.startAt)} → {tLabel(b.endAt)}
          </Text>
          <Text style={{ color: C.accent, fontWeight: "900", fontSize: 20, marginTop: 4 }}>{fmtVND(b.totalPrice)}</Text>
          {b.ticket?.checkedInAt && (
            <Text style={{ color: "#22c55e", fontWeight: "700", marginTop: 6 }}>✓ Đã check-in {dtLabel(b.ticket.checkedInAt)}</Text>
          )}
        </View>

        {/* Thanh toán + bill */}
        {needPay && (
          <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={[styles.section, { color: C.text }]}>
              {b.status === "awaiting_approval" ? "Bill đã gửi — chờ chủ sân duyệt" : "Thanh toán qua QR"}
            </Text>
            {rejected && (
              <View style={[styles.alert, { backgroundColor: "rgba(239,68,68,0.12)" }]}>
                <Text style={{ color: "#ef4444", fontWeight: "700" }}>Bill bị từ chối: {b.payment.rejectReason}</Text>
                <Text style={{ color: "#ef4444", fontSize: 12 }}>Vui lòng kiểm tra và gửi lại bill.</Text>
              </View>
            )}
            {b.status === "pending" && !rejected && (
              <Text style={{ color: C.sub, fontSize: 12, marginBottom: 10 }}>
                Chuyển khoản đúng số tiền &amp; nội dung, rồi chụp bill gửi lên. Đơn giữ chỗ trong 30 phút.
              </Text>
            )}

            {bank.qrUrl ? (
              <View style={{ alignItems: "center", marginVertical: 6 }}>
                <Image source={{ uri: bank.qrUrl }} style={styles.qr} resizeMode="contain" />
              </View>
            ) : (
              <Text style={{ color: "#f59e0b", marginBottom: 8 }}>Sân chưa cấu hình tài khoản nhận tiền — liên hệ chủ sân.</Text>
            )}
            <View style={[styles.bankBox, { backgroundColor: C.field }]}>
              <Text style={{ color: C.sub, fontSize: 12 }}>Số tiền</Text>
              <Text style={{ color: C.accent, fontWeight: "900", fontSize: 22 }}>{fmtVND(bank.amount || b.totalPrice)}</Text>
              {!!bank.bankAccountNumber && (
                <TouchableOpacity onPress={() => copy(bank.bankAccountNumber, "Số tài khoản")} style={styles.rowBetween}>
                  <Text style={{ color: C.text, marginTop: 6 }}>
                    {bank.bankShortName} · <Text style={{ fontWeight: "800" }}>{bank.bankAccountNumber}</Text>
                  </Text>
                  <Ionicons name="copy-outline" size={16} color={C.sub} />
                </TouchableOpacity>
              )}
              {!!bank.bankAccountName && <Text style={{ color: C.sub, fontSize: 13 }}>{bank.bankAccountName}</Text>}
              {!!bank.memo && (
                <TouchableOpacity onPress={() => copy(bank.memo, "Nội dung chuyển khoản")} style={styles.rowBetween}>
                  <Text style={{ color: C.text, marginTop: 4 }}>Nội dung: <Text style={{ fontWeight: "800" }}>{bank.memo}</Text></Text>
                  <Ionicons name="copy-outline" size={16} color={C.sub} />
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
              <TouchableOpacity style={[styles.btn, { flex: 1, backgroundColor: C.accent, opacity: busy ? 0.6 : 1 }]} disabled={busy} onPress={pickFromCamera}>
                <Ionicons name="camera" size={18} color="#0a0e1a" />
                <Text style={styles.btnText}>{busy ? "Đang gửi…" : "Chụp bill"}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, { flex: 1, borderWidth: 1, borderColor: C.accent, opacity: busy ? 0.6 : 1 }]} disabled={busy} onPress={pickFromLibrary}>
                <Ionicons name="images" size={18} color={C.accent} />
                <Text style={[styles.btnText, { color: C.accent }]}>Chọn ảnh</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Vé QR */}
        {b.status === "confirmed" && (
          <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border, alignItems: "center" }]}>
            <Text style={[styles.section, { color: C.text }]}>Vé vào sân</Text>
            <TicketQrRN token={b.ticket?.token} size={230} />
            <Text style={{ color: C.sub, fontSize: 12, marginTop: 10, textAlign: "center" }}>
              {b.ticket?.checkedInAt ? "Vé đã được sử dụng." : "Đưa mã QR này cho chủ sân quét khi đến sân."}
            </Text>
            <TouchableOpacity style={[styles.btn, { backgroundColor: "#6366f1", alignSelf: "stretch", marginTop: 14, opacity: creatingInvite ? 0.6 : 1 }]} disabled={creatingInvite} onPress={openPlay}>
              <Ionicons name="people" size={18} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "800" }}>Mở kèo tìm người chơi</Text>
            </TouchableOpacity>
          </View>
        )}

        {b.status === "cancelled" && (
          <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={{ color: C.sub }}>Đã huỷ{b.cancelReason ? ` · ${b.cancelReason}` : ""}.</Text>
            <TouchableOpacity onPress={() => router.replace({ pathname: "/courts/[id]", params: { id: String(b.venue?._id) } })} style={{ marginTop: 8 }}>
              <Text style={{ color: C.accent, fontWeight: "700" }}>Đặt lại sân này →</Text>
            </TouchableOpacity>
          </View>
        )}

        {canCancel && (
          <TouchableOpacity onPress={cancel} disabled={cancelling} style={{ alignSelf: "center", marginTop: 6, padding: 10 }}>
            <Text style={{ color: "#ef4444", fontWeight: "700" }}>Huỷ lượt đặt</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 12 },
  title: { fontSize: 17, fontWeight: "900", flex: 1, marginRight: 8 },
  section: { fontSize: 15, fontWeight: "800", marginBottom: 8 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  alert: { padding: 10, borderRadius: 10, marginBottom: 10 },
  qr: { width: 210, height: 210, borderRadius: 12, backgroundColor: "#fff" },
  bankBox: { borderRadius: 12, padding: 12, marginVertical: 10 },
  proof: { width: "100%", height: 220, borderRadius: 10, marginBottom: 8, backgroundColor: "#000" },
  input: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 10 },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 12 },
  btnText: { color: "#0a0e1a", fontWeight: "800" },
});
