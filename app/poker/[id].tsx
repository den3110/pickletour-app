// Poker table — bàn oval kiểu casino, ghế xếp quanh bàn (mình luôn ở dưới
// cùng), bài chia/lật TỪNG LÁ có animation, winner chỉ reveal sau khi board
// chạy hết (all-in runout có kịch tính).
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
import NetInfo from "@react-native-community/netinfo";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Easing,
  FlatList,
  Image,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSelector } from "react-redux";

import {
  useGetPokerRoomQuery,
  useSitPokerRoomMutation,
  useLeavePokerRoomMutation,
  useStartPokerHandMutation,
  usePokerActionMutation,
  useChatPokerRoomMutation,
  useEmojiPokerRoomMutation,
  useRevealPokerCardsMutation,
  useInvitePokerRoomMutation,
} from "@/slices/pokerApiSlice";
import { useLazySearchUserQuery } from "@/slices/usersApiSlice";
import { useSocket } from "@/context/SocketContext";
import { playFx } from "./pokerFx";

/* ═══════════════ Cards ═══════════════ */

const SUIT_SYMBOL: Record<string, string> = { h: "♥", d: "♦", c: "♣", s: "♠" };
const RED_SUITS = ["h", "d"];

// 1 lá bài — mount là có animation lật (scaleX 0→1) + rơi nhẹ + fade.
function PlayingCard({
  code,
  w = 34,
  delay = 0,
}: {
  code: string;
  w?: number;
  delay?: number;
}) {
  const h = Math.round(w * 1.42);
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 380,
      delay,
      easing: Easing.out(Easing.back(1.4)),
      useNativeDriver: true,
    }).start();
  }, [anim, delay]);

  const hidden = code === "??";
  const rank = code[0] === "T" ? "10" : code[0];
  const suit = code[1];
  const red = RED_SUITS.includes(suit);

  return (
    <Animated.View
      style={{
        width: w,
        height: h,
        opacity: anim,
        transform: [
          {
            translateY: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [-14, 0],
            }),
          },
          {
            scaleX: anim.interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: [0.15, 0.6, 1],
            }),
          },
        ],
      }}
    >
      {hidden ? (
        <View style={[cardStyles.back, { width: w, height: h }]}>
          <View style={cardStyles.backInner} />
        </View>
      ) : (
        <View style={[cardStyles.face, { width: w, height: h }]}>
          <Text
            style={[
              cardStyles.rank,
              { fontSize: w * 0.42, color: red ? "#D92637" : "#111827" },
            ]}
          >
            {rank}
          </Text>
          <Text
            style={[
              cardStyles.suit,
              { fontSize: w * 0.5, color: red ? "#D92637" : "#111827" },
            ]}
          >
            {SUIT_SYMBOL[suit]}
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

function CardSlot({ w = 40 }: { w?: number }) {
  const h = Math.round(w * 1.42);
  return <View style={[cardStyles.slot, { width: w, height: h }]} />;
}

const cardStyles = StyleSheet.create({
  face: {
    backgroundColor: "#FFFFFF",
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#CBD5E1",
  },
  rank: { fontWeight: "900", lineHeight: undefined },
  suit: { marginTop: -2 },
  back: {
    borderRadius: 6,
    backgroundColor: "#1D4ED8",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#93C5FD",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 5,
  },
  backInner: {
    width: "70%",
    height: "76%",
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.55)",
  },
  slot: {
    borderRadius: 6,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(0,0,0,0.12)",
  },
});

/* ═══════════════ Floating emoji + Dealer ═══════════════ */

function FloatingEmoji({ emoji }: { emoji: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 1800,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [anim]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: -6,
        alignSelf: "center",
        zIndex: 100,
        transform: [
          {
            translateY: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, -64],
            }),
          },
          {
            scale: anim.interpolate({
              inputRange: [0, 0.3, 1],
              outputRange: [0.5, 1.4, 1.05],
            }),
          },
        ],
        opacity: anim.interpolate({
          inputRange: [0, 0.7, 1],
          outputRange: [1, 1, 0],
        }),
      }}
    >
      <Text style={{ fontSize: 38 }}>{emoji}</Text>
    </Animated.View>
  );
}

function SpeechBubble({ text }: { text: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.spring(anim, {
        toValue: 1,
        useNativeDriver: true,
        speed: 20,
        bounciness: 8,
      }),
      Animated.delay(3400),
      Animated.timing(anim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();
  }, [anim, text]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.speechBubble,
        {
          opacity: anim,
          transform: [
            {
              translateY: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [6, 0],
              }),
            },
            { scale: anim },
          ],
        },
      ]}
    >
      <Text numberOfLines={3} style={styles.speechText}>
        {text}
      </Text>
      <View style={styles.speechTail} />
    </Animated.View>
  );
}

function DealerFigure() {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 1600,
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: 1600,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [anim]);
  return (
    <View style={styles.dealerWrap} pointerEvents="none">
      <Animated.View
        style={{
          transform: [
            {
              translateY: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, -3],
              }),
            },
          ],
        }}
      >
        <View style={styles.dealerCircle}>
          <Text style={{ fontSize: 26 }}>🤵</Text>
        </View>
      </Animated.View>
      <View style={styles.dealerTag}>
        <MaterialCommunityIcons name="cards" size={11} color="#FCD34D" />
        <Text style={styles.dealerTagText}>DEALER</Text>
      </View>
    </View>
  );
}

/* ═══════════════ Avatar + Seat ═══════════════ */

function Avatar({
  uri,
  size = 48,
  fallback,
  ringColor,
}: {
  uri?: string;
  size?: number;
  fallback?: string;
  ringColor?: string;
}) {
  const ring = ringColor || "rgba(255,255,255,0.25)";
  return (
    <View
      style={{
        width: size + 6,
        height: size + 6,
        borderRadius: (size + 6) / 2,
        borderWidth: 2.5,
        borderColor: ring,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#0B1220",
      }}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
        />
      ) : (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: "#334155",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{ color: "#fff", fontSize: size * 0.4, fontWeight: "800" }}
          >
            {(fallback || "?")[0]?.toUpperCase()}
          </Text>
        </View>
      )}
    </View>
  );
}

const ACTION_COLOR: Record<string, string> = {
  fold: "#DC2626",
  check: "#64748B",
  call: "#2563EB",
  raise: "#D97706",
  allin: "#B91C1C",
  post_sb: "#475569",
  post_bb: "#475569",
};
const ACTION_LABEL: Record<string, string> = {
  fold: "FOLD",
  check: "CHECK",
  call: "CALL",
  raise: "RAISE",
  allin: "ALL IN",
  post_sb: "SB",
  post_bb: "BB",
};

const SEAT_W = 92;
const SEAT_H = 118;

function Seat({
  seat,
  isDealer,
  isActive,
  isMe,
  isWinner,
  timerPct,
  floatEmoji,
  bubble,
  onSit,
}: {
  seat: any;
  isDealer: boolean;
  isActive: boolean;
  isMe: boolean;
  isWinner?: boolean;
  timerPct?: number;
  floatEmoji?: string;
  bubble?: string;
  onSit?: () => void;
}) {
  if (!seat.user) {
    return (
      <Pressable onPress={onSit} style={styles.emptySeat} disabled={!onSit}>
        <Ionicons
          name="add-circle-outline"
          size={26}
          color={onSit ? "#94A3B8" : "rgba(148,163,184,0.35)"}
        />
        <Text
          style={{
            color: onSit ? "#94A3B8" : "rgba(148,163,184,0.35)",
            fontSize: 10,
            marginTop: 2,
          }}
        >
          Ngồi
        </Text>
      </Pressable>
    );
  }

  const name = seat.user?.nickname || seat.user?.name || "User";
  const ringColor = isWinner
    ? "#10B981"
    : isActive
      ? timerPct != null && timerPct <= 25
        ? "#EF4444"
        : "#FCD34D"
      : isMe
        ? "#3B82F6"
        : undefined;

  return (
    <View style={[styles.seatBox, seat.hasFolded && { opacity: 0.45 }]}>
      {floatEmoji && <FloatingEmoji emoji={floatEmoji} />}
      {bubble ? <SpeechBubble text={bubble} /> : null}
      {isWinner && (
        <Text style={styles.crown} pointerEvents="none">
          👑
        </Text>
      )}

      {/* Cards trên đầu avatar */}
      <View style={styles.seatCards}>
        {seat.cards?.length ? (
          seat.cards.map((c: string, i: number) => (
            <View
              key={`${c}-${i}`}
              style={{
                marginLeft: i === 0 ? 0 : -8,
                transform: [{ rotate: i === 0 ? "-6deg" : "6deg" }],
                zIndex: i,
              }}
            >
              <PlayingCard code={c} w={26} delay={i * 120} />
            </View>
          ))
        ) : null}
      </View>

      <View>
        <Avatar
          uri={seat.user?.avatar}
          fallback={name}
          size={44}
          ringColor={ringColor}
        />
        {isDealer && (
          <View style={styles.dealerButton}>
            <Text style={{ fontSize: 9, fontWeight: "900", color: "#111827" }}>
              D
            </Text>
          </View>
        )}
        {/* Timer arc dạng bar mảnh dưới avatar */}
        {isActive && timerPct != null && (
          <View style={styles.timerTrack}>
            <View
              style={[
                styles.timerFill,
                {
                  width: `${Math.max(0, Math.min(100, timerPct))}%`,
                  backgroundColor:
                    timerPct > 50
                      ? "#10B981"
                      : timerPct > 25
                        ? "#F59E0B"
                        : "#EF4444",
                },
              ]}
            />
          </View>
        )}
      </View>

      {/* Name + chips plate */}
      <View style={[styles.plate, isWinner && styles.plateWinner]}>
        <Text style={styles.plateName} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.plateChips}>{formatChips(seat.chips)}</Text>
      </View>

      {/* Action pill */}
      {seat.lastAction && (
        <View
          style={[
            styles.actionPill,
            { backgroundColor: ACTION_COLOR[seat.lastAction] || "#475569" },
          ]}
        >
          <Text style={styles.actionPillText}>
            {ACTION_LABEL[seat.lastAction] || seat.lastAction}
          </Text>
        </View>
      )}

      {/* Bet chip */}
      {seat.betThisStreet > 0 && (
        <View style={styles.betBubble}>
          <Text style={{ fontSize: 9 }}>🪙</Text>
          <Text style={styles.betBubbleText}>
            {formatChips(seat.betThisStreet)}
          </Text>
        </View>
      )}
    </View>
  );
}

function formatChips(n: number) {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 10_000) return `${(v / 1000).toFixed(1)}K`;
  return String(v);
}

/* ═══════════════ Seat positions quanh bàn oval ═══════════════ */

// Sinh vị trí (fraction 0..1) cho n ghế quanh ellipse — hero ở đáy (góc 90°),
// đi theo chiều kim đồng hồ.
function seatFractions(n: number) {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const ang = Math.PI / 2 + (i * 2 * Math.PI) / n;
    out.push({
      x: 0.5 + 0.44 * Math.cos(ang),
      y: 0.5 + 0.46 * Math.sin(ang),
    });
  }
  return out;
}

/* ═══════════════ Main screen ═══════════════ */

export default function PokerTableScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useSelector((s: any) => s.auth?.userInfo);
  const socket = useSocket();
  const { data, isLoading, refetch } = useGetPokerRoomQuery(String(id), {
    skip: !id,
  });
  const [sit] = useSitPokerRoomMutation();
  const [leave] = useLeavePokerRoomMutation();
  const [startHand] = useStartPokerHandMutation();
  const [act] = usePokerActionMutation();
  const [chatMut] = useChatPokerRoomMutation();
  const [emojiMut] = useEmojiPokerRoomMutation();
  const [revealMut] = useRevealPokerCardsMutation();
  const [inviteMut] = useInvitePokerRoomMutation();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [raiseValue, setRaiseValue] = useState<number | null>(null);
  // Speech bubble chat: gần đây msg nào, hiện 4s over avatar sender
  const [bubbles, setBubbles] = useState<Record<string, { text: string; at: number }>>({});
  const seenMsgAtRef = useRef<number>(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatText, setChatText] = useState("");
  const [nowTs, setNowTs] = useState(Date.now());
  const [emojiPicker, setEmojiPicker] = useState(false);
  const [floatingEmojis, setFloatingEmojis] = useState<any[]>([]);
  const [tableSize, setTableSize] = useState({ w: 0, h: 0 });
  // Connection status: "online" | "offline" | "reconnecting"
  const [connStatus, setConnStatus] = useState<
    "online" | "offline" | "reconnecting"
  >("online");

  // ── Staged board reveal: board hiện TỪNG LÁ, không hiện cả cụm ──
  const [shownBoardCount, setShownBoardCount] = useState(0);
  const handNumberRef = useRef<number>(-1);

  const prevActionRef = useRef<any>(null);
  const prevStageRef = useRef<string>("");
  const prevWinnersRef = useRef<any[]>([]);

  useEffect(() => {
    if (!socket || !id) return;
    const rid = String(id);
    const sub = () => {
      socket.emit("poker:room:subscribe", { roomId: rid });
      // Bất cứ khi nào reconnect socket → fetch lại room state để nhận
      // bài / turn / pot mới nhất, tránh UI đứng ở snapshot cũ.
      refetch();
    };
    sub();
    socket.on("connect", sub);
    const bump = () => refetch();
    socket.on("poker:room:updated", bump);
    socket.on("poker:room:chat", bump);
    const onEmoji = (payload: any) => {
      const eid = `${payload.seatIndex}-${Date.now()}-${Math.random()}`;
      setFloatingEmojis((prev) => [
        ...prev,
        { id: eid, seatIndex: payload.seatIndex, emoji: payload.emoji },
      ]);
      setTimeout(() => {
        setFloatingEmojis((prev) => prev.filter((e) => e.id !== eid));
      }, 2000);
    };
    socket.on("poker:room:emoji", onEmoji);
    socket.on("poker:room:reveal", bump);
    return () => {
      try {
        socket.emit("poker:room:unsubscribe", { roomId: rid });
      } catch {}
      socket.off("connect", sub);
      socket.off("poker:room:updated", bump);
      socket.off("poker:room:chat", bump);
      socket.off("poker:room:emoji", onEmoji);
      socket.off("poker:room:reveal", bump);
    };
  }, [socket, id, refetch]);

  // Reconnect nếu app bị ẩn / mất mạng: nghe AppState + NetInfo + socket
  // disconnect. Khi active lại hoặc mạng phục hồi → force refetch + connect
  // socket + resubscribe room. Cập nhật badge trạng thái để user thấy.
  useEffect(() => {
    if (!id) return;
    const rid = String(id);
    const reconnect = () => {
      setConnStatus("reconnecting");
      try {
        if (socket && !socket.connected) socket.connect?.();
        socket?.emit("poker:room:subscribe", { roomId: rid });
      } catch {}
      refetch()
        .unwrap?.()
        .then(() => setConnStatus("online"))
        .catch(() => {
          // Retry mềm sau 2s nếu vẫn lỗi
          setTimeout(reconnect, 2000);
        });
    };

    const appSub = AppState.addEventListener("change", (state) => {
      if (state === "active") reconnect();
    });
    const netSub = NetInfo.addEventListener((s) => {
      if (s.isConnected === false) setConnStatus("offline");
      else if (s.isConnected && s.isInternetReachable !== false) reconnect();
    });
    const onDisc = () => setConnStatus("offline");
    const onConn = () => reconnect();
    socket?.on?.("disconnect", onDisc);
    socket?.on?.("connect", onConn);

    return () => {
      appSub.remove();
      netSub();
      socket?.off?.("disconnect", onDisc);
      socket?.off?.("connect", onConn);
    };
  }, [socket, id, refetch]);

  useEffect(() => {
    const t = setInterval(() => setNowTs(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  // Speech bubble: khi có msg mới (theo timestamp `at`), gán bubble cho
  // sender trong 4s. Chat mới trong lúc chat modal đang mở cũng vẫn hiện
  // bubble (feedback cho người chơi khác).
  useEffect(() => {
    const msgs = (data as any)?.room?.messages || [];
    if (!msgs.length) return;
    let latestSeen = seenMsgAtRef.current;
    let dirty = false;
    const next = { ...bubbles };
    for (const m of msgs) {
      const t = new Date(m.at || 0).getTime();
      if (t > seenMsgAtRef.current && m.user) {
        next[String(m.user)] = { text: String(m.text || ""), at: t };
        dirty = true;
        if (t > latestSeen) latestSeen = t;
      }
    }
    seenMsgAtRef.current = latestSeen;
    if (dirty) setBubbles(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(data as any)?.room?.messages?.length]);

  // Reset raise slider mỗi khi hết lượt của mình
  useEffect(() => {
    const room2: any = (data as any)?.room;
    const my = room2?.seats?.find((s: any) => s.isYou);
    if (!my || my.seatIndex !== room2?.activeIndex) {
      setRaiseValue(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(data as any)?.room?.activeIndex, (data as any)?.room?.currentBet]);

  // Tick cleanup bubble hết hạn
  useEffect(() => {
    setBubbles((prev) => {
      const now = Date.now();
      const next: typeof prev = {};
      let changed = false;
      for (const k of Object.keys(prev)) {
        if (now - prev[k].at < 4000) next[k] = prev[k];
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [nowTs]);

  // Polling fallback: khi offline hoặc socket không dispatch event kịp
  // thời, refetch mỗi 5s để room state không đứng im.
  useEffect(() => {
    if (connStatus === "online") return;
    const t = setInterval(() => {
      refetch()
        .unwrap?.()
        .then(() => setConnStatus("online"))
        .catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, [connStatus, refetch]);

  const room: any = (data as any)?.room;

  // Ván mới → reset board reveal
  useEffect(() => {
    if (!room) return;
    if (room.handNumber !== handNumberRef.current) {
      handNumberRef.current = room.handNumber;
      setShownBoardCount(0);
    }
  }, [room?.handNumber]);

  // Reveal từng lá: mỗi 650ms lật thêm 1 lá cho tới khi đủ board server.
  useEffect(() => {
    if (!room) return;
    const target = room.board?.length || 0;
    if (target < shownBoardCount) {
      setShownBoardCount(target);
      return;
    }
    if (target > shownBoardCount) {
      const t = setTimeout(
        () => {
          playFx("deal");
          setShownBoardCount((c) => c + 1);
        },
        shownBoardCount === 0 ? 250 : 650,
      );
      return () => clearTimeout(t);
    }
  }, [room?.board?.length, shownBoardCount]);

  const boardFullyShown = shownBoardCount >= (room?.board?.length || 0);

  // FX theo state change (winner chỉ play khi board đã lật hết)
  useEffect(() => {
    if (!room) return;
    const winners = room.winners || [];
    const prevWinners = prevWinnersRef.current || [];
    if (
      boardFullyShown &&
      winners.length > 0 &&
      JSON.stringify(winners.map((w: any) => w.seatIndex)) !==
        JSON.stringify(prevWinners.map((w: any) => w.seatIndex))
    ) {
      const iAmWinner = winners.some((w: any) =>
        room.seats.some((s: any) => s.isYou && s.seatIndex === w.seatIndex),
      );
      playFx(iAmWinner ? "win" : "lose");
      prevWinnersRef.current = winners;
    }
    if (winners.length === 0) prevWinnersRef.current = [];

    const lastAction = (room.actions || []).slice(-1)[0];
    if (
      lastAction &&
      JSON.stringify(lastAction) !== JSON.stringify(prevActionRef.current)
    ) {
      const fx: any = {
        fold: "fold",
        check: "check",
        call: "call",
        raise: "raise",
        allin: "allin",
      };
      if (fx[lastAction.action]) playFx(fx[lastAction.action]);
      prevActionRef.current = lastAction;
    }

    if (room.stage !== prevStageRef.current) {
      prevStageRef.current = room.stage;
    }
  }, [room?.actions?.length, room?.winners?.length, room?.stage, boardFullyShown]);

  if (isLoading || !room) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  if (room.status === "closed") {
    return (
      <View style={styles.loading}>
        <Stack.Screen
          options={{
            title: room.name,
            headerStyle: { backgroundColor: "#0B1220" },
            headerTintColor: "#fff",
          }}
        />
        <Text style={{ fontSize: 40, marginBottom: 12 }}>🌙</Text>
        <Text style={{ color: "#fff", fontSize: 16, fontWeight: "800" }}>
          Bàn đã đóng
        </Text>
        <Text style={{ color: "#94A3B8", marginTop: 6, textAlign: "center" }}>
          Bàn không hoạt động quá 5 phút nên đã tự huỷ.
        </Text>
      </View>
    );
  }

  const mySeat = (room.seats || []).find((s: any) => s.isYou);
  const isMyTurn = mySeat && mySeat.seatIndex === room.activeIndex;
  const toCall = Math.max(0, room.currentBet - (mySeat?.betThisStreet || 0));
  const canReveal =
    mySeat &&
    mySeat.cards?.length &&
    room.stage === "waiting" &&
    !(room.reveals || []).some(
      (r: any) => r.seatIndex === mySeat.seatIndex,
    );

  const turnDur = (room.turnDurationSec || 30) * 1000;
  const turnDeadline = room.turnDeadlineAt
    ? new Date(room.turnDeadlineAt).getTime()
    : 0;
  const turnRemaining = Math.max(0, turnDeadline - nowTs);
  const timerPct = turnDeadline ? (turnRemaining / turnDur) * 100 : 0;
  const timerSecLeft = Math.ceil(turnRemaining / 1000);

  const nSeats = room.seats?.length || 6;
  const heroIndex = mySeat?.seatIndex ?? 0;
  const fractions = seatFractions(nSeats);

  const doSit = async (seatIndex: number) => {
    if (!me) {
      Alert.alert("Cần đăng nhập");
      return;
    }
    try {
      await sit({ roomId: String(id), seatIndex }).unwrap();
      playFx("chip");
    } catch (err: any) {
      Alert.alert("Lỗi", err?.data?.message || "Không ngồi được");
    }
  };
  const doLeave = async () => {
    try {
      await leave(String(id)).unwrap();
    } catch (err: any) {
      Alert.alert("Lỗi", err?.data?.message || "Không rời được");
    }
  };
  const doStart = async () => {
    try {
      await startHand(String(id)).unwrap();
    } catch (err: any) {
      Alert.alert("Lỗi", err?.data?.message || "Không start được");
    }
  };
  const doAct = async (action: string, amount?: number) => {
    try {
      await act({ roomId: String(id), action, amount }).unwrap();
    } catch (err: any) {
      Alert.alert("Lỗi", err?.data?.message || "Không thực hiện được");
    }
  };

  const showWinners =
    boardFullyShown && (room.winners || []).length > 0;

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <Stack.Screen
        options={{
          title: room.name,
          headerStyle: { backgroundColor: "#0B1220" },
          headerTintColor: "#fff",
        }}
      />
      {connStatus !== "online" && (
        <View
          style={[
            styles.connBanner,
            connStatus === "offline" && { backgroundColor: "#DC2626" },
          ]}
        >
          <ActivityIndicator size="small" color="#fff" />
          <Text style={styles.connBannerText}>
            {connStatus === "offline"
              ? "Mất kết nối · đang thử lại…"
              : "Đang kết nối lại phiên chơi…"}
          </Text>
        </View>
      )}

      <View style={styles.body}>
        {/* ── Bàn oval ── */}
        <View
          style={styles.tableRail}
          onLayout={(e) =>
            setTableSize({
              w: e.nativeEvent.layout.width,
              h: e.nativeEvent.layout.height,
            })
          }
        >
          <View style={styles.tableFelt}>
            <View style={styles.feltInnerRing} />

            {/* Center: dealer + pot + board */}
            <View style={styles.tableCenter} pointerEvents="none">
              {room.stage !== "waiting" && <DealerFigure />}
              <View style={styles.potPill}>
                <Text style={{ fontSize: 13 }}>💰</Text>
                <Text style={styles.potText}>{formatChips(room.pot)}</Text>
              </View>
              <View style={styles.board}>
                {[0, 1, 2, 3, 4].map((i) => {
                  const c = room.board?.[i];
                  if (c && i < shownBoardCount) {
                    return <PlayingCard key={`${c}-${i}`} code={c} w={40} />;
                  }
                  return <CardSlot key={`slot-${i}`} w={40} />;
                })}
              </View>
              <Text style={styles.stageText}>
                {room.stage === "waiting"
                  ? "Chờ ván tiếp theo"
                  : `Ván ${room.handNumber} · ${room.stage.toUpperCase()}`}
              </Text>
              {room.activeIndex >= 0 && turnDeadline > 0 && (
                <View
                  style={[
                    styles.timerBadge,
                    timerSecLeft <= 5 && { backgroundColor: "#B91C1C" },
                  ]}
                >
                  <Ionicons name="timer-outline" size={11} color="#fff" />
                  <Text style={styles.timerBadgeText}>{timerSecLeft}s</Text>
                </View>
              )}
            </View>

            {/* Seats absolute quanh bàn */}
            {tableSize.w > 0 &&
              (room.seats || []).map((seat: any) => {
                const posIdx =
                  (seat.seatIndex - heroIndex + nSeats) % nSeats;
                const f = fractions[posIdx] || { x: 0.5, y: 0.5 };
                const left = Math.min(
                  Math.max(f.x * tableSize.w - SEAT_W / 2, -6),
                  tableSize.w - SEAT_W + 6,
                );
                const top = Math.min(
                  Math.max(f.y * tableSize.h - SEAT_H / 2, -10),
                  tableSize.h - SEAT_H + 14,
                );
                return (
                  <View
                    key={seat.seatIndex}
                    style={{
                      position: "absolute",
                      left,
                      top,
                      width: SEAT_W,
                      alignItems: "center",
                    }}
                  >
                    <Seat
                      seat={seat}
                      isDealer={
                        seat.seatIndex === room.dealerIndex &&
                        room.stage !== "waiting"
                      }
                      isActive={seat.seatIndex === room.activeIndex}
                      isMe={!!seat.isYou}
                      isWinner={
                        showWinners &&
                        (room.winners || []).some(
                          (w: any) => w.seatIndex === seat.seatIndex,
                        )
                      }
                      timerPct={
                        seat.seatIndex === room.activeIndex
                          ? timerPct
                          : undefined
                      }
                      floatEmoji={
                        floatingEmojis.find(
                          (e) => e.seatIndex === seat.seatIndex,
                        )?.emoji
                      }
                      bubble={
                        seat.user?._id
                          ? bubbles[String(seat.user._id)]?.text
                          : undefined
                      }
                      onSit={
                        !seat.user && !mySeat
                          ? () => doSit(seat.seatIndex)
                          : undefined
                      }
                    />
                  </View>
                );
              })}

            {/* Winner overlay — nổi giữa bàn, không đè lên seat/controls */}
            {showWinners && (
              <View style={styles.winnerOverlay} pointerEvents="none">
                <View style={styles.winnerBox}>
                  <Text style={styles.winnerTitle}>
                    🏆 Kết quả ván {room.handNumber}
                  </Text>
                  {room.winners.map((w: any, i: number) => {
                    const seat = (room.seats || []).find(
                      (s: any) => s.seatIndex === w.seatIndex,
                    );
                    const wname =
                      seat?.user?.nickname ||
                      seat?.user?.name ||
                      `Ghế ${w.seatIndex + 1}`;
                    return (
                      <View key={i} style={styles.winnerLineRow}>
                        <Text style={styles.winnerLine}>
                          {wname} · {w.handDescription} · +
                          {formatChips(w.amountWon)}
                        </Text>
                        {w.revealedCards?.length > 0 && (
                          <View style={{ flexDirection: "row", gap: 3 }}>
                            {w.revealedCards.map((c: string, j: number) => (
                              <PlayingCard
                                key={j}
                                code={c}
                                w={22}
                                delay={j * 150}
                              />
                            ))}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        </View>

        {/* ── Controls ── */}
        {mySeat ? (
          <View style={styles.controls}>
            <View style={styles.controlsHead}>
              <Avatar
                uri={mySeat.user?.avatar}
                fallback={mySeat.user?.nickname || mySeat.user?.name}
                size={30}
                ringColor="#3B82F6"
              />
              <Text style={styles.controlsInfo}>
                {formatChips(mySeat.chips)} chip
              </Text>
              <Pressable onPress={doLeave} hitSlop={8}>
                <Text style={styles.leaveText}>Rời bàn</Text>
              </Pressable>
            </View>

            {room.stage === "waiting" && (
              <>
                <Pressable style={styles.startBtn} onPress={doStart}>
                  <Text style={styles.startBtnText}>▶ Bắt đầu ván</Text>
                </Pressable>
                {canReveal && (
                  <Pressable
                    style={styles.revealBtn}
                    onPress={async () => {
                      try {
                        await revealMut(String(id)).unwrap();
                      } catch (err: any) {
                        Alert.alert(
                          "Lỗi",
                          err?.data?.message || "Không khoe được",
                        );
                      }
                    }}
                  >
                    <Text style={{ color: "#F59E0B", fontWeight: "800" }}>
                      🎴 Khoe bài của tôi
                    </Text>
                  </Pressable>
                )}
              </>
            )}

            {isMyTurn && (
              <>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <ActionBtn
                    label="Fold"
                    color="#DC2626"
                    onPress={() => doAct("fold")}
                  />
                  {toCall === 0 ? (
                    <ActionBtn
                      label="Check"
                      color="#64748B"
                      onPress={() => doAct("check")}
                    />
                  ) : (
                    <ActionBtn
                      label={`Call ${formatChips(toCall)}`}
                      color="#2563EB"
                      onPress={() => doAct("call")}
                    />
                  )}
                  <ActionBtn
                    label="All-in"
                    color="#B91C1C"
                    onPress={() => doAct("allin")}
                  />
                </View>
                {(() => {
                  const minRaise = room.currentBet + room.minRaise;
                  const maxRaise = mySeat.chips + mySeat.betThisStreet;
                  if (maxRaise <= minRaise) return null; // không đủ chip
                  const cur = raiseValue ?? minRaise;
                  const clamped = Math.min(Math.max(cur, minRaise), maxRaise);
                  return (
                    <>
                      <RaiseSlider
                        min={minRaise}
                        max={maxRaise}
                        value={clamped}
                        onChange={setRaiseValue}
                        pot={room.pot}
                      />
                      <ActionBtn
                        label={`Raise ${formatChips(clamped)}`}
                        color="#D97706"
                        onPress={() => {
                          doAct("raise", clamped);
                          setRaiseValue(null);
                        }}
                      />
                    </>
                  );
                })()}
              </>
            )}
            {mySeat && !isMyTurn && room.stage !== "waiting" && (
              <Text style={styles.waitText}>
                ⏳ Đang chờ người chơi khác…
              </Text>
            )}
          </View>
        ) : (
          <View style={styles.controls}>
            <Text style={{ color: "#94A3B8", textAlign: "center" }}>
              Chọn ghế trống trên bàn để tham gia.
            </Text>
          </View>
        )}
      </View>

      {/* Emoji bar */}
      {emojiPicker && mySeat && (
        <View style={styles.emojiBar}>
          {["👍", "❤️", "😂", "😮", "😢", "😡", "🔥", "👏", "🎉"].map((e) => (
            <Pressable
              key={e}
              style={styles.emojiBtn}
              onPress={async () => {
                setEmojiPicker(false);
                try {
                  await emojiMut({ roomId: String(id), emoji: e }).unwrap();
                } catch {}
              }}
            >
              <Text style={{ fontSize: 24 }}>{e}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {mySeat && (
        <Pressable
          style={styles.emojiFab}
          onPress={() => setEmojiPicker((v) => !v)}
          hitSlop={10}
        >
          <Ionicons name="happy" size={22} color="#fff" />
        </Pressable>
      )}

      {/* Invite FAB — luôn hiển thị (không cần ngồi vào bàn cũng mời được) */}
      <Pressable
        style={styles.inviteFab}
        onPress={() => setInviteOpen(true)}
        hitSlop={10}
      >
        <Ionicons name="person-add" size={20} color="#fff" />
      </Pressable>

      <Pressable
        style={styles.chatFab}
        onPress={() => setChatOpen(true)}
        hitSlop={10}
      >
        <Ionicons name="chatbubbles" size={22} color="#fff" />
        {room.messages?.length > 0 && (
          <View style={styles.chatBadge}>
            <Text style={{ color: "#fff", fontSize: 10, fontWeight: "800" }}>
              {room.messages.length > 99 ? "99+" : room.messages.length}
            </Text>
          </View>
        )}
      </Pressable>

      <ChatModal
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        messages={room.messages || []}
        me={me}
        onSend={async (text) => {
          if (!text.trim()) return;
          try {
            await chatMut({ roomId: String(id), text: text.trim() }).unwrap();
            setChatText("");
          } catch (err: any) {
            Alert.alert("Lỗi", err?.data?.message || "Không gửi được");
          }
        }}
        chatText={chatText}
        setChatText={setChatText}
      />

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onSend={async (userIds) => {
          if (!userIds.length) return;
          try {
            const r: any = await inviteMut({
              roomId: String(id),
              userIds,
            }).unwrap();
            Alert.alert("Đã mời", `Đã gửi lời mời cho ${r?.invited || userIds.length} người.`);
            setInviteOpen(false);
          } catch (err: any) {
            Alert.alert("Lỗi", err?.data?.message || "Không gửi mời được");
          }
        }}
      />
    </SafeAreaView>
  );
}

/* ═══════════════ Chat modal ═══════════════ */

function RaiseSlider({
  min,
  max,
  value,
  onChange,
  pot,
}: {
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
  pot: number;
}) {
  const [w, setW] = useState(0);
  const clamp = (v: number) => Math.max(min, Math.min(max, Math.round(v)));
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          if (!w) return;
          const x = evt.nativeEvent.locationX;
          onChange(clamp(min + (x / w) * (max - min)));
        },
        onPanResponderMove: (evt) => {
          if (!w) return;
          const x = evt.nativeEvent.locationX;
          onChange(clamp(min + (x / w) * (max - min)));
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [w, min, max, onChange],
  );

  const presets: { label: string; value: number }[] = [
    { label: "MIN", value: min },
    { label: "1/2 Pot", value: clamp(Math.floor(pot / 2) + min) },
    { label: "POT", value: clamp(pot + min - min) },
    { label: "ALL IN", value: max },
  ];

  return (
    <View style={styles.raiseWrap}>
      <View style={styles.raiseHeader}>
        <Text style={styles.raiseLabel}>Raise</Text>
        <Text style={styles.raiseValue}>{formatChips(value)}</Text>
      </View>
      <View
        style={styles.sliderTrack}
        onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
        {...responder.panHandlers}
      >
        <View style={[styles.sliderFill, { width: `${pct}%` }]} />
        <View
          style={[
            styles.sliderThumb,
            { left: `${pct}%`, marginLeft: -12 },
          ]}
        />
      </View>
      <View style={styles.presetsRow}>
        {presets.map((p) => (
          <Pressable
            key={p.label}
            onPress={() => onChange(p.value)}
            style={[
              styles.presetChip,
              value === p.value && styles.presetChipActive,
            ]}
          >
            <Text
              style={[
                styles.presetChipText,
                value === p.value && { color: "#0B1220" },
              ]}
            >
              {p.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function InviteModal({
  open,
  onClose,
  onSend,
}: {
  open: boolean;
  onClose: () => void;
  onSend: (userIds: string[]) => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<any[]>([]);
  const [trigger, { data, isFetching }] = useLazySearchUserQuery();
  useEffect(() => {
    if (!open) {
      setQ("");
      setSelected([]);
    }
  }, [open]);
  useEffect(() => {
    if (!q || q.length < 1) return;
    const t = setTimeout(() => trigger(q), 300);
    return () => clearTimeout(t);
  }, [q, trigger]);
  const list = useMemo(() => {
    const raw: any = data;
    const arr = Array.isArray(raw)
      ? raw
      : raw?.items || raw?.data || raw?.users || [];
    return arr.slice(0, 30);
  }, [data]);
  const toggle = (u: any) => {
    setSelected((prev) =>
      prev.some((x) => String(x._id) === String(u._id))
        ? prev.filter((x) => String(x._id) !== String(u._id))
        : [...prev, u],
    );
  };

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.chatBackdrop}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={[styles.chatSheet, { maxHeight: 520 }]}>
            <View style={styles.chatHandle} />
            <View style={styles.chatHeaderRow}>
              <Text style={styles.chatTitle}>👥 Mời bạn vào bàn</Text>
              <Pressable onPress={onClose} hitSlop={10}>
                <Ionicons name="close" size={22} color="#94A3B8" />
              </Pressable>
            </View>
            <View style={{ paddingHorizontal: 12 }}>
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder="Tìm theo tên / nickname…"
                placeholderTextColor="#64748B"
                style={styles.chatInput}
              />
            </View>
            {selected.length > 0 && (
              <View style={styles.selectedRow}>
                {selected.map((u: any) => (
                  <Pressable
                    key={u._id}
                    onPress={() => toggle(u)}
                    style={styles.selectedChip}
                  >
                    <Text style={styles.selectedChipText}>
                      {u.nickname || u.name}
                    </Text>
                    <Ionicons name="close" size={12} color="#0B1220" />
                  </Pressable>
                ))}
              </View>
            )}
            <FlatList
              data={list}
              keyExtractor={(u: any) => String(u._id)}
              contentContainerStyle={{ padding: 12 }}
              ListEmptyComponent={
                <View style={{ padding: 20, alignItems: "center" }}>
                  {isFetching ? (
                    <ActivityIndicator color="#94A3B8" />
                  ) : (
                    <Text style={{ color: "#94A3B8" }}>
                      {q
                        ? "Không tìm thấy user nào"
                        : "Gõ tên hoặc nickname để tìm và mời"}
                    </Text>
                  )}
                </View>
              }
              renderItem={({ item }) => {
                const active = selected.some(
                  (x: any) => String(x._id) === String(item._id),
                );
                return (
                  <Pressable
                    onPress={() => toggle(item)}
                    style={[styles.userRow, active && styles.userRowActive]}
                  >
                    <Avatar
                      uri={item.avatar}
                      fallback={item.nickname || item.name}
                      size={36}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.userName}>
                        {item.nickname || item.name}
                      </Text>
                      {!!item.name && item.name !== item.nickname && (
                        <Text style={styles.userSub}>{item.name}</Text>
                      )}
                    </View>
                    <View
                      style={[
                        styles.checkBox,
                        active && { backgroundColor: "#0066FF" },
                      ]}
                    >
                      {active && (
                        <Ionicons name="checkmark" size={14} color="#fff" />
                      )}
                    </View>
                  </Pressable>
                );
              }}
            />
            <View style={{ padding: 12 }}>
              <Pressable
                onPress={() => onSend(selected.map((u: any) => String(u._id)))}
                disabled={!selected.length}
                style={[
                  styles.inviteBtn,
                  !selected.length && { opacity: 0.4 },
                ]}
              >
                <Ionicons name="send" size={16} color="#fff" />
                <Text style={styles.inviteBtnText}>
                  {selected.length
                    ? `Gửi mời ${selected.length} người`
                    : "Chọn người muốn mời"}
                </Text>
              </Pressable>
              <Text
                style={{
                  color: "#64748B",
                  fontSize: 11,
                  marginTop: 6,
                  textAlign: "center",
                }}
              >
                Giới hạn 30 lời mời / giờ để chống spam.
              </Text>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function ChatModal({
  open,
  onClose,
  messages,
  me,
  onSend,
  chatText,
  setChatText,
}: {
  open: boolean;
  onClose: () => void;
  messages: any[];
  me: any;
  onSend: (text: string) => Promise<void>;
  chatText: string;
  setChatText: (s: string) => void;
}) {
  const listRef = useRef<FlatList<any>>(null);
  useEffect(() => {
    if (open && messages.length > 0) {
      setTimeout(() => {
        try {
          listRef.current?.scrollToEnd({ animated: true });
        } catch {}
      }, 100);
    }
  }, [open, messages.length]);

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.chatBackdrop}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.chatSheet}>
            <View style={styles.chatHandle} />
            <View style={styles.chatHeaderRow}>
              <Text style={styles.chatTitle}>💬 Chat trong bàn</Text>
              <Pressable onPress={onClose} hitSlop={10}>
                <Ionicons name="close" size={22} color="#94A3B8" />
              </Pressable>
            </View>
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(m: any, i: number) =>
                m._id ? String(m._id) : `m-${i}`
              }
              contentContainerStyle={{ padding: 12, paddingBottom: 4 }}
              ListEmptyComponent={
                <View style={{ padding: 20, alignItems: "center" }}>
                  <Text style={{ color: "#94A3B8" }}>
                    Chưa có tin nhắn. Nói gì đó với đối thủ đi!
                  </Text>
                </View>
              }
              renderItem={({ item }) => {
                const isMe = String(item.user) === String(me?._id);
                return (
                  <View
                    style={[
                      styles.msgRow,
                      isMe && { flexDirection: "row-reverse" },
                    ]}
                  >
                    <Avatar uri={item.avatar} fallback={item.name} size={26} />
                    <View
                      style={[
                        styles.msgBubble,
                        isMe && {
                          backgroundColor: "#0066FF",
                          marginLeft: 0,
                          marginRight: 8,
                        },
                      ]}
                    >
                      {!isMe && <Text style={styles.msgName}>{item.name}</Text>}
                      <Text style={[styles.msgText, isMe && { color: "#fff" }]}>
                        {item.text}
                      </Text>
                    </View>
                  </View>
                );
              }}
            />
            <View style={styles.chatInputRow}>
              <TextInput
                value={chatText}
                onChangeText={setChatText}
                placeholder="Nhập tin nhắn…"
                placeholderTextColor="#94A3B8"
                style={styles.chatInput}
                maxLength={300}
                onSubmitEditing={() => onSend(chatText)}
              />
              <Pressable
                onPress={() => onSend(chatText)}
                disabled={!chatText.trim()}
                style={[
                  styles.chatSendBtn,
                  !chatText.trim() && { opacity: 0.4 },
                ]}
              >
                <Ionicons name="send" size={18} color="#fff" />
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function ActionBtn({
  label,
  color,
  onPress,
}: {
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionBtn,
        { backgroundColor: color, opacity: pressed ? 0.8 : 1 },
      ]}
    >
      <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>
        {label}
      </Text>
    </Pressable>
  );
}

/* ═══════════════ Styles ═══════════════ */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0B1220" },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0B1220",
  },

  body: {
    flex: 1,
    paddingHorizontal: 10,
    paddingBottom: 6,
  },
  connBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#D97706",
    paddingVertical: 6,
  },
  connBannerText: { color: "#fff", fontSize: 12, fontWeight: "800" },

  /* Table */
  tableRail: {
    flex: 1,
    minHeight: 340,
    borderRadius: 190,
    backgroundColor: "#5B2F16",
    padding: 10,
    marginHorizontal: 2,
    marginTop: 30,
    marginBottom: 26,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 18,
    elevation: 12,
    borderWidth: 2,
    borderColor: "#7C4A24",
  },
  tableFelt: {
    flex: 1,
    borderRadius: 180,
    backgroundColor: "#0E6B3F",
    overflow: "visible",
    borderWidth: 3,
    borderColor: "#0A5230",
  },
  feltInnerRing: {
    position: "absolute",
    left: 26,
    right: 26,
    top: 26,
    bottom: 26,
    borderRadius: 160,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.08)",
  },
  tableCenter: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    zIndex: 1,
  },
  potPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(0,0,0,0.4)",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(252,211,77,0.35)",
  },
  potText: { color: "#FCD34D", fontSize: 17, fontWeight: "900" },
  board: { flexDirection: "row", gap: 6 },
  stageText: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 10,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  timerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#FCD34D",
  },
  timerBadgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },

  /* Dealer */
  dealerWrap: { alignItems: "center", marginBottom: 2 },
  dealerCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#7C2D12",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FCD34D",
  },
  dealerTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    marginTop: 3,
  },
  dealerTagText: {
    color: "#FCD34D",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.5,
  },

  /* Seat */
  seatBox: {
    width: SEAT_W,
    alignItems: "center",
    zIndex: 5,
  },
  emptySeat: {
    width: 64,
    height: 84,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "rgba(148,163,184,0.4)",
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.12)",
  },
  seatCards: {
    flexDirection: "row",
    height: 40,
    alignItems: "flex-end",
    marginBottom: -6,
    zIndex: 6,
  },
  crown: {
    position: "absolute",
    top: -24,
    fontSize: 20,
    zIndex: 20,
  },
  dealerButton: {
    position: "absolute",
    top: -2,
    right: -6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#FCD34D",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#B45309",
    zIndex: 10,
  },
  timerTrack: {
    position: "absolute",
    bottom: -5,
    left: 2,
    right: 2,
    height: 3.5,
    borderRadius: 2,
    backgroundColor: "rgba(0,0,0,0.4)",
    overflow: "hidden",
  },
  timerFill: { height: "100%", borderRadius: 2 },
  plate: {
    marginTop: 6,
    backgroundColor: "rgba(11, 18, 32, 0.92)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignItems: "center",
    minWidth: 76,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  plateWinner: { borderColor: "#10B981", backgroundColor: "rgba(6,78,59,0.92)" },
  plateName: {
    color: "#fff",
    fontSize: 10.5,
    fontWeight: "700",
    maxWidth: 84,
  },
  plateChips: { color: "#FCD34D", fontSize: 11, fontWeight: "900" },
  actionPill: {
    marginTop: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  actionPillText: {
    color: "#fff",
    fontSize: 8.5,
    fontWeight: "900",
    letterSpacing: 1,
  },
  betBubble: {
    position: "absolute",
    bottom: -18,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(252,211,77,0.4)",
  },
  betBubbleText: { color: "#FCD34D", fontSize: 10, fontWeight: "800" },

  /* Winners — overlay nổi giữa bàn */
  winnerOverlay: {
    position: "absolute",
    left: 18,
    right: 18,
    top: "58%",
    zIndex: 60,
    alignItems: "center",
  },
  winnerBox: {
    backgroundColor: "rgba(3, 28, 18, 0.94)",
    borderWidth: 1.5,
    borderColor: "#10B981",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 10,
  },
  winnerTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#34D399",
    textAlign: "center",
  },
  winnerLineRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  winnerLine: { color: "#A7F3D0", fontSize: 12, fontWeight: "600" },

  /* Controls */
  controls: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 14,
    padding: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  controlsHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  controlsInfo: { color: "#FCD34D", fontSize: 14, fontWeight: "800", flex: 1 },
  leaveText: { color: "#EF4444", fontSize: 12, fontWeight: "700" },
  startBtn: {
    backgroundColor: "#10B981",
    padding: 11,
    borderRadius: 12,
    alignItems: "center",
  },
  startBtnText: { color: "#fff", fontWeight: "900", fontSize: 15 },
  revealBtn: {
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#F59E0B",
    backgroundColor: "rgba(245,158,11,0.1)",
  },
  actionBtn: {
    flex: 1,
    padding: 11,
    borderRadius: 12,
    alignItems: "center",
  },
  raiseInput: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#fff",
    fontSize: 14,
  },
  quickRow: { flexDirection: "row", gap: 6, marginTop: 6, flexWrap: "wrap" },
  quickBet: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "#D97706",
    borderRadius: 8,
  },
  quickBetText: { color: "#F59E0B", fontSize: 11, fontWeight: "800" },
  waitText: {
    color: "#94A3B8",
    fontStyle: "italic",
    textAlign: "center",
    padding: 6,
  },

  /* FAB + emoji */
  chatFab: {
    position: "absolute",
    right: 16,
    bottom: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#0066FF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  chatBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: "#0B1220",
  },
  emojiFab: {
    position: "absolute",
    right: 16,
    bottom: 84,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F59E0B",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  emojiBar: {
    position: "absolute",
    right: 70,
    bottom: 84,
    flexDirection: "row",
    backgroundColor: "rgba(15,23,42,0.97)",
    borderRadius: 12,
    padding: 8,
    gap: 2,
    flexWrap: "wrap",
    maxWidth: 250,
    borderWidth: 1,
    borderColor: "#334155",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  emojiBtn: { padding: 5, borderRadius: 8 },

  /* Chat modal */
  chatBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  chatSheet: {
    backgroundColor: "#0F172A",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: 480,
    minHeight: 320,
  },
  chatHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#334155",
    marginTop: 8,
    marginBottom: 6,
  },
  chatHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingBottom: 4,
  },
  chatTitle: { color: "#fff", fontSize: 15, fontWeight: "800" },
  msgRow: {
    flexDirection: "row",
    marginBottom: 8,
    alignItems: "flex-end",
    gap: 6,
  },
  msgBubble: {
    backgroundColor: "#1E293B",
    padding: 8,
    borderRadius: 12,
    marginLeft: 8,
    maxWidth: "75%",
  },
  msgName: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 2,
  },
  msgText: { color: "#E2E8F0", fontSize: 13, lineHeight: 18 },
  chatInputRow: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#1E293B",
    alignItems: "center",
  },
  chatInput: {
    flex: 1,
    backgroundColor: "#1E293B",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: "#fff",
    fontSize: 14,
  },
  chatSendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#0066FF",
    alignItems: "center",
    justifyContent: "center",
  },

  /* Speech bubble */
  speechBubble: {
    position: "absolute",
    top: -22,
    alignSelf: "center",
    backgroundColor: "#fff",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    maxWidth: 160,
    minWidth: 44,
    zIndex: 80,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 6,
  },
  speechText: {
    color: "#0B1220",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  speechTail: {
    position: "absolute",
    bottom: -5,
    alignSelf: "center",
    width: 10,
    height: 10,
    backgroundColor: "#fff",
    transform: [{ rotate: "45deg" }],
  },

  /* Raise slider */
  raiseWrap: { paddingVertical: 4 },
  raiseHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  raiseLabel: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  raiseValue: { color: "#FCD34D", fontSize: 15, fontWeight: "900" },
  sliderTrack: {
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    justifyContent: "center",
    paddingHorizontal: 0,
    marginBottom: 6,
  },
  sliderFill: {
    position: "absolute",
    left: 0,
    top: 4,
    bottom: 4,
    borderRadius: 12,
    backgroundColor: "#D97706",
  },
  sliderThumb: {
    position: "absolute",
    top: 2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#FCD34D",
    borderWidth: 2,
    borderColor: "#B45309",
  },
  presetsRow: { flexDirection: "row", gap: 6, marginBottom: 6 },
  presetChip: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D97706",
    alignItems: "center",
  },
  presetChipActive: { backgroundColor: "#FCD34D", borderColor: "#FCD34D" },
  presetChipText: { color: "#F59E0B", fontSize: 11, fontWeight: "800" },

  /* Invite */
  inviteFab: {
    position: "absolute",
    right: 16,
    bottom: 148,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#8B5CF6",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  selectedRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: 12,
    paddingBottom: 6,
  },
  selectedChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FCD34D",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  selectedChipText: { color: "#0B1220", fontWeight: "800", fontSize: 12 },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
    marginBottom: 4,
  },
  userRowActive: { backgroundColor: "rgba(0,102,255,0.12)" },
  userName: { color: "#fff", fontSize: 14, fontWeight: "700" },
  userSub: { color: "#94A3B8", fontSize: 11, marginTop: 2 },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
  },
  inviteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#8B5CF6",
    padding: 12,
    borderRadius: 12,
  },
  inviteBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
});
