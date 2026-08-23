// app/play/[id].tsx — chi tiết kèo "Tìm bạn đánh" (mobile)
import React, { useState } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useSelector } from "react-redux";
import { PLAY_STATUS, formatPlayTime, skillLabel } from "@/constants/play";
import {
  useGetInviteQuery,
  useRequestJoinMutation,
  useRespondJoinMutation,
  useLeaveInviteMutation,
  useDeleteInviteMutation,
} from "@/slices/playApiSlice";

const GREEN = "#16a34a";

function Avatar({ uri, name, size = 36 }: { uri?: string; name?: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: "#E2E8F0", overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
      {uri ? (
        <Image source={{ uri }} style={{ width: "100%", height: "100%" }} />
      ) : (
        <Text style={{ fontWeight: "700", color: "#64748B" }}>{(name || "?").charAt(0)}</Text>
      )}
    </View>
  );
}

export default function PlayDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useSelector((s: any) => s.auth?.userInfo);
  const { data: it, isLoading, refetch } = useGetInviteQuery(id);
  const [requestJoin, { isLoading: joining }] = useRequestJoinMutation();
  const [respondJoin] = useRespondJoinMutation();
  const [leaveInvite] = useLeaveInviteMutation();
  const [deleteInvite] = useDeleteInviteMutation();
  const [note, setNote] = useState("");

  if (isLoading)
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
        <ActivityIndicator style={{ marginTop: 60 }} color={GREEN} />
      </SafeAreaView>
    );
  if (!it)
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" }}>
        <Text>Không tìm thấy kèo.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={{ color: GREEN }}>Quay lại</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );

  const st = PLAY_STATUS[it.status] || PLAY_STATUS.open;
  const pending = (it.participants || []).filter((p: any) => p.status === "pending");
  const accepted = (it.participants || []).filter((p: any) => p.status === "accepted");

  const onJoin = async () => {
    if (!me) return router.push("/login" as any);
    try {
      await requestJoin({ id: it._id, note }).unwrap();
      setNote("");
      refetch();
      Alert.alert("Đã gửi", "Chờ chủ kèo duyệt nhé!");
    } catch (e: any) {
      Alert.alert("Lỗi", e?.data?.message || "Không gửi được");
    }
  };
  const onLeave = async () => { try { await leaveInvite(it._id).unwrap(); refetch(); } catch {} };
  const respond = async (userId: string, action: string) => {
    try { await respondJoin({ id: it._id, userId, action }).unwrap(); refetch(); }
    catch (e: any) { Alert.alert("Lỗi", e?.data?.message || "Thất bại"); }
  };
  const onDelete = () => {
    Alert.alert("Xoá kèo", "Bạn chắc chắn?", [
      { text: "Huỷ", style: "cancel" },
      { text: "Xoá", style: "destructive", onPress: async () => { try { await deleteInvite(it._id).unwrap(); router.replace("/play" as any); } catch {} } },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#EEF0F3" }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color="#111827" />
        </TouchableOpacity>
        <Text style={{ fontSize: 17, fontWeight: "800", marginLeft: 4 }}>Chi tiết kèo</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40, gap: 12 }}>
        {/* Card */}
        <View style={{ backgroundColor: "#fff", borderRadius: 16, padding: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <Avatar uri={it.host?.avatar} name={it.host?.name} size={46} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "800", fontSize: 15 }}>{it.host?.nickname || it.host?.name}</Text>
              <Text style={{ color: "#64748B", fontSize: 12 }}>Chủ kèo</Text>
            </View>
            <View style={{ backgroundColor: st.color, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 }}>
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>{st.label}</Text>
            </View>
          </View>

          <Text style={{ fontWeight: "900", fontSize: 20, color: "#0F172A" }}>
            {it.title || it.courtName || "Kèo giao lưu pickleball"}
          </Text>

          <View style={{ gap: 8, marginTop: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="time-outline" size={18} color="#64748B" />
              <Text style={{ fontWeight: "700" }}>{formatPlayTime(it.playAt)} · {it.durationMin} phút</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="location-outline" size={18} color="#64748B" />
              <Text style={{ flex: 1 }}>{[it.courtName, it.district, it.province].filter(Boolean).join(", ") || "—"}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <View style={{ borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
                <Text style={{ fontSize: 12, color: "#334155" }}>{skillLabel(it.skillMin, it.skillMax)}</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Ionicons name="people-outline" size={16} color="#64748B" />
                <Text style={{ fontSize: 13, color: "#334155", fontWeight: "600" }}>{it.acceptedCount}/{it.slots} · thiếu {it.slotsLeft}</Text>
              </View>
            </View>
            {!!it.contactPhone && (
              <TouchableOpacity onPress={() => Linking.openURL(`tel:${it.contactPhone}`)} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="call-outline" size={18} color="#64748B" />
                <Text style={{ color: GREEN, fontWeight: "700" }}>{it.contactPhone}</Text>
              </TouchableOpacity>
            )}
          </View>

          {!!it.note && <Text style={{ marginTop: 12, color: "#475569", lineHeight: 21 }}>{it.note}</Text>}

          {/* Actions */}
          <View style={{ marginTop: 16 }}>
            {it.isHost ? (
              <TouchableOpacity onPress={onDelete} style={{ borderWidth: 1, borderColor: "#fecaca", borderRadius: 12, paddingVertical: 12, alignItems: "center" }}>
                <Text style={{ color: "#dc2626", fontWeight: "700" }}>Xoá kèo</Text>
              </TouchableOpacity>
            ) : it.myStatus === "accepted" ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Text style={{ color: GREEN, fontWeight: "800", flex: 1 }}>✅ Bạn đã tham gia</Text>
                <TouchableOpacity onPress={onLeave}><Text style={{ color: "#94A3B8", fontWeight: "600" }}>Rời kèo</Text></TouchableOpacity>
              </View>
            ) : it.myStatus === "pending" ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Text style={{ color: "#92400e", fontWeight: "700", flex: 1 }}>Đang chờ chủ kèo duyệt</Text>
                <TouchableOpacity onPress={onLeave}><Text style={{ color: "#94A3B8", fontWeight: "600" }}>Huỷ</Text></TouchableOpacity>
              </View>
            ) : it.status === "open" ? (
              <View style={{ gap: 8 }}>
                <TextInput value={note} onChangeText={setNote} placeholder="Lời nhắn cho chủ kèo (tuỳ chọn)" placeholderTextColor="#94A3B8" style={{ borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }} />
                <TouchableOpacity onPress={onJoin} disabled={joining} style={{ backgroundColor: GREEN, borderRadius: 12, paddingVertical: 13, alignItems: "center" }}>
                  <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Xin tham gia</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={{ color: "#94A3B8", fontWeight: "600" }}>Kèo đã đóng / đủ người</Text>
            )}
          </View>
        </View>

        {/* Host: pending */}
        {it.isHost && pending.length > 0 && (
          <View style={{ backgroundColor: "#fff", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#FDE68A" }}>
            <Text style={{ fontWeight: "800", marginBottom: 8 }}>Yêu cầu chờ duyệt ({pending.length})</Text>
            {pending.map((p: any) => (
              <View key={String(p.user?._id || p.user)} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 }}>
                <Avatar uri={p.user?.avatar} name={p.user?.name} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontWeight: "600" }} numberOfLines={1}>{p.user?.nickname || p.user?.name}</Text>
                  {!!p.note && <Text style={{ fontSize: 12.5, color: "#64748B" }} numberOfLines={1}>“{p.note}”</Text>}
                </View>
                <TouchableOpacity onPress={() => respond(p.user._id, "accept")} style={{ backgroundColor: GREEN, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8 }}>
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Nhận</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => respond(p.user._id, "decline")} style={{ backgroundColor: "#F1F5F9", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 }}>
                  <Text style={{ color: "#334155", fontWeight: "700", fontSize: 13 }}>Từ chối</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Accepted */}
        <View style={{ backgroundColor: "#fff", borderRadius: 16, padding: 16 }}>
          <Text style={{ fontWeight: "800", marginBottom: 8 }}>Người tham gia ({accepted.length}/{it.slots})</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 }}>
            <Avatar uri={it.host?.avatar} name={it.host?.name} />
            <Text style={{ fontWeight: "600", flex: 1 }}>{it.host?.nickname || it.host?.name}</Text>
            <Text style={{ fontSize: 12, color: GREEN, fontWeight: "700" }}>Chủ kèo</Text>
          </View>
          {accepted.map((p: any) => (
            <View key={String(p.user?._id || p.user)} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 }}>
              <Avatar uri={p.user?.avatar} name={p.user?.name} />
              <Text style={{ fontWeight: "600", flex: 1 }} numberOfLines={1}>{p.user?.nickname || p.user?.name}</Text>
              {it.isHost && (
                <TouchableOpacity onPress={() => respond(p.user._id, "decline")}><Text style={{ color: "#94A3B8", fontSize: 12 }}>Bỏ</Text></TouchableOpacity>
              )}
            </View>
          ))}
          {accepted.length === 0 && <Text style={{ color: "#94A3B8", fontSize: 13 }}>Chưa có ai được nhận.</Text>}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
