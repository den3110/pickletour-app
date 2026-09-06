// app/courts/index.tsx — Tìm sân để đặt (danh sách + bản đồ + gần tôi)
import React, { useMemo, useState, useCallback } from "react";
import {
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Text } from "@/components/ui/i18nText";
import { Ionicons } from "@expo/vector-icons";
import { Stack, router } from "expo-router";
import { useTheme } from "@react-navigation/native";
import * as Location from "expo-location";
import { useListVenuesQuery } from "@/slices/venuesApiSlice";
import CourtsMapView from "@/components/courts/CourtsMapView";
import { fmtVND, pal } from "@/utils/courtFormat";

const fmtKm = (m?: number) => (typeof m !== "number" ? "" : m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`);

export default function CourtsBrowseScreen() {
  const theme = useTheme();
  const C = useMemo(() => pal(!!theme.dark), [theme.dark]);
  const [q, setQ] = useState("");
  const [keyword, setKeyword] = useState("");
  const [near, setNear] = useState(false);
  const [myLoc, setMyLoc] = useState<[number, number] | null>(null); // [lng,lat]
  const [mode, setMode] = useState<"list" | "map">("list");

  const params: any = { keyword, limit: 50 };
  if (near && myLoc) {
    params.lat = myLoc[1];
    params.lon = myLoc[0];
    params.radius = 50;
  }
  const { data, isLoading, isFetching, refetch } = useListVenuesQuery(params);
  const items: any[] = Array.isArray(data) ? data : data?.items || [];

  const enableNear = useCallback(async () => {
    if (near) { setNear(false); return; }
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Cần quyền vị trí", "Cho phép vị trí để tìm sân gần bạn.");
      return;
    }
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    setMyLoc([loc.coords.longitude, loc.coords.latitude]);
    setNear(true);
  }, [near]);

  const renderCard = ({ item: v }: any) => (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => router.push({ pathname: "/courts/[id]", params: { id: String(v._id) } })}
      style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}
    >
      {v.images?.[0] ? (
        <Image source={{ uri: v.images[0] }} style={styles.cover} />
      ) : (
        <View style={[styles.cover, { backgroundColor: C.field, alignItems: "center", justifyContent: "center" }]}>
          <Ionicons name="tennisball-outline" size={36} color={C.sub} />
        </View>
      )}
      <View style={{ padding: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={[styles.name, { color: C.text, flex: 1 }]} numberOfLines={1}>{v.name}</Text>
          {typeof v.distanceMeters === "number" && (
            <View style={[styles.km, { backgroundColor: `${C.accent}22` }]}>
              <Ionicons name="navigate" size={11} color={C.accent} />
              <Text style={{ color: C.accent, fontSize: 11, fontWeight: "700" }}>{fmtKm(v.distanceMeters)}</Text>
            </View>
          )}
        </View>
        <View style={styles.row}>
          <Ionicons name="location-outline" size={14} color={C.sub} />
          <Text style={[styles.sub, { color: C.sub }]} numberOfLines={1}>{[v.address, v.province].filter(Boolean).join(", ") || "—"}</Text>
        </View>
        <View style={[styles.row, { marginTop: 6, justifyContent: "space-between" }]}>
          <Text style={{ color: C.accent, fontWeight: "800" }}>{v.defaultPricePerHour ? `${fmtVND(v.defaultPricePerHour)}/giờ` : "Liên hệ"}</Text>
          {typeof v.courtCount === "number" && <Text style={[styles.sub, { color: C.sub }]}>{v.courtCount} sân</Text>}
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
            <View style={{ flexDirection: "row", gap: 16 }}>
              <TouchableOpacity onPress={() => setMode(mode === "list" ? "map" : "list")} hitSlop={8}>
                <Ionicons name={mode === "list" ? "map-outline" : "list-outline"} size={22} color={C.accent} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push("/courts/my-bookings")} hitSlop={8}>
                <Ionicons name="ticket-outline" size={22} color={C.accent} />
              </TouchableOpacity>
            </View>
          ),
        }}
      />
      <View style={[styles.search, { backgroundColor: C.card, borderColor: C.border }]}>
        <Ionicons name="search" size={18} color={C.sub} />
        <TextInput
          style={[styles.searchInput, { color: C.text }]}
          placeholder="Tìm tên sân, địa chỉ…"
          placeholderTextColor={C.sub}
          value={q}
          onChangeText={setQ}
          onSubmitEditing={() => setKeyword(q.trim())}
          returnKeyType="search"
        />
        <TouchableOpacity onPress={enableNear} style={[styles.nearBtn, { backgroundColor: near ? C.accent : C.field }]}>
          <Ionicons name="navigate" size={14} color={near ? "#0a0e1a" : C.sub} />
          <Text style={{ color: near ? "#0a0e1a" : C.sub, fontSize: 12, fontWeight: "700" }}>Gần tôi</Text>
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
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} />}
          ListEmptyComponent={<Text style={{ color: C.sub, textAlign: "center", marginTop: 40 }}>Chưa có sân nào{keyword ? ` khớp "${keyword}"` : ""}.</Text>}
          renderItem={renderCard}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: "row", alignItems: "center", gap: 8, margin: 12, marginBottom: 0, paddingHorizontal: 12, height: 46, borderRadius: 12, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 15 },
  nearBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  card: { borderRadius: 14, borderWidth: 1, overflow: "hidden", marginBottom: 12 },
  cover: { width: "100%", height: 150 },
  name: { fontSize: 16, fontWeight: "800" },
  km: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  row: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  sub: { fontSize: 13, flexShrink: 1 },
});
