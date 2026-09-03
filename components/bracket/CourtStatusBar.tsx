// components/bracket/CourtStatusBar.tsx
// Panel tình trạng sân (chỉ xem) cho admin/quản lý trên màn Sơ đồ giải mobile.
// Hỗ trợ cụm sân (court-live-monitor) + fallback sân phẳng cũ.
import React, { useMemo, useState } from "react";
import {
  View,
  TouchableOpacity,
} from "react-native";
import { Text } from "@/components/ui/i18nText";
import { Ionicons } from "@expo/vector-icons";
import { useGetTournamentCourtLiveMonitorQuery } from "@/slices/courtClustersAdminApiSlice";
import { useAdminListCourtsQuery } from "@/slices/adminCourtApiSlice";

const OCCUPIED = new Set(["assigned", "live", "playing", "busy"]);
const matchLabel = (cm: any) =>
  cm?.code || cm?.matchCode || cm?.roundLabel || cm?.roundName || "Đang thi đấu";

export default function CourtStatusBar({ tournamentId, enabled, t }: any) {
  const [open, setOpen] = useState(true);

  const { data: monitor } = useGetTournamentCourtLiveMonitorQuery(
    { tournamentId },
    { skip: !enabled || !tournamentId, pollingInterval: 20000 },
  );
  const stations = Array.isArray(monitor?.stations) ? monitor.stations : [];

  const { data: legacy } = useAdminListCourtsQuery(
    { tid: tournamentId, limit: 200 },
    {
      skip: !enabled || !tournamentId || stations.length > 0,
      pollingInterval: 20000,
    },
  );

  const list = useMemo(() => {
    if (stations.length) {
      return stations.map((s: any) => ({
        id: s?._id,
        name: s?.name || s?.clusterName || "Sân",
        occupied: Boolean(s?.currentMatch) || OCCUPIED.has(s?.status),
        detail: s?.currentMatch
          ? matchLabel(s.currentMatch)
          : s?.status === "maintenance"
            ? "Bảo trì"
            : "Trống",
      }));
    }
    const arr = Array.isArray(legacy)
      ? legacy
      : (legacy as any)?.items || (legacy as any)?.courts || [];
    return (arr || []).map((c: any) => ({
      id: c?._id || c?.id,
      name: c?.name || c?.label || "Sân",
      occupied: Boolean(c?.currentMatch),
      detail: c?.currentMatch ? matchLabel(c.currentMatch) : "Trống",
    }));
  }, [stations, legacy]);

  const idle = list.filter((c: any) => !c.occupied);
  const busy = list.filter((c: any) => c.occupied);

  if (!enabled || !tournamentId || !list.length) return null;

  const green = t?.success || "#16a34a";
  const amber = "#f59e0b";

  return (
    <View
      style={{
        marginHorizontal: 12,
        marginTop: 8,
        marginBottom: 4,
        padding: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: t?.colors?.border || "#e4e8ef",
        backgroundColor: t?.colors?.card || "#fff",
      }}
    >
      <TouchableOpacity
        onPress={() => setOpen((o) => !o)}
        style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}
      >
        <Ionicons
          name="tennisball-outline"
          size={16}
          color={t?.colors?.primary || "#0a84ff"}
        />
        <Text
          style={{
            fontWeight: "800",
            color: t?.colors?.text || "#111",
            fontSize: 13,
            marginLeft: 6,
          }}
        >
          Tình trạng sân
        </Text>
        <View
          style={{
            marginLeft: 8,
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: green,
          }}
        >
          <Text style={{ color: green, fontSize: 11, fontWeight: "700" }}>
            {idle.length} trống
          </Text>
        </View>
        <View
          style={{
            marginLeft: 6,
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: amber,
          }}
        >
          <Text style={{ color: amber, fontSize: 11, fontWeight: "700" }}>
            {busy.length} đang dùng
          </Text>
        </View>
        <View style={{ flex: 1 }} />
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={16}
          color={t?.subtext || "#555"}
        />
      </TouchableOpacity>

      {open && (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 6,
            marginTop: 8,
          }}
        >
          {[...idle, ...busy].map((c: any, i: number) => (
            <View
              key={c.id || i}
              style={{
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 10,
                backgroundColor: c.occupied ? amber : "transparent",
                borderWidth: 1,
                borderColor: c.occupied ? amber : green,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "600",
                  color: c.occupied ? "#fff" : green,
                }}
              >
                {c.name} · {c.detail}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
