// app/feed/index.tsx — Bảng tin (list + composer + reactions + link chi tiết)
import { Ionicons } from "@expo/vector-icons";
import { Stack, router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Modal,
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
import { useLazySearchUserQuery } from "@/slices/usersApiSlice";
import { useLazySearchTournamentsQuery } from "@/slices/tournamentsApiSlice";
import { FeedMediaViewer } from "@/components/feed/FeedMediaViewer";
import { MentionText } from "@/components/feed/MentionText";
import { AuthorAvatar } from "@/components/social/AuthorAvatar";

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

function ScoreBadges({
  single,
  double,
  size = "sm",
}: {
  single?: number | null;
  double?: number | null;
  size?: "sm" | "md";
}) {
  const s = Number(single || 0);
  const d = Number(double || 0);
  if (!s && !d) return null;
  const fmt = (v: number) =>
    v >= 100 ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, "");
  const sizeStyle = size === "md" ? scoreStyles.badgeMd : scoreStyles.badgeSm;
  const txtStyle = size === "md" ? scoreStyles.textMd : scoreStyles.textSm;
  return (
    <View style={scoreStyles.wrap}>
      {s > 0 && (
        <View style={[sizeStyle, { backgroundColor: "#DBEAFE" }]}>
          <Text style={[txtStyle, { color: "#1D4ED8" }]}>Đơn {fmt(s)}</Text>
        </View>
      )}
      {d > 0 && (
        <View style={[sizeStyle, { backgroundColor: "#FCE7F3" }]}>
          <Text style={[txtStyle, { color: "#BE185D" }]}>Đôi {fmt(d)}</Text>
        </View>
      )}
    </View>
  );
}

const scoreStyles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    gap: 4,
    marginLeft: 6,
    alignItems: "center",
  },
  badgeSm: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  badgeMd: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  textSm: { fontSize: 10, fontWeight: "800", letterSpacing: 0.2 },
  textMd: { fontSize: 12, fontWeight: "800", letterSpacing: 0.2 },
});

function Composer({ onPosted }: { onPosted: () => void }) {
  const me = useSelector((s: any) => s.auth?.userInfo);
  const [content, setContent] = useState("");
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [linkedTournament, setLinkedTournament] = useState<any>(null);
  const [tournamentPickerOpen, setTournamentPickerOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionRange, setMentionRange] = useState<{ start: number; end: number } | null>(null);
  const [mentionResults, setMentionResults] = useState<any[]>([]);
  // Track user đã chọn từ popup (id + display name) để gửi explicit mentions.
  const [selectedMentions, setSelectedMentions] = useState<
    Array<{ _id: string; display: string }>
  >([]);
  const mentionDebounceRef = useRef<any>(null);
  const [uploadMedia] = useUploadFeedMediaMutation();
  const [createPost, { isLoading }] = useCreateFeedPostMutation();
  const [triggerUserSearch] = useLazySearchUserQuery();

  const onChangeContent = (text: string) => {
    setContent(text);
    // Detect current @word at caret position (approximate: use end of text since we don't track selection)
    // Simpler: find the LAST @token before caret. We use text length as caret.
    const caret = text.length;
    const before = text.slice(0, caret);
    // Cho phép nickname/tên có tối đa 3 từ (2 dấu cách): "Tùng Xíu", "Nguyen Van A"
    // \p{L} = mọi chữ Unicode (bao gồm tiếng Việt có dấu), \p{N} = số
    const m = before.match(
      /(^|\s)@([\p{L}\p{N}._-]+(?: [\p{L}\p{N}._-]+){0,2})$/u
    );
    if (m) {
      const q = m[2];
      const start = before.length - q.length - 1; // position of '@'
      setMentionQuery(q);
      setMentionRange({ start, end: caret });
    } else {
      setMentionQuery(null);
      setMentionRange(null);
      setMentionResults([]);
    }
  };

  useEffect(() => {
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
    const before = content.slice(0, mentionRange.start);
    const after = content.slice(mentionRange.end);
    const replaced = `${before}@${nick} ${after}`;
    setContent(replaced);
    // Ghi nhớ user đã pick — dùng khi submit để backend không phải re-guess
    setSelectedMentions((prev) => {
      if (prev.some((m) => m._id === String(u._id))) return prev;
      return [...prev, { _id: String(u._id), display: nick }];
    });
    setMentionQuery(null);
    setMentionRange(null);
    setMentionResults([]);
  };

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
    // Chỉ gửi mention nào display name vẫn còn trong content (user chưa xoá)
    const stillPresent = selectedMentions
      .filter((m) => content.includes(`@${m.display}`))
      .map((m) => m._id);
    try {
      await createPost({
        content: content.trim(),
        media,
        linkedTournament: linkedTournament?._id || null,
        mentions: stillPresent,
      } as any).unwrap();
      setContent("");
      setMedia([]);
      setLinkedTournament(null);
      setSelectedMentions([]);
      onPosted();
    } catch (err: any) {
      Alert.alert("Đăng thất bại", extractErr(err));
    }
  };

  return (
    <View style={styles.composer}>
      <View style={styles.composerRow}>
        <AuthorAvatar user={me} size={40} />
        <TextInput
          style={styles.input}
          multiline
          placeholder={`${authorName(me)} ơi, chia sẻ gì hôm nay? (gõ @ để nhắc bạn)`}
          placeholderTextColor="#94A3B8"
          value={content}
          onChangeText={onChangeContent}
        />
      </View>

      {/* @ mention suggestions */}
      {mentionQuery != null && mentionResults.length > 0 && (
        <View style={styles.mentionList}>
          {mentionResults.map((u) => (
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
                <View style={styles.mentionNameRow}>
                  <Text style={styles.mentionNick} numberOfLines={1}>
                    @{u.nickname || u.name}
                  </Text>
                  <ScoreBadges
                    single={u?.score?.single}
                    double={u?.score?.double}
                  />
                </View>
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

      {/* Linked tournament chip */}
      {linkedTournament && (
        <View style={styles.tournamentChip}>
          <Ionicons name="trophy" size={14} color="#F59E0B" />
          <Text style={styles.tournamentChipText} numberOfLines={1}>
            {linkedTournament.name}
          </Text>
          <Pressable
            onPress={() => setLinkedTournament(null)}
            hitSlop={8}
          >
            <Ionicons name="close-circle" size={16} color="#64748B" />
          </Pressable>
        </View>
      )}
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
          onPress={() => setTournamentPickerOpen(true)}
          style={styles.iconBtn}
        >
          <Ionicons name="trophy-outline" size={22} color="#F59E0B" />
          <Text style={[styles.iconBtnLabel, { color: "#F59E0B" }]}>
            Gắn giải
          </Text>
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

      <TournamentPickerModal
        visible={tournamentPickerOpen}
        onClose={() => setTournamentPickerOpen(false)}
        onPick={(t) => {
          setLinkedTournament(t);
          setTournamentPickerOpen(false);
        }}
      />
    </View>
  );
}

function TournamentPickerModal({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (t: any) => void;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [triggerSearch] = useLazySearchTournamentsQuery();
  const debRef = useRef<any>(null);

  useEffect(() => {
    if (!visible) return;
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r: any = await triggerSearch({ q, limit: 20 }).unwrap();
        const list = Array.isArray(r) ? r : r?.items || r?.data || [];
        setItems(list);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (debRef.current) clearTimeout(debRef.current);
    };
  }, [q, visible, triggerSearch]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }} edges={["top", "bottom"]}>
        <View style={styles.pickerHeader}>
          <Text style={styles.pickerTitle}>Gắn giải đấu</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={24} color="#0F172A" />
          </Pressable>
        </View>
        <View style={styles.pickerSearchBox}>
          <Ionicons name="search" size={18} color="#94A3B8" />
          <TextInput
            style={styles.pickerSearchInput}
            placeholder="Tìm giải theo tên…"
            placeholderTextColor="#94A3B8"
            value={q}
            onChangeText={setQ}
            autoFocus
          />
          {q.length > 0 && (
            <Pressable onPress={() => setQ("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color="#CBD5E1" />
            </Pressable>
          )}
        </View>
        {loading ? (
          <ActivityIndicator style={{ marginTop: 20 }} />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(t: any) => String(t._id)}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                onPress={() => onPick(item)}
                style={({ pressed }) => [
                  styles.pickerRow,
                  pressed && { backgroundColor: "#F1F5F9" },
                ]}
              >
                {item.image ? (
                  <Image
                    source={{ uri: item.image }}
                    style={styles.pickerThumb}
                  />
                ) : (
                  <View style={[styles.pickerThumb, styles.pickerThumbFallback]}>
                    <Ionicons name="trophy" size={20} color="#F59E0B" />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickerName} numberOfLines={2}>
                    {item.name}
                  </Text>
                  {(item.location || item.status) && (
                    <Text style={styles.pickerMeta} numberOfLines={1}>
                      {[item.location, item.status].filter(Boolean).join(" · ")}
                    </Text>
                  )}
                </View>
              </Pressable>
            )}
            ListEmptyComponent={
              <Text
                style={{
                  padding: 24,
                  color: "#94A3B8",
                  textAlign: "center",
                }}
              >
                {q ? "Không tìm thấy giải" : "Gõ tên để tìm giải đấu…"}
              </Text>
            }
          />
        )}
      </SafeAreaView>
    </Modal>
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
          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}>
            <Text style={styles.postAuthor}>
              {authorName(post.author)}
              {post.isPinned && <Text style={styles.pinnedBadge}>  📌</Text>}
            </Text>
            <ScoreBadges
              single={post.author?.score?.single}
              double={post.author?.score?.double}
            />
          </View>
          <Text style={styles.postTime}>{fmtTime(post.createdAt)}</Text>
        </Pressable>
        <Pressable onPress={handleMenu} hitSlop={12}>
          <Ionicons name="ellipsis-horizontal" size={20} color="#64748B" />
        </Pressable>
      </View>
      {!!post.content && (
        <MentionText
          content={post.content}
          mentions={post.mentions}
          style={styles.postContent}
        />
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
      {post.linkedTournament && (
        <Pressable
          onPress={() =>
            router.push(`/tournament/${post.linkedTournament._id}` as any)
          }
          style={styles.linkedTournamentCard}
        >
          {post.linkedTournament.image ? (
            <Image
              source={{ uri: post.linkedTournament.image }}
              style={styles.linkedTournamentImg}
            />
          ) : (
            <View style={[styles.linkedTournamentImg, styles.linkedTournamentFallback]}>
              <Ionicons name="trophy" size={20} color="#F59E0B" />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.linkedTournamentLabel}>Giải đấu</Text>
            <Text style={styles.linkedTournamentName} numberOfLines={2}>
              {post.linkedTournament.name}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
        </Pressable>
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
  const [cursor, setCursor] = useState<string | null>(null);
  const { data, isFetching, refetch } = useListFeedQuery({
    cursor,
    limit: 10,
  });
  const items = data?.items || [];
  const hasMore = Boolean(data?.hasMore);
  const nextCursor = data?.nextCursor as string | null | undefined;

  const handleRefresh = useCallback(() => {
    setCursor(null);
    refetch();
  }, [refetch]);

  const loadMore = useCallback(() => {
    if (isFetching) return;
    if (!hasMore || !nextCursor) return;
    if (nextCursor === cursor) return;
    setCursor(nextCursor);
  }, [isFetching, hasMore, nextCursor, cursor]);

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
        ListHeaderComponent={<Composer onPosted={handleRefresh} />}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !cursor}
            onRefresh={handleRefresh}
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          isFetching && cursor ? (
            <View style={{ padding: 16 }}>
              <ActivityIndicator />
            </View>
          ) : !hasMore && items.length > 0 ? (
            <Text
              style={{
                textAlign: "center",
                color: "#94A3B8",
                padding: 16,
                fontSize: 12,
              }}
            >
              — Đã xem hết bài viết —
            </Text>
          ) : null
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
  mentionList: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  mentionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F1F5F9",
  },
  mentionNameRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  mentionNick: { fontSize: 14, fontWeight: "700", color: "#0F172A" },
  mentionName: { fontSize: 12, color: "#64748B" },
  tournamentChip: {
    marginTop: 10,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#FED7AA",
    maxWidth: "100%",
  },
  tournamentChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#B45309",
    flexShrink: 1,
  },
  linkedTournamentCard: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  linkedTournamentImg: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: "#FEF3C7",
  },
  linkedTournamentFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  linkedTournamentLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#B45309",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  linkedTournamentName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
    marginTop: 2,
  },
  pickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
  },
  pickerTitle: { fontSize: 17, fontWeight: "700", color: "#0F172A" },
  pickerSearchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    margin: 12,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
  },
  pickerSearchInput: {
    flex: 1,
    fontSize: 14,
    color: "#0F172A",
    padding: 0,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F1F5F9",
  },
  pickerThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
  },
  pickerThumbFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF7ED",
  },
  pickerName: { fontSize: 14, fontWeight: "700", color: "#0F172A" },
  pickerMeta: { fontSize: 12, color: "#64748B", marginTop: 2 },
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
