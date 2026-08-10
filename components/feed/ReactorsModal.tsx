// components/feed/ReactorsModal.tsx — Modal xem danh sách user đã thả cảm xúc
// cho 1 bài viết hoặc 1 bình luận. Có tab lọc theo loại reaction giống Facebook.
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  Text,
  View,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { AuthorAvatar } from "@/components/social/AuthorAvatar";
import {
  useLazyListPostReactorsQuery,
  useLazyListCommentReactorsQuery,
} from "@/slices/feedApiSlice";

const EMOJI: Record<string, string> = {
  like: "👍",
  love: "❤️",
  haha: "😂",
  wow: "😮",
  sad: "😢",
  angry: "😡",
};
const LABEL: Record<string, string> = {
  like: "Thích",
  love: "Yêu thích",
  haha: "Haha",
  wow: "Wow",
  sad: "Buồn",
  angry: "Phẫn nộ",
};
const ORDER = ["like", "love", "haha", "wow", "sad", "angry"];

export function ReactorsModal({
  visible,
  onClose,
  postId,
  commentId,
}: {
  visible: boolean;
  onClose: () => void;
  postId?: string | null;
  commentId?: string | null;
}) {
  const [triggerPost, postRes] = useLazyListPostReactorsQuery();
  const [triggerComment, commentRes] = useLazyListCommentReactorsQuery();
  const [activeTab, setActiveTab] = useState<string>("all");

  React.useEffect(() => {
    if (!visible) return;
    setActiveTab("all");
    if (postId) {
      triggerPost({ postId, type: undefined } as any);
    } else if (commentId) {
      triggerComment({ cid: commentId, type: undefined } as any);
    }
  }, [visible, postId, commentId, triggerPost, triggerComment]);

  const data = postId ? postRes.data : commentRes.data;
  const isLoading = postId ? postRes.isFetching : commentRes.isFetching;
  const countByType = (data as any)?.countByType || {};
  const items = (data as any)?.items || [];
  const filtered = useMemo(
    () =>
      activeTab === "all"
        ? items
        : items.filter((r: any) => r.type === activeTab),
    [items, activeTab]
  );
  const availableTypes = ORDER.filter((t) => (countByType[t] || 0) > 0);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Cảm xúc</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color="#0F172A" />
            </Pressable>
          </View>

          <View style={styles.tabsRow}>
            <Pressable
              onPress={() => setActiveTab("all")}
              style={[
                styles.tabChip,
                activeTab === "all" && styles.tabChipActive,
              ]}
            >
              <Text
                style={[
                  styles.tabChipText,
                  activeTab === "all" && styles.tabChipTextActive,
                ]}
              >
                Tất cả {(data as any)?.total ? `${(data as any).total}` : ""}
              </Text>
            </Pressable>
            {availableTypes.map((t) => (
              <Pressable
                key={t}
                onPress={() => setActiveTab(t)}
                style={[
                  styles.tabChip,
                  activeTab === t && styles.tabChipActive,
                ]}
              >
                <Text style={{ fontSize: 14 }}>{EMOJI[t]}</Text>
                <Text
                  style={[
                    styles.tabChipText,
                    activeTab === t && styles.tabChipTextActive,
                  ]}
                >
                  {countByType[t] || 0}
                </Text>
              </Pressable>
            ))}
          </View>

          {isLoading ? (
            <ActivityIndicator style={{ marginVertical: 24 }} />
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(r: any, i: number) =>
                String(r.user?._id || i)
              }
              contentContainerStyle={{ paddingBottom: 24 }}
              ItemSeparatorComponent={() => (
                <View style={styles.divider} />
              )}
              ListEmptyComponent={
                <View style={{ padding: 24, alignItems: "center" }}>
                  <Text style={{ color: "#94A3B8" }}>
                    Chưa có ai thả cảm xúc
                  </Text>
                </View>
              }
              renderItem={({ item }) => {
                const u = item.user || {};
                const name = u.nickname || u.name || "Người dùng";
                return (
                  <Pressable
                    style={styles.row}
                    onPress={() => {
                      if (u._id) {
                        onClose();
                        router.push(`/profile/${u._id}` as any);
                      }
                    }}
                  >
                    <View style={{ position: "relative" }}>
                      <AuthorAvatar user={u} size={44} />
                      <View style={styles.emojiBadge}>
                        <Text style={{ fontSize: 12 }}>
                          {EMOJI[item.type] || "👍"}
                        </Text>
                      </View>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name} numberOfLines={1}>
                        {name}
                      </Text>
                      <Text style={styles.reactionLabel}>
                        {LABEL[item.type] || item.type}
                      </Text>
                    </View>
                  </Pressable>
                );
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 12,
    paddingTop: 8,
    maxHeight: "75%",
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#CBD5E1",
    marginBottom: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  headerTitle: { fontSize: 17, fontWeight: "700", color: "#0F172A" },
  tabsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 4,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  tabChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#F1F5F9",
  },
  tabChipActive: { backgroundColor: "#DBEAFE" },
  tabChipText: { fontSize: 13, color: "#334155", fontWeight: "500" },
  tabChipTextActive: { color: "#0066FF", fontWeight: "700" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  emojiBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  name: { fontSize: 15, fontWeight: "600", color: "#0F172A" },
  reactionLabel: { fontSize: 12, color: "#64748B", marginTop: 2 },
  divider: { height: 1, backgroundColor: "#F1F5F9", marginLeft: 68 },
});
