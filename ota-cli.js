#!/usr/bin/env node

/**
 * OTA CLI - Upload bundles to PickleTour OTA Server
 *
 * Usage:
 *   node ota-cli.js release --platform ios --version 1.0.1
 *   node ota-cli.js release --platform android --version 1.0.1 --mandatory
 *   node ota-cli.js list --platform ios
 *   node ota-cli.js rollback --platform ios --version 1.0.0
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
  apiUrl: process.env.OTA_API_URL || "http://localhost:3000",
  apiKey: process.env.OTA_API_KEY || "",
};

// Colors for console output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, message) {
  console.log(`${colors.cyan}[${step}]${colors.reset} ${message}`);
}

function logSuccess(message) {
  console.log(`${colors.green}✓${colors.reset} ${message}`);
}

function logError(message) {
  console.log(`${colors.red}✗${colors.reset} ${message}`);
}

/**
 * Build JS bundle using Metro
 */
function buildBundle(platform) {
  logStep("BUILD", `Building ${platform} bundle...`);

  const outputDir = path.join(process.cwd(), "ota-build");
  const bundleFile = path.join(outputDir, `index.${platform}.bundle`);
  const assetsDir = path.join(outputDir, "assets");

  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Build command
  const buildCmd = `npx react-native bundle \
    --platform ${platform} \
    --dev false \
    --entry-file index.js \
    --bundle-output ${bundleFile} \
    --assets-dest ${assetsDir} \
    --minify true`;

  try {
    execSync(buildCmd, { stdio: "inherit" });
    logSuccess(`Bundle built: ${bundleFile}`);
    return bundleFile;
  } catch (error) {
    logError("Bundle build failed");
    process.exit(1);
  }
}

/**
 * Upload bundle to OTA server
 */
async function uploadBundle(options) {
  const {
    platform,
    version,
    bundlePath,
    mandatory,
    description,
    minAppVersion,
  } = options;

  logStep("UPLOAD", `Uploading ${platform} bundle v${version}...`);

  const formData = new FormData();
  const fileBuffer = fs.readFileSync(bundlePath);
  const blob = new Blob([fileBuffer], { type: "application/javascript" });

  formData.append("bundle", blob, "bundle.js");
  formData.append("platform", platform);
  formData.append("version", version);
  formData.append("mandatory", mandatory ? "true" : "false");
  formData.append("description", description || "");
  formData.append("minAppVersion", minAppVersion || "1.0.0");

  try {
    const response = await fetch(`${CONFIG.apiUrl}/api/ota/upload`, {
      method: "POST",
      body: formData,
      headers: {
        ...(CONFIG.apiKey && { Authorization: `Bearer ${CONFIG.apiKey}` }),
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    const result = await response.json();
    logSuccess(`Uploaded successfully!`);
    console.log(`  Version: ${result.version}`);
    console.log(`  Platform: ${result.platform}`);
    console.log(`  Size: ${(result.size / 1024).toFixed(2)} KB`);
    console.log(`  Hash: ${result.hash.substring(0, 16)}...`);

    return result;
  } catch (error) {
    logError(`Upload failed: ${error.message}`);
    process.exit(1);
  }
}

/**
 * List all versions
 */
async function listVersions(platform) {
  logStep("LIST", `Fetching ${platform} versions...`);

  try {
    const response = await fetch(
      `${CONFIG.apiUrl}/api/ota/versions/${platform}`
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const { versions } = await response.json();

    if (versions.length === 0) {
      log("No versions found", "yellow");
      return;
    }

    console.log("\n  Version    | Mandatory | Size      | Uploaded");
    console.log("  -----------|-----------|-----------|---------------------");

    for (const v of versions) {
      const size = `${(v.size / 1024).toFixed(1)} KB`.padEnd(9);
      const mandatory = (v.mandatory ? "Yes" : "No").padEnd(9);
      const date = new Date(v.uploadedAt).toLocaleString();
      console.log(
        `  ${v.version.padEnd(10)} | ${mandatory} | ${size} | ${date}`
      );
    }

    console.log("");
  } catch (error) {
    logError(`Failed to list versions: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Rollback to specific version
 */
async function rollback(platform, version) {
  logStep("ROLLBACK", `Rolling back ${platform} to v${version}...`);

  try {
    const response = await fetch(`${CONFIG.apiUrl}/api/ota/rollback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(CONFIG.apiKey && { Authorization: `Bearer ${CONFIG.apiKey}` }),
      },
      body: JSON.stringify({ platform, version }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    const result = await response.json();
    logSuccess(`Rolled back to v${version}`);

    return result;
  } catch (error) {
    logError(`Rollback failed: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const command = args[0];
  const options = {};

  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].substring(2);
      const value =
        args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : true;
      options[key] = value;
    }
  }

  return { command, options };
}

/**
 * Show help
 */
function showHelp() {
  console.log(`
${colors.cyan}PickleTour OTA CLI${colors.reset}

${colors.yellow}Commands:${colors.reset}
  release     Build and upload a new bundle
  list        List all versions for a platform
  rollback    Rollback to a specific version

${colors.yellow}Release options:${colors.reset}
  --platform     ios | android (required)
  --version      Version string, e.g. 1.0.1 (required)
  --mandatory    Mark as mandatory update
  --description  Update description
  --min-app      Minimum app version required

${colors.yellow}Examples:${colors.reset}
  ${colors.green}# Release iOS update${colors.reset}
  node ota-cli.js release --platform ios --version 1.0.1

  ${colors.green}# Release mandatory Android update${colors.reset}
  node ota-cli.js release --platform android --version 1.0.2 --mandatory --description "Critical bug fix"

  ${colors.green}# List all iOS versions${colors.reset}
  node ota-cli.js list --platform ios

  ${colors.green}# Rollback Android to specific version${colors.reset}
  node ota-cli.js rollback --platform android --version 1.0.0

${colors.yellow}Environment variables:${colors.reset}
  OTA_API_URL    API server URL (default: http://localhost:3000)
  OTA_API_KEY    API authentication key
`);
}

/**
 * Main
 */
async function main() {
  const { command, options } = parseArgs();

  console.log(`\n${colors.cyan}🥒 PickleTour OTA${colors.reset}\n`);

  switch (command) {
    case "release": {
      if (!options.platform || !options.version) {
        logError("Missing required options: --platform, --version");
        showHelp();
        process.exit(1);
      }

      if (!["ios", "android"].includes(options.platform)) {
        logError("Platform must be ios or android");
        process.exit(1);
      }

      // Build bundle
      const bundlePath = buildBundle(options.platform);

      // Upload
      await uploadBundle({
        platform: options.platform,
        version: options.version,
        bundlePath,
        mandatory: options.mandatory === true,
        description: options.description,
        minAppVersion: options["min-app"],
      });

      // Cleanup
      logStep("CLEANUP", "Removing build artifacts...");
      fs.rmSync(path.join(process.cwd(), "ota-build"), {
        recursive: true,
        force: true,
      });
      logSuccess("Done!");
      break;
    }

    case "list": {
      if (!options.platform) {
        logError("Missing required option: --platform");
        process.exit(1);
      }

      await listVersions(options.platform);
      break;
    }

    case "rollback": {
      if (!options.platform || !options.version) {
        logError("Missing required options: --platform, --version");
        process.exit(1);
      }

      await rollback(options.platform, options.version);
      break;
    }

    case "help":
    case "--help":
    case "-h":
      showHelp();
      break;

    default:
      logError(`Unknown command: ${command}`);
      showHelp();
      process.exit(1);
  }
}

main().catch((error) => {
  logError(error.message);
  process.exit(1);
});
