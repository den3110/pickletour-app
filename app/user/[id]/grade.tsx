// app/user/[id]/grade.jsx
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Keyboard,
  TouchableWithoutFeedback,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { useCreateEvaluationMutation } from "@/slices/evaluationsApiSlice";
import { Ionicons } from "@expo/vector-icons";

const MIN_RATING = 1.6;
const MAX_RATING = 8.0;

export default function GradeUserScreen() {
  const { id, nickname, province, currentSingle, currentDouble } =
    useLocalSearchParams();
  const router = useRouter();
  const theme = useTheme();
  const isDark = theme.dark;

  // --- API Mutation ---
  const [createEvaluation, { isLoading: creating }] =
    useCreateEvaluationMutation();

  // --- State ---
  const [gradeSingles, setGradeSingles] = useState(
    currentSingle ? String(currentSingle) : ""
  );
  const [gradeDoubles, setGradeDoubles] = useState(
    currentDouble ? String(currentDouble) : ""
  );
  const [errorMsg, setErrorMsg] = useState("");

  // --- Theme Colors ---
  const colors = {
    bg: isDark ? "#121212" : "#F5F7FA",
    card: isDark ? "#1E1E1E" : "#FFFFFF",
    text: isDark ? "#FFFFFF" : "#333333",
    subText: isDark ? "#A0A0A0" : "#666666",
    inputBg: isDark ? "#2C2C2C" : "#FFFFFF",
    border: isDark ? "#333333" : "#E0E0E0",
    primary: "#0a84ff",
    danger: "#ff3b30",
  };

  const normalizeDecimalInput = (v) =>
    typeof v === "string" ? v.replace(/,/g, ".").trim() : v;

  const handleSubmit = async () => {
    Keyboard.dismiss();
    setErrorMsg("");

    const singlesStr = normalizeDecimalInput(gradeSingles);
    const doublesStr = normalizeDecimalInput(gradeDoubles);

    const singles =
      singlesStr === "" ? undefined : Number.parseFloat(singlesStr);
    const doubles =
      doublesStr === "" ? undefined : Number.parseFloat(doublesStr);

    const inRange = (v) =>
      v === undefined || (v >= MIN_RATING && v <= MAX_RATING);

    if (!inRange(singles) || !inRange(doubles)) {
      setErrorMsg(`Điểm phải trong khoảng ${MIN_RATING} - ${MAX_RATING}`);
      return;
    }

    if (!id) {
      setErrorMsg("Thiếu thông tin người được chấm.");
      return;
    }

    try {
      await createEvaluation({
        targetUser: id,
        province: province || "",
        source: "live",
        overall: { singles, doubles },
        notes: undefined,
      }).unwrap();

      Alert.alert("Thành công", "Đã gửi phiếu chấm trình thành công!", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err) {
      setErrorMsg(
        err?.data?.message || err?.error || "Không thể gửi phiếu chấm"
      );
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <Stack.Screen
          options={{
            title: "Chấm trình",
            headerStyle: { backgroundColor: colors.card },
            headerTintColor: colors.text,
            headerShadowVisible: false,
          }}
        />

        <View style={styles.content}>
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <Text style={[styles.heading, { color: colors.text }]}>
              {nickname || "Người chơi"}
            </Text>
            <Text style={[styles.subHeading, { color: colors.subText }]}>
              {province ? `Khu vực: ${province}` : "Chưa cập nhật khu vực"}
            </Text>

            <View style={styles.divider} />

            {/* Input Đơn */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.subText }]}>
                Điểm Đơn ({MIN_RATING} - {MAX_RATING})
              </Text>
              <TextInput
                value={gradeSingles}
                onChangeText={setGradeSingles}
                keyboardType="decimal-pad"
                placeholder="VD: 4.50"
                placeholderTextColor={colors.subText}
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.inputBg,
                    borderColor: colors.border,
                    color: colors.text,
                  },
                ]}
              />
            </View>

            {/* Input Đôi */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.subText }]}>
                Điểm Đôi ({MIN_RATING} - {MAX_RATING})
              </Text>
              <TextInput
                value={gradeDoubles}
                onChangeText={setGradeDoubles}
                keyboardType="decimal-pad"
                placeholder="VD: 4.30"
                placeholderTextColor={colors.subText}
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.inputBg,
                    borderColor: colors.border,
                    color: colors.text,
                  },
                ]}
              />
            </View>

            {/* Error Message */}
            {errorMsg ? (
              <View style={styles.errorContainer}>
                <Ionicons
                  name="alert-circle"
                  size={18}
                  color={colors.danger}
                  style={{ marginRight: 4 }}
                />
                <Text style={{ color: colors.danger, flex: 1 }}>{errorMsg}</Text>
              </View>
            ) : null}

            {/* Buttons */}
            <View style={styles.btnGroup}>
              <TouchableOpacity
                style={[styles.btn, styles.btnCancel]}
                onPress={() => router.back()}
              >
                <Text style={{ color: colors.subText, fontWeight: "600" }}>
                  Huỷ
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btn, styles.btnSubmit, { backgroundColor: colors.primary }]}
                onPress={handleSubmit}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={{ color: "#fff", fontWeight: "700" }}>
                    Xác nhận
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  card: {
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  heading: {
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 4,
  },
  subHeading: {
    fontSize: 14,
    marginBottom: 16,
  },
  divider: {
    height: 1,
    backgroundColor: "#eee", // Default light
    marginBottom: 20,
    opacity: 0.1,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    marginBottom: 8,
    fontWeight: "600",
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    backgroundColor: "rgba(255, 59, 48, 0.1)",
    padding: 10,
    borderRadius: 8,
  },
  btnGroup: {
    flexDirection: "row",
    marginTop: 8,
    gap: 12,
  },
  btn: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  btnCancel: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#ccc", // Just a default fallback
  },
  btnSubmit: {
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
});