/* eslint-disable react/prop-types */
import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  KeyboardAvoidingView,
  Platform,
  View,
  Pressable,
  TextInput,
  ScrollView,
  Text,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons"; // hoặc từ react-native-vector-icons
import {
  useListTournamentRefereesQuery,
  useBatchAssignRefereeMutation,
} from "@/slices/refereeScopeApiSlice"; // chỉnh path cho đúng dự án của bạn

// id helper
const idOfRef = (r) => String(r?._id ?? r?.id ?? "");

// convert selectedMatchIds (Set/array) -> array<string>
const normalizeMatchIds = (selectedMatchIds) => {
  if (!selectedMatchIds) return [];
  if (selectedMatchIds instanceof Set) {
    return Array.from(selectedMatchIds).map(String).filter(Boolean);
  }
  if (Array.isArray(selectedMatchIds)) {
    return selectedMatchIds.map(String).filter(Boolean);
  }
  return [];
};

function BatchAssignRefModal({
  visible,
  onClose,
  tournamentId,
  selectedMatchIds,
  // dùng đúng mấy thứ bạn đang có sẵn ở screen:
  colors,
  t,
  styles,
  IconBtn,
  BtnOutline,
  onAssigned, // callback: ví dụ refetchMatches ở ngoài (optional)
}) {
  const matchIds = useMemo(
    () => normalizeMatchIds(selectedMatchIds),
    [selectedMatchIds]
  );

  const [search, setSearch] = useState("");
  const [pickedRefs, setPickedRefs] = useState([]);

  // ==== Gọi API lấy trọng tài trong giải ====
  const {
    data: refsResp,
    isLoading: refsLoading,
    isError: refsIsError,
    error: refsErr,
    refetch: refetchRefs,
  } = useListTournamentRefereesQuery(
    { tid: tournamentId },
    {
      skip: !visible || !tournamentId,
    }
  );

  // Mỗi lần mở modal -> refetch + reset local state
  useEffect(() => {
    if (visible && tournamentId) {
      refetchRefs?.();
      setPickedRefs([]);
      setSearch("");
    }
  }, [visible, tournamentId, refetchRefs]);

  // Chuẩn hoá list từ API
  const allRefs = useMemo(() => {
    if (!refsResp) return [];
    if (Array.isArray(refsResp.items)) return refsResp.items;
    if (Array.isArray(refsResp)) return refsResp;
    return [];
  }, [refsResp]);

  // Filter theo search (giữ nguyên layout, chỉ thêm logic)
  const refOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allRefs;
    return allRefs.filter((r) => {
      const txt = [
        r?.name,
        r?.nickname,
        r?.nickName,
        r?.displayName,
        r?.email,
        r?.phone,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return txt.includes(q);
    });
  }, [allRefs, search]);

  const [batchAssign, { isLoading: batchingRefs }] =
    useBatchAssignRefereeMutation();

  const togglePick = (refObj) => {
    const id = idOfRef(refObj);
    setPickedRefs((prev) => {
      const exists = prev.some((x) => idOfRef(x) === id);
      if (exists) {
        return prev.filter((x) => idOfRef(x) !== id);
      }
      return [...prev, refObj];
    });
  };

  const submitBatchAssign = async () => {
    // giữ đúng behavior: nút đã disabled khi không hợp lệ, nên đây chủ yếu handle API
    if (!matchIds.length || !pickedRefs.length || !tournamentId) return;

    const refereeIds = pickedRefs.map(idOfRef).filter(Boolean);
    if (!refereeIds.length) return;

    try {
      await batchAssign({
        ids: matchIds,
        referees: refereeIds,
      }).unwrap();

      // tuỳ bạn, có thể dùng toast RN, ở đây giữ đơn giản:
      // console.log("Đã gán trọng tài thành công");
      onAssigned?.(); // ví dụ refetchMatches
      onClose?.();
    } catch (e) {
      // log lỗi, bạn có thể thay bằng toast/Alert tuỳ project
      console.warn(
        "Gán trọng tài thất bại",
        e?.data?.message || e?.error || e?.message
      );
    }
  };

  const disabledSubmit =
    batchingRefs || pickedRefs.length === 0 || matchIds.length === 0;

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={{ flex: 1 }} onPress={onClose} />
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                maxHeight: 460,
              },
            ]}
          >
            {/* Header */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <Text
                style={{
                  color: colors.text,
                  fontWeight: "700",
                  fontSize: 16,
                }}
              >
                Gán trọng tài cho {matchIds.length} trận
              </Text>
              <IconBtn
                name="close"
                color={colors.text}
                size={20}
                onPress={onClose}
              />
            </View>

            {/* Search input (giữ layout y chang) */}
            <View
              style={[
                styles.inputWrap,
                { borderColor: colors.border, marginBottom: 10 },
              ]}
            >
              <MaterialIcons name="search" size={18} color={t.muted} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="Tìm trọng tài (tên, nickname...)"
                placeholderTextColor={t.placeholder}
                value={search}
                onChangeText={setSearch}
              />
            </View>

            {/* Danh sách trọng tài */}
            <ScrollView
              style={{ maxHeight: 280 }}
              keyboardShouldPersistTaps="handled"
            >
              {refsIsError ? (
                <Text style={{ color: t.warnText }}>
                  {refsErr?.data?.message ||
                    "Không tải được danh sách trọng tài."}
                </Text>
              ) : refsLoading ? (
                <Text style={{ color: t.muted }}>Đang tải…</Text>
              ) : refOptions.length === 0 ? (
                <Text style={{ color: t.muted }}>
                  Chưa có trọng tài trong giải.
                </Text>
              ) : (
                refOptions.map((r) => {
                  const id = idOfRef(r);
                  const chosen = pickedRefs.some((x) => idOfRef(x) === id);
                  return (
                    <Pressable
                      key={id}
                      onPress={() => togglePick(r)}
                      style={({ pressed }) => [
                        styles.refRow,
                        { borderColor: colors.border },
                        pressed && { opacity: 0.9 },
                      ]}
                    >
                      <MaterialIcons
                        name={chosen ? "check-box" : "check-box-outline-blank"}
                        size={18}
                        color={chosen ? colors.primary : t.muted}
                        style={{ marginRight: 8 }}
                      />
                      <Text
                        style={{
                          color: colors.text,
                          fontWeight: "700",
                        }}
                      >
                        {r?.name || r?.nickname || "—"}
                      </Text>
                      {r?.nickname && r?.name ? (
                        <Text style={{ color: t.muted, marginLeft: 6 }}>
                          ({r.nickname})
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>

            {/* Footer buttons (y nguyên layout) */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-end",
                gap: 8,
                marginTop: 10,
              }}
            >
              <BtnOutline onPress={onClose}>Đóng</BtnOutline>

              <Pressable
                onPress={submitBatchAssign}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  {
                    backgroundColor: colors.primary,
                    opacity: pressed || disabledSubmit ? 0.9 : 1,
                  },
                ]}
                disabled={disabledSubmit}
              >
                <Text style={{ color: "#fff", fontWeight: "800" }}>
                  {batchingRefs ? "Đang gán..." : "Gán"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default React.memo(BatchAssignRefModal);
