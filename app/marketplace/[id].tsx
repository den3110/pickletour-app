// app/marketplace/[id].tsx — chi tiết tin trên Chợ (mobile)
import React, { useState } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  Pressable,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  useWindowDimensions,
  Linking,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useSelector } from "react-redux";
import {
  CATEGORY_MAP,
  CONDITION_MAP,
  TYPE_MAP,
  STATUS_MAP,
  STATUSES,
  formatPrice,
  priceRangeLabel,
  timeAgo,
} from "@/constants/market";
import {
  useGetMarketListingQuery,
  useToggleSaveMarketMutation,
  useCreateMarketOfferMutation,
  useUpdateMarketStatusMutation,
  useDeleteMarketListingMutation,
  useListMarketOffersQuery,
  useRespondMarketOfferMutation,
} from "@/slices/marketApiSlice";
import { useCreateFeedPostMutation } from "@/slices/feedApiSlice";
import { useBoostListingMutation } from "@/slices/marketApiSlice";
import StarRatingRN from "@/components/market/StarRatingRN";
import SellerReviewsRN from "@/components/market/SellerReviewsRN";

const BLUE = "#0d6efd";

function OffersManager({ listingId }: { listingId: string }) {
  const { data, isLoading, refetch } = useListMarketOffersQuery(listingId);
  const [respond, { isLoading: responding }] = useRespondMarketOfferMutation();
  if (isLoading) return <ActivityIndicator style={{ marginTop: 8 }} color={BLUE} />;
  const offers = data?.items || [];
  if (!offers.length)
    return <Text style={{ color: "#64748B", marginTop: 6 }}>Chưa có đề nghị nào.</Text>;
  const act = async (offerId: string, action: string) => {
    try {
      await respond({ offerId, action }).unwrap();
      refetch();
    } catch {
      Alert.alert("Lỗi", "Thao tác thất bại");
    }
  };
  return (
    <View style={{ marginTop: 8, gap: 8 }}>
      {offers.map((o: any) => (
        <View
          key={o._id}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            padding: 10,
            borderWidth: 1,
            borderColor: "#EAECEF",
            borderRadius: 12,
          }}
        >
          <Image
            source={{ uri: o.buyer?.avatar || undefined }}
            style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: "#E2E8F0" }}
          />
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: "700" }}>
              {o.buyer?.nickname || o.buyer?.name}{" "}
              <Text style={{ color: BLUE, fontWeight: "900" }}>· {formatPrice(o.amount, "sell")}</Text>
              {!!o.variantName && <Text style={{ color: "#64748B", fontSize: 12, fontWeight: "600" }}> ({o.variantName})</Text>}
            </Text>
            {!!o.message && <Text style={{ color: "#64748B", fontSize: 13 }}>“{o.message}”</Text>}
          </View>
          {o.status === "pending" ? (
            <View style={{ flexDirection: "row", gap: 6 }}>
              <TouchableOpacity
                disabled={responding}
                onPress={() => act(o._id, "accept")}
                style={{ backgroundColor: BLUE, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 }}
              >
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Nhận</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={responding}
                onPress={() => act(o._id, "reject")}
                style={{ backgroundColor: "#F1F5F9", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 }}
              >
                <Text style={{ color: "#334155", fontWeight: "700", fontSize: 13 }}>Từ chối</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={{ fontSize: 12, fontWeight: "700", color: o.status === "accepted" ? "#16a34a" : "#94A3B8" }}>
              {o.status === "accepted" ? "Đã nhận" : o.status === "rejected" ? "Từ chối" : "Đã huỷ"}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

export default function MarketDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const me = useSelector((s: any) => s.auth?.userInfo);
  const { data: item, isLoading, refetch } = useGetMarketListingQuery(id);
  const [toggleSave] = useToggleSaveMarketMutation();
  const [createOffer, { isLoading: offering }] = useCreateMarketOfferMutation();
  const [updateStatus] = useUpdateMarketStatusMutation();
  const [deleteListing] = useDeleteMarketListingMutation();
  const [createFeedPost, { isLoading: sharing }] = useCreateFeedPostMutation();
  const [boostListing, { isLoading: boosting }] = useBoostListingMutation();

  const onBoost = async () => {
    try {
      await boostListing(item._id).unwrap();
      Alert.alert("Thành công", "Đã đẩy tin lên đầu · nổi bật 2 ngày");
      refetch();
    } catch (e: any) {
      Alert.alert("Lỗi", e?.data?.message || "Không đẩy được tin");
    }
  };

  const [activeImg, setActiveImg] = useState(0);
  const [selVariant, setSelVariant] = useState<any>(null);
  const [offerOpen, setOfferOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");

  if (isLoading)
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
        <ActivityIndicator style={{ marginTop: 60 }} color={BLUE} />
      </SafeAreaView>
    );
  if (!item)
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" }}>
        <Text>Không tìm thấy tin đăng.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={{ color: BLUE }}>Quay lại</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );

  const cat = CATEGORY_MAP[item.category];
  const cond = CONDITION_MAP[item.condition];
  const type = TYPE_MAP[item.type];
  const status = STATUS_MAP[item.status];
  const images: any[] = item.images?.length ? item.images : [];
  const mainImg = images[activeImg]?.url || images[activeImg] || "";

  const onSave = async () => {
    if (!me) return router.push("/login" as any);
    try {
      await toggleSave(item._id).unwrap();
      refetch();
    } catch {}
  };

  const submitOffer = async () => {
    try {
      await createOffer({
        id: item._id,
        amount: Number(String(amount).replace(/\D/g, "")) || 0,
        message,
        variantName: selVariant?.name || "",
      }).unwrap();
      Alert.alert("Thành công", "Đã gửi đề nghị và nhắn tin cho người bán");
      setOfferOpen(false);
      setAmount("");
      setMessage("");
    } catch (e: any) {
      Alert.alert("Lỗi", e?.data?.message || "Gửi đề nghị thất bại");
    }
  };

  const changeStatus = async (s: string) => {
    setStatusOpen(false);
    try {
      await updateStatus({ id: item._id, status: s }).unwrap();
      refetch();
    } catch {
      Alert.alert("Lỗi", "Cập nhật thất bại");
    }
  };

  const onDelete = () => {
    Alert.alert("Xoá tin", "Bạn chắc chắn muốn xoá tin này?", [
      { text: "Huỷ", style: "cancel" },
      {
        text: "Xoá",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteListing(item._id).unwrap();
            router.replace("/marketplace/mine" as any);
          } catch {
            Alert.alert("Lỗi", "Xoá thất bại");
          }
        },
      },
    ]);
  };

  const handleShareToFeed = async () => {
    if (!me) return router.push("/login" as any);
    try {
      await createFeedPost({
        content: `Mình đang bán trên Chợ: ${item.title}`,
        sharedListing: {
          listingId: item._id,
          title: item.title,
          price: item.price,
          type: item.type,
          condition: item.condition,
          category: item.category,
          image: images[0]?.url || images[0] || "",
          sellerName: item.seller?.nickname || item.seller?.name || "",
          status: item.status,
          province: item.location?.province || "",
        },
      }).unwrap();
      Alert.alert("Thành công", "Đã chia sẻ sản phẩm lên bảng tin");
    } catch (e: any) {
      Alert.alert("Lỗi", e?.data?.message || "Chia sẻ thất bại");
    }
  };

  const specs = [
    cat && { label: "Danh mục", value: `${cat.emoji} ${cat.label}` },
    cond && { label: "Tình trạng", value: cond.label },
    item.brand && { label: "Thương hiệu", value: item.brand },
    item.size && { label: "Size / Thông số", value: item.size },
    item.color && { label: "Màu sắc", value: item.color },
  ].filter(Boolean) as { label: string; value: string }[];

  const canContact =
    (item.contact?.showPhone && item.contact?.phone) || item.contact?.zalo;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }} edges={["top"]}>
      {/* Header bar */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 12,
          paddingBottom: 8,
          backgroundColor: "#fff",
          borderBottomWidth: 1,
          borderBottomColor: "#EEF0F3",
        }}
      >
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color="#111827" />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 17, fontWeight: "800", marginLeft: 4 }} numberOfLines={1}>
          Chi tiết
        </Text>
        <TouchableOpacity onPress={handleShareToFeed} hitSlop={8} disabled={sharing} style={{ marginRight: 14 }}>
          <Ionicons name="megaphone-outline" size={23} color={sharing ? "#94A3B8" : "#334155"} />
        </TouchableOpacity>
        {!item.isOwner && (
          <TouchableOpacity onPress={onSave} hitSlop={8}>
            <Ionicons name={item.saved ? "heart" : "heart-outline"} size={24} color={item.saved ? "#e11d48" : "#334155"} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
        {/* Gallery */}
        <View style={{ width, height: width, backgroundColor: "#000" }}>
          {mainImg ? (
            <Image source={{ uri: mainImg }} style={{ width: "100%", height: "100%" }} resizeMode="contain" />
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 64 }}>{cat?.emoji}</Text>
            </View>
          )}
          {item.status !== "available" && (
            <View style={{ position: "absolute", top: 12, left: 12, backgroundColor: status?.color, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
              <Text style={{ color: "#fff", fontWeight: "800" }}>{status?.label}</Text>
            </View>
          )}
        </View>
        {images.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 10, gap: 8 }}>
            {images.map((im, i) => (
              <TouchableOpacity key={i} onPress={() => setActiveImg(i)}>
                <Image
                  source={{ uri: im.url || im }}
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: 8,
                    borderWidth: 2,
                    borderColor: i === activeImg ? BLUE : "transparent",
                  }}
                />
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Info card */}
        <View style={{ backgroundColor: "#fff", margin: 12, borderRadius: 16, padding: 16 }}>
          {type && item.type !== "sell" && (
            <View style={{ alignSelf: "flex-start", backgroundColor: type.color, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginBottom: 8 }}>
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>{type.emoji} {type.label}</Text>
            </View>
          )}
          <Text style={{ fontSize: 19, fontWeight: "800", color: "#111827", lineHeight: 26 }}>{item.title}</Text>
          <Text style={{ fontSize: 26, fontWeight: "900", color: BLUE, marginTop: 6 }}>
            {selVariant ? formatPrice(selVariant.price, item.type) : priceRangeLabel(item)}
            {item.negotiable && item.type === "sell" && item.price > 0 && !item.hasVariants && (
              <Text style={{ fontSize: 13, color: "#64748B", fontWeight: "600" }}>  · Thương lượng</Text>
            )}
          </Text>

          {/* Bộ chọn phân loại */}
          {item.hasVariants && item.variants?.length > 0 && (
            <View style={{ marginTop: 10 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", marginBottom: 6, color: "#334155" }}>
                {item.variantLabel || "Phân loại"}{selVariant ? `: ${selVariant.name}` : ""}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {item.variants.map((v: any, i: number) => {
                  const active = selVariant?.name === v.name;
                  return (
                    <TouchableOpacity
                      key={i}
                      onPress={() => setSelVariant(active ? null : v)}
                      style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: active ? BLUE : "#CBD5E1", backgroundColor: active ? "#EFF6FF" : "#fff" }}
                    >
                      <Text style={{ fontWeight: "700", color: active ? BLUE : "#334155", fontSize: 13 }}>
                        {v.name} · {formatPrice(v.price, item.type)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}
          {item.type === "trade" && !!item.tradeFor && (
            <Text style={{ marginTop: 4, color: "#64748B" }}>Muốn đổi: <Text style={{ fontWeight: "700", color: "#111827" }}>{item.tradeFor}</Text></Text>
          )}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name="location-outline" size={16} color="#94A3B8" />
              <Text style={{ color: "#64748B", fontSize: 13 }}>
                {item.location?.province || "—"}{item.location?.district ? `, ${item.location.district}` : ""}
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name="eye-outline" size={16} color="#94A3B8" />
              <Text style={{ color: "#64748B", fontSize: 13 }}>{item.views || 0} lượt xem</Text>
            </View>
            <Text style={{ color: "#64748B", fontSize: 13 }}>· {timeAgo(item.createdAt)}</Text>
          </View>
        </View>

        {/* Seller */}
        {item.seller && (
          <View style={{ backgroundColor: "#fff", marginHorizontal: 12, borderRadius: 16, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Image source={{ uri: item.seller.avatar || undefined }} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: "#E2E8F0" }} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={{ fontWeight: "800", fontSize: 15 }}>{item.seller.nickname || item.seller.name}</Text>
                {item.seller.verified && <Ionicons name="checkmark-circle" size={16} color="#2563eb" />}
              </View>
              {item.seller.ratingCount > 0 ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <StarRatingRN value={item.seller.ratingAvg} size={14} />
                  <Text style={{ color: "#64748B", fontSize: 12 }}>
                    {item.seller.ratingAvg?.toFixed(1)} · {item.seller.ratingCount} đánh giá
                  </Text>
                </View>
              ) : (
                <Text style={{ color: "#64748B", fontSize: 12 }}>
                  {item.seller.verified ? "Đã xác minh danh tính" : "Chưa có đánh giá"}
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={() => router.push(`/marketplace?seller=${item.seller._id}` as any)}>
              <Text style={{ color: BLUE, fontWeight: "700" }}>Tin khác</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Owner: boost + offers */}
        {item.isOwner && (
          <View style={{ backgroundColor: "#fff", margin: 12, borderRadius: 16, padding: 16 }}>
            {["available", "reserved"].includes(item.status) && (
              <TouchableOpacity
                onPress={onBoost}
                disabled={boosting}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#f59e0b", borderRadius: 12, paddingVertical: 12, marginBottom: 14 }}
              >
                <Ionicons name="rocket-outline" size={18} color="#fff" />
                <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>
                  {boosting ? "Đang đẩy…" : "Đẩy tin lên đầu (nổi bật 2 ngày)"}
                </Text>
              </TouchableOpacity>
            )}
            <Text style={{ fontWeight: "800", fontSize: 15 }}>🏷️ Đề nghị mua ({item.offerCount || 0})</Text>
            <OffersManager listingId={item._id} />
          </View>
        )}

        {/* Description + specs */}
        <View style={{ backgroundColor: "#fff", margin: 12, borderRadius: 16, padding: 16 }}>
          <Text style={{ fontWeight: "800", fontSize: 15, marginBottom: 8 }}>Mô tả</Text>
          <Text style={{ color: "#374151", lineHeight: 22 }}>
            {item.description || "Người bán chưa thêm mô tả."}
          </Text>
          {specs.length > 0 && (
            <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: "#EEF0F3", paddingTop: 10, gap: 8 }}>
              {specs.map((s) => (
                <View key={s.label} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: "#64748B" }}>{s.label}</Text>
                  <Text style={{ fontWeight: "600" }}>{s.value}</Text>
                </View>
              ))}
            </View>
          )}
          {item.tags?.length > 0 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
              {item.tags.map((t: string) => (
                <View key={t} style={{ borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Text style={{ color: "#64748B", fontSize: 12 }}>#{t}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Đánh giá người bán */}
        {item.seller && (
          <View style={{ backgroundColor: "#fff", margin: 12, borderRadius: 16, padding: 16 }}>
            <Text style={{ fontWeight: "800", fontSize: 16, marginBottom: 10 }}>Đánh giá người bán</Text>
            <SellerReviewsRN sellerId={item.seller._id} listingId={item._id} me={me} />
          </View>
        )}
      </ScrollView>

      {/* Bottom action bar */}
      <View
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          flexDirection: "row",
          gap: 10,
          padding: 12,
          paddingBottom: 26,
          backgroundColor: "#fff",
          borderTopWidth: 1,
          borderTopColor: "#EEF0F3",
        }}
      >
        {item.isOwner ? (
          <>
            <TouchableOpacity
              onPress={() => setStatusOpen(true)}
              style={{ flex: 1, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#F1F5F9", flexDirection: "row", gap: 6 }}
            >
              <Ionicons name="swap-horizontal" size={18} color="#334155" />
              <Text style={{ fontWeight: "700", color: "#334155" }}>{status?.label}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push(`/marketplace/edit/${item._id}` as any)}
              style={{ flex: 1, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: BLUE, flexDirection: "row", gap: 6 }}
            >
              <Ionicons name="create-outline" size={18} color="#fff" />
              <Text style={{ fontWeight: "800", color: "#fff" }}>Sửa tin</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onDelete}
              style={{ width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#FEF2F2" }}
            >
              <Ionicons name="trash-outline" size={20} color="#dc2626" />
            </TouchableOpacity>
          </>
        ) : (
          <>
            {canContact ? (
              <TouchableOpacity
                onPress={() => {
                  const phone = item.contact?.showPhone ? item.contact?.phone : "";
                  if (phone) Linking.openURL(`tel:${phone}`);
                  else if (item.contact?.zalo) Linking.openURL(`https://zalo.me/${item.contact.zalo}`);
                }}
                style={{ width: 52, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#F1F5F9" }}
              >
                <Ionicons name="call-outline" size={20} color="#334155" />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              disabled={!["available", "reserved"].includes(item.status)}
              onPress={() => {
                if (!me) return router.push("/login" as any);
                if (item.hasVariants && !selVariant)
                  return Alert.alert("Chọn phân loại", `Vui lòng chọn ${item.variantLabel || "phân loại"}`);
                if (selVariant?.price)
                  setAmount(String(selVariant.price).replace(/\B(?=(\d{3})+(?!\d))/g, "."));
                setOfferOpen(true);
              }}
              style={{
                flex: 1,
                height: 48,
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: ["available", "reserved"].includes(item.status) ? BLUE : "#CBD5E1",
                flexDirection: "row",
                gap: 8,
              }}
            >
              <Ionicons name="pricetag-outline" size={18} color="#fff" />
              <Text style={{ fontWeight: "800", color: "#fff", fontSize: 15 }}>
                {["available", "reserved"].includes(item.status) ? "Trả giá / Đề nghị" : "Đã kết thúc"}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Offer modal */}
      <Modal visible={offerOpen} transparent animationType="slide" onRequestClose={() => setOfferOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}
        >
          <Pressable style={{ flex: 1 }} onPress={() => setOfferOpen(false)} />
        <View style={{ backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34 }}>
          <Text style={{ fontSize: 18, fontWeight: "900", marginBottom: 6 }}>Gửi đề nghị mua</Text>
          <Text style={{ color: "#64748B", marginBottom: 14 }}>
            {selVariant ? (
              <>Phân loại <Text style={{ fontWeight: "700", color: "#111827" }}>{selVariant.name}</Text> · Giá đăng: <Text style={{ fontWeight: "700", color: "#111827" }}>{formatPrice(selVariant.price, item.type)}</Text></>
            ) : (
              <>Giá đang đăng: <Text style={{ fontWeight: "700", color: "#111827" }}>{priceRangeLabel(item)}</Text></>
            )}
          </Text>
          <TextInput
            value={amount}
            onChangeText={(v) => setAmount(v.replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, "."))}
            keyboardType="number-pad"
            placeholder="Giá bạn đề nghị (₫)"
            placeholderTextColor="#94A3B8"
            style={{ borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 12, padding: 14, fontSize: 16, marginBottom: 12 }}
          />
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Lời nhắn (tuỳ chọn)"
            placeholderTextColor="#94A3B8"
            multiline
            style={{ borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 12, padding: 14, fontSize: 15, minHeight: 70, textAlignVertical: "top", marginBottom: 16 }}
          />
          <TouchableOpacity
            onPress={submitOffer}
            disabled={offering}
            style={{ height: 50, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: BLUE }}
          >
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>{offering ? "Đang gửi…" : "Gửi đề nghị"}</Text>
          </TouchableOpacity>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Status modal */}
      <Modal visible={statusOpen} transparent animationType="slide" onRequestClose={() => setStatusOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }} onPress={() => setStatusOpen(false)} />
        <View style={{ backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34 }}>
          <Text style={{ fontSize: 18, fontWeight: "900", marginBottom: 14 }}>Cập nhật trạng thái</Text>
          {STATUSES.map((s) => (
            <TouchableOpacity
              key={s.key}
              onPress={() => changeStatus(s.key)}
              style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" }}
            >
              <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: s.color }} />
              <Text style={{ fontSize: 16, fontWeight: item.status === s.key ? "800" : "500", color: "#111827" }}>{s.label}</Text>
              {item.status === s.key && <Ionicons name="checkmark" size={18} color={BLUE} style={{ marginLeft: "auto" }} />}
            </TouchableOpacity>
          ))}
        </View>
      </Modal>
    </SafeAreaView>
  );
}
