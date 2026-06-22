// app/(auth)/register.jsx
import React, { useMemo, useState, useRef, useEffect } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
  Keyboard,
  FlatList,
  ActivityIndicator,
  TouchableWithoutFeedback, // Thêm cái này để xử lý backdrop
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import { Image as ExpoImage } from "expo-image";
import ImageView from "react-native-image-viewing";
import { MaterialIcons } from "@expo/vector-icons";
import { Stack, router, Redirect } from "expo-router";
import { useDispatch, useSelector } from "react-redux";
import DateTimePicker from "@react-native-community/datetimepicker";

import { useRegisterMutation } from "@/slices/usersApiSlice";
import { useUploadRealAvatarMutation } from "@/slices/uploadApiSlice";
import { useGetRegistrationSettingsQuery } from "@/slices/settingsApiSlice";
import { setCredentials } from "@/slices/authSlice";
import { normalizeUrl } from "@/utils/normalizeUri";
import { saveUserInfo } from "@/utils/authStorage";
import AppleLiquidGlassView from "@/components/ui/AppleLiquidGlassView";
import { IOS_26_LIQUID_GLASS_ENABLED } from "@/utils/nativeTabs";

/* ==================== Consts & Helpers ==================== */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const PROVINCES = [
  "An Giang",
  "Bà Rịa - Vũng Tàu",
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
  "TP. Hồ Chí Minh",
  "Trà Vinh",
  "Tuyên Quang",
  "Vĩnh Long",
  "Vĩnh Phúc",
  "Yên Bái",
];

const GENDERS = ["Nam", "Nữ", "Khác"];

function formatDobLabel(dobStr) {
  if (!dobStr) return "";
  const parts = dobStr.split("-");
  if (parts.length !== 3) return dobStr;
  const [y, m, d] = parts.map((p) => parseInt(p, 10));
  if (!y || !m || !d) return dobStr;
  const dd = String(d).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  return `${dd}/${mm}/${y}`;
}

function rgbaFromHex(color, alpha) {
  const hex = String(color || "").replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return color;
  const value = parseInt(hex, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function RegisterGlassSurface({
  children,
  style,
  tintColor,
  effect = "clear",
  interactive = false,
}) {
  const scheme = useColorScheme() ?? "light";
  const isDark = scheme === "dark";

  return (
    <AppleLiquidGlassView
      fallback="view"
      glassColorScheme={isDark ? "dark" : "light"}
      glassEffectStyle={effect}
      glassTintColor={
        tintColor ??
        (isDark ? "rgba(22,24,29,0.62)" : "rgba(255,255,255,0.78)")
      }
      isInteractive={interactive}
      style={style}
    >
      {children}
    </AppleLiquidGlassView>
  );
}

function parseDobString(dobStr) {
  if (!dobStr) return null;
  const parts = dobStr.split("-");
  if (parts.length !== 3) return null;
  const [y, m, d] = parts.map((p) => parseInt(p, 10));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function cleanPhone(v) {
  if (typeof v !== "string") return "";
  let s = v.trim();
  if (!s) return "";
  if (s.startsWith("+84")) s = "0" + s.slice(3);
  s = s.replace(/[^\d]/g, "");
  return s;
}

async function pickImage(maxBytes = MAX_FILE_SIZE) {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
    exif: false,
  });

  if (res.canceled) return null;

  let asset = res.assets?.[0];
  if (!asset?.uri) return null;

  let uri = asset.uri;
  let name =
    asset.fileName || uri.split(/[\\/]/).pop() || `avatar_${Date.now()}.jpg`;

  const actions = [{ resize: { width: 1080 } }];

  const out = await ImageManipulator.manipulateAsync(uri, actions, {
    compress: 0.8,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  uri = out.uri;
  if (
    !name.toLowerCase().endsWith(".jpg") &&
    !name.toLowerCase().endsWith(".jpeg")
  ) {
    name = name.split(".")[0] + ".jpg";
  }
  const type = "image/jpeg";

  const info = await FileSystem.getInfoAsync(uri, { size: true });
  const size = info.size || 0;

  if (size > maxBytes) {
    Alert.alert("Ảnh quá lớn", "Vui lòng chọn ảnh nhỏ hơn 10MB.");
    return null;
  }

  return { uri, name, type, size };
}

function validateAll(form, avatarUrl, accepted, requireOptional) {
  const name = (form.name || "").trim();
  const nickname = (form.nickname || "").trim();
  const phoneRaw = cleanPhone(form.phone || "");
  const email = (form.email || "").trim();
  const province = form.province || "";
  const gender = form.gender || "";
  const dob = form.dob || "";
  const password = form.password || "";
  const confirmPassword = form.confirmPassword || "";
  const cccdRaw = (form.cccd || "").trim();

  const fields = {
    name: "",
    nickname: "",
    email: "",
    phone: "",
    cccd: "",
    gender: "",
    dob: "",
    province: "",
    password: "",
    confirmPassword: "",
    terms: "",
  };
  let avatar = "";

  if (!name) fields.name = "Vui lòng nhập họ và tên.";
  else if (name.length < 2) fields.name = "Họ và tên tối thiểu 2 ký tự.";

  if (!nickname) fields.nickname = "Vui lòng nhập biệt danh.";

  if (!email) fields.email = "Vui lòng nhập email.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    fields.email = "Email không hợp lệ.";

  if (requireOptional) {
    if (!phoneRaw) fields.phone = "Vui lòng nhập số điện thoại.";
    else if (!/^0\d{9}$/.test(phoneRaw))
      fields.phone = "SĐT phải bắt đầu bằng 0 và đủ 10 số.";
  } else {
    if (phoneRaw && !/^0\d{9}$/.test(phoneRaw)) {
      fields.phone = "SĐT phải bắt đầu bằng 0 và đủ 10 số.";
    }
  }

  if (requireOptional) {
    if (!cccdRaw) fields.cccd = "Vui lòng nhập số CCCD.";
    else if (!/^\d+$/.test(cccdRaw)) fields.cccd = "CCCD chỉ được chứa chữ số.";
  } else {
    if (cccdRaw && !/^\d+$/.test(cccdRaw)) {
      fields.cccd = "CCCD chỉ được chứa chữ số.";
    }
  }

  if (requireOptional) {
    if (!gender) fields.gender = "Vui lòng chọn giới tính.";
  } else {
    fields.gender = "";
  }

  if (requireOptional) {
    if (!dob) fields.dob = "Vui lòng chọn ngày sinh.";
  } else {
    fields.dob = "";
  }

  if (requireOptional) {
    if (!province) fields.province = "Vui lòng chọn Tỉnh/Thành phố.";
  } else {
    fields.province = "";
  }

  if (!password) fields.password = "Vui lòng nhập mật khẩu.";
  else if (password.length < 6)
    fields.password = "Mật khẩu phải có ít nhất 6 ký tự.";

  if (!confirmPassword) fields.confirmPassword = "Vui lòng xác nhận mật khẩu.";
  else if (password !== confirmPassword)
    fields.confirmPassword = "Mật khẩu và xác nhận không khớp.";

  if (!accepted) fields.terms = "Bạn cần đồng ý Điều khoản & Chính sách.";
  if (!avatarUrl) avatar = "Vui lòng chọn ảnh đại diện.";

  const messages = [
    ...Object.values(fields).filter(Boolean),
    ...(avatar ? [avatar] : []),
  ];
  return {
    fields,
    avatar,
    hasErrors: messages.length > 0,
    messages,
  };
}

/* ==================== Screen ==================== */
export default function RegisterScreen() {
  const scheme = useColorScheme() ?? "light";
  const isDark = scheme === "dark";
  const tint = isDark ? "#7cc0ff" : "#0a84ff";
  const cardBg = isDark ? "#16181c" : "#ffffff";
  const textPrimary = isDark ? "#fff" : "#111";
  const textSecondary = isDark ? "#c9c9c9" : "#444";
  const border = isDark ? "#2e2f33" : "#dfe3ea";
  const danger = "#e53935";
  // 👇 1. Tạo Ref cho ScrollView
  const scrollRef = useRef(null);

  // 👇 2. Viết hàm xử lý khi bấm vào ô mật khẩu
  const handleFocusPassword = () => {
    // Đợi 100ms để bàn phím kịp hiện lên, sau đó cuộn xuống đáy
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };
  const dispatch = useDispatch();
  const userInfo = useSelector((s) => s.auth?.userInfo);

  const [register, { isLoading }] = useRegisterMutation();
  const [uploadAvatar, { isLoading: uploadingAvatar }] =
    useUploadRealAvatarMutation();

  const [requireOptional, setRequireOptional] = useState(true);
  const { data: registrationSettings } = useGetRegistrationSettingsQuery();

  useEffect(() => {
    if (
      registrationSettings &&
      typeof registrationSettings.requireOptionalProfileFields === "boolean"
    ) {
      setRequireOptional(registrationSettings.requireOptionalProfileFields);
    }
  }, [registrationSettings]);

  const [optionalModalOpen, setOptionalModalOpen] = useState(false);
  const [missingOptionalFields, setMissingOptionalFields] = useState([]);

  const [form, setForm] = useState({
    name: "",
    nickname: "",
    email: "",
    phone: "",
    cccd: "",
    gender: "",
    dob: "",
    province: "",
    password: "",
    confirmPassword: "",
  });
  const handleChange = (key, val) => setForm((p) => ({ ...p, [key]: val }));

  const [accepted, setAccepted] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarTemp, setAvatarTemp] = useState(null);
  const [avatarConfirmOpen, setAvatarConfirmOpen] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);

  // States for Modals
  const [dobPickerOpen, setDobPickerOpen] = useState(false);
  const [dobDraft, setDobDraft] = useState(null);
  const [provincePickerOpen, setProvincePickerOpen] = useState(false); // New
  const [genderPickerOpen, setGenderPickerOpen] = useState(false); // New

  const [showErrors, setShowErrors] = useState(false);

  // --- Handlers cho việc mở Picker an toàn với bàn phím ---
  const handleOpenPicker = (setter) => {
    Keyboard.dismiss(); // Tắt bàn phím ngay lập tức
    setter(true); // Mở modal
  };

  const openDobPicker = () => {
    Keyboard.dismiss();
    const existing = parseDobString(form.dob);
    setDobDraft(existing || new Date(2000, 0, 1));
    setDobPickerOpen(true);
  };

  const commitDob = (date) => {
    if (!date) return;
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    handleChange("dob", `${yyyy}-${mm}-${dd}`);
  };

  const validation = useMemo(
    () => validateAll(form, avatarUrl, accepted, requireOptional),
    [form, avatarUrl, accepted, requireOptional]
  );

  const doRegister = async () => {
    try {
      let genderCode = "unspecified";
      if (form.gender === "Nam") genderCode = "male";
      else if (form.gender === "Nữ") genderCode = "female";
      else if (form.gender === "Khác") genderCode = "other";

      const cleaned = {
        name: (form.name || "").trim(),
        nickname: (form.nickname || "").trim(),
        email: (form.email || "").trim(),
        phone: cleanPhone(form.phone || ""),
        gender: genderCode,
        dob: form.dob || undefined,
        province: form.province,
        password: form.password,
        avatar: avatarUrl,
      };

      const res = await register(cleaned).unwrap();

      if (res?.otpRequired) {
        router.push({
          pathname: "/verify-otp",
          params: {
            registerToken: res.registerToken,
            phoneMasked: res.phoneMasked || "",
            devOtp: res.devOtp || "",
          },
        });
        return;
      }

      dispatch(setCredentials(res));
      await saveUserInfo(res);
      router.replace("/(tabs)");
    } catch (err) {
      const raw = err?.data?.message || err?.error || "Đăng ký thất bại";
      Alert.alert("Lỗi", raw);
    }
  };

  const onSubmit = async () => {
    setShowErrors(true);
    if (validation.hasErrors) {
      Alert.alert("Thiếu/Không hợp lệ", validation.messages.join("\n"));
      return;
    }

    if (!requireOptional) {
      const missing = [];
      if (!cleanPhone(form.phone || "")) missing.push("Số điện thoại");
      if (!form.gender) missing.push("Giới tính");
      if (!form.province) missing.push("Tỉnh/Thành phố");

      if (missing.length > 0) {
        setMissingOptionalFields(missing);
        setOptionalModalOpen(true);
        return;
      }
    }

    await doRegister();
  };

  const submitDisabled = isLoading || uploadingAvatar || avatarSaving;
  const shouldRedirect = !!userInfo;

  const safeAvatar = (() => {
    const u = normalizeUrl(avatarUrl || "");
    return u ? String(u).replace(/\\/g, "/") : undefined;
  })();

  return shouldRedirect ? (
    <Redirect href="/(tabs)" />
  ) : (
    <>
      <Stack.Screen
        options={{ title: "Đăng ký", headerTitleAlign: "center" }}
      />
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: "padding", android: undefined })}
        style={{ flex: 1 }}
      >
        {/* QUAN TRỌNG: keyboardShouldPersistTaps="handled" để bấm được nút khi phím đang hiện */}
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <RegisterGlassSurface
            effect="regular"
            tintColor={
              isDark ? "rgba(22,24,29,0.68)" : "rgba(255,255,255,0.84)"
            }
            style={[
              styles.card,
              IOS_26_LIQUID_GLASS_ENABLED && styles.glassPanel,
              { backgroundColor: cardBg, borderColor: border },
            ]}
          >
            {/* ... Phần Avatar giữ nguyên ... */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                marginBottom: 8,
              }}
            >
              {/* (Giữ nguyên code Avatar như cũ) */}
              <Pressable
                onPress={() => safeAvatar && setViewerOpen(true)}
                style={({ pressed }) => [{ opacity: pressed ? 0.97 : 1 }]}
              >
                <RegisterGlassSurface
                  interactive={!!safeAvatar}
                  tintColor={
                    isDark ? "rgba(34,37,42,0.7)" : "rgba(243,245,249,0.86)"
                  }
                  style={[
                    styles.avatarWrap,
                    IOS_26_LIQUID_GLASS_ENABLED && styles.glassControl,
                    {
                      backgroundColor: isDark ? "#22252a" : "#f3f5f9",
                      borderColor: border,
                    },
                  ]}
                >
                  {safeAvatar ? (
                    <ExpoImage
                      source={{ uri: normalizeUrl(safeAvatar) }}
                      style={{ width: 80, height: 80, borderRadius: 40 }}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      transition={150}
                    />
                  ) : (
                    <View
                      style={{
                        width: 80,
                        height: 80,
                        borderRadius: 40,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <MaterialIcons
                        name="person"
                        size={34}
                        color={isDark ? "#909399" : "#9aa0a6"}
                      />
                    </View>
                  )}
                </RegisterGlassSurface>
              </Pressable>

              <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
                <Pressable
                  onPress={async () => {
                    const f = await pickImage();
                    if (!f) return;
                    setAvatarTemp(f);
                    setAvatarConfirmOpen(true);
                  }}
                  style={({ pressed }) => [{ opacity: pressed ? 0.95 : 1 }]}
                >
                  <RegisterGlassSurface
                    interactive
                    tintColor={
                      isDark
                        ? "rgba(34,37,42,0.66)"
                        : "rgba(243,245,249,0.84)"
                    }
                    style={[
                      styles.btn,
                      styles.btnOutline,
                      IOS_26_LIQUID_GLASS_ENABLED && styles.glassButton,
                      {
                        borderColor: border,
                        backgroundColor: isDark ? "#22252a" : "#f3f5f9",
                      },
                    ]}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <MaterialIcons
                        name="photo-camera"
                        size={18}
                        color={textPrimary}
                      />
                      <Text
                        style={[
                          styles.btnText,
                          {
                            color:
                              showErrors && validation.avatar
                                ? danger
                                : textPrimary,
                          },
                        ]}
                      >
                        Chọn ảnh đại diện *
                      </Text>
                    </View>
                  </RegisterGlassSurface>
                </Pressable>
                {!!safeAvatar && (
                  <Pressable
                    onPress={() => setAvatarUrl("")}
                    style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
                  >
                    <RegisterGlassSurface
                      interactive
                      tintColor={
                        isDark
                          ? "rgba(229,57,53,0.14)"
                          : "rgba(254,226,226,0.78)"
                      }
                      style={[
                        styles.btn,
                        styles.btnTextOnly,
                        IOS_26_LIQUID_GLASS_ENABLED && styles.glassButton,
                      ]}
                    >
                      <Text style={[styles.btnText, { color: danger }]}>
                        Xóa ảnh
                      </Text>
                    </RegisterGlassSurface>
                  </Pressable>
                )}
              </View>
            </View>
            {showErrors && validation.avatar ? (
              <Text style={[styles.errorText, { color: danger }]}>
                {validation.avatar}
              </Text>
            ) : null}

            {/* Fields */}
            <Field
              label="Họ và tên"
              value={form.name}
              onChangeText={(v) => handleChange("name", v)}
              border={border}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
              required
              error={showErrors && !!validation.fields.name}
              helperText={showErrors ? validation.fields.name : ""}
            />
            <Field
              label="Nickname"
              value={form.nickname}
              onChangeText={(v) => handleChange("nickname", v)}
              border={border}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
              required
              error={showErrors && !!validation.fields.nickname}
              helperText={showErrors ? validation.fields.nickname : ""}
            />
            <Field
              label="Email"
              value={form.email}
              onChangeText={(v) => handleChange("email", v)}
              border={border}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
              keyboardType="email-address"
              required
              error={showErrors && !!validation.fields.email}
              helperText={showErrors ? validation.fields.email : ""}
            />
            <Field
              label="Số điện thoại"
              value={form.phone}
              onChangeText={(v) => handleChange("phone", v)}
              border={border}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
              keyboardType="phone-pad"
              required={requireOptional}
              error={showErrors && !!validation.fields.phone}
              helperText={showErrors ? validation.fields.phone : ""}
            />
            <Field
              label="Số CCCD"
              value={form.cccd}
              onChangeText={(v) => handleChange("cccd", v)}
              border={border}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
              keyboardType="number-pad"
              maxLength={12}
              required={requireOptional}
              error={showErrors && !!validation.fields.cccd}
              helperText={showErrors ? validation.fields.cccd : ""}
            />

            {/* Gender - Thay đổi thành SelectTrigger */}
            <SelectTrigger
              label="Giới tính"
              value={form.gender}
              placeholder="Chọn giới tính"
              onPress={() => handleOpenPicker(setGenderPickerOpen)}
              border={border}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
              required={requireOptional}
              error={showErrors && !!validation.fields.gender}
              helperText={showErrors ? validation.fields.gender : ""}
            />

            {/* DOB - Giữ nguyên logic, chỉ chỉnh style trigger */}
            <SelectTrigger
              label="Ngày sinh"
              value={form.dob ? formatDobLabel(form.dob) : ""}
              placeholder="Chọn ngày sinh"
              onPress={openDobPicker}
              border={border}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
              required={requireOptional}
              error={showErrors && !!validation.fields.dob}
              helperText={showErrors ? validation.fields.dob : ""}
            />

            {/* Province - Thay đổi thành SelectTrigger */}
            <SelectTrigger
              label="Tỉnh/Thành phố"
              value={form.province}
              placeholder="Chọn tỉnh/thành"
              onPress={() => handleOpenPicker(setProvincePickerOpen)}
              border={border}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
              required={requireOptional}
              error={showErrors && !!validation.fields.province}
              helperText={showErrors ? validation.fields.province : ""}
            />

            {/* Password */}
            <Field
              label="Mật khẩu"
              value={form.password}
              onChangeText={(v) => handleChange("password", v)}
              border={border}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
              secureTextEntry
              required
              error={showErrors && !!validation.fields.password}
              helperText={showErrors ? validation.fields.password : ""}
              onFocus={handleFocusPassword} // <--- Thêm dòng này
            />
            <Field
              label="Xác nhận mật khẩu"
              value={form.confirmPassword}
              onChangeText={(v) => handleChange("confirmPassword", v)}
              border={border}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
              secureTextEntry
              required
              error={showErrors && !!validation.fields.confirmPassword}
              helperText={showErrors ? validation.fields.confirmPassword : ""}
              onFocus={handleFocusPassword} // <--- Thêm dòng này
            />

            {/* Terms */}
            <View style={{ marginTop: 8, marginBottom: 8 }}>
              <Pressable
                onPress={() => setAccepted((v) => !v)}
                style={({ pressed }) => [
                  styles.checkboxRow,
                  pressed && { opacity: 0.95 },
                ]}
              >
                <RegisterGlassSurface
                  interactive
                  tintColor={
                    accepted
                      ? rgbaFromHex(tint, isDark ? 0.72 : 0.62)
                      : isDark
                      ? "rgba(34,37,42,0.58)"
                      : "rgba(255,255,255,0.72)"
                  }
                  style={[
                    styles.checkboxBox,
                    IOS_26_LIQUID_GLASS_ENABLED && styles.glassPill,
                    {
                      borderColor: accepted
                        ? tint
                        : showErrors && validation.fields.terms
                        ? "#e53935"
                        : border,
                      backgroundColor: accepted ? tint : "transparent",
                    },
                  ]}
                >
                  {accepted ? <Text style={styles.checkboxTick}>✓</Text> : null}
                </RegisterGlassSurface>
                <Text style={{ color: textSecondary }}>
                  Tôi đồng ý{" "}
                  <Text
                    style={{ color: tint }}
                    onPress={() => setTermsOpen(true)}
                    suppressHighlighting
                  >
                    Điều khoản sử dụng
                  </Text>{" "}
                  &{" "}
                  <Text
                    style={{ color: tint }}
                    onPress={() => setTermsOpen(true)}
                    suppressHighlighting
                  >
                    Chính sách quyền riêng tư
                  </Text>
                  .
                </Text>
              </Pressable>
              {showErrors && validation.fields.terms ? (
                <Text
                  style={[styles.errorText, { color: danger, marginTop: 6 }]}
                >
                  {validation.fields.terms}
                </Text>
              ) : null}
            </View>

            {/* Submit */}
            <Pressable
              onPress={onSubmit}
              disabled={submitDisabled}
              style={({ pressed }) => [
                { opacity: submitDisabled ? 0.72 : pressed ? 0.95 : 1 },
              ]}
            >
              <RegisterGlassSurface
                interactive={!submitDisabled}
                tintColor={
                  submitDisabled
                    ? "rgba(148,163,184,0.54)"
                    : rgbaFromHex(tint, isDark ? 0.72 : 0.62)
                }
                style={[
                  styles.btn,
                  IOS_26_LIQUID_GLASS_ENABLED && styles.glassPrimaryBtn,
                  { backgroundColor: submitDisabled ? "#9aa0a6" : tint },
                ]}
              >
                <Text style={styles.btnTextWhite}>
                  {isLoading || uploadingAvatar || avatarSaving
                    ? "Đang xử lý…"
                    : "Đăng ký"}
                </Text>
              </RegisterGlassSurface>
            </Pressable>

            {/* Login Link */}
            <View style={{ alignItems: "center", marginTop: 6 }}>
              <Text style={{ color: textSecondary }}>
                Đã có tài khoản?{" "}
                <Text
                  style={{ color: tint, fontWeight: "700" }}
                  onPress={() => router.push("/login")}
                  suppressHighlighting
                >
                  Đăng nhập
                </Text>
              </Text>
            </View>
          </RegisterGlassSurface>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* --- CÁC MODAL --- */}

      {/* 1. Modal thiếu info (giữ nguyên) */}
      <Modal
        visible={optionalModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setOptionalModalOpen(false)}
      >
        {/* (Giữ nguyên nội dung modal này như cũ) */}
        <View style={styles.modalBackdropCenter}>
          <RegisterGlassSurface
            effect="regular"
            tintColor={
              isDark ? "rgba(22,24,29,0.7)" : "rgba(255,255,255,0.88)"
            }
            style={[
              styles.previewCard,
              IOS_26_LIQUID_GLASS_ENABLED && styles.glassModal,
              { backgroundColor: cardBg, borderColor: border },
            ]}
          >
            <Text style={[styles.modalTitle, { color: textPrimary }]}>
              Bổ sung thông tin?
            </Text>
            <Text
              style={{ color: textSecondary, marginTop: 8, lineHeight: 20 }}
            >
              Bạn chưa nhập các trường sau:
            </Text>
            <View style={{ marginTop: 6, marginBottom: 4 }}>
              {missingOptionalFields.map((f) => (
                <Text
                  key={f}
                  style={{ color: textSecondary, lineHeight: 20 }}
                >{`• ${f}`}</Text>
              ))}
            </View>
            <Text
              style={{
                color: textSecondary,
                fontSize: 12,
                marginTop: 6,
                lineHeight: 18,
              }}
            >
              Các thông tin này giúp BTC giải liên hệ và xếp bảng đấu chính xác
              hơn. Bạn có thể bỏ qua và bổ sung sau.
            </Text>
            <View
              style={{
                flexDirection: "row",
                gap: 10,
                marginTop: 14,
                justifyContent: "center",
              }}
            >
              <Pressable
                disabled={submitDisabled}
                onPress={() => setOptionalModalOpen(false)}
                style={({ pressed }) => [
                  { opacity: submitDisabled ? 0.6 : pressed ? 0.95 : 1 },
                ]}
              >
                <RegisterGlassSurface
                  interactive={!submitDisabled}
                  tintColor={
                    isDark
                      ? "rgba(34,37,42,0.66)"
                      : "rgba(255,255,255,0.78)"
                  }
                  style={[
                    styles.btn,
                    styles.btnOutline,
                    IOS_26_LIQUID_GLASS_ENABLED && styles.glassButton,
                    { borderColor: border, minWidth: 110 },
                  ]}
                >
                  <Text style={[styles.btnText, { color: textPrimary }]}>
                    Điền tiếp
                  </Text>
                </RegisterGlassSurface>
              </Pressable>
              <Pressable
                disabled={submitDisabled}
                onPress={async () => {
                  setOptionalModalOpen(false);
                  await doRegister();
                }}
                style={({ pressed }) => [
                  { opacity: submitDisabled ? 0.7 : pressed ? 0.92 : 1 },
                ]}
              >
                <RegisterGlassSurface
                  interactive={!submitDisabled}
                  tintColor={rgbaFromHex(tint, isDark ? 0.72 : 0.62)}
                  style={[
                    styles.btn,
                    IOS_26_LIQUID_GLASS_ENABLED && styles.glassPrimaryBtn,
                    { backgroundColor: tint, minWidth: 150 },
                  ]}
                >
                  {submitDisabled ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.btnTextWhite}>Bỏ qua và đăng ký</Text>
                  )}
                </RegisterGlassSurface>
              </Pressable>
            </View>
          </RegisterGlassSurface>
        </View>
      </Modal>

      {/* 2. Terms Modal (giữ nguyên) */}
      <TermsModal
        open={termsOpen}
        onClose={() => setTermsOpen(false)}
        onAgree={() => {
          setAccepted(true);
          setTermsOpen(false);
        }}
        border={border}
        cardBg={cardBg}
        textPrimary={textPrimary}
        textSecondary={textSecondary}
        tint={tint}
      />

      {/* 3. DOB Picker Modal (giữ nguyên style cũ) */}
      <Modal
        visible={dobPickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setDobPickerOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          {/* Backdrop click to close */}
          <TouchableWithoutFeedback onPress={() => setDobPickerOpen(false)}>
            <View style={{ flex: 1 }} />
          </TouchableWithoutFeedback>
          <RegisterGlassSurface
            effect="regular"
            tintColor={
              isDark ? "rgba(22,24,29,0.72)" : "rgba(255,255,255,0.9)"
            }
            style={[
              styles.modalCard,
              IOS_26_LIQUID_GLASS_ENABLED && styles.glassModal,
              { backgroundColor: cardBg, borderColor: border },
            ]}
          >
            <View
              style={[
                styles.modalHeader,
                { borderBottomWidth: 1, borderColor: border },
              ]}
            >
              <Pressable
                onPress={() => setDobPickerOpen(false)}
                style={styles.modalBtn}
              >
                <Text style={[styles.modalBtnText, { color: textPrimary }]}>
                  Đóng
                </Text>
              </Pressable>
              <Text style={[styles.modalTitle, { color: textPrimary }]}>
                Chọn ngày sinh
              </Text>
              <Pressable
                onPress={() => {
                  if (dobDraft) commitDob(dobDraft);
                  setDobPickerOpen(false);
                }}
                style={styles.modalBtn}
              >
                <Text style={[styles.modalBtnText, { color: tint }]}>Xong</Text>
              </Pressable>
            </View>
            <View style={styles.dobPickerWrap}>
              <DateTimePicker
                value={
                  dobDraft || parseDobString(form.dob) || new Date(2000, 0, 1)
                }
                mode="date"
                display="spinner"
                maximumDate={new Date()}
                minimumDate={new Date(1900, 0, 1)}
                locale="vi-VN"
                themeVariant={isDark ? "dark" : "light"}
                style={styles.dobPicker}
                onChange={(event, selectedDate) => {
                  if (Platform.OS === "android") {
                    if (event.type === "set" && selectedDate)
                      commitDob(selectedDate);
                    setDobPickerOpen(false);
                  } else {
                    if (selectedDate) setDobDraft(selectedDate);
                  }
                }}
              />
            </View>
          </RegisterGlassSurface>
        </View>
      </Modal>

      {/* 4. NEW: Province Picker (Tái sử dụng style của DOB Picker) */}
      <BottomOptionPicker
        visible={provincePickerOpen}
        title="Chọn Tỉnh / Thành phố"
        options={PROVINCES}
        selected={form.province}
        onClose={() => setProvincePickerOpen(false)}
        onSelect={(val) => {
          handleChange("province", val);
        }}
        cardBg={cardBg}
        border={border}
        textPrimary={textPrimary}
        tint={tint}
      />

      {/* 5. NEW: Gender Picker (Tái sử dụng style của DOB Picker) */}
      <BottomOptionPicker
        visible={genderPickerOpen}
        title="Chọn Giới tính"
        options={GENDERS}
        selected={form.gender}
        onClose={() => setGenderPickerOpen(false)}
        onSelect={(val) => {
          handleChange("gender", val);
        }}
        cardBg={cardBg}
        border={border}
        textPrimary={textPrimary}
        tint={tint}
      />

      {/* 6. Avatar Confirm (giữ nguyên) */}
      <Modal
        visible={avatarConfirmOpen}
        transparent
        animationType="fade"
        onRequestClose={() => !avatarSaving && setAvatarConfirmOpen(false)}
      >
        {/* (Giữ nguyên nội dung) */}
        <View style={styles.modalBackdropCenter}>
          <RegisterGlassSurface
            effect="regular"
            tintColor={
              isDark ? "rgba(22,24,29,0.7)" : "rgba(255,255,255,0.88)"
            }
            style={[
              styles.previewCard,
              IOS_26_LIQUID_GLASS_ENABLED && styles.glassModal,
              { backgroundColor: cardBg, borderColor: border },
            ]}
          >
            <Text style={[styles.modalTitle, { color: textPrimary }]}>
              Xác nhận ảnh đại diện
            </Text>
            {!!avatarTemp?.uri && (
              <ExpoImage
                source={{ uri: avatarTemp.uri }}
                style={{
                  width: 200,
                  height: 200,
                  borderRadius: 100,
                  alignSelf: "center",
                }}
                contentFit="cover"
                cachePolicy="none"
                transition={100}
              />
            )}
            <Text
              style={{
                marginTop: 10,
                color: textSecondary,
                textAlign: "center",
                fontSize: 12,
              }}
            >
              Ảnh sẽ được tải lên và cập nhật ngay khi bạn bấm Xác nhận.
            </Text>
            <View
              style={{
                flexDirection: "row",
                gap: 10,
                marginTop: 14,
                justifyContent: "center",
              }}
            >
              <Pressable
                disabled={avatarSaving}
                onPress={() => {
                  setAvatarConfirmOpen(false);
                  setAvatarTemp(null);
                }}
                style={({ pressed }) => [
                  { opacity: avatarSaving ? 0.6 : pressed ? 0.95 : 1 },
                ]}
              >
                <RegisterGlassSurface
                  interactive={!avatarSaving}
                  tintColor={
                    isDark
                      ? "rgba(34,37,42,0.66)"
                      : "rgba(255,255,255,0.78)"
                  }
                  style={[
                    styles.btn,
                    styles.btnOutline,
                    IOS_26_LIQUID_GLASS_ENABLED && styles.glassButton,
                    { borderColor: border, minWidth: 100 },
                  ]}
                >
                  <Text style={[styles.btnText, { color: textPrimary }]}>
                    Huỷ
                  </Text>
                </RegisterGlassSurface>
              </Pressable>
              <Pressable
                disabled={avatarSaving || !avatarTemp}
                onPress={async () => {
                  if (!avatarTemp) return;
                  setAvatarSaving(true);
                  try {
                    const up = await uploadAvatar(avatarTemp).unwrap();
                    const url = up?.url || up?.data?.url;
                    if (!url) throw new Error("Không nhận được URL ảnh");
                    setAvatarUrl(url);
                    setAvatarConfirmOpen(false);
                    setAvatarTemp(null);
                  } catch (e) {
                    Alert.alert(
                      "Lỗi",
                      e?.data?.message || e?.message || "Upload ảnh thất bại"
                    );
                  } finally {
                    setAvatarSaving(false);
                  }
                }}
                style={({ pressed }) => [
                  { opacity: avatarSaving ? 0.7 : pressed ? 0.92 : 1 },
                ]}
              >
                <RegisterGlassSurface
                  interactive={!avatarSaving && !!avatarTemp}
                  tintColor={rgbaFromHex(tint, isDark ? 0.72 : 0.62)}
                  style={[
                    styles.btn,
                    IOS_26_LIQUID_GLASS_ENABLED && styles.glassPrimaryBtn,
                    { backgroundColor: tint, minWidth: 120 },
                  ]}
                >
                  {avatarSaving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.btnTextWhite}>Xác nhận</Text>
                  )}
                </RegisterGlassSurface>
              </Pressable>
            </View>
          </RegisterGlassSurface>
        </View>
      </Modal>

      <ImageView
        images={safeAvatar ? [{ uri: normalizeUrl(safeAvatar) }] : []}
        visible={viewerOpen}
        onRequestClose={() => setViewerOpen(false)}
        backgroundColor={isDark ? "#0b0b0c" : "#ffffff"}
      />
    </>
  );
}

/* ==================== Subcomponents (Mới & Cũ) ==================== */

// Component trigger đơn giản (chỉ hiển thị box input)
function SelectTrigger({
  label,
  value,
  onPress,
  placeholder,
  border,
  textPrimary,
  textSecondary,
  required,
  error,
  helperText,
}) {
  const danger = "#e53935";
  const scheme = useColorScheme() ?? "light";
  const isDark = scheme === "dark";
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={[styles.label, { color: textSecondary }]}>
        {label}
        {required ? " *" : ""}
      </Text>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [{ opacity: pressed ? 0.95 : 1 }]}
      >
        <RegisterGlassSurface
          interactive
          tintColor={
            error
              ? "rgba(229,57,53,0.16)"
              : isDark
              ? "rgba(34,37,42,0.62)"
              : "rgba(255,255,255,0.78)"
          }
          style={[
            styles.inputShell,
            styles.selectGlassRow,
            IOS_26_LIQUID_GLASS_ENABLED && styles.glassInput,
            {
              borderColor: error ? danger : border,
              backgroundColor: isDark ? "#1f2228" : "#ffffff",
            },
          ]}
        >
          <Text
            numberOfLines={1}
            style={{
              color: value ? textPrimary : "#9aa0a6",
              flex: 1,
              fontSize: 16,
            }}
          >
            {value || placeholder}
          </Text>
          <Text style={{ color: "#9aa0a6" }}>▼</Text>
        </RegisterGlassSurface>
      </Pressable>
      {error ? (
        <Text style={[styles.errorText, { color: danger }]}>{helperText}</Text>
      ) : null}
    </View>
  );
}

// NEW: Bottom Picker chung cho Tỉnh & Giới tính (Giao diện giống DatePicker)
function BottomOptionPicker({
  visible,
  title,
  options,
  selected,
  onClose,
  onSelect,
  cardBg,
  border,
  textPrimary,
  tint,
}) {
  const scheme = useColorScheme() ?? "light";
  const isDark = scheme === "dark";
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={{ flex: 1 }} />
        </TouchableWithoutFeedback>
        <RegisterGlassSurface
          effect="regular"
          tintColor={
            isDark ? "rgba(22,24,29,0.72)" : "rgba(255,255,255,0.9)"
          }
          style={[
            styles.modalCard,
            IOS_26_LIQUID_GLASS_ENABLED && styles.glassModal,
            { backgroundColor: cardBg, borderColor: border, maxHeight: "50%" },
          ]}
        >
          {/* Header giống DatePicker */}
          <View
            style={[
              styles.modalHeader,
              { borderBottomWidth: 1, borderColor: border },
            ]}
          >
            {/* Nút Đóng */}
            <Pressable onPress={onClose} style={styles.modalBtn}>
              <Text style={[styles.modalBtnText, { color: textPrimary }]}>
                Đóng
              </Text>
            </Pressable>

            <Text style={[styles.modalTitle, { color: textPrimary }]}>
              {title}
            </Text>

            {/* Dummy view để cân title ra giữa */}
            <View style={styles.modalBtn}>
              <Text style={[styles.modalBtnText, { color: "transparent" }]}>
                Đóng
              </Text>
            </View>
          </View>

          {/* Content List */}
          <FlatList
            data={options}
            keyExtractor={(item) => item}
            renderItem={({ item }) => {
              const isSelected = item === selected;
              return (
                <Pressable
                  onPress={() => {
                    onSelect(item);
                    onClose();
                  }} // Chọn xong tự đóng
                  style={({ pressed }) => [
                    {
                      padding: 16,
                      borderBottomWidth: 1,
                      borderBottomColor: border,
                      flexDirection: "row",
                      justifyContent: "center",
                      backgroundColor: pressed
                        ? cardBg === "#ffffff"
                          ? "#f5f5f5"
                          : "#222"
                        : "transparent",
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 18,
                      color: isSelected ? tint : textPrimary,
                      fontWeight: isSelected ? "700" : "400",
                    }}
                  >
                    {item}
                  </Text>
                </Pressable>
              );
            }}
          />
        </RegisterGlassSurface>
      </View>
    </Modal>
  );
}

// Field Input thường (Giữ nguyên)
// Thay thế function Field cũ bằng đoạn này:
function Field({
  label,
  value,
  onChangeText,
  keyboardType = "default",
  secureTextEntry = false, // Đây là giá trị mặc định từ cha truyền xuống
  maxLength,
  required = false,
  border,
  textPrimary,
  textSecondary,
  error = false,
  helperText = "",
  ...props
}) {
  const danger = "#e53935";
  const scheme = useColorScheme() ?? "light";
  const isDark = scheme === "dark";

  // State để quản lý việc ẩn/hiện mật khẩu
  // Nếu field này không phải password (secureTextEntry=false) thì luôn hiện (isVisible=true)
  const [isVisible, setIsVisible] = useState(!secureTextEntry);

  const toggleVisibility = () => {
    setIsVisible(!isVisible);
  };

  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={[styles.label, { color: textSecondary }]}>
        {label}
        {required ? " *" : ""}
      </Text>

      {/* Container chứa Input và Icon */}
      <View style={{ justifyContent: "center" }}>
        <RegisterGlassSurface
          interactive
          tintColor={
            error
              ? "rgba(229,57,53,0.16)"
              : isDark
              ? "rgba(34,37,42,0.62)"
              : "rgba(255,255,255,0.78)"
          }
          style={[
            styles.inputShell,
            IOS_26_LIQUID_GLASS_ENABLED && styles.glassInput,
            {
              borderColor: error ? danger : border,
              backgroundColor: isDark ? "#1f2228" : "#ffffff",
            },
          ]}
        >
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={label}
            placeholderTextColor="#9aa0a6"
            style={[
              styles.inputInside,
              {
                color: textPrimary,
                paddingRight: secureTextEntry ? 45 : 14,
              },
            ]}
            keyboardType={keyboardType}
            secureTextEntry={secureTextEntry && !isVisible}
            maxLength={maxLength}
            autoCapitalize="none"
            autoCorrect={false}
            {...props}
          />
        </RegisterGlassSurface>

        {/* Chỉ hiện icon con mắt nếu props secureTextEntry được truyền vào là true */}
        {secureTextEntry && (
          <Pressable
            onPress={toggleVisibility}
            style={{
              position: "absolute",
              right: 12,
              padding: 4, // Tăng vùng bấm cho dễ
            }}
            hitSlop={10} // Tăng vùng cảm ứng xung quanh
          >
            <MaterialIcons
              name={isVisible ? "visibility" : "visibility-off"}
              size={22}
              color="#9aa0a6"
            />
          </Pressable>
        )}
      </View>

      {error ? (
        <Text style={[styles.errorText, { color: danger }]}>{helperText}</Text>
      ) : null}
    </View>
  );
}

// Terms Modal (Giữ nguyên nội dung text)
function TermsModal({
  open,
  onClose,
  onAgree,
  border,
  cardBg,
  textPrimary,
  textSecondary,
  tint,
}) {
  const scheme = useColorScheme() ?? "light";
  const isDark = scheme === "dark";
  return (
    <Modal
      visible={open}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <RegisterGlassSurface
          effect="regular"
          tintColor={
            isDark ? "rgba(22,24,29,0.72)" : "rgba(255,255,255,0.9)"
          }
          style={[
            styles.modalCard,
            IOS_26_LIQUID_GLASS_ENABLED && styles.glassModal,
            {
              backgroundColor: cardBg,
              borderColor: border,
              maxHeight: "90%",
            },
          ]}
        >
          <View
            style={[
              styles.modalHeader,
              { borderBottomWidth: 1, borderColor: border },
            ]}
          >
            <Pressable onPress={onClose} style={styles.modalBtn}>
              <Text style={[styles.modalBtnText, { color: textPrimary }]}>
                Đóng
              </Text>
            </Pressable>
            <Text style={[styles.modalTitle, { color: textPrimary }]}>
              Điều khoản & Chính sách
            </Text>
            <Pressable
              onPress={onAgree}
              style={({ pressed }) => [{ opacity: pressed ? 0.92 : 1 }]}
            >
              <RegisterGlassSurface
                interactive
                tintColor={rgbaFromHex(tint, isDark ? 0.72 : 0.62)}
                style={[
                  styles.modalBtn,
                  IOS_26_LIQUID_GLASS_ENABLED && styles.glassPill,
                  {
                    backgroundColor: tint,
                    borderRadius: 8,
                    paddingHorizontal: 10,
                  },
                ]}
              >
                <Text style={[styles.modalBtnText, { color: "#fff" }]}>
                  Đồng ý
                </Text>
              </RegisterGlassSurface>
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={true}
            contentContainerStyle={{
              paddingHorizontal: 14,
              paddingTop: 12,
              paddingBottom: 20,
            }}
          >
            <Text
              style={{ color: textSecondary, fontSize: 12, marginBottom: 4 }}
            >
              Cập nhật lần cuối: 06/12/2025
            </Text>

            <Text
              style={{ color: textPrimary, fontWeight: "700", marginTop: 12 }}
            >
              1) Giới thiệu
            </Text>
            <Text
              style={{ color: textSecondary, marginTop: 6, lineHeight: 20 }}
            >
              Ứng dụng dùng để quản lý/tham gia hoạt động pickleball. Bằng việc
              tạo tài khoản hoặc tiếp tục sử dụng, bạn đồng ý với tài liệu này.
            </Text>

            <Text
              style={{ color: textPrimary, fontWeight: "700", marginTop: 12 }}
            >
              2) Tài khoản
            </Text>
            <Text
              style={{ color: textSecondary, marginTop: 6, lineHeight: 20 }}
            >
              • Cung cấp thông tin chính xác và cập nhật.{"\n"}• Tự bảo mật mật
              khẩu; thông báo ngay nếu nghi ngờ truy cập trái phép.
            </Text>

            <Text
              style={{ color: textPrimary, fontWeight: "700", marginTop: 12 }}
            >
              3) Hành vi bị cấm
            </Text>
            <Text
              style={{ color: textSecondary, marginTop: 6, lineHeight: 20 }}
            >
              • Mạo danh, quấy rối, phát tán nội dung vi phạm pháp luật.{"\n"}•
              Can thiệp hệ thống, dò quét lỗ hổng, truy cập trái phép.
            </Text>

            <Text
              style={{ color: textPrimary, fontWeight: "700", marginTop: 12 }}
            >
              4) Nội dung do bạn cung cấp
            </Text>
            <Text
              style={{ color: textSecondary, marginTop: 6, lineHeight: 20 }}
            >
              • Bạn chịu trách nhiệm về thông tin/ảnh đã tải lên.{"\n"}• Chúng
              tôi có quyền sử dụng nội dung ở mức cần thiết để vận hành dịch vụ.
              {"\n"}• Ảnh CCCD (nếu cung cấp) chỉ dùng cho mục đích xác minh.
            </Text>

            <Text
              style={{ color: textPrimary, fontWeight: "700", marginTop: 12 }}
            >
              5) Quyền riêng tư (tóm tắt)
            </Text>
            <Text
              style={{ color: textSecondary, marginTop: 6, lineHeight: 20 }}
            >
              <Text style={{ fontWeight: "700", color: textPrimary }}>
                Dữ liệu thu thập
              </Text>
              {"\n"}• Tài khoản: nickname, mật khẩu (được mã hoá), email/SĐT
              (tuỳ chọn).{"\n"}• Hồ sơ (nếu bổ sung): họ tên, ngày sinh, giới
              tính, tỉnh/thành, CCCD & ảnh CCCD.{"\n"}• Kỹ thuật: thiết bị, thời
              gian đăng nhập, IP, log lỗi, thống kê sử dụng.{"\n\n"}
              <Text style={{ fontWeight: "700", color: textPrimary }}>
                Mục đích
              </Text>
              {"\n"}• Đăng nhập an toàn, vận hành tính năng, xác minh khi cần.
              {"\n"}• Phân tích và cải thiện trải nghiệm; phòng chống gian lận.
              {"\n\n"}
              <Text style={{ fontWeight: "700", color: textPrimary }}>
                Chia sẻ
              </Text>
              {"\n"}• Với nhà cung cấp hạ tầng theo hợp đồng bảo mật;{"\n"}• Với
              BTC giải khi bạn đăng ký tham gia;{"\n"}• Hoặc theo yêu cầu pháp
              luật.{"\n\n"}
              <Text style={{ fontWeight: "700", color: textPrimary }}>
                Lưu trữ & bảo mật
              </Text>
              {"\n"}• Truyền qua HTTPS, phân quyền truy cập; ảnh/giấy tờ giữ
              trong thời gian cần thiết.{"\n\n"}
              <Text style={{ fontWeight: "700", color: textPrimary }}>
                Quyền của bạn
              </Text>
              {"\n"}• Yêu cầu xem/sửa/xoá dữ liệu; rút đồng ý với dữ liệu tuỳ
              chọn.{"\n"}• Khi xoá tài khoản, dữ liệu cá nhân được gỡ; một phần
              có thể ẩn danh để giữ thống kê.
            </Text>

            <Text
              style={{ color: textPrimary, fontWeight: "700", marginTop: 12 }}
            >
              6) Camera & Quét QR CCCD
            </Text>
            <Text
              style={{ color: textSecondary, marginTop: 6, lineHeight: 20 }}
            >
              • Quét QR xử lý trên thiết bị, không lưu khung hình.{"\n"}• Ảnh
              CCCD chỉ dùng xác minh; có thể yêu cầu xoá sau khi hoàn tất.
            </Text>

            <Text
              style={{ color: textPrimary, fontWeight: "700", marginTop: 12 }}
            >
              7) Lưu phiên đăng nhập
            </Text>
            <Text
              style={{ color: textSecondary, marginTop: 6, lineHeight: 20 }}
            >
              • Ứng dụng lưu phiên để đăng nhập nhanh. Đăng xuất để xoá phiên
              trên thiết bị.
            </Text>

            <Text
              style={{ color: textPrimary, fontWeight: "700", marginTop: 12 }}
            >
              8) Chấm dứt & Đình chỉ
            </Text>
            <Text
              style={{ color: textSecondary, marginTop: 6, lineHeight: 20 }}
            >
              • Bạn có thể xoá tài khoản bất cứ lúc nào.{"\n"}• Chúng tôi có thể
              tạm ngưng/chấm dứt nếu có vi phạm hoặc rủi ro an ninh.
            </Text>

            <Text
              style={{ color: textPrimary, fontWeight: "700", marginTop: 12 }}
            >
              9) Miễn trừ & Giới hạn trách nhiệm
            </Text>
            <Text
              style={{ color: textSecondary, marginTop: 6, lineHeight: 20 }}
            >
              • Dịch vụ cung cấp như hiện có. Trong phạm vi luật cho phép,
              chúng tôi không chịu trách nhiệm cho thiệt hại gián tiếp/phát sinh
              do việc sử dụng.{"\n"}• Không điều nào ở đây loại trừ trách nhiệm
              pháp lý bắt buộc.
            </Text>

            <Text
              style={{ color: textPrimary, fontWeight: "700", marginTop: 12 }}
            >
              10) Thay đổi điều khoản
            </Text>
            <Text
              style={{ color: textSecondary, marginTop: 6, lineHeight: 20 }}
            >
              • Khi cập nhật đáng kể, ứng dụng sẽ thông báo; tiếp tục sử dụng
              tức là bạn chấp nhận bản mới.
            </Text>

            <Text
              style={{ color: textPrimary, fontWeight: "700", marginTop: 12 }}
            >
              11) Luật áp dụng & Liên hệ
            </Text>
            <Text
              style={{ color: textSecondary, marginTop: 6, lineHeight: 20 }}
            >
              • Áp dụng pháp luật Việt Nam; tranh chấp ưu tiên thương lượng, sau
              đó theo thẩm quyền.{"\n"}• Liên hệ: support@pickletour.vn
            </Text>
            <Text
              style={{ color: textPrimary, fontWeight: "700", marginTop: 12 }}
            >
              12) Giải đấu & Giải thưởng
            </Text>
            <Text
              style={{ color: textSecondary, marginTop: 6, lineHeight: 20 }}
            >
              • Ứng dụng có thể hiển thị thông tin về giải đấu, phần thưởng
              và/hoặc quà tặng do ban tổ chức giải cung cấp.{"\n"}• Apple Inc.
              không phải là nhà tài trợ và không liên quan dưới bất kỳ hình thức
              nào đến các giải đấu, cuộc thi hoặc chương trình khuyến mãi trong
              ứng dụng PickleTour.{"\n"}• Apple is not a sponsor and is not
              involved in any way with the contests or sweepstakes organized
              through the PickleTour app.
            </Text>

            <Text
              style={{
                color: textSecondary,
                fontStyle: "italic",
                marginTop: 12,
                lineHeight: 20,
              }}
            >
              Nhấn Đồng ý nghĩa là bạn đã đọc và chấp nhận Điều khoản & Chính
              Sách.
            </Text>
          </ScrollView>
        </RegisterGlassSurface>
      </View>
    </Modal>
  );
}
/* ==================== Styles ==================== */
const styles = StyleSheet.create({
  scroll: { flexGrow: 1, padding: 16 },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  glassPanel: {
    borderColor: "rgba(255,255,255,0.24)",
    overflow: "hidden",
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  avatarWrap: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    overflow: "hidden",
  },
  glassControl: {
    borderColor: "rgba(255,255,255,0.24)",
    overflow: "hidden",
  },
  label: { fontSize: 13, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.select({ ios: 12, android: 10 }),
    fontSize: 16,
    backgroundColor: "transparent",
  },
  inputShell: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  inputInside: {
    paddingHorizontal: 14,
    paddingVertical: Platform.select({ ios: 12, android: 10 }),
    fontSize: 16,
  },
  selectGlassRow: {
    paddingHorizontal: 14,
    paddingVertical: Platform.select({ ios: 12, android: 10 }),
    flexDirection: "row",
    alignItems: "center",
  },
  glassInput: {
    borderColor: "rgba(255,255,255,0.24)",
  },
  btn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
    overflow: "hidden",
  },
  glassButton: {
    borderColor: "rgba(255,255,255,0.26)",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  glassPrimaryBtn: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.34)",
    shadowColor: "#0a84ff",
    shadowOpacity: 0.24,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  btnText: { fontWeight: "700" },
  btnTextWhite: { color: "#fff", fontWeight: "700" },
  btnOutline: { borderWidth: 1 },
  btnTextOnly: { backgroundColor: "transparent" },
  checkboxRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  checkboxBox: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  glassPill: {
    borderColor: "rgba(255,255,255,0.28)",
    overflow: "hidden",
  },
  checkboxTick: { color: "#fff", fontWeight: "900", lineHeight: 18 },
  errorText: { fontSize: 12, marginTop: 6 },

  // Modal styles
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
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  previewCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  glassModal: {
    borderColor: "rgba(255,255,255,0.24)",
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 14 },
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
  },
  dobPickerWrap: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  dobPicker: {
    width: "100%",
    height: Platform.select({ ios: 216, android: 190 }),
  },
  modalBtn: { paddingHorizontal: 6, paddingVertical: 6 },
  modalBtnText: { fontWeight: "700" },
  modalTitle: { fontWeight: "700", fontSize: 16 },
});
