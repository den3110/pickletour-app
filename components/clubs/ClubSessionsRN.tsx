// components/clubs/ClubSessionsRN.tsx
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
} from "react-native";
import dayjs from "dayjs";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Image as ExpoImage } from "expo-image";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import DateTimePickerModal from "react-native-modal-datetime-picker";
import { Section, EmptyState } from "./ui";
import { normalizeUrl } from "@/utils/normalizeUri";
import {
  useListSessionsQuery,
  useCreateSessionMutation,
  useUpdateSessionMutation,
  useDeleteSessionMutation,
  useCheckinSessionMutation,
  useListSessionAttendanceQuery,
  useSessionStatsQuery,
} from "@/slices/clubsApiSlice";

const getApiErrMsg = (e: any) =>
  e?.data?.message ||
  e?.error ||
  (typeof e?.data === "string" ? e.data : "Có lỗi xảy ra.");
const fmt = (s: any) => dayjs(s).format("HH:mm, DD/MM/YYYY");

function Attendees({ clubId, session }: { clubId: string; session: any }) {
  const [open, setOpen] = useState(false);
  const { data, isFetching } = useListSessionAttendanceQuery(
    { id: clubId, sessionId: session._id },
    { skip: !open }
  );
  const people = data?.items || [];
  const count = Number(session.attendeeCount || 0);
  if (!count) return null;
  return (
    <View style={{ marginTop: 8 }}>
      <TouchableOpacity onPress={() => setOpen((v) => !v)} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <MaterialCommunityIcons name={open ? "chevron-up" : "chevron-down"} size={16} color="#5C6285" />
        <Text style={{ color: "#5C6285", fontWeight: "700", fontSize: 12.5 }}>Người tham gia ({count})</Text>
      </TouchableOpacity>
      {open && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          {isFetching ? (
            <Text style={{ color: "#7780A1", fontSize: 12 }}>Đang tải…</Text>
          ) : (
            people.map((u: any) => (
              <View key={u._id} style={styles.attChip}>
                <ExpoImage source={{ uri: normalizeUrl(u.avatar) }} style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "#E0E7FF" }} />
                <Text style={{ color: "#3B3F75", fontSize: 12, fontWeight: "600" }}>{u.nickname || u.fullName || "Người dùng"}</Text>
              </View>
            ))
          )}
        </View>
      )}
    </View>
  );
}

export default function ClubSessionsRN({
  club,
  canManage,
}: {
  club: any;
  canManage: boolean;
}) {
  const id = club?._id;
  const [view, setView] = useState<"list" | "stats">("list");

  const { data, isLoading } = useListSessionsQuery({ id }, { skip: !id });
  const { data: stats } = useSessionStatsQuery({ id }, { skip: !id || view !== "stats" });
  const [createSession, { isLoading: creating }] = useCreateSessionMutation();
  const [updateSession, { isLoading: updating }] = useUpdateSessionMutation();
  const [deleteSession] = useDeleteSessionMutation();
  const [checkin] = useCheckinSessionMutation();

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState("Buổi tập");
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [repeatWeeks, setRepeatWeeks] = useState("1");
  const [startAt, setStartAt] = useState<Date>(dayjs().add(1, "hour").startOf("hour").toDate());
  const [showDate, setShowDate] = useState(false);

  const items = data?.items || [];

  const resetForm = () => {
    setEditId(null);
    setTitle("Buổi tập");
    setLocation("");
    setNote("");
    setRepeatWeeks("1");
    setStartAt(dayjs().add(1, "hour").startOf("hour").toDate());
    setShowForm(false);
  };
  const startEdit = (s: any) => {
    setEditId(s._id);
    setTitle(s.title || "Buổi tập");
    setLocation(s.location || "");
    setNote(s.note || "");
    setStartAt(new Date(s.startAt));
    setShowForm(true);
  };
  const submit = async () => {
    const body: any = {
      title: title.trim() || "Buổi tập",
      startAt: startAt.toISOString(),
      location: location.trim(),
      note: note.trim(),
    };
    try {
      if (editId) await updateSession({ id, sessionId: editId, ...body }).unwrap();
      else {
        const n = Math.max(1, parseInt(repeatWeeks, 10) || 1);
        await createSession({ id, ...body, repeatWeeks: n }).unwrap();
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      resetForm();
    } catch (e) {
      Alert.alert("Lỗi", getApiErrMsg(e));
    }
  };
  const remove = (s: any) =>
    Alert.alert("Xoá buổi tập", "Xoá buổi tập này?", [
      { text: "Huỷ", style: "cancel" },
      { text: "Xoá", style: "destructive", onPress: async () => { try { await deleteSession({ id, sessionId: s._id }).unwrap(); } catch (e) { Alert.alert("Lỗi", getApiErrMsg(e)); } } },
    ]);
  const doCheckin = async (s: any) => {
    try {
      await checkin({ id, sessionId: s._id }).unwrap();
      Haptics.selectionAsync();
    } catch (e) {
      Alert.alert("Lỗi", getApiErrMsg(e));
    }
  };

  return (
    <Section title="Buổi tập">
      <View style={styles.viewToggle}>
        {[{ k: "list", l: "Buổi tập" }, { k: "stats", l: "Chuyên cần" }].map((v) => (
          <TouchableOpacity key={v.k} style={[styles.viewBtn, view === v.k && styles.viewBtnActive]} onPress={() => setView(v.k as any)}>
            <Text style={[styles.viewBtnText, view === v.k && { color: "#fff" }]}>{v.l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {view === "stats" ? (
        <>
          <Text style={{ color: "#7780A1", fontSize: 12, marginBottom: 8 }}>Tổng số buổi: {stats?.totalSessions || 0}</Text>
          {(stats?.items || []).length === 0 ? (
            <EmptyState label="Chưa có dữ liệu chuyên cần" icon="calendar-check" />
          ) : (
            <View style={styles.card}>
              {(stats?.items || []).map((it: any, i: number) => (
                <View key={it.user._id} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: "#EEF1F8" }]}>
                  <Text style={[styles.rank, i < 3 && { color: "#B7791F" }]}>{i + 1}</Text>
                  <ExpoImage source={{ uri: normalizeUrl(it.user.avatar) }} style={styles.avatar} />
                  <Text style={styles.name} numberOfLines={1}>{it.user.nickname || it.user.fullName || "Người dùng"}</Text>
                  <Text style={styles.count}>{it.count} buổi</Text>
                </View>
              ))}
            </View>
          )}
        </>
      ) : (
        <>
          {canManage && (
            <View style={styles.card}>
              {!showForm ? (
                <TouchableOpacity style={styles.addBtn} onPress={() => { resetForm(); setShowForm(true); }}>
                  <LinearGradient colors={["#667eea", "#764ba2"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
                  <MaterialCommunityIcons name="plus" size={15} color="#fff" />
                  <Text style={styles.addBtnText}>Tạo buổi tập</Text>
                </TouchableOpacity>
              ) : (
                <View>
                  <Text style={styles.label}>Tên buổi</Text>
                  <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholderTextColor="#8A90B2" />
                  <Text style={styles.label}>Thời gian</Text>
                  <TouchableOpacity style={styles.input} onPress={() => setShowDate(true)}>
                    <Text style={{ color: "#1F2557", paddingVertical: 2 }}>{fmt(startAt)}</Text>
                  </TouchableOpacity>
                  <DateTimePickerModal isVisible={showDate} mode="datetime" date={startAt} onConfirm={(d) => { setStartAt(d); setShowDate(false); }} onCancel={() => setShowDate(false)} is24Hour minuteInterval={5} />
                  <Text style={styles.label}>Địa điểm</Text>
                  <TextInput style={styles.input} value={location} onChangeText={setLocation} placeholder="Sân…" placeholderTextColor="#8A90B2" />
                  {!editId && (
                    <>
                      <Text style={styles.label}>Lặp lại hàng tuần (số tuần)</Text>
                      <TextInput style={styles.input} value={repeatWeeks} onChangeText={(t) => setRepeatWeeks(t.replace(/[^\d]/g, ""))} keyboardType="numeric" />
                    </>
                  )}
                  <Text style={styles.label}>Ghi chú</Text>
                  <TextInput style={[styles.input, { minHeight: 50, textAlignVertical: "top" }]} value={note} onChangeText={setNote} multiline placeholderTextColor="#8A90B2" />
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                    <TouchableOpacity style={styles.primaryBtn} onPress={submit} disabled={creating || updating}>
                      <LinearGradient colors={["#667eea", "#764ba2"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
                      <Text style={styles.primaryBtnText}>{editId ? "Lưu" : "Tạo"}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.lightBtn} onPress={resetForm}>
                      <Text style={styles.lightBtnText}>Huỷ</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}

          {!isLoading && items.length === 0 ? (
            <EmptyState label="Chưa có buổi tập nào" icon="calendar-blank-outline" />
          ) : (
            items.map((s: any) => {
              const past = new Date(s.startAt) < new Date(Date.now() - 6 * 3600 * 1000);
              return (
                <View key={s._id} style={[styles.card, past && { opacity: 0.8 }]}>
                  <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sTitle}>{s.title}</Text>
                      <Text style={styles.sMeta}>{fmt(s.startAt)}{s.location ? ` · ${s.location}` : ""}</Text>
                      {!!s.note && <Text style={styles.sNote}>{s.note}</Text>}
                    </View>
                    {canManage && (
                      <View style={{ flexDirection: "row" }}>
                        <TouchableOpacity onPress={() => startEdit(s)} style={{ padding: 4 }}>
                          <MaterialCommunityIcons name="pencil" size={17} color="#9AA3B2" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => remove(s)} style={{ padding: 4 }}>
                          <MaterialCommunityIcons name="trash-can-outline" size={17} color="#B4232D" />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                    <TouchableOpacity style={[styles.checkinBtn, s.myCheckedIn && styles.checkinBtnActive]} onPress={() => doCheckin(s)}>
                      <MaterialCommunityIcons name="check" size={14} color={s.myCheckedIn ? "#fff" : "#1B7A46"} />
                      <Text style={[styles.checkinText, s.myCheckedIn && { color: "#fff" }]}>{s.myCheckedIn ? "Đã điểm danh" : "Điểm danh"}</Text>
                    </TouchableOpacity>
                    <Text style={{ color: "#7780A1", fontSize: 12 }}>{s.attendeeCount || 0} người tham gia</Text>
                  </View>
                  <Attendees clubId={id} session={s} />
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
  label: { color: "#5C6285", fontSize: 12.5, fontWeight: "600", marginTop: 10, marginBottom: 5 },
  input: { padding: 11, borderRadius: 12, borderWidth: 1, borderColor: "#E6E8F5", backgroundColor: "#F8F9FF", color: "#1F2557" },

  addBtn: { flexDirection: "row", gap: 6, alignSelf: "flex-start", height: 40, paddingHorizontal: 18, borderRadius: 999, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  addBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  primaryBtn: { height: 40, paddingHorizontal: 20, borderRadius: 999, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  lightBtn: { height: 40, paddingHorizontal: 18, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: "#F3F4FF", borderWidth: 1, borderColor: "#E6E8F5" },
  lightBtnText: { color: "#3B3F75", fontWeight: "800", fontSize: 14 },

  sTitle: { color: "#1F2557", fontWeight: "800", fontSize: 15.5 },
  sMeta: { color: "#5C6285", fontSize: 13, marginTop: 3 },
  sNote: { color: "#3E4466", fontSize: 13, marginTop: 6 },
  checkinBtn: { flexDirection: "row", gap: 5, alignItems: "center", height: 34, paddingHorizontal: 14, borderRadius: 999, backgroundColor: "#E4F7EC", borderWidth: 1, borderColor: "#B5E6C9" },
  checkinBtnActive: { backgroundColor: "#3BA55D", borderColor: "#3BA55D" },
  checkinText: { color: "#1B7A46", fontWeight: "800", fontSize: 12.5 },

  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  rank: { width: 22, textAlign: "center", fontWeight: "800", color: "#7780A1" },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#E0E7FF" },
  name: { flex: 1, color: "#1F2557", fontWeight: "600", fontSize: 14 },
  count: { color: "#3E4466", fontWeight: "700", fontSize: 13.5 },

  attChip: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#F3F4FF", borderRadius: 999, paddingVertical: 3, paddingHorizontal: 8, borderWidth: 1, borderColor: "#E6E8F5" },
});
