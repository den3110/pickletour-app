// app/(tabs)/admin/index.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import { Redirect } from "expo-router";
import { useDispatch, useSelector } from "react-redux";
import { Image as ExpoImage } from "expo-image";
import { MaterialIcons, MaterialCommunityIcons } from "@expo/vector-icons";

import PaginationRN from "@/components/PaginationRN";
import { normalizeUrl } from "@/utils/normalizeUri";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import {
  useGetUsersQuery,
  useUpdateUserRoleMutation,
  useUpdateUserInfoMutation,
  useReviewKycMutation,
  useUpdateRankingMutation,
  useChangeUserPasswordMutation,
  usePromoteToEvaluatorMutation,
  useDemoteEvaluatorMutation,
  useDeleteUserMutation,
} from "@/slices/adminApiSlice";
import { setPage, setKeyword, setRole } from "@/slices/adminUiSlice";
import { useTheme } from "@react-navigation/native";

/* ================== Theme key ================== */

/* ================== Consts ================== */
const GENDER_OPTIONS = [
  { value: "unspecified", label: "--" },
  { value: "male", label: "Nam" },
  { value: "female", label: "Nữ" },
  { value: "other", label: "Khác" },
];

const PROVINCES = [
  "An Giang",
  "Bà Rịa-Vũng Tàu",
  "Bạc Liêu",
  "Bắc Giang",
  "Bắc Kạn",
  "Bắc Ninh",
  "Bến Tre",
  "Bình Dương",
  "Bình Định",
  "Bình Phước",
  "Bình Thuận",
  "Cà Mau",
  "Cao Bằng",
  "Cần Thơ",
  "Đà Nẵng",
  "Đắk Lắk",
  "Đắk Nông",
  "Điện Biên",
  "Đồng Nai",
  "Đồng Tháp",
  "Gia Lai",
  "Hà Giang",
  "Hà Nam",
  "Hà Nội",
  "Hà Tĩnh",
  "Hải Dương",
  "Hải Phòng",
  "Hậu Giang",
  "Hòa Bình",
  "Hưng Yên",
  "Khánh Hòa",
  "Kiên Giang",
  "Kon Tum",
  "Lai Châu",
  "Lâm Đồng",
  "Lạng Sơn",
  "Lào Cai",
  "Long An",
  "Nam Định",
  "Nghệ An",
  "Ninh Bình",
  "Ninh Thuận",
  "Phú Thọ",
  "Phú Yên",
  "Quảng Bình",
  "Quảng Nam",
  "Quảng Ngãi",
  "Quảng Ninh",
  "Quảng Trị",
  "Sóc Trăng",
  "Sơn La",
  "Tây Ninh",
  "Thái Bình",
  "Thái Nguyên",
  "Thanh Hóa",
  "Thừa Thiên Huế",
  "Tiền Giang",
  "TP Hồ Chí Minh",
  "Trà Vinh",
  "Tuyên Quang",
  "Vĩnh Long",
  "Vĩnh Phúc",
  "Yên Bái",
];
const PROVINCES_SET = new Set(PROVINCES);

const KYC_LABEL = {
  unverified: "Chưa KYC",
  pending: "Chờ KYC",
  verified: "Đã KYC",
  rejected: "Từ chối",
};
const KYC_BG = {
  unverified: "#9aa0a6",
  pending: "#f6a609",
  verified: "#16a34a",
  rejected: "#e11d48",
};

const prettyDate = (d) => (d ? new Date(d).toLocaleDateString("vi-VN") : "—");
const roleText = (r) =>
  r === "admin" ? "Admin" : r === "referee" ? "Trọng tài" : "User";
const getEvalProvinces = (u) =>
  Array.isArray(u?.evaluator?.gradingScopes?.provinces)
    ? u.evaluator.gradingScopes.provinces.filter(Boolean)
    : [];
const getIsFullEvaluator = (u) => {
  const list = getEvalProvinces(u);
  if (!list.length) return false;
  const normalized = Array.from(
    new Set(list.filter((p) => PROVINCES_SET.has(p)))
  );
  return normalized.length === PROVINCES.length;
};

/* ===== Small UI helpers ===== */
const Row = ({ children, style }) => (
  <View style={[{ flexDirection: "row", alignItems: "center" }, style]}>
    {children}
  </View>
);
// Tính màu chữ readable dựa trên màu nền (WCAG-ish)
function pickTextColorForBg(bgHex, tokens) {
  if (!bgHex) return tokens.scheme === "dark" ? "#fff" : tokens.textPrimary;
  try {
    const hex = bgHex.replace("#", "");
    const full =
      hex.length === 3
        ? hex
            .split("")
            .map((c) => c + c)
            .join("")
        : hex;
    const num = parseInt(full, 16);
    const r = (num >> 16) & 255,
      g = (num >> 8) & 255,
      b = num & 255;
    const brightness = (r * 299 + g * 587 + b * 114) / 1000; // 0..255
    return brightness > 155 ? "#111" : "#fff"; // ngưỡng dễ đọc
  } catch {
    return tokens.scheme === "dark" ? "#fff" : tokens.textPrimary;
  }
}

const Chip = ({ label, bg, style, styles }) => {
  const textColor = pickTextColorForBg(bg, styles.tokens);
  return (
    <View
      style={[
        styles.chip,
        { backgroundColor: bg ?? styles.tokens.muted },
        style,
      ]}
    >
      <Text style={[styles.chipText, { color: textColor }]}>{label}</Text>
    </View>
  );
};

const IconBtn = ({
  name = "edit",
  mc = false,
  color,
  onPress,
  size = 20,
  style,
}) => (
  <Pressable onPress={onPress} style={[{ padding: 6, borderRadius: 8 }, style]}>
    {mc ? (
      <MaterialCommunityIcons name={name} size={size} color={color} />
    ) : (
      <MaterialIcons name={name} size={size} color={color} />
    )}
  </Pressable>
);

/* ================== Main ================== */
export default function AdminUsersScreen() {
  /* Theme từ react-navigation: tự re-render khi ThemeProvider đổi */
  const navTheme = useTheme();
  const themeKey = navTheme?.dark ? "dark" : "light";
  const tokens = useMemo(
    () => ({
      scheme: themeKey,
      pageBg:
        navTheme.colors?.background ?? (navTheme.dark ? "#0f1115" : "#f6f8fc"),
      cardBg: navTheme.colors?.card ?? (navTheme.dark ? "#16181c" : "#ffffff"),
      textPrimary:
        navTheme.colors?.text ?? (navTheme.dark ? "#ffffff" : "#111111"),
      textSecondary: navTheme.dark ? "#c9c9c9" : "#444444",
      border:
        navTheme.colors?.border ?? (navTheme.dark ? "#2e2f33" : "#dfe3ea"),
      muted: navTheme.dark ? "#22252a" : "#f3f5f9",
      iconMuted: navTheme.dark ? "#a1a1aa" : "#60646c",
      tint: navTheme.colors?.primary ?? (navTheme.dark ? "#7cc0ff" : "#0a84ff"),
    }),
    [navTheme, themeKey]
  );
  const styles = useMemo(() => makeStyles(tokens), [tokens]);

  // ✅ Common modal props to avoid "white flash" on close/animate
  const commonModalProps = useMemo(
    () => ({
      transparent: true,
      statusBarTranslucent: true,
      presentationStyle: "overFullScreen",
      hardwareAccelerated: true,
    }),
    []
  );

  /* Guard admin */
  const userInfo = useSelector((s) => s.auth?.userInfo);
  const isAdmin = !!(userInfo?.isAdmin || userInfo?.role === "admin");

  /* UI state / filters */
  const dispatch = useDispatch();
  const {
    page = 0,
    keyword = "",
    role = "",
  } = useSelector((s) => s.adminUi || {});
  const [localSearch, setLocalSearch] = useState(keyword);
  const [kycFilter, setKycFilter] = useState("");

  useEffect(() => {
    const t = setTimeout(() => dispatch(setKeyword(localSearch.trim())), 400);
    return () => clearTimeout(t);
  }, [localSearch, dispatch]);

  /* Data */
  const { data, isFetching, refetch } = useGetUsersQuery(
    { page: page + 1, keyword, role, cccdStatus: kycFilter },
    { refetchOnMountOrArgChange: true }
  );

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    try {
      setRefreshing(true);
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const [updateRoleMut] = useUpdateUserRoleMutation();
  const [updateInfoMut] = useUpdateUserInfoMutation();
  const [reviewKycMut] = useReviewKycMutation();
  const [updateRanking] = useUpdateRankingMutation();
  const [changePasswordMut, { isLoading: changingPass }] =
    useChangeUserPasswordMutation();
  const [promoteEvaluatorMut] = usePromoteToEvaluatorMutation();
  const [demoteEvaluatorMut] = useDemoteEvaluatorMutation();
  const [deleteUserMut] = useDeleteUserMutation();

  /* Derived */
  const users = data?.users ?? [];
  const serverTotalPages = data
    ? Math.ceil((data.total || 0) / (data.pageSize || 1))
    : 0;

  const [fullMap, setFullMap] = useState({});
  useEffect(() => {
    if (users.length) {
      const next = {};
      users.forEach((u) => (next[u._id] = getIsFullEvaluator(u)));
      setFullMap(next);
    }
  }, [users]);

  /* Common handler */
  const handle = async (promise, successMsg) => {
    try {
      const res = await promise;
      if (successMsg) Alert.alert("Thành công", successMsg);
      await refetch();
      return res;
    } catch (err) {
      Alert.alert("Lỗi", err?.data?.message || err?.error || "Đã xảy ra lỗi");
      throw err;
    }
  };

  const toggleAdminEvaluator = async (userId, enable) => {
    setFullMap((m) => ({ ...m, [userId]: enable }));
    try {
      if (enable) {
        await promoteEvaluatorMut({
          idOrEmail: userId,
          provinces: PROVINCES,
          sports: [],
        }).unwrap();
        Alert.alert("Thành công", "Đã bật Admin chấm trình (FULL tỉnh)");
      } else {
        await demoteEvaluatorMut({
          id: userId,
          body: { toRole: "user" },
        }).unwrap();
        Alert.alert("Thành công", "Đã tắt Admin chấm trình");
      }
      refetch();
    } catch (err) {
      setFullMap((m) => ({ ...m, [userId]: !enable }));
      Alert.alert("Lỗi", err?.data?.message || err?.error || "Đã xảy ra lỗi");
    }
  };

  /* Modals state */
  const [edit, setEdit] = useState(null);
  const [kyc, setKyc] = useState(null);
  const [del, setDel] = useState(null);
  const [score, setScore] = useState(null);

  /* Header */
  const Header = (
    <View style={styles.headerWrap}>
      <View
        style={[styles.input, { flexDirection: "row", alignItems: "center" }]}
      >
        <MaterialIcons
          name="search"
          size={18}
          color={tokens.iconMuted}
          style={{ marginRight: 6 }}
        />
        <TextInput
          placeholder="Tìm tên / email"
          placeholderTextColor={tokens.iconMuted}
          value={localSearch}
          onChangeText={setLocalSearch}
          style={{
            flex: 1,
            color: tokens.textPrimary,
            paddingVertical: Platform.OS === "ios" ? 8 : 4,
          }}
          returnKeyType="search"
          onSubmitEditing={() => Keyboard.dismiss()}
        />
        {!!localSearch && (
          <Pressable onPress={() => setLocalSearch("")} hitSlop={12}>
            <MaterialIcons name="close" size={18} color={tokens.iconMuted} />
          </Pressable>
        )}
      </View>

      <Row style={{ marginTop: 8 }}>
        <Text style={styles.label}>Role:</Text>
        <Pressable style={styles.select} onPress={() => setRoleSheetOpen(true)}>
          <Text style={styles.selectText}>
            {role ? roleText(role) : "Tất cả"}
          </Text>
          <MaterialIcons
            name="arrow-drop-down"
            size={20}
            color={tokens.iconMuted}
          />
        </Pressable>

        <View style={{ width: 12 }} />

        <Text style={styles.label}>KYC:</Text>
        <Pressable style={styles.select} onPress={() => setKycSheetOpen(true)}>
          <Text style={styles.selectText}>
            {kycFilter ? KYC_LABEL[kycFilter] || "Tất cả" : "Tất cả"}
          </Text>
          <MaterialIcons
            name="arrow-drop-down"
            size={20}
            color={tokens.iconMuted}
          />
        </Pressable>
      </Row>
    </View>
  );

  /* Simple bottom sheets (role / kyc) */
  const [roleSheetOpen, setRoleSheetOpen] = useState(false);
  const [kycSheetOpen, setKycSheetOpen] = useState(false);

  const OptionSheet = ({ open, onClose, title, options, value, onSelect }) => (
    <Modal
      visible={open}
      animationType="slide"
      onRequestClose={onClose}
      {...commonModalProps}
    >
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <Text style={styles.sheetTitle}>{title}</Text>
        {options.map((opt) => {
          const v = String(opt.value);
          const selected = String(value) === v;
          return (
            <Pressable
              key={v}
              style={[
                styles.sheetItem,
                selected && { backgroundColor: tokens.muted },
              ]}
              onPress={() => {
                onSelect(opt.value);
                onClose();
              }}
            >
              <Text style={styles.sheetItemText}>{opt.label}</Text>
              {selected && (
                <MaterialIcons name="check" size={18} color={tokens.tint} />
              )}
            </Pressable>
          );
        })}
      </View>
    </Modal>
  );

  /* Row item */
  const UserRow = ({ u }) => {
    const isFull = !!fullMap[u._id];

    return (
      <View style={styles.card}>
        <Row style={{ justifyContent: "space-between" }}>
          <Text numberOfLines={1} style={styles.name} selectable>
            {u.name}
          </Text>
          <Row>
            <Chip
              styles={styles}
              label={KYC_LABEL[u.cccdStatus || "unverified"]}
              bg={KYC_BG[u.cccdStatus || "unverified"]}
            />
            {!!u?.cccdImages?.front && (
              <IconBtn
                mc
                name="magnify"
                onPress={() => setKyc(u)}
                style={{ marginLeft: 6 }}
                color={tokens.iconMuted}
              />
            )}
          </Row>
        </Row>

        <Text numberOfLines={1} style={styles.email}>
          {u.email}
        </Text>

        <Row style={{ flexWrap: "wrap", marginTop: 4 }}>
          <Chip styles={styles} label={`Phone: ${u.phone || "-"}`} />
          <Chip
            styles={styles}
            label={`Đơn: ${u.single ?? "-"}`}
            style={{ marginLeft: 6 }}
          />
          <Chip
            styles={styles}
            label={`Đôi: ${u.double ?? "-"}`}
            style={{ marginLeft: 6 }}
          />
          {!!u.cccd && (
            <Chip
              styles={styles}
              label={`CCCD: ${u.cccd}`}
              style={{ marginLeft: 6 }}
            />
          )}
        </Row>

        <Row style={{ marginTop: 8, justifyContent: "space-between" }}>
          <Pressable style={styles.roleSelect} onPress={() => setRoleFor(u)}>
            <Text style={styles.roleText}>Role: {roleText(u.role)}</Text>
            <MaterialIcons name="edit" size={16} color={tokens.iconMuted} />
          </Pressable>

          <Pressable
            style={styles.toggle}
            onPress={() => toggleAdminEvaluator(u._id, !isFull)}
          >
            <MaterialIcons
              name={isFull ? "check-box" : "check-box-outline-blank"}
              size={18}
              color={isFull ? "#2e7d32" : tokens.iconMuted}
            />
            <Text style={[styles.toggleText, isFull && { color: "#2e7d32" }]}>
              Full tỉnh
            </Text>
          </Pressable>
        </Row>

        <Row style={{ justifyContent: "flex-end", marginTop: 8 }}>
          <IconBtn
            mc
            name="shield-check-outline"
            color="#0288d1"
            onPress={() => setScore({ ...u })}
            style={{ marginRight: 8 }}
          />
          <IconBtn
            name="edit"
            onPress={() => setEdit({ ...u })}
            color={tokens.iconMuted}
            style={{ marginRight: 8 }}
          />
          <IconBtn name="delete" color="#d32f2f" onPress={() => setDel(u)} />
        </Row>
      </View>
    );
  };

  /* helper to set role */
  const [rolePickUser, setRolePickUser] = useState(null);
  const setRoleFor = (u) => setRolePickUser(u);
  const RolePickSheet = (
    <OptionSheet
      open={!!rolePickUser}
      onClose={() => setRolePickUser(null)}
      title={`Đổi role cho ${rolePickUser?.name || ""}`}
      value={rolePickUser?.role}
      onSelect={(newRole) =>
        handle(
          updateRoleMut({ id: rolePickUser._id, role: newRole }).unwrap(),
          "Đã cập nhật role"
        ).then(() => setRolePickUser(null))
      }
      options={[
        { value: "user", label: "User" },
        { value: "referee", label: "Trọng tài" },
        { value: "admin", label: "Admin" },
      ]}
    />
  );

  if (!isAdmin) return <Redirect href="/(tabs)" />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.pageBg }}>
      <View style={{ flex: 1, backgroundColor: tokens.pageBg }}>
        {/* Filters header */}
        {Header}

        {/* Filter sheets */}
        <OptionSheet
          open={roleSheetOpen}
          onClose={() => setRoleSheetOpen(false)}
          title="Lọc theo Role"
          value={role}
          onSelect={(val) => {
            dispatch(setRole(val));
            dispatch(setPage(0));
          }}
          options={[
            { value: "", label: "Tất cả" },
            { value: "user", label: "User" },
            { value: "referee", label: "Trọng tài" },
            { value: "admin", label: "Admin" },
          ]}
        />
        <OptionSheet
          open={kycSheetOpen}
          onClose={() => setKycSheetOpen(false)}
          title="Trạng thái KYC"
          value={kycFilter}
          onSelect={(val) => {
            setKycFilter(String(val));
            dispatch(setPage(0));
          }}
          options={[
            { value: "", label: "Tất cả" },
            { value: "unverified", label: KYC_LABEL.unverified },
            { value: "pending", label: KYC_LABEL.pending },
            { value: "verified", label: KYC_LABEL.verified },
            { value: "rejected", label: KYC_LABEL.rejected },
          ]}
        />

        {/* Role inline sheet */}
        {RolePickSheet}

        {/* List */}
        <FlatList
          data={users}
          keyExtractor={(item) => String(item._id)}
          renderItem={({ item }) => <UserRow u={item} />}
          extraData={themeKey}
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingBottom: 12,
            flexGrow: 1,
            backgroundColor: tokens.pageBg,
          }}
          onScrollBeginDrag={Keyboard.dismiss}
          refreshing={refreshing}
          onRefresh={onRefresh}
          progressViewOffset={8}
          ListEmptyComponent={
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 40,
              }}
            >
              {isFetching ? (
                <ActivityIndicator />
              ) : (
                <Text style={{ color: tokens.textSecondary }}>
                  Không có người dùng
                </Text>
              )}
            </View>
          }
        />

        {/* Pagination */}
        <View style={{ paddingVertical: 8 }}>
          <PaginationRN
            page={page + 1}
            count={serverTotalPages}
            onChange={(v) => dispatch(setPage(v - 1))}
          />
        </View>

        {/* ====== Dialogs / Modals ====== */}

        {/* KYC review */}
        <Modal
          visible={!!kyc}
          animationType="slide"
          onRequestClose={() => setKyc(null)}
          {...commonModalProps}
        >
          {kyc && (
            <SafeAreaView style={{ flex: 1, backgroundColor: tokens.pageBg }}>
              <View style={styles.modalWrap}>
                <Row style={{ justifyContent: "space-between" }}>
                  <Text style={styles.modalTitle}>Kiểm tra CCCD</Text>
                  <IconBtn
                    name="close"
                    color={tokens.iconMuted}
                    onPress={() => setKyc(null)}
                  />
                </Row>

                <View style={{ marginTop: 8 }}>
                  <Row style={{ justifyContent: "space-between" }}>
                    {["front", "back"].map((side) => (
                      <Pressable
                        key={side}
                        style={{
                          width: "49%",
                          height: 220,
                          borderRadius: 8,
                          overflow: "hidden",
                          backgroundColor: tokens.muted,
                        }}
                      >
                        <ExpoImage
                          source={{ uri: normalizeUrl(kyc.cccdImages?.[side]) }}
                          style={{ width: "100%", height: "100%" }}
                          contentFit="contain"
                        />
                      </Pressable>
                    ))}
                  </Row>

                  <View style={styles.infoBox}>
                    <Row style={{ marginBottom: 6 }}>
                      <Chip
                        styles={styles}
                        label={KYC_LABEL[kyc.cccdStatus || "unverified"]}
                        bg={KYC_BG[kyc.cccdStatus || "unverified"]}
                      />
                    </Row>
                    <InfoRow
                      styles={styles}
                      label="Họ & tên"
                      value={kyc.name || "—"}
                    />
                    <InfoRow
                      styles={styles}
                      label="Ngày sinh"
                      value={prettyDate(kyc.dob)}
                    />
                    <InfoRow
                      styles={styles}
                      label="Số CCCD"
                      value={kyc.cccd || "—"}
                      mono
                    />
                    <InfoRow
                      styles={styles}
                      label="Tỉnh / Thành"
                      value={kyc.province || "—"}
                    />
                    {!!kyc.note && (
                      <View style={styles.noteBox}>
                        <Text style={styles.noteLabel}>Ghi chú</Text>
                        <Text style={styles.noteText}>{kyc.note}</Text>
                      </View>
                    )}
                  </View>

                  <Row style={{ justifyContent: "flex-end", marginTop: 10 }}>
                    <Pressable
                      style={[styles.btn, styles.btnDanger]}
                      onPress={() =>
                        handle(
                          reviewKycMut({
                            id: kyc._id,
                            action: "reject",
                          }).unwrap(),
                          "Đã từ chối KYC"
                        ).then(() => setKyc(null))
                      }
                    >
                      <MaterialIcons name="cancel" size={16} color="#fff" />
                      <Text style={styles.btnText}>Từ chối</Text>
                    </Pressable>
                    <View style={{ width: 8 }} />
                    <Pressable
                      style={[styles.btn, styles.btnSuccess]}
                      onPress={() =>
                        handle(
                          reviewKycMut({
                            id: kyc._id,
                            action: "approve",
                          }).unwrap(),
                          "Đã duyệt KYC"
                        ).then(() => setKyc(null))
                      }
                    >
                      <MaterialIcons name="verified" size={16} color="#fff" />
                      <Text style={styles.btnText}>Duyệt</Text>
                    </Pressable>
                  </Row>
                </View>
              </View>
            </SafeAreaView>
          )}
        </Modal>

        {/* Edit user + change password */}
        <Modal
          visible={!!edit}
          animationType="slide"
          onRequestClose={() => setEdit(null)}
          {...commonModalProps}
        >
          {!!edit && (
            <EditUserForm
              styles={styles}
              tokens={tokens}
              edit={edit}
              setEdit={setEdit}
              handle={handle}
              changingPass={changingPass}
              updateInfoMut={updateInfoMut}
              changePasswordMut={changePasswordMut}
            />
          )}
        </Modal>

        {/* Delete */}
        <Modal
          visible={!!del}
          animationType="slide"
          onRequestClose={() => setDel(null)}
          {...commonModalProps}
        >
          <Pressable style={styles.backdrop} onPress={() => setDel(null)} />
          <View style={styles.confirmBox}>
            <Text style={styles.confirmTitle}>Xoá người dùng?</Text>
            <Text
              style={{
                textAlign: "center",
                marginTop: 6,
                color: tokens.textPrimary,
              }}
            >
              Bạn chắc chắn xoá{" "}
              <Text style={{ fontWeight: "700" }}>{del?.name}</Text> (
              {del?.email})?
            </Text>
            <Row style={{ justifyContent: "flex-end", marginTop: 12 }}>
              <Pressable
                style={[styles.btn, styles.btnGhost]}
                onPress={() => setDel(null)}
              >
                <Text style={[styles.btnText, { color: tokens.textPrimary }]}>
                  Huỷ
                </Text>
              </Pressable>
              <View style={{ width: 8 }} />
              <Pressable
                style={[styles.btn, styles.btnDanger]}
                onPress={() =>
                  handle(
                    deleteUserMut(del._id).unwrap(),
                    "Đã xoá người dùng"
                  ).then(() => setDel(null))
                }
              >
                <MaterialIcons name="delete" size={16} color="#fff" />
                <Text style={styles.btnText}>Xoá</Text>
              </Pressable>
            </Row>
          </View>
        </Modal>

        {/* Update score */}
        <Modal
          visible={!!score}
          animationType="slide"
          onRequestClose={() => setScore(null)}
          {...commonModalProps}
        >
          {!!score && (
            <UpdateScoreForm
              styles={styles}
              tokens={tokens}
              score={score}
              setScore={setScore}
              handle={handle}
              updateRanking={updateRanking}
            />
          )}
        </Modal>
      </View>
    </SafeAreaView>
  );
}

/* ===== Sub-components ===== */
const InfoRow = ({ label, value, mono, styles }) => (
  <Row style={{ marginTop: 4 }}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text
      style={[
        styles.infoValue,
        mono && { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
      ]}
    >
      {value}
    </Text>
  </Row>
);

function EditUserForm({
  styles,
  tokens,
  edit,
  setEdit,
  handle,
  changingPass,
  updateInfoMut,
  changePasswordMut,
}) {
  const [model, setModel] = useState(() => ({
    name: edit.name || "",
    nickname: edit.nickname || "",
    phone: edit.phone || "",
    email: edit.email || "",
    cccd: edit.cccd || "",
    dob: edit.dob ? String(edit.dob).slice(0, 10) : "",
    gender: ["male", "female", "unspecified", "other"].includes(edit.gender)
      ? edit.gender
      : "unspecified",
    province: edit.province || "",
  }));

  const [changePass, setChangePass] = useState(false);
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const passTooShort = newPass && newPass.length < 6;
  const passNotMatch = confirmPass && confirmPass !== newPass;
  const canChangePass =
    changePass &&
    newPass.length >= 6 &&
    confirmPass === newPass &&
    !changingPass;

  const saveInfo = () =>
    handle(
      updateInfoMut({
        id: edit._id,
        body: {
          ...model,
          cccd: model.cccd.replace(/\D/g, "").slice(0, 12),
          gender: ["male", "female", "unspecified", "other"].includes(
            model.gender
          )
            ? model.gender
            : "unspecified",
        },
      }).unwrap(),
      "Đã cập nhật người dùng"
    ).then(() => setEdit(null));

  const doChangePass = () =>
    handle(
      changePasswordMut({
        id: edit._id,
        body: { newPassword: newPass },
      }).unwrap(),
      "Đã đổi mật khẩu"
    ).then(() => {
      setChangePass(false);
      setNewPass("");
      setConfirmPass("");
      setShowNew(false);
      setShowConfirm(false);
    });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: styles.tokens.pageBg }}>
      <ScrollView style={styles.modalWrap}>
        <Row style={{ justifyContent: "space-between" }}>
          <Text style={styles.modalTitle}>Sửa thông tin</Text>
          <IconBtn
            name="close"
            color={tokens.iconMuted}
            onPress={() => setEdit(null)}
          />
        </Row>

        <View style={{ marginTop: 8 }}>
          <TextFieldRN
            styles={styles}
            label="Tên"
            value={model.name}
            onChangeText={(v) => setModel((m) => ({ ...m, name: v }))}
          />
          <TextFieldRN
            styles={styles}
            label="Nickname"
            value={model.nickname}
            onChangeText={(v) => setModel((m) => ({ ...m, nickname: v }))}
          />
          <TextFieldRN
            styles={styles}
            label="Phone"
            value={model.phone}
            onChangeText={(v) => setModel((m) => ({ ...m, phone: v }))}
            keyboardType="phone-pad"
          />
          <TextFieldRN
            styles={styles}
            label="Email"
            value={model.email}
            onChangeText={(v) => setModel((m) => ({ ...m, email: v }))}
            keyboardType="email-address"
          />
          <TextFieldRN
            styles={styles}
            label="CCCD (12 số)"
            value={model.cccd}
            onChangeText={(v) =>
              setModel((m) => ({
                ...m,
                cccd: v.replace(/\D/g, "").slice(0, 12),
              }))
            }
            keyboardType="number-pad"
          />
          <DOBPickerRN
            styles={styles}
            tokens={tokens}
            label="Ngày sinh"
            valueISO={model.dob}
            onChangeISO={(iso) => setModel((m) => ({ ...m, dob: iso }))}
          />
          <SelectRN
            styles={styles}
            tokens={tokens}
            label="Giới tính"
            value={model.gender}
            onSelect={(v) => setModel((m) => ({ ...m, gender: v }))}
            options={GENDER_OPTIONS}
          />
          <SelectRN
            styles={styles}
            tokens={tokens}
            label="Tỉnh / Thành"
            value={model.province}
            onSelect={(v) => setModel((m) => ({ ...m, province: v }))}
            options={[
              { value: "", label: "-- Chọn --" },
              ...PROVINCES.map((p) => ({ value: p, label: p })),
            ]}
          />

          {/* Change password */}
          <Row style={{ marginTop: 12, justifyContent: "space-between" }}>
            <Row>
              <Pressable
                onPress={() => setChangePass((s) => !s)}
                style={{ paddingRight: 4 }}
              >
                <MaterialIcons
                  name={changePass ? "check-box" : "check-box-outline-blank"}
                  size={18}
                  color={tokens.iconMuted}
                />
              </Pressable>
              <Text style={{ marginLeft: 6, color: styles.tokens.textPrimary }}>
                Đổi mật khẩu
              </Text>
            </Row>
          </Row>

          {changePass && (
            <View style={{ marginTop: 8 }}>
              <TextFieldRN
                styles={styles}
                label="Mật khẩu mới"
                value={newPass}
                onChangeText={setNewPass}
                secureTextEntry={!showNew}
                rightIcon={showNew ? "visibility-off" : "visibility"}
                onRightIconPress={() => setShowNew((s) => !s)}
                errorText={passTooShort ? "Tối thiểu 6 ký tự" : ""}
              />
              <TextFieldRN
                styles={styles}
                label="Xác nhận mật khẩu mới"
                value={confirmPass}
                onChangeText={setConfirmPass}
                secureTextEntry={!showConfirm}
                rightIcon={showConfirm ? "visibility-off" : "visibility"}
                onRightIconPress={() => setShowConfirm((s) => !s)}
                errorText={passNotMatch ? "Không khớp" : ""}
              />
              <Row style={{ justifyContent: "flex-end", marginTop: 8 }}>
                <Pressable
                  style={[styles.btn, styles.btnGhost]}
                  onPress={() => {
                    setChangePass(false);
                    setNewPass("");
                    setConfirmPass("");
                    setShowNew(false);
                    setShowConfirm(false);
                  }}
                >
                  <Text
                    style={[
                      styles.btnText,
                      { color: styles.tokens.textPrimary },
                    ]}
                  >
                    Huỷ
                  </Text>
                </Pressable>
                <View style={{ width: 8 }} />
                <Pressable
                  style={[
                    styles.btn,
                    styles.btnSecondary,
                    !canChangePass && { opacity: 0.5 },
                  ]}
                  onPress={doChangePass}
                  disabled={!canChangePass}
                >
                  <MaterialIcons name="password" size={16} color="#fff" />
                  <Text style={styles.btnText}>Cập nhật mật khẩu</Text>
                </Pressable>
              </Row>
            </View>
          )}

          <Row style={{ justifyContent: "flex-end", marginTop: 14 }}>
            <Pressable
              style={[styles.btn, styles.btnGhost]}
              onPress={() => setEdit(null)}
            >
              <Text
                style={[styles.btnText, { color: styles.tokens.textPrimary }]}
              >
                Đóng
              </Text>
            </Pressable>
            <View style={{ width: 8 }} />
            <Pressable
              style={[styles.btn, styles.btnPrimary]}
              onPress={saveInfo}
            >
              <MaterialIcons name="save" size={16} color="#fff" />
              <Text style={styles.btnText}>Lưu thông tin</Text>
            </Pressable>
          </Row>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function UpdateScoreForm({
  styles,
  tokens,
  score,
  setScore,
  handle,
  updateRanking,
}) {
  const [single, setSingle] = useState(String(score.single ?? ""));
  const [double, setDouble] = useState(String(score.double ?? ""));

  const save = () =>
    handle(
      updateRanking({
        id: score._id,
        single: Number(single),
        double: Number(double),
      }).unwrap(),
      "Đã cập nhật điểm"
    ).then(() => setScore(null));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: styles.tokens.pageBg }}>
      <View style={styles.modalWrap}>
        <Row style={{ justifyContent: "space-between" }}>
          <Text style={styles.modalTitle}>Cập nhật điểm</Text>
          <IconBtn
            name="close"
            color={tokens.iconMuted}
            onPress={() => setScore(null)}
          />
        </Row>

        <View style={{ marginTop: 8 }}>
          <TextFieldRN
            styles={styles}
            label="Điểm đơn"
            value={single}
            onChangeText={setSingle}
            keyboardType="numeric"
          />
          <TextFieldRN
            styles={styles}
            label="Điểm đôi"
            value={double}
            onChangeText={setDouble}
            keyboardType="numeric"
          />
        </View>

        <Row style={{ justifyContent: "flex-end", marginTop: 14 }}>
          <Pressable
            style={[styles.btn, styles.btnGhost]}
            onPress={() => setScore(null)}
          >
            <Text
              style={[styles.btnText, { color: styles.tokens.textPrimary }]}
            >
              Huỷ
            </Text>
          </Pressable>
          <View style={{ width: 8 }} />
          <Pressable style={[styles.btn, styles.btnPrimary]} onPress={save}>
            <MaterialIcons name="save" size={16} color="#fff" />
            <Text style={styles.btnText}>Lưu</Text>
          </Pressable>
        </Row>
      </View>
    </SafeAreaView>
  );
}

function pad2(n) {
  return n < 10 ? `0${n}` : String(n);
}
function toISODateString(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function parseISOToLocal(iso) {
  if (!iso) return null;
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
function fmtDDMMYYYY(d) {
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`;
}

function DOBPickerRN({
  styles,
  tokens,
  label = "Ngày sinh",
  valueISO,
  onChangeISO,
  minDate = new Date(1900, 0, 1),
  maxDate = new Date(),
}) {
  const current = parseISOToLocal(valueISO) || new Date(2000, 0, 1);
  const [open, setOpen] = React.useState(false);
  const [temp, setTemp] = React.useState(current);

  React.useEffect(() => {
    setTemp(parseISOToLocal(valueISO) || new Date(2000, 0, 1));
  }, [valueISO]);

  const openPicker = () => {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: current,
        mode: "date",
        is24Hour: true,
        minimumDate: minDate,
        maximumDate: maxDate,
        onChange: (e, selected) => {
          if (e.type === "set" && selected)
            onChangeISO(toISODateString(selected));
        },
      });
    } else {
      setOpen(true);
    }
  };

  return (
    <View style={{ marginTop: 8 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable style={styles.fieldInput} onPress={openPicker}>
        <Text
          style={{
            flex: 1,
            paddingVertical: Platform.OS === "ios" ? 8 : 6,
            color: styles.tokens.textPrimary,
          }}
        >
          {valueISO ? fmtDDMMYYYY(current) : "-- Chọn ngày --"}
        </Text>
        <MaterialIcons
          name="calendar-today"
          size={18}
          color={tokens.iconMuted}
        />
      </Pressable>

      {/* iOS modal */}
      <Modal
        visible={open}
        animationType="slide"
        onRequestClose={() => setOpen(false)}
        presentationStyle="overFullScreen"
        statusBarTranslucent
        transparent
      >
        <Pressable
          style={styles.sheetBackdrop}
          onPress={() => setOpen(false)}
        />
        <View style={[styles.sheet, { paddingBottom: 8 }]}>
          <Text style={styles.sheetTitle}>{label}</Text>
          <DateTimePicker
            value={temp}
            mode="date"
            display="spinner"
            maximumDate={maxDate}
            minimumDate={minDate}
            onChange={(_, d) => d && setTemp(d)}
            style={{ alignSelf: "stretch" }}
          />
          <View
            style={{
              flexDirection: "row",
              justifyContent: "flex-end",
              paddingHorizontal: 8,
              gap: 8,
            }}
          >
            <Pressable
              style={[styles.btn, styles.btnGhost]}
              onPress={() => setOpen(false)}
            >
              <Text
                style={[styles.btnText, { color: styles.tokens.textPrimary }]}
              >
                Huỷ
              </Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.btnPrimary]}
              onPress={() => {
                onChangeISO(toISODateString(temp));
                setOpen(false);
              }}
            >
              <MaterialIcons name="check" size={16} color="#fff" />
              <Text style={styles.btnText}>Chọn</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* Reusable RN form inputs */
function TextFieldRN({
  styles,
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  rightIcon,
  onRightIconPress,
  errorText = "",
}) {
  return (
    <View style={{ marginTop: 8 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldInput}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={styles.tokens.iconMuted}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          style={{
            flex: 1,
            paddingVertical: Platform.OS === "ios" ? 8 : 6,
            color: styles.tokens.textPrimary,
          }}
        />
        {!!rightIcon && (
          <Pressable
            onPress={onRightIconPress}
            hitSlop={8}
            style={{ paddingHorizontal: 4 }}
          >
            <MaterialIcons
              name={rightIcon}
              size={18}
              color={styles.tokens.iconMuted}
            />
          </Pressable>
        )}
      </View>
      {!!errorText && (
        <Text style={[styles.errorText, { color: "#d32f2f" }]}>
          {errorText}
        </Text>
      )}
    </View>
  );
}

function SelectRN({ styles, tokens, label, value, onSelect, options }) {
  const [open, setOpen] = useState(false);
  const currentLabel =
    options.find((o) => String(o.value) === String(value))?.label ||
    value ||
    "";
  const MAX_H = Math.round(Dimensions.get("window").height * 0.6);

  return (
    <View style={{ marginTop: 8 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable style={styles.fieldInput} onPress={() => setOpen(true)}>
        <Text
          style={{
            flex: 1,
            paddingVertical: Platform.OS === "ios" ? 8 : 6,
            color: styles.tokens.textPrimary,
          }}
        >
          {currentLabel || "-- Chọn --"}
        </Text>
        <MaterialIcons
          name="arrow-drop-down"
          size={20}
          color={tokens.iconMuted}
        />
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        onRequestClose={() => setOpen(false)}
        presentationStyle="overFullScreen"
        statusBarTranslucent
        transparent
      >
        <Pressable
          style={styles.sheetBackdrop}
          onPress={() => setOpen(false)}
        />
        <SafeAreaView style={[styles.sheet, { maxHeight: MAX_H }]}>
          <Text style={styles.sheetTitle}>{label}</Text>

          <FlatList
            data={options}
            keyExtractor={(item) => String(item.value)}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 8 }}
            renderItem={({ item }) => {
              const selected = String(item.value) === String(value);
              return (
                <Pressable
                  onPress={() => {
                    onSelect(item.value);
                    setOpen(false);
                  }}
                  style={[
                    styles.sheetItem,
                    selected && { backgroundColor: styles.tokens.muted },
                  ]}
                >
                  <Text style={styles.sheetItemText}>{item.label}</Text>
                  {selected && (
                    <MaterialIcons
                      name="check"
                      size={18}
                      color={styles.tokens.tint}
                    />
                  )}
                </Pressable>
              );
            }}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

/* ================== Dynamic styles ================== */
function makeStyles(tokens) {
  const s = StyleSheet.create({
    tokens, // expose for children (not used by RN)
    headerWrap: {
      paddingHorizontal: 12,
      paddingTop: 8,
      paddingBottom: 4,
      backgroundColor: tokens.cardBg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: tokens.border,
    },
    input: {
      backgroundColor: tokens.cardBg,
      borderWidth: 1,
      borderColor: tokens.border,
      borderRadius: 8,
      paddingHorizontal: 10,
    },
    label: { fontSize: 13, color: tokens.textSecondary, marginRight: 6 },
    select: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: tokens.border,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
      minWidth: 120,
    },
    selectText: { flex: 1, fontSize: 14, color: tokens.textPrimary },

    chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
    chipText: { fontSize: 12, color: "#fff", fontWeight: "700" },

    card: {
      backgroundColor: tokens.cardBg,
      borderWidth: 1,
      borderColor: tokens.border,
      borderRadius: 12,
      padding: 10,
      marginTop: 8,
      shadowColor: "#000",
      shadowOpacity: tokens.scheme === "dark" ? 0 : 0.05,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: tokens.scheme === "dark" ? 0 : 2,
    },
    name: {
      fontSize: 16,
      fontWeight: "700",
      flexShrink: 1,
      color: tokens.textPrimary,
    },
    email: { fontSize: 13, color: tokens.textSecondary, marginTop: 2 },

    roleSelect: {
      borderWidth: 1,
      borderColor: tokens.border,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
      flexDirection: "row",
      alignItems: "center",
    },
    roleText: { fontSize: 13, color: tokens.textPrimary, marginRight: 6 },

    toggle: { flexDirection: "row", alignItems: "center" },
    toggleText: { marginLeft: 6, color: tokens.textSecondary },

    backdrop: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0,0,0,0.5)",
    },

    modalWrap: {
      flex: 1,
      backgroundColor: tokens.cardBg,
      padding: 12,
      paddingTop: 16,
    },
    modalTitle: { fontSize: 18, fontWeight: "700", color: tokens.textPrimary },

    infoBox: {
      marginTop: 10,
      borderWidth: 1,
      borderColor: tokens.border,
      borderRadius: 8,
      padding: 10,
      backgroundColor: tokens.cardBg,
    },
    infoLabel: { width: 120, color: tokens.textSecondary, fontSize: 13 },
    infoValue: {
      fontWeight: "600",
      fontSize: 14,
      flexShrink: 1,
      color: tokens.textPrimary,
    },

    noteBox: {
      marginTop: 8,
      backgroundColor: tokens.muted,
      borderRadius: 8,
      padding: 8,
    },
    noteLabel: { fontSize: 12, color: tokens.textSecondary },
    noteText: { fontSize: 14, color: tokens.textPrimary, marginTop: 2 },

    btn: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    btnText: { color: "#fff", fontWeight: "700", marginLeft: 6 },
    btnPrimary: { backgroundColor: "#1976d2" },
    btnSecondary: { backgroundColor: "#9c27b0" },
    btnSuccess: { backgroundColor: "#2e7d32" },
    btnDanger: { backgroundColor: "#d32f2f" },
    btnGhost: { backgroundColor: tokens.muted },

    confirmBox: {
      position: "absolute",
      left: 20,
      right: 20,
      top: "35%",
      backgroundColor: tokens.cardBg,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: tokens.border,
    },
    confirmTitle: {
      fontSize: 16,
      fontWeight: "700",
      textAlign: "center",
      color: tokens.textPrimary,
    },

    sheetBackdrop: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0,0,0,0.35)",
    },
    sheet: {
      position: "absolute",
      left: 12,
      right: 12,
      bottom: 16,
      backgroundColor: tokens.cardBg,
      borderRadius: 12,
      paddingVertical: 8,
      paddingHorizontal: 8,
      borderWidth: 1,
      borderColor: tokens.border,
    },
    sheetTitle: {
      fontSize: 16,
      fontWeight: "700",
      paddingHorizontal: 8,
      paddingBottom: 8,
      color: tokens.textPrimary,
    },
    sheetItem: {
      paddingHorizontal: 10,
      paddingVertical: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: tokens.border,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    sheetItemText: { fontSize: 15, color: tokens.textPrimary },

    fieldLabel: { fontSize: 12, color: tokens.textSecondary },
    fieldInput: {
      borderWidth: 1,
      borderColor: tokens.border,
      backgroundColor: tokens.cardBg,
      borderRadius: 8,
      paddingHorizontal: 10,
      marginTop: 6,
      minHeight: 40,
      flexDirection: "row",
      alignItems: "center",
    },
    errorText: { fontSize: 12, marginTop: 2 },
  });
  return s;
}
