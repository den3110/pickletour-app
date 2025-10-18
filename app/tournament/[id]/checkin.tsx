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

/* ---------- Utils ---------- */
const fmtDate = (s?: string) => (s ? new Date(s).toLocaleDateString() : "—");
const fmtTime = (s?: string) => (s && s.length ? s : "—");
const normType = (t?: string) => {
  const s = String(t || "").toLowerCase();
  if (s === "single" || s === "singles") return "single";
  if (s === "double" || s === "doubles") return "double";
  return s || "double";
};

/* ---------- Soft-color Chips ---------- */
const CHIP = {
  primary: { bg: "#e3f2fd", fg: "#0d47a1", bd: "#bbdefb" }, // blue
  success: { bg: "#e8f5e9", fg: "#2e7d32", bd: "#c8e6c9" }, // green
  info: { bg: "#e0f7fa", fg: "#006064", bd: "#b2ebf2" }, // teal
  warning: { bg: "#fff8e1", fg: "#f57c00", bd: "#ffe0b2" }, // amber
  danger: { bg: "#ffebee", fg: "#b71c1c", bd: "#ffcdd2" }, // red
  neutral: { bg: "#f4f4f5", fg: "#52525b", bd: "#e4e4e7" }, // gray
} as const;
type ChipVariant = keyof typeof CHIP;

function ChipRN({
  label,
  variant = "neutral",
  style,
}: {
  label: string;
  variant?: ChipVariant;
  style?: any;
}) {
  const c = CHIP[variant] || CHIP.neutral;
  return (
    <View
      style={[
        {
          backgroundColor: c.bg,
          borderColor: c.bd,
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
        style={{ color: c.fg, fontSize: 12, fontWeight: "600" }}
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
  color = "#1976d2",
}: {
  title: string;
  onPress?: () => void;
  disabled?: boolean;
  full?: boolean;
  color?: string;
}) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={disabled}
    activeOpacity={0.85}
    style={[
      styles.btn,
      { backgroundColor: disabled ? "#9aa0a6" : color },
      full && { alignSelf: "stretch" },
    ]}
  >
    <Text style={styles.btnText}>{title}</Text>
  </TouchableOpacity>
);

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
  return (
    <View
      style={embedded ? styles.matchInner : [styles.card, styles.matchCardV]}
    >
      {/* Header: code + status */}
      <View style={styles.rowBetween}>
        <Text style={styles.matchCode}>{m?.code || "—"}</Text>
        <ChipRN label={m?.status || "—"} variant={statusToVariant(m?.status)} />
      </View>

      {/* Sub info */}
      <Text style={styles.matchSub}>
        {fmtDate(m?.date)} • {fmtTime(m?.time)} • {m?.field || "—"}
      </Text>

      {/* Teams (vertical) */}
      <View style={styles.teamsV}>
        <Text style={styles.teamText}>{fmtSide(m?.team1)}</Text>
        <Text style={styles.scoreBig}>
          {m?.score1} - {m?.score2}
        </Text>
        <Text style={[styles.teamText, { textAlign: "right" }]}>
          {fmtSide(m?.team2)}
        </Text>
      </View>

      {!!m?.referee && (
        <Text style={[styles.matchSub, { marginTop: 6 }]}>
          Trọng tài: {m?.referee}
        </Text>
      )}
    </View>
  );
}

export default function TournamentCheckinScreen() {
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
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  if (tourError) {
    return (
      <View style={[styles.errorBox, { margin: 16 }]}>
        <Text style={styles.errorText}>
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
    <ScrollView contentContainerStyle={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <Text style={styles.title}>
          Chào mừng đến với giải đấu:{" "}
          <Text style={{ color: "#1976d2", textTransform: "uppercase" }}>
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
      <View style={[styles.card, styles.actionsCard]}>
        {/* Check-in theo SĐT đã đăng ký */}
        {/* <View style={styles.rowWrap}>
          <TextInput
            placeholder="Nhập SĐT VĐV đã đăng ký"
            value={phone}
            onChangeText={setPhone}
            style={[styles.input, { flex: 1 }]}
            keyboardType="phone-pad"
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
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Check-in theo SĐT / Nickname</Text>

        <View style={styles.rowWrap}>
          <TextInput
            placeholder="Nhập SĐT hoặc nickname đã đăng ký…"
            value={q}
            onChangeText={setQ}
            onSubmitEditing={onSubmitSearch}
            style={[styles.input, { flex: 1 }]}
            returnKeyType="search"
          />
          <PrimaryBtn
            title={searching ? "Đang tìm…" : "Tìm"}
            onPress={onSubmitSearch}
          />
        </View>

        {searching ? (
          <View style={{ paddingVertical: 12, alignItems: "center" }}>
            <ActivityIndicator size="small" />
          </View>
        ) : submittedQ && results.length === 0 && !searchError ? (
          <View style={[styles.infoBox]}>
            <Text style={{ color: "#0b5394" }}>
              Không tìm thấy đăng ký nào khớp với{" "}
              <Text style={{ fontWeight: "700" }}>{submittedQ}</Text>.
            </Text>
          </View>
        ) : searchError ? (
          <View style={[styles.errorBox]}>
            <Text style={styles.errorText}>
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
              style={[styles.card, { marginTop: 10 }]}
            >
              <View style={styles.rowBetween}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ fontSize: 16, fontWeight: "700" }}>
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
                    <Text style={{ color: "#666", fontSize: 12, marginTop: 4 }}>
                      * {disabledReason}
                    </Text>
                  )}
                </View>
              </View>

              {/* Matches of this registration (vertical items, embedded) */}
              <View style={styles.divider} />
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
                <Text style={{ color: "#666" }}>
                  Chưa có trận nào được xếp cho {isSingles ? "VĐV" : "đôi"} này.
                </Text>
              )}
            </View>
          );
        })}
      </View>

      {/* ====== (Cũ) SEARCH BOX cho danh sách TRẬN của GIẢI ====== */}
      <View style={[styles.card]}>
        <TextInput
          placeholder="Tìm: Tên VĐV/đội, mã trận, tình trạng…"
          value={searchMatches}
          onChangeText={setSearchMatches}
          style={[styles.input, { marginBottom: 8 }]}
          returnKeyType="search"
        />

        {/* ====== (Cũ) DANH SÁCH TRẬN CỦA GIẢI ====== */}
        {isLoading || matchesLoading ? (
          <ActivityIndicator />
        ) : error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>
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

/* ---------- styles ---------- */
const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 12,
    backgroundColor: "#fafafa",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    gap: 8,
    paddingBottom: 4,
  },
  title: { fontSize: 18, fontWeight: "700" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e6e8ef",
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
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e0e0e0",
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
    backgroundColor: "#ffebee",
    borderWidth: 1,
    borderColor: "#ffcdd2",
    padding: 10,
    borderRadius: 12,
  },
  errorText: { color: "#b71c1c" },
  infoBox: {
    backgroundColor: "#e3f2fd",
    borderWidth: 1,
    borderColor: "#bbdefb",
    padding: 10,
    borderRadius: 12,
    marginTop: 8,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#e6e8ef",
    marginVertical: 10,
  },

  /* Match (vertical) */
  matchCardV: { padding: 12, marginTop: 2 },
  matchInner: {
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e6e8ef",
  },
  matchCode: { fontWeight: "700" },
  matchSub: { color: "#666", fontSize: 12 },
  teamsV: { marginTop: 8, gap: 4 },
  teamText: { fontWeight: "600", lineHeight: 18, color: "#111" },
  scoreBig: { alignSelf: "center", fontSize: 18, fontWeight: "800" },
});
