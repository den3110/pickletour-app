// utils/contentModeration.ts
// Helpers cho tính năng Report + Block — dùng chung cho feed post, comment, chat, profile.
// Tuân thủ Apple Guideline 1.2: user phải có cơ chế báo cáo nội dung xấu + chặn user lạm dụng.
import { Alert } from "react-native";

export type ReportReason =
  | "spam"
  | "harassment"
  | "hate"
  | "nudity"
  | "violence"
  | "misinformation"
  | "impersonation"
  | "other";

export const REPORT_REASONS: { key: ReportReason; label: string }[] = [
  { key: "spam", label: "Spam" },
  { key: "harassment", label: "Quấy rối / Bắt nạt" },
  { key: "hate", label: "Kích động thù hằn" },
  { key: "nudity", label: "Khiêu dâm / Ảnh nhạy cảm" },
  { key: "violence", label: "Bạo lực" },
  { key: "misinformation", label: "Thông tin sai lệch" },
  { key: "impersonation", label: "Mạo danh" },
  { key: "other", label: "Khác" },
];

/**
 * Hiển thị Alert chọn lý do report → gọi callback với reason đã chọn.
 */
export function pickReportReason(onPick: (reason: ReportReason) => void) {
  Alert.alert("Lý do báo cáo", "Chọn lý do phù hợp nhất:", [
    ...REPORT_REASONS.map((r) => ({
      text: r.label,
      onPress: () => onPick(r.key),
    })),
    { text: "Huỷ", style: "cancel" as const },
  ]);
}

/**
 * Xác nhận chặn user — dialog phá hoại (destructive).
 */
export function confirmBlock(
  name: string,
  onConfirm: () => Promise<void> | void
) {
  Alert.alert(
    `Chặn ${name}?`,
    "Bạn sẽ không còn thấy bài viết, bình luận, hay tin nhắn của họ. Họ cũng không thể nhắn tin cho bạn. Có thể bỏ chặn ở Cài đặt.",
    [
      { text: "Huỷ", style: "cancel" as const },
      {
        text: "Chặn",
        style: "destructive" as const,
        onPress: async () => {
          try {
            await onConfirm();
          } catch {
            /* caller handles */
          }
        },
      },
    ]
  );
}

/** Toast nhẹ dùng Alert (không cài toast lib). */
export function reportSuccess() {
  Alert.alert(
    "Đã gửi báo cáo",
    "Cảm ơn bạn — nhóm kiểm duyệt sẽ xem xét trong 24h."
  );
}
