import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import * as ImagePicker from "expo-image-picker";
import { Image as ExpoImage } from "expo-image";
import { useHeaderHeight } from "@react-navigation/elements";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useGetTicketDetailQuery,
  useRateSupportTicketMutation,
  useSendMessageMutation,
} from "@/slices/supportApiSlice";
import { useUploadImageToFolderMutation } from "@/slices/uploadApiSlice";
import { prepareSupportImageForUpload } from "@/utils/supportImageUpload";

type Picked = { uri: string; name?: string; mime?: string; size?: number };

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  open: { label: "Đang mở", color: "#B45309", bg: "#FEF3C7" },
  pending: { label: "Đã phản hồi", color: "#0369A1", bg: "#E0F2FE" },
  closed: { label: "Đã đóng", color: "#047857", bg: "#D1FAE5" },
};

const CATEGORY_LABELS: Record<string, string> = {
  account: "Tài khoản",
  tournament: "Giải đấu",
  payment: "Thanh toán",
  technical: "Kỹ thuật",
  report: "Báo lỗi",
  other: "Khác",
};

const PRIORITY_META: Record<string, { label: string; color: string; bg: string }> = {
  low: { label: "Thấp", color: "#4B5563", bg: "#F3F4F6" },
  normal: { label: "Bình thường", color: "#1D4ED8", bg: "#DBEAFE" },
  high: { label: "Cao", color: "#B45309", bg: "#FEF3C7" },
  urgent: { label: "Khẩn cấp", color: "#B91C1C", bg: "#FEE2E2" },
};

function statusMeta(status?: string) {
  return STATUS_META[String(status || "open")] || STATUS_META.open;
}

function priorityMeta(priority?: string) {
  return PRIORITY_META[String(priority || "normal")] || PRIORITY_META.normal;
}

function quoteText(text: string, date: string) {
  const content = String(text || "").trim();
  if (!content) return "";
  const quoted = content
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  return `\n\nNgày ${dayjs(date).format("DD/MM/YYYY HH:mm")}, đã viết:\n${quoted}\n\n`;
}

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

function Avatar({
  label,
  color,
  bg,
}: {
  label: string;
  color: string;
  bg: string;
}) {
  return (
    <View style={[styles.avatar, { backgroundColor: bg }]}>
      <Text style={[styles.avatarText, { color }]}>{label}</Text>
    </View>
  );
}

function MetaPill({
  label,
  color,
  bg,
}: {
  label: string;
  color: string;
  bg: string;
}) {
  return (
    <View style={[styles.statusTag, { backgroundColor: bg }]}>
      <Text style={[styles.statusText, { color }]}>{label}</Text>
    </View>
  );
}

export default function SupportThreadScreen() {
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ ticketId?: string | string[] }>();
  const id = Array.isArray(params.ticketId)
    ? params.ticketId[0] || ""
    : params.ticketId || "";

  const theme = useTheme();
  const isDark = theme.dark;

  const { data, isLoading, isError, refetch, isFetching } =
    useGetTicketDetailQuery(id, { skip: !id });
  const [sendMessage, { isLoading: sending }] = useSendMessageMutation();
  const [rateTicket, { isLoading: rating }] = useRateSupportTicketMutation();
  const [uploadFile, { isLoading: uploading }] =
    useUploadImageToFolderMutation();

  const [text, setText] = useState("");
  const [images, setImages] = useState<Picked[]>([]);
  const [ratingScore, setRatingScore] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const listRef = useRef<FlatList<any>>(null);
  const inputRef = useRef<TextInput>(null);

  const colors = useMemo(
    () => ({
      bg: isDark ? "#121212" : "#F2F2F7",
      card: isDark ? "#1E1E1E" : "#FFFFFF",
      text: isDark ? "#FFFFFF" : "#000000",
      sub: isDark ? "#9CA3AF" : "#6E6E73",
      border: isDark ? "#38383A" : "#E5E5EA",
      primary: "#007AFF",
      primaryBg: isDark ? "#0A84FF20" : "#E3F2FD",
      inputBg: isDark ? "#2C2C2E" : "#FFFFFF",
      quoteBg: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
    }),
    [isDark],
  );

  const ticket = data?.ticket;
  const messages = data?.messages || [];
  const ticketTitle = ticket?.title || "Hỗ trợ";
  const status = statusMeta(ticket?.status);
  const priority = priorityMeta(ticket?.priority);
  const busy = sending || uploading;

  useEffect(() => {
    setRatingScore(Number(ticket?.ratingScore || 0));
    setRatingComment(String(ticket?.ratingComment || ""));
  }, [ticket?.ratingScore, ticket?.ratingComment]);

  const scrollToEnd = useCallback((animated = true) => {
    setTimeout(() => {
      try {
        listRef.current?.scrollToEnd({ animated });
      } catch {}
    }, 200);
  }, []);

  const pickImages = useCallback(async () => {
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
  }, []);

  const removeImage = useCallback((uri: string) => {
    setImages((current) => current.filter((item) => item.uri !== uri));
  }, []);

  const uploadOne = useCallback(
    async (img: Picked) => {
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
    },
    [uploadFile],
  );

  const onSend = useCallback(async () => {
    const cleanText = text.trim();
    if (!id || (!cleanText && images.length === 0)) return;

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
    } catch (error: any) {
      Alert.alert(
        "Lỗi",
        error?.data?.message || error?.error || "Không thể gửi phản hồi.",
      );
    }
  }, [id, images, refetch, scrollToEnd, sendMessage, text, uploadOne]);

  const onRate = useCallback(async () => {
    if (!id || !ratingScore) return;
    try {
      await rateTicket({
        ticketId: id,
        score: ratingScore,
        comment: ratingComment.trim(),
      }).unwrap();
      Alert.alert("Đã lưu", "Cảm ơn bạn đã đánh giá hỗ trợ.");
    } catch (error: any) {
      Alert.alert(
        "Lỗi",
        error?.data?.message || error?.error || "Không thể lưu đánh giá.",
      );
    }
  }, [id, rateTicket, ratingComment, ratingScore]);

  const handleReplyToMessage = useCallback((msg: any) => {
    const quoted = quoteText(msg.text, msg.createdAt);
    setText((current) => (current ? `${current}${quoted}` : quoted));
    inputRef.current?.focus();
  }, []);

  const renderMessage = useCallback(
    ({ item }: any) => {
      const isUser = item.senderRole === "user";
      const fromName = isUser ? "Tôi" : "Đội ngũ hỗ trợ";
      const toName = isUser ? "Đội ngũ hỗ trợ" : "Bạn";
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

            {item.attachments?.length > 0 ? (
              <View style={styles.attachContainer}>
                {item.attachments.map((attachment: any, index: number) => (
                  <ExpoImage
                    key={`${attachment.url}-${index}`}
                    source={{ uri: attachment.url }}
                    style={styles.attachThumb}
                    contentFit="cover"
                  />
                ))}
              </View>
            ) : null}
          </View>

          <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.cardActionBtn, { backgroundColor: colors.quoteBg }]}
              onPress={() => handleReplyToMessage(item)}
            >
              <Ionicons name="arrow-undo" size={16} color={colors.sub} />
              <Text
                style={{ fontSize: 13, fontWeight: "700", color: colors.sub }}
              >
                Trả lời tin này
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    },
    [colors, handleReplyToMessage],
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen
        options={{
          title: "Chi tiết hỗ trợ",
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.text,
          headerShadowVisible: false,
        }}
      />

      <View
        style={[
          styles.subjectHeader,
          { backgroundColor: colors.card, borderBottomColor: colors.border },
        ]}
      >
        <View style={styles.subjectMetaRow}>
          <MetaPill label={status.label} color={status.color} bg={status.bg} />
          <MetaPill label={priority.label} color={priority.color} bg={priority.bg} />
          <View style={[styles.statusTag, { backgroundColor: colors.quoteBg }]}>
            <Text style={[styles.statusText, { color: colors.sub }]}>
              {CATEGORY_LABELS[ticket?.category] || CATEGORY_LABELS.other}
            </Text>
          </View>
          <Text style={{ color: colors.sub, fontSize: 12 }}>
            #{id.slice(-6).toUpperCase()}
          </Text>
        </View>
        <Text
          style={[styles.subjectTitle, { color: colors.text }]}
          numberOfLines={2}
        >
          {ticketTitle}
        </Text>
        {!!ticket?.closeReason ? (
          <Text style={{ color: colors.sub, fontSize: 13, marginTop: 4 }}>
            Lý do đóng: {ticket.closeReason}
          </Text>
        ) : null}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={{ color: colors.text, fontWeight: "800" }}>
            Không thể tải case hỗ trợ
          </Text>
          <TouchableOpacity
            onPress={() => refetch()}
            style={[styles.retryBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "800" }}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item: any) => String(item?._id || item?.id)}
            renderItem={renderMessage}
            contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
            onRefresh={refetch}
            refreshing={isFetching}
            onContentSizeChange={() => scrollToEnd(false)}
            ListEmptyComponent={
              <View style={{ padding: 40, alignItems: "center" }}>
                <Text style={{ color: colors.sub }}>
                  Case này chưa có tin nhắn.
                </Text>
              </View>
            }
          />

          {ticket?.status === "closed" ? (
            <View
              style={[
                styles.ratingBox,
                { backgroundColor: colors.card, borderTopColor: colors.border },
              ]}
            >
              <Text style={{ color: colors.text, fontWeight: "900" }}>
                Đánh giá hỗ trợ
              </Text>
              <View style={styles.ratingStars}>
                {[1, 2, 3, 4, 5].map((score) => (
                  <TouchableOpacity
                    key={score}
                    onPress={() => setRatingScore(score)}
                    style={[
                      styles.starBtn,
                      {
                        backgroundColor:
                          ratingScore >= score ? colors.primary : colors.quoteBg,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: ratingScore >= score ? "#FFFFFF" : colors.text,
                        fontWeight: "900",
                      }}
                    >
                      {score}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View
                style={[
                  styles.ratingInput,
                  { backgroundColor: isDark ? "#1C1C1E" : "#F2F2F7" },
                ]}
              >
                <TextInput
                  value={ratingComment}
                  onChangeText={setRatingComment}
                  placeholder="Góp ý thêm cho support..."
                  placeholderTextColor={colors.sub}
                  style={{ color: colors.text, minHeight: 36 }}
                  multiline
                />
              </View>
              <TouchableOpacity
                onPress={onRate}
                disabled={!ratingScore || rating}
                style={[
                  styles.rateBtn,
                  {
                    backgroundColor: colors.primary,
                    opacity: !ratingScore || rating ? 0.6 : 1,
                  },
                ]}
              >
                {rating ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>
                    Lưu đánh giá
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}

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
              {images.length > 0 ? (
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
                        <Ionicons name="close" size={14} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              ) : null}

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
                    placeholder={
                      ticket?.status === "closed"
                        ? "Gửi phản hồi để mở lại case..."
                        : "Nhập nội dung phản hồi..."
                    }
                    placeholderTextColor={colors.sub}
                    style={[styles.input, { color: colors.text }]}
                    multiline
                  />
                </View>

                <TouchableOpacity
                  onPress={onSend}
                  disabled={busy || (!text.trim() && !images.length)}
                  style={[
                    styles.sendBtn,
                    {
                      backgroundColor:
                        text.trim() || images.length ? colors.primary : colors.sub,
                    },
                    busy && { opacity: 0.7 },
                  ]}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  retryBtn: {
    marginTop: 12,
    height: 42,
    borderRadius: 12,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  subjectHeader: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  subjectMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 4,
  },
  statusTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "900",
  },
  subjectTitle: { fontSize: 18, fontWeight: "800", lineHeight: 24 },
  card: {
    marginBottom: 16,
    borderRadius: 16,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 0,
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
  avatarText: { fontSize: 14, fontWeight: "900" },
  senderName: { fontSize: 15, fontWeight: "800" },
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
    backgroundColor: "#EEEEEE",
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
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  ratingBox: {
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  ratingStars: { flexDirection: "row", gap: 8 },
  starBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  ratingInput: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  rateBtn: {
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  composer: {
    paddingTop: 12,
    paddingHorizontal: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000000",
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
    borderColor: "#FFFFFF",
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
