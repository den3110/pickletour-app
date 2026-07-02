import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { useTheme } from "@react-navigation/native";
import dayjs from "dayjs";
import { Ionicons } from "@expo/vector-icons";
import { useGetMyTicketsQuery } from "@/slices/supportApiSlice";

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  open: { label: "Đang mở", color: "#B45309", bg: "#FEF3C7" },
  pending: { label: "Đã phản hồi", color: "#0369A1", bg: "#E0F2FE" },
  closed: { label: "Đã đóng", color: "#047857", bg: "#D1FAE5" },
};

const CATEGORY_LABELS: Record<string, string> = {
  account: "Tài khoản",
  tournament: "Giải đấu",
  payment: "Thanh toán",
  technical: "Kỹ thuật",
  report: "Báo lỗi",
  other: "Khác",
};

const PRIORITY_META: Record<string, { label: string; color: string; bg: string }> = {
  low: { label: "Thấp", color: "#4B5563", bg: "#F3F4F6" },
  normal: { label: "Bình thường", color: "#1D4ED8", bg: "#DBEAFE" },
  high: { label: "Cao", color: "#B45309", bg: "#FEF3C7" },
  urgent: { label: "Khẩn cấp", color: "#B91C1C", bg: "#FEE2E2" },
};

const STATUS_FILTERS = [
  { value: "", label: "Tất cả" },
  { value: "open", label: "Đang mở" },
  { value: "pending", label: "Đã phản hồi" },
  { value: "closed", label: "Đã đóng" },
];

function statusMeta(status?: string) {
  return STATUS_META[String(status || "open")] || STATUS_META.open;
}

function priorityMeta(priority?: string) {
  return PRIORITY_META[String(priority || "normal")] || PRIORITY_META.normal;
}

function isUnread(ticket: any) {
  if (!ticket?.lastMessageAt) return false;
  if (!ticket?.userLastReadAt) return true;
  return dayjs(ticket.lastMessageAt).isAfter(dayjs(ticket.userLastReadAt));
}

export default function SupportInboxScreen() {
  const router = useRouter();
  const theme = useTheme();
  const isDark = theme.dark;
  const [statusFilter, setStatusFilter] = useState("");

  const { data, isLoading, isError, refetch, isFetching } =
    useGetMyTicketsQuery();

  const tickets = Array.isArray(data) ? data : [];
  const filteredTickets = useMemo(
    () =>
      statusFilter
        ? tickets.filter((ticket: any) => ticket.status === statusFilter)
        : tickets,
    [statusFilter, tickets],
  );

  const stats = useMemo(
    () =>
      tickets.reduce(
        (acc: any, ticket: any) => {
          acc.total += 1;
          if (ticket.status === "open") acc.open += 1;
          if (ticket.status === "pending") acc.pending += 1;
          if (ticket.status === "closed") acc.closed += 1;
          if (isUnread(ticket)) acc.unread += 1;
          return acc;
        },
        { total: 0, open: 0, pending: 0, closed: 0, unread: 0 },
      ),
    [tickets],
  );

  const colors = useMemo(
    () => ({
      bg: isDark ? "#121212" : "#F5F7FA",
      card: isDark ? "#1E1E1E" : "#FFFFFF",
      text: isDark ? "#FFFFFF" : "#222222",
      sub: isDark ? "#A0A0A0" : "#666666",
      border: isDark ? "#2A2A2A" : "#E8E8E8",
      primary: "#0A84FF",
      error: "#EF4444",
    }),
    [isDark],
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <Stack.Screen
        options={{
          title: "Hỗ trợ",
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push("/support/new")}
              style={{ paddingHorizontal: 12 }}
            >
              <Ionicons
                name="add-circle-outline"
                size={24}
                color={colors.primary}
              />
            </TouchableOpacity>
          ),
        }}
      />

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={{ color: colors.text, fontWeight: "800" }}>
            Không thể tải hộp thư hỗ trợ
          </Text>
          <TouchableOpacity
            onPress={() => refetch()}
            style={[
              styles.primaryBtn,
              { backgroundColor: colors.primary, marginTop: 12 },
            ]}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "800" }}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredTickets}
          keyExtractor={(item) => item._id}
          onRefresh={refetch}
          refreshing={isFetching}
          ListHeaderComponent={
            <View style={{ gap: 12 }}>
              <View style={styles.statsRow}>
                <View style={[styles.statBox, { backgroundColor: colors.card }]}>
                  <Text style={[styles.statValue, { color: colors.text }]}>
                    {stats.total}
                  </Text>
                  <Text style={[styles.statLabel, { color: colors.sub }]}>
                    Tất cả
                  </Text>
                </View>
                <View style={[styles.statBox, { backgroundColor: colors.card }]}>
                  <Text style={[styles.statValue, { color: colors.error }]}>
                    {stats.unread}
                  </Text>
                  <Text style={[styles.statLabel, { color: colors.sub }]}>
                    Chưa đọc
                  </Text>
                </View>
                <View style={[styles.statBox, { backgroundColor: colors.card }]}>
                  <Text style={[styles.statValue, { color: colors.primary }]}>
                    {stats.pending}
                  </Text>
                  <Text style={[styles.statLabel, { color: colors.sub }]}>
                    Phản hồi
                  </Text>
                </View>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8 }}
              >
                {STATUS_FILTERS.map((item) => {
                  const active = statusFilter === item.value;
                  return (
                    <TouchableOpacity
                      key={item.value || "all"}
                      onPress={() => setStatusFilter(item.value)}
                      style={[
                        styles.filterChip,
                        {
                          backgroundColor: active ? colors.primary : colors.card,
                          borderColor: active ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: active ? "#FFFFFF" : colors.text,
                          fontWeight: "800",
                        }}
                      >
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          }
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
          ListEmptyComponent={
            <View
              style={[
                styles.empty,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Ionicons
                name="mail-outline"
                size={30}
                color={colors.primary}
                style={{ marginBottom: 8 }}
              />
              <Text
                style={{
                  color: colors.text,
                  fontWeight: "800",
                  fontSize: 16,
                  marginBottom: 6,
                }}
              >
                Chưa có case hỗ trợ
              </Text>
              <Text
                style={{
                  color: colors.sub,
                  marginBottom: 12,
                  textAlign: "center",
                }}
              >
                Tạo case mới để gửi câu hỏi, góp ý hoặc báo lỗi cho đội ngũ hỗ
                trợ.
              </Text>
              <TouchableOpacity
                onPress={() => router.push("/support/new")}
                style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={{ color: "#FFFFFF", fontWeight: "800" }}>
                  Tạo case
                </Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }) => {
            const meta = statusMeta(item.status);
            const priority = priorityMeta(item.priority);
            const unread = isUnread(item);

            return (
              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: "/support/[ticketId]",
                    params: { ticketId: item._id },
                  })
                }
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.card,
                    borderColor: unread ? colors.primary : colors.border,
                  },
                ]}
                activeOpacity={0.82}
              >
                <View style={styles.titleRow}>
                  <Ionicons
                    name={unread ? "mail-unread-outline" : "mail-outline"}
                    size={19}
                    color={unread ? colors.primary : colors.sub}
                  />
                  <Text
                    style={{
                      color: colors.text,
                      fontWeight: unread ? "900" : "800",
                      flex: 1,
                    }}
                    numberOfLines={1}
                  >
                    {item.title || "Hỗ trợ"}
                  </Text>
                  {unread ? (
                    <View
                      style={[
                        styles.unreadDot,
                        { backgroundColor: colors.error },
                      ]}
                    />
                  ) : null}
                </View>

                <Text style={{ color: colors.sub, marginTop: 8 }} numberOfLines={2}>
                  {item.lastMessagePreview || "Chưa có nội dung"}
                </Text>

                <View style={styles.metaRow}>
                  <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
                    <Text style={[styles.statusText, { color: meta.color }]}>
                      {meta.label}
                    </Text>
                  </View>
                  <View
                    style={[styles.statusPill, { backgroundColor: priority.bg }]}
                  >
                    <Text style={[styles.statusText, { color: priority.color }]}>
                      {priority.label}
                    </Text>
                  </View>
                  <Text style={{ color: colors.sub, fontSize: 12 }}>
                    {item.lastMessageAt
                      ? dayjs(item.lastMessageAt).format("DD/MM HH:mm")
                      : ""}
                  </Text>
                </View>
                <Text style={{ color: colors.sub, fontSize: 12, marginTop: 8 }}>
                  {CATEGORY_LABELS[item.category] || CATEGORY_LABELS.other}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  statsRow: { flexDirection: "row", gap: 10 },
  statBox: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  statValue: { fontSize: 20, fontWeight: "900" },
  statLabel: { fontSize: 12, fontWeight: "700", marginTop: 2 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
  },
  card: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
  },
  empty: {
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    alignItems: "center",
  },
  primaryBtn: {
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  unreadDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  metaRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusText: { fontSize: 12, fontWeight: "800" },
});
