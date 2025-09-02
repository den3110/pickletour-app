import DateTimePicker from "@react-native-community/datetimepicker";
import { Picker } from "@react-native-picker/picker";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { router, Stack } from "expo-router";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Image,
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
} from "react-native";
import { useDispatch, useSelector } from "react-redux";

import { logout as logoutAction } from "@/slices/authSlice";
import {
  useUploadAvatarMutation,
  useUploadCccdMutation,
} from "@/slices/uploadApiSlice";
import {
  useGetProfileQuery,
  useLogoutMutation,
  useUpdateUserMutation,
} from "@/slices/usersApiSlice";
import { normalizeUrl } from "@/utils/normalizeUri";

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
function normalizeUri(url) {
  try {
    if (!url) return undefined;
    const lan = process.env.EXPO_PUBLIC_LAN_IP;
    if (!lan) return url;
    return url.replace(/localhost(\:\d+)?/i, `${lan}$1`);
  } catch {
    return url;
  }
}
async function pickImage(maxBytes = MAX_FILE_SIZE) {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.9,
  });
  if (res.canceled) return null;
  const asset = res.assets[0];
  const uri = asset.uri;
  const info = await FileSystem.getInfoAsync(uri, { size: true });
  if (info.size && info.size > maxBytes) {
    Alert.alert("Ảnh quá lớn", "Ảnh không được vượt quá 10MB.");
    return null;
  }
  const ext = (
    asset.fileName?.split(".").pop() ||
    uri.split(".").pop() ||
    "jpg"
  ).toLowerCase();
  const name = asset.fileName || `image.${ext}`;
  const type = asset.mimeType || (ext === "png" ? "image/png" : "image/jpeg");
  return { uri, name, type, size: info.size };
}
function yyyyMMdd(d) {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function ProfileScreen() {
  const scheme = useColorScheme() ?? "light";
  const tint = scheme === "dark" ? "#7cc0ff" : "#0a84ff";
  const cardBg = scheme === "dark" ? "#16181c" : "#ffffff";
  const textPrimary = scheme === "dark" ? "#fff" : "#111";
  const textSecondary = scheme === "dark" ? "#c9c9c9" : "#444";
  const border = scheme === "dark" ? "#2e2f33" : "#dfe3ea";
  const muted = scheme === "dark" ? "#22252a" : "#f3f5f9";

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
  const [logoutApiCall] = useLogoutMutation();
  const [uploadCccd, { isLoading: upLoad }] = useUploadCccdMutation();
  const [uploadAvatar, { isLoading: uploadingAvatar }] =
    useUploadAvatarMutation();

  // ===== Redirect rules =====
  // 1) Không có userInfo -> về login ngay
  useEffect(() => {
    if (!userInfo) {
      router.replace("/login");
    }
  }, [userInfo]);

  // 2) API profile trả 401 -> logout + về login
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

  const [frontImg, setFrontImg] = useState(null);
  const [backImg, setBackImg] = useState(null);

  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [uploadedAvatarUrl, setUploadedAvatarUrl] = useState("");

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

  const onLogout = async () => {
    try {
      await logoutApiCall().unwrap();
      dispatch(logoutAction());
      router.replace("/login");
    } catch (err) {
      Alert.alert("Lỗi", err?.data?.message || "Đăng xuất thất bại");
    }
  };

  // ===== Render gate =====
  // Không có userInfo: đã trigger replace ở effect, return null để tránh flicker
  if (!userInfo) {
    return null;
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
  const frontUrl = normalizeUri(user.cccdImages?.front) || "";
  const backUrl = normalizeUri(user.cccdImages?.back) || "";

  return (
    <>
      <Stack.Screen options={{ title: "Hồ sơ", headerTitleAlign: "center" }} />
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: "padding", android: undefined })}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll}>
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
            />

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
            />
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
                  />
                  <PickBox
                    label="Mặt sau"
                    file={backImg}
                    onPick={async () => setBackImg(await pickImage())}
                    border={border}
                    muted={muted}
                  />
                </View>
                <Pressable
                  onPress={sendCccd}
                  disabled={!frontImg || !backImg || upLoad}
                  style={({ pressed }) => [
                    styles.btn,
                    {
                      backgroundColor:
                        !frontImg || !backImg || upLoad ? "#9aa0a6" : tint,
                    },
                    pressed && { opacity: 0.92 },
                  ]}
                >
                  <Text style={styles.btnTextWhite}>
                    {upLoad ? "Đang gửi…" : "Gửi ảnh xác minh"}
                  </Text>
                </Pressable>
              </>
            ) : (
              <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
                <PreviewBox
                  uri={normalizeUrl(frontUrl)}
                  label="Mặt trước"
                  border={border}
                />
                <PreviewBox
                  uri={normalizeUrl(backUrl)}
                  label="Mặt sau"
                  border={border}
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

          {/* Logout */}
          <Pressable
            onPress={onLogout}
            style={({ pressed }) => [
              styles.btn,
              styles.btnOutline,
              { borderColor: "#e53935", marginBottom: 100 },
              pressed && { opacity: 0.9 },
            ]}
          >
            <Text style={[styles.btnText, { color: "#e53935" }]}>
              Đăng xuất
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
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
        placeholder={placeholder}
        placeholderTextColor="#9aa0a6"
        style={[styles.input, { borderColor: border, color: textPrimary }]}
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
}) {
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
          { borderColor: border },
          pressed && { opacity: 0.95 },
        ]}
      >
        <Text style={{ color: value ? textPrimary : "#9aa0a6", fontSize: 16 }}>
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
          <View style={[styles.modalCard, { borderColor: border }]}>
            <View style={styles.modalHeader}>
              <Pressable onPress={() => setOpen(false)} style={styles.modalBtn}>
                <Text style={styles.modalBtnText}>Hủy</Text>
              </Pressable>
              <Text style={styles.modalTitle}>{label}</Text>
              <Pressable
                onPress={() => {
                  onChange(temp);
                  setOpen(false);
                }}
                style={styles.modalBtn}
              >
                <Text style={styles.modalBtnText}>Xong</Text>
              </Pressable>
            </View>
            <Picker
              selectedValue={temp}
              onValueChange={(v) => setTemp(String(v))}
            >
              {options.map((o) => (
                <Picker.Item key={o.value} label={o.label} value={o.value} />
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
}) {
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
          { borderColor: border },
          pressed && { opacity: 0.95 },
        ]}
      >
        <Text style={{ color: value ? textPrimary : "#9aa0a6", fontSize: 16 }}>
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
            <View style={[styles.modalCard, { borderColor: border }]}>
              <View style={styles.modalHeader}>
                <Pressable
                  onPress={() => setOpen(false)}
                  style={styles.modalBtn}
                >
                  <Text style={styles.modalBtnText}>Hủy</Text>
                </Pressable>
                <Text style={styles.modalTitle}>{label}</Text>
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
                onChange={(_, d) => {
                  if (d) setTemp(d);
                }}
                maximumDate={new Date()}
              />
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

function PickBox({ label, file, onPick, border, muted }) {
  return (
    <View
      style={[styles.pickBox, { borderColor: border, backgroundColor: muted }]}
    >
      {file?.uri ? (
        <Image
          source={{ uri: file.uri }}
          style={{ width: "100%", height: 120, borderRadius: 8 }}
          resizeMode="cover"
        />
      ) : (
        <View
          style={{
            width: "100%",
            height: 120,
            borderRadius: 8,
            backgroundColor: "rgba(0,0,0,0.06)",
          }}
        />
      )}
      <Text style={{ textAlign: "center", marginTop: 6 }}>{label}</Text>
      <Pressable
        onPress={onPick}
        style={({ pressed }) => [
          styles.btn,
          styles.btnTiny,
          pressed && { opacity: 0.9 },
        ]}
      >
        <Text style={styles.btnText}>Chọn ảnh</Text>
      </Pressable>
    </View>
  );
}
function PreviewBox({ uri, label, border }) {
  
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
            backgroundColor: "rgba(0,0,0,0.06)",
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
