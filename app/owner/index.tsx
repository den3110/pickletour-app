// app/owner/index.tsx — Trang chủ chủ sân: hero tổng quan + cụm sân của tôi
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
import { Hero, Card, Chip, Empty, PrimaryButton, SectionHeader, R, SP } from "@/components/courts/ui";

const isOwnerRole = (u: any) => u && (u.role === "courtOwner" || u.role === "admin" || u.isAdmin || u.isSuperUser);

export default function OwnerHomeScreen() {
  const theme = useTheme();
  const C = useMemo(() => pal(!!theme.dark), [theme.dark]);
  const me = useSelector((s: any) => s.auth?.userInfo);
  const owner = isOwnerRole(me);

  const { data: req } = useGetMyOwnerRequestQuery(undefined, { skip: !me || owner });
  const { data, isLoading, isFetching, refetch } = useMyVenuesOverviewQuery(undefined, { skip: !me });
  const hasVenues = (data?.venues || []).length > 0;

  if (!me) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Stack.Screen options={{ title: "Quản lý sân" }} />
        <Empty C={C} icon="lock-closed-outline" title="Đăng nhập để tiếp tục" action={<PrimaryButton C={C} label="Đăng nhập" onPress={() => router.push("/login")} />} />
      </View>
    );
  }

  if (!owner && !hasVenues) {
    const pending = req?.request?.status === "pending";
    const rejected = req?.request?.status === "rejected";
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Stack.Screen options={{ title: "Quản lý sân" }} />
        <ScrollView contentContainerStyle={{ padding: SP.lg }}>
          <Hero C={C} colors={C.heroGradAlt}>
            <View style={[styles.heroIcon, { backgroundColor: "rgba(255,255,255,0.14)" }]}><Ionicons name="business" size={28} color="#fff" /></View>
            <Text style={styles.heroTitle}>Trở thành chủ sân trên PickleTour</Text>
            <Text style={styles.heroSub}>Đăng sân, nhận đặt sân trực tuyến, quản lý lịch & doanh thu, duyệt thanh toán và check-in bằng QR.</Text>
            <View style={{ marginTop: 18 }}>
              {pending ? (
                <View style={[styles.pendingPill]}>
                  <Ionicons name="time-outline" size={16} color="#fde68a" />
                  <Text style={{ color: "#fde68a", fontWeight: "800" }}>Yêu cầu đang chờ admin duyệt</Text>
                </View>
              ) : (
                <PrimaryButton C={C} icon="arrow-forward" label={rejected ? "Gửi lại yêu cầu" : "Đăng ký làm chủ sân"} onPress={() => router.push("/owner/register")} />
              )}
              {rejected && !!req?.request?.rejectReason && (
                <Text style={{ color: "#fecaca", fontSize: 13, marginTop: 10 }}>Bị từ chối: {req.request.rejectReason}</Text>
              )}
            </View>
          </Hero>
          <View style={{ marginTop: SP.xl, gap: 10 }}>
            {[
              ["calendar-outline", "Nhận đặt sân 24/7", "Khách xem giờ trống, đặt và chuyển khoản qua QR"],
              ["qr-code-outline", "Vé QR & check-in", "Quét vé khách tại sân, chống trùng giờ tự động"],
              ["bar-chart-outline", "Doanh thu & bán hàng", "Theo dõi thu, tồn kho, gói giờ, mã giảm giá"],
            ].map(([ic, t, s]) => (
              <Card key={t as string} C={C} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={[styles.featIcon, { backgroundColor: C.accentSoft }]}><Ionicons name={ic as any} size={20} color={C.accent} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text, fontWeight: "800" }}>{t}</Text>
                  <Text style={{ color: C.sub, fontSize: 12.5, marginTop: 2 }}>{s}</Text>
                </View>
              </Card>
            ))}
          </View>
        </ScrollView>
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
            <TouchableOpacity onPress={() => router.push("/owner/scan")} hitSlop={8} style={[styles.hdrBtn, { backgroundColor: C.accentSoft }]}>
              <Ionicons name="qr-code-outline" size={18} color={C.accent} />
            </TouchableOpacity>
          ),
        }}
      />
      {isLoading ? (
        <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: SP.lg, paddingBottom: 48 }} refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} />}>
          <Hero C={C}>
            <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 12.5, fontWeight: "600", letterSpacing: 0.6 }}>HÔM NAY</Text>
            <Text style={{ color: "#fff", fontWeight: "900", fontSize: 32, letterSpacing: -0.8, marginTop: 4 }}>{fmtVND(totals.todayRevenue)}</Text>
            <Text style={{ color: "rgba(255,255,255,0.72)", fontSize: 13, marginTop: 2 }}>Đã thu từ {totals.todayCount} lượt đặt</Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
              <PrimaryButton C={C} icon="qr-code" label="Quét vé QR" style={{ flex: 1, paddingVertical: 12 }} onPress={() => router.push("/owner/scan")} />
              {owner && (
                <TouchableOpacity activeOpacity={0.85} style={styles.heroGhost} onPress={() => router.push("/owner/venue/new")}>
                  <Ionicons name="add" size={18} color="#fff" />
                  <Text style={{ color: "#fff", fontWeight: "800" }}>Tạo cụm sân</Text>
                </TouchableOpacity>
              )}
            </View>
            {totals.awaiting > 0 && (
              <View style={styles.pendingPill}>
                <Ionicons name="hourglass-outline" size={15} color="#fde68a" />
                <Text style={{ color: "#fde68a", fontWeight: "800", fontSize: 13 }}>{totals.awaiting} bill đang chờ bạn duyệt</Text>
              </View>
            )}
          </Hero>

          <SectionHeader C={C} title={`Cụm sân của tôi · ${venues.length}`} />
          {venues.length === 0 ? (
            <Card C={C} pad={0}>
              <Empty C={C} icon="business-outline" title="Chưa có cụm sân" subtitle="Tạo cụm sân đầu tiên để bắt đầu nhận đặt sân." action={<PrimaryButton C={C} icon="add" label="Tạo cụm sân" onPress={() => router.push("/owner/venue/new")} />} />
            </Card>
          ) : (
            venues.map((v: any) => (
              <TouchableOpacity key={v._id} activeOpacity={0.88} onPress={() => router.push({ pathname: "/owner/venue/[id]", params: { id: String(v._id) } })}>
                <Card C={C} pad={0} style={{ marginBottom: SP.md, overflow: "hidden", flexDirection: "row" }}>
                  {v.images?.[0] ? (
                    <Image source={{ uri: v.images[0] }} style={styles.thumb} />
                  ) : (
                    <View style={[styles.thumb, { backgroundColor: C.accentSoft, alignItems: "center", justifyContent: "center" }]}><Ionicons name="tennisball-outline" size={26} color={C.accent} /></View>
                  )}
                  <View style={{ flex: 1, minWidth: 0, padding: 12, justifyContent: "center" }}>
                    <Text style={{ color: C.text, fontWeight: "800", fontSize: 15 }} numberOfLines={1}>{v.name}</Text>
                    <Text style={{ color: C.sub, fontSize: 12 }} numberOfLines={1}>{v.province || v.address || "—"}</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                      <Text style={{ color: C.sub, fontSize: 12 }}>{v.todayCount} lượt</Text>
                      <Text style={{ color: C.success, fontSize: 12, fontWeight: "700" }}>{fmtVND(v.todayRevenue)}</Text>
                      {v.awaiting > 0 && <Chip C={C} color={C.warning} label={`${v.awaiting} bill chờ`} small />}
                    </View>
                  </View>
                  <View style={{ justifyContent: "center", paddingRight: 12 }}><Ionicons name="chevron-forward" size={18} color={C.muted} /></View>
                </Card>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hdrBtn: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  heroIcon: { width: 56, height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  heroTitle: { color: "#fff", fontWeight: "900", fontSize: 22, letterSpacing: -0.4 },
  heroSub: { color: "rgba(255,255,255,0.75)", fontSize: 13.5, lineHeight: 20, marginTop: 8 },
  heroGhost: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: R.md, borderWidth: 1, borderColor: "rgba(255,255,255,0.35)" },
  pendingPill: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", backgroundColor: "rgba(245,179,1,0.18)", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, marginTop: 14 },
  featIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  thumb: { width: 92, height: 92 },
});
