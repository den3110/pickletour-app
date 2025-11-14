// src/utils/rankingSec.js
import sha256 from "crypto-js/sha256";
import encHex from "crypto-js/enc-hex";
import encBase64 from "crypto-js/enc-base64";
import encUtf8 from "crypto-js/enc-utf8";
import Constants from "expo-constants";

const T1 =
  process.env.EXPO_PUBLIC_APP_METRIC_A ||
  Constants.expoConfig?.extra?.APP_METRIC_A ||
  "";
const T2 =
  process.env.EXPO_PUBLIC_APP_METRIC_B ||
  Constants.expoConfig?.extra?.APP_METRIC_B ||
  "";
const T3 =
  process.env.EXPO_PUBLIC_APP_WIDGET_VER ||
  Constants.expoConfig?.extra?.APP_WIDGET_VER ||
  "";

const T4 = "pt";
const T5 = "rk";

const CLIENT_KEY_FE = [
  T4,
  T2 ? T2.slice(1, 4) : "q1",
  T5,
  T1 ? T1.slice(2, 6) : "z9",
  T3 ? T3.slice(-3) : "x0",
].join("");

const normalizePath = (url) => {
  if (!url) return "/";
  const noQuery = String(url).split("?")[0] || "/";
  const cleaned = noQuery.replace(/\/+$/, "");
  return cleaned === "" ? "/" : cleaned;
};

export function buildRankingToken(url = "/api/rankings", method = "GET") {
  const path = normalizePath(url);
  const ts = Math.floor(Date.now() / 1000);
  const nonce = Math.random().toString(36).slice(2, 10);

  const raw = `${method.toUpperCase()}|${path}|${ts}|${nonce}|${CLIENT_KEY_FE}`;
  const sign = sha256(raw).toString(encHex);

  // React Native: base64 bằng crypto-js (không dùng btoa/Buffer)
  const payload = encBase64.stringify(encUtf8.parse(`${ts}:${nonce}:${sign}`));
  return payload;
}
