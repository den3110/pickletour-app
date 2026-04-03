import Constants from "expo-constants";

type ExpoNotificationsModule = typeof import("expo-notifications");

export const notificationsRequireNativeBuild =
  Constants.appOwnership === "expo";

let notificationsModulePromise: Promise<ExpoNotificationsModule | null> | null =
  null;
let notificationHandlerConfigured = false;

const ensureNotificationHandler = (Notifications: ExpoNotificationsModule) => {
  if (notificationHandlerConfigured) return;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  notificationHandlerConfigured = true;
};

export async function loadExpoNotifications() {
  if (notificationsRequireNativeBuild) {
    return null;
  }

  if (!notificationsModulePromise) {
    notificationsModulePromise = import("expo-notifications")
      .then((Notifications) => {
        ensureNotificationHandler(Notifications);
        return Notifications;
      })
      .catch((error) => {
        notificationsModulePromise = null;
        if (__DEV__) {
          console.warn("[expo-notifications] unavailable:", error);
        }
        return null;
      });
  }

  return notificationsModulePromise;
}
