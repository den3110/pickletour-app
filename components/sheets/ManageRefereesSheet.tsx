// components/ManageRefereesSheet.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
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
import { MaterialIcons } from "@expo/vector-icons";
import { useTheme } from "@react-navigation/native";

import {
  useListTournamentRefereesQuery,
  useUpsertTournamentRefereesMutation,
} from "@/slices/refereeScopeApiSlice";
import { useAdminSearchRefereesQuery } from "@/slices/tournamentsApiSlice";

/* ---------------- helpers ---------------- */
const personNickname = (p: any) =>
  p?.nickname ||
  p?.nickName ||
  p?.nick ||
  p?.displayName ||
  p?.fullName ||
  p?.name ||
  "—";

const InitialAvatar = ({ name }: { name?: string }) => {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const ch = (name?.trim?.()[0] || "U").toUpperCase();
  return (
    <View style={s.avatar}>
      <Text style={{ color: "#fff", fontWeight: "700" }}>{ch}</Text>
    </View>
  );
};

const Row = ({ children, style }: any) => {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return <View style={[s.row, style]}>{children}</View>;
};

// Themed Chip
const Chip = ({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "info";
}) => {
  const { colors, dark } = useTheme();
  const s = useMemo(() => makeStyles(colors, dark), [colors, dark]);

  const map = {
    default: { bg: s.chipDefaultBg, fg: s.chipDefaultFg },
    info: { bg: s.chipInfoBg, fg: s.chipInfoFg },
  } as const;

  const c = tone === "info" ? map.info : map.default;
  return (
    <View style={[s.chip, { backgroundColor: c.bg }]}>
      <Text style={{ color: c.fg as string, fontSize: 12, fontWeight: "600" }}>
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
}: {
  open: boolean;
  tournamentId?: string;
  onClose?: () => void;
  onChanged?: () => void;
  snapPoints?: (string | number)[];
}) {
  const { colors, dark } = useTheme();
  const s = useMemo(() => makeStyles(colors, dark), [colors, dark]);

  const snapPoints = useMemo(() => snapPointsProp || ["80%"], [snapPointsProp]);
  const sheetRef = useRef<BottomSheetModal>(null);

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
    { tid: tournamentId as string, q: "" },
    { skip: !open || !tournamentId }
  );

  const { data: candidates = [], isLoading: loadingSearch } =
    useAdminSearchRefereesQuery(
      { tid: tournamentId as string, q: debouncedQ },
      { skip: !open || !tournamentId }
    );

  const [upsert, { isLoading: saving }] = useUpsertTournamentRefereesMutation();

  const isAssigned = (id: string) =>
    (assigned || []).some((u: any) => String(u._id) === String(id));

  const handleAdd = async (userId: string) => {
    try {
      await upsert({ tid: tournamentId, add: [userId] }).unwrap();
      Alert.alert("Thành công", "Đã thêm trọng tài vào giải");
      refetchAssigned?.();
      onChanged?.();
    } catch (e: any) {
      Alert.alert(
        "Lỗi",
        e?.data?.message || e?.error || "Thêm trọng tài thất bại"
      );
    }
  };

  const handleRemove = async (userId: string) => {
    try {
      await upsert({ tid: tournamentId, remove: [userId] }).unwrap();
      Alert.alert("Thành công", "Đã bỏ trọng tài khỏi giải");
      refetchAssigned?.();
      onChanged?.();
    } catch (e: any) {
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
        <BottomSheetBackdrop
          {...p}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={0.5}
        />
      )}
      handleIndicatorStyle={{ backgroundColor: colors.border }}
      backgroundStyle={{ backgroundColor: colors.card }}
    >
      <BottomSheetScrollView contentContainerStyle={s.container}>
        {/* Header */}
        <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
          <Row style={{ alignItems: "center", gap: 8 }}>
            <MaterialIcons name="how-to-reg" size={18} color={colors.text} />
            <Text style={s.title}>Quản lý trọng tài của giải</Text>
          </Row>
          <Pressable
            onPress={() => sheetRef.current?.dismiss()}
            hitSlop={8}
            style={({ pressed }) => [pressed && { opacity: 0.7 }]}
          >
            <MaterialIcons name="close" size={20} color={colors.text} />
          </Pressable>
        </Row>

        {/* Assigned card */}
        <View style={s.card}>
          <Row
            style={{ justifyContent: "space-between", alignItems: "center" }}
          >
            <Text style={s.cardTitle}>Đang là trọng tài</Text>
            <Chip tone="info">{(assigned || []).length} người</Chip>
          </Row>

          {loadingAssigned ? (
            <View style={s.center}>
              <ActivityIndicator />
            </View>
          ) : (assigned?.length || 0) === 0 ? (
            <View style={s.infoBox}>
              <Text style={s.infoText}>Chưa có trọng tài nào.</Text>
            </View>
          ) : (
            <View style={{ gap: 6 }}>
              {(assigned as any[]).map((u) => (
                <Row key={u._id} style={s.itemRow}>
                  <Row style={{ alignItems: "center", gap: 10 }}>
                    <InitialAvatar name={personNickname(u)} />
                    <View style={{ gap: 2 }}>
                      <Text style={s.itemName}>{personNickname(u)}</Text>
                      <Text style={s.itemMeta}>
                        {u?.email || u?.phone || ""}
                      </Text>
                    </View>
                  </Row>
                  <Pressable
                    onPress={() => handleRemove(u._id)}
                    disabled={saving}
                    style={({ pressed }) => [
                      s.iconBtn,
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
        <View style={s.card}>
          <Text style={s.cardTitle}>Tìm người để thêm trọng tài</Text>

          <View style={s.inputWrap}>
            <MaterialIcons
              name="person-search"
              size={18}
              color={s.mutedColor}
            />
            <TextInput
              style={s.input}
              placeholder="Nhập tên/nickname/email để tìm…"
              placeholderTextColor={s.placeholderColor as string}
              value={q}
              onChangeText={setQ}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
          </View>

          <View style={{ marginTop: 10 }}>
            {loadingSearch ? (
              <View style={s.center}>
                <ActivityIndicator />
              </View>
            ) : (candidates?.length || 0) === 0 ? (
              <View style={s.infoBox}>
                <Text style={s.infoText}>Không có kết quả phù hợp.</Text>
              </View>
            ) : (
              <ScrollView
                style={{ maxHeight: 260 }}
                contentContainerStyle={{ gap: 6 }}
                keyboardShouldPersistTaps="handled"
              >
                {(candidates as any[]).map((u) => {
                  const already = isAssigned(u._id);
                  return (
                    <Row key={u._id} style={s.itemRow}>
                      <Row style={{ alignItems: "center", gap: 10 }}>
                        <InitialAvatar name={personNickname(u)} />
                        <View style={{ gap: 2 }}>
                          <Text style={s.itemName}>{personNickname(u)}</Text>
                          <Text style={s.itemMeta}>
                            {u?.email || u?.phone || ""}
                          </Text>
                        </View>
                      </Row>
                      <Pressable
                        onPress={() => handleAdd(u._id)}
                        disabled={saving || already}
                        style={({ pressed }) => [
                          s.iconBtn,
                          already && { opacity: 0.4 },
                          pressed && { opacity: 0.8 },
                        ]}
                      >
                        <MaterialIcons
                          name="add"
                          size={20}
                          color={
                            already
                              ? (s.disabledColor as string)
                              : colors.primary
                          }
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
              s.btn,
              s.btnOutline,
              pressed && { opacity: 0.95 },
            ]}
          >
            <Text style={{ color: colors.primary, fontWeight: "700" }}>
              Đóng
            </Text>
          </Pressable>
        </Row>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

/* ---------------- styles (THEMED) ---------------- */
function makeStyles(colors: any, dark?: boolean) {
  // derived tones
  const text = colors.text;
  const border = colors.border;
  const card = colors.card;
  const primary = colors.primary;

  const muted = dark ? "#94a3b8" : "#64748b";
  const placeholder = dark ? "#8b97a8" : "#94a3b8";
  const disabled = dark ? "#6b7280" : "#94a3b8";

  // info tone (chip / infobox)
  const infoBg = dark ? "#0f2536" : "#e0f2fe";
  const infoBorder = dark ? "#1e3a5f" : "#bfdbfe";
  const infoText = dark ? "#93c5fd" : "#075985";

  return StyleSheet.create({
    // base tokens we also export as fields for Chip & icons
    mutedColor: { color: muted } as any,
    placeholderColor: placeholder as any,
    disabledColor: disabled as any,
    chipDefaultBg: dark ? "#1f2937" : "#eef2f7",
    chipDefaultFg: dark ? "#e5e7eb" : "#263238",
    chipInfoBg: infoBg,
    chipInfoFg: infoText,

    container: {
      padding: 12,
      gap: 12,
      backgroundColor: "transparent",
    },
    title: { fontSize: 16, fontWeight: "700", color: text },

    card: {
      borderWidth: 1,
      borderColor: border,
      borderRadius: 14,
      backgroundColor: card,
      padding: 12,
      gap: 10,
    },
    cardTitle: { fontWeight: "700", color: text },

    row: { flexDirection: "row", gap: 8 },
    center: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 12,
    },

    infoBox: {
      borderWidth: 1,
      borderColor: infoBorder,
      backgroundColor: infoBg,
      borderRadius: 10,
      padding: 10,
    },
    infoText: { color: infoText },

    itemRow: {
      borderWidth: 1,
      borderColor: border,
      borderRadius: 12,
      paddingVertical: 8,
      paddingHorizontal: 10,
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: card,
    },
    avatar: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: primary,
      alignItems: "center",
      justifyContent: "center",
    },
    itemName: { color: text, fontWeight: "600" },
    itemMeta: { color: muted, fontSize: 12 },

    inputWrap: {
      borderWidth: 1,
      borderColor: border,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: Platform.select({ ios: 10, android: 8 }) as number,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: card,
    },
    input: { flex: 1, fontSize: 15, color: text },

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
      borderColor: primary,
      backgroundColor: "transparent",
    },
  });
}
