// Phỏm room — landscape bàn xanh gỗ nâu, elegant redesign.
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, router } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import React, { useEffect, useMemo, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Alert,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSelector } from "react-redux";

import { useSocket } from "@/context/SocketContext";
import { InviteFriendModal } from "@/components/games/InviteFriendModal";
import {
  CardPro,
  EmptySeat,
  FeltOval,
  RoundIconBtn,
  SeatFrame,
  WoodBackground,
} from "@/components/games/GameTableUI";
import {
  useChatPhomRoomMutation,
  useGetPhomRoomQuery,
  useInvitePhomRoomMutation,
  useLeavePhomRoomMutation,
  usePhomActionMutation,
  useSitPhomRoomMutation,
  useStartPhomHandMutation,
} from "@/slices/phomApiSlice";

const { width: SW, height: SH } = Dimensions.get("window");

// Toạ độ 4 ghế quanh bàn oval landscape (hero = bottom, index 0 sau rotate).
// Dịch top xuống để tránh Dynamic Island; dịch left/right vào để tránh nút tím + back.
const SEAT_LAYOUT = [
  { position: "bottom", left: "50%", top: "82%" },
  { position: "left", left: "14%", top: "52%" },
  { position: "top", left: "50%", top: "22%" },
  { position: "right", left: "86%", top: "52%" },
];

export default function PhomRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useSelector((s: any) => s.auth?.userInfo);
  const roomId = String(id || "");
  const insets = useSafeAreaInsets();

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

  useEffect(() => {
    if (!socket || !roomId) return;
    socket.emit("phom:room:subscribe", { roomId });
    const onUpdate = (p: any) => p?.roomId === roomId && refetch();
    const onChat = (p: any) => p?.roomId === roomId && refetch();
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

  useEffect(() => {
    if (!room?.turnDeadlineAt) return setRemainSec(0);
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
      try {
        const { playFx } = require("@/app/poker/pokerFx");
        playFx(action === "u" ? "win" : action.includes("discard") ? "chip" : "deal");
      } catch {}
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
  const isMyTurn = mySeat && room.activeIndex === mySeat.seatIndex && room.stage === "playing";

  return (
    <View style={{ flex: 1, backgroundColor: "#2A1408" }}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />

      <WoodBackground />

      {/* Top-left back button + room title */}
      <View
        style={[
          styles.topBar,
          { top: Math.max(8, insets.top), left: Math.max(12, insets.left + 8), right: Math.max(80, insets.right + 68) },
        ]}
      >
        <RoundIconBtn
          icon="chevron-back"
          onPress={() => router.back()}
          color="#334155"
          size={40}
        />
        <View style={styles.roomTitleBox}>
          <Text style={styles.roomTitle} numberOfLines={1}>
            🃏 Phỏm · {room.name}
          </Text>
          <Text style={styles.roomSub}>
            Ván {room.handNumber || 0} · Cược {room.stake} · Buy-in {room.buyIn}
          </Text>
        </View>
        {mySeat && room.stage === "waiting" && (
          <Pressable onPress={doStart} style={styles.startBtn}>
            <Text style={styles.startBtnText}>BẮT ĐẦU</Text>
          </Pressable>
        )}
      </View>

      {/* Timer bar */}
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

      {/* Felt table */}
      <View style={styles.tableWrap}>
        <FeltOval>
          {/* Center — discard pile */}
          <View style={styles.centerDiscardPile}>
            {(room.discards || []).slice(-4).map((d: any, i: number) => (
              <View
                key={i}
                style={{
                  position: "absolute",
                  left: i * 12,
                  transform: [{ rotate: `${(i - 2) * 5}deg` }],
                }}
              >
                <CardPro card={d.card} size={44} />
              </View>
            ))}
            {room.deck && (
              <View style={styles.deckStack}>
                <CardPro card={null} hidden size={44} />
                <Text style={styles.deckCount}>
                  {(room as any).deckCount || 0}
                </Text>
              </View>
            )}
          </View>
        </FeltOval>
      </View>

      {/* Seats floating around table */}
      {rotatedSeats.map((seat: any, i: number) => {
        if (!seat) return null;
        const layout = SEAT_LAYOUT[i];
        const isMine =
          seat.user &&
          String(seat.user._id || seat.user) === String(me?._id);
        const isTurn =
          room.activeIndex === seat.seatIndex && room.stage === "playing";
        const empty = !seat.user;
        return (
          <View
            key={seat.seatIndex}
            style={{
              position: "absolute",
              left: layout.left as any,
              top: layout.top as any,
              transform: [{ translateX: -50 }, { translateY: -40 }],
              zIndex: 5,
            }}
          >
            {empty ? (
              <EmptySeat onPress={() => doSit(seat.seatIndex)} />
            ) : (
              <SeatFrame
                user={seat.user}
                chips={seat.chips}
                isMine={!!isMine}
                isTurn={isTurn}
                cardCount={seat.cardCount || 0}
              />
            )}
            {/* Melds hạ visible */}
            {(seat.melds || []).length > 0 && (
              <View
                style={[
                  styles.meldsRow,
                  layout.position === "top" && { top: 90 },
                  layout.position === "bottom" && { bottom: 90 },
                  layout.position === "left" && { left: 90 },
                  layout.position === "right" && { right: 90 },
                ]}
              >
                {seat.melds.flat().map((c: string, idx: number) => (
                  <View
                    key={idx}
                    style={{ marginLeft: idx > 0 ? -18 : 0 }}
                  >
                    <CardPro card={c} size={28} />
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}

      {/* My hand (bottom) */}
      {mySeat && myCards.length > 0 && (
        <View style={styles.handStripWrap}>
          <ScrollView
            horizontal
            contentContainerStyle={{ paddingHorizontal: 12, gap: -8, alignItems: "flex-end" }}
            showsHorizontalScrollIndicator={false}
          >
            {myCards.map((c: string) => (
              <CardPro
                key={c}
                card={c}
                size={62}
                selected={selectedCards.includes(c)}
                onPress={() => toggleSelect(c)}
              />
            ))}
          </ScrollView>
        </View>
      )}

      {/* Action bar — điều kiện chỉ dựa vào số lá trong tay. */}
      {isMyTurn && (
        <View style={styles.actionBar}>
          {mySeat.cards?.length < 10 ? (
            <>
              <ActionBtn
                label="Bốc thẻ"
                icon="download-outline"
                color="#3B82F6"
                onPress={() => doAction("draw_deck")}
                disabled={acting}
              />
              {selectedCards.length >= 3 && (
                <ActionBtn
                  label={`Ăn+Hạ (${selectedCards.length})`}
                  icon="hand-left-outline"
                  color="#F59E0B"
                  onPress={() =>
                    doAction("draw_discard", { meldCards: selectedCards })
                  }
                  disabled={acting}
                />
              )}
            </>
          ) : (
            selectedCards.length === 1 && (
              <ActionBtn
                label={`Đánh ${selectedCards[0]}`}
                icon="arrow-forward-circle"
                color="#DC2626"
                onPress={() =>
                  doAction("discard", { card: selectedCards[0] })
                }
                disabled={acting}
              />
            )
          )}
        </View>
      )}

      {/* Showdown */}
      {room.stage === "showdown" && (room.winners || []).length > 0 && (
        <View style={styles.showdownBox}>
          <Text style={styles.showdownTitle}>
            🏆 Kết quả ván {room.handNumber}
          </Text>
          {(room.winners || []).map((w: any) => (
            <View key={w.seatIndex} style={styles.showdownRow}>
              <Text style={styles.showdownName}>
                {w.handDescription}: {w.userName}
              </Text>
              <Text
                style={[
                  styles.showdownAmt,
                  { color: w.amountWon > 0 ? "#10B981" : "#EF4444" },
                ]}
              >
                {w.amountWon > 0 ? "+" : ""}
                {w.amountWon}
              </Text>
            </View>
          ))}
          <Pressable onPress={doStart} style={styles.newHandBtn}>
            <Text style={styles.newHandBtnText}>Ván mới</Text>
          </Pressable>
        </View>
      )}

      {/* Right side: purple round buttons stack */}
      <View
        style={[
          styles.rightBtnStack,
          { right: Math.max(12, insets.right + 8), top: Math.max(70, insets.top + 60) },
        ]}
      >
        <RoundIconBtn
          icon="person-add"
          color="#8B5CF6"
          onPress={() => setInviteOpen(true)}
        />
        <RoundIconBtn
          icon="chatbubble-ellipses"
          color="#8B5CF6"
          onPress={() => setChatOpen(true)}
          badge={
            (room.messages || []).length > 0
              ? (room.messages || []).length
              : undefined
          }
        />
        {mySeat && (
          <RoundIconBtn
            icon="exit"
            color="#DC2626"
            onPress={doLeave}
          />
        )}
      </View>

      {/* Modals */}
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
        supportedOrientations={["portrait", "landscape", "landscape-left", "landscape-right"]}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setChatOpen(false)}
        >
          <Pressable style={styles.chatBox} onPress={() => {}}>
            <Text style={styles.chatTitle}>💬 Chat trong bàn</Text>
            <ScrollView style={{ maxHeight: 220 }}>
              {(room.messages || []).slice(-30).map((m: any) => (
                <View
                  key={String(m._id || m.at)}
                  style={styles.chatMsg}
                >
                  <Text style={styles.chatMsgName}>{m.name}:</Text>
                  <Text style={styles.chatMsgText}>{m.text}</Text>
                </View>
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
              <Pressable style={styles.chatSendBtn} onPress={doSendChat}>
                <Ionicons name="send" size={18} color="#fff" />
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function ActionBtn({
  label,
  icon,
  color,
  onPress,
  disabled,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.actionBtn,
        { backgroundColor: color },
        disabled && { opacity: 0.5 },
      ]}
    >
      <Ionicons name={icon} size={16} color="#fff" />
      <Text style={styles.actionBtnText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0F172A",
  },
  topBar: {
    position: "absolute",
    top: 8,
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    zIndex: 20,
  },
  roomTitleBox: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(251,191,36,0.4)",
  },
  roomTitle: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
  },
  roomSub: {
    color: "#FBBF24",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 1,
  },
  startBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#059669",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 5,
  },
  startBtnText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 0.5,
  },
  timerBar: {
    position: "absolute",
    top: 58,
    left: "25%",
    right: "25%",
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(0,0,0,0.5)",
    overflow: "hidden",
    zIndex: 10,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.3)",
  },
  timerFill: {
    ...StyleSheet.absoluteFillObject,
  },
  timerText: {
    color: "#0F172A",
    fontWeight: "900",
    fontSize: 11,
    textAlign: "center",
    lineHeight: 18,
    zIndex: 1,
  },
  tableWrap: {
    flex: 1,
    marginTop: 40,
    marginBottom: 90,
  },
  centerDiscardPile: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  deckStack: {
    position: "relative",
    marginLeft: 20,
  },
  deckCount: {
    position: "absolute",
    top: "50%",
    left: 0,
    right: 0,
    textAlign: "center",
    color: "#fff",
    fontWeight: "900",
    fontSize: 12,
    marginTop: -8,
    textShadowColor: "#000",
    textShadowRadius: 3,
  },
  meldsRow: {
    position: "absolute",
    flexDirection: "row",
  },
  handStripWrap: {
    position: "absolute",
    left: 60,
    right: 90,
    bottom: 6,
    paddingVertical: 6,
  },
  actionBar: {
    position: "absolute",
    top: 90,
    right: 70,
    flexDirection: "column",
    gap: 8,
    zIndex: 20,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 130,
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 5,
  },
  actionBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 12,
  },
  showdownBox: {
    position: "absolute",
    top: "18%",
    left: "22%",
    right: "22%",
    padding: 16,
    backgroundColor: "rgba(0,0,0,0.92)",
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#FBBF24",
    zIndex: 30,
  },
  showdownTitle: {
    color: "#FBBF24",
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 10,
    textAlign: "center",
  },
  showdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
    paddingHorizontal: 8,
  },
  showdownName: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  showdownAmt: {
    fontSize: 12,
    fontWeight: "900",
  },
  newHandBtn: {
    marginTop: 12,
    backgroundColor: "#059669",
    padding: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  newHandBtnText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 13,
  },
  rightBtnStack: {
    position: "absolute",
    right: 12,
    top: 100,
    flexDirection: "column",
    gap: 8,
    zIndex: 15,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  chatBox: {
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 14,
    width: "70%",
    maxWidth: 420,
  },
  chatTitle: {
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 8,
    color: "#0F172A",
  },
  chatMsg: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 4,
    flexWrap: "wrap",
  },
  chatMsgName: {
    fontWeight: "800",
    color: "#0F172A",
  },
  chatMsgText: {
    color: "#334155",
    flex: 1,
  },
  chatInput: {
    flex: 1,
    backgroundColor: "#F1F5F9",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  chatSendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#059669",
    alignItems: "center",
    justifyContent: "center",
  },
});
