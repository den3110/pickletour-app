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

/* RTK hooks */
import {
  useAdminListCourtsByTournamentQuery,
  useAdminSetCourtLiveConfigMutation,
  useAdminBulkSetCourtLiveConfigMutation,
} from "@/slices/courtsApiSlice";
import { useAdminListMatchesByTournamentQuery } from "@/slices/tournamentsApiSlice";

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

/* ---------- ToggleButton ---------- */
function ToggleButton({ value, onChange, colors }) {
  const active = !!value;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ pressed: active }}
      onPress={() => onChange?.(!active)}
      android_ripple={{ color: "#00000010", borderless: false }}
      style={({ pressed }) => [
        styles.toggleBtn,
        {
          borderColor: active ? colors.primary : colors.border,
          backgroundColor: active ? colors.primary : "transparent",
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <MaterialIcons
        name={active ? "toggle-on" : "toggle-off"}
        size={18}
        color={active ? "#fff" : colors.text}
        style={{ marginRight: 6 }}
      />
      <Text style={styles.toggleLabel}>{active ? "Đang bật" : "Đang tắt"}</Text>
    </Pressable>
  );
}

/* ================== SHEET (TOÀN GIẢI) ================== */
export default function LiveSetupSheet({
  open,
  onClose,
  tournamentId,
  bracketId, // không dùng trong mode toàn giải, giữ để tương thích
  bracketName: bracketNameProp, // không dùng
  tournamentName,
  buildCourtLiveUrl, // optional: (tid, bid, court) => string
}) {
  const sheetRef = useRef(null);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const isSmallScreen = screenWidth < 380;

  const snapPoints = useMemo(() => ["92%"], []);

  useEffect(() => {
    if (open) sheetRef.current?.present();
    else sheetRef.current?.dismiss();
  }, [open]);

  /* 1) Courts — TOÀN GIẢI */
  const {
    data: courtsResp,
    isLoading: courtsLoading,
    isError: courtsErr,
    refetch: refetchCourts,
  } = useAdminListCourtsByTournamentQuery(
    { tid: tournamentId },
    { skip: !open }
  );

  const courts = useMemo(() => {
    const items = Array.isArray(courtsResp)
      ? courtsResp
      : Array.isArray(courtsResp?.items)
      ? courtsResp.items
      : [];
    return items.map((c) => ({
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
        enabled: !!c?.liveConfig?.enabled,
        videoUrl: (c?.liveConfig?.videoUrl || "").trim(),
        overrideExisting: !!c?.liveConfig?.overrideExisting,
      },
    }));
  }, [courtsResp]);

  /* 2) Matches — TOÀN GIẢI */
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

  /* 🔁 MỖI LẦN MỞ: refetch courts + matches */
  useEffect(() => {
    if (open && tournamentId) {
      refetchCourts?.();
      refetchMatches?.();
    }
  }, [open, tournamentId, refetchCourts, refetchMatches]);

  /* 3) Form state */
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
      };
    }
    setForm(next);
    setOverrideExisting(false);
    initialFormRef.current = next;
  }, [open, courts]);

  /* 4) Mutations */
  const [setCourtCfg, { isLoading: saving }] =
    useAdminSetCourtLiveConfigMutation();
  const [bulkSetCourtCfg, { isLoading: bulkSaving }] =
    useAdminBulkSetCourtLiveConfigMutation();

  const onChangeCourtField = (courtId, patch) => {
    setForm((s) => ({ ...s, [courtId]: { ...(s[courtId] || {}), ...patch } }));
  };

  const saveCourt = async (courtId) => {
    const v = form[courtId] || { enabled: false, videoUrl: "" };
    const work = new Set(busy);
    work.add(courtId);
    setBusy(work);
    try {
      await setCourtCfg({
        courtId,
        enabled: !!v.enabled,
        videoUrl: (v.videoUrl || "").trim(),
        overrideExisting,
      }).unwrap();
      RNAlert.alert("Thành công", "Đã lưu cấu hình LIVE cho sân.");
      await refetchCourts?.();
      initialFormRef.current = {
        ...initialFormRef.current,
        [courtId]: {
          enabled: !!v.enabled,
          videoUrl: (v.videoUrl || "").trim(),
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
        const cur = form[c._id] || { enabled: false, videoUrl: "" };
        const prev = initialFormRef.current[c._id] || {
          enabled: false,
          videoUrl: "",
        };
        const changed =
          !!cur.enabled !== !!prev.enabled ||
          String((cur.videoUrl || "").trim()) !==
            String((prev.videoUrl || "").trim());
        if (!changed) return null;
        return {
          courtId: c._id,
          enabled: !!cur.enabled,
          videoUrl: (cur.videoUrl || "").trim(),
          overrideExisting: !!overrideExisting,
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
        newSnap[it.courtId] = {
          enabled: it.enabled,
          videoUrl: it.videoUrl,
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
      const href = `/live/studio_court?${qs}`;

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

  /* ---- render 1 court row ---- */
  const renderCourt = ({ item: c }) => {
    const cMatches = matchesByCourtId.get(c._id) || [];
    const cnt = countByStatus(cMatches);
    const sample = mostCommonUrl(cMatches);
    const v = form[c._id] || { enabled: false, videoUrl: "" };
    const isBusy = busy.has(c._id);

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
        {/* HEADER ROW: tên sân + stats + actions, xếp theo cột để khỏi tràn */}
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

        {/* BODY: toggle + input, xếp dọc cho gọn */}
        <View style={styles.rowBody}>
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

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={snapPoints}
      onDismiss={onClose}
      backdropComponent={(p) => (
        <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} />
      )}
      handleIndicatorStyle={{ backgroundColor: colors.border }}
      backgroundStyle={{
        backgroundColor: colors.card,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
      }}
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

  /* TOGGLE */
  toggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  toggleLabel: {
    fontWeight: "700",
    fontSize: 12,
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
});
