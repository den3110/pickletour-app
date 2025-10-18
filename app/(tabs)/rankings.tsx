// app/screens/RankingListScreen.jsx
import { useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
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
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { useDispatch, useSelector } from "react-redux";

import { useGetRankingsQuery } from "@/slices/rankingsApiSlice";
import { useGetMeQuery } from "@/slices/usersApiSlice";
import { useCreateEvaluationMutation } from "@/slices/evaluationsApiSlice";
import { useReviewKycMutation } from "@/slices/adminApiSlice";

import { setKeyword, setPage } from "@/slices/rankingUiSlice";
import PublicProfileDialog from "@/components/PublicProfileDialog";
import PaginationRN from "@/components/PaginationRN";
import { normalizeUrl } from "@/utils/normalizeUri";
import { usePlatform } from "@/hooks/usePlatform";

/* ================= Consts ================= */
const PLACE = "https://dummyimage.com/100x100/cccccc/ffffff&text=?";
const HEX = {
  yellow: "#ff9800",
  red: "#f44336",
  grey: "#616161",
  green: "#2e7d32",
  blue: "#1976d2",
};
const MIN_RATING = 2;
const MAX_RATING = 8.0;
const fmt3 = (x) => (Number.isFinite(x) ? Number(x).toFixed(3) : "0.000");

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

// quyền chấm
const canGradeUser = (me, targetProvince) => {
  if (me?.role === "admin") return true;
  if (!me?.evaluator?.enabled) return false;
  const scopes = me?.evaluator?.gradingScopes?.provinces || [];
  return !!targetProvince && scopes.includes(String(targetProvince).trim());
};
// quyền xem KYC
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
const Pill = ({ label, bg = "#eee", fg = "#111" }) => (
  <View style={[styles.pill, { backgroundColor: bg }]}>
    <Text style={[styles.pillText, { color: fg }]}>{label}</Text>
  </View>
);

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
const SkelBlock = ({ w = "100%", h = 14, r = 8, style }) => (
  <Pulse>
    <View
      style={[
        { width: w, height: h, borderRadius: r, backgroundColor: "#e9e9e9" },
        style,
      ]}
    />
  </Pulse>
);
const SkelPill = ({ w = 70 }) => (
  <SkelBlock w={w} h={20} r={999} style={{ marginRight: 6, marginTop: 6 }} />
);

const RankingCardSkeleton = () => (
  <View style={styles.card}>
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

const FullListSkeleton = ({ count = 6 }) => {
  const data = useMemo(() => Array.from({ length: count }), [count]);
  return (
    <FlatList
      data={data}
      keyExtractor={(_, i) => `sk-${i}`}
      renderItem={() => <RankingCardSkeleton />}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 56 }}
      ListHeaderComponent={
        <View style={styles.legendStickyWrap}>
          <View style={styles.legendRow}>
            <Pill label="Điểm vàng: Đã xác thực" bg={HEX.yellow} fg="#000" />
            <Pill label="Điểm đỏ: Tự chấm" bg={HEX.red} fg="#fff" />
            <Pill label="Điểm xám: Chưa xác thực" bg={HEX.grey} fg="#fff" />
          </View>
        </View>
      }
      ListHeaderComponentStyle={{ backgroundColor: "#fafafa" }}
      stickyHeaderIndices={[0]}
      removeClippedSubviews
    />
  );
};

/* ================= Flame Avatar (only for podium users) ================= */
const FlameAvatar = ({ uri, medal, onPress }) => {
  // Không có medal => avatar thường (viền xám nhạt)
  if (!medal) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.9}>
        <View style={styles.avatarRingPlain}>
          <ExpoImage
            source={normalizeUrl(uri)}
            style={styles.avatarImg}
            contentFit="cover"
            transition={150}
            cachePolicy="memory-disk"
          />
        </View>
      </TouchableOpacity>
    );
  }

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
        <View style={[styles.avatarRing, { borderColor: border }]}>
          <ExpoImage
            source={normalizeUrl(uri)}
            style={styles.avatarImg}
            contentFit="cover"
            transition={150}
            cachePolicy="memory-disk"
          />
        </View>
      </View>
    </TouchableOpacity>
  );
};

/* ================= Flame Card (border+glow if podium) ================= */
const FlameCard = ({ medal, children }) => {
  
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

  // 🔽 Nhỏ bớt độ lan & nhịp thở
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

  if (!medal) return <View style={styles.card}>{children}</View>;


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
      <View style={[styles.card, { borderColor: border, borderWidth: 1.5 }]}>
        {children}
      </View>
    </View>
  );
};
/* ================= Main Screen ================= */
export default function RankingListScreen() {
  const dispatch = useDispatch();
  const router = useRouter();
  const flatRef = useRef(null);
  const { isIOS } = usePlatform();

  const { keyword = "", page = 0 } = useSelector((s) => s?.rankingUi || {});
  const [kw, setKw] = useState(keyword || "");

  const { data, isLoading, isFetching, error, refetch } = useGetRankingsQuery({
    keyword,
    page,
  });
  const list = data?.docs ?? [];
  const totalPages = data?.totalPages ?? 0;

  // podium map (userId -> { medal, label, picked })
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

  // me (phân quyền)
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
  const openZoom = (src) => {
    setZoomSrc(src || PLACE);
    setZoomOpen(true);
  };
  const closeZoom = () => setZoomOpen(false);

  // profile dialog
  const [openProfile, setOpenProfile] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const handleOpenProfile = (id) => {
    setSelectedId(id);
    setOpenProfile(true);
  };
  const handleCloseProfile = () => setOpenProfile(false);

  // grade modal
  const [gradeOpen, setGradeOpen] = useState(false);
  const [gradeUser, setGradeUser] = useState(null);
  const [gradeSingles, setGradeSingles] = useState("");
  const [gradeDoubles, setGradeDoubles] = useState("");
  const [gradeMsg, setGradeMsg] = useState("");

  const openGrade = (u, r) => {
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
  };

  const submitGrade = async () => {
    const singles =
      gradeSingles === "" ? undefined : Number.parseFloat(gradeSingles);
    const doubles =
      gradeDoubles === "" ? undefined : Number.parseFloat(gradeDoubles);
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

  // KYC modal
  const [kycOpen, setKycOpen] = useState(false);
  const [kycUser, setKycUser] = useState(null);
  const openKyc = (u) => {
    setKycUser(u || null);
    setKycOpen(true);
  };
  const closeKyc = () => setKycOpen(false);

  const doReview = async (action) => {
    if (!kycUser?._id) return;
    try {
      await reviewKycMut({ id: kycUser._id, action }).unwrap();
      const nextStatus = action === "approve" ? "verified" : "rejected";
      setCccdPatch((m) => ({ ...m, [kycUser._id]: nextStatus }));
      setKycUser((v) => (v ? { ...v, cccdStatus: nextStatus } : v));
      setKycOpen(false);
    } catch (_err) {
      // giữ nguyên modal nếu lỗi
    }
  };

  // pagination change
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

  // render item
  const renderItem = useCallback(
    ({ item, index }) => {
      const r = item;
      const u = r?.user || {};
      const avatarSrc = u?.avatar || PLACE;
      const age = calcAge(u);
      const uid = u?._id && String(u._id);
      const podium = uid ? podiumByUser[uid] : null;

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
        <FlameCard medal={podium?.medal} key={r?._id || u?._id || index}>
          {/* Header: Avatar (cháy nếu có giải) + Tên + Chip xác thực */}
          <View style={styles.rowCenter}>
            <FlameAvatar
              uri={avatarSrc}
              medal={podium?.medal}
              onPress={() => openZoom(avatarSrc)}
            />
            <View style={{ flex: 1, marginHorizontal: 12 }}>
              <Text style={styles.nick}>{u?.nickname || "---"}</Text>
            </View>
            <Pill label={chip.label} bg={chip.bg} fg={chip.fg} />
          </View>

          {/* Chip giải – FULL nội dung, không ... , đặt dưới tên */}
          {podium?.medal && (
            <View style={styles.medalRow}>
              <Pressable
                onPress={() => goToTournament(podium.picked)}
                style={[
                  styles.medalPill,
                  { borderColor: getMedalColors(podium.medal).border },
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

          {/* Cụm chip Tuổi / Giới tính / Tỉnh – dời xuống dưới, KHÔNG chạm chip giải */}
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
            <Text style={styles.metaText}>
              Cập nhật:{" "}
              {patched?.updatedAt
                ? new Date(patched.updatedAt).toLocaleDateString()
                : "--"}
            </Text>
            <Text style={styles.metaText}>
              Tham gia:{" "}
              {u?.createdAt ? new Date(u.createdAt).toLocaleDateString() : "--"}
            </Text>
          </View>

          {/* Actions */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.successBtn}
              onPress={() => handleOpenProfile(u?._id)}
            >
              <Text style={styles.successBtnText}>Hồ sơ</Text>
            </TouchableOpacity>

            {allowGrade && (
              <TouchableOpacity
                style={[styles.outlineBtn, { borderColor: "#1976d2" }]}
                onPress={() => openGrade(u, r)}
              >
                <Text style={[styles.outlineBtnText, { color: "#1976d2" }]}>
                  Chấm trình
                </Text>
              </TouchableOpacity>
            )}

            {allowKyc && (
              <TouchableOpacity
                style={[styles.outlineBtn, { borderColor: "#555" }]}
                onPress={() => openKyc(u)}
              >
                <Text style={[styles.outlineBtnText, { color: "#555" }]}>
                  Xem KYC
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </FlameCard>
      );
    },
    [me, scorePatch, cccdPatch, podiumByUser]
  );

  // skeleton flags
  const isInitialSkeleton =
    !error &&
    ((isLoading && !data) || (isFetching && (list?.length ?? 0) === 0));
  const showHeaderRefetchSkeleton =
    !error && isFetching && (list?.length ?? 0) > 0;

  return (
    <View style={[styles.container, isIOS && { paddingBottom: 50 }]}>
      {/* TOP BAR + SEARCH */}
      <View style={styles.topWrap}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Bảng xếp hạng</Text>
          {canSelfAssess && me !== null && (
            <TouchableOpacity
              onPress={() => router.push("/levelpoint")}
              style={styles.primaryBtn}
            >
              <Text style={styles.primaryBtnText}>Tự chấm trình</Text>
            </TouchableOpacity>
          )}
        </View>

        <TextInput
          placeholder="Tìm kiếm"
          value={kw}
          onChangeText={setKw}
          style={styles.searchInput}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          blurOnSubmit={false}
          onSubmitEditing={() => Keyboard.dismiss()}
        />
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>
            {error?.data?.message || error?.error || "Có lỗi xảy ra"}
          </Text>
          <TouchableOpacity
            onPress={refetch}
            style={[styles.primaryBtn, { marginTop: 8 }]}
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
          keyExtractor={(item, i) => String(item?._id || item?.user?._id || i)}
          renderItem={renderItem}
          ListHeaderComponent={
            <View>
              <View style={styles.legendStickyWrap}>
                <View style={styles.legendRow}>
                  <Pill
                    label="Điểm vàng: Đã xác thực"
                    bg={HEX.yellow}
                    fg="#000"
                  />
                  <Pill label="Điểm đỏ: Tự chấm" bg={HEX.red} fg="#fff" />
                  <Pill
                    label="Điểm xám: Chưa xác thực"
                    bg={HEX.grey}
                    fg="#fff"
                  />
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
          }
          ListHeaderComponentStyle={{ backgroundColor: "#fafafa" }}
          stickyHeaderIndices={[0]}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 56 }}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="on-drag"
          refreshControl={
            <RefreshControl
              refreshing={isFetching && (list?.length ?? 0) > 0 && !error}
              onRefresh={() => refetch()}
            />
          }
          ListFooterComponent={
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
            ) : null
          }
          removeClippedSubviews
          initialNumToRender={8}
          windowSize={8}
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
          <View style={[styles.sheet, { paddingBottom: 16 }]}>
            <Text style={styles.sheetTitle}>
              Chấm trình – {gradeUser?.nickname}
            </Text>

            <View style={styles.inputRow}>
              <Text
                style={styles.inputLabel}
              >{`Điểm đơn (${MIN_RATING} – ${MAX_RATING})`}</Text>
              <TextInput
                value={gradeSingles}
                onChangeText={setGradeSingles}
                keyboardType="decimal-pad"
                placeholder="VD: 4.50"
                style={styles.input}
              />
            </View>

            <View style={styles.inputRow}>
              <Text
                style={styles.inputLabel}
              >{`Điểm đôi (${MIN_RATING} – ${MAX_RATING})`}</Text>
              <TextInput
                value={gradeDoubles}
                onChangeText={setGradeDoubles}
                keyboardType="decimal-pad"
                placeholder="VD: 4.30"
                style={styles.input}
              />
            </View>

            {gradeMsg ? <Text style={styles.errorText}>{gradeMsg}</Text> : null}

            <View style={[styles.actionRow, { marginTop: 12 }]}>
              <TouchableOpacity
                style={styles.ghostBtn}
                onPress={() => setGradeOpen(false)}
              >
                <Text style={styles.ghostBtnText}>Huỷ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  { flexGrow: 1, alignItems: "center" },
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
          <View style={[styles.sheet, { maxHeight: "88%" }]}>
            <Text style={styles.sheetTitle}>
              KYC – {kycUser?.name || kycUser?.nickname || "--"}
            </Text>

            <ScrollView contentContainerStyle={{ paddingBottom: 12 }}>
              <View style={{ marginBottom: 8 }}>
                {(() => {
                  const eff = cccdPatch[kycUser?._id] || kycUser?.cccdStatus;
                  const chip = getVerifyChip(eff, null);
                  return <Pill label={chip.label} bg={chip.bg} fg={chip.fg} />;
                })()}
              </View>

              <View style={{ flexDirection: "row", gap: 8 }}>
                {["front", "back"].map((side) => (
                  <TouchableOpacity
                    key={side}
                    style={[styles.kycImgWrap, { flex: 1 }]}
                    activeOpacity={0.85}
                    onPress={() => openZoom(kycUser?.cccdImages?.[side])}
                  >
                    <ExpoImage
                      source={
                        normalizeUrl(kycUser?.cccdImages?.[side]) || PLACE
                      }
                      style={styles.kycImg}
                      contentFit="contain"
                      transition={150}
                      cachePolicy="memory-disk"
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
                <InfoRow label="Ngày sinh" value={formatViDate(kycUser?.dob)} />
                <InfoRow label="Số CCCD" value={kycUser?.cccd || "—"} mono />
                <InfoRow
                  label="Tỉnh / Thành"
                  value={kycUser?.province || "—"}
                />
                {kycUser?.note ? (
                  <View
                    style={{
                      marginTop: 8,
                      backgroundColor: "#f6f6f6",
                      borderRadius: 8,
                      padding: 8,
                    }}
                  >
                    <Text
                      style={{ color: "#666", fontSize: 12, marginBottom: 4 }}
                    >
                      Ghi chú
                    </Text>
                    <Text style={{ fontSize: 14 }}>{kycUser?.note}</Text>
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
              style={[styles.ghostBtn, { marginTop: 8, alignSelf: "center" }]}
              onPress={closeKyc}
            >
              <Text style={styles.ghostBtnText}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Zoom avatar */}
      <Modal
        visible={zoomOpen}
        animationType="fade"
        transparent
        statusBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={closeZoom}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalBox}>
            <ExpoImage
              source={normalizeUrl(zoomSrc) || PLACE}
              style={styles.zoomImg}
              contentFit="contain"
              transition={150}
              cachePolicy="memory-disk"
            />
            <Pressable onPress={closeZoom} style={styles.modalCloseBtn}>
              <Text style={styles.modalCloseText}>Đóng</Text>
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
    </View>
  );
}

/* ============== Local helpers ============== */
function InfoRow({ label, value, mono }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text
        style={[
          styles.infoValue,
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
  container: { flex: 1, backgroundColor: "#fafafa", paddingTop: 20 },

  topWrap: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: "#fafafa",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  title: { fontSize: 20, fontWeight: "700" },
  primaryBtn: {
    backgroundColor: "#1976d2",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  primaryBtnText: { color: "#fff", fontWeight: "600" },
  searchInput: {
    height: 40,
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
  },

  legendStickyWrap: {
    backgroundColor: "#fafafa",
    paddingTop: 8,
    paddingBottom: 8,
  },
  legendRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },

  /* Card & flames */
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
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },

  rowCenter: { flexDirection: "row", alignItems: "center" },

  /* Avatar flames */
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
    backgroundColor: "#fff",
  },
  avatarRingPlain: {
    padding: 2,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 31,
    backgroundColor: "#fff",
  },
  avatarImg: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#eee",
  },

  nick: { fontSize: 16, fontWeight: "700" },

  /* Medal pill (full width, no ellipsis) */
  medalRow: { marginTop: 8 },
  medalPill: {
    width: "100%",
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#fff",
  },
  medalPillText: { fontSize: 12, fontWeight: "800" },

  /* info chips under medal */
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

  /* score/meta/actions */
  scoreRow: { flexDirection: "row", gap: 16, marginTop: 10 },
  score: { fontSize: 14, fontWeight: "700" },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  metaText: { fontSize: 12, color: "#666" },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap" },

  successBtn: {
    backgroundColor: "#2e7d32",
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
    backgroundColor: "#eee",
  },
  ghostBtnText: { fontWeight: "700" },

  /* Footer pagination */
  pagiWrap: {
    paddingTop: 8,
    paddingBottom: 8,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },

  /* Error box */
  errorBox: {
    margin: 16,
    backgroundColor: "#ffebee",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#ffcdd2",
  },
  errorText: { color: "#b71c1c" },

  /* Modal base */
  modalBackdrop: {
    backgroundColor: "rgba(0,0,0,0.6)",
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalBox: {
    backgroundColor: "#f2f0f5",
    borderRadius: 12,
    width: width - 32,
    padding: 10,
  },
  zoomImg: {
    width: "100%",
    height: width,
    borderRadius: 10,
    backgroundColor: "#f2f0f5",
  },
  modalCloseBtn: {
    alignSelf: "center",
    marginTop: 10,
    backgroundColor: "#b5b5b5ff",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  modalCloseText: { fontWeight: "700" },

  /* Sheet */
  sheet: {
    width: "100%",
    maxWidth: 560,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 12,
  },
  sheetTitle: { fontSize: 18, fontWeight: "800", marginBottom: 8 },

  /* KYC */
  kycImgWrap: {
    backgroundColor: "#fafafa",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#eee",
    overflow: "hidden",
  },
  kycImg: { width: "100%", height: 180, backgroundColor: "#f2f0f5" },
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

  /* Info rows */
  infoRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  infoLabel: { width: 110, color: "#666", fontSize: 13 },
  infoValue: { flex: 1, fontSize: 15, fontWeight: "700" },

  /* Inputs */
  inputRow: { marginTop: 10 },
  inputLabel: { fontSize: 12, color: "#555", marginBottom: 4 },
  input: {
    height: 40,
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
  },
});
