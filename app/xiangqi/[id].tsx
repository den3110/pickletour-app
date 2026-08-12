// Xiangqi room 9x10 với chữ Hán trên quân
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, router } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSelector } from "react-redux";

import { useSocket } from "@/context/SocketContext";
import { useGameAutoReconnect } from "@/hook/useGameAutoReconnect";
import { InviteFriendModal } from "@/components/games/InviteFriendModal";
import { ConnectionBanner, SpeechBubble } from "@/components/games/GameTableUI";
import {
  useChatXiangqiRoomMutation,
  useGetXiangqiRoomQuery,
  useInviteXiangqiRoomMutation,
  useLeaveXiangqiRoomMutation,
  useSitXiangqiRoomMutation,
  useStartXiangqiHandMutation,
  useXiangqiMoveMutation,
  useXiangqiResignMutation,
} from "@/slices/xiangqiApiSlice";

// Ký tự Hán cho mỗi loại quân. Red uppercase, Black lowercase.
const PIECE_TEXT: Record<string, string> = {
  K: "帥", A: "仕", E: "相", H: "傌", R: "俥", C: "炮", P: "兵",
  k: "將", a: "士", e: "象", h: "馬", r: "車", c: "砲", p: "卒",
};

export default function XiangqiRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useSelector((s: any) => s.auth?.userInfo);
  const roomId = String(id || "");

  const { data, refetch } = useGetXiangqiRoomQuery(roomId, { skip: !roomId });
  const [sit] = useSitXiangqiRoomMutation();
  const [leave] = useLeaveXiangqiRoomMutation();
  const [start] = useStartXiangqiHandMutation();
  const [move] = useXiangqiMoveMutation();
  const [resign] = useXiangqiResignMutation();
  const [sendChat] = useChatXiangqiRoomMutation();
  const [invite, { isLoading: inviting }] = useInviteXiangqiRoomMutation();

  const socket = useSocket();
  const connStatus = useGameAutoReconnect({
    socket,
    roomId,
    refetch,
    subscribeEvent: "xiangqi:room:subscribe",
  });
  const [chatOpen, setChatOpen] = useState(false);
  const [chatText, setChatText] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [remainSec, setRemainSec] = useState(0);
  const [bubbles, setBubbles] = useState<Record<string, { text: string; at: number }>>({});
  const seenMsgAtRef = useRef(Date.now());
  const [nowTs, setNowTs] = useState(0);

  useEffect(() => {
    if (!socket || !roomId) return;
    socket.emit("xiangqi:room:subscribe", { roomId });
    const onUpdate = (p: any) => p?.roomId === roomId && refetch();
    const onChat = (p: any) => p?.roomId === roomId && refetch();
    socket.on("xiangqi:room:updated", onUpdate);
    socket.on("xiangqi:room:chat", onChat);
    return () => {
      socket.off("xiangqi:room:updated", onUpdate);
      socket.off("xiangqi:room:chat", onChat);
      socket.emit("xiangqi:room:unsubscribe", { roomId });
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

  const board = room?.board || new Array(90).fill("");
  const mySide = mySeat?.seatIndex === 0 ? "red" : "black";
  const isMyTurn = mySeat && room?.activeSeatIndex === mySeat.seatIndex && room?.stage === "playing";
  const flip = mySide === "black"; // đen ở dưới nếu là hero

  const doSit = async (seatIndex: number) => {
    if (!me) return Alert.alert("Cần đăng nhập");
    try { await sit({ roomId, seatIndex }).unwrap(); } catch (err: any) { Alert.alert("Lỗi", err?.data?.message || "Lỗi"); }
  };
  const doLeave = async () => {
    try { await leave(roomId).unwrap(); router.back(); } catch (err: any) { Alert.alert("Lỗi", err?.data?.message || "Lỗi"); }
  };
  const doStart = async () => {
    try { await start(roomId).unwrap(); } catch (err: any) { Alert.alert("Lỗi", err?.data?.message || "Lỗi"); }
  };
  const doResign = () => {
    Alert.alert("Xin thua?", "Bạn chắc chắn đầu hàng?", [
      { text: "Huỷ", style: "cancel" },
      { text: "Đầu hàng", style: "destructive", onPress: async () => {
        try { await resign(roomId).unwrap(); } catch (err: any) { Alert.alert("Lỗi", err?.data?.message || "Lỗi"); }
      } },
    ]);
  };
  const doSendChat = async () => {
    const t = chatText.trim();
    if (!t) return;
    try { await sendChat({ roomId, text: t }).unwrap(); setChatText(""); } catch {}
  };

  const onCellPress = async (dispRow: number, dispCol: number) => {
    if (!isMyTurn) return;
    const actualRow = flip ? 9 - dispRow : dispRow;
    const actualCol = flip ? 8 - dispCol : dispCol;
    const piece = board[actualRow * 9 + actualCol];

    if (!selected) {
      if (!piece) return;
      const isMyPiece = mySide === "red" ? /[A-Z]/.test(piece) : /[a-z]/.test(piece);
      if (!isMyPiece) return;
      setSelected([actualRow, actualCol]);
      return;
    }
    if (selected[0] === actualRow && selected[1] === actualCol) {
      setSelected(null);
      return;
    }
    if (piece) {
      const isMyPiece = mySide === "red" ? /[A-Z]/.test(piece) : /[a-z]/.test(piece);
      if (isMyPiece) {
        setSelected([actualRow, actualCol]);
        return;
      }
    }
    const from = [selected[0], selected[1]];
    const to = [actualRow, actualCol];
    setSelected(null);
    try {
      await move({ roomId, from, to }).unwrap();
    } catch (err: any) {
      Alert.alert("Không được", err?.data?.message || "Nước không hợp lệ");
    }
  };

  if (!room) {
    return <View style={styles.loading}><Text>Đang tải…</Text></View>;
  }

  const seat0 = room.seats.find((s: any) => s.seatIndex === 0);
  const seat1 = room.seats.find((s: any) => s.seatIndex === 1);
  const topSeat = mySide === "red" ? seat1 : seat0;
  const bottomSeat = mySide === "red" ? seat0 : seat1;

  return (
    <View style={{ flex: 1, backgroundColor: "#78350F" }}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <ConnectionBanner status={connStatus} />
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </Pressable>
          <View style={styles.titleBox}>
            <Text style={styles.title} numberOfLines={1}>🀄 Cờ Tướng · {room.name}</Text>
            <Text style={styles.sub}>Ván {room.handNumber} · Cược {room.stake}</Text>
          </View>
        </View>

        <PlayerBar
          seat={topSeat}
          side={mySide === "red" ? "black" : "red"}
          isTurn={topSeat && room.activeSeatIndex === topSeat.seatIndex && room.stage === "playing"}
          onSit={() => topSeat && !topSeat.user && doSit(topSeat.seatIndex)}
          remainSec={remainSec}
          bubble={topSeat?.user && bubbles[String(topSeat.user._id || topSeat.user)]}
        />

        {/* Board */}
        <View style={styles.boardWrap}>
          <View style={styles.board}>
            {/* Grid lines background rendering — dùng CELL grid overlay */}
            {Array.from({ length: 10 }).map((_, dispR) => (
              <View key={dispR} style={{ flexDirection: "row" }}>
                {Array.from({ length: 9 }).map((_, dispC) => {
                  const actualRow = flip ? 9 - dispR : dispR;
                  const actualCol = flip ? 8 - dispC : dispC;
                  const piece = board[actualRow * 9 + actualCol] || "";
                  const isSelected =
                    selected && selected[0] === actualRow && selected[1] === actualCol;
                  const isRiver = actualRow === 4 || actualRow === 5;
                  const isPalace =
                    actualCol >= 3 && actualCol <= 5 &&
                    ((actualRow >= 0 && actualRow <= 2) ||
                      (actualRow >= 7 && actualRow <= 9));
                  return (
                    <Pressable
                      key={dispC}
                      style={[
                        styles.cell,
                        isPalace && { borderColor: "rgba(120, 53, 15, 0.5)" },
                        isRiver && { backgroundColor: "#FEF3C7" },
                        isSelected && { backgroundColor: "#FBBF24" },
                      ]}
                      onPress={() => onCellPress(dispR, dispC)}
                    >
                      {piece ? (
                        <View
                          style={[
                            styles.pieceCircle,
                            {
                              backgroundColor: /[A-Z]/.test(piece) ? "#fef2f2" : "#f5f5f5",
                              borderColor: /[A-Z]/.test(piece) ? "#DC2626" : "#0F172A",
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.pieceText,
                              { color: /[A-Z]/.test(piece) ? "#DC2626" : "#0F172A" },
                            ]}
                          >
                            {PIECE_TEXT[piece]}
                          </Text>
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        </View>

        <PlayerBar
          seat={bottomSeat}
          side={mySide as any}
          isTurn={
            bottomSeat &&
            room.activeSeatIndex === bottomSeat.seatIndex &&
            room.stage === "playing"
          }
          onSit={() => bottomSeat && !bottomSeat.user && doSit(bottomSeat.seatIndex)}
          isMine
          bubble={bottomSeat?.user && bubbles[String(bottomSeat.user._id || bottomSeat.user)]}
        />

        <View style={styles.bottomRow}>
          {mySeat && (room.stage === "waiting" || room.stage === "showdown") && (
            <Pressable onPress={doStart} style={[styles.actionBtn, { backgroundColor: "#10B981" }]}>
              <Ionicons name="play" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>{room.stage === "showdown" ? "Ván mới" : "Bắt đầu"}</Text>
            </Pressable>
          )}
          {mySeat && room.stage === "playing" && (
            <Pressable onPress={doResign} style={[styles.actionBtn, { backgroundColor: "#DC2626" }]}>
              <Ionicons name="flag" size={16} color="#fff" />
              <Text style={styles.actionBtnText}>Xin thua</Text>
            </Pressable>
          )}
          <Pressable onPress={() => setInviteOpen(true)} style={[styles.actionBtn, { backgroundColor: "#8B5CF6" }]}>
            <Ionicons name="person-add" size={16} color="#fff" />
            <Text style={styles.actionBtnText}>Mời</Text>
          </Pressable>
          <Pressable onPress={() => setChatOpen(true)} style={[styles.actionBtn, { backgroundColor: "#8B5CF6" }]}>
            <Ionicons name="chatbubble" size={16} color="#fff" />
            <Text style={styles.actionBtnText}>Chat</Text>
          </Pressable>
          {mySeat && (
            <Pressable onPress={doLeave} style={[styles.actionBtn, { backgroundColor: "#64748B" }]}>
              <Ionicons name="exit" size={16} color="#fff" />
              <Text style={styles.actionBtnText}>Rời</Text>
            </Pressable>
          )}
        </View>

        {room.stage === "showdown" && (
          <View style={styles.winOverlay}>
            <View style={styles.winBox}>
              <Text style={styles.winTitle}>
                {room.winnerSeatIndex >= 0
                  ? `🏆 ${room.winnerSeatIndex === 0 ? "Đỏ" : "Đen"} thắng!`
                  : "🤝 Hoà"}
              </Text>
              <Text style={styles.winReason}>{room.resultReason || ""}</Text>
              <Pressable onPress={doStart} style={[styles.actionBtn, { backgroundColor: "#10B981", marginTop: 12 }]}>
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
        color="#B45309"
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
        <Pressable style={styles.modalBackdrop} onPress={() => setChatOpen(false)}>
          <Pressable style={styles.chatBox} onPress={() => {}}>
            <Text style={styles.chatTitle}>💬 Chat</Text>
            <ScrollView style={{ maxHeight: 220 }}>
              {(room.messages || []).slice(-30).map((m: any) => (
                <View key={String(m._id || m.at)} style={{ flexDirection: "row", gap: 6, marginBottom: 4 }}>
                  <Text style={{ fontWeight: "800", color: "#0F172A" }}>{m.name}:</Text>
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

function PlayerBar({
  seat,
  side,
  isTurn,
  onSit,
  isMine,
  remainSec,
  bubble,
}: {
  seat: any;
  side: "red" | "black";
  isTurn?: boolean;
  onSit?: () => void;
  isMine?: boolean;
  remainSec?: number;
  bubble?: { text: string; at: number } | null;
}) {
  const label = side === "red" ? "帥 ĐỎ" : "將 ĐEN";
  const color = side === "red" ? "#DC2626" : "#0F172A";
  if (!seat?.user) {
    return (
      <Pressable style={styles.playerBarEmpty} onPress={onSit}>
        <Text style={[styles.pieceIconSmall, { color }]}>{side === "red" ? "帥" : "將"}</Text>
        <Text style={styles.emptyText}>Ngồi ({side === "red" ? "Đỏ" : "Đen"})</Text>
      </Pressable>
    );
  }
  const u = seat.user;
  return (
    <View
      style={[
        styles.playerBar,
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
      <Text style={[styles.pieceIconSmall, { color }]}>{side === "red" ? "帥" : "將"}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.playerName} numberOfLines={1}>
          {u.nickname || u.name} · {label} {isMine ? "(bạn)" : ""}
        </Text>
        <Text style={styles.playerChips}>💰 {seat.chips || 0}</Text>
      </View>
      {isTurn && remainSec != null && (
        <Text style={[styles.timer, remainSec < 10 && { color: "#EF4444" }]}>
          {remainSec}s
        </Text>
      )}
      {bubble ? <SpeechBubble key={bubble.at} text={bubble.text} /> : null}
    </View>
  );
}

const { width: SW } = Dimensions.get("window");
const BOARD_W = Math.min(SW - 20, 400);
const CELL = Math.floor(BOARD_W / 9);
const BOARD_H = CELL * 10;

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fff" },
  topBar: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" },
  titleBox: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: "rgba(251,191,36,0.4)" },
  title: { color: "#fff", fontWeight: "800", fontSize: 14 },
  sub: { color: "#FBBF24", fontSize: 10, fontWeight: "700" },
  playerBar: { flexDirection: "row", alignItems: "center", padding: 10, marginHorizontal: 12, marginVertical: 4, borderRadius: 10, gap: 10, backgroundColor: "rgba(0,0,0,0.5)", position: "relative" },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarPlaceholder: { backgroundColor: "#475569", alignItems: "center", justifyContent: "center" },
  playerBarEmpty: { flexDirection: "row", alignItems: "center", padding: 10, marginHorizontal: 12, marginVertical: 4, borderRadius: 10, gap: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.3)", borderStyle: "dashed", justifyContent: "center" },
  pieceIconSmall: { fontSize: 26, fontWeight: "900" },
  playerName: { color: "#fff", fontWeight: "800", fontSize: 13 },
  playerChips: { color: "#FBBF24", fontSize: 11, fontWeight: "700" },
  emptyText: { color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: "700" },
  timer: { color: "#FBBF24", fontWeight: "900", fontSize: 14 },
  boardWrap: { alignItems: "center", justifyContent: "center", padding: 6 },
  board: { width: BOARD_W, height: BOARD_H, backgroundColor: "#F5DEB3", borderWidth: 3, borderColor: "#78350F", borderRadius: 4 },
  cell: {
    width: CELL,
    height: CELL,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0.5,
    borderColor: "rgba(120, 53, 15, 0.3)",
  },
  pieceCircle: {
    width: CELL - 4,
    height: CELL - 4,
    borderRadius: (CELL - 4) / 2,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  pieceText: {
    fontSize: CELL * 0.5,
    fontWeight: "900",
  },
  bottomRow: { flexDirection: "row", gap: 8, padding: 8, justifyContent: "center", flexWrap: "wrap" },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999 },
  actionBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  winOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", zIndex: 100 },
  winBox: { backgroundColor: "#fff", padding: 24, borderRadius: 16, borderWidth: 3, borderColor: "#FBBF24", minWidth: 280, alignItems: "center" },
  winTitle: { fontSize: 20, fontWeight: "900", color: "#0F172A", textAlign: "center" },
  winReason: { fontSize: 13, color: "#64748B", marginTop: 4 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center" },
  chatBox: { backgroundColor: "#fff", padding: 14, borderRadius: 14, width: "85%", maxWidth: 400 },
  chatTitle: { fontSize: 15, fontWeight: "900", marginBottom: 8, color: "#0F172A" },
  chatInput: { flex: 1, backgroundColor: "#F1F5F9", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  chatSendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#B45309", alignItems: "center", justifyContent: "center" },
});
