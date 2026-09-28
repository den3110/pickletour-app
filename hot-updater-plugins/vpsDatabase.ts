import { createDatabasePlugin } from "@hot-updater/plugin-core";
import type { Bundle } from "@hot-updater/core";

export interface VpsDatabaseConfig {
  /** Base URL của server hot-updater self-host */
  baseUrl: string;
  /** Khoá bảo vệ endpoint deploy (header x-hotupdater-key) */
  deployKey: string;
}

const trimSlash = (s: string) => s.replace(/\/+$/, "");

/**
 * Database plugin lưu metadata bundle trên Mongo qua API VPS (thay Cloudflare D1).
 */
export const vpsDatabase = createDatabasePlugin<VpsDatabaseConfig>({
  name: "vpsDatabase",
  factory: (config) => {
    const base = trimSlash(config.baseUrl);
    const headers = {
      "x-hotupdater-key": config.deployKey,
      "Content-Type": "application/json",
    };

    const getJson = async (url: string) => {
      const res = await fetch(url, { headers });
      if (!res.ok) {
        throw new Error(`vpsDatabase GET failed: ${res.status} ${await res.text()}`);
      }
      return res.json();
    };

    return {
      async getBundleById(bundleId: string): Promise<Bundle | null> {
        const json = await getJson(`${base}/_db/bundles/${bundleId}`);
        return (json?.data as Bundle) ?? null;
      },

      async getBundles(options: {
        where?: { channel?: string; platform?: string };
        limit: number;
        offset: number;
      }) {
        const params = new URLSearchParams();
        params.set("limit", String(options.limit));
        params.set("offset", String(options.offset));
        if (options.where?.channel) params.set("channel", options.where.channel);
        if (options.where?.platform)
          params.set("platform", options.where.platform);
        const json = await getJson(`${base}/_db/bundles?${params.toString()}`);
        return {
          data: (json?.data as Bundle[]) ?? [],
          pagination: json?.pagination,
        };
      },

      async getChannels(): Promise<string[]> {
        const json = await getJson(`${base}/_db/channels`);
        return (json?.data as string[]) ?? [];
      },

      async commitBundle({
        changedSets,
      }: {
        changedSets: { operation: "insert" | "update" | "delete"; data: Bundle }[];
      }) {
        const res = await fetch(`${base}/_db/commit`, {
          method: "POST",
          headers,
          body: JSON.stringify({ changedSets }),
        });
        if (!res.ok) {
          throw new Error(
            `vpsDatabase.commitBundle failed: ${res.status} ${await res.text()}`,
          );
        }
      },
    };
  },
});
