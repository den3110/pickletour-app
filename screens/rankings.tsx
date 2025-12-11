// app/screens/RankingListScreen.jsx
import { router, useRouter } from "expo-router";
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
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
  TouchableWithoutFeedback,
  useColorScheme,
  DeviceEventEmitter,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { useDispatch, useSelector } from "react-redux";
import { useTheme } from "@react-navigation/native";
import ImageViewing from "react-native-image-viewing";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { useGetRankingsQuery } from "@/slices/rankingsApiSlice";
import { useGetMeQuery } from "@/slices/usersApiSlice";
import { setKeyword } from "@/slices/rankingUiSlice";
import { normalizeUrl } from "@/utils/normalizeUri";

import * as Haptics from "expo-haptics";

/* ================= Config ================= */
const PLACE = "https://dummyimage.com/100x100/cccccc/ffffff&text=?";
const CARD_HEIGHT_ESTIMATE = 340;
const MIN_RATING = 1.6;
const MAX_RATING = 8.0;

const fmt3 = (x) => (Number.isFinite(x) ? Number(x).toFixed(3) : "0.000");

// ✅ CHỈNH LẠI MÀU SẮC CHUẨN
const COLORS = {
  gold: "#f59e0b", // Vàng (Dùng cho điểm xịn & Medal)
  silver: "#C0C0C0",
  bronze: "#CD7F32",

  kycVerified: "#22c55e", // Xanh lá (Dùng cho Chip KYC Đã xác thực)
  kycPending: "#f59e0b", // Cam (Chờ xác thực)

  scoreRed: "#ef4444", // Đỏ (Điểm tự chấm)
  scoreGrey: "#94a3b8", // Xám (Chưa có điểm)
};

const CustomImageComponent = (props) => {
  return (
    <ExpoImage
      {...props}
      style={{ width: "100%", height: "100%" }}
      contentFit="contain"
      cachePolicy="memory-disk"
      transition={200}
    />
  );
};

/* ================= Theme ================= */
function useThemeColors() {
  const navTheme = useTheme();
  const sysScheme = useColorScheme?.() || "light";
  const isDark =
    typeof navTheme?.dark === "boolean" ? navTheme.dark : sysScheme === "dark";

  return useMemo(() => {
    const bg = isDark ? "#0f1115" : "#F5F7FA";
    const card = isDark ? "#181a20" : "#FFFFFF";
    const text = isDark ? "#FFFFFF" : "#1A1D1E";
    const subText = isDark ? "#848E9C" : "#6B7280";
    const border = isDark ? "#262932" : "#E5E7EB";
    const primary = isDark ? "#3B82F6" : "#2563EB";
    const inputBg = isDark ? "#20232b" : "#F3F4F6";

    return {
      isDark,
      bg,
      card,
      text,
      subText,
      border,
      primary,
      inputBg,
      shadow: isDark ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.05)",
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
  return null;
};

const genderLabel = (g) =>
  g === "male" ? "Nam" : g === "female" ? "Nữ" : "Khác";

const canGradeUser = (me, targetProvince) => {
  if (me?.role === "admin") return true;
  if (!me?.evaluator?.enabled) return false;
  const scopes = me?.evaluator?.gradingScopes?.provinces || [];
  return !!targetProvince && scopes.includes(String(targetProvince).trim());
};

const canViewKycAdmin = (me, status) =>
  me?.role === "admin" && (status === "verified" || status === "pending");

// ✅ Logic Chip KYC (Xanh lá là Verified)
const getVerifyChip = (status, tierColor) => {
  if (status === "verified")
    return {
      label: "Đã xác thực",
      bg: "rgba(34, 197, 94, 0.1)", // Xanh lá nhạt
      fg: COLORS.kycVerified, // Xanh lá đậm
      icon: "checkmark-circle",
    };
  if (status === "pending")
    return {
      label: "Chờ xác thực",
      bg: "rgba(245, 158, 11, 0.1)",
      fg: COLORS.kycPending,
      icon: "time",
    };
  if (tierColor === "red")
    return {
      label: "Tự chấm",
      bg: "rgba(239, 68, 68, 0.1)",
      fg: COLORS.scoreRed,
      icon: "person",
    };
  return {
    label: "Chưa xác thực",
    bg: "rgba(148, 163, 184, 0.1)",
    fg: COLORS.scoreGrey,
    icon: "alert-circle",
  };
};

/* ================= Sub-Components ================= */
const InfoTag = memo(({ icon, text, theme }) => (
  <View
    style={[
      styles.infoTag,
      { backgroundColor: theme.inputBg, borderColor: theme.border },
    ]}
  >
    {icon && (
      <Ionicons
        name={icon}
        size={12}
        color={theme.subText}
        style={{ marginRight: 4 }}
      />
    )}
    <Text style={[styles.infoTagText, { color: theme.text }]}>{text}</Text>
  </View>
));

const ScoreBlock = memo(({ label, score, color, theme }) => (
  <View style={[styles.scoreBlock, { backgroundColor: theme.inputBg }]}>
    <Text style={[styles.scoreLabel, { color: theme.subText }]}>{label}</Text>
    <Text style={[styles.scoreValue, { color: color || theme.text }]}>
      {score}
    </Text>
  </View>
));

/* ================= Skeletons ================= */
/* ================= Skeletons ================= */
const SkeletonCard = memo(() => {
  const theme = useThemeColors();
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
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
  }, [opacity]);

  const bg = theme.isDark ? "#2a2d36" : "#e1e4e8";

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.card,
          // ✅ THÊM DÒNG NÀY ĐỂ BỎ VIỀN ĐEN
          borderWidth: 0,
          // (Tuỳ chọn) Bỏ luôn shadow cho skeleton nhìn nó phẳng (flat) đẹp hơn
          shadowOpacity: 0,
          elevation: 0,
        },
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Animated.View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: bg,
            opacity,
          }}
        />
        <View style={{ marginLeft: 16, flex: 1 }}>
          <Animated.View
            style={{
              width: "60%",
              height: 20,
              backgroundColor: bg,
              marginBottom: 8,
              borderRadius: 4,
              opacity,
            }}
          />
          <Animated.View
            style={{
              width: "40%",
              height: 14,
              backgroundColor: bg,
              borderRadius: 4,
              opacity,
            }}
          />
        </View>
      </View>
      <View style={{ marginTop: 20, flexDirection: "row", gap: 10 }}>
        <Animated.View
          style={{
            flex: 1,
            height: 60,
            backgroundColor: bg,
            borderRadius: 12,
            opacity,
          }}
        />
        <Animated.View
          style={{
            flex: 1,
            height: 60,
            backgroundColor: bg,
            borderRadius: 12,
            opacity,
          }}
        />
      </View>
    </View>
  );
});
/* ================= Ranking Card (VIP Optimized) ================= */
const RankingCard = memo(
  ({
    item,
    podium,
    scorePatch,
    cccdPatch,
    me,
    onOpenZoom,
    onOpenGrade,
    onOpenKyc,
    onGoToTournament,
  }) => {
    const theme = useThemeColors();
    const r = item;
    const u = r?.user || {};
    const avatarSrc = u?.avatar || PLACE;
    const age = calcAge(u);

    // ✅ Logic màu ĐIỂM:
    // Red -> Đỏ (Tự chấm)
    // Yellow -> Vàng (Điểm xác thực - đây là cái bạn muốn vàng)
    // Khác -> Xám
    const scoreColor =
      r?.tierColor === "red"
        ? COLORS.scoreRed
        : r?.tierColor === "yellow"
        ? COLORS.gold // Vàng cho điểm
        : COLORS.scoreGrey;

    const sp = scorePatch[u?._id || ""] || {};
    const patched = {
      single: sp.single ?? r?.single,
      double: sp.double ?? r?.double,
    };

    const effectiveStatus = cccdPatch[u?._id] || u?.cccdStatus;
    const allowGrade = canGradeUser(me, u?.province);
    const allowKyc = canViewKycAdmin(me, effectiveStatus);

    // ✅ Logic Chip KYC: Xanh lá nếu Verified
    const verifyChip = getVerifyChip(effectiveStatus, r?.tierColor);

    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.card,
            borderColor: podium ? COLORS[podium.medal] : theme.border,
            borderWidth: podium ? 1.5 : 1,
            shadowColor: theme.shadow,
          },
        ]}
      >
        {/* Header */}
        <View style={styles.cardHeader}>
          <TouchableOpacity
            onPress={() => onOpenZoom(avatarSrc)}
            activeOpacity={0.8}
          >
            <View style={styles.avatarContainer}>
              <ExpoImage
                source={normalizeUrl(avatarSrc)}
                style={styles.avatar}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
              {podium && (
                <View
                  style={[
                    styles.avatarBorder,
                    { borderColor: COLORS[podium.medal] },
                  ]}
                />
              )}
            </View>
          </TouchableOpacity>

          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text
              style={[styles.nickname, { color: theme.text }]}
              numberOfLines={1}
            >
              {u?.nickname || "---"}
            </Text>

            {/* Chip Verify Text (Màu Xanh lá nếu verified) */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginTop: 6,
              }}
            >
              <View
                style={[styles.verifyBadge, { backgroundColor: verifyChip.bg }]}
              >
                <Ionicons
                  name={verifyChip.icon}
                  size={12}
                  color={verifyChip.fg}
                  style={{ marginRight: 4 }}
                />
                <Text style={[styles.verifyText, { color: verifyChip.fg }]}>
                  {verifyChip.label}
                </Text>
              </View>
            </View>

            {/* Medal or Province */}
            {podium ? (
              <TouchableOpacity
                onPress={() => onGoToTournament(podium.picked)}
                style={[
                  styles.medalBadge,
                  {
                    backgroundColor: COLORS[podium.medal] + "15",
                    borderColor: COLORS[podium.medal],
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name="medal"
                  size={14}
                  color={COLORS[podium.medal]}
                />
                <Text
                  style={[
                    styles.medalText,
                    { color: COLORS[podium.medal], flex: 1 },
                  ]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {podium.label}
                </Text>
              </TouchableOpacity>
            ) : u?.province ? (
              <Text style={[styles.provinceText, { color: theme.subText }]}>
                {u.province}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Info Tags */}
        <View style={styles.tagsRow}>
          {age && <InfoTag text={`${age} tuổi`} theme={theme} />}
          <InfoTag text={genderLabel(u?.gender)} theme={theme} />
          {/* Hiện tỉnh nếu chưa có giải */}
          {podium && u?.province && (
            <InfoTag icon="location" text={u.province} theme={theme} />
          )}
        </View>

        {/* Scores - ĐÔI TRƯỚC, ĐƠN SAU - Màu điểm theo tierColor */}
        <View style={styles.scoreGrid}>
          <ScoreBlock
            label="ĐIỂM ĐÔI"
            score={fmt3(patched.double)}
            color={scoreColor}
            theme={theme}
          />
          <ScoreBlock
            label="ĐIỂM ĐƠN"
            score={fmt3(patched.single)}
            color={scoreColor}
            theme={theme}
          />
        </View>

        {/* Actions */}
        <View style={[styles.cardFooter, { borderTopColor: theme.border }]}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => {
              // Rung nhẹ khi bấm chuyển trang
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push(`/profile/${u?._id}`);
            }}
          >
            <Ionicons
              name="person-circle-outline"
              size={20}
              color={theme.primary}
            />
            <Text style={[styles.actionText, { color: theme.primary }]}>
              Hồ sơ
            </Text>
          </TouchableOpacity>

          {allowGrade && (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => {
                // Rung đầm hơn (Medium) cho hành động mở form
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onOpenGrade(u, r);
              }}
            >
              <Ionicons name="create-outline" size={20} color={theme.text} />
              <Text style={[styles.actionText, { color: theme.text }]}>
                Chấm trình
              </Text>
            </TouchableOpacity>
          )}

          {allowKyc && (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => {
                // Rung đầm hơn (Medium) cho hành động quản trị
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onOpenKyc(u);
              }}
            >
              <Ionicons
                name="shield-checkmark-outline"
                size={20}
                color={theme.subText}
              />
              <Text style={[styles.actionText, { color: theme.subText }]}>
                KYC
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  },
  // Custom Compare
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

/* ================= MAIN SCREEN ================= */
export default function RankingListScreen({ isBack = false }) {
  const theme = useThemeColors();
  const dispatch = useDispatch();
  const router = useRouter();

  const { keyword = "" } = useSelector((s) => s?.rankingUi || {});
  const [kw, setKw] = useState(keyword || "");

  // --- Infinite Scroll State ---
  const [page, setPage] = useState(0);
  const [accumulatedList, setAccumulatedList] = useState([]);
  const [hasMore, setHasMore] = useState(true);

  // API
  const { data, isLoading, isFetching, error, refetch } = useGetRankingsQuery({
    keyword,
    page,
  });

  const scrollViewRef = React.useRef(null);
  React.useEffect(() => {
    const listener = DeviceEventEmitter.addListener(
      "SCROLL_TO_TOP",
      (tabName) => {
        if (tabName === "rankings") {
          // ✅ FIX LỖI Ở ĐÂY:
          // FlatList dùng scrollToOffset, không phải scrollTo
          scrollViewRef.current?.scrollToOffset({ offset: 0, animated: true });
        }
      }
    );
    return () => listener.remove();
  }, []);

  useEffect(() => {
    if (data?.docs) {
      if (page === 0) {
        setAccumulatedList(data.docs);
      } else {
        setAccumulatedList((prev) => {
          const existingIds = new Set(prev.map((p) => p._id));
          const newDocs = data.docs.filter((d) => !existingIds.has(d._id));
          return [...prev, ...newDocs];
        });
      }
      setHasMore(data.page < data.totalPages - 1);
    }
  }, [data, page]);

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(0);
      setHasMore(true);
      dispatch(setKeyword(kw.trim()));
    }, 400);
    return () => clearTimeout(t);
  }, [kw, dispatch]);

  const me = useGetMeQuery().data;
  const canSelfAssess = !me || me.isScoreVerified === false;

  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerImages, setViewerImages] = useState([]);

  const openZoom = useCallback((src) => {
    if (src) {
      setViewerImages([{ uri: normalizeUrl(src) || PLACE }]);
      setViewerVisible(true);
    }
  }, []);

  const openGrade = useCallback(
    (u, r) => {
      if (!u?._id) return;
      const s = Number.isFinite(r?.single) ? r.single : u?.ratingSingle;
      const d = Number.isFinite(r?.double) ? r.double : u?.ratingDouble;
      router.push({
        pathname: `/user/${u._id}/grade`,
        params: {
          nickname: u?.nickname || "",
          province: u?.province || "",
          currentSingle: Number.isFinite(s) ? String(s) : "",
          currentDouble: Number.isFinite(d) ? String(d) : "",
        },
      });
    },
    [router]
  );

  const openKyc = useCallback(
    (u) => {
      if (u?._id) router.push(`/user/${u._id}/kyc`);
    },
    [router]
  );

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

  const handleLoadMore = () => {
    if (!isFetching && hasMore) {
      setPage((prev) => prev + 1);
    }
  };

  const clearSearch = () => {
    setKw("");
    Keyboard.dismiss();
  };

  const podiumByUser = useMemo(() => {
    const src = data?.podiums30d || {};
    const rank = { gold: 3, silver: 2, bronze: 1 };
    const out = {};
    for (const [uid, arr] of Object.entries(src)) {
      if (!Array.isArray(arr) || !arr.length) continue;
      const picked = [...arr].sort((a, b) => {
        const r = (rank[b.medal] || 0) - (rank[a.medal] || 0);
        if (r) return r;
        return (
          new Date(b.finishedAt || 0).getTime() -
          new Date(a.finishedAt || 0).getTime()
        );
      })[0];
      out[String(uid)] = {
        medal: picked.medal,
        label: `Top 1 - ${picked.tournamentName}`,
        picked,
      };
    }
    return out;
  }, [data?.podiums30d]);

  const renderItem = useCallback(
    ({ item }) => (
      <RankingCard
        item={item}
        podium={podiumByUser[item?.user?._id]}
        scorePatch={{}}
        cccdPatch={{}}
        me={me}
        onOpenZoom={openZoom}
        onOpenGrade={openGrade}
        onOpenKyc={openKyc}
        onGoToTournament={goToTournament}
      />
    ),
    [podiumByUser, me, openZoom, openGrade, openKyc, goToTournament]
  );

  const initialLoading =
    isLoading || (isFetching && page === 0 && accumulatedList.length === 0);

  // Header Legend (Chú thích)
  const HeaderComponent = (
    <View style={{ marginBottom: 16 }}>
      <View
        style={[
          styles.legendContainer,
          { backgroundColor: theme.card, borderColor: theme.border },
        ]}
      >
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: COLORS.gold }]} />
          <Text style={[styles.legendText, { color: theme.subText }]}>
            Điểm xác thực
          </Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: COLORS.scoreRed }]} />
          <Text style={[styles.legendText, { color: theme.subText }]}>
            Tự chấm
          </Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: COLORS.scoreGrey }]} />
          <Text style={[styles.legendText, { color: theme.subText }]}>
            Chưa có điểm
          </Text>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.headerArea}>
          <View style={styles.topBar}>
            <View style={styles.titleRow}>
              {isBack && (
                <Pressable
                  onPress={() => router.back()}
                  style={styles.backBtn}
                  hitSlop={12}
                >
                  <Ionicons name="chevron-back" size={24} color={theme.text} />
                </Pressable>
              )}
              <Text style={[styles.screenTitle, { color: theme.text }]}>
                Bảng xếp hạng
              </Text>
            </View>
            {canSelfAssess && (
              <TouchableOpacity
                style={[styles.selfBtn, { backgroundColor: theme.primary }]}
                onPress={() => router.push("/levelpoint")}
              >
                <Text style={styles.selfBtnText}>Tự chấm</Text>
              </TouchableOpacity>
            )}
          </View>

          <View
            style={[
              styles.searchContainer,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <Ionicons name="search" size={20} color={theme.subText} />
            <TextInput
              value={kw}
              onChangeText={setKw}
              placeholder="Tìm kiếm tên, số điện thoại..."
              placeholderTextColor={theme.subText}
              style={[styles.searchInput, { color: theme.text }]}
              returnKeyType="search"
            />
            {kw.length > 0 && (
              <TouchableOpacity onPress={clearSearch}>
                <Ionicons name="close-circle" size={18} color={theme.subText} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </TouchableWithoutFeedback>

      <View style={{ flex: 1, paddingHorizontal: 16 }}>
        {error ? (
          <View style={styles.center}>
            <Text style={{ color: theme.subText }}>Có lỗi xảy ra.</Text>
            <TouchableOpacity onPress={refetch} style={{ marginTop: 10 }}>
              <Text style={{ color: theme.primary, fontWeight: "700" }}>
                Thử lại
              </Text>
            </TouchableOpacity>
          </View>
        ) : initialLoading ? (
          <FlatList
            ref={scrollViewRef}
            data={Array.from({ length: 6 })}
            keyExtractor={(_, i) => `sk-${i}`}
            renderItem={() => <SkeletonCard />}
            contentContainerStyle={{ paddingBottom: 40 }}
            ListHeaderComponent={HeaderComponent}
          />
        ) : (
          <FlatList
            ref={scrollViewRef}
            data={accumulatedList}
            keyExtractor={(item) => String(item._id)}
            renderItem={renderItem}
            ListHeaderComponent={HeaderComponent}
            contentContainerStyle={{ paddingBottom: 80 }}
            // 🔥 Tối ưu hiệu năng & Scroll mượt (Bỏ getItemLayout)
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            removeClippedSubviews={Platform.OS === "android"}
            initialNumToRender={5}
            maxToRenderPerBatch={5}
            windowSize={7}
            updateCellsBatchingPeriod={50}
            keyboardShouldPersistTaps="always"
            keyboardDismissMode="on-drag"
            refreshControl={
              <RefreshControl
                refreshing={isFetching && page === 0}
                onRefresh={() => {
                  setPage(0);
                  refetch();
                }}
                tintColor={theme.primary}
              />
            }
            // ✅ Footer: Thay spinner bằng 3 Skeleton Items
            ListFooterComponent={
              isFetching && page > 0 ? (
                <View style={{ paddingVertical: 10, gap: 16 }}>
                  <SkeletonCard />
                  <SkeletonCard />
                  <SkeletonCard />
                </View>
              ) : (
                <View style={{ height: 20 }} />
              )
            }
          />
        )}
      </View>

      <ImageViewing
        images={viewerImages}
        imageIndex={0}
        visible={viewerVisible}
        onRequestClose={() => setViewerVisible(false)}
        ImageComponent={CustomImageComponent}
        backgroundColor={theme.isDark ? "#000" : "#F5F5F5"}
        swipeToCloseEnabled
        doubleTapToZoomEnabled
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  headerArea: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: Platform.OS === "android" ? 10 : 0,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  titleRow: { flexDirection: "row", alignItems: "center" },
  backBtn: { marginRight: 12 },
  screenTitle: {
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  selfBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    shadowOpacity: 0.15,
    elevation: 3,
  },
  selfBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },

  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 15, height: "100%" },

  legendContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  legendItem: { flexDirection: "row", alignItems: "center" },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 6 },
  legendText: { fontSize: 12, fontWeight: "600" },

  /* === CARD STYLES === */
  card: {
    borderRadius: 24,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  cardHeader: { flexDirection: "row", marginBottom: 16 },
  avatarContainer: { position: "relative", width: 68, height: 68 },
  avatar: {
    width: "100%",
    height: "100%",
    borderRadius: 34,
    borderWidth: 2,
    borderColor: "transparent",
  },
  avatarBorder: {
    position: "absolute",
    top: -4,
    left: -4,
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2,
    opacity: 0.8,
  },
  nickname: { fontSize: 18, fontWeight: "800", maxWidth: "85%" },

  verifyBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  verifyText: { fontSize: 11, fontWeight: "700" },

  provinceText: { fontSize: 13, marginTop: 4 },

  medalBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 8,
    maxWidth: "95%",
  },
  medalText: {
    fontSize: 12,
    fontWeight: "700",
    marginLeft: 6,
    flex: 1,
  },

  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  infoTag: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  infoTagText: { fontSize: 11, fontWeight: "600" },

  scoreGrid: { flexDirection: "row", gap: 12, marginBottom: 16 },
  scoreBlock: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 16,
  },
  scoreLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  scoreValue: { fontSize: 22, fontWeight: "900" },

  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 12,
    borderTopWidth: 1,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
  },
  actionText: { fontSize: 13, fontWeight: "600" },
});
