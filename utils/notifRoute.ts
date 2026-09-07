// utils/notifRoute.ts — Chuyển URL thông báo (kiểu web) sang route hợp lệ của app mobile (expo-router).
// Backend phát URL theo chuẩn web; mobile cần map lại để bấm vào không bị 404.
// Trả về path dạng chuỗi đã điền id (router.push chấp nhận), hoặc null.

const qGet = (query: string, key: string) => {
  for (const part of (query || "").split("&")) {
    const [k, v] = part.split("=");
    if (decodeURIComponent(k || "") === key) return decodeURIComponent(v || "");
  }
  return "";
};

export function normalizeNotifUrl(url?: string): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url; // link ngoài
  const [pathRaw, query = ""] = url.split("?");
  const path = pathRaw.replace(/\/+$/, "") || "/";

  // Lượt đặt của khách: /my-bookings?booking=ID → chi tiết đơn; không id → danh sách
  if (path === "/my-bookings" || path === "/courts/my-bookings") {
    const bid = qGet(query, "booking");
    return bid ? `/courts/booking/${bid}` : "/courts/my-bookings";
  }
  if (path === "/courts/booking") {
    const bid = qGet(query, "booking") || qGet(query, "id");
    if (bid) return `/courts/booking/${bid}`;
  }

  // Gói của khách
  if (path === "/my-packages" || path === "/courts/my-packages") return "/courts/my-packages";

  // Quản lý cụm sân (web: /owner/venues/:id[/bookings|/revenue...]) → hub mobile /owner/venue/:id
  let m = path.match(/^\/owner\/venues\/([^/]+)(?:\/[a-z-]+)?$/i);
  if (m) return `/owner/venue/${m[1]}`;

  // Đã đúng dạng mobile
  if (/^\/owner\/venue\/[^/]+/.test(path) || path === "/owner") return url;

  // Chi tiết cụm sân công khai: /courts/:id (loại trừ trang tĩnh)
  m = path.match(/^\/courts\/([^/]+)$/);
  if (m && !["my-bookings", "my-packages"].includes(m[1])) return `/courts/${m[1]}`;

  return url; // feed/chat/market/play... đã hợp lệ sẵn
}
