// app/tournament/[id]/reviews.tsx — Đánh giá giải đấu
import React, { useMemo, useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Image,
  Alert,
  RefreshControl,
} from "react-native";
import { Text } from "@/components/ui/i18nText";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, router } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { useSelector } from "react-redux";
import {
  useGetReviewsQuery,
  useUpsertReviewMutation,
  useDeleteMyReviewMutation,
} from "@/slices/reviewApiSlice";

const ACCENT = "#f59e0b";

function pal(dark: boolean) {
  return {
    bg: dark ? "#0a0e1a" : "#f5f7fb",
    card: dark ? "#121829" : "#ffffff",
    border: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
    text: dark ? "#f8fafc" : "#0f172a",
    sub: dark ? "#94a3b8" : "#64748b",
    inputBg: dark ? "rgba(255,255,255,0.06)" : "#f1f5f9",
  };
}

function Stars({
  value,
  size = 18,
  onChange,
  color = ACCENT,
}: {
  value: number;
  size?: number;
  onChange?: (v: number) => void;
  color?: string;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => {
        const filled = i <= Math.round(value);
        const node = (
          <Ionicons
            name={filled ? "star" : "star-outline"}
            size={size}
            color={filled ? color : "rgba(148,163,184,0.6)"}
          />
        );
        if (!onChange) return <View key={i}>{node}</View>;
        return (
          <TouchableOpacity key={i} onPress={() => onChange(i)} hitSlop={6}>
            {node}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function fmtDate(d: string) {
  try {
    return new Date(d).toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

const uname = (u: any) => u?.nickname || u?.name || "Ẩn danh";

export default function TournamentReviewsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const C = useMemo(() => pal(!!theme.dark), [theme.dark]);
  const user = useSelector((s: any) => s.auth?.userInfo);

  const targetType = "tournament";
  const { data, isLoading, isFetching, refetch } = useGetReviewsQuery(
    { targetType, targetId: id, page: 1, limit: 50 },
    { skip: !id }
  );
  const [upsert, { isLoading: saving }] = useUpsertReviewMutation();
  const [removeReview] = useDeleteMyReviewMutation();

  const summary = data?.summary;
  const mine = data?.mine;
  const items = data?.items || [];

  const [rating, setRating] = useState(0);
  const [org, setOrg] = useState(0);
  const [venue, setVenue] = useState(0);
  const [value, setValue] = useState(0);
  const [comment, setComment] = useState("");
  const [editing, setEditing] = useState(false);

  // Hydrate form từ đánh giá của mình
  useEffect(() => {
    if (mine) {
      setRating(mine.rating || 0);
      setOrg(mine.aspects?.organization || 0);
      setVenue(mine.aspects?.venue || 0);
      setValue(mine.aspects?.value || 0);
      setComment(mine.comment || "");
    }
  }, [mine?._id]);

  const canWrite = !!user;
  const showForm = editing || !mine;

  const onSubmit = async () => {
    if (!rating) {
      Alert.alert("Thiếu số sao", "Vui lòng chọn số sao (1-5).");
      return;
    }
    try {
      await upsert({
        targetType,
        targetId: id,
        rating,
        comment: comment.trim(),
        aspects: {
          organization: org || null,
          venue: venue || null,
          value: value || null,
        },
      }).unwrap();
      setEditing(false);
    } catch (e: any) {
      Alert.alert("Lỗi", e?.data?.message || "Không gửi được đánh giá.");
    }
  };

  const onDelete = () => {
    Alert.alert("Xoá đánh giá", "Bạn chắc chắn muốn xoá đánh giá của mình?", [
      { text: "Huỷ", style: "cancel" },
      {
        text: "Xoá",
        style: "destructive",
        onPress: async () => {
          try {
            await removeReview({ targetType, targetId: id }).unwrap();
            setRating(0);
            setOrg(0);
            setVenue(0);
            setValue(0);
            setComment("");
            setEditing(false);
          } catch (e: any) {
            Alert.alert("Lỗi", e?.data?.message || "Không xoá được.");
          }
        },
      },
    ]);
  };

  return (
    <View style={[styles.root, { backgroundColor: C.bg }]}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Đánh giá giải đấu",
          headerBackTitle: "Quay lại",
        }}
      />
      <ScrollView
        contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={refetch} />
        }
      >
        {isLoading ? (
          <ActivityIndicator color={ACCENT} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Summary */}
            <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
                <View style={{ alignItems: "center", minWidth: 88 }}>
                  <Text style={[styles.bigScore, { color: C.text }]}>
                    {summary?.avg ? summary.avg.toFixed(1) : "—"}
                  </Text>
                  <Stars value={summary?.avg || 0} size={16} />
                  <Text style={[styles.subText, { color: C.sub, marginTop: 4 }]}>
                    {summary?.count || 0} đánh giá
                  </Text>
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  {[5, 4, 3, 2, 1].map((s) => {
                    const c = summary?.dist?.[s] || 0;
                    const total = summary?.count || 0;
                    const pct = total ? (c / total) * 100 : 0;
                    return (
                      <View key={s} style={styles.distRow}>
                        <Text style={[styles.distNum, { color: C.sub }]}>{s}</Text>
                        <Ionicons name="star" size={10} color={ACCENT} />
                        <View style={[styles.distBar, { backgroundColor: C.inputBg }]}>
                          <View
                            style={{
                              width: `${pct}%`,
                              height: "100%",
                              backgroundColor: ACCENT,
                              borderRadius: 4,
                            }}
                          />
                        </View>
                        <Text style={[styles.distNum, { color: C.sub, width: 22, textAlign: "right" }]}>
                          {c}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>

              {/* Aspect averages */}
              {summary && summary.count > 0 && (
                <View style={styles.aspectRow}>
                  {[
                    { k: "organization", label: "Tổ chức" },
                    { k: "venue", label: "Sân bãi" },
                    { k: "value", label: "Xứng đáng" },
                  ].map((a) => (
                    <View key={a.k} style={styles.aspectCell}>
                      <Text style={[styles.aspectVal, { color: C.text }]}>
                        {summary.aspects?.[a.k]
                          ? summary.aspects[a.k].toFixed(1)
                          : "—"}
                      </Text>
                      <Text style={[styles.subText, { color: C.sub }]}>{a.label}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Write / your review */}
            {!canWrite ? (
              <TouchableOpacity
                style={[styles.card, styles.loginBtn, { borderColor: C.border }]}
                onPress={() => router.push("/login")}
              >
                <Ionicons name="log-in-outline" size={18} color={ACCENT} />
                <Text style={{ color: C.text, fontWeight: "700" }}>
                  Đăng nhập để đánh giá
                </Text>
              </TouchableOpacity>
            ) : showForm ? (
              <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
                <Text style={[styles.formTitle, { color: C.text }]}>
                  {mine ? "Sửa đánh giá của bạn" : "Viết đánh giá"}
                </Text>
                <View style={{ alignItems: "center", marginVertical: 8 }}>
                  <Stars value={rating} size={34} onChange={setRating} />
                </View>

                <View style={{ gap: 8, marginTop: 4 }}>
                  {[
                    { label: "Tổ chức", v: org, set: setOrg },
                    { label: "Sân bãi", v: venue, set: setVenue },
                    { label: "Xứng đáng", v: value, set: setValue },
                  ].map((a) => (
                    <View key={a.label} style={styles.aspectInputRow}>
                      <Text style={[styles.subText, { color: C.sub, width: 76 }]}>
                        {a.label}
                      </Text>
                      <Stars value={a.v} size={20} onChange={a.set} />
                    </View>
                  ))}
                </View>

                <TextInput
                  style={[
                    styles.input,
                    { backgroundColor: C.inputBg, color: C.text, borderColor: C.border },
                  ]}
                  placeholder="Chia sẻ trải nghiệm của bạn về giải…"
                  placeholderTextColor={C.sub}
                  value={comment}
                  onChangeText={setComment}
                  multiline
                  maxLength={1000}
                />

                <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                  {mine && (
                    <TouchableOpacity
                      style={[styles.btnGhost, { borderColor: C.border }]}
                      onPress={() => setEditing(false)}
                    >
                      <Text style={{ color: C.sub, fontWeight: "700" }}>Huỷ</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[styles.btnPrimary, saving && { opacity: 0.6 }]}
                    onPress={onSubmit}
                    disabled={saving}
                  >
                    <Text style={{ color: "#0a0e1a", fontWeight: "800" }}>
                      {saving ? "Đang gửi…" : "Gửi đánh giá"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              // Your existing review card
              <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
                <View style={styles.reviewHead}>
                  <Text style={[styles.formTitle, { color: C.text }]}>
                    Đánh giá của bạn
                  </Text>
                  <View style={{ flexDirection: "row", gap: 14 }}>
                    <TouchableOpacity onPress={() => setEditing(true)}>
                      <Ionicons name="create-outline" size={20} color={C.sub} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={onDelete}>
                      <Ionicons name="trash-outline" size={20} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                </View>
                <Stars value={mine.rating} size={18} />
                {!!mine.comment && (
                  <Text style={[styles.reviewBody, { color: C.text }]}>
                    {mine.comment}
                  </Text>
                )}
              </View>
            )}

            {/* All reviews */}
            <Text style={[styles.sectionTitle, { color: C.text }]}>
              Tất cả đánh giá ({summary?.count || 0})
            </Text>
            {items.length === 0 ? (
              <Text style={[styles.subText, { color: C.sub, textAlign: "center", marginTop: 12 }]}>
                Chưa có đánh giá nào. Hãy là người đầu tiên!
              </Text>
            ) : (
              items.map((r: any) => (
                <View
                  key={r._id}
                  style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}
                >
                  <View style={styles.reviewHead}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                      {r.reviewer?.avatar ? (
                        <Image source={{ uri: r.reviewer.avatar }} style={styles.avatar} />
                      ) : (
                        <View style={[styles.avatar, styles.avatarPh]}>
                          <Text style={{ color: "#fff", fontWeight: "800" }}>
                            {uname(r.reviewer)[0]}
                          </Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Text style={[styles.uname, { color: C.text }]} numberOfLines={1}>
                            {uname(r.reviewer)}
                          </Text>
                          {r.verified && (
                            <View style={styles.verifiedChip}>
                              <Text style={styles.verifiedText}>Đã tham gia</Text>
                            </View>
                          )}
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Stars value={r.rating} size={12} />
                          <Text style={[styles.subText, { color: C.sub }]}>
                            {fmtDate(r.createdAt)}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>
                  {!!r.comment && (
                    <Text style={[styles.reviewBody, { color: C.text }]}>{r.comment}</Text>
                  )}
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  bigScore: { fontSize: 40, fontWeight: "900", lineHeight: 44 },
  subText: { fontSize: 12 },
  distRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  distNum: { fontSize: 11, width: 10 },
  distBar: { flex: 1, height: 7, borderRadius: 4, overflow: "hidden" },
  aspectRow: {
    flexDirection: "row",
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(148,163,184,0.3)",
  },
  aspectCell: { flex: 1, alignItems: "center", gap: 2 },
  aspectVal: { fontSize: 18, fontWeight: "800" },
  loginBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  formTitle: { fontSize: 15, fontWeight: "800" },
  aspectInputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginTop: 12,
    minHeight: 80,
    textAlignVertical: "top",
    fontSize: 14,
  },
  btnPrimary: {
    flex: 1,
    backgroundColor: ACCENT,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  btnGhost: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
  },
  sectionTitle: { fontSize: 16, fontWeight: "800", marginBottom: 10, marginTop: 4 },
  reviewHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  reviewBody: { fontSize: 14, lineHeight: 20, marginTop: 6 },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarPh: { backgroundColor: "#6366f1", alignItems: "center", justifyContent: "center" },
  uname: { fontSize: 14, fontWeight: "700" },
  verifiedChip: {
    backgroundColor: "rgba(34,197,94,0.15)",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  verifiedText: { color: "#22c55e", fontSize: 10, fontWeight: "700" },
});
