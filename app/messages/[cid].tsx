// app/messages/[cid].tsx — Chat window (Messenger-like)
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Stack, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useDispatch, useSelector } from "react-redux";

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
  const { cid } = useLocalSearchParams<{ cid: string }>();
  const me = useSelector((s: any) => s.auth?.userInfo);
  const dispatch = useDispatch();
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<any[]>([]);
  const flatRef = useRef<FlatList<any>>(null);
  const cidStr = String(cid);

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
    if (!text.trim() && !attachments.length) return;
    try {
      await sendMessage({
        cid: cidStr,
        content: text.trim(),
        attachments,
      }).unwrap();
      setText("");
      setAttachments([]);
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
        behavior={Platform.OS === "ios" ? "padding" : undefined}
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
                  <View style={styles.avatarXs}>
                    <Text style={styles.avatarLetter}>
                      {authorName(item.sender)[0]?.toUpperCase()}
                    </Text>
                  </View>
                )}
                {!isMine && !showAvatar && <View style={{ width: 32 }} />}
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
                    <Text
                      style={[
                        styles.msgText,
                        { color: isMine ? "#fff" : "#0F172A" },
                      ]}
                    >
                      {item.content}
                    </Text>
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
          <View style={styles.composerRow}>
            <Pressable onPress={pickMedia} style={styles.iconBtn}>
              <Ionicons name="image-outline" size={22} color="#0066FF" />
            </Pressable>
            <TextInput
              style={styles.input}
              placeholder="Aa"
              value={text}
              onChangeText={setText}
              multiline
              placeholderTextColor="#94A3B8"
            />
            <Pressable
              onPress={submit}
              disabled={sending || (!text.trim() && !attachments.length)}
              style={[
                styles.sendBtn,
                (sending || (!text.trim() && !attachments.length)) && {
                  opacity: 0.4,
                },
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

const { width: SW } = Dimensions.get("window");

const styles = StyleSheet.create({
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
