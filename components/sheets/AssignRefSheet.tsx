// components/AssignRefSheet.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
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

// APIs
import {
  useListTournamentRefereesQuery,
  useBatchAssignRefereeMutation,
} from "@/slices/refereeScopeApiSlice";
import { useAdminGetMatchRefereesQuery } from "@/slices/tournamentsApiSlice";

/* ============ utils ============ */
const personNickname = (p) =>
  p?.nickname || p?.nickName || p?.displayName || p?.fullName || p?.name || "—";

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
  const navTheme = useTheme?.() || {};
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
    colors: { primary, text, card, border, background },
    muted: dark ? "#9aa0a6" : "#6b7280",

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

/* ============ themed atoms (MUST be OUTSIDE main component) ============ */
const ThemedCard = React.memo(({ t, children, style }) => (
  <View
    style={[
      styles.card,
      { backgroundColor: t.colors.card, borderColor: t.colors.border },
      style,
    ]}
  >
    {children}
  </View>
));

const ThemedChip = React.memo(
  ({ t, text, icon, outlined = false, tone = "default", onPress, disabled }) => {
    const map = {
      default: {
        bg: t.chipDefaultBg,
        fg: t.chipDefaultFg,
        bd: t.chipDefaultBd,
      },
      primary: { bg: t.chipInfoBg, fg: t.chipInfoFg, bd: t.chipInfoBd },
      warning: { bg: "#fff7ed", fg: "#9a3412", bd: "#fed7aa" },
      success: { bg: "#dcfce7", fg: "#166534", bd: "#bbf7d0" },
      secondary: { bg: t.chipSecBg, fg: t.chipSecFg, bd: t.chipSecBd },
      error: { bg: t.chipErrBg, fg: t.chipErrFg, bd: t.chipErrBd },
      info: { bg: t.chipInfoBg, fg: t.chipInfoFg, bd: t.chipInfoBd },
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
        {icon ? (
          <MaterialIcons
            name={icon}
            size={14}
            color={c.fg}
            style={{ marginRight: 6 }}
          />
        ) : null}
        <Text style={{ color: c.fg, fontSize: 12, fontWeight: "700" }}>
          {text}
        </Text>
      </Pressable>
    );
  }
);

const ThemedBtn = React.memo(
  ({ t, children, onPress, variant = "solid", disabled, icon }) => (
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
      {icon ? (
        <MaterialIcons
          name={icon}
          size={16}
          color={variant === "solid" ? "#fff" : t.colors.primary}
          style={{ marginRight: 6 }}
        />
      ) : null}
      <Text
        style={{
          color: variant === "solid" ? "#fff" : t.colors.primary,
          fontWeight: "700",
        }}
      >
        {children}
      </Text>
    </Pressable>
  )
);

const ThemedIconBtn = React.memo(({ t, name, onPress, size = 18, color }) => (
  <Pressable
    onPress={onPress}
    hitSlop={8}
    style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.85 }]}
  >
    <MaterialIcons
      name={name}
      size={size}
      color={color ?? t.colors.text}
    />
  </Pressable>
));

const ThemedCheckbox = React.memo(({ t, checked }) => (
  <MaterialIcons
    name={checked ? "check-box" : "check-box-outline-blank"}
    size={22}
    color={checked ? t.colors.primary : t.muted}
  />
));

const ThemedAvatar = React.memo(({ t, name }) => {
  const ch = (String(name || "").trim()[0] || "U").toUpperCase();
  return (
    <View
      style={{
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: t.colors.primary,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: "#fff", fontWeight: "700" }}>{ch}</Text>
    </View>
  );
});

/* ============ main sheet ============ */
export default function AssignRefSheet({
  open,
  onClose,
  tournamentId,
  match, // optional: dùng khi gán 1 trận
  matchIds, // optional: gán nhiều trận
  onChanged,
  limit = 100,
}) {
  const t = useTokens();
  const sheetRef = useRef(null);

  const snapPoints = useMemo(() => ["92%"], []);

  // Hiển thị / ẩn sheet
  useEffect(() => {
    if (open) sheetRef.current?.present();
    else sheetRef.current?.dismiss();
  }, [open]);

  // Các trận áp dụng
  const effectiveMatchIds = useMemo(() => {
    if (Array.isArray(matchIds) && matchIds.length) return matchIds.map(String);
    return match?._id ? [String(match._id)] : [];
  }, [matchIds, match]);
  const singleMatchId =
    effectiveMatchIds.length === 1 ? effectiveMatchIds[0] : null;

  // Tìm kiếm (debounce)
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(timer);
  }, [q]);

  // Danh sách TT của giải
  const {
    data: referees = [],
    isLoading,
    isFetching,
    error,
    refetch,
  } = useListTournamentRefereesQuery(
    { tid: tournamentId, q: debouncedQ, limit },
    { skip: !open || !tournamentId }
  );

  // Danh sách TT đã gán (khi chỉ 1 trận)
  const {
    data: assignedForSingle = [],
    isLoading: assignedLoading,
    isFetching: assignedFetching,
    refetch: refetchAssigned,
  } = useAdminGetMatchRefereesQuery(
    { tid: tournamentId, matchId: singleMatchId || "" },
    { skip: !open || !tournamentId || !singleMatchId }
  );

  // mỗi lần sheet mở thì refetch lại
  useEffect(() => {
    if (!open) return;
    refetch?.();
    if (singleMatchId) refetchAssigned?.();
  }, [open, refetch, refetchAssigned, singleMatchId]);

  // State chọn
  const [selected, setSelected] = useState([]);
  const allIdsOnPage = useMemo(
    () => (referees || []).map((u) => String(u._id)),
    [referees]
  );

  const didInitRef = useRef(false);

  // Reset khi đóng
  useEffect(() => {
    if (!open) {
      setSelected([]);
      didInitRef.current = false;
    }
  }, [open]);

  // Reset khi đổi single match
  useEffect(() => {
    didInitRef.current = false;
    setSelected([]);
  }, [singleMatchId]);

  // Prefill 1 lần khi đã có assigned list
  useEffect(() => {
    if (!open || !singleMatchId) return;
    if (assignedLoading || assignedFetching) return;
    if (didInitRef.current) return;
    const ids = (assignedForSingle || []).map((u) => String(u._id));
    setSelected(ids);
    didInitRef.current = true;
  }, [
    open,
    singleMatchId,
    assignedLoading,
    assignedFetching,
    assignedForSingle,
  ]);

  // Handlers
  const toggle = (id) =>
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id]
    );
  const selectAllOnPage = () =>
    setSelected((s) => Array.from(new Set([...s, ...allIdsOnPage])));
  const clearAll = () => setSelected([]);

  const canSubmit = open && tournamentId && effectiveMatchIds.length > 0;

  const titleSuffix = useMemo(() => {
    if (Array.isArray(matchIds) && matchIds.length > 1)
      return `${matchIds.length} trận`;
    if (match?._id) return matchCode(match);
    return "—";
  }, [matchIds, match]);

  const assignedCount = useMemo(
    () => (Array.isArray(assignedForSingle) ? assignedForSingle.length : 0),
    [assignedForSingle]
  );

  const [batchAssign, { isLoading: assigning }] =
    useBatchAssignRefereeMutation();

  const handleSubmit = async () => {
    if (!canSubmit) return;
    try {
      await batchAssign({
        ids: effectiveMatchIds,
        referees: selected,
      }).unwrap();

      const msg =
        selected.length > 0
          ? `Đã cập nhật ${selected.length} trọng tài cho ${effectiveMatchIds.length} trận`
          : `Đã gỡ hết trọng tài cho ${effectiveMatchIds.length} trận`;
      Alert.alert("Thành công", msg);

      onChanged?.();
    } catch (e) {
      Alert.alert(
        "Lỗi",
        e?.data?.message || e?.error || "Cập nhật trọng tài thất bại"
      );
    }
  };

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={snapPoints}
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
      backgroundStyle={{
        backgroundColor: t.colors.card,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
      }}
      containerStyle={{ zIndex: 1000 }}
      // optional nhưng giúp keyboard + sheet mượt hơn
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
    >
      <BottomSheetScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
          <Row style={{ alignItems: "center", gap: 6 }}>
            <MaterialIcons name="how-to-reg" size={18} color={t.colors.text} />
            <Text style={[styles.title, { color: t.colors.text }]}>
              Gán trọng tài — {titleSuffix}
            </Text>
          </Row>
          <Row style={{ alignItems: "center", gap: 6 }}>
            <ThemedIconBtn
              t={t}
              name="refresh"
              onPress={() => {
                refetch?.();
                if (singleMatchId) refetchAssigned?.();
              }}
            />
            <ThemedIconBtn
              t={t}
              name="close"
              onPress={() => sheetRef.current?.dismiss()}
            />
          </Row>
        </Row>

        {/* Chips trạng thái */}
        <Row style={{ flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {singleMatchId ? (
            <ThemedChip
              t={t}
              text={`Đã gán: ${assignedCount}`}
              outlined
              tone="secondary"
            />
          ) : null}
          <ThemedChip t={t} text={`Đang chọn: ${selected.length}`} outlined />
          {(isLoading || isFetching || assignedLoading || assignedFetching) && (
            <ThemedChip t={t} text="Đang tải…" outlined icon="hourglass-empty" />
          )}
        </Row>

        {/* Thanh tìm kiếm + actions nhanh */}
        <ThemedCard t={t}>
          <Row style={{ alignItems: "center", gap: 8 }}>
            <MaterialIcons name="person-search" size={18} color={t.muted} />
            <TextInput
              style={[styles.input, { color: t.colors.text }]}
              placeholder="Nhập tên/nickname/email để tìm…"
              placeholderTextColor={t.muted}
              value={q}
              onChangeText={setQ}
              // optional: giảm các case mất focus kỳ lạ trên Android
              autoCorrect={false}
              autoCapitalize="none"
            />
          </Row>

          <Row style={{ flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            <ThemedBtn
              t={t}
              onPress={selectAllOnPage}
              variant="outline"
              icon="done-all"
              disabled={!referees?.length}
            >
              Chọn tất cả
            </ThemedBtn>
            <ThemedBtn t={t} onPress={clearAll} variant="outline" icon="clear-all">
              Bỏ chọn
            </ThemedBtn>
            {singleMatchId ? (
              <ThemedBtn
                t={t}
                onPress={() =>
                  setSelected((assignedForSingle || []).map((u) => String(u._id)))
                }
                variant="outline"
              >
                Dùng DS đã gán
              </ThemedBtn>
            ) : null}
          </Row>
        </ThemedCard>

        {/* Danh sách trọng tài */}
        <ThemedCard t={t}>
          <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
            <Row style={{ alignItems: "center", gap: 8 }}>
              <Text style={[styles.subtitle, { color: t.colors.text }]}>
                Trọng tài trong giải
              </Text>
              <ThemedChip t={t} text={`${referees?.length || 0} kết quả`} outlined />
            </Row>
            <ThemedBtn
              t={t}
              onPress={() => {
                refetch?.();
                if (singleMatchId) refetchAssigned?.();
              }}
              variant="outline"
            >
              Refresh
            </ThemedBtn>
          </Row>

          {isLoading ? (
            <View style={{ paddingVertical: 16, alignItems: "center" }}>
              <ActivityIndicator color={t.colors.primary} />
            </View>
          ) : error ? (
            <Text style={{ color: t.chipErrFg }}>
              {error?.data?.message || "Không tải được danh sách."}
            </Text>
          ) : (referees?.length || 0) === 0 ? (
            <Text style={{ color: t.muted }}>Không có kết quả phù hợp.</Text>
          ) : (
            <View style={{ marginTop: 8 }}>
              {referees.map((u) => {
                const id = String(u._id);
                const checked = selected.includes(id);
                return (
                  <Pressable
                    key={id}
                    onPress={() => toggle(id)}
                    style={({ pressed }) => [
                      styles.listItem,
                      pressed && { opacity: 0.9 },
                    ]}
                  >
                    <Row style={{ alignItems: "center", gap: 10 }}>
                      <ThemedAvatar t={t} name={personNickname(u)} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: "600", color: t.colors.text }}>
                          {personNickname(u)}
                        </Text>
                        <Text style={{ color: t.muted, fontSize: 12 }}>
                          {u?.email || u?.phone || ""}
                        </Text>
                      </View>
                      <ThemedCheckbox t={t} checked={checked} />
                    </Row>
                  </Pressable>
                );
              })}
            </View>
          )}
        </ThemedCard>

        {/* Cảnh báo */}
        <ThemedCard
          t={t}
          style={{
            backgroundColor: t.chipInfoBg,
            borderColor: t.chipInfoBd,
          }}
        >
          <Text style={{ color: t.chipInfoFg }}>
            Thao tác này sẽ{" "}
            <Text style={{ fontWeight: "700", color: t.colors.text }}>
              cập nhật (thay thế)
            </Text>{" "}
            danh sách trọng tài cho{" "}
            <Text style={{ fontWeight: "700", color: t.colors.text }}>
              {effectiveMatchIds.length}
            </Text>{" "}
            trận được chọn.
          </Text>
        </ThemedCard>

        {/* Footer actions */}
        <Row style={{ justifyContent: "flex-end", gap: 8 }}>
          <ThemedBtn t={t} variant="outline" onPress={() => sheetRef.current?.dismiss()}>
            Đóng
          </ThemedBtn>
          <ThemedBtn
            t={t}
            onPress={handleSubmit}
            icon="send"
            disabled={!canSubmit || assigning}
          >
            {assigning ? "Đang lưu…" : "Lưu"}
          </ThemedBtn>
        </Row>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

/* ============ styles (layout only) ============ */
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
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  iconBtn: { padding: 6, borderRadius: 999 },
  input: { flex: 1, fontSize: 15 },
  listItem: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
});
