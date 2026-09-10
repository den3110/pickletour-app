import { t } from "@/utils/i18n";
// app/notifications/index.tsx — Trung tâm thông báo
import {
  Ionicons } from "@expo/vector-icons";
import { Stack,
  router } from "expo-router";
import React, { useEffect, useMemo } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "@/components/ui/i18nText";
import { normalizeNotifUrl } from "@/utils/notifRoute";
import { SafeAreaView } from "react-native-safe-area-context";
import { useDispatch, useSelector } from "react-redux";

import {
  notificationCenterApiSlice,
  useDeleteNotifMutation,
  useListNotifsQuery,
  useMarkAllNotifReadMutation,
  useMarkNotifReadMutation,
  useNotifUnreadCountQuery,
} from "@/slices/notificationCenterApiSlice";
import { socket } from "@/lib/socket";
import { useThemeTokens, type ThemeTokens } from "@/hooks/useThemeTokens";
import {
  NOTIFICATION_COLORS,
  NotificationSectionHeader,
  NotificationSkeleton,
  NotificationsHeader,
  NotificationsPage,
} from "@/components/notifications/NotificationDesign";

const ICONS: Record<string, any> = {
  FEED_COMMENT_NEW: "chatbubble-outline",
  FEED_REPLY_NEW: "return-down-forward-outline",
  FEED_REACTION_NEW: "heart-outline",
  FEED_MENTION: "at-outline",
  CHAT_MESSAGE_NEW: "chatbubbles-outline",
  FRIEND_REQUEST_NEW: "person-add-outline",
  FRIEND_ACCEPTED: "people-outline",
  TOURNAMENT_UPDATE: "trophy-outline",
  TOURNAMENT_INVITE: "trophy-outline",
  BOOKING_NEW: "calendar-outline",
  COURT_BOOKING_NEW: "calendar-outline",
  PAYMENT_NEW: "card-outline",
  PAYMENT_PROOF_NEW: "receipt-outline",
  ATTACHMENT_NEW: "attach-outline",
  CLUB_UPDATE: "shield-outline",
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
  TOURNAMENT_INVITE: "#F59E0B",
  BOOKING_NEW: "#08BDF5",
  COURT_BOOKING_NEW: "#08BDF5",
  PAYMENT_NEW: "#16B8FF",
  PAYMENT_PROOF_NEW: "#16B8FF",
  ATTACHMENT_NEW: "#8B5CF6",
  CLUB_UPDATE: "#22D879",
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

const isToday = (iso?: string) => {
  if (!iso) return false;
  const date = new Date(iso);
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
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
  const C = useThemeTokens();
  const styles = useMemo(() => mk_styles(C), [C]);
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
        pressed && styles.rowPressed,
      ]}
    >
      <View
        style={[
          styles.iconWrap,
          {
            backgroundColor: `${color}1C`,
            borderColor: `${color}42`,
          },
        ]}
      >
        <Ionicons name={icon} size={25} color={color} />
      </View>
      <View style={styles.content}>
        <Text
          style={[styles.title, n.isRead && styles.titleRead]}
          numberOfLines={2}
        >
          {n.actor
            ? `${authorName(n.actor)}${n.title ? " · " + n.title : ""}`
            : n.title}
        </Text>
        <Text style={[styles.body, n.isRead && styles.bodyRead]} numberOfLines={2}>
          {n.body}
        </Text>
        <Text style={styles.time}>{fmt(n.createdAt)}</Text>
      </View>
      <View style={styles.trailing}>
        {!n.isRead && <View style={styles.unreadDot} />}
        {(n.url || n.actor) && (
          <Ionicons
            name="chevron-forward"
            size={20}
            color={n.isRead ? "#67829F" : NOTIFICATION_COLORS.primary}
          />
        )}
      </View>
    </Pressable>
  );
}

export default function NotificationsScreen() {
  const C = useThemeTokens();
  const styles = useMemo(() => mk_styles(C), [C]);
  const me = useSelector((s: any) => s.auth?.userInfo);
  const dispatch = useDispatch();
  const { data, isFetching, isError, refetch } = useListNotifsQuery(
    {},
    { skip: !me }
  );
  const { data: unreadData } = useNotifUnreadCountQuery(undefined, {
    skip: !me,
  });
  const [markRead] = useMarkNotifReadMutation();
  const [markAllRead] = useMarkAllNotifReadMutation();
  const [deleteNotif] = useDeleteNotifMutation();

  const items = useMemo(() => data?.items || [], [data?.items]);
  const unreadInList = items.filter((item: any) => !item.isRead).length;
  const unreadCount = Number(unreadData?.count || unreadInList || 0);
  const displayItems = useMemo(() => {
    const todayItems = items.filter((item: any) => isToday(item.createdAt));
    const olderItems = items.filter((item: any) => !isToday(item.createdAt));
    const grouped: any[] = [];
    if (todayItems.length > 0) {
      grouped.push({ _id: "section-today", __section: "Hôm nay" });
      grouped.push(...todayItems);
    }
    if (olderItems.length > 0) {
      grouped.push({ _id: "section-older", __section: "Trước đó" });
      grouped.push(...olderItems);
    }
    return grouped;
  }, [items]);

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
      <NotificationsPage>
        <SafeAreaView style={styles.container} edges={["top"]}>
          <Stack.Screen options={{ title: t("Thông báo"), headerShown: false }} />
          <NotificationsHeader unreadCount={0} />
          <View style={styles.loginState}>
            <Ionicons
              name="notifications-outline"
              size={34}
              color={NOTIFICATION_COLORS.primary}
            />
            <Text style={styles.loginText}>Đăng nhập để xem thông báo.</Text>
            <Pressable
              onPress={() => router.push("/login")}
              style={styles.loginBtn}
            >
              <Text style={{ color: "#fff", fontWeight: "800" }}>Đăng nhập</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </NotificationsPage>
    );
  }

  const handleOpen = async (n: any) => {
    if (!n.isRead) {
      try {
        await markRead(n._id).unwrap();
      } catch {}
    }
    const target = normalizeNotifUrl(n.url);
    if (target) router.push(target as any);
    else if (n.url) router.push(n.url as any);
  };

  return (
    <NotificationsPage>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Stack.Screen options={{ title: t("Thông báo"), headerShown: false }} />
        <FlatList
          data={displayItems}
          keyExtractor={(item: any) => String(item._id)}
          ListHeaderComponent={<NotificationsHeader unreadCount={unreadCount} />}
          renderItem={({ item }) =>
            item.__section ? (
              <NotificationSectionHeader
                title={item.__section}
                canMarkAll={item.__section === "Hôm nay" && unreadCount > 0}
                onMarkAll={() => markAllRead(undefined)}
              />
            ) : (
              <NotifRow
                n={item}
                onPress={() => handleOpen(item)}
                onDelete={() => deleteNotif(item._id)}
              />
            )
          }
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && items.length > 0}
              onRefresh={refetch}
              tintColor={NOTIFICATION_COLORS.primary}
            />
          }
          ListEmptyComponent={
            isFetching ? (
              <NotificationSkeleton />
            ) : isError ? (
              <View style={styles.empty}>
                <Ionicons
                  name="cloud-offline-outline"
                  size={42}
                  color={NOTIFICATION_COLORS.coral}
                />
                <Text style={styles.emptyTitle}>Không thể tải thông báo</Text>
                <Text style={styles.emptyText}>Vui lòng kiểm tra kết nối và thử lại.</Text>
                <Pressable onPress={refetch} style={styles.retryButton}>
                  <Ionicons name="refresh" size={17} color="#FFFFFF" />
                  <Text style={styles.retryText}>Thử lại</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.empty}>
                <Ionicons
                  name="notifications-outline"
                  size={46}
                  color={NOTIFICATION_COLORS.primary}
                />
                <Text style={styles.emptyTitle}>Chưa có thông báo</Text>
                <Text style={styles.emptyText}>
                  Khi có hoạt động mới, thông báo sẽ xuất hiện tại đây.
                </Text>
              </View>
            )
          }
          contentContainerStyle={styles.listContent}
        />
      </SafeAreaView>
    </NotificationsPage>
  );
}

const mk_styles = (_C: ThemeTokens) => StyleSheet.create({
  container: { flex: 1, backgroundColor: "transparent" },
  listContent: { paddingBottom: 116 },
  row: {
    flexDirection: "row",
    minHeight: 92,
    paddingVertical: 12,
    paddingHorizontal: 13,
    marginHorizontal: 12,
    gap: 11,
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(90,180,230,0.18)",
    backgroundColor: "rgba(5,25,49,0.82)",
  },
  rowUnread: {
    backgroundColor: "rgba(7,39,70,0.92)",
    borderColor: "rgba(8,189,245,0.38)",
    shadowColor: NOTIFICATION_COLORS.primary,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  rowPressed: { opacity: 0.78 },
  sep: { height: 8 },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  content: { flex: 1, minWidth: 0 },
  title: {
    color: NOTIFICATION_COLORS.text,
    fontWeight: "800",
    fontSize: 15.5,
    lineHeight: 20,
  },
  titleRead: { color: NOTIFICATION_COLORS.textSoft, fontWeight: "700" },
  body: {
    color: "#A8BDD5",
    fontSize: 14,
    lineHeight: 19,
    marginTop: 3,
  },
  bodyRead: { color: "#829CB8" },
  time: {
    color: "#6F89A8",
    fontSize: 12.5,
    lineHeight: 17,
    marginTop: 4,
  },
  trailing: {
    width: 22,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: NOTIFICATION_COLORS.primary,
    shadowColor: NOTIFICATION_COLORS.primary,
    shadowOpacity: 0.8,
    shadowRadius: 5,
  },
  empty: {
    marginHorizontal: 12,
    padding: 34,
    alignItems: "center",
    gap: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: NOTIFICATION_COLORS.border,
    backgroundColor: NOTIFICATION_COLORS.surface,
  },
  emptyTitle: {
    color: NOTIFICATION_COLORS.text,
    fontSize: 17,
    fontWeight: "800",
  },
  emptyText: {
    color: NOTIFICATION_COLORS.textMuted,
    fontSize: 13.5,
    lineHeight: 19,
    textAlign: "center",
  },
  retryButton: {
    minHeight: 40,
    marginTop: 6,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 14,
    backgroundColor: NOTIFICATION_COLORS.secondary,
  },
  retryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  loginState: {
    marginHorizontal: 16,
    padding: 28,
    alignItems: "center",
    gap: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: NOTIFICATION_COLORS.border,
    backgroundColor: NOTIFICATION_COLORS.surface,
  },
  loginText: { color: NOTIFICATION_COLORS.textSoft, fontSize: 14 },
  loginBtn: {
    backgroundColor: NOTIFICATION_COLORS.secondary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
  },
});
