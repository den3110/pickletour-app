// hooks/uiVersion.ts
// Hệ thống chuyển đổi giao diện V1 (hiện tại) ↔ V2 Modern (luxury thể thao,
// tone xanh cyan · navy · volt theo logo PickleTour mới).
//
// Nguồn sự thật là state ở app/_layout.tsx (giống PREF_THEME). Khi V2 bật,
// _layout dùng AppV2NavTheme cho <ThemeProvider>, nên MỌI màn đọc useTheme()
// hoặc useThemeTokens() sẽ tự đổi màu. Version được "gắn" vào chính object theme
// (field `version`) để không cần thêm Context — mọi nơi chỉ cần useUiVersion().
import { useTheme } from "@react-navigation/native";
import { DeviceEventEmitter } from "react-native";
import * as SecureStore from "expo-secure-store";

export const PREF_UI_VERSION_KEY = "PREF_UI_VERSION"; // "v1" | "v2"
export type UiVersion = "v1" | "v2";

/** Bảng màu V2 Modern — lấy trực tiếp từ logo PickleTour (cyan/navy/volt). */
export const V2 = {
  // Cyan điện (viền sáng logo)
  cyan: "#12B6F3",
  cyanBright: "#5CD6FF",
  cyanDeep: "#045DA0",
  // Navy nền badge
  navy: "#0A1B34",
  navyDeep: "#040E20",
  navyAlt: "#0E2244",
  // Volt/lime (bóng pickleball)
  volt: "#CDE818",
  voltDeep: "#9BB80C",
  // Chữ trên nền tối
  ink: "#EAF3FF",
  ink2: "#C4D6EC",
  sub: "#8CA6C8",
  muted: "#5F7BA0",
  // Viền cyan mờ
  border: "rgba(92,180,255,0.16)",
  line: "rgba(92,180,255,0.26)",
  // Gradient dùng lại nhiều nơi
  gradHero: ["#040E20", "#0A1B34", "#0E2A52", "#05132A"] as const,
  gradCyan: ["#5CD6FF", "#12B6F3", "#045DA0"] as const,
  gradCard: ["#0C2044", "#0A1B34"] as const,
};

/** react-navigation Theme cho V2 (luôn nền tối navy). */
export const AppV2NavTheme: any = {
  dark: true,
  version: "v2",
  colors: {
    primary: V2.cyan,
    background: V2.navyDeep,
    card: V2.navy,
    text: V2.ink,
    border: V2.border,
    notification: V2.cyan,
  },
  fonts: undefined, // sẽ được _layout gán từ DarkTheme.fonts để tương thích RN Navigation
};

/** Đọc version hiện tại từ theme đang áp dụng. Mặc định "v1". */
export function useUiVersion(): UiVersion {
  const th = useTheme() as any;
  return th?.version === "v2" ? "v2" : "v1";
}

/** Áp dụng version + lưu + phát sự kiện để _layout đổi ThemeProvider. */
export async function applyUiVersion(mode: UiVersion) {
  try {
    await SecureStore.setItemAsync(PREF_UI_VERSION_KEY, mode);
  } catch {}
  DeviceEventEmitter.emit("uiversion:changed", mode);
}
