// components/CourtManagerSheet.jsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
  Switch,
} from "react-native";
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { MaterialIcons } from "@expo/vector-icons";
import { useTheme } from "@react-navigation/native";
import { useSocket } from "@/context/SocketContext";
import {
  useUpsertCourtsMutation,
  useBuildGroupsQueueMutation,
  useAssignNextHttpMutation,
  useDeleteCourtsMutation, // NEW: xoá tất cả
  useDeleteCourtMutation, // NEW: xoá 1 sân
} from "@/slices/adminCourtApiSlice";

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

const personName = (p) => {
  if (!p || typeof p !== "object") return "";
  const cands = [
    p.nickname,
    p.nickName,
    p.user?.nickname,
    p.user?.nickName,
    p.profile?.nickname,
    p.profile?.nickName,
    p.displayName,
    p.fullName,
    p.name,
    p.email,
    p.phone,
  ];
  for (const v of cands) if (typeof v === "string" && v.trim()) return v.trim();
  return "";
};
const pairName = (pair) => {
  if (!pair) return "";
  const names = [];
  if (pair.player1) names.push(personName(pair.player1));
  if (pair.player2) names.push(personName(pair.player2));
  if (!names.filter(Boolean).length && Array.isArray(pair.participants)) {
    for (const it of pair.participants) names.push(personName(it?.user || it));
  }
  if (!names.filter(Boolean).length) {
    const label =
      pair.nickname ||
      pair.nickName ||
      pair.shortName ||
      pair.code ||
      pair.displayName ||
      pair.name ||
      "";
    return String(label || "").trim();
  }
  return names.filter(Boolean).join(" & ");
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

function Divider() {
  const t = useTokens();
  return <View style={[styles.hr, { backgroundColor: t.colors.border }]} />;
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
    disabled && { opacity: 0.5 },
  ];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [base, pressed && !disabled && { opacity: 0.9 }]}
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
function AssignSpecificSheet({ open, onClose, court, matches, onConfirm }) {
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
      optionLabel(m).toLowerCase().includes(debouncedQ)
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
            const label = optionLabel(m);
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
export default function CourtManagerSheet({
  open,
  onClose,
  tournamentId,
  // giữ tương thích nhưng KHÔNG dùng nữa:
  bracketId, // eslint-disable-line no-unused-vars
  bracketName, // eslint-disable-line no-unused-vars
  tournamentName,
  snapPoints: snapPointsProp,
}) {
  const t = useTokens();
  const snapPoints = useMemo(() => snapPointsProp || ["85%"], [snapPointsProp]);
  const sheetRef = useRef(null);
  const socket = useSocket();

  // config
  const [mode, setMode] = useState("count"); // "count" | "names"
  const [count, setCount] = useState("4");
  const [namesText, setNamesText] = useState("Sân 1\nSân 2\nSân 3\nSân 4");
  const [autoAssign, setAutoAssign] = useState(false);
  const names = useMemo(
    () =>
      namesText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    [namesText]
  );

  // realtime state
  const [courts, setCourts] = useState([]);
  const [socketMatches, setSocketMatches] = useState([]);
  const [queue, setQueue] = useState([]);
  const notifQueueRef = useRef([]);

  // mutations
  const [upsertCourts, { isLoading: savingCourts }] = useUpsertCourtsMutation();
  const [buildQueue, { isLoading: buildingQueue }] =
    useBuildGroupsQueueMutation();
  const [assignNextHttp] = useAssignNextHttpMutation();
  const [deleteCourts, { isLoading: deletingCourts }] =
    useDeleteCourtsMutation();
  const [deleteCourt, { isLoading: deletingOne }] = useDeleteCourtMutation();

  // open/close
  useEffect(() => {
    if (open) sheetRef.current?.present();
    else sheetRef.current?.dismiss();
  }, [open]);

  // join/leave socket room — ⭐ TOÀN GIẢI (chỉ theo tournamentId)
  useEffect(() => {
    if (!open || !socket || !tournamentId) return;

    const room = { tournamentId };

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
    const interval = setInterval(reqState, 45000);

    return () => {
      clearInterval(interval);
      socket.emit("scheduler:leave", room);
      socket.off("scheduler:state", onState);
      socket.off("scheduler:notify", onNotify);
      socket.off?.("match:update", reqState);
      socket.off?.("match:finish", reqState);
    };
  }, [open, socket, tournamentId]);

  // helpers for court
  const matchMap = useMemo(() => {
    const map = new Map();
    for (const m of socketMatches) map.set(String(m._id || m.id), m);
    return map;
  }, [socketMatches]);

  const getMatchForCourt = (c) => {
    if (c?.currentMatchObj) return c.currentMatchObj;
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
    const A = (m.pairA ? pairName(m.pairA) : "") || m.pairAName || "";
    const B = (m.pairB ? pairName(m.pairB) : "") || m.pairBName || "";
    return { A, B };
  };

  // selectable matches (giống web)
  const selectableMatches = useMemo(() => {
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
  }, [queue, socketMatches]);

  /* ================ handlers ================ */
  const requestState = () => {
    if (socket && tournamentId) {
      socket.emit("scheduler:requestState", { tournamentId });
    }
  };

  const handleSaveCourts = async () => {
    if (!tournamentId) {
      Alert.alert("Lỗi", "Thiếu tournamentId.");
      return;
    }
    const payload =
      mode === "names"
        ? { tournamentId, names, autoAssign }
        : {
            tournamentId,
            count: Number(count) || 0,
            autoAssign,
          };
    try {
      await upsertCourts(payload).unwrap();
      Alert.alert(
        "Thành công",
        autoAssign
          ? "Đã lưu danh sách sân toàn giải. Tự động gán trận đang BẬT."
          : "Đã lưu danh sách sân toàn giải."
      );
      requestState();
    } catch (e) {
      Alert.alert("Lỗi", e?.data?.message || e?.error || "Lỗi lưu sân");
    }
  };

  const handleBuildQueue = async () => {
    if (!tournamentId) return;
    try {
      const res = await buildQueue({ tournamentId }).unwrap();
      Alert.alert(
        "Thành công",
        `Đã xếp ${res?.totalQueued ?? 0} trận vào hàng đợi toàn giải.`
      );
    } catch (e) {
      Alert.alert(
        "Lỗi",
        e?.data?.message || e?.error || "Xếp hàng đợi thất bại"
      );
    } finally {
      requestState();
    }
  };

  const handleAssignNext = async (courtId) => {
    if (!tournamentId || !courtId) return;
    socket?.emit?.("scheduler:assignNext", {
      tournamentId,
      courtId,
    });
    await assignNextHttp({ tournamentId, courtId })
      .unwrap()
      .catch(() => {});
    requestState();
  };

  const handleResetAll = () => {
    if (!tournamentId) return;
    Alert.alert(
      "Reset tất cả sân?",
      "Reset TẤT CẢ sân của giải (gỡ gán & xoá khỏi bộ lập lịch).",
      [
        { text: "Huỷ", style: "cancel" },
        {
          text: "Đồng ý",
          style: "destructive",
          onPress: () => {
            socket?.emit?.("scheduler:resetAll", { tournamentId });
            Alert.alert("Đã gửi lệnh", "Hệ thống đang reset tất cả sân.");
            requestState();
          },
        },
      ]
    );
  };

  const handleDeleteAllCourts = async () => {
    if (!tournamentId) {
      Alert.alert("Lỗi", "Thiếu tournamentId.");
      return;
    }
    Alert.alert(
      "Xoá TẤT CẢ sân?",
      "Hành động này không thể hoàn tác.",
      [
        { text: "Huỷ", style: "cancel" },
        {
          text: "Xoá",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteCourts({ tournamentId }).unwrap();
              Alert.alert("Thành công", "Đã xoá tất cả sân.");
              requestState();
            } catch (e) {
              Alert.alert(
                "Lỗi",
                e?.data?.message || e?.error || "Xoá sân thất bại"
              );
            }
          },
        },
      ],
      { cancelable: true }
    );
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
  const confirmAssignSpecific = (matchId) => {
    if (!tournamentId || !assignCourt || !matchId) return;
    socket?.emit?.("scheduler:assignSpecific", {
      tournamentId,
      courtId: assignCourt._id || assignCourt.id,
      matchId,
      replace: true,
    });
    Alert.alert("Đã yêu cầu", "Đã yêu cầu gán trận vào sân.");
    requestState();
    closeAssignDlg();
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

          {/* Config block */}
          <View
            style={[
              styles.card,
              { backgroundColor: t.colors.card, borderColor: t.colors.border },
            ]}
          >
            <Text style={[styles.cardTitle, { color: t.colors.text }]}>
              Cấu hình sân cho toàn giải
            </Text>

            {/* Mode toggle */}
            <Row style={{ gap: 8 }}>
              <Pressable
                onPress={() => setMode("count")}
                style={[
                  styles.segment,
                  {
                    paddingVertical: 8,
                    paddingHorizontal: 10,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: t.colors.border,
                    backgroundColor:
                      mode === "count" ? t.colors.primary : "transparent",
                  },
                ]}
              >
                <Text
                  style={{
                    color: mode === "count" ? "#fff" : t.colors.text,
                    fontWeight: "700",
                  }}
                >
                  Theo số lượng
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setMode("names")}
                style={[
                  styles.segment,
                  {
                    paddingVertical: 8,
                    paddingHorizontal: 10,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: t.colors.border,
                    backgroundColor:
                      mode === "names" ? t.colors.primary : "transparent",
                  },
                ]}
              >
                <Text
                  style={{
                    color: mode === "names" ? "#fff" : t.colors.text,
                    fontWeight: "700",
                  }}
                >
                  Theo tên từng sân
                </Text>
              </Pressable>
            </Row>

            {/* Inputs */}
            {mode === "count" ? (
              <View
                style={[styles.inputWrap, { borderColor: t.colors.border }]}
              >
                <MaterialIcons
                  name="format-list-numbered"
                  size={18}
                  color={t.muted}
                />
                <TextInput
                  style={[styles.input, { color: t.colors.text }]}
                  placeholder="Số lượng sân"
                  placeholderTextColor={t.muted}
                  keyboardType="numeric"
                  value={String(count)}
                  onChangeText={setCount}
                />
              </View>
            ) : (
              <View
                style={[
                  styles.inputWrap,
                  { alignItems: "flex-start", borderColor: t.colors.border },
                ]}
              >
                <MaterialIcons
                  name="drive-file-rename-outline"
                  size={18}
                  color={t.muted}
                  style={{ marginTop: 2 }}
                />
                <TextInput
                  style={[
                    styles.input,
                    {
                      minHeight: 120,
                      textAlignVertical: "top",
                      color: t.colors.text,
                    },
                  ]}
                  placeholder="Tên sân (mỗi dòng 1 tên)"
                  placeholderTextColor={t.muted}
                  value={namesText}
                  onChangeText={setNamesText}
                  multiline
                />
              </View>
            )}

            <Row
              style={{ alignItems: "center", justifyContent: "space-between" }}
            >
              <Row style={{ alignItems: "center", gap: 8 }}>
                <MaterialIcons
                  name="autorenew"
                  size={16}
                  color={t.colors.primary}
                />
                <Text style={{ color: t.colors.text }}>
                  Tự động gán trận sau khi lưu
                </Text>
              </Row>
              <Switch
                value={autoAssign}
                onValueChange={setAutoAssign}
                trackColor={{ false: t.colors.border, true: t.colors.primary }}
                thumbColor={
                  autoAssign
                    ? t.dark
                      ? "#e5e7eb"
                      : "#fff"
                    : t.dark
                    ? "#cbd5e1"
                    : "#f4f3f4"
                }
                ios_backgroundColor={t.colors.border}
                accessibilityLabel="Bật tự động gán trận sau khi lưu"
              />
            </Row>

            <Row
              style={{ gap: 8, justifyContent: "flex-start", flexWrap: "wrap" }}
            >
              <Btn onPress={handleSaveCourts} disabled={savingCourts}>
                {savingCourts ? "Đang lưu..." : "Lưu danh sách sân"}
              </Btn>
              <Btn variant="outline" onPress={handleResetAll}>
                Reset tất cả
              </Btn>
              <Btn
                danger
                onPress={handleDeleteAllCourts}
                disabled={deletingCourts}
              >
                {deletingCourts ? "Đang xoá..." : "Xoá tất cả sân"}
              </Btn>
            </Row>
          </View>

          {/* Courts list */}
          <Row style={{ alignItems: "center", gap: 8 }}>
            <Text style={[styles.cardTitle, { color: t.colors.text }]}>
              Danh sách sân ({courts.length})
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
                    </View>

                    {/* Actions — LUÔN là 1 dòng riêng, full width */}
                    <View style={{ width: "100%", marginTop: 6 }}>
                      <Row
                        style={{
                          gap: 8,
                          flexWrap: "nowrap",
                          justifyContent: "flex-start",
                        }}
                      >
                        <Btn variant="outline" onPress={() => openAssignDlg(c)}>
                          Sửa trận vào sân
                        </Btn>
                        <Btn
                          variant="outline"
                          onPress={() => handleAssignNext(c._id || c.id)}
                          disabled={courtStatus(c) !== "idle"}
                        >
                          Gán trận kế tiếp
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
        matches={selectableMatches}
        onConfirm={confirmAssignSpecific}
      />
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

  segment: {},

  itemRow: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  itemName: { fontWeight: "600" },
});
