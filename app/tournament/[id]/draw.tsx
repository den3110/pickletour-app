// app/tournament/[id]/draw.tsx
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Animated,
  Dimensions,
  PanResponder,
  Easing,
  TouchableWithoutFeedback,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSelector } from "react-redux";

import {
  useGetTournamentQuery,
  useListTournamentBracketsQuery,
  useStartDrawMutation,
  useDrawNextMutation,
  useDrawCommitMutation,
  useDrawCancelMutation,
  useGetDrawStatusQuery,
  useGetRegistrationsQuery,
  useGetBracketQuery,
  useGenerateGroupMatchesMutation,
  useListTournamentMatchesQuery,
} from "@/slices/tournamentsApiSlice";
import { useSocket } from "@/context/SocketContext";

/* ───────────────────── Utils ───────────────────── */
const fmtDate = (s?: string) => (s ? new Date(s).toLocaleDateString() : "—");
const normType = (t?: string) => {
  const s = String(t || "").toLowerCase();
  if (s === "single" || s === "singles") return "single";
  if (s === "double" || s === "doubles") return "double";
  return s || "double";
};
const nameFromPlayer = (p: any) =>
  p?.fullName || p?.name || p?.nickname || "N/A";
const safePairName = (reg: any, evType = "double") => {
  if (!reg) return "—";
  if (evType === "single") return nameFromPlayer(reg?.player1);
  const p1 = nameFromPlayer(reg?.player1);
  const p2 = nameFromPlayer(reg?.player2);
  return p2 ? `${p1} & ${p2}` : p1 || "—";
};
const idOf = (x: any) => String(x?._id ?? x);
const asId = (x: any) => {
  if (!x) return null;
  if (typeof x === "string") return x;
  if (typeof x === "object")
    return x._id || x.id || x.value?._id || x.value?.id || null;
  return null;
};
/* round-size helpers */
const sizeFromRoundCode = (code?: string) => {
  if (!code) return 2;
  const up = String(code).toUpperCase();
  if (up === "F") return 2;
  if (up === "SF") return 4;
  if (up === "QF") return 8;
  if (/^R\d+$/i.test(up)) return parseInt(up.slice(1), 10);
  return 2;
};
function nextPow2(n: number) {
  let p = 1;
  const need = Math.max(2, n | 0);
  while (p < need) p <<= 1;
  return p;
}
function codeLabelForSize(size: number) {
  if (size === 2) return { code: "F", label: "Chung kết (F)" };
  if (size === 4) return { code: "SF", label: "Bán kết (SF)" };
  if (size === 8) return { code: "QF", label: "Tứ kết (QF)" };
  const denom = Math.max(2, size / 2);
  return { code: `R${size}`, label: `Vòng 1/${denom} (R${size})` };
}
function buildKnockoutOptions(teamCount: number) {
  if (!Number.isFinite(teamCount) || teamCount < 2) {
    return [{ code: "F", label: "Chung kết (F)", roundNumber: 1 }];
  }
  const full = nextPow2(teamCount);
  const out: any[] = [];
  for (let size = full, idx = 1; size >= 2; size >>= 1, idx++) {
    const { code, label } = codeLabelForSize(size);
    out.push({ code, label, roundNumber: idx });
  }
  return out;
}

/* ───────────────────── Chips ───────────────────── */
const CHIP = {
  primary: { bg: "#e3f2fd", fg: "#0d47a1", bd: "#bbdefb" },
  success: { bg: "#e8f5e9", fg: "#2e7d32", bd: "#c8e6c9" },
  info: { bg: "#e0f7fa", fg: "#006064", bd: "#b2ebf2" },
  warning: { bg: "#fff8e1", fg: "#f57c00", bd: "#ffe0b2" },
  danger: { bg: "#ffebee", fg: "#b71c1c", bd: "#ffcdd2" },
  neutral: { bg: "#f4f4f5", fg: "#52525b", bd: "#e4e4e7" },
} as const;
type ChipVariant = keyof typeof CHIP;
const ChipRN = ({
  label,
  variant = "neutral",
}: {
  label: string;
  variant?: ChipVariant;
}) => {
  const c = CHIP[variant] || CHIP.neutral;
  return (
    <View
      style={{
        backgroundColor: c.bg,
        borderColor: c.bd,
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 6,
        alignSelf: "flex-start",
      }}
    >
      <Text
        style={{ color: c.fg, fontSize: 12, fontWeight: "600" }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
};
const statusToVariant = (status?: string): ChipVariant => {
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
};

/* ───────────────────── Tiny UI ───────────────────── */
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
    activeOpacity={0.9}
    style={[
      styles.btn,
      { backgroundColor: disabled ? "#9aa0a6" : color },
      full && { alignSelf: "stretch" },
    ]}
  >
    <Text style={styles.btnText}>{title}</Text>
  </TouchableOpacity>
);

const OutlineBtn = ({
  title,
  onPress,
  full,
}: {
  title: string;
  onPress?: () => void;
  full?: boolean;
}) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.85}
    style={[styles.btn, styles.btnOutline, full && { alignSelf: "stretch" }]}
  >
    <Text style={styles.btnOutlineText}>{title}</Text>
  </TouchableOpacity>
);

/* ───────────────────── Modal Select ───────────────────── */
function ModalSelect({
  label,
  value,
  options,
  getLabel = (x: any) => String(x?.label ?? x ?? "—"),
  getValue = (x: any) => String(x?.value ?? x ?? ""),
  onChange,
}: {
  label: string;
  value?: string;
  options: any[];
  getLabel?: (x: any) => string;
  getValue?: (x: any) => string;
  onChange?: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const curLabel =
    getLabel(options.find((o) => String(getValue(o)) === String(value))) ||
    "— Chọn —";
  return (
    <>
      <TouchableOpacity style={styles.selectBox} onPress={() => setOpen(true)}>
        <Text style={styles.selectLabel}>{label}</Text>
        <Text style={styles.selectValue} numberOfLines={1}>
          {curLabel}
        </Text>
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setOpen(false)}
        >
          <View style={styles.modalSheet}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <ScrollView style={{ maxHeight: 400 }}>
              {options.map((opt, idx) => (
                <TouchableOpacity
                  key={idx}
                  onPress={() => {
                    onChange?.(getValue(opt));
                    setOpen(false);
                  }}
                  style={styles.sheetItem}
                >
                  <Text style={{ fontWeight: "600" }}>{getLabel(opt)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <OutlineBtn title="Đóng" onPress={() => setOpen(false)} full />
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

/* ───────────────────── Group Seating Board ───────────────────── */
function GroupSeatingBoard({
  groupsMeta,
  reveals,
  regIndex,
  eventType,
  lastHighlight,
}: {
  groupsMeta: any[];
  reveals: any[];
  regIndex: Map<string, any>;
  eventType: "single" | "double";
  lastHighlight: any;
}) {
  const seats = useMemo(() => {
    const map = new Map<string, any>();
    (groupsMeta || []).forEach((g, idx) => {
      const code = g.code ?? String.fromCharCode(65 + idx);
      map.set(code.toUpperCase(), {
        code,
        size: Number(g.size) || 0,
        slots: Array.from({ length: Number(g.size) || 0 }, () => null as any),
      });
    });
    (reveals || []).forEach((rv) => {
      const key = (
        rv.groupCode ||
        rv.groupKey ||
        (typeof rv.group === "string" ? rv.group : "") ||
        ""
      ).toUpperCase();
      const nm = (() => {
        const by = rv.teamName || rv.name || rv.team || rv.displayName;
        if (by) return String(by);
        const rid = asId(rv.regId ?? rv.reg ?? rv.id ?? rv._id);
        if (rid && regIndex?.get(String(rid)))
          return safePairName(regIndex.get(String(rid)), eventType);
        return "—";
      })();
      const g = map.get(key);
      if (g) {
        const slot = g.slots.findIndex((x: any) => !x);
        if (slot >= 0) g.slots[slot] = nm;
      }
    });
    return Array.from(map.values());
  }, [groupsMeta, reveals, regIndex, eventType]);

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
      {seats.map((g) => (
        <View key={g.code} style={[styles.card, { width: "100%" }]}>
          <Text style={{ fontWeight: "800", marginBottom: 6 }}>
            Bảng {g.code}
          </Text>
          <View style={{ gap: 6 }}>
            {g.slots.map((val: any, idx: number) => {
              const isHit =
                lastHighlight &&
                lastHighlight.type === "group" &&
                lastHighlight.groupCode === g.code &&
                lastHighlight.slotIndex === idx;
              return (
                <View
                  key={idx}
                  style={[
                    styles.slotItem,
                    {
                      backgroundColor: val
                        ? isHit
                          ? "#f0fff4"
                          : "#f8fbff"
                        : "#fafafa",
                    },
                    isHit && { borderColor: "#a5d6a7" },
                  ]}
                >
                  <Text style={{ fontSize: 12 }}>
                    <Text style={{ fontWeight: "700" }}>Slot {idx + 1}:</Text>{" "}
                    {val || "—"}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

/* ───────────────────── RR Preview ───────────────────── */
function buildRR(teams: string[]) {
  const N = teams.length;
  const isOdd = N % 2 === 1;
  const arr = isOdd ? teams.concat(["(BYE)"]) : teams.slice();
  const n = arr.length;
  const rounds = n - 1;
  const fixed = arr[0];
  let rot = arr.slice(1);
  const schedule: { A: string; B: string }[][] = [];
  for (let r = 0; r < rounds; r++) {
    const left = [fixed].concat(rot.slice(0, (n - 1) / 2));
    const right = rot
      .slice((n - 1) / 2)
      .slice()
      .reverse();
    const pairs: any[] = [];
    for (let i = 0; i < left.length; i++) {
      const A = left[i];
      const B = right[i];
      if (A !== "(BYE)" && B !== "(BYE)") pairs.push({ A, B });
    }
    schedule.push(pairs);
    rot = [rot[rot.length - 1]].concat(rot.slice(0, rot.length - 1));
  }
  return schedule;
}

function RoundRobinPreview({
  groupsMeta,
  regIndex,
  doubleRound,
  eventType,
}: {
  groupsMeta: any[];
  regIndex: Map<string, any>;
  doubleRound: boolean;
  eventType: "single" | "double";
}) {
  return (
    <View style={{ gap: 10 }}>
      {groupsMeta.map((g) => {
        const teamNames = (g.regIds || []).map((rid: any) => {
          const reg = regIndex?.get(String(rid));
          return reg
            ? safePairName(reg, eventType)
            : typeof rid === "string"
            ? `#${rid.slice(-6)}`
            : "—";
        });
        const schedule1 = buildRR(teamNames);
        const schedule = doubleRound
          ? schedule1.concat(
              schedule1.map((roundPairs) =>
                roundPairs.map((p) => ({ A: p.B, B: p.A }))
              )
            )
          : schedule1;
        const totalMatches =
          ((teamNames.length * (teamNames.length - 1)) / 2) *
          (doubleRound ? 2 : 1);

        return (
          <View key={String(g.code)} style={[styles.card, { gap: 8 }]}>
            <View style={styles.rowBetween}>
              <Text style={{ fontWeight: "800" }}>
                Lịch thi đấu — Bảng {g.code}{" "}
                {doubleRound ? "(2 lượt)" : "(1 lượt)"}
              </Text>
              <ChipRN label={`Tổng: ${totalMatches} trận`} />
            </View>
            {!teamNames.length ? (
              <Text style={{ color: "#666" }}>Chưa có đội.</Text>
            ) : (
              schedule.map((roundPairs, idx) => (
                <View key={idx} style={{ marginBottom: 6 }}>
                  <Text style={{ fontWeight: "700", marginBottom: 4 }}>
                    Vòng {idx + 1}
                  </Text>
                  <View style={{ gap: 2 }}>
                    {roundPairs.map((p, i2) => (
                      <Text key={i2} style={{ fontSize: 13 }}>
                        • {p.A} vs {p.B}
                      </Text>
                    ))}
                  </View>
                </View>
              ))
            )}
          </View>
        );
      })}
    </View>
  );
}

/* ───────────────────── KO helpers/render ───────────────────── */
const roundTitleByCount = (cnt: number) => {
  if (cnt === 1) return "Chung kết";
  if (cnt === 2) return "Bán kết";
  if (cnt === 4) return "Tứ kết";
  if (cnt === 8) return "Vòng 1/8";
  if (cnt === 16) return "Vòng 1/16";
  return `Vòng (${cnt} trận)`;
};
const matchSideName = (
  m: any,
  side: "A" | "B",
  eventType: "single" | "double"
) => {
  const pair = side === "A" ? m?.pairA : m?.pairB;
  const prev = side === "A" ? m?.previousA : m?.previousB;
  const labelDep = (prevObj: any) => {
    if (!prevObj) return "Chưa có đội";
    const r = prevObj.round ?? "?";
    const idx = (prevObj.order ?? 0) + 1;
    return `Winner of R${r} #${idx}`;
  };
  if (pair) return safePairName(pair, eventType);
  if (prev) return labelDep(prev);
  return "Chưa có đội";
};

function buildRoundsForKO({
  roundCode,
  reveals,
  matches,
  eventType,
  selectedRoundNumber,
  selBracketId,
  bracket,
  bracketDetail,
  isPO = false,
}: any) {
  const startTeams = sizeFromRoundCode(roundCode);
  const totalRoundsFromSize = Math.max(1, Math.log2(startTeams) | 0);
  const firstRound = selectedRoundNumber || 1;

  const poMaxRounds =
    isPO &&
    (Number(bracketDetail?.meta?.maxRounds) ||
      Number(bracket?.meta?.maxRounds) ||
      Number(bracketDetail?.ko?.rounds) ||
      Number(bracket?.ko?.rounds) ||
      1);

  const cutRoundsExplicit =
    Number(bracket?.config?.roundElim?.cutRounds) ||
    Number(bracketDetail?.config?.roundElim?.cutRounds) ||
    Number(bracket?.ko?.cutRounds) ||
    Number(bracketDetail?.ko?.cutRounds) ||
    0;

  let cutToTeams =
    Number(bracketDetail?.meta?.expectedFirstRoundMatches) ||
    Number(bracket?.meta?.expectedFirstRoundMatches) ||
    Number(bracket?.meta?.cutToTeams) ||
    Number(bracketDetail?.meta?.cutToTeams) ||
    0;
  if (cutToTeams > startTeams) cutToTeams = startTeams;
  if (cutToTeams < 0) cutToTeams = 0;

  let cutRounds = cutRoundsExplicit;
  if (!cutRounds && cutToTeams > 0) {
    const r = Math.ceil(Math.log2(Math.max(1, startTeams / cutToTeams)));
    cutRounds = Math.max(1, r + 1);
  }
  if (cutRounds) cutRounds = Math.min(cutRounds, totalRoundsFromSize);

  const realSorted = (matches || [])
    .slice()
    .sort(
      (a: any, b: any) =>
        (a.round || 1) - (b.round || 1) || (a.order ?? 0) - (b.order ?? 0)
    );

  const maxRoundReal = realSorted.length
    ? Math.max(...realSorted.map((m: any) => m.round || 1))
    : firstRound;

  let lastRound;
  if (isPO) {
    const limit = Math.max(1, poMaxRounds || 1);
    lastRound = firstRound + limit - 1;
  } else {
    const lastRoundWhenFull = firstRound + totalRoundsFromSize - 1;
    lastRound = cutRounds
      ? firstRound + cutRounds - 1
      : Math.max(lastRoundWhenFull, maxRoundReal);
  }

  const countByRoundReal: Record<number, number> = {};
  realSorted.forEach((m: any) => {
    const r = m.round || 1;
    countByRoundReal[r] = (countByRoundReal[r] || 0) + 1;
  });

  const revealsPairs = (reveals || []).map((rv: any) => ({
    A: rv?.A?.name || rv?.AName || rv?.A || "Chưa có đội",
    B: rv?.B?.name || rv?.BName || rv?.B || "Chưa có đội",
  }));

  const expectedFirstPairs = Math.max(1, Math.floor(startTeams / 2));
  const firstRoundPairs = Math.max(
    expectedFirstPairs,
    countByRoundReal[firstRound] || 0,
    revealsPairs.length || 0
  );

  const seedsCount: Record<number, number> = {};
  seedsCount[firstRound] = firstRoundPairs;
  for (let r = firstRound + 1; r <= lastRound; r++) {
    const expected = Math.max(1, Math.ceil(seedsCount[r - 1] / 2));
    const realCount = countByRoundReal[r] || 0;
    seedsCount[r] = Math.max(expected, realCount);
  }

  const rounds: any[] = [];
  for (let r = firstRound; r <= lastRound; r++) {
    const need = seedsCount[r] || 1;
    const seeds = Array.from({ length: need }, (_, i) => ({
      id: `ph-${selBracketId}-${r}-${i}`,
      __match: null,
      teams: [{ name: "Chưa có đội" }, { name: "Chưa có đội" }],
    }));

    const ms = realSorted
      .filter((m: any) => (m.round || 1) === r)
      .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));

    if (ms.length) {
      ms.forEach((m: any, i: number) => {
        if (i >= seeds.length) return;
        seeds[i] = {
          id: m._id || `${selBracketId}-${r}-${i}`,
          __match: m,
          teams: [
            { name: matchSideName(m, "A", eventType) },
            { name: matchSideName(m, "B", eventType) },
          ],
        };
      });
    }
    if (r === firstRound && revealsPairs.length) {
      for (let i = 0; i < Math.min(seeds.length, revealsPairs.length); i++) {
        const rp = revealsPairs[i];
        if (!rp) continue;
        const curA = seeds[i]?.teams?.[0]?.name;
        const curB = seeds[i]?.teams?.[1]?.name;
        if (rp.A && rp.A !== "Chưa có đội" && (!curA || curA === "Chưa có đội"))
          seeds[i].teams[0].name = rp.A;
        if (rp.B && rp.B !== "Chưa có đội" && (!curB || curB === "Chưa có đội"))
          seeds[i].teams[1].name = rp.B;
      }
    }

    const localNo = r - firstRound + 1;
    const title = isPO ? `Vòng ${localNo}` : roundTitleByCount(need);
    rounds.push({ title, seeds });
  }

  return rounds;
}

/* ───────────────────── Overlays ───────────────────── */
const Ticker = ({
  finalText,
  pool,
  duration = 1200,
  onDone,
}: {
  finalText: string;
  pool: string[];
  duration?: number;
  onDone?: () => void;
}) => {
  const [text, setText] = useState("");
  useEffect(() => {
    let mounted = true;
    const fps = 18;
    const itv = setInterval(() => {
      if (!mounted) return;
      const r = Math.floor(Math.random() * pool.length);
      setText(pool[r]);
    }, 1000 / fps);
    const t = setTimeout(() => {
      if (!mounted) return;
      clearInterval(itv);
      setText(finalText);
      onDone?.();
    }, duration);
    return () => {
      mounted = false;
      clearInterval(itv);
      clearTimeout(t);
    };
  }, [finalText, pool, duration, onDone]);
  return (
    <Text
      style={{ fontSize: 28, fontWeight: "900", textAlign: "center" }}
      numberOfLines={1}
    >
      {text}
    </Text>
  );
};

const CountdownSplash = ({
  seconds = 3,
  onDone,
}: {
  seconds?: number;
  onDone?: () => void;
}) => {
  const [n, setN] = useState(seconds);
  useEffect(() => {
    let i = seconds;
    setN(i);
    const tick = setInterval(() => {
      i -= 1;
      setN(i);
      if (i <= 0) {
        clearInterval(tick);
        onDone?.();
      }
    }, 750);
    return () => clearInterval(tick);
  }, [seconds, onDone]);
  return (
    <View style={styles.overlayBackdrop}>
      <Text style={[styles.countdownText]}>{n > 0 ? n : "BẮT ĐẦU!"}</Text>
    </View>
  );
};

function RevealOverlay({
  open,
  mode,
  data,
  pool,
  onClose,
  autoCloseMs = 1200,
}: {
  open: boolean;
  mode: "group" | "ko";
  data: any;
  pool: string[];
  onClose?: () => void;
  autoCloseMs?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => onClose?.(), autoCloseMs);
    return () => clearTimeout(t);
  }, [open, onClose, autoCloseMs]);
  if (!open) return null;

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={onClose}
      style={styles.overlayBackdrop}
    >
      <View style={styles.overlayCard}>
        {mode === "group" ? (
          <>
            <Text style={styles.overlayHint}>BỐC VÀO BẢNG</Text>
            <View
              style={[
                styles.rowWrap,
                { justifyContent: "center", marginBottom: 8 },
              ]}
            >
              <ChipRN label={`Bảng ${data.groupCode}`} variant="primary" />
              <ChipRN
                label={`Slot ${Number(data.slotIndex) + 1}`}
                variant="primary"
              />
            </View>
            <Ticker finalText={data.teamName} pool={pool} />
          </>
        ) : (
          <>
            <Text style={styles.overlayHint}>CẶP ĐẤU</Text>
            <View style={{ gap: 8 }}>
              <Ticker finalText={data.AName} pool={pool} duration={900} />
              <Text
                style={{ textAlign: "center", fontSize: 26, fontWeight: "900" }}
              >
                VS
              </Text>
              <Ticker finalText={data.BName} pool={pool} duration={1100} />
            </View>
          </>
        )}
        <Text
          style={{
            opacity: 0.7,
            marginTop: 10,
            fontSize: 12,
            textAlign: "center",
          }}
        >
          Nhấn để đóng
        </Text>
      </View>
    </TouchableOpacity>
  );
}

/* ───────────────────── Bottom Sheet (NEW) ───────────────────── */
const SCREEN_HEIGHT = Dimensions.get("window").height;

function BottomSheet({
  open,
  onClose,
  children,
  heightPct = 0.85,
  title,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  heightPct?: number; // 0..1
  title?: string;
}) {
  const sheetHeight = Math.max(320, Math.round(SCREEN_HEIGHT * heightPct));
  const translateY = React.useRef(new Animated.Value(sheetHeight)).current;
  const [visible, setVisible] = React.useState(open);

  const close = React.useCallback(() => {
    Animated.timing(translateY, {
      toValue: sheetHeight,
      duration: 200,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start(() => {
      setVisible(false);
      onClose?.();
    });
  }, [onClose, sheetHeight, translateY]);

  React.useEffect(() => {
    if (open) {
      setVisible(true);
      Animated.timing(translateY, {
        toValue: 0,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else if (visible) {
      close();
    }
  }, [open, visible, close, translateY]);

  const responder = React.useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 4,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(Math.min(g.dy, sheetHeight));
      },
      onPanResponderRelease: (_, g) => {
        const shouldClose = g.vy > 1.2 || g.dy > sheetHeight * 0.28;
        Animated.timing(translateY, {
          toValue: shouldClose ? sheetHeight : 0,
          duration: 180,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }).start(() => {
          if (shouldClose) {
            setVisible(false);
            onClose?.();
          }
        });
      },
    })
  ).current;

  if (!visible) return null;

  return (
    <View style={styles.bsBackdrop}>
      <TouchableWithoutFeedback onPress={close}>
        <View style={styles.bsBackdropTouchable} />
      </TouchableWithoutFeedback>

      <Animated.View
        style={[
          styles.bsContainer,
          { height: sheetHeight, transform: [{ translateY }] },
        ]}
        {...responder.panHandlers}
      >
        <View style={styles.bsHandleWrap}>
          <View style={styles.bsHandle} />
        </View>
        {!!title && (
          <Text style={styles.bsTitle} numberOfLines={1}>
            {title}
          </Text>
        )}
        <ScrollView
          contentContainerStyle={{ paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

/* ───────────────────── Group Matches Sheet (NEW) ───────────────────── */
function GroupMatchesSheet({
  open,
  onClose,
  groupsMeta,
  regIndex,
  selBracketId,
  eventType,
}: {
  open: boolean;
  onClose: () => void;
  groupsMeta: any[];
  regIndex: Map<string, any>;
  selBracketId: string;
  eventType: "single" | "double";
}) {
  const [doubleRound, setDoubleRound] = useState(false);
  const [generateGroupMatches, { isLoading: genLoading }] =
    useGenerateGroupMatchesMutation();

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      heightPct={0.88}
      title="Bốc thăm trận trong bảng"
    >
      <View
        style={[styles.rowBetween, { marginBottom: 10, paddingHorizontal: 2 }]}
      >
        <Text style={{ fontWeight: "700" }}>Tự động (vòng tròn)</Text>
        <View style={styles.rowWrap}>
          <Text style={{ marginRight: 6 }}>Đánh 2 lượt</Text>
          <Switch value={doubleRound} onValueChange={setDoubleRound} />
        </View>
      </View>

      <RoundRobinPreview
        groupsMeta={groupsMeta}
        regIndex={regIndex}
        doubleRound={doubleRound}
        eventType={eventType}
      />

      <View style={{ height: 12 }} />
      <PrimaryBtn
        title={genLoading ? "Đang tạo…" : "Tạo trận"}
        onPress={async () => {
          try {
            if (!selBracketId) return;
            await generateGroupMatches({
              bracketId: selBracketId,
              mode: "auto",
              doubleRound,
            }).unwrap();
            Alert.alert("Thành công", "Đã tạo trận trong bảng.");
            onClose();
          } catch (e: any) {
            Alert.alert(
              "Lỗi",
              e?.data?.message || e?.error || "Tạo trận thất bại."
            );
          }
        }}
        full
      />
      <OutlineBtn title="Đóng" onPress={onClose} full />
    </BottomSheet>
  );
}

/* ───────────────────── MAIN ───────────────────── */
export default function DrawScreen() {
  const {
    id,
    bracketId: qsBracketId,
    round: qsRound,
  } = useLocalSearchParams<{
    id: string;
    bracketId?: string;
    round?: string;
  }>();
  const router = useRouter();

  const { userInfo } = useSelector((s: any) => s.auth || {});
  const isAdmin = String(userInfo?.role || "").toLowerCase() === "admin";

  const tourId = String(id || "");
  const preselectBracket = String(qsBracketId || "");
  const preselectRound = qsRound ? String(qsRound) : null;

  /* Queries */
  const {
    data: tournament,
    isLoading: lt,
    error: et,
  } = useGetTournamentQuery(tourId);
  const {
    data: brackets = [],
    isLoading: lb,
    error: eb,
  } = useListTournamentBracketsQuery(tourId);
  const { data: allMatches = [], isLoading: lMatches } =
    useListTournamentMatchesQuery({ tournamentId: tourId });

  const [selBracketId, setSelBracketId] = useState<string>(preselectBracket);

  const { data: bracketDetail, refetch: refetchBracket } = useGetBracketQuery(
    selBracketId,
    { skip: !selBracketId }
  );
  const { data: drawStatus, isLoading: ls } = useGetDrawStatusQuery(
    selBracketId,
    { skip: !selBracketId }
  );

  const { data: regsData, isLoading: lRegs } = useGetRegistrationsQuery(
    tourId,
    { skip: !tourId }
  );

  const [startDraw, { isLoading: starting }] = useStartDrawMutation();
  const [drawNext, { isLoading: revealing }] = useDrawNextMutation();
  const [drawCommit, { isLoading: committing }] = useDrawCommitMutation();
  const [drawCancel, { isLoading: canceling }] = useDrawCancelMutation();

  const socket = useSocket();

  /* Derives */
  const evType = normType(tournament?.eventType) as "single" | "double";

  const drawType = useMemo(() => {
    const b = brackets.find((x: any) => String(x._id) === String(selBracketId));
    if (!b) return "knockout";
    const t = String(b.type || "").toLowerCase();
    if (["group", "gsl", "swiss"].includes(t)) return "group";
    if (t === "roundelim") return "po";
    return "knockout";
  }, [brackets, selBracketId]);

  const regIndex = useMemo(() => {
    const m = new Map<string, any>();
    const push = (r: any) => r && m.set(idOf(r._id), r);
    const d: any = regsData;
    if (!d) return m;
    if (Array.isArray(d)) d.forEach(push);
    if (Array.isArray(d?.list)) d.list.forEach(push);
    if (Array.isArray(d?.registrations)) d.registrations.forEach(push);
    return m;
  }, [regsData]);

  const regCount = useMemo(() => {
    const d: any = regsData;
    if (!d) return 0;
    if (Array.isArray(d)) return d.length;
    if (Array.isArray(d?.list)) return d.list.length;
    if (Array.isArray(d?.registrations)) return d.registrations.length;
    return Number(d?.total || 0);
  }, [regsData]);

  const koEntrantSize = useMemo(() => {
    const b: any = brackets.find(
      (x: any) => String(x._id) === String(selBracketId)
    );
    const prefillPairsLen =
      Number(
        (bracketDetail?.prefill?.pairs && bracketDetail.prefill.pairs.length) ||
          (b?.prefill?.pairs && b.prefill.pairs.length) ||
          0
      ) || 0;
    if (prefillPairsLen > 0) return nextPow2(prefillPairsLen * 2);

    const startKey =
      b?.ko?.startKey ||
      b?.prefill?.roundKey ||
      bracketDetail?.ko?.startKey ||
      bracketDetail?.prefill?.roundKey ||
      b?.meta?.startKey;
    const fromKey = startKey ? sizeFromRoundCode(startKey) : 0;
    if (fromKey >= 2) return nextPow2(fromKey);

    const nums = [
      b?.ko?.startSize,
      bracketDetail?.ko?.startSize,
      b?.meta?.firstRoundSize,
      b?.qualifiers,
      b?.meta?.qualifiers,
      b?.maxSlots,
      b?.capacity,
      b?.size,
      b?.drawScale,
      b?.meta?.drawSize,
    ]
      .map((x: any) => Number(x))
      .filter((n: number) => Number.isFinite(n) && n >= 2);

    if (nums.length) return nextPow2(Math.min(...nums));
    return nextPow2(regCount || 2);
  }, [brackets, bracketDetail, selBracketId, regCount]);

  const knockoutOptions = useMemo(() => {
    const b: any = brackets.find(
      (x: any) => String(x._id) === String(selBracketId)
    );
    if (!b) return buildKnockoutOptions(koEntrantSize);
    if (drawType === "po") {
      const pairs1 =
        Number(bracketDetail?.meta?.expectedFirstRoundMatches) ||
        Number(b?.meta?.expectedFirstRoundMatches) ||
        (Array.isArray(bracketDetail?.prefill?.seeds)
          ? bracketDetail.prefill.seeds.length
          : 0) ||
        (Array.isArray(b?.prefill?.seeds) ? b.prefill.seeds.length : 0) ||
        Math.max(1, Math.floor((Number(regCount) || 0) / 2));

      const maxRounds =
        Number(bracketDetail?.meta?.maxRounds) ||
        Number(b?.meta?.maxRounds) ||
        Number(bracketDetail?.ko?.rounds) ||
        Number(b?.ko?.rounds) ||
        Math.max(1, Math.ceil(Math.log2(Math.max(1, pairs1))));

      const out: any[] = [];
      let pairs = pairs1;
      for (let r = 1; r <= maxRounds; r++) {
        const teams = Math.max(2, pairs * 2);
        out.push({
          code: `R${teams}`,
          label: `Vòng ${r}`,
          roundNumber: r,
          pairCount: pairs,
        });
        pairs = Math.floor(pairs / 2);
        if (pairs <= 0) break;
      }
      return out;
    }
    return buildKnockoutOptions(koEntrantSize);
  }, [
    drawType,
    brackets,
    bracketDetail,
    regCount,
    koEntrantSize,
    selBracketId,
  ]);

  const firstRoundCode = useMemo(() => {
    if (!knockoutOptions?.length) return "F";
    return knockoutOptions.reduce((best: any, cur: any) => {
      const sb = sizeFromRoundCode(best.code);
      const sc = sizeFromRoundCode(cur.code);
      return sc > sb ? cur : best;
    }).code;
  }, [knockoutOptions]);

  const [roundCode, setRoundCode] = useState<string | null>(preselectRound);
  const [roundTouched, setRoundTouched] = useState(Boolean(preselectRound));
  const [usePrevWinners, setUsePrevWinners] = useState(false);

  useEffect(() => {
    if (!selBracketId) return;
    setRoundTouched(false);
    setRoundCode(null);
  }, [selBracketId, drawType]);

  useEffect(() => {
    if (!selBracketId) return;
    if (!(drawType === "knockout" || drawType === "po")) return;
    if (roundTouched) return;
    if (!roundCode && firstRoundCode) setRoundCode(firstRoundCode);
  }, [selBracketId, drawType, firstRoundCode, roundTouched, roundCode]);

  /* Draw session state */
  const [drawId, setDrawId] = useState<string | null>(null);
  const [state, setState] = useState<
    "idle" | "running" | "committed" | "canceled"
  >("idle");
  const [reveals, setReveals] = useState<any[]>([]);
  const [planned, setPlanned] = useState<any>(null);
  const [log, setLog] = useState<any[]>([]);
  const [showCountdown, setShowCountdown] = useState(false);
  const [fxEnabled, setFxEnabled] = useState(true);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [overlayMode, setOverlayMode] = useState<"group" | "ko">("group");
  const [overlayData, setOverlayData] = useState<any>(null);
  const [lastHighlight, setLastHighlight] = useState<any>(null);

  /* Names pool for ticker */
  const namesPool = useMemo(() => {
    const arr: string[] = [];
    regIndex?.forEach((reg) => arr.push(safePairName(reg, evType)));
    if (!arr.length) return ["—", "—", "—", "—"];
    return arr;
  }, [regIndex, evType]);

  /* Apply drawStatus */
  useEffect(() => {
    if (!drawStatus) return;
    const s = (drawStatus as any).state || "idle";
    if (s === "running") {
      setDrawId((drawStatus as any).drawId || null);
      setState("running");
      setReveals(
        Array.isArray((drawStatus as any).reveals)
          ? (drawStatus as any).reveals
          : []
      );
    } else if (s === "canceled") {
      setDrawId(null);
      setState("idle");
      setReveals([]);
    } else {
      setDrawId(null);
      setState(s);
      setReveals([]);
    }
  }, [drawStatus]);

  /* planned via socket per bracket */
  useEffect(() => {
    if (!socket || !selBracketId) return;
    socket.emit("draw:join", { bracketId: selBracketId });
    const onPlanned = (payload: any) => {
      setPlanned(payload);
      setLog((lg) => lg.concat([{ t: Date.now(), type: "planned" }]));
    };
    socket.on("draw:planned", onPlanned);
    return () => {
      socket.off("draw:planned", onPlanned);
      socket.emit("draw:leave", { bracketId: selBracketId });
    };
  }, [socket, selBracketId]);

  /* updates via socket per drawId */
  useEffect(() => {
    if (!socket || !drawId) return;
    socket.emit("draw:join", { drawId });
    const onUpdate = (payload: any) => {
      if (payload?.state) setState(payload.state);
      if (Array.isArray(payload?.reveals)) setReveals(payload.reveals);
      setLog((lg) => lg.concat([{ t: Date.now(), type: "update" }]));
    };
    const onRevealed = (payload: any) => {
      if (Array.isArray(payload?.reveals)) setReveals(payload.reveals);
      setLog((lg) => lg.concat([{ t: Date.now(), type: "reveal" }]));
    };
    const onCommitted = () => {
      setState("committed");
      setLog((lg) => lg.concat([{ t: Date.now(), type: "commit" }]));
      refetchBracket?.();
    };
    const onCanceled = () => {
      setState("canceled");
      setReveals([]);
      setDrawId(null);
      setLog((lg) => lg.concat([{ t: Date.now(), type: "cancel" }]));
    };
    socket.on("draw:update", onUpdate);
    socket.on("draw:revealed", onRevealed);
    socket.on("draw:committed", onCommitted);
    socket.on("draw:canceled", onCanceled);
    return () => {
      socket.off("draw:update", onUpdate);
      socket.off("draw:revealed", onRevealed);
      socket.off("draw:committed", onCommitted);
      socket.off("draw:canceled", onCanceled);
      socket.emit("draw:leave", { drawId });
    };
  }, [socket, drawId, refetchBracket]);

  /* Reset per bracket / round change */
  useEffect(() => {
    if (!selBracketId) return;
    setDrawId(null);
    setState("idle");
    setReveals([]);
    setPlanned(null);
    setLog([]);
  }, [selBracketId]);
  useEffect(() => {
    if (!(drawType === "knockout" || drawType === "po")) return;
    setDrawId(null);
    setState("idle");
    setReveals([]);
    setPlanned(null);
    setLog([]);
  }, [drawType, roundCode]);

  /* Groups derived */
  const groupsRaw = useMemo(
    () =>
      (bracketDetail as any)?.groups ||
      (brackets.find((b: any) => String(b._id) === String(selBracketId)) as any)
        ?.groups ||
      [],
    [bracketDetail, brackets, selBracketId]
  );

  const plannedGroupsMeta = useMemo(() => {
    if (drawType !== "group") return [];
    const sizes =
      (planned as any)?.planned?.groupSizes ||
      (planned as any)?.groupSizes ||
      (Array.isArray((planned as any)?.groups)
        ? (planned as any).groups.map((g: any) => g.size)
        : []);
    if (!Array.isArray(sizes) || sizes.length === 0) return [];
    return sizes.map((size: number, idx: number) => ({
      code: String.fromCharCode(65 + idx),
      size: Number(size) || 0,
      regIds: [],
    }));
  }, [drawType, planned]);

  const groupsMeta = useMemo(() => {
    const persisted = (groupsRaw || [])
      .slice()
      .sort((a: any, b: any) =>
        String(a.name || a.code || "").localeCompare(
          String(b.name || b.code || ""),
          "vi",
          {
            numeric: true,
            sensitivity: "base",
          }
        )
      )
      .map((g: any, idx: number) => ({
        code: g.name || g.code || String.fromCharCode(65 + idx),
        size: Array.isArray(g.regIds) ? g.regIds.length : Number(g.size) || 0,
        regIds: Array.isArray(g.regIds) ? g.regIds : [],
      }));

    const persistedFilled = persisted.some(
      (g) => g.size > 0 || (g.regIds && g.regIds.length)
    );
    if (state === "running" && plannedGroupsMeta.length)
      return plannedGroupsMeta;
    if (persistedFilled) return persisted;
    if (plannedGroupsMeta.length) return plannedGroupsMeta;
    return persisted;
  }, [groupsRaw, state, plannedGroupsMeta]);

  const hasGroups = useMemo(() => (groupsMeta?.length || 0) > 0, [groupsMeta]);

  const selectedRoundNumber = useMemo(() => {
    const opt = knockoutOptions.find((o: any) => o.code === roundCode);
    return opt?.roundNumber ?? 1;
  }, [knockoutOptions, roundCode]);

  const koMatchesThisBracket = useMemo(
    () =>
      (allMatches as any[]).filter(
        (m: any) =>
          String(m.bracket?._id || m.bracket) === String(selBracketId) &&
          String(
            (
              brackets.find(
                (b: any) => String(b._id) === String(selBracketId)
              ) || {}
            )?.type || ""
          ).toLowerCase() !== "group"
      ),
    [allMatches, selBracketId, brackets]
  );

  const koPairsPersisted = useMemo(() => {
    const ms = koMatchesThisBracket
      .filter((m: any) => (m.round || 1) === selectedRoundNumber)
      .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
    return ms.map((m: any) => ({
      AName: m.pairA
        ? safePairName(m.pairA, evType)
        : (m.previousA &&
            `Winner of R${m.previousA.round ?? "?"} #${
              (m.previousA.order ?? 0) + 1
            }`) ||
          "—",
      BName: m.pairB
        ? safePairName(m.pairB, evType)
        : (m.previousB &&
            `Winner of R${m.previousB.round ?? "?"} #${
              (m.previousB.order ?? 0) + 1
            }`) ||
          "—",
    }));
  }, [koMatchesThisBracket, selectedRoundNumber, evType]);

  const revealsForKO = useMemo(() => {
    if (state === "running" && Array.isArray(reveals) && reveals.length)
      return reveals;
    return koPairsPersisted;
  }, [state, reveals, koPairsPersisted]);

  const revealsForGroup = useMemo(() => {
    if (state === "running" && Array.isArray(reveals) && reveals.length)
      return reveals;
    const out: any[] = [];
    (groupsMeta || []).forEach((g: any) => {
      const ids = Array.isArray(g.regIds) ? g.regIds : [];
      ids.forEach((ridRaw: any) => {
        const rid = asId(ridRaw);
        out.push({ group: g.code, groupCode: g.code, regId: rid });
      });
    });
    return out;
  }, [state, reveals, groupsMeta]);

  /* FX triggers on reveal */
  const prevRevealsRef = useRef<any[]>([]);
  useEffect(() => {
    if (!fxEnabled || state !== "running" || !Array.isArray(reveals)) {
      prevRevealsRef.current = reveals || [];
      return;
    }
    let hit: any = null;
    const prev = prevRevealsRef.current || [];
    const n = Math.max(prev.length, reveals.length);
    for (let i = 0; i < n; i++) {
      const p: any = prev[i] || {};
      const c: any = reveals[i] || {};
      const pA = p?.AName || p?.A || null;
      const pB = p?.BName || p?.B || null;
      const cA = c?.AName || c?.A || null;
      const cB = c?.BName || c?.B || null;
      const newA = cA && !pA;
      const newB = cB && !pB;
      if (newA || newB) {
        if (drawType === "group") {
          const key =
            c.groupCode ||
            c.groupKey ||
            (typeof c.group === "string" ? c.group : "");
          const slotIndex = reveals
            .slice(0, i)
            .filter(
              (x: any) => (x.groupCode || x.groupKey || x.group) === key
            ).length;
          const teamName = c.teamName || c.name || c.displayName || "—";
          setOverlayMode("group");
          setOverlayData({ groupCode: key, slotIndex, teamName });
          setOverlayOpen(true);
          setTimeout(
            () =>
              setLastHighlight({ type: "group", groupCode: key, slotIndex }),
            1200
          );
        } else {
          hit = { AName: cA || "—", BName: cB || "—" };
        }
        break;
      }
    }
    if (hit && drawType !== "group") {
      setOverlayMode("ko");
      setOverlayData(hit);
      setOverlayOpen(true);
    }
    prevRevealsRef.current = reveals;
  }, [reveals, drawType, state, fxEnabled]);

  useEffect(() => {
    if (!lastHighlight) return;
    const t = setTimeout(() => setLastHighlight(null), 2200);
    return () => clearTimeout(t);
  }, [lastHighlight]);

  /* Actions */
  const canOperate = Boolean(drawId && state === "running");
  const onStart = async () => {
    if (!selBracketId) return;
    try {
      const body =
        drawType === "group"
          ? { mode: "group" }
          : {
              mode: drawType === "po" ? "po" : "knockout",
              round: roundCode || firstRoundCode,
              ...(drawType === "knockout" ? { usePrevWinners } : {}),
            };
      const resp = await startDraw({ bracketId: selBracketId, body }).unwrap();
      setDrawId(resp?.drawId);
      setState(resp?.state || "running");
      setReveals(Array.isArray(resp?.reveals) ? resp.reveals : []);
      if (resp?.planned) setPlanned(resp);
      setLog((lg) => lg.concat([{ t: Date.now(), type: "start" }]));
      if (fxEnabled) setShowCountdown(true);
    } catch (e: any) {
      Alert.alert(
        "Lỗi",
        e?.data?.message || e?.error || "Có lỗi khi bắt đầu bốc thăm."
      );
      setLog((lg) => lg.concat([{ t: Date.now(), type: "error:start" }]));
    }
  };
  const onReveal = async () => {
    if (!canOperate) return;
    try {
      await drawNext({ drawId }).unwrap();
    } catch (e: any) {
      Alert.alert("Lỗi", e?.data?.message || e?.error || "Reveal thất bại");
      setLog((lg) => lg.concat([{ t: Date.now(), type: "error:reveal" }]));
    }
  };
  const onCommit = async () => {
    if (!canOperate) return;
    try {
      await drawCommit({ drawId }).unwrap();
    } catch (e: any) {
      Alert.alert("Lỗi", e?.data?.message || e?.error || "Commit thất bại");
      setLog((lg) => lg.concat([{ t: Date.now(), type: "error:commit" }]));
    }
  };
  const onCancel = async () => {
    if (!drawId) return;
    try {
      await drawCancel({ drawId }).unwrap();
      setDrawId(null);
      setState("idle");
      setReveals([]);
      Alert.alert("Đã huỷ", "Bạn có thể bắt đầu phiên mới.");
      setLog((lg) => lg.concat([{ t: Date.now(), type: "cancel" }]));
    } catch (e: any) {
      Alert.alert("Lỗi", e?.data?.message || e?.error || "Huỷ phiên thất bại");
      setLog((lg) => lg.concat([{ t: Date.now(), type: "error:cancel" }]));
    }
  };

  /* KO rounds view data */
  const roundsForKO = useMemo(
    () =>
      buildRoundsForKO({
        roundCode: roundCode || firstRoundCode,
        reveals: state === "running" ? revealsForKO : [],
        matches: koMatchesThisBracket,
        eventType: evType,
        selectedRoundNumber,
        selBracketId,
        bracket: brackets.find(
          (b: any) => String(b._id) === String(selBracketId)
        ),
        bracketDetail,
        isPO: drawType === "po",
      }),
    [
      roundCode,
      firstRoundCode,
      state,
      revealsForKO,
      koMatchesThisBracket,
      evType,
      selectedRoundNumber,
      selBracketId,
      brackets,
      bracketDetail,
      drawType,
    ]
  );

  // ⚠️ đổi sang bottom sheet
  const [openGroupSheet, setOpenGroupSheet] = useState(false);

  /* Guards */
  if (!isAdmin) {
    return (
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: 24 }]}
      >
        <View style={[styles.errorBox, { marginTop: 12 }]}>
          <Text style={styles.errorText}>
            Chỉ quản trị viên mới truy cập trang bốc thăm.
          </Text>
        </View>
      </ScrollView>
    );
  }
  if (lt || lb || ls || lRegs || lMatches) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  if (et || eb) {
    return (
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: 24 }]}
      >
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>
            {((et as any)?.data?.message ||
              (et as any)?.error ||
              (eb as any)?.data?.message ||
              (eb as any)?.error) ??
              "Lỗi tải dữ liệu."}
          </Text>
        </View>
      </ScrollView>
    );
  }

  /* UI */
  const bracketOptions = [
    { _id: "", name: "— Chọn Bracket —", type: "" },
  ].concat(brackets as any[]);
  const roundOptions =
    selBracketId && (drawType === "knockout" || drawType === "po")
      ? knockoutOptions
      : [];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Header */}
      <View style={styles.rowWrap}>
        <Text style={[styles.title, { flex: 1 }]}>
          Bốc thăm • {tournament?.name}
        </Text>
        {state !== "idle" && (
          <ChipRN
            label={state}
            variant={
              state === "running"
                ? "warning"
                : state === "committed"
                ? "success"
                : "neutral"
            }
          />
        )}
      </View>

      <View style={[styles.card, { gap: 10 }]}>
        <View style={styles.infoBox}>
          <Text>
            Chỉ admin mới thấy trang này. Thể loại giải:{" "}
            <Text style={{ fontWeight: "900" }}>
              {String(tournament?.eventType || "").toUpperCase()}
            </Text>
          </Text>
        </View>

        {/* Selects */}
        <ModalSelect
          label="Chọn Bracket"
          value={selBracketId}
          options={bracketOptions}
          getLabel={(b: any) =>
            b?._id
              ? `${b?.name} — ${String(b?.type || "").toUpperCase()}`
              : b.name
          }
          getValue={(b: any) => String(b?._id ?? "")}
          onChange={(v) => setSelBracketId(v)}
        />

        {selBracketId && (drawType === "knockout" || drawType === "po") && (
          <ModalSelect
            label="Vòng cần bốc"
            value={roundCode || ""}
            options={roundOptions}
            getLabel={(r: any) => r?.label}
            getValue={(r: any) => r?.code}
            onChange={(v) => {
              setRoundTouched(true);
              setRoundCode(v);
            }}
          />
        )}

        {selBracketId && drawType === "knockout" && (
          <View style={styles.rowBetween}>
            <Text>Lấy đội thắng ở vòng trước</Text>
            <Switch value={usePrevWinners} onValueChange={setUsePrevWinners} />
          </View>
        )}

        {/* Action buttons */}
        <View style={styles.rowWrap}>
          <PrimaryBtn
            title={starting ? "Đang bắt đầu…" : "Bắt đầu bốc"}
            onPress={onStart}
            disabled={!selBracketId || starting || state === "running"}
          />
          <OutlineBtn
            title={revealing ? "Đang reveal…" : "Reveal tiếp"}
            onPress={onReveal}
          />
          <PrimaryBtn
            title={committing ? "Đang ghi…" : "Ghi kết quả (Commit)"}
            onPress={onCommit}
            disabled={!canOperate || committing}
            color="#2e7d32"
          />
          <OutlineBtn
            title={canceling ? "Đang huỷ…" : "Huỷ phiên"}
            onPress={onCancel}
          />
        </View>

        {/* FX toggles */}
        <View style={styles.rowBetween}>
          <Text>Hiệu ứng</Text>
          <Switch value={fxEnabled} onValueChange={setFxEnabled} />
        </View>
      </View>

      {/* Reveal Board */}
      <View style={[styles.card, { gap: 10 }]}>
        <Text style={{ fontWeight: "800" }}>Kết quả bốc (reveal)</Text>

        {!selBracketId ? (
          <View style={styles.infoBox}>
            <Text>Hãy chọn một Bracket để bắt đầu.</Text>
          </View>
        ) : drawType === "group" ? (
          hasGroups ? (
            <GroupSeatingBoard
              groupsMeta={groupsMeta}
              reveals={revealsForGroup}
              regIndex={regIndex}
              eventType={evType}
              lastHighlight={lastHighlight}
            />
          ) : (
            <Text style={{ color: "#666" }}>
              Chưa có thông tin bảng/slot để hiển thị.
            </Text>
          )
        ) : (
          <View style={{ gap: 10 }}>
            {roundsForKO.map((round: any, idx: number) => (
              <View
                key={`${idx}-${round.title}`}
                style={[styles.card, { backgroundColor: "#fafafa" }]}
              >
                <Text style={{ fontWeight: "800", marginBottom: 6 }}>
                  {round.title}
                </Text>
                {round.seeds.map((sd: any, i: number) => (
                  <View key={sd.id || i} style={styles.seedRow}>
                    <Text style={[styles.seedNo]}>{i + 1}.</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.teamLine} numberOfLines={2}>
                        {sd.teams?.[0]?.name || "Chưa có đội"}
                      </Text>
                      <Text style={styles.teamLine} numberOfLines={2}>
                        {sd.teams?.[1]?.name || "Chưa có đội"}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Quick links & group actions */}
      <View style={[styles.card, { gap: 8 }]}>
        <Text style={{ fontWeight: "800" }}>Liên kết nhanh</Text>
        <OutlineBtn
          title="Xem sơ đồ giải"
          onPress={() => {
            router.push({
              pathname: "/tournament/[id]/bracket",
              params: { id: tourId },
            });
          }}
          full
        />
        {selBracketId && (
          <OutlineBtn
            title="Mở Bracket đang bốc"
            onPress={() =>
              router.push({
                pathname: "/tournament/[id]/bracket",
                params: {
                  id: tourId,
                  tab: Math.max(
                    0,
                    (brackets as any[]).findIndex(
                      (b) => String(b._id) === String(selBracketId)
                    )
                  ),
                },
              })
            }
            full
          />
        )}

        {selBracketId && drawType === "group" && hasGroups && (
          <PrimaryBtn
            title="Bốc thăm trận trong bảng"
            onPress={() => setOpenGroupSheet(true)}
            full
          />
        )}

        {!!planned && (
          <View
            style={{
              marginTop: 10,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: "#e0e0e0",
              paddingTop: 8,
            }}
          >
            <Text style={{ fontWeight: "800" }}>Kế hoạch (planned)</Text>
            {(planned as any)?.planned?.groupSizes && (
              <Text>
                Group sizes:{" "}
                {JSON.stringify((planned as any).planned.groupSizes)}
              </Text>
            )}
            {Number.isFinite((planned as any)?.planned?.byes) && (
              <Text>Byes: {(planned as any).planned.byes}</Text>
            )}
          </View>
        )}

        {!!log.length && (
          <View
            style={{
              marginTop: 10,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: "#e0e0e0",
              paddingTop: 8,
            }}
          >
            <Text style={{ fontWeight: "800", marginBottom: 4 }}>Log</Text>
            <View style={{ maxHeight: 220 }}>
              {log
                .slice(-80)
                .reverse()
                .map((row, i) => (
                  <Text key={i} style={{ fontSize: 12 }}>
                    • {row.type} @ {new Date(row.t).toLocaleTimeString()}
                  </Text>
                ))}
            </View>
          </View>
        )}
      </View>

      {/* Bottom sheet & overlays */}
      <GroupMatchesSheet
        open={openGroupSheet}
        onClose={() => setOpenGroupSheet(false)}
        groupsMeta={groupsMeta}
        regIndex={regIndex}
        selBracketId={selBracketId}
        eventType={evType}
      />

      {fxEnabled && showCountdown && (
        <CountdownSplash seconds={3} onDone={() => setShowCountdown(false)} />
      )}
      {fxEnabled && overlayOpen && overlayData && (
        <RevealOverlay
          open={overlayOpen}
          mode={overlayMode}
          data={overlayData}
          pool={namesPool}
          onClose={() => setOverlayOpen(false)}
        />
      )}
    </ScrollView>
  );
}

/* ───────────────────── styles ───────────────────── */
const styles = StyleSheet.create({
  container: { padding: 16, gap: 12, backgroundColor: "#fafafa" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "800" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e6e8ef",
    padding: 12,
  },
  rowWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  btn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 120,
  },
  btnText: { color: "#fff", fontWeight: "800" },
  btnOutline: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#1976d2",
  },
  btnOutlineText: { color: "#1976d2", fontWeight: "800" },

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
  },

  selectBox: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    padding: 10,
  },
  selectLabel: { fontSize: 12, color: "#666" },
  selectValue: { fontSize: 15, fontWeight: "700" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalSheet: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    width: "88%",
    maxWidth: 520,
    gap: 10,
  },
  sheetTitle: { fontWeight: "800", fontSize: 16 },
  sheetItem: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eee",
  },

  slotItem: {
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },

  seedRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eceff1",
  },
  seedNo: {
    width: 22,
    textAlign: "right",
    fontWeight: "700",
    color: "#455a64",
  },
  teamLine: { fontSize: 13, lineHeight: 18, color: "#111" },

  overlayBackdrop: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.75)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  overlayCard: {
    width: "92%",
    maxWidth: 620,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 18,
    padding: 16,
  },
  overlayHint: {
    color: "#fff",
    opacity: 0.9,
    textAlign: "center",
    marginBottom: 8,
    letterSpacing: 1,
  },
  countdownText: { color: "#fff", fontSize: 64, fontWeight: "900" },

  /* BottomSheet styles */
  bsBackdrop: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  bsBackdropTouchable: { flex: 1 },
  bsContainer: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 12,
    paddingTop: 6,
  },
  bsHandleWrap: { alignItems: "center", paddingVertical: 6 },
  bsHandle: {
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#D1D5DB",
  },
  bsTitle: {
    fontSize: 16,
    fontWeight: "800",
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
});
