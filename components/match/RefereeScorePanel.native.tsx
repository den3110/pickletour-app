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
  Touchable,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import Ripple from "react-native-material-ripple";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
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
import { useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";
import { normalizeUrl } from "@/utils/normalizeUri";
import CCCDModal from "../CCCDModal.native";
import { useTheme } from "@react-navigation/native";
import { useUserMatchHeader } from "@/hooks/useUserMatchHeader";
import { LinearGradient } from "expo-linear-gradient"; // ✅ NEW
import MatchSettingsModal from "./MatchSettingsModal";
import { useVoiceCommands } from "@/hooks/useVoiceCommands";

const VOICE_API_URL = "https://pickletour.vn/api/api/voice/parse";
// ✅ THÊM: Import Speech
import * as Speech from "expo-speech";
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
const userIdOf = (u) => {
  // 1. Ưu tiên lấy ID user hệ thống (nếu có)
  const id = u?.user?._id || u?.user || u?._id || u?.id || u?.uid;
  if (id) return String(id);

  // 2. Nếu là UserMatch (Guest/Khách) không có ID -> dùng Tên làm định danh
  // Cần đảm bảo tên khác nhau, nếu trùng tên thì logic này vẫn rủi ro nhẹ nhưng đỡ hơn là ""
  return u?.fullName || u?.name || u?.displayName || u?.nickName || "";
};
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

const preStartRightSlotForSide = (side, leftSide) =>
  leftSide === side ? 2 : 1;
const oppositeSlot = (slot) => (Number(slot) === 1 ? 2 : 1);

/* ✅ Luôn ưu tiên theo USER (serverId / lastServerUid)
   ✅ Chỉ fallback theo slot khi chưa có gì */
const computeServerUid = ({
  serve,
  isStartOfGame,
  activeServerNum,
  activeSide,
  leftSide,
  getUidAtSlotNow,
  lastServerUid,
}) => {
  const sId = serve?.serverId ? String(serve.serverId) : "";
  if (sId) return sId;

  // ✅ nếu đã nhớ người giao gần nhất → bám theo người
  if (lastServerUid) return lastServerUid;

  // ✅ fallback cuối cùng: chỉ dùng khi 0-0-2 và chưa biết serverId
  if (isStartOfGame && activeServerNum === 2) {
    const rightSlot = preStartRightSlotForSide(activeSide, leftSide);
    return (
      getUidAtSlotNow?.(activeSide, rightSlot) ||
      getUidAtSlotNow?.(activeSide, oppositeSlot(rightSlot)) ||
      ""
    );
  }

  return "";
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
      user?.avatar || user?.avatarURL || user?.photoURL || user?.picture || "",
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
  },
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
  },
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

// Đặt cái này ở bên ngoài RefereeJudgePanel hoặc trong file riêng
const LiveClock = memo(function LiveClock({ style }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const tmr = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(tmr);
  }, []);

  const timeString = [
    now.getHours().toString().padStart(2, "0"),
    now.getMinutes().toString().padStart(2, "0"),
    now.getSeconds().toString().padStart(2, "0"),
  ].join(":");

  return <Text style={style}>{timeString}</Text>;
});

// Đặt cái này ở bên ngoài RefereeJudgePanel
const BreakTimer = memo(function BreakTimer({ endTime, style }) {
  const [display, setDisplay] = useState("00:00");

  useEffect(() => {
    if (!endTime) return;

    const tick = () => {
      const remaining = endTime - Date.now();
      if (remaining <= 0) {
        setDisplay("00:00");
      } else {
        const m = Math.floor(remaining / 60000)
          .toString()
          .padStart(2, "0");
        const s = Math.floor((remaining % 60000) / 1000)
          .toString()
          .padStart(2, "0");
        setDisplay(`${m}:${s}`);
      }
    };

    tick(); // chạy ngay lập tức
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [endTime]);

  return <Text style={style}>{display}</Text>;
});

/* ✅ COMPONENT: TIMEOUT HEADER (Fix: Right Team Gray Direction) */
function TimeoutHeader({
  leftTO,
  leftMed,
  rightTO,
  rightMed,
  limitTO,
  limitMed,
  timeoutMinutes,
  onTimeout,
  onMedical,
  disabled,
}) {
  const t = useTokens();
  const isDisabled = disabled;

  const leftScrollRef = useRef(null);
  const rightScrollRef = useRef(null);

  // --- Helper: Render Button ---
  const renderBtn = (type, remaining, totalLimit, teamSideUI) => {
    let buttons = [];
    const limit = totalLimit || (type === "med" ? 1 : 2);

    for (let i = 0; i < limit; i++) {
      // Logic: i chạy từ 0 -> limit.
      // Nếu còn 2, limit 3: i=0(Active), i=1(Active), i=2(Used)
      const isUsed = i >= remaining;
      const isMed = type === "med";

      // Màu xám đậm cho trạng thái đã dùng
      const usedColor = "#475569";

      buttons.push(
        <Ripple
          key={`${type}-${teamSideUI}-${i}`}
          onPress={() =>
            !isUsed && (isMed ? onMedical(teamSideUI) : onTimeout(teamSideUI))
          }
          disabled={isDisabled || isUsed}
          rippleContainerBorderRadius={999}
          style={{ marginHorizontal: 3 }}
        >
          <View
            style={[
              isMed ? s.winAdjustBubble : s.winDigitBubble,
              isUsed ? s.bubbleUsed : isMed ? s.winAdjustPlus : {},
              isDisabled && !isUsed && { opacity: 0.5 },
            ]}
          >
            {isMed ? (
              <MaterialIcons
                name="add"
                size={14}
                color={isUsed ? usedColor : "#fff"}
              />
            ) : (
              <Text style={[s.winDigitText, isUsed && { color: usedColor }]}>
                {timeoutMinutes || 1}
              </Text>
            )}
          </View>
        </Ripple>,
      );
    }

    // 🔥 FIX QUAN TRỌNG Ở ĐÂY:
    // Với đội PHẢI (right): Đảo ngược mảng để các nút "Used" (Xám) nằm bên Trái, "Active" nằm bên Phải.
    // Kết quả: [Used] [Used] [Active] -> Đúng ý "xám từ trái qua phải"
    if (teamSideUI === "right") {
      return buttons.reverse();
    }

    return buttons;
  };

  // --- Scroll Hint Arrow ---
  const ScrollBtn = ({ dir, onPress }) => (
    <Ripple
      onPress={onPress}
      rippleContainerBorderRadius={999}
      style={{
        justifyContent: "center",
        alignItems: "center",
        width: 24,
        height: 24,
        zIndex: 20,
      }}
    >
      <MaterialIcons
        name={dir === "left" ? "chevron-left" : "chevron-right"}
        size={22}
        color={t.muted}
      />
    </Ripple>
  );

  return (
    <View style={s.winRowAbsolute}>
      {/* ================= TRÁI (LEFT TEAM) ================= */}
      <View
        style={{
          flex: 1,
          marginRight: 8,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <ScrollBtn
          dir="left"
          onPress={() =>
            leftScrollRef.current?.scrollTo({ x: 0, animated: true })
          }
        />

        <ScrollView
          ref={leftScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          onContentSizeChange={() =>
            leftScrollRef.current?.scrollToEnd({ animated: false })
          }
          contentContainerStyle={{
            alignItems: "center",
            paddingHorizontal: 2,
            justifyContent: "flex-end",
            flexGrow: 1,
          }}
        >
          {renderBtn("to", leftTO, limitTO, "left")}
          {renderBtn("med", leftMed, limitMed, "left")}
        </ScrollView>
      </View>

      {/* ================= PHẢI (RIGHT TEAM) ================= */}
      <View
        style={{
          flex: 1,
          marginLeft: 8,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <ScrollView
          ref={rightScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            alignItems: "center",
            paddingHorizontal: 2,
            justifyContent: "flex-start",
            flexGrow: 1,
          }}
        >
          {/* Thứ tự gọi hàm renderBtn vẫn giữ nguyên, logic đảo nằm bên trong hàm */}
          {renderBtn("med", rightMed, limitMed, "right")}
          {renderBtn("to", rightTO, limitTO, "right")}
        </ScrollView>

        <ScrollBtn
          dir="right"
          onPress={() =>
            rightScrollRef.current?.scrollToEnd({ animated: true })
          }
        />
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
      { skip: !visible || !matchId },
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
          (courts.find((x) => (x?._id || x?.id) === courtId) || {}).name,
        ) || "";
      Alert.alert(
        "Đã gán sân",
        courtName ? `Sân: ${courtName}` : "Gán sân thành công",
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
  const params = useLocalSearchParams();
  const { userMatch } = params;
  useUserMatchHeader(userMatch && "user");
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

  // override luật local (từ modal cấu hình)
  const [bestOfOverride, setBestOfOverride] = useState(null);
  const [winByTwoOverride, setWinByTwoOverride] = useState(null);

  // ====== derive ======
  // ====== derive ======
  const matchRules = match?.rules || {};
  const rules = {
    bestOf: Number(
      bestOfOverride != null
        ? bestOfOverride
        : matchRules.bestOf != null
          ? matchRules.bestOf
          : 1,
    ),
    pointsToWin: Number(
      matchRules.pointsToWin != null ? matchRules.pointsToWin : 11,
    ),
    winByTwo:
      winByTwoOverride != null
        ? !!winByTwoOverride
        : matchRules.winByTwo != null
          ? !!matchRules.winByTwo
          : true,
  };

  const basePointsToWin = Number(rules.pointsToWin || 11);
  const [ptw, setPtw] = useState(basePointsToWin);
  const [ptwBoost, setPtwBoost] = useState(false);
  const eventType = (match?.tournament?.eventType || "double").toLowerCase();
  const gs = match?.gameScores || [];
  const isPreMatch =
    (match?.status !== "live" && gs.length === 0) ||
    match?.status === "scheduled";
  const [leftRight, setLeftRight] = useState({ left: "A", right: "B" });
  const leftSide = leftRight.left;
  const rightSide = leftRight.right;
  const theCurIdx = Math.max(0, gs.length - 1);
  const curIdx = theCurIdx;
  const serverA = Number(gs[curIdx]?.a ?? 0);
  const serverB = Number(gs[curIdx]?.b ?? 0);
  const scoreGuardRef = useRef({ a: null, b: null, until: 0 });

  const g = scoreGuardRef.current;
  const guardOn = g && Date.now() < g.until;

  // nếu đang guard, không cho điểm hiển thị "tụt" xuống
  const curA =
    guardOn && typeof g.a === "number" ? Math.max(serverA, g.a) : serverA;

  const curB =
    guardOn && typeof g.b === "number" ? Math.max(serverB, g.b) : serverB;

  const playersA = useMemo(
    () => playersOf(match?.pairA, eventType),
    [match?.pairA, eventType],
  );
  const playersB = useMemo(
    () => playersOf(match?.pairB, eventType),
    [match?.pairB, eventType],
  );

  const slotsBase = match?.slots?.base || match?.meta?.slots?.base || {};
  // Optimistic override: vị trí ô được cập nhật ngay khi đổi bên, không chờ server
  const [localBaseOverride, setLocalBaseOverride] = useState<{
    A: Record<string, number>;
    B: Record<string, number>;
  } | null>(null);

  // Clear override khi server data mới về (slotsBase thay đổi)
  useEffect(() => {
    if (localBaseOverride) setLocalBaseOverride(null);
  }, [slotsBase?.A, slotsBase?.B]);

  const baseA = useMemo(() => {
    const raw = localBaseOverride?.A || slotsBase?.A || {};
    const out = { ...raw };
    const ids = playersA.map(userIdOf);
    if (ids[0] && !out[ids[0]]) out[ids[0]] = 1;
    if (ids[1] && !out[ids[1]]) out[ids[1]] = 2;
    return out;
  }, [slotsBase?.A, localBaseOverride?.A, playersA]);
  const baseB = useMemo(() => {
    const raw = localBaseOverride?.B || slotsBase?.B || {};
    const out = { ...raw };
    const ids = playersB.map(userIdOf);
    if (ids[0] && !out[ids[0]]) out[ids[0]] = 1;
    if (ids[1] && !out[ids[1]]) out[ids[1]] = 2;
    return out;
  }, [slotsBase?.B, localBaseOverride?.B, playersB]);

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
        ([, v]) => Number(v) === Number(slotNum),
      );
      return entry ? entry[0] : null;
    },
    [slotsNowA, slotsNowB],
  );

  // ==== Serve state
  const serve = match?.serve || { side: "A", server: 2, serverId: "" };
  const activeSide = serve?.side === "B" ? "B" : "A";
  const activeServerNum =
    Number(serve?.order ?? serve?.server ?? 1) === 2 ? 2 : 1;

  // Nhớ người giao gần nhất để icon không “nhảy theo ô”
  const lastServerUidRef = useRef("");
  const startServer2Ref = useRef({ gameIndex: -1, side: "", uid: "" });

  // ✅ Pin tạm thời serverUid để tránh icon nhảy 2 lần do refetch/socket lệch nhịp
  const forcedServerRef = useRef({
    uid: "",
    until: 0,
    gameIndex: -1,
    side: "",
    serverNum: 0,
  }); // ✅ Chặn score render bị "lùi" gây nhảy slot trong 1-1.5s

  // ✅ Snapshot để chống "serverId nhảy" sau khi đội đang giao ghi điểm
  const prevServeSnapRef = useRef({
    gameIndex: -1,
    curA: 0,
    curB: 0,
    activeSide: "A",
    activeServerNum: 2,
    serverUidShow: "",
  });

  // Đầu game (0-0-2) icon phải nằm ở ô phải/even
  const isStartOfGame = Number(curA) === 0 && Number(curB) === 0;
  const pinnedStart2 =
    startServer2Ref.current.gameIndex === curIdx &&
    startServer2Ref.current.side === activeSide
      ? startServer2Ref.current.uid
      : "";

  // raw từ server (có thể "nhảy" sau khi inc điểm)
  const rawServerUid = serve?.serverId ? String(serve.serverId) : "";

  // ✅ forced uid còn hiệu lực thì ưu tiên tuyệt đối
  const forcedUid =
    forcedServerRef.current.uid &&
    Date.now() < forcedServerRef.current.until &&
    forcedServerRef.current.gameIndex === curIdx &&
    forcedServerRef.current.side === activeSide &&
    Number(forcedServerRef.current.serverNum) === Number(activeServerNum)
      ? forcedServerRef.current.uid
      : "";

  // ✅ Detect case: đội đang giao ghi điểm, serve.side + serveNum không đổi
  const prevSnap = prevServeSnapRef.current || {};
  const serveSameAsPrev =
    prevSnap.gameIndex === curIdx &&
    prevSnap.activeSide === activeSide &&
    Number(prevSnap.activeServerNum) === Number(activeServerNum);

  const serveSideScored =
    serveSameAsPrev &&
    (activeSide === "A"
      ? Number(curA) === Number(prevSnap.curA) + 1 &&
        Number(curB) === Number(prevSnap.curB)
      : Number(curB) === Number(prevSnap.curB) + 1 &&
        Number(curA) === Number(prevSnap.curA));

  const stablePrevUid =
    prevSnap.serverUidShow || lastServerUidRef.current || "";

  // ✅ serverUidShow:
  // - nếu đúng case "đang giao ghi điểm" => GIỮ UID CŨ để icon không nhảy xuống ô dưới
  // - bình thường => ưu tiên rawServerUid, rồi pin start2, rồi last ref
  // ✅ base logic như cũ
  const baseServerUidShow = serveSideScored
    ? stablePrevUid ||
      rawServerUid ||
      (activeServerNum === 2 ? pinnedStart2 : "") ||
      lastServerUidRef.current ||
      ""
    : rawServerUid ||
      (activeServerNum === 2 ? pinnedStart2 : "") ||
      lastServerUidRef.current ||
      "";

  // ✅ forcedUid phải ưu tiên cao nhất để khỏi nhảy 2 lần
  const serverUidShow = forcedUid || baseServerUidShow;
  // ✅ INIT serve đầu game:
  // - double: 0-0-2 (server #2, người đang đứng ở ô phải/even)
  // - single: 0-0-1 (server #1)
  // Tự động set người giao bóng chuẩn theo bên đang đứng khi tỉ số 0-0
  const initServeDoneRef = useRef({});

  useEffect(() => {
    if (!match?._id) return;

    const inited = !!initServeDoneRef.current[curIdx];
    const is000 = Number(curA) === 0 && Number(curB) === 0;
    const isUserMatch = String(userMatch) === "true";

    // Nếu không phải 0-0 (đang đánh dở) hoặc đã init phiên này rồi thì thôi
    if ((!is000 && !waitingStart) || inited) return;

    const currentServerId = serve?.serverId ? String(serve.serverId) : "";

    // ⚠️ QUAN TRỌNG:
    // - Với Match thường: Nếu DB có data rồi thì tin tưởng DB.
    // - Với UserMatch: Kể cả DB có data, ta vẫn phải kiểm tra xem nó có đúng logic "Trọng tài" không.
    if (!isUserMatch && currentServerId) {
      lastServerUidRef.current = currentServerId;
      return;
    }

    const isDouble = eventType !== "single";
    const wantServerNum = isDouble ? 2 : 1;

    const rightSlot = preStartRightSlotForSide(activeSide, leftSide);
    const uidRight =
      getUidAtSlotNow(activeSide, rightSlot) ||
      getUidAtSlotNow(activeSide, oppositeSlot(rightSlot)) ||
      "";

    // Nếu UID tính ra KHÁC với UID đang lưu trên server (hoặc server chưa có)
    // -> Gửi lệnh SET đè lên ngay lập tức
    if (uidRight && currentServerId !== uidRight) {
      // Cập nhật UI tạm thời để không bị nhảy
      lastServerUidRef.current = uidRight;

      socket?.emit(
        "serve:set",
        {
          matchId: match._id,
          side: activeSide,
          server: wantServerNum,
          serverId: uidRight,
          userMatch,
        },
        (ack) => {
          if (ack?.ok) {
            initServeDoneRef.current[curIdx] = true;
            lastServerUidRef.current = uidRight;
            refetch();
          }
        },
      );
    } else if (currentServerId) {
      // Nếu đúng rồi thì thôi, đánh dấu đã init
      initServeDoneRef.current[curIdx] = true;
      lastServerUidRef.current = currentServerId;
    }
  }, [
    match?._id,
    curIdx,
    curA,
    curB,
    activeSide,
    serve?.serverId,
    serve?.order,
    serve?.server,
    socket,
    refetch,
    eventType,
    playersA,
    playersB,
    baseA,
    baseB,
    getUidAtSlotNow,
    userMatch,
    waitingStart,
    leftSide,
  ]);

  useEffect(() => {
    const is000 = Number(curA) === 0 && Number(curB) === 0;
    if (!is000) return;
    if (activeServerNum !== 2) return;

    const rightSlot = preStartRightSlotForSide(activeSide, leftSide);
    const uid =
      (serve?.serverId ? String(serve.serverId) : "") ||
      lastServerUidRef.current ||
      getUidAtSlotNow?.(activeSide, rightSlot) ||
      getUidAtSlotNow?.(activeSide, oppositeSlot(rightSlot)) ||
      "";

    if (uid) {
      startServer2Ref.current = { gameIndex: curIdx, side: activeSide, uid };
      lastServerUidRef.current = uid; // ✅ pin luôn để các chỗ khác dùng
    }
  }, [
    curIdx,
    curA,
    curB,
    activeSide,
    activeServerNum,
    serve?.serverId,
    getUidAtSlotNow,
    leftSide,
  ]);

  // Luôn ghi nhớ người giao hiện tại
  useEffect(() => {
    if (serverUidShow) lastServerUidRef.current = serverUidShow;
  }, [serverUidShow]);

  useEffect(() => {
    prevServeSnapRef.current = {
      gameIndex: curIdx,
      curA,
      curB,
      activeSide,
      activeServerNum,
      serverUidShow,
    };
  }, [curIdx, curA, curB, activeSide, activeServerNum, serverUidShow]);

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
      g.a > g.b,
  ).length;
  const bWins = gs.filter(
    (g) =>
      isGameWin(g?.a, g?.b, Number(rules.pointsToWin), rules.winByTwo) &&
      g.b > g.a,
  ).length;

  const needSetWinsVal = needWins(rules.bestOf);
  const matchDecided = aWins >= needSetWinsVal || bWins >= needSetWinsVal;

  const gameLocked = isGameWin(curA, curB, ptw, rules.winByTwo);

  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // const [now, setNow] = useState(new Date());
  const [cccdOpen, setCccdOpen] = useState(false);
  const [cccdUser, setCccdUser] = useState(null);
  const [midPointCustom, setMidPointCustom] = useState(null);

  // Busy flags
  const [incBusy, setIncBusy] = useState(false);
  const [undoBusy, setUndoBusy] = useState(false);

  // Track pending op
  const pendingOpRef = useRef(null);
  const opTimeoutRef = useRef(null);

  // Mid-game side switch prompt
  const [midPromptOpen, setMidPromptOpen] = useState(false);
  const midPointBase = ptw ? Math.ceil(Number(ptw) / 2) : null;
  const midPoint = midPointCustom ?? midPointBase;
  const midAskedRef = useRef({}); // { [gameIndex]: true }

  // ✅ THÊM: State quản lý bật/tắt giọng nói
  const [voiceEnabled, setVoiceEnabled] = useState(false);

  // Voice Commands (điều khiển bằng giọng nói)
  const [voiceCommandEnabled, setVoiceCommandEnabled] = useState(false);

  const handleVoiceCommand = useCallback(
    (cmd) => {
      switch (cmd.action) {
        case "INC_POINT":
          if (canScoreNow && !incBusy && !undoBusy) inc(activeSide);
          break;
        case "SIDE_OUT":
          if (!incBusy && !undoBusy) toggleServeSide();
          break;
        case "TOGGLE_SERVER":
          if (!incBusy && !undoBusy) toggleServerNum();
          break;
        case "SWAP_SIDES":
          if (!incBusy && !undoBusy) swapSides();
          break;
        case "UNDO":
          if (!undoBusy && undoStack.current.length) onUndo();
          break;
        case "TIMEOUT":
          if (canScoreNow)
            handleCallTimeout(activeSide === leftSide ? "left" : "right");
          break;
        case "CONTINUE":
          if (localBreak) handleContinue();
          break;
      }
    },
    [canScoreNow, incBusy, undoBusy, activeSide, leftSide, localBreak],
  );

  const {
    isListening: isVoiceListening,
    isProcessing: isVoiceProcessing,
    transcript: voiceTranscript,
  } = useVoiceCommands({
    enabled: voiceCommandEnabled && match?.status === "live",
    onCommand: handleVoiceCommand,
    apiUrl: VOICE_API_URL,
  });

  // ✅ THÊM: Hàm xử lý đọc điểm chuẩn Pickleball
  useEffect(() => {
    // Chỉ đọc khi: Đã bật voice, Match đang Live, và không phải lúc mới load chưa có dữ liệu
    if (!voiceEnabled || match?.status !== "live") return;

    // Logic xác định điểm để đọc (Luôn đọc điểm đội GIAO BÓNG trước)
    const serverScore = activeSide === "A" ? curA : curB;
    const receiverScore = activeSide === "A" ? curB : curA;

    // Kiểm tra đánh đơn hay đôi
    const isSingle = eventType === "single";

    let textToSpeak = "";

    if (isSingle) {
      // Đánh đơn: "10 - 8"
      textToSpeak = `${serverScore} , ${receiverScore}`;
    } else {
      // Đánh đôi: "10 - 8 - 2"
      textToSpeak = `${serverScore} , ${receiverScore} , ${activeServerNum}`;
    }

    // Nếu vừa bấm bắt đầu trận (0-0-2 hoặc 0-0-1) cũng cần đọc
    // Ngắt câu cũ nếu đang đọc dở để đọc câu mới ngay
    Speech.stop();

    // Đọc (tốc độ 1.1 cho gọn, ngôn ngữ tuỳ chỉnh hoặc để tự động)
    Speech.speak(textToSpeak, {
      rate: 1.0,
      pitch: 1.0,
      // language: 'vi-VN' // Nếu muốn ép tiếng Việt, hoặc để trống nó tự nhận theo máy
    });
  }, [
    voiceEnabled,
    match?.status,
    curA,
    curB,
    activeSide,
    activeServerNum,
    eventType,
  ]);
  // useEffect(() => {
  //   const tmr = setInterval(() => setNow(new Date()), 1000);
  //   return () => clearInterval(tmr);
  // }, []);

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
        JSON.stringify(undoStack.current),
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
    [matchId],
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

  // Khi đổi sang match khác thì reset cấu hình local
  useEffect(() => {
    setBestOfOverride(null);
    setWinByTwoOverride(null);
    setMidPointCustom(null);
  }, [match?._id]);

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
        },
      );
    },
    [match?._id, refetch, socket],
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
        },
      );
    },
    [match?._id, socket, ptw, persistPtwBoost, refetch],
  );

  /* --- Cấu hình Timeout Local --- */
  // 1. Cấu hình
  const timeoutPerGame = match?.timeoutPerGame ?? 2;
  const timeoutMinutes = match?.timeoutMinutes ?? 1;
  const medicalLimit = match?.medicalTimeouts ?? 1;

  // 2. State đếm số lượng còn lại
  const [toA, setToA] = useState(timeoutPerGame);
  const [toB, setToB] = useState(timeoutPerGame);
  const [medA, setMedA] = useState(medicalLimit);
  const [medB, setMedB] = useState(medicalLimit);

  // 3. State quản lý trạng thái nghỉ cục bộ (Local Break)
  // localBreak = null hoặc { type: 'timeout'|'medical', endTime: number }
  const [localBreak, setLocalBreak] = useState(null);
  // const [timerStr, setTimerStr] = useState("00:00");

  // Reset counter khi sang game mới
  useEffect(() => {
    setToA(timeoutPerGame);
    setToB(timeoutPerGame);
    setLocalBreak(null); // Reset trạng thái nghỉ nếu sang game mới
  }, [curIdx, timeoutPerGame]);

  // 4. Timer đếm ngược (Chạy khi localBreak != null)
  // useEffect(() => {
  //   let interval;
  //   if (localBreak) {
  //     const updateTimer = () => {
  //       const remaining = localBreak.endTime - Date.now();
  //       if (remaining <= 0) {
  //         setTimerStr("00:00");
  //         // Tự động kết thúc nghỉ khi hết giờ (tuỳ chọn, ở đây mình để user bấm Tiếp tục)
  //       } else {
  //         // Format mm:ss (02:05)
  //         const m = Math.floor(remaining / 60000)
  //           .toString()
  //           .padStart(2, "0");
  //         const s = Math.floor((remaining % 60000) / 1000)
  //           .toString()
  //           .padStart(2, "0");
  //         setTimerStr(`${m}:${s}`);
  //       }
  //     };
  //     updateTimer();
  //     interval = setInterval(updateTimer, 1000);
  //   } else {
  //     setTimerStr("00:00");
  //   }
  //   return () => clearInterval(interval);
  // }, [localBreak]);

  // 5. Hàm xử lý gọi Timeout/Y tế (Chỉ trừ số & bật local timer)
  const handleCallTimeout = async (teamSideUI) => {
    if (localBreak) return; // Đang nghỉ thì không bấm được
    const teamKey = teamSideUI === "left" ? leftSide : rightSide;
    const currentVal = teamKey === "A" ? toA : toB;
    if (currentVal <= 0) return;

    // Trừ số lượng (LOCAL STATE)
    if (teamKey === "A") setToA((p) => p - 1);
    else setToB((p) => p - 1);

    // Kích hoạt timer cục bộ (Thời gian từ config)
    const durationMs = timeoutMinutes * 60 * 1000;
    setLocalBreak({
      type: "timeout",
      endTime: Date.now() + durationMs,
      teamKey,
    });

    // API Call (Tùy chọn, nếu bạn vẫn muốn log lên server)
    // socket?.emit('timeout:called', { matchId: match._id, teamKey });
  };

  const handleCallMedical = async (teamSideUI) => {
    if (localBreak) return;
    const teamKey = teamSideUI === "left" ? leftSide : rightSide;
    const currentVal = teamKey === "A" ? medA : medB;
    if (currentVal <= 0) return;

    if (teamKey === "A") setMedA((p) => p - 1);
    else setMedB((p) => p - 1);

    // Y tế nghỉ 5 phút (ví dụ)
    const durationMs = 5 * 60 * 1000;
    setLocalBreak({
      type: "medical",
      endTime: Date.now() + durationMs,
      teamKey,
    });
  };

  const handleContinue = () => {
    setLocalBreak(null); // Tắt màn hình nghỉ
  };

  // Điều kiện được phép cộng điểm: Match Live VÀ Không đang nghỉ (Local Break)
  const canScoreNow =
    match?.status === "live" && !matchDecided && !gameLocked && !localBreak;

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
        text2: matchDecided
          ? "Trận đã đủ số game thắng (BO)."
          : "Game đã kết thúc, vui lòng bấm 'Bắt game tiếp'.",
      });
      return;
    }

    if (side !== (serve?.side || "A")) return;

    const prevServerUid = serverUidShow || lastServerUidRef.current; // ✅ lấy đúng người đang cầm bóng trước khi cộng điểm
    // ✅ pin ngay lập tức để icon nhảy lên luôn và KHÔNG bị giật xuống
    if (prevServerUid) {
      forcedServerRef.current = {
        uid: prevServerUid,
        until: Date.now() + 800, // 500-800ms là đẹp
        gameIndex: curIdx,
        side: activeSide,
        serverNum: activeServerNum,
      };
      lastServerUidRef.current = prevServerUid;
    }
    setIncBusy(true);
    pendingOpRef.current = {
      type: "inc",
      side,
      prevA: curA,
      prevB: curB,
      t: Date.now(),
    };
    // ✅ chặn score "lùi" trong 1.5s để slot không flip -> bóng không nhảy 2 lần
    scoreGuardRef.current = {
      a: side === "A" ? curA + 1 : curA,
      b: side === "B" ? curB + 1 : curB,
      until: Date.now() + 1500,
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

      // ✅ IMPORTANT: đội đang giao ghi điểm -> người giao KHÔNG đổi
      if (prevServerUid) {
        lastServerUidRef.current = prevServerUid; // giữ local để UI không nhảy

        socket?.emit(
          "serve:set",
          {
            matchId: match._id,
            side: serve?.side || "A", // giữ nguyên đội đang giao
            server: activeServerNum, // giữ nguyên số tay (0-0-2 -> 1-0-2 vẫn là 2)
            serverId: prevServerUid, // ✅ ép đúng user đang giao
            userMatch,
          },
          () => {},
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

        // After undo, if score drops below midPoint → allow re-triggering the prompt
        const newA = entry.side === "A" ? curA - 1 : curA;
        const newB = entry.side === "B" ? curB - 1 : curB;
        if (
          midPoint != null &&
          midAskedRef.current[curIdx] &&
          newA < midPoint &&
          newB < midPoint
        ) {
          delete midAskedRef.current[curIdx];
        }

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
            userMatch,
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
          },
        );
      } else if (entry.t === "SLOTS_SET") {
        setUndoBusy(true);
        beginOpTimeout("undo");
        socket?.emit(
          "slots:setBase",
          { matchId: match?._id, base: entry.prevBase, userMatch },
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
          },
        );
      } else if (entry.t === "SWAP_SIDES") {
        setUndoBusy(true);
        setLeftRight(entry.prev);
        // Restore base slot positions: optimistic update ngay
        if (entry.prevBase) {
          setLocalBaseOverride(entry.prevBase);
          if (match?._id) {
            socket?.emit(
              "slots:setBase",
              { matchId: match._id, base: entry.prevBase, userMatch },
              (ack) => {
                if (ack?.ok) refetch();
              },
            );
          }
        }
        setUndoBusy(false);
      }
    } catch {
      setUndoBusy(false);
      Toast.show({ type: "error", text1: "Hoàn tác thất bại" });
    }
  };

  // --- ĐỔI GIAO: nếu CHƯA BẮT ĐẦU (status !== live HOẶC waitingStart) → 0-0-2; nếu đang live → tay 1
  // --- ĐỔI GIAO (SIDE OUT) ---
  // --- ĐỔI GIAO (SIDE OUT) ---
  const toggleServeSide = () => {
    if (!match?._id) return;

    const nextSide = activeSide === "A" ? "B" : "A";

    const nextTeamScore = nextSide === "A" ? curA : curB;
    const rightSlot = preStartRightSlotForSide(nextSide, leftSide);
    const targetSlot =
      Number(nextTeamScore) % 2 === 0 ? rightSlot : oppositeSlot(rightSlot);
    const nextSlotsMap = nextSide === "A" ? slotsNowA : slotsNowB;
    const uidFound = Object.keys(nextSlotsMap).find(
      (uid) => Number(nextSlotsMap[uid]) === targetSlot,
    );

    // ... (giữ nguyên phần code xử lý bên dưới)
    const prev = {
      side: activeSide,
      server: activeServerNum,
      serverId: serverUidShow,
    };

    const preStart = waitingStart || match?.status !== "live";
    const isDouble = eventType !== "single";
    const wantOrder = preStart ? (isDouble ? 2 : 1) : 1;

    // Code fix trước đó
    const uidRight = uidFound || Object.keys(nextSlotsMap)[0] || "";

    lastServerUidRef.current = uidRight;

    // Pin server UID ngay để toggleServerNum (đổi tay) hoạt động luôn mà không chờ refetch
    if (uidRight) {
      forcedServerRef.current = {
        uid: uidRight,
        until: Date.now() + 1500,
        gameIndex: curIdx,
        side: nextSide,
        serverNum: wantOrder,
      };
    }

    socket?.emit(
      "serve:set",
      {
        matchId: match._id,
        side: nextSide,
        server: wantOrder,
        serverId: uidRight,
        userMatch,
      },
      async (ack) => {
        // ... (giữ nguyên logic callback)
        if (!ack?.ok) {
          Toast.show({ type: "error", text1: "Lỗi 1", text2: ack?.message });
          return;
        }
        pushUndo({ t: "SERVE_SET", prev });
        try {
          refetch();
        } catch {}
      },
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
        userMatch,
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
      },
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
        { matchId: match._id, base: { A: nextA, B: nextB }, userMatch },
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
          // và người giao là người đang ở ô phải theo bên hiện tại sau hoán đổi.
          if (preOrZero && teamKey === activeSide) {
            const rightSlot = preStartRightSlotForSide(teamKey, leftSide);
            // Tính UID ở ô phải theo base "mới"
            const mapAfter = teamKey === "A" ? nextA : nextB;
            const uidRightNew =
              Object.entries(mapAfter).find(
                ([, slot]) => Number(slot) === rightSlot,
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
                  userMatch,
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
                },
              );
              return; // đã refetch trong callback
            }
          }

          // Trường hợp thường: chỉ refetch sau khi đổi ô
          refetch();
        },
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
      leftSide,
      refetch,
    ],
  );

  const swapSides = () => {
    const prev = { ...leftRight };
    const prevBase = { A: baseA, B: baseB };
    setLeftRight(({ left, right }) => ({ left: right, right: left }));

    // Đổi bên = VĐV lên ô chéo: flip slot trong mỗi đội (1→2, 2→1)
    const flipSlots = (base: Record<string, number>) => {
      const flipped: Record<string, number> = {};
      for (const [uid, slot] of Object.entries(base)) {
        flipped[uid] = Number(slot) === 1 ? 2 : 1;
      }
      return flipped;
    };
    const newBase = { A: flipSlots(baseA), B: flipSlots(baseB) };

    // Optimistic: cập nhật UI ngay lập tức
    setLocalBaseOverride(newBase);

    if (match?._id) {
      socket?.emit(
        "slots:setBase",
        { matchId: match._id, base: newBase, userMatch },
        (ack) => {
          if (ack?.ok) refetch();
        },
      );
    }

    pushUndo({ t: "SWAP_SIDES", prev, prevBase });
  };

  const handleBack = useCallback(async () => {
    try {
      await ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.PORTRAIT_UP,
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
      "—",
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
      !!rules?.winByTwo,
    );

    const winnerBySets =
      aWins >= needSetWins ? "A" : bWins >= needSetWins ? "B" : "";

    // ✅ Đủ set thắng ⇒ "Kết thúc trận"
    if (winnerBySets) {
      return {
        label: "Kết thúc trận",
        danger: true,
        onPress: () => finishMatchNow(winnerBySets),
      };
    }

    // ✅ Game hiện tại đã kết thúc
    if (gameFinished) {
      const finishedGames = aWins + bWins;
      const remainingGames = bestOfNum - finishedGames;

      if (remainingGames > 0) {
        // Còn game ⇒ "Bắt game tiếp"
        return {
          label: "Bắt game tiếp",
          danger: false,
          onPress: startNextGame,
        };
      }

      // Hết game theo BO nhưng chưa set winnerBySets (trường hợp lệch) ⇒ kết thúc
      const finalWinner = aWins > bWins ? "A" : "B";
      return {
        label: "Kết thúc trận",
        danger: true,
        onPress: () => finishMatchNow(finalWinner),
      };
    }

    // ✅ CHỈ TRƯỚC TRẬN mới có nút "Bắt đầu"
    if (isPreMatch) {
      return {
        label: "Bắt đầu",
        danger: false,
        onPress: onStart,
      };
    }

    // Đang chơi dở ⇒ không có CTA (tập trung bắt điểm)
    return null;
  }, [
    match?.status,
    isPreMatch,
    rules?.bestOf,
    rules?.pointsToWin,
    rules?.winByTwo,
    aWins,
    bWins,
    curA,
    curB,
    onStart,
    startNextGame,
    finishMatchNow,
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

  useEffect(() => {
    const f = forcedServerRef.current;
    if (!f?.uid) return;

    const raw = serve?.serverId ? String(serve.serverId) : "";
    if (raw && raw === f.uid) {
      // server đã sync đúng -> bỏ pin sớm
      forcedServerRef.current.until = 0;
      forcedServerRef.current.uid = "";
    }
  }, [serve?.serverId]);

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
            match?.court,
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
          <View
            style={[
              s.card,
              s.topCard,
              { backgroundColor: t.colors.card, borderColor: t.colors.border },
            ]}
          >
            <View style={[s.rowBetween, { alignItems: "center" }]}>
              <View
                style={[
                  s.rowStart,
                  { gap: 8, flexWrap: "wrap", flex: 1, paddingRight: 4 },
                ]}
              >
                <Ripple
                  onPress={handleBack}
                  style={[s.iconBtn, { backgroundColor: t.colors.card }]}
                  rippleContainerBorderRadius={8}
                >
                  <Ionicons
                    name="chevron-back"
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
                  {!isPreMatch && (
                    <>
                      <Ripple
                        onPress={onUndo}
                        disabled={undoBusy || !undoStack.current.length}
                        style={[
                          s.btnUndoSm,
                          (undoBusy || !undoStack.current.length) &&
                            s.btnDisabled,
                        ]}
                        rippleContainerBorderRadius={10}
                      >
                        {undoBusy ? (
                          <ActivityIndicator size="small" />
                        ) : (
                          <MaterialIcons
                            name="undo"
                            size={16}
                            color="#92400e"
                          />
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
                        <Text
                          style={[s.btnSwapSmText, { color: t.chipInfo2Fg }]}
                        >
                          Đổi bên
                        </Text>
                      </Ripple>
                    </>
                  )}
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
                {isPreMatch && userMatch !== "true" && (
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
                    <Text
                      style={[s.btnOutlineSmText, { color: t.colors.text }]}
                    >
                      {currentCourtId ? "Đổi sân" : "Gán sân"}
                    </Text>
                  </Ripple>
                )}
              </View>
              {/* Nút Voice Commands */}
              <TouchableOpacity
                onPress={() => {
                  const next = !voiceCommandEnabled;
                  setVoiceCommandEnabled(next);
                  Toast.show({
                    type: next ? "success" : "info",
                    text1: next
                      ? "🎤 Voice Commands ON"
                      : "🔇 Voice Commands OFF",
                    text2: next ? 'Nói: "điểm", "đổi", "lại"...' : undefined,
                    visibilityTime: 2000,
                  });
                }}
                style={{ marginRight: 8 }}
              >
                <View
                  style={[
                    s.iconBtnSetting,
                    {
                      borderRadius: 20,
                      backgroundColor: voiceCommandEnabled
                        ? isVoiceListening
                          ? t.colors.primary
                          : "#f59e0b"
                        : "#f2f0f5",
                    },
                  ]}
                >
                  {isVoiceProcessing ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <MaterialIcons
                      name={
                        voiceCommandEnabled
                          ? "keyboard-voice"
                          : "voice-over-off"
                      }
                      size={20}
                      color={voiceCommandEnabled ? "#fff" : t.colors.text}
                    />
                  )}
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  const nextState = !voiceEnabled;
                  setVoiceEnabled(nextState);
                  // Feedback nhẹ cho người dùng biết
                  if (nextState) {
                    Speech.speak("Bật âm thanh");
                  } else {
                    Speech.stop();
                  }
                }}
                style={{ marginRight: 8 }} // Cách nút settings một chút
              >
                <View
                  style={[
                    s.iconBtnSetting,
                    {
                      borderRadius: 20,
                      backgroundColor: voiceEnabled
                        ? t.colors.primary
                        : "#f2f0f5", // Đổi màu khi bật
                      borderWidth: 1,
                      borderColor: voiceEnabled
                        ? t.colors.primary
                        : "transparent",
                    },
                  ]}
                >
                  <MaterialIcons
                    name={voiceEnabled ? "volume-up" : "volume-off"}
                    size={20}
                    color={voiceEnabled ? "#fff" : t.colors.text}
                  />
                </View>
              </TouchableOpacity>
              {/* NÚT SETTINGS GÓC PHẢI */}
              <TouchableOpacity
                onPress={() => setSettingsOpen(true)}
                // Bo tròn hiệu ứng gợn sóng cho khớp với View bên trong
              >
                {/* View này chịu trách nhiệm hiển thị hình tròn và màu nền */}
                <View
                  style={[
                    s.iconBtnSetting, // Style gốc (nếu có)
                    {
                      borderRadius: 20, // Bo tròn thành hình tròn
                    },
                  ]}
                >
                  <MaterialIcons
                    name="settings"
                    size={20}
                    color={t.colors.text}
                  />
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </View>

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
                {isPreMatch ? (
                  // 🌟 TRƯỚC TRẬN: chỉ icon ĐỔI GIAO ở giữa
                  <Ripple
                    onPress={toggleServeSide}
                    rippleContainerBorderRadius={999}
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: 32,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: 2,
                      borderColor: t.colors.primary,
                      backgroundColor: t.dark ? "#0a84ff22" : "#0a84ff15",
                    }}
                  >
                    <MaterialIcons
                      name="swap-calls"
                      size={28}
                      color={t.colors.primary}
                    />
                  </Ripple>
                ) : (
                  <>
                    {/* bình thường như cũ */}
                    {/* ✅ GIAO DIỆN TIMEOUT MỚI (Thay thế WinTargetTuner) */}
                    <TimeoutHeader
                      leftTO={leftSide === "A" ? toA : toB}
                      leftMed={leftSide === "A" ? medA : medB}
                      rightTO={rightSide === "A" ? toA : toB}
                      rightMed={rightSide === "A" ? medA : medB}
                      // 👇 Nhớ truyền 2 cái này
                      limitTO={timeoutPerGame}
                      limitMed={medicalLimit}
                      // 👆
                      timeoutMinutes={timeoutMinutes}
                      onTimeout={handleCallTimeout}
                      onMedical={handleCallMedical}
                      disabled={!canScoreNow && !localBreak}
                    />
                    <Text style={[s.callout, { color: t.colors.text }]}>
                      {callout || "—"}
                    </Text>

                    <View
                      style={[s.rowBetween, { width: "100%", marginTop: 6 }]}
                    >
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

                    <View
                      style={[s.rowBetween, { width: "100%", marginTop: 4 }]}
                    >
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
                  </>
                )}
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
            {localBreak ? (
              <Text
                style={[
                  s.clockText, // Style gốc có fontWeight 900
                  s.clockAbsolute,
                  {
                    // Màu đỏ đậm hoặc vàng đậm để rõ nét
                    color:
                      localBreak.type === "medical" ? "#dc2626" : "#d97706",
                    fontSize: 20, // ✅ Tăng kích thước chữ (cũ là 16)
                    fontWeight: "900", // ✅ Siêu đậm
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  },
                ]}
              >
                {localBreak.type === "medical" ? "Nghỉ y tế" : "Timeout"}
              </Text>
            ) : (
              <LiveClock
                style={[s.clockText, s.clockAbsolute, { color: t.colors.text }]}
              />
            )}

            {localBreak ? (
              <View style={s.breakOverlay}>
                <BreakTimer endTime={localBreak.endTime} style={s.breakTimer} />

                <Ripple
                  onPress={handleContinue}
                  style={s.btnContinue}
                  rippleContainerBorderRadius={12}
                >
                  <Text style={s.btnContinueText}>Tiếp tục</Text>
                  <MaterialIcons name="play-arrow" size={24} color="#fff" />
                </Ripple>
              </View>
            ) : (
              <View style={[s.row, s.bottomActions]}>
                {!isPreMatch && (
                  <>
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
                          color={
                            activeSide === leftSide ? "#fff" : t.colors.text
                          }
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
                      style={[
                        s.toggleBtn,
                        (incBusy || undoBusy) && s.btnDisabled,
                      ]}
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
                          color={
                            activeSide === rightSide ? "#fff" : t.colors.text
                          }
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
                  </>
                )}
              </View>
            )}
            {/* 👉 Góc phải: Bắt đầu + Bốc thăm, chỉ khi trước trận */}
            {/* 👉 Góc phải: CTA (Bắt đầu / Bắt game tiếp / Kết thúc trận) + Bốc thăm */}
            {cta && (
              <View style={s.bottomRightActions}>
                <Ripple
                  onPress={cta.onPress}
                  rippleContainerBorderRadius={12} // 👈 cho trùng bigActionBtn
                  style={[
                    s.bigActionBtn, // 👈 dùng chung height với nút Đội trái/phải
                    cta.danger
                      ? { backgroundColor: "#ef4444", borderColor: "#b91c1c" }
                      : { backgroundColor: t.success, borderColor: t.success },
                  ]}
                >
                  <Text
                    style={[
                      s.bigActionText, // font giống nút Đội trái/phải
                      { color: "#fff" }, // chữ trắng cho nền màu
                    ]}
                  >
                    {cta.label}
                  </Text>
                </Ripple>

                {isPreMatch && (
                  <Ripple
                    onPress={() => setMenuOpen(true)}
                    rippleContainerBorderRadius={12} // 👈 cùng radius
                    style={[
                      s.bigActionBtn, // 👈 reuse height/padding của nút Đội trái/phải
                      {
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
                )}
              </View>
            )}
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
      <MatchSettingsModal
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        matchId={match?._id}
        onSave={() => {
          refetch(); // ✅ chỉ cần refetch match
          setSettingsOpen(false); // ✅ đóng modal
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
  topCard: {
    padding: 10,
    borderWidth: 0,
    borderColor: "transparent",
    shadowColor: "transparent",
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  bottomCard: {
    paddingVertical: 10,
    borderWidth: 0,
    borderColor: "transparent",
    shadowColor: "transparent",
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
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
  iconBtnSetting: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
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
    left: 8,
    right: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 10,
    height: 40,
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
  bottomRightActions: {
    position: "absolute",
    right: 12,
    top: "50%",
    transform: [{ translateY: -18 }],
    flexDirection: "row", // 👈 thêm dòng này để xếp ngang (row)
    alignItems: "center", // 👈 canh giữa theo trục dọc
    gap: 8, // 👈 (optional) khoảng cách giữa 2 nút
  },
  breakOverlay: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    width: "100%",
    height: "100%",
    // Nền trắng mờ che lên các nút bên dưới
    backgroundColor: "rgba(255,255,255,0.95)",
    position: "absolute",
    zIndex: 10,
    borderRadius: 12,
  },
  breakTitle: { fontSize: 14, fontWeight: "700", color: "#6b7280" },
  breakTimer: {
    fontSize: 28,
    fontWeight: "900",
    color: "#ef4444",
    fontVariant: ["tabular-nums"],
  },
  btnContinue: {
    backgroundColor: "#10b981",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    shadowColor: "#10b981",
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  btnContinueText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  winPairRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4, // Giảm khoảng cách giữa các bubble lặp lại
    flexWrap: "wrap", // Rất quan trọng nếu số lượng bubble lớn
  },
  // 👇 THÊM STYLE NÀY VÀO CUỐI LIST 👇
  bubbleUsed: {
    backgroundColor: "#e2e8f0", // Màu nền xám
    borderColor: "#cbd5e1", // Viền xám
    borderWidth: 1,
  },
});
