const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const blockDir = (relativePath) => {
  const absolutePath = path.join(projectRoot, relativePath);
  return new RegExp(`${escapeRegExp(absolutePath)}(?:[/\\\\].*)?$`);
};

const generatedAndCacheDirs = [
  ".android-user",
  ".build-tmp",
  ".gradle-user-home",
  ".hot-updater",
  ".npm-cache",
  ".yarn-cache",
  "abcdk-",
  "android",
  "dist",
  "dist-android",
  "dist-ios",
  "ios",
  "ios 2",
  "ios copy",
  "ios copy 2",
  "ios3",
  "logs",
  "ota-build",
];

const existingBlockList = config.resolver.blockList
  ? Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : [config.resolver.blockList]
  : [];

config.resolver.blockList = [
  ...existingBlockList,
  ...generatedAndCacheDirs.map(blockDir),
];

module.exports = config;
