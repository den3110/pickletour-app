// app/friends/index.tsx — Trang Bạn bè (3 tab)
import { Ionicons } from "@expo/vector-icons";
import { Stack, router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSelector } from "react-redux";

import { FriendActions } from "@/components/social/FriendActions";
import { OpenMessageButton } from "@/components/social/OpenMessageButton";
import {
  useFriendCountsQuery,
  useListFriendRequestsQuery,
  useListFriendsQuery,
} from "@/slices/friendsApiSlice";

const authorName = (u?: any) => u?.nickname || u?.name || "Người dùng";
const fmtDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString("vi-VN") : "";

function UserRow({
  user,
  meta,
  right,
}: {
  user: any;
  meta?: string;
  right?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={() => user?._id && router.push(`/profile/${user._id}`)}
      style={styles.row}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarLetter}>
          {authorName(user)[0]?.toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{authorName(user)}</Text>
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      </View>
      <View style={{ flexDirection: "row", gap: 6 }}>{right}</View>
    </Pressable>
  );
}

function FriendsList() {
  const { data, isFetching, refetch } = useListFriendsQuery({});
  const items = data?.items || [];
  return (
    <FlatList
      data={items}
      keyExtractor={(i: any) => String(i.edgeId)}
      renderItem={({ item }) => (
        <UserRow
          user={item.user}
          meta={`Bạn từ ${fmtDate(item.since)}`}
          right={
            <>
              <OpenMessageButton userId={item.user?._id} compact />
              <FriendActions userId={item.user?._id} compact />
            </>
          }
        />
      )}
      ItemSeparatorComponent={() => <View style={styles.sep} />}
      refreshControl={
        <RefreshControl refreshing={isFetching} onRefresh={refetch} />
      }
      ListEmptyComponent={
        !isFetching ? (
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={48} color="#94A3B8" />
            <Text style={styles.emptyText}>Chưa có bạn nào.</Text>
            <Text style={styles.emptySub}>
              Gửi lời mời từ Bảng xếp hạng hoặc trang cá nhân.
            </Text>
          </View>
        ) : (
          <ActivityIndicator style={{ margin: 30 }} />
        )
      }
    />
  );
}

function RequestsList({ direction }: { direction: "incoming" | "outgoing" }) {
  const { data, isFetching, refetch } = useListFriendRequestsQuery(direction);
  const items = data?.items || [];
  return (
    <FlatList
      data={items}
      keyExtractor={(i: any) => String(i.edgeId)}
      renderItem={({ item }) => (
        <UserRow
          user={item.user}
          meta={
            direction === "incoming"
              ? `Gửi lời mời ${fmtDate(item.at)}`
              : `Đã gửi ${fmtDate(item.at)}`
          }
          right={<FriendActions userId={item.user?._id} />}
        />
      )}
      ItemSeparatorComponent={() => <View style={styles.sep} />}
      refreshControl={
        <RefreshControl refreshing={isFetching} onRefresh={refetch} />
      }
      ListEmptyComponent={
        !isFetching ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {direction === "incoming"
                ? "Không có lời mời chờ."
                : "Bạn chưa gửi lời mời nào."}
            </Text>
          </View>
        ) : (
          <ActivityIndicator style={{ margin: 30 }} />
        )
      }
    />
  );
}

export default function FriendsScreen() {
  const me = useSelector((s: any) => s.auth?.userInfo);
  const [tab, setTab] = useState<"friends" | "incoming" | "outgoing">(
    "friends"
  );
  const { data: counts } = useFriendCountsQuery(undefined, { skip: !me });

  if (!me) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: "Bạn bè" }} />
        <View style={{ padding: 24, alignItems: "center" }}>
          <Text style={{ marginBottom: 12, color: "#334155" }}>
            Đăng nhập để xem bạn bè.
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

  const Tab = ({
    id,
    label,
    badge,
    color,
  }: {
    id: any;
    label: string;
    badge?: number;
    color?: string;
  }) => {
    const active = tab === id;
    return (
      <Pressable
        onPress={() => setTab(id)}
        style={[styles.tabBtn, active && styles.tabBtnActive]}
      >
        <Text style={[styles.tabText, active && styles.tabTextActive]}>
          {label}
        </Text>
        {badge ? (
          <View
            style={[
              styles.badge,
              color ? { backgroundColor: color } : null,
            ]}
          >
            <Text style={styles.badgeText}>{badge > 99 ? "99+" : badge}</Text>
          </View>
        ) : null}
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Stack.Screen options={{ title: "Bạn bè" }} />
      <View style={styles.tabBar}>
        <Tab id="friends" label="Bạn bè" badge={counts?.friends} />
        <Tab
          id="incoming"
          label="Đã nhận"
          badge={counts?.incoming}
          color="#EF4444"
        />
        <Tab id="outgoing" label="Đã gửi" badge={counts?.outgoing} />
      </View>
      {tab === "friends" && <FriendsList />}
      {tab === "incoming" && <RequestsList direction="incoming" />}
      {tab === "outgoing" && <RequestsList direction="outgoing" />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    gap: 6,
  },
  tabBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#F1F5F9",
  },
  tabBtnActive: { backgroundColor: "#DBEAFE" },
  tabText: { color: "#64748B", fontWeight: "600", fontSize: 13 },
  tabTextActive: { color: "#0066FF" },
  badge: {
    backgroundColor: "#94A3B8",
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 12,
  },
  sep: { height: 1, backgroundColor: "#F1F5F9", marginLeft: 68 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#0066FF",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: { color: "#fff", fontWeight: "700" },
  name: { color: "#0F172A", fontWeight: "600" },
  meta: { color: "#64748B", fontSize: 12, marginTop: 2 },
  empty: { padding: 32, alignItems: "center", gap: 4 },
  emptyText: { color: "#334155", fontWeight: "600" },
  emptySub: { color: "#64748B", fontSize: 12, textAlign: "center" },
  loginBtn: {
    backgroundColor: "#0066FF",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
});
