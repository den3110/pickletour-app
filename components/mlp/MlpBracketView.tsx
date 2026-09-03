// MLP Bracket view — thay thế bracket chuẩn khi tournament.tournamentMode === "mlp".
// Hiển thị: BXH ngắn + danh sách dual matches (theo round) + status DreamBreaker.
import React, { useMemo } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "@/components/ui/i18nText";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import {
  useListMlpDualsQuery,
  useListMlpStandingsQuery,
  useListMlpTeamsQuery,
} from "@/slices/mlpApiSlice";
import { normalizeUrl } from "@/utils/normalizeUri";

type MlpBracketViewProps = {
  tourId: string;
  tour?: any;
};

export default function MlpBracketView({ tourId, tour }: MlpBracketViewProps) {
  const {
    data: dualsResp,
    isLoading: dLoading,
    refetch: refetchDuals,
  } = useListMlpDualsQuery(
    { tourId },
    { skip: !tourId, refetchOnFocus: true },
  );
  const { data: standingsResp, isLoading: sLoading } =
    useListMlpStandingsQuery(tourId, { skip: !tourId, refetchOnFocus: true });
  const { data: teamsResp, isLoading: tLoading } = useListMlpTeamsQuery(
    { tourId, status: "approved" },
    { skip: !tourId, refetchOnFocus: true },
  );

  const duals = useMemo(
    () => (Array.isArray(dualsResp?.items) ? dualsResp.items : []),
    [dualsResp?.items],
  );
  const standings = useMemo(
    () => (Array.isArray(standingsResp?.items) ? standingsResp.items : []),
    [standingsResp?.items],
  );
  const teams = useMemo(
    () => (Array.isArray(teamsResp?.items) ? teamsResp.items : []),
    [teamsResp?.items],
  );

  // Group duals theo phase + poolKey / knockoutRound
  const grouped = useMemo(() => {
    const g = {
      group: new Map<string, any[]>(),
      knockout: new Map<number, any[]>(),
      legacy: new Map<number, any[]>(),
    };
    duals.forEach((d: any) => {
      if (d.phase === "group") {
        const k = d.poolKey || "?";
        if (!g.group.has(k)) g.group.set(k, []);
        g.group.get(k)!.push(d);
      } else if (d.phase === "knockout") {
        const r = d.knockoutRound || 1;
        if (!g.knockout.has(r)) g.knockout.set(r, []);
        g.knockout.get(r)!.push(d);
      } else {
        const r = Number(d?.round || 1);
        if (!g.legacy.has(r)) g.legacy.set(r, []);
        g.legacy.get(r)!.push(d);
      }
    });
    return g;
  }, [duals]);

  const dualsByRound = useMemo(() => {
    const rounds = Array.from(grouped.legacy.keys()).sort((a, b) => a - b);
    return rounds.map((r) => ({
      round: r,
      items: (grouped.legacy.get(r) || []).sort(
        (a: any, b: any) => Number(a?.order || 0) - Number(b?.order || 0),
      ),
    }));
  }, [grouped]);

  const koRounds = useMemo(() => {
    const rounds = Array.from(grouped.knockout.keys()).sort((a, b) => a - b);
    return rounds.map((r) => ({
      round: r,
      items: (grouped.knockout.get(r) || []).sort(
        (a: any, b: any) => Number(a?.order || 0) - Number(b?.order || 0),
      ),
    }));
  }, [grouped]);

  const poolsStandings = (standingsResp as any)?.pools || null;
  const gs = tour?.mlpConfig?.groupStage || null;
  const useGroupStage = gs?.enabled === true;
  const koLabel = (r: number, total: number) => {
    const remaining = total - r + 1;
    if (remaining === 1) return "Chung kết";
    if (remaining === 2) return "Bán kết";
    if (remaining === 3) return "Tứ kết";
    return `Vòng ${r}`;
  };

  if (dLoading || sLoading || tLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const goToTeams = () => router.push(`/tournament/${tourId}/mlp/teams`);
  const goToDuals = () => router.push(`/tournament/${tourId}/mlp/duals`);
  const goToStandings = () => router.push(`/tournament/${tourId}/mlp/standings`);
  const openDual = (dl: any) => {
    if (!dl?.teamA && !dl?.teamB) return;
    router.push(`/tournament/${tourId}/mlp/dual/${dl._id}`);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={styles.mlpBadge}>
          <Ionicons name="shield-checkmark" size={14} color="#B45309" />
          <Text style={styles.mlpBadgeText}>MLP Format</Text>
        </View>
        <Text style={styles.summaryTxt} numberOfLines={1}>
          {teams.length} team · {duals.length} dual match
        </Text>
      </View>

      {/* Nav shortcuts */}
      <View style={styles.navRow}>
        <NavChip icon="people" label="Teams" onPress={goToTeams} color="#3B82F6" />
        <NavChip icon="trophy" label="BXH" onPress={goToStandings} color="#10B981" />
        <NavChip icon="grid" label="Duals" onPress={goToDuals} color="#F59E0B" />
      </View>

      {useGroupStage && (
        <View style={styles.mlpBadge}>
          <Text style={styles.mlpBadgeText}>
            Vòng bảng + Knockout — Top {gs?.topPerPool || 2}/bảng qua KO
          </Text>
        </View>
      )}

      {/* Group stage pools view */}
      {useGroupStage && poolsStandings && poolsStandings.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📊 Vòng bảng</Text>
          {poolsStandings.map((p: any) => (
            <View key={p.key} style={styles.poolBox}>
              <View style={styles.poolHead}>
                <Text style={styles.poolTitle}>Bảng {p.key}</Text>
                <Text style={styles.summaryTxt}>
                  {(p.items || []).length} đội
                </Text>
              </View>
              {/* Mini BXH */}
              {(p.items || []).map((row: any, idx: number) => {
                const isTop = idx < (gs?.topPerPool || 0);
                return (
                  <View
                    key={String(row._id)}
                    style={[
                      styles.stRow,
                      isTop && { backgroundColor: "#F0FDF4" },
                      idx === 0 && !isTop && { backgroundColor: "#FEF3C7" },
                    ]}
                  >
                    <Text style={styles.stRank}>
                      {idx === 0
                        ? "🥇"
                        : idx === 1
                          ? "🥈"
                          : idx === 2
                            ? "🥉"
                            : `#${idx + 1}`}
                    </Text>
                    <Text style={styles.stName} numberOfLines={1}>
                      {row.name}
                    </Text>
                    <Text style={styles.stStat}>
                      {row.wins || 0}-{row.losses || 0}
                    </Text>
                  </View>
                );
              })}
              {/* Duals in pool */}
              {(grouped.group.get(p.key) || [])
                .slice(0, 4)
                .map((dl: any) => (
                  <DualCard key={String(dl._id)} dual={dl} onOpen={openDual} />
                ))}
            </View>
          ))}
        </View>
      )}

      {/* Knockout rounds — mobile: 1 column per round */}
      {koRounds.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🏆 Sơ đồ Knockout</Text>
          {koRounds.map(({ round, items }) => (
            <View key={round} style={styles.poolBox}>
              <Text style={styles.poolTitle}>
                {koLabel(round, koRounds.length)}
              </Text>
              {items.map((dl: any) => (
                <DualCard key={String(dl._id)} dual={dl} onOpen={openDual} />
              ))}
            </View>
          ))}
        </View>
      )}

      {/* Standings top 3 (chỉ hiện khi flat mode) */}
      {!useGroupStage && standings.length > 0 && (
        <View style={styles.section}>
          <Pressable style={styles.sectionHead} onPress={goToStandings}>
            <Text style={styles.sectionTitle}>🏆 Bảng xếp hạng</Text>
            <Text style={styles.sectionMore}>Xem đầy đủ →</Text>
          </Pressable>
          <View style={styles.card}>
            {standings.slice(0, 5).map((row: any, idx: number) => (
              <View
                key={String(row?.team?._id || idx)}
                style={[
                  styles.stRow,
                  idx === 0 && { backgroundColor: "#FEF3C7" },
                  idx === 1 && { backgroundColor: "#F1F5F9" },
                  idx === 2 && { backgroundColor: "#FEE2E2" },
                ]}
              >
                <Text style={styles.stRank}>
                  {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`}
                </Text>
                <Text style={styles.stName} numberOfLines={1}>
                  {row?.team?.name || "—"}
                </Text>
                <Text style={styles.stStat}>
                  W {row?.wins || 0} · L {row?.losses || 0}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Dual matches theo round — flat mode legacy */}
      {!useGroupStage && (
        dualsByRound.length === 0 ? (
          <View style={[styles.card, { padding: 20, alignItems: "center" }]}>
            <Text style={{ color: "#64748B", textAlign: "center" }}>
              Chưa có dual match nào — BTC sinh vòng bảng từ trang MLP Duals.
            </Text>
            <Pressable style={styles.ctaBtn} onPress={goToDuals}>
              <Ionicons name="add-circle" size={14} color="#fff" />
              <Text style={styles.ctaBtnText}>Vào MLP Duals</Text>
            </Pressable>
          </View>
        ) : (
          dualsByRound.map(({ round, items }) => (
            <View key={round} style={styles.section}>
              <Text style={styles.roundTitle}>Vòng {round}</Text>
              {items.map((dl: any) => (
                <DualCard key={String(dl._id)} dual={dl} onOpen={openDual} />
              ))}
            </View>
          ))
        )
      )}

      {/* Group stage empty state */}
      {useGroupStage &&
        (!poolsStandings || poolsStandings.length === 0) &&
        koRounds.length === 0 && (
          <View style={[styles.card, { padding: 20, alignItems: "center" }]}>
            <Text style={{ color: "#64748B", textAlign: "center" }}>
              Chưa có bảng nào — BTC bốc thăm chia bảng và sinh dual từ trang
              web quản trị.
            </Text>
            <Pressable style={styles.ctaBtn} onPress={goToDuals}>
              <Ionicons name="grid" size={14} color="#fff" />
              <Text style={styles.ctaBtnText}>Vào MLP Duals</Text>
            </Pressable>
          </View>
        )}
    </ScrollView>
  );
}

function NavChip({
  icon,
  label,
  onPress,
  color,
}: {
  icon: any;
  label: string;
  onPress: () => void;
  color: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.navChip, { borderColor: color + "50" }]}
    >
      <Ionicons name={icon} size={16} color={color} />
      <Text style={[styles.navChipText, { color }]}>{label}</Text>
    </Pressable>
  );
}

function DualCard({
  dual,
  onOpen,
}: {
  dual: any;
  onOpen: (d: any) => void;
}) {
  const status = String(dual?.status || "").toLowerCase();
  const finished = status === "finished";
  const tieBreak = status === "tie_break";
  const live = status === "live";

  const teamAWinner = dual?.winner === "A";
  const teamBWinner = dual?.winner === "B";

  const StatusPill = () => {
    if (finished) {
      return (
        <View style={[styles.statusPill, { backgroundColor: "#DCFCE7" }]}>
          <Text style={[styles.statusPillText, { color: "#166534" }]}>
            Đã kết thúc
          </Text>
        </View>
      );
    }
    if (tieBreak) {
      return (
        <View style={[styles.statusPill, { backgroundColor: "#FEF3C7" }]}>
          <Text style={[styles.statusPillText, { color: "#92400E" }]}>
            🏆 DreamBreaker
          </Text>
        </View>
      );
    }
    if (live) {
      return (
        <View style={[styles.statusPill, { backgroundColor: "#DBEAFE" }]}>
          <Text style={[styles.statusPillText, { color: "#1E40AF" }]}>
            Đang diễn ra
          </Text>
        </View>
      );
    }
    return (
      <View style={[styles.statusPill, { backgroundColor: "#F1F5F9" }]}>
        <Text style={[styles.statusPillText, { color: "#475569" }]}>
          Chưa bắt đầu
        </Text>
      </View>
    );
  };

  return (
    <Pressable onPress={() => onOpen(dual)} style={styles.dualCard}>
      <View style={styles.dualHead}>
        <StatusPill />
        {dual?.poolKey ? (
          <View style={[styles.statusPill, { backgroundColor: "#E0E7FF" }]}>
            <Text style={[styles.statusPillText, { color: "#3730A3" }]}>
              Bảng {dual.poolKey}
            </Text>
          </View>
        ) : null}
        {dual?.phase === "knockout" ? (
          <View style={[styles.statusPill, { backgroundColor: "#FCE7F3" }]}>
            <Text style={[styles.statusPillText, { color: "#9F1239" }]}>
              KO R{dual.knockoutRound || 1}
            </Text>
          </View>
        ) : null}
        {finished && dual?.finishedAt ? (
          <Text style={styles.dualDate}>
            {new Date(dual.finishedAt).toLocaleDateString("vi-VN")}
          </Text>
        ) : null}
      </View>

      <View style={styles.dualBody}>
        <TeamRow
          team={dual?.teamA}
          score={dual?.slotWinsA}
          isWinner={teamAWinner}
          placeholder={placeholderLabel(dual?.sourceA)}
        />
        <View style={styles.dualVs}>
          <Text style={styles.dualVsText}>vs</Text>
        </View>
        <TeamRow
          team={dual?.teamB}
          score={dual?.slotWinsB}
          isWinner={teamBWinner}
          placeholder={placeholderLabel(dual?.sourceB)}
        />
      </View>

      {/* Sub-matches summary */}
      {Array.isArray(dual?.subMatches) && dual.subMatches.length > 0 && (
        <View style={styles.subRow}>
          {dual.subMatches.map((s: any) => {
            const w = s?.result?.winner;
            return (
              <View
                key={String(s._id)}
                style={[
                  styles.subChip,
                  w === "A" && { backgroundColor: "#DBEAFE" },
                  w === "B" && { backgroundColor: "#FEE2E2" },
                ]}
              >
                <Text style={styles.subChipKey}>{s.slotKey}</Text>
                <Text style={styles.subChipScore}>
                  {s?.result?.scoreA ?? 0}-{s?.result?.scoreB ?? 0}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {/* DreamBreaker score if any */}
      {dual?.dreamBreaker?.triggered && (
        <View style={styles.dbFooter}>
          <Ionicons name="trophy" size={12} color="#B45309" />
          <Text style={styles.dbFooterText}>
            DB: {dual.dreamBreaker.scoreA || 0} — {dual.dreamBreaker.scoreB || 0}
            {dual.dreamBreaker.winner
              ? ` · Winner: Team ${dual.dreamBreaker.winner}`
              : " · Đang diễn ra"}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function placeholderLabel(source: any): string | null {
  if (!source || !source.kind) return null;
  if (source.kind === "poolRank") {
    const rank = Number(source.poolRank) || 1;
    const label =
      rank === 1 ? "Nhất" : rank === 2 ? "Nhì" : rank === 3 ? "Ba" : `#${rank}`;
    return `${label} bảng ${source.poolKey || "?"}`;
  }
  if (source.kind === "winner") {
    return `Thắng T${(Number(source.fromMatchOrder) || 0) + 1}`;
  }
  return null;
}

function TeamRow({
  team,
  score,
  isWinner,
  placeholder,
}: {
  team: any;
  score: number;
  isWinner: boolean;
  placeholder?: string | null;
}) {
  if (!team && placeholder) {
    return (
      <View
        style={[
          styles.teamRow,
          { backgroundColor: "#FEF3C7", borderColor: "#F59E0B", borderWidth: 1, borderStyle: "dashed" as any },
        ]}
      >
        <View style={[styles.teamAvatar, { backgroundColor: "#F59E0B" }]}>
          <Text style={{ color: "#fff", fontWeight: "900" }}>?</Text>
        </View>
        <Text
          style={[styles.teamName, { fontStyle: "italic", color: "#92400E" }]}
          numberOfLines={1}
        >
          {placeholder}
        </Text>
        <Text style={[styles.teamScore, { color: "#92400E" }]}>–</Text>
      </View>
    );
  }
  const logoUri = team?.logo ? normalizeUrl(team.logo) : "";
  const initial = String(team?.shortName || team?.name || "?")
    .trim()
    .charAt(0)
    .toUpperCase();
  return (
    <View style={[styles.teamRow, isWinner && styles.teamRowWinner]}>
      <View style={styles.teamAvatar}>
        {logoUri ? (
          <Image source={{ uri: logoUri }} style={styles.teamAvatarImg} />
        ) : (
          <Text style={styles.teamAvatarInitial}>{initial}</Text>
        )}
      </View>
      <Text
        style={[styles.teamName, isWinner && { color: "#065F46" }]}
        numberOfLines={1}
      >
        {team?.name || "—"}
      </Text>
      <Text
        style={[styles.teamScore, isWinner && { color: "#065F46" }]}
      >
        {score ?? 0}
      </Text>
      {isWinner ? (
        <Ionicons name="checkmark-circle" size={16} color="#10B981" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  content: { padding: 12, paddingBottom: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  mlpBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#FCD34D",
  },
  mlpBadgeText: { color: "#B45309", fontWeight: "800", fontSize: 11 },
  summaryTxt: { color: "#64748B", fontSize: 12 },
  navRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  navChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: "#fff",
  },
  navChipText: { fontSize: 13, fontWeight: "800" },
  section: { marginBottom: 14 },
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 14, fontWeight: "900", color: "#0F172A" },
  sectionMore: { fontSize: 11, color: "#0066FF", fontWeight: "700" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
  },
  stRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
  },
  stRank: {
    width: 34,
    fontSize: 16,
    fontWeight: "900",
    color: "#0F172A",
    textAlign: "center",
  },
  stName: { flex: 1, fontSize: 13, color: "#0F172A", fontWeight: "700" },
  stStat: { fontSize: 12, color: "#64748B", fontWeight: "600" },
  roundTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: "#0F172A",
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#0066FF",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 10,
  },
  ctaBtnText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  dualCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 8,
  },
  dualHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statusPillText: { fontSize: 10, fontWeight: "800" },
  dualDate: { fontSize: 10, color: "#94A3B8" },
  dualBody: { gap: 4 },
  dualVs: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 2,
  },
  dualVsText: { fontSize: 10, color: "#94A3B8", fontWeight: "700" },
  teamRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#F8FAFC",
  },
  teamRowWinner: { backgroundColor: "#F0FDF4" },
  teamAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#E0E7FF",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  teamAvatarImg: { width: "100%", height: "100%" },
  teamAvatarInitial: { color: "#4338CA", fontWeight: "900", fontSize: 14 },
  teamName: { flex: 1, fontSize: 13, color: "#0F172A", fontWeight: "700" },
  teamScore: { fontSize: 20, color: "#0F172A", fontWeight: "900" },
  subRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10,
  },
  subChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "#F1F5F9",
  },
  subChipKey: { fontSize: 10, color: "#0F172A", fontWeight: "900" },
  subChipScore: { fontSize: 10, color: "#334155", fontWeight: "700" },
  dbFooter: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FCD34D",
  },
  dbFooterText: { fontSize: 11, color: "#92400E", fontWeight: "700" },
  poolBox: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 10,
    marginBottom: 10,
    gap: 6,
  },
  poolHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  poolTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: "#0F172A",
  },
});
