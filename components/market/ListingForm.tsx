// components/market/ListingForm.tsx — form đăng / sửa tin Chợ (mobile)
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Switch,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { CATEGORIES, CONDITIONS, TYPES } from "@/constants/market";
import {
  useMarketCanPostQuery,
  useGetMarketListingQuery,
  useUploadMarketMediaMutation,
  useCreateMarketListingMutation,
  useUpdateMarketListingMutation,
} from "@/slices/marketApiSlice";

const BLUE = "#0d6efd";

const Label = ({ children }: { children: React.ReactNode }) => (
  <Text style={{ fontWeight: "700", marginBottom: 6, marginTop: 14, color: "#111827" }}>{children}</Text>
);
const inputStyle = {
  borderWidth: 1,
  borderColor: "#E2E8F0",
  borderRadius: 12,
  paddingHorizontal: 14,
  paddingVertical: 12,
  fontSize: 15,
  color: "#111827",
  backgroundColor: "#fff",
} as const;

const Chips = ({ options, value, onPick }: any) => (
  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
    {options.map((o: any) => {
      const active = value === o.key;
      return (
        <TouchableOpacity
          key={o.key}
          onPress={() => onPick(o.key)}
          style={{
            paddingHorizontal: 14,
            paddingVertical: 9,
            borderRadius: 999,
            backgroundColor: active ? BLUE : "#F1F5F9",
          }}
        >
          <Text style={{ fontWeight: "700", color: active ? "#fff" : "#334155" }}>
            {o.emoji ? `${o.emoji} ` : ""}{o.label}
          </Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

export default function ListingForm({ existingId }: { existingId?: string }) {
  const isEdit = !!existingId;
  const { data: canPost, isLoading: canPostLoading } = useMarketCanPostQuery(undefined, { skip: isEdit });
  const { data: existing } = useGetMarketListingQuery(existingId, { skip: !isEdit });
  const [uploadMedia, { isLoading: uploading }] = useUploadMarketMediaMutation();
  const [createListing, { isLoading: creating }] = useCreateMarketListingMutation();
  const [updateListing, { isLoading: updating }] = useUpdateMarketListingMutation();

  const [images, setImages] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("shoes");
  const [condition, setCondition] = useState("good");
  const [type, setType] = useState("sell");
  const [price, setPrice] = useState("");
  const [negotiable, setNegotiable] = useState(true);
  const [tradeFor, setTradeFor] = useState("");
  const [brand, setBrand] = useState("");
  const [size, setSize] = useState("");
  const [color, setColor] = useState("");
  const [province, setProvince] = useState("");
  const [district, setDistrict] = useState("");
  const [phone, setPhone] = useState("");
  const [zalo, setZalo] = useState("");
  const [showPhone, setShowPhone] = useState(false);
  const [hasVariants, setHasVariants] = useState(false);
  const [variantLabel, setVariantLabel] = useState("Phân loại");
  const [variants, setVariants] = useState<{ name: string; price: string; images?: any[] }[]>([]);

  useEffect(() => {
    if (isEdit && existing) {
      setHasVariants(!!existing.hasVariants);
      setVariantLabel(existing.variantLabel || "Phân loại");
      setVariants(
        (existing.variants || []).map((v: any) => ({
          name: v.name || "",
          price: v.price ? String(v.price).replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "",
          images: v.images || [],
        }))
      );
      setImages(existing.images || []);
      setTitle(existing.title || "");
      setDescription(existing.description || "");
      setCategory(existing.category || "other");
      setCondition(existing.condition || "good");
      setType(existing.type || "sell");
      setPrice(existing.price ? String(existing.price).replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "");
      setNegotiable(existing.negotiable ?? true);
      setTradeFor(existing.tradeFor || "");
      setBrand(existing.brand || "");
      setSize(existing.size || "");
      setColor(existing.color || "");
      setProvince(existing.location?.province || "");
      setDistrict(existing.location?.district || "");
      setPhone(existing.contact?.phone || "");
      setZalo(existing.contact?.zalo || "");
      setShowPhone(existing.contact?.showPhone || false);
    }
  }, [isEdit, existing]);

  const pickImages = async () => {
    if (images.length >= 12) return Alert.alert("Tối đa 12 ảnh");
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert("Cần quyền", "Vui lòng cấp quyền truy cập thư viện ảnh");
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 12 - images.length,
      quality: 0.6,
    });
    if (res.canceled || !res.assets?.length) return;
    const fd = new FormData();
    for (const a of res.assets) {
      // Convert mọi ảnh (kể cả HEIC của iPhone) sang JPEG ngay trên máy —
      // iOS decode HEIC natively → server + web luôn hiển thị được.
      let uri = a.uri;
      try {
        const m = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width: 1600 } }],
          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
        );
        uri = m.uri;
      } catch {}
      const base = (uri.split("/").pop() || "photo").replace(/\.\w+$/, "");
      fd.append("files", { uri, name: `${base}.jpg`, type: "image/jpeg" } as any);
    }
    try {
      const r: any = await uploadMedia(fd).unwrap();
      setImages((prev) => [...prev, ...(r.images || [])].slice(0, 12));
    } catch (e: any) {
      Alert.alert("Lỗi", e?.data?.message || "Tải ảnh thất bại");
    }
  };

  const pickVariantImages = async (vi: number) => {
    const cur = variants[vi]?.images || [];
    if (cur.length >= 8) return Alert.alert("Tối đa 8 ảnh/loại");
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert("Cần quyền", "Vui lòng cấp quyền truy cập thư viện ảnh");
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 8 - cur.length,
      quality: 0.6,
    });
    if (res.canceled || !res.assets?.length) return;
    const fd = new FormData();
    for (const a of res.assets) {
      let uri = a.uri;
      try {
        const m = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1600 } }], { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG });
        uri = m.uri;
      } catch {}
      const base = (uri.split("/").pop() || "photo").replace(/\.\w+$/, "");
      fd.append("files", { uri, name: `${base}.jpg`, type: "image/jpeg" } as any);
    }
    try {
      const r: any = await uploadMedia(fd).unwrap();
      setVariants((arr) =>
        arr.map((x, idx) =>
          idx === vi ? { ...x, images: [...((x as any).images || []), ...(r.images || [])].slice(0, 8) } : x
        )
      );
    } catch (e: any) {
      Alert.alert("Lỗi", e?.data?.message || "Tải ảnh thất bại");
    }
  };

  const submit = async () => {
    if (!title.trim()) return Alert.alert("Thiếu thông tin", "Vui lòng nhập tiêu đề");
    if (!images.length) return Alert.alert("Thiếu ảnh", "Vui lòng thêm ít nhất 1 ảnh");
    const useVar = type === "sell" && hasVariants;
    const cleanVariants = variants
      .filter((v) => v.name.trim())
      .map((v) => ({ name: v.name.trim(), price: Number(String(v.price).replace(/\D/g, "")) || 0, images: (v as any).images || [] }));
    if (useVar && !cleanVariants.length) {
      return Alert.alert("Thiếu phân loại", "Vui lòng thêm ít nhất 1 phân loại");
    }
    const payload: any = {
      title,
      description,
      category,
      condition,
      type,
      price: Number(String(price).replace(/\D/g, "")) || 0,
      negotiable,
      tradeFor,
      brand,
      size,
      color,
      images,
      location: { province, district },
      contact: { phone, zalo, showPhone },
      hasVariants: useVar,
      variantLabel,
      variants: useVar ? cleanVariants : [],
    };
    try {
      if (isEdit) {
        await updateListing({ id: existingId, ...payload }).unwrap();
        Alert.alert("Thành công", "Đã cập nhật tin");
        router.replace(`/marketplace/${existingId}` as any);
      } else {
        const created: any = await createListing(payload).unwrap();
        Alert.alert("Thành công", "Đăng tin thành công!");
        router.replace(`/marketplace/${created._id}` as any);
      }
    } catch (e: any) {
      Alert.alert("Lỗi", e?.data?.message || "Có lỗi xảy ra");
    }
  };

  const busy = creating || updating || uploading;

  if (!isEdit && canPostLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
        <ActivityIndicator style={{ marginTop: 60 }} color={BLUE} />
      </SafeAreaView>
    );
  }

  if (!isEdit && canPost && !canPost.canPost) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }} edges={["top"]}>
        <View style={{ flexDirection: "row", alignItems: "center", padding: 12 }}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="chevron-back" size={26} color="#111827" />
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 30 }}>
          <Ionicons name="shield-checkmark-outline" size={64} color="#F59E0B" />
          <Text style={{ fontSize: 20, fontWeight: "800", marginTop: 12, textAlign: "center" }}>
            Cần xác minh danh tính
          </Text>
          <Text style={{ color: "#64748B", marginTop: 8, textAlign: "center", lineHeight: 22 }}>
            {canPost.reason || "Bạn cần xác minh CCCD/KYC trước khi đăng tin mua bán để đảm bảo an toàn giao dịch."}
          </Text>
          <TouchableOpacity
            onPress={() => router.push("/more/profile" as any)}
            style={{ marginTop: 24, backgroundColor: BLUE, paddingHorizontal: 28, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>Xác minh ngay</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#EEF0F3" }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color="#111827" />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "900", marginLeft: 4 }}>{isEdit ? "Sửa tin" : "Đăng tin mới"}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {/* Ảnh */}
        <Label>Ảnh sản phẩm * ({images.length}/12)</Label>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {images.map((im, i) => (
            <View key={i} style={{ width: 92, height: 92 }}>
              <Image source={{ uri: im.url || im }} style={{ width: "100%", height: "100%", borderRadius: 10 }} />
              <TouchableOpacity
                onPress={() => setImages(images.filter((_, idx) => idx !== i))}
                style={{ position: "absolute", top: -6, right: -6, backgroundColor: "#dc2626", width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" }}
              >
                <Ionicons name="close" size={14} color="#fff" />
              </TouchableOpacity>
              {i === 0 && (
                <View style={{ position: "absolute", bottom: 4, left: 4, backgroundColor: "rgba(0,0,0,0.65)", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                  <Text style={{ color: "#fff", fontSize: 9, fontWeight: "700" }}>Bìa</Text>
                </View>
              )}
            </View>
          ))}
          {images.length < 12 && (
            <TouchableOpacity
              onPress={pickImages}
              style={{ width: 92, height: 92, borderWidth: 2, borderColor: "#CBD5E1", borderStyle: "dashed", borderRadius: 10, alignItems: "center", justifyContent: "center" }}
            >
              {uploading ? <ActivityIndicator color={BLUE} /> : <Ionicons name="camera-outline" size={26} color="#94A3B8" />}
            </TouchableOpacity>
          )}
        </View>

        <Label>Hình thức</Label>
        <Chips options={TYPES} value={type} onPick={setType} />

        <Label>Tiêu đề *</Label>
        <TextInput value={title} onChangeText={setTitle} placeholder="VD: Giày Nike Vapor Pro size 42, mới 95%" placeholderTextColor="#94A3B8" maxLength={140} style={inputStyle} />

        <Label>Danh mục</Label>
        <Chips options={CATEGORIES} value={category} onPick={setCategory} />

        <Label>Tình trạng</Label>
        <Chips options={CONDITIONS} value={condition} onPick={setCondition} />

        {/* Phân loại hàng */}
        {type === "sell" && (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 16 }}>
              <Text style={{ fontWeight: "700", color: "#111827" }}>Nhiều phân loại (size/màu — mỗi loại 1 giá)</Text>
              <Switch value={hasVariants} onValueChange={setHasVariants} />
            </View>
            {hasVariants && (
              <View style={{ marginTop: 10, padding: 12, borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 12 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", marginBottom: 6, color: "#475569" }}>Tên nhóm phân loại</Text>
                <TextInput
                  value={variantLabel}
                  onChangeText={setVariantLabel}
                  placeholder="VD: Size, Màu sắc"
                  placeholderTextColor="#94A3B8"
                  style={{ ...inputStyle, marginBottom: 10 }}
                />
                {variants.map((v, i) => (
                  <View key={i} style={{ marginBottom: 10, padding: 8, borderRadius: 10, backgroundColor: "#F8FAFC" }}>
                    <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                      <TextInput
                        value={v.name}
                        onChangeText={(t) => setVariants((arr) => arr.map((x, idx) => (idx === i ? { ...x, name: t } : x)))}
                        placeholder="Tên loại (40, Đen-M)"
                        placeholderTextColor="#94A3B8"
                        style={{ ...inputStyle, flex: 1 }}
                      />
                      <TextInput
                        value={v.price}
                        onChangeText={(t) => setVariants((arr) => arr.map((x, idx) => (idx === i ? { ...x, price: t.replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".") } : x)))}
                        keyboardType="number-pad"
                        placeholder="Giá"
                        placeholderTextColor="#94A3B8"
                        style={{ ...inputStyle, width: 100 }}
                      />
                      <TouchableOpacity onPress={() => setVariants((arr) => arr.filter((_, idx) => idx !== i))} hitSlop={6}>
                        <Ionicons name="close-circle" size={24} color="#dc2626" />
                      </TouchableOpacity>
                    </View>
                    {/* Ảnh của phân loại */}
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                      {((v as any).images || []).map((im: any, ii: number) => (
                        <View key={ii} style={{ width: 48, height: 48 }}>
                          <Image source={{ uri: im.url || im }} style={{ width: "100%", height: "100%", borderRadius: 8 }} />
                          <TouchableOpacity
                            onPress={() => setVariants((arr) => arr.map((x, idx) => (idx === i ? { ...x, images: ((x as any).images || []).filter((_: any, k: number) => k !== ii) } : x)))}
                            style={{ position: "absolute", top: -6, right: -6, backgroundColor: "#dc2626", width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" }}
                          >
                            <Ionicons name="close" size={12} color="#fff" />
                          </TouchableOpacity>
                        </View>
                      ))}
                      {(((v as any).images || []).length < 8) && (
                        <TouchableOpacity onPress={() => pickVariantImages(i)} style={{ width: 48, height: 48, borderWidth: 1, borderColor: "#CBD5E1", borderStyle: "dashed", borderRadius: 8, alignItems: "center", justifyContent: "center" }}>
                          <Ionicons name="camera-outline" size={18} color="#94A3B8" />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))}
                <TouchableOpacity onPress={() => setVariants((arr) => [...arr, { name: "", price: "", images: [] }])} style={{ paddingVertical: 8 }}>
                  <Text style={{ color: "#0d6efd", fontWeight: "700" }}>+ Thêm phân loại</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {type !== "giveaway" && !(type === "sell" && hasVariants) && (
          <>
            <Label>{type === "trade" ? "Giá tham khảo (₫)" : "Giá bán (₫)"}</Label>
            <TextInput
              value={price}
              onChangeText={(v) => setPrice(v.replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, "."))}
              keyboardType="number-pad"
              placeholder="0 = thương lượng"
              placeholderTextColor="#94A3B8"
              style={inputStyle}
            />
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
              <Text style={{ color: "#334155" }}>Có thể thương lượng</Text>
              <Switch value={negotiable} onValueChange={setNegotiable} />
            </View>
          </>
        )}

        {type === "trade" && (
          <>
            <Label>Muốn đổi lấy gì?</Label>
            <TextInput value={tradeFor} onChangeText={setTradeFor} placeholder="VD: Vợt Joola Perseus, hoặc bù tiền" placeholderTextColor="#94A3B8" style={inputStyle} />
          </>
        )}

        <Label>Thương hiệu</Label>
        <TextInput value={brand} onChangeText={setBrand} placeholder="Nike, Joola…" placeholderTextColor="#94A3B8" style={inputStyle} />

        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Label>Size / Thông số</Label>
            <TextInput value={size} onChangeText={setSize} placeholder="42, L, 8.0oz…" placeholderTextColor="#94A3B8" style={inputStyle} />
          </View>
          <View style={{ flex: 1 }}>
            <Label>Màu sắc</Label>
            <TextInput value={color} onChangeText={setColor} placeholder="Đen…" placeholderTextColor="#94A3B8" style={inputStyle} />
          </View>
        </View>

        <Label>Mô tả chi tiết</Label>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Tình trạng, lý do bán, thời gian sử dụng, bảo hành…"
          placeholderTextColor="#94A3B8"
          multiline
          style={{ ...inputStyle, minHeight: 100, textAlignVertical: "top" }}
        />

        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Label>Tỉnh/Thành</Label>
            <TextInput value={province} onChangeText={setProvince} placeholder="Hà Nội" placeholderTextColor="#94A3B8" style={inputStyle} />
          </View>
          <View style={{ flex: 1 }}>
            <Label>Quận/Huyện</Label>
            <TextInput value={district} onChangeText={setDistrict} placeholder="Cầu Giấy" placeholderTextColor="#94A3B8" style={inputStyle} />
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Label>Số điện thoại</Label>
            <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="09xx" placeholderTextColor="#94A3B8" style={inputStyle} />
          </View>
          <View style={{ flex: 1 }}>
            <Label>Zalo</Label>
            <TextInput value={zalo} onChangeText={setZalo} placeholder="SĐT/link Zalo" placeholderTextColor="#94A3B8" style={inputStyle} />
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
          <Text style={{ color: "#334155" }}>Hiển thị SĐT công khai</Text>
          <Switch value={showPhone} onValueChange={setShowPhone} />
        </View>

        <TouchableOpacity
          onPress={submit}
          disabled={busy}
          style={{ marginTop: 24, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: busy ? "#93C5FD" : BLUE }}
        >
          <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>
            {busy ? "Đang lưu…" : isEdit ? "Lưu thay đổi" : "Đăng tin"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
