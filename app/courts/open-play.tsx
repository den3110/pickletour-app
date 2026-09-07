// app/courts/open-play.tsx — Sân mở ghép (open play): các lượt đặt sân mở cho người khác vào đánh chung
import React, { useMemo, useState } from "react";
import { View, FlatList, TouchableOpacity, Image, StyleSheet, RefreshControl, ActivityIndicator, Alert } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Text } from "@/components/ui/i18nText";
import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { useListOpenPlayQuery, useJoinOpenPlayMutation } from "@/slices/bookingsApiSlice";
import { fmtVND, dtLabel, tLabel, pal } from "@/utils/courtFormat";
import { Empty, Chip, shadow, R, SP } from "@/components/courts/ui";

const GENDER_LABEL: Record<string, string> = {
  male: "Chỉ nam",
  female: "Chỉ nữ",
  balanced: "Cân bằng nam/nữ",
};

const skillLabel = (min: any, max: any) => {
  const a = Number(min) || 0;
  const b = Number(max) || 0;
  if (a === 0 && b === 0) return "Mọi trình";
  return `${a.toFixed(1)}–${b.toFixed(1)}`;
};

// startAt → endAt: nếu cùng ngày chỉ hiện giờ kết thúc cho gọn
const timeRange = (startAt: any, endAt: any) => {
  const s = dtLabel(startAt);
  if (!endAt) return s;
  const sameDay =
    new Date(startAt).toDateString() === new Date(endAt).toDateString();
  return `${s} → ${sameDay ? tLabel(endAt) : dtLabel(endAt)}`;
};

export default function OpenPlayScreen() {
  const theme = useTheme();
  const C = useMemo(() => pal(!!theme.dark), [theme.dark]);
  const [province] = useState("");

  const { data, isLoading, isFetching, refetch } = useListOpenPlayQuery({ province });
  const items: any[] = Array.isArray(data) ? data : data?.items || [];

  const [join, { isLoading: joining }] = useJoinOpenPlayMutation();

  const onJoin = async (item: any) => {
    try {
      await join(item._id).unwrap();
      Alert.alert(
        "Đã tham gia",
        `Bạn đã tham gia lượt mở ghép của ${item.hostName || "chủ kèo"}. Hãy liên hệ chủ kèo để nắm chi tiết giờ giấc và cách chia tiền sân.`
      );
    } catch (err: any) {
      Alert.alert("Không tham gia được", err?.data?.message || "Vui lòng thử lại sau.");
    }
  };

  const renderCard = ({ item }: any) => {
    const slotsLeft = Number(item.slotsLeft) || 0;
    const capacity = Number(item.capacity) || 0;
    const full = slotsLeft <= 0;
    const free = !Number(item.pricePerPerson);
    const gLabel = item.genderPolicy && item.genderPolicy !== "any" ? GENDER_LABEL[item.genderPolicy] : "";

    return (
      <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }, shadow(C.dark, 2)]}>
        <View>
          {item.coverImage ? (
            <Image source={{ uri: item.coverImage }} style={styles.cover} />
          ) : (
            <LinearGradient colors={C.heroGrad} style={[styles.cover, { alignItems: "center", justifyContent: "center" }]}>
              <Ionicons name="people" size={38} color="rgba(255,255,255,0.6)" />
            </LinearGradient>
          )}
          <LinearGradient colors={["rgba(2,6,23,0)", "rgba(2,6,23,0.78)"]} style={styles.coverShade} />
          <View style={styles.coverBottom}>
            <Text style={styles.coverTitle} numberOfLines={1}>
              {[item.venueName, item.courtName].filter(Boolean).join(" · ") || "Sân mở ghép"}
            </Text>
            {!!item.hostName && (
              <View style={styles.coverRow}>
                <Ionicons name="person-circle-outline" size={13} color="rgba(255,255,255,0.85)" />
                <Text style={styles.coverSub} numberOfLines={1}>Chủ kèo: {item.hostName}</Text>
              </View>
            )}
          </View>
          <View style={[styles.slotPill, { backgroundColor: full ? C.muted : C.success }]}>
            <Ionicons name={full ? "close-circle" : "people"} size={11} color="#fff" />
            <Text style={styles.slotPillText}>{full ? "Hết suất" : `Còn ${slotsLeft} suất`}</Text>
          </View>
        </View>

        <View style={{ padding: SP.lg, gap: 10 }}>
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={15} color={C.accent} />
            <Text style={{ color: C.text, fontSize: 13.5, fontWeight: "700", flexShrink: 1 }} numberOfLines={1}>
              {timeRange(item.startAt, item.endAt)}
            </Text>
          </View>
          {!!(item.address || item.province) && (
            <View style={styles.infoRow}>
              <Ionicons name="location-outline" size={15} color={C.sub} />
              <Text style={{ color: C.sub, fontSize: 13, flexShrink: 1 }} numberOfLines={2}>
                {[item.address, item.province].filter(Boolean).join(", ")}
              </Text>
            </View>
          )}

          <View style={styles.chipRow}>
            <Chip C={C} small color={free ? C.success : C.accent} label={free ? "Miễn phí" : `${fmtVND(item.pricePerPerson)}/người`} />
            <Chip C={C} small color={C.info} label={skillLabel(item.skillMin, item.skillMax)} />
            {!!gLabel && <Chip C={C} small color={C.gold} label={gLabel} />}
            {capacity > 0 && <Chip C={C} small color={C.sub} label={`${item.going || 0}/${capacity} người`} />}
          </View>

          {!!item.note && (
            <View style={[styles.note, { backgroundColor: C.cardAlt, borderColor: C.border }]}>
              <Ionicons name="chatbubble-ellipses-outline" size={14} color={C.sub} style={{ marginTop: 1 }} />
              <Text style={{ color: C.sub, fontSize: 12.5, lineHeight: 18, flexShrink: 1 }}>{item.note}</Text>
            </View>
          )}

          <TouchableOpacity
            activeOpacity={0.85}
            disabled={full || joining}
            onPress={() => onJoin(item)}
            style={[styles.joinBtn, { backgroundColor: full ? C.field : C.accent, opacity: joining ? 0.6 : 1 }, full ? null : shadow(C.dark, 2)]}
          >
            <Ionicons name={full ? "lock-closed" : "add-circle"} size={18} color={full ? C.muted : C.onAccent} />
            <Text style={{ color: full ? C.muted : C.onAccent, fontWeight: "800", fontSize: 15 }}>
              {full ? "Hết suất" : "Tham gia"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{ title: "Sân mở ghép" }} />
      {isLoading ? (
        <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => String(it._id)}
          contentContainerStyle={{ padding: SP.lg, paddingBottom: 48 }}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={C.accent} />}
          ListEmptyComponent={
            <Empty
              C={C}
              icon="people-outline"
              title="Chưa có lượt mở ghép nào"
              subtitle="Hãy mở kèo từ màn đặt sân của bạn để rủ thêm người vào đánh chung."
            />
          }
          renderItem={renderCard}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: R.lg, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden", marginBottom: SP.lg },
  cover: { width: "100%", height: 150 },
  coverShade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 88 },
  coverBottom: { position: "absolute", left: 14, right: 14, bottom: 12 },
  coverTitle: { color: "#fff", fontWeight: "900", fontSize: 17, letterSpacing: -0.3 },
  coverRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  coverSub: { color: "rgba(255,255,255,0.85)", fontSize: 12.5, flexShrink: 1 },
  slotPill: { position: "absolute", top: 12, right: 12, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
  slotPillText: { color: "#fff", fontSize: 11.5, fontWeight: "800" },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  chipRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  note: { flexDirection: "row", alignItems: "flex-start", gap: 7, padding: 10, borderRadius: R.sm, borderWidth: StyleSheet.hairlineWidth },
  joinBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 13, borderRadius: R.md, marginTop: 2 },
});
