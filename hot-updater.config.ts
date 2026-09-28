import { expo } from "@hot-updater/expo";
import { config } from "dotenv";
import { defineConfig } from "hot-updater";
import { vpsStorage } from "./hot-updater-plugins/vpsStorage";
import { vpsDatabase } from "./hot-updater-plugins/vpsDatabase";

config({ path: ".env.hotupdater" });

// Self-host trên VPS PickleTour (thay Cloudflare D1/R2/Worker).
const baseUrl = process.env.HOTUPDATER_BASE_URL!;
const deployKey = process.env.HOTUPDATER_DEPLOY_KEY!;

export default defineConfig({
  build: expo(),
  storage: vpsStorage({ baseUrl, deployKey }),
  database: vpsDatabase({ baseUrl, deployKey }),
  updateStrategy: "appVersion", // or "fingerprint"
});
