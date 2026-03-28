import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { MaterialIcons } from "@expo/vector-icons";
import { useTheme } from "@react-navigation/native";

import {
  useAddTournamentManagerMutation,
  useListTournamentManagersQuery,
  useRemoveTournamentManagerMutation,
} from "@/slices/tournamentsApiSlice";
import { useLazySearchUserQuery } from "@/slices/usersApiSlice";

const sid = (value: any) =>
  String(value?._id || value?.id || value?.userId || value || "");

const personName = (user: any) =>
  user?.nickname ||
  user?.nickName ||
  user?.name ||
  user?.fullName ||
  user?.phone ||
  "—";

const personContact = (user: any) =>
  [user?.phone, user?.email].filter(Boolean).join(" • ") || "—";

const InitialAvatar = ({ name }: { name?: string }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.avatar}>
      <Text style={styles.avatarText}>
        {(name?.trim?.()[0] || "U").toUpperCase()}
      </Text>
    </View>
  );
};

export default function TournamentManagersSheet({
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
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const sheetRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => snapPointsProp || ["84%"], [snapPointsProp]);

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    if (open) sheetRef.current?.present();
    else sheetRef.current?.dismiss();
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQ("");
      setDebouncedQ("");
    }
  }, [open]);

  const {
    data: managerRows = [],
    isLoading: loadingManagers,
    isFetching: fetchingManagers,
    refetch: refetchManagers,
  } = useListTournamentManagersQuery(tournamentId as string, {
    skip: !open || !tournamentId,
    refetchOnMountOrArgChange: true,
  });

  const [searchUsers, { data: searchResults = [], isFetching: searchingUsers }] =
    useLazySearchUserQuery();

  useEffect(() => {
    if (!open || !debouncedQ) return;
    searchUsers(debouncedQ);
  }, [debouncedQ, open, searchUsers]);

  const [addManager, { isLoading: addingManager }] =
    useAddTournamentManagerMutation();
  const [removeManager, { isLoading: removingManager }] =
    useRemoveTournamentManagerMutation();

  const assignedManagerIds = useMemo(
    () => new Set((managerRows || []).map((row: any) => sid(row?.user))),
    [managerRows]
  );

  const handleAdd = async (user: any) => {
    const userId = sid(user);
    if (!userId) return;
    if (assignedManagerIds.has(userId)) {
      Alert.alert("Thông báo", "Người này đã là quản lý của giải.");
      return;
    }
    try {
      await addManager({ tournamentId, userId }).unwrap();
      Alert.alert("Thành công", "Đã thêm người quản lý.");
      setQ("");
      setDebouncedQ("");
      refetchManagers?.();
      onChanged?.();
    } catch (error: any) {
      Alert.alert(
        "Lỗi",
        error?.data?.message || error?.error || "Không thể thêm người quản lý."
      );
    }
  };

  const handleRemove = (row: any) => {
    const userId = sid(row?.user);
    if (!userId) return;
    Alert.alert(
      "Xác nhận",
      `Gỡ "${personName(row?.user)}" khỏi danh sách quản lý?`,
      [
        { text: "Hủy", style: "cancel" },
        {
          text: "Gỡ",
          style: "destructive",
          onPress: async () => {
            try {
              await removeManager({ tournamentId, userId }).unwrap();
              Alert.alert("Thành công", "Đã gỡ người quản lý.");
              refetchManagers?.();
              onChanged?.();
            } catch (error: any) {
              Alert.alert(
                "Lỗi",
                error?.data?.message ||
                  error?.error ||
                  "Không thể gỡ người quản lý."
              );
            }
          },
        },
      ]
    );
  };

  const canSearch = !!debouncedQ;
  const searchItems = Array.isArray(searchResults) ? searchResults : [];
  const busy = addingManager || removingManager;

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={snapPoints}
      onDismiss={onClose}
      handleIndicatorStyle={{ backgroundColor: colors.border }}
      backgroundStyle={{ backgroundColor: colors.card }}
      backdropComponent={(props) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={0.5}
          style={{ zIndex: 1000 }}
        />
      )}
      containerStyle={{ zIndex: 1000 }}
    >
      <BottomSheetScrollView contentContainerStyle={styles.container}>
        <View style={styles.headerRow}>
          <View style={styles.headerTitleRow}>
            <MaterialIcons name="group" size={18} color={colors.text} />
            <Text style={styles.title}>Quản lý người quản lý giải</Text>
          </View>
          <Pressable onPress={() => sheetRef.current?.dismiss()} hitSlop={8}>
            <MaterialIcons name="close" size={20} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Người đang quản lý</Text>
            <View style={styles.countChip}>
              <Text style={styles.countChipText}>
                {(managerRows || []).length} người
              </Text>
            </View>
          </View>

          {loadingManagers ? (
            <View style={styles.centerBox}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : managerRows.length === 0 ? (
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>Chưa có người quản lý nào.</Text>
            </View>
          ) : (
            <View style={styles.listBlock}>
              {managerRows.map((row: any) => (
                <View key={row?._id || sid(row?.user)} style={styles.personRow}>
                  <View style={styles.personInfoRow}>
                    <InitialAvatar name={personName(row?.user)} />
                    <View style={styles.personMeta}>
                      <Text style={styles.personName}>
                        {personName(row?.user)}
                      </Text>
                      <Text style={styles.personContact} numberOfLines={1}>
                        {personContact(row?.user)}
                      </Text>
                    </View>
                  </View>
                  <Pressable
                    onPress={() => handleRemove(row)}
                    disabled={busy}
                    hitSlop={10}
                    style={({ pressed }) => [
                      styles.iconBtn,
                      pressed && { opacity: 0.75 },
                    ]}
                  >
                    <MaterialIcons
                      name="delete-outline"
                      size={20}
                      color="#ef4444"
                    />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
          {fetchingManagers && !loadingManagers ? (
            <Text style={styles.subtleText}>Đang làm mới danh sách…</Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Tìm người để thêm quản lý</Text>
          <View style={styles.inputWrap}>
            <MaterialIcons name="person-search" size={18} color="#6b7280" />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Tên / nickname / số điện thoại"
              placeholderTextColor="#9ca3af"
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchingUsers ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : null}
          </View>
          <Text style={styles.helperText}>
            Tìm đúng người rồi bấm dấu cộng để thêm vào danh sách quản lý.
          </Text>

          {!canSearch ? (
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                Nhập từ khóa để tìm người dùng.
              </Text>
            </View>
          ) : searchingUsers && searchItems.length === 0 ? (
            <View style={styles.centerBox}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : searchItems.length === 0 ? (
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>Không tìm thấy người dùng phù hợp.</Text>
            </View>
          ) : (
            <View style={styles.listBlock}>
              {searchItems.map((user: any) => {
                const alreadyAssigned = assignedManagerIds.has(sid(user));
                return (
                  <View key={sid(user)} style={styles.personRow}>
                    <View style={styles.personInfoRow}>
                      <InitialAvatar name={personName(user)} />
                      <View style={styles.personMeta}>
                        <Text style={styles.personName}>{personName(user)}</Text>
                        <Text style={styles.personContact} numberOfLines={1}>
                          {personContact(user)}
                        </Text>
                      </View>
                    </View>

                    {alreadyAssigned ? (
                      <View style={[styles.countChip, styles.assignedChip]}>
                        <Text
                          style={[styles.countChipText, styles.assignedChipText]}
                        >
                          Đã thêm
                        </Text>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => handleAdd(user)}
                        disabled={busy}
                        hitSlop={10}
                        style={({ pressed }) => [
                          styles.iconBtn,
                          styles.addBtn,
                          pressed && { opacity: 0.8 },
                        ]}
                      >
                        <MaterialIcons
                          name="person-add-alt-1"
                          size={18}
                          color="#2563eb"
                        />
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

const makeStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 28,
      gap: 14,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 4,
    },
    headerTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    title: {
      color: colors.text,
      fontSize: 17,
      fontWeight: "800",
    },
    card: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 18,
      backgroundColor: colors.card,
      padding: 14,
      gap: 12,
    },
    cardHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    cardTitle: {
      color: colors.text,
      fontSize: 15,
      fontWeight: "800",
    },
    countChip: {
      borderRadius: 999,
      backgroundColor: "#e0f2fe",
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    countChipText: {
      color: "#0369a1",
      fontSize: 12,
      fontWeight: "700",
    },
    assignedChip: {
      backgroundColor: "#dcfce7",
    },
    assignedChipText: {
      color: "#15803d",
    },
    centerBox: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 14,
    },
    infoBox: {
      borderRadius: 14,
      backgroundColor: "#f8fafc",
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    infoText: {
      color: "#64748b",
      fontSize: 13,
      lineHeight: 18,
    },
    subtleText: {
      color: "#64748b",
      fontSize: 12,
    },
    listBlock: {
      gap: 8,
    },
    personRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: colors.card,
    },
    personInfoRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      flex: 1,
      minWidth: 0,
    },
    personMeta: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    personName: {
      color: colors.text,
      fontSize: 14,
      fontWeight: "700",
    },
    personContact: {
      color: "#64748b",
      fontSize: 12,
    },
    avatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary,
    },
    avatarText: {
      color: "#fff",
      fontWeight: "800",
    },
    iconBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
    },
    addBtn: {
      backgroundColor: "#dbeafe",
    },
    inputWrap: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      paddingHorizontal: 12,
      backgroundColor: colors.card,
    },
    input: {
      flex: 1,
      minHeight: 44,
      color: colors.text,
      fontSize: 14,
    },
    helperText: {
      color: "#64748b",
      fontSize: 12,
      lineHeight: 18,
    },
  });
