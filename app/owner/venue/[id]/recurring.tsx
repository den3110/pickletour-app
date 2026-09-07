// app/owner/venue/[id]/recurring.tsx — Lịch cố định cho CLB/khách quen (nhiều thứ/tuần, theo tháng, tự set giá)
import React, { useMemo, useState } from "react";
import PtInput from "@/components/ui/PtInput";
import { View, ScrollView, TextInput, TouchableOpacity, StyleSheet, Alert, Switch, KeyboardAvoidingView, Platform, ActivityIndicator, Modal } from "react-native";
import { Text } from "@/components/ui/i18nText";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { useGetVenueQuery } from "@/slices/venuesApiSlice";
import { useCreateRecurringMutation, useListRecurringQuery, useCancelRecurringMutation, useUpdateRecurringMutation } from "@/slices/venueOwnerApiSlice";
import { pal, fmtVND, toDateInput, addDays, WEEKDAYS_SHORT } from "@/utils/courtFormat";
import { Card, Chip, SectionHeader, Empty, PrimaryButton, SheetHandle, shadow, R, SP } from "@/components/courts/ui";

const tHHMM = (iso: string) => new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
const dDMY = (iso: string) => new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", timeZone: "Asia/Bangkok" });

export default function RecurringScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const C = useMemo(() => pal(!!theme.dark), [theme.dark]);
  const { data: venue } = useGetVenueQuery(id, { skip: !id });
  const [create, { isLoading }] = useCreateRecurringMutation();
  const [cancel] = useCancelRecurringMutation();
  const { data: groups, isLoading: loadingGroups } = useListRecurringQuery(id, { skip: !id });
  const [editGroup, setEditGroup] = useState<any>(null);
  const courts = venue?.courts || [];

  const [courtId, setCourtId] = useState<string | null>(null);
  const [dow, setDow] = useState<number[]>([1]); // thứ 2 mặc định
  const [start, setStart] = useState("17:00");
  const [end, setEnd] = useState("19:00");
  const [dateFrom, setDateFrom] = useState(toDateInput());
  const [rangeMode, setRangeMode] = useState<"weeks" | "months" | "dateTo">("months");
  const [rangeVal, setRangeVal] = useState("2"); // 2 tháng
  const [dateTo, setDateTo] = useState(addDays(toDateInput(), 60));
  const [priceMode, setPriceMode] = useState<"auto" | "custom" | "total">("total");
  const [price, setPrice] = useState("");
  const [packageTotal, setPackageTotal] = useState("");
  const [markPaid, setMarkPaid] = useState(true);
  const [payMethod, setPayMethod] = useState<"cash" | "transfer">("cash");
  const [autoRenew, setAutoRenew] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<any>(null);

  const toggleDow = (d: number) => setDow((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d].sort()));

  const submit = async () => {
    if (!courtId) return Alert.alert("Chọn sân");
    if (!dow.length) return Alert.alert("Chọn thứ", "Chọn ít nhất 1 thứ trong tuần.");
    if (priceMode === "custom" && !(Number(price) > 0)) return Alert.alert("Nhập giá", "Nhập giá mỗi buổi khi tự set giá.");
    if (priceMode === "total" && !(Number(packageTotal) > 0)) return Alert.alert("Nhập giá", "Nhập tổng giá trọn gói cả kỳ.");
    const body: any = {
      venueId: id, courtId, daysOfWeek: dow, start, end, dateFrom,
      priceMode, pricePerSession: Number(price) || 0, totalPackagePrice: Number(packageTotal) || 0,
      markPaid, paymentMethod: payMethod, autoRenew,
      customerName: name.trim(), customerPhone: phone.trim(),
    };
    if (rangeMode === "weeks") body.weeks = Number(rangeVal) || 4;
    else if (rangeMode === "months") body.months = Number(rangeVal) || 1;
    else body.dateTo = dateTo;
    try {
      const r: any = await create(body).unwrap();
      setResult(r);
    } catch (e: any) {
      Alert.alert("Lỗi", e?.data?.message || "Không tạo được lịch.");
    }
  };

  const runCancel = (g: any, opts: any, okMsg: string) =>
    cancel({ venueId: id, group: g.group, ...opts }).unwrap()
      .then(() => Alert.alert("Đã xong", okMsg))
      .catch((e: any) => Alert.alert("Lỗi", e?.data?.message || "Thất bại"));

  const doCancel = (g: any) =>
    Alert.alert("Xoá / huỷ lịch cố định", `"${g.customerName || "Lịch này"}" — ${g.upcoming} buổi sắp tới, ${g.total} buổi tổng.`, [
      { text: "Đóng", style: "cancel" },
      { text: "Huỷ buổi sắp tới", onPress: () => runCancel(g, {}, "Đã huỷ các buổi sắp tới.") },
      { text: "Xoá hẳn cả lịch", style: "destructive", onPress: () =>
        Alert.alert("Xoá hẳn?", "Xoá toàn bộ buổi của lịch này khỏi hệ thống (không khôi phục được). Dùng khi cài nhầm.", [
          { text: "Không" },
          { text: "Xoá hẳn", style: "destructive", onPress: () => runCancel(g, { scope: "all", hard: true }, "Đã xoá hẳn cả lịch.") },
        ]) },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{ title: "Lịch cố định" }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
        <ScrollView contentContainerStyle={{ padding: SP.lg, paddingBottom: 48 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
          <Card C={C}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <View style={[styles.icon, { backgroundColor: C.accentSoft }]}><Ionicons name="repeat" size={18} color={C.accent} /></View>
              <Text style={{ color: C.text, fontWeight: "800", fontSize: 15, flex: 1 }}>Tạo lịch cố định cho CLB / khách quen</Text>
            </View>

            <Label C={C}>Sân</Label>
            <View style={styles.wrap}>
              {courts.map((c: any) => (
                <TouchableOpacity key={c._id} onPress={() => setCourtId(c._id)} style={[styles.chip, { backgroundColor: courtId === c._id ? C.accent : C.field }]}>
                  <Text style={{ color: courtId === c._id ? C.onAccent : C.text, fontWeight: "700", fontSize: 12 }}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Label C={C}>Các thứ trong tuần</Label>
            <View style={styles.wrap}>
              {WEEKDAYS_SHORT.map((w, i) => {
                const on = dow.includes(i);
                return (
                  <TouchableOpacity key={i} onPress={() => toggleDow(i)} style={[styles.wd, { backgroundColor: on ? C.accent : C.field }]}>
                    <Text style={{ color: on ? C.onAccent : C.text, fontWeight: "700", fontSize: 12 }}>{w}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <Field C={C} label="Từ giờ" v={start} set={setStart} ph="17:00" />
              <Field C={C} label="Đến giờ" v={end} set={setEnd} ph="19:00" />
            </View>

            <Label C={C}>Bắt đầu từ</Label>
            <PtInput style={[styles.input, { backgroundColor: C.field, color: C.text }]} value={dateFrom} onChangeText={setDateFrom} placeholder="YYYY-MM-DD" placeholderTextColor={C.muted} />

            <Label C={C}>Kéo dài</Label>
            <View style={styles.seg}>
              {([["weeks", "Số tuần"], ["months", "Số tháng"], ["dateTo", "Đến ngày"]] as const).map(([k, lbl]) => (
                <TouchableOpacity key={k} onPress={() => setRangeMode(k)} style={[styles.segItem, { backgroundColor: rangeMode === k ? C.accent : C.field }]}>
                  <Text style={{ color: rangeMode === k ? C.onAccent : C.text, fontWeight: "700", fontSize: 12.5 }}>{lbl}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {rangeMode === "dateTo" ? (
              <PtInput style={[styles.input, { backgroundColor: C.field, color: C.text }]} value={dateTo} onChangeText={setDateTo} placeholder="YYYY-MM-DD" placeholderTextColor={C.muted} />
            ) : (
              <PtInput style={[styles.input, { backgroundColor: C.field, color: C.text }]} value={rangeVal} onChangeText={setRangeVal} keyboardType="numeric" placeholder={rangeMode === "weeks" ? "Số tuần (vd 8)" : "Số tháng (vd 2)"} placeholderTextColor={C.muted} />
            )}

            <Label C={C}>Cách tính giá</Label>
            <View style={styles.seg}>
              {([["total", "Trọn gói cả kỳ"], ["custom", "Theo buổi"], ["auto", "Bảng giá"]] as const).map(([k, lbl]) => (
                <TouchableOpacity key={k} onPress={() => setPriceMode(k)} style={[styles.segItem, { backgroundColor: priceMode === k ? C.accent : C.field }]}>
                  <Text style={{ color: priceMode === k ? C.onAccent : C.text, fontWeight: "700", fontSize: 12 }}>{lbl}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {priceMode === "total" && (
              <>
                <PtInput style={[styles.input, { backgroundColor: C.field, color: C.text }]} value={packageTotal} onChangeText={setPackageTotal} keyboardType="numeric" placeholder="Tổng giá cả kỳ (đ) — vd 10000000" placeholderTextColor={C.muted} />
                <Text style={{ color: C.sub, fontSize: 12, marginBottom: 8 }}>Tổng tiền cho toàn bộ lịch (VD gói tháng của CLB). Hệ thống chia đều cho các buổi để tính doanh thu.</Text>
              </>
            )}
            {priceMode === "custom" && (
              <PtInput style={[styles.input, { backgroundColor: C.field, color: C.text }]} value={price} onChangeText={setPrice} keyboardType="numeric" placeholder="Giá 1 buổi (đ) — vd 300000" placeholderTextColor={C.muted} />
            )}

            <View style={styles.paidRow}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontWeight: "700" }}>Đã thu tiền</Text>
                <Text style={{ color: C.sub, fontSize: 12 }}>Tính vào doanh thu ngay (CLB trả trước)</Text>
              </View>
              <Switch value={markPaid} onValueChange={setMarkPaid} trackColor={{ true: C.accent, false: "#94a3b8" }} thumbColor="#fff" />
            </View>
            {markPaid && (
              <View style={[styles.seg, { marginTop: 0 }]}>
                {([["cash", "Tiền mặt"], ["transfer", "Chuyển khoản"]] as const).map(([k, lbl]) => (
                  <TouchableOpacity key={k} onPress={() => setPayMethod(k)} style={[styles.segItem, { backgroundColor: payMethod === k ? C.accent : C.field }]}>
                    <Text style={{ color: payMethod === k ? C.onAccent : C.text, fontWeight: "700", fontSize: 12.5 }}>{lbl}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Field C={C} label="Tên CLB / khách" v={name} set={setName} ph="VD: CLB Pickleball ABC" />
            <Field C={C} label="Số điện thoại" v={phone} set={setPhone} kb="phone-pad" ph="SĐT liên hệ" />

            <View style={styles.paidRow}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontWeight: "700" }}>Tự động gia hạn hàng tháng</Text>
                <Text style={{ color: C.sub, fontSize: 12 }}>Hệ thống tự tạo tiếp lịch khi sắp hết, đến khi bạn bấm "Kết thúc".</Text>
              </View>
              <Switch value={autoRenew} onValueChange={setAutoRenew} trackColor={{ true: C.accent, false: "#94a3b8" }} thumbColor="#fff" />
            </View>

            <PrimaryButton C={C} icon="calendar" label={isLoading ? "Đang tạo…" : "Tạo lịch cố định"} disabled={isLoading} onPress={submit} style={{ marginTop: 8 }} />
          </Card>

          {result && (
            <Card C={C} style={{ marginTop: SP.md, borderColor: C.success, borderWidth: 1 }}>
              <Text style={{ color: C.success, fontWeight: "800", marginBottom: 6 }}>✓ Đã tạo {result.createdCount} buổi</Text>
              <View style={{ flexDirection: "row", gap: 16, marginBottom: 6, flexWrap: "wrap" }}>
                <Text style={{ color: C.sub, fontSize: 13 }}>Tổng giá trị: <Text style={{ color: C.text, fontWeight: "800" }}>{fmtVND(result.grossTotal)}</Text></Text>
                {result.paidRevenue > 0 && <Text style={{ color: C.sub, fontSize: 13 }}>Đã thu: <Text style={{ color: C.success, fontWeight: "800" }}>{fmtVND(result.paidRevenue)}</Text></Text>}
              </View>
              {result.skippedCount > 0 && (
                <Text style={{ color: C.warning, fontSize: 12.5 }}>Bỏ qua {result.skippedCount} buổi (trùng lịch / khoá / đã qua).</Text>
              )}
            </Card>
          )}

          {/* Danh sách lịch cố định hiện có */}
          <SectionHeader C={C} title="Lịch cố định đang chạy" />
          {loadingGroups ? (
            <ActivityIndicator color={C.accent} />
          ) : !groups?.length ? (
            <Card C={C} pad={0}><Empty C={C} icon="repeat-outline" title="Chưa có lịch cố định" subtitle="Tạo lịch cho CLB thuê sân dài hạn ở trên." /></Card>
          ) : (
            groups.map((g: any) => (
              <Card key={g.group} C={C} style={{ marginBottom: SP.md }}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: C.text, fontWeight: "800" }} numberOfLines={1}>{g.customerName || "Lịch cố định"}</Text>
                    <Text style={{ color: C.sub, fontSize: 12.5, marginTop: 2 }}>
                      {g.courtName} · {tHHMM(g.sampleStart)}–{tHHMM(g.sampleEnd)} · {(g.weekdays || []).map((d: number) => WEEKDAYS_SHORT[d]).join(", ")}
                    </Text>
                    <Text style={{ color: C.sub, fontSize: 12, marginTop: 2 }}>{dDMY(g.firstStart)} → {dDMY(g.lastStart)}</Text>
                  </View>
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    {g.upcoming > 0 && (
                      <TouchableOpacity onPress={() => setEditGroup(g)} style={[styles.cancelBtn, { backgroundColor: C.accentSoft }]}>
                        <Ionicons name="create-outline" size={14} color={C.accent} /><Text style={{ color: C.accent, fontSize: 12, fontWeight: "700" }}>Sửa</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => doCancel(g)} style={[styles.cancelBtn, { backgroundColor: "rgba(239,68,68,0.12)" }]}>
                      <Ionicons name="trash-outline" size={14} color={C.danger} /><Text style={{ color: C.danger, fontSize: 12, fontWeight: "700" }}>Xoá</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={{ flexDirection: "row", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                  <Chip C={C} color={C.accent} label={`${g.total} buổi`} small />
                  {g.upcoming > 0 && <Chip C={C} color={C.info} label={`${g.upcoming} sắp tới`} small />}
                  {g.cancelled > 0 && <Chip C={C} color={C.muted} label={`${g.cancelled} đã huỷ`} small />}
                  <Chip C={C} color={C.success} label={`Thu ${fmtVND(g.paidRevenue)}`} small />
                  {g.autoRenew ? <Chip C={C} color={C.gold} label={`🔁 Tự gia hạn ${g.renewEveryMonths || 1} tháng`} small /> : null}
                  {g.planStatus === "ended" ? <Chip C={C} color={C.muted} label="Đã kết thúc" small /> : null}
                </View>
              </Card>
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {editGroup && <EditSeriesModal C={C} venueId={id} g={editGroup} onClose={() => setEditGroup(null)} />}
    </View>
  );
}

function EditSeriesModal({ C, venueId, g, onClose }: any) {
  const [update, { isLoading }] = useUpdateRecurringMutation();
  const [cancel] = useCancelRecurringMutation();
  const [name, setName] = useState(g.customerName || "");
  const [phone, setPhone] = useState(g.customerPhone || "");
  const [note, setNote] = useState(g.note || "");
  const [priceMode, setPriceMode] = useState<"keep" | "custom" | "total">("keep");
  const [price, setPrice] = useState("");
  const [autoRenew, setAutoRenew] = useState(!!g.autoRenew);
  const [renewMonths, setRenewMonths] = useState(String(g.renewEveryMonths || 1));

  const save = async () => {
    const body: any = { venueId, group: g.group, customerName: name.trim(), customerPhone: phone.trim(), note: note.trim(), autoRenew, renewEveryMonths: Number(renewMonths) || 1 };
    if (priceMode === "custom") { if (!(Number(price) > 0)) return Alert.alert("Nhập giá", "Nhập giá mỗi buổi."); body.priceMode = "custom"; body.pricePerSession = Number(price); }
    else if (priceMode === "total") { if (!(Number(price) > 0)) return Alert.alert("Nhập giá", "Nhập tổng giá trọn gói."); body.priceMode = "total"; body.totalPackagePrice = Number(price); }
    try { await update(body).unwrap(); Alert.alert("Đã lưu", "Cập nhật lịch cố định thành công."); onClose(); }
    catch (e: any) { Alert.alert("Lỗi", e?.data?.message || "Lưu thất bại."); }
  };

  const endPlan = () =>
    Alert.alert("Kết thúc lịch cố định?", "Ngừng tự gia hạn. Các buổi đã tạo vẫn giữ nguyên (muốn xoá thì dùng nút Xoá).", [
      { text: "Không" },
      { text: "Kết thúc", style: "destructive", onPress: () => update({ venueId, group: g.group, endPlan: true }).unwrap().then(() => { Alert.alert("Đã kết thúc", "Lịch sẽ không tự gia hạn nữa."); onClose(); }).catch((e: any) => Alert.alert("Lỗi", e?.data?.message || "Thất bại")) },
    ]);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView style={[styles.modalSheet, { backgroundColor: C.card }]} contentContainerStyle={{ paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
          <SheetHandle C={C} />
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <Text style={{ color: C.text, fontWeight: "900", fontSize: 17 }}>Sửa lịch cố định</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={C.sub} /></TouchableOpacity>
          </View>
          <Field C={C} label="Tên CLB / khách" v={name} set={setName} />
          <Field C={C} label="Số điện thoại" v={phone} set={setPhone} kb="phone-pad" />
          <Field C={C} label="Ghi chú" v={note} set={setNote} />

          <Label C={C}>Đổi giá các buổi sắp tới</Label>
          <View style={styles.seg}>
            {([["keep", "Giữ nguyên"], ["total", "Trọn gói"], ["custom", "Theo buổi"]] as const).map(([k, lbl]) => (
              <TouchableOpacity key={k} onPress={() => setPriceMode(k)} style={[styles.segItem, { backgroundColor: priceMode === k ? C.accent : C.field }]}>
                <Text style={{ color: priceMode === k ? C.onAccent : C.text, fontWeight: "700", fontSize: 12 }}>{lbl}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {priceMode !== "keep" && (
            <PtInput style={[styles.input, { backgroundColor: C.field, color: C.text }]} value={price} onChangeText={setPrice} keyboardType="numeric" placeholder={priceMode === "total" ? "Tổng giá cho các buổi sắp tới (đ)" : "Giá 1 buổi (đ)"} placeholderTextColor={C.muted} />
          )}

          <View style={styles.paidRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontWeight: "700" }}>Tự động gia hạn</Text>
              <Text style={{ color: C.sub, fontSize: 12 }}>Tự tạo tiếp lịch khi sắp hết</Text>
            </View>
            <Switch value={autoRenew} onValueChange={setAutoRenew} trackColor={{ true: C.accent, false: "#94a3b8" }} thumbColor="#fff" />
          </View>
          {autoRenew && (
            <Field C={C} label="Chu kỳ gia hạn (tháng)" v={renewMonths} set={setRenewMonths} kb="numeric" />
          )}

          <PrimaryButton C={C} icon="checkmark" label={isLoading ? "Đang lưu…" : "Lưu thay đổi"} disabled={isLoading} onPress={save} style={{ marginTop: 12 }} />
          <TouchableOpacity onPress={endPlan} style={{ alignSelf: "center", marginTop: 12, flexDirection: "row", alignItems: "center", gap: 6, padding: 8 }}>
            <Ionicons name="stop-circle-outline" size={16} color={C.danger} />
            <Text style={{ color: C.danger, fontWeight: "700" }}>Kết thúc lịch cố định</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Label({ C, children }: any) {
  return <Text style={{ color: C.sub, fontSize: 13, marginBottom: 6, marginTop: 4 }}>{children}</Text>;
}
function Field({ C, label, v, set, ph, kb }: any) {
  return (
    <View style={{ marginBottom: 8, flex: 1 }}>
      <Text style={{ color: C.sub, fontSize: 13, marginBottom: 6, marginTop: 4 }}>{label}</Text>
      <PtInput style={{ backgroundColor: C.field, color: C.text, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 }} value={v} onChangeText={set} placeholder={ph} placeholderTextColor={C.muted} keyboardType={kb} />
    </View>
  );
}
const styles = StyleSheet.create({
  icon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  wd: { width: 42, paddingVertical: 9, borderRadius: 10, alignItems: "center" },
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 4 },
  seg: { flexDirection: "row", gap: 8, marginBottom: 10, marginTop: 2 },
  segItem: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: "center" },
  paidRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8, marginBottom: 10 },
  cancelBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10 },
  modalWrap: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(2,6,23,0.6)" },
  modalSheet: { padding: SP.lg, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, maxHeight: "90%" },
});
