import { t } from "@/utils/i18n";
// app/messages/index.tsx — Danh sách cuộc trò chuyện.
import {
  Ionicons } from "@expo/vector-icons";
import { Stack,
  router } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "@/components/ui/i18nText";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSelector } from "react-redux";

import { useListConversationsQuery } from "@/slices/messagesApiSlice";
import { AuthorAvatar } from "@/components/social/AuthorAvatar";

const authorName = (u?: any) => u?.nickname || u?.name || "Người dùng";

const fmtTime = (iso?: string | Date | null) => {
  if (!iso) return "";
  const d = new Date(iso as any);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return "vừa xong";
  if (diff < 3600) return `${Math.floor(diff / 60)} phút`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)} ngày`;
  return d.toLocaleDateString("vi-VN");
};

function ConversationRow({ conv, me }: { conv: any; me: any }) {
  const other = conv.otherParticipants?.[0] || null;
  const title =
    conv.type === "tournament"
      ? `BTC · ${conv.tournament?.name || "Giải đấu"}`
      : conv.type === "club"
      ? `CLB · ${conv.club?.name || "Câu lạc bộ"}`
      : authorName(other);
  const avatarLetter = title[0]?.toUpperCase() || "?";
  const preview =
    conv.lastMessage?.text ||
    (conv.lastMessage?.hasAttachment ? "📎 Đính kèm" : "Chưa có tin nhắn");
  const isSelf =
    conv.lastMessage?.sender &&
    String(conv.lastMessage.sender) === String(me?._id);

  return (
    <Pressable
      onPress={() => router.push(`/messages/${conv._id}`)}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: "#F1F5F9" },
      ]}
    >
      {conv.type === "tournament" ? (
        <View
          style={[styles.avatar, { backgroundColor: "#F59E0B" }]}
        >
          <Text style={styles.avatarLetter}>{avatarLetter}</Text>
        </View>
      ) : conv.type === "club" ? (
        conv.club?.logoUrl ? (
          <Image source={{ uri: conv.club.logoUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: "#16a34a" }]}>
            <Text style={styles.avatarLetter}>{avatarLetter}</Text>
          </View>
        )
      ) : (
        <AuthorAvatar user={other} size={48} />
      )}
      <View style={{ flex: 1 }}>
        <View style={styles.rowHeader}>
          <Text
            style={[styles.title, conv.unread > 0 && { fontWeight: "800" }]}
            numberOfLines={1}
          >
            {title}
          </Text>
          <Text style={styles.time}>{fmtTime(conv.lastMessageAt)}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text
            style={[
              styles.preview,
              conv.unread > 0 && { color: "#0F172A", fontWeight: "600" },
            ]}
            numberOfLines={1}
          >
            {isSelf ? "Bạn: " : ""}
            {preview}
          </Text>
          {conv.unread > 0 && (
            <View style={styles.unreadDot}>
              <Text style={styles.unreadText}>{conv.unread}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

export default function MessagesListScreen() {
  const me = useSelector((s: any) => s.auth?.userInfo);
  const { data, isFetching, refetch } = useListConversationsQuery({});
  const items = data?.items || [];

  if (!me) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: t("Nhắn tin") }} />
        <View style={{ padding: 24, alignItems: "center" }}>
          <Text style={{ marginBottom: 12, color: "#334155" }}>
            Đăng nhập để xem tin nhắn.
          </Text>
          <Pressable
            onPress={() => router.push("/login")}
            style={styles.loginBtn}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>Đăng nhập</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <Stack.Screen options={{ title: t("Nhắn tin") }} />
      <FlatList
        data={items}
        keyExtractor={(i: any) => String(i._id)}
        renderItem={({ item }) => <ConversationRow conv={item} me={me} />}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={refetch} />
        }
        ListEmptyComponent={
          !isFetching ? (
            <View style={styles.empty}>
              <Ionicons name="chatbubbles-outline" size={48} color="#94A3B8" />
              <Text style={styles.emptyText}>Chưa có tin nhắn nào.</Text>
              <Text style={[styles.emptyText, { fontSize: 12 }]}>
                Bắt đầu bằng cách vào trang cá nhân của người khác hoặc mở giải
                và bấm "Nhắn BTC".
              </Text>
            </View>
          ) : (
            <View style={{ padding: 32 }}>
              <ActivityIndicator />
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 12,
  },
  sep: { height: 1, backgroundColor: "#F1F5F9", marginLeft: 68 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#0066FF",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: { color: "#fff", fontWeight: "700", fontSize: 18 },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { color: "#0F172A", fontSize: 15, flex: 1, marginRight: 8 },
  time: { color: "#94A3B8", fontSize: 12 },
  preview: { color: "#64748B", fontSize: 13, flex: 1 },
  unreadDot: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  unreadText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  empty: {
    padding: 32,
    alignItems: "center",
    gap: 8,
  },
  emptyText: { color: "#64748B", textAlign: "center" },
  loginBtn: {
    backgroundColor: "#0066FF",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
});
