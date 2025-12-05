// src/services/ratingService.js
import AsyncStorage from "@react-native-async-storage/async-storage";
import { EVENT_POINTS } from "./ratingEvents";

const LAUNCH_COUNT_KEY = "pkt_launch_count";
const INSTALL_DATE_KEY = "pkt_install_date";
const LAST_ASK_AT_KEY = "pkt_last_rating_prompt_at";
const SATISFACTION_KEY = "pkt_satisfaction_score";

// config ngưỡng
const MIN_LAUNCHES = 5; // mở app ít nhất 5 lần
const MIN_INSTALL_DAYS = 3; // cài ít nhất 3 ngày
const MIN_SCORE_TO_ASK = 3; // điểm cảm xúc >= 3 mới hỏi
const MIN_DAYS_BETWEEN_ASK = 60; // hỏi cách nhau ít nhất 60 ngày

const MAX_SCORE = 20;
const MIN_SCORE = -10;

function daysBetween(a, b) {
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.abs(a - b) / oneDay;
}

// gọi 1 lần khi app khởi động (nếu chưa có thì set install date)
export async function initInstallDateIfNeeded() {
  const raw = await AsyncStorage.getItem(INSTALL_DATE_KEY);
  if (!raw) {
    await AsyncStorage.setItem(INSTALL_DATE_KEY, String(Date.now()));
  }
}

// mỗi lần mở app thì gọi, để đếm tổng số launch
export async function increaseLaunchCountAndGet() {
  const raw = await AsyncStorage.getItem(LAUNCH_COUNT_KEY);
  const current = raw ? parseInt(raw, 10) || 0 : 0;
  const next = current + 1;
  await AsyncStorage.setItem(LAUNCH_COUNT_KEY, String(next));
  return next;
}

async function getDaysSinceInstall() {
  const raw = await AsyncStorage.getItem(INSTALL_DATE_KEY);
  if (!raw) return 0;
  const ts = parseInt(raw, 10) || 0;
  if (!ts) return 0;
  return daysBetween(Date.now(), ts);
}

async function getLastAskDaysAgo() {
  const raw = await AsyncStorage.getItem(LAST_ASK_AT_KEY);
  if (!raw) return null;
  const ts = parseInt(raw, 10) || 0;
  if (!ts) return null;
  return daysBetween(Date.now(), ts);
}

// khi đã quyết định show popup thì gọi để lưu lại thời điểm này
export async function markRatingPromptShown() {
  await AsyncStorage.setItem(LAST_ASK_AT_KEY, String(Date.now()));
}

// track các event vui/buồn để cộng/trừ điểm cảm xúc
export async function trackRatingEvent(eventName) {
  const delta = EVENT_POINTS[eventName] ?? 0;
  const raw = await AsyncStorage.getItem(SATISFACTION_KEY);
  const current = raw ? parseInt(raw, 10) || 0 : 0;

  let next = current + delta;
  if (next > MAX_SCORE) next = MAX_SCORE;
  if (next < MIN_SCORE) next = MIN_SCORE;

  await AsyncStorage.setItem(SATISFACTION_KEY, String(next));
}

// hàm core: check xem lúc này có PHÙ HỢP để hỏi rating không
export async function canAskForRating() {
  const [launchRaw, installDays, lastAskDaysAgo, scoreRaw] = await Promise.all([
    AsyncStorage.getItem(LAUNCH_COUNT_KEY),
    getDaysSinceInstall(),
    getLastAskDaysAgo(),
    AsyncStorage.getItem(SATISFACTION_KEY),
  ]);

  const launchCount = launchRaw ? parseInt(launchRaw, 10) || 0 : 0;
  const score = scoreRaw ? parseInt(scoreRaw, 10) || 0 : 0;

  if (launchCount < MIN_LAUNCHES) return false;
  if (installDays < MIN_INSTALL_DAYS) return false;
  if (score < MIN_SCORE_TO_ASK) return false;

  if (lastAskDaysAgo !== null && lastAskDaysAgo < MIN_DAYS_BETWEEN_ASK) {
    return false;
  }

  return true;
}

// tiện cho bạn DEV: reset lại tất cả để test
export async function resetRatingDebug() {
  await AsyncStorage.multiRemove([
    LAUNCH_COUNT_KEY,
    INSTALL_DATE_KEY,
    LAST_ASK_AT_KEY,
    SATISFACTION_KEY,
  ]);
}
