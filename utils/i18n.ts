// utils/i18n.ts — i18n nhẹ cho app (VI mặc định, EN qua từ điển VI->EN).
// Không cần refactor sang key: bọc chuỗi bằng <Text> tự dịch hoặc t("<tiếng Việt>").
// Chuỗi không có trong từ điển sẽ fallback về tiếng Việt (an toàn).
import { useSyncExternalStore } from "react";
import * as SecureStore from "expo-secure-store";

import EN from "./i18n-en.json";

export type Lang = "vi" | "en";
const STORAGE_KEY = "app_lang";
const DICT: Record<string, string> = EN as Record<string, string>;

let current: Lang = "vi";
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export async function initLang() {
  try {
    const v = await SecureStore.getItemAsync(STORAGE_KEY);
    if (v === "en" || v === "vi") {
      current = v;
      emit();
    }
  } catch {
    /* ignore */
  }
}

export function getLang(): Lang {
  return current;
}
export function setLang(l: Lang) {
  if (l === current) return;
  current = l;
  emit();
  SecureStore.setItemAsync(STORAGE_KEY, l).catch(() => {});
}
export function toggleLang() {
  setLang(current === "vi" ? "en" : "vi");
}

// Quy tắc cho chuỗi động/nội suy (áp dụng khi từ điển miss). Giữ số, đổi đơn vị.
const UNIT_RULES: [RegExp, string][] = [
  [/^(.*?)(\d[\d.,]*)\s*giờ trước$/i, "$1$2h ago"],
  [/^(.*?)(\d[\d.,]*)\s*phút trước$/i, "$1$2m ago"],
  [/^(.*?)(\d[\d.,]*)\s*ngày trước$/i, "$1$2d ago"],
  [/^(.*?)(\d[\d.,]*)\s*giây trước$/i, "$1$2s ago"],
  [/(\d[\d.,]*)\s*trận đang hiển thị/i, "$1 matches shown"],
  [/(\d[\d.,]*)\s*trận\b/gi, "$1 matches"],
  [/(\d[\d.,]*)\s*sân\b/gi, "$1 courts"],
  [/(\d[\d.,]*)\s*điểm\b/gi, "$1 points"],
  [/(\d[\d.,]*)\s*tuổi\b/gi, "$1 yrs"],
  [/(\d[\d.,]*)\s*người xem/gi, "$1 viewers"],
  [/(\d[\d.,]*)\s*người đăng ký/gi, "$1 subscribers"],
  [/(\d[\d.,]*)\s*nguồn\b/gi, "$1 sources"],
  [/(\d[\d.,]*)\s*tin đăng/gi, "$1 listings"],
  [/(\d[\d.,]*)\s*bình luận/gi, "$1 comments"],
  [/(\d[\d.,]*)\s*lượt xem/gi, "$1 views"],
  [/(\d[\d.,]*)\s*giờ$/i, "$1h"],
  [/(\d[\d.,]*)\s*phút$/i, "$1m"],
  [/(\d[\d.,]*)\s*ngày$/i, "$1d"],
];

export function translate(s: unknown): any {
  if (current !== "en" || typeof s !== "string" || !s) return s;
  if (DICT[s]) return DICT[s];
  // thử bản trim (giữ nguyên khoảng trắng đầu/cuối)
  const t = s.trim();
  if (t !== s && DICT[t]) return s.replace(t, DICT[t]);
  for (const [re, rep] of UNIT_RULES) {
    if (re.test(s)) return s.replace(re, rep);
  }
  return s;
}

// alias ngắn cho placeholder/alert/title...
export const t = translate as (s: string) => string;

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, getLang);
}
/** Hook trả về hàm dịch, tự re-render khi đổi ngôn ngữ. */
export function useT() {
  useLang();
  return translate as (s: string) => string;
}
