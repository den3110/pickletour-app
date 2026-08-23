// app/play/index.tsx — "Tìm bạn đánh" (danh sách kèo, mobile)
import React, { useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useSelector } from "react-redux";
import { PLAY_STATUS, formatPlayTime, skillLabel } from "@/constants/play";
import {
  useListInvitesQuery,
  useRequestJoinMutation,
} from "@/slices/playApiSlice";

const GREEN = "#16a34a";

function InviteCard({ it, onJoin }: { it: any; onJoin: (it: any) => void }) {
  const st = PLAY_STATUS[it.status] || PLAY_STATUS.open;
  const canJoin = !it.isHost && it.myStatus === "none" && it.status === "open";
  return (
    <TouchableOpacity
      onPress={() => router.push(`/play/${it._id}` as any)}
      activeOpacity={0.85}
      style={{ backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#EAECEF", padding: 14, gap: 8 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: "#E2E8F0", overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
          {it.host?.avatar ? (
            <Image source={{ uri: it.host.avatar }} style={{ width: "100%", height: "100%" }} />
          ) : (
            <Text style={{ fontWeight: "700", color: "#64748B" }}>{(it.host?.name || "?").charAt(0)}</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: "700", color: "#111827" }} numberOfLines={1}>
            {it.host?.nickname || it.host?.name}
          </Text>
          <Text style={{ fontSize: 12, color: "#94A3B8" }}>đăng kèo</Text>
        </View>
        <View style={{ backgroundColor: st.color, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 }}>
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 11 }}>{st.label}</Text>
        </View>
      </View>

      <Text style={{ fontWeight: "800", fontSize: 16, color: "#0F172A" }}>
        {it.title || it.courtName || "Kèo giao lưu pickleball"}
      </Text>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Ionicons name="time-outline" size={15} color="#64748B" />
        <Text style={{ fontSize: 13.5, fontWeight: "700", color: "#0F172A" }}>{formatPlayTime(it.playAt)}</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Ionicons name="location-outline" size={15} color="#64748B" />
        <Text numberOfLines={1} style={{ fontSize: 13, color: "#64748B", flex: 1 }}>
          {[it.courtName, it.district, it.province].filter(Boolean).join(", ") || "—"}
        </Text>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <View style={{ borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
          <Text style={{ fontSize: 12, color: "#334155" }}>{skillLabel(it.skillMin, it.skillMax)}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Ionicons name="people-outline" size={15} color="#64748B" />
          <Text style={{ fontSize: 12.5, color: "#334155", fontWeight: "600" }}>
            {it.acceptedCount}/{it.slots} · thiếu {it.slotsLeft}
          </Text>
        </View>
      </View>

      {it.isHost ? (
        <Text style={{ color: GREEN, fontWeight: "700", fontSize: 13 }}>
          Kèo của bạn{it.pendingCount ? ` · ${it.pendingCount} chờ duyệt` : ""}
        </Text>
      ) : it.myStatus === "pending" ? (
        <Text style={{ color: "#92400e", fontWeight: "700", fontSize: 13 }}>Đã xin — chờ duyệt</Text>
      ) : it.myStatus === "accepted" ? (
        <Text style={{ color: GREEN, fontWeight: "700", fontSize: 13 }}>✅ Đã tham gia</Text>
      ) : canJoin ? (
        <TouchableOpacity
          onPress={() => onJoin(it)}
          style={{ alignSelf: "flex-start", backgroundColor: GREEN, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 }}
        >
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>Xin tham gia</Text>
        </TouchableOpacity>
      ) : null}
    </TouchableOpacity>
  );
}

export default function PlayScreen() {
  const me = useSelector((s: any) => s.auth?.userInfo);
  const [province, setProvince] = useState("");
  const [skill, setSkill] = useState("");
  const [page, setPage] = useState(1);
  const [mine, setMine] = useState(false);

  const params = useMemo(() => {
    const p: any = { page, limit: 20 };
    if (mine) {
      p.mine = 1;
    } else {
      if (province) p.province = province;
      if (skill) p.skill = skill;
    }
    return p;
  }, [province, skill, page, mine]);

  const { data, isLoading, isFetching, refetch } = useListInvitesQuery(params, {
    refetchOnMountOrArgChange: true,
  });
  const [requestJoin] = useRequestJoinMutation();
  const items = data?.items || [];

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const onJoin = async (it: any) => {
    if (!me) return router.push("/login" as any);
    try {
      await requestJoin({ id: it._id, note: "" }).unwrap();
      refetch();
    } catch {}
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }} edges={["top"]}>
      <View style={{ paddingHorizontal: 14, paddingBottom: 10, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#EEF0F3" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="chevron-back" size={26} color="#111827" />
          </TouchableOpacity>
          <Text style={{ fontSize: 20, fontWeight: "900", flex: 1, color: "#111827" }}>🏓 Tìm bạn đánh</Text>
        </View>
        {/* Tabs */}
        <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
          {[{ k: false, label: "Khám phá" }, { k: true, label: "Kèo của tôi" }].map((t) => {
            const active = mine === t.k;
            return (
              <TouchableOpacity
                key={String(t.k)}
                onPress={() => { if (t.k && !me) return router.push("/login" as any); setMine(t.k); setPage(1); }}
                style={{ paddingHorizontal: 16, paddingVertical: 7, borderRadius: 999, backgroundColor: active ? GREEN : "#F1F5F9" }}
              >
                <Text style={{ fontWeight: "700", color: active ? "#fff" : "#334155" }}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {!mine && (
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: "#F1F5F9", borderRadius: 10, paddingHorizontal: 10, height: 40 }}>
              <Ionicons name="location-outline" size={16} color="#94A3B8" />
              <TextInput
                value={province}
                onChangeText={(v) => { setProvince(v); setPage(1); }}
                placeholder="Khu vực"
                placeholderTextColor="#94A3B8"
                style={{ flex: 1, marginLeft: 6, fontSize: 14, color: "#111827" }}
              />
            </View>
            <View style={{ width: 110, flexDirection: "row", alignItems: "center", backgroundColor: "#F1F5F9", borderRadius: 10, paddingHorizontal: 10, height: 40 }}>
              <TextInput
                value={skill}
                onChangeText={(v) => { setSkill(v); setPage(1); }}
                placeholder="Trình"
                keyboardType="decimal-pad"
                placeholderTextColor="#94A3B8"
                style={{ flex: 1, fontSize: 14, color: "#111827" }}
              />
            </View>
          </View>
        )}
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={GREEN} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => String(it._id)}
          contentContainerStyle={{ padding: 12, gap: 12, paddingBottom: 100 }}
          renderItem={({ item }) => <InviteCard it={item} onJoin={onJoin} />}
          refreshControl={<RefreshControl refreshing={isFetching && page === 1} onRefresh={() => { if (page !== 1) setPage(1); else refetch(); }} tintColor={GREEN} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => { if (data?.hasMore && !isFetching) setPage((p) => p + 1); }}
          ListEmptyComponent={
            <View style={{ alignItems: "center", marginTop: 60 }}>
              <Text style={{ fontSize: 44 }}>🏓</Text>
              <Text style={{ color: "#64748B", marginTop: 8, fontWeight: "600" }}>Chưa có kèo nào phù hợp</Text>
            </View>
          }
        />
      )}

      <TouchableOpacity
        onPress={() => (me ? router.push("/play/new" as any) : router.push("/login" as any))}
        style={{ position: "absolute", right: 18, bottom: 26, backgroundColor: GREEN, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 18, height: 52, borderRadius: 26, elevation: 6, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }}
      >
        <Ionicons name="add" size={24} color="#fff" />
        <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Đăng kèo</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}
