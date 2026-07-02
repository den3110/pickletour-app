import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useTheme } from "@react-navigation/native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSelector } from "react-redux";

import ResponsiveMatchViewer from "@/components/match/ResponsiveMatchViewer";
import AssignCourtSheet from "@/components/sheets/AssignCourtSheet";
import AssignRefSheet from "@/components/sheets/AssignRefSheet";
import CourtManagerSheet from "@/components/sheets/CourtManagerSheet";
import LiveSetupSheet from "@/components/sheets/LiveSetupSheet";
import ManageRefereesSheet from "@/components/sheets/ManageRefereesSheet";
import TournamentManagersSheet from "@/components/sheets/TournamentManagersSheet";
import { useSocket } from "@/context/SocketContext";
import { useSocketRoomSet } from "@/hooks/useSocketRoomSet";
import {
  useAdminGetBracketsQuery,
  useAdminListMatchesByTournamentQuery,
  useAdminSetMatchLiveUrlMutation,
  useGetRegistrationsQuery,
  useGetTournamentQuery,
  useListTournamentManagersQuery,
} from "@/slices/tournamentsApiSlice";
import { useListTournamentRefereesQuery } from "@/slices/refereeScopeApiSlice";
import {
  getMatchDisplayCode,
  getMatchSideDisplayName,
  isNewerOrEqualMatchPayload,
  mergeMatchPayload,
  normalizeMatchDisplay,
} from "@/utils/matchDisplay";
import { buildRefereeMatchRoute } from "@/utils/refereeMatchRoute";

type ConsoleSection = "overview" | "matches" | "operations" | "people";

type Tone = "neutral" | "good" | "info" | "warn" | "danger";

type ConsoleTokens = {
  colors: any;
  dark: boolean;
  page: string;
  header: string;
  card: string;
  elevated: string;
  text: string;
  muted: string;
  border: string;
  softBorder: string;
  primary: string;
  primarySoft: string;
  premium: string;
  premiumSoft: string;
  success: string;
  successSoft: string;
  warn: string;
  warnSoft: string;
  danger: string;
  dangerSoft: string;
  info: string;
  infoSoft: string;
  chip: string;
};

const SECTION_TABS: {
  key: ConsoleSection;
  label: string;
  icon: any;
}[] = [
  { key: "overview", label: "Tổng quan", icon: "space-dashboard" },
  { key: "matches", label: "Trận đấu", icon: "sports-tennis" },
  { key: "operations", label: "Vận hành", icon: "settings-suggest" },
  { key: "people", label: "Nhân sự", icon: "groups" },
];

const MATCH_FILTERS: { key: string; label: string; icon: any }[] = [
  { key: "all", label: "Tất cả", icon: "apps" },
  { key: "attention", label: "Cần xử lý", icon: "priority-high" },
  { key: "live", label: "Đang live", icon: "radio-button-checked" },
  { key: "noCourt", label: "Chưa sân", icon: "stadium" },
  { key: "noRef", label: "Chưa TT", icon: "how-to-reg" },
  { key: "noVideo", label: "Chưa video", icon: "videocam-off" },
  { key: "active", label: "Chưa xong", icon: "pending-actions" },
  { key: "finished", label: "Đã xong", icon: "verified" },
];

const paidStatuses = new Set([
  "paid",
  "done",
  "completed",
  "confirmed",
  "success",
  "succeeded",
  "approved",
]);

const statusLabelMap: Record<string, string> = {
  live: "Đang live",
  ongoing: "Đang live",
  playing: "Đang live",
  assigned: "Đã gán sân",
  queued: "Trong hàng chờ",
  scheduled: "Đã lên lịch",
  pending: "Chờ xử lý",
  finished: "Hoàn tất",
  done: "Hoàn tất",
  completed: "Hoàn tất",
  cancelled: "Đã hủy",
  canceled: "Đã hủy",
};

const sid = (value: any) => {
  if (value == null) return "";
  if (typeof value === "object") {
    return String(value?._id ?? value?.id ?? value?.user?._id ?? value?.user ?? "");
  }
  return String(value);
};

const text = (value: any) => (value == null ? "" : String(value).trim());

const asArray = (value: any): any[] => {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.list)) return value.list;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.registrations)) return value.registrations;
  if (Array.isArray(value?.managers)) return value.managers;
  if (Array.isArray(value?.referees)) return value.referees;
  return [];
};

const compactNumber = (value: number) =>
  new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(
    Number(value) || 0,
  );

const dateLabel = (value: any) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const personName = (person: any) => {
  const source = person?.user && typeof person.user === "object" ? person.user : person;
  return (
    text(source?.nickname) ||
    text(source?.nickName) ||
    text(source?.displayName) ||
    text(source?.fullName) ||
    text(source?.name) ||
    text(source?.email) ||
    "Không rõ tên"
  );
};

const personContact = (person: any) => {
  const source = person?.user && typeof person.user === "object" ? person.user : person;
  return [source?.phone, source?.email].map(text).filter(Boolean).join(" · ");
};

const normalizeStatus = (match: any) => {
  const raw = text(match?.status || match?.state || match?.match_status).toLowerCase();
  if (["live", "ongoing", "playing", "inprogress", "on_court", "oncourt"].includes(raw)) {
    return "live";
  }
  if (["finished", "done", "completed", "final", "ended", "over", "closed"].includes(raw)) {
    return "finished";
  }
  if (["queued", "queue"].includes(raw)) return "queued";
  if (["assigned", "ready"].includes(raw)) return "assigned";
  if (["cancelled", "canceled"].includes(raw)) return "cancelled";
  return raw || "scheduled";
};

const statusLabel = (match: any) => {
  const status = normalizeStatus(match);
  return statusLabelMap[status] || "Đã tạo";
};

const statusTone = (match: any): Tone => {
  const status = normalizeStatus(match);
  if (status === "live") return "danger";
  if (status === "finished") return "good";
  if (status === "assigned" || status === "queued") return "info";
  if (status === "cancelled") return "neutral";
  return "warn";
};

const matchIdOf = (match: any) => sid(match?._id ?? match?.id ?? match?.matchId);

const matchCode = (match: any, index?: number) =>
  text((getMatchDisplayCode as any)(match, index)) ||
  text(match?.code) ||
  text(match?.labelKeyDisplay) ||
  text(match?.labelKey) ||
  "—";

const teamLabel = (match: any, side: "A" | "B") =>
  text(getMatchSideDisplayName(match, side, side === "A" ? "Đội A" : "Đội B"));

const courtLabel = (match: any) =>
  text(
    match?.courtStationName ||
      match?.courtStationLabel ||
      match?.courtStation?.name ||
      match?.station?.name ||
      match?.courtName ||
      match?.court?.name ||
      match?.court?.label ||
      match?.courtLabel,
  );

const videoUrlOf = (match: any) =>
  text(match?.video || match?.videoUrl || match?.liveUrl || match?.streamUrl);

const refereeCount = (match: any) => {
  const candidates =
    match?.referees ??
    match?.assignedReferees ??
    match?.matchReferees ??
    match?.referee ??
    match?.ref;
  if (Array.isArray(candidates)) return candidates.filter(Boolean).length;
  if (candidates && typeof candidates === "object") return 1;
  return text(candidates) ? 1 : 0;
};

const matchTimeLabel = (match: any) =>
  dateLabel(
    match?.scheduledAt ||
      match?.startAt ||
      match?.startsAt ||
      match?.plannedAt ||
      match?.time,
  );

const bracketIdOf = (item: any) => sid(item?.bracket?._id ?? item?.bracket ?? item?.bracketId);

const bracketName = (bracket: any, index: number) =>
  text(bracket?.name || bracket?.title || bracket?.label || bracket?.code) ||
  `Bảng ${index + 1}`;

const isCheckedIn = (registration: any) =>
  Boolean(
    registration?.checkedIn ||
      registration?.checkin ||
      registration?.checkinAt ||
      registration?.checkedInAt,
  );

const isPaid = (registration: any) => {
  const status = text(
    registration?.payment?.status ||
      registration?.paymentStatus ||
      registration?.status ||
      registration?.payStatus,
  ).toLowerCase();
  return paidStatuses.has(status);
};

const getAllowedClusters = (tour: any) =>
  asArray(
    tour?.allowedCourtClusters ||
      tour?.courtClusters ||
      tour?.courtClusterOptions ||
      tour?.selectedCourtClusters,
  );

const sectionPath = (tid: string, section: ConsoleSection, filter?: string) => {
  const base =
    section === "overview"
      ? `/tournament/${tid}/console`
      : `/tournament/${tid}/console/${section}`;
  return filter ? `${base}?filter=${encodeURIComponent(filter)}` : base;
};

const useConsoleTokens = (): ConsoleTokens => {
  const theme = useTheme() as any;
  const colors = theme?.colors;
  const dark = Boolean(theme?.dark);
  return useMemo(
    () => {
      const nextColors = colors || {};
      return {
        colors: nextColors,
        dark,
        page: nextColors.background || (dark ? "#0f172a" : "#f6f8fb"),
        header: dark ? "#0c1422" : "#f8fafc",
        card: nextColors.card || (dark ? "#111827" : "#ffffff"),
        elevated: dark ? "#162033" : "#ffffff",
        text: nextColors.text || (dark ? "#f8fafc" : "#0f172a"),
        muted: dark ? "#a3afbf" : "#64748b",
        border: nextColors.border || (dark ? "#263245" : "#d9e2ec"),
        softBorder: dark ? "rgba(148, 163, 184, 0.22)" : "#e6edf5",
        primary: nextColors.primary || "#2563eb",
        primarySoft: dark ? "rgba(59, 130, 246, 0.18)" : "#dbeafe",
        premium: dark ? "#fde68a" : "#9a6700",
        premiumSoft: dark ? "rgba(250, 204, 21, 0.16)" : "#fff7d6",
        success: dark ? "#86efac" : "#15803d",
        successSoft: dark ? "rgba(34, 197, 94, 0.16)" : "#dcfce7",
        warn: dark ? "#fbbf24" : "#b45309",
        warnSoft: dark ? "rgba(245, 158, 11, 0.16)" : "#fef3c7",
        danger: dark ? "#fca5a5" : "#b91c1c",
        dangerSoft: dark ? "rgba(239, 68, 68, 0.16)" : "#fee2e2",
        info: dark ? "#93c5fd" : "#1d4ed8",
        infoSoft: dark ? "rgba(59, 130, 246, 0.16)" : "#dbeafe",
        chip: dark ? "rgba(148, 163, 184, 0.12)" : "#f1f5f9",
      };
    },
    [colors, dark],
  );
};

const toneColors = (tokens: ConsoleTokens, tone: Tone) => {
  if (tone === "good") return { bg: tokens.successSoft, fg: tokens.success };
  if (tone === "info") return { bg: tokens.infoSoft, fg: tokens.info };
  if (tone === "warn") return { bg: tokens.warnSoft, fg: tokens.warn };
  if (tone === "danger") return { bg: tokens.dangerSoft, fg: tokens.danger };
  return { bg: tokens.chip, fg: tokens.muted };
};

function IconButton({
  icon,
  onPress,
  tokens,
  disabled,
}: {
  icon: any;
  onPress?: () => void;
  tokens: ConsoleTokens;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.iconButton,
        {
          backgroundColor: tokens.card,
          borderColor: tokens.border,
          opacity: disabled ? 0.45 : 1,
        },
      ]}
    >
      <MaterialIcons name={icon} size={20} color={tokens.text} />
    </Pressable>
  );
}

function StatusPill({
  label,
  tone = "neutral",
  tokens,
  icon,
}: {
  label: string;
  tone?: Tone;
  tokens: ConsoleTokens;
  icon?: any;
}) {
  const toneStyle = toneColors(tokens, tone);
  return (
    <View style={[styles.pill, { backgroundColor: toneStyle.bg }]}>
      {icon ? <MaterialIcons name={icon} size={14} color={toneStyle.fg} /> : null}
      <Text style={[styles.pillText, { color: toneStyle.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function MetricTile({
  label,
  value,
  caption,
  icon,
  tone = "neutral",
  tokens,
  onPress,
}: {
  label: string;
  value: string | number;
  caption?: string;
  icon: any;
  tone?: Tone;
  tokens: ConsoleTokens;
  onPress?: () => void;
}) {
  const toneStyle = toneColors(tokens, tone);
  const content = (
    <>
      <View style={[styles.metricAccent, { backgroundColor: toneStyle.fg }]} />
      <View style={[styles.metricIcon, { backgroundColor: toneStyle.bg }]}>
        <MaterialIcons name={icon} size={20} color={toneStyle.fg} />
      </View>
      <Text style={[styles.metricValue, { color: tokens.text }]} numberOfLines={1}>
        {typeof value === "number" ? compactNumber(value) : value}
      </Text>
      <Text style={[styles.metricLabel, { color: tokens.muted }]} numberOfLines={1}>
        {label}
      </Text>
      {caption ? (
        <Text style={[styles.metricCaption, { color: tokens.muted }]} numberOfLines={1}>
          {caption}
        </Text>
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={[
          styles.metricTile,
          { backgroundColor: tokens.card, borderColor: tokens.softBorder },
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View
      style={[
        styles.metricTile,
        { backgroundColor: tokens.card, borderColor: tokens.softBorder },
      ]}
    >
      {content}
    </View>
  );
}

function ActionTile({
  title,
  caption,
  icon,
  tokens,
  onPress,
  disabled,
}: {
  title: string;
  caption: string;
  icon: any;
  tokens: ConsoleTokens;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.actionTile,
        {
          backgroundColor: tokens.card,
          borderColor: tokens.softBorder,
          opacity: disabled ? 0.48 : 1,
        },
      ]}
    >
      <View style={[styles.actionRail, { backgroundColor: tokens.premium }]} />
      <View style={[styles.actionIcon, { backgroundColor: tokens.primarySoft }]}>
        <MaterialIcons name={icon} size={20} color={tokens.primary} />
      </View>
      <View style={styles.actionText}>
        <Text style={[styles.actionTitle, { color: tokens.text }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.actionCaption, { color: tokens.muted }]} numberOfLines={2}>
          {caption}
        </Text>
      </View>
      <MaterialIcons name="chevron-right" size={20} color={tokens.muted} />
    </Pressable>
  );
}

function SectionHeader({
  title,
  caption,
  tokens,
  action,
}: {
  title: string;
  caption?: string;
  tokens: ConsoleTokens;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.sectionTitle, { color: tokens.text }]}>{title}</Text>
        {caption ? (
          <Text style={[styles.sectionCaption, { color: tokens.muted }]}>{caption}</Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}

function EmptyState({
  icon,
  title,
  caption,
  tokens,
}: {
  icon: any;
  title: string;
  caption: string;
  tokens: ConsoleTokens;
}) {
  return (
    <View
      style={[
        styles.emptyState,
        { backgroundColor: tokens.card, borderColor: tokens.softBorder },
      ]}
    >
      <MaterialIcons name={icon} size={26} color={tokens.muted} />
      <Text style={[styles.emptyTitle, { color: tokens.text }]}>{title}</Text>
      <Text style={[styles.emptyCaption, { color: tokens.muted }]}>{caption}</Text>
    </View>
  );
}

export default function TournamentConsoleShell({
  section,
}: {
  section: ConsoleSection;
}) {
  const params = useLocalSearchParams();
  const tid = sid(params.id);
  const routeFilter = text(params.filter);
  const tokens = useConsoleTokens();
  const insets = useSafeAreaInsets();
  const me = useSelector((state: any) => state.auth?.userInfo || null);
  const socket = useSocket();
  const liveMapRef = useRef(new Map<string, any>());
  const pendingRef = useRef(new Map<string, any>());
  const rafRef = useRef<number | null>(null);
  const seededFingerprintRef = useRef("");
  const [liveBump, setLiveBump] = useState(0);

  const {
    data: tour,
    isLoading: tourLoading,
    isFetching: tourFetching,
    refetch: refetchTour,
  } = useGetTournamentQuery(tid, {
    skip: !tid,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });
  const {
    data: registrationsData,
    isFetching: registrationsFetching,
    refetch: refetchRegistrations,
  } = useGetRegistrationsQuery(tid, { skip: !tid });
  const {
    data: bracketsData,
    isFetching: bracketsFetching,
    refetch: refetchBrackets,
  } = useAdminGetBracketsQuery(tid, {
    skip: !tid,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });
  const {
    data: matchPage,
    isLoading: matchesLoading,
    isFetching: matchesFetching,
    refetch: refetchMatches,
  } = useAdminListMatchesByTournamentQuery(
    { tid, page: 1, pageSize: 1000 },
    {
      skip: !tid,
      refetchOnFocus: true,
      refetchOnReconnect: true,
    },
  );
  const {
    data: managersData,
    isFetching: managersFetching,
    refetch: refetchManagers,
  } = useListTournamentManagersQuery(tid, {
    skip: !tid,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });
  const {
    data: refereesData,
    isFetching: refereesFetching,
    refetch: refetchReferees,
  } = useListTournamentRefereesQuery(
    { tid, q: "", limit: 120 },
    {
      skip: !tid,
      refetchOnFocus: true,
      refetchOnReconnect: true,
    },
  );
  const [setLiveUrl, { isLoading: savingVideo }] =
    useAdminSetMatchLiveUrlMutation();

  const refetchTourRef = useRef(refetchTour);
  const refetchMatchesRef = useRef(refetchMatches);
  const refetchBracketsRef = useRef(refetchBrackets);

  useEffect(() => {
    refetchTourRef.current = refetchTour;
    refetchMatchesRef.current = refetchMatches;
    refetchBracketsRef.current = refetchBrackets;
  }, [refetchBrackets, refetchMatches, refetchTour]);

  const [matchSearch, setMatchSearch] = useState("");
  const [matchFilter, setMatchFilter] = useState("all");
  const [viewer, setViewer] = useState({ open: false, matchId: "" });
  const [assignCourt, setAssignCourt] = useState({ open: false, match: null as any });
  const [assignRef, setAssignRef] = useState({ open: false, match: null as any });
  const [refSheetOpen, setRefSheetOpen] = useState(false);
  const [managerSheetOpen, setManagerSheetOpen] = useState(false);
  const [courtSheetOpen, setCourtSheetOpen] = useState(false);
  const [liveSetupOpen, setLiveSetupOpen] = useState(false);
  const [videoDialog, setVideoDialog] = useState({
    open: false,
    match: null as any,
    url: "",
  });

  useEffect(() => {
    if (routeFilter && MATCH_FILTERS.some((item) => item.key === routeFilter)) {
      setMatchFilter(routeFilter);
    }
  }, [routeFilter]);

  const registrations = useMemo(() => asArray(registrationsData), [registrationsData]);
  const brackets = useMemo(() => asArray(bracketsData), [bracketsData]);
  const managers = useMemo(() => asArray(managersData), [managersData]);
  const referees = useMemo(() => asArray(refereesData), [refereesData]);
  const queryMatches = useMemo(
    () =>
      asArray(matchPage?.list ? matchPage.list : matchPage)
        .map((match) => normalizeMatchDisplay(match, tour || match))
        .filter((match) => match && typeof match === "object"),
    [matchPage, tour],
  );

  useEffect(() => {
    liveMapRef.current = new Map();
    pendingRef.current.clear();
    seededFingerprintRef.current = "";
    setLiveBump((value) => value + 1);
  }, [tid]);

  useEffect(() => {
    const fingerprint = queryMatches
      .map((match) =>
        [
          matchIdOf(match),
          text(match?.status),
          text(match?.updatedAt),
          text(match?.liveVersion ?? match?.version),
          text(match?.video),
          text(match?.courtStationId || match?.courtStation?._id || ""),
          text(match?.courtStationName || match?.courtStationLabel || ""),
          text(match?.court?._id || match?.court || ""),
          text(match?.court?.name || match?.courtName || ""),
          text(match?.courtLabel || ""),
        ].join(":"),
      )
      .join("|");

    if (fingerprint === seededFingerprintRef.current) return;
    seededFingerprintRef.current = fingerprint;

    const nextMap = new Map(liveMapRef.current);
    let changed = false;

    for (const match of queryMatches) {
      const id = matchIdOf(match);
      if (!id) continue;
      const current = nextMap.get(id);
      if (current && !isNewerOrEqualMatchPayload(current, match)) continue;
      const merged =
        mergeMatchPayload(current, match, current || tour) ||
        normalizeMatchDisplay(match, current || tour);
      if (!merged) continue;
      nextMap.set(id, merged);
      changed = true;
    }

    if (!changed && nextMap.size === liveMapRef.current.size) return;
    liveMapRef.current = nextMap;
    setLiveBump((value) => value + 1);
  }, [queryMatches, tour]);

  const tournamentRoomIds = useMemo(() => (tid ? [String(tid)] : []), [tid]);

  useSocketRoomSet(socket, tournamentRoomIds, {
    subscribeEvent: "tournament:subscribe",
    unsubscribeEvent: "tournament:unsubscribe",
    payloadKey: "tournamentId",
    onResync: () => {
      refetchTourRef.current?.();
      refetchMatchesRef.current?.();
      refetchBracketsRef.current?.();
    },
  });

  useEffect(() => {
    if (!socket) return;

    const normalizeIncomingMatch = (raw: any) => {
      const id = raw?._id ?? raw?.id ?? raw?.matchId;
      if (!id) return null;
      const incoming = { ...(raw || {}), _id: String(id) };
      if (Array.isArray(incoming.scores) && !incoming.gameScores) {
        incoming.gameScores = incoming.scores;
      }
      if (typeof incoming.score_text === "string" && !incoming.scoreText) {
        incoming.scoreText = incoming.score_text;
      }
      if (incoming.court && typeof incoming.court === "object") {
        incoming.court = {
          _id:
            incoming.court._id ??
            (typeof incoming.court.id === "string" ? incoming.court.id : undefined),
          name: incoming.court.name || incoming.court.label || incoming.court.title || "",
        };
      }
      return incoming;
    };

    const flushPending = () => {
      rafRef.current = null;
      if (!pendingRef.current.size) return;

      const nextMap = new Map(liveMapRef.current);
      let changed = false;

      for (const [matchId, incoming] of pendingRef.current) {
        const current = nextMap.get(matchId);
        if (current && !isNewerOrEqualMatchPayload(current, incoming)) continue;
        const merged =
          mergeMatchPayload(current, incoming, current || tour) ||
          normalizeMatchDisplay(incoming, current || tour);
        if (!merged) continue;
        nextMap.set(matchId, merged);
        changed = true;
      }

      pendingRef.current.clear();
      if (!changed) return;
      liveMapRef.current = nextMap;
      setLiveBump((value) => value + 1);
    };

    const queueUpsert = (payload: any) => {
      const raw = payload?.data ?? payload?.match ?? payload;
      const incoming = normalizeIncomingMatch(raw);
      if (!incoming) return;

      const key = matchIdOf(incoming);
      const base = pendingRef.current.get(key) || liveMapRef.current.get(key);
      if (base && !isNewerOrEqualMatchPayload(base, incoming)) return;

      pendingRef.current.set(
        key,
        mergeMatchPayload(base, incoming, base || tour) ||
          normalizeMatchDisplay(incoming, base || tour),
      );

      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(flushPending);
    };

    const onRemove = (payload: any) => {
      const id = sid(payload?.id ?? payload?._id ?? payload?.matchId);
      if (!id || !liveMapRef.current.has(id)) return;
      const nextMap = new Map(liveMapRef.current);
      nextMap.delete(id);
      liveMapRef.current = nextMap;
      setLiveBump((value) => value + 1);
    };

    let lastRefill = 0;
    const onRefilled = () => {
      const now = Date.now();
      if (now - lastRefill < 800) return;
      lastRefill = now;
      refetchMatchesRef.current?.();
      refetchBracketsRef.current?.();
    };

    const onInvalidate = (payload: any) => {
      const tournamentId = sid(payload?.tournamentId);
      if (tournamentId && tournamentId !== String(tid)) return;
      onRefilled();
    };

    socket.on("tournament:match:update", queueUpsert);
    socket.on("tournament:invalidate", onInvalidate);
    socket.on("match:deleted", onRemove);
    socket.on("draw:refilled", onRefilled);
    socket.on("bracket:updated", onRefilled);

    return () => {
      socket.off("tournament:match:update", queueUpsert);
      socket.off("tournament:invalidate", onInvalidate);
      socket.off("match:deleted", onRemove);
      socket.off("draw:refilled", onRefilled);
      socket.off("bracket:updated", onRefilled);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [socket, tid, tour]);

  const liveMatchesSnapshot = useMemo(
    () => (liveBump < 0 ? [] : Array.from(liveMapRef.current.values())),
    [liveBump],
  );

  const matches = useMemo(
    () => {
      const source = liveMatchesSnapshot.length ? liveMatchesSnapshot : queryMatches;
      return source
        .filter((match) => {
          const tournamentId = sid(match?.tournament?._id || match?.tournament);
          return !tournamentId || tournamentId === String(tid);
        })
        .map((match) => normalizeMatchDisplay(match, tour || match))
        .filter((match) => match && typeof match === "object");
    },
    [liveMatchesSnapshot, queryMatches, tid, tour],
  );

  const tourName = text(tour?.name) || "Giải đấu";
  const isAdmin = Boolean(
    me?.isAdmin ||
      me?.role === "admin" ||
      (Array.isArray(me?.roles) && me.roles.includes("admin")),
  );
  const meId = sid(me?._id ?? me?.id);
  const creatorId = sid(tour?.createdBy);
  const isManager = useMemo(() => {
    if (!meId || !tour) return false;
    if (creatorId && creatorId === meId) return true;
    if (Array.isArray(tour?.managers)) {
      return tour.managers.some((manager: any) => sid(manager?.user ?? manager) === meId);
    }
    return Boolean(tour?.isManager);
  }, [creatorId, meId, tour]);
  const canManage = isAdmin || isManager;
  const canManageManagers = Boolean(meId && (isAdmin || creatorId === meId));

  const bracketById = useMemo(() => {
    const map = new Map<string, any>();
    brackets.forEach((bracket, index) => {
      const id = sid(bracket?._id ?? bracket?.id);
      if (id) map.set(id, { ...bracket, _consoleName: bracketName(bracket, index) });
    });
    return map;
  }, [brackets]);

  const metrics = useMemo(() => {
    const totalMatches = matches.length;
    let live = 0;
    let finished = 0;
    let active = 0;
    let noCourt = 0;
    let noRef = 0;
    let noVideo = 0;
    let ready = 0;

    matches.forEach((match) => {
      const status = normalizeStatus(match);
      const done = status === "finished";
      const hasCourt = Boolean(courtLabel(match));
      const hasReferee = refereeCount(match) > 0;
      const hasVideo = Boolean(videoUrlOf(match));
      if (status === "live") live += 1;
      if (done) finished += 1;
      else active += 1;
      if (!done && !hasCourt) noCourt += 1;
      if (!done && !hasReferee) noRef += 1;
      if (!done && !hasVideo) noVideo += 1;
      if (!done && hasCourt && hasReferee && hasVideo) ready += 1;
    });
    const paid = registrations.filter(isPaid).length;
    const checkin = registrations.filter(isCheckedIn).length;
    const attention = noCourt + noRef + noVideo;
    const healthBase = Math.max(1, active * 3);
    const healthScore = totalMatches
      ? Math.max(0, Math.min(100, 100 - Math.round((attention / healthBase) * 100)))
      : 100;

    return {
      registrations: registrations.length,
      paid,
      checkin,
      brackets: brackets.length,
      managers: managers.length,
      referees: referees.length,
      totalMatches,
      live,
      finished,
      active,
      ready,
      noCourt,
      noRef,
      noVideo,
      attention,
      healthScore,
      completionPercent: totalMatches ? Math.round((finished / totalMatches) * 100) : 0,
      paymentPercent: registrations.length
        ? Math.round((paid / registrations.length) * 100)
        : 0,
    };
  }, [brackets.length, managers.length, matches, referees.length, registrations]);

  const bracketProgress = useMemo(() => {
    const byBracket = new Map<string, any>();
    brackets.forEach((bracket, index) => {
      const id = sid(bracket?._id ?? bracket?.id);
      if (!id) return;
      byBracket.set(id, {
        id,
        name: bracketName(bracket, index),
        type: text(bracket?.type || bracket?.format || "Bracket"),
        total: 0,
        finished: 0,
        live: 0,
        noCourt: 0,
      });
    });

    matches.forEach((match) => {
      const id = bracketIdOf(match);
      if (!id) return;
      const item =
        byBracket.get(id) ||
        ({
          id,
          name:
            text(match?.bracket?.name || match?.bracketName || match?.bracket?.title) ||
            "Bracket",
          type: text(match?.bracket?.type || match?.format || "Bracket"),
          total: 0,
          finished: 0,
          live: 0,
          noCourt: 0,
        } as any);
      item.total += 1;
      if (normalizeStatus(match) === "finished") item.finished += 1;
      if (normalizeStatus(match) === "live") item.live += 1;
      if (normalizeStatus(match) !== "finished" && !courtLabel(match)) item.noCourt += 1;
      byBracket.set(id, item);
    });

    return Array.from(byBracket.values()).sort((a, b) => b.total - a.total);
  }, [brackets, matches]);

  const filteredMatches = useMemo(() => {
    const query = matchSearch.trim().toLowerCase();
    return matches
      .filter((match, index) => {
        const done = normalizeStatus(match) === "finished";
        const status = normalizeStatus(match);
        const noCourt = !done && !courtLabel(match);
        const noRef = !done && refereeCount(match) === 0;
        const noVideo = !done && !videoUrlOf(match);

        if (matchFilter === "live" && status !== "live") return false;
        if (matchFilter === "noCourt" && !noCourt) return false;
        if (matchFilter === "noRef" && !noRef) return false;
        if (matchFilter === "noVideo" && !noVideo) return false;
        if (matchFilter === "active" && done) return false;
        if (matchFilter === "finished" && !done) return false;
        if (matchFilter === "attention" && !noCourt && !noRef && !noVideo) {
          return false;
        }

        if (!query) return true;
        const haystack = [
          matchCode(match, index),
          teamLabel(match, "A"),
          teamLabel(match, "B"),
          courtLabel(match),
          statusLabel(match),
          match?.bracket?.name,
          bracketById.get(bracketIdOf(match))?._consoleName,
        ]
          .map(text)
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      })
      .slice(0, 160);
  }, [bracketById, matchFilter, matchSearch, matches]);

  const refreshing =
    tourFetching ||
    registrationsFetching ||
    bracketsFetching ||
    matchesFetching ||
    managersFetching ||
    refereesFetching;

  const refreshAll = useCallback(() => {
    refetchTour?.();
    refetchRegistrations?.();
    refetchBrackets?.();
    refetchMatches?.();
    refetchManagers?.();
    refetchReferees?.();
  }, [
    refetchBrackets,
    refetchManagers,
    refetchMatches,
    refetchReferees,
    refetchRegistrations,
    refetchTour,
  ]);

  const afterMutation = useCallback(() => {
    refetchTour?.();
    refetchBrackets?.();
    refetchMatches?.();
    refetchManagers?.();
    refetchReferees?.();
  }, [refetchBrackets, refetchManagers, refetchMatches, refetchReferees, refetchTour]);

  const goTo = useCallback(
    (path: string) => {
      router.push(path as any);
    },
    [],
  );

  const openVideoDialog = useCallback((match: any) => {
    setVideoDialog({ open: true, match, url: videoUrlOf(match) });
  }, []);

  const closeVideoDialog = useCallback(() => {
    setVideoDialog({ open: false, match: null, url: "" });
  }, []);

  const saveVideo = useCallback(
    async (nextUrl?: string) => {
      const matchId = matchIdOf(videoDialog.match);
      if (!matchId) return;
      try {
        const video = typeof nextUrl === "string" ? nextUrl : videoDialog.url;
        await setLiveUrl({ matchId, video: video.trim() }).unwrap();
        closeVideoDialog();
        afterMutation();
        Alert.alert("Đã lưu", video.trim() ? "Đã gán link video." : "Đã xóa link video.");
      } catch (error: any) {
        Alert.alert("Lỗi", error?.data?.message || error?.error || "Không lưu được video.");
      }
    },
    [afterMutation, closeVideoDialog, setLiveUrl, videoDialog],
  );

  const openRefereeScreen = useCallback((match: any) => {
    try {
      router.push(buildRefereeMatchRoute(match) as any);
    } catch {
      const matchId = matchIdOf(match);
      if (matchId) router.push(`/match/${matchId}/referee` as any);
    }
  }, []);

  const renderTopBar = () => (
    <View
      style={[
        styles.header,
        {
          paddingTop: Math.max(insets.top, 10),
          backgroundColor: tokens.page,
          borderBottomColor: tokens.softBorder,
        },
      ]}
    >
      <View style={styles.headerTop}>
        <IconButton icon="arrow-back" tokens={tokens} onPress={() => router.back()} />
        <View style={styles.headerCopy}>
          <Text style={[styles.headerEyebrow, { color: tokens.muted }]}>
            Console quản lý giải
          </Text>
          <Text style={[styles.headerTitle, { color: tokens.text }]} numberOfLines={1}>
            {tourName}
          </Text>
        </View>
        <IconButton
          icon="admin-panel-settings"
          tokens={tokens}
          onPress={() => goTo(`/tournament/${tid}/manage`)}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabRow}
      >
        {SECTION_TABS.map((tab) => {
          const active = tab.key === section;
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              onPress={() => goTo(sectionPath(tid, tab.key))}
              style={[
                styles.tab,
                {
                  backgroundColor: active ? tokens.primary : tokens.card,
                  borderColor: active ? tokens.primary : tokens.softBorder,
                },
              ]}
            >
              <MaterialIcons
                name={tab.icon}
                size={16}
                color={active ? "#fff" : tokens.muted}
              />
              <Text
                style={[styles.tabText, { color: active ? "#fff" : tokens.text }]}
                numberOfLines={1}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  const renderOverview = () => (
    <View style={styles.stack}>
      <View
        style={[
          styles.summaryBand,
          { backgroundColor: tokens.card, borderColor: tokens.softBorder },
        ]}
      >
        <View style={styles.summaryCopy}>
          <Text style={[styles.summaryTitle, { color: tokens.text }]} numberOfLines={2}>
            {tourName}
          </Text>
          <Text style={[styles.summaryCaption, { color: tokens.muted }]} numberOfLines={2}>
            {metrics.brackets} bảng · {metrics.totalMatches} trận ·{" "}
            {metrics.registrations} đăng ký
          </Text>
          <View style={styles.summaryStatusRow}>
            <StatusPill
              label={`Health ${metrics.healthScore}%`}
              icon="monitor-heart"
              tone={
                metrics.healthScore >= 85
                  ? "good"
                  : metrics.healthScore >= 60
                    ? "warn"
                    : "danger"
              }
              tokens={tokens}
            />
            <StatusPill
              label={`${metrics.ready} trận ready`}
              icon="task-alt"
              tone="info"
              tokens={tokens}
            />
          </View>
        </View>
        <View style={[styles.summaryBadge, { backgroundColor: tokens.premiumSoft }]}>
          <MaterialIcons name="workspace-premium" size={18} color={tokens.premium} />
          <Text style={[styles.summaryBadgeText, { color: tokens.premium }]}>
            Console mới
          </Text>
        </View>
      </View>

      <View style={styles.metricGrid}>
        <MetricTile
          label="Đăng ký"
          value={metrics.registrations}
          caption={`${metrics.paid} đã nộp · ${metrics.checkin} check-in`}
          icon="groups"
          tone="info"
          tokens={tokens}
          onPress={() => goTo(`/tournament/${tid}/register`)}
        />
        <MetricTile
          label="Đang live"
          value={metrics.live}
          caption={`${metrics.active} trận chưa xong`}
          icon="radio-button-checked"
          tone={metrics.live ? "danger" : "neutral"}
          tokens={tokens}
          onPress={() => goTo(sectionPath(tid, "matches", "live"))}
        />
        <MetricTile
          label="Hoàn tất"
          value={metrics.finished}
          caption={`${metrics.totalMatches} tổng trận`}
          icon="verified"
          tone="good"
          tokens={tokens}
          onPress={() => goTo(sectionPath(tid, "matches", "finished"))}
        />
        <MetricTile
          label="Cần xử lý"
          value={metrics.attention}
          caption="sân · trọng tài · video"
          icon="priority-high"
          tone={metrics.attention ? "warn" : "good"}
          tokens={tokens}
          onPress={() => goTo(sectionPath(tid, "matches", "attention"))}
        />
      </View>

      <SectionHeader
        title="Thao tác nhanh"
        caption="Các luồng hay dùng được gom lại để xử lý ít chạm hơn."
        tokens={tokens}
      />
      <View style={styles.actionGrid}>
        <ActionTile
          title="Trận cần xử lý"
          caption={`${metrics.noCourt} chưa sân, ${metrics.noRef} chưa trọng tài`}
          icon="checklist"
          tokens={tokens}
          onPress={() => goTo(sectionPath(tid, "matches", "attention"))}
        />
        <ActionTile
          title="Điều phối sân"
          caption="Mở bảng sân realtime và hàng chờ"
          icon="stadium"
          tokens={tokens}
          onPress={() => setCourtSheetOpen(true)}
        />
        <ActionTile
          title="Thiết lập live"
          caption="Bật live theo sân hoặc cụm sân"
          icon="connected-tv"
          tokens={tokens}
          onPress={() => setLiveSetupOpen(true)}
        />
        <ActionTile
          title="Nhân sự"
          caption={`${metrics.managers} manager · ${metrics.referees} trọng tài`}
          icon="manage-accounts"
          tokens={tokens}
          onPress={() => goTo(sectionPath(tid, "people"))}
        />
      </View>

      <SectionHeader
        title="Tiến độ bracket"
        caption="Ưu tiên bracket có nhiều trận và còn việc vận hành."
        tokens={tokens}
      />
      <View style={styles.listStack}>
        {bracketProgress.length ? (
          bracketProgress.slice(0, 8).map((bracket) => {
            const percent = bracket.total
              ? Math.round((bracket.finished / bracket.total) * 100)
              : 0;
            return (
              <Pressable
                key={bracket.id}
                accessibilityRole="button"
                onPress={() => goTo(`/tournament/${tid}/bracket?bracket=${bracket.id}`)}
                style={[
                  styles.progressRow,
                  { backgroundColor: tokens.card, borderColor: tokens.softBorder },
                ]}
              >
                <View style={{ flex: 1, gap: 6 }}>
                  <View style={styles.rowBetween}>
                    <Text style={[styles.rowTitle, { color: tokens.text }]} numberOfLines={1}>
                      {bracket.name}
                    </Text>
                    <StatusPill label={`${percent}%`} tone="info" tokens={tokens} />
                  </View>
                  <View style={[styles.progressTrack, { backgroundColor: tokens.chip }]}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${percent}%`,
                          backgroundColor:
                            percent >= 100 ? tokens.success : tokens.primary,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.rowMeta, { color: tokens.muted }]}>
                    {bracket.finished}/{bracket.total} trận xong · {bracket.live} live ·{" "}
                    {bracket.noCourt} chưa sân
                  </Text>
                </View>
                <MaterialIcons name="chevron-right" size={22} color={tokens.muted} />
              </Pressable>
            );
          })
        ) : (
          <EmptyState
            icon="account-tree"
            title="Chưa có bracket"
            caption="Khi bracket được tạo, tiến độ sẽ hiển thị ở đây."
            tokens={tokens}
          />
        )}
      </View>
    </View>
  );

  const renderMatchActions = (match: any) => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.matchActions}
    >
      <Pressable
        style={[styles.smallAction, { backgroundColor: tokens.chip }]}
        onPress={() => setViewer({ open: true, matchId: matchIdOf(match) })}
      >
        <MaterialIcons name="visibility" size={15} color={tokens.text} />
        <Text style={[styles.smallActionText, { color: tokens.text }]}>Xem</Text>
      </Pressable>
      <Pressable
        style={[styles.smallAction, { backgroundColor: tokens.chip }]}
        onPress={() => setAssignCourt({ open: true, match })}
      >
        <MaterialIcons name="stadium" size={15} color={tokens.text} />
        <Text style={[styles.smallActionText, { color: tokens.text }]}>Sân</Text>
      </Pressable>
      <Pressable
        style={[styles.smallAction, { backgroundColor: tokens.chip }]}
        onPress={() => setAssignRef({ open: true, match })}
      >
        <MaterialIcons name="how-to-reg" size={15} color={tokens.text} />
        <Text style={[styles.smallActionText, { color: tokens.text }]}>TT</Text>
      </Pressable>
      <Pressable
        style={[styles.smallAction, { backgroundColor: tokens.chip }]}
        onPress={() => openVideoDialog(match)}
      >
        <MaterialIcons name="videocam" size={15} color={tokens.text} />
        <Text style={[styles.smallActionText, { color: tokens.text }]}>Video</Text>
      </Pressable>
      <Pressable
        style={[styles.smallAction, { backgroundColor: tokens.primarySoft }]}
        onPress={() => openRefereeScreen(match)}
      >
        <MaterialIcons name="edit-note" size={15} color={tokens.primary} />
        <Text style={[styles.smallActionText, { color: tokens.primary }]}>Chấm</Text>
      </Pressable>
    </ScrollView>
  );

  const renderMatches = () => (
    <View style={styles.stack}>
      <View style={styles.searchBlock}>
        <View
          style={[
            styles.searchInputWrap,
            { backgroundColor: tokens.card, borderColor: tokens.softBorder },
          ]}
        >
          <MaterialIcons name="search" size={20} color={tokens.muted} />
          <TextInput
            value={matchSearch}
            onChangeText={setMatchSearch}
            placeholder="Tìm mã trận, đội, sân..."
            placeholderTextColor={tokens.muted}
            style={[styles.searchInput, { color: tokens.text }]}
          />
          {matchSearch ? (
            <Pressable onPress={() => setMatchSearch("")}>
              <MaterialIcons name="close" size={20} color={tokens.muted} />
            </Pressable>
          ) : null}
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {MATCH_FILTERS.map((filter) => {
            const active = matchFilter === filter.key;
            return (
              <Pressable
                key={filter.key}
                onPress={() => setMatchFilter(filter.key)}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: active ? tokens.primary : tokens.card,
                    borderColor: active ? tokens.primary : tokens.softBorder,
                  },
                ]}
              >
                <MaterialIcons
                  name={filter.icon}
                  size={15}
                  color={active ? "#fff" : tokens.muted}
                />
                <Text
                  style={[
                    styles.filterText,
                    { color: active ? "#fff" : tokens.text },
                  ]}
                >
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <SectionHeader
        title="Danh sách trận"
        caption={`${filteredMatches.length} trận đang hiển thị`}
        tokens={tokens}
      />

      <View style={styles.listStack}>
        {matchesLoading && !matches.length ? (
          <View style={[styles.loadingCard, { backgroundColor: tokens.card }]}>
            <ActivityIndicator color={tokens.primary} />
            <Text style={[styles.loadingText, { color: tokens.muted }]}>
              Đang tải trận đấu...
            </Text>
          </View>
        ) : filteredMatches.length ? (
          filteredMatches.map((match, index) => {
            const status = normalizeStatus(match);
            const done = status === "finished";
            const court = courtLabel(match);
            const refs = refereeCount(match);
            const video = videoUrlOf(match);
            const bracket =
              bracketById.get(bracketIdOf(match))?._consoleName ||
              text(match?.bracket?.name || match?.bracketName);
            return (
              <View
                key={matchIdOf(match) || `${index}`}
                style={[
                  styles.matchRow,
                  { backgroundColor: tokens.card, borderColor: tokens.softBorder },
                ]}
              >
                <View style={styles.rowBetween}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={[styles.matchCode, { color: tokens.text }]} numberOfLines={1}>
                      {matchCode(match, index)}
                    </Text>
                    <Text
                      style={[styles.matchTeams, { color: tokens.text }]}
                      numberOfLines={2}
                    >
                      {teamLabel(match, "A")} vs {teamLabel(match, "B")}
                    </Text>
                  </View>
                  <StatusPill
                    label={statusLabel(match)}
                    tone={statusTone(match)}
                    tokens={tokens}
                  />
                </View>

                <View style={styles.matchMetaGrid}>
                  <StatusPill
                    label={court || "Chưa sân"}
                    icon="stadium"
                    tone={court ? "info" : done ? "neutral" : "warn"}
                    tokens={tokens}
                  />
                  <StatusPill
                    label={refs ? `${refs} trọng tài` : "Chưa TT"}
                    icon="how-to-reg"
                    tone={refs ? "good" : done ? "neutral" : "warn"}
                    tokens={tokens}
                  />
                  <StatusPill
                    label={video ? "Có video" : "Chưa video"}
                    icon={video ? "videocam" : "videocam-off"}
                    tone={video ? "good" : done ? "neutral" : "warn"}
                    tokens={tokens}
                  />
                  {bracket ? (
                    <StatusPill label={bracket} icon="account-tree" tone="neutral" tokens={tokens} />
                  ) : null}
                  {matchTimeLabel(match) ? (
                    <StatusPill
                      label={matchTimeLabel(match)}
                      icon="schedule"
                      tone="neutral"
                      tokens={tokens}
                    />
                  ) : null}
                </View>

                {renderMatchActions(match)}
              </View>
            );
          })
        ) : (
          <EmptyState
            icon="search-off"
            title="Không có trận phù hợp"
            caption="Đổi bộ lọc hoặc kéo xuống để tải lại dữ liệu."
            tokens={tokens}
          />
        )}
      </View>
    </View>
  );

  const renderOperations = () => (
    <View style={styles.stack}>
      <View style={styles.metricGrid}>
        <MetricTile
          label="Chưa sân"
          value={metrics.noCourt}
          caption="trận cần điều phối"
          icon="stadium"
          tone={metrics.noCourt ? "warn" : "good"}
          tokens={tokens}
          onPress={() => goTo(sectionPath(tid, "matches", "noCourt"))}
        />
        <MetricTile
          label="Chưa video"
          value={metrics.noVideo}
          caption="trận cần gán link"
          icon="videocam-off"
          tone={metrics.noVideo ? "warn" : "good"}
          tokens={tokens}
          onPress={() => goTo(sectionPath(tid, "matches", "noVideo"))}
        />
      </View>

      <SectionHeader
        title="Bảng điều khiển vận hành"
        caption="Các màn vận hành chính vẫn dùng dữ liệu và API hiện có."
        tokens={tokens}
      />
      <View style={styles.actionGrid}>
        <ActionTile
          title="Quản lý sân"
          caption="Realtime court, hàng chờ và giải phóng sân"
          icon="stadium"
          tokens={tokens}
          onPress={() => setCourtSheetOpen(true)}
        />
        <ActionTile
          title="Thiết lập live"
          caption="Cấu hình live theo sân hoặc cụm sân"
          icon="connected-tv"
          tokens={tokens}
          onPress={() => setLiveSetupOpen(true)}
        />
        <ActionTile
          title="Bốc thăm"
          caption="Mở màn draw hiện có"
          icon="shuffle"
          tokens={tokens}
          onPress={() => goTo(`/tournament/${tid}/draw`)}
        />
        <ActionTile
          title="Sơ đồ giải"
          caption="Xem bracket và cây trận"
          icon="account-tree"
          tokens={tokens}
          onPress={() => goTo(`/tournament/${tid}/bracket`)}
        />
        <ActionTile
          title="Lịch thi đấu"
          caption="Điều phối lịch theo bracket"
          icon="event"
          tokens={tokens}
          onPress={() => goTo(`/tournament/${tid}/schedule`)}
        />
        <ActionTile
          title="Check-in"
          caption="Mở danh sách check-in"
          icon="fact-check"
          tokens={tokens}
          onPress={() => goTo(`/tournament/${tid}/checkin`)}
        />
        <ActionTile
          title="Đăng ký"
          caption="Quản lý danh sách đăng ký"
          icon="app-registration"
          tokens={tokens}
          onPress={() => goTo(`/tournament/${tid}/register`)}
        />
        <ActionTile
          title="Quản lý cũ"
          caption="Giữ nguyên màn cũ để đối chiếu"
          icon="admin-panel-settings"
          tokens={tokens}
          onPress={() => goTo(`/tournament/${tid}/manage`)}
        />
      </View>

      <SectionHeader
        title="Bracket cần chú ý"
        caption="Bracket còn nhiều trận chưa gán sân được đưa lên trước."
        tokens={tokens}
      />
      <View style={styles.listStack}>
        {bracketProgress.slice(0, 10).map((bracket) => (
          <Pressable
            key={bracket.id}
            onPress={() => goTo(`/tournament/${tid}/bracket?bracket=${bracket.id}`)}
            style={[
              styles.operationRow,
              { backgroundColor: tokens.card, borderColor: tokens.softBorder },
            ]}
          >
            <View style={styles.operationIcon}>
              <MaterialIcons name="account-tree" size={20} color={tokens.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: tokens.text }]} numberOfLines={1}>
                {bracket.name}
              </Text>
              <Text style={[styles.rowMeta, { color: tokens.muted }]}>
                {bracket.finished}/{bracket.total} xong · {bracket.noCourt} chưa sân
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={tokens.muted} />
          </Pressable>
        ))}
        {!bracketProgress.length ? (
          <EmptyState
            icon="account-tree"
            title="Chưa có dữ liệu bracket"
            caption="Tạo bracket hoặc kéo xuống để đồng bộ lại."
            tokens={tokens}
          />
        ) : null}
      </View>
    </View>
  );

  const renderPeople = () => (
    <View style={styles.stack}>
      <View style={styles.metricGrid}>
        <MetricTile
          label="Manager"
          value={metrics.managers}
          caption={canManageManagers ? "có thể chỉnh sửa" : "chỉ xem"}
          icon="supervisor-account"
          tone="info"
          tokens={tokens}
          onPress={() => canManageManagers && setManagerSheetOpen(true)}
        />
        <MetricTile
          label="Trọng tài"
          value={metrics.referees}
          caption="trong phạm vi giải"
          icon="how-to-reg"
          tone="good"
          tokens={tokens}
          onPress={() => setRefSheetOpen(true)}
        />
      </View>

      <SectionHeader
        title="Công cụ nhân sự"
        caption="Quản lý người vận hành giải và đội trọng tài."
        tokens={tokens}
      />
      <View style={styles.actionGrid}>
        <ActionTile
          title="Quản lý manager"
          caption="Thêm hoặc gỡ người quản lý giải"
          icon="manage-accounts"
          tokens={tokens}
          disabled={!canManageManagers}
          onPress={() => setManagerSheetOpen(true)}
        />
        <ActionTile
          title="Quản lý trọng tài"
          caption="Cập nhật danh sách trọng tài của giải"
          icon="how-to-reg"
          tokens={tokens}
          onPress={() => setRefSheetOpen(true)}
        />
        <ActionTile
          title="Trận thiếu trọng tài"
          caption={`${metrics.noRef} trận cần phân công`}
          icon="assignment-ind"
          tokens={tokens}
          onPress={() => goTo(sectionPath(tid, "matches", "noRef"))}
        />
        <ActionTile
          title="Quản lý cũ"
          caption="Mở lại màn cũ khi cần thao tác nâng cao"
          icon="admin-panel-settings"
          tokens={tokens}
          onPress={() => goTo(`/tournament/${tid}/manage`)}
        />
      </View>

      <SectionHeader title="Manager" tokens={tokens} />
      <View style={styles.listStack}>
        {managers.length ? (
          managers.map((manager, index) => (
            <View
              key={sid(manager?._id ?? manager?.id ?? manager?.user) || `${index}`}
              style={[
                styles.personRow,
                { backgroundColor: tokens.card, borderColor: tokens.softBorder },
              ]}
            >
              <View style={[styles.personAvatar, { backgroundColor: tokens.primarySoft }]}>
                <MaterialIcons name="person" size={20} color={tokens.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: tokens.text }]} numberOfLines={1}>
                  {personName(manager)}
                </Text>
                <Text style={[styles.rowMeta, { color: tokens.muted }]} numberOfLines={1}>
                  {personContact(manager) || "Manager giải đấu"}
                </Text>
              </View>
            </View>
          ))
        ) : (
          <EmptyState
            icon="person-off"
            title="Chưa có manager phụ"
            caption="Chủ giải hoặc admin vẫn có quyền quản lý."
            tokens={tokens}
          />
        )}
      </View>

      <SectionHeader title="Trọng tài" tokens={tokens} />
      <View style={styles.listStack}>
        {referees.length ? (
          referees.slice(0, 40).map((referee, index) => (
            <View
              key={sid(referee?._id ?? referee?.id ?? referee?.user) || `${index}`}
              style={[
                styles.personRow,
                { backgroundColor: tokens.card, borderColor: tokens.softBorder },
              ]}
            >
              <View style={[styles.personAvatar, { backgroundColor: tokens.successSoft }]}>
                <MaterialIcons name="sports" size={20} color={tokens.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: tokens.text }]} numberOfLines={1}>
                  {personName(referee)}
                </Text>
                <Text style={[styles.rowMeta, { color: tokens.muted }]} numberOfLines={1}>
                  {personContact(referee) || "Trọng tài"}
                </Text>
              </View>
            </View>
          ))
        ) : (
          <EmptyState
            icon="person-search"
            title="Chưa có trọng tài"
            caption="Thêm trọng tài để phân công nhanh cho trận."
            tokens={tokens}
          />
        )}
      </View>
    </View>
  );

  const renderBody = () => {
    if (tourLoading && !tour) {
      return (
        <View style={styles.center}>
          <ActivityIndicator color={tokens.primary} />
          <Text style={[styles.loadingText, { color: tokens.muted }]}>
            Đang mở console...
          </Text>
        </View>
      );
    }

    if (!canManage) {
      return (
        <View style={[styles.center, { paddingHorizontal: 16 }]}>
          <View
            style={[
              styles.lockCard,
              { backgroundColor: tokens.card, borderColor: tokens.softBorder },
            ]}
          >
            <MaterialIcons name="lock" size={32} color={tokens.warn} />
            <Text style={[styles.lockTitle, { color: tokens.text }]}>
              Bạn chưa có quyền quản lý giải này
            </Text>
            <Text style={[styles.lockCaption, { color: tokens.muted }]}>
              Console chỉ mở cho admin, chủ giải hoặc manager được phân quyền.
            </Text>
            <View style={styles.lockActions}>
              <Pressable
                style={[styles.primaryButton, { backgroundColor: tokens.primary }]}
                onPress={() => router.back()}
              >
                <Text style={styles.primaryButtonText}>Quay lại</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.secondaryButton,
                  { borderColor: tokens.border, backgroundColor: tokens.card },
                ]}
                onPress={() => goTo(`/tournament/${tid}/home`)}
              >
                <Text style={[styles.secondaryButtonText, { color: tokens.text }]}>
                  Tổng quan
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      );
    }

    if (section === "matches") return renderMatches();
    if (section === "operations") return renderOperations();
    if (section === "people") return renderPeople();
    return renderOverview();
  };

  return (
    <View style={[styles.root, { backgroundColor: tokens.page }]}>
      <Stack.Screen options={{ headerShown: false }} />
      {renderTopBar()}
      <ScrollView
        style={styles.scroller}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom + 28, 44) },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={Boolean(refreshing)}
            onRefresh={refreshAll}
            tintColor={tokens.primary}
          />
        }
      >
        {renderBody()}
      </ScrollView>

      <ResponsiveMatchViewer
        open={viewer.open}
        matchId={viewer.matchId}
        onClose={() => setViewer({ open: false, matchId: "" })}
      />
      <AssignCourtSheet
        open={assignCourt.open}
        onClose={() => setAssignCourt({ open: false, match: null })}
        tournamentId={tid}
        match={assignCourt.match}
        onAssigned={afterMutation}
      />
      <AssignRefSheet
        open={assignRef.open}
        onClose={() => setAssignRef({ open: false, match: null })}
        tournamentId={tid}
        match={assignRef.match}
        matchIds={undefined}
        onChanged={afterMutation}
      />
      <CourtManagerSheet
        open={courtSheetOpen}
        onClose={() => setCourtSheetOpen(false)}
        tournamentId={tid}
        bracketId={null}
        bracketName=""
        tournamentName={tourName}
        snapPoints={undefined}
      />
      <LiveSetupSheet
        open={liveSetupOpen}
        onClose={() => setLiveSetupOpen(false)}
        tournamentId={tid}
        tournamentName={tourName}
        allowedClusters={getAllowedClusters(tour)}
      />
      <TournamentManagersSheet
        open={managerSheetOpen}
        onClose={() => setManagerSheetOpen(false)}
        tournamentId={tid}
        onChanged={afterMutation}
      />
      <ManageRefereesSheet
        open={refSheetOpen}
        onClose={() => setRefSheetOpen(false)}
        tournamentId={tid}
        onChanged={afterMutation}
      />

      <Modal
        visible={videoDialog.open}
        transparent
        animationType="fade"
        onRequestClose={closeVideoDialog}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeVideoDialog} />
        <View style={styles.modalCenter}>
          <View
            style={[
              styles.videoCard,
              { backgroundColor: tokens.card, borderColor: tokens.softBorder },
            ]}
          >
            <View style={styles.rowBetween}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={[styles.videoTitle, { color: tokens.text }]}>
                  Link video trận
                </Text>
                <Text style={[styles.videoCaption, { color: tokens.muted }]} numberOfLines={1}>
                  {matchCode(videoDialog.match)}
                </Text>
              </View>
              <IconButton icon="close" tokens={tokens} onPress={closeVideoDialog} />
            </View>
            <TextInput
              value={videoDialog.url}
              onChangeText={(url) => setVideoDialog((current) => ({ ...current, url }))}
              placeholder="URL YouTube, Facebook, TikTok, M3U8..."
              placeholderTextColor={tokens.muted}
              autoCapitalize="none"
              autoCorrect={false}
              style={[
                styles.videoInput,
                {
                  color: tokens.text,
                  borderColor: tokens.border,
                  backgroundColor: tokens.dark ? "#0b1220" : "#f8fafc",
                },
              ]}
            />
            <View style={styles.videoActions}>
              <Pressable
                disabled={savingVideo}
                onPress={() => saveVideo("")}
                style={[
                  styles.secondaryButton,
                  { borderColor: tokens.border, backgroundColor: tokens.card },
                ]}
              >
                <Text style={[styles.secondaryButtonText, { color: tokens.text }]}>
                  Xóa link
                </Text>
              </Pressable>
              <Pressable
                disabled={savingVideo}
                onPress={() => saveVideo()}
                style={[styles.primaryButton, { backgroundColor: tokens.primary }]}
              >
                {savingVideo ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Lưu</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  headerTop: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  headerEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "800",
    marginTop: 2,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tabRow: {
    gap: 8,
    paddingTop: 10,
    paddingRight: 4,
  },
  tab: {
    height: 36,
    minWidth: 108,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  tabText: {
    fontSize: 13,
    fontWeight: "700",
  },
  scroller: {
    flex: 1,
  },
  content: {
    padding: 12,
  },
  stack: {
    gap: 14,
  },
  center: {
    minHeight: 420,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: "600",
  },
  summaryBand: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  summaryCopy: {
    flex: 1,
    minWidth: 0,
  },
  summaryTitle: {
    fontSize: 21,
    fontWeight: "800",
  },
  summaryCaption: {
    marginTop: 5,
    fontSize: 13,
    fontWeight: "600",
  },
  summaryStatusRow: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  summaryBadge: {
    height: 32,
    borderRadius: 8,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  summaryBadgeText: {
    fontSize: 12,
    fontWeight: "800",
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metricTile: {
    minHeight: 126,
    flexBasis: "47%",
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    gap: 6,
    overflow: "hidden",
    position: "relative",
  },
  metricAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  metricIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  metricValue: {
    fontSize: 26,
    fontWeight: "800",
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  metricCaption: {
    fontSize: 12,
    fontWeight: "600",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
  },
  sectionCaption: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: "600",
  },
  actionGrid: {
    gap: 10,
  },
  actionTile: {
    minHeight: 74,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    overflow: "hidden",
    position: "relative",
  },
  actionRail: {
    position: "absolute",
    left: 0,
    top: 12,
    bottom: 12,
    width: 3,
    borderTopRightRadius: 999,
    borderBottomRightRadius: 999,
  },
  actionIcon: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: {
    flex: 1,
    minWidth: 0,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  actionCaption: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17,
  },
  listStack: {
    gap: 10,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  rowMeta: {
    fontSize: 12,
    fontWeight: "600",
  },
  progressRow: {
    minHeight: 84,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    overflow: "hidden",
  },
  progressFill: {
    height: 6,
    borderRadius: 999,
  },
  pill: {
    minHeight: 26,
    maxWidth: 190,
    borderRadius: 8,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  pillText: {
    fontSize: 11,
    fontWeight: "800",
  },
  emptyState: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 18,
    alignItems: "center",
    gap: 6,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  emptyCaption: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  searchBlock: {
    gap: 10,
  },
  searchInputWrap: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchInput: {
    flex: 1,
    minHeight: 44,
    fontSize: 14,
    fontWeight: "600",
    paddingVertical: 0,
  },
  filterRow: {
    gap: 8,
    paddingRight: 4,
  },
  filterChip: {
    height: 34,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  filterText: {
    fontSize: 12,
    fontWeight: "800",
  },
  loadingCard: {
    minHeight: 140,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  matchRow: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    gap: 10,
  },
  matchCode: {
    fontSize: 13,
    fontWeight: "800",
  },
  matchTeams: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 20,
  },
  matchMetaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  matchActions: {
    gap: 8,
    paddingRight: 4,
  },
  smallAction: {
    height: 34,
    minWidth: 70,
    borderRadius: 8,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  smallActionText: {
    fontSize: 12,
    fontWeight: "800",
  },
  operationRow: {
    minHeight: 66,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  operationIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  personRow: {
    minHeight: 64,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  personAvatar: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  lockCard: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 8,
    padding: 18,
    alignItems: "center",
    gap: 10,
  },
  lockTitle: {
    fontSize: 17,
    fontWeight: "800",
    textAlign: "center",
  },
  lockCaption: {
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 19,
  },
  lockActions: {
    marginTop: 4,
    flexDirection: "row",
    gap: 10,
  },
  primaryButton: {
    minWidth: 104,
    minHeight: 42,
    borderRadius: 8,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },
  secondaryButton: {
    minWidth: 104,
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "800",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.52)",
  },
  modalCenter: {
    flex: 1,
    justifyContent: "center",
    padding: 16,
  },
  videoCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    gap: 12,
  },
  videoTitle: {
    fontSize: 17,
    fontWeight: "800",
  },
  videoCaption: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: "700",
  },
  videoInput: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: "600",
  },
  videoActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
});
