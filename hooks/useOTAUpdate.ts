/**
 * useOTAUpdate Hook - Simple version (UPDATED)
 */
import { useState, useCallback, useEffect, useMemo } from "react";
import { Alert } from "react-native";
import OTAUpdater from "@/services/OTAUpdater";
import Constants from "expo-constants";
import { useGetOtaAllowedQuery } from "@/slices/settingsApiSlice";

type OTAStatus = "idle" | "checking" | "downloading" | "done" | "error";

interface UseOTAUpdateOptions {
  apiUrl: string;
  autoCheck?: boolean;
  delayMs?: number;
}

export function useOTAUpdate(options: UseOTAUpdateOptions) {
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<OTAStatus>("idle");
  const [version, setVersion] = useState<string | undefined>();

  const ota = useMemo(
    () =>
      new OTAUpdater({
        apiUrl: options.apiUrl,
        installMode: "onNextRestart",
      }),
    [options.apiUrl]
  );

  const isExpoGo = Constants.appOwnership === "expo";

  // ✅ lấy allowed từ settingsApiSlice
  const {
    data: otaAllowedData,
    isLoading: otaAllowedLoading,
    isError: otaAllowedError,
    refetch: refetchOtaAllowed,
  } = useGetOtaAllowedQuery(undefined, {
    // Expo Go thì khỏi gọi
    skip: isExpoGo,
  });

  // allowed=true => mới show prompt update
  const allowed = otaAllowedData?.allowed === true;

  const checkForUpdate = useCallback(async () => {
    if (isExpoGo) {
      console.log("[OTA] Skipped in Expo Go");
      return;
    }

    // ✅ nếu settings chưa load / lỗi / allowed=false => mở app bình thường, không làm gì
    if (otaAllowedLoading || otaAllowedError || !allowed) {
      console.log("[OTA] Skip update prompt (allowed=false or not ready)");
      return;
    }

    try {
      setStatus("checking");

      const updateInfo = await ota.checkForUpdate();

      if (!updateInfo.updateAvailable) {
        setStatus("idle");
        return;
      }

      setVersion(updateInfo.version);
      setProgress(0);
      setStatus("idle");

      // ✅ chỉ hiện prompt khi allowed=true
      Alert.alert(
        "Có bản cập nhật mới",
        `Phiên bản ${updateInfo.version}\n${updateInfo.description || ""}`,
        [
          {
            text: "Để sau",
            style: "cancel",
            onPress: () => {
              // không show modal
              setVisible(false);
              setStatus("idle");
              setProgress(0);
            },
          },
          {
            text: "Cập nhật",
            onPress: async () => {
              // ✅ CHỈ bấm Cập nhật mới show modal
              setVisible(true);
              setStatus("downloading");
              setProgress(0);

              const success = await ota.downloadAndInstall(
                updateInfo,
                (prog) => {
                  setProgress(prog);
                }
              );

              if (success) {
                setStatus("done");
                setProgress(1);
              } else {
                setStatus("error");
              }
            },
          },
        ]
      );
    } catch (error) {
      console.error("[OTA] Error:", error);
      setStatus("error");
      setVisible(true); // nếu bạn muốn show modal lỗi ngay; không muốn thì setVisible(false)
    }
  }, [ota, isExpoGo, allowed, otaAllowedLoading, otaAllowedError]);

  const restart = useCallback(() => {
    setVisible(false);
    ota.restartApp();
  }, [ota]);

  const close = useCallback(() => {
    setVisible(false);
    setStatus("idle");
    setProgress(0);
  }, []);

  // Auto check (chỉ chạy khi allowed=true)
  useEffect(() => {
    if (options.autoCheck === false) return;
    if (isExpoGo) return;

    // chưa có allowed thì đợi
    if (otaAllowedLoading) return;

    // allowed=false => không check, vào app bình thường
    if (!allowed) return;

    const timer = setTimeout(checkForUpdate, options.delayMs || 2000);
    return () => clearTimeout(timer);
  }, [
    options.autoCheck,
    options.delayMs,
    isExpoGo,
    otaAllowedLoading,
    allowed,
    checkForUpdate,
  ]);

  return {
    visible,
    progress,
    status,
    version,
    checkForUpdate,
    restart,
    close,
    refetchOtaAllowed, // optional cho bạn gọi tay nếu cần
  };
}

export default useOTAUpdate;
