// Sửa Ban tổ chức (mobile): chức vụ + ẩn/hiện từng thành viên (creator + đồng quản lý).
import React, { useMemo, useState, useEffect } from "react";
import {
  ScrollView,
  Text,
  TextInput,
  View,
  Pressable,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
import { useTheme } from "@react-navigation/native";
import {
  useGetTournamentQuery,
  useUpdateOrganizerMutation,
} from "@/slices/tournamentsApiSlice";

const nameOf = (u: any) =>
  u?.nickname || u?.nickName || u?.name || u?.fullName || u?.phone || "BTC";

export default function OrganizersEditMobile() {
  const params = useLocalSearchParams();
  const id = String(Array.isArray(params.id) ? params.id[0] : params.id || "");
  const theme: any = useTheme();
  const C = theme.colors;

  const { data: tour, refetch } = useGetTournamentQuery(id, { skip: !id });
  const [updateOrganizer, { isLoading }] = useUpdateOrganizerMutation();

  const rows = useMemo(() => {
    const list: any[] = [];
    const creator = (tour as any)?.createdBy;
    if (creator && creator._id) {
      list.push({
        userId: String(creator._id),
        user: creator,
        isCreator: true,
        defaultLabel: "Người tạo giải",
        title: (tour as any)?.creatorTitle || "",
        hidden: !!(tour as any)?.creatorHidden,
      });
    }
    const managers = Array.isArray((tour as any)?.managers)
      ? (tour as any).managers
      : [];
    for (const m of managers) {
      if (!m?.user?._id) continue;
      list.push({
        userId: String(m.user._id),
        user: m.user,
        isCreator: false,
        defaultLabel: "Đồng quản lý",
        title: m.title || "",
        hidden: !!m.hidden,
      });
    }
    return list;
  }, [tour]);

  const save = async (userId: string, patch: any) => {
    try {
      await updateOrganizer({ tournamentId: id, userId, ...patch }).unwrap();
      refetch();
    } catch (e: any) {
      Alert.alert("Lỗi", e?.data?.message || "Cập nhật BTC thất bại.");
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <Stack.Screen options={{ title: "Ban tổ chức" }} />
      <ScrollView contentContainerStyle={{ padding: 12, gap: 10 }}>
        <Text style={{ color: C.text, opacity: 0.6, fontSize: 13 }}>
          Sửa chức vụ (để trống = mặc định) và bật/tắt hiển thị từng người.
        </Text>
        {rows.length === 0 ? (
          <Text style={{ color: C.text, opacity: 0.6, marginTop: 20 }}>
            Chưa có thành viên BTC.
          </Text>
        ) : (
          rows.map((r) => (
            <OrgRow
              key={r.userId}
              row={r}
              C={C}
              disabled={isLoading}
              onSaveTitle={(v: string) => save(r.userId, { title: v })}
              onToggleHidden={() => save(r.userId, { hidden: !r.hidden })}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

function OrgRow({
  row,
  C,
  disabled,
  onSaveTitle,
  onToggleHidden,
}: {
  row: any;
  C: any;
  disabled: boolean;
  onSaveTitle: (v: string) => void;
  onToggleHidden: () => void;
}) {
  const [val, setVal] = useState(row.title || "");
  useEffect(() => setVal(row.title || ""), [row.title]);
  return (
    <View
      style={{
        borderRadius: 14,
        borderWidth: 1,
        borderColor: C.border,
        backgroundColor: C.card,
        padding: 12,
        gap: 10,
        opacity: row.hidden ? 0.6 : 1,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: C.text, fontWeight: "800" }} numberOfLines={1}>
            {nameOf(row.user)}
          </Text>
          <Text style={{ color: C.text, opacity: 0.5, fontSize: 12 }}>
            {row.isCreator ? "Người tạo" : "Đồng quản lý"}
          </Text>
        </View>
        <Pressable
          onPress={onToggleHidden}
          disabled={disabled}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: row.hidden ? C.border : "#2563EB",
            backgroundColor: row.hidden ? "transparent" : "#2563EB",
          }}
        >
          <Ionicons
            name={row.hidden ? "eye-off-outline" : "eye-outline"}
            size={15}
            color={row.hidden ? C.text : "#fff"}
          />
          <Text
            style={{
              fontWeight: "700",
              fontSize: 12,
              color: row.hidden ? C.text : "#fff",
            }}
          >
            {row.hidden ? "Đang ẩn" : "Đang hiện"}
          </Text>
        </Pressable>
      </View>
      <TextInput
        value={val}
        onChangeText={setVal}
        onBlur={() => {
          if ((row.title || "") !== val) onSaveTitle(val);
        }}
        placeholder={row.defaultLabel}
        placeholderTextColor={C.text + "66"}
        maxLength={60}
        style={{
          borderWidth: 1,
          borderColor: C.border,
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 9,
          color: C.text,
          fontWeight: "600",
        }}
      />
    </View>
  );
}
