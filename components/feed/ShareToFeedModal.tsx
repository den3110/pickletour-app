// components/feed/ShareToFeedModal.tsx
// Popup soạn nội dung trước khi chia sẻ 1 thứ (trận đấu / sản phẩm chợ / kèo / sự kiện)
// lên Bảng tin. Nội dung mặc định được điền sẵn, user có thể sửa rồi mới đăng.
//
// Cách dùng (hook):
//   const { openShare, shareModal } = useShareToFeed();
//   openShare({ defaultContent: "…", payload: { sharedEvent: { eventId } }, attachmentLabel: "Sự kiện: …" });
//   …
//   return (<>…{shareModal}</>);
import React, { useCallback, useEffect, useState } from "react";
import {
  Modal,
  View,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Text } from "@/components/ui/i18nText";
import { TextInput } from "@/components/ui/i18nTextInput";
import { useCreateFeedPostMutation } from "@/slices/feedApiSlice";

export type ShareToFeedOptions = {
  /** Nội dung mặc định điền sẵn trong ô soạn */
  defaultContent: string;
  /** Phần đính kèm gửi lên createFeedPost (sharedMatch | sharedListing | sharedPlay | sharedEvent) */
  payload: Record<string, any>;
  /** Mô tả ngắn phần đính kèm để hiện dưới ô soạn */
  attachmentLabel?: string;
  /** Tiêu đề popup */
  title?: string;
  /** Gọi sau khi đăng thành công */
  onDone?: () => void;
  /** Tự hiện Alert thành công (mặc định true) */
  successAlert?: boolean;
};

type Props = ShareToFeedOptions & {
  visible: boolean;
  onClose: () => void;
};

const MAX = 5000;

export function ShareToFeedModal({
  visible,
  onClose,
  defaultContent,
  payload,
  attachmentLabel,
  title = "Chia sẻ lên bảng tin",
  onDone,
  successAlert = true,
}: Props) {
  const [content, setContent] = useState(defaultContent || "");
  const [createFeedPost, { isLoading }] = useCreateFeedPostMutation();

  // Mỗi lần mở lại → nạp lại nội dung mặc định
  useEffect(() => {
    if (visible) setContent(defaultContent || "");
  }, [visible, defaultContent]);

  const submit = useCallback(async () => {
    const text = content.trim();
    try {
      await createFeedPost({ content: text, ...payload } as any).unwrap();
      onClose();
      onDone?.();
      if (successAlert) {
        Alert.alert("Đã chia sẻ", "Bài viết đã được đăng lên bảng tin.", [
          { text: "Xem bảng tin", onPress: () => router.push("/feed" as any) },
          { text: "OK" },
        ]);
      }
    } catch (e: any) {
      Alert.alert("Lỗi", e?.data?.message || e?.message || "Chia sẻ thất bại.");
    }
  }, [content, payload, createFeedPost, onClose, onDone, successAlert]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, backgroundColor: "rgba(2,6,23,0.55)", justifyContent: "flex-end" }}
      >
        <Pressable style={{ flex: 1 }} onPress={isLoading ? undefined : onClose} />
        <View
          style={{
            backgroundColor: "#fff",
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            paddingHorizontal: 18,
            paddingTop: 12,
            paddingBottom: Platform.OS === "ios" ? 30 : 18,
          }}
        >
          <View style={{ alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "#E2E8F0", marginBottom: 12 }} />
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center", marginRight: 10 }}>
              <Ionicons name="share-social" size={18} color="#0066FF" />
            </View>
            <Text style={{ flex: 1, fontSize: 17, fontWeight: "900", color: "#0F172A" }}>{title}</Text>
            <TouchableOpacity onPress={onClose} disabled={isLoading} hitSlop={10}>
              <Ionicons name="close" size={24} color="#64748B" />
            </TouchableOpacity>
          </View>

          <TextInput
            value={content}
            onChangeText={(t) => setContent(t.slice(0, MAX))}
            multiline
            autoFocus
            placeholder="Viết gì đó để rủ mọi người…"
            placeholderTextColor="#94A3B8"
            style={{
              borderWidth: 1,
              borderColor: "#E2E8F0",
              backgroundColor: "#F8FAFC",
              borderRadius: 14,
              padding: 12,
              fontSize: 15,
              lineHeight: 21,
              minHeight: 110,
              maxHeight: 220,
              textAlignVertical: "top",
              color: "#0F172A",
            }}
          />
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8, gap: 8 }}>
            {!!attachmentLabel && (
              <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#F1F5F9", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 }}>
                <Ionicons name="attach" size={15} color="#64748B" />
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 12.5, color: "#475569", fontWeight: "600" }}>
                  {attachmentLabel}
                </Text>
              </View>
            )}
            <Text style={{ fontSize: 11.5, color: "#94A3B8" }}>{content.length}/{MAX}</Text>
          </View>
          <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 6 }}>
            Bạn có thể sửa nội dung trước khi đăng. Phần đính kèm sẽ hiển thị kèm bài viết.
          </Text>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
            <TouchableOpacity
              onPress={onClose}
              disabled={isLoading}
              style={{ flex: 1, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#F1F5F9" }}
            >
              <Text style={{ color: "#334155", fontWeight: "800", fontSize: 15 }}>Huỷ</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={submit}
              disabled={isLoading}
              style={{ flex: 2, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#0066FF", flexDirection: "row", gap: 8, opacity: isLoading ? 0.7 : 1 }}
            >
              {isLoading ? <ActivityIndicator color="#fff" /> : <Ionicons name="send" size={16} color="#fff" />}
              <Text style={{ color: "#fff", fontWeight: "900", fontSize: 15 }}>{isLoading ? "Đang đăng…" : "Đăng lên bảng tin"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * Hook tiện dụng: giữ state popup + trả về element modal để render.
 */
export function useShareToFeed() {
  const [opts, setOpts] = useState<ShareToFeedOptions | null>(null);
  const openShare = useCallback((o: ShareToFeedOptions) => setOpts(o), []);
  const closeShare = useCallback(() => setOpts(null), []);
  const shareModal = (
    <ShareToFeedModal
      visible={!!opts}
      onClose={closeShare}
      defaultContent={opts?.defaultContent || ""}
      payload={opts?.payload || {}}
      attachmentLabel={opts?.attachmentLabel}
      title={opts?.title}
      onDone={opts?.onDone}
      successAlert={opts?.successAlert}
    />
  );
  return { openShare, closeShare, shareModal, shareOpen: !!opts };
}

export default ShareToFeedModal;
