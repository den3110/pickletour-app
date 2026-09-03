// components/clubs/ClubAnnouncementsRN.tsx
import React, { useMemo, useState } from "react";
import {
  View,
  TouchableOpacity,
  Alert,
  StyleSheet,
} from "react-native";
import { TextInput } from "@/components/ui/i18nTextInput";
import { Text } from "@/components/ui/i18nText";
import dayjs from "dayjs";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Section, EmptyState } from "./ui"; // giữ nguyên Section/EmptyState
import { LinearGradient } from "expo-linear-gradient";
import {
  useListAnnouncementsQuery,
  useCreateAnnouncementMutation,
  useUpdateAnnouncementMutation,
  useDeleteAnnouncementMutation,
} from "@/slices/clubsApiSlice";

const getApiErrMsg = (e: any) =>
  e?.data?.message ||
  e?.error ||
  (typeof e?.data === "string" ? e.data : "Có lỗi xảy ra.");

/** Card nền sáng + gradient tím nhạt */
function GradLightCard({
  children,
  style,
  pad = 12,
}: {
  children: React.ReactNode;
  style?: any;
  pad?: number;
}) {
  return (
    <View style={[styles.card, style]}>
      <LinearGradient
        colors={["rgba(102,126,234,0.08)", "rgba(118,75,162,0.08)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={{ padding: pad }}>{children}</View>
    </View>
  );
}

export default function ClubAnnouncementsRN({
  club,
  canManage,
}: {
  club: any;
  canManage: boolean;
}) {
  const clubId = club?._id;
  const { data, isFetching, refetch } = useListAnnouncementsQuery(
    { id: clubId },
    { skip: !clubId }
  );
  const [createA, { isLoading: creating }] = useCreateAnnouncementMutation();
  const [updateA, { isLoading: updating }] = useUpdateAnnouncementMutation();
  const [deleteA] = useDeleteAnnouncementMutation();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pinned, setPinned] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const items = useMemo(
    () =>
      (data?.items || [])
        .slice()
        .sort(
          (a: any, b: any) =>
            (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) ||
            +new Date(b.createdAt) - +new Date(a.createdAt)
        ),
    [data]
  );

  const resetForm = () => {
    setTitle("");
    setContent("");
    setPinned(false);
    setEditId(null);
  };

  const submit = async () => {
    const t = (title || content.split("\n")[0]).trim();
    if (!t) return;
    try {
      if (editId) {
        await updateA({
          id: clubId,
          postId: editId,
          title: t,
          content: content.trim(),
          pinned,
        }).unwrap();
      } else {
        await createA({
          id: clubId,
          title: t,
          content: content.trim(),
          pinned,
        }).unwrap();
      }
      resetForm();
      refetch();
    } catch (e) {
      Alert.alert("Lỗi", getApiErrMsg(e));
    }
  };

  const startEdit = (p: any) => {
    setEditId(p._id);
    setTitle(p.title || "");
    setContent(p.content || "");
    setPinned(!!p.pinned);
  };

  const togglePin = async (p: any) => {
    try {
      await updateA({ id: clubId, postId: p._id, pinned: !p.pinned }).unwrap();
      refetch();
    } catch (e) {
      Alert.alert("Lỗi", getApiErrMsg(e));
    }
  };

  const remove = (p: any) => {
    Alert.alert("Xoá thông báo", "Bạn chắc chắn muốn xoá thông báo này?", [
      { text: "Huỷ", style: "cancel" },
      {
        text: "Xoá",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteA({ id: clubId, postId: p._id }).unwrap();
            refetch();
          } catch (e) {
            Alert.alert("Lỗi", getApiErrMsg(e));
          }
        },
      },
    ]);
  };

  return (
    <Section title="Bảng tin" subtitle={isFetching ? "Đang tải…" : undefined}>
      {canManage && (
        <GradLightCard>
          <Text style={styles.label}>Tiêu đề</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="VD: Thông báo tuần này…"
            placeholderTextColor="#9AA3B2"
            style={styles.input}
          />
          <Text style={[styles.label, { marginTop: 10 }]}>Nội dung</Text>
          <TextInput
            value={content}
            onChangeText={setContent}
            multiline
            placeholder="Chi tiết…"
            placeholderTextColor="#9AA3B2"
            style={[styles.input, { minHeight: 88, textAlignVertical: "top" }]}
          />

          {/* Ghim toggle */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setPinned((v) => !v)}
            style={styles.checkRow}
          >
            <MaterialCommunityIcons
              name={pinned ? "checkbox-marked" : "checkbox-blank-outline"}
              size={20}
              color={pinned ? "#667eea" : "#9AA3B2"}
            />
            <Text style={styles.checkLabel}>Ghim lên đầu</Text>
          </TouchableOpacity>

          <View style={{ marginTop: 12, flexDirection: "row", gap: 8 }}>
            <View style={styles.btnPrimary}>
              <LinearGradient
                colors={["#667eea", "#764ba2"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              <Text onPress={submit} style={styles.btnPrimaryText}>
                {creating || updating
                  ? "Đang lưu…"
                  : editId
                    ? "Lưu thay đổi"
                    : "Đăng thông báo"}
              </Text>
            </View>
            {editId && (
              <TouchableOpacity style={styles.btnLight} onPress={resetForm}>
                <Text style={styles.btnLightText}>Huỷ</Text>
              </TouchableOpacity>
            )}
          </View>
        </GradLightCard>
      )}

      {items.map((p: any) => (
        <GradLightCard key={p._id} style={{ marginTop: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {p.pinned && (
              <View style={styles.pinBadge}>
                <MaterialCommunityIcons name="pin" size={12} color="#B4232D" />
                <Text style={styles.pinBadgeText}>Ghim</Text>
              </View>
            )}
            <Text style={[styles.itemTitle, { flex: 1 }]}>
              {p.title || "Thông báo"}
            </Text>
          </View>
          {!!p.content && <Text style={styles.itemBody}>{p.content}</Text>}
          <Text style={styles.itemTime}>
            {(p.author?.fullName || p.author?.nickname || "Ban quản trị") +
              " • " +
              dayjs(p.createdAt).format("HH:mm, DD/MM/YYYY")}
          </Text>

          {canManage && (
            <View style={styles.adminRow}>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => togglePin(p)}
              >
                <MaterialCommunityIcons
                  name={p.pinned ? "pin-off" : "pin"}
                  size={16}
                  color="#3B3F75"
                />
                <Text style={styles.iconBtnText}>
                  {p.pinned ? "Bỏ ghim" : "Ghim"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => startEdit(p)}
              >
                <MaterialCommunityIcons
                  name="pencil"
                  size={16}
                  color="#3B3F75"
                />
                <Text style={styles.iconBtnText}>Sửa</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.iconBtn, styles.iconBtnDanger]}
                onPress={() => remove(p)}
              >
                <MaterialCommunityIcons
                  name="trash-can-outline"
                  size={16}
                  color="#B4232D"
                />
                <Text style={[styles.iconBtnText, { color: "#B4232D" }]}>
                  Xoá
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </GradLightCard>
      ))}

      {!items.length && !isFetching && (
        <EmptyState label="Chưa có thông báo nào" icon="bell-off-outline" />
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
  // Card sáng
  card: {
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E6E8F5",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
    elevation: 3,
  },

  // Label/input sáng
  label: { color: "#5C6285", marginBottom: 6, fontWeight: "600" },
  input: {
    color: "#1F2340",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E6E8F5",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
  },
  checkLabel: { color: "#4A5270", fontWeight: "600" },

  // Button primary (gradient tím)
  btnPrimary: {
    height: 44,
    minWidth: 150,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  btnPrimaryText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15 },
  btnLight: {
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4FF",
    borderWidth: 1,
    borderColor: "#E6E8F5",
  },
  btnLightText: { color: "#3B3F75", fontWeight: "800", fontSize: 14 },

  // Items
  itemTitle: { color: "#2D3561", fontWeight: "800", fontSize: 16 },
  itemBody: { color: "#4A5270", marginTop: 6, lineHeight: 20 },
  itemTime: { color: "#7780A1", marginTop: 8, fontSize: 12 },

  pinBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "#FFE9EC",
    borderWidth: 1,
    borderColor: "#FFD5DA",
  },
  pinBadgeText: { color: "#B4232D", fontSize: 11, fontWeight: "800" },

  adminRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    flexWrap: "wrap",
  },
  iconBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "#F3F4FF",
    borderWidth: 1,
    borderColor: "#E6E8F5",
  },
  iconBtnDanger: { backgroundColor: "#FFE9EC", borderColor: "#FFD5DA" },
  iconBtnText: { color: "#3B3F75", fontWeight: "700", fontSize: 13 },
});
