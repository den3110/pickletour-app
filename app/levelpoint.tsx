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
  Animated,
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

/* ===== DUPR LOGIC ===== */
const DUPR_MIN = 1.6;
const DUPR_MAX = 8.0;

const toDotDecimal = (s = "") => String(s).replace(",", ".");

const parseDecimal = (s = "") => {
  const n = Number(toDotDecimal(String(s).trim()));
  return Number.isFinite(n) ? n : NaN;
};

const sanitizeDuprTextInput = (next = "") => {
  let s = toDotDecimal(next);

  // chỉ cho digits + dấu .
  s = s.replace(/[^\d.]/g, "");

  // giữ 1 dấu . duy nhất
  const firstDot = s.indexOf(".");
  if (firstDot !== -1) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
  }

  // tối đa 3 chữ số thập phân (vì bạn đang round3)
  const parts = s.split(".");
  if (parts.length === 2) {
    s = parts[0] + "." + parts[1].slice(0, 3);
  }

  return s;
};

const clamp = (n, min, max) => Math.max(min, Math.min(max, Number(n) || 0));
const round3 = (n) => Number((Number(n) || 0).toFixed(3));
const normalizeDupr = (n) => round3(clamp(n, DUPR_MIN, DUPR_MAX));
const duprFromRaw = (raw0to10) =>
  round3(DUPR_MIN + clamp(raw0to10, 0, 10) * ((DUPR_MAX - DUPR_MIN) / 10));

/* ===== THEME TOKENS ===== */
function useThemeTokens() {
  const scheme = useColorScheme() ?? "light";
  const isDark = scheme === "dark";

  return {
    isDark,
    bg: isDark ? "#0f172a" : "#f8fafc",
    card: isDark ? "#1e293b" : "#ffffff",
    text: isDark ? "#f1f5f9" : "#0f172a",
    subText: isDark ? "#94a3b8" : "#64748b",
    border: isDark ? "#334155" : "#e2e8f0",
    primary: "#3b82f6",
    primaryLight: isDark ? "rgba(59, 130, 246, 0.2)" : "#eff6ff",
    success: "#10b981",
    successLight: isDark ? "rgba(16, 185, 129, 0.2)" : "#ecfdf5",
    chipBg: isDark ? "#334155" : "#e2e8f0",
    skeleton: isDark ? "#334155" : "#cbd5e1", // Màu cho skeleton
  };
}

/* ===== SKELETON COMPONENTS ===== */
const SkeletonBlock = ({ style, theme }) => {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      style={[
        { backgroundColor: theme.skeleton, opacity, borderRadius: 8 },
        style,
      ]}
    />
  );
};

const LevelPointSkeleton = ({ theme }) => {
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={{ padding: 20 }}>
        {/* Header Skeleton */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            marginBottom: 30,
          }}
        >
          <View>
            <SkeletonBlock
              theme={theme}
              style={{ width: 150, height: 32, marginBottom: 8 }}
            />
            <SkeletonBlock theme={theme} style={{ width: 220, height: 16 }} />
          </View>
          <SkeletonBlock
            theme={theme}
            style={{ width: 100, height: 28, borderRadius: 20 }}
          />
        </View>

        {/* Inputs Skeleton */}
        <View style={styles.statsGrid}>
          <View
            style={[
              styles.statCard,
              {
                backgroundColor: theme.card,
                borderColor: theme.border,
                height: 160,
                alignItems: "center",
                justifyContent: "center",
              },
            ]}
          >
            <SkeletonBlock
              theme={theme}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                marginBottom: 10,
              }}
            />
            <SkeletonBlock
              theme={theme}
              style={{ width: 80, height: 14, marginBottom: 10 }}
            />
            <SkeletonBlock theme={theme} style={{ width: 60, height: 30 }} />
          </View>
          <View
            style={[
              styles.statCard,
              {
                backgroundColor: theme.card,
                borderColor: theme.border,
                height: 160,
                alignItems: "center",
                justifyContent: "center",
              },
            ]}
          >
            <SkeletonBlock
              theme={theme}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                marginBottom: 10,
              }}
            />
            <SkeletonBlock
              theme={theme}
              style={{ width: 80, height: 14, marginBottom: 10 }}
            />
            <SkeletonBlock theme={theme} style={{ width: 60, height: 30 }} />
          </View>
        </View>

        {/* Buttons Skeleton */}
        <View style={styles.btnRow}>
          <SkeletonBlock
            theme={theme}
            style={{ width: 80, height: 50, borderRadius: 14 }}
          />
          <SkeletonBlock
            theme={theme}
            style={{ flex: 1, height: 50, borderRadius: 14 }}
          />
        </View>

        {/* Rubric Skeleton */}
        <View style={{ marginTop: 30 }}>
          <SkeletonBlock
            theme={theme}
            style={{ width: 180, height: 16, marginBottom: 12 }}
          />
          <View
            style={{
              borderRadius: 16,
              overflow: "hidden",
              backgroundColor: theme.card,
            }}
          >
            {[1, 2, 3, 4, 5].map((i) => (
              <View
                key={i}
                style={{
                  flexDirection: "row",
                  padding: 12,
                  marginBottom: 2,
                  alignItems: "center",
                }}
              >
                <SkeletonBlock
                  theme={theme}
                  style={{ width: 30, height: 20, marginRight: 15 }}
                />
                <View style={{ flex: 1 }}>
                  <SkeletonBlock
                    theme={theme}
                    style={{ width: "40%", height: 14, marginBottom: 6 }}
                  />
                  <SkeletonBlock
                    theme={theme}
                    style={{ width: "90%", height: 12 }}
                  />
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
};

/* ===== RUBRIC DATA ===== */
const RUBRIC = [
  {
    level: 1.6,
    label: "New / Recreational",
    desc: "Mới chơi, thao tác còn chậm. Giao bóng chưa ổn định.",
  },
  {
    level: 2.0,
    label: "Beginner",
    desc: "Giao bóng bắt đầu đều. Đánh bóng dễ. Chưa kiểm soát tempo.",
  },
  {
    level: 2.5,
    label: "Lower Intermediate",
    desc: "Giao & trả ổn định. Rally ngắn. Bắt đầu dink (còn lỗi).",
  },
  {
    level: 3.0,
    label: "Intermediate",
    desc: "Giao chắc. Dink có kiểm soát. Bắt đầu Third shot.",
  },
  {
    level: 4.0,
    label: "Adv. Intermediate",
    desc: "Ít lỗi unforced. Third shot hiệu quả. Dink ổn định.",
  },
  {
    level: 4.5,
    label: "Advanced",
    desc: "Rất ít lỗi. Dink chiến thuật. Volley ổn định. Đọc trận tốt.",
  },
  {
    level: 5.0,
    label: "Pro (5.0+)",
    desc: "Thi đấu cao cấp. Hầu như không lỗi. Chiến thuật linh hoạt.",
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

/* ===== COMPONENTS ===== */

// 1. Status Badge
const StatusBadge = ({ loading, error, text, theme }) => {
  if (!text && !loading && !error) return null;

  let bg = theme.chipBg;
  let color = theme.subText;
  let label = text;

  if (loading) {
    label = "Đang đồng bộ...";
  } else if (error) {
    bg = theme.isDark ? "#450a0a" : "#fee2e2";
    color = "#ef4444";
    label = "Lỗi tải dữ liệu cũ";
  } else {
    // Success state (Auto-filled)
    bg = theme.isDark ? "rgba(16, 185, 129, 0.2)" : "#dcfce7";
    color = theme.isDark ? "#34d399" : "#166534";
  }

  return (
    <View style={[styles.badgeContainer, { backgroundColor: bg }]}>
      {loading && (
        <ActivityIndicator
          size="small"
          color={color}
          style={{ marginRight: 6 }}
        />
      )}
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
};

// 2. Stat Card
const StatCard = ({
  label,
  value,
  setValue,
  color,
  bgLight,
  icon,
  theme,
  onBlur,
}) => {
  const inputRef = useRef(null);
  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={() => inputRef.current?.focus()}
      style={[
        styles.statCard,
        { backgroundColor: theme.card, borderColor: theme.border },
      ]}
    >
      <View style={[styles.iconCircle, { backgroundColor: bgLight }]}>
        <Text style={{ fontSize: 18 }}>{icon}</Text>
      </View>
      <Text style={[styles.statLabel, { color: theme.subText }]}>{label}</Text>
      <TextInput
        ref={inputRef}
        style={[styles.bigInput, { color: color }]}
        value={value}
        onChangeText={(t) => setValue(sanitizeDuprTextInput(t))}
        onBlur={onBlur}
        keyboardType="decimal-pad"
        placeholder="0.0"
        placeholderTextColor={theme.border}
        selectTextOnFocus
        maxLength={5}
      />
      <View
        style={{
          height: 4,
          width: 30,
          backgroundColor: color,
          borderRadius: 2,
          marginTop: 4,
        }}
      />
    </TouchableOpacity>
  );
};

// 3. Rubric Item
const RubricItem = ({ item, activeSingle, activeDouble, theme }) => {
  const isActive = activeSingle || activeDouble;
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: isActive ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [isActive]);

  const bgColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ["transparent", theme.card],
  });

  return (
    <Animated.View
      style={[
        styles.rubricRow,
        {
          backgroundColor: bgColor,
          borderColor: isActive ? theme.border : "transparent",
          borderWidth: isActive ? 1 : 0,
        },
      ]}
    >
      <View style={{ width: 40, alignItems: "center", paddingTop: 2 }}>
        <Text
          style={[
            styles.levelNumber,
            {
              color: isActive ? theme.text : theme.subText,
              fontWeight: isActive ? "800" : "600",
            },
          ]}
        >
          {item.level.toFixed(1)}
        </Text>
        <View style={{ flexDirection: "row", gap: 3, marginTop: 4 }}>
          {activeSingle && (
            <View style={[styles.dot, { backgroundColor: theme.primary }]} />
          )}
          {activeDouble && (
            <View style={[styles.dot, { backgroundColor: theme.success }]} />
          )}
        </View>
      </View>
      <View style={{ flex: 1, paddingLeft: 10 }}>
        <Text
          style={[
            styles.rubricTitle,
            { color: isActive ? theme.text : theme.subText },
          ]}
        >
          {item.label}
        </Text>
        <Text style={[styles.rubricDesc, { color: theme.subText }]}>
          {item.desc}
        </Text>
      </View>
    </Animated.View>
  );
};

/* ===== MAIN SCREEN ===== */
export default function LevelPointScreen({ userId: userIdProp }) {
  const T = useThemeTokens();
  const authedId = useSelector((s) => s?.auth?.userInfo?._id);
  const userId = userIdProp || authedId;

  const [singleInput, setSingleInput] = useState("");
  const [doubleInput, setDoubleInput] = useState("");
  const didPrefillRef = useRef(false);

  const [createAssessment, { isLoading: saving }] =
    useCreateAssessmentMutation();
  const {
    data: latest,
    isLoading: loadingLatest,
    error: latestError,
  } = useGetLatestAssessmentQuery(userId);

  // === LOGIC PREFILL ===
  useEffect(() => {
    if (!latest || didPrefillRef.current) return;
    if (singleInput !== "" || doubleInput !== "") return;

    if (typeof latest?.singleLevel === "number") {
      setSingleInput(String(normalizeDupr(latest.singleLevel)));
      setDoubleInput(String(normalizeDupr(latest.doubleLevel)));
      didPrefillRef.current = true;
    } else if (typeof latest?.singleScore === "number") {
      setSingleInput(String(duprFromRaw(latest.singleScore)));
      setDoubleInput(String(duprFromRaw(latest.doubleScore)));
      didPrefillRef.current = true;
    }
  }, [latest]);

  // === TẠO TEXT TRẠNG THÁI ===
  const statusText = useMemo(() => {
    if (latest?._id) {
      const dateStr = latest.scoredAt
        ? new Date(latest.scoredAt).toLocaleDateString("vi-VN")
        : "";
      return `Đã tự điền từ ngày gần nhất ${dateStr}`;
    }
    return null;
  }, [latest]);

  const handleBlur = (val, setVal) => {
    if (val === "") return;
    const n = parseDecimal(val);
    if (!Number.isNaN(n)) setVal(String(normalizeDupr(n)));
  };

  const parseOrNull = (s) => {
    if (s === "") return null;
    const n = parseDecimal(s);
    if (Number.isNaN(n)) return null;
    return normalizeDupr(n);
  };
  const singleVal = useMemo(() => parseOrNull(singleInput), [singleInput]);
  const doubleVal = useMemo(() => parseOrNull(doubleInput), [doubleInput]);

  const nearestSingle = nearestRubricLevel(singleVal);
  const nearestDouble = nearestRubricLevel(doubleVal);

  const handleReset = () => {
    setSingleInput("");
    setDoubleInput("");
    didPrefillRef.current = false;
  };

  const handleSubmit = async () => {
    if (!userId) return Alert.alert("Lỗi", "Thiếu userId.");

    const sV = parseDecimal(singleInput);
    const dV = parseDecimal(doubleInput);

    if (
      isNaN(sV) ||
      sV < DUPR_MIN ||
      sV > DUPR_MAX ||
      isNaN(dV) ||
      dV < DUPR_MIN ||
      dV > DUPR_MAX
    ) {
      Alert.alert("Chưa hợp lệ", `Điểm phải từ ${DUPR_MIN} đến ${DUPR_MAX}`);
      return;
    }

    try {
      await createAssessment({
        userId,
        singleLevel: sV,
        doubleLevel: dV,
        note: "Updated from App",
      }).unwrap();
      Alert.alert("Thành công", "Đã cập nhật trình độ!");
    } catch (err) {
      Alert.alert("Lỗi", "Không lưu được đánh giá.");
    }
  };

  /* ===== RETURN VIEW OR SKELETON ===== */
  // Kiểm tra loading ở đây
  if (loadingLatest) {
    return (
      <AuthGuard>
        <LevelPointSkeleton theme={T} />
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <View style={{ flex: 1, backgroundColor: T.bg }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Header & Status */}
            <View style={{ marginBottom: 20 }}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                <View>
                  <Text style={[styles.headerTitle, { color: T.text }]}>
                    Chấm trình
                  </Text>
                  <Text style={[styles.headerSubtitle, { color: T.subText }]}>
                    Chấm điểm level Pickleball của bạn
                  </Text>
                </View>
                <StatusBadge
                  loading={loadingLatest}
                  error={latestError}
                  text={statusText}
                  theme={T}
                />
              </View>
            </View>

            {/* Inputs */}
            <View style={styles.statsGrid}>
              <StatCard
                label="Điểm ĐƠN"
                icon="👤"
                value={singleInput}
                setValue={setSingleInput}
                color={T.primary}
                bgLight={T.primaryLight}
                theme={T}
                onBlur={() => handleBlur(singleInput, setSingleInput)}
              />
              <StatCard
                label="điểm ĐÔI"
                icon="👥"
                value={doubleInput}
                setValue={setDoubleInput}
                color={T.success}
                bgLight={T.successLight}
                theme={T}
                onBlur={() => handleBlur(doubleInput, setDoubleInput)}
              />
            </View>

            {/* Buttons Row */}
            <View style={styles.btnRow}>
              <TouchableOpacity
                onPress={handleReset}
                style={[styles.resetBtn, { borderColor: T.border }]}
              >
                <Text style={{ color: T.subText, fontWeight: "600" }}>
                  Đặt lại
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSubmit}
                disabled={saving}
                style={[
                  styles.mainButton,
                  { backgroundColor: T.text, opacity: saving ? 0.7 : 1 },
                ]}
              >
                {saving ? (
                  <ActivityIndicator color={T.bg} />
                ) : (
                  <Text style={[styles.mainBtnText, { color: T.bg }]}>
                    CẬP NHẬT
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Rubric */}
            <View style={{ marginTop: 30 }}>
              <Text style={[styles.sectionTitle, { color: T.text }]}>
                THAM CHIẾU KỸ NĂNG
              </Text>
              <View
                style={[
                  styles.rubricContainer,
                  { backgroundColor: T.isDark ? "#ffffff05" : "#ffffff80" },
                ]}
              >
                {RUBRIC.map((item) => (
                  <RubricItem
                    key={item.level}
                    item={item}
                    theme={T}
                    activeSingle={nearestSingle === item.level}
                    activeDouble={nearestDouble === item.level}
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

/* ===== STYLES ===== */
const styles = StyleSheet.create({
  headerTitle: { fontSize: 26, fontWeight: "800" },
  headerSubtitle: { fontSize: 14, marginTop: 2 },

  // Badge mới
  badgeContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    maxWidth: "50%",
  },
  badgeText: { fontSize: 11, fontWeight: "600", flexShrink: 1 },

  statsGrid: { flexDirection: "row", gap: 12, marginBottom: 20 },
  statCard: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  statLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  bigInput: {
    fontSize: 28,
    fontWeight: "800",
    textAlign: "center",
    padding: 0,
    marginVertical: 4,
  },

  // Buttons
  btnRow: { flexDirection: "row", gap: 12 },
  resetBtn: {
    paddingHorizontal: 20,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    height: 50,
  },
  mainButton: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  mainBtnText: { fontSize: 15, fontWeight: "700" },

  // Rubric
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 12,
    opacity: 0.7,
  },
  rubricContainer: { borderRadius: 16, overflow: "hidden" },
  rubricRow: {
    flexDirection: "row",
    padding: 12,
    borderRadius: 12,
    marginBottom: 2,
  },
  levelNumber: {
    fontSize: 15,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  rubricTitle: { fontSize: 14, fontWeight: "600", marginBottom: 2 },
  rubricDesc: { fontSize: 12, lineHeight: 16 },
});
