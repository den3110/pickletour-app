// app/(tabs)/profile/index.jsx
import DateTimePicker from "@react-native-community/datetimepicker";
import { Picker } from "@react-native-picker/picker";
import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { router, Stack } from "expo-router";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActionSheetIOS,
  Alert,
  Image,
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
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useDispatch, useSelector } from "react-redux";

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
} from "@/slices/usersApiSlice";
import * as SecureStore from "expo-secure-store";
import { useUnregisterPushTokenMutation } from "@/slices/pushApiSlice";
import { normalizeUrl } from "@/utils/normalizeUri";
import CccdQrModal from "@/components/CccdQrModal";
import { usePlatform } from "@/hooks/usePlatform";
import { DEVICE_ID_KEY } from "@/hooks/useExpoPushToken";
import apiSlice from "@/slices/apiSlice";

/* ---------- Config ---------- */
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

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
};

/* helpers */
async function pickImage(maxBytes = MAX_FILE_SIZE) {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.9,
  });
  if (res.canceled) return null;

  // Asset từ ImagePicker
  let asset = res.assets[0];
  let uri = asset.uri;

  // Dùng File API mới để đọc metadata (size, mime, name…)
  let f = new File(asset); // constructor nhận thẳng asset từ picker
  let size = f.size; // bytes (0 nếu không đọc được)
  let mime = f.type; // ví dụ "image/heic", "image/jpeg", ...
  let name = f.name || asset.fileName || "image";

  // Nếu là HEIC/HEIF -> convert sang JPEG bằng ImageManipulator (API mới)
  const isHeic = /heic|heif/i.test(mime || "") || /\.heic|\.heif$/i.test(name);
  if (isHeic) {
    const ctx = ImageManipulator.manipulate(uri); // tạo context
    const ref = await ctx.renderAsync(); // load ảnh
    const out = await ref.saveAsync({
      // lưu ra file mới
      format: SaveFormat.JPEG,
      compress: 0.9,
    });
    uri = out.uri;

    // Cập nhật lại File sau khi convert
    f = new File(uri);
    size = f.size;
    mime = "image/jpeg";
    name = (name || "image").replace(/\.(heic|heif)$/i, ".jpg");
  }

  // Giới hạn dung lượng
  if (typeof size === "number" && size > maxBytes) {
    Alert.alert("Ảnh quá lớn", "Ảnh không được vượt quá 10MB.");
    return null;
  }

  // Chuẩn hóa trả về cho FormData
  if (!/\.jpe?g|\.png|\.webp$/i.test(name)) {
    // đoán đuôi theo mime
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
// "DD/MM/YYYY" → "YYYY-MM-DD"
function dmyToIso(s) {
  if (!s) return "";
  s = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; // đã ISO
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    return `${yyyy}-${mm}-${dd}`;
  }
  return s;
}

export default function ProfileScreen() {
  const { isIOS } = usePlatform();
  const scheme = useColorScheme() ?? "light";
  const tint = scheme === "dark" ? "#7cc0ff" : "#0a84ff";
  const cardBg = scheme === "dark" ? "#16181c" : "#ffffff";
  const textPrimary = scheme === "dark" ? "#fff" : "#111";
  const textSecondary = scheme === "dark" ? "#c9c9c9" : "#444";
  const border = scheme === "dark" ? "#2e2f33" : "#dfe3ea";
  const muted = scheme === "dark" ? "#22252a" : "#f3f5f9";
  const placeholder = scheme === "dark" ? "#8e8e93" : "#9aa0a6";
  const iconMuted = scheme === "dark" ? "#a1a1aa" : "#60646c";

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
  const [uploadCccd, { isLoading: upLoad }] = useUploadCccdMutation();
  const [uploadAvatar, { isLoading: uploadingAvatar }] =
    useUploadAvatarMutation();

  // ===== Redirect rules =====
  // Đợi 1 tick cho quá trình hydrate store rồi mới quyết định redirect
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

  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [uploadedAvatarUrl, setUploadedAvatarUrl] = useState("");

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
    };
    initialRef.current = init;
    setForm(init);
    setAvatarPreview("");
    setAvatarFile(null);
    setUploadedAvatarUrl("");
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
    return changed || !!avatarFile;
  }, [form, avatarFile]);
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
    // r: { id, name, dob (DD/MM/YYYY), gender, address, raw }
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
      // Upload avatar nếu có
      let finalAvatarUrl = uploadedAvatarUrl || form.avatar || "";
      if (avatarFile && !uploadedAvatarUrl) {
        const up = await uploadAvatar(avatarFile).unwrap();
        const url = up?.url || up?.data?.url || "";
        if (url) {
          finalAvatarUrl = url;
          setUploadedAvatarUrl(url);
          setForm((p) => ({ ...p, avatar: url }));
        }
      }

      const payload = diff();
      if (finalAvatarUrl && finalAvatarUrl !== initialRef.current.avatar) {
        payload.avatar = finalAvatarUrl;
      }
      if (!finalAvatarUrl && initialRef.current.avatar) {
        payload.avatar = "";
      }

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
    // yêu cầu đã có số CCCD hợp lệ mới cho gửi ảnh
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
      // 1) Tắt token của thiết bị hiện tại (khi còn đăng nhập ⇒ có auth, không 403)
      const deviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
      if (deviceId) {
        try {
          await unregisterDeviceToken({ deviceId }).unwrap();
        } catch (e) {
          if (__DEV__) console.log("unregister device token failed:", e);
          // vẫn tiếp tục logout
        }
      }

      // 2) Gọi API logout (server xoá cookie/session)
      await logoutApiCall().unwrap();
    } catch {
      // bỏ qua lỗi để đảm bảo luôn logout phía client
    }

    // 3) Dọn state & điều hướng
    dispatch(logoutAction());
    router.replace("/login");
    dispatch(apiSlice.util.resetApiState());
  };

  const confirmDelete = () => {
    const run = async () => {
      try {
        await deleteMe().unwrap();
      } catch {}
      dispatch(logoutAction());
      router.replace("/login");
      Alert.alert("Đã xoá", "Tài khoản của bạn đã được xoá vĩnh viễn.");
    };

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title:
            "Xoá tài khoản sẽ xoá dữ liệu cá nhân và không thể hoàn tác. Xác nhận?",
          options: ["Huỷ", "Xoá vĩnh viễn"],
          destructiveButtonIndex: 1,
          cancelButtonIndex: 0,
          userInterfaceStyle: scheme === "dark" ? "dark" : "light",
        },
        (idx) => idx === 1 && run()
      );
    } else {
      Alert.alert(
        "Xoá tài khoản",
        "Xoá tài khoản sẽ xoá dữ liệu cá nhân và không thể hoàn tác. Xác nhận?",
        [
          { text: "Huỷ", style: "cancel" },
          { text: "Xoá vĩnh viễn", style: "destructive", onPress: run },
        ]
      );
    }
  };

  // ===== Render gate =====
  if (!userInfo) {
    return (
      <>
        <Stack.Screen
          options={{ title: "Hồ sơ", headerTitleAlign: "center" }}
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
          options={{ title: "Hồ sơ", headerTitleAlign: "center" }}
        />
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <Text>Đang tải…</Text>
        </View>
      </>
    );
  }

  const status = user.cccdStatus || "unverified";
  const showUpload = status === "unverified" || status === "rejected";
  const frontUrl = normalizeUrl(user.cccdImages?.front) || "";
  const backUrl = normalizeUrl(user.cccdImages?.back) || "";

  // nút gửi ảnh chỉ enable khi có 2 ảnh + có CCCD hợp lệ
  const allowSendCccd =
    !!frontImg && !!backImg && /^\d{12}$/.test(String(form.cccd || "").trim());

  return (
    <>
      <Stack.Screen options={{ title: "Hồ sơ", headerTitleAlign: "center" }} />
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: "padding", android: undefined })}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={tint} // iOS spinner
              colors={[tint]} // Android spinner
              progressBackgroundColor={cardBg} // Android track
            />
          }
        >
          <View
            style={[
              styles.card,
              { backgroundColor: cardBg, borderColor: border },
            ]}
          >
            <Text style={[styles.h1, { color: textPrimary }]}>
              Cập nhật hồ sơ
            </Text>

            {/* Avatar */}
            <View style={[styles.row, { gap: 16 }]}>
              <View
                style={[
                  styles.avatar,
                  { backgroundColor: muted, borderColor: border },
                ]}
              >
                <Image
                  source={{
                    uri:
                      normalizeUrl(avatarPreview) ||
                      normalizeUrl(form.avatar) ||
                      "https://dummyimage.com/160x160/cccccc/ffffff&text=?",
                  }}
                  style={{ width: 80, height: 80, borderRadius: 40 }}
                />
              </View>
              <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
                <Pressable
                  onPress={async () => {
                    const f = await pickImage();
                    if (!f) return;
                    setAvatarFile(f);
                    setAvatarPreview(f.uri);
                    setUploadedAvatarUrl("");
                  }}
                  style={({ pressed }) => [
                    styles.btn,
                    styles.btnOutline,
                    { borderColor: border, backgroundColor: muted },
                    pressed && { opacity: 0.9 },
                  ]}
                >
                  <Text style={[styles.btnText, { color: textPrimary }]}>
                    Chọn ảnh đại diện
                  </Text>
                </Pressable>

                {form.avatar || avatarPreview ? (
                  <Pressable
                    onPress={() => {
                      setAvatarFile(null);
                      setAvatarPreview("");
                      setUploadedAvatarUrl("");
                      setForm((p) => ({ ...p, avatar: "" }));
                    }}
                    style={({ pressed }) => [
                      styles.btn,
                      styles.btnTextOnly,
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <Text style={[styles.btnText, { color: "#e53935" }]}>
                      Xóa ảnh
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            {/* Thông tin */}
            <Field
              label="Họ và tên"
              value={form.name}
              onChangeText={(v) => setField("name", v)}
              onBlur={() => markTouched("name")}
              error={showErr("name") ? errors.name : ""}
              required
              border={border}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
              highlighted={HL.name}
              tint={tint}
            />
            <Field
              label="Biệt danh"
              value={form.nickname}
              onChangeText={(v) => setField("nickname", v)}
              onBlur={() => markTouched("nickname")}
              error={showErr("nickname") ? errors.nickname : ""}
              required
              border={border}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
            />
            <Field
              label="Số điện thoại"
              value={form.phone}
              onChangeText={(v) => setField("phone", v)}
              onBlur={() => markTouched("phone")}
              error={showErr("phone") ? errors.phone : ""}
              keyboardType="phone-pad"
              required
              border={border}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
            />

            {/* Giới tính */}
            <SelectField
              label="Giới tính"
              value={form.gender}
              placeholder="-- Chọn giới tính --"
              options={GENDER_OPTIONS}
              onChange={(val) => {
                setField("gender", val);
                markTouched("gender");
              }}
              error={showErr("gender") ? errors.gender : ""}
              border={border}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
              highlighted={HL.gender}
              tint={tint}
            />

            {/* DOB */}
            <DateField
              label="Ngày sinh"
              value={form.dob}
              onChange={(val) => {
                setField("dob", val);
                markTouched("dob");
              }}
              error={showErr("dob") ? errors.dob : ""}
              border={border}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
              tint={tint}
              highlighted={HL.dob}
            />

            {/* Tỉnh / Thành phố */}
            <SelectField
              label="Tỉnh / Thành phố"
              value={form.province}
              placeholder="-- Chọn --"
              options={[
                { value: "", label: "-- Chọn --" },
                ...PROVINCES.map((p) => ({ value: p, label: p })),
              ]}
              onChange={(val) => {
                setField("province", val);
                markTouched("province");
              }}
              error={showErr("province") ? errors.province : ""}
              border={border}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
              highlighted={HL.province}
              tint={tint}
            />

            {/* CCCD + nút quét */}
            <View style={{ gap: 8 }}>
              <Field
                label="Mã định danh CCCD"
                value={form.cccd}
                onChangeText={(v) => setField("cccd", v)}
                onBlur={() => markTouched("cccd")}
                error={showErr("cccd") ? errors.cccd : ""}
                placeholder="12 chữ số"
                keyboardType="number-pad"
                maxLength={12}
                border={border}
                textPrimary={textPrimary}
                textSecondary={textSecondary}
                highlighted={HL.cccd}
                tint={tint}
              />

              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 10,
                  marginBottom: 6,
                }}
              >
                <Pressable
                  onPress={() => setQrOpen(true)}
                  style={({ pressed }) => [
                    styles.btn,
                    { backgroundColor: tint },
                    pressed && { opacity: 0.92 },
                  ]}
                >
                  <Text style={styles.btnTextWhite}>
                    Quét CCCD (QR) để điền nhanh
                  </Text>
                </Pressable>
              </View>
            </View>

            <Field
              label="Email"
              value={form.email}
              onChangeText={(v) => setField("email", v)}
              onBlur={() => markTouched("email")}
              error={showErr("email") ? errors.email : ""}
              keyboardType="email-address"
              required
              border={border}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
            />

            <Field
              label="Mật khẩu mới"
              value={form.password}
              onChangeText={(v) => setField("password", v)}
              onBlur={() => markTouched("password")}
              error={showErr("password") ? errors.password : ""}
              placeholder="Để trống nếu không đổi"
              secureTextEntry
              border={border}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
            />
            <Field
              label="Xác nhận mật khẩu"
              value={form.confirmPassword}
              onChangeText={(v) => setField("confirmPassword", v)}
              onBlur={() => markTouched("confirmPassword")}
              error={showErr("confirmPassword") ? errors.confirmPassword : ""}
              secureTextEntry
              border={border}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
            />

            {/* CCCD */}
            <Text style={[styles.subTitle, { color: textPrimary }]}>
              Ảnh CCCD
            </Text>
            {showUpload ? (
              <>
                <View
                  style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}
                >
                  <PickBox
                    label="Mặt trước"
                    file={frontImg}
                    onPick={async () => setFrontImg(await pickImage())}
                    border={border}
                    muted={muted}
                    textSecondary={textSecondary}
                  />

                  <PickBox
                    label="Mặt sau"
                    file={backImg}
                    onPick={async () => setBackImg(await pickImage())}
                    border={border}
                    muted={muted}
                    textSecondary={textSecondary}
                  />
                </View>
                <Pressable
                  onPress={sendCccd}
                  disabled={!allowSendCccd || upLoad}
                  style={({ pressed }) => [
                    styles.btn,
                    {
                      backgroundColor:
                        !allowSendCccd || upLoad ? "#9aa0a6" : tint,
                    },
                    pressed && { opacity: 0.92 },
                  ]}
                >
                  <Text style={styles.btnTextWhite}>
                    {upLoad ? "Đang gửi…" : "Gửi ảnh xác minh"}
                  </Text>
                </Pressable>
                {!/^\d{12}$/.test(String(form.cccd || "").trim()) && (
                  <Text
                    style={{ color: "#e11d48", fontSize: 12, marginTop: 4 }}
                  >
                    Bạn cần nhập hoặc quét mã số CCCD (12 số) trước khi gửi ảnh.
                  </Text>
                )}
              </>
            ) : (
              <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
                <PreviewBox
                  uri={normalizeUrl(frontUrl)}
                  label="Mặt trước"
                  border={border}
                  muted={muted}
                />
                <PreviewBox
                  uri={normalizeUrl(backUrl)}
                  label="Mặt sau"
                  border={border}
                  muted={muted}
                />
              </View>
            )}

            {/* Trạng thái */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                marginTop: 6,
              }}
            >
              <Text style={{ color: textSecondary }}>Trạng thái:</Text>
              <StatusChip status={status} />
            </View>

            {/* Lưu */}
            <Pressable
              onPress={submit}
              disabled={!isDirty || !isValid || isLoading || uploadingAvatar}
              style={({ pressed }) => [
                styles.btn,
                {
                  backgroundColor:
                    !isDirty || !isValid || isLoading || uploadingAvatar
                      ? "#9aa0a6"
                      : tint,
                },
                pressed && { opacity: 0.92 },
              ]}
            >
              <Text style={styles.btnTextWhite}>
                {isLoading || uploadingAvatar ? "Đang lưu…" : "Lưu thay đổi"}
              </Text>
            </Pressable>
          </View>

          {/* Logout & Delete */}
          <Pressable
            onPress={confirmLogout}
            style={({ pressed }) => [
              styles.btn,
              styles.btnOutline,
              { borderColor: "#e53935", backgroundColor: cardBg },
              pressed && { opacity: 0.9 },
            ]}
          >
            <Text style={[styles.btnText, { color: "#e53935" }]}>
              Đăng xuất
            </Text>
          </Pressable>

          <Pressable
            onPress={confirmDelete}
            style={({ pressed }) => [
              styles.btn,
              styles.btnOutline,
              { borderColor: "#b00020", backgroundColor: cardBg },
              isIOS && { marginBottom: 80 },
              pressed && { opacity: 0.9 },
            ]}
          >
            <Text style={[styles.btnText, { color: "#b00020" }]}>
              Xoá tài khoản
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Modal quét CCCD */}
      <CccdQrModal
        visible={qrOpen}
        onClose={() => setQrOpen(false)}
        onResult={(r) => {
          setQrOpen(false);
          onScanResult(r);
        }}
      />
    </>
  );
}

/* ======= Subcomponents ======= */
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
}) {
  const { isIOS } = usePlatform();
  const scheme = useColorScheme() ?? "light";
  const cardBg = scheme === "dark" ? "#16181c" : "#ffffff";
  const muted = scheme === "dark" ? "#22252a" : "#f3f5f9";
  const iconMuted = scheme === "dark" ? "#a1a1aa" : "#60646c";
  const [open, setOpen] = useState(false);
  const [temp, setTemp] = useState(value || "");
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
        <Text
          style={{ color: value ? textPrimary : placeholder, fontSize: 16 }}
        >
          {display}
        </Text>
      </Pressable>
      {!!error && <Text style={styles.errText}>{error}</Text>}
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
              <Pressable onPress={() => setOpen(false)} style={styles.modalBtn}>
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
}) {
  const { isIOS } = usePlatform();
  const scheme = useColorScheme() ?? "light";
  const cardBg = scheme === "dark" ? "#16181c" : "#ffffff";
  const muted = scheme === "dark" ? "#22252a" : "#f3f5f9";
  const iconMuted = scheme === "dark" ? "#a1a1aa" : "#60646c";
  const placeholder = scheme === "dark" ? "#8e8e93" : "#9aa0a6";
  const [open, setOpen] = useState(false);
  const [temp, setTemp] = useState(
    value ? new Date(value) : new Date(1990, 0, 1)
  );
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
        <Text
          style={{ color: value ? textPrimary : placeholder, fontSize: 16 }}
        >
          {value || "Chọn ngày sinh"}
        </Text>
      </Pressable>
      {!!error && <Text style={styles.errText}>{error}</Text>}
      {open && (
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
              <Image
                source={{ uri: file.uri }}
                style={sx.img}
                resizeMode="cover"
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
                Hỗ trợ JPG/PNG, tối đa 5MB
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
    // màu sẽ override theo props ở trên
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

function PreviewBox({ uri, label, border, muted }) {
  return (
    <View style={[styles.pickBox, { borderColor: border }]}>
      {uri ? (
        <Image
          source={{ uri: uri?.replace(/\\/g, "/") }}
          style={{ width: "100%", height: 120, borderRadius: 8 }}
          resizeMode="contain"
        />
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
      <Text style={{ textAlign: "center", marginTop: 6 }}>{label}</Text>
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

/* ======= Styles ======= */
const styles = StyleSheet.create({
  scroll: { flexGrow: 1, padding: 16, gap: 12 },
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
  h1: { fontSize: 18, fontWeight: "700", marginBottom: 8, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center" },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
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
  /* select + modal */
  selectBox: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: "center",
  },
  errText: { color: "#e11d48", marginTop: 4, fontSize: 12 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
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
