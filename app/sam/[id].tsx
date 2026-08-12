// Sâm Lốc room — landscape bàn xanh, 4 ghế, hand render. Phase 2 shell.
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, router } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import React, { useEffect, useMemo, useState } from "react";
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
  Image,
} from "react-native";
import { useSelector } from "react-redux";

import { useSocket } from "@/context/SocketContext";
import {
  useChatSamRoomMutation,
  useGetSamRoomQuery,
  useLeaveSamRoomMutation,
  useSitSamRoomMutation,
  useStartSamHandMutation,
} from "@/slices/samApiSlice";

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
          { width: w, height: h, backgroundColor: "#5B21B6" },
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

const SEAT_POSITIONS = [
  { top: "70%", left: "50%" },
  { top: "50%", left: "8%" },
  { top: "10%", left: "50%" },
  { top: "50%", right: "8%" },
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

export default function SamRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useSelector((s: any) => s.auth?.userInfo);
  const roomId = String(id || "");

  const { data, refetch } = useGetSamRoomQuery(roomId, { skip: !roomId });
  const [sit] = useSitSamRoomMutation();
  const [leave] = useLeaveSamRoomMutation();
  const [start] = useStartSamHandMutation();
  const [sendChat] = useChatSamRoomMutation();

  const socket = useSocket();
  const [chatOpen, setChatOpen] = useState(false);
  const [chatText, setChatText] = useState("");

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
    socket.emit("sam:room:subscribe", { roomId });
    const onUpdate = (p: any) => {
      if (p?.roomId === roomId) refetch();
    };
    const onChat = (p: any) => {
      if (p?.roomId === roomId) refetch();
    };
    socket.on("sam:room:updated", onUpdate);
    socket.on("sam:room:chat", onChat);
    return () => {
      socket.off("sam:room:updated", onUpdate);
      socket.off("sam:room:chat", onChat);
      socket.emit("sam:room:unsubscribe", { roomId });
    };
  }, [socket, roomId, refetch]);

  const room = (data as any)?.room;
  const seats = room?.seats || [];

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
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />

      <View style={styles.table}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </Pressable>
          <Text style={styles.roomTitle} numberOfLines={1}>
            🃏 {room.name}
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
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

        <View style={styles.tableCenter}>
          <Text style={styles.tableInfo}>
            Ván {room.handNumber || 0} · {room.stage}
          </Text>
          {room.currentCombo && (
            <View style={{ flexDirection: "row", gap: -12, marginTop: 8 }}>
              {(room.currentCombo.cards || []).map((c: string, i: number) => (
                <PlayingCard key={i} card={c} size={38} />
              ))}
            </View>
          )}
        </View>

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

      {mySeat && (
        <View style={styles.handStrip}>
          <ScrollView horizontal contentContainerStyle={{ gap: 4 }}>
            {myCards.map((c: string, i: number) => (
              <PlayingCard key={i} card={c} size={52} />
            ))}
          </ScrollView>
        </View>
      )}

      <Pressable onPress={() => setChatOpen(true)} style={styles.fabChat}>
        <Ionicons name="chatbubble-ellipses" size={22} color="#fff" />
      </Pressable>

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

const { width: SW, height: SH } = Dimensions.get("window");

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#3B1F4D" },
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
    backgroundColor: "#7C3AED",
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
  tableInfo: { color: "#EDE9FE", fontWeight: "700", fontSize: 12 },
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
    borderColor: "#C4B5FD",
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
    backgroundColor: "#7C3AED",
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
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
    backgroundColor: "#7C3AED",
    alignItems: "center",
    justifyContent: "center",
  },
});
