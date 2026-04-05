import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { skipToken } from "@reduxjs/toolkit/query";
import { MaterialIcons } from "@expo/vector-icons";
import { useTheme } from "@react-navigation/native";
import { useSocket } from "@/context/SocketContext";
import { useSocketRoomSet } from "@/hooks/useSocketRoomSet";
import ResponsiveMatchViewer from "@/components/match/ResponsiveMatchViewer";
import { getPairDisplayName, normalizeMatchDisplay } from "@/utils/matchDisplay";
import { useAdminListCourtsQuery } from "@/slices/adminCourtApiSlice";
import {
  useAdminAssignMatchToCourtMutation,
  useAdminClearMatchCourtMutation,
} from "@/slices/tournamentsApiSlice";
import {
  useAppendTournamentCourtStationQueueItemMutation,
  useAssignTournamentMatchToCourtStationMutation,
  useFreeTournamentCourtStationMutation,
  useGetTournamentCourtClusterOptionsQuery,
  useGetTournamentCourtClusterRuntimeQuery,
  useRemoveTournamentCourtStationQueueItemMutation,
} from "@/slices/courtClustersAdminApiSlice";

const sid = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value._id) return String(value._id);
  if (typeof value === "object" && value.id) return String(value.id);
  return String(value);
};

const text = (value) => String(value || "").trim();

const normalizedMatch = (match) =>
  match && typeof match === "object"
    ? normalizeMatchDisplay(match, match?.tournament || match)
    : match;

const matchCode = (match) =>
  text(match?.displayCode) ||
  text(match?.codeDisplay) ||
  text(match?.globalCode) ||
  text(match?.code) ||
  text(match?.labelKeyDisplay) ||
  text(match?.labelKey) ||
  "—";

const tournamentTitle = (match) =>
  text(
    normalizedMatch(match)?.tournament?.name ||
      match?.tournamentName ||
      match?.tournament?.name
  ) || "Giải không xác định";

const teamLine = (match) => {
  const next = normalizedMatch(match);
  const pairA =
    getPairDisplayName(next?.pairA, next) || next?.pairAName || "Đội A";
  const pairB =
    getPairDisplayName(next?.pairB, next) || next?.pairBName || "Đội B";
  return `${pairA} vs ${pairB}`;
};

const stationStatusLabel = (status) => {
  switch (String(status || "").toLowerCase()) {
    case "idle":
      return "Sẵn sàng";
    case "assigned":
      return "Đã gán trận";
    case "live":
      return "Đang live";
    case "maintenance":
      return "Bảo trì";
    default:
      return status || "—";
  }
};

const assignmentModeLabel = (mode) =>
  String(mode || "").toLowerCase() === "queue"
    ? "Theo hàng chờ"
    : "Gán tay";

const Row = ({ children, style }) => (
  <View style={[styles.row, style]}>{children}</View>
);

function QueueDetailSheet({ open, onClose, station, onSelectMatch }) {
  const sheetRef = useRef(null);
  const t = useTokens();
  const queueMatches = useMemo(
    () =>
      Array.isArray(station?.queueItems)
        ? station.queueItems.map((item) => normalizedMatch(item?.match)).filter(Boolean)
        : [],
    [station]
  );

  useEffect(() => {
    if (open) sheetRef.current?.present();
    else sheetRef.current?.dismiss();
  }, [open]);

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={["65%"]}
      onDismiss={onClose}
      backdropComponent={(p) => (
        <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} style={{ zIndex: 1000 }} />
      )}
      handleIndicatorStyle={{ backgroundColor: t.colors.border }}
      backgroundStyle={{ backgroundColor: t.colors.card }}
      containerStyle={{ zIndex: 1000 }}
    >
      <BottomSheetScrollView contentContainerStyle={styles.container}>
        <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[styles.title, { color: t.colors.text }]}>Hàng chờ của sân</Text>
            <Text style={{ color: t.muted }}>
              {station?.name || "Sân"} · {station?.code || "—"}
            </Text>
          </View>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              styles.iconBtn,
              pressed && { opacity: 0.8 },
            ]}
            hitSlop={8}
          >
            <MaterialIcons name="close" size={18} color={t.colors.text} />
          </Pressable>
        </Row>

        {!queueMatches.length ? (
          <View
            style={[
              styles.infoBox,
              { backgroundColor: t.chipInfoBg, borderColor: t.chipInfoBd },
            ]}
          >
            <Text style={{ color: t.chipInfoFg }}>Sân này chưa có trận nào trong hàng chờ.</Text>
          </View>
        ) : (
          <View style={styles.queuePreviewWrap}>
            {queueMatches.map((queuedMatch, index) => (
              <Pressable
                key={`${sid(station?._id)}-${sid(queuedMatch?._id || queuedMatch?.id) || index}`}
                onPress={() => onSelectMatch?.(sid(queuedMatch?._id || queuedMatch?.id))}
                style={({ pressed }) => [
                  styles.queuePreviewItem,
                  { borderColor: t.colors.border, backgroundColor: t.colors.card },
                  pressed && { opacity: 0.88 },
                ]}
              >
                <Text style={{ color: t.muted, fontSize: 12 }}>{tournamentTitle(queuedMatch)}</Text>
                <Text style={{ color: t.colors.text, fontWeight: "700" }}>
                  Hàng chờ #{index + 1} · {matchCode(queuedMatch)}
                </Text>
                <Text style={{ color: t.muted }}>{teamLine(queuedMatch)}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

function useTokens() {
  const navTheme = useTheme?.() || {};
  const scheme = useColorScheme?.() || "light";
  const dark =
    typeof navTheme.dark === "boolean" ? navTheme.dark : scheme === "dark";

  const primary = navTheme?.colors?.primary ?? (dark ? "#7cc0ff" : "#0a84ff");
  const textColor = navTheme?.colors?.text ?? (dark ? "#f7f7f7" : "#111");
  const card = navTheme?.colors?.card ?? (dark ? "#16181c" : "#ffffff");
  const border = navTheme?.colors?.border ?? (dark ? "#2e2f33" : "#e5e7eb");
  const background =
    navTheme?.colors?.background ?? (dark ? "#0b0d10" : "#f6f8fc");

  return {
    colors: { primary, text: textColor, card, border, background },
    muted: dark ? "#9aa0a6" : "#6b7280",
    chipDefaultBg: dark ? "#1f2937" : "#eef2f7",
    chipDefaultFg: dark ? "#e5e7eb" : "#263238",
    chipDefaultBd: dark ? "#334155" : "#e2e8f0",
    chipInfoBg: dark ? "#0f2536" : "#e0f2fe",
    chipInfoFg: dark ? "#93c5fd" : "#075985",
    chipInfoBd: dark ? "#1e3a5f" : "#bae6fd",
    chipErrBg: dark ? "#3b0d0d" : "#fee2e2",
    chipErrFg: dark ? "#fecaca" : "#991b1b",
    chipErrBd: dark ? "#7f1d1d" : "#fecaca",
    chipWarnBg: dark ? "#2b1b0f" : "#fff7ed",
    chipWarnFg: dark ? "#fbbf24" : "#9a3412",
    chipWarnBd: dark ? "#854d0e" : "#fed7aa",
    chipSecBg: dark ? "#241b4b" : "#ede9fe",
    chipSecFg: dark ? "#c4b5fd" : "#5b21b6",
    chipSecBd: dark ? "#4c1d95" : "#ddd6fe",
  };
}

export default function AssignCourtSheet({
  open,
  onClose,
  tournamentId,
  match,
  onAssigned,
}) {
  const sheetRef = useRef(null);
  const socket = useSocket();
  const t = useTokens();
  const normalizedTournamentId = sid(tournamentId);
  const bracketId = match?.bracket?._id || match?.bracket || "";
  const [selectedClusterId, setSelectedClusterId] = useState("");
  const [queueDetailStationId, setQueueDetailStationId] = useState("");
  const [viewerMatchId, setViewerMatchId] = useState("");

  const Card = ({ children, highlighted = false }) => (
    <View
      style={[
        styles.card,
        {
          backgroundColor: t.colors.card,
          borderColor: highlighted ? t.colors.primary : t.colors.border,
        },
      ]}
    >
      {children}
    </View>
  );

  const Chip = ({ text: label, tone = "default", outlined = false, onPress, disabled }) => {
    const map = {
      default: { bg: t.chipDefaultBg, fg: t.chipDefaultFg, bd: t.chipDefaultBd },
      info: { bg: t.chipInfoBg, fg: t.chipInfoFg, bd: t.chipInfoBd },
      error: { bg: t.chipErrBg, fg: t.chipErrFg, bd: t.chipErrBd },
      warning: { bg: t.chipWarnBg, fg: t.chipWarnFg, bd: t.chipWarnBd },
      secondary: { bg: t.chipSecBg, fg: t.chipSecFg, bd: t.chipSecBd },
    };
    const c = map[tone] || map.default;
    const isDisabled = Boolean(disabled || !onPress);
    return (
      <Pressable
        onPress={onPress}
        disabled={isDisabled}
        style={({ pressed }) => [
          styles.chip,
          outlined
            ? { backgroundColor: "transparent", borderColor: c.bd, borderWidth: 1 }
            : { backgroundColor: c.bg, borderColor: "transparent" },
          isDisabled && { opacity: 0.5 },
          pressed && !isDisabled && { opacity: 0.9 },
        ]}
      >
        <Text style={{ color: c.fg, fontSize: 12, fontWeight: "700" }}>{label}</Text>
      </Pressable>
    );
  };

  const Btn = ({ children, onPress, variant = "solid", disabled, danger = false }) => {
    const isDisabled = Boolean(disabled);
    return (
      <Pressable
        onPress={onPress}
        disabled={isDisabled}
        style={({ pressed }) => [
          styles.btn,
          variant === "solid"
            ? { backgroundColor: danger ? "#ef4444" : t.colors.primary }
            : {
                borderWidth: 1,
                borderColor: danger ? "#ef4444" : t.colors.primary,
                backgroundColor: "transparent",
              },
          isDisabled && { opacity: 0.5 },
          pressed && !isDisabled && { opacity: 0.9 },
        ]}
      >
        <Text
          style={{
            color: variant === "solid" ? "#fff" : danger ? "#ef4444" : t.colors.primary,
            fontWeight: "700",
          }}
        >
          {children}
        </Text>
      </Pressable>
    );
  };

  const IconBtn = ({ name, onPress, size = 18, color = t.colors.text }) => (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.85 }]}
    >
      <MaterialIcons name={name} size={size} color={color} />
    </Pressable>
  );
  const {
    data: clusterOptionsData,
    isLoading: isLoadingClusterOptions,
    isFetching: isFetchingClusterOptions,
    refetch: refetchClusterOptions,
  } = useGetTournamentCourtClusterOptionsQuery(
    open && normalizedTournamentId ? normalizedTournamentId : skipToken,
    {
      refetchOnMountOrArgChange: true,
      refetchOnFocus: true,
      refetchOnReconnect: true,
    }
  );

  const allowedClusterOptions = useMemo(() => {
    const selectedIds = Array.isArray(clusterOptionsData?.selectedIds)
      ? clusterOptionsData.selectedIds.map((value) => sid(value)).filter(Boolean)
      : [];
    const items = Array.isArray(clusterOptionsData?.items) ? clusterOptionsData.items : [];
    const selectedItems = items.filter((cluster) =>
      selectedIds.includes(sid(cluster?._id || cluster?.id))
    );
    return selectedItems.length ? selectedItems : items;
  }, [clusterOptionsData?.items, clusterOptionsData?.selectedIds]);

  const isClusterRuntimeMode = Boolean(
    open && normalizedTournamentId && allowedClusterOptions.length
  );

  useEffect(() => {
    if (!open || !allowedClusterOptions.length) return;
    const currentClusterId = sid(match?.courtClusterId);
    const allowedIds = allowedClusterOptions
      .map((cluster) => sid(cluster?._id || cluster?.id))
      .filter(Boolean);
    if (currentClusterId && allowedIds.includes(currentClusterId)) {
      setSelectedClusterId(currentClusterId);
      return;
    }
    if (!selectedClusterId || !allowedIds.includes(selectedClusterId)) {
      setSelectedClusterId(allowedIds[0] || "");
    }
  }, [allowedClusterOptions, match?.courtClusterId, open, selectedClusterId]);

  const {
    data: runtime,
    isLoading: isLoadingRuntime,
    error: runtimeError,
    refetch: refetchRuntime,
  } = useGetTournamentCourtClusterRuntimeQuery(
    open && normalizedTournamentId && selectedClusterId
      ? { tournamentId: normalizedTournamentId, clusterId: selectedClusterId }
      : skipToken,
    {
      refetchOnMountOrArgChange: true,
      refetchOnFocus: true,
      refetchOnReconnect: true,
    }
  );

  const {
    data: legacyCourts = [],
    isLoading: isLoadingLegacyCourts,
    refetch: refetchLegacyCourts,
  } = useAdminListCourtsQuery(
    open && tournamentId && bracketId && !isClusterRuntimeMode
      ? { tid: tournamentId, bracket: bracketId }
      : skipToken,
    {
      refetchOnMountOrArgChange: true,
      refetchOnFocus: true,
      refetchOnReconnect: true,
    }
  );

  const [assignLegacyMatch, { isLoading: assigningLegacy }] =
    useAdminAssignMatchToCourtMutation();
  const [clearLegacyCourt, { isLoading: clearingLegacy }] =
    useAdminClearMatchCourtMutation();
  const [assignMatchToCourtStation, { isLoading: assigningStation }] =
    useAssignTournamentMatchToCourtStationMutation();
  const [appendQueueItem, { isLoading: appendingQueue }] =
    useAppendTournamentCourtStationQueueItemMutation();
  const [removeQueueItem, { isLoading: removingQueue }] =
    useRemoveTournamentCourtStationQueueItemMutation();
  const [freeCourtStation, { isLoading: freeingStation }] =
    useFreeTournamentCourtStationMutation();

  useEffect(() => {
    if (open) sheetRef.current?.present();
    else sheetRef.current?.dismiss();
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQueueDetailStationId("");
      setViewerMatchId("");
    }
  }, [open]);

  useSocketRoomSet(
    socket,
    open && isClusterRuntimeMode && selectedClusterId ? [selectedClusterId] : [],
    {
      subscribeEvent: "court-cluster:watch",
      unsubscribeEvent: "court-cluster:unwatch",
      payloadKey: "clusterId",
      onResync: () => {
        refetchRuntime?.();
      },
    }
  );

  useEffect(() => {
    if (!socket || !open || !selectedClusterId || !isClusterRuntimeMode) {
      return undefined;
    }

    const handleClusterUpdate = (payload) => {
      const clusterId = sid(payload?.cluster?._id || payload?.clusterId);
      if (clusterId !== selectedClusterId) return;
      refetchRuntime?.();
    };

    const handleStationUpdate = (payload) => {
      const clusterId = sid(
        payload?.cluster?._id || payload?.clusterId || payload?.station?.clusterId
      );
      if (clusterId !== selectedClusterId) return;
      refetchRuntime?.();
    };

    socket.on?.("court-cluster:update", handleClusterUpdate);
    socket.on?.("court-station:update", handleStationUpdate);
    return () => {
      socket.off?.("court-cluster:update", handleClusterUpdate);
      socket.off?.("court-station:update", handleStationUpdate);
    };
  }, [isClusterRuntimeMode, open, refetchRuntime, selectedClusterId, socket]);

  const stations = useMemo(() => runtime?.stations || [], [runtime?.stations]);
  const matchId = sid(match?._id);

  const currentStation = useMemo(() => {
    const direct = sid(match?.courtStationId || match?.courtStation?._id);
    if (direct) {
      const directStation =
        stations.find((station) => sid(station?._id) === direct) || null;
      if (
        directStation &&
        sid(directStation?.currentMatch?._id || directStation?.currentMatch) ===
          matchId
      ) {
        return directStation;
      }
    }
    return (
      stations.find(
        (station) =>
          sid(station?.currentMatch?._id || station?.currentMatch) === matchId
      ) || null
    );
  }, [match?.courtStation?._id, match?.courtStationId, matchId, stations]);

  const queuedInfo = useMemo(() => {
    for (const station of stations) {
      const queueItems = Array.isArray(station?.queueItems) ? station.queueItems : [];
      const index = queueItems.findIndex(
        (item) => sid(item?.matchId || item?.match?._id) === matchId
      );
      if (index !== -1) return { station, index };
    }
    return null;
  }, [matchId, stations]);

  const currentStationId = sid(currentStation?._id);
  const queuedStation = queuedInfo?.station || null;
  const queuedStationId = sid(queuedStation?._id);
  const queuedIndex = queuedInfo?.index ?? -1;
  const sharedTournamentCount = Number(runtime?.sharedTournamentCount || 0);
  const sharedTournamentNames = Array.isArray(runtime?.sharedTournaments)
    ? runtime.sharedTournaments.map((item) => text(item?.name)).filter(Boolean)
    : [];

  useEffect(() => {
    if (!queueDetailStationId) return;
    const exists = stations.some((station) => sid(station?._id) === queueDetailStationId);
    if (!exists) setQueueDetailStationId("");
  }, [queueDetailStationId, stations]);

  const legacyCourtsByStatus = useMemo(() => {
    const idle = [];
    const busy = [];
    (legacyCourts || []).forEach((court) =>
      court.currentMatch ? busy.push(court) : idle.push(court)
    );
    return { idle, busy };
  }, [legacyCourts]);

  const handleLegacyAssign = async (court) => {
    if (!match?._id) return;
    try {
      await assignLegacyMatch({ tid: tournamentId, matchId: match._id, courtId: court._id }).unwrap();
      Alert.alert("Thành công", `Đã gán ${matchCode(match)} -> ${court.name}`);
      onAssigned?.();
      onClose?.();
    } catch (error) {
      Alert.alert("Lỗi", error?.data?.message || error?.error || "Gán sân thất bại");
    }
  };

  const handleLegacyClear = async () => {
    if (!match?._id) return;
    try {
      await clearLegacyCourt({ tid: tournamentId, matchId: match._id }).unwrap();
      Alert.alert("Thành công", "Đã bỏ gán sân");
      onAssigned?.();
      refetchLegacyCourts?.();
    } catch (error) {
      Alert.alert("Lỗi", error?.data?.message || error?.error || "Gỡ sân thất bại");
    }
  };

  const handleRuntimeAction = async (station) => {
    const stationId = sid(station?._id);
    if (!stationId || !matchId) return;
    try {
      if (String(station?.assignmentMode || "manual").toLowerCase() === "queue") {
        await appendQueueItem({ tournamentId: normalizedTournamentId, stationId, matchId }).unwrap();
      } else {
        await assignMatchToCourtStation({ tournamentId: normalizedTournamentId, stationId, matchId }).unwrap();
      }
      onAssigned?.();
      onClose?.();
    } catch (error) {
      Alert.alert("Lỗi", error?.data?.message || error?.message || "Cập nhật sân thất bại");
    }
  };

  const handleRemoveQueued = async () => {
    if (!queuedStationId || !matchId) return;
    try {
      await removeQueueItem({ tournamentId: normalizedTournamentId, stationId: queuedStationId, matchId }).unwrap();
      await refetchRuntime?.();
      onAssigned?.();
    } catch (error) {
      Alert.alert("Lỗi", error?.data?.message || error?.message || "Bỏ trận khỏi hàng đợi thất bại");
    }
  };

  const handleFreeCurrentStation = async () => {
    if (!currentStationId) return;
    try {
      await freeCourtStation({ tournamentId: normalizedTournamentId, stationId: currentStationId }).unwrap();
      await refetchRuntime?.();
      onAssigned?.();
    } catch (error) {
      Alert.alert("Lỗi", error?.data?.message || error?.message || "Bỏ gán sân thất bại");
    }
  };
  const renderRuntimeStationCard = (station) => {
    const stationId = sid(station?._id);
    const assignmentMode = String(station?.assignmentMode || "manual").toLowerCase();
    const current = normalizedMatch(station?.currentMatch);
    const nextQueuedMatch = normalizedMatch(station?.nextQueuedMatch);
    const queueItems = Array.isArray(station?.queueItems) ? station.queueItems : [];
    const queueMatches = queueItems.map((item) => normalizedMatch(item?.match)).filter(Boolean);
    const queueContainsMatch = queueItems.some(
      (item) => sid(item?.matchId || item?.match?._id) === matchId
    );
    const isCurrent = currentStationId === stationId;
    const isQueued = queuedStationId === stationId;
    const occupiedTournamentId = sid(
      current?.tournament?._id || station?.currentTournament?._id || station?.currentTournamentId
    );
    const occupiedByAnotherTournament = Boolean(
      occupiedTournamentId &&
        normalizedTournamentId &&
        occupiedTournamentId !== normalizedTournamentId
    );
    const disabledAction =
      assigningStation ||
      appendingQueue ||
      (assignmentMode === "queue" && queueContainsMatch) ||
      (assignmentMode === "manual" && isCurrent) ||
      occupiedByAnotherTournament;
    const actionLabel =
      assignmentMode === "queue" && current
        ? "Thêm vào hàng chờ"
        : "Gán trực tiếp";

    return (
      <Card key={stationId} highlighted={isCurrent || isQueued}>
        <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Row style={{ alignItems: "center", gap: 8 }}>
              <MaterialIcons name="stadium" size={18} color={t.colors.text} />
              <Text style={{ fontWeight: "700", color: t.colors.text, fontSize: 16 }}>
                {station?.name || "Sân"}
              </Text>
            </Row>
            <Text style={{ color: t.muted }}>{station?.code || "—"}</Text>
          </View>
          <View style={styles.stationChipWrap}>
            <Chip text={stationStatusLabel(station?.status)} outlined />
            <Chip text={assignmentModeLabel(assignmentMode)} tone="secondary" outlined />
            {assignmentMode === "queue" && queueItems.length ? (
              <Chip
                text={`${queueItems.length} trận chờ`}
                tone="info"
                outlined
                onPress={() => setQueueDetailStationId(stationId)}
              />
            ) : null}
          </View>
        </Row>

        {current ? (
          <Pressable
            onPress={() => setViewerMatchId(sid(current?._id || current?.id))}
            style={({ pressed }) => [
              styles.matchBlock,
              { borderColor: t.colors.border, backgroundColor: t.colors.background },
              pressed && { opacity: 0.88 },
            ]}
          >
            <Text style={{ color: t.muted, fontSize: 12 }}>Đang phát</Text>
            <Text style={{ color: t.muted, fontSize: 12 }}>{tournamentTitle(current)}</Text>
            <Text style={{ color: t.colors.text, fontWeight: "700" }}>{matchCode(current)}</Text>
            <Text style={{ color: t.muted }}>{teamLine(current)}</Text>
          </Pressable>
        ) : (
          <Text style={{ color: t.muted }}>Sân đang trống.</Text>
        )}

        {assignmentMode === "queue" && nextQueuedMatch ? (
          <Pressable
            onPress={() => setViewerMatchId(sid(nextQueuedMatch?._id || nextQueuedMatch?.id))}
            style={({ pressed }) => [
              styles.nextQueueBlock,
              { borderColor: t.chipInfoBd, backgroundColor: t.chipInfoBg },
              pressed && { opacity: 0.9 },
            ]}
          >
            <Text style={{ color: t.chipInfoFg, fontSize: 12 }}>Kế tiếp</Text>
            <Text style={{ color: t.chipInfoFg, fontSize: 12 }}>
              {tournamentTitle(nextQueuedMatch)}
            </Text>
            <Text style={{ color: t.chipInfoFg, fontWeight: "700" }}>
              Tiếp theo: {matchCode(nextQueuedMatch)}
            </Text>
            <Text style={{ color: t.chipInfoFg }}>{teamLine(nextQueuedMatch)}</Text>
          </Pressable>
        ) : null}

        {occupiedByAnotherTournament ? (
          <Text style={{ color: t.chipWarnFg, fontSize: 12 }}>
            Sân này đang được giải khác sử dụng.
          </Text>
        ) : null}

        {(current || (assignmentMode === "queue" && (nextQueuedMatch || queueMatches.length))) ? (
          <Text style={{ color: t.muted, fontSize: 12 }}>
            Chạm vào thẻ trận để xem chi tiết.
          </Text>
        ) : null}

        <Row style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <Text
            style={{
              color: t.muted,
              fontSize: 12,
              fontWeight: "700",
              width: "100%",
            }}
          >
            Thao tác với sân này
          </Text>
          {isCurrent ? (
            <Btn variant="outline" danger onPress={handleFreeCurrentStation} disabled={freeingStation}>
              {freeingStation ? "Đang bỏ gán..." : "Bỏ gán sân"}
            </Btn>
          ) : isQueued ? (
            <Btn variant="outline" danger onPress={handleRemoveQueued} disabled={removingQueue}>
              {removingQueue ? "Đang bỏ..." : `Bỏ vị trí #${queuedIndex + 1}`}
            </Btn>
          ) : (
            <Btn onPress={() => handleRuntimeAction(station)} disabled={disabledAction}>
              {assignmentMode === "queue" && appendingQueue
                ? "Đang thêm..."
                : assigningStation
                ? "Đang gán..."
                : actionLabel}
            </Btn>
          )}
        </Row>
      </Card>
    );
  };

  const renderRuntimeSection = () => {
    if (!allowedClusterOptions.length && !isFetchingClusterOptions) {
      return (
        <View
          style={[
            styles.infoBox,
            { backgroundColor: t.chipWarnBg, borderColor: t.chipWarnBd },
          ]}
        >
          <Text style={{ color: t.chipWarnFg }}>
            Giải này chưa có cụm sân được phép dùng.
          </Text>
        </View>
      );
    }

    return (
      <View style={{ gap: 12 }}>
        <Text style={[styles.subtitle, { color: t.colors.text }]}>Chọn cụm sân</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.clusterScroll}>
          {allowedClusterOptions.map((cluster) => {
            const clusterId = sid(cluster?._id || cluster?.id);
            const picked = clusterId === selectedClusterId;
            return (
              <Pressable
                key={clusterId}
                onPress={() => setSelectedClusterId(clusterId)}
                style={[
                  styles.clusterChip,
                  {
                    borderColor: picked ? t.colors.primary : t.colors.border,
                    backgroundColor: picked ? t.chipInfoBg : t.colors.card,
                  },
                ]}
              >
                <Text style={{ color: picked ? t.colors.primary : t.colors.text, fontWeight: "700" }}>
                  {cluster?.name || "Cụm sân"}
                </Text>
                {cluster?.venueName ? (
                  <Text style={{ color: t.muted, fontSize: 12 }}>{cluster.venueName}</Text>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>

        {sharedTournamentCount > 1 ? (
          <Chip
            text={`Dùng chung ${sharedTournamentCount} giải`}
            tone="warning"
            outlined
            onPress={() =>
              Alert.alert(
                "Dùng chung cụm sân",
                sharedTournamentNames.length
                  ? sharedTournamentNames.join("\n")
                  : `Cụm sân này đang được ${sharedTournamentCount} giải sử dụng.`
              )
            }
          />
        ) : null}

        {currentStationId || queuedStationId ? (
          <Card highlighted>
            <Text style={{ color: t.colors.text, fontWeight: "700" }}>
              {currentStationId
                ? `Trận đang ở ${currentStation?.name || "sân"}`
                : `Trận đang chờ tại ${queuedStation?.name || "sân"}`}
            </Text>
            <Text style={{ color: t.muted }}>
              {currentStationId ? currentStation?.code || "—" : `Vị trí #${queuedIndex + 1}`}
            </Text>
          </Card>
        ) : null}

        {isLoadingRuntime || isLoadingClusterOptions ? (
          <View style={[styles.infoBox, { backgroundColor: t.chipInfoBg, borderColor: t.chipInfoBd }]}>
            <Text style={{ color: t.chipInfoFg }}>Đang tải runtime cụm sân...</Text>
          </View>
        ) : runtimeError && !runtime ? (
          <View style={[styles.infoBox, { backgroundColor: t.chipErrBg, borderColor: t.chipErrBd }]}>
            <Text style={{ color: t.chipErrFg }}>
              {runtimeError?.data?.message || runtimeError?.error || "Không tải được runtime cụm sân."}
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {stations.map(renderRuntimeStationCard)}
            {!stations.length ? (
              <View style={[styles.infoBox, { backgroundColor: t.chipInfoBg, borderColor: t.chipInfoBd }]}>
                <Text style={{ color: t.chipInfoFg }}>Chưa có sân vật lý trong cụm đã chọn.</Text>
              </View>
            ) : null}
          </View>
        )}
      </View>
    );
  };
  const renderLegacySection = () => (
    <>
      {match?.court?._id ? (
        <Card>
          <Row style={{ alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <Chip text={`Đang gán: ${match?.court?.name || ""}`} tone="secondary" outlined />
            <Chip
              text={clearingLegacy ? "Đang gỡ..." : "Bỏ gán sân"}
              tone="error"
              outlined
              onPress={handleLegacyClear}
              disabled={clearingLegacy}
            />
          </Row>
          <View style={{ marginTop: 6, gap: 2 }}>
            <Text style={{ color: t.muted, fontSize: 12 }}>{tournamentTitle(match)}</Text>
            <Text style={{ color: t.colors.text, fontWeight: "700" }}>{matchCode(match)}</Text>
            <Text style={{ color: t.muted }}>{teamLine(match)}</Text>
          </View>
        </Card>
      ) : null}

      <Row style={{ alignItems: "center", gap: 8 }}>
        <Text style={[styles.subtitle, { color: t.colors.text }]}>
          Sân trống ({legacyCourtsByStatus.idle.length})
        </Text>
        {isLoadingLegacyCourts ? <ActivityIndicator size="small" color={t.colors.primary} /> : null}
      </Row>

      {!open || isLoadingLegacyCourts ? null : (legacyCourts?.length || 0) === 0 ? (
        <Text style={{ color: t.muted }}>Chưa có sân nào cho bracket này.</Text>
      ) : (
        <View style={{ gap: 8 }}>
          {legacyCourtsByStatus.idle.map((court) => (
            <Card key={court._id}>
              <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontWeight: "700", color: t.colors.text }}>{court.name}</Text>
                <Chip text="Trong" outlined />
              </Row>
              <Row style={{ flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                <Chip
                  text={assigningLegacy ? "Đang gán..." : "Gán sân này"}
                  tone="secondary"
                  onPress={() => handleLegacyAssign(court)}
                  disabled={assigningLegacy}
                />
              </Row>
            </Card>
          ))}
        </View>
      )}

      {legacyCourtsByStatus.busy.length > 0 ? (
        <View style={{ marginTop: 12, gap: 8 }}>
          <Text style={[styles.subtitle, { color: t.colors.text }]}>
            Sân đang dùng ({legacyCourtsByStatus.busy.length})
          </Text>
          {legacyCourtsByStatus.busy.map((court) => (
            <Card key={court._id}>
              <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontWeight: "700", color: t.colors.text }}>{court.name}</Text>
                <Chip text="Đang dùng" outlined />
              </Row>
              {court.currentMatch ? (
                <View style={{ marginTop: 6, gap: 2 }}>
                  <Text style={{ color: t.muted, fontSize: 12 }}>{tournamentTitle(court.currentMatch)}</Text>
                  <Text style={{ color: t.colors.text, fontWeight: "700" }}>
                    {court.currentMatch.code || matchCode(court.currentMatch)}
                  </Text>
                  <Text style={{ color: t.muted }}>{teamLine(court.currentMatch)}</Text>
                </View>
              ) : null}
            </Card>
          ))}
        </View>
      ) : null}
    </>
  );

  return (
    <>
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={["84%"]}
        onDismiss={onClose}
        backdropComponent={(p) => (
          <BottomSheetBackdrop
            {...p}
            appearsOnIndex={0}
            disappearsOnIndex={-1}
            style={{ zIndex: 1000 }}
          />
        )}
        handleIndicatorStyle={{ backgroundColor: t.colors.border }}
        backgroundStyle={{ backgroundColor: t.colors.card }}
        containerStyle={{ zIndex: 1000 }}
      >
        <BottomSheetScrollView contentContainerStyle={styles.container}>
          <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
            <Row style={{ alignItems: "center", gap: 6 }}>
              <MaterialIcons name="stadium" size={18} color={t.colors.text} />
              <Text style={[styles.title, { color: t.colors.text }]}>Gán sân — {match ? matchCode(match) : "—"}</Text>
            </Row>
            <Row style={{ alignItems: "center", gap: 6 }}>
              <IconBtn
                name="refresh"
                onPress={() => {
                  refetchClusterOptions?.();
                  refetchRuntime?.();
                  refetchLegacyCourts?.();
                }}
              />
              <IconBtn name="close" onPress={() => sheetRef.current?.dismiss()} />
            </Row>
          </Row>

          <Card>
            <Text style={{ color: t.colors.text, fontWeight: "700" }}>{teamLine(match)}</Text>
            <Text style={{ color: t.muted }}>{tournamentTitle(match)} · {matchCode(match)}</Text>
            <Text style={{ color: t.muted, marginTop: 6 }}>
              {isClusterRuntimeMode
                ? "Chọn cụm sân rồi chọn sân phù hợp để gán trận."
                : "Giải này chưa dùng cụm sân, đang quay về danh sách sân cũ."}
            </Text>
          </Card>

          {isClusterRuntimeMode ? renderRuntimeSection() : renderLegacySection()}

          <Row style={{ justifyContent: "flex-end", marginTop: 12 }}>
            <Btn variant="outline" onPress={() => sheetRef.current?.dismiss()}>
              Đóng
            </Btn>
          </Row>
        </BottomSheetScrollView>
      </BottomSheetModal>

      <ResponsiveMatchViewer
        open={Boolean(viewerMatchId)}
        matchId={viewerMatchId}
        onClose={() => setViewerMatchId("")}
      />

      <QueueDetailSheet
        open={Boolean(queueDetailStationId)}
        onClose={() => setQueueDetailStationId("")}
        station={stations.find((item) => sid(item?._id) === queueDetailStationId) || null}
        onSelectMatch={(id) => setViewerMatchId(id)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { padding: 12, gap: 12 },
  row: { flexDirection: "row", gap: 8 },
  title: { fontSize: 16, fontWeight: "700" },
  subtitle: { fontSize: 14, fontWeight: "700" },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  btn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
  iconBtn: { padding: 6, borderRadius: 999 },
  infoBox: { borderWidth: 1, borderRadius: 10, padding: 10 },
  clusterScroll: { gap: 8, paddingRight: 4 },
  clusterChip: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minWidth: 150,
    gap: 4,
  },
  stationChipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 6,
    maxWidth: "52%",
  },
  matchBlock: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 4 },
  nextQueueBlock: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 4 },
  queuePreviewWrap: { gap: 8 },
  queuePreviewItem: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 4 },
});
