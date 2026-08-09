// app/messages/[cid].tsx — Chat window (Messenger-like)
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import ImageView from "react-native-image-viewing";
import React, { useEffect, useMemo, useRef, useState } from "react";
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
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useDispatch, useSelector } from "react-redux";

import { AuthorAvatar } from "@/components/social/AuthorAvatar";
import { UserActionsMenu } from "@/components/social/UserActionsMenu";
import { MentionText } from "@/components/feed/MentionText";
import { useLazySearchUserQuery } from "@/slices/usersApiSlice";
import { useLazySearchTournamentsQuery } from "@/slices/tournamentsApiSlice";

import {
  useGetConversationQuery,
  useListMessagesQuery,
  useMarkReadMutation,
  useSendDmMessageMutation,
  useUploadChatMediaMutation,
  useDeleteMessageMutation,
  messagesApiSlice,
} from "@/slices/messagesApiSlice";
import { socket } from "@/lib/socket";

const authorName = (u?: any) => u?.nickname || u?.name || "Người dùng";

const MS_5MIN = 5 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, "0");
const _sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

function shouldShowTimeSep(cur?: any, older?: any) {
  if (!cur?.createdAt) return false;
  if (!older?.createdAt) return true;
  const c = new Date(cur.createdAt);
  const p = new Date(older.createdAt);
  if (!_sameDay(c, p)) return true;
  return c.getTime() - p.getTime() > MS_5MIN;
}

function fmtTimeSep(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (_sameDay(d, now)) return time;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (_sameDay(d, y)) return `Hôm qua ${time}`;
  const sameYear = d.getFullYear() === now.getFullYear();
  const dm = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  if (sameYear) return `${dm} ${time}`;
  return `${dm}/${d.getFullYear()} ${time}`;
}

function fmtBubbleTime(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (_sameDay(d, now)) return time;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${time}`;
}

// Format ngày dd/MM/yyyy hoặc range dd/MM - dd/MM/yyyy
function fmtDateRange(startIso?: string, endIso?: string) {
  if (!startIso) return "";
  const s = new Date(startIso);
  const fmt = (d: Date) =>
    `${String(d.getDate()).padStart(2, "0")}/${String(
      d.getMonth() + 1
    ).padStart(2, "0")}/${d.getFullYear()}`;
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

function TournamentBubbleCard({ tour, isMine }: { tour: any; isMine: boolean }) {
  const dateStr = fmtDateRange(tour?.startDate, tour?.endDate);
  const regCount = Number(tour?.registrationCount || 0);
  const maxPairs = Number(tour?.maxPairs || 0);
  const labelColor = isMine ? "#FEF3C7" : "#B45309";
  const textColor = isMine ? "#fff" : "#0F172A";
  const subColor = isMine ? "rgba(255,255,255,0.85)" : "#64748B";
  return (
    <Pressable
      onPress={() => router.push(`/tournament/${tour._id}` as any)}
      style={[
        styles.msgTournamentCard,
        isMine && styles.msgTournamentCardMine,
      ]}
    >
      {tour.image ? (
        <Image source={{ uri: tour.image }} style={styles.msgTournamentImg} />
      ) : (
        <View
          style={[styles.msgTournamentImg, styles.msgTournamentImgFallback]}
        >
          <Ionicons name="trophy" size={22} color="#F59E0B" />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.msgTournamentLabel, { color: labelColor }]}>
          Giải đấu
        </Text>
        <Text
          style={[styles.msgTournamentName, { color: textColor }]}
          numberOfLines={2}
        >
          {tour.name}
        </Text>
        {tour.location ? (
          <View style={styles.tourInfoRow}>
            <Ionicons name="location-outline" size={12} color={subColor} />
            <Text
              style={[styles.tourInfoText, { color: subColor }]}
              numberOfLines={1}
            >
              {tour.location}
            </Text>
          </View>
        ) : null}
        {dateStr ? (
          <View style={styles.tourInfoRow}>
            <Ionicons name="calendar-outline" size={12} color={subColor} />
            <Text style={[styles.tourInfoText, { color: subColor }]}>
              {dateStr}
            </Text>
          </View>
        ) : null}
        {(regCount > 0 || maxPairs > 0) && (
          <View style={styles.tourInfoRow}>
            <Ionicons name="people-outline" size={12} color={subColor} />
            <Text style={[styles.tourInfoText, { color: subColor }]}>
              {regCount} cặp{maxPairs > 0 ? ` / ${maxPairs}` : ""} đã đăng ký
            </Text>
          </View>
        )}
      </View>
      <Ionicons
        name="chevron-forward"
        size={16}
        color={isMine ? "#DBEAFE" : "#94A3B8"}
      />
    </Pressable>
  );
}

function extractErr(err: any): string {
  if (err?.data?.message) return String(err.data.message);
  if (err?.message) return String(err.message);
  return "Lỗi không xác định";
}

export default function ChatWindow() {
  const headerHeight = useHeaderHeight();
  const { cid } = useLocalSearchParams<{ cid: string }>();
  const me = useSelector((s: any) => s.auth?.userInfo);
  const dispatch = useDispatch();
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<any[]>([]);
  const [linkedTournament, setLinkedTournament] = useState<any>(null);
  // Fullscreen viewer state cho ảnh/video trong chat bubble.
  const [imgViewer, setImgViewer] = useState<{
    visible: boolean;
    images: { uri: string }[];
    index: number;
  }>({ visible: false, images: [], index: 0 });
  const [videoModal, setVideoModal] = useState<{ url: string } | null>(null);
  const [tournamentPickerOpen, setTournamentPickerOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionRange, setMentionRange] = useState<{
    start: number;
    end: number;
  } | null>(null);
  const [mentionResults, setMentionResults] = useState<any[]>([]);
  const [selectedMentions, setSelectedMentions] = useState<
    Array<{ _id: string; display: string }>
  >([]);
  const mentionDebRef = useRef<any>(null);
  const [triggerUserSearch] = useLazySearchUserQuery();
  const flatRef = useRef<FlatList<any>>(null);
  const cidStr = String(cid);

  const onChangeText = (v: string) => {
    setText(v);
    const caret = v.length;
    const before = v.slice(0, caret);
    const m = before.match(
      /(^|\s)@([\p{L}\p{N}._-]+(?: [\p{L}\p{N}._-]+){0,2})$/u
    );
    if (m) {
      const q = m[2];
      setMentionQuery(q);
      setMentionRange({ start: before.length - q.length - 1, end: caret });
    } else {
      setMentionQuery(null);
      setMentionRange(null);
      setMentionResults([]);
    }
  };

  useEffect(() => {
    if (mentionQuery == null) return;
    if (mentionDebRef.current) clearTimeout(mentionDebRef.current);
    mentionDebRef.current = setTimeout(async () => {
      if (!mentionQuery) {
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
      if (mentionDebRef.current) clearTimeout(mentionDebRef.current);
    };
  }, [mentionQuery, triggerUserSearch]);

  const insertMention = (u: any) => {
    if (!mentionRange || !u?._id) return;
    const nick = u?.nickname || u?.name || "";
    if (!nick) return;
    const before = text.slice(0, mentionRange.start);
    const after = text.slice(mentionRange.end);
    setText(`${before}@${nick} ${after}`);
    setSelectedMentions((prev) =>
      prev.some((m) => m._id === String(u._id))
        ? prev
        : [...prev, { _id: String(u._id), display: nick }]
    );
    setMentionQuery(null);
    setMentionRange(null);
    setMentionResults([]);
  };

  const { data: conv } = useGetConversationQuery(cidStr, { skip: !cid });
  const { data: msgs, isFetching } = useListMessagesQuery(
    { cid: cidStr },
    { skip: !cid }
  );
  const [sendMessage, { isLoading: sending }] = useSendDmMessageMutation();
  const [uploadMedia] = useUploadChatMediaMutation();
  const [markRead] = useMarkReadMutation();
  const [deleteMessage] = useDeleteMessageMutation();

  // Subscribe socket room + patch cache khi có message mới
  useEffect(() => {
    if (!cid) return;
    const subscribe = () => {
      try {
        socket.emit("chat:subscribe", { conversationId: cidStr });
      } catch {}
    };
    // Subscribe ngay lập tức (nếu socket đang connect) + re-subscribe mỗi lần
    // socket connect/reconnect (mất mạng chớp → socket id mới → BE không còn
    // socket cũ trong room chat:${cid} → miss messages cho tới khi user refresh)
    subscribe();
    socket.on("connect", subscribe);
    try {
      markRead(cidStr);
    } catch {}
    const onNew = (payload: any) => {
      if (String(payload?.conversationId) !== cidStr) return;
      const newMsg = payload.message;
      if (!newMsg) return;
      // patch list cache
      dispatch(
        messagesApiSlice.util.updateQueryData(
          "listMessages",
          { cid: cidStr },
          (draft: any) => {
            if (!draft?.items) return;
            if (draft.items.find((m: any) => String(m._id) === String(newMsg._id)))
              return;
            draft.items.unshift(newMsg);
          }
        )
      );
      // mark read khi đang mở
      markRead(cidStr);
    };
    const onDeleted = (payload: any) => {
      if (String(payload?.conversationId) !== cidStr) return;
      dispatch(
        messagesApiSlice.util.updateQueryData(
          "listMessages",
          { cid: cidStr },
          (draft: any) => {
            if (!draft?.items) return;
            const i = draft.items.findIndex(
              (m: any) => String(m._id) === String(payload.messageId)
            );
            if (i >= 0) draft.items[i].deletedAt = new Date().toISOString();
          }
        )
      );
    };
    socket.on("chat:message:new", onNew);
    socket.on("chat:message:deleted", onDeleted);
    return () => {
      try {
        socket.emit("chat:unsubscribe", { conversationId: cidStr });
      } catch {}
      socket.off("connect", subscribe);
      socket.off("chat:message:new", onNew);
      socket.off("chat:message:deleted", onDeleted);
    };
  }, [cid, cidStr, dispatch, markRead]);

  const items = msgs?.items || [];
  const title = useMemo(() => {
    if (!conv) return "Nhắn tin";
    if (conv.type === "tournament")
      return `BTC · ${conv.tournament?.name || "Giải đấu"}`;
    const other = conv.otherParticipants?.[0];
    return authorName(other);
  }, [conv]);

  const pickMedia = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      selectionLimit: 5,
      quality: 0.6,
      videoMaxDuration: 240, // 4 phút
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium as any,
    });
    if (res.canceled || !res.assets?.length) return;

    // Client-side check dung lượng + thời lượng trước khi upload
    // Limit: ảnh 10MB, video 100MB / 4 phút
    const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
    const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
    const MAX_VIDEO_DURATION_MS = 240 * 1000;
    const rejected: string[] = [];
    const ok: typeof res.assets = [];
    for (const a of res.assets) {
      const isVideo = a.type === "video";
      const size = Number(a.fileSize || 0);
      const duration = Number(a.duration || 0); // ms
      if (isVideo) {
        if (size && size > MAX_VIDEO_BYTES) {
          rejected.push(
            `Video "${a.fileName || "video"}" ${(size / 1024 / 1024).toFixed(1)}MB > 100MB`
          );
          continue;
        }
        if (duration && duration > MAX_VIDEO_DURATION_MS) {
          rejected.push(
            `Video "${a.fileName || "video"}" ${(duration / 1000).toFixed(0)}s > 4 phút`
          );
          continue;
        }
      } else {
        if (size && size > MAX_IMAGE_BYTES) {
          rejected.push(
            `Ảnh "${a.fileName || "ảnh"}" ${(size / 1024 / 1024).toFixed(1)}MB > 10MB`
          );
          continue;
        }
      }
      ok.push(a);
    }
    if (rejected.length) {
      Alert.alert(
        "Một số file quá lớn",
        rejected.join("\n") +
          "\n\nCác file còn lại sẽ được tải lên như bình thường."
      );
    }
    if (!ok.length) return;

    // Placeholder uploading — hiện ngay trong preview với spinner
    const batchKey = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tempItems = ok.map((a, idx) => ({
      _temp: true,
      _batch: batchKey,
      _key: `${batchKey}-${idx}`,
      type: a.type === "video" ? "video" : "image",
      tempUri: a.uri,
    })) as any[];
    setAttachments((prev) => [...prev, ...tempItems].slice(0, 10));

    const fd = new FormData();
    for (const a of ok) {
      let uri = a.uri;
      const isVideo = a.type === "video";
      if (!isVideo) {
        try {
          const r = await ImageManipulator.manipulateAsync(
            uri,
            [{ resize: { width: 1600 } }],
            { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
          );
          uri = r.uri;
        } catch {}
      }
      const name = a.fileName || uri.split("/").pop() || "upload";
      const type = a.mimeType || (isVideo ? "video/mp4" : "image/jpeg");
      fd.append("files", { uri, name, type } as any);
    }
    try {
      const r: any = await uploadMedia(fd).unwrap();
      setAttachments((prev) =>
        [
          ...prev.filter((m: any) => m._batch !== batchKey),
          ...(r.attachments || []),
        ].slice(0, 10)
      );
    } catch (err: any) {
      setAttachments((prev) => prev.filter((m: any) => m._batch !== batchKey));
      Alert.alert("Upload thất bại", extractErr(err));
    }
  };

  const submit = async () => {
    if (!text.trim() && !attachments.length && !linkedTournament) return;
    if (attachments.some((m: any) => m._temp)) {
      Alert.alert("Vui lòng chờ tải xong", "Có file đang được tải lên.");
      return;
    }
    const stillPresent = selectedMentions
      .filter((m) => text.includes(`@${m.display}`))
      .map((m) => m._id);
    try {
      await sendMessage({
        cid: cidStr,
        content: text.trim(),
        attachments,
        mentions: stillPresent,
        linkedTournament: linkedTournament?._id || null,
      } as any).unwrap();
      setText("");
      setAttachments([]);
      setLinkedTournament(null);
      setSelectedMentions([]);
      // scroll về đầu (FlatList inverted → offset 0)
      flatRef.current?.scrollToOffset({ offset: 0, animated: true });
    } catch (err: any) {
      Alert.alert("Gửi thất bại", extractErr(err));
    }
  };

  const handleDelete = (mid: string) => {
    Alert.alert("Xoá tin nhắn?", undefined, [
      { text: "Huỷ", style: "cancel" },
      {
        text: "Xoá",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteMessage(mid).unwrap();
          } catch (err: any) {
            Alert.alert("Lỗi", extractErr(err));
          }
        },
      },
    ]);
  };

  const dmPeer =
    conv?.type === "dm" ? conv?.otherParticipants?.[0] : null;

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <Stack.Screen
        options={{
          title,
          // Header title tappable → mở profile của DM peer
          headerTitle: dmPeer?._id
            ? () => (
                <Pressable
                  onPress={() => router.push(`/profile/${String(dmPeer._id)}` as any)}
                  hitSlop={8}
                >
                  <Text
                    style={{
                      fontSize: 17,
                      fontWeight: "700",
                      color: "#0F172A",
                    }}
                    numberOfLines={1}
                  >
                    {title}
                  </Text>
                </Pressable>
              )
            : undefined,
          headerRight: dmPeer?._id
            ? () => (
                <UserActionsMenu
                  userId={String(dmPeer._id)}
                  userName={dmPeer?.nickname || dmPeer?.name}
                />
              )
            : undefined,
        }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? headerHeight : 0}
        style={{ flex: 1 }}
      >
        {isFetching && !items.length && (
          <ActivityIndicator style={{ marginTop: 20 }} />
        )}
        <FlatList
          ref={flatRef}
          data={items}
          keyExtractor={(m: any) => String(m._id)}
          inverted
          contentContainerStyle={{ padding: 12, paddingBottom: 8 }}
          renderItem={({ item, index }) => {
            const isMine =
              String(item.sender?._id || item.sender) === String(me?._id);
            const prev = items[index + 1]; // vì inverted → prev = older msg
            const next = items[index - 1]; // newer msg (visually below in inverted)
            const showAvatar =
              !isMine &&
              (!prev ||
                String(prev.sender?._id || prev.sender) !==
                  String(item.sender?._id || item.sender));
            const showTimeSep = shouldShowTimeSep(item, prev);
            // Hiện timestamp dưới bubble khi: là msg cuối cùng của cluster
            // (không có next cùng sender trong 5 phút)
            const showBubbleTime =
              !next ||
              String(next.sender?._id || next.sender) !==
                String(item.sender?._id || item.sender) ||
              (next.createdAt &&
                new Date(next.createdAt).getTime() -
                  new Date(item.createdAt).getTime() >
                  MS_5MIN);
            if (item.systemKind) {
              return (
                <View style={styles.systemBar}>
                  <Text style={styles.systemText}>{item.content}</Text>
                </View>
              );
            }
            if (item.deletedAt) {
              return (
                <View
                  style={[
                    styles.bubbleRow,
                    isMine ? styles.rowMine : styles.rowTheir,
                  ]}
                >
                  <View
                    style={[
                      styles.bubble,
                      isMine ? styles.bubbleMine : styles.bubbleTheir,
                      { opacity: 0.5 },
                    ]}
                  >
                    <Text
                      style={{
                        color: isMine ? "#E5E7EB" : "#94A3B8",
                        fontStyle: "italic",
                      }}
                    >
                      Tin nhắn đã bị xoá
                    </Text>
                  </View>
                </View>
              );
            }
            return (
              <View>
                <Pressable
                  onLongPress={isMine ? () => handleDelete(item._id) : undefined}
                  style={[
                    styles.bubbleRow,
                    isMine ? styles.rowMine : styles.rowTheir,
                  ]}
                >
                {!isMine && showAvatar && (
                  <Pressable
                    onPress={() => {
                      const uid = String(item.sender?._id || item.sender || "");
                      if (uid) router.push(`/profile/${uid}` as any);
                    }}
                    hitSlop={6}
                    style={{ marginRight: 6 }}
                  >
                    <AuthorAvatar user={item.sender} size={28} />
                  </Pressable>
                )}
                {!isMine && !showAvatar && <View style={{ width: 34 }} />}
                <View
                  style={[
                    styles.bubble,
                    isMine ? styles.bubbleMine : styles.bubbleTheir,
                  ]}
                >
                  {item.attachments?.length > 0 &&
                    (() => {
                      const msgImages = (item.attachments || [])
                        .filter((x: any) => x.type === "image" && x.url)
                        .map((x: any) => ({ uri: x.url }));
                      return item.attachments.map((a: any, i: number) => (
                        <View key={i} style={{ marginBottom: 4 }}>
                          {a.type === "image" ? (
                            <Pressable
                              onPress={() => {
                                const idx = msgImages.findIndex(
                                  (im: any) => im.uri === a.url
                                );
                                setImgViewer({
                                  visible: true,
                                  images: msgImages,
                                  index: idx < 0 ? 0 : idx,
                                });
                              }}
                            >
                              <Image
                                source={{ uri: a.url }}
                                style={styles.attachImg}
                              />
                            </Pressable>
                          ) : a.type === "video" ? (
                            <Pressable
                              onPress={() =>
                                a.url && setVideoModal({ url: a.url })
                              }
                            >
                              <View
                                style={[styles.attachImg, styles.attachVideo]}
                              >
                                <Ionicons
                                  name="play-circle"
                                  size={40}
                                  color="#fff"
                                />
                              </View>
                            </Pressable>
                          ) : (
                            <View style={styles.fileChip}>
                              <Ionicons
                                name="document-outline"
                                size={20}
                                color={isMine ? "#fff" : "#0F172A"}
                              />
                              <Text
                                style={{
                                  color: isMine ? "#fff" : "#0F172A",
                                  marginLeft: 6,
                                }}
                                numberOfLines={1}
                              >
                                {a.name || "Tệp đính kèm"}
                              </Text>
                            </View>
                          )}
                        </View>
                      ));
                    })()}
                  {!!item.content && (
                    <MentionText
                      content={item.content}
                      mentions={item.mentions}
                      style={[
                        styles.msgText,
                        { color: isMine ? "#fff" : "#0F172A" },
                      ]}
                      mentionColor={isMine ? "#DBEAFE" : "#1877F2"}
                    />
                  )}
                  {item.linkedTournament && (
                    <TournamentBubbleCard
                      tour={item.linkedTournament}
                      isMine={isMine}
                    />
                  )}
                </View>
                </Pressable>
                {showBubbleTime && (
                  <Text
                    style={[
                      styles.bubbleTime,
                      { textAlign: isMine ? "right" : "left" },
                    ]}
                  >
                    {fmtBubbleTime(item.createdAt)}
                  </Text>
                )}
                {/* Inverted list: separator ở dưới JSX = phía TRÊN visually
                    (giữa msg này và msg cũ hơn) */}
                {showTimeSep && (
                  <Text style={styles.timeSeparator}>
                    {fmtTimeSep(item.createdAt)}
                  </Text>
                )}
              </View>
            );
          }}
        />

        {/* Composer */}
        <View style={styles.composer}>
          {attachments.length > 0 && (
            <View style={styles.attachPreviewRow}>
              {attachments.map((a: any, i) => {
                const isTemp = !!a._temp;
                return (
                  <View key={a._key || i} style={styles.attachPreview}>
                    {a.type === "image" ? (
                      <Image
                        source={{ uri: isTemp ? a.tempUri : a.url }}
                        style={styles.previewImg}
                      />
                    ) : (
                      <View style={[styles.previewImg, styles.attachVideo]}>
                        <Ionicons name="videocam" size={18} color="#fff" />
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
                            borderRadius: 6,
                            gap: 2,
                          },
                        ]}
                        pointerEvents="none"
                      >
                        <ActivityIndicator size="small" color="#fff" />
                        <Text style={{ color: "#fff", fontSize: 9, fontWeight: "600" }}>
                          Đang tải…
                        </Text>
                      </View>
                    )}
                    {!isTemp && (
                      <Pressable
                        style={styles.previewRemove}
                        onPress={() =>
                          setAttachments((prev) =>
                            prev.filter((_, j) => j !== i)
                          )
                        }
                      >
                        <Ionicons name="close" size={12} color="#fff" />
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>
          )}
          {linkedTournament && (
            <View style={styles.chatTournamentChip}>
              <Ionicons name="trophy" size={14} color="#F59E0B" />
              <Text style={styles.chatTournamentText} numberOfLines={1}>
                {linkedTournament.name}
              </Text>
              <Pressable onPress={() => setLinkedTournament(null)} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color="#64748B" />
              </Pressable>
            </View>
          )}
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
                  <AuthorAvatar user={u} size={28} />
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
          <View style={styles.composerRow}>
            <Pressable onPress={pickMedia} style={styles.iconBtn}>
              <Ionicons name="image-outline" size={22} color="#0066FF" />
            </Pressable>
            <Pressable
              onPress={() => setTournamentPickerOpen(true)}
              style={styles.iconBtn}
            >
              <Ionicons name="trophy-outline" size={22} color="#F59E0B" />
            </Pressable>
            <TextInput
              style={styles.input}
              placeholder="Aa"
              value={text}
              onChangeText={onChangeText}
              multiline
              placeholderTextColor="#94A3B8"
            />
            <Pressable
              onPress={submit}
              disabled={
                sending ||
                (!text.trim() && !attachments.length && !linkedTournament)
              }
              style={[
                styles.sendBtn,
                (sending ||
                  (!text.trim() &&
                    !attachments.length &&
                    !linkedTournament)) && { opacity: 0.4 },
              ]}
            >
              <Ionicons name="send" size={18} color="#fff" />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      <ChatTournamentPickerModal
        visible={tournamentPickerOpen}
        onClose={() => setTournamentPickerOpen(false)}
        onPick={(t) => {
          setLinkedTournament(t);
          setTournamentPickerOpen(false);
        }}
      />

      {/* Fullscreen image viewer — pinch/swipe/close */}
      <ImageView
        images={imgViewer.images}
        imageIndex={imgViewer.index}
        visible={imgViewer.visible}
        onRequestClose={() =>
          setImgViewer({ visible: false, images: [], index: 0 })
        }
        swipeToCloseEnabled
        doubleTapToZoomEnabled
        backgroundColor="#000"
      />

      {/* Fullscreen video modal */}
      <ChatVideoModal
        url={videoModal?.url || null}
        onClose={() => setVideoModal(null)}
      />
    </SafeAreaView>
  );
}

function ChatVideoModal({
  url,
  onClose,
}: {
  url: string | null;
  onClose: () => void;
}) {
  const player = useVideoPlayer(url || "", (p) => {
    if (url) {
      p.loop = false;
      p.play();
    }
  });
  return (
    <Modal
      visible={!!url}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "#000",
          justifyContent: "center",
        }}
      >
        {url ? (
          <VideoView
            player={player}
            style={{ width: "100%", aspectRatio: 9 / 16, maxHeight: "100%" }}
            contentFit="contain"
            nativeControls
            allowsFullscreen
            allowsPictureInPicture={false}
          />
        ) : null}
        <Pressable
          onPress={onClose}
          hitSlop={12}
          style={{
            position: "absolute",
            top: 48,
            right: 20,
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: "rgba(0,0,0,0.55)",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
          }}
        >
          <Ionicons name="close" size={22} color="#fff" />
        </Pressable>
      </View>
    </Modal>
  );
}

function ChatTournamentPickerModal({
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
                  <Image source={{ uri: item.image }} style={styles.pickerThumb} />
                ) : (
                  <View style={[styles.pickerThumb, styles.pickerThumbFallback]}>
                    <Ionicons name="trophy" size={20} color="#F59E0B" />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickerName} numberOfLines={2}>
                    {item.name}
                  </Text>
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

const { width: SW } = Dimensions.get("window");

const styles = StyleSheet.create({
  mentionList: {
    marginHorizontal: 8,
    marginBottom: 6,
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
  mentionNick: { fontSize: 14, fontWeight: "700", color: "#0F172A" },
  mentionName: { fontSize: 12, color: "#64748B" },
  chatTournamentChip: {
    marginHorizontal: 8,
    marginBottom: 6,
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
    maxWidth: "90%",
  },
  chatTournamentText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#B45309",
    flexShrink: 1,
  },
  msgTournamentCard: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    // Force minWidth để card không bị co khi bubble content ngắn (VD chỉ "Ok?").
    // Bubble maxWidth = SW * 0.72 nên chọn 62% để chừa mép cho avatar + gap.
    minWidth: SW * 0.62,
    alignSelf: "stretch",
  },
  msgTournamentCardMine: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderColor: "rgba(255,255,255,0.28)",
  },
  msgTournamentImg: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: "#FEF3C7",
    flexShrink: 0,
  },
  msgTournamentImgFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  msgTournamentLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#B45309",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tourInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 3,
  },
  tourInfoText: { fontSize: 12, flexShrink: 1, lineHeight: 16 },
  timeSeparator: {
    textAlign: "center",
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "600",
    marginVertical: 12,
  },
  bubbleTime: {
    fontSize: 10,
    color: "#94A3B8",
    marginTop: 2,
    marginBottom: 6,
    marginHorizontal: 8,
  },
  msgTournamentName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
    marginTop: 2,
    lineHeight: 18,
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
  container: { flex: 1, backgroundColor: "#fff" },
  systemBar: { alignItems: "center", marginVertical: 8 },
  systemText: {
    fontSize: 12,
    color: "#94A3B8",
    fontStyle: "italic",
    textAlign: "center",
    paddingHorizontal: 20,
  },
  bubbleRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginVertical: 2,
    gap: 6,
  },
  rowMine: { justifyContent: "flex-end" },
  rowTheir: { justifyContent: "flex-start" },
  avatarXs: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#94A3B8",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: { color: "#fff", fontWeight: "700", fontSize: 12 },
  bubble: {
    maxWidth: SW * 0.72,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleMine: {
    backgroundColor: "#0066FF",
    borderBottomRightRadius: 4,
  },
  bubbleTheir: {
    backgroundColor: "#F1F5F9",
    borderBottomLeftRadius: 4,
  },
  msgText: { fontSize: 15, lineHeight: 20 },
  attachImg: {
    width: 200,
    height: 200,
    borderRadius: 12,
  },
  attachVideo: {
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
  },
  fileChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  composer: {
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    backgroundColor: "#fff",
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 12,
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: "#F1F5F9",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: "#0F172A",
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#0066FF",
    alignItems: "center",
    justifyContent: "center",
  },
  attachPreviewRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingBottom: 6,
  },
  attachPreview: {
    width: 60,
    height: 60,
    borderRadius: 8,
    overflow: "hidden",
    position: "relative",
  },
  previewImg: { width: "100%", height: "100%" },
  previewRemove: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
});
