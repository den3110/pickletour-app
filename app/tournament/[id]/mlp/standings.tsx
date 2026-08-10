// MLP BXH team.
import { Stack, useLocalSearchParams } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useListMlpStandingsQuery } from "@/slices/mlpApiSlice";

export default function MlpStandingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isFetching } = useListMlpStandingsQuery(String(id), {
    skip: !id,
  });
  const items = (data as any)?.items || [];

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <Stack.Screen options={{ title: "MLP · BXH" }} />
      <View style={styles.headerRow}>
        <Text style={[styles.h, { width: 32 }]}>#</Text>
        <Text style={[styles.h, { flex: 1 }]}>Team</Text>
        <Text style={[styles.h, styles.numCol]}>T</Text>
        <Text style={[styles.h, styles.numCol]}>B</Text>
        <Text style={[styles.h, styles.numCol]}>±S</Text>
        <Text style={[styles.h, styles.numCol]}>±Đ</Text>
      </View>
      {isFetching && !items.length ? (
        <ActivityIndicator style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(r: any) => String(r._id)}
          contentContainerStyle={{ paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={{ padding: 32, alignItems: "center" }}>
              <Text style={{ color: "#64748B" }}>
                Chưa có dữ liệu BXH.
              </Text>
            </View>
          }
          renderItem={({ item: r }) => (
            <View
              style={[
                styles.row,
                r.rank === 1 && { backgroundColor: "#FFFBEB" },
              ]}
            >
              <Text style={[styles.c, { width: 32, fontWeight: "800" }]}>
                {r.rank}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: "#0F172A" }} numberOfLines={1}>
                  {r.name}
                </Text>
                <Text style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>
                  Đã đấu {r.played} · Slot {r.slotsFor}-{r.slotsAgainst}
                </Text>
              </View>
              <Text style={[styles.c, styles.numCol, { fontWeight: "800" }]}>
                {r.wins}
              </Text>
              <Text style={[styles.c, styles.numCol]}>{r.losses}</Text>
              <Text
                style={[
                  styles.c,
                  styles.numCol,
                  {
                    fontWeight: "700",
                    color:
                      r.slotDiff > 0
                        ? "#10B981"
                        : r.slotDiff < 0
                          ? "#EF4444"
                          : "#64748B",
                  },
                ]}
              >
                {r.slotDiff > 0 ? `+${r.slotDiff}` : r.slotDiff}
              </Text>
              <Text
                style={[
                  styles.c,
                  styles.numCol,
                  {
                    color:
                      r.pointDiff > 0
                        ? "#10B981"
                        : r.pointDiff < 0
                          ? "#EF4444"
                          : "#64748B",
                  },
                ]}
              >
                {r.pointDiff > 0 ? `+${r.pointDiff}` : r.pointDiff}
              </Text>
            </View>
          )}
        />
      )}
      <Text style={styles.footer}>
        Sắp xếp: Thắng → Head-to-head → Hiệu số slot → Hiệu số điểm → Tên.
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  h: { fontSize: 12, color: "#64748B", fontWeight: "700" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    backgroundColor: "#fff",
    gap: 4,
  },
  c: { fontSize: 13, color: "#0F172A" },
  numCol: { width: 40, textAlign: "center" },
  footer: {
    padding: 12,
    fontSize: 11,
    color: "#94A3B8",
    fontStyle: "italic",
  },
});
