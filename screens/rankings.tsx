// app/screens/RankingListScreen.jsx
// ✅ OPTIMIZED VERSION - Reduced lag, smooth scrolling, lazy image loading
import { useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  memo,
} from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Keyboard,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
  ScrollView,
  useColorScheme,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { useDispatch, useSelector } from "react-redux";
import { useTheme } from "@react-navigation/native";
import ImageViewing from "react-native-image-viewing";

import { useGetRankingsQuery } from "@/slices/rankingsApiSlice";
import { useGetMeQuery } from "@/slices/usersApiSlice";
import { useCreateEvaluationMutation } from "@/slices/evaluationsApiSlice";
import { useReviewKycMutation } from "@/slices/adminApiSlice";

import { setKeyword, setPage } from "@/slices/rankingUiSlice";
import PublicProfileDialog from "@/components/PublicProfileDialog";
import PaginationRN from "@/components/PaginationRN";
import { normalizeUrl } from "@/utils/normalizeUri";
import { usePlatform } from "@/hooks/usePlatform";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

/* ================= Consts ================= */
const PLACE = "https://dummyimage.com/100x100/cccccc/ffffff&text=?";
const HEX = {
  yellow: "#ff9800",
  red: "#f44336",
  grey: "#616161",
  green: "#2e7d32",
  blue: "#1976d2",
};
const MIN_RATING = 1.6;
const MAX_RATING = 8.0;
const fmt3 = (x) => (Number.isFinite(x) ? Number(x).toFixed(3) : "0.000");

// ✅ Card height estimate for getItemLayout
const CARD_HEIGHT_ESTIMATE = 280;

/* ================= Theme ================= */
function useThemeColors() {
  const navTheme = useTheme();
  const sysScheme = useColorScheme?.() || "light";
  const isDark =
    typeof navTheme?.dark === "boolean" ? navTheme.dark : sysScheme === "dark";

  // ✅ Memo để tránh recalc
  return useMemo(() => {
    const tint = navTheme?.colors?.primary ?? (isDark ? "#7cc0ff" : "#0a84ff");
    const textPrimary = navTheme?.colors?.text ?? (isDark ? "#f7f7f7" : "#000");
    const textSecondary = isDark ? "#d1d1d1" : "#333";
    const cardBg = navTheme?.colors?.card ?? (isDark ? "#111214" : "#ffffff");
    const pageBg =
      navTheme?.colors?.background ?? (isDark ? "#0e0f12" : "#fafafa");
    const softBg = isDark ? "#1e1f23" : "#eef1f6";
    const softBorder =
      navTheme?.colors?.border ?? (isDark ? "#3a3b40" : "#cfd6e4");
    const border = navTheme?.colors?.border ?? (isDark ? "#3a3b40" : "#e0e0e0");
    const skeleton = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
    const muted = isDark ? "#9aa0a6" : "#6b7280";
    const inputBg = isDark ? "#1e1f23" : "#ffffff";
    const inputBorder = isDark ? "#3a3b40" : "#ddd";
    const stickyBg = cardBg;
    const ghostBg = isDark ? "#2a2c31" : "#eeeeee";
    const ghostText = isDark ? "#ffffff" : "#111111";
    const outlineNeutral = isDark ? "#bbbbbb" : "#555555";
    const errBg = isDark ? "#3a1f21" : "#ffebee";
    const errBorder = isDark ? "#6e2a34" : "#ffcdd2";
    const errText = isDark ? "#ffb3b8" : "#b71c1c";

    return {
      scheme: isDark ? "dark" : "light",
      tint,
      textPrimary,
      textSecondary,
      cardBg,
      pageBg,
      softBg,
      softBorder,
      border,
      skeleton,
      muted,
      inputBg,
      inputBorder,
      stickyBg,
      ghostBg,
      ghostText,
      outlineNeutral,
      errBg,
      errBorder,
      errText,
    };
  }, [navTheme, isDark]);
}

/* ================= Helpers ================= */
const calcAge = (u) => {
  if (!u) return null;
  const today = new Date();
  const dateStr =
    u.dob || u.dateOfBirth || u.birthday || u.birthdate || u.birth_date;
  if (dateStr) {
    const d = new Date(dateStr);
    if (!isNaN(d)) {
      let age = today.getFullYear() - d.getFullYear();
      const m = today.getMonth() - d.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
      return age;
    }
  }
  const yearRaw =
    u.birthYear ??
    u.birth_year ??
    u.yob ??
    (/^\d{4}$/.test(String(dateStr)) ? Number(dateStr) : undefined);
  const year = Number(yearRaw);
  if (Number.isFinite(year) && year > 1900 && year <= today.getFullYear())
    return today.getFullYear() - year;
  return null;
};

const genderLabel = (g) =>
  g === "male"
    ? "Nam"
    : g === "female"
    ? "Nữ"
    : g === "other"
    ? "Khác"
    : g === "unspecified"
    ? "Chưa xác định"
    : "--";

const medalLabel = (m) =>
  m === "gold"
    ? "Nhà vô địch"
    : m === "silver"
    ? "Á quân"
    : m === "bronze"
    ? "Đồng hạng 3"
    : "";

const getMedalColors = (medal) => {
  switch (medal) {
    case "gold":
      return {
        border: "#ffb300",
        text: "#ff8f00",
        glow1: "rgba(255,179,0,.45)",
        glow2: "rgba(255,140,0,.30)",
      };
    case "silver":
      return {
        border: "#90a4ae",
        text: "#607d8b",
        glow1: "rgba(176,190,197,.35)",
        glow2: "rgba(120,144,156,.25)",
      };
    case "bronze":
      return {
        border: "#ff8a65",
        text: "#e65100",
        glow1: "rgba(255,112,67,.35)",
        glow2: "rgba(230,81,0,.25)",
      };
    default:
      return {
        border: "#bbb",
        text: "#555",
        glow1: "rgba(0,0,0,0)",
        glow2: "rgba(0,0,0,0)",
      };
  }
};

const canGradeUser = (me, targetProvince) => {
  if (me?.role === "admin") return true;
  if (!me?.evaluator?.enabled) return false;
  const scopes = me?.evaluator?.gradingScopes?.provinces || [];
  return !!targetProvince && scopes.includes(String(targetProvince).trim());
};

const canViewKycAdmin = (me, status) =>
  me?.role === "admin" && (status === "verified" || status === "pending");

const getVerifyChip = (status, tierColor) => {
  if (status === "verified")
    return { label: "Đã xác thực", bg: HEX.green, fg: "#fff" };
  if (status === "pending")
    return { label: "Chờ xác thực", bg: "#f6c453", fg: "#000" };
  if (tierColor === "red") return { label: "Tự chấm", bg: HEX.red, fg: "#fff" };
  return { label: "Chưa xác thực", bg: HEX.grey, fg: "#fff" };
};

/* ================= Small UI ================= */
const Pill = memo(({ label, bg, fg }) => {
  const C = useThemeColors();
  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: bg ?? C.softBg,
          borderColor: C.border,
          borderWidth: bg ? 0 : 0,
        },
      ]}
    >
      <Text style={[styles.pillText, { color: fg ?? C.textPrimary }]}>
        {label}
      </Text>
    </View>
  );
});

/* ================= Skeletons ================= */
const Pulse = ({ children }) => {
  const opacity = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.6,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={{ opacity }}>{children}</Animated.View>;
};

const SkelBlock = ({ w = "100%", h = 14, r = 8, style }) => {
  const C = useThemeColors();
  return (
    <Pulse>
      <View
        style={[
          { width: w, height: h, borderRadius: r, backgroundColor: C.skeleton },
          style,
        ]}
      />
    </Pulse>
  );
};

const SkelPill = ({ w = 70 }) => (
  <SkelBlock w={w} h={20} r={999} style={{ marginRight: 6, marginTop: 6 }} />
);

const RankingCardSkeleton = memo(() => {
  const C = useThemeColors();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: C.cardBg, borderColor: C.border },
      ]}
    >
      <View style={styles.rowCenter}>
        <SkelBlock w={54} h={54} r={27} />
        <View style={{ flex: 1, marginHorizontal: 12 }}>
          <SkelBlock w="60%" h={16} />
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            <SkelPill w={60} />
            <SkelPill w={110} />
            <SkelPill w={90} />
          </View>
        </View>
        <SkelPill w={90} />
      </View>

      <View style={{ marginTop: 8 }}>
        <SkelBlock w="100%" h={24} r={10} />
      </View>

      <View style={[styles.scoreRow, { marginTop: 12 }]}>
        <SkelBlock w="30%" h={16} />
        <SkelBlock w="30%" h={16} />
      </View>

      <View style={[styles.metaRow, { marginTop: 10 }]}>
        <SkelBlock w="35%" h={12} />
        <SkelBlock w="35%" h={12} />
      </View>

      <View style={[styles.actionRow, { marginTop: 12 }]}>
        <SkelBlock w={90} h={34} r={10} />
        <SkelBlock w={100} h={34} r={10} />
        <SkelBlock w={90} h={34} r={10} />
      </View>
    </View>
  );
});

const FullListSkeleton = memo(({ count = 6 }) => {
  const data = useMemo(() => Array.from({ length: count }), [count]);
  const C = useThemeColors();
  return (
    <FlatList
      data={data}
      keyExtractor={(_, i) => `sk-${i}`}
      renderItem={() => <RankingCardSkeleton />}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 56 }}
      ListHeaderComponent={
        <View
          style={[styles.legendStickyWrap, { backgroundColor: C.stickyBg }]}
        >
          <View style={styles.legendRow}>
            <Pill label="Điểm vàng: Đã xác thực" bg={HEX.yellow} fg="#000" />
            <Pill label="Điểm đỏ: Tự chấm" bg={HEX.red} fg="#fff" />
            <Pill label="Điểm xám: Chưa xác thực" bg={HEX.grey} fg="#fff" />
          </View>
        </View>
      }
      stickyHeaderIndices={[0]}
      removeClippedSubviews
    />
  );
});

/* ================= Optimized Avatar (no animation for non-podium) ================= */
const FlameAvatar = memo(({ uri, medal, onPress }) => {
  const C = useThemeColors();

  // ✅ Không animate nếu không có medal
  if (!medal) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.9}>
        <View
          style={[
            styles.avatarRingPlain,
            { borderColor: C.border, backgroundColor: C.cardBg },
          ]}
        >
          <ExpoImage
            source={normalizeUrl(uri) || PLACE}
            style={styles.avatarImg}
            contentFit="cover"
            transition={150}
            cachePolicy="memory-disk"
            placeholder={PLACE}
            placeholderContentFit="cover"
            priority="normal"
          />
        </View>
      </TouchableOpacity>
    );
  }

  // ✅ Chỉ animate cho podium users
  return <FlameAvatarAnimated uri={uri} medal={medal} onPress={onPress} />;
});

// ✅ Separate animated component - chỉ render khi cần
const FlameAvatarAnimated = memo(({ uri, medal, onPress }) => {
  const C = useThemeColors();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 1100,
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: 1100,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  const { border, glow1, glow2 } = getMedalColors(medal);
  const scale1 = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.06],
  });
  const scale2 = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [1.02, 1.1],
  });
  const op1 = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0.75],
  });
  const op2 = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.2, 0.45],
  });

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.9}>
      <View style={styles.flameWrap}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.flameGlow,
            {
              backgroundColor: glow1,
              opacity: op1,
              transform: [{ scale: scale1 }],
            },
          ]}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.flameGlow,
            {
              backgroundColor: glow2,
              opacity: op2,
              transform: [{ scale: scale2 }],
            },
          ]}
        />
        <View
          style={[
            styles.avatarRing,
            { borderColor: border, backgroundColor: C.cardBg },
          ]}
        >
          <ExpoImage
            source={normalizeUrl(uri) || PLACE}
            style={styles.avatarImg}
            contentFit="cover"
            transition={150}
            cachePolicy="memory-disk"
            placeholder={PLACE}
            placeholderContentFit="cover"
            priority="high"
          />
        </View>
      </View>
    </TouchableOpacity>
  );
});

/* ================= Optimized Card (no animation for non-podium) ================= */
const FlameCard = memo(({ medal, children }) => {
  const C = useThemeColors();

  // ✅ Không animate nếu không có medal
  if (!medal) {
    return (
      <View
        style={[
          styles.card,
          { backgroundColor: C.cardBg, borderColor: C.border },
        ]}
      >
        {children}
      </View>
    );
  }

  // ✅ Chỉ animate cho podium
  return <FlameCardAnimated medal={medal}>{children}</FlameCardAnimated>;
});

const FlameCardAnimated = memo(({ medal, children }) => {
  const C = useThemeColors();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: 1200,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  const { border, glow1, glow2 } = getMedalColors(medal);

  const op1 = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.18, 0.35],
  });
  const op2 = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.1, 0.25],
  });
  const scale = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.015],
  });

  return (
    <View style={styles.flameCardWrap}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.cardFlameGlow,
          { backgroundColor: glow1, opacity: op1, transform: [{ scale }] },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[styles.cardFlameGlow, { backgroundColor: glow2, opacity: op2 }]}
      />
      <View
        style={[
          styles.card,
          {
            backgroundColor: C.cardBg,
            borderColor: border,
            borderWidth: 1.5,
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
});

/* ================= Optimized RankingCard Component ================= */
const RankingCard = memo(
  ({
    item,
    index,
    podium,
    scorePatch,
    cccdPatch,
    me,
    onOpenProfile,
    onOpenZoom,
    onOpenGrade,
    onOpenKyc,
    onGoToTournament,
  }) => {
    const C = useThemeColors();
    const r = item;
    const u = r?.user || {};
    const avatarSrc = u?.avatar || PLACE;
    const age = calcAge(u);

    const tierHex =
      r?.tierColor === "red"
        ? HEX.red
        : r?.tierColor === "yellow"
        ? HEX.yellow
        : HEX.grey;

    const sp = scorePatch[u?._id || ""] || {};
    const patched = {
      single: sp.single ?? r?.single,
      double: sp.double ?? r?.double,
      updatedAt: sp.updatedAt ?? r?.updatedAt,
    };

    const effectiveStatus = cccdPatch[u?._id] || u?.cccdStatus;
    const chip = getVerifyChip(effectiveStatus, r?.tierColor);

    const allowGrade = canGradeUser(me, u?.province);
    const allowKyc = canViewKycAdmin(me, effectiveStatus);

    return (
      <FlameCard medal={podium?.medal}>
        {/* Header */}
        <View style={styles.rowCenter}>
          <FlameAvatar
            uri={avatarSrc}
            medal={podium?.medal}
            onPress={() => onOpenZoom(avatarSrc)}
          />
          <View style={{ flex: 1, marginHorizontal: 12 }}>
            <Text style={[styles.nick, { color: C.textPrimary }]}>
              {u?.nickname || "---"}
            </Text>
          </View>
          <Pill label={chip.label} bg={chip.bg} fg={chip.fg} />
        </View>

        {/* Medal */}
        {podium?.medal && (
          <View style={styles.medalRow}>
            <Pressable
              onPress={() => onGoToTournament(podium.picked)}
              style={[
                styles.medalPill,
                {
                  borderColor: getMedalColors(podium.medal).border,
                  backgroundColor: C.cardBg,
                },
              ]}
            >
              <Text
                style={[
                  styles.medalPillText,
                  { color: getMedalColors(podium.medal).text },
                ]}
              >
                {podium.label}
              </Text>
            </Pressable>
          </View>
        )}

        {/* Info chips */}
        <View style={styles.pillRowBelowMedal}>
          {Number.isFinite(age) && <Pill label={`${age} tuổi`} />}
          <Pill label={`Giới tính: ${genderLabel(u?.gender)}`} />
          <Pill label={`Tỉnh: ${u?.province || "--"}`} />
        </View>

        {/* Scores */}
        <View style={styles.scoreRow}>
          <Text style={[styles.score, { color: tierHex }]}>
            Đôi: {fmt3(patched.double)}
          </Text>
          <Text style={[styles.score, { color: tierHex }]}>
            Đơn: {fmt3(patched.single)}
          </Text>
        </View>

        {/* Meta */}
        <View style={styles.metaRow}>
          <Text style={[styles.metaText, { color: C.muted }]}>
            Cập nhật:{" "}
            {patched?.updatedAt
              ? new Date(patched.updatedAt).toLocaleDateString()
              : "--"}
          </Text>
          <Text style={[styles.metaText, { color: C.muted }]}>
            Tham gia:{" "}
            {u?.createdAt ? new Date(u.createdAt).toLocaleDateString() : "--"}
          </Text>
        </View>

        {/* Actions */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.successBtn, { backgroundColor: HEX.green }]}
            onPress={() => onOpenProfile(u?._id)}
          >
            <Text style={styles.successBtnText}>Hồ sơ</Text>
          </TouchableOpacity>

          {allowGrade && (
            <TouchableOpacity
              style={[styles.outlineBtn, { borderColor: C.tint }]}
              onPress={() => onOpenGrade(u, r)}
            >
              <Text style={[styles.outlineBtnText, { color: C.tint }]}>
                Chấm trình
              </Text>
            </TouchableOpacity>
          )}

          {allowKyc && (
            <TouchableOpacity
              style={[styles.outlineBtn, { borderColor: C.outlineNeutral }]}
              onPress={() => onOpenKyc(u)}
            >
              <Text
                style={[styles.outlineBtnText, { color: C.outlineNeutral }]}
              >
                Xem KYC
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </FlameCard>
    );
  },
  // ✅ Custom comparison để tránh re-render không cần thiết
  (prev, next) => {
    return (
      prev.item?._id === next.item?._id &&
      prev.scorePatch === next.scorePatch &&
      prev.cccdPatch === next.cccdPatch &&
      prev.podium?.medal === next.podium?.medal &&
      prev.me?.role === next.me?.role
    );
  }
);

function useThemeTokens() {
  // 1) Lấy theme từ React Navigation (nếu có)
  const navTheme = useTheme?.() || {};
  // 2) Fallback: nếu đứng ngoài ThemeProvider, dùng system scheme
  const scheme = useColorScheme?.() || "light";
  const isDark =
    typeof navTheme.dark === "boolean" ? navTheme.dark : scheme === "dark";

  const primary = navTheme?.colors?.primary ?? (isDark ? "#7cc0ff" : "#0a84ff");
  const text = navTheme?.colors?.text ?? (isDark ? "#f7f7f7" : "#0b1220");
  const cardBg = navTheme?.colors?.card ?? (isDark ? "#11161c" : "#ffffff");
  const border = navTheme?.colors?.border ?? (isDark ? "#212a33" : "#e8edf3");
  const bg = navTheme?.colors?.background ?? (isDark ? "#0b0f14" : "#fafbff");

  return {
    isDark,
    // base palette
    colors: {
      primary,
      text,
      card: cardBg,
      border,
      background: bg,
    },

    // text phụ & nền phụ
    sub: isDark ? "#b9c1cc" : "#586174",
    muted: isDark ? "#0f141a" : "#f3f6fb",
    inputBg: isDark ? "#0f141a" : "#f5f7fb",

    // chips
    chipBg: isDark ? "#121a22" : "#eef2f7",

    // accents
    tint: primary,
    success: "#22c55e",
    danger: "#ef4444",
    warning: "#f59e0b",
    shadow: "rgba(16,24,40,0.08)",

    // info chips (xanh nhạt)
    chipInfoBg: isDark ? "#1f2937" : "#eef2f7",
    chipInfoFg: isDark ? "#e5e7eb" : "#263238",
    chipInfoBd: isDark ? "#334155" : "#e2e8f0",
  };
}

/* ================= Main Screen ================= */
export default function RankingListScreen({ isBack = false }) {
  const tokens = useThemeTokens();

  const dispatch = useDispatch();
  const router = useRouter();
  const flatRef = useRef(null);
  const { isIOS } = usePlatform();
  const C = useThemeColors();

  const { keyword = "", page = 0 } = useSelector((s) => s?.rankingUi || {});
  const [kw, setKw] = useState(keyword || "");

  const { data, isLoading, isFetching, error, refetch } = useGetRankingsQuery({
    keyword,
    page,
  });
  const list = data?.docs ?? [];
  const totalPages = data?.totalPages ?? 0;

  // podium map
  const podiumByUser = useMemo(() => {
    const src = data?.podiums30d || {};
    const rank = { gold: 3, silver: 2, bronze: 1 };
    const out = {};
    for (const [uid, arr] of Object.entries(src)) {
      if (!Array.isArray(arr) || !arr.length) continue;
      const picked = [...arr].sort((a, b) => {
        const r = (rank[b.medal] || 0) - (rank[a.medal] || 0);
        if (r) return r;
        const ta = a.finishedAt ? new Date(a.finishedAt).getTime() : 0;
        const tb = b.finishedAt ? new Date(b.finishedAt).getTime() : 0;
        return tb - ta;
      })[0];
      const plusN = Math.max(0, arr.length - 1);
      const title = `${medalLabel(picked.medal)} – ${
        picked.tournamentName || "Giải đấu"
      }${plusN > 0 ? ` (+${plusN} giải khác)` : ""}`;
      out[String(uid)] = { medal: picked.medal, label: title, picked };
    }
    return out;
  }, [data?.podiums30d]);

  const goToTournament = useCallback(
    (t) => {
      if (!t) return;
      const id = t?.tournamentId || t?.tournament?._id || t?.tid || t?.id;
      const slug = t?.tournamentSlug || t?.slug;
      const name = t?.tournamentName || t?.name;
      if (id) return router.push(`/tournament/${id}/bracket`);
      if (slug) return router.push(`/tournament/${slug}/bracket`);
      if (name)
        return router.push({
          pathname: "/tournament",
          params: { query: name },
        });
      return router.push("/tournament");
    },
    [router]
  );

  // me
  const [skipMe, setSkipMe] = useState(false);
  const {
    data: meData,
    error: meError,
    isError: meIsError,
  } = useGetMeQuery(undefined, {
    skip: skipMe,
    refetchOnFocus: false,
    refetchOnReconnect: false,
    refetchOnMountOrArgChange: false,
  });
  useEffect(() => {
    if (!meIsError || !meError) return;
    const status =
      meError?.status ??
      meError?.originalStatus ??
      meError?.data?.status ??
      meError?.data?.statusCode;
    if (status === 401 || status === 403) setSkipMe(true);
  }, [meIsError, meError]);
  const me = meData || null;
  const canSelfAssess = !me || me.isScoreVerified === false;

  // mutations
  const [createEvaluation, { isLoading: creating }] =
    useCreateEvaluationMutation();
  const [reviewKycMut, { isLoading: reviewing }] = useReviewKycMutation();

  // local patches
  const [scorePatch, setScorePatch] = useState({});
  const [cccdPatch, setCccdPatch] = useState({});

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      dispatch(setPage(0));
      dispatch(setKeyword(kw.trim()));
    }, 300);
    return () => clearTimeout(t);
  }, [kw, dispatch]);

  // zoom avatar
  const [zoomSrc, setZoomSrc] = useState("");
  const [zoomOpen, setZoomOpen] = useState(false);
  const openZoom = useCallback((src) => {
    setZoomSrc(src || PLACE);
    setZoomOpen(true);
  }, []);
  const closeZoom = useCallback(() => setZoomOpen(false), []);

  // profile dialog
  const [openProfile, setOpenProfile] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const handleOpenProfile = useCallback((id) => {
    setSelectedId(id);
    setOpenProfile(true);
  }, []);
  const handleCloseProfile = useCallback(() => setOpenProfile(false), []);

  // grade modal
  const [gradeOpen, setGradeOpen] = useState(false);
  const [gradeUser, setGradeUser] = useState(null);
  const [gradeSingles, setGradeSingles] = useState("");
  const [gradeDoubles, setGradeDoubles] = useState("");
  const [gradeMsg, setGradeMsg] = useState("");

  const openGrade = useCallback((u, r) => {
    const singlesBase = Number.isFinite(r?.single)
      ? r.single
      : u?.localRatings?.singles ?? u?.ratingSingle;
    const doublesBase = Number.isFinite(r?.double)
      ? r.double
      : u?.localRatings?.doubles ?? u?.ratingDouble;
    setGradeUser({
      id: u?._id,
      nickname: u?.nickname || "--",
      province: u?.province || "",
    });
    setGradeSingles(
      Number.isFinite(singlesBase) ? String(Number(singlesBase).toFixed(2)) : ""
    );
    setGradeDoubles(
      Number.isFinite(doublesBase) ? String(Number(doublesBase).toFixed(2)) : ""
    );
    setGradeMsg("");
    setGradeOpen(true);
  }, []);

  const normalizeDecimalInput = (v) =>
    typeof v === "string" ? v.replace(/,/g, ".").trim() : v;

  const submitGrade = async () => {
    const singlesStr = normalizeDecimalInput(gradeSingles);
    const doublesStr = normalizeDecimalInput(gradeDoubles);

    const singles =
      singlesStr === "" ? undefined : Number.parseFloat(singlesStr);
    const doubles =
      doublesStr === "" ? undefined : Number.parseFloat(doublesStr);

    const inRange = (v) =>
      v === undefined || (v >= MIN_RATING && v <= MAX_RATING);

    if (!inRange(singles) || !inRange(doubles)) {
      setGradeMsg(`Điểm phải trong khoảng ${MIN_RATING} - ${MAX_RATING}`);
      return;
    }
    if (!gradeUser?.id) {
      setGradeMsg("Thiếu thông tin người được chấm.");
      return;
    }

    try {
      const resp = await createEvaluation({
        targetUser: gradeUser.id,
        province: gradeUser.province,
        source: "live",
        overall: { singles, doubles },
        notes: undefined,
      }).unwrap();

      const newSingle =
        resp?.ranking?.single ?? (singles !== undefined ? singles : undefined);
      const newDouble =
        resp?.ranking?.double ?? (doubles !== undefined ? doubles : undefined);
      const newUpdatedAt =
        resp?.ranking?.lastUpdated ?? new Date().toISOString();

      setScorePatch((m) => ({
        ...m,
        [gradeUser.id]: {
          single:
            newSingle !== undefined ? newSingle : m?.[gradeUser.id]?.single,
          double:
            newDouble !== undefined ? newDouble : m?.[gradeUser.id]?.double,
          updatedAt: newUpdatedAt,
        },
      }));
      setGradeOpen(false);
    } catch (err) {
      setGradeMsg(
        err?.data?.message || err?.error || "Không thể gửi phiếu chấm"
      );
    }
  };

  // ✅ KYC Image Viewer State
  const [kycImageViewerVisible, setKycImageViewerVisible] = useState(false);
  const [kycImageViewerIndex, setKycImageViewerIndex] = useState(0);
  const [kycImages, setKycImages] = useState([]);

  // ✅ Function để mở KYC Image Viewer
  const openKycImageViewer = useCallback((user, side) => {
    const frontImg = user?.cccdImages?.front;
    const backImg = user?.cccdImages?.back;

    const images = [];
    if (frontImg) {
      images.push({
        uri: normalizeUrl(frontImg) || PLACE,
      });
    }
    if (backImg) {
      images.push({
        uri: normalizeUrl(backImg) || PLACE,
      });
    }

    if (images.length === 0) return;

    setKycImages(images);
    // Set index dựa trên ảnh nào được ấn (front = 0, back = 1)
    setKycImageViewerIndex(side === "back" && images.length > 1 ? 1 : 0);
    setKycImageViewerVisible(true);
  }, []);

  const closeKycImageViewer = useCallback(() => {
    setKycImageViewerVisible(false);
  }, []);

  // KYC modal
  const [kycOpen, setKycOpen] = useState(false);
  const [kycUser, setKycUser] = useState(null);
  const openKyc = useCallback((u) => {
    setKycUser(u || null);
    setKycOpen(true);
  }, []);
  const closeKyc = useCallback(() => setKycOpen(false), []);

  const doReview = async (action) => {
    if (!kycUser?._id) return;
    try {
      await reviewKycMut({ id: kycUser._id, action }).unwrap();
      const nextStatus = action === "approve" ? "verified" : "rejected";
      setCccdPatch((m) => ({ ...m, [kycUser._id]: nextStatus }));
      setKycUser((v) => (v ? { ...v, cccdStatus: nextStatus } : v));
      setKycOpen(false);
    } catch (_err) {}
  };

  // pagination
  const handleChangePage = useCallback(
    (oneBasedPage) => {
      const zeroBased = oneBasedPage - 1;
      if (zeroBased === page) return;
      dispatch(setPage(zeroBased));
      requestAnimationFrame(() => {
        flatRef.current?.scrollToOffset?.({ offset: 0, animated: true });
      });
    },
    [dispatch, page]
  );

  // ✅ getItemLayout for better performance
  const getItemLayout = useCallback(
    (_, index) => ({
      length: CARD_HEIGHT_ESTIMATE,
      offset: CARD_HEIGHT_ESTIMATE * index,
      index,
    }),
    []
  );

  // ✅ keyExtractor
  const keyExtractor = useCallback(
    (item, i) => String(item?._id || item?.user?._id || i),
    []
  );

  // ✅ renderItem memo
  const renderItem = useCallback(
    ({ item, index }) => {
      const uid = item?.user?._id && String(item.user._id);
      const podium = uid ? podiumByUser[uid] : null;

      return (
        <RankingCard
          item={item}
          index={index}
          podium={podium}
          scorePatch={scorePatch}
          cccdPatch={cccdPatch}
          me={me}
          onOpenProfile={handleOpenProfile}
          onOpenZoom={openZoom}
          onOpenGrade={openGrade}
          onOpenKyc={openKyc}
          onGoToTournament={goToTournament}
        />
      );
    },
    [
      podiumByUser,
      scorePatch,
      cccdPatch,
      me,
      handleOpenProfile,
      openZoom,
      openGrade,
      openKyc,
      goToTournament,
    ]
  );

  // skeleton flags
  const isInitialSkeleton =
    !error &&
    ((isLoading && !data) || (isFetching && (list?.length ?? 0) === 0));
  const showHeaderRefetchSkeleton =
    !error && isFetching && (list?.length ?? 0) > 0;

  // ✅ ListHeaderComponent memo
  const ListHeader = useMemo(
    () => (
      <View>
        <View
          style={[styles.legendStickyWrap, { backgroundColor: C.stickyBg }]}
        >
          <View style={styles.legendRow}>
            <Pill label="Điểm vàng: Đã xác thực" bg={HEX.yellow} fg="#000" />
            <Pill label="Điểm đỏ: Tự chấm" bg={HEX.red} fg="#fff" />
            <Pill label="Điểm xám: Chưa xác thực" bg={HEX.grey} fg="#fff" />
          </View>
        </View>
        {showHeaderRefetchSkeleton ? (
          <View style={{ paddingHorizontal: 0, paddingBottom: 4 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <RankingCardSkeleton key={`skh-${i}`} />
            ))}
          </View>
        ) : null}
      </View>
    ),
    [C.stickyBg, showHeaderRefetchSkeleton]
  );

  // ✅ ListFooterComponent memo
  const ListFooter = useMemo(
    () =>
      totalPages > 1 ? (
        <View style={styles.pagiWrap}>
          <PaginationRN
            count={totalPages}
            page={page + 1}
            onChange={handleChangePage}
            siblingCount={1}
            boundaryCount={1}
            showPrevNext
            showFirstButton
            showLastButton
            size="md"
          />
          {isFetching && (
            <View style={{ marginTop: 8 }}>
              <ActivityIndicator />
            </View>
          )}
        </View>
      ) : null,
    [totalPages, page, handleChangePage, isFetching]
  );

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={[styles.container, { backgroundColor: C.pageBg }]}>
        {/* TOP BAR */}
        <View style={[styles.topWrap, { backgroundColor: C.stickyBg }]}>
          <View style={styles.headerRow}>
            <View style={{display: "flex", flexDirection: "row", alignItems: "center" }}>
              {isBack ? (
                <Pressable
                  onPress={() => router.back()}
                  hitSlop={12}
                  style={({ pressed }) => [
                    styles.backBtn,
                    { backgroundColor: pressed ? tokens.muted : "transparent" },
                  ]}
                >
                  <Ionicons
                    name="chevron-back"
                    size={22}
                    color={tokens.colors.text}
                  />
                </Pressable>
              ) : (
                // giữ chỗ để tiêu đề không bị xô lệch khi không có nút
                <View />
              )}
              <Text style={[styles.title, { color: C.textPrimary }]}>
                Bảng xếp hạng
              </Text>
            </View>
            {canSelfAssess && me !== null && (
              <TouchableOpacity
                onPress={() => router.push("/levelpoint")}
                style={[styles.primaryBtn, { backgroundColor: C.tint }]}
              >
                <Text style={styles.primaryBtnText}>Tự chấm trình</Text>
              </TouchableOpacity>
            )}
          </View>

          <TextInput
            placeholder="Tìm kiếm"
            value={kw}
            onChangeText={setKw}
            style={[
              styles.searchInput,
              {
                backgroundColor: C.inputBg,
                borderColor: C.inputBorder,
                color: C.textPrimary,
              },
            ]}
            placeholderTextColor={C.muted}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            blurOnSubmit={false}
            onSubmitEditing={() => Keyboard.dismiss()}
          />
        </View>

        {error ? (
          <View
            style={[
              styles.errorBox,
              { backgroundColor: C.errBg, borderColor: C.errBorder },
            ]}
          >
            <Text style={[styles.errorText, { color: C.errText }]}>
              {error?.data?.message || error?.error || "Có lỗi xảy ra"}
            </Text>
            <TouchableOpacity
              onPress={refetch}
              style={[
                styles.primaryBtn,
                { marginTop: 8, backgroundColor: C.tint },
              ]}
            >
              <Text style={styles.primaryBtnText}>Thử lại</Text>
            </TouchableOpacity>
          </View>
        ) : isInitialSkeleton ? (
          <FullListSkeleton count={6} />
        ) : (
          <FlatList
            ref={flatRef}
            data={list}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            getItemLayout={getItemLayout}
            ListHeaderComponent={ListHeader}
            ListHeaderComponentStyle={{ backgroundColor: C.stickyBg }}
            stickyHeaderIndices={[0]}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 56 }}
            keyboardShouldPersistTaps="always"
            keyboardDismissMode="on-drag"
            refreshControl={
              <RefreshControl
                refreshing={isFetching && (list?.length ?? 0) > 0 && !error}
                onRefresh={refetch}
                tintColor={C.textSecondary}
              />
            }
            ListFooterComponent={ListFooter}
            removeClippedSubviews={Platform.OS === "android"}
            maxToRenderPerBatch={6}
            updateCellsBatchingPeriod={50}
            initialNumToRender={8}
            windowSize={10}
          />
        )}

        {/* Modal CHẤM TRÌNH */}
        <Modal
          visible={gradeOpen}
          animationType="slide"
          transparent
          onRequestClose={() => setGradeOpen(false)}
        >
          <View style={styles.modalBackdrop}>
            <View
              style={[
                styles.sheet,
                { backgroundColor: C.cardBg, borderColor: C.border },
              ]}
            >
              <Text style={[styles.sheetTitle, { color: C.textPrimary }]}>
                Chấm trình – {gradeUser?.nickname}
              </Text>

              <View style={styles.inputRow}>
                <Text
                  style={[styles.inputLabel, { color: C.muted }]}
                >{`Điểm đơn (${MIN_RATING} – ${MAX_RATING})`}</Text>
                <TextInput
                  value={gradeSingles}
                  onChangeText={setGradeSingles}
                  keyboardType="decimal-pad"
                  placeholder="VD: 4.50"
                  placeholderTextColor={C.muted}
                  style={[
                    styles.input,
                    {
                      backgroundColor: C.inputBg,
                      borderColor: C.inputBorder,
                      color: C.textPrimary,
                    },
                  ]}
                />
              </View>

              <View style={styles.inputRow}>
                <Text
                  style={[styles.inputLabel, { color: C.muted }]}
                >{`Điểm đôi (${MIN_RATING} – ${MAX_RATING})`}</Text>
                <TextInput
                  value={gradeDoubles}
                  onChangeText={setGradeDoubles}
                  keyboardType="decimal-pad"
                  placeholder="VD: 4.30"
                  placeholderTextColor={C.muted}
                  style={[
                    styles.input,
                    {
                      backgroundColor: C.inputBg,
                      borderColor: C.inputBorder,
                      color: C.textPrimary,
                    },
                  ]}
                />
              </View>

              {gradeMsg ? (
                <Text style={[styles.errorText, { color: C.errText }]}>
                  {gradeMsg}
                </Text>
              ) : null}

              <View style={[styles.actionRow, { marginTop: 12 }]}>
                <TouchableOpacity
                  style={[styles.ghostBtn, { backgroundColor: C.ghostBg }]}
                  onPress={() => setGradeOpen(false)}
                >
                  <Text style={[styles.ghostBtnText, { color: C.ghostText }]}>
                    Huỷ
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.primaryBtn,
                    {
                      flexGrow: 1,
                      alignItems: "center",
                      backgroundColor: C.tint,
                    },
                  ]}
                  onPress={submitGrade}
                  disabled={creating}
                >
                  <Text style={styles.primaryBtnText}>
                    {creating ? "Đang lưu..." : "Gửi chấm trình"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Modal KYC */}
        <Modal
          visible={kycOpen}
          animationType="slide"
          transparent
          onRequestClose={closeKyc}
        >
          <View style={styles.modalBackdrop}>
            <View
              style={[
                styles.sheet,
                {
                  maxHeight: "88%",
                  backgroundColor: C.cardBg,
                  borderColor: C.border,
                },
              ]}
            >
              <Text style={[styles.sheetTitle, { color: C.textPrimary }]}>
                KYC – {kycUser?.name || kycUser?.nickname || "--"}
              </Text>

              <ScrollView contentContainerStyle={{ paddingBottom: 12 }}>
                <View style={{ marginBottom: 8 }}>
                  {(() => {
                    const eff = cccdPatch[kycUser?._id] || kycUser?.cccdStatus;
                    const chip = getVerifyChip(eff, null);
                    return (
                      <Pill label={chip.label} bg={chip.bg} fg={chip.fg} />
                    );
                  })()}
                </View>

                {/* Ảnh CCCD - Click để mở ImageViewing */}
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {["front", "back"].map((side) => (
                    <TouchableOpacity
                      key={side}
                      style={[
                        styles.kycImgWrap,
                        {
                          flex: 1,
                          backgroundColor: C.stickyBg,
                          borderColor: C.border,
                        },
                      ]}
                      activeOpacity={0.85}
                      // onPress={() => openKycImageViewer(kycUser, side)}
                    >
                      <ExpoImage
                        source={
                          normalizeUrl(kycUser?.cccdImages?.[side]) || PLACE
                        }
                        style={[styles.kycImg, { backgroundColor: C.stickyBg }]}
                        contentFit="contain"
                        transition={150}
                        cachePolicy="memory-disk"
                        placeholder={PLACE}
                        placeholderContentFit="contain"
                      />
                      <View style={styles.kycBadge}>
                        <Text style={styles.kycBadgeText}>
                          {side === "front" ? "Mặt trước" : "Mặt sau"}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={{ marginTop: 10 }}>
                  <InfoRow label="Họ & tên" value={kycUser?.name || "—"} />
                  <InfoRow
                    label="Ngày sinh"
                    value={formatViDate(kycUser?.dob)}
                  />
                  <InfoRow label="Số CCCD" value={kycUser?.cccd || "—"} mono />
                  <InfoRow
                    label="Tỉnh / Thành"
                    value={kycUser?.province || "—"}
                  />
                  {kycUser?.note ? (
                    <View
                      style={{
                        marginTop: 8,
                        backgroundColor: C.softBg,
                        borderRadius: 8,
                        padding: 8,
                        borderWidth: 1,
                        borderColor: C.softBorder,
                      }}
                    >
                      <Text
                        style={{
                          color: C.muted,
                          fontSize: 12,
                          marginBottom: 4,
                        }}
                      >
                        Ghi chú
                      </Text>
                      <Text style={{ fontSize: 14, color: C.textPrimary }}>
                        {kycUser?.note}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </ScrollView>

              {me?.role === "admin" && (
                <View style={[styles.actionRow, { marginTop: 4 }]}>
                  <TouchableOpacity
                    style={[styles.outlineBtn, { borderColor: "#d32f2f" }]}
                    onPress={() => doReview("reject")}
                    disabled={reviewing}
                  >
                    <Text style={[styles.outlineBtnText, { color: "#d32f2f" }]}>
                      {reviewing ? "Đang xử lý..." : "Từ chối"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.outlineBtn, { borderColor: "#2e7d32" }]}
                    onPress={() => doReview("approve")}
                    disabled={reviewing}
                  >
                    <Text style={[styles.outlineBtnText, { color: "#2e7d32" }]}>
                      {reviewing ? "Đang xử lý..." : "Duyệt"}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity
                style={[
                  styles.ghostBtn,
                  {
                    marginTop: 8,
                    alignSelf: "center",
                    backgroundColor: C.ghostBg,
                  },
                ]}
                onPress={closeKyc}
              >
                <Text style={[styles.ghostBtnText, { color: C.ghostText }]}>
                  Đóng
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Zoom avatar modal */}
        <Modal
          visible={zoomOpen}
          animationType="fade"
          transparent
          statusBarTranslucent
          presentationStyle="overFullScreen"
          onRequestClose={closeZoom}
        >
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalBox, { backgroundColor: C.cardBg }]}>
              <ExpoImage
                source={normalizeUrl(zoomSrc) || PLACE}
                style={[styles.zoomImg, { backgroundColor: C.pageBg }]}
                contentFit="contain"
                transition={150}
                cachePolicy="memory-disk"
              />
              <Pressable
                onPress={closeZoom}
                style={[styles.modalCloseBtn, { backgroundColor: C.ghostBg }]}
              >
                <Text style={[styles.modalCloseText, { color: C.ghostText }]}>
                  Đóng
                </Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        {/* Public profile dialog */}
        <PublicProfileDialog
          open={openProfile}
          onClose={handleCloseProfile}
          userId={selectedId}
        />

        {/* ✅ KYC Image Viewer - ĐƯA RA NGOÀI TOP LEVEL */}
        <ImageViewing
          images={kycImages}
          imageIndex={kycImageViewerIndex}
          visible={kycImageViewerVisible}
          onRequestClose={closeKycImageViewer}
          presentationStyle="overFullScreen"
          swipeToCloseEnabled={true}
          doubleTapToZoomEnabled={true}
          backgroundColor="rgba(0,0,0,0.9)"
        />
      </View>
    </SafeAreaView>
  );
}

/* ============== Local helpers ============== */
function InfoRow({ label, value, mono }) {
  const C = useThemeColors();
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: C.muted }]}>{label}</Text>
      <Text
        style={[
          styles.infoValue,
          { color: C.textPrimary },
          mono && { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}
function formatViDate(d) {
  return d ? new Date(d).toLocaleDateString("vi-VN") : "—";
}

/* ============== Styles ============== */
const { width } = Dimensions.get("window");
const styles = StyleSheet.create({
  container: { flex: 1 },

  topWrap: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    paddingTop: 0,
  },
  title: { fontSize: 20, fontWeight: "700" },
  primaryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  primaryBtnText: { color: "#fff", fontWeight: "600" },
  searchInput: {
    height: 40,
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
  },

  legendStickyWrap: {
    paddingTop: 8,
    paddingBottom: 8,
  },
  legendRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },

  flameCardWrap: { position: "relative", marginTop: 12 },
  cardFlameGlow: {
    position: "absolute",
    top: -3,
    left: -3,
    right: -3,
    bottom: -3,
    borderRadius: 18,
  },
  card: {
    borderRadius: 14,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },

  rowCenter: { flexDirection: "row", alignItems: "center" },

  flameWrap: {
    width: 60,
    height: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  flameGlow: { position: "absolute", width: 64, height: 64, borderRadius: 32 },
  avatarRing: {
    padding: 2,
    borderWidth: 2,
    borderRadius: 31,
  },
  avatarRingPlain: {
    padding: 2,
    borderWidth: 1,
    borderRadius: 31,
  },
  avatarImg: {
    width: 54,
    height: 54,
    borderRadius: 27,
  },

  nick: { fontSize: 16, fontWeight: "700" },

  medalRow: { marginTop: 8 },
  medalPill: {
    width: "100%",
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  medalPillText: { fontSize: 12, fontWeight: "800" },

  pill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: "flex-start",
  },
  pillText: { fontSize: 12, fontWeight: "700" },
  pillRowBelowMedal: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },

  scoreRow: { flexDirection: "row", gap: 16, marginTop: 10 },
  score: { fontSize: 14, fontWeight: "700" },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  metaText: { fontSize: 12 },

  actionRow: { flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap" },

  successBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  successBtnText: { color: "#fff", fontWeight: "600" },
  outlineBtn: {
    borderWidth: 1.5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  outlineBtnText: { fontWeight: "700" },
  ghostBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  ghostBtnText: { fontWeight: "700" },

  pagiWrap: {
    paddingTop: 8,
    paddingBottom: 8,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },

  errorBox: {
    margin: 16,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
  },
  errorText: {},

  modalBackdrop: {
    backgroundColor: "rgba(0,0,0,0.6)",
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalBox: {
    borderRadius: 12,
    width: width - 32,
    padding: 10,
  },
  zoomImg: {
    width: "100%",
    height: width,
    borderRadius: 10,
  },
  modalCloseBtn: {
    alignSelf: "center",
    marginTop: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  modalCloseText: { fontWeight: "700" },

  sheet: {
    width: "100%",
    maxWidth: 560,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
  },
  sheetTitle: { fontSize: 18, fontWeight: "800", marginBottom: 8 },

  kycImgWrap: {
    borderRadius: 10,
    borderWidth: 1,
    overflow: "hidden",
  },
  kycImg: { width: "100%", height: 180 },
  kycBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  kycBadgeText: { color: "#fff", fontSize: 12, fontWeight: "700" },

  infoRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  infoLabel: { width: 110, fontSize: 13 },
  infoValue: { flex: 1, fontSize: 15, fontWeight: "700" },

  inputRow: { marginTop: 10 },
  inputLabel: { fontSize: 12 },
  input: {
    height: 40,
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 0, // nếu muốn có gạch dưới: 1
    marginBottom: 8,
  },
  backBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
});
