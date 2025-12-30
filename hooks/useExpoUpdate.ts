/**
 * useExpoUpdate Hook
 * Quản lý expo-updates với UI
 */

import { useState, useEffect, useCallback } from "react";
import { Alert, AppState } from "react-native";
import * as Updates from "expo-updates";
import Constants from "expo-constants";

type UpdateStatus = "idle" | "checking" | "downloading" | "done" | "error";

interface UseExpoUpdateOptions {
  autoCheck?: boolean;
  delayMs?: number;
  showPrompt?: boolean;
  checkOnForeground?: boolean;
}

export function useExpoUpdate(options: UseExpoUpdateOptions = {}) {
  const {
    autoCheck = true,
    delayMs = 2000,
    showPrompt = true,
    checkOnForeground = false,
  } = options;

  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState<UpdateStatus>("idle");

  const isExpoGo = Constants.appOwnership === "expo";
  const isDev = __DEV__;

  const checkAndUpdate = useCallback(
    async (silent = false) => {
      // Skip trong Expo Go và DEV mode
      if (isExpoGo || isDev) {
        console.log("[Updates] Skipped in dev/Expo Go");
        return;
      }

      try {
        if (!silent) setStatus("checking");

        const update = await Updates.checkForUpdateAsync();

        if (!update.isAvailable) {
          console.log("[Updates] No update available");
          setStatus("idle");
          return;
        }

        console.log("[Updates] Update available!");

        // Nếu showPrompt, hỏi user trước
        if (showPrompt && !silent) {
          Alert.alert(
            "Có bản cập nhật mới 🎉",
            "Cập nhật ngay để trải nghiệm tính năng mới nhất!",
            [
              {
                text: "Để sau",
                style: "cancel",
                onPress: () => setStatus("idle"),
              },
              {
                text: "Cập nhật",
                onPress: () => downloadUpdate(),
              },
            ]
          );
        } else {
          // Auto download
          await downloadUpdate();
        }
      } catch (error) {
        console.error("[Updates] Check error:", error);
        setStatus("error");

        // Auto hide error sau 3s
        setTimeout(() => {
          setStatus("idle");
          setVisible(false);
        }, 3000);
      }
    },
    [isExpoGo, isDev, showPrompt]
  );

  const downloadUpdate = useCallback(async () => {
    try {
      setVisible(true);
      setStatus("downloading");

      console.log("[Updates] Downloading...");
      const result = await Updates.fetchUpdateAsync();

      if (result.isNew) {
        console.log("[Updates] Download complete, reloading...");
        setStatus("done");

        // Delay 1s cho user thấy "Hoàn tất" rồi restart
        setTimeout(async () => {
          await Updates.reloadAsync();
        }, 1000);
      } else {
        setStatus("idle");
        setVisible(false);
      }
    } catch (error) {
      console.error("[Updates] Download error:", error);
      setStatus("error");
    }
  }, []);

  const closeModal = useCallback(() => {
    setVisible(false);
    setStatus("idle");
  }, []);

  // Auto check khi mount
  useEffect(() => {
    if (!autoCheck || isExpoGo || isDev) return;

    const timer = setTimeout(() => {
      checkAndUpdate();
    }, delayMs);

    return () => clearTimeout(timer);
  }, [autoCheck, delayMs, checkAndUpdate, isExpoGo, isDev]);

  // Check khi app từ background → foreground
  useEffect(() => {
    if (!checkOnForeground || isExpoGo || isDev) return;

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        checkAndUpdate(true); // Silent check
      }
    });

    return () => subscription.remove();
  }, [checkOnForeground, checkAndUpdate, isExpoGo, isDev]);

  return {
    visible,
    status,
    checkForUpdate: checkAndUpdate,
    closeModal,
  };
}

export default useExpoUpdate;
