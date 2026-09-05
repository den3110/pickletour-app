// app/settings/notifications.tsx — Cài đặt thông báo
import React, { useMemo } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Text } from "@/components/ui/i18nText";
import { Ionicons } from "@expo/vector-icons";
import { Stack, router } from "expo-router";
import { useTheme } from "@react-navigation/native";
import {
  useGetNotificationPrefsQuery,
  usePatchNotificationPrefsMutation,
} from "@/slices/usersApiSlice";
import {
  useListMySubscriptionsQuery,
  useUnsubscribeTopicMutation,
} from "@/slices/subscriptionApiSlice";
import { useGetTournamentQuery } from "@/slices/tournamentsApiSlice";

const ACCENT = "#4dd0e1";

function pal(dark: boolean) {
  return {
    bg: dark ? "#0a0e1a" : "#f5f7fb",
    card: dark ? "#121829" : "#ffffff",
    border: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
    text: dark ? "#f8fafc" : "#0f172a",
    sub: dark ? "#94a3b8" : "#64748b",
  };
}

function Row({
  icon,
  title,
  desc,
  value,
  onValueChange,
  C,
  disabled,
}: any) {
  return (
    <View style={[styles.row, { borderBottomColor: C.border }]}>
      <View style={[styles.rowIcon, { backgroundColor: `${ACCENT}22` }]}>
        <Ionicons name={icon} size={18} color={ACCENT} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: C.text }]}>{title}</Text>
        {!!desc && (
          <Text style={[styles.rowDesc, { color: C.sub }]}>{desc}</Text>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ true: ACCENT, false: "#94a3b8" }}
        thumbColor="#fff"
      />
    </View>
  );
}

function FollowedRow({ topicId, C, onUnfollow }: any) {
  const { data: t } = useGetTournamentQuery(topicId, { skip: !topicId });
  const name = t?.name || "Giải đấu";
  return (
    <View style={[styles.row, { borderBottomColor: C.border }]}>
      <View style={[styles.rowIcon, { backgroundColor: "rgba(34,197,94,0.15)" }]}>
        <Ionicons name="trophy" size={18} color="#22c55e" />
      </View>
      <TouchableOpacity
        style={{ flex: 1 }}
        onPress={() => router.push({ pathname: "/tournament/[id]", params: { id: topicId } })}
      >
        <Text style={[styles.rowTitle, { color: C.text }]} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[styles.rowDesc, { color: C.sub }]}>Đang theo dõi</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => onUnfollow(topicId)} hitSlop={8}>
        <Ionicons name="close-circle" size={22} color="#ef4444" />
      </TouchableOpacity>
    </View>
  );
}

export default function NotificationSettingsScreen() {
  const theme = useTheme();
  const C = useMemo(() => pal(!!theme.dark), [theme.dark]);

  const { data: prefs, isLoading } = useGetNotificationPrefsQuery();
  const [patch] = usePatchNotificationPrefsMutation();
  const { data: subs } = useListMySubscriptionsQuery();
  const [unsubscribe] = useUnsubscribeTopicMutation();

  const followedTours = useMemo(
    () =>
      (Array.isArray(subs) ? subs : []).filter(
        (s: any) => s.topicType === "tournament" && s.topicId
      ),
    [subs]
  );

  const set = (patchBody: any) => patch(patchBody);

  const onUnfollow = (topicId: string) =>
    unsubscribe({ topicType: "tournament", topicId });

  const pushEnabled = prefs?.pushEnabled !== false;

  return (
    <View style={[styles.root, { backgroundColor: C.bg }]}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Cài đặt thông báo",
          headerBackTitle: "Quay lại",
        }}
      />
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
        {isLoading ? (
          <ActivityIndicator color={ACCENT} style={{ marginTop: 40 }} />
        ) : (
          <>
            <Text style={[styles.section, { color: C.sub }]}>CHUNG</Text>
            <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
              <Row
                C={C}
                icon="notifications"
                title="Nhận thông báo đẩy"
                desc="Bật/tắt toàn bộ thông báo đẩy trên thiết bị này"
                value={pushEnabled}
                onValueChange={(v: boolean) => set({ pushEnabled: v })}
              />
            </View>

            <Text style={[styles.section, { color: C.sub }]}>THEO LOẠI</Text>
            <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
              <Row
                C={C}
                icon="chatbubbles"
                title="Tin nhắn"
                desc="Thông báo tin nhắn trực tiếp và nhóm"
                value={!prefs?.chatMuteAll}
                disabled={!pushEnabled}
                onValueChange={(v: boolean) => set({ chatMuteAll: !v })}
              />
              <Row
                C={C}
                icon="newspaper"
                title="Bảng tin"
                desc="Bình luận, phản hồi, nhắc tên trong bài viết"
                value={!prefs?.feedMuteAll}
                disabled={!pushEnabled}
                onValueChange={(v: boolean) => set({ feedMuteAll: !v })}
              />
              <Row
                C={C}
                icon="trophy"
                title="Giải mới hợp trình"
                desc="Gợi ý giải đấu phù hợp trình độ của bạn"
                value={!prefs?.tournamentMuteAll}
                disabled={!pushEnabled}
                onValueChange={(v: boolean) => set({ tournamentMuteAll: !v })}
              />
            </View>

            <Text style={[styles.section, { color: C.sub }]}>
              GIẢI ĐANG THEO DÕI ({followedTours.length})
            </Text>
            <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
              {followedTours.length === 0 ? (
                <Text style={[styles.emptyText, { color: C.sub }]}>
                  Bạn chưa theo dõi giải nào. Mở trang giải và bấm "Theo dõi" để
                  nhận thông báo lịch, kết quả.
                </Text>
              ) : (
                followedTours.map((s: any) => (
                  <FollowedRow
                    key={String(s.topicId)}
                    topicId={String(s.topicId)}
                    C={C}
                    onUnfollow={onUnfollow}
                  />
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  section: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: { fontSize: 15, fontWeight: "700" },
  rowDesc: { fontSize: 12, marginTop: 2 },
  emptyText: { padding: 14, fontSize: 13, lineHeight: 19 },
});
