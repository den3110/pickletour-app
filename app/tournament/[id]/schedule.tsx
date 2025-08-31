// app/tournament/[id]/schedule.jsx
import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    useWindowDimensions,
    View,
} from "react-native";


// 👉 Điều chỉnh alias theo dự án của bạn:
import ResponsiveMatchViewer from "@/components/match/ResponsiveMatchViewer";
import {
    useGetTournamentQuery,
    useListPublicMatchesByTournamentQuery,
} from "@/slices/tournamentsApiSlice";

// 👉 Điều chỉnh path theo file bạn đã có:

/* ---------- helpers (giữ nguyên logic) ---------- */
const isLive = (m) =>
  ["live", "ongoing", "playing", "inprogress"].includes(
    String(m?.status || "").toLowerCase()
  );
const isFinished = (m) => String(m?.status || "").toLowerCase() === "finished";
const isScheduled = (m) =>
  ["scheduled", "upcoming", "pending", "queued", "assigning"].includes(
    String(m?.status || "").toLowerCase()
  );

function orderKey(m) {
  const bo = m?.bracket?.order ?? 9999;
  const r = m?.round ?? 9999;
  const o = m?.order ?? 9999;
  const codeNum =
    typeof m?.code === "string" ? Number(m.code.replace(/[^\d]/g, "")) : 9999;
  const ts = m?.createdAt ? new Date(m.createdAt).getTime() : 9e15;
  return [bo, r, o, codeNum, ts];
}
function pairToName(pair) {
  if (!pair) return null;
  const p1 = pair.player1?.nickName || pair.player1?.fullName;
  const p2 = pair.player2?.nickName || pair.player2?.fullName;
  const name = [p1, p2].filter(Boolean).join(" / ");
  return name || null;
}
function seedToName(seed) {
  return seed?.label || null;
}
function teamNameFrom(m, side) {
  if (!m) return "TBD";
  const pair = side === "A" ? m.pairA : m.pairB;
  const seed = side === "A" ? m.seedA : m.seedB;
  return pairToName(pair) || seedToName(seed) || "TBD";
}
function scoreText(m) {
  if (typeof m?.scoreText === "string" && m.scoreText.trim())
    return m.scoreText;
  if (Array.isArray(m?.gameScores) && m.gameScores.length) {
    return m.gameScores.map((s) => `${s?.a ?? 0}-${s?.b ?? 0}`).join(", ");
  }
  return "";
}
function courtNameOf(m) {
  return (
    (m?.courtName && m.courtName.trim()) ||
    m?.court?.name ||
    m?.courtLabel ||
    "Chưa phân sân"
  );
}

/* ---------- Small UI helpers ---------- */
function Chip({ text, type = "default", icon }) {
  const colorMap = {
    default: { bg: "#f1f5f9", fg: "#0f172a", bd: "#e2e8f0" },
    success: { bg: "#ecfdf5", fg: "#065f46", bd: "#a7f3d0" },
    secondary: { bg: "#eef2ff", fg: "#3730a3", bd: "#c7d2fe" },
    info: { bg: "#eff6ff", fg: "#1e40af", bd: "#bfdbfe" },
    warning: { bg: "#fff7ed", fg: "#9a3412", bd: "#fed7aa" },
    outlined: { bg: "transparent", fg: "#0f172a", bd: "#e2e8f0" },
  };
  const c = colorMap[type] || colorMap.default;
  return (
    <View style={[styles.chip, { backgroundColor: c.bg, borderColor: c.bd }]}>
      {icon}
      <Text style={[styles.chipText, { color: c.fg }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}
function ChipRow({ children, style }) {
  return <View style={[styles.chipRow, style]}>{children}</View>;
}

function StatusChip({ m }) {
  if (isLive(m)) return <Chip type="success" text="Đang diễn ra" />;
  if (isFinished(m)) return <Chip type="secondary" text="Đã diễn ra" />;
  return <Chip type="info" text="Sắp diễn ra" />;
}
function ScoreChip({ text }) {
  if (!text) return null;
  return <Chip type="outlined" text={text} />;
}
function WinnerChip({ m }) {
  const side = m?.winner === "A" ? "A" : m?.winner === "B" ? "B" : null;
  if (!side) return null;
  return (
    <Chip
      type="secondary"
      text={`Winner: ${teamNameFrom(m, side)}`}
      icon={
        <MaterialIcons
          name="emoji-events"
          size={14}
          style={{ marginRight: 4 }}
        />
      }
    />
  );
}

function SectionTitle({ title, right }) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={styles.sectionTitleText}>{title}</Text>
      {right}
    </View>
  );
}

/* ---------- Court Card ---------- */
function CourtCard({ court, queueLimit = 4, onOpenMatch }) {
  return (
    <View style={styles.courtCard}>
      <View style={styles.courtHead}>
        <Text style={styles.courtName}>{court.name}</Text>
        <ChipRow>
          {court.live.length > 0 && <Chip type="success" text="ĐANG DIỄN RA" />}
          {court.queue.length > 0 && (
            <Chip
              type="warning"
              text={`${court.queue.length} trận tiếp theo`}
              icon={
                <MaterialIcons
                  name="schedule"
                  size={14}
                  style={{ marginRight: 4 }}
                />
              }
            />
          )}
        </ChipRow>
      </View>

      {/* live matches */}
      {court.live.map((m) => (
        <Pressable
          key={m._id}
          onPress={() => onOpenMatch?.(m._id)}
          style={({ pressed }) => [
            styles.liveMatch,
            { transform: [{ translateY: pressed ? -1 : 0 }] },
          ]}
        >
          <View style={styles.liveRow}>
            <View style={styles.rowLeft}>
              <MaterialIcons name="play-arrow" size={16} />
              <Text style={styles.matchCode}>{m.code || "Trận"}</Text>
            </View>

            <Text style={styles.vsText} numberOfLines={2}>
              {teamNameFrom(m, "A")} vs {teamNameFrom(m, "B")}
            </Text>

            <ChipRow>
              <ScoreChip text={scoreText(m)} />
              <StatusChip m={m} />
            </ChipRow>
          </View>
        </Pressable>
      ))}

      {/* queue */}
      {court.queue.slice(0, queueLimit).map((m) => (
        <Pressable
          key={m._id}
          onPress={() => onOpenMatch?.(m._id)}
          style={({ pressed }) => [
            styles.queueRow,
            pressed && { backgroundColor: "#f1f5f9" },
          ]}
        >
          <View style={styles.queueRowInner}>
            <MaterialIcons name="schedule" size={16} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <View style={styles.queuePrimary}>
                <Text style={styles.matchCode}>{m.code || "Trận"}</Text>
                <Text style={styles.vsText} numberOfLines={2}>
                  {teamNameFrom(m, "A")} vs {teamNameFrom(m, "B")}
                </Text>
              </View>
              <ChipRow>
                <Chip
                  type="outlined"
                  text={m.bracket?.name || m.phase || "—"}
                />
                <Chip type="outlined" text={courtNameOf(m)} />
              </ChipRow>
            </View>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

/* ---------- Match Row ---------- */
function MatchRow({ m, onOpenMatch }) {
  const border = isLive(m) ? "#86efac" : isFinished(m) ? "#e5e7eb" : "#93c5fd";
  const bg = isLive(m) ? "#ecfdf5" : "transparent";
  return (
    <Pressable
      onPress={() => onOpenMatch?.(m._id)}
      style={({ pressed }) => [
        styles.matchRow,
        { borderColor: border, backgroundColor: bg },
        pressed && { opacity: 0.9 },
      ]}
    >
      <View style={styles.matchRowInner}>
        <View style={styles.matchIcon}>
          {isLive(m) ? (
            <MaterialIcons name="play-arrow" size={16} />
          ) : isFinished(m) ? (
            <MaterialIcons name="emoji-events" size={16} />
          ) : (
            <MaterialIcons name="schedule" size={16} />
          )}
        </View>

        <View style={{ flex: 1 }}>
          <View style={styles.matchPrimary}>
            <Text style={styles.matchCode}>{m.code || "Trận"}</Text>
            <Text style={styles.vsText} numberOfLines={2}>
              {teamNameFrom(m, "A")} vs {teamNameFrom(m, "B")}
            </Text>
            <ChipRow>
              <ScoreChip text={scoreText(m)} />
              <StatusChip m={m} />
            </ChipRow>
          </View>

          <ChipRow style={{ marginTop: 6 }}>
            <Chip type="outlined" text={m.bracket?.name || m.phase || "—"} />
            <Chip type="outlined" text={courtNameOf(m)} />
            {isFinished(m) && <WinnerChip m={m} />}
          </ChipRow>
        </View>
      </View>
    </Pressable>
  );
}

/* ---------- Page ---------- */
export default function TournamentScheduleNative() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all"); // all | live | upcoming | finished
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedMatchId, setSelectedMatchId] = useState(null);

  const { width } = useWindowDimensions();
  const queueLimit = width >= 900 ? 6 : width >= 600 ? 4 : 3;

  const {
    data: tournament,
    isLoading: tLoading,
    error: tError,
  } = useGetTournamentQuery(id);
  const {
    data: matchesResp,
    isLoading: mLoading,
    error: mError,
  } = useListPublicMatchesByTournamentQuery({
    tid: id,
    params: { limit: 500 },
  });

  const loading = tLoading || mLoading;
  const errorMsg =
    (tError && (tError.data?.message || tError.error)) ||
    (mError && (mError.data?.message || mError.error));

  const matches = useMemo(() => matchesResp?.list ?? [], [matchesResp]);

  const allSorted = useMemo(() => {
    return [...matches].sort((a, b) => {
      const ak = orderKey(a);
      const bk = orderKey(b);
      for (let i = 0; i < ak.length; i++)
        if (ak[i] !== bk[i]) return ak[i] - bk[i];
      return 0;
    });
  }, [matches]);

  const filteredAll = useMemo(() => {
    const qnorm = q.trim().toLowerCase();
    return allSorted.filter((m) => {
      if (status === "live" && !isLive(m)) return false;
      if (
        status === "upcoming" &&
        !(isScheduled(m) && !isLive(m) && !isFinished(m))
      )
        return false;
      if (status === "finished" && !isFinished(m)) return false;
      if (!qnorm) return true;
      const hay = [
        m.code,
        teamNameFrom(m, "A"),
        teamNameFrom(m, "B"),
        m.bracket?.name,
        courtNameOf(m),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(qnorm);
    });
  }, [allSorted, q, status]);

  const courts = useMemo(() => {
    const map = new Map();
    allSorted.forEach((m) => {
      const name = courtNameOf(m);
      if (!map.has(name)) map.set(name, { live: [], queue: [] });
      if (isLive(m)) map.get(name).live.push(m);
      else if (isScheduled(m)) map.get(name).queue.push(m);
    });
    map.forEach((v) => {
      v.queue.sort((a, b) => {
        const ak = orderKey(a);
        const bk = orderKey(b);
        for (let i = 0; i < ak.length; i++)
          if (ak[i] !== bk[i]) return ak[i] - bk[i];
        return 0;
      });
    });
    return Array.from(map.entries()).map(([name, data]) => ({ name, ...data }));
  }, [allSorted]);

  const openViewer = useCallback((mid) => {
    setSelectedMatchId(mid);
    setViewerOpen(true);
  }, []);
  const closeViewer = useCallback(() => {
    setViewerOpen(false);
    setSelectedMatchId(null);
  }, []);

  return (
    <>
      <Stack.Screen
        options={{
          title: `Lịch thi đấu${
            tournament?.name ? ` – ${tournament.name}` : ""
          }`,
          headerRight: () => (
            <Pressable
              onPress={() => router.push(`/tournament/${id}/bracket`)}
              style={({ pressed }) => [
                { padding: 6, opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <View style={styles.headerBtn}>
                <MaterialIcons name="arrow-back" size={16} />
                <Text style={styles.headerBtnText}>Về sơ đồ</Text>
              </View>
            </Pressable>
          ),
        }}
      />

      {/* Filters */}
      <View style={styles.filters}>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Tìm mã trận, người chơi, sân, bracket…"
          style={styles.searchInput}
          placeholderTextColor="#64748b"
        />
        <View style={styles.statusTabs}>
          {[
            { key: "all", label: "Tất cả" },
            { key: "live", label: "Đang diễn ra" },
            { key: "upcoming", label: "Sắp diễn ra" },
            { key: "finished", label: "Đã diễn ra" },
          ].map((it) => {
            const active = status === it.key;
            return (
              <Pressable
                key={it.key}
                onPress={() => setStatus(it.key)}
                style={[styles.tab, active && styles.tabActive]}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {it.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Loading / Error */}
      {loading && (
        <View style={styles.loadingWrap}>
          <ActivityIndicator />
          <Text style={{ marginTop: 8, color: "#475569" }}>Đang tải…</Text>
        </View>
      )}
      {!!errorMsg && !loading && (
        <View style={styles.alertError}>
          <Text style={styles.alertErrorText}>{String(errorMsg)}</Text>
        </View>
      )}

      {!loading && !errorMsg && (
        <ScrollView contentContainerStyle={styles.container}>
          {/* LEFT: on-court */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons
                name="stadium"
                size={18}
                color="#2563eb"
              />
              <View style={{ marginLeft: 8 }}>
                <Text style={styles.cardTitle}>Các trận đấu trên sân</Text>
                <Text style={styles.cardSub}>Đang diễn ra & hàng chờ</Text>
              </View>
            </View>

            {courts.length === 0 ? (
              <View style={styles.alertInfo}>
                <Text style={styles.alertInfoText}>
                  Chưa có trận nào đang diễn ra hoặc trong hàng chờ.
                </Text>
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                {courts.map((c) => (
                  <CourtCard
                    key={c.name}
                    court={c}
                    queueLimit={queueLimit}
                    onOpenMatch={openViewer}
                  />
                ))}
              </View>
            )}
          </View>

          {/* RIGHT: all matches */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.cardTitle}>Danh sách tất cả các trận</Text>
                <Text style={styles.cardSub}>
                  Sắp xếp theo thứ tự trận • {filteredAll.length} trận
                </Text>
              </View>
            </View>

            {filteredAll.length === 0 ? (
              <View style={styles.alertInfo}>
                <Text style={styles.alertInfoText}>
                  Không có trận phù hợp bộ lọc.
                </Text>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                {filteredAll.map((m) => (
                  <MatchRow key={m._id} m={m} onOpenMatch={openViewer} />
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {/* Viewer (Bottom Sheet) */}
      <ResponsiveMatchViewer
        open={viewerOpen}
        matchId={selectedMatchId}
        onClose={closeViewer}
      />
    </>
  );
}

/* ---------- Styles ---------- */
const styles = StyleSheet.create({
  container: {
    padding: 12,
    gap: 12,
  },
  filters: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  searchInput: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: "#0f172a",
    marginBottom: 8,
  },
  statusTabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  tab: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
  },
  tabActive: {
    backgroundColor: "#dbeafe",
    borderColor: "#93c5fd",
  },
  tabText: {
    fontSize: 13,
    color: "#334155",
  },
  tabTextActive: {
    color: "#1e3a8a",
    fontWeight: "700",
  },
  sectionTitle: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitleText: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0f172a",
  },
  headerBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 999,
    backgroundColor: "#fff",
  },
  headerBtnText: {
    marginLeft: 6,
    fontSize: 12,
    color: "#0f172a",
  },

  card: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 16,
    padding: 12,
    backgroundColor: "#fff",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
  },
  cardSub: {
    fontSize: 12,
    color: "#475569",
    marginTop: 2,
  },

  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  chipText: {
    fontSize: 11,
    fontWeight: "600",
  },

  courtCard: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 10,
  },
  courtHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
    gap: 8,
  },
  courtName: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0f172a",
  },
  liveMatch: {
    borderLeftWidth: 4,
    borderLeftColor: "#16a34a",
    backgroundColor: "#ecfdf5",
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  liveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  matchCode: {
    fontWeight: "800",
    color: "#0f172a",
  },
  vsText: {
    color: "#334155",
    flexShrink: 1,
    maxWidth: "60%",
  },
  queueRow: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  queueRowInner: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
  },
  queuePrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 4,
  },

  matchRow: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  matchRowInner: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
  },
  matchIcon: {
    width: 24,
    alignItems: "center",
    marginTop: 2,
  },
  matchPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 4,
  },

  alertInfo: {
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
    padding: 10,
    borderRadius: 10,
  },
  alertInfoText: { color: "#1e3a8a", fontSize: 13 },

  alertError: {
    margin: 12,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fee2e2",
    padding: 10,
    borderRadius: 10,
  },
  alertErrorText: { color: "#991b1b" },

  loadingWrap: {
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
  },
});
