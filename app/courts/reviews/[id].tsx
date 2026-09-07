// app/courts/reviews/[id].tsx — Đánh giá cụm sân (targetType=venue)
import React, { useEffect, useMemo, useState } from "react";
import { View, ScrollView, TextInput, TouchableOpacity, StyleSheet, Image, Alert, ActivityIndicator } from "react-native";
import { Text } from "@/components/ui/i18nText";
import { Ionicons } from "@expo/vector-icons";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { useSelector } from "react-redux";
import { useGetReviewsQuery, useUpsertReviewMutation, useDeleteMyReviewMutation } from "@/slices/reviewApiSlice";
import { pal } from "@/utils/courtFormat";

const uname = (u: any) => u?.nickname || u?.name || "Ẩn danh";
const fmtDate = (d: string) => { try { return new Date(d).toLocaleDateString("vi-VN"); } catch { return ""; } };

function Stars({ value, size = 18, onChange }: any) {
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => {
        const node = <Ionicons name={i <= Math.round(value) ? "star" : "star-outline"} size={size} color={i <= Math.round(value) ? "#f59e0b" : "rgba(148,163,184,0.6)"} />;
        return onChange ? <TouchableOpacity key={i} onPress={() => onChange(i)} hitSlop={4}>{node}</TouchableOpacity> : <View key={i}>{node}</View>;
      })}
    </View>
  );
}

export default function VenueReviewsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const C = useMemo(() => pal(!!theme.dark), [theme.dark]);
  const user = useSelector((s: any) => s.auth?.userInfo);
  const targetType = "venue";
  const { data, isLoading } = useGetReviewsQuery({ targetType, targetId: id, page: 1, limit: 50 }, { skip: !id });
  const [upsert, { isLoading: saving }] = useUpsertReviewMutation();
  const [removeReview] = useDeleteMyReviewMutation();

  const summary = data?.summary;
  const mine = data?.mine;
  const items = data?.items || [];
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [editing, setEditing] = useState(false);

  useEffect(() => { if (mine) { setRating(mine.rating || 0); setComment(mine.comment || ""); } }, [mine?._id]);
  const showForm = editing || !mine;

  const submit = async () => {
    if (!rating) return Alert.alert("Chọn số sao");
    try { await upsert({ targetType, targetId: id, rating, comment: comment.trim() }).unwrap(); setEditing(false); }
    catch (e: any) { Alert.alert("Lỗi", e?.data?.message || "Không gửi được"); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{ title: "Đánh giá sân" }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {isLoading ? <ActivityIndicator color="#f59e0b" style={{ marginTop: 30 }} /> : (
          <>
            <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border, alignItems: "center" }]}>
              <Text style={{ color: C.text, fontSize: 40, fontWeight: "900" }}>{summary?.avg ? summary.avg.toFixed(1) : "—"}</Text>
              <Stars value={summary?.avg || 0} />
              <Text style={{ color: C.sub, marginTop: 4 }}>{summary?.count || 0} đánh giá</Text>
            </View>

            {!user ? (
              <TouchableOpacity style={[styles.card, { backgroundColor: C.card, borderColor: C.border, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }]} onPress={() => router.push("/login")}>
                <Ionicons name="log-in-outline" size={18} color="#f59e0b" />
                <Text style={{ color: C.text, fontWeight: "700" }}>Đăng nhập để đánh giá</Text>
              </TouchableOpacity>
            ) : showForm ? (
              <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
                <Text style={{ color: C.text, fontWeight: "800", marginBottom: 8 }}>{mine ? "Sửa đánh giá" : "Viết đánh giá"}</Text>
                <View style={{ alignItems: "center", marginVertical: 6 }}><Stars value={rating} size={34} onChange={setRating} /></View>
                <TextInput style={[styles.input, { backgroundColor: C.field, color: C.text }]} placeholder="Chia sẻ trải nghiệm về sân…" placeholderTextColor={C.sub} value={comment} onChangeText={(t) => setComment(t.slice(0, 1000))} multiline />
                <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                  {mine && <TouchableOpacity style={[styles.btn, { borderWidth: 1, borderColor: C.border }]} onPress={() => setEditing(false)}><Text style={{ color: C.sub, fontWeight: "700" }}>Huỷ</Text></TouchableOpacity>}
                  <TouchableOpacity style={[styles.btn, { backgroundColor: "#f59e0b", flex: 1, opacity: saving ? 0.6 : 1 }]} disabled={saving} onPress={submit}><Text style={{ color: C.onAccent, fontWeight: "800" }}>{saving ? "Đang gửi…" : "Gửi đánh giá"}</Text></TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ color: C.text, fontWeight: "800" }}>Đánh giá của bạn</Text>
                  <View style={{ flexDirection: "row", gap: 14 }}>
                    <TouchableOpacity onPress={() => setEditing(true)}><Ionicons name="create-outline" size={20} color={C.sub} /></TouchableOpacity>
                    <TouchableOpacity onPress={() => Alert.alert("Xoá đánh giá?", "", [{ text: "Không" }, { text: "Xoá", style: "destructive", onPress: () => removeReview({ targetType, targetId: id }) }])}><Ionicons name="trash-outline" size={20} color="#ef4444" /></TouchableOpacity>
                  </View>
                </View>
                <Stars value={mine.rating} />
                {!!mine.comment && <Text style={{ color: C.text, marginTop: 6 }}>{mine.comment}</Text>}
              </View>
            )}

            <Text style={{ color: C.text, fontWeight: "800", fontSize: 16, marginBottom: 10 }}>Tất cả đánh giá ({summary?.count || 0})</Text>
            {items.length === 0 ? (
              <Text style={{ color: C.sub, textAlign: "center", marginTop: 10 }}>Chưa có đánh giá. Hãy là người đầu tiên!</Text>
            ) : items.map((r: any) => (
              <View key={r._id} style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  {r.reviewer?.avatar ? <Image source={{ uri: r.reviewer.avatar }} style={styles.avatar} /> : <View style={[styles.avatar, { backgroundColor: "#6366f1", alignItems: "center", justifyContent: "center" }]}><Text style={{ color: "#fff", fontWeight: "800" }}>{uname(r.reviewer)[0]}</Text></View>}
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={{ color: C.text, fontWeight: "700" }} numberOfLines={1}>{uname(r.reviewer)}</Text>
                      {r.verified && <View style={styles.chip}><Text style={{ color: "#22c55e", fontSize: 10, fontWeight: "700" }}>Đã chơi</Text></View>}
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Stars value={r.rating} size={12} />
                      <Text style={{ color: C.sub, fontSize: 12 }}>{fmtDate(r.createdAt)}</Text>
                    </View>
                  </View>
                </View>
                {!!r.comment && <Text style={{ color: C.text, marginTop: 6 }}>{r.comment}</Text>}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  card: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, padding: 16, marginBottom: 12 },
  input: { borderRadius: 12, padding: 12, minHeight: 90, textAlignVertical: "top", fontSize: 14 },
  btn: { paddingVertical: 13, borderRadius: 14, alignItems: "center" },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  chip: { backgroundColor: "rgba(34,197,94,0.15)", paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 },
});
