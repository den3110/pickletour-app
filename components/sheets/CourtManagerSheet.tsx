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
} from "@/slices/adminCourtApiSlice";

/* ================= helpers / formatters ================= */
const isNum = (x) => typeof x === "number" && Number.isFinite(x);
const isPO = (m) => {
  const t = String(m?.type || m?.format || "").toLowerCase();
  return t === "po" || m?.meta?.po === true;
};
const isKO = (m) => {
  const t = String(m?.type || m?.format || "").toLowerCase();
  return (
    t === "ko" ||
    t === "knockout" ||
    t === "elimination" ||
    m?.meta?.knockout === true
  );
};
const isGroupLike = (m) => {
  if (!m) return false;
  if (isPO(m) || isKO(m)) return false;
  const t = String(m?.type || m?.format || "").toLowerCase();
  if (t === "group" || t === "rr" || t === "roundrobin" || t === "round_robin")
    return true;
  return !!m?.pool;
};

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
const poolIndexNumber = (m) => {
  const lbl = poolBoardLabel(m);
  const hit = /^B(\d+)$/i.exec(lbl);
  if (hit) return Number(hit[1]);
  const byLetter = letterToIndex(m?.pool?.name || m?.pool?.code || "");
  return byLetter || 1;
};

const isGlobalCodeString = (s) =>
  typeof s === "string" && /^V\d+(?:-B\d+)?-T\d+$/.test(s);
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
  const elimOffset = Number.isFinite(Number(m?.elimOffset))
    ? Number(m.elimOffset)
    : 0;
  const r = Number.isFinite(Number(m?.round)) ? Number(m.round) : 1;
  const V = elimOffset + r;
  return `V${V}-T${T}`;
};
const buildMatchCode = (m, idx) => {
  if (!m) return "";
  if (isGlobalCodeString(m.globalCode)) return m.globalCode;
  if (isGlobalCodeString(m.code)) return m.code;
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

function Btn({ variant = "solid", onPress, children, disabled }) {
  const t = useTokens();
  const base = [
    styles.btn,
    variant === "solid"
      ? { backgroundColor: t.colors.primary }
      : {
          backgroundColor: "transparent",
          borderColor: t.colors.primary,
          borderWidth: 1,
        },
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
          color: variant === "solid" ? "#fff" : t.colors.primary,
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
        <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} />
      )}
      handleIndicatorStyle={{ backgroundColor: t.colors.border }}
      backgroundStyle={{ backgroundColor: t.colors.card }}
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

/* ================= CourtManagerSheet (sheet chính) ================= */
export default function CourtManagerSheet({
  open,
  onClose,
  tournamentId,
  bracketId,
  bracketName,
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

  // open/close
  useEffect(() => {
    if (open) sheetRef.current?.present();
    else sheetRef.current?.dismiss();
  }, [open]);

  // join/leave socket room
  useEffect(() => {
    if (!open || !socket || !tournamentId || !bracketId) return;

    const room = { tournamentId, bracket: bracketId };

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
  }, [open, socket, tournamentId, bracketId]);

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
    return buildMatchCode(m);
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
      const code = isGlobalCodeString(m?.globalCode)
        ? m.globalCode
        : isGlobalCodeString(m?.code)
        ? m.code
        : fallbackGlobalCode(m);
      return parseTripletFromCode(code) || { v: 999, b: 999, t: 999 };
    };

    out.sort((a, b) => {
      const ta = tripletOf(a);
      const tb = tripletOf(b);
      if (ta.v !== tb.v) return ta.v - tb.v;
      const ga = isGroupLike(a),
        gb = isGroupLike(b);
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
    if (socket && tournamentId && bracketId) {
      socket.emit("scheduler:requestState", {
        tournamentId,
        bracket: bracketId,
      });
    }
  };

  const handleSaveCourts = async () => {
    if (!tournamentId || !bracketId) {
      Alert.alert("Lỗi", "Thiếu tournamentId hoặc bracketId.");
      return;
    }
    const payload =
      mode === "names"
        ? { tournamentId, bracket: bracketId, names, autoAssign }
        : {
            tournamentId,
            bracket: bracketId,
            count: Number(count) || 0,
            autoAssign,
          };
    try {
      await upsertCourts(payload).unwrap();
      Alert.alert(
        "Thành công",
        autoAssign
          ? "Đã lưu danh sách sân. Tự động gán trận đang BẬT."
          : "Đã lưu danh sách sân."
      );
      requestState();
    } catch (e) {
      Alert.alert("Lỗi", e?.data?.message || e?.error || "Lỗi lưu sân");
    }
  };

  const handleBuildQueue = async () => {
    if (!tournamentId || !bracketId) return;
    try {
      const res = await buildQueue({
        tournamentId,
        bracket: bracketId,
      }).unwrap();
      Alert.alert(
        "Thành công",
        `Đã xếp ${res?.totalQueued ?? 0} trận vào hàng đợi.`
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
    if (!tournamentId || !bracketId || !courtId) return;
    socket?.emit?.("scheduler:assignNext", {
      tournamentId,
      courtId,
      bracket: bracketId,
    });
    await assignNextHttp({ tournamentId, courtId, bracket: bracketId })
      .unwrap()
      .catch(() => {});
    requestState();
  };

  const handleResetAll = () => {
    if (!tournamentId || !bracketId) return;
    Alert.alert(
      "Xác nhận",
      "Xoá TẤT CẢ sân và gỡ gán trận hiện tại?",
      [
        { text: "Huỷ", style: "cancel" },
        {
          text: "Đồng ý",
          style: "destructive",
          onPress: () => {
            socket?.emit?.("scheduler:resetAll", {
              tournamentId,
              bracket: bracketId,
            });
            Alert.alert("Đã gửi lệnh", "Hệ thống đang reset tất cả sân.");
            requestState();
          },
        },
      ],
      { cancelable: true }
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
    if (!tournamentId || !bracketId || !assignCourt || !matchId) return;
    socket?.emit?.("scheduler:assignSpecific", {
      tournamentId,
      bracket: bracketId,
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
          />
        )}
        handleIndicatorStyle={{ backgroundColor: t.colors.border }}
        backgroundStyle={{ backgroundColor: t.colors.card }}
      >
        <BottomSheetScrollView contentContainerStyle={styles.container}>
          {/* Header */}
          <Row
            style={{ justifyContent: "space-between", alignItems: "center" }}
          >
            <Row style={{ alignItems: "center", gap: 8 }}>
              <MaterialIcons name="stadium" size={18} color={t.colors.text} />
              <Text style={[styles.title, { color: t.colors.text }]}>
                Quản lý sân — {bracketName || "Bracket"}
                {tournamentName ? ` • ${tournamentName}` : ""}
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
              Cấu hình sân cho giai đoạn
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
                  // Android only; iOS auto-handles thumb
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

            <Row style={{ gap: 8, justifyContent: "flex-start" }}>
              <Btn onPress={handleSaveCourts} disabled={savingCourts}>
                {savingCourts ? "Đang lưu..." : "Lưu danh sách sân"}
              </Btn>
              <Btn variant="outline" onPress={handleResetAll}>
                Reset tất cả
              </Btn>
            </Row>
          </View>

          {/* Queue block */}
          <View
            style={[
              styles.card,
              { backgroundColor: t.colors.card, borderColor: t.colors.border },
            ]}
          >
            <Text style={[styles.cardTitle, { color: t.colors.text }]}>
              Hàng đợi vòng bảng
            </Text>
            <Text style={{ color: t.muted, marginBottom: 8 }}>
              Thuật toán: A1, B1, C1… sau đó A2, B2… (tránh VĐV đang thi đấu/chờ
              sân).
            </Text>
            <Btn onPress={handleBuildQueue} disabled={buildingQueue}>
              {buildingQueue ? "Đang xếp..." : "Xếp hàng đợi"}
            </Btn>
          </View>

          <Divider />

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
                Chưa có sân nào cho giai đoạn này.
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
                return (
                  <View
                    key={c._id || c.id}
                    style={[
                      styles.paperRow,
                      {
                        borderColor: t.colors.border,
                        backgroundColor: t.colors.card,
                      },
                    ]}
                  >
                    <View style={{ gap: 6 }}>
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

                    <Row style={{ gap: 6 }}>
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
                    </Row>
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
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },

  btn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },

  infoBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },

  // tiny switch (custom)
  switch: { paddingVertical: 4, paddingHorizontal: 2 },
  switchTrack: {
    width: 36,
    height: 22,
    borderRadius: 999,
    justifyContent: "center",
  },
  switchThumb: {
    width: 16,
    height: 16,
    borderRadius: 999,
    backgroundColor: "#fff",
  },

  itemRow: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  itemName: { fontWeight: "600" },
});
