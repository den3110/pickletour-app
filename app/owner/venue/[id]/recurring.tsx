// Đặt định kỳ hàng tuần cho khách quen
import React, { useMemo, useState } from "react";
import { View, ScrollView, TextInput, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { Text } from "@/components/ui/i18nText";
import { Stack, useLocalSearchParams } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { useGetVenueQuery } from "@/slices/venuesApiSlice";
import { useCreateRecurringMutation } from "@/slices/venueOwnerApiSlice";
import { pal, toDateInput, WEEKDAYS_SHORT } from "@/utils/courtFormat";

export default function RecurringScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const C = useMemo(() => pal(!!theme.dark), [theme.dark]);
  const { data: venue } = useGetVenueQuery(id, { skip: !id });
  const [create, { isLoading }] = useCreateRecurringMutation();
  const courts = venue?.courts || [];

  const [courtId, setCourtId] = useState<string | null>(null);
  const [weekday, setWeekday] = useState(1);
  const [start, setStart] = useState("18:00");
  const [end, setEnd] = useState("20:00");
  const [dateFrom, setDateFrom] = useState(toDateInput());
  const [weeks, setWeeks] = useState("4");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<any>(null);

  const submit = async () => {
    if (!courtId) return Alert.alert("Chọn sân");
    try {
      const r: any = await create({ venueId: id, courtId, weekday, start, end, dateFrom, weeks: Number(weeks) || 4, customerName: name.trim(), customerPhone: phone.trim() }).unwrap();
      setResult(r);
    } catch (e: any) {
      Alert.alert("Lỗi", e?.data?.message || "Không tạo được.");
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{ title: "Đặt định kỳ" }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
          <Text style={{ color: C.sub, fontSize: 13, marginBottom: 6 }}>Sân</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            {courts.map((c: any) => (
              <TouchableOpacity key={c._id} onPress={() => setCourtId(c._id)} style={[styles.chip, { backgroundColor: courtId === c._id ? C.accent : C.field }]}>
                <Text style={{ color: courtId === c._id ? C.onAccent : C.text, fontWeight: "700", fontSize: 12 }}>{c.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={{ color: C.sub, fontSize: 13, marginBottom: 6 }}>Thứ trong tuần</Text>
          <View style={{ flexDirection: "row", gap: 6, marginBottom: 12 }}>
            {WEEKDAYS_SHORT.map((w, i) => (
              <TouchableOpacity key={i} onPress={() => setWeekday(i)} style={[styles.wd, { backgroundColor: weekday === i ? C.accent : C.field }]}>
                <Text style={{ color: weekday === i ? C.onAccent : C.text, fontWeight: "700", fontSize: 12 }}>{w}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <F C={C} label="Từ giờ" v={start} set={setStart} ph="HH:MM" />
            <F C={C} label="Đến giờ" v={end} set={setEnd} ph="HH:MM" />
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <F C={C} label="Bắt đầu từ" v={dateFrom} set={setDateFrom} ph="YYYY-MM-DD" />
            <F C={C} label="Số tuần" v={weeks} set={setWeeks} kb="numeric" />
          </View>
          <F C={C} label="Tên khách" v={name} set={setName} ph="Khách quen" full />
          <F C={C} label="SĐT" v={phone} set={setPhone} kb="phone-pad" full />
          <TouchableOpacity style={[styles.btn, { backgroundColor: C.accent, opacity: isLoading ? 0.6 : 1 }]} disabled={isLoading} onPress={submit}>
            <Text style={{ color: C.onAccent, fontWeight: "800" }}>{isLoading ? "Đang tạo…" : "Tạo lịch định kỳ"}</Text>
          </TouchableOpacity>
        </View>

        {result && (
          <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={{ color: "#22c55e", fontWeight: "800", marginBottom: 6 }}>Đã tạo {result.createdCount} lượt</Text>
            {result.created?.map((c: any) => <Text key={c.id} style={{ color: C.text, fontSize: 13 }}>✓ {c.date.split("-").reverse().join("/")} · #{c.code}</Text>)}
            {result.skippedCount > 0 && <Text style={{ color: "#f59e0b", marginTop: 8, fontWeight: "700" }}>Bỏ qua {result.skippedCount} tuần:</Text>}
            {result.skipped?.map((s: any, i: number) => <Text key={i} style={{ color: C.sub, fontSize: 13 }}>• {s.date.split("-").reverse().join("/")} — {s.reason}</Text>)}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
function F({ C, label, v, set, ph, kb, full }: any) {
  return (
    <View style={{ marginBottom: 10, flex: full ? undefined : 1 }}>
      <Text style={{ color: C.sub, fontSize: 13, marginBottom: 6 }}>{label}</Text>
      <TextInput style={{ backgroundColor: C.field, color: C.text, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 }} value={v} onChangeText={set} placeholder={ph} placeholderTextColor={C.sub} keyboardType={kb} />
    </View>
  );
}
const styles = StyleSheet.create({
  card: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, padding: 16, marginBottom: 16 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  wd: { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: "center" },
  btn: { paddingVertical: 14, borderRadius: 16, alignItems: "center", marginTop: 6 },
});
