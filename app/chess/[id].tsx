// Chess room 8x8 với Unicode chess pieces + move highlight
import { Ionicons } from "@expo/vector-icons";
import { Chess } from "chess.js";
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
import { playSound, warmupSounds } from "@/lib/gameSound";
import {
  useChatChessRoomMutation,
  useChessMoveMutation,
  useChessResignMutation,
  useGetChessRoomQuery,
  useInviteChessRoomMutation,
  useLeaveChessRoomMutation,
  useSitChessRoomMutation,
  useStartChessHandMutation,
} from "@/slices/chessApiSlice";

const PIECE_UNICODE: Record<string, string> = {
  K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙",
  k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟",
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

// FEN → board 2D [row 0..7][col 0..7] với row 0 = rank 8 (top).
function parseFen(fen: string): string[][] {
  const rows: string[][] = [];
  const [pos] = fen.split(" ");
  for (const rowStr of pos.split("/")) {
    const row: string[] = [];
    for (const ch of rowStr) {
      if (/\d/.test(ch)) {
        for (let k = 0; k < Number(ch); k++) row.push("");
      } else {
        row.push(ch);
      }
    }
    rows.push(row);
  }
  return rows;
}

// Convert (row, col) with hero at bottom → algebraic notation.
// mySide 'w' hero at bottom = row 7. If mySide 'b', flip.
function toAlgebraic(row: number, col: number): string {
  return `${FILES[col]}${8 - row}`;
}

export default function ChessRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useSelector((s: any) => s.auth?.userInfo);
  const roomId = String(id || "");

  const { data, refetch } = useGetChessRoomQuery(roomId, { skip: !roomId });
  const [sit] = useSitChessRoomMutation();
  const [leave] = useLeaveChessRoomMutation();
  const [start] = useStartChessHandMutation();
  const [move, { isLoading: moving }] = useChessMoveMutation();
  const [resign] = useChessResignMutation();
  const [sendChat] = useChatChessRoomMutation();
  const [invite, { isLoading: inviting }] = useInviteChessRoomMutation();

  const socket = useSocket();
  const connStatus = useGameAutoReconnect({
    socket,
    roomId,
    refetch,
    subscribeEvent: "chess:room:subscribe",
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
    socket.emit("chess:room:subscribe", { roomId });
    const onUpdate = (p: any) => p?.roomId === roomId && refetch();
    const onChat = (p: any) => p?.roomId === roomId && refetch();
    socket.on("chess:room:updated", onUpdate);
    socket.on("chess:room:chat", onChat);
    return () => {
      socket.off("chess:room:updated", onUpdate);
      socket.off("chess:room:chat", onChat);
      socket.emit("chess:room:unsubscribe", { roomId });
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

  // Speech bubble
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

  const board = useMemo(() => (room?.fen ? parseFen(room.fen) : parseFen("8/8/8/8/8/8/8/8 w - - 0 1")), [room?.fen]);
  const mySide = mySeat?.seatIndex === 0 ? "w" : "b";
  const isMyTurn = mySeat && room?.activeSeatIndex === mySeat.seatIndex && room?.stage === "playing";

  // Legal moves from selected square
  const legalTargets = useMemo(() => {
    if (!room?.fen || !selected || !isMyTurn) return new Set<string>();
    try {
      const chess = new Chess(room.fen);
      const fromSq = toAlgebraic(selected[0], selected[1]);
      const moves = chess.moves({ square: fromSq as any, verbose: true }) as any[];
      return new Set(moves.map((m) => m.to));
    } catch {
      return new Set<string>();
    }
  }, [room?.fen, selected, isMyTurn]);

  // Flip board display if playing black (hero always at bottom)
  const flip = mySide === "b";
  const displayBoard = flip ? [...board].reverse().map((r) => [...r].reverse()) : board;

  const doSit = async (seatIndex: number) => {
    if (!me) return Alert.alert("Cần đăng nhập");
    try {
      await sit({ roomId, seatIndex }).unwrap();
    } catch (err: any) {
      Alert.alert("Lỗi", err?.data?.message || "Lỗi");
    }
  };
  const doLeave = async () => {
    try {
      await leave(roomId).unwrap();
      router.back();
    } catch (err: any) {
      Alert.alert("Lỗi", err?.data?.message || "Lỗi");
    }
  };
  const doStart = async () => {
    try {
      await start(roomId).unwrap();
    } catch (err: any) {
      Alert.alert("Lỗi", err?.data?.message || "Lỗi");
    }
  };
  const doResign = () => {
    Alert.alert("Xin thua?", "Bạn chắc chắn muốn đầu hàng?", [
      { text: "Huỷ", style: "cancel" },
      {
        text: "Đầu hàng",
        style: "destructive",
        onPress: async () => {
          try {
            await resign(roomId).unwrap();
          } catch (err: any) {
            Alert.alert("Lỗi", err?.data?.message || "Lỗi");
          }
        },
      },
    ]);
  };
  const doSendChat = async () => {
    const t = chatText.trim();
    if (!t) return;
    try {
      await sendChat({ roomId, text: t }).unwrap();
      setChatText("");
    } catch {}
  };

  const onCellPress = async (dispRow: number, dispCol: number) => {
    if (!isMyTurn) return;
    // Convert display coords → actual board coords
    const actualRow = flip ? 7 - dispRow : dispRow;
    const actualCol = flip ? 7 - dispCol : dispCol;
    const piece = board[actualRow][actualCol];

    if (!selected) {
      // Chọn quân của mình
      if (!piece) return;
      const isMyPiece = mySide === "w" ? /[A-Z]/.test(piece) : /[a-z]/.test(piece);
      if (!isMyPiece) return;
      setSelected([actualRow, actualCol]);
      return;
    }
    // Đã chọn 1 ô → check nếu tap cùng ô = deselect
    if (selected[0] === actualRow && selected[1] === actualCol) {
      setSelected(null);
      return;
    }
    // Nếu tap ô khác của mình → chọn lại
    if (piece) {
      const isMyPiece = mySide === "w" ? /[A-Z]/.test(piece) : /[a-z]/.test(piece);
      if (isMyPiece) {
        setSelected([actualRow, actualCol]);
        return;
      }
    }
    // Đi từ selected → (actualRow, actualCol)
    const from = toAlgebraic(selected[0], selected[1]);
    const to = toAlgebraic(actualRow, actualCol);
    // Kiểm tra promotion
    const selectedPiece = board[selected[0]][selected[1]];
    const isPawnPromotion =
      (selectedPiece === "P" && actualRow === 0) ||
      (selectedPiece === "p" && actualRow === 7);
    setSelected(null);
    try {
      const targetHadPiece = !!board[actualRow][actualCol];
      await move({
        roomId,
        from,
        to,
        promotion: isPawnPromotion ? "q" : undefined,
      }).unwrap();
      playSound(targetHadPiece ? "call" : "chip");
    } catch (err: any) {
      Alert.alert("Không được", err?.data?.message || "Nước không hợp lệ");
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

  if (!room) {
    return (
      <View style={styles.loading}>
        <Text>Đang tải bàn…</Text>
      </View>
    );
  }

  const seat0 = room.seats.find((s: any) => s.seatIndex === 0);
  const seat1 = room.seats.find((s: any) => s.seatIndex === 1);
  const topSeat = mySide === "w" ? seat1 : seat0;
  const bottomSeat = mySide === "w" ? seat0 : seat1;
  const isHost =
    room.createdBy &&
    String(room.createdBy._id || room.createdBy) === String(me?._id);

  return (
    <View style={{ flex: 1, backgroundColor: "#1E293B" }}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <ConnectionBanner status={connStatus} />
        <View style={styles.topBar}>
          <Pressable onPress={confirmBack} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </Pressable>
          <View style={styles.titleBox}>
            <Text style={styles.title} numberOfLines={1}>
              ♟️ Cờ Vua · {room.name}
            </Text>
            <Text style={styles.sub}>Ván {room.handNumber} · Cược {room.stake}</Text>
          </View>
        </View>

        {/* Opponent bar */}
        <PlayerBar
          seat={topSeat}
          mark={mySide === "w" ? "♚" : "♔"}
          color={mySide === "w" ? "#000" : "#fff"}
          bg={mySide === "w" ? "#1E293B" : "#78716C"}
          isTurn={topSeat && room.activeSeatIndex === topSeat.seatIndex && room.stage === "playing"}
          onSit={() => topSeat && !topSeat.user && doSit(topSeat.seatIndex)}
          remainSec={remainSec}
          bubble={topSeat?.user && bubbles[String(topSeat.user._id || topSeat.user)]}
        />

        {/* Board */}
        <View style={styles.boardWrap}>
          <View style={styles.board}>
            {displayBoard.map((row, r) => (
              <View key={r} style={{ flexDirection: "row" }}>
                {row.map((piece, c) => {
                  const actualRow = flip ? 7 - r : r;
                  const actualCol = flip ? 7 - c : c;
                  const dark = (actualRow + actualCol) % 2 === 1;
                  const sq = toAlgebraic(actualRow, actualCol);
                  const isSelected =
                    selected && selected[0] === actualRow && selected[1] === actualCol;
                  const isTarget = legalTargets.has(sq);
                  return (
                    <Pressable
                      key={c}
                      style={[
                        styles.cell,
                        { backgroundColor: dark ? "#B58863" : "#F0D9B5" },
                        isSelected && { backgroundColor: "#FBBF24" },
                        isTarget && { backgroundColor: "#84CC16" },
                      ]}
                      onPress={() => onCellPress(r, c)}
                    >
                      {piece && (
                        <Text
                          style={[
                            styles.piece,
                            { color: /[A-Z]/.test(piece) ? "#fff" : "#0F172A" },
                          ]}
                        >
                          {PIECE_UNICODE[piece]}
                        </Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        </View>

        {/* Hero bar */}
        <PlayerBar
          seat={bottomSeat}
          mark={mySide === "w" ? "♔" : "♚"}
          color={mySide === "w" ? "#fff" : "#000"}
          bg={mySide === "w" ? "#78716C" : "#1E293B"}
          isTurn={
            bottomSeat &&
            room.activeSeatIndex === bottomSeat.seatIndex &&
            room.stage === "playing"
          }
          onSit={() => bottomSeat && !bottomSeat.user && doSit(bottomSeat.seatIndex)}
          isMine
          bubble={bottomSeat?.user && bubbles[String(bottomSeat.user._id || bottomSeat.user)]}
        />

        {/* Bottom actions */}
        <View style={styles.bottomRow}>
          {isHost && (room.stage === "waiting" || room.stage === "showdown") && (
            <Pressable
              onPress={doStart}
              style={[styles.actionBtn, { backgroundColor: "#10B981" }]}
            >
              <Ionicons name="play" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>
                {room.stage === "showdown" ? "Ván mới" : "Bắt đầu"}
              </Text>
            </Pressable>
          )}
          {!isHost && (room.stage === "waiting" || room.stage === "showdown") && (
            <View style={[styles.actionBtn, { backgroundColor: "#334155" }]}>
              <Ionicons name="hourglass" size={16} color="#fff" />
              <Text style={styles.actionBtnText}>Chờ chủ phòng</Text>
            </View>
          )}
          {mySeat && room.stage === "playing" && (
            <Pressable
              onPress={doResign}
              style={[styles.actionBtn, { backgroundColor: "#DC2626" }]}
            >
              <Ionicons name="flag" size={16} color="#fff" />
              <Text style={styles.actionBtnText}>Xin thua</Text>
            </Pressable>
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
              style={[styles.actionBtn, { backgroundColor: "#64748B" }]}
            >
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
                  ? `🏆 ${room.winnerSeatIndex === 0 ? "Trắng" : "Đen"} thắng!`
                  : "🤝 Hoà"}
              </Text>
              <Text style={styles.winReason}>
                {room.resultReason === "checkmate"
                  ? "Chiếu bí"
                  : room.resultReason === "resign"
                  ? "Đầu hàng"
                  : room.resultReason === "stalemate"
                  ? "Hoà (không đi được)"
                  : room.resultReason === "draw"
                  ? "Hoà"
                  : room.resultReason || ""}
              </Text>
              <Pressable
                onPress={doStart}
                style={[styles.actionBtn, { backgroundColor: "#10B981", marginTop: 12 }]}
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
        color="#0F172A"
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
  mark,
  color,
  bg,
  isTurn,
  onSit,
  isMine,
  remainSec,
  bubble,
}: {
  seat: any;
  mark: string;
  color: string;
  bg: string;
  isTurn?: boolean;
  onSit?: () => void;
  isMine?: boolean;
  remainSec?: number;
  bubble?: { text: string; at: number } | null;
}) {
  if (!seat?.user) {
    return (
      <Pressable style={styles.playerBarEmpty} onPress={onSit}>
        <Text style={[styles.pieceIcon, { color }]}>{mark}</Text>
        <Text style={styles.emptyText}>Ngồi</Text>
      </Pressable>
    );
  }
  const u = seat.user;
  return (
    <View
      style={[
        styles.playerBar,
        { backgroundColor: bg },
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
      <Text style={[styles.pieceIcon, { color }]}>{mark}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[styles.playerName, { color }]} numberOfLines={1}>
          {u.nickname || u.name} {isMine ? "(bạn)" : ""}
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
const BOARD = Math.min(SW - 24, 380);
const CELL = Math.floor(BOARD / 8);

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fff" },
  topBar: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" },
  titleBox: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: "rgba(251,191,36,0.4)" },
  title: { color: "#fff", fontWeight: "800", fontSize: 14 },
  sub: { color: "#FBBF24", fontSize: 10, fontWeight: "700" },
  playerBar: { flexDirection: "row", alignItems: "center", padding: 10, marginHorizontal: 12, marginVertical: 4, borderRadius: 10, gap: 10, position: "relative" },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarPlaceholder: { backgroundColor: "#475569", alignItems: "center", justifyContent: "center" },
  playerBarEmpty: { flexDirection: "row", alignItems: "center", padding: 10, marginHorizontal: 12, marginVertical: 4, borderRadius: 10, gap: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.3)", borderStyle: "dashed", justifyContent: "center" },
  pieceIcon: { fontSize: 26 },
  playerName: { fontWeight: "800", fontSize: 14 },
  playerChips: { color: "#FBBF24", fontSize: 12, fontWeight: "700" },
  emptyText: { color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: "700" },
  timer: { color: "#FBBF24", fontWeight: "900", fontSize: 14 },
  boardWrap: { alignItems: "center", justifyContent: "center", padding: 8 },
  board: { width: BOARD, height: BOARD, borderWidth: 4, borderColor: "#78350F", borderRadius: 6, overflow: "hidden" },
  cell: { width: CELL, height: CELL, alignItems: "center", justifyContent: "center" },
  piece: { fontSize: CELL * 0.7, fontWeight: "900" },
  bottomRow: { flexDirection: "row", gap: 8, padding: 10, justifyContent: "center", flexWrap: "wrap" },
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
  chatSendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#0F172A", alignItems: "center", justifyContent: "center" },
});
