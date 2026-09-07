// hooks/useThemeTokens.ts
// Bộ token màu sáng/tối dùng chung cho toàn app (mở rộng từ pal() của utils/courtFormat).
// Theo theme đang áp dụng ở app/_layout (system / light / dark) qua ThemeProvider của react-navigation.
//
// Quy ước: KHÔNG hardcode màu slate (#fff, #0F172A, #64748B, #E2E8F0, #F1F5F9…) trong màn hình;
// dùng `const C = useThemeTokens();` rồi C.card / C.text / C.sub / C.border / C.field …
// StyleSheet.create có màu → chuyển thành `const mkStyles = (C: ThemeTokens) => StyleSheet.create({...})`
// và trong component: `const styles = useMemo(() => mkStyles(C), [C]);`
import { useMemo } from "react";
import { useTheme } from "@react-navigation/native";
import { pal } from "@/utils/courtFormat";

export const themeTokens = (dark: boolean) => {
  const p = pal(dark);
  return {
    ...p,
    /** nền trang (SafeAreaView / ScrollView gốc) */
    bg: dark ? "#0b1020" : "#f8fafc",
    /** nền thẻ / header / sheet */
    card: dark ? "#141b2d" : "#ffffff",
    /** nền input / chip / hàng nhấn */
    field: dark ? "rgba(255,255,255,0.06)" : "#f1f5f9",
    /** nền thẻ phụ (surface alt) */
    cardAlt: dark ? "#1a2238" : "#f8fafc",
    /** khi Pressable nhấn */
    pressed: dark ? "rgba(255,255,255,0.08)" : "#f1f5f9",
    border: dark ? "rgba(255,255,255,0.08)" : "#e2e8f0",
    /** đường kẻ đậm hơn border (skeleton, track) */
    line: dark ? "rgba(255,255,255,0.14)" : "#cbd5e1",
    text: dark ? "#f1f5f9" : "#0f172a",
    /** text phụ đậm (#334155) */
    text2: dark ? "#cbd5e1" : "#334155",
    /** text phụ vừa (#475569) */
    text3: dark ? "#a8b3c4" : "#475569",
    sub: dark ? "#94a3b8" : "#64748b",
    muted: dark ? "#64748b" : "#94a3b8",
    /** nền overlay modal */
    overlay: dark ? "rgba(0,0,0,0.6)" : "rgba(15,23,42,0.45)",
    /** màu icon/tint xanh brand feed */
    primary: "#0066FF",
    primarySoft: dark ? "rgba(0,102,255,0.18)" : "#EFF6FF",
    /** hàng chưa đọc (thông báo) */
    unreadBg: dark ? "rgba(0,102,255,0.12)" : "#F0F7FF",
    amberSoft: dark ? "rgba(245,158,11,0.16)" : "#FEF3C7",
    amberText: dark ? "#fbbf24" : "#B45309",
    greenSoft: dark ? "rgba(34,197,94,0.16)" : "#DCFCE7",
    greenText: dark ? "#4ade80" : "#15803D",
    redSoft: dark ? "rgba(239,68,68,0.16)" : "#FEE2E2",
    redText: dark ? "#f87171" : "#B91C1C",
    purpleSoft: dark ? "rgba(124,58,237,0.18)" : "#F3E8FF",
    /** màu chữ trên nền màu (nút xanh/đỏ…) — luôn trắng */
    onPrimary: "#ffffff",
    /** StatusBar style */
    statusBar: (dark ? "light" : "dark") as "light" | "dark",
  };
};

export type ThemeTokens = ReturnType<typeof themeTokens>;

export function useThemeTokens(): ThemeTokens {
  const { dark } = useTheme();
  return useMemo(() => themeTokens(!!dark), [dark]);
}

export default useThemeTokens;
