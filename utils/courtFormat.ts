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
  bg: dark ? "#0a0e1a" : "#f5f7fb",
  card: dark ? "#121829" : "#ffffff",
  border: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
  text: dark ? "#f8fafc" : "#0f172a",
  sub: dark ? "#94a3b8" : "#64748b",
  field: dark ? "rgba(255,255,255,0.06)" : "#f1f5f9",
  accent: "#4dd0e1",
});
