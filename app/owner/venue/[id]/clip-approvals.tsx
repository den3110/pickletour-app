// app/owner/venue/[id]/clip-approvals.tsx — Chủ sân duyệt yêu cầu cắt clip NGOÀI giờ đặt.
import React, { useMemo, useState } from "react";
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Text } from "@/components/ui/i18nText";
import { TextInput } from "@/components/ui/i18nTextInput";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { useThemeTokens } from "@/hooks/useThemeTokens";
import { shadow, R, SP } from "@/components/courts/ui";
import {
  useListPendingClipsQuery,
  useApproveClipMutation,
  useRejectClipMutation,
  useGetClipSettingsQuery,
  useSetClipSettingsMutation,
} from "@/slices/clipsApiSlice";

/** "2026_09_22_19_00_00" → "19:00 22/09". */
function fmtLocal(s: string) {
  if (!s) return "";
  const [Y, Mo, D, H, Mi] = String(s).split("_");
  if (!H) return s;
  return `${H}:${Mi} ${D}/${Mo}`;
}

export default function ClipApprovalsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const dark = !!theme.dark;
  const C = useThemeTokens();
  const styles = useMemo(() => mk(C), [C]);

  const { data, isLoading, refetch, isFetching } = useListPendingClipsQuery(id, {
    skip: !id,
    pollingInterval: 15000,
  });
  const jobs = data?.jobs || [];

  const { data: settings } = useGetClipSettingsQuery(id, { skip: !id });
  const [setClipSettings, { isLoading: savingSetting }] = useSetClipSettingsMutation();
  const autoApprove = !!settings?.autoApprove;

  const [approveClip] = useApproveClipMutation();
  const [rejectClip] = useRejectClipMutation();

  async function onToggleAuto() {
    try {
      await setClipSettings({ venueId: id, autoApprove: !autoApprove }).unwrap();
    } catch (e: any) {
      Alert.alert("Lỗi", e?.data?.message || "Không lưu được cấu hình.");
    }
  }
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function onApprove(job: any) {
    setBusyId(job._id);
    try {
      await approveClip({ id: job._id, venueId: id }).unwrap();
    } catch (e: any) {
      Alert.alert("Lỗi", e?.data?.message || "Không duyệt được.");
    } finally {
      setBusyId(null);
    }
  }

  async function onConfirmReject(job: any) {
    setBusyId(job._id);
    try {
      await rejectClip({ id: job._id, venueId: id, reason: reason.trim() }).unwrap();
      setRejectingId(null);
      setReason("");
    } catch (e: any) {
      Alert.alert("Lỗi", e?.data?.message || "Không từ chối được.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{ title: "Duyệt cắt clip" }} />
      <ScrollView
        contentContainerStyle={{ padding: SP.lg, gap: SP.md, paddingBottom: SP.xxl * 2 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={undefined}
      >
        {/* Tự duyệt clip ngoài giờ */}
        <TouchableOpacity
          activeOpacity={0.85}
          disabled={savingSetting}
          onPress={onToggleAuto}
          style={[styles.card, shadow(dark, 1), { flexDirection: "row", alignItems: "center", gap: 12, opacity: savingSetting ? 0.6 : 1 }]}
        >
          <View style={[styles.icon, { backgroundColor: autoApprove ? "rgba(34,197,94,0.16)" : C.field }]}>
            <Ionicons name={autoApprove ? "flash" : "flash-off"} size={16} color={autoApprove ? "#22c55e" : C.sub} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.text, fontWeight: "800", fontSize: 14 }}>
              Tự duyệt clip ngoài giờ
            </Text>
            <Text style={{ color: C.sub, fontSize: 12, marginTop: 2, lineHeight: 17 }}>
              {autoApprove
                ? "Đang BẬT — yêu cầu ngoài giờ tự cắt, không cần duyệt tay."
                : "Đang TẮT — yêu cầu ngoài giờ phải chờ bạn duyệt."}
            </Text>
          </View>
          {savingSetting ? (
            <ActivityIndicator color={C.primary} />
          ) : (
            <Ionicons
              name={autoApprove ? "toggle" : "toggle-outline"}
              size={34}
              color={autoApprove ? "#22c55e" : C.muted}
            />
          )}
        </TouchableOpacity>

        <Text style={{ color: C.sub, fontSize: 12.5, lineHeight: 18 }}>
          Đây là các yêu cầu cắt clip NGOÀI khung giờ khách đã đặt — cần bạn duyệt trước khi
          hệ thống cắt. Yêu cầu trong giờ đặt sẽ tự động xử lý, không hiện ở đây.
        </Text>

        {isLoading ? (
          <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} />
        ) : jobs.length === 0 ? (
          <View style={[styles.card, shadow(dark, 1), { alignItems: "center", gap: 8, paddingVertical: 28 }]}>
            <Ionicons name="checkmark-done-circle-outline" size={34} color={C.sub} />
            <Text style={{ color: C.sub }}>Không có yêu cầu nào chờ duyệt.</Text>
          </View>
        ) : (
          jobs.map((j: any) => {
            const busy = busyId === j._id;
            const rejecting = rejectingId === j._id;
            return (
              <View key={j._id} style={[styles.card, shadow(dark, 1), { gap: SP.sm }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={[styles.icon, { backgroundColor: "rgba(168,85,247,0.16)" }]}>
                    <Ionicons name="cut" size={16} color="#a855f7" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.text, fontWeight: "800", fontSize: 14.5 }}>
                      {j.requestedBy?.name || "Khách"}
                    </Text>
                    {!!j.requestedBy?.phone && (
                      <Text style={{ color: C.sub, fontSize: 12 }}>{j.requestedBy.phone}</Text>
                    )}
                  </View>
                </View>

                <View style={[styles.info, { backgroundColor: C.field, borderColor: C.border }]}>
                  <Row C={C} icon="videocam-outline" label="Camera" value={j.camName || "Camera"} />
                  <Row C={C} icon="time-outline" label="Từ" value={fmtLocal(j.beginLocal)} />
                  <Row C={C} icon="time-outline" label="Đến" value={fmtLocal(j.endLocal)} />
                  <Row C={C} icon="hourglass-outline" label="Độ dài" value={`${Math.round((j.durationSec || 0) / 60)} phút`} />
                </View>

                {rejecting ? (
                  <View style={{ gap: SP.sm }}>
                    <TextInput
                      value={reason}
                      onChangeText={setReason}
                      placeholder="Lý do từ chối (không bắt buộc)"
                      placeholderTextColor={C.muted}
                      style={[styles.input, { color: C.text, backgroundColor: C.field, borderColor: C.border }]}
                      multiline
                    />
                    <View style={{ flexDirection: "row", gap: SP.sm }}>
                      <TouchableOpacity
                        disabled={busy}
                        onPress={() => onConfirmReject(j)}
                        style={[styles.btn, { backgroundColor: C.danger || "#ef4444", flex: 1, opacity: busy ? 0.6 : 1 }]}
                      >
                        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnTxt}>Xác nhận từ chối</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => { setRejectingId(null); setReason(""); }}
                        style={[styles.btn, { backgroundColor: C.field, borderWidth: 1, borderColor: C.border }]}
                      >
                        <Text style={[styles.btnTxt, { color: C.text }]}>Huỷ</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={{ flexDirection: "row", gap: SP.sm }}>
                    <TouchableOpacity
                      disabled={busy}
                      onPress={() => onApprove(j)}
                      style={[styles.btn, { backgroundColor: "#22c55e", flex: 1, opacity: busy ? 0.6 : 1 }]}
                    >
                      {busy ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="checkmark" size={16} color="#fff" />
                          <Text style={styles.btnTxt}>Duyệt</Text>
                        </>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      disabled={busy}
                      onPress={() => { setRejectingId(j._id); setReason(""); }}
                      style={[styles.btn, { backgroundColor: C.field, borderWidth: 1, borderColor: C.border, flex: 1 }]}
                    >
                      <Ionicons name="close" size={16} color={C.danger || "#ef4444"} />
                      <Text style={[styles.btnTxt, { color: C.danger || "#ef4444" }]}>Từ chối</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

function Row({ C, icon, label, value }: any) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 3 }}>
      <Ionicons name={icon} size={14} color={C.sub} />
      <Text style={{ color: C.sub, fontSize: 12.5, width: 70 }}>{label}</Text>
      <Text style={{ color: C.text, fontSize: 13, fontWeight: "600", flex: 1 }}>{value}</Text>
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
    icon: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
    info: { borderWidth: 1, borderRadius: R.md, padding: SP.md },
    input: {
      borderWidth: 1,
      borderRadius: R.md,
      padding: 12,
      minHeight: 44,
      fontSize: 14,
    },
    btn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 12,
      borderRadius: R.md,
    },
    btnTxt: { color: "#fff", fontWeight: "800", fontSize: 14 },
  });
