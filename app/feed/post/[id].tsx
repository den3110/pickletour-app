// app/feed/post/[id].tsx — Chi tiết bài viết + comments + reply
import { Ionicons } from "@expo/vector-icons";
import { Stack, router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useSelector } from "react-redux";

import {
  useGetFeedPostQuery,
  useListFeedCommentsQuery,
  useCreateFeedCommentMutation,
  useDeleteFeedCommentMutation,
  useReportFeedPostMutation,
  useReportFeedCommentMutation,
} from "@/slices/feedApiSlice";
import { useBlockUserMutation } from "@/slices/friendsApiSlice";
import {
  confirmBlock,
  pickReportReason,
  reportSuccess,
} from "@/utils/contentModeration";
import { FeedMediaViewer } from "@/components/feed/FeedMediaViewer";
import { MentionText } from "@/components/feed/MentionText";
import { AuthorAvatar } from "@/components/social/AuthorAvatar";
import { useLazySearchUserQuery } from "@/slices/usersApiSlice";

const authorName = (u?: any) => u?.nickname || u?.name || "Người dùng";
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

const fmtTime = (iso?: string) => {
  if (!iso) return "";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "vừa xong";
  if (diff < 3600) return `${Math.floor(diff / 60)} phút`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ`;
  return new Date(iso).toLocaleDateString("vi-VN");
};

function CommentItem({
  comment,
  postId,
  me,
  onReply,
}: {
  comment: any;
  postId: string;
  me: any;
  onReply: (cid: string) => void;
}) {
  // Trong màn Chi tiết bài viết → auto-expand toàn bộ phản hồi.
  const [showReplies, setShowReplies] = useState(
    Number(comment?.replyCount || 0) > 0
  );
  const { data: replies } = useListFeedCommentsQuery(
    showReplies ? { postId, parent: comment._id } : (undefined as any),
    { skip: !showReplies }
  );
  const [deleteComment] = useDeleteFeedCommentMutation();
  const [reportComment] = useReportFeedCommentMutation();
  const isMine = String(comment.author?._id) === String(me?._id);
  const isAdmin = me?.role === "admin";

  const handleDelete = () => {
    Alert.alert("Xoá bình luận?", undefined, [
      { text: "Huỷ", style: "cancel" },
      {
        text: "Xoá",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteComment(comment._id).unwrap();
          } catch (err: any) {
            Alert.alert("Lỗi", extractErr(err));
          }
        },
      },
    ]);
  };

  const handleReport = () => {
    pickReportReason(async (reason) => {
      try {
        await reportComment({ id: String(comment._id), reason }).unwrap();
        reportSuccess();
      } catch (err: any) {
        Alert.alert("Lỗi", extractErr(err));
      }
    });
  };

  return (
    <View style={{ marginBottom: 10 }}>
      <View style={styles.commentRow}>
        <Pressable
          onPress={() =>
            comment.author?._id &&
            router.push(`/profile/${comment.author._id}`)
          }
          hitSlop={6}
        >
          <AuthorAvatar user={comment.author} size={32} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <View style={styles.commentBubble}>
            <Pressable
              onPress={() =>
                comment.author?._id &&
                router.push(`/profile/${comment.author._id}`)
              }
              hitSlop={4}
            >
              <Text style={styles.commentAuthor}>
                {authorName(comment.author)}
              </Text>
            </Pressable>
            <MentionText
              content={comment.content}
              mentions={comment.mentions}
              style={styles.commentText}
            />
          </View>
          <View style={styles.commentMeta}>
            <Text style={styles.commentMetaText}>
              {fmtTime(comment.createdAt)}
            </Text>
            <Pressable onPress={() => onReply(comment._id)}>
              <Text style={[styles.commentMetaText, { fontWeight: "600" }]}>
                Trả lời
              </Text>
            </Pressable>
            {(isMine || isAdmin) && (
              <Pressable onPress={handleDelete}>
                <Text style={[styles.commentMetaText, { color: "#DC2626" }]}>
                  Xoá
                </Text>
              </Pressable>
            )}
            {!isMine && (
              <Pressable onPress={handleReport}>
                <Text style={styles.commentMetaText}>Báo cáo</Text>
              </Pressable>
            )}
            {comment.replyCount > 0 && (
              <Pressable onPress={() => setShowReplies((v) => !v)}>
                <Text style={[styles.commentMetaText, { fontWeight: "600" }]}>
                  {showReplies
                    ? "Ẩn"
                    : `Xem ${comment.replyCount} phản hồi`}
                </Text>
              </Pressable>
            )}
          </View>
          {showReplies &&
            (replies?.items || []).map((r: any) => (
              <View key={r._id} style={{ marginTop: 8, paddingLeft: 12 }}>
                <CommentItem
                  comment={r}
                  postId={postId}
                  me={me}
                  onReply={onReply}
                />
              </View>
            ))}
        </View>
      </View>
    </View>
  );
}

export default function FeedPostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useSelector((s: any) => s.auth?.userInfo);
  const headerHeight = useHeaderHeight();
  const { data: post, isFetching } = useGetFeedPostQuery(String(id), {
    skip: !id,
  });
  const { data: comments } = useListFeedCommentsQuery(
    { postId: String(id) },
    { skip: !id }
  );
  const [createComment, { isLoading: sending }] = useCreateFeedCommentMutation();
  const [reportPostMut] = useReportFeedPostMutation();
  const [blockUserMut] = useBlockUserMutation();
  const [text, setText] = useState("");
  const [replyTarget, setReplyTarget] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  // ===== @mention =====
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionRange, setMentionRange] = useState<{
    start: number;
    end: number;
  } | null>(null);
  const [mentionResults, setMentionResults] = useState<any[]>([]);
  const mentionDebounceRef = React.useRef<any>(null);
  const [triggerUserSearch] = useLazySearchUserQuery();

  const onChangeText = (v: string) => {
    setText(v);
    const caret = v.length;
    const before = v.slice(0, caret);
    // Cho phép nickname/tên có tối đa 3 từ (2 dấu cách)
    const m = before.match(
      /(^|\s)@([\p{L}\p{N}._-]+(?: [\p{L}\p{N}._-]+){0,2})$/u
    );
    if (m) {
      const q = m[2];
      const start = before.length - q.length - 1;
      setMentionQuery(q);
      setMentionRange({ start, end: caret });
    } else {
      setMentionQuery(null);
      setMentionRange(null);
      setMentionResults([]);
    }
  };

  React.useEffect(() => {
    if (mentionQuery == null) return;
    if (mentionDebounceRef.current) clearTimeout(mentionDebounceRef.current);
    mentionDebounceRef.current = setTimeout(async () => {
      if (!mentionQuery || mentionQuery.length < 1) {
        setMentionResults([]);
        return;
      }
      try {
        const r: any = await triggerUserSearch(mentionQuery).unwrap();
        const list = Array.isArray(r) ? r : r?.items || r?.data || [];
        setMentionResults(list.slice(0, 6));
      } catch {
        setMentionResults([]);
      }
    }, 250);
    return () => {
      if (mentionDebounceRef.current) clearTimeout(mentionDebounceRef.current);
    };
  }, [mentionQuery, triggerUserSearch]);

  const insertMention = (u: any) => {
    if (!mentionRange) return;
    const nick = u?.nickname || u?.name || "";
    if (!nick || !u?._id) return;
    const before = text.slice(0, mentionRange.start);
    const after = text.slice(mentionRange.end);
    setText(`${before}@${nick} ${after}`);
    setMentionQuery(null);
    setMentionRange(null);
    setMentionResults([]);
  };

  const isMine = post && String(post.author?._id) === String(me?._id);

  const openPostMenu = () => {
    if (!post) return;
    const opts: any[] = [];
    if (!isMine) {
      opts.push({
        text: "Báo cáo bài viết",
        onPress: () =>
          pickReportReason(async (reason) => {
            try {
              await reportPostMut({ id: String(post._id), reason }).unwrap();
              reportSuccess();
            } catch (err: any) {
              Alert.alert("Lỗi", extractErr(err));
            }
          }),
      });
      if (post.author?._id) {
        opts.push({
          text: "Chặn người này",
          style: "destructive" as const,
          onPress: () => {
            const name =
              post.author?.nickname || post.author?.name || "user này";
            confirmBlock(name, async () => {
              try {
                await blockUserMut(String(post.author._id)).unwrap();
                Alert.alert("Đã chặn", `${name} sẽ không xuất hiện nữa.`);
                router.back();
              } catch (err: any) {
                Alert.alert("Lỗi", extractErr(err));
              }
            });
          },
        });
      }
    }
    if (opts.length === 0) return;
    Alert.alert("Tuỳ chọn", undefined, [
      ...opts,
      { text: "Đóng", style: "cancel" as const },
    ]);
  };

  const submit = async () => {
    if (!text.trim()) return;
    try {
      await createComment({
        postId: String(id),
        content: text.trim(),
        parent: replyTarget,
      }).unwrap();
      setText("");
      setReplyTarget(null);
    } catch (err: any) {
      Alert.alert("Lỗi", extractErr(err));
    }
  };

  if (isFetching || !post) {
    return (
      <View
        style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
      >
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <Stack.Screen options={{ title: "Chi tiết bài viết" }} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? headerHeight : 0}
      >
        <ScrollView
          contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          <View style={styles.postCard}>
            <View style={styles.postHeader}>
              <Pressable
                onPress={() =>
                  post.author?._id && router.push(`/profile/${post.author._id}`)
                }
                hitSlop={6}
              >
                <AuthorAvatar user={post.author} size={40} />
              </Pressable>
              <Pressable
                onPress={() =>
                  post.author?._id && router.push(`/profile/${post.author._id}`)
                }
                style={{ flex: 1 }}
                hitSlop={6}
              >
                <Text style={styles.postAuthor}>
                  {authorName(post.author)}
                </Text>
                <Text style={styles.postTime}>{fmtTime(post.createdAt)}</Text>
              </Pressable>
              {!isMine && (
                <Pressable onPress={openPostMenu} hitSlop={12}>
                  <Ionicons
                    name="ellipsis-horizontal"
                    size={20}
                    color="#64748B"
                  />
                </Pressable>
              )}
            </View>
            {!!post.content && (
              <MentionText
                content={post.content}
                mentions={post.mentions}
                style={styles.postContent}
              />
            )}
            {post.media?.length > 0 && (
              (() => {
                const screenW = Dimensions.get("window").width;
                const cardW = Math.max(240, screenW - 12 * 2 - 12 * 2);
                const openViewer = (i: number) => {
                  setViewerIndex(i);
                  setViewerOpen(true);
                };
                if (post.media.length === 1) {
                  const m = post.media[0];
                  const aspect =
                    m?.width && m?.height
                      ? Number(m.width) / Number(m.height)
                      : 1;
                  const h = Math.min(480, cardW / (aspect || 1));
                  return (
                    <Pressable
                      onPress={() => openViewer(0)}
                      style={{ marginTop: 10, alignItems: "center" }}
                    >
                      {m.type === "image" ? (
                        <Image
                          source={{ uri: m.url }}
                          style={{ width: cardW, height: h, borderRadius: 10 }}
                          resizeMode="cover"
                        />
                      ) : (
                        <View
                          style={{
                            width: cardW,
                            height: cardW,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: "#111",
                            borderRadius: 10,
                          }}
                        >
                          <Ionicons name="play-circle" size={64} color="#fff" />
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
                    {post.media.map((m: any, i: number) => (
                      <Pressable
                        key={i}
                        onPress={() => openViewer(i)}
                        style={{
                          width: cardW,
                          marginRight: 8,
                          alignItems: "center",
                        }}
                      >
                        {m.type === "image" ? (
                          <Image
                            source={{ uri: m.url }}
                            style={{
                              width: cardW,
                              height: cardW,
                              borderRadius: 10,
                            }}
                            resizeMode="cover"
                          />
                        ) : (
                          <View
                            style={{
                              width: cardW,
                              height: cardW,
                              alignItems: "center",
                              justifyContent: "center",
                              backgroundColor: "#111",
                              borderRadius: 10,
                            }}
                          >
                            <Ionicons
                              name="play-circle"
                              size={64}
                              color="#fff"
                            />
                          </View>
                        )}
                      </Pressable>
                    ))}
                  </ScrollView>
                );
              })()
            )}
            {viewerOpen && (
              <FeedMediaViewer
                visible={viewerOpen}
                media={post.media || []}
                initialIndex={viewerIndex}
                onClose={() => setViewerOpen(false)}
                post={post}
                me={me}
              />
            )}
          </View>

          <Text style={styles.sectionTitle}>Bình luận</Text>
          {(comments?.items || []).map((c: any) => (
            <CommentItem
              key={c._id}
              comment={c}
              postId={String(id)}
              me={me}
              onReply={(cid) => setReplyTarget(cid)}
            />
          ))}
          {comments?.items?.length === 0 && (
            <Text style={{ color: "#64748B", padding: 12 }}>
              Chưa có bình luận. Hãy là người đầu tiên!
            </Text>
          )}
        </ScrollView>

        <View style={styles.commentBar}>
          {replyTarget && (
            <View style={styles.replyIndicator}>
              <Text style={{ color: "#64748B", fontSize: 12 }}>
                Đang trả lời một bình luận
              </Text>
              <Pressable onPress={() => setReplyTarget(null)}>
                <Ionicons name="close" size={18} color="#64748B" />
              </Pressable>
            </View>
          )}
          {/* @ mention suggestions — nằm trên TextInput */}
          {mentionQuery != null && mentionResults.length > 0 && (
            <View style={styles.mentionList}>
              {mentionResults.map((u: any) => (
                <Pressable
                  key={u._id}
                  onPress={() => insertMention(u)}
                  style={({ pressed }) => [
                    styles.mentionItem,
                    pressed && { backgroundColor: "#F1F5F9" },
                  ]}
                >
                  <AuthorAvatar user={u} size={32} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.mentionNick} numberOfLines={1}>
                      @{u.nickname || u.name}
                    </Text>
                    {!!u.name && u.name !== u.nickname && (
                      <Text style={styles.mentionName} numberOfLines={1}>
                        {u.name}
                      </Text>
                    )}
                  </View>
                </Pressable>
              ))}
            </View>
          )}
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <TextInput
              style={styles.commentInput}
              placeholder={
                replyTarget ? "Viết phản hồi…" : "Viết bình luận…"
              }
              value={text}
              onChangeText={onChangeText}
              multiline
            />
            <Pressable
              onPress={submit}
              disabled={sending || !text.trim()}
              style={[
                styles.sendBtn,
                (sending || !text.trim()) && { opacity: 0.5 },
              ]}
            >
              <Ionicons name="send" size={18} color="#fff" />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  postCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  postHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatarSm: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#0066FF",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarXs: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#94A3B8",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: { color: "#fff", fontWeight: "700" },
  postAuthor: { fontWeight: "700", color: "#0F172A" },
  postTime: { fontSize: 12, color: "#64748B", marginTop: 2 },
  postContent: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 22,
    color: "#0F172A",
  },
  sectionTitle: {
    fontWeight: "700",
    fontSize: 15,
    color: "#0F172A",
    marginTop: 8,
    marginBottom: 12,
  },
  commentRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  commentBubble: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  commentAuthor: { fontWeight: "700", color: "#0F172A", fontSize: 13 },
  commentText: { color: "#0F172A", marginTop: 2 },
  commentMeta: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
    paddingLeft: 12,
    alignItems: "center",
  },
  commentMetaText: { fontSize: 12, color: "#64748B" },
  commentBar: {
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingTop: 10,
    // SafeAreaView edges=["bottom"] đã trừ home indicator, thêm 12 để thoáng.
    paddingBottom: 12,
  },
  replyIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 6,
    marginBottom: 4,
    backgroundColor: "#F1F5F9",
    borderRadius: 8,
  },
  commentInput: {
    flex: 1,
    minHeight: 36,
    maxHeight: 120,
    backgroundColor: "#F1F5F9",
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: "#0F172A",
  },
  sendBtn: {
    marginLeft: 8,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#0066FF",
    alignItems: "center",
    justifyContent: "center",
  },
  mentionList: {
    marginBottom: 6,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    maxHeight: 240,
    overflow: "hidden",
  },
  mentionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  mentionNick: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
  },
  mentionName: {
    fontSize: 11,
    color: "#64748B",
  },
});
