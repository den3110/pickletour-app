// components/AssignCourtSheet.jsx
import React, { useEffect, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { MaterialIcons } from "@expo/vector-icons"; // nếu không dùng Expo: react-native-vector-icons/MaterialIcons

/**
 * ĐỔI các hook theo slice dự án của bạn nếu khác tên.
 */
import { useAdminListCourtsQuery } from "@/slices/adminCourtApiSlice";
import {
  useAdminAssignMatchToCourtMutation,
  useAdminClearMatchCourtMutation,
} from "@/slices/tournamentsApiSlice";

/* ---------------- helpers ---------------- */
const matchCode = (m) => {
  if (!m) return "—";
  if (m.code) return m.code;
  const r = Number.isFinite(m?.globalRound)
    ? m.globalRound
    : Number.isFinite(m?.round)
    ? m.round
    : "?";
  const t = Number.isFinite(m?.order) ? m.order + 1 : undefined;
  return `V${r}${t ? `-T${t}` : ""}`;
};

const Row = ({ children, style }) => (
  <View style={[styles.row, style]}>{children}</View>
);

const Card = ({ children }) => <View style={styles.card}>{children}</View>;

const Chip = ({
  text,
  tone = "default",
  outlined = false,
  onPress,
  disabled,
}) => {
  const map = {
    default: { bg: "#eef2f7", fg: "#263238", bd: "#e2e8f0" },
    info: { bg: "#e0f2fe", fg: "#075985", bd: "#bae6fd" },
    error: { bg: "#fee2e2", fg: "#991b1b", bd: "#fecaca" },
    secondary: { bg: "#ede9fe", fg: "#5b21b6", bd: "#ddd6fe" },
  };
  const c = map[tone] || map.default;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      style={({ pressed }) => [
        styles.chip,
        outlined
          ? {
              backgroundColor: "transparent",
              borderColor: c.bd,
              borderWidth: 1,
            }
          : { backgroundColor: c.bg, borderColor: "transparent" },
        pressed && { opacity: 0.9 },
      ]}
    >
      <Text style={{ color: c.fg, fontSize: 12, fontWeight: "700" }}>
        {text}
      </Text>
    </Pressable>
  );
};

const Btn = ({ children, onPress, variant = "solid", disabled }) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    style={({ pressed }) => [
      styles.btn,
      variant === "solid"
        ? { backgroundColor: "#0a84ff" }
        : {
            borderWidth: 1,
            borderColor: "#0a84ff",
            backgroundColor: "transparent",
          },
      disabled && { opacity: 0.5 },
      pressed && !disabled && { opacity: 0.9 },
    ]}
  >
    <Text
      style={{
        color: variant === "solid" ? "#fff" : "#0a84ff",
        fontWeight: "700",
      }}
    >
      {children}
    </Text>
  </Pressable>
);

const IconBtn = ({ name, onPress, size = 18, color = "#111" }) => (
  <Pressable
    onPress={onPress}
    hitSlop={8}
    style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.85 }]}
  >
    <MaterialIcons name={name} size={size} color={color} />
  </Pressable>
);

/* ---------------- main sheet ---------------- */
export default function AssignCourtSheet({
  open,
  onClose,
  tournamentId,
  match, // object trận
  onAssigned, // callback khi gán/gỡ xong
}) {
  const sheetRef = useRef(null);
  const bracketId = match?.bracket?._id || match?.bracket || "";

  const {
    data: courts = [],
    isLoading,
    refetch,
  } = useAdminListCourtsQuery(
    { tid: tournamentId, bracket: bracketId },
    { skip: !open || !tournamentId || !bracketId }
  );

  const [assign, { isLoading: assigning }] =
    useAdminAssignMatchToCourtMutation();
  const [clearCourt, { isLoading: clearing }] =
    useAdminClearMatchCourtMutation();

  useEffect(() => {
    if (open) sheetRef.current?.present();
    else sheetRef.current?.dismiss();
  }, [open]);

  const courtsByStatus = useMemo(() => {
    const idle = [];
    const busy = [];
    (courts || []).forEach((c) => (c.currentMatch ? busy : idle).push(c));
    return { idle, busy };
  }, [courts]);

  const handleAssign = async (court) => {
    if (!match?._id) return;
    try {
      await assign({
        tid: tournamentId,
        matchId: match._id,
        courtId: court._id,
      }).unwrap();
      Alert.alert("Thành công", `Đã gán ${matchCode(match)} → ${court.name}`);
      onAssigned?.();
      onClose?.();
    } catch (e) {
      Alert.alert("Lỗi", e?.data?.message || e?.error || "Gán sân thất bại");
    }
  };

  const handleClear = async () => {
    if (!match?._id) return;
    try {
      await clearCourt({ tid: tournamentId, matchId: match._id }).unwrap();
      Alert.alert("Thành công", "Đã bỏ gán sân");
      onAssigned?.();
      // không đóng sheet để user có thể chọn sân khác luôn
      refetch?.();
    } catch (e) {
      Alert.alert("Lỗi", e?.data?.message || e?.error || "Gỡ sân thất bại");
    }
  };

  const Title = () => (
    <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
      <Row style={{ alignItems: "center", gap: 6 }}>
        <MaterialIcons name="stadium" size={18} color="#111" />
        <Text style={styles.title}>
          Gán sân — {match ? matchCode(match) : "—"}
        </Text>
      </Row>
      <Row style={{ alignItems: "center", gap: 6 }}>
        <IconBtn name="refresh" onPress={() => refetch?.()} />
        <IconBtn name="close" onPress={() => sheetRef.current?.dismiss()} />
      </Row>
    </Row>
  );

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={["80%"]}
      onDismiss={onClose}
      backdropComponent={(p) => (
        <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} />
      )}
      handleIndicatorStyle={{ backgroundColor: "#cbd5e1" }}
    >
      <BottomSheetScrollView contentContainerStyle={styles.container}>
        <Title />

        {/* Khối đang gán */}
        {match?.court?._id ? (
          <Card>
            <Row style={{ alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <Chip
                text={`Đang gán: ${match?.court?.name || ""}`}
                tone="secondary"
                outlined
              />
              <Chip
                text={clearing ? "Đang gỡ…" : "Bỏ gán sân"}
                tone="error"
                outlined
                onPress={handleClear}
                disabled={clearing}
              />
              {/* (tuỳ môi trường) Mở overlay nếu có URL */}
              <Chip
                text="Mở overlay"
                outlined
                onPress={() =>
                  Linking.openURL(`/overlay?court=${match?.court?._id}`).catch(
                    () => Alert.alert("Lỗi", "Không mở được overlay")
                  )
                }
              />
            </Row>
          </Card>
        ) : null}

        {/* Danh sách sân trống */}
        <Row style={{ alignItems: "center", gap: 8 }}>
          <Text style={styles.subtitle}>
            Sân trống ({courtsByStatus.idle.length})
          </Text>
          {isLoading ? <ActivityIndicator size="small" /> : null}
        </Row>

        {!open || isLoading ? null : (courts?.length || 0) === 0 ? (
          <Text style={{ color: "#6b7280" }}>
            Chưa có sân nào cho bracket này.
          </Text>
        ) : (
          <View style={{ gap: 8 }}>
            {courtsByStatus.idle.map((c) => (
              <Card key={c._id}>
                <Row
                  style={{
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontWeight: "700", color: "#111" }}>
                    {c.name}
                  </Text>
                  <Chip text="Trống" outlined />
                </Row>
                <Row style={{ flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                  <Chip
                    text={assigning ? "Đang gán…" : "Gán sân này"}
                    tone="secondary"
                    onPress={() => handleAssign(c)}
                    disabled={assigning}
                  />
                </Row>
              </Card>
            ))}
          </View>
        )}

        {/* Sân đang dùng */}
        {courtsByStatus.busy.length > 0 && (
          <View style={{ marginTop: 12 }}>
            <Text style={styles.subtitle}>
              Sân đang dùng ({courtsByStatus.busy.length})
            </Text>
            <View style={{ gap: 8, marginTop: 8 }}>
              {courtsByStatus.busy.map((c) => (
                <Card key={c._id}>
                  <Row
                    style={{
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ fontWeight: "700", color: "#111" }}>
                      {c.name}
                    </Text>
                    <Chip text="Đang dùng" outlined />
                  </Row>
                  {c.currentMatch && (
                    <Text style={{ color: "#374151", marginTop: 6 }}>
                      Trận: {c.currentMatch.code || matchCode(c.currentMatch)}
                    </Text>
                  )}
                </Card>
              ))}
            </View>
          </View>
        )}

        <Row style={{ justifyContent: "flex-end", marginTop: 12 }}>
          <Btn variant="outline" onPress={() => sheetRef.current?.dismiss()}>
            Đóng
          </Btn>
        </Row>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

/* ---------------- styles ---------------- */
const styles = StyleSheet.create({
  container: { padding: 12, gap: 12 },
  row: { flexDirection: "row" },
  title: { fontSize: 16, fontWeight: "700", color: "#111" },
  subtitle: { fontSize: 14, fontWeight: "700", color: "#111" },
  card: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  btn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
  iconBtn: { padding: 6, borderRadius: 999 },
});
