// components/clubs/ClubEventsRN.tsx
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Platform,
  Alert,
} from "react-native";
import dayjs from "dayjs";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
// ❌ bỏ community inline picker
// import DateTimePicker from "@react-native-community/datetimepicker";
// ✅ dùng modal picker
import DateTimePickerModal from "react-native-modal-datetime-picker";
import { Section, EmptyState } from "./ui";
import {
  useListEventsQuery,
  useRsvpEventMutation,
  useDeleteEventMutation,
  useCreateEventMutation,
} from "@/slices/clubsApiSlice";

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
}: {
  title: string;
  onPress?: () => void;
  loading?: boolean;
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
      <Text style={styles.smallBtnText}>{loading ? "Đang xử lý…" : title}</Text>
    </TouchableOpacity>
  );
}

function SmallLightBtn({
  title,
  onPress,
  loading,
}: {
  title: string;
  onPress?: () => void;
  loading?: boolean;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={styles.smallLightBtn}
      disabled={loading}
    >
      <Text style={styles.smallLightText}>
        {loading ? "Đang xử lý…" : title}
      </Text>
    </TouchableOpacity>
  );
}

function SmallDangerGhostBtn({
  title,
  onPress,
  loading,
}: {
  title: string;
  onPress?: () => void;
  loading?: boolean;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={styles.smallDangerBtn}
      disabled={loading}
    >
      <Text style={styles.smallDangerText}>
        {loading ? "Đang xoá…" : title}
      </Text>
    </TouchableOpacity>
  );
}

const fmt = (s?: string | Date) =>
  s ? dayjs(s).format("HH:mm, DD/MM/YYYY") : "—";

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
  const [rsvp, { isLoading: rsvping }] = useRsvpEventMutation();
  const [del, { isLoading: deleting }] = useDeleteEventMutation();

  const items = useMemo(() => data?.items || [], [data]);

  // ====== Tạo sự kiện (RN form) ======
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

  // modal handlers
  const onConfirmStart = (date: Date) => {
    // nếu end <= start mới thì đẩy end = start + 1h
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

  const submitCreate = async () => {
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
    const startIso = dayjs(start).toDate().toISOString();
    const endIso = dayjs(end).toDate().toISOString();

    try {
      await createEvent({
        id: clubId,
        title: title.trim(),
        description: description.trim(),
        location: location.trim(),
        capacity: cap,
        startTime: startIso,
        endTime: endIso,
        startAt: startIso,
        endAt: endIso,
      }).unwrap();

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTitle("");
      setDescription("");
      setLocation("");
      setCapacity("0");
      setStart(defaultStart.toDate());
      setEnd(defaultStart.add(2, "hour").toDate());
      refetch();
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        "Lỗi",
        e?.data?.message ||
          e?.error ||
          (typeof e?.data === "string" ? e.data : "Có lỗi xảy ra.")
      );
    }
  };

  return (
    <Section title="Sự kiện" subtitle={isFetching ? "Đang tải…" : undefined}>
      {/* ===== Form tạo sự kiện (quản lý) ===== */}
      {canManage && (
        <GradLightCard style={{ marginBottom: 10 }}>
          <Text style={styles.title}>Tạo sự kiện</Text>

          {/* Tiêu đề */}
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Tiêu đề"
            placeholderTextColor="#7C83AB"
            style={styles.input}
          />

          {/* Mô tả */}
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Mô tả (tuỳ chọn)"
            placeholderTextColor="#7C83AB"
            multiline
            style={[styles.input, { minHeight: 90, textAlignVertical: "top" }]}
          />

          {/* Địa điểm */}
          <TextInput
            value={location}
            onChangeText={setLocation}
            placeholder="Địa điểm"
            placeholderTextColor="#7C83AB"
            style={styles.input}
          />

          {/* Thời gian */}
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

          {/* Modal pickers */}
          <DateTimePickerModal
            isVisible={showStartPicker}
            mode="datetime"
            date={start}
            onConfirm={onConfirmStart}
            onCancel={onCancelStart}
            minimumDate={new Date()}
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

          {/* Sức chứa */}
          <TextInput
            value={capacity}
            onChangeText={setCapacity}
            placeholder="Sức chứa (0 = không giới hạn)"
            placeholderTextColor="#7C83AB"
            keyboardType="numeric"
            style={styles.input}
          />

          <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
            <SmallPrimaryGradBtn
              title={creating ? "Đang tạo…" : "Tạo sự kiện"}
              onPress={submitCreate}
              loading={creating}
            />
          </View>
        </GradLightCard>
      )}

      {/* ===== Danh sách sự kiện ===== */}
      {items.map((ev: any) => {
        const goingCount = ev?.stats?.going || 0;
        const capacity = ev?.capacity || 0;

        return (
          <GradLightCard key={ev._id} style={{ marginBottom: 10 }}>
            <Text style={styles.title}>{ev.title}</Text>
            <Text style={styles.meta}>
              {fmt(ev.startTime || ev.startAt)} – {fmt(ev.endTime || ev.endAt)}{" "}
              • {ev.location || "—"}
            </Text>
            {!!ev.description && (
              <Text style={styles.desc}>{ev.description}</Text>
            )}

            {!!capacity && (
              <Text style={[styles.meta, { marginTop: 4 }]}>
                {goingCount}/{capacity}
              </Text>
            )}

            <View style={styles.actionsRow}>
              <SmallPrimaryGradBtn
                title="Tham gia"
                loading={rsvping}
                onPress={async () => {
                  await rsvp({
                    id: clubId,
                    eventId: ev._id,
                    status: "going",
                  }).unwrap();
                  Haptics.selectionAsync();
                  refetch();
                }}
              />
              <SmallLightBtn
                title="Không tham gia"
                loading={rsvping}
                onPress={async () => {
                  await rsvp({
                    id: clubId,
                    eventId: ev._id,
                    status: "not_going",
                  }).unwrap();
                  Haptics.selectionAsync();
                  refetch();
                }}
              />
              <SmallLightBtn
                title="Huỷ RSVP"
                loading={rsvping}
                onPress={async () => {
                  await rsvp({
                    id: clubId,
                    eventId: ev._id,
                    status: "none",
                  }).unwrap();
                  Haptics.selectionAsync();
                  refetch();
                }}
              />
              {canManage && (
                <SmallDangerGhostBtn
                  title="Xoá"
                  loading={deleting}
                  onPress={async () => {
                    try {
                      await del({ id: clubId, eventId: ev._id }).unwrap();
                      Haptics.selectionAsync();
                      refetch();
                    } catch (e: any) {
                      Alert.alert(
                        "Lỗi",
                        e?.data?.message ||
                          e?.error ||
                          (typeof e?.data === "string"
                            ? e.data
                            : "Có lỗi xảy ra.")
                      );
                    }
                  }}
                />
              )}
            </View>
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
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  smallBtnText: { color: "#FFFFFF", fontWeight: "800", fontSize: 13 },

  smallLightBtn: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4FF",
    borderWidth: 1,
    borderColor: "#E6E8F5",
  },
  smallLightText: { color: "#3B3F75", fontWeight: "800", fontSize: 13 },

  smallDangerBtn: {
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
