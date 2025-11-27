import * as FileSystem from "expo-file-system/legacy";
import { NativeModules, NativeEventEmitter } from "react-native";

const { FacebookLiveModule } = NativeModules;
const liveEmitter = new NativeEventEmitter(FacebookLiveModule);

const log = (...args: any[]) => {
  console.log(`[VideoUploader ${new Date().toISOString()}]`, ...args);
};

interface ChunkInfo {
  path: string;
  chunkIndex: number;
  isFinal?: boolean;
  matchId?: string;
  fileSizeMB?: number;
  retryCount?: number;
}

interface UploadProgress {
  [chunkIndex: number]: number;
}

class VideoUploader {
  private uploadQueue: ChunkInfo[] = [];
  private uploading = false;
  private matchId: string | null = null;
  private progressCallbacks: ((progress: UploadProgress) => void)[] = [];
  private currentProgress: UploadProgress = {};
  private chunkListener: any = null;

  async startRecording(matchId: string) {
    log("========================================");
    log("🎬 startRecording() called");
    log("   matchId:", matchId);

    this.matchId = matchId;
    this.uploadQueue = [];
    this.currentProgress = {};

    // Remove old listener
    if (this.chunkListener) {
      log("⚠️ Removing old listener");
      this.chunkListener.remove();
      this.chunkListener = null;
    }

    // Add new listener
    log("🎧 Adding 'onRecordingChunkComplete' listener");
    this.chunkListener = liveEmitter.addListener(
      "onRecordingChunkComplete",
      (data) => {
        log("========================================");
        log("🎧 EVENT RECEIVED: onRecordingChunkComplete");
        log("📦 Raw data:", JSON.stringify(data, null, 2));
        this.handleChunkComplete(data);
        log("========================================");
      }
    );

    log("✅ Listener registered");
    log(
      "   Listener count:",
      liveEmitter.listenerCount("onRecordingChunkComplete")
    );

    // Call native
    try {
      log("📞 Calling FacebookLiveModule.startRecording()");
      const result = await FacebookLiveModule.startRecording(matchId);
      log("✅ Native returned:", result);
      log("========================================");
      return result;
    } catch (e: any) {
      log("❌ Native call failed:", e?.message || e);
      log("========================================");
      throw e;
    }
  }

  async stopRecording() {
    log("========================================");
    log("🛑 stopRecording() called");

    try {
      log("📞 Calling FacebookLiveModule.stopRecording()");
      const result = await FacebookLiveModule.stopRecording();
      log("✅ Native returned:", result);

      // Wait for final chunk
      log("⏳ Waiting 3s for final chunk event...");
      await new Promise((r) => setTimeout(r, 3000));

      // Remove listener
      if (this.chunkListener) {
        log("🎧 Removing listener");
        this.chunkListener.remove();
        this.chunkListener = null;
      }

      // Wait for uploads
      log("⏳ Waiting for uploads to complete...");
      await this.waitForUploadsComplete();

      log("✅ All done");
      log("========================================");
      return result;
    } catch (e: any) {
      log("❌ stopRecording failed:", e?.message || e);
      log("========================================");
      throw e;
    }
  }

  onProgress(callback: (progress: UploadProgress) => void) {
    this.progressCallbacks.push(callback);
    return () => {
      this.progressCallbacks = this.progressCallbacks.filter(
        (cb) => cb !== callback
      );
    };
  }

  private toFileUri(path: string): string {
    if (!path) return path;
    if (path.startsWith("file://")) return path;
    if (path.startsWith("/")) {
      return `file://${path}`;
    }
    return path;
  }

  private notifyProgress() {
    this.progressCallbacks.forEach((cb) => cb({ ...this.currentProgress }));
  }

  private handleChunkComplete = (chunk: ChunkInfo) => {
    log("========================================");
    log("📦 handleChunkComplete()");
    log("   chunkIndex:", chunk.chunkIndex);
    log("   path:", chunk.path);
    log("   isFinal:", chunk.isFinal);
    log("   fileSizeMB(native):", (chunk as any).fileSizeMB);
    log("   matchId(native):", (chunk as any).matchId);

    this.uploadQueue.push(chunk);
    log("📋 Queue updated:");
    log("   Size:", this.uploadQueue.length);
    log(
      "   Contents:",
      this.uploadQueue.map(
        (c) => `[${c.chunkIndex}] ${c.path.split("/").pop()}`
      )
    );

    if (!this.uploading) {
      log("🚀 Starting upload process");
      this.processUploadQueue();
    } else {
      log("⏳ Already uploading, chunk queued");
    }
    log("========================================");
  };

  private async processUploadQueue() {
    if (this.uploading) {
      log("⚠️ processUploadQueue: already uploading");
      return;
    }

    if (this.uploadQueue.length === 0) {
      log("⚠️ processUploadQueue: queue empty");
      return;
    }

    this.uploading = true;
    log("========================================");
    log(`📤 Processing upload queue (${this.uploadQueue.length} chunks)`);

    while (this.uploadQueue.length > 0) {
      const chunk = this.uploadQueue.shift()!;

      log("========================================");
      log(`📤 Uploading chunk ${chunk.chunkIndex}`);
      log(`   Remaining in queue: ${this.uploadQueue.length}`);
      log(`   Path: ${chunk.path}`);

      try {
        // Check file
        const fileUri = this.toFileUri(chunk.path);
        log(`   🔗 Resolved fileUri: ${fileUri}`);

        const fileInfo = await FileSystem.getInfoAsync(fileUri);
        log(`   📁 File exists: ${fileInfo.exists}`);

        if (!fileInfo.exists) {
          log(`   ❌ File not found at ${fileUri}, skip`);
          continue;
        }

        // Cập nhật lại path trong chunk để các hàm sau dùng luôn URI đúng
        chunk.path = fileUri as any;

        const sizeMB = fileInfo.size ? fileInfo.size / (1024 * 1024) : 0;
        log(`   📦 File size: ${sizeMB.toFixed(2)} MB`);

        // gán lại cho chunk để gửi lên server
        chunk.fileSizeMB = sizeMB;

        // Upload
        const startTime = Date.now();
        log(`   🌐 Starting upload to server...`);

        const response = await this.uploadChunk(chunk);

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        const speed = fileInfo.size
          ? (fileInfo.size / 1024 / 1024 / parseFloat(duration)).toFixed(2)
          : "0";

        log(`   ✅ Upload SUCCESS`);
        log(`      ⏱️ Duration: ${duration}s`);
        log(`      📊 Speed: ${speed} MB/s`);
        log(`      🎯 Response:`, response);

        // 🔥 Delete local file – không làm fail upload nếu xoá lỗi
        let deleted = false;

        // 1) Thử xoá bằng Expo
        try {
          await FileSystem.deleteAsync(chunk.path, { idempotent: true });
          deleted = true;
          log(`   🗑️ Local file deleted via Expo`);
        } catch (delErr: any) {
          log(
            `   ⚠️ Expo deleteAsync failed (non-fatal):`,
            delErr?.message || delErr
          );

          // 2) Fallback: xoá bằng native (nếu có implement)
          try {
            if (FacebookLiveModule?.deleteRecordingFile) {
              const rawPath = chunk.path.replace(/^file:\/\//, "");
              log(`   🔁 Trying native deleteRecordingFile: ${rawPath}`);
              const nativeResult = await FacebookLiveModule.deleteRecordingFile(
                rawPath
              );
              deleted = !!nativeResult;
              log(`   🗑️ Native deleteRecordingFile result:`, nativeResult);
            } else {
              log("   ⚠️ Native deleteRecordingFile not available");
            }
          } catch (nativeErr: any) {
            log(
              `   ❌ Native deleteRecordingFile failed (non-fatal):`,
              nativeErr?.message || nativeErr
            );
          }
        }

        if (!deleted) {
          log(`   ⚠️ Local recording file was NOT deleted (but upload is OK).`);
        }

        // Update progress
        this.currentProgress[chunk.chunkIndex] = 100;
        this.notifyProgress();
      } catch (error: any) {
        log(`   ❌ Upload FAILED: ${error?.message || error}`);

        // Mark failed
        this.currentProgress[chunk.chunkIndex] = -1;
        this.notifyProgress();

        // Retry
        const retryCount = (chunk as any).retryCount || 0;
        if (retryCount < 3) {
          log(`   🔄 Retry ${retryCount + 1}/3`);
          this.uploadQueue.push({
            ...chunk,
            retryCount: retryCount + 1,
          } as any);
        } else {
          log(`   💀 Max retries reached, giving up`);
        }
      }

      log("========================================");
    }

    this.uploading = false;
    log("✅ Upload queue processed");
    log("========================================");
  }

  // 🔁 URL + fieldName + parameters khớp backend /api/live/recordings/chunk
  private async uploadChunk(chunk: ChunkInfo): Promise<any> {
    const baseUrl = process.env.EXPO_PUBLIC_BASE_URL + "/api";
    const uploadUrl = `${baseUrl}/api/live/recordings/chunk`;

    log(`🌐 Upload URL: ${uploadUrl}`);

    try {
      log(` 📤 Using FileSystem.uploadAsync...`);

      const uploadResult = await FileSystem.uploadAsync(uploadUrl, chunk.path, {
        httpMethod: "POST",
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: "file", // backend dùng upload.single("file")
        parameters: {
          matchId: chunk.matchId || this.matchId || "",
          chunkIndex: chunk.chunkIndex.toString(),
          isFinal: chunk.isFinal ? "1" : "0",
          fileSizeMB: (chunk.fileSizeMB ?? 0).toString(),
        },
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      log(` 📬 Response status: ${uploadResult.status}`);
      log(` 📬 Response body:`, uploadResult.body);

      if (uploadResult.status !== 200) {
        throw new Error(`HTTP ${uploadResult.status}: ${uploadResult.body}`);
      }

      return JSON.parse(uploadResult.body);
    } catch (error) {
      log(`      ❌ FileSystem.uploadAsync failed:`, error);
      log(`      🔄 Trying fetch fallback...`);
      return this.uploadChunkWithFetch(chunk);
    }
  }

  // 🔁 fetch fallback cũng dùng /api/live/recordings/chunk + field "file"
  private async uploadChunkWithFetch(chunk: ChunkInfo): Promise<any> {
    log(`      📤 Using fetch...`);

    const formData = new FormData();

    const fileUri = this.toFileUri(chunk.path);

    formData.append("file", {
      uri: fileUri,
      type: "video/mp4",
      name: `chunk_${chunk.chunkIndex}.mp4`,
    } as any);

    formData.append("matchId", chunk.matchId || this.matchId || "");
    formData.append("chunkIndex", chunk.chunkIndex.toString());
    formData.append("isFinal", chunk.isFinal ? "1" : "0");
    formData.append("fileSizeMB", (chunk.fileSizeMB ?? 0).toString());

    const baseUrl =
      process.env.EXPO_PUBLIC_BASE_URL + "/api" || "http://172.20.10.6:5001";
    const uploadUrl = `${baseUrl}/api/live/recordings/chunk`;

    const response = await fetch(uploadUrl, {
      method: "POST",
      body: formData,
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });

    const responseText = await response.text();
    log(`      📬 Fetch response (${response.status}):`, responseText);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${responseText}`);
    }

    return JSON.parse(responseText);
  }

  private async waitForUploadsComplete(): Promise<void> {
    let waited = 0;
    const maxWait = 30000;

    log(`⏳ Waiting for uploads (max ${maxWait / 1000}s)`);

    while (this.uploading && waited < maxWait) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      waited += 500;

      if (waited % 5000 === 0) {
        log(`   ⏳ Still uploading (${waited / 1000}s/${maxWait / 1000}s)`);
        log(`   📋 Queue: ${this.uploadQueue.length}`);
      }
    }

    if (this.uploading) {
      log(`   ⚠️ Timeout after ${maxWait / 1000}s`);
    } else {
      log(`   ✅ Done in ${waited / 1000}s`);
    }
  }

  async getStatus() {
    const status = await FacebookLiveModule.getRecordingStatus();
    log("📊 Status:", status);
    return status;
  }

  getPendingChunks(): ChunkInfo[] {
    log(`📋 Pending: ${this.uploadQueue.length}`);
    return [...this.uploadQueue];
  }

  getProgress(): UploadProgress {
    log("📊 Progress:", this.currentProgress);
    return { ...this.currentProgress };
  }

  async cleanupOldRecordings(keepLastN: number = 5) {
    try {
      log(`🧹 Cleanup (keep ${keepLastN})`);

      const recordingsDir = `${FileSystem.documentDirectory}recordings/`;
      const dirInfo = await FileSystem.getInfoAsync(recordingsDir);

      if (!dirInfo.exists) {
        log("   📁 No dir");
        return;
      }

      const files = await FileSystem.readDirectoryAsync(recordingsDir);
      const mp4Files = files.filter((f) => f.endsWith(".mp4"));
      log(`   📂 Found ${mp4Files.length} files`);

      if (mp4Files.length <= keepLastN) {
        log("   ✅ No cleanup needed");
        return;
      }

      const filesWithInfo = await Promise.all(
        mp4Files.map(async (file) => {
          const path = `${recordingsDir}${file}`;
          const info = await FileSystem.getInfoAsync(path);
          return {
            path,
            name: file,
            modificationTime: info.modificationTime || 0,
          };
        })
      );

      filesWithInfo.sort((a, b) => b.modificationTime - a.modificationTime);
      const toDelete = filesWithInfo.slice(keepLastN);

      log(`   🗑️ Deleting ${toDelete.length}:`);
      toDelete.forEach((f) => log(`      - ${f.name}`));

      await Promise.all(
        toDelete.map((file) =>
          FileSystem.deleteAsync(file.path, { idempotent: true })
        )
      );

      log(`   ✅ Cleaned ${toDelete.length}`);
    } catch (error) {
      log("   ❌ Cleanup failed:", error);
    }
  }

  cancelAllUploads() {
    log("🚫 Cancelling all");
    log(`   📋 Clearing ${this.uploadQueue.length} chunks`);

    this.uploadQueue = [];
    this.currentProgress = {};
    this.notifyProgress();

    log("   ✅ Cancelled");
  }

  getDebugInfo() {
    return {
      uploading: this.uploading,
      queueSize: this.uploadQueue.length,
      matchId: this.matchId,
      progress: this.currentProgress,
      hasListener: !!this.chunkListener,
      listenerCount:
        liveEmitter.listenerCount?.("onRecordingChunkComplete") || 0,
    };
  }
}

export const videoUploader = new VideoUploader();

// Debug helper
(global as any).debugUploader = () => {
  const info = videoUploader.getDebugInfo();
  console.log("🔍 Uploader Debug:", JSON.stringify(info, null, 2));
  return info;
};
