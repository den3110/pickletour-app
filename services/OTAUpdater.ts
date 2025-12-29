/**
 * OTA Update Client for PickleTour (Expo version)
 * Supports ZIP bundles with assets
 */

import * as FileSystem from "expo-file-system/legacy";
import * as Application from "expo-application";
import * as Device from "expo-device";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform, Alert, NativeModules } from "react-native";
import { unzip } from "react-native-zip-archive";

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
  isZip?: boolean;
  logId?: string;
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
      const versionDir = `${this.bundlesDir}${updateInfo.version}/`;
      const isZip = updateInfo.isZip || false;

      // Create version directory
      const dirInfo = await FileSystem.getInfoAsync(versionDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(versionDir, {
          intermediates: true,
        });
      }

      // Download file
      const downloadFile = isZip
        ? `${versionDir}bundle.zip`
        : `${versionDir}index.bundle`;

      console.log("[OTA] Downloading:", updateInfo.downloadUrl);
      console.log("[OTA] isZip:", isZip);

      const downloadResumable = FileSystem.createDownloadResumable(
        updateInfo.downloadUrl,
        downloadFile,
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

      // If ZIP, extract it
      if (isZip) {
        console.log("[OTA] Extracting ZIP...");
        onProgress?.(0.95); // Show 95% while extracting

        try {
          await unzip(downloadFile, versionDir);
          console.log("[OTA] Extracted successfully");

          // Delete zip file after extraction
          await FileSystem.deleteAsync(downloadFile, { idempotent: true });
        } catch (unzipError) {
          console.error("[OTA] Unzip error:", unzipError);
          throw new Error("Failed to extract update");
        }
      }

      // Find the bundle file path
      const bundlePath = await this.findBundlePath(versionDir);
      if (!bundlePath) {
        throw new Error("Bundle file not found after extraction");
      }

      console.log("[OTA] Bundle path:", bundlePath);

      // Save pending update info with bundle path
      await AsyncStorage.setItem(
        STORAGE_KEYS.PENDING_UPDATE,
        JSON.stringify({
          version: updateInfo.version,
          bundlePath,
          versionDir,
          installedAt: Date.now(),
        })
      );

      // Update current version in AsyncStorage
      await AsyncStorage.setItem(
        STORAGE_KEYS.BUNDLE_VERSION,
        updateInfo.version
      );

      // ✅ Sync với Native - lưu version VÀ bundle path
      if (NativeModules.OTAModule?.setBundleVersion) {
        try {
          await NativeModules.OTAModule.setBundleVersion(updateInfo.version);
          console.log("[OTA] Synced version to native:", updateInfo.version);
        } catch (e) {
          console.warn("[OTA] Failed to sync version to native:", e);
        }
      }

      // Lưu bundle path vào native để AppDelegate đọc được
      if (NativeModules.OTAModule?.setBundlePath) {
        try {
          await NativeModules.OTAModule.setBundlePath(bundlePath);
          console.log("[OTA] Synced bundle path to native:", bundlePath);
        } catch (e) {
          console.warn("[OTA] Failed to sync path to native:", e);
        }
      }

      console.log("[OTA] Download complete:", updateInfo.version);
      onProgress?.(1);

      // Report success to server
      if (updateInfo.logId) {
        this.reportStatus(updateInfo.logId, "success");
      }

      // Apply update based on install mode
      if (this.config.installMode === "immediate") {
        this.restartApp();
      }

      return true;
    } catch (error) {
      console.error("[OTA] Download error:", error);

      // Report failure to server
      if (updateInfo.logId) {
        this.reportStatus(updateInfo.logId, "failed", String(error));
      }

      return false;
    } finally {
      this.isDownloading = false;
    }
  }

  /**
   * Find bundle file path in extracted directory
   */
  private async findBundlePath(versionDir: string): Promise<string | null> {
    // Check common Expo export paths
    const possiblePaths = [
      // Expo export structure: _expo/static/js/{platform}/entry-xxx.hbc
      `${versionDir}_expo/static/js/${Platform.OS}/`,
      `${versionDir}_expo/static/js/`,
      // Direct bundle
      `${versionDir}`,
    ];

    for (const basePath of possiblePaths) {
      try {
        const dirInfo = await FileSystem.getInfoAsync(basePath);
        if (dirInfo.exists && dirInfo.isDirectory) {
          const files = await FileSystem.readDirectoryAsync(basePath);

          // Look for .hbc (Hermes) or .bundle files
          const bundleFile = files.find(
            (f) =>
              f.endsWith(".hbc") ||
              f.endsWith(".bundle") ||
              f === "index.bundle" ||
              f.startsWith("entry-")
          );

          if (bundleFile) {
            return `${basePath}${bundleFile}`;
          }
        }
      } catch (e) {
        // Directory doesn't exist, continue
      }
    }

    // Fallback: look for index.bundle directly
    const directBundle = `${versionDir}index.bundle`;
    const directInfo = await FileSystem.getInfoAsync(directBundle);
    if (directInfo.exists) {
      return directBundle;
    }

    return null;
  }

  /**
   * Report update status to server
   */
  private async reportStatus(
    logId: string,
    status: string,
    errorMessage?: string
  ) {
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
                  Alert.alert(
                    "✅ Cập nhật thành công",
                    `Đã tải xong phiên bản ${updateInfo.version}.\nKhởi động lại để áp dụng bản cập nhật.`,
                    [
                      { text: "Để sau", style: "cancel" },
                      {
                        text: "Khởi động lại",
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
   * Rollback to embedded bundle
   */
  async rollback(): Promise<void> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.BUNDLE_VERSION);
      await AsyncStorage.removeItem(STORAGE_KEYS.PENDING_UPDATE);

      if (NativeModules.OTAModule?.clearBundleVersion) {
        await NativeModules.OTAModule.clearBundleVersion();
      }

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
   * Restart app
   */
  restartApp(): void {
    if (NativeModules.OTAModule?.restart) {
      NativeModules.OTAModule.restart();
    } else {
      import("expo-updates").then((Updates) => {
        Updates.reloadAsync().catch(() => {});
      });
    }
  }

  /**
   * Get status
   */
  async getStatus() {
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
