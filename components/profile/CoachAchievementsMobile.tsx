// components/profile/CoachAchievementsMobile.tsx
// Section thành tích HLV trên trang profile mobile. Owner + admin thấy pending/
// rejected + nút "Bổ sung thành tích".
import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  useCreateCoachAchievementMutation,
  useDeleteCoachAchievementMutation,
  useListCoachAchievementsQuery,
} from "@/slices/coachesApiSlice";

const LEVEL_LABEL: Record<string, string> = {
  national: "Quốc gia",
  regional: "Khu vực",
  local: "Địa phương",
  club: "CLB",
  other: "Khác",
};
const LEVEL_COLOR: Record<string, string> = {
  national: "#EF4444",
  regional: "#F59E0B",
  local: "#0EA5E9",
  club: "#10B981",
  other: "#94A3B8",
};
const STATUS_META: Record<
  string,
  { color: string; bg: string; label: string; icon: string }
> = {
  approved: {
    color: "#065F46",
    bg: "#D1FAE5",
    label: "Đã duyệt",
    icon: "checkmark-circle",
  },
  pending: {
    color: "#92400E",
    bg: "#FEF3C7",
    label: "Chờ duyệt",
    icon: "time-outline",
  },
  rejected: {
    color: "#991B1B",
    bg: "#FEE2E2",
    label: "Từ chối",
    icon: "close-circle-outline",
  },
};

export function CoachAchievementsMobile({
  userId,
  isSelf,
  isCoach,
  isAdminViewer,
}: {
  userId: string;
  isSelf: boolean;
  isCoach: boolean;
  isAdminViewer: boolean;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const { data, isLoading, refetch } = useListCoachAchievementsQuery(userId, {
    skip: !userId,
  });
  const [deleteMut] = useDeleteCoachAchievementMutation();
  const items = data?.items || [];
  const canAdd = isSelf && isCoach;

  const handleDelete = (id: string) => {
    Alert.alert("Xoá thành tích?", "Chỉ xoá được khi đang chờ duyệt.", [
      { text: "Không", style: "cancel" },
      {
        text: "Xoá",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteMut(id).unwrap();
            refetch();
          } catch (err: any) {
            Alert.alert("Lỗi", err?.data?.message || "Xoá thất bại");
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Ionicons name="ribbon" size={18} color="#0066FF" />
          <Text style={styles.title}>Thành tích HLV</Text>
        </View>
        {canAdd && (
          <Pressable
            onPress={() => setAddOpen(true)}
            style={styles.addBtn}
            hitSlop={6}
          >
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={styles.addBtnText}>Bổ sung</Text>
          </Pressable>
        )}
      </View>

      {isLoading ? (
        <View style={{ paddingVertical: 12, alignItems: "center" }}>
          <ActivityIndicator size="small" />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>
            {canAdd
              ? 'Chưa có thành tích. Bấm "Bổ sung" để gửi admin duyệt.'
              : "Chưa có thành tích được công bố."}
          </Text>
        </View>
      ) : (
        <View style={{ gap: 10, marginTop: 8 }}>
          {items.map((a: any) => {
            const meta = STATUS_META[a.status] || STATUS_META.pending;
            const showControls = isSelf && a.status === "pending";
            const levelColor = LEVEL_COLOR[a.level] || LEVEL_COLOR.other;
            return (
              <View
                key={a._id}
                style={[
                  styles.item,
                  a.status === "rejected" && { opacity: 0.6 },
                ]}
              >
                <View style={styles.itemHeadRow}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.itemTitle} numberOfLines={2}>
                      {a.title}
                    </Text>
                    <View style={styles.chipsRow}>
                      {a.year ? (
                        <View style={styles.yearChip}>
                          <Text style={styles.yearChipText}>{a.year}</Text>
                        </View>
                      ) : null}
                      <View
                        style={[
                          styles.levelChip,
                          { backgroundColor: levelColor + "22", borderColor: levelColor + "55" },
                        ]}
                      >
                        <Text style={[styles.levelChipText, { color: levelColor }]}>
                          {LEVEL_LABEL[a.level] || "Khác"}
                        </Text>
                      </View>
                      {(isSelf || isAdminViewer) && (
                        <View
                          style={[
                            styles.statusChip,
                            { backgroundColor: meta.bg },
                          ]}
                        >
                          <Ionicons
                            name={meta.icon as any}
                            size={11}
                            color={meta.color}
                          />
                          <Text style={[styles.statusChipText, { color: meta.color }]}>
                            {meta.label}
                          </Text>
                        </View>
                      )}
                    </View>
                    {a.description ? (
                      <Text style={styles.itemDesc}>{a.description}</Text>
                    ) : null}
                    {a.adminNote && a.status === "rejected" ? (
                      <Text style={styles.adminNoteText}>
                        Admin: {a.adminNote}
                      </Text>
                    ) : null}
                  </View>
                  {showControls && (
                    <Pressable
                      onPress={() => handleDelete(a._id)}
                      hitSlop={8}
                      style={{ marginLeft: 4 }}
                    >
                      <Ionicons name="trash-outline" size={16} color="#DC2626" />
                    </Pressable>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}

      <AddAchievementModal
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onSubmitted={() => {
          setAddOpen(false);
          refetch();
        }}
      />
    </View>
  );
}

function AddAchievementModal({
  visible,
  onClose,
  onSubmitted,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [title, setTitle] = useState("");
  const [year, setYear] = useState("");
  const [level, setLevel] = useState("other");
  const [description, setDescription] = useState("");
  const [createMut, { isLoading }] = useCreateCoachAchievementMutation();

  const reset = () => {
    setTitle("");
    setYear("");
    setLevel("other");
    setDescription("");
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert("Vui lòng nhập tiêu đề");
      return;
    }
    try {
      await createMut({
        title: title.trim(),
        year: year ? Number(year) : undefined,
        level,
        description: description.trim(),
      }).unwrap();
      Alert.alert("Đã gửi thành tích", "Chờ admin duyệt.");
      reset();
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
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Bổ sung thành tích</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color="#64748B" />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={{ padding: 16, gap: 12 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                Thành tích sẽ ở trạng thái <Text style={{ fontWeight: "800" }}>chờ duyệt</Text>.
                Admin sẽ xem xét trong thời gian sớm nhất.
              </Text>
            </View>

            <View>
              <Text style={styles.label}>Tên thành tích *</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="VD: Vô địch giải mở rộng miền Bắc 2025"
                placeholderTextColor="#94A3B8"
                style={styles.input}
                maxLength={200}
              />
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ width: 100 }}>
                <Text style={styles.label}>Năm</Text>
                <TextInput
                  value={year}
                  onChangeText={setYear}
                  keyboardType="number-pad"
                  placeholder="2024"
                  placeholderTextColor="#94A3B8"
                  style={styles.input}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Cấp độ</Text>
                <View style={styles.levelPicker}>
                  {Object.entries(LEVEL_LABEL).map(([k, v]) => (
                    <Pressable
                      key={k}
                      onPress={() => setLevel(k)}
                      style={[
                        styles.levelPickerItem,
                        level === k && styles.levelPickerItemActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.levelPickerText,
                          level === k && styles.levelPickerTextActive,
                        ]}
                      >
                        {v}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>

            <View>
              <Text style={styles.label}>Mô tả (tuỳ chọn)</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Vai trò của bạn, số học viên, giải/nội dung cụ thể..."
                placeholderTextColor="#94A3B8"
                style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
                multiline
                maxLength={1000}
              />
            </View>

            <Pressable
              onPress={handleSubmit}
              disabled={isLoading || !title.trim()}
              style={[
                styles.submitBtn,
                (isLoading || !title.trim()) && { opacity: 0.5 },
              ]}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>Gửi thành tích</Text>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 12,
    marginTop: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { fontSize: 15, fontWeight: "800", color: "#0F172A" },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#0066FF",
  },
  addBtnText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  emptyBox: {
    marginTop: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  emptyText: { color: "#1E40AF", fontSize: 12, textAlign: "center" },
  item: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
  },
  itemHeadRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  itemTitle: { fontSize: 14, fontWeight: "700", color: "#0F172A" },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 4,
    alignItems: "center",
  },
  yearChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#fff",
  },
  yearChipText: { fontSize: 11, color: "#334155", fontWeight: "700" },
  levelChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  levelChipText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.2 },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statusChipText: { fontSize: 10, fontWeight: "700" },
  itemDesc: { fontSize: 12, color: "#475569", marginTop: 6 },
  adminNoteText: {
    fontSize: 11,
    color: "#B91C1C",
    fontStyle: "italic",
    marginTop: 4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 24,
    maxHeight: "88%",
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#CBD5E1",
    borderRadius: 999,
    alignSelf: "center",
    marginTop: 8,
    marginBottom: 8,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  modalTitle: { fontSize: 16, fontWeight: "800", color: "#0F172A" },
  infoBox: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  infoText: { color: "#1E40AF", fontSize: 12, lineHeight: 17 },
  label: { fontSize: 12, fontWeight: "700", color: "#334155", marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: "#0F172A",
    backgroundColor: "#fff",
  },
  levelPicker: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  levelPickerItem: {
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#fff",
  },
  levelPickerItemActive: { backgroundColor: "#0066FF", borderColor: "#0066FF" },
  levelPickerText: { fontSize: 11, color: "#334155", fontWeight: "600" },
  levelPickerTextActive: { color: "#fff" },
  submitBtn: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "#0066FF",
    alignItems: "center",
  },
  submitBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
