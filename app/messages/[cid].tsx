// app/messages/[cid].tsx — Chat window (Messenger-like)
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Stack, router, useLocalSearchParams } from "expo-router";
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
    try {
      socket.emit("chat:subscribe", { conversationId: cidStr });
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
      quality: 0.85,
    });
    if (res.canceled || !res.assets?.length) return;
    const fd = new FormData();
    for (const a of res.assets) {
      const uri = a.uri;
      const name = a.fileName || uri.split("/").pop() || "upload";
      const type =
        a.mimeType || (a.type === "video" ? "video/mp4" : "image/jpeg");
      fd.append("files", { uri, name, type } as any);
    }
    try {
      const r: any = await uploadMedia(fd).unwrap();
      setAttachments((prev) => [...prev, ...(r.attachments || [])].slice(0, 10));
    } catch (err: any) {
      Alert.alert("Upload thất bại", extractErr(err));
    }
  };

  const submit = async () => {
    if (!text.trim() && !attachments.length && !linkedTournament) return;
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

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <Stack.Screen options={{ title }} />
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
            const prev = items[index + 1]; // vì inverted
            const showAvatar =
              !isMine &&
              (!prev ||
                String(prev.sender?._id || prev.sender) !==
                  String(item.sender?._id || item.sender));
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
              <Pressable
                onLongPress={isMine ? () => handleDelete(item._id) : undefined}
                style={[
                  styles.bubbleRow,
                  isMine ? styles.rowMine : styles.rowTheir,
                ]}
              >
                {!isMine && showAvatar && (
                  <View style={{ marginRight: 6 }}>
                    <AuthorAvatar user={item.sender} size={28} />
                  </View>
                )}
                {!isMine && !showAvatar && <View style={{ width: 34 }} />}
                <View
                  style={[
                    styles.bubble,
                    isMine ? styles.bubbleMine : styles.bubbleTheir,
                  ]}
                >
                  {item.attachments?.length > 0 &&
                    item.attachments.map((a: any, i: number) => (
                      <View key={i} style={{ marginBottom: 4 }}>
                        {a.type === "image" ? (
                          <Image
                            source={{ uri: a.url }}
                            style={styles.attachImg}
                          />
                        ) : a.type === "video" ? (
                          <View style={[styles.attachImg, styles.attachVideo]}>
                            <Ionicons
                              name="play-circle"
                              size={40}
                              color="#fff"
                            />
                          </View>
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
                    ))}
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
                    <Pressable
                      onPress={() =>
                        router.push(
                          `/tournament/${item.linkedTournament._id}` as any
                        )
                      }
                      style={[
                        styles.msgTournamentCard,
                        isMine && styles.msgTournamentCardMine,
                      ]}
                    >
                      {item.linkedTournament.image ? (
                        <Image
                          source={{ uri: item.linkedTournament.image }}
                          style={styles.msgTournamentImg}
                        />
                      ) : (
                        <View
                          style={[
                            styles.msgTournamentImg,
                            styles.msgTournamentImgFallback,
                          ]}
                        >
                          <Ionicons name="trophy" size={18} color="#F59E0B" />
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.msgTournamentLabel,
                            isMine && { color: "#FEF3C7" },
                          ]}
                        >
                          Giải đấu
                        </Text>
                        <Text
                          style={[
                            styles.msgTournamentName,
                            isMine && { color: "#fff" },
                          ]}
                          numberOfLines={2}
                        >
                          {item.linkedTournament.name}
                        </Text>
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={16}
                        color={isMine ? "#DBEAFE" : "#94A3B8"}
                      />
                    </Pressable>
                  )}
                </View>
              </Pressable>
            );
          }}
        />

        {/* Composer */}
        <View style={styles.composer}>
          {attachments.length > 0 && (
            <View style={styles.attachPreviewRow}>
              {attachments.map((a, i) => (
                <View key={i} style={styles.attachPreview}>
                  {a.type === "image" ? (
                    <Image source={{ uri: a.url }} style={styles.previewImg} />
                  ) : (
                    <View style={[styles.previewImg, styles.attachVideo]}>
                      <Ionicons name="videocam" size={18} color="#fff" />
                    </View>
                  )}
                  <Pressable
                    style={styles.previewRemove}
                    onPress={() =>
                      setAttachments((prev) => prev.filter((_, j) => j !== i))
                    }
                  >
                    <Ionicons name="close" size={12} color="#fff" />
                  </Pressable>
                </View>
              ))}
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
    </SafeAreaView>
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
    alignItems: "center",
    gap: 8,
    padding: 8,
    borderRadius: 10,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  msgTournamentCardMine: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderColor: "rgba(255,255,255,0.28)",
  },
  msgTournamentImg: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: "#FEF3C7",
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
  msgTournamentName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
    marginTop: 1,
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
