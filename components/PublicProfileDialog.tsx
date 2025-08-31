// components/PublicProfileSheet.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  useWindowDimensions,
  View,
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
} from "@/slices/usersApiSlice";
import PaginationRN from "./PaginationRN";
import { Image as ExpoImage } from "expo-image";

/* ---------- helpers ---------- */
const AVA_PLACE = "https://dummyimage.com/160x160/cccccc/ffffff&text=?";
const TEXT_PLACE = "—";
const safe = (v: any, fb = TEXT_PLACE) => {
  if (v === "unspecified") return "Chưa xác định";
  return v === null || v === undefined || v === "" ? fb : v;
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

/* ---------- UI atoms ---------- */
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

/* ---------- component ---------- */
type Props = { open: boolean; onClose: () => void; userId?: string };

export default function PublicProfileSheet({ open, onClose, userId }: Props) {
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const scheme = useColorScheme() ?? "light";
  const tint = scheme === "dark" ? "#7cc0ff" : "#0a84ff";
  const cardBg = scheme === "dark" ? "#16181c" : "#ffffff";
  const pageBg = scheme === "dark" ? "#0b0d10" : "#f7f9fc";
  const border = scheme === "dark" ? "#2e2f33" : "#e4e8ef";
  const text = scheme === "dark" ? "#f7f7f7" : "#111";
  const subtext = scheme === "dark" ? "#c9c9c9" : "#555";

  // BottomSheet — snapPoints tính theo pixel và KHÔNG vượt Dynamic Island
  const topSafeGap = insets.top + 8; // đệm nhẹ dưới DI/notch
  const maxPx = Math.min(winH * 0.92, winH - topSafeGap);
  const midPx = Math.max(winH * 0.6, Math.round(maxPx * 0.75));
  const snapPoints = useMemo(
    () => [Math.round(midPx), Math.round(maxPx)],
    [midPx, maxPx]
  );

  const sheetRef = useRef<BottomSheetModal>(null);
  useEffect(() => {
    open ? sheetRef.current?.present() : sheetRef.current?.dismiss();
  }, [open]);
  const handleDismiss = () => onClose?.();

  // Queries
  const baseQ = useGetPublicProfileQuery(userId!, { skip: !open || !userId });
  const rateQ = useGetRatingHistoryQuery(userId!, { skip: !open || !userId });
  const matchQ = useGetMatchHistoryQuery(userId!, { skip: !open || !userId });

  const loading = baseQ.isLoading || rateQ.isLoading || matchQ.isLoading;
  const error = baseQ.error || rateQ.error || matchQ.error;
  const base: any = baseQ.data || {};

  // Tabs
  const [tab, setTab] = useState(0);
  useEffect(() => {
    if (open) setTab(0);
  }, [open]);

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
    if (open) setRatingPage(1);
  }, [open, ratingTotal]);
  useEffect(() => {
    if (open) setMatchPage(1);
  }, [open, matchTotal]);

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

  /* ---------- sections ---------- */
  const Header = () => (
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

      {/* Avatar + chips */}
      <View
        style={{
          flexDirection: "row",
          gap: 12,
          alignItems: "center",
          marginTop: 12,
        }}
      >
        <Pressable onPress={() => openZoom(base.avatar)}>
          <ExpoImage
            source={{ uri: normalizeUrl(base.avatar) || AVA_PLACE }}
            style={{
              width: 84,
              height: 84,
              borderRadius: 42,
              borderWidth: 1,
              borderColor: border,
            }}
            contentFit="cover"
            cachePolicy="memory-disk" // cache mạnh tay: RAM + disk
            transition={0} // tắt fade để khỏi thấy “nháy”
          />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{ color: text, fontWeight: "700", fontSize: 18 }}
            numberOfLines={1}
          >
            {safe(base.nickname)}
          </Text>
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
          </View>
        </View>
      </View>
    </View>
  );

  const Tabs = () => (
    <View
      style={[styles.tabs, { borderColor: border, backgroundColor: pageBg }]}
    >
      {["Thông tin", "Điểm trình", "Thi đấu"].map((label, idx) => {
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
            <Text style={{ color: active ? "#fff" : text, fontWeight: "700" }}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  const InfoSection = () => (
    <View
      style={[
        styles.sectionCard,
        { backgroundColor: cardBg, borderColor: border },
      ]}
    >
      <Text style={styles.sectionTitle}>Giới thiệu</Text>
      <Text style={{ color: subtext, lineHeight: 20 }}>
        {safe(base.bio, "Chưa có")}
      </Text>
    </View>
  );

  const RatingSection = () => (
    <View
      style={[
        styles.sectionCard,
        { backgroundColor: cardBg, borderColor: border, paddingTop: 10 },
      ]}
    >
      <Text style={styles.sectionTitle}>Lịch sử điểm trình</Text>

      {ratingPaged.length === 0 ? (
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
          {ratingPaged.map((h: any, idx: number) => (
            <View
              key={h._id || `${h.scoredAt}-${idx}`}
              style={{
                flexDirection: "row",
                paddingVertical: 10,
                borderBottomWidth:
                  idx < ratingPaged.length - 1 ? StyleSheet.hairlineWidth : 0,
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
              <View style={{ flex: 1, paddingLeft: 8 }}>
                <Text style={{ color: subtext }} numberOfLines={2}>
                  {safe(h.note, TEXT_PLACE)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Pagination kiểu MUI */}
      <View style={{ marginTop: 8 }}>
        <PaginationRN
          count={Math.max(1, Math.ceil(ratingTotal / ratingPerPage))}
          page={ratingPage} // 1-based
          onChange={setRatingPage} // 1-based
          siblingCount={1}
          boundaryCount={1}
          showPrevNext
          size="md"
        />
      </View>
    </View>
  );

  const PlayerCell = ({ players = [], highlight = false }: any) => {
    if (!players.length) return <Text style={{ color: subtext }}>—</Text>;
    return (
      <View style={{ gap: 6 }}>
        {players.map((p: any, idx: number) => {
          const up = (p?.delta ?? 0) > 0;
          const down = (p?.delta ?? 0) < 0;
          const hasScore =
            Number.isFinite(p?.preScore) || Number.isFinite(p?.postScore);
          const avatarSrc = normalizeUri(p?.avatar) || AVA_PLACE;
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
                    borderColor: "#ddd",
                  }}
                  contentFit="cover"
                  cachePolicy="memory-disk" // cache mạnh tay: RAM + disk
                  transition={0} // tắt fade để khỏi thấy “nháy”
                />
              </Pressable>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: text }} numberOfLines={1}>
                  {safe(p?.name)}
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
                  <Text style={{ color: "#9aa0a6", fontSize: 12 }}>
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
                paddingRight: 44, // chừa chỗ nút ×
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
                  { borderColor: "#9aa0a6", backgroundColor: "#f4f4f5" },
                ]}
              >
                <Text style={{ color: "#52525b" }}>Không có video</Text>
              </View>
            )}
          </View>
          <Pressable style={{ flex: 1 }} onPress={() => setDetailOpen(false)} />
        </View>
      </Modal>
    );
  };

  const MatchSection = () => (
    <View
      style={[
        styles.sectionCard,
        { backgroundColor: cardBg, borderColor: border },
      ]}
    >
      <Text style={styles.sectionTitle}>Lịch sử thi đấu</Text>
      {matchPaged.length === 0 ? (
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

      {/* Pagination */}
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

  /* ---------- render ---------- */
  return (
    <>
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={snapPoints}
        onDismiss={handleDismiss}
        enablePanDownToClose
        index={0}
        topInset={topSafeGap} // 👈 đảm bảo không vượt Dynamic Island / notch
        backdropComponent={(p) => (
          <BottomSheetBackdrop
            {...p}
            appearsOnIndex={0}
            disappearsOnIndex={-1}
            pressBehavior="close"
          />
        )}
        handleStyle={{ borderTopLeftRadius: 20, borderTopRightRadius: 20 }}
        handleIndicatorStyle={{ backgroundColor: "#b0b0b0", width: 36 }}
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
      >
        {/* ONE scroll view (sticky header để không “đè nhau”) */}
        <BottomSheetScrollView
          style={{ paddingHorizontal: 12 }}
          contentContainerStyle={{
            paddingBottom: Math.max(16, insets.bottom + 12),
          }}
          stickyHeaderIndices={[0]} // Header (title + tabs) dính trên
          showsVerticalScrollIndicator
        >
          {/* Sticky Header = Title + Avatar + Tabs */}
          <View>
            <Header />
            <Tabs />
          </View>

          {/* Content */}
          {loading ? (
            <View style={{ paddingVertical: 24, alignItems: "center" }}>
              <ActivityIndicator size="large" color={tint} />
            </View>
          ) : error ? (
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
                {error?.data?.message ||
                  (error as any)?.error ||
                  "Lỗi tải dữ liệu"}
              </Text>
            </View>
          ) : (
            <View style={{ gap: 12, marginTop: 12 }}>
              {tab === 0 && <InfoSection />}
              {tab === 1 && <RatingSection />}
              {tab === 2 && <MatchSection />}
            </View>
          )}
        </BottomSheetScrollView>
      </BottomSheetModal>

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
              cachePolicy="memory-disk" // cache mạnh tay: RAM + disk
              transition={0} // tắt fade để khỏi thấy “nháy”
            />
            <PrimaryBtn onPress={closeZoom}>Đóng</PrimaryBtn>
          </View>
          <Pressable style={{ flex: 1 }} onPress={closeZoom} />
        </View>
      </Modal>
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
    paddingRight: 44, // chừa chỗ nút đóng
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
    color: "#111",
    fontWeight: "700",
    marginBottom: 8,
    fontSize: 16,
  },

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
});
