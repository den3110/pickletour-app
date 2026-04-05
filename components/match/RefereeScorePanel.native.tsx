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
  Platform,
  StyleSheet,
  Text,
  View,
  useColorScheme,
  useWindowDimensions,
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
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useSocket } from "@/context/SocketContext";
import * as ScreenOrientation from "expo-screen-orientation";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";
import { normalizeUrl } from "@/utils/normalizeUri";
import {
  getMatchDisplayCode,
  getPlayerDisplayName,
  resolveDisplayMode,
} from "@/utils/matchDisplay";
import CCCDModal from "../CCCDModal.native";
import { useTheme } from "@react-navigation/native";
import { useUserMatchHeader } from "@/hooks/useUserMatchHeader";
import { LinearGradient } from "expo-linear-gradient"; // ✅ NEW
import MatchSettingsModal from "./MatchSettingsModal";
import { useVoiceCommands } from "@/hooks/useVoiceCommands";
import * as Speech from "expo-speech";
import { useLiveMatch } from "@/hooks/useLiveMatch";
import { useMatchLiveActivity } from "@/hooks/useMatchLiveActivity";
import { BASE_URL } from "@/slices/apiSlice";

const VOICE_API_URL = `${BASE_URL}/api/voice/parse`;
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

const breakTypeFromNote = (note) => {
  const prefix = textOf(note).split(":")[0].trim().toLowerCase();
  return prefix === "medical" || prefix === "timeout" ? prefix : "";
};

const normalizeBreakState = (rawBreak) => {
  if (!rawBreak) return null;
  if (typeof rawBreak === "object") {
    const note = textOf(rawBreak.note);
    return {
      active:
        rawBreak.active === true ||
        rawBreak.isActive === true ||
        rawBreak.enabled === true,
      afterGame:
        typeof rawBreak.afterGame === "number" ? rawBreak.afterGame : null,
      note,
      startedAt: rawBreak.startedAt || rawBreak.startAt || null,
      expectedResumeAt:
        rawBreak.expectedResumeAt || rawBreak.resumeAt || rawBreak.endTime || null,
      type: textOf(rawBreak.type).toLowerCase() || breakTypeFromNote(note),
    };
  }
  const normalized = String(rawBreak).toLowerCase();
  if (normalized === "1" || normalized === "true") {
    return { active: true, note: "", expectedResumeAt: null, type: "timeout" };
  }
  return null;
};

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

  // ✅ fallback cuối cùng: chỉ dùng khi opening serve 0-0-1 và chưa biết serverId
  if (isStartOfGame && Boolean(serve?.opening) && activeServerNum === 1) {
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
  function NameBadge({
    user,
    isServer,
    onPressAvatar,
    source,
    compact = false,
  }) {
    const t = useTokens();
    const [imgError, setImgError] = useState(false);
    const mode = resolveDisplayMode(source, user);
    const primaryName = getPlayerDisplayName(user, source) || "—";
    const secondaryName =
      mode === "fullName"
        ? user?.nickname || user?.nick || user?.shortName || ""
        : user?.fullName ||
          user?.name ||
          [user?.lastName, user?.firstName].filter(Boolean).join(" ") ||
          "";

    const avatarUri = normalizeUrl(
      user?.avatar || user?.avatarURL || user?.photoURL || user?.picture || "",
    );

    const showIcon = !avatarUri || imgError;
    const AV_SIZE = compact ? 28 : 34;
    const badgeLabel =
      compact
        ? primaryName
        : secondaryName && secondaryName !== primaryName
          ? secondaryName
          : "";

    return (
      <View style={{ alignItems: "center", width: "100%" }}>
        {!compact ? (
          <Text
            style={[s.fullNameText, { color: t.colors.text, flexShrink: 1, paddingHorizontal: 4 }]}
            numberOfLines={1}
          >
            {primaryName}
          </Text>
        ) : null}

        <View
          style={{
            position: "relative",
            marginTop: compact ? 0 : 6,
            width: "100%",
            alignItems: "center",
          }}
        >
          <View
            style={[
              s.badgeName,
              compact && s.badgeNameCompact,
              {
                paddingRight: compact ? 30 : 34,
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
              style={[
                s.nickText,
                compact && s.nickTextCompact,
                { color: t.colors.text, flexShrink: 1 },
              ]}
              numberOfLines={1}
            >
              {badgeLabel}
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
      prev.isServer === next.isServer &&
      prev.compact === next.compact
    );
  },
);

const TeamSimple = memo(
  function TeamSimple({
    teamKey,
    players = [],
    slotsNow,
    onSwap,
    source,
    isServing,
    activeSide,
    serverUidShow,
    onPressAvatar,
    compact = false,
    airy = false,
    airyWide = false,
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
          compact && s.teamBoxCompact,
          airy && s.teamBoxAiry,
          airyWide && s.teamBoxAiryWide,
          { backgroundColor: t.colors.card, borderColor: t.colors.border },
          isServing && {
            backgroundColor: t.chipInfo2Bg,
            borderColor: t.chipInfo2Bd,
          },
        ]}
      >
        <View
          style={[
            s.teamStack,
            compact && s.teamStackCompact,
            airy && s.teamStackAiry,
            airyWide && s.teamStackAiryWide,
          ]}
        >
          {p1 ? (
            <NameBadge
              user={p1}
              source={source}
              isServer={!!isServerP1}
              onPressAvatar={onPressAvatar}
              compact={compact}
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
              source={source}
              isServer={!!isServerP2}
              onPressAvatar={onPressAvatar}
              compact={compact}
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
      prev.slotsNow === next.slotsNow &&
      prev.compact === next.compact &&
      prev.airy === next.airy &&
      prev.airyWide === next.airyWide
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
const TimeoutHeader = memo(function TimeoutHeader({
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
  compact = false,
}) {
  const t = useTokens();
  const isDisabled = disabled;
  const usedBubbleTone = t.dark
    ? { backgroundColor: "#1f2937", borderColor: "#334155", foreground: "#94a3b8" }
    : { backgroundColor: "#e2e8f0", borderColor: "#cbd5e1", foreground: "#475569" };
  const timeoutBubbleTone = t.dark
    ? { backgroundColor: "#92400e", borderColor: "#f59e0b", foreground: "#fef3c7" }
    : { backgroundColor: "#fbbf24", borderColor: "#f59e0b", foreground: "#111827" };
  const medicalBubbleTone = t.dark
    ? { backgroundColor: "#7f1d1d", borderColor: "#ef4444", foreground: "#fee2e2" }
    : { backgroundColor: "#ef4444", borderColor: "#dc2626", foreground: "#ffffff" };

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

      const tone = isUsed
        ? usedBubbleTone
        : isMed
          ? medicalBubbleTone
          : timeoutBubbleTone;

      buttons.push(
        <Ripple
          key={`${type}-${teamSideUI}-${i}`}
          onPress={() =>
            !isUsed && (isMed ? onMedical(teamSideUI) : onTimeout(teamSideUI))
          }
          disabled={isDisabled || isUsed}
          rippleContainerBorderRadius={999}
          style={{ marginHorizontal: compact ? 1.5 : 3 }}
        >
          <View
            style={[
              isMed ? s.winAdjustBubble : s.winDigitBubble,
              compact && (isMed ? s.winAdjustBubbleCompact : s.winDigitBubbleCompact),
              {
                backgroundColor: tone.backgroundColor,
                borderColor: tone.borderColor,
              },
              isDisabled && !isUsed && { opacity: 0.5 },
            ]}
          >
            {isMed ? (
              <MaterialIcons
                name="add"
                size={compact ? 12 : 14}
                color={tone.foreground}
              />
            ) : (
              <Text
                style={[
                  s.winDigitText,
                  compact && s.winDigitTextCompact,
                  { color: tone.foreground },
                ]}
              >
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
      style={[
        s.timeoutScrollBtn,
        compact && s.timeoutScrollBtnCompact,
      ]}
    >
      <MaterialIcons
        name={dir === "left" ? "chevron-left" : "chevron-right"}
        size={compact ? 18 : 22}
        color={t.muted}
      />
    </Ripple>
  );

  return (
    <View style={[s.winRowAbsolute, compact && s.winRowInlineCompact]}>
      {/* ================= TRÁI (LEFT TEAM) ================= */}
      <View
        style={{
          flex: 1,
          marginRight: compact ? 4 : 8,
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
            paddingHorizontal: compact ? 0 : 2,
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
          marginLeft: compact ? 4 : 8,
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
            paddingHorizontal: compact ? 0 : 2,
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
});

const ColorCoinToss = memo(function ColorCoinToss({ disabled, onClose }) {
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
});

/* ========= FULLSCREEN COURT PICKER ========= */
function CourtAssignModalFull({
  visible,
  onClose,
  matchId,
  currentCourtId,
  onAssigned,
  onLoadCourts,
  onAssignCourt,
  onUnassignCourt,
}) {
  const t = useTokens();
  const [courts, setCourts] = useState([]);
  const [courtsLoaded, setCourtsLoaded] = useState(false);
  const [courtsLoading, setCourtsLoading] = useState(false);
  const [courtsRefreshing, setCourtsRefreshing] = useState(false);
  const [courtsError, setCourtsError] = useState(null);
  const [assigning, setAssigning] = useState(false);
  const [unassigning, setUnassigning] = useState(false);

  const loadCourts = useCallback(
    async ({ refresh = false } = {}) => {
      if (!matchId || !onLoadCourts) return null;

      if (refresh) {
        setCourtsRefreshing(true);
      } else {
        setCourtsLoading(true);
      }

      try {
        const result = await Promise.resolve(
          onLoadCourts({ includeBusy: false }),
        );
        setCourts(Array.isArray(result?.items) ? result.items.filter(Boolean) : []);
        setCourtsError(null);
        setCourtsLoaded(true);
        return result;
      } catch (error) {
        setCourtsError(error);
        return null;
      } finally {
        setCourtsLoading(false);
        setCourtsRefreshing(false);
      }
    },
    [matchId, onLoadCourts],
  );

  useEffect(() => {
    setCourts([]);
    setCourtsLoaded(false);
    setCourtsLoading(false);
    setCourtsRefreshing(false);
    setCourtsError(null);
  }, [matchId]);

  useEffect(() => {
    if (!visible || !matchId || courtsLoaded) return;
    loadCourts();
  }, [visible, matchId, courtsLoaded, loadCourts]);

  const doAssign = async (courtId) => {
    try {
      setAssigning(true);
      await onAssignCourt?.({ courtId });
      const courtName =
        textOf(
          (courts.find((x) => (x?._id || x?.id) === courtId) || {}).name,
        ) || "";
      Alert.alert(
        "Đã gán sân",
        courtName ? `Sân: ${courtName}` : "Gán sân thành công",
      );
      onAssigned?.({ courtId });
      setCourtsLoaded(false);
      onClose?.();
    } catch (e) {
      const msg =
        textOf(e?.data?.message) || textOf(e?.error) || "Không thể gán sân";
      Alert.alert("Lỗi", msg);
      onAssigned?.({ error: msg });
    } finally {
      setAssigning(false);
    }
  };

  const clearAssign = async () => {
    try {
      setUnassigning(true);
      await onUnassignCourt?.();
      Alert.alert("Đã bỏ gán sân", "Trận đã được bỏ gán sân.");
      onAssigned?.({ courtId: null });
      setCourtsLoaded(false);
      onClose?.();
    } catch (e) {
      const msg =
        textOf(e?.data?.message) || textOf(e?.error) || "Không thể bỏ gán sân";
      Alert.alert("Lỗi", msg);
      onAssigned?.({ error: msg });
    } finally {
      setUnassigning(false);
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
              onPress={() => loadCourts({ refresh: true })}
              disabled={courtsLoading || courtsRefreshing}
              style={[s.iconBtn, { backgroundColor: t.colors.card }]}
              rippleContainerBorderRadius={8}
            >
              {courtsRefreshing ? (
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
          {courtsLoading ? (
            <View style={[s.center, { flex: 1 }]}>
              <ActivityIndicator />
            </View>
          ) : courtsError ? (
            <View
              style={[
                s.alertError,
                { backgroundColor: t.chipErrBg, borderColor: t.chipErrBd },
              ]}
            >
              <Text style={[s.alertText, { color: t.chipErrFg }]}>
                {textOf(courtsError?.data?.message) ||
                  textOf(courtsError?.error) ||
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

function SkeletonBlock({
  width = "100%",
  height = 16,
  radius = 10,
  color = "#e5e7eb",
  style,
}) {
  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

function RefereeJudgeSkeleton({
  tokens,
  insets,
  pageSafeEdges,
  pageBottomInset,
  compact = false,
}) {
  const topCircle = compact ? 34 : 40;
  const utilityCircle = compact ? 36 : 40;
  const chipHeight = compact ? 34 : 40;
  const actionHeight = compact ? 34 : 40;
  const centerColumnWidth = compact ? "34%" : "32%";

  return (
    <SafeAreaView
      edges={pageSafeEdges}
      style={[s.page, { backgroundColor: tokens.colors.background }]}
    >
      <View
        style={[
          s.skeletonPageInner,
          {
            paddingLeft: insets.left,
            paddingRight: insets.right,
            paddingBottom: pageBottomInset,
          },
        ]}
      >
        <View
          style={[
            s.card,
            s.topCard,
            compact && s.topCardCompact,
            {
              backgroundColor: tokens.colors.card,
              borderColor: tokens.colors.border,
            },
          ]}
        >
          <View style={[s.topHeaderRow, compact && s.topHeaderRowCompact]}>
            <View
              style={[
                s.topPrimaryControls,
                compact && s.topPrimaryControlsCompact,
              ]}
            >
              <SkeletonBlock
                width={topCircle}
                height={topCircle}
                radius={topCircle / 2}
                color={tokens.skeletonBase}
              />
              <SkeletonBlock
                width={compact ? 132 : 172}
                height={chipHeight}
                radius={12}
                color={tokens.skeletonBase}
              />
              <SkeletonBlock
                width={compact ? 36 : 94}
                height={actionHeight}
                radius={actionHeight / 2}
                color={tokens.skeletonBase}
              />
              <SkeletonBlock
                width={compact ? 36 : 92}
                height={actionHeight}
                radius={actionHeight / 2}
                color={tokens.skeletonBase}
              />
              <SkeletonBlock
                width={compact ? 38 : 54}
                height={compact ? 34 : 36}
                radius={18}
                color={tokens.skeletonBase}
              />
            </View>

            <View
              style={[
                s.topUtilityControls,
                compact && s.topUtilityControlsCompact,
              ]}
            >
              {[0, 1, 2].map((item) => (
                <SkeletonBlock
                  key={item}
                  width={utilityCircle}
                  height={utilityCircle}
                  radius={utilityCircle / 2}
                  color={tokens.skeletonBase}
                />
              ))}
            </View>
          </View>
        </View>

        <SkeletonBlock
          width={compact ? 112 : 148}
          height={compact ? 28 : 30}
          radius={999}
          color={tokens.skeletonBase}
          style={s.skeletonCourtPill}
        />

        <View
          style={[
            s.card,
            s.scoreboardCard,
            compact && s.scoreboardCardCompact,
            {
              backgroundColor: tokens.colors.card,
              borderColor: tokens.colors.border,
            },
          ]}
        >
          <View style={s.scoreboardBody}>
            <View
              style={[
                s.scoreboardRow,
                compact && s.scoreboardRowCompact,
              ]}
            >
              <View
                style={[
                  s.teamBox,
                  compact && s.teamBoxCompact,
                  {
                    backgroundColor: tokens.colors.card,
                    borderColor: tokens.colors.border,
                  },
                ]}
              >
                <View style={s.skeletonTeamStack}>
                  <SkeletonBlock
                    width="68%"
                    height={compact ? 34 : 38}
                    radius={999}
                    color={tokens.skeletonBase}
                  />
                  <SkeletonBlock
                    width={compact ? 34 : 38}
                    height={compact ? 34 : 38}
                    radius={12}
                    color={tokens.skeletonBase}
                  />
                  <SkeletonBlock
                    width="60%"
                    height={compact ? 34 : 38}
                    radius={999}
                    color={tokens.skeletonBase}
                  />
                </View>
              </View>

              <View
                style={[
                  s.centerCol,
                  compact && s.centerColCompact,
                  {
                    width: centerColumnWidth,
                    backgroundColor: tokens.colors.card,
                    borderColor: tokens.colors.border,
                  },
                ]}
              >
                <View style={s.skeletonCenterTop}>
                  <SkeletonBlock
                    width="72%"
                    height={compact ? 18 : 20}
                    radius={999}
                    color={tokens.skeletonBase}
                  />
                </View>
                <SkeletonBlock
                  width="46%"
                  height={compact ? 24 : 30}
                  radius={8}
                  color={tokens.skeletonBase}
                />
                <View style={s.skeletonScoreRow}>
                  <SkeletonBlock
                    width={compact ? 28 : 34}
                    height={compact ? 28 : 34}
                    radius={8}
                    color={tokens.skeletonBase}
                  />
                  <SkeletonBlock
                    width={compact ? 62 : 74}
                    height={compact ? 16 : 18}
                    radius={8}
                    color={tokens.skeletonBase}
                  />
                  <SkeletonBlock
                    width={compact ? 28 : 34}
                    height={compact ? 28 : 34}
                    radius={8}
                    color={tokens.skeletonBase}
                  />
                </View>
                <View style={s.skeletonScoreRow}>
                  <SkeletonBlock
                    width={compact ? 24 : 30}
                    height={compact ? 24 : 30}
                    radius={8}
                    color={tokens.skeletonBase}
                  />
                  <SkeletonBlock
                    width={compact ? 54 : 64}
                    height={compact ? 14 : 16}
                    radius={8}
                    color={tokens.skeletonBase}
                  />
                  <SkeletonBlock
                    width={compact ? 24 : 30}
                    height={compact ? 24 : 30}
                    radius={8}
                    color={tokens.skeletonBase}
                  />
                </View>
              </View>

              <View
                style={[
                  s.teamBox,
                  compact && s.teamBoxCompact,
                  {
                    backgroundColor: tokens.colors.card,
                    borderColor: tokens.colors.border,
                  },
                ]}
              >
                <View style={s.skeletonTeamStack}>
                  <SkeletonBlock
                    width="62%"
                    height={compact ? 34 : 38}
                    radius={999}
                    color={tokens.skeletonBase}
                  />
                  <SkeletonBlock
                    width={compact ? 14 : 16}
                    height={compact ? 14 : 16}
                    radius={8}
                    color={tokens.skeletonBase}
                  />
                  <SkeletonBlock
                    width="72%"
                    height={compact ? 34 : 38}
                    radius={999}
                    color={tokens.skeletonBase}
                  />
                </View>
              </View>
            </View>
          </View>
        </View>

        <View
          style={[
            s.card,
            s.bottomCard,
            compact && s.bottomCardCompact,
            {
              backgroundColor: tokens.colors.card,
              borderColor: tokens.colors.border,
            },
          ]}
        >
          <View style={[s.bottomBar, compact && s.bottomBarCompact]}>
            <SkeletonBlock
              width={compact ? 76 : 92}
              height={18}
              radius={6}
              color={tokens.skeletonBase}
              style={s.skeletonClock}
            />
            <View style={[s.row, s.bottomActions, compact && s.bottomActionsCompact]}>
              <SkeletonBlock
                width={compact ? 120 : 154}
                height={compact ? 38 : 42}
                radius={12}
                color={tokens.skeletonBase}
              />
              <SkeletonBlock
                width={compact ? 92 : 104}
                height={compact ? 38 : 42}
                radius={12}
                color={tokens.skeletonBase}
              />
              <SkeletonBlock
                width={compact ? 120 : 154}
                height={compact ? 38 : 42}
                radius={12}
                color={tokens.skeletonBase}
              />
            </View>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

/* ========== main component ========== */
const PTW_KEY = (matchId) => `PT_REF_PTWIN_BOOST_${String(matchId || "")}`;
const normalizeRefereeLayout = (layout) =>
  layout?.left === "B" || layout?.right === "A"
    ? { left: "B", right: "A" }
    : { left: "A", right: "B" };

export default function RefereeJudgePanel({ matchId }) {
  const params = useLocalSearchParams();
  const { userMatch } = params;
  useUserMatchHeader(userMatch && "user");
  const isUserMatch = String(userMatch) === "true";
  const t = useTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const useGlobalAndroidSafeArea = Platform.OS === "android";
  const pageSafeEdges = (useGlobalAndroidSafeArea ? [] : ["top"]) as const;
  const pageBottomInset = useGlobalAndroidSafeArea ? 0 : insets.bottom;
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const shortEdge = Math.min(width, height);
  const longEdge = Math.max(width, height);
  const isCompactLandscape = isLandscape && (shortEdge < 520 || longEdge < 920);
  const isTightLandscape = isLandscape && (shortEdge < 460 || longEdge < 820);
  const isUltraTightLandscape = isLandscape && (shortEdge < 400 || longEdge < 740);
  const topToolbarMode = !isLandscape
    ? "regular"
    : shortEdge >= 440 && longEdge >= 1024
      ? "regular"
      : shortEdge >= 390 && longEdge >= 900
        ? "labelledCompact"
        : "iconCompact";
  const useCompactTopChrome = topToolbarMode !== "regular";
  const useCompactTopActions = topToolbarMode !== "regular";
  const showTopActionLabels = topToolbarMode !== "iconCompact";
  const showCourtActionLabel = topToolbarMode === "regular";
  const scoreboardMode = !isLandscape
    ? "regular"
    : shortEdge >= 460 && longEdge >= 1080
      ? "airyWide"
      : shortEdge >= 400 && longEdge >= 820 && !isUltraTightLandscape
        ? "airy"
        : "compact";
  const useAiryScoreboard =
    scoreboardMode === "airy" || scoreboardMode === "airyWide";
  const useWideAiryScoreboard = scoreboardMode === "airyWide";

  const {
    data: match,
    loading: isLoading,
    error,
    refetch,
    api: liveApi,
    sync: liveSync,
  } = useLiveMatch(matchId, null, { offlineSync: true });
  const socket = useSocket();

  // ===== NEW: court modal state =====
  const [courtOpen, setCourtOpen] = useState(false);
  const loadAvailableCourts = useCallback(
    (options = {}) => liveApi.listCourts(options),
    [liveApi],
  );

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
  const refereeLayoutLeft = match?.meta?.refereeLayout?.left;
  const refereeLayoutRight = match?.meta?.refereeLayout?.right;

  useEffect(() => {
    const nextLayout = normalizeRefereeLayout({
      left: refereeLayoutLeft,
      right: refereeLayoutRight,
    });
    setLeftRight((prev) =>
      prev.left === nextLayout.left && prev.right === nextLayout.right
        ? prev
        : nextLayout
    );
  }, [refereeLayoutLeft, refereeLayoutRight]);

  // nếu đang guard, không cho điểm hiển thị "tụt" xuống
  const curA =
    guardOn && typeof g.a === "number" ? Math.max(serverA, g.a) : serverA;

  const curB =
    guardOn && typeof g.b === "number" ? Math.max(serverB, g.b) : serverB;

  const breakState = useMemo(
    () => normalizeBreakState(match?.isBreak || match?.break || match?.pause),
    [match?.break, match?.isBreak, match?.pause],
  );
  const syncedWaitingStart = useMemo(() => {
    if (!breakState?.active) return false;
    if (!Number.isInteger(breakState?.afterGame)) return false;
    if (Number(breakState.afterGame) >= Number(curIdx)) return false;
    return Number(curA) === 0 && Number(curB) === 0;
  }, [breakState?.active, breakState?.afterGame, curA, curB, curIdx]);
  const waitingStartActive = waitingStart || syncedWaitingStart;
  const needsStartAction = isPreMatch || waitingStartActive;

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
  const [localServeOverride, setLocalServeOverride] = useState<{
    side: string;
    server: number;
    serverId: string;
    opening?: boolean;
  } | null>(null);

  // Clear override khi server data mới về (slotsBase thay đổi)
  useEffect(() => {
    if (localBaseOverride) setLocalBaseOverride(null);
  }, [slotsBase?.A, slotsBase?.B, localBaseOverride]);

  useEffect(() => {
    if (!localBaseOverride) return undefined;
    const timeoutId = setTimeout(() => {
      setLocalBaseOverride(null);
    }, 2500);
    return () => clearTimeout(timeoutId);
  }, [localBaseOverride]);

  useEffect(() => {
    if (!localServeOverride) return;
    const serverSide = match?.serve?.side === "B" ? "B" : "A";
    const serverNum =
      Number(match?.serve?.order ?? match?.serve?.server ?? 1) === 2 ? 2 : 1;
    const serverId = String(match?.serve?.serverId || "");
    const serverOpening = Boolean(match?.serve?.opening);
    if (
      serverSide === localServeOverride.side &&
      serverNum === localServeOverride.server &&
      serverId === String(localServeOverride.serverId || "") &&
      serverOpening === Boolean(localServeOverride.opening)
    ) {
      setLocalServeOverride(null);
    }
  }, [
    localServeOverride,
    match?.serve?.side,
    match?.serve?.server,
    match?.serve?.order,
    match?.serve?.serverId,
    match?.serve?.opening,
  ]);

  useEffect(() => {
    if (!localServeOverride) return undefined;
    const timeoutId = setTimeout(() => {
      setLocalServeOverride(null);
    }, 2500);
    return () => clearTimeout(timeoutId);
  }, [localServeOverride]);

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
  const serve = localServeOverride || match?.serve || {
    side: "A",
    server: 1,
    serverId: "",
    opening: eventType !== "single",
  };
  const activeSide = serve?.side === "B" ? "B" : "A";
  const activeServerNum =
    Number(serve?.order ?? serve?.server ?? 1) === 2 ? 2 : 1;
  const isOpeningServe = Boolean(serve?.opening) && activeServerNum === 1;

  // Nhớ người giao gần nhất để icon không “nhảy theo ô”
  const lastServerUidRef = useRef("");
  const openingServerRef = useRef({ gameIndex: -1, side: "", uid: "" });

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
    activeServerNum: 1,
    serverUidShow: "",
  });

  // Đầu game opening serve (0-0-1) icon phải nằm ở ô phải/even
  const pinnedOpeningServer =
    openingServerRef.current.gameIndex === curIdx &&
    openingServerRef.current.side === activeSide
      ? openingServerRef.current.uid
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
  // - bình thường => ưu tiên rawServerUid, rồi pin opening serve, rồi last ref
  // ✅ base logic như cũ
  const baseServerUidShow = serveSideScored
    ? stablePrevUid ||
      rawServerUid ||
      (isOpeningServe ? pinnedOpeningServer : "") ||
      lastServerUidRef.current ||
      ""
    : rawServerUid ||
      (isOpeningServe ? pinnedOpeningServer : "") ||
      lastServerUidRef.current ||
      "";

  // ✅ forcedUid phải ưu tiên cao nhất để khỏi nhảy 2 lần
  const serverUidShow = forcedUid || baseServerUidShow;
  // ✅ INIT serve đầu game:
  // - double local rule: 0-0-1 (opening serve chỉ có 1 lượt giao)
  // - single: 0-0-1 (server #1)
  // Tự động set người giao bóng chuẩn theo bên đang đứng khi tỉ số 0-0
  const initServeDoneRef = useRef({});

  useEffect(() => {
    if (!match?._id) return;

    const inited = !!initServeDoneRef.current[curIdx];
    const is000 = Number(curA) === 0 && Number(curB) === 0;
    const isUserMatch = String(userMatch) === "true";

    // Nếu không phải 0-0 (đang đánh dở) hoặc đã init phiên này rồi thì thôi
    if ((!is000 && !waitingStartActive) || inited) return;

    const currentServerId = serve?.serverId ? String(serve.serverId) : "";

    // ⚠️ QUAN TRỌNG:
    // - Với Match thường: Nếu DB có data rồi thì tin tưởng DB.
    // - Với UserMatch: Kể cả DB có data, ta vẫn phải kiểm tra xem nó có đúng logic "Trọng tài" không.
    if (!isUserMatch && currentServerId) {
      lastServerUidRef.current = currentServerId;
      return;
    }

    const isDouble = eventType !== "single";
    const wantServerNum = 1;
    const wantOpening = isDouble;

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
      setLocalServeOverride({
        side: activeSide,
        server: wantServerNum,
        serverId: uidRight,
        opening: wantOpening,
      });

      socket?.emit(
        "serve:set",
        {
          matchId: match._id,
          side: activeSide,
          server: wantServerNum,
          serverId: uidRight,
          opening: wantOpening,
          userMatch,
        },
        (ack) => {
          if (ack?.ok) {
            initServeDoneRef.current[curIdx] = true;
            lastServerUidRef.current = uidRight;
            return;
          }
          setLocalServeOverride(null);
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
    serve?.opening,
    socket,
    eventType,
    playersA,
    playersB,
    baseA,
    baseB,
    getUidAtSlotNow,
    userMatch,
    waitingStartActive,
    leftSide,
  ]);

  useEffect(() => {
    const is000 = Number(curA) === 0 && Number(curB) === 0;
    if (!is000) return;
    if (!isOpeningServe) return;

    const rightSlot = preStartRightSlotForSide(activeSide, leftSide);
    const uid =
      (serve?.serverId ? String(serve.serverId) : "") ||
      lastServerUidRef.current ||
      getUidAtSlotNow?.(activeSide, rightSlot) ||
      getUidAtSlotNow?.(activeSide, oppositeSlot(rightSlot)) ||
      "";

    if (uid) {
      openingServerRef.current = { gameIndex: curIdx, side: activeSide, uid };
      lastServerUidRef.current = uid; // ✅ pin luôn để các chỗ khác dùng
    }
  }, [
    curIdx,
    curA,
    curB,
    activeSide,
    activeServerNum,
    isOpeningServe,
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

  useMatchLiveActivity(match, {
    enabled: Boolean(match?._id),
    cleanupOnUnmount: false,
    preserveLiveOnUnmount: true,
    rules,
    score: {
      scoreA: curA,
      scoreB: curB,
      setsA: aWins,
      setsB: bWins,
      gameIndex: curIdx,
    },
    serve: {
      side: activeSide,
      server: activeServerNum,
    },
    source: isUserMatch ? "referee-user-match" : "referee",
  });

  const gameLocked = isGameWin(curA, curB, ptw, rules.winByTwo);
  const currentGameScoreA = Number(gs[curIdx]?.a ?? 0);
  const currentGameScoreB = Number(gs[curIdx]?.b ?? 0);

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
  const isLiveOwner = Boolean(liveSync?.isOwner);

  const ensureLiveOwner = useCallback(() => {
    if (isLiveOwner) return true;
    Alert.alert("Trận này đang do trọng tài khác điều khiển.");
    return false;
  }, [isLiveOwner]);

  // ✅ THÊM: State quản lý bật/tắt giọng nói
  const [voiceEnabled, setVoiceEnabled] = useState(false);

  // Voice Commands (điều khiển bằng giọng nói)
  const [voiceCommandEnabled, setVoiceCommandEnabled] = useState(false);
  const voiceCommandCtxRef = useRef({});

  const handleVoiceCommand = useCallback(
    (cmd) => {
      const ctx = voiceCommandCtxRef.current;
      if (!ctx) return;

      const resolveUiSide = () => {
        if (cmd.teamUiSide === "left" || cmd.teamUiSide === "right") {
          return cmd.teamUiSide;
        }
        if (cmd.teamKey === ctx.leftSide) return "left";
        if (cmd.teamKey === ctx.rightSide) return "right";
        return ctx.activeSide === ctx.leftSide ? "left" : "right";
      };

      switch (cmd.action) {
        case "INC_POINT":
          if (ctx.canScoreNow && !ctx.incBusy && !ctx.undoBusy) {
            const targetSide = cmd.teamKey || ctx.activeSide;
            if (targetSide !== ctx.activeSide) {
              Toast.show({
                type: "info",
                text1: "Không thể cộng điểm",
                text2: "Chỉ đội đang giao bóng mới có thể ghi điểm.",
              });
              return;
            }
            ctx.inc?.(targetSide);
          }
          break;
        case "SIDE_OUT":
          if (!ctx.incBusy && !ctx.undoBusy) {
            ctx.toggleServeSide?.();
          }
          break;
        case "TOGGLE_SERVER":
          if (!ctx.incBusy && !ctx.undoBusy) {
            ctx.toggleServerNum?.();
          }
          break;
        case "SWAP_SIDES":
          if (!ctx.incBusy && !ctx.undoBusy) {
            ctx.swapSides?.();
          }
          break;
        case "UNDO":
          if (!ctx.undoBusy && ctx.canUndo) {
            ctx.onUndo?.();
          }
          break;
        case "TIMEOUT":
          if (ctx.canScoreNow) {
            ctx.handleCallTimeout?.(resolveUiSide());
          }
          break;
        case "MEDICAL":
          if (ctx.canScoreNow) {
            ctx.handleCallMedical?.(resolveUiSide());
          }
          break;
        case "CONTINUE":
          if (ctx.localBreak) {
            ctx.handleContinue?.();
          }
          break;
        case "START_MATCH":
          if (ctx.primaryCtaLabel === "Bắt đầu") {
            ctx.primaryCtaPress?.();
          }
          break;
        case "START_NEXT_GAME":
          if (ctx.primaryCtaLabel === "Bắt game tiếp") {
            ctx.primaryCtaPress?.();
          }
          break;
        case "FINISH_MATCH":
          if (ctx.primaryCtaLabel === "Kết thúc trận") {
            ctx.primaryCtaPress?.();
          }
          break;
      }
    },
    [],
  );

  const handleVoiceCommandError = useCallback((voiceError) => {
    const message =
      textOf(voiceError?.message) || "Voice command hiện không khả dụng.";
    Toast.show({
      type: "error",
      text1: "Voice command lỗi",
      text2: message,
    });
  }, []);

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

    // Nếu vừa bấm bắt đầu trận (0-0-1) cũng cần đọc
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

  // ✅ sau khi có match/rules → đọc cờ boost đã lưu
  useEffect(() => {
    if (!match?._id) return;
    setPtw(Number(match?.rules?.pointsToWin ?? basePointsToWin));
    loadPtwBoost();
  }, [match?._id, match?.rules?.pointsToWin, basePointsToWin, loadPtwBoost]);

  // Khi đổi sang match khác thì reset cấu hình local
  useEffect(() => {
    setBestOfOverride(null);
    setWinByTwoOverride(null);
    setMidPointCustom(null);
  }, [match?._id]);

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
  const onStart = useCallback(async () => {
    if (!match || !ensureLiveOwner()) return;
    try {
      await liveApi.start();
      if (liveSync?.online) {
        await liveApi.setBreak({
          active: false,
          note: "",
          userMatch: isUserMatch,
        });
      }
      setWaitingStart(false);
    } catch (e) {
      Toast.show({
        type: "error",
        text1: "Lỗi",
        text2:
          textOf(e?.data?.message) || textOf(e?.error) || "Không thể bắt đầu",
      });
    }
  }, [match, ensureLiveOwner, liveApi, liveSync?.online, isUserMatch]);

  const finishMatchNow = useCallback(async (winner) => {
    if (!match || !ensureLiveOwner()) return;
    if (!winner) {
      Toast.show({
        type: "error",
        text1: "Chưa thể kết thúc",
        text2: "Tỉ số hiện tại chưa xác định đội thắng.",
      });
      return;
    }
    try {
      await liveSync?.syncNow?.();
      await liveApi.finish(winner);
      await liveSync?.syncNow?.();
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
  }, [match, ensureLiveOwner, liveApi, liveSync]);

  const startNextGame = useCallback(async () => {
    if (!match || !ensureLiveOwner()) return;
    try {
      // 1) bật nghỉ để overlay biết đang nghỉ sau game vừa xong
      await liveApi.setBreak({
        active: true,
        // nghỉ sau game hiện tại
        afterGame: curIdx,
        note: "",
        userMatch: isUserMatch,
      });

      // 2) chuyển sang game tiếp theo
      await liveApi.nextGame({ userMatch: isUserMatch });

      // 3) FE chuyển sang trạng thái chờ bấm "Bắt đầu"
      setWaitingStart(true);

      // 4) refetch lại match
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
  }, [match, ensureLiveOwner, liveApi, curIdx, isUserMatch]);
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
            Toast.show({
              type: "success",
              text1: "Đã cập nhật",
              text2: `Điểm set: ${nextVal}`,
            });
          } catch {}
        },
      );
    },
    [match?._id, socket],
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

          Toast.show({
            type: "success",
            text1: "Đã cập nhật",
            text2: `Điểm set: ${nextVal}`,
          });
        },
      );
    },
    [match?._id, socket, ptw, persistPtwBoost],
  );

  /* --- Cấu hình Timeout Local --- */
  // 1. Cấu hình
  const timeoutPerGame = match?.timeoutPerGame ?? 2;
  const timeoutMinutes = match?.timeoutMinutes ?? 1;
  const medicalLimit = match?.medicalTimeouts ?? 1;
  const [toA, setToA] = useState(timeoutPerGame);
  const [toB, setToB] = useState(timeoutPerGame);
  const [medA, setMedA] = useState(medicalLimit);
  const [medB, setMedB] = useState(medicalLimit);

  // 3. State quản lý trạng thái nghỉ cục bộ (Local Break)
  // localBreak = null hoặc { type: 'timeout'|'medical', endTime: number }
  const [localBreak, setLocalBreak] = useState<{
    type: "timeout" | "medical";
    endTime: number;
    teamKey: "A" | "B" | "";
  } | null>(null);
  const syncedTimedBreak = useMemo(() => {
    if (!breakState?.active) return null;
    const type = breakState?.type;
    if (type !== "timeout" && type !== "medical") return null;
    const expectedResumeAtMs = breakState?.expectedResumeAt
      ? new Date(breakState.expectedResumeAt).getTime()
      : null;
    return {
      type,
      endTime:
        Number.isFinite(expectedResumeAtMs) && expectedResumeAtMs > 0
          ? expectedResumeAtMs
          : Date.now(),
      teamKey: (textOf(breakState?.note).split(":")[1] || "") as "A" | "B" | "",
    };
  }, [
    breakState?.active,
    breakState?.expectedResumeAt,
    breakState?.note,
    breakState?.type,
  ]);
  const activeBreak = localBreak || syncedTimedBreak;
  // const [timerStr, setTimerStr] = useState("00:00");

  // Reset counter khi sang game mới
  useEffect(() => {
    setToA(timeoutPerGame);
    setToB(timeoutPerGame);
    setMedA(medicalLimit);
    setMedB(medicalLimit);
    setLocalBreak(null); // Reset trạng thái nghỉ nếu sang game mới
  }, [curIdx, medicalLimit, timeoutPerGame]);

  useEffect(() => {
    if (breakState?.active) {
      setLocalBreak(null);
    }
  }, [breakState?.active, breakState?.expectedResumeAt, breakState?.type]);

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

  // 5. Timeout/medical: optimistic local UI, then sync back to server snapshot
  const handleCallTimeout = useCallback(async (teamSideUI) => {
    if (!ensureLiveOwner()) return;
    if (activeBreak) return;
    const teamKey = teamSideUI === "left" ? leftSide : rightSide;
    const currentVal = teamKey === "A" ? toA : toB;
    if (currentVal <= 0) return;

    const durationMs = timeoutMinutes * 60 * 1000;
    const nextBreak = {
      type: "timeout" as const,
      endTime: Date.now() + durationMs,
      teamKey,
    };

    if (teamKey === "A") setToA((p) => p - 1);
    else setToB((p) => p - 1);
    setLocalBreak(nextBreak);

    try {
      await liveApi.setBreak({
        active: true,
        note: `timeout:${teamKey}`,
        type: "timeout",
        afterGame: curIdx,
        expectedResumeAt: new Date(nextBreak.endTime).toISOString(),
        userMatch: isUserMatch,
      });
    } catch (error) {
      setLocalBreak(null);
      if (teamKey === "A") setToA((p) => p + 1);
      else setToB((p) => p + 1);
      Toast.show({
        type: "error",
        text1: "Lỗi",
        text2:
          textOf(error?.data?.message) ||
          textOf(error?.message) ||
          "Không thể bật timeout",
      });
    }
  }, [
    activeBreak,
    curIdx,
    ensureLiveOwner,
    isUserMatch,
    leftSide,
    liveApi,
    rightSide,
    toA,
    toB,
    timeoutMinutes,
  ]);

  const handleCallMedical = useCallback(async (teamSideUI) => {
    if (!ensureLiveOwner()) return;
    if (activeBreak) return;
    const teamKey = teamSideUI === "left" ? leftSide : rightSide;
    const currentVal = teamKey === "A" ? medA : medB;
    if (currentVal <= 0) return;

    const durationMs = 5 * 60 * 1000;
    const nextBreak = {
      type: "medical" as const,
      endTime: Date.now() + durationMs,
      teamKey,
    };

    if (teamKey === "A") setMedA((p) => p - 1);
    else setMedB((p) => p - 1);
    setLocalBreak(nextBreak);

    try {
      await liveApi.setBreak({
        active: true,
        note: `medical:${teamKey}`,
        type: "medical",
        afterGame: curIdx,
        expectedResumeAt: new Date(nextBreak.endTime).toISOString(),
        userMatch: isUserMatch,
      });
    } catch (error) {
      setLocalBreak(null);
      if (teamKey === "A") setMedA((p) => p + 1);
      else setMedB((p) => p + 1);
      Toast.show({
        type: "error",
        text1: "Lỗi",
        text2:
          textOf(error?.data?.message) ||
          textOf(error?.message) ||
          "Không thể bật nghỉ y tế",
      });
    }
  }, [
    activeBreak,
    curIdx,
    ensureLiveOwner,
    isUserMatch,
    leftSide,
    liveApi,
    medA,
    medB,
    rightSide,
  ]);

  const handleContinue = useCallback(async () => {
    if (!ensureLiveOwner()) return;
    setLocalBreak(null);
    try {
      await liveApi.setBreak({
        active: false,
        note: "",
        afterGame: curIdx,
        userMatch: isUserMatch,
      });
    } catch (error) {
      Toast.show({
        type: "error",
        text1: "Lỗi",
        text2:
          textOf(error?.data?.message) ||
          textOf(error?.message) ||
          "Không thể tiếp tục trận",
      });
    }
  }, [curIdx, ensureLiveOwner, isUserMatch, liveApi]);

  // Match state gates scoring; owner gate stays inside action handlers so taps can show a toast.
  const canScoreByMatchState =
    match?.status === "live" &&
    !waitingStartActive &&
    !matchDecided &&
    !gameLocked &&
    !activeBreak;
  const canScoreNow = isLiveOwner && canScoreByMatchState;
  const canUndoLive = useMemo(() => {
    const entries = Array.isArray(match?.liveLog) ? match.liveLog : [];
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const type = String(entries[index]?.type || "").trim().toLowerCase();
      if (["finish", "forfeit", "start"].includes(type)) return false;
      if (["point", "serve", "slots"].includes(type)) return true;
    }
    return false;
  }, [match?.liveLog]);

  const beginOpTimeout = useCallback((kind) => {
    if (opTimeoutRef.current) clearTimeout(opTimeoutRef.current);
    opTimeoutRef.current = setTimeout(() => {
      if (kind === "inc") setIncBusy(false);
      if (kind === "undo") setUndoBusy(false);
      pendingOpRef.current = null;
    }, 2500);
  }, []);

  const inc = async (side) => {
    if (!match || !ensureLiveOwner()) return;
    if (incBusy || pendingOpRef.current?.type === "inc") return;

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
      if (side === "A") await liveApi.pointA(1);
      else await liveApi.pointB(1);

      // ✅ IMPORTANT: đội đang giao ghi điểm -> người giao KHÔNG đổi
      if (prevServerUid) {
        lastServerUidRef.current = prevServerUid; // giữ local để UI không nhảy
      }

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
    } finally {
    }
  };

  const onUndo = async () => {
    if (!ensureLiveOwner()) return;
    const liveLog = Array.isArray(match?.liveLog) ? match.liveLog : [];
    let entry = null;
    for (let index = liveLog.length - 1; index >= 0; index -= 1) {
      const candidate = liveLog[index];
      const type = String(candidate?.type || "").trim().toLowerCase();
      if (["finish", "forfeit", "start"].includes(type)) break;
      if (["point", "serve", "slots"].includes(type)) {
        entry = candidate;
        break;
      }
    }
    if (!entry) {
      Toast.show({ type: "info", text1: "Không có thao tác để hoàn tác" });
      return;
    }

    try {
      setUndoBusy(true);

      if (String(entry?.type || "").trim().toLowerCase() === "point") {
        const team = String(entry?.payload?.team || "").toUpperCase();
        const step = Number(entry?.payload?.step || 1) || 1;
        const newA = team === "A" ? curA - step : curA;
        const newB = team === "B" ? curB - step : curB;
        if (
          midPoint != null &&
          midAskedRef.current[curIdx] &&
          newA < midPoint &&
          newB < midPoint
        ) {
          delete midAskedRef.current[curIdx];
        }
      }

      await liveApi.undo();
    } catch {
      Toast.show({ type: "error", text1: "Hoàn tác thất bại" });
    } finally {
      setUndoBusy(false);
    }
  };

  // --- ĐỔI GIAO: nếu CHƯA BẮT ĐẦU/opening serve → 0-0-1; nếu đang live thường → tay 1
  // --- ĐỔI GIAO (SIDE OUT) ---
  // --- ĐỔI GIAO (SIDE OUT) ---
  const toggleServeSide = () => {
    if (!ensureLiveOwner()) return;
    if (!match?._id) return;

    const nextSide = activeSide === "A" ? "B" : "A";
    const preStart = waitingStartActive || match?.status !== "live";
    const isDouble = eventType !== "single";
    const wantOrder = 1;
    const wantOpening = preStart && isDouble;
    const nextTeamScore = nextSide === "A" ? curA : curB;
    const targetSlot = wantOpening
      ? preStartRightSlotForSide(nextSide, leftSide)
      : currentSlotFromBase(1, nextTeamScore);
    const uidFound =
      getUidAtSlotNow(nextSide, targetSlot) ||
      getUidAtSlotNow(nextSide, oppositeSlot(targetSlot)) ||
      "";
    const nextTeam = nextSide === "A" ? playersA : playersB;
    const uidRight = uidFound || nextTeam.map(userIdOf).find(Boolean) || "";

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
    setLocalServeOverride({
      side: nextSide,
      server: wantOrder,
      serverId: uidRight,
      opening: wantOpening,
    });

    liveApi.setServe({
      side: nextSide,
      server: wantOrder,
      serverId: uidRight,
      opening: wantOpening,
      userMatch,
    });
  };
  // --- ĐỔI TAY trong cùng đội
  const toggleServerNum = useCallback(() => {
    if (!ensureLiveOwner()) return;
    if (!match?._id) return;
    const team = activeSide === "A" ? playersA : playersB;
    if (!team?.length || team.length < 2) return;

    const partnerId =
      team.map(userIdOf).find((uid) => uid !== serverUidShow) || serverUidShow;
    const isDouble = eventType !== "single";
    const preStartOpening =
      isDouble &&
      (waitingStartActive ||
        match?.status !== "live" ||
        (Number(curA) === 0 && Number(curB) === 0 && Boolean(serve?.opening)));
    const nextOrder = preStartOpening ? 1 : activeServerNum === 1 ? 2 : 1;
    const nextOpening = preStartOpening;

    lastServerUidRef.current = partnerId;
    if (partnerId) {
      forcedServerRef.current = {
        uid: partnerId,
        until: Date.now() + 1500,
        gameIndex: curIdx,
        side: activeSide,
        serverNum: nextOrder,
      };
    }
    setLocalServeOverride({
      side: activeSide,
      server: nextOrder,
      serverId: partnerId,
      opening: nextOpening,
    });

    liveApi.setServe({
      side: activeSide,
      server: nextOrder,
      serverId: partnerId,
      opening: nextOpening,
      userMatch,
    });
  }, [
    match?._id,
    match?.status,
    activeSide,
    activeServerNum,
    serverUidShow,
    playersA,
    playersB,
    curIdx,
    curA,
    curB,
    serve?.opening,
    waitingStartActive,
    eventType,
    ensureLiveOwner,
    liveApi,
    userMatch,
  ]);

  const swapTeamSlots = useCallback(
    (teamKey) => {
      if (!ensureLiveOwner()) return;
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

      // Điều kiện "chưa bắt đầu trận hoặc game"
      const preOrZero =
        match?.status !== "live" || (Number(curA) === 0 && Number(curB) === 0);
      setLocalBaseOverride({ A: nextA, B: nextB });
      let nextServe = null;

      // ⛳ Theo yêu cầu: nếu chưa bắt đầu trận/game thì KHÔNG đổi giao.
      // Nhưng nếu hoán đổi ngay tại đội đang giao, cần đảm bảo 0-0-1 opening serve
      // và người giao là người đang ở ô phải theo bên hiện tại sau hoán đổi.
      if (preOrZero && teamKey === activeSide) {
        const rightSlot = preStartRightSlotForSide(teamKey, leftSide);
        const mapAfter = teamKey === "A" ? nextA : nextB;
        const uidRightNew =
          Object.entries(mapAfter).find(
            ([, slot]) => Number(slot) === rightSlot,
          )?.[0] ||
          Object.keys(mapAfter)[0] ||
          "";

        if (uidRightNew) {
          lastServerUidRef.current = uidRightNew;
          nextServe = {
            side: activeSide,
            server: 1,
            serverId: uidRightNew,
            opening: eventType !== "single",
          };
          setLocalServeOverride(nextServe);
        }
      }

      liveApi.setSlotsBase({
        base: { A: nextA, B: nextB },
        serve: nextServe,
        userMatch,
      });
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
      ensureLiveOwner,
      eventType,
      liveApi,
      userMatch,
    ],
  );

  const swapSides = () => {
    if (!ensureLiveOwner()) return;
    const nextLayout = { left: rightSide, right: leftSide };
    setLeftRight(nextLayout);

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
      liveApi.setSlotsBase({
        base: newBase,
        layout: nextLayout,
        userMatch,
      });
    }
  };

  const handleBack = useCallback(async () => {
    try {
      await ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.PORTRAIT_UP,
      );
    } catch {}
    router.back();
  }, [router]);

  const baseCode = String(getMatchDisplayCode(match) || "—").toUpperCase();
  const headerText = [
    baseCode,
    `BO${Number(rules?.bestOf || 1)}`,
    `G${curIdx + 1}`,
  ].join(" | ");

  const leftServing = activeSide === leftSide;
  const rightServing = activeSide === rightSide;
  const leftEnabled = canScoreByMatchState && leftServing && !incBusy && !undoBusy;
  const rightEnabled = canScoreByMatchState && rightServing && !incBusy && !undoBusy;
  const preStartServeSideLabel =
    activeSide === leftSide ? "Đội bên trái" : "Đội bên phải";
  const preStartServeHint = waitingStartActive
    ? "Chạm để đổi đội giao trước game này"
    : "Chạm để chọn đội giao trước trận";

  const openCccd = useCallback((u) => {
    setCccdUser(u || null);
    setCccdOpen(!!u);
  }, []);

  const cta = useMemo(() => {
    if (match?.status === "finished") {
      return null;
    }

    const bestOfNum = Number(rules?.bestOf || 1);
    const needSetWins = Math.floor(bestOfNum / 2) + 1;
    const decidedWinner =
      aWins >= needSetWins ? "A" : bWins >= needSetWins ? "B" : "";

    if (matchDecided && decidedWinner) {
      return {
        label: "Kết thúc trận",
        danger: true,
        onPress: () => finishMatchNow(decidedWinner),
      };
    }

    const currentGameAlreadyCounted = Boolean(
      isGameWin(
        currentGameScoreA,
        currentGameScoreB,
        Number(rules?.pointsToWin ?? 11),
        !!rules?.winByTwo,
      ),
    );

    const gameFinished = isGameWin(
      curA,
      curB,
      Number(rules?.pointsToWin ?? 11),
      !!rules?.winByTwo,
    );

    const previewAWins =
      gameFinished && !currentGameAlreadyCounted && curA > curB ? aWins + 1 : aWins;
    const previewBWins =
      gameFinished && !currentGameAlreadyCounted && curB > curA ? bWins + 1 : bWins;

    const winnerBySets =
      previewAWins >= needSetWins ? "A" : previewBWins >= needSetWins ? "B" : "";

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
      const finishedGames = previewAWins + previewBWins;
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
      const finalWinner = previewAWins > previewBWins ? "A" : "B";
      return {
        label: "Kết thúc trận",
        danger: true,
        onPress: () => finishMatchNow(finalWinner),
      };
    }

    if (needsStartAction) {
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
    matchDecided,
    needsStartAction,
    rules?.bestOf,
    rules?.pointsToWin,
    rules?.winByTwo,
    aWins,
    bWins,
    curA,
    curB,
    currentGameScoreA,
    currentGameScoreB,
    onStart,
    startNextGame,
    finishMatchNow,
  ]);

  const voiceCommandParseContext = useMemo(
    () => ({
      activeSide,
      leftSide,
      rightSide,
      canUndo: canUndoLive,
      localBreak: Boolean(activeBreak),
      ctaLabel: cta?.label || "",
    }),
    [activeSide, activeBreak, leftSide, rightSide, canUndoLive, cta?.label],
  );

  const {
    isListening: isVoiceListening,
    isProcessing: isVoiceProcessing,
  } = useVoiceCommands({
    enabled: voiceCommandEnabled && Boolean(match?._id) && match?.status !== "finished",
    onCommand: handleVoiceCommand,
    onError: handleVoiceCommandError,
    apiUrl: VOICE_API_URL,
    context: voiceCommandParseContext,
    trackTranscript: false,
  });

  voiceCommandCtxRef.current = {
    activeSide,
    canScoreNow,
    canUndo: canUndoLive,
    handleCallMedical,
    handleCallTimeout,
    handleContinue,
    inc,
    incBusy,
    leftSide,
    localBreak: activeBreak,
    onUndo,
    primaryCtaLabel: cta?.label || "",
    primaryCtaPress: cta?.onPress,
    rightSide,
    swapSides,
    toggleServeSide,
    toggleServerNum,
    undoBusy,
  };

  const midUsesServeToggle =
    eventType === "single" ||
    waitingStartActive ||
    match?.status !== "live" ||
    isOpeningServe ||
    activeServerNum !== 1;
  const midLabel = midUsesServeToggle ? "Đổi giao" : "Đổi tay";
  const midIcon = midUsesServeToggle ? "swap-calls" : "swap-vert";
  const onMidPress = midUsesServeToggle ? toggleServeSide : toggleServerNum;
  const shouldDockBottomCta = Boolean(cta) && (!isTightLandscape || !isPreMatch);
  const breakPalette =
    activeBreak?.type === "medical"
      ? {
          label: t.dark ? "#fca5a5" : "#dc2626",
          timer: t.dark ? "#fecaca" : "#dc2626",
          overlayBg: t.dark ? "rgba(45, 16, 16, 0.96)" : "rgba(255, 245, 245, 0.96)",
          overlayBorder: t.dark ? "#7f1d1d" : "#fecaca",
          buttonBg: t.dark ? "#b91c1c" : "#dc2626",
          buttonBorder: t.dark ? "#f87171" : "#ef4444",
          buttonText: "#ffffff",
          buttonShadow: t.dark ? "#ef4444" : "#dc2626",
        }
      : {
          label: t.dark ? "#fbbf24" : "#d97706",
          timer: t.dark ? "#fde68a" : "#b45309",
          overlayBg: t.dark ? "rgba(43, 29, 10, 0.96)" : "rgba(255, 251, 235, 0.96)",
          overlayBorder: t.dark ? "#92400e" : "#fcd34d",
          buttonBg: t.dark ? "#b45309" : "#d97706",
          buttonBorder: t.dark ? "#fbbf24" : "#f59e0b",
          buttonText: "#ffffff",
          buttonShadow: t.dark ? "#f59e0b" : "#d97706",
        };

  // ====== Ask-once-at-half-set per game ======
  useEffect(() => {
    if (match?.status !== "live" || waitingStartActive || midPoint == null) return;
    const asked = !!midAskedRef.current[curIdx];
    const isAtMidNow = curA === midPoint || curB === midPoint;
    if (!asked && isAtMidNow) {
      setMidPromptOpen(true);
      midAskedRef.current[curIdx] = true; // mark asked for this game
    }
  }, [match?.status, waitingStartActive, curIdx, curA, curB, midPoint]);

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
  const showInitialSkeleton = !isLandscape || (isLoading && !match);
  if (showInitialSkeleton)
    return (
      <RefereeJudgeSkeleton
        tokens={t}
        insets={insets}
        pageSafeEdges={pageSafeEdges}
        pageBottomInset={pageBottomInset}
        compact={isCompactLandscape || !isLandscape}
      />
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
    <SafeAreaView
      edges={pageSafeEdges}
      style={[s.page, { backgroundColor: t.colors.background }]}
    >
      <View
        style={{
          flex: 1,
          paddingLeft: insets.left,
          paddingRight: insets.right,
          paddingBottom: pageBottomInset,
        }}
      >
        {/* ===== TOP MENU ===== */}
        <View
          style={[
            s.card,
            s.topCard,
            useCompactTopChrome && s.topCardCompact,
            { backgroundColor: t.colors.card, borderColor: t.colors.border },
          ]}
        >
          <View
            style={[
              s.topHeaderRow,
              useCompactTopChrome && s.topHeaderRowCompact,
            ]}
          >
              <View
                style={[
                  s.topPrimaryControls,
                  useCompactTopChrome && s.topPrimaryControlsCompact,
                ]}
              >
                <Ripple
                  onPress={handleBack}
                  style={[
                    s.iconBtn,
                    useCompactTopChrome && s.iconBtnCompact,
                    { backgroundColor: t.colors.card },
                  ]}
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
                    s.topHeaderChip,
                    useCompactTopChrome && s.topHeaderChipCompact,
                    {
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                      backgroundColor: t.chipInfoBg,
                      borderColor: t.chipInfoBd,
                    },
                  ]}
                >
                  <Text
                    style={[
                      s.matchCodeText,
                      useCompactTopChrome && s.matchCodeTextCompact,
                      { color: t.colors.text },
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {headerText}
                  </Text>
                  {false && (
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
                  )}
                </View>

                <View
                  style={[
                    s.topActionGroup,
                    useCompactTopActions && s.topActionGroupCompact,
                  ]}
                >
                  {!isPreMatch && (
                    <>
                      <Ripple
                        onPress={onUndo}
                        disabled={undoBusy || !canUndoLive}
                        style={[
                          s.btnUndoSm,
                          useCompactTopActions && s.btnUndoSmCompact,
                          (undoBusy || !canUndoLive) &&
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
                        {showTopActionLabels ? (
                          <Text
                            style={[
                              s.btnUndoSmText,
                              useCompactTopActions && s.btnUndoSmTextCompact,
                            ]}
                            numberOfLines={1}
                          >
                            Hoàn tác
                          </Text>
                        ) : null}
                      </Ripple>

                      <Ripple
                        onPress={swapSides}
                        style={[
                          s.btnSwapSm,
                          useCompactTopActions && s.topSecondaryBtnCompact,
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
                        {showTopActionLabels ? (
                          <Text
                            style={[
                              s.btnSwapSmText,
                              useCompactTopActions && s.topSecondaryBtnTextCompact,
                              { color: t.chipInfo2Fg },
                            ]}
                            numberOfLines={1}
                          >
                            Đổi bên
                          </Text>
                        ) : null}
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
                    useCompactTopActions && s.topSecondaryBtnCompact,
                    {
                      width: useCompactTopActions ? 38 : 54,
                      height: useCompactTopActions ? 34 : 36,
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
                  <Text
                    style={[
                      s.btnOutlineSmText,
                      useCompactTopActions && s.topSecondaryBtnTextCompact,
                      { color: t.colors.text },
                    ]}
                  >
                    {activeServerNum}
                  </Text>
                </Ripple>

                {/* Gán/Đổi sân (court) */}
                {isPreMatch && userMatch !== "true" && (
                  <Ripple
                    onPress={() => setCourtOpen(true)}
                    style={[
                      s.btnOutlineSm,
                      useCompactTopActions && s.topSecondaryBtnCompact,
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
                      {showCourtActionLabel ? (
                        <Text
                          style={[
                            s.btnOutlineSmText,
                            useCompactTopActions && s.topSecondaryBtnTextCompact,
                            { color: t.colors.text },
                          ]}
                          numberOfLines={1}
                        >
                          {currentCourtId ? "Đổi sân" : "Gán sân"}
                        </Text>
                      ) : null}
                    </Ripple>
                  )}
                </View>
              <View
                style={[
                  s.topUtilityControls,
                  useCompactTopChrome && s.topUtilityControlsCompact,
                ]}
              >
                {/* Nút Voice Commands */}
                <TouchableOpacity
                  onPress={() => {
                    const next = !voiceCommandEnabled;
                    setVoiceCommandEnabled(next);
                    Toast.show({
                      type: next ? "success" : "info",
                      text1: next
                        ? "Đã bật voice command"
                        : "Đã tắt voice command",
                      text2: next
                        ? 'Có thể nói: "điểm", "đổi giao", "đổi tay", "timeout", "bắt đầu"...'
                        : undefined,
                      visibilityTime: 2000,
                    });
                  }}
                >
                  <View
                    style={[
                      s.iconBtnSetting,
                      useCompactTopChrome && s.iconBtnSettingCompact,
                      {
                        borderRadius: 20,
                        backgroundColor: voiceCommandEnabled
                          ? isVoiceListening
                            ? t.colors.primary
                            : "#f59e0b"
                          : t.chipInfoBg,
                      },
                    ]}
                  >
                    {isVoiceProcessing ? (
                      <ActivityIndicator size="small" color={t.chipInfoFg} />
                    ) : (
                      <MaterialIcons
                        name={
                          voiceCommandEnabled
                            ? "keyboard-voice"
                            : "voice-over-off"
                        }
                        size={useCompactTopChrome ? 18 : 20}
                        color={voiceCommandEnabled ? "#fff" : t.chipInfoFg}
                      />
                    )}
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    const nextState = !voiceEnabled;
                    setVoiceEnabled(nextState);
                    if (nextState) {
                      Speech.speak("Bật âm thanh");
                    } else {
                      Speech.stop();
                    }
                  }}
                >
                  <View
                    style={[
                      s.iconBtnSetting,
                      useCompactTopChrome && s.iconBtnSettingCompact,
                      {
                        borderRadius: 20,
                        backgroundColor: voiceEnabled
                          ? t.colors.primary
                          : t.chipInfoBg,
                        borderWidth: 1,
                        borderColor: voiceEnabled
                          ? t.colors.primary
                          : t.chipInfoBd,
                      },
                    ]}
                  >
                    <MaterialIcons
                      name={voiceEnabled ? "volume-up" : "volume-off"}
                      size={useCompactTopChrome ? 18 : 20}
                      color={voiceEnabled ? "#fff" : t.chipInfoFg}
                    />
                  </View>
                </TouchableOpacity>
                {/* NÚT SETTINGS GÓC PHẢI */}
                <TouchableOpacity onPress={() => setSettingsOpen(true)}>
                  <View
                    style={[
                      s.iconBtnSetting,
                      useCompactTopChrome && s.iconBtnSettingCompact,
                      {
                        borderRadius: 20,
                        backgroundColor: t.chipInfoBg,
                        borderWidth: 1,
                        borderColor: t.chipInfoBd,
                      },
                    ]}
                  >
                    <MaterialIcons
                      name="settings"
                      size={useCompactTopChrome ? 18 : 20}
                      color={t.chipInfoFg}
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
              useCompactTopActions && s.btnCourtNameSmCompact,
              { backgroundColor: t.colors.card, borderColor: t.colors.border },
            ]}
          >
            <Text
              style={[
                s.btnCourtNameSmText,
                useCompactTopActions && s.btnCourtNameSmTextCompact,
                { color: t.colors.text },
              ]}
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
            isTightLandscape && s.scoreboardCardCompact,
            { backgroundColor: t.colors.card, borderColor: t.colors.border },
          ]}
        >
          <View style={s.scoreboardBody}>
            <View
              style={[
                s.scoreboardRow,
                isCompactLandscape && s.scoreboardRowCompact,
              ]}
            >
              <TeamSimple
                teamKey={leftSide}
                players={leftSide === "A" ? playersA : playersB}
                slotsNow={leftSide === "A" ? slotsNowA : slotsNowB}
                onSwap={() => swapTeamSlots(leftSide)}
                source={match}
                isServing={leftSide === activeSide}
                activeSide={activeSide}
                serverUidShow={serverUidShow}
                onPressAvatar={openCccd}
                compact={isCompactLandscape}
                airy={useAiryScoreboard}
                airyWide={useWideAiryScoreboard}
              />

              <View
                style={[
                  s.centerCol,
                  isCompactLandscape && s.centerColCompact,
                  !needsStartAction && useAiryScoreboard && s.centerColAiry,
                  !needsStartAction &&
                    useWideAiryScoreboard &&
                    s.centerColAiryWide,
                  {
                    backgroundColor: t.colors.card,
                    borderColor: t.colors.border,
                  },
                ]}
              >
                {needsStartAction ? (
                  <View
                    style={[
                      s.preStartCenter,
                      isCompactLandscape && s.preStartCenterCompact,
                    ]}
                  >
                    <Text
                      style={[
                        s.preStartLabel,
                        isCompactLandscape && s.preStartLabelCompact,
                        { color: t.subtext },
                      ]}
                    >
                      Giao trước
                    </Text>
                    <Ripple
                      onPress={toggleServeSide}
                      rippleContainerBorderRadius={999}
                      style={[
                        s.preStartServeBtn,
                        isCompactLandscape && s.preStartServeBtnCompact,
                        {
                          borderColor: t.colors.primary,
                          backgroundColor: t.dark ? "#0a84ff22" : "#0a84ff15",
                        },
                      ]}
                    >
                      <MaterialIcons
                        name="swap-calls"
                        size={isCompactLandscape ? 20 : 24}
                        color={t.colors.primary}
                      />
                      <Text
                        style={[
                          s.preStartServeBtnText,
                          isCompactLandscape && s.preStartServeBtnTextCompact,
                          { color: t.colors.primary },
                        ]}
                        numberOfLines={1}
                      >
                        {preStartServeSideLabel}
                      </Text>
                    </Ripple>
                    <Text
                      style={[
                        s.preStartHint,
                        isCompactLandscape && s.preStartHintCompact,
                        { color: t.muted },
                      ]}
                    >
                      {preStartServeHint}
                    </Text>
                  </View>
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
                      disabled={!canScoreByMatchState && !activeBreak}
                      compact={isCompactLandscape}
                    />
                    <Text
                      style={[
                        s.callout,
                        isCompactLandscape && s.calloutCompact,
                        isUltraTightLandscape && s.calloutUltraCompact,
                        { color: t.colors.text },
                      ]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {callout || "—"}
                    </Text>

                    <View
                      style={[
                        s.rowBetween,
                        s.centerScoreRow,
                        isCompactLandscape && s.centerScoreRowCompact,
                      ]}
                    >
                      <Text
                        style={[
                          s.scoreNow,
                          isCompactLandscape && s.scoreNowCompact,
                          isUltraTightLandscape && s.scoreNowUltraCompact,
                          { color: t.success },
                        ]}
                      >
                        {leftGameScore}
                      </Text>
                      <Text
                        style={[
                          s.centerScoreLabel,
                          isCompactLandscape && s.centerScoreLabelCompact,
                          isUltraTightLandscape && s.centerScoreLabelUltraCompact,
                          { color: t.colors.text },
                        ]}
                      >
                        Game
                      </Text>
                      <Text
                        style={[
                          s.scoreNow,
                          isCompactLandscape && s.scoreNowCompact,
                          isUltraTightLandscape && s.scoreNowUltraCompact,
                          { color: t.success },
                        ]}
                      >
                        {rightGameScore}
                      </Text>
                    </View>

                    <View
                      style={[
                        s.rowBetween,
                        s.centerScoreRow,
                        s.centerMatchRow,
                        isCompactLandscape && s.centerScoreRowCompact,
                      ]}
                    >
                      <Text
                        style={[
                          s.setWin,
                          isCompactLandscape && s.setWinCompact,
                          isUltraTightLandscape && s.setWinUltraCompact,
                          { color: t.colors.text },
                        ]}
                      >
                        {leftSetWins}
                      </Text>
                      <Text
                        style={[
                          s.centerMatchLabel,
                          isCompactLandscape && s.centerScoreLabelCompact,
                          isUltraTightLandscape && s.centerScoreLabelUltraCompact,
                          { color: t.colors.text },
                        ]}
                      >
                        Match
                      </Text>
                      <Text
                        style={[
                          s.setWin,
                          isCompactLandscape && s.setWinCompact,
                          isUltraTightLandscape && s.setWinUltraCompact,
                          { color: t.colors.text },
                        ]}
                      >
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
                source={match}
                isServing={rightSide === activeSide}
                activeSide={activeSide}
                serverUidShow={serverUidShow}
                onPressAvatar={openCccd}
                compact={isCompactLandscape}
                airy={useAiryScoreboard}
                airyWide={useWideAiryScoreboard}
              />
            </View>
          </View>
        </View>

        {/* ===== BOTTOM CONTROL CARD ===== */}
        <View
          style={[
            s.card,
            s.bottomCard,
            isTightLandscape && s.bottomCardCompact,
            { backgroundColor: t.colors.card, borderColor: t.colors.border },
          ]}
        >
          <View style={[
            s.bottomBar,
            isTightLandscape && s.bottomBarCompact,
            needsStartAction && { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 12 },
          ]}>
            {/* Clock / Break label — always on the left */}
            {activeBreak ? (
              <Text
                style={[
                  s.clockText,
                  !needsStartAction && s.clockAbsolute,
                  !needsStartAction && isTightLandscape && s.clockInline,
                  {
                    color:
                      activeBreak.type === "medical" ? "#dc2626" : "#d97706",
                    fontSize: 20,
                    fontWeight: "900",
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  },
                ]}
              >
                {activeBreak.type === "medical" ? "Nghỉ y tế" : "Timeout"}
              </Text>
            ) : (
              <LiveClock
                style={[
                  s.clockText,
                  !needsStartAction && s.clockAbsolute,
                  !needsStartAction && isTightLandscape && s.clockInline,
                  { color: t.colors.text },
                ]}
              />
            )}

            {activeBreak ? (
              <View style={s.breakOverlay}>
                <BreakTimer endTime={activeBreak.endTime} style={s.breakTimer} />

	                <Ripple
	                  onPress={handleContinue}
	                  style={[
	                    s.btnContinue,
	                    {
	                      backgroundColor: breakPalette.buttonBg,
	                      borderColor: breakPalette.buttonBorder,
	                      borderWidth: 1,
	                      shadowColor: breakPalette.buttonShadow,
	                    },
	                  ]}
	                  rippleContainerBorderRadius={12}
	                >
	                  <Text
	                    style={[
	                      s.btnContinueText,
	                      { color: breakPalette.buttonText },
	                    ]}
	                  >
	                    Tiếp tục
	                  </Text>
	                  <MaterialIcons
	                    name="play-arrow"
	                    size={24}
	                    color={breakPalette.buttonText}
	                  />
	                </Ripple>
	              </View>
	            ) : needsStartAction ? (
              /* Pre-match: CTA buttons inline in 1 row */
              <View style={[s.row, { gap: 8 }]}>
                {cta && (
                  <Ripple
                    onPress={cta.onPress}
                    rippleContainerBorderRadius={12}
                    style={[
                      s.bigActionBtn,
                      isTightLandscape && s.bigActionBtnCompact,
                      cta.danger
                        ? { backgroundColor: "#ef4444", borderColor: "#b91c1c" }
                        : { backgroundColor: t.success, borderColor: t.success },
                    ]}
                  >
                    <Text
                      style={[
                        s.bigActionText,
                        isTightLandscape && s.bigActionTextCompact,
                        { color: "#fff" },
                      ]}
                      numberOfLines={1}
                    >
                      {cta.label}
                    </Text>
                  </Ripple>
                )}

                {isPreMatch && (
                  <Ripple
                    onPress={swapSides}
                    rippleContainerBorderRadius={12}
                    style={[
                      s.bigActionBtn,
                      isTightLandscape && s.bigActionBtnCompact,
                      {
                        backgroundColor: t.colors.card,
                        borderColor: t.colors.border,
                      },
                    ]}
                  >
                    <MaterialIcons
                      name="swap-horiz"
                      size={isTightLandscape ? 14 : 16}
                      color={t.colors.text}
                    />
                    <Text
                      style={[
                        s.bigActionText,
                        isTightLandscape && s.bigActionTextCompact,
                        { color: t.colors.text },
                      ]}
                      numberOfLines={1}
                    >
                      Đổi bên
                    </Text>
                  </Ripple>
                )}

                {isPreMatch && (
                  <Ripple
                    onPress={() => setMenuOpen(true)}
                    rippleContainerBorderRadius={12}
                    style={[
                      s.bigActionBtn,
                      isTightLandscape && s.bigActionBtnCompact,
                      {
                        borderColor: t.colors.primary,
                        backgroundColor: t.dark ? "#0a84ff22" : "#0a84ff15",
                      },
                    ]}
                  >
                    <MaterialIcons
                      name="casino"
                      size={isTightLandscape ? 14 : 16}
                      color={t.colors.primary}
                    />
                    <Text
                      style={[
                        s.btnDrawText,
                        isTightLandscape && s.bigActionTextCompact,
                        { color: t.colors.primary },
                      ]}
                      numberOfLines={1}
                    >
                      Bốc thăm
                    </Text>
                  </Ripple>
                )}
              </View>
            ) : (
              /* In-game: score buttons centered */
              <View
                style={[
                  s.row,
                  s.bottomActions,
                  isTightLandscape && s.bottomActionsCompact,
                ]}
              >
                <Ripple
                  onPress={() => inc(leftSide)}
                  disabled={!leftEnabled}
                  rippleContainerBorderRadius={12}
                  style={[
                    s.bigActionBtn,
                    isTightLandscape && s.bigActionBtnCompact,
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
                        size={isTightLandscape ? 18 : 22}
                        color={
                          activeSide === leftSide ? "#fff" : t.colors.text
                        }
                    />
                  )}
                  <Text
                      style={[
                        s.bigActionText,
                        isTightLandscape && s.bigActionTextCompact,
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
                    isTightLandscape && s.toggleBtnCompact,
                    (incBusy || undoBusy) && s.btnDisabled,
                  ]}
                >
                  <MaterialIcons
                    name={midIcon}
                    size={isTightLandscape ? 18 : 22}
                    color="#fff"
                  />
                  <Text style={[s.toggleText, isTightLandscape && s.bigActionTextCompact]}>
                    {midLabel}
                  </Text>
                </Ripple>

                <Ripple
                  onPress={() => inc(rightSide)}
                  disabled={!rightEnabled}
                  rippleContainerBorderRadius={12}
                  style={[
                    s.bigActionBtn,
                    isTightLandscape && s.bigActionBtnCompact,
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
                        size={isTightLandscape ? 18 : 22}
                        color={
                          activeSide === rightSide ? "#fff" : t.colors.text
                        }
                    />
                  )}
                  <Text
                      style={[
                        s.bigActionText,
                        isTightLandscape && s.bigActionTextCompact,
                        { color: t.colors.text },
                        activeSide === rightSide && s.bigActionTextActive,
                      ]}
                  >
                    Đội bên phải
                  </Text>
                </Ripple>
              </View>
            )}
            {/* CTA for in-game state (Bắt game tiếp / Kết thúc trận) — absolute positioned */}
            {!needsStartAction && cta && (
              <View
                style={[
                  s.bottomRightActions,
                  !shouldDockBottomCta &&
                    isTightLandscape &&
                    s.bottomRightActionsCompact,
                ]}
              >
                <Ripple
                  onPress={cta.onPress}
                  rippleContainerBorderRadius={12}
                  style={[
                    s.bigActionBtn,
                    isTightLandscape && s.bigActionBtnCompact,
                    cta.danger
                      ? { backgroundColor: "#ef4444", borderColor: "#b91c1c" }
                      : { backgroundColor: t.success, borderColor: t.success },
                  ]}
                >
                  <Text
                    style={[
                      s.bigActionText,
                      isTightLandscape && s.bigActionTextCompact,
                      { color: "#fff" },
                    ]}
                    numberOfLines={1}
                  >
                    {cta.label}
                  </Text>
                </Ripple>
              </View>
            )}
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
          edges={["top"]}
          style={[
            s.fullModalWrap,
            {
              backgroundColor: t.colors.background,
              paddingLeft: insets.left,
              paddingRight: insets.right,
              paddingBottom: insets.bottom,
            },
          ]}
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
        onLoadCourts={loadAvailableCourts}
        onAssignCourt={({ courtId }) =>
          liveApi.assignCourt({ courtId })
        }
        onUnassignCourt={() =>
          liveApi.unassignCourt()
        }
      />
      <MatchSettingsModal
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        matchId={match?._id}
        matchSnapshot={match}
        onRefresh={refetch}
        onSave={async (payload) => {
          await liveApi.updateSettings({
            ...payload,
            userMatch: isUserMatch,
          });
          setSettingsOpen(false);
        }}
      />
      </View>
    </SafeAreaView>
  );
}

/* ========== styles ========== */
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#fff" },
  skeletonPageInner: {
    flex: 1,
  },
  skeletonCourtPill: {
    alignSelf: "center",
    marginTop: 6,
    marginBottom: 6,
  },
  skeletonTeamStack: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "space-evenly",
    gap: 12,
  },
  skeletonCenterTop: {
    width: "100%",
    alignItems: "center",
    marginBottom: 8,
  },
  skeletonScoreRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  skeletonClock: {
    position: "absolute",
    left: 12,
    top: "50%",
    transform: [{ translateY: -9 }],
  },
  fullNameText: { fontSize: 16, fontWeight: "800", color: "#0f172a", flexShrink: 1, textAlign: "center" },
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
  topHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  topHeaderRowCompact: {
    gap: 6,
  },
  topPrimaryControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    flexWrap: "wrap",
    gap: 8,
    flex: 1,
    minWidth: 0,
    paddingRight: 4,
  },
  topPrimaryControlsCompact: {
    flex: 1,
    width: undefined,
    gap: 6,
    paddingRight: 0,
  },
  topUtilityControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  topUtilityControlsCompact: {
    gap: 6,
  },
  topHeaderChip: {
    flexShrink: 1,
    minWidth: 0,
    maxWidth: "100%",
  },
  topHeaderChipCompact: {
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  topActionGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
    flexWrap: "wrap",
  },
  topActionGroupCompact: {
    gap: 4,
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
  topCardCompact: {
    padding: 6,
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
  bottomCardCompact: {
    paddingVertical: 6,
  },

  scoreboardCard: { flex: 1, minHeight: 0, padding: 10 },
  scoreboardCardCompact: { padding: 8 },
  scoreboardBody: { flex: 1, justifyContent: "center" },
  scoreboardRow: {
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "space-between",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  scoreboardRowCompact: {
    gap: 6,
  },

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
  iconBtnCompact: {
    width: 34,
    height: 34,
    paddingVertical: 0,
    paddingHorizontal: 0,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnSetting: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "#f2f0f5",
  },
  iconBtnSettingCompact: {
    width: 36,
    height: 36,
    paddingVertical: 0,
    paddingHorizontal: 0,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
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
  topSecondaryBtnCompact: {
    minWidth: 36,
    height: 36,
    paddingVertical: 0,
    paddingHorizontal: 8,
    borderRadius: 18,
    gap: 4,
    justifyContent: "center",
  },
  topSecondaryBtnTextCompact: {
    fontSize: 12,
  },

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
  centerColCompact: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 0,
  },
  centerColAiry: {
    justifyContent: "space-evenly",
    paddingVertical: 18,
  },
  centerColAiryWide: {
    paddingVertical: 24,
    gap: 6,
  },
  preStartCenter: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 12,
  },
  preStartCenterCompact: {
    gap: 8,
    paddingVertical: 8,
  },
  preStartLabel: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  preStartLabelCompact: {
    fontSize: 11,
    letterSpacing: 0.6,
  },
  preStartServeBtn: {
    minWidth: 124,
    minHeight: 52,
    borderRadius: 999,
    borderWidth: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
  },
  preStartServeBtnCompact: {
    minWidth: 104,
    minHeight: 42,
    gap: 6,
    paddingHorizontal: 10,
  },
  preStartServeBtnText: {
    fontSize: 15,
    fontWeight: "800",
  },
  preStartServeBtnTextCompact: {
    fontSize: 12,
  },
  preStartHint: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  preStartHintCompact: {
    fontSize: 10,
  },
  callout: {
    fontSize: 30,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: 2,
    marginBottom: 8,
  },
  calloutCompact: {
    fontSize: 22,
    letterSpacing: 1,
    marginBottom: 4,
  },
  calloutUltraCompact: {
    fontSize: 18,
    marginBottom: 2,
  },
  scoreNow: { fontSize: 30, fontWeight: "800", color: "#0f172a" },
  scoreNowCompact: { fontSize: 24 },
  scoreNowUltraCompact: { fontSize: 20 },
  scoreNowText: { color: "#16a34a" },
  setWin: { fontSize: 30, fontWeight: "800", color: "#111827" },
  setWinCompact: { fontSize: 24 },
  setWinUltraCompact: { fontSize: 20 },
  centerScoreRow: {
    width: "100%",
    marginTop: 6,
  },
  centerScoreRowCompact: {
    marginTop: 2,
  },
  centerMatchRow: {
    marginTop: 4,
  },
  centerScoreLabel: {
    fontSize: 16,
    fontWeight: "700",
    opacity: 0.8,
    textTransform: "uppercase",
  },
  centerScoreLabelCompact: {
    fontSize: 13,
  },
  centerScoreLabelUltraCompact: {
    fontSize: 11,
  },
  centerMatchLabel: {
    opacity: 0.65,
    fontSize: 16,
    fontWeight: "700",
  },

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
  teamBoxCompact: { padding: 8, gap: 4 },
  teamBoxAiry: {
    paddingVertical: 18,
  },
  teamBoxAiryWide: {
    paddingVertical: 24,
  },
  teamStack: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
  },
  teamStackCompact: {
    gap: 6,
  },
  teamStackAiry: {
    flex: 1,
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  teamStackAiryWide: {
    paddingVertical: 12,
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
    borderColor: "#e5e7eb", maxWidth: "100%",
  },
  badgeNameCompact: { paddingVertical: 3, paddingHorizontal: 6 },
  nickTextCompact: { fontSize: 12 },

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
  bigActionBtnCompact: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    gap: 4,
  },
  bigActionBtnActive: { backgroundColor: "#1d4ed8", borderColor: "#1e40af" },
  bigActionText: { fontWeight: "800", color: "#0f172a", flexShrink: 1 },
  bigActionTextCompact: { fontSize: 12 },
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
  toggleBtnCompact: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    gap: 4,
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
  bottomBarCompact: {
    minHeight: 52,
    paddingVertical: 4,
    gap: 0,
  },
  clockAbsolute: {
    position: "absolute",
    left: 12,
    top: "50%",
    transform: [{ translateY: -10 }],
  },
  clockInline: {
    position: "absolute",
    left: 12,
    top: "50%",
    transform: [{ translateY: -10 }],
    alignSelf: "auto",
  },
  bottomActions: { gap: 8, alignItems: "center", justifyContent: "center" },
  bottomActionsCompact: {
    width: "100%",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 6,
  },

  matchCodeText: { fontSize: 18, fontWeight: "700", color: "#0f172a", flexShrink: 1 },
  matchCodeTextCompact: { fontSize: 15 },

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
  winRowInlineCompact: {
    position: "relative",
    top: undefined,
    left: undefined,
    right: undefined,
    height: 26,
    marginBottom: 6,
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
  winDigitBubbleCompact: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  winDigitText: { fontSize: 12, fontWeight: "800", color: "#111827" },
  winDigitTextCompact: { fontSize: 10 },
  winAdjustBubble: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  winAdjustBubbleCompact: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  winAdjustPlus: { backgroundColor: "#ef4444", borderColor: "#dc2626" },
  winAdjustMinus: { backgroundColor: "#dc2626", borderColor: "#b91c1c" },
  timeoutScrollBtn: {
    justifyContent: "center",
    alignItems: "center",
    width: 24,
    height: 24,
    zIndex: 20,
  },
  timeoutScrollBtnCompact: {
    width: 18,
    height: 18,
  },

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
  btnUndoSmCompact: {
    minWidth: 36,
    height: 36,
    paddingVertical: 0,
    paddingHorizontal: 8,
    borderRadius: 18,
    gap: 4,
    justifyContent: "center",
  },
  btnUndoSmText: { color: "#92400e", fontWeight: "700", flexShrink: 1 },
  btnUndoSmTextCompact: { fontSize: 12 },

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
  btnCourtNameSmCompact: {
    maxWidth: 140,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  btnCourtNameSmText: {
    fontWeight: "700",
    fontSize: 14,
  },
  btnCourtNameSmTextCompact: {
    fontSize: 12,
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
  bottomRightActionsCompact: {
    position: "relative",
    right: undefined,
    top: undefined,
    transform: [],
    width: "100%",
    justifyContent: "center",
    flexWrap: "wrap",
    alignSelf: "stretch",
    gap: 6,
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
