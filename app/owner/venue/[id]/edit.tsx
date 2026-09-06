// Cài đặt cụm sân: thông tin, ảnh, giờ mở cửa, ngân hàng, chính sách huỷ + quản lý sân con
import React, { useEffect, useMemo, useState } from "react";
import { View, ScrollView, TextInput, TouchableOpacity, StyleSheet, Alert, Image, Switch, Modal, ActivityIndicator } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Text } from "@/components/ui/i18nText";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { useGetVenueQuery } from "@/slices/venuesApiSlice";
import { useUpdateVenueMutation, useAddCourtMutation, useUpdateCourtMutation, useDeleteCourtMutation } from "@/slices/venueOwnerApiSlice";
import { useUploadImageToFolderMutation } from "@/slices/uploadApiSlice";
import { prepareSupportImageForUpload } from "@/utils/supportImageUpload";
import { fmtVND, pal, WEEKDAYS_SHORT } from "@/utils/courtFormat";

export default function VenueEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const C = useMemo(() => pal(!!theme.dark), [theme.dark]);
  const { data: venue, isLoading } = useGetVenueQuery(id, { skip: !id });
  const [updateVenue, { isLoading: saving }] = useUpdateVenueMutation();
  const [upload, { isLoading: uploading }] = useUploadImageToFolderMutation();

  const [form, setForm] = useState<any>(null);

  useEffect(() => {
    if (venue && !form) {
      setForm({
        name: venue.name || "",
        phone: venue.phone || "",
        address: venue.address || "",
        province: venue.province || "",
        description: venue.description || "",
        images: venue.images || [],
        slotMinutes: String(venue.slotMinutes || 60),
        defaultPricePerHour: String(venue.defaultPricePerHour || 0),
        bankShortName: venue.bankShortName || "",
        bankAccountNumber: venue.bankAccountNumber || "",
        bankAccountName: venue.bankAccountName || "",
        cancelHours: String(venue.cancelPolicy?.hoursBefore || 0),
        openHours: (venue.openHours && venue.openHours.length === 7) ? venue.openHours.map((h: any) => ({ ...h })) : Array.from({ length: 7 }, () => ({ closed: false, open: "06:00", close: "22:00" })),
      });
    }
  }, [venue]); // eslint-disable-line

  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  const addImage = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 });
    if (r.canceled || !r.assets?.[0]) return;
    try {
      const file = await prepareSupportImageForUpload({ uri: r.assets[0].uri }, "venue");
      const res: any = await upload({ folder: "venues", file, options: { format: "webp", width: 1600, quality: 82 } }).unwrap();
      const url = res?.url || res?.data?.url;
      if (url) set("images", [...form.images, url]);
    } catch (e: any) {
      Alert.alert("Lỗi", "Tải ảnh thất bại.");
    }
  };

  const save = async () => {
    try {
      await updateVenue({
        id,
        name: form.name.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        province: form.province.trim(),
        description: form.description.trim(),
        images: form.images,
        slotMinutes: Number(form.slotMinutes) || 60,
        defaultPricePerHour: Number(form.defaultPricePerHour) || 0,
        bankShortName: form.bankShortName.trim(),
        bankAccountNumber: form.bankAccountNumber.trim(),
        bankAccountName: form.bankAccountName.trim(),
        cancelPolicy: { hoursBefore: Number(form.cancelHours) || 0 },
        openHours: form.openHours,
      }).unwrap();
      Alert.alert("Đã lưu", "Cập nhật cụm sân thành công.");
    } catch (e: any) {
      Alert.alert("Lỗi", e?.data?.message || "Lưu thất bại.");
    }
  };

  if (isLoading || !form) {
    return <View style={{ flex: 1, backgroundColor: C.bg }}><Stack.Screen options={{ title: "Cài đặt sân" }} /><ActivityIndicator color={C.accent} style={{ marginTop: 40 }} /></View>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{ title: "Cài đặt sân" }} />
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 60 }}>
        {/* Ảnh */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 14 }}>
          {form.images.map((u: string, i: number) => (
            <View key={i}>
              <Image source={{ uri: u }} style={styles.img} />
              <TouchableOpacity style={styles.imgDel} onPress={() => set("images", form.images.filter((_: any, j: number) => j !== i))}>
                <Ionicons name="close" size={14} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity style={[styles.imgAdd, { borderColor: C.border }]} onPress={addImage} disabled={uploading}>
            {uploading ? <ActivityIndicator color={C.accent} /> : <Ionicons name="camera-outline" size={26} color={C.sub} />}
          </TouchableOpacity>
        </ScrollView>

        <Card C={C} title="Thông tin">
          <Field C={C} label="Tên cụm sân" v={form.name} set={(t: string) => set("name", t)} />
          <Field C={C} label="Số điện thoại" v={form.phone} set={(t: string) => set("phone", t)} kb="phone-pad" />
          <Field C={C} label="Địa chỉ" v={form.address} set={(t: string) => set("address", t)} />
          <Field C={C} label="Tỉnh/Thành" v={form.province} set={(t: string) => set("province", t)} />
          <Field C={C} label="Mô tả" v={form.description} set={(t: string) => set("description", t)} multiline />
        </Card>

        <Card C={C} title="Đặt sân & thanh toán">
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Field C={C} label="Bước đặt (phút)" v={form.slotMinutes} set={(t: string) => set("slotMinutes", t)} kb="numeric" flex />
            <Field C={C} label="Giá mặc định/giờ" v={form.defaultPricePerHour} set={(t: string) => set("defaultPricePerHour", t)} kb="numeric" flex />
          </View>
          <Field C={C} label="Ngân hàng (mã, vd MB, VCB)" v={form.bankShortName} set={(t: string) => set("bankShortName", t)} />
          <Field C={C} label="Số tài khoản" v={form.bankAccountNumber} set={(t: string) => set("bankAccountNumber", t)} kb="numeric" />
          <Field C={C} label="Tên chủ tài khoản" v={form.bankAccountName} set={(t: string) => set("bankAccountName", t)} />
          <Field C={C} label="Cho tự huỷ trước (giờ) — 0 = luôn cho huỷ" v={form.cancelHours} set={(t: string) => set("cancelHours", t)} kb="numeric" />
        </Card>

        <Card C={C} title="Giờ mở cửa">
          {form.openHours.map((h: any, i: number) => (
            <View key={i} style={styles.hourRow}>
              <Text style={{ color: C.text, width: 34, fontWeight: "700" }}>{WEEKDAYS_SHORT[i]}</Text>
              <Switch value={!h.closed} onValueChange={(v) => { const oh = [...form.openHours]; oh[i] = { ...oh[i], closed: !v }; set("openHours", oh); }} trackColor={{ true: C.accent, false: "#94a3b8" }} thumbColor="#fff" />
              {h.closed ? <Text style={{ color: C.sub, flex: 1, marginLeft: 8 }}>Đóng cửa</Text> : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1, marginLeft: 8 }}>
                  <TextInput style={[styles.timeInput, { backgroundColor: C.field, color: C.text }]} value={h.open} onChangeText={(t) => { const oh = [...form.openHours]; oh[i] = { ...oh[i], open: t }; set("openHours", oh); }} />
                  <Text style={{ color: C.sub }}>–</Text>
                  <TextInput style={[styles.timeInput, { backgroundColor: C.field, color: C.text }]} value={h.close} onChangeText={(t) => { const oh = [...form.openHours]; oh[i] = { ...oh[i], close: t }; set("openHours", oh); }} />
                </View>
              )}
            </View>
          ))}
        </Card>

        <TouchableOpacity style={[styles.save, { backgroundColor: C.accent, opacity: saving ? 0.6 : 1 }]} disabled={saving} onPress={save}>
          <Text style={{ color: "#0a0e1a", fontWeight: "800", fontSize: 15 }}>{saving ? "Đang lưu…" : "Lưu cài đặt"}</Text>
        </TouchableOpacity>

        <CourtsManager C={C} venueId={id} courts={venue?.courts || []} />
      </ScrollView>
    </View>
  );
}

/* ---------- Quản lý sân con ---------- */
function CourtsManager({ C, venueId, courts }: any) {
  const [addCourt, { isLoading: adding }] = useAddCourtMutation();
  const [updateCourt] = useUpdateCourtMutation();
  const [deleteCourt] = useDeleteCourtMutation();
  const [editing, setEditing] = useState<any>(null); // court | {new:true}

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [rules, setRules] = useState<any[]>([]);

  const openEdit = (c: any) => {
    setEditing(c || { new: true });
    setName(c?.name || "");
    setPrice(String(c?.defaultPricePerHour || 0));
    setRules(c?.priceRules ? c.priceRules.map((r: any) => ({ ...r })) : []);
  };

  const save = async () => {
    if (!name.trim()) return Alert.alert("Nhập tên sân");
    const body = { name: name.trim(), defaultPricePerHour: Number(price) || 0, priceRules: rules };
    try {
      if (editing.new) await addCourt({ venueId, ...body }).unwrap();
      else await updateCourt({ venueId, courtId: editing._id, ...body }).unwrap();
      setEditing(null);
    } catch (e: any) {
      Alert.alert("Lỗi", e?.data?.message || "Lưu thất bại.");
    }
  };

  const addRule = () => setRules([...rules, { label: "Giờ vàng", daysOfWeek: [], start: "18:00", end: "22:00", pricePerHour: 0 }]);

  return (
    <Card C={C} title={`Sân con (${courts.length})`}>
      {courts.map((c: any) => (
        <View key={c._id} style={styles.courtRow}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.text, fontWeight: "700" }}>{c.name}</Text>
            <Text style={{ color: C.sub, fontSize: 12 }}>{fmtVND(c.defaultPricePerHour)}/giờ{c.priceRules?.length ? ` · ${c.priceRules.length} khung giá` : ""}{c.status === "maintenance" ? " · bảo trì" : ""}</Text>
          </View>
          <TouchableOpacity onPress={() => openEdit(c)}><Ionicons name="create-outline" size={20} color={C.sub} /></TouchableOpacity>
          <TouchableOpacity onPress={() => Alert.alert("Ẩn sân?", c.name, [{ text: "Không" }, { text: "Ẩn", style: "destructive", onPress: () => deleteCourt({ venueId, courtId: c._id }) }])} style={{ marginLeft: 12 }}>
            <Ionicons name="trash-outline" size={20} color="#ef4444" />
          </TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity style={[styles.addCourt, { borderColor: C.accent }]} onPress={() => openEdit(null)} disabled={adding}>
        <Ionicons name="add" size={18} color={C.accent} />
        <Text style={{ color: C.accent, fontWeight: "700" }}>Thêm sân</Text>
      </TouchableOpacity>

      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <View style={styles.modalWrap}>
          <ScrollView style={[styles.modal, { backgroundColor: C.card }]} contentContainerStyle={{ paddingBottom: 20 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <Text style={{ color: C.text, fontWeight: "800", fontSize: 16 }}>{editing?.new ? "Thêm sân" : "Sửa sân"}</Text>
              <TouchableOpacity onPress={() => setEditing(null)}><Ionicons name="close" size={22} color={C.sub} /></TouchableOpacity>
            </View>
            <Field C={C} label="Tên sân" v={name} set={setName} />
            <Field C={C} label="Giá mặc định/giờ" v={price} set={setPrice} kb="numeric" />
            <Text style={{ color: C.sub, fontSize: 13, marginTop: 6, marginBottom: 8 }}>Khung giá đặc biệt (giờ vàng / cuối tuần)</Text>
            {rules.map((r, i) => (
              <View key={i} style={[styles.rule, { borderColor: C.border }]}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <TextInput style={[styles.ruleInput, { backgroundColor: C.field, color: C.text, flex: 1 }]} value={r.label} onChangeText={(t) => { const rr = [...rules]; rr[i].label = t; setRules(rr); }} placeholder="Nhãn" placeholderTextColor={C.sub} />
                  <TouchableOpacity onPress={() => setRules(rules.filter((_, j) => j !== i))} style={{ padding: 6 }}><Ionicons name="trash-outline" size={18} color="#ef4444" /></TouchableOpacity>
                </View>
                <View style={{ flexDirection: "row", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                  {WEEKDAYS_SHORT.map((w, wi) => {
                    const on = r.daysOfWeek?.includes(wi);
                    return <TouchableOpacity key={wi} onPress={() => { const rr = [...rules]; const set0 = new Set(rr[i].daysOfWeek || []); on ? set0.delete(wi) : set0.add(wi); rr[i].daysOfWeek = [...set0]; setRules(rr); }} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: on ? C.accent : C.field }}><Text style={{ color: on ? "#0a0e1a" : C.text, fontSize: 11 }}>{w}</Text></TouchableOpacity>;
                  })}
                </View>
                <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
                  <TextInput style={[styles.ruleInput, { backgroundColor: C.field, color: C.text, flex: 1 }]} value={r.start} onChangeText={(t) => { const rr = [...rules]; rr[i].start = t; setRules(rr); }} placeholder="18:00" placeholderTextColor={C.sub} />
                  <TextInput style={[styles.ruleInput, { backgroundColor: C.field, color: C.text, flex: 1 }]} value={r.end} onChangeText={(t) => { const rr = [...rules]; rr[i].end = t; setRules(rr); }} placeholder="22:00" placeholderTextColor={C.sub} />
                  <TextInput style={[styles.ruleInput, { backgroundColor: C.field, color: C.text, flex: 1.4 }]} value={String(r.pricePerHour)} onChangeText={(t) => { const rr = [...rules]; rr[i].pricePerHour = Number(t) || 0; setRules(rr); }} placeholder="Giá/giờ" placeholderTextColor={C.sub} keyboardType="numeric" />
                </View>
              </View>
            ))}
            <TouchableOpacity onPress={addRule} style={{ paddingVertical: 8 }}><Text style={{ color: C.accent, fontWeight: "700" }}>+ Thêm khung giá</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.save, { backgroundColor: C.accent, marginTop: 8 }]} onPress={save}><Text style={{ color: "#0a0e1a", fontWeight: "800" }}>Lưu sân</Text></TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </Card>
  );
}

function Card({ C, title, children }: any) {
  return <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}><Text style={{ color: C.text, fontWeight: "800", marginBottom: 10 }}>{title}</Text>{children}</View>;
}
function Field({ C, label, v, set, kb, multiline, flex }: any) {
  return (
    <View style={{ marginBottom: 10, flex: flex ? 1 : undefined }}>
      <Text style={{ color: C.sub, fontSize: 13, marginBottom: 6 }}>{label}</Text>
      <TextInput style={{ backgroundColor: C.field, color: C.text, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, height: multiline ? 76 : undefined, textAlignVertical: multiline ? "top" : "center" }} value={v} onChangeText={set} keyboardType={kb} multiline={multiline} placeholderTextColor={C.sub} />
    </View>
  );
}
const styles = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 14 },
  img: { width: 100, height: 72, borderRadius: 10 },
  imgDel: { position: "absolute", top: 4, right: 4, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 999, padding: 3 },
  imgAdd: { width: 100, height: 72, borderRadius: 10, borderWidth: 1, borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  hourRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  timeInput: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 14, width: 68, textAlign: "center" },
  save: { paddingVertical: 14, borderRadius: 12, alignItems: "center", marginBottom: 16 },
  courtRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  addCourt: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderStyle: "dashed", borderRadius: 10, paddingVertical: 10, marginTop: 6 },
  modalWrap: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" },
  modal: { padding: 16, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "90%" },
  rule: { borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 8 },
  ruleInput: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },
});
