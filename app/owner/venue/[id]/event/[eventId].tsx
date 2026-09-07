// app/owner/venue/[id]/event/[eventId].tsx — Chủ sân: người đăng ký + doanh thu + check-in sự kiện
import React, { useMemo } from "react";
import { View, ScrollView, TouchableOpacity, StyleSheet, Alert, RefreshControl, ActivityIndicator, Image, Linking } from "react-native";
import { Text } from "@/components/ui/i18nText";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { useListEventRegistrationsQuery, useUpdateRegistrationMutation, useCheckInEventMutation } from "@/slices/eventsApiSlice";
import { fmtVND, pal, dtLabel } from "@/utils/courtFormat";
import { Card, Chip, SectionHeader, Empty, Hero, shadow, R, SP } from "@/components/courts/ui";

const gLabel: any = { male: "Nam", female: "Nữ", unspecified: "—", other: "Khác" };

export default function EventRegistrationsScreen() {
  const { id, eventId } = useLocalSearchParams<{ id: string; eventId: string }>();
  const theme = useTheme();
  const C = useMemo(() => pal(!!theme.dark), [theme.dark]);
  const { data, isLoading, isFetching, refetch } = useListEventRegistrationsQuery({ venueId: id, eventId }, { skip: !id || !eventId });
  const [updateReg] = useUpdateRegistrationMutation();
  const [checkIn] = useCheckInEventMutation();

  const ev = data?.event;
  const st = data?.stats || {};
  const regs: any[] = data?.registrations || [];
  const active = regs.filter((r) => r.status !== "cancelled");

  const run = (fn: () => Promise<any>) => fn().catch((e: any) => Alert.alert("Lỗi", e?.data?.message || "Thất bại"));

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{ title: ev?.title || "Sự kiện" }} />
      {isLoading ? <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} /> : (
        <ScrollView contentContainerStyle={{ padding: SP.lg, paddingBottom: 48 }} refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} />}>
          {ev && (
            <Hero C={C}>
              <Text style={{ color: "#fff", fontWeight: "900", fontSize: 19 }} numberOfLines={2}>{ev.title}</Text>
              <Text style={{ color: "rgba(255,255,255,0.78)", fontSize: 13, marginTop: 3 }}>{dtLabel(ev.startAt)}</Text>
              <View style={styles.statRow}>
                <St label="Đăng ký" value={`${st.registered || 0}/${ev.capacity}`} />
                <View style={styles.div} />
                <St label="Đã thu" value={fmtVND(st.revenue || 0)} />
                <View style={styles.div} />
                <St label="Check-in" value={String(st.checkedIn || 0)} />
              </View>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                <Chip C={C} color="#22c1d6" label={`${st.byGender?.male || 0} nam`} small />
                <Chip C={C} color="#ec4899" label={`${st.byGender?.female || 0} nữ`} small />
                <Chip C={C} color={C.gold} label={`${st.paidCount || 0} đã trả`} small />
              </View>
            </Hero>
          )}

          <SectionHeader C={C} title={`Người đăng ký · ${active.length}`} />
          {active.length === 0 ? (
            <Card C={C} pad={0}><Empty C={C} icon="people-outline" title="Chưa có ai đăng ký" /></Card>
          ) : (
            active.map((r) => {
              const paid = r.payment?.status === "Paid";
              const checkedIn = !!r.ticket?.checkedInAt;
              return (
                <Card key={r._id} C={C} style={{ marginBottom: SP.md }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: C.text, fontWeight: "800" }} numberOfLines={1}>{r.name || r.user?.name || "Khách"}</Text>
                      <Text style={{ color: C.sub, fontSize: 12.5, marginTop: 2 }} numberOfLines={1}>
                        {gLabel[r.gender] || "—"}{r.skillPoint ? ` · trình ${r.skillPoint}` : ""}{r.phone || r.user?.phone ? ` · ${r.phone || r.user?.phone}` : ""}
                      </Text>
                    </View>
                    <Chip C={C} color={paid ? C.success : C.warning} label={paid ? "Đã thu" : "Chưa thu"} small />
                    {checkedIn && <Ionicons name="checkmark-circle" size={18} color={C.success} />}
                  </View>
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    {r.payment?.proofUrl && (
                      <TouchableOpacity onPress={() => Linking.openURL(r.payment.proofUrl)} style={[styles.act, { backgroundColor: C.field }]}>
                        <Ionicons name="receipt-outline" size={14} color={C.info} /><Text style={{ color: C.info, fontWeight: "700", fontSize: 12 }}>Xem bill</Text>
                      </TouchableOpacity>
                    )}
                    {!paid && (
                      <TouchableOpacity onPress={() => run(() => updateReg({ venueId: id, eventId, regId: r._id, markPaid: true }).unwrap())} style={[styles.act, { backgroundColor: "rgba(34,197,94,0.14)" }]}>
                        <Ionicons name="cash-outline" size={14} color={C.success} /><Text style={{ color: C.success, fontWeight: "700", fontSize: 12 }}>Đã thu</Text>
                      </TouchableOpacity>
                    )}
                    {!checkedIn && (
                      <TouchableOpacity onPress={() => run(() => checkIn({ token: r.ticket?.token, eventId }).unwrap())} style={[styles.act, { backgroundColor: C.accentSoft }]}>
                        <Ionicons name="checkmark-done" size={14} color={C.accent} /><Text style={{ color: C.accent, fontWeight: "700", fontSize: 12 }}>Check-in</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => Alert.alert("Huỷ đăng ký?", r.name || "", [{ text: "Không" }, { text: "Huỷ", style: "destructive", onPress: () => run(() => updateReg({ venueId: id, eventId, regId: r._id, status: "cancelled" }).unwrap()) }])} style={[styles.act, { backgroundColor: "rgba(239,68,68,0.12)" }]}>
                      <Ionicons name="close" size={14} color={C.danger} />
                    </TouchableOpacity>
                  </View>
                </Card>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

function St({ label, value }: any) {
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }} numberOfLines={1}>{value}</Text>
      <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, marginTop: 2 }}>{label}</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  statRow: { flexDirection: "row", alignItems: "center", marginTop: 16, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.22)" },
  div: { width: StyleSheet.hairlineWidth, height: 28, backgroundColor: "rgba(255,255,255,0.22)" },
  act: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 10 },
});
