// app/screens/PickleBall/match/MatchSettingsModal.jsx
import React, { useEffect, useState, useMemo, useRef } from "react";
import {
  Modal,
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Switch,
  RefreshControl,
  Alert, // Thêm Alert để báo lỗi/thành công nếu cần
  ActivityIndicator, // Thêm loading indicator
} from "react-native";
import Ripple from "react-native-material-ripple";
import { MaterialIcons } from "@expo/vector-icons";
import { useTheme } from "@react-navigation/native";
import { useColorScheme } from "react-native";
// ✅ 1. Import thêm useUpdateMatchMutation
import { 
  useGetMatchQuery, 
  useUpdateMatchMutation 
} from "@/slices/tournamentsApiSlice";

/* ---------- Theme tokens (nhẹ hơn bản full) ---------- */
function useTokens() {
  const navTheme = useTheme?.() || {};
  const scheme = useColorScheme?.() || "light";
  const dark =
    typeof navTheme.dark === "boolean" ? navTheme.dark : scheme === "dark";

  const primary = navTheme?.colors?.primary ?? (dark ? "#7cc0ff" : "#0a84ff");
  const text = navTheme?.colors?.text ?? (dark ? "#f7f7f7" : "#111827");
  const card = navTheme?.colors?.card ?? (dark ? "#16181c" : "#ffffff");
  const border = navTheme?.colors?.border ?? (dark ? "#2e2f33" : "#e4e8ef");
  const background =
    navTheme?.colors?.background ?? (dark ? "#0b0d10" : "#f5f7fb");

  return {
    dark,
    colors: { primary, text, card, border, background },
    subtext: dark ? "#9ca3af" : "#6b7280",
  };
}

const clampInt = (val, min, max) => {
  const n = parseInt(String(val || "").replace(/[^\d]/g, ""), 10);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
};

function NumberField({
  label,
  helper,
  value,
  onChange,
  min = 0,
  max = 99,
  step = 1,
}) {
  const t = useTokens();

  const handleChangeText = (txt) => {
    if (!onChange) return;
    const n = clampInt(txt, min, max);
    onChange(n);
  };

  const dec = () => {
    if (!onChange) return;
    onChange(clampInt((value || 0) - step, min, max));
  };

  const inc = () => {
    if (!onChange) return;
    onChange(clampInt((value || 0) + step, min, max));
  };

  return (
    <View style={styles.fieldRow}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={[styles.label, { color: t.colors.text }]}>{label}</Text>
        {helper ? (
          <Text style={[styles.helper, { color: t.subtext }]}>{helper}</Text>
        ) : null}
      </View>

      <View style={styles.numberControl}>
        <Ripple
          onPress={dec}
          rippleContainerBorderRadius={999}
          style={[
            styles.iconCircle,
            { borderColor: t.colors.border, backgroundColor: t.colors.card },
          ]}
        >
          <MaterialIcons name="remove" size={18} color={t.colors.text} />
        </Ripple>

        <TextInput
          style={[
            styles.input,
            {
              borderColor: t.colors.border,
              color: t.colors.text,
              backgroundColor: t.colors.card,
            },
          ]}
          keyboardType="number-pad"
          value={String(value ?? "")}
          onChangeText={handleChangeText}
        />

        <Ripple
          onPress={inc}
          rippleContainerBorderRadius={999}
          style={[
            styles.iconCircle,
            { borderColor: t.colors.border, backgroundColor: t.colors.card },
          ]}
        >
          <MaterialIcons name="add" size={18} color={t.colors.text} />
        </Ripple>
      </View>
    </View>
  );
}

export default function MatchSettingsModal({
  visible,
  onClose,
  matchId,
  onSave,
}) {
  const t = useTokens();

  // ✅ Lấy match trực tiếp theo matchId
  const {
    data: match,
    isFetching,
    refetch,
  } = useGetMatchQuery(matchId, {
    skip: !visible || !matchId,
  });

  // ✅ 2. Khởi tạo Mutation Hook
  const [updateMatch, { isLoading: isUpdating }] = useUpdateMatchMutation();

  const rules = match?.rules || {};

  // Chuẩn hoá initial values dựa vào model:
  const iv = useMemo(
    () => ({
      bestOf: rules.bestOf ?? 1,
      pointsToWin: rules.pointsToWin ?? 11,
      winByTwo: rules.winByTwo !== false,
      capMode: rules.cap?.mode ?? "none",
      capPoints: rules.cap?.points ?? null,
      timeoutPerGame: match?.timeoutPerGame ?? 2,
      timeoutMinutes: match?.timeoutMinutes ?? 1,
      medicalTimeouts: match?.medicalTimeouts ?? 1,
    }),
    [
      rules.bestOf,
      rules.pointsToWin,
      rules.winByTwo,
      rules.cap?.mode,
      rules.cap?.points,
      match?.timeoutPerGame,
      match?.timeoutMinutes,
      match?.medicalTimeouts,
    ]
  );

  const [bestOf, setBestOf] = useState(1);
  const [pointsToWin, setPointsToWin] = useState(11);
  const [winByTwo, setWinByTwo] = useState(true);
  const [pointsCap, setPointsCap] = useState(13);
  const [timeoutPerGame, setTimeoutPerGame] = useState(2);
  const [timeoutMinutes, setTimeoutMinutes] = useState(1);
  const [medicalTimeouts, setMedicalTimeouts] = useState(1);

  const openedRef = useRef(false);

  useEffect(() => {
    if (!visible || !matchId) return;
    if (openedRef.current) {
      refetch();
    } else {
      openedRef.current = true;
    }
  }, [visible, matchId, refetch]);

  useEffect(() => {
    if (!visible) return;

    const p = clampInt(iv.pointsToWin ?? 11, 1, 99);
    let capRaw;
    if (iv.capPoints != null && iv.capPoints !== "") {
      capRaw = clampInt(iv.capPoints, 1, 99);
    } else {
      capRaw = clampInt(p + 2, 1, 99);
    }

    setBestOf(clampInt(iv.bestOf ?? 1, 1, 9));
    setPointsToWin(p);
    setWinByTwo(iv.winByTwo !== false);
    setPointsCap(capRaw);
    setTimeoutPerGame(clampInt(iv.timeoutPerGame ?? 2, 0, 10));
    setTimeoutMinutes(clampInt(iv.timeoutMinutes ?? 1, 0, 30));
    setMedicalTimeouts(clampInt(iv.medicalTimeouts ?? 1, 0, 10));
  }, [visible, iv]);

  const handleClose = () => {
    // Không cho đóng khi đang lưu để tránh lỗi state
    if (isUpdating) return; 
    onClose && onClose();
  };

  // ✅ 3. Xử lý lưu (Update Match)
  const handleSave = async () => {
    const safeCap =
      pointsCap != null && Number.isFinite(pointsCap) && pointsCap > 0
        ? clampInt(pointsCap, 1, 99)
        : null;

    const payload = {
      bestOf,
      pointsToWin,
      winByTwo,
      cap: {
        mode: safeCap ? "hard" : "none",
        points: safeCap,
      },
      timeoutPerGame,
      timeoutMinutes,
      medicalTimeouts,
    };

    try {
      // Gọi API update (giả sử API nhận object { id, ...data } hoặc { id, body })
      // Bạn cần kiểm tra lại arguments của mutation trong slice nhé.
      // Dưới đây là cách phổ biến: truyền matchId và body.
      await updateMatch({ matchId, ...payload }).unwrap();

      // Nếu có callback onSave (để refresh list ở ngoài hoặc hiện toast)
      if (onSave) onSave(payload);

      // Đóng modal sau khi lưu thành công
      handleClose();
      
    } catch (error) {
      console.error("Failed to update match settings:", error);
      Alert.alert("Lỗi", "Không thể cập nhật cấu hình trận đấu. Vui lòng thử lại.");
    }
  };

  const handleRefresh = () => {
    if (!matchId) return;
    refetch();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
      supportedOrientations={[
        "portrait",
        "landscape-left",
        "landscape-right",
        "landscape",
      ]}
    >
      <SafeAreaView
        style={[styles.wrap, { backgroundColor: t.colors.background }]}
      >
        {/* HEADER */}
        <View
          style={[
            styles.header,
            {
              borderBottomColor: t.colors.border,
              backgroundColor: t.colors.card,
            },
          ]}
        >
          <View style={styles.headerLeft}>
            <Ripple
              onPress={handleClose}
              rippleContainerBorderRadius={999}
              disabled={isUpdating} // Disable nút đóng khi đang lưu
              style={[
                styles.headerIconBtn,
                { backgroundColor: t.colors.background },
                { opacity: isUpdating ? 0.5 : 1 }
              ]}
            >
              <MaterialIcons name="close" size={20} color={t.colors.text} />
            </Ripple>
            <Text style={[styles.title, { color: t.colors.text }]}>
              Cấu hình trận
            </Text>
          </View>

          {/* ✅ 4. UI Nút Lưu có trạng thái Loading */}
          <Ripple
            onPress={handleSave}
            disabled={isUpdating}
            rippleContainerBorderRadius={999}
            style={[
              styles.saveBtn, 
              { backgroundColor: t.colors.primary },
              { opacity: isUpdating ? 0.7 : 1 }
            ]}
          >
            {isUpdating ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.saveBtnText}>Đang lưu...</Text>
              </View>
            ) : (
              <Text style={styles.saveBtnText}>Lưu</Text>
            )}
          </Ripple>
        </View>

        {/* BODY */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.bodyContent}
          refreshControl={
            <RefreshControl
              refreshing={!!isFetching}
              onRefresh={handleRefresh}
              tintColor={t.colors.primary}
            />
          }
        >
          {/* ... (Phần nội dung input giữ nguyên như cũ) ... */}
          <Text style={[styles.sectionTitle, { color: t.subtext }]}>
            Luật trận đấu
          </Text>

          <NumberField
            label="Số set thi đấu (BO)"
            helper="Ví dụ: 3 set (BO3), 5 set (BO5)"
            value={bestOf}
            min={1}
            max={9}
            step={2}
            onChange={setBestOf}
          />

          <NumberField
            label="Điểm thắng mỗi set"
            helper="Điểm để thắng một game/set"
            value={pointsToWin}
            min={1}
            max={99}
            onChange={(v) => {
              setPointsToWin(v);
              if (iv.capPoints == null || iv.capPoints === "") {
                const fallbackCap = clampInt((v || 0) + 2, 1, 99);
                setPointsCap(fallbackCap);
              }
            }}
          />

          <View style={styles.fieldRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.label, { color: t.colors.text }]}>
                Cách 2
              </Text>
              <Text style={[styles.helper, { color: t.subtext }]}>
                Thắng cách biệt 2 điểm (win by two)
              </Text>
            </View>
            <Switch
              value={winByTwo}
              onValueChange={setWinByTwo}
              trackColor={{
                false: t.colors.border,
                true: t.colors.primary,
              }}
              thumbColor="#fff"
            />
          </View>

          <NumberField
            label="Điểm chạm (CAP điểm)"
            helper="Giới hạn điểm tối đa: nếu trận kéo dài, đội nào chạm CAP trước thì thắng"
            value={pointsCap}
            min={1}
            max={99}
            onChange={setPointsCap}
          />

          <Text
            style={[styles.sectionTitle, { color: t.subtext, marginTop: 16 }]}
          >
            Timeout & nghỉ y tế
          </Text>

          <NumberField
            label="Số lần timeout"
            helper="Timeout mỗi đội trong một game"
            value={timeoutPerGame}
            min={0}
            max={10}
            onChange={setTimeoutPerGame}
          />

          <NumberField
            label="Số phút mỗi timeout"
            helper="Thời lượng cho một lần timeout"
            value={timeoutMinutes}
            min={0}
            max={30}
            onChange={setTimeoutMinutes}
          />

          <NumberField
            label="Số lần nghỉ y tế"
            helper="Tổng số lần nghỉ y tế cho một trận"
            value={medicalTimeouts}
            min={0}
            max={10}
            onChange={setMedicalTimeouts}
          />

          <View style={{ height: 24 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // ... (Giữ nguyên styles cũ)
  wrap: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
  },
  saveBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
  },
  saveBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  bodyContent: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },
  label: {
    fontSize: 15,
    fontWeight: "700",
  },
  helper: {
    fontSize: 12,
    marginTop: 2,
  },
  numberControl: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  iconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    minWidth: 52,
    textAlign: "center",
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 6,
    fontSize: 15,
    fontWeight: "700",
  },
});