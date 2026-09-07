// Gói giờ / thẻ tháng (chủ sân) + kích hoạt lượt mua
import React, { useMemo, useState } from "react";
import { View, ScrollView, TextInput, TouchableOpacity, StyleSheet, Alert, Switch, Modal, ActivityIndicator } from "react-native";
import { Text } from "@/components/ui/i18nText";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
import { useTheme } from "@react-navigation/native";
import {
  useListPackagesOwnerQuery, useCreatePackageMutation, useUpdatePackageMutation, useDeletePackageMutation,
  useListVenuePurchasesQuery, useActivatePurchaseMutation,
} from "@/slices/venueOwnerApiSlice";
import { fmtVND, pal, dtLabel } from "@/utils/courtFormat";

export default function OwnerPackagesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const C = useMemo(() => pal(!!theme.dark), [theme.dark]);
  const { data: packages, isLoading } = useListPackagesOwnerQuery(id, { skip: !id });
  const { data: purchases } = useListVenuePurchasesQuery({ venueId: id }, { skip: !id });
  const [create, { isLoading: creating }] = useCreatePackageMutation();
  const [update] = useUpdatePackageMutation();
  const [remove] = useDeletePackageMutation();
  const [activate] = useActivatePurchaseMutation();
  const [open, setOpen] = useState(false);

  const [name, setName] = useState("");
  const [type, setType] = useState<"credits" | "period">("credits");
  const [hours, setHours] = useState("");
  const [validDays, setValidDays] = useState("30");
  const [price, setPrice] = useState("");

  const pending = (purchases || []).filter((p: any) => p.status === "pending");

  const submit = async () => {
    if (!name.trim() || !Number(price)) return Alert.alert("Thiếu tên/giá");
    try {
      await create({ venueId: id, name: name.trim(), type, hours: Number(hours) || 0, validDays: Number(validDays) || 30, price: Number(price) }).unwrap();
      setName(""); setHours(""); setPrice(""); setOpen(false);
    } catch (e: any) { Alert.alert("Lỗi", e?.data?.message || "Lưu thất bại"); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{ title: "Gói giờ / thẻ tháng", headerRight: () => (
        <TouchableOpacity onPress={() => setOpen(true)} hitSlop={8}><Ionicons name="add-circle" size={24} color={C.accent} /></TouchableOpacity>
      ) }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {pending.length > 0 && (
          <>
            <Text style={{ color: "#f59e0b", fontWeight: "800", fontSize: 11.5, letterSpacing: 0.8, marginBottom: 8 }}>CHỜ KÍCH HOẠT ({pending.length})</Text>
            {pending.map((p: any) => (
              <View key={p._id} style={[styles.item, { backgroundColor: C.card, borderColor: "#f59e0b" }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text, fontWeight: "700" }}>{p.user?.name || "Khách"} · {p.packageName}</Text>
                  <Text style={{ color: C.sub, fontSize: 12 }}>{fmtVND(p.price)}{p.user?.phone ? ` · ${p.user.phone}` : ""} · {dtLabel(p.createdAt)}</Text>
                </View>
                <TouchableOpacity style={[styles.actBtn, { backgroundColor: "#22c55e" }]} onPress={() => Alert.alert("Kích hoạt gói", "Xác nhận đã nhận tiền?", [{ text: "Không" }, { text: "Kích hoạt", onPress: () => activate({ venueId: id, purchaseId: p._id }) }])}>
                  <Text style={{ color: C.onAccent, fontWeight: "800", fontSize: 12 }}>Kích hoạt</Text>
                </TouchableOpacity>
              </View>
            ))}
            <View style={{ height: 12 }} />
          </>
        )}

        <Text style={{ color: C.sub, fontWeight: "800", fontSize: 11.5, letterSpacing: 0.8, marginBottom: 8 }}>GÓI ĐANG BÁN</Text>
        {isLoading ? <ActivityIndicator color={C.accent} /> : (packages || []).length === 0 ? (
          <Text style={{ color: C.sub }}>Chưa có gói nào. Bấm + để tạo.</Text>
        ) : (packages || []).map((p: any) => (
          <View key={p._id} style={[styles.item, { backgroundColor: C.card, borderColor: C.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontWeight: "800" }}>{p.name}</Text>
              <Text style={{ color: C.sub, fontSize: 12 }}>
                {p.type === "credits" ? `${p.hours} giờ` : "Không giới hạn"} · hạn {p.validDays} ngày · <Text style={{ color: C.accent, fontWeight: "700" }}>{fmtVND(p.price)}</Text>
              </Text>
            </View>
            <Switch value={p.active} onValueChange={(v) => update({ venueId: id, packageId: p._id, active: v })} trackColor={{ true: C.accent, false: "#94a3b8" }} thumbColor="#fff" />
            <TouchableOpacity onPress={() => Alert.alert("Xoá gói?", p.name, [{ text: "Không" }, { text: "Xoá", style: "destructive", onPress: () => remove({ venueId: id, packageId: p._id }) }])}><Ionicons name="trash-outline" size={20} color="#ef4444" /></TouchableOpacity>
          </View>
        ))}
      </ScrollView>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalWrap}>
          <View style={[styles.modal, { backgroundColor: C.card }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <Text style={{ color: C.text, fontWeight: "800", fontSize: 16 }}>Tạo gói</Text>
              <TouchableOpacity onPress={() => setOpen(false)}><Ionicons name="close" size={22} color={C.sub} /></TouchableOpacity>
            </View>
            <TextInput style={[styles.input, { backgroundColor: C.field, color: C.text }]} value={name} onChangeText={setName} placeholder="Tên gói (vd: Gói 10 giờ)" placeholderTextColor={C.sub} />
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
              <TouchableOpacity style={[styles.seg, { backgroundColor: type === "credits" ? C.accent : C.field }]} onPress={() => setType("credits")}><Text style={{ color: type === "credits" ? C.onAccent : C.text, fontWeight: "700" }}>Gói giờ</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.seg, { backgroundColor: type === "period" ? C.accent : C.field }]} onPress={() => setType("period")}><Text style={{ color: type === "period" ? C.onAccent : C.text, fontWeight: "700" }}>Thẻ tháng</Text></TouchableOpacity>
            </View>
            {type === "credits" && <TextInput style={[styles.input, { backgroundColor: C.field, color: C.text }]} value={hours} onChangeText={setHours} keyboardType="numeric" placeholder="Số giờ" placeholderTextColor={C.sub} />}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TextInput style={[styles.input, { backgroundColor: C.field, color: C.text, flex: 1 }]} value={validDays} onChangeText={setValidDays} keyboardType="numeric" placeholder="Hạn (ngày)" placeholderTextColor={C.sub} />
              <TextInput style={[styles.input, { backgroundColor: C.field, color: C.text, flex: 1 }]} value={price} onChangeText={setPrice} keyboardType="numeric" placeholder="Giá (đ)" placeholderTextColor={C.sub} />
            </View>
            <TouchableOpacity style={[styles.mBtn, { backgroundColor: C.accent, opacity: creating ? 0.6 : 1 }]} disabled={creating} onPress={submit}><Text style={{ color: C.onAccent, fontWeight: "800" }}>Tạo gói</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  item: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 14, marginBottom: 10 },
  actBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  modalWrap: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(2,6,23,0.6)" },
  modal: { padding: 20, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingBottom: 36 },
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 10 },
  seg: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: "center" },
  mBtn: { paddingVertical: 14, borderRadius: 16, alignItems: "center", marginTop: 6 },
});
