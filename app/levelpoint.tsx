// app/screens/LevelPointScreen.jsx
import AuthGuard from "@/components/auth/AuthGuard";
import {
  useCreateAssessmentMutation,
  useGetLatestAssessmentQuery,
} from "@/slices/assessmentsApiSlice";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme,
} from "react-native";
import { useSelector } from "react-redux";

/* ===== DUPR helpers ===== */
// ✅ hạ sàn xuống 1.6
const DUPR_MIN = 1.6;
const DUPR_MAX = 8.0;
const clamp = (n, min, max) => Math.max(min, Math.min(max, Number(n) || 0));
const round3 = (n) => Number((Number(n) || 0).toFixed(3));
const normalizeDupr = (n) => round3(clamp(n, DUPR_MIN, DUPR_MAX));
// từ raw 0–10 → ra điểm trong dải 1.6–8.0 (dải rộng 6.4)
const duprFromRaw = (raw0to10) =>
  round3(DUPR_MIN + clamp(raw0to10, 0, 10) * ((DUPR_MAX - DUPR_MIN) / 10));

/* ===== THEME TOKENS (đồng bộ với các màn trước) ===== */
function useThemeTokens() {
  const scheme = useColorScheme() ?? "light";
  const tint = scheme === "dark" ? "#7cc0ff" : "#0a84ff";

  const textPrimary = scheme === "dark" ? "#ffffff" : "#0f172a";
  const textSecondary = scheme === "dark" ? "#cbd5e1" : "#475569";

  const canvasBg = scheme === "dark" ? "#0b0c10" : "#f7f9fc";
  const cardBg = scheme === "dark" ? "#111214" : "#ffffff";
  const border = scheme === "dark" ? "#2f3339" : "#e4e8ef";
  const softBg = scheme === "dark" ? "#1a1c22" : "#f2f4f8";

  const chipBg = scheme === "dark" ? "#1e293b" : "#eef2f7";
  const chipFg = scheme === "dark" ? "#cbd5e1" : "#263238";

  const success = scheme === "dark" ? "#22c55e" : "#16a34a";
  const danger = "#ef4444";

  const inputBg = scheme === "dark" ? "#0f1115" : "#ffffff";

  return {
    scheme,
    tint,
    textPrimary,
    textSecondary,
    canvasBg,
    cardBg,
    border,
    softBg,
    chipBg,
    chipFg,
    success,
    danger,
    inputBg,
  };
}

/* Rubric (đã hạ mốc đầu xuống 1.6 cho khớp sàn) */
const RUBRIC = [
  {
    level: 1.6,
    label: "New / Recreational",
    bullets: [
      "Mới chơi, thao tác còn chậm",
      "Giao bóng chưa ổn định",
      "Đứng vị trí còn lúng túng",
    ],
  },
  {
    level: 2.0,
    label: "Beginner",
    bullets: [
      "Giao bóng bắt đầu đều",
      "Đánh bóng dễ/giữa sân",
      "Chưa kiểm soát được tempo",
    ],
  },
  {
    level: 2.5,
    label: "Lower Intermediate",
    bullets: ["Giao & trả ổn định", "Rally ngắn", "Bắt đầu dink (lỗi)"],
  },
  {
    level: 3.0,
    label: "Intermediate",
    bullets: [
      "Giao chắc",
      "Dink có kiểm soát",
      "Bắt đầu third shot",
      "Phối hợp cơ bản",
    ],
  },
  {
    level: 4.0,
    label: "Advanced Intermediate",
    bullets: [
      "Ít lỗi unforced",
      "Third shot hiệu quả",
      "Dink ổn định",
      "Vị trí hợp lý",
    ],
  },
  {
    level: 4.5,
    label: "Advanced",
    bullets: [
      "Rất ít lỗi",
      "Dink chiến thuật",
      "Volley ổn định",
      "Đọc trận tốt",
    ],
  },
  {
    level: 5.0,
    label: "Pro (5.0+)",
    bullets: [
      "Thi đấu cao cấp",
      "Hầu như không lỗi",
      "Phối hợp cực tốt",
      "Chiến thuật linh hoạt",
    ],
  },
];

const nearestRubricLevel = (val) => {
  const n = Number(val);
  if (Number.isNaN(n)) return null;
  let best = RUBRIC[0].level,
    d = Math.abs(n - best);
  for (const r of RUBRIC) {
    const nd = Math.abs(n - r.level);
    if (nd < d) {
      d = nd;
      best = r.level;
    }
  }
  return best;
};

// chỉ cho số + 1 dấu chấm, tự chuyển , -> .
const sanitizeDecimalInput = (s) => {
  if (typeof s !== "string") s = String(s ?? "");
  let v = s.replace(",", ".").replace(/[^\d.]/g, "");
  v = v.replace(/(\..*)\./g, "$1");
  return v;
};

/* ======= Small atoms (theme-aware) ======= */
const Pill = ({ label, bg, fg }) => (
  <View style={[styles.pill, { backgroundColor: bg }]}>
    <Text style={[styles.pillText, { color: fg }]} numberOfLines={1}>
      {label}
    </Text>
  </View>
);

const Legend = React.memo(({ palette }) => (
  <View style={styles.legendRow}>
    <Pill label="Xanh lam = ĐƠN (Single)" bg={palette.tint} fg="#fff" />
    <Pill label="Xanh lục = ĐÔI (Double)" bg={palette.success} fg="#fff" />
  </View>
));

/* Viền trái cho rubric – RN: vẽ 1–2 sọc đứng ở cạnh trái */
function RubricItem({ r, activeSingle, activeDouble, palette, scheme }) {
  const anyActive = activeSingle || activeDouble;
  const activeBg =
    scheme === "dark" ? "rgba(124,192,255,0.12)" : "rgba(10,132,255,0.10)";
  return (
    <View
      style={[
        styles.rubricItem,
        {
          backgroundColor: anyActive ? activeBg : "transparent",
          borderColor: palette.border,
        },
      ]}
    >
      {activeSingle && (
        <View
          style={[styles.stripe, { left: 0, backgroundColor: palette.tint }]}
        />
      )}
      {activeDouble && (
        <View
          style={[
            styles.stripe,
            { left: activeSingle ? 4 : 0, backgroundColor: palette.success },
          ]}
        />
      )}
      <Text style={[styles.rubricTitle, { color: palette.textPrimary }]}>
        Mức {r.level} ({r.label})
      </Text>
      <Text style={[styles.rubricBullets, { color: palette.textSecondary }]}>
        {"• " + r.bullets.join("\n• ")}
      </Text>
    </View>
  );
}

/* InputCard tách riêng + memo để không remount → giữ focus */
const InputCard = React.memo(function InputCard({
  label,
  value,
  setValue,
  color, // "primary" | "success"
  didPrefillRef,
  initializing,
  palette,
}) {
  const borderColor = color === "primary" ? palette.tint : palette.success;
  const hint =
    color === "primary"
      ? "Viền xanh lam = ĐƠN (Single)"
      : "Viền xanh lục = ĐÔI (Double)";

  const valid =
    value === ""
      ? true
      : (() => {
          const n = parseFloat(value);
          return !Number.isNaN(n) && n >= DUPR_MIN && n <= DUPR_MAX;
        })();

  return (
    <View
      style={[
        styles.inputCard,
        { borderColor, backgroundColor: palette.softBg },
      ]}
    >
      <Text style={[styles.inputLabel, { color: palette.textPrimary }]}>
        {label}
      </Text>
      <TextInput
        style={[
          styles.textInput,
          {
            borderColor: valid ? palette.border : palette.danger,
            backgroundColor: palette.inputBg,
            color: palette.textPrimary,
          },
        ]}
        placeholderTextColor={palette.textSecondary}
        keyboardType="decimal-pad"
        value={value}
        onChangeText={(t) => {
          if (!didPrefillRef.current) didPrefillRef.current = true;
          setValue(sanitizeDecimalInput(t));
        }}
        onBlur={() => {
          if (value === "") return;
          const n = parseFloat(value);
          if (Number.isNaN(n)) return;
          setValue(String(normalizeDupr(n)));
        }}
        placeholder={initializing ? "" : "vd. 3.25"}
        returnKeyType="done"
        blurOnSubmit
      />
      <Text style={[styles.helperText, { color: palette.textSecondary }]}>
        {valid
          ? `Dải hợp lệ ${DUPR_MIN.toFixed(3)}–${DUPR_MAX.toFixed(3)}`
          : `Nhập ${DUPR_MIN.toFixed(3)}–${DUPR_MAX.toFixed(3)}`}
      </Text>
      <Text style={[styles.captionText, { color: palette.textSecondary }]}>
        {hint}
      </Text>
    </View>
  );
});

/* ======= Component chính ======= */
export default function LevelPointScreen({ userId: userIdProp }) {
  const T = useThemeTokens();

  const authedId = useSelector((s) => s?.auth?.userInfo?._id);
  const userId = userIdProp || authedId;

  // Giữ string để nhập mượt, không tự blur
  const [singleInput, setSingleInput] = useState("");
  const [doubleInput, setDoubleInput] = useState("");

  // Chặn auto-fill ghi đè khi user đã gõ
  const didPrefillRef = useRef(false);

  const [createAssessment, { isLoading: saving }] =
    useCreateAssessmentMutation();
  const {
    data: latest,
    isLoading: loadingLatest,
    isFetching: fetchingLatest,
    error: latestError,
  } = useGetLatestAssessmentQuery(userId);

  const initializing = loadingLatest || fetchingLatest;

  // Prefill CHỈ 1 LẦN, CHỈ KHI CHƯA GÕ
  useEffect(() => {
    if (!latest || didPrefillRef.current) return;
    const bothEmpty = singleInput === "" && doubleInput === "";
    if (!bothEmpty) return;

    // nếu BE đã lưu đúng thang DUPR thì normalize và set thẳng
    if (
      typeof latest?.singleLevel === "number" &&
      typeof latest?.doubleLevel === "number"
    ) {
      setSingleInput(String(normalizeDupr(latest.singleLevel)));
      setDoubleInput(String(normalizeDupr(latest.doubleLevel)));
      didPrefillRef.current = true;
      return;
    }
    // nếu BE vẫn trả kiểu 0–10 thì map sang dải 1.6–8.0
    if (
      typeof latest?.singleScore === "number" &&
      typeof latest?.doubleScore === "number"
    ) {
      setSingleInput(String(duprFromRaw(latest.singleScore)));
      setDoubleInput(String(duprFromRaw(latest.doubleScore)));
      didPrefillRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest]);

  // Parse khi cần
  const parseOrNull = (s) => (s === "" ? null : normalizeDupr(parseFloat(s)));
  const singleVal = useMemo(() => parseOrNull(singleInput), [singleInput]);
  const doubleVal = useMemo(() => parseOrNull(doubleInput), [doubleInput]);

  const singleValid =
    singleVal != null &&
    !Number.isNaN(singleVal) &&
    singleVal >= DUPR_MIN &&
    singleVal <= DUPR_MAX;
  const doubleValid =
    doubleVal != null &&
    !Number.isNaN(doubleVal) &&
    doubleVal >= DUPR_MIN &&
    doubleVal <= DUPR_MAX;

  const nearestSingle = singleValid ? nearestRubricLevel(singleVal) : null;
  const nearestDouble = doubleValid ? nearestRubricLevel(doubleVal) : null;

  const latestChipText = (() => {
    if (!userId) return null;
    if (initializing) return "Đang tải lần chấm gần nhất…";
    if (latestError) return "Không tải được lần chấm gần nhất";
    if (latest?._id) {
      const when = latest?.scoredAt
        ? " • " + new Date(latest.scoredAt).toLocaleDateString()
        : "";
      return `Đã tự điền từ lần gần nhất${when}`;
    }
    return null;
  })();

  const handleSubmit = async () => {
    if (!userId) {
      Alert.alert("Lỗi", "Thiếu userId.");
      return;
    }
    if (!singleValid || !doubleValid) {
      Alert.alert(
        "Thiếu/không hợp lệ",
        `Vui lòng nhập Đơn & Đôi trong dải ${DUPR_MIN.toFixed(
          3
        )}–${DUPR_MAX.toFixed(3)}.`
      );
      return;
    }
    try {
      await createAssessment({
        userId,
        singleLevel: singleVal,
        doubleLevel: doubleVal,
        note: "self-eval (2 fields)",
      }).unwrap();
      Alert.alert("Thành công", "Đã lưu đánh giá & cập nhật ranking!");
    } catch (err) {
      const msg =
        err?.data?.message ||
        err?.error ||
        "Lỗi không xác định khi lưu đánh giá.";
      Alert.alert("Lỗi", String(msg));
    }
  };

  const isWide = Dimensions.get("window").width >= 640;

  const disabledBg = T.scheme === "dark" ? "#334155" : "#9aa0a6";

  return (
    <AuthGuard>
      <View style={{ flex: 1, backgroundColor: T.canvasBg }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Header */}
            <View style={styles.headerRow}>
              <Text style={[styles.title, { color: T.textPrimary }]}>
                Bảng tự đánh giá trình Pickleball
              </Text>
              {!!latestChipText && (
                <Pill
                  label={latestChipText}
                  bg={latestError ? "#fee2e2" : T.chipBg}
                  fg={latestError ? "#991b1b" : T.chipFg}
                />
              )}
            </View>

            {/* (tuỳ chọn) Legend */}
            {/* <Legend palette={{ tint: T.tint, success: T.success }} /> */}

            {/* Inputs */}
            <View
              style={[
                styles.card,
                {
                  padding: 12,
                  borderColor: T.border,
                  backgroundColor: T.cardBg,
                },
              ]}
            >
              <View
                style={[
                  styles.inputRow,
                  { flexDirection: isWide ? "row" : "column" },
                ]}
              >
                <InputCard
                  label="Trình ĐƠN (Single)"
                  value={singleInput}
                  setValue={setSingleInput}
                  color="primary"
                  didPrefillRef={didPrefillRef}
                  initializing={initializing}
                  palette={{
                    tint: T.tint,
                    success: T.success,
                    border: T.border,
                    danger: T.danger,
                    softBg: T.softBg,
                    inputBg: T.inputBg,
                    textPrimary: T.textPrimary,
                    textSecondary: T.textSecondary,
                  }}
                />
                <InputCard
                  label="Trình ĐÔI (Double)"
                  value={doubleInput}
                  setValue={setDoubleInput}
                  color="success"
                  didPrefillRef={didPrefillRef}
                  initializing={initializing}
                  palette={{
                    tint: T.tint,
                    success: T.success,
                    border: T.border,
                    danger: T.danger,
                    softBg: T.softBg,
                    inputBg: T.inputBg,
                    textPrimary: T.textPrimary,
                    textSecondary: T.textSecondary,
                  }}
                />
              </View>

              {/* Chips & Actions */}
              <View
                style={[
                  styles.actionsRow,
                  { flexDirection: isWide ? "row" : "column" },
                ]}
              >
                <View
                  style={[styles.inlineRow, { marginBottom: isWide ? 0 : 8 }]}
                >
                  {singleValid && (
                    <Pill
                      label={`Đơn: ${singleVal?.toFixed(3)}`}
                      bg={T.scheme === "dark" ? "#1e3a8a33" : "#dbeafe"}
                      fg={T.scheme === "dark" ? "#bfdbfe" : "#1e3a8a"}
                    />
                  )}
                  {doubleValid && (
                    <Pill
                      label={`Đôi: ${doubleVal?.toFixed(3)}`}
                      bg={T.scheme === "dark" ? "#052e1633" : "#dcfce7"}
                      fg={T.scheme === "dark" ? "#86efac" : "#166534"}
                    />
                  )}
                </View>

                <View style={[styles.inlineRow]}>
                  <TouchableOpacity
                    onPress={handleSubmit}
                    disabled={saving || !userId}
                    style={[
                      styles.primaryBtn,
                      { backgroundColor: T.tint },
                      (saving || !userId) && { backgroundColor: disabledBg },
                    ]}
                    activeOpacity={0.9}
                  >
                    {saving ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.primaryBtnText}>Cập nhật</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => {
                      setSingleInput("");
                      setDoubleInput("");
                      didPrefillRef.current = false;
                    }}
                    style={[styles.secondaryBtn, { borderColor: T.tint }]}
                    activeOpacity={0.9}
                  >
                    <Text style={[styles.secondaryBtnText, { color: T.tint }]}>
                      Đặt lại
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={[styles.captionText, { color: T.textSecondary }]}>
                Màu sắc: <Text style={{ fontWeight: "700" }}>xanh lam</Text> =
                ĐƠN (Single),{" "}
                <Text style={{ fontWeight: "700" }}>xanh lục</Text> = ĐÔI
                (Double). Nhập số trong dải {DUPR_MIN.toFixed(3)}–
                {DUPR_MAX.toFixed(3)}.
              </Text>
            </View>

            {/* Rubric */}
            <View
              style={[
                styles.card,
                { borderColor: T.border, backgroundColor: T.cardBg },
              ]}
            >
              <Text style={[styles.sectionTitle, { color: T.textPrimary }]}>
                📝 Bảng tự đánh giá trình độ Pickleball (tham khảo DUPR)
              </Text>
              <View style={{ gap: 10 }}>
                {RUBRIC.map((r) => (
                  <RubricItem
                    key={r.level}
                    r={r}
                    activeSingle={nearestSingle === r.level}
                    activeDouble={nearestDouble === r.level}
                    palette={{
                      tint: T.tint,
                      success: T.success,
                      border: T.border,
                      textPrimary: T.textPrimary,
                      textSecondary: T.textSecondary,
                    }}
                    scheme={T.scheme}
                  />
                ))}
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </AuthGuard>
  );
}

/* ======= styles ======= */
const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    rowGap: 8,
    marginBottom: 12,
  },
  title: { fontSize: 20, fontWeight: "700" },

  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },

  inputRow: { gap: 12 },

  inputCard: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 12,
    padding: 12,
    minWidth: 0,
  },
  inputLabel: {
    fontWeight: "700",
    marginBottom: 8,
  },
  textInput: {
    height: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  helperText: {
    marginTop: 6,
    fontSize: 12,
  },
  captionText: { marginTop: 6, fontSize: 12 },

  inlineRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },

  actionsRow: {
    marginTop: 12,
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },

  primaryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    minWidth: 120,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "700" },

  secondaryBtn: {
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  secondaryBtnText: { fontWeight: "700" },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
  },

  // Legend / Pill
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: "flex-start",
  },
  pillText: { fontSize: 12, fontWeight: "600" },

  // Rubric
  rubricItem: {
    position: "relative",
    padding: 12,
    borderWidth: 1,
    borderRadius: 12,
    paddingLeft: 14, // chừa chỗ cho stripe
  },
  stripe: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
  },
  rubricTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  rubricBullets: { lineHeight: 20 },
});
