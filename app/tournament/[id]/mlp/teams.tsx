// MLP teams — list + đăng ký team mới + captain quản roster (search VĐV).
import { Ionicons } from "@expo/vector-icons";
import { Stack, router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
  useListMlpTeamsQuery,
  useCreateMlpTeamMutation,
  useUpdateMlpTeamMutation,
  useDeleteMlpTeamMutation,
  useGetMlpTeamQuery,
} from "@/slices/mlpApiSlice";
import { useLazySearchUserQuery } from "@/slices/usersApiSlice";
import { useGetTournamentQuery } from "@/slices/tournamentsApiSlice";
import { normalizeUrl } from "@/utils/normalizeUri";

const STATUS_COLOR: Record<string, string> = {
  pending: "#F59E0B",
  approved: "#10B981",
  rejected: "#EF4444",
  withdrawn: "#94A3B8",
};
const STATUS_LABEL: Record<string, string> = {
  pending: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Từ chối",
  withdrawn: "Đã rút",
};

const PRESET_COLORS = [
  "#3B82F6",
  "#EF4444",
  "#10B981",
  "#F59E0B",
  "#8B5CF6",
  "#EC4899",
  "#0EA5E9",
  "#22C55E",
  "#F97316",
  "#0F172A",
];

export default function MlpTeamsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useSelector((s: any) => s.auth?.userInfo);
  const { data: tour } = useGetTournamentQuery(String(id));
  const { data, isFetching, refetch } = useListMlpTeamsQuery(
    { tourId: String(id) },
    { skip: !id },
  );

  const items = (data as any)?.items || [];
  const myTeam = useMemo(() => {
    if (!me?._id) return null;
    return (
      items.find(
        (tm: any) =>
          String(tm?.captain?._id || tm?.captain) === String(me._id),
      ) || null
    );
  }, [items, me?._id]);

  const cfg: any = (tour as any)?.mlpConfig || {};
  const minRoster = Number(cfg.minRosterSize) || 4;
  const maxRoster = Number(cfg.maxRosterSize) || 8;

  const [createOpen, setCreateOpen] = useState(false);
  const [editTeam, setEditTeam] = useState<any>(null);

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <Stack.Screen options={{ title: "MLP · Teams" }} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Danh sách Team</Text>
        {me && !myTeam && (
          <Pressable
            onPress={() => setCreateOpen(true)}
            style={styles.addBtn}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addBtnText}>Tạo team</Text>
          </Pressable>
        )}
      </View>

      {isFetching && !items.length ? (
        <ActivityIndicator style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(t: any) => String(t._id)}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={{ padding: 32, alignItems: "center" }}>
              <Text style={{ color: "#64748B" }}>
                Chưa có team nào. Bấm "Tạo team" để tạo team đầu tiên.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const isMine =
              String(item?.captain?._id || item?.captain) ===
              String(me?._id || "");
            return (
              <Pressable
                style={[styles.card, isMine && styles.cardMine]}
                onPress={() => setEditTeam(item)}
              >
                <View
                  style={[
                    styles.logo,
                    { backgroundColor: item.color || "#0066FF" },
                  ]}
                >
                  {item.logo ? (
                    <Image
                      source={{ uri: normalizeUrl(item.logo) }}
                      style={{ width: "100%", height: "100%" }}
                    />
                  ) : (
                    <Text style={styles.logoText}>
                      {(item.shortName || item.name || "?")[0]?.toUpperCase()}
                    </Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Text style={styles.name} numberOfLines={1}>
                      {item.name}
                    </Text>
                    {isMine && (
                      <View style={styles.mineBadge}>
                        <Text style={styles.mineBadgeText}>Đội của tôi</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.sub}>
                    Roster {item.players?.length || 0} VĐV · Captain:{" "}
                    {item.captain?.nickname || item.captain?.name || "—"}
                  </Text>
                  <View
                    style={[
                      styles.statusPill,
                      {
                        backgroundColor:
                          (STATUS_COLOR[item.status] || "#94A3B8") + "22",
                        borderColor:
                          STATUS_COLOR[item.status] || "#94A3B8",
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: STATUS_COLOR[item.status] || "#94A3B8",
                        fontSize: 11,
                        fontWeight: "700",
                      }}
                    >
                      {STATUS_LABEL[item.status] || item.status}
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
              </Pressable>
            );
          }}
        />
      )}

      <TeamFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        tourId={String(id)}
        team={null}
        minRoster={minRoster}
        maxRoster={maxRoster}
        onSaved={() => {
          setCreateOpen(false);
          refetch();
        }}
      />
      <TeamFormModal
        open={!!editTeam}
        onClose={() => setEditTeam(null)}
        tourId={String(id)}
        team={editTeam}
        minRoster={minRoster}
        maxRoster={maxRoster}
        canEdit={
          !!editTeam &&
          String(editTeam?.captain?._id || editTeam?.captain) ===
            String(me?._id || "")
        }
        onSaved={() => {
          setEditTeam(null);
          refetch();
        }}
      />
    </SafeAreaView>
  );
}

/* ═════════════════════ TEAM FORM MODAL ═════════════════════ */
function TeamFormModal({
  open,
  onClose,
  tourId,
  team,
  minRoster,
  maxRoster,
  onSaved,
  canEdit = true,
}: {
  open: boolean;
  onClose: () => void;
  tourId: string;
  team: any;
  minRoster: number;
  maxRoster: number;
  onSaved: () => void;
  canEdit?: boolean;
}) {
  const isEdit = !!team;
  // Với edit — fetch team chi tiết để có players populated đầy đủ
  const { data: teamDetail } = useGetMlpTeamQuery(String(team?._id || ""), {
    skip: !team?._id || !open,
    refetchOnMountOrArgChange: true,
  });
  const teamFull = teamDetail || team;

  const [createTeam, { isLoading: creating }] = useCreateMlpTeamMutation();
  const [updateTeam, { isLoading: updating }] = useUpdateMlpTeamMutation();
  const [deleteTeam] = useDeleteMlpTeamMutation();

  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [color, setColor] = useState("#3B82F6");
  const [players, setPlayers] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [triggerSearch, { data: searchRes, isFetching: searching }] =
    useLazySearchUserQuery();

  useEffect(() => {
    if (!open) return;
    setName(teamFull?.name || "");
    setShortName(teamFull?.shortName || "");
    setColor(teamFull?.color || "#3B82F6");
    setPlayers(
      Array.isArray(teamFull?.players)
        ? teamFull.players.filter((p: any) => p && typeof p === "object")
        : [],
    );
    setQ("");
  }, [open, teamFull?._id]);

  useEffect(() => {
    if (!open) return;
    const s = q.trim();
    if (s.length < 1) return;
    const t = setTimeout(() => triggerSearch(s), 350);
    return () => clearTimeout(t);
  }, [q, open, triggerSearch]);

  const searchResults = useMemo(() => {
    const raw: any = searchRes;
    const arr: any[] = Array.isArray(raw)
      ? raw
      : raw?.items || raw?.data || raw?.users || [];
    const excludedIds = new Set(players.map((p) => String(p._id || p)));
    return arr.filter((u) => !excludedIds.has(String(u._id))).slice(0, 15);
  }, [searchRes, players]);

  const addPlayer = (u: any) => {
    if (players.length >= maxRoster) {
      Alert.alert("Đã đạt tối đa", `Roster tối đa ${maxRoster} VĐV`);
      return;
    }
    setPlayers((prev) => [...prev, u]);
    setQ("");
  };
  const removePlayer = (id: string) =>
    setPlayers((prev) => prev.filter((p) => String(p._id) !== String(id)));

  const canSubmit =
    !!name.trim() &&
    players.length >= minRoster &&
    players.length <= maxRoster;

  const handleSubmit = async () => {
    if (!canSubmit) {
      if (!name.trim()) return Alert.alert("Nhập tên team");
      if (players.length < minRoster)
        return Alert.alert(
          "Chưa đủ",
          `Roster cần ít nhất ${minRoster} VĐV`,
        );
      return;
    }
    const body: any = {
      name: name.trim(),
      shortName: shortName.trim(),
      color,
      players: players.map((p) => String(p._id)),
    };
    try {
      if (isEdit) {
        await updateTeam({ id: team._id, ...body }).unwrap();
        Alert.alert("✓", "Đã lưu team");
      } else {
        await createTeam({ tourId, ...body }).unwrap();
        Alert.alert("✓", "Đã tạo team");
      }
      onSaved();
    } catch (err: any) {
      Alert.alert("Lỗi", err?.data?.message || "Không lưu được");
    }
  };

  const handleDelete = () => {
    Alert.alert("Xoá team", `Xoá "${team?.name}"?`, [
      { text: "Huỷ", style: "cancel" },
      {
        text: "Xoá",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteTeam(team._id).unwrap();
            Alert.alert("✓", "Đã xoá");
            onSaved();
          } catch (err: any) {
            Alert.alert("Lỗi", err?.data?.message || "Không xoá được");
          }
        },
      },
    ]);
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
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.mdSheet}>
            <View style={styles.mdHeader}>
              <Text style={styles.mdTitle}>
                {isEdit ? "Chi tiết team" : "Tạo team MLP"}
              </Text>
              <Pressable onPress={onClose} hitSlop={10}>
                <Ionicons name="close" size={22} color="#0F172A" />
              </Pressable>
            </View>

            <ScrollView
              style={{ maxHeight: 520 }}
              contentContainerStyle={{ padding: 12, gap: 10 }}
              keyboardShouldPersistTaps="handled"
            >
              <TextInput
                style={[styles.input, !canEdit && { opacity: 0.6 }]}
                placeholder="Tên team *"
                value={name}
                onChangeText={setName}
                maxLength={100}
                editable={canEdit}
              />
              <TextInput
                style={[styles.input, !canEdit && { opacity: 0.6 }]}
                placeholder="Ký hiệu ngắn (VD: HN, SG)"
                value={shortName}
                onChangeText={setShortName}
                maxLength={20}
                editable={canEdit}
              />

              {/* Color picker */}
              <View>
                <Text style={styles.label}>Màu chủ đạo</Text>
                <View style={styles.colorRow}>
                  {PRESET_COLORS.map((c) => (
                    <Pressable
                      key={c}
                      onPress={() => canEdit && setColor(c)}
                      style={[
                        styles.colorSwatch,
                        {
                          backgroundColor: c,
                          borderWidth: color === c ? 3 : 1,
                          borderColor: color === c ? "#0F172A" : "#CBD5E1",
                        },
                      ]}
                    />
                  ))}
                </View>
              </View>

              {/* Roster */}
              <View>
                <Text style={styles.label}>
                  Roster {players.length}/{minRoster}-{maxRoster}
                </Text>
                {canEdit && (
                  <TextInput
                    style={styles.input}
                    placeholder="Tìm VĐV theo tên / nickname / SĐT…"
                    value={q}
                    onChangeText={setQ}
                    autoCorrect={false}
                    autoCapitalize="none"
                  />
                )}
                {canEdit && q.trim().length >= 1 && (
                  <View style={styles.searchBox}>
                    {searching && searchResults.length === 0 ? (
                      <ActivityIndicator style={{ margin: 8 }} />
                    ) : searchResults.length === 0 ? (
                      <Text style={styles.searchEmpty}>
                        Không tìm thấy VĐV
                      </Text>
                    ) : (
                      searchResults.map((u: any) => (
                        <Pressable
                          key={u._id}
                          style={styles.searchRow}
                          onPress={() => addPlayer(u)}
                        >
                          <UserAvatar user={u} size={30} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.searchName} numberOfLines={1}>
                              {u.nickname || u.name || "VĐV"}
                            </Text>
                            {u.name && u.nickname && (
                              <Text style={styles.searchSub} numberOfLines={1}>
                                {u.name}
                              </Text>
                            )}
                          </View>
                          <Ionicons
                            name="add-circle"
                            size={22}
                            color="#0066FF"
                          />
                        </Pressable>
                      ))
                    )}
                  </View>
                )}

                {/* Selected roster */}
                <View style={{ marginTop: 10, gap: 6 }}>
                  {players.length === 0 ? (
                    <Text style={styles.rosterEmpty}>
                      Chưa có VĐV — {canEdit ? "tìm ở ô trên" : "captain chưa thêm"}
                    </Text>
                  ) : (
                    players.map((p: any, idx: number) => (
                      <View key={p._id} style={styles.rosterRow}>
                        <Text style={styles.rosterIdx}>{idx + 1}</Text>
                        <UserAvatar user={p} size={30} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.rosterName} numberOfLines={1}>
                            {p.nickname || p.name || "VĐV"}
                          </Text>
                          <Text style={styles.rosterSub}>
                            {p.gender === "female"
                              ? "♀ Nữ"
                              : p.gender === "male"
                                ? "♂ Nam"
                                : "—"}
                          </Text>
                        </View>
                        {canEdit && (
                          <Pressable
                            onPress={() => removePlayer(p._id)}
                            hitSlop={10}
                          >
                            <Ionicons
                              name="close-circle"
                              size={22}
                              color="#EF4444"
                            />
                          </Pressable>
                        )}
                      </View>
                    ))
                  )}
                </View>

                {players.length > 0 && players.length < minRoster && (
                  <Text style={styles.warn}>
                    Cần thêm {minRoster - players.length} VĐV nữa
                  </Text>
                )}
              </View>
            </ScrollView>

            {canEdit && (
              <View style={styles.mdFooter}>
                {isEdit && (
                  <Pressable
                    onPress={handleDelete}
                    style={[styles.actionBtn, { backgroundColor: "#FEE2E2" }]}
                  >
                    <Ionicons name="trash" size={16} color="#DC2626" />
                    <Text
                      style={[styles.actionBtnText, { color: "#DC2626" }]}
                    >
                      Xoá
                    </Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={handleSubmit}
                  disabled={!canSubmit || creating || updating}
                  style={[
                    styles.actionBtn,
                    { backgroundColor: "#0066FF", flex: 1 },
                    (!canSubmit || creating || updating) && { opacity: 0.4 },
                  ]}
                >
                  <Ionicons name="save" size={16} color="#fff" />
                  <Text style={[styles.actionBtnText, { color: "#fff" }]}>
                    {creating || updating
                      ? "Đang lưu…"
                      : isEdit
                        ? "Lưu"
                        : "Gửi đăng ký"}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function UserAvatar({ user, size = 30 }: { user: any; size?: number }) {
  const uri = user?.avatar ? normalizeUrl(user.avatar) : "";
  const initial =
    String(user?.nickname || user?.name || "?")
      .trim()
      .charAt(0)
      .toUpperCase() || "?";
  const [err, setErr] = useState(false);
  if (uri && !err) {
    return (
      <Image
        source={{ uri }}
        onError={() => setErr(true)}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: "#E2E8F0",
        }}
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: "#DBEAFE",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: "#1E40AF", fontWeight: "800", fontSize: 12 }}>
        {initial}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: "700", color: "#0F172A" },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#0066FF",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addBtnText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  input: {
    backgroundColor: "#F1F5F9",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#0F172A",
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    marginBottom: 8,
    backgroundColor: "#fff",
    borderRadius: 12,
  },
  cardMine: { borderWidth: 2, borderColor: "#10B981" },
  mineBadge: {
    backgroundColor: "#10B981",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  mineBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  logo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  logoText: { color: "#fff", fontWeight: "900", fontSize: 20 },
  name: { flex: 1, fontSize: 15, fontWeight: "700", color: "#0F172A" },
  sub: { fontSize: 12, color: "#64748B", marginTop: 2 },
  statusPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 4,
  },
  label: {
    fontSize: 12,
    color: "#475569",
    fontWeight: "800",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  colorRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  colorSwatch: {
    width: 30,
    height: 30,
    borderRadius: 6,
  },
  searchBox: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    backgroundColor: "#fff",
    maxHeight: 220,
  },
  searchEmpty: {
    padding: 12,
    textAlign: "center",
    color: "#94A3B8",
    fontSize: 12,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  searchName: { fontSize: 13, color: "#0F172A", fontWeight: "700" },
  searchSub: { fontSize: 10, color: "#94A3B8" },
  rosterEmpty: {
    fontSize: 12,
    color: "#94A3B8",
    fontStyle: "italic",
    padding: 12,
    textAlign: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
  },
  rosterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  rosterIdx: {
    width: 22,
    textAlign: "center",
    fontWeight: "900",
    color: "#0066FF",
  },
  rosterName: { fontSize: 13, color: "#0F172A", fontWeight: "700" },
  rosterSub: { fontSize: 10, color: "#94A3B8" },
  warn: {
    marginTop: 6,
    padding: 6,
    color: "#B45309",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
    backgroundColor: "#FEF3C7",
    borderRadius: 6,
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
    maxHeight: "88%",
  },
  mdHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  mdTitle: { fontSize: 16, fontWeight: "900", color: "#0F172A" },
  mdFooter: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
  },
  actionBtnText: { fontWeight: "800", fontSize: 14 },
});
