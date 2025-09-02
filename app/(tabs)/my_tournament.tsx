// app/contact/index.jsx — "Giải của tôi" + sticky header cho tiêu đề/search/chips
import React, { useMemo, useState, useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  ImageBackground,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import { Stack } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialIcons } from "@expo/vector-icons";
import { useListMyTournamentsQuery } from "@/slices/tournamentsApiSlice";
import ResponsiveMatchViewer from "@/components/match/ResponsiveMatchViewer";

/* ================= Theme ================= */
function useThemeTokens() {
  const scheme = useColorScheme() ?? "light";
  const isDark = scheme === "dark";
  return {
    isDark,
    bg: isDark ? "#0b0f14" : "#fafbff",
    cardBg: isDark ? "#11161c" : "#ffffff",
    border: isDark ? "#212a33" : "#e8edf3",
    text: isDark ? "#f7f7f7" : "#0b1220",
    sub: isDark ? "#b9c1cc" : "#586174",
    muted: isDark ? "#0f141a" : "#f3f6fb",
    chipBg: isDark ? "#121a22" : "#eef2f7",
    tint: isDark ? "#7cc0ff" : "#0a84ff",
    success: "#22c55e",
    danger: "#ef4444",
    warning: "#f59e0b",
    shadow: "rgba(16,24,40,0.08)",
    inputBg: isDark ? "#0f141a" : "#f5f7fb",
  };
}

/* ================= Utils ================= */
const dateFmt = (s) => {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
};

const stripVN = (s = "") =>
  String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const nameWithNick = (p) => {
  if (!p) return "—";
  const nick = p.nickName || p.nickname || p.nick || p.alias;
  return nick?.trim() || p.fullName || p.name || "—";
};

/** team label: single → chỉ VĐV1; double → "VĐV1 & VĐV2" */
const teamLabel = (team, eventType) => {
  if (!team) return "—";
  if (team.name) return team.name;
  const players =
    team.players ||
    team.members ||
    [team.player1, team.player2].filter(Boolean) ||
    [];
  if (!players.length) return "—";
  if (eventType === "single") return nameWithNick(players[0]);
  if (players.length === 1) return nameWithNick(players[0]);
  return `${nameWithNick(players[0])} & ${nameWithNick(players[1])}`;
};

function roundText(m) {
  if (m.roundName) return m.roundName;
  if (m.phase) return m.phase;
  if (Number.isFinite(m.rrRound)) return `Vòng bảng ${m.rrRound}`;
  if (Number.isFinite(m.swissRound)) return `Swiss ${m.swissRound}`;
  if (Number.isFinite(m.round)) return `Vòng ${m.round}`;
  return "—";
}

/* ================= Small UI bits ================= */
function ChipToggle({ active, label, onPress, tokens, style }) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: active ? tokens.tint + "1a" : tokens.chipBg,
          borderColor: active ? tokens.tint : tokens.border,
        },
        style,
      ]}
    >
      <Text
        style={{
          fontSize: 12,
          fontWeight: "700",
          color: active ? tokens.tint : tokens.sub,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function StatusChip({ status, tokens }) {
  let bg = tokens.chipBg,
    fg = tokens.sub;
  if (status === "live") {
    bg = tokens.danger + "22";
    fg = tokens.danger;
  } else if (status === "finished") {
    bg = tokens.success + "22";
    fg = tokens.success;
  } else if (status === "scheduled") {
    bg = tokens.tint + "1a";
    fg = tokens.tint;
  }
  return (
    <View
      style={[styles.chip, { backgroundColor: bg, borderColor: "transparent" }]}
    >
      <Text style={{ fontSize: 12, fontWeight: "700", color: fg }}>
        {status === "live"
          ? "Đang diễn ra"
          : status === "finished"
          ? "Đã kết thúc"
          : "Sắp diễn ra"}
      </Text>
    </View>
  );
}

function SmallMeta({ icon, text, tokens }) {
  return (
    <View style={styles.metaItem}>
      <MaterialIcons name={icon} size={14} color={tokens.sub} />
      <Text
        style={{ color: tokens.sub, fontSize: 12, marginLeft: 6 }}
        numberOfLines={1}
      >
        {text}
      </Text>
    </View>
  );
}

function ScoreBadge({ sets, tokens }) {
  const text =
    Array.isArray(sets) && sets.length
      ? sets
          .map((s) => `${s.a ?? s.home ?? 0}-${s.b ?? s.away ?? 0}`)
          .join("  |  ")
      : "—";
  return (
    <View
      style={[
        styles.scoreBadge,
        { backgroundColor: tokens.muted, borderColor: tokens.border },
      ]}
    >
      <Text style={{ fontWeight: "700", color: tokens.text }}>{text}</Text>
    </View>
  );
}

/* ================= Rows / Cards ================= */
function MatchRow({ m, onPress, tokens, eventType }) {
  const a = m.teamA || m.home || m.teams?.[0] || m.pairA;
  const b = m.teamB || m.away || m.teams?.[1] || m.pairB;
  const status = m.status || (m.winner ? "finished" : "scheduled");
  const court = m.courtName || m.court || "";
  const when = m.scheduledAt || m.startTime || m.time;

  const accent =
    status === "live"
      ? tokens.danger
      : status === "finished"
      ? tokens.success
      : tokens.tint;

  return (
    <Pressable
      onPress={() => onPress?.(m)}
      style={({ pressed }) => [
        styles.matchRow,
        {
          borderColor: tokens.border,
          backgroundColor: tokens.cardBg,
          opacity: pressed ? 0.9 : 1,
          shadowColor: tokens.shadow,
        },
      ]}
    >
      <View style={[styles.matchAccent, { backgroundColor: accent }]} />
      <View style={{ flex: 1, gap: 6 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text numberOfLines={1} style={[styles.team, { color: tokens.text }]}>
            {teamLabel(a, eventType)}
          </Text>
          <StatusChip status={status} tokens={tokens} />
        </View>
        <Text numberOfLines={1} style={[styles.team, { color: tokens.text }]}>
          {teamLabel(b, eventType)}
        </Text>

        <ScoreBadge sets={m.sets || m.gameScores} tokens={tokens} />

        <View style={styles.metaRow}>
          <SmallMeta icon="event" text={dateFmt(when)} tokens={tokens} />
          {!!court && (
            <SmallMeta
              icon="sports-tennis"
              text={`Sân ${court}`}
              tokens={tokens}
            />
          )}
          <SmallMeta icon="schedule" text={roundText(m)} tokens={tokens} />
        </View>
      </View>

      <View style={styles.chev}>
        <MaterialIcons name="chevron-right" size={22} color={tokens.sub} />
      </View>
    </Pressable>
  );
}

function Banner({ t, tokens }) {
  const status = t.status;
  const statusText =
    status === "ongoing"
      ? "Đang diễn ra"
      : status === "finished"
      ? "Đã kết thúc"
      : "Sắp diễn ra";
  const statusColor =
    status === "ongoing"
      ? tokens.warning
      : status === "finished"
      ? tokens.success
      : tokens.tint;

  return (
    <View style={styles.bannerWrap}>
      <ImageBackground
        source={t.image ? { uri: t.image } : undefined}
        resizeMode="cover"
        style={styles.banner}
        imageStyle={{ borderTopLeftRadius: 16, borderTopRightRadius: 16 }}
      >
        <LinearGradient
          colors={["rgba(0,0,0,0.00)", "rgba(0,0,0,0.55)"]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.bannerInner}>
          <View style={{ flex: 1 }}>
            <Text
              numberOfLines={2}
              style={[styles.bannerTitle, { color: "#fff" }]}
            >
              {t.name || "Giải đấu"}
            </Text>
            {!!t.location && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginTop: 6,
                }}
              >
                <MaterialIcons name="location-pin" size={16} color="#fff" />
                <Text
                  numberOfLines={1}
                  style={{ color: "#fff", marginLeft: 6, opacity: 0.9 }}
                >
                  {t.location}
                </Text>
              </View>
            )}
          </View>
          <View style={[styles.statusTag, { backgroundColor: statusColor }]}>
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>
              {statusText}
            </Text>
          </View>
        </View>
      </ImageBackground>
    </View>
  );
}

/* ===== TournamentCard (giữ nguyên per-item search/filter) ===== */
function TournamentCard({ t, onOpenMatch, tokens }) {
  const [expanded, setExpanded] = useState(false);
  const [matchQuery, setMatchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState(
    new Set(["scheduled", "live", "finished"])
  );

  const matches = Array.isArray(t.matches) ? t.matches : [];

  const filteredMatches = useMemo(() => {
    const q = stripVN(matchQuery);
    return matches.filter((m) => {
      const status = m.status || (m.winner ? "finished" : "scheduled");
      if (!statusFilter.has(status)) return false;
      if (!q) return true;

      const a = m.teamA || m.home || m.teams?.[0] || m.pairA;
      const b = m.teamB || m.away || m.teams?.[1] || m.pairB;
      const hay = [
        teamLabel(a, t.eventType),
        teamLabel(b, t.eventType),
        roundText(m),
        m.courtName || m.court || "",
      ]
        .map(stripVN)
        .join(" | ");

      return hay.includes(q);
    });
  }, [matches, matchQuery, statusFilter, t.eventType]);

  const shown = expanded ? filteredMatches : filteredMatches.slice(0, 5);
  const hasMore = filteredMatches.length > shown.length;

  const toggleStatus = (key) =>
    setStatusFilter((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      if (n.size === 0) n.add(key); // tránh rỗng
      return n;
    });

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: tokens.cardBg,
          borderColor: tokens.border,
          shadowColor: tokens.shadow,
        },
      ]}
    >
      <Banner t={t} tokens={tokens} />

      <View style={{ padding: 14, gap: 10 }}>
        {/* Meta date */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <MaterialIcons name="calendar-month" size={18} color={tokens.sub} />
          <Text style={{ color: tokens.sub, fontSize: 13 }}>
            {(t.startDate || t.startAt) && (t.endDate || t.endAt)
              ? `${dateFmt(t.startDate || t.startAt)}  →  ${dateFmt(
                  t.endDate || t.endAt
                )}`
              : "—"}
          </Text>
        </View>

        {/* SEARCH MATCHES + FILTERS */}
        <View
          style={[
            styles.searchRow,
            { backgroundColor: tokens.inputBg, borderColor: tokens.border },
          ]}
        >
          <MaterialIcons name="search" size={18} color={tokens.sub} />
          <TextInput
            placeholder="Tìm trận (VĐV, vòng, sân...)"
            placeholderTextColor={tokens.sub}
            value={matchQuery}
            onChangeText={setMatchQuery}
            style={[styles.input]}
          />
          {matchQuery ? (
            <Pressable onPress={() => setMatchQuery("")}>
              <MaterialIcons name="close" size={18} color={tokens.sub} />
            </Pressable>
          ) : null}
        </View>

        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <ChipToggle
            label="Sắp diễn ra"
            active={statusFilter.has("scheduled")}
            onPress={() => toggleStatus("scheduled")}
            tokens={tokens}
          />
          <ChipToggle
            label="Đang diễn ra"
            active={statusFilter.has("live")}
            onPress={() => toggleStatus("live")}
            tokens={tokens}
          />
          <ChipToggle
            label="Đã kết thúc"
            active={statusFilter.has("finished")}
            onPress={() => toggleStatus("finished")}
            tokens={tokens}
          />
          {!!matchQuery || statusFilter.size !== 3 ? (
            <Pressable
              onPress={() => {
                setMatchQuery("");
                setStatusFilter(new Set(["scheduled", "live", "finished"]));
              }}
            >
              <Text
                style={{ color: tokens.tint, fontWeight: "700", padding: 6 }}
              >
                Reset
              </Text>
            </Pressable>
          ) : null}
        </View>

        {/* LIST MATCHES */}
        {filteredMatches.length === 0 ? (
          <View style={styles.emptyMatches}>
            <Text style={{ fontSize: 28, marginBottom: 4 }}>🎾</Text>
            <Text style={{ color: tokens.sub }}>
              Không có trận phù hợp bộ lọc.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {shown.map((m) => (
              <MatchRow
                key={m._id}
                m={m}
                onPress={onOpenMatch}
                tokens={tokens}
                eventType={t.eventType}
              />
            ))}

            {hasMore && (
              <Pressable
                onPress={() => setExpanded((v) => !v)}
                style={[
                  styles.showMoreBtn,
                  { borderColor: tokens.border, backgroundColor: tokens.muted },
                ]}
              >
                <Text style={{ color: tokens.text, fontWeight: "700" }}>
                  {expanded
                    ? "Thu gọn"
                    : `Xem tất cả ${filteredMatches.length} trận`}
                </Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

/* ================= Page ================= */
export default function MyTournament() {
  const tokens = useThemeTokens();
  const [open, setOpen] = useState(false);
  const [matchId, setMatchId] = useState(null);

  const { data, isLoading, isError, refetch, isFetching } =
    useListMyTournamentsQuery({
      withMatches: 1,
      matchLimit: 200,
      page: 1,
      limit: 50,
    });

  // ===== Tournament search/filter state (GLOBAL) =====
  const [tourQuery, setTourQuery] = useState("");
  const [tourStatus, setTourStatus] = useState(
    new Set(["upcoming", "ongoing", "finished"])
  );

  const tournamentsRaw = useMemo(() => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.items)) return data.items;
    return [];
  }, [data]);

  const tournaments = useMemo(() => {
    const q = stripVN(tourQuery);
    return tournamentsRaw.filter((t) => {
      if (!tourStatus.has(t.status)) return false;
      if (!q) return true;
      const hay = [t.name, t.location].map(stripVN).join(" | ");
      return hay.includes(q);
    });
  }, [tournamentsRaw, tourQuery, tourStatus]);

  const handleOpenMatch = useCallback((m) => {
    setMatchId(m?._id);
    setOpen(true);
  }, []);

  const toggleTourStatus = (key) =>
    setTourStatus((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      if (n.size === 0) n.add(key);
      return n;
    });

  /* ====== STICKY HEADER CONTENT ====== */
  const StickyHeader = (
    <View
      style={[
        styles.stickyHeader,
        { backgroundColor: tokens.bg, borderBottomColor: tokens.border },
      ]}
    >
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>Giải của tôi</Text>

        {/* Tournament search */}
        <View
          style={[
            styles.searchRow,
            {
              backgroundColor: tokens.inputBg,
              borderColor: tokens.border,
              marginTop: 10,
            },
          ]}
        >
          <MaterialIcons name="search" size={18} color={tokens.sub} />
          <TextInput
            placeholder="Tìm giải (tên, địa điểm)"
            placeholderTextColor={tokens.sub}
            value={tourQuery}
            onChangeText={setTourQuery}
            style={styles.input}
          />
          {tourQuery ? (
            <Pressable onPress={() => setTourQuery("")}>
              <MaterialIcons name="close" size={18} color={tokens.sub} />
            </Pressable>
          ) : null}
        </View>

        {/* Chips filter giải */}
        <View
          style={{
            flexDirection: "row",
            gap: 8,
            flexWrap: "wrap",
            marginTop: 8,
          }}
        >
          <ChipToggle
            label="Sắp diễn ra"
            active={tourStatus.has("upcoming")}
            onPress={() => toggleTourStatus("upcoming")}
            tokens={tokens}
          />
          <ChipToggle
            label="Đang diễn ra"
            active={tourStatus.has("ongoing")}
            onPress={() => toggleTourStatus("ongoing")}
            tokens={tokens}
          />
          <ChipToggle
            label="Đã kết thúc"
            active={tourStatus.has("finished")}
            onPress={() => toggleTourStatus("finished")}
            tokens={tokens}
          />
          {!!tourQuery || tourStatus.size !== 3 ? (
            <Pressable
              onPress={() => {
                setTourQuery("");
                setTourStatus(new Set(["upcoming", "ongoing", "finished"]));
              }}
            >
              <Text
                style={{ color: tokens.tint, fontWeight: "700", padding: 6 }}
              >
                Reset
              </Text>
            </Pressable>
          ) : null}
        </View>

        {!!tournaments?.length && (
          <Text style={styles.pageSub}>{tournaments.length} giải phù hợp</Text>
        )}
      </View>
    </View>
  );

  const EmptyState = (
    <View style={styles.emptyWrap}>
      <Text style={{ fontSize: 42, marginBottom: 6 }}>🏆</Text>
      <Text style={{ color: tokens.text, fontWeight: "800", fontSize: 16 }}>
        Chưa có giải nào
      </Text>
      <Text style={{ color: tokens.sub, marginTop: 4, textAlign: "center" }}>
        Tham gia giải để theo dõi lịch đấu và kết quả của bạn tại đây.
      </Text>
    </View>
  );

  return (
    <>
      <Stack.Screen
        options={{ title: "Giải của tôi", headerTitleAlign: "center" }}
      />

      {isLoading ? (
        <View
          style={{
            flex: 1,
            backgroundColor: tokens.bg,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          data={tournaments}
          keyExtractor={(t) => t._id}
          contentContainerStyle={[
            styles.screen,
            { backgroundColor: tokens.bg, paddingBottom: 28 },
          ]}
          ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
          renderItem={({ item }) => (
            <TournamentCard
              t={item}
              onOpenMatch={handleOpenMatch}
              tokens={tokens}
            />
          )}
          /* ======= GHIM HEADER Ở ĐỈNH ======= */
          ListHeaderComponent={StickyHeader}
          stickyHeaderIndices={[0]}
          /* ================================== */

          ListEmptyComponent={EmptyState}
          refreshControl={
            <RefreshControl
              refreshing={isFetching}
              onRefresh={refetch}
              tintColor={tokens.tint}
            />
          }
        />
      )}

      <ResponsiveMatchViewer
        open={open}
        matchId={matchId}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

/* ================= Styles ================= */
const styles = StyleSheet.create({
  screen: { padding: 16, paddingTop: 0 }, // top: 0 vì header là sticky bên trong

  /* Sticky header wrapper */
  stickyHeader: {
    zIndex: 10, // Android cần zIndex + elevation để nổi lên
    elevation: 3,
    borderBottomWidth: 1,
  },
  pageHeader: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10 },
  pageTitle: {
    fontSize: 22,
    fontWeight: Platform.select({ ios: "800", android: "700", default: "700" }),
  },
  pageSub: { marginTop: 6, color: "#7b8899" },

  searchRow: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: Platform.select({ ios: 10, android: 6 }),
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  input: {
    flex: 1,
    paddingVertical: Platform.select({ ios: 6, android: 2 }),
    fontSize: 14,
  },

  card: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: "hidden",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  bannerWrap: { width: "100%" },
  banner: { width: "100%", height: 140, backgroundColor: "#1c2430" },
  bannerInner: {
    flex: 1,
    padding: 14,
    paddingTop: 18,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
  },
  bannerTitle: {
    fontSize: 18,
    fontWeight: Platform.select({ ios: "800", android: "700", default: "700" }),
  },
  statusTag: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    alignSelf: "flex-start",
  },

  chip: {
    paddingHorizontal: 10,
    paddingVertical: Platform.select({ ios: 6, android: 4 }),
    borderRadius: 999,
    borderWidth: 1,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 4,
  },
  metaItem: { flexDirection: "row", alignItems: "center" },

  team: {
    fontSize: 15,
    fontWeight: Platform.select({ ios: "700", android: "700", default: "700" }),
  },
  matchRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    gap: 12,
  },
  matchAccent: { width: 4, borderRadius: 999 },
  scoreBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 2,
  },
  chev: { alignSelf: "center", paddingLeft: 8 },

  showMoreBtn: {
    alignSelf: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },

  emptyWrap: {
    paddingTop: 40,
    paddingBottom: 80,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  emptyMatches: {
    backgroundColor: "transparent",
    borderStyle: "dashed",
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
});
