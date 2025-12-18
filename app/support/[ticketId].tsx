// app/support/[ticketId].tsx
import React, { useMemo, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import * as ImagePicker from "expo-image-picker";
import { Image as ExpoImage } from "expo-image";
import { useHeaderHeight } from "@react-navigation/elements";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Giữ nguyên import của bạn
import {
  useGetTicketDetailQuery,
  useSendMessageMutation,
} from "@/slices/supportApiSlice";
import { useUploadAvatarMutation } from "@/slices/uploadApiSlice";

type Picked = { uri: string; name?: string; mime?: string; size?: number };

function guessMime(uri: string) {
  const ext = (uri.split(".").pop() || "jpg").toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

// Logic tạo trích dẫn (Quote)
function quoteText(text: string, date: string) {
  const t = String(text || "").trim();
  if (!t) return "";

  // Format lại đoạn quote cho đẹp hơn
  const lines = t
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  const header = `\n\nOn ${dayjs(date).format("DD/MM/YYYY HH:mm")}, wrote:\n`;
  return header + lines + "\n\n";
}

// Component Avatar nhỏ gọn
const Avatar = ({
  label,
  color,
  bg,
}: {
  label: string;
  color: string;
  bg: string;
}) => (
  <View style={[styles.avatar, { backgroundColor: bg }]}>
    <Text style={[styles.avatarText, { color: color }]}>{label}</Text>
  </View>
);

export default function SupportThreadScreen() {
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const { ticketId } = useLocalSearchParams();
  const id = String(ticketId || "");

  const theme = useTheme();
  const isDark = theme.dark;

  const { data, isLoading, refetch, isFetching } = useGetTicketDetailQuery(id, {
    skip: !id,
  });

  const [sendMessage, { isLoading: sending }] = useSendMessageMutation();
  const [uploadFile, { isLoading: uploading }] = useUploadAvatarMutation();

  const [text, setText] = useState("");
  const [images, setImages] = useState<Picked[]>([]);
  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);

  const colors = useMemo(
    () => ({
      bg: isDark ? "#121212" : "#F2F2F7", // Nền xám nhạt kiểu iOS
      card: isDark ? "#1E1E1E" : "#FFFFFF",
      text: isDark ? "#FFFFFF" : "#000000",
      sub: isDark ? "#9CA3AF" : "#6E6E73",
      border: isDark ? "#38383A" : "#E5E5EA",
      primary: "#007AFF",
      primaryBg: isDark ? "#0A84FF20" : "#E3F2FD",
      danger: "#FF3B30",
      inputBg: isDark ? "#2C2C2E" : "#FFFFFF",
    }),
    [isDark]
  );

  const ticket = data?.ticket;
  const messages = data?.messages || [];
  const ticketTitle = ticket?.title || "Hỗ trợ";
  const status = ticket?.status || "open";

  const busy = sending || uploading;

  const scrollToEnd = useCallback((animated = true) => {
    setTimeout(() => {
      try {
        listRef.current?.scrollToEnd({ animated });
      } catch {}
    }, 200);
  }, []);

  const pickImages = useCallback(async () => {
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
  }, []);

  const removeImage = useCallback((uri: string) => {
    setImages((prev) => prev.filter((x) => x.uri !== uri));
  }, []);

  const uploadOne = useCallback(
    async (img: Picked) => {
      const uri = img.uri;
      const mime = img.mime || guessMime(uri);
      const ext = (uri.split(".").pop() || "jpg").toLowerCase();
      const name = img.name || `supp_${Date.now()}.${ext}`;

      const fd = new FormData();
      fd.append("file", { uri, name, type: mime } as any);

      const res: any = await uploadFile(fd).unwrap();
      const body = typeof res === "string" ? { url: res } : res || {};
      const url = body.url || body?.data?.url;
      if (!url) throw new Error("Upload failed");

      return {
        url,
        mime: body.mime || mime,
        name: body.name || name,
        size: body.size || img.size || 0,
      };
    },
    [uploadFile]
  );

  const onSend = useCallback(async () => {
    const cleanText = text.trim();
    if (!cleanText && images.length === 0) return;

    try {
      const attachments: any[] = [];
      for (const img of images) {
        attachments.push(await uploadOne(img));
      }

      await sendMessage({
        ticketId: id,
        text: cleanText,
        attachments,
      }).unwrap();

      setText("");
      setImages([]);

      await refetch();
      scrollToEnd(true);
    } catch (e: any) {
      Alert.alert("Lỗi", "Không thể gửi tin nhắn.");
    }
  }, [id, images, refetch, scrollToEnd, sendMessage, text, uploadOne]);

  // Logic Quote: Khi bấm Reply ở 1 tin nhắn cụ thể
  const handleReplyToMessage = useCallback((msg: any) => {
    const quoted = quoteText(msg.text, msg.createdAt);
    setText((prev) => {
      // Nếu đang viết dở thì nối thêm vào, không thì replace
      return prev ? prev + quoted : quoted;
    });
    inputRef.current?.focus();
  }, []);

  const renderEmailCard = useCallback(
    ({ item }: any) => {
      const isUser = item.senderRole === "user";
      const fromName = isUser ? "Tôi (Bạn)" : "Đội ngũ Hỗ trợ";
      const toName = isUser ? "Đội ngũ Hỗ trợ" : "Bạn";
      const timeText = item.createdAt
        ? dayjs(item.createdAt).format("DD/MM/YYYY - HH:mm")
        : "";

      return (
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          {/* Header Card */}
          <View style={styles.cardHeader}>
            <Avatar
              label={isUser ? "ME" : "SP"}
              bg={isUser ? colors.primaryBg : "#F3E5F5"}
              color={isUser ? colors.primary : "#9C27B0"}
            />
            <View style={{ flex: 1 }}>
              <View style={styles.headerTopRow}>
                <Text style={[styles.senderName, { color: colors.text }]}>
                  {fromName}
                </Text>
                <Text style={[styles.timeText, { color: colors.sub }]}>
                  {timeText}
                </Text>
              </View>
              <Text style={[styles.toText, { color: colors.sub }]}>
                Đến: <Text style={{ color: colors.text }}>{toName}</Text>
              </Text>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Body Content */}
          <View style={styles.cardBody}>
            {!!item.text ? (
              <Text style={[styles.bodyText, { color: colors.text }]}>
                {item.text}
              </Text>
            ) : (
              <Text style={{ fontStyle: "italic", color: colors.sub }}>
                [Chỉ có hình ảnh]
              </Text>
            )}

            {/* Attachments */}
            {item.attachments?.length > 0 && (
              <View style={styles.attachContainer}>
                {item.attachments.map((a: any, idx: number) => (
                  <ExpoImage
                    key={idx}
                    source={{ uri: a.url }}
                    style={styles.attachThumb}
                    contentFit="cover"
                  />
                ))}
              </View>
            )}
          </View>

          {/* Footer Action: Reply Button */}
          <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
            <TouchableOpacity
              style={styles.cardActionBtn}
              onPress={() => handleReplyToMessage(item)}
            >
              <Ionicons name="arrow-undo" size={16} color={colors.sub} />
              <Text
                style={{ fontSize: 13, fontWeight: "600", color: colors.sub }}
              >
                Trả lời tin này
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    },
    [colors, handleReplyToMessage]
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen
        options={{
          title: "", // Hide default title
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.text,
          headerShadowVisible: false,
        }}
      />

      {/* Custom Sticky Header - Giống Email Subject */}
      <View
        style={[
          styles.subjectHeader,
          { backgroundColor: colors.card, borderBottomColor: colors.border },
        ]}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginBottom: 4,
          }}
        >
          <View
            style={[
              styles.statusTag,
              { backgroundColor: status === "open" ? "#E8F5E9" : "#F5F5F5" },
            ]}
          >
            <Text
              style={{
                color: status === "open" ? "#2E7D32" : "#757575",
                fontSize: 10,
                fontWeight: "800",
                textTransform: "uppercase",
              }}
            >
              {status}
            </Text>
          </View>
          <Text style={{ color: colors.sub, fontSize: 12 }}>
            Ticket #{id.slice(-6).toUpperCase()}
          </Text>
        </View>
        <Text
          style={[styles.subjectTitle, { color: colors.text }]}
          numberOfLines={2}
        >
          {ticketTitle}
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <>
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item: any) => String(item?._id || item?.id)}
            renderItem={renderEmailCard}
            contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
            onRefresh={refetch}
            refreshing={isFetching}
            ListEmptyComponent={
              <View style={{ padding: 40, alignItems: "center" }}>
                <Text style={{ color: colors.sub }}>Chưa có phản hồi nào.</Text>
              </View>
            }
          />

          {/* Sticky Composer - Hiện đại, không bị che bàn phím */}
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            keyboardVerticalOffset={headerHeight}
          >
            <View
              style={[
                styles.composer,
                {
                  backgroundColor: colors.inputBg,
                  borderTopColor: colors.border,
                  paddingBottom: insets.bottom + 10,
                },
              ]}
            >
              {/* Image Preview Bar */}
              {images.length > 0 && (
                <ScrollView
                  horizontal
                  style={styles.previewBar}
                  contentContainerStyle={{ gap: 12 }}
                >
                  {images.map((img) => (
                    <View key={img.uri}>
                      <ExpoImage
                        source={{ uri: img.uri }}
                        style={{ width: 60, height: 60, borderRadius: 8 }}
                      />
                      <TouchableOpacity
                        onPress={() => removeImage(img.uri)}
                        style={styles.removeBtn}
                      >
                        <Ionicons name="close" size={14} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              )}

              <View style={styles.inputRow}>
                <TouchableOpacity
                  onPress={pickImages}
                  style={styles.iconBtn}
                  disabled={busy}
                >
                  <Ionicons name="attach" size={26} color={colors.sub} />
                </TouchableOpacity>

                <View
                  style={[
                    styles.inputContainer,
                    { backgroundColor: isDark ? "#1C1C1E" : "#F2F2F7" },
                  ]}
                >
                  <TextInput
                    ref={inputRef}
                    value={text}
                    onChangeText={setText}
                    placeholder="Nhập nội dung trả lời..."
                    placeholderTextColor={colors.sub}
                    style={[styles.input, { color: colors.text }]}
                    multiline
                  />
                </View>

                <TouchableOpacity
                  onPress={onSend}
                  disabled={busy || (!text && !images.length)}
                  style={[
                    styles.sendBtn,
                    {
                      backgroundColor:
                        text || images.length ? colors.primary : colors.sub,
                    },
                    busy && { opacity: 0.7 },
                  ]}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="arrow-up" size={20} color="#fff" />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  // Subject Header
  subjectHeader: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statusTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 6,
  },
  subjectTitle: { fontSize: 18, fontWeight: "700", lineHeight: 24 },

  // Card Styles
  card: {
    marginBottom: 16,
    borderRadius: 16,
    // Shadow xịn
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 0, // Bỏ border đen
  },
  cardHeader: {
    flexDirection: "row",
    padding: 14,
    gap: 12,
    alignItems: "center",
  },
  headerTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 14, fontWeight: "800" },
  senderName: { fontSize: 15, fontWeight: "700" },
  timeText: { fontSize: 12 },
  toText: { fontSize: 13 },

  divider: { height: 1, width: "100%", opacity: 0.6 },

  cardBody: { padding: 14 },
  bodyText: { fontSize: 15, lineHeight: 22 },

  attachContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  attachThumb: {
    width: 100,
    height: 80,
    borderRadius: 8,
    backgroundColor: "#eee",
  },

  cardFooter: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: "flex-start",
  },
  cardActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: "rgba(0,0,0,0.04)",
    borderRadius: 8,
  },

  // Composer
  composer: {
    paddingTop: 12,
    paddingHorizontal: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    // Shadow ngược lên
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 10,
  },
  previewBar: { marginBottom: 10, paddingHorizontal: 4 },
  removeBtn: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#8E8E93",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
  },
  iconBtn: { padding: 8, marginBottom: 2 },
  inputContainer: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 40,
    maxHeight: 120,
  },
  input: { fontSize: 16, paddingTop: 0, paddingBottom: 0 },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
});
