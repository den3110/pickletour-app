// Shared game room list item — hiển thị avatars user đang trong bàn.
import {
  Ionicons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import { Image,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "@/components/ui/i18nText";
import { useThemeTokens, type ThemeTokens } from "@/hooks/useThemeTokens";

export function RoomListItem({
  room,
  onPress,
  accentColor = "#0F172A",
  meta,
  stagePillLabel,
  stagePillActive = false,
}: {
  room: any;
  onPress: () => void;
  accentColor?: string;
  meta?: React.ReactNode;
  stagePillLabel?: string;
  stagePillActive?: boolean;
}) {
  const C = useThemeTokens();
  const styles = useMemo(() => mk_styles(C), [C]);
  const seatUsers: any[] = Array.isArray(room?.seatUsers) ? room.seatUsers : [];
  const emptySlots = Math.max(0, (room?.maxSeats || 0) - seatUsers.length);
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardTop}>
        <Text style={styles.roomName} numberOfLines={1}>
          {room.name}
        </Text>
        {stagePillLabel ? (
          <View
            style={[
              styles.stagePill,
              stagePillActive && { backgroundColor: accentColor + "22" },
            ]}
          >
            <Text
              style={{
                color: stagePillActive ? accentColor : C.sub,
                fontSize: 11,
                fontWeight: "800",
              }}
            >
              {stagePillLabel}
            </Text>
          </View>
        ) : null}
      </View>
      {meta ? <View style={styles.cardMeta}>{meta}</View> : null}
      {/* Avatar row */}
      <View style={styles.avatarRow}>
        {seatUsers.slice(0, 8).map((u: any, i: number) => (
          <View key={String(u._id || i)} style={styles.avatarWrap}>
            {u.avatar ? (
              <Image source={{ uri: u.avatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.avatarInitial}>
                  {(u.nickname || u.name || "?")[0]?.toUpperCase()}
                </Text>
              </View>
            )}
          </View>
        ))}
        {Array.from({ length: Math.min(emptySlots, 8 - seatUsers.length) }).map(
          (_, i) => (
            <View
              key={"e" + i}
              style={[styles.avatarWrap, styles.emptyAvatar]}
            >
              <Ionicons
                name="person-outline"
                size={14}
                color={C.muted}
              />
            </View>
          ),
        )}
        {seatUsers.length > 0 && (
          <Text style={styles.namesLabel} numberOfLines={1}>
            {seatUsers
              .slice(0, 3)
              .map((u: any) => u.nickname || u.name || "?")
              .join(", ")}
            {seatUsers.length > 3 ? ` +${seatUsers.length - 3}` : ""}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const mk_styles = (C: ThemeTokens) => StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 8,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  roomName: { flex: 1, fontSize: 15, fontWeight: "800", color: C.text },
  stagePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: C.field,
  },
  cardMeta: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
  },
  avatarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  avatarWrap: {
    marginRight: -4,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: C.card,
  },
  avatarPlaceholder: {
    backgroundColor: "#475569",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 11,
  },
  emptyAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.field,
    borderWidth: 2,
    borderColor: C.card,
    alignItems: "center",
    justifyContent: "center",
  },
  namesLabel: {
    marginLeft: 12,
    color: C.text3,
    fontSize: 11,
    fontWeight: "600",
    flex: 1,
  },
});
