import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Image as ExpoImage } from "expo-image";

import { useCreateTicketMutation } from "@/slices/supportApiSlice";
import { useUploadAvatarMutation } from "@/slices/uploadApiSlice";

type Picked = { uri: string; name?: string; mime?: string; size?: number };

function guessMime(uri: string) {
  const ext = (uri.split(".").pop() || "jpg").toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

export default function SupportNewScreen() {
  const router = useRouter();
  const theme = useTheme();
  const isDark = theme.dark;

  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [images, setImages] = useState<Picked[]>([]);

  const [createTicket, { isLoading: creating }] = useCreateTicketMutation();
  const [uploadFile, { isLoading: uploading }] = useUploadAvatarMutation();

  const colors = useMemo(
    () => ({
      bg: isDark ? "#121212" : "#F5F7FA",
      card: isDark ? "#1E1E1E" : "#FFFFFF",
      text: isDark ? "#FFFFFF" : "#222",
      sub: isDark ? "#A0A0A0" : "#666",
      border: isDark ? "#2A2A2A" : "#E8E8E8",
      primary: "#0a84ff",
      danger: "#ff3b30",
    }),
    [isDark]
  );

  const pickImages = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Thiếu quyền", "Bạn cần cấp quyền thư viện ảnh để đính kèm.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 5,
      quality: 0.85,
    });

    if (result.canceled) return;

    const picked = (result.assets || []).map((a) => ({
      uri: a.uri,
      name: (a as any).fileName,
      mime: (a as any).mimeType,
      size: (a as any).fileSize,
    }));

    setImages((prev) => [...prev, ...picked].slice(0, 5));
  };

  const removeImage = (uri: string) =>
    setImages((prev) => prev.filter((x) => x.uri !== uri));

  const uploadOne = async (img: Picked) => {
    const uri = img.uri;
    const mime = img.mime || guessMime(uri);
    const ext = (uri.split(".").pop() || "jpg").toLowerCase();
    const name = img.name || `support_${Date.now()}.${ext}`;

    const fd = new FormData();
    fd.append("file", {
      uri,
      name,
      type: mime,
    } as any);

    const res = await uploadFile(fd).unwrap();
    return {
      url: res.url,
      mime: res.mime || mime,
      name: res.name || name,
      size: res.size || img.size || 0,
    };
  };

  const handleSubmit = async () => {
    const cleanText = text.trim();
    if (!cleanText && images.length === 0) {
      Alert.alert("Thiếu nội dung", "Bạn nhập tin nhắn hoặc đính kèm ảnh nhé.");
      return;
    }

    try {
      const attachments = [];
      for (const img of images) attachments.push(await uploadOne(img));

      const ticket = await createTicket({
        title: title.trim() || "Hỗ trợ",
        text: cleanText,
        attachments,
      }).unwrap();

      Alert.alert(
        "Đã gửi",
        "Đã tạo yêu cầu hỗ trợ. Bạn có thể xem phản hồi trong hộp thư.",
        [
          {
            text: "OK",
            onPress: () => router.replace(`/support/${ticket._id}`),
          },
        ]
      );
    } catch (e: any) {
      Alert.alert(
        "Lỗi",
        e?.data?.message || e?.error || "Không thể gửi yêu cầu."
      );
    }
  };

  const busy = creating || uploading;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Stack.Screen
        options={{
          title: "Tạo yêu cầu",
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.back()}
              style={{
                paddingHorizontal: 8,
                paddingVertical: 4,
              }}
            >
              <Ionicons name="chevron-back" size={24} />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.label, { color: colors.sub }]}>
            Tiêu đề (tuỳ chọn)
          </Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="VD: Lỗi live / góp ý UI..."
            placeholderTextColor={colors.sub}
            style={[
              styles.input,
              {
                backgroundColor: isDark ? "#2C2C2C" : "#fff",
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
          />

          <Text style={[styles.label, { color: colors.sub, marginTop: 12 }]}>
            Nội dung
          </Text>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Mô tả vấn đề, kèm bước tái hiện nếu có..."
            placeholderTextColor={colors.sub}
            multiline
            textAlignVertical="top"
            style={[
              styles.textArea,
              {
                backgroundColor: isDark ? "#2C2C2C" : "#fff",
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
          />

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 12,
            }}
          >
            <Text style={[styles.label, { color: colors.sub }]}>
              Ảnh đính kèm
            </Text>
            <TouchableOpacity
              onPress={pickImages}
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <Ionicons name="image-outline" size={18} color={colors.primary} />
              <Text style={{ color: colors.primary, fontWeight: "800" }}>
                Chọn ảnh
              </Text>
            </TouchableOpacity>
          </View>

          {images.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10, paddingTop: 10 }}
            >
              {images.map((img) => (
                <View key={img.uri} style={{ position: "relative" }}>
                  <ExpoImage
                    source={{ uri: img.uri }}
                    style={styles.thumb}
                    contentFit="cover"
                  />
                  <TouchableOpacity
                    onPress={() => removeImage(img.uri)}
                    style={styles.thumbRemove}
                  >
                    <Ionicons name="close" size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          ) : (
            <Text style={{ color: colors.sub, marginTop: 8 }}>
              Chưa có ảnh.
            </Text>
          )}

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={busy}
            style={[
              styles.submit,
              { backgroundColor: colors.primary, opacity: busy ? 0.7 : 1 },
            ]}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: "#fff", fontWeight: "900" }}>Gửi</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 14, borderWidth: 1 },
  label: { fontSize: 13, fontWeight: "700" },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 15,
    marginTop: 8,
  },
  textArea: {
    minHeight: 140,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingTop: 12,
    fontSize: 15,
    marginTop: 8,
  },
  submit: {
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
  },
  thumb: { width: 88, height: 88, borderRadius: 14 },
  thumbRemove: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
  },
});
