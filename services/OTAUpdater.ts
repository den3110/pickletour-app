/**
 * OTA Update Client for PickleTour
 * JS Bundle only (no assets) - Simple version
 */

import * as FileSystem from "expo-file-system/legacy";
import * as Application from "expo-application";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform, Alert, NativeModules } from "react-native";

const STORAGE_KEYS = {
  BUNDLE_VERSION: "@ota_bundle_version",
  LAST_CHECK: "@ota_last_check",
};

interface UpdateInfo {
  updateAvailable: boolean;
  version?: string;
  downloadUrl?: string;
  hash?: string;
  size?: number;
  mandatory?: boolean;
  description?: string;
  logId?: string;
}

interface OTAConfig {
  apiUrl: string;
  installMode?: "immediate" | "onNextRestart";
}

class OTAUpdater {
  private config: OTAConfig;
  private bundlesDir: string;
  private isChecking: boolean = false;
  private isDownloading: boolean = false;

  constructor(config: OTAConfig) {
    this.config = {
      installMode: "onNextRestart",
      ...config,
    };
    this.bundlesDir = `${FileSystem.documentDirectory}ota-bundles/`;
    this.init();
  }

  private async init() {
    try {
      const dirInfo = await FileSystem.getInfoAsync(this.bundlesDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(this.bundlesDir, {
          intermediates: true,
        });
      }
    } catch (error) {
      console.error("[OTA] Init error:", error);
    }
  }

  async getCurrentBundleVersion(): Promise<string> {
    try {
      const version = await AsyncStorage.getItem(STORAGE_KEYS.BUNDLE_VERSION);
      return version || "0.0.0";
    } catch {
      return "0.0.0";
    }
  }

  getAppVersion(): string {
    return Application.nativeApplicationVersion || "1.0.0";
  }

  async checkForUpdate(): Promise<UpdateInfo> {
    if (this.isChecking) {
      return { updateAvailable: false };
    }

    this.isChecking = true;

    try {
      const bundleVersion = await this.getCurrentBundleVersion();
      const appVersion = this.getAppVersion();
      const platform = Platform.OS;

      const response = await fetch(
        `${this.config.apiUrl}/api/ota/check?` +
          new URLSearchParams({
            platform,
            bundleVersion,
            appVersion,
          })
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result: UpdateInfo = await response.json();

      await AsyncStorage.setItem(
        STORAGE_KEYS.LAST_CHECK,
        Date.now().toString()
      );

      console.log("[OTA] Check result:", result);
      return result;
    } catch (error) {
      console.error("[OTA] Check error:", error);
      return { updateAvailable: false };
    } finally {
      this.isChecking = false;
    }
  }

  async downloadAndInstall(
    updateInfo: UpdateInfo,
    onProgress?: (progress: number) => void
  ): Promise<boolean> {
    if (this.isDownloading || !updateInfo.downloadUrl || !updateInfo.version) {
      return false;
    }

    this.isDownloading = true;

    try {
      const versionDir = `${this.bundlesDir}${updateInfo.version}/`;
      
      // Create version directory
      const dirInfo = await FileSystem.getInfoAsync(versionDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(versionDir, {
          intermediates: true,
        });
      }

      // Download bundle directly
      const bundleFile = `${versionDir}index.bundle`;

      console.log("[OTA] Downloading:", updateInfo.downloadUrl);

      const downloadResumable = FileSystem.createDownloadResumable(
        updateInfo.downloadUrl,
        bundleFile,
        {},
        (downloadProgress) => {
          const progress =
            downloadProgress.totalBytesWritten /
            downloadProgress.totalBytesExpectedToWrite;
          onProgress?.(progress);
        }
      );

      const downloadResult = await downloadResumable.downloadAsync();

      if (!downloadResult?.uri) {
        throw new Error("Download failed");
      }

      console.log("[OTA] Downloaded to:", downloadResult.uri);

      // Verify file exists
      const fileInfo = await FileSystem.getInfoAsync(bundleFile);
      if (!fileInfo.exists) {
        throw new Error("Bundle file not found after download");
      }

      console.log("[OTA] Bundle size:", fileInfo.size);

      // Update version in AsyncStorage
      await AsyncStorage.setItem(
        STORAGE_KEYS.BUNDLE_VERSION,
        updateInfo.version
      );

      // Sync với Native UserDefaults
      if (NativeModules.OTAModule?.setBundleVersion) {
        try {
          await NativeModules.OTAModule.setBundleVersion(updateInfo.version);
          console.log("[OTA] Synced version to native:", updateInfo.version);
        } catch (e) {
          console.warn("[OTA] Failed to sync to native:", e);
        }
      }

      console.log("[OTA] Download complete:", updateInfo.version);
      onProgress?.(1);

      // Report success
      if (updateInfo.logId) {
        this.reportStatus(updateInfo.logId, "success");
      }

      return true;
    } catch (error) {
      console.error("[OTA] Download error:", error);
      
      if (updateInfo.logId) {
        this.reportStatus(updateInfo.logId, "failed", String(error));
      }
      
      return false;
    } finally {
      this.isDownloading = false;
    }
  }

  private async reportStatus(logId: string, status: string, errorMessage?: string) {
    try {
      await fetch(`${this.config.apiUrl}/api/ota/report-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logId, status, errorMessage }),
      });
    } catch (e) {
      console.warn("[OTA] Failed to report status:", e);
    }
  }

  async sync(options?: {
    onProgress?: (progress: number) => void;
    showPrompt?: boolean;
    onStatusChange?: (status: string) => void;
  }): Promise<boolean> {
    const updateInfo = await this.checkForUpdate();

    if (!updateInfo.updateAvailable) {
      return false;
    }

    if (options?.showPrompt && !updateInfo.mandatory) {
      return new Promise((resolve) => {
        const sizeInMB = updateInfo.size 
          ? (updateInfo.size / (1024 * 1024)).toFixed(2) + " MB"
          : "N/A";
          
        Alert.alert(
          "Có bản cập nhật mới",
          `${updateInfo.description || `Phiên bản ${updateInfo.version}`}\n\nKích thước: ${sizeInMB}`,
          [
            {
              text: "Để sau",
              style: "cancel",
              onPress: () => resolve(false),
            },
            {
              text: "Cập nhật",
              onPress: async () => {
                const success = await this.downloadAndInstall(
                  updateInfo,
                  (progress) => {
                    const pct = Math.round(progress * 100);
                    options.onProgress?.(progress);
                    options.onStatusChange?.(`Đang tải: ${pct}%`);
                    console.log(`[OTA] Downloading: ${pct}%`);
                  }
                );
                
                if (success) {
                  options.onStatusChange?.("Hoàn tất!");
                  Alert.alert(
                    "✅ Cập nhật thành công",
                    `Đã tải xong phiên bản ${updateInfo.version}.\nKhởi động lại để áp dụng.`,
                    [
                      { text: "Để sau", style: "cancel" },
                      { text: "Khởi động lại", onPress: () => this.restartApp() },
                    ]
                  );
                } else {
                  options.onStatusChange?.("Lỗi");
                  Alert.alert("❌ Lỗi", "Không thể tải bản cập nhật.", [{ text: "OK" }]);
                }
                resolve(success);
              },
            },
          ]
        );
      });
    }

    return this.downloadAndInstall(updateInfo, options?.onProgress);
  }

  async rollback(): Promise<void> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.BUNDLE_VERSION);

      if (NativeModules.OTAModule?.clearBundleVersion) {
        await NativeModules.OTAModule.clearBundleVersion();
      }

      // Delete all bundles
      const dirInfo = await FileSystem.getInfoAsync(this.bundlesDir);
      if (dirInfo.exists) {
        await FileSystem.deleteAsync(this.bundlesDir, { idempotent: true });
      }

      console.log("[OTA] Rolled back");
    } catch (error) {
      console.error("[OTA] Rollback error:", error);
    }
  }

  restartApp(): void {
    if (NativeModules.OTAModule?.restart) {
      NativeModules.OTAModule.restart();
    } else {
      import("expo-updates").then((Updates) => {
        Updates.reloadAsync().catch(() => {});
      });
    }
  }
}

export default OTAUpdater;