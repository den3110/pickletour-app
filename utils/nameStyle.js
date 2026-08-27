// utils/nameStyle.js — Hiệu ứng tên hiển thị (đồng bộ với backend/utils/nameStyle.js).
// Mobile: solid -> Text màu; gradient -> vẽ bằng react-native-svg (PlayerNameText).

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const isHex = (v) => typeof v === "string" && HEX_RE.test(v.trim());

/** Chuẩn hoá object nameStyle -> dạng an toàn, hoặc null nếu không có hiệu ứng. */
export function normalizeNameStyle(ns) {
  if (!ns || typeof ns !== "object") return null;
  const effect = ns.effect;
  if (!effect || effect === "none") return null;

  if (effect === "solid") {
    const color = isHex(ns.color)
      ? ns.color.trim()
      : Array.isArray(ns.colors) && isHex(ns.colors[0])
        ? ns.colors[0].trim()
        : "";
    if (!color) return null;
    return { effect: "solid", color, bold: !!ns.bold };
  }

  if (effect === "gradient") {
    const colors = (Array.isArray(ns.colors) ? ns.colors : [])
      .filter(isHex)
      .map((c) => c.trim())
      .slice(0, 7);
    if (colors.length < 2) {
      return colors.length === 1
        ? { effect: "solid", color: colors[0], bold: !!ns.bold }
        : null;
    }
    return {
      effect: "gradient",
      colors,
      angle: Number.isFinite(+ns.angle) ? +ns.angle : 90,
      animated: !!ns.animated,
      speed: Number.isFinite(+ns.speed) ? Math.min(30, Math.max(1, +ns.speed)) : 6,
      bold: !!ns.bold,
    };
  }
  return null;
}

export function hasNameEffect(ns) {
  return !!normalizeNameStyle(ns);
}

const norm = (s) => String(s || "").trim().toLowerCase();

/**
 * Tra cứu hiệu ứng tên cho một đối tượng render.
 * @param {{byId:Object, byNick:Object}} map  bản đồ từ /api/name-styles
 * @param {Object} target  user/player object
 * @param {{nickname?:string, name?:string}} [extra]
 */
export function resolveNameStyle(map, target, extra) {
  const inline =
    normalizeNameStyle(target?.nameStyle) ||
    normalizeNameStyle(target?.user?.nameStyle);
  if (inline) return inline;

  if (!map) return null;
  const byId = map.byId || {};
  const byNick = map.byNick || {};

  const idCandidates = [
    target?._id,
    target?.id,
    typeof target?.user === "string" ? target.user : null,
    target?.user?._id,
    target?.user?.id,
  ];
  for (const id of idCandidates) {
    if (id && byId[String(id)]) return normalizeNameStyle(byId[String(id)]);
  }

  const nickCandidates = [
    target?.nickname,
    target?.nickName,
    target?.nick,
    target?.user?.nickname,
    target?.user?.nickName,
    extra?.nickname,
    extra?.name,
  ];
  for (const nk of nickCandidates) {
    const key = norm(nk);
    if (key && byNick[key]) return normalizeNameStyle(byNick[key]);
  }
  return null;
}

/** Góc (deg, chuẩn CSS: 0=lên trên, 90=sang phải) -> toạ độ x1,y1,x2,y2 (0..1) cho SVG. */
export function angleToSvgVector(angle) {
  const rad = ((Number(angle) || 90) - 90) * (Math.PI / 180);
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  return {
    x1: 0.5 - dx / 2,
    y1: 0.5 - dy / 2,
    x2: 0.5 + dx / 2,
    y2: 0.5 + dy / 2,
  };
}
