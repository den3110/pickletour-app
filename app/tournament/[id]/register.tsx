// app/screens/TournamentRegistrationScreen.tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import RenderHTML from "react-native-render-html";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSelector } from "react-redux";

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
} from "@/slices/tournamentsApiSlice";

import PaginationRN from "@/components/PaginationRN";
import PlayerSelector from "@/components/PlayerSelector"; // RN version
import PublicProfileSheet from "@/components/PublicProfileDialog"; // ✅ đúng component sheet
import { normalizeUrl } from "@/utils/normalizeUri";
import { Image as ExpoImage } from "expo-image";

const PLACE = "https://dummyimage.com/800x600/cccccc/ffffff&text=?";

/* ---------------- helpers ---------------- */
const normType = (t?: string) => {
  const s = String(t || "").toLowerCase();
  if (s === "single" || s === "singles") return "single";
  if (s === "double" || s === "doubles") return "double";
  return s || "double";
};

const displayName = (pl: any) => {
  if (!pl) return "—";
  const fn = pl.fullName || "";
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

/* -------- small atoms (RN) -------- */
const Chip = ({ label, bg = "#eef2f7", fg = "#263238" }: any) => (
  <View style={[styles.chip, { backgroundColor: bg }]}>
    <Text numberOfLines={1} style={[styles.chipTxt, { color: fg }]}>
      {label}
    </Text>
  </View>
);

function PrimaryBtn({ onPress, children, disabled }: any) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: disabled ? "#9aa0a6" : "#0a84ff" },
        pressed && !disabled && { opacity: 0.9 },
      ]}
    >
      <Text style={styles.btnWhite}>{children}</Text>
    </Pressable>
  );
}
function OutlineBtn({ onPress, children, disabled }: any) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        styles.btnOutline,
        { borderColor: disabled ? "#c7c7c7" : "#0a84ff" },
        pressed && !disabled && { opacity: 0.95 },
      ]}
    >
      <Text
        style={{ fontWeight: "700", color: disabled ? "#9aa0a6" : "#0a84ff" }}
      >
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
      bg={isPaid ? "#e8f5e9" : "#eeeeee"}
      fg={isPaid ? "#2e7d32" : "#424242"}
    />
  );
}

function CheckinChip({ checkinAt }: { checkinAt?: string }) {
  const ok = !!checkinAt;
  return (
    <Chip
      label={
        ok
          ? `Đã check-in • ${new Date(checkinAt!).toLocaleString()}`
          : "Chưa check-in"
      }
      bg={ok ? "#e0f2fe" : "#eeeeee"}
      fg={ok ? "#075985" : "#424242"}
    />
  );
}

function StatItem({ label, value, hint }: any) {
  return (
    <View style={{ padding: 8 }}>
      <Text style={{ color: "#6b7280", fontSize: 12 }}>{label}</Text>
      <Text
        style={{ color: "#111", fontWeight: "800", fontSize: 18, marginTop: 2 }}
      >
        {String(value)}
      </Text>
      {hint ? (
        <Text style={{ color: "#9aa0a6", fontSize: 12 }}>{hint}</Text>
      ) : null}
    </View>
  );
}

/* --------- Action cell --------- */
function ActionCell({
  r,
  canManage,
  isOwner,
  onTogglePayment,
  onCancel,
  busy,
}: any) {
  return (
    <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
      {canManage && (
        <OutlineBtn
          onPress={() => onTogglePayment(r)}
          disabled={busy?.settingPayment}
        >
          {r?.payment?.status === "Paid" ? "Bỏ thanh toán" : "Xác nhận phí 💰"}
        </OutlineBtn>
      )}
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
  const GAP = 12;
  const twoCols = width >= 820;

  if (!tour?.contactHtml && !tour?.contentHtml) return null;

  // bề rộng mỗi cột (ước lượng, trừ padding & gap để RenderHTML scale ảnh)
  const colContentWidth = twoCols
    ? Math.floor((width - 16 * 2 - GAP) / 2)
    : width - 16 * 2;

  const common = {
    contentWidth: colContentWidth,
    defaultTextProps: { selectable: true },
    onLinkPress: (_e: any, href?: string) =>
      href && Linking.openURL(href).catch(() => {}),
    tagsStyles: {
      a: { color: "#1976d2", textDecorationLine: "underline" },
      img: { borderRadius: 8 },
      p: { marginBottom: 8, lineHeight: 20 },
      ul: { marginBottom: 8, paddingLeft: 18 },
      ol: { marginBottom: 8, paddingLeft: 18 },
      h1: { fontSize: 20, fontWeight: "700", marginBottom: 6 },
      h2: { fontSize: 18, fontWeight: "700", marginBottom: 6 },
      h3: { fontSize: 16, fontWeight: "700", marginBottom: 6 },
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
            <Text style={{ fontSize: 16, fontWeight: "700", marginBottom: 8 }}>
              Thông tin liên hệ
            </Text>
            <View style={styles.htmlCard}>
              <RenderHTML source={{ html: tour.contactHtml }} {...common} />
            </View>
          </View>
        )}
        {!!tour?.contentHtml && (
          <View style={{ width: twoCols ? colContentWidth : "100%" }}>
            <Text style={{ fontSize: 16, fontWeight: "700", marginBottom: 8 }}>
              Nội dung giải đấu
            </Text>
            <View style={styles.htmlCard}>
              <RenderHTML source={{ html: tour.contentHtml }} {...common} />
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

/* ===================== Screen ===================== */
export default function TournamentRegistrationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const listRef = useRef<FlatList>(null);

  const me = useSelector((s: any) => s.auth?.userInfo || null);
  const isLoggedIn = !!me?._id;

  // client pagination for registrations
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);

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

  /* ─── local state ─── */
  const [p1, setP1] = useState<any>(null);
  const [p2, setP2] = useState<any>(null);
  const [msg, setMsg] = useState("");
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  const [imgPreview, setImgPreview] = useState({
    open: false,
    src: "",
    name: "",
  });

  // replace player modal
  const [replaceDlg, setReplaceDlg] = useState({
    open: false,
    reg: null as any,
    slot: "p1" as "p1" | "p2",
  });
  const [newPlayer, setNewPlayer] = useState<any>(null);

  // profile sheet
  const [profile, setProfile] = useState({ open: false, userId: null as any });

  const evType = useMemo(() => normType(tour?.eventType), [tour]);
  const isSingles = evType === "single";
  const isDoubles = evType === "double";

  // quyền
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

  // invites của giải hiện tại
  const pendingInvitesHere = useMemo(() => {
    if (!isLoggedIn) return [];
    return (myInvites || []).filter(
      (it: any) => String(it?.tournament?._id || it?.tournament) === String(id)
    );
  }, [myInvites, id, isLoggedIn]);

  // derived for regs
  const regCount = regs?.length ?? 0;
  const paidCount = useMemo(
    () => regs.filter((r: any) => r?.payment?.status === "Paid").length,
    [regs]
  );

  const totalPages = Math.max(1, Math.ceil(regCount / pageSize));
  const baseIndex = (page - 1) * pageSize;
  const paginatedRegs = useMemo(
    () => regs.slice(baseIndex, baseIndex + pageSize),
    [regs, baseIndex, pageSize]
  );

  // clamp trang khi dữ liệu đổi
  useEffect(() => {
    const total = Math.max(1, Math.ceil((regs?.length ?? 0) / pageSize));
    if (page > total) setPage(total);
  }, [regs, page, pageSize]);

  // utils
  const playersOfReg = (r: any) => [r?.player1, r?.player2].filter(Boolean);
  const disableSubmit = saving || !p1 || (isDoubles && !p2);

  /* ─── actions ─── */
  const submit = async () => {
    if (!isLoggedIn)
      return Alert.alert(
        "Thông báo",
        "Vui lòng đăng nhập để đăng ký giải đấu."
      );
    if (!p1) return Alert.alert("Thiếu thông tin", "Chọn VĐV 1");
    if (isDoubles && !p2)
      return Alert.alert("Thiếu thông tin", "Giải đôi cần 2 VĐV");

    try {
      const res = await createInvite({
        tourId: id,
        message: msg,
        player1Id: p1._id,
        ...(isDoubles ? { player2Id: p2._id } : {}),
      }).unwrap();

      if (res?.mode === "direct_by_admin" || res?.registration) {
        Alert.alert("Thành công", "Đã tạo đăng ký (admin — auto approve)");
        setP1(null);
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
      setP1(null);
      setP2(null);
      setMsg("");
      await Promise.all([
        isLoggedIn ? refetchInvites() : Promise.resolve(),
        refetchRegs(),
      ]);
      listRef.current?.scrollToOffset?.({ offset: 0, animated: true });
    } catch (err: any) {
      if (err?.status == 412) {
        // Precondition Failed: cần xác minh CCCD
        Alert.alert("Cần xác minh CCCD", err?.data?.message, [
          {
            text: "Xác minh ngay",
            onPress: () => router.push(`/(tabs)/profile`),
          },
          { text: "Để sau", style: "cancel" },
        ]);
        return;
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
    if (!replaceDlg?.reg?._id) return;
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

  /* ---- small subcomponents ---- */
  const PlayerCell = ({ player, canEdit, onEdit }: any) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <Pressable
        onPress={() =>
          openPreview(player?.avatar || PLACE, displayName(player))
        }
      >
        <ExpoImage
          source={{ uri: normalizeUrl(player?.avatar) || PLACE }}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: "#eee",
          }}
          contentFit="cover"
          cachePolicy="memory-disk" // cache mạnh tay: RAM + disk
          transition={0} // tắt fade để khỏi thấy “nháy”
        />
      </Pressable>

      <Pressable
        onPress={() => openProfileByPlayer(player)}
        style={{ flex: 1, minWidth: 0 }}
      >
        <Text numberOfLines={1} style={{ fontWeight: "600", color: "#111" }}>
          {displayName(player)}
        </Text>
        <Text numberOfLines={1} style={{ color: "#6b7280", fontSize: 12 }}>
          {player?.phone || ""}
        </Text>
      </Pressable>

      <Chip label={`Điểm: ${player?.score ?? 0}`} bg="#fff" fg="#111" />
      {canEdit && <OutlineBtn onPress={onEdit}>Thay VĐV</OutlineBtn>}
    </View>
  );

  /* ───────────────── Guards ───────────────── */
  if (tourLoading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }
  if (tourErr) {
    return (
      <SafeAreaView style={styles.container}>
        <View
          style={[
            styles.alert,
            { borderColor: "#ef4444", backgroundColor: "#fee2e2" },
          ]}
        >
          <Text style={{ color: "#991b1b" }}>
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

  /* ───────────────── FlatList root ───────────────── */
  // Header gom toàn bộ phần trên danh sách
  const ListHeader = (
    <View style={{ padding: 16, paddingBottom: 8 }}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={styles.title}>Đăng ký giải đấu</Text>
        <Chip
          label={isSinglesLabel}
          bg={isSingles ? "#eeeeee" : "#dbeafe"}
          fg={isSingles ? "#424242" : "#1e3a8a"}
        />
      </View>

      {/* Thông tin giải */}
      <View style={styles.sectionCard}>
        <Text style={styles.tourName} numberOfLines={1}>
          {tour.name}
        </Text>
        <Text style={styles.muted}>{tour.location || "—"}</Text>
        <Text style={styles.muted}>
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
            value={regCount}
          />
          <StatItem
            label={isSingles ? "Số VĐV đã nộp lệ phí" : "Số đội đã nộp lệ phí"}
            value={paidCount}
          />
        </View>

        {/* HTML liên hệ / nội dung */}
        <HtmlCols tour={tour} />
      </View>

      {/* Thông báo đăng nhập */}
      {!isLoggedIn && (
        <View
          style={[
            styles.alert,
            { borderColor: "#93c5fd", backgroundColor: "#eff6ff" },
          ]}
        >
          <Text style={{ color: "#1e3a8a" }}>
            Bạn chưa đăng nhập. Hãy đăng nhập để xem/ phản hồi lời mời và thực
            hiện đăng ký.
          </Text>
        </View>
      )}

      {/* Lời mời đang chờ */}
      {isLoggedIn && pendingInvitesHere.length > 0 && (
        <View style={styles.sectionCard}>
          <Text style={{ fontWeight: "800", marginBottom: 8 }}>
            Lời mời đang chờ xác nhận
          </Text>
          {invitesErr ? (
            <View
              style={[
                styles.alert,
                { borderColor: "#ef4444", backgroundColor: "#fee2e2" },
              ]}
            >
              <Text style={{ color: "#991b1b" }}>
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
                <Chip label="Chờ xác nhận" bg="#eeeeee" fg="#424242" />
              );
            return (
              <View
                key={inv._id}
                style={{
                  borderWidth: 1,
                  borderStyle: "dashed",
                  borderColor: "#e5e7eb",
                  borderRadius: 12,
                  padding: 10,
                  marginBottom: 10,
                }}
              >
                <Text style={{ fontWeight: "700" }}>
                  {inv.tournament?.name}
                </Text>
                <Text style={{ color: "#6b7280", marginBottom: 8 }}>
                  {isSingle ? "Giải đơn" : "Giải đôi"} •{" "}
                  {inv.tournament?.startDate
                    ? new Date(inv.tournament?.startDate).toLocaleDateString()
                    : ""}
                </Text>

                <View
                  style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}
                >
                  <Chip label="P1" bg="#fff" fg="#111" />
                  {chip(confirmations?.p1)}
                  {!isSingle && (
                    <>
                      <Chip label="P2" bg="#fff" fg="#111" />
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

      {/* FORM đăng ký/lời mời */}
      <View style={styles.sectionCard}>
        <Text style={{ fontWeight: "800", fontSize: 16, marginBottom: 8 }}>
          {isAdmin ? "Tạo đăng ký (admin)" : "Gửi lời mời đăng ký"}
        </Text>

        <PlayerSelector
          label={isSingles ? "VĐV" : "VĐV 1"}
          eventType={tour.eventType}
          onChange={setP1}
        />
        {isDoubles && (
          <View style={{ marginTop: 12 }}>
            <PlayerSelector
              label="VĐV 2"
              eventType={tour.eventType}
              onChange={setP2}
            />
          </View>
        )}

        <Text style={styles.label}>Lời nhắn</Text>
        <TextInput
          value={msg}
          onChangeText={setMsg}
          multiline
          numberOfLines={3}
          style={styles.textarea}
          placeholder="Ghi chú cho BTC…"
          placeholderTextColor="#9aa0a6"
        />

        <Text style={{ color: "#6b7280", fontSize: 12 }}>
          {isAdmin
            ? "Quyền admin: tạo đăng ký và duyệt ngay, không cần xác nhận từ VĐV."
            : isSingles
            ? "Giải đơn: nếu bạn chính là VĐV mời chính mình, đăng ký sẽ tự xác nhận."
            : "Giải đôi: cần cả hai VĐV chấp nhận lời mời thì mới tạo đăng ký."}
        </Text>

        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          <PrimaryBtn onPress={submit} disabled={disableSubmit}>
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

      {/* Quản lý (chỉ BTC/admin) */}
      {canManage && (
        <View style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: "800", marginBottom: 6 }}>
            Quản lý giải đấu
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <PrimaryBtn onPress={() => router.push(`/tournament/${id}/draw`)}>
              Bốc thăm
            </PrimaryBtn>
            <OutlineBtn onPress={() => router.push(`/tournament/${id}/manage`)}>
              Quản lý giải
            </OutlineBtn>
          </View>
        </View>
      )}

      {/* Tiêu đề danh sách */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginTop: 4,
        }}
      >
        <Text style={{ fontSize: 18, fontWeight: "800" }}>
          Danh sách đăng ký ({regCount})
        </Text>
        <Chip
          label={`${regCount} ${isSingles ? "VĐV" : "đội"}`}
          bg="#eef2ff"
          fg="#3730a3"
        />
      </View>

      {regsLoading ? (
        <View style={{ paddingVertical: 16, alignItems: "center" }}>
          <ActivityIndicator />
        </View>
      ) : regsErr ? (
        <View
          style={[
            styles.alert,
            { borderColor: "#ef4444", backgroundColor: "#fee2e2" },
          ]}
        >
          <Text style={{ color: "#991b1b" }}>
            {(regsErr as any)?.data?.message ||
              (regsErr as any)?.error ||
              "Lỗi tải danh sách"}
          </Text>
        </View>
      ) : regs.length === 0 ? (
        <Text style={{ color: "#6b7280", marginTop: 8 }}>
          Danh sách đăng ký trống!
        </Text>
      ) : null}
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        data={paginatedRegs}
        keyExtractor={(item, i) => String(item?._id || i)}
        renderItem={({ item: r, index }) => {
          const isOwner =
            isLoggedIn && String(r?.createdBy) === String(me?._id);
          return (
            <View style={[styles.card, { marginHorizontal: 16, marginTop: 8 }]}>
              <Text style={{ color: "#6b7280", fontSize: 12 }}>
                #{baseIndex + index + 1}
              </Text>

              {playersOfReg(r).map((pl: any, idx: number) => (
                <View
                  key={`${pl?.phone || pl?.fullName || idx}`}
                  style={{ marginTop: 10 }}
                >
                  <PlayerCell
                    player={pl}
                    canEdit={canManage}
                    onEdit={() => openReplace(r, idx === 0 ? "p1" : "p2")}
                  />
                </View>
              ))}

              {!isSingles && !r.player2 && canManage && (
                <View style={{ marginTop: 8 }}>
                  <OutlineBtn onPress={() => openReplace(r, "p2")}>
                    Thêm VĐV 2
                  </OutlineBtn>
                </View>
              )}

              <Text style={{ color: "#6b7280", fontSize: 12, marginTop: 8 }}>
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
                <PaymentChip
                  status={r.payment?.status}
                  paidAt={r.payment?.paidAt}
                />
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
                <Text style={{ fontWeight: "600" }}>Tổng điểm:</Text>
                <Chip label={totalScoreOf(r, isSingles)} bg="#fff" fg="#111" />
              </View>

              <View style={{ marginTop: 10 }}>
                <ActionCell
                  r={r}
                  canManage={canManage}
                  isOwner={isOwner}
                  onTogglePayment={togglePayment}
                  onCancel={handleCancel}
                  busy={{ settingPayment, deletingId: cancelingId }}
                />
              </View>
            </View>
          );
        }}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={
          regCount > 0 ? (
            <View
              style={{ marginTop: 12, marginBottom: 20, paddingHorizontal: 16 }}
            >
              <PaginationRN
                count={totalPages}
                page={page}
                onChange={(p: number) => {
                  setPage(p);
                  listRef.current?.scrollToOffset?.({
                    offset: 0,
                    animated: true,
                  });
                }}
                siblingCount={1}
                boundaryCount={1}
                showPrevNext
                size="md"
              />
            </View>
          ) : (
            <View style={{ height: 20 }} />
          )
        }
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
              { backgroundColor: "#111", borderColor: "#333" },
            ]}
          >
            <ExpoImage
              source={{ uri: normalizeUrl(imgPreview.src) || PLACE }}
              style={{ width: "100%", height: 360, borderRadius: 12 }}
              contentFit="cover"
              cachePolicy="memory-disk" // cache mạnh tay: RAM + disk
              transition={0} // tắt fade để khỏi thấy “nháy”
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
              { backgroundColor: "#fff", borderColor: "#e5e7eb" },
            ]}
          >
            <Text style={{ fontWeight: "800", fontSize: 16, marginBottom: 8 }}>
              {replaceDlg.slot === "p2" ? "Thay/Thêm VĐV 2" : "Thay VĐV 1"}
            </Text>

            <PlayerSelector
              label="Chọn VĐV mới"
              eventType={tour?.eventType}
              onChange={setNewPlayer}
            />
            <Text style={{ color: "#6b7280", fontSize: 12, marginTop: 6 }}>
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
    </View>
  );
}

/* ---------------- styles ---------------- */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7f9fc" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  title: { fontSize: 20, fontWeight: "800", color: "#111" },

  sectionCard: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
  },
  tourName: { fontSize: 18, fontWeight: "800", color: "#111" },
  muted: { color: "#6b7280" },

  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 12,
    rowGap: 6,
    marginTop: 6,
  },

  label: { marginTop: 12, marginBottom: 6, color: "#111", fontWeight: "700" },
  textarea: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 72,
    textAlignVertical: "top",
    color: "#111",
  },

  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
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

  alert: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
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
  },

  htmlCard: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 10,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
});
