// Doanh thu cụm sân
import React, { useMemo, useState } from "react";
import { View, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { Text } from "@/components/ui/i18nText";
import { Stack, useLocalSearchParams } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { useGetVenueRevenueQuery } from "@/slices/bookingsApiSlice";
import { fmtVND, pal, toDateInput, addDays } from "@/utils/courtFormat";

const RANGES = [
  { key: "today", label: "Hôm nay", days: 0 },
  { key: "7d", label: "7 ngày", days: 6 },
  { key: "30d", label: "30 ngày", days: 29 },
];

export default function RevenueScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const C = useMemo(() => pal(!!theme.dark), [theme.dark]);
  const [range, setRange] = useState("7d");

  const today = toDateInput();
  const days = RANGES.find((r) => r.key === range)?.days || 0;
  const from = addDays(today, -days);
  const { data, isLoading } = useGetVenueRevenueQuery({ venueId: id, from, to: today }, { skip: !id });

  const t = data?.totals || {};

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{ title: "Doanh thu" }} />
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
          {RANGES.map((r) => (
            <TouchableOpacity key={r.key} onPress={() => setRange(r.key)} style={[styles.seg, { backgroundColor: range === r.key ? C.accent : C.card, borderColor: range === r.key ? C.accent : C.border }]}>
              <Text style={{ color: range === r.key ? "#0a0e1a" : C.text, fontWeight: "700" }}>{r.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {isLoading ? <ActivityIndicator color={C.accent} style={{ marginTop: 30 }} /> : (
          <>
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
              <Big C={C} label="Đã thu" value={fmtVND(t.paidRevenue)} color="#22c55e" />
              <Big C={C} label="Chưa thu" value={fmtVND(t.unpaidAmount)} color="#f59e0b" />
            </View>
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
              <Small C={C} label="Lượt đặt" value={String(t.activeCount || 0)} />
              <Small C={C} label="Đã thanh toán" value={String(t.paidCount || 0)} />
              <Small C={C} label="Huỷ" value={String(t.cancelledCount || 0)} />
            </View>

            <Text style={{ color: C.sub, fontWeight: "800", fontSize: 12, marginBottom: 8 }}>THEO SÂN</Text>
            {(data?.byCourt || []).length === 0 ? <Text style={{ color: C.sub }}>Chưa có dữ liệu.</Text> : (data?.byCourt || []).map((c: any) => (
              <View key={c.courtId} style={[styles.row, { backgroundColor: C.card, borderColor: C.border }]}>
                <Text style={{ color: C.text, fontWeight: "700", flex: 1 }}>{c.courtName}</Text>
                <Text style={{ color: C.sub, fontSize: 12, marginRight: 10 }}>{c.count} lượt</Text>
                <Text style={{ color: "#22c55e", fontWeight: "800" }}>{fmtVND(c.paid)}</Text>
              </View>
            ))}

            <Text style={{ color: C.sub, fontWeight: "800", fontSize: 12, marginTop: 16, marginBottom: 8 }}>THEO NGÀY</Text>
            {(data?.byDay || []).map((d: any) => (
              <View key={d.date} style={[styles.row, { backgroundColor: C.card, borderColor: C.border }]}>
                <Text style={{ color: C.text, flex: 1 }}>{d.date.split("-").reverse().join("/")}</Text>
                <Text style={{ color: C.sub, fontSize: 12, marginRight: 10 }}>{d.count} lượt</Text>
                <Text style={{ color: "#22c55e", fontWeight: "700" }}>{fmtVND(d.paid)}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}
function Big({ C, label, value, color }: any) {
  return <View style={[styles.big, { backgroundColor: C.card, borderColor: C.border }]}><Text style={{ color: C.sub, fontSize: 12 }}>{label}</Text><Text style={{ color, fontWeight: "900", fontSize: 20, marginTop: 4 }} numberOfLines={1}>{value}</Text></View>;
}
function Small({ C, label, value }: any) {
  return <View style={[styles.small, { backgroundColor: C.card, borderColor: C.border }]}><Text style={{ color: C.text, fontWeight: "800", fontSize: 16 }}>{value}</Text><Text style={{ color: C.sub, fontSize: 11 }}>{label}</Text></View>;
}
const styles = StyleSheet.create({
  seg: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, alignItems: "center" },
  big: { flex: 1, borderRadius: 14, borderWidth: 1, padding: 14 },
  small: { flex: 1, borderRadius: 12, borderWidth: 1, padding: 12, alignItems: "center" },
  row: { flexDirection: "row", alignItems: "center", borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 8 },
});
