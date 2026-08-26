// components/clubs/ClubMatchesRN.tsx
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
} from "react-native";
import { useSelector } from "react-redux";
import dayjs from "dayjs";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Image as ExpoImage } from "expo-image";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Section, EmptyState } from "./ui";
import { normalizeUrl } from "@/utils/normalizeUri";
import {
  useListMembersQuery,
  useListMatchesQuery,
  useCreateMatchMutation,
  useDeleteMatchMutation,
  useClubLeaderboardQuery,
} from "@/slices/clubsApiSlice";

const getApiErrMsg = (e: any) =>
  e?.data?.message ||
  e?.error ||
  (typeof e?.data === "string" ? e.data : "Có lỗi xảy ra.");
const teamNames = (t: any[]) =>
  (t || []).map((u: any) => u?.nickname || u?.fullName || "?").join(" & ") || "?";

function RecordForm({ id, onDone }: { id: string; onDone: () => void }) {
  const { data: mem } = useListMembersQuery({ id });
  const members = mem?.items || [];
  const [createMatch, { isLoading }] = useCreateMatchMutation();
  const [teamA, setTeamA] = useState<string[]>([]);
  const [teamB, setTeamB] = useState<string[]>([]);
  const [sa, setSa] = useState("");
  const [sb, setSb] = useState("");
  const [note, setNote] = useState("");

  const assign = (uid: string, side: "A" | "B") => {
    const inA = teamA.includes(uid);
    const inB = teamB.includes(uid);
    if (side === "A") {
      if (inA) setTeamA((t) => t.filter((x) => x !== uid));
      else {
        if (teamA.length >= 2) return;
        setTeamB((t) => t.filter((x) => x !== uid));
        setTeamA((t) => [...t, uid]);
      }
    } else {
      if (inB) setTeamB((t) => t.filter((x) => x !== uid));
      else {
        if (teamB.length >= 2) return;
        setTeamA((t) => t.filter((x) => x !== uid));
        setTeamB((t) => [...t, uid]);
      }
    }
  };

  const submit = async () => {
    if (!teamA.length || !teamB.length) {
      Alert.alert("Thiếu người", "Chọn người cho cả 2 bên.");
      return;
    }
    if (sa === "" || sb === "" || Number(sa) === Number(sb)) {
      Alert.alert("Tỉ số", "Nhập tỉ số hợp lệ (không hoà).");
      return;
    }
    try {
      await createMatch({ id, teamA, teamB, scoreA: Number(sa), scoreB: Number(sb), note }).unwrap();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onDone();
    } catch (e) {
      Alert.alert("Lỗi", getApiErrMsg(e));
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.hint}>Gán mỗi người vào Bên A hoặc B (tối đa 2/bên)</Text>
      {members.map((m: any) => {
        if (!m.user) return null;
        const uid = String(m.user._id);
        const inA = teamA.includes(uid);
        const inB = teamB.includes(uid);
        return (
          <View key={uid} style={styles.pickRow}>
            <ExpoImage source={{ uri: normalizeUrl(m.user.avatar) }} style={styles.pickAvatar} />
            <Text style={styles.pickName} numberOfLines={1}>{m.user.nickname || m.user.fullName || "Người dùng"}</Text>
            <TouchableOpacity style={[styles.sideBtn, inA && styles.sideBtnA]} onPress={() => assign(uid, "A")}>
              <Text style={[styles.sideBtnText, inA && { color: "#fff" }]}>A</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.sideBtn, inB && styles.sideBtnB]} onPress={() => assign(uid, "B")}>
              <Text style={[styles.sideBtnText, inB && { color: "#fff" }]}>B</Text>
            </TouchableOpacity>
          </View>
        );
      })}
      <View style={styles.scoreRow}>
        <TextInput style={styles.scoreInput} value={sa} onChangeText={(t) => setSa(t.replace(/[^\d]/g, ""))} keyboardType="numeric" placeholder="0" placeholderTextColor="#8A90B2" />
        <Text style={{ color: "#5C6285", fontWeight: "800" }}>-</Text>
        <TextInput style={styles.scoreInput} value={sb} onChangeText={(t) => setSb(t.replace(/[^\d]/g, ""))} keyboardType="numeric" placeholder="0" placeholderTextColor="#8A90B2" />
      </View>
      <TextInput style={[styles.input, { marginTop: 8 }]} value={note} onChangeText={setNote} placeholder="Ghi chú (tuỳ chọn)" placeholderTextColor="#8A90B2" />
      <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
        <TouchableOpacity style={styles.primaryBtn} onPress={submit} disabled={isLoading}>
          <LinearGradient colors={["#667eea", "#764ba2"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <Text style={styles.primaryBtnText}>Ghi kết quả</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.lightBtn} onPress={onDone}>
          <Text style={styles.lightBtnText}>Huỷ</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function ClubMatchesRN({
  club,
  canManage,
}: {
  club: any;
  canManage: boolean;
}) {
  const id = club?._id;
  const isMember = !!club?._my?.isMember;
  const authUserId = useSelector((s: any) => s.auth?.userInfo?._id);
  const [view, setView] = useState<"board" | "matches">("board");
  const [showForm, setShowForm] = useState(false);

  const { data: lb } = useClubLeaderboardQuery({ id }, { skip: !id || view !== "board" });
  const { data: matchData, isLoading } = useListMatchesQuery({ id }, { skip: !id || view !== "matches" });
  const [deleteMatch] = useDeleteMatchMutation();

  const board = lb?.items || [];
  const matches = matchData?.items || [];

  const removeMatch = (m: any) =>
    Alert.alert("Xoá trận", "Xoá trận này?", [
      { text: "Huỷ", style: "cancel" },
      { text: "Xoá", style: "destructive", onPress: async () => { try { await deleteMatch({ id, matchId: m._id }).unwrap(); } catch (e) { Alert.alert("Lỗi", getApiErrMsg(e)); } } },
    ]);

  return (
    <Section title="BXH nội bộ">
      <View style={styles.viewToggle}>
        {[{ k: "board", l: "Bảng xếp hạng" }, { k: "matches", l: "Trận đấu" }].map((v) => (
          <TouchableOpacity key={v.k} style={[styles.viewBtn, view === v.k && styles.viewBtnActive]} onPress={() => setView(v.k as any)}>
            <Text style={[styles.viewBtnText, view === v.k && { color: "#fff" }]}>{v.l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {view === "board" ? (
        <>
          <Text style={{ color: "#7780A1", fontSize: 12, marginBottom: 8 }}>Tổng số trận: {lb?.totalMatches || 0} · 3 điểm/thắng</Text>
          {board.length === 0 ? (
            <EmptyState label="Chưa có dữ liệu xếp hạng" icon="trophy-outline" />
          ) : (
            <View style={styles.card}>
              {board.map((it: any, i: number) => (
                <View key={it.user._id} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: "#EEF1F8" }]}>
                  <Text style={[styles.rank, i < 3 && { color: "#B7791F" }]}>{i + 1}</Text>
                  <ExpoImage source={{ uri: normalizeUrl(it.user.avatar) }} style={styles.avatar} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>{it.user.nickname || it.user.fullName || "Người dùng"}</Text>
                    <Text style={styles.sub}>{it.won}T-{it.lost}B · {it.winRate}%</Text>
                  </View>
                  <Text style={styles.pts}>{it.points} đ</Text>
                </View>
              ))}
            </View>
          )}
        </>
      ) : (
        <>
          {isMember && (showForm ? (
            <RecordForm id={id} onDone={() => setShowForm(false)} />
          ) : (
            <TouchableOpacity style={[styles.addBtn, { marginBottom: 10 }]} onPress={() => setShowForm(true)}>
              <LinearGradient colors={["#667eea", "#764ba2"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
              <MaterialCommunityIcons name="plus" size={15} color="#fff" />
              <Text style={styles.addBtnText}>Ghi kết quả trận</Text>
            </TouchableOpacity>
          ))}
          {!isLoading && matches.length === 0 ? (
            <EmptyState label="Chưa có trận nào" icon="trophy-outline" />
          ) : (
            matches.map((m: any) => {
              const aWin = (m.scoreA || 0) > (m.scoreB || 0);
              const canDel = String(m.createdBy) === String(authUserId) || canManage;
              return (
                <View key={m._id} style={styles.card}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={[styles.mTeam, { textAlign: "right" }, aWin && { fontWeight: "800", color: "#1F2557" }]} numberOfLines={1}>{teamNames(m.teamA)}</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Text style={[styles.mScore, { color: aWin ? "#1B7A46" : "#7780A1" }]}>{m.scoreA}</Text>
                      <Text style={{ color: "#9AA3B2" }}>-</Text>
                      <Text style={[styles.mScore, { color: !aWin ? "#B4232D" : "#7780A1" }]}>{m.scoreB}</Text>
                    </View>
                    <Text style={[styles.mTeam, !aWin && { fontWeight: "800", color: "#1F2557" }]} numberOfLines={1}>{teamNames(m.teamB)}</Text>
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                    <Text style={{ color: "#7780A1", fontSize: 11.5 }}>{dayjs(m.playedAt).format("DD/MM/YYYY")}{m.note ? ` · ${m.note}` : ""}</Text>
                    {canDel && (
                      <TouchableOpacity onPress={() => removeMatch(m)}>
                        <MaterialCommunityIcons name="trash-can-outline" size={16} color="#B4232D" />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </>
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
  viewToggle: { flexDirection: "row", gap: 8, marginBottom: 10 },
  viewBtn: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 10, backgroundColor: "#F3F4FF", borderWidth: 1, borderColor: "#E6E8F5" },
  viewBtnActive: { backgroundColor: "#667eea", borderColor: "#667eea" },
  viewBtnText: { color: "#3B3F75", fontWeight: "800", fontSize: 13.5 },

  card: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E6E8F5", borderRadius: 14, padding: 12, marginBottom: 10 },
  hint: { color: "#7780A1", fontSize: 12, marginBottom: 6 },
  input: { padding: 11, borderRadius: 12, borderWidth: 1, borderColor: "#E6E8F5", backgroundColor: "#F8F9FF", color: "#1F2557" },

  pickRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  pickAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#E0E7FF" },
  pickName: { flex: 1, color: "#1F2557", fontSize: 13.5, fontWeight: "600" },
  sideBtn: { width: 32, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#F3F4FF", borderWidth: 1, borderColor: "#E6E8F5" },
  sideBtnA: { backgroundColor: "#3BA55D", borderColor: "#3BA55D" },
  sideBtnB: { backgroundColor: "#E05353", borderColor: "#E05353" },
  sideBtnText: { color: "#3B3F75", fontWeight: "800", fontSize: 13 },

  scoreRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 10 },
  scoreInput: { width: 70, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: "#E6E8F5", backgroundColor: "#F8F9FF", color: "#1F2557", textAlign: "center", fontWeight: "800" },

  addBtn: { flexDirection: "row", gap: 6, alignSelf: "flex-start", height: 40, paddingHorizontal: 18, borderRadius: 999, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  addBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  primaryBtn: { height: 40, paddingHorizontal: 20, borderRadius: 999, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  lightBtn: { height: 40, paddingHorizontal: 18, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: "#F3F4FF", borderWidth: 1, borderColor: "#E6E8F5" },
  lightBtnText: { color: "#3B3F75", fontWeight: "800", fontSize: 14 },

  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  rank: { width: 22, textAlign: "center", fontWeight: "800", color: "#7780A1" },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#E0E7FF" },
  name: { color: "#1F2557", fontWeight: "600", fontSize: 14 },
  sub: { color: "#7780A1", fontSize: 11.5 },
  pts: { color: "#4E56A6", fontWeight: "800", fontSize: 14 },

  mTeam: { flex: 1, color: "#5C6285", fontSize: 13 },
  mScore: { fontWeight: "800", fontSize: 16 },
});
