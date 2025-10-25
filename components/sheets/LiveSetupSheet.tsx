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
} from "react-native";
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetFlatList, // dùng FlatList của gorhom để tránh nested scroll cảnh báo
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
import {
  useAdminGetBracketsQuery,
  useAdminListMatchesByTournamentQuery,
} from "@/slices/tournamentsApiSlice";

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

/* ---------------- small buttons ---------------- */
function BtnPrimary({ onPress, children, disabled, tint }) {
  const bg = disabled ? "#94a3b8" : tint || "#0a84ff";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg },
        pressed && !disabled && { opacity: 0.9 },
      ]}
    >
      <Text style={{ color: "#fff", fontWeight: "700" }}>{children}</Text>
    </Pressable>
  );
}
function BtnOutline({ onPress, children, tint, danger }) {
  const color = danger ? "#ef4444" : tint || "#0a84ff";
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        { borderWidth: 1, borderColor: color, backgroundColor: "transparent" },
        pressed && { opacity: 0.95 },
      ]}
    >
      <Text style={{ color, fontWeight: "700" }}>{children}</Text>
    </Pressable>
  );
}

/* ---------- ToggleButton: hiển thị “Đang bật/Đang tắt” như một NÚT ---------- */
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
      <Text
        style={{
          color: active ? "#fff" : colors.text,
          fontWeight: "700",
          fontSize: 13,
        }}
      >
        {active ? "Đang bật" : "Đang tắt"}
      </Text>
    </Pressable>
  );
}

/* ================== SHEET (BottomSheetModal + BottomSheetFlatList) ================== */
export default function LiveSetupSheet({
  open,
  onClose,
  tournamentId,
  bracketId,
  bracketName: bracketNameProp,
  buildCourtLiveUrl, // optional: (tid, bid, court) => string
}) {
  const sheetRef = useRef(null);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const snapPoints = useMemo(() => ["92%"], []);

  useEffect(() => {
    if (open) sheetRef.current?.present();
    else sheetRef.current?.dismiss();
  }, [open]);

  /* 1) Bracket name */
  const { data: bracketsData, isLoading: brLoading } = useAdminGetBracketsQuery(
    tournamentId,
    { skip: !open }
  );
  const bracketName = useMemo(() => {
    if (bracketNameProp) return bracketNameProp;
    const list = Array.isArray(bracketsData)
      ? bracketsData
      : bracketsData?.items || [];
    const b = list.find((x) => String(x?._id) === String(bracketId));
    return b?.name || "";
  }, [bracketsData, bracketId, bracketNameProp]);

  /* 2) Courts */
  const {
    data: courtsResp,
    isLoading: courtsLoading,
    isError: courtsErr,
    refetch: refetchCourts,
  } = useAdminListCourtsByTournamentQuery(
    { tid: tournamentId, bracketId },
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

  /* 3) Matches (thống kê) */
  const { data: matchPage, isLoading: matchesLoading } =
    useAdminListMatchesByTournamentQuery(
      { tid: tournamentId, page: 1, pageSize: 1000 },
      { skip: !open }
    );
  const matchesOfBracket = useMemo(() => {
    const list = Array.isArray(matchPage?.list) ? matchPage.list : [];
    return list.filter(
      (m) => String(m?.bracket?._id || m?.bracket || "") === String(bracketId)
    );
  }, [matchPage, bracketId]);
  const matchesByCourtId = useMemo(() => {
    const map = new Map();
    for (const c of courts) map.set(String(c._id), []);
    for (const m of matchesOfBracket) {
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
  }, [courts, matchesOfBracket]);

  /* 4) Form state */
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

  /* 5) Mutations */
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
        newSnap[it.courtId] = { enabled: it.enabled, videoUrl: it.videoUrl };
      }
      initialFormRef.current = newSnap;
      await refetchCourts?.();
    } catch (e) {
      RNAlert.alert("Lỗi", e?.data?.message || "Lưu cấu hình (bulk) thất bại.");
    }
  };

  const openLiveStudio = useCallback(
    (court) => {
      const url = buildCourtLiveUrl
        ? buildCourtLiveUrl(tournamentId, bracketId, court)
        : `/admin/streaming/${court._id}`;
      try {
        router.push(url);
      } catch {
        RNAlert.alert("Không mở được", "Đường dẫn/route không hợp lệ.");
      }
    },
    [buildCourtLiveUrl, tournamentId, bracketId]
  );

  const loadingAny = courtsLoading || matchesLoading || brLoading;

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
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <View style={styles.rowHeader}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <MaterialIcons name="stadium" size={18} color={colors.text} />
            <Text style={{ color: colors.text, fontWeight: "700" }}>
              {c.displayLabel}
            </Text>
          </View>

          <View style={{ flexDirection: "row", gap: 8 }}>
            {/* ✅ Chỉ hiện nút Tắt khi đang bật */}
            {v.enabled && (
              <BtnOutline
                onPress={() => {
                  onChangeCourtField(c._id, { enabled: false, videoUrl: "" });
                  saveCourt(c._id);
                }}
                tint={colors.primary}
                danger
              >
                Tắt
              </BtnOutline>
            )}
            {v.enabled && (
              <BtnOutline
                onPress={() => {
                  openLiveStudio(c);
                  sheetRef.current?.dismiss();
                }}
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

        <View style={styles.rowSub}>
          <Text style={{ color: colors.text }}>
            Trận:{" "}
            <Text style={{ fontWeight: "700" }}>
              {cnt.total} / {cnt.live} / {cnt.notFinished}
            </Text>
          </Text>
        </View>

        <View style={{ gap: 8 }}>
          <View style={styles.fieldLine}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <MaterialIcons
                name={v.enabled ? "toggle-on" : "toggle-off"}
                size={22}
                color={v.enabled ? colors.primary : "#94a3b8"}
              />
              <Text style={{ color: colors.text, fontWeight: "600" }}>
                Bật LIVE mặc định cho sân này
              </Text>
            </View>

            {/* ✅ ToggleButton rõ ràng là NÚT */}
            <ToggleButton
              value={v.enabled}
              onChange={(val) => onChangeCourtField(c._id, { enabled: val })}
              colors={colors}
            />
          </View>

          <View style={{ gap: 6 }}>
            <Text style={{ color: "#64748b", fontSize: 12 }}>
              LIVE hiện tại (mẫu từ trận):{" "}
              <Text style={{ color: colors.text }}>
                {sample ? sample : "(chưa có)"}
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
                placeholder="URL LIVE mặc định (YouTube/Facebook/TikTok/M3U8…)"
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

  /* ---- header cho list ---- */
  const ListHeader = (
    <>
      {/* Header bar */}
      <View
        style={[
          styles.header,
          { borderColor: colors.border, backgroundColor: colors.card },
        ]}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: colors.text, fontWeight: "800", fontSize: 16 }}>
            Thiết lập LIVE — {bracketName || ""}
          </Text>
          <Text style={{ color: "#94a3b8", fontSize: 12 }}>
            Cấu hình LIVE theo SÂN. Khi trận bắt đầu (hoặc server áp dụng), URL
            mặc định của sân sẽ tự gán cho trận thuộc sân đó.
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
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

      {/* Global option */}
      <View
        style={[
          styles.globalBar,
          { borderColor: colors.border, backgroundColor: colors.card },
        ]}
      >
        <Pressable
          onPress={() => setOverrideExisting((s) => !s)}
          style={({ pressed }) => [
            styles.switchLine,
            pressed && { opacity: 0.9 },
          ]}
        >
          <MaterialIcons
            name={overrideExisting ? "check-box" : "check-box-outline-blank"}
            size={18}
            color={overrideExisting ? colors.primary : "#94a3b8"}
          />
          <Text style={{ color: colors.text, fontWeight: "600" }}>
            Cho phép <Text style={{ fontWeight: "800" }}>ghi đè</Text> link LIVE
            đã có trong trận
          </Text>
        </Pressable>
      </View>
    </>
  );

  /* ---- empty / error / loading ---- */
  const ListEmpty = (
    <>
      {courtsErr ? (
        <View style={styles.alertBox}>
          <Text style={{ color: "#ef4444" }}>
            Không tải được danh sách sân.
          </Text>
        </View>
      ) : loadingAny ? (
        <View style={[styles.center, { paddingVertical: 24 }]}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <View style={styles.alertBox}>
          <Text style={{ color: "#f59e0b" }}>
            Chưa có sân trong bracket này.
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
          paddingBottom: Math.max(16, insets.bottom),
        }}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        removeClippedSubviews={false}
      />
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  header: {
    borderBottomWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  globalBar: {
    borderBottomWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  switchLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  center: { alignItems: "center", justifyContent: "center" },
  rowCard: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 10 },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  rowSub: { flexDirection: "row", alignItems: "center", gap: 8 },
  fieldLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
  btn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },

  // ✅ Toggle button style
  toggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },

  alertBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#fde68a",
    backgroundColor: "#fffbeb",
  },
});
