/* eslint-disable react/prop-types */
// app/tournament/[id]/index.jsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  useColorScheme,
  useWindowDimensions,
  Animated,
  Easing,
  Platform,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSelector } from "react-redux";
import {
  Ionicons,
  MaterialCommunityIcons,
  MaterialIcons,
} from "@expo/vector-icons";

import ResponsiveMatchViewer from "@/components/match/ResponsiveMatchViewer";
import {
  useGetTournamentQuery,
  useListPublicMatchesByTournamentQuery,
  useListTournamentBracketsQuery,
  useGetRegistrationsQuery,
} from "@/slices/tournamentsApiSlice";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";

/* -------------------- helpers (nhẹ, đủ dùng cho overview) -------------------- */
const clamp = (v, min, max) => Math.max(min, Math.min(max, v || 0));
const isLive = (m) =>
  ["live", "ongoing", "playing", "inprogress"].includes(
    String(m?.status || "").toLowerCase()
  );
const isFinished = (m) => String(m?.status || "").toLowerCase() === "finished";
const isScheduled = (m) =>
  [
    "scheduled",
    "upcoming",
    "pending",
    "queued",
    "assigning",
    "assigned",
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
  const p1 =
    pair.player1?.nickName || pair.player1?.nickname || pair.player1?.fullName;
  const p2 =
    pair.player2?.nickName || pair.player2?.nickname || pair.player2?.fullName;
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
    return m.scoreText.trim();
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

/* ----- quyền (copy logic nhẹ từ schedule để hiện nút Manage/Referee) ----- */
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

/* -------------------- theme tokens -------------------- */
function useTokens() {
  const scheme = useColorScheme() ?? "light";
  const dark = scheme === "dark";
  return useMemo(
    () => ({
      scheme,
      dark,
      bg: dark ? "#0b0d10" : "#f5f8fa",
      card: dark ? "#12151a" : "#ffffff",
      soft: dark ? "#1a1f26" : "#f1f5f9",
      border: dark ? "#2a313a" : "#e2e8f0",
      text: dark ? "#eef2f7" : "#0f172a",
      sub: dark ? "#cbd5e1" : "#475569",
      muted: dark ? "#94a3b8" : "#64748b",
      tint: dark ? "#63b3ed" : "#2563eb",

      live: "#e65100",
      ok: dark ? "#4ade80" : "#16a34a",
      warn: dark ? "#facc15" : "#ca8a04",
      err: dark ? "#f87171" : "#dc2626",

      gradA: dark ? "#0b2a4a" : "#1d4ed8",
      gradB: dark ? "#0a1626" : "#0b3aa6",

      skel: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
      shadow: {
        shadowColor: "#000",
        shadowOpacity: dark ? 0.32 : 0.08,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 6 },
        elevation: 3,
      },
    }),
    [scheme]
  );
}

/* -------------------- UI bits -------------------- */
function Pill({ icon, text, color, bg, bd }) {
  return (
    <View style={[S.pill, { backgroundColor: bg, borderColor: bd }]}>
      {!!icon && <View style={{ marginRight: 6 }}>{icon}</View>}
      <Text style={[S.pillText, { color }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

function StatCard({ icon, label, value, hint, tone, T }) {
  const toneMap = {
    blue: { c: T.tint, bg: T.dark ? "rgba(99,179,237,0.12)" : "#e6f0ff" },
    orange: { c: T.live, bg: T.dark ? "rgba(230,81,0,0.14)" : "#fff2e8" },
    green: { c: T.ok, bg: T.dark ? "rgba(74,222,128,0.12)" : "#ecfdf5" },
    gray: { c: T.muted, bg: T.soft },
  };
  const toneObj = toneMap[tone] || toneMap.gray;

  return (
    <View
      style={[
        S.statCard,
        { backgroundColor: T.card, borderColor: T.border, ...T.shadow },
      ]}
    >
      <View style={[S.statIcon, { backgroundColor: toneObj.bg }]}>
        {React.cloneElement(icon, { size: 18, color: toneObj.c })}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[S.statLabel, { color: T.muted }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[S.statValue, { color: T.text }]} numberOfLines={1}>
          {String(value)}
        </Text>
        {!!hint && (
          <Text style={[S.statHint, { color: T.sub }]} numberOfLines={1}>
            {hint}
          </Text>
        )}
      </View>
    </View>
  );
}

function MiniMatchRow({ m, T, onOpen }) {
  const a = teamNameFrom(m, "A");
  const b = teamNameFrom(m, "B");
  const score = scoreText(m);
  const live = isLive(m);

  return (
    <Pressable
      onPress={() => onOpen?.(m._id)}
      style={({ pressed }) => [
        S.mRow,
        {
          backgroundColor: T.card,
          borderColor: T.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={[S.mCode, { color: T.muted }]} numberOfLines={1}>
            {m.code || "Trận"}
          </Text>
          {live ? (
            <Pill
              icon={
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: "#fff",
                  }}
                />
              }
              text="LIVE"
              color="#fff"
              bg={T.live}
              bd={T.live}
            />
          ) : isFinished(m) ? (
            <Pill
              icon={<MaterialIcons name="check" size={12} color={T.text} />}
              text="KẾT THÚC"
              color={T.text}
              bg={T.soft}
              bd={T.border}
            />
          ) : (
            <Pill
              icon={<MaterialIcons name="schedule" size={12} color={T.muted} />}
              text="SẮP DIỄN RA"
              color={T.muted}
              bg="transparent"
              bd={T.border}
            />
          )}
        </View>

        <Text style={[S.mTeam, { color: T.text }]} numberOfLines={1}>
          {a}
        </Text>
        <Text style={[S.mTeam, { color: T.text }]} numberOfLines={1}>
          {b}
        </Text>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            marginTop: 6,
          }}
        >
          <MaterialCommunityIcons name="tennis" size={14} color={T.muted} />
          <Text style={[S.mMeta, { color: T.sub }]} numberOfLines={1}>
            {courtNameOf(m)}
          </Text>
        </View>
      </View>

      <View
        style={{ alignItems: "flex-end", justifyContent: "center", width: 92 }}
      >
        <Text
          style={[S.mScore, { color: live ? T.live : T.text }]}
          numberOfLines={2}
        >
          {score ? score.replace(/, /g, " - ") : "vs"}
        </Text>
        <Ionicons
          name="chevron-forward"
          size={18}
          color={T.muted}
          style={{ marginTop: 8 }}
        />
      </View>
    </Pressable>
  );
}

/* skeleton nhẹ */
function Pulse({ T, style }) {
  const op = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(op, {
          toValue: 0.9,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(op, {
          toValue: 0.45,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [op]);

  return (
    <Animated.View
      style={[
        { backgroundColor: T.skel, opacity: op, borderRadius: 12 },
        style,
      ]}
    />
  );
}

function OverviewSkeleton({ T, insets }) {
  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <View
        style={{
          height: 190 + insets.top,
          paddingTop: insets.top + 12,
          paddingHorizontal: 16,
        }}
      >
        <Pulse T={T} style={{ height: 150, borderRadius: 18 }} />
      </View>
      <View style={{ paddingHorizontal: 16, marginTop: -34 }}>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pulse T={T} style={{ flex: 1, height: 74 }} />
          <Pulse T={T} style={{ flex: 1, height: 74 }} />
        </View>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
          <Pulse T={T} style={{ flex: 1, height: 74 }} />
          <Pulse T={T} style={{ flex: 1, height: 74 }} />
        </View>
        <View style={{ marginTop: 14 }}>
          <Pulse T={T} style={{ height: 18, width: 180, borderRadius: 9 }} />
          <Pulse
            T={T}
            style={{ height: 120, marginTop: 10, borderRadius: 16 }}
          />
        </View>
      </View>
    </View>
  );
}

/* -------------------- main -------------------- */
export default function TournamentOverviewScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const T = useTokens();

  const me = useSelector((s) => s.auth?.userInfo || null);

  const {
    data: tournament,
    isLoading: tLoading,
    error: tError,
    refetch: refetchTournament,
  } = useGetTournamentQuery(id);

  const {
    data: matchesResp,
    isLoading: mLoading,
    error: mError,
    refetch: refetchMatches,
  } = useListPublicMatchesByTournamentQuery({
    tid: id,
    params: { limit: 1000 },
  });

  const {
    data: brackets = [],
    isLoading: bLoading,
    error: bError,
    refetch: refetchBrackets,
  } = useListTournamentBracketsQuery(id, {
    refetchOnMountOrArgChange: true,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  const {
    data: regs = [],
    isLoading: rLoading,
    error: rError,
    refetch: refetchRegs,
  } = useGetRegistrationsQuery(id);

  const loading = tLoading || mLoading || bLoading;
  const matches = matchesResp?.list || [];

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
    const arr = [...matches];
    arr.sort((a, b) => {
      const ak = orderKey(a);
      const bk = orderKey(b);
      for (let i = 0; i < ak.length; i++)
        if (ak[i] !== bk[i]) return ak[i] - bk[i];
      return 0;
    });
    return arr;
  }, [matches]);

  const stats = useMemo(() => {
    const total = allSorted.length;
    const live = allSorted.filter(isLive).length;
    const finished = allSorted.filter(isFinished).length;
    const upcoming = allSorted.filter(
      (m) => !isLive(m) && !isFinished(m)
    ).length;

    const courtsMap = new Map();
    allSorted.forEach((m) => {
      const c = courtNameOf(m);
      if (!courtsMap.has(c)) courtsMap.set(c, { name: c, live: 0, queued: 0 });
      const obj = courtsMap.get(c);
      if (isLive(m)) obj.live += 1;
      else if (!isFinished(m)) obj.queued += 1;
    });
    const courts = Array.from(courtsMap.values());
    const courtsTotal = courts.length;
    const courtsLive = courts.filter((x) => x.live > 0).length;

    const regTotal = Array.isArray(regs) ? regs.length : 0;
    const paidCount = Array.isArray(regs)
      ? regs.filter(
          (r) => String(r?.payment?.status || "").toLowerCase() === "paid"
        ).length
      : 0;

    const donePct = total > 0 ? Math.round((finished / total) * 100) : 0;

    return {
      total,
      live,
      finished,
      upcoming,
      courtsTotal,
      courtsLive,
      regTotal,
      paidCount,
      bracketCount: Array.isArray(brackets) ? brackets.length : 0,
      donePct,
    };
  }, [allSorted, regs, brackets]);

  const liveMatches = useMemo(
    () => allSorted.filter(isLive).slice(0, 4),
    [allSorted]
  );
  const nextMatches = useMemo(
    () => allSorted.filter((m) => !isLive(m) && !isFinished(m)).slice(0, 5),
    [allSorted]
  );

  const bracketQuick = useMemo(() => {
    const list = Array.isArray(brackets) ? brackets : [];
    return list.slice(0, 8).map((b) => ({
      id: String(b?._id || ""),
      name: b?.name || "Bracket",
      order: b?.order ?? 9999,
    }));
  }, [brackets]);

  const errorMsg =
    (tError && (tError.data?.message || tError.error)) ||
    (mError && (mError.data?.message || mError.error)) ||
    (bError && (bError.data?.message || bError.error)) ||
    (rError && (rError.data?.message || rError.error));

  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedMatchId, setSelectedMatchId] = useState(null);

  const openViewer = useCallback((mid) => {
    setSelectedMatchId(mid);
    setViewerOpen(true);
  }, []);
  const closeViewer = useCallback(() => {
    setViewerOpen(false);
    setSelectedMatchId(null);
  }, []);

  const onRefresh = useCallback(() => {
    refetchTournament();
    refetchMatches();
    refetchBrackets();
    refetchRegs();
  }, [refetchTournament, refetchMatches, refetchBrackets, refetchRegs]);

  const fmtDate = useCallback(
    (d) => (d ? new Date(d).toLocaleDateString("vi-VN") : "—"),
    []
  );
  const dateRange = useMemo(() => {
    const a = tournament?.startDate;
    const b = tournament?.endDate;
    if (a && b) return `${fmtDate(a)} – ${fmtDate(b)}`;
    return fmtDate(a) || fmtDate(b);
  }, [tournament, fmtDate]);

  // countdown (ưu tiên registrationDeadline, fallback startDate)
  const deadline = tournament?.registrationDeadline || tournament?.startDate;
  const [countdown, setCountdown] = useState("");
  useEffect(() => {
    if (!deadline) return;
    const target = new Date(deadline).getTime();
    if (!Number.isFinite(target)) return;

    const tick = () => {
      const now = Date.now();
      const diff = target - now;
      if (diff <= 0) {
        setCountdown("Đã tới hạn");
        return;
      }
      const d = Math.floor(diff / (1000 * 60 * 60 * 24));
      const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const m = Math.floor((diff / (1000 * 60)) % 60);
      setCountdown(`${d}d ${h}h ${m}m`);
    };
    tick();
    const itv = setInterval(tick, 30 * 1000);
    return () => clearInterval(itv);
  }, [deadline]);

  const go = useCallback(
    (pathname) => router.push({ pathname, params: { id } }),
    [router, id]
  );

  const col2 = width >= 900;

  if (loading && !tournament) return <OverviewSkeleton T={T} insets={insets} />;

  return (
    <BottomSheetModalProvider>
      <Stack.Screen
        options={{
          title: "Tổng quan giải đấu",
          headerStyle: { backgroundColor: T.card },
          headerTitleStyle: { color: T.text },
          headerShadowVisible: false,
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
              hitSlop={12}
              style={{ paddingHorizontal: 6, paddingVertical: 4 }}
            >
              <Ionicons name="chevron-back" size={24} color={T.text} />
            </Pressable>
          ),
        }}
      />

      <View style={{ flex: 1, backgroundColor: T.bg }}>
        {!!errorMsg && !loading ? (
          <View style={{ padding: 12 }}>
            <View
              style={[
                S.alertErr,
                {
                  borderColor: T.err,
                  backgroundColor: T.dark
                    ? "rgba(248,113,113,0.12)"
                    : "#fee2e2",
                },
              ]}
            >
              <Text style={{ color: T.err, fontWeight: "700" }}>
                {String(errorMsg)}
              </Text>
            </View>
          </View>
        ) : null}

        <ScrollView
          contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={
            <RefreshControl
              refreshing={loading || rLoading}
              onRefresh={onRefresh}
            />
          }
        >
          {/* HERO */}
          <LinearGradient
            colors={[T.gradA, T.gradB]}
            style={[S.hero, { paddingTop: insets.top + 12 }]}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <View style={S.heroBadge}>
                <MaterialCommunityIcons
                  name="trophy-variant"
                  size={16}
                  color="#fff"
                />
                <Text style={S.heroBadgeText} numberOfLines={1}>
                  {tournament?.eventType?.toLowerCase?.().includes("single")
                    ? "GIẢI ĐƠN"
                    : "GIẢI ĐÔI"}
                </Text>
              </View>

              {!!deadline && !!countdown && (
                <View
                  style={[
                    S.heroCountdown,
                    { borderColor: "rgba(255,255,255,0.25)" },
                  ]}
                >
                  <Ionicons name="time-outline" size={14} color="#fff" />
                  <Text style={S.heroCountdownText} numberOfLines={1}>
                    {countdown}
                  </Text>
                </View>
              )}
            </View>

            <Text style={S.heroTitle} numberOfLines={2}>
              {tournament?.name || "Giải đấu"}
            </Text>

            <View style={{ marginTop: 10, gap: 8 }}>
              {!!tournament?.location && (
                <View
                  style={{
                    flexDirection: "row",
                    gap: 8,
                    alignItems: "flex-start",
                  }}
                >
                  <Ionicons
                    name="location"
                    size={14}
                    color="#fff"
                    style={{ marginTop: 2 }}
                  />
                  <Text style={S.heroMeta} numberOfLines={2}>
                    {tournament.location}
                  </Text>
                </View>
              )}

              <View
                style={{ flexDirection: "row", gap: 8, alignItems: "center" }}
              >
                <Ionicons name="calendar" size={14} color="#fff" />
                <Text style={S.heroMeta} numberOfLines={1}>
                  {dateRange}
                </Text>
              </View>
            </View>

            {/* shortcuts */}
            <View style={[S.shortcutsWrap, { marginTop: 14 }]}>
              <Pressable
                onPress={() => go("/tournament/[id]/schedule")}
                style={({ pressed }) => [
                  S.shortcut,
                  { opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <View style={S.shortcutIcon}>
                  <MaterialIcons name="event-note" size={18} color="#fff" />
                </View>
                <Text style={S.shortcutText}>Lịch</Text>
              </Pressable>

              <Pressable
                onPress={() => go("/tournament/[id]/bracket")}
                style={({ pressed }) => [
                  S.shortcut,
                  { opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <View style={S.shortcutIcon}>
                  <MaterialCommunityIcons
                    name="tournament"
                    size={18}
                    color="#fff"
                  />
                </View>
                <Text style={S.shortcutText}>Sơ đồ</Text>
              </Pressable>

              {/* NOTE: nếu route đăng ký của bạn khác, đổi pathname ở đây */}
              <Pressable
                onPress={() => go("/tournament/[id]/register")}
                style={({ pressed }) => [
                  S.shortcut,
                  { opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <View style={S.shortcutIcon}>
                  <Ionicons name="create-outline" size={18} color="#fff" />
                </View>
                <Text style={S.shortcutText}>Đăng ký</Text>
              </Pressable>
            </View>
          </LinearGradient>

          {/* STATS (overlap) */}
          <View style={{ paddingHorizontal: 16, marginTop: -28 }}>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <StatCard
                  T={T}
                  tone="orange"
                  icon={<Ionicons name="radio" />}
                  label="Đang live"
                  value={stats.live}
                  hint={`${stats.courtsLive}/${stats.courtsTotal} sân có live`}
                />
              </View>
              <View style={{ flex: 1 }}>
                <StatCard
                  T={T}
                  tone="blue"
                  icon={<Ionicons name="list" />}
                  label="Tổng trận"
                  value={stats.total}
                  hint={`${stats.upcoming} sắp tới`}
                />
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
              <View style={{ flex: 1 }}>
                <StatCard
                  T={T}
                  tone="green"
                  icon={<Ionicons name="checkmark-done" />}
                  label="Đã xong"
                  value={stats.finished}
                  hint={`${stats.donePct}% tiến độ`}
                />
              </View>
              <View style={{ flex: 1 }}>
                <StatCard
                  T={T}
                  tone="gray"
                  icon={<Ionicons name="people" />}
                  label="Đăng ký"
                  value={`${stats.paidCount}/${stats.regTotal}`}
                  hint="đã thanh toán / tổng"
                />
              </View>
            </View>

            {/* progress bar */}
            <View
              style={[
                S.progressWrap,
                { backgroundColor: T.card, borderColor: T.border, ...T.shadow },
              ]}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text style={{ color: T.text, fontWeight: "800" }}>
                  Tiến độ giải
                </Text>
                <Text style={{ color: T.sub, fontWeight: "700" }}>
                  {stats.donePct}%
                </Text>
              </View>
              <View
                style={[
                  S.progressTrack,
                  { backgroundColor: T.soft, borderColor: T.border },
                ]}
              >
                <View
                  style={[
                    S.progressFill,
                    {
                      width: `${clamp(stats.donePct, 0, 100)}%`,
                      backgroundColor:
                        stats.donePct >= 90
                          ? T.ok
                          : stats.donePct >= 50
                          ? T.tint
                          : T.live,
                    },
                  ]}
                />
              </View>

              <View
                style={{
                  flexDirection: "row",
                  gap: 8,
                  flexWrap: "wrap",
                  marginTop: 10,
                }}
              >
                <Pill
                  icon={
                    <MaterialCommunityIcons
                      name="stadium"
                      size={14}
                      color={T.text}
                    />
                  }
                  text={`${stats.courtsTotal} sân`}
                  color={T.text}
                  bg={T.soft}
                  bd={T.border}
                />
                <Pill
                  icon={
                    <MaterialCommunityIcons
                      name="tournament"
                      size={14}
                      color={T.text}
                    />
                  }
                  text={`${stats.bracketCount} bracket`}
                  color={T.text}
                  bg={T.soft}
                  bd={T.border}
                />
                {!!tournament?.registrationDeadline && (
                  <Pill
                    icon={
                      <Ionicons name="time-outline" size={14} color={T.text} />
                    }
                    text={`Hạn ĐK: ${fmtDate(tournament.registrationDeadline)}`}
                    color={T.text}
                    bg={T.soft}
                    bd={T.border}
                  />
                )}
              </View>
            </View>
          </View>

          {/* CONTENT GRID */}
          <View style={{ paddingHorizontal: 16, marginTop: 14 }}>
            <View style={[col2 ? { flexDirection: "row", gap: 12 } : null]}>
              {/* LEFT */}
              <View style={[col2 ? { flex: 1 } : null]}>
                {/* LIVE NOW */}
                <View
                  style={[
                    S.block,
                    {
                      backgroundColor: T.card,
                      borderColor: T.border,
                      ...T.shadow,
                    },
                  ]}
                >
                  <View style={S.blockHead}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <MaterialCommunityIcons
                        name="lightning-bolt"
                        size={18}
                        color={T.live}
                      />
                      <Text style={[S.blockTitle, { color: T.text }]}>
                        Đang diễn ra
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => go("/tournament/[id]/schedule")}
                      style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                    >
                      <Text style={{ color: T.tint, fontWeight: "800" }}>
                        Xem tất cả
                      </Text>
                    </Pressable>
                  </View>

                  {liveMatches.length === 0 ? (
                    <Text style={{ color: T.sub, fontStyle: "italic" }}>
                      Hiện chưa có trận live.
                    </Text>
                  ) : (
                    <View style={{ gap: 10 }}>
                      {liveMatches.map((m) => (
                        <MiniMatchRow
                          key={m._id}
                          m={m}
                          T={T}
                          onOpen={openViewer}
                        />
                      ))}
                    </View>
                  )}
                </View>

                {/* NEXT UP */}
                <View
                  style={[
                    S.block,
                    {
                      backgroundColor: T.card,
                      borderColor: T.border,
                      ...T.shadow,
                      marginTop: 12,
                    },
                  ]}
                >
                  <View style={S.blockHead}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <Ionicons name="play-forward" size={18} color={T.tint} />
                      <Text style={[S.blockTitle, { color: T.text }]}>
                        Sắp tới
                      </Text>
                    </View>
                    <Text style={{ color: T.sub, fontWeight: "700" }}>
                      {nextMatches.length} trận
                    </Text>
                  </View>

                  {nextMatches.length === 0 ? (
                    <Text style={{ color: T.sub, fontStyle: "italic" }}>
                      Không còn trận sắp tới.
                    </Text>
                  ) : (
                    <View style={{ gap: 10 }}>
                      {nextMatches.map((m) => (
                        <MiniMatchRow
                          key={m._id}
                          m={m}
                          T={T}
                          onOpen={openViewer}
                        />
                      ))}
                    </View>
                  )}
                </View>
              </View>

              {/* RIGHT */}
              <View style={[col2 ? { flex: 1 } : { marginTop: 12 }]}>
                {/* BRACKETS QUICK */}
                <View
                  style={[
                    S.block,
                    {
                      backgroundColor: T.card,
                      borderColor: T.border,
                      ...T.shadow,
                    },
                  ]}
                >
                  <View style={S.blockHead}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <MaterialCommunityIcons
                        name="tournament"
                        size={18}
                        color={T.tint}
                      />
                      <Text style={[S.blockTitle, { color: T.text }]}>
                        Bracket
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => go("/tournament/[id]/bracket")}
                      style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                    >
                      <Text style={{ color: T.tint, fontWeight: "800" }}>
                        Mở sơ đồ
                      </Text>
                    </Pressable>
                  </View>

                  {bracketQuick.length === 0 ? (
                    <Text style={{ color: T.sub, fontStyle: "italic" }}>
                      Chưa có bracket.
                    </Text>
                  ) : (
                    <View
                      style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                    >
                      {bracketQuick.map((b) => (
                        <View
                          key={b.id}
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderRadius: 999,
                            backgroundColor: T.soft,
                            borderWidth: 1,
                            borderColor: T.border,
                          }}
                        >
                          <Text
                            style={{ color: T.text, fontWeight: "700" }}
                            numberOfLines={1}
                          >
                            {b.name}
                          </Text>
                        </View>
                      ))}
                      {Array.isArray(brackets) &&
                      brackets.length > bracketQuick.length ? (
                        <Text style={{ color: T.sub, marginTop: 6 }}>
                          +{brackets.length - bracketQuick.length} bracket nữa…
                        </Text>
                      ) : null}
                    </View>
                  )}
                </View>

                {/* QUICK ACTIONS (public-safe) */}
                <View
                  style={[
                    S.block,
                    {
                      backgroundColor: T.card,
                      borderColor: T.border,
                      ...T.shadow,
                      marginTop: 12,
                    },
                  ]}
                >
                  <View style={S.blockHead}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <Ionicons name="flash-outline" size={18} color={T.warn} />
                      <Text style={[S.blockTitle, { color: T.text }]}>
                        Thao tác nhanh
                      </Text>
                    </View>
                  </View>

                  <View style={{ gap: 10 }}>
                    <Pressable
                      onPress={() => go("/tournament/[id]/schedule")}
                      style={({ pressed }) => [
                        S.actionRow,
                        {
                          borderColor: T.border,
                          backgroundColor: T.soft,
                          opacity: pressed ? 0.88 : 1,
                        },
                      ]}
                    >
                      <MaterialIcons
                        name="event-note"
                        size={18}
                        color={T.text}
                      />
                      <Text
                        style={{ color: T.text, fontWeight: "800", flex: 1 }}
                      >
                        Lịch thi đấu
                      </Text>
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color={T.muted}
                      />
                    </Pressable>

                    <Pressable
                      onPress={() => go("/tournament/[id]/bracket")}
                      style={({ pressed }) => [
                        S.actionRow,
                        {
                          borderColor: T.border,
                          backgroundColor: T.soft,
                          opacity: pressed ? 0.88 : 1,
                        },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name="tournament"
                        size={18}
                        color={T.text}
                      />
                      <Text
                        style={{ color: T.text, fontWeight: "800", flex: 1 }}
                      >
                        Sơ đồ bracket
                      </Text>
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color={T.muted}
                      />
                    </Pressable>

                    {/* NOTE: đổi pathname nếu route đăng ký khác */}
                    <Pressable
                      onPress={() => go("/tournament/[id]/register")}
                      style={({ pressed }) => [
                        S.actionRow,
                        {
                          borderColor: T.border,
                          backgroundColor: T.soft,
                          opacity: pressed ? 0.88 : 1,
                        },
                      ]}
                    >
                      <Ionicons
                        name="create-outline"
                        size={18}
                        color={T.text}
                      />
                      <Text
                        style={{ color: T.text, fontWeight: "800", flex: 1 }}
                      >
                        Đăng ký / Danh sách
                      </Text>
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color={T.muted}
                      />
                    </Pressable>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </ScrollView>

        {/* viewer bottomsheet */}
        <ResponsiveMatchViewer
          open={viewerOpen}
          matchId={selectedMatchId}
          onClose={closeViewer}
        />
      </View>
    </BottomSheetModalProvider>
  );
}

const S = StyleSheet.create({
  headerBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderRadius: 999,
  },
  headerBtnText: { marginLeft: 5, fontSize: 13, fontWeight: "700" },

  hero: {
    paddingHorizontal: 16,
    paddingBottom: 48,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  heroBadgeText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 12,
    maxWidth: 140,
  },

  heroCountdown: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.18)",
    borderWidth: 1,
  },
  heroCountdownText: { color: "#fff", fontWeight: "900", fontSize: 12 },

  heroTitle: {
    marginTop: 14,
    color: "#fff",
    fontWeight: "900",
    fontSize: 22,
    lineHeight: 30,
    textShadowColor: "rgba(0,0,0,0.25)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  heroMeta: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12,
    lineHeight: 18,
    opacity: 0.95,
  },

  shortcutsWrap: { flexDirection: "row", gap: 10 },
  shortcut: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  shortcutIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  shortcutText: { color: "#fff", fontWeight: "900", fontSize: 12 },

  statCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  statIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  statLabel: { fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  statValue: { fontSize: 16, fontWeight: "900", marginTop: 2 },
  statHint: { fontSize: 10, fontWeight: "700", marginTop: 2 },

  progressWrap: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
  },
  progressTrack: {
    marginTop: 10,
    height: 10,
    borderRadius: 999,
    borderWidth: 1,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
  },

  block: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
  },
  blockHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  blockTitle: { fontSize: 16, fontWeight: "900" },

  mRow: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    flexDirection: "row",
    gap: 12,
  },
  mCode: { fontSize: 12, fontWeight: "800" },
  mTeam: { fontSize: 14, fontWeight: "800", marginTop: 2 },
  mMeta: { fontSize: 12, fontWeight: "700" },
  mScore: { fontSize: 16, fontWeight: "900", textAlign: "right" },

  pill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillText: { fontSize: 11, fontWeight: "900" },

  actionRow: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  alertErr: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
});
