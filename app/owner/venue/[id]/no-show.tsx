// app/owner/venue/[id]/no-show.tsx — Báo cáo khách bỏ hẹn (cho chủ sân)
import React, { useMemo } from "react";
import { View, FlatList, StyleSheet, RefreshControl, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text } from "@/components/ui/i18nText";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { useGetNoShowReportQuery } from "@/slices/bookingsApiSlice";
import { fmtVND, pal, dLabel, toDateInput, addDays } from "@/utils/courtFormat";
import { Stat, Empty, shadow, R, SP } from "@/components/courts/ui";

export default function NoShowReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const C = useMemo(() => pal(!!theme.dark), [theme.dark]);

  // Mặc định 90 ngày gần nhất
  const today = toDateInput();
  const from = addDays(today, -90);
  const { data, isLoading, isFetching, refetch } = useGetNoShowReportQuery({ venueId: id, from, to: today }, { skip: !id });

  const total = data?.total || 0;
  const uniqueCustomers = data?.uniqueCustomers || 0;
  const customers: any[] = data?.customers || [];

  const renderRow = ({ item: c }: any) => (
    <View style={[styles.row, { backgroundColor: C.card, borderColor: C.border }, shadow(C.dark, 1)]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: C.text, fontWeight: "800", fontSize: 14.5 }} numberOfLines={1}>{c.name || "Khách vãng lai"}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 }}>
          <Ionicons name="call-outline" size={12} color={C.muted} />
          <Text style={{ color: C.sub, fontSize: 12.5 }} numberOfLines={1}>{c.phone || "—"}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Ionicons name="cash-outline" size={12} color={C.muted} />
            <Text style={{ color: C.warning, fontSize: 12, fontWeight: "700" }}>Thất thu {fmtVND(c.lostRevenue)}</Text>
          </View>
          {!!c.lastAt && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name="time-outline" size={12} color={C.muted} />
              <Text style={{ color: C.sub, fontSize: 12 }}>Gần nhất {dLabel(c.lastAt)}</Text>
            </View>
          )}
        </View>
      </View>
      <View style={[styles.countBadge, { backgroundColor: `${C.danger}1f` }]}>
        <Text style={{ color: C.danger, fontWeight: "900", fontSize: 18, letterSpacing: -0.5 }}>{c.count}</Text>
        <Text style={{ color: C.danger, fontSize: 10, fontWeight: "700" }}>lần</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{ title: "Khách bỏ hẹn" }} />
      {isLoading ? (
        <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={customers}
          keyExtractor={(c, i) => String(c.userId || c.phone || i)}
          contentContainerStyle={{ padding: SP.lg, paddingBottom: 48 }}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} />}
          ListHeaderComponent={
            <View style={{ flexDirection: "row", gap: 10, marginBottom: SP.lg }}>
              <Stat C={C} icon="close-circle-outline" label="Tổng lượt bỏ hẹn" value={String(total)} color={C.danger} />
              <Stat C={C} icon="people-outline" label="Số khách" value={String(uniqueCustomers)} />
            </View>
          }
          ListEmptyComponent={<Empty C={C} icon="happy-outline" title="Chưa có khách nào bỏ hẹn. Tuyệt vời!" subtitle="Báo cáo dựa trên 90 ngày gần nhất." />}
          renderItem={renderRow}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: R.md, borderWidth: StyleSheet.hairlineWidth, padding: 14, marginBottom: SP.md },
  countBadge: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center" },
});
