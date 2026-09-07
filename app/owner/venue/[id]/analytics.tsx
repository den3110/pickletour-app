// Phân tích lấp đầy + doanh thu gộp
import React, { useMemo, useState } from "react";
import { View, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { Text } from "@/components/ui/i18nText";
import { Stack, useLocalSearchParams } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { useGetAnalyticsQuery } from "@/slices/venueOwnerApiSlice";
import { fmtVND, pal, toDateInput, addDays } from "@/utils/courtFormat";

const RANGES = [{ key: "7d", label: "7 ngày", d: 6 }, { key: "30d", label: "30 ngày", d: 29 }];

export default function AnalyticsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const C = useMemo(() => pal(!!theme.dark), [theme.dark]);
  const [range, setRange] = useState("7d");
  const today = toDateInput();
  const from = addDays(today, -(RANGES.find((r) => r.key === range)?.d || 6));
  const { data, isLoading } = useGetAnalyticsQuery({ venueId: id, from, to: today }, { skip: !id });

  const maxHour = data ? Math.max(1, ...data.byHour) : 1;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{ title: "Phân tích" }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
          {RANGES.map((r) => (
            <TouchableOpacity key={r.key} onPress={() => setRange(r.key)} style={[styles.seg, { backgroundColor: range === r.key ? C.accent : C.card, borderColor: range === r.key ? C.accent : C.border }]}>
              <Text style={{ color: range === r.key ? C.onAccent : C.text, fontWeight: "700" }}>{r.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {isLoading || !data ? <ActivityIndicator color={C.accent} style={{ marginTop: 30 }} /> : (
          <>
            {/* Tỉ lệ lấp đầy */}
            <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
              <Text style={{ color: C.sub, fontSize: 13 }}>Tỉ lệ lấp đầy sân</Text>
              <Text style={{ color: C.accent, fontWeight: "900", fontSize: 34 }}>{data.utilization}%</Text>
              <Text style={{ color: C.sub, fontSize: 12 }}>{data.bookedHours}h đã đặt / {data.availableHours}h mở cửa · {data.courtsCount} sân</Text>
              <View style={[styles.bar, { backgroundColor: C.field }]}>
                <View style={{ width: `${Math.min(100, data.utilization)}%`, height: "100%", backgroundColor: C.accent, borderRadius: 6 }} />
              </View>
            </View>

            {/* Doanh thu gộp */}
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
              <Stat C={C} label="Tiền sân" value={fmtVND(data.revenue.courtPaid)} color="#22c55e" />
              <Stat C={C} label="Bán hàng" value={fmtVND(data.revenue.salesTotal)} color="#6366f1" />
              <Stat C={C} label="Tổng thu" value={fmtVND(data.revenue.total)} color={C.accent} />
            </View>

            {/* Giờ cao điểm */}
            <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
              <Text style={{ color: C.text, fontWeight: "800", marginBottom: 4 }}>Giờ cao điểm</Text>
              <Text style={{ color: C.sub, fontSize: 12, marginBottom: 10 }}>Nhiều lượt đặt nhất lúc {String(data.peakHour).padStart(2, "0")}:00</Text>
              <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 2, height: 90 }}>
                {data.byHour.map((v: number, h: number) => (
                  <View key={h} style={{ flex: 1, alignItems: "center" }}>
                    <View style={{ width: "70%", height: Math.max(2, (v / maxHour) * 80), backgroundColor: h === data.peakHour ? C.accent : C.field, borderRadius: 2 }} />
                  </View>
                ))}
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
                <Text style={{ color: C.sub, fontSize: 10 }}>0h</Text>
                <Text style={{ color: C.sub, fontSize: 10 }}>12h</Text>
                <Text style={{ color: C.sub, fontSize: 10 }}>23h</Text>
              </View>
            </View>

            {/* Theo sân */}
            <Text style={{ color: C.sub, fontWeight: "800", fontSize: 11.5, letterSpacing: 0.8, marginBottom: 8 }}>GIỜ ĐẶT THEO SÂN</Text>
            {data.byCourt.map((c: any) => (
              <View key={c.courtId} style={[styles.courtRow, { backgroundColor: C.card, borderColor: C.border }]}>
                <Text style={{ color: C.text, fontWeight: "700", flex: 1 }}>{c.courtName}</Text>
                <Text style={{ color: C.sub, fontSize: 12, marginRight: 10 }}>{c.count} lượt</Text>
                <Text style={{ color: C.accent, fontWeight: "800" }}>{c.bookedHours}h</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}
function Stat({ C, label, value, color }: any) {
  return <View style={[styles.stat, { backgroundColor: C.card, borderColor: C.border }]}><Text style={{ color: C.sub, fontSize: 11 }}>{label}</Text><Text style={{ color, fontWeight: "800", fontSize: 14, marginTop: 4 }} numberOfLines={1}>{value}</Text></View>;
}
const styles = StyleSheet.create({
  seg: { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1, alignItems: "center" },
  card: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, padding: 16, marginBottom: 12 },
  bar: { height: 12, borderRadius: 6, overflow: "hidden", marginTop: 10 },
  stat: { flex: 1, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 14 },
  courtRow: { flexDirection: "row", alignItems: "center", borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14, marginBottom: 8 },
});
