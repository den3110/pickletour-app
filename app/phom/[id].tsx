// Phỏm room — landscape bàn xanh, 4 ghế, hand render. Phase 2 shell.
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, router } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Image,
  ScrollView,
} from "react-native";
import { useSelector } from "react-redux";

import { useSocket } from "@/context/SocketContext";
import { InviteFriendModal } from "@/components/games/InviteFriendModal";
import {
  useChatPhomRoomMutation,
  useGetPhomRoomQuery,
  useInvitePhomRoomMutation,
  useLeavePhomRoomMutation,
  usePhomActionMutation,
  useSitPhomRoomMutation,
  useStartPhomHandMutation,
} from "@/slices/phomApiSlice";

/* -------- Card rendering programmatic (Phase 3 sẽ swap CC0 deck) -------- */

const SUIT_SYMBOL: Record<string, string> = {
  s: "♠",
  h: "♥",
  d: "♦",
  c: "♣",
};

function suitColor(suit: string) {
  return suit === "h" || suit === "d" ? "#DC2626" : "#0F172A";
}

function PlayingCard({
  card,
  size = 44,
  hidden = false,
}: {
  card?: string | null;
  size?: number;
  hidden?: boolean;
}) {
  const w = size;
  const h = Math.round(size * 1.4);
  if (hidden || !card) {
    return (
      <View
        style={[
          styles.card,
          { width: w, height: h, backgroundColor: "#1E3A8A" },
        ]}
      >
        <View style={styles.cardBackPattern} />
      </View>
    );
  }
  const rank = card[0];
  const suit = card[1];
  const color = suitColor(suit);
  const display = rank === "T" ? "10" : rank;
  return (
    <View style={[styles.card, { width: w, height: h }]}>
      <Text style={[styles.cardRank, { color, fontSize: size * 0.32 }]}>
        {display}
      </Text>
      <Text style={[styles.cardSuit, { color, fontSize: size * 0.4 }]}>
        {SUIT_SYMBOL[suit] || "?"}
      </Text>
    </View>
  );
}

/* -------- Seat around table -------- */

const SEAT_POSITIONS = [
  { top: "70%", left: "50%" }, // hero (0) — will rotate below
  { top: "50%", left: "8%" }, // left
  { top: "10%", left: "50%" }, // top
  { top: "50%", right: "8%" }, // right
];

function Seat({
  seat,
  isMine,
  onSit,
  isTurn,
}: {
  seat: any;
  isMine: boolean;
  onSit: () => void;
  isTurn: boolean;
}) {
  const empty = !seat?.user;
  if (empty) {
    return (
      <Pressable style={styles.emptySeat} onPress={onSit}>
        <Ionicons name="add-circle-outline" size={22} color="#94A3B8" />
        <Text style={styles.emptySeatText}>Ngồi</Text>
      </Pressable>
    );
  }
  const u = seat.user;
  return (
    <View style={[styles.seat, isTurn && styles.seatTurn]}>
      {u.avatar ? (
        <Image source={{ uri: u.avatar }} style={styles.seatAvatar} />
      ) : (
        <View style={styles.seatAvatarPlaceholder}>
          <Text style={{ color: "#fff", fontWeight: "700" }}>
            {(u.nickname || u.name || "?")[0]?.toUpperCase()}
          </Text>
        </View>
      )}
      <Text style={styles.seatName} numberOfLines={1}>
        {u.nickname || u.name}
        {isMine ? " (bạn)" : ""}
      </Text>
      <Text style={styles.seatChips}>💰 {seat.chips || 0}</Text>
      {seat.cardCount > 0 && !isMine && (
        <Text style={styles.seatCardCount}>{seat.cardCount} lá</Text>
      )}
    </View>
  );
}

/* -------- Main screen -------- */

export default function PhomRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useSelector((s: any) => s.auth?.userInfo);
  const roomId = String(id || "");

  const { data, refetch } = useGetPhomRoomQuery(roomId, { skip: !roomId });
  const [sit] = useSitPhomRoomMutation();
  const [leave] = useLeavePhomRoomMutation();
  const [start] = useStartPhomHandMutation();
  const [sendChat] = useChatPhomRoomMutation();
  const [act, { isLoading: acting }] = usePhomActionMutation();
  const [invite, { isLoading: inviting }] = useInvitePhomRoomMutation();

  const socket = useSocket();
  const [chatOpen, setChatOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [chatText, setChatText] = useState("");
  const [selectedCards, setSelectedCards] = useState<string[]>([]);
  const [remainSec, setRemainSec] = useState(0);
  const toggleSelect = (c: string) =>
    setSelectedCards((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );

  // Lock landscape
  useEffect(() => {
    ScreenOrientation.lockAsync(
      ScreenOrientation.OrientationLock.LANDSCAPE,
    ).catch(() => {});
    return () => {
      ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.PORTRAIT_UP,
      ).catch(() => {});
    };
  }, []);

  // Socket subscribe
  useEffect(() => {
    if (!socket || !roomId) return;
    socket.emit("phom:room:subscribe", { roomId });
    const onUpdate = (p: any) => {
      if (p?.roomId === roomId) refetch();
    };
    const onChat = (p: any) => {
      if (p?.roomId === roomId) refetch();
    };
    socket.on("phom:room:updated", onUpdate);
    socket.on("phom:room:chat", onChat);
    return () => {
      socket.off("phom:room:updated", onUpdate);
      socket.off("phom:room:chat", onChat);
      socket.emit("phom:room:unsubscribe", { roomId });
    };
  }, [socket, roomId, refetch]);

  const room = (data as any)?.room;
  const seats = room?.seats || [];

  // Countdown timer tick
  useEffect(() => {
    if (!room?.turnDeadlineAt) {
      setRemainSec(0);
      return;
    }
    const tick = () => {
      const ms = new Date(room.turnDeadlineAt).getTime() - Date.now();
      setRemainSec(Math.max(0, Math.ceil(ms / 1000)));
    };
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [room?.turnDeadlineAt]);

  const mySeat = useMemo(
    () =>
      seats.find(
        (s: any) => s?.user && String(s.user._id || s.user) === String(me?._id),
      ),
    [seats, me?._id],
  );

  // Rotate seats so hero is at index 0 (bottom)
  const rotatedSeats = useMemo(() => {
    if (!mySeat) return seats;
    const myIdx = mySeat.seatIndex;
    return [0, 1, 2, 3].map((i) => seats[(myIdx + i) % seats.length]);
  }, [seats, mySeat]);

  const doSit = async (seatIndex: number) => {
    if (!me) return Alert.alert("Cần đăng nhập");
    try {
      await sit({ roomId, seatIndex }).unwrap();
    } catch (err: any) {
      Alert.alert("Lỗi", err?.data?.message || "Không ngồi được");
    }
  };
  const doLeave = async () => {
    try {
      await leave(roomId).unwrap();
      router.back();
    } catch (err: any) {
      Alert.alert("Lỗi", err?.data?.message || "Không rời được");
    }
  };
  const doStart = async () => {
    try {
      await start(roomId).unwrap();
    } catch (err: any) {
      Alert.alert("Lỗi", err?.data?.message || "Không bắt đầu được");
    }
  };
  const doSendChat = async () => {
    const t = chatText.trim();
    if (!t) return;
    try {
      await sendChat({ roomId, text: t }).unwrap();
      setChatText("");
    } catch (err: any) {
      Alert.alert("Lỗi", err?.data?.message || "Không gửi được");
    }
  };

  const doAction = async (action: string, payload: any = {}) => {
    try {
      await act({ roomId, action, ...payload }).unwrap();
      setSelectedCards([]);
    } catch (err: any) {
      Alert.alert("Không được", err?.data?.message || "Lỗi");
    }
  };

  if (!room) {
    return (
      <View style={styles.loading}>
        <Text style={{ color: "#fff" }}>Đang tải bàn…</Text>
      </View>
    );
  }

  const myCards = mySeat?.cards || [];

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: false,
          gestureEnabled: false,
        }}
      />

      {/* Wood table + green baize */}
      <View style={styles.table}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </Pressable>
          <Text style={styles.roomTitle} numberOfLines={1}>
            🃏 {room.name}
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable onPress={() => setInviteOpen(true)} style={styles.iconBtn}>
              <Ionicons name="person-add" size={20} color="#fff" />
            </Pressable>
            {mySeat && room.stage === "waiting" && (
              <Pressable onPress={doStart} style={styles.startBtn}>
                <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>
                  BẮT ĐẦU
                </Text>
              </Pressable>
            )}
            {mySeat && (
              <Pressable onPress={doLeave} style={styles.iconBtn}>
                <Ionicons name="exit-outline" size={22} color="#fff" />
              </Pressable>
            )}
          </View>
        </View>

        {/* Turn timer bar */}
        {room.stage === "playing" && remainSec > 0 && (
          <View style={styles.timerBar}>
            <View
              style={[
                styles.timerFill,
                {
                  width: `${Math.min(100, (remainSec / (room.turnDurationSec || 30)) * 100)}%`,
                  backgroundColor: remainSec < 5 ? "#EF4444" : "#FBBF24",
                },
              ]}
            />
            <Text style={styles.timerText}>{remainSec}s</Text>
          </View>
        )}

        <View style={styles.tableCenter}>
          <Text style={styles.tableInfo}>
            Ván {room.handNumber || 0} · {room.stage}
          </Text>
          {(room.discards || []).length > 0 && (
            <View style={{ flexDirection: "row", gap: -12, marginTop: 8 }}>
              {(room.discards || []).slice(-5).map((d: any, i: number) => (
                <PlayingCard key={i} card={d.card} size={38} />
              ))}
            </View>
          )}
        </View>

        {/* Seats around */}
        {rotatedSeats.map((seat: any, i: number) => {
          if (!seat) return null;
          const pos = SEAT_POSITIONS[i];
          const isMine =
            seat.user &&
            String(seat.user._id || seat.user) === String(me?._id);
          const isTurn = room.activeIndex === seat.seatIndex;
          return (
            <View
              key={seat.seatIndex}
              style={[styles.seatWrap, pos as any, { transform: [{ translateX: -55 }, { translateY: -40 }] }]}
            >
              <Seat
                seat={seat}
                isMine={!!isMine}
                onSit={() => doSit(seat.seatIndex)}
                isTurn={isTurn}
              />
            </View>
          );
        })}
      </View>

      {/* Hand strip (my cards) — tap chọn */}
      {mySeat && (
        <View style={styles.handStrip}>
          <ScrollView horizontal contentContainerStyle={{ gap: 4 }}>
            {myCards.map((c: string, i: number) => {
              const selected = selectedCards.includes(c);
              return (
                <Pressable
                  key={i}
                  onPress={() => toggleSelect(c)}
                  style={{
                    transform: selected
                      ? [{ translateY: -10 }]
                      : [{ translateY: 0 }],
                  }}
                >
                  <PlayingCard card={c} size={52} />
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Action bar — chỉ hiện khi tới lượt */}
      {mySeat && room.stage === "playing" && room.activeIndex === mySeat.seatIndex && (
        <View style={styles.actionBar}>
          {mySeat.cards?.length <= 9 && mySeat.seatIndex !== room.dealerIndex ? (
            <>
              <Pressable
                onPress={() => doAction("draw_deck")}
                disabled={acting}
                style={[styles.actionBtn, { backgroundColor: "#3B82F6" }]}
              >
                <Text style={styles.actionBtnText}>Bốc nọc</Text>
              </Pressable>
              {selectedCards.length >= 3 && (
                <Pressable
                  onPress={() =>
                    doAction("draw_discard", { meldCards: selectedCards })
                  }
                  disabled={acting}
                  style={[styles.actionBtn, { backgroundColor: "#F59E0B" }]}
                >
                  <Text style={styles.actionBtnText}>
                    Ăn + Hạ ({selectedCards.length} lá)
                  </Text>
                </Pressable>
              )}
            </>
          ) : (
            <>
              {selectedCards.length === 1 && (
                <Pressable
                  onPress={() => doAction("discard", { card: selectedCards[0] })}
                  disabled={acting}
                  style={[styles.actionBtn, { backgroundColor: "#DC2626" }]}
                >
                  <Text style={styles.actionBtnText}>
                    Thảy {selectedCards[0]}
                  </Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => doAction("u")}
                disabled={acting}
                style={[styles.actionBtn, { backgroundColor: "#059669" }]}
              >
                <Text style={styles.actionBtnText}>Ù</Text>
              </Pressable>
            </>
          )}
        </View>
      )}

      {/* Showdown modal */}
      {room.stage === "showdown" && (room.winners || []).length > 0 && (
        <View style={styles.showdownBox}>
          <Text style={styles.showdownTitle}>Kết quả ván {room.handNumber}</Text>
          {(room.winners || []).map((w: any) => (
            <Text key={w.seatIndex} style={styles.showdownRow}>
              {w.handDescription}: {w.userName} ({w.amountWon > 0 ? "+" : ""}
              {w.amountWon})
            </Text>
          ))}
          <Pressable
            onPress={doStart}
            style={[styles.actionBtn, { backgroundColor: "#059669", marginTop: 8 }]}
          >
            <Text style={styles.actionBtnText}>Ván mới</Text>
          </Pressable>
        </View>
      )}

      {/* Chat FAB */}
      <Pressable
        onPress={() => setChatOpen(true)}
        style={styles.fabChat}
      >
        <Ionicons name="chatbubble-ellipses" size={22} color="#fff" />
      </Pressable>

      <InviteFriendModal
        visible={inviteOpen}
        onClose={() => setInviteOpen(false)}
        loading={inviting}
        color="#059669"
        onInvite={async (userIds) => {
          await invite({ roomId, userIds }).unwrap();
        }}
      />

      <Modal
        transparent
        visible={chatOpen}
        animationType="fade"
        onRequestClose={() => setChatOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setChatOpen(false)}
        >
          <Pressable style={styles.chatBox} onPress={() => {}}>
            <Text style={styles.chatTitle}>Chat</Text>
            <ScrollView style={{ maxHeight: 200 }}>
              {(room.messages || []).slice(-30).map((m: any) => (
                <Text
                  key={String(m._id || m.at)}
                  style={{ color: "#0F172A", marginBottom: 4 }}
                >
                  <Text style={{ fontWeight: "700" }}>{m.name}: </Text>
                  {m.text}
                </Text>
              ))}
            </ScrollView>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <TextInput
                value={chatText}
                onChangeText={setChatText}
                placeholder="Nhập tin…"
                style={styles.chatInput}
                onSubmitEditing={doSendChat}
              />
              <Pressable style={styles.sendBtn} onPress={doSendChat}>
                <Ionicons name="send" size={18} color="#fff" />
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

/* -------- Styles -------- */

const { width: SW, height: SH } = Dimensions.get("window");

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#3B1F0D" },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0F172A",
  },
  table: {
    flex: 1,
    position: "relative",
    overflow: "hidden",
  },
  topBar: {
    position: "absolute",
    top: 8,
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    zIndex: 10,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  roomTitle: {
    flex: 1,
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
    textAlign: "center",
  },
  startBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#059669",
  },
  tableCenter: {
    position: "absolute",
    top: "35%",
    left: "50%",
    transform: [{ translateX: -80 }, { translateY: -30 }],
    width: 160,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 100,
    padding: 20,
  },
  tableInfo: { color: "#DCFCE7", fontWeight: "700", fontSize: 12 },
  seatWrap: {
    position: "absolute",
    width: 110,
    height: 80,
  },
  seat: {
    width: 110,
    padding: 6,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    gap: 2,
  },
  seatTurn: {
    borderWidth: 2,
    borderColor: "#FBBF24",
  },
  seatAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  seatAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#475569",
    alignItems: "center",
    justifyContent: "center",
  },
  seatName: { color: "#fff", fontSize: 11, fontWeight: "700" },
  seatChips: { color: "#FBBF24", fontSize: 10, fontWeight: "700" },
  seatCardCount: { color: "#CBD5E1", fontSize: 9 },
  emptySeat: {
    width: 110,
    height: 60,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  emptySeatText: { color: "#94A3B8", fontSize: 10, marginTop: 2 },
  handStrip: {
    position: "absolute",
    left: 12,
    right: 60,
    bottom: 8,
    padding: 6,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: 8,
  },
  card: {
    borderRadius: 4,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
    padding: 2,
    overflow: "hidden",
  },
  cardBackPattern: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 3,
    borderColor: "#93C5FD",
    borderRadius: 4,
  },
  cardRank: { fontWeight: "900", position: "absolute", top: 2, left: 3 },
  cardSuit: { fontWeight: "900" },
  fabChat: {
    position: "absolute",
    right: 12,
    bottom: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#059669",
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
  timerBar: {
    position: "absolute",
    top: 52,
    left: "20%",
    right: "20%",
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(0,0,0,0.4)",
    overflow: "hidden",
    zIndex: 5,
  },
  timerFill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 9,
  },
  timerText: {
    color: "#0F172A",
    fontWeight: "800",
    fontSize: 11,
    textAlign: "center",
    lineHeight: 18,
    zIndex: 1,
  },
  actionBar: {
    position: "absolute",
    top: 60,
    right: 12,
    flexDirection: "column",
    gap: 6,
    zIndex: 20,
  },
  actionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 120,
    alignItems: "center",
  },
  actionBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 13,
  },
  showdownBox: {
    position: "absolute",
    top: "20%",
    left: "20%",
    right: "20%",
    padding: 16,
    backgroundColor: "rgba(0,0,0,0.85)",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#FBBF24",
    zIndex: 30,
    alignItems: "center",
  },
  showdownTitle: {
    color: "#FBBF24",
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 8,
  },
  showdownRow: {
    color: "#fff",
    fontSize: 13,
    marginBottom: 4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  chatBox: {
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 12,
    width: "80%",
    maxWidth: 400,
  },
  chatTitle: { fontSize: 15, fontWeight: "800", marginBottom: 8 },
  chatInput: {
    flex: 1,
    backgroundColor: "#F1F5F9",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#059669",
    alignItems: "center",
    justifyContent: "center",
  },
});
