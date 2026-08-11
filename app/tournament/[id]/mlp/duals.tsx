// MLP duals — list dual matches + links to Teams / BXH / detail.
import { Ionicons } from "@expo/vector-icons";
import { Stack, router, useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useListMlpDualsQuery } from "@/slices/mlpApiSlice";

const STATUS: Record<string, { label: string; color: string }> = {
  scheduled: { label: "Chưa đấu", color: "#94A3B8" },
  live: { label: "LIVE", color: "#F59E0B" },
  tie_break: { label: "DreamBreaker", color: "#EF4444" },
  finished: { label: "Kết thúc", color: "#10B981" },
};

export default function MlpDualsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isFetching } = useListMlpDualsQuery(
    { tourId: String(id) },
    { skip: !id }
  );
  const rawItems = (data as any)?.items || [];
  const [tab, setTab] = useState<string>("all"); // 'all' | poolKey | 'knockout'

  // Nhóm theo phase + poolKey
  const { poolKeys, hasKnockout } = useMemo(() => {
    const pk = new Set<string>();
    let hasKo = false;
    for (const d of rawItems) {
      if (d.phase === "group" && d.poolKey) pk.add(d.poolKey);
      if (d.phase === "knockout") hasKo = true;
    }
    return {
      poolKeys: Array.from(pk).sort(),
      hasKnockout: hasKo,
    };
  }, [rawItems]);

  const items = useMemo(() => {
    if (tab === "all") return rawItems;
    if (tab === "knockout")
      return rawItems.filter((d: any) => d.phase === "knockout");
    return rawItems.filter(
      (d: any) => d.phase === "group" && d.poolKey === tab,
    );
  }, [rawItems, tab]);

  const showTabs = poolKeys.length > 0 || hasKnockout;

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <Stack.Screen options={{ title: "MLP · Duals" }} />
      <View style={styles.nav}>
        <NavBtn
          icon="people-outline"
          label="Teams"
          onPress={() => router.push(`/tournament/${id}/mlp/teams` as any)}
        />
        <NavBtn
          icon="trophy-outline"
          label="BXH"
          onPress={() =>
            router.push(`/tournament/${id}/mlp/standings` as any)
          }
        />
      </View>

      {showTabs && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsRow}
        >
          <TabBtn
            active={tab === "all"}
            label={`Tất cả (${rawItems.length})`}
            onPress={() => setTab("all")}
          />
          {poolKeys.map((k) => (
            <TabBtn
              key={k}
              active={tab === k}
              label={`Bảng ${k}`}
              onPress={() => setTab(k)}
            />
          ))}
          {hasKnockout && (
            <TabBtn
              active={tab === "knockout"}
              label="Knockout"
              onPress={() => setTab("knockout")}
            />
          )}
        </ScrollView>
      )}

      {isFetching && !items.length ? (
        <ActivityIndicator style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(d: any) => String(d._id)}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={{ padding: 32, alignItems: "center" }}>
              <Text style={{ color: "#64748B" }}>
                Chưa có dual match nào.
              </Text>
            </View>
          }
          renderItem={({ item: d }) => {
            const st = STATUS[d.status] || STATUS.scheduled;
            const winnerA = d.winner === "A";
            const winnerB = d.winner === "B";
            return (
              <Pressable
                onPress={() =>
                  router.push(
                    `/tournament/${id}/mlp/dual/${d._id}` as any
                  )
                }
                style={styles.card}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.round}>
                    {d.phase === "group" && d.poolKey
                      ? `Bảng ${d.poolKey}`
                      : d.phase === "knockout"
                        ? `KO · Vòng ${d.knockoutRound || 1}`
                        : d.round === 1
                          ? "Vòng bảng"
                          : `Vòng ${d.round}`}
                  </Text>
                  <View
                    style={[
                      styles.status,
                      { backgroundColor: st.color + "22" },
                    ]}
                  >
                    <Text style={{ color: st.color, fontSize: 11, fontWeight: "800" }}>
                      {st.label}
                    </Text>
                  </View>
                </View>
                <View style={styles.matchRow}>
                  <Text
                    style={[
                      styles.team,
                      winnerA && { color: "#0066FF", fontWeight: "900" },
                    ]}
                    numberOfLines={1}
                  >
                    {d.teamA?.name || "Team A"}
                  </Text>
                  <Text style={styles.score}>
                    {d.slotWinsA ?? 0} — {d.slotWinsB ?? 0}
                  </Text>
                  <Text
                    style={[
                      styles.team,
                      { textAlign: "right" },
                      winnerB && { color: "#0066FF", fontWeight: "900" },
                    ]}
                    numberOfLines={1}
                  >
                    {d.teamB?.name || "Team B"}
                  </Text>
                </View>
                {(d.court || d.courtStation || d.scheduledAt) && (
                  <View style={styles.metaRow}>
                    {(d.court || d.courtStation) && (
                      <Text style={styles.meta}>
                        🏟️ {d.court?.name || d.courtStation?.name}
                      </Text>
                    )}
                    {d.scheduledAt && (
                      <Text style={styles.meta}>
                        🕒 {new Date(d.scheduledAt).toLocaleString("vi-VN")}
                      </Text>
                    )}
                  </View>
                )}
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

function NavBtn({
  icon,
  label,
  onPress,
}: {
  icon: any;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.navBtn}>
      <Ionicons name={icon} size={18} color="#0066FF" />
      <Text style={styles.navBtnText}>{label}</Text>
    </Pressable>
  );
}

function TabBtn({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.tabBtn, active && styles.tabBtnActive]}
    >
      <Text style={[styles.tabBtnText, active && styles.tabBtnTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  nav: {
    flexDirection: "row",
    padding: 12,
    gap: 8,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  navBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
  },
  navBtnText: { color: "#0066FF", fontWeight: "700", fontSize: 13 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 8,
  },
  cardHeader: { flexDirection: "row", alignItems: "center" },
  round: { flex: 1, fontSize: 12, color: "#64748B", fontWeight: "600" },
  status: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  matchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  team: { flex: 1, fontSize: 15, fontWeight: "700", color: "#0F172A" },
  score: {
    fontSize: 24,
    fontWeight: "900",
    color: "#0F172A",
    minWidth: 80,
    textAlign: "center",
  },
  metaRow: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 4,
  },
  meta: { fontSize: 12, color: "#64748B" },
  tabsRow: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  tabBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#F1F5F9",
  },
  tabBtnActive: { backgroundColor: "#0066FF" },
  tabBtnText: { color: "#334155", fontWeight: "700", fontSize: 12 },
  tabBtnTextActive: { color: "#fff" },
});
