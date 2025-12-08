import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Section, EmptyState } from "./ui";
import {
  useListMembersQuery,
  useKickMemberMutation,
  useSetRoleMutation,
  useAddMemberMutation,
} from "@/slices/clubsApiSlice";
import * as Haptics from "expo-haptics";
import { normalizeUrl } from "@/utils/normalizeUri";

// --- COMPONENT AVATAR (Đã sửa lỗi khung trắng) ---
function UserAvatar({ uri, size = 68 }) {
  const [hasError, setHasError] = useState(false);

  // Kiểm tra kỹ URI có hợp lệ không (tránh trường hợp chuỗi "null", "undefined" hoặc rỗng)
  const isValidUri =
    uri &&
    typeof uri === "string" &&
    uri.trim().length > 0 &&
    uri !== "null" &&
    uri !== "undefined";

  // Logic hiển thị Placeholder (Icon)
  if (!isValidUri || hasError) {
    return (
      <View
        style={[
          styles.avatarBase,
          styles.avatarPlaceholder,
          { width: size, height: size, borderRadius: size / 2 },
        ]}
      >
        {/* Icon người dùng nằm chính giữa */}
        <Ionicons name="person" size={size * 0.45} color="#818CF8" />
      </View>
    );
  }

  // Logic hiển thị Ảnh
  return (
    <Image
      source={{ uri: normalizeUrl(uri) }}
      style={[
        styles.avatarBase,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: "#E0E7FF",
        },
      ]}
      contentFit="cover"
      cachePolicy="memory-disk"
      transition={200}
      onError={() => setHasError(true)} // Nếu load ảnh lỗi -> chuyển sang Icon
    />
  );
}

// --- UI HELPERS ---
function GradLightCard({ children, style, pad = 12 }) {
  return (
    <View style={[styles.card, style]}>
      <LinearGradient
        colors={["rgba(102,126,234,0.08)", "rgba(118,75,162,0.08)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={{ padding: pad }}>{children}</View>
    </View>
  );
}

function SmallGradBtn({ title, onPress, style, disabled, icon }) {
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      disabled={disabled}
      style={[styles.smallBtn, style, disabled && { opacity: 0.6 }]}
    >
      <LinearGradient
        colors={["#667eea", "#764ba2"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {icon && (
        <Ionicons
          name={icon}
          size={14}
          color="white"
          style={{ marginRight: 4 }}
        />
      )}
      <Text style={styles.smallBtnText}>{title}</Text>
    </TouchableOpacity>
  );
}

function SmallDangerBtn({ title, onPress, style, disabled }) {
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      disabled={disabled}
      style={[styles.smallDangerBtn, style, disabled && { opacity: 0.6 }]}
    >
      <Text style={styles.smallDangerText}>{title}</Text>
    </TouchableOpacity>
  );
}

// --- MAIN COMPONENT ---
export default function ClubMembersManagerRN({ club, canManage }) {
  const clubId = club?._id;

  const { data, isLoading, refetch, isFetching } = useListMembersQuery(
    { id: clubId },
    { skip: !clubId }
  );
  const [kickMember, { isLoading: kicking }] = useKickMemberMutation();
  const [setRole, { isLoading: settingRole }] = useSetRoleMutation();
  const [addMember, { isLoading: adding }] = useAddMemberMutation();

  const [addKey, setAddKey] = useState("");
  const members = useMemo(() => data?.items || [], [data]);

  // Handle Add Member
  const handleAdd = async () => {
    const key = addKey.trim();
    if (!key) {
      Alert.alert("Thông báo", "Vui lòng nhập nickname hoặc email.");
      return;
    }
    try {
      await addMember({ id: clubId, nickname: key, role: "member" }).unwrap();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Thành công", "Đã thêm thành viên mới!");
      setAddKey("");
      refetch();
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const msg = err?.data?.message || "Không thể thêm thành viên.";
      Alert.alert("Lỗi", msg);
    }
  };

  const roleLabel = (role) =>
    role === "owner" ? "Owner" : role === "admin" ? "Admin" : "Member";
  const rolePillStyle = (role) => {
    if (role === "owner") return [styles.pill, { backgroundColor: "#FFF7E6" }];
    if (role === "admin") return [styles.pill, { backgroundColor: "#EEF2FF" }];
    return [styles.pill, { backgroundColor: "#F1F5F9" }];
  };

  // --- RENDER CONTENT (Fix layout shift) ---
  const renderContent = () => {
    // Nếu đang loading lần đầu (chưa có data)
    if (isLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#667eea" />
          <Text style={styles.loadingText}>Đang tải danh sách...</Text>
        </View>
      );
    }

    if (!members.length) {
      return (
        <EmptyState label="Chưa có thành viên" icon="account-group-outline" />
      );
    }

    return (
      <FlatList
        horizontal
        data={members}
        keyExtractor={(m) => String(m._id)}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 8 }}
        showsHorizontalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
        renderItem={({ item: m }) => {
          const name =
            m?.user?.nickname || m?.user?.fullName || m?.user?.email || "User";
          const role = m?.role;
          const avatarUri = m?.user?.avatar ? String(m?.user?.avatar) : null;
          const toggleTitle = role === "admin" ? "Hạ role" : "Phong làm admin";

          return (
            <GradLightCard style={{ width: 164 }}>
              <View style={{ alignItems: "center" }}>
                {/* Dùng component UserAvatar đã fix */}
                <UserAvatar uri={avatarUri} size={68} />

                <Text style={styles.name} numberOfLines={1}>
                  {name}
                </Text>

                <View style={rolePillStyle(role)}>
                  <Text style={styles.pillText}>{roleLabel(role)}</Text>
                </View>

                {canManage && role !== "owner" && (
                  <View style={styles.actionsRow}>
                    <SmallGradBtn
                      title={toggleTitle}
                      disabled={settingRole}
                      style={{ paddingHorizontal: 8 }}
                      onPress={async () => {
                        await setRole({
                          id: clubId,
                          userId: m?.user?._id,
                          role: role === "admin" ? "member" : "admin",
                        }).unwrap();
                        Haptics.selectionAsync();
                        refetch();
                      }}
                    />
                    <SmallDangerBtn
                      title="Kick"
                      disabled={kicking}
                      style={{ paddingHorizontal: 8 }}
                      onPress={() => {
                        Alert.alert("Xác nhận", `Mời ${name} ra khỏi CLB?`, [
                          { text: "Hủy", style: "cancel" },
                          {
                            text: "Kick",
                            style: "destructive",
                            onPress: async () => {
                              await kickMember({
                                id: clubId,
                                userId: m?.user?._id,
                              }).unwrap();
                              Haptics.notificationAsync(
                                Haptics.NotificationFeedbackType.Success
                              );
                              refetch();
                            },
                          },
                        ]);
                      }}
                    />
                  </View>
                )}
              </View>
            </GradLightCard>
          );
        }}
      />
    );
  };

  return (
    <Section title="Thành viên">
      {/* FORM THÊM THÀNH VIÊN */}
      {canManage && (
        <View style={{ marginBottom: 16 }}>
          <GradLightCard pad={16}>
            <Text style={styles.addLabel}>Thêm thành viên mới</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="Nhập nickname hoặc email..."
                placeholderTextColor="#9CA3AF"
                value={addKey}
                onChangeText={setAddKey}
                autoCapitalize="none"
              />
              <SmallGradBtn
                title={adding ? "..." : "Thêm"}
                onPress={handleAdd}
                disabled={adding}
                style={{ height: 44, borderRadius: 8, paddingHorizontal: 16 }}
              />
            </View>
            <Text style={styles.hintText}>
              * Nhập chính xác nickname hoặc email đã đăng ký.
            </Text>
          </GradLightCard>
        </View>
      )}

      {/* NÚT REFRESH */}
      <View style={styles.toolbar}>
        <TouchableOpacity
          onPress={refetch}
          disabled={isFetching}
          style={styles.refreshBtn}
        >
          {isFetching && (
            <ActivityIndicator
              size="small"
              color="#667eea"
              style={{ marginRight: 6 }}
            />
          )}
          <Text style={styles.refreshText}>
            {isFetching ? "Đang cập nhật..." : "Làm mới danh sách"}
          </Text>
          {!isFetching && (
            <Ionicons
              name="refresh"
              size={14}
              color="#667eea"
              style={{ marginLeft: 4 }}
            />
          )}
        </TouchableOpacity>
      </View>

      {/* KHUNG CONTENT CỐ ĐỊNH CHIỀU CAO (Min-Height) */}
      <View style={styles.contentWrapper}>{renderContent()}</View>
    </Section>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E6E8F5",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
    elevation: 3,
  },

  // --- STYLE AVATAR & PLACEHOLDER ---
  avatarBase: {
    borderWidth: 1,
    borderColor: "#E6E8F5",
    overflow: "hidden", // Quan trọng để bo tròn hình bên trong
  },
  avatarPlaceholder: {
    backgroundColor: "#EEF2FF", // Màu nền tím rất nhạt (thay vì xám trắng)
    justifyContent: "center", // Căn giữa dọc
    alignItems: "center", // Căn giữa ngang
  },

  // Layout Fix
  contentWrapper: {
    minHeight: 200, // Giữ chỗ để không bị giật layout khi load
  },
  loadingContainer: {
    height: 200,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },
  loadingText: { marginTop: 8, color: "#9CA3AF", fontSize: 13 },

  // Form Styles
  addLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#2D3561",
    marginBottom: 8,
  },
  inputRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  input: {
    flex: 1,
    height: 44,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: "#333",
  },
  hintText: {
    fontSize: 11,
    color: "#9CA3AF",
    marginTop: 6,
    fontStyle: "italic",
  },

  // Toolbar
  toolbar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 8,
    paddingHorizontal: 12,
  },
  refreshBtn: { flexDirection: "row", alignItems: "center" },
  refreshText: { color: "#667eea", fontWeight: "600", fontSize: 13 },

  // Card items
  name: { color: "#2D3561", fontWeight: "700", marginTop: 8, maxWidth: 140 },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginTop: 6,
  },
  pillText: { fontSize: 12, fontWeight: "700" },
  actionsRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 10,
    flexWrap: "wrap",
    justifyContent: "center",
  },

  // Buttons
  smallBtn: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  smallBtnText: { color: "#FFFFFF", fontWeight: "800", fontSize: 12 },
  smallDangerBtn: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFE9EC",
    borderWidth: 1,
    borderColor: "#FFD5DA",
  },
  smallDangerText: { color: "#B4232D", fontWeight: "800", fontSize: 12 },
});
