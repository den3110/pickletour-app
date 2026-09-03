// app/feed/index.tsx — Bảng tin (list + composer + reactions + link chi tiết)
import {
  Ionicons } from "@expo/vector-icons";
import { Stack,
  router,
  useFocusEffect } from "expo-router";
import { useDispatch } from "react-redux";
import { useSocket } from "@/context/SocketContext";
import * as ImagePicker from "expo-image-picker";
import { CONDITION_MAP,
  formatPrice } from "@/constants/market";
import { PLAY_STATUS,
  formatPlayTime,
  skillLabel } from "@/constants/play";
import * as ImageManipulator from "expo-image-manipulator";
import { useVideoPlayer,
  VideoView } from "expo-video";
import React,
  { useState,
  useCallback,
  useEffect,
  useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { TextInput } from "@/components/ui/i18nTextInput";
import { Text } from "@/components/ui/i18nText";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSelector } from "react-redux";

import {
  useListFeedQuery,
  useCreateFeedPostMutation,
  useReactFeedPostMutation,
  useShareFeedPostMutation,
  useSaveFeedPostMutation,
  useVoteFeedPollMutation,
  useUploadFeedMediaMutation,
  useDeleteFeedPostMutation,
  useUpdateFeedPostMutation,
  useReportFeedPostMutation,
  feedApiSlice,
} from "@/slices/feedApiSlice";
import { useBlockUserMutation } from "@/slices/friendsApiSlice";
import { useLazySearchUserQuery } from "@/slices/usersApiSlice";
import {
  confirmBlock,
  pickReportReason,
  reportSuccess,
} from "@/utils/contentModeration";
import { useLazySearchTournamentsQuery } from "@/slices/tournamentsApiSlice";
import { FeedMediaViewer } from "@/components/feed/FeedMediaViewer";
import { MentionText } from "@/components/feed/MentionText";
import { AspectImage } from "@/components/feed/AspectImage";
import { AuthorAvatar } from "@/components/social/AuthorAvatar";
import PlayerNameText from "@/components/PlayerNameText";

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

function fmtTourDate(startIso?: string, endIso?: string) {
  if (!startIso) return "";
  const s = new Date(startIso);
  const fmt = (d: Date) =>
    `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  if (!endIso || endIso === startIso) return fmt(s);
  const e = new Date(endIso);
  if (
    s.getMonth() === e.getMonth() &&
    s.getFullYear() === e.getFullYear() &&
    s.getDate() !== e.getDate()
  ) {
    return `${String(s.getDate()).padStart(2, "0")}–${fmt(e)}`;
  }
  return `${fmt(s)} → ${fmt(e)}`;
}

function TourFeedCard({ tour }: { tour: any }) {
  const dateStr = fmtTourDate(tour?.startDate, tour?.endDate);
  const reg = Number(tour?.registrationCount || 0);
  const maxPairs = Number(tour?.maxPairs || 0);
  return (
    <Pressable
      onPress={() => router.push(`/tournament/${tour._id}` as any)}
      style={styles.linkedTournamentCard}
    >
      {tour.image ? (
        <Image source={{ uri: tour.image }} style={styles.linkedTournamentImg} />
      ) : (
        <View style={[styles.linkedTournamentImg, styles.linkedTournamentFallback]}>
          <Ionicons name="trophy" size={22} color="#F59E0B" />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.linkedTournamentLabel}>Giải đấu</Text>
        <Text style={styles.linkedTournamentName} numberOfLines={2}>
          {tour.name}
        </Text>
        {tour.location ? (
          <View style={styles.tourInfoRow}>
            <Ionicons name="location-outline" size={12} color="#94A3B8" />
            <Text style={styles.tourInfoText} numberOfLines={1}>
              {tour.location}
            </Text>
          </View>
        ) : null}
        {dateStr ? (
          <View style={styles.tourInfoRow}>
            <Ionicons name="calendar-outline" size={12} color="#94A3B8" />
            <Text style={styles.tourInfoText}>{dateStr}</Text>
          </View>
        ) : null}
        {(reg > 0 || maxPairs > 0) && (
          <View style={styles.tourInfoRow}>
            <Ionicons name="people-outline" size={12} color="#94A3B8" />
            <Text style={styles.tourInfoText}>
              {reg} cặp{maxPairs > 0 ? ` / ${maxPairs}` : ""} đã đăng ký
            </Text>
          </View>
        )}
      </View>
      <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
    </Pressable>
  );
}

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

function GuestBanner() {
  return (
    <View
      style={{
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 16,
        marginHorizontal: 12,
        marginTop: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      }}
    >
      <Ionicons name="log-in-outline" size={22} color="#0066FF" />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: "600", color: "#0F172A" }}>
          Đăng nhập để đăng bài, bình luận, thả cảm xúc
        </Text>
        <Text style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
          Bạn vẫn có thể xem bảng tin mà không cần đăng nhập.
        </Text>
      </View>
      <Pressable
        onPress={() => router.push("/login" as any)}
        style={{
          backgroundColor: "#0066FF",
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 8,
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>
          Đăng nhập
        </Text>
      </Pressable>
    </View>
  );
}

function requireLogin(me: any): boolean {
  if (me) return true;
  Alert.alert(
    "Cần đăng nhập",
    "Bạn cần đăng nhập để thực hiện thao tác này.",
    [
      { text: "Huỷ", style: "cancel" },
      { text: "Đăng nhập", onPress: () => router.push("/login" as any) },
    ]
  );
  return false;
}

function Composer({ onPosted }: { onPosted: () => void }) {
  const me = useSelector((s: any) => s.auth?.userInfo);
  const [content, setContent] = useState("");
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [linkedTournament, setLinkedTournament] = useState<any>(null);
  const [tournamentPickerOpen, setTournamentPickerOpen] = useState(false);
  const [pollDraft, setPollDraft] = useState<any>(null); // {question, options:[], multi}
  const pollValid =
    pollDraft && pollDraft.options.filter((o: string) => o.trim()).length >= 2;
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
      // 0.6 quality cho ảnh gốc trước khi ImageManipulator nén thêm — tránh nén 2 lần quá tay
      quality: 0.6,
      videoMaxDuration: 60,
      // Giảm chất lượng video (iOS: 0=Low, 1=Medium, 2=High)
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium as any,
    });
    if (res.canceled || !res.assets?.length) return;

    // Chèn placeholder "đang tải" NGAY LẬP TỨC — user thấy preview với spinner
    // như Facebook thay vì chờ upload xong mới hiện.
    const batchKey = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tempItems = res.assets.map((a, idx) => ({
      _temp: true,
      _batch: batchKey,
      _key: `${batchKey}-${idx}`,
      type: a.type === "video" ? "video" : "image",
      tempUri: a.uri, // preview thumbnail local
    })) as any[];
    setMedia((prev) => [...prev, ...tempItems].slice(0, 10));

    const fd = new FormData();
    for (const a of res.assets) {
      let uri = a.uri;
      const isVideo = a.type === "video";
      if (!isVideo) {
        // Ảnh: nén thêm bằng ImageManipulator (max cạnh 1600px, JPEG 0.7)
        uri = await compressImageAsset(uri);
      }
      const name = a.fileName || uri.split("/").pop() || "upload";
      const type =
        a.mimeType || (isVideo ? "video/mp4" : "image/jpeg");
      // React Native FormData chấp nhận {uri, name, type}
      fd.append("files", { uri, name, type } as any);
    }
    try {
      const r: any = await uploadMedia(fd).unwrap();
      // Upload xong → xoá placeholder của batch này + chèn media thật
      setMedia((prev) =>
        [
          ...prev.filter((m: any) => m._batch !== batchKey),
          ...(r.media || []),
        ].slice(0, 10)
      );
    } catch (err: any) {
      // Lỗi → xoá placeholder của batch này
      setMedia((prev) => prev.filter((m: any) => m._batch !== batchKey));
      Alert.alert("Upload thất bại", extractErr(err));
    }
  };

  const submit = async () => {
    if (!content.trim() && !media.length && !pollValid) return;
    // Không cho gửi khi còn media đang upload dở
    if (media.some((m: any) => m._temp)) {
      Alert.alert("Vui lòng chờ tải xong", "Có media đang được tải lên.");
      return;
    }
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
        poll: pollValid
          ? {
              question: pollDraft.question,
              multi: pollDraft.multi,
              options: pollDraft.options.filter((o: string) => o.trim()),
            }
          : undefined,
      } as any).unwrap();
      setContent("");
      setMedia([]);
      setLinkedTournament(null);
      setSelectedMentions([]);
      setPollDraft(null);
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
          {media.map((m: any, i) => {
            const isTemp = !!m._temp;
            return (
              <View key={m._key || i} style={styles.mediaPreview}>
                {m.type === "image" ? (
                  <Image
                    source={{ uri: isTemp ? m.tempUri : m.url }}
                    style={styles.mediaPreviewImg}
                  />
                ) : (
                  <View
                    style={[
                      styles.mediaPreviewImg,
                      { alignItems: "center", justifyContent: "center", backgroundColor: "#111" },
                    ]}
                  >
                    <Ionicons name="videocam" size={28} color="#fff" />
                  </View>
                )}
                {isTemp && (
                  <View
                    style={[
                      StyleSheet.absoluteFillObject,
                      {
                        backgroundColor: "rgba(0,0,0,0.55)",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 8,
                        gap: 4,
                      },
                    ]}
                    pointerEvents="none"
                  >
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={{ color: "#fff", fontSize: 10, fontWeight: "600" }}>
                      Đang tải…
                    </Text>
                  </View>
                )}
                {!isTemp && (
                  <Pressable
                    onPress={() => setMedia((prev) => prev.filter((_, j) => j !== i))}
                    style={styles.mediaRemove}
                  >
                    <Ionicons name="close" size={14} color="#fff" />
                  </Pressable>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
      {pollDraft && (
        <View
          style={{
            marginTop: 8,
            padding: 12,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#E2E8F0",
            backgroundColor: "#F8FAFC",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <Text style={{ fontWeight: "800", color: "#0F172A" }}>📊 Bình chọn</Text>
            <Pressable onPress={() => setPollDraft(null)} hitSlop={8}>
              <Ionicons name="close" size={18} color="#64748B" />
            </Pressable>
          </View>
          <TextInput
            placeholder="Câu hỏi (VD: Ai vô địch?)"
            placeholderTextColor="#94A3B8"
            value={pollDraft.question}
            onChangeText={(t) => setPollDraft((p: any) => ({ ...p, question: t }))}
            style={{
              borderWidth: 1,
              borderColor: "#E2E8F0",
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 8,
              marginBottom: 8,
              color: "#0F172A",
              backgroundColor: "#fff",
            }}
          />
          {pollDraft.options.map((opt: string, i: number) => (
            <View
              key={i}
              style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}
            >
              <TextInput
                placeholder={`Lựa chọn ${i + 1}`}
                placeholderTextColor="#94A3B8"
                value={opt}
                onChangeText={(t) =>
                  setPollDraft((p: any) => {
                    const options = [...p.options];
                    options[i] = t;
                    return { ...p, options };
                  })
                }
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: "#E2E8F0",
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  color: "#0F172A",
                  backgroundColor: "#fff",
                }}
              />
              {pollDraft.options.length > 2 && (
                <Pressable
                  onPress={() =>
                    setPollDraft((p: any) => ({
                      ...p,
                      options: p.options.filter((_: any, j: number) => j !== i),
                    }))
                  }
                  hitSlop={8}
                >
                  <Ionicons name="close-circle" size={20} color="#94A3B8" />
                </Pressable>
              )}
            </View>
          ))}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 }}>
            {pollDraft.options.length < 10 && (
              <Pressable
                onPress={() =>
                  setPollDraft((p: any) => ({ ...p, options: [...p.options, ""] }))
                }
              >
                <Text style={{ color: "#0066FF", fontWeight: "700" }}>
                  + Thêm lựa chọn
                </Text>
              </Pressable>
            )}
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={() => setPollDraft((p: any) => ({ ...p, multi: !p.multi }))}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 999,
                backgroundColor: pollDraft.multi ? "#0066FF" : "#E2E8F0",
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "700",
                  color: pollDraft.multi ? "#fff" : "#334155",
                }}
              >
                Chọn nhiều: {pollDraft.multi ? "Bật" : "Tắt"}
              </Text>
            </Pressable>
          </View>
        </View>
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
          onPress={() =>
            setPollDraft((p: any) =>
              p ? p : { question: "", options: ["", ""], multi: false }
            )
          }
          style={styles.iconBtn}
        >
          <Ionicons name="bar-chart-outline" size={22} color="#7C3AED" />
          <Text style={[styles.iconBtnLabel, { color: "#7C3AED" }]}>
            Bình chọn
          </Text>
        </Pressable>
        {(() => {
          const uploadingCount = media.filter((m: any) => m._temp).length;
          const isUploading = uploadingCount > 0;
          const disabled =
            isLoading ||
            isUploading ||
            (!content.trim() && !media.length && !pollValid);
          return (
            <Pressable
              onPress={submit}
              disabled={disabled}
              style={[styles.postBtn, disabled && { opacity: 0.5 }]}
            >
              <Text style={styles.postBtnText}>
                {isLoading
                  ? "Đang đăng…"
                  : isUploading
                  ? `Đang tải (${uploadingCount})…`
                  : "Đăng"}
              </Text>
            </Pressable>
          );
        })()}
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
// Nén ảnh trước khi upload — giảm dung lượng ~5-10x như FB.
// Max cạnh dài 1600px, quality 0.7 JPEG.
async function compressImageAsset(uri: string): Promise<string> {
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1600 } }],
      {
        compress: 0.7,
        format: ImageManipulator.SaveFormat.JPEG,
      }
    );
    return result.uri;
  } catch {
    return uri; // fallback dùng bản gốc nếu compress fail
  }
}

function InlineVideo({
  uri,
  width,
  height,
}: {
  uri: string;
  width: number;
  height: number;
}) {
  const [ready, setReady] = useState(false);
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.muted = true;
    p.pause();
  });
  useEffect(() => {
    setReady(true);
  }, []);
  if (!ready) return null;
  return (
    <VideoView
      style={{ width, height, borderRadius: 10, backgroundColor: "#000" }}
      player={player}
      contentFit="contain"
      nativeControls
      allowsFullscreen
      allowsPictureInPicture={false}
    />
  );
}

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
    const initAspect =
      m?.width && m?.height ? Number(m.width) / Number(m.height) : null;
    if (m.type === "video") {
      const h = Math.min(480, cardContentW / (initAspect || 1));
      return (
        <View style={{ marginTop: 10, alignItems: "center" }}>
          <InlineVideo uri={m.url} width={cardContentW} height={h} />
        </View>
      );
    }
    return (
      <View style={{ marginTop: 10, alignItems: "center" }}>
        <AspectImage
          url={m.url}
          width={cardContentW}
          maxHeight={480}
          initialAspect={initAspect}
          onPress={() => onOpenViewer(0)}
        />
      </View>
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
      {media.slice(0, 8).map((m: any, i: number) => {
        const initAspect =
          m?.width && m?.height ? Number(m.width) / Number(m.height) : null;
        if (m.type === "video") {
          return (
            <View
              key={i}
              style={{ width: cardContentW, marginRight: 8, alignItems: "center" }}
            >
              <InlineVideo uri={m.url} width={cardContentW} height={cardContentW} />
            </View>
          );
        }
        return (
          <View
            key={i}
            style={{ width: cardContentW, marginRight: 8, alignItems: "center" }}
          >
            <AspectImage
              url={m.url}
              width={cardContentW}
              maxHeight={cardContentW}
              initialAspect={initAspect}
              onPress={() => onOpenViewer(i)}
            />
          </View>
        );
      })}
    </ScrollView>
  );
}

const WEB_BASE_URL =
  process.env.EXPO_PUBLIC_WEB_BASE_URL || "https://pickletour.vn";

function PollBlockRN({ poll, onVote }: { poll: any; onVote: (id: string) => void }) {
  const total = poll.totalVotes || 0;
  const closed = poll.closesAt && new Date(poll.closesAt) < new Date();
  return (
    <View
      style={{
        marginTop: 10,
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        backgroundColor: "#F8FAFC",
      }}
    >
      {!!poll.question && (
        <Text style={{ fontWeight: "800", marginBottom: 8, color: "#0F172A" }}>
          {poll.question}
        </Text>
      )}
      {poll.options.map((o: any) => {
        const pct = total > 0 ? Math.round((o.votes / total) * 100) : 0;
        return (
          <Pressable
            key={o.id}
            onPress={() => !closed && onVote(o.id)}
            style={{
              marginBottom: 6,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: o.voted ? "#0066FF" : "#E2E8F0",
              overflow: "hidden",
              backgroundColor: "#fff",
            }}
          >
            <View
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: `${pct}%`,
                backgroundColor: o.voted ? "#DBEAFE" : "#EEF2F7",
              }}
            />
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                paddingHorizontal: 10,
                paddingVertical: 8,
              }}
            >
              <Text style={{ fontWeight: o.voted ? "800" : "500", color: "#0F172A" }}>
                {o.voted ? "✓ " : ""}
                {o.text}
              </Text>
              <Text style={{ fontWeight: "700", color: "#334155" }}>
                {pct}% · {o.votes}
              </Text>
            </View>
          </Pressable>
        );
      })}
      <Text style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>
        {total} lượt bình chọn{closed ? " · đã đóng" : ""}
        {poll.multi ? " · chọn nhiều" : ""}
      </Text>
    </View>
  );
}

function SharedMatchCardRN({ sm }: { sm: any }) {
  const winA = sm.winner === "A";
  const winB = sm.winner === "B";
  return (
    <Pressable
      onPress={() => sm.matchId && router.push(`/match/${sm.matchId}` as any)}
      style={{
        marginTop: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        overflow: "hidden",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: 12,
          paddingVertical: 6,
          backgroundColor: "#0066FF",
        }}
      >
        <Text>🏓</Text>
        <Text style={{ color: "#fff", fontWeight: "800", flex: 1 }} numberOfLines={1}>
          {sm.tournamentName || "Kết quả trận đấu"}
          {sm.code ? ` · ${sm.code}` : ""}
        </Text>
      </View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 12,
          paddingVertical: 12,
          gap: 8,
        }}
      >
        <Text
          style={{
            flex: 1,
            fontWeight: winA ? "800" : "500",
            color: winA ? "#15803D" : "#0F172A",
          }}
        >
          {sm.teamA || "Đội A"}
        </Text>
        <View
          style={{
            paddingHorizontal: 12,
            paddingVertical: 4,
            borderRadius: 10,
            backgroundColor: "#E2E8F0",
            alignItems: "center",
            minWidth: 74,
          }}
        >
          <Text style={{ fontWeight: "900", fontSize: 18, color: "#0F172A" }}>
            {sm.scoreA} – {sm.scoreB}
          </Text>
          {(sm.setsA || sm.setsB) ? (
            <Text style={{ fontSize: 11, color: "#64748B" }}>
              Sets {sm.setsA}–{sm.setsB}
            </Text>
          ) : null}
        </View>
        <Text
          style={{
            flex: 1,
            textAlign: "right",
            fontWeight: winB ? "800" : "500",
            color: winB ? "#15803D" : "#0F172A",
          }}
        >
          {sm.teamB || "Đội B"}
        </Text>
      </View>
    </Pressable>
  );
}

function SharedListingCardRN({ sl }: { sl: any }) {
  const cond = CONDITION_MAP[sl.condition];
  const sold = sl.status === "sold";
  const cta = sold
    ? "Đã bán"
    : sl.type === "trade"
    ? "Xem / Đổi"
    : sl.type === "giveaway"
    ? "Nhận ngay"
    : "Mua ngay";
  return (
    <Pressable
      onPress={() =>
        sl.listingId && router.push(`/marketplace/${sl.listingId}` as any)
      }
      style={{
        marginTop: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        overflow: "hidden",
        flexDirection: "row",
      }}
    >
      <View style={{ width: 104, height: 104, backgroundColor: "#F1F5F9" }}>
        {sl.image ? (
          <Image
            source={{ uri: sl.image }}
            style={{ width: "100%", height: "100%", opacity: sold ? 0.6 : 1 }}
          />
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 30 }}>🛍️</Text>
          </View>
        )}
      </View>
      <View style={{ flex: 1, padding: 10, gap: 3 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Text style={{ fontSize: 12 }}>🛍️</Text>
          <Text style={{ color: "#0066FF", fontWeight: "700", fontSize: 12 }}>
            Sản phẩm trên Chợ
          </Text>
        </View>
        <Text numberOfLines={2} style={{ fontWeight: "700", fontSize: 14, color: "#111827" }}>
          {sl.title || "Sản phẩm"}
        </Text>
        <Text style={{ color: "#0066FF", fontWeight: "900", fontSize: 16 }}>
          {formatPrice(sl.price, sl.type)}
        </Text>
        <View
          style={{
            marginTop: "auto",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <Text numberOfLines={1} style={{ color: "#64748B", fontSize: 11, flex: 1 }}>
            {[cond?.label, sl.province].filter(Boolean).join(" · ")}
          </Text>
          <View
            style={{
              paddingHorizontal: 12,
              paddingVertical: 5,
              borderRadius: 999,
              backgroundColor: sold ? "#E2E8F0" : "#0066FF",
            }}
          >
            <Text style={{ color: sold ? "#94A3B8" : "#fff", fontWeight: "700", fontSize: 12 }}>
              {cta}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function SharedPlayCardRN({ sp }: { sp: any }) {
  const st = PLAY_STATUS[sp.status] || PLAY_STATUS.open;
  const slotsLeft = Math.max(0, (sp.slots || 0) - (sp.acceptedCount || 0));
  return (
    <Pressable
      onPress={() => sp.playId && router.push(`/play/${sp.playId}` as any)}
      style={{ marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", overflow: "hidden" }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#16a34a" }}>
        <Text>🏓</Text>
        <Text style={{ color: "#fff", fontWeight: "800", flex: 1 }} numberOfLines={1}>Kèo giao lưu · Tìm bạn đánh</Text>
        <View style={{ backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
          <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>{st.label}</Text>
        </View>
      </View>
      <View style={{ padding: 12 }}>
        <Text style={{ fontWeight: "800", fontSize: 15, color: "#0F172A" }}>{sp.title || sp.courtName || "Kèo pickleball"}</Text>
        <Text style={{ fontSize: 13, color: "#64748B", marginTop: 4 }}>🕒 {formatPlayTime(sp.playAt)}</Text>
        <Text style={{ fontSize: 13, color: "#64748B" }}>📍 {[sp.courtName, sp.province].filter(Boolean).join(", ") || "—"}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8, gap: 8 }}>
          <Text style={{ fontSize: 12.5, color: "#64748B", flex: 1 }}>{skillLabel(sp.skillMin, sp.skillMax)} · thiếu {slotsLeft} người</Text>
          <View style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: sp.status === "open" ? "#16a34a" : "#E2E8F0" }}>
            <Text style={{ color: sp.status === "open" ? "#fff" : "#94A3B8", fontWeight: "700", fontSize: 12.5 }}>{sp.status === "open" ? "Tham gia" : "Xem kèo"}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function PostCard({ post, me }: { post: any; me: any }) {
  const [react] = useReactFeedPostMutation();
  const [sharePostMut] = useShareFeedPostMutation();
  const [deletePost] = useDeleteFeedPostMutation();
  const [updatePost, { isLoading: savingEdit }] = useUpdateFeedPostMutation();
  const [editOpen, setEditOpen] = useState(false);
  const [editText, setEditText] = useState("");
  const [reportPost] = useReportFeedPostMutation();
  const [blockUser] = useBlockUserMutation();
  const [savePost] = useSaveFeedPostMutation();
  const [votePoll] = useVoteFeedPollMutation();
  const [saved, setSaved] = useState(!!post.saved);
  const [poll, setPoll] = useState<any>(post.poll || null);
  useEffect(() => setSaved(!!post.saved), [post.saved]);
  useEffect(() => setPoll(post.poll || null), [post.poll]);
  const toggleSave = async () => {
    const next = !saved;
    setSaved(next);
    try {
      await savePost({ id: post._id, save: next }).unwrap();
    } catch {
      setSaved(!next);
    }
  };
  const doVote = async (optId: string) => {
    if (!poll) return;
    const optionIds = poll.multi
      ? poll.options
          .filter((o: any) => (o.id === optId ? !o.voted : o.voted))
          .map((o: any) => o.id)
      : [optId];
    try {
      const r: any = await votePoll({ id: post._id, optionIds }).unwrap();
      if (r?.poll) setPoll(r.poll);
    } catch {}
  };
  const [pickerOpen, setPickerOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  const isMine = String(post.author?._id) === String(me?._id);
  const isAdmin = me?.role === "admin";

  const handleShare = async () => {
    const url = `${WEB_BASE_URL}/feed/post/${post._id}`;
    const body = (post.content || "").slice(0, 200);
    const title =
      (post.author?.nickname || post.author?.name || "Bài viết") +
      " · PickleTour";
    try {
      const result = await Share.share({
        title,
        message: body ? `${body}\n${url}` : url,
        url, // iOS ưu tiên field url
      });
      if (result.action !== Share.dismissedAction) {
        sharePostMut(post._id).catch(() => {});
      }
    } catch (err: any) {
      Alert.alert("Lỗi", err?.message || "Không chia sẻ được");
    }
  };

  const doReact = async (type: string) => {
    setPickerOpen(false);
    if (!requireLogin(me)) return;
    try {
      await react({ id: post._id, type }).unwrap();
    } catch (err: any) {
      Alert.alert("Lỗi", extractErr(err));
    }
  };

  const doReportPost = () => {
    pickReportReason(async (reason) => {
      try {
        await reportPost({ id: post._id, reason }).unwrap();
        reportSuccess();
      } catch (err: any) {
        Alert.alert("Lỗi", err?.data?.message || String(err));
      }
    });
  };

  const doBlockAuthor = () => {
    const uid = post.author?._id;
    if (!uid) return;
    const name = post.author?.nickname || post.author?.name || "user này";
    confirmBlock(name, async () => {
      try {
        await blockUser(String(uid)).unwrap();
        Alert.alert("Đã chặn", `${name} sẽ không xuất hiện nữa.`);
      } catch (err: any) {
        Alert.alert("Lỗi", err?.data?.message || String(err));
      }
    });
  };

  const handleMenu = () => {
    const options: any[] = [];
    if (isMine) {
      options.push({
        text: "Sửa bài viết",
        onPress: () => {
          setEditText(post.content || "");
          setEditOpen(true);
        },
      });
    }
    if (isMine || isAdmin) {
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
    }
    if (!isMine) {
      options.push({ text: "Báo cáo bài viết", onPress: doReportPost });
      if (post.author?._id) {
        options.push({
          text: "Chặn người này",
          onPress: doBlockAuthor,
          style: "destructive" as const,
        });
      }
    }
    Alert.alert("Tuỳ chọn", undefined, [
      ...options,
      { text: "Đóng", style: "cancel" as const },
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
            <PlayerNameText
              user={post.author}
              name={authorName(post.author)}
              style={styles.postAuthor}
            />
            {post.isPinned && <Text style={styles.pinnedBadge}>  📌</Text>}
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

      {/* Sửa bài viết */}
      <Modal visible={editOpen} transparent animationType="slide" onRequestClose={() => setEditOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}
        >
          <Pressable style={{ flex: 1 }} onPress={() => setEditOpen(false)} />
          <View style={{ backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34 }}>
            <Text style={{ fontSize: 18, fontWeight: "900", marginBottom: 10 }}>Sửa bài viết</Text>
            <TextInput
              value={editText}
              onChangeText={setEditText}
              multiline
              placeholder="Nội dung bài viết…"
              placeholderTextColor="#94A3B8"
              style={{ borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 12, padding: 12, fontSize: 15, minHeight: 100, textAlignVertical: "top" }}
            />
            {(post.sharedListing || post.sharedPlay || post.sharedMatch) && (
              <Text style={{ fontSize: 12.5, color: "#94A3B8", marginTop: 6 }}>
                * Phần đính kèm (sản phẩm/kèo/trận) được giữ nguyên.
              </Text>
            )}
            <TouchableOpacity
              onPress={async () => {
                try {
                  await updatePost({ id: post._id, content: editText }).unwrap();
                  setEditOpen(false);
                } catch (err: any) {
                  Alert.alert("Lỗi", err?.data?.message || "Cập nhật thất bại");
                }
              }}
              disabled={savingEdit}
              style={{ marginTop: 14, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#0066FF" }}
            >
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{savingEdit ? "Đang lưu…" : "Lưu"}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

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
        <TourFeedCard tour={post.linkedTournament} />
      )}
      {post.sharedMatch && <SharedMatchCardRN sm={post.sharedMatch} />}
      {post.sharedListing && <SharedListingCardRN sl={post.sharedListing} />}
      {post.sharedPlay && <SharedPlayCardRN sp={post.sharedPlay} />}
      {poll && <PollBlockRN poll={poll} onVote={doVote} />}
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
        {(post.shareCount || 0) > 0 && (
          <Text style={styles.statText}>{post.shareCount} chia sẻ</Text>
        )}
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
        <Pressable onPress={handleShare} style={styles.actionBtn}>
          <Ionicons name="share-social-outline" size={18} color="#64748B" />
          <Text style={styles.actionLabel}>Chia sẻ</Text>
        </Pressable>
        <Pressable onPress={toggleSave} style={styles.actionBtn}>
          <Ionicons
            name={saved ? "bookmark" : "bookmark-outline"}
            size={18}
            color={saved ? "#0066FF" : "#64748B"}
          />
          <Text
            style={[
              styles.actionLabel,
              saved && { color: "#0066FF", fontWeight: "600" },
            ]}
          >
            {saved ? "Đã lưu" : "Lưu"}
          </Text>
        </Pressable>
      </View>
      {post.recentComments?.length > 0 && (
        <View style={styles.previewComments}>
          {post.recentComments.map((c: any) => (
            <View key={c._id} style={styles.previewCommentRow}>
              <Pressable
                onPress={() =>
                  c.author?._id && router.push(`/profile/${c.author._id}`)
                }
                hitSlop={6}
              >
                <AuthorAvatar user={c.author} size={26} />
              </Pressable>
              <View style={styles.previewBubble}>
                <Pressable
                  onPress={() =>
                    c.author?._id && router.push(`/profile/${c.author._id}`)
                  }
                  hitSlop={4}
                >
                  <PlayerNameText
                    user={c.author}
                    name={authorName(c.author)}
                    style={styles.previewAuthor}
                  />
                </Pressable>
                <MentionText
                  content={c.content}
                  mentions={c.mentions}
                  style={styles.previewContent}
                />
              </View>
            </View>
          ))}
          {(post.commentCount || 0) > post.recentComments.length && (
            <Pressable
              onPress={() => router.push(`/feed/post/${post._id}`)}
              style={{ marginLeft: 34, marginTop: 2 }}
              hitSlop={6}
            >
              <Text style={styles.previewMore}>
                Xem thêm {post.commentCount - post.recentComments.length} bình
                luận
              </Text>
            </Pressable>
          )}
        </View>
      )}
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
  const dispatch = useDispatch();
  const socket = useSocket();
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

  // Refetch khi focus lại tab (user tap noti → app active → xem post mới).
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  // Realtime: post mới / xoá / cập nhật số reaction, share.
  useEffect(() => {
    if (!socket) return;
    const subscribe = () => socket.emit("feed:list:subscribe");
    subscribe();
    socket.on("connect", subscribe);

    const invalidateList = () => {
      dispatch(
        feedApiSlice.util.invalidateTags([
          { type: "Feed", id: "LIST" },
        ]) as any
      );
    };
    const onReactionUpdated = ({ postId, reactionCount, myReaction }: any) => {
      if (!postId) return;
      dispatch(
        feedApiSlice.util.updateQueryData(
          "listFeed",
          { limit: 10 } as any,
          (draft: any) => {
            const item = (draft?.items || []).find(
              (p: any) => String(p._id) === String(postId)
            );
            if (!item) return;
            if (typeof reactionCount === "number")
              item.reactionCount = reactionCount;
            if (typeof myReaction !== "undefined")
              item.myReaction = myReaction;
          }
        ) as any
      );
    };
    const onShareUpdated = ({ postId, shareCount }: any) => {
      if (!postId) return;
      dispatch(
        feedApiSlice.util.updateQueryData(
          "listFeed",
          { limit: 10 } as any,
          (draft: any) => {
            const item = (draft?.items || []).find(
              (p: any) => String(p._id) === String(postId)
            );
            if (item && typeof shareCount === "number")
              item.shareCount = shareCount;
          }
        ) as any
      );
    };
    const onPostUpdated = (dto: any) => {
      if (!dto?._id) return;
      dispatch(
        feedApiSlice.util.updateQueryData(
          "listFeed",
          { limit: 10 } as any,
          (draft: any) => {
            const idx = (draft?.items || []).findIndex(
              (p: any) => String(p._id) === String(dto._id)
            );
            if (idx >= 0) draft.items[idx] = { ...draft.items[idx], ...dto };
          }
        ) as any
      );
    };
    const onPostDeleted = ({ postId }: any) => {
      if (!postId) return;
      dispatch(
        feedApiSlice.util.updateQueryData(
          "listFeed",
          { limit: 10 } as any,
          (draft: any) => {
            if (!draft?.items) return;
            draft.items = draft.items.filter(
              (p: any) => String(p._id) !== String(postId)
            );
          }
        ) as any
      );
    };

    socket.on("feed:post:new", invalidateList);
    socket.on("feed:post:updated", onPostUpdated);
    socket.on("feed:post:deleted", onPostDeleted);
    socket.on("feed:reaction:updated", onReactionUpdated);
    socket.on("feed:share:updated", onShareUpdated);

    return () => {
      try {
        socket.emit("feed:list:unsubscribe");
      } catch {}
      socket.off("connect", subscribe);
      socket.off("feed:post:new", invalidateList);
      socket.off("feed:post:updated", onPostUpdated);
      socket.off("feed:post:deleted", onPostDeleted);
      socket.off("feed:reaction:updated", onReactionUpdated);
      socket.off("feed:share:updated", onShareUpdated);
    };
  }, [socket, dispatch]);

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

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Stack.Screen options={{ title: "Bảng tin" }} />
      <FlatList
        data={items}
        keyExtractor={(i: any) => i._id}
        ListHeaderComponent={
          me ? (
            <Composer onPosted={handleRefresh} />
          ) : (
            <GuestBanner />
          )
        }
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
  tourInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 3,
  },
  tourInfoText: { fontSize: 11, color: "#64748B", flexShrink: 1 },
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
  previewComments: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    gap: 8,
  },
  previewCommentRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
  },
  previewBubble: {
    flex: 1,
    backgroundColor: "#F1F5F9",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  previewAuthor: { fontWeight: "700", color: "#0F172A", fontSize: 12 },
  previewContent: { color: "#0F172A", fontSize: 13, marginTop: 1 },
  previewMore: { color: "#475569", fontSize: 12, fontWeight: "600" },
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
