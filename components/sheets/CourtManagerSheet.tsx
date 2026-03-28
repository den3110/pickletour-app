// components/CourtManagerSheet.jsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { skipToken } from "@reduxjs/toolkit/query";
import { MaterialIcons } from "@expo/vector-icons";
import DragList from "react-native-draglist";
import { useTheme } from "@react-navigation/native";
import { useSocket } from "@/context/SocketContext";
import { useSocketRoomSet } from "@/hooks/useSocketRoomSet";
import ResponsiveMatchViewer from "@/components/match/ResponsiveMatchViewer";
import {
  getPairDisplayName,
  normalizeMatchDisplay,
} from "@/utils/matchDisplay";
import {
  useAssignNextHttpMutation,
  useAssignSpecificHttpMutation,
  useSetCourtMatchListMutation,
  useClearCourtMatchListMutation,
  useAdvanceCourtMatchListMutation,
  useListMatchesQuery,
  useDeleteCourtMutation, // NEW: xoá 1 sân
} from "@/slices/adminCourtApiSlice";
import {
  useAssignTournamentMatchToCourtStationMutation,
  useFreeTournamentCourtStationMutation,
  useGetTournamentCourtClusterOptionsQuery,
  useGetTournamentCourtClusterRuntimeQuery,
  useUpdateTournamentCourtStationAssignmentConfigMutation,
} from "@/slices/courtClustersAdminApiSlice";

/* ================= helpers / formatters ================= */
const norm = (s) => String(s || "").toLowerCase();
const GROUP_LIKE_SET = new Set(["group", "round_robin", "gsl", "swiss"]);
const KO_SET = new Set([
  "ko",
  "knockout",
  "double_elim",
  "roundelim",
  "elimination",
]);

const isPO = (m) => norm(m?.type || m?.format) === "po" || m?.meta?.po === true;
const isKO = (m) => {
  const t = norm(m?.type || m?.format);
  return (
    t === "ko" ||
    t === "knockout" ||
    t === "elimination" ||
    m?.meta?.knockout === true
  );
};
const isGroupLike = (m) => {
  if (!m) return false;
  // ưu tiên theo bộ web
  const bt = norm(m?.bracketType);
  const t1 = norm(m?.type);
  const t2 = norm(m?.format);
  if (GROUP_LIKE_SET.has(bt)) return true;
  if (KO_SET.has(bt)) return false;
  if (GROUP_LIKE_SET.has(t1) || GROUP_LIKE_SET.has(t2)) return true;
  if (KO_SET.has(t1) || KO_SET.has(t2)) return false;
  // fallback RN cũ
  if (isPO(m) || isKO(m)) return false;
  return !!m?.pool;
};

const isNum = (x) => typeof x === "number" && Number.isFinite(x);
const getApiErrorMessage = (error, fallback) =>
  error?.data?.message || error?.error || fallback;

const viMatchStatus = (s) => {
  switch (s) {
    case "scheduled":
      return "Đã lên lịch";
    case "queued":
      return "Trong hàng đợi";
    case "assigned":
      return "Đã gán trận";
    case "live":
      return "Đang thi đấu";
    case "finished":
      return "Đã kết thúc";
    default:
      return s || "";
  }
};
const viCourtStatus = (st) => {
  if (st === "idle") return "Trống";
  if (st === "maintenance") return "Bảo trì";
  if (st === "live") return "Đang thi đấu";
  if (st === "assigned") return "Đã gán trận";
  return st || "";
};

const letterToIndex = (s) => {
  const ch = String(s || "")
    .trim()
    .toUpperCase();
  if (/^[A-Z]$/.test(ch)) return ch.charCodeAt(0) - 64;
  return null;
};
const poolBoardLabel = (m) => {
  const p = m?.pool || {};
  if (isNum(p.index)) return `B${p.index}`;
  const raw = String(p.code || p.name || "").trim();
  if (!raw) return "B?";
  const byLetter = letterToIndex(raw);
  if (byLetter) return `B${byLetter}`;
  const m1 = raw.match(/^B(\d+)$/i);
  if (m1) return `B${m1[1]}`;
  if (/^\d+$/.test(raw)) return `B${raw}`;
  return raw;
};

const isGlobalCodeString = (s) =>
  typeof s === "string" && /^V\d+(?:-B\d+)?-T\d+$/.test(s);

// chuyển labelKey dạng "V1 B3 T5" => "V1-B3-T5"
const codeFromLabelKeyish = (lk) => {
  const s = String(lk || "").trim();
  if (!s) return null;
  const nums = s.match(/\d+/g);
  if (!nums || nums.length < 2) return null;
  const v = Number(nums[0]);
  if (/#?B\d+/i.test(s)) {
    const b = nums.length >= 3 ? Number(nums[1]) : 1;
    const t = Number(nums[nums.length - 1]);
    return `V${v}-B${b}-T${t}`;
  }
  const t = Number(nums[nums.length - 1]);
  return `V${v}-T${t}`;
};

const poolIndexNumber = (m) => {
  const lbl = poolBoardLabel(m);
  const hit = /^B(\d+)$/i.exec(lbl);
  if (hit) return Number(hit[1]);
  const byLetter = letterToIndex(m?.pool?.name || m?.pool?.code || "");
  return byLetter || 1;
};

const fallbackGlobalCode = (m, idx) => {
  const baseOrder =
    typeof m?.order === "number" && Number.isFinite(m.order)
      ? m.order
      : Number.isFinite(idx)
      ? idx
      : 0;
  const T = baseOrder + 1;

  if (isGroupLike(m)) {
    const B = poolIndexNumber(m);
    return `V1-B${B}-T${T}`;
  }
  const r = Number.isFinite(Number(m?.round)) ? Number(m.round) : 1;
  return `V${r}-T${T}`;
};

const buildMatchCode = (m, idx) => {
  if (!m) return "";
  // ưu tiên hiển thị theo web
  if (isGlobalCodeString(m?.codeDisplay)) return m.codeDisplay;
  if (isGlobalCodeString(m?.globalCode)) return m.globalCode;
  if (isGlobalCodeString(m?.code)) return m.code;
  const byLabel =
    codeFromLabelKeyish(m?.labelKeyDisplay) || codeFromLabelKeyish(m?.labelKey);
  if (isGlobalCodeString(byLabel)) return byLabel;
  return fallbackGlobalCode(m, idx);
};

const normalizedMatch = (match) =>
  match && typeof match === "object"
    ? normalizeMatchDisplay(match, match?.tournament || match)
    : match;

const pairName = (pair, source) =>
  getPairDisplayName(pair, source || pair) || String(pair?.name || "").trim();

const teamLine = (match) => {
  const next = normalizedMatch(match);
  const A = pairName(next?.pairA, next) || next?.pairAName || "Đội A";
  const B = pairName(next?.pairB, next) || next?.pairBName || "Đội B";
  return `${A} vs ${B}`;
};

const tournamentTitle = (match) =>
  String(
    normalizedMatch(match)?.tournament?.name ||
      match?.tournamentName ||
      match?.tournament?.name ||
      ""
  ).trim() || "Giải không xác định";

const formatRuntimeMatchLabel = (match) => {
  if (!match) return "";
  const next = normalizedMatch(match);
  const code = buildMatchCode(next);
  const status = viMatchStatus(next?.status);
  return [tournamentTitle(next), code, teamLine(next), status]
    .filter(Boolean)
    .join(" · ");
};

const toIdString = (value) =>
  String(
    (typeof value === "string" && value) ||
      value?._id ||
      value?.id ||
      value?.toString?.() ||
      ""
  );

const getMatchBracketId = (match) =>
  toIdString(match?.bracket?._id || match?.bracket);

const getCourtBracketId = (court, fallbackBracketId = null) =>
  toIdString(court?.bracket?._id || court?.bracket || fallbackBracketId);

const formatMatchListLabel = (match) => {
  if (!match) return "";
  const code = buildMatchCode(match);
  const A =
    (match.pairA ? pairName(match.pairA) : "") || match.pairAName || "Đội A";
  const B =
    (match.pairB ? pairName(match.pairB) : "") || match.pairBName || "Đội B";
  const status = viMatchStatus(match.status);
  return `${code} · ${A} vs ${B} · ${status}`;
};

/* ================= theme tokens ================= */
function useTokens() {
  const navTheme = useTheme?.() || {};
  const scheme = useColorScheme?.() || "light";
  const dark =
    typeof navTheme.dark === "boolean" ? navTheme.dark : scheme === "dark";

  const primary = navTheme?.colors?.primary ?? (dark ? "#7cc0ff" : "#0a84ff");
  const text = navTheme?.colors?.text ?? (dark ? "#f7f7f7" : "#111");
  const card = navTheme?.colors?.card ?? (dark ? "#16181c" : "#ffffff");
  const border = navTheme?.colors?.border ?? (dark ? "#2e2f33" : "#e4e8ef");
  const background =
    navTheme?.colors?.background ?? (dark ? "#0b0d10" : "#f6f8fc");

  return {
    dark,
    colors: { primary, text, card, border, background },
    muted: dark ? "#9aa0a6" : "#6b7280",

    chipDefaultBg: dark ? "#1f2937" : "#eef2f7",
    chipDefaultFg: dark ? "#e5e7eb" : "#263238",

    chipInfoBg: dark ? "#0f2536" : "#e0f2fe",
    chipInfoFg: dark ? "#93c5fd" : "#075985",
    chipInfoBd: dark ? "#1e3a5f" : "#bae6fd",

    chipSuccessBg: dark ? "#0f291e" : "#dcfce7",
    chipSuccessFg: dark ? "#86efac" : "#166534",

    chipWarnBg: dark ? "#2b1b0f" : "#fff7ed",
    chipWarnFg: dark ? "#fbbf24" : "#9a3412",
  };
}

/* ================= small UI (themed) ================= */
const Row = ({ children, style }) => (
  <View style={[styles.row, style]}>{children}</View>
);

function Chip({ children, tone = "default" }) {
  const t = useTokens();
  const map = {
    default: { bg: t.chipDefaultBg, fg: t.chipDefaultFg },
    info: { bg: t.chipInfoBg, fg: t.chipInfoFg },
    success: { bg: t.chipSuccessBg, fg: t.chipSuccessFg },
    warn: { bg: t.chipWarnBg, fg: t.chipWarnFg },
  };
  const c = map[tone] || map.default;
  return (
    <View style={[styles.chip, { backgroundColor: c.bg }]}>
      <Text style={{ color: c.fg, fontSize: 12, fontWeight: "700" }}>
        {children}
      </Text>
    </View>
  );
}

function IconBtn({ name, onPress, color, size = 18, style }) {
  const t = useTokens();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconBtn,
        style,
        pressed && { opacity: 0.8 },
      ]}
      hitSlop={8}
    >
      <MaterialIcons name={name} size={size} color={color || t.colors.text} />
    </Pressable>
  );
}

function Btn({ variant = "solid", onPress, children, disabled, danger }) {
  const t = useTokens();
  const isDisabled = Boolean(disabled);
  const bg =
    variant === "solid"
      ? danger
        ? "#ef4444"
        : t.colors.primary
      : "transparent";
  const base = [
    styles.btn,
    variant === "solid"
      ? { backgroundColor: bg }
      : { borderColor: danger ? "#ef4444" : t.colors.primary, borderWidth: 1 },
    isDisabled && { opacity: 0.5 },
  ];
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [base, pressed && !isDisabled && { opacity: 0.9 }]}
    >
      <Text
        style={{
          color:
            variant === "solid"
              ? "#fff"
              : danger
              ? "#ef4444"
              : t.colors.primary,
          fontWeight: "700",
        }}
      >
        {children}
      </Text>
    </Pressable>
  );
}

/* ================= AssignSpecificSheet (sheet con) ================= */
function AssignSpecificSheet({
  open,
  onClose,
  court,
  matches,
  onConfirm,
  getDisabledReason,
}) {
  const t = useTokens();
  const sheetRef = useRef(null);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const tmr = setTimeout(() => setDebouncedQ(q.trim().toLowerCase()), 250);
    return () => clearTimeout(tmr);
  }, [q]);

  useEffect(() => {
    if (open) sheetRef.current?.present();
    else sheetRef.current?.dismiss();
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQ("");
      setSelected(null);
    }
  }, [open]);

  const optionLabel = useCallback((m) => {
    if (!m) return "";
    const code = buildMatchCode(m);
    const A = (m.pairA ? pairName(m.pairA) : "") || m.pairAName || "Đội A";
    const B = (m.pairB ? pairName(m.pairB) : "") || m.pairBName || "Đội B";
    const st = viMatchStatus(m.status);
    return `${code} · ${A} vs ${B} · ${st}`;
  }, []);

  const filtered = useMemo(() => {
    const base = Array.isArray(matches) ? matches : [];
    if (!debouncedQ) return base;
    return base.filter((m) =>
      (formatRuntimeMatchLabel(m) || optionLabel(m))
        .toLowerCase()
        .includes(debouncedQ)
    );
  }, [matches, debouncedQ, optionLabel]);

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={["70%"]}
      onDismiss={onClose}
      backdropComponent={(p) => (
        <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} style={{zIndex: 1000}} />
      )}
      handleIndicatorStyle={{ backgroundColor: t.colors.border }}
      backgroundStyle={{ backgroundColor: t.colors.card }}
      containerStyle={{zIndex: 1000}}
    >
      <BottomSheetScrollView contentContainerStyle={styles.container}>
        <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
          <Row style={{ alignItems: "center", gap: 8 }}>
            <MaterialIcons name="edit-note" size={18} color={t.colors.text} />
            <Text style={[styles.title, { color: t.colors.text }]}>
              Gán trận vào sân
            </Text>
          </Row>
          <IconBtn name="close" onPress={onClose} />
        </Row>

        <View
          style={[
            styles.infoBox,
            { backgroundColor: t.chipInfoBg, borderColor: t.chipInfoBd },
          ]}
        >
          <Text style={{ color: t.chipInfoFg }}>
            Sân:{" "}
            <Text style={{ fontWeight: "700", color: t.chipInfoFg }}>
              {court?.name ||
                court?.label ||
                court?.title ||
                court?.code ||
                "(không rõ)"}
            </Text>
          </Text>
        </View>

        <View style={[styles.inputWrap, { borderColor: t.colors.border }]}>
          <MaterialIcons name="search" size={18} color={t.muted} />
          <TextInput
            style={[styles.input, { color: t.colors.text }]}
            placeholder="Nhập mã hoặc tên đội..."
            placeholderTextColor={t.muted}
            value={q}
            onChangeText={setQ}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
        </View>

        <ScrollView
          style={{ maxHeight: 360 }}
          contentContainerStyle={{ gap: 8 }}
        >
          {filtered.map((m) => {
            const label = formatRuntimeMatchLabel(m) || optionLabel(m);
            const picked =
              String(selected?._id || selected?.id || "") ===
              String(m._id || m.id);
            return (
              <Pressable
                key={m._id || m.id}
                onPress={() => setSelected(m)}
                style={({ pressed }) => [
                  styles.itemRow,
                  {
                    borderColor: picked ? t.colors.primary : t.colors.border,
                    backgroundColor: t.colors.card,
                  },
                  pressed && { opacity: 0.9 },
                ]}
              >
                <Text style={[styles.itemName, { color: t.colors.text }]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
          {filtered.length === 0 && (
            <View
              style={[
                styles.infoBox,
                {
                  marginTop: 8,
                  backgroundColor: t.chipInfoBg,
                  borderColor: t.chipInfoBd,
                },
              ]}
            >
              <Text style={{ color: t.chipInfoFg }}>
                Không có kết quả phù hợp.
              </Text>
            </View>
          )}
        </ScrollView>

        <Row style={{ justifyContent: "flex-end" }}>
          <Btn variant="outline" onPress={onClose}>
            Huỷ
          </Btn>
          <Btn
            onPress={() =>
              selected && onConfirm(String(selected._id || selected.id))
            }
            disabled={!selected}
          >
            Xác nhận gán
          </Btn>
        </Row>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

/* ================= CourtManagerSheet (sheet chính — TOÀN GIẢI) ================= */
function MatchListSheet({
  open,
  onClose,
  court,
  currentMatch,
  matches,
  draftIds,
  resolveMatchById,
  onAdd,
  onRemove,
  onReorder,
  onSave,
  onClear,
  isSaving,
  isClearing,
  getLabel,
  getDisabledReason,
  onOpenMatch,
}) {
  const t = useTokens();
  const sheetRef = useRef(null);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  useEffect(() => {
    const tmr = setTimeout(() => setDebouncedQ(q.trim().toLowerCase()), 250);
    return () => clearTimeout(tmr);
  }, [q]);

  useEffect(() => {
    if (open) sheetRef.current?.present();
    else sheetRef.current?.dismiss();
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQ("");
      setDebouncedQ("");
    }
  }, [open]);

  const selectedMatches = useMemo(
    () => draftIds.map((id) => resolveMatchById(id)).filter(Boolean),
    [draftIds, resolveMatchById]
  );

  const availableMatches = useMemo(() => {
    const pickedIds = new Set(draftIds);
    const base = Array.isArray(matches) ? matches : [];
    return base.filter((match) => {
      const matchId = toIdString(match?._id || match?.id);
      if (!matchId || pickedIds.has(matchId)) return false;
      if (!debouncedQ) return true;
      const haystack = `${getLabel(match)} ${match?.courtLabel || ""}`.toLowerCase();
      return haystack.includes(debouncedQ);
    });
  }, [matches, draftIds, debouncedQ, getLabel]);

  const courtLabel =
    court?.name || court?.label || court?.title || court?.code || "(không rõ)";

  const renderSelectedMatch = ({ item, index, onDragStart, onDragEnd, isActive }) => {
    const matchId = toIdString(item?._id || item?.id);
    return (
      <View
        style={[
          styles.selectedQueueRow,
          {
            borderColor: isActive ? t.colors.primary : t.colors.border,
            backgroundColor: isActive ? t.chipInfoBg : t.colors.card,
            opacity: isActive ? 0.92 : 1,
          },
        ]}
      >
        <Pressable
          onPress={() => onOpenMatch?.(item)}
          style={({ pressed }) => [
            styles.selectedQueueContent,
            pressed && { opacity: 0.85 },
          ]}
        >
          <Text style={[styles.itemName, { color: t.colors.text }]}>
            #{index + 1} · {getLabel(item)}
          </Text>
          <Text style={[styles.selectedQueueHint, { color: t.muted }]}>
            Chạm để xem chi tiết trận
          </Text>
        </Pressable>

        <Row style={styles.selectedQueueActions}>
          <Pressable
            onPressIn={onDragStart}
            onPressOut={onDragEnd}
            hitSlop={10}
            style={({ pressed }) => [
              styles.dragHandleBtn,
              pressed && { opacity: 0.8 },
            ]}
          >
            <MaterialIcons
              name="drag-handle"
              size={22}
              color={isActive ? t.colors.primary : t.colors.text}
            />
          </Pressable>
          <IconBtn
            name="delete-outline"
            onPress={() => onRemove(matchId)}
            color="#ef4444"
            style={styles.deleteQueueBtn}
          />
        </Row>
      </View>
    );
  };

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={["88%"]}
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
          <Row style={{ alignItems: "center", gap: 8 }}>
            <MaterialIcons name="playlist-add" size={18} color={t.colors.text} />
            <Text style={[styles.title, { color: t.colors.text }]}>
              Gán danh sách trận theo sân
            </Text>
          </Row>
          <IconBtn name="close" onPress={onClose} />
        </Row>

        <View
          style={[
            styles.infoBox,
            { backgroundColor: t.chipInfoBg, borderColor: t.chipInfoBd },
          ]}
        >
            <Text style={{ color: t.chipInfoFg }}>
              Sân: <Text style={{ fontWeight: "700", color: t.chipInfoFg }}>{courtLabel}</Text>
            </Text>
            <Text style={{ color: t.chipInfoFg, marginTop: 4 }}>
              {currentMatch
                ? `Trận hiện tại: ${getLabel(currentMatch)}`
                : "Sân đang trống"}
            </Text>
          </View>

        <View style={[styles.inputWrap, { borderColor: t.colors.border }]}>
          <MaterialIcons name="search" size={18} color={t.muted} />
          <TextInput
            style={[styles.input, { color: t.colors.text }]}
            placeholder="Tìm trận để thêm..."
            placeholderTextColor={t.muted}
            value={q}
            onChangeText={setQ}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
        </View>

        <View
          style={[
            styles.card,
            { backgroundColor: t.colors.card, borderColor: t.colors.border },
          ]}
        >
          <Text style={[styles.cardTitle, { color: t.colors.text }]}>
            List dang chon ({selectedMatches.length})
          </Text>
          <Text style={[styles.selectedQueueGuide, { color: t.muted }]}>
            Giu bieu tuong keo de doi thu tu. Cham vao row de mo chi tiet tran.
          </Text>
          {selectedMatches.length > 0 ? (
            <DragList
              data={selectedMatches}
              keyExtractor={(item, index) =>
                toIdString(item?._id || item?.id) || `draft-${index}`
              }
              renderItem={renderSelectedMatch}
              onReordered={onReorder}
              scrollEnabled={false}
              nestedScrollEnabled
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            />
          ) : (
            <View
              style={[
                styles.infoBox,
                {
                  backgroundColor: t.chipInfoBg,
                  borderColor: t.chipInfoBd,
                },
              ]}
            >
              <Text style={{ color: t.chipInfoFg }}>
                Chua co tran nao trong list.
              </Text>
            </View>
          )}
        </View>

        <View
          style={[
            styles.card,
            { backgroundColor: t.colors.card, borderColor: t.colors.border },
          ]}
        >
          <Text style={[styles.cardTitle, { color: t.colors.text }]}>
            Tran co the them
          </Text>
          <View style={{ gap: 8 }}>
            {availableMatches.map((match) => {
              const matchId = toIdString(match?._id || match?.id);
              const disabledReason = getDisabledReason(match);
              return (
                <Pressable
                  key={matchId}
                  onPress={() => onOpenMatch?.(match)}
                  style={[
                    styles.itemRow,
                    {
                      borderColor: t.colors.border,
                      backgroundColor: t.colors.card,
                      opacity: disabledReason ? 0.55 : 1,
                    },
                  ]}
                >
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={[styles.itemName, { color: t.colors.text }]}>
                      {getLabel(match)}
                    </Text>
                    {disabledReason ? (
                      <Text style={{ color: "#ef4444", fontSize: 12 }}>
                        {disabledReason}
                      </Text>
                    ) : null}
                  </View>
                  <Btn
                    variant="outline"
                    onPress={() => onAdd(matchId)}
                    disabled={Boolean(disabledReason)}
                  >
                    Thêm
                  </Btn>
                </Pressable>
              );
            })}
            {availableMatches.length === 0 && (
              <View
                style={[
                  styles.infoBox,
                  {
                    backgroundColor: t.chipInfoBg,
                    borderColor: t.chipInfoBd,
                  },
                ]}
              >
                <Text style={{ color: t.chipInfoFg }}>
                  Không còn trận phù hợp để thêm.
                </Text>
              </View>
            )}
          </View>
        </View>

        <Row style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <Btn
            variant="outline"
            danger
            onPress={onClear}
            disabled={isClearing}
          >
              {isClearing ? "Đang xóa..." : "Xóa danh sách"}
          </Btn>
          <Row style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
            <Btn variant="outline" onPress={onClose}>
              Huy
            </Btn>
            <Btn onPress={onSave} disabled={isSaving}>
              {isSaving ? "Đang lưu..." : "Lưu danh sách"}
            </Btn>
          </Row>
        </Row>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

export default function CourtManagerSheet({
  open,
  onClose,
  tournamentId,
  // giữ tương thích nhưng KHÔNG dùng nữa:
  bracketId,
  bracketName: _bracketName,
  tournamentName,
  snapPoints: snapPointsProp,
}) {
  const t = useTokens();
  const snapPoints = useMemo(() => snapPointsProp || ["85%"], [snapPointsProp]);
  const sheetRef = useRef(null);
  const clusterPickerRef = useRef(null);
  const socket = useSocket();

  // realtime state
  const [courts, setCourts] = useState([]);
  const [socketMatches, setSocketMatches] = useState([]);
  const [queue, setQueue] = useState([]);
  const notifQueueRef = useRef([]);
  const [listOpen, setListOpen] = useState(false);
  const [listCourt, setListCourt] = useState(null);
  const [listDraftIds, setListDraftIds] = useState([]);
  const [selectedClusterId, setSelectedClusterId] = useState("");
  const [viewerMatchId, setViewerMatchId] = useState("");

  const allMatchesArgs = open && tournamentId
    ? bracketId
      ? { tournamentId, bracket: bracketId, limit: 500 }
      : { tournamentId, limit: 500 }
    : skipToken;
  const {
    data: allMatches = [],
    error: allMatchesError,
    refetch: refetchAllMatches,
  } =
    useListMatchesQuery(allMatchesArgs, {
      refetchOnMountOrArgChange: true,
      refetchOnFocus: true,
      refetchOnReconnect: true,
    });

  const {
    data: clusterOptionsData,
    error: clusterOptionsError,
    refetch: refetchClusterOptions,
  } = useGetTournamentCourtClusterOptionsQuery(
    open && tournamentId ? tournamentId : skipToken,
    {
      refetchOnMountOrArgChange: true,
      refetchOnFocus: true,
      refetchOnReconnect: true,
    }
  );

  const allowedClusterOptions = useMemo(() => {
    const selectedIds = Array.isArray(clusterOptionsData?.selectedIds)
      ? clusterOptionsData.selectedIds.map((value) => toIdString(value)).filter(Boolean)
      : [];
    const items = Array.isArray(clusterOptionsData?.items)
      ? clusterOptionsData.items
      : [];
    const selectedItems = items.filter((cluster) =>
      selectedIds.includes(toIdString(cluster?._id || cluster?.id))
    );
    return selectedItems.length ? selectedItems : items;
  }, [clusterOptionsData?.items, clusterOptionsData?.selectedIds]);
  const clusterOptionsErrorMessage = getApiErrorMessage(
    clusterOptionsError,
    "Khong tai duoc cau hinh cum san."
  );
  const allMatchesErrorMessage = getApiErrorMessage(
    allMatchesError,
    "Khong tai duoc danh sach tran dau."
  );

  useEffect(() => {
    if (!open) return;
    const firstId = toIdString(
      allowedClusterOptions[0]?._id || allowedClusterOptions[0]?.id
    );
    if (!selectedClusterId || !allowedClusterOptions.some((cluster) => toIdString(cluster?._id || cluster?.id) === selectedClusterId)) {
      setSelectedClusterId(firstId || "");
    }
  }, [allowedClusterOptions, open, selectedClusterId]);

  const {
    data: clusterRuntime,
    isLoading: isLoadingClusterRuntime,
    error: clusterRuntimeError,
    refetch: refetchClusterRuntime,
  } = useGetTournamentCourtClusterRuntimeQuery(
    open && tournamentId && selectedClusterId
      ? { tournamentId, clusterId: selectedClusterId }
      : skipToken,
    {
      refetchOnMountOrArgChange: true,
      refetchOnFocus: true,
      refetchOnReconnect: true,
    }
  );

  // mutations
  const [assignNextHttp] = useAssignNextHttpMutation();
  const [assignSpecificHttp] = useAssignSpecificHttpMutation();
  const [setCourtMatchList, { isLoading: savingMatchList }] =
    useSetCourtMatchListMutation();
  const [clearCourtMatchList, { isLoading: clearingMatchList }] =
    useClearCourtMatchListMutation();
  const [advanceCourtMatchList, { isLoading: advancingMatchList }] =
    useAdvanceCourtMatchListMutation();
  const [deleteCourt, { isLoading: deletingOne }] = useDeleteCourtMutation();
  const [assignTournamentMatchToCourtStation] =
    useAssignTournamentMatchToCourtStationMutation();
  const [
    updateTournamentCourtStationAssignmentConfig,
    { isLoading: savingStationConfig },
  ] = useUpdateTournamentCourtStationAssignmentConfigMutation();
  const [freeTournamentCourtStation, { isLoading: freeingStation }] =
    useFreeTournamentCourtStationMutation();

  // open/close
  useEffect(() => {
    if (open) sheetRef.current?.present();
    else sheetRef.current?.dismiss();
  }, [open]);

  useEffect(() => {
    if (!open) clusterPickerRef.current?.dismiss?.();
  }, [open]);

  // join/leave socket room — ⭐ TOÀN GIẢI (chỉ theo tournamentId)
  useEffect(() => {
    if (!open || !socket || !tournamentId) return;

    const room = bracketId
      ? { tournamentId, bracket: bracketId }
      : { tournamentId };

    const onState = ({ courts, matches, queue }) => {
      setCourts(courts || []);
      setSocketMatches(matches || []);
      setQueue(
        (queue && Array.isArray(queue) ? queue : matches || []).map((m) => ({
          id: m._id || m.id,
          ...m,
        }))
      );
    };
    const onNotify = (msg) => {
      notifQueueRef.current = [msg, ...notifQueueRef.current].slice(0, 20);
    };
    const reqState = () => socket.emit("scheduler:requestState", room);

    socket.emit("scheduler:join", room);
    socket.on("scheduler:state", onState);
    socket.on("scheduler:notify", onNotify);
    socket.on?.("match:update", reqState);
    socket.on?.("match:finish", reqState);

    reqState();
    refetchAllMatches?.();
    const interval = setInterval(reqState, 45000);

    return () => {
      clearInterval(interval);
      socket.emit("scheduler:leave", room);
      socket.off("scheduler:state", onState);
      socket.off("scheduler:notify", onNotify);
      socket.off?.("match:update", reqState);
      socket.off?.("match:finish", reqState);
    };
  }, [open, socket, tournamentId, bracketId, refetchAllMatches]);

  useSocketRoomSet(socket, selectedClusterId ? [selectedClusterId] : [], {
    subscribeEvent: "court-cluster:watch",
    unsubscribeEvent: "court-cluster:unwatch",
    payloadKey: "clusterId",
  });

  useEffect(() => {
    if (!socket || !open || !selectedClusterId) return undefined;

    const handleClusterUpdate = (payload) => {
      const clusterId = toIdString(payload?.cluster?._id || payload?.clusterId);
      if (clusterId !== selectedClusterId) return;
      refetchClusterRuntime?.();
    };

    const handleStationUpdate = (payload) => {
      const clusterId = toIdString(
        payload?.cluster?._id ||
          payload?.clusterId ||
          payload?.station?.clusterId
      );
      if (clusterId !== selectedClusterId) return;
      refetchClusterRuntime?.();
    };

    socket.on?.("court-cluster:update", handleClusterUpdate);
    socket.on?.("court-station:update", handleStationUpdate);
    return () => {
      socket.off?.("court-cluster:update", handleClusterUpdate);
      socket.off?.("court-station:update", handleStationUpdate);
    };
  }, [open, refetchClusterRuntime, selectedClusterId, socket]);

  // helpers for court
  const matchMap = useMemo(() => {
    const map = new Map();
    for (const m of socketMatches) map.set(String(m._id || m.id), m);
    for (const m of allMatches || []) {
      const id = toIdString(m?._id || m?.id);
      if (id && !map.has(id)) map.set(id, m);
    }
    for (const court of courts || []) {
      const current = court?.currentMatchObj;
      const next = court?.nextMatch;
      if (current) map.set(toIdString(current?._id || current?.id), current);
      if (next) map.set(toIdString(next?._id || next?.id), next);
      for (const item of court?.manualAssignment?.items || []) {
        if (item?.match) {
          map.set(toIdString(item.match?._id || item.match?.id), item.match);
        }
      }
    }
    for (const station of clusterRuntime?.stations || []) {
      if (station?.currentMatch?._id) {
        map.set(
          toIdString(station.currentMatch._id),
          normalizedMatch(station.currentMatch)
        );
      }
      for (const item of station?.queueItems || []) {
        if (item?.match?._id) {
          map.set(toIdString(item.match._id), normalizedMatch(item.match));
        }
      }
      if (station?.nextQueuedMatch?._id) {
        map.set(
          toIdString(station.nextQueuedMatch._id),
          normalizedMatch(station.nextQueuedMatch)
        );
      }
    }
    for (const m of clusterRuntime?.availableMatches || []) {
      const id = toIdString(m?._id || m?.id);
      if (id) map.set(id, normalizedMatch(m));
    }
    return map;
  }, [socketMatches, allMatches, courts, clusterRuntime?.availableMatches, clusterRuntime?.stations]);

  const getMatchForCourt = (c) => {
    if (c?.currentMatchObj) return c.currentMatchObj;
    if (c?.currentMatch && typeof c.currentMatch === "object") {
      return normalizedMatch(c.currentMatch);
    }
    if (c?.currentMatch) return matchMap.get(String(c.currentMatch)) || null;
    return null;
  };
  const courtStatus = (c) => {
    const m = getMatchForCourt(c);
    if (c?.status) return c.status;
    if (!m) return "idle";
    if (m.status === "live") return "live";
    return "assigned";
  };
  const getMatchCodeForCourt = (c) => {
    const m = getMatchForCourt(c);
    if (!m) return "";
    if (isGlobalCodeString(m.codeDisplay)) return m.codeDisplay;
    return m.currentMatchCode || buildMatchCode(m);
  };
  const getTeamsForCourt = (c) => {
    const m = getMatchForCourt(c);
    if (!m) return { A: "", B: "" };
    const A = (m.pairA ? pairName(m.pairA, m) : "") || m.pairAName || "";
    const B = (m.pairB ? pairName(m.pairB, m) : "") || m.pairBName || "";
    return { A, B };
  };
  const matchListLabel = (m) =>
    formatRuntimeMatchLabel(m) || formatMatchListLabel(m);
  const courtIdToName = useMemo(() => {
    const map = new Map();
    for (const court of courts || []) {
      map.set(
        toIdString(court?._id || court?.id),
        court?.name || court?.label || court?.title || court?.code || ""
      );
    }
    return map;
  }, [courts]);

  const courtLabelOf = (match) =>
    match?.courtLabel ||
    courtIdToName.get(toIdString(match?.court || "")) ||
    match?.courtName ||
    match?.courtCode ||
    "";

  const getCourtManualPendingItems = (court) => {
    const currentId = toIdString(court?.currentMatch || "");
    return (court?.manualAssignment?.items || []).filter((item) => {
      if (item?.state !== "pending") return false;
      const matchId = toIdString(item?.match?._id || item?.matchId || "");
      return !currentId || matchId !== currentId;
    });
  };

  const getListDisableReason = (match, court) => {
    const matchId = toIdString(match?._id || match?.id);
    const currentCourtId = toIdString(court?._id || court?.id);

    if (isClusterRuntimeMode) {
      if (!matchId) return "Trận không hợp lệ";
      if (toIdString(court?.currentMatch?._id || court?.currentMatch) === matchId) {
        return "Đang là trận hiện tại của sân này";
      }
      for (const station of runtimeStations) {
        const stationId = toIdString(station?._id || station?.id);
        if (!stationId || stationId === currentCourtId) continue;
        if (toIdString(station?.currentMatch?._id || station?.currentMatch) === matchId) {
          return `Đang ở ${station?.name || "sân khác"}`;
        }
        const inQueue = Array.isArray(station?.queueItems)
          ? station.queueItems.some(
              (item) =>
                toIdString(item?.matchId || item?.match?._id) === matchId
            )
          : false;
        if (inQueue) {
          return `Đã nằm trong danh sách của ${station?.name || "sân khác"}`;
        }
      }
      return "";
    }

    const currentCourtBracketId = getCourtBracketId(court, bracketId);
    const matchBracketId = getMatchBracketId(match);

    if (!matchId) return "Trận không hợp lệ";
    if (
      currentCourtBracketId &&
      matchBracketId &&
      currentCourtBracketId !== matchBracketId
    ) {
      return "Khác bảng của sân này";
    }

    const reservedCourtId = toIdString(match?.manualAssignmentCourtId || "");
    if (reservedCourtId && reservedCourtId !== currentCourtId) {
      return `Đã nằm trong danh sách của ${
        match?.manualAssignmentCourtName || "sân khác"
      }`;
    }

    const assignedCourtId = toIdString(match?.court || "");
    const matchStatus = String(match?.status || "").toLowerCase();
    if (
      assignedCourtId &&
      assignedCourtId !== currentCourtId &&
      ["assigned", "live"].includes(matchStatus)
    ) {
      return `Đang ở ${courtLabelOf(match) || "sân khác"}`;
    }

    if (
      assignedCourtId &&
      assignedCourtId === currentCourtId &&
      ["assigned", "live"].includes(matchStatus)
    ) {
      return "Đang là trận hiện tại của sân này";
    }

    return "";
  };

  const getListPreviewItems = (court, count = 2) =>
    getCourtManualPendingItems(court)
      .map((item) => item.match || matchMap.get(toIdString(item.matchId)) || null)
      .filter(Boolean)
      .slice(0, count);

  const selectedCluster = useMemo(
    () =>
      allowedClusterOptions.find(
        (cluster) => toIdString(cluster?._id || cluster?.id) === selectedClusterId
      ) || null,
    [allowedClusterOptions, selectedClusterId]
  );

  const runtimeStations = useMemo(
    () => (Array.isArray(clusterRuntime?.stations) ? clusterRuntime.stations : []),
    [clusterRuntime?.stations]
  );

  const runtimeAvailableMatches = useMemo(
    () =>
      (Array.isArray(clusterRuntime?.availableMatches)
        ? clusterRuntime.availableMatches
        : []
      ).map((match) => normalizedMatch(match)),
    [clusterRuntime?.availableMatches]
  );

  const sharedTournamentCount = Number(clusterRuntime?.sharedTournamentCount || 0);
  const sharedTournamentNames = useMemo(
    () =>
      (Array.isArray(clusterRuntime?.sharedTournaments)
        ? clusterRuntime.sharedTournaments
        : []
      )
        .map((item) => String(item?.name || "").trim())
        .filter(Boolean),
    [clusterRuntime?.sharedTournaments]
  );

  const isClusterRuntimeMode = Boolean(selectedClusterId && allowedClusterOptions.length);

  // selectable matches (giống web)
  const selectableMatches = useMemo(() => {
    if (isClusterRuntimeMode) {
      return [...runtimeAvailableMatches].sort((a, b) =>
        formatRuntimeMatchLabel(a).localeCompare(formatRuntimeMatchLabel(b), "vi")
      );
    }
    const seen = new Set();
    const out = [];
    const push = (m) => {
      if (!m) return;
      const id = String(m._id || m.id);
      if (seen.has(id)) return;
      seen.add(id);
      out.push(m);
    };
    for (const m of queue || []) push(m);
    for (const m of socketMatches || []) {
      const st = String(m?.status || "");
      if (["scheduled", "queued", "assigned"].includes(st)) push(m);
    }
    for (const m of allMatches || []) {
      const st = String(m?.status || "");
      if (["scheduled", "queued", "assigned", "live"].includes(st)) push(m);
    }
    for (const court of courts || []) {
      if (court?.nextMatch) push(court.nextMatch);
      for (const item of court?.manualAssignment?.items || []) {
        if (item?.match) push(item.match);
      }
    }

    const STATUS_RANK = {
      queued: 0,
      scheduled: 1,
      assigned: 2,
      live: 3,
      finished: 4,
    };
    const statusRank = (s) => STATUS_RANK[String(s || "").toLowerCase()] ?? 9;

    const parseTripletFromCode = (code) => {
      const m = /^V(\d+)(?:-B(\d+))?-T(\d+)$/.exec(String(code || "").trim());
      return m
        ? { v: Number(m[1]), b: m[2] ? Number(m[2]) : null, t: Number(m[3]) }
        : null;
    };
    const tripletOf = (m) => {
      const code =
        (isGlobalCodeString(m?.codeDisplay) && m.codeDisplay) ||
        (isGlobalCodeString(m?.globalCode) && m.globalCode) ||
        (isGlobalCodeString(m?.code) && m.code) ||
        codeFromLabelKeyish(m?.labelKeyDisplay) ||
        codeFromLabelKeyish(m?.labelKey) ||
        fallbackGlobalCode(m);
      return parseTripletFromCode(code) || { v: 999, b: 999, t: 999 };
    };

    out.sort((a, b) => {
      const ta = tripletOf(a);
      const tb = tripletOf(b);
      if (ta.v !== tb.v) return ta.v - tb.v;

      const ga = isGroupLike(a);
      const gb = isGroupLike(b);

      if (ga && gb) {
        if ((ta.t || 0) !== (tb.t || 0)) return (ta.t || 0) - (tb.t || 0);
        const ba = ta.b ?? 999,
          bb = tb.b ?? 999;
        if (ba !== bb) return ba - bb;
      } else if (!ga && !gb) {
        if ((ta.t || 0) !== (tb.t || 0)) return (ta.t || 0) - (tb.t || 0);
      } else {
        return ga ? -1 : 1;
      }

      const sdiff = statusRank(a.status) - statusRank(b.status);
      if (sdiff !== 0) return sdiff;

      return (Number(a.order) || 9999) - (Number(b.order) || 9999);
    });

    return out;
  }, [
    allMatches,
    courts,
    isClusterRuntimeMode,
    queue,
    runtimeAvailableMatches,
    socketMatches,
  ]);

  const resolveMatchById = useCallback(
    (matchId) => {
      const normalized = toIdString(matchId);
      if (!normalized) return null;
      return (
        matchMap.get(normalized) ||
        selectableMatches.find(
          (match) => toIdString(match?._id || match?.id) === normalized
        ) ||
        null
      );
    },
    [matchMap, selectableMatches]
  );

  const listMatchesForCourt = useMemo(() => {
    if (!listCourt) return selectableMatches;
    if (isClusterRuntimeMode) return selectableMatches;
    const listBracketId = getCourtBracketId(listCourt, bracketId);
    return selectableMatches.filter((match) => {
      const matchBracketId = getMatchBracketId(match);
      if (!listBracketId || !matchBracketId) return true;
      return listBracketId === matchBracketId;
    });
  }, [selectableMatches, listCourt, bracketId, isClusterRuntimeMode]);

  const isRuntimeStation = useCallback(
    (item) =>
      Boolean(
        item &&
          (Object.prototype.hasOwnProperty.call(item, "queueCount") ||
            Object.prototype.hasOwnProperty.call(item, "queueItems") ||
            Object.prototype.hasOwnProperty.call(item, "assignmentMode"))
      ),
    []
  );

  /* ================ handlers ================ */
  const requestState = () => {
    if (socket && tournamentId) {
      socket.emit(
        "scheduler:requestState",
        bracketId ? { tournamentId, bracket: bracketId } : { tournamentId }
      );
    }
    refetchAllMatches?.();
    refetchClusterOptions?.();
    refetchClusterRuntime?.();
  };

  const openClusterPicker = useCallback(() => {
    if (!allowedClusterOptions.length) return;
    clusterPickerRef.current?.present?.();
  }, [allowedClusterOptions.length]);

  const handlePickCluster = useCallback((clusterId) => {
    setSelectedClusterId(clusterId);
    clusterPickerRef.current?.dismiss?.();
  }, []);

  const handleAssignNext = async (courtId) => {
    if (!tournamentId || !courtId) return;
    socket?.emit?.("scheduler:assignNext", {
      tournamentId,
      courtId,
      ...(bracketId ? { bracket: bracketId } : {}),
    });
    await assignNextHttp({
      tournamentId,
      courtId,
      ...(bracketId ? { bracket: bracketId } : {}),
    })
      .unwrap()
      .catch(() => {});
    requestState();
  };

  // NEW: per-court delete busy set
  const [busyDelete, setBusyDelete] = useState(() => new Set());

  // NEW: Xoá 1 sân
  const handleDeleteOneCourt = async (court) => {
    if (!tournamentId || !court) return;

    const courtId = court._id || court.id;
    const label =
      court?.name ||
      court?.label ||
      court?.title ||
      court?.code ||
      `#${String(courtId).slice(-4)}`;

    const m = getMatchForCourt(court);
    const isLive = String(m?.status || "").toLowerCase() === "live";
    const note = isLive
      ? "\n⚠️ Sân đang có TRẬN ĐANG THI ĐẤU. Bạn vẫn muốn xoá sân?"
      : m
      ? "\nSân đang có trận được gán. Bạn vẫn muốn xoá sân?"
      : "";

    Alert.alert(
      `Xoá sân "${label}"?`,
      `Hành động này không thể hoàn tác.${note}`,
      [
        { text: "Huỷ", style: "cancel" },
        {
          text: "Xoá",
          style: "destructive",
          onPress: async () => {
            const next = new Set(busyDelete);
            next.add(String(courtId));
            setBusyDelete(next);
            try {
              await deleteCourt({ tournamentId, courtId }).unwrap();
              Alert.alert("Thành công", `Đã xoá sân "${label}".`);
              requestState();
            } catch (e) {
              Alert.alert(
                "Lỗi",
                e?.data?.message || e?.error || "Xoá sân thất bại"
              );
            } finally {
              setBusyDelete((s) => {
                const d = new Set(s);
                d.delete(String(courtId));
                return d;
              });
            }
          },
        },
      ]
    );
  };

  // sheet con: gán trận cụ thể
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignCourt, setAssignCourt] = useState(null);
  const openAssignDlg = (court) => {
    setAssignCourt(court || null);
    setAssignOpen(true);
  };
  const closeAssignDlg = () => {
    setAssignOpen(false);
    setAssignCourt(null);
  };
  const confirmAssignSpecific = async (matchId) => {
    if (!tournamentId || !assignCourt || !matchId) return;
    try {
      if (isRuntimeStation(assignCourt)) {
        await assignTournamentMatchToCourtStation({
          tournamentId,
          stationId: assignCourt._id || assignCourt.id,
          matchId,
        }).unwrap();
        Alert.alert("Thành công", "Đã yêu cầu gán trận vào sân.");
        requestState();
        refetchAllMatches?.();
        closeAssignDlg();
        return;
      }
      await assignSpecificHttp({
      tournamentId,
      courtId: assignCourt._id || assignCourt.id,
      bracket: getCourtBracketId(assignCourt, bracketId),
      matchId,
      replace: true,
    }).unwrap();
    Alert.alert("Đã yêu cầu", "Đã yêu cầu gán trận vào sân.");
    requestState();
    refetchAllMatches?.();
    closeAssignDlg();
    } catch (e) {
      Alert.alert(
        "Lỗi",
        e?.data?.message || e?.error || "Gán trận thất bại"
      );
    }
  };

  const openListSheet = (court) => {
    if (isRuntimeStation(court)) {
      const draftIds = (Array.isArray(court?.queueItems) ? court.queueItems : [])
        .map((item) => toIdString(item?.matchId || item?.match?._id || ""))
        .filter(Boolean);
      setListCourt(court || null);
      setListDraftIds(draftIds);
      setListOpen(true);
      return;
    }
    const draftIds = getCourtManualPendingItems(court).map((item) =>
      toIdString(item?.match?._id || item?.matchId || "")
    );
    setListCourt(court || null);
    setListDraftIds(draftIds.filter(Boolean));
    setListOpen(true);
  };

  const closeListSheet = () => {
    setListOpen(false);
    setListCourt(null);
    setListDraftIds([]);
  };

  const pushMatchIntoListDraft = (matchId) => {
    if (!matchId) return;
    setListDraftIds((prev) => (prev.includes(matchId) ? prev : [...prev, matchId]));
  };

  const removeMatchFromListDraft = (matchId) => {
    setListDraftIds((prev) => prev.filter((id) => id !== matchId));
  };

  const reorderMatchDraft = (fromIndex, toIndex) => {
    setListDraftIds((prev) => {
      if (
        !Array.isArray(prev) ||
        fromIndex < 0 ||
        fromIndex >= prev.length ||
        toIndex < 0 ||
        fromIndex === toIndex
      ) {
        return prev;
      }
      const next = [...prev];
      const [picked] = next.splice(fromIndex, 1);
      if (!picked) return prev;
      next.splice(Math.min(toIndex, next.length), 0, picked);
      return next;
    });
  };

  const handleSaveCourtMatchList = async () => {
    if (!tournamentId || !listCourt) return;
    try {
      if (isRuntimeStation(listCourt)) {
        await updateTournamentCourtStationAssignmentConfig({
          tournamentId,
          stationId: listCourt._id || listCourt.id,
          assignmentMode: "queue",
          queueMatchIds: listDraftIds,
        }).unwrap();
        Alert.alert("Thành công", "Đã lưu danh sách trận chờ cho sân.");
        requestState();
        refetchAllMatches?.();
        closeListSheet();
        return;
      }
      await setCourtMatchList({
        tournamentId,
        courtId: listCourt._id || listCourt.id,
        bracket: getCourtBracketId(listCourt, bracketId),
        matchIds: listDraftIds,
      }).unwrap();
      Alert.alert("Thành công", "Đã lưu danh sách trận chờ cho sân.");
      requestState();
      refetchAllMatches?.();
      closeListSheet();
    } catch (e) {
      Alert.alert(
        "Lỗi",
        e?.data?.message || e?.error || "Lưu danh sách trận thất bại"
      );
    }
  };

  const handleClearCourtMatchList = async (court) => {
    if (!tournamentId || !court) return;
    try {
      if (isRuntimeStation(court)) {
        await updateTournamentCourtStationAssignmentConfig({
          tournamentId,
          stationId: court._id || court.id,
          assignmentMode: String(court?.assignmentMode || "queue").toLowerCase(),
          queueMatchIds: [],
        }).unwrap();
        Alert.alert("Thành công", "Đã xóa danh sách trận của sân.");
        requestState();
        refetchAllMatches?.();
        if (toIdString(listCourt?._id || listCourt?.id) === toIdString(court._id || court.id)) {
          closeListSheet();
        }
        return;
      }
      await clearCourtMatchList({
        tournamentId,
        courtId: court._id || court.id,
        bracket: getCourtBracketId(court, bracketId),
      }).unwrap();
      Alert.alert("Thành công", "Đã xóa danh sách trận của sân.");
      requestState();
      refetchAllMatches?.();
      if (toIdString(listCourt?._id || listCourt?.id) === toIdString(court._id || court.id)) {
        closeListSheet();
      }
    } catch (e) {
      Alert.alert(
        "Lỗi",
        e?.data?.message || e?.error || "Xóa danh sách trận thất bại"
      );
    }
  };

  const handleAdvanceCourtMatchList = async (court) => {
    if (!tournamentId || !court) return;
    try {
      if (isRuntimeStation(court)) {
        await freeTournamentCourtStation({
          tournamentId,
          stationId: court._id || court.id,
        }).unwrap();
        Alert.alert("Thành công", "Đã bỏ qua trận hiện tại và chuyển sang trận kế.");
        requestState();
        refetchAllMatches?.();
        return;
      }
      await advanceCourtMatchList({
        tournamentId,
        courtId: court._id || court.id,
        bracket: getCourtBracketId(court, bracketId),
        action: "skip_current",
      }).unwrap();
      Alert.alert("Thành công", "Đã chuyển sang trận kế tiếp.");
      requestState();
      refetchAllMatches?.();
    } catch (e) {
      Alert.alert(
        "Lỗi",
        e?.data?.message || e?.error || "Chuyển sang trận kế thất bại"
      );
    }
  };

  /* ================ render ================ */
  return (
    <>
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
        handleIndicatorStyle={{ backgroundColor: t.colors.border }}
        backgroundStyle={{ backgroundColor: t.colors.card }}
        containerStyle={{zIndex: 1000}}
      >
        <BottomSheetScrollView contentContainerStyle={styles.container}>
          {/* Header */}
          <Row
            style={{ justifyContent: "space-between", alignItems: "center" }}
          >
            <Row style={{ alignItems: "center", gap: 8 }}>
              <MaterialIcons name="stadium" size={18} color={t.colors.text} />
              <Text style={[styles.title, { color: t.colors.text }]}>
                Quản lý sân —{tournamentName ? ` ${tournamentName}` : ""}
              </Text>
            </Row>
            <Row style={{ alignItems: "center", gap: 4 }}>
              <IconBtn name="refresh" onPress={requestState} />
              <IconBtn
                name="close"
                onPress={() => sheetRef.current?.dismiss()}
              />
            </Row>
          </Row>

          {isClusterRuntimeMode ? (
            <View
              style={[
                styles.card,
                {
                  backgroundColor: t.colors.card,
                  borderColor: t.colors.border,
                },
              ]}
            >
              <Text style={[styles.cardTitle, { color: t.colors.text }]}>
                Quản lý sân theo cụm
              </Text>

              {clusterOptionsError ? (
                <View
                  style={[
                    styles.infoBox,
                    {
                      backgroundColor: t.chipWarnBg,
                      borderColor: t.colors.border,
                    },
                  ]}
                >
                  <Text style={{ color: t.chipWarnFg, fontWeight: "700" }}>
                    Khong tai duoc cau hinh cum san
                  </Text>
                  <Text style={{ color: t.chipWarnFg, marginTop: 4 }}>
                    {clusterOptionsErrorMessage}
                  </Text>
                </View>
              ) : null}

              {allMatchesError ? (
                <View
                  style={[
                    styles.infoBox,
                    {
                      backgroundColor: t.chipWarnBg,
                      borderColor: t.colors.border,
                    },
                  ]}
                >
                  <Text style={{ color: t.chipWarnFg, fontWeight: "700" }}>
                    Khong tai duoc danh sach tran dau
                  </Text>
                  <Text style={{ color: t.chipWarnFg, marginTop: 4 }}>
                    {allMatchesErrorMessage}
                  </Text>
                </View>
              ) : null}

              <View
                style={[
                  styles.clusterPickerCard,
                  {
                    borderColor: t.colors.border,
                    backgroundColor: t.colors.card,
                  },
                ]}
              >
                <Text style={[styles.clusterPickerTitle, { color: t.colors.text }]}>
                  Cụm sân được phép dùng
                </Text>
                <Text style={[styles.clusterPickerHint, { color: t.muted }]}>
                  Chạm để đổi cụm sân đang dùng, giống cách chọn trên web.
                </Text>

                <Pressable
                  onPress={openClusterPicker}
                  style={({ pressed }) => [
                    styles.clusterPickerField,
                    {
                      borderColor: t.colors.border,
                      backgroundColor: t.colors.background,
                    },
                    pressed && { opacity: 0.92 },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.clusterPickerLabel, { color: t.muted }]}>
                      Cụm đang dùng
                    </Text>
                    <Text
                      style={[styles.clusterPickerValue, { color: t.colors.text }]}
                      numberOfLines={1}
                    >
                      {[selectedCluster?.name, selectedCluster?.venueName]
                        .filter(Boolean)
                        .join(" · ") || "Chọn cụm sân"}
                    </Text>
                  </View>
                  <MaterialIcons
                    name="keyboard-arrow-down"
                    size={22}
                    color={t.colors.text}
                  />
                </Pressable>

                {allowedClusterOptions.length > 1 ? (
                  <Btn
                    variant="outline"
                    onPress={openClusterPicker}
                    style={{ alignSelf: "flex-start" }}
                  >
                    Đổi cụm sân
                  </Btn>
                ) : null}
              </View>

              <View
                style={[
                  styles.infoBox,
                  {
                    backgroundColor: t.chipInfoBg,
                    borderColor: t.chipInfoBd,
                  },
                ]}
              >
                <Text style={{ color: t.chipInfoFg }}>
                  Cụm đang dùng:{" "}
                  <Text style={{ fontWeight: "700", color: t.chipInfoFg }}>
                    {selectedCluster?.name || "Cụm sân"}
                  </Text>
                </Text>
                {selectedCluster?.venueName ? (
                  <Text style={{ color: t.chipInfoFg, marginTop: 4 }}>
                    Địa điểm: {selectedCluster.venueName}
                  </Text>
                ) : null}
                {sharedTournamentCount > 1 ? (
                  <Pressable
                    onPress={() =>
                      Alert.alert(
                        "Cụm sân dùng chung",
                        sharedTournamentNames.join("\n") ||
                          `Đang dùng chung ${sharedTournamentCount} giải.`
                      )
                    }
                    style={{ marginTop: 8 }}
                  >
                    <Chip tone="warn">
                      {`Dùng chung ${sharedTournamentCount} giải`}
                    </Chip>
                  </Pressable>
                ) : null}
              </View>

              {isLoadingClusterRuntime ? (
                <View
                  style={[
                    styles.infoBox,
                    {
                      backgroundColor: t.chipInfoBg,
                      borderColor: t.chipInfoBd,
                    },
                  ]}
                >
                  <Text style={{ color: t.chipInfoFg }}>
                    Đang tải runtime cụm sân...
                  </Text>
                </View>
              ) : clusterRuntimeError ? (
                <View
                  style={[
                    styles.infoBox,
                    {
                      backgroundColor: t.chipWarnBg,
                      borderColor: t.colors.border,
                    },
                  ]}
                >
                  <Text style={{ color: t.chipWarnFg }}>
                    {clusterRuntimeError?.data?.message ||
                      clusterRuntimeError?.error ||
                      "Không tải được runtime cụm sân."}
                  </Text>
                </View>
              ) : runtimeStations.length === 0 ? (
                <View
                  style={[
                    styles.infoBox,
                    {
                      backgroundColor: t.chipInfoBg,
                      borderColor: t.chipInfoBd,
                    },
                  ]}
                >
                  <Text style={{ color: t.chipInfoFg }}>
                    Cụm sân này chưa có sân vật lý nào.
                  </Text>
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  {runtimeStations.map((station) => {
                    const stationId = toIdString(station?._id || station?.id);
                    const currentMatch = normalizedMatch(station?.currentMatch);
                    const nextQueuedMatch = normalizedMatch(
                      station?.nextQueuedMatch
                    );
                    const queueItems = Array.isArray(station?.queueItems)
                      ? station.queueItems
                      : [];
                    const queuePreview = queueItems
                      .map((item) => normalizedMatch(item?.match))
                      .filter(Boolean)
                      .slice(0, 2);
                    const assignmentMode = String(
                      station?.assignmentMode || "manual"
                    ).toLowerCase();
                    const occupiedByAnotherTournament = Boolean(
                      toIdString(
                        station?.currentMatch?.tournament?._id ||
                          station?.currentTournament?._id ||
                          station?.currentTournamentId
                      ) &&
                        toIdString(
                          station?.currentMatch?.tournament?._id ||
                            station?.currentTournament?._id ||
                            station?.currentTournamentId
                        ) !== String(tournamentId)
                    );

                    return (
                      <View
                        key={stationId}
                        style={[
                          styles.paperRow,
                          {
                            borderColor: t.colors.border,
                            backgroundColor: t.colors.card,
                          },
                        ]}
                      >
                        <View style={{ gap: 8, flex: 1 }}>
                          <Row
                            style={{
                              alignItems: "center",
                              gap: 8,
                              flexWrap: "wrap",
                            }}
                          >
                            <Chip tone="default">
                              {station?.name || station?.code || "Sân"}
                            </Chip>
                            <Text style={{ color: t.colors.text }}>
                              {viCourtStatus(station?.status)}
                            </Text>
                            <Chip tone="default">
                              {assignmentMode === "queue"
                                ? "Tự động theo danh sách"
                                : "Gán tay"}
                            </Chip>
                            {station?.queueCount > 0 ? (
                              <Pressable
                                onPress={() => openListSheet(station)}
                                style={({ pressed }) => [pressed && { opacity: 0.9 }]}
                              >
                                <Chip tone="info">
                                  {`${station.queueCount} trận chờ`}
                                </Chip>
                              </Pressable>
                            ) : null}
                          </Row>

                          {currentMatch ? (
                            <Pressable
                              onPress={() =>
                                setViewerMatchId(
                                  toIdString(currentMatch?._id || currentMatch?.id)
                                )
                              }
                              style={({ pressed }) => [pressed && { opacity: 0.9 }]}
                            >
                              <Text
                                style={{
                                  color: t.muted,
                                  fontSize: 12,
                                  marginBottom: 2,
                                }}
                              >
                                Đang phát
                              </Text>
                              <Text
                                style={{
                                  color: t.muted,
                                  fontSize: 12,
                                  marginBottom: 2,
                                }}
                              >
                                {tournamentTitle(currentMatch)}
                              </Text>
                              <Text
                                style={{ color: t.colors.text, fontWeight: "700" }}
                              >
                                {teamLine(currentMatch)}
                              </Text>
                              <Text style={{ color: t.colors.text }}>
                                {buildMatchCode(currentMatch)}
                              </Text>
                            </Pressable>
                          ) : (
                            <Text style={{ color: t.muted }}>Sân đang trống.</Text>
                          )}

                          {nextQueuedMatch ? (
                            <Pressable
                              onPress={() =>
                                setViewerMatchId(
                                  toIdString(
                                    nextQueuedMatch?._id || nextQueuedMatch?.id
                                  )
                                )
                              }
                              style={({ pressed }) => [
                                {
                                  borderWidth: 1,
                                  borderColor: t.colors.border,
                                  borderRadius: 10,
                                  padding: 10,
                                },
                                pressed && { opacity: 0.9 },
                              ]}
                            >
                              <Text style={{ color: t.muted, fontSize: 12 }}>
                                Kế tiếp
                              </Text>
                              <Text style={{ color: t.muted, fontSize: 12 }}>
                                {tournamentTitle(nextQueuedMatch)}
                              </Text>
                              <Text
                                style={{ color: t.colors.text, fontWeight: "700" }}
                              >
                                Tiếp theo: {buildMatchCode(nextQueuedMatch)}
                              </Text>
                              <Text style={{ color: t.muted }}>
                                {teamLine(nextQueuedMatch)}
                              </Text>
                            </Pressable>
                          ) : null}

                          {!nextQueuedMatch && queuePreview.length ? (
                            <Text style={{ color: t.muted, fontSize: 12 }}>
                              Có {queuePreview.length} trận chờ. Bấm Hàng chờ để xem và sắp thứ tự.
                            </Text>
                          ) : null}

                          {occupiedByAnotherTournament ? (
                            <Text style={{ color: t.chipWarnFg, fontSize: 12 }}>
                              Sân này đang được giải khác sử dụng.
                            </Text>
                          ) : null}

                          {(currentMatch || nextQueuedMatch || queuePreview.length) ? (
                            <Text style={{ color: t.muted, fontSize: 12 }}>
                              Chạm vào thẻ trận để xem chi tiết.
                            </Text>
                          ) : null}
                        </View>

                        <View style={{ width: "100%", marginTop: 6 }}>
                          <Text
                            style={{
                              color: t.muted,
                              fontSize: 12,
                              fontWeight: "700",
                              marginBottom: 6,
                            }}
                          >
                            Thao tác nhanh
                          </Text>
                          <Row
                            style={{
                              gap: 8,
                              flexWrap: "wrap",
                              justifyContent: "flex-start",
                            }}
                          >
                            <Btn
                              variant="outline"
                              onPress={() => openListSheet(station)}
                            >
                              Hàng chờ
                            </Btn>
                            <Btn
                              variant="outline"
                              danger
                              onPress={() => handleClearCourtMatchList(station)}
                              disabled={savingStationConfig}
                            >
                              Xóa hàng chờ
                            </Btn>
                            <Btn
                              variant="outline"
                              onPress={() => handleAdvanceCourtMatchList(station)}
                              disabled={!currentMatch || freeingStation}
                            >
                              Qua trận kế
                            </Btn>
                            <Btn
                              variant="outline"
                              onPress={() => openAssignDlg(station)}
                              disabled={occupiedByAnotherTournament}
                            >
                              Đổi trận
                            </Btn>
                          </Row>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          ) : null}

          {!isClusterRuntimeMode ? (
            <>
          <View
            style={[
              styles.infoBox,
              {
                backgroundColor: t.chipWarnBg,
                borderColor: t.colors.border,
                marginBottom: 8,
              },
            ]}
          >
            <Text style={{ color: t.chipWarnFg, fontWeight: "700", marginBottom: 4 }}>
              Giải này chưa bật quản lý sân theo cụm
            </Text>
            <Text style={{ color: t.chipWarnFg }}>
              Mobile chỉ giữ các thao tác từng sân. Thiết lập số lượng sân hoặc tạo cụm sân nên làm trên web/admin.
            </Text>
          </View>

          <Row style={{ alignItems: "center", gap: 8 }}>
            <Text style={[styles.cardTitle, { color: t.colors.text }]}>
              Danh sách sân hiện có ({courts.length})
            </Text>
          </Row>

          {courts.length === 0 ? (
            <View
              style={[
                styles.infoBox,
                { backgroundColor: t.chipInfoBg, borderColor: t.chipInfoBd },
              ]}
            >
              <Text style={{ color: t.chipInfoFg }}>
                Chưa có sân nào cho giải này.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {courts.map((c) => {
                const m = getMatchForCourt(c);
                const hasMatch = Boolean(m);
                const code = getMatchCodeForCourt(c);
                const teams = getTeamsForCourt(c);
                const cs = courtStatus(c);
                const tone =
                  cs === "idle"
                    ? "default"
                    : cs === "live"
                    ? "success"
                    : cs === "maintenance"
                    ? "warn"
                    : "info";
                const cid = String(c._id || c.id);
                const deletingThis = busyDelete.has(cid) || deletingOne;
                const nextMatch = c?.nextMatch || null;
                const previewItems = getListPreviewItems(c);

                return (
                  <View
                    key={cid}
                    style={[
                      styles.paperRow,
                      {
                        borderColor: t.colors.border,
                        backgroundColor: t.colors.card,
                      },
                    ]}
                  >
                    <View style={{ gap: 6, flex: 1 }}>
                      <Row
                        style={{
                          alignItems: "center",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <Chip tone={tone}>
                          {c.name || c.label || c.title || c.code || "Sân"}
                        </Chip>
                        <Text style={{ color: t.colors.text }}>
                          {viCourtStatus(cs)}
                        </Text>
                        {c?.listEnabled ? (
                          <Chip tone="default">
                            {`Còn ${c?.remainingCount || 0} trận trong danh sách`}
                          </Chip>
                        ) : null}
                        {hasMatch && (
                          <Chip
                            tone={
                              m.status === "live"
                                ? "warn"
                                : m.status === "finished"
                                ? "success"
                                : "info"
                            }
                          >
                            {`Trận: ${viMatchStatus(m.status)}`}
                          </Chip>
                        )}
                      </Row>

                      {hasMatch && (
                        <Row
                          style={{
                            alignItems: "center",
                            gap: 8,
                            flexWrap: "wrap",
                          }}
                        >
                          {code ? <Chip tone="default">Mã: {code}</Chip> : null}
                          {teams.A || teams.B ? (
                            <Text style={{ color: t.colors.text }}>
                              {teams.A || "Đội A"}{" "}
                              <Text
                                style={{
                                  fontWeight: "700",
                                  color: t.colors.text,
                                }}
                              >
                                vs
                              </Text>{" "}
                              {teams.B || "Đội B"}
                            </Text>
                          ) : null}
                          {isGroupLike(m) && (
                            <Chip tone="default">Bảng {poolBoardLabel(m)}</Chip>
                          )}
                          {isGroupLike(m) && isNum(m?.rrRound) && (
                            <Chip tone="default">Lượt {m.rrRound}</Chip>
                          )}
                        </Row>
                      )}
                      {nextMatch ? (
                        <Text style={{ color: t.muted, fontSize: 12 }}>
                          {`Kế tiếp: ${matchListLabel(nextMatch)}`}
                        </Text>
                      ) : null}
                      {!nextMatch && previewItems.length > 0 ? (
                        <Text style={{ color: t.muted, fontSize: 12 }}>
                          {`Hàng chờ: ${previewItems
                            .map((item) => buildMatchCode(item))
                            .join(" • ")}`}
                        </Text>
                      ) : null}
                      {(hasMatch || nextMatch || previewItems.length > 0) ? (
                        <Text style={{ color: t.muted, fontSize: 12 }}>
                          Chạm vào nút để chỉnh sân hoặc danh sách chờ.
                        </Text>
                      ) : null}
                    </View>

                    {/* Actions — LUÔN là 1 dòng riêng, full width */}
                    <View style={{ width: "100%", marginTop: 6 }}>
                      <Text
                        style={{
                          color: t.muted,
                          fontSize: 12,
                          fontWeight: "700",
                          marginBottom: 6,
                        }}
                      >
                        Thao tác nhanh
                      </Text>
                      <Row
                        style={{
                          gap: 8,
                          flexWrap: "wrap",
                          justifyContent: "flex-start",
                        }}
                      >
                        <Btn variant="outline" onPress={() => openListSheet(c)}>
                          Hàng chờ
                        </Btn>
                        <Btn
                          variant="outline"
                          danger
                          onPress={() => handleClearCourtMatchList(c)}
                          disabled={!c?.listEnabled || clearingMatchList}
                        >
                          Xóa hàng chờ
                        </Btn>
                        <Btn
                          variant="outline"
                          onPress={() => handleAdvanceCourtMatchList(c)}
                          disabled={!hasMatch || advancingMatchList}
                        >
                          Qua trận kế
                        </Btn>
                        <Btn variant="outline" onPress={() => openAssignDlg(c)}>
                          Đổi trận
                        </Btn>
                        <Btn
                          variant="outline"
                          onPress={() => handleAssignNext(c._id || c.id)}
                          disabled={courtStatus(c) !== "idle"}
                        >
                          Gán trận kế
                        </Btn>
                        <Btn
                          variant="outline"
                          danger
                          onPress={() => handleDeleteOneCourt(c)}
                          disabled={deletingThis}
                        >
                          {deletingThis ? "Đang xoá..." : "Xoá sân"}
                        </Btn>
                      </Row>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
            </>
          ) : null}

          <Row style={{ justifyContent: "flex-end" }}>
            <Btn variant="outline" onPress={() => sheetRef.current?.dismiss()}>
              Đóng
            </Btn>
          </Row>
        </BottomSheetScrollView>
      </BottomSheetModal>

      {/* Sheet con: chọn trận cụ thể */}
      <AssignSpecificSheet
        open={assignOpen}
        onClose={closeAssignDlg}
        court={assignCourt}
        matches={
          isRuntimeStation(assignCourt)
            ? selectableMatches.filter(
                (match) => !getListDisableReason(match, assignCourt)
              )
            : selectableMatches.filter((match) => {
                const courtBracketId = getCourtBracketId(assignCourt, bracketId);
                const matchBracketId = getMatchBracketId(match);
                return (
                  !courtBracketId ||
                  !matchBracketId ||
                  courtBracketId === matchBracketId
                );
              })
        }
        onConfirm={confirmAssignSpecific}
      />
      <MatchListSheet
        open={listOpen}
        onClose={closeListSheet}
        court={listCourt}
        currentMatch={listCourt ? getMatchForCourt(listCourt) : null}
        matches={listMatchesForCourt}
        draftIds={listDraftIds}
        resolveMatchById={resolveMatchById}
        onAdd={pushMatchIntoListDraft}
        onRemove={removeMatchFromListDraft}
        onReorder={reorderMatchDraft}
        onSave={handleSaveCourtMatchList}
        onClear={() => handleClearCourtMatchList(listCourt)}
        isSaving={savingMatchList || savingStationConfig}
        isClearing={clearingMatchList || savingStationConfig}
        getLabel={matchListLabel}
        getDisabledReason={(match) => getListDisableReason(match, listCourt)}
        onOpenMatch={(match) =>
          setViewerMatchId(toIdString(match?._id || match?.id))
        }
      />
      <ResponsiveMatchViewer
        open={Boolean(viewerMatchId)}
        matchId={viewerMatchId}
        onClose={() => setViewerMatchId("")}
      />
      <BottomSheetModal
        ref={clusterPickerRef}
        snapPoints={["55%"]}
        backdropComponent={(p) => (
          <BottomSheetBackdrop
            {...p}
            appearsOnIndex={0}
            disappearsOnIndex={-1}
            style={{ zIndex: 1100 }}
          />
        )}
        handleIndicatorStyle={{ backgroundColor: t.colors.border }}
        backgroundStyle={{ backgroundColor: t.colors.card }}
        containerStyle={{ zIndex: 1100 }}
      >
        <BottomSheetScrollView contentContainerStyle={styles.container}>
          <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
            <Text style={[styles.title, { color: t.colors.text }]}>Đổi cụm sân</Text>
            <IconBtn
              name="close"
              onPress={() => clusterPickerRef.current?.dismiss?.()}
            />
          </Row>
          <Text style={{ color: t.muted, marginTop: -4 }}>
            Chọn cụm sân mà giải đang dùng trên mobile.
          </Text>

          {allowedClusterOptions.map((cluster) => {
            const clusterId = toIdString(cluster?._id || cluster?.id);
            const picked = clusterId === selectedClusterId;
            return (
              <Pressable
                key={clusterId}
                onPress={() => handlePickCluster(clusterId)}
                style={[
                  styles.clusterOptionRow,
                  {
                    borderColor: picked ? t.colors.primary : t.colors.border,
                    backgroundColor: picked ? t.chipInfoBg : t.colors.card,
                  },
                ]}
              >
                <View style={{ flex: 1, gap: 4 }}>
                  <Text
                    style={{
                      color: t.colors.text,
                      fontWeight: "700",
                      fontSize: 15,
                    }}
                  >
                    {cluster?.name || "Cụm sân"}
                  </Text>
                  {cluster?.venueName ? (
                    <Text style={{ color: t.muted }}>{cluster.venueName}</Text>
                  ) : null}
                </View>
                <MaterialIcons
                  name={picked ? "radio-button-checked" : "radio-button-unchecked"}
                  size={22}
                  color={picked ? t.colors.primary : t.muted}
                />
              </Pressable>
            );
          })}
        </BottomSheetScrollView>
      </BottomSheetModal>
    </>
  );
}

/* ================= styles ================= */
const styles = StyleSheet.create({
  container: { padding: 12, gap: 12 },
  row: { flexDirection: "row", gap: 8 },

  title: { fontSize: 16, fontWeight: "700" },

  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  cardTitle: { fontWeight: "700" },

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

  chip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  hr: { height: 1, marginVertical: 6 },

  iconBtn: { padding: 6, borderRadius: 999 },

  paperRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "flex-start",
    gap: 10,
    flexWrap: "wrap",
  },

  btn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },

  infoBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },

  clusterPickerCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  clusterPickerTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  clusterPickerHint: {
    fontSize: 12,
  },
  clusterPickerField: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  clusterPickerLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  clusterPickerValue: {
    fontSize: 16,
    fontWeight: "700",
  },
  clusterOptionRow: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  segment: {},

  itemRow: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  selectedQueueGuide: {
    fontSize: 12,
    marginTop: 6,
    marginBottom: 10,
  },
  selectedQueueRow: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  selectedQueueContent: {
    flex: 1,
    gap: 4,
  },
  selectedQueueHint: {
    fontSize: 12,
  },
  selectedQueueActions: {
    alignItems: "center",
    gap: 2,
  },
  dragHandleBtn: {
    padding: 8,
    borderRadius: 999,
  },
  deleteQueueBtn: {
    padding: 8,
  },
  itemName: { fontWeight: "600" },
});
