// app/owner/venue/[id]/events.tsx — Chủ sân: quản lý sự kiện xé vé / social
import React, { useMemo, useState } from "react";
import { View, ScrollView, TextInput, TouchableOpacity, StyleSheet, Alert, Switch, Modal, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import DateTimePickerModal from "react-native-modal-datetime-picker";
import { Text } from "@/components/ui/i18nText";
import { Ionicons } from "@expo/vector-icons";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { useGetVenueQuery } from "@/slices/venuesApiSlice";
import { useListVenueEventsQuery, useCreateEventMutation, useUpdateEventMutation, useCancelEventMutation } from "@/slices/eventsApiSlice";
import { fmtVND, pal, dtLabel, toDateInput } from "@/utils/courtFormat";
import { Card, Chip, SectionHeader, Empty, PrimaryButton, SheetHandle, shadow, R, SP } from "@/components/courts/ui";

const GENDER = [
  { k: "any", lbl: "Không giới hạn" },
  { k: "male", lbl: "Chỉ nam" },
  { k: "female", lbl: "Chỉ nữ" },
  { k: "balanced", lbl: "Cân bằng nam/nữ" },
];

export default function OwnerEventsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const C = useMemo(() => pal(!!theme.dark), [theme.dark]);
  const { data: venue } = useGetVenueQuery(id, { skip: !id });
  const { data: events, isLoading, refetch, isFetching } = useListVenueEventsQuery(id, { skip: !id });
  const [cancelEvent] = useCancelEventMutation();
  const [editor, setEditor] = useState<any>(null);

  const doCancel = (ev: any) =>
    Alert.alert("Huỷ sự kiện?", `"${ev.title}" — người đăng ký sẽ được thông báo.`, [
      { text: "Không" },
      { text: "Huỷ sự kiện", style: "destructive", onPress: () => cancelEvent({ venueId: id, eventId: ev._id }).unwrap().catch((e: any) => Alert.alert("Lỗi", e?.data?.message || "Thất bại")) },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{ title: "Sự kiện xé vé", headerRight: () => (
        <TouchableOpacity onPress={() => setEditor({ new: true })} hitSlop={8}><Ionicons name="add-circle" size={24} color={C.accent} /></TouchableOpacity>
      ) }} />
      {isLoading ? <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} /> : (
        <ScrollView contentContainerStyle={{ padding: SP.lg, paddingBottom: 48 }}>
          <PrimaryButton C={C} icon="add" label="Tạo sự kiện mới" onPress={() => setEditor({ new: true })} style={{ marginBottom: SP.md }} />
          {!events?.length ? (
            <Card C={C} pad={0}><Empty C={C} icon="ticket-outline" title="Chưa có sự kiện" subtitle="Tạo buổi đánh social / giao lưu và bán vé cho người chơi." /></Card>
          ) : (
            events.map((ev: any) => {
              const st = ev.stats || {};
              const cancelled = ev.status === "cancelled";
              return (
                <TouchableOpacity key={ev._id} activeOpacity={0.9} onPress={() => router.push({ pathname: "/owner/venue/[id]/event/[eventId]", params: { id, eventId: ev._id } })}>
                  <Card C={C} style={[{ marginBottom: SP.md }, cancelled && { opacity: 0.6 }]}>
                    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ color: C.text, fontWeight: "800", fontSize: 15 }} numberOfLines={1}>{ev.title}</Text>
                        <Text style={{ color: C.sub, fontSize: 12.5, marginTop: 2 }}>{dtLabel(ev.startAt)}</Text>
                      </View>
                      {cancelled ? <Chip C={C} color={C.danger} label="Đã huỷ" small /> : <Chip C={C} color={st.registered >= ev.capacity ? C.warning : C.success} label={`${st.registered || 0}/${ev.capacity}`} small />}
                      <TouchableOpacity onPress={() => setEditor(ev)} hitSlop={6}><Ionicons name="create-outline" size={18} color={C.sub} /></TouchableOpacity>
                      {!cancelled && <TouchableOpacity onPress={() => doCancel(ev)} hitSlop={6}><Ionicons name="trash-outline" size={18} color={C.danger} /></TouchableOpacity>}
                    </View>
                    <View style={{ flexDirection: "row", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                      <Chip C={C} color={C.accent} label={ev.price > 0 ? fmtVND(ev.price) : "Miễn phí"} small />
                      <Chip C={C} color={C.success} label={`Thu ${fmtVND(st.revenue || 0)}`} small />
                      {st.checkedIn > 0 && <Chip C={C} color={C.info} label={`${st.checkedIn} check-in`} small />}
                      {(st.byGender?.male || st.byGender?.female) ? <Chip C={C} color={C.muted} label={`${st.byGender.male || 0}N/${st.byGender.female || 0}Nữ`} small /> : null}
                    </View>
                  </Card>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}
      {editor && <EventEditor C={C} venueId={id} courts={venue?.courts || []} editor={editor} onClose={() => { setEditor(null); refetch(); }} />}
    </View>
  );
}

function EventEditor({ C, venueId, courts, editor, onClose }: any) {
  const isNew = !!editor?.new;
  const [create, { isLoading: creating }] = useCreateEventMutation();
  const [update, { isLoading: updating }] = useUpdateEventMutation();
  const [title, setTitle] = useState(editor.title || "");
  const [desc, setDesc] = useState(editor.description || "");
  const [start, setStart] = useState<Date>(editor.startAt ? new Date(editor.startAt) : new Date(Date.now() + 3600000));
  const [end, setEnd] = useState<Date>(editor.endAt ? new Date(editor.endAt) : new Date(Date.now() + 3 * 3600000));
  const [picker, setPicker] = useState<null | "start" | "end">(null);
  const [capacity, setCapacity] = useState(String(editor.capacity || 12));
  const [price, setPrice] = useState(String(editor.price || 0));
  const [skillMin, setSkillMin] = useState(String(editor.skillMin || 0));
  const [skillMax, setSkillMax] = useState(String(editor.skillMax || 0));
  const [gender, setGender] = useState(editor.genderPolicy || "any");
  const [maleQuota, setMaleQuota] = useState(String(editor.maleQuota || 0));
  const [femaleQuota, setFemaleQuota] = useState(String(editor.femaleQuota || 0));
  const [online, setOnline] = useState(editor.paymentMode ? editor.paymentMode === "online" : true);

  const save = async () => {
    if (!title.trim()) return Alert.alert("Nhập tên sự kiện");
    if (end <= start) return Alert.alert("Thời gian", "Giờ kết thúc phải sau giờ bắt đầu.");
    const body: any = {
      title: title.trim(), description: desc.trim(),
      startAt: start.toISOString(), endAt: end.toISOString(),
      capacity: Number(capacity) || 1, price: Number(price) || 0,
      skillType: "double", skillMin: Number(skillMin) || 0, skillMax: Number(skillMax) || 0,
      genderPolicy: gender, maleQuota: Number(maleQuota) || 0, femaleQuota: Number(femaleQuota) || 0,
      paymentMode: online ? "online" : "onsite",
    };
    try {
      if (isNew) await create({ venueId, ...body }).unwrap();
      else await update({ venueId, eventId: editor._id, ...body }).unwrap();
      onClose();
    } catch (e: any) { Alert.alert("Lỗi", e?.data?.message || "Lưu thất bại."); }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView style={[styles.modal, { backgroundColor: C.card }]} contentContainerStyle={{ paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
          <SheetHandle C={C} />
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <Text style={{ color: C.text, fontWeight: "900", fontSize: 17 }}>{isNew ? "Tạo sự kiện" : "Sửa sự kiện"}</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={C.sub} /></TouchableOpacity>
          </View>
          <F C={C} label="Tên sự kiện" v={title} set={setTitle} ph="VD: Social tối thứ 6" />
          <F C={C} label="Mô tả" v={desc} set={setDesc} ph="Thể thức, luật chơi…" multiline />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <DateBtn C={C} label="Bắt đầu" value={start} onPress={() => setPicker("start")} />
            <DateBtn C={C} label="Kết thúc" value={end} onPress={() => setPicker("end")} />
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <F C={C} label="Số suất" v={capacity} set={setCapacity} kb="numeric" flex />
            <F C={C} label="Giá vé (đ)" v={price} set={setPrice} kb="numeric" flex />
          </View>
          <Text style={{ color: C.sub, fontSize: 13, marginTop: 4, marginBottom: 6 }}>Điểm trình (điểm đôi, 0 = không giới hạn)</Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <F C={C} label="Tối thiểu" v={skillMin} set={setSkillMin} kb="numeric" flex />
            <F C={C} label="Tối đa" v={skillMax} set={setSkillMax} kb="numeric" flex />
          </View>
          <Text style={{ color: C.sub, fontSize: 13, marginTop: 4, marginBottom: 6 }}>Giới tính</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
            {GENDER.map((g) => (
              <TouchableOpacity key={g.k} onPress={() => setGender(g.k)} style={[styles.chip, { backgroundColor: gender === g.k ? C.accent : C.field }]}>
                <Text style={{ color: gender === g.k ? C.onAccent : C.text, fontWeight: "700", fontSize: 12 }}>{g.lbl}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {gender === "balanced" && (
            <View style={{ flexDirection: "row", gap: 10 }}>
              <F C={C} label="Suất nam (0=∞)" v={maleQuota} set={setMaleQuota} kb="numeric" flex />
              <F C={C} label="Suất nữ (0=∞)" v={femaleQuota} set={setFemaleQuota} kb="numeric" flex />
            </View>
          )}
          <View style={styles.paidRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontWeight: "700" }}>Thu tiền online (QR)</Text>
              <Text style={{ color: C.sub, fontSize: 12 }}>{online ? "Người chơi chuyển khoản + gửi bill" : "Thu tại sân, tự đánh dấu đã thu"}</Text>
            </View>
            <Switch value={online} onValueChange={setOnline} trackColor={{ true: C.accent, false: "#94a3b8" }} thumbColor="#fff" />
          </View>
          <PrimaryButton C={C} icon="checkmark" label={creating || updating ? "Đang lưu…" : isNew ? "Tạo sự kiện" : "Lưu"} disabled={creating || updating} onPress={save} style={{ marginTop: 10 }} />
        </ScrollView>
      </KeyboardAvoidingView>
      <DateTimePickerModal
        isVisible={!!picker}
        mode="datetime"
        date={picker === "end" ? end : start}
        minimumDate={new Date()}
        is24Hour
        minuteInterval={15}
        onConfirm={(d) => { if (picker === "start") { setStart(d); if (end <= d) setEnd(new Date(d.getTime() + 2 * 3600000)); } else setEnd(d); setPicker(null); }}
        onCancel={() => setPicker(null)}
      />
    </Modal>
  );
}

function DateBtn({ C, label, value, onPress }: any) {
  return (
    <TouchableOpacity onPress={onPress} style={{ flex: 1, marginBottom: 8 }}>
      <Text style={{ color: C.sub, fontSize: 13, marginBottom: 6 }}>{label}</Text>
      <View style={{ backgroundColor: C.field, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Ionicons name="calendar-outline" size={15} color={C.accent} />
        <Text style={{ color: C.text, fontWeight: "600", fontSize: 13 }}>{value.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}</Text>
      </View>
    </TouchableOpacity>
  );
}
function F({ C, label, v, set, ph, kb, multiline, flex }: any) {
  return (
    <View style={{ marginBottom: 8, flex: flex ? 1 : undefined }}>
      <Text style={{ color: C.sub, fontSize: 13, marginBottom: 6 }}>{label}</Text>
      <TextInput style={{ backgroundColor: C.field, color: C.text, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, height: multiline ? 76 : undefined, textAlignVertical: multiline ? "top" : "center" }} value={v} onChangeText={set} placeholder={ph} placeholderTextColor={C.muted} keyboardType={kb} multiline={multiline} />
    </View>
  );
}
const styles = StyleSheet.create({
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  paidRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8, marginBottom: 6 },
  modalWrap: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(2,6,23,0.6)" },
  modal: { padding: SP.lg, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, maxHeight: "92%" },
});
