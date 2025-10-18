// components/AssignRefSheet.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { MaterialIcons } from "@expo/vector-icons"; // nếu không dùng Expo: react-native-vector-icons/MaterialIcons

// ⬇️ Đổi alias theo dự án của bạn nếu khác
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

/* ============ tiny UI ============ */
const Row = ({ children, style }) => (
  <View style={[styles.row, style]}>{children}</View>
);

const Card = ({ children, style }) => (
  <View style={[styles.card, style]}>{children}</View>
);

const Chip = ({
  text,
  icon,
  outlined = false,
  tone = "default",
  onPress,
  disabled,
}) => {
  const map = {
    default: { bg: "#eef2f7", bd: "#e2e8f0", fg: "#263238" },
    primary: { bg: "#e0f2fe", bd: "#bae6fd", fg: "#075985" },
    warning: { bg: "#fff7ed", bd: "#fed7aa", fg: "#9a3412" },
    success: { bg: "#dcfce7", bd: "#bbf7d0", fg: "#166534" },
    secondary: { bg: "#ede9fe", bd: "#ddd6fe", fg: "#5b21b6" },
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
              borderWidth: 1,
              borderColor: c.bd,
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
};

const Btn = ({ children, onPress, variant = "solid", disabled, icon }) => (
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
    {icon ? (
      <MaterialIcons
        name={icon}
        size={16}
        color={variant === "solid" ? "#fff" : "#0a84ff"}
        style={{ marginRight: 6 }}
      />
    ) : null}
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

const Checkbox = ({ checked }) => (
  <MaterialIcons
    name={checked ? "check-box" : "check-box-outline-blank"}
    size={22}
    color={checked ? "#0a84ff" : "#475569"}
  />
);

const Avatar = ({ name }) => {
  const ch = (String(name || "").trim()[0] || "U").toUpperCase();
  return (
    <View style={styles.avatar}>
      <Text style={{ color: "#fff", fontWeight: "700" }}>{ch}</Text>
    </View>
  );
};

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
  const sheetRef = useRef(null);

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
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
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
  } = useAdminGetMatchRefereesQuery(
    { tid: tournamentId, matchId: singleMatchId || "" },
    { skip: !open || !tournamentId || !singleMatchId }
  );

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
        referees: selected, // backend nên $set toàn bộ danh sách
      }).unwrap();

      const msg =
        selected.length > 0
          ? `Đã cập nhật ${selected.length} trọng tài cho ${effectiveMatchIds.length} trận`
          : `Đã gỡ hết trọng tài cho ${effectiveMatchIds.length} trận`;
      Alert.alert("Thành công", msg);

      onChanged?.();
      // giữ sheet mở để thao tác tiếp
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
      snapPoints={["92%"]}
      onDismiss={onClose}
      backdropComponent={(p) => (
        <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} />
      )}
      handleIndicatorStyle={{ backgroundColor: "#cbd5e1" }}
    >
      <BottomSheetScrollView contentContainerStyle={styles.container}>
        {/* Header */}
        <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
          <Row style={{ alignItems: "center", gap: 6 }}>
            <MaterialIcons name="how-to-reg" size={18} color="#111" />
            <Text style={styles.title}>Gán trọng tài — {titleSuffix}</Text>
          </Row>
          <Row style={{ alignItems: "center", gap: 6 }}>
            <IconBtn name="refresh" onPress={() => refetch?.()} />
            <IconBtn name="close" onPress={() => sheetRef.current?.dismiss()} />
          </Row>
        </Row>

        {/* Chips trạng thái */}
        <Row style={{ flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {singleMatchId ? (
            <Chip text={`Đã gán: ${assignedCount}`} outlined tone="secondary" />
          ) : null}
          <Chip text={`Đang chọn: ${selected.length}`} outlined />
          {(isLoading || isFetching || assignedLoading || assignedFetching) && (
            <Chip text="Đang tải…" outlined icon="hourglass-empty" />
          )}
        </Row>

        {/* Thanh tìm kiếm + actions nhanh */}
        <Card>
          <Row style={{ alignItems: "center", gap: 8 }}>
            <MaterialIcons name="person-search" size={18} color="#475569" />
            <TextInput
              style={styles.input}
              placeholder="Nhập tên/nickname/email để tìm…"
              placeholderTextColor="#94a3b8"
              value={q}
              onChangeText={setQ}
            />
          </Row>

          <Row style={{ flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            <Btn
              onPress={selectAllOnPage}
              variant="outline"
              icon="done-all"
              disabled={!referees?.length}
            >
              Chọn tất cả
            </Btn>
            <Btn onPress={clearAll} variant="outline" icon="clear-all">
              Bỏ chọn
            </Btn>
            {singleMatchId ? (
              <Btn
                onPress={() =>
                  setSelected(
                    (assignedForSingle || []).map((u) => String(u._id))
                  )
                }
                variant="outline"
              >
                Dùng DS đã gán
              </Btn>
            ) : null}
          </Row>
        </Card>

        {/* Danh sách trọng tài */}
        <Card>
          <Row
            style={{ justifyContent: "space-between", alignItems: "center" }}
          >
            <Row style={{ alignItems: "center", gap: 8 }}>
              <Text style={styles.subtitle}>Trọng tài trong giải</Text>
              <Chip text={`${referees?.length || 0} kết quả`} outlined />
            </Row>
            <Btn onPress={() => refetch?.()} variant="outline">
              Refresh
            </Btn>
          </Row>

          {isLoading ? (
            <View style={{ paddingVertical: 16, alignItems: "center" }}>
              <ActivityIndicator />
            </View>
          ) : error ? (
            <Text style={{ color: "#b91c1c" }}>
              {error?.data?.message || "Không tải được danh sách."}
            </Text>
          ) : (referees?.length || 0) === 0 ? (
            <Text style={{ color: "#475569" }}>Không có kết quả phù hợp.</Text>
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
                      <Avatar name={personNickname(u)} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: "600", color: "#111827" }}>
                          {personNickname(u)}
                        </Text>
                        <Text style={{ color: "#64748b", fontSize: 12 }}>
                          {u?.email || u?.phone || ""}
                        </Text>
                      </View>
                      <Checkbox checked={checked} />
                    </Row>
                  </Pressable>
                );
              })}
            </View>
          )}
        </Card>

        {/* Cảnh báo */}
        <Card style={{ backgroundColor: "#eff6ff", borderColor: "#bfdbfe" }}>
          <Text style={{ color: "#075985" }}>
            Thao tác này sẽ{" "}
            <Text style={{ fontWeight: "700" }}>cập nhật (thay thế)</Text> danh
            sách trọng tài cho{" "}
            <Text style={{ fontWeight: "700" }}>
              {effectiveMatchIds.length}
            </Text>{" "}
            trận được chọn.
          </Text>
        </Card>

        {/* Footer actions */}
        <Row style={{ justifyContent: "flex-end", gap: 8 }}>
          <Btn variant="outline" onPress={() => sheetRef.current?.dismiss()}>
            Đóng
          </Btn>
          <Btn
            onPress={handleSubmit}
            icon="send"
            disabled={!canSubmit || assigning}
          >
            {assigning ? "Đang lưu…" : "Lưu"}
          </Btn>
        </Row>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

/* ============ styles ============ */
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
  input: { flex: 1, fontSize: 15, color: "#111" },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#64748b",
    alignItems: "center",
    justifyContent: "center",
  },
  listItem: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
});
