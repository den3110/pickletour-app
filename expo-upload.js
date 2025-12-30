#!/usr/bin/env node

/**
 * Expo Updates Upload CLI
 * Build và upload OTA update lên server
 *
 * Usage:
 *   node scripts/expo-upload.js ios "Bug fixes"
 *   node scripts/expo-upload.js android "New feature"
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");

const PLATFORM = process.argv[2]; // ios | android
const MESSAGE = process.argv[3] || "OTA Update";
const API_URL = process.env.API_URL || "https://pickletour.vn/api";

if (!PLATFORM || !["ios", "android"].includes(PLATFORM)) {
  console.error("Usage: node scripts/expo-upload.js <ios|android> [message]");
  process.exit(1);
}

async function main() {
  console.log(`\n🚀 Building OTA update for ${PLATFORM}...\n`);

  const outputDir = "./dist";

  // Clean old build
  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true });
  }

  // Run expo export
  console.log("📦 Running expo export...");
  execSync(`npx expo export --platform ${PLATFORM} --output-dir ${outputDir}`, {
    stdio: "inherit",
  });

  // Read app.json to get runtimeVersion
  const appJson = JSON.parse(fs.readFileSync("./app.json", "utf-8"));
  const runtimeVersion =
    appJson.expo?.runtimeVersion || appJson.expo?.version || "1.0.0";

  console.log(`\n📋 Runtime Version: ${runtimeVersion}`);

  // Collect all files from dist
  const files = [];
  collectFiles(outputDir, outputDir, files);

  console.log(`\n📁 Found ${files.length} files to upload`);

  // Upload to server
  console.log("\n☁️  Uploading to server...");

  const FormData = (await import("form-data")).default;
  const fetch = (await import("node-fetch")).default;

  const form = new FormData();
  form.append("platform", PLATFORM);
  form.append("runtimeVersion", runtimeVersion);
  form.append("message", MESSAGE);

  for (const file of files) {
    form.append("files", fs.createReadStream(file.fullPath), {
      filename: file.relativePath,
      contentType: getContentType(file.relativePath),
    });
  }

  const response = await fetch(`${API_URL}/api/expo-updates/upload`, {
    method: "POST",
    body: form,
    headers: form.getHeaders(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Upload failed: ${response.status} - ${error}`);
  }

  const result = await response.json();

  console.log("\n✅ Upload successful!");
  console.log(`   Update ID: ${result.updateId}`);
  console.log(`   Platform: ${PLATFORM}`);
  console.log(`   Runtime Version: ${runtimeVersion}`);
  console.log(`   Message: ${MESSAGE}`);
}

function collectFiles(baseDir, currentDir, files) {
  const items = fs.readdirSync(currentDir);

  for (const item of items) {
    const fullPath = path.join(currentDir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      collectFiles(baseDir, fullPath, files);
    } else {
      const relativePath = path.relative(baseDir, fullPath);
      files.push({ fullPath, relativePath });
    }
  }
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    ".js": "application/javascript",
    ".hbc": "application/javascript",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ttf": "font/ttf",
    ".otf": "font/otf",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".mp3": "audio/mpeg",
    ".mp4": "video/mp4",
  };
  return types[ext] || "application/octet-stream";
}

main().catch((err) => {
  console.error("\n❌ Error:", err.message);
  process.exit(1);
});
