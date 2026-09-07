// Caro lobby — list rooms + create.
import {
  Ionicons } from "@expo/vector-icons";
import { Stack,
  router } from "expo-router";
import React, { useEffect,
  useState, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";
import { TextInput } from "@/components/ui/i18nTextInput";
import { Text } from "@/components/ui/i18nText";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSelector } from "react-redux";

import {
  useCreateCaroRoomMutation,
  useListCaroRoomsQuery,
} from "@/slices/caroApiSlice";
import { useSocket } from "@/context/SocketContext";
import { RoomListItem } from "@/components/games/RoomListItem";
import { useThemeTokens, type ThemeTokens } from "@/hooks/useThemeTokens";

export default function CaroLobbyScreen() {
  const C = useThemeTokens();
  const styles = useMemo(() => mk_styles(C), [C]);
  const me = useSelector((s: any) => s.auth?.userInfo);
  const { data, isFetching, refetch } = useListCaroRoomsQuery(undefined);
  const [createRoom, { isLoading: creating }] = useCreateCaroRoomMutation();

  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [stake, setStake] = useState("100");
  const [buyIn, setBuyIn] = useState("1000");
  const [boardSize, setBoardSize] = useState("15");

  const items = (data as any)?.items || [];
  const socket = useSocket();
  useEffect(() => {
    if (!socket) return;
    socket.emit("caro:lobby:subscribe");
    const onUpdate = () => refetch();
    socket.on("caro:lobby:updated", onUpdate);
    return () => {
      socket.off("caro:lobby:updated", onUpdate);
      socket.emit("caro:lobby:unsubscribe");
    };
  }, [socket, refetch]);

  const doCreate = async () => {
    if (!me) {
      Alert.alert("Cần đăng nhập");
      return;
    }
    try {
      const res: any = await createRoom({
        name: name.trim() || undefined,
        stake: Number(stake),
        buyIn: Number(buyIn),
        boardSize: Number(boardSize),
      }).unwrap();
      setModalOpen(false);
      const rid = res?.room?._id;
      if (rid) router.push(`/caro/${rid}` as any);
    } catch (err: any) {
      Alert.alert("Lỗi", err?.data?.message || "Không tạo được bàn");
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <Stack.Screen options={{ title: "Caro · Lobby" }} />

      <View style={styles.header}>
        <Text style={styles.title}>⚔️ Bàn Caro</Text>
        {me && (
          <Pressable
            onPress={() => setModalOpen(true)}
            style={styles.createBtn}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.createBtnText}>Tạo bàn</Text>
          </Pressable>
        )}
      </View>

      <FlatList
        data={items}
        keyExtractor={(r: any) => String(r._id)}
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={refetch} />
        }
        contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
        ListEmptyComponent={
          !isFetching ? (
            <View style={{ padding: 40, alignItems: "center" }}>
              <Text style={{ color: C.muted, textAlign: "center" }}>
                Chưa có bàn nào. Tạo bàn đầu tiên và mời bạn bè cùng chơi!
              </Text>
            </View>
          ) : (
            <ActivityIndicator style={{ marginTop: 20 }} color={C.accent} />
          )
        }
        renderItem={({ item }) => (
          <RoomListItem
            room={item}
            onPress={() => router.push(`/caro/${item._id}` as any)}
            accentColor="#EF4444"
            stagePillLabel={item.stage === "waiting" ? "Chờ" : `Ván ${item.handNumber}`}
            stagePillActive={item.stage === "playing"}
            meta={
              <>
                <Text style={styles.metaTxt}>🎯 {item.boardSize}×{item.boardSize}</Text>
                <Text style={styles.metaTxt}>💰 Cược {item.stake}</Text>
                <Text style={styles.metaTxt}>👥 {item.seatsTaken}/{item.maxSeats}</Text>
              </>
            }
          />
        )}
      />

      <Modal
        visible={modalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={{ flex: 1 }} onPress={() => setModalOpen(false)} />
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <View style={styles.modalSheet}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Tạo bàn Caro</Text>
              <TextInput
                placeholderTextColor={C.muted}
                placeholder="Tên bàn (tùy chọn)"
                value={name}
                onChangeText={setName}
                style={styles.input}
                maxLength={60}
              />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Cỡ bàn</Text>
                  <TextInput
                    value={boardSize}
                    onChangeText={setBoardSize}
                    keyboardType="number-pad"
                    style={styles.input}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Cược</Text>
                  <TextInput
                    value={stake}
                    onChangeText={setStake}
                    keyboardType="number-pad"
                    style={styles.input}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Buy-in</Text>
                  <TextInput
                    value={buyIn}
                    onChangeText={setBuyIn}
                    keyboardType="number-pad"
                    style={styles.input}
                  />
                </View>
              </View>
              <Text style={styles.hint}>
                2 người, X đi trước. 5 liên tiếp (ngang/dọc/chéo) thắng.
              </Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                <Pressable
                  onPress={() => setModalOpen(false)}
                  style={[styles.btn, { backgroundColor: C.field }]}
                >
                  <Text style={{ color: C.text, fontWeight: "700" }}>Huỷ</Text>
                </Pressable>
                <Pressable
                  onPress={doCreate}
                  disabled={creating}
                  style={[
                    styles.btn,
                    { backgroundColor: "#EF4444", flex: 1 },
                    creating && { opacity: 0.5 },
                  ]}
                >
                  <Text style={{ color: "#fff", fontWeight: "800" }}>
                    {creating ? "Đang tạo…" : "Tạo bàn"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const mk_styles = (C: ThemeTokens) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: C.card,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  title: { flex: 1, fontSize: 18, fontWeight: "800", color: C.text },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EF4444",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  createBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  card: {
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 6,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  roomName: { flex: 1, fontSize: 15, fontWeight: "800", color: C.text },
  stagePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: C.field,
  },
  cardMeta: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  metaTxt: { fontSize: 12, color: C.sub },
  modalBackdrop: {
    flex: 1,
    backgroundColor: C.overlay,
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    gap: 8,
  },
  modalHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.line,
    marginBottom: 8,
  },
  modalTitle: { fontSize: 17, fontWeight: "800", color: C.text },
  label: { fontSize: 12, color: C.sub, marginBottom: 4 },
  input: {
    backgroundColor: C.field,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: C.text,
  },
  hint: { fontSize: 11, color: C.muted, marginTop: 4 },
  btn: {
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
});
