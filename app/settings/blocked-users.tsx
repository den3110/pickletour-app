import { t } from "@/utils/i18n";
// app/settings/blocked-users.tsx
// Danh sách user đã chặn — cho phép user bỏ chặn.
// Apple Guideline 1.2 yêu cầu block phải reversible và người dùng biết mình đã chặn ai.
import {
  Ionicons } from "@expo/vector-icons";
import { Stack,
  router } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "@/components/ui/i18nText";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  useListBlockedQuery,
  useUnblockUserMutation,
} from "@/slices/friendsApiSlice";

export default function BlockedUsersScreen() {
  const { data, isFetching, refetch } = useListBlockedQuery(undefined);
  const [unblock, { isLoading: unblocking }] = useUnblockUserMutation();
  const items = data?.items || [];

  const doUnblock = (userId: string, name: string) => {
    Alert.alert(
      `Bỏ chặn ${name}?`,
      "Họ sẽ thấy lại bài viết và có thể nhắn tin cho bạn.",
      [
        { text: "Huỷ", style: "cancel" },
        {
          text: "Bỏ chặn",
          onPress: async () => {
            try {
              await unblock(userId).unwrap();
            } catch (err: any) {
              Alert.alert("Lỗi", err?.data?.message || "Không thực hiện được");
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <Stack.Screen options={{ title: t("Người đã chặn") }} />
      {isFetching && !items.length ? (
        <View style={styles.centered}>
          <ActivityIndicator />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="shield-checkmark-outline" size={40} color="#94A3B8" />
          <Text style={styles.emptyTitle}>Bạn chưa chặn ai</Text>
          <Text style={styles.emptyDesc}>
            Khi chặn 1 user, tên họ sẽ xuất hiện ở đây.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it: any) => String(it.edgeId)}
          onRefresh={refetch}
          refreshing={isFetching}
          contentContainerStyle={{ padding: 12 }}
          renderItem={({ item }: any) => {
            const u = item.user || {};
            const name = u.nickname || u.name || "Người dùng";
            return (
              <View style={styles.row}>
                <Pressable
                  style={styles.userInfo}
                  onPress={() => u._id && router.push(`/profile/${u._id}`)}
                >
                  {u.avatar ? (
                    <Image source={{ uri: u.avatar }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                      <Text style={{ color: "#fff", fontWeight: "700" }}>
                        {name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{name}</Text>
                    {u.nickname && u.name && (
                      <Text style={styles.sub}>@{u.nickname}</Text>
                    )}
                  </View>
                </Pressable>
                <Pressable
                  onPress={() => doUnblock(String(u._id), name)}
                  disabled={unblocking}
                  style={styles.unblockBtn}
                >
                  <Text style={styles.unblockText}>Bỏ chặn</Text>
                </Pressable>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 8,
  },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#0F172A" },
  emptyDesc: { color: "#64748B", textAlign: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#fff",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  userInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#E2E8F0" },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#64748B",
  },
  name: { fontWeight: "700", color: "#0F172A" },
  sub: { color: "#64748B", fontSize: 12 },
  unblockBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#DC2626",
  },
  unblockText: { color: "#DC2626", fontWeight: "700", fontSize: 13 },
});
