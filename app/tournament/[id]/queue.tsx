import { t } from "@/utils/i18n";
// Màn hình HÀNG ĐỢI SÂN (mobile) — mỗi sân: trận đang đánh + trận kế tiếp.
import React, { useMemo } from "react";
import {
  ScrollView,
  View,
  RefreshControl,
} from "react-native";
import { Text } from "@/components/ui/i18nText";
import { Stack, useLocalSearchParams } from "expo-router";
import { useTheme } from "@react-navigation/native";
import {
  useGetTournamentQuery,
  useListPublicMatchesByTournamentQuery,
} from "@/slices/tournamentsApiSlice";
import {
  getPairDisplayName,
  getSeedDisplayName,
} from "@/utils/matchDisplay";

const LIVE = "live";
const FINISHED = "finished";

function sideName(m: any, side: "A" | "B") {
  const pair = side === "A" ? m?.pairA : m?.pairB;
  if (pair) return getPairDisplayName(pair, m?.tournament) || "—";
  const seed = side === "A" ? m?.seedA : m?.seedB;
  if (seed) return getSeedDisplayName(seed, m) || "—";
  const prev = side === "A" ? m?.previousA : m?.previousB;
  if (prev) return `Thắng ${prev.code || `V${prev.round || "?"}`}`;
  return "—";
}

function courtNoOf(m: any) {
  if (Number(m?.autoCourtNo) > 0) return Number(m.autoCourtNo);
  if (m?.court && Number.isFinite(Number(m.court.order)))
    return Number(m.court.order) + 1;
  return null;
}

function fmtTime(ts: any) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function normalizeMatches(resp: any) {
  const raw = Array.isArray(resp)
    ? resp
    : resp?.items || resp?.list || resp?.matches || [];
  return raw.filter((m: any) => m && m.status !== FINISHED);
}

export default function TournamentCourtQueueMobile() {
  const params = useLocalSearchParams();
  const id = String(Array.isArray(params.id) ? params.id[0] : params.id || "");
  const theme: any = useTheme();
  const C = theme.colors;

  const { data: tournament } = useGetTournamentQuery(id);
  const { data: matchesResp, isFetching, refetch } =
    useListPublicMatchesByTournamentQuery(
      { tid: id },
      { pollingInterval: 20000 },
    );

  const courts = useMemo(() => {
    const matches = normalizeMatches(matchesResp);
    const map = new Map<number, { current: any; upcoming: any[] }>();
    let maxNo = 0;
    for (const m of matches) {
      const no = courtNoOf(m);
      if (!no) continue;
      maxNo = Math.max(maxNo, no);
      if (!map.has(no)) map.set(no, { current: null, upcoming: [] });
      const slot = map.get(no)!;
      if (m.status === LIVE) {
        if (!slot.current) slot.current = m;
        else slot.upcoming.push(m);
      } else slot.upcoming.push(m);
    }
    const list: any[] = [];
    for (let no = 1; no <= maxNo; no += 1) {
      const slot = map.get(no) || { current: null, upcoming: [] };
      slot.upcoming.sort(
        (a: any, b: any) =>
          new Date(a.scheduledAt || 0).getTime() -
          new Date(b.scheduledAt || 0).getTime(),
      );
      list.push({ no, ...slot });
    }
    return list;
  }, [matchesResp]);

  const border = C.border || "#e2e8ec";
  const cardBg = C.card || "#fff";
  const textPrimary = C.text || "#0f172a";
  const muted = "#94a3b8";

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <Stack.Screen options={{ title: t("Hàng đợi sân") }} />
      <ScrollView
        contentContainerStyle={{ padding: 12, gap: 12 }}
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={refetch} />
        }
      >
        <Text style={{ color: muted, fontSize: 13 }} numberOfLines={1}>
          {tournament?.name || "Giải đấu"}
        </Text>

        {courts.length === 0 ? (
          <View style={{ paddingVertical: 60, alignItems: "center" }}>
            <Text style={{ color: muted, fontWeight: "700", fontSize: 16 }}>
              Chưa có lịch sân.
            </Text>
            <Text style={{ color: muted, marginTop: 6, textAlign: "center" }}>
              BTC hãy bấm "Tự động xếp giờ" ở Lịch đấu để tạo hàng đợi sân.
            </Text>
          </View>
        ) : (
          courts.map((c) => {
            const cur = c.current;
            const nexts = c.upcoming.slice(0, 3);
            return (
              <View
                key={c.no}
                style={{
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: border,
                  backgroundColor: cardBg,
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    backgroundColor: "#1877F2",
                  }}
                >
                  <Text
                    style={{ color: "#fff", fontWeight: "900", fontSize: 17 }}
                  >
                    Sân {c.no}
                  </Text>
                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 3,
                      borderRadius: 999,
                      backgroundColor: cur ? "#E5484D" : "rgba(255,255,255,0.2)",
                    }}
                  >
                    <Text
                      style={{ color: "#fff", fontWeight: "800", fontSize: 11 }}
                    >
                      {cur ? "ĐANG ĐÁNH" : "Trống"}
                    </Text>
                  </View>
                </View>

                <View style={{ padding: 14 }}>
                  {cur ? (
                    <MatchLine m={cur} big textPrimary={textPrimary} muted={muted} />
                  ) : (
                    <Text style={{ color: muted }}>Chưa có trận đang đánh</Text>
                  )}

                  <Text
                    style={{
                      color: muted,
                      fontSize: 12,
                      fontWeight: "800",
                      textTransform: "uppercase",
                      marginTop: 14,
                      marginBottom: 8,
                    }}
                  >
                    Kế tiếp
                  </Text>
                  {nexts.length === 0 ? (
                    <Text style={{ color: muted }}>Không còn trận.</Text>
                  ) : (
                    <View style={{ gap: 10 }}>
                      {nexts.map((m: any) => (
                        <MatchLine
                          key={m._id}
                          m={m}
                          textPrimary={textPrimary}
                          muted={muted}
                        />
                      ))}
                    </View>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

function MatchLine({
  m,
  big = false,
  textPrimary,
  muted,
}: {
  m: any;
  big?: boolean;
  textPrimary: string;
  muted: string;
}) {
  const a = sideName(m, "A");
  const b = sideName(m, "B");
  const time = fmtTime(m?.scheduledAt);
  const code = m?.code || "";
  return (
    <View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 4,
        }}
      >
        <Text style={{ color: muted, fontSize: 11, fontWeight: "700" }}>
          {code || "Trận"}
        </Text>
        {time ? (
          <Text style={{ color: "#2563EB", fontSize: 12, fontWeight: "800" }}>
            {time}
          </Text>
        ) : null}
      </View>
      <Text
        style={{
          color: textPrimary,
          fontWeight: big ? "800" : "700",
          fontSize: big ? 16 : 14,
        }}
        numberOfLines={1}
      >
        {a}
      </Text>
      <Text style={{ color: muted, fontSize: 11, marginVertical: 1 }}>vs</Text>
      <Text
        style={{
          color: textPrimary,
          fontWeight: big ? "800" : "700",
          fontSize: big ? 16 : 14,
        }}
        numberOfLines={1}
      >
        {b}
      </Text>
    </View>
  );
}
