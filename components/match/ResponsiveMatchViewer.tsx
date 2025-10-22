// app/screens/PickleBall/match/ResponsiveMatchViewer.native.jsx
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  useWindowDimensions,
  useColorScheme,
} from "react-native";
import { useSelector } from "react-redux";
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetScrollView,
  useBottomSheetModal,
} from "@gorhom/bottom-sheet";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";

import { useLiveMatch } from "@/hooks/useLiveMatch";
import {
  useGetMatchPublicQuery,
  useListTournamentBracketsQuery,
} from "@/slices/tournamentsApiSlice";
import MatchContent from "./MatchContent";

/* =========================
 * Helpers: V/T (+B cho vòng bảng)
 * ========================= */

// 2^⌈log2(n)⌉
const ceilPow2 = (n) =>
  Math.pow(2, Math.ceil(Math.log2(Math.max(1, Number(n) || 1))));

/** Ước lượng số vòng cho 1 bracket theo schema */
const estimateRoundsForBracket = (b) => {
  if (!b) return 1;

  const fromMetaRounds =
    Number(b?.meta?.maxRounds) || Number(b?.drawRounds) || Number(b?.rounds);
  if (fromMetaRounds) return Math.max(1, fromMetaRounds);

  const metaDrawSize = Number(b?.meta?.drawSize) || 0;
  if (metaDrawSize >= 2) {
    const scale = ceilPow2(metaDrawSize);
    return Math.ceil(Math.log2(scale));
  }

  const reDraw = Number(b?.config?.roundElim?.drawSize) || 0;
  if (reDraw >= 2) {
    const scale = ceilPow2(reDraw);
    return Math.ceil(Math.log2(scale));
  }

  return 1;
};

const normalizeType = (t) => String(t || "").toLowerCase();
const isGroupType = (t) => {
  const x = normalizeType(t);
  return (
    x === "group" ||
    x === "round_robin" ||
    x === "gsl" ||
    x === "groups" ||
    x === "rr"
  );
};
const isKnockoutType = (t) => {
  const x = normalizeType(t);
  return (
    x === "knockout" ||
    x === "double_elim" ||
    x === "roundelim" ||
    x === "round_elim"
  );
};

/** Cộng dồn V theo thứ tự các brackets trước bracket hiện tại */
const computeBaseRoundStart = (brackets, currentBracketId) => {
  if (!Array.isArray(brackets) || !currentBracketId) return 1;
  let base = 1;
  for (const b of brackets) {
    const bid = String(b?._id || "");
    if (!bid) continue;
    if (bid === String(currentBracketId)) break;

    if (isGroupType(b?.type)) {
      base += 1; // vòng bảng luôn chiếm V=1
    } else if (isKnockoutType(b?.type)) {
      base += estimateRoundsForBracket(b);
    } else {
      base += estimateRoundsForBracket(b);
    }
  }
  return base;
};

// Lấy bracket cho match: ưu tiên m.bracket (đã populate), rồi mới tới list
const getBracketForMatch = (m, brackets) => {
  if (m?.bracket && typeof m.bracket === "object") return m.bracket;
  const id = m?.bracket?._id || m?.bracket || null;
  if (!id) return null;
  return (
    (brackets || []).find((b) => String(b?._id || "") === String(id)) || null
  );
};

const letterToIndex = (s) => {
  const ch = String(s || "")
    .trim()
    .toUpperCase();
  if (!ch) return null;
  const c = ch.charCodeAt(0);
  if (c >= 65 && c <= 90) return c - 65 + 1; // A=1
  return null;
};

const extractIndexFromToken = (token) => {
  const s = String(token || "").trim();
  if (!s) return null;

  // 1 chữ cái trần (A, B, ...)
  if (/^[A-Za-z]$/.test(s)) return letterToIndex(s);

  // chữ cái đứng riêng trong chuỗi
  const m1 = s.match(/\b([A-Za-z])\b/);
  if (m1?.[1]) {
    const idx = letterToIndex(m1[1]);
    if (idx) return idx;
  }

  // số đứng riêng trong chuỗi
  const m2 = s.match(/\b(\d+)\b/);
  if (m2?.[1]) return Number(m2[1]);

  return null;
};

const groupNameCandidates = (g) =>
  [g?.name, g?.label, g?.groupName, g?.groupLabel, g?.title, g?.key].filter(
    Boolean
  );

/** Trả về chỉ số bảng (1-based) nếu xác định được */
const resolveGroupIndex = (m, brackets) => {
  // 1) Nếu có m.pool
  if (m?.pool) {
    const byName = extractIndexFromToken(m.pool.name || m.pool.label);
    if (Number.isFinite(byName) && byName > 0) return byName;

    const poolId = m.pool.id || m.pool._id || null;
    if (poolId) {
      const br = getBracketForMatch(m, brackets);
      const groups = Array.isArray(br?.groups) ? br.groups : [];
      if (groups.length) {
        const i = groups.findIndex(
          (g) => String(g?._id || "") === String(poolId)
        );
        if (i >= 0) return i + 1;
      }
    }
  }

  // 2) Numeric hints
  const numericCandidates = [
    m?.groupIndex != null ? Number(m.groupIndex) + 1 : null, // 0-based -> 1-based
    Number(m?.groupNo) || null,
    Number(m?.poolNo) || null,
    Number(m?.meta?.groupNo) || null,
    Number(m?.meta?.poolNo) || null,
  ].filter((x) => Number.isFinite(x) && x > 0);
  if (numericCandidates.length) return numericCandidates[0];

  // 3) Text signals
  const textSignals = [
    m?.groupLabel,
    m?.groupName,
    m?.poolLabel,
    m?.poolName,
    m?.meta?.groupLabel,
    m?.meta?.groupName,
    m?.groupKey,
    m?.poolKey,
    m?.meta?.groupKey,
    m?.meta?.poolKey,
  ].filter(Boolean);

  for (const t of textSignals) {
    const idx = extractIndexFromToken(t);
    if (Number.isFinite(idx) && idx > 0) return idx;
  }

  // 4) Khớp tên tuyệt đối với danh sách groups trong bracket
  const br = getBracketForMatch(m, brackets);
  const groups = Array.isArray(br?.groups) ? br.groups : [];

  if (groups.length === 1) return 1;

  if (groups.length && textSignals.length) {
    for (const t of textSignals) {
      const needle = String(t || "")
        .trim()
        .toLowerCase();
      const hit = groups.findIndex((g) =>
        groupNameCandidates(g).some(
          (cand) =>
            String(cand || "")
              .trim()
              .toLowerCase() === needle
        )
      );
      if (hit >= 0) return hit + 1;
    }
  }

  // 5) fallback: chữ cái -> chỉ số
  for (const t of textSignals) {
    const li = letterToIndex(t);
    if (li) return li;
  }

  return null;
};

const makeMatchCode = (m, brackets) => {
  if (!m) return "";
  const br = getBracketForMatch(m, brackets);
  const currentBracketId = br?._id || m?.bracket?._id || m?.bracket || null;

  const baseRoundStart = computeBaseRoundStart(
    brackets || [],
    currentBracketId
  );

  const roundIdx = Number.isFinite(Number(m?.rrRound || m?.round))
    ? Number(m.rrRound || m.round)
    : 1;

  const orderOneBased = Number.isFinite(Number(m?.order))
    ? Number(m.order) + 1
    : 1;

  const displayRound = baseRoundStart + (roundIdx - 1);

  const typeOrFormat = normalizeType(br?.type || m?.type || m?.format);
  if (isGroupType(typeOrFormat) || normalizeType(m?.format) === "group") {
    const bIdx = resolveGroupIndex(m, brackets);
    if (bIdx) return `V${1}-B${bIdx}-T${orderOneBased}`; // V1 cho vòng bảng
  }

  return `V${displayRound}-T${orderOneBased}`;
};

const _ts = (x) => {
  const t = new Date(x || 0).getTime();
  return Number.isFinite(t) ? t : 0;
};
function lastScore(gs) {
  if (!Array.isArray(gs) || !gs.length) return { a: 0, b: 0 };
  return gs[gs.length - 1] || { a: 0, b: 0 };
}
function makeMatchSignature(x) {
  if (!x) return "";
  const last = lastScore(x.gameScores);
  const r = x.rules || {};
  const pA = x.pairA?._id || x.pairA || "";
  const pB = x.pairB?._id || x.pairB || "";
  const sA = x.seedA?.label || "";
  const sB = x.seedB?.label || "";
  return [
    x._id,
    x.status,
    r.bestOf ?? 3,
    r.pointsToWin ?? 11,
    r.winByTwo ? 1 : 0,
    _ts(x.scheduledAt),
    _ts(x.startedAt),
    _ts(x.finishedAt),
    (x.gameScores || []).length,
    last.a,
    last.b,
    pA,
    pB,
    sA,
    sB,
  ].join("|");
}

/* =========================
 * Hook: LOCK match theo matchId (chỉ nhận data đúng id)
 * ========================= */
function useLockedDialogMatch({
  open,
  matchId,
  base,
  live,
  isLoadingBase,
  isLoadingLive,
}) {
  const lockedId = String(matchId || "");
  const [mm, setMm] = useState(null);
  const sigRef = useRef("");
  const throttleRef = useRef(null);
  // Reset khi đổi match hoặc đóng
  useEffect(() => {
    if (!open || !lockedId) {
      setMm(null);
      sigRef.current = "";
      return;
    }
  }, [open, lockedId]);

  // Nhận dữ liệu nhưng chỉ khi _id trùng matchId
  useEffect(() => {
    if (!open || !lockedId) return;

    const pick = (cand) => {
      const id = String(cand?._id || cand?.id || "");
      return id && id === lockedId ? cand : null;
    };

    const next = pick(live) || pick(base);
    if (!next) return;

    const nextSig = makeMatchSignature(next);
    if (sigRef.current === nextSig) return; // không đổi -> bỏ
    if (throttleRef.current) clearTimeout(throttleRef.current);
    throttleRef.current = setTimeout(() => {
      sigRef.current = nextSig;
      setMm((prev) => {
        const prevId = String(prev?._id || prev?.id || "");
        return prevId && prevId !== lockedId ? prev : next;
      });
    }, 80); // gom update 12fps để mượt UI

    return () => throttleRef.current && clearTimeout(throttleRef.current);
  }, [open, lockedId, base, live]);

  const loading = (!mm && (isLoadingBase || isLoadingLive)) || (!mm && open);
  return { mm, loading };
}

/* =============== THEME =============== */
function useThemeTokens() {
  const scheme = useColorScheme() ?? "light";

  // màu chính + văn bản
  const tint = scheme === "dark" ? "#7cc0ff" : "#0a84ff";
  const textPrimary = scheme === "dark" ? "#ffffff" : "#0f172a";
  const textSecondary = scheme === "dark" ? "#d1d1d1" : "#334155";

  // nền sheet + viền mềm + handle
  const sheetBg = scheme === "dark" ? "#111214" : "#ffffff";
  const softBg = scheme === "dark" ? "#1e1f23" : "#eef1f6";
  const softBorder = scheme === "dark" ? "#3a3b40" : "#cbd5e1";
  const handle = scheme === "dark" ? "#475569" : "#94a3b8";
  const backdrop = scheme === "dark" ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0.45)";

  // Pills (status)
  const pill = {
    live:
      scheme === "dark"
        ? {
            bg: "rgba(251,146,60,0.18)",
            bd: "#fb923c",
            color: "#fed7aa",
          }
        : {
            bg: "#fff7ed",
            bd: "#fdba74",
            color: "#9a3412",
          },
    finished:
      scheme === "dark"
        ? {
            bg: "rgba(16,185,129,0.18)",
            bd: "#34d399",
            color: "#a7f3d0",
          }
        : {
            bg: "#ecfdf5",
            bd: "#86efac",
            color: "#065f46",
          },
    scheduled:
      scheme === "dark"
        ? {
            bg: "rgba(148,163,184,0.18)",
            bd: "#64748b",
            color: "#cbd5e1",
          }
        : {
            bg: "#f1f5f9",
            bd: "#cbd5e1",
            color: "#334155",
          },
  };

  return {
    scheme,
    tint,
    textPrimary,
    textSecondary,
    sheetBg,
    softBg,
    softBorder,
    handle,
    backdrop,
    pill,
  };
}

/* ================= UI bits ================= */
export function StatusPill({ status }) {
  const { pill } = useThemeTokens();
  const map = {
    live: { ...pill.live, label: "Đang diễn ra" },
    finished: { ...pill.finished, label: "Hoàn thành" },
    scheduled: { ...pill.scheduled, label: "Dự kiến" },
    default: { ...pill.scheduled, label: "Dự kiến" },
  };
  const sty = map[status] || map.default;
  return (
    <View
      style={[styles.pill, { backgroundColor: sty.bg, borderColor: sty.bd }]}
    >
      <Text style={[styles.pillText, { color: sty.color }]}>{sty.label}</Text>
    </View>
  );
}

/* ================= Component ================= */
export default function ResponsiveMatchViewer({ open, matchId, onClose }) {
  const { userInfo } = useSelector((s) => s.auth || {});
  const token = userInfo?.token;

  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  // Né Dynamic Island khi landscape
  const sideInset = isLandscape ? Math.max(insets.left, insets.right) : 0;
  const topInset = Math.max(insets.top, Platform.OS === "android" ? 12 : 0);

  const sheetRef = useRef(null);
  const snapPoints = useMemo(() => ["80%", "100%"], []);
  const DEFAULT_INDEX = 0; // 80%

  // Flags chống race-condition present/dismiss
  const isAnimatingRef = useRef(false);
  const isDismissedRef = useRef(true); // coi như đang đóng lúc đầu
  const { dismissAll } = useBottomSheetModal(); // dọn modal khác nếu có (optional)

  const safePresent = useCallback(async () => {
    if (!sheetRef.current) return;
    if (isAnimatingRef.current || !isDismissedRef.current) return;
    isAnimatingRef.current = true;

    // (tuỳ chọn) dọn các modal cũ để tránh overlay kẹt
    // try {
    //   await dismissAll();
    // } catch (_) {}

    requestAnimationFrame(() => {
      sheetRef.current?.present?.();
      requestAnimationFrame(() => {
        sheetRef.current?.snapToIndex?.(DEFAULT_INDEX);
        isDismissedRef.current = false;
        setTimeout(() => {
          isAnimatingRef.current = false;
        }, 350); // ~duration animation
      });
    });
  }, []);

  const safeDismiss = useCallback(() => {
    if (!sheetRef.current) return;
    if (isAnimatingRef.current || isDismissedRef.current) return;
    isAnimatingRef.current = true;
    sheetRef.current?.dismiss?.();
    // flag hoàn tất trong onDismiss
  }, []);

  // Base + Live
  const {
    data: base,
    isLoading: isLoadingBase,
    refetch: refetchBase,
  } = useGetMatchPublicQuery(matchId, {
    skip: !matchId || !open,
  });
  const { loading: isLoadingLive, data: live } = useLiveMatch(
    open ? matchId : null,
    token
  );

  // LOCK: chỉ lấy data trùng matchId để tránh nhảy khi đổi trận
  const { mm, loading } = useLockedDialogMatch({
    open,
    matchId,
    base,
    live,
    isLoadingBase,
    isLoadingLive,
  });

  // THEME
  const T = useThemeTokens();

  // tournamentId để lấy brackets (phục vụ offset V) — dựa trên match đã LOCK
  const tournamentId = useMemo(() => {
    if (!mm) return null;
    if (mm.tournament && typeof mm.tournament === "object") {
      return mm.tournament._id || mm.tournament.id || null;
    }
    return mm.tournament || null;
  }, [mm]);

  const { data: brackets = [], refetch: refetchBrackets } =
    useListTournamentBracketsQuery(tournamentId, {
      skip: !tournamentId,
    });

  const code = mm ? makeMatchCode(mm, brackets) : "";
  const status = mm?.status || "scheduled";

  // Điều khiển mở/đóng an toàn theo prop `open`
  useEffect(() => {
    if (open) safePresent();
    else safeDismiss();
  }, [open, safePresent, safeDismiss]);

  // Nếu đổi matchId khi đang mở, giữ 80%
  useEffect(() => {
    if (open && sheetRef.current && !isDismissedRef.current) {
      sheetRef.current?.snapToIndex?.(DEFAULT_INDEX);
    }
  }, [open, matchId]);

  const handleSaved = () => {
    refetchBase?.();
    refetchBrackets?.();
  };

  const renderBackdrop = useCallback(
    (props) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
        opacity={1}
        style={{ backgroundColor: T.backdrop }}
      />
    ),
    [T.backdrop]
  );

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={snapPoints}
        enablePanDownToClose
        onPresent={() => {
          isDismissedRef.current = false;
          // khi present xong, chắc chắn không còn animate
          setTimeout(() => {
            isAnimatingRef.current = false;
          }, 50);
        }}
        onChange={(index) => {
          if (index >= 0) {
            isDismissedRef.current = false;
          }
        }}
        onDismiss={() => {
          isDismissedRef.current = true;
          isAnimatingRef.current = false;
          onClose?.();
        }}
        backdropComponent={renderBackdrop}
        topInset={topInset}
        containerStyle={{
          marginLeft: sideInset,
          marginRight: sideInset,
        }}
        handleIndicatorStyle={{ backgroundColor: T.handle }}
        backgroundStyle={{ backgroundColor: T.sheetBg }}
        enableDynamicSizing={false}
      >
        {/* Header */}
        <View style={[styles.header, { borderColor: T.softBorder }]}>
          <View style={{ flex: 1 }}>
            <Text
              style={[styles.headerTitle, { color: T.textPrimary }]}
              numberOfLines={1}
            >
              {code ? `Trận đấu • ${code}` : "Trận đấu"}
            </Text>
            <StatusPill status={status} />
          </View>
          <TouchableOpacity
            onPress={safeDismiss}
            style={styles.closeBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialIcons name="close" size={22} color={T.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Body — không đặt flex:1 cho BottomSheetScrollView */}
        <BottomSheetScrollView
          contentContainerStyle={{
            paddingBottom: Math.max(insets.bottom, 16),
            paddingHorizontal: 12,
            gap: 12,
            backgroundColor: T.sheetBg,
          }}
        >
          <MatchContent
            m={mm}
            isLoading={loading}
            liveLoading={false}
            onSaved={handleSaved}
            // (optional) nếu MatchContent hỗ trợ theme props:
            // textPrimary={T.textPrimary}
            // textSecondary={T.textSecondary}
            // tint={T.tint}
            // softBg={T.softBg}
            // softBorder={T.softBorder}
          />
        </BottomSheetScrollView>
      </BottomSheetModal>
    </SafeAreaView>
  );
}

/* ================= Styles ================= */
const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderBottomWidth: 0, // tăng lên 1 nếu muốn line
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  pill: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 12,
    fontWeight: "600",
  },
});
