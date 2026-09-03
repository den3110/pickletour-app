import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { TextInput } from "@/components/ui/i18nTextInput";
import { Text } from "@/components/ui/i18nText";
import { Stack, useRouter } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Image as ExpoImage } from "expo-image";
import { useCreateTicketMutation } from "@/slices/supportApiSlice";
import { useUploadImageToFolderMutation } from "@/slices/uploadApiSlice";
import { prepareSupportImageForUpload } from "@/utils/supportImageUpload";

type Picked = { uri: string; name?: string; mime?: string; size?: number };

const CATEGORY_OPTIONS = [
  { value: "account", label: "Tài khoản" },
  { value: "tournament", label: "Giải đấu" },
  { value: "payment", label: "Thanh toán" },
  { value: "technical", label: "Kỹ thuật" },
  { value: "report", label: "Báo lỗi" },
  { value: "other", label: "Khác" },
];

const PRIORITY_OPTIONS = [
  { value: "low", label: "Thấp" },
  { value: "normal", label: "Bình thường" },
  { value: "high", label: "Cao" },
  { value: "urgent", label: "Khẩn cấp" },
];

function uploadedImagePayload(res: any, file: any, img: Picked) {
  const body = typeof res === "string" ? { url: res } : res || {};
  const url = body.url || body?.data?.url;
  if (!url) throw new Error("Upload failed");

  return {
    url,
    mime: body.mime || "image/webp",
    name: body.filename || body.name || file.name,
    size: body.size || file.size || img.size || 0,
  };
}

function OptionChips({
  label,
  options,
  value,
  onChange,
  colors,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  colors: any;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={[styles.label, { color: colors.sub }]}>{label}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {options.map((item) => {
          const active = value === item.value;
          return (
            <TouchableOpacity
              key={item.value}
              onPress={() => onChange(item.value)}
              style={[
                styles.optionChip,
                {
                  borderColor: active ? colors.primary : colors.border,
                  backgroundColor: active ? colors.primary : colors.input,
                },
              ]}
            >
              <Text
                style={{
                  color: active ? "#FFFFFF" : colors.text,
                  fontWeight: "800",
                }}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

export default function SupportNewScreen() {
  const router = useRouter();
  const theme = useTheme();
  const isDark = theme.dark;

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("other");
  const [priority, setPriority] = useState("normal");
  const [text, setText] = useState("");
  const [images, setImages] = useState<Picked[]>([]);

  const [createTicket, { isLoading: creating }] = useCreateTicketMutation();
  const [uploadFile, { isLoading: uploading }] =
    useUploadImageToFolderMutation();

  const colors = useMemo(
    () => ({
      bg: isDark ? "#121212" : "#F5F7FA",
      card: isDark ? "#1E1E1E" : "#FFFFFF",
      text: isDark ? "#FFFFFF" : "#222222",
      sub: isDark ? "#A0A0A0" : "#666666",
      border: isDark ? "#2A2A2A" : "#E8E8E8",
      input: isDark ? "#2C2C2C" : "#FFFFFF",
      primary: "#0A84FF",
    }),
    [isDark],
  );

  const pickImages = async () => {
    if (Platform.OS !== "android") {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Thiếu quyền",
          "Bạn cần cấp quyền thư viện ảnh để đính kèm hình ảnh.",
        );
        return;
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 5,
      quality: 0.85,
    });

    if (result.canceled) return;

    const picked = (result.assets || []).map((asset) => ({
      uri: asset.uri,
      name: (asset as any).fileName,
      mime: (asset as any).mimeType,
      size: (asset as any).fileSize,
    }));

    setImages((current) => [...current, ...picked].slice(0, 5));
  };

  const removeImage = (uri: string) => {
    setImages((current) => current.filter((item) => item.uri !== uri));
  };

  const uploadOne = async (img: Picked) => {
    const file = await prepareSupportImageForUpload(img, "support");
    const res = await uploadFile({
      folder: "support",
      file,
      options: {
        format: "webp",
        width: 1280,
        height: 1280,
        quality: 82,
      },
    }).unwrap();

    return uploadedImagePayload(res, file, img);
  };

  const handleSubmit = async () => {
    const cleanText = text.trim();
    if (!cleanText && images.length === 0) {
      Alert.alert(
        "Thiếu nội dung",
        "Bạn hãy nhập nội dung hoặc đính kèm ảnh trước khi gửi.",
      );
      return;
    }

    try {
      const attachments = [];
      for (const img of images) {
        attachments.push(await uploadOne(img));
      }

      const ticket = await createTicket({
        title: title.trim() || "Hỗ trợ",
        category,
        priority,
        text: cleanText,
        attachments,
        source: "app",
      }).unwrap();

      Alert.alert(
        "Đã gửi",
        "Case hỗ trợ đã được tạo. Bạn sẽ nhận thông báo khi support phản hồi.",
        [
          {
            text: "OK",
            onPress: () =>
              router.replace({
                pathname: "/support/[ticketId]",
                params: { ticketId: ticket._id },
              }),
          },
        ],
      );
    } catch (error: any) {
      Alert.alert(
        "Lỗi",
        error?.data?.message || error?.error || "Không thể gửi case hỗ trợ.",
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
          title: "Tạo case hỗ trợ",
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.text,
          headerShadowVisible: false,
        }}
      />

      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.label, { color: colors.sub }]}>Tiêu đề</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Ví dụ: Cần hỗ trợ đăng ký giải"
            placeholderTextColor={colors.sub}
            style={[
              styles.input,
              {
                backgroundColor: colors.input,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
          />

          <View style={{ marginTop: 12 }}>
            <OptionChips
              label="Loại vấn đề"
              options={CATEGORY_OPTIONS}
              value={category}
              onChange={setCategory}
              colors={colors}
            />
          </View>

          <View style={{ marginTop: 12 }}>
            <OptionChips
              label="Mức ưu tiên"
              options={PRIORITY_OPTIONS}
              value={priority}
              onChange={setPriority}
              colors={colors}
            />
          </View>

          <Text style={[styles.label, { color: colors.sub, marginTop: 12 }]}>
            Nội dung
          </Text>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Mô tả vấn đề, bước tái hiện hoặc nội dung bạn cần support..."
            placeholderTextColor={colors.sub}
            multiline
            textAlignVertical="top"
            style={[
              styles.textArea,
              {
                backgroundColor: colors.input,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
          />

          <View style={styles.attachmentHeader}>
            <Text style={[styles.label, { color: colors.sub }]}>
              Ảnh đính kèm
            </Text>
            <TouchableOpacity
              onPress={pickImages}
              style={styles.attachAction}
              disabled={busy}
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
                    <Ionicons name="close" size={16} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          ) : (
            <Text style={{ color: colors.sub, marginTop: 8 }}>
              Bạn có thể đính kèm tối đa 5 ảnh.
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
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>
                Gửi case
              </Text>
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
  optionChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 15,
    marginTop: 8,
  },
  textArea: {
    minHeight: 150,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingTop: 12,
    fontSize: 15,
    marginTop: 8,
  },
  attachmentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
  attachAction: { flexDirection: "row", alignItems: "center", gap: 6 },
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
