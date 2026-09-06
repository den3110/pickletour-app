// app/courts/index.tsx — Tìm sân để đặt
import React, { useMemo, useState } from "react";
import {
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { Text } from "@/components/ui/i18nText";
import { Ionicons } from "@expo/vector-icons";
import { Stack, router } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { useListVenuesQuery } from "@/slices/venuesApiSlice";
import { fmtVND, pal } from "@/utils/courtFormat";

export default function CourtsBrowseScreen() {
  const theme = useTheme();
  const C = useMemo(() => pal(!!theme.dark), [theme.dark]);
  const [q, setQ] = useState("");
  const [keyword, setKeyword] = useState("");
  const { data, isLoading, isFetching, refetch } = useListVenuesQuery({ keyword, limit: 50 });
  const items: any[] = Array.isArray(data) ? data : data?.items || [];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen
        options={{
          title: "Đặt sân",
          headerRight: () => (
            <TouchableOpacity onPress={() => router.push("/courts/my-bookings")} hitSlop={8}>
              <Ionicons name="ticket-outline" size={22} color={C.accent} />
            </TouchableOpacity>
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
        {!!q && (
          <TouchableOpacity onPress={() => { setQ(""); setKeyword(""); }} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={C.sub} />
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(v) => String(v._id)}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} />}
          ListEmptyComponent={
            <Text style={{ color: C.sub, textAlign: "center", marginTop: 40 }}>
              Chưa có sân nào{keyword ? ` khớp "${keyword}"` : ""}.
            </Text>
          }
          renderItem={({ item: v }) => (
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
                <Text style={[styles.name, { color: C.text }]} numberOfLines={1}>{v.name}</Text>
                <View style={styles.row}>
                  <Ionicons name="location-outline" size={14} color={C.sub} />
                  <Text style={[styles.sub, { color: C.sub }]} numberOfLines={1}>
                    {[v.address, v.province].filter(Boolean).join(", ") || "—"}
                  </Text>
                </View>
                <View style={[styles.row, { marginTop: 6, justifyContent: "space-between" }]}>
                  <Text style={{ color: C.accent, fontWeight: "800" }}>
                    {v.defaultPricePerHour ? `${fmtVND(v.defaultPricePerHour)}/giờ` : "Liên hệ"}
                  </Text>
                  {typeof v.courtCount === "number" && (
                    <Text style={[styles.sub, { color: C.sub }]}>{v.courtCount} sân</Text>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    margin: 12,
    marginBottom: 0,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 15 },
  card: { borderRadius: 14, borderWidth: 1, overflow: "hidden", marginBottom: 12 },
  cover: { width: "100%", height: 150 },
  name: { fontSize: 16, fontWeight: "800" },
  row: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  sub: { fontSize: 13, flexShrink: 1 },
});
