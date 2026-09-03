// app/coaches/index.tsx — Danh sách Huấn luyện viên (mobile).
import {
  Ionicons } from "@expo/vector-icons";
import { Stack,
  router } from "expo-router";
import React,
  { useEffect,
  useMemo,
  useState } from "react";
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
  View,
} from "react-native";
import { TextInput } from "@/components/ui/i18nTextInput";
import { Text } from "@/components/ui/i18nText";
import { SafeAreaView } from "react-native-safe-area-context";

import { useSelector } from "react-redux";
import {
  useListCoachesQuery,
  useListCoachProvincesQuery,
  useApplyToBeCoachMutation,
  useGetMyCoachApplicationQuery,
  useCancelMyCoachApplicationMutation,
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
  const viewer = useSelector((s: any) => s.auth?.userInfo);
  const isCoach = !!viewer?.isCoach;
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [province, setProvince] = useState("");
  const [provinceOpen, setProvinceOpen] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [openDm] = useOpenDmMutation();
  const { data: myApp, refetch: refetchMyApp } = useGetMyCoachApplicationQuery(
    undefined,
    { skip: !viewer || isCoach }
  );
  const [cancelMyApp] = useCancelMyCoachApplicationMutation();
  const cancelApp = async () => {
    Alert.alert("Huỷ đơn đăng ký HLV?", undefined, [
      { text: "Không", style: "cancel" },
      {
        text: "Huỷ đơn",
        style: "destructive",
        onPress: async () => {
          try {
            await cancelMyApp().unwrap();
            refetchMyApp();
            Alert.alert("Đã huỷ đơn");
          } catch (err: any) {
            Alert.alert("Lỗi", err?.data?.message || "Huỷ thất bại");
          }
        },
      },
    ]);
  };

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

      {/* CTA đăng ký làm HLV — chỉ hiện khi user chưa là coach */}
      {viewer && !isCoach && (
        <View style={styles.applyBar}>
          {myApp?.status === "pending" ? (
            <View style={styles.applyStatusRow}>
              <View style={styles.applyStatusChip}>
                <Ionicons name="hourglass-outline" size={14} color="#B45309" />
                <Text style={styles.applyStatusText}>Đơn đang chờ duyệt</Text>
              </View>
              <Pressable onPress={cancelApp} hitSlop={8}>
                <Text style={styles.applyCancelText}>Huỷ đơn</Text>
              </Pressable>
            </View>
          ) : myApp?.status === "rejected" ? (
            <Pressable
              onPress={() => setApplyOpen(true)}
              style={[styles.applyBtn, { backgroundColor: "#FEE2E2" }]}
            >
              <Ionicons name="alert-circle" size={16} color="#B91C1C" />
              <Text style={[styles.applyBtnText, { color: "#B91C1C" }]}>
                Đơn bị từ chối — Đăng ký lại
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => setApplyOpen(true)}
              style={styles.applyBtn}
            >
              <Ionicons name="school" size={16} color="#fff" />
              <Text style={styles.applyBtnText}>Đăng ký làm huấn luyện viên</Text>
            </Pressable>
          )}
        </View>
      )}

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

      {/* Coach application modal */}
      <CoachApplicationModal
        visible={applyOpen}
        onClose={() => setApplyOpen(false)}
        onSubmitted={() => {
          setApplyOpen(false);
          refetchMyApp();
        }}
      />
    </SafeAreaView>
  );
}

/* ─────────── CoachApplicationModal (bottom sheet) ─────────── */
const LEVEL_LABEL: Record<string, string> = {
  national: "Quốc gia",
  regional: "Khu vực",
  local: "Địa phương",
  club: "CLB",
  other: "Khác",
};

function CoachApplicationModal({
  visible,
  onClose,
  onSubmitted,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [headline, setHeadline] = useState("");
  const [experienceYears, setExperienceYears] = useState("");
  const [specialtyText, setSpecialtyText] = useState("");
  const [bio, setBio] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [achievements, setAchievements] = useState<
    { title: string; year: string; level: string; description: string }[]
  >([{ title: "", year: "", level: "other", description: "" }]);
  const [apply, { isLoading }] = useApplyToBeCoachMutation();

  const updateAch = (idx: number, patch: any) =>
    setAchievements(
      achievements.map((a, i) => (i === idx ? { ...a, ...patch } : a))
    );
  const addAch = () =>
    setAchievements([
      ...achievements,
      { title: "", year: "", level: "other", description: "" },
    ]);
  const removeAch = (idx: number) =>
    setAchievements(achievements.filter((_, i) => i !== idx));

  const handleSubmit = async () => {
    if (!headline.trim()) {
      Alert.alert("Vui lòng nhập Headline");
      return;
    }
    const specialties = specialtyText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const cleanedAch = achievements
      .filter((a) => a.title.trim())
      .map((a) => ({
        title: a.title.trim(),
        year: a.year ? Number(a.year) : undefined,
        level: a.level || "other",
        description: a.description.trim(),
      }));
    try {
      await apply({
        headline: headline.trim(),
        experienceYears: Number(experienceYears) || 0,
        specialties,
        bio: bio.trim(),
        phone: phone.trim(),
        note: note.trim(),
        achievements: cleanedAch,
      }).unwrap();
      Alert.alert("Đã gửi đơn — chờ admin duyệt");
      onSubmitted();
    } catch (err: any) {
      Alert.alert("Lỗi", err?.data?.message || "Gửi thất bại");
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View
          style={[
            styles.modalSheet,
            { maxHeight: "92%", paddingBottom: 24 },
          ]}
        >
          <View style={styles.modalHandle} />
          <View style={styles.applyModalHeader}>
            <Text style={styles.modalTitle}>Đăng ký làm HLV</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color="#64748B" />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16, gap: 12 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.applyInfoBox}>
              <Text style={styles.applyInfoText}>
                Điền thông tin đầy đủ. Sau khi admin duyệt, hồ sơ sẽ xuất hiện
                trong danh sách HLV công khai.
              </Text>
            </View>

            <View>
              <Text style={styles.applyLabel}>Headline *</Text>
              <TextInput
                value={headline}
                onChangeText={setHeadline}
                placeholder="VD: HLV Pickleball 8 năm kinh nghiệm..."
                placeholderTextColor="#94A3B8"
                style={styles.applyInput}
                maxLength={200}
              />
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.applyLabel}>Số năm kinh nghiệm</Text>
                <TextInput
                  value={experienceYears}
                  onChangeText={setExperienceYears}
                  keyboardType="number-pad"
                  placeholderTextColor="#94A3B8"
                  style={styles.applyInput}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.applyLabel}>SĐT liên hệ</Text>
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  placeholderTextColor="#94A3B8"
                  style={styles.applyInput}
                />
              </View>
            </View>

            <View>
              <Text style={styles.applyLabel}>
                Chuyên môn (cách nhau bằng dấu phẩy)
              </Text>
              <TextInput
                value={specialtyText}
                onChangeText={setSpecialtyText}
                placeholder="VD: Kỹ thuật đôi, Chấm trình 3.0-4.0"
                placeholderTextColor="#94A3B8"
                style={styles.applyInput}
              />
            </View>

            <View>
              <Text style={styles.applyLabel}>Giới thiệu thêm</Text>
              <TextInput
                value={bio}
                onChangeText={setBio}
                placeholder="Bio tuỳ chọn..."
                placeholderTextColor="#94A3B8"
                style={[styles.applyInput, { minHeight: 80, textAlignVertical: "top" }]}
                multiline
              />
            </View>

            <View>
              <View style={styles.achHeaderRow}>
                <Text style={styles.applyLabel}>Thành tích đã đạt</Text>
                <Pressable onPress={addAch} hitSlop={6}>
                  <Text style={styles.addLinkText}>+ Thêm</Text>
                </Pressable>
              </View>
              {achievements.map((a, idx) => (
                <View key={idx} style={styles.achCard}>
                  <View style={styles.achHeadRow}>
                    <TextInput
                      value={a.title}
                      onChangeText={(v) => updateAch(idx, { title: v })}
                      placeholder="Tên thành tích"
                      placeholderTextColor="#94A3B8"
                      style={[styles.applyInput, { flex: 1 }]}
                    />
                    {achievements.length > 1 && (
                      <Pressable
                        onPress={() => removeAch(idx)}
                        hitSlop={6}
                        style={{ marginLeft: 6 }}
                      >
                        <Ionicons name="trash" size={18} color="#DC2626" />
                      </Pressable>
                    )}
                  </View>
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                    <TextInput
                      value={a.year}
                      onChangeText={(v) => updateAch(idx, { year: v })}
                      keyboardType="number-pad"
                      placeholder="Năm"
                      placeholderTextColor="#94A3B8"
                      style={[styles.applyInput, { width: 90 }]}
                    />
                    <View style={styles.levelPickerWrap}>
                      {Object.entries(LEVEL_LABEL).map(([k, v]) => (
                        <Pressable
                          key={k}
                          onPress={() => updateAch(idx, { level: k })}
                          style={[
                            styles.levelChip,
                            a.level === k && styles.levelChipActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.levelChipText,
                              a.level === k && styles.levelChipTextActive,
                            ]}
                          >
                            {v}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                  <TextInput
                    value={a.description}
                    onChangeText={(v) => updateAch(idx, { description: v })}
                    placeholder="Mô tả (tuỳ chọn)"
                    placeholderTextColor="#94A3B8"
                    style={[styles.applyInput, { marginTop: 6, minHeight: 40 }]}
                    multiline
                  />
                </View>
              ))}
            </View>

            <View>
              <Text style={styles.applyLabel}>Ghi chú gửi admin</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Tuỳ chọn..."
                placeholderTextColor="#94A3B8"
                style={[styles.applyInput, { minHeight: 60, textAlignVertical: "top" }]}
                multiline
              />
            </View>

            <Pressable
              onPress={handleSubmit}
              disabled={isLoading || !headline.trim()}
              style={[
                styles.submitBtn,
                (isLoading || !headline.trim()) && { opacity: 0.5 },
              ]}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>Gửi đơn</Text>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F9" },
  applyBar: {
    padding: 10,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  applyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#0066FF",
  },
  applyBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  applyStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  applyStatusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#FEF3C7",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  applyStatusText: { color: "#92400E", fontSize: 12, fontWeight: "700" },
  applyCancelText: { color: "#DC2626", fontWeight: "700", fontSize: 13 },
  applyModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  applyInfoBox: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  applyInfoText: { color: "#1E40AF", fontSize: 12, lineHeight: 18 },
  applyLabel: { fontSize: 12, fontWeight: "700", color: "#334155", marginBottom: 4 },
  applyInput: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: "#0F172A",
    backgroundColor: "#fff",
  },
  achHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  addLinkText: { color: "#0066FF", fontWeight: "700", fontSize: 13 },
  achCard: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 8,
    backgroundColor: "#F8FAFC",
  },
  achHeadRow: { flexDirection: "row", alignItems: "center" },
  levelPickerWrap: { flexDirection: "row", flexWrap: "wrap", gap: 4, flex: 1 },
  levelChip: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#fff",
  },
  levelChipActive: { backgroundColor: "#0066FF", borderColor: "#0066FF" },
  levelChipText: { fontSize: 11, color: "#334155", fontWeight: "600" },
  levelChipTextActive: { color: "#fff" },
  submitBtn: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "#0066FF",
    alignItems: "center",
  },
  submitBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
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
