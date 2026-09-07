// MLP BXH team. Hỗ trợ BXH per bảng khi giải bật group stage.
import {
  Stack,
  useLocalSearchParams } from "expo-router";
import React,
  { useMemo,
  useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "@/components/ui/i18nText";
import { SafeAreaView } from "react-native-safe-area-context";

import { useListMlpStandingsQuery } from "@/slices/mlpApiSlice";
import { useThemeTokens, type ThemeTokens } from "@/hooks/useThemeTokens";

type Row = {
  _id: string;
  rank?: number;
  name?: string;
  shortName?: string;
  color?: string;
  wins: number;
  losses: number;
  played?: number;
  slotsFor: number;
  slotsAgainst: number;
  slotDiff?: number;
  pointsFor?: number;
  pointsAgainst?: number;
  pointDiff?: number;
};

function Table({
  items,
  topPerPool,
}: {
  items: Row[];
  topPerPool?: number;
}) {
  const C = useThemeTokens();
  const styles = useMemo(() => mk_styles(C), [C]);
  return (
    <FlatList
      data={items}
      keyExtractor={(r) => String(r._id)}
      contentContainerStyle={{ paddingBottom: 20 }}
      ListEmptyComponent={
        <View style={{ padding: 32, alignItems: "center" }}>
          <Text style={{ color: C.sub }}>Chưa có dữ liệu BXH.</Text>
        </View>
      }
      renderItem={({ item: r, index }) => {
        const isTop = topPerPool && index < topPerPool;
        const isRankOne = r.rank === 1;
        return (
          <View
            style={[
              styles.row,
              isTop && { backgroundColor: C.greenSoft },
              !isTop && isRankOne && { backgroundColor: C.amberSoft },
            ]}
          >
            <Text style={[styles.c, { width: 32, fontWeight: "800" }]}>
              {r.rank}
              {isTop ? " ✓" : ""}
            </Text>
            <View style={{ flex: 1 }}>
              <Text
                style={{ fontSize: 14, fontWeight: "700", color: C.text }}
                numberOfLines={1}
              >
                {r.name}
              </Text>
              <Text
                style={{ fontSize: 11, color: C.sub, marginTop: 2 }}
              >
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
                    (r.slotDiff ?? 0) > 0
                      ? "#10B981"
                      : (r.slotDiff ?? 0) < 0
                        ? "#EF4444"
                        : C.sub,
                },
              ]}
            >
              {(r.slotDiff ?? 0) > 0
                ? `+${r.slotDiff}`
                : String(r.slotDiff ?? 0)}
            </Text>
            <Text
              style={[
                styles.c,
                styles.numCol,
                {
                  color:
                    (r.pointDiff ?? 0) > 0
                      ? "#10B981"
                      : (r.pointDiff ?? 0) < 0
                        ? "#EF4444"
                        : C.sub,
                },
              ]}
            >
              {(r.pointDiff ?? 0) > 0
                ? `+${r.pointDiff}`
                : String(r.pointDiff ?? 0)}
            </Text>
          </View>
        );
      }}
    />
  );
}

export default function MlpStandingsScreen() {
  const C = useThemeTokens();
  const styles = useMemo(() => mk_styles(C), [C]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isFetching } = useListMlpStandingsQuery(String(id), {
    skip: !id,
  });
  const items: Row[] = (data as any)?.items || [];
  const pools = (data as any)?.pools as
    | { key: string; index: number; items: Row[] }[]
    | null;
  const gs = (data as any)?.groupStage as {
    enabled: boolean;
    topPerPool?: number;
  } | null;
  const [tab, setTab] = useState<number>(0); // 0 = tổng, 1..N = pool
  const hasPools = gs?.enabled && Array.isArray(pools) && pools.length > 0;
  const current: Row[] = useMemo(() => {
    if (!hasPools || tab === 0) return items;
    return pools?.[tab - 1]?.items || [];
  }, [items, hasPools, tab, pools]);
  const topPerPool = hasPools && tab > 0 ? gs?.topPerPool : undefined;

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <Stack.Screen options={{ title: "MLP · BXH" }} />
      {hasPools && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsRow}
        >
          <TabBtn
            active={tab === 0}
            label={`Tổng (${items.length})`}
            onPress={() => setTab(0)}
          />
          {pools!.map((p, i) => (
            <TabBtn
              key={p.key}
              active={tab === i + 1}
              label={`Bảng ${p.key}`}
              onPress={() => setTab(i + 1)}
            />
          ))}
        </ScrollView>
      )}
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
        <Table items={current} topPerPool={topPerPool} />
      )}
      <Text style={styles.footer}>
        {hasPools && tab > 0
          ? `Top ${gs?.topPerPool} đội (dấu ✓) vào Knockout · Sắp xếp: Thắng → H2H → ±S → ±Đ`
          : "Sắp xếp: Thắng → Head-to-head → Hiệu số slot → Hiệu số điểm → Tên."}
      </Text>
    </SafeAreaView>
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
  const C = useThemeTokens();
  const styles = useMemo(() => mk_styles(C), [C]);
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

const mk_styles = (C: ThemeTokens) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: C.card,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  h: { fontSize: 12, color: C.sub, fontWeight: "700" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.card,
    gap: 4,
  },
  c: { fontSize: 13, color: C.text },
  numCol: { width: 40, textAlign: "center" },
  footer: {
    padding: 12,
    fontSize: 11,
    color: C.muted,
    fontStyle: "italic",
  },
  tabsRow: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
    backgroundColor: C.card,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tabBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: C.field,
  },
  tabBtnActive: { backgroundColor: "#0066FF" },
  tabBtnText: { color: C.text2, fontWeight: "700", fontSize: 12 },
  tabBtnTextActive: { color: "#fff" },
});
