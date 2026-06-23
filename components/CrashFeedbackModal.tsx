import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import React from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  buildCrashFeedbackDetails,
  clearPendingCrashFeedback,
  getPendingCrashFeedback,
  type PendingCrashFeedback,
} from "@/services/crashFeedbackService";
import { useCreateTicketMutation } from "@/slices/supportApiSlice";
import { useUploadImageToFolderMutation } from "@/slices/uploadApiSlice";
import { prepareSupportImageForUpload } from "@/utils/supportImageUpload";

type PickedImage = {
  uri: string;
  name?: string;
  mime?: string;
  size?: number;
};

const MAX_IMAGES = 5;
const CRASH_UPLOAD_FOLDER = "support-crash";

export default function CrashFeedbackModal() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = React.useMemo(
    () => ({
      backdrop: "rgba(15, 23, 42, 0.54)",
      card: isDark ? "#111827" : "#ffffff",
      input: isDark ? "#1f2937" : "#f8fafc",
      text: isDark ? "#f8fafc" : "#0f172a",
      sub: isDark ? "#cbd5e1" : "#64748b",
      border: isDark ? "#334155" : "#e2e8f0",
      primary: "#2563eb",
      primarySoft: isDark ? "rgba(37,99,235,0.18)" : "#eff6ff",
      danger: "#ef4444",
    }),
    [isDark],
  );

  const [visible, setVisible] = React.useState(false);
  const [report, setReport] = React.useState<PendingCrashFeedback | null>(null);
  const [description, setDescription] = React.useState("");
  const [images, setImages] = React.useState<PickedImage[]>([]);

  const [createTicket, { isLoading: creating }] = useCreateTicketMutation();
  const [uploadImage, { isLoading: uploading }] =
    useUploadImageToFolderMutation();

  React.useEffect(() => {
    let mounted = true;

    const openPendingFeedback = () => {
      getPendingCrashFeedback().then((pending) => {
        if (!mounted || !pending) return;
        setReport(pending);
        setVisible(true);
      });
    };

    const timer = setTimeout(openPendingFeedback, 900);

    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, []);

  const busy = creating || uploading;

  const closeAndClear = React.useCallback(async () => {
    setVisible(false);
    const reportId = report?.source === "js" ? report.id : undefined;
    await clearPendingCrashFeedback(reportId);
    setReport(null);
    setDescription("");
    setImages([]);
  }, [report]);

  const pickImages = React.useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Thiếu quyền",
        "Bạn cần cấp quyền thư viện ảnh để đính kèm ảnh chụp màn hình.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: MAX_IMAGES,
      quality: 0.85,
    });

    if (result.canceled) return;

    const picked = (result.assets || []).map((asset) => ({
      uri: asset.uri,
      name: (asset as any).fileName,
      mime: (asset as any).mimeType,
      size: (asset as any).fileSize,
    }));

    setImages((prev) => [...prev, ...picked].slice(0, MAX_IMAGES));
  }, []);

  const removeImage = React.useCallback((uri: string) => {
    setImages((prev) => prev.filter((img) => img.uri !== uri));
  }, []);

  const uploadOne = React.useCallback(
    async (img: PickedImage) => {
      const file = await prepareSupportImageForUpload(img, "crash_feedback");
      const res: any = await uploadImage({
        folder: CRASH_UPLOAD_FOLDER,
        file,
        options: {
          format: "webp",
          width: 1280,
          height: 1280,
          quality: 82,
        },
      }).unwrap();
      const body = typeof res === "string" ? { url: res } : res || {};
      const url = body.url || body?.data?.url;

      if (!url) throw new Error("Upload failed");

      return {
        url,
        mime: body.mime || "image/webp",
        name: body.filename || body.name || file.name,
        size: body.size || file.size || img.size || 0,
      };
    },
    [uploadImage],
  );

  const submit = React.useCallback(async () => {
    const cleanDescription = description.trim();
    if (!report) return;
    if (!cleanDescription) {
      Alert.alert(
        "Thiếu mô tả",
        "Bạn vui lòng chia sẻ thao tác hoặc màn hình trước khi app bị văng.",
      );
      return;
    }

    try {
      const attachments = [];
      for (const img of images) attachments.push(await uploadOne(img));

      const text = [
        cleanDescription,
        "",
        "Đóng góp này được gửi từ màn hình phản hồi sau khi app bị văng.",
        "",
        buildCrashFeedbackDetails(report),
      ].join("\n");

      await createTicket({
        title: "Báo lỗi app bị văng",
        text,
        attachments,
      }).unwrap();

      Alert.alert(
        "Đã gửi phản hồi",
        "Cảm ơn bạn đã chia sẻ. Đóng góp của bạn giúp ứng dụng chúng tôi phát triển tốt hơn.",
      );
      await closeAndClear();
    } catch (error: any) {
      Alert.alert(
        "Chưa gửi được",
        error?.data?.message ||
          error?.error ||
          "Không thể gửi phản hồi lúc này. Bạn có thể thử lại sau.",
      );
    }
  }, [closeAndClear, createTicket, description, images, report, uploadOne]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={closeAndClear}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={[styles.backdrop, { backgroundColor: colors.backdrop }]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={closeAndClear} />
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              marginTop: Math.max(insets.top, 16),
              marginBottom: Math.max(insets.bottom, 16),
            },
          ]}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
          >
            <View style={[styles.iconWrap, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="bug-outline" size={28} color={colors.primary} />
            </View>

            <Text style={[styles.title, { color: colors.text }]}>
              Có vẻ như bạn vừa gặp lỗi với ứng dụng
            </Text>
            <Text style={[styles.bodyText, { color: colors.sub }]}>
              Chúng tôi rất mong được cải thiện ứng dụng từng ngày để người dùng có trải nghiệm tốt hơn. Vui lòng chia sẻ lý do bị văng app, thao tác bạn vừa làm hoặc màn hình bạn đang sử dụng.
            </Text>

            <Text style={[styles.label, { color: colors.text }]}>
              Lý do hoặc thao tác trước khi bị văng
            </Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              multiline
              textAlignVertical="top"
              placeholder="Ví dụ: Tôi đang chấm điểm trận đấu, bấm lưu điểm thì app bị văng..."
              placeholderTextColor={colors.sub}
              style={[
                styles.textArea,
                {
                  color: colors.text,
                  backgroundColor: colors.input,
                  borderColor: colors.border,
                },
              ]}
            />

            <View style={styles.attachHeader}>
              <Text style={[styles.label, { color: colors.text }]}>
                Đính kèm ảnh
              </Text>
              <TouchableOpacity
                onPress={pickImages}
                disabled={busy || images.length >= MAX_IMAGES}
                style={styles.attachButton}
              >
                <Ionicons name="image-outline" size={18} color={colors.primary} />
                <Text style={[styles.attachText, { color: colors.primary }]}>
                  Chọn ảnh
                </Text>
              </TouchableOpacity>
            </View>

            {images.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.previewRow}
              >
                {images.map((img) => (
                  <View key={img.uri} style={styles.previewItem}>
                    <ExpoImage
                      source={{ uri: img.uri }}
                      style={styles.previewImage}
                      contentFit="cover"
                    />
                    <TouchableOpacity
                      onPress={() => removeImage(img.uri)}
                      style={styles.removeButton}
                    >
                      <Ionicons name="close" size={15} color="#ffffff" />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <Text style={[styles.emptyPreview, { color: colors.sub }]}>
                Bạn có thể đính kèm ảnh chụp màn hình nếu có.
              </Text>
            )}

            <View style={[styles.noteBox, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="sparkles-outline" size={18} color={colors.primary} />
              <Text style={[styles.noteText, { color: colors.text }]}>
                Đóng góp của bạn giúp ứng dụng chúng tôi phát triển hơn, điều đó thật tuyệt vời.
              </Text>
            </View>
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <TouchableOpacity
              onPress={closeAndClear}
              disabled={busy}
              style={[
                styles.secondaryButton,
                { borderColor: colors.border, backgroundColor: colors.input },
              ]}
            >
              <Text style={[styles.secondaryText, { color: colors.text }]}>
                Để sau
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={submit}
              disabled={busy}
              style={[
                styles.primaryButton,
                { backgroundColor: colors.primary, opacity: busy ? 0.72 : 1 },
              ]}
            >
              {busy ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.primaryText}>Gửi phản hồi</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  card: {
    maxHeight: "88%",
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
  },
  content: {
    padding: 20,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "900",
  },
  bodyText: {
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
  },
  label: {
    fontSize: 14,
    fontWeight: "800",
    marginTop: 18,
  },
  textArea: {
    minHeight: 124,
    borderWidth: 1,
    borderRadius: 14,
    marginTop: 9,
    paddingHorizontal: 13,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 15,
    lineHeight: 21,
  },
  attachHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  attachButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 18,
    paddingVertical: 6,
    paddingLeft: 8,
  },
  attachText: {
    fontSize: 14,
    fontWeight: "800",
  },
  previewRow: {
    gap: 10,
    paddingTop: 12,
  },
  previewItem: {
    position: "relative",
  },
  previewImage: {
    width: 86,
    height: 86,
    borderRadius: 14,
  },
  removeButton: {
    position: "absolute",
    top: -7,
    right: -7,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(15, 23, 42, 0.82)",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyPreview: {
    fontSize: 13,
    marginTop: 8,
  },
  noteBox: {
    flexDirection: "row",
    gap: 9,
    borderRadius: 14,
    padding: 12,
    marginTop: 18,
  },
  noteText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  footer: {
    flexDirection: "row",
    gap: 10,
    borderTopWidth: 1,
    padding: 14,
  },
  secondaryButton: {
    flex: 0.9,
    minHeight: 46,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButton: {
    flex: 1.25,
    minHeight: 46,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: {
    fontSize: 15,
    fontWeight: "800",
  },
  primaryText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },
});
