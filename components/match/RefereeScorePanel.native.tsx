// app/screens/PickleBall/match/RefereeJudgePanel.native.jsx
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  memo,
} from "react";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  useColorScheme,
  Alert,
} from "react-native";
import Ripple from "react-native-material-ripple";
import { MaterialIcons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
  useRefereeSetBreakMutation,

  // useRefereeNextGameMutation,
} from "@/slices/tournamentsApiSlice";
import { useSocket } from "@/context/SocketContext";
import * as ScreenOrientation from "expo-screen-orientation";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { normalizeUrl } from "@/utils/normalizeUri";
import CCCDModal from "../CCCDModal.native";
import { useTheme } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient"; // ✅ NEW
/* ---------- Theme tokens ---------- */
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
    navTheme?.colors?.background ?? (dark ? "#0b0d10" : "#f5f7fb");

  return {
    dark,
    colors: { primary, text, card, border, background },

    muted: dark ? "#9aa0a6" : "#6b7280",
    subtext: dark ? "#c9c9c9" : "#555",
    skeletonBase: dark ? "#22262c" : "#e9eef5",
    headerBg: dark ? "#101418" : "#f1f5f9",
    divider: dark ? "#2a2e33" : "#e5e7eb",

    chipInfoBg: dark ? "#1f2937" : "#eef2f7",
    chipInfoFg: dark ? "#e5e7eb" : "#263238",
    chipInfoBd: dark ? "#334155" : "#e2e8f0",

    chipErrBg: dark ? "#3b0d0d" : "#fee2e2",
    chipErrFg: dark ? "#fecaca" : "#991b1b",
    chipErrBd: dark ? "#7f1d1d" : "#fecaca",

    chipInfo2Bg: dark ? "#0f2536" : "#e0f2fe",
    chipInfo2Fg: dark ? "#93c5fd" : "#075985",
    chipInfo2Bd: dark ? "#1e3a5f" : "#bae6fd",

    success: dark ? "#22c55e" : "#16a34a",

    status: {
      upcoming: dark ? "#0b5fad" : "#0288d1",
      ongoing: dark ? "#1c6b2a" : "#2e7d32",
      finished: dark ? "#5f6368" : "#9e9e9e",
    },
  };
}

/* ========== helpers ========== */

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

/* ⚠️ Giữ icon người giao THEO NGƯỜI; riêng 0-0-2 ưu tiên người đã biết (lastServerUid), nếu chưa có thì mới lấy người ở ô 1 */
const computeServerUid = ({
  serve,
  isStartOfGame,
  activeServerNum,
  activeSide,
  getUidAtSlotNow,
  lastServerUid,
}) => {
  const sId = serve?.serverId ? String(serve.serverId) : "";
  if (sId) return sId;
  if (isStartOfGame && activeServerNum === 2) {
    const rightUid =
      getUidAtSlotNow?.(activeSide, 1) ||
      getUidAtSlotNow?.(activeSide, 2) ||
      "";
    return lastServerUid || rightUid || "";
  }
  return lastServerUid || "";
};

/* ======= memo child components ======= */
const NameBadge = memo(
  function NameBadge({ user, isServer, onPressAvatar }) {
    const t = useTokens();
    const [imgError, setImgError] = useState(false);

    const fullName =
      user?.fullName ||
      user?.name ||
      [user?.lastName, user?.firstName].filter(Boolean).join(" ") ||
      displayNick(user);

    const avatarUri = normalizeUrl(
      user?.avatar || user?.avatarURL || user?.photoURL || user?.picture || ""
    );

    const showIcon = !avatarUri || imgError;
    const AV_SIZE = 34;

    return (
      <View style={{ alignItems: "center", maxWidth: "100%" }}>
        <Text
          style={[s.fullNameText, { color: t.colors.text }]}
          numberOfLines={1}
        >
          {fullName}
        </Text>

        <View style={{ position: "relative", marginTop: 6 }}>
          <View
            style={[
              s.badgeName,
              {
                paddingRight: 34,
                backgroundColor: t.chipInfoBg,
                borderColor: t.chipInfoBd,
              },
            ]}
          >
            {showIcon ? (
              <Ripple
                onPress={() => onPressAvatar?.(user)}
                rippleContainerBorderRadius={AV_SIZE / 2}
                style={{
                  width: AV_SIZE,
                  height: AV_SIZE,
                  borderRadius: AV_SIZE / 2,
                  backgroundColor: t.colors.card,
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 6,
                }}
              >
                <MaterialIcons name="person" size={20} color={t.muted} />
              </Ripple>
            ) : (
              <Ripple
                onPress={() => onPressAvatar?.(user)}
                rippleContainerBorderRadius={AV_SIZE / 2}
                style={{ marginRight: 6, borderRadius: AV_SIZE / 2 }}
              >
                <Image
                  source={{ uri: normalizeUrl(avatarUri) }}
                  style={{
                    width: AV_SIZE,
                    height: AV_SIZE,
                    borderRadius: AV_SIZE / 2,
                  }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={0}
                  onError={() => setImgError(true)}
                />
              </Ripple>
            )}

            <Text
              style={[s.nickText, { color: t.colors.text }]}
              numberOfLines={1}
            >
              {displayNick(user)}
            </Text>
          </View>

          {isServer ? (
            <View
              style={[
                s.serveIconBadge,
                {
                  backgroundColor: t.colors.primary,
                  borderColor: t.chipInfo2Bd,
                },
              ]}
            >
              <MaterialIcons name="sports-tennis" size={18} color="#fff" />
            </View>
          ) : null}
        </View>
      </View>
    );
  },
  (prev, next) => {
    const pu = prev.user || {};
    const nu = next.user || {};
    return (
      userIdOf(pu) === userIdOf(nu) &&
      (pu.avatar || pu.avatarURL || pu.photoURL || pu.picture) ===
        (nu.avatar || nu.avatarURL || nu.photoURL || nu.picture) &&
      (pu.nickname || pu.nick) === (nu.nickname || nu.nick) &&
      (pu.fullName || pu.name) === (nu.fullName || nu.name) &&
      prev.isServer === next.isServer
    );
  }
);

const TeamSimple = memo(
  function TeamSimple({
    teamKey,
    players = [],
    slotsNow,
    onSwap,
    isServing,
    activeSide,
    serverUidShow,
    onPressAvatar,
  }) {
    const t = useTokens();

    const ordered = useMemo(() => {
      const withSlot = players.map((u) => ({
        u,
        uid: userIdOf(u),
        slot: Number(slotsNow?.[userIdOf(u)] ?? 99),
      }));
      withSlot.sort((a, b) => a.slot - b.slot);
      return withSlot.map((x) => x.u);
    }, [players, slotsNow]);

    const p1 = ordered[0];
    const p2 = ordered[1];

    const isServerP1 = teamKey === activeSide && userIdOf(p1) === serverUidShow;
    const isServerP2 = teamKey === activeSide && userIdOf(p2) === serverUidShow;

    return (
      <View
        style={[
          s.teamBox,
          { backgroundColor: t.colors.card, borderColor: t.colors.border },
          isServing && {
            backgroundColor: t.chipInfo2Bg,
            borderColor: t.chipInfo2Bd,
          },
        ]}
      >
        <View
          style={{ alignItems: "center", justifyContent: "center", gap: 8 }}
        >
          {p1 ? (
            <NameBadge
              user={p1}
              isServer={!!isServerP1}
              onPressAvatar={onPressAvatar}
            />
          ) : null}

          {ordered.length > 1 && (
            <Ripple
              onPress={onSwap}
              style={[
                s.iconBtn,
                { alignSelf: "center", backgroundColor: t.colors.card },
              ]}
              rippleContainerBorderRadius={8}
            >
              <MaterialIcons name="swap-vert" size={18} color={t.colors.text} />
            </Ripple>
          )}

          {p2 ? (
            <NameBadge
              user={p2}
              isServer={!!isServerP2}
              onPressAvatar={onPressAvatar}
            />
          ) : null}
        </View>
      </View>
    );
  },
  (prev, next) => {
    return (
      prev.teamKey === next.teamKey &&
      prev.isServing === next.isServing &&
      prev.activeSide === next.activeSide &&
      prev.serverUidShow === next.serverUidShow &&
      prev.players === next.players &&
      prev.slotsNow === next.slotsNow
    );
  }
);

function WinTargetTuner({ value, base, onToggle }) {
  const boosted = Number(value) > Number(base);
  const padded = String(value).padStart(2, "0");
  const tens = padded[0];
  const ones = padded[1];

  return (
    <View style={s.winRowAbsolute}>
      <View style={s.winPairRow}>
        <View style={s.winDigitBubble}>
          <Text style={s.winDigitText}>{tens}</Text>
        </View>
        <View style={s.winDigitBubble}>
          <Text style={s.winDigitText}>{ones}</Text>
        </View>
      </View>

      <View style={s.winCenterRow}>
        <Ripple
          onPress={onToggle}
          rippleContainerBorderRadius={999}
          style={[
            s.winAdjustBubble,
            boosted ? s.winAdjustMinus : s.winAdjustPlus,
          ]}
        >
          <MaterialIcons
            name={boosted ? "remove" : "add"}
            size={14}
            color="#fff"
          />
        </Ripple>
        <Ripple
          onPress={onToggle}
          rippleContainerBorderRadius={999}
          style={[
            s.winAdjustBubble,
            boosted ? s.winAdjustMinus : s.winAdjustPlus,
          ]}
        >
          <MaterialIcons
            name={boosted ? "remove" : "add"}
            size={14}
            color="#fff"
          />
        </Ripple>
      </View>

      <View style={s.winPairRow}>
        <View style={s.winDigitBubble}>
          <Text style={s.winDigitText}>{tens}</Text>
        </View>
        <View style={s.winDigitBubble}>
          <Text style={s.winDigitText}>{ones}</Text>
        </View>
      </View>
    </View>
  );
}

function ColorCoinToss({ disabled, onClose }) {
  const t = useTokens();
  const [phase, setPhase] = useState("idle"); // idle|running|done
  const [active, setActive] = useState("blue");
  const [result, setResult] = useState(null);

  const flipRef = useRef(null);
  const stopRef = useRef(null);
  const startAtRef = useRef(0);
  const activeRef = useRef(active);
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
    if (disabled || phase === "running") return;
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
  }, [disabled, phase, clearTimers, tickFlip]);

  const reset = useCallback(() => {
    clearTimers();
    setPhase("idle");
    setActive("blue");
    setResult(null);
  }, [clearTimers]);

  const barColor =
    phase === "idle"
      ? t.colors.border
      : active === "blue"
      ? "#0a84ff"
      : "#ef4444";

  const Panel = ({ kind }) => {
    const label = kind === "blue" ? "ĐỘI XANH" : "ĐỘI ĐỎ";
    const isWin = phase === "done" && result === kind;
    const borderColor = isWin
      ? kind === "blue"
        ? "#0a84ff"
        : "#ef4444"
      : t.colors.border;
    const pulse =
      phase === "running" && active === kind
        ? { shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 8 }
        : null;
    return (
      <View
        style={[
          s.coinPanel,
          { borderColor, backgroundColor: t.colors.card },
          pulse,
        ]}
      >
        <Text style={[s.coinTitle, { color: t.colors.text }]}>{label}</Text>
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
        {isWin && (
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
    <View
      style={[
        s.card,
        { backgroundColor: t.colors.card, borderColor: t.colors.border },
      ]}
    >
      <View style={[s.rowBetween, { marginBottom: 8 }]}>
        <View
          style={[
            s.topBar,
            { backgroundColor: barColor, flex: 1, marginRight: 10 },
          ]}
        />
      </View>

      <View style={[s.row, { justifyContent: "center", marginBottom: 8 }]}>
        {phase === "running" && (
          <View
            style={[
              s.chip,
              {
                backgroundColor: "#0a84ff11",
                borderWidth: 0,
                paddingVertical: 6,
                paddingHorizontal: 10,
              },
            ]}
          >
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
                borderWidth: 0,
                paddingVertical: 6,
                paddingHorizontal: 10,
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
        <Text style={[s.h6, { color: t.colors.text }]}>Bốc thăm màu (5s)</Text>
        <View style={s.row}>
          <Ripple
            onPress={start}
            disabled={disabled || phase === "running"}
            style={[
              s.btnPrimary,
              { backgroundColor: disabled ? "#9ca3af" : "#0a84ff" },
              disabled && s.btnDisabled,
            ]}
          >
            <MaterialIcons name="casino" size={16} color="#fff" />
            <Text style={s.btnPrimaryText}>Bắt đầu</Text>
          </Ripple>
          <Ripple
            onPress={reset}
            disabled={phase === "running"}
            style={[
              s.btnOutline,
              {
                marginLeft: 8,
                borderColor: t.colors.border,
                backgroundColor: t.colors.card,
              },
            ]}
          >
            <MaterialIcons name="restart-alt" size={16} color={t.colors.text} />
            <Text style={[s.btnOutlineText, { color: t.colors.text }]}>
              Reset
            </Text>
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

/* ========= FULLSCREEN COURT PICKER ========= */
function CourtAssignModalFull({
  visible,
  onClose,
  matchId,
  currentCourtId,
  onAssigned,
}) {
  const t = useTokens();
  const { data, isLoading, isFetching, error, refetch } =
    useGetCourtsForMatchQuery(
      { matchId, includeBusy: false },
      { skip: !visible || !matchId }
    );
  const [assignCourt, { isLoading: assigning }] =
    useRefereeAssignCourtMutation();
  const [unassignCourt, { isLoading: unassigning }] =
    useRefereeUnassignCourtMutation();

  const courts = (data?.items || []).filter(Boolean);

  const doAssign = async (courtId) => {
    try {
      await assignCourt({ matchId, courtId }).unwrap();
      const courtName =
        textOf(
          (courts.find((x) => (x?._id || x?.id) === courtId) || {}).name
        ) || "";
      Alert.alert(
        "Đã gán sân",
        courtName ? `Sân: ${courtName}` : "Gán sân thành công"
      );
      onAssigned?.({ courtId });
      onClose?.();
    } catch (e) {
      const msg =
        textOf(e?.data?.message) || textOf(e?.error) || "Không thể gán sân";
      Alert.alert("Lỗi", msg);
      onAssigned?.({ error: msg });
    }
  };

  const clearAssign = async () => {
    try {
      await unassignCourt({ matchId }).unwrap();
      Alert.alert("Đã bỏ gán sân", "Trận đã được bỏ gán sân.");
      onAssigned?.({ courtId: null });
      onClose?.();
    } catch (e) {
      const msg =
        textOf(e?.data?.message) || textOf(e?.error) || "Không thể bỏ gán sân";
      Alert.alert("Lỗi", msg);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      supportedOrientations={[
        "portrait",
        "landscape-left",
        "landscape-right",
        "landscape",
      ]}
    >
      <SafeAreaView
        style={[s.fullModalWrap, { backgroundColor: t.colors.background }]}
      >
        <View style={[s.rowBetween, { padding: 12 }]}>
          <Text style={[s.h6, { color: t.colors.text }]}>Gán sân</Text>
          <View style={[s.row, { gap: 6 }]}>
            <Ripple
              onPress={() => refetch()}
              disabled={isLoading || isFetching}
              style={[s.iconBtn, { backgroundColor: t.colors.card }]}
              rippleContainerBorderRadius={8}
            >
              {isFetching ? (
                <ActivityIndicator size="small" />
              ) : (
                <MaterialIcons name="refresh" size={18} color={t.colors.text} />
              )}
            </Ripple>
            <Ripple
              onPress={onClose}
              style={[s.iconBtn, { backgroundColor: t.colors.card }]}
              rippleContainerBorderRadius={8}
            >
              <MaterialIcons name="close" size={18} color={t.colors.text} />
            </Ripple>
          </View>
        </View>

        <View style={{ flex: 1, paddingHorizontal: 12 }}>
          {isLoading ? (
            <View style={[s.center, { flex: 1 }]}>
              <ActivityIndicator />
            </View>
          ) : error ? (
            <View
              style={[
                s.alertError,
                { backgroundColor: t.chipErrBg, borderColor: t.chipErrBd },
              ]}
            >
              <Text style={[s.alertText, { color: t.chipErrFg }]}>
                {textOf(error?.data?.message) ||
                  textOf(error?.error) ||
                  "Lỗi tải danh sách sân"}
              </Text>
            </View>
          ) : !courts.length ? (
            <View style={[s.center, { flex: 1 }]}>
              <Text style={{ color: t.colors.text }}>
                Không có sân khả dụng.
              </Text>
            </View>
          ) : (
            <View style={{ width: "100%" }}>
              {courts.map((c, idx) => {
                const id = c?._id || c?.id;
                const selected = String(currentCourtId || "") === String(id);
                return (
                  <Ripple
                    key={id || idx}
                    onPress={() => !(assigning || unassigning) && doAssign(id)}
                    style={{
                      paddingVertical: 12,
                      borderBottomWidth: 1,
                      borderBottomColor: t.colors.border,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                    rippleContainerBorderRadius={8}
                  >
                    <View style={[s.row, { gap: 8 }]}>
                      <MaterialIcons
                        name="stadium"
                        size={18}
                        color={t.colors.text}
                      />
                      <Text
                        style={{
                          fontWeight: "700",
                          color: t.colors.text,
                        }}
                      >
                        {textOf(c?.name)}
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
                        color={t.muted}
                      />
                    )}
                  </Ripple>
                );
              })}
            </View>
          )}
        </View>

        <View
          style={{
            padding: 12,
            borderTopWidth: 1,
            borderTopColor: t.colors.border,
          }}
        >
          <View style={[s.rowBetween]}>
            <Ripple
              onPress={clearAssign}
              style={[
                s.btnOutline,
                {
                  backgroundColor: t.colors.card,
                  borderColor: t.colors.border,
                },
              ]}
              rippleContainerBorderRadius={10}
            >
              <MaterialIcons name="block" size={16} color={t.colors.text} />
              <Text style={[s.btnOutlineText, { color: t.colors.text }]}>
                Bỏ gán sân
              </Text>
            </Ripple>
            <Ripple
              onPress={onClose}
              style={[s.btnPrimary, { backgroundColor: t.colors.primary }]}
              rippleContainerBorderRadius={10}
            >
              <Text style={s.btnPrimaryText}>Đóng</Text>
            </Ripple>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

/* ========== main component ========== */
const UNDO_KEY = (matchId) => `PT_REF_JUDGE_UNDO_${String(matchId || "")}`;
const PTW_KEY = (matchId) => `PT_REF_PTWIN_BOOST_${String(matchId || "")}`;

export default function RefereeJudgePanel({ matchId }) {
  const t = useTokens();
  const router = useRouter();

  const {
    data: match,
    isLoading,
    error,
    refetch,
  } = useGetMatchQuery(matchId, { skip: !matchId });
  const [incPoint] = useRefereeIncPointMutation();
  const [setGame] = useRefereeSetGameScoreMutation();
  const [setStatus] = useRefereeSetStatusMutation();
  const [setWinner] = useRefereeSetWinnerMutation();
  const [nextGame] = useRefereeNextGameMutation();
  const [setBreak] = useRefereeSetBreakMutation(); // 👈 thêm
  const socket = useSocket();

  // ===== NEW: court modal state =====
  const [courtOpen, setCourtOpen] = useState(false);

  // ===== NEW: “chờ bấm Bắt đầu” sau khi bấm BẮT GAME TIẾP =====
  const [waitingStart, setWaitingStart] = useState(false);

  // ====== derive ======
  const rules = match?.rules || { bestOf: 1, pointsToWin: 11, winByTwo: true };
  const basePointsToWin = Number(rules?.pointsToWin ?? 11);
  const [ptw, setPtw] = useState(basePointsToWin);
  const [ptwBoost, setPtwBoost] = useState(false);
  const eventType = (match?.tournament?.eventType || "double").toLowerCase();
  const gs = match?.gameScores || [];
  const theCurIdx = Math.max(0, gs.length - 1);
  const curIdx = theCurIdx;
  const curA = Number(gs[curIdx]?.a ?? 0);
  const curB = Number(gs[curIdx]?.b ?? 0);

  const playersA = useMemo(
    () => playersOf(match?.pairA, eventType),
    [match?.pairA, eventType]
  );
  const playersB = useMemo(
    () => playersOf(match?.pairB, eventType),
    [match?.pairB, eventType]
  );

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

  const getUidAtSlotNow = useCallback(
    (teamKey, slotNum) => {
      const map = teamKey === "A" ? slotsNowA : slotsNowB;
      const entry = Object.entries(map || {}).find(
        ([, v]) => Number(v) === Number(slotNum)
      );
      return entry ? entry[0] : null;
    },
    [slotsNowA, slotsNowB]
  );

  // ==== Serve state
  const serve = match?.serve || { side: "A", server: 2, serverId: "" };
  const activeSide = serve?.side === "B" ? "B" : "A";
  const activeServerNum =
    Number(serve?.order ?? serve?.server ?? 1) === 2 ? 2 : 1;

  // Nhớ người giao gần nhất để icon không “nhảy theo ô”
  const lastServerUidRef = useRef("");

  // Đầu game (0-0-2) icon phải nằm ở ô phải/even
  const isStartOfGame = Number(curA) === 0 && Number(curB) === 0;

  // ✅ TÍNH NGƯỜI GIAO “THEO NGƯỜI” (không theo ô)
  const serverUidShow = useMemo(
    () =>
      computeServerUid({
        serve,
        isStartOfGame,
        activeServerNum,
        activeSide,
        getUidAtSlotNow,
        lastServerUid: lastServerUidRef.current,
      }),
    [
      serve?.serverId,
      isStartOfGame,
      activeServerNum,
      activeSide,
      getUidAtSlotNow,
    ]
  );

  // ✅ INIT serve cho 0-0-2: luôn là Ô 1 (bên phải/chẵn), persist về server
  const initServeDoneRef = useRef({});
  useEffect(() => {
    if (!match?._id) return;

    const inited = !!initServeDoneRef.current[curIdx];
    const wantServerNum = 2;
    const is000 = Number(curA) === 0 && Number(curB) === 0;

    if (!is000 || inited) return;

    // Ưu tiên người đang ở Ô 1 (bên phải/chẵn), nếu thiếu thì thử Ô 2
    const uidRight =
      getUidAtSlotNow(activeSide, 1) || getUidAtSlotNow(activeSide, 2) || "";

    const currentOrder = Number(serve?.order ?? serve?.server ?? 1);
    const currentServerId = serve?.serverId ? String(serve.serverId) : "";

    const needFix =
      currentOrder !== wantServerNum ||
      !currentServerId ||
      currentServerId !== String(uidRight);

    if (needFix) {
      // ⏩ Set sớm để UI bám NGƯỜI ngay cả khi socket chưa ack
      lastServerUidRef.current = uidRight;

      socket?.emit(
        "serve:set",
        {
          matchId: match._id,
          side: activeSide,
          server: wantServerNum, // 2 (0-0-2)
          serverId: uidRight, // người ở Ô 1
        },
        (ack) => {
          if (ack?.ok) {
            initServeDoneRef.current[curIdx] = true;
            lastServerUidRef.current = uidRight;
            refetch();
          }
        }
      );
    } else {
      initServeDoneRef.current[curIdx] = true;
      lastServerUidRef.current = currentServerId;
    }
  }, [
    match?._id,
    curIdx,
    curA,
    curB,
    activeSide,
    getUidAtSlotNow,
    serve?.serverId,
    serve?.order,
    serve?.server,
    socket,
    refetch,
  ]);

  // Luôn ghi nhớ người giao hiện tại
  useEffect(() => {
    if (serverUidShow) lastServerUidRef.current = serverUidShow;
  }, [serverUidShow]);

  const callout =
    eventType === "single"
      ? `${activeSide === "A" ? curA : curB}–${
          activeSide === "A" ? curB : curA
        }`
      : activeSide === "A"
      ? `${curA}-${curB}-${activeServerNum}`
      : `${curB}-${curA}-${activeServerNum}`;

  const aWins = gs.filter(
    (g) =>
      isGameWin(g?.a, g?.b, Number(rules.pointsToWin), rules.winByTwo) &&
      g.a > g.b
  ).length;
  const bWins = gs.filter(
    (g) =>
      isGameWin(g?.a, g?.b, Number(rules.pointsToWin), rules.winByTwo) &&
      g.b > g.a
  ).length;

  const needSetWinsVal = needWins(rules.bestOf);
  const matchDecided = aWins >= needSetWinsVal || bWins >= needSetWinsVal;

  const gameLocked = isGameWin(curA, curB, ptw, rules.winByTwo);

  // ====== local UI state ======
  const [leftRight, setLeftRight] = useState({ left: "A", right: "B" });
  const leftSide = leftRight.left;
  const rightSide = leftRight.right;

  const [menuOpen, setMenuOpen] = useState(false);
  const [now, setNow] = useState(new Date());
  const [cccdOpen, setCccdOpen] = useState(false);
  const [cccdUser, setCccdUser] = useState(null);

  // Busy flags
  const [incBusy, setIncBusy] = useState(false);
  const [undoBusy, setUndoBusy] = useState(false);

  // Track pending op
  const pendingOpRef = useRef(null);
  const opTimeoutRef = useRef(null);

  // Mid-game side switch prompt
  const [midPromptOpen, setMidPromptOpen] = useState(false);
  const midPoint = ptw ? Math.ceil(Number(ptw) / 2) : null;
  const midAskedRef = useRef({}); // { [gameIndex]: true }

  useEffect(() => {
    const tmr = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(tmr);
  }, []);

  useEffect(() => {
    setPtw(basePointsToWin);
  }, [basePointsToWin]);

  // ====== Undo stack (persisted) ======
  const undoStack = useRef([]);
  const persistUndo = useCallback(async () => {
    try {
      if (!matchId) return;
      await AsyncStorage.setItem(
        UNDO_KEY(matchId),
        JSON.stringify(undoStack.current)
      );
    } catch {}
  }, [matchId]);
  const loadUndo = useCallback(async () => {
    try {
      if (!matchId) return;
      const raw = await AsyncStorage.getItem(UNDO_KEY(matchId));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) undoStack.current = parsed;
      }
    } catch {}
  }, [matchId]);

  // ✅ Lưu/đọc cờ đã boost +4
  const persistPtwBoost = useCallback(
    async (val) => {
      try {
        if (!matchId) return;
        await AsyncStorage.setItem(PTW_KEY(matchId), val ? "1" : "0");
      } catch {}
    },
    [matchId]
  );

  const loadPtwBoost = useCallback(async () => {
    try {
      if (!matchId) return;
      const raw = await AsyncStorage.getItem(PTW_KEY(matchId));
      setPtwBoost(raw === "1");
    } catch {
      setPtwBoost(false);
    }
  }, [matchId]);

  const pushUndo = (entry) => {
    undoStack.current.push({ ...entry, ts: Date.now() });
    if (undoStack.current.length > 200) undoStack.current.shift();
    persistUndo();
  };

  // ✅ sau khi có match/rules → đọc cờ boost đã lưu
  useEffect(() => {
    if (!match?._id) return;
    setPtw(Number(match?.rules?.pointsToWin ?? basePointsToWin));
    loadPtwBoost();
  }, [match?._id, match?.rules?.pointsToWin, basePointsToWin, loadPtwBoost]);

  useEffect(() => {
    loadUndo();
  }, [loadUndo]);

  // ====== socket auto-refetch ======
  const socketInst = socket;
  useEffect(() => {
    if (!socketInst || !matchId) return;
    const handlePatched = (p) => {
      const id = p?.matchId || p?.data?._id || p?._id;
      if (String(id) === String(matchId)) refetch();
    };
    socketInst.emit("match:join", { matchId });
    socketInst.on("match:patched", handlePatched);
    socketInst.on("score:updated", handlePatched);
    socketInst.on("status:updated", handlePatched);
    socketInst.on("winner:updated", handlePatched);
    socketInst.on("match:snapshot", handlePatched);
    return () => {
      socketInst.emit("match:leave", { matchId });
      socketInst.off("match:patched", handlePatched);
      socketInst.off("score:updated", handlePatched);
      socketInst.off("status:updated", handlePatched);
      socketInst.off("winner:updated", handlePatched);
      socketInst.off("match:snapshot", handlePatched);
    };
  }, [socketInst, matchId, refetch]);

  // Release busy when score actually changed for the pending op
  useEffect(() => {
    const op = pendingOpRef.current;
    if (!op) return;
    const changed =
      op.type === "inc"
        ? op.side === "A"
          ? curA === op.prevA + 1
          : curB === op.prevB + 1
        : op.type === "undo"
        ? op.side === "A"
          ? curA === op.prevA - 1
          : curB === op.prevB - 1
        : false;

    if (changed) {
      if (op.type === "inc") setIncBusy(false);
      if (op.type === "undo") setUndoBusy(false);
      pendingOpRef.current = null;
      if (opTimeoutRef.current) {
        clearTimeout(opTimeoutRef.current);
        opTimeoutRef.current = null;
      }
    }
  }, [curA, curB]);

  // ====== actions ======
  const onStart = async () => {
    if (!match) return;
    try {
      // 1) đặt trạng thái live
      await setStatus({ matchId: match._id, status: "live" }).unwrap();

      // 2) tắt nghỉ
      await setBreak({
        matchId: match._id,
        active: false,
        note: "",
      }).unwrap();

      // 3) cho phép cộng điểm
      setWaitingStart(false);

      // 4) nếu chưa có game thì tạo game 0
      if (gs.length === 0) {
        await setGame({
          matchId: match._id,
          gameIndex: 0,
          a: 0,
          b: 0,
          autoNext: false,
        }).unwrap();
      }

      refetch();
    } catch (e) {
      Toast.show({
        type: "error",
        text1: "Lỗi",
        text2:
          textOf(e?.data?.message) || textOf(e?.error) || "Không thể bắt đầu",
      });
    }
  };

  const finishMatchNow = async (winner) => {
    if (!match) return;
    if (!winner) {
      Toast.show({
        type: "error",
        text1: "Chưa thể kết thúc",
        text2: "Tỉ số hiện tại chưa xác định đội thắng.",
      });
      return;
    }
    try {
      await setWinner({ matchId: match._id, winner }).unwrap();
      await setStatus({ matchId: match._id, status: "finished" }).unwrap();
      socket?.emit("status:updated", {
        matchId: match._id,
        status: "finished",
        winner,
      });
    } catch (e) {
      Toast.show({
        type: "error",
        text1: "Lỗi",
        text2:
          textOf(e?.data?.message) ||
          textOf(e?.error) ||
          "Không thể kết thúc trận",
      });
    }
  };

  const startNextGame = async () => {
    if (!match) return;
    try {
      // 1) bật nghỉ để overlay biết đang nghỉ sau game vừa xong
      await setBreak({
        matchId: match._id,
        active: true,
        // nghỉ sau game hiện tại
        afterGame: curIdx,
        note: "",
      }).unwrap();

      // 2) chuyển sang game tiếp theo
      await nextGame({ matchId: match._id }).unwrap();

      // 3) FE chuyển sang trạng thái chờ bấm "Bắt đầu"
      setWaitingStart(true);

      // 4) refetch lại match
      refetch();
    } catch (e) {
      Toast.show({
        type: "error",
        text1: "Lỗi",
        text2:
          textOf(e?.data?.message) ||
          textOf(e?.error) ||
          "Không thể sang game tiếp theo",
      });
    }
  };
  const setPointsToWinOnServer = useCallback(
    (nextVal) => {
      if (!match?._id) return;
      socket?.emit(
        "rules:setPointsToWin",
        { matchId: match._id, pointsToWin: Number(nextVal) },
        (ack) => {
          try {
            if (!ack?.ok) {
              Toast.show({
                type: "error",
                text1: "Lỗi",
                text2: ack?.message || "Không cập nhật điểm set",
              });
              return;
            }
            setPtw(Number(nextVal));
            refetch();
            Toast.show({
              type: "success",
              text1: "Đã cập nhật",
              text2: `Điểm set: ${nextVal}`,
            });
          } catch {}
        }
      );
    },
    [match?._id, refetch, socket]
  );

  // ✅ gửi delta: +4 hoặc -4; cập nhật UI + lưu cờ
  const setPointsToWinDelta = useCallback(
    (deltaInt) => {
      if (!match?._id) return;
      const signStr = deltaInt >= 0 ? `+${deltaInt}` : `${deltaInt}`;
      socket?.emit(
        "rules:setPointsToWin",
        { matchId: match._id, pointsToWin: signStr },
        (ack) => {
          if (!ack?.ok) {
            Toast.show({
              type: "error",
              text1: "Lỗi",
              text2: ack?.message || "Không cập nhật điểm set",
            });
            return;
          }
          const nextVal =
            typeof ack.pointsToWin === "number"
              ? ack.pointsToWin
              : Number(ptw) + Number(deltaInt);
          setPtw(nextVal);

          const nextBoost = deltaInt > 0; // +4 → true, -4 → false
          setPtwBoost(nextBoost);
          persistPtwBoost(nextBoost);
          refetch();

          Toast.show({
            type: "success",
            text1: "Đã cập nhật",
            text2: `Điểm set: ${nextVal}`,
          });
        }
      );
    },
    [match?._id, socket, ptw, persistPtwBoost, refetch]
  );

  // ✅ chỉ cho cộng điểm khi đang live VÀ không ở trạng thái chờ bắt đầu
  const canScoreNow =
    match?.status === "live" && !waitingStart && !matchDecided && !gameLocked;

  const beginOpTimeout = useCallback((kind) => {
    if (opTimeoutRef.current) clearTimeout(opTimeoutRef.current);
    opTimeoutRef.current = setTimeout(() => {
      if (kind === "inc") setIncBusy(false);
      if (kind === "undo") setUndoBusy(false);
      pendingOpRef.current = null;
    }, 2500);
  }, []);

  const inc = async (side) => {
    if (!match) return;

    if (!canScoreNow) {
      Toast.show({
        type: "info",
        text1: "Đã khóa cộng điểm",
        text2: waitingStart
          ? "Hãy bấm 'Bắt đầu' để bắt game."
          : matchDecided
          ? "Trận đã đủ số game thắng (BO)."
          : "Game đã kết thúc, vui lòng sang game tiếp theo.",
      });
      return;
    }

    if (side !== (serve?.side || "A")) return;

    const prevServerUid = lastServerUidRef.current;

    setIncBusy(true);
    pendingOpRef.current = {
      type: "inc",
      side,
      prevA: curA,
      prevB: curB,
      t: Date.now(),
    };
    beginOpTimeout("inc");

    try {
      await incPoint({
        matchId: match._id,
        side,
        delta: +1,
        autoNext: false,
      }).unwrap();

      socket?.emit("score:inc", {
        matchId: match._id,
        side,
        delta: +1,
        autoNext: false,
      });

      if (!serve?.serverId && prevServerUid) {
        socket?.emit(
          "serve:set",
          {
            matchId: match._id,
            side: serve?.side || "A",
            server: activeServerNum,
            serverId: prevServerUid,
          },
          () => {}
        );
      }

      refetch();
      pushUndo({ t: "POINT", side });
    } catch (e) {
      setIncBusy(false);
      pendingOpRef.current = null;
      if (opTimeoutRef.current) {
        clearTimeout(opTimeoutRef.current);
        opTimeoutRef.current = null;
      }
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
        autoNext: false,
      }).unwrap();
    } catch (e) {
      Toast.show({
        type: "error",
        text1: "Lỗi",
        text2:
          textOf(e?.data?.message) || textOf(e?.error) || "Không thể trừ điểm",
      });
    }
  };

  const onUndo = async () => {
    const entry = undoStack.current.pop();
    if (!entry) {
      Toast.show({ type: "info", text1: "Không có thao tác để hoàn tác" });
      return;
    }
    await persistUndo();

    try {
      if (entry.t === "POINT") {
        setUndoBusy(true);
        pendingOpRef.current = {
          type: "undo",
          side: entry.side,
          prevA: curA,
          prevB: curB,
          t: Date.now(),
        };
        beginOpTimeout("undo");

        await dec(entry.side);
        socket?.emit("score:inc", {
          matchId: match?._id,
          side: entry.side,
          delta: -1,
          autoNext: false,
        });
        refetch();
      } else if (entry.t === "SERVE_SET") {
        setUndoBusy(true);
        beginOpTimeout("undo");
        const prev = entry.prev;
        socket?.emit(
          "serve:set",
          {
            matchId: match?._id,
            side: prev.side,
            server: prev.server,
            serverId: prev.serverId || "",
          },
          (ack) => {
            setUndoBusy(false);
            if (opTimeoutRef.current) {
              clearTimeout(opTimeoutRef.current);
              opTimeoutRef.current = null;
            }
            if (!ack?.ok) {
              Toast.show({
                type: "error",
                text1: "Lỗi",
                text2: ack?.message || "Không khôi phục giao bóng",
              });
            } else refetch();
          }
        );
      } else if (entry.t === "SLOTS_SET") {
        setUndoBusy(true);
        beginOpTimeout("undo");
        socket?.emit(
          "slots:setBase",
          { matchId: match?._id, base: entry.prevBase },
          (ack) => {
            setUndoBusy(false);
            if (opTimeoutRef.current) {
              clearTimeout(opTimeoutRef.current);
              opTimeoutRef.current = null;
            }
            if (!ack?.ok) {
              Toast.show({
                type: "error",
                text1: "Lỗi",
                text2: ack?.message || "Không khôi phục vị trí Ô",
              });
            } else refetch();
          }
        );
      } else if (entry.t === "SWAP_SIDES") {
        setUndoBusy(true);
        setLeftRight(entry.prev);
        setUndoBusy(false);
      }
    } catch {
      setUndoBusy(false);
      Toast.show({ type: "error", text1: "Hoàn tác thất bại" });
    }
  };

  // --- ĐỔI GIAO: nếu CHƯA BẮT ĐẦU (status !== live HOẶC waitingStart) → 0-0-2; nếu đang live → tay 1
  const toggleServeSide = () => {
    if (!match?._id) return;

    const prev = {
      side: activeSide,
      server: activeServerNum,
      serverId: serverUidShow,
    };

    const nextSide = activeSide === "A" ? "B" : "A";

    const preStart = waitingStart || match?.status !== "live";
    const wantOrder = preStart ? 2 : 1; // ✅ yêu cầu mới

    const uidRight =
      getUidAtSlotNow(nextSide, 1) || getUidAtSlotNow(nextSide, 2) || "";

    lastServerUidRef.current = uidRight;

    socket?.emit(
      "serve:set",
      {
        matchId: match._id,
        side: nextSide,
        server: wantOrder,
        serverId: uidRight,
      },
      async (ack) => {
        if (!ack?.ok) {
          Toast.show({
            type: "error",
            text1: "Lỗi",
            text2: ack?.message || "Không đặt được giao bóng",
          });
          return;
        }

        pushUndo({ t: "SERVE_SET", prev });

        // 🛡️ Guard: nếu backend lỡ reset 0-0 khi đang mid-game → khôi phục điểm
        try {
          const res = await refetch();
          const m = res?.data || match;
          const g = m?.gameScores?.[curIdx];
          if (
            !preStart &&
            g &&
            g.a === 0 &&
            g.b === 0 &&
            (curA !== 0 || curB !== 0)
          ) {
            await setGame({
              matchId: match._id,
              gameIndex: curIdx,
              a: curA,
              b: curB,
              autoNext: false,
            }).unwrap();
            await refetch();
          }
        } catch {}
      }
    );
  };

  // --- ĐỔI TAY trong cùng đội
  const toggleServerNum = useCallback(() => {
    if (!match?._id) return;
    const team = activeSide === "A" ? playersA : playersB;
    if (!team?.length || team.length < 2) return;

    const prev = {
      side: activeSide,
      server: activeServerNum,
      serverId: serverUidShow,
    };
    const partnerId =
      team.map(userIdOf).find((uid) => uid !== serverUidShow) || serverUidShow;
    const nextOrder = activeServerNum === 1 ? 2 : 1;

    lastServerUidRef.current = partnerId;

    socket?.emit(
      "serve:set",
      {
        matchId: match._id,
        side: activeSide,
        server: nextOrder,
        serverId: partnerId,
      },
      (ack) => {
        if (!ack?.ok) {
          Toast.show({
            type: "error",
            text1: "Lỗi",
            text2: ack?.message || "Không đổi được người giao",
          });
        } else {
          pushUndo({ t: "SERVE_SET", prev });
          refetch();
        }
      }
    );
  }, [
    match?._id,
    activeSide,
    activeServerNum,
    serverUidShow,
    playersA,
    playersB,
    refetch,
  ]);

  const swapTeamSlots = useCallback(
    (teamKey) => {
      if (!match?._id) return;

      const list = teamKey === "A" ? playersA : playersB;
      if (!list?.[0] || !list?.[1]) return;

      // ===== tính next base sau khi hoán đổi trong đội =====
      const uidTop = userIdOf(list[0]);
      const uidBot = userIdOf(list[1]);

      const nextA = { ...baseA };
      const nextB = { ...baseB };

      if (teamKey === "A") {
        const cur1 = Number(nextA[uidTop] || 1);
        const cur2 = Number(nextA[uidBot] || 2);
        nextA[uidTop] = cur2;
        nextA[uidBot] = cur1;
      } else {
        const cur1 = Number(nextB[uidTop] || 1);
        const cur2 = Number(nextB[uidBot] || 2);
        nextB[uidTop] = cur2;
        nextB[uidBot] = cur1;
      }

      const prevBase = { A: baseA, B: baseB };

      // Điều kiện "chưa bắt đầu trận hoặc game"
      const preOrZero =
        match?.status !== "live" || (Number(curA) === 0 && Number(curB) === 0);

      socket?.emit(
        "slots:setBase",
        { matchId: match._id, base: { A: nextA, B: nextB } },
        (ack) => {
          if (!ack?.ok) {
            Toast.show({
              type: "error",
              text1: "Lỗi",
              text2: ack?.message || "Không đổi được Ô",
            });
            return;
          }

          pushUndo({ t: "SLOTS_SET", prevBase });

          // ⛳ Theo yêu cầu: nếu chưa bắt đầu trận/game thì KHÔNG đổi giao.
          // Nhưng nếu hoán đổi ngay tại đội đang giao, cần đảm bảo 0-0-2
          // và người giao là người đang ở ô phải (slot 1) sau hoán đổi.
          if (preOrZero && teamKey === activeSide) {
            // Tính UID ở ô phải (slot 1) theo base "mới"
            const mapAfter = teamKey === "A" ? nextA : nextB; // base mới của đội đang giao
            const uidRightNew =
              Object.entries(mapAfter).find(
                ([, slot]) => Number(slot) === 1
              )?.[0] ||
              Object.keys(mapAfter)[0] ||
              "";

            if (uidRightNew) {
              lastServerUidRef.current = uidRightNew; // bám NGƯỜI ngay lập tức

              socket?.emit(
                "serve:set",
                {
                  matchId: match._id,
                  side: activeSide, // giữ nguyên đội đang giao
                  server: 2, // luôn 0-0-2 ở đầu game/chưa bắt đầu
                  serverId: uidRightNew,
                },
                (ack2) => {
                  if (!ack2?.ok) {
                    Toast.show({
                      type: "error",
                      text1: "Lỗi",
                      text2: ack2?.message || "Không cập nhật lại người giao",
                    });
                  }
                  // Dù sao cũng refetch để UI khớp trạng thái mới
                  refetch();
                }
              );
              return; // đã refetch trong callback
            }
          }

          // Trường hợp thường: chỉ refetch sau khi đổi ô
          refetch();
        }
      );
    },
    [
      match?._id,
      match?.status,
      curA,
      curB,
      playersA,
      playersB,
      baseA,
      baseB,
      activeSide,
      refetch,
    ]
  );

  const swapSides = () => {
    const prev = { ...leftRight };
    setLeftRight(({ left, right }) => ({ left: right, right: left }));
    pushUndo({ t: "SWAP_SIDES", prev });
  };

  const handleBack = useCallback(async () => {
    try {
      await ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.PORTRAIT_UP
      );
    } catch {}
    router.back();
  }, [router]);

  const baseCode = String(
    textOf(match?.displayCode) ||
      textOf(match?.matchCode) ||
      textOf(match?.code) ||
      textOf(match?.slotCode) ||
      textOf(match?.bracketCode) ||
      "—"
  ).toUpperCase();
  const headerText = [
    baseCode,
    `BO${Number(rules?.bestOf || 1)}`,
    `G${curIdx + 1}`,
  ].join(" | ");

  const leftServing = activeSide === leftSide;
  const rightServing = activeSide === rightSide;
  const leftEnabled = canScoreNow && leftServing && !incBusy && !undoBusy;
  const rightEnabled = canScoreNow && rightServing && !incBusy && !undoBusy;

  const openCccd = useCallback((u) => {
    setCccdUser(u || null);
    setCccdOpen(!!u);
  }, []);

  const cta = useMemo(() => {
    if (match?.status === "finished") return null;

    const bestOfNum = Number(rules?.bestOf || 1);
    const needSetWins = Math.floor(bestOfNum / 2) + 1;

    const gameFinished = isGameWin(
      curA,
      curB,
      Number(rules?.pointsToWin ?? 11),
      !!rules?.winByTwo
    );

    const winnerBySets =
      aWins >= needSetWins ? "A" : bWins >= needSetWins ? "B" : "";

    if (winnerBySets) {
      return {
        label: "Kết thúc trận",
        danger: true,
        onPress: () => finishMatchNow(winnerBySets),
      };
    }

    // ✅ nếu đang chờ bắt đầu (waitingStart) HOẶC status !== live → cho bấm “Bắt đầu”
    if (waitingStart || match?.status !== "live") {
      return {
        label: "Bắt đầu",
        danger: false,
        onPress: onStart,
      };
    }

    if (gameFinished) {
      const finishedGames = aWins + bWins;
      const remainingGames = bestOfNum - finishedGames;
      if (remainingGames > 0) {
        return {
          label: "Bắt game tiếp",
          danger: false,
          onPress: startNextGame, // ✅ chỉ chuyển game, KHÔNG start
        };
      }
      const finalWinner = aWins > bWins ? "A" : "B";
      return {
        label: "Kết thúc trận",
        danger: true,
        onPress: () => finishMatchNow(finalWinner),
      };
    }

    return null;
  }, [
    match?.status,
    waitingStart,
    rules?.bestOf,
    rules?.pointsToWin,
    rules?.winByTwo,
    aWins,
    bWins,
    curA,
    curB,
    onStart,
    startNextGame,
  ]);

  const isServer1 = activeServerNum === 1;
  const midLabel = isServer1 ? "Đổi tay" : "Đổi giao";
  const midIcon = isServer1 ? "swap-vert" : "swap-calls";
  const onMidPress = isServer1 ? toggleServerNum : toggleServeSide;

  // ====== Ask-once-at-half-set per game ======
  useEffect(() => {
    if (match?.status !== "live" || waitingStart || midPoint == null) return;
    const asked = !!midAskedRef.current[curIdx];
    const isAtMidNow = curA === midPoint || curB === midPoint;
    if (!asked && isAtMidNow) {
      setMidPromptOpen(true);
      midAskedRef.current[curIdx] = true; // mark asked for this game
    }
  }, [match?.status, waitingStart, curIdx, curA, curB, midPoint]);

  /* ========== render ========== */
  if (isLoading && !match)
    return (
      <View style={s.center}>
        <ActivityIndicator />
      </View>
    );
  if (error)
    return (
      <View
        style={[
          s.alertError,
          { backgroundColor: t.chipErrBg, borderColor: t.chipErrBd },
        ]}
      >
        <Text style={[s.alertText, { color: t.chipErrFg }]}>
          {textOf(error?.data?.message) ||
            textOf(error?.error) ||
            "Lỗi tải trận"}
        </Text>
      </View>
    );
  if (!match) return null;

  // current court id if any
  const currentCourtId =
    match?.court?._id || match?.court?.id || match?.court || match?.courtId;

  const currentCourtName =
    typeof match?.court === "object"
      ? textOf(
          match?.court?.name ||
            match?.court?.label ||
            match?.court?.title ||
            match?.court
        )
      : textOf(match?.courtName || match?.meta?.courtName || "");

  const leftGameScore = leftSide === "A" ? curA : curB;
  const rightGameScore = rightSide === "A" ? curA : curB;
  const leftSetWins = leftSide === "A" ? aWins : bWins;
  const rightSetWins = rightSide === "A" ? aWins : bWins;

  return (
    <SafeAreaView style={[s.page, { backgroundColor: t.colors.background }]}>
      <View style={{ flex: 1 }}>
        {/* ===== TOP MENU ===== */}
        <View
          style={[
            s.card,
            s.topCard,
            { backgroundColor: t.colors.card, borderColor: t.colors.border },
          ]}
        >
          <View style={[s.rowStart, { gap: 8, flexWrap: "wrap" }]}>
            <Ripple
              onPress={handleBack}
              style={[s.iconBtn, { backgroundColor: t.colors.card }]}
              rippleContainerBorderRadius={8}
            >
              <MaterialIcons
                name="arrow-back"
                size={20}
                color={t.colors.text}
              />
            </Ripple>

            {/* CODE | BOx | Gx */}
            <View
              style={[
                s.chip,
                {
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                  backgroundColor: t.chipInfoBg,
                  borderColor: t.chipInfoBd,
                },
              ]}
            >
              <Text style={[s.matchCodeText, { color: t.colors.text }]}>
                {headerText}
              </Text>
            </View>

            <View style={{ flexDirection: "row", gap: 6, flexShrink: 0 }}>
              {cta && (
                <Ripple
                  onPress={cta.onPress}
                  style={
                    cta.danger
                      ? s.btnDangerSm
                      : [s.btnSuccessSm, { backgroundColor: t.success }]
                  }
                  rippleContainerBorderRadius={10}
                >
                  <Text
                    style={cta.danger ? s.btnDangerSmText : s.btnSuccessSmText}
                  >
                    {cta.label}
                  </Text>
                </Ripple>
              )}

              <Ripple
                onPress={onUndo}
                disabled={undoBusy || !undoStack.current.length}
                style={[
                  s.btnUndoSm,
                  (undoBusy || !undoStack.current.length) && s.btnDisabled,
                ]}
                rippleContainerBorderRadius={10}
              >
                {undoBusy ? (
                  <ActivityIndicator size="small" />
                ) : (
                  <MaterialIcons name="undo" size={16} color="#92400e" />
                )}
                <Text style={s.btnUndoSmText}>Hoàn tác</Text>
              </Ripple>

              <Ripple
                onPress={swapSides}
                style={[
                  s.btnSwapSm,
                  {
                    backgroundColor: t.chipInfo2Bg,
                    borderColor: t.chipInfo2Bd,
                  },
                ]}
                rippleContainerBorderRadius={10}
              >
                <MaterialIcons
                  name="swap-horiz"
                  size={16}
                  color={t.colors.text}
                />
                <Text style={[s.btnSwapSmText, { color: t.chipInfo2Fg }]}>
                  Đổi bên
                </Text>
              </Ripple>
              <Ripple
                onPress={() => setMenuOpen(true)}
                rippleContainerBorderRadius={999}
                style={[
                  s.btnDraw,
                  {
                    // viền theo màu chủ đạo, nền nhạt theo theme
                    borderColor: t.colors.primary,
                    backgroundColor: t.dark ? "#0a84ff22" : "#0a84ff15",
                  },
                ]}
              >
                <MaterialIcons
                  name="casino"
                  size={16}
                  color={t.colors.primary}
                />
                <Text style={[s.btnDrawText, { color: t.colors.primary }]}>
                  Bốc thăm
                </Text>
              </Ripple>
            </View>

            {/* Toggle người giao #1/#2 */}
            <Ripple
              onPress={toggleServerNum}
              disabled={incBusy || undoBusy}
              style={[
                s.btnOutlineSm,
                {
                  width: 54,
                  height: 36,
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  backgroundColor: t.colors.card,
                  borderColor: t.colors.border,
                },
                (incBusy || undoBusy) && s.btnDisabled,
              ]}
              rippleContainerBorderRadius={10}
            >
              <Text style={[s.btnOutlineSmText, { color: t.colors.text }]}>
                {activeServerNum}
              </Text>
            </Ripple>

            {/* Gán/Đổi sân (court) */}
            <Ripple
              onPress={() => setCourtOpen(true)}
              style={[
                s.btnOutlineSm,
                {
                  backgroundColor: t.colors.card,
                  borderColor: t.colors.border,
                },
              ]}
              rippleContainerBorderRadius={10}
            >
              <MaterialIcons
                name="edit-location"
                size={16}
                color={t.colors.text}
              />
              <Text style={[s.btnOutlineSmText, { color: t.colors.text }]}>
                {currentCourtId ? "Đổi sân" : "Gán sân"}
              </Text>
            </Ripple>
          </View>
        </View>
        {/* Nút text hiển thị TÊN SÂN — chỉ hiện khi đã gán sân và có tên */}
        {currentCourtId && !!currentCourtName ? (
          <View
            style={[
              s.btnCourtNameSm,
              { backgroundColor: t.colors.card, borderColor: t.colors.border },
            ]}
          >
            <Text
              style={[s.btnCourtNameSmText, { color: t.colors.text }]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {currentCourtName}
            </Text>
          </View>
        ) : null}

        {/* ===== SCOREBOARD ===== */}
        <View
          style={[
            s.card,
            s.scoreboardCard,
            { backgroundColor: t.colors.card, borderColor: t.colors.border },
          ]}
        >
          <View style={s.scoreboardBody}>
            <View
              style={[s.rowBetween, { alignItems: "stretch", gap: 8, flex: 1 }]}
            >
              <TeamSimple
                teamKey={leftSide}
                players={leftSide === "A" ? playersA : playersB}
                slotsNow={leftSide === "A" ? slotsNowA : slotsNowB}
                onSwap={() => swapTeamSlots(leftSide)}
                isServing={leftSide === activeSide}
                activeSide={activeSide}
                serverUidShow={serverUidShow}
                onPressAvatar={openCccd}
              />

              <View
                style={[
                  s.centerCol,
                  {
                    backgroundColor: t.colors.card,
                    borderColor: t.colors.border,
                  },
                ]}
              >
                <WinTargetTuner
                  value={ptw}
                  base={ptwBoost ? ptw - 4 : ptw}
                  onToggle={() => {
                    setPointsToWinDelta(ptwBoost ? -4 : +4);
                  }}
                />

                <Text style={[s.callout, { color: t.colors.text }]}>
                  {callout || "—"}
                </Text>

                <View style={[s.rowBetween, { width: "100%", marginTop: 6 }]}>
                  <Text style={[s.scoreNow, { color: t.success }]}>
                    {leftGameScore}
                  </Text>
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "700",
                      opacity: 0.8,
                      textTransform: "uppercase",
                      color: t.colors.text,
                    }}
                  >
                    Game
                  </Text>
                  <Text style={[s.scoreNow, { color: t.success }]}>
                    {rightGameScore}
                  </Text>
                </View>

                <View style={[s.rowBetween, { width: "100%", marginTop: 4 }]}>
                  <Text style={[s.setWin, { color: t.colors.text }]}>
                    {leftSetWins}
                  </Text>
                  <Text
                    style={{
                      opacity: 0.65,
                      fontSize: 16,
                      fontWeight: "700",
                      color: t.colors.text,
                    }}
                  >
                    Match
                  </Text>
                  <Text style={[s.setWin, { color: t.colors.text }]}>
                    {rightSetWins}
                  </Text>
                </View>
              </View>

              <TeamSimple
                teamKey={rightSide}
                players={rightSide === "A" ? playersA : playersB}
                slotsNow={rightSide === "A" ? slotsNowA : slotsNowB}
                onSwap={() => swapTeamSlots(rightSide)}
                isServing={rightSide === activeSide}
                activeSide={activeSide}
                serverUidShow={serverUidShow}
                onPressAvatar={openCccd}
              />
            </View>
          </View>
        </View>

        {/* ===== BOTTOM CONTROL CARD ===== */}
        <View
          style={[
            s.card,
            s.bottomCard,
            { backgroundColor: t.colors.card, borderColor: t.colors.border },
          ]}
        >
          <View style={s.bottomBar}>
            <Text
              style={[s.clockText, s.clockAbsolute, { color: t.colors.text }]}
            >
              {now.getHours().toString().padStart(2, "0")}:
              {now.getMinutes().toString().padStart(2, "0")}:
              {now.getSeconds().toString().padStart(2, "0")}
            </Text>

            <View style={[s.row, s.bottomActions]}>
              <Ripple
                onPress={() => inc(leftSide)}
                disabled={!leftEnabled}
                rippleContainerBorderRadius={12}
                style={[
                  s.bigActionBtn,
                  {
                    backgroundColor: t.colors.card,
                    borderColor: t.colors.border,
                  },
                  activeSide === leftSide && {
                    backgroundColor: t.colors.primary,
                    borderColor: t.colors.primary,
                  },
                  !leftEnabled && s.btnDisabled,
                ]}
              >
                {incBusy ? (
                  <ActivityIndicator />
                ) : (
                  <MaterialIcons
                    name="add"
                    size={22}
                    color={activeSide === leftSide ? "#fff" : t.colors.text}
                  />
                )}
                <Text
                  style={[
                    s.bigActionText,
                    { color: t.colors.text },
                    activeSide === leftSide && s.bigActionTextActive,
                  ]}
                >
                  Đội bên trái
                </Text>
              </Ripple>

              {/* Nút giữa động: Đổi tay <-> Đổi giao */}
              <Ripple
                onPress={onMidPress}
                disabled={incBusy || undoBusy}
                rippleContainerBorderRadius={12}
                style={[s.toggleBtn, (incBusy || undoBusy) && s.btnDisabled]}
              >
                <MaterialIcons name={midIcon} size={22} color="#fff" />
                <Text style={s.toggleText}>{midLabel}</Text>
              </Ripple>

              <Ripple
                onPress={() => inc(rightSide)}
                disabled={!rightEnabled}
                rippleContainerBorderRadius={12}
                style={[
                  s.bigActionBtn,
                  {
                    backgroundColor: t.colors.card,
                    borderColor: t.colors.border,
                  },
                  activeSide === rightSide && {
                    backgroundColor: t.colors.primary,
                    borderColor: t.colors.primary,
                  },
                  !rightEnabled && s.btnDisabled,
                ]}
              >
                {incBusy ? (
                  <ActivityIndicator />
                ) : (
                  <MaterialIcons
                    name="add"
                    size={22}
                    color={activeSide === rightSide ? "#fff" : t.colors.text}
                  />
                )}
                <Text
                  style={[
                    s.bigActionText,
                    { color: t.colors.text },
                    activeSide === rightSide && s.bigActionTextActive,
                  ]}
                >
                  Đội bên phải
                </Text>
              </Ripple>
            </View>
          </View>
        </View>
      </View>

      {/* ===== Modal CCCD ===== */}
      <CCCDModal
        visible={cccdOpen}
        onClose={() => setCccdOpen(false)}
        user={cccdUser}
      />

      {/* ===== Prompt đổi bên giữa game ===== */}
      <Modal
        visible={midPromptOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMidPromptOpen(false)}
        supportedOrientations={[
          "portrait",
          "landscape-left",
          "landscape-right",
          "landscape",
        ]}
      >
        <View style={s.promptMask}>
          <View
            style={[
              s.promptCard,
              { backgroundColor: t.colors.card, borderColor: t.colors.border },
            ]}
          >
            <Text style={[s.promptTitle, { color: t.colors.text }]}>
              Đổi bên?
            </Text>
            <Text style={[s.promptText, { color: t.subtext }]}>
              Một đội vừa chạm {midPoint ?? "—"} điểm (giữa game). Bạn có muốn
              đổi bên ngay bây giờ không?
            </Text>
            <View style={s.promptRow}>
              <Ripple
                onPress={() => setMidPromptOpen(false)}
                rippleContainerBorderRadius={10}
                style={[
                  s.btnOutline,
                  {
                    backgroundColor: t.colors.card,
                    borderColor: t.colors.border,
                  },
                ]}
              >
                <Text style={[s.btnOutlineText, { color: t.colors.text }]}>
                  Để sau
                </Text>
              </Ripple>
              <Ripple
                onPress={() => {
                  setMidPromptOpen(false);
                  swapSides();
                }}
                rippleContainerBorderRadius={10}
                style={[s.btnPrimary, { backgroundColor: t.colors.primary }]}
              >
                <Text style={s.btnPrimaryText}>Đổi bên</Text>
              </Ripple>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== Menu modal ===== */}
      <Modal
        visible={menuOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setMenuOpen(false)}
        supportedOrientations={[
          "portrait",
          "landscape-left",
          "landscape-right",
          "landscape",
        ]}
      >
        <SafeAreaView
          style={[s.fullModalWrap, { backgroundColor: t.colors.background }]}
        >
          <View style={[s.rowBetween, { padding: 12 }]}>
            <Text style={[s.h6, { color: t.colors.text }]}></Text>
            <Ripple
              onPress={() => setMenuOpen(false)}
              style={[s.iconBtn, { backgroundColor: t.colors.card }]}
              rippleContainerBorderRadius={8}
            >
              <MaterialIcons name="close" size={20} color={t.colors.text} />
            </Ripple>
          </View>

          <View style={s.fullModalBody}>
            <ColorCoinToss />
          </View>
        </SafeAreaView>
      </Modal>

      {/* ===== Court assign fullscreen modal ===== */}
      <CourtAssignModalFull
        visible={courtOpen}
        onClose={() => setCourtOpen(false)}
        matchId={match?._id}
        currentCourtId={currentCourtId}
        onAssigned={() => {
          refetch();
        }}
      />
    </SafeAreaView>
  );
}

/* ========== styles ========== */
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#fff" },
  fullNameText: { fontSize: 16, fontWeight: "800", color: "#0f172a" },
  nickText: { fontSize: 14, fontWeight: "800", color: "#0f172a" },
  center: { padding: 16, alignItems: "center", justifyContent: "center" },

  row: { flexDirection: "row", alignItems: "center" },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowStart: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
  },

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
  topCard: { padding: 10, borderWidth: 0, borderColor: "transparent" },
  bottomCard: {
    paddingVertical: 10,
    borderWidth: 0,
    borderColor: "transparent",
  },

  scoreboardCard: { flex: 1, minHeight: 0, padding: 10 },
  scoreboardBody: { flex: 1, justifyContent: "center" },

  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  iconBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: "#f2f0f5",
  },

  btnOutlineSm: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff",
  },
  btnOutlineSmText: { color: "#111827", fontWeight: "700" },

  btnSwapSm: {
    backgroundColor: "#e0f2fe",
    borderWidth: 1,
    borderColor: "#bae6fd",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  btnSwapSmText: { color: "#0f172a", fontWeight: "700" },

  btnDangerSm: {
    backgroundColor: "#ef4444",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  btnDangerSmText: { color: "#fff", fontWeight: "800" },

  btnSuccessSm: {
    backgroundColor: "#10b981",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  btnSuccessSmText: { color: "#fff", fontWeight: "800" },

  centerCol: {
    flex: 1,
    borderWidth: 2,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    position: "relative",
  },
  callout: {
    fontSize: 30,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: 2,
    marginBottom: 8,
  },
  scoreNow: { fontSize: 30, fontWeight: "800", color: "#0f172a" },
  scoreNowText: { color: "#16a34a" },
  setWin: { fontSize: 30, fontWeight: "800", color: "#111827" },

  teamBox: {
    flex: 1,
    borderWidth: 2,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 10,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  teamTitle: { fontWeight: "900", color: "#0f172a", marginBottom: 2 },
  teamBoxActive: { backgroundColor: "#e0f2fe", borderColor: "#7dd3fc" },

  badgeName: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },

  clockText: { fontWeight: "900", color: "#0f172a" },
  bigActionBtn: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  bigActionBtnActive: { backgroundColor: "#1d4ed8", borderColor: "#1e40af" },
  bigActionText: { fontWeight: "800", color: "#0f172a" },
  bigActionTextActive: { color: "#fff", fontWeight: "800" },

  toggleBtn: {
    backgroundColor: "#d97706",
    borderWidth: 1,
    borderColor: "#b45309",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  toggleText: { fontWeight: "800", color: "#fff" },

  h6: { fontSize: 16, fontWeight: "800", color: "#0f172a" },
  alertError: {
    backgroundColor: "#fee2e2",
    borderColor: "#fecaca",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  alertText: { color: "#111827" },

  bottomBar: {
    position: "relative",
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  clockAbsolute: {
    position: "absolute",
    left: 12,
    top: "50%",
    transform: [{ translateY: -10 }],
  },
  bottomActions: { gap: 8, alignItems: "center", justifyContent: "center" },

  matchCodeText: { fontSize: 18, fontWeight: "700", color: "#0f172a" },

  fullModalWrap: { flex: 1, backgroundColor: "#fff" },
  fullModalBody: { flex: 1 },
  fullModalText: { fontSize: 20, fontWeight: "800", color: "#0f172a" },

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
  btnDisabled: { opacity: 0.5 },

  // Win target tuner
  winRowAbsolute: {
    position: "absolute",
    top: 6,
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 2,
  },
  winPairRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  winCenterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  winDigitBubble: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#fbbf24",
    borderWidth: 1,
    borderColor: "#f59e0b",
    alignItems: "center",
    justifyContent: "center",
  },
  winDigitText: { fontSize: 12, fontWeight: "800", color: "#111827" },
  winAdjustBubble: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  winAdjustPlus: { backgroundColor: "#ef4444", borderColor: "#dc2626" },
  winAdjustMinus: { backgroundColor: "#dc2626", borderColor: "#b91c1c" },

  // Serve icon absolute
  serveIconBadge: {
    position: "absolute",
    right: 4,
    top: "50%",
    transform: [{ translateY: -13 }],
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#0284c7",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#7dd3fc",
    zIndex: 3,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },

  // undo (amber)
  btnUndoSm: {
    backgroundColor: "#fef3c7",
    borderWidth: 1,
    borderColor: "#fde68a",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  btnUndoSmText: { color: "#92400e", fontWeight: "700" },

  // prompt
  promptMask: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  promptCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  promptTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 8,
  },
  promptText: { fontSize: 14, color: "#111827", marginBottom: 12 },
  promptRow: { flexDirection: "row", gap: 8 },
  topBar: { height: 10, borderRadius: 8 },
  coinPanel: {
    flex: 1,
    minHeight: 110,
    borderWidth: 2,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  coinTitle: { fontSize: 18, fontWeight: "900" },
  btnCourtNameSm: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    maxWidth: 180,
  },
  btnCourtNameSmText: {
    fontWeight: "700",
    fontSize: 14,
  },
  btnDraw: {
    minHeight: 36,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    // nhẹ nhàng nổi khối
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 1,
  },
  btnDrawText: { fontWeight: "800" },
});
