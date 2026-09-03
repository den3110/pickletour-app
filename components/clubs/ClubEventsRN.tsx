// components/clubs/ClubEventsRN.tsx
import React, { useMemo, useState } from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Linking,
} from "react-native";
import { TextInput } from "@/components/ui/i18nTextInput";
import { Text } from "@/components/ui/i18nText";
import dayjs from "dayjs";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import DateTimePickerModal from "react-native-modal-datetime-picker";
import { Section, EmptyState } from "./ui";
import { BASE_URL } from "@/slices/apiSlice";
import {
  useListEventsQuery,
  useRsvpEventMutation,
  useDeleteEventMutation,
  useCreateEventMutation,
  useUpdateEventMutation,
  useListEventAttendeesQuery,
} from "@/slices/clubsApiSlice";
import { Image as ExpoImage } from "expo-image";
import { normalizeUrl } from "@/utils/normalizeUri";

const getApiErrMsg = (e: any) =>
  e?.data?.message ||
  e?.error ||
  (typeof e?.data === "string" ? e.data : "Có lỗi xảy ra.");

/* ---------- Card nền sáng phủ gradient tím rất nhẹ ---------- */
function GradLightCard({
  children,
  style,
  pad = 12,
}: {
  children: React.ReactNode;
  style?: any;
  pad?: number;
}) {
  return (
    <View style={[styles.card, style]}>
      <LinearGradient
        colors={["rgba(102,126,234,0.06)", "rgba(118,75,162,0.06)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={{ padding: pad }}>{children}</View>
    </View>
  );
}

/* ---------- Buttons (phù hợp nền sáng) ---------- */
function SmallPrimaryGradBtn({
  title,
  onPress,
  loading,
  icon,
}: {
  title: string;
  onPress?: () => void;
  loading?: boolean;
  icon?: any;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={styles.smallBtn}
      disabled={loading}
    >
      <LinearGradient
        colors={["#667eea", "#764ba2"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {!!icon && (
        <MaterialCommunityIcons
          name={icon}
          size={14}
          color="#fff"
          style={{ marginRight: 4 }}
        />
      )}
      <Text style={styles.smallBtnText}>{loading ? "Đang xử lý…" : title}</Text>
    </TouchableOpacity>
  );
}

function SmallLightBtn({
  title,
  onPress,
  loading,
  icon,
  active,
}: {
  title: string;
  onPress?: () => void;
  loading?: boolean;
  icon?: any;
  active?: boolean;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={[styles.smallLightBtn, active && styles.smallLightBtnActive]}
      disabled={loading}
    >
      {!!icon && (
        <MaterialCommunityIcons
          name={icon}
          size={14}
          color={active ? "#1B7A46" : "#3B3F75"}
          style={{ marginRight: 4 }}
        />
      )}
      <Text
        style={[styles.smallLightText, active && { color: "#1B7A46" }]}
      >
        {loading ? "Đang xử lý…" : title}
      </Text>
    </TouchableOpacity>
  );
}

function SmallDangerGhostBtn({
  title,
  onPress,
  loading,
  icon,
}: {
  title: string;
  onPress?: () => void;
  loading?: boolean;
  icon?: any;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={styles.smallDangerBtn}
      disabled={loading}
    >
      {!!icon && (
        <MaterialCommunityIcons
          name={icon}
          size={14}
          color="#B4232D"
          style={{ marginRight: 4 }}
        />
      )}
      <Text style={styles.smallDangerText}>
        {loading ? "Đang xử lý…" : title}
      </Text>
    </TouchableOpacity>
  );
}

const fmt = (s?: string | Date) =>
  s ? dayjs(s).format("HH:mm, DD/MM/YYYY") : "—";

/* Danh sách người tham gia sự kiện (mở/đóng, fetch khi mở) */
function EventAttendees({ clubId, event }: { clubId: string; event: any }) {
  const [open, setOpen] = useState(false);
  const { data, isFetching } = useListEventAttendeesQuery(
    { id: clubId, eventId: event._id },
    { skip: !open }
  );
  const attendees = data?.items || [];
  const count = Number(event.attendeesCount || 0);
  if (!count) return null;
  return (
    <View style={{ marginTop: 10 }}>
      <TouchableOpacity
        onPress={() => setOpen((v) => !v)}
        style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
      >
        <MaterialCommunityIcons
          name={open ? "chevron-up" : "chevron-down"}
          size={16}
          color="#5C6285"
        />
        <Text style={{ color: "#5C6285", fontWeight: "700", fontSize: 12.5 }}>
          Người tham gia ({count})
        </Text>
      </TouchableOpacity>
      {open && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          {isFetching ? (
            <Text style={{ color: "#7780A1", fontSize: 12 }}>Đang tải…</Text>
          ) : attendees.length === 0 ? (
            <Text style={{ color: "#7780A1", fontSize: 12 }}>Chưa có ai.</Text>
          ) : (
            attendees.map((u: any) => (
              <View
                key={u._id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 5,
                  backgroundColor: "#F3F4FF",
                  borderRadius: 999,
                  paddingVertical: 3,
                  paddingHorizontal: 8,
                  borderWidth: 1,
                  borderColor: "#E6E8F5",
                }}
              >
                <ExpoImage
                  source={{ uri: normalizeUrl(u.avatar) }}
                  style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "#E0E7FF" }}
                />
                <Text style={{ color: "#3B3F75", fontSize: 12, fontWeight: "600" }}>
                  {u.nickname || u.fullName || "Người dùng"}
                </Text>
              </View>
            ))
          )}
        </View>
      )}
    </View>
  );
}

/* ---------- Main ---------- */
export default function ClubEventsRN({
  club,
  canManage,
}: {
  club: any;
  canManage: boolean;
}) {
  const clubId = club?._id;

  const { data, isFetching, refetch } = useListEventsQuery(
    { id: clubId },
    { skip: !clubId }
  );

  const [createEvent, { isLoading: creating }] = useCreateEventMutation();
  const [updateEvent, { isLoading: updating }] = useUpdateEventMutation();
  const [rsvp, { isLoading: rsvping }] = useRsvpEventMutation();
  const [del, { isLoading: deleting }] = useDeleteEventMutation();

  const items = useMemo(() => data?.items || [], [data]);

  // ====== Form tạo/sửa sự kiện ======
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [location, setLocation] = useState<string>("");

  const defaultStart = dayjs().add(1, "hour").startOf("hour");
  const [start, setStart] = useState<Date>(defaultStart.toDate());
  const [end, setEnd] = useState<Date>(defaultStart.add(2, "hour").toDate());

  const [capacity, setCapacity] = useState<string>("0");

  // modal picker visibility
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const onConfirmStart = (date: Date) => {
    const nextEnd = dayjs(end).isAfter(date)
      ? end
      : dayjs(date).add(1, "hour").toDate();
    setStart(date);
    setEnd(nextEnd);
    setShowStartPicker(false);
  };
  const onCancelStart = () => setShowStartPicker(false);

  const onConfirmEnd = (date: Date) => {
    if (!dayjs(date).isAfter(start)) {
      Alert.alert(
        "Thời gian không hợp lệ",
        "Kết thúc phải sau thời gian bắt đầu."
      );
      return;
    }
    setEnd(date);
    setShowEndPicker(false);
  };
  const onCancelEnd = () => setShowEndPicker(false);

  const resetForm = () => {
    setEditId(null);
    setTitle("");
    setDescription("");
    setLocation("");
    setCapacity("0");
    setStart(defaultStart.toDate());
    setEnd(defaultStart.add(2, "hour").toDate());
  };

  const startEdit = (ev: any) => {
    setEditId(ev._id);
    setTitle(ev.title || "");
    setDescription(ev.description || "");
    setLocation(ev.location || "");
    setCapacity(String(ev.capacity || 0));
    setStart(new Date(ev.startAt || ev.startTime));
    setEnd(new Date(ev.endAt || ev.endTime));
  };

  const submitSave = async () => {
    const cap = Number.isFinite(+capacity) ? Math.max(0, +capacity) : 0;
    if (!title.trim()) {
      Alert.alert("Thiếu thông tin", "Nhập tiêu đề sự kiện.");
      return;
    }
    if (!dayjs(end).isAfter(start)) {
      Alert.alert(
        "Thời gian không hợp lệ",
        "Kết thúc phải sau thời gian bắt đầu."
      );
      return;
    }
    const body = {
      title: title.trim(),
      description: description.trim(),
      location: location.trim(),
      capacity: cap,
      rsvp: cap > 0 ? "limit" : "open",
      startAt: dayjs(start).toDate().toISOString(),
      endAt: dayjs(end).toDate().toISOString(),
    };

    try {
      if (editId) {
        await updateEvent({ id: clubId, eventId: editId, ...body }).unwrap();
      } else {
        await createEvent({ id: clubId, ...body }).unwrap();
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      resetForm();
      refetch();
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Lỗi", getApiErrMsg(e));
    }
  };

  const doRsvp = async (ev: any, status: "going" | "not_going") => {
    const next = ev.myStatus === status ? "none" : status;
    try {
      await rsvp({ id: clubId, eventId: ev._id, status: next }).unwrap();
      Haptics.selectionAsync();
      refetch();
    } catch (e: any) {
      Alert.alert("Lỗi", getApiErrMsg(e));
    }
  };

  const addToCalendar = (ev: any) => {
    const url = `${BASE_URL}/api/clubs/${clubId}/events/${ev._id}/ics`;
    Linking.openURL(url).catch(() =>
      Alert.alert("Lỗi", "Không mở được tệp lịch.")
    );
  };

  const confirmDelete = (ev: any) => {
    Alert.alert("Xoá sự kiện", `Xoá sự kiện "${ev.title}"?`, [
      { text: "Huỷ", style: "cancel" },
      {
        text: "Xoá",
        style: "destructive",
        onPress: async () => {
          try {
            await del({ id: clubId, eventId: ev._id }).unwrap();
            Haptics.selectionAsync();
            refetch();
          } catch (e: any) {
            Alert.alert("Lỗi", getApiErrMsg(e));
          }
        },
      },
    ]);
  };

  return (
    <Section title="Sự kiện" subtitle={isFetching ? "Đang tải…" : undefined}>
      {/* ===== Form tạo/sửa sự kiện (quản lý) ===== */}
      {canManage && (
        <GradLightCard style={{ marginBottom: 10 }}>
          <Text style={styles.title}>
            {editId ? "Sửa sự kiện" : "Tạo sự kiện"}
          </Text>

          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Tiêu đề"
            placeholderTextColor="#7C83AB"
            style={styles.input}
          />

          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Mô tả (tuỳ chọn)"
            placeholderTextColor="#7C83AB"
            multiline
            style={[styles.input, { minHeight: 90, textAlignVertical: "top" }]}
          />

          <TextInput
            value={location}
            onChangeText={setLocation}
            placeholder="Địa điểm"
            placeholderTextColor="#7C83AB"
            style={styles.input}
          />

          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              style={[styles.timeBtn, { flex: 1 }]}
              onPress={() => setShowStartPicker(true)}
            >
              <Text style={styles.timeBtnLabel}>Bắt đầu</Text>
              <Text style={styles.timeBtnValue}>{fmt(start)}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.timeBtn, { flex: 1 }]}
              onPress={() => setShowEndPicker(true)}
            >
              <Text style={styles.timeBtnLabel}>Kết thúc</Text>
              <Text style={styles.timeBtnValue}>{fmt(end)}</Text>
            </TouchableOpacity>
          </View>

          <DateTimePickerModal
            isVisible={showStartPicker}
            mode="datetime"
            date={start}
            onConfirm={onConfirmStart}
            onCancel={onCancelStart}
            minimumDate={editId ? undefined : new Date()}
            is24Hour
            minuteInterval={5}
          />
          <DateTimePickerModal
            isVisible={showEndPicker}
            mode="datetime"
            date={end}
            onConfirm={onConfirmEnd}
            onCancel={onCancelEnd}
            minimumDate={dayjs(start).add(1, "minute").toDate()}
            is24Hour
            minuteInterval={5}
          />

          <TextInput
            value={capacity}
            onChangeText={setCapacity}
            placeholder="Sức chứa (0 = không giới hạn)"
            placeholderTextColor="#7C83AB"
            keyboardType="numeric"
            style={styles.input}
          />

          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            <SmallPrimaryGradBtn
              title={editId ? "Lưu thay đổi" : "Tạo sự kiện"}
              onPress={submitSave}
              loading={creating || updating}
            />
            {editId && <SmallLightBtn title="Huỷ" onPress={resetForm} />}
          </View>
        </GradLightCard>
      )}

      {/* ===== Danh sách sự kiện ===== */}
      {items.map((ev: any) => {
        const goingCount = ev?.attendeesCount ?? ev?.stats?.going ?? 0;
        const cap = ev?.capacity || 0;
        const past = dayjs(ev.endAt || ev.endTime).isBefore(dayjs());

        return (
          <GradLightCard
            key={ev._id}
            style={{ marginBottom: 10, opacity: past ? 0.75 : 1 }}
          >
            <Text style={styles.title}>{ev.title}</Text>
            <Text style={styles.meta}>
              {fmt(ev.startAt || ev.startTime)} – {fmt(ev.endAt || ev.endTime)}
              {ev.location ? ` • ${ev.location}` : ""}
            </Text>
            {!!ev.description && (
              <Text style={styles.desc}>{ev.description}</Text>
            )}

            <Text style={[styles.meta, { marginTop: 4 }]}>
              {`${goingCount}${cap ? `/${cap}` : ""} tham gia`}
              {past ? "  • Đã kết thúc" : ""}
            </Text>

            {!past && (
              <View style={styles.actionsRow}>
                <SmallLightBtn
                  title={ev.myStatus === "going" ? "Sẽ tham gia ✓" : "Tham gia"}
                  icon="check-circle-outline"
                  active={ev.myStatus === "going"}
                  loading={rsvping}
                  onPress={() => doRsvp(ev, "going")}
                />
                <SmallLightBtn
                  title="Không tham gia"
                  icon="close-circle-outline"
                  loading={rsvping}
                  onPress={() => doRsvp(ev, "not_going")}
                />
                <SmallLightBtn
                  title="Thêm vào lịch"
                  icon="calendar-plus"
                  onPress={() => addToCalendar(ev)}
                />
              </View>
            )}

            {canManage && (
              <View style={styles.actionsRow}>
                <SmallLightBtn
                  title="Sửa"
                  icon="pencil"
                  onPress={() => startEdit(ev)}
                />
                <SmallDangerGhostBtn
                  title="Xoá"
                  icon="trash-can-outline"
                  loading={deleting}
                  onPress={() => confirmDelete(ev)}
                />
              </View>
            )}

            <EventAttendees clubId={clubId} event={ev} />
          </GradLightCard>
        );
      })}

      {!items.length && !isFetching && (
        <EmptyState label="Chưa có sự kiện" icon="calendar-remove" />
      )}
    </Section>
  );
}

/* ---------- Styles ---------- */
const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E6E8F5",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
    elevation: 3,
  },

  title: { color: "#1F2557", fontWeight: "800", fontSize: 16 },
  meta: { color: "#5C6285", marginTop: 2 },
  desc: { color: "#3E4466", marginTop: 6 },

  actionsRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 10,
  },

  smallBtn: {
    flexDirection: "row",
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  smallBtnText: { color: "#FFFFFF", fontWeight: "800", fontSize: 13 },

  smallLightBtn: {
    flexDirection: "row",
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4FF",
    borderWidth: 1,
    borderColor: "#E6E8F5",
  },
  smallLightBtnActive: {
    backgroundColor: "#E4F7EC",
    borderColor: "#B5E6C9",
  },
  smallLightText: { color: "#3B3F75", fontWeight: "800", fontSize: 13 },

  smallDangerBtn: {
    flexDirection: "row",
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFE9EC",
    borderWidth: 1,
    borderColor: "#FFD5DA",
  },
  smallDangerText: { color: "#B4232D", fontWeight: "800", fontSize: 13 },

  input: {
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E1E4F3",
    backgroundColor: "#FFFFFF",
    color: "#1F2557",
  },
  timeBtn: {
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E1E4F3",
    backgroundColor: "#FFFFFF",
  },
  timeBtnLabel: { color: "#5C6285", fontSize: 12, marginBottom: 2 },
  timeBtnValue: { color: "#1F2557", fontWeight: "700" },
});
