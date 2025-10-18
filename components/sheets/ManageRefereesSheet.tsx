// components/ManageRefereesSheet.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
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
import { MaterialIcons } from "@expo/vector-icons"; // nếu không dùng Expo: dùng react-native-vector-icons/MaterialIcons

import {
  useListTournamentRefereesQuery,
  useUpsertTournamentRefereesMutation,
} from "@/slices/refereeScopeApiSlice";
import { useAdminSearchRefereesQuery } from "@/slices/tournamentsApiSlice";

/* ---------------- helpers ---------------- */
const personNickname = (p) =>
  p?.nickname ||
  p?.nickName ||
  p?.nick ||
  p?.displayName ||
  p?.fullName ||
  p?.name ||
  "—";

const InitialAvatar = ({ name }) => {
  const ch = (name?.trim?.()[0] || "U").toUpperCase();
  return (
    <View style={styles.avatar}>
      <Text style={{ color: "#fff", fontWeight: "700" }}>{ch}</Text>
    </View>
  );
};

const Row = ({ children, style }) => (
  <View style={[styles.row, style]}>{children}</View>
);

const Chip = ({ children, tone = "default" }) => {
  const map = {
    default: { bg: "#eef2f7", fg: "#263238" },
    info: { bg: "#e0f2fe", fg: "#075985" },
  };
  const c = map[tone] || map.default;
  return (
    <View style={[styles.chip, { backgroundColor: c.bg }]}>
      <Text style={{ color: c.fg, fontSize: 12, fontWeight: "600" }}>
        {children}
      </Text>
    </View>
  );
};

/* ---------------- main ---------------- */
export default function ManageRefereesSheet({
  open,
  tournamentId,
  onClose,
  onChanged,
  snapPoints: snapPointsProp,
}) {
  const snapPoints = useMemo(() => snapPointsProp || ["80%"], [snapPointsProp]);
  const sheetRef = useRef(null);

  // debounce search q
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  // open/close sheet imperatively
  useEffect(() => {
    if (open) sheetRef.current?.present();
    else sheetRef.current?.dismiss();
  }, [open]);

  /* -------- queries -------- */
  const {
    data: assigned = [],
    isLoading: loadingAssigned,
    refetch: refetchAssigned,
  } = useListTournamentRefereesQuery(
    { tid: tournamentId, q: "" },
    { skip: !open || !tournamentId }
  );

  const { data: candidates = [], isLoading: loadingSearch } =
    useAdminSearchRefereesQuery(
      { tid: tournamentId, q: debouncedQ },
      { skip: !open || !tournamentId }
    );

  const [upsert, { isLoading: saving }] = useUpsertTournamentRefereesMutation();

  const isAssigned = (id) =>
    (assigned || []).some((u) => String(u._id) === String(id));

  const handleAdd = async (userId) => {
    try {
      await upsert({ tid: tournamentId, add: [userId] }).unwrap();
      Alert.alert("Thành công", "Đã thêm trọng tài vào giải");
      refetchAssigned?.();
      onChanged?.();
    } catch (e) {
      Alert.alert(
        "Lỗi",
        e?.data?.message || e?.error || "Thêm trọng tài thất bại"
      );
    }
  };

  const handleRemove = async (userId) => {
    try {
      await upsert({ tid: tournamentId, remove: [userId] }).unwrap();
      Alert.alert("Thành công", "Đã bỏ trọng tài khỏi giải");
      refetchAssigned?.();
      onChanged?.();
    } catch (e) {
      Alert.alert(
        "Lỗi",
        e?.data?.message || e?.error || "Bỏ trọng tài thất bại"
      );
    }
  };

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={snapPoints}
      onDismiss={onClose}
      backdropComponent={(p) => (
        <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} />
      )}
      handleIndicatorStyle={{ backgroundColor: "#cbd5e1" }}
    >
      <BottomSheetScrollView contentContainerStyle={styles.container}>
        {/* Header */}
        <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
          <Row style={{ alignItems: "center", gap: 8 }}>
            <MaterialIcons name="how-to-reg" size={18} color="#111" />
            <Text style={styles.title}>Quản lý trọng tài của giải</Text>
          </Row>
          <Pressable
            onPress={() => sheetRef.current?.dismiss()}
            hitSlop={8}
            style={({ pressed }) => [pressed && { opacity: 0.7 }]}
          >
            <MaterialIcons name="close" size={20} color="#111" />
          </Pressable>
        </Row>

        {/* Assigned card */}
        <View style={styles.card}>
          <Row
            style={{ justifyContent: "space-between", alignItems: "center" }}
          >
            <Text style={styles.cardTitle}>Đang là trọng tài</Text>
            <Chip tone="info">{(assigned || []).length} người</Chip>
          </Row>

          {loadingAssigned ? (
            <View style={styles.center}>
              <ActivityIndicator />
            </View>
          ) : (assigned?.length || 0) === 0 ? (
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>Chưa có trọng tài nào.</Text>
            </View>
          ) : (
            <View style={{ gap: 6 }}>
              {assigned.map((u) => (
                <Row key={u._id} style={styles.itemRow}>
                  <Row style={{ alignItems: "center", gap: 10 }}>
                    <InitialAvatar name={personNickname(u)} />
                    <View style={{ gap: 2 }}>
                      <Text style={styles.itemName}>{personNickname(u)}</Text>
                      <Text style={styles.itemMeta}>
                        {u?.email || u?.phone || ""}
                      </Text>
                    </View>
                  </Row>
                  <Pressable
                    onPress={() => handleRemove(u._id)}
                    disabled={saving}
                    style={({ pressed }) => [
                      styles.iconBtn,
                      pressed && { opacity: 0.8 },
                    ]}
                  >
                    <MaterialIcons
                      name="remove-circle-outline"
                      size={20}
                      color="#ef4444"
                    />
                  </Pressable>
                </Row>
              ))}
            </View>
          )}
        </View>

        {/* Search & add card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Tìm người để thêm trọng tài</Text>

          <View style={styles.inputWrap}>
            <MaterialIcons name="person-search" size={18} color="#64748b" />
            <TextInput
              style={styles.input}
              placeholder="Nhập tên/nickname/email để tìm…"
              placeholderTextColor="#94a3b8"
              value={q}
              onChangeText={setQ}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
          </View>

          <View style={{ marginTop: 10 }}>
            {loadingSearch ? (
              <View style={styles.center}>
                <ActivityIndicator />
              </View>
            ) : (candidates?.length || 0) === 0 ? (
              <View style={styles.infoBox}>
                <Text style={styles.infoText}>Không có kết quả phù hợp.</Text>
              </View>
            ) : (
              <ScrollView
                style={{ maxHeight: 260 }}
                contentContainerStyle={{ gap: 6 }}
                keyboardShouldPersistTaps="handled"
              >
                {candidates.map((u) => {
                  const already = isAssigned(u._id);
                  return (
                    <Row key={u._id} style={styles.itemRow}>
                      <Row style={{ alignItems: "center", gap: 10 }}>
                        <InitialAvatar name={personNickname(u)} />
                        <View style={{ gap: 2 }}>
                          <Text style={styles.itemName}>
                            {personNickname(u)}
                          </Text>
                          <Text style={styles.itemMeta}>
                            {u?.email || u?.phone || ""}
                          </Text>
                        </View>
                      </Row>
                      <Pressable
                        onPress={() => handleAdd(u._id)}
                        disabled={saving || already}
                        style={({ pressed }) => [
                          styles.iconBtn,
                          already && { opacity: 0.4 },
                          pressed && { opacity: 0.8 },
                        ]}
                      >
                        <MaterialIcons
                          name="add"
                          size={20}
                          color={already ? "#94a3b8" : "#0a84ff"}
                        />
                      </Pressable>
                    </Row>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>

        {/* Footer actions */}
        <Row style={{ justifyContent: "flex-end" }}>
          <Pressable
            onPress={() => sheetRef.current?.dismiss()}
            style={({ pressed }) => [
              styles.btn,
              styles.btnOutline,
              pressed && { opacity: 0.95 },
            ]}
          >
            <Text style={{ color: "#0a84ff", fontWeight: "700" }}>Đóng</Text>
          </Pressable>
        </Row>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

/* ---------------- styles ---------------- */
const styles = StyleSheet.create({
  container: {
    padding: 12,
    gap: 12,
  },
  title: { fontSize: 16, fontWeight: "700", color: "#111" },

  card: {
    borderWidth: 1,
    borderColor: "#e4e8ef",
    borderRadius: 14,
    backgroundColor: "#fff",
    padding: 12,
    gap: 10,
  },
  cardTitle: { fontWeight: "700", color: "#111" },

  row: { flexDirection: "row", gap: 8 },
  center: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },

  infoBox: {
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#e0f2fe",
    borderRadius: 10,
    padding: 10,
  },
  infoText: { color: "#075985" },

  itemRow: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "space-between",
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#0a84ff",
    alignItems: "center",
    justifyContent: "center",
  },
  itemName: { color: "#111", fontWeight: "600" },
  itemMeta: { color: "#6b7280", fontSize: 12 },

  inputWrap: {
    borderWidth: 1,
    borderColor: "#e4e8ef",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: Platform.select({ ios: 10, android: 8 }),
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  input: { flex: 1, fontSize: 15, color: "#111" },

  chip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },

  iconBtn: {
    padding: 6,
    borderRadius: 999,
  },

  btn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  btnOutline: {
    borderWidth: 1,
    borderColor: "#0a84ff",
    backgroundColor: "transparent",
  },
});
