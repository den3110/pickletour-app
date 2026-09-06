// utils/courtFormat.ts — helper hiển thị cho đặt sân (mobile)
const tz = { timeZone: "Asia/Ho_Chi_Minh" as const };

export const fmtVND = (n: any) => `${(Number(n) || 0).toLocaleString("vi-VN")}đ`;

export const tLabel = (iso: any) =>
  iso ? new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", ...tz }) : "";
export const dLabel = (iso: any) =>
  iso ? new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", ...tz }) : "";
export const dtLabel = (iso: any) => (iso ? `${dLabel(iso)} ${tLabel(iso)}` : "");

/** YYYY-MM-DD theo giờ VN. */
export function toDateInput(d: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const m: Record<string, string> = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${m.year}-${m.month}-${m.day}`;
}
export function addDays(dateStr: string, n: number) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d) + n * 86400000);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
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
