// app/feed/index.tsx — Bảng tin (list + composer + reactions + link chi tiết)
import { Ionicons } from "@expo/vector-icons";
import { Stack, router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import React, { useState, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSelector } from "react-redux";

import {
  useListFeedQuery,
  useCreateFeedPostMutation,
  useReactFeedPostMutation,
  useUploadFeedMediaMutation,
  useDeleteFeedPostMutation,
  useReportFeedPostMutation,
} from "@/slices/feedApiSlice";
import { FeedMediaViewer } from "@/components/feed/FeedMediaViewer";

const REACTION_EMOJI: Record<string, string> = {
  like: "👍",
  love: "❤️",
  haha: "😆",
  wow: "😮",
  sad: "😢",
  angry: "😡",
};

const fmtTime = (iso?: string) => {
  if (!iso) return "";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "vừa xong";
  if (diff < 3600) return `${Math.floor(diff / 60)} phút`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)} ngày`;
  return new Date(iso).toLocaleDateString("vi-VN");
};

const authorName = (u?: any) => u?.nickname || u?.name || "Người dùng";

/** Extract human-readable error từ RTK Query / fetch / JS Error. */
function extractErr(err: any): string {
  if (!err) return "Lỗi không xác định";
  if (typeof err === "string") return err;
  if (err?.data?.message) return String(err.data.message);
  if (err?.data && typeof err.data === "string") return err.data;
  if (err?.error) return String(err.error);
  if (err?.message) return String(err.message);
  if (err?.status === "FETCH_ERROR") return "Không kết nối được server. Kiểm tra mạng.";
  if (typeof err?.status !== "undefined") return `Lỗi (${err.status})`;
  try {
    return JSON.stringify(err).slice(0, 200);
  } catch {
    return "Lỗi không xác định";
  }
}

type MediaItem = { type: "image" | "video"; url: string; mime?: string };

function Composer({ onPosted }: { onPosted: () => void }) {
  const me = useSelector((s: any) => s.auth?.userInfo);
  const [content, setContent] = useState("");
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [uploadMedia] = useUploadFeedMediaMutation();
  const [createPost, { isLoading }] = useCreateFeedPostMutation();

  const pickMedia = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Cần cấp quyền truy cập thư viện ảnh");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      selectionLimit: 10 - media.length,
      quality: 0.85,
      videoMaxDuration: 60,
    });
    if (res.canceled || !res.assets?.length) return;

    const fd = new FormData();
    for (const a of res.assets) {
      const uri = a.uri;
      const name = a.fileName || uri.split("/").pop() || "upload";
      const type =
        a.mimeType ||
        (a.type === "video" ? "video/mp4" : "image/jpeg");
      // React Native FormData chấp nhận {uri, name, type}
      fd.append("files", { uri, name, type } as any);
    }
    try {
      const r: any = await uploadMedia(fd).unwrap();
      setMedia((prev) => [...prev, ...(r.media || [])].slice(0, 10));
    } catch (err: any) {
      Alert.alert("Upload thất bại", extractErr(err));
    }
  };

  const submit = async () => {
    if (!content.trim() && !media.length) return;
    try {
      await createPost({ content: content.trim(), media }).unwrap();
      setContent("");
      setMedia([]);
      onPosted();
    } catch (err: any) {
      Alert.alert("Đăng thất bại", extractErr(err));
    }
  };

  return (
    <View style={styles.composer}>
      <View style={styles.composerRow}>
        <View style={styles.avatarSm}>
          <Text style={styles.avatarLetter}>
            {authorName(me)[0]?.toUpperCase()}
          </Text>
        </View>
        <TextInput
          style={styles.input}
          multiline
          placeholder={`${authorName(me)} ơi, chia sẻ gì hôm nay?`}
          placeholderTextColor="#94A3B8"
          value={content}
          onChangeText={setContent}
        />
      </View>
      {media.length > 0 && (
        <ScrollView horizontal style={{ marginTop: 8 }} showsHorizontalScrollIndicator={false}>
          {media.map((m, i) => (
            <View key={i} style={styles.mediaPreview}>
              {m.type === "image" ? (
                <Image source={{ uri: m.url }} style={styles.mediaPreviewImg} />
              ) : (
                <View style={[styles.mediaPreviewImg, { alignItems: "center", justifyContent: "center", backgroundColor: "#111" }]}>
                  <Ionicons name="videocam" size={28} color="#fff" />
                </View>
              )}
              <Pressable
                onPress={() => setMedia((prev) => prev.filter((_, j) => j !== i))}
                style={styles.mediaRemove}
              >
                <Ionicons name="close" size={14} color="#fff" />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}
      <View style={styles.composerActions}>
        <Pressable onPress={pickMedia} style={styles.iconBtn}>
          <Ionicons name="images-outline" size={22} color="#0066FF" />
          <Text style={styles.iconBtnLabel}>Ảnh / Video</Text>
        </Pressable>
        <Pressable
          onPress={submit}
          disabled={isLoading || (!content.trim() && !media.length)}
          style={[
            styles.postBtn,
            (isLoading || (!content.trim() && !media.length)) && { opacity: 0.5 },
          ]}
        >
          <Text style={styles.postBtnText}>{isLoading ? "Đang đăng…" : "Đăng"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Media hiển thị cho post:
 *  - 1 ảnh: full width card, auto-scale theo tỉ lệ ảnh (giới hạn tối đa 480pt),
 *    căn giữa chiều ngang.
 *  - Nhiều ảnh/video: horizontal ScrollView pagingEnabled, mỗi slide = full width card
 *    (không lệch trái/phải nữa).
 */
function PostMedia({
  media,
  onOpenViewer,
}: {
  media: any[];
  onOpenViewer: (index: number) => void;
}) {
  const screenW = Dimensions.get("window").width;
  // Card padding ngang 12 + margin ngang 12 → cardContent = screenW - 48
  const cardContentW = Math.max(240, screenW - 12 * 2 - 12 * 2);

  if (media.length === 1) {
    const m = media[0];
    const aspect =
      m?.width && m?.height ? Number(m.width) / Number(m.height) : 1;
    const h = Math.min(480, cardContentW / (aspect || 1));
    return (
      <Pressable
        onPress={() => onOpenViewer(0)}
        style={{ marginTop: 10, alignItems: "center" }}
      >
        {m.type === "image" ? (
          <Image
            source={{ uri: m.url }}
            style={{
              width: cardContentW,
              height: h,
              borderRadius: 10,
            }}
            resizeMode="cover"
          />
        ) : (
          <View
            style={{
              width: cardContentW,
              height: cardContentW,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#111",
              borderRadius: 10,
            }}
          >
            <Ionicons name="play-circle" size={64} color="#fff" />
            <Text style={{ color: "#fff", marginTop: 4 }}>Video</Text>
          </View>
        )}
      </Pressable>
    );
  }

  return (
    <ScrollView
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      style={{ marginTop: 10 }}
      contentContainerStyle={{ alignItems: "center" }}
    >
      {media.slice(0, 8).map((m: any, i: number) => (
        <Pressable
          key={i}
          onPress={() => onOpenViewer(i)}
          style={{ width: cardContentW, marginRight: 8, alignItems: "center" }}
        >
          {m.type === "image" ? (
            <Image
              source={{ uri: m.url }}
              style={{
                width: cardContentW,
                height: cardContentW,
                borderRadius: 10,
              }}
              resizeMode="cover"
            />
          ) : (
            <View
              style={{
                width: cardContentW,
                height: cardContentW,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#111",
                borderRadius: 10,
              }}
            >
              <Ionicons name="play-circle" size={64} color="#fff" />
              <Text style={{ color: "#fff", marginTop: 4 }}>Video</Text>
            </View>
          )}
        </Pressable>
      ))}
    </ScrollView>
  );
}

function PostCard({ post, me }: { post: any; me: any }) {
  const [react] = useReactFeedPostMutation();
  const [deletePost] = useDeleteFeedPostMutation();
  const [reportPost] = useReportFeedPostMutation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  const isMine = String(post.author?._id) === String(me?._id);
  const isAdmin = me?.role === "admin";

  const doReact = async (type: string) => {
    setPickerOpen(false);
    try {
      await react({ id: post._id, type }).unwrap();
    } catch (err: any) {
      Alert.alert("Lỗi", extractErr(err));
    }
  };

  const handleMenu = () => {
    const options = [];
    if (isMine || isAdmin)
      options.push({
        text: "Xoá bài viết",
        onPress: async () => {
          try {
            await deletePost(post._id).unwrap();
          } catch (err: any) {
            Alert.alert("Lỗi", err?.data?.message || String(err));
          }
        },
        style: "destructive" as const,
      });
    options.push({
      text: "Báo cáo",
      onPress: () =>
        Alert.prompt(
          "Lý do báo cáo",
          "spam / harassment / hate / nudity / violence / misinformation / impersonation / other",
          async (reason?: string) => {
            if (!reason) return;
            try {
              await reportPost({ id: post._id, reason }).unwrap();
              Alert.alert("Đã gửi báo cáo");
            } catch (err: any) {
              Alert.alert("Lỗi", err?.data?.message || String(err));
            }
          }
        ),
    });
    Alert.alert("Tuỳ chọn", "", [
      ...options,
      { text: "Đóng", style: "cancel" },
    ]);
  };

  return (
    <View style={styles.postCard}>
      <View style={styles.postHeader}>
        <View style={styles.avatarSm}>
          <Text style={styles.avatarLetter}>
            {authorName(post.author)[0]?.toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.postAuthor}>
            {authorName(post.author)}
            {post.isPinned && <Text style={styles.pinnedBadge}>  📌</Text>}
          </Text>
          <Text style={styles.postTime}>{fmtTime(post.createdAt)}</Text>
        </View>
        <Pressable onPress={handleMenu} hitSlop={12}>
          <Ionicons name="ellipsis-horizontal" size={20} color="#64748B" />
        </Pressable>
      </View>
      {!!post.content && (
        <Text style={styles.postContent}>{post.content}</Text>
      )}
      {post.tags?.length > 0 && (
        <View style={styles.tagRow}>
          {post.tags.map((t: string) => (
            <View key={t} style={styles.tagChip}>
              <Text style={styles.tagChipText}>#{t}</Text>
            </View>
          ))}
        </View>
      )}
      {post.media?.length > 0 && (
        <PostMedia
          media={post.media}
          onOpenViewer={(i) => {
            setViewerIndex(i);
            setViewerOpen(true);
          }}
        />
      )}
      {viewerOpen && (
        <FeedMediaViewer
          visible={viewerOpen}
          media={post.media}
          initialIndex={viewerIndex}
          onClose={() => setViewerOpen(false)}
          post={post}
          me={me}
        />
      )}
      <View style={styles.statsRow}>
        <Text style={styles.statText}>{post.reactionCount || 0} cảm xúc</Text>
        <Text style={styles.statText}>{post.commentCount || 0} bình luận</Text>
      </View>
      <View style={styles.actionRow}>
        <Pressable
          onLongPress={() => setPickerOpen(true)}
          onPress={() => doReact(post.myReaction || "like")}
          style={styles.actionBtn}
        >
          <Text style={{ fontSize: 18 }}>
            {post.myReaction ? REACTION_EMOJI[post.myReaction] : "👍"}
          </Text>
          <Text style={[styles.actionLabel, post.myReaction && { color: "#0066FF", fontWeight: "600" }]}>
            {post.myReaction === "love" ? "Yêu" : "Thích"}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.push(`/feed/post/${post._id}`)}
          style={styles.actionBtn}
        >
          <Ionicons name="chatbubble-outline" size={18} color="#64748B" />
          <Text style={styles.actionLabel}>Bình luận</Text>
        </Pressable>
      </View>
      {pickerOpen && (
        <View style={styles.reactionPicker}>
          {Object.entries(REACTION_EMOJI).map(([k, e]) => (
            <Pressable key={k} onPress={() => doReact(k)} style={styles.reactionPick}>
              <Text style={{ fontSize: 28 }}>{e}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => setPickerOpen(false)} style={styles.reactionPick}>
            <Ionicons name="close" size={22} color="#64748B" />
          </Pressable>
        </View>
      )}
    </View>
  );
}

export default function FeedScreen() {
  const me = useSelector((s: any) => s.auth?.userInfo);
  const { data, isFetching, refetch } = useListFeedQuery({});
  const items = data?.items || [];

  const renderItem = useCallback(
    ({ item }: any) => <PostCard post={item} me={me} />,
    [me]
  );

  if (!me) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: "Bảng tin" }} />
        <View style={styles.emptyLogin}>
          <Text style={styles.emptyTitle}>Đăng nhập để dùng Bảng tin</Text>
          <Pressable onPress={() => router.push("/login")} style={styles.postBtn}>
            <Text style={styles.postBtnText}>Đăng nhập</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Stack.Screen options={{ title: "Bảng tin" }} />
      <FlatList
        data={items}
        keyExtractor={(i: any) => i._id}
        ListHeaderComponent={<Composer onPosted={refetch} />}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={refetch} />
        }
        ListEmptyComponent={
          !isFetching ? (
            <Text style={styles.empty}>
              Chưa có bài viết nào. Hãy là người đầu tiên chia sẻ 👋
            </Text>
          ) : (
            <View style={{ padding: 24 }}>
              <ActivityIndicator />
            </View>
          )
        }
        contentContainerStyle={{ paddingBottom: 40 }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  emptyLogin: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  emptyTitle: { fontSize: 16, marginBottom: 12, color: "#334155" },
  empty: { padding: 24, textAlign: "center", color: "#64748B" },
  composer: {
    backgroundColor: "#fff",
    padding: 12,
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 12,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  composerRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  avatarSm: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#0066FF",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: { color: "#fff", fontWeight: "700", fontSize: 16 },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 160,
    fontSize: 15,
    color: "#0F172A",
    padding: 0,
    paddingTop: 10,
  },
  mediaPreview: {
    width: 80,
    height: 80,
    marginRight: 8,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#E2E8F0",
    position: "relative",
  },
  mediaPreviewImg: { width: "100%", height: "100%" },
  mediaRemove: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  composerActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  iconBtn: { flexDirection: "row", alignItems: "center", gap: 6, padding: 6 },
  iconBtnLabel: { color: "#0066FF", fontWeight: "600" },
  postBtn: {
    backgroundColor: "#0066FF",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  postBtnText: { color: "#fff", fontWeight: "700" },
  postCard: {
    backgroundColor: "#fff",
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 12,
    padding: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  postHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  postAuthor: { fontWeight: "700", color: "#0F172A" },
  pinnedBadge: { color: "#F59E0B" },
  postTime: { fontSize: 12, color: "#64748B", marginTop: 2 },
  postContent: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 22,
    color: "#0F172A",
  },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  tagChip: {
    backgroundColor: "#EEF4FF",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  tagChipText: { color: "#0066FF", fontSize: 12, fontWeight: "600" },
  // mediaRow / mediaSlide / mediaImg: đã chuyển sang <PostMedia/> render động (center).
  statsRow: {
    flexDirection: "row",
    gap: 16,
    marginTop: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  statText: { fontSize: 12, color: "#64748B" },
  actionRow: {
    flexDirection: "row",
    marginTop: 4,
    justifyContent: "space-around",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  actionLabel: { color: "#64748B", fontSize: 14 },
  reactionPicker: {
    position: "absolute",
    left: 12,
    bottom: 40,
    backgroundColor: "#fff",
    borderRadius: 24,
    paddingHorizontal: 8,
    paddingVertical: 6,
    flexDirection: "row",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  reactionPick: { paddingHorizontal: 6, paddingVertical: 4 },
});
