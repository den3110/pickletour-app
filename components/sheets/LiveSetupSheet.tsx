// app/components/sheets/LiveSetupSheet.jsx
/* eslint-disable react/prop-types */
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
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
  useWindowDimensions,
  Switch,
  Modal,
  FlatList,
} from "react-native";
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetFlatList,
} from "@gorhom/bottom-sheet";
import { useTheme } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Image } from "expo-image";

/* RTK hooks */
import {
  useAdminListCourtsByTournamentQuery,
  useAdminSetCourtLiveConfigMutation,
  useAdminBulkSetCourtLiveConfigMutation,
} from "@/slices/courtsApiSlice";
import { useAdminListMatchesByTournamentQuery } from "@/slices/tournamentsApiSlice";
import { useGetFacebookPagesQuery } from "@/slices/facebookApiSlice";

/* ---------- helpers ---------- */
const isMongoId = (s) => typeof s === "string" && /^[a-f0-9]{24}$/i.test(s);
const extractCourtId = (cObj) => {
  if (!cObj) return null;
  if (typeof cObj === "string") return isMongoId(cObj) ? cObj : null;
  if (typeof cObj === "object")
    return cObj._id ? String(cObj._id) : cObj.id ? String(cObj.id) : null;
  return null;
};
const courtLabelFromMatch = (m) => {
  const c = m?.courtAssigned || m?.assignedCourt || m?.court || null;
  const directName =
    m?.courtName || m?.courtLabel || m?.courtCode || m?.courtTitle || null;
  if (directName && String(directName).trim()) return String(directName).trim();
  if (!c) return "—";
  if (typeof c === "string") {
    if (!c.trim() || isMongoId(c)) return "—";
    return c.trim();
  }
  if (c?.name) return c.name;
  if (c?.label) return c.label;
  if (c?.code) return c.code;
  if (Number.isFinite(c?.number)) return `Sân ${c.number}`;
  if (Number.isFinite(c?.no)) return `Sân ${c.no}`;
  return "—";
};
const matchBelongsToCourt = (m, court) => {
  const mid = extractCourtId(m?.courtAssigned || m?.assignedCourt || m?.court);
  if (mid && String(mid) === String(court._id)) return true;
  const mLabel = courtLabelFromMatch(m);
  const cLabel =
    court?.name ||
    court?.label ||
    court?.code ||
    (Number.isFinite(court?.number) ? `Sân ${court.number}` : "");
  return (
    String(mLabel || "")
      .trim()
      .toLowerCase() ===
    String(cLabel || "")
      .trim()
      .toLowerCase()
  );
};
const countByStatus = (matches) => {
  let total = matches.length,
    live = 0,
    notFinished = 0;
  for (const m of matches) {
    const st = String(m?.status || "").toLowerCase();
    if (st === "live") live++;
    if (st !== "finished") notFinished++;
  }
  return { total, live, notFinished };
};
const mostCommonUrl = (ms = []) => {
  const freq = new Map();
  for (const m of ms) {
    const v = (m?.video || "").trim();
    if (!v) continue;
    freq.set(v, (freq.get(v) || 0) + 1);
  }
  if (!freq.size) return "";
  return Array.from(freq.entries()).sort((a, b) => b[1] - a[1])[0][0];
};

/* --- helpers cho Open Studio --- */
const buildQuery = (obj) =>
  Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "")
    .map(
      ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`
    )
    .join("&");

const looksLikeRTMP = (u) => /^rtmps?:\/\//i.test(String(u || "").trim());

/* ---------------- small buttons ---------------- */
function BtnPrimary({ onPress, children, disabled, tint }) {
  const bg = disabled ? "#94a3b8" : tint || "#0a84ff";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btnBase,
        styles.btnPrimary,
        { backgroundColor: bg },
        pressed && !disabled && styles.btnPressed,
      ]}
    >
      <Text style={styles.btnPrimaryLabel} numberOfLines={1}>
        {children}
      </Text>
    </Pressable>
  );
}
function BtnOutline({ onPress, children, tint, danger }) {
  const color = danger ? "#ef4444" : tint || "#0a84ff";
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.btnBase,
        styles.btnOutline,
        {
          borderColor: color,
        },
        pressed && styles.btnPressed,
      ]}
    >
      <Text style={[styles.btnOutlineLabel, { color }]} numberOfLines={1}>
        {children}
      </Text>
    </Pressable>
  );
}

/* ---------- ToggleButton: dùng Switch mặc định ---------- */
function ToggleButton({ value, onChange, colors }) {
  const v = !!value;
  return (
    <Switch
      value={v}
      onValueChange={onChange}
      trackColor={{ false: colors.border, true: colors.primary }}
      thumbColor={
        Platform.OS === "android" ? (v ? colors.primary : "#f4f3f4") : undefined
      }
    />
  );
}

/* ---------- build advancedSetting payload ---------- */
const buildAdvancedSettingPayload = (cfg) => {
  const enabled = !!cfg?.advancedSettingEnabled;
  const mode = cfg?.pageMode || "default"; // "default" (system page) | "custom" (user page)
  if (!enabled) return null;

  const out = { mode };
  if (mode === "custom" && cfg?.pageConnectionId) {
    out.pageConnectionId = cfg.pageConnectionId;
  }
  return out;
};

/* ================== SHEET (TOÀN GIẢI) ================== */
export default function LiveSetupSheet({
  open,
  onClose,
  tournamentId,
  bracketId, // giữ để tương thích
  bracketName: bracketNameProp, // giữ để tương thích
  tournamentName,
  buildCourtLiveUrl,
}) {
  const sheetRef = useRef(null);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isSmallScreen = screenWidth < 380;

  const snapPoints = useMemo(() => ["92%"], []);
  const pageModalMaxHeight = useMemo(
    () => Math.max(200, screenHeight - insets.top - 32),
    [screenHeight, insets.top]
  );

  const [pagePickerCourtId, setPagePickerCourtId] = useState(null);
  const [pageModalVisible, setPageModalVisible] = useState(false);

  useEffect(() => {
    if (open) sheetRef.current?.present();
    else sheetRef.current?.dismiss();
  }, [open]);

  /* Courts */
  const {
    data: courtsResp,
    isLoading: courtsLoading,
    isError: courtsErr,
    refetch: refetchCourts,
  } = useAdminListCourtsByTournamentQuery(
    { tid: tournamentId },
    { skip: !open }
  );

  /* Facebook Pages của user */
  const {
    data: fbPagesResp,
    isLoading: fbPagesLoading,
    isError: fbPagesErr,
  } = useGetFacebookPagesQuery(undefined, { skip: !open });

  const fbPages = useMemo(() => {
    if (!fbPagesResp) return [];
    if (Array.isArray(fbPagesResp)) return fbPagesResp;
    if (Array.isArray(fbPagesResp.items)) return fbPagesResp.items;
    if (Array.isArray(fbPagesResp.pages)) return fbPagesResp.pages;
    return [];
  }, [fbPagesResp]);

  const courts = useMemo(() => {
    const items = Array.isArray(courtsResp)
      ? courtsResp
      : Array.isArray(courtsResp?.items)
      ? courtsResp.items
      : [];

    return items.map((c) => {
      const lc = c?.liveConfig || {};

      const advancedSettingEnabledFromNew = lc.advancedSettingEnabled;
      const advancedSettingEnabledFromOld = lc.advancedRandomEnabled;

      const pageModeFromNew = lc.pageMode;
      const pageModeFromOld = lc.randomPageMode;

      const pageConnectionIdFromNew = lc.pageConnectionId;
      const pageConnectionIdFromOld = lc.randomPageConnectionId;

      const pageConnectionNameFromNew = lc.pageConnectionName;
      const pageConnectionNameFromOld = lc.randomPageConnectionName;

      return {
        ...c,
        _id: String(c._id),
        displayLabel:
          c.name ||
          c.label ||
          c.code ||
          (Number.isFinite(c.number)
            ? `Sân ${c.number}`
            : `Sân #${String(c._id).slice(-4)}`),
        liveConfig: {
          enabled: !!lc.enabled,
          videoUrl: (lc.videoUrl || "").trim(),
          overrideExisting: !!lc.overrideExisting,
          advancedSettingEnabled:
            typeof advancedSettingEnabledFromNew === "boolean"
              ? advancedSettingEnabledFromNew
              : !!advancedSettingEnabledFromOld,
          pageMode: pageModeFromNew || pageModeFromOld || "default",
          pageConnectionId:
            pageConnectionIdFromNew || pageConnectionIdFromOld || null,
          pageConnectionName:
            pageConnectionNameFromNew || pageConnectionNameFromOld || "",
        },
      };
    });
  }, [courtsResp]);

  /* Matches */
  const {
    data: matchPage,
    isLoading: matchesLoading,
    refetch: refetchMatches,
  } = useAdminListMatchesByTournamentQuery(
    { tid: tournamentId, page: 1, pageSize: 1000 },
    { skip: !open }
  );

  const matchesAll = useMemo(
    () => (Array.isArray(matchPage?.list) ? matchPage.list : []),
    [matchPage]
  );

  const matchesByCourtId = useMemo(() => {
    const map = new Map();
    for (const c of courts) map.set(String(c._id), []);
    for (const m of matchesAll) {
      let assigned = false;
      const mid = extractCourtId(
        m?.courtAssigned || m?.assignedCourt || m?.court
      );
      if (mid && map.has(String(mid))) {
        map.get(String(mid)).push(m);
        assigned = true;
      }
      if (!assigned) {
        for (const c of courts) {
          if (matchBelongsToCourt(m, c)) {
            map.get(String(c._id))?.push(m);
            break;
          }
        }
      }
    }
    return map;
  }, [courts, matchesAll]);

  useEffect(() => {
    if (open && tournamentId) {
      refetchCourts?.();
      refetchMatches?.();
    }
  }, [open, tournamentId, refetchCourts, refetchMatches]);

  /* Form state */
  const [form, setForm] = useState({});
  const [overrideExisting, setOverrideExisting] = useState(false);
  const [busy, setBusy] = useState(new Set());
  const initialFormRef = useRef({});

  useEffect(() => {
    if (!open) return;
    const next = {};
    for (const c of courts) {
      next[c._id] = {
        enabled: !!c.liveConfig.enabled,
        videoUrl: c.liveConfig.videoUrl || "",
        advancedSettingEnabled: !!c.liveConfig.advancedSettingEnabled,
        pageMode: c.liveConfig.pageMode || "default",
        pageConnectionId: c.liveConfig.pageConnectionId || null,
        pageConnectionName: c.liveConfig.pageConnectionName || "",
      };
    }
    setForm(next);
    setOverrideExisting(false);
    initialFormRef.current = next;
  }, [open, courts]);

  const [setCourtCfg, { isLoading: saving }] =
    useAdminSetCourtLiveConfigMutation();
  const [bulkSetCourtCfg, { isLoading: bulkSaving }] =
    useAdminBulkSetCourtLiveConfigMutation();

  const onChangeCourtField = (courtId, patch) => {
    setForm((s) => ({ ...s, [courtId]: { ...(s[courtId] || {}), ...patch } }));
  };

  const saveCourt = async (courtId) => {
    const v = form[courtId] || {
      enabled: false,
      videoUrl: "",
      advancedSettingEnabled: false,
      pageMode: "default",
      pageConnectionId: null,
      pageConnectionName: "",
    };
    const work = new Set(busy);
    work.add(courtId);
    setBusy(work);

    const advancedSetting = buildAdvancedSettingPayload(v);

    try {
      await setCourtCfg({
        courtId,
        enabled: !!v.enabled,
        videoUrl: (v.videoUrl || "").trim(),
        overrideExisting,
        advancedSettingEnabled: !!v.advancedSettingEnabled,
        pageMode: v.pageMode || "default",
        pageConnectionId: v.pageMode === "custom" ? v.pageConnectionId : null,
        advancedSetting,
      }).unwrap();
      RNAlert.alert("Thành công", "Đã lưu cấu hình LIVE cho sân.");
      await refetchCourts?.();
      initialFormRef.current = {
        ...initialFormRef.current,
        [courtId]: {
          enabled: !!v.enabled,
          videoUrl: (v.videoUrl || "").trim(),
          advancedSettingEnabled: !!v.advancedSettingEnabled,
          pageMode: v.pageMode || "default",
          pageConnectionId:
            v.pageMode === "custom" ? v.pageConnectionId || null : null,
          pageConnectionName:
            v.pageMode === "custom" ? v.pageConnectionName || "" : "",
        },
      };
    } catch (e) {
      RNAlert.alert("Lỗi", e?.data?.message || "Lưu cấu hình LIVE thất bại.");
    } finally {
      const done = new Set(busy);
      done.delete(courtId);
      setBusy(done);
    }
  };

  const saveAll = async () => {
    const items = courts
      .map((c) => {
        const cur = form[c._id] || {
          enabled: false,
          videoUrl: "",
          advancedSettingEnabled: false,
          pageMode: "default",
          pageConnectionId: null,
          pageConnectionName: "",
        };
        const prev = initialFormRef.current[c._id] || {
          enabled: false,
          videoUrl: "",
          advancedSettingEnabled: false,
          pageMode: "default",
          pageConnectionId: null,
          pageConnectionName: "",
        };

        const changed =
          !!cur.enabled !== !!prev.enabled ||
          String((cur.videoUrl || "").trim()) !==
            String((prev.videoUrl || "").trim()) ||
          !!cur.advancedSettingEnabled !== !!prev.advancedSettingEnabled ||
          String(cur.pageMode || "default") !==
            String(prev.pageMode || "default") ||
          String(cur.pageConnectionId || "") !==
            String(prev.pageConnectionId || "");
        if (!changed) return null;

        const advancedSetting = buildAdvancedSettingPayload(cur);

        return {
          courtId: c._id,
          enabled: !!cur.enabled,
          videoUrl: (cur.videoUrl || "").trim(),
          overrideExisting: !!overrideExisting,
          advancedSettingEnabled: !!cur.advancedSettingEnabled,
          pageMode: cur.pageMode || "default",
          pageConnectionId:
            cur.pageMode === "custom" ? cur.pageConnectionId || null : null,
          advancedSetting,
        };
      })
      .filter(Boolean);

    if (items.length === 0) {
      RNAlert.alert("Thông báo", "Không có thay đổi nào để lưu.");
      return;
    }

    try {
      await bulkSetCourtCfg({ tid: tournamentId, items }).unwrap();
      RNAlert.alert(
        "Thành công",
        `Đã lưu cấu hình LIVE cho ${items.length} sân.`
      );
      const newSnap = { ...initialFormRef.current };
      for (const it of items) {
        const prev = initialFormRef.current[it.courtId] || {};
        newSnap[it.courtId] = {
          ...prev,
          enabled: it.enabled,
          videoUrl: it.videoUrl,
          advancedSettingEnabled: !!it.advancedSettingEnabled,
          pageMode: it.pageMode || "default",
          pageConnectionId:
            it.pageMode === "custom" ? it.pageConnectionId || null : null,
        };
      }
      initialFormRef.current = newSnap;
      await refetchCourts?.();
    } catch (e) {
      RNAlert.alert("Lỗi", e?.data?.message || "Lưu cấu hình (bulk) thất bại.");
    }
  };

  const openLiveStudio = useCallback(
    (court) => {
      const cId = String(court?._id || "");
      const v = form[cId] || { enabled: false, videoUrl: "" };

      const baseParams = {
        tid: tournamentId,
        courtId: cId,
        autoOnLive: "1",
        autoCreateIfMissing: "1",
        tournamentHref: `/tournament/${tournamentId}/manage`,
        homeHref: "/",
      };

      const guessUrl = String(v.videoUrl || "").trim();
      if (looksLikeRTMP(guessUrl)) {
        baseParams.useFullUrl = "1";
        baseParams.fullUrl = guessUrl;
      }

      const qs = buildQuery(baseParams);
      const href =
        Platform.OS === "android"
          ? `/live/studio_court_android?${qs}`
          : `/live/studio_court_ios?${qs}`;

      try {
        const finalUrl = buildCourtLiveUrl
          ? buildCourtLiveUrl(tournamentId, null, court) || href
          : href;
        router.push(finalUrl);
        sheetRef.current?.dismiss();
      } catch {
        RNAlert.alert("Không mở được", "Đường dẫn/route không hợp lệ.");
      }
    },
    [form, tournamentId, buildCourtLiveUrl]
  );

  const loadingAny = courtsLoading || matchesLoading;

  /* map để biết Page nào đã được sân nào dùng (mode = custom) */
  const usedPageMap = useMemo(() => {
    const map = new Map(); // pid -> [courtId...]
    for (const c of courts) {
      const v = form[c._id];
      if (v && v.pageMode === "custom" && v.pageConnectionId) {
        const pid = String(v.pageConnectionId);
        const arr = map.get(pid) || [];
        arr.push(String(c._id));
        map.set(pid, arr);
      }
    }
    return map;
  }, [courts, form]);

  const courtLabelById = useMemo(() => {
    const map = new Map();
    for (const c of courts) {
      map.set(String(c._id), c.displayLabel);
    }
    return map;
  }, [courts]);

  /* Page picker helpers (Modal) */
  const openPagePicker = useCallback((courtId) => {
    setPagePickerCourtId(courtId);
    setPageModalVisible(true);
  }, []);

  const closePagePicker = useCallback(() => {
    setPageModalVisible(false);
    setPagePickerCourtId(null);
  }, []);

  const handlePickPage = useCallback(
    (page) => {
      if (!pagePickerCourtId) return;
      const pid = String(page._id || page.id || page.pageId);
      const pname = page.pageName || page.name || pid;
      onChangeCourtField(pagePickerCourtId, {
        pageConnectionId: pid,
        pageConnectionName: pname,
      });
      closePagePicker();
    },
    [pagePickerCourtId, closePagePicker]
  );

  const goToFacebookPageSettings = useCallback(() => {
    router.push("/setttings/facebook-page");
    sheetRef.current?.dismiss();
  }, []);

  /* ---- render 1 court row ---- */
  const renderCourt = ({ item: c }) => {
    const cMatches = matchesByCourtId.get(c._id) || [];
    const cnt = countByStatus(cMatches);
    const sample = mostCommonUrl(cMatches);
    const v = form[c._id] || {
      enabled: false,
      videoUrl: "",
      advancedSettingEnabled: false,
      pageMode: "default",
      pageConnectionId: null,
      pageConnectionName: "",
    };
    const isBusy = busy.has(c._id);

    const advancedOn = !!v.advancedSettingEnabled;
    const pageMode = v.pageMode || "default";
    const currentPageName =
      v.pageConnectionName ||
      (() => {
        if (!v.pageConnectionId) return "";
        const found = fbPages.find(
          (p) =>
            String(p._id || p.id || p.pageId) === String(v.pageConnectionId)
        );
        return found?.pageName || found?.name || "";
      })() ||
      "";

    return (
      <View
        style={[
          styles.rowCard,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ]}
      >
        {/* HEADER */}
        <View style={styles.rowHeader}>
          <View style={styles.rowTitleWrap}>
            <View style={styles.rowTitleLeft}>
              <MaterialIcons name="stadium" size={18} color={colors.text} />
              <Text
                style={[styles.rowTitleText, { color: colors.text }]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {c.displayLabel}
              </Text>
            </View>
            <Text
              style={[
                styles.rowStatsText,
                { color: isSmallScreen ? "#9ca3af" : "#64748b" },
              ]}
              numberOfLines={2}
            >
              {cnt.total} trận • {cnt.live} live • {cnt.notFinished} chưa xong
            </Text>
          </View>

          <View style={styles.rowActionsRow}>
            {v.enabled && (
              <BtnOutline
                onPress={() => {
                  onChangeCourtField(c._id, {
                    enabled: false,
                    videoUrl: "",
                  });
                  saveCourt(c._id);
                }}
                tint={colors.primary}
                danger
              >
                Tắt LIVE
              </BtnOutline>
            )}
            {v.enabled && (
              <BtnOutline
                onPress={() => openLiveStudio(c)}
                tint={colors.primary}
              >
                Mở studio
              </BtnOutline>
            )}
            <BtnPrimary
              onPress={() => saveCourt(c._id)}
              disabled={isBusy || saving || bulkSaving}
              tint={colors.primary}
            >
              Lưu sân
            </BtnPrimary>
          </View>
        </View>

        {/* BODY */}
        <View style={styles.rowBody}>
          {/* LIVE mặc định cho sân */}
          <View style={styles.fieldLine}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text
                style={{
                  color: colors.text,
                  fontWeight: "600",
                  fontSize: 13,
                }}
                numberOfLines={2}
              >
                LIVE mặc định cho sân này
              </Text>
              <Text
                style={{
                  color: "#94a3b8",
                  fontSize: 11,
                  marginTop: 2,
                }}
                numberOfLines={2}
              >
                Khi trận bắt đầu, link LIVE của sân sẽ tự áp vào trận.
              </Text>
            </View>
            <ToggleButton
              value={v.enabled}
              onChange={(val) => onChangeCourtField(c._id, { enabled: val })}
              colors={colors}
            />
          </View>

          <View style={{ gap: 6 }}>
            <Text style={{ color: "#64748b", fontSize: 11 }} numberOfLines={2}>
              LIVE hiện tại (mẫu từ trận gần đây):{" "}
              <Text style={{ color: colors.text }}>
                {sample || "(chưa có)"}
              </Text>
            </Text>

            <View
              style={[
                styles.inputWrap,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.background,
                },
              ]}
            >
              <MaterialIcons name="link" size={18} color="#94a3b8" />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="URL LIVE mặc định (YouTube, Facebook, TikTok, M3U8…)"
                placeholderTextColor="#94a3b8"
                autoCapitalize="none"
                autoCorrect={false}
                value={v.videoUrl}
                onChangeText={(tx) =>
                  onChangeCourtField(c._id, { videoUrl: tx })
                }
              />
            </View>
          </View>

          {/* CẤU HÌNH NÂNG CAO (đặt dưới cùng) */}
          <View style={[styles.fieldLine, { marginTop: 10 }]}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text
                style={{
                  color: colors.text,
                  fontWeight: "600",
                  fontSize: 13,
                }}
                numberOfLines={2}
              >
                Cấu hình nâng cao
              </Text>
              <Text
                style={{
                  color: "#94a3b8",
                  fontSize: 11,
                  marginTop: 2,
                }}
                numberOfLines={2}
              >
                Chọn nguồn Facebook Page để LIVE (Page hệ thống hoặc Page của
                bạn).
              </Text>
            </View>

            <View style={styles.advancedSwitchRow}>
              <Switch
                value={advancedOn}
                onValueChange={(val) =>
                  onChangeCourtField(c._id, {
                    advancedSettingEnabled: val,
                  })
                }
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={
                  Platform.OS === "android"
                    ? advancedOn
                      ? colors.primary
                      : "#f4f3f4"
                    : undefined
                }
              />
            </View>
          </View>

          {advancedOn && (
            <View
              style={[
                styles.advancedBox,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.background,
                },
              ]}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "700",
                  color: colors.text,
                  marginBottom: 4,
                }}
              >
                Chọn kiểu Live Page
              </Text>

              {/* Option 1: Live theo Page hệ thống */}
              <Pressable
                onPress={() =>
                  onChangeCourtField(c._id, {
                    advancedSettingEnabled: true,
                    pageMode: "default",
                    // chuyển sang page hệ thống thì clear page user
                    pageConnectionId: null,
                    pageConnectionName: "",
                  })
                }
                style={({ pressed }) => [
                  styles.radioRow,
                  pressed && { opacity: 0.9 },
                ]}
              >
                <MaterialIcons
                  name={
                    pageMode === "default"
                      ? "radio-button-checked"
                      : "radio-button-unchecked"
                  }
                  size={18}
                  color={pageMode === "default" ? colors.primary : "#9ca3af"}
                />
                <View style={{ marginLeft: 8, flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: colors.text,
                    }}
                  >
                    LIVE theo Page hệ thống
                  </Text>
                  <Text
                    style={{
                      fontSize: 11,
                      color: "#9ca3af",
                      marginTop: 2,
                    }}
                  >
                    Dùng Page hệ thống để LIVE video cho các trận của sân này.
                  </Text>
                </View>
              </Pressable>

              {/* Option 2: Live theo Page tự chọn */}
              <Pressable
                onPress={() =>
                  onChangeCourtField(c._id, {
                    advancedSettingEnabled: true,
                    pageMode: "custom",
                  })
                }
                style={({ pressed }) => [
                  styles.radioRow,
                  { marginTop: 6 },
                  pressed && { opacity: 0.9 },
                ]}
              >
                <MaterialIcons
                  name={
                    pageMode === "custom"
                      ? "radio-button-checked"
                      : "radio-button-unchecked"
                  }
                  size={18}
                  color={pageMode === "custom" ? colors.primary : "#9ca3af"}
                />
                <View style={{ marginLeft: 8, flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: colors.text,
                    }}
                  >
                    LIVE theo Page tự chọn
                  </Text>
                  <Text
                    style={{
                      fontSize: 11,
                      color: "#9ca3af",
                      marginTop: 2,
                    }}
                    numberOfLines={2}
                  >
                    Lấy Page trong hệ thống Page của người dùng để LIVE cho sân
                    này.
                  </Text>
                </View>
              </Pressable>

              {pageMode === "custom" && (
                <View style={{ marginTop: 8, marginLeft: 26, gap: 6 }}>
                  {fbPagesLoading ? (
                    <View style={styles.center}>
                      <ActivityIndicator size="small" color={colors.primary} />
                    </View>
                  ) : fbPagesErr ? (
                    <Text style={{ fontSize: 11, color: "#f97316" }}>
                      Không tải được danh sách Page. Vào Cài đặt để kiểm tra lại
                      kết nối.
                    </Text>
                  ) : fbPages.length === 0 ? (
                    <>
                      <Text style={{ fontSize: 11, color: "#f97316" }}>
                        Chưa có Facebook Page nào được kết nối.
                      </Text>
                      <BtnOutline
                        onPress={goToFacebookPageSettings}
                        tint={colors.primary}
                      >
                        Mở cài đặt Page
                      </BtnOutline>
                    </>
                  ) : (
                    <>
                      <Text
                        style={{
                          fontSize: 11,
                          color: colors.text,
                        }}
                        numberOfLines={2}
                      >
                        {currentPageName
                          ? `Đang dùng Page: ${currentPageName}`
                          : "Chưa chọn Page cụ thể."}
                      </Text>
                      <BtnOutline
                        onPress={() => openPagePicker(c._id)}
                        tint={colors.primary}
                      >
                        Chọn Page
                      </BtnOutline>
                    </>
                  )}
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    );
  };

  /* ---- header ---- */
  const ListHeader = (
    <>
      <View
        style={[
          styles.headerContainer,
          {
            borderColor: colors.border,
            backgroundColor: colors.card,
          },
        ]}
      >
        <View style={styles.headerTextWrap}>
          <Text
            style={[
              styles.headerTitle,
              { color: colors.text, fontSize: isSmallScreen ? 15 : 16 },
            ]}
            numberOfLines={2}
          >
            Thiết lập LIVE — Toàn giải
            {tournamentName ? ` • ${tournamentName}` : ""}
          </Text>
          <Text style={styles.headerSubtitle} numberOfLines={3}>
            Cấu hình LIVE theo SÂN cho TOÀN GIẢI. Khi trận bắt đầu, URL mặc định
            của sân sẽ tự gán cho trận ở sân đó.
          </Text>
        </View>

        <View style={styles.headerActionsRow}>
          <BtnOutline
            onPress={() => sheetRef.current?.dismiss()}
            tint={colors.primary}
          >
            Đóng
          </BtnOutline>
          <BtnPrimary
            onPress={saveAll}
            disabled={bulkSaving || saving || (courts?.length || 0) === 0}
            tint={colors.primary}
          >
            Lưu tất cả
          </BtnPrimary>
        </View>
      </View>

      <View
        style={[
          styles.globalBar,
          {
            borderColor: colors.border,
            backgroundColor: colors.card,
          },
        ]}
      >
        <Pressable
          onPress={() => setOverrideExisting((s) => !s)}
          style={({ pressed }) => [
            styles.globalBarPressable,
            pressed && { opacity: 0.9 },
          ]}
        >
          <MaterialIcons
            name={overrideExisting ? "check-box" : "check-box-outline-blank"}
            size={18}
            color={overrideExisting ? colors.primary : "#94a3b8"}
          />
          <Text style={[styles.globalBarText, { color: colors.text }]}>
            Cho phép <Text style={styles.globalBarTextStrong}>ghi đè</Text> link
            LIVE đã có trong trận
          </Text>
        </Pressable>
      </View>
    </>
  );

  const ListEmpty = (
    <>
      {courtsErr ? (
        <View style={styles.alertBox}>
          <Text style={{ color: "#ef4444", fontSize: 13 }}>
            Không tải được danh sách sân.
          </Text>
        </View>
      ) : loadingAny ? (
        <View style={[styles.center, { paddingVertical: 24 }]}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <View style={styles.alertBox}>
          <Text style={{ color: "#f59e0b", fontSize: 13 }}>
            Chưa có sân trong giải này.
          </Text>
        </View>
      )}
    </>
  );

  const currentPickerForm =
    pagePickerCourtId && form[pagePickerCourtId]
      ? form[pagePickerCourtId]
      : null;

  return (
    <>
      {/* SHEET CHÍNH */}
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={snapPoints}
        onDismiss={onClose}
        backdropComponent={(p) => (
          <BottomSheetBackdrop
            {...p}
            appearsOnIndex={0}
            disappearsOnIndex={-1}
            style={{zIndex: 1000}}
          />
        )}
        handleIndicatorStyle={{ backgroundColor: colors.border }}
        backgroundStyle={{
          backgroundColor: colors.card,
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
        }}
        containerStyle={{zIndex: 1000}}
      >
        <BottomSheetFlatList
          data={courts}
          keyExtractor={(c) => c._id}
          renderItem={renderCourt}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={ListEmpty}
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingBottom: Math.max(16, insets.bottom + 4),
          }}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          removeClippedSubviews={false}
        />
      </BottomSheetModal>

      {/* MODAL CHỌN PAGE (thay cho BottomSheet) */}
      <Modal
        visible={pageModalVisible && !!pagePickerCourtId}
        animationType="slide"
        transparent
        onRequestClose={closePagePicker}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: colors.card,
                maxHeight: pageModalMaxHeight,
                paddingBottom: Math.max(12, insets.bottom),
              },
            ]}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 4,
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "700",
                  color: colors.text,
                }}
              >
                Chọn Facebook Page
              </Text>
              <Pressable
                onPress={closePagePicker}
                style={({ pressed }) => [
                  {
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 999,
                  },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={{ fontSize: 12, color: "#9ca3af" }}>Đóng</Text>
              </Pressable>
            </View>

            {fbPagesLoading ? (
              <View style={[styles.center, { paddingVertical: 20 }]}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : fbPagesErr ? (
              <View style={styles.alertBox}>
                <Text style={{ color: "#ef4444", fontSize: 12 }}>
                  Không tải được danh sách Page. Thử lại hoặc vào Cài đặt Page.
                </Text>
              </View>
            ) : fbPages.length === 0 ? (
              <View style={styles.alertBox}>
                <Text
                  style={{ color: "#f97316", fontSize: 12, marginBottom: 8 }}
                >
                  Chưa có Facebook Page nào được kết nối.
                </Text>
                <BtnOutline
                  onPress={goToFacebookPageSettings}
                  tint={colors.primary}
                >
                  Mở cài đặt Page
                </BtnOutline>
              </View>
            ) : (
              <FlatList
                data={fbPages}
                keyExtractor={(p) => String(p._id || p.id || p.pageId)}
                ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item: p }) => {
                  const pic =
                    p.pagePicture ||
                    p.picture?.data?.url ||
                    p.raw?.picture?.data?.url;
                  const pid = String(p._id || p.id || p.pageId);

                  const isActive =
                    !!currentPickerForm?.pageConnectionId &&
                    String(currentPickerForm.pageConnectionId) === pid;

                  const usedCourtIds = usedPageMap.get(pid) || [];
                  const isUsedByOtherCourt =
                    !isActive &&
                    usedCourtIds.some(
                      (id) => String(id) !== String(pagePickerCourtId)
                    );
                  const firstOtherId = usedCourtIds.find(
                    (id) => String(id) !== String(pagePickerCourtId)
                  );
                  const usedCourtLabel = firstOtherId
                    ? courtLabelById.get(String(firstOtherId)) || ""
                    : "";

                  return (
                    <Pressable
                      disabled={isUsedByOtherCourt}
                      onPress={() => handlePickPage(p)}
                      style={({ pressed }) => [
                        styles.pageRow,
                        {
                          borderColor: isActive
                            ? colors.primary
                            : colors.border,
                          backgroundColor: isActive
                            ? colors.background
                            : colors.card,
                          opacity: pressed && !isUsedByOtherCourt ? 0.9 : 1,
                        },
                        isUsedByOtherCourt && { opacity: 0.55 },
                      ]}
                    >
                      <View style={styles.pageAvatarWrap}>
                        {pic ? (
                          <Image
                            source={{ uri: pic }}
                            style={styles.pageAvatar}
                            contentFit="cover"
                          />
                        ) : (
                          <MaterialIcons
                            name="facebook"
                            size={18}
                            color="#60a5fa"
                          />
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: "600",
                            color: colors.text,
                          }}
                          numberOfLines={1}
                        >
                          {p.pageName || p.name || "(Không tên)"}
                        </Text>
                        <Text
                          style={{
                            fontSize: 11,
                            color: "#9ca3af",
                            marginTop: 1,
                          }}
                          numberOfLines={1}
                        >
                          ID: {p.pageId || pid}
                        </Text>
                        {isUsedByOtherCourt && (
                          <Text
                            style={{
                              fontSize: 10,
                              color: "#f97316",
                              marginTop: 2,
                            }}
                            numberOfLines={1}
                          >
                            Đã dùng cho {usedCourtLabel || "một sân khác"}
                          </Text>
                        )}
                      </View>
                      {isActive && (
                        <MaterialIcons
                          name="check-circle"
                          size={18}
                          color={colors.primary}
                        />
                      )}
                    </Pressable>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  /* HEADER */
  headerContainer: {
    borderBottomWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  headerTextWrap: {
    gap: 4,
  },
  headerTitle: {
    fontWeight: "800",
  },
  headerSubtitle: {
    fontSize: 12,
    color: "#94a3b8",
  },
  headerActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 10,
  },

  /* GLOBAL BAR */
  globalBar: {
    borderBottomWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  globalBarPressable: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  globalBarText: {
    fontSize: 13,
    flexShrink: 1,
  },
  globalBarTextStrong: {
    fontWeight: "800",
  },

  /* ROW / CARD */
  rowCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  rowHeader: {
    gap: 8,
  },
  rowTitleWrap: {
    gap: 4,
  },
  rowTitleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowTitleText: {
    fontWeight: "700",
    fontSize: 14,
    flexShrink: 1,
  },
  rowStatsText: {
    fontSize: 12,
  },
  rowActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 8,
  },
  rowBody: {
    gap: 10,
  },

  /* FIELD LINE */
  fieldLine: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },

  /* INPUT */
  inputWrap: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: Platform.select({ ios: 9, android: 7 }),
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
  },

  /* BUTTONS */
  btnBase: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    minHeight: 32,
    justifyContent: "center",
    alignItems: "center",
    maxWidth: 140,
  },
  btnPrimary: {
    borderWidth: 0,
  },
  btnOutline: {
    borderWidth: 1,
    backgroundColor: "transparent",
  },
  btnPrimaryLabel: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },
  btnOutlineLabel: {
    fontWeight: "700",
    fontSize: 13,
  },
  btnPressed: {
    opacity: 0.9,
  },

  /* SWITCH / ADVANCED */
  advancedSwitchRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  advancedBox: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 4,
    gap: 4,
  },
  radioRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },

  /* PAGE ROW */
  pageRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },

  /* MISC */
  center: { alignItems: "center", justifyContent: "center" },
  alertBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#fde68a",
    backgroundColor: "#fffbeb",
  },

  /* PAGE AVATAR */
  pageAvatarWrap: {
    width: 32,
    height: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#64748b",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    overflow: "hidden",
  },
  pageAvatar: {
    width: 32,
    height: 32,
    borderRadius: 999,
  },

  /* MODAL */
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15,23,42,0.6)",
  },
  modalContent: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
});
