/**
 * OTA Update Client for PickleTour (Expo version)
 */

import * as FileSystem from "expo-file-system/legacy";
import * as Application from "expo-application";
import * as Device from "expo-device";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform, Alert, NativeModules } from "react-native";

const STORAGE_KEYS = {
  BUNDLE_VERSION: "@ota_bundle_version",
  PENDING_UPDATE: "@ota_pending_update",
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
}

interface OTAConfig {
  apiUrl: string;
  checkInterval?: number;
  installMode?: "immediate" | "onNextRestart" | "onNextResume";
}

class OTAUpdater {
  private config: OTAConfig;
  private bundlesDir: string;
  private isChecking: boolean = false;
  private isDownloading: boolean = false;

  constructor(config: OTAConfig) {
    this.config = {
      checkInterval: 60 * 60 * 1000,
      installMode: "onNextRestart",
      ...config,
    };
    this.bundlesDir = `${FileSystem.documentDirectory}ota-bundles/`;
    this.init();
  }

  /**
   * Initialize OTA directory
   */
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

  /**
   * Get current bundle version
   */
  async getCurrentBundleVersion(): Promise<string> {
    try {
      const version = await AsyncStorage.getItem(STORAGE_KEYS.BUNDLE_VERSION);
      return version || "0.0.0";
    } catch {
      return "0.0.0";
    }
  }

  /**
   * Get app version
   */
  getAppVersion(): string {
    return Application.nativeApplicationVersion || "1.0.0";
  }

  /**
   * Check for updates
   */
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

  /**
   * Download and install update
   */
  async downloadAndInstall(
    updateInfo: UpdateInfo,
    onProgress?: (progress: number) => void
  ): Promise<boolean> {
    if (this.isDownloading || !updateInfo.downloadUrl || !updateInfo.version) {
      return false;
    }

    this.isDownloading = true;

    try {
      const bundlePath = `${this.bundlesDir}${updateInfo.version}/`;
      const bundleFile = `${bundlePath}index.bundle`;

      // Create version directory
      const dirInfo = await FileSystem.getInfoAsync(bundlePath);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(bundlePath, {
          intermediates: true,
        });
      }

      // Download bundle với progress
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

      // Verify hash if provided
      if (updateInfo.hash) {
        console.log(
          "[OTA] Hash verification skipped (implement with expo-crypto if needed)"
        );
      }

      // Save pending update info
      await AsyncStorage.setItem(
        STORAGE_KEYS.PENDING_UPDATE,
        JSON.stringify({
          version: updateInfo.version,
          bundlePath: bundleFile,
          installedAt: Date.now(),
        })
      );

      // Update current version in AsyncStorage
      await AsyncStorage.setItem(
        STORAGE_KEYS.BUNDLE_VERSION,
        updateInfo.version
      );

      // ✅ QUAN TRỌNG: Sync với Native UserDefaults để AppDelegate đọc được
      if (NativeModules.OTAModule?.setBundleVersion) {
        try {
          await NativeModules.OTAModule.setBundleVersion(updateInfo.version);
          console.log(
            "[OTA] Synced version to native UserDefaults:",
            updateInfo.version
          );
        } catch (e) {
          console.warn("[OTA] Failed to sync to native:", e);
        }
      } else {
        console.warn("[OTA] NativeModules.OTAModule not available");
      }

      console.log("[OTA] Download complete:", updateInfo.version);
      console.log("[OTA] Bundle saved to:", bundleFile);

      // Apply update based on install mode
      if (this.config.installMode === "immediate") {
        this.restartApp();
      }

      return true;
    } catch (error) {
      console.error("[OTA] Download error:", error);
      return false;
    } finally {
      this.isDownloading = false;
    }
  }

  /**
   * Check and download in one call
   */
  async sync(options?: {
    onProgress?: (progress: number) => void;
    showPrompt?: boolean;
    onStatusChange?: (status: string) => void;
  }): Promise<boolean> {
    const updateInfo = await this.checkForUpdate();

    if (!updateInfo.updateAvailable) {
      return false;
    }

    // Show prompt for non-mandatory updates
    if (options?.showPrompt && !updateInfo.mandatory) {
      return new Promise((resolve) => {
        const sizeInMB = updateInfo.size
          ? (updateInfo.size / (1024 * 1024)).toFixed(1) + " MB"
          : "unknown";

        Alert.alert(
          "Có bản cập nhật mới",
          `${
            updateInfo.description || `Phiên bản ${updateInfo.version}`
          }\n\nKích thước: ${sizeInMB}`,
          [
            {
              text: "Để sau",
              style: "cancel",
              onPress: () => resolve(false),
            },
            {
              text: "Cập nhật",
              onPress: async () => {
                // Show downloading alert
                let currentProgress = 0;

                const success = await this.downloadAndInstall(
                  updateInfo,
                  (progress) => {
                    currentProgress = Math.round(progress * 100);
                    options.onProgress?.(progress);
                    options.onStatusChange?.(`Đang tải: ${currentProgress}%`);
                    console.log(`[OTA] Downloading: ${currentProgress}%`);
                  }
                );

                if (success) {
                  options.onStatusChange?.("Hoàn tất!");
                  // Show restart button
                  Alert.alert(
                    "✅ Cập nhật thành công",
                    `Đã tải xong phiên bản ${updateInfo.version}.\nKhởi động lại để áp dụng bản cập nhật.`,
                    [
                      {
                        text: "Để sau",
                        style: "cancel",
                      },
                      {
                        text: "Khởi động lại",
                        style: "default",
                        onPress: () => this.restartApp(),
                      },
                    ]
                  );
                } else {
                  options.onStatusChange?.("Lỗi tải xuống");
                  Alert.alert(
                    "❌ Lỗi cập nhật",
                    "Không thể tải bản cập nhật. Vui lòng thử lại sau.",
                    [{ text: "OK" }]
                  );
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

  /**
   * Get path to current bundle
   */
  async getCurrentBundlePath(): Promise<string | null> {
    try {
      const pendingUpdate = await AsyncStorage.getItem(
        STORAGE_KEYS.PENDING_UPDATE
      );

      if (pendingUpdate) {
        const { bundlePath } = JSON.parse(pendingUpdate);
        const fileInfo = await FileSystem.getInfoAsync(bundlePath);

        if (fileInfo.exists) {
          return bundlePath;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Rollback to embedded bundle
   */
  async rollback(): Promise<void> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.BUNDLE_VERSION);
      await AsyncStorage.removeItem(STORAGE_KEYS.PENDING_UPDATE);

      // ✅ Clear native UserDefaults
      if (NativeModules.OTAModule?.clearBundleVersion) {
        try {
          await NativeModules.OTAModule.clearBundleVersion();
          console.log("[OTA] Cleared native UserDefaults");
        } catch (e) {
          console.warn("[OTA] Failed to clear native:", e);
        }
      }

      // Clear downloaded bundles
      const dirInfo = await FileSystem.getInfoAsync(this.bundlesDir);
      if (dirInfo.exists) {
        await FileSystem.deleteAsync(this.bundlesDir, { idempotent: true });
        await FileSystem.makeDirectoryAsync(this.bundlesDir, {
          intermediates: true,
        });
      }

      console.log("[OTA] Rolled back to embedded bundle");
    } catch (error) {
      console.error("[OTA] Rollback error:", error);
    }
  }

  /**
   * Cleanup old bundles
   */
  async cleanup(): Promise<void> {
    try {
      const currentVersion = await this.getCurrentBundleVersion();
      const items = await FileSystem.readDirectoryAsync(this.bundlesDir);

      for (const item of items) {
        if (item !== currentVersion) {
          await FileSystem.deleteAsync(`${this.bundlesDir}${item}`, {
            idempotent: true,
          });
          console.log("[OTA] Cleaned up:", item);
        }
      }
    } catch (error) {
      console.error("[OTA] Cleanup error:", error);
    }
  }

  /**
   * Restart app to apply update
   */
  restartApp(): void {
    // ✅ Dùng native module để restart
    if (NativeModules.OTAModule?.restart) {
      console.log("[OTA] Restarting app via native module...");
      NativeModules.OTAModule.restart();
    } else {
      // Fallback: dùng expo-updates
      console.log("[OTA] Restarting app via expo-updates...");
      import("expo-updates").then((Updates) => {
        Updates.reloadAsync().catch((error) => {
          console.warn("[OTA] Reload failed:", error);
        });
      });
    }
  }

  /**
   * Get update status
   */
  async getStatus(): Promise<{
    currentVersion: string;
    lastCheck: number | null;
    hasPendingUpdate: boolean;
    appVersion: string;
    device: string;
  }> {
    const currentVersion = await this.getCurrentBundleVersion();
    const lastCheckStr = await AsyncStorage.getItem(STORAGE_KEYS.LAST_CHECK);
    const pendingUpdate = await AsyncStorage.getItem(
      STORAGE_KEYS.PENDING_UPDATE
    );

    return {
      currentVersion,
      lastCheck: lastCheckStr ? parseInt(lastCheckStr, 10) : null,
      hasPendingUpdate: !!pendingUpdate,
      appVersion: this.getAppVersion(),
      device: `${Device.brand} ${Device.modelName}`,
    };
  }
}

export default OTAUpdater;
