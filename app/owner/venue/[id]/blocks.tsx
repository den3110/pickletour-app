// Khoá sân / bảo trì
import React, { useMemo, useState } from "react";
import { View, ScrollView, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { Text } from "@/components/ui/i18nText";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { useGetVenueQuery } from "@/slices/venuesApiSlice";
import { useListBlocksQuery, useCreateBlockMutation, useDeleteBlockMutation } from "@/slices/venueOwnerApiSlice";
import { pal, toDateInput, dLabel, tLabel } from "@/utils/courtFormat";

export default function BlocksScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const C = useMemo(() => pal(!!theme.dark), [theme.dark]);
  const { data: venue } = useGetVenueQuery(id, { skip: !id });
  const { data: blocks, isLoading } = useListBlocksQuery({ venueId: id, from: toDateInput() });
  const [create, { isLoading: creating }] = useCreateBlockMutation();
  const [remove] = useDeleteBlockMutation();

  const [date, setDate] = useState(toDateInput());
  const [start, setStart] = useState("06:00");
  const [end, setEnd] = useState("22:00");
  const [courtId, setCourtId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const courts = venue?.courts || [];

  const submit = async () => {
    try {
      await create({ venueId: id, courtId, date, start, end, reason: reason.trim() }).unwrap();
      setReason("");
      Alert.alert("Đã khoá", "Khung giờ này sẽ không nhận đặt sân.");
    } catch (e: any) {
      Alert.alert("Lỗi", e?.data?.message || "Không tạo được.");
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{ title: "Khoá sân / bảo trì" }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
          <Text style={{ color: C.text, fontWeight: "800", marginBottom: 10 }}>Thêm khoá</Text>
          <Row C={C} label="Ngày (YYYY-MM-DD)"><TextInput style={[styles.input, { backgroundColor: C.field, color: C.text }]} value={date} onChangeText={setDate} placeholderTextColor={C.sub} /></Row>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Row C={C} label="Từ" flex><TextInput style={[styles.input, { backgroundColor: C.field, color: C.text }]} value={start} onChangeText={setStart} placeholder="HH:MM" placeholderTextColor={C.sub} /></Row>
            <Row C={C} label="Đến" flex><TextInput style={[styles.input, { backgroundColor: C.field, color: C.text }]} value={end} onChangeText={setEnd} placeholder="HH:MM" placeholderTextColor={C.sub} /></Row>
          </View>
          <Text style={{ color: C.sub, fontSize: 13, marginBottom: 6 }}>Sân áp dụng</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            <Chip C={C} on={!courtId} label="Toàn bộ" onPress={() => setCourtId(null)} />
            {courts.map((c: any) => <Chip key={c._id} C={C} on={courtId === c._id} label={c.name} onPress={() => setCourtId(c._id)} />)}
          </View>
          <TextInput style={[styles.input, { backgroundColor: C.field, color: C.text }]} value={reason} onChangeText={setReason} placeholder="Lý do (vd: bảo trì mặt sân)" placeholderTextColor={C.sub} />
          <TouchableOpacity style={[styles.btn, { backgroundColor: C.accent, opacity: creating ? 0.6 : 1 }]} disabled={creating} onPress={submit}>
            <Text style={{ color: C.onAccent, fontWeight: "800" }}>{creating ? "Đang lưu…" : "Khoá khung giờ"}</Text>
          </TouchableOpacity>
        </View>

        <Text style={{ color: C.sub, fontWeight: "800", fontSize: 11.5, letterSpacing: 0.8, marginBottom: 8 }}>ĐANG KHOÁ</Text>
        {isLoading ? <ActivityIndicator color={C.accent} /> : (blocks || []).length === 0 ? (
          <Text style={{ color: C.sub }}>Không có khoá nào sắp tới.</Text>
        ) : (
          (blocks || []).map((b: any) => (
            <View key={b._id} style={[styles.item, { backgroundColor: C.card, borderColor: C.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontWeight: "700" }}>{dLabel(b.startAt)} · {tLabel(b.startAt)}–{tLabel(b.endAt)}</Text>
                <Text style={{ color: C.sub, fontSize: 12 }}>{b.court?.name || "Toàn bộ sân"}{b.reason ? ` · ${b.reason}` : ""}</Text>
              </View>
              <TouchableOpacity onPress={() => Alert.alert("Bỏ khoá?", "", [{ text: "Không" }, { text: "Bỏ khoá", style: "destructive", onPress: () => remove({ venueId: id, blockId: b._id }) }])}>
                <Ionicons name="trash-outline" size={20} color="#ef4444" />
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function Row({ C, label, children, flex }: any) {
  return <View style={{ marginBottom: 10, flex: flex ? 1 : undefined }}><Text style={{ color: C.sub, fontSize: 13, marginBottom: 6 }}>{label}</Text>{children}</View>;
}
function Chip({ C, on, label, onPress }: any) {
  return <TouchableOpacity onPress={onPress} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: on ? C.accent : C.field }}><Text style={{ color: on ? C.onAccent : C.text, fontWeight: "700", fontSize: 12 }}>{label}</Text></TouchableOpacity>;
}
const styles = StyleSheet.create({
  card: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, padding: 16, marginBottom: 16 },
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  btn: { paddingVertical: 14, borderRadius: 16, alignItems: "center", marginTop: 12 },
  item: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 14, marginBottom: 10 },
});
