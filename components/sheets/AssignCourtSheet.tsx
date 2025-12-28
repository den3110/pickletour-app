// components/AssignCourtSheet.jsx
import React, { useEffect, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { MaterialIcons } from "@expo/vector-icons";
import { useTheme } from "@react-navigation/native";

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

/* ---------------- theme tokens ---------------- */
function useTokens() {
  // 1) Lấy theme từ React Navigation (nếu có)
  const navTheme = useTheme?.() || {};
  // 2) Fallback: nếu portal đứng ngoài ThemeProvider, dùng system scheme
  const scheme = useColorScheme?.() || "light";
  const dark =
    typeof navTheme.dark === "boolean" ? navTheme.dark : scheme === "dark";

  const primary = navTheme?.colors?.primary ?? (dark ? "#7cc0ff" : "#0a84ff");
  const text = navTheme?.colors?.text ?? (dark ? "#f7f7f7" : "#111");
  const card = navTheme?.colors?.card ?? (dark ? "#16181c" : "#ffffff");
  const border = navTheme?.colors?.border ?? (dark ? "#2e2f33" : "#e5e7eb");
  const background =
    navTheme?.colors?.background ?? (dark ? "#0b0d10" : "#f6f8fc");

  return {
    dark,
    colors: {
      primary,
      text,
      card,
      border,
      background,
    },
    // text phụ
    muted: dark ? "#9aa0a6" : "#6b7280",
    // chip palettes (giữ tông tương đương bản trước)
    chipDefaultBg: dark ? "#1f2937" : "#eef2f7",
    chipDefaultFg: dark ? "#e5e7eb" : "#263238",
    chipDefaultBd: dark ? "#334155" : "#e2e8f0",

    chipInfoBg: dark ? "#0f2536" : "#e0f2fe",
    chipInfoFg: dark ? "#93c5fd" : "#075985",
    chipInfoBd: dark ? "#1e3a5f" : "#bae6fd",

    chipErrBg: dark ? "#3b0d0d" : "#fee2e2",
    chipErrFg: dark ? "#fecaca" : "#991b1b",
    chipErrBd: dark ? "#7f1d1d" : "#fecaca",

    chipSecBg: dark ? "#241b4b" : "#ede9fe",
    chipSecFg: dark ? "#c4b5fd" : "#5b21b6",
    chipSecBd: dark ? "#4c1d95" : "#ddd6fe",
  };
}

/* ---------------- main sheet ---------------- */
export default function AssignCourtSheet({
  open,
  onClose,
  tournamentId,
  match, // object trận
  onAssigned, // callback khi gán/gỡ xong
}) {
  const sheetRef = useRef(null);
  const t = useTokens();

  // Themed atoms
  const Card = ({ children }) => (
    <View
      style={[
        styles.card,
        { backgroundColor: t.colors.card, borderColor: t.colors.border },
      ]}
    >
      {children}
    </View>
  );

  const Chip = ({
    text,
    tone = "default",
    outlined = false,
    onPress,
    disabled,
  }) => {
    const map = {
      default: {
        bg: t.chipDefaultBg,
        fg: t.chipDefaultFg,
        bd: t.chipDefaultBd,
      },
      info: { bg: t.chipInfoBg, fg: t.chipInfoFg, bd: t.chipInfoBd },
      error: { bg: t.chipErrBg, fg: t.chipErrFg, bd: t.chipErrBd },
      secondary: { bg: t.chipSecBg, fg: t.chipSecFg, bd: t.chipSecBd },
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
          ? { backgroundColor: t.colors.primary }
          : {
              borderWidth: 1,
              borderColor: t.colors.primary,
              backgroundColor: "transparent",
            },
        disabled && { opacity: 0.5 },
        pressed && !disabled && { opacity: 0.9 },
      ]}
    >
      <Text
        style={{
          color: variant === "solid" ? "#fff" : t.colors.primary,
          fontWeight: "700",
        }}
      >
        {children}
      </Text>
    </Pressable>
  );

  const IconBtn = ({ name, onPress, size = 18, color = t.colors.text }) => (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.85 }]}
    >
      <MaterialIcons name={name} size={size} color={color} />
    </Pressable>
  );

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
      refetch?.();
    } catch (e) {
      Alert.alert("Lỗi", e?.data?.message || e?.error || "Gỡ sân thất bại");
    }
  };

  const Title = () => (
    <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
      <Row style={{ alignItems: "center", gap: 6 }}>
        <MaterialIcons name="stadium" size={18} color={t.colors.text} />
        <Text style={[styles.title, { color: t.colors.text }]}>
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
        <BottomSheetBackdrop
          {...p}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          style={{ zIndex: 1000 }}
        />
      )}
      handleIndicatorStyle={{ backgroundColor: t.colors.border }}
      backgroundStyle={{ backgroundColor: t.colors.card }}
      containerStyle={{ zIndex: 1000 }}
    >
      <BottomSheetScrollView contentContainerStyle={[styles.container]}>
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
          <Text style={[styles.subtitle, { color: t.colors.text }]}>
            Sân trống ({courtsByStatus.idle.length})
          </Text>
          {isLoading ? (
            <ActivityIndicator size="small" color={t.colors.primary} />
          ) : null}
        </Row>

        {!open || isLoading ? null : (courts?.length || 0) === 0 ? (
          <Text style={{ color: t.muted }}>
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
                  <Text style={{ fontWeight: "700", color: t.colors.text }}>
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
            <Text style={[styles.subtitle, { color: t.colors.text }]}>
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
                    <Text style={{ fontWeight: "700", color: t.colors.text }}>
                      {c.name}
                    </Text>
                    <Chip text="Đang dùng" outlined />
                  </Row>
                  {c.currentMatch && (
                    <Text style={{ color: t.muted, marginTop: 6 }}>
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
  title: { fontSize: 16, fontWeight: "700" },
  subtitle: { fontSize: 14, fontWeight: "700" },
  card: {
    borderWidth: 1,
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
