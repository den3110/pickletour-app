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
} from "react-native";
import Ripple from "react-native-material-ripple";
import { MaterialIcons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import {
  useGetMatchQuery,
  useRefereeIncPointMutation,
  useRefereeSetGameScoreMutation,
  useRefereeSetStatusMutation,
  useRefereeSetWinnerMutation,
  useRefereeNextGameMutation,
} from "@/slices/tournamentsApiSlice";
import { useSocket } from "@/context/SocketContext";
import * as ScreenOrientation from "expo-screen-orientation";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { normalizeUrl } from "@/utils/normalizeUri";
import CCCDModal from "../CCCDModal.native";

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

/* ======= memo child components ======= */
const NameBadge = memo(
  function NameBadge({ user, isServer, onPressAvatar }) {
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
        <Text style={s.fullNameText} numberOfLines={1}>
          {fullName}
        </Text>

        <View style={{ position: "relative", marginTop: 6 }}>
          <View style={[s.badgeName, { paddingRight: 34 /* chừa icon */ }]}>
            {showIcon ? (
              <Ripple
                onPress={() => onPressAvatar?.(user)}
                rippleContainerBorderRadius={AV_SIZE / 2}
                style={{
                  width: AV_SIZE,
                  height: AV_SIZE,
                  borderRadius: AV_SIZE / 2,
                  backgroundColor: "#e5e7eb",
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 6,
                }}
              >
                <MaterialIcons name="person" size={20} color="#6b7280" />
              </Ripple>
            ) : (
              <Ripple
                onPress={() => onPressAvatar?.(user)}
                rippleContainerBorderRadius={AV_SIZE / 2}
                style={{ marginRight: 6, borderRadius: AV_SIZE / 2 }}
              >
                <Image
                  source={{ uri: avatarUri }}
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

            <Text style={s.nickText} numberOfLines={1}>
              {displayNick(user)}
            </Text>
          </View>

          {isServer ? (
            <View style={s.serveIconBadge}>
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
      <View style={[s.teamBox, isServing && s.teamBoxActive]}>
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
              style={[s.iconBtn, { alignSelf: "center" }]}
              rippleContainerBorderRadius={8}
            >
              <MaterialIcons name="swap-vert" size={18} color="#111827" />
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

/* ========== main component ========== */
export default function RefereeJudgePanel({ matchId }) {
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

  const socket = useSocket();

  // ====== derive ======
  const rules = match?.rules || { bestOf: 1, pointsToWin: 11, winByTwo: true };
  const basePointsToWin = Number(rules?.pointsToWin ?? 11);
  const [ptw, setPtw] = useState(basePointsToWin);
  const eventType = (match?.tournament?.eventType || "double").toLowerCase();
  const gs = match?.gameScores || [];
  const curIdx = Math.max(0, gs.length - 1);
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

  // Serve state
  const serve = match?.serve || { side: "A", server: 2, serverId: "" };
  const activeSide = serve?.side === "B" ? "B" : "A";
  const activeServerNum =
    Number(serve?.order ?? serve?.server ?? 1) === 2 ? 2 : 1;
  const serverUidShow =
    serve?.serverId || getUidAtSlotNow(activeSide, activeServerNum) || "";

  const callout =
    eventType === "single"
      ? `${activeSide === "A" ? curA : curB}–${
          activeSide === "A" ? curB : curA
        }`
      : activeSide === "A"
      ? `${curA}-${curB}-${activeServerNum}`
      : `${curB}-${curA}-${activeServerNum}`;

  // Số game (set) đã thắng mỗi đội (chỉ đếm game đã win hợp lệ với rules.pointsToWin)
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

  // Game đã kết thúc theo PTW hiện hành?
  const gameLocked = isGameWin(curA, curB, ptw, rules.winByTwo);

  // ====== local UI state ======
  const [leftRight, setLeftRight] = useState({ left: "A", right: "B" });
  const leftSide = leftRight.left;
  const rightSide = leftRight.right;

  const [menuOpen, setMenuOpen] = useState(false);
  const [now, setNow] = useState(new Date());
  const [cccdOpen, setCccdOpen] = useState(false);
  const [cccdUser, setCccdUser] = useState(null);

  // Mid-game side switch prompt
  const [midPromptOpen, setMidPromptOpen] = useState(false);
  const midAskedGamesRef = useRef(new Set());
  const bestOf = Number(rules?.bestOf || 1);
  const isDecider = bestOf > 1 && curIdx === bestOf - 1;

  // Mốc đổi sân theo ptw
  const midPoint =
    ptw === 11
      ? isDecider
        ? 6
        : null
      : ptw === 15
      ? 8
      : ptw === 21
      ? 11
      : Math.ceil(ptw / 2);
  const shouldAskMid =
    (ptw === 11 && isDecider) ||
    ptw === 15 ||
    ptw === 21 ||
    ![11, 15, 21].includes(ptw);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setPtw(basePointsToWin);
  }, [basePointsToWin]);

  // ====== Undo stack (mở rộng) ======
  const undoStack = useRef([]);
  const pushUndo = (entry) => {
    undoStack.current.push(entry);
    if (undoStack.current.length > 50) undoStack.current.shift();
  };

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

  // ====== actions ======
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
          autoNext: false,
        }).unwrap();
      }
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
      await nextGame({ matchId: match._id }).unwrap();
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

  // ====== API điểm set (11 <-> 15) ======
  const setPointsToWinOnServer = useCallback(
    (nextVal) => {
      if (!match?._id) return;
      socket?.emit(
        "rules:setPointsToWin",
        { matchId: match._id, pointsToWin: Number(nextVal) },
        (ack) => {
          if (!ack?.ok) {
            Toast.show({
              type: "error",
              text1: "Lỗi",
              text2: ack?.message || "Không cập nhật điểm set",
            });
            return;
          }
          // KHÔNG pushUndo cho PTW
          setPtw(Number(nextVal));
          refetch();
          Toast.show({
            type: "success",
            text1: "Đã cập nhật",
            text2: `Điểm set: ${nextVal}`,
          });
        }
      );
    },
    [match?._id, refetch, socket]
  );

  // ====== điều kiện khóa cộng điểm ======
  const canScoreNow = match?.status === "live" && !matchDecided && !gameLocked;

  // Cộng điểm: chỉ đội đang giao; sau khi cộng, GIỮ nguyên serverId, đảo #1↔#2 (đổi tay giao)
  const inc = async (side) => {
    if (!match) return;

    if (!canScoreNow) {
      Toast.show({
        type: "info",
        text1: "Đã khóa cộng điểm",
        text2: matchDecided
          ? "Trận đã đủ số game thắng (BO)."
          : "Game đã kết thúc, vui lòng sang game tiếp theo.",
      });
      return;
    }

    if (side !== activeSide) return;

    const prevServerUid = serverUidShow;
    const nextOrder = activeServerNum === 1 ? 2 : 1;

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

      // đổi tay (slot 1↔2) nhưng GIỮ nguyên người giao
      if (prevServerUid) {
        socket?.emit(
          "serve:set",
          {
            matchId: match._id,
            side: activeSide,
            server: nextOrder,
            serverId: prevServerUid,
          },
          (ack) => {
            if (!ack?.ok) {
              Toast.show({
                type: "error",
                text1: "Lỗi",
                text2:
                  ack?.message || "Không cập nhật người giao sau khi cộng điểm",
              });
            } else {
              refetch();
            }
          }
        );
      } else {
        refetch();
      }

      pushUndo({ t: "POINT", side });
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
    try {
      if (entry.t === "POINT") {
        await dec(entry.side);
        socket?.emit("score:inc", {
          matchId: match?._id,
          side: entry.side,
          delta: -1,
          autoNext: false,
        });
        refetch();
      } else if (entry.t === "SERVE_SET") {
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
        socket?.emit(
          "slots:setBase",
          { matchId: match?._id, base: entry.prevBase },
          (ack) => {
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
        setLeftRight(entry.prev);
      }
      // KHÔNG hoàn tác PTW
    } catch {
      Toast.show({ type: "error", text1: "Hoàn tác thất bại" });
    }
  };

  // ĐỔI GIAO (side-out): sang đội kia, server = 1, người đang đứng ô #1 (phải) giao
  const toggleServeSide = () => {
    if (!match?._id) return;
    const prev = {
      side: activeSide,
      server: activeServerNum,
      serverId: serverUidShow,
    };
    const nextSide = activeSide === "A" ? "B" : "A";
    const rightUid =
      getUidAtSlotNow(nextSide, 1) || getUidAtSlotNow(nextSide, 2) || "";

    socket?.emit(
      "serve:set",
      { matchId: match._id, side: nextSide, server: 1, serverId: rightUid },
      (ack) => {
        if (!ack?.ok) {
          Toast.show({
            type: "error",
            text1: "Lỗi",
            text2: ack?.message || "Không đặt được giao bóng",
          });
        } else {
          pushUndo({ t: "SERVE_SET", prev });
          refetch();
        }
      }
    );
  };

  // ĐỔI TAY (trong cùng đội)
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

  // Đổi vị trí Ô (1↔2) — KHÔNG đụng vào serve
  const swapTeamSlots = useCallback(
    (teamKey) => {
      if (!match?._id) return;

      const list = teamKey === "A" ? playersA : playersB;
      if (!list?.[0] || !list?.[1]) return;

      const uidTop = userIdOf(list[0]);
      const uidBottom = userIdOf(list[1]);

      const nextA = { ...baseA };
      const nextB = { ...baseB };

      if (teamKey === "A") {
        const cur1 = Number(nextA[uidTop] || 1);
        const cur2 = Number(nextA[uidBottom] || 2);
        nextA[uidTop] = cur2;
        nextA[uidBottom] = cur1;
      } else {
        const cur1 = Number(nextB[uidTop] || 1);
        const cur2 = Number(nextB[uidBottom] || 2);
        nextB[uidTop] = cur2;
        nextB[uidBottom] = cur1;
      }

      const prevBase = { A: baseA, B: baseB };

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
          refetch();
        }
      );
    },
    [match?._id, playersA, playersB, baseA, baseB, refetch]
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

  // Header: CODE (HOA) | BOx | Gx
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

  // enable/disable nút cộng điểm
  const leftServing = activeSide === leftSide;
  const rightServing = activeSide === rightSide;
  const leftEnabled = canScoreNow && leftServing;
  const rightEnabled = canScoreNow && rightServing;

  const openCccd = useCallback((u) => {
    setCccdUser(u || null);
    setCccdOpen(!!u);
  }, []);

  // ====== CTA động cho nút chính ======
  const cta = useMemo(() => {
    if (match?.status === "finished") return null;

    if (match?.status !== "live") {
      return {
        label: "Bắt đầu",
        danger: false,
        onPress: onStart,
      };
    }

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

    if (gameFinished) {
      const finishedGames = aWins + bWins;
      const remainingGames = bestOfNum - finishedGames;
      if (remainingGames > 0) {
        return {
          label: "Bắt game tiếp",
          danger: false,
          onPress: startNextGame,
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

  // Nút giữa theo thứ tự server
  const isServer1 = activeServerNum === 1;
  const midLabel = isServer1 ? "Đổi tay" : "Đổi giao";
  const midIcon = isServer1 ? "swap-vert" : "swap-calls";
  const onMidPress = isServer1 ? toggleServerNum : toggleServeSide;

  // Tự nhắc đổi sân giữa game
  useEffect(() => {
    if (match?.status !== "live" || !shouldAskMid || midPoint == null) return;
    if (midAskedGamesRef.current.has(curIdx)) return;
    if (curA === midPoint || curB === midPoint) {
      midAskedGamesRef.current.add(curIdx);
      setMidPromptOpen(true);
    }
  }, [match?.status, curIdx, curA, curB, shouldAskMid, midPoint]);

  /* ========== render ========== */
  if (isLoading && !match)
    return (
      <View style={s.center}>
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
    <SafeAreaView style={s.page}>
      <View style={{ flex: 1 }}>
        {/* ===== TOP MENU ===== */}
        <View style={[s.card, s.topCard]}>
          <View style={[s.rowStart, { gap: 8, flexWrap: "wrap" }]}>
            <Ripple
              onPress={handleBack}
              style={s.iconBtn}
              rippleContainerBorderRadius={8}
            >
              <MaterialIcons name="arrow-back" size={20} color="#111827" />
            </Ripple>

            {/* CODE | BOx | Gx */}
            <View
              style={[s.chip, { paddingVertical: 6, paddingHorizontal: 10 }]}
            >
              <Text style={s.matchCodeText}>{headerText}</Text>
            </View>

            <View style={{ flexDirection: "row", gap: 6, flexShrink: 0 }}>
              {cta && (
                <Ripple
                  onPress={cta.onPress}
                  style={cta.danger ? s.btnDangerSm : s.btnSuccessSm}
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
                style={s.btnUndoSm}
                rippleContainerBorderRadius={10}
              >
                <MaterialIcons name="undo" size={16} color="#92400e" />
                <Text style={s.btnUndoSmText}>Hoàn tác</Text>
              </Ripple>

              <Ripple
                onPress={swapSides}
                style={s.btnSwapSm}
                rippleContainerBorderRadius={10}
              >
                <MaterialIcons name="swap-horiz" size={16} color="#111827" />
                <Text style={s.btnSwapSmText}>Đổi sân</Text>
              </Ripple>

              <Ripple
                onPress={() => setMenuOpen(true)}
                style={[s.iconBtn, { backgroundColor: "#f2f0f5" }]}
                rippleContainerBorderRadius={8}
              >
                <MaterialIcons name="more-vert" size={20} color="#111827" />
              </Ripple>
            </View>

            {/* Toggle người giao #1/#2 */}
            <Ripple
              onPress={toggleServerNum}
              style={[
                s.btnOutlineSm,
                {
                  width: 54,
                  height: 36,
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  backgroundColor: "#f2f0f5",
                },
              ]}
              rippleContainerBorderRadius={10}
            >
              <Text style={s.btnOutlineSmText}>{activeServerNum}</Text>
            </Ripple>
          </View>
        </View>

        {/* ===== SCOREBOARD ===== */}
        <View style={[s.card, s.scoreboardCard]}>
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

              <View style={[s.centerCol]}>
                <WinTargetTuner
                  value={ptw}
                  base={basePointsToWin}
                  onToggle={() => {
                    const next =
                      ptw > basePointsToWin
                        ? basePointsToWin
                        : basePointsToWin + 4; // 11 <-> 15
                    setPointsToWinOnServer(next);
                  }}
                />

                <Text style={s.callout}>{callout || "—"}</Text>

                <View style={[s.rowBetween, { width: "100%", marginTop: 6 }]}>
                  <Text style={[s.scoreNow, s.scoreNowText]}>{curA}</Text>
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "700",
                      opacity: 0.8,
                      textTransform: "uppercase",
                    }}
                  >
                    Game
                  </Text>
                  <Text style={[s.scoreNow, s.scoreNowText]}>{curB}</Text>
                </View>

                <View style={[s.rowBetween, { width: "100%", marginTop: 4 }]}>
                  <Text style={s.setWin}>{aWins}</Text>
                  <Text
                    style={{ opacity: 0.65, fontSize: 16, fontWeight: "700" }}
                  >
                    Match
                  </Text>
                  <Text style={s.setWin}>{bWins}</Text>
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
        <View style={[s.card, s.bottomCard]}>
          <View style={s.bottomBar}>
            <Text style={[s.clockText, s.clockAbsolute]}>
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
                  leftServing && s.bigActionBtnActive,
                  !leftEnabled && s.btnDisabled,
                ]}
              >
                <MaterialIcons
                  name="add"
                  size={22}
                  color={leftServing ? "#fff" : "#111827"}
                />
                <Text
                  style={[
                    s.bigActionText,
                    leftServing && s.bigActionTextActive,
                  ]}
                >
                  Đội bên trái
                </Text>
              </Ripple>

              {/* Nút giữa động: Đổi tay <-> Đổi giao */}
              <Ripple
                onPress={onMidPress}
                rippleContainerBorderRadius={12}
                style={s.toggleBtn}
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
                  rightServing && s.bigActionBtnActive,
                  !rightEnabled && s.btnDisabled,
                ]}
              >
                <MaterialIcons
                  name="add"
                  size={22}
                  color={rightServing ? "#fff" : "#111827"}
                />
                <Text
                  style={[
                    s.bigActionText,
                    rightServing && s.bigActionTextActive,
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

      {/* ===== Prompt đổi sân giữa game ===== */}
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
          <View style={s.promptCard}>
            <Text style={s.promptTitle}>Đổi sân?</Text>
            <Text style={s.promptText}>
              Một đội vừa chạm {midPoint ?? "—"} điểm (giữa game). Bạn có muốn
              đổi sân ngay bây giờ không?
            </Text>
            <View style={s.promptRow}>
              <Ripple
                onPress={() => setMidPromptOpen(false)}
                rippleContainerBorderRadius={10}
                style={[s.btnOutline, { flex: 1 }]}
              >
                <Text style={s.btnOutlineText}>Để sau</Text>
              </Ripple>
              <Ripple
                onPress={() => {
                  setMidPromptOpen(false);
                  swapSides();
                }}
                rippleContainerBorderRadius={10}
                style={[s.btnPrimary, { flex: 1 }]}
              >
                <Text style={s.btnPrimaryText}>Đổi sân</Text>
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
        <SafeAreaView style={s.fullModalWrap}>
          <View style={[s.rowBetween, { padding: 12 }]}>
            <Text style={s.h6}></Text>
            <Ripple
              onPress={() => setMenuOpen(false)}
              style={s.iconBtn}
              rippleContainerBorderRadius={8}
            >
              <MaterialIcons name="close" size={20} color="#111827" />
            </Ripple>
          </View>

          <View style={s.fullModalBody}>{/* Tuỳ chọn thêm */}</View>
        </SafeAreaView>
      </Modal>
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
  fullModalBody: { flex: 1, alignItems: "center", justifyContent: "center" },
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
});
