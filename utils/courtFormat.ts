// utils/courtFormat.ts — helper hiển thị cho đặt sân (mobile)
const tz = { timeZone: "Asia/Ho_Chi_Minh" as const };

export const fmtVND = (n: any) => `${(Number(n) || 0).toLocaleString("vi-VN")}đ`;

export const tLabel = (iso: any) =>
  iso ? new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", ...tz }) : "";
export const dLabel = (iso: any) =>
  iso ? new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", ...tz }) : "";
export const dtLabel = (iso: any) => (iso ? `${dLabel(iso)} ${tLabel(iso)}` : "");

const pad2 = (n: number) => String(n).padStart(2, "0");
const isDateStr = (s: any) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));

/** YYYY-MM-DD theo giờ VN (UTC+7) — tính bằng số học, KHÔNG dùng Intl
 *  (Intl.formatToParts với timeZone không ổn định trên một số bản Hermes). */
export function toDateInput(d: Date = new Date()) {
  const vn = new Date(d.getTime() + 7 * 3600 * 1000);
  return `${vn.getUTCFullYear()}-${pad2(vn.getUTCMonth() + 1)}-${pad2(vn.getUTCDate())}`;
}
export function addDays(dateStr: string, n: number) {
  const base = isDateStr(dateStr) ? dateStr : toDateInput();
  const [y, m, d] = base.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d) + n * 86400000);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}
export const WEEKDAYS_SHORT = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
export function weekdayOf(dateStr: string) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? 0 : d.getUTCDay();
}

export const BOOKING_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: "Chờ thanh toán", color: "#f59e0b" },
  awaiting_approval: { label: "Chờ duyệt bill", color: "#38bdf8" },
  confirmed: { label: "Đã xác nhận", color: "#22c55e" },
  cancelled: { label: "Đã huỷ", color: "#94a3b8" },
  completed: { label: "Hoàn tất", color: "#6366f1" },
  no_show: { label: "Không đến", color: "#ef4444" },
};

export const pal = (dark: boolean) => ({
  dark,
  bg: dark ? "#0b1020" : "#f4f6fb",
  card: dark ? "#141b2d" : "#ffffff",
  cardAlt: dark ? "#1a2238" : "#f8fafc",
  border: dark ? "rgba(255,255,255,0.07)" : "rgba(15,23,42,0.06)",
  text: dark ? "#f8fafc" : "#0f172a",
  sub: dark ? "#94a3b8" : "#64748b",
  muted: dark ? "#64748b" : "#94a3b8",
  field: dark ? "rgba(255,255,255,0.06)" : "#f1f5f9",
  accent: "#22c1d6",
  accentSoft: dark ? "rgba(34,193,214,0.16)" : "rgba(34,193,214,0.12)",
  gold: "#f5b301",
  success: "#22c55e",
  warning: "#f59e0b",
  danger: "#ef4444",
  info: "#38bdf8",
  onAccent: "#06111f",
  // gradient hero dùng chung (navy → teal sâu) — đẹp ở cả sáng/tối
  heroGrad: ["#0f172a", "#134e5e"] as [string, string],
  heroGradAlt: ["#0f172a", "#1e3a8a"] as [string, string],
});

// Nhãn + icon thời tiết theo WMO weather_code (open-meteo). Trả { icon (Ionicons), label }.
export function weatherLabel(code?: number): { icon: string; label: string } {
  const c = Number(code);
  if (c === 0) return { icon: "sunny", label: "Trời quang" };
  if (c === 1 || c === 2) return { icon: "partly-sunny", label: "Ít mây" };
  if (c === 3) return { icon: "cloudy", label: "Nhiều mây" };
  if (c === 45 || c === 48) return { icon: "cloud", label: "Sương mù" };
  if (c >= 51 && c <= 57) return { icon: "rainy", label: "Mưa phùn" };
  if (c >= 61 && c <= 67) return { icon: "rainy", label: "Mưa" };
  if (c >= 71 && c <= 77) return { icon: "snow", label: "Tuyết" };
  if (c >= 80 && c <= 82) return { icon: "rainy", label: "Mưa rào" };
  if (c >= 95) return { icon: "thunderstorm", label: "Giông bão" };
  return { icon: "partly-sunny", label: "—" };
}
