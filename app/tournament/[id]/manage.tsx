// app/(app)/admin/tournament/[id]/ManageScreen.jsx
import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
  memo,
} from "react";
import {
  ActivityIndicator,
  Alert as RNAlert,
  FlatList,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  ScrollView,
  Animated,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { Stack, useLocalSearchParams, router } from "expo-router";
import { useSelector } from "react-redux";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
// Export/Share
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";
import { BlurView } from "expo-blur";
import {
  useGetTournamentQuery,
  useAdminGetBracketsQuery,
  useAdminListMatchesByTournamentQuery,
  useAdminSetMatchLiveUrlMutation,
  useAdminBatchSetMatchLiveUrlMutation,
} from "@/slices/tournamentsApiSlice";

import {
  useBatchAssignRefereeMutation,
  useListTournamentRefereesQuery,
} from "@/slices/refereeScopeApiSlice";

import ResponsiveMatchViewer from "@/components/match/ResponsiveMatchViewer";
import { useSocket } from "@/context/SocketContext";

// Sheets có sẵn
import ManageRefereesSheet from "@/components/sheets/ManageRefereesSheet";
import AssignCourtSheet from "@/components/sheets/AssignCourtSheet";
import AssignRefSheet from "@/components/sheets/AssignRefSheet";
import CourtManagerSheet from "@/components/sheets/CourtManagerSheet";
import LiveSetupSheet from "@/components/sheets/LiveSetupSheet";
import BatchAssignRefModal from "@/components/sheets/BatchAssignRefModal";

/* ---------------- helpers ---------------- */
// ✅ Chuẩn hóa groupCode: A→1, B→2, C→3, D→4
const normalizeGroupCode = (code) => {
  const s = String(code || "")
    .trim()
    .toUpperCase();
  if (!s) return "";
  if (/^\d+$/.test(s)) return s; // Đã là số
  if (/^[A-Z]$/.test(s)) return String(s.charCodeAt(0) - 64); // A=1, B=2,...
  return s;
};

// ✅ Tính trạng thái hoàn thành của các bảng
const computeGroupCompletionStatus = (allMatches) => {
  const groupStatusMap = new Map(); // key: `${stage}_${groupCode}` → boolean

  for (const m of allMatches) {
    // Chỉ xử lý trận vòng bảng
    if (m.format !== "group") continue;

    const stage = m.stageIndex ?? 1;
    const rawGroupCode = String(m.pool?.name || m.groupCode || "").trim();

    if (!rawGroupCode) continue;

    const groupCode = normalizeGroupCode(rawGroupCode);
    const key = `${stage}_${groupCode}`;

    const st = String(m?.status || "").toLowerCase();
    const isDone = st === "finished";

    if (!groupStatusMap.has(key)) {
      groupStatusMap.set(key, true); // Giả định xong
    }
    if (!isDone) {
      groupStatusMap.set(key, false); // Có trận chưa xong
    }
  }

  // Chuyển Map → object
  const result = {};
  for (const [key, isFinished] of groupStatusMap.entries()) {
    result[key] = isFinished;
  }

  return result;
};

// ✅ Kiểm tra trận KO có được hiển thị không
const canShowKOMatch = (m, groupStatusMap) => {
  if (m.format !== "knockout") return true;

  // Lấy seed từ match
  const seedA = m.seedA;
  const seedB = m.seedB;

  if (!seedA && !seedB) return true;

  const sourceGroups = new Set();

  // Check seed A
  if (seedA?.type === "groupRank") {
    const stage = seedA.ref?.stage || m.stageIndex || 1;
    const rawGroupCode = String(seedA.ref?.groupCode || "").trim();
    if (rawGroupCode) {
      const groupCode = normalizeGroupCode(rawGroupCode);
      sourceGroups.add(`${stage}_${groupCode}`);
    }
  }

  // Check seed B
  if (seedB?.type === "groupRank") {
    const stage = seedB.ref?.stage || m.stageIndex || 1;
    const rawGroupCode = String(seedB.ref?.groupCode || "").trim();
    if (rawGroupCode) {
      const groupCode = normalizeGroupCode(rawGroupCode);
      sourceGroups.add(`${stage}_${groupCode}`);
    }
  }

  if (sourceGroups.size === 0) return true; // Không phụ thuộc bảng nào

  // Kiểm tra tất cả các bảng nguồn
  for (const groupKey of sourceGroups) {
    const isFinished = groupStatusMap[groupKey];
    if (isFinished !== true) {
      return false; // Có bảng chưa xong → ẨN trận này
    }
  }

  return true; // Tất cả bảng nguồn đã xong → HIỆN
};

/* ---------------- helpers ---------------- */
// Helper hiển thị vòng/bảng đẹp
const getRoundText = (m) => {
  if (!m) return "—";

  // Có roundName/phase → ưu tiên
  if (m.roundName) return m.roundName;
  if (m.phase) return m.phase;

  // Format = group (vòng bảng)
  if (m.format === "group") {
    // Có tên bảng
    const poolName = m.pool?.name || m.groupCode;
    if (poolName) {
      const trimmed = String(poolName).trim();
      // Nếu là số → "Bảng 1", "Bảng 2"
      if (/^\d+$/.test(trimmed)) {
        return `Bảng ${trimmed}`;
      }
      // Nếu là chữ → "Bảng A", "Bảng B"
      return `Bảng ${trimmed.toUpperCase()}`;
    }

    // Có rrRound → "Vòng bảng - Lượt X"
    if (Number.isFinite(m.rrRound)) {
      return `Vòng bảng - Lượt ${m.rrRound + 1}`;
    }

    // Không có gì → "Vòng bảng"
    return "Vòng bảng";
  }

  // Format = swiss
  if (Number.isFinite(m.swissRound)) {
    return `Swiss - Vòng ${m.swissRound + 1}`;
  }

  // Format = knockout/roundElim
  if (Number.isFinite(m.round)) {
    if (m.format === "knockout" || m.format === "roundElim") {
      const roundNames = {
        1: "Vòng 1/16",
        2: "Vòng 1/8",
        3: "Tứ kết",
        4: "Bán kết",
        5: "Chung kết",
      };
      return roundNames[m.round] || `Vòng ${m.round}`;
    }
    return `Vòng ${m.round}`;
  }

  return "—";
};

const TYPE_LABEL = (t) => {
  const key = String(t || "").toLowerCase();
  if (key === "group") return "Vòng bảng";
  if (key === "po" || key === "playoff") return "Playoff";
  if (key === "knockout" || key === "ko") return "Knockout";
  if (key === "double_elim" || key === "doubleelim") return "Double Elim";
  if (key === "roundelim" || key === "round_elim" || key === "round-elim")
    return "Round Elim";
  if (key === "swiss") return "Swiss";
  if (key === "gsl") return "GSL";
  return t || "Khác";
};
const personNickname = (p) =>
  p?.nickName || p?.nickname || p?.displayName || p?.fullName || p?.name || "—";
const playerName = personNickname;

const pairLabel = (pair) => {
  if (!pair) return "—";
  if (pair.name) return pair.name;
  const ps = [pair.player1, pair.player2].filter(Boolean).map(playerName);
  return ps.join(" / ") || "—";
};
const matchCode = (m) => m?.code || `R${m?.round ?? "?"}-${m?.order ?? "?"}`;

const pairIdOf = (p) => {
  if (!p) return "";
  if (typeof p === "string") return p;
  if (typeof p === "number") return String(p);
  return (
    p._id ||
    p.id ||
    p.pairId ||
    (p.player1?._id && p.player2?._id
      ? `${p.player1._id}__${p.player2._id}`
      : "")
  );
};

const scoreText = (m) => {
  if (typeof m?.scoreText === "string" && m.scoreText.trim())
    return m.scoreText;
  const arr =
    (Array.isArray(m?.gameScores) && m.gameScores) ||
    (Array.isArray(m?.sets) && m.sets) ||
    (Array.isArray(m?.scores) && m.scores) ||
    [];
  if (!arr.length) return "";
  return arr
    .map((s) => `${s?.a ?? s?.home ?? 0}-${s?.b ?? s?.away ?? 0}`)
    .join(", ");
};
const courtNameOf = (m) =>
  (typeof m?.court?.name === "string" && m.court.name) ||
  (typeof m?.courtLabel === "string" && m.courtLabel) ||
  (typeof m?.courtName === "string" && m.courtName) ||
  "";

const normStatus = (s) => {
  const k = String(s || "").toLowerCase();
  if (
    [
      "finished",
      "done",
      "completed",
      "final",
      "ended",
      "over",
      "closed",
    ].includes(k)
  )
    return "finished";
  if (["live", "playing", "inprogress", "ongoing"].includes(k)) return "live";
  if (["assigned", "on_court", "oncourt"].includes(k)) return "assigned";
  if (["queued", "queue"].includes(k)) return "queued";
  if (["scheduled", "created", "pending"].includes(k)) return "scheduled";
  return k;
};
const isLive = (m) => normStatus(m?.status) === "live";
const isFinished = (m) => normStatus(m?.status) === "finished";
const isAssigned = (m) => !!courtNameOf(m);
const isPendingNotAssigned = (m) =>
  !isLive(m) &&
  !isFinished(m) &&
  !isAssigned(m) &&
  [
    "scheduled",
    "queued",
    "pending",
    "assigning",
    "created",
    "assigned",
  ].includes(String(m?.status || "").toLowerCase());

const typeOrderWeight = (t) => {
  const k = String(t || "").toLowerCase();
  if (k === "group") return 1;
  if (k === "po" || k === "playoff") return 2;
  if (k === "swiss") return 3;
  if (k === "gsl") return 4;
  if (k === "double_elim" || k === "doubleelim") return 5;
  if (k === "roundelim" || k === "round_elim" || k === "round-elim")
    return 9998;
  if (k === "knockout" || k === "ko") return 9999;
  return 7000;
};

const IconBtn = memo(({ name, onPress, color = "#111", size = 18, style }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [style, pressed && { opacity: 0.8 }]}
  >
    <MaterialIcons name={name} size={size} color={color} />
  </Pressable>
));

// Trọng tài
const _extractRefereeIds = (m) => {
  if (!m) return [];
  const raw = m.referees ?? m.referee ?? m.judges ?? [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr
    .map((r) =>
      String(r?.user?._id ?? r?.user ?? r?._id ?? r?.id ?? (r || "")).trim()
    )
    .filter(Boolean);
};
const isUserRefereeOfMatch = (m, user) => {
  if (!user?._id) return false;
  const myId = String(user._id);
  const refIds = _extractRefereeIds(m).map(String);
  return refIds.includes(myId);
};
const refereeNames = (m) => {
  const list = m?.referees || m?.refs || m?.assignedReferees || null;
  if (Array.isArray(list) && list.length)
    return list.map((u) => personNickname(u)).join(", ");
  const r1 = m?.referee || m?.mainReferee || null;
  return r1 ? personNickname(r1) : "";
};

const refereeRouteOf = (m) => `/match/${m._id}/referee`;

/* ====== HTML builders ====== */
const buildRefReportHTML = ({
  tourName,
  code,
  court,
  referee,
  team1,
  team2,
  logoUrl,
}) => {
  const css = `
    *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;margin:16px}
    table{width:100%;border-collapse:collapse}
    td,th{border:1px solid #000;padding:6px;font-size:12px}
    .no-border td,.no-border th{border:none}
    .title{font-size:22px;font-weight:700;text-align:left}
  `;
  const pointRow = () => `
    <tr>
      <td style="border:1px solid black"></td>
      ${Array.from(
        { length: 22 },
        (_, i) =>
          `<td style="border:1px solid black">${
            i < 10 ? `&nbsp;${i}&nbsp;` : i
          }</td>`
      ).join("")}
      <td style="border:1px solid black"></td>
      <td style="border:1px solid black"></td>
      <td style="border:1px solid black"></td>
    </tr>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>${css}</style></head><body>
    <table class="no-border" style="width:100%">
      <tr class="no-border">
        <td class="no-border" style="width:96px"><img style="width:96px" src="${
          logoUrl || ""
        }" alt="logo"/></td>
        <td class="no-border" colspan="3"><div class="title">${
          tourName || ""
        }</div></td>
      </tr>
      <tr>
        <td rowspan="2">TRẬN ĐẤU:</td>
        <td rowspan="2"><div style="font-weight:700;font-size:22px">${code}</div></td>
        <td style="width:100px">SÂN:</td>
        <td style="min-width:150px"><b>${court || ""}</b></td>
      </tr>
      <tr>
        <td style="width:100px">TRỌNG TÀI:</td>
        <td style="min-width:150px"><b>${referee || ""}</b></td>
      </tr>
    </table>
    <br/>
    <table>
      <tr><td>ĐỘI 1</td><td colspan="26"><b>${team1 || ""}</b></td></tr>
      <tr><td>SERVER</td><td colspan="22">ĐIỂM</td><td colspan="2">TIMEOUT</td><td>TW/TF</td></tr>
      ${pointRow()}${pointRow()}${pointRow()}
    </table>
    <br/>
    <div style="height:90px;"></div>
    <table>
      <tr><td>ĐỘI 2</td><td colspan="26"><b>${team2 || ""}</b></td></tr>
      <tr><td>SERVER</td><td colspan="22">ĐIỂM</td><td colspan="2">TIMEOUT</td><td>TW/TF</td></tr>
      ${pointRow()}${pointRow()}${pointRow()}
    </table>
  </body></html>`;
};

const buildExportHTML = ({ tourName, typeLabel, sections }) => {
  const css = `
    body{font-family:Arial,Helvetica,sans-serif;margin:16px}
    h1{font-size:20px;margin:0 0 6px}
    h2{font-size:14px;margin:14px 0 8px}
    .sub{color:#666;font-size:12px;margin-bottom:10px}
    table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #ddd;padding:6px;font-size:12px}
    th{background:#f1f5f9;text-align:left}
  `;
  const now = new Date().toLocaleString();
  const blocks = sections
    .map(
      (sec) => `
      <h2>${sec.title}</h2>
      <table>
        <thead><tr>
          <th>Mã</th><th>Cặp A</th><th>Cặp B</th><th>Sân</th><th>Thứ tự</th><th>Tỉ số</th>
        </tr></thead>
        <tbody>
          ${sec.rows
            .map(
              (r) =>
                `<tr>${r
                  .map((c) => `<td>${c == null ? "" : String(c)}</td>`)
                  .join("")}</tr>`
            )
            .join("")}
        </tbody>
      </table>`
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"/><style>${css}</style></head>
  <body>
    <h1>Quản lý giải: ${tourName || ""}</h1>
    <div class="sub">Loại: ${typeLabel} • Xuất lúc: ${now}</div>
    ${blocks}
  </body></html>`;
};

/* ---------------- THEME TOKENS ---------------- */
function getThemeTokens(colors, dark) {
  const tint = colors.primary;
  const muted = dark ? "#9aa0a6" : "#64748b";
  const placeholder = dark ? "#8b97a8" : "#94a3b8";
  const disabled = dark ? "#475569" : "#94a3b8";

  const chipDefaultBg = dark ? "#1f2937" : "#eef2f7";
  const chipDefaultFg = dark ? "#e5e7eb" : "#263238";
  const chipInfoBg = dark ? "#0f2536" : "#e0f2fe";
  const chipInfoFg = dark ? "#93c5fd" : "#075985";

  const infoBg = chipInfoBg;
  const infoBorder = dark ? "#1e3a5f" : "#bfdbfe";
  const infoText = chipInfoFg;

  const warnBg = dark ? "#3b2f08" : "#fffbeb";
  const warnBorder = dark ? "#a16207" : "#f59e0b";
  const warnText = dark ? "#fde68a" : "#92400e";

  const dangerBg = dark ? "#3b0d0d" : "#fee2e2";
  const dangerBorder = dark ? "#7f1d1d" : "#ef4444";
  const dangerText = dark ? "#fecaca" : "#991b1b";

  const successBg = dark ? "#102a12" : "#dcfce7";
  const successFg = dark ? "#86efac" : "#166534";

  const courtBg = dark ? "#241b4b" : "#ede9fe";
  const courtFg = dark ? "#c4b5fd" : "#5b21b6";

  const statusTone = (s) => {
    const k = String(s || "").toLowerCase();
    if (k === "scheduled")
      return {
        bg: dark ? "#1f2937" : "#e5e7eb",
        fg: dark ? "#e5e7eb" : "#111827",
        label: "Chưa xếp",
      };
    if (k === "queued")
      return { bg: chipInfoBg, fg: chipInfoFg, label: "Trong hàng chờ" };
    if (k === "assigned")
      return { bg: courtBg, fg: courtFg, label: "Đã gán sân" };
    if (k === "live")
      return {
        bg: dark ? "#3b2308" : "#fff7ed",
        fg: dark ? "#fdba74" : "#9a3412",
        label: "Đang thi đấu",
      };
    if (k === "finished")
      return { bg: successBg, fg: successFg, label: "Đã kết thúc" };
    return { bg: chipDefaultBg, fg: chipDefaultFg, label: s || "—" };
  };

  return {
    tint,
    muted,
    placeholder,
    disabled,
    chipDefaultBg,
    chipDefaultFg,
    chipInfoBg,
    chipInfoFg,
    infoBg,
    infoBorder,
    infoText,
    warnBg,
    warnBorder,
    warnText,
    dangerBg,
    dangerBorder,
    dangerText,
    successBg,
    successFg,
    courtBg,
    courtFg,
    statusTone,
  };
}

/* ---------- small local UI comps (MEMOIZED) ---------- */
const BtnOutline = memo(({ onPress, children, disabled }) => {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.border,
          opacity: disabled ? 0.5 : 1,
        },
        pressed && { opacity: 0.9 },
      ]}
    >
      <Text style={{ color: colors.text, fontWeight: "700" }}>{children}</Text>
    </Pressable>
  );
});

const PickerChip = memo(({ label, onPress, icon, colorsTheme }) => {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 999,
          backgroundColor: colorsTheme?.bg,
        },
        pressed && { opacity: 0.9 },
      ]}
    >
      {icon ? (
        <MaterialIcons name={icon} size={14} color={colorsTheme?.fg} />
      ) : null}
      <Text style={{ color: colorsTheme?.fg, fontSize: 12, fontWeight: "700" }}>
        {label}
      </Text>
    </Pressable>
  );
});

const CheckChip = memo(({ checked, label, onPress }) => {
  const onBg = "#dcfce7";
  const onFg = "#166534";
  const offBg = "#eef2f7";
  const offFg = "#263238";
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 999,
          backgroundColor: checked ? onBg : offBg,
          borderWidth: 0,
        },
        pressed && { opacity: 0.9 },
      ]}
    >
      <MaterialIcons
        name={checked ? "check-box" : "check-box-outline-blank"}
        size={14}
        color={checked ? onFg : offFg}
      />
      <Text
        style={{
          color: checked ? onFg : offFg,
          fontSize: 12,
          fontWeight: "700",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
});

const MenuItem = memo(({ icon, label, onPress, danger }) => {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.9 }]}
    >
      <MaterialIcons
        name={icon}
        size={18}
        color={danger ? "#ef4444" : colors.text}
        style={{ marginRight: 8 }}
      />
      <Text
        style={{
          color: danger ? "#ef4444" : colors.text,
          fontSize: 14,
          fontWeight: "600",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
});

/* ----------- small THEMED chips (MEMOIZED) ----------- */
const Pill = memo(({ label, kind = "default" }) => {
  const { colors, dark } = useTheme();
  const t = useMemo(() => getThemeTokens(colors, dark), [colors, dark]);
  const st =
    kind === "primary"
      ? { bg: t.chipInfoBg, fg: t.chipInfoFg }
      : { bg: t.chipDefaultBg, fg: t.chipDefaultFg };
  return (
    <View
      style={{
        backgroundColor: st.bg,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 8,
      }}
    >
      <Text style={{ color: st.fg, fontSize: 12 }}>{label}</Text>
    </View>
  );
});

const StatusPill = memo(({ status }) => {
  const { colors, dark } = useTheme();
  const t = useMemo(() => getThemeTokens(colors, dark), [colors, dark]);
  const v = t.statusTone(status);
  return (
    <View
      style={{
        backgroundColor: v.bg,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 8,
      }}
    >
      <Text style={{ color: v.fg, fontSize: 12 }}>{v.label}</Text>
    </View>
  );
});

const BusyChip = memo(({ court }) => (
  <View
    style={{
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: "#fef3c7",
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 999,
    }}
  >
    <MaterialIcons name="warning" size={12} color="#b45309" />
    <Text style={{ color: "#b45309", fontSize: 11, fontWeight: "600" }}>
      Đang thi đấu{court ? ` (${court})` : ""}
    </Text>
  </View>
));

const MiniChipBtn = memo(({ icon, label, onPress, color = "#0a84ff" }) => {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.94,
      useNativeDriver: true,
      speed: 40,
      bounciness: 6,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 40,
      bounciness: 6,
    }).start();
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={{ borderRadius: 999 }}
    >
      {({ pressed }) => (
        <Animated.View
          style={[
            {
              borderRadius: 999,
              borderWidth: 1,
              borderColor: color,
              overflow: "hidden",
              transform: [{ scale }],
              opacity: pressed ? 0.9 : 1,
              marginRight: 4, // cho đều giữa các chip
            },
          ]}
        >
          {/* lớp blur + glass bên trong, không che border */}
          <BlurView
            intensity={35}
            tint="light"
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={["rgba(255,255,255,0.26)", "rgba(255,255,255,0.02)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />

          <View
            style={[
              styles.miniBtn,
              {
                borderWidth: 0,
                backgroundColor: "rgba(255,255,255,0.04)",
              },
            ]}
          >
            <MaterialIcons name={icon} size={16} color={color} />
            <Text
              style={{
                color,
                fontSize: 12,
                fontWeight: "700",
              }}
              numberOfLines={1}
            >
              {label}
            </Text>
          </View>
        </Animated.View>
      )}
    </Pressable>
  );
});

const VideoPill = memo(({ has }) => {
  const { colors, dark } = useTheme();
  const t = useMemo(() => getThemeTokens(colors, dark), [colors, dark]);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          backgroundColor: has ? t.successBg : t.chipDefaultBg,
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: 999,
        }}
      >
        <MaterialIcons
          name="videocam"
          size={14}
          color={has ? t.successFg : t.chipDefaultFg}
        />
        <Text
          style={{ color: has ? t.successFg : t.chipDefaultFg, fontSize: 12 }}
        >
          Video
        </Text>
      </View>
    </View>
  );
});

const CourtPill = memo(({ name }) => {
  const { colors, dark } = useTheme();
  const t = useMemo(() => getThemeTokens(colors, dark), [colors, dark]);
  return name ? (
    <View
      style={{
        backgroundColor: t.courtBg,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 999,
      }}
    >
      <Text style={{ color: t.courtFg, fontSize: 12 }} numberOfLines={1}>
        {name}
      </Text>
    </View>
  ) : null;
});

const ScorePill = memo(({ textVal }) => {
  const { colors } = useTheme();
  return textVal ? (
    <View
      style={{
        borderColor: colors.border,
        borderWidth: 1,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 8,
      }}
    >
      <Text style={{ color: colors.text, fontSize: 12, fontWeight: "700" }}>
        {textVal}
      </Text>
    </View>
  ) : null;
});

// ✅ FIX: EdgeFadedHScroll - không nháy chevron
const EdgeFadedHScroll = memo(
  ({
    children,
    contentContainerStyle,
    style,
    bgColor = "#fff",
    chevronColor = "#94a3b8",
    ...props
  }) => {
    const [state, setState] = useState({
      canScroll: false,
      showL: false,
      showR: false,
    });
    const boxW = useRef(0);
    const contentW = useRef(0);
    const scrollX = useRef(0);
    const updateTimer = useRef(null);

    const update = useCallback((x = 0) => {
      scrollX.current = x;
      if (updateTimer.current) return;
      updateTimer.current = setTimeout(() => {
        updateTimer.current = null;
        const can = contentW.current > boxW.current + 2;
        const showL = can && scrollX.current > 2;
        const maxX = Math.max(0, contentW.current - boxW.current);
        const showR = can && scrollX.current < maxX - 2;

        setState((prev) => {
          if (
            prev.canScroll === can &&
            prev.showL === showL &&
            prev.showR === showR
          ) {
            return prev;
          }
          return { canScroll: can, showL, showR };
        });
      }, 100);
    }, []);

    useEffect(() => {
      return () => {
        if (updateTimer.current) clearTimeout(updateTimer.current);
      };
    }, []);

    return (
      <View
        onLayout={(e) => {
          boxW.current = e.nativeEvent.layout.width || 0;
          update(scrollX.current);
        }}
        style={[{ position: "relative" }, style]}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          onContentSizeChange={(w) => {
            contentW.current = w || 0;
            update(scrollX.current);
          }}
          onScroll={(e) => update(e.nativeEvent.contentOffset.x || 0)}
          scrollEventThrottle={100}
          contentContainerStyle={contentContainerStyle}
          {...props}
        >
          {children}
        </ScrollView>

        {state.canScroll && state.showL && (
          <>
            <LinearGradient
              pointerEvents="none"
              colors={[bgColor, `${bgColor}99`, `${bgColor}00`]}
              locations={[0, 0.5, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.fadeLeft}
            />
            <View pointerEvents="none" style={[styles.chev, { left: 4 }]}>
              <MaterialIcons
                name="chevron-left"
                size={16}
                color={chevronColor}
              />
            </View>
          </>
        )}

        {state.canScroll && state.showR && (
          <>
            <LinearGradient
              pointerEvents="none"
              colors={[`${bgColor}00`, `${bgColor}99`, bgColor]}
              locations={[0, 0.5, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.fadeRight}
            />
            <View pointerEvents="none" style={[styles.chev, { right: 4 }]}>
              <MaterialIcons
                name="chevron-right"
                size={16}
                color={chevronColor}
              />
            </View>
          </>
        )}
      </View>
    );
  }
);

const ActionButtons = memo(
  ({ m, tour, me, onOpenVideoDlg, onOpenSheet, canManage }) => {
    const { colors, dark } = useTheme();
    const t = useMemo(() => getThemeTokens(colors, dark), [colors, dark]);

    const has = !!m?.video;
    const canStart = isUserRefereeOfMatch(m, me) && m?.status !== "finished";

    const onOpenRefNote = useCallback(async () => {
      try {
        const html = buildRefReportHTML({
          tourName: tour?.name || "",
          code: matchCode(m),
          court: courtNameOf(m),
          referee: refereeNames(m),
          team1: pairLabel(m?.pairA),
          team2: pairLabel(m?.pairB),
          logoUrl: "",
        });
        const { uri } = await Print.printToFileAsync({ html });
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: "Biên bản trọng tài",
        });
      } catch {
        RNAlert.alert("Lỗi", "Không xuất được biên bản.");
      }
    }, [tour, m]);

    const handleOpenVideo = useCallback(() => {
      Linking.openURL(m.video).catch(() =>
        RNAlert.alert("Lỗi", "Không mở được liên kết.")
      );
    }, [m.video]);

    const handleStartMatch = useCallback(() => {
      router.push(refereeRouteOf(m));
    }, [m]);

    return (
      <EdgeFadedHScroll
        contentContainerStyle={styles.actionsWrap}
        bgColor={colors.card}
        chevronColor={t.muted}
      >
        <MiniChipBtn icon="print" label="Biên bản TT" onPress={onOpenRefNote} />

        <MiniChipBtn
          icon="stadium"
          label="Gán sân"
          onPress={() => onOpenSheet("court", m)}
        />
        <MiniChipBtn
          icon="how-to-reg"
          label="Gán trọng tài"
          onPress={() => onOpenSheet("ref", m)}
        />

        {has && (
          <MiniChipBtn
            icon="open-in-new"
            label="Mở"
            onPress={handleOpenVideo}
          />
        )}

        {/* ⬇️ Nút Thêm/Sửa video */}
        <MiniChipBtn
          icon="edit"
          label={has ? "Sửa video" : "Thêm video"}
          onPress={() => onOpenVideoDlg(m)}
        />

        {/* ⬇️ Nút Bắt trận nằm cạnh nút Thêm/Sửa video */}
        {(canStart || canManage) && (
          <MiniChipBtn
            icon="play-arrow"
            label="Bắt trận"
            onPress={handleStartMatch}
          />
        )}

        {has && (
          <MiniChipBtn
            icon="link-off"
            label="Xoá"
            color="#ef4444"
            onPress={() => onOpenVideoDlg(m, "")}
          />
        )}
      </EdgeFadedHScroll>
    );
  }
);

/* ---------------- main ---------------- */
export default function ManageScreen() {
  const { id } = useLocalSearchParams();
  const tid = Array.isArray(id) ? id[0] : id;

  const { colors, dark } = useTheme();
  const t = useMemo(() => getThemeTokens(colors, dark), [colors, dark]);

  const insets = useSafeAreaInsets();
  const me = useSelector((s) => s.auth?.userInfo || null);

  // socket
  const socket = useSocket();
  const liveMapRef = useRef(new Map());
  const pendingRef = useRef(new Map());
  const rafRef = useRef(null);
  const [liveBump, setLiveBump] = useState(0);
  const joinedMatchesRef = useRef(new Set());
  const lastSnapshotAtRef = useRef(new Map());
  const requestSnapshot = useCallback(
    (mid) => {
      if (!socket || !mid) return;
      const now = Date.now();
      const last = lastSnapshotAtRef.current.get(mid) || 0;
      if (now - last < 600) return;
      lastSnapshotAtRef.current.set(mid, now);
      socket.emit("match:snapshot:request", { matchId: mid });
    },
    [socket]
  );

  // Queries
  const {
    data: tour,
    isLoading: tourLoading,
    isFetching: tourFetching,
    error: tourErr,
    refetch: refetchTour,
  } = useGetTournamentQuery(tid, {
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  const {
    data: bracketsData = [],
    isLoading: brLoading,
    isFetching: brFetching,
    error: brErr,
    refetch: refetchBrackets,
  } = useAdminGetBracketsQuery(tid, {
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  const {
    data: matchPage,
    isLoading: mLoading,
    isFetching: mFetching,
    error: mErr,
    refetch: refetchMatches,
  } = useAdminListMatchesByTournamentQuery(
    { tid, page: 1, pageSize: 1000 },
    { refetchOnFocus: true, refetchOnReconnect: true }
  );

  const [setLiveUrl] = useAdminSetMatchLiveUrlMutation();
  const [batchSetLiveUrl, { isLoading: batchingVideo }] =
    useAdminBatchSetMatchLiveUrlMutation();

  const {
    data: refData,
    isLoading: refsLoading,
    error: refsErr,
  } = useListTournamentRefereesQuery({ tid }, { skip: false });
  const [batchAssign, { isLoading: batchingRefs }] =
    useBatchAssignRefereeMutation();

  const refetchMatchesRef = useRef(refetchMatches);
  const refetchBracketsRef = useRef(refetchBrackets);
  useEffect(() => {
    refetchMatchesRef.current = refetchMatches;
  }, [refetchMatches]);
  useEffect(() => {
    refetchBracketsRef.current = refetchBrackets;
  }, [refetchBrackets]);

  // Quyền
  const isAdmin = !!(
    me?.isAdmin ||
    me?.role === "admin" ||
    (Array.isArray(me?.roles) && me.roles.includes("admin"))
  );
  const isManager = useMemo(() => {
    if (!me?._id || !tour) return false;
    if (String(tour.createdBy) === String(me._id)) return true;
    if (Array.isArray(tour.managers))
      return tour.managers.some((m) => String(m?.user ?? m) === String(me._id));
    return !!tour?.isManager;
  }, [tour, me]);
  const canManage = isAdmin || isManager;

  // Tabs
  const typesAvailable = useMemo(() => {
    const uniq = new Map();
    (bracketsData || []).forEach((b) => {
      const t = (b?.type || "").toString().toLowerCase();
      if (!t) return;
      if (!uniq.has(t))
        uniq.set(t, {
          type: t,
          label: TYPE_LABEL(t),
          weight: typeOrderWeight(t),
        });
    });
    if (uniq.size === 0)
      uniq.set("group", { type: "group", label: "Vòng bảng", weight: 1 });
    return Array.from(uniq.values()).sort((a, b) => a.weight - b.weight);
  }, [bracketsData]);

  const [tab, setTab] = useState(typesAvailable[0]?.type || "group");
  useEffect(() => {
    if (!typesAvailable.some((t) => t.type === tab)) {
      setTab(typesAvailable[0]?.type || "group");
    }
  }, [typesAvailable, tab]);

  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState("time");
  const [sortDir, setSortDir] = useState("asc");

  const [courtFilter, setCourtFilter] = useState("");
  const [showBye, setShowBye] = useState(true);

  const [courtPickerOpen, setCourtPickerOpen] = useState(false);
  const [courtOptions, setCourtOptions] = useState([]);

  const allMatches = useMemo(
    () => (Array.isArray(matchPage?.list) ? matchPage.list : []),
    [matchPage?.list]
  );

  const seededFingerprintRef = useRef("");
  useEffect(() => {
    if (!allMatches.length) return;
    const fp = allMatches
      .map((m) =>
        [
          String(m?._id || ""),
          String(m?.liveVersion ?? m?.version ?? m?.updatedAt ?? ""),
        ].join(":")
      )
      .join("|");
    if (fp === seededFingerprintRef.current) return;
    seededFingerprintRef.current = fp;

    const mp = new Map();
    for (const m of allMatches) if (m?._id) mp.set(String(m._id), m);
    liveMapRef.current = mp;
    setLiveBump((x) => x + 1);
  }, [allMatches]);

  useEffect(() => {
    if (!socket) return;

    const queueUpsert = (payload) => {
      const incRaw = payload?.data ?? payload?.match ?? payload;
      const id = incRaw?._id ?? incRaw?.id ?? incRaw?.matchId;
      if (!id) return;
      const inc = { ...(incRaw || {}), _id: String(id) };

      if (Array.isArray(inc.scores) && !inc.gameScores)
        inc.gameScores = inc.scores;
      if (typeof inc.score_text === "string" && !inc.scoreText)
        inc.scoreText = inc.score_text;

      if (inc.court && typeof inc.court === "object") {
        inc.court = {
          _id:
            inc.court._id ??
            (typeof inc.court.id === "string" ? inc.court.id : undefined),
          name: inc.court.name || inc.court.label || inc.court.title || "",
        };
      }

      pendingRef.current.set(String(inc._id), inc);
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        if (!pendingRef.current.size) return;
        const mp = liveMapRef.current;
        for (const [mid, inc2] of pendingRef.current) {
          const cur = mp.get(mid);
          const vNew = Number(inc2?.liveVersion ?? inc2?.version ?? 0);
          const vOld = Number(cur?.liveVersion ?? cur?.version ?? 0);
          const merged =
            !cur || vNew >= vOld ? { ...(cur || {}), ...inc2 } : cur;
          mp.set(mid, merged);
        }
        pendingRef.current.clear();
        setLiveBump((x) => x + 1);
      });
    };

    const onConnected = () => {
      joinedMatchesRef.current.forEach((mid) => {
        socket.emit("match:join", { matchId: mid });
        requestSnapshot(mid);
      });
    };
    const onRemove = (payload) => {
      const id = String(payload?.id ?? payload?._id ?? "");
      if (!id) return;
      if (liveMapRef.current.has(id)) {
        liveMapRef.current.delete(id);
        setLiveBump((x) => x + 1);
      }
    };

    let lastRefill = 0;
    const onRefilled = () => {
      const now = Date.now();
      if (now - lastRefill < 800) return;
      lastRefill = now;
      refetchMatchesRef.current?.();
      refetchBracketsRef.current?.();
    };

    socket.on("connect", onConnected);
    socket.on("match:update", queueUpsert);
    socket.on("match:snapshot", queueUpsert);
    socket.on("score:updated", queueUpsert);
    socket.on("match:deleted", onRemove);
    socket.on("draw:refilled", onRefilled);
    socket.on("bracket:updated", onRefilled);

    return () => {
      socket.off("connect", onConnected);
      socket.off("match:update", queueUpsert);
      socket.off("match:snapshot", queueUpsert);
      socket.off("score:updated", queueUpsert);
      socket.off("match:deleted", onRemove);
      socket.off("draw:refilled", onRefilled);
      socket.off("bracket:updated", onRefilled);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [socket, requestSnapshot]);

  const allMatchIds = useMemo(() => {
    if (!allMatches.length) return [];
    return allMatches.map((m) => String(m?._id)).filter(Boolean);
  }, [allMatches]);

  useEffect(() => {
    if (!socket) return;
    const cur = joinedMatchesRef.current;

    allMatchIds.forEach((mid) => {
      if (!cur.has(mid)) {
        socket.emit("match:join", { matchId: mid });
        requestSnapshot(mid);
        cur.add(mid);
      }
    });
    cur.forEach((mid) => {
      if (!allMatchIds.includes(mid)) {
        socket.emit("match:leave", { matchId: mid });
        cur.delete(mid);
      }
    });

    return () => {
      cur.forEach((mid) => socket.emit("match:leave", { matchId: mid }));
      cur.clear();
    };
  }, [socket, allMatchIds, requestSnapshot]);

  const mergedAllMatches = useMemo(() => {
    const vals = Array.from(liveMapRef.current.values());
    return vals.filter(
      (m) => String(m?.tournament?._id || m?.tournament) === String(tid)
    );
  }, [tid, liveBump]);

  const liveBusyByPairId = useMemo(() => {
    const mp = new Map();
    for (const m of mergedAllMatches) {
      if (!isLive(m)) continue;
      const mid = String(m._id);
      const court = courtNameOf(m);
      const push = (p) => {
        const pid = pairIdOf(p);
        if (!pid) return;
        const arr = mp.get(pid) || [];
        arr.push({ matchId: mid, court });
        mp.set(pid, arr);
      };
      push(m.pairA);
      push(m.pairB);
    }
    return mp;
  }, [mergedAllMatches]);

  const isByePair = useCallback((p) => {
    if (!p) return false;
    if (p.isBye || p.bye) return true;
    const label = (p.name || "").toString();
    if (label && /bye/i.test(label)) return true;
    const a = p.player1 ? personNickname(p.player1) : "";
    const b = p.player2 ? personNickname(p.player2) : "";
    return /bye/i.test(`${a} ${b}`);
  }, []);
  const isByeMatch = useCallback(
    (m) => isByePair(m?.pairA) || isByePair(m?.pairB),
    [isByePair]
  );

  const collectCourts = useCallback(() => {
    const s = new Set();
    mergedAllMatches.forEach((m) => {
      const c = courtNameOf(m).trim();
      if (c) s.add(c);
    });
    return Array.from(s).sort((a, b) =>
      a.localeCompare(b, "vi", { numeric: true })
    );
  }, [mergedAllMatches]);

  useEffect(() => {
    if (!courtFilter) return;
    const now = collectCourts();
    if (!now.includes(courtFilter)) setCourtFilter("");
  }, [collectCourts, courtFilter]);

  const bucketWeight = (m) =>
    isLive(m)
      ? 0
      : isAssigned(m) && !isFinished(m)
      ? 1
      : isPendingNotAssigned(m)
      ? 2
      : isFinished(m)
      ? 3
      : 4;

  const secondaryCmp = useCallback(
    (a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "order") {
        if ((a?.order ?? 0) !== (b?.order ?? 0))
          return ((a?.order ?? 0) - (b?.order ?? 0)) * dir;
        if ((a?.round ?? 0) !== (b?.round ?? 0))
          return ((a?.round ?? 0) - (b?.round ?? 0)) * dir;
        const ta = new Date(a?.scheduledAt || a?.createdAt || 0).getTime();
        const tb = new Date(b?.scheduledAt || b?.createdAt || 0).getTime();
        return (ta - tb) * dir;
      }
      if (sortKey === "time") {
        const ta = new Date(a?.scheduledAt || a?.createdAt || 0).getTime();
        const tb = new Date(b?.scheduledAt || b?.createdAt || 0).getTime();
        if (ta !== tb) return (ta - tb) * dir;
        if ((a?.round ?? 0) !== (b?.round ?? 0))
          return ((a?.round ?? 0) - (b?.round ?? 0)) * dir;
        return ((a?.order ?? 0) - (b?.order ?? 0)) * dir;
      }
      if ((a?.round ?? 0) !== (b?.round ?? 0))
        return ((a?.round ?? 0) - (b?.round ?? 0)) * dir;
      if ((a?.order ?? 0) !== (b?.order ?? 0))
        return ((a?.order ?? 0) - (b?.order ?? 0)) * dir;
      const ta = new Date(a?.scheduledAt || a?.createdAt || 0).getTime();
      const tb = new Date(b?.scheduledAt || b?.createdAt || 0).getTime();
      return (ta - tb) * dir;
    },
    [sortKey, sortDir]
  );

  const filterSortMatches = useCallback(
    (list) => {
      const kw = q.trim().toLowerCase();

      // ✅ Tính trạng thái bảng
      const groupStatusMap = computeGroupCompletionStatus(mergedAllMatches);

      return list
        .filter((m) => {
          // ✅ Lọc trận KO chưa sẵn sàng
          if (!canShowKOMatch(m, groupStatusMap)) {
            return false;
          }

          if (kw) {
            const text = [
              matchCode(m),
              pairLabel(m?.pairA),
              pairLabel(m?.pairB),
              m?.status,
              m?.video,
              courtNameOf(m),
              scoreText(m),
            ]
              .join(" ")
              .toLowerCase();
            if (!text.includes(kw)) return false;
          }
          if (courtFilter) {
            if (courtNameOf(m) !== courtFilter) return false;
          }
          if (!showBye && isByeMatch(m)) return false;

          return true;
        })
        .sort((a, b) => {
          const wa = bucketWeight(a);
          const wb = bucketWeight(b);
          if (wa !== wb) return wa - wb;
          return secondaryCmp(a, b);
        });
    },
    [q, courtFilter, showBye, isByeMatch, secondaryCmp, mergedAllMatches] // ✅ Thêm mergedAllMatches
  );

  const [viewer, setViewer] = useState({ open: false, matchId: null });
  const openMatch = useCallback(
    (mid) => setViewer({ open: true, matchId: mid }),
    []
  );
  const closeMatch = useCallback(
    () => setViewer({ open: false, matchId: null }),
    []
  );

  const [videoDlg, setVideoDlg] = useState({
    open: false,
    match: null,
    url: "",
  });
  const openVideoDlg = useCallback((m, urlOverride) => {
    const url = typeof urlOverride === "string" ? urlOverride : m?.video || "";
    setVideoDlg({ open: true, match: m, url });
  }, []);
  const closeVideoDlg = useCallback(
    () => setVideoDlg({ open: false, match: null, url: "" }),
    []
  );
  const onSaveVideo = useCallback(async () => {
    try {
      if (!videoDlg.match?._id) return;
      await setLiveUrl({
        matchId: videoDlg.match._id,
        video: videoDlg.url || "",
      }).unwrap();
      closeVideoDlg();
      RNAlert.alert(
        "Thành công",
        videoDlg.url ? "Đã gán link video" : "Đã xoá link video"
      );
      refetchMatches();
    } catch (e) {
      RNAlert.alert(
        "Lỗi",
        e?.data?.message || e?.error || "Không lưu được link video"
      );
    }
  }, [videoDlg, setLiveUrl, closeVideoDlg, refetchMatches]);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      await Promise.all([refetchTour(), refetchBrackets(), refetchMatches()]);
    } finally {
      setRefreshing(false);
    }
  }, [refetchTour, refetchBrackets, refetchMatches]);

  const bracketsOfTab = useMemo(() => {
    const list = (bracketsData || []).filter(
      (b) => String(b?.type || "").toLowerCase() === String(tab).toLowerCase()
    );
    return list.sort((a, b) => {
      if ((a?.stage ?? 0) !== (b?.stage ?? 0))
        return (a?.stage ?? 0) - (b?.stage ?? 0);
      if ((a?.order ?? 0) !== (b?.order ?? 0))
        return (a?.order ?? 0) - (b?.order ?? 0);
      return new Date(a?.createdAt || 0) - new Date(b?.createdAt || 0);
    });
  }, [bracketsData, tab]);

  const [selectedMatchIds, setSelectedMatchIds] = useState(() => new Set());
  const [selBump, setSelBump] = useState(0);
  const toggleSelectMatch = useCallback((mid) => {
    setSelectedMatchIds((prev) => {
      const next = new Set(prev);
      const key = String(mid);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setSelBump((x) => x + 1);
  }, []);
  const clearSelection = useCallback(() => {
    setSelectedMatchIds(new Set());
    setSelBump((x) => x + 1);
  }, []);
  const isAllSelectedIn = useCallback(
    (arr) =>
      arr.length > 0 && arr.every((m) => selectedMatchIds.has(String(m._id))),
    [selectedMatchIds]
  );
  const toggleSelectAllIn = useCallback((arr, checked) => {
    setSelectedMatchIds((prev) => {
      const next = new Set(prev);
      arr.forEach((m) => {
        const key = String(m._id);
        if (checked) next.add(key);
        else next.delete(key);
      });
      return next;
    });
    setSelBump((x) => x + 1);
  }, []);

  const [batchRefDlg, setBatchRefDlg] = useState({ open: false });
  const [pickedRefs, setPickedRefs] = useState([]);
  const refOptions = useMemo(() => {
    const list = Array.isArray(refData?.items)
      ? refData.items
      : Array.isArray(refData)
      ? refData
      : [];
    return list;
  }, [refData]);
  const idOfRef = (r) => String(r?._id ?? r?.id ?? "");

  const [batchVideoDlg, setBatchVideoDlg] = useState({ open: false, url: "" });

  const submitBatchAssign = useCallback(async () => {
    const ids = Array.from(selectedMatchIds);
    const refs = pickedRefs.map(idOfRef).filter(Boolean);
    if (!ids.length) return RNAlert.alert("Thông báo", "Chưa chọn trận nào.");
    if (!refs.length)
      return RNAlert.alert("Thông báo", "Hãy chọn ít nhất 1 trọng tài.");
    try {
      await batchAssign({ ids, referees: refs }).unwrap();
      RNAlert.alert("Thành công", `Đã gán trọng tài cho ${ids.length} trận`);
      setBatchRefDlg({ open: false });
      setPickedRefs([]);
      clearSelection();
      await refetchMatches?.();
    } catch (e) {
      RNAlert.alert("Lỗi", e?.data?.message || "Gán trọng tài thất bại");
    }
  }, [
    selectedMatchIds,
    pickedRefs,
    batchAssign,
    clearSelection,
    refetchMatches,
  ]);

  const submitBatchSetVideo = useCallback(async () => {
    const ids = Array.from(selectedMatchIds);
    const url = (batchVideoDlg.url || "").trim();
    if (!ids.length) return RNAlert.alert("Thông báo", "Chưa chọn trận nào.");
    if (!url) return RNAlert.alert("Thông báo", "Hãy nhập link video hợp lệ.");
    try {
      await batchSetLiveUrl({ ids, video: url }).unwrap();
      RNAlert.alert("Thành công", `Đã gán video cho ${ids.length} trận`);
      setBatchVideoDlg({ open: false, url: "" });
      clearSelection();
      await refetchMatches?.();
    } catch (e) {
      RNAlert.alert("Lỗi", e?.data?.message || "Gán video thất bại");
    }
  }, [
    selectedMatchIds,
    batchVideoDlg.url,
    batchSetLiveUrl,
    clearSelection,
    refetchMatches,
  ]);

  const [refMgrOpen, setRefMgrOpen] = useState(false);
  const [assignCourtSheet, setAssignCourtSheet] = useState({
    open: false,
    match: null,
  });
  const [assignRefSheet, setAssignRefSheet] = useState({
    open: false,
    match: null,
  });
  const [courtMgrSheet, setCourtMgrSheet] = useState({
    open: false,
    bracket: null,
  });
  const [liveSetupSheet, setLiveSetupSheet] = useState({
    open: false,
    bracket: null,
  });

  const handleOpenSheet = useCallback((type, m) => {
    if (type === "court") setAssignCourtSheet({ open: true, match: m });
    else if (type === "ref") setAssignRefSheet({ open: true, match: m });
  }, []);

  // ✅ MEMOIZED renderMatchRow
  const renderMatchRow = useCallback(
    ({ item: m }) => {
      const hasVideo = !!m?.video;
      const score = scoreText(m);
      const courtLabel = courtNameOf(m);
      const ordNum =
        typeof m?.order === "number"
          ? m.order
          : m?.order != null
          ? parseInt(String(m?.order), 10)
          : null;

      const isThisMatchLive = isLive(m);
      const isThisMatchFinished = isFinished(m);

      const pAId = pairIdOf(m?.pairA);
      const pBId = pairIdOf(m?.pairB);

      const busyInfoA =
        !isThisMatchFinished &&
        !isThisMatchLive &&
        pAId &&
        liveBusyByPairId.has(pAId)
          ? liveBusyByPairId.get(pAId).find((x) => x.matchId !== String(m._id))
          : null;
      const busyInfoB =
        !isThisMatchFinished &&
        !isThisMatchLive &&
        pBId &&
        liveBusyByPairId.has(pBId)
          ? liveBusyByPairId.get(pBId).find((x) => x.matchId !== String(m._id))
          : null;

      const checked = selectedMatchIds.has(String(m._id));

      return (
        <Pressable
          onPress={() => openMatch(m._id)}
          style={({ pressed }) => [
            styles.matchRow,
            { borderColor: colors.border, backgroundColor: colors.card },
            pressed && { opacity: 0.95 },
          ]}
        >
          <Pressable
            onPress={(e) => {
              e?.stopPropagation?.();
              toggleSelectMatch(m._id);
            }}
            style={({ pressed }) => [
              styles.selectRow,
              { borderColor: colors.border },
              pressed && { opacity: 0.9 },
            ]}
          >
            <MaterialIcons
              name={checked ? "check-box" : "check-box-outline-blank"}
              size={20}
              color={checked ? colors.primary : t.muted}
            />
            <Text
              style={{
                color: colors.text,
                fontWeight: "700",
              }}
            >
              {checked ? "Đã chọn" : ""}
            </Text>
            <View style={{ flex: 1 }} />
            <Text style={{ color: t.muted, fontSize: 12 }}>{matchCode(m)}</Text>
          </Pressable>

          <ActionButtons
            m={m}
            tour={tour}
            me={me}
            canManage={canManage}
            onOpenVideoDlg={openVideoDlg}
            onOpenSheet={handleOpenSheet}
          />

          <View style={styles.contentBlock}>
            <Text
              style={[styles.code, { color: colors.text }]}
              numberOfLines={1}
            >
              {matchCode(m)}
            </Text>

            <View
              style={{ flexDirection: "row", gap: 6, alignItems: "center" }}
            >
              <Text style={{ color: colors.text }} numberOfLines={1}>
                {pairLabel(m?.pairA)}
              </Text>
              {busyInfoA ? <BusyChip court={busyInfoA.court} /> : null}
            </View>

            <View
              style={{ flexDirection: "row", gap: 6, alignItems: "center" }}
            >
              <Text style={{ color: colors.text }} numberOfLines={1}>
                {pairLabel(m?.pairB)}
              </Text>
              {busyInfoB ? <BusyChip court={busyInfoB.court} /> : null}
            </View>

            <View style={styles.metaRow}>
              <StatusPill status={m?.status} />
              <CourtPill name={courtLabel} />
              <ScorePill textVal={score} />
              <Text style={{ color: t.muted, fontSize: 12 }}>
                {getRoundText(m)} • Thứ tự{" "}
                {ordNum != null && !Number.isNaN(ordNum) ? ordNum + 1 : "—"}
              </Text>
              <VideoPill has={hasVideo} />
            </View>
          </View>
        </Pressable>
      );
    },
    [
      colors,
      t,
      tour,
      me,
      liveBusyByPairId,
      selectedMatchIds,
      openMatch,
      toggleSelectMatch,
      openVideoDlg,
      handleOpenSheet,
    ]
  );

  // ✅ MEMOIZED renderBracket
  const renderBracket = useCallback(
    ({ item: b }) => {
      const bid = String(b?._id);
      const matches = mergedAllMatches.filter(
        (m) => String(m?.bracket?._id || m?.bracket) === bid
      );
      const list = filterSortMatches(matches);
      const listVersion = `${sortKey}|${sortDir}|${q}|${liveBump}|${selBump}|${courtFilter}|${showBye}`;

      const allSelected = isAllSelectedIn(list);
      const selectedCount = list.filter((m) =>
        selectedMatchIds.has(String(m._id))
      ).length;

      return (
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              marginBottom: 10,
              flexWrap: "wrap",
            }}
          >
            <Text
              style={[styles.bracketTitle, { color: colors.text }]}
              numberOfLines={1}
            >
              {b?.name || "Bracket"}
            </Text>
            <Pill label={TYPE_LABEL(b?.type)} />
            {typeof b?.stage === "number" ? (
              <Pill label={`Stage ${b.stage}`} />
            ) : null}
            <Pill label={`${list.length} trận`} kind="primary" />
          </View>

          {list.length > 0 && (
            <View style={styles.selectAllRow}>
              <Pressable
                onPress={() => toggleSelectAllIn(list, !allSelected)}
                style={({ pressed }) => [
                  { flexDirection: "row", alignItems: "center", gap: 8 },
                  pressed && { opacity: 0.9 },
                ]}
              >
                <MaterialIcons
                  name={
                    allSelected
                      ? "check-box"
                      : selectedCount > 0
                      ? "indeterminate-check-box"
                      : "check-box-outline-blank"
                  }
                  size={18}
                  color={colors.text}
                />
                <Text style={{ color: colors.text, fontWeight: "700" }}>
                  {allSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}
                </Text>
              </Pressable>
              {selectedCount > 0 ? (
                <Pill label={`${selectedCount} đã chọn`} />
              ) : null}
            </View>
          )}

          {list.length === 0 ? (
            <View style={[styles.emptyBox, { borderColor: colors.border }]}>
              <Text style={{ color: t.muted }}>Chưa có trận nào.</Text>
            </View>
          ) : (
            <FlatList
              data={list}
              keyExtractor={(m) => String(m._id)}
              renderItem={renderMatchRow}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
              scrollEnabled={false}
              extraData={listVersion}
              removeClippedSubviews={Platform.OS === "android"}
              maxToRenderPerBatch={5}
              windowSize={5}
            />
          )}
        </View>
      );
    },
    [
      colors,
      t,
      mergedAllMatches,
      filterSortMatches,
      sortKey,
      sortDir,
      q,
      liveBump,
      selBump,
      courtFilter,
      showBye,
      isAllSelectedIn,
      selectedMatchIds,
      toggleSelectAllIn,
      renderMatchRow,
    ]
  );

  const [hdrMenuOpen, setHdrMenuOpen] = useState(false);

  const isInitialLoading = tourLoading || brLoading || mLoading;
  const hasError = tourErr || brErr || mErr;

  const buildRowsForBracket = useCallback((matches) => {
    return matches.map((m) => {
      const code = matchCode(m);
      const a = pairLabel(m?.pairA);
      const b = pairLabel(m?.pairB);
      const court = courtNameOf(m) || "—";
      const order =
        Number.isFinite(m?.order) || typeof m?.order === "number"
          ? `T${Number(m.order) + 1}`
          : "—";
      const score = scoreText(m) || "—";
      return [code, a, b, court, order, score];
    });
  }, []);

  const buildExportPayload = useCallback(() => {
    const payload = [];
    for (const b of bracketsOfTab) {
      const bid = String(b?._id);
      const matches = mergedAllMatches.filter(
        (m) => String(m?.bracket?._id || m?.bracket) === bid
      );
      const list = filterSortMatches(matches);
      payload.push({
        title: `${b?.name || "Bracket"} — ${TYPE_LABEL(b?.type)}`,
        rows: buildRowsForBracket(list),
      });
    }
    return payload;
  }, [bracketsOfTab, mergedAllMatches, filterSortMatches, buildRowsForBracket]);

  const handleExportPDF = useCallback(async () => {
    setHdrMenuOpen(false);
    try {
      const sections = buildExportPayload();
      if (!sections.length)
        return RNAlert.alert("Thông báo", "Không có dữ liệu để xuất.");
      const html = buildExportHTML({
        tourName: tour?.name || "",
        typeLabel: TYPE_LABEL(tab),
        sections,
      });
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: "Xuất PDF",
      });
    } catch {
      RNAlert.alert("Lỗi", "Xuất PDF thất bại.");
    }
  }, [buildExportPayload, tour, tab]);

  const handleExportWord = useCallback(async () => {
    setHdrMenuOpen(false);
    try {
      const sections = buildExportPayload();
      if (!sections.length)
        return RNAlert.alert("Thông báo", "Không có dữ liệu để xuất.");
      const html = buildExportHTML({
        tourName: tour?.name || "",
        typeLabel: TYPE_LABEL(tab),
        sections,
      });
      const content = `\ufeff${html}`;
      const safeName = (tour?.name || "export")
        .replace(/[^\p{L}\p{N}]+/gu, "_")
        .replace(/^_+|_+$/g, "")
        .toLowerCase();
      const fileName = `tournament_${safeName}_${tab}_${new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/[:T]/g, "-")}.doc`;
      const fileUri = FileSystem.cacheDirectory + fileName;
      await FileSystem.writeAsStringAsync(fileUri, content, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      await Sharing.shareAsync(fileUri, {
        mimeType: "application/msword",
        dialogTitle: "Xuất Word",
      });
    } catch {
      RNAlert.alert("Lỗi", "Xuất Word thất bại.");
    }
  }, [buildExportPayload, tour, tab]);

  if (isInitialLoading) {
    return (
      <>
        <Stack.Screen
          options={{ title: "Quản lý giải", headerTitleAlign: "center" }}
        />
        <View style={[styles.center]}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </>
    );
  }

  if (hasError) {
    return (
      <>
        <Stack.Screen
          options={{ title: "Quản lý giải", headerTitleAlign: "center" }}
        />
        <View style={[styles.screen]}>
          <View
            style={[
              styles.alert,
              { borderColor: t.dangerBorder, backgroundColor: t.dangerBg },
            ]}
          >
            <Text style={{ color: t.dangerText }}>
              {tourErr?.data?.message ||
                brErr?.data?.message ||
                mErr?.data?.message ||
                "Lỗi tải dữ liệu"}
            </Text>
          </View>
        </View>
      </>
    );
  }

  if (!canManage) {
    return (
      <>
        <Stack.Screen
          options={{
            title: `${tour?.name || ""}`,
            headerTitleAlign: "center",
          }}
        />
        <View style={[styles.screen]}>
          <View
            style={[
              styles.alert,
              { borderColor: t.warnBorder, backgroundColor: t.warnBg },
            ]}
          >
            <Text style={{ color: t.warnText }}>
              Bạn không có quyền truy cập trang này.
            </Text>
          </View>
          <View style={{ marginTop: 12 }}>
            <BtnOutline onPress={() => router.push(`/tournament/${tid}/home`)}>
              Quay lại trang giải
            </BtnOutline>
          </View>
        </View>
      </>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: `${tour?.name || ""}`,
          headerTitleAlign: "center",
          headerRight: () => (
            <Pressable
              onPress={() => setHdrMenuOpen(true)}
              style={({ pressed }) => [
                { paddingHorizontal: 8, paddingVertical: 4 },
                pressed && { opacity: 0.7 },
              ]}
              hitSlop={12}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <MaterialIcons
                  name="tune" // icon gợi ý: tinh chỉnh / chức năng
                  size={20}
                  color={colors.text}
                />
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 12,
                    fontWeight: "600",
                  }}
                >
                  Chức năng
                </Text>
              </View>
            </Pressable>
          ),
        }}
      />

      <View style={[styles.screen]}>
        <View
          style={[
            styles.toolbar,
            { borderColor: colors.border, backgroundColor: colors.card },
          ]}
        >
          <View style={[styles.inputWrap, { borderColor: colors.border }]}>
            <MaterialIcons name="search" size={18} color={t.muted} />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="Tìm trận, cặp đấu, link…"
              placeholderTextColor={t.placeholder}
              value={q}
              onChangeText={setQ}
            />
          </View>

          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <PickerChip
              label={`Sắp xếp: ${
                sortKey === "time"
                  ? "Thời gian"
                  : sortKey === "order"
                  ? "Thứ tự"
                  : "Vòng"
              }`}
              onPress={() =>
                setSortKey((k) =>
                  k === "time" ? "round" : k === "round" ? "order" : "time"
                )
              }
              icon="sort"
              colorsTheme={{ bg: t.chipDefaultBg, fg: t.chipDefaultFg }}
            />
            <PickerChip
              label={`Chiều: ${sortDir === "asc" ? "Tăng" : "Giảm"}`}
              onPress={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              icon={sortDir === "asc" ? "arrow-upward" : "arrow-downward"}
              colorsTheme={{ bg: t.chipDefaultBg, fg: t.chipDefaultFg }}
            />

            <PickerChip
              label={`Sân: ${courtFilter || "Tất cả"}`}
              onPress={() => {
                setCourtOptions(collectCourts());
                setCourtPickerOpen(true);
              }}
              icon="stadium"
              colorsTheme={{ bg: t.courtBg, fg: t.courtFg }}
            />

            <CheckChip
              checked={showBye}
              label="Hiện BYE"
              onPress={() => setShowBye((v) => !v)}
            />

            <Pill
              label={`${
                typesAvailable.length ? bracketsOfTab.length : 0
              } bracket • ${TYPE_LABEL(tab)}`}
            />
          </View>
        </View>

        <View style={[styles.tabs, { borderColor: colors.border }]}>
          {typesAvailable.map((tTab) => {
            const active = tTab.type === tab;
            return (
              <Pressable
                key={tTab.type}
                onPress={() => setTab(tTab.type)}
                style={({ pressed }) => [
                  styles.tabItem,
                  {
                    backgroundColor: active ? colors.primary : "transparent",
                    borderColor: active ? colors.primary : colors.border,
                  },
                  pressed && { opacity: 0.95 },
                ]}
              >
                <Text
                  style={{
                    color: active ? "#fff" : colors.text,
                    fontWeight: "700",
                  }}
                >
                  {TYPE_LABEL(tTab.type)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <FlatList
          data={bracketsOfTab}
          keyExtractor={(b) => String(b._id)}
          renderItem={renderBracket}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          refreshing={refreshing || tourFetching || brFetching || mFetching}
          onRefresh={onRefresh}
          contentContainerStyle={{
            paddingBottom: 24 + (selectedMatchIds.size > 0 ? 70 : 0),
          }}
          ListEmptyComponent={
            <View
              style={[
                styles.alert,
                { borderColor: t.infoBorder, backgroundColor: t.infoBg },
              ]}
            >
              <Text style={{ color: t.infoText }}>
                Chưa có bracket thuộc loại {TYPE_LABEL(tab)}.
              </Text>
            </View>
          }
          extraData={`${liveBump}|${selBump}|${courtFilter}|${showBye}`}
          removeClippedSubviews={Platform.OS === "android"}
          maxToRenderPerBatch={3}
          windowSize={5}
        />

        <ResponsiveMatchViewer
          open={viewer.open}
          matchId={viewer.matchId}
          onClose={closeMatch}
        />

        {selectedMatchIds.size > 0 && (
          <View
            style={[
              styles.bottomBar,
              {
                paddingBottom: 8 + insets.bottom,
                backgroundColor: colors.card,
                borderTopColor: colors.border,
              },
            ]}
          >
            <View
              style={[
                styles.bottomRow,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Pill
                label={`Đã chọn ${selectedMatchIds.size} trận`}
                kind="primary"
              />

              <View style={{ flex: 1 }}>
                <EdgeFadedHScroll
                  contentContainerStyle={styles.bottomActions}
                  bgColor={colors.card}
                  chevronColor={t.muted}
                  style={{ maxHeight: 40 }}
                >
                  <BtnOutline onPress={() => setBatchRefDlg({ open: true })}>
                    <Text style={{ fontWeight: "700", color: colors.text }}>
                      Gán trọng tài
                    </Text>
                  </BtnOutline>

                  <BtnOutline
                    onPress={() => setBatchVideoDlg({ open: true, url: "" })}
                  >
                    <Text style={{ fontWeight: "700", color: colors.text }}>
                      Gán video
                    </Text>
                  </BtnOutline>

                  <BtnOutline onPress={clearSelection}>
                    <Text style={{ fontWeight: "700", color: colors.text }}>
                      Bỏ chọn
                    </Text>
                  </BtnOutline>
                </EdgeFadedHScroll>
              </View>
            </View>
          </View>
        )}

        {/* ==== Header Menu ==== */}
        <Modal
          visible={hdrMenuOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setHdrMenuOpen(false)}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setHdrMenuOpen(false)}
          >
            <View />
          </Pressable>
          <View
            style={[
              styles.menuCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <MenuItem
              icon="how-to-reg"
              label="Quản lý trọng tài"
              onPress={() => {
                setHdrMenuOpen(false);
                setRefMgrOpen(true);
              }}
            />
            <MenuItem
              icon="stadium"
              label="Quản lý sân"
              onPress={() => {
                setHdrMenuOpen(false);
                setCourtMgrSheet({ open: true, bracket: null });
              }}
            />
            <MenuItem
              icon="movie"
              label="Thiết lập LIVE"
              onPress={() => {
                setHdrMenuOpen(false);
                setLiveSetupSheet({ open: true, bracket: null });
              }}
            />
            <View style={{ height: 8 }} />
            <MenuItem
              icon="picture-as-pdf"
              label="Xuất PDF"
              onPress={handleExportPDF}
            />
            <MenuItem
              icon="description"
              label="Xuất Word"
              onPress={handleExportWord}
            />
            <MenuItem
              icon="home"
              label="Trang giải"
              onPress={() => {
                setHdrMenuOpen(false);
                router.push(`/tournament/${tid}/home`);
              }}
            />
            {isAdmin && (
              <MenuItem
                icon="casino"
                label="Bốc thăm"
                onPress={() => {
                  setHdrMenuOpen(false);
                  router.push(`/tournament/${tid}/draw`);
                }}
              />
            )}
          </View>
        </Modal>

        {/* ====== Single video modal (✅ WITH KEYBOARD FIX) ====== */}
        <Modal
          visible={videoDlg.open}
          transparent
          animationType="fade"
          onRequestClose={closeVideoDlg}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ flex: 1 }}
          >
            <View style={styles.modalBackdrop}>
              <Pressable style={{ flex: 1 }} onPress={closeVideoDlg} />
              <View
                style={[
                  styles.modalCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
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
                    {(videoDlg?.match &&
                      (videoDlg.match.code || matchCode(videoDlg.match))) ||
                      ""}{" "}
                    — Link video
                  </Text>
                  <IconBtn
                    name="close"
                    color={colors.text}
                    size={20}
                    onPress={closeVideoDlg}
                  />
                </View>

                <View
                  style={[styles.inputWrap, { borderColor: colors.border }]}
                >
                  <MaterialIcons name="link" size={18} color={t.muted} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="URL video (YouTube/Facebook/TikTok/M3U8...)"
                    placeholderTextColor={t.placeholder}
                    value={videoDlg.url}
                    onChangeText={(s) => setVideoDlg((v) => ({ ...v, url: s }))}
                  />
                </View>

                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "flex-end",
                    gap: 8,
                    marginTop: 10,
                  }}
                >
                  <BtnOutline onPress={closeVideoDlg}>Đóng</BtnOutline>
                  <BtnOutline onPress={onSaveVideo}>
                    <Text style={{ color: colors.text, fontWeight: "700" }}>
                      Lưu
                    </Text>
                  </BtnOutline>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* ====== Batch Referee modal (✅ FIXED LAYOUT) ====== */}
        <BatchAssignRefModal
          visible={batchRefDlg.open}
          onClose={() => setBatchRefDlg({ open: false })}
          tournamentId={tid /* hoặc tournamentId bạn đang có */}
          selectedMatchIds={selectedMatchIds}
          colors={colors}
          t={t}
          styles={styles}
          IconBtn={IconBtn}
          BtnOutline={BtnOutline}
          onAssigned={() => {
            refetchMatches?.();
          }}
        />

        {/* ====== Batch Video modal (✅ WITH KEYBOARD FIX) ====== */}
        <Modal
          visible={batchVideoDlg.open}
          transparent
          animationType="fade"
          onRequestClose={() => setBatchVideoDlg({ open: false, url: "" })}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ flex: 1 }}
          >
            <View style={styles.modalBackdrop}>
              <Pressable
                style={{ flex: 1 }}
                onPress={() => setBatchVideoDlg({ open: false, url: "" })}
              />
              <View
                style={[
                  styles.modalCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
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
                    Gán video cho {selectedMatchIds.size} trận
                  </Text>
                  <IconBtn
                    name="close"
                    color={colors.text}
                    size={20}
                    onPress={() => setBatchVideoDlg({ open: false, url: "" })}
                  />
                </View>

                <View
                  style={[styles.inputWrap, { borderColor: colors.border }]}
                >
                  <MaterialIcons name="link" size={18} color={t.muted} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="URL video (Facebook/YouTube/M3U8...)"
                    placeholderTextColor={t.placeholder}
                    value={batchVideoDlg.url}
                    onChangeText={(s) =>
                      setBatchVideoDlg((v) => ({ ...v, url: s }))
                    }
                  />
                </View>

                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "flex-end",
                    gap: 8,
                    marginTop: 10,
                  }}
                >
                  <BtnOutline
                    onPress={() => setBatchVideoDlg({ open: false, url: "" })}
                  >
                    Đóng
                  </BtnOutline>
                  <Pressable
                    onPress={submitBatchSetVideo}
                    style={({ pressed }) => [
                      styles.primaryBtn,
                      {
                        backgroundColor: colors.primary,
                        opacity: pressed || batchingVideo ? 0.9 : 1,
                      },
                    ]}
                    disabled={
                      batchingVideo ||
                      !batchVideoDlg.url.trim() ||
                      selectedMatchIds.size === 0
                    }
                  >
                    <Text style={{ color: "#fff", fontWeight: "800" }}>
                      Gán
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* ===== Court Picker modal ===== */}
        <Modal
          visible={courtPickerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setCourtPickerOpen(false)}
        >
          <View style={styles.modalBackdrop}>
            <Pressable
              style={{ flex: 1 }}
              onPress={() => setCourtPickerOpen(false)}
            />
            <View
              style={[
                styles.modalCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
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
                  Chọn sân để lọc
                </Text>
                <IconBtn
                  name="close"
                  color={colors.text}
                  size={20}
                  onPress={() => setCourtPickerOpen(false)}
                />
              </View>

              <ScrollView style={{ maxHeight: 320 }}>
                <Pressable
                  onPress={() => {
                    setCourtFilter("");
                    setCourtPickerOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.refRow,
                    { borderColor: colors.border },
                    pressed && { opacity: 0.9 },
                  ]}
                >
                  <MaterialIcons
                    name={
                      !courtFilter
                        ? "radio-button-checked"
                        : "radio-button-unchecked"
                    }
                    size={18}
                    color={!courtFilter ? colors.primary : t.muted}
                    style={{ marginRight: 8 }}
                  />
                  <Text style={{ color: colors.text, fontWeight: "700" }}>
                    Tất cả sân
                  </Text>
                </Pressable>

                {courtOptions.length === 0 ? (
                  <Text style={{ color: t.muted, paddingVertical: 8 }}>
                    Chưa có sân nào.
                  </Text>
                ) : (
                  courtOptions.map((c) => {
                    const chosen = courtFilter === c;
                    return (
                      <Pressable
                        key={c}
                        onPress={() => {
                          setCourtFilter(c);
                          setCourtPickerOpen(false);
                        }}
                        style={({ pressed }) => [
                          styles.refRow,
                          { borderColor: colors.border },
                          pressed && { opacity: 0.9 },
                        ]}
                      >
                        <MaterialIcons
                          name={
                            chosen
                              ? "radio-button-checked"
                              : "radio-button-unchecked"
                          }
                          size={18}
                          color={chosen ? colors.primary : t.muted}
                          style={{ marginRight: 8 }}
                        />
                        <Text style={{ color: colors.text, fontWeight: "700" }}>
                          {c}
                        </Text>
                      </Pressable>
                    );
                  })
                )}
              </ScrollView>

              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "flex-end",
                  gap: 8,
                  marginTop: 10,
                }}
              >
                <BtnOutline onPress={() => setCourtPickerOpen(false)}>
                  Đóng
                </BtnOutline>
              </View>
            </View>
          </View>
        </Modal>

        <ManageRefereesSheet
          open={refMgrOpen}
          onClose={() => setRefMgrOpen(false)}
          tournamentId={tid}
          onChanged={() => {
            refetchMatches?.();
            refetchBrackets?.();
          }}
        />
        <AssignCourtSheet
          open={assignCourtSheet.open}
          onClose={() => setAssignCourtSheet({ open: false, match: null })}
          match={assignCourtSheet.match}
          tournamentId={tid}
          onAssigned={() => refetchMatches?.()}
        />
        <AssignRefSheet
          open={assignRefSheet.open}
          onClose={() => setAssignRefSheet({ open: false, match: null })}
          match={assignRefSheet.match}
          tournamentId={tid}
          onChanged={() => refetchMatches?.()}
        />
        <CourtManagerSheet
          open={courtMgrSheet.open}
          onClose={() => setCourtMgrSheet({ open: false, bracket: null })}
          tournamentId={tid}
          bracketId={null}
          bracketName=""
          tournamentName={tour?.name || ""}
        />
        <LiveSetupSheet
          open={liveSetupSheet.open}
          onClose={() => setLiveSetupSheet({ open: false, bracket: null })}
          tournamentId={tid}
          bracketId={null}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  alert: { borderWidth: 1, borderRadius: 12, padding: 12 },
  toolbar: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
    gap: 10,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  input: { flex: 1, fontSize: 14, paddingVertical: 4 },
  tabs: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    paddingVertical: 6,
    borderBottomWidth: 1,
    marginBottom: 12,
  },
  tabItem: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  bracketTitle: { fontSize: 16, fontWeight: "800" },
  emptyBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },

  matchRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    position: "relative",
  },

  selectRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    marginBottom: 8,
  },

  contentBlock: { gap: 6, marginTop: 6 },
  code: { fontSize: 14, fontWeight: "800" },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },

  miniBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  actionsWrap: { paddingRight: 6, gap: 6, alignItems: "center" },

  fadeLeft: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 60, // Tăng từ 40 lên 60
  },
  fadeRight: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 60, // Tăng từ 40 lên 60
  },
  chev: {
    position: "absolute",
    top: "50%",
    transform: [{ translateY: -8 }],
  },

  selectAllRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.12,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: -2 },
      },
      android: { elevation: 10 },
    }),
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
  },
  bottomActions: {
    gap: 8,
    alignItems: "center",
    paddingRight: 6,
  },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
  modalCard: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 20,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
  },
  menuCard: {
    position: "absolute",
    right: 12,
    top: 105,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 6,
    minWidth: 220,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  refRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  primaryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
});
