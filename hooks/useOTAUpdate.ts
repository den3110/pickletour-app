/**
 * useOTAUpdate Hook - Simple version
 */

import { useState, useCallback, useEffect } from "react";
import { Alert, NativeModules } from "react-native";
import OTAUpdater from "@/services/OTAUpdater";
import Constants from "expo-constants";

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
  
  const [ota] = useState(() => new OTAUpdater({
    apiUrl: options.apiUrl,
    installMode: "onNextRestart",
  }));

  const isExpoGo = Constants.appOwnership === "expo";

  const checkForUpdate = useCallback(async () => {
    if (isExpoGo) {
      console.log("[OTA] Skipped in Expo Go");
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
      setVisible(true);
      
      Alert.alert(
        "Có bản cập nhật mới",
        `Phiên bản ${updateInfo.version}\n${updateInfo.description || ""}`,
        [
          {
            text: "Để sau",
            style: "cancel",
            onPress: () => {
              setVisible(false);
              setStatus("idle");
            },
          },
          {
            text: "Cập nhật",
            onPress: async () => {
              setStatus("downloading");
              
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
    }
  }, [ota, isExpoGo]);

  const restart = useCallback(() => {
    setVisible(false);
    ota.restartApp();
  }, [ota]);

  const close = useCallback(() => {
    setVisible(false);
    setStatus("idle");
    setProgress(0);
  }, []);

  // Auto check
  useEffect(() => {
    if (options.autoCheck !== false && !isExpoGo) {
      const timer = setTimeout(checkForUpdate, options.delayMs || 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  return {
    visible,
    progress,
    status,
    version,
    checkForUpdate,
    restart,
    close,
  };
}

export default useOTAUpdate;