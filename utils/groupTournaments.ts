// Gom nhóm giải cùng "sự kiện": cùng TÊN GỐC (trước "•"/"-", chỉ khác nội dung)
// HOẶC cùng CỤM SÂN (location) trong ~2 ngày. Union-find phía client.

function foldStr(s: any): string {
  return String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function baseNameOf(name: any): string {
  const s = String(name || "").trim();
  const parts = s.split(/\s+[•·]\s+|\s+[-–—]\s+/);
  return (parts[0] || s).trim();
}

export function subLabelOf(name: any, base: any): string {
  const s = String(name || "").trim();
  const b = String(base || "").trim();
  if (b && s.toLowerCase().startsWith(b.toLowerCase())) {
    return s.slice(b.length).replace(/^[\s•·\-–—|]+/, "").trim();
  }
  const parts = s.split(/\s+[•·]\s+|\s+[-–—]\s+/);
  return parts.length > 1 ? parts.slice(1).join(" · ").trim() : "";
}

function dayNum(t: any): number {
  const d = new Date(t?.startDate || t?.startAt || t?.createdAt || 0);
  const ms = d.getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 86400000) : 0;
}

export type TGroup = { key: string; title: string; items: any[]; isGroup: boolean };

export function groupTournaments(list: any[]): TGroup[] {
  const arr = Array.isArray(list) ? list : [];
  const n = arr.length;
  if (n <= 1) {
    return arr.map((t) => ({
      key: String(t?._id || Math.random()),
      title: baseNameOf(t?.name),
      items: [t],
      isGroup: false,
    }));
  }
  const parent = arr.map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  const base = arr.map((t) => foldStr(baseNameOf(t?.name)));
  const loc = arr.map((t) => foldStr(t?.location));
  const day = arr.map(dayNum);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sameName = base[i] && base[i] === base[j];
      const sameVenueClose =
        loc[i] && loc[i] === loc[j] && Math.abs(day[i] - day[j]) <= 2;
      if (sameName || sameVenueClose) union(i, j);
    }
  }
  const order: number[] = [];
  const map = new Map<number, any[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!map.has(r)) {
      map.set(r, []);
      order.push(r);
    }
    map.get(r)!.push(arr[i]);
  }
  return order.map((r) => {
    const items = map.get(r)!;
    return { key: String(items[0]?._id || r), title: groupTitle(items), items, isGroup: items.length > 1 };
  });
}

function groupTitle(items: any[]): string {
  if (!items?.length) return "";
  const counts = new Map<string, number>();
  for (const t of items) {
    const b = baseNameOf(t?.name);
    counts.set(b, (counts.get(b) || 0) + 1);
  }
  let best = "";
  let bestC = -1;
  for (const [b, c] of counts) {
    if (c > bestC) {
      best = b;
      bestC = c;
    }
  }
  return best || baseNameOf(items[0]?.name);
}

export function groupStatus(items: any[]): string {
  if (items.some((x) => x?.status === "ongoing")) return "ongoing";
  if (items.some((x) => x?.status === "upcoming")) return "upcoming";
  return "finished";
}
