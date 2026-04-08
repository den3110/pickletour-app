import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert as RNAlert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  useColorScheme,
  View,
} from "react-native";
import {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetModal,
} from "@gorhom/bottom-sheet";
import { useTheme } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { router } from "expo-router";

import {
  useAdminListCourtsByTournamentQuery,
  useAdminSetCourtLiveConfigMutation,
} from "@/slices/courtsApiSlice";
import {
  useGetTournamentCourtClusterRuntimeQuery,
  useUpdateAdminCourtStationMutation,
} from "@/slices/courtClustersAdminApiSlice";
import { useAdminListMatchesByTournamentQuery } from "@/slices/tournamentsApiSlice";

const sid = (value: any) =>
  String(value?._id || value?.id || value || "").trim();

const buildQuery = (obj: Record<string, string | number | null | undefined>) =>
  Object.entries(obj)
    .filter(
      ([, value]) =>
        value !== undefined && value !== null && String(value).trim() !== "",
    )
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
    )
    .join("&");

const looksLikeRTMP = (url: string) =>
  /^rtmps?:\/\//i.test(String(url || "").trim());

const getMatchId = (match: any) => {
  const candidates = [
    match?._id,
    match?.id,
    match?.matchId,
    match?.match?._id,
    match?.match?.id,
  ];
  for (const candidate of candidates) {
    const value = String(candidate || "").trim();
    if (value) return value;
  }
  return "";
};

const pickPreferredStudioMatchId = (matches: any[] = []) => {
  const liveMatch = matches.find(
    (match) =>
      String(match?.status || "")
        .trim()
        .toLowerCase() === "live",
  );
  if (liveMatch) return getMatchId(liveMatch);

  const activeMatch = matches.find((match) => {
    const status = String(match?.status || "")
      .trim()
      .toLowerCase();
    return status && !["finished", "cancelled", "canceled"].includes(status);
  });
  if (activeMatch) return getMatchId(activeMatch);

  return getMatchId(matches[0]);
};

const buildNativeLiveStudioUrl = ({
  courtId,
  matchId,
  pageId,
}: {
  courtId: string;
  matchId?: string;
  pageId?: string;
}) => {
  const qs = buildQuery({ courtId, matchId, pageId });
  return qs ? `pickletour-live://stream?${qs}` : "pickletour-live://stream";
};

const buildIosLiveAuthHref = (nativeUrl: string) => {
  const authQuery = [
    `client_id=${encodeURIComponent("pickletour-live-app")}`,
    `redirect_uri=${encodeURIComponent("pickletour-live://auth")}`,
    `scope=${encodeURIComponent("live_app_access")}`,
  ].join("&");

  const continueUrl = `https://pickletour.vn/api/api/oauth/authorize?response_type=code&${authQuery}`;
  return `/live-auth?continueUrl=${encodeURIComponent(
    continueUrl,
  )}&targetUrl=${encodeURIComponent(nativeUrl)}&callbackUri=${encodeURIComponent(
    "pickletour-live://auth-init",
  )}`;
};

const normalizeAllowedClusters = (clusters: any[] = []) =>
  (Array.isArray(clusters) ? clusters : [])
    .map((item) => ({
      _id: sid(item),
      name: String(item?.name || "").trim(),
      venueName: String(item?.venueName || "").trim(),
    }))
    .filter((item) => item._id);

const normalizeLiveConfig = (config: any = {}) => ({
  enabled: !!config?.enabled,
  videoUrl: String(config?.videoUrl || "").trim(),
  advancedSettingEnabled:
    typeof config?.advancedSettingEnabled === "boolean"
      ? config.advancedSettingEnabled
      : !!config?.advancedRandomEnabled,
  pageMode:
    String(
      config?.pageMode || config?.randomPageMode || "default",
    ).toLowerCase() === "custom"
      ? "custom"
      : "default",
  pageConnectionId:
    config?.pageConnectionId || config?.randomPageConnectionId || null,
  pageConnectionName:
    config?.pageConnectionName || config?.randomPageConnectionName || "",
});

const countByStatus = (matches: any[] = []) => {
  let total = matches.length;
  let live = 0;
  let notFinished = 0;
  matches.forEach((match) => {
    const status = String(match?.status || "")
      .trim()
      .toLowerCase();
    if (status === "live") live += 1;
    if (status && !["finished", "cancelled", "canceled"].includes(status)) {
      notFinished += 1;
    }
  });
  return { total, live, notFinished };
};

const fallbackCountsForStation = (item: any) => {
  const queueLength = Array.isArray(item?.queueItems)
    ? item.queueItems.length
    : 0;
  const currentCount = item?.currentMatch ? 1 : 0;
  const total = currentCount + queueLength;
  const live = String(item?.status || "").toLowerCase() === "live" ? 1 : 0;
  return { total, live, notFinished: total };
};

const toLegacyCourtItem = (court: any) => ({
  ...court,
  _id: sid(court),
  entityType: "court",
  displayLabel:
    court?.name ||
    court?.label ||
    court?.code ||
    (Number.isFinite(court?.number)
      ? `Sân ${court.number}`
      : `Sân #${sid(court).slice(-4)}`),
  liveConfig: normalizeLiveConfig(court?.liveConfig),
});

const toStationItem = (station: any) => ({
  ...station,
  _id: sid(station),
  entityType: "station",
  displayLabel:
    String(station?.name || "").trim() ||
    String(station?.code || "").trim() ||
    `Sân #${sid(station).slice(-4)}`,
  liveConfig: normalizeLiveConfig(station?.liveConfig),
});

function useSheetTokens() {
  const navTheme = useTheme?.();
  const scheme = useColorScheme?.() ?? "light";
  const isDark =
    typeof navTheme?.dark === "boolean" ? navTheme.dark : scheme === "dark";
  const primary = navTheme?.colors?.primary ?? (isDark ? "#7cb8ff" : "#0a84ff");

  return {
    isDark,
    primary,
    textPrimary: navTheme?.colors?.text ?? (isDark ? "#f8fafc" : "#0f172a"),
    textSecondary: isDark ? "#9aa7ba" : "#64748b",
    textMuted: isDark ? "#8090a7" : "#475569",
    sheetBg: navTheme?.colors?.card ?? (isDark ? "#171a20" : "#ffffff"),
    panelBg: isDark ? "#1b2028" : "#ffffff",
    panelAltBg: isDark ? "#141a22" : "#f8fafc",
    border: navTheme?.colors?.border ?? (isDark ? "#2b3544" : "#e2e8f0"),
    borderSoft: isDark ? "#344154" : "#cbd5e1",
    primarySoftBg: isDark ? "#17263a" : "#eaf2ff",
    primarySoftFg: isDark ? "#93c5fd" : "#1d4ed8",
    successBg: isDark ? "#16261c" : "#dcfce7",
    successFg: isDark ? "#92dfaf" : "#166534",
    mutedBg: isDark ? "#222b36" : "#f1f5f9",
    mutedFg: isDark ? "#adbacb" : "#475569",
    warnBg: isDark ? "#2a2119" : "#fff7ed",
    warnFg: isDark ? "#f4c28d" : "#c2410c",
    errorBg: isDark ? "#2d1d1f" : "#fef2f2",
    errorFg: isDark ? "#f2a2aa" : "#b91c1c",
    hintBg: isDark ? "#121821" : "#f8fafc",
    hintBorder: isDark ? "#273241" : "#e2e8f0",
    hintIcon: isDark ? "#8ca2bc" : "#64748b",
    outlineBtnBg: isDark ? "#121822" : "transparent",
    outlineBtnTint: isDark ? "#93c5fd" : primary,
    primaryBtnBg: isDark ? "#5b8fcb" : primary,
    disabledBg: isDark ? "#3a4658" : "#94a3b8",
    handle: isDark ? "#4a5568" : "#cbd5e1",
    switchThumbOff: isDark ? "#e2e8f0" : "#f4f3f4",
  };
}

function StatChip({
  label,
  tone = "default",
}: {
  label: string;
  tone?: "default" | "success" | "muted" | "warn";
}) {
  const T = useSheetTokens();
  const tones = {
    default: { bg: T.primarySoftBg, fg: T.primarySoftFg, border: T.borderSoft },
    success: { bg: T.successBg, fg: T.successFg, border: T.borderSoft },
    muted: { bg: T.mutedBg, fg: T.mutedFg, border: T.borderSoft },
    warn: { bg: T.warnBg, fg: T.warnFg, border: T.borderSoft },
  };
  const picked = tones[tone] || tones.default;
  return (
    <View
      style={[
        styles.statChip,
        {
          backgroundColor: picked.bg,
          borderColor: picked.border,
        },
      ]}
    >
      <Text style={{ color: picked.fg, fontSize: 11, fontWeight: "700" }}>
        {label}
      </Text>
    </View>
  );
}

function BtnPrimary({
  onPress,
  children,
  disabled,
  tint,
}: {
  onPress?: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  tint?: string;
}) {
  const T = useSheetTokens();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btnBase,
        styles.btnPrimary,
        {
          backgroundColor: disabled ? T.disabledBg : tint || T.primaryBtnBg,
        },
        pressed && !disabled && styles.btnPressed,
      ]}
    >
      <Text style={styles.btnPrimaryLabel}>{children}</Text>
    </Pressable>
  );
}

function BtnOutline({
  onPress,
  children,
  tint,
  disabled,
}: {
  onPress?: () => void;
  children: React.ReactNode;
  tint?: string;
  disabled?: boolean;
}) {
  const T = useSheetTokens();
  const color = disabled ? T.disabledBg : tint || T.outlineBtnTint;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btnBase,
        styles.btnOutline,
        {
          borderColor: color,
          backgroundColor: T.outlineBtnBg,
          opacity: disabled ? 0.6 : pressed ? 0.88 : 1,
        },
      ]}
    >
      <Text style={[styles.btnOutlineLabel, { color }]}>{children}</Text>
    </Pressable>
  );
}

export default function LiveSetupSheet({
  open,
  onClose,
  tournamentId,
  tournamentName,
  buildCourtLiveUrl,
  allowedClusters = [],
}: {
  open: boolean;
  onClose: () => void;
  tournamentId: string;
  tournamentName?: string;
  buildCourtLiveUrl?: (tid: string, bid: string | null, item: any) => string;
  allowedClusters?: any[];
}) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const T = useSheetTokens();
  const insets = useSafeAreaInsets();
  const snapPoints = useMemo(() => ["90%"], []);

  const clusterOptions = useMemo(
    () => normalizeAllowedClusters(allowedClusters),
    [allowedClusters],
  );
  const hasClusterMode = clusterOptions.length > 0;

  const [selectedClusterId, setSelectedClusterId] = useState("");

  useEffect(() => {
    if (!open) return;
    setSelectedClusterId((current) => {
      if (!hasClusterMode) return "";
      if (current && clusterOptions.some((item) => item._id === current))
        return current;
      return clusterOptions[0]?._id || "";
    });
  }, [open, hasClusterMode, clusterOptions]);

  const {
    data: courtsResp,
    isLoading: courtsLoading,
    isError: courtsErr,
    refetch: refetchCourts,
  } = useAdminListCourtsByTournamentQuery(
    { tid: tournamentId },
    { skip: !open || hasClusterMode },
  );

  const {
    data: runtime,
    isLoading: runtimeLoading,
    isFetching: runtimeFetching,
    error: runtimeError,
    refetch: refetchRuntime,
  } = useGetTournamentCourtClusterRuntimeQuery(
    { tournamentId, clusterId: selectedClusterId },
    { skip: !open || !hasClusterMode || !selectedClusterId },
  );

  const {
    data: matchPage,
    isLoading: matchesLoading,
    refetch: refetchMatches,
  } = useAdminListMatchesByTournamentQuery(
    { tid: tournamentId, page: 1, pageSize: 1000 },
    { skip: !open },
  );

  const [setCourtCfg] = useAdminSetCourtLiveConfigMutation();
  const [updateStation] = useUpdateAdminCourtStationMutation();

  const [form, setForm] = useState<
    Record<string, ReturnType<typeof normalizeLiveConfig>>
  >({});
  const [busy, setBusy] = useState(new Set<string>());

  useEffect(() => {
    if (open) sheetRef.current?.present();
    else sheetRef.current?.dismiss();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    refetchMatches?.();
    if (hasClusterMode) {
      if (selectedClusterId) refetchRuntime?.();
      return;
    }
    refetchCourts?.();
  }, [
    open,
    hasClusterMode,
    selectedClusterId,
    refetchMatches,
    refetchRuntime,
    refetchCourts,
  ]);

  const items = useMemo(() => {
    if (hasClusterMode) {
      return (Array.isArray(runtime?.stations) ? runtime.stations : []).map(
        toStationItem,
      );
    }
    const legacy = Array.isArray(courtsResp)
      ? courtsResp
      : Array.isArray(courtsResp?.items)
        ? courtsResp.items
        : [];
    return legacy.map(toLegacyCourtItem);
  }, [hasClusterMode, runtime, courtsResp]);

  const matchesAll = useMemo(
    () => (Array.isArray(matchPage?.list) ? matchPage.list : []),
    [matchPage],
  );

  const matchesByItemId = useMemo(() => {
    const map = new Map<string, any[]>();
    items.forEach((item) => map.set(item._id, []));

    matchesAll.forEach((match) => {
      const key = hasClusterMode
        ? sid(match?.courtStationId || match?.courtStation?._id)
        : sid(match?.courtAssigned || match?.assignedCourt || match?.court);
      if (key && map.has(key)) {
        map.get(key)?.push(match);
      }
    });

    return map;
  }, [items, matchesAll, hasClusterMode]);

  useEffect(() => {
    if (!open) return;
    const next: Record<string, ReturnType<typeof normalizeLiveConfig>> = {};
    items.forEach((item) => {
      next[item._id] = normalizeLiveConfig(item?.liveConfig);
    });
    setForm(next);
  }, [open, items]);

  const setItemBusy = useCallback((itemId: string, value: boolean) => {
    setBusy((current) => {
      const next = new Set(current);
      if (value) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  }, []);

  const saveEnabled = useCallback(
    async (item: any, nextEnabled: boolean) => {
      const itemId = String(item._id);
      const previous = form[itemId] || normalizeLiveConfig(item?.liveConfig);
      const next = { ...previous, enabled: nextEnabled };
      setForm((current) => ({ ...current, [itemId]: next }));
      setItemBusy(itemId, true);

      try {
        if (item.entityType === "station") {
          await updateStation({
            clusterId: selectedClusterId,
            stationId: itemId,
            liveConfig: next,
          }).unwrap();
          await refetchRuntime?.();
        } else {
          await setCourtCfg({
            courtId: itemId,
            enabled: next.enabled,
            videoUrl: next.videoUrl,
            advancedSettingEnabled: next.advancedSettingEnabled,
            pageMode: next.pageMode || "default",
            pageConnectionId:
              next.pageMode === "custom" ? next.pageConnectionId || null : null,
          }).unwrap();
          await refetchCourts?.();
        }
      } catch (error: any) {
        setForm((current) => ({ ...current, [itemId]: previous }));
        RNAlert.alert(
          "Không lưu được",
          error?.data?.message || "Cập nhật LIVE cho sân thất bại.",
        );
      } finally {
        setItemBusy(itemId, false);
      }
    },
    [
      form,
      setItemBusy,
      updateStation,
      selectedClusterId,
      refetchRuntime,
      setCourtCfg,
      refetchCourts,
    ],
  );

  const openLiveStudio = useCallback(
    async (item: any) => {
      const itemId = String(item?._id || "");
      const current = form[itemId] || normalizeLiveConfig(item?.liveConfig);
      const itemMatches = matchesByItemId.get(itemId) || [];
      const preferredMatchId =
        pickPreferredStudioMatchId(itemMatches) ||
        getMatchId(item?.currentMatch);
      const pageId =
        current.pageMode === "custom"
          ? String(current.pageConnectionId || "").trim()
          : "";

      const params: Record<string, string> = {
        tid: tournamentId,
        courtId: itemId,
        autoOnLive: "1",
        autoCreateIfMissing: "1",
        tournamentHref: `/tournament/${tournamentId}/manage`,
        homeHref: "/",
      };

      const guessUrl = String(current.videoUrl || "").trim();
      if (looksLikeRTMP(guessUrl)) {
        params.useFullUrl = "1";
        params.fullUrl = guessUrl;
      }

      const nativeUrl = buildNativeLiveStudioUrl({
        courtId: itemId,
        matchId: preferredMatchId,
        pageId,
      });
      const qs = buildQuery(params);
      const fallbackHref =
        Platform.OS === "android"
          ? `/live/studio_court_android?${qs}`
          : buildIosLiveAuthHref(nativeUrl);

      try {
        const finalUrl =
          Platform.OS === "ios"
            ? fallbackHref
            : buildCourtLiveUrl
              ? buildCourtLiveUrl(tournamentId, null, item) || fallbackHref
              : fallbackHref;

        if (Platform.OS === "ios") {
          try {
            await Linking.openURL(nativeUrl);
            sheetRef.current?.dismiss();
            return;
          } catch {}
        }

        if (Platform.OS === "android") {
          try {
            let supported: boolean | null = null;
            try {
              supported = await Linking.canOpenURL(nativeUrl);
            } catch {}

            if (supported !== false) {
              await Linking.openURL(nativeUrl);
              sheetRef.current?.dismiss();
              return;
            }
          } catch {}
        }

        router.push(finalUrl as any);
        sheetRef.current?.dismiss();
      } catch {
        RNAlert.alert("Không mở được", "Không tìm thấy đường dẫn mở app live.");
      }
    },
    [buildCourtLiveUrl, form, matchesByItemId, tournamentId],
  );

  const summary = useMemo(() => {
    let enabledCount = 0;
    let liveMatchCount = 0;

    items.forEach((item) => {
      const current = form[item._id] || normalizeLiveConfig(item?.liveConfig);
      const mappedMatches = matchesByItemId.get(item._id) || [];
      const counts = mappedMatches.length
        ? countByStatus(mappedMatches)
        : fallbackCountsForStation(item);
      if (current.enabled) enabledCount += 1;
      liveMatchCount += counts.live;
    });

    return {
      totalCourts: items.length,
      enabledCount,
      liveMatchCount,
    };
  }, [items, form, matchesByItemId]);

  const loadingAny =
    matchesLoading ||
    (hasClusterMode ? runtimeLoading || runtimeFetching : courtsLoading);

  const refreshAll = useCallback(() => {
    refetchMatches?.();
    if (hasClusterMode) refetchRuntime?.();
    else refetchCourts?.();
  }, [hasClusterMode, refetchMatches, refetchRuntime, refetchCourts]);

  const renderItem = ({ item }: { item: any }) => {
    const current = form[item._id] || normalizeLiveConfig(item?.liveConfig);
    const mappedMatches = matchesByItemId.get(item._id) || [];
    const counts = mappedMatches.length
      ? countByStatus(mappedMatches)
      : fallbackCountsForStation(item);
    const isBusy = busy.has(item._id);

    return (
      <View
        style={[
          styles.courtCard,
          {
            borderColor: T.border,
            backgroundColor: T.panelBg,
          },
        ]}
      >
        <View style={styles.courtHeader}>
          <View style={{ flex: 1 }}>
            <View style={styles.courtTitleRow}>
              <MaterialIcons name="videocam" size={18} color={T.textPrimary} />
              <Text style={[styles.courtTitle, { color: T.textPrimary }]}>
                {item.displayLabel}
              </Text>
            </View>
            <Text style={[styles.courtSubtitle, { color: T.textSecondary }]}>
              {counts.notFinished} trận đang vận hành • {counts.live} trận live
            </Text>
          </View>
          <View style={styles.courtChipWrap}>
            <StatChip
              label={current.enabled ? "LIVE bật" : "LIVE tắt"}
              tone={current.enabled ? "success" : "muted"}
            />
            {counts.total ? (
              <StatChip label={`${counts.total} trận`} tone="default" />
            ) : null}
          </View>
        </View>

        <View style={[styles.toggleRow, { borderTopColor: T.border }]}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={[styles.toggleTitle, { color: T.textPrimary }]}>
              Bật LIVE cho sân này
            </Text>
            <Text style={[styles.toggleHint, { color: T.textSecondary }]}>
              Gạt công tắc là lưu ngay. Sau đó bấm mở app live để vận hành.
            </Text>
          </View>
          {isBusy ? (
            <ActivityIndicator size="small" color={T.primaryBtnBg} />
          ) : (
            <Switch
              value={!!current.enabled}
              onValueChange={(value) => saveEnabled(item, value)}
              trackColor={{ false: T.borderSoft, true: T.primaryBtnBg }}
              thumbColor={
                Platform.OS === "android"
                  ? current.enabled
                    ? T.primarySoftFg
                    : T.switchThumbOff
                  : undefined
              }
            />
          )}
        </View>

        <View
          style={[
            styles.quickHint,
            {
              backgroundColor: T.hintBg,
              borderColor: T.hintBorder,
            },
          ]}
        >
          <MaterialIcons name="info-outline" size={16} color={T.hintIcon} />
          <Text style={[styles.quickHintText, { color: T.textMuted }]}>
            {hasClusterMode
              ? "Sân này đang lấy từ cụm sân hiện tại. Live app sẽ mở trực tiếp theo mã sân trong cụm."
              : "Giải này vẫn đang dùng sân legacy. Công tắc chỉ lưu bật/tắt LIVE cho sân."}
          </Text>
        </View>

        <View style={styles.actionRow}>
          <BtnPrimary
            onPress={() => openLiveStudio(item)}
            disabled={isBusy}
            tint={T.primaryBtnBg}
          >
            Mở app live
          </BtnPrimary>
        </View>
      </View>
    );
  };

  const listHeader = (
    <View
      style={[
        styles.headerCard,
        {
          borderColor: T.border,
          backgroundColor: T.panelBg,
        },
      ]}
    >
      <Text style={[styles.headerTitle, { color: T.textPrimary }]}>
        Thiết lập LIVE
        {tournamentName ? ` • ${tournamentName}` : ""}
      </Text>
      <Text style={[styles.headerSubtitle, { color: T.textSecondary }]}>
        Trên mobile chỉ giữ 2 thao tác chính: bật hoặc tắt LIVE cho từng sân,
        rồi mở app live để vận hành ngay.
      </Text>

      <View style={styles.summaryRow}>
        <StatChip label={`${summary.totalCourts} sân`} tone="default" />
        <StatChip label={`${summary.enabledCount} sân bật`} tone="success" />
        <StatChip label={`${summary.liveMatchCount} trận live`} tone="warn" />
      </View>

      {hasClusterMode && (
        <View
          style={[
            styles.clusterCard,
            {
              backgroundColor: T.panelAltBg,
              borderColor: T.border,
            },
          ]}
        >
          <Text style={[styles.clusterTitle, { color: T.textPrimary }]}>
            Cụm sân đang dùng
          </Text>
          <View style={styles.clusterList}>
            {clusterOptions.map((cluster) => {
              const active = cluster._id === selectedClusterId;
              return (
                <Pressable
                  key={cluster._id}
                  onPress={() => setSelectedClusterId(cluster._id)}
                  style={[
                    styles.clusterChip,
                    {
                      backgroundColor: active ? T.primarySoftBg : T.mutedBg,
                      borderColor: T.borderSoft,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.clusterChipLabel,
                      {
                        color: active ? T.primarySoftFg : T.textSecondary,
                      },
                    ]}
                  >
                    {[cluster.name, cluster.venueName]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      <View style={styles.headerActions}>
        <BtnOutline onPress={refreshAll} tint={T.outlineBtnTint}>
          Tải lại
        </BtnOutline>
        <BtnOutline
          onPress={() => sheetRef.current?.dismiss()}
          tint={T.outlineBtnTint}
        >
          Đóng
        </BtnOutline>
      </View>
    </View>
  );

  const listEmpty =
    hasClusterMode && runtimeError ? (
      <View
        style={[
          styles.alertBox,
          { backgroundColor: T.errorBg, borderColor: T.border },
        ]}
      >
        <Text style={[styles.alertError, { color: T.errorFg }]}>
          {runtimeError?.data?.message || "Không tải được runtime cụm sân."}
        </Text>
      </View>
    ) : courtsErr ? (
      <View
        style={[
          styles.alertBox,
          { backgroundColor: T.errorBg, borderColor: T.border },
        ]}
      >
        <Text style={styles.alertError}>Không tải được danh sách sân.</Text>
      </View>
    ) : loadingAny ? (
      <View style={[styles.center, { paddingVertical: 28 }]}>
        <ActivityIndicator size="large" color={T.primaryBtnBg} />
      </View>
    ) : (
      <View
        style={[
          styles.alertBox,
          { backgroundColor: T.warnBg, borderColor: T.border },
        ]}
      >
        <Text style={[styles.alertWarn, { color: T.warnFg }]}>
          {hasClusterMode
            ? "Cụm sân này chưa có sân nào."
            : "Giải này chưa có sân nào."}
        </Text>
      </View>
    );

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={snapPoints}
      onDismiss={onClose}
      backdropComponent={(props) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={0.5}
          style={{ zIndex: 1000 }}
        />
      )}
      handleIndicatorStyle={{ backgroundColor: T.handle }}
      backgroundStyle={{
        backgroundColor: T.sheetBg,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
      }}
      containerStyle={{ zIndex: 1000, elevation: 1000 }}
    >
      <BottomSheetFlatList
        data={items}
        keyExtractor={(item) => item._id}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: insets.bottom + 28,
          gap: 12,
        }}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      />
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  statChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  headerCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "800",
  },
  headerSubtitle: {
    marginTop: 6,
    color: "#64748b",
    lineHeight: 20,
  },
  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },
  clusterCard: {
    marginTop: 14,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  clusterTitle: {
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 10,
  },
  clusterList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  clusterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  clusterChipLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
  headerActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  courtCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
  },
  courtHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  courtTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  courtTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  courtSubtitle: {
    marginTop: 6,
    color: "#64748b",
  },
  courtChipWrap: {
    gap: 6,
    alignItems: "flex-end",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e2e8f0",
  },
  toggleTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  toggleHint: {
    marginTop: 4,
    color: "#64748b",
    lineHeight: 18,
  },
  quickHint: {
    marginTop: 12,
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
  },
  quickHintText: {
    flex: 1,
    color: "#475569",
    lineHeight: 18,
  },
  actionRow: {
    marginTop: 14,
  },
  btnBase: {
    borderRadius: 12,
    paddingHorizontal: 16,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimary: {},
  btnPressed: {
    opacity: 0.88,
  },
  btnPrimaryLabel: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
  },
  btnOutline: {
    borderWidth: 1.5,
    backgroundColor: "transparent",
  },
  btnOutlineLabel: {
    fontSize: 15,
    fontWeight: "700",
  },
  alertBox: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  alertError: {
    color: "#b91c1c",
    fontWeight: "700",
  },
  alertWarn: {
    color: "#9a3412",
    fontWeight: "700",
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
});
