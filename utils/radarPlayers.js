export function filterAndSortPlayers({
  players = [],
  searchText = "",
  playTypeFilter = "any",
  radiusKm = 0,
  sortKey = "distance",
}) {
  const q = String(searchText || "")
    .trim()
    .toLowerCase();
  const maxMeters = radiusKm > 0 ? radiusKm * 1000 : Infinity;

  let out = (players || []).filter((p) => {
    // radius filter (nếu có distance)
    const d = typeof p.distance === "number" ? p.distance : 0;
    if (d > maxMeters) return false;

    // playType filter (nếu sau này có p.playType)
    if (playTypeFilter !== "any" && p.playType && p.playType !== playTypeFilter)
      return false;

    // search
    if (!q) return true;
    const hay = `${p.displayName || ""} ${p.mainClubName || ""} ${
      p.statusMessage || ""
    }`.toLowerCase();
    return hay.includes(q);
  });

  out.sort((a, b) => {
    if (sortKey === "score") return (b.score || 0) - (a.score || 0);
    if (sortKey === "rating") return (b.rating || 0) - (a.rating || 0);
    // distance
    return (a.distance ?? 999999999) - (b.distance ?? 999999999);
  });

  return out;
}
