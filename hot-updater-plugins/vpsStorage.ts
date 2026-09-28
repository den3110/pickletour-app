import { readFile } from "fs/promises";
import { createStoragePlugin } from "@hot-updater/plugin-core";

export interface VpsStorageConfig {
  /** Base URL của server hot-updater self-host, vd https://pickletour.vn/api/hot-updater */
  baseUrl: string;
  /** Khoá bảo vệ endpoint deploy (header x-hotupdater-key) */
  deployKey: string;
}

const trimSlash = (s: string) => s.replace(/\/+$/, "");

/**
 * Storage plugin đẩy bundle .zip lên VPS (thay R2/S3).
 * protocol "vps": storageUri có dạng vps://<key>
 */
export const vpsStorage = createStoragePlugin<VpsStorageConfig>({
  name: "vpsStorage",
  supportedProtocol: "vps",
  factory: (config) => {
    const base = trimSlash(config.baseUrl);
    const headers = { "x-hotupdater-key": config.deployKey };

    const keyOf = (storageUri: string) => storageUri.replace(/^vps:\/\//, "");

    return {
      async upload(key: string, filePath: string) {
        const body = await readFile(filePath);
        const res = await fetch(
          `${base}/_storage/upload?key=${encodeURIComponent(key)}`,
          {
            method: "POST",
            headers: {
              ...headers,
              "Content-Type": "application/octet-stream",
            },
            body,
          },
        );
        if (!res.ok) {
          throw new Error(
            `vpsStorage.upload failed: ${res.status} ${await res.text()}`,
          );
        }
        return { storageUri: `vps://${key}` };
      },

      async delete(storageUri: string) {
        const res = await fetch(`${base}/_storage`, {
          method: "DELETE",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ storageUri }),
        });
        if (!res.ok) {
          throw new Error(
            `vpsStorage.delete failed: ${res.status} ${await res.text()}`,
          );
        }
      },

      async getDownloadUrl(storageUri: string) {
        return { fileUrl: `${base}/file/${keyOf(storageUri)}` };
      },
    };
  },
});
