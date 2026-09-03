// components/feed/FeedMediaViewer.tsx
// Full-screen viewer kiểu Facebook: swipe ngang, tap để ẩn/hiện overlay,
// bar dưới hiện reaction + số cảm xúc + comments, tap "Bình luận" mở bottom
// sheet CommentThread ngay trong viewer.
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { TextInput } from "@/components/ui/i18nTextInput";
import { Text } from "@/components/ui/i18nText";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useVideoPlayer, VideoView } from "expo-video";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import {
  useCreateFeedCommentMutation,
  useDeleteFeedCommentMutation,
  useListFeedCommentsQuery,
  useReactFeedPostMutation,
} from "@/slices/feedApiSlice";
import { AuthorAvatar } from "@/components/social/AuthorAvatar";

type Media = {
  type: "image" | "video";
  url: string;
  width?: number;
  height?: number;
};

const REACTION_EMOJI: Record<string, string> = {
  like: "👍",
  love: "❤️",
  haha: "😆",
  wow: "😮",
  sad: "😢",
  angry: "😡",
};

const authorName = (u?: any) => u?.nickname || u?.name || "Người dùng";

function extractErr(err: any): string {
  if (err?.data?.message) return String(err.data.message);
  if (err?.message) return String(err.message);
  return "Lỗi không xác định";
}

function ImageSlide({
  url,
  width,
  height,
}: {
  url: string;
  width: number;
  height: number;
}) {
  return (
    <View
      style={{ width, height, alignItems: "center", justifyContent: "center" }}
    >
      <Image
        source={{ uri: url }}
        style={{ width, height }}
        resizeMode="contain"
      />
    </View>
  );
}

function VideoSlide({
  url,
  width,
  height,
  active,
}: {
  url: string;
  width: number;
  height: number;
  active: boolean;
}) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
    p.muted = false;
  });

  useEffect(() => {
    if (!player) return;
    try {
      if (active) player.play();
      else player.pause();
    } catch {}
  }, [active, player]);

  return (
    <View
      style={{ width, height, alignItems: "center", justifyContent: "center" }}
    >
      <VideoView
        style={{ width, height }}
        player={player}
        allowsFullscreen
        nativeControls
        contentFit="contain"
      />
    </View>
  );
}

/** 1 slide media — image hoặc video. Chỉ mount hook video khi cần. */
function MediaSlide({
  media,
  width,
  height,
  active,
}: {
  media: Media;
  width: number;
  height: number;
  active: boolean;
}) {
  if (media.type === "video") {
    return (
      <VideoSlide url={media.url} width={width} height={height} active={active} />
    );
  }
  return <ImageSlide url={media.url} width={width} height={height} />;
}

/** Bottom sheet đơn giản dùng Modal transparent slide-from-bottom. */
function CommentsSheet({
  visible,
  onClose,
  postId,
  me,
}: {
  visible: boolean;
  onClose: () => void;
  postId: string;
  me: any;
}) {
  const [replyTarget, setReplyTarget] = useState<string | null>(null);
  const [text, setText] = useState("");
  const { data, isFetching } = useListFeedCommentsQuery(
    visible ? { postId } : (undefined as any),
    { skip: !visible }
  );
  const [createComment, { isLoading: sending }] =
    useCreateFeedCommentMutation();
  const [deleteComment] = useDeleteFeedCommentMutation();

  const submit = async () => {
    if (!text.trim()) return;
    try {
      await createComment({
        postId,
        content: text.trim(),
        parent: replyTarget,
      }).unwrap();
      setText("");
      setReplyTarget(null);
    } catch (err: any) {
      Alert.alert("Lỗi", extractErr(err));
    }
  };

  const handleDelete = (cid: string) => {
    Alert.alert("Xoá bình luận?", undefined, [
      { text: "Huỷ", style: "cancel" },
      {
        text: "Xoá",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteComment(cid).unwrap();
          } catch (err: any) {
            Alert.alert("Lỗi", extractErr(err));
          }
        },
      },
    ]);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.sheetBackdrop}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <SafeAreaView
          edges={["bottom"]}
          style={styles.sheetContainer}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ flex: 1 }}
          >
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Bình luận</Text>
              <Pressable onPress={onClose} hitSlop={12}>
                <Ionicons name="close" size={22} color="#0F172A" />
              </Pressable>
            </View>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 12, paddingBottom: 20 }}
            >
              {isFetching && !data && <ActivityIndicator />}
              {(data?.items || []).length === 0 && !isFetching && (
                <Text style={{ color: "#64748B", textAlign: "center" }}>
                  Chưa có bình luận. Hãy là người đầu tiên!
                </Text>
              )}
              {(data?.items || []).map((c: any) => (
                <SheetCommentItem
                  key={c._id}
                  comment={c}
                  postId={postId}
                  me={me}
                  onReply={() => setReplyTarget(c._id)}
                  onDelete={handleDelete}
                />
              ))}
            </ScrollView>
            <View style={styles.sheetInputRow}>
              {replyTarget && (
                <View style={styles.replyIndicator}>
                  <Text style={{ color: "#64748B", fontSize: 12 }}>
                    Đang trả lời một bình luận
                  </Text>
                  <Pressable onPress={() => setReplyTarget(null)}>
                    <Ionicons name="close" size={16} color="#64748B" />
                  </Pressable>
                </View>
              )}
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <TextInput
                  style={styles.sheetInput}
                  placeholder={
                    replyTarget ? "Viết phản hồi…" : "Viết bình luận…"
                  }
                  value={text}
                  onChangeText={setText}
                  multiline
                  placeholderTextColor="#94A3B8"
                />
                <Pressable
                  onPress={submit}
                  disabled={sending || !text.trim()}
                  style={[
                    styles.sheetSend,
                    (sending || !text.trim()) && { opacity: 0.5 },
                  ]}
                >
                  <Ionicons name="send" size={18} color="#fff" />
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function SheetCommentItem({
  comment,
  postId,
  me,
  onReply,
  onDelete,
}: {
  comment: any;
  postId: string;
  me: any;
  onReply: () => void;
  onDelete: (cid: string) => void;
}) {
  const [showReplies, setShowReplies] = useState(false);
  const { data: replies } = useListFeedCommentsQuery(
    showReplies ? { postId, parent: comment._id } : (undefined as any),
    { skip: !showReplies }
  );
  const canDelete =
    String(comment.author?._id) === String(me?._id) || me?.role === "admin";

  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
        <AuthorAvatar user={comment.author} size={28} />
        <View style={{ flex: 1 }}>
          <View style={styles.commentBubble}>
            <Text style={styles.commentAuthor}>
              {authorName(comment.author)}
            </Text>
            <Text style={styles.commentText}>{comment.content}</Text>
          </View>
          <View style={styles.commentMeta}>
            <Pressable onPress={onReply}>
              <Text style={[styles.commentMetaText, { fontWeight: "600" }]}>
                Trả lời
              </Text>
            </Pressable>
            {canDelete && (
              <Pressable onPress={() => onDelete(comment._id)}>
                <Text style={[styles.commentMetaText, { color: "#DC2626" }]}>
                  Xoá
                </Text>
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
                <SheetCommentItem
                  comment={r}
                  postId={postId}
                  me={me}
                  onReply={onReply}
                  onDelete={onDelete}
                />
              </View>
            ))}
        </View>
      </View>
    </View>
  );
}

/** Full-screen media viewer với swipe-down-to-dismiss kiểu Facebook. */
export function FeedMediaViewer({
  visible,
  media,
  initialIndex = 0,
  onClose,
  post,
  me,
}: {
  visible: boolean;
  media: Media[];
  initialIndex?: number;
  onClose: () => void;
  post: any;
  me: any;
}) {
  const { width, height } = Dimensions.get("window");
  const [index, setIndex] = useState(initialIndex);
  const [showOverlay, setShowOverlay] = useState(true);
  const [showComments, setShowComments] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const [react] = useReactFeedPostMutation();

  // Shared values cho swipe-down-to-dismiss
  const translateY = useSharedValue(0);
  const bgOpacity = useSharedValue(1); // 1 = đen full, 0 = trong suốt

  useEffect(() => {
    if (visible) {
      setIndex(initialIndex);
      setShowOverlay(true);
      translateY.value = 0;
      bgOpacity.value = 1;
      // scroll về slide đầu sau mount
      setTimeout(() => {
        scrollRef.current?.scrollTo({
          x: width * initialIndex,
          animated: false,
        });
      }, 30);
    } else {
      setShowComments(false);
      setShowReactionPicker(false);
    }
  }, [visible, initialIndex, width, translateY, bgOpacity]);

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const i = Math.round(x / width);
    setIndex(i);
  };

  const doReact = async (type: string) => {
    setShowReactionPicker(false);
    try {
      await react({ id: post._id, type }).unwrap();
    } catch (err: any) {
      Alert.alert("Lỗi", extractErr(err));
    }
  };

  // Pan gesture: chỉ kích hoạt khi kéo dọc >20pt, fail khi kéo ngang (để
  // horizontal ScrollView xử lý swipe giữa các media). Kéo xuống → dismiss;
  // kéo lên nhẹ → cho phép nhưng khi nhả thì snap về 0.
  const closeFromWorklet = () => {
    onClose();
  };
  const pan = Gesture.Pan()
    .activeOffsetY([-20, 20])
    .failOffsetX([-15, 15])
    .onUpdate((e) => {
      "worklet";
      translateY.value = e.translationY;
      // Fade backdrop khi kéo xuống, giữ nguyên khi kéo lên
      const abs = Math.abs(e.translationY);
      bgOpacity.value = Math.max(0, 1 - abs / (height * 0.6));
    })
    .onEnd((e) => {
      "worklet";
      const shouldDismiss =
        Math.abs(e.translationY) > 120 || Math.abs(e.velocityY) > 900;
      if (shouldDismiss) {
        translateY.value = withTiming(
          e.translationY > 0 ? height : -height,
          { duration: 220 }
        );
        bgOpacity.value = withTiming(0, { duration: 200 });
        runOnJS(closeFromWorklet)();
      } else {
        translateY.value = withTiming(0, { duration: 200 });
        bgOpacity.value = withTiming(1, { duration: 200 });
      }
    });

  const bgStyle = useAnimatedStyle(() => ({
    opacity: bgOpacity.value,
  }));
  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    // ẩn overlay khi kéo (tránh che animation)
    opacity: 1 - Math.min(0.4, Math.abs(translateY.value) / 800),
  }));

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent // để backdrop có thể fade thấy được app phía dưới khi drag
      onRequestClose={onClose}
      statusBarTranslucent
      supportedOrientations={["portrait", "landscape"]}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        {/* Backdrop đen — opacity animated */}
        <Animated.View
          style={[StyleSheet.absoluteFillObject, { backgroundColor: "#000" }, bgStyle]}
          pointerEvents="none"
        />
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.viewerRoot, contentStyle]}>
            <ScrollView
              ref={scrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={onMomentumEnd}
              scrollEventThrottle={16}
            >
              {media.map((m, i) => (
                <Pressable
                  key={`${m.url}-${i}`}
                  onPress={() => setShowOverlay((v) => !v)}
                  style={{ width, height }}
                >
                  <MediaSlide
                    media={m}
                    width={width}
                    height={height}
                    active={i === index}
                  />
                </Pressable>
              ))}
            </ScrollView>

            {/* TOP overlay: close + counter */}
            {showOverlay && (
              <SafeAreaView
                edges={["top"]}
                style={styles.topOverlay}
                pointerEvents="box-none"
              >
                <View style={styles.topRow}>
                  <Pressable
                    onPress={onClose}
                    hitSlop={12}
                    style={styles.circleBtn}
                  >
                    <Ionicons name="close" size={24} color="#fff" />
                  </Pressable>
                  <Text style={styles.counterText}>
                    {index + 1} / {media.length}
                  </Text>
                  <View style={{ width: 40 }} />
                </View>
              </SafeAreaView>
            )}

            {/* BOTTOM overlay: author, content, stats, actions */}
            {showOverlay && (
              <SafeAreaView
                edges={["bottom"]}
                style={styles.bottomOverlay}
                pointerEvents="box-none"
              >
                <View style={styles.bottomInner}>
                  <View style={styles.authorRow}>
                    <AuthorAvatar user={post?.author} size={40} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.authorName}>
                        {authorName(post?.author)}
                      </Text>
                      {!!post?.content && (
                        <Text style={styles.contentPreview} numberOfLines={2}>
                          {post.content}
                        </Text>
                      )}
                    </View>
                  </View>
                  <View style={styles.statsBar}>
                    <Text style={styles.statText}>
                      {post?.reactionCount || 0} cảm xúc
                    </Text>
                    <Text style={styles.statText}>
                      {post?.commentCount || 0} bình luận
                    </Text>
                  </View>
                  <View style={styles.actionBar}>
                    <Pressable
                      onLongPress={() => setShowReactionPicker(true)}
                      onPress={() => doReact(post?.myReaction || "like")}
                      style={styles.actionBtn}
                    >
                      <Text style={{ fontSize: 20 }}>
                        {post?.myReaction
                          ? REACTION_EMOJI[post.myReaction]
                          : "👍"}
                      </Text>
                      <Text
                        style={[
                          styles.actionLabel,
                          post?.myReaction && {
                            color: "#60A5FA",
                            fontWeight: "600",
                          },
                        ]}
                      >
                        {post?.myReaction === "love" ? "Yêu" : "Thích"}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setShowComments(true)}
                      style={styles.actionBtn}
                    >
                      <Ionicons
                        name="chatbubble-outline"
                        size={20}
                        color="#fff"
                      />
                      <Text style={styles.actionLabel}>Bình luận</Text>
                    </Pressable>
                  </View>
                  {showReactionPicker && (
                    <View style={styles.reactionPicker}>
                      {Object.entries(REACTION_EMOJI).map(([k, e]) => (
                        <Pressable
                          key={k}
                          onPress={() => doReact(k)}
                          style={styles.reactionPick}
                        >
                          <Text style={{ fontSize: 30 }}>{e}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              </SafeAreaView>
            )}
          </Animated.View>
        </GestureDetector>

        {/* Comments bottom sheet — độc lập, không bị pan-drag ảnh hưởng */}
        {post?._id && (
          <CommentsSheet
            visible={showComments}
            onClose={() => setShowComments(false)}
            postId={String(post._id)}
            me={me}
          />
        )}
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // backgroundColor để "transparent" — backdrop đen được vẽ bằng Animated.View
  // riêng để có thể fade khi kéo xuống.
  viewerRoot: { flex: 1, backgroundColor: "transparent" },
  topOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  circleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  counterText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  bottomOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  bottomInner: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
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
  authorName: { color: "#fff", fontWeight: "700" },
  contentPreview: { color: "#E5E7EB", marginTop: 4, fontSize: 13 },
  statsBar: {
    flexDirection: "row",
    gap: 16,
    marginTop: 10,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.15)",
  },
  statText: { color: "#CBD5E1", fontSize: 12 },
  actionBar: {
    flexDirection: "row",
    marginTop: 6,
    justifyContent: "space-around",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  actionLabel: { color: "#fff", fontSize: 14 },
  reactionPicker: {
    position: "absolute",
    bottom: 60,
    left: 12,
    backgroundColor: "rgba(15,23,42,0.9)",
    borderRadius: 28,
    paddingVertical: 6,
    paddingHorizontal: 8,
    flexDirection: "row",
  },
  reactionPick: { paddingHorizontal: 8 },
  /* Sheet */
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheetContainer: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "85%",
    minHeight: "55%",
    // Trên iPhone có Home Indicator, SafeAreaView edges=["bottom"] đã trừ
    // safe-inset; padding thêm trong sheetInputRow đảm bảo không sát mép.
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#CBD5E1",
    marginTop: 8,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
  },
  sheetTitle: { fontWeight: "700", fontSize: 16, color: "#0F172A" },
  sheetInputRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E2E8F0",
    paddingHorizontal: 12,
    paddingTop: 10,
    // chừa khoảng an toàn dưới (Home Indicator) — SafeAreaView bottom đã trừ
    // safe-inset nhưng để chắc chắn không sát mép, thêm 12pt.
    paddingBottom: 12,
    backgroundColor: "#fff",
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
  sheetInput: {
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
  sheetSend: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#0066FF",
    alignItems: "center",
    justifyContent: "center",
  },
  commentBubble: {
    backgroundColor: "#F1F5F9",
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
});
