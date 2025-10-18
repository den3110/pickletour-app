// app/tournament/[id]/schedule.jsx
/* eslint-disable react/prop-types */
import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  Animated,
  Easing,
} from "react-native";

import ResponsiveMatchViewer from "@/components/match/ResponsiveMatchViewer";
import {
  useGetTournamentQuery,
  useListPublicMatchesByTournamentQuery,
  // NEW: lấy danh sách brackets để subscribe/unsubscribe như web
  useListTournamentBracketsQuery,
} from "@/slices/tournamentsApiSlice";
import { useSelector } from "react-redux";
// NEW: socket context giống web
import { useSocket } from "@/context/SocketContext";

/* ---------- helpers ---------- */

const _idsFromList = (list) => {
  if (!list) return [];
  const arr = Array.isArray(list) ? list : [list];
  return arr
    .map((x) => String(x?.user?._id ?? x?.user ?? x?._id ?? x?.id ?? x).trim())
    .filter(Boolean);
};
const _hasMe = (list, me) => {
  if (!me?._id) return false;
  const my = String(me._id);
  return _idsFromList(list).includes(my);
};

const isAdminUser = (me) =>
  !!(
    me?.isAdmin ||
    me?.role === "admin" ||
    (Array.isArray(me?.roles) && me.roles.includes("admin"))
  );

const isManagerOfTournament = (tour, me) => {
  if (!tour || !me?._id) return false;
  const my = String(me._id);
  const createdBy = String(tour?.createdBy?._id ?? tour?.createdBy ?? "");
  if (createdBy && createdBy === my) return true;
  if (tour?.isManager) return true;
  if (_hasMe(tour?.managers, me)) return true;
  if (_hasMe(tour?.admins, me)) return true;
  if (_hasMe(tour?.organizers, me)) return true;
  return false;
};

const isRefereeOfTournament = (tour, matches, me) => {
  if (!me?._id) return false;
  if (_hasMe(tour?.referees, me)) return true;
  if (_hasMe(tour?.judges, me)) return true;
  if (_hasMe(tour?.scorers, me)) return true;
  if (Array.isArray(matches)) {
    for (const m of matches) {
      const raw = m?.referees ?? m?.referee ?? m?.judges ?? [];
      const arr = Array.isArray(raw) ? raw : [raw];
      const ids = _idsFromList(arr);
      if (ids.includes(String(me._id))) return true;
    }
  }
  return false;
};

const isLive = (m) =>
  ["live", "ongoing", "playing", "inprogress"].includes(
    String(m?.status || "").toLowerCase()
  );
const isFinished = (m) => String(m?.status || "").toLowerCase() === "finished";
// CHANGED: thêm 'assigned' để bắt trạng thái đã gán sân
const isScheduled = (m) =>
  [
    "scheduled",
    "upcoming",
    "pending",
    "queued",
    "assigning",
    "assigned", // NEW
  ].includes(String(m?.status || "").toLowerCase());

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
const hasAssignedCourt = (m) =>
  String(courtNameOf(m)).toLowerCase().includes("chưa phân sân") === false;

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
  if (isLive(m)) return <Chip type="warning" text="Đang diễn ra" />;
  if (isFinished(m)) return <Chip type="success" text="Đã diễn ra" />;
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

/* ---------- Skeletons ---------- */
function Pulse({ style }) {
  const opacity = React.useRef(new Animated.Value(0.6)).current;
  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.quad),
        }),
        Animated.timing(opacity, {
          toValue: 0.6,
          duration: 700,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.quad),
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View
      style={[
        { backgroundColor: "#e5e7eb", borderRadius: 8 },
        style,
        { opacity },
      ]}
    />
  );
}

function Line({ w = "100%", h = 12, style }) {
  return <Pulse style={[{ width: w, height: h, borderRadius: 6 }, style]} />;
}

function Circle({ size = 24, style }) {
  return (
    <Pulse
      style={[{ width: size, height: size, borderRadius: size / 2 }, style]}
    />
  );
}

function ChipGhost({ w = 70 }) {
  return <Pulse style={{ width: w, height: 18, borderRadius: 999 }} />;
}

/* card skeleton: “Các trận đấu trên sân” */
function CourtCardSkeleton() {
  return (
    <View style={styles.courtCard}>
      <View style={styles.courtHead}>
        <Line w={120} h={16} />
        <View style={{ flexDirection: "row", gap: 6 }}>
          <ChipGhost w={90} />
          <ChipGhost w={70} />
        </View>
      </View>

      {/* live row giả */}
      <View
        style={[
          styles.liveMatch,
          { backgroundColor: "#f1f5f9", borderLeftColor: "#e5e7eb" },
        ]}
      >
        <View style={styles.liveRow}>
          <View style={styles.rowLeft}>
            <Circle size={16} />
            <Line w={50} />
          </View>
          <Line w={"55%"} />
          <View style={{ flexDirection: "row", gap: 6 }}>
            <ChipGhost w={60} />
            <ChipGhost w={80} />
          </View>
        </View>
      </View>

      {/* queue rows giả */}
      {[...Array(2)].map((_, i) => (
        <View key={i} style={styles.queueRow}>
          <View style={styles.queueRowInner}>
            <Circle size={16} />
            <View style={{ flex: 1 }}>
              <View style={styles.queuePrimary}>
                <Line w={50} />
                <Line w={"60%"} />
              </View>
              <View style={{ flexDirection: "row", gap: 6 }}>
                <ChipGhost w={90} />
                <ChipGhost w={100} />
              </View>
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

/* row skeleton: “Danh sách tất cả các trận” */
function MatchRowSkeleton() {
  return (
    <View style={[styles.matchRow, { borderColor: "#e2e8f0" }]}>
      <View style={styles.matchRowInner}>
        <View style={styles.matchIcon}>
          <Circle size={20} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.matchPrimary}>
            <Line w={60} />
            <Line w={"55%"} />
            <View style={{ flexDirection: "row", gap: 6 }}>
              <ChipGhost w={70} />
              <ChipGhost w={90} />
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
            <ChipGhost w={80} />
            <ChipGhost w={100} />
            <ChipGhost w={120} />
          </View>
        </View>
      </View>
    </View>
  );
}

/* skeleton toàn trang: 2 card giống layout thật */
function PageSkeleton() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Circle size={18} />
          <View style={{ marginLeft: 8 }}>
            <Line w={160} h={16} />
            <Line w={120} h={10} style={{ marginTop: 6 }} />
          </View>
        </View>
        <View style={{ gap: 12 }}>
          {[...Array(2)].map((_, i) => (
            <CourtCardSkeleton key={i} />
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View>
            <Line w={200} h={16} />
            <Line w={150} h={10} style={{ marginTop: 6 }} />
          </View>
        </View>
        <View style={{ gap: 10 }}>
          {[...Array(6)].map((_, i) => (
            <MatchRowSkeleton key={i} />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

/* ---------- Court Card ---------- */
function CourtCard({ court, queueLimit = 4, onOpenMatch }) {
  return (
    <View style={styles.courtCard}>
      <View style={styles.courtHead}>
        <Text style={styles.courtName}>{court.name}</Text>
        <ChipRow>
          {court.live.length > 0 && <Chip type="warning" text="ĐANG DIỄN RA" />}
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

      {/* queue (mọi trận có sân, chưa kết thúc, không live) */}
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
  const border = isLive(m) ? "#fdba74" : isFinished(m) ? "#86efac" : "#93c5fd";
  const bg = isLive(m) ? "#fff7ed" : "transparent";
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
  const me = useSelector((s) => s.auth?.userInfo || null);
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
    refetch: refetchMatches, // NEW
  } = useListPublicMatchesByTournamentQuery({
    tid: id,
    params: { limit: 1000 },
  });

  // NEW: lấy brackets để subscribe theo id
  const { data: brackets = [], refetch: refetchBrackets } =
    useListTournamentBracketsQuery(id, {
      refetchOnMountOrArgChange: true,
      refetchOnFocus: true,
      refetchOnReconnect: true,
    });

  const loading = tLoading || mLoading;
  const errorMsg =
    (tError && (tError.data?.message || tError.error)) ||
    (mError && (mError.data?.message || mError.error));

  // ===== Realtime layer (như web) =====
  const socket = useSocket();
  const liveMapRef = useRef(new Map()); // id → match (merged)
  const [liveBump, setLiveBump] = useState(0);
  const pendingRef = useRef(new Map());
  const rafRef = useRef(null);
  const subscribedBracketsRef = useRef(new Set());
  const joinedMatchesRef = useRef(new Set());

  // Seed dữ liệu API vào liveMap
  useEffect(() => {
    const mp = new Map();
    const list = matchesResp?.list || [];
    for (const m of list) if (m?._id) mp.set(String(m._id), m);
    liveMapRef.current = mp;
    setLiveBump((x) => x + 1);
  }, [matchesResp]);

  const flushPending = useCallback(() => {
    if (!pendingRef.current.size) return;
    const mp = liveMapRef.current;
    for (const [mid, inc] of pendingRef.current) {
      const cur = mp.get(mid);
      const vNew = Number(inc?.liveVersion ?? inc?.version ?? 0);
      const vOld = Number(cur?.liveVersion ?? cur?.version ?? 0);
      const merged = !cur || vNew >= vOld ? { ...(cur || {}), ...inc } : cur;
      mp.set(mid, merged);
    }
    pendingRef.current.clear();
    setLiveBump((x) => x + 1);
  }, []);

  const queueUpsert = useCallback(
    (incRaw) => {
      const inc = incRaw?.data ?? incRaw?.match ?? incRaw;
      if (!inc?._id) return;

      // Chuẩn hóa vài field object → {_id, name} để tránh re-render nặng
      const normalizeEntity = (v) => {
        if (v == null) return v;
        if (typeof v === "string" || typeof v === "number") return v;
        if (typeof v === "object") {
          return {
            _id: v._id ?? (typeof v.id === "string" ? v.id : undefined),
            name:
              (typeof v.name === "string" && v.name) ||
              (typeof v.label === "string" && v.label) ||
              (typeof v.title === "string" && v.title) ||
              "",
          };
        }
        return v;
      };
      if (inc.court) inc.court = normalizeEntity(inc.court);
      if (inc.venue) inc.venue = normalizeEntity(inc.venue);
      if (inc.location) inc.location = normalizeEntity(inc.location);

      pendingRef.current.set(String(inc._id), inc);
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        flushPending();
      });
    },
    [flushPending]
  );

  const diffSet = (currentSet, nextArr) => {
    const nextSet = new Set(nextArr);
    const added = [];
    const removed = [];
    nextSet.forEach((id) => {
      if (!currentSet.has(id)) added.push(id);
    });
    currentSet.forEach((id) => {
      if (!nextSet.has(id)) removed.push(id);
    });
    return { added, removed, nextSet };
  };

  // Đăng ký listeners 1 lần
  useEffect(() => {
    if (!socket) return;

    const onUpsert = (p) => queueUpsert(p);
    const onRemove = (payload) => {
      const id = String(payload?.id ?? payload?._id ?? "");
      if (!id) return;
      if (liveMapRef.current.has(id)) {
        liveMapRef.current.delete(id);
        setLiveBump((x) => x + 1);
      }
    };
    const onRefilled = () => {
      refetchMatches();
      refetchBrackets();
    };
    const onConnected = () => {
      // Re-join room cũ
      subscribedBracketsRef.current.forEach((bid) =>
        socket.emit("draw:subscribe", { bracketId: bid })
      );
      joinedMatchesRef.current.forEach((mid) => {
        socket.emit("match:join", { matchId: mid });
        socket.emit("match:snapshot:request", { matchId: mid });
      });
    };

    socket.on("connect", onConnected);
    socket.on("match:update", onUpsert);
    socket.on("match:snapshot", onUpsert);
    socket.on("score:updated", onUpsert);
    socket.on("match:deleted", onRemove);
    socket.on("draw:refilled", onRefilled);
    socket.on("bracket:updated", onRefilled);

    return () => {
      socket.off("connect", onConnected);
      socket.off("match:update", onUpsert);
      socket.off("match:snapshot", onUpsert);
      socket.off("score:updated", onUpsert);
      socket.off("match:deleted", onRemove);
      socket.off("draw:refilled", onRefilled);
      socket.off("bracket:updated", onRefilled);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [socket, queueUpsert, refetchMatches, refetchBrackets]);

  // Subscribe brackets theo diff
  const bracketsKey = useMemo(
    () =>
      (brackets || [])
        .map((b) => String(b._id))
        .filter(Boolean)
        .sort()
        .join(","),
    [brackets]
  );
  useEffect(() => {
    if (!socket) return;
    const nextIds =
      (brackets || []).map((b) => String(b._id)).filter(Boolean) ?? [];
    const { added, removed, nextSet } = diffSet(
      subscribedBracketsRef.current,
      nextIds
    );
    added.forEach((bid) => socket.emit("draw:subscribe", { bracketId: bid }));
    removed.forEach((bid) =>
      socket.emit("draw:unsubscribe", { bracketId: bid })
    );
    subscribedBracketsRef.current = nextSet;

    return () => {
      nextSet.forEach((bid) =>
        socket.emit("draw:unsubscribe", { bracketId: bid })
      );
    };
  }, [socket, bracketsKey]);

  // Join/leave matches theo diff
  const matchesKey = useMemo(
    () =>
      ((matchesResp?.list || []).map((m) => String(m._id)) || [])
        .filter(Boolean)
        .sort()
        .join(","),
    [matchesResp]
  );
  useEffect(() => {
    if (!socket) return;
    const nextIds =
      (matchesResp?.list || []).map((m) => String(m._id)).filter(Boolean) ?? [];
    const { added, removed, nextSet } = diffSet(
      joinedMatchesRef.current,
      nextIds
    );

    added.forEach((mid) => {
      socket.emit("match:join", { matchId: mid });
      socket.emit("match:snapshot:request", { matchId: mid });
    });
    removed.forEach((mid) => socket.emit("match:leave", { matchId: mid }));

    joinedMatchesRef.current = nextSet;

    return () => {
      nextSet.forEach((mid) => socket.emit("match:leave", { matchId: mid }));
    };
  }, [socket, matchesKey]);

  // Dữ liệu sau merge realtime (lọc đúng tournament)
  const matches = useMemo(
    () =>
      Array.from(liveMapRef.current.values()).filter(
        (m) => String(m?.tournament?._id || m?.tournament) === String(id)
      ),
    [id, liveBump]
  );

  // Quyền dựa trên dữ liệu mới nhất
  const admin = useMemo(() => isAdminUser(me), [me]);
  const manager = useMemo(
    () => isManagerOfTournament(tournament, me) || admin,
    [tournament, me, admin]
  );
  const referee = useMemo(
    () => isRefereeOfTournament(tournament, matches, me),
    [tournament, matches, me]
  );

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

  // CHANGED: “trên sân” = live + mọi trận CÓ SÂN & CHƯA KẾT THÚC (kể cả chưa bắt đầu)
  const courts = useMemo(() => {
    const map = new Map();
    allSorted.forEach((m) => {
      const name = courtNameOf(m);
      if (!map.has(name)) map.set(name, { live: [], queue: [] });

      if (isLive(m)) {
        map.get(name).live.push(m);
      } else if (!isFinished(m) && hasAssignedCourt(m)) {
        // đã gán sân, chưa kết thúc, không live → lên hàng chờ
        map.get(name).queue.push(m);
      }
    });

    // sort từng court theo orderKey
    map.forEach((v) => {
      const byKey = (a, b) => {
        const ak = orderKey(a);
        const bk = orderKey(b);
        for (let i = 0; i < ak.length; i++)
          if (ak[i] !== bk[i]) return ak[i] - bk[i];
        return 0;
      };
      v.live.sort(byKey);
      v.queue.sort(byKey);
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
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
              hitSlop={12}
              style={{ paddingHorizontal: 6, paddingVertical: 4 }}
            >
              <MaterialIcons name="arrow-back" size={22} color="#0f172a" />
            </Pressable>
          ),
          headerRight: () => {
            if (manager || referee)
              return (
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {manager && (
                    <Pressable
                      onPress={() => router.push(`/tournament/${id}/manage`)}
                      style={({ pressed }) => [
                        { padding: 6, opacity: pressed ? 0.6 : 1 },
                      ]}
                    >
                      <View style={styles.headerBtn}>
                        <MaterialIcons name="admin-panel-settings" size={16} />
                        <Text style={styles.headerBtnText}>
                          {admin ? "Admin" : "Quản lý giải"}
                        </Text>
                      </View>
                    </Pressable>
                  )}
                  {referee && (
                    <Pressable
                      onPress={() => router.push(`/tournament/${id}/referee`)}
                      style={({ pressed }) => [
                        { padding: 6, opacity: pressed ? 0.6 : 1 },
                      ]}
                    >
                      <View style={styles.headerBtn}>
                        <MaterialIcons name="rule" size={16} />
                        <Text style={styles.headerBtnText}>Chấm trận</Text>
                      </View>
                    </Pressable>
                  )}
                </View>
              );
          },
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
      {loading && <PageSkeleton />}

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
  container: { padding: 12, gap: 12 },
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
  statusTabs: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tab: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
  },
  tabActive: { backgroundColor: "#dbeafe", borderColor: "#93c5fd" },
  tabText: { fontSize: 13, color: "#334155" },
  tabTextActive: { color: "#1e3a8a", fontWeight: "700" },
  sectionTitle: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitleText: { fontSize: 20, fontWeight: "800", color: "#0f172a" },
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
  headerBtnText: { marginLeft: 6, fontSize: 12, color: "#0f172a" },
  card: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 16,
    padding: 12,
    backgroundColor: "#fff",
  },
  cardHeader: { flexDirection: "row", alignItems: "center", paddingBottom: 8 },
  cardTitle: { fontSize: 16, fontWeight: "800", color: "#0f172a" },
  cardSub: { fontSize: 12, color: "#475569", marginTop: 2 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  chipText: { fontSize: 11, fontWeight: "600" },
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
  courtName: { fontSize: 15, fontWeight: "800", color: "#0f172a" },
  liveMatch: {
    borderLeftWidth: 4,
    borderLeftColor: "#ea580c", // cam (orange-600)
    backgroundColor: "#fff7ed", // cam nhạt (orange-50)
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
  rowLeft: { flexDirection: "row", alignItems: "center", gap: 4 },
  matchCode: { fontWeight: "800", color: "#0f172a" },
  vsText: { color: "#334155", flexShrink: 1, maxWidth: "60%" },
  queueRow: { paddingVertical: 8, paddingHorizontal: 4, borderRadius: 8 },
  queueRowInner: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
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
  matchRowInner: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  matchIcon: { width: 24, alignItems: "center", marginTop: 2 },
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
});
