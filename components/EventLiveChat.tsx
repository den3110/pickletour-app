// components/EventLiveChat.tsx
// Bình luận realtime trên trang xem live event (React Native)
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  Image,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSelector } from "react-redux";
import { useSocket } from "@/context/SocketContext";
import {
  useGetEventLiveCommentsQuery,
  usePostEventLiveCommentMutation,
} from "@/slices/eventLiveApiSlice";

const MAX_LEN = 500;
const HEARTBEAT_INTERVAL = 30_000;

interface Comment {
  _id: string;
  user?: {
    _id: string;
    name?: string;
    fullName?: string;
    nickname?: string;
    nickName?: string;
    avatar?: string;
  };
  content: string;
  platform?: string;
  createdAt: string;
}

const fmtTime = (d: string) => {
  try {
    return new Date(d).toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
};

const getUserName = (u?: Comment["user"]) =>
  u?.nickName || u?.nickname || u?.fullName || u?.name || "Ẩn danh";

export default function EventLiveChat() {
  const socket = useSocket();
  const user = useSelector((s: any) => s.auth?.userInfo);
  const [comments, setComments] = useState<Comment[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const { data: initial } = useGetEventLiveCommentsQuery({ limit: 30 });
  const [postComment] = usePostEventLiveCommentMutation();

  // Hydrate initial comments
  useEffect(() => {
    if (initial?.comments) {
      setComments(initial.comments);
    }
  }, [initial]);

  // Socket.IO
  useEffect(() => {
    if (!socket) return;

    socket.emit("event-live:chat:subscribe");
    socket.emit("event-live:viewer:join", { platform: Platform.OS });

    const onNew = (c: Comment) => {
      setComments((prev) => {
        if (prev.some((x) => x._id === c._id)) return prev;
        return [...prev, c];
      });
    };
    const onDeleted = ({ _id }: { _id: string }) => {
      setComments((prev) => prev.filter((c) => c._id !== _id));
    };

    socket.on("event-live:comment:new", onNew);
    socket.on("event-live:comment:deleted", onDeleted);

    const hb = setInterval(() => {
      socket.emit("event-live:viewer:ping");
    }, HEARTBEAT_INTERVAL);

    return () => {
      socket.emit("event-live:viewer:leave");
      socket.emit("event-live:chat:unsubscribe");
      socket.off("event-live:comment:new", onNew);
      socket.off("event-live:comment:deleted", onDeleted);
      clearInterval(hb);
    };
  }, [socket]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (comments.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [comments.length]);

  const doSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    Keyboard.dismiss();

    try {
      if (socket?.connected) {
        await new Promise<void>((resolve, reject) => {
          socket.emit(
            "event-live:comment:send",
            { content: text, platform: Platform.OS },
            (ack: any) => {
              if (ack?.ok) resolve();
              else reject(new Error(ack?.error || "failed"));
            },
          );
          setTimeout(() => reject(new Error("timeout")), 5000);
        });
      } else {
        await postComment({ content: text, platform: Platform.OS }).unwrap();
      }
      setInput("");
    } catch {
      try {
        await postComment({ content: text, platform: Platform.OS }).unwrap();
        setInput("");
      } catch {
        /* best effort */
      }
    }
    setSending(false);
  }, [input, sending, socket, postComment]);

  const renderItem = useCallback(
    ({ item }: { item: Comment }) => (
      <View style={styles.msgRow}>
        {item.user?.avatar ? (
          <Image
            source={{ uri: item.user.avatar }}
            style={styles.avatar}
          />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarText}>
              {(item.user?.name || "?")[0]}
            </Text>
          </View>
        )}
        <View style={styles.msgBody}>
          <View style={styles.msgHeader}>
            <Text style={styles.userName}>{getUserName(item.user)}</Text>
            <Text style={styles.time}>{fmtTime(item.createdAt)}</Text>
          </View>
          <Text style={styles.content}>{item.content}</Text>
        </View>
      </View>
    ),
    [],
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerText}>💬 Bình luận trực tiếp</Text>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={comments}
        keyExtractor={(item) => item._id}
        renderItem={renderItem}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      {/* Input */}
      <View style={styles.inputRow}>
        {user ? (
          <>
            <TextInput
              style={styles.input}
              placeholder="Nhập bình luận…"
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={input}
              onChangeText={(t) => setInput(t.length <= MAX_LEN ? t : t.slice(0, MAX_LEN))}
              onSubmitEditing={doSend}
              returnKeyType="send"
              editable={!sending}
              maxLength={MAX_LEN}
            />
            <Pressable
              onPress={doSend}
              disabled={!input.trim() || sending}
              style={[
                styles.sendBtn,
                (!input.trim() || sending) && styles.sendBtnDisabled,
              ]}
            >
              <Text style={styles.sendBtnText}>
                {sending ? "…" : "Gửi"}
              </Text>
            </Pressable>
          </>
        ) : (
          <Text style={styles.loginHint}>Đăng nhập để bình luận</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    borderRadius: 12,
    overflow: "hidden",
    minHeight: 250,
  },
  header: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  headerText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  list: { flex: 1 },
  listContent: { padding: 10, paddingBottom: 4 },
  msgRow: { flexDirection: "row", marginBottom: 8, gap: 8 },
  avatar: { width: 26, height: 26, borderRadius: 13, marginTop: 2 },
  avatarPlaceholder: {
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  msgBody: { flex: 1 },
  msgHeader: { flexDirection: "row", alignItems: "baseline", gap: 4 },
  userName: { color: "#4dd0e1", fontWeight: "700", fontSize: 12 },
  time: { color: "rgba(255,255,255,0.35)", fontSize: 10 },
  content: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 13,
    lineHeight: 18,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    color: "#fff",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  sendBtn: {
    backgroundColor: "#4dd0e1",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: "#000", fontWeight: "700", fontSize: 13 },
  loginHint: {
    color: "rgba(255,255,255,0.5)",
    textAlign: "center",
    flex: 1,
    fontSize: 13,
  },
});
