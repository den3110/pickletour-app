// constants/play.ts — helper hiển thị "Tìm bạn đánh" (mobile)

export const PLAY_STATUS: Record<string, { label: string; color: string }> = {
  open: { label: "Đang mở", color: "#16a34a" },
  full: { label: "Đủ người", color: "#d97706" },
  closed: { label: "Đã đóng", color: "#6b7280" },
  cancelled: { label: "Đã huỷ", color: "#9ca3af" },
  done: { label: "Đã diễn ra", color: "#6b7280" },
};

const WD = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

export function formatPlayTime(dateStr?: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${WD[d.getDay()]} ${p(d.getHours())}:${p(d.getMinutes())} · ${p(d.getDate())}/${p(d.getMonth() + 1)}`;
}

export function skillLabel(min?: number | null, max?: number | null) {
  const hasMin = min != null && (min as any) !== "";
  const hasMax = max != null && (max as any) !== "";
  if (!hasMin && !hasMax) return "Mọi trình";
  if (hasMin && hasMax) return `Trình ${min}–${max}`;
  if (hasMin) return `Trình ≥ ${min}`;
  return `Trình ≤ ${max}`;
}
