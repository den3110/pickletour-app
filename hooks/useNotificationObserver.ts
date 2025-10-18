import * as Notifications from "expo-notifications";
import { Stack, router } from "expo-router";
import React from "react";
// Lắng nghe tap notification và deep-link (hỗ trợ cả cold start)
export function useNotificationObserver() {
  React.useEffect(() => {
    let mounted = true;

    const go = (n: Notifications.Notification) => {
      const data: any = n?.request?.content?.data ?? {};
      const url =
        data?.url ?? (data?.matchId ? `/match/${data.matchId}` : null);
      console.log("data", url)

      if (url) router.push(String(url));
    };

    // Cold start: app mở do tap vào notif trước đó
    Notifications.getLastNotificationResponseAsync().then((resp) => {
      if (!mounted) return;
      if (resp?.notification) go(resp.notification);
    });

    // Tap khi app foreground/background
    const sub = Notifications.addNotificationResponseReceivedListener(
      (resp) => {
        go(resp.notification);
      }
    );

    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);
}


