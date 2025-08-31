// app/screens/RankingListScreen.jsx
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useDispatch, useSelector } from "react-redux";

import { useGetRankingsQuery } from "@/slices/rankingsApiSlice";
import { setKeyword, setPage } from "@/slices/rankingUiSlice";

// GIỮ NGUYÊN
import PublicProfileDialog from "@/components/PublicProfileDialog";
// Pagination kiểu MUI
import PaginationRN from "@/components/PaginationRN";
import { normalizeUrl } from "@/utils/normalizeUri";

const PLACE = "https://dummyimage.com/100x100/cccccc/ffffff&text=?";

const HEX = {
  green: "#2e7d32",
  blue: "#1976d2",
  yellow: "#ff9800",
  red: "#f44336",
  grey: "#616161",
};
const fmt3 = (x) => (Number.isFinite(x) ? Number(x).toFixed(3) : "0.000");
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

const Pill = ({ label, bg = "#eee", fg = "#111" }) => (
  <View style={[styles.pill, { backgroundColor: bg }]}>
    <Text style={[styles.pillText, { color: fg }]} numberOfLines={1}>
      {label}
    </Text>
  </View>
);

const Legend = React.memo(() => (
  <View style={styles.legendStickyWrap}>
    <View style={styles.legendRow}>
      <Pill label="Xanh lá: ≥ 10 giải" bg={HEX.green} fg="#fff" />
      <Pill label="Xanh dương: 5–9 giải" bg={HEX.blue} fg="#fff" />
      <Pill label="Vàng: 1–4 giải" bg={HEX.yellow} fg="#000" />
      <Pill label="Đỏ: tự chấm" bg={HEX.red} fg="#fff" />
    </View>
  </View>
));

export default function RankingListScreen() {
  const dispatch = useDispatch();
  const router = useRouter();
  const flatRef = useRef(null);

  const { keyword = "", page = 0 } = useSelector((s) => s?.rankingUi || {});
  const [kw, setKw] = useState(keyword || "");

  const { data, isLoading, isFetching, error, refetch } = useGetRankingsQuery({
    keyword,
    page, // 0-based
  });
  const list = data?.docs ?? [];
  const totalPages = data?.totalPages ?? 0;

  // debounce keyword -> reset về trang 0
  useEffect(() => {
    const t = setTimeout(() => {
      dispatch(setPage(0));
      dispatch(setKeyword(kw.trim()));
    }, 300);
    return () => clearTimeout(t);
  }, [kw, dispatch]);

  // Zoom avatar
  const [zoomSrc, setZoomSrc] = useState("");
  const [zoomOpen, setZoomOpen] = useState(false);
  const openZoom = (src) => {
    setZoomSrc(src || PLACE);
    setZoomOpen(true);
  };
  const closeZoom = () => setZoomOpen(false);

  // Profile dialog (GIỮ API Y NGUYÊN)
  const [openProfile, setOpenProfile] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const handleOpen = (id) => {
    setSelectedId(id);
    setOpenProfile(true);
  };
  const handleClose = () => setOpenProfile(false);

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

  const renderItem = useCallback(({ item, index }) => {
    const r = item;
    const u = r?.user || {};
    const avatarSrc = u?.avatar || PLACE;
    const age = calcAge(u);
    const tierHex = HEX[r?.tierColor] || HEX.grey;

    return (
      <View style={styles.card} key={r?._id || u?._id || index}>
        <View style={styles.rowCenter}>
          <TouchableOpacity
            onPress={() => openZoom(avatarSrc)}
            activeOpacity={0.8}
          >
            <Image source={{ uri: normalizeUrl(avatarSrc) }} style={styles.avatar} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginHorizontal: 12 }}>
            <Text numberOfLines={1} style={styles.nick}>
              {u?.nickname || "---"}
            </Text>
            <View style={styles.pillRow}>
              {Number.isFinite(age) && <Pill label={`${age} tuổi`} />}
              <Pill label={`Giới tính: ${genderLabel(u?.gender)}`} />
              <Pill label={`Tỉnh: ${u?.province || "--"}`} />
            </View>
          </View>
          <Pill
            label={
              r?.user?.cccdStatus === "verified"
                ? "Xác thực"
                : r?.user?.cccdStatus === "pending"
                ? "Chờ"
                : "Chưa xác thực"
            }
            bg={
              r?.user?.cccdStatus === "verified"
                ? "#e8f5e9"
                : r?.user?.cccdStatus === "pending"
                ? "#fff8e1"
                : "#eeeeee"
            }
            fg={
              r?.user?.cccdStatus === "verified"
                ? "#2e7d32"
                : r?.user?.cccdStatus === "pending"
                ? "#f57c00"
                : "#424242"
            }
          />
        </View>

        <View style={styles.scoreRow}>
          <Text style={[styles.score, { color: tierHex }]}>
            Đôi: {fmt3(r?.double)}
          </Text>
          <Text style={[styles.score, { color: tierHex }]}>
            Đơn: {fmt3(r?.single)}
          </Text>
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.metaText}>
            Cập nhật:{" "}
            {r?.updatedAt ? new Date(r.updatedAt).toLocaleDateString() : "--"}
          </Text>
          <Text style={styles.metaText}>
            Tham gia:{" "}
            {u?.createdAt ? new Date(u.createdAt).toLocaleDateString() : "--"}
          </Text>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.successBtn}
            onPress={() => handleOpen(u?._id)}
          >
            <Text style={styles.successBtnText}>Hồ sơ</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }, []);

  if (isLoading && !data) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      {/* TOP BAR + SEARCH: đưa ra ngoài FlatList để không mất bàn phím */}
      <View style={styles.topWrap}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Bảng xếp hạng</Text>
          <TouchableOpacity
            onPress={() => router.push("/levelpoint")}
            style={styles.primaryBtn}
          >
            <Text style={styles.primaryBtnText}>Tự chấm trình</Text>
          </TouchableOpacity>
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
      ) : (
        <FlatList
          ref={flatRef}
          data={list}
          keyExtractor={(item, i) => String(item?._id || item?.user?._id || i)}
          renderItem={renderItem}
          // Header của LIST chỉ chứa Legend -> sticky riêng phần chip
          ListHeaderComponent={<Legend />}
          ListHeaderComponentStyle={{ backgroundColor: "#fafafa" }}
          stickyHeaderIndices={[0]}
          // BỎ padding top -> dính SafeArea
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
        />
      )}

      {/* Zoom avatar */}
      <Modal
        visible={zoomOpen}
        animationType="fade"
        transparent
        onRequestClose={closeZoom}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalBox}>
            <Image
              source={{ uri: normalizeUrl(zoomSrc) || PLACE }}
              style={styles.zoomImg}
              resizeMode="contain"
            />
            <Pressable onPress={closeZoom} style={styles.modalCloseBtn}>
              <Text style={styles.modalCloseText}>Đóng</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* GIỮ Y NGUYÊN API */}
      <PublicProfileDialog
        open={openProfile}
        onClose={handleClose}
        userId={selectedId}
      />
    </View>
  );
}

const { width } = Dimensions.get("window");
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fafafa", paddingTop: 20, paddingBottom: 50 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  // Khu vực trên cùng (ngoài FlatList) -> dính SafeArea, không marginTop
  topWrap: {
    paddingHorizontal: 16,
    paddingTop: 0,
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

  // Legend sticky: bọc riêng để có nền khi dính trên
  legendStickyWrap: {
    backgroundColor: "#fafafa",
    paddingTop: 8,
    paddingBottom: 8,
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 0,
  },

  pill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: "flex-start",
  },
  pillText: { fontSize: 12, fontWeight: "600" },

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
  avatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: "#eee" },
  nick: { fontSize: 16, fontWeight: "700" },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  scoreRow: { flexDirection: "row", gap: 16, marginTop: 10 },
  score: { fontSize: 14, fontWeight: "700" },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  metaText: { fontSize: 12, color: "#666" },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  successBtn: {
    backgroundColor: "#2e7d32",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  successBtnText: { color: "#fff", fontWeight: "600" },

  // Footer pagination căn giữa chắc chắn
  pagiWrap: {
    paddingTop: 8,
    paddingBottom: 8,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    width: "100%",
  },

  errorBox: {
    margin: 16,
    backgroundColor: "#ffebee",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#ffcdd2",
  },
  errorText: { color: "#b71c1c" },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalBox: {
    backgroundColor: "#111",
    borderRadius: 12,
    width: width - 32,
    padding: 10,
  },
  zoomImg: {
    width: "100%",
    height: width,
    borderRadius: 10,
    backgroundColor: "#000",
  },
  modalCloseBtn: {
    alignSelf: "center",
    marginTop: 10,
    backgroundColor: "#eee",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  modalCloseText: { fontWeight: "700" },
});
