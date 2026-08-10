// Poker table — 6 seats, cards, betting controls.
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
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
} from "@/slices/pokerApiSlice";
import { useSocket } from "@/context/SocketContext";

// ── Card render ─────────────────────────────
const SUIT_SYMBOL: Record<string, string> = {
  h: "♥",
  d: "♦",
  c: "♣",
  s: "♠",
};
const RED = ["h", "d"];

function Card({ code, small }: { code: string; small?: boolean }) {
  const hidden = code === "??";
  if (hidden)
    return (
      <View style={[styles.cardBack, small && styles.cardSmall]}>
        <Text style={{ color: "#fff", fontSize: small ? 14 : 20 }}>🂠</Text>
      </View>
    );
  const rank = code[0];
  const suit = code[1];
  const red = RED.includes(suit);
  return (
    <View style={[styles.card, small && styles.cardSmall]}>
      <Text
        style={{
          color: red ? "#EF4444" : "#0F172A",
          fontSize: small ? 14 : 20,
          fontWeight: "800",
          lineHeight: small ? 16 : 22,
        }}
      >
        {rank}
      </Text>
      <Text
        style={{
          color: red ? "#EF4444" : "#0F172A",
          fontSize: small ? 14 : 22,
          lineHeight: small ? 14 : 22,
        }}
      >
        {SUIT_SYMBOL[suit]}
      </Text>
    </View>
  );
}

function EmptyCard({ small }: { small?: boolean }) {
  return (
    <View
      style={[
        styles.card,
        small && styles.cardSmall,
        { backgroundColor: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.15)" },
      ]}
    />
  );
}

// ── Seat ────────────────────────────────────
function Avatar({
  uri,
  size = 36,
  fallback,
}: {
  uri?: string;
  size?: number;
  fallback?: string;
}) {
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: "#1E293B",
        }}
      />
    );
  }
  return (
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
      <Text style={{ color: "#fff", fontSize: size * 0.4, fontWeight: "800" }}>
        {(fallback || "?")[0]?.toUpperCase()}
      </Text>
    </View>
  );
}

function Seat({
  seat,
  isDealer,
  isActive,
  isMe,
  timerPct,
  onSit,
}: {
  seat: any;
  isDealer: boolean;
  isActive: boolean;
  isMe: boolean;
  timerPct?: number;
  onSit?: () => void;
}) {
  const empty = !seat.user;
  if (empty) {
    return (
      <Pressable onPress={onSit} style={styles.emptySeat}>
        <Ionicons name="add-circle" size={22} color="#94A3B8" />
        <Text style={{ color: "#94A3B8", fontSize: 10, marginTop: 4 }}>
          Ngồi
        </Text>
      </Pressable>
    );
  }
  const name = seat.user?.nickname || seat.user?.name || "User";
  return (
    <View
      style={[
        styles.seat,
        isActive && styles.seatActive,
        isMe && styles.seatMe,
        seat.hasFolded && { opacity: 0.4 },
      ]}
    >
      {isDealer && <View style={styles.dealerChip}><Text style={{ fontSize: 9, fontWeight: "900", color: "#0F172A" }}>D</Text></View>}
      {isActive && timerPct != null && (
        <View style={styles.timerBarWrap}>
          <View
            style={[
              styles.timerBarFill,
              {
                width: `${Math.max(0, Math.min(100, timerPct))}%`,
                backgroundColor:
                  timerPct > 50 ? "#10B981" : timerPct > 25 ? "#F59E0B" : "#EF4444",
              },
            ]}
          />
        </View>
      )}
      <Avatar uri={seat.user?.avatar} fallback={name} size={36} />
      <Text style={styles.seatName} numberOfLines={1}>
        {name}
      </Text>
      <Text style={styles.seatChips}>💰 {seat.chips}</Text>
      <View style={styles.seatCards}>
        {seat.cards?.length ? (
          seat.cards.map((c: string, i: number) => (
            <Card key={i} code={c} small />
          ))
        ) : (
          <>
            <EmptyCard small />
            <EmptyCard small />
          </>
        )}
      </View>
      {seat.betThisStreet > 0 && (
        <View style={styles.betChip}>
          <Text style={{ color: "#fff", fontSize: 10, fontWeight: "800" }}>
            {seat.betThisStreet}
          </Text>
        </View>
      )}
      {seat.lastAction && seat.lastAction !== "post_sb" && seat.lastAction !== "post_bb" && (
        <View
          style={[
            styles.actionBadge,
            seat.lastAction === "fold" && { backgroundColor: "#EF4444" },
            seat.lastAction === "check" && { backgroundColor: "#94A3B8" },
            seat.lastAction === "call" && { backgroundColor: "#3B82F6" },
            seat.lastAction === "raise" && { backgroundColor: "#F59E0B" },
            seat.lastAction === "allin" && { backgroundColor: "#DC2626" },
          ]}
        >
          <Text style={{ color: "#fff", fontSize: 9, fontWeight: "800" }}>
            {seat.lastAction.toUpperCase()}
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Main ────────────────────────────────────
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
  const [raiseAmt, setRaiseAmt] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatText, setChatText] = useState("");
  const [nowTs, setNowTs] = useState(Date.now());

  useEffect(() => {
    if (!socket || !id) return;
    const rid = String(id);
    const sub = () => socket.emit("poker:room:subscribe", { roomId: rid });
    sub();
    socket.on("connect", sub);
    const bump = () => refetch();
    socket.on("poker:room:updated", bump);
    socket.on("poker:room:chat", bump);
    return () => {
      try {
        socket.emit("poker:room:unsubscribe", { roomId: rid });
      } catch {}
      socket.off("connect", sub);
      socket.off("poker:room:updated", bump);
      socket.off("poker:room:chat", bump);
    };
  }, [socket, id, refetch]);

  // Tick countdown mỗi 250ms để timer bar mượt
  useEffect(() => {
    const t = setInterval(() => setNowTs(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  if (isLoading || !data) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0F1A2E" }}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  const room: any = (data as any).room;
  const mySeat = (room.seats || []).find((s: any) => s.isYou);
  const isMyTurn = mySeat && mySeat.seatIndex === room.activeIndex;
  const toCall = Math.max(0, room.currentBet - (mySeat?.betThisStreet || 0));

  // Timer % (remaining / total)
  const turnDur = (room.turnDurationSec || 30) * 1000;
  const turnDeadline = room.turnDeadlineAt
    ? new Date(room.turnDeadlineAt).getTime()
    : 0;
  const turnRemaining = Math.max(0, turnDeadline - nowTs);
  const timerPct = turnDeadline ? (turnRemaining / turnDur) * 100 : 0;
  const timerSecLeft = Math.ceil(turnRemaining / 1000);

  const doSit = async (seatIndex: number) => {
    if (!me) {
      Alert.alert("Cần đăng nhập");
      return;
    }
    try {
      await sit({ roomId: String(id), seatIndex }).unwrap();
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

  const seatOrder = arrangeSeats(room.seats?.length || 6);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0F1A2E" }} edges={["bottom"]}>
      <Stack.Screen
        options={{
          title: room.name,
          headerStyle: { backgroundColor: "#0F1A2E" },
          headerTintColor: "#fff",
        }}
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Table */}
        <View style={styles.table}>
          {/* Pot + Board */}
          <View style={styles.tableCenter}>
            <Text style={styles.potLabel}>Pot</Text>
            <Text style={styles.potValue}>💰 {room.pot}</Text>
            <View style={styles.board}>
              {[0, 1, 2, 3, 4].map((i) =>
                room.board?.[i] ? (
                  <Card key={i} code={room.board[i]} small />
                ) : (
                  <EmptyCard key={i} small />
                )
              )}
            </View>
            <Text style={styles.stageLabel}>
              {room.stage === "waiting"
                ? "Chờ ván tiếp theo"
                : room.stage.toUpperCase() + ` · Ván ${room.handNumber}`}
            </Text>
            {room.activeIndex >= 0 && turnDeadline > 0 && (
              <View
                style={[
                  styles.turnBadge,
                  timerSecLeft <= 5 && { backgroundColor: "#EF4444" },
                ]}
              >
                <Ionicons name="timer-outline" size={12} color="#fff" />
                <Text style={styles.turnBadgeText}>{timerSecLeft}s</Text>
              </View>
            )}
          </View>

          {/* Seats around */}
          <View style={styles.seatsGrid}>
            {seatOrder.map(({ seatIndex, position }) => {
              const seat = (room.seats || []).find(
                (s: any) => s.seatIndex === seatIndex
              ) || { seatIndex, user: null };
              return (
                <View
                  key={seatIndex}
                  style={[styles.seatWrap, positionStyle(position)]}
                >
                  <Seat
                    seat={seat}
                    isDealer={seatIndex === room.dealerIndex && room.stage !== "waiting"}
                    isActive={seatIndex === room.activeIndex}
                    isMe={!!seat.isYou}
                    timerPct={
                      seatIndex === room.activeIndex ? timerPct : undefined
                    }
                    onSit={
                      !seat.user && !mySeat ? () => doSit(seatIndex) : undefined
                    }
                  />
                </View>
              );
            })}
          </View>
        </View>

        {/* Winners banner */}
        {room.winners?.length > 0 && (
          <View style={styles.winnerBox}>
            <Text style={styles.winnerTitle}>🏆 Người thắng ván {room.handNumber}</Text>
            {room.winners.map((w: any, i: number) => (
              <Text key={i} style={styles.winnerLine}>
                Ghế {w.seatIndex + 1} · {w.handDescription} · +{w.amountWon}
              </Text>
            ))}
          </View>
        )}

        {/* Controls */}
        {mySeat && (
          <View style={styles.controlsBox}>
            <View style={styles.controlsHeader}>
              <Text style={styles.controlsInfo}>
                Bạn: 💰 {mySeat.chips} · Ván {room.handNumber || 0}
              </Text>
              <Pressable onPress={doLeave} style={styles.leaveBtn}>
                <Text style={{ color: "#EF4444", fontSize: 12, fontWeight: "700" }}>
                  Rời bàn
                </Text>
              </Pressable>
            </View>

            {room.stage === "waiting" && (
              <Pressable style={styles.startBtn} onPress={doStart}>
                <Text style={{ color: "#fff", fontWeight: "800" }}>
                  ▶ Bắt đầu ván
                </Text>
              </Pressable>
            )}

            {isMyTurn && (
              <>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <ActionBtn
                    label="Fold"
                    color="#EF4444"
                    onPress={() => doAct("fold")}
                  />
                  {toCall === 0 ? (
                    <ActionBtn
                      label="Check"
                      color="#94A3B8"
                      onPress={() => doAct("check")}
                    />
                  ) : (
                    <ActionBtn
                      label={`Call ${toCall}`}
                      color="#3B82F6"
                      onPress={() => doAct("call")}
                    />
                  )}
                  <ActionBtn
                    label="All-in"
                    color="#DC2626"
                    onPress={() => doAct("allin")}
                  />
                </View>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                  <TextInput
                    value={raiseAmt}
                    onChangeText={setRaiseAmt}
                    keyboardType="number-pad"
                    placeholder={`Raise (min ${room.currentBet + room.minRaise})`}
                    placeholderTextColor="#94A3B8"
                    style={styles.raiseInput}
                  />
                  <ActionBtn
                    label="Raise"
                    color="#F59E0B"
                    onPress={() => {
                      const n = Number(raiseAmt);
                      if (!Number.isFinite(n) || n <= 0) {
                        Alert.alert("Nhập số raise");
                        return;
                      }
                      doAct("raise", n);
                      setRaiseAmt("");
                    }}
                  />
                </View>
                <View style={{ flexDirection: "row", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                  {[
                    room.currentBet + room.minRaise,
                    Math.floor(room.pot * 0.5) + room.currentBet,
                    room.pot + room.currentBet,
                  ]
                    .filter((n) => n > room.currentBet && n <= mySeat.chips + mySeat.betThisStreet)
                    .map((n, i) => (
                      <Pressable
                        key={i}
                        onPress={() => setRaiseAmt(String(n))}
                        style={styles.quickBet}
                      >
                        <Text style={{ color: "#F59E0B", fontSize: 11, fontWeight: "700" }}>
                          {n}
                        </Text>
                      </Pressable>
                    ))}
                </View>
              </>
            )}
            {mySeat && !isMyTurn && room.stage !== "waiting" && (
              <Text style={styles.waitText}>
                ⏳ Chờ ghế {room.activeIndex + 1}…
              </Text>
            )}
          </View>
        )}

        {!mySeat && (
          <View style={styles.controlsBox}>
            <Text style={{ color: "#94A3B8", textAlign: "center" }}>
              Chọn ghế trống để ngồi vào bàn.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Chat FAB */}
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
    </SafeAreaView>
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
          keyboardVerticalOffset={0}
        >
          <View style={styles.chatSheet}>
            <View style={styles.chatHeader}>
              <View style={styles.chatHandle} />
              <View style={styles.chatHeaderRow}>
                <Text style={styles.chatTitle}>💬 Chat trong bàn</Text>
                <Pressable onPress={onClose} hitSlop={10}>
                  <Ionicons name="close" size={22} color="#94A3B8" />
                </Pressable>
              </View>
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
                    <Avatar uri={item.avatar} fallback={item.name} size={28} />
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
                      {!isMe && (
                        <Text style={styles.msgName}>{item.name}</Text>
                      )}
                      <Text
                        style={[styles.msgText, isMe && { color: "#fff" }]}
                      >
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
      style={[styles.actionBtn, { backgroundColor: color }]}
    >
      <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>
        {label}
      </Text>
    </Pressable>
  );
}

// Bố cục 6 ghế: 3 trên + 3 dưới
function arrangeSeats(n: number) {
  const arr: { seatIndex: number; position: string }[] = [];
  for (let i = 0; i < n; i++) {
    if (i < Math.ceil(n / 2)) arr.push({ seatIndex: i, position: "top" });
    else arr.push({ seatIndex: i, position: "bottom" });
  }
  return arr;
}
function positionStyle(pos: string) {
  return { width: "33.33%" as any, alignItems: "center" as const };
}

const styles = StyleSheet.create({
  table: {
    backgroundColor: "#0B5C36",
    borderRadius: 24,
    padding: 12,
    borderWidth: 6,
    borderColor: "#7C2D12",
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  tableCenter: {
    alignItems: "center",
    paddingVertical: 20,
    gap: 6,
  },
  potLabel: { color: "rgba(255,255,255,0.6)", fontSize: 11, letterSpacing: 2 },
  potValue: { color: "#FCD34D", fontSize: 24, fontWeight: "900" },
  board: { flexDirection: "row", gap: 6, marginTop: 8 },
  stageLabel: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
    letterSpacing: 1.5,
    marginTop: 6,
  },
  seatsGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 4 },
  seatWrap: { padding: 4 },
  emptySeat: {
    height: 90,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.25)",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 4,
  },
  seat: {
    backgroundColor: "rgba(15, 26, 46, 0.85)",
    borderRadius: 12,
    padding: 8,
    borderWidth: 2,
    borderColor: "transparent",
    minHeight: 90,
    alignItems: "center",
    position: "relative",
  },
  seatActive: { borderColor: "#FCD34D" },
  seatMe: { borderColor: "#3B82F6" },
  seatName: { color: "#fff", fontSize: 11, fontWeight: "700", maxWidth: 100 },
  seatChips: { color: "#FCD34D", fontSize: 11, fontWeight: "800", marginTop: 2 },
  seatCards: { flexDirection: "row", gap: 3, marginTop: 4 },
  dealerChip: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#FCD34D",
    alignItems: "center",
    justifyContent: "center",
  },
  betChip: {
    position: "absolute",
    bottom: -8,
    backgroundColor: "#0066FF",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    minWidth: 24,
    alignItems: "center",
  },
  actionBadge: {
    position: "absolute",
    top: -8,
    left: -8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  card: {
    width: 32,
    height: 44,
    backgroundColor: "#fff",
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
  },
  cardSmall: { width: 24, height: 34 },
  cardBack: {
    width: 32,
    height: 44,
    backgroundColor: "#1E40AF",
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#3B82F6",
    alignItems: "center",
    justifyContent: "center",
  },
  winnerBox: {
    backgroundColor: "#FEF3C7",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  winnerTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#92400E",
    textAlign: "center",
  },
  winnerLine: {
    color: "#78350F",
    fontSize: 12,
    textAlign: "center",
    marginTop: 4,
  },
  controlsBox: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  controlsHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  controlsInfo: { color: "#fff", fontSize: 13, fontWeight: "700", flex: 1 },
  leaveBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  startBtn: {
    backgroundColor: "#10B981",
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  actionBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
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
  quickBet: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#F59E0B",
    borderRadius: 6,
  },
  waitText: { color: "#94A3B8", fontStyle: "italic", textAlign: "center", padding: 8 },

  // Timer
  timerBarWrap: {
    position: "absolute",
    top: 4,
    left: 4,
    right: 4,
    height: 3,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 2,
    overflow: "hidden",
  },
  timerBarFill: { height: "100%", borderRadius: 2 },
  turnBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#0F172A",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#FCD34D",
    marginTop: 6,
  },
  turnBadgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },

  // Chat
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
    borderColor: "#0F1A2E",
  },
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
  chatHeader: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
  chatHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#334155",
    marginBottom: 8,
  },
  chatHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
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
  msgName: { color: "#94A3B8", fontSize: 11, fontWeight: "700", marginBottom: 2 },
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
});
