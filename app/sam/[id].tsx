// Sâm Lốc room — landscape bàn xanh gỗ nâu, elegant redesign.
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, router } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Alert,
  Dimensions,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from "react-native";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { useSelector } from "react-redux";

import { useSocket } from "@/context/SocketContext";
import { InviteFriendModal } from "@/components/games/InviteFriendModal";
import {
  CardPro,
  EmptySeat,
  FeltOval,
  RoundIconBtn,
  SeatFrame,
  SpeechBubble,
  WoodBackground,
} from "@/components/games/GameTableUI";
import {
  useBatSamMutation,
  useChatSamRoomMutation,
  useGetSamRoomQuery,
  useInviteSamRoomMutation,
  useLeaveSamRoomMutation,
  useSamActionMutation,
  useSitSamRoomMutation,
  useStartSamHandMutation,
  useXinSamMutation,
} from "@/slices/samApiSlice";

const { width: SW, height: SH } = Dimensions.get("window");

const SEAT_LAYOUT = [
  { position: "bottom", left: "50%", top: "82%" },
  { position: "left", left: "14%", top: "52%" },
  { position: "top", left: "50%", top: "22%" },
  { position: "right", left: "86%", top: "52%" },
];

export default function SamRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useSelector((s: any) => s.auth?.userInfo);
  const roomId = String(id || "");
  const insets = useSafeAreaInsets();

  const { data, refetch } = useGetSamRoomQuery(roomId, { skip: !roomId });
  const [sit] = useSitSamRoomMutation();
  const [leave] = useLeaveSamRoomMutation();
  const [start] = useStartSamHandMutation();
  const [sendChat] = useChatSamRoomMutation();
  const [act, { isLoading: acting }] = useSamActionMutation();
  const [invite, { isLoading: inviting }] = useInviteSamRoomMutation();
  const [xinSamMut] = useXinSamMutation();
  const [batSamMut] = useBatSamMutation();

  const socket = useSocket();
  const [chatOpen, setChatOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [chatText, setChatText] = useState("");
  const [selectedCards, setSelectedCards] = useState<string[]>([]);
  const [remainSec, setRemainSec] = useState(0);
  const [bubbles, setBubbles] = useState<Record<string, { text: string; at: number }>>({});
  const seenMsgAtRef = useRef(Date.now());
  const [nowTs, setNowTs] = useState(0);
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
    socket.emit("sam:room:subscribe", { roomId });
    const onUpdate = (p: any) => p?.roomId === roomId && refetch();
    const onChat = (p: any) => p?.roomId === roomId && refetch();
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

  useEffect(() => {
    const deadline = room?.stage === "xin_sam"
      ? room?.xinSamDeadlineAt
      : room?.turnDeadlineAt;
    if (!deadline) return setRemainSec(0);
    const tick = () => {
      const ms = new Date(deadline).getTime() - Date.now();
      setRemainSec(Math.max(0, Math.ceil(ms / 1000)));
    };
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [room?.turnDeadlineAt, room?.xinSamDeadlineAt, room?.stage]);

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

  // Animation khi combo hiện tại đổi (ai đó vừa đánh)
  const playCount = (room?.plays || []).length;
  useEffect(() => {
    LayoutAnimation.configureNext({
      duration: 320,
      create: { type: "easeOut", property: "opacity" },
      update: { type: "spring", springDamping: 0.7 },
    });
  }, [playCount]);

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
        playFx(action === "pass" ? "check" : "chip");
      } catch {}
    } catch (err: any) {
      Alert.alert("Không được", err?.data?.message || "Lỗi");
    }
  };
  const doXinSam = async () => {
    try {
      await xinSamMut(roomId).unwrap();
    } catch (err: any) {
      Alert.alert("Không được", err?.data?.message || "Lỗi");
    }
  };
  const doBatSam = async () => {
    try {
      await batSamMut(roomId).unwrap();
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
            🃏 Sâm Lốc · {room.name}
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

      {(room.stage === "playing" || room.stage === "xin_sam") && remainSec > 0 && (
        <View
          style={[
            styles.timerBar,
            { top: Math.max(58, insets.top + 50) },
          ]}
        >
          <View
            style={[
              styles.timerFill,
              {
                width: `${Math.min(100, (remainSec / (room.stage === "xin_sam" ? 10 : room.turnDurationSec || 30)) * 100)}%`,
                backgroundColor: remainSec < 5 ? "#EF4444" : "#FBBF24",
              },
            ]}
          />
          <Text style={styles.timerText}>
            {room.stage === "xin_sam" ? `Xin sâm · ${remainSec}s` : `${remainSec}s`}
          </Text>
        </View>
      )}

      {/* Xin Sâm / Bắt Sâm buttons overlay */}
      {room.stage === "xin_sam" && mySeat && (
        <View style={styles.xinSamBar}>
          {room.samClaimerIndex < 0 && !mySeat.hasClaimedSam && (
            <Pressable
              onPress={doXinSam}
              style={[styles.actionBtn, { backgroundColor: "#F59E0B" }]}
            >
              <Ionicons name="hand-right" size={16} color="#fff" />
              <Text style={styles.actionBtnText}>Xin Sâm</Text>
            </Pressable>
          )}
          {room.samClaimerIndex >= 0 &&
            room.samClaimerIndex !== mySeat.seatIndex &&
            room.samCatcherIndex < 0 && (
              <Pressable
                onPress={doBatSam}
                style={[styles.actionBtn, { backgroundColor: "#DC2626" }]}
              >
                <Ionicons name="flash" size={16} color="#fff" />
                <Text style={styles.actionBtnText}>Bắt Sâm</Text>
              </Pressable>
            )}
          {room.samClaimerIndex >= 0 && (
            <View style={styles.samStatusBox}>
              <Text style={styles.samStatusText}>
                {room.samClaimerIndex === mySeat.seatIndex
                  ? "Bạn đã xin sâm"
                  : `Ghế ${room.samClaimerIndex + 1} xin sâm`}
                {room.samCatcherIndex >= 0
                  ? ` · Ghế ${room.samCatcherIndex + 1} đã bắt`
                  : ""}
              </Text>
            </View>
          )}
        </View>
      )}

      <View style={styles.tableWrap}>
        <FeltOval>
          {!room.currentCombo && room.stage === "playing" && (
            <Text style={styles.centerHint}>
              Chưa có bài — người đến lượt được đánh tự do
            </Text>
          )}
        </FeltOval>
      </View>

      {/* Combo hiện tại — hiện trước mặt seat vừa đánh */}
      {room.currentCombo && (() => {
        const seatIndexToRotated = new Map<number, number>();
        rotatedSeats.forEach((s: any, idx: number) => {
          if (s) seatIndexToRotated.set(s.seatIndex, idx);
        });
        const rIdx = seatIndexToRotated.get(room.currentCombo.fromSeat) ?? 0;
        const seatPct = [
          { x: 50, y: 60 },
          { x: 26, y: 50 },
          { x: 50, y: 38 },
          { x: 74, y: 50 },
        ];
        const target = seatPct[rIdx] || { x: 50, y: 50 };
        const cards = room.currentCombo.cards || [];
        return (
          <View
            style={{
              position: "absolute",
              left: `${target.x}%`,
              top: `${target.y}%`,
              transform: [
                { translateX: -((cards.length * 16) / 2) },
                { translateY: -30 },
              ],
              zIndex: 4,
              alignItems: "center",
            }}
          >
            <Text style={styles.centerComboLabel}>
              {room.currentCombo.type?.toUpperCase()}
            </Text>
            <View style={{ flexDirection: "row", marginTop: 4 }}>
              {cards.map((c: string, i: number) => (
                <View key={i} style={{ marginLeft: i > 0 ? -18 : 0 }}>
                  <CardPro card={c} size={44} />
                </View>
              ))}
            </View>
          </View>
        );
      })()}

      {rotatedSeats.map((seat: any, i: number) => {
        if (!seat) return null;
        const layout = SEAT_LAYOUT[i];
        const isMine =
          seat.user &&
          String(seat.user._id || seat.user) === String(me?._id);
        const isTurn =
          room.activeIndex === seat.seatIndex && room.stage === "playing";
        const passed = (room.passedSeats || []).includes(seat.seatIndex);
        const empty = !seat.user;
        // Bỏ render frame cho hero (bottom) khi đã ngồi — tránh che hand.
        if (i === 0 && !empty && isMine) return null;
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
              <View style={{ alignItems: "center", position: "relative" }}>
                <SeatFrame
                  user={seat.user}
                  chips={seat.chips}
                  isMine={!!isMine}
                  isTurn={isTurn}
                  cardCount={seat.cardCount || 0}
                />
                {(() => {
                  const uid = String(seat.user._id || seat.user);
                  const bub = bubbles[uid];
                  if (!bub) return null;
                  return <SpeechBubble key={bub.at} text={bub.text} />;
                })()}
                {passed && (
                  <View style={styles.passBadge}>
                    <Text style={styles.passBadgeText}>PASS</Text>
                  </View>
                )}
                {seat.hasFinished && (
                  <View style={styles.finishedBadge}>
                    <Text style={styles.finishedBadgeText}>
                      #{seat.finishOrder}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        );
      })}

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
      {/* Hero info bar (chip + turn indicator) — bên phải hand */}
      {mySeat && (
        <View
          style={[
            styles.heroInfo,
            room.activeIndex === mySeat.seatIndex && room.stage === "playing" && styles.heroInfoTurn,
          ]}
        >
          <Text style={styles.heroInfoText}>
            💰 {mySeat.chips || 0}
          </Text>
          {room.activeIndex === mySeat.seatIndex && room.stage === "playing" && (
            <Text style={styles.heroTurnText}>Lượt bạn</Text>
          )}
        </View>
      )}

      {isMyTurn && (
        <View style={styles.actionBar}>
          {selectedCards.length > 0 && (
            <ActionBtn
              label={`Đánh (${selectedCards.length})`}
              icon="send"
              color="#7C3AED"
              onPress={() => doAction("play", { cards: selectedCards })}
              disabled={acting}
            />
          )}
          {room.currentCombo && (
            <ActionBtn
              label="Pass"
              icon="close-circle-outline"
              color="#64748B"
              onPress={() => doAction("pass")}
              disabled={acting}
            />
          )}
        </View>
      )}

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

      <InviteFriendModal
        visible={inviteOpen}
        onClose={() => setInviteOpen(false)}
        loading={inviting}
        color="#7C3AED"
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
                <View key={String(m._id || m.at)} style={styles.chatMsg}>
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
    borderColor: "rgba(196,181,253,0.4)",
  },
  roomTitle: { color: "#fff", fontWeight: "800", fontSize: 14 },
  roomSub: {
    color: "#C4B5FD",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 1,
  },
  startBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#7C3AED",
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
  timerFill: { ...StyleSheet.absoluteFillObject },
  timerText: {
    color: "#0F172A",
    fontWeight: "900",
    fontSize: 11,
    textAlign: "center",
    lineHeight: 18,
    zIndex: 1,
  },
  tableWrap: { flex: 1, marginTop: 40, marginBottom: 90 },
  centerCombo: {
    alignItems: "center",
    gap: 6,
  },
  centerComboLabel: {
    color: "#FBBF24",
    fontWeight: "900",
    fontSize: 11,
    letterSpacing: 1,
    textShadowColor: "#000",
    textShadowRadius: 2,
  },
  centerHint: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
    fontStyle: "italic",
  },
  handStripWrap: {
    position: "absolute",
    left: 60,
    right: 90,
    bottom: 6,
    paddingVertical: 6,
  },
  heroInfo: {
    position: "absolute",
    right: 70,
    bottom: 82,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#FBBF24",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    zIndex: 15,
  },
  heroInfoTurn: {
    borderColor: "#FBBF24",
    backgroundColor: "rgba(245,158,11,0.85)",
  },
  heroInfoText: {
    color: "#FBBF24",
    fontWeight: "800",
    fontSize: 12,
  },
  heroTurnText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 11,
    letterSpacing: 0.5,
  },
  actionBar: {
    position: "absolute",
    top: 90,
    right: 70,
    flexDirection: "column",
    gap: 8,
    zIndex: 20,
  },
  xinSamBar: {
    position: "absolute",
    top: "38%",
    left: "20%",
    right: "20%",
    alignItems: "center",
    gap: 8,
    zIndex: 25,
  },
  samStatusBox: {
    backgroundColor: "rgba(0,0,0,0.75)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#F59E0B",
  },
  samStatusText: {
    color: "#FBBF24",
    fontSize: 12,
    fontWeight: "800",
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
  passBadge: {
    marginTop: 2,
    backgroundColor: "#64748B",
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  passBadgeText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 9,
    letterSpacing: 0.5,
  },
  finishedBadge: {
    marginTop: 2,
    backgroundColor: "#F59E0B",
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  finishedBadgeText: {
    color: "#fff",
    fontWeight: "900",
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
  showdownName: { color: "#fff", fontSize: 12, fontWeight: "600" },
  showdownAmt: { fontSize: 12, fontWeight: "900" },
  newHandBtn: {
    marginTop: 12,
    backgroundColor: "#7C3AED",
    padding: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  newHandBtnText: { color: "#fff", fontWeight: "900", fontSize: 13 },
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
  chatMsgName: { fontWeight: "800", color: "#0F172A" },
  chatMsgText: { color: "#334155", flex: 1 },
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
    backgroundColor: "#7C3AED",
    alignItems: "center",
    justifyContent: "center",
  },
});
