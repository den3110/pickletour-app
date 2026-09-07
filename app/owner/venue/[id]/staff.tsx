// app/owner/venue/[id]/staff.tsx — Quản lý nhân viên & phân quyền cụm sân
import React, { useMemo, useState, useEffect } from "react";
import { View, ScrollView, TouchableOpacity, StyleSheet, Alert, Modal, TextInput, Image, ActivityIndicator, FlatList } from "react-native";
import { Text } from "@/components/ui/i18nText";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
import { useTheme } from "@react-navigation/native";
import {
  useListStaffQuery, useAddStaffMutation, useUpdateStaffMutation, useRemoveStaffMutation, useLazySearchUsersQuery,
} from "@/slices/venueStaffApiSlice";
import { pal } from "@/utils/courtFormat";
import { Card, Chip, Empty, PrimaryButton, SectionHeader, SheetHandle, shadow, R, SP } from "@/components/courts/ui";

const ROLE_COLOR: Record<string, string> = { manager: "#8b5cf6", cashier: "#f59e0b", staff: "#22c1d6", owner: "#22c55e" };
const Avatar = ({ u, size = 40 }: any) =>
  u?.avatar ? (
    <Image source={{ uri: u.avatar }} style={{ width: size, height: size, borderRadius: size / 2 }} />
  ) : (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: "#6366f1", alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontWeight: "800", fontSize: size * 0.4 }}>{String(u?.name || u?.nickname || "?")[0]?.toUpperCase()}</Text>
    </View>
  );

export default function VenueStaffScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const C = useMemo(() => pal(!!theme.dark), [theme.dark]);
  const { data, isLoading, isFetching, refetch } = useListStaffQuery(id, { skip: !id });
  const [removeStaff] = useRemoveStaffMutation();
  const [updateStaff] = useUpdateStaffMutation();
  const [editor, setEditor] = useState<any>(null); // { add:true } | staffDoc

  const perms = data?.permissions || [];
  const roles = data?.roles || [];
  const staff = data?.staff || [];

  const groups = useMemo(() => {
    const g: Record<string, any[]> = {};
    for (const p of perms) { (g[p.group] = g[p.group] || []).push(p); }
    return g;
  }, [perms]);

  const toggleActive = (s: any) =>
    updateStaff({ venueId: id, staffId: s._id, active: !s.active }).unwrap().catch((e: any) => Alert.alert("Lỗi", e?.data?.message || "Thất bại"));
  const remove = (s: any) =>
    Alert.alert("Gỡ nhân viên?", `${s.user?.name || "Người này"} sẽ mất quyền truy cập cụm sân.`, [
      { text: "Không" },
      { text: "Gỡ", style: "destructive", onPress: () => removeStaff({ venueId: id, staffId: s._id }).unwrap().catch((e: any) => Alert.alert("Lỗi", e?.data?.message || "Thất bại")) },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{ title: "Nhân viên & phân quyền", headerRight: () => (
        <TouchableOpacity onPress={() => setEditor({ add: true })} hitSlop={8}><Ionicons name="person-add" size={22} color={C.accent} /></TouchableOpacity>
      ) }} />
      {isLoading ? (
        <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: SP.lg, paddingBottom: 60 }}>
          {/* Chủ sân */}
          {data?.owner && (
            <Card C={C} style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: SP.md }}>
              <Avatar u={data.owner.user} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: C.text, fontWeight: "800" }} numberOfLines={1}>{data.owner.user?.name || "Chủ sân"}</Text>
                <Text style={{ color: C.sub, fontSize: 12 }} numberOfLines={1}>{data.owner.user?.phone || data.owner.user?.email || ""}</Text>
              </View>
              <Chip C={C} color={ROLE_COLOR.owner} label="Chủ sân" small />
            </Card>
          )}

          <SectionHeader C={C} title={`Nhân viên · ${staff.length}`} right={
            <TouchableOpacity onPress={() => setEditor({ add: true })} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name="add-circle" size={18} color={C.accent} /><Text style={{ color: C.accent, fontWeight: "700", fontSize: 13 }}>Thêm</Text>
            </TouchableOpacity>
          } />

          {staff.length === 0 ? (
            <Card C={C} pad={0}><Empty C={C} icon="people-outline" title="Chưa có nhân viên" subtitle="Thêm quản lý, thu ngân hoặc nhân viên và phân quyền cho từng người." action={<PrimaryButton C={C} icon="person-add" label="Thêm nhân viên" onPress={() => setEditor({ add: true })} />} /></Card>
          ) : (
            staff.map((s: any) => (
              <Card key={s._id} C={C} style={[{ marginBottom: SP.md }, !s.active && { opacity: 0.55 }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <Avatar u={s.user} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: C.text, fontWeight: "800" }} numberOfLines={1}>{s.user?.name || s.user?.nickname || "Nhân viên"}</Text>
                    <Text style={{ color: C.sub, fontSize: 12 }} numberOfLines={1}>{s.user?.phone || s.user?.email || ""}</Text>
                  </View>
                  <Chip C={C} color={ROLE_COLOR[s.role] || C.accent} label={s.roleLabel || s.role} small />
                </View>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 10 }}>
                  {s.role === "manager" ? (
                    <Text style={{ color: C.sub, fontSize: 12 }}>Toàn quyền như chủ sân</Text>
                  ) : (
                    (s.permissions || []).slice(0, 6).map((k: string) => {
                      const label = perms.find((p: any) => p.key === k)?.label || k;
                      return <View key={k} style={[styles.permTag, { backgroundColor: C.field }]}><Text style={{ color: C.sub, fontSize: 11 }}>{label}</Text></View>;
                    })
                  )}
                  {s.role !== "manager" && (s.permissions || []).length > 6 && <Text style={{ color: C.muted, fontSize: 11 }}>+{s.permissions.length - 6}</Text>}
                  {s.role !== "manager" && (s.permissions || []).length === 0 && <Text style={{ color: C.danger, fontSize: 12 }}>Chưa có quyền nào</Text>}
                </View>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                  <TouchableOpacity onPress={() => setEditor(s)} style={[styles.act, { backgroundColor: C.accentSoft }]}>
                    <Ionicons name="options-outline" size={15} color={C.accent} /><Text style={{ color: C.accent, fontWeight: "700", fontSize: 12.5 }}>Phân quyền</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => toggleActive(s)} style={[styles.act, { backgroundColor: C.field }]}>
                    <Ionicons name={s.active ? "pause-outline" : "play-outline"} size={15} color={C.sub} /><Text style={{ color: C.sub, fontWeight: "700", fontSize: 12.5 }}>{s.active ? "Tạm dừng" : "Kích hoạt"}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => remove(s)} style={[styles.act, { backgroundColor: "rgba(239,68,68,0.12)" }]}>
                    <Ionicons name="trash-outline" size={15} color={C.danger} />
                  </TouchableOpacity>
                </View>
              </Card>
            ))
          )}
        </ScrollView>
      )}

      {editor && (
        <StaffEditor C={C} venueId={id} editor={editor} roles={roles} groups={groups} onClose={() => setEditor(null)} />
      )}
    </View>
  );
}

function StaffEditor({ C, venueId, editor, roles, groups, onClose }: any) {
  const isAdd = !!editor?.add;
  const [addStaff, { isLoading: adding }] = useAddStaffMutation();
  const [updateStaff, { isLoading: updating }] = useUpdateStaffMutation();
  const [runSearch, { data: results, isFetching: searching }] = useLazySearchUsersQuery();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<any>(isAdd ? null : editor.user);
  const [role, setRole] = useState<string>(isAdd ? "staff" : editor.role);
  const [perms, setPerms] = useState<string[]>(isAdd ? (roles.find((r: any) => r.key === "staff")?.preset || []) : (editor.permissions || []));

  useEffect(() => {
    const t = setTimeout(() => { if (q.trim().length >= 2) runSearch(q.trim()); }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const applyRolePreset = (r: string) => {
    setRole(r);
    const preset = roles.find((x: any) => x.key === r)?.preset || [];
    setPerms(r === "manager" ? [] : [...preset]);
  };
  const togglePerm = (k: string) => setPerms((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));

  const save = async () => {
    try {
      if (isAdd) {
        if (!picked?._id) return Alert.alert("Chọn người dùng", "Tìm và chọn 1 tài khoản PickleTour.");
        await addStaff({ venueId, userId: picked._id, role, permissions: perms }).unwrap();
      } else {
        await updateStaff({ venueId, staffId: editor._id, role, permissions: perms }).unwrap();
      }
      onClose();
    } catch (e: any) {
      Alert.alert("Lỗi", e?.data?.message || "Lưu thất bại.");
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalWrap}>
        <View style={[styles.modal, { backgroundColor: C.card }, shadow(C.dark, 3)]}>
          <SheetHandle C={C} />
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <Text style={{ color: C.text, fontWeight: "900", fontSize: 18 }}>{isAdd ? "Thêm nhân viên" : "Phân quyền"}</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={C.sub} /></TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled">
            {isAdd && !picked && (
              <>
                <View style={[styles.search, { backgroundColor: C.field, borderColor: C.border }]}>
                  <Ionicons name="search" size={17} color={C.muted} />
                  <TextInput style={{ flex: 1, color: C.text, fontSize: 15 }} placeholder="Tìm tên hoặc SĐT…" placeholderTextColor={C.muted} value={q} onChangeText={setQ} autoFocus />
                  {searching ? <ActivityIndicator color={C.accent} /> : null}
                </View>
                <Text style={{ color: C.muted, fontSize: 12, marginTop: 6, marginBottom: 4 }}>Nhập ≥ 2 ký tự để tìm tài khoản PickleTour</Text>
                {(results || []).map((u: any) => (
                  <TouchableOpacity key={u._id} onPress={() => setPicked(u)} style={[styles.userRow, { borderColor: C.border }]}>
                    <Avatar u={u} size={38} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: C.text, fontWeight: "700" }} numberOfLines={1}>{u.name || u.nickname}</Text>
                      <Text style={{ color: C.sub, fontSize: 12 }} numberOfLines={1}>{u.phone || u.email || ""}</Text>
                    </View>
                    <Ionicons name="add-circle-outline" size={22} color={C.accent} />
                  </TouchableOpacity>
                ))}
              </>
            )}

            {picked && (
              <>
                <View style={[styles.pickedBox, { backgroundColor: C.accentSoft }]}>
                  <Avatar u={picked} size={40} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: C.text, fontWeight: "800" }} numberOfLines={1}>{picked.name || picked.nickname}</Text>
                    <Text style={{ color: C.sub, fontSize: 12 }} numberOfLines={1}>{picked.phone || picked.email || ""}</Text>
                  </View>
                  {isAdd && <TouchableOpacity onPress={() => setPicked(null)}><Text style={{ color: C.accent, fontWeight: "700" }}>Đổi</Text></TouchableOpacity>}
                </View>

                <Text style={{ color: C.sub, fontSize: 13, fontWeight: "700", marginTop: 14, marginBottom: 8 }}>Vai trò</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {roles.map((r: any) => {
                    const on = role === r.key;
                    return (
                      <TouchableOpacity key={r.key} onPress={() => applyRolePreset(r.key)} style={[styles.roleSeg, { backgroundColor: on ? C.accent : C.field }]}>
                        <Text style={{ color: on ? C.onAccent : C.text, fontWeight: "700", fontSize: 13 }}>{r.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {role === "manager" ? (
                  <View style={[styles.mgrNote, { backgroundColor: C.field }]}>
                    <Ionicons name="shield-checkmark" size={16} color="#8b5cf6" />
                    <Text style={{ color: C.sub, fontSize: 12.5, flex: 1 }}>Quản lý có toàn quyền như chủ sân (trừ chuyển nhượng quyền sở hữu).</Text>
                  </View>
                ) : (
                  <>
                    <Text style={{ color: C.sub, fontSize: 13, fontWeight: "700", marginTop: 14, marginBottom: 4 }}>Quyền chi tiết</Text>
                    {Object.keys(groups).map((g) => (
                      <View key={g} style={{ marginTop: 8 }}>
                        <Text style={{ color: C.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.5, marginBottom: 4 }}>{g.toUpperCase()}</Text>
                        {groups[g].map((p: any) => {
                          const on = perms.includes(p.key);
                          return (
                            <TouchableOpacity key={p.key} onPress={() => togglePerm(p.key)} style={styles.permRow}>
                              <Ionicons name={on ? "checkbox" : "square-outline"} size={20} color={on ? C.accent : C.muted} />
                              <Text style={{ color: C.text, fontSize: 14, flex: 1 }}>{p.label}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    ))}
                  </>
                )}

                <PrimaryButton C={C} icon="checkmark" label={adding || updating ? "Đang lưu…" : isAdd ? "Thêm nhân viên" : "Lưu phân quyền"} disabled={adding || updating} onPress={save} style={{ marginTop: 18 }} />
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  permTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  act: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  modalWrap: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(2,6,23,0.6)" },
  modal: { padding: SP.lg, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, paddingBottom: 32, maxHeight: "90%" },
  search: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: StyleSheet.hairlineWidth, borderRadius: R.sm, paddingHorizontal: 12, height: 46 },
  userRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  pickedBox: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: R.md },
  roleSeg: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: "center" },
  mgrNote: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: R.sm, marginTop: 12 },
  permRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9 },
});
