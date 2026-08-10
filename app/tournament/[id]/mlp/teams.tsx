// MLP teams — list + đăng ký team mới. Captain quản roster.
import { Ionicons } from "@expo/vector-icons";
import { Stack, router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSelector } from "react-redux";

import {
  useListMlpTeamsQuery,
  useCreateMlpTeamMutation,
} from "@/slices/mlpApiSlice";

const STATUS_COLOR: Record<string, string> = {
  pending: "#F59E0B",
  approved: "#10B981",
  rejected: "#EF4444",
  withdrawn: "#94A3B8",
};
const STATUS_LABEL: Record<string, string> = {
  pending: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Từ chối",
  withdrawn: "Đã rút",
};

export default function MlpTeamsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useSelector((s: any) => s.auth?.userInfo);
  const { data, isFetching, refetch } = useListMlpTeamsQuery(
    { tourId: String(id) },
    { skip: !id }
  );
  const [createTeam, { isLoading: creating }] = useCreateMlpTeamMutation();

  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");

  const items = (data as any)?.items || [];

  const submit = async () => {
    if (!name.trim()) {
      Alert.alert("Nhập tên team");
      return;
    }
    try {
      await createTeam({
        tourId: String(id),
        name: name.trim(),
        shortName: shortName.trim(),
      }).unwrap();
      setName("");
      setShortName("");
      setFormOpen(false);
      refetch();
    } catch (err: any) {
      Alert.alert(
        "Lỗi",
        err?.data?.message || "Không tạo được team"
      );
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <Stack.Screen options={{ title: "MLP · Teams" }} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Danh sách Team</Text>
        {me && (
          <Pressable
            onPress={() => setFormOpen((v) => !v)}
            style={styles.addBtn}
          >
            <Ionicons
              name={formOpen ? "close" : "add"}
              size={18}
              color="#fff"
            />
            <Text style={styles.addBtnText}>
              {formOpen ? "Đóng" : "Đăng ký"}
            </Text>
          </Pressable>
        )}
      </View>

      {formOpen && (
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Tên team"
            value={name}
            onChangeText={setName}
            maxLength={100}
          />
          <TextInput
            style={styles.input}
            placeholder="Ký hiệu ngắn (tùy chọn, VD: HN, SG)"
            value={shortName}
            onChangeText={setShortName}
            maxLength={20}
          />
          <Pressable
            onPress={submit}
            disabled={creating}
            style={[styles.submitBtn, creating && { opacity: 0.5 }]}
          >
            <Text style={styles.submitBtnText}>
              {creating ? "Đang gửi…" : "Gửi đăng ký"}
            </Text>
          </Pressable>
          <Text style={styles.hint}>
            Bạn sẽ là đội trưởng. Sau khi BTC duyệt, thêm VĐV vào roster ở
            trang chi tiết team.
          </Text>
        </View>
      )}

      {isFetching && !items.length ? (
        <ActivityIndicator style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(t: any) => String(t._id)}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={{ padding: 32, alignItems: "center" }}>
              <Text style={{ color: "#64748B" }}>
                Chưa có team nào. Bấm "Đăng ký" để tạo team đầu tiên.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() =>
                router.push(
                  `/tournament/${id}/mlp/duals` as any
                )
              }
            >
              <View
                style={[
                  styles.logo,
                  { backgroundColor: item.color || "#0066FF" },
                ]}
              >
                {item.logo ? (
                  <Image
                    source={{ uri: item.logo }}
                    style={{ width: "100%", height: "100%" }}
                  />
                ) : (
                  <Text style={styles.logoText}>
                    {(item.shortName || item.name || "?")[0]?.toUpperCase()}
                  </Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.sub}>
                  Roster {item.players?.length || 0} VĐV
                </Text>
                <View
                  style={[
                    styles.statusPill,
                    {
                      backgroundColor:
                        (STATUS_COLOR[item.status] || "#94A3B8") + "22",
                      borderColor:
                        STATUS_COLOR[item.status] || "#94A3B8",
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: STATUS_COLOR[item.status] || "#94A3B8",
                      fontSize: 11,
                      fontWeight: "700",
                    }}
                  >
                    {STATUS_LABEL[item.status] || item.status}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: "700", color: "#0F172A" },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#0066FF",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addBtnText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  form: {
    backgroundColor: "#fff",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    gap: 8,
  },
  input: {
    backgroundColor: "#F1F5F9",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#0F172A",
  },
  submitBtn: {
    backgroundColor: "#0066FF",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  submitBtnText: { color: "#fff", fontWeight: "700" },
  hint: { fontSize: 12, color: "#64748B", marginTop: 4 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    marginBottom: 8,
    backgroundColor: "#fff",
    borderRadius: 12,
  },
  logo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  logoText: { color: "#fff", fontWeight: "900", fontSize: 20 },
  name: { fontSize: 15, fontWeight: "700", color: "#0F172A" },
  sub: { fontSize: 12, color: "#64748B", marginTop: 2 },
  statusPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 4,
  },
});
