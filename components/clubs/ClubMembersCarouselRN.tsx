import React, { useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Section, EmptyState } from "./ui";
import {
  useListMembersQuery,
  useKickMemberMutation,
  useSetRoleMutation,
} from "@/slices/clubsApiSlice";
import * as Haptics from "expo-haptics";
import { normalizeUrl } from "@/utils/normalizeUri";

const AVATAR_FALLBACK =
  "https://dummyimage.com/200x200/ede9fe/4f378b&text=User";

/** Card nền sáng phủ gradient tím rất nhẹ */
function GradLightCard({
  children,
  style,
  pad = 12,
}: {
  children: React.ReactNode;
  style?: any;
  pad?: number;
}) {
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

/** Nút nhỏ primary: gradient tím */
function SmallGradBtn({
  title,
  onPress,
  style,
}: {
  title: string;
  onPress?: () => void;
  style?: any;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={[styles.smallBtn, style]}
    >
      <LinearGradient
        colors={["#667eea", "#764ba2"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <Text style={styles.smallBtnText}>{title}</Text>
    </TouchableOpacity>
  );
}

/** Nút nhỏ danger: nền đỏ rất nhạt để hợp nền sáng */
function SmallDangerBtn({
  title,
  onPress,
  style,
}: {
  title: string;
  onPress?: () => void;
  style?: any;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={[styles.smallDangerBtn, style]}
    >
      <Text style={styles.smallDangerText}>{title}</Text>
    </TouchableOpacity>
  );
}

export default function ClubMembersCarouselRN({
  club,
  canManage,
}: {
  club: any;
  canManage: boolean;
}) {
  const clubId = club?._id;
  const { data, isLoading, refetch } = useListMembersQuery(
    { id: clubId },
    { skip: !clubId }
  );
  const [kickMember] = useKickMemberMutation();
  const [setRole] = useSetRoleMutation();
  const members = useMemo(() => data?.items || [], [data]);

  if (isLoading)
    return (
      <Section title="Thành viên">
        <GradLightCard>
          <Text style={{ color: "#5C6285" }}>Đang tải…</Text>
        </GradLightCard>
      </Section>
    );

  if (!members.length)
    return (
      <Section title="Thành viên">
        <EmptyState label="Chưa có thành viên" icon="account-group-outline" />
      </Section>
    );

  const roleLabel = (role?: string) =>
    role === "owner" ? "Owner" : role === "admin" ? "Admin" : "Member";

  const rolePillStyle = (role?: string) => {
    if (role === "owner")
      return [styles.pill, { backgroundColor: "#FFF7E6" }, styles.pillOwner];
    if (role === "admin")
      return [styles.pill, { backgroundColor: "#EEF2FF" }, styles.pillAdmin];
    return [styles.pill, { backgroundColor: "#F1F5F9" }, styles.pillMember];
  };

  return (
    <Section title="Thành viên">
      <FlatList
        horizontal
        data={members}
        keyExtractor={(m: any) => String(m._id)}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 8 }}
        ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
        renderItem={({ item: m }: any) => {
          const name =
            m?.user?.nickname || m?.user?.fullName || m?.user?.email || "User";
          const role = m?.role;
          const avatarUri =
            (m?.user?.avatar && String(m?.user?.avatar)) || AVATAR_FALLBACK;

          const toggleTitle = role === "admin" ? "Bỏ admin" : "Cấp admin";

          return (
            <GradLightCard style={{ width: 164 }}>
              <View style={{ alignItems: "center" }}>
                <Image
                  source={{ uri: normalizeUrl(avatarUri) }}
                  style={styles.avatar}
                  contentFit="cover"
                  // ✅ Bật cache: lưu cả RAM và disk
                  cachePolicy="memory-disk"
                  // Mượt mà hơn khi hiện ảnh
                  transition={150}
                  // Giúp Image recycles khi list cuộn dài
                  recyclingKey={`member-${m?.user?._id || m?._id}`}
                  // Placeholder trong lúc tải
                  placeholder={{ uri: AVATAR_FALLBACK }}
                />
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
                      onPress={async () => {
                        await kickMember({
                          id: clubId,
                          userId: m?.user?._id,
                        }).unwrap();
                        Haptics.selectionAsync();
                        refetch();
                      }}
                    />
                  </View>
                )}
              </View>
            </GradLightCard>
          );
        }}
      />
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

  avatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 1,
    borderColor: "#E6E8F5",
  },
  name: { color: "#2D3561", fontWeight: "700", marginTop: 8, maxWidth: 140 },

  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginTop: 6,
  },
  pillText: { fontSize: 12, fontWeight: "700" },
  pillOwner: {},
  pillAdmin: {},
  pillMember: {},

  actionsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },

  smallBtn: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  smallBtnText: { color: "#FFFFFF", fontWeight: "800", fontSize: 13 },

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
  smallDangerText: { color: "#B4232D", fontWeight: "800", fontSize: 13 },
});
