// utils/notifications.ts
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ✅ QUAN TRỌNG: KHÔNG override notification handler đã có
// Handler đã được set trong useExpoPushToken hook

// ===== CONSTANTS =====
export const NOTIFICATION_CHANNELS = {
  MATCH_REMINDERS: "match-reminders",
  MATCH_LIVE: "match-live",
  TOURNAMENT_UPDATES: "tournament-updates",
} as const;

export const STORAGE_KEYS = {
  NOTIFICATION_SETTINGS: "notificationSettings",
  SCHEDULED_NOTIFICATIONS: "scheduledNotifications",
  MATCH_REMINDERS_PREFIX: "match_reminders_",
} as const;

// ===== TYPES =====
export interface NotificationSettings {
  matchReminders: boolean;
  dayBefore: boolean;
  oneHourBefore: boolean;
  thirtyMinBefore: boolean;
  fifteenMinBefore: boolean;
  onStart: boolean;
  tournamentUpdates: boolean;
  resultNotifications: boolean;
}

export interface ScheduleNotificationParams {
  id: string;
  title: string;
  body: string;
  date: Date;
  data?: Record<string, any>;
  channelId?: string;
  sound?: boolean;
  badge?: number;
}

// ===== INITIALIZATION =====
export const initializeNotificationChannels = async () => {
  try {
    if (!Device.isDevice) {
      console.log("⚠️ Notifications chỉ hoạt động trên thiết bị thật");
      return false;
    }

    // Chỉ tạo channels cho Android
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(
        NOTIFICATION_CHANNELS.MATCH_REMINDERS,
        {
          name: "Nhắc nhở trận đấu",
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#3B82F6",
          sound: "default",
          enableVibrate: true,
          showBadge: true,
        }
      );

      await Notifications.setNotificationChannelAsync(
        NOTIFICATION_CHANNELS.MATCH_LIVE,
        {
          name: "Trận đang diễn ra",
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#EF4444",
          sound: "default",
        }
      );

      await Notifications.setNotificationChannelAsync(
        NOTIFICATION_CHANNELS.TOURNAMENT_UPDATES,
        {
          name: "Cập nhật giải đấu",
          importance: Notifications.AndroidImportance.DEFAULT,
          sound: "default",
        }
      );
    }

    console.log("✅ Notification channels initialized");
    return true;
  } catch (error) {
    console.error("❌ Init notification channels error:", error);
    return false;
  }
};

// ===== CHECK PERMISSIONS =====
export const checkNotificationPermissions = async (): Promise<boolean> => {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === "granted";
  } catch (error) {
    console.error("Check permissions error:", error);
    return false;
  }
};

// ===== SCHEDULE NOTIFICATION =====
export const scheduleNotification = async ({
  id,
  title,
  body,
  date,
  data = {},
  channelId = NOTIFICATION_CHANNELS.MATCH_REMINDERS,
  sound = true,
  badge = 1,
}: ScheduleNotificationParams): Promise<string | null> => {
  try {
    // Check nếu thời gian đã qua
    if (date <= new Date()) {
      console.log("⚠️ Thời gian đã qua, không schedule notification");
      return null;
    }

    // Check permission
    const hasPermission = await checkNotificationPermissions();
    if (!hasPermission) {
      console.log("⚠️ Không có quyền notification");
      return null;
    }

    const notificationId = await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: {
        title,
        body,
        data: { ...data, notificationId: id },
        sound,
        badge,
        priority: Notifications.AndroidNotificationPriority.MAX,
        categoryIdentifier: "match-reminder",
        ...(Platform.OS === "android" && {
          channelId,
          color: "#3B82F6",
          vibrate: [0, 250, 250, 250],
        }),
      },
      trigger: {
        date,
        channelId: Platform.OS === "android" ? channelId : undefined,
      },
    });

    console.log(`✅ Scheduled notification: ${notificationId} at ${date}`);

    // Lưu thông tin notification
    await saveScheduledNotification({
      id: notificationId,
      customId: id,
      title,
      body,
      date,
      data,
    });

    return notificationId;
  } catch (error) {
    console.error("❌ Schedule notification error:", error);
    return null;
  }
};

// ===== CANCEL NOTIFICATION =====
export const cancelNotification = async (
  notificationId: string
): Promise<boolean> => {
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
    console.log(`🗑️ Cancelled notification: ${notificationId}`);

    await removeScheduledNotification(notificationId);
    return true;
  } catch (error) {
    console.error("❌ Cancel notification error:", error);
    return false;
  }
};

// ===== CANCEL ALL =====
export const cancelAllNotifications = async (): Promise<boolean> => {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    await AsyncStorage.removeItem(STORAGE_KEYS.SCHEDULED_NOTIFICATIONS);
    console.log("🗑️ Cancelled all notifications");
    return true;
  } catch (error) {
    console.error("❌ Cancel all notifications error:", error);
    return false;
  }
};

// ===== GET SCHEDULED =====
export const getScheduledNotifications = async () => {
  try {
    const notifications =
      await Notifications.getAllScheduledNotificationsAsync();
    console.log(`📋 Scheduled notifications: ${notifications.length}`);
    return notifications;
  } catch (error) {
    console.error("❌ Get scheduled notifications error:", error);
    return [];
  }
};

// ===== SCHEDULE MATCH REMINDERS =====
export interface Match {
  _id: string;
  scheduledAt: Date | string;
  localScheduledTime?: string;
  tournament: {
    name: string;
  };
  bracket: {
    name: string;
  };
  courtLabel?: string;
}

export const scheduleMatchReminders = async (
  match: Match
): Promise<string[]> => {
  try {
    const scheduledAt = new Date(match.scheduledAt);
    const now = new Date();
    const scheduledIds: string[] = [];

    // Load settings
    const settings = await loadNotificationSettings();

    // Nhắc trước 24 giờ
    if (settings.dayBefore) {
      const oneDayBefore = new Date(
        scheduledAt.getTime() - 24 * 60 * 60 * 1000
      );
      if (oneDayBefore > now) {
        const id = await scheduleNotification({
          id: `match_${match._id}_24h`,
          title: "📅 Trận đấu ngày mai!",
          body: `${match.tournament.name} - ${match.bracket.name}\nLúc ${
            match.localScheduledTime || "TBA"
          }`,
          date: oneDayBefore,
          data: {
            matchId: match._id,
            type: "match_reminder",
            timeFrame: "24h",
            url: `/match/${match._id}`, // ✅ Deep link
          },
          channelId: NOTIFICATION_CHANNELS.MATCH_REMINDERS,
        });
        if (id) scheduledIds.push(id);
      }
    }

    // Nhắc trước 1 giờ
    if (settings.oneHourBefore) {
      const oneHourBefore = new Date(scheduledAt.getTime() - 60 * 60 * 1000);
      if (oneHourBefore > now) {
        const id = await scheduleNotification({
          id: `match_${match._id}_1h`,
          title: "⚡ Trận đấu sắp bắt đầu trong 1 giờ!",
          body: `${match.tournament.name} - ${match.bracket.name}\nSân: ${
            match.courtLabel || "TBA"
          }`,
          date: oneHourBefore,
          data: {
            matchId: match._id,
            type: "match_reminder",
            timeFrame: "1h",
            url: `/match/${match._id}`,
          },
          channelId: NOTIFICATION_CHANNELS.MATCH_REMINDERS,
          badge: 1,
        });
        if (id) scheduledIds.push(id);
      }
    }

    // Nhắc trước 30 phút
    if (settings.thirtyMinBefore) {
      const thirtyMinBefore = new Date(scheduledAt.getTime() - 30 * 60 * 1000);
      if (thirtyMinBefore > now) {
        const id = await scheduleNotification({
          id: `match_${match._id}_30m`,
          title: "🔥 Trận đấu sắp bắt đầu trong 30 phút!",
          body: `Chuẩn bị khởi động nhé!\nSân: ${match.courtLabel || "TBA"}`,
          date: thirtyMinBefore,
          data: {
            matchId: match._id,
            type: "match_reminder",
            timeFrame: "30m",
            url: `/match/${match._id}`,
          },
          channelId: NOTIFICATION_CHANNELS.MATCH_REMINDERS,
          badge: 2,
        });
        if (id) scheduledIds.push(id);
      }
    }

    // Nhắc trước 15 phút
    if (settings.fifteenMinBefore) {
      const fifteenMinBefore = new Date(scheduledAt.getTime() - 15 * 60 * 1000);
      if (fifteenMinBefore > now) {
        const id = await scheduleNotification({
          id: `match_${match._id}_15m`,
          title: "🏓 Trận đấu sắp bắt đầu trong 15 phút!",
          body: `Đến sân ngay bây giờ!\nSân: ${match.courtLabel || "TBA"}`,
          date: fifteenMinBefore,
          data: {
            matchId: match._id,
            type: "match_reminder",
            timeFrame: "15m",
            url: `/match/${match._id}`,
          },
          channelId: NOTIFICATION_CHANNELS.MATCH_REMINDERS,
          badge: 3,
        });
        if (id) scheduledIds.push(id);
      }
    }

    // Nhắc đúng giờ
    if (settings.onStart && scheduledAt > now) {
      const id = await scheduleNotification({
        id: `match_${match._id}_start`,
        title: "🎯 Trận đấu BẮT ĐẦU!",
        body: `${match.tournament.name}\nSân: ${match.courtLabel || "TBA"}`,
        date: scheduledAt,
        data: {
          matchId: match._id,
          type: "match_start",
          timeFrame: "now",
          url: `/match/${match._id}`,
        },
        channelId: NOTIFICATION_CHANNELS.MATCH_LIVE,
        badge: 5,
      });
      if (id) scheduledIds.push(id);
    }

    console.log(
      `✅ Scheduled ${scheduledIds.length} reminders for match ${match._id}`
    );

    // Lưu danh sách notification IDs
    await AsyncStorage.setItem(
      `${STORAGE_KEYS.MATCH_REMINDERS_PREFIX}${match._id}`,
      JSON.stringify(scheduledIds)
    );

    return scheduledIds;
  } catch (error) {
    console.error("❌ Schedule match reminders error:", error);
    return [];
  }
};

// ===== CANCEL MATCH REMINDERS =====
export const cancelMatch;
