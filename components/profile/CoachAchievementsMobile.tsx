// components/profile/CoachAchievementsMobile.tsx
// Section thành tích HLV trên trang profile mobile. Owner + admin thấy pending/
// rejected + nút "Bổ sung thành tích".
import {
  Ionicons } from "@expo/vector-icons";
import React, { useState, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { TextInput } from "@/components/ui/i18nTextInput";
import { Text } from "@/components/ui/i18nText";
import {
  useCreateCoachAchievementMutation,
  useDeleteCoachAchievementMutation,
  useListCoachAchievementsQuery,
} from "@/slices/coachesApiSlice";
import { useThemeTokens, type ThemeTokens } from "@/hooks/useThemeTokens";

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
const mkStatusMeta = (
  C: ThemeTokens
): Record<string, { color: string; bg: string; label: string; icon: string }> => ({
  approved: {
    color: C.greenText,
    bg: C.greenSoft,
    label: "Đã duyệt",
    icon: "checkmark-circle",
  },
  pending: {
    color: C.amberText,
    bg: C.amberSoft,
    label: "Chờ duyệt",
    icon: "time-outline",
  },
  rejected: {
    color: C.redText,
    bg: C.redSoft,
    label: "Từ chối",
    icon: "close-circle-outline",
  },
});

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
  const C = useThemeTokens();
  const styles = useMemo(() => mk_styles(C), [C]);
  const STATUS_META = useMemo(() => mkStatusMeta(C), [C]);
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
  const C = useThemeTokens();
  const styles = useMemo(() => mk_styles(C), [C]);
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
              <Ionicons name="close" size={22} color={C.sub} />
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
                placeholderTextColor={C.muted}
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
                  placeholderTextColor={C.muted}
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
                placeholderTextColor={C.muted}
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

const mk_styles = (C: ThemeTokens) => StyleSheet.create({
  card: {
    marginHorizontal: 12,
    marginTop: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { fontSize: 15, fontWeight: "800", color: C.text },
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
    backgroundColor: C.primarySoft,
    borderWidth: 1,
    borderColor: C.dark ? "rgba(0,102,255,0.35)" : "#BFDBFE",
  },
  emptyText: { color: C.dark ? "#93C5FD" : "#1E40AF", fontSize: 12, textAlign: "center" },
  item: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.bg,
  },
  itemHeadRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  itemTitle: { fontSize: 14, fontWeight: "700", color: C.text },
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
    borderColor: C.line,
    backgroundColor: C.card,
  },
  yearChipText: { fontSize: 11, color: C.text2, fontWeight: "700" },
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
  itemDesc: { fontSize: 12, color: C.text3, marginTop: 6 },
  adminNoteText: {
    fontSize: 11,
    color: C.redText,
    fontStyle: "italic",
    marginTop: 4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: C.overlay,
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 24,
    maxHeight: "88%",
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: C.line,
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
  modalTitle: { fontSize: 16, fontWeight: "800", color: C.text },
  infoBox: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: C.primarySoft,
    borderWidth: 1,
    borderColor: C.dark ? "rgba(0,102,255,0.35)" : "#BFDBFE",
  },
  infoText: { color: C.dark ? "#93C5FD" : "#1E40AF", fontSize: 12, lineHeight: 17 },
  label: { fontSize: 12, fontWeight: "700", color: C.text2, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: C.text,
    backgroundColor: C.card,
  },
  levelPicker: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  levelPickerItem: {
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.card,
  },
  levelPickerItemActive: { backgroundColor: "#0066FF", borderColor: "#0066FF" },
  levelPickerText: { fontSize: 11, color: C.text2, fontWeight: "600" },
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
