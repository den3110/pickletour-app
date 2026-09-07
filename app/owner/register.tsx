// app/owner/register.tsx — Đăng ký làm chủ sân
import React, { useMemo, useState } from "react";
import { View, ScrollView, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { Text } from "@/components/ui/i18nText";
import { Ionicons } from "@expo/vector-icons";
import { Stack, router } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { useSelector } from "react-redux";
import { useSubmitOwnerRequestMutation } from "@/slices/courtOwnerApiSlice";
import { pal } from "@/utils/courtFormat";

export default function OwnerRegisterScreen() {
  const theme = useTheme();
  const C = useMemo(() => pal(!!theme.dark), [theme.dark]);
  const me = useSelector((s: any) => s.auth?.userInfo);
  const [submit, { isLoading }] = useSubmitOwnerRequestMutation();

  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState(me?.phone || "");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");

  const send = async () => {
    if (!businessName.trim()) return Alert.alert("Thiếu thông tin", "Nhập tên sân/khu sân của bạn.");
    if (!phone.trim()) return Alert.alert("Thiếu thông tin", "Nhập số điện thoại liên hệ.");
    try {
      await submit({ businessName: businessName.trim(), phone: phone.trim(), address: address.trim(), note: note.trim() }).unwrap();
      Alert.alert("Đã gửi yêu cầu", "Admin sẽ duyệt trong thời gian sớm nhất. Bạn sẽ nhận thông báo khi được duyệt.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert("Lỗi", e?.data?.message || "Không gửi được yêu cầu.");
    }
  };

  const field = (label: string, value: string, set: (v: string) => void, opts: any = {}) => (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: C.sub, fontSize: 13, marginBottom: 6 }}>{label}</Text>
      <TextInput
        style={[styles.input, { backgroundColor: C.field, color: C.text }, opts.multiline && { height: 90, textAlignVertical: "top" }]}
        placeholderTextColor={C.sub}
        value={value}
        onChangeText={set}
        {...opts}
      />
    </View>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{ title: "Đăng ký làm chủ sân" }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={[styles.hint, { backgroundColor: C.accentSoft }]}>
          <Ionicons name="information-circle" size={18} color={C.accent} />
          <Text style={{ color: C.text, flex: 1, fontSize: 13, lineHeight: 19 }}>
            Điền thông tin sân của bạn. Sau khi admin duyệt, bạn có thể tạo cụm sân và nhận đặt sân ngay.
          </Text>
        </View>
        {field("Tên sân / khu sân *", businessName, setBusinessName, { placeholder: "VD: Sân Pickleball ABC" })}
        {field("Số điện thoại *", phone, setPhone, { placeholder: "SĐT liên hệ", keyboardType: "phone-pad" })}
        {field("Địa chỉ", address, setAddress, { placeholder: "Địa chỉ sân" })}
        {field("Ghi chú thêm", note, setNote, { placeholder: "Số sân, mô tả ngắn…", multiline: true })}
        <TouchableOpacity style={[styles.btn, { backgroundColor: C.accent, opacity: isLoading ? 0.6 : 1 }]} disabled={isLoading} onPress={send}>
          <Text style={{ color: C.onAccent, fontWeight: "800" }}>{isLoading ? "Đang gửi…" : "Gửi yêu cầu"}</Text>
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
