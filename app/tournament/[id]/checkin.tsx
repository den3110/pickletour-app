// app/tournament/[id]/checkin.tsx
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  TouchableOpacity,
  useColorScheme,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import {
  useGetRegistrationsQuery,
  useCheckinMutation,
  useGetTournamentQuery,
  useGetTournamentMatchesForCheckinQuery,
  useSearchUserMatchesQuery,
  useUserCheckinRegistrationMutation,
} from "@/slices/tournamentsApiSlice";

/* ---------- Theme helpers ---------- */
function useThemeColors() {
  const scheme = useColorScheme() ?? "light";
  const isDark = scheme === "dark";

  const tint = isDark ? "#7cc0ff" : "#0a84ff";
  const background = isDark ? "#0f1115" : "#fafafa";
  const cardBg = isDark ? "#16181d" : "#ffffff";
  const border = isDark ? "#2f3136" : "#e6e8ef";
  const hairline = isDark ? "#26282d" : "#e6e8ef";
  const inputBg = isDark ? "#1a1c21" : "#ffffff";
  const inputBorder = isDark ? "#2a2d33" : "#e0e0e0";
  const textPrimary = isDark ? "#ffffff" : "#111111";
  const textMuted = isDark ? "#9aa0a6" : "#666666";
  const btnDisabled = isDark ? "#4b5563" : "#9aa0a6";

  // Soft info/danger boxes (balanced for dark)
  const infoBoxBg = isDark ? "#0f2538" : "#e3f2fd";
  const infoBoxBd = isDark ? "#1b3a55" : "#bbdefb";
  const infoBoxFg = isDark ? "#a8d0ff" : "#0b5394";

  const errBoxBg = isDark ? "#2a1416" : "#ffebee";
  const errBoxBd = isDark ? "#55282c" : "#ffcdd2";
  const errBoxFg = isDark ? "#ffb3b9" : "#b71c1c";

  return {
    scheme,
    tint,
    background,
    cardBg,
    border,
    hairline,
    inputBg,
    inputBorder,
    textPrimary,
    textMuted,
    btnDisabled,
    infoBoxBg,
    infoBoxBd,
    infoBoxFg,
    errBoxBg,
    errBoxBd,
    errBoxFg,
  };
}

/* ---------- Utils ---------- */
const fmtDate = (s?: string) => (s ? new Date(s).toLocaleDateString() : "—");
const fmtTime = (s?: string) => (s && s.length ? s : "—");
const normType = (t?: string) => {
  const s = String(t || "").toLowerCase();
  if (s === "single" || s === "singles") return "single";
  if (s === "double" || s === "doubles") return "double";
  return s || "double";
};

/* ---------- Soft-color Chips (themed) ---------- */
function chipPalette(scheme: "light" | "dark") {
  if (scheme === "dark") {
    return {
      primary: { bg: "#0f2130", fg: "#90caf9", bd: "#1b3a55" }, // blue-ish
      success: { bg: "#0f2312", fg: "#8fe29f", bd: "#1e3a22" }, // green-ish
      info: { bg: "#0b2a2e", fg: "#7bd1d8", bd: "#15464c" }, // teal-ish
      warning: { bg: "#2c1f06", fg: "#ffcc80", bd: "#4a3510" }, // amber-ish
      danger: { bg: "#2a1416", fg: "#ffb3b9", bd: "#4c2327" }, // red-ish
      neutral: { bg: "#1f2226", fg: "#a1a1aa", bd: "#2c2f34" }, // gray
    } as const;
  }
  return {
    primary: { bg: "#e3f2fd", fg: "#0d47a1", bd: "#bbdefb" },
    success: { bg: "#e8f5e9", fg: "#2e7d32", bd: "#c8e6c9" },
    info: { bg: "#e0f7fa", fg: "#006064", bd: "#b2ebf2" },
    warning: { bg: "#fff8e1", fg: "#f57c00", bd: "#ffe0b2" },
    danger: { bg: "#ffebee", fg: "#b71c1c", bd: "#ffcdd2" },
    neutral: { bg: "#f4f4f5", fg: "#52525b", bd: "#e4e4e7" },
  } as const;
}
type ChipVariant = keyof ReturnType<typeof chipPalette>;

function ChipRN({
  label,
  variant = "neutral",
  style,
}: {
  label: string;
  variant?: ChipVariant;
  style?: any;
}) {
  const { scheme } = useThemeColors();
  const P =
    chipPalette(scheme as "light" | "dark")[variant] ??
    chipPalette(scheme as "light" | "dark").neutral;
  return (
    <View
      style={[
        {
          backgroundColor: P.bg,
          borderColor: P.bd,
          borderWidth: 1,
          borderRadius: 999,
          paddingHorizontal: 10,
          paddingVertical: 6,
          alignSelf: "flex-start",
        },
        style,
      ]}
    >
      <Text
        style={{ color: P.fg, fontSize: 12, fontWeight: "600" }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

/* map status -> màu chip */
function statusToVariant(status?: string): ChipVariant {
  const s = String(status || "").toLowerCase();
  if (
    ["done", "completed", "finished", "kết thúc", "hoàn thành"].some((k) =>
      s.includes(k)
    )
  )
    return "success";
  if (
    ["live", "playing", "inprogress", "ongoing", "đang"].some((k) =>
      s.includes(k)
    )
  )
    return "info";
  if (
    ["scheduled", "pending", "upcoming", "lịch", "chờ"].some((k) =>
      s.includes(k)
    )
  )
    return "primary";
  if (
    [
      "canceled",
      "cancelled",
      "no show",
      "walkover",
      "wo",
      "forfeit",
      "huỷ",
    ].some((k) => s.includes(k))
  )
    return "danger";
  return "neutral";
}

/* ---------- Buttons ---------- */
const PrimaryBtn = ({
  title,
  onPress,
  disabled,
  full,
  color,
}: {
  title: string;
  onPress?: () => void;
  disabled?: boolean;
  full?: boolean;
  color?: string;
}) => {
  const { tint, btnDisabled } = useThemeColors();
  const bg = disabled ? btnDisabled : color || tint;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      style={[
        styles.btn,
        { backgroundColor: bg },
        full && { alignSelf: "stretch" },
      ]}
    >
      <Text style={styles.btnText}>{title}</Text>
    </TouchableOpacity>
  );
};

/* ---------- Vertical match item (avoid overflow) ---------- */
function MatchItemV({
  m,
  fmtSide,
  embedded = false,
}: {
  m: any;
  fmtSide: (s?: string) => string;
  embedded?: boolean; // true khi hiển thị bên trong thẻ registration
}) {
  const C = useThemeColors();
  return (
    <View
      style={
        embedded
          ? [styles.matchInner, { borderTopColor: C.hairline }]
          : [
              styles.card,
              styles.matchCardV,
              { backgroundColor: C.cardBg, borderColor: C.border },
            ]
      }
    >
      {/* Header: code + status */}
      <View style={styles.rowBetween}>
        <Text style={[styles.matchCode, { color: C.textPrimary }]}>
          {m?.code || "—"}
        </Text>
        <ChipRN label={m?.status || "—"} variant={statusToVariant(m?.status)} />
      </View>

      {/* Sub info */}
      <Text style={[styles.matchSub, { color: C.textMuted }]}>
        {fmtDate(m?.date)} • {fmtTime(m?.time)} • {m?.field || "—"}
      </Text>

      {/* Teams (vertical) */}
      <View style={styles.teamsV}>
        <Text style={[styles.teamText, { color: C.textPrimary }]}>
          {fmtSide(m?.team1)}
        </Text>
        <Text style={[styles.scoreBig, { color: C.textPrimary }]}>
          {m?.score1} - {m?.score2}
        </Text>
        <Text
          style={[
            styles.teamText,
            { textAlign: "right", color: C.textPrimary },
          ]}
        >
          {fmtSide(m?.team2)}
        </Text>
      </View>

      {!!m?.referee && (
        <Text style={[styles.matchSub, { marginTop: 6, color: C.textMuted }]}>
          Trọng tài: {m?.referee}
        </Text>
      )}
    </View>
  );
}

export default function TournamentCheckinScreen() {
  const C = useThemeColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const tourId = String(id || "");
  const router = useRouter();

  /* fetch tournament / registrations / matches */
  const {
    data: tour,
    isLoading: tourLoading,
    error: tourError,
  } = useGetTournamentQuery(tourId);
  const {
    data: regs = [],
    isLoading,
    error,
    refetch: refetchRegs,
  } = useGetRegistrationsQuery(tourId);
  const { data: matches = [], isLoading: matchesLoading } =
    useGetTournamentMatchesForCheckinQuery(tourId);

  const evType = normType(tour?.eventType);
  const isSingles = evType === "single";

  /* format team label: single -> bỏ phần sau && hoặc & */
  const fmtSide = useCallback(
    (label?: string) => {
      if (!label) return "—";
      const s = String(label).trim();
      if (!isSingles) return s;
      return s.split(/\s*&&\s*|\s*&\s*/)[0].trim();
    },
    [isSingles]
  );

  /* (Cũ) Check-in theo SĐT có trong danh sách đăng ký */
  const [phone, setPhone] = useState("");
  const [busyId, setBusy] = useState<string | null>(null);
  const [checkin] = useCheckinMutation();

  const handlePhone = async () => {
    const reg = regs.find(
      (r: any) => r?.player1?.phone === phone || r?.player2?.phone === phone
    );
    if (!reg) {
      Alert.alert("Thông báo", "Không tìm thấy số ĐT trong danh sách đăng ký");
      return;
    }
    if (reg?.payment?.status !== "Paid") {
      Alert.alert("Thông báo", "Chưa thanh toán lệ phí — không thể check-in");
      return;
    }
    if (reg?.checkinAt) {
      Alert.alert("Thông báo", "Đăng ký này đã check-in rồi");
      return;
    }

    setBusy(reg._id);
    try {
      await checkin({ regId: reg._id }).unwrap();
      Alert.alert("Thành công", "Check-in thành công");
      refetchRegs();
    } catch (e: any) {
      Alert.alert("Lỗi", e?.data?.message || e?.error || "Lỗi check-in");
    } finally {
      setBusy(null);
      setPhone("");
    }
  };

  /* (Mới) Tìm & check-in theo SĐT/Nickname */
  const [q, setQ] = useState("");
  const [submittedQ, setSubmittedQ] = useState("");
  const {
    data: searchRes,
    isFetching: searching,
    isError: searchError,
    error: searchErrObj,
    refetch: refetchSearch,
  } = useSearchUserMatchesQuery(
    { tournamentId: tourId, q: submittedQ },
    { skip: !submittedQ }
  );
  const [userCheckin, { isLoading: checkingUser }] =
    useUserCheckinRegistrationMutation();

  const onSubmitSearch = useCallback(() => {
    const key = q.trim();
    if (!key) {
      Alert.alert("Thông báo", "Nhập SĐT hoặc nickname để tìm");
      return;
    }
    setSubmittedQ(key);
  }, [q]);

  const results = searchRes?.results || [];

  const handleUserCheckin = async (regId: string) => {
    try {
      const res = await userCheckin({
        tournamentId: tourId,
        q: submittedQ,
        regId,
      }).unwrap();
      Alert.alert("Thành công", res?.message || "Check-in thành công");
      refetchSearch();
      refetchRegs();
    } catch (e: any) {
      Alert.alert("Lỗi", e?.data?.message || e?.error || "Check-in thất bại");
    }
  };

  /* Filter danh sách TRẬN của GIẢI (cũ) */
  const [searchMatches, setSearchMatches] = useState("");
  const filtered = useMemo(() => {
    const key = searchMatches.trim().toLowerCase();
    if (!key) return matches;
    return (matches as any[]).filter((m: any) => {
      const t1 = String(m?.team1 || "").toLowerCase();
      const t2 = String(m?.team2 || "").toLowerCase();
      const code = String(m?.code || "").toLowerCase();
      const stt = String(m?.status || "").toLowerCase();
      return (
        code.includes(key) ||
        t1.includes(key) ||
        t2.includes(key) ||
        stt.includes(key)
      );
    });
  }, [matches, searchMatches]);

  /* ---------- guards ---------- */
  if (tourLoading && !tour) {
    return (
      <View style={[styles.center, { backgroundColor: C.background }]}>
        <ActivityIndicator color={C.tint} />
      </View>
    );
  }
  if (tourError) {
    return (
      <View
        style={[
          styles.errorBox,
          { margin: 16, backgroundColor: C.errBoxBg, borderColor: C.errBoxBd },
        ]}
      >
        <Text style={[styles.errorText, { color: C.errBoxFg }]}>
          {(tourError as any)?.data?.message ||
            (tourError as any)?.error ||
            "Lỗi tải giải đấu"}
        </Text>
      </View>
    );
  }
  if (!tour) return null;

  /* ---------- RENDER ---------- */
  return (
    <ScrollView
      contentContainerStyle={[
        styles.container,
        { backgroundColor: C.background },
      ]}
    >
      {/* HEADER */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: C.textPrimary }]}>
          Chào mừng đến với giải đấu:{" "}
          <Text style={{ color: C.tint, textTransform: "uppercase" }}>
            {tour?.name || "—"}
          </Text>
        </Text>
        {!!tour?.eventType && (
          <ChipRN
            label={isSingles ? "Giải đơn" : "Giải đôi"}
            variant={isSingles ? "neutral" : "primary"}
          />
        )}
      </View>

      {/* ACTIONS */}
      <View
        style={[
          styles.card,
          styles.actionsCard,
          { backgroundColor: C.cardBg, borderColor: C.border },
        ]}
      >
        {/* (Giữ UI cũ nếu cần: check-in bằng SĐT đã đăng ký)
        <View style={styles.rowWrap}>
          <TextInput
            placeholder="Nhập SĐT VĐV đã đăng ký"
            value={phone}
            onChangeText={setPhone}
            style={[styles.input, { flex: 1, backgroundColor: C.inputBg, borderColor: C.inputBorder, color: C.textPrimary }]}
            placeholderTextColor={C.textMuted}
            keyboardType="phone-pad"
            selectionColor={C.tint}
            returnKeyType="done"
          />
          <PrimaryBtn
            title={busyId ? "Đang check-in…" : "Check-in (SĐT đã đăng ký)"}
            onPress={handlePhone}
            disabled={busyId !== null}
          />
        </View> */}

        <View style={styles.rowWrap}>
          <PrimaryBtn
            title="Sơ đồ giải đấu"
            color="#ed6c02"
            onPress={() =>
              router.push({
                pathname: "/tournament/[id]/bracket",
                params: { id: tourId },
              })
            }
            full
          />
          <PrimaryBtn
            title="Danh sách đăng ký"
            color="#0288d1"
            onPress={() =>
              router.push({
                pathname: "/tournament/[id]/register",
                params: { id: tourId },
              })
            }
            full
          />
        </View>
      </View>

      {/* ====== Tìm & check-in theo SĐT/Nickname ====== */}
      <View
        style={[
          styles.card,
          { backgroundColor: C.cardBg, borderColor: C.border },
        ]}
      >
        <Text style={[styles.sectionTitle, { color: C.textPrimary }]}>
          Check-in theo SĐT / Nickname
        </Text>

        <View style={styles.rowWrap}>
          <TextInput
            placeholder="Nhập SĐT hoặc nickname đã đăng ký…"
            value={q}
            onChangeText={setQ}
            onSubmitEditing={onSubmitSearch}
            style={[
              styles.input,
              {
                flex: 1,
                backgroundColor: C.inputBg,
                borderColor: C.inputBorder,
                color: C.textPrimary,
              },
            ]}
            placeholderTextColor={C.textMuted}
            selectionColor={C.tint}
            returnKeyType="search"
          />
          <PrimaryBtn
            title={searching ? "Đang tìm…" : "Tìm"}
            onPress={onSubmitSearch}
            disabled={searching}
          />
        </View>

        {searching ? (
          <View style={{ paddingVertical: 12, alignItems: "center" }}>
            <ActivityIndicator size="small" color={C.tint} />
          </View>
        ) : submittedQ && results.length === 0 && !searchError ? (
          <View
            style={[
              styles.infoBox,
              { backgroundColor: C.infoBoxBg, borderColor: C.infoBoxBd },
            ]}
          >
            <Text style={{ color: C.infoBoxFg }}>
              Không tìm thấy đăng ký nào khớp với{" "}
              <Text style={{ fontWeight: "700" }}>{submittedQ}</Text>.
            </Text>
          </View>
        ) : searchError ? (
          <View
            style={[
              styles.errorBox,
              { backgroundColor: C.errBoxBg, borderColor: C.errBoxBd },
            ]}
          >
            <Text style={[styles.errorText, { color: C.errBoxFg }]}>
              {(searchErrObj as any)?.data?.message ||
                (searchErrObj as any)?.error ||
                "Lỗi tìm kiếm"}
            </Text>
          </View>
        ) : null}

        {/* Danh sách registration khớp */}
        {results.map((reg: any) => {
          const canCheckin = reg?.paid && !reg?.checkinAt;
          const disabledReason = !reg?.paid
            ? "Chưa thanh toán lệ phí"
            : reg?.checkinAt
            ? "Đã check-in"
            : "";
          const teamLabel = isSingles
            ? fmtSide(reg?.teamLabel)
            : reg?.teamLabel;

          return (
            <View
              key={reg?.regId || reg?._id}
              style={[
                styles.card,
                {
                  marginTop: 10,
                  backgroundColor: C.cardBg,
                  borderColor: C.border,
                },
              ]}
            >
              <View style={styles.rowBetween}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "700",
                      color: C.textPrimary,
                    }}
                  >
                    {teamLabel || "—"}
                  </Text>
                  <View style={[styles.rowWrap, { marginTop: 6 }]}>
                    <ChipRN
                      label={reg?.paid ? "Đã thanh toán" : "Chưa thanh toán"}
                      variant={reg?.paid ? "success" : "neutral"}
                    />
                    {reg?.checkinAt ? (
                      <ChipRN
                        label={`Đã check-in • ${new Date(
                          reg.checkinAt
                        ).toLocaleString()}`}
                        variant="info"
                      />
                    ) : (
                      <ChipRN label="Chưa check-in" variant="neutral" />
                    )}
                  </View>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <PrimaryBtn
                    title={checkingUser ? "Đang check-in…" : "Check-in"}
                    onPress={() => handleUserCheckin(reg?.regId || reg?._id)}
                    disabled={!canCheckin || checkingUser}
                  />
                  {!canCheckin && !!disabledReason && (
                    <Text
                      style={{ color: C.textMuted, fontSize: 12, marginTop: 4 }}
                    >
                      * {disabledReason}
                    </Text>
                  )}
                </View>
              </View>

              {/* Matches of this registration (vertical items, embedded) */}
              <View style={[styles.divider, { backgroundColor: C.hairline }]} />
              {Array.isArray(reg?.matches) && reg.matches.length ? (
                <View style={{ gap: 8 }}>
                  {reg.matches.map((m: any) => (
                    <MatchItemV
                      key={m?._id || m?.code}
                      m={m}
                      fmtSide={fmtSide}
                      embedded
                    />
                  ))}
                </View>
              ) : (
                <Text style={{ color: C.textMuted }}>
                  Chưa có trận nào được xếp cho {isSingles ? "VĐV" : "đôi"} này.
                </Text>
              )}
            </View>
          );
        })}
      </View>

      {/* ====== (Cũ) SEARCH BOX cho danh sách TRẬN của GIẢI ====== */}
      <View
        style={[
          styles.card,
          { backgroundColor: C.cardBg, borderColor: C.border },
        ]}
      >
        <TextInput
          placeholder="Tìm: Tên VĐV/đội, mã trận, tình trạng…"
          value={searchMatches}
          onChangeText={setSearchMatches}
          style={[
            styles.input,
            {
              marginBottom: 8,
              backgroundColor: C.inputBg,
              borderColor: C.inputBorder,
              color: C.textPrimary,
            },
          ]}
          placeholderTextColor={C.textMuted}
          selectionColor={C.tint}
          returnKeyType="search"
        />

        {/* ====== (Cũ) DANH SÁCH TRẬN CỦA GIẢI ====== */}
        {isLoading || matchesLoading ? (
          <ActivityIndicator color={C.tint} />
        ) : error ? (
          <View
            style={[
              styles.errorBox,
              { backgroundColor: C.errBoxBg, borderColor: C.errBoxBd },
            ]}
          >
            <Text style={[styles.errorText, { color: C.errBoxFg }]}>
              {(error as any)?.data?.message ||
                (error as any)?.error ||
                "Lỗi tải danh sách"}
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {(filtered as any[]).map((m) => (
              <MatchItemV key={m?._id || m?.code} m={m} fmtSide={fmtSide} />
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

/* ---------- styles (static sizes; colors injected via theme) ---------- */
const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 12,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    gap: 8,
    paddingBottom: 4,
  },
  title: { fontSize: 18, fontWeight: "700" },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
  },
  actionsCard: { gap: 8 },
  rowWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    alignItems: "center",
  },
  input: {
    height: 40,
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
  },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 8 },

  btn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 120,
  },
  btnText: { color: "#fff", fontWeight: "700" },

  errorBox: {
    borderWidth: 1,
    padding: 10,
    borderRadius: 12,
  },
  errorText: { fontWeight: "600" },
  infoBox: {
    borderWidth: 1,
    padding: 10,
    borderRadius: 12,
    marginTop: 8,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 10,
  },

  /* Match (vertical) */
  matchCardV: { padding: 12, marginTop: 2 },
  matchInner: {
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  matchCode: { fontWeight: "700" },
  matchSub: { fontSize: 12 },
  teamsV: { marginTop: 8, gap: 4 },
  teamText: { fontWeight: "600", lineHeight: 18 },
  scoreBig: { alignSelf: "center", fontSize: 18, fontWeight: "800" },
});
