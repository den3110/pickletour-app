import React, { useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { useTheme } from "@react-navigation/native";
import dayjs from "dayjs";
import { Ionicons } from "@expo/vector-icons";
import { useGetMyTicketsQuery } from "@/slices/supportApiSlice";

export default function SupportInboxScreen() {
  const router = useRouter();
  const theme = useTheme();
  const isDark = theme.dark;

  const { data, isLoading, refetch, isFetching } = useGetMyTicketsQuery();

  const colors = useMemo(
    () => ({
      bg: isDark ? "#121212" : "#F5F7FA",
      card: isDark ? "#1E1E1E" : "#FFFFFF",
      text: isDark ? "#FFFFFF" : "#222",
      sub: isDark ? "#A0A0A0" : "#666",
      border: isDark ? "#2A2A2A" : "#E8E8E8",
      primary: "#0a84ff",
    }),
    [isDark]
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <Stack.Screen
        options={{
          title: "Hỗ trợ / Góp ý",
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
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.back()}
              style={{
                paddingHorizontal: 8,
                paddingVertical: 4,
              }}
            >
              <Ionicons name="chevron-back" size={24} />
            </TouchableOpacity>
          ),
        }}
      />

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          data={data || []}
          keyExtractor={(item) => item._id}
          onRefresh={refetch}
          refreshing={isFetching}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          ListEmptyComponent={
            <View
              style={[
                styles.empty,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Text
                style={{
                  color: colors.text,
                  fontWeight: "800",
                  fontSize: 16,
                  marginBottom: 6,
                }}
              >
                Chưa có yêu cầu nào
              </Text>
              <Text style={{ color: colors.sub, marginBottom: 12 }}>
                Bấm nút + để gửi góp ý hoặc nhờ hỗ trợ.
              </Text>
              <TouchableOpacity
                onPress={() => router.push("/support/new")}
                style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={{ color: "#fff", fontWeight: "800" }}>
                  Tạo yêu cầu
                </Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => router.push(`/support/${item._id}`)}
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
              activeOpacity={0.8}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
              >
                <Ionicons
                  name="mail-unread-outline"
                  size={18}
                  color={colors.primary}
                />
                <Text
                  style={{ color: colors.text, fontWeight: "800", flex: 1 }}
                  numberOfLines={1}
                >
                  {item.title || "Hỗ trợ"}
                </Text>
                <Text style={{ color: colors.sub, fontSize: 12 }}>
                  {item.lastMessageAt
                    ? dayjs(item.lastMessageAt).format("DD/MM HH:mm")
                    : ""}
                </Text>
              </View>

              <Text
                style={{ color: colors.sub, marginTop: 8 }}
                numberOfLines={2}
              >
                {item.lastMessagePreview || "—"}
              </Text>

              <View style={{ marginTop: 10 }}>
                <Text style={{ color: colors.sub, fontSize: 12 }}>
                  Trạng thái:{" "}
                  <Text style={{ color: colors.text, fontWeight: "700" }}>
                    {item.status}
                  </Text>
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
  },
  empty: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
  },
  primaryBtn: {
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});
