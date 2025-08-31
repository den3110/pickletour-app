// app/screens/LevelPointScreen.jsx
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
} from "react-native";
import { useSelector } from "react-redux";

/* ===== DUPR helpers ===== */
const DUPR_MIN = 2.0;
const DUPR_MAX = 8.0;
const clamp = (n, min, max) => Math.max(min, Math.min(max, Number(n) || 0));
const round3 = (n) => Number((Number(n) || 0).toFixed(3));
const normalizeDupr = (n) => round3(clamp(n, DUPR_MIN, DUPR_MAX));
const duprFromRaw = (raw0to10) =>
  round3(DUPR_MIN + clamp(raw0to10, 0, 10) * (6 / 10));

/* Rubric (rút gọn text cho ngắn) */
const RUBRIC = [
  {
    level: 2.0,
    label: "Beginner",
    bullets: [
      "Giao bóng chưa ổn định",
      "Chỉ đánh bóng dễ",
      "Chưa kiểm soát vị trí",
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

const COLORS = {
  pageBg: "#f7f9fc",
  cardBg: "#fff",
  border: "#e4e8ef",
  text: "#111",
  subtext: "#555",
  primary: "#1976d2", // Đơn
  success: "#2e7d32", // Đôi
  danger: "#ef4444",
  chipBg: "#eef2f7",
  chipFg: "#263238",
};

/* ======= Small atoms ======= */
const Pill = ({ label, bg = COLORS.chipBg, fg = COLORS.chipFg }) => (
  <View style={[styles.pill, { backgroundColor: bg }]}>
    <Text style={[styles.pillText, { color: fg }]} numberOfLines={1}>
      {label}
    </Text>
  </View>
);

const Legend = React.memo(() => (
  <View style={styles.legendRow}>
    <Pill label="Xanh lam = ĐƠN (Single)" bg={COLORS.primary} fg="#fff" />
    <Pill label="Xanh lục = ĐÔI (Double)" bg={COLORS.success} fg="#fff" />
  </View>
));

/* Viền trái cho rubric – RN: vẽ 1–2 sọc đứng ở cạnh trái */
function RubricItem({ r, activeSingle, activeDouble }) {
  const anyActive = activeSingle || activeDouble;
  return (
    <View
      style={[
        styles.rubricItem,
        {
          backgroundColor: anyActive ? "rgba(25,118,210,0.06)" : "transparent",
          borderColor: COLORS.border,
        },
      ]}
    >
      {/* stripes */}
      {activeSingle && (
        <View
          style={[styles.stripe, { left: 0, backgroundColor: COLORS.primary }]}
        />
      )}
      {activeDouble && (
        <View
          style={[
            styles.stripe,
            { left: activeSingle ? 4 : 0, backgroundColor: COLORS.success },
          ]}
        />
      )}
      <Text style={styles.rubricTitle}>
        Mức {r.level} ({r.label})
      </Text>
      <Text style={styles.rubricBullets}>{"• " + r.bullets.join("\n• ")}</Text>
    </View>
  );
}

/* InputCard tách riêng + memo để không remount → giữ focus */
const InputCard = React.memo(function InputCard({
  label,
  value,
  setValue,
  color,
  didPrefillRef,
  initializing,
}) {
  const borderColor = color === "primary" ? COLORS.primary : COLORS.success;
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
        { borderColor, backgroundColor: "rgba(0,0,0,0.01)" },
      ]}
    >
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        style={[
          styles.textInput,
          { borderColor: valid ? COLORS.border : COLORS.danger },
        ]}
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
      <Text style={styles.helperText}>
        {valid
          ? `Dải hợp lệ ${DUPR_MIN.toFixed(3)}–${DUPR_MAX.toFixed(3)}`
          : `Nhập ${DUPR_MIN.toFixed(3)}–${DUPR_MAX.toFixed(3)}`}
      </Text>
      <Text style={styles.captionText}>{hint}</Text>
    </View>
  );
});

/* ======= Component chính ======= */
export default function LevelPointScreen({ userId: userIdProp }) {
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

    if (
      typeof latest?.singleLevel === "number" &&
      typeof latest?.doubleLevel === "number"
    ) {
      setSingleInput(String(normalizeDupr(latest.singleLevel)));
      setDoubleInput(String(normalizeDupr(latest.doubleLevel)));
      didPrefillRef.current = true;
      return;
    }
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
        "Vui lòng nhập Đơn & Đôi trong dải 2.000–8.000."
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

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.pageBg }}>
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
            <Text style={styles.title}>Bảng tự đánh giá trình Pickleball</Text>
            {!!latestChipText && (
              <Pill
                label={latestChipText}
                bg={latestError ? "#fee2e2" : "#e0f2fe"}
                fg={latestError ? "#991b1b" : "#075985"}
              />
            )}
          </View>

          {/* Inputs */}
          <View
            style={[styles.card, { padding: 12, borderColor: COLORS.border }]}
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
              />
              <InputCard
                label="Trình ĐÔI (Double)"
                value={doubleInput}
                setValue={setDoubleInput}
                color="success"
                didPrefillRef={didPrefillRef}
                initializing={initializing}
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
                  <Pill label={`Đơn: ${singleVal}`} bg="#dbeafe" fg="#1e3a8a" />
                )}
                {doubleValid && (
                  <Pill label={`Đôi: ${doubleVal}`} bg="#dcfce7" fg="#166534" />
                )}
              </View>

              <View style={[styles.inlineRow]}>
                <TouchableOpacity
                  onPress={handleSubmit}
                  disabled={saving || !userId}
                  style={[
                    styles.primaryBtn,
                    (saving || !userId) && { backgroundColor: "#9aa0a6" },
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
                  }}
                  style={[styles.secondaryBtn]}
                  activeOpacity={0.9}
                >
                  <Text style={styles.secondaryBtnText}>Đặt lại</Text>
                </TouchableOpacity>
              </View>
            </View>

            <Text style={styles.captionText}>
              Màu sắc: <Text style={{ fontWeight: "700" }}>xanh lam</Text> = ĐƠN
              (Single), <Text style={{ fontWeight: "700" }}>xanh lục</Text> =
              ĐÔI (Double). Nhập số trong dải {DUPR_MIN.toFixed(3)}–
              {DUPR_MAX.toFixed(3)}.
            </Text>
          </View>

          {/* Rubric */}
          <View style={[styles.card, { borderColor: COLORS.border }]}>
            <Text style={styles.sectionTitle}>
              📝 Bảng tự đánh giá trình độ Pickleball (tham khảo DUPR)
            </Text>
            <View style={{ gap: 10 }}>
              {RUBRIC.map((r) => (
                <RubricItem
                  key={r.level}
                  r={r}
                  activeSingle={nearestSingle === r.level}
                  activeDouble={nearestDouble === r.level}
                />
              ))}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
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
  title: { fontSize: 20, fontWeight: "700", color: COLORS.text },

  card: {
    backgroundColor: COLORS.cardBg,
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
    color: COLORS.text,
  },
  textInput: {
    height: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
    fontSize: 16,
  },
  helperText: {
    color: "#666",
    marginTop: 6,
    fontSize: 12,
  },
  captionText: { color: "#777", marginTop: 6, fontSize: 12 },

  inlineRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },

  actionsRow: {
    marginTop: 12,
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },

  primaryBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    minWidth: 120,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "700" },

  secondaryBtn: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  secondaryBtnText: { color: COLORS.primary, fontWeight: "700" },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.text,
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
    color: COLORS.text,
    marginBottom: 4,
  },
  rubricBullets: { color: COLORS.subtext, lineHeight: 20 },
});
