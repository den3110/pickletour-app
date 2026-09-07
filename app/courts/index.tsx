// app/courts/index.tsx — Tìm sân để đặt (danh sách + bản đồ + gần tôi)
import React, { useMemo, useState, useCallback } from "react";
import { View, FlatList, TextInput, TouchableOpacity, Image, StyleSheet, RefreshControl, ActivityIndicator, Alert } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Text } from "@/components/ui/i18nText";
import { Ionicons } from "@expo/vector-icons";
import { Stack, router } from "expo-router";
import { useTheme } from "@react-navigation/native";
import * as Location from "expo-location";
import { useListVenuesQuery } from "@/slices/venuesApiSlice";
import CourtsMapView from "@/components/courts/CourtsMapView";
import { fmtVND, pal } from "@/utils/courtFormat";
import { Empty, PrimaryButton, shadow, R, SP } from "@/components/courts/ui";

const fmtKm = (m?: number) => (typeof m !== "number" ? "" : m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`);

export default function CourtsBrowseScreen() {
  const theme = useTheme();
  const C = useMemo(() => pal(!!theme.dark), [theme.dark]);
  const [q, setQ] = useState("");
  const [keyword, setKeyword] = useState("");
  const [near, setNear] = useState(false);
  const [myLoc, setMyLoc] = useState<[number, number] | null>(null);
  const [mode, setMode] = useState<"list" | "map">("list");

  const params: any = { keyword, limit: 50 };
  if (near && myLoc) { params.lat = myLoc[1]; params.lon = myLoc[0]; params.radius = 50; }
  const { data, isLoading, isFetching, refetch } = useListVenuesQuery(params);
  const items: any[] = Array.isArray(data) ? data : data?.items || [];

  const enableNear = useCallback(async () => {
    if (near) { setNear(false); return; }
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") { Alert.alert("Cần quyền vị trí", "Cho phép vị trí để tìm sân gần bạn."); return; }
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    setMyLoc([loc.coords.longitude, loc.coords.latitude]);
    setNear(true);
  }, [near]);

  const renderCard = ({ item: v }: any) => (
    <TouchableOpacity activeOpacity={0.9} onPress={() => router.push({ pathname: "/courts/[id]", params: { id: String(v._id) } })} style={[styles.card, { backgroundColor: C.card, borderColor: C.border }, shadow(C.dark, 2)]}>
      <View>
        {v.images?.[0] ? (
          <Image source={{ uri: v.images[0] }} style={styles.cover} />
        ) : (
          <LinearGradient colors={C.heroGrad} style={[styles.cover, { alignItems: "center", justifyContent: "center" }]}>
            <Ionicons name="tennisball" size={40} color="rgba(255,255,255,0.6)" />
          </LinearGradient>
        )}
        <LinearGradient colors={["rgba(2,6,23,0)", "rgba(2,6,23,0.75)"]} style={styles.coverShade} />
        <View style={styles.coverBottom}>
          <Text style={styles.coverTitle} numberOfLines={1}>{v.name}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Ionicons name="location" size={12} color="rgba(255,255,255,0.85)" />
            <Text style={styles.coverSub} numberOfLines={1}>{[v.address, v.province].filter(Boolean).join(", ") || "—"}</Text>
          </View>
        </View>
        {typeof v.distanceMeters === "number" && (
          <View style={styles.kmPill}>
            <Ionicons name="navigate" size={11} color="#06111f" />
            <Text style={{ color: "#06111f", fontSize: 11, fontWeight: "800" }}>{fmtKm(v.distanceMeters)}</Text>
          </View>
        )}
      </View>
      <View style={styles.cardFoot}>
        <View>
          <Text style={{ color: C.sub, fontSize: 11 }}>Giá từ</Text>
          <Text style={{ color: C.accent, fontWeight: "900", fontSize: 16, letterSpacing: -0.3 }}>{v.defaultPricePerHour ? `${fmtVND(v.defaultPricePerHour)}/giờ` : "Liên hệ"}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {typeof v.courtCount === "number" && (
            <View style={[styles.miniPill, { backgroundColor: C.field }]}>
              <Ionicons name="grid-outline" size={12} color={C.sub} />
              <Text style={{ color: C.sub, fontSize: 12, fontWeight: "700" }}>{v.courtCount} sân</Text>
            </View>
          )}
          <View style={[styles.bookBtn, { backgroundColor: C.accent }]}>
            <Text style={{ color: C.onAccent, fontWeight: "800", fontSize: 12.5 }}>Đặt sân</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen
        options={{
          title: "Đặt sân",
          headerRight: () => (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity onPress={() => setMode(mode === "list" ? "map" : "list")} hitSlop={6} style={[styles.hdrBtn, { backgroundColor: C.accentSoft }]}>
                <Ionicons name={mode === "list" ? "map-outline" : "list-outline"} size={18} color={C.accent} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push("/courts/my-bookings")} hitSlop={6} style={[styles.hdrBtn, { backgroundColor: C.accentSoft }]}>
                <Ionicons name="ticket-outline" size={18} color={C.accent} />
              </TouchableOpacity>
            </View>
          ),
        }}
      />
      <View style={[styles.search, { backgroundColor: C.card, borderColor: C.border }, shadow(C.dark, 1)]}>
        <Ionicons name="search" size={18} color={C.muted} />
        <TextInput style={[styles.searchInput, { color: C.text }]} placeholder="Tìm tên sân, địa chỉ…" placeholderTextColor={C.muted} value={q} onChangeText={setQ} onSubmitEditing={() => setKeyword(q.trim())} returnKeyType="search" />
        <TouchableOpacity onPress={enableNear} activeOpacity={0.85} style={[styles.nearBtn, { backgroundColor: near ? C.accent : C.field }]}>
          <Ionicons name="navigate" size={13} color={near ? C.onAccent : C.sub} />
          <Text style={{ color: near ? C.onAccent : C.sub, fontSize: 12, fontWeight: "800" }}>Gần tôi</Text>
        </TouchableOpacity>
      </View>

      {mode === "map" ? (
        <View style={{ flex: 1 }}>
          <CourtsMapView venues={items} myLocation={myLoc} C={C} onPick={(v: any) => router.push({ pathname: "/courts/[id]", params: { id: String(v._id) } })} />
        </View>
      ) : isLoading ? (
        <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(v) => String(v._id)}
          contentContainerStyle={{ padding: SP.lg, paddingBottom: 48 }}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} />}
          ListEmptyComponent={<Empty C={C} icon="search-outline" title={keyword ? `Không có sân khớp "${keyword}"` : "Chưa có sân nào"} subtitle="Thử từ khoá khác hoặc bật Gần tôi." />}
          renderItem={renderCard}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hdrBtn: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  search: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: SP.lg, marginTop: SP.md, paddingHorizontal: 14, height: 48, borderRadius: R.md, borderWidth: StyleSheet.hairlineWidth },
  searchInput: { flex: 1, fontSize: 15 },
  nearBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999 },
  card: { borderRadius: R.lg, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden", marginBottom: SP.lg },
  cover: { width: "100%", height: 168 },
  coverShade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 96 },
  coverBottom: { position: "absolute", left: 14, right: 14, bottom: 12 },
  coverTitle: { color: "#fff", fontWeight: "900", fontSize: 18, letterSpacing: -0.3 },
  coverSub: { color: "rgba(255,255,255,0.85)", fontSize: 12.5, flexShrink: 1 },
  kmPill: { position: "absolute", top: 12, right: 12, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#fff", paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
  cardFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 12 },
  miniPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
  bookBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
});
