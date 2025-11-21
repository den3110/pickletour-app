// components/clubs/ClubAnnouncementsRN.tsx
import React, { useMemo, useState } from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";
import dayjs from "dayjs";
import { Section, EmptyState } from "./ui"; // giữ nguyên Section/EmptyState
import { LinearGradient } from "expo-linear-gradient";
import {
  useListAnnouncementsQuery,
  useCreateAnnouncementMutation,
} from "@/slices/clubsApiSlice";

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
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

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

  const submit = async () => {
    const t = (title || content.split("\n")[0]).trim();
    if (!t) return;
    await createA({ id: clubId, title: t, content: content.trim() }).unwrap();
    setTitle("");
    setContent("");
    refetch();
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

          {/* Nút primary: bạn đã đổi màu nền nút ở file khác.
              Ở đây dùng button thuần để chắc màu phù hợp nền sáng */}
          <View style={{ marginTop: 12 }}>
            <View style={styles.btnPrimary}>
              <LinearGradient
                colors={["#667eea", "#764ba2"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              <Text onPress={submit} style={styles.btnPrimaryText}>
                {creating ? "Đang đăng…" : "Đăng thông báo"}
              </Text>
            </View>
          </View>
        </GradLightCard>
      )}

      {items.map((p: any) => (
        <GradLightCard key={p._id} style={{ marginTop: 10 }}>
          <Text style={styles.itemTitle}>{p.title || "Thông báo"}</Text>
          {!!p.content && <Text style={styles.itemBody}>{p.content}</Text>}
          <Text style={styles.itemTime}>
            {dayjs(p.createdAt).format("HH:mm, DD/MM/YYYY")}
          </Text>
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

  // Button primary (gradient tím)
  btnPrimary: {
    height: 44,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  btnPrimaryText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15 },

  // Items
  itemTitle: { color: "#2D3561", fontWeight: "800", fontSize: 16 },
  itemBody: { color: "#4A5270", marginTop: 6, lineHeight: 20 },
  itemTime: { color: "#7780A1", marginTop: 8, fontSize: 12 },
});
