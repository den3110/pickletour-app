// Mã giảm giá
import React, { useMemo, useState } from "react";
import { View, ScrollView, TextInput, TouchableOpacity, StyleSheet, Alert, Switch, ActivityIndicator } from "react-native";
import { Text } from "@/components/ui/i18nText";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { useListPromosQuery, useCreatePromoMutation, useUpdatePromoMutation, useDeletePromoMutation } from "@/slices/venueOwnerApiSlice";
import { fmtVND, pal } from "@/utils/courtFormat";

export default function PromosScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const C = useMemo(() => pal(!!theme.dark), [theme.dark]);
  const { data: promos, isLoading } = useListPromosQuery(id, { skip: !id });
  const [create, { isLoading: creating }] = useCreatePromoMutation();
  const [update] = useUpdatePromoMutation();
  const [remove] = useDeletePromoMutation();

  const [code, setCode] = useState("");
  const [type, setType] = useState<"percent" | "amount">("percent");
  const [value, setValue] = useState("");
  const [minTotal, setMinTotal] = useState("");
  const [maxDiscount, setMaxDiscount] = useState("");
  const [usageLimit, setUsageLimit] = useState("");

  const submit = async () => {
    if (!code.trim() || !Number(value)) return Alert.alert("Thiếu thông tin", "Nhập mã và giá trị giảm.");
    try {
      await create({ venueId: id, code: code.trim().toUpperCase(), type, value: Number(value), minTotal: Number(minTotal) || 0, maxDiscount: Number(maxDiscount) || 0, usageLimit: Number(usageLimit) || 0 }).unwrap();
      setCode(""); setValue(""); setMinTotal(""); setMaxDiscount(""); setUsageLimit("");
    } catch (e: any) {
      Alert.alert("Lỗi", e?.data?.message || "Không tạo được mã.");
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{ title: "Mã giảm giá" }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
          <Text style={{ color: C.text, fontWeight: "800", marginBottom: 10 }}>Tạo mã mới</Text>
          <TextInput style={[styles.input, { backgroundColor: C.field, color: C.text }]} value={code} onChangeText={(t) => setCode(t.toUpperCase())} placeholder="MÃ (vd: SALE10)" placeholderTextColor={C.sub} autoCapitalize="characters" />
          <View style={{ flexDirection: "row", gap: 8, marginVertical: 10 }}>
            <TouchableOpacity style={[styles.seg, { backgroundColor: type === "percent" ? C.accent : C.field }]} onPress={() => setType("percent")}><Text style={{ color: type === "percent" ? C.onAccent : C.text, fontWeight: "700" }}>Giảm %</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.seg, { backgroundColor: type === "amount" ? C.accent : C.field }]} onPress={() => setType("amount")}><Text style={{ color: type === "amount" ? C.onAccent : C.text, fontWeight: "700" }}>Giảm tiền</Text></TouchableOpacity>
          </View>
          <TextInput style={[styles.input, { backgroundColor: C.field, color: C.text }]} value={value} onChangeText={setValue} keyboardType="numeric" placeholder={type === "percent" ? "Phần trăm (0-100)" : "Số tiền (đ)"} placeholderTextColor={C.sub} />
          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            <TextInput style={[styles.input, { backgroundColor: C.field, color: C.text, flex: 1 }]} value={minTotal} onChangeText={setMinTotal} keyboardType="numeric" placeholder="Đơn tối thiểu" placeholderTextColor={C.sub} />
            {type === "percent" && <TextInput style={[styles.input, { backgroundColor: C.field, color: C.text, flex: 1 }]} value={maxDiscount} onChangeText={setMaxDiscount} keyboardType="numeric" placeholder="Giảm tối đa" placeholderTextColor={C.sub} />}
          </View>
          <TextInput style={[styles.input, { backgroundColor: C.field, color: C.text, marginTop: 10 }]} value={usageLimit} onChangeText={setUsageLimit} keyboardType="numeric" placeholder="Giới hạn lượt dùng (0 = không giới hạn)" placeholderTextColor={C.sub} />
          <TouchableOpacity style={[styles.btn, { backgroundColor: C.accent, opacity: creating ? 0.6 : 1 }]} disabled={creating} onPress={submit}>
            <Text style={{ color: C.onAccent, fontWeight: "800" }}>{creating ? "Đang tạo…" : "Tạo mã"}</Text>
          </TouchableOpacity>
        </View>

        {isLoading ? <ActivityIndicator color={C.accent} /> : (promos || []).map((p: any) => (
          <View key={p._id} style={[styles.item, { backgroundColor: C.card, borderColor: C.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontWeight: "800", fontSize: 15 }}>{p.code}</Text>
              <Text style={{ color: C.sub, fontSize: 12 }}>
                {p.type === "percent" ? `Giảm ${p.value}%${p.maxDiscount ? ` (tối đa ${fmtVND(p.maxDiscount)})` : ""}` : `Giảm ${fmtVND(p.value)}`}
                {p.minTotal ? ` · đơn ≥ ${fmtVND(p.minTotal)}` : ""}
                {p.usageLimit ? ` · ${p.usedCount}/${p.usageLimit} lượt` : ` · đã dùng ${p.usedCount}`}
              </Text>
            </View>
            <Switch value={p.active} onValueChange={(v) => update({ venueId: id, promoId: p._id, active: v })} trackColor={{ true: C.accent, false: "#94a3b8" }} thumbColor="#fff" />
            <TouchableOpacity onPress={() => Alert.alert("Xoá mã?", p.code, [{ text: "Không" }, { text: "Xoá", style: "destructive", onPress: () => remove({ venueId: id, promoId: p._id }) }])}>
              <Ionicons name="trash-outline" size={20} color="#ef4444" />
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  card: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, padding: 16, marginBottom: 16 },
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  seg: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: "center" },
  btn: { paddingVertical: 14, borderRadius: 16, alignItems: "center", marginTop: 12 },
  item: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 14, marginBottom: 10 },
});
