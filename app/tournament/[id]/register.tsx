// app/screens/TournamentRegistrationScreen.tsx
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
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
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
  Linking,
  TouchableOpacity,
  useColorScheme,
  ScrollView,
  useWindowDimensions,
  SafeAreaView,
  Animated,
  StatusBar,
} from "react-native";
import RenderHTML from "react-native-render-html";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import {
  useCancelRegistrationMutation,
  useCreateRegInviteMutation,
  useGetRegistrationsQuery,
  useGetTournamentQuery,
  useListMyRegInvitesQuery,
  useManagerDeleteRegistrationMutation,
  useManagerReplaceRegPlayerMutation,
  useManagerSetRegPaymentStatusMutation,
  useRespondRegInviteMutation,
  useCreateComplaintMutation,
} from "@/slices/tournamentsApiSlice";
import { useGetMeScoreQuery } from "@/slices/usersApiSlice";
import PlayerSelector from "@/components/PlayerSelector";
import { normalizeUrl } from "@/utils/normalizeUri";
import { Image as ExpoImage } from "expo-image"; // <--- Dùng Expo Image
import { roundTo3 } from "@/utils/roundTo3";
import { getFeeAmount } from "@/utils/fee";
import { LinearGradient } from "expo-linear-gradient";
import {
  Ionicons,
  MaterialIcons,
  FontAwesome5,
  MaterialCommunityIcons,
} from "@expo/vector-icons";
import ImageView from "react-native-image-viewing";

const PLACE = "https://dummyimage.com/800x600/cccccc/ffffff&text=?";

/* =============== THEME & UTILS =============== */
function useThemeColors() {
  const scheme = useColorScheme() ?? "light";
  return useMemo(() => {
    const isDark = scheme === "dark";
    return {
      scheme,
      tint: isDark ? "#60a5fa" : "#2563eb",
      pageBg: isDark ? "#0f172a" : "#f8fafc",
      cardBg: isDark ? "#1e293b" : "#ffffff",
      border: isDark ? "#334155" : "#e2e8f0",
      textPrimary: isDark ? "#f8fafc" : "#0f172a",
      textSecondary: isDark ? "#94a3b8" : "#64748b",
      chipBg: isDark ? "#334155" : "#f1f5f9",
      inputBg: isDark ? "#1e293b" : "#ffffff",
      ghostBg: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)",
      successBg: isDark ? "rgba(34,197,94,0.15)" : "#dcfce7",
      successText: isDark ? "#4ade80" : "#166534",
      warningBg: isDark ? "rgba(234,179,8,0.15)" : "#fef9c3",
      warningText: isDark ? "#facc15" : "#854d0e",
      errorBg: isDark ? "rgba(239,68,68,0.15)" : "#fee2e2",
      errorText: isDark ? "#f87171" : "#991b1b",
      infoBg: isDark ? "rgba(59,130,246,0.2)" : "#eff6ff",
      infoText: isDark ? "#93c5fd" : "#1e3a8a",
      softBtn: isDark ? "#334155" : "#e2e8f0",
      gradStart: isDark ? "#1e3a8a" : "#1d4ed8",
      gradEnd: isDark ? "#172554" : "#1e40af",
      skeleton: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
      // Theme cho Image Viewer
      imageViewBg: isDark ? "#000000" : "#ffffff",
      imageViewText: isDark ? "#ffffff" : "#000000",
      imageViewCloseBtn: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.1)",
      shadow: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: isDark ? 0.3 : 0.06,
        shadowRadius: 8,
        elevation: 3,
      },
    };
  }, [scheme]);
}

// ... (Các hàm utils giữ nguyên)
const normType = (t?: string) => {
  const s = String(t || "").toLowerCase();
  if (s === "single" || s === "singles") return "single";
  return s === "double" || s === "doubles" ? "double" : s || "double";
};
const displayName = (pl: any) =>
  pl?.nickName || pl?.nickname || pl?.fullName || pl?.name || "—";
const getUserId = (pl: any) => pl?.user?._id || pl?.user || null;
const totalScoreOf = (r: any, isSingles: boolean) =>
  (r?.player1?.score || 0) + (isSingles ? 0 : r?.player2?.score || 0);
const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString("vi-VN") : "";
const fmtRange = (a?: string, b?: string) =>
  a && b ? `${fmtDate(a)} – ${fmtDate(b)}` : fmtDate(a) || "—";
const regCodeOf = (r: any) =>
  r?.code ||
  r?.shortCode ||
  String(r?._id || "")
    .slice(-5)
    .toUpperCase();
const maskPhone = (phone?: string) => {
  if (!phone) return "*******???";
  const d = String(phone).replace(/\D/g, "");
  return "*******" + (d.slice(-3) || "???");
};
const normalizeNoAccent = (s?: string) =>
  (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, " ")
    .trim();
const getQrProviderConfig = (tour: any) => ({
  bank:
    tour?.bankShortName ||
    tour?.qrBank ||
    tour?.bank ||
    process.env.EXPO_PUBLIC_QR_BANK ||
    "",
  acc:
    tour?.bankAccountNumber ||
    tour?.qrAccount ||
    tour?.bankAccount ||
    process.env.EXPO_PUBLIC_QR_ACC ||
    "",
});
const qrImgUrlFor = (tour: any, r: any, mePhone?: string) => {
  const { bank, acc } = getQrProviderConfig(tour);
  if (!bank || !acc) return null;
  const code = regCodeOf(r);
  const des = normalizeNoAccent(
    `Ma giai ${tour?._id || ""} Ma dang ky ${code}`
  );
  const params = new URLSearchParams({ bank, acc, des, template: "compact" });
  try {
    const amount = getFeeAmount?.(tour, r);
    if (amount > 0) params.set("amount", String(amount));
  } catch {}
  return `https://qr.sepay.vn/img?${params.toString()}`;
};
const getScoreCap = (tour: any, isSingles: boolean) =>
  Number(
    isSingles ? tour?.singleCap ?? tour?.scoreCap ?? 0 : tour?.scoreCap ?? 0
  );
const getMaxDelta = (tour: any) =>
  Number(tour?.scoreGap ?? tour?.maxDelta ?? 0);
const decideTotalState = (total: number, cap: number, delta?: number) => {
  const t = Number(total);
  const c = Number(cap);
  if (!Number.isFinite(t) || !(Number.isFinite(c) && c > 0))
    return { state: "default", note: "" };
  const d = Number.isFinite(delta) && Number(delta) > 0 ? Number(delta) : 0;
  if (t > c + d + 1e-6) return { state: "error", note: "" };
  if (Math.abs(t - (c + d)) <= 1e-6) return { state: "warning", note: "" };
  return { state: "success", note: "" };
};

/* ===== Hook: keyboard height ===== */
function useKeyboardHeight() {
  const [h, setH] = useState(0);
  useEffect(() => {
    const onShow = (e: any) => setH(e?.endCoordinates?.height ?? 0);
    const onHide = () => setH(0);
    const s1 = Keyboard.addListener("keyboardWillShow", onShow);
    const s2 = Keyboard.addListener("keyboardWillHide", onHide);
    const s3 = Keyboard.addListener("keyboardDidShow", onShow);
    const s4 = Keyboard.addListener("keyboardDidHide", onHide);
    return () => {
      s1.remove();
      s2.remove();
      s3.remove();
      s4.remove();
    };
  }, []);
  return h;
}

/* ================== SKELETON COMPONENTS ================== */
const SkeletonItem = ({
  width,
  height,
  style,
  borderRadius = 4,
}: {
  width?: number | string;
  height?: number;
  style?: any;
  borderRadius?: number;
}) => {
  const C = useThemeColors();
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
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
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          opacity,
          backgroundColor: C.skeleton,
          borderRadius,
          width,
          height,
        },
        style,
      ]}
    />
  );
};

const TournamentSkeleton = () => {
  const C = useThemeColors();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: C.pageBg }}>
      {/* Header Skeleton */}
      <View style={{ height: 200 + insets.top, backgroundColor: C.gradStart }}>
        <View style={{ marginTop: insets.top + 20, paddingHorizontal: 16 }}>
          <View
            style={{ flexDirection: "row", justifyContent: "space-between" }}
          >
            <SkeletonItem
              width={100}
              height={24}
              borderRadius={20}
              style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
            />
          </View>
          <SkeletonItem
            width="80%"
            height={30}
            style={{ marginTop: 16, backgroundColor: "rgba(255,255,255,0.2)" }}
          />
          <SkeletonItem
            width="50%"
            height={20}
            style={{ marginTop: 10, backgroundColor: "rgba(255,255,255,0.2)" }}
          />
        </View>
      </View>

      {/* Stats Skeleton Overlap */}
      <View style={{ marginTop: -40, paddingHorizontal: 16 }}>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <SkeletonItem style={{ flex: 1 }} height={70} borderRadius={16} />
          <SkeletonItem style={{ flex: 1 }} height={70} borderRadius={16} />
        </View>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
          <SkeletonItem style={{ flex: 1 }} height={70} borderRadius={16} />
          <SkeletonItem style={{ flex: 1 }} height={70} borderRadius={16} />
        </View>
      </View>

      {/* List Items Skeleton */}
      <View style={{ padding: 16, gap: 16 }}>
        {[1, 2, 3].map((i) => (
          <View
            key={i}
            style={{
              height: 120,
              backgroundColor: C.cardBg,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: C.border,
              padding: 12,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <SkeletonItem width={60} height={20} />
              <SkeletonItem width={80} height={20} />
            </View>
            <View
              style={{ flexDirection: "row", gap: 12, alignItems: "center" }}
            >
              <SkeletonItem width={40} height={40} borderRadius={20} />
              <View style={{ gap: 6 }}>
                <SkeletonItem width={150} height={16} />
                <SkeletonItem width={100} height={12} />
              </View>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
};

/* -------- OPTIMIZED COUNTDOWN COMPONENT -------- */
const TournamentCountdown = memo(({ deadline }: { deadline?: string }) => {
  const [timeLeft, setTimeLeft] = useState("");
  const C = useThemeColors();

  useEffect(() => {
    if (!deadline) return;
    const target = new Date(deadline).getTime();
    if (isNaN(target)) return;

    const tick = () => {
      const now = Date.now();
      const diff = target - now;
      if (diff <= 0) {
        setTimeLeft("Đã kết thúc");
        return;
      }
      const d = Math.floor(diff / (1000 * 60 * 60 * 24));
      const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const m = Math.floor((diff / 1000 / 60) % 60);
      const s = Math.floor((diff / 1000) % 60);
      setTimeLeft(`${d}d ${h}h ${m}m ${s}s`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  if (!deadline || !timeLeft) return null;
  const isEnded = timeLeft === "Đã kết thúc";

  return (
    <View
      style={{
        backgroundColor: isEnded ? C.errorBg : "rgba(0,0,0,0.2)",
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: isEnded ? C.errorText : "rgba(255,255,255,0.3)",
        marginLeft: 8,
      }}
    >
      <Text
        style={{
          color: isEnded ? C.errorText : "#fff",
          fontSize: 12,
          fontWeight: "700",
          fontVariant: ["tabular-nums"],
        }}
      >
        {isEnded ? "Đã đóng đăng ký" : `⏱ ${timeLeft}`}
      </Text>
    </View>
  );
});

// ... (HtmlPreviewBlock, HtmlCols, StatCard)
const HTML_PREVIEW_MAX_HEIGHT = 260;
const HtmlPreviewBlock = memo(
  ({
    title,
    html,
    contentWidth,
  }: {
    title: string;
    html: string;
    contentWidth: number;
  }) => {
    const C = useThemeColors();
    const [open, setOpen] = useState(false);
    const insets = useSafeAreaInsets();

    const hasMore = useMemo(() => {
      if (!html) return false;
      const txt = String(html)
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return txt.length > 260;
    }, [html]);

    const common = useMemo(
      () => ({
        contentWidth,
        defaultTextProps: { selectable: true },
        onLinkPress: (_e: any, href?: string) =>
          href && Linking.openURL(href).catch(() => {}),
        tagsStyles: {
          a: { color: C.tint, textDecorationLine: "underline" },
          img: { borderRadius: 8 },
          p: { marginBottom: 8, lineHeight: 20, color: C.textPrimary },
          li: { color: C.textPrimary },
          ul: { marginBottom: 8, paddingLeft: 18 },
          ol: { marginBottom: 8, paddingLeft: 18 },
          h1: {
            fontSize: 20,
            fontWeight: "700",
            marginBottom: 6,
            color: C.textPrimary,
          },
          h2: {
            fontSize: 18,
            fontWeight: "700",
            marginBottom: 6,
            color: C.textPrimary,
          },
          h3: {
            fontSize: 16,
            fontWeight: "700",
            marginBottom: 6,
            color: C.textPrimary,
          },
          strong: { color: C.textPrimary },
        },
        renderersProps: { img: { enableExperimentalPercentWidth: true } },
      }),
      [contentWidth, C]
    );

    if (!html) return null;

    return (
      <>
        <Text
          style={{
            fontSize: 16,
            fontWeight: "700",
            marginBottom: 8,
            color: C.textPrimary,
          }}
        >
          {title}
        </Text>
        <View
          style={[
            styles.htmlCard,
            { backgroundColor: C.cardBg, borderColor: C.border },
          ]}
        >
          <View
            style={{
              maxHeight: HTML_PREVIEW_MAX_HEIGHT,
              overflow: "hidden",
              position: "relative",
            }}
          >
            <RenderHTML source={{ html }} {...(common as any)} />
            {hasMore && (
              <LinearGradient
                pointerEvents="none"
                colors={[
                  C.scheme === "dark"
                    ? "rgba(17,18,20,0)"
                    : "rgba(255,255,255,0)",
                  C.scheme === "dark"
                    ? "rgba(17,18,20,0.8)"
                    : "rgba(255,255,255,0.8)",
                  C.scheme === "dark" ? "#111214" : "#ffffff",
                ]}
                style={styles.htmlFade}
              />
            )}
          </View>
          {hasMore && (
            <View style={{ alignItems: "center", marginTop: 4 }}>
              <TouchableOpacity
                style={styles.htmlMoreBtn}
                onPress={() => setOpen(true)}
              >
                <Text
                  style={{ color: C.tint, fontWeight: "600", fontSize: 13 }}
                >
                  Xem thêm
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <Modal
          visible={open}
          visible={open}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={() => setOpen(false)}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: C.pageBg,
              paddingTop: insets.top,
            }}
          >
            <View
              style={[styles.fullHtmlHeader, { borderBottomColor: C.border }]}
            >
              <TouchableOpacity
                onPress={() => setOpen(false)}
                style={[
                  styles.fullHtmlCloseBtn,
                  { backgroundColor: C.ghostBg },
                ]}
              >
                <Text
                  style={{
                    fontSize: 20,
                    fontWeight: "800",
                    color: C.textPrimary,
                  }}
                >
                  ✕
                </Text>
              </TouchableOpacity>
              <Text
                numberOfLines={1}
                style={{
                  flex: 1,
                  textAlign: "center",
                  fontWeight: "800",
                  fontSize: 16,
                  color: C.textPrimary,
                }}
              >
                {title}
              </Text>
              <View style={styles.fullHtmlCloseBtn} />
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                paddingHorizontal: 16,
                paddingBottom: 24,
                paddingTop: 8,
              }}
            >
              <RenderHTML source={{ html }} {...(common as any)} />
            </ScrollView>
          </View>
        </Modal>
      </>
    );
  }
);

const HtmlCols = memo(({ tour }: { tour: any }) => {
  const { width } = useWindowDimensions();
  const GAP = 12;
  const twoCols = width >= 820;
  if (!tour?.contactHtml && !tour?.contentHtml) return null;
  const colWidth = twoCols
    ? Math.floor((width - 16 * 2 - GAP) / 2)
    : width - 16 * 2;
  const contentWidth = Math.max(colWidth - 20, 200);

  return (
    <View style={{ marginTop: 12 }}>
      <View
        style={{
          flexDirection: twoCols ? "row" : "column",
          gap: twoCols ? GAP : 0,
        }}
      >
        {!!tour?.contactHtml && (
          <View
            style={{
              width: twoCols ? colWidth : "100%",
              marginBottom: twoCols ? 0 : 12,
            }}
          >
            <HtmlPreviewBlock
              title="Thông tin liên hệ"
              html={tour.contactHtml}
              contentWidth={contentWidth}
            />
          </View>
        )}
        {!!tour?.contentHtml && (
          <View style={{ width: twoCols ? colWidth : "100%" }}>
            <HtmlPreviewBlock
              title="Nội dung giải đấu"
              html={tour.contentHtml}
              contentWidth={contentWidth}
            />
          </View>
        )}
      </View>
    </View>
  );
});

const StatCard = memo(({ icon, label, value, hint, color = "blue" }: any) => {
  const C = useThemeColors();
  let bgIcon = C.infoBg;
  let iconColor = C.tint;

  if (color === "green") {
    bgIcon = C.successBg;
    iconColor = C.successText;
  } else if (color === "orange") {
    bgIcon = C.warningBg;
    iconColor = C.warningText;
  } else if (color === "red") {
    bgIcon = C.errorBg;
    iconColor = C.errorText;
  }

  return (
    <View
      style={[
        styles.statCard,
        { backgroundColor: C.cardBg, borderColor: C.border, ...C.shadow },
      ]}
    >
      <View style={[styles.statIconBox, { backgroundColor: bgIcon }]}>
        {React.cloneElement(icon, { size: 18, color: iconColor })}
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: C.textSecondary,
            fontSize: 10,
            fontWeight: "700",
            textTransform: "uppercase",
            marginBottom: 2,
          }}
        >
          {label}
        </Text>
        <Text style={{ color: C.textPrimary, fontWeight: "800", fontSize: 15 }}>
          {String(value)}
        </Text>
        {hint ? (
          <Text style={{ color: C.textSecondary, fontSize: 10, marginTop: 2 }}>
            {hint}
          </Text>
        ) : null}
      </View>
    </View>
  );
});

const RegItem = memo(function RegItem({
  r,
  index,
  isSingles,
  canManage,
  cap,
  delta,
  isOwner,
  onPreview,
  onOpenProfile,
  onOpenReplace,
  onTogglePayment,
  onCancel,
  onOpenComplaint,
  onOpenPayment,
  busy,
}: any) {
  const C = useThemeColors();
  const total = totalScoreOf(r, isSingles);
  const players = [r?.player1, r?.player2].filter(Boolean);
  const code = regCodeOf(r);
  const isPaid = r.payment?.status === "Paid";
  const { state } = decideTotalState(total, cap, delta);
  const totalColor =
    state === "error"
      ? C.errorText
      : state === "warning"
      ? C.warningText
      : C.textPrimary;

  return (
    <View
      style={[
        styles.regCard,
        { backgroundColor: C.cardBg, borderColor: C.border, ...C.shadow },
      ]}
    >
      {/* Header Card */}
      <View
        style={[
          styles.regHeader,
          { borderBottomColor: C.border, backgroundColor: C.pageBg },
        ]}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={[styles.rankBadge, { backgroundColor: C.tint }]}>
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 11 }}>
              {index + 1}
            </Text>
          </View>
          <Text
            style={{
              fontWeight: "700",
              color: C.textPrimary,
              fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
            }}
          >
            #{code}
          </Text>
          {!!r.checkinAt && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: C.infoBg,
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 4,
              }}
            >
              <Ionicons name="checkmark-done" size={10} color={C.infoText} />
              <Text
                style={{
                  fontSize: 10,
                  color: C.infoText,
                  fontWeight: "700",
                  marginLeft: 2,
                }}
              >
                Check-in
              </Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Ionicons
            name={isPaid ? "checkmark-circle" : "time"}
            size={14}
            color={isPaid ? C.successText : C.warningText}
          />
          <Text
            style={{
              fontSize: 11,
              fontWeight: "700",
              color: isPaid ? C.successText : C.warningText,
            }}
          >
            {isPaid ? "Đã Thanh toán" : "Chưa Thanh toán"}
          </Text>
        </View>
      </View>

      {/* Body Card */}
      <View style={{ padding: 12 }}>
        {players.map((pl: any, idx: number) => (
          <View
            key={idx}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              marginBottom: idx < players.length - 1 ? 12 : 0,
            }}
          >
            <TouchableOpacity
              onPress={() => onPreview(pl?.avatar, displayName(pl))}
            >
              <ExpoImage
                source={{ uri: normalizeUrl(pl?.avatar) || PLACE }}
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 21,
                  backgroundColor: C.pageBg,
                  borderWidth: 1,
                  borderColor: C.border,
                }}
                contentFit="cover"
              />
              {canManage && (
                <TouchableOpacity
                  style={[
                    styles.miniEditBtn,
                    { backgroundColor: C.tint, borderColor: C.cardBg },
                  ]}
                  onPress={() => onOpenReplace(r, idx === 0 ? "p1" : "p2")}
                >
                  <MaterialIcons name="edit" size={8} color="#fff" />
                </TouchableOpacity>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => onOpenProfile(pl)}
              style={{ flex: 1 }}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    fontWeight: "700",
                    color: C.textPrimary,
                    fontSize: 14,
                  }}
                >
                  {displayName(pl)}
                </Text>
                {pl?.cccdStatus === "verified" && (
                  <MaterialIcons name="verified" size={14} color={C.tint} />
                )}
              </View>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 2,
                }}
              >
                <Text style={{ color: C.textSecondary, fontSize: 11 }}>
                  {maskPhone(pl?.phone)}
                </Text>
                <View
                  style={{
                    backgroundColor: C.chipBg,
                    paddingHorizontal: 6,
                    borderRadius: 4,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: "700",
                      color: C.textPrimary,
                    }}
                  >
                    {roundTo3(pl?.score)}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          </View>
        ))}

        {!isSingles && !r.player2 && canManage && (
          <TouchableOpacity
            style={[styles.addPlayerBtn, { borderColor: C.border }]}
            onPress={() => onOpenReplace(r, "p2")}
          >
            <Ionicons name="add" size={16} color={C.textSecondary} />
            <Text
              style={{
                fontSize: 12,
                color: C.textSecondary,
                fontWeight: "600",
              }}
            >
              Thêm VĐV 2
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Footer Info & Actions (Tách 2 dòng) */}
      <View
        style={{
          flexDirection: "column",
          gap: 12,
          paddingHorizontal: 12,
          paddingBottom: 12,
          borderTopWidth: 1,
          borderTopColor: C.pageBg,
          paddingTop: 10,
        }}
      >
        {/* Dòng 1: Tổng điểm */}
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
          <Text style={{ fontSize: 11, color: C.textSecondary }}>Tổng:</Text>
          <Text style={{ fontSize: 16, fontWeight: "800", color: totalColor }}>
            {roundTo3(total)}
          </Text>
          {cap > 0 && (
            <Text style={{ fontSize: 11, color: C.textSecondary }}>
              / {cap}
            </Text>
          )}
        </View>

        {/* Dòng 2: Nút bấm */}
        <View
          style={{
            flexDirection: "row",
            gap: 8,
            justifyContent: "flex-end",
            flexWrap: "wrap",
          }}
        >
          <TouchableOpacity
            style={[styles.btnActionSmall, { backgroundColor: C.infoBg }]}
            onPress={() => onOpenPayment(r)}
          >
            <Ionicons name="qr-code-outline" size={14} color={C.infoText} />
            <Text
              style={{
                fontSize: 11,
                fontWeight: "700",
                color: C.infoText,
                marginLeft: 4,
              }}
            >
              Thanh toán
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btnActionSmall, { backgroundColor: C.warningBg }]}
            onPress={() => onOpenComplaint(r)}
          >
            <Ionicons name="warning-outline" size={14} color={C.warningText} />
            <Text
              style={{
                fontSize: 11,
                fontWeight: "700",
                color: C.warningText,
                marginLeft: 4,
              }}
            >
              Khiếu nại
            </Text>
          </TouchableOpacity>

          {canManage && (
            <TouchableOpacity
              onPress={() => onTogglePayment(r)}
              disabled={busy?.settingPayment}
              style={[
                styles.iconActionBtn,
                {
                  backgroundColor: C.pageBg,
                  borderWidth: 1,
                  borderColor: C.border,
                },
              ]}
            >
              <FontAwesome5
                name="coins"
                size={14}
                color={isPaid ? C.textSecondary : C.successText}
              />
            </TouchableOpacity>
          )}

          {(canManage || isOwner) && (
            <TouchableOpacity
              onPress={() => onCancel(r)}
              disabled={busy?.deletingId === r._id}
              style={[styles.iconActionBtn, { backgroundColor: C.errorBg }]}
            >
              {busy?.deletingId === r._id ? (
                <ActivityIndicator size="small" color={C.errorText} />
              ) : (
                <Ionicons name="trash-outline" size={16} color={C.errorText} />
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
});

/* ===================== CUSTOM EXPO IMAGE COMPONENT ===================== */
const CustomExpoImage = (props: any) => {
  // State cục bộ để theo dõi trạng thái loading của từng ảnh
  const [isLoading, setIsLoading] = useState(true);

  return (
    // Container bao bọc, cần position relative để chứa skeleton absolute bên trong
    <View
      style={[
        props.style,
        {
          position: "relative",
          justifyContent: "center",
          alignItems: "center",
        },
      ]}
    >
      <ExpoImage
        {...props}
        // Sử dụng StyleSheet.absoluteFill để ảnh tràn container cha
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        transition={200}
        // Bắt đầu tải -> hiện skeleton
        onLoadStart={() => setIsLoading(true)}
        // Tải xong hoặc lỗi -> ẩn skeleton
        onLoad={() => setIsLoading(false)}
        onError={() => setIsLoading(false)}
      />

      {/* Lớp phủ Skeleton khi đang loading */}
      {isLoading && (
        <View
          style={[
            StyleSheet.absoluteFill,
            { justifyContent: "center", alignItems: "center", zIndex: 1 },
          ]}
        >
          {/* Một hộp skeleton hình chữ nhật đại diện cho ảnh đang tải */}
          {/* Bạn có thể điều chỉnh width/height tùy ý, ví dụ 80% 50% */}
          <SkeletonItem width="90%" height="60%" borderRadius={12} />
        </View>
      )}
    </View>
  );
};

/* ===================== MAIN SCREEN ===================== */
export default function TournamentRegistrationScreen() {
  const C = useThemeColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlashList<any>>(null);

  // Data Fetching
  const { data: me, isLoading: meLoading } = useGetMeScoreQuery();
  const isLoggedIn = !!me?._id;
  const { data: tour, isLoading: tourLoading } = useGetTournamentQuery(id);
  const {
    data: regs = [],
    isLoading: regsLoading,
    refetch: refetchRegs,
  } = useGetRegistrationsQuery(id);
  const { data: myInvites = [], refetch: refetchInvites } =
    useListMyRegInvitesQuery(undefined, { skip: !isLoggedIn });

  // Mutations
  const [createInvite, { isLoading: saving }] = useCreateRegInviteMutation();
  const [respondInvite] = useRespondRegInviteMutation();
  const [cancelReg] = useCancelRegistrationMutation();
  const [setPaymentStatus, { isLoading: settingPayment }] =
    useManagerSetRegPaymentStatusMutation();
  const [adminDeleteReg] = useManagerDeleteRegistrationMutation();
  const [replacePlayer, { isLoading: replacing }] =
    useManagerReplaceRegPlayerMutation();
  const [createComplaint, { isLoading: sendingComplaint }] =
    useCreateComplaintMutation();

  // Local State
  const [p1Admin, setP1Admin] = useState<any>(null);
  const [p2, setP2] = useState<any>(null);
  const [msg, setMsg] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  // Image Viewer State
  const [imgPreview, setImgPreview] = useState({
    open: false,
    src: "",
    name: "",
  });

  const [replaceDlg, setReplaceDlg] = useState({
    open: false,
    reg: null as any,
    slot: "p1" as "p1" | "p2",
  });
  const [newPlayer, setNewPlayer] = useState<any>(null);
  const [complaintDlg, setComplaintDlg] = useState({
    open: false,
    reg: null as any,
    text: "",
  });
  const [paymentDlg, setPaymentDlg] = useState({
    open: false,
    reg: null as any,
  });

  // Computed & Handlers
  const evType = normType(tour?.eventType);
  const isSingles = evType === "single";
  const isDoubles = evType === "double";
  const cap = getScoreCap(tour, isSingles);
  const delta = getMaxDelta(tour);
  const regTotal = regs?.length ?? 0;
  const paidCount = regs.filter(
    (r: any) => r?.payment?.status === "Paid"
  ).length;

  const isManager = useMemo(() => {
    if (!isLoggedIn || !tour) return false;
    if (String(tour?.createdBy) === String(me?._id)) return true;
    return tour?.managers?.some(
      (m: any) => String(m?.user ?? m) === String(me._id)
    );
  }, [isLoggedIn, me, tour]);
  const isAdmin = !!(me?.isAdmin || me?.role === "admin");
  const canManage = isLoggedIn && (isManager || isAdmin);

  const pendingInvitesHere = useMemo(() => {
    if (!isLoggedIn) return [];
    return myInvites.filter(
      (it: any) => String(it?.tournament?._id || it?.tournament) === String(id)
    );
  }, [myInvites, id, isLoggedIn]);

  const filteredRegs = useMemo(() => {
    if (!searchQ.trim()) return regs;
    const q = normalizeNoAccent(searchQ.toLowerCase());
    return regs.filter((r: any) => {
      const txt = `${displayName(r.player1)} ${r.player1?.phone} ${displayName(
        r.player2
      )} ${r.player2?.phone} ${regCodeOf(r)}`;
      return normalizeNoAccent(txt.toLowerCase()).includes(q);
    });
  }, [regs, searchQ]);

  const handleRefresh = useCallback(() => {
    refetchRegs();
    if (isLoggedIn) refetchInvites();
  }, [refetchRegs, refetchInvites, isLoggedIn]);

  const handleSubmit = useCallback(async () => {
    if (!isLoggedIn) return Alert.alert("Thông báo", "Vui lòng đăng nhập.");
    const p1Id = isAdmin ? p1Admin?._id : me?._id;
    if (!p1Id) return Alert.alert("Lỗi", "Thiếu thông tin VĐV 1");
    if (isDoubles && !p2?._id) return Alert.alert("Lỗi", "Thiếu VĐV 2");

    try {
      await createInvite({
        tourId: id,
        message: msg,
        player1Id: String(p1Id),
        player2Id: p2?._id,
      }).unwrap();
      Alert.alert("Thành công", "Đã gửi đăng ký/lời mời");
      if (isAdmin) setP1Admin(null);
      setP2(null);
      setMsg("");
      handleRefresh();
    } catch (e: any) {
      Alert.alert("Lỗi", e?.data?.message || "Đăng ký thất bại");
    }
  }, [
    isLoggedIn,
    isAdmin,
    p1Admin,
    me,
    isDoubles,
    p2,
    id,
    msg,
    createInvite,
    handleRefresh,
  ]);

  const onCancelReg = useCallback(
    (r: any) => {
      Alert.alert("Xác nhận", "Huỷ đăng ký này?", [
        { text: "Không", style: "cancel" },
        {
          text: "Huỷ",
          style: "destructive",
          onPress: async () => {
            setCancelingId(r._id);
            try {
              if (canManage) await adminDeleteReg(r._id).unwrap();
              else await cancelReg(r._id).unwrap();
              Alert.alert("Thành công", "Đã huỷ");
              handleRefresh();
            } catch (e) {
              Alert.alert("Lỗi", "Huỷ thất bại");
            } finally {
              setCancelingId(null);
            }
          },
        },
      ]);
    },
    [canManage, adminDeleteReg, cancelReg, handleRefresh]
  );

  // Dialog Handlers
  const openPreview = useCallback((src?: string, name?: string) => {
    setImgPreview({
      open: true,
      src: normalizeUrl(src) || PLACE,
      name: name || "",
    });
  }, []);
  const closePreview = useCallback(
    () => setImgPreview({ open: false, src: "", name: "" }),
    []
  );
  const openReplace = useCallback(
    (reg: any, slot: "p1" | "p2") => {
      if (canManage) {
        setReplaceDlg({ open: true, reg, slot });
        setNewPlayer(null);
      }
    },
    [canManage]
  );
  const closeReplace = useCallback(
    () => setReplaceDlg({ open: false, reg: null as any, slot: "p1" }),
    []
  );

  const openProfileByPlayer = useCallback(
    (pl: any) => {
      const u = getUserId(pl);
      if (u) {
        router.push(`/profile/${u}`);
      } else {
        Alert.alert("Thông báo", "VĐV này chưa liên kết tài khoản.");
      }
    },
    [router]
  );

  const openComplaint = useCallback(
    (reg: any) => setComplaintDlg({ open: true, reg, text: "" }),
    []
  );
  const handleCloseComplaint = useCallback(
    () => setComplaintDlg({ open: false, reg: null as any, text: "" }),
    []
  );
  const openPayment = useCallback(
    (reg: any) => setPaymentDlg({ open: true, reg }),
    []
  );
  const closePayment = useCallback(
    () => setPaymentDlg({ open: false, reg: null as any }),
    []
  );

  const submitReplace = useCallback(async () => {
    if (!newPlayer?._id) return Alert.alert("Lỗi", "Chọn VĐV mới");
    try {
      await replacePlayer({
        regId: replaceDlg.reg._id,
        slot: replaceDlg.slot,
        userId: newPlayer._id,
      }).unwrap();
      Alert.alert("Thành công", "Đã thay VĐV");
      closeReplace();
      refetchRegs();
    } catch (e: any) {
      Alert.alert("Lỗi", e?.data?.message || "Lỗi thay người");
    }
  }, [replaceDlg, newPlayer, replacePlayer, closeReplace, refetchRegs]);

  const submitComplaint = useCallback(async () => {
    if (!complaintDlg.text.trim()) return Alert.alert("Lỗi", "Nhập nội dung");
    try {
      await createComplaint({
        tournamentId: id,
        regId: complaintDlg.reg._id,
        content: complaintDlg.text,
      }).unwrap();
      Alert.alert("Thành công", "Đã gửi khiếu nại");
      handleCloseComplaint();
    } catch (e) {
      Alert.alert("Lỗi", "Gửi thất bại");
    }
  }, [complaintDlg, createComplaint, id, handleCloseComplaint]);

  const onTogglePayment = useCallback(
    async (r: any) => {
      if (!canManage) return;
      try {
        const next = r?.payment?.status === "Paid" ? "Unpaid" : "Paid";
        await setPaymentStatus({ regId: r._id, status: next }).unwrap();
        const msg =
          next === "Paid"
            ? "Đã đánh dấu thanh toán cho cặp này"
            : "Đã đánh dấu chưa thanh toán cho cặp này";
        Alert.alert("Thành công", msg);
        refetchRegs();
      } catch (e) {
        Alert.alert("Lỗi", "Cập nhật thất bại");
      }
    },
    [canManage, setPaymentStatus, refetchRegs]
  );

  // -- HEADER COMPONENT (Memoized) --
  const HeaderComponent = useMemo(
    () => (
      <View>
        <LinearGradient
          colors={[C.gradStart, C.gradEnd]}
          style={[styles.headerHero, { paddingTop: insets.top + 10 }]}
        >
          {/* Header Top: Badge & Countdown */}
          <View style={styles.headerTopRow}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={styles.badgeGlass}>
                <Text
                  style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}
                >
                  {isSingles ? "GIẢI ĐƠN" : "GIẢI ĐÔI"}
                </Text>
              </View>
              <TournamentCountdown deadline={tour?.registrationDeadline} />
            </View>
          </View>

          {/* Tournament Name */}
          <Text style={styles.tourNameHero}>{tour?.name}</Text>

          {/* Location & Date Row */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              marginTop: 8,
              opacity: 0.9,
              gap: 12,
            }}
          >
            {tour?.location && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 4,
                  flex: 1,
                }}
              >
                <Ionicons
                  name="location"
                  size={14}
                  color="#fff"
                  style={{ marginTop: 2 }}
                />
                <Text
                  style={{
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: "600",
                    lineHeight: 18,
                  }}
                >
                  {tour.location}
                </Text>
              </View>
            )}

            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
            >
              <Ionicons name="calendar" size={14} color="#fff" />
              <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>
                {fmtRange(tour?.startDate, tour?.endDate)}
              </Text>
            </View>
          </View>
        </LinearGradient>

        {/* Stats Overlap */}
        <View style={styles.statsContainer}>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <StatCard
                icon={<Ionicons name="trophy" />}
                label="Điểm tối đa"
                value={cap > 0 ? cap : "Không giới hạn"}
                color="orange"
              />
            </View>
            <View style={{ flex: 1 }}>
              <StatCard
                icon={<Ionicons name="people" />}
                label="Đã đăng ký"
                value={regTotal}
                color="blue"
              />
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            <View style={{ flex: 1 }}>
              <StatCard
                icon={<FontAwesome5 name="money-bill-wave" />}
                label="Đã thanh toán"
                value={`${paidCount}/${regTotal}`}
                color="green"
              />
            </View>
            <View style={{ flex: 1 }}>
              <StatCard
                icon={<MaterialCommunityIcons name="list-status" />}
                label="Chờ thanh toán"
                value={regTotal - paidCount}
                color="default"
              />
            </View>
          </View>
        </View>

        {/* Action Section & List Header */}
        <View
          style={{ paddingHorizontal: 16, marginTop: 16, paddingBottom: 16 }}
        >
          {/* Pending Invites */}
          {isLoggedIn && pendingInvitesHere.length > 0 && (
            <View
              style={[
                styles.sectionCard,
                {
                  backgroundColor: C.cardBg,
                  borderColor: C.border,
                  marginBottom: 16,
                },
              ]}
            >
              <Text style={[styles.sectionTitle, { color: C.textPrimary }]}>
                Lời mời đang chờ ({pendingInvitesHere.length})
              </Text>
              {pendingInvitesHere.map((inv: any) => (
                <View
                  key={inv._id}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingVertical: 8,
                    borderTopWidth: 1,
                    borderTopColor: C.border,
                  }}
                >
                  <Text
                    style={{
                      fontWeight: "600",
                      color: C.textPrimary,
                      flex: 1,
                    }}
                  >
                    {inv.tournament?.name}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity
                      onPress={() =>
                        respondInvite({ inviteId: inv._id, action: "accept" })
                      }
                      style={[
                        styles.btnSmall,
                        { backgroundColor: C.successBg },
                      ]}
                    >
                      <Text
                        style={{
                          color: C.successText,
                          fontSize: 12,
                          fontWeight: "700",
                        }}
                      >
                        Nhận
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() =>
                        respondInvite({ inviteId: inv._id, action: "decline" })
                      }
                      style={[styles.btnSmall, { backgroundColor: C.errorBg }]}
                    >
                      <Text
                        style={{
                          color: C.errorText,
                          fontSize: 12,
                          fontWeight: "700",
                        }}
                      >
                        Từ chối
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* HTML Columns (Content/Contact) */}
          <HtmlCols tour={tour} />

          {/* Registration Form */}
          <View
            style={[
              styles.formCard,
              {
                backgroundColor: C.cardBg,
                borderColor: C.border,
                ...C.shadow,
                marginTop: 16,
              },
            ]}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                marginBottom: 16,
              }}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  backgroundColor: C.tint,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="tennisball" size={18} color="#fff" />
              </View>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "800",
                  color: C.textPrimary,
                }}
              >
                {isAdmin ? "Tạo đăng ký (Admin)" : "Đăng ký thi đấu"}
              </Text>
            </View>

            {isLoggedIn ? (
              <>
                {isAdmin ? (
                  <PlayerSelector
                    label="VĐV 1"
                    eventType={tour?.eventType}
                    onChange={setP1Admin}
                    value={p1Admin}
                  />
                ) : (
                  <View
                    style={{
                      padding: 10,
                      backgroundColor: C.pageBg,
                      borderRadius: 8,
                      marginBottom: 12,
                    }}
                  >
                    <Text style={{ fontWeight: "700", color: C.textPrimary }}>
                      Bạn (VĐV 1): {displayName(me)}
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        color: C.textSecondary,
                        marginTop: 2,
                      }}
                    >
                      Điểm:{" "}
                      {roundTo3(
                        isSingles ? me?.score?.single : me?.score?.double
                      )}
                    </Text>
                  </View>
                )}
                {isDoubles && (
                  <View style={{ marginTop: 12 }}>
                    <PlayerSelector
                      label="VĐV 2 (Partner)"
                      eventType={tour?.eventType}
                      onChange={setP2}
                      value={p2}
                    />
                  </View>
                )}
                <TextInput
                  placeholder="Lời nhắn cho BTC..."
                  style={[
                    styles.input,
                    {
                      backgroundColor: C.inputBg,
                      borderColor: C.border,
                      color: C.textPrimary,
                      marginTop: 12,
                    },
                  ]}
                  placeholderTextColor={C.textSecondary}
                  value={msg}
                  onChangeText={setMsg}
                />
                <TouchableOpacity
                  style={[
                    styles.btnPrimary,
                    {
                      backgroundColor: saving ? C.textSecondary : C.tint,
                      marginTop: 16,
                    },
                  ]}
                  onPress={handleSubmit}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <Ionicons name="paper-plane" size={16} color="#fff" />
                      <Text style={{ color: "#fff", fontWeight: "700" }}>
                        Gửi đăng ký
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <Text
                style={{
                  color: C.textSecondary,
                  fontStyle: "italic",
                  textAlign: "center",
                }}
              >
                Đăng nhập để đăng ký
              </Text>
            )}
          </View>

          {/* Manager Buttons */}
          <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
            {canManage && (
              <TouchableOpacity
                style={[
                  styles.btnSoft,
                  { backgroundColor: C.softBtn, flex: 1 },
                ]}
                onPress={() => router.push(`/tournament/${id}/manage`)}
              >
                <Ionicons
                  name="settings-sharp"
                  size={16}
                  color={C.textPrimary}
                />
                <Text
                  style={{
                    fontWeight: "700",
                    color: C.textPrimary,
                    fontSize: 13,
                  }}
                >
                  Quản lý
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.btnSoft, { backgroundColor: C.softBtn, flex: 1 }]}
              onPress={() => router.push(`/tournament/${id}/bracket`)}
            >
              <MaterialCommunityIcons
                name="tournament"
                size={16}
                color={C.textPrimary}
              />
              <Text
                style={{
                  fontWeight: "700",
                  color: C.textPrimary,
                  fontSize: 13,
                }}
              >
                Sơ đồ
              </Text>
            </TouchableOpacity>
          </View>

          {/* List Count & Search Button */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 24,
              marginBottom: 8,
            }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "800",
                  color: C.textPrimary,
                }}
              >
                Danh sách
              </Text>
              <View
                style={{
                  backgroundColor: C.chipBg,
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  borderRadius: 10,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "700",
                    color: C.textPrimary,
                  }}
                >
                  {filteredRegs.length}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: C.softBtn,
                alignItems: "center",
                justifyContent: "center",
              }}
              onPress={() => setSearchOpen(true)}
            >
              <Ionicons name="search" size={20} color={C.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    ),
    [
      tour,
      C,
      insets.top,
      cap,
      regTotal,
      paidCount,
      isLoggedIn,
      pendingInvitesHere,
      isAdmin,
      p1Admin,
      p2,
      msg,
      saving,
      canManage,
      id,
      filteredRegs.length,
      me,
      isSingles,
      isDoubles,
      searchQ,
    ]
  );

  // Search Screen as View overlay
  const renderSearchScreen = () => (
    <View
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: C.pageBg, zIndex: 10 },
      ]}
    >
      <SafeAreaView style={{ flex: 1 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            padding: 12,
            borderBottomWidth: 1,
            borderBottomColor: C.border,
          }}
        >
          <TouchableOpacity
            onPress={() => setSearchOpen(false)}
            style={{ padding: 8 }}
          >
            <Ionicons name="chevron-back" size={24} color={C.textPrimary} />
          </TouchableOpacity>
          <TextInput
            autoFocus
            placeholder="Tìm kiếm..."
            style={{
              flex: 1,
              fontSize: 16,
              color: C.textPrimary,
              paddingHorizontal: 10,
            }}
            placeholderTextColor={C.textSecondary}
            value={searchQ}
            onChangeText={setSearchQ}
          />
          {searchQ.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQ("")}>
              <Ionicons name="close-circle" size={20} color={C.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
        <FlashList
          data={filteredRegs}
          estimatedItemSize={150}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          renderItem={({ item, index }) => (
            <RegItem
              r={item}
              index={index}
              isSingles={isSingles}
              canManage={canManage}
              cap={cap}
              delta={delta}
              isOwner={item.createdBy === me?._id}
              onPreview={openPreview}
              onOpenProfile={openProfileByPlayer}
              onOpenReplace={openReplace}
              onTogglePayment={onTogglePayment}
              onCancel={onCancelReg}
              onOpenComplaint={openComplaint}
              onOpenPayment={openPayment}
              busy={{ settingPayment, deletingId: cancelingId }}
            />
          )}
        />
      </SafeAreaView>
    </View>
  );

  if (tourLoading) return <TournamentSkeleton />;

  if (!tour)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: C.pageBg,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Text style={{ color: C.textSecondary }}>Không tìm thấy giải đấu</Text>
      </View>
    );

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: searchOpen ? false : true,
          title: "Đăng ký giải đấu",
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.back()}
              style={{
                paddingHorizontal: 8,
                paddingVertical: 4,
              }}
            >
              <Ionicons name="chevron-back" size={24} />
            </TouchableOpacity>
          ),
        }}
      />
      <View style={{ flex: 1, backgroundColor: C.pageBg }}>
        {/* Main List */}
        <FlashList
          ref={listRef}
          data={filteredRegs}
          estimatedItemSize={180}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          renderItem={({ item, index }) => (
            <RegItem
              r={item}
              index={index}
              isSingles={isSingles}
              canManage={canManage}
              cap={cap}
              delta={delta}
              isOwner={item.createdBy === me?._id}
              onPreview={openPreview}
              onOpenProfile={openProfileByPlayer}
              onOpenReplace={openReplace}
              onTogglePayment={onTogglePayment}
              onCancel={onCancelReg}
              onOpenComplaint={openComplaint}
              onOpenPayment={openPayment}
              busy={{ settingPayment, deletingId: cancelingId }}
            />
          )}
          ListHeaderComponent={HeaderComponent}
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshing={regsLoading}
          onRefresh={handleRefresh}
        />

        {/* Search Overlay */}
        {searchOpen && renderSearchScreen()}

        {/* MODALS */}

        {/* === IMAGE VIEWER LIBRARY === */}
        <ImageView
          images={[{ uri: imgPreview.src }]}
          imageIndex={0}
          visible={imgPreview.open}
          onRequestClose={closePreview}
          // Dùng Custom Component bọc ExpoImage
          ImageComponent={CustomExpoImage}
          // Nền thay đổi theo theme
          backgroundColor={C.imageViewBg}
          // Nút Close ở Header
          HeaderComponent={({ imageIndex }) => (
            <SafeAreaView
              style={{
                width: "100%",
                alignItems: "flex-end",
                zIndex: 10,
              }}
            >
              <TouchableOpacity
                style={{
                  padding: 10,
                  marginTop: Platform.OS === "android" ? 10 : 0,
                  backgroundColor: C.imageViewCloseBtn,
                  borderRadius: 20,
                  marginRight: 16,
                }}
                onPress={closePreview}
              >
                <Ionicons
                  name="close"
                  size={26}
                  color={C.imageViewText} // Icon màu tương phản
                />
              </TouchableOpacity>
            </SafeAreaView>
          )}
          // Caption Name ở Footer
          FooterComponent={({ imageIndex }) =>
            imgPreview.name ? (
              <SafeAreaView>
                <View
                  style={{
                    padding: 16,
                    alignItems: "center",
                    backgroundColor: "rgba(0,0,0,0.5)", // Vẫn giữ nền mờ để text dễ đọc
                  }}
                >
                  <Text
                    style={{
                      color: "#fff", // Text luôn trắng vì nền mờ đen
                      fontWeight: "bold",
                      fontSize: 16,
                    }}
                  >
                    {imgPreview.name}
                  </Text>
                </View>
              </SafeAreaView>
            ) : undefined
          }
        />

        <Modal
          visible={replaceDlg.open}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={closeReplace}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ flex: 1, backgroundColor: C.pageBg }}
          >
            <View
              style={{
                padding: 16,
                borderBottomWidth: 1,
                borderColor: C.border,
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontWeight: "700",
                  fontSize: 16,
                  color: C.textPrimary,
                }}
              >
                Thay đổi VĐV
              </Text>
              <TouchableOpacity onPress={closeReplace}>
                <Text style={{ color: C.tint, fontWeight: "600" }}>Đóng</Text>
              </TouchableOpacity>
            </View>
            <View style={{ padding: 16 }}>
              <PlayerSelector
                label="Chọn VĐV mới"
                eventType={tour?.eventType}
                onChange={setNewPlayer}
                value={newPlayer}
              />
              <TouchableOpacity
                style={[
                  styles.btnPrimary,
                  {
                    backgroundColor:
                      replacing || !newPlayer ? C.textSecondary : C.tint,
                    marginTop: 24,
                  },
                ]}
                disabled={replacing || !newPlayer}
                onPress={submitReplace}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>
                  {replacing ? "Đang lưu..." : "Lưu thay đổi"}
                </Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        <Modal
          visible={paymentDlg.open}
          transparent
          animationType="slide"
          onRequestClose={closePayment}
        >
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, { backgroundColor: C.cardBg }]}>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "800",
                  textAlign: "center",
                  marginBottom: 16,
                  color: C.textPrimary,
                }}
              >
                Thanh toán lệ phí
              </Text>
              {paymentDlg.reg && (
                <View style={{ alignItems: "center" }}>
                  <Text style={{ marginBottom: 12, color: C.textSecondary }}>
                    Mã ĐK:{" "}
                    <Text style={{ fontWeight: "bold", color: C.textPrimary }}>
                      {regCodeOf(paymentDlg.reg)}
                    </Text>
                  </Text>
                  {qrImgUrlFor(tour, paymentDlg.reg, me?.phone) ? (
                    <ExpoImage
                      source={{
                        uri: qrImgUrlFor(tour, paymentDlg.reg, me?.phone)!,
                      }}
                      style={{ width: 220, height: 220 }}
                    />
                  ) : (
                    <Text>Chưa cấu hình QR</Text>
                  )}
                  <Text
                    style={{
                      fontSize: 11,
                      color: C.textSecondary,
                      marginTop: 12,
                      textAlign: "center",
                    }}
                  >
                    Quét mã trên để thanh toán. Nội dung chuyển khoản đã được
                    tạo tự động.
                  </Text>
                </View>
              )}
              <TouchableOpacity
                style={[
                  styles.btnPrimary,
                  { marginTop: 20, backgroundColor: C.tint },
                ]}
                onPress={closePayment}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>Đóng</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <Modal
          visible={complaintDlg.open}
          transparent
          animationType="slide"
          onRequestClose={handleCloseComplaint}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ flex: 1, justifyContent: "flex-end" }}
          >
            <View
              style={[
                styles.modalCard,
                {
                  backgroundColor: C.cardBg,
                  padding: 20,
                  margin: 0,
                  borderBottomLeftRadius: 0,
                  borderBottomRightRadius: 0,
                },
              ]}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "700",
                  marginBottom: 12,
                  color: C.textPrimary,
                }}
              >
                Gửi khiếu nại
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: C.inputBg,
                    color: C.textPrimary,
                    minHeight: 80,
                  },
                ]}
                multiline
                placeholder="Nhập nội dung..."
                placeholderTextColor={C.textSecondary}
                value={complaintDlg.text}
                onChangeText={(t) =>
                  setComplaintDlg({ ...complaintDlg, text: t })
                }
              />
              <View
                style={{
                  flexDirection: "row",
                  gap: 10,
                  marginTop: 16,
                  justifyContent: "flex-end",
                }}
              >
                <TouchableOpacity onPress={handleCloseComplaint}>
                  <Text
                    style={{
                      color: C.textSecondary,
                      fontWeight: "600",
                      padding: 10,
                    }}
                  >
                    Huỷ
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={submitComplaint}
                  style={{
                    backgroundColor: C.tint,
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: 8,
                  }}
                >
                  <Text style={{ color: "#fff", fontWeight: "700" }}>Gửi</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  // ... (Giữ nguyên styles cũ)
  // Hero
  headerHero: { paddingHorizontal: 16, paddingBottom: 40 },
  headerTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  badgeGlass: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  tourNameHero: {
    fontSize: 22,
    fontWeight: "800",
    color: "#fff",
    lineHeight: 30,
    textShadowColor: "rgba(0,0,0,0.3)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  searchBtnHeader: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },

  // Stats
  statsContainer: { marginTop: -30, paddingHorizontal: 16 },
  statCard: {
    flexDirection: "row",
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    gap: 12,
  },
  statIconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  // Sections
  sectionCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    padding: 12,
    backgroundColor: "rgba(0,0,0,0.03)",
  },
  formCard: { borderRadius: 20, borderWidth: 1, padding: 16 },

  // Reg Item Card
  regCard: {
    borderRadius: 16,
    borderWidth: 1,
    marginHorizontal: 16,
    marginTop: 12,
    overflow: "hidden",
  },
  regHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rankBadge: {
    width: 20,
    height: 20,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  miniEditBtn: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  addPlayerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: 10,
    borderRadius: 12,
    borderStyle: "dashed",
    borderWidth: 1,
    marginTop: 8,
  },

  // Buttons
  btnPrimary: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  btnOutline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  btnSmall: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  btnSoft: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
  },
  btnActionSmall: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  iconActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },

  input: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },

  // Modals
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: { width: "100%", borderRadius: 24, padding: 24 },

  // HTML Preview
  htmlCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  htmlFade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 100 },
  htmlMoreBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  fullHtmlHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
  },
  fullHtmlCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },

  // Full Screen Modal (Replace)
  fullModalContainer: { flex: 1 },
  fullModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  fullModalHeaderBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 72,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    flexDirection: "row",
  },
  searchCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  // Legacy
  card: {
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  chipTxt: { fontSize: 12, fontWeight: "700" },
  btn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  btnWhite: { color: "#fff", fontWeight: "700" },
  btnText: { fontWeight: "700" },
  alert: { padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
  selfCard: { borderWidth: 1, borderRadius: 12, padding: 10 },
  row: { flexDirection: "row", gap: 8 },
  title: { fontSize: 20, fontWeight: "800" },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  tourName: { fontSize: 18, fontWeight: "800" },
  muted: {},
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 12,
    rowGap: 6,
    marginTop: 6,
  },
  label: { marginTop: 12, marginBottom: 6, fontWeight: "700" },
  textarea: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 72,
    textAlignVertical: "top",
  },
  searchWrap: { marginTop: 10, position: "relative" },
});
