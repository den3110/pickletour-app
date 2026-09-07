// Tạo cụm sân mới
import React, { useMemo, useState } from "react";
import { View, ScrollView, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { Text } from "@/components/ui/i18nText";
import { Ionicons } from "@expo/vector-icons";
import { Stack, router } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { useCreateVenueMutation } from "@/slices/venueOwnerApiSlice";
import { pal } from "@/utils/courtFormat";

export default function NewVenueScreen() {
  const theme = useTheme();
  const C = useMemo(() => pal(!!theme.dark), [theme.dark]);
  const [create, { isLoading }] = useCreateVenueMutation();
  const [name, setName] = useState("");
  const [province, setProvince] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");

  const submit = async () => {
    if (!name.trim()) return Alert.alert("Thiếu tên", "Nhập tên cụm sân.");
    try {
      const v: any = await create({ name: name.trim(), province: province.trim(), address: address.trim(), phone: phone.trim() }).unwrap();
      Alert.alert("Đã tạo", "Tiếp tục cấu hình sân con, giờ mở cửa và tài khoản nhận tiền.", [
        { text: "Để sau", onPress: () => router.replace("/owner") },
        { text: "Cấu hình ngay", onPress: () => router.replace({ pathname: "/owner/venue/[id]/edit", params: { id: String(v._id) } }) },
      ]);
    } catch (e: any) {
      Alert.alert("Lỗi", e?.data?.message || "Không tạo được cụm sân.");
    }
  };

  const F = (label: string, v: string, set: (t: string) => void, ph: string, kb?: any) => (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: C.sub, fontSize: 13, marginBottom: 6 }}>{label}</Text>
      <TextInput style={[styles.input, { backgroundColor: C.field, color: C.text }]} value={v} onChangeText={set} placeholder={ph} placeholderTextColor={C.sub} keyboardType={kb} />
    </View>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{ title: "Tạo cụm sân" }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={[styles.hint, { backgroundColor: C.accentSoft }]}>
          <Ionicons name="information-circle" size={18} color={C.accent} />
          <Text style={{ color: C.text, flex: 1, fontSize: 13, lineHeight: 19 }}>Tạo nhanh rồi bổ sung sân con, giá, giờ mở cửa và tài khoản nhận tiền ở bước sau.</Text>
        </View>
        {F("Tên cụm sân *", name, setName, "VD: Sân Pickleball ABC")}
        {F("Tỉnh/Thành", province, setProvince, "VD: Hà Nội")}
        {F("Địa chỉ", address, setAddress, "Số nhà, đường, phường…")}
        {F("Số điện thoại", phone, setPhone, "SĐT liên hệ", "phone-pad")}
        <TouchableOpacity style={[styles.btn, { backgroundColor: C.accent, opacity: isLoading ? 0.6 : 1 }]} disabled={isLoading} onPress={submit}>
          <Text style={{ color: C.onAccent, fontWeight: "800" }}>{isLoading ? "Đang tạo…" : "Tạo cụm sân"}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
  hint: { flexDirection: "row", gap: 8, padding: 12, borderRadius: 12, marginBottom: 16 },
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  btn: { paddingVertical: 14, borderRadius: 16, alignItems: "center", marginTop: 6 },
});
