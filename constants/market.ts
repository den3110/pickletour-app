// constants/market.ts — nhãn / helper dùng chung cho Chợ (mobile)

export const CATEGORIES = [
  { key: "shoes", label: "Giày", emoji: "👟" },
  { key: "paddle", label: "Vợt", emoji: "🏓" },
  { key: "balls", label: "Bóng", emoji: "🎾" },
  { key: "apparel", label: "Quần áo", emoji: "👕" },
  { key: "bag", label: "Túi / Balo", emoji: "🎒" },
  { key: "accessory", label: "Phụ kiện", emoji: "🧢" },
  { key: "other", label: "Khác", emoji: "📦" },
] as const;

export const CONDITIONS = [
  { key: "new", label: "Mới 100%", color: "#16a34a" },
  { key: "like_new", label: "Như mới", color: "#0ea5e9" },
  { key: "good", label: "Tốt", color: "#2563eb" },
  { key: "fair", label: "Khá", color: "#d97706" },
  { key: "used", label: "Đã dùng nhiều", color: "#6b7280" },
] as const;

export const TYPES = [
  { key: "sell", label: "Bán", emoji: "💰", color: "#2563eb" },
  { key: "trade", label: "Trao đổi", emoji: "🔄", color: "#7c3aed" },
  { key: "giveaway", label: "Cho tặng", emoji: "🎁", color: "#db2777" },
] as const;

export const STATUSES = [
  { key: "available", label: "Đang bán", color: "#16a34a" },
  { key: "reserved", label: "Giữ chỗ", color: "#d97706" },
  { key: "sold", label: "Đã bán", color: "#6b7280" },
  { key: "hidden", label: "Đã ẩn", color: "#9ca3af" },
] as const;

export const SORTS = [
  { key: "newest", label: "Mới nhất" },
  { key: "price_asc", label: "Giá thấp → cao" },
  { key: "price_desc", label: "Giá cao → thấp" },
  { key: "popular", label: "Xem nhiều" },
] as const;

const toMap = (arr: readonly any[]) =>
  Object.fromEntries(arr.map((x) => [x.key, x])) as Record<string, any>;
export const CATEGORY_MAP = toMap(CATEGORIES);
export const CONDITION_MAP = toMap(CONDITIONS);
export const TYPE_MAP = toMap(TYPES);
export const STATUS_MAP = toMap(STATUSES);

export function formatPrice(v: number, type?: string) {
  if (type === "giveaway") return "Miễn phí";
  if (type === "trade" && (!v || v <= 0)) return "Trao đổi";
  if (!v || v <= 0) return "Thương lượng";
  try {
    return new Intl.NumberFormat("vi-VN").format(v) + " ₫";
  } catch {
    return v + " ₫";
  }
}

export function priceRangeLabel(item: any) {
  if (item?.hasVariants && item.variants?.length) {
    const prices = item.variants.map((v: any) => v.price).filter((p: number) => p > 0);
    if (!prices.length) return "Thương lượng";
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    if (min === max) return formatPrice(min, item.type);
    return `${formatPrice(min, item.type)} – ${formatPrice(max, item.type)}`;
  }
  return formatPrice(item?.price, item?.type);
}

export function timeAgo(dateStr?: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr).getTime();
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return "vừa xong";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const day = Math.floor(h / 24);
  if (day < 30) return `${day} ngày trước`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo} tháng trước`;
  return `${Math.floor(mo / 12)} năm trước`;
}

export function firstImage(item: any): string {
  const im = item?.images?.[0];
  if (!im) return "";
  return typeof im === "string" ? im : im.url || "";
}
