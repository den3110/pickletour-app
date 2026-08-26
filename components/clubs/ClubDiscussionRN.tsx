// components/clubs/ClubDiscussionRN.tsx
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
} from "react-native";
import { useSelector } from "react-redux";
import dayjs from "dayjs";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Image as ExpoImage } from "expo-image";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Section, EmptyState } from "./ui";
import { normalizeUrl } from "@/utils/normalizeUri";
import {
  useListPostsQuery,
  useCreatePostMutation,
  useDeletePostMutation,
  useReactPostMutation,
  useListPostCommentsQuery,
  useCreatePostCommentMutation,
  useDeletePostCommentMutation,
} from "@/slices/clubsApiSlice";

const getApiErrMsg = (e: any) =>
  e?.data?.message ||
  e?.error ||
  (typeof e?.data === "string" ? e.data : "Có lỗi xảy ra.");
const fmt = (s: any) => dayjs(s).format("HH:mm, DD/MM/YYYY");

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
        colors={["rgba(102,126,234,0.06)", "rgba(118,75,162,0.06)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={{ padding: pad }}>{children}</View>
    </View>
  );
}

function Avatar({ uri, size = 40 }: { uri?: string; size?: number }) {
  return (
    <ExpoImage
      source={{ uri: normalizeUrl(uri) }}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: "#E0E7FF",
      }}
      contentFit="cover"
    />
  );
}

function Comments({
  clubId,
  postId,
  isMember,
  canManage,
  authUserId,
}: {
  clubId: string;
  postId: string;
  isMember: boolean;
  canManage: boolean;
  authUserId?: string;
}) {
  const { data, isFetching } = useListPostCommentsQuery({ id: clubId, postId });
  const [createComment, { isLoading }] = useCreatePostCommentMutation();
  const [delComment] = useDeletePostCommentMutation();
  const [text, setText] = useState("");
  const comments = data?.items || [];

  const submit = async () => {
    const t = text.trim();
    if (!t) return;
    try {
      await createComment({ id: clubId, postId, content: t }).unwrap();
      setText("");
    } catch (e) {
      Alert.alert("Lỗi", getApiErrMsg(e));
    }
  };
  const remove = (c: any) =>
    Alert.alert("Xoá bình luận", "Xoá bình luận này?", [
      { text: "Huỷ", style: "cancel" },
      {
        text: "Xoá",
        style: "destructive",
        onPress: async () => {
          try {
            await delComment({ id: clubId, postId, commentId: c._id }).unwrap();
          } catch (e) {
            Alert.alert("Lỗi", getApiErrMsg(e));
          }
        },
      },
    ]);

  return (
    <View style={styles.commentsWrap}>
      {isFetching && comments.length === 0 ? (
        <Text style={styles.dim}>Đang tải bình luận…</Text>
      ) : (
        comments.map((c: any) => {
          const canDel =
            String(c.author?._id) === String(authUserId) || canManage;
          return (
            <View key={c._id} style={styles.commentRow}>
              <Avatar uri={c.author?.avatar} size={30} />
              <View style={styles.commentBubble}>
                <View style={styles.commentHead}>
                  <Text style={styles.commentName}>
                    {c.author?.nickname || c.author?.fullName || "Người dùng"}
                  </Text>
                  <Text style={styles.commentTime}>{fmt(c.createdAt)}</Text>
                  {canDel && (
                    <TouchableOpacity onPress={() => remove(c)} style={{ marginLeft: "auto" }}>
                      <MaterialCommunityIcons
                        name="trash-can-outline"
                        size={15}
                        color="#9AA3B2"
                      />
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={styles.commentText}>{c.content}</Text>
              </View>
            </View>
          );
        })
      )}
      {isMember && (
        <View style={styles.commentInputRow}>
          <TextInput
            style={styles.commentInput}
            value={text}
            onChangeText={setText}
            placeholder="Viết bình luận…"
            placeholderTextColor="#9AA3B2"
          />
          <TouchableOpacity
            style={styles.sendBtn}
            onPress={submit}
            disabled={isLoading}
          >
            <MaterialCommunityIcons name="send" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function PostItem({
  clubId,
  post,
  isMember,
  canManage,
  authUserId,
}: {
  clubId: string;
  post: any;
  isMember: boolean;
  canManage: boolean;
  authUserId?: string;
}) {
  const [react] = useReactPostMutation();
  const [delPost] = useDeletePostMutation();
  const [showComments, setShowComments] = useState(false);
  const canDelete =
    String(post.author?._id) === String(authUserId) || canManage;

  const doReact = async () => {
    try {
      await react({ id: clubId, postId: post._id }).unwrap();
      Haptics.selectionAsync();
    } catch (e: any) {
      if (e?.status === 401) Alert.alert("Thông báo", "Bạn cần đăng nhập.");
      else Alert.alert("Lỗi", getApiErrMsg(e));
    }
  };
  const doDelete = () =>
    Alert.alert("Xoá bài viết", "Xoá bài viết này?", [
      { text: "Huỷ", style: "cancel" },
      {
        text: "Xoá",
        style: "destructive",
        onPress: async () => {
          try {
            await delPost({ id: clubId, postId: post._id }).unwrap();
          } catch (e) {
            Alert.alert("Lỗi", getApiErrMsg(e));
          }
        },
      },
    ]);

  return (
    <GradLightCard style={{ marginBottom: 10 }}>
      <View style={styles.postHead}>
        <Avatar uri={post.author?.avatar} size={40} />
        <View style={{ flex: 1 }}>
          <Text style={styles.postAuthor}>
            {post.author?.nickname || post.author?.fullName || "Người dùng"}
          </Text>
          <Text style={styles.postTime}>
            {fmt(post.createdAt)}
            {post.visibility === "members" ? " · Chỉ thành viên" : ""}
          </Text>
        </View>
        {canDelete && (
          <TouchableOpacity onPress={doDelete}>
            <MaterialCommunityIcons
              name="trash-can-outline"
              size={18}
              color="#9AA3B2"
            />
          </TouchableOpacity>
        )}
      </View>

      {!!post.content && <Text style={styles.postContent}>{post.content}</Text>}
      {!!post.imageUrl && (
        <ExpoImage
          source={{ uri: normalizeUrl(post.imageUrl) }}
          style={styles.postImage}
          contentFit="cover"
        />
      )}

      <View style={styles.postActions}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={doReact}
          disabled={!isMember}
        >
          <MaterialCommunityIcons
            name={post.myReaction ? "heart" : "heart-outline"}
            size={18}
            color={post.myReaction ? "#F2544B" : "#5C6285"}
          />
          <Text
            style={[
              styles.actionText,
              post.myReaction && { color: "#F2544B" },
            ]}
          >
            {post.reactionCount || 0}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => setShowComments((v) => !v)}
        >
          <MaterialCommunityIcons
            name="comment-outline"
            size={17}
            color="#5C6285"
          />
          <Text style={styles.actionText}>{post.commentCount || 0}</Text>
        </TouchableOpacity>
      </View>

      {showComments && (
        <Comments
          clubId={clubId}
          postId={post._id}
          isMember={isMember}
          canManage={canManage}
          authUserId={authUserId}
        />
      )}
    </GradLightCard>
  );
}

export default function ClubDiscussionRN({
  club,
  canManage,
}: {
  club: any;
  canManage: boolean;
}) {
  const clubId = club?._id;
  const isMember = !!club?._my?.isMember;
  const authUserId = useSelector((s: any) => s.auth?.userInfo?._id);

  const { data, isLoading, isFetching } = useListPostsQuery(
    { id: clubId },
    { skip: !clubId }
  );
  const [createPost, { isLoading: posting }] = useCreatePostMutation();
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [showImg, setShowImg] = useState(false);

  const items = data?.items || [];

  const submit = async () => {
    if (!content.trim() && !imageUrl.trim()) {
      Alert.alert("Thiếu nội dung", "Nhập nội dung hoặc thêm ảnh.");
      return;
    }
    try {
      await createPost({
        id: clubId,
        content,
        imageUrl: imageUrl.trim() || undefined,
      }).unwrap();
      setContent("");
      setImageUrl("");
      setShowImg(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert("Lỗi", getApiErrMsg(e));
    }
  };

  return (
    <Section title="Thảo luận" subtitle={isFetching ? "Đang tải…" : undefined}>
      {isMember ? (
        <GradLightCard style={{ marginBottom: 10 }}>
          <TextInput
            style={[styles.input, { minHeight: 64, textAlignVertical: "top" }]}
            value={content}
            onChangeText={setContent}
            multiline
            placeholder="Chia sẻ điều gì đó với câu lạc bộ…"
            placeholderTextColor="#8A90B2"
          />
          {showImg && (
            <TextInput
              style={[styles.input, { marginTop: 8 }]}
              value={imageUrl}
              onChangeText={setImageUrl}
              placeholder="Dán URL ảnh…"
              placeholderTextColor="#8A90B2"
              autoCapitalize="none"
            />
          )}
          <View style={styles.composerBtns}>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={submit}
              disabled={posting}
            >
              <LinearGradient
                colors={["#667eea", "#764ba2"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              <Text style={styles.primaryBtnText}>
                {posting ? "Đang đăng…" : "Đăng bài"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.lightBtn}
              onPress={() => setShowImg((v) => !v)}
            >
              <Text style={styles.lightBtnText}>
                {showImg ? "Bỏ ảnh" : "Thêm ảnh"}
              </Text>
            </TouchableOpacity>
          </View>
        </GradLightCard>
      ) : (
        <GradLightCard style={{ marginBottom: 10 }}>
          <Text style={styles.dim}>
            Tham gia câu lạc bộ để đăng bài và bình luận.
          </Text>
        </GradLightCard>
      )}

      {items.map((p: any) => (
        <PostItem
          key={p._id}
          clubId={clubId}
          post={p}
          isMember={isMember}
          canManage={canManage}
          authUserId={authUserId}
        />
      ))}

      {!isLoading && !isFetching && items.length === 0 && (
        <EmptyState label="Chưa có bài viết nào" icon="forum-outline" />
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
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
  input: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E6E8F5",
    backgroundColor: "#F8F9FF",
    color: "#1F2557",
  },
  composerBtns: { flexDirection: "row", gap: 8, marginTop: 10 },
  primaryBtn: {
    height: 40,
    paddingHorizontal: 18,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  lightBtn: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4FF",
    borderWidth: 1,
    borderColor: "#E6E8F5",
  },
  lightBtnText: { color: "#3B3F75", fontWeight: "800", fontSize: 13 },

  dim: { color: "#7780A1", fontSize: 13 },

  postHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  postAuthor: { color: "#1F2557", fontWeight: "800", fontSize: 14.5 },
  postTime: { color: "#7780A1", fontSize: 11.5, marginTop: 1 },
  postContent: {
    color: "#3E4466",
    fontSize: 14.5,
    lineHeight: 21,
    marginTop: 10,
  },
  postImage: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    marginTop: 10,
    backgroundColor: "#EEF1FF",
  },
  postActions: {
    flexDirection: "row",
    gap: 18,
    marginTop: 12,
    alignItems: "center",
  },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 5 },
  actionText: { color: "#5C6285", fontWeight: "700", fontSize: 13 },

  commentsWrap: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#EEF1F8",
    paddingTop: 12,
    gap: 10,
  },
  commentRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  commentBubble: {
    flex: 1,
    backgroundColor: "#F5F6FF",
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  commentHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  commentName: { color: "#2D3561", fontWeight: "700", fontSize: 12.5 },
  commentTime: { color: "#9AA3B2", fontSize: 10.5 },
  commentText: { color: "#4A5270", fontSize: 13, marginTop: 2 },
  commentInputRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  commentInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: "#E6E8F5",
    borderRadius: 999,
    paddingHorizontal: 14,
    backgroundColor: "#F8F9FF",
    color: "#1F2557",
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#667eea",
    alignItems: "center",
    justifyContent: "center",
  },
});
