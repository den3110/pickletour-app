// MLP dual detail — score sub-matches + DreamBreaker + check-in.
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
  const dbCfg = cfg.dreamBreaker || {};
  const dbPointsToWin = Number(dbCfg.pointsToWin) || 21;
  const dbRotate = Number(dbCfg.rotationEveryPoints) || 4;

  const [dbStartOpen, setDbStartOpen] = useState(false);

  const currentPlayerAId = useMemo(() => {
    const db = d?.dreamBreaker;
    const lineup = Array.isArray(db?.lineupA) ? db.lineupA : [];
    if (!lineup.length) return null;
    const idx =
      Math.floor(Math.max(0, Number(db?.scoreA || 0)) / Math.max(1, dbRotate)) %
      lineup.length;
    return lineup[idx];
  }, [d?.dreamBreaker?.scoreA, d?.dreamBreaker?.lineupA, dbRotate]);
  const currentPlayerBId = useMemo(() => {
    const db = d?.dreamBreaker;
    const lineup = Array.isArray(db?.lineupB) ? db.lineupB : [];
    if (!lineup.length) return null;
    const idx =
      Math.floor(Math.max(0, Number(db?.scoreB || 0)) / Math.max(1, dbRotate)) %
      lineup.length;
    return lineup[idx];
  }, [d?.dreamBreaker?.scoreB, d?.dreamBreaker?.lineupB, dbRotate]);

  const findPlayerObj = (arr: any[], id: any) => {
    if (!Array.isArray(arr) || !id) return null;
    const target = String(id?._id ?? id);
    return arr.find((p) => String(p?._id ?? p) === target) || null;
  };
  const currentPlayerA = findPlayerObj(d?.teamA?.players, currentPlayerAId);
  const currentPlayerB = findPlayerObj(d?.teamB?.players, currentPlayerBId);

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
            <Text style={styles.dbTitle}>🏆 DreamBreaker</Text>
            <Text style={styles.dbSub}>
              Hoà slot — bắt đầu ván tie-break 1v1 luân phiên tới{" "}
              {dbPointsToWin} điểm. Rotate mỗi {dbRotate} điểm.
            </Text>
            <Pressable
              style={[styles.dbBtn, styles.dbStartBtn]}
              onPress={() => setDbStartOpen(true)}
            >
              <Ionicons name="play" size={16} color="#fff" />
              <Text style={styles.dbBtnText}>Chọn lineup + Start</Text>
            </Pressable>
          </View>
        )}
        {d.dreamBreaker?.triggered && (
          <View style={styles.dbBox}>
            <Text style={styles.dbTitle}>
              🏆 DreamBreaker · Đấu tới {dbPointsToWin}
            </Text>
            <View style={styles.dbScore}>
              <Text style={styles.dbBigScore}>{d.dreamBreaker.scoreA}</Text>
              <Text style={styles.dbSep}>—</Text>
              <Text style={styles.dbBigScore}>{d.dreamBreaker.scoreB}</Text>
            </View>

            {/* Current server / rotation info */}
            {!d.dreamBreaker.winner && (
              <View style={styles.dbCurrentRow}>
                <CurrentPlayerCard
                  label={d.teamA?.name || "Team A"}
                  player={currentPlayerA}
                  currentScore={d.dreamBreaker.scoreA}
                  rotate={dbRotate}
                  lineupSize={d.dreamBreaker.lineupA?.length || 0}
                />
                <CurrentPlayerCard
                  label={d.teamB?.name || "Team B"}
                  player={currentPlayerB}
                  currentScore={d.dreamBreaker.scoreB}
                  rotate={dbRotate}
                  lineupSize={d.dreamBreaker.lineupB?.length || 0}
                />
              </View>
            )}

            {!d.dreamBreaker.winner && (
              <View style={styles.dbBtnsRow}>
                <Pressable
                  style={[styles.dbBtn, { backgroundColor: "#3B82F6", flex: 1 }]}
                  onPress={async () => {
                    try {
                      await pointDb({
                        dualId: String(dualId),
                        side: "A",
                      }).unwrap();
                    } catch (err: any) {
                      Alert.alert("Lỗi", err?.data?.message || "Không cộng điểm được");
                    }
                  }}
                >
                  <Text style={styles.dbBtnText}>+1 {d.teamA?.name || "A"}</Text>
                </Pressable>
                <Pressable
                  style={[styles.dbBtn, { backgroundColor: "#64748B" }]}
                  onPress={async () => {
                    try {
                      await undoDb({ dualId: String(dualId) }).unwrap();
                    } catch (err: any) {
                      Alert.alert("Lỗi", err?.data?.message || "Không undo được");
                    }
                  }}
                >
                  <Ionicons name="arrow-undo" size={16} color="#fff" />
                </Pressable>
                <Pressable
                  style={[styles.dbBtn, { backgroundColor: "#EF4444", flex: 1 }]}
                  onPress={async () => {
                    try {
                      await pointDb({
                        dualId: String(dualId),
                        side: "B",
                      }).unwrap();
                    } catch (err: any) {
                      Alert.alert("Lỗi", err?.data?.message || "Không cộng điểm được");
                    }
                  }}
                >
                  <Text style={styles.dbBtnText}>+1 {d.teamB?.name || "B"}</Text>
                </Pressable>
              </View>
            )}
            {d.dreamBreaker.winner && (
              <Text style={styles.dbWinner}>
                🏆 Winner: {d.dreamBreaker.winner === "A" ? d.teamA?.name : d.teamB?.name}
              </Text>
            )}
          </View>
        )}
      </ScrollView>

      <StartDreamBreakerModal
        open={dbStartOpen}
        onClose={() => setDbStartOpen(false)}
        teamA={d.teamA}
        teamB={d.teamB}
        pointsToWin={dbPointsToWin}
        rotate={dbRotate}
        onSubmit={async (lineupA, lineupB) => {
          try {
            await startDb({
              dualId: String(dualId),
              lineupA,
              lineupB,
            }).unwrap();
            setDbStartOpen(false);
          } catch (err: any) {
            Alert.alert("Lỗi", err?.data?.message || "Không start được");
          }
        }}
      />
    </SafeAreaView>
  );
}

function CurrentPlayerCard({
  label,
  player,
  currentScore,
  rotate,
  lineupSize,
}: {
  label: string;
  player: any;
  currentScore: number;
  rotate: number;
  lineupSize: number;
}) {
  const rotationIdx = lineupSize
    ? Math.floor(Math.max(0, currentScore) / Math.max(1, rotate)) % lineupSize
    : 0;
  const pointsInBlock = currentScore % Math.max(1, rotate);
  const pointsUntilRotate = Math.max(0, rotate - pointsInBlock);
  return (
    <View style={styles.dbPlayerCard}>
      <Text style={styles.dbPlayerTeam} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.dbPlayerName} numberOfLines={1}>
        {player?.nickname || player?.name || "—"}
      </Text>
      <Text style={styles.dbPlayerRotate}>
        Người #{rotationIdx + 1}/{lineupSize} · Còn {pointsUntilRotate}đ nữa xoay
      </Text>
    </View>
  );
}

function StartDreamBreakerModal({
  open,
  onClose,
  teamA,
  teamB,
  pointsToWin,
  rotate,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  teamA: any;
  teamB: any;
  pointsToWin: number;
  rotate: number;
  onSubmit: (lineupA: string[], lineupB: string[]) => Promise<void>;
}) {
  const rosterA = Array.isArray(teamA?.players) ? teamA.players : [];
  const rosterB = Array.isArray(teamB?.players) ? teamB.players : [];
  const [lineupA, setLineupA] = useState<string[]>([]);
  const [lineupB, setLineupB] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    if (open) {
      setLineupA([]);
      setLineupB([]);
    }
  }, [open]);

  const toggleA = (id: string) => {
    setLineupA((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };
  const toggleB = (id: string) => {
    setLineupB((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };
  const canSubmit = lineupA.length > 0 && lineupB.length > 0 && !submitting;
  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(lineupA, lineupB);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={open}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.mdBackdrop}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={styles.mdSheet}>
          <View style={styles.mdHeader}>
            <Text style={styles.mdTitle}>🏆 Start DreamBreaker</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color="#0F172A" />
            </Pressable>
          </View>
          <Text style={styles.mdHint}>
            Đấu 1v1 tới {pointsToWin} điểm · Xoay VĐV mỗi {rotate} điểm ·
            Chọn thứ tự luân phiên cho cả 2 team.
          </Text>
          <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ padding: 12 }}>
            <LineupPicker
              label={teamA?.name || "Team A"}
              roster={rosterA}
              lineup={lineupA}
              onToggle={toggleA}
              color="#3B82F6"
            />
            <View style={{ height: 16 }} />
            <LineupPicker
              label={teamB?.name || "Team B"}
              roster={rosterB}
              lineup={lineupB}
              onToggle={toggleB}
              color="#EF4444"
            />
          </ScrollView>
          <Pressable
            onPress={handleSubmit}
            disabled={!canSubmit}
            style={[
              styles.mdSubmit,
              !canSubmit && { opacity: 0.4 },
            ]}
          >
            <Ionicons name="play" size={16} color="#fff" />
            <Text style={styles.mdSubmitText}>
              {submitting
                ? "Đang start…"
                : `Start (${lineupA.length} vs ${lineupB.length})`}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function LineupPicker({
  label,
  roster,
  lineup,
  onToggle,
  color,
}: {
  label: string;
  roster: any[];
  lineup: string[];
  onToggle: (id: string) => void;
  color: string;
}) {
  return (
    <View>
      <Text style={[styles.mdSectionLabel, { color }]}>
        {label} · Đã chọn {lineup.length}
      </Text>
      {roster.length === 0 ? (
        <Text style={styles.mdEmpty}>Team chưa có roster</Text>
      ) : (
        roster.map((p: any) => {
          const id = String(p?._id ?? p);
          const orderIdx = lineup.indexOf(id);
          const isSelected = orderIdx >= 0;
          return (
            <Pressable
              key={id}
              onPress={() => onToggle(id)}
              style={[
                styles.mdRosterRow,
                isSelected && { backgroundColor: color + "18", borderColor: color },
              ]}
            >
              <View
                style={[
                  styles.mdRosterCheck,
                  isSelected && { backgroundColor: color, borderColor: color },
                ]}
              >
                {isSelected ? (
                  <Text style={{ color: "#fff", fontWeight: "900", fontSize: 12 }}>
                    {orderIdx + 1}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.mdRosterName} numberOfLines={1}>
                {p.nickname || p.name || "VĐV"}
              </Text>
              {!!p.gender && (
                <Text style={styles.mdRosterMeta}>
                  {p.gender === "female" ? "♀" : p.gender === "male" ? "♂" : ""}
                </Text>
              )}
            </Pressable>
          );
        })
      )}
    </View>
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
  dbStartBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#F59E0B",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 12,
    alignSelf: "center",
  },
  dbCurrentRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 6,
    marginBottom: 12,
  },
  dbPlayerCard: {
    flex: 1,
    backgroundColor: "#FFFBEB",
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: "#FCD34D",
  },
  dbPlayerTeam: {
    fontSize: 10,
    color: "#B45309",
    fontWeight: "700",
    marginBottom: 2,
  },
  dbPlayerName: {
    fontSize: 15,
    color: "#78350F",
    fontWeight: "800",
  },
  dbPlayerRotate: {
    fontSize: 10,
    color: "#92400E",
    marginTop: 3,
  },
  mdBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  mdSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "85%",
  },
  mdHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  mdTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0F172A",
  },
  mdHint: {
    fontSize: 12,
    color: "#64748B",
    paddingHorizontal: 16,
    paddingTop: 8,
    lineHeight: 18,
  },
  mdSectionLabel: {
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 8,
  },
  mdEmpty: {
    fontSize: 12,
    color: "#94A3B8",
    fontStyle: "italic",
    padding: 12,
  },
  mdRosterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "transparent",
  },
  mdRosterCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
  },
  mdRosterName: {
    flex: 1,
    fontSize: 14,
    color: "#0F172A",
    fontWeight: "600",
  },
  mdRosterMeta: {
    fontSize: 14,
    color: "#64748B",
    marginLeft: 6,
  },
  mdSubmit: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#10B981",
    padding: 14,
    margin: 12,
    borderRadius: 12,
  },
  mdSubmitText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 14,
  },
});
