// MLP dual detail — score sub-matches + DreamBreaker + check-in.
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
  useGetMlpDualQuery,
  useSyncMlpSubMatchMutation,
  useStartMlpDreamBreakerMutation,
  useScoreMlpDbPointMutation,
  useUndoMlpDbPointMutation,
  useCheckInMlpDualMutation,
} from "@/slices/mlpApiSlice";
import { useSocket } from "@/context/SocketContext";

export default function MlpDualDetailScreen() {
  const { dualId } = useLocalSearchParams<{ dualId: string }>();
  const me = useSelector((s: any) => s.auth?.userInfo);
  const socket = useSocket();
  const { data: dual, isLoading, refetch } = useGetMlpDualQuery(String(dualId), {
    skip: !dualId,
  });
  const [syncSub] = useSyncMlpSubMatchMutation();
  const [startDb] = useStartMlpDreamBreakerMutation();
  const [pointDb] = useScoreMlpDbPointMutation();
  const [undoDb] = useUndoMlpDbPointMutation();
  const [checkIn] = useCheckInMlpDualMutation();

  // Realtime subscribe
  useEffect(() => {
    if (!socket || !dualId) return;
    const id = String(dualId);
    const sub = () => socket.emit("mlp:dual:subscribe", { dualId: id });
    sub();
    socket.on("connect", sub);
    const bump = () => refetch();
    socket.on("mlp:sub:score", bump);
    socket.on("mlp:db:score", bump);
    socket.on("mlp:dual:updated", bump);
    socket.on("mlp:dual:finished", bump);
    return () => {
      try {
        socket.emit("mlp:dual:unsubscribe", { dualId: id });
      } catch {}
      socket.off("connect", sub);
      socket.off("mlp:sub:score", bump);
      socket.off("mlp:db:score", bump);
      socket.off("mlp:dual:updated", bump);
      socket.off("mlp:dual:finished", bump);
    };
  }, [socket, dualId, refetch]);

  if (isLoading || !dual) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  const d: any = dual;
  const cfg = (d as any).tournament?.mlpConfig || {};

  const doCheckIn = async (side: "A" | "B") => {
    try {
      await checkIn({ dualId: String(dualId), side }).unwrap();
    } catch (err: any) {
      Alert.alert("Lỗi", err?.data?.message || "Không check-in được");
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <Stack.Screen options={{ title: "MLP · Chi tiết dual" }} />
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
        {/* Team header */}
        <View style={styles.teamsRow}>
          <TeamCard
            team={d.teamA}
            score={d.slotWinsA}
            winner={d.winner === "A"}
            checkedIn={!!d.checkInA?.checkedAt}
            onCheckIn={() => doCheckIn("A")}
          />
          <Text style={styles.vs}>VS</Text>
          <TeamCard
            team={d.teamB}
            score={d.slotWinsB}
            winner={d.winner === "B"}
            checkedIn={!!d.checkInB?.checkedAt}
            onCheckIn={() => doCheckIn("B")}
          />
        </View>

        <Text style={styles.status}>
          Trạng thái:{" "}
          {d.status === "finished"
            ? d.winner === "A"
              ? `${d.teamA?.name} thắng`
              : d.winner === "B"
                ? `${d.teamB?.name} thắng`
                : "Kết thúc hoà"
            : d.status === "tie_break"
              ? "Vào DreamBreaker"
              : d.status === "live"
                ? "Đang diễn ra"
                : "Chưa bắt đầu"}
        </Text>

        {/* Sub-matches */}
        <Text style={styles.sectionTitle}>
          Sub-matches ({d.subMatches?.length || 0})
        </Text>
        {(d.subMatches || []).map((sub: any) => (
          <SubMatchCard
            key={sub._id}
            sub={sub}
            slot={(cfg.slots || []).find((s: any) => s.key === sub.slotKey)}
            onSync={async (scoreA, scoreB, status) => {
              try {
                await syncSub({
                  dualId: String(dualId),
                  subId: String(sub._id),
                  scoreA,
                  scoreB,
                  status,
                }).unwrap();
              } catch (err: any) {
                Alert.alert("Lỗi", err?.data?.message || "Không lưu được");
              }
            }}
          />
        ))}

        {/* DreamBreaker */}
        {d.status === "tie_break" && !d.dreamBreaker?.triggered && (
          <View style={styles.dbBox}>
            <Text style={styles.dbTitle}>DreamBreaker chưa bắt đầu</Text>
            <Text style={styles.dbSub}>
              BTC vào web quản lý để chọn lineup A/B và bấm Start.
            </Text>
          </View>
        )}
        {d.dreamBreaker?.triggered && (
          <View style={styles.dbBox}>
            <Text style={styles.dbTitle}>🏆 DreamBreaker</Text>
            <View style={styles.dbScore}>
              <Text style={styles.dbBigScore}>{d.dreamBreaker.scoreA}</Text>
              <Text style={styles.dbSep}>—</Text>
              <Text style={styles.dbBigScore}>{d.dreamBreaker.scoreB}</Text>
            </View>
            {!d.dreamBreaker.winner && (
              <View style={styles.dbBtnsRow}>
                <Pressable
                  style={[styles.dbBtn, { backgroundColor: "#3B82F6" }]}
                  onPress={async () => {
                    try {
                      await pointDb({
                        dualId: String(dualId),
                        side: "A",
                      }).unwrap();
                    } catch {}
                  }}
                >
                  <Text style={styles.dbBtnText}>+1 Team A</Text>
                </Pressable>
                <Pressable
                  style={[styles.dbBtn, { backgroundColor: "#EF4444" }]}
                  onPress={async () => {
                    try {
                      await pointDb({
                        dualId: String(dualId),
                        side: "B",
                      }).unwrap();
                    } catch {}
                  }}
                >
                  <Text style={styles.dbBtnText}>+1 Team B</Text>
                </Pressable>
                <Pressable
                  style={[styles.dbBtn, { backgroundColor: "#64748B" }]}
                  onPress={async () => {
                    try {
                      await undoDb({ dualId: String(dualId) }).unwrap();
                    } catch {}
                  }}
                >
                  <Ionicons name="arrow-undo" size={16} color="#fff" />
                </Pressable>
              </View>
            )}
            {d.dreamBreaker.winner && (
              <Text style={styles.dbWinner}>
                Winner: Team {d.dreamBreaker.winner}
              </Text>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function TeamCard({
  team,
  score,
  winner,
  checkedIn,
  onCheckIn,
}: {
  team: any;
  score: number;
  winner: boolean;
  checkedIn: boolean;
  onCheckIn: () => void;
}) {
  return (
    <View
      style={[styles.teamCard, winner && { backgroundColor: "#F0FDF4", borderColor: "#10B981" }]}
    >
      <Text style={styles.teamName} numberOfLines={2}>
        {team?.name || "-"}
      </Text>
      <Text style={styles.teamScore}>{score}</Text>
      <Pressable
        onPress={onCheckIn}
        style={[
          styles.checkInBtn,
          checkedIn && { backgroundColor: "#10B981" },
        ]}
      >
        <Ionicons
          name={checkedIn ? "checkmark-circle" : "log-in-outline"}
          size={14}
          color={checkedIn ? "#fff" : "#0066FF"}
        />
        <Text
          style={[
            styles.checkInText,
            checkedIn && { color: "#fff" },
          ]}
        >
          {checkedIn ? "Đã check-in" : "Check-in"}
        </Text>
      </Pressable>
    </View>
  );
}

function SubMatchCard({
  sub,
  slot,
  onSync,
}: {
  sub: any;
  slot: any;
  onSync: (scoreA: number, scoreB: number, status: string) => Promise<void>;
}) {
  const [sa, setSa] = useState(String(sub.result?.scoreA ?? 0));
  const [sb, setSb] = useState(String(sub.result?.scoreB ?? 0));
  const [status, setStatus] = useState(sub.result?.status || "scheduled");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setSa(String(sub.result?.scoreA ?? 0));
    setSb(String(sub.result?.scoreB ?? 0));
    setStatus(sub.result?.status || "scheduled");
  }, [sub._id, sub.result?.scoreA, sub.result?.scoreB, sub.result?.status]);

  const save = async () => {
    setSaving(true);
    await onSync(
      Math.max(0, Number(sa) || 0),
      Math.max(0, Number(sb) || 0),
      status
    );
    setSaving(false);
  };

  return (
    <View style={styles.subCard}>
      <View style={styles.subHeader}>
        <Text style={styles.subKey}>{sub.slotKey}</Text>
        {slot && (
          <Text style={styles.subMeta}>
            {slot.label} · {slot.matchType} · {slot.genderRule}
          </Text>
        )}
      </View>
      <View style={styles.subPlayers}>
        <PlayerNames list={sub.playersA} />
        <Text style={{ marginHorizontal: 8, color: "#94A3B8" }}>vs</Text>
        <PlayerNames list={sub.playersB} />
      </View>
      <View style={styles.scoreRow}>
        <TextInput
          value={sa}
          onChangeText={setSa}
          keyboardType="number-pad"
          style={styles.scoreInput}
        />
        <Text style={{ fontSize: 20, color: "#94A3B8" }}>—</Text>
        <TextInput
          value={sb}
          onChangeText={setSb}
          keyboardType="number-pad"
          style={styles.scoreInput}
        />
        <View style={styles.statusPicker}>
          <StatusChip label="Chưa" v="scheduled" cur={status} on={setStatus} />
          <StatusChip label="LIVE" v="live" cur={status} on={setStatus} />
          <StatusChip label="Xong" v="finished" cur={status} on={setStatus} />
        </View>
      </View>
      <Pressable
        onPress={save}
        disabled={saving}
        style={[styles.saveBtn, saving && { opacity: 0.5 }]}
      >
        <Ionicons name="save" size={14} color="#fff" />
        <Text style={styles.saveBtnText}>
          {saving ? "Đang lưu…" : "Lưu"}
        </Text>
      </Pressable>
    </View>
  );
}

function PlayerNames({ list }: { list: any[] }) {
  if (!list?.length)
    return <Text style={{ color: "#94A3B8", fontSize: 12 }}>Chưa gán</Text>;
  return (
    <Text style={{ flex: 1, fontSize: 12, color: "#0F172A" }} numberOfLines={2}>
      {list.map((p: any) => p.nickname || p.name).join(" & ")}
    </Text>
  );
}

function StatusChip({
  label,
  v,
  cur,
  on,
}: {
  label: string;
  v: string;
  cur: string;
  on: (v: string) => void;
}) {
  const active = cur === v;
  return (
    <Pressable
      onPress={() => on(v)}
      style={[styles.chip, active && { backgroundColor: "#0066FF" }]}
    >
      <Text style={{ fontSize: 10, color: active ? "#fff" : "#0066FF", fontWeight: "700" }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  teamsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    marginBottom: 12,
    gap: 8,
  },
  teamCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    gap: 6,
  },
  teamName: { fontSize: 14, fontWeight: "800", color: "#0F172A", textAlign: "center" },
  teamScore: { fontSize: 36, fontWeight: "900", color: "#0F172A" },
  vs: { alignSelf: "center", fontWeight: "800", color: "#64748B" },
  checkInBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#EFF6FF",
  },
  checkInText: { fontSize: 11, color: "#0066FF", fontWeight: "700" },
  status: {
    textAlign: "center",
    fontSize: 13,
    color: "#64748B",
    marginBottom: 16,
    fontStyle: "italic",
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 8,
  },
  subCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  subHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  subKey: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0066FF",
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  subMeta: { flex: 1, fontSize: 11, color: "#64748B" },
  subPlayers: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  scoreInput: {
    width: 60,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 6,
    padding: 8,
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
    color: "#0F172A",
  },
  statusPicker: { flexDirection: "row", gap: 4, marginLeft: "auto" },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#EFF6FF",
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#0066FF",
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 10,
  },
  saveBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  dbBox: {
    backgroundColor: "#FEF3C7",
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#F59E0B",
  },
  dbTitle: { fontSize: 16, fontWeight: "900", color: "#92400E", textAlign: "center" },
  dbSub: { fontSize: 12, color: "#78350F", textAlign: "center", marginTop: 6 },
  dbScore: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
    marginVertical: 12,
  },
  dbBigScore: { fontSize: 48, fontWeight: "900", color: "#92400E" },
  dbSep: { fontSize: 24, color: "#B45309" },
  dbBtnsRow: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 8,
  },
  dbBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    minWidth: 60,
    alignItems: "center",
  },
  dbBtnText: { color: "#fff", fontWeight: "800" },
  dbWinner: {
    fontSize: 16,
    fontWeight: "800",
    color: "#065F46",
    textAlign: "center",
    marginTop: 10,
  },
});
