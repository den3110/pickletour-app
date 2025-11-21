// hooks/useMatchScheduleNotifications.ts
import { useEffect, useState } from "react";
import { Alert } from "react-native";
import {
  scheduleMatchReminders,
  cancelMatchReminders,
  getScheduledNotifications,
  initializeNotificationChannels,
  checkNotificationPermissions,
  type Match,
} from "@/utils/notifications";

export function useMatchScheduleNotifications() {
  const [isReady, setIsReady] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [scheduledCount, setScheduledCount] = useState(0);

  // Initialize
  useEffect(() => {
    const init = async () => {
      await initializeNotificationChannels();
      const permission = await checkNotificationPermissions();
      setHasPermission(permission);
      setIsReady(true);

      // Load scheduled count
      const notifications = await getScheduledNotifications();
      setScheduledCount(notifications.length);
    };

    init();
  }, []);

  // Schedule reminders for a match
  const scheduleReminders = async (match: Match): Promise<boolean> => {
    try {
      if (!hasPermission) {
        Alert.alert(
          "Cần quyền thông báo",
          "Vui lòng bật thông báo trong Settings để nhận nhắc nhở",
          [{ text: "OK" }]
        );
        return false;
      }

      const ids = await scheduleMatchReminders(match);

      if (ids.length > 0) {
        setScheduledCount((prev) => prev + ids.length);

        Alert.alert(
          "Thành công! 🎉",
          `Đã đặt ${ids.length} lời nhắc cho trận đấu này:\n` +
            `• Trước 24 giờ\n` +
            `• Trước 1 giờ\n` +
            `• Trước 30 phút\n` +
            `• Trước 15 phút\n` +
            `• Khi bắt đầu`,
          [{ text: "OK" }]
        );
        return true;
      } else {
        Alert.alert(
          "Thông báo",
          "Không có lời nhắc nào được đặt (có thể do trận đã qua)"
        );
        return false;
      }
    } catch (error) {
      console.error("Schedule reminders error:", error);
      Alert.alert("Lỗi", "Không thể đặt lịch nhắc nhở");
      return false;
    }
  };

  // Cancel reminders for a match
  const cancelReminders = async (matchId: string): Promise<boolean> => {
    try {
      const success = await cancelMatchReminders(matchId);

      if (success) {
        // Update count
        const notifications = await getScheduledNotifications();
        setScheduledCount(notifications.length);

        Alert.alert("Đã hủy", "Đã hủy tất cả nhắc nhở cho trận này");
        return true;
      }

      return false;
    } catch (error) {
      console.error("Cancel reminders error:", error);
      Alert.alert("Lỗi", "Không thể hủy nhắc nhở");
      return false;
    }
  };

  // Prompt user to schedule
  const promptScheduleReminders = (match: Match) => {
    Alert.alert(
      "Đặt lịch nhắc nhở",
      "Bạn muốn được nhắc nhở trước trận đấu này?",
      [
        { text: "Không", style: "cancel" },
        {
          text: "Đặt lịch",
          onPress: () => scheduleReminders(match),
        },
      ]
    );
  };

  // Prompt user to cancel
  const promptCancelReminders = (matchId: string) => {
    Alert.alert(
      "Hủy nhắc nhở",
      "Bạn có chắc muốn hủy tất cả nhắc nhở cho trận này?",
      [
        { text: "Không", style: "cancel" },
        {
          text: "Hủy",
          style: "destructive",
          onPress: () => cancelReminders(matchId),
        },
      ]
    );
  };

  return {
    isReady,
    hasPermission,
    scheduledCount,
    scheduleReminders,
    cancelReminders,
    promptScheduleReminders,
    promptCancelReminders,
  };
}
