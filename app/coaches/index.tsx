// app/coaches/index.tsx — Danh sách Huấn luyện viên (mobile).
import { Ionicons } from "@expo/vector-icons";
import { Stack, router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  useListCoachesQuery,
  useListCoachProvincesQuery,
} from "@/slices/coachesApiSlice";
import { useOpenDmMutation } from "@/slices/messagesApiSlice";
import { AuthorAvatar } from "@/components/social/AuthorAvatar";

const authorName = (u: any) => u?.nickname || u?.name || "Huấn luyện viên";

function ScoreChip({
  label,
  value,
  color,
}: {
  label: string;
  value?: number;
  color: string;
}) {
  return (
    <View
      style={[
        styles.scoreChip,
        { backgroundColor: color + "22", borderColor: color + "55" },
      ]}
    >
      <Text style={[styles.scoreChipLabel, { color }]}>{label}</Text>
      <Text style={[styles.scoreChipVal, { color }]}>
        {Number(value || 0).toFixed(3)}
      </Text>
    </View>
  );
}

function CoachCard({
  coach,
  onMessage,
}: {
  coach: any;
  onMessage: (id: string) => void;
}) {
  const hasPhone = !!coach.phone;
  const openProfile = () => router.push(`/profile/${coach._id}` as any);
  const call = () => {
    if (!hasPhone) return;
    Linking.openURL(`tel:${coach.phone}`).catch(() =>
      Alert.alert("Không mở được ứng dụng gọi điện")
    );
  };
  return (
    <View style={styles.card}>
      <View style={styles.cardHero} />
      <View style={styles.cardBody}>
        <Pressable onPress={openProfile} style={styles.avatarWrap}>
          <AuthorAvatar user={coach} size={64} />
        </Pressable>
        <Pressable onPress={openProfile} hitSlop={4}>
          <Text style={styles.name} numberOfLines={1}>
            {coach.name || authorName(coach)}
          </Text>
          {coach.nickname ? (
            <Text style={styles.nickname}>@{coach.nickname}</Text>
          ) : null}
        </Pressable>

        {coach.coachProfile?.headline ? (
          <Text style={styles.headline} numberOfLines={2}>
            {coach.coachProfile.headline}
          </Text>
        ) : null}

        <View style={styles.chipRow}>
          <ScoreChip label="Đơn" value={coach.single} color="#0EA5E9" />
          <ScoreChip label="Đôi" value={coach.double} color="#A855F7" />
          {coach.tierLabel ? (
            <View
              style={[
                styles.tierChip,
                {
                  backgroundColor: (coach.tierColor || "#F59E0B") + "22",
                  borderColor: (coach.tierColor || "#F59E0B") + "55",
                },
              ]}
            >
              <Text
                style={[styles.tierText, { color: coach.tierColor || "#B45309" }]}
              >
                {coach.tierLabel}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.metaCol}>
          {coach.province ? (
            <View style={styles.metaRow}>
              <Ionicons name="location-outline" size={14} color="#64748B" />
              <Text style={styles.metaText}>{coach.province}</Text>
            </View>
          ) : null}
          {coach.coachProfile?.experienceYears > 0 ? (
            <View style={styles.metaRow}>
              <Ionicons name="ribbon-outline" size={14} color="#64748B" />
              <Text style={styles.metaText}>
                {coach.coachProfile.experienceYears} năm kinh nghiệm
              </Text>
            </View>
          ) : null}
        </View>

        {coach.coachProfile?.specialties?.length > 0 ? (
          <View style={[styles.chipRow, { marginTop: 6 }]}>
            {coach.coachProfile.specialties
              .slice(0, 3)
              .map((s: string) => (
                <View key={s} style={styles.specialtyChip}>
                  <Text style={styles.specialtyText}>{s}</Text>
                </View>
              ))}
          </View>
        ) : null}

        <View style={styles.actionRow}>
          <Pressable
            onPress={() => onMessage(coach._id)}
            style={styles.msgBtn}
          >
            <Ionicons name="chatbubble-outline" size={16} color="#fff" />
            <Text style={styles.msgBtnText}>Nhắn tin</Text>
          </Pressable>
          <Pressable
            onPress={call}
            disabled={!hasPhone}
            style={[styles.callBtn, !hasPhone && styles.callBtnDisabled]}
          >
            <Ionicons
              name="call-outline"
              size={18}
              color={hasPhone ? "#10B981" : "#CBD5E1"}
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default function CoachesScreen() {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [province, setProvince] = useState("");
  const [provinceOpen, setProvinceOpen] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [openDm] = useOpenDmMutation();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setCursor(null), [debouncedQ, province]);

  const { data, isFetching, isLoading, refetch } = useListCoachesQuery({
    q: debouncedQ || undefined,
    province: province || undefined,
    cursor,
    limit: 12,
  });
  const provincesQ = useListCoachProvincesQuery();

  const items = data?.items || [];
  const provinces = useMemo(
    () => provincesQ.data?.items || [],
    [provincesQ.data?.items]
  );

  const handleMessage = async (userId: string) => {
    try {
      const conv: any = await openDm(userId).unwrap();
      router.push(`/messages/${conv._id || conv.conversationId}` as any);
    } catch (err: any) {
      Alert.alert("Lỗi", err?.data?.message || "Không mở được cuộc trò chuyện");
    }
  };

  const loadMore = () => {
    if (!data?.hasMore || !data?.nextCursor || isFetching) return;
    if (data.nextCursor === cursor) return;
    setCursor(data.nextCursor);
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <Stack.Screen options={{ title: "Huấn luyện viên" }} />

      {/* Search + filter */}
      <View style={styles.filterBar}>
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={16} color="#64748B" />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Tìm theo tên / biệt danh"
            placeholderTextColor="#94A3B8"
            style={styles.searchInput}
          />
        </View>
        <Pressable
          onPress={() => setProvinceOpen(true)}
          style={styles.provinceBtn}
        >
          <Ionicons name="location-outline" size={14} color="#334155" />
          <Text style={styles.provinceBtnText} numberOfLines={1}>
            {province || "Tất cả tỉnh"}
          </Text>
          <Ionicons name="chevron-down" size={14} color="#334155" />
        </Pressable>
      </View>

      <FlatList
        data={items}
        keyExtractor={(i: any) => String(i._id)}
        renderItem={({ item }) => (
          <CoachCard coach={item} onMessage={handleMessage} />
        )}
        contentContainerStyle={{ padding: 12, gap: 12 }}
        refreshControl={
          <RefreshControl refreshing={isFetching && !cursor} onRefresh={refetch} />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={40} color="#94A3B8" />
              <Text style={styles.emptyText}>Chưa có HLV phù hợp.</Text>
            </View>
          ) : (
            <ActivityIndicator style={{ margin: 30 }} />
          )
        }
        ListFooterComponent={
          isFetching && cursor ? (
            <ActivityIndicator style={{ marginVertical: 12 }} />
          ) : null
        }
      />

      {/* Province picker modal */}
      <Modal
        visible={provinceOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setProvinceOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setProvinceOpen(false)}
        >
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Chọn tỉnh thành</Text>
            <ScrollView style={{ maxHeight: 420 }}>
              <Pressable
                onPress={() => {
                  setProvince("");
                  setProvinceOpen(false);
                }}
                style={[
                  styles.modalRow,
                  province === "" && styles.modalRowActive,
                ]}
              >
                <Text
                  style={[
                    styles.modalRowText,
                    province === "" && styles.modalRowTextActive,
                  ]}
                >
                  Tất cả tỉnh thành
                </Text>
              </Pressable>
              {provinces.map((p: string) => (
                <Pressable
                  key={p}
                  onPress={() => {
                    setProvince(p);
                    setProvinceOpen(false);
                  }}
                  style={[
                    styles.modalRow,
                    province === p && styles.modalRowActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.modalRowText,
                      province === p && styles.modalRowTextActive,
                    ]}
                  >
                    {p}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F9" },
  filterBar: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    alignItems: "center",
  },
  searchWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 10,
    borderRadius: 999,
    height: 36,
  },
  searchInput: { flex: 1, fontSize: 14, color: "#0F172A", paddingVertical: 0 },
  provinceBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 999,
    backgroundColor: "#F1F5F9",
    maxWidth: 160,
  },
  provinceBtnText: { fontSize: 12, color: "#334155", fontWeight: "600" },
  card: {
    borderRadius: 16,
    backgroundColor: "#fff",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  cardHero: {
    height: 60,
    backgroundColor: "#0066FF",
  },
  cardBody: { padding: 14, paddingTop: 0, gap: 8 },
  avatarWrap: {
    marginTop: -30,
    marginBottom: 4,
    borderWidth: 3,
    borderColor: "#fff",
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  name: { fontSize: 16, fontWeight: "800", color: "#0F172A" },
  nickname: { fontSize: 12, color: "#64748B", marginTop: 1 },
  headline: { fontSize: 13, color: "#475569", marginTop: 2 },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
    alignItems: "center",
  },
  scoreChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  scoreChipLabel: { fontSize: 11, fontWeight: "700", opacity: 0.85 },
  scoreChipVal: { fontSize: 12, fontWeight: "800" },
  tierChip: {
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  tierText: { fontSize: 11, fontWeight: "700" },
  specialtyChip: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#F8FAFC",
  },
  specialtyText: { fontSize: 11, color: "#334155", fontWeight: "600" },
  metaCol: { gap: 4, marginTop: 6 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: { fontSize: 12, color: "#64748B" },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    alignItems: "center",
  },
  msgBtn: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#0066FF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  msgBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  callBtn: {
    width: 44,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#10B981",
    alignItems: "center",
    justifyContent: "center",
  },
  callBtnDisabled: {
    borderColor: "#E2E8F0",
  },
  empty: { padding: 48, alignItems: "center", gap: 6 },
  emptyText: { color: "#64748B", fontWeight: "600" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingBottom: 24,
    paddingTop: 8,
    maxHeight: "70%",
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#CBD5E1",
    borderRadius: 999,
    alignSelf: "center",
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
    paddingVertical: 8,
  },
  modalRow: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  modalRowActive: {
    backgroundColor: "#EFF6FF",
  },
  modalRowText: { color: "#334155", fontSize: 14 },
  modalRowTextActive: { color: "#0066FF", fontWeight: "700" },
});
