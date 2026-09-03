// app/notifications/index.tsx — Trung tâm thông báo
import {
  Ionicons } from "@expo/vector-icons";
import { Stack,
  router } from "expo-router";
import React,
  { useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "@/components/ui/i18nText";
import { SafeAreaView } from "react-native-safe-area-context";
import { useDispatch, useSelector } from "react-redux";

import {
  notificationCenterApiSlice,
  useDeleteNotifMutation,
  useListNotifsQuery,
  useMarkAllNotifReadMutation,
  useMarkNotifReadMutation,
} from "@/slices/notificationCenterApiSlice";
import { socket } from "@/lib/socket";

const ICONS: Record<string, any> = {
  FEED_COMMENT_NEW: "chatbubble-outline",
  FEED_REPLY_NEW: "return-down-forward-outline",
  FEED_REACTION_NEW: "heart-outline",
  FEED_MENTION: "at-outline",
  CHAT_MESSAGE_NEW: "chatbubbles-outline",
  FRIEND_REQUEST_NEW: "person-add-outline",
  FRIEND_ACCEPTED: "people-outline",
  TOURNAMENT_UPDATE: "trophy-outline",
  SYSTEM: "information-circle-outline",
};
const COLORS: Record<string, string> = {
  FEED_COMMENT_NEW: "#0066FF",
  FEED_REPLY_NEW: "#0066FF",
  FEED_REACTION_NEW: "#EF4444",
  FEED_MENTION: "#8B5CF6",
  CHAT_MESSAGE_NEW: "#8B5CF6",
  FRIEND_REQUEST_NEW: "#10B981",
  FRIEND_ACCEPTED: "#10B981",
  TOURNAMENT_UPDATE: "#F59E0B",
  SYSTEM: "#64748B",
};

const authorName = (u?: any) => u?.nickname || u?.name || "Người dùng";
const fmt = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return "vừa xong";
  if (diff < 3600) return `${Math.floor(diff / 60)} phút`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)} ngày`;
  return d.toLocaleDateString("vi-VN");
};

function NotifRow({
  n,
  onPress,
  onDelete,
}: {
  n: any;
  onPress: () => void;
  onDelete: () => void;
}) {
  const icon = ICONS[n.type] || "notifications-outline";
  const color = COLORS[n.type] || "#0066FF";
  return (
    <Pressable
      onPress={onPress}
      onLongPress={() =>
        Alert.alert("Thông báo", n.title, [
          { text: "Đóng", style: "cancel" },
          { text: "Xoá", style: "destructive", onPress: onDelete },
        ])
      }
      style={({ pressed }) => [
        styles.row,
        !n.isRead && styles.rowUnread,
        pressed && { backgroundColor: "#F1F5F9" },
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: `${color}18` }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text
            style={[styles.title, !n.isRead && { fontWeight: "800" }]}
            numberOfLines={1}
          >
            {n.actor
              ? `${authorName(n.actor)}${
                  n.title ? " · " + n.title : ""
                }`
              : n.title}
          </Text>
          {!n.isRead && <View style={styles.unreadDot} />}
        </View>
        <Text style={styles.body} numberOfLines={2}>
          {n.body}
        </Text>
        <Text style={styles.time}>{fmt(n.createdAt)}</Text>
      </View>
    </Pressable>
  );
}

export default function NotificationsScreen() {
  const me = useSelector((s: any) => s.auth?.userInfo);
  const dispatch = useDispatch();
  const { data, isFetching, refetch } = useListNotifsQuery(
    {},
    { skip: !me }
  );
  const [markRead] = useMarkNotifReadMutation();
  const [markAllRead] = useMarkAllNotifReadMutation();
  const [deleteNotif] = useDeleteNotifMutation();

  // Realtime: nghe "notification:new" từ socket → refetch
  useEffect(() => {
    if (!me) return;
    const onNew = () => {
      dispatch(
        notificationCenterApiSlice.util.invalidateTags([
          { type: "Notif", id: "LIST" },
          { type: "NotifCount", id: "ME" },
        ])
      );
    };
    socket.on("notification:new", onNew);
    return () => {
      socket.off("notification:new", onNew);
    };
  }, [me, dispatch]);

  if (!me) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: "Thông báo" }} />
        <View style={{ padding: 24, alignItems: "center" }}>
          <Text style={{ color: "#334155", marginBottom: 12 }}>
            Đăng nhập để xem thông báo.
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

  const handleOpen = async (n: any) => {
    if (!n.isRead) {
      try {
        await markRead(n._id).unwrap();
      } catch {}
    }
    if (n.url) router.push(n.url as any);
  };

  const items = data?.items || [];
  const unreadInList = items.filter((x: any) => !x.isRead).length;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Stack.Screen
        options={{
          title: "Thông báo",
          headerRight: () =>
            unreadInList > 0 ? (
              <Pressable
                onPress={() => markAllRead()}
                hitSlop={10}
                style={{ paddingHorizontal: 8 }}
              >
                <Text style={{ color: "#0066FF", fontWeight: "600" }}>
                  Đã đọc tất cả
                </Text>
              </Pressable>
            ) : null,
        }}
      />
      <FlatList
        data={items}
        keyExtractor={(n: any) => String(n._id)}
        renderItem={({ item }) => (
          <NotifRow
            n={item}
            onPress={() => handleOpen(item)}
            onDelete={() => deleteNotif(item._id)}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={refetch} />
        }
        ListEmptyComponent={
          !isFetching ? (
            <View style={styles.empty}>
              <Ionicons name="notifications-outline" size={48} color="#94A3B8" />
              <Text style={styles.emptyText}>Chưa có thông báo nào.</Text>
            </View>
          ) : (
            <ActivityIndicator style={{ margin: 30 }} />
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
    padding: 12,
    gap: 12,
    alignItems: "flex-start",
  },
  rowUnread: { backgroundColor: "#F0F7FF" },
  sep: { height: 1, backgroundColor: "#F1F5F9", marginLeft: 60 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: "#0F172A", fontWeight: "600", fontSize: 14, flex: 1 },
  body: { color: "#334155", fontSize: 13, marginTop: 2 },
  time: { color: "#94A3B8", fontSize: 11, marginTop: 4 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#EF4444",
  },
  empty: { padding: 40, alignItems: "center", gap: 8 },
  emptyText: { color: "#64748B" },
  loginBtn: {
    backgroundColor: "#0066FF",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
});
