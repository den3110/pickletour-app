// components/play/PlayForm.tsx — form đăng / sửa kèo "Tìm bạn đánh" (mobile)
import React, { useEffect, useState } from "react";
import {
  View,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";
import { TextInput } from "@/components/ui/i18nTextInput";
import { Text } from "@/components/ui/i18nText";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import DateTimePickerModal from "react-native-modal-datetime-picker";
import { formatPlayTime } from "@/constants/play";
import {
  useCreateInviteMutation,
  useUpdateInviteMutation,
  useGetInviteQuery,
} from "@/slices/playApiSlice";

const GREEN = "#16a34a";
const inputStyle = {
  borderWidth: 1,
  borderColor: "#E2E8F0",
  borderRadius: 12,
  paddingHorizontal: 14,
  paddingVertical: 12,
  fontSize: 15,
  color: "#111827",
  backgroundColor: "#fff",
} as const;
const Label = ({ children }: { children: React.ReactNode }) => (
  <Text style={{ fontWeight: "700", marginBottom: 6, marginTop: 14, color: "#111827" }}>{children}</Text>
);

export default function PlayForm({ existingId }: { existingId?: string }) {
  const isEdit = !!existingId;
  const { data: existing } = useGetInviteQuery(existingId, { skip: !isEdit });
  const [createInvite, { isLoading: creating }] = useCreateInviteMutation();
  const [updateInvite, { isLoading: updating }] = useUpdateInviteMutation();

  const [title, setTitle] = useState("");
  const [courtName, setCourtName] = useState("");
  const [province, setProvince] = useState("");
  const [district, setDistrict] = useState("");
  const [playAt, setPlayAt] = useState<Date | null>(null);
  const [durationMin, setDurationMin] = useState("90");
  const [skillMin, setSkillMin] = useState("");
  const [skillMax, setSkillMax] = useState("");
  const [slots, setSlots] = useState("1");
  const [contactPhone, setContactPhone] = useState("");
  const [note, setNote] = useState("");
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    if (isEdit && existing) {
      setTitle(existing.title || "");
      setCourtName(existing.courtName || "");
      setProvince(existing.province || "");
      setDistrict(existing.district || "");
      setPlayAt(existing.playAt ? new Date(existing.playAt) : null);
      setDurationMin(String(existing.durationMin || 90));
      setSkillMin(existing.skillMin != null ? String(existing.skillMin) : "");
      setSkillMax(existing.skillMax != null ? String(existing.skillMax) : "");
      setSlots(String(existing.slots || 1));
      setContactPhone(existing.contactPhone || "");
      setNote(existing.note || "");
    }
  }, [isEdit, existing]);

  const submit = async () => {
    if (!playAt) return Alert.alert("Thiếu thời gian", "Vui lòng chọn thời gian chơi");
    const payload: any = {
      title,
      courtName,
      province,
      district,
      playAt: playAt.toISOString(),
      durationMin: Number(durationMin) || 90,
      skillMin: skillMin === "" ? null : Number(skillMin),
      skillMax: skillMax === "" ? null : Number(skillMax),
      slots: Number(slots) || 1,
      contactPhone,
      note,
    };
    try {
      if (isEdit) {
        await updateInvite({ id: existingId, ...payload }).unwrap();
        Alert.alert("Thành công", "Đã cập nhật kèo");
        router.replace(`/play/${existingId}` as any);
      } else {
        const created: any = await createInvite(payload).unwrap();
        Alert.alert("Thành công", "Đã đăng kèo!");
        router.replace(`/play/${created._id}` as any);
      }
    } catch (e: any) {
      Alert.alert("Lỗi", e?.data?.message || "Có lỗi xảy ra");
    }
  };

  const busy = creating || updating;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#EEF0F3" }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color="#111827" />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "900", marginLeft: 4 }}>{isEdit ? "Sửa kèo" : "Đăng kèo giao lưu"}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Label>Tiêu đề</Label>
        <TextInput value={title} onChangeText={setTitle} placeholder="VD: Giao lưu tối T5, cần 2 người" placeholderTextColor="#94A3B8" style={inputStyle} />

        <Label>Thời gian chơi *</Label>
        <TouchableOpacity onPress={() => setShowPicker(true)} style={[inputStyle, { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}>
          <Text style={{ color: playAt ? "#111827" : "#94A3B8", fontSize: 15 }}>
            {playAt ? formatPlayTime(playAt.toISOString()) : "Chọn ngày & giờ"}
          </Text>
          <Ionicons name="calendar-outline" size={20} color="#64748B" />
        </TouchableOpacity>
        <DateTimePickerModal
          isVisible={showPicker}
          mode="datetime"
          date={playAt || new Date(Date.now() + 3600 * 1000)}
          minimumDate={new Date()}
          is24Hour
          minuteInterval={5}
          onConfirm={(d) => { setPlayAt(d); setShowPicker(false); }}
          onCancel={() => setShowPicker(false)}
        />

        <Label>Tên sân</Label>
        <TextInput value={courtName} onChangeText={setCourtName} placeholder="VD: Sân Pickleball ABC" placeholderTextColor="#94A3B8" style={inputStyle} />

        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Label>Tỉnh/TP</Label>
            <TextInput value={province} onChangeText={setProvince} placeholder="Hà Nội" placeholderTextColor="#94A3B8" style={inputStyle} />
          </View>
          <View style={{ flex: 1 }}>
            <Label>Quận/Huyện</Label>
            <TextInput value={district} onChangeText={setDistrict} placeholder="Cầu Giấy" placeholderTextColor="#94A3B8" style={inputStyle} />
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Label>Trình từ</Label>
            <TextInput value={skillMin} onChangeText={setSkillMin} keyboardType="decimal-pad" placeholder="2.5" placeholderTextColor="#94A3B8" style={inputStyle} />
          </View>
          <View style={{ flex: 1 }}>
            <Label>Trình đến</Label>
            <TextInput value={skillMax} onChangeText={setSkillMax} keyboardType="decimal-pad" placeholder="3.5" placeholderTextColor="#94A3B8" style={inputStyle} />
          </View>
          <View style={{ flex: 1 }}>
            <Label>Cần thêm</Label>
            <TextInput value={slots} onChangeText={setSlots} keyboardType="number-pad" placeholder="1" placeholderTextColor="#94A3B8" style={inputStyle} />
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Label>Thời lượng (phút)</Label>
            <TextInput value={durationMin} onChangeText={setDurationMin} keyboardType="number-pad" style={inputStyle} />
          </View>
          <View style={{ flex: 1 }}>
            <Label>SĐT liên hệ</Label>
            <TextInput value={contactPhone} onChangeText={setContactPhone} keyboardType="phone-pad" placeholder="09xx" placeholderTextColor="#94A3B8" style={inputStyle} />
          </View>
        </View>

        <Label>Ghi chú</Label>
        <TextInput value={note} onChangeText={setNote} placeholder="Sân số mấy, mang bóng, chi phí…" placeholderTextColor="#94A3B8" multiline style={{ ...inputStyle, minHeight: 90, textAlignVertical: "top" }} />

        <TouchableOpacity onPress={submit} disabled={busy} style={{ marginTop: 24, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: busy ? "#86efac" : GREEN }}>
          <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>{busy ? "Đang lưu…" : isEdit ? "Lưu thay đổi" : "Đăng kèo"}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
