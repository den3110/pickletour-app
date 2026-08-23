// components/market/SellerReviewsRN.tsx — đánh giá người bán (mobile)
import React, { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Image, ActivityIndicator, Alert } from "react-native";
import { timeAgo } from "@/constants/market";
import StarRatingRN from "./StarRatingRN";
import {
  useListSellerReviewsQuery,
  useUpsertSellerReviewMutation,
  useDeleteSellerReviewMutation,
} from "@/slices/marketApiSlice";

export default function SellerReviewsRN({
  sellerId,
  listingId,
  me,
}: {
  sellerId: string;
  listingId: string;
  me: any;
}) {
  const { data, isLoading } = useListSellerReviewsQuery(sellerId, { skip: !sellerId });
  const [upsert, { isLoading: saving }] = useUpsertSellerReviewMutation();
  const [del] = useDeleteSellerReviewMutation();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (data?.myReview) {
      setRating(data.myReview.rating || 0);
      setComment(data.myReview.comment || "");
    }
  }, [data?.myReview]);

  if (isLoading) return <ActivityIndicator style={{ marginVertical: 12 }} color="#0d6efd" />;
  const items = data?.items || [];

  const submit = async () => {
    if (!rating) return Alert.alert("Thiếu", "Vui lòng chọn số sao");
    try {
      await upsert({ sellerId, rating, comment, listingId }).unwrap();
      Alert.alert("Thành công", "Đã gửi đánh giá");
    } catch (e: any) {
      Alert.alert("Lỗi", e?.data?.message || "Không gửi được");
    }
  };
  const remove = async () => {
    if (!data?.myReview) return;
    try { await del({ reviewId: data.myReview._id, sellerId }).unwrap(); setRating(0); setComment(""); } catch {}
  };

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <Text style={{ fontSize: 30, fontWeight: "900", color: "#0F172A" }}>
          {data?.ratingAvg ? data.ratingAvg.toFixed(1) : "—"}
        </Text>
        <View>
          <StarRatingRN value={data?.ratingAvg || 0} size={20} />
          <Text style={{ fontSize: 12.5, color: "#64748B", marginTop: 2 }}>{data?.ratingCount || 0} đánh giá</Text>
        </View>
      </View>

      {me && data?.canReview && (
        <View style={{ borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 12, padding: 12, marginBottom: 14 }}>
          <Text style={{ fontWeight: "700", marginBottom: 6 }}>
            {data.myReview ? "Sửa đánh giá của bạn" : "Đánh giá người bán này"}
          </Text>
          <StarRatingRN value={rating} size={30} onChange={setRating} />
          <TextInput
            value={comment}
            onChangeText={setComment}
            placeholder="Nhận xét (tuỳ chọn)…"
            placeholderTextColor="#94A3B8"
            multiline
            style={{ borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 10, padding: 10, marginTop: 8, minHeight: 54, textAlignVertical: "top" }}
          />
          <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
            <TouchableOpacity onPress={submit} disabled={saving} style={{ backgroundColor: "#0d6efd", paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10 }}>
              <Text style={{ color: "#fff", fontWeight: "700" }}>{data.myReview ? "Cập nhật" : "Gửi đánh giá"}</Text>
            </TouchableOpacity>
            {data.myReview && (
              <TouchableOpacity onPress={remove} style={{ paddingHorizontal: 12, paddingVertical: 9 }}>
                <Text style={{ color: "#94A3B8", fontWeight: "600" }}>Xoá</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
      {me && !data?.canReview && !data?.myReview && (
        <Text style={{ fontSize: 13, color: "#94A3B8", marginBottom: 12 }}>
          Bạn cần từng liên hệ/trả giá sản phẩm của người bán này mới đánh giá được.
        </Text>
      )}

      {items.length === 0 ? (
        <Text style={{ color: "#94A3B8", fontSize: 14 }}>Chưa có đánh giá nào.</Text>
      ) : (
        items.map((r: any) => (
          <View key={r._id} style={{ flexDirection: "row", gap: 10, paddingVertical: 8 }}>
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: "#E2E8F0", overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
              {r.reviewer?.avatar ? (
                <Image source={{ uri: r.reviewer.avatar }} style={{ width: "100%", height: "100%" }} />
              ) : (
                <Text style={{ fontWeight: "700", color: "#64748B" }}>{(r.reviewer?.name || "?").charAt(0)}</Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={{ fontWeight: "700", fontSize: 14 }} numberOfLines={1}>{r.reviewer?.nickname || r.reviewer?.name}</Text>
                <StarRatingRN value={r.rating} size={13} />
                <Text style={{ fontSize: 11.5, color: "#94A3B8" }}>{timeAgo(r.createdAt)}</Text>
              </View>
              {!!r.comment && <Text style={{ fontSize: 14, color: "#475569" }}>{r.comment}</Text>}
            </View>
          </View>
        ))
      )}
    </View>
  );
}
