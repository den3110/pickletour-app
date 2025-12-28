// app/(tabs)/profile/index.jsx
// ✨ NEW LAYOUT v4 - ULTRA PERFORMANCE:
// - NO HEIGHT ANIMATION (Zero Layout Thrashing)
// - Dùng TranslateY cho Header (GPU Accelerated)
// - Counter-Translation cho Top Bar để dính stick
// - Avatar ẩn hiện mượt mà

import DateTimePicker from "@react-native-community/datetimepicker";
import { Picker } from "@react-native-picker/picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Image as ExpoImage, Image } from "expo-image";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
  Switch,
  DeviceEventEmitter,
  Dimensions,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  interpolate,
  Extrapolation,
  FadeIn,
} from "react-native-reanimated";
import ImageView from "react-native-image-viewing";
import { Feather } from "@expo/vector-icons";
import { useDispatch, useSelector } from "react-redux";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { logout as logoutAction } from "@/slices/authSlice";
import {
  useUploadRealAvatarMutation,
  useUploadCccdMutation,
} from "@/slices/uploadApiSlice";
import {
  useDeleteMeMutation,
  useGetProfileQuery,
  useLogoutMutation,
  useUpdateUserMutation,
} from "@/slices/usersApiSlice";
import * as SecureStore from "expo-secure-store";
import { useUnregisterPushTokenMutation } from "@/slices/pushApiSlice";
import { normalizeUrl } from "@/utils/normalizeUri";
import CccdQrModal from "@/components/CccdQrModal";
import { DEVICE_ID_KEY } from "@/hooks/useExpoPushToken";
import apiSlice from "@/slices/apiSlice";
import { useTheme } from "@react-navigation/native";

const { SaveFormat } = ImageManipulator;

/* ---------- Config ---------- */
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const PREF_THEME_KEY = "PREF_THEME";
const PREF_PUSH_ENABLED = "PREF_PUSH_ENABLED";

// ✨ CONFIG CHIỀU CAO (✅ FIX: cover không quá to)
const HEADER_MAX_HEIGHT = 250; // ✅ giảm từ 280
const HEADER_MIN_HEIGHT = 96;
const HEADER_SCROLL_DISTANCE = HEADER_MAX_HEIGHT - HEADER_MIN_HEIGHT;

// ✅ FIX: đẩy profile content lên để nickname không bị cắt (đặc biệt máy notch/insets lớn)
const PROFILE_TOP_OFFSET = 44; // trước đây +50

/* ---------- Data ---------- */
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

const GENDER_OPTIONS = [
  { value: "", label: "-- Chọn giới tính --" },
  { value: "male", label: "Nam" },
  { value: "female", label: "Nữ" },
  { value: "other", label: "Khác" },
];

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

const TABS = [
  { key: "home", label: "Tổng quan", icon: "home" },
  { key: "profile", label: "Hồ sơ", icon: "user" },
  { key: "verify", label: "Xác minh", icon: "shield" },
  { key: "settings", label: "Cài đặt", icon: "settings" },
];

/* ===== Helpers ===== */
function isRemoteUri(uri) {
  return /^https?:\/\//i.test(String(uri || ""));
}

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
  const finalUri = normalizeUrl(safeUri);
  return (
    <ExpoImage
      source={finalUri ? { uri: finalUri } : undefined}
      style={style}
      contentFit={contentFit}
      cachePolicy={isRemote ? cacheRemote : "none"}
      transition={isRemote ? transition : 0}
      recyclingKey={recyclingKey || finalUri || Math.random().toString(36)}
    />
  );
}

async function ensureUnderLimit(uri, maxBytes = MAX_FILE_SIZE) {
  const info = await FileSystem.getInfoAsync(uri, { size: true });
  if (!info.exists || info.size <= maxBytes) return uri;
  const res = await ImageManipulator.manipulateAsync(uri, [], {
    compress: 0.8,
    format: SaveFormat.JPEG,
  });
  return res.uri;
}

async function pickImage(maxBytes = MAX_FILE_SIZE) {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 1,
  });
  if (res.canceled) return null;
  const asset = res.assets[0];
  let uri = asset.uri;
  const origName = asset.fileName || "image";
  const mime = asset.mimeType || "image/jpeg";
  if (/heic|heif/i.test(mime) || /\.(heic|heif)$/i.test(origName)) {
    const out = await ImageManipulator.manipulateAsync(uri, [], {
      compress: 0.9,
      format: SaveFormat.JPEG,
    });
    uri = out.uri;
  }
  uri = await ensureUnderLimit(uri, maxBytes);
  const sizeInfo = await FileSystem.getInfoAsync(uri, { size: true });
  if (typeof sizeInfo.size === "number" && sizeInfo.size > maxBytes) {
    Alert.alert("Ảnh quá lớn", "Ảnh không được vượt quá 10MB.");
    return null;
  }
  let name = origName
    .replace(/\.(heic|heif)$/i, ".jpg")
    .replace(/[^\w\-.]+/g, "_");
  if (!/\.(jpe?g|png|webp)$/i.test(name)) name = `${name}.jpg`;
  const type = /\.png$/i.test(name)
    ? "image/png"
    : /\.webp$/i.test(name)
    ? "image/webp"
    : "image/jpeg";
  return { uri, name, type, size: sizeInfo.size };
}

const yyyyMMdd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;

function dmyToIso(s) {
  if (!s) return "";
  s = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : s;
}

const mapGender = (g) =>
  ({ male: "Nam", female: "Nữ", other: "Khác" }[g] || "—");

const fmtScore = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0.00";
  return n.toFixed(2);
};

/* ---------- Theme ---------- */
function useTokens() {
  const navTheme = useTheme?.() || {};
  const scheme = useColorScheme?.() || "light";
  const dark =
    typeof navTheme.dark === "boolean" ? navTheme.dark : scheme === "dark";
  return {
    dark,
    headerGradient: dark
      ? ["#0f0f23", "#1a1a3e", "#2d1b69"]
      : ["#667eea", "#764ba2"],
    bg: dark ? "#09090b" : "#f4f4f5",
    surface: dark ? "#18181b" : "#ffffff",
    surfaceAlt: dark ? "#27272a" : "#f4f4f5",
    text: dark ? "#fafafa" : "#09090b",
    textSecondary: dark ? "#a1a1aa" : "#71717a",
    textMuted: dark ? "#71717a" : "#a1a1aa",
    accent: "#8b5cf6",
    accentLight: dark ? "rgba(139,92,246,0.2)" : "rgba(139,92,246,0.12)",
    border: dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)",
    success: "#22c55e",
    warning: "#f59e0b",
    error: "#ef4444",
  };
}

/* ==================== MAIN COMPONENT ==================== */
export default function ProfileScreen({ isBack = false }) {
  const insets = useSafeAreaInsets();
  const t = useTokens();
  const scheme = t.dark ? "dark" : "light";

  const dispatch = useDispatch();
  const userInfo = useSelector((s) => s.auth?.userInfo);
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
  const [uploadCccd, { isLoading: upLoad }] = useUploadCccdMutation();
  const [uploadAvatar, { isLoading: uploadingAvatar }] =
    useUploadRealAvatarMutation();

  // Auth & Init
  const [authReady, setAuthReady] = useState(false);
  useEffect(() => {
    setTimeout(() => setAuthReady(true), 0);
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
    if (status === 401 && !navigatedRef.current) {
      navigatedRef.current = true;
      dispatch(apiSlice.util.resetApiState());
      dispatch(logoutAction());
      setTimeout(() => router.replace("/login"), 100);
    }
  }, [error, dispatch]);

  // Form State
  const [form, setForm] = useState(EMPTY);
  const [touched, setTouched] = useState({});
  const [errors, setErrors] = useState({});
  const initialRef = useRef(EMPTY);
  const [HL, setHL] = useState({
    name: false,
    dob: false,
    gender: false,
    province: false,
    cccd: false,
  });
  const [repInfoOpen, setRepInfoOpen] = useState(false);

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

  const [avatarTemp, setAvatarTemp] = useState(null);
  const [avatarConfirmOpen, setAvatarConfirmOpen] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [coverTemp, setCoverTemp] = useState(null);
  const [coverConfirmOpen, setCoverConfirmOpen] = useState(false);
  const [coverSaving, setCoverSaving] = useState(false);

  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerImages, setViewerImages] = useState([]);
  const [viewerLabels, setViewerLabels] = useState([]);
  const [activeTab, setActiveTab] = useState("home");
  const [refreshing, setRefreshing] = useState(false);

  // Scroll Animation
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  // Action Helpers
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
    setViewerImages(arr);
    setViewerLabels(labels);
    setViewerIndex(which === "back" && frontUrl ? 1 : 0);
    setViewerOpen(true);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

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
    setAvatarTemp(null);
    setAvatarConfirmOpen(false);
    setAvatarSaving(false);
    setCoverTemp(null);
    setCoverConfirmOpen(false);
    setCoverSaving(false);
  }, [user]);

  const validate = (d) => {
    const e = {};
    if (!d.name.trim()) e.name = "Bắt buộc";
    else if (d.name.trim().length < 2) e.name = "Tối thiểu 2 ký tự";
    if (!d.nickname.trim()) e.nickname = "Bắt buộc";
    else if (d.nickname.trim().length < 2) e.nickname = "Tối thiểu 2 ký tự";
    if (!/^0\d{9}$/.test(d.phone.trim())) e.phone = "Sai định dạng";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim()))
      e.email = "Email không hợp lệ";
    if (d.dob) {
      const day = new Date(d.dob);
      if (Number.isNaN(day.getTime())) e.dob = "Không hợp lệ";
      else if (day > new Date()) e.dob = "Không được ở tương lai";
    }
    if (!d.province) e.province = "Bắt buộc";
    if (d.cccd && /^\d+$/.test(d.cccd) && d.cccd.length !== 12)
      e.cccd = "Phải đủ 12 số";
    if (d.password) {
      if (d.password.length < 6) e.password = "Tối thiểu 6 ký tự";
      if (d.password !== d.confirmPassword) e.confirmPassword = "Không khớp";
    }
    return e;
  };

  useEffect(() => setErrors(validate(form)), [form]);

  const isDirty = useMemo(
    () =>
      Object.keys(form).some(
        (k) => k !== "confirmPassword" && form[k] !== initialRef.current[k]
      ),
    [form]
  );
  const isValid = useMemo(() => !Object.keys(errors).length, [errors]);
  const showErr = (f) => touched[f] && !!errors[f];
  const setField = (name, value) => setForm((p) => ({ ...p, [name]: value }));
  const markTouched = (name) => setTouched((t) => ({ ...t, [name]: true }));

  const diff = () => {
    const out = { _id: user?._id };
    for (const k in form)
      if (k !== "confirmPassword" && form[k] !== initialRef.current[k])
        out[k] = form[k];
    return out;
  };

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
    if (Object.keys(errs).length)
      return Alert.alert("Lỗi", "Vui lòng kiểm tra lại.");
    if (!isDirty) return Alert.alert("Thông tin", "Chưa có thay đổi.");
    try {
      await updateProfile(diff()).unwrap();
      await refetch();
      setTouched({});
      Alert.alert("Thành công", "Đã lưu hồ sơ.");
    } catch (err) {
      Alert.alert("Lỗi", err?.data?.message || "Cập nhật thất bại");
    }
  };

  const sendCccd = async () => {
    if (!/^\d{12}$/.test(String(form.cccd || "").trim()))
      return Alert.alert("Thiếu CCCD", "Nhập số CCCD trước.");
    if (!frontImg || !backImg || upLoad) return;
    try {
      await uploadCccd({ front: frontImg, back: backImg }).unwrap();
      setFrontImg(null);
      setBackImg(null);
      await refetch();
      Alert.alert("Thành công", "Đã gửi xác minh.");
    } catch (err) {
      Alert.alert("Lỗi", err?.data?.message || "Upload thất bại");
    }
  };

  const confirmLogout = () => {
    const go = () => router.push("/logout");
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: "Bạn có chắc muốn đăng xuất?",
          options: ["Huỷ", "Đăng xuất"],
          destructiveButtonIndex: 1,
          cancelButtonIndex: 0,
          userInterfaceStyle: scheme,
        },
        (idx) => idx === 1 && go()
      );
    } else {
      Alert.alert("Bạn có chắc muốn đăng xuất?", "Bạn chắc chắn?", [
        { text: "Huỷ", style: "cancel" },
        { text: "Đăng xuất", style: "destructive", onPress: go },
      ]);
    }
  };

  const [delPwModalOpen, setDelPwModalOpen] = useState(false);
  const [delPw, setDelPw] = useState("");
  const [delBusy, setDelBusy] = useState(false);

  const runDelete = async (body) => {
    setDelBusy(true);
    try {
      await deleteMe(body ?? {}).unwrap();
      dispatch(logoutAction());
      router.replace("/login");
      dispatch(apiSlice.util.resetApiState());
      Alert.alert("Đã xoá", "Tài khoản đã được xoá.");
    } catch (e) {
      Alert.alert("Lỗi", e?.data?.message || "Xoá thất bại");
    } finally {
      setDelBusy(false);
      setDelPw("");
      setDelPwModalOpen(false);
    }
  };

  const confirmDelete = () => {
    const title =
      "Bạn có chắc muốn xoá tài khoản vĩnh viễn? Hành động này không thể hoàn tác";
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title,
          options: ["Huỷ", "Xoá vĩnh viễn"],
          destructiveButtonIndex: 1,
          cancelButtonIndex: 0,
          userInterfaceStyle: scheme,
        },
        (idx) => idx === 1 && setDelPwModalOpen(true)
      );
    } else {
      Alert.alert(
        "Bạn có chắc muốn xoá tài khoản vĩnh viễn? Hành động này không thể hoàn tác",
        title,
        [
          { text: "Huỷ", style: "cancel" },
          {
            text: "Xoá vĩnh viễn",
            style: "destructive",
            onPress: () => setDelPwModalOpen(true),
          },
        ]
      );
    }
  };

  const [prefTheme, setPrefTheme] = useState("system");
  const [pushEnabled, setPushEnabled] = useState(true);
  const [themeBusy, setThemeBusy] = useState(false);

  useEffect(() => {
    (async () => {
      setPrefTheme(
        (await SecureStore.getItemAsync(PREF_THEME_KEY)) || "system"
      );
      setPushEnabled(
        ((await SecureStore.getItemAsync(PREF_PUSH_ENABLED)) || "1") === "1"
      );
    })();
  }, []);

  const applyThemePref = async (mode) => {
    setPrefTheme(mode);
    setThemeBusy(true);
    await SecureStore.setItemAsync(PREF_THEME_KEY, mode);
    const sub = DeviceEventEmitter.addListener("theme:applied", () => {
      setThemeBusy(false);
      sub.remove();
    });
    DeviceEventEmitter.emit("theme:changed", mode);
  };

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("theme:changed", setPrefTheme);
    return () => sub.remove();
  }, []);

  const togglePush = async (v) => {
    setPushEnabled(v);
    await SecureStore.setItemAsync(PREF_PUSH_ENABLED, v ? "1" : "0");
    if (!v) {
      const deviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
      if (deviceId)
        try {
          await unregisterDeviceToken({ deviceId }).unwrap();
        } catch {}
    }
  };

  const status = user?.cccdStatus || "unverified";
  const showUpload = status === "unverified" || status === "rejected";
  const isAdmin = !!(user?.isAdmin || user?.role === "admin");
  const avatarUrl = normalizeUrl(form.avatar) || "";
  const coverUrl = normalizeUrl(form.cover) || "";

  // ===== ANIMATED STYLES (PURE TRANSFORM) =====

  // 1. Header Container: Dùng TranslateY để "kéo" header lên thay vì giảm height
  const headerStyle = useAnimatedStyle(() => {
    const translateY = interpolate(
      scrollY.value,
      [0, HEADER_SCROLL_DISTANCE],
      [0, -HEADER_SCROLL_DISTANCE],
      Extrapolation.CLAMP
    );
    return {
      height: HEADER_MAX_HEIGHT,
      transform: [{ translateY }],
    };
  });

  // 2. Counter-Translation cho Top Bar để sticky
  const stickyTopBarStyle = useAnimatedStyle(() => {
    const translateY = interpolate(
      scrollY.value,
      [0, HEADER_SCROLL_DISTANCE],
      [0, HEADER_SCROLL_DISTANCE],
      Extrapolation.CLAMP
    );
    return { transform: [{ translateY }] };
  });

  // 3. Avatar: Mờ dần và ẩn đi khi scroll
  const avatarContainerStyle = useAnimatedStyle(() => {
    const scale = interpolate(
      scrollY.value,
      [0, HEADER_SCROLL_DISTANCE],
      [1, 0.7],
      Extrapolation.CLAMP
    );
    const opacity = interpolate(
      scrollY.value,
      [HEADER_SCROLL_DISTANCE * 0.5, HEADER_SCROLL_DISTANCE * 0.9],
      [1, 0],
      Extrapolation.CLAMP
    );

    return {
      opacity,
      transform: [{ scale }],
      pointerEvents: opacity < 0.1 ? "none" : "auto",
    };
  });

  // 4. Name Area: Cũng mờ đi
  const nameStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [0, HEADER_SCROLL_DISTANCE * 0.6],
      [1, 0],
      Extrapolation.CLAMP
    );
    return { opacity };
  });

  // 5. Mini Name: Hiện ra trên Top Bar
  const miniNameStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [HEADER_SCROLL_DISTANCE * 0.8, HEADER_SCROLL_DISTANCE],
      [0, 1],
      Extrapolation.CLAMP
    );
    return { opacity };
  });

  // 6. ✅ NEW: Tên giữa ảnh bìa (hiện khi avatar đã ẩn)
  const coverCenterNameStyle = useAnimatedStyle(() => {
    // dùng đúng logic avatarOpacity (đảo ngược lại)
    const avatarOpacity = interpolate(
      scrollY.value,
      [HEADER_SCROLL_DISTANCE * 0.5, HEADER_SCROLL_DISTANCE * 0.9],
      [1, 0],
      Extrapolation.CLAMP
    );

    const opacity = Math.max(0, Math.min(1, 1 - avatarOpacity));

    const scale = interpolate(
      scrollY.value,
      [HEADER_SCROLL_DISTANCE * 0.5, HEADER_SCROLL_DISTANCE],
      [0.98, 1],
      Extrapolation.CLAMP
    );

    return {
      opacity,
      transform: [{ scale }],
    };
  });

  // ===== SKELETON =====
  // ===== SKELETON (✅ FIX: đúng layout như màn thật) =====
  if (fetching || !user) {
    return (
      <View style={[styles.container, { backgroundColor: t.bg }]}>
        {/* Header skeleton (absolute giống header thật) */}
        <View style={[styles.skelHeader, { height: HEADER_MAX_HEIGHT }]}>
          <LinearGradient
            colors={t.headerGradient}
            style={StyleSheet.absoluteFill}
          />

          {/* Top row skeleton */}
          <View style={[styles.skelTopRow, { paddingTop: insets.top }]}>
            <View style={styles.skelCircle} />
            <View style={styles.skelMiniLine} />
            <View style={styles.skelCircle} />
          </View>

          {/* Profile area skeleton */}
          <View
            style={[
              styles.skelProfileArea,
              { paddingTop: insets.top + 50 }, // ✅ né statusbar + topRow
            ]}
          >
            <View style={styles.skelAvatar} />
            <View style={[styles.skelNameLine, { width: 180 }]} />
            <View style={[styles.skelNameLine, { width: 120 }]} />
            <View style={styles.skelChip} />
          </View>
        </View>

        {/* Body skeleton (bắt đầu sau headerHeight giống ScrollView contentContainerStyle) */}
        <View style={{ flex: 1, paddingTop: HEADER_MAX_HEIGHT }}>
          <View style={{ padding: 16 }}>
            {/* Card 1 */}
            <View
              style={[
                styles.skelCard,
                { backgroundColor: t.surface, borderColor: t.border },
              ]}
            >
              <View
                style={[
                  styles.skelLine,
                  { backgroundColor: t.surfaceAlt, width: "70%" },
                ]}
              />
              <View
                style={[
                  styles.skelLine,
                  { backgroundColor: t.surfaceAlt, width: "55%" },
                ]}
              />
              <View
                style={[
                  styles.skelLine,
                  {
                    backgroundColor: t.surfaceAlt,
                    width: "85%",
                    marginBottom: 0,
                  },
                ]}
              />
            </View>

            {/* Card 2 */}
            <View
              style={[
                styles.skelCard,
                {
                  backgroundColor: t.surface,
                  borderColor: t.border,
                  marginTop: 12,
                },
              ]}
            >
              <View
                style={[
                  styles.skelLine,
                  { backgroundColor: t.surfaceAlt, width: "60%" },
                ]}
              />
              <View
                style={[
                  styles.skelLine,
                  { backgroundColor: t.surfaceAlt, width: "90%" },
                ]}
              />
              <View
                style={[
                  styles.skelLine,
                  {
                    backgroundColor: t.surfaceAlt,
                    width: "80%",
                    marginBottom: 0,
                  },
                ]}
              />
            </View>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: t.bg }]}>
      {/* ===== STICKY HEADER (FIXED HEIGHT, MOVES UP) ===== */}
      <Animated.View style={[styles.header, headerStyle]}>
        <LinearGradient
          colors={t.headerGradient}
          style={StyleSheet.absoluteFill}
        />
        <Pressable onPress={openCoverViewer} style={StyleSheet.absoluteFill}>
          <XImage
            uri={
              coverUrl ||
              "https://images.unsplash.com/photo-1557683316-973673baf926?w=800"
            }
            style={[StyleSheet.absoluteFill, { opacity: 0.25 }]}
          />
        </Pressable>

        {/* TOP BAR: Dùng counter-translation để sticky */}
        <Animated.View
          style={[styles.topRow, { paddingTop: insets.top }, stickyTopBarStyle]}
        >
          {isBack ? (
            <Pressable
              onPress={() =>
                router.canGoBack() ? router.back() : router.replace("/")
              }
              style={styles.headerBtn}
            >
              <Feather name="chevron-left" size={20} color="#fff" />
            </Pressable>
          ) : (
            <View style={{ width: 40 }} />
          )}

          <Animated.Text
            style={[styles.miniName, miniNameStyle, { color: "#fff" }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {user.name}
          </Animated.Text>

          <Pressable
            onPress={async () => {
              const f = await pickImage();
              if (f) {
                setCoverTemp(f);
                setCoverConfirmOpen(true);
              }
            }}
            style={styles.headerBtn}
          >
            <Feather name="image" size={18} color="#fff" />
          </Pressable>
        </Animated.View>
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            {
              paddingTop: insets.top + 140, // né top bar
              alignItems: "center",
              justifyContent: "center",
            },
            coverCenterNameStyle,
          ]}
        >
          <View style={styles.coverCenterNamePill}>
            <Text
              style={styles.coverCenterNameText}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {user?.name || "Không có tên"}
            </Text>
          </View>
        </Animated.View>
        {/* Content bên trong Header */}
        <View style={[styles.profileArea, { paddingTop: 0 }]}>
          <Animated.View style={[styles.avatarContainer, avatarContainerStyle]}>
            <Pressable onPress={openAvatarViewer} style={styles.avatarInner}>
              <XImage
                uri={
                  avatarUrl ||
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(
                    user.name || "U"
                  )}&background=8b5cf6&color=fff`
                }
                style={styles.avatarImg}
              />
            </Pressable>
            <Pressable
              onPress={async () => {
                const f = await pickImage();
                if (f) {
                  setAvatarTemp(f);
                  setAvatarConfirmOpen(true);
                }
              }}
              style={[styles.avatarEditBtn, { backgroundColor: t.accent }]}
            >
              <Feather name="camera" size={14} color="#fff" />
            </Pressable>
          </Animated.View>

          <Animated.View style={[styles.nameArea, nameStyle]}>
            {/* ✅ FIX: ép 1 dòng + ellipsize để không bị che/cắt */}
            <Text
              style={styles.userName}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {user.name || "Chưa có tên"}
            </Text>

            {!!user.nickname && (
              <Text
                style={styles.userHandle}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                @{user.nickname}
              </Text>
            )}

            <StatusChip status={status} />
          </Animated.View>
        </View>
      </Animated.View>

      {/* ===== SCROLL CONTENT ===== */}
      <Animated.ScrollView
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingTop: HEADER_MAX_HEIGHT,
          paddingBottom: insets.bottom + 80,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={t.accent}
            progressViewOffset={HEADER_MAX_HEIGHT}
          />
        }
      >
        {/* ===== TAB BAR ===== */}
        <View style={[styles.tabBarContainer, { backgroundColor: t.bg }]}>
          <View
            style={[
              styles.tabBar,
              { backgroundColor: t.surface, borderColor: t.border },
            ]}
          >
            {TABS.map((tab) => (
              <Pressable
                key={tab.key}
                onPress={() => {
                  setActiveTab(tab.key);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                style={[
                  styles.tabItem,
                  activeTab === tab.key && [
                    styles.tabItemActive,
                    { backgroundColor: t.accent },
                  ],
                ]}
              >
                <Feather
                  name={tab.icon}
                  size={18}
                  color={activeTab === tab.key ? "#fff" : t.textSecondary}
                />
                <Text
                  style={[
                    styles.tabLabel,
                    { color: activeTab === tab.key ? "#fff" : t.textSecondary },
                  ]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* ===== TAB CONTENT ===== */}
        <View style={styles.content}>
          <Animated.View
            key={activeTab}
            entering={FadeIn.duration(300)}
            style={{ gap: 16 }}
          >
            {activeTab === "home" && (
              <>
                <View style={styles.bentoGrid}>
                  <BentoCard
                    gradient={["#6366f1", "#8b5cf6"]}
                    icon="award"
                    value={user.stats?.tournaments || 0}
                    label="Giải đấu"
                  />
                  {/* ✅ BỎ LIVE -> thay bằng Uy tín */}
                  <BentoCard
                    gradient={["#f59e0b", "#f97316"]}
                    icon="shield"
                    value={user.stats?.reputation || 0}
                    label="Uy tín"
                    onInfoPress={() => setRepInfoOpen(true)}
                  />
                </View>
                {/* ✅ Đổi “Điểm xếp hạng” -> “điểm đôi/điểm đơn” */}
                <BentoCardWide
                  gradient={["#14b8a6", "#06b6d4"]}
                  icon="trending-up"
                  value={`${fmtScore(user.ratingDouble)}/${fmtScore(
                    user.ratingSingle
                  )}`}
                  label="Điểm đôi/điểm đơn"
                />
                <Card title="Thông tin" t={t}>
                  <InfoRow icon="mail" label="Email" value={user.email} t={t} />
                  <InfoRow
                    icon="phone"
                    label="Điện thoại"
                    value={user.phone}
                    t={t}
                  />
                  <InfoRow
                    icon="users"
                    label="Giới tính"
                    value={mapGender(user.gender)}
                    t={t}
                  />
                  <InfoRow
                    icon="calendar"
                    label="Ngày sinh"
                    value={user.dob?.slice(0, 10)}
                    t={t}
                  />
                  <InfoRow
                    icon="map-pin"
                    label="Tỉnh/TP"
                    value={user.province}
                    t={t}
                    last
                  />
                </Card>
                {isAdmin && (
                  <Card title="Quản trị viên" t={t}>
                    <Text style={{ color: t.textSecondary, marginBottom: 12 }}>
                      Bạn có quyền quản trị hệ thống.
                    </Text>
                    <GradientBtn
                      title="Vào trang quản trị"
                      onPress={() => router.push("/admin/home")}
                    />
                  </Card>
                )}
              </>
            )}

            {activeTab === "profile" && (
              <Card title="Chỉnh sửa hồ sơ" t={t}>
                <FormField
                  label="Họ và tên"
                  value={form.name}
                  onChange={(v) => setField("name", v)}
                  onBlur={() => markTouched("name")}
                  error={showErr("name") ? errors.name : ""}
                  icon="user"
                  highlighted={HL.name}
                  t={t}
                />
                <FormField
                  label="Biệt danh"
                  value={form.nickname}
                  onChange={(v) => setField("nickname", v)}
                  onBlur={() => markTouched("nickname")}
                  error={showErr("nickname") ? errors.nickname : ""}
                  icon="at-sign"
                  t={t}
                />
                <FormField
                  label="Số điện thoại"
                  value={form.phone}
                  onChange={(v) => setField("phone", v)}
                  onBlur={() => markTouched("phone")}
                  error={showErr("phone") ? errors.phone : ""}
                  icon="phone"
                  keyboardType="phone-pad"
                  t={t}
                />
                <FormField
                  label="Email"
                  value={form.email}
                  onChange={(v) => setField("email", v)}
                  onBlur={() => markTouched("email")}
                  error={showErr("email") ? errors.email : ""}
                  icon="mail"
                  keyboardType="email-address"
                  t={t}
                />
                <FormSelect
                  label="Giới tính"
                  value={form.gender}
                  options={GENDER_OPTIONS}
                  onChange={(v) => {
                    setField("gender", v);
                    markTouched("gender");
                  }}
                  icon="users"
                  highlighted={HL.gender}
                  t={t}
                />
                <FormDatePicker
                  label="Ngày sinh"
                  value={form.dob}
                  onChange={(v) => {
                    setField("dob", v);
                    markTouched("dob");
                  }}
                  icon="calendar"
                  highlighted={HL.dob}
                  t={t}
                />
                <FormSelect
                  label="Tỉnh/TP"
                  value={form.province}
                  options={[
                    { value: "", label: "-- Chọn --" },
                    ...PROVINCES.map((p) => ({ value: p, label: p })),
                  ]}
                  onChange={(v) => {
                    setField("province", v);
                    markTouched("province");
                  }}
                  icon="map-pin"
                  highlighted={HL.province}
                  t={t}
                />
                <Text style={[styles.subTitle, { color: t.text }]}>
                  Đổi mật khẩu
                </Text>
                <FormField
                  label="Mật khẩu mới"
                  value={form.password}
                  onChange={(v) => setField("password", v)}
                  onBlur={() => markTouched("password")}
                  error={showErr("password") ? errors.password : ""}
                  icon="lock"
                  secureTextEntry
                  placeholder="Để trống nếu không đổi"
                  t={t}
                />
                <FormField
                  label="Xác nhận"
                  value={form.confirmPassword}
                  onChange={(v) => setField("confirmPassword", v)}
                  onBlur={() => markTouched("confirmPassword")}
                  error={
                    showErr("confirmPassword") ? errors.confirmPassword : ""
                  }
                  icon="lock"
                  secureTextEntry
                  t={t}
                />
                <GradientBtn
                  title={isLoading ? "Đang lưu..." : "Lưu thay đổi"}
                  onPress={submit}
                  disabled={!isDirty || !isValid || isLoading}
                  loading={isLoading}
                />
              </Card>
            )}

            {activeTab === "verify" && (
              <Card title="Xác minh CCCD" t={t}>
                <FormField
                  label="Số CCCD (12 số)"
                  value={form.cccd}
                  onChange={(v) => setField("cccd", v)}
                  onBlur={() => markTouched("cccd")}
                  error={showErr("cccd") ? errors.cccd : ""}
                  icon="credit-card"
                  keyboardType="number-pad"
                  maxLength={12}
                  highlighted={HL.cccd}
                  t={t}
                />
                <Pressable
                  onPress={() => setQrOpen(true)}
                  style={[styles.qrBtn, { backgroundColor: t.accentLight }]}
                >
                  <Feather name="maximize" size={18} color={t.accent} />
                  <Text style={[styles.qrBtnText, { color: t.accent }]}>
                    Quét QR trên CCCD
                  </Text>
                </Pressable>
                {showUpload ? (
                  <>
                    <Text
                      style={[styles.uploadLabel, { color: t.textSecondary }]}
                    >
                      Tải ảnh CCCD
                    </Text>
                    <View style={styles.cccdRow}>
                      <ImagePickerBox
                        label="Mặt trước"
                        file={frontImg}
                        onPick={async () => setFrontImg(await pickImage())}
                        t={t}
                      />
                      <ImagePickerBox
                        label="Mặt sau"
                        file={backImg}
                        onPick={async () => setBackImg(await pickImage())}
                        t={t}
                      />
                    </View>
                    <GradientBtn
                      title={upLoad ? "Đang gửi..." : "Gửi xác minh"}
                      onPress={sendCccd}
                      disabled={!allowSendCccd || upLoad}
                      loading={upLoad}
                    />
                    {!/^\d{12}$/.test(String(form.cccd || "").trim()) && (
                      <Text style={styles.warningText}>
                        ⚠️ Nhập số CCCD trước khi gửi
                      </Text>
                    )}
                  </>
                ) : (
                  <>
                    <Text
                      style={[styles.uploadLabel, { color: t.textSecondary }]}
                    >
                      Ảnh đã gửi
                    </Text>
                    <View style={styles.cccdRow}>
                      <CccdPreview
                        uri={user?.cccdImages?.front}
                        label="Mặt trước"
                        onPress={() => openCccdViewer("front")}
                        t={t}
                      />
                      <CccdPreview
                        uri={user?.cccdImages?.back}
                        label="Mặt sau"
                        onPress={() => openCccdViewer("back")}
                        t={t}
                      />
                    </View>
                    <View
                      style={[
                        styles.statusBox,
                        {
                          backgroundColor:
                            status === "verified"
                              ? "rgba(34,197,94,0.1)"
                              : status === "pending"
                              ? "rgba(245,158,11,0.1)"
                              : "rgba(239,68,68,0.1)",
                        },
                      ]}
                    >
                      <Feather
                        name={
                          status === "verified"
                            ? "check-circle"
                            : status === "pending"
                            ? "clock"
                            : "x-circle"
                        }
                        size={20}
                        color={
                          status === "verified"
                            ? "#22c55e"
                            : status === "pending"
                            ? "#f59e0b"
                            : "#ef4444"
                        }
                      />
                      <Text
                        style={{
                          color:
                            status === "verified"
                              ? "#22c55e"
                              : status === "pending"
                              ? "#f59e0b"
                              : "#ef4444",
                          fontWeight: "600",
                        }}
                      >
                        {status === "verified"
                          ? "Đã xác minh"
                          : status === "pending"
                          ? "Đang chờ duyệt"
                          : "Bị từ chối"}
                      </Text>
                    </View>
                  </>
                )}
              </Card>
            )}

            {activeTab === "settings" && (
              <>
                <Card title="Giao diện" t={t}>
                  {themeBusy && (
                    <ActivityIndicator
                      color={t.accent}
                      style={{ marginBottom: 12 }}
                    />
                  )}
                  <ThemeOption
                    label="Theo hệ thống"
                    selected={prefTheme === "system"}
                    onPress={() => applyThemePref("system")}
                    icon="smartphone"
                    t={t}
                  />
                  <ThemeOption
                    label="Sáng"
                    selected={prefTheme === "light"}
                    onPress={() => applyThemePref("light")}
                    icon="sun"
                    t={t}
                  />
                  <ThemeOption
                    label="Tối"
                    selected={prefTheme === "dark"}
                    onPress={() => applyThemePref("dark")}
                    icon="moon"
                    t={t}
                    last
                  />
                </Card>
                <Card title="Thông báo" t={t}>
                  <View style={styles.switchRow}>
                    <View style={styles.switchLeft}>
                      <View
                        style={[
                          styles.switchIcon,
                          { backgroundColor: t.accentLight },
                        ]}
                      >
                        <Feather name="bell" size={16} color={t.accent} />
                      </View>
                      <Text style={[styles.switchLabel, { color: t.text }]}>
                        Thông báo đẩy
                      </Text>
                    </View>
                    <Switch
                      value={pushEnabled}
                      onValueChange={togglePush}
                      trackColor={{ false: t.border, true: t.accent }}
                      thumbColor="#fff"
                    />
                  </View>
                </Card>
                <Card title="Tài khoản" t={t}>
                  <View style={styles.dangerRow}>
                    <DangerBtn
                      title="Đăng xuất"
                      icon="log-out"
                      onPress={confirmLogout}
                      color={t.warning}
                    />
                    <DangerBtn
                      title="Xoá tài khoản"
                      icon="trash-2"
                      onPress={confirmDelete}
                      color={t.error}
                    />
                  </View>
                </Card>
              </>
            )}
          </Animated.View>
        </View>
      </Animated.ScrollView>

      {/* ===== MODALS ===== */}
      <CccdQrModal
        visible={qrOpen}
        onClose={() => setQrOpen(false)}
        onResult={(r) => {
          setQrOpen(false);
          onScanResult(r);
        }}
      />

      <Modal visible={avatarConfirmOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: t.surface }]}>
            <Text style={[styles.modalTitle, { color: t.text }]}>
              Đổi ảnh đại diện
            </Text>
            {!!avatarTemp?.uri && (
              <Image
                source={{ uri: avatarTemp.uri }}
                style={styles.modalAvatar}
              />
            )}
            <View style={styles.modalBtns}>
              <Pressable
                onPress={() => {
                  setAvatarConfirmOpen(false);
                  setAvatarTemp(null);
                }}
                style={[styles.modalBtn, { borderColor: t.border }]}
                disabled={avatarSaving}
              >
                <Text style={{ color: t.text, fontWeight: "600" }}>Huỷ</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  if (!avatarTemp) return;
                  setAvatarSaving(true);
                  try {
                    const up = await uploadAvatar(avatarTemp).unwrap();
                    const url = up?.url || up?.data?.url;
                    if (!url) throw new Error("Không nhận được URL");
                    await updateProfile({
                      _id: user?._id,
                      avatar: url,
                    }).unwrap();
                    setForm((p) => ({ ...p, avatar: url }));
                    setAvatarConfirmOpen(false);
                    setAvatarTemp(null);
                    await refetch();
                    Alert.alert("Thành công", "Đã cập nhật ảnh.");
                  } catch (e) {
                    Alert.alert("Lỗi", e?.message || "Thất bại");
                  } finally {
                    setAvatarSaving(false);
                  }
                }}
                style={[styles.modalBtnPrimary, { backgroundColor: t.accent }]}
                disabled={avatarSaving}
              >
                {avatarSaving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: "#fff", fontWeight: "700" }}>
                    Xác nhận
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={coverConfirmOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: t.surface }]}>
            <Text style={[styles.modalTitle, { color: t.text }]}>
              Đổi ảnh bìa
            </Text>
            {!!coverTemp?.uri && (
              <Image
                source={{ uri: coverTemp.uri }}
                style={styles.modalCover}
              />
            )}
            <View style={styles.modalBtns}>
              <Pressable
                onPress={() => {
                  setCoverConfirmOpen(false);
                  setCoverTemp(null);
                }}
                style={[styles.modalBtn, { borderColor: t.border }]}
                disabled={coverSaving}
              >
                <Text style={{ color: t.text, fontWeight: "600" }}>Huỷ</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  if (!coverTemp) return;
                  setCoverSaving(true);
                  try {
                    const up = await uploadAvatar(coverTemp).unwrap();
                    const url = up?.url || up?.data?.url;
                    if (!url) throw new Error("Không nhận được URL");
                    await updateProfile({
                      _id: user?._id,
                      cover: url,
                    }).unwrap();
                    setForm((p) => ({ ...p, cover: url }));
                    setCoverConfirmOpen(false);
                    setCoverTemp(null);
                    await refetch();
                    Alert.alert("Thành công", "Đã cập nhật ảnh bìa.");
                  } catch (e) {
                    Alert.alert("Lỗi", e?.message || "Thất bại");
                  } finally {
                    setCoverSaving(false);
                  }
                }}
                style={[styles.modalBtnPrimary, { backgroundColor: t.accent }]}
                disabled={coverSaving}
              >
                {coverSaving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: "#fff", fontWeight: "700" }}>
                    Xác nhận
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={delPwModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: t.surface }]}>
            <View
              style={[
                styles.dangerIcon,
                { backgroundColor: "rgba(239,68,68,0.12)" },
              ]}
            >
              <Feather name="alert-triangle" size={28} color={t.error} />
            </View>
            <Text style={[styles.modalTitle, { color: t.text }]}>
              Xoá tài khoản
            </Text>
            <Text
              style={{
                color: t.textSecondary,
                textAlign: "center",
                marginBottom: 16,
              }}
            >
              Nhập mật khẩu để xác nhận.
            </Text>
            <TextInput
              value={delPw}
              onChangeText={setDelPw}
              secureTextEntry
              placeholder="Mật khẩu"
              placeholderTextColor={t.textMuted}
              style={[
                styles.deleteInput,
                {
                  backgroundColor: t.surfaceAlt,
                  borderColor: t.border,
                  color: t.text,
                },
              ]}
            />
            <View style={styles.modalBtns}>
              <Pressable
                onPress={() => setDelPwModalOpen(false)}
                style={[styles.modalBtn, { borderColor: t.border }]}
                disabled={delBusy}
              >
                <Text style={{ color: t.text, fontWeight: "600" }}>Huỷ</Text>
              </Pressable>
              <Pressable
                onPress={() => runDelete({ password: delPw.trim() })}
                style={[styles.modalBtnPrimary, { backgroundColor: t.error }]}
                disabled={delBusy || !delPw.trim()}
              >
                {delBusy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: "#fff", fontWeight: "700" }}>
                    Xoá vĩnh viễn
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={repInfoOpen} transparent animationType="fade">
        <Pressable
          style={styles.tipOverlay}
          onPress={() => setRepInfoOpen(false)}
        >
          <Pressable
            onPress={() => {}}
            style={[
              styles.tipCard,
              { backgroundColor: t.surface, borderColor: t.border },
            ]}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <View
                style={[styles.tipIcon, { backgroundColor: t.accentLight }]}
              >
                <Feather name="shield" size={18} color={t.accent} />
              </View>
              <Text style={{ color: t.text, fontWeight: "800", fontSize: 16 }}>
                Uy tín là gì?
              </Text>
            </View>

            <Text
              style={{ color: t.textSecondary, marginTop: 10, lineHeight: 18 }}
            >
              Uy tín là thang điểm 0–100. Hiện đang tính theo số giải đã hoàn
              tất: mỗi giải +10 điểm, tối đa 100.
            </Text>

            <Pressable
              onPress={() => setRepInfoOpen(false)}
              style={[styles.tipBtn, { backgroundColor: t.accent }]}
            >
              <Text style={{ color: "#fff", fontWeight: "800" }}>Đã hiểu</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <ImageView
        images={viewerImages}
        imageIndex={viewerIndex}
        visible={viewerOpen}
        onRequestClose={() => setViewerOpen(false)}
        backgroundColor={t.dark ? "#09090b" : "#fafafa"}
      />
    </View>
  );
}

/* ==================== SUB COMPONENTS ==================== */

const StatusChip = ({ status }) => {
  const map = {
    unverified: { label: "Chưa xác minh", bg: "#71717a" },
    pending: { label: "Đang chờ", bg: "#f59e0b" },
    verified: { label: "Đã xác minh", bg: "#22c55e" },
    rejected: { label: "Bị từ chối", bg: "#ef4444" },
  };
  const c = map[status] || map.unverified;
  return (
    <View style={[styles.statusChip, { backgroundColor: c.bg }]}>
      <Text style={styles.statusChipText}>{c.label}</Text>
    </View>
  );
};

const BentoCard = ({ gradient, icon, value, label, onInfoPress }) => (
  <LinearGradient
    colors={gradient}
    style={styles.bentoCard}
    start={{ x: 0, y: 0 }}
    end={{ x: 1, y: 1 }}
  >
    {!!onInfoPress && (
      <Pressable onPress={onInfoPress} hitSlop={12} style={styles.bentoInfoBtn}>
        <Feather name="info" size={18} color="rgba(255,255,255,0.95)" />
      </Pressable>
    )}

    <View style={styles.bentoIcon}>
      <Feather name={icon} size={20} color="rgba(255,255,255,0.9)" />
    </View>

    <Text style={styles.bentoValue}>{value}</Text>
    <Text style={styles.bentoLabel}>{label}</Text>
  </LinearGradient>
);

const BentoCardWide = ({ gradient, icon, value, label }) => (
  <LinearGradient
    colors={gradient}
    style={styles.bentoCardWide}
    start={{ x: 0, y: 0 }}
    end={{ x: 1, y: 0 }}
  >
    <View style={styles.bentoIcon}>
      <Feather name={icon} size={22} color="rgba(255,255,255,0.9)" />
    </View>
    <View style={{ marginLeft: 16 }}>
      <Text style={styles.bentoValue}>{value}</Text>
      <Text style={styles.bentoLabel}>{label}</Text>
    </View>
  </LinearGradient>
);

const Card = ({ title, children, t }) => (
  <View
    style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}
  >
    {title && (
      <Text style={[styles.cardTitle, { color: t.text }]}>{title}</Text>
    )}
    {children}
  </View>
);

const InfoRow = ({ icon, label, value, t, last }) => (
  <View
    style={[
      styles.infoRow,
      !last && { borderBottomWidth: 1, borderBottomColor: t.border },
    ]}
  >
    <View style={styles.infoRowLeft}>
      <Feather name={icon} size={16} color={t.textSecondary} />
      <Text style={{ color: t.textSecondary }}>{label}</Text>
    </View>
    <Text style={{ color: t.text, fontWeight: "600" }}>{value || "—"}</Text>
  </View>
);

const FormField = ({
  label,
  value,
  onChange,
  onBlur,
  error,
  icon,
  keyboardType,
  secureTextEntry,
  placeholder,
  maxLength,
  highlighted,
  t,
}) => {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.formField}>
      <Text style={[styles.formLabel, { color: t.textSecondary }]}>
        {label}
      </Text>
      <View
        style={[
          styles.formInput,
          {
            backgroundColor: t.surfaceAlt,
            borderColor: error ? t.error : focused ? t.accent : t.border,
          },
          highlighted && { borderColor: t.accent },
        ]}
      >
        <Feather
          name={icon}
          size={18}
          color={focused ? t.accent : t.textMuted}
        />
        <TextInput
          value={value}
          onChangeText={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
          placeholder={placeholder || label}
          placeholderTextColor={t.textMuted}
          keyboardType={keyboardType}
          secureTextEntry={secureTextEntry}
          maxLength={maxLength}
          style={[styles.formTextInput, { color: t.text }]}
        />
      </View>
      {!!error && (
        <Text style={{ color: t.error, fontSize: 12, marginTop: 4 }}>
          {error}
        </Text>
      )}
    </View>
  );
};

const FormSelect = ({
  label,
  value,
  options,
  onChange,
  icon,
  highlighted,
  t,
}) => {
  const [open, setOpen] = useState(false);
  const [temp, setTemp] = useState(value);
  const display = options.find((o) => o.value === value)?.label || "-- Chọn --";
  useEffect(() => setTemp(value), [value]);
  return (
    <View style={styles.formField}>
      <Text style={[styles.formLabel, { color: t.textSecondary }]}>
        {label}
      </Text>
      <Pressable
        onPress={() => setOpen(true)}
        style={[
          styles.formInput,
          {
            backgroundColor: t.surfaceAlt,
            borderColor: highlighted ? t.accent : t.border,
          },
        ]}
      >
        <Feather name={icon} size={18} color={t.textMuted} />
        <Text
          style={[
            styles.formSelectText,
            { color: value ? t.text : t.textMuted },
          ]}
        >
          {display}
        </Text>
        <Feather name="chevron-down" size={18} color={t.textMuted} />
      </Pressable>
      <Modal visible={open} transparent animationType="slide">
        <View style={styles.pickerOverlay}>
          <View style={[styles.pickerCard, { backgroundColor: t.surface }]}>
            <View style={styles.pickerHeader}>
              <Pressable onPress={() => setOpen(false)}>
                <Text style={{ color: t.textSecondary }}>Huỷ</Text>
              </Pressable>
              <Text style={{ color: t.text, fontWeight: "700" }}>{label}</Text>
              <Pressable
                onPress={() => {
                  onChange(temp);
                  setOpen(false);
                }}
              >
                <Text style={{ color: t.accent, fontWeight: "600" }}>Xong</Text>
              </Pressable>
            </View>
            <Picker
              selectedValue={temp}
              onValueChange={(v) => setTemp(String(v))}
              itemStyle={{ color: t.text }}
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
    </View>
  );
};

const FormDatePicker = ({ label, value, onChange, icon, highlighted, t }) => {
  const [open, setOpen] = useState(false);
  const [temp, setTemp] = useState(
    value ? new Date(value) : new Date(1990, 0, 1)
  );
  useEffect(() => {
    if (value) setTemp(new Date(value));
  }, [value]);
  return (
    <View style={styles.formField}>
      <Text style={[styles.formLabel, { color: t.textSecondary }]}>
        {label}
      </Text>
      <Pressable
        onPress={() => setOpen(true)}
        style={[
          styles.formInput,
          {
            backgroundColor: t.surfaceAlt,
            borderColor: highlighted ? t.accent : t.border,
          },
        ]}
      >
        <Feather name={icon} size={18} color={t.textMuted} />
        <Text
          style={[
            styles.formSelectText,
            { color: value ? t.text : t.textMuted },
          ]}
        >
          {value || "Chọn ngày"}
        </Text>
        <Feather name="chevron-down" size={18} color={t.textMuted} />
      </Pressable>
      <Modal visible={open} transparent animationType="slide">
        <View style={styles.pickerOverlay}>
          <View style={[styles.pickerCard, { backgroundColor: t.surface }]}>
            <View style={styles.pickerHeader}>
              <Pressable onPress={() => setOpen(false)}>
                <Text style={{ color: t.textSecondary }}>Huỷ</Text>
              </Pressable>
              <Text style={{ color: t.text, fontWeight: "700" }}>{label}</Text>
              <Pressable
                onPress={() => {
                  onChange(yyyyMMdd(temp));
                  setOpen(false);
                }}
              >
                <Text style={{ color: t.accent, fontWeight: "600" }}>Xong</Text>
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
    </View>
  );
};

const GradientBtn = ({ title, onPress, disabled, loading }) => (
  <Pressable
    onPress={onPress}
    disabled={disabled || loading}
    style={({ pressed }) => [{ opacity: disabled ? 0.5 : pressed ? 0.9 : 1 }]}
  >
    <LinearGradient
      colors={disabled ? ["#71717a", "#52525b"] : ["#8b5cf6", "#6366f1"]}
      style={styles.gradientBtn}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={styles.gradientBtnText}>{title}</Text>
      )}
    </LinearGradient>
  </Pressable>
);

const ImagePickerBox = ({ label, file, onPick, t }) => (
  <View style={{ flex: 1 }}>
    <Pressable
      onPress={onPick}
      style={[
        styles.imageBox,
        { backgroundColor: t.surfaceAlt, borderColor: t.border },
      ]}
    >
      {file?.uri ? (
        <>
          <Image source={{ uri: file.uri }} style={StyleSheet.absoluteFill} />
          <View style={styles.imageBoxOverlay}>
            <Feather name="refresh-cw" size={20} color="#fff" />
          </View>
        </>
      ) : (
        <View style={styles.imageBoxEmpty}>
          <Feather name="image" size={24} color={t.textMuted} />
          <Text style={{ color: t.textMuted, fontSize: 12, marginTop: 4 }}>
            Chọn ảnh
          </Text>
        </View>
      )}
    </Pressable>
    <Text
      style={{
        textAlign: "center",
        marginTop: 6,
        color: t.textSecondary,
        fontSize: 13,
      }}
    >
      {label}
    </Text>
  </View>
);

const CccdPreview = ({ uri, label, onPress, t }) => (
  <View style={{ flex: 1 }}>
    <Pressable
      onPress={onPress}
      disabled={!uri}
      style={[
        styles.cccdBox,
        { backgroundColor: t.surfaceAlt, borderColor: t.border },
      ]}
    >
      {uri ? (
        <Image
          source={{ uri: normalizeUrl(uri) }}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <Feather name="image" size={24} color={t.textMuted} />
      )}
    </Pressable>
    <Text
      style={{
        textAlign: "center",
        marginTop: 6,
        color: t.textSecondary,
        fontSize: 13,
      }}
    >
      {label}
    </Text>
  </View>
);

const ThemeOption = ({ label, selected, onPress, icon, t, last }) => (
  <Pressable
    onPress={onPress}
    style={[
      styles.themeOption,
      !last && { borderBottomWidth: 1, borderBottomColor: t.border },
    ]}
  >
    <View style={styles.themeOptionLeft}>
      <View
        style={[styles.themeOptionIcon, { backgroundColor: t.accentLight }]}
      >
        <Feather name={icon} size={16} color={t.accent} />
      </View>
      <Text style={{ color: t.text }}>{label}</Text>
    </View>
    <View
      style={[styles.radio, { borderColor: selected ? t.accent : t.border }]}
    >
      {selected && (
        <View style={[styles.radioInner, { backgroundColor: t.accent }]} />
      )}
    </View>
  </Pressable>
);

const DangerBtn = ({ title, icon, onPress, color }) => (
  <Pressable
    onPress={onPress}
    style={[styles.dangerBtn, { borderColor: color }]}
  >
    <Feather name={icon} size={16} color={color} />
    <Text style={{ color, fontWeight: "700" }}>{title}</Text>
  </Pressable>
);

/* ==================== STYLES ==================== */
const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    overflow: "hidden",
  },

  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    height: 50,
    zIndex: 20,
  },

  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },

  miniName: {
    fontSize: 16,
    fontWeight: "700",
    flex: 1,
    textAlign: "center",
    marginHorizontal: 8,
  },

  // ✅ FIX: cho profile area full width + padding để text không bị cắt
  profileArea: {
    flex: 1,
    alignItems: "center",
    width: "100%",
    paddingHorizontal: 16,
  },

  // Avatar Styles
  avatarContainer: {
    width: 100,
    height: 100,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
    marginBottom: 8,
  },
  avatarInner: {
    width: "100%",
    height: "100%",
    borderRadius: 50,
    borderWidth: 3,
    borderColor: "#fff",
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  avatarImg: { width: "100%", height: "100%" },
  avatarEditBtn: {
    position: "absolute",
    bottom: 0,
    right: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },

  // ✅ FIX: giới hạn width để ellipsize luôn ăn
  nameArea: { alignItems: "center", maxWidth: "100%" },
  userName: {
    fontSize: 20,
    fontWeight: "800",
    color: "#fff",
    maxWidth: "100%",
  },
  userHandle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.8)",
    marginTop: 2,
    maxWidth: "100%",
  },

  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 8,
  },
  statusChipText: { color: "#fff", fontSize: 11, fontWeight: "600" },

  // ===== SKELETON (✅ FIX) =====
  skelHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    overflow: "hidden",
  },

  skelTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    height: 50,
  },

  skelCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.22)",
  },

  skelMiniLine: {
    flex: 1,
    height: 14,
    borderRadius: 7,
    marginHorizontal: 10,
    backgroundColor: "rgba(255,255,255,0.28)",
  },

  skelProfileArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },

  skelAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(255,255,255,0.25)",
    marginBottom: 12,
  },

  skelNameLine: {
    height: 16,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: "rgba(255,255,255,0.22)",
  },

  skelChip: {
    width: 110,
    height: 22,
    borderRadius: 11,
    marginTop: 6,
    backgroundColor: "rgba(255,255,255,0.18)",
  },

  skelCard: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
  },

  skelLine: {
    height: 16,
    borderRadius: 8,
    marginBottom: 10,
  },

  tabBarContainer: { paddingHorizontal: 16, paddingVertical: 12 },
  tabBar: {
    flexDirection: "row",
    borderRadius: 16,
    padding: 4,
    borderWidth: 1,
  },
  tabItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
  },
  tabItemActive: {},
  tabLabel: { fontSize: 12, fontWeight: "600" },

  content: { padding: 16 },

  bentoGrid: { flexDirection: "row", gap: 12 },
  bentoCard: {
    flex: 1,
    borderRadius: 20,
    padding: 16,
    height: 120,
    justifyContent: "space-between",
  },
  bentoCardWide: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    padding: 16,
    marginTop: 12,
  },
  bentoIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  bentoValue: { fontSize: 28, fontWeight: "800", color: "#fff" },
  bentoLabel: { fontSize: 12, color: "rgba(255,255,255,0.8)" },

  card: { borderRadius: 20, padding: 16, borderWidth: 1 },
  cardTitle: { fontSize: 17, fontWeight: "700", marginBottom: 16 },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  infoRowLeft: { flexDirection: "row", alignItems: "center", gap: 10 },

  formField: { marginBottom: 14 },
  formLabel: { fontSize: 13, fontWeight: "500", marginBottom: 6 },
  formInput: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 12,
  },
  formTextInput: {
    flex: 1,
    paddingVertical: Platform.select({ ios: 12, android: 10 }),
    fontSize: 15,
  },
  formSelectText: { flex: 1, paddingVertical: 12, fontSize: 15 },
  subTitle: { fontSize: 15, fontWeight: "700", marginTop: 12, marginBottom: 8 },

  gradientBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 8,
  },
  gradientBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  qrBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    marginBottom: 14,
  },
  qrBtnText: { fontWeight: "600" },

  uploadLabel: { fontSize: 13, fontWeight: "500", marginBottom: 8 },
  cccdRow: { flexDirection: "row", gap: 12, marginBottom: 12 },

  imageBox: {
    height: 90,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: "dashed",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  imageBoxOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  imageBoxEmpty: { alignItems: "center" },

  cccdBox: {
    height: 120,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },

  statusBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    marginTop: 8,
  },

  warningText: {
    color: "#f59e0b",
    fontSize: 12,
    marginTop: 8,
    textAlign: "center",
  },

  themeOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  themeOptionLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  themeOptionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },

  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  radioInner: { width: 12, height: 12, borderRadius: 6 },

  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  switchLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  switchIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  switchLabel: { fontSize: 15 },

  dangerRow: { flexDirection: "row", gap: 12 },
  dangerBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
  },
  modalTitle: { fontSize: 18, fontWeight: "700", marginBottom: 16 },
  modalAvatar: { width: 120, height: 120, borderRadius: 60, marginBottom: 16 },
  modalCover: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 12,
    marginBottom: 16,
  },
  modalBtns: { flexDirection: "row", gap: 12, width: "100%" },
  modalBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  modalBtnPrimary: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 12,
  },
  dangerIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  deleteInput: {
    width: "100%",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 16,
  },

  pickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  pickerCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 20,
  },
  pickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.1)",
  },
  coverCenterNamePill: {
    backgroundColor: "rgba(0,0,0,0.28)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    maxWidth: "90%",
  },
  coverCenterNameText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
  },
  bentoInfoBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },

  tipOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },

  tipCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
  },

  tipIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },

  tipBtn: {
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
});
