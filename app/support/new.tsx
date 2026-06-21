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
import SupportGlassSurface from "@/components/support/SupportGlassSurface";

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
    if (Platform.OS !== "android") {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Thiếu quyền", "Bạn cần cấp quyền thư viện ảnh để đính kèm.");
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
              activeOpacity={0.82}
              style={{ paddingHorizontal: 8 }}
            >
              <SupportGlassSurface
                active
                effect="clear"
                isDark={isDark}
                style={[
                  styles.headerIcon,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Ionicons name="chevron-back" size={24} color={colors.text} />
              </SupportGlassSurface>
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <SupportGlassSurface
          isDark={isDark}
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.label, { color: colors.sub }]}>
            Tiêu đề (tuỳ chọn)
          </Text>
          <SupportGlassSurface
            effect="regular"
            isDark={isDark}
            tintAlpha={0.78}
            tone="field"
            style={[
              styles.inputShell,
              {
                backgroundColor: isDark ? "#2C2C2C" : "#fff",
                borderColor: colors.border,
              },
            ]}
          >
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="VD: Lỗi live / góp ý UI..."
              placeholderTextColor={colors.sub}
              style={[styles.input, { color: colors.text }]}
            />
          </SupportGlassSurface>

          <Text style={[styles.label, { color: colors.sub, marginTop: 12 }]}>
            Nội dung
          </Text>
          <SupportGlassSurface
            effect="regular"
            isDark={isDark}
            tintAlpha={0.78}
            tone="field"
            style={[
              styles.textAreaShell,
              {
                backgroundColor: isDark ? "#2C2C2C" : "#fff",
                borderColor: colors.border,
              },
            ]}
          >
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Mô tả vấn đề, kèm bước tái hiện nếu có..."
              placeholderTextColor={colors.sub}
              multiline
              textAlignVertical="top"
              style={[styles.textArea, { color: colors.text }]}
            />
          </SupportGlassSurface>

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
              activeOpacity={0.82}
            >
              <SupportGlassSurface
                active
                effect="clear"
                isDark={isDark}
                style={[
                  styles.attachBtn,
                  {
                    backgroundColor: isDark
                      ? "rgba(10,132,255,0.18)"
                      : "rgba(10,132,255,0.10)",
                    borderColor: colors.border,
                  },
                ]}
              >
                <Ionicons
                  name="image-outline"
                  size={18}
                  color={colors.primary}
                />
                <Text style={{ color: colors.primary, fontWeight: "800" }}>
                  Chọn ảnh
                </Text>
              </SupportGlassSurface>
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
                  <SupportGlassSurface
                    effect="clear"
                    isDark={isDark}
                    style={[
                      styles.thumbFrame,
                      { backgroundColor: colors.card, borderColor: colors.border },
                    ]}
                  >
                    <ExpoImage
                      source={{ uri: img.uri }}
                      style={styles.thumb}
                      contentFit="cover"
                    />
                  </SupportGlassSurface>
                  <TouchableOpacity
                    onPress={() => removeImage(img.uri)}
                    activeOpacity={0.82}
                    style={styles.thumbRemoveWrap}
                  >
                    <SupportGlassSurface
                      active
                      effect="clear"
                      isDark={isDark}
                      style={[
                        styles.thumbRemove,
                        { backgroundColor: "rgba(0,0,0,0.7)" },
                      ]}
                    >
                      <Ionicons name="close" size={16} color="#fff" />
                    </SupportGlassSurface>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          ) : (
            <SupportGlassSurface
              effect="clear"
              isDark={isDark}
              style={[
                styles.emptyAttach,
                {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.05)"
                    : "rgba(0,0,0,0.035)",
                  borderColor: colors.border,
                },
              ]}
            >
              <Ionicons name="image-outline" size={17} color={colors.sub} />
              <Text style={{ color: colors.sub }}>Chưa có ảnh.</Text>
            </SupportGlassSurface>
          )}

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={busy}
            activeOpacity={0.86}
          >
            <SupportGlassSurface
              active
              isDark={isDark}
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
            </SupportGlassSurface>
          </TouchableOpacity>
        </SupportGlassSurface>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 14, borderWidth: 1 },
  label: { fontSize: 13, fontWeight: "700" },
  inputShell: {
    height: 48,
    borderWidth: 1,
    borderRadius: 12,
    marginTop: 8,
    overflow: "hidden",
  },
  input: {
    flex: 1,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  textAreaShell: {
    minHeight: 140,
    borderWidth: 1,
    borderRadius: 12,
    marginTop: 8,
    overflow: "hidden",
  },
  textArea: {
    flex: 1,
    minHeight: 140,
    paddingHorizontal: 12,
    paddingTop: 12,
    fontSize: 15,
  },
  submit: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  attachBtn: {
    minHeight: 36,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  emptyAttach: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  thumbFrame: {
    width: 88,
    height: 88,
    borderRadius: 14,
    borderWidth: 1,
  },
  thumb: { width: "100%", height: "100%", borderRadius: 14 },
  thumbRemoveWrap: {
    position: "absolute",
    top: -6,
    right: -6,
  },
  thumbRemove: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
