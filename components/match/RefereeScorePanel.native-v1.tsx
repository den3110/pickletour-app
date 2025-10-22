// app/screens/PickleBall/match/RefereeJudgePanel.native.jsx
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
  Alert as RNAlert, // ⬅️ NEW
} from "react-native";
import Ripple from "react-native-material-ripple";
import { useWindowDimensions } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import { Image as ExpoImage } from "expo-image";
import {
  useGetMatchQuery,
  useRefereeIncPointMutation,
  useRefereeSetGameScoreMutation,
  useRefereeSetStatusMutation,
  useRefereeSetWinnerMutation,
  useRefereeNextGameMutation,
  useGetCourtsForMatchQuery,
  useRefereeAssignCourtMutation,
  useRefereeUnassignCourtMutation,
} from "@/slices/tournamentsApiSlice";
import { useSocket } from "@/context/SocketContext";
import * as ScreenOrientation from "expo-screen-orientation";
import { useRouter } from "expo-router";
import ImageViewing from "react-native-image-viewing";
import { normalizeUrl } from "@/utils/normalizeUri";
import { Platform } from "react-native";
import SensitiveView from "../SensitiveView";
import * as ScreenCapture from "expo-screen-capture";

/* ===================== utils ===================== */

const getCccdImages = (user) => {
  const front =
    user?.cccdImages?.front ||
    (Array.isArray(user?.cccdImages) ? user.cccdImages[0] : null);
  const back =
    user?.cccdImages?.back ||
    (Array.isArray(user?.cccdImages) ? user.cccdImages[1] : null);
  // Trả về mảng {uri} theo yêu cầu lib
  return [normalizeUrl(front), normalizeUrl(back)]
    .filter(Boolean)
    .map((uri) => ({ uri: String(uri) }));
};

const textOf = (v) => {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
    return String(v);
  if (typeof v === "object")
    return v.name || v.label || v.title || v.message || v.error || "";
  return "";
};

const userIdOf = (u) =>
  String(u?.user?._id || u?.user || u?._id || u?.id || u?.uid || "") || "";

const displayNick = (u) =>
  u?.nickname || u?.nick || u?.shortName || u?.fullName || u?.name || "—";

const playersOf = (reg, eventType = "double") => {
  const et = (eventType || "double").toLowerCase();
  if (!reg) return [];
  if (et === "single") {
    const u = reg.player1 || reg.p1 || reg.user || reg;
    return u ? [u] : [];
  }
  const p1 =
    reg.player1 ||
    reg.p1 ||
    (Array.isArray(reg.players) ? reg.players[0] : null);
  const p2 =
    reg.player2 ||
    reg.p2 ||
    (Array.isArray(reg.players) ? reg.players[1] : null);
  return [p1, p2].filter(Boolean);
};

const pairLabel = (reg, eventType = "double") => {
  if (!reg) return "Chưa có đội";
  const p = playersOf(reg, eventType);
  if (eventType === "single" || p.length < 2) return displayNick(p[0] || reg);
  return `${displayNick(p[0])} & ${displayNick(p[1])}`;
};

const courtLabelOf = (m) => {
  if (!m) return "";
  if (m.court && typeof m.court === "object") return m.court.name || "";
  if (typeof m.courtName === "string") return m.courtName;
  if (m.courtName && typeof m.courtName === "object")
    return m.courtName.name || "";
  return m.courtLabel || "";
};

const needWins = (bestOf = 3) => Math.floor(bestOf / 2) + 1;

const isGameWin = (a = 0, b = 0, ptw = 11, wbt = true) => {
  const max = Math.max(a, b),
    min = Math.min(a, b);
  if (max < ptw) return false;
  return wbt ? max - min >= 2 : max - min >= 1;
};

const currentSlotFromBase = (base, teamScore) =>
  Number(teamScore) % 2 === 0 ? base : base === 1 ? 2 : 1;

const getCurrentSlotOfUser = ({
  user,
  teamKey,
  baseA = {},
  baseB = {},
  scoreA = 0,
  scoreB = 0,
}) => {
  const uid = userIdOf(user);
  const base = teamKey === "A" ? baseA?.[uid] : baseB?.[uid];
  if (!base) return null;
  const ts = teamKey === "A" ? Number(scoreA || 0) : Number(scoreB || 0);
  return currentSlotFromBase(Number(base), ts);
};

const computeEarlyFinalizeScore = (
  curA,
  curB,
  { pointsToWin = 11, winByTwo = true },
  winner
) => {
  const gap = winByTwo ? 2 : 1;
  if (winner === "A") {
    const base = Math.max(pointsToWin, curA, curB + gap);
    return { a: base, b: Math.min(curB, base - gap) };
  } else {
    const base = Math.max(pointsToWin, curB, curA + gap);
    return { a: Math.min(curA, base - gap), b: base };
  }
};

const VI_MATCH_STATUS = {
  scheduled: "Chưa xếp",
  queued: "Trong hàng đợi",
  assigned: "Đã gán sân",
  live: "Đang thi đấu",
  finished: "Đã kết thúc",
};

const statusChip = (s) => {
  const color =
    s === "live"
      ? "#3f3a32ff"
      : s === "assigned"
      ? "#0a84ff"
      : s === "queued"
      ? "#06b6d4"
      : s === "finished"
      ? "#10b981"
      : "#64748b";
  return { label: VI_MATCH_STATUS[s] || s || "—", color };
};

/* ===================== atoms ===================== */

function PlayerMini({ user, slotNow, isServer, isReceiver, onPressSetServer }) {
  return (
    <View style={[s.row, { alignItems: "center", gap: 8 }]}>
      <Pressable onPress={() => onPressSetServer?.(user)} hitSlop={8}>
        <View
          style={[
            s.dotNeutral,
            isServer && s.dotServer,
            !isServer && isReceiver && s.dotReceiver,
          ]}
        />
      </Pressable>

      <View
        style={[
          s.chip,
          {
            backgroundColor: "#f8fafc",
            borderWidth: 1,
            borderColor: "#e5e7eb",
          },
        ]}
      >
        <MaterialIcons name="grid-on" size={12} color="#111827" />
        <Text
          style={{
            marginLeft: 4,
            color: "#0f172a",
            fontWeight: "800",
            fontSize: 11,
          }}
        >
          Ô {slotNow ?? "—"}
        </Text>
      </View>

      <Text style={{ fontSize: 12, fontWeight: "800", color: "#0f172a" }}>
        {displayNick(user)}
      </Text>
    </View>
  );
}

function CourtPickerModal({
  visible,
  onClose,
  matchId,
  currentCourtId,
  onAssigned,
}) {
  const { data, isLoading, isFetching, error, refetch } =
    useGetCourtsForMatchQuery(
      { matchId, includeBusy: false },
      { skip: !visible || !matchId }
    );

  const [assignCourt, { isLoading: assigning }] =
    useRefereeAssignCourtMutation();
  const [unassignCourt] = useRefereeUnassignCourtMutation();

  const courts = data?.items || [];

  const doAssign = async (courtId) => {
    try {
      await assignCourt({ matchId, courtId }).unwrap();
      onAssigned?.({ courtId });
      onClose?.();
    } catch (e) {
      const msg =
        textOf(e?.data?.message) || textOf(e?.error) || "Không thể gán sân";
      Toast.show({ type: "error", text1: "Lỗi", text2: msg });
      onAssigned?.({ error: msg });
    }
  };
  const clearAssign = async () => {
    try {
      await unassignCourt({ matchId }).unwrap();
      onAssigned?.({ courtId: null });
      onClose?.();
    } catch (e) {
      const msg =
        textOf(e?.data?.message) || textOf(e?.error) || "Không thể bỏ gán sân";
      Toast.show({ type: "error", text1: "Lỗi", text2: msg });
      onAssigned?.({ error: msg });
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      supportedOrientations={[
        "portrait",
        "landscape-left",
        "landscape-right",
        "landscape",
      ]}
      presentationStyle="overFullScreen"
    >
      <View style={s.modalBackdrop}>
        <View style={[s.modalCard, { maxWidth: 460 }]}>
          <View style={[s.rowBetween, { marginBottom: 8 }]}>
            <Text style={s.h6}>Gán sân</Text>
            <View style={[s.row, { gap: 6 }]}>
              <Ripple
                onPress={() => refetch()}
                disabled={isLoading || isFetching}
                style={s.iconBtn}
              >
                {isFetching ? (
                  <ActivityIndicator size="small" />
                ) : (
                  <MaterialIcons name="refresh" size={18} color="#111827" />
                )}
              </Ripple>
              <Ripple onPress={onClose} style={s.iconBtn}>
                <MaterialIcons name="close" size={18} color="#111827" />
              </Ripple>
            </View>
          </View>

          {isLoading ? (
            <View style={s.centerBox}>
              <ActivityIndicator />
            </View>
          ) : error ? (
            <View style={s.alertError}>
              <Text style={s.alertText}>
                {textOf(error?.data?.message) ||
                  textOf(error?.error) ||
                  "Lỗi tải danh sách sân"}
              </Text>
            </View>
          ) : !courts.length ? (
            <View style={s.centerBox}>
              <Text>Không có sân khả dụng.</Text>
            </View>
          ) : (
            <View style={{ maxHeight: 360 }}>
              {courts.map((c) => {
                const selected =
                  String(currentCourtId || "") === String(c._id || c.id);
                return (
                  <Ripple
                    key={c._id || c.id}
                    onPress={() => !assigning && doAssign(c._id || c.id)}
                    style={[
                      s.rowBetween,
                      {
                        paddingVertical: 10,
                        borderBottomWidth: 1,
                        borderBottomColor: "#f1f5f9",
                      },
                    ]}
                  >
                    <View style={[s.row, { gap: 8 }]}>
                      <MaterialIcons name="stadium" size={18} color="#111827" />
                      <Text style={{ fontWeight: "700", color: "#0f172a" }}>
                        {textOf(c.name)}
                      </Text>
                    </View>
                    {selected ? (
                      <MaterialIcons
                        name="check-circle"
                        size={18}
                        color="#10b981"
                      />
                    ) : (
                      <MaterialIcons
                        name="chevron-right"
                        size={20}
                        color="#9ca3af"
                      />
                    )}
                  </Ripple>
                );
              })}
            </View>
          )}

          <View style={[s.rowBetween, { marginTop: 10 }]}>
            <Ripple onPress={clearAssign} style={s.btnOutline}>
              <MaterialIcons name="block" size={16} color="#111827" />
              <Text style={s.btnOutlineText}>Bỏ gán sân</Text>
            </Ripple>
            <Ripple onPress={onClose} style={s.btnPrimary}>
              <Text style={s.btnPrimaryText}>Đóng</Text>
            </Ripple>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function CourtSidesSelector({ value, onChange }) {
  const left = value?.left === "B" ? "B" : "A";
  const right = left === "A" ? "B" : "A";
  const swap = () => onChange?.({ left: right, right: left });
  return (
    <View style={[s.row, { gap: 8, flexWrap: "wrap", alignItems: "center" }]}>
      <MaterialIcons name="swap-horiz" size={16} color="#111827" />
      <Text style={{ fontWeight: "700", color: "#0f172a" }}>Vị trí sân</Text>
      <View style={[s.row, { gap: 10, alignItems: "center" }]}>
        <Text style={{ color: "#6b7280" }}>Trái:</Text>
        <View
          style={[
            s.chip,
            {
              backgroundColor: "#f8fafc",
              borderWidth: 1,
              borderColor: "#e5e7eb",
              paddingVertical: 6,
              paddingHorizontal: 10,
            },
          ]}
        >
          <Text style={{ color: "#0f172a", fontWeight: "800", fontSize: 12 }}>
            {left}
          </Text>
        </View>
        <Text style={{ color: "#6b7280" }}>Phải:</Text>
        <View
          style={[
            s.chip,
            {
              backgroundColor: "#f8fafc",
              borderWidth: 1,
              borderColor: "#e5e7eb",
              paddingVertical: 6,
              paddingHorizontal: 10,
            },
          ]}
        >
          <Text style={{ color: "#0f172a", fontWeight: "800", fontSize: 12 }}>
            {right}
          </Text>
        </View>
      </View>
      <Ripple
        onPress={swap}
        style={[s.btnOutline, { paddingVertical: 6, paddingHorizontal: 10 }]}
      >
        <MaterialIcons name="cached" size={14} color="#111827" />
        <Text style={[s.btnOutlineText, { fontSize: 12 }]}>Đổi trái/phải</Text>
      </Ripple>
    </View>
  );
}

function ColorCoinToss({ hidden, onToggle }) {
  const [phase, setPhase] = useState("idle"); // idle|running|done
  const [active, setActive] = useState("blue");
  const [result, setResult] = useState(null);
  const flipRef = useRef(null),
    stopRef = useRef(null),
    startAtRef = useRef(0),
    activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);
  const clearTimers = useCallback(() => {
    if (flipRef.current) {
      clearTimeout(flipRef.current);
      flipRef.current = null;
    }
    if (stopRef.current) {
      clearTimeout(stopRef.current);
      stopRef.current = null;
    }
  }, []);
  useEffect(() => () => clearTimers(), [clearTimers]);

  const tickFlip = useCallback(() => {
    const elapsed = Date.now() - startAtRef.current;
    const delay = Math.round(90 + 700 * Math.min(1, elapsed / 5000));
    setActive((p) => (p === "blue" ? "red" : "blue"));
    flipRef.current = setTimeout(tickFlip, delay);
  }, []);
  const start = useCallback(() => {
    if (phase === "running") return;
    clearTimers();
    setResult(null);
    setPhase("running");
    setActive(Math.random() < 0.5 ? "blue" : "red");
    startAtRef.current = Date.now();
    tickFlip();
    stopRef.current = setTimeout(() => {
      if (flipRef.current) clearTimeout(flipRef.current);
      const finalColor = activeRef.current;
      setPhase("done");
      setResult(finalColor);
      setActive(finalColor);
    }, 5000);
  }, [phase, clearTimers, tickFlip]);
  const reset = useCallback(() => {
    clearTimers();
    setPhase("idle");
    setActive("blue");
    setResult(null);
  }, [clearTimers]);

  if (hidden) {
    return (
      <View style={[s.card, s.rowBetween]}>
        <Text style={s.h6}>Bốc thăm màu</Text>
        <Ripple onPress={onToggle} style={s.btnOutline}>
          <MaterialIcons name="visibility" size={16} color="#111827" />
          <Text style={s.btnOutlineText}>Hiện</Text>
        </Ripple>
      </View>
    );
  }

  const barColor =
    phase === "idle" ? "#e5e7eb" : active === "blue" ? "#0a84ff" : "#ef4444";
  const Panel = ({ kind }) => {
    const label = kind === "blue" ? "ĐỘI XANH" : "ĐỘI ĐỎ";
    const borderColor =
      phase === "done" && result === kind
        ? kind === "blue"
          ? "#0a84ff"
          : "#ef4444"
        : "#e5e7eb";
    const pulse =
      phase === "running" && active === kind
        ? { shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 8 }
        : null;
    return (
      <View style={[s.coinPanel, { borderColor }, pulse]}>
        <Text style={s.coinTitle}>{label}</Text>
        <View
          style={[
            s.chip,
            {
              backgroundColor: (kind === "blue" ? "#0a84ff" : "#ef4444") + "22",
            },
          ]}
        >
          <Text
            style={{
              color: kind === "blue" ? "#0a84ff" : "#ef4444",
              fontWeight: "700",
            }}
          >
            {label}
          </Text>
        </View>
        {phase === "done" && (
          <View
            style={[
              s.badge,
              { backgroundColor: kind === "blue" ? "#0a84ff" : "#ef4444" },
            ]}
          >
            <Text style={{ color: "#fff", fontSize: 10, fontWeight: "800" }}>
              KẾT QUẢ
            </Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={s.card}>
      <View style={[s.rowBetween, { marginBottom: 8 }]}>
        <View
          style={[
            s.topBar,
            { backgroundColor: barColor, flex: 1, marginRight: 10 },
          ]}
        />
        <Ripple onPress={onToggle} style={s.btnOutline}>
          <MaterialIcons name="visibility-off" size={16} color="#111827" />
          <Text style={s.btnOutlineText}>Ẩn</Text>
        </Ripple>
      </View>
      <View style={[s.row, { justifyContent: "center", marginBottom: 8 }]}>
        {phase === "running" && (
          <View style={[s.chip, { backgroundColor: "#0a84ff11" }]}>
            <Text style={{ color: "#0a84ff" }}>
              Đang bốc thăm: {active === "blue" ? "Đội Xanh" : "Đội Đỏ"}
            </Text>
          </View>
        )}
        {phase === "done" && result && (
          <View
            style={[
              s.chip,
              {
                backgroundColor:
                  (result === "blue" ? "#0a84ff" : "#ef4444") + "22",
              },
            ]}
          >
            <Text
              style={{
                color: result === "blue" ? "#0a84ff" : "#ef4444",
                fontWeight: "700",
              }}
            >
              KẾT QUẢ: {result === "blue" ? "Đội Xanh" : "Đội Đỏ"}
            </Text>
          </View>
        )}
      </View>
      <View style={[s.rowBetween, { marginBottom: 8 }]}>
        <Text style={s.h6}>Bốc thăm màu (5s)</Text>
        <View style={s.row}>
          <Ripple
            onPress={start}
            disabled={phase === "running"}
            style={s.btnPrimary}
          >
            <MaterialIcons name="casino" size={16} color="#fff" />
            <Text style={s.btnPrimaryText}>Bắt đầu</Text>
          </Ripple>
          <Ripple
            onPress={reset}
            disabled={phase === "running"}
            style={[s.btnOutline, { marginLeft: 8 }]}
          >
            <MaterialIcons name="restart-alt" size={16} color="#111827" />
            <Text style={s.btnOutlineText}>Reset</Text>
          </Ripple>
        </View>
      </View>
      <View style={[s.row, { gap: 12 }]}>
        <Panel kind="blue" />
        <Panel kind="red" />
      </View>
    </View>
  );
}

/* ========= BaseServeModal: đặt đội/nguời giao + bấm VĐV để set theo người ========= */

/* ===================== MAIN ===================== */
export default function RefereeJudgePanel({
  matchId,
  compact = false,
  onPatched,
}) {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const {
    data: match,
    isLoading,
    isFetching,
    error,
    refetch,
    refetch: refetchDetail,
  } = useGetMatchQuery(matchId, { skip: !matchId });

  const [incPoint] = useRefereeIncPointMutation();
  const [setGame] = useRefereeSetGameScoreMutation();
  const [setStatus] = useRefereeSetStatusMutation();
  const [setWinner] = useRefereeSetWinnerMutation();
  const [nextGame] = useRefereeNextGameMutation();

  const socket = useSocket();
  // ==== Serve optimistic UI ====
  const [uiServe, setUiServe] = useState(null);
  // UI states
  const [autoNextGame, setAutoNextGame] = useState(false);
  const [courtModalOpen, setCourtModalOpen] = useState(false);
  const [infoUser, setInfoUser] = useState(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [coinOpen, setCoinOpen] = useState(false);
  const [baseModalOpen, setBaseModalOpen] = useState(false);
  const [confirmFinishOpen, setConfirmFinishOpen] = useState(false);
  // ⬅️ NEW: chiều cao 2 panel và max cho minHeight
  const [panelHeights, setPanelHeights] = useState({ A: 0, B: 0 });
  const maxPanelHeight = Math.max(panelHeights.A, panelHeights.B) || 0;

  // ⬅️ NEW: reset khi quay màn hình / số VĐV đổi / trạng thái trận đổi
  useEffect(() => {
    setPanelHeights({ A: 0, B: 0 });
  }, [width, height, playersA?.length, playersB?.length, match?.status]);

  // ⬅️ NEW: callback nhận chiều cao đo được từ từng TeamPanel
  const onPanelMeasured = useCallback((sideKey, h) => {
    setPanelHeights((prev) =>
      prev[sideKey] === h ? prev : { ...prev, [sideKey]: h }
    );
  }, []);
  const [infoCollapsed, setInfoCollapsed] = useState(false);

  // left/right (cho phép đổi)
  const [leftRight, setLeftRight] = useState({ left: "A", right: "B" });
  const leftSide = leftRight.left;
  const rightSide = leftRight.right;

  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerImages, setViewerImages] = useState([]);
  const [viewerIndex, setViewerIndex] = useState(0);

  useEffect(() => {
    let active = false;
    const toggle = async () => {
      try {
        if (viewerOpen) {
          await ScreenCapture.preventScreenCaptureAsync(); // chặn capture toàn màn
          active = true;
        } else {
          await ScreenCapture.allowScreenCaptureAsync(); // cho phép lại
          active = false;
        }
      } catch {}
    };
    toggle();
    return () => {
      // phòng trường hợp unmount khi đang bật
      if (active) ScreenCapture.allowScreenCaptureAsync().catch(() => {});
    };
  }, [viewerOpen]);

  // Ghi nhớ lock hiện tại để restore (iOS)
  const prevLockRef = useRef(ScreenOrientation.OrientationLock.PORTRAIT_UP);

  const unlockOrientationForModal = useCallback(async () => {
    try {
      if (Platform.OS !== "ios") return; // crash chủ yếu iOS
      const cur = await ScreenOrientation.getOrientationLockAsync();
      prevLockRef.current =
        cur ?? ScreenOrientation.OrientationLock.PORTRAIT_UP;
      await ScreenOrientation.unlockAsync();
    } catch {}
  }, []);

  const restoreOrientationLock = useCallback(async () => {
    try {
      if (Platform.OS !== "ios") return;
      await ScreenOrientation.lockAsync(
        prevLockRef.current || ScreenOrientation.OrientationLock.PORTRAIT_UP
      );
    } catch {}
  }, []);

  const openCccd = useCallback(async (user, startIndex = 0) => {
    const imgs = getCccdImages(user);
    if (!imgs.length) {
      Toast.show({ type: "info", text1: "Không có ảnh CCCD" });
      return;
    }
    await unlockOrientationForModal(); // ⬅️ rất quan trọng trên iOS
    // Cho iOS một nhịp để settle orientation trước khi present modal
    setTimeout(() => {
      setViewerImages(imgs);
      setViewerIndex(Math.min(startIndex, imgs.length - 1));
      setViewerOpen(true);
    }, 40);
  }, []);

  // Khi unmount screen: luôn lock lại về orientation trước đó
  useEffect(() => {
    return () => {
      restoreOrientationLock();
    };
  }, [restoreOrientationLock]);

  // Khi viewer đóng bằng bất kỳ cách nào: lock lại
  useEffect(() => {
    if (!viewerOpen) {
      restoreOrientationLock();
    }
  }, [viewerOpen, restoreOrientationLock]);

  // ===== derive =====
  const rules = match?.rules || { bestOf: 1, pointsToWin: 11, winByTwo: true };
  const isBestOfOne = Number(rules?.bestOf || 1) <= 1; // ⬅️ thêm dòng này
  const isStartDisabled = match?.status === "live";
  const isFinishDisabled = match?.status === "finished";
  const COLOR_ENABLED = "#111827";
  const COLOR_DISABLED = "#9ca3af";

  const eventType = (match?.tournament?.eventType || "double").toLowerCase();
  const gs = match?.gameScores || [];
  const needSetWinsVal = needWins(rules.bestOf);
  const currentIndex = Math.max(0, gs.length - 1);
  const curA = gs[currentIndex]?.a ?? 0;
  const curB = gs[currentIndex]?.b ?? 0;

  const playersA = useMemo(
    () => playersOf(match?.pairA, eventType),
    [match?.pairA, eventType]
  );
  const playersB = useMemo(
    () => playersOf(match?.pairB, eventType),
    [match?.pairB, eventType]
  );

  // base slots (from server → defaults)
  const slotsBase = match?.slots?.base || match?.meta?.slots?.base || {};
  const baseA = useMemo(() => {
    const raw = slotsBase?.A || {};
    const out = { ...raw };
    const ids = playersA.map(userIdOf);
    if (ids[0] && !out[ids[0]]) out[ids[0]] = 1;
    if (ids[1] && !out[ids[1]]) out[ids[1]] = 2;
    return out;
  }, [slotsBase?.A, playersA]);
  const baseB = useMemo(() => {
    const raw = slotsBase?.B || {};
    const out = { ...raw };
    const ids = playersB.map(userIdOf);
    if (ids[0] && !out[ids[0]]) out[ids[0]] = 1;
    if (ids[1] && !out[ids[1]]) out[ids[1]] = 2;
    return out;
  }, [slotsBase?.B, playersB]);

  // slot now
  const slotsNowA = useMemo(() => {
    const o = {};
    playersA.forEach((u) => {
      o[userIdOf(u)] = getCurrentSlotOfUser({
        user: u,
        teamKey: "A",
        baseA,
        baseB,
        scoreA: curA,
        scoreB: curB,
      });
    });
    return o;
  }, [playersA, baseA, baseB, curA, curB]);

  const slotsNowB = useMemo(() => {
    const o = {};
    playersB.forEach((u) => {
      o[userIdOf(u)] = getCurrentSlotOfUser({
        user: u,
        teamKey: "B",
        baseA,
        baseB,
        scoreA: curA,
        scoreB: curB,
      });
    });
    return o;
  }, [playersB, baseA, baseB, curA, curB]);

  // Lấy uid đang đứng ở Ô 1/2 của đội ở thời điểm hiện tại
  const getUidAtSlotNow = useCallback(
    (teamKey, slotNum) => {
      const map = teamKey === "A" ? slotsNowA : slotsNowB;
      if (!map) return null;
      const entry = Object.entries(map).find(
        ([, v]) => Number(v) === Number(slotNum)
      );
      return entry ? entry[0] : null;
    },
    [slotsNowA, slotsNowB]
  );

  // serve state
  // serve từ server
  const serve = match?.serve || { side: "A", server: 2 };

  // Ưu tiên trạng thái đang hiển thị (optimistic) nếu có
  const activeSide = (uiServe?.side ?? serve?.side) === "B" ? "B" : "A";
  const activeServerNum =
    Number(uiServe?.server ?? serve?.server) === 1 ? 1 : 2;

  // Biến dùng cho UI
  const servingSide = activeSide;
  const serverNumNow = activeServerNum;

  // UID từ server; nếu đang optimistic thì suy ra từ Ô hiện tại
  const serverUidSrv = String(serve?.serverId || "");
  const receiverUidSrv = String(serve?.receiverId || "");
  const serverUidShow = uiServe
    ? getUidAtSlotNow(activeSide, activeServerNum) || ""
    : serverUidSrv;
  const receiverUidShow = uiServe
    ? getUidAtSlotNow(activeSide === "A" ? "B" : "A", 1) ||
      getUidAtSlotNow(activeSide === "A" ? "B" : "A", 2) ||
      ""
    : receiverUidSrv;

  // Khi server đã trả serve mới → bỏ optimistic
  useEffect(() => {
    setUiServe(null);
  }, [serve?.side, serve?.server]);

  const gameDone = isGameWin(curA, curB, rules.pointsToWin, rules.winByTwo);
  const aWins = gs.filter(
    (g) => isGameWin(g?.a, g?.b, rules.pointsToWin, rules.winByTwo) && g.a > g.b
  ).length;
  const bWins = gs.filter(
    (g) => isGameWin(g?.a, g?.b, rules.pointsToWin, rules.winByTwo) && g.b > g.a
  ).length;
  const matchPointReached =
    aWins === needSetWinsVal || bWins === needSetWinsVal;

  // ===== socket =====
  useEffect(() => {
    if (!socket || !matchId) return;
    const handlePatchedEvent = (p) => {
      const id = p?.matchId || p?.data?._id || p?._id;
      if (String(id) === String(matchId)) {
        refetch();
        onPatched?.();
      }
    };
    socket.emit("match:join", { matchId });
    socket.on("status:updated", handlePatchedEvent);
    socket.on("score:updated", handlePatchedEvent);
    socket.on("winner:updated", handlePatchedEvent);
    socket.on("match:patched", handlePatchedEvent);
    // socket.on("match:update", handlePatchedEvent);
    socket.on("match:snapshot", handlePatchedEvent);
    return () => {
      socket.emit("match:leave", { matchId });
      socket.off("status:updated", handlePatchedEvent);
      socket.off("score:updated", handlePatchedEvent);
      socket.off("winner:updated", handlePatchedEvent);
      socket.off("match:patched", handlePatchedEvent);
      //   socket.off("match:update", handlePatchedEvent);
      socket.off("match:snapshot", handlePatchedEvent);
    };
  }, [socket, matchId, refetch, onPatched]);

  // ===== actions =====
  const onStart = async () => {
    if (!match) return;
    try {
      await setStatus({ matchId: match._id, status: "live" }).unwrap();
      socket?.emit("status:updated", { matchId: match._id, status: "live" });
      if (gs.length === 0) {
        await setGame({
          matchId: match._id,
          gameIndex: 0,
          a: 0,
          b: 0,
          autoNext: autoNextGame,
        }).unwrap();
      }
    } catch (e) {
      Toast.show({
        type: "error",
        text1: "Lỗi",
        text2:
          textOf(e?.data?.message) || textOf(e?.error) || "Không thể start",
      });
    }
  };

  const finishMatch = async (winner) => {
    if (!match) return;
    try {
      if (winner) await setWinner({ matchId: match._id, winner }).unwrap();
      await setStatus({ matchId: match._id, status: "finished" }).unwrap();
      socket?.emit("status:updated", {
        matchId: match._id,
        status: "finished",
        winner,
      });
      setConfirmFinishOpen(false);
    } catch (e) {
      Toast.show({
        type: "error",
        text1: "Lỗi",
        text2:
          textOf(e?.data?.message) || textOf(e?.error) || "Không thể finish",
      });
    }
  };

  // ⬅️ NEW: Bấm "Kết thúc" → nếu đủ set thì hỏi bằng Alert, chưa đủ set thì mở modal chọn winner
  const onPressFinish = () => {
    if (!match || match.status === "finished") return;
    // đã tính sẵn aWins/bWins/needSetWinsVal ở trên
    const winnerBySets =
      aWins >= needSetWinsVal ? "A" : bWins >= needSetWinsVal ? "B" : "";
    const canFinishNormally = !!winnerBySets;

    if (canFinishNormally) {
      RNAlert.alert(
        "Kết thúc trận?",
        `Xác nhận kết thúc với kết quả: Đội ${winnerBySets} (A ${aWins} — B ${bWins}).`,
        [
          { text: "Huỷ", style: "cancel" },
          {
            text: "Kết thúc",
            style: "destructive",
            onPress: () => finishMatch(winnerBySets),
          },
        ]
      );
    } else {
      // chưa đủ set thắng → coi như kết thúc sớm (ngoại lệ) → mở modal để chọn winner/đóng
      setConfirmFinishOpen(true);
    }
  };

  const inc = async (side) => {
    if (!match || match.status !== "live") return;
    try {
      await incPoint({
        matchId: match._id,
        side,
        delta: +1,
        autoNext: autoNextGame,
      }).unwrap();
      socket?.emit("score:inc", {
        matchId: match._id,
        side,
        delta: +1,
        autoNext: autoNextGame,
      });
    } catch (e) {
      Toast.show({
        type: "error",
        text1: "Lỗi",
        text2:
          textOf(e?.data?.message) || textOf(e?.error) || "Không thể cộng điểm",
      });
    }
  };

  const dec = async (side) => {
    if (!match || match.status === "finished") return;
    try {
      await incPoint({
        matchId: match._id,
        side,
        delta: -1,
        autoNext: autoNextGame,
      }).unwrap();
      socket?.emit("score:inc", {
        matchId: match._id,
        side,
        delta: -1,
        autoNext: autoNextGame,
      });
    } catch (e) {
      Toast.show({
        type: "error",
        text1: "Lỗi",
        text2:
          textOf(e?.data?.message) || textOf(e?.error) || "Không thể trừ điểm",
      });
    }
  };

  const startNextGame = async () => {
    if (!match) return;
    try {
      await nextGame({ matchId: match._id, autoNext: autoNextGame }).unwrap();
      await refetch();
      socket?.emit("match:patched", {
        matchId: match._id,
        autoNext: autoNextGame,
      });
    } catch (e) {
      Toast.show({
        type: "error",
        text1: "Lỗi",
        text2:
          textOf(e?.data?.message) ||
          textOf(e?.error) ||
          "Không thể tạo ván mới",
      });
    }
  };

  const [earlyOpen, setEarlyOpen] = useState(false);
  const [earlyWinner, setEarlyWinner] = useState("A");
  const [useCurrentScore, setUseCurrentScore] = useState(false);

  const onClickStartNext = () => {
    if (!match) return;
    if (autoNextGame) return startNextGame();
    if (isGameWin(curA, curB, rules.pointsToWin, rules.winByTwo)) {
      startNextGame();
    } else {
      setEarlyWinner("A");
      setUseCurrentScore(false);
      setEarlyOpen(true);
    }
  };

  const confirmEarlyEnd = async () => {
    if (!match) return;
    try {
      if (useCurrentScore) {
        if (curA === curB) {
          Toast.show({
            type: "error",
            text1: "Đang hòa, không thể ghi nhận đúng tỉ số hiện tại.",
          });
          return;
        }
        await setGame({
          matchId: match._id,
          gameIndex: currentIndex,
          a: curA,
          b: curB,
          autoNext: autoNextGame,
        }).unwrap();
      } else {
        const winner = curA === curB ? earlyWinner : curA > curB ? "A" : "B";
        const fin = computeEarlyFinalizeScore(curA, curB, rules, winner);
        await setGame({
          matchId: match._id,
          gameIndex: currentIndex,
          a: fin.a,
          b: fin.b,
          autoNext: autoNextGame,
        }).unwrap();
      }
      await nextGame({ matchId: match._id, autoNext: autoNextGame }).unwrap();
      socket?.emit("match:patched", {
        matchId: match._id,
        autoNext: autoNextGame,
      });
      setEarlyOpen(false);
      Toast.show({
        type: "success",
        text1: `Đã chốt ván #${currentIndex + 1}`,
      });
    } catch (e) {
      Toast.show({
        type: "error",
        text1: "Lỗi",
        text2:
          textOf(e?.data?.message) ||
          textOf(e?.error) ||
          "Không thể kết thúc ván sớm",
      });
    }
  };

  // đặt serve
  // Đặt giao thông minh: tự map serverId theo Ô (và parity điểm nếu không truyền server)
  const setServeSmart = useCallback(
    ({ side, server } = {}) => {
      if (!match?._id) return;

      // Đội đang giao hiện tại (ưu tiên uiServe nếu đang optimistic)
      const currentActiveSide =
        (uiServe?.side ?? serve?.side) === "B" ? "B" : "A";

      // Side muốn đặt: nếu truyền thì dùng, không thì giữ như hiện tại
      const sideNorm =
        side != null
          ? String(side).toUpperCase() === "B"
            ? "B"
            : "A"
          : currentActiveSide;

      const teamScore =
        sideNorm === "A" ? Number(curA || 0) : Number(curB || 0);

      // ---- QUAN TRỌNG: nếu có đổi đội (sideNorm khác currentActiveSide) → mặc định #1
      let serverNorm;
      if (server != null && Number.isFinite(Number(server))) {
        // Nếu bạn bấm nút "Người #1/#2" thì dùng đúng lựa chọn đó
        serverNorm = Number(server);
      } else if (side != null && sideNorm !== currentActiveSide) {
        // Vừa chuyển đội giao A↔B → luôn chọn Người #1
        serverNorm = 1;
      } else {
        // Không đổi đội → giữ logic cũ theo parity điểm
        serverNorm = teamScore % 2 === 0 ? 1 : 2;
      }

      // Suy ra đúng uid theo Ô hiện tại
      const serverId =
        getUidAtSlotNow(sideNorm, serverNorm) ||
        getUidAtSlotNow(sideNorm, serverNorm === 1 ? 2 : 1) ||
        "";

      const otherSide = sideNorm === "A" ? "B" : "A";
      const receiverId =
        getUidAtSlotNow(otherSide, 1) || getUidAtSlotNow(otherSide, 2) || "";

      // Optimistic UI
      setUiServe({ side: sideNorm, server: serverNorm });

      socket?.emit(
        "serve:set",
        {
          matchId: match._id,
          side: sideNorm,
          server: serverNorm,
          serverId,
          receiverId,
        },
        (ack) => {
          if (!ack?.ok) {
            setUiServe(null); // rollback
            const msg = textOf(ack?.message) || "Không đặt được giao bóng";
            Toast.show({ type: "error", text1: "Lỗi", text2: msg });
          } else {
            refetch();
          }
        }
      );
    },
    [
      match?._id,
      serve?.side,
      uiServe?.side,
      curA,
      curB,
      getUidAtSlotNow,
      socket,
      refetch,
    ]
  );

  // Bấm vào VĐV → set server theo Ô hiện tại của VĐV đó
  const setServerByUser = useCallback(
    (user, teamKey) => {
      if (!match?._id) return;
      const uid = userIdOf(user);
      const side =
        teamKey || (playersA.some((u) => userIdOf(u) === uid) ? "A" : "B");

      // Suy Ô hiện tại để ra #server
      const slotNow =
        side === "A"
          ? Number(slotsNowA?.[uid] || 1)
          : Number(slotsNowB?.[uid] || 1);
      const serverNum = slotNow === 2 ? 2 : 1;

      setUiServe({ side, server: serverNum }); // optimistic
      socket?.emit(
        "serve:set",
        { matchId: match._id, side, server: serverNum, serverId: uid },
        (ack) => {
          if (!ack?.ok) {
            setUiServe(null);
            const msg = textOf(ack?.message) || "Không đặt được người giao";
            Toast.show({ type: "error", text1: "Lỗi", text2: msg });
          } else {
            refetch();
          }
        }
      );
    },
    [match?._id, playersA, slotsNowA, slotsNowB, socket, refetch]
  );

  const callout =
    eventType === "single"
      ? ""
      : activeSide === "A"
      ? `${curA}-${curB}-${serverNumNow}`
      : `${curB}-${curA}-${serverNumNow}`;

  const toggleOrientation = async () => {
    try {
      if (isLandscape) {
        await ScreenOrientation.lockAsync(
          ScreenOrientation.OrientationLock.PORTRAIT_UP
        );
      } else {
        await ScreenOrientation.lockAsync(
          ScreenOrientation.OrientationLock.LANDSCAPE
        );
      }
    } catch {
      Toast.show({
        type: "error",
        text1: "Lỗi",
        text2: "Không thể đổi hướng màn hình",
      });
    }
  };

  const handleClose = useCallback(async () => {
    try {
      await ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.PORTRAIT_UP
      );
    } catch {}
    router.back();
  }, [router]);

  const anyModalOpen =
    courtModalOpen ||
    infoOpen ||
    baseModalOpen ||
    confirmFinishOpen ||
    earlyOpen ||
    viewerOpen ||
    coinOpen; // ⬅️ THÊM

  function BaseSlotsModal({ visible, onClose }) {
    const [sideServe, setSideServe] = useState(servingSide || "A");
    const [serverNum, setServerNum] = useState(2); // 0-0-2 mặc định
    // clone base hiện có làm state tạm
    const [baseLocalA, setBaseLocalA] = useState(() => ({ ...baseA }));
    const [baseLocalB, setBaseLocalB] = useState(() => ({ ...baseB }));

    useEffect(() => {
      if (visible) {
        setSideServe(servingSide || "A");
        setServerNum(2);
        setBaseLocalA({ ...baseA });
        setBaseLocalB({ ...baseB });
      }
    }, [visible]);

    const setSlot = (team, uid, val) => {
      const set = team === "A" ? setBaseLocalA : setBaseLocalB;
      set((prev) => ({ ...prev, [uid]: val }));
    };

    const ensureValid = (list, obj) => {
      // mỗi team phải có đúng một Ô1 và một Ô2 (nếu đôi)
      if (list.length <= 1) return true;
      const vals = list.map((u) => obj[userIdOf(u)]).filter(Boolean);
      const c1 = vals.filter((v) => v === 1).length;
      const c2 = vals.filter((v) => v === 2).length;
      return c1 === 1 && c2 === 1;
    };

    const onSave = () => {
      try {
        const okA = ensureValid(playersA, baseLocalA);
        const okB = ensureValid(playersB, baseLocalB);
        if (!okA || !okB) {
          Toast.show({
            type: "error",
            text1: "Lỗi",
            text2: "Mỗi đội phải có 1 người Ô1 và 1 người Ô2.",
          });
          return;
        }
        // serverId = người ở Ô1 của sideServe theo parity hiện tại (điểm 0 => chẵn)
        const list = sideServe === "A" ? playersA : playersB;
        let chooseServer = null;
        for (const u of list) {
          const uid = userIdOf(u);
          const val = (sideServe === "A" ? baseLocalA : baseLocalB)[uid];
          if (val === 1) {
            chooseServer = uid;
            break;
          }
        }
        if (!chooseServer) {
          Toast.show({
            type: "error",
            text1: "Lỗi",
            text2: "Không tìm thấy người Ô1 ở đội giao.",
          });

          return;
        }

        // Gửi socket set base + serve
        socket?.emit(
          "slots:setBase",
          {
            matchId: match._id,
            base: { A: baseLocalA, B: baseLocalB },
          },
          (ack1) => {
            if (!ack1?.ok) {
              Toast.show({
                type: "error",
                text1: "Lỗi",
                text2: ack1?.message || "Không lưu được ô gốc",
              });

              return;
            }
            socket?.emit(
              "serve:set",
              {
                matchId: match._id,
                side: sideServe,
                server: serverNum, // 0-0-2
                serverId: chooseServer,
              },
              (ack2) => {
                if (ack2?.ok) {
                  refetchDetail();
                  Toast.show({
                    type: "success",
                    text1: "Đã lưu ô & người phát đầu.",
                  });
                } else {
                  Toast.show({
                    type: "error",
                    text1: "Lỗi",
                    text2: ack2?.message || "Không đặt người phát",
                  });
                }
              }
            );
          }
        );
      } catch (e) {
        console.log(e);
      }
    };

    const RenderTeam = ({ teamKey, list, base, setBase }) => (
      <View style={{ flex: 1 }}>
        <Text style={[s.h6, { marginBottom: 6 }]}>Đội {teamKey}</Text>
        {list.length ? (
          list.map((u) => {
            const uid = userIdOf(u);
            const cur = Number(base[uid] || 0);
            return (
              <View
                key={uid}
                style={[s.rowBetween, { paddingVertical: 6, gap: 8 }]}
              >
                <Text style={{ fontWeight: "700", color: "#0f172a" }}>
                  {displayNick(u)}
                </Text>
                <View style={[styles.row, { gap: 6 }]}>
                  <Ripple
                    onPress={() => setBase(uid, 1)}
                    style={[
                      s.btnOutline,
                      { paddingVertical: 4, paddingHorizontal: 10 },
                      cur === 1 && s.btnOutlineActive,
                    ]}
                  >
                    <Text
                      style={[
                        s.btnOutlineText,
                        { fontSize: 12 },
                        cur === 1 && s.btnOutlineTextActive,
                      ]}
                    >
                      Ô 1
                    </Text>
                  </Ripple>
                  <Ripple
                    onPress={() => setBase(uid, 2)}
                    style={[
                      s.btnOutline,
                      { paddingVertical: 4, paddingHorizontal: 10 },
                      cur === 2 && s.btnOutlineActive,
                    ]}
                  >
                    <Text
                      style={[
                        s.btnOutlineText,
                        { fontSize: 12 },
                        cur === 2 && s.btnOutlineTextActive,
                      ]}
                    >
                      Ô 2
                    </Text>
                  </Ripple>
                </View>
              </View>
            );
          })
        ) : (
          <Text className="caption">—</Text>
        )}
      </View>
    );

    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onClose}
        supportedOrientations={[
          "portrait",
          "landscape",
          "landscape-left",
          "landscape-right",
        ]}
        presentationStyle="overFullScreen"
      >
        <View style={s.modalBackdrop}>
          <View style={[s.modalCard, { maxWidth: 560 }]}>
            <View style={[s.rowBetween, { marginBottom: 8 }]}>
              <Text style={s.h6}>Thiết lập Ô (1/2) & Người phát đầu</Text>
              <Ripple onPress={onClose} style={s.iconBtn}>
                <MaterialIcons name="close" size={18} color="#111827" />
              </Ripple>
            </View>

            <View style={[s.row, { gap: 12, alignItems: "flex-start" }]}>
              <RenderTeam
                teamKey="A"
                list={playersA}
                base={baseLocalA}
                setBase={(uid, val) => setSlot("A", uid, val)}
              />
              <RenderTeam
                teamKey="B"
                list={playersB}
                base={baseLocalB}
                setBase={(uid, val) => setSlot("B", uid, val)}
              />
            </View>

            <View style={[s.row, { gap: 8, marginTop: 12, flexWrap: "wrap" }]}>
              <Text style={{ fontWeight: "700" }}>Đội giao đầu:</Text>
              <Ripple
                onPress={() => setSideServe("A")}
                style={[s.btnOutline, sideServe === "A" && s.btnOutlineActive]}
              >
                <Text
                  style={[
                    s.btnOutlineText,
                    sideServe === "A" && s.btnOutlineTextActive,
                  ]}
                >
                  A
                </Text>
              </Ripple>
              <Ripple
                onPress={() => setSideServe("B")}
                style={[s.btnOutline, sideServe === "B" && s.btnOutlineActive]}
              >
                <Text
                  style={[
                    s.btnOutlineText,
                    sideServe === "B" && s.btnOutlineTextActive,
                  ]}
                >
                  B
                </Text>
              </Ripple>

              <Text style={{ marginLeft: 8, color: "#6b7280" }}>
                Số người giao:
              </Text>
              <Ripple
                onPress={() => setServerNum(1)}
                style={[s.btnOutline, serverNum === 1 && s.btnOutlineActive]}
              >
                <Text
                  style={[
                    s.btnOutlineText,
                    serverNum === 1 && s.btnOutlineTextActive,
                  ]}
                >
                  #1
                </Text>
              </Ripple>
              <Ripple
                onPress={() => setServerNum(2)}
                style={[s.btnOutline, serverNum === 2 && s.btnOutlineActive]}
              >
                <Text
                  style={[
                    s.btnOutlineText,
                    serverNum === 2 && s.btnOutlineTextActive,
                  ]}
                >
                  #2 (0-0-2)
                </Text>
              </Ripple>
            </View>

            <View style={[s.rowBetween, { marginTop: 12 }]}>
              <Ripple onPress={onClose} style={s.btnOutline}>
                <Text style={s.btnOutlineText}>Huỷ</Text>
              </Ripple>
              <Ripple
                onPress={() => {
                  onSave();
                  onClose();
                }}
                style={s.btnPrimary}
              >
                <MaterialIcons name="save" size={16} color="#fff" />
                <Text style={s.btnPrimaryText}>Lưu</Text>
              </Ripple>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  /* ===================== render ===================== */
  if (isLoading && !match)
    return (
      <View style={s.centerBox}>
        <ActivityIndicator />
      </View>
    );
  if (error)
    return (
      <View style={s.alertError}>
        <Text style={s.alertText}>
          {textOf(error?.data?.message) ||
            textOf(error?.error) ||
            "Lỗi tải trận"}
        </Text>
      </View>
    );

  if (!match) return null;

  return (
    <View style={{ gap: 12 }}>
      {/* Scoreboard */}
      <View style={[s.card, { padding: 10 }]}>
        <View style={{ flexDirection: "column", gap: 8 }}>
          <View
            style={{
              display: "flex",
              alignItems: "center",
              flexDirection: "row",
              gap: 5,
            }}
          >
            <TeamPanel
              sideKey={leftSide}
              equalMinHeight={maxPanelHeight} // ⬅️ NEW
              onMeasured={onPanelMeasured} // ⬅️ NEW
            />
            {isLandscape && (
              <View
                style={[
                  s.teamCard,
                  { alignItems: "center", justifyContent: "center", gap: 8 },
                ]}
              >
                <CourtSidesSelector value={leftRight} onChange={setLeftRight} />

                {eventType !== "single" && (
                  <>
                    <View style={[s.chip, { backgroundColor: "#0a84ff11" }]}>
                      <Text
                        style={{
                          color: "#0a84ff",
                          fontWeight: "700",
                          fontSize: 12,
                        }}
                      >
                        Cách đọc: {callout || "—"}
                      </Text>
                    </View>
                    <View
                      style={[
                        s.row,
                        { gap: 6, flexWrap: "wrap", justifyContent: "center" },
                      ]}
                    >
                      <Ripple
                        onPress={() => {
                          setServeSmart({ side: "A" });
                          Toast.show({
                            type: "success",
                            text1: "Đã đặt đội giao: A",
                          });
                        }}
                        style={[
                          s.btnOutline,
                          activeSide === "A" && s.btnOutlineActive,
                        ]}
                      >
                        <Text
                          style={[
                            s.btnOutlineText,
                            activeSide === "A" && s.btnOutlineTextActive,
                          ]}
                        >
                          Giao: A
                        </Text>
                      </Ripple>
                      <Ripple
                        onPress={() => {
                          setServeSmart({ side: "B" });
                          Toast.show({
                            type: "success",
                            text1: "Đã đặt đội giao: B",
                          });
                        }}
                        style={[
                          s.btnOutline,
                          activeSide === "B" && s.btnOutlineActive,
                        ]}
                      >
                        <Text
                          style={[
                            s.btnOutlineText,
                            activeSide === "B" && s.btnOutlineTextActive,
                          ]}
                        >
                          Giao: B
                        </Text>
                      </Ripple>
                      <Ripple
                        onPress={() => {
                          setServeSmart({ side: servingSide, server: 1 });
                          Toast.show({
                            type: "success",
                            text1: "Đã đặt người giao: #1",
                          });
                        }}
                        style={[
                          s.btnOutline,
                          activeServerNum === 1 && s.btnOutlineActive,
                        ]}
                      >
                        <Text
                          style={[
                            s.btnOutlineText,
                            activeServerNum === 1 && s.btnOutlineTextActive,
                          ]}
                        >
                          Người #1
                        </Text>
                      </Ripple>
                      <Ripple
                        onPress={() => {
                          setServeSmart({ side: servingSide, server: 2 });
                          Toast.show({
                            type: "success",
                            text1: "Đã đặt người giao: #2",
                          });
                        }}
                        style={[
                          s.btnOutline,
                          activeServerNum === 2 && s.btnOutlineActive,
                        ]}
                      >
                        <Text
                          style={[
                            s.btnOutlineText,
                            activeServerNum === 2 && s.btnOutlineTextActive,
                          ]}
                        >
                          Người #2
                        </Text>
                      </Ripple>
                    </View>
                  </>
                )}

                <View
                  style={[
                    s.row,
                    {
                      gap: 10,
                      flexWrap: "wrap",
                      justifyContent: "center",
                      marginTop: 6,
                    },
                  ]}
                >
                  <View style={[s.row, { gap: 6, alignItems: "center" }]}>
                    <Switch
                      value={autoNextGame}
                      onValueChange={setAutoNextGame}
                    />
                    <Text style={{ fontSize: 13 }}>
                      Tự động sang ván tiếp theo
                    </Text>
                  </View>

                  {!isBestOfOne && (
                    <Ripple
                      onPress={onClickStartNext}
                      disabled={match?.status === "finished"}
                      style={[
                        s.btnPrimary,
                        match?.status === "finished" && s.btnDisabled,
                      ]}
                    >
                      <Text style={s.btnPrimaryText}>
                        Bắt đầu ván tiếp theo
                      </Text>
                    </Ripple>
                  )}
                  <Ripple
                    onPress={async () => {
                      await unlockOrientationForModal(); // ⬅️ dùng helper sẵn có (iOS an toàn hơn)
                      setCoinOpen(true);
                    }}
                    style={s.btnOutline}
                  >
                    <MaterialIcons name="casino" size={16} color="#111827" />
                    <Text style={s.btnOutlineText}>Bốc thăm màu</Text>
                  </Ripple>

                  {match?.status === "live" ? (
                    <Ripple
                      onPress={onPressFinish}
                      disabled={match?.status === "finished"}
                      style={[
                        s.btnDanger,
                        match?.status === "finished" && s.btnDisabled,
                      ]}
                    >
                      <MaterialIcons name="stop" size={16} color="#fff" />
                      <Text style={s.btnDangerText}>Kết thúc trận</Text>
                    </Ripple>
                  ) : !isFinishDisabled ? (
                    <Ripple onPress={onStart} style={s.btnSuccess}>
                      <MaterialIcons name="play-arrow" size={16} color="#fff" />
                      <Text style={s.btnSuccessText}>Bắt đầu trận</Text>
                    </Ripple>
                  ) : null}
                </View>
              </View>
            )}
            <TeamPanel
              sideKey={rightSide}
              equalMinHeight={maxPanelHeight} // ⬅️ NEW
              onMeasured={onPanelMeasured} // ⬅️ NEW
            />
          </View>
          {!isLandscape && (
            <View
              style={[
                s.teamCard,
                { alignItems: "center", justifyContent: "center", gap: 8 },
              ]}
            >
              <CourtSidesSelector value={leftRight} onChange={setLeftRight} />

              {eventType !== "single" && (
                <>
                  <View style={[s.chip, { backgroundColor: "#0a84ff11" }]}>
                    <Text
                      style={{
                        color: "#0a84ff",
                        fontWeight: "700",
                        fontSize: 12,
                      }}
                    >
                      Cách đọc: {callout || "—"}
                    </Text>
                  </View>
                  <View
                    style={[
                      s.row,
                      { gap: 6, flexWrap: "wrap", justifyContent: "center" },
                    ]}
                  >
                    <Ripple
                      onPress={() => {
                        setServeSmart({ side: "A" });
                        Toast.show({
                          type: "success",
                          text1: "Đã đặt đội giao: A",
                        });
                      }}
                      style={[
                        s.btnOutline,
                        activeSide === "A" && s.btnOutlineActive,
                      ]}
                    >
                      <Text
                        style={[
                          s.btnOutlineText,
                          activeSide === "A" && s.btnOutlineTextActive,
                        ]}
                      >
                        Giao: A
                      </Text>
                    </Ripple>
                    <Ripple
                      onPress={() => {
                        setServeSmart({ side: "B" });
                        Toast.show({
                          type: "success",
                          text1: "Đã đặt đội giao: B",
                        });
                      }}
                      style={[
                        s.btnOutline,
                        activeSide === "B" && s.btnOutlineActive,
                      ]}
                    >
                      <Text
                        style={[
                          s.btnOutlineText,
                          activeSide === "B" && s.btnOutlineTextActive,
                        ]}
                      >
                        Giao: B
                      </Text>
                    </Ripple>
                    <Ripple
                      onPress={() => {
                        setServeSmart({ side: servingSide, server: 1 });
                        Toast.show({
                          type: "success",
                          text1: "Đã đặt người giao: #1",
                        });
                      }}
                      style={[
                        s.btnOutline,
                        activeServerNum === 1 && s.btnOutlineActive,
                      ]}
                    >
                      <Text
                        style={[
                          s.btnOutlineText,
                          activeServerNum === 1 && s.btnOutlineTextActive,
                        ]}
                      >
                        Người #1
                      </Text>
                    </Ripple>
                    <Ripple
                      onPress={() => {
                        setServeSmart({ side: servingSide, server: 2 });
                        Toast.show({
                          type: "success",
                          text1: "Đã đặt người giao: #2",
                        });
                      }}
                      style={[
                        s.btnOutline,
                        activeServerNum === 2 && s.btnOutlineActive,
                      ]}
                    >
                      <Text
                        style={[
                          s.btnOutlineText,
                          activeServerNum === 2 && s.btnOutlineTextActive,
                        ]}
                      >
                        Người #2
                      </Text>
                    </Ripple>
                  </View>
                </>
              )}

              <View
                style={[
                  s.row,
                  {
                    gap: 10,
                    flexWrap: "wrap",
                    justifyContent: "center",
                    marginTop: 6,
                  },
                ]}
              >
                <View style={[s.row, { gap: 6, alignItems: "center" }]}>
                  <Switch
                    value={autoNextGame}
                    onValueChange={setAutoNextGame}
                  />
                  <Text style={{ fontSize: 13 }}>
                    Tự động sang ván tiếp theo
                  </Text>
                </View>

                {!isBestOfOne && (
                  <Ripple
                    onPress={onClickStartNext}
                    disabled={match?.status === "finished"}
                    style={[
                      s.btnPrimary,
                      match?.status === "finished" && s.btnDisabled,
                    ]}
                  >
                    <Text style={s.btnPrimaryText}>Bắt đầu ván tiếp theo</Text>
                  </Ripple>
                )}
                <Ripple
                  onPress={async () => {
                    await unlockOrientationForModal(); // ⬅️ dùng helper sẵn có (iOS an toàn hơn)
                    setCoinOpen(true);
                  }}
                  style={s.btnOutline}
                >
                  <MaterialIcons name="casino" size={16} color="#111827" />
                  <Text style={s.btnOutlineText}>Bốc thăm màu</Text>
                </Ripple>

                {match?.status === "live" ? (
                  <Ripple
                    onPress={onPressFinish}
                    disabled={match?.status === "finished"}
                    style={[
                      s.btnDanger,
                      match?.status === "finished" && s.btnDisabled,
                    ]}
                  >
                    <MaterialIcons name="stop" size={16} color="#fff" />
                    <Text style={s.btnDangerText}>Kết thúc trận</Text>
                  </Ripple>
                ) : !isFinishDisabled ? (
                  <Ripple onPress={onStart} style={s.btnSuccess}>
                    <MaterialIcons name="play-arrow" size={16} color="#fff" />
                    <Text style={s.btnSuccessText}>Bắt đầu trận</Text>
                  </Ripple>
                ) : null}
              </View>
            </View>
          )}
        </View>
      </View>

      {/* Header controls */}
      <View style={s.card}>
        <View style={[styles.row, { flexWrap: "wrap", gap: 6, marginTop: 12 }]}>
          <Ripple
            onPress={!anyModalOpen ? toggleOrientation : undefined}
            disabled={anyModalOpen}
            style={[
              styles.iconBtn,
              styles.row,
              anyModalOpen && styles.iconBtnDisabled,
            ]}
          >
            <MaterialIcons
              name={
                isLandscape ? "stay-current-portrait" : "stay-current-landscape"
              }
              size={20}
              color="#111827"
            />
            <Text style={{ marginLeft: 5 }}>Xoay</Text>
          </Ripple>

          <Ripple
            onPress={() => setBaseModalOpen(true)}
            style={[styles.iconBtn, styles.row]}
          >
            <MaterialIcons name="grid-on" size={20} color="#111827" />
            <Text style={{ marginLeft: 5 }}>Ô & người phát</Text>
          </Ripple>

          <Ripple
            onPress={!isStartDisabled ? onStart : undefined}
            disabled={isStartDisabled}
            rippleColor={isStartDisabled ? "transparent" : "#00000012"}
            style={[
              styles.iconBtn,
              styles.row,
              isStartDisabled && styles.iconBtnDisabled,
            ]}
          >
            <MaterialIcons
              name="play-arrow"
              size={20}
              color={isStartDisabled ? COLOR_DISABLED : COLOR_ENABLED}
            />
            <Text
              style={[
                styles.iconBtnText,
                {
                  marginLeft: 5,
                  color: isStartDisabled ? COLOR_DISABLED : COLOR_ENABLED,
                },
              ]}
            >
              Bắt đầu
            </Text>
          </Ripple>

          <Ripple
            onPress={!isFinishDisabled ? onPressFinish : undefined}
            disabled={isFinishDisabled}
            rippleColor={isFinishDisabled ? "transparent" : "#00000012"}
            style={[
              styles.iconBtn,
              styles.row,
              isFinishDisabled && styles.iconBtnDisabled,
            ]}
          >
            <MaterialIcons
              name="stop"
              size={20}
              color={isFinishDisabled ? COLOR_DISABLED : COLOR_ENABLED}
            />
            <Text
              style={[
                styles.iconBtnText,
                {
                  marginLeft: 5,
                  color: isFinishDisabled ? COLOR_DISABLED : COLOR_ENABLED,
                },
              ]}
            >
              Kết thúc
            </Text>
          </Ripple>

          <Ripple onPress={handleClose} style={[styles.iconBtn, styles.row]}>
            <MaterialIcons name="close" size={20} color="#111827" />
            <Text style={{ marginLeft: 5 }}>Đóng</Text>
          </Ripple>

          <Ripple onPress={() => refetch()} style={styles.iconBtn}>
            <MaterialIcons name="refresh" size={20} color="#111827" />
          </Ripple>
        </View>
      </View>

      {/* Info + court */}
      <View style={s.card}>
        <View style={[s.rowBetween, { alignItems: "flex-start", gap: 8 }]}>
          <View style={{ flexShrink: 1 }}>
            <Text style={s.h6}>{textOf(match?.tournament?.name)}</Text>
            <Text style={s.caption}>
              {textOf(match?.bracket?.name)} ({textOf(match?.bracket?.type)}) •
              Ván {textOf(match?.round)}
            </Text>
            <View style={[s.row, { gap: 6, flexWrap: "wrap", marginTop: 6 }]}>
              <View
                style={[
                  s.chip,
                  { backgroundColor: statusChip(match?.status).color + "22" },
                ]}
              >
                <Text
                  style={{
                    color: statusChip(match?.status).color,
                    fontWeight: "700",
                    fontSize: 12,
                  }}
                >
                  {statusChip(match?.status).label}
                </Text>
              </View>
              {(() => {
                const courtText = courtLabelOf(match);
                return courtText ? (
                  <View style={[styles.chipSoft]}>
                    <MaterialIcons name="stadium" size={14} color="#111827" />
                    <Text
                      style={{
                        marginLeft: 4,
                        color: "#0f172a",
                        fontWeight: "700",
                      }}
                    >
                      {courtText}
                    </Text>
                  </View>
                ) : null;
              })()}
            </View>
          </View>

          <View
            style={[
              s.row,
              {
                gap: 8,
                flexWrap: "wrap",
                justifyContent: "flex-end",
                flexShrink: 0,
              },
            ]}
          >
            <Ripple
              onPress={() => setCourtModalOpen(true)}
              style={[s.btnOutline, { paddingVertical: 6 }]}
            >
              <MaterialIcons name="edit-location" size={16} color="#111827" />
              <Text style={s.btnOutlineText}>
                {match?.court ? "Đổi sân" : "Gán sân"}
              </Text>
            </Ripple>
            <Ripple onPress={() => refetch()} style={s.iconBtn}>
              {isFetching ? (
                <ActivityIndicator size="small" />
              ) : (
                <MaterialIcons name="refresh" size={20} color="#111827" />
              )}
            </Ripple>
          </View>
        </View>

        <Text style={[s.caption, { marginTop: 6 }]}>
          Thắng {Math.ceil(rules.bestOf / 2)}/{rules.bestOf} ván • Tới{" "}
          {rules.pointsToWin} điểm{" "}
          {rules.winByTwo ? "(hơn 2 điểm)" : "(không cần hơn 2 điểm)"}
        </Text>

        <View style={[s.row, { gap: 6, flexWrap: "wrap", marginTop: 8 }]}>
          <MaterialIcons name="sports-score" size={14} color="#111827" />
          <Text style={{ fontWeight: "700", fontSize: 13 }}>
            Tỷ số từng ván
          </Text>
          {Array.from({ length: Math.max(gs.length, rules.bestOf) }).map(
            (_, i) => {
              const a = gs[i]?.a,
                b = gs[i]?.b;
              const done = isGameWin(a, b, rules.pointsToWin, rules.winByTwo);
              const capped = !!gs[i]?.capped;
              const lbl =
                typeof a === "number" && typeof b === "number"
                  ? `#${i + 1} ${a}-${b}${capped ? " (cap)" : ""}`
                  : `#${i + 1} —`;
              return (
                <View
                  key={i}
                  style={[
                    s.chip,
                    {
                      backgroundColor: done ? "#10b98122" : "#e5e7eb",
                      borderWidth: done ? 0 : 1,
                      borderColor: "#e5e7eb",
                      paddingVertical: 2,
                      paddingHorizontal: 6,
                    },
                  ]}
                >
                  <Text style={{ color: "#111827", fontSize: 12 }}>{lbl}</Text>
                </View>
              );
            }
          )}
        </View>
      </View>
      {/* Info user */}
      <View style={s.card}>
        {/* Header có nút gập/mở */}
        <Pressable
          onPress={() => setInfoCollapsed((v) => !v)}
          style={[s.rowBetween, { paddingVertical: 4 }]}
          hitSlop={8}
        >
          <Text style={s.h6}>Thông tin đội / VĐV</Text>
          <MaterialIcons
            name={infoCollapsed ? "expand-more" : "expand-less"}
            size={20}
            color="#111827"
          />
        </Pressable>

        {/* Thân: chỉ render khi mở */}
        {!infoCollapsed && (
          <View
            style={[
              s.row,
              {
                alignItems: "flex-start",
                gap: 12,
                marginTop: 8,
                flexWrap: "wrap",
              },
            ]}
          >
            {/* Đội A */}
            <View style={{ flex: 1, minWidth: 220 }}>
              <Text style={[s.caption, { marginBottom: 6 }]}>
                Đội A:{" "}
                <Text style={{ fontWeight: "800", color: "#0f172a" }}>
                  {pairLabel(match?.pairA, eventType)}
                </Text>
              </Text>

              {(playersA.length ? playersA : []).map((u, idx) => {
                const key = userIdOf(u) || idx;
                const hasImgs = getCccdImages(u).length > 0;
                return (
                  <View
                    key={key}
                    style={[s.rowBetween, { paddingVertical: 6 }]}
                  >
                    <View style={[s.row, { gap: 8, flexShrink: 1 }]}>
                      <MaterialIcons name="person" size={16} color="#111827" />
                      <Text
                        style={{
                          fontWeight: "700",
                          color: "#0f172a",
                          flexShrink: 1,
                        }}
                      >
                        {displayNick(u)}
                      </Text>
                    </View>

                    {/* ⬇️ Nút “Xem CCCD” sẽ ẩn khi trận đã kết thúc */}
                    {!isFinishDisabled && hasImgs && (
                      <Ripple
                        onPress={() => openCccd(u, 0)}
                        style={s.btnOutline}
                      >
                        <MaterialIcons name="badge" size={16} color="#111827" />
                        <Text style={s.btnOutlineText}>Xem CCCD</Text>
                      </Ripple>
                    )}
                  </View>
                );
              })}
            </View>

            {/* Đội B */}
            <View style={{ flex: 1, minWidth: 220 }}>
              <Text style={[s.caption, { marginBottom: 6 }]}>
                Đội B:{" "}
                <Text style={{ fontWeight: "800", color: "#0f172a" }}>
                  {pairLabel(match?.pairB, eventType)}
                </Text>
              </Text>

              {(playersB.length ? playersB : []).map((u, idx) => {
                const key = userIdOf(u) || idx;
                const hasImgs = getCccdImages(u).length > 0;
                return (
                  <View
                    key={key}
                    style={[s.rowBetween, { paddingVertical: 6 }]}
                  >
                    <View style={[s.row, { gap: 8, flexShrink: 1 }]}>
                      <MaterialIcons name="person" size={16} color="#111827" />
                      <Text
                        style={{
                          fontWeight: "700",
                          color: "#0f172a",
                          flexShrink: 1,
                        }}
                      >
                        {displayNick(u)}
                      </Text>
                    </View>

                    {/* ⬇️ Ẩn khi đã kết thúc */}
                    {!isFinishDisabled && hasImgs && (
                      <Ripple
                        onPress={() => openCccd(u, 0)}
                        style={s.btnOutline}
                      >
                        <MaterialIcons name="badge" size={16} color="#111827" />
                        <Text style={s.btnOutlineText}>Xem CCCD</Text>
                      </Ripple>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </View>

      {/* Coin toss */}

      {/* Modals */}
      {/* <PlayerInfoModal
        visible={infoOpen}
        onClose={() => setInfoOpen(false)}
        user={infoUser}
      /> */}

      <BaseSlotsModal
        visible={baseModalOpen}
        onClose={() => setBaseModalOpen(false)}
      />

      {/* early end current game */}
      <Modal
        visible={earlyOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setEarlyOpen(false)}
        supportedOrientations={[
          "portrait",
          "landscape-left",
          "landscape-right",
          "landscape",
        ]}
        presentationStyle="overFullScreen"
      >
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={[s.h6, { marginBottom: 4 }]}>
              Kết thúc ván hiện tại sớm?
            </Text>
            <Text>
              Ván #{currentIndex + 1}:{" "}
              <Text style={{ fontWeight: "800" }}>{curA}</Text> -{" "}
              <Text style={{ fontWeight: "800" }}>{curB}</Text>
            </Text>

            {curA === curB ? (
              <>
                <Text style={{ marginTop: 10 }}>
                  Đang hòa. Chọn đội thắng ván này:
                </Text>
                <View style={[s.row, { gap: 8, marginTop: 8 }]}>
                  <Ripple
                    onPress={() => setEarlyWinner("A")}
                    style={[
                      s.radioBtn,
                      earlyWinner === "A" && {
                        borderColor: "#0a84ff",
                        backgroundColor: "#0a84ff11",
                      },
                    ]}
                  >
                    <Text>A)</Text>
                  </Ripple>
                  <Ripple
                    onPress={() => setEarlyWinner("B")}
                    style={[
                      s.radioBtn,
                      earlyWinner === "B" && {
                        borderColor: "#0a84ff",
                        backgroundColor: "#0a84ff11",
                      },
                    ]}
                  >
                    <Text>B)</Text>
                  </Ripple>
                </View>
                <View style={[s.row, { gap: 8, marginTop: 8, opacity: 0.6 }]}>
                  <MaterialIcons
                    name="check-box-outline-blank"
                    size={18}
                    color="#6b7280"
                  />
                  <Text>
                    Ghi nhận đúng tỉ số hiện tại — không khả dụng khi hòa
                  </Text>
                </View>
              </>
            ) : (
              <>
                <View style={[s.alertInfo, { marginTop: 10 }]}>
                  <Text>
                    Sẽ chốt thắng ván cho đội{" "}
                    <Text style={{ fontWeight: "800" }}>
                      {curA > curB ? "A" : "B"}
                    </Text>
                    .
                  </Text>
                </View>
                <Ripple
                  onPress={() => setUseCurrentScore((x) => !x)}
                  style={[
                    s.row,
                    { gap: 8, marginTop: 8, alignItems: "center" },
                  ]}
                >
                  <MaterialIcons
                    name={
                      useCurrentScore ? "check-box" : "check-box-outline-blank"
                    }
                    size={18}
                    color="#0a84ff"
                  />
                  <Text>
                    Ghi nhận đúng tỉ số hiện tại (không ép về tối thiểu)
                  </Text>
                </Ripple>
              </>
            )}

            <Text style={[s.caption, { marginTop: 8 }]}>
              {useCurrentScore
                ? "Hệ thống sẽ ghi nhận đúng tỉ số hiện tại."
                : `Hệ thống sẽ ghi nhận tỉ số tối thiểu hợp lệ theo luật (tới ${
                    rules.pointsToWin
                  }${rules.winByTwo ? ", chênh ≥2" : ", chênh ≥1"})`}
            </Text>

            <View style={[s.rowBetween, { marginTop: 12 }]}>
              <Ripple onPress={() => setEarlyOpen(false)} style={s.btnOutline}>
                <Text style={s.btnOutlineText}>Hủy</Text>
              </Ripple>
              <Ripple
                onPress={confirmEarlyEnd}
                disabled={useCurrentScore && curA === curB}
                style={[
                  s.btnPrimary,
                  useCurrentScore && curA === curB && s.btnDisabled,
                ]}
              >
                <Text style={s.btnPrimaryText}>Xác nhận</Text>
              </Ripple>
            </View>
          </View>
        </View>
      </Modal>

      {/* confirm finish match */}
      <Modal
        visible={confirmFinishOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmFinishOpen(false)}
        supportedOrientations={[
          "portrait",
          "landscape-left",
          "landscape-right",
          "landscape",
        ]}
        presentationStyle="overFullScreen"
      >
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={[s.h6, { marginBottom: 6 }]}>Kết thúc trận?</Text>
            <Text style={{ marginBottom: 8 }}>
              Kết quả set: A {aWins} — B {bWins}
            </Text>
            <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
              <Ripple onPress={() => finishMatch("A")} style={s.btnPrimary}>
                <Text style={s.btnPrimaryText}>Thắng: Đội A</Text>
              </Ripple>
              <Ripple onPress={() => finishMatch("B")} style={s.btnPrimary}>
                <Text style={s.btnPrimaryText}>Thắng: Đội B</Text>
              </Ripple>
              <Ripple onPress={() => finishMatch("")} style={s.btnOutline}>
                <Text style={s.btnOutlineText}>Chỉ đóng (chưa đặt winner)</Text>
              </Ripple>
            </View>
            <View style={[s.rowBetween, { marginTop: 12 }]}>
              <View />
              <Ripple
                onPress={() => setConfirmFinishOpen(false)}
                style={s.btnOutline}
              >
                <Text style={s.btnOutlineText}>Huỷ</Text>
              </Ripple>
            </View>
          </View>
        </View>
      </Modal>
      {/* Coin Toss Popup */}
      <Modal
        visible={coinOpen && match?.status !== "finished"}
        transparent
        animationType="fade"
        onRequestClose={async () => {
          setCoinOpen(false);
          await restoreOrientationLock(); // ⬅️ iOS: lock lại orientation cũ
        }}
        supportedOrientations={[
          "portrait",
          "landscape-left",
          "landscape-right",
          "landscape",
        ]}
        presentationStyle="overFullScreen"
      >
        <View style={s.modalBackdrop}>
          <View style={[s.modalCard, { maxWidth: 560 }]}>
            <View style={[s.rowBetween, { marginBottom: 6 }]}>
              <Text style={s.h6}>Bốc thăm màu</Text>
              <Ripple
                onPress={async () => {
                  setCoinOpen(false);
                  await restoreOrientationLock();
                }}
                style={s.iconBtn}
              >
                <MaterialIcons name="close" size={18} color="#111827" />
              </Ripple>
            </View>

            {/* Dùng lại component hiện có, không còn hidden-inline nữa */}
            <ColorCoinToss
              hidden={false}
              onToggle={async () => {
                setCoinOpen(false);
                await restoreOrientationLock();
              }}
            />
          </View>
        </View>
      </Modal>
      <SensitiveView enabled={viewerOpen} blurOnCapture blurIntensity={50}>
        <ImageViewing
          key={viewerOpen ? "open" : "closed"}
          images={viewerImages}
          imageIndex={viewerIndex}
          visible={viewerOpen}
          presentationStyle="fullScreen" // ⬅️ iOS ổn định hơn
          animationType="none" // ⬅️ tránh animation rotation gây crash
          onRequestClose={async () => {
            setViewerOpen(false);
            await restoreOrientationLock(); // ⬅️ lock lại sau khi đóng
          }}
          {...(Platform.OS === "android"
            ? {
                ImageComponent: ExpoImage,
                imageProps: {
                  contentFit: "contain",
                  cachePolicy: "memory-disk",
                  transition: 0,
                },
              }
            : {})}
        />
      </SensitiveView>
      {/* court picker */}
      <CourtPickerModal
        visible={courtModalOpen}
        onClose={() => setCourtModalOpen(false)}
        matchId={match?._id}
        currentCourtId={match?.court?._id}
        onAssigned={({ courtId, error }) => {
          if (error) return;
          refetch();
          socket?.emit("match:patched", { matchId: match?._id, courtId });
        }}
      />
    </View>
  );

  /* ======= Local component inside to keep scoreboard logic close ======= */
  function TeamPanel({ sideKey, equalMinHeight, onMeasured }) {
    const isA = sideKey === "A";
    const score = isA ? curA : curB;
    const BTN = Math.max(
      64,
      Math.min(92, Math.round(Math.min(width, height) * 0.12))
    );
    const ICON = Math.round(BTN * 0.5);
    const SCORE_D = Math.max(110, Math.min(150, Math.round(BTN * 1.8)));

    const circleBtnStyle = {
      width: BTN,
      height: BTN,
      borderRadius: BTN / 2,
      backgroundColor: "#f8fafc",
      borderWidth: 2,
      borderColor: "#e5e7eb",
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3,
    };
    const scoreCircleStyle = {
      width: SCORE_D,
      height: SCORE_D,
      borderRadius: SCORE_D / 2,
      backgroundColor: "#fff",
      borderWidth: 3,
      borderColor: "#e5e7eb",
      alignItems: "center",
      justifyContent: "center",
      marginVertical: 8,
      shadowColor: "#000",
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3,
    };

    const serveSide = servingSide === sideKey;
    const decDisabled = match?.status === "finished";
    const incDisabled =
      match?.status !== "live" || matchPointReached || gameDone;

    const teamPlayers = isA ? playersA : playersB;
    const slotsNow = isA ? slotsNowA : slotsNowB;

    return (
      <View
        onLayout={(e) => {
          const h = e?.nativeEvent?.layout?.height || 0;
          onMeasured?.(sideKey, Math.round(h)); // ⬅️ NEW: báo chiều cao về cha
        }}
        style={[
          s.teamCard,
          serveSide && { borderColor: "#0a84ff", shadowOpacity: 0.15 },
          equalMinHeight ? { minHeight: equalMinHeight } : null, // ⬅️ NEW
        ]}
      >
        <Text style={[s.teamName, { marginBottom: 8 }]} numberOfLines={2}>
          Đội {sideKey})
          {/* {pairLabel(isA ? match?.pairA : match?.pairB, eventType)} */}
        </Text>

        <View style={{ gap: 4, marginBottom: 6 }}>
          {teamPlayers.map((u, idx) => {
            const uid = userIdOf(u);
            return (
              <PlayerMini
                key={uid || idx}
                user={u}
                slotNow={slotsNow[uid]}
                isServer={
                  serverUidShow &&
                  serverUidShow === uid &&
                  servingSide === sideKey
                }
                isReceiver={
                  receiverUidShow &&
                  receiverUidShow === uid &&
                  servingSide !== sideKey
                }
                onPressSetServer={(usr) => setServerByUser(usr, sideKey)}
              />
            );
          })}
        </View>

        <View
          style={{
            alignItems: "center",
            justifyContent: "center",
            paddingVertical: 6,
          }}
        >
          {/* NÚT + : luôn render, ẩn (opacity 0) khi không phải đội giao bóng */}
          <Ripple
            pointerEvents={serveSide ? "auto" : "none"} // ⬅️ không nhận touch khi ẩn
            onPress={() => inc(sideKey)}
            disabled={incDisabled || !serveSide} // ⬅️ vẫn disable logic
            rippleContainerBorderRadius={BTN / 2}
            style={[
              circleBtnStyle,
              !serveSide ? { opacity: 0 } : null, // ⬅️ “visibility: hidden”
              serveSide && incDisabled ? { opacity: 0.45 } : null,
            ]}
          >
            <MaterialIcons name="add" size={ICON} color="#111827" />
          </Ripple>

          <View style={scoreCircleStyle}>
            <Text
              style={[
                s.bigScore,
                {
                  fontSize: Math.min(
                    64,
                    Math.max(36, Math.round(SCORE_D * 0.45))
                  ),
                },
              ]}
            >
              {score}
            </Text>
          </View>

          {/* NÚT − : luôn render, ẩn (opacity 0) khi không phải đội giao bóng */}
          <Ripple
            pointerEvents={serveSide ? "auto" : "none"} // ⬅️ không nhận touch khi ẩn
            onPress={() => dec(sideKey)}
            disabled={decDisabled || !serveSide} // ⬅️ vẫn disable logic
            rippleContainerBorderRadius={BTN / 2}
            style={[
              circleBtnStyle,
              !serveSide ? { opacity: 0 } : null, // ⬅️ “visibility: hidden”
              serveSide && decDisabled ? { opacity: 0.45 } : null,
            ]}
          >
            <MaterialIcons name="remove" size={ICON} color="#111827" />
          </Ripple>
        </View>
      </View>
    );
  }
}

/* ===================== styles ===================== */
const s = StyleSheet.create({
  centerBox: { padding: 16, alignItems: "center", justifyContent: "center" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  row: { flexDirection: "row", alignItems: "center" },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  h6: { fontSize: 16, fontWeight: "800", color: "#0f172a" },
  caption: { color: "#6b7280", fontSize: 12 },
  teamCard: {
    flex: 1,
    borderWidth: 2,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 12,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  teamName: {
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 6,
    color: "#0f172a",
  },
  bigScore: {
    fontSize: 48,
    fontWeight: "900",
    lineHeight: 52,
    color: "#0f172a",
  },

  // buttons
  btnPrimary: {
    backgroundColor: "#0a84ff",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  btnPrimaryText: { color: "#fff", fontWeight: "700" },
  btnOutline: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff",
  },
  btnOutlineText: { color: "#111827", fontWeight: "700" },
  btnOutlineActive: { borderColor: "#0a84ff", backgroundColor: "#0a84ff11" },
  btnOutlineTextActive: { color: "#0a84ff" },
  btnDanger: {
    backgroundColor: "#ef4444",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    justifyContent: "center",
  },
  btnDangerText: { color: "#fff", fontWeight: "800" },
  btnDisabled: { opacity: 0.5 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
  },

  // modals
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },

  iconBtn: { padding: 6, borderRadius: 8, backgroundColor: "#f8fafc" },
  iconBtnTiny: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 8,
    backgroundColor: "#f8fafc",
    flexDirection: "row",
    alignItems: "center",
  },

  cccdImg: {
    marginTop: 6,
    width: "100%",
    height: 160,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },

  alertInfo: {
    backgroundColor: "#f1f5f9",
    borderColor: "#e2e8f0",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  alertError: {
    backgroundColor: "#fee2e2",
    borderColor: "#fecaca",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  alertText: { color: "#111827" },

  // coin toss
  topBar: { height: 10, borderRadius: 8 },
  coinPanel: {
    flex: 1,
    minHeight: 110,
    borderWidth: 2,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  coinTitle: { fontSize: 18, fontWeight: "900", color: "#0f172a" },
  badge: {
    position: "absolute",
    top: 8,
    right: 8,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 999,
  },

  // dots
  dotNeutral: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#e5e7eb",
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  dotServer: { backgroundColor: "#10b981", borderColor: "#059669" },
  dotReceiver: { backgroundColor: "#0ea5e9", borderColor: "#0284c7" },
  btnSuccess: {
    backgroundColor: "#10b981",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    justifyContent: "center",
  },
  btnSuccessText: { color: "#fff", fontWeight: "800" },
});

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  chipSoft: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  iconBtn: { padding: 6, borderRadius: 8, backgroundColor: "#f8fafc" },
  iconBtnDisabled: { opacity: 0.45 },
  iconBtnText: { fontWeight: "700" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 460,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },

  btnSuccess: {
    backgroundColor: "#10b981",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    justifyContent: "center",
  },
  btnSuccessText: { color: "#fff", fontWeight: "800" },
});
