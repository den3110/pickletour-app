// app/(app)/tournament/[id]/referee.jsx
import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from "react";
import {
  ActivityIndicator,
  Alert as RNAlert,
  FlatList,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  useWindowDimensions,
  View,
  ScrollView,
} from "react-native";
import { Stack, useLocalSearchParams, router } from "expo-router";
import { useSelector } from "react-redux";
import { MaterialIcons } from "@expo/vector-icons";

import {
  useGetTournamentQuery,
  useListTournamentBracketsQuery,
  useAdminListMatchesByTournamentQuery,
} from "@/slices/tournamentsApiSlice";

import ResponsiveMatchViewer from "@/components/match/ResponsiveMatchViewer";
import { useSocket } from "@/context/SocketContext";

/* ---------------- helpers ---------------- */
const TYPE_LABEL = (t) => {
  const key = String(t || "").toLowerCase();
  if (key === "roundelim" || key === "round_elim") return "Round Elim";
  if (key === "group") return "Vòng bảng";
  if (key === "po" || key === "playoff") return "Playoff";
  if (key === "double_elim" || key === "doubleelim") return "Double Elim";
  if (key === "swiss") return "Swiss";
  if (key === "gsl") return "GSL";
  if (key === "knockout" || key === "ko") return "Knockout";
  return t || "Khác";
};

// Knockout luôn cuối; Round Elim xếp sau Knockout
const typeOrderWeight = (t) => {
  const k = String(t || "").toLowerCase();
  if (k === "group") return 1;
  if (k === "po" || k === "playoff") return 2;
  if (k === "swiss") return 3;
  if (k === "gsl") return 4;
  if (k === "double_elim" || k === "doubleelim") return 5;
  if (k === "knockout" || k === "ko") return 9; // luôn cuối
  if (k === "roundelim" || k === "round_elim") return 10; // sau knockout
  return 6;
};

const playerName = (p) =>
  p?.nickName || p?.nickname || p?.fullName || p?.name || "—";

const pairLabel = (pair) => {
  if (!pair) return "—";
  if (pair.name) return pair.name;
  const ps = [pair.player1, pair.player2].filter(Boolean).map(playerName);
  return ps.join(" / ") || "—";
};

const matchCode = (m) => m?.code || `R${m?.round ?? "?"}-${m?.order ?? "?"}`;

const StatusPill = ({ status }) => {
  const map = {
    scheduled: { bg: "#e5e7eb", fg: "#111827", label: "Chưa xếp" },
    queued: { bg: "#e0f2fe", fg: "#075985", label: "Trong hàng chờ" },
    assigned: { bg: "#ede9fe", fg: "#5b21b6", label: "Đã gán sân" },
    live: { bg: "#fff7ed", fg: "#9a3412", label: "Đang thi đấu" },
    finished: { bg: "#dcfce7", fg: "#166534", label: "Đã kết thúc" },
  };
  const v = map[String(status || "").toLowerCase()] || {
    bg: "#e5e7eb",
    fg: "#111827",
    label: status || "—",
  };
  return (
    <View
      style={{
        backgroundColor: v.bg,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 8,
      }}
    >
      <Text style={{ color: v.fg, fontSize: 12 }}>{v.label}</Text>
    </View>
  );
};

const IconBtn = ({ name, onPress, color = "#111", size = 18, style }, ref) => (
  <Pressable
    ref={ref}
    onPress={onPress}
    style={({ pressed }) => [style, pressed && { opacity: 0.8 }]}
  >
    <MaterialIcons name={name} size={size} color={color} />
  </Pressable>
);
const IconBtnRef = React.forwardRef(IconBtn);

// Trọng tài của trận
const _extractRefereeIds = (m) => {
  if (!m) return [];
  const raw = m.referees ?? m.referee ?? m.judges ?? [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr
    .map((r) =>
      String(r?.user?._id ?? r?.user ?? r?._id ?? r?.id ?? (r || "")).trim()
    )
    .filter(Boolean);
};
const isUserRefereeOfMatch = (m, user) => {
  if (!user?._id) return false;
  const myId = String(user._id);
  const refIds = _extractRefereeIds(m).map(String);
  return refIds.includes(myId);
};

// Đường dẫn “trang bắt trận”
const refereeRouteOf = (m) => `/match/${m._id}/referee`;

/* --------- trạng thái: thứ tự nhóm cố định (live → assigned → queued → scheduled → finished) --------- */
const _normStatus = (s) => String(s || "").toLowerCase();
const STATUS_GROUP_WEIGHT = {
  live: 0,
  assigned: 1,
  queued: 2,
  scheduled: 3,
  finished: 4,
};
const statusWeight = (s) =>
  STATUS_GROUP_WEIGHT.hasOwnProperty(_normStatus(s))
    ? STATUS_GROUP_WEIGHT[_normStatus(s)]
    : 3.5; // lỡ có trạng thái lạ => giữa scheduled & finished

/* ---------------- main (Public Referee Center) ---------------- */
export default function RefereeCenterScreen() {
  const { id } = useLocalSearchParams();
  const scheme = useColorScheme() ?? "light";
  const { width } = useWindowDimensions();

  const tint = scheme === "dark" ? "#7cc0ff" : "#0a84ff";
  const bg = scheme === "dark" ? "#0b0d10" : "#f6f8fc";
  const cardBg = scheme === "dark" ? "#16181c" : "#ffffff";
  const border = scheme === "dark" ? "#2e2f33" : "#e4e8ef";
  const text = scheme === "dark" ? "#f7f7f7" : "#111";
  const subtext = scheme === "dark" ? "#c9c9c9" : "#444";

  const me = useSelector((s) => s.auth?.userInfo || null);

  // ===== Header-right dropdown state & refs (PHẢI ở trước mọi early return)
  const [hdrMenuOpen, setHdrMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState(null); // {x,y,width,height}
  const hdrBtnRef = useRef(null);
  const onToggleHdrMenu = useCallback(() => {
    if (hdrMenuOpen) return setHdrMenuOpen(false);
    try {
      hdrBtnRef.current?.measureInWindow?.((x, y, w, h) => {
        setMenuAnchor({ x, y, width: w, height: h });
        setHdrMenuOpen(true);
      });
      if (!hdrBtnRef.current?.measureInWindow) setHdrMenuOpen(true);
    } catch {
      setHdrMenuOpen(true);
    }
  }, [hdrMenuOpen]);

  // ===== Socket realtime (merge match updates)
  const socket = useSocket();
  const liveMapRef = useRef(new Map()); // id -> merged match
  const pendingRef = useRef(new Map());
  const rafRef = useRef(null);
  const [liveBump, setLiveBump] = useState(0);
  const joinedMatchesRef = useRef(new Set());
  const lastSnapshotAtRef = useRef(new Map());

  const requestSnapshot = useCallback(
    (mid) => {
      if (!socket || !mid) return;
      const now = Date.now();
      const last = lastSnapshotAtRef.current.get(mid) || 0;
      if (now - last < 600) return; // throttle
      lastSnapshotAtRef.current.set(mid, now);
      socket.emit("match:snapshot:request", { matchId: mid });
    },
    [socket]
  );

  const queueUpsertRef = useRef(null);
  const requestSnapshotRef = useRef(null);
  useEffect(() => {
    queueUpsertRef.current = (payload) => {
      const incRaw = payload?.data ?? payload?.match ?? payload;
      const id = incRaw?._id ?? incRaw?.id ?? incRaw?.matchId;
      if (!id) return;
      const inc = { ...(incRaw || {}), _id: String(id) };

      if (Array.isArray(inc.scores) && !inc.gameScores)
        inc.gameScores = inc.scores;
      if (typeof inc.score_text === "string" && !inc.scoreText)
        inc.scoreText = inc.score_text;

      pendingRef.current.set(String(inc._id), inc);
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        if (!pendingRef.current.size) return;
        const mp = liveMapRef.current;
        for (const [mid, inc2] of pendingRef.current) {
          const cur = mp.get(mid);
          const vNew = Number(inc2?.liveVersion ?? inc2?.version ?? 0);
          const vOld = Number(cur?.liveVersion ?? cur?.version ?? 0);
          const merged =
            !cur || vNew >= vOld ? { ...(cur || {}), ...inc2 } : cur;
          mp.set(mid, merged);
        }
        pendingRef.current.clear();
        setLiveBump((x) => x + 1);
      });
    };
    requestSnapshotRef.current = requestSnapshot;
  }, [requestSnapshot]);

  // Queries (PUBLIC)
  const {
    data: tour,
    isLoading: tourLoading,
    isFetching: tourFetching,
    error: tourErr,
    refetch: refetchTour,
  } = useGetTournamentQuery(id, {
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  const {
    data: bracketsData = [],
    isLoading: brLoading,
    isFetching: brFetching,
    error: brErr,
    refetch: refetchBrackets,
  } = useListTournamentBracketsQuery(id, {
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  const {
    data: matchPage,
    isLoading: mLoading,
    isFetching: mFetching,
    error: mErr,
    refetch: refetchMatches,
  } = useAdminListMatchesByTournamentQuery(
    { tid: id, page: 1, pageSize: 1000 },
    { refetchOnFocus: true, refetchOnReconnect: true }
  );

  // Seed realtime map từ API
  const allMatches = useMemo(
    () => (Array.isArray(matchPage?.list) ? matchPage.list : []),
    [matchPage?.list]
  );
  const seededFingerprintRef = useRef("");
  useEffect(() => {
    if (!allMatches.length) return;
    const fp = allMatches
      .map((m) =>
        [
          String(m?._id || ""),
          String(m?.liveVersion ?? m?.version ?? m?.updatedAt ?? ""),
        ].join(":")
      )
      .join("|");
    if (fp === seededFingerprintRef.current) return;
    seededFingerprintRef.current = fp;

    const mp = new Map();
    for (const m of allMatches) if (m?._id) mp.set(String(m._id), m);
    liveMapRef.current = mp;
    setLiveBump((x) => x + 1);
  }, [allMatches]);

  // Socket listeners
  useEffect(() => {
    if (!socket) return;

    const onConnected = () => {
      joinedMatchesRef.current.forEach((mid) => {
        socket.emit("match:join", { matchId: mid });
        requestSnapshotRef.current?.(mid);
      });
    };
    const onUpsert = (payload) => queueUpsertRef.current?.(payload);
    const onRemove = (payload) => {
      const id = String(payload?.id ?? payload?._id ?? "");
      if (!id) return;
      if (liveMapRef.current.has(id)) {
        liveMapRef.current.delete(id);
        setLiveBump((x) => x + 1);
      }
    };
    const lastRefillAtRef = { current: 0 };
    const onRefilled = () => {
      const now = Date.now();
      if (now - lastRefillAtRef.current < 800) return;
      lastRefillAtRef.current = now;
      refetchMatches?.();
      refetchBrackets?.();
    };

    const applyDirectMerge = (raw) => {
      const mp = liveMapRef.current;
      const incRaw = raw?.data ?? raw?.match ?? raw;
      const id = incRaw?._id ?? incRaw?.id ?? incRaw?.matchId;
      if (!id) return;
      const _id = String(id);
      const cur = mp.get(_id);

      const inc = { ...(incRaw || {}), _id };
      if (Array.isArray(inc.scores) && !inc.gameScores)
        inc.gameScores = inc.scores;
      if (inc.score_text && !inc.scoreText) inc.scoreText = inc.score_text;
      if (inc.state && !inc.status) inc.status = inc.state;
      if (inc.match_status && !inc.status) inc.status = inc.match_status;
      if (inc.updated_at && !inc.updatedAt) inc.updatedAt = inc.updated_at;

      const tNew = Date.parse(inc?.updatedAt ?? inc?.liveAt ?? 0);
      const tOld = Date.parse(cur?.updatedAt ?? cur?.liveAt ?? 0);
      const vNew = Number(inc?.liveVersion ?? inc?.version ?? NaN);
      const vOld = Number(cur?.liveVersion ?? cur?.version ?? NaN);

      let accept = !cur;
      if (!accept) {
        if (Number.isFinite(tNew) && Number.isFinite(tOld))
          accept = tNew >= tOld;
        else if (Number.isFinite(vNew) && Number.isFinite(vOld))
          accept = vNew >= vOld;
      }

      if (!accept) return;
      const next = { ...(cur || {}), ...inc };
      mp.set(_id, next);
      setLiveBump((x) => x + 1);
    };

    const onScoreUpdated = (payload) => {
      const mid = String(payload?.matchId ?? payload?.id ?? payload?._id ?? "");
      const hasData =
        payload?.data ||
        payload?.match ||
        Object.keys(payload || {}).length > 2;
      if (!hasData) {
        if (mid) requestSnapshotRef.current?.(mid);
        return;
      }
      applyDirectMerge(payload);
    };

    socket.on("connect", onConnected);
    socket.on("match:snapshot", onUpsert);
    socket.on("score:updated", onScoreUpdated);
    socket.on("match:deleted", onRemove);
    socket.on("draw:refilled", onRefilled);
    socket.on("bracket:updated", onRefilled);

    return () => {
      socket.off("connect", onConnected);
      socket.off("match:snapshot", onUpsert);
      socket.off("score:updated", onScoreUpdated);
      socket.off("match:deleted", onRemove);
      socket.off("draw:refilled", onRefilled);
      socket.off("bracket:updated", onRefilled);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [socket, refetchMatches, refetchBrackets]);

  // Join ALL matches
  const allMatchIds = useMemo(
    () => (allMatches || []).map((m) => String(m?._id)).filter(Boolean),
    [allMatches]
  );
  useEffect(() => {
    if (!socket) return;
    const cur = joinedMatchesRef.current;

    allMatchIds.forEach((mid) => {
      if (!cur.has(mid)) {
        socket.emit("match:join", { matchId: mid });
        requestSnapshot(mid);
        cur.add(mid);
      }
    });
    cur.forEach((mid) => {
      if (!allMatchIds.includes(mid)) {
        socket.emit("match:leave", { matchId: mid });
        cur.delete(mid);
      }
    });

    return () => {
      cur.forEach((mid) => socket.emit("match:leave", { matchId: mid }));
      cur.clear();
    };
  }, [socket, allMatchIds, requestSnapshot]);

  // Matches đã merge realtime (chỉ của giải hiện tại)
  const mergedAllMatches = useMemo(() => {
    const vals = Array.from(liveMapRef.current.values());
    return vals.filter(
      (m) => String(m?.tournament?._id || m?.tournament) === String(id)
    );
  }, [id, liveBump]);

  // Tabs động theo type
  const typesAvailable = useMemo(() => {
    const uniq = new Map();
    (bracketsData || []).forEach((b) => {
      const t = (b?.type || "").toString().toLowerCase();
      if (!t) return;
      if (!uniq.has(t))
        uniq.set(t, {
          type: t,
          label: TYPE_LABEL(t),
          weight: typeOrderWeight(t),
        });
    });
    if (uniq.size === 0)
      uniq.set("group", { type: "group", label: "Vòng bảng", weight: 1 });
    return Array.from(uniq.values()).sort((a, b) => a.weight - b.weight);
  }, [bracketsData]);

  const [tab, setTab] = useState(typesAvailable[0]?.type || "group");
  useEffect(() => {
    const existed = typesAvailable.some((t) => t.type === tab);
    const fallback = typesAvailable[0]?.type || "group";
    if (!existed && fallback && fallback !== tab) setTab(fallback);
  }, [typesAvailable, tab]);

  // Lọc/sort
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState("time"); // "round" | "order" | "time"
  const [sortDir, setSortDir] = useState("asc");

  // so sánh trong NHÓM trạng thái (giữ nguyên logic cũ)
  const compareWithinGroup = useCallback(
    (a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;

      if (sortKey === "order") {
        if ((a?.order ?? 0) !== (b?.order ?? 0))
          return ((a?.order ?? 0) - (b?.order ?? 0)) * dir;
        if ((a?.round ?? 0) !== (b?.round ?? 0))
          return ((a?.round ?? 0) - (b?.round ?? 0)) * dir;
        const ta = new Date(a?.scheduledAt || a?.createdAt || 0).getTime();
        const tb = new Date(b?.scheduledAt || b?.createdAt || 0).getTime();
        return (ta - tb) * dir;
      }

      if (sortKey === "time") {
        const ta = new Date(a?.scheduledAt || a?.createdAt || 0).getTime();
        const tb = new Date(b?.scheduledAt || b?.createdAt || 0).getTime();
        if (ta !== tb) return (ta - tb) * dir;
        if ((a?.round ?? 0) !== (b?.round ?? 0))
          return ((a?.round ?? 0) - (b?.round ?? 0)) * dir;
        return ((a?.order ?? 0) - (b?.order ?? 0)) * dir;
      }

      // default round
      if ((a?.round ?? 0) !== (b?.round ?? 0))
        return ((a?.round ?? 0) - (b?.round ?? 0)) * dir;
      if ((a?.order ?? 0) !== (b?.order ?? 0))
        return ((a?.order ?? 0) - (b?.order ?? 0)) * dir;
      const ta = new Date(a?.scheduledAt || a?.createdAt || 0).getTime();
      const tb = new Date(b?.scheduledAt || b?.createdAt || 0).getTime();
      return (ta - tb) * dir;
    },
    [sortKey, sortDir]
  );

  const filterSortMatches = useCallback(
    (list) => {
      const kw = q.trim().toLowerCase();
      const filtered = list.filter((m) => {
        if (!kw) return true;
        const text = [
          matchCode(m),
          pairLabel(m?.pairA),
          pairLabel(m?.pairB),
          m?.status,
          m?.video,
        ]
          .join(" ")
          .toLowerCase();
        return text.includes(kw);
      });

      // 1) sort theo NHÓM trạng thái cố định
      // 2) trong cùng nhóm, áp dụng sortKey/sortDir hiện tại
      const sorted = filtered.sort((a, b) => {
        const wa = statusWeight(a?.status);
        const wb = statusWeight(b?.status);
        if (wa !== wb) return wa - wb;
        return compareWithinGroup(a, b);
      });

      return sorted;
    },
    [q, compareWithinGroup]
  );

  // Viewer
  const [viewer, setViewer] = useState({ open: false, matchId: null });
  const openMatch = (mid) => setViewer({ open: true, matchId: mid });
  const closeMatch = () => setViewer({ open: false, matchId: null });

  // Refresh
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    try {
      setRefreshing(true);
      await Promise.all([refetchTour(), refetchBrackets(), refetchMatches()]);
    } finally {
      setRefreshing(false);
    }
  };

  // Guards
  const isInitialLoading = tourLoading || brLoading || mLoading;
  const hasError = tourErr || brErr || mErr;

  /* ----------- small UI ----------- */
  const Pill = ({ label, kind = "default" }) => {
    const map = {
      default: { bg: "#eef2f7", fg: "#263238" },
      primary: { bg: "#e0f2fe", fg: "#075985" },
    };
    const st = map[kind] || map.default;
    return (
      <View
        style={{
          backgroundColor: st.bg,
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: 8,
        }}
      >
        <Text style={{ color: st.fg, fontSize: 12 }}>{label}</Text>
      </View>
    );
  };

  const MiniChipBtn = ({ icon, label, onPress, color = tint }) => (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.miniBtn,
        { borderColor: color, paddingHorizontal: 10, paddingVertical: 6 },
        pressed && { opacity: 0.9 },
      ]}
    >
      <MaterialIcons name={icon} size={16} color={color} />
      <Text
        style={{ color, fontSize: 12, fontWeight: "700" }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );

  const VideoPill = ({ has }) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          backgroundColor: has ? "#dcfce7" : "#eef2f7",
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: 999,
        }}
      >
        <MaterialIcons
          name="videocam"
          size={14}
          color={has ? "#166534" : "#263238"}
        />
        <Text style={{ color: has ? "#166534" : "#263238", fontSize: 12 }}>
          Video
        </Text>
      </View>
    </View>
  );

  const ActionButtons = ({ m }) => {
    const has = !!m?.video;
    const canStart = isUserRefereeOfMatch(m, me) && m?.status !== "finished";
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.actionsWrap}
      >
        {canStart && (
          <MiniChipBtn
            icon="play-arrow"
            label="Bắt trận"
            onPress={() => router.push(refereeRouteOf(m))}
          />
        )}
        {has && (
          <MiniChipBtn
            icon="open-in-new"
            label="Mở"
            onPress={() =>
              Linking.openURL(m.video).catch(() =>
                RNAlert.alert("Lỗi", "Không mở được liên kết.")
              )
            }
          />
        )}
      </ScrollView>
    );
  };

  /* ----------- row render ----------- */
  const renderMatchRow = ({ item: m }) => {
    const hasVideo = !!m?.video;
    return (
      <Pressable
        onPress={() => openMatch(m._id)}
        style={({ pressed }) => [
          styles.matchRow,
          { borderColor: border, backgroundColor: cardBg },
          pressed && { opacity: 0.95 },
        ]}
      >
        {/* HÀNG 1: Cụm action buttons */}
        <ActionButtons m={m} />

        {/* HÀNG 2: Nội dung trận */}
        <View style={styles.contentBlock}>
          <Text
            style={[styles.code, { color: text }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {matchCode(m)}
          </Text>
          <Text style={{ color: text }} numberOfLines={1} ellipsizeMode="tail">
            {pairLabel(m?.pairA)}
          </Text>
          <Text style={{ color: text }} numberOfLines={1} ellipsizeMode="tail">
            {pairLabel(m?.pairB)}
          </Text>

          <View style={styles.metaRow}>
            <StatusPill status={m?.status} />
            <Text style={{ color: subtext, fontSize: 12 }}>
              Vòng {m?.round ?? "—"} • Thứ tự {m?.order ?? "—"}
            </Text>
            <VideoPill has={hasVideo} />
          </View>
        </View>
      </Pressable>
    );
  };

  const renderBracket = ({ item: b }) => {
    const bid = String(b?._id);
    const matches = mergedAllMatches.filter(
      (m) => String(m?.bracket?._id ?? m?.bracket) === bid
    );
    const list = filterSortMatches(matches);

    return (
      <View
        style={[styles.card, { backgroundColor: cardBg, borderColor: border }]}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginBottom: 10,
            flexWrap: "wrap",
          }}
        >
          <Text
            style={[styles.bracketTitle, { color: text }]}
            numberOfLines={1}
          >
            {b?.name || "Bracket"}
          </Text>
          <Pill label={TYPE_LABEL(b?.type)} />
          {typeof b?.stage === "number" ? (
            <Pill label={`Stage ${b.stage}`} />
          ) : null}
          <Pill label={`${list.length} trận`} kind="primary" />
        </View>

        {list.length === 0 ? (
          <View style={[styles.emptyBox, { borderColor: border }]}>
            <Text style={{ color: subtext }}>Chưa có trận nào.</Text>
          </View>
        ) : (
          <FlatList
            data={list}
            keyExtractor={(m) => String(m._id)}
            renderItem={renderMatchRow}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            scrollEnabled={false}
            extraData={`${sortKey}|${sortDir}|${q}|${liveBump}`}
          />
        )}
      </View>
    );
  };

  /* ----------- guards ----------- */
  if (isInitialLoading) {
    return (
      <>
        <Stack.Screen
          options={{ title: "Trọng tài", headerTitleAlign: "center" }}
        />
        <View style={[styles.center, { backgroundColor: bg }]}>
          <ActivityIndicator size="large" color={tint} />
        </View>
      </>
    );
  }
  if (hasError) {
    return (
      <>
        <Stack.Screen
          options={{ title: "Trọng tài", headerTitleAlign: "center" }}
        />
        <View style={[styles.screen, { backgroundColor: bg }]}>
          <View
            style={[
              styles.alert,
              { borderColor: "#ef4444", backgroundColor: "#fee2e2" },
            ]}
          >
            <Text style={{ color: "#991b1b" }}>
              {tourErr?.data?.message ||
                brErr?.data?.message ||
                mErr?.data?.message ||
                "Lỗi tải dữ liệu"}
            </Text>
          </View>
        </View>
      </>
    );
  }

  /* ----------- render ----------- */
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: `Trọng tài: ${tour?.name || ""}`,
          headerTitleAlign: "center",
          headerRight: () => (
            <IconBtnRef
              ref={hdrBtnRef}
              name="more-vert"
              color={tint}
              size={22}
              onPress={onToggleHdrMenu}
              style={{ paddingHorizontal: 10, paddingVertical: 6 }}
            />
          ),
        }}
      />

      <View style={[styles.screen, { backgroundColor: bg }]}>
        {/* Controls */}
        <View
          style={[
            styles.toolbar,
            { borderColor: border, backgroundColor: cardBg },
          ]}
        >
          <View style={[styles.inputWrap, { borderColor: border }]}>
            <MaterialIcons name="search" size={18} color={subtext} />
            <TextInput
              style={[styles.input, { color: text }]}
              placeholder="Tìm trận, cặp đấu, link…"
              placeholderTextColor="#9aa0a6"
              value={q}
              onChangeText={setQ}
            />
          </View>

          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <PickerChip
              label={`Sắp xếp: ${
                sortKey === "time"
                  ? "Thời gian"
                  : sortKey === "order"
                  ? "Thứ tự"
                  : "Vòng"
              }`}
              onPress={() =>
                setSortKey((k) =>
                  k === "time" ? "round" : k === "round" ? "order" : "time"
                )
              }
              icon="sort"
            />
            <PickerChip
              label={`Chiều: ${sortDir === "asc" ? "Tăng" : "Giảm"}`}
              onPress={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              icon={sortDir === "asc" ? "arrow-upward" : "arrow-downward"}
            />
            <Pill
              label={`${(bracketsData || []).length} loại • ${TYPE_LABEL(tab)}`}
            />
          </View>
        </View>

        {/* Tabs động */}
        <View style={[styles.tabs, { borderColor: border }]}>
          {typesAvailable.map((t) => {
            const active = t.type === tab;
            return (
              <Pressable
                key={t.type}
                onPress={() => setTab(t.type)}
                style={({ pressed }) => [
                  styles.tabItem,
                  {
                    backgroundColor: active ? tint : "transparent",
                    borderColor: active ? tint : border,
                  },
                  pressed && { opacity: 0.95 },
                ]}
              >
                <Text
                  style={{ color: active ? "#fff" : text, fontWeight: "700" }}
                >
                  {TYPE_LABEL(t.type)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* List brackets */}
        <FlatList
          data={(bracketsData || []).filter(
            (b) =>
              String(b?.type || "").toLowerCase() === String(tab).toLowerCase()
          )}
          keyExtractor={(b) => String(b._id)}
          renderItem={renderBracket}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          refreshing={refreshing || tourFetching || brFetching || mFetching}
          onRefresh={onRefresh}
          contentContainerStyle={{ paddingBottom: 24 }}
          ListEmptyComponent={
            <View
              style={[
                styles.alert,
                { borderColor: "#0284c7", backgroundColor: "#e0f2fe" },
              ]}
            >
              <Text style={{ color: "#075985" }}>
                Chưa có bracket thuộc loại {TYPE_LABEL(tab)}.
              </Text>
            </View>
          }
          extraData={liveBump}
        />
        <ResponsiveMatchViewer
          open={viewer.open}
          matchId={viewer.matchId}
          onClose={closeMatch}
        />
      </View>

      {/* Header dropdown (anchored) */}
      {hdrMenuOpen && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setHdrMenuOpen(false)}
          />
          <View
            style={[
              styles.menuCard,
              {
                borderColor: border,
                backgroundColor: cardBg,
                top: 0,
                right: 25,
              },
            ]}
          >
            <Pressable
              onPress={() => {
                setHdrMenuOpen(false);
                router.push(`/tournament/${id}/bracket`);
              }}
              style={({ pressed }) => [
                styles.menuItem,
                pressed && { opacity: 0.7 },
              ]}
            >
              <MaterialIcons name="home" size={18} color={text} />
              <Text style={{ color: text, fontWeight: "600" }}>Sơ đồ giải</Text>
            </Pressable>
          </View>
        </View>
      )}
      {/* Viewer */}
    </View>
  );
}

/* ---------------- small UI ---------------- */
function BtnPrimary({ onPress, children, disabled }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: disabled ? "#94a3b8" : "#0a84ff" },
        pressed && !disabled && { opacity: 0.9 },
      ]}
    >
      <Text style={{ color: "#fff", fontWeight: "700" }}>{children}</Text>
    </Pressable>
  );
}
function BtnOutline({ onPress, children }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        styles.btnOutline,
        pressed && { opacity: 0.95 },
      ]}
    >
      <Text style={{ color: "#0a84ff", fontWeight: "700" }}>{children}</Text>
    </Pressable>
  );
}
function PickerChip({ label, onPress, icon }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          backgroundColor: "#eef2f7",
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 999,
        },
        pressed && { opacity: 0.9 },
      ]}
    >
      {icon ? <MaterialIcons name={icon} size={16} color="#263238" /> : null}
      <Text style={{ color: "#263238", fontSize: 12, fontWeight: "600" }}>
        {label}
      </Text>
    </Pressable>
  );
}

/* ---------------- styles ---------------- */
const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  tabs: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 12,
    padding: 4,
    gap: 8,
    marginBottom: 12,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },

  toolbar: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
    gap: 10,
  },
  inputWrap: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: Platform.select({ ios: 10, android: 8 }),
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  input: { flex: 1, fontSize: 15 },

  card: { borderWidth: 1, borderRadius: 14, padding: 12 },
  bracketTitle: { fontSize: 16, fontWeight: "700" },

  /* match row */
  matchRow: { borderWidth: 1, borderRadius: 12, padding: 10 },
  actionsWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingRight: 4,
  },
  contentBlock: { marginTop: 8, gap: 2 },
  metaRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    marginTop: 6,
    flexWrap: "wrap",
  },

  code: { fontWeight: "700", marginBottom: 4 },

  btn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
  btnOutline: {
    borderWidth: 1,
    borderColor: "#0a84ff",
    backgroundColor: "transparent",
  },
  miniBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
  },

  alert: { borderWidth: 1, borderRadius: 12, padding: 12, marginVertical: 8 },
  emptyBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
  },

  /* header dropdown */
  menuCard: {
    position: "absolute",
    minWidth: 180,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 6,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
});
