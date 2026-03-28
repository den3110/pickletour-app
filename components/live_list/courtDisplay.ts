const textOf = (value: any): string => {
  if (value == null) return "";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value).trim();
  }
  if (typeof value === "object") {
    return String(value.name || value.label || value.title || "").trim();
  }
  return "";
};

export function getLiveMatchCourtParts(match: any = {}) {
  const station = textOf(
    match?.courtStationName ||
      match?.courtStationLabel ||
      match?.courtName ||
      match?.court?.name ||
      match?.court?.label ||
      match?.court?.title
  );
  const cluster = textOf(
    match?.courtClusterName ||
      match?.courtClusterLabel ||
      match?.courtCluster ||
      match?.court?.cluster
  );
  const legacy = textOf(match?.courtLabel);

  const stationName = station || legacy;
  const clusterName =
    cluster && cluster.toLowerCase() !== stationName.toLowerCase() ? cluster : "";

  return {
    cluster: clusterName,
    station: stationName,
  };
}

export function getLiveMatchCourtText(match: any = {}) {
  const { cluster, station } = getLiveMatchCourtParts(match);
  if (cluster && station) return `${cluster} · ${station}`;
  return cluster || station || "";
}
