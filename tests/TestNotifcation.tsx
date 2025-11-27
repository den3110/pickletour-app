// components/TestNotificationPanel.tsx
import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { PUSH_TOKEN_KEY } from "@/hooks/useExpoPushToken";

const TestNotificationPanel = () => {
  const [permissionStatus, setPermissionStatus] = useState<string>("");
  const [pushToken, setPushToken] = useState<string>("");

  // 1. Check permission status
  const checkPermissions = async () => {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      setPermissionStatus(status);
      Alert.alert(
        "Permission Status",
        `Current status: ${status}\n\n` +
          (status === "granted"
            ? "✅ Notifications allowed"
            : "❌ Notifications not allowed")
      );
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  // 2. Request permission
  const requestPermission = async () => {
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      setPermissionStatus(status);
      Alert.alert(
        "Permission Result",
        `Status: ${status}\n\n` +
          (status === "granted"
            ? "✅ Permission granted!"
            : "❌ Permission denied")
      );
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  // 3. Get push token
  const getPushToken = async () => {
    try {
      if (!Device.isDevice) {
        Alert.alert("Error", "Must use physical device for push notifications");
        return;
      }

      const projectId =
        (Constants?.expoConfig?.extra as any)?.eas?.projectId ??
        (Constants as any)?.easConfig?.projectId;

      if (!projectId) {
        Alert.alert(
          "Error",
          "Missing EAS projectId. Run 'eas build:configure'"
        );
        return;
      }

      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId,
      });
      const token = tokenData.data;
      setPushToken(token);

      // Copy to clipboard simulation
      Alert.alert(
        "Push Token",
        token,
        [
          { text: "OK" },
          {
            text: "Show in Console",
            onPress: () => console.log("Push Token:", token),
          },
        ]
      );
    } catch (e: any) {
      Alert.alert("Error", e.message);
      console.error("Get push token error:", e);
    }
  };

  // 4. Get stored token
  const getStoredToken = async () => {
    try {
      const token = await SecureStore.getItemAsync(PUSH_TOKEN_KEY);
      if (token) {
        setPushToken(token);
        Alert.alert("Stored Token", token);
      } else {
        Alert.alert("Info", "No token stored yet");
      }
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  // 5. Send local notification (immediate)
  const sendLocalNotification = async () => {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Test Notification 📬",
          body: "This is a local test notification",
          data: { testData: "local notification" },
          sound: true,
        },
        trigger: null, // Send immediately
      });
      Alert.alert("Success", "Local notification sent!");
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  // 6. Schedule notification (after 5 seconds)
  const scheduleNotification = async () => {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Scheduled Notification ⏰",
          body: "This notification was scheduled 5 seconds ago",
          data: { testData: "scheduled notification" },
          sound: true,
        },
        trigger: {
          seconds: 5,
        },
      });
      Alert.alert("Success", "Notification scheduled for 5 seconds!");
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  // 7. Send notification with action buttons
  const sendNotificationWithActions = async () => {
    try {
      // Set category with actions
      await Notifications.setNotificationCategoryAsync("test_category", [
        {
          identifier: "yes",
          buttonTitle: "Yes",
          options: {
            opensAppToForeground: true,
          },
        },
        {
          identifier: "no",
          buttonTitle: "No",
          options: {
            opensAppToForeground: false,
          },
        },
      ]);

      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Action Notification 🎯",
          body: "Do you like this notification?",
          data: { testData: "action notification" },
          sound: true,
          categoryIdentifier: "test_category",
        },
        trigger: null,
      });
      Alert.alert("Success", "Notification with actions sent!");
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  // 8. Send rich notification (with image - Android only)
  const sendRichNotification = async () => {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Rich Notification 🖼️",
          body: "This notification has a big text and image",
          data: { testData: "rich notification" },
          sound: true,
          // Android specific
          ...(Constants.platform?.android && {
            priority: Notifications.AndroidNotificationPriority.HIGH,
            vibrate: [0, 250, 250, 250],
            badge: 5,
          }),
        },
        trigger: null,
      });
      Alert.alert("Success", "Rich notification sent!");
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  // 9. Cancel all notifications
  const cancelAllNotifications = async () => {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      Alert.alert("Success", "All scheduled notifications cancelled");
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  // 10. Get notification channels (Android)
  const getNotificationChannels = async () => {
    try {
      if (Constants.platform?.android) {
        const channels =
          await Notifications.getNotificationChannelsAsync();
        console.log("Notification Channels:", channels);
        Alert.alert(
          "Channels",
          channels.map((c: any) => `${c.name} (${c.id})`).join("\n") ||
            "No channels found"
        );
      } else {
        Alert.alert("Info", "Channels are Android only");
      }
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  // 11. Send push via Expo API (requires token)
  const sendPushViaExpo = async () => {
    if (!pushToken) {
      Alert.alert("Error", "Get push token first!");
      return;
    }

    try {
      const message = {
        to: pushToken,
        sound: "default",
        title: "Remote Push Test 🚀",
        body: "This is sent via Expo Push API",
        data: { testData: "remote push" },
      };

      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
      });

      const result = await response.json();
      console.log("Push result:", result);
      
      if (result.data?.status === "ok") {
        Alert.alert(
          "Success",
          "Push notification sent!\nCheck your device in a few seconds."
        );
      } else {
        Alert.alert("Error", JSON.stringify(result));
      }
    } catch (e: any) {
      Alert.alert("Error", e.message);
      console.error("Send push error:", e);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>🔔 Notification Test Panel</Text>

      {permissionStatus && (
        <View style={styles.statusBox}>
          <Text style={styles.statusText}>
            Permission: {permissionStatus}
          </Text>
        </View>
      )}

      {pushToken && (
        <View style={styles.tokenBox}>
          <Text style={styles.tokenLabel}>Push Token:</Text>
          <Text style={styles.tokenText} numberOfLines={2}>
            {pushToken}
          </Text>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Permissions</Text>
        <TouchableOpacity style={styles.button} onPress={checkPermissions}>
          <Text style={styles.buttonText}>1. Check Permission Status</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>2. Request Permission</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Push Token</Text>
        <TouchableOpacity style={styles.button} onPress={getPushToken}>
          <Text style={styles.buttonText}>3. Get Push Token</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={getStoredToken}>
          <Text style={styles.buttonText}>4. Get Stored Token</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Local Notifications</Text>
        <TouchableOpacity
          style={styles.buttonSuccess}
          onPress={sendLocalNotification}
        >
          <Text style={styles.buttonText}>5. Send Local (Immediate)</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.buttonSuccess}
          onPress={scheduleNotification}
        >
          <Text style={styles.buttonText}>6. Schedule (5 seconds)</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.buttonSuccess}
          onPress={sendNotificationWithActions}
        >
          <Text style={styles.buttonText}>7. Send With Actions</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.buttonSuccess}
          onPress={sendRichNotification}
        >
          <Text style={styles.buttonText}>8. Send Rich Notification</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Remote Push</Text>
        <TouchableOpacity
          style={styles.buttonPrimary}
          onPress={sendPushViaExpo}
        >
          <Text style={styles.buttonText}>9. Send Remote Push (Expo API)</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Utilities</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={getNotificationChannels}
        >
          <Text style={styles.buttonText}>10. Get Channels (Android)</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.buttonDanger}
          onPress={cancelAllNotifications}
        >
          <Text style={styles.buttonText}>11. Cancel All Scheduled</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.info}>
        <Text style={styles.infoText}>
          💡 Tip: Put app in background to see notifications
        </Text>
        <Text style={styles.infoText}>
          📱 Device: {Device.isDevice ? "Physical" : "Emulator"}
        </Text>
        <Text style={styles.infoText}>
          📦 App: {Constants.appOwnership === "expo" ? "Expo Go" : "Standalone"}
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: "#f5f5f5",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 16,
    textAlign: "center",
  },
  statusBox: {
    backgroundColor: "#e3f2fd",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  statusText: {
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  tokenBox: {
    backgroundColor: "#fff3e0",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  tokenLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  tokenText: {
    fontSize: 12,
    fontFamily: "monospace",
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
    color: "#333",
  },
  button: {
    backgroundColor: "#2196F3",
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  buttonSuccess: {
    backgroundColor: "#4CAF50",
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  buttonPrimary: {
    backgroundColor: "#9C27B0",
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  buttonDanger: {
    backgroundColor: "#f44336",
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  info: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 8,
    marginTop: 8,
    marginBottom: 32,
  },
  infoText: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },
});

export default TestNotificationPanel;