// app/screens/TournamentRegistrationScreen.tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  Linking,
  TouchableOpacity,
  useColorScheme,
} from "react-native";
import RenderHTML from "react-native-render-html";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
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
import PublicProfileSheet from "@/components/PublicProfileDialog";
import { normalizeUrl } from "@/utils/normalizeUri";
import { Image as ExpoImage } from "expo-image";
import { roundTo3 } from "@/utils/roundTo3";
import { getFeeAmount } from "@/utils/fee";

const PLACE = "https://dummyimage.com/800x600/cccccc/ffffff&text=?";

/* =============== THEME =============== */
function useThemeColors() {
  const scheme = useColorScheme() ?? "light";
  const tint = scheme === "dark" ? "#7cc0ff" : "#0a84ff";
  const pageBg = scheme === "dark" ? "#0e0f12" : "#f7f9fc";
  const cardBg = scheme === "dark" ? "#111214" : "#fff";
  const border = scheme === "dark" ? "#2f3136" : "#e5e7eb";
  const textPrimary = scheme === "dark" ? "#fff" : "#111";
  const muted = scheme === "dark" ? "#9aa0a6" : "#6b7280";
  const chipBg = scheme === "dark" ? "#22252a" : "#eef2f7";
  const chipFg = scheme === "dark" ? "#e5e7eb" : "#263238";
  const inputBg = scheme === "dark" ? "#1a1c21" : "#fff";
  const inputBorder = border;
  const ghostBg = scheme === "dark" ? "#2a2c31" : "#eee";
  const ghostText = textPrimary;
  const skeleton =
    scheme === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";

  // Alerts
  const errBg = scheme === "dark" ? "#3a1f21" : "#fee2e2";
  const errBorder = scheme === "dark" ? "#6e2a34" : "#ef4444";
  const errText = scheme === "dark" ? "#ffb3b8" : "#991b1b";
  const infoBg = scheme === "dark" ? "#26324a" : "#eff6ff";
  const infoBorder = scheme === "dark" ? "#3c4f74" : "#93c5fd";
  const infoText = scheme === "dark" ? "#cfe3ff" : "#1e3a8a";

  return {
    scheme,
    tint,
    pageBg,
    cardBg,
    border,
    textPrimary,
    muted,
    chipBg,
    chipFg,
    inputBg,
    inputBorder,
    ghostBg,
    ghostText,
    skeleton,
    errBg,
    errBorder,
    errText,
    infoBg,
    infoBorder,
    infoText,
  };
}

/* ---------------- helpers ---------------- */
const normType = (t?: string) => {
  const s = String(t || "").toLowerCase();
  if (s === "single" || s === "singles") return "single";
  if (s === "double" || s === "doubles") return "double";
  return s || "double";
};

const displayName = (pl: any) => {
  if (!pl) return "—";
  const fn = pl.fullName || pl.name || "";
  const nn = pl.nickName || pl.nickname || "";
  return nn ? `${fn} (${nn})` : fn || "—";
};

const getUserId = (pl: any) => {
  const u = pl?.user;
  if (!u) return null;
  if (typeof u === "string") return u.trim() || null;
  if (typeof u === "object" && u._id) return String(u._id);
  return null;
};

const totalScoreOf = (r: any, isSingles: boolean) =>
  (r?.player1?.score || 0) + (isSingles ? 0 : r?.player2?.score || 0);

const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString() : "");
const fmtRange = (a?: string, b?: string) => {
  const A = fmtDate(a);
  const B = fmtDate(b);
  if (A && B) return `${A} – ${B}`;
  return A || B || "—";
};

/* cap / delta & màu tổng điểm */
const getScoreCap = (tour: any, isSingles: boolean) =>
  Number(
    isSingles ? tour?.singleCap ?? tour?.scoreCap ?? 0 : tour?.scoreCap ?? 0
  );

const getMaxDelta = (tour: any) =>
  Number(
    tour?.scoreGap ??
      tour?.maxDelta ??
      tour?.scoreTolerance ??
      tour?.tolerance ??
      0
  );

type TotalState = "success" | "warning" | "error" | "default";

/** ✅ Logic màu tổng điểm: total < cap+delta => xanh; = => vàng; > => đỏ */
const decideTotalState = (total: number, cap: number, delta?: number) => {
  const t = Number(total);
  const c = Number(cap);
  if (!Number.isFinite(t) || !(Number.isFinite(c) && c > 0)) {
    return { state: "default" as TotalState, note: "" };
  }
  const d = Number.isFinite(delta) && Number(delta) > 0 ? Number(delta) : 0;
  const threshold = c + d;
  const EPS = 1e-6;
  if (t > threshold + EPS) return { state: "error" as TotalState, note: "" };
  if (Math.abs(t - threshold) <= EPS)
    return { state: "warning" as TotalState, note: "" };
  return { state: "success" as TotalState, note: "" };
};

const chipColorsByState: Record<TotalState, { bg: string; fg: string }> = {
  success: { bg: "#e8f5e9", fg: "#2e7d32" },
  warning: { bg: "#fef3c7", fg: "#92400e" },
  error: { bg: "#fee2e2", fg: "#991b1b" },
  default: { bg: "#eeeeee", fg: "#424242" },
};

/* -------- small atoms (RN) -------- */
const Chip = ({
  label,
  bg,
  fg,
}: {
  label: string;
  bg?: string;
  fg?: string;
}) => {
  const C = useThemeColors();
  return (
    <View style={[styles.chip, { backgroundColor: bg ?? C.chipBg }]}>
      <Text
        numberOfLines={1}
        style={[styles.chipTxt, { color: fg ?? C.chipFg }]}
      >
        {label}
      </Text>
    </View>
  );
};

function PrimaryBtn({
  onPress,
  children,
  disabled,
}: {
  onPress: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const C = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: disabled ? "#9aa0a6" : C.tint },
        pressed && !disabled && { opacity: 0.9 },
      ]}
    >
      <Text style={styles.btnWhite}>{children}</Text>
    </Pressable>
  );
}
function OutlineBtn({
  onPress,
  children,
  disabled,
}: {
  onPress: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const C = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        styles.btnOutline,
        { borderColor: disabled ? "#c7c7c7" : C.tint },
        pressed && !disabled && { opacity: 0.95 },
      ]}
    >
      <Text style={{ fontWeight: "700", color: disabled ? "#9aa0a6" : C.tint }}>
        {children}
      </Text>
    </Pressable>
  );
}

function PaymentChip({ status, paidAt }: { status?: string; paidAt?: string }) {
  const isPaid = status === "Paid";
  const when = paidAt ? new Date(paidAt) : null;
  const whenText = when && !isNaN(+when) ? ` • ${when.toLocaleString()}` : "";
  return (
    <Chip
      label={isPaid ? `Đã thanh toán${whenText}` : "Chưa thanh toán"}
      bg={isPaid ? "#e8f5e9" : undefined}
      fg={isPaid ? "#2e7d32" : undefined}
    />
  );
}
function CheckinChip({ checkinAt }: { checkinAt?: string }) {
  const C = useThemeColors();
  const ok = !!checkinAt;
  return (
    <Chip
      label={
        ok
          ? `Đã check-in • ${new Date(checkinAt!).toLocaleString()}`
          : "Chưa check-in"
      }
      bg={ok ? "#e0f2fe" : C.chipBg}
      fg={ok ? "#075985" : C.chipFg}
    />
  );
}

function StatItem({ label, value, hint }: any) {
  const C = useThemeColors();
  return (
    <View style={{ padding: 8 }}>
      <Text style={{ color: C.muted, fontSize: 12 }}>{label}</Text>
      <Text
        style={{
          color: C.textPrimary,
          fontWeight: "800",
          fontSize: 18,
          marginTop: 2,
        }}
      >
        {String(value)}
      </Text>
      {hint ? (
        <Text style={{ color: C.muted, fontSize: 12 }}>{hint}</Text>
      ) : null}
    </View>
  );
}

/** VĐV 1 (Bạn) */
function SelfPlayerReadonly({
  me,
  isSingles,
}: {
  me: any;
  isSingles: boolean;
}) {
  const C = useThemeColors();
  if (!me?._id) return null;
  const display = me?.nickname || me?.name || "Tôi";
  const scoreVal = isSingles ? me?.score?.single : me?.score?.double;
  return (
    <View
      style={[
        styles.selfCard,
        { backgroundColor: C.cardBg, borderColor: C.border },
      ]}
    >
      <Text
        style={{ fontWeight: "700", marginBottom: 8, color: C.textPrimary }}
      >
        VĐV 1 (Bạn)
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <ExpoImage
          source={{ uri: normalizeUrl(me?.avatar) || PLACE }}
          style={{
            width: 46,
            height: 46,
            borderRadius: 23,
            backgroundColor: "#eee",
          }}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={0}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{ fontWeight: "600", color: C.textPrimary }}
          >
            {display}
          </Text>
          <Text numberOfLines={1} style={{ color: C.muted, fontSize: 12 }}>
            {me?.phone || "—"}
          </Text>
        </View>
        <Chip
          label={`Điểm ${isSingles ? "đơn" : "đôi"}: ${roundTo3(
            Number(scoreVal ?? 0)
          )}`}
          bg={C.cardBg}
          fg={C.textPrimary}
        />
      </View>
    </View>
  );
}

/* ---------- Payment & Complaint helpers ---------- */
const maskPhone = (phone?: string) => {
  if (!phone) return "*******???";
  const d = String(phone).replace(/\D/g, "");
  const tail = d.slice(-3) || "???";
  return "*******" + tail;
};
const regCodeOf = (r: any) =>
  r?.code ||
  r?.shortCode ||
  String(r?._id || "")
    .slice(-5)
    .toUpperCase();

const normalizeNoAccent = (s?: string) =>
  (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const getQrProviderConfig = (tour: any) => {
  const bank =
    tour?.bankShortName ||
    tour?.qrBank ||
    tour?.bankCode ||
    tour?.bank ||
    process.env.EXPO_PUBLIC_QR_BANK ||
    "";
  const acc =
    tour?.bankAccountNumber ||
    tour?.qrAccount ||
    tour?.bankAccount ||
    process.env.EXPO_PUBLIC_QR_ACC ||
    "";
  return { bank, acc };
};
const qrImgUrlFor = (tour: any, r: any, mePhone?: string) => {
  const { bank, acc } = getQrProviderConfig(tour);
  if (!bank || !acc) return null;

  const code = regCodeOf(r);
  const ph = maskPhone(r?.player1?.phone || r?.player2?.phone || mePhone || "");
  const des = normalizeNoAccent(
    `Ma giai ${tour?._id || ""} Ma dang ky ${code} SDT ${ph}`
  );

  const params = new URLSearchParams({ bank, acc, des, template: "compact" });
  try {
    const amount = getFeeAmount?.(tour, r);
    if (typeof amount === "number" && amount > 0)
      params.set("amount", String(amount));
  } catch {}
  return `https://qr.sepay.vn/img?${params.toString()}`;
};

/* --------- Action cell (có Thanh toán & Khiếu nại) --------- */
function ActionCell({
  r,
  canManage,
  isOwner,
  onTogglePayment,
  onCancel,
  onOpenComplaint,
  onOpenPayment,
  busy,
}: any) {
  return (
    <View
      style={{
        flexDirection: "row",
        gap: 6,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      {canManage && (
        <OutlineBtn
          onPress={() => onTogglePayment(r)}
          disabled={busy?.settingPayment}
        >
          {r?.payment?.status === "Paid" ? "Bỏ thanh toán" : "Xác nhận phí 💰"}
        </OutlineBtn>
      )}
      <PrimaryBtn onPress={() => onOpenPayment(r)}>Thanh toán</PrimaryBtn>
      <OutlineBtn onPress={() => onOpenComplaint(r)}>⚠️ Khiếu nại</OutlineBtn>
      {(canManage || isOwner) && (
        <OutlineBtn
          onPress={() => onCancel(r)}
          disabled={busy?.deletingId === r?._id}
        >
          🗑️ Huỷ
        </OutlineBtn>
      )}
    </View>
  );
}

/* ---------- HTML columns (contact + content) ---------- */
function HtmlCols({ tour }: { tour: any }) {
  const { width } = useWindowDimensions();
  const C = useThemeColors();
  const GAP = 12;
  const twoCols = width >= 820;

  if (!tour?.contactHtml && !tour?.contentHtml) return null;

  const colContentWidth = twoCols
    ? Math.floor((width - 16 * 2 - GAP) / 2)
    : width - 16 * 2;

  const common = {
    contentWidth: colContentWidth,
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
  } as const;

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
              width: twoCols ? colContentWidth : "100%",
              marginBottom: twoCols ? 0 : 12,
            }}
          >
            <Text
              style={{
                fontSize: 16,
                fontWeight: "700",
                marginBottom: 8,
                color: C.textPrimary,
              }}
            >
              Thông tin liên hệ
            </Text>
            <View
              style={[
                styles.htmlCard,
                { backgroundColor: C.cardBg, borderColor: C.border },
              ]}
            >
              <RenderHTML source={{ html: tour.contactHtml }} {...common} />
            </View>
          </View>
        )}
        {!!tour?.contentHtml && (
          <View style={{ width: twoCols ? colContentWidth : "100%" }}>
            <Text
              style={{
                fontSize: 16,
                fontWeight: "700",
                marginBottom: 8,
                color: C.textPrimary,
              }}
            >
              Nội dung giải đấu
            </Text>
            <View
              style={[
                styles.htmlCard,
                { backgroundColor: C.cardBg, borderColor: C.border },
              ]}
            >
              <RenderHTML source={{ html: tour.contentHtml }} {...common} />
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

/* ===== Hook: keyboard height (để tránh bàn phím che nội dung) ===== */
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

/* ===== Item đã memo để mượt hơn ===== */
const RegItem = React.memo(
  function RegItem({
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
    cancelingId,
    settingPayment,
  }: any) {
    const C = useThemeColors();
    const total = totalScoreOf(r, isSingles);
    const { state } = decideTotalState(total, cap, delta);
    const { bg, fg } = chipColorsByState[state];
    const players = [r?.player1, r?.player2].filter(Boolean);

    // ✅ Lấy mã đăng ký để hiển thị
    const code = regCodeOf(r);

    return (
      <View
        style={[
          styles.card,
          {
            marginHorizontal: 16,
            marginTop: 8,
            backgroundColor: C.cardBg,
            borderColor: C.border,
          },
        ]}
      >
        {/* ✅ Hàng đầu: Mã đăng ký + STT */}
        <View style={styles.cardTopRow}>
          <Chip label={`Mã đăng ký: ${code}`} />
          <Text style={{ color: C.muted, fontSize: 12 }}>#{index + 1}</Text>
        </View>

        {/* (giữ nguyên phần còn lại) */}
        {players.map((pl: any, idx: number) => (
          <View
            key={`${pl?.phone || pl?.fullName || idx}`}
            style={{ marginTop: 10 }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <Pressable
                onPress={() => onPreview(pl?.avatar || PLACE, displayName(pl))}
              >
                <ExpoImage
                  source={{ uri: normalizeUrl(pl?.avatar) || PLACE }}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: "#eee",
                  }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={0}
                />
              </Pressable>

              <Pressable
                onPress={() => onOpenProfile(pl)}
                style={{ flex: 1, minWidth: 0 }}
              >
                <Text
                  numberOfLines={1}
                  style={{ fontWeight: "600", color: C.textPrimary }}
                >
                  {displayName(pl)}
                </Text>
                <Text
                  numberOfLines={1}
                  style={{ color: C.muted, fontSize: 12 }}
                >
                  {pl?.phone || ""}
                </Text>
              </Pressable>

              <Chip
                label={`Điểm: ${roundTo3(pl?.score) ?? 0}`}
                bg={C.cardBg}
                fg={C.textPrimary}
              />
              {canManage && (
                <OutlineBtn
                  onPress={() => onOpenReplace(r, idx === 0 ? "p1" : "p2")}
                >
                  Thay VĐV
                </OutlineBtn>
              )}
            </View>
          </View>
        ))}

        {!isSingles && !r.player2 && canManage && (
          <View style={{ marginTop: 8 }}>
            <OutlineBtn onPress={() => onOpenReplace(r, "p2")}>
              Thêm VĐV 2
            </OutlineBtn>
          </View>
        )}

        <Text style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>
          {new Date(r.createdAt).toLocaleString()}
        </Text>

        <View
          style={{
            flexDirection: "row",
            gap: 8,
            marginTop: 8,
            flexWrap: "wrap",
          }}
        >
          <PaymentChip status={r.payment?.status} paidAt={r.payment?.paidAt} />
          <CheckinChip checkinAt={r.checkinAt} />
        </View>

        <View
          style={{
            flexDirection: "row",
            gap: 6,
            alignItems: "center",
            marginTop: 8,
          }}
        >
          <Text style={{ fontWeight: "600", color: C.textPrimary }}>
            Tổng điểm:
          </Text>
          <Chip label={`${roundTo3(total)}`} bg={bg} fg={fg} />
        </View>

        <View style={{ marginTop: 10 }}>
          <ActionCell
            r={r}
            canManage={canManage}
            isOwner={isOwner}
            onTogglePayment={onTogglePayment}
            onCancel={onCancel}
            onOpenComplaint={onOpenComplaint}
            onOpenPayment={onOpenPayment}
            busy={{ settingPayment, deletingId: cancelingId }}
          />
        </View>
      </View>
    );
  },
  (a, b) => {
    return (
      a.r?._id === b.r?._id &&
      a.r?.payment?.status === b.r?.payment?.status &&
      a.r?.checkinAt === b.r?.checkinAt &&
      a.r?.player2?._id === b.r?.player2?._id &&
      a.isSingles === b.isSingles &&
      a.canManage === b.canManage &&
      a.index === b.index &&
      a.cancelingId === b.cancelingId &&
      a.settingPayment === b.settingPayment
    );
  }
);

/* ===================== Screen ===================== */
export default function TournamentRegistrationScreen() {
  const C = useThemeColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlashList<any>>(null);

  const { data: me, isLoading: meLoading, error: meErr } = useGetMeScoreQuery();
  const isLoggedIn = !!me?._id;

  /* ─── queries ─── */
  const {
    data: tour,
    isLoading: tourLoading,
    error: tourErr,
  } = useGetTournamentQuery(id);
  const {
    data: regs = [],
    isLoading: regsLoading,
    error: regsErr,
    refetch: refetchRegs,
  } = useGetRegistrationsQuery(id);

  const {
    data: myInvites = [],
    error: invitesErr,
    refetch: refetchInvites,
  } = useListMyRegInvitesQuery(undefined, { skip: !isLoggedIn });

  const [createInvite, { isLoading: saving }] = useCreateRegInviteMutation();
  const [respondInvite, { isLoading: responding }] =
    useRespondRegInviteMutation();
  const [cancelReg] = useCancelRegistrationMutation();
  const [setPaymentStatus, { isLoading: settingPayment }] =
    useManagerSetRegPaymentStatusMutation();
  const [adminDeleteReg] = useManagerDeleteRegistrationMutation();
  const [replacePlayer, { isLoading: replacing }] =
    useManagerReplaceRegPlayerMutation();
  const [createComplaint, { isLoading: sendingComplaint }] =
    useCreateComplaintMutation();

  /* ─── local state ─── */
  const [p1Admin, setP1Admin] = useState<any>(null);
  const [p2, setP2] = useState<any>(null);

  const [msg, setMsg] = useState("");
  const [cancelingId, setCancelingId] = useState<string | null>(null);

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
  const [profile, setProfile] = useState({ open: false, userId: null as any });

  // complaint & payment
  const [complaintDlg, setComplaintDlg] = useState({
    open: false,
    reg: null as any,
    text: "",
  });
  const [paymentDlg, setPaymentDlg] = useState({
    open: false,
    reg: null as any,
  });

  // ===== Search & infinite pagination (client-side) =====
  const PAGE_SIZE = 15;
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [take, setTake] = useState(PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // tránh che nội dung khi bàn phím mở
  const kbHeight = useKeyboardHeight();

  // auto gợi ý VĐV1 là chính admin (nếu muốn)
  useEffect(() => {
    if ((me as any)?._id && !p1Admin) setP1Admin(me);
  }, [me, p1Admin]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const matchStr = (s?: string) =>
    (s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const filteredRegs = useMemo(() => {
    if (!debouncedQ) return regs;
    const qn = matchStr(debouncedQ);
    return regs.filter((r: any) => {
      const code = regCodeOf(r);
      const p1 = r?.player1 || {};
      const p2 = r?.player2 || {};
      const text = `${displayName(p1)} ${p1?.phone || ""} ${displayName(p2)} ${
        p2?.phone || ""
      } ${code}`.toLowerCase();
      return matchStr(text).includes(qn);
    });
  }, [regs, debouncedQ]);

  useEffect(() => {
    setTake(PAGE_SIZE);
    listRef.current?.scrollToOffset?.({ offset: 0, animated: false });
  }, [debouncedQ, regs]);

  const canLoadMore = take < filteredRegs.length;
  const listData = useMemo(
    () => filteredRegs.slice(0, take),
    [filteredRegs, take]
  );

  const loadMore = useCallback(() => {
    if (!canLoadMore || loadingMore) return;
    setLoadingMore(true);
    setTimeout(() => {
      setTake((t) => Math.min(t + PAGE_SIZE, filteredRegs.length));
      setLoadingMore(false);
    }, 100);
  }, [canLoadMore, loadingMore, filteredRegs.length]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refetchRegs(),
        isLoggedIn ? refetchInvites() : Promise.resolve(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [refetchRegs, refetchInvites, isLoggedIn]);

  const evType = useMemo(() => normType(tour?.eventType), [tour]);
  const isSingles = evType === "single";
  const isDoubles = evType === "double";

  const isManager = useMemo(() => {
    if (!isLoggedIn || !tour) return false;
    if (String(tour.createdBy) === String(me._id)) return true;
    if (Array.isArray(tour.managers)) {
      return tour.managers.some(
        (m: any) => String(m?.user ?? m) === String(me._id)
      );
    }
    return !!tour.isManager;
  }, [isLoggedIn, me, tour]);
  const isAdmin = !!(
    me?.isAdmin ||
    me?.role === "admin" ||
    (Array.isArray(me?.roles) && me.roles.includes("admin"))
  );
  const canManage = isLoggedIn && (isManager || isAdmin);

  const pendingInvitesHere = useMemo(() => {
    if (!isLoggedIn) return [];
    return (myInvites || []).filter(
      (it: any) => String(it?.tournament?._id || it?.tournament) === String(id)
    );
  }, [myInvites, id, isLoggedIn]);

  const regTotal = regs?.length ?? 0;
  const paidCount = useMemo(
    () => regs.filter((r: any) => r?.payment?.status === "Paid").length,
    [regs]
  );

  const cap = useMemo(() => getScoreCap(tour, isSingles), [tour, isSingles]);
  const delta = useMemo(() => getMaxDelta(tour), [tour]);

  /* ─── actions ─── */
  const submit = async () => {
    if (!isLoggedIn)
      return Alert.alert(
        "Thông báo",
        "Vui lòng đăng nhập để đăng ký giải đấu."
      );

    let player1Id: string | null = null;
    if (isAdmin) {
      if (!p1Admin?._id) {
        return Alert.alert("Thiếu thông tin", "Vui lòng chọn VĐV 1.");
      }
      player1Id = String(p1Admin._id);
    } else {
      if (!me?._id) {
        return Alert.alert(
          "Thiếu thông tin",
          "Không xác định được VĐV 1 (bạn)."
        );
      }
      player1Id = String(me._id);
    }

    if (isDoubles && !p2)
      return Alert.alert("Thiếu thông tin", "Giải đôi cần 2 VĐV");

    if (
      isDoubles &&
      isAdmin &&
      p1Admin?._id &&
      p2?._id &&
      String(p1Admin._id) === String(p2._id)
    ) {
      return Alert.alert(
        "Không hợp lệ",
        "VĐV 1 và VĐV 2 không được trùng nhau."
      );
    }

    try {
      const payload: any = {
        tourId: id,
        message: msg,
        player1Id,
        ...(isDoubles && p2?._id ? { player2Id: p2._id } : {}),
      };

      const res = await createInvite(payload).unwrap();
      const mode = res?.mode ?? (res?.registration ? "direct" : "invite");

      if (
        mode === "direct_by_admin" ||
        mode === "direct_by_kyc" ||
        mode === "direct"
      ) {
        Alert.alert("Thành công", res?.message ?? "Đã tạo đăng ký");
        if (isAdmin) setP1Admin(null);
        setP2(null);
        setMsg("");
        await refetchRegs();
        listRef.current?.scrollToOffset?.({ offset: 0, animated: true });
        return;
      }

      Alert.alert(
        "Thành công",
        isSingles ? "Đã gửi lời mời (giải đơn)" : "Đã gửi lời mời (giải đôi)"
      );
      if (isAdmin) setP1Admin(null);
      setP2(null);
      setMsg("");
      await Promise.all([
        isLoggedIn ? refetchInvites() : Promise.resolve(),
        refetchRegs(),
      ]);
      listRef.current?.scrollToOffset?.({ offset: 0, animated: true });
    } catch (err: any) {
      if (parseInt(err?.status) === 412) {
        const msg412 =
          err?.data?.message ||
          (isDoubles
            ? "Đồng đội cần KYC (xác minh CCCD)."
            : "Bạn cần KYC (xác minh CCCD).");
        Alert.alert("Cần xác minh CCCD", msg412, [
          {
            text: "Xác minh ngay",
            onPress: () => router.push(`/(tabs)/profile`),
          },
          { text: "Để sau", style: "cancel" },
        ]);
      } else {
        Alert.alert(
          "Lỗi",
          err?.data?.message || err?.error || "Gửi lời mời thất bại"
        );
      }
    }
  };

  const handleCancel = (r: any) => {
    if (!isLoggedIn)
      return Alert.alert(
        "Thông báo",
        "Vui lòng đăng nhập để đăng ký giải đấu."
      );
    if (!canManage && r?.payment?.status === "Paid") {
      return Alert.alert(
        "Không thể huỷ",
        "Đã nộp lệ phí, vui lòng liên hệ BTC để hỗ trợ."
      );
    }
    if (!canManage) {
      const isOwner = me && String(r?.createdBy) === String(me?._id);
      if (!isOwner)
        return Alert.alert("Không có quyền", "Bạn không thể huỷ đăng ký này.");
    }
    const extraWarn =
      r?.payment?.status === "Paid"
        ? "\n⚠️ Cặp này đã nộp lệ phí. Hãy đảm bảo hoàn tiền/offline theo quy trình trước khi xoá."
        : "";
    Alert.alert(
      "Xác nhận",
      `Bạn chắc chắn muốn huỷ cặp đăng ký này?${extraWarn}`,
      [
        { text: "Không", style: "cancel" },
        {
          text: "Có, huỷ",
          style: "destructive",
          onPress: async () => {
            try {
              setCancelingId(r._id);
              if (canManage) await adminDeleteReg(r._id).unwrap();
              else await cancelReg(r._id).unwrap();
              Alert.alert("Thành công", "Đã huỷ đăng ký");
              refetchRegs();
            } catch (e: any) {
              Alert.alert(
                "Lỗi",
                e?.data?.message || e?.error || "Huỷ đăng ký thất bại"
              );
            } finally {
              setCancelingId(null);
            }
          },
        },
      ]
    );
  };

  const handleInviteRespond = async (
    inviteId: string,
    action: "accept" | "decline"
  ) => {
    if (!isLoggedIn)
      return Alert.alert(
        "Thông báo",
        "Vui lòng đăng nhập để phản hồi lời mời."
      );
    try {
      await respondInvite({ inviteId, action }).unwrap();
      Alert.alert(
        "OK",
        action === "accept" ? "Đã chấp nhận lời mời" : "Đã từ chối"
      );
      await Promise.all([refetchInvites(), refetchRegs()]);
    } catch (e: any) {
      Alert.alert(
        "Lỗi",
        e?.data?.message || e?.error || "Không thể gửi phản hồi"
      );
    }
  };

  const togglePayment = async (r: any) => {
    if (!canManage)
      return Alert.alert(
        "Thông báo",
        "Bạn không có quyền cập nhật thanh toán."
      );
    const next = r?.payment?.status === "Paid" ? "Unpaid" : "Paid";
    try {
      await setPaymentStatus({ regId: r._id, status: next }).unwrap();
      Alert.alert(
        "OK",
        next === "Paid"
          ? "Đã xác nhận đã thanh toán"
          : "Đã chuyển về chưa thanh toán"
      );
      refetchRegs();
    } catch (e: any) {
      Alert.alert(
        "Lỗi",
        e?.data?.message || e?.error || "Cập nhật thanh toán thất bại"
      );
    }
  };

  const openPreview = (src?: string, name?: string) =>
    setImgPreview({
      open: true,
      src: normalizeUrl(src) || PLACE,
      name: name || "",
    });
  const closePreview = () => setImgPreview({ open: false, src: "", name: "" });

  const openReplace = (reg: any, slot: "p1" | "p2") => {
    if (!canManage) return;
    setReplaceDlg({ open: true, reg, slot });
    setNewPlayer(null);
  };
  const closeReplace = () =>
    setReplaceDlg({ open: false, reg: null as any, slot: "p1" });
  const submitReplace = async () => {
    if (!replaceDlg?.reg?._id)
      return Alert.alert("Thiếu thông tin", "Chọn cặp cần thay.");
    if (!newPlayer?._id) return Alert.alert("Thiếu thông tin", "Chọn VĐV mới");
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
      Alert.alert("Lỗi", e?.data?.message || e?.error || "Không thể thay VĐV");
    }
  };

  const openProfileByPlayer = (pl: any) => {
    const uid = getUserId(pl);
    if (uid) setProfile({ open: true, userId: uid });
    else Alert.alert("Thông báo", "Không tìm thấy userId của VĐV này.");
  };

  const openComplaint = (reg: any) =>
    setComplaintDlg({ open: true, reg, text: "" });
  const closeComplaint = () =>
    setComplaintDlg({ open: false, reg: null as any, text: "" });
  const submitComplaint = async () => {
    const regId = complaintDlg?.reg?._id;
    const content = complaintDlg.text?.trim();
    if (!content)
      return Alert.alert("Thiếu nội dung", "Vui lòng nhập nội dung khiếu nại.");
    if (!regId)
      return Alert.alert("Lỗi", "Không tìm thấy mã đăng ký để gửi khiếu nại.");
    if (!isLoggedIn)
      return Alert.alert("Thông báo", "Vui lòng đăng nhập để gửi khiếu nại.");
    try {
      await createComplaint({ tournamentId: id, regId, content }).unwrap();
      Alert.alert("Thành công", "Đã gửi khiếu nại. BTC sẽ phản hồi sớm.");
      closeComplaint();
    } catch (e: any) {
      Alert.alert(
        "Lỗi",
        e?.data?.message || e?.error || "Gửi khiếu nại thất bại"
      );
    }
  };

  const openPayment = (reg: any) => setPaymentDlg({ open: true, reg });
  const closePayment = () => setPaymentDlg({ open: false, reg: null as any });

  const onGoDraw = () => router.push(`/tournament/${id}/draw`);
  const onGoManage = () => router.push(`/tournament/${id}/manage`);

  /* ───────────────── Guards ───────────────── */
  if (tourLoading) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: C.pageBg }]}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }
  if (tourErr) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: C.pageBg }]}>
        <View
          style={[
            styles.alert,
            { borderColor: C.errBorder, backgroundColor: C.errBg },
          ]}
        >
          <Text style={{ color: C.errText }}>
            {(tourErr as any)?.data?.message ||
              (tourErr as any)?.error ||
              "Lỗi tải giải đấu"}
          </Text>
        </View>
      </SafeAreaView>
    );
  }
  if (!tour) return null;

  const isSinglesLabel = isSingles ? "Giải đơn" : "Giải đôi";

  /* ───────────────── Header (bao gồm search) ───────────────── */
  const HeaderBlock = (
    <View style={{ padding: 16, paddingBottom: 8 }}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: C.textPrimary }]}>
          Đăng ký giải đấu
        </Text>
        <Chip
          label={isSinglesLabel}
          bg={isSingles ? undefined : "#dbeafe"}
          fg={isSingles ? undefined : "#1e3a8a"}
        />
      </View>

      {/* Thông tin giải */}
      <View
        style={[
          styles.sectionCard,
          { backgroundColor: C.cardBg, borderColor: C.border },
        ]}
      >
        <Text
          style={[styles.tourName, { color: C.textPrimary }]}
          numberOfLines={1}
        >
          {tour.name}
        </Text>
        <Text style={[styles.muted, { color: C.muted }]}>
          {tour.location || "—"}
        </Text>
        <Text style={[styles.muted, { color: C.muted }]}>
          {fmtRange(tour.startDate, tour.endDate)}
        </Text>

        <View style={{ height: 8 }} />
        <View style={styles.statsGrid}>
          <StatItem
            label={isDoubles ? "Giới hạn tổng điểm (đội)" : "Giới hạn điểm/VĐV"}
            value={
              isDoubles
                ? tour?.scoreCap ?? 0
                : tour?.singleCap ?? tour?.scoreCap ?? 0
            }
            hint={isDoubles ? "Giới hạn điểm (đôi)" : "Giới hạn điểm (đơn)"}
          />
          <StatItem
            label="Giới hạn điểm mỗi VĐV"
            value={tour?.singleCap ?? 0}
            hint="Giới hạn điểm (đơn)"
          />
          <StatItem
            label={isSingles ? "Số VĐV đã đăng ký" : "Số đội đã đăng ký"}
            value={regTotal}
          />
          <StatItem
            label={isSingles ? "Số VĐV đã nộp lệ phí" : "Số đội đã nộp lệ phí"}
            value={paidCount}
          />
        </View>

        <HtmlCols tour={tour} />
      </View>

      {/* Thông báo đăng nhập */}
      {meLoading
        ? null
        : !isLoggedIn && (
            <View
              style={[
                styles.alert,
                { borderColor: C.infoBorder, backgroundColor: C.infoBg },
              ]}
            >
              <Text style={{ color: C.infoText }}>
                Bạn chưa đăng nhập. Hãy đăng nhập để thực hiện đăng ký giải đấu.
              </Text>
            </View>
          )}

      {/* Lời mời đang chờ */}
      {isLoggedIn && pendingInvitesHere.length > 0 && (
        <View
          style={[
            styles.sectionCard,
            { backgroundColor: C.cardBg, borderColor: C.border },
          ]}
        >
          <Text
            style={{ fontWeight: "800", marginBottom: 8, color: C.textPrimary }}
          >
            Lời mời đang chờ xác nhận
          </Text>
          {invitesErr ? (
            <View
              style={[
                styles.alert,
                { borderColor: C.errBorder, backgroundColor: C.errBg },
              ]}
            >
              <Text style={{ color: C.errText }}>
                {(invitesErr as any)?.data?.message ||
                  (invitesErr as any)?.error ||
                  "Không tải được lời mời"}
              </Text>
            </View>
          ) : null}

          {pendingInvitesHere.map((inv: any) => {
            const { confirmations = {}, eventType } = inv || {};
            const isSingle = eventType === "single";
            const chip = (v: any) =>
              v === "accepted" ? (
                <Chip label="Đã chấp nhận" bg="#e8f5e9" fg="#166534" />
              ) : v === "declined" ? (
                <Chip label="Từ chối" bg="#fee2e2" fg="#991b1b" />
              ) : (
                <Chip label="Chờ xác nhận" />
              );
            return (
              <View
                key={inv._id}
                style={{
                  borderWidth: 1,
                  borderStyle: "dashed",
                  borderColor: C.border,
                  borderRadius: 12,
                  padding: 10,
                  marginBottom: 10,
                }}
              >
                <Text style={{ fontWeight: "700", color: C.textPrimary }}>
                  {inv.tournament?.name}
                </Text>
                <Text style={{ color: C.muted, marginBottom: 8 }}>
                  {isSingle ? "Giải đơn" : "Giải đôi"} •{" "}
                  {inv.tournament?.startDate
                    ? new Date(inv.tournament?.startDate).toLocaleDateString()
                    : ""}
                </Text>

                <View
                  style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}
                >
                  <Chip label="P1" bg={C.cardBg} fg={C.textPrimary} />
                  {chip(confirmations?.p1)}
                  {!isSingle && (
                    <>
                      <Chip label="P2" bg={C.cardBg} fg={C.textPrimary} />
                      {chip(confirmations?.p2)}
                    </>
                  )}
                </View>

                <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                  <OutlineBtn
                    disabled={responding}
                    onPress={() => handleInviteRespond(inv._id, "decline")}
                  >
                    Từ chối
                  </OutlineBtn>
                  <PrimaryBtn
                    disabled={responding}
                    onPress={() => handleInviteRespond(inv._id, "accept")}
                  >
                    Chấp nhận
                  </PrimaryBtn>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* FORM đăng ký */}
      <View
        style={[
          styles.sectionCard,
          { backgroundColor: C.cardBg, borderColor: C.border },
        ]}
      >
        <Text
          style={{
            fontWeight: "800",
            fontSize: 16,
            marginBottom: 8,
            color: C.textPrimary,
          }}
        >
          {isAdmin ? "Tạo đăng ký (admin)" : "Gửi lời mời đăng ký"}
        </Text>

        {meLoading ? (
          <View style={{ paddingVertical: 6 }}>
            <ActivityIndicator />
          </View>
        ) : meErr ? (
          <View
            style={[
              styles.alert,
              { borderColor: C.errBorder, backgroundColor: C.errBg },
            ]}
          >
            <Text style={{ color: C.errText }}>
              {(meErr.status === 403 &&
                "Bạn chưa đăng nhập. Không có thông tin") ||
                (meErr as any)?.data?.message ||
                (meErr as any)?.error ||
                "Không tải được thông tin của bạn"}
            </Text>
          </View>
        ) : isLoggedIn ? (
          isAdmin ? (
            <>
              <View style={{ marginTop: 8 }}>
                <PlayerSelector
                  label="VĐV 1"
                  eventType={tour.eventType}
                  onChange={setP1Admin}
                />
              </View>
              {isDoubles && (
                <View style={{ marginTop: 12 }}>
                  <PlayerSelector
                    label="VĐV 2"
                    eventType={tour.eventType}
                    onChange={setP2}
                  />
                </View>
              )}
            </>
          ) : (
            <>
              <SelfPlayerReadonly me={me} isSingles={isSingles} />
              {isDoubles && (
                <View style={{ marginTop: 12 }}>
                  <PlayerSelector
                    label="VĐV 2"
                    eventType={tour.eventType}
                    onChange={setP2}
                  />
                </View>
              )}
            </>
          )
        ) : (
          <View
            style={[
              styles.alert,
              { borderColor: C.infoBorder, backgroundColor: C.infoBg },
            ]}
          >
            <Text style={{ color: C.infoText }}>
              Bạn chưa đăng nhập. Hãy đăng nhập để đăng ký.
            </Text>
          </View>
        )}

        <Text style={[styles.label, { color: C.textPrimary }]}>Lời nhắn</Text>
        <TextInput
          value={msg}
          onChangeText={setMsg}
          multiline
          numberOfLines={3}
          style={[
            styles.textarea,
            {
              backgroundColor: C.inputBg,
              borderColor: C.inputBorder,
              color: C.textPrimary,
            },
          ]}
          placeholder="Ghi chú cho BTC…"
          placeholderTextColor={C.muted}
        />

        <Text style={{ color: C.muted, fontSize: 12 }}>
          {isAdmin
            ? "Quyền admin: tạo đăng ký và duyệt ngay, không cần xác nhận từ VĐV."
            : isSingles
            ? "Giải đơn: VĐV 1 luôn là bạn; cần KYC (đã xác minh) để đăng ký."
            : "Giải đôi: VĐV 1 luôn là bạn; CẢ HAI VĐV cần KYC (đã xác minh)."}
        </Text>

        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          <PrimaryBtn
            onPress={submit}
            disabled={
              saving ||
              meLoading ||
              !isLoggedIn ||
              (isAdmin ? !p1Admin || (isDoubles && !p2) : isDoubles && !p2)
            }
          >
            {isAdmin
              ? saving
                ? "Đang tạo…"
                : "Tạo đăng ký"
              : saving
              ? "Đang gửi…"
              : "Gửi lời mời"}
          </PrimaryBtn>
          <OutlineBtn onPress={() => router.push(`/tournament/${id}/checkin`)}>
            Check-in
          </OutlineBtn>
          <OutlineBtn onPress={() => router.push(`/tournament/${id}/bracket`)}>
            Sơ đồ
          </OutlineBtn>
        </View>
      </View>

      {canManage && (
        <View
          style={[
            styles.sectionCard,
            { backgroundColor: C.cardBg, borderColor: C.border },
          ]}
        >
          <Text
            style={[styles.title, { marginBottom: 10, color: C.textPrimary }]}
          >
            Quản lý giải đấu
          </Text>

          <View style={styles.row}>
            <TouchableOpacity
              style={[
                styles.btn,
                { backgroundColor: C.tint, borderColor: C.tint },
              ]}
              onPress={onGoDraw}
            >
              <Text style={[styles.btnText, { color: "#fff" }]}>Bốc thăm</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btn, styles.btnOutline, { borderColor: C.tint }]}
              onPress={onGoManage}
            >
              <Text style={[styles.btnText, { color: C.tint }]}>
                Quản lý giải
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Tiêu đề + Search danh sách */}
      <View style={{ marginTop: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text
            style={{ fontSize: 18, fontWeight: "800", color: C.textPrimary }}
          >
            Danh sách đăng ký ({regTotal})
          </Text>
          <Chip
            label={`Kết quả: ${filteredRegs.length}`}
            bg="#eef2ff"
            fg="#3730a3"
          />
        </View>

        <View style={styles.searchWrap}>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Tìm theo VĐV, SĐT, mã ĐK…"
            placeholderTextColor={C.muted}
            style={[
              styles.searchInput,
              {
                backgroundColor: C.inputBg,
                borderColor: C.inputBorder,
                color: C.textPrimary,
              },
            ]}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={() => Keyboard.dismiss()}
          />
          {q.length > 0 && (
            <Pressable style={styles.clearBtn} onPress={() => setQ("")}>
              <Text style={{ fontWeight: "800", color: C.muted }}>✕</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Thông báo lỗi / loading */}
      {regsLoading ? (
        <View style={{ paddingVertical: 16, alignItems: "center" }}>
          <ActivityIndicator />
        </View>
      ) : regsErr ? (
        <View
          style={[
            styles.alert,
            { borderColor: C.errBorder, backgroundColor: C.errBg },
          ]}
        >
          <Text style={{ color: C.errText }}>
            {(regsErr as any)?.data?.message ||
              (regsErr as any)?.error ||
              "Lỗi tải danh sách"}
          </Text>
        </View>
      ) : null}
    </View>
  );

  /* ===================== LIST ===================== */
  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: C.pageBg }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={insets.top}
    >
      <FlashList
        ref={listRef}
        data={listData}
        refreshing={refreshing}
        onRefresh={onRefresh}
        keyExtractor={(item, i) => String(item?._id || i)}
        renderItem={({ item: r, index }) => {
          const isOwner =
            isLoggedIn && String(r?.createdBy) === String(me?._id);
          return (
            <RegItem
              r={r}
              index={index}
              isSingles={isSingles}
              canManage={canManage}
              cap={cap}
              delta={delta}
              isOwner={isOwner}
              onPreview={openPreview}
              onOpenProfile={openProfileByPlayer}
              onOpenReplace={openReplace}
              onTogglePayment={togglePayment}
              onCancel={handleCancel}
              onOpenComplaint={openComplaint}
              onOpenPayment={openPayment}
              cancelingId={cancelingId}
              settingPayment={settingPayment}
            />
          );
        }}
        ListHeaderComponent={HeaderBlock}
        ListFooterComponent={
          <View style={{ padding: 16, alignItems: "center" }}>
            {loadingMore && <ActivityIndicator />}
            {!loadingMore && !canLoadMore && filteredRegs.length > 0 && (
              <Text style={{ color: C.muted, fontSize: 12 }}>
                — Đã hết dữ liệu —
              </Text>
            )}
          </View>
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        estimatedItemSize={220}
        removeClippedSubviews
        contentContainerStyle={{ paddingBottom: 16 + kbHeight }}
      />

      {/* Preview ảnh */}
      <Modal
        visible={imgPreview.open}
        transparent
        animationType="fade"
        onRequestClose={closePreview}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={{ flex: 1 }} onPress={closePreview} />
          <View
            style={[
              styles.modalCard,
              { backgroundColor: C.cardBg, borderColor: C.border },
            ]}
          >
            <ExpoImage
              source={{ uri: normalizeUrl(imgPreview.src) || PLACE }}
              style={{
                width: "100%",
                height: 360,
                borderRadius: 12,
                backgroundColor: C.pageBg,
              }}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={0}
            />
            <PrimaryBtn onPress={closePreview}>Đóng</PrimaryBtn>
          </View>
          <Pressable style={{ flex: 1 }} onPress={closePreview} />
        </View>
      </Modal>

      {/* Modal thay VĐV */}
      <Modal
        visible={replaceDlg.open}
        transparent
        animationType="slide"
        onRequestClose={closeReplace}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: C.cardBg, borderColor: C.border },
            ]}
          >
            <Text
              style={{
                fontWeight: "800",
                fontSize: 16,
                marginBottom: 8,
                color: C.textPrimary,
              }}
            >
              {replaceDlg.slot === "p2" ? "Thay/Thêm VĐV 2" : "Thay VĐV 1"}
            </Text>

            <PlayerSelector
              label="Chọn VĐV mới"
              eventType={tour?.eventType}
              onChange={setNewPlayer}
            />
            <Text style={{ color: C.muted, fontSize: 12, marginTop: 6 }}>
              Lưu ý: thao tác này cập nhật trực tiếp cặp đăng ký.
            </Text>

            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <OutlineBtn onPress={closeReplace}>Huỷ</OutlineBtn>
              <PrimaryBtn
                onPress={submitReplace}
                disabled={replacing || !newPlayer?._id}
              >
                {replacing ? "Đang lưu…" : "Lưu thay đổi"}
              </PrimaryBtn>
            </View>
          </View>
        </View>
      </Modal>

      {/* Sheet hồ sơ công khai */}
      <PublicProfileSheet
        open={profile.open}
        onClose={() => setProfile({ open: false, userId: null })}
        userId={profile.userId}
      />

      {/* Modal Khiếu nại */}
      <Modal
        visible={complaintDlg.open}
        transparent
        animationType="slide"
        onRequestClose={closeComplaint}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: C.cardBg, borderColor: C.border },
            ]}
          >
            <Text
              style={{
                fontWeight: "800",
                fontSize: 16,
                marginBottom: 8,
                color: C.textPrimary,
              }}
            >
              Khiếu nại đăng ký
            </Text>
            <Text style={{ color: C.textPrimary, marginBottom: 6 }}>
              Vui lòng mô tả chi tiết vấn đề. BTC sẽ tiếp nhận và phản hồi.
            </Text>
            <TextInput
              value={complaintDlg.text}
              onChangeText={(t) => setComplaintDlg((s) => ({ ...s, text: t }))}
              multiline
              numberOfLines={5}
              style={[
                styles.textarea,
                {
                  minHeight: 120,
                  backgroundColor: C.inputBg,
                  borderColor: C.inputBorder,
                  color: C.textPrimary,
                },
              ]}
              placeholder="Ví dụ: sai thông tin VĐV, sai điểm trình, muốn đổi khung giờ…"
              placeholderTextColor={C.muted}
            />
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <OutlineBtn onPress={closeComplaint}>Đóng</OutlineBtn>
              <PrimaryBtn
                onPress={submitComplaint}
                disabled={sendingComplaint || !complaintDlg.text.trim()}
              >
                {sendingComplaint ? "Đang gửi…" : "Gửi khiếu nại"}
              </PrimaryBtn>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Thanh toán QR */}
      <Modal
        visible={paymentDlg.open}
        transparent
        animationType="slide"
        onRequestClose={closePayment}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: C.cardBg, borderColor: C.border },
            ]}
          >
            <Text
              style={{
                fontWeight: "800",
                fontSize: 16,
                marginBottom: 8,
                color: C.textPrimary,
              }}
            >
              Thanh toán lệ phí
            </Text>
            {paymentDlg.reg ? (
              <>
                {(() => {
                  const code = regCodeOf(paymentDlg.reg);
                  const ph = maskPhone(
                    paymentDlg.reg?.player1?.phone ||
                      paymentDlg.reg?.player2?.phone ||
                      me?.phone ||
                      ""
                  );
                  return (
                    <Text style={{ color: C.textPrimary, marginBottom: 8 }}>
                      Quét QR để thanh toán cho mã đăng ký{" "}
                      <Text style={{ fontWeight: "800" }}>{code}</Text>.{"\n"}
                      SĐT xác nhận: {ph}.
                    </Text>
                  );
                })()}
                {(() => {
                  const url = qrImgUrlFor(tour, paymentDlg.reg, me?.phone);
                  if (!url) {
                    return (
                      <View
                        style={[
                          styles.alert,
                          {
                            borderColor: C.infoBorder,
                            backgroundColor: C.infoBg,
                          },
                        ]}
                      >
                        <Text style={{ color: C.infoText }}>
                          Chưa có QR thanh toán. Dùng mục{" "}
                          <Text style={{ fontWeight: "800" }}>Khiếu nại</Text>{" "}
                          để liên hệ BTC.
                        </Text>
                      </View>
                    );
                  }
                  return (
                    <>
                      <View style={{ alignItems: "center", marginVertical: 8 }}>
                        <ExpoImage
                          source={{ uri: url }}
                          style={{
                            width: 260,
                            height: 260,
                            borderRadius: 12,
                            backgroundColor: C.ghostBg,
                          }}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                          transition={0}
                        />
                      </View>
                      <Text
                        style={{
                          color: C.muted,
                          fontSize: 12,
                          textAlign: "center",
                        }}
                      >
                        Quét mã QR để thanh toán phí đăng ký giải đấu.
                      </Text>
                    </>
                  );
                })()}
              </>
            ) : null}

            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              {!paymentDlg.reg ||
              !qrImgUrlFor(tour, paymentDlg.reg, me?.phone) ? (
                <OutlineBtn
                  onPress={() =>
                    setComplaintDlg({
                      open: true,
                      reg: paymentDlg.reg,
                      text: "",
                    })
                  }
                >
                  ⚠️ Khiếu nại
                </OutlineBtn>
              ) : null}
              <PrimaryBtn onPress={closePayment}>Đóng</PrimaryBtn>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

/* ---------------- styles ---------------- */
const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  title: { fontSize: 20, fontWeight: "800" },

  sectionCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
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

  /* Search */
  searchWrap: { marginTop: 10, position: "relative" },
  searchInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  clearBtn: {
    position: "absolute",
    right: 10,
    top: 10,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },

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
  btnOutline: { borderWidth: 1, backgroundColor: "transparent" },
  btnWhite: { color: "#fff", fontWeight: "700" },

  alert: { padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 12 },

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
  },

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

  selfCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },
  row: { flexDirection: "row", gap: 8 },
});
