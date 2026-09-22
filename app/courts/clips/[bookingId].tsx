// app/courts/clips/[bookingId].tsx — Cắt clip camera sân từ 1 lượt đặt.
// User chọn camera + khoảng thời gian TRONG giờ đã đặt → gửi yêu cầu; server xử lý
// TUẦN TỰ (mỗi lúc 1 clip). Danh sách bên dưới tự cập nhật khi đang xử lý.
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Text } from "@/components/ui/i18nText";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { useVideoPlayer, VideoView } from "expo-video";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import DateTimePickerModal from "react-native-modal-datetime-picker";
import { useThemeTokens } from "@/hooks/useThemeTokens";
import { Chip, shadow, R, SP } from "@/components/courts/ui";
import { tLabel } from "@/utils/courtFormat";
import {
  useGetBookingClipInfoQuery,
  useListMyClipsQuery,
  useCreateClipMutation,
  useDeleteClipMutation,
} from "@/slices/clipsApiSlice";

const STEP_MIN = 5;
const DURATIONS = [5, 10, 15, 20, 25, 30];

const STATUS_META: Record<string, { label: string; color: string; icon: any }> = {
  pending_approval: { label: "Chờ chủ sân duyệt", color: "#a855f7", icon: "hourglass-outline" },
  queued: { label: "Đang chờ", color: "#f59e0b", icon: "time-outline" },
  processing: { label: "Đang cắt", color: "#3b82f6", icon: "sync-outline" },
  done: { label: "Xong", color: "#22c55e", icon: "checkmark-circle" },
  failed: { label: "Thất bại", color: "#ef4444", icon: "alert-circle" },
  cancelled: { label: "Đã huỷ", color: "#94a3b8", icon: "close-circle" },
  rejected: { label: "Bị từ chối", color: "#ef4444", icon: "close-circle" },
};

function fmtSize(bytes?: number) {
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}
function fmtDur(sec?: number) {
  if (!sec) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m ? `${m}p${s ? ` ${s}s` : ""}` : `${s}s`;
}

/** Trình phát 1 clip (expo-video). Tách riêng vì useVideoPlayer là hook top-level. */
function ClipPlayer({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
    p.pause();
  });
  return (
    <VideoView
      player={player}
      style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: R.md, backgroundColor: "#000" }}
      nativeControls
      contentFit="contain"
    />
  );
}

export default function ClipCutScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const theme = useTheme();
  const dark = !!theme.dark;
  const C = useThemeTokens();

  const { data: info, isLoading: loadingInfo } = useGetBookingClipInfoQuery(bookingId, {
    skip: !bookingId,
  });

  const cams = info?.cams || [];
  const windowStart = info?.startAt ? new Date(info.startAt).getTime() : 0;
  const windowEnd = info?.endAt ? new Date(info.endAt).getTime() : 0;
  const maxMinutes = info?.maxMinutes || 30;

  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [startMs, setStartMs] = useState<number | null>(null);
  const [durationMin, setDurationMin] = useState<number>(10);
  const [openClipId, setOpenClipId] = useState<string | null>(null);
  // Cắt NGOÀI giờ đã đặt → cần chủ sân duyệt; chọn giờ tự do (quá khứ).
  const [outside, setOutside] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [outsideStart, setOutsideStart] = useState<number | null>(null);

  const effDevice = deviceId || cams[0]?.deviceId || null;
  const effStart = outside ? outsideStart ?? 0 : startMs ?? windowStart;

  // Các mốc "bắt đầu" mỗi 5 phút trong khung giờ đã đặt.
  const startOptions = useMemo(() => {
    if (!windowStart || !windowEnd) return [] as number[];
    const out: number[] = [];
    for (let t = windowStart; t <= windowEnd - STEP_MIN * 60000; t += STEP_MIN * 60000) {
      out.push(t);
    }
    if (!out.length) out.push(windowStart);
    return out;
  }, [windowStart, windowEnd]);

  // Độ dài hợp lệ: ≤ maxMinutes. Trong giờ đặt: ≤ thời gian còn lại của giờ đặt.
  // Ngoài giờ đặt: kết thúc không vượt quá hiện tại (thẻ SD chỉ có cảnh quá khứ).
  const durationOptions = useMemo(() => {
    if (outside) {
      if (!effStart) return DURATIONS.filter((m) => m <= maxMinutes);
      const remainMin = Math.floor((Date.now() - effStart) / 60000);
      return DURATIONS.filter((m) => m <= maxMinutes && m <= remainMin);
    }
    const remainMin = Math.floor((windowEnd - effStart) / 60000);
    return DURATIONS.filter((m) => m <= maxMinutes && m <= remainMin);
  }, [outside, windowEnd, effStart, maxMinutes]);

  const effDuration = durationOptions.includes(durationMin)
    ? durationMin
    : durationOptions[0] || 0;
  const endMs = effStart + effDuration * 60000;

  // Poll 3s khi còn job đang chờ/đang cắt; dừng khi đã xong hết (cập nhật qua effect).
  const [poll, setPoll] = useState(true);
  const { data: listData } = useListMyClipsQuery(bookingId, {
    skip: !bookingId,
    pollingInterval: poll ? 3000 : 0,
  });
  const jobs = listData?.jobs || [];
  useEffect(() => {
    setPoll(
      jobs.some((j: any) =>
        ["pending_approval", "queued", "processing"].includes(j.status)
      )
    );
  }, [listData]);

  const [createClip, { isLoading: creating }] = useCreateClipMutation();
  const [deleteClip] = useDeleteClipMutation();

  const styles2 = useMemo(() => mk(C), [C]);

  async function onCreate() {
    if (!effDevice) {
      Alert.alert("Thiếu camera", "Sân này chưa gắn camera để cắt clip.");
      return;
    }
    if (outside && !outsideStart) {
      Alert.alert("Chọn thời điểm", "Hãy chọn giờ bắt đầu muốn cắt.");
      return;
    }
    if (!effDuration) {
      Alert.alert("Khoảng không hợp lệ", "Không đủ thời gian để cắt (chỉ cắt được cảnh đã qua).");
      return;
    }
    try {
      const res: any = await createClip({
        bookingId,
        deviceId: effDevice,
        startAt: new Date(effStart).toISOString(),
        endAt: new Date(endMs).toISOString(),
      }).unwrap();
      if (res?.requiresApproval) {
        Alert.alert(
          "Đã gửi yêu cầu duyệt",
          "Đây là clip NGOÀI giờ bạn đặt nên cần chủ sân duyệt. Bạn sẽ nhận thông báo khi được duyệt/từ chối."
        );
      } else {
        const ahead = res?.queueAhead || 0;
        Alert.alert(
          "Đã gửi yêu cầu cắt clip",
          ahead > 0
            ? `Đang chờ ${ahead} clip xử lý trước. Bạn sẽ nhận thông báo khi xong.`
            : "Đang xử lý. Bạn sẽ nhận thông báo khi clip sẵn sàng."
        );
      }
    } catch (e: any) {
      Alert.alert("Lỗi", e?.data?.message || "Không tạo được yêu cầu cắt clip.");
    }
  }

  async function onShare(job: any) {
    if (!job?.fileUrl) return;
    try {
      const can = await Sharing.isAvailableAsync();
      const dir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
      const dest = `${dir}clip-${job._id}.mp4`;
      const dl = await FileSystem.downloadAsync(job.fileUrl, dest);
      if (can) {
        await Sharing.shareAsync(dl.uri, {
          mimeType: "video/mp4",
          UTI: "public.mpeg-4",
          dialogTitle: "Chia sẻ / lưu clip",
        });
      } else {
        Alert.alert("Đã tải", "Clip đã được tải về máy.");
      }
    } catch (e: any) {
      Alert.alert("Lỗi", e?.message || "Không tải được clip.");
    }
  }

  function onDelete(job: any) {
    const isCancel = job.status === "queued" || job.status === "pending_approval";
    Alert.alert(
      isCancel ? "Huỷ yêu cầu?" : "Xoá clip?",
      isCancel ? "Yêu cầu đang chờ sẽ bị huỷ." : "Clip sẽ bị xoá khỏi máy chủ.",
      [
        { text: "Không", style: "cancel" },
        {
          text: isCancel ? "Huỷ" : "Xoá",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteClip({ id: job._id, bookingId }).unwrap();
            } catch (e: any) {
              Alert.alert("Lỗi", e?.data?.message || "Không thực hiện được.");
            }
          },
        },
      ]
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{ title: "Cắt clip camera" }} />
      <ScrollView
        contentContainerStyle={{ padding: SP.lg, paddingBottom: SP.xxl * 2, gap: SP.lg }}
        keyboardShouldPersistTaps="handled"
      >
        {loadingInfo ? (
          <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} />
        ) : cams.length === 0 ? (
          <View style={[styles2.card, shadow(dark, 2)]}>
            <Text style={{ color: C.text, fontWeight: "800", fontSize: 15 }}>
              Sân chưa gắn camera
            </Text>
            <Text style={{ color: C.sub, marginTop: 6, lineHeight: 19 }}>
              Sân {info?.courtName || ""} chưa có camera Imou, nên chưa thể cắt clip. Vui
              lòng liên hệ chủ sân.
            </Text>
          </View>
        ) : (
          <>
            {/* Form cắt */}
            <View style={[styles2.card, shadow(dark, 2), { gap: SP.md }]}>
              <View style={styles2.rowHead}>
                <View style={[styles2.secIcon, { backgroundColor: C.primarySoft || "rgba(59,130,246,0.16)" }]}>
                  <Ionicons name="cut" size={16} color={C.primary} />
                </View>
                <Text style={[styles2.section, { color: C.text }]}>Tạo clip mới</Text>
              </View>

              {/* Chọn camera (nếu nhiều) */}
              {cams.length > 1 && (
                <>
                  <Text style={styles2.label}>Camera</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SP.sm }}>
                    {cams.map((c: any) => {
                      const on = effDevice === c.deviceId;
                      return (
                        <TouchableOpacity
                          key={c.deviceId}
                          onPress={() => setDeviceId(c.deviceId)}
                          style={[styles2.pick, { borderColor: on ? C.primary : C.border, backgroundColor: on ? C.primarySoft || "rgba(59,130,246,0.14)" : C.field }]}
                        >
                          <Text style={{ color: on ? C.primary : C.text, fontWeight: "700", fontSize: 13 }}>
                            {c.name || "Camera"}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </>
              )}

              {/* Toggle: cắt ngoài giờ đã đặt (cần chủ sân duyệt) */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setOutside((v) => !v)}
                style={[styles2.toggleRow, { borderColor: C.border, backgroundColor: C.field }]}
              >
                <Ionicons
                  name={outside ? "checkbox" : "square-outline"}
                  size={20}
                  color={outside ? C.primary : C.sub}
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text, fontWeight: "700", fontSize: 13.5 }}>
                    Cắt ngoài khung giờ tôi đặt
                  </Text>
                  <Text style={{ color: C.sub, fontSize: 11.5, marginTop: 1 }}>
                    Yêu cầu sẽ cần chủ sân duyệt trước khi cắt.
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Chọn thời điểm bắt đầu */}
              <Text style={styles2.label}>Bắt đầu lúc</Text>
              {outside ? (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setPickerOpen(true)}
                  style={[styles2.pick, { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, borderColor: C.primary, backgroundColor: C.primarySoft || "rgba(59,130,246,0.14)" }]}
                >
                  <Ionicons name="calendar-outline" size={16} color={C.primary} />
                  <Text style={{ color: C.primary, fontWeight: "700", fontSize: 13 }}>
                    {outsideStart
                      ? `${tLabel(new Date(outsideStart).toISOString())} · ${new Date(outsideStart).toLocaleDateString("vi-VN")}`
                      : "Chọn ngày & giờ"}
                  </Text>
                </TouchableOpacity>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SP.sm }}>
                  {startOptions.map((t) => {
                    const on = effStart === t;
                    return (
                      <TouchableOpacity
                        key={t}
                        onPress={() => setStartMs(t)}
                        style={[styles2.pick, { borderColor: on ? C.primary : C.border, backgroundColor: on ? C.primarySoft || "rgba(59,130,246,0.14)" : C.field }]}
                      >
                        <Text style={{ color: on ? C.primary : C.text, fontWeight: "700", fontSize: 13 }}>
                          {tLabel(new Date(t).toISOString())}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}

              <DateTimePickerModal
                isVisible={pickerOpen}
                mode="datetime"
                maximumDate={new Date()}
                date={outsideStart ? new Date(outsideStart) : new Date(windowStart || Date.now())}
                onConfirm={(d: Date) => {
                  setPickerOpen(false);
                  setOutsideStart(d.getTime());
                }}
                onCancel={() => setPickerOpen(false)}
              />

              {/* Chọn độ dài */}
              <Text style={styles2.label}>Độ dài</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SP.sm }}>
                {durationOptions.length === 0 ? (
                  <Text style={{ color: C.sub }}>
                    {outside ? "Hãy chọn giờ bắt đầu (đã qua) ở trên." : "Không đủ thời gian còn lại trong giờ đặt."}
                  </Text>
                ) : (
                  durationOptions.map((m) => {
                    const on = effDuration === m;
                    return (
                      <TouchableOpacity
                        key={m}
                        onPress={() => setDurationMin(m)}
                        style={[styles2.pick, { borderColor: on ? C.primary : C.border, backgroundColor: on ? C.primarySoft || "rgba(59,130,246,0.14)" : C.field }]}
                      >
                        <Text style={{ color: on ? C.primary : C.text, fontWeight: "700", fontSize: 13 }}>
                          {m} phút
                        </Text>
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>

              {effDuration > 0 && (
                <Text style={{ color: C.sub, fontSize: 12.5 }}>
                  Clip: {tLabel(new Date(effStart).toISOString())} → {tLabel(new Date(endMs).toISOString())} ({effDuration} phút)
                </Text>
              )}

              <TouchableOpacity
                activeOpacity={0.85}
                disabled={creating || !effDuration}
                onPress={onCreate}
                style={[styles2.btn, { backgroundColor: C.primary, opacity: creating || !effDuration ? 0.6 : 1 }, shadow(dark, 2)]}
              >
                {creating ? (
                  <ActivityIndicator color={C.onPrimary || "#fff"} />
                ) : (
                  <>
                    <Ionicons name={outside ? "paper-plane" : "cut"} size={18} color={C.onPrimary || "#fff"} />
                    <Text style={{ color: C.onPrimary || "#fff", fontWeight: "800", fontSize: 15 }}>
                      {outside ? "Gửi yêu cầu duyệt" : "Cắt clip"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
              <Text style={{ color: C.sub, fontSize: 11.5, textAlign: "center" }}>
                {outside
                  ? "Clip ngoài giờ đặt cần chủ sân duyệt trước khi cắt."
                  : "Máy chủ xử lý lần lượt từng clip — có thể mất vài phút."}
              </Text>
            </View>

            {/* Danh sách clip */}
            <View style={{ gap: SP.md }}>
              <Text style={[styles2.section, { color: C.text }]}>Clip của bạn</Text>
              {jobs.length === 0 ? (
                <Text style={{ color: C.sub }}>Chưa có clip nào. Tạo clip đầu tiên ở trên.</Text>
              ) : (
                jobs.map((j: any) => {
                  const meta = STATUS_META[j.status] || STATUS_META.queued;
                  const open = openClipId === j._id;
                  return (
                    <View key={j._id} style={[styles2.card, shadow(dark, 1), { gap: SP.sm }]}>
                      <View style={styles2.rowHead}>
                        <Ionicons name={meta.icon} size={18} color={meta.color} />
                        <Text style={{ color: C.text, fontWeight: "700", fontSize: 14 }}>
                          {j.camName || "Camera"} · {fmtDur(j.durationSec)}
                        </Text>
                        <Chip C={C} color={meta.color} label={meta.label} small style={{ marginLeft: "auto" }} />
                      </View>

                      {j.status === "processing" && (
                        <View style={styles2.track}>
                          <View style={[styles2.bar, { width: `${Math.max(5, j.progressPct || 0)}%`, backgroundColor: meta.color }]} />
                        </View>
                      )}
                      {j.status === "failed" && !!j.error && (
                        <Text style={{ color: C.danger || "#ef4444", fontSize: 12.5 }}>{j.error}</Text>
                      )}
                      {j.status === "rejected" && (
                        <Text style={{ color: C.danger || "#ef4444", fontSize: 12.5 }}>
                          Chủ sân từ chối{j.rejectReason ? `: ${j.rejectReason}` : "."}
                        </Text>
                      )}
                      {j.status === "pending_approval" && (
                        <Text style={{ color: C.sub, fontSize: 12.5 }}>
                          Đang chờ chủ sân duyệt (clip ngoài giờ đặt).
                        </Text>
                      )}
                      {j.fileUrl && j.status === "done" && (
                        <Text style={{ color: C.sub, fontSize: 12 }}>{fmtSize(j.fileSize)}</Text>
                      )}

                      {open && j.fileUrl ? <ClipPlayer url={j.fileUrl} /> : null}

                      <View style={{ flexDirection: "row", gap: SP.sm, flexWrap: "wrap" }}>
                        {j.status === "done" && j.fileUrl && (
                          <>
                            <TouchableOpacity onPress={() => setOpenClipId(open ? null : j._id)} style={[styles2.smallBtn, { backgroundColor: C.primary }]}>
                              <Ionicons name={open ? "eye-off" : "play"} size={15} color={C.onPrimary || "#fff"} />
                              <Text style={styles2.smallBtnTxt}>{open ? "Ẩn" : "Xem"}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => onShare(j)} style={[styles2.smallBtn, { backgroundColor: "#6366f1" }]}>
                              <Ionicons name="share-social" size={15} color="#fff" />
                              <Text style={styles2.smallBtnTxt}>Tải / Chia sẻ</Text>
                            </TouchableOpacity>
                          </>
                        )}
                        {j.status !== "processing" && (
                          <TouchableOpacity onPress={() => onDelete(j)} style={[styles2.smallBtn, { backgroundColor: C.field, borderWidth: 1, borderColor: C.border }]}>
                            <Ionicons name={j.status === "queued" || j.status === "pending_approval" ? "close" : "trash"} size={15} color={C.danger || "#ef4444"} />
                            <Text style={[styles2.smallBtnTxt, { color: C.danger || "#ef4444" }]}>
                              {j.status === "queued" || j.status === "pending_approval" ? "Huỷ" : "Xoá"}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const mk = (C: any) =>
  StyleSheet.create({
    card: {
      backgroundColor: C.card,
      borderColor: C.border,
      borderWidth: 1,
      borderRadius: R.lg,
      padding: SP.lg,
    },
    rowHead: { flexDirection: "row", alignItems: "center", gap: 8 },
    secIcon: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
    section: { fontWeight: "800", fontSize: 15.5 },
    label: { color: C.sub, fontSize: 12.5, fontWeight: "700", marginTop: 2 },
    pick: {
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 999,
      borderWidth: 1,
    },
    toggleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginTop: 2,
    },
    btn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 13,
      borderRadius: R.md,
      marginTop: 4,
    },
    smallBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 13,
      paddingVertical: 9,
      borderRadius: 10,
    },
    smallBtnTxt: { color: "#fff", fontWeight: "700", fontSize: 13 },
    track: { height: 6, borderRadius: 999, backgroundColor: C.line, overflow: "hidden" },
    bar: { height: 6, borderRadius: 999 },
  });
