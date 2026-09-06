// app/owner/index.tsx — Trang chủ chủ sân: tổng quan + danh sách cụm sân
import React, { useMemo } from "react";
import { View, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator, Image } from "react-native";
import { Text } from "@/components/ui/i18nText";
import { Ionicons } from "@expo/vector-icons";
import { Stack, router } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { useSelector } from "react-redux";
import { useMyVenuesOverviewQuery } from "@/slices/venueOwnerApiSlice";
import { useGetMyOwnerRequestQuery } from "@/slices/courtOwnerApiSlice";
import { fmtVND, pal } from "@/utils/courtFormat";

const isOwnerRole = (u: any) =>
  u && (u.role === "courtOwner" || u.role === "admin" || u.isAdmin || u.isSuperUser);

export default function OwnerHomeScreen() {
  const theme = useTheme();
  const C = useMemo(() => pal(!!theme.dark), [theme.dark]);
  const me = useSelector((s: any) => s.auth?.userInfo);
  const owner = isOwnerRole(me);

  const { data: req } = useGetMyOwnerRequestQuery(undefined, { skip: !me || owner });
  const { data, isLoading, isFetching, refetch } = useMyVenuesOverviewQuery(undefined, { skip: !owner });

  if (!me) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Stack.Screen options={{ title: "Quản lý sân" }} />
        <View style={styles.center}>
          <Text style={{ color: C.sub, marginBottom: 12 }}>Đăng nhập để tiếp tục.</Text>
          <TouchableOpacity style={[styles.btn, { backgroundColor: C.accent }]} onPress={() => router.push("/login")}>
            <Text style={styles.btnDark}>Đăng nhập</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Chưa là chủ sân → mời đăng ký
  if (!owner) {
    const pending = req?.request?.status === "pending";
    const rejected = req?.request?.status === "rejected";
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Stack.Screen options={{ title: "Quản lý sân" }} />
        <View style={styles.center}>
          <Ionicons name="business-outline" size={56} color={C.accent} />
          <Text style={{ color: C.text, fontSize: 18, fontWeight: "800", marginTop: 14, textAlign: "center" }}>
            Trở thành chủ sân trên PickleTour
          </Text>
          <Text style={{ color: C.sub, textAlign: "center", marginTop: 8, lineHeight: 20 }}>
            Đăng sân, nhận đặt sân trực tuyến, quản lý lịch & doanh thu, duyệt thanh toán và check-in bằng QR.
          </Text>
          {pending ? (
            <View style={[styles.badge, { backgroundColor: "rgba(245,158,11,0.15)", marginTop: 18 }]}>
              <Text style={{ color: "#f59e0b", fontWeight: "700" }}>Yêu cầu đang chờ admin duyệt…</Text>
            </View>
          ) : (
            <TouchableOpacity style={[styles.btn, { backgroundColor: C.accent, marginTop: 18 }]} onPress={() => router.push("/owner/register")}>
              <Text style={styles.btnDark}>{rejected ? "Gửi lại yêu cầu" : "Đăng ký làm chủ sân"}</Text>
            </TouchableOpacity>
          )}
          {rejected && !!req?.request?.rejectReason && (
            <Text style={{ color: "#ef4444", fontSize: 13, marginTop: 10, textAlign: "center" }}>
              Bị từ chối: {req.request.rejectReason}
            </Text>
          )}
        </View>
      </View>
    );
  }

  const totals = data?.totals || { awaiting: 0, todayCount: 0, todayRevenue: 0 };
  const venues = data?.venues || [];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen
        options={{
          title: "Quản lý sân",
          headerRight: () => (
            <TouchableOpacity onPress={() => router.push("/owner/scan")} hitSlop={8}>
              <Ionicons name="qr-code-outline" size={22} color={C.accent} />
            </TouchableOpacity>
          ),
        }}
      />
      {isLoading ? (
        <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} />}
        >
          {/* Thống kê hôm nay */}
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
            <StatCard C={C} icon="calendar" label="Lượt hôm nay" value={String(totals.todayCount)} color="#6366f1" />
            <StatCard C={C} icon="cash" label="Thu hôm nay" value={fmtVND(totals.todayRevenue)} color="#22c55e" />
            <StatCard C={C} icon="hourglass" label="Chờ duyệt" value={String(totals.awaiting)} color="#f59e0b" />
          </View>

          <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
            <TouchableOpacity style={[styles.action, { backgroundColor: C.accent }]} onPress={() => router.push("/owner/scan")}>
              <Ionicons name="qr-code" size={20} color="#0a0e1a" />
              <Text style={styles.btnDark}>Quét vé QR</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.action, { borderWidth: 1, borderColor: C.accent }]} onPress={() => router.push("/owner/venue/new")}>
              <Ionicons name="add-circle-outline" size={20} color={C.accent} />
              <Text style={{ color: C.accent, fontWeight: "800" }}>Tạo cụm sân</Text>
            </TouchableOpacity>
          </View>

          <Text style={{ color: C.sub, fontWeight: "800", fontSize: 12, letterSpacing: 0.5, marginBottom: 8 }}>
            CỤM SÂN CỦA TÔI ({venues.length})
          </Text>
          {venues.length === 0 ? (
            <Text style={{ color: C.sub }}>Chưa có cụm sân nào. Bấm "Tạo cụm sân" để bắt đầu.</Text>
          ) : (
            venues.map((v: any) => (
              <TouchableOpacity
                key={v._id}
                activeOpacity={0.85}
                onPress={() => router.push({ pathname: "/owner/venue/[id]", params: { id: String(v._id) } })}
                style={[styles.venue, { backgroundColor: C.card, borderColor: C.border }]}
              >
                {v.images?.[0] ? (
                  <Image source={{ uri: v.images[0] }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, { backgroundColor: C.field, alignItems: "center", justifyContent: "center" }]}>
                    <Ionicons name="tennisball-outline" size={26} color={C.sub} />
                  </View>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: C.text, fontWeight: "800", fontSize: 15 }} numberOfLines={1}>{v.name}</Text>
                  <Text style={{ color: C.sub, fontSize: 12 }} numberOfLines={1}>{v.province || v.address || ""}</Text>
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                    <Text style={{ color: C.sub, fontSize: 12 }}>Hôm nay: {v.todayCount}</Text>
                    <Text style={{ color: "#22c55e", fontSize: 12 }}>{fmtVND(v.todayRevenue)}</Text>
                    {v.awaiting > 0 && (
                      <View style={[styles.badge, { backgroundColor: "rgba(245,158,11,0.18)" }]}>
                        <Text style={{ color: "#f59e0b", fontSize: 11, fontWeight: "700" }}>{v.awaiting} bill chờ</Text>
                      </View>
                    )}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={C.sub} />
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

function StatCard({ C, icon, label, value, color }: any) {
  return (
    <View style={[styles.stat, { backgroundColor: C.card, borderColor: C.border }]}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={{ color: C.text, fontWeight: "900", fontSize: 15, marginTop: 4 }} numberOfLines={1}>{value}</Text>
      <Text style={{ color: C.sub, fontSize: 11 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 },
  btn: { paddingHorizontal: 22, paddingVertical: 13, borderRadius: 12 },
  btnDark: { color: "#0a0e1a", fontWeight: "800" },
  stat: { flex: 1, borderRadius: 14, borderWidth: 1, padding: 12, alignItems: "flex-start" },
  action: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 13, borderRadius: 12 },
  venue: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1, padding: 10, marginBottom: 10 },
  thumb: { width: 56, height: 56, borderRadius: 10 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
});
