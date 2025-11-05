import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  useWindowDimensions,
  View,
  Platform,
  Linking,
  Alert,
  Animated,
  RefreshControl,
  InteractionManager,
} from "react-native";
import {
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetBackdrop,
} from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { normalizeUri, normalizeUrl } from "@/utils/normalizeUri";
import {
  useGetPublicProfileQuery,
  useGetRatingHistoryQuery,
  useGetMatchHistoryQuery,
  useDeleteRatingHistoryMutation,
  useGetUserAchievementsQuery,
} from "@/slices/usersApiSlice";
import PaginationRN from "./PaginationRN";
import { Image as ExpoImage } from "expo-image";
import * as Clipboard from "expo-clipboard";
import { MaterialIcons } from "@expo/vector-icons";
import { useSelector } from "react-redux";
import { skipToken } from "@reduxjs/toolkit/query";
import { useTheme } from "@react-navigation/native";

/* ---------- helpers ---------- */
const AVA_PLACE = "https://dummyimage.com/160x160/cccccc/ffffff&text=?";
const TEXT_PLACE = "—";
const GENDER_LABEL: Record<string, string> = {
  male: "Nam",
  female: "Nữ",
  other: "Khác",
};

const safe = (v: any, fb = TEXT_PLACE) => {
  if (v === null || v === undefined || v === "") return fb;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "unspecified") return "Chưa xác định";
    if (GENDER_LABEL[s]) return GENDER_LABEL[s];
    return v;
  }
  return v;
};
const num = (v: any, digits = 3) =>
  Number.isFinite(v) ? Number(v).toFixed(digits) : TEXT_PLACE;
const fmtDate = (iso?: string) => {
  if (!iso) return TEXT_PLACE;
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};
const fmtDT = (iso?: string) => {
  if (!iso) return TEXT_PLACE;
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
};
/** "11-9, 8-11; 11-7" -> ["G1: 11-9", "G2: 8-11", "G3: 11-7"] */
function toScoreLines(m: any) {
  if (Array.isArray(m?.gameScores) && m.gameScores.length) {
    return m.gameScores.map((g: any, i: number) => {
      const a = g?.a ?? g?.A ?? g?.left ?? g?.teamA ?? g?.scoreA ?? "–";
      const b = g?.b ?? g?.B ?? g?.right ?? g?.teamB ?? g?.scoreB ?? "–";
      return `G${i + 1}: ${a}–${b}`;
    });
  }
  const s = String(m?.scoreText || "").trim();
  if (!s) return [];
  return s
    .split(/[;,]/)
    .map((x, i) => `G${i + 1}: ${x.trim()}`)
    .filter(Boolean);
}

/** Ưu tiên lấy tên & nick từ user lồng */
function getNameNick(u: any) {
  const trim = (v: any) => (typeof v === "string" ? v.trim() : "");
  const displayName = (x: any) =>
    trim(x?.fullName) ||
    trim(x?.name) ||
    trim(x?.displayName) ||
    trim(x?.username) ||
    "";
  const displayNick = (x: any) =>
    trim(x?.nickName) || trim(x?.nickname) || trim(x?.nick) || "";
  const name = displayName(u?.user || {}) || displayName(u);
  const nick = displayNick(u?.user || {}) || displayNick(u);
  return { name, nick };
}

/** Lấy điểm SportConnect */
function getSPC(base: any) {
  const s = base?.spc;
  if (!s || typeof s !== "object") return null;
  const toNum = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const m = s.meta || {};
  return {
    single: toNum(s.single),
    double: toNum(s.double),
    meta: {
      sportId: m.sportId ?? null,
      description: m.description ?? null,
      scoredAt: m.scoredAt ?? null,
      joinDate: m.joinDate ?? null,
      source: m.source ?? null,
    },
  };
}

/* ---------- skeleton helpers ---------- */
function usePulse() {
  const a = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(a, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(a, {
          toValue: 0.6,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [a]);
  return a;
}

function Skel({
  w,
  h,
  r = 8,
  style,
  bg = "#e5e7eb",
  opacity,
}: {
  w?: number | string;
  h?: number;
  r?: number;
  style?: any;
  bg?: string;
  opacity?: any;
}) {
  return (
    <Animated.View
      style={[
        { width: w, height: h, borderRadius: r, backgroundColor: bg, opacity },
        style,
      ]}
    />
  );
}
function SkelChip({ w = 80, h = 20, style, bg, opacity }: any) {
  return <Skel w={w} h={h} r={10} style={style} bg={bg} opacity={opacity} />;
}

/* ---------- UI atoms ---------- */
const Chip = ({ label, bg, fg }: any) => {
  const navTheme = useTheme?.() || {};
  const sysScheme = useColorScheme?.() || "light";
  const isDark =
    typeof navTheme.dark === "boolean" ? navTheme.dark : sysScheme === "dark";
  const defaultBg = isDark ? "#22262c" : "#eef2f7";
  const defaultFg = isDark ? "#e5e7eb" : "#263238";
  return (
    <View style={[styles.chip, { backgroundColor: bg ?? defaultBg }]}>
      <Text
        numberOfLines={1}
        style={[styles.chipTxt, { color: fg ?? defaultFg }]}
      >
        {label}
      </Text>
    </View>
  );
};

function PrimaryBtn({ onPress, children, disabled }: any) {
  const navTheme = useTheme?.() || {};
  const sysScheme = useColorScheme?.() || "light";
  const isDark =
    typeof navTheme.dark === "boolean" ? navTheme.dark : sysScheme === "dark";
  const tint = navTheme?.colors?.primary ?? (isDark ? "#7cc0ff" : "#0a84ff");
  const disabledBg = isDark ? "#374151" : "#cbd5e1";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: disabled ? disabledBg : tint },
        pressed && !disabled && { opacity: 0.9 },
      ]}
    >
      <Text style={styles.btnWhite}>{children}</Text>
    </Pressable>
  );
}
function OutlineBtn({ onPress, children, disabled }: any) {
  const navTheme = useTheme?.() || {};
  const sysScheme = useColorScheme?.() || "light";
  const isDark =
    typeof navTheme.dark === "boolean" ? navTheme.dark : sysScheme === "dark";
  const tint = navTheme?.colors?.primary ?? (isDark ? "#7cc0ff" : "#0a84ff");
  const disabledBorder = isDark ? "#4b5563" : "#c7c7c7";
  const disabledText = isDark ? "#6b7280" : "#9aa0a6";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        styles.btnOutline,
        { borderColor: disabled ? disabledBorder : tint },
        pressed && !disabled && { opacity: 0.95 },
      ]}
    >
      <Text
        style={{ fontWeight: "700", color: disabled ? disabledText : tint }}
      >
        {children}
      </Text>
    </Pressable>
  );
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  const navTheme = useTheme();
  const scheme = useColorScheme() || "light";
  const isDark =
    typeof navTheme?.dark === "boolean" ? navTheme.dark : scheme === "dark";
  const muted = isDark ? "#9aa0a6" : "#6b7280";
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: muted }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: muted }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function CopyButton({
  text,
  label,
  tint,
  onCopied,
}: {
  text?: string;
  label: string;
  tint: string;
  onCopied: (msg: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  if (!text) return null;
  const doCopy = async () => {
    try {
      await Clipboard.setStringAsync(String(text));
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
      onCopied?.(`Đã sao chép ${label}`);
    } catch (e) {
      console.warn(e);
    }
  };
  return (
    <Pressable
      onPress={doCopy}
      hitSlop={8}
      style={({ pressed }) => [
        styles.copyBtn,
        { borderColor: tint },
        pressed && { opacity: 0.8 },
      ]}
    >
      <MaterialIcons
        name={copied ? "check" : "content-copy"}
        size={14}
        color={tint}
      />
      <Text style={[styles.copyTxt, { color: tint }]}>
        {copied ? "Đã chép" : "Copy"}
      </Text>
    </Pressable>
  );
}

function InfoRowWithCopy({
  label,
  value,
  copyText,
  tint,
  onCopied,
}: {
  label: string;
  value?: string;
  copyText?: string;
  tint: string;
  onCopied: (msg: string) => void;
}) {
  const navTheme = useTheme?.() || {};
  const sysScheme = useColorScheme?.() || "light";
  const isDark =
    typeof navTheme.dark === "boolean" ? navTheme.dark : sysScheme === "dark";
  const muted = isDark ? "#9aa0a6" : "#6b7280";

  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: muted }]}>{label}</Text>
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
        <Text style={[styles.infoValue, { color: muted }]} numberOfLines={2}>
          {value}
        </Text>
        <CopyButton
          text={copyText ?? value}
          label={label.toLowerCase()}
          tint={tint}
          onCopied={onCopied}
        />
      </View>
    </View>
  );
}

function Snack({
  open,
  message,
  onClose,
  bottom,
}: {
  open: boolean;
  message: string;
  onClose: () => void;
  bottom: number;
}) {
  useEffect(() => {
    if (open) {
      const t = setTimeout(onClose, 1800);
      return () => clearTimeout(t);
    }
  }, [open]);
  if (!open) return null;
  return (
    <View pointerEvents="none" style={[styles.snack, { bottom }]}>
      <Text style={styles.snackTxt}>{message}</Text>
    </View>
  );
}

/* ---------- Skeleton blocks ---------- */
const HeaderSkeleton = ({ cardBg, border, skelBg, textColor }: any) => {
  const op = usePulse();
  return (
    <View
      style={[
        styles.headerWrap,
        { backgroundColor: cardBg, borderColor: border },
      ]}
    >
      <Text style={{ fontWeight: "700", fontSize: 18, color: textColor }}>
        Hồ sơ
      </Text>
      <View
        style={{
          flexDirection: "row",
          gap: 12,
          alignItems: "center",
          marginTop: 12,
        }}
      >
        <Skel w={84} h={84} r={42} opacity={op} bg={skelBg} />
        <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
          <Skel w={"60%"} h={16} r={6} opacity={op} bg={skelBg} />
          <Skel w={90} h={12} r={6} opacity={op} bg={skelBg} />
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
            {[1, 2, 3].map((i) => (
              <SkelChip key={i} opacity={op} bg={skelBg} />
            ))}
          </View>
        </View>
      </View>
    </View>
  );
};

const InfoSectionSkeleton = ({ cardBg, border, skelBg }: any) => {
  const op = usePulse();
  return (
    <View
      style={[
        styles.sectionCard,
        { backgroundColor: cardBg, borderColor: border },
      ]}
    >
      <Skel
        w={"40%"}
        h={18}
        r={6}
        opacity={op}
        bg={skelBg}
        style={{ marginBottom: 12 }}
      />
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <Skel
          key={i}
          w={"100%"}
          h={12}
          r={6}
          opacity={op}
          bg={skelBg}
          style={{ marginBottom: 8 }}
        />
      ))}
    </View>
  );
};

const RatingSectionSkeleton = ({ cardBg, border, skelBg }: any) => {
  const op = usePulse();
  return (
    <View
      style={[
        styles.sectionCard,
        { backgroundColor: cardBg, borderColor: border, paddingTop: 10 },
      ]}
    >
      <Skel
        w={160}
        h={18}
        r={6}
        opacity={op}
        bg={skelBg}
        style={{ marginBottom: 10 }}
      />
      {Array.from({ length: 6 }).map((_, i) => (
        <View
          key={i}
          style={{
            flexDirection: "row",
            paddingVertical: 10,
            borderBottomWidth: i < 5 ? StyleSheet.hairlineWidth : 0,
            borderColor: border,
            alignItems: "center",
            gap: 12,
          }}
        >
          <Skel w={96} h={14} r={6} opacity={op} bg={skelBg} />
          <Skel w={70} h={14} r={6} opacity={op} bg={skelBg} />
          <Skel w={70} h={14} r={6} opacity={op} bg={skelBg} />
          <Skel w={"35%"} h={12} r={6} opacity={op} bg={skelBg} />
        </View>
      ))}
      <View style={{ marginTop: 8, alignItems: "flex-end" }}>
        <Skel w={120} h={26} r={8} opacity={op} bg={skelBg} />
      </View>
    </View>
  );
};

const MatchSectionSkeleton = ({ cardBg, border, pageBg, skelBg }: any) => {
  const op = usePulse();
  return (
    <View
      style={[
        styles.sectionCard,
        { backgroundColor: cardBg, borderColor: border },
      ]}
    >
      <Skel
        w={150}
        h={18}
        r={6}
        opacity={op}
        bg={skelBg}
        style={{ marginBottom: 10 }}
      />
      {Array.from({ length: 3 }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.cardRow,
            { borderColor: border, backgroundColor: pageBg, marginBottom: 10 },
          ]}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginBottom: 6,
            }}
          >
            <Skel w={70} h={18} r={6} opacity={op} bg={skelBg} />
            <Skel w={120} h={18} r={6} opacity={op} bg={skelBg} />
          </View>
          <Skel
            w={"50%"}
            h={12}
            r={6}
            opacity={op}
            bg={skelBg}
            style={{ marginBottom: 8 }}
          />
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <Skel w={"35%"} h={16} r={6} opacity={op} bg={skelBg} />
            <Skel w={80} h={16} r={6} opacity={op} bg={skelBg} />
            <Skel w={"35%"} h={16} r={6} opacity={op} bg={skelBg} />
          </View>
          <View style={{ marginTop: 8, alignItems: "flex-end" }}>
            <Skel w={100} h={26} r={8} opacity={op} bg={skelBg} />
          </View>
        </View>
      ))}
      <View style={{ marginTop: 8, alignItems: "flex-end" }}>
        <Skel w={120} h={26} r={8} opacity={op} bg={skelBg} />
      </View>
    </View>
  );
};

const AchievementsSkeleton = ({
  cardBg,
  border,
  pageBg,
  skelBg,
  textColor,
}: any) => {
  const op = usePulse();
  return (
    <View style={{ gap: 12 }}>
      <Text style={[styles.sectionTitle, { color: textColor }]}>
        Thành tích
      </Text>

      <View style={styles.kpiGrid}>
        {Array.from({ length: 4 }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.kpiCard,
              { backgroundColor: cardBg, borderColor: border },
            ]}
          >
            <Skel
              w={"70%"}
              h={14}
              r={6}
              opacity={op}
              bg={skelBg}
              style={{ marginBottom: 6 }}
            />
            <Skel
              w={80}
              h={22}
              r={6}
              opacity={op}
              bg={skelBg}
              style={{ marginBottom: 4 }}
            />
            <Skel w={"60%"} h={12} r={6} opacity={op} bg={skelBg} />
          </View>
        ))}
      </View>

      <View
        style={[
          styles.sectionCard,
          { backgroundColor: cardBg, borderColor: border },
        ]}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            marginBottom: 6,
          }}
        >
          <Skel w={"55%"} h={16} r={6} opacity={op} bg={skelBg} />
          <Skel w={80} h={28} r={8} opacity={op} bg={skelBg} />
        </View>
        {Array.from({ length: 2 }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.rowCard,
              { borderColor: border, backgroundColor: pageBg, marginBottom: 8 },
            ]}
          >
            <Skel
              w={"50%"}
              h={14}
              r={6}
              opacity={op}
              bg={skelBg}
              style={{ marginBottom: 6 }}
            />
            {Array.from({ length: 5 }).map((__, j) => (
              <View key={j} style={styles.rowLine}>
                <Skel w={70} h={12} r={6} opacity={op} bg={skelBg} />
                <Skel w={"50%"} h={12} r={6} opacity={op} bg={skelBg} />
              </View>
            ))}
          </View>
        ))}
      </View>

      <View
        style={[
          styles.sectionCard,
          { backgroundColor: cardBg, borderColor: border },
        ]}
      >
        <Skel
          w={"45%"}
          h={16}
          r={6}
          opacity={op}
          bg={skelBg}
          style={{ marginBottom: 6 }}
        />
        {Array.from({ length: 2 }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.rowCard,
              { borderColor: border, backgroundColor: pageBg, marginBottom: 8 },
            ]}
          >
            <Skel
              w={"50%"}
              h={14}
              r={6}
              opacity={op}
              bg={skelBg}
              style={{ marginBottom: 6 }}
            />
            {Array.from({ length: 5 }).map((__, j) => (
              <View key={j} style={styles.rowLine}>
                <Skel w={70} h={12} r={6} opacity={op} bg={skelBg} />
                <Skel w={"50%"} h={12} r={6} opacity={op} bg={skelBg} />
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
};

/* ---------- component ---------- */
type Props = { open: boolean; onClose: () => void; userId?: string };

export default function PublicProfileSheet({ open, onClose, userId }: Props) {
  // Chỉ mở sheet khi thật sự có userId & prop open = true
  const canOpen = !!(open && userId);
  const idArg = canOpen ? (userId as string) : (skipToken as any);
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();

  /* THEME */
  const navTheme = useTheme?.() || {};
  const sysScheme = useColorScheme?.() || "light";
  const isDark =
    typeof navTheme.dark === "boolean" ? navTheme.dark : sysScheme === "dark";
  const tint = navTheme?.colors?.primary ?? (isDark ? "#7cc0ff" : "#0a84ff");
  const text = navTheme?.colors?.text ?? (isDark ? "#f7f7f7" : "#111");
  const cardBg = navTheme?.colors?.card ?? (isDark ? "#16181c" : "#ffffff");
  const pageBg =
    navTheme?.colors?.background ?? (isDark ? "#0b0d10" : "#f7f9fc");
  const border = navTheme?.colors?.border ?? (isDark ? "#2e2f33" : "#e4e8ef");
  const subtext = isDark ? "#c9c9c9" : "#555";
  const skelBg = isDark ? "#22262c" : "#e9eef5";

  const viewerIsAdmin = useSelector(
    (s: any) =>
      !!(s?.auth?.userInfo?.isAdmin || s?.auth?.userInfo?.role === "admin")
  );

  const [sheetIndex, setSheetIndex] = useState(0);
  const pendingActionRef = useRef<null | (() => Promise<void>)>(null);

  // ✅ cờ để tránh setState sau khi sheet đã đóng / unmount
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const expandThen = async (action: () => Promise<void>) => {
    if (sheetIndex !== 1) {
      pendingActionRef.current = action;
      sheetRef.current?.snapToIndex(1);
    } else {
      await action();
    }
  };

  const [deleteHistory, { isLoading: deleting }] =
    useDeleteRatingHistoryMutation();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // snapPoints
  const topSafeGap = insets.top + 8;
  const maxPx = Math.min(winH * 0.92, winH - topSafeGap);
  const midPx = Math.max(winH * 0.6, Math.round(maxPx * 0.75));
  const snapPoints = useMemo(
    () => [Math.round(midPx), Math.round(maxPx)],
    [midPx, maxPx]
  );

  const sheetRef = useRef<BottomSheetModal>(null);

  // chặn double present/dismiss
  const presentingRef = useRef(false);
  const presentedRef = useRef(false);

  // điều khiển mở/đóng theo canOpen
  useEffect(() => {
    let mounted = true;
    if (canOpen) {
      if (presentedRef.current || presentingRef.current) return;
      presentingRef.current = true;
      requestAnimationFrame(() => {
        if (!mounted) return;
        sheetRef.current?.present();
        presentedRef.current = true;
        presentingRef.current = false;
      });
    } else {
      if (!presentedRef.current) return;
      try {
        sheetRef.current?.dismiss();
      } catch {}
      presentedRef.current = false;
    }
    return () => {
      mounted = false;
    };
  }, [canOpen]);

  // cleanup khi unmount
  useEffect(() => {
    return () => {
      try {
        sheetRef.current?.dismiss();
      } catch {}
      presentedRef.current = false;
      presentingRef.current = false;
    };
  }, []);

  const [snack, setSnack] = useState<{ open: boolean; message: string }>({
    open: false,
    message: "",
  });
  const openSnack = (m: string) =>
    setSnack({
      open: true,
      message: m,
    });
  const closeSnack = () => setSnack((s) => ({ ...s, open: false }));

  // Queries
  const baseQ = useGetPublicProfileQuery(idArg);
  const rateQ = useGetRatingHistoryQuery(idArg);
  const matchQ = useGetMatchHistoryQuery(idArg);
  const achQ = useGetUserAchievementsQuery(idArg);

  const base: any = baseQ.data || {};

  // Tabs
  const [tab, setTab] = useState(0);
  useEffect(() => {
    if (canOpen) setTab(0);
  }, [canOpen]);

  // Data + FE pagination
  const ratingRaw = Array.isArray(rateQ.data?.history)
    ? rateQ.data.history
    : rateQ.data?.items || [];
  const ratingTotal = rateQ.data?.total ?? ratingRaw.length;

  const matchRaw = Array.isArray(matchQ.data)
    ? matchQ.data
    : matchQ.data?.items || [];
  const matchTotal = matchQ.data?.total ?? matchRaw.length;

  const [ratingPage, setRatingPage] = useState(1);
  const ratingPerPage = 10;
  const [matchPage, setMatchPage] = useState(1);
  const matchPerPage = 10;

  useEffect(() => {
    if (canOpen) setRatingPage(1);
  }, [canOpen, ratingTotal]);
  useEffect(() => {
    if (canOpen) setMatchPage(1);
  }, [canOpen, matchTotal]);

  const ratingPaged = useMemo(() => {
    const start = (ratingPage - 1) * ratingPerPage;
    return ratingRaw.slice(start, start + ratingPerPage);
  }, [ratingRaw, ratingPage]);
  const matchPaged = useMemo(() => {
    const start = (matchPage - 1) * matchPerPage;
    return matchRaw.slice(start, start + matchPerPage);
  }, [matchRaw, matchPage]);

  // Zoom image
  const [zoom, setZoom] = useState({ open: false, src: "" });
  const openZoom = (src?: string) =>
    setZoom({ open: true, src: normalizeUri(src) || AVA_PLACE });
  const closeZoom = () => setZoom({ open: false, src: "" });

  // Match detail
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const openDetail = (row: any) => {
    setDetail(row);
    setDetailOpen(true);
  };

  const handleDismiss = () => {
    presentedRef.current = false;
    setZoom({ open: false, src: "" });
    setDetailOpen(false);
    onClose?.();
  };

  /* ---------- Header / Tabs ---------- */
  const Header = () => {
    const { name, nick } = getNameNick(base);
    const sc = getSPC(base);
    return (
      <View
        style={[
          styles.headerWrap,
          { backgroundColor: cardBg, borderColor: border },
        ]}
      >
        <Text style={{ color: text, fontWeight: "700", fontSize: 18 }}>
          Hồ sơ
        </Text>
        <Pressable onPress={handleDismiss} style={styles.closeBtn}>
          <Text style={{ color: "#fff", fontWeight: "700" }}>×</Text>
        </Pressable>

        <View
          style={{
            flexDirection: "row",
            gap: 12,
            alignItems: "center",
            marginTop: 12,
          }}
        >
          <Pressable
            onPress={() => openZoom(base.avatar || base?.user?.avatar)}
          >
            <ExpoImage
              source={{
                uri:
                  normalizeUrl(base.avatar || base?.user?.avatar) || AVA_PLACE,
              }}
              style={{
                width: 84,
                height: 84,
                borderRadius: 42,
                borderWidth: 1,
                borderColor: border,
              }}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={0}
            />
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            {!!name && (
              <Text
                style={{ color: text, fontWeight: "700", fontSize: 18 }}
                numberOfLines={1}
              >
                {name}
              </Text>
            )}
            {!!nick && (
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <Text style={{ color: subtext }} numberOfLines={1}>
                  @{nick}
                </Text>
                <CopyButton
                  text={nick}
                  label="nickname"
                  tint={tint}
                  onCopied={openSnack}
                />
              </View>
            )}
            {!name && !nick && (
              <Text style={{ color: subtext }}>{TEXT_PLACE}</Text>
            )}

            <View
              style={{
                flexDirection: "row",
                gap: 6,
                flexWrap: "wrap",
                marginTop: 6,
              }}
            >
              <Chip label={`Giới tính: ${safe(base.gender, "Không rõ")}`} />
              <Chip label={`Tỉnh/TP: ${safe(base.province, "Không rõ")}`} />
              <Chip label={`Tham gia: ${fmtDate(base.joinedAt)}`} />
              {sc?.single != null && (
                <Chip
                  label={`SC Đơn: ${num(sc.single)}`}
                  bg="#dcfce7"
                  fg="#166534"
                />
              )}
              {sc?.double != null && (
                <Chip
                  label={`SC Đôi: ${num(sc.double)}`}
                  bg="#fef9c3"
                  fg="#854d0e"
                />
              )}
            </View>
          </View>
        </View>
      </View>
    );
  };

  const Tabs = () => (
    <View
      style={[styles.tabs, { borderColor: border, backgroundColor: pageBg }]}
    >
      {["Thông tin", "Điểm trình", "Thi đấu", "Thành tích"].map(
        (label, idx) => {
          const active = tab === idx;
          return (
            <Pressable
              key={label}
              onPress={() => setTab(idx)}
              style={({ pressed }) => [
                styles.tabItem,
                {
                  backgroundColor: active ? tint : "transparent",
                  borderColor: active ? tint : border,
                },
                pressed && { opacity: 0.95 },
              ]}
            >
              <Text
                style={{ color: active ? "#fff" : text, fontWeight: "700" }}
              >
                {label}
              </Text>
            </Pressable>
          );
        }
      )}
    </View>
  );

  /* ---------- Info Section ---------- */
  const InfoSection = () => {
    const sc = getSPC(base);
    return (
      <View
        style={[
          styles.sectionCard,
          { backgroundColor: cardBg, borderColor: border },
        ]}
      >
        <Text style={[styles.sectionTitle, { color: text }]}>Giới thiệu</Text>
        <Text style={{ color: subtext, lineHeight: 20 }}>
          {safe(base.bio, "Chưa có")}
        </Text>

        {viewerIsAdmin && (
          <>
            <View style={{ height: 12 }} />
            <Text style={[styles.sectionTitle, { color: text }]}>
              Thông tin cơ bản
            </Text>
            <InfoRow label="Tên hiển thị" value={safe(base?.name)} />

            {safe(base?.nickname) !== TEXT_PLACE ||
            safe(base?.nickName) !== TEXT_PLACE ? (
              <InfoRowWithCopy
                label="Nickname"
                value={`@${String(
                  base?.nickname ?? base?.nickName ?? ""
                ).trim()}`}
                copyText={String(base?.nickname ?? base?.nickName ?? "")}
                tint={tint}
                onCopied={openSnack}
              />
            ) : (
              <InfoRow label="Nickname" value={TEXT_PLACE} />
            )}

            <InfoRow label="Giới tính" value={safe(base?.gender, "Không rõ")} />
            <InfoRow label="Tỉnh/TP" value={safe(base?.province, "Không rõ")} />
            <InfoRow label="Tham gia" value={fmtDate(base?.joinedAt)} />

            <View style={{ height: 12 }} />
            <Text style={[styles.sectionTitle, { color: text }]}>
              Thông tin bổ sung
            </Text>
            {base?.email ? (
              <InfoRowWithCopy
                label="Email"
                value={String(base.email)}
                tint={tint}
                onCopied={openSnack}
              />
            ) : null}
            {base?.username || base?.userName ? (
              <InfoRow
                label="Username"
                value={String(base?.username ?? base?.userName)}
              />
            ) : null}
            {base?.phone || base?.phoneNumber ? (
              <InfoRowWithCopy
                label="SĐT"
                value={String(base?.phone ?? base?.phoneNumber)}
                tint={tint}
                onCopied={openSnack}
              />
            ) : null}

            <View style={{ height: 12 }} />
            <Text style={[styles.sectionTitle, { color: text }]}>
              Thông tin sport connect
            </Text>
            {sc ? (
              <>
                {sc.single != null && (
                  <InfoRow
                    label="Sport Connect — Điểm đơn"
                    value={num(sc.single)}
                  />
                )}
                {sc.double != null && (
                  <InfoRow
                    label="Sport Connect — Điểm đôi"
                    value={num(sc.double)}
                  />
                )}
                <InfoRow
                  label="Sport Connect — Mô tả"
                  value={safe(sc.meta.description, undefined)}
                />
                <InfoRow
                  label="Sport Connect — Cập nhật"
                  value={fmtDT(sc.meta.scoredAt)}
                />
                <InfoRow
                  label="Sport Connect — Tham gia"
                  value={fmtDT(sc.meta.joinDate)}
                />
                <InfoRow
                  label="Sport Connect — Nguồn"
                  value={safe(sc.meta.source, undefined)}
                />
                {sc.meta.sportId != null && (
                  <InfoRow
                    label="Sport Connect — sportId"
                    value={String(sc.meta.sportId)}
                  />
                )}
              </>
            ) : (
              <Text style={{ color: subtext }}>Không có dữ liệu</Text>
            )}
          </>
        )}
      </View>
    );
  };

  /* ---------- Rating Section (có fix) ---------- */
  const handleDeleteHistory = (h: any) => {
    if (!viewerIsAdmin || !presentedRef.current) return;
    const historyId = h?._id ?? h?.id;
    const uid = h?.user?._id || userId;
    if (!historyId || !uid) {
      openSnack("Thiếu ID, không thể xoá.");
      return;
    }

    Alert.alert(
      "Xoá chấm trình?",
      "Bạn có chắc chắn muốn xoá mục lịch sử điểm trình này? Hành động không thể hoàn tác.",
      [
        { text: "Huỷ", style: "cancel" },
        {
          text: "Xoá",
          style: "destructive",
          onPress: () => {
            // ✅ chạy sau animation để tránh giật
            InteractionManager.runAfterInteractions(async () => {
              try {
                if (!aliveRef.current) return;
                setDeletingId(historyId);

                await deleteHistory({
                  userId: String(uid),
                  historyId: String(historyId),
                }).unwrap();

                // ✅ quan trọng: về trang 1 để tránh page > count sau khi xoá
                if (aliveRef.current) {
                  setRatingPage(1);
                }

                // ✅ refetch lại list
                await rateQ.refetch?.();

                if (aliveRef.current) {
                  openSnack("Đã xoá một mục lịch sử điểm trình.");
                }
              } catch (e: any) {
                if (aliveRef.current) {
                  openSnack(
                    e?.data?.message ||
                      e?.error ||
                      e?.message ||
                      "Xoá thất bại. Vui lòng thử lại."
                  );
                }
              } finally {
                if (aliveRef.current) {
                  setDeletingId(null);
                }
              }
            });
          },
        },
      ]
    );
  };

  const RatingSection = () => {
    if (rateQ.isLoading || rateQ.isFetching) {
      return (
        <RatingSectionSkeleton
          cardBg={cardBg}
          border={border}
          skelBg={skelBg}
        />
      );
    }
    const err = rateQ.error as any;
    return (
      <View
        style={[
          styles.sectionCard,
          { backgroundColor: cardBg, borderColor: border, paddingTop: 10 },
        ]}
      >
        <Text style={[styles.sectionTitle, { color: text }]}>
          Lịch sử điểm trình
        </Text>

        {err ? (
          <View
            style={[
              styles.alert,
              { borderColor: "#ef4444", backgroundColor: "#fee2e2" },
            ]}
          >
            <Text style={{ color: "#991b1b" }}>
              {err?.data?.message || err?.error || "Lỗi tải dữ liệu"}
            </Text>
          </View>
        ) : ratingPaged.length === 0 ? (
          <View
            style={[
              styles.alert,
              { borderColor: "#0284c7", backgroundColor: "#e0f2fe" },
            ]}
          >
            <Text style={{ color: "#075985" }}>Không có dữ liệu</Text>
          </View>
        ) : (
          <View style={{ marginTop: 6 }}>
            {ratingPaged.map((h: any, idx: number) => {
              const historyId = h?._id ?? h?.id;
              const noteText = viewerIsAdmin
                ? safe(h.note, TEXT_PLACE)
                : h.note;
              return (
                <View
                  key={historyId || `${h.scoredAt}-${idx}`}
                  style={{
                    flexDirection: "row",
                    paddingVertical: 10,
                    borderBottomWidth:
                      idx < ratingPaged.length - 1
                        ? StyleSheet.hairlineWidth
                        : 0,
                    borderColor: border,
                  }}
                >
                  <View style={{ width: 96 }}>
                    <Text style={{ color: text }}>{fmtDate(h.scoredAt)}</Text>
                  </View>

                  <View style={{ width: 90, alignItems: "flex-end" }}>
                    <Text style={{ color: text, fontWeight: "700" }}>
                      {num(h.single)}
                    </Text>
                  </View>

                  <View style={{ width: 90, alignItems: "flex-end" }}>
                    <Text style={{ color: text, fontWeight: "700" }}>
                      {num(h.double)}
                    </Text>
                  </View>

                  <View
                    style={{
                      flex: 1,
                      paddingLeft: 8,
                      flexDirection: "row",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: subtext, flex: 1 }} numberOfLines={2}>
                      {noteText}
                    </Text>

                    {viewerIsAdmin ? (
                      <Pressable
                        onPress={() => handleDeleteHistory(h)}
                        disabled={deleting && deletingId === historyId}
                        hitSlop={8}
                        style={({ pressed }) => [
                          {
                            paddingHorizontal: 6,
                            paddingVertical: Platform.OS === "android" ? 4 : 6,
                            borderRadius: 8,
                          },
                          pressed && { opacity: 0.7 },
                        ]}
                      >
                        {deleting && deletingId === historyId ? (
                          <ActivityIndicator size="small" />
                        ) : (
                          <MaterialIcons
                            name="delete-outline"
                            size={18}
                            color={isDark ? "#f87171" : "#ef4444"}
                          />
                        )}
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ marginTop: 8 }}>
          <PaginationRN
            count={Math.max(1, Math.ceil(ratingTotal / ratingPerPage))}
            page={ratingPage}
            onChange={setRatingPage}
            siblingCount={1}
            boundaryCount={1}
            showPrevNext
            size="md"
          />
        </View>
      </View>
    );
  };

  /* ---------- Match Detail Modal ---------- */
  const MatchDetailModal = () => {
    if (!detail) return null;
    const scoreLines = toScoreLines(detail);
    const winnerA = detail?.winner === "A";
    const winnerB = detail?.winner === "B";
    const videoUrl = normalizeUri(detail?.video);

    return (
      <Modal
        visible={detailOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={{ flex: 1 }} onPress={() => setDetailOpen(false)} />
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: cardBg,
                borderColor: border,
                paddingRight: 44,
              },
            ]}
          >
            <Pressable
              onPress={() => setDetailOpen(false)}
              style={styles.closeBtn}
              hitSlop={10}
            >
              <Text style={{ color: "#fff", fontWeight: "700" }}>×</Text>
            </Pressable>

            <Text
              style={{
                color: text,
                fontWeight: "700",
                fontSize: 16,
                marginBottom: 8,
              }}
            >
              Chi tiết trận đấu
            </Text>

            <View
              style={{
                flexDirection: "row",
                gap: 8,
                flexWrap: "wrap",
                marginBottom: 6,
              }}
            >
              <Chip
                label={`Mã: ${safe(
                  detail?.code,
                  String(detail?._id || "").slice(-5)
                )}`}
                bg="#dbeafe"
                fg="#1e3a8a"
              />
              <Chip
                label={`Thời gian: ${fmtDT(detail?.dateTime)}`}
                bg="#e0f2fe"
                fg="#075985"
              />
              <Chip
                label={`Kết quả: ${safe(detail?.winner, "—")}`}
                bg="#dcfce7"
                fg="#166534"
              />
            </View>

            <Text style={{ color: subtext }} numberOfLines={2}>
              {safe(detail?.tournament?.name, "—")}
            </Text>

            <View style={{ height: 10 }} />
            <View
              style={{
                flexDirection: "row",
                gap: 12,
                alignItems: "flex-start",
              }}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: subtext, fontSize: 12 }}>Đội 1</Text>
                <PlayerCell players={detail?.team1} highlight={winnerA} />
              </View>
              <View
                style={{
                  minWidth: 110,
                  alignItems: "center",
                  alignSelf: "center",
                }}
              >
                <Text style={{ color: subtext, fontSize: 12 }}>Tỷ số</Text>
                {scoreLines.length ? (
                  scoreLines.map((s, i) => (
                    <Text key={i} style={{ color: text, fontWeight: "800" }}>
                      {s}
                    </Text>
                  ))
                ) : (
                  <Text style={{ color: text, fontWeight: "800" }}>
                    {safe(detail?.scoreText)}
                  </Text>
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: subtext, fontSize: 12 }}>Đội 2</Text>
                <PlayerCell players={detail?.team2} highlight={winnerB} />
              </View>
            </View>

            <View style={{ height: 12 }} />
            {videoUrl ? (
              <PrimaryBtn onPress={() => Linking.openURL(videoUrl)}>
                Xem video
              </PrimaryBtn>
            ) : (
              <View
                style={[
                  styles.alert,
                  {
                    borderColor: isDark ? "#3f3f46" : "#9aa0a6",
                    backgroundColor: isDark ? "#27272a" : "#f4f4f5",
                  },
                ]}
              >
                <Text style={{ color: subtext }}>Không có video</Text>
              </View>
            )}
          </View>
          <Pressable style={{ flex: 1 }} onPress={() => setDetailOpen(false)} />
        </View>
      </Modal>
    );
  };

  /* ---------- Match Section ---------- */
  const PlayerCell = ({ players = [], highlight = false }: any) => {
    if (!players.length) return <Text style={{ color: subtext }}>—</Text>;
    return (
      <View style={{ gap: 6 }}>
        {players.map((p: any, idx: number) => {
          const up = (p?.delta ?? 0) > 0;
          const down = (p?.delta ?? 0) < 0;
          const hasScore =
            Number.isFinite(p?.preScore) || Number.isFinite(p?.postScore);
          const avatarSrc =
            normalizeUri(p?.avatar || p?.user?.avatar) || AVA_PLACE;
          const { name, nick } = getNameNick(p);
          const line1 =
            (nick && name ? `${name} (${nick})` : nick || name) || TEXT_PLACE;

          return (
            <View
              key={`${p?._id || p?.name || idx}`}
              style={[
                {
                  flexDirection: "row",
                  gap: 8,
                  alignItems: "center",
                  padding: 2,
                  borderRadius: 6,
                },
                highlight && {
                  backgroundColor: "rgba(16,185,129,0.15)",
                  paddingRight: 8,
                },
              ]}
            >
              <Pressable onPress={() => openZoom(avatarSrc)}>
                <ExpoImage
                  source={{ uri: normalizeUrl(avatarSrc) }}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: border,
                  }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={0}
                />
              </Pressable>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: text }} numberOfLines={1}>
                  {line1}
                </Text>
                {hasScore ? (
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 6,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <Text style={{ color: subtext, fontSize: 12 }}>
                      {num(p?.preScore)}
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "700",
                        color: up ? "#16a34a" : down ? "#ef4444" : text,
                      }}
                    >
                      {num(p?.postScore)}
                    </Text>
                    {Number.isFinite(p?.delta) && p?.delta !== 0 && (
                      <Text
                        style={{
                          fontSize: 12,
                          color: p.delta > 0 ? "#16a34a" : "#ef4444",
                        }}
                      >
                        {p.delta > 0 ? "▲" : "▼"} {Math.abs(p.delta).toFixed(3)}
                      </Text>
                    )}
                  </View>
                ) : (
                  <Text style={{ color: subtext, fontSize: 12 }}>
                    Chưa có điểm
                  </Text>
                )}
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  const MatchSection = () => {
    if (matchQ.isLoading || matchQ.isFetching) {
      return (
        <MatchSectionSkeleton
          cardBg={cardBg}
          border={border}
          pageBg={pageBg}
          skelBg={skelBg}
        />
      );
    }
    const err = matchQ.error as any;
    return (
      <View
        style={[
          styles.sectionCard,
          { backgroundColor: cardBg, borderColor: border },
        ]}
      >
        <Text style={[styles.sectionTitle, { color: text }]}>
          Lịch sử thi đấu
        </Text>

        {err ? (
          <View
            style={[
              styles.alert,
              { borderColor: "#ef4444", backgroundColor: "#fee2e2" },
            ]}
          >
            <Text style={{ color: "#991b1b" }}>
              {err?.data?.message || err?.error || "Lỗi tải dữ liệu"}
            </Text>
          </View>
        ) : matchPaged.length === 0 ? (
          <View
            style={[
              styles.alert,
              { borderColor: "#0284c7", backgroundColor: "#e0f2fe" },
            ]}
          >
            <Text style={{ color: "#075985" }}>Không có dữ liệu</Text>
          </View>
        ) : (
          <View style={{ gap: 10, marginTop: 6 }}>
            {matchPaged.map((m: any) => {
              const winnerA = m?.winner === "A";
              const winnerB = m?.winner === "B";
              const scoreLines = toScoreLines(m);
              const videoUrl = normalizeUri(m?.video);

              return (
                <Pressable
                  key={m._id || m.code}
                  onPress={() => openDetail(m)}
                  style={[styles.cardRow, { borderColor: border }]}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 6,
                    }}
                  >
                    <Chip
                      label={safe(m.code, String(m._id || "").slice(-5))}
                      bg="#dbeafe"
                      fg="#1e3a8a"
                    />
                    <Chip label={fmtDT(m.dateTime)} bg="#e0f2fe" fg="#075985" />
                  </View>

                  <Text
                    style={{ color: subtext, marginBottom: 8 }}
                    numberOfLines={1}
                  >
                    {safe(m?.tournament?.name)}
                  </Text>

                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "flex-start",
                      gap: 8,
                    }}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <PlayerCell players={m.team1} highlight={winnerA} />
                    </View>
                    <View
                      style={{
                        minWidth: 90,
                        alignItems: "center",
                        alignSelf: "center",
                      }}
                    >
                      {scoreLines.length ? (
                        scoreLines.map((s, i) => (
                          <Text
                            key={i}
                            style={{ color: text, fontWeight: "800" }}
                          >
                            {s}
                          </Text>
                        ))
                      ) : (
                        <Text style={{ color: text, fontWeight: "800" }}>
                          {safe(m.scoreText)}
                        </Text>
                      )}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <PlayerCell players={m.team2} highlight={winnerB} />
                    </View>
                  </View>

                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "flex-end",
                      marginTop: 8,
                    }}
                  >
                    {videoUrl ? (
                      <OutlineBtn onPress={() => Linking.openURL(videoUrl)}>
                        Xem video
                      </OutlineBtn>
                    ) : (
                      <Chip label="Không có video" bg="#f4f4f5" fg="#52525b" />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        <View style={{ marginTop: 8 }}>
          <PaginationRN
            count={Math.max(1, Math.ceil(matchTotal / matchPerPage))}
            page={matchPage}
            onChange={setMatchPage}
            siblingCount={1}
            boundaryCount={1}
            showPrevNext
            size="md"
          />
        </View>

        <MatchDetailModal />
      </View>
    );
  };

  /* ---------- Achievements ---------- */
  const AchievementsSection = () => {
    const { data, isLoading, isFetching, error, refetch } = achQ;

    const sum = data?.summary || {};
    const perT = Array.isArray(data?.perTournament) ? data.perTournament : [];
    const perB = Array.isArray(data?.perBracket) ? data.perBracket : [];
    const fmtRate = (v: any) => (Number.isFinite(v) ? `${v.toFixed(1)}%` : "—");

    const topStyle = (k?: number) => {
      if (!Number.isFinite(k) || (k as number) > 8) {
        return { bg: "#ECEFF4", fg: "#374151" };
      }
      if (k === 1) return { bg: "#dcfce7", fg: "#166534" };
      if (k === 2) return { bg: "#fef9c3", fg: "#854d0e" };
      if ((k as number) <= 4) return { bg: "#e0e7ff", fg: "#3730a3" };
      return { bg: "#e0f2fe", fg: "#075985" };
    };

    const KpiCard = ({
      title,
      value,
      sub,
    }: {
      title: string;
      value: any;
      sub?: string;
    }) => (
      <View
        style={[
          styles.kpiCard,
          { backgroundColor: cardBg, borderColor: border },
        ]}
      >
        <Text style={{ color: text, fontWeight: "700" }} numberOfLines={1}>
          {title}
        </Text>
        <Text style={{ color: text, fontWeight: "800", fontSize: 22 }}>
          {value}
        </Text>
        {sub ? (
          <Text style={{ color: subtext }} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
    );

    if (isLoading || isFetching) {
      return (
        <AchievementsSkeleton
          cardBg={cardBg}
          border={border}
          pageBg={pageBg}
          skelBg={skelBg}
          textColor={text}
        />
      );
    }

    if (error)
      return (
        <View
          style={[
            styles.sectionCard,
            { backgroundColor: cardBg, borderColor: border },
          ]}
        >
          <View
            style={[
              styles.alert,
              { borderColor: "#ef4444", backgroundColor: "#fee2e2" },
            ]}
          >
            <Text style={{ color: "#991b1b" }}>
              {(error as any)?.data?.message ||
                (error as any)?.error ||
                "Lỗi tải dữ liệu thành tích"}
            </Text>
          </View>
        </View>
      );

    return (
      <View style={{ gap: 12 }}>
        <Text style={[styles.sectionTitle, { color: text }]}>Thành tích</Text>

        <View style={styles.kpiGrid}>
          <KpiCard
            title="Tổng trận có kết quả"
            value={sum.totalPlayed ?? 0}
            sub={
              <>
                Thắng {sum.wins ?? 0} / Thua {sum.losses ?? 0} —{" "}
                {fmtRate(sum.winRate)}
              </>
            }
          />
          <KpiCard
            title="Danh hiệu"
            value={sum.titles ?? 0}
            sub={`Thắng ${sum.wins ?? 0} / Thua ${sum.losses ?? 0} — ${fmtRate(
              sum.winRate
            )}`}
          />
          <KpiCard
            title="Thành tích cao nhất"
            value={sum.careerBestLabel ?? "—"}
            sub={`Top cao nhất: ${sum.careerBestLabel ?? 0}`}
          />
          <KpiCard
            title="Streak"
            value={sum.currentStreak ?? 0}
            sub={`Dài nhất: ${sum.longestWinStreak ?? 0}`}
          />
        </View>

        <View
          style={[
            styles.sectionCard,
            { backgroundColor: cardBg, borderColor: border },
          ]}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 6,
            }}
          >
            <Text style={{ color: text, fontWeight: "700" }}>
              Top theo giải (kết quả tốt nhất mỗi giải)
            </Text>
            <OutlineBtn
              disabled={isFetching}
              onPress={() => expandThen(refetch)}
            >
              {isFetching ? "Đang làm mới..." : "Làm mới"}
            </OutlineBtn>
          </View>

          {!perT.length ? (
            <Text style={{ color: subtext }}>Chưa có dữ liệu</Text>
          ) : (
            <View style={{ gap: 8 }}>
              {perT.map((r: any, i: number) => {
                const { bg, fg } = topStyle(r?.topK);
                return (
                  <View
                    key={`${r?.tournamentName}-${r?.bracketName}-${i}`}
                    style={[
                      styles.rowCard,
                      { borderColor: border, backgroundColor: pageBg },
                    ]}
                  >
                    <Text style={[styles.rowTitle, { color: text }]}>
                      {r.tournamentName}
                    </Text>
                    <View style={styles.rowLine}>
                      <Text style={[styles.rowLabel, { color: subtext }]}>
                        Bracket
                      </Text>
                      <Text style={{ color: text, fontWeight: "700" }}>
                        {r.bracketName}
                      </Text>
                    </View>
                    <View style={styles.rowLine}>
                      <Text style={[styles.rowLabel, { color: subtext }]}>
                        Draw
                      </Text>
                      <Text style={{ color: text }}>{r.drawSize}</Text>
                    </View>
                    <View style={styles.rowLine}>
                      <Text style={[styles.rowLabel, { color: subtext }]}>
                        Top
                      </Text>
                      <Chip
                        label={
                          r.positionLabel || (r.topK ? `Top ${r.topK}` : "—")
                        }
                        bg={bg}
                        fg={fg}
                      />
                    </View>
                    <View style={styles.rowLine}>
                      <Text style={[styles.rowLabel, { color: subtext }]}>
                        Giai đoạn
                      </Text>
                      <Text style={{ color: text }}>{r.season ?? "—"}</Text>
                    </View>
                    <View style={styles.rowLine}>
                      <Text style={[styles.rowLabel, { color: subtext }]}>
                        Cuối cùng
                      </Text>
                      <Text style={{ color: text }}>
                        {r.lastMatchAt ? fmtDT(r.lastMatchAt) : "—"}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <View
          style={[
            styles.sectionCard,
            { backgroundColor: cardBg, borderColor: border },
          ]}
        >
          <Text style={{ color: text, fontWeight: "700", marginBottom: 6 }}>
            Chi tiết theo Bracket
          </Text>
          {!perB.length ? (
            <Text style={{ color: subtext }}>Chưa có dữ liệu</Text>
          ) : (
            <View style={{ gap: 8 }}>
              {perB.map((r: any, i: number) => {
                const { bg, fg } = topStyle(r?.topK);
                return (
                  <View
                    key={`${r?.tournamentName}-${r?.bracketName}-${i}`}
                    style={[
                      styles.rowCard,
                      { borderColor: border, backgroundColor: pageBg },
                    ]}
                  >
                    <Text style={[styles.rowTitle, { color: text }]}>
                      {r.tournamentName}
                    </Text>
                    <View style={styles.rowLine}>
                      <Text style={[styles.rowLabel, { color: subtext }]}>
                        Bracket
                      </Text>
                      <Text style={{ color: text, fontWeight: "700" }}>
                        {r.bracketName}
                      </Text>
                    </View>
                    <View style={styles.rowLine}>
                      <Text style={[styles.rowLabel, { color: subtext }]}>
                        Draw
                      </Text>
                      <Text style={{ color: text }}>{r.drawSize}</Text>
                    </View>
                    <View style={styles.rowLine}>
                      <Text style={[styles.rowLabel, { color: subtext }]}>
                        Top
                      </Text>
                      <Chip
                        label={
                          r.positionLabel || (r.topK ? `Top ${r.topK}` : "—")
                        }
                        bg={bg}
                        fg={fg}
                      />
                    </View>
                    <View style={styles.rowLine}>
                      <Text style={[styles.rowLabel, { color: subtext }]}>
                        W/L/WR
                      </Text>
                      <Text style={{ color: text }}>
                        {r.stats?.wins ?? 0}/{r.stats?.losses ?? 0} •{" "}
                        {Number.isFinite(r.stats?.winRate)
                          ? `${r.stats.winRate.toFixed(1)}%`
                          : "—"}
                      </Text>
                    </View>
                    <View style={styles.rowLine}>
                      <Text style={[styles.rowLabel, { color: subtext }]}>
                        Hoàn tất
                      </Text>
                      <Text style={{ color: text }}>
                        {r.finished ? "✓" : "—"}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </View>
    );
  };

  /* ---------- Pull-to-refresh ---------- */
  const refetchAll = async () => {
    await Promise.all([
      baseQ.refetch?.(),
      rateQ.refetch?.(),
      matchQ.refetch?.(),
      achQ.refetch?.(),
    ]);
  };
  const anyFetching =
    baseQ.isFetching ||
    rateQ.isFetching ||
    matchQ.isFetching ||
    achQ.isFetching;
  const anyLoading =
    baseQ.isLoading || rateQ.isLoading || matchQ.isLoading || achQ.isLoading;

  /* ---------- render ---------- */
  return (
    <>
      {canOpen && (
        <BottomSheetModal
          key={`pps-${userId ?? "none"}`}
          ref={sheetRef}
          snapPoints={snapPoints}
          onChange={(i) => {
            setSheetIndex(i);
            if (i === 1 && pendingActionRef.current) {
              const act = pendingActionRef.current;
              pendingActionRef.current = null;
              InteractionManager.runAfterInteractions(async () => {
                try {
                  await act();
                } catch {}
              });
            }
          }}
          onDismiss={handleDismiss}
          enablePanDownToClose
          index={0}
          topInset={topSafeGap}
          backdropComponent={(p) => (
            <BottomSheetBackdrop
              {...p}
              appearsOnIndex={0}
              disappearsOnIndex={-1}
              pressBehavior="close"
            />
          )}
          handleStyle={{ borderTopLeftRadius: 20, borderTopRightRadius: 20 }}
          handleIndicatorStyle={{
            backgroundColor: isDark ? "#6b7280" : "#b0b0b0",
            width: 36,
          }}
          backgroundStyle={{
            backgroundColor: pageBg,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            shadowColor: "#000",
            shadowOpacity: 0.15,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: -2 },
            elevation: 10,
          }}
          enableOverDrag={false}
          enableDynamicSizing={false}
          android_keyboardInputMode="adjustResize"
          detached
        >
          <BottomSheetScrollView
            style={{ paddingHorizontal: 12 }}
            contentContainerStyle={{
              paddingBottom: Math.max(16, insets.bottom + 12),
            }}
            stickyHeaderIndices={sheetIndex === 1 ? [0] : undefined}
            showsVerticalScrollIndicator
            refreshControl={
              <RefreshControl
                refreshing={Boolean(anyFetching)}
                onRefresh={() => expandThen(refetchAll)}
                tintColor={tint}
                colors={[tint]}
                progressViewOffset={8}
              />
            }
          >
            <View collapsable={false}>
              {baseQ.isLoading || baseQ.isFetching ? (
                <HeaderSkeleton
                  cardBg={cardBg}
                  border={border}
                  skelBg={skelBg}
                  textColor={text}
                />
              ) : (
                <Header />
              )}
              <Tabs />
            </View>

            <View style={{ gap: 12, marginTop: 12 }}>
              {baseQ.isLoading || baseQ.isFetching ? (
                <InfoSectionSkeleton
                  cardBg={cardBg}
                  border={border}
                  skelBg={skelBg}
                />
              ) : baseQ.error ? (
                <View
                  style={[
                    styles.alert,
                    {
                      borderColor: "#ef4444",
                      backgroundColor: "#fee2e2",
                      marginTop: 12,
                    },
                  ]}
                >
                  <Text style={{ color: "#991b1b" }}>
                    {(baseQ.error as any)?.data?.message ||
                      (baseQ.error as any)?.error ||
                      "Lỗi tải dữ liệu"}
                  </Text>
                </View>
              ) : (
                tab === 0 && <InfoSection />
              )}

              {tab === 1 && <RatingSection />}
              {tab === 2 && <MatchSection />}
              {tab === 3 && <AchievementsSection />}
            </View>
          </BottomSheetScrollView>
        </BottomSheetModal>
      )}

      {/* Zoom image modal */}
      <Modal
        visible={zoom.open}
        transparent
        animationType="fade"
        onRequestClose={closeZoom}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={{ flex: 1 }} onPress={closeZoom} />
          <View
            style={[
              styles.modalCard,
              { backgroundColor: cardBg, borderColor: border },
            ]}
          >
            <ExpoImage
              source={{ uri: normalizeUrl(zoom.src) || AVA_PLACE }}
              style={{ width: "100%", height: 360, borderRadius: 12 }}
              cachePolicy="memory-disk"
              transition={0}
            />
            <PrimaryBtn onPress={closeZoom}>Đóng</PrimaryBtn>
          </View>
          <Pressable style={{ flex: 1 }} onPress={closeZoom} />
        </View>
      </Modal>

      {/* Snackbar */}
      <Snack
        open={snack.open}
        message={snack.message}
        onClose={closeSnack}
        bottom={Math.max(24, insets.bottom + 12)}
      />
    </>
  );
}

/* ---------- styles ---------- */
const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    maxWidth: 220,
  },
  chipTxt: { fontSize: 12, fontWeight: "600" },

  btn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  btnOutline: { borderWidth: 1, backgroundColor: "transparent" },
  btnWhite: { color: "#fff", fontWeight: "700" },

  alert: { borderWidth: 1, borderRadius: 12, padding: 12 },

  closeBtn: {
    position: "absolute",
    right: 12,
    top: 12,
    backgroundColor: "rgba(0,0,0,0.6)",
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  headerWrap: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    paddingRight: 44,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },

  tabs: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 12,
    padding: 4,
    gap: 8,
    marginTop: 10,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 10,
  },

  sectionCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
  },
  sectionTitle: {
    fontWeight: "700",
    marginBottom: 8,
    fontSize: 16,
  },

  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  infoLabel: {
    width: 110,
    color: "#6b7280",
  },
  infoValue: {
    flex: 1,
    color: "#0f172a",
    fontWeight: "700",
  },

  copyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: Platform.OS === "android" ? 4 : 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  copyTxt: { fontSize: 12, fontWeight: "700" },

  cardRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 560,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    gap: 12,
  },

  snack: {
    position: "absolute",
    left: 16,
    right: 16,
    backgroundColor: "#323232",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  snackTxt: { color: "#fff", fontWeight: "700" },

  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  kpiCard: {
    flexBasis: "48%",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },

  rowCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    gap: 6,
  },
  rowTitle: {
    fontWeight: "700",
    marginBottom: 2,
  },
  rowLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowLabel: {
    width: 90,
    fontSize: 12,
  },
});
