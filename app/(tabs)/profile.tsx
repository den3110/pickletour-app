// app/(tabs)/profile/index.jsx
// ✨ Layout kiểu "Facebook profile":
// - Fix: avatar camera không bị che, stats có scroll ngang, tiêu đề Card theo theme tối,
//   thêm padding dưới để không bị tab menu che nội dung.
// - Dùng expo-image cho TẤT CẢ hình ảnh (cache memory-disk cho remote, tắt cache cho local).
// - Avatar & Cover: chọn ảnh -> Modal preview (Huỷ / Xác nhận).
//   Bấm "Xác nhận" => upload => update profile => refetch => hiển thị URL remote để tránh "đen xì".
// - NEW: Nhấn vào Avatar/Cover để mở react-native-image-viewing (phóng to).

import DateTimePicker from "@react-native-community/datetimepicker";
import { Picker } from "@react-native-picker/picker";
import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Image as ExpoImage } from "expo-image";
import { router, Stack } from "expo-router";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
  Switch,
  DeviceEventEmitter,
} from "react-native";
import ImageView from "react-native-image-viewing";
import { MaterialIcons } from "@expo/vector-icons";
import { useDispatch, useSelector } from "react-redux";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { logout as logoutAction } from "@/slices/authSlice";
import {
  useUploadAvatarMutation,
  useUploadCccdMutation,
} from "@/slices/uploadApiSlice";
import {
  useDeleteMeMutation,
  useGetProfileQuery,
  useLogoutMutation,
  useUpdateUserMutation,
  useIssueOsAuthTokenMutation,
} from "@/slices/usersApiSlice";
import * as SecureStore from "expo-secure-store";
import { useUnregisterPushTokenMutation } from "@/slices/pushApiSlice";
import { normalizeUrl } from "@/utils/normalizeUri";
import CccdQrModal from "@/components/CccdQrModal";
import { usePlatform } from "@/hooks/usePlatform";
import { DEVICE_ID_KEY } from "@/hooks/useExpoPushToken";
import apiSlice from "@/slices/apiSlice";
import { useTheme } from "@react-navigation/native";
import * as LocalAuthentication from "expo-local-authentication";
/* ---------- Config ---------- */
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const PREF_THEME_KEY = "PREF_THEME"; // "system" | "light" | "dark"
const PREF_PUSH_ENABLED = "PREF_PUSH_ENABLED"; // "1" | "0"

/* ---------- Danh sách tỉnh ---------- */
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

/* ---------- Gender options ---------- */
const GENDER_OPTIONS = [
  { value: "", label: "-- Chọn giới tính --" },
  { value: "male", label: "Nam" },
  { value: "female", label: "Nữ" },
  { value: "other", label: "Khác" },
];

/* ---------- Form gốc ---------- */
const EMPTY = {
  name: "",
  nickname: "",
  phone: "",
  dob: "",
  province: "",
  cccd: "",
  email: "",
  password: "",
  confirmPassword: "",
  gender: "",
  avatar: "",
  cover: "",
};

/* ===== Helpers ===== */
function isRemoteUri(uri) {
  return /^https?:\/\//i.test(String(uri || ""));
}

// ExpoImage wrapper: auto cache cho remote, tắt cache cho local
function XImage({
  uri,
  contentFit = "cover",
  cacheRemote = "memory-disk",
  style,
  transition = 150,
  recyclingKey,
}) {
  const isRemote = isRemoteUri(uri);
  const safeUri = uri ? String(uri).replace(/\\/g, "/") : undefined;
  return (
    <ExpoImage
      source={safeUri ? { uri: safeUri } : undefined}
      style={style}
      contentFit={contentFit}
      cachePolicy={isRemote ? cacheRemote : "none"}
      transition={isRemote ? transition : 0}
      recyclingKey={recyclingKey || safeUri || Math.random().toString(36)}
    />
  );
}

async function pickImage(maxBytes = MAX_FILE_SIZE) {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.9,
  });
  if (res.canceled) return null;

  let asset = res.assets[0];
  let uri = asset.uri;

  // (giữ nguyên cách lấy File theo code cũ của bạn)
  let f = new File(asset);
  let size = f.size;
  let mime = f.type;
  let name = f.name || asset.fileName || "image";

  const isHeic =
    /heic|heif/i.test(mime || "") || /\.heic|\.heif$/i.test(name || "");
  if (isHeic) {
    const ctx = ImageManipulator.manipulate(uri);
    const ref = await ctx.renderAsync();
    const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
    uri = out.uri;
    f = new File(uri);
    size = f.size;
    mime = "image/jpeg";
    name = (name || "image").replace(/\.(heic|heif)$/i, ".jpg");
  }

  if (typeof size === "number" && size > maxBytes) {
    Alert.alert("Ảnh quá lớn", "Ảnh không được vượt quá 10MB.");
    return null;
  }

  if (!/\.jpe?g|\.png|\.webp$/i.test(name || "")) {
    const ext = /png/i.test(mime) ? "png" : /webp/i.test(mime) ? "webp" : "jpg";
    if (!name.includes(".")) name = `${name}.${ext}`;
  }
  const type =
    mime ||
    (name.endsWith(".png")
      ? "image/png"
      : name.endsWith(".webp")
      ? "image/webp"
      : "image/jpeg");

  return { uri, name, type, size };
}

function yyyyMMdd(d) {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function dmyToIso(s) {
  if (!s) return "";
  s = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    return `${yyyy}-${mm}-${dd}`;
  }
  return s;
}

/* ---------- Theme tokens (đồng bộ với react-navigation) ---------- */
function useTokens() {
  const navTheme = useTheme?.() || {};
  const scheme = useColorScheme?.() || "light";
  const dark =
    typeof navTheme.dark === "boolean" ? navTheme.dark : scheme === "dark";

  const primary = navTheme?.colors?.primary ?? (dark ? "#7cc0ff" : "#0a84ff");
  const text = navTheme?.colors?.text ?? (dark ? "#f7f7f7" : "#111");
  const card = navTheme?.colors?.card ?? (dark ? "#16181c" : "#ffffff");
  const border = navTheme?.colors?.border ?? (dark ? "#2e2f33" : "#e4e8ef");
  const background =
    navTheme?.colors?.background ?? (dark ? "#0b0d10" : "#f5f7fb");

  return {
    dark,
    colors: { primary, text, card, border, background },
    muted: dark ? "#9aa0a6" : "#6b7280",
    subtext: dark ? "#c9c9c9" : "#555",
    skeletonBase: dark ? "#22262c" : "#e9eef5",
  };
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { isIOS } = usePlatform();
  const t = useTokens();
  const scheme = t.dark ? "dark" : "light"; // cho iOS ActionSheet
  const tint = t.colors.primary;
  const cardBg = t.colors.card;
  const textPrimary = t.colors.text;
  const textSecondary = t.subtext;
  const border = t.colors.border;
  const muted = t.dark ? "#1b1d22" : "#f3f5f9";
  const viewerBg = t.dark ? "#0b0b0c" : "#ffffff";

  const dispatch = useDispatch();
  const userInfo = useSelector((s) => s.auth?.userInfo);

  // Query profile
  const {
    data: user,
    isLoading: fetching,
    refetch,
    error,
  } = useGetProfileQuery(undefined, { skip: !userInfo });

  const [updateProfile, { isLoading }] = useUpdateUserMutation();
  const [unregisterDeviceToken] = useUnregisterPushTokenMutation();
  const [logoutApiCall] = useLogoutMutation();
  const [deleteMe] = useDeleteMeMutation();
  const [issueOsAuthToken] = useIssueOsAuthTokenMutation();
  const [uploadCccd, { isLoading: upLoad }] = useUploadCccdMutation();
  const [uploadAvatar, { isLoading: uploadingAvatar }] =
    useUploadAvatarMutation();

  // ===== Redirect rules =====
  const [authReady, setAuthReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAuthReady(true), 0);
    return () => clearTimeout(t);
  }, []);

  const navigatedRef = useRef(false);
  useEffect(() => {
    if (authReady && !userInfo && !navigatedRef.current) {
      navigatedRef.current = true;
      router.replace("/login");
    }
  }, [authReady, userInfo]);

  useEffect(() => {
    const status = error?.status || error?.originalStatus;
    if (status === 401) {
      dispatch(logoutAction());
      router.replace("/login");
    }
  }, [error, dispatch]);

  const [form, setForm] = useState(EMPTY);
  const [touched, setTouched] = useState({});
  const [errors, setErrors] = useState({});
  const initialRef = useRef(EMPTY);

  // highlight fields vừa autofill
  const [HL, setHL] = useState({
    name: false,
    dob: false,
    gender: false,
    province: false,
    cccd: false,
  });
  const flash = (keys = [], ms = 900) => {
    if (!keys.length) return;
    setHL((p) => ({ ...p, ...Object.fromEntries(keys.map((k) => [k, true])) }));
    setTimeout(
      () =>
        setHL((p) => ({
          ...p,
          ...Object.fromEntries(keys.map((k) => [k, false])),
        })),
      ms
    );
  };

  const [qrOpen, setQrOpen] = useState(false);

  const [frontImg, setFrontImg] = useState(null);
  const [backImg, setBackImg] = useState(null);
  const allowSendCccd =
    !!frontImg && !!backImg && /^\d{12}$/.test(String(form.cccd || "").trim());

  // Avatar: preview modal (Huỷ / Xác nhận)
  const [avatarTemp, setAvatarTemp] = useState(null);
  const [avatarConfirmOpen, setAvatarConfirmOpen] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [uploadedAvatarUrl, setUploadedAvatarUrl] = useState("");

  // Cover: preview modal (Huỷ / Xác nhận)
  const [coverTemp, setCoverTemp] = useState(null);
  const [coverConfirmOpen, setCoverConfirmOpen] = useState(false);
  const [coverSaving, setCoverSaving] = useState(false);

  // ===== Universal Image Viewer state (Avatar / Cover / CCCD) =====
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerImages, setViewerImages] = useState([]);
  const [viewerLabels, setViewerLabels] = useState([]);
  const canNativePicker = Platform.OS === "ios" || Platform.OS === "android";
  const openAvatarViewer = () => {
    const url = normalizeUrl(form.avatar);
    if (!url) return;
    setViewerImages([{ uri: url.replace(/\\/g, "/") }]);
    setViewerLabels(["Ảnh đại diện"]);
    setViewerIndex(0);
    setViewerOpen(true);
  };

  const openCoverViewer = () => {
    const url = normalizeUrl(form.cover);
    if (!url) return;
    setViewerImages([{ uri: url.replace(/\\/g, "/") }]);
    setViewerLabels(["Ảnh bìa"]);
    setViewerIndex(0);
    setViewerOpen(true);
  };

  const openCccdViewer = (which) => {
    const frontUrl = normalizeUrl(user?.cccdImages?.front) || "";
    const backUrl = normalizeUrl(user?.cccdImages?.back) || "";
    const arr = [];
    const labels = [];
    if (frontUrl) {
      arr.push({ uri: frontUrl.replace(/\\/g, "/") });
      labels.push("Mặt trước");
    }
    if (backUrl) {
      arr.push({ uri: backUrl.replace(/\\/g, "/") });
      labels.push("Mặt sau");
    }
    if (!arr.length) return;
    const idx = which === "back" ? (frontUrl ? 1 : 0) : 0;
    setViewerImages(arr);
    setViewerLabels(labels);
    setViewerIndex(idx);
    setViewerOpen(true);
  };

  // Pull to refresh
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    try {
      setRefreshing(true);
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  // Prefill
  useEffect(() => {
    if (!user) return;
    const init = {
      name: user.name || "",
      nickname: user.nickname || "",
      phone: user.phone || "",
      dob: user.dob ? String(user.dob).slice(0, 10) : "",
      province: user.province || "",
      cccd: user.cccd || "",
      email: user.email || "",
      password: "",
      confirmPassword: "",
      gender: user.gender || "",
      avatar: user.avatar || "",
      cover: user.cover || "",
    };
    initialRef.current = init;
    setForm(init);

    // reset avatar & cover temp/modal states
    setUploadedAvatarUrl("");
    setAvatarTemp(null);
    setAvatarConfirmOpen(false);
    setAvatarSaving(false);

    setCoverTemp(null);
    setCoverConfirmOpen(false);
    setCoverSaving(false);
  }, [user]);

  // Validate
  const validate = (d) => {
    const e = {};
    if (!d.name.trim()) e.name = "Không được bỏ trống";
    else if (d.name.trim().length < 2) e.name = "Tối thiểu 2 ký tự";
    if (!d.nickname.trim()) e.nickname = "Không được bỏ trống";
    else if (d.nickname.trim().length < 2) e.nickname = "Tối thiểu 2 ký tự";
    if (!/^0\d{9}$/.test(d.phone.trim())) e.phone = "Sai định dạng (10 chữ số)";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim()))
      e.email = "Email không hợp lệ";
    if (d.dob) {
      const day = new Date(d.dob);
      if (Number.isNaN(day.getTime())) e.dob = "Ngày sinh không hợp lệ";
      else if (day > new Date()) e.dob = "Không được ở tương lai";
    }
    if (!d.province) e.province = "Bắt buộc";
    if (d.cccd && !/^\d{12}$/.test(d.cccd.trim()))
      e.cccd = "CCCD phải đủ 12 số";
    if (d.password) {
      if (d.password.length < 6) e.password = "Tối thiểu 6 ký tự";
      if (d.password !== d.confirmPassword) e.confirmPassword = "Không khớp";
    }
    if (!["", "male", "female", "other"].includes(d.gender))
      e.gender = "Giới tính không hợp lệ";
    return e;
  };
  useEffect(() => setErrors(validate(form)), [form]);

  const isDirty = useMemo(() => {
    const changed = Object.keys(form).some(
      (k) => k !== "confirmPassword" && form[k] !== initialRef.current[k]
    );
    return changed; // cover/avt cập nhật ngay qua modal, không qua "Lưu"
  }, [form]);
  const isValid = useMemo(() => !Object.keys(errors).length, [errors]);

  const showErr = (f) => touched[f] && !!errors[f];
  const setField = (name, value) => setForm((p) => ({ ...p, [name]: value }));
  const markTouched = (name) => setTouched((t) => ({ ...t, [name]: true }));

  const diff = () => {
    const out = { _id: user?._id };
    for (const k in form) {
      if (k === "confirmPassword") continue;
      if (form[k] !== initialRef.current[k]) out[k] = form[k];
    }
    return out;
  };

  // QR → fill + highlight
  const onScanResult = (r) => {
    const updates = {};
    if (r?.id) updates.cccd = String(r.id);
    if (r?.name) updates.name = String(r.name).trim();
    if (r?.dob) updates.dob = dmyToIso(r.dob);
    if (r?.gender) {
      const g = String(r.gender).toLowerCase();
      if (/(^m$|male|^nam$)/i.test(g)) updates.gender = "male";
      else if (/(^f$|female|^nữ$|^nu$)/i.test(g)) updates.gender = "female";
    }
    if (r?.address) {
      const match = PROVINCES.find((p) =>
        r.address.toLowerCase().includes(p.toLowerCase())
      );
      if (match) updates.province = match;
    }
    if (Object.keys(updates).length) {
      setForm((p) => ({ ...p, ...updates }));
      flash(Object.keys(updates));
    }
  };

  const submit = async () => {
    setTouched(Object.fromEntries(Object.keys(form).map((k) => [k, true])));
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length) {
      return Alert.alert("Lỗi", "Vui lòng kiểm tra lại biểu mẫu.");
    }
    if (!isDirty) return Alert.alert("Thông tin", "Chưa có thay đổi.");

    try {
      const payload = diff();
      await updateProfile(payload).unwrap();
      await refetch();
      setTouched({});
      Alert.alert("Thành công", "Đã lưu hồ sơ.");
    } catch (err) {
      Alert.alert(
        "Lỗi",
        err?.data?.message || err?.error || "Cập nhật thất bại"
      );
    }
  };

  const sendCccd = async () => {
    if (!/^\d{12}$/.test(String(form.cccd || "").trim())) {
      return Alert.alert(
        "Thiếu CCCD",
        "Vui lòng nhập hoặc quét số CCCD (12 số) trước khi gửi ảnh xác minh."
      );
    }
    if (!frontImg || !backImg || upLoad) return;
    try {
      await uploadCccd({ front: frontImg, back: backImg }).unwrap();
      setFrontImg(null);
      setBackImg(null);
      await refetch();
      Alert.alert("Thành công", "Đã gửi, vui lòng chờ xác minh.");
    } catch (err) {
      Alert.alert("Lỗi", err?.data?.message || "Upload thất bại");
    }
  };

  const confirmLogout = () => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: "Bạn chắc muốn đăng xuất?",
          options: ["Huỷ", "Đăng xuất"],
          destructiveButtonIndex: 1,
          cancelButtonIndex: 0,
          userInterfaceStyle: scheme === "dark" ? "dark" : "light",
        },
        async (idx) => {
          if (idx === 1) await doLogout();
        }
      );
    } else {
      Alert.alert("Đăng xuất", "Bạn chắc chắn muốn đăng xuất?", [
        { text: "Huỷ", style: "cancel" },
        { text: "Đăng xuất", style: "destructive", onPress: doLogout },
      ]);
    }
  };

  const doLogout = async () => {
    try {
      const deviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
      if (deviceId) {
        try {
          await unregisterDeviceToken({ deviceId }).unwrap();
        } catch (e) {
          if (__DEV__) console.log("unregister device token failed:", e);
        }
      }
      await logoutApiCall().unwrap();
    } catch {}
    dispatch(logoutAction());
    router.replace("/login");
    dispatch(apiSlice.util.resetApiState());
  };

  // Thực sự gọi API xoá: body = { password } | { osAuthToken }
  const runDelete = async (body) => {
    setDelBusy(true);
    try {
      // Backend nên nhận body trong DELETE: { password }
      // Nếu slice của bạn chưa cho body trong DELETE, xem ghi chú bên dưới.
      await deleteMe(body ?? {}).unwrap();
      dispatch(logoutAction());
      router.replace("/login");
      dispatch(apiSlice.util.resetApiState());
      Alert.alert("Đã xoá", "Tài khoản của bạn đã được xoá vĩnh viễn.");
    } catch (e) {
      Alert.alert(
        "Lỗi",
        e?.data?.message || e?.error || "Xoá tài khoản thất bại"
      );
    } finally {
      setDelBusy(false);
      setDelPw("");
      setDelPwModalOpen(false);
    }
  };

  // Gọi xác thực hệ điều hành trước. Nếu không khả dụng → fallback nhập mật khẩu.
  const attemptOsAuthThenDelete = async () => {
    try {
      // Luôn để disableDeviceFallback=false để iOS có Passcode, Android có Device PIN/PATTERN.
      const res = await LocalAuthentication.authenticateAsync({
        promptMessage: "Xác thực để xoá tài khoản",
        cancelLabel: "Huỷ",
        fallbackLabel: "Dùng mật mã",
        disableDeviceFallback: false,
        requireConfirmation: false, // Android: không cần nhấn thêm nút xác nhận
      });
      if (res.success) {
        // Đã xác thực bằng FaceID/TouchID/PIN của máy → xoá ngay (không yêu cầu mật khẩu).
        // Đã xác thực OS → xin osAuthToken rồi xoá bằng token
        try {
          const data = await issueOsAuthToken().unwrap();
          const osAuthToken = data?.osAuthToken || data?.token;
          if (!osAuthToken) throw new Error("Không nhận được osAuthToken");
          await runDelete({ osAuthToken });
        } catch (_) {
          // Nếu xin token lỗi → fallback bắt nhập password
          setDelPwModalOpen(true);
        }
      } else {
        // Các trường hợp không có/không enrol/lockout/thất bại → bắt người dùng nhập mật khẩu tài khoản.
        const needPw =
          res.error === "not_available" ||
          res.error === "not_enrolled" ||
          res.error === "lockout" ||
          res.error === "lockout_permanent" ||
          res.error === "unknown";
        if (needPw) setDelPwModalOpen(true);
        // user_cancel / system_cancel: không làm gì.
      }
    } catch {
      // Lỗi bất ngờ khi gọi OS auth → fallback mật khẩu
      setDelPwModalOpen(true);
    }
  };

  const confirmDelete = () => {
    const onConfirm = () => attemptOsAuthThenDelete();
    const title =
      "Xoá tài khoản sẽ xoá dữ liệu cá nhân và không thể hoàn tác. Xác nhận?";
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title,
          options: ["Huỷ", "Xoá vĩnh viễn"],
          destructiveButtonIndex: 1,
          cancelButtonIndex: 0,
          userInterfaceStyle: scheme === "dark" ? "dark" : "light",
        },
        (idx) => idx === 1 && onConfirm()
      );
    } else {
      Alert.alert("Xoá tài khoản", title, [
        { text: "Huỷ", style: "cancel" },
        { text: "Xoá vĩnh viễn", style: "destructive", onPress: onConfirm },
      ]);
    }
  };

  // ===== Prefs: theme + push (UI hiển thị, lưu vào SecureStore) =====
  const [prefTheme, setPrefTheme] = useState("system");
  const [pushEnabled, setPushEnabled] = useState(true);
  const [themeBusy, setThemeBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const themePref =
        (await SecureStore.getItemAsync(PREF_THEME_KEY)) || "system";
      const p = (await SecureStore.getItemAsync(PREF_PUSH_ENABLED)) || "1";
      setPrefTheme(themePref);
      setPushEnabled(p === "1");
    })();
  }, []);
  const applyThemePref = async (mode) => {
    // cập nhật tức thì UI radio
    setPrefTheme(mode);
    setThemeBusy(true);
    try {
      await SecureStore.setItemAsync(PREF_THEME_KEY, mode);
    } catch {}

    // lắng nghe khi root báo áp dụng xong để tắt loading tại màn này
    const sub = DeviceEventEmitter.addListener("theme:applied", () => {
      setThemeBusy(false);
      sub.remove();
    });

    // phát sự kiện cho RootLayout đổi theme ngay
    DeviceEventEmitter.emit("theme:changed", mode);
  };

  // (tuỳ chọn) nếu theme bị đổi từ nơi khác, đồng bộ lại radio UI trong màn này
  React.useEffect(() => {
    const sub = DeviceEventEmitter.addListener("theme:changed", (mode) => {
      setPrefTheme(mode);
    });
    return () => sub.remove();
  }, []);
  const togglePush = async (v) => {
    setPushEnabled(v);
    await SecureStore.setItemAsync(PREF_PUSH_ENABLED, v ? "1" : "0");
    // console.log(SecureStore.getItemAsync(PREF_PUSH_ENABLED).then(data=> console.log(data)))
    if (!v) {
      try {
        const deviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
        if (deviceId) await unregisterDeviceToken({ deviceId }).unwrap();
      } catch {}
    } else {
      Alert.alert("Thông báo", "Đã bật thông báo");
    }
  };

  const status = user?.cccdStatus || "unverified";
  const showUpload = status === "unverified" || status === "rejected";

  // ===== Tabs
  const [tab, setTab] = useState("overview"); // overview | profile | settings
  // ===== Delete-account states (fallback password) =====
  const [delPwModalOpen, setDelPwModalOpen] = useState(false);
  const [delPw, setDelPw] = useState("");
  const [delBusy, setDelBusy] = useState(false);
  // ===== Render gate =====
  if (!userInfo) {
    return (
      <>
        <Stack.Screen
          options={{ title: "Profile", headerTitleAlign: "center" }}
        />
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <Text>Đang kiểm tra đăng nhập…</Text>
        </View>
      </>
    );
  }

  if (fetching || !user) {
    return (
      <>
        <Stack.Screen
          options={{ title: "Profile", headerTitleAlign: "center" }}
        />
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <Text>Đang tải…</Text>
        </View>
      </>
    );
  }

  const avatarUrl = normalizeUrl(form.avatar) || "";
  const coverUrl = normalizeUrl(form.cover) || "";

  return (
   <></>
  );
}

/* ======= Subcomponents ======= */

function PillButton({
  title,
  onPress,
  outline = false,
  tint = "#0a84ff",
  textPrimary = "#111",
  border = "#dfe3ea",
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          paddingVertical: 10,
          paddingHorizontal: 14,
          borderRadius: 999,
          backgroundColor: outline ? "transparent" : tint,
          borderWidth: outline ? 1 : 0,
          borderColor: outline ? tint || border : "transparent",
        },
        pressed && { opacity: 0.9 },
      ]}
    >
      <Text
        style={{
          color: outline ? tint || textPrimary : "#fff",
          fontWeight: "700",
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}

function TabBar({ active, onChange, tint, textPrimary, border, muted }) {
  const items = [
    { key: "overview", label: "Tổng quan", icon: "person" },
    { key: "profile", label: "Hồ sơ", icon: "edit" },
    { key: "settings", label: "Cài đặt", icon: "settings" },
  ];
  return (
    <View
      style={{
        flexDirection: "row",
        borderWidth: 1,
        borderColor: border,
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      {items.map((it) => {
        const isAct = active === it.key;
        return (
          <Pressable
            key={it.key}
            onPress={() => onChange(it.key)}
            style={({ pressed }) => [
              {
                flex: 1,
                paddingVertical: 10,
                alignItems: "center",
                backgroundColor: isAct ? tint : muted,
              },
              pressed && { opacity: 0.95 },
            ]}
          >
            <View
              style={{ flexDirection: "row", gap: 6, alignItems: "center" }}
            >
              <MaterialIcons
                name={it.icon}
                size={16}
                color={isAct ? "#fff" : textPrimary}
              />
              <Text
                style={{
                  color: isAct ? "#fff" : textPrimary,
                  fontWeight: "700",
                }}
              >
                {it.label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function Card({ title, children, cardBg, border, textPrimary = "#111" }) {
  return (
    <View
      style={[styles.card, { backgroundColor: cardBg, borderColor: border }]}
    >
      {!!title && (
        <Text style={[styles.cardTitle, { color: textPrimary }]}>{title}</Text>
      )}
      {children}
    </View>
  );
}

function RowLabel({ label, value, textPrimary, textSecondary }) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        paddingVertical: 8,
      }}
    >
      <Text style={{ color: textSecondary }}>{label}</Text>
      <Text style={{ color: textPrimary, fontWeight: "600" }}>
        {value || "—"}
      </Text>
    </View>
  );
}

function StatChip({ icon = "star", label, value, textSecondary, border }) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: border,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <MaterialIcons name={icon} size={14} color={textSecondary} />
      <Text style={{ color: textSecondary, fontWeight: "600", marginLeft: 6 }}>
        {label}: {value ?? 0}
      </Text>
    </View>
  );
}

function RadioRow({
  label,
  selected,
  onPress,
  textPrimary,
  textSecondary,
  border,
  tint,
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingVertical: 12,
          borderTopWidth: 1,
          borderColor: border,
        },
        pressed && { opacity: 0.95 },
      ]}
    >
      <Text style={{ color: textPrimary }}>{label}</Text>
      <MaterialIcons
        name={selected ? "radio-button-checked" : "radio-button-unchecked"}
        size={20}
        color={selected ? tint : textSecondary}
      />
    </Pressable>
  );
}

function SwitchRow({
  label,
  value,
  onValueChange,
  textPrimary,
  textSecondary,
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 12,
      }}
    >
      <Text style={{ color: textPrimary }}>{label}</Text>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  onBlur,
  error = "",
  required = false,
  placeholder = "",
  keyboardType = "default",
  secureTextEntry = false,
  maxLength,
  border,
  textPrimary,
  textSecondary,
  highlighted = false,
  tint = "#0a84ff",
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={[styles.label, { color: textSecondary }]}>
        {label}
        {required ? " *" : ""}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        placeholder={placeholder || label}
        placeholderTextColor="#9aa0a6"
        style={[
          styles.input,
          { borderColor: highlighted ? tint : border, color: textPrimary },
          highlighted && {
            shadowColor: tint,
            shadowOpacity: 0.55,
            shadowRadius: 6,
            elevation: 3,
          },
        ]}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        maxLength={maxLength}
      />
      {!!error && <Text style={styles.errText}>{error}</Text>}
    </View>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  error = "",
  border,
  textPrimary,
  textSecondary,
  highlighted = false,
  tint = "#0a84ff",
  cardBg,
}) {
  const [open, setOpen] = useState(false);
  const [temp, setTemp] = useState(value || "");
  const canNativePicker = Platform.OS === "ios" || Platform.OS === "android";
  useEffect(() => setTemp(value || ""), [value]);
  const display =
    options.find((o) => o.value === value)?.label || placeholder || "—";
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={[styles.label, { color: textSecondary }]}>{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.selectBox,
          { borderColor: highlighted ? tint : border },
          highlighted && {
            shadowColor: tint,
            shadowOpacity: 0.55,
            shadowRadius: 6,
            elevation: 3,
          },
          pressed && { opacity: 0.95 },
        ]}
      >
        <Text style={{ color: value ? textPrimary : "#9aa0a6", fontSize: 16 }}>
          {display}
        </Text>
      </Pressable>
      {!!error && <Text style={styles.errText}>{error}</Text>}
      {open && canNativePicker ? (
        <Modal
          visible={open}
          animationType="slide"
          transparent
          onRequestClose={() => setOpen(false)}
        >
          <View style={styles.modalBackdrop}>
            <View
              style={[
                styles.modalCard,
                { borderColor: border, backgroundColor: cardBg },
              ]}
            >
              <View style={styles.modalHeader}>
                <Pressable
                  onPress={() => setOpen(false)}
                  style={styles.modalBtn}
                >
                  <Text style={[styles.modalBtnText, { color: textPrimary }]}>
                    Hủy
                  </Text>
                </Pressable>

                <Text style={[styles.modalTitle, { color: textPrimary }]}>
                  {label}
                </Text>

                <Pressable
                  onPress={() => {
                    onChange(temp);
                    setOpen(false);
                  }}
                  style={styles.modalBtn}
                >
                  <Text style={[styles.modalBtnText, { color: textPrimary }]}>
                    Xong
                  </Text>
                </Pressable>
              </View>
              <Picker
                selectedValue={temp}
                onValueChange={(v) => setTemp(String(v))}
              >
                {options.map((o) => (
                  <Picker.Item
                    key={o.value ?? o.label}
                    label={o.label}
                    value={o.value}
                  />
                ))}
              </Picker>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

function DateField({
  label,
  value,
  onChange,
  error = "",
  border,
  textPrimary,
  textSecondary,
  tint,
  highlighted = false,
  cardBg,
}) {
  const [open, setOpen] = useState(false);
  const [temp, setTemp] = useState(
    value ? new Date(value) : new Date(1990, 0, 1)
  );
  const canNativePicker = Platform.OS === "ios" || Platform.OS === "android";
  useEffect(() => {
    if (value) setTemp(new Date(value));
  }, [value]);
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={[styles.label, { color: textSecondary }]}>{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.selectBox,
          { borderColor: highlighted ? tint : border },
          highlighted && {
            shadowColor: tint,
            shadowOpacity: 0.55,
            shadowRadius: 6,
            elevation: 3,
          },
          pressed && { opacity: 0.95 },
        ]}
      >
        <Text style={{ color: value ? textPrimary : "#9aa0a6", fontSize: 16 }}>
          {value || "Chọn ngày sinh"}
        </Text>
      </Pressable>
      {!!error && <Text style={styles.errText}>{error}</Text>}
      {open && canNativePicker && (
        <Modal
          visible={open}
          animationType="slide"
          transparent
          onRequestClose={() => setOpen(false)}
        >
          <View style={styles.modalBackdrop}>
            <View
              style={[
                styles.modalCard,
                { borderColor: border, backgroundColor: cardBg },
              ]}
            >
              <View style={styles.modalHeader}>
                <Pressable
                  onPress={() => setOpen(false)}
                  style={styles.modalBtn}
                >
                  <Text style={[styles.modalBtnText, { color: textPrimary }]}>
                    Hủy
                  </Text>
                </Pressable>

                <Text style={[styles.modalTitle, { color: textPrimary }]}>
                  {label}
                </Text>

                <Pressable
                  onPress={() => {
                    onChange(yyyyMMdd(temp));
                    setOpen(false);
                  }}
                  style={[
                    styles.modalBtn,
                    {
                      backgroundColor: tint,
                      borderRadius: 8,
                      paddingHorizontal: 10,
                    },
                  ]}
                >
                  <Text style={[styles.modalBtnText, { color: "#fff" }]}>
                    Xong
                  </Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={temp}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(_, d) => d && setTemp(d)}
                maximumDate={new Date()}
              />
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

function PickBox({ label, file, onPick, border, muted, textSecondary }) {
  const hasImg = !!file?.uri;
  return (
    <View
      style={[styles.pickBox, { borderColor: border, backgroundColor: muted }]}
    >
      <Pressable
        onPress={onPick}
        android_ripple={{ color: "rgba(0,0,0,0.08)" }}
        accessibilityRole="button"
        accessibilityLabel={hasImg ? "Đổi ảnh" : "Chọn ảnh"}
        accessibilityHint="Nhấn để chọn ảnh từ thư viện"
        style={({ pressed }) => [{ opacity: pressed ? 0.96 : 1 }]}
      >
        <View
          style={[sx.area, { borderColor: border, backgroundColor: muted }]}
        >
          {hasImg ? (
            <>
              <XImage
                uri={file.uri}
                contentFit="cover"
                style={sx.img}
                transition={100}
                recyclingKey={file.uri}
              />
              <View style={sx.overlay}>
                <MaterialIcons name="photo-camera" size={18} color="#fff" />
                <Text style={sx.overlayText}>Đổi ảnh</Text>
              </View>
            </>
          ) : (
            <View style={sx.placeholder}>
              <MaterialIcons name="image" size={28} color={textSecondary} />
              <Text style={[sx.title, { color: textSecondary }]}>
                Chạm để chọn ảnh
              </Text>
              <Text
                style={[
                  sx.hint,
                  { color: textSecondary, opacity: 0.8, textAlign: "center" },
                ]}
              >
                Hỗ trợ JPG/PNG, tối đa 10MB
              </Text>
            </View>
          )}
        </View>
      </Pressable>

      <Text style={{ textAlign: "center", marginTop: 6, color: textSecondary }}>
        {label}
      </Text>

      <Pressable
        onPress={onPick}
        style={({ pressed }) => [
          styles.btn,
          styles.btnTiny,
          pressed && { opacity: 0.9 },
        ]}
      >
        <Text style={[styles.btnText, { color: textSecondary }]}>Chọn ảnh</Text>
      </Pressable>
    </View>
  );
}

const sx = StyleSheet.create({
  area: {
    width: "100%",
    height: 120,
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1.5,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  img: { width: "100%", height: "100%" },
  overlay: {
    position: "absolute",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.25)",
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
  },
  overlayText: { color: "#fff", fontWeight: "600", marginLeft: 6 },
  placeholder: { alignItems: "center", gap: 6 },
  title: { fontSize: 14, fontWeight: "600" },
  hint: { fontSize: 12 },
});

function PreviewBox({
  uri,
  label,
  border,
  muted,
  textColor = "#444",
  onPress,
}) {
  return (
    <View style={[styles.pickBox, { borderColor: border }]}>
      {uri ? (
        <Pressable
          onPress={onPress}
          disabled={!onPress}
          style={({ pressed }) => [{ opacity: pressed ? 0.96 : 1 }]}
        >
          <XImage
            uri={uri?.replace(/\\/g, "/")}
            contentFit="contain"
            style={{ width: "100%", height: 120, borderRadius: 8 }}
            transition={150}
            recyclingKey={uri}
          />
        </Pressable>
      ) : (
        <View
          style={{
            width: "100%",
            height: 120,
            borderRadius: 8,
            backgroundColor: muted,
          }}
        />
      )}
      <Text style={{ textAlign: "center", marginTop: 6, color: textColor }}>
        {label}
      </Text>
    </View>
  );
}

function StatusChip({ status }) {
  const map = {
    unverified: { label: "Chưa xác nhận", bg: "#9aa0a6" },
    pending: { label: "Chờ xác nhận", bg: "#f6a609" },
    verified: { label: "Đã xác nhận", bg: "#16a34a" },
    rejected: { label: "Bị từ chối", bg: "#e11d48" },
  };
  const cur = map[status] || map.unverified;
  return (
    <View
      style={{
        backgroundColor: cur.bg,
        borderRadius: 10,
        paddingHorizontal: 8,
        paddingVertical: 2,
      }}
    >
      <Text style={{ color: "#fff", fontSize: 12 }}>{cur.label}</Text>
    </View>
  );
}

function mapGender(g) {
  if (g === "male") return "Nam";
  if (g === "female") return "Nữ";
  if (g === "other") return "Khác";
  return "—";
}

/* ======= Styles ======= */
const AVATAR_SIZE = 96;

const styles = StyleSheet.create({
  // header
  headerWrap: {
    borderBottomWidth: 1,
  },
  cover: {
    width: "100%",
    aspectRatio: 16 / 6,
    position: "relative",
  },
  coverImg: { width: "100%", height: "100%" },
  coverBtn: {
    position: "absolute",
    right: 10,
    bottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  headerBottom: {
    alignItems: "center",
    paddingTop: 0,
    paddingBottom: 12,
  },

  // avatar stack (button không bị che)
  avatarStack: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    marginTop: -AVATAR_SIZE / 2,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarWrap: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 3,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  headerAvatar: {
    width: AVATAR_SIZE - 4,
    height: AVATAR_SIZE - 4,
    borderRadius: (AVATAR_SIZE - 4) / 2,
  },
  avatarCam: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
    borderWidth: 2, // viền để tách khỏi avatar
  },
  headerName: { fontSize: 20, fontWeight: "800", marginTop: 8 },

  // card
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    gap: 8,
  },
  cardTitle: { fontSize: 16, fontWeight: "800", marginBottom: 8 },

  // common
  label: { fontSize: 13, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.select({ ios: 12, android: 10 }),
    fontSize: 16,
  },
  subTitle: { fontSize: 16, fontWeight: "700", marginTop: 8, marginBottom: 6 },
  pickBox: {
    flex: 1,
    minWidth: 150,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    gap: 6,
  },
  btn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  btnTiny: { paddingVertical: 8 },
  btnText: { fontWeight: "700" },
  btnTextOnly: { backgroundColor: "transparent" },
  btnOutline: { borderWidth: 1 },
  btnTextWhite: { color: "#fff", fontWeight: "700" },
  selectBox: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: "center",
  },
  errText: { color: "#e11d48", marginTop: 4, fontSize: 12 },

  // modal (sheet & center)
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  modalBackdropCenter: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
  },
  previewCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
  },
  modalBtn: { paddingHorizontal: 6, paddingVertical: 6 },
  modalBtnText: { fontWeight: "700", color: "#111" },
  modalTitle: { fontWeight: "700", fontSize: 16 },
});
