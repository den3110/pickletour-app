#!/usr/bin/env node

/**
 * OTA Build Script
 * Build Expo app và zip bundle + assets
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");

const PLATFORM = process.argv[2] || "ios"; // ios | android
const OUTPUT_DIR = "./ota-build";
const ZIP_OUTPUT = `./ota-bundle-${PLATFORM}.zip`;

async function build() {
  console.log(`\n🚀 Building OTA for ${PLATFORM}...\n`);

  // Clean old build
  if (fs.existsSync(OUTPUT_DIR)) {
    fs.rmSync(OUTPUT_DIR, { recursive: true });
  }
  if (fs.existsSync(ZIP_OUTPUT)) {
    fs.unlinkSync(ZIP_OUTPUT);
  }

  // Run expo export
  console.log("📦 Running expo export...");
  execSync(
    `npx expo export --platform ${PLATFORM} --output-dir ${OUTPUT_DIR}`,
    {
      stdio: "inherit",
    }
  );

  // Create zip
  console.log("\n🗜️ Creating zip archive...");
  await createZip(OUTPUT_DIR, ZIP_OUTPUT);

  // Get file info
  const stats = fs.statSync(ZIP_OUTPUT);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

  console.log(`\n✅ Build complete!`);
  console.log(`📁 Output: ${ZIP_OUTPUT}`);
  console.log(`📊 Size: ${sizeMB} MB`);
  console.log(`\n📤 Upload command:`);
  console.log(
    `curl -X POST https://pickletour.vn/api/api/ota/upload -F "bundle=@${ZIP_OUTPUT}" -F "platform=${PLATFORM}" -F "version=1.0.X" -F "description=Your description"`
  );
}

function createZip(sourceDir, outPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => {
      console.log(`   Zipped ${archive.pointer()} bytes`);
      resolve();
    });

    archive.on("error", reject);

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

build().catch((err) => {
  console.error("❌ Build failed:", err);
  process.exit(1);
});
