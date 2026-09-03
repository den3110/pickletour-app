// Caro room — 15x15 board, tap to place X/O.
import {
  Ionicons } from "@expo/vector-icons";
import { Stack,
  useLocalSearchParams,
  router } from "expo-router";
import React,
  { useEffect,
  useMemo,
  useRef,
  useState } from "react";
import {
  Alert,
  Dimensions,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { TextInput } from "@/components/ui/i18nTextInput";
import { Text } from "@/components/ui/i18nText";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSelector } from "react-redux";

import { useSocket } from "@/context/SocketContext";
import { useGameAutoReconnect } from "@/hook/useGameAutoReconnect";
import { InviteFriendModal } from "@/components/games/InviteFriendModal";
import { ConnectionBanner, SpeechBubble } from "@/components/games/GameTableUI";
import { playSound, warmupSounds } from "@/lib/gameSound";
import {
  useCaroMoveMutation,
  useChatCaroRoomMutation,
  useGetCaroRoomQuery,
  useInviteCaroRoomMutation,
  useLeaveCaroRoomMutation,
  useSitCaroRoomMutation,
  useStartCaroHandMutation,
} from "@/slices/caroApiSlice";

export default function CaroRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useSelector((s: any) => s.auth?.userInfo);
  const roomId = String(id || "");

  const { data, refetch } = useGetCaroRoomQuery(roomId, { skip: !roomId });
  const [sit] = useSitCaroRoomMutation();
  const [leave] = useLeaveCaroRoomMutation();
  const [start] = useStartCaroHandMutation();
  const [move, { isLoading: moving }] = useCaroMoveMutation();
  const [sendChat] = useChatCaroRoomMutation();
  const [invite, { isLoading: inviting }] = useInviteCaroRoomMutation();

  const socket = useSocket();
  const connStatus = useGameAutoReconnect({
    socket,
    roomId,
    refetch,
    subscribeEvent: "caro:room:subscribe",
  });
  const [chatOpen, setChatOpen] = useState(false);
  const [chatText, setChatText] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [remainSec, setRemainSec] = useState(0);
  const [bubbles, setBubbles] = useState<Record<string, { text: string; at: number }>>({});
  const seenMsgAtRef = useRef(Date.now());
  const [nowTs, setNowTs] = useState(0);

  useEffect(() => {
    if (!socket || !roomId) return;
    socket.emit("caro:room:subscribe", { roomId });
    const onUpdate = (p: any) => p?.roomId === roomId && refetch();
    const onChat = (p: any) => p?.roomId === roomId && refetch();
    socket.on("caro:room:updated", onUpdate);
    socket.on("caro:room:chat", onChat);
    return () => {
      socket.off("caro:room:updated", onUpdate);
      socket.off("caro:room:chat", onChat);
      socket.emit("caro:room:unsubscribe", { roomId });
    };
  }, [socket, roomId, refetch]);

  const room = (data as any)?.room;

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

  // Speech bubble khi có chat mới
  useEffect(() => {
    const msgs = room?.messages || [];
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
  }, [room?.messages?.length]);
  useEffect(() => {
    const t = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
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

  const mySeat = useMemo(
    () =>
      (room?.seats || []).find(
        (s: any) => s?.user && String(s.user._id || s.user) === String(me?._id),
      ),
    [room, me?._id],
  );

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
  const doMove = async (row: number, col: number) => {
    try {
      await move({ roomId, row, col }).unwrap();
      playSound("chip");
    } catch (err: any) {
      Alert.alert("Không được", err?.data?.message || "Lỗi");
    }
  };
  const confirmBack = () => {
    if (!mySeat) {
      router.back();
      return;
    }
    Alert.alert("Thoát phòng?", "Bạn có muốn rời bàn?", [
      { text: "Ở lại", style: "cancel" },
      { text: "Thoát", style: "destructive", onPress: doLeave },
    ]);
  };
  useEffect(() => {
    warmupSounds();
  }, []);
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
        <Text style={{ color: "#0F172A" }}>Đang tải bàn…</Text>
      </View>
    );
  }

  const size = room.boardSize || 15;
  const board = room.board || [];
  const isMyTurn = mySeat && room.activeSeatIndex === mySeat.seatIndex && room.stage === "playing";
  const seat0 = room.seats.find((s: any) => s.seatIndex === 0);
  const seat1 = room.seats.find((s: any) => s.seatIndex === 1);
  const isHost =
    room.createdBy &&
    String(room.createdBy._id || room.createdBy) === String(me?._id);

  const winLine = new Set(
    (room.winningLine || []).map((rc: number[]) => `${rc[0]}-${rc[1]}`),
  );

  return (
    <View style={{ flex: 1, backgroundColor: "#78350F" }}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />

      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <ConnectionBanner status={connStatus} />
        {/* Top bar */}
        <View style={styles.topBar}>
          <Pressable onPress={confirmBack} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </Pressable>
          <View style={styles.titleBox}>
            <Text style={styles.title} numberOfLines={1}>
              ⚔️ Caro · {room.name}
            </Text>
            <Text style={styles.sub}>
              Ván {room.handNumber} · {size}×{size} · Cược {room.stake}
            </Text>
          </View>
        </View>

        {/* Players row */}
        <View style={styles.playersRow}>
          <PlayerBox
            seat={seat0}
            mark="X"
            color="#DC2626"
            isTurn={
              room.activeSeatIndex === 0 && room.stage === "playing"
            }
            onSit={() => doSit(0)}
            bubble={seat0?.user && bubbles[String(seat0.user._id || seat0.user)]}
          />
          <View style={styles.vs}>
            <Text style={styles.vsText}>VS</Text>
            {remainSec > 0 && room.stage === "playing" && (
              <Text
                style={[
                  styles.timer,
                  remainSec < 5 && { color: "#EF4444" },
                ]}
              >
                {remainSec}s
              </Text>
            )}
          </View>
          <PlayerBox
            seat={seat1}
            mark="O"
            color="#2563EB"
            isTurn={
              room.activeSeatIndex === 1 && room.stage === "playing"
            }
            onSit={() => doSit(1)}
            bubble={seat1?.user && bubbles[String(seat1.user._id || seat1.user)]}
          />
        </View>

        {/* Board */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 8, alignItems: "center" }}
          maximumZoomScale={2}
          minimumZoomScale={0.8}
        >
          <View style={[styles.board, { padding: 4 }]}>
            {Array.from({ length: size }).map((_, r) => (
              <View key={r} style={{ flexDirection: "row" }}>
                {Array.from({ length: size }).map((_, c) => {
                  const cell = board[r * size + c] || "";
                  const isWin = winLine.has(`${r}-${c}`);
                  return (
                    <Pressable
                      key={c}
                      onPress={() => cell === "" && isMyTurn && !moving && doMove(r, c)}
                      style={[
                        styles.cell,
                        isWin && { backgroundColor: "#FEF3C7" },
                      ]}
                    >
                      <Text
                        style={[
                          styles.cellText,
                          cell === "X" && { color: "#DC2626" },
                          cell === "O" && { color: "#2563EB" },
                        ]}
                      >
                        {cell}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>

        {/* Bottom actions */}
        <View style={styles.bottomRow}>
          {isHost && (room.stage === "waiting" || room.stage === "showdown") && (
            <Pressable onPress={doStart} style={[styles.actionBtn, { backgroundColor: "#10B981" }]}>
              <Ionicons name="play" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>
                {room.stage === "showdown" ? "Ván mới" : "Bắt đầu"}
              </Text>
            </Pressable>
          )}
          {!isHost && (room.stage === "waiting" || room.stage === "showdown") && (
            <View style={[styles.actionBtn, { backgroundColor: "#334155" }]}>
              <Ionicons name="hourglass" size={16} color="#fff" />
              <Text style={styles.actionBtnText}>Chờ chủ phòng bắt đầu</Text>
            </View>
          )}
          <Pressable
            onPress={() => setInviteOpen(true)}
            style={[styles.actionBtn, { backgroundColor: "#8B5CF6" }]}
          >
            <Ionicons name="person-add" size={16} color="#fff" />
            <Text style={styles.actionBtnText}>Mời</Text>
          </Pressable>
          <Pressable
            onPress={() => setChatOpen(true)}
            style={[styles.actionBtn, { backgroundColor: "#8B5CF6" }]}
          >
            <Ionicons name="chatbubble" size={16} color="#fff" />
            <Text style={styles.actionBtnText}>Chat</Text>
          </Pressable>
          {mySeat && (
            <Pressable
              onPress={doLeave}
              style={[styles.actionBtn, { backgroundColor: "#DC2626" }]}
            >
              <Ionicons name="exit" size={16} color="#fff" />
              <Text style={styles.actionBtnText}>Rời</Text>
            </Pressable>
          )}
        </View>

        {/* Showdown overlay */}
        {room.stage === "showdown" && (
          <View style={styles.winOverlay}>
            <View style={styles.winBox}>
              <Text style={styles.winTitle}>
                {room.winnerSeatIndex >= 0
                  ? `🏆 ${room.winnerSeatIndex === 0 ? "X" : "O"} thắng ván ${room.handNumber}!`
                  : `🤝 Hoà ván ${room.handNumber}`}
              </Text>
              <Pressable
                onPress={doStart}
                style={[styles.actionBtn, { backgroundColor: "#10B981", marginTop: 8 }]}
              >
                <Text style={styles.actionBtnText}>Ván mới</Text>
              </Pressable>
            </View>
          </View>
        )}
      </SafeAreaView>

      <InviteFriendModal
        visible={inviteOpen}
        onClose={() => setInviteOpen(false)}
        loading={inviting}
        color="#EF4444"
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
            <Text style={styles.chatTitle}>💬 Chat</Text>
            <ScrollView style={{ maxHeight: 220 }}>
              {(room.messages || []).slice(-30).map((m: any) => (
                <View
                  key={String(m._id || m.at)}
                  style={{ flexDirection: "row", gap: 6, marginBottom: 4 }}
                >
                  <Text style={{ fontWeight: "800", color: "#0F172A" }}>
                    {m.name}:
                  </Text>
                  <Text style={{ color: "#334155", flex: 1 }}>{m.text}</Text>
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

function PlayerBox({
  seat,
  mark,
  color,
  isTurn,
  onSit,
  bubble,
}: {
  seat: any;
  mark: string;
  color: string;
  isTurn: boolean;
  onSit: () => void;
  bubble?: { text: string; at: number } | null;
}) {
  const u = seat?.user;
  if (!u) {
    return (
      <Pressable style={styles.playerEmpty} onPress={onSit}>
        <Text style={[styles.markText, { color }]}>{mark}</Text>
        <Text style={styles.emptyText}>Ngồi</Text>
      </Pressable>
    );
  }
  return (
    <View
      style={[
        styles.playerBox,
        isTurn && { borderColor: "#FBBF24", borderWidth: 2 },
      ]}
    >
      {u.avatar ? (
        <Image source={{ uri: u.avatar }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarPlaceholder]}>
          <Text style={{ color: "#fff", fontWeight: "800" }}>
            {(u.nickname || u.name || "?")[0]?.toUpperCase()}
          </Text>
        </View>
      )}
      <Text style={[styles.markText, { color, fontSize: 22, lineHeight: 24 }]}>{mark}</Text>
      <Text style={styles.playerName} numberOfLines={1}>
        {u.nickname || u.name || "?"}
      </Text>
      <Text style={styles.playerChips}>💰 {seat.chips || 0}</Text>
      {bubble ? <SpeechBubble key={bubble.at} text={bubble.text} /> : null}
    </View>
  );
}

const { width: SW } = Dimensions.get("window");
const CELL = Math.floor((SW - 40) / 15);

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  titleBox: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(251,191,36,0.4)",
  },
  title: { color: "#fff", fontWeight: "800", fontSize: 14 },
  sub: { color: "#FBBF24", fontSize: 10, fontWeight: "700" },
  playersRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  playerBox: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 8,
    borderRadius: 12,
    alignItems: "center",
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    position: "relative",
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginBottom: 4,
  },
  avatarPlaceholder: {
    backgroundColor: "#475569",
    alignItems: "center",
    justifyContent: "center",
  },
  playerEmpty: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.2)",
    padding: 8,
    borderRadius: 12,
    alignItems: "center",
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    borderStyle: "dashed",
  },
  markText: {
    fontSize: 32,
    fontWeight: "900",
    lineHeight: 34,
  },
  playerName: { color: "#fff", fontWeight: "700", fontSize: 12, marginTop: 4 },
  playerChips: { color: "#FBBF24", fontWeight: "700", fontSize: 11 },
  emptyText: { color: "rgba(255,255,255,0.6)", fontSize: 11, marginTop: 2 },
  vs: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  vsText: { color: "#FBBF24", fontWeight: "900", fontSize: 14 },
  timer: { color: "#FBBF24", fontWeight: "800", fontSize: 12, marginTop: 2 },
  board: {
    backgroundColor: "#F5DEB3",
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#78350F",
  },
  cell: {
    width: CELL,
    height: CELL,
    borderWidth: 0.5,
    borderColor: "#78350F",
    alignItems: "center",
    justifyContent: "center",
  },
  cellText: {
    fontWeight: "900",
    fontSize: Math.max(12, CELL - 6),
  },
  bottomRow: {
    flexDirection: "row",
    gap: 8,
    padding: 10,
    justifyContent: "center",
    flexWrap: "wrap",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  actionBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  winOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
  },
  winBox: {
    backgroundColor: "#fff",
    padding: 24,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: "#FBBF24",
    minWidth: 280,
    alignItems: "center",
  },
  winTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0F172A",
    textAlign: "center",
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
    width: "85%",
    maxWidth: 400,
  },
  chatTitle: {
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 8,
    color: "#0F172A",
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
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
  },
});
