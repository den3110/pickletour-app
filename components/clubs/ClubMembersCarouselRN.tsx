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
// Thêm 2 thư viện này
import { useTheme } from "@react-navigation/native";
import { router } from "expo-router";

// --- COMPONENT AVATAR (Đã thêm dark mode prop) ---
function UserAvatar({ uri, size = 68, colors }) {
  const [hasError, setHasError] = useState(false);

  const isValidUri =
    uri &&
    typeof uri === "string" &&
    uri.trim().length > 0 &&
    uri !== "null" &&
    uri !== "undefined";

  if (!isValidUri || hasError) {
    return (
      <View
        style={[
          styles.avatarBase,
          styles.avatarPlaceholder,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: colors.avatarPlaceholder, // Dynamic color
            borderColor: colors.border,
          },
        ]}
      >
        <Ionicons name="person" size={size * 0.45} color="#818CF8" />
      </View>
    );
  }

  return (
    <Image
      source={{ uri: normalizeUrl(uri) }}
      style={[
        styles.avatarBase,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.avatarBg,
          borderColor: colors.border,
        },
      ]}
      contentFit="cover"
      cachePolicy="memory-disk"
      transition={200}
      onError={() => setHasError(true)}
    />
  );
}

// --- UI HELPERS (Đã thêm dark mode prop) ---
function GradLightCard({ children, style, pad = 12, colors }) {
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      {/* Giữ gradient overlay nhẹ để tạo hiệu ứng kính/bóng */}
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

function SmallDangerBtn({ title, onPress, style, disabled, isDark }) {
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.smallDangerBtn,
        {
          backgroundColor: isDark ? "rgba(255, 59, 48, 0.15)" : "#FFE9EC",
          borderColor: isDark ? "rgba(255, 59, 48, 0.3)" : "#FFD5DA",
        },
        style,
        disabled && { opacity: 0.6 },
      ]}
    >
      <Text style={styles.smallDangerText}>{title}</Text>
    </TouchableOpacity>
  );
}

// --- MAIN COMPONENT ---
export default function ClubMembersManagerRN({ club, canManage }) {
  const clubId = club?._id;

  // 1. SETUP THEME
  const theme = useTheme();
  const isDark = theme.dark;

  const colors = useMemo(
    () => ({
      text: isDark ? "#FFFFFF" : "#2D3561",
      subText: isDark ? "#A0A0A0" : "#6B7280",
      card: isDark ? "#1E1E1E" : "#FFFFFF",
      border: isDark ? "#333333" : "#E6E8F5",
      inputBg: isDark ? "#2C2C2E" : "#F9FAFB",
      placeholderText: isDark ? "#666" : "#9CA3AF",
      avatarPlaceholder: isDark ? "#2C2C2E" : "#EEF2FF",
      avatarBg: isDark ? "#333" : "#E0E7FF",
      // Role Pills colors
      roleOwnerBg: isDark ? "rgba(255, 193, 7, 0.2)" : "#FFF7E6",
      roleOwnerText: isDark ? "#FFD54F" : "#B7791F",
      roleAdminBg: isDark ? "rgba(99, 102, 241, 0.2)" : "#EEF2FF",
      roleAdminText: isDark ? "#818CF8" : "#4F46E5",
      roleMemberBg: isDark ? "#2C2C2E" : "#F1F5F9",
      roleMemberText: isDark ? "#A0A0A0" : "#64748B",
    }),
    [isDark]
  );

  const { data, isLoading, refetch, isFetching } = useListMembersQuery(
    { id: clubId },
    { skip: !clubId }
  );
  const [kickMember, { isLoading: kicking }] = useKickMemberMutation();
  const [setRole, { isLoading: settingRole }] = useSetRoleMutation();
  const [addMember, { isLoading: adding }] = useAddMemberMutation();

  const [addKey, setAddKey] = useState("");
  const members = useMemo(() => data?.items || [], [data]);

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

  // 2. Navigation
  const goToProfile = (userId) => {
    if (!userId) return;
    router.push(`/profile/${userId}`);
  };

  const roleLabel = (role) =>
    role === "owner" ? "Owner" : role === "admin" ? "Admin" : "Member";

  // Dynamic Role Style
  const rolePillStyle = (role) => {
    if (role === "owner")
      return [styles.pill, { backgroundColor: colors.roleOwnerBg }];
    if (role === "admin")
      return [styles.pill, { backgroundColor: colors.roleAdminBg }];
    return [styles.pill, { backgroundColor: colors.roleMemberBg }];
  };

  const roleTextStyle = (role) => {
    if (role === "owner") return { color: colors.roleOwnerText };
    if (role === "admin") return { color: colors.roleAdminText };
    return { color: colors.roleMemberText };
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#667eea" />
          <Text style={[styles.loadingText, { color: colors.subText }]}>
            Đang tải danh sách...
          </Text>
        </View>
      );
    }

    if (!members.length) {
      return (
        <EmptyState
          label="Chưa có thành viên"
          icon="account-group-outline"
          // Bạn có thể cần truyền thêm prop color cho EmptyState nếu component đó hỗ trợ
        />
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
          const userId = m?.user?._id || m?.user?.id;
          const toggleTitle = role === "admin" ? "Hạ role" : "Phong làm admin";

          return (
            // 3. Wrap trong TouchableOpacity để điều hướng
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => goToProfile(userId)}
            >
              <GradLightCard style={{ width: 164 }} colors={colors}>
                <View style={{ alignItems: "center" }}>
                  <UserAvatar uri={avatarUri} size={68} colors={colors} />

                  <Text
                    style={[styles.name, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    {name}
                  </Text>

                  <View style={rolePillStyle(role)}>
                    <Text style={[styles.pillText, roleTextStyle(role)]}>
                      {roleLabel(role)}
                    </Text>
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
                            userId: userId,
                            role: role === "admin" ? "member" : "admin",
                          }).unwrap();
                          Haptics.selectionAsync();
                          refetch();
                        }}
                      />
                      <SmallDangerBtn
                        title="Kick"
                        disabled={kicking}
                        isDark={isDark}
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
                                  userId: userId,
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
            </TouchableOpacity>
          );
        }}
      />
    );
  };

  return (
    <Section title="Thành viên">
      {canManage && (
        <View style={{ marginBottom: 16 }}>
          <GradLightCard pad={16} colors={colors}>
            <Text style={[styles.addLabel, { color: colors.text }]}>
              Thêm thành viên mới
            </Text>
            <View style={styles.inputRow}>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.inputBg,
                    borderColor: colors.border,
                    color: colors.text,
                  },
                ]}
                placeholder="Nhập nickname hoặc email..."
                placeholderTextColor={colors.placeholderText}
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
            <Text style={[styles.hintText, { color: colors.subText }]}>
              * Nhập chính xác nickname hoặc email đã đăng ký.
            </Text>
          </GradLightCard>
        </View>
      )}

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

      <View style={styles.contentWrapper}>{renderContent()}</View>
    </Section>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
    elevation: 3,
  },

  avatarBase: {
    borderWidth: 1,
    overflow: "hidden",
  },
  avatarPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
  },

  contentWrapper: {
    minHeight: 200,
  },
  loadingContainer: {
    height: 200,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },
  loadingText: { marginTop: 8, fontSize: 13 },

  addLabel: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 8,
  },
  inputRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  input: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  hintText: {
    fontSize: 11,
    marginTop: 6,
    fontStyle: "italic",
  },

  toolbar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 8,
    paddingHorizontal: 12,
  },
  refreshBtn: { flexDirection: "row", alignItems: "center" },
  refreshText: { color: "#667eea", fontWeight: "600", fontSize: 13 },

  name: { fontWeight: "700", marginTop: 8, maxWidth: 140 },
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
    borderWidth: 1,
  },
  smallDangerText: { color: "#B4232D", fontWeight: "800", fontSize: 12 },
});
