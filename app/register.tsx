// app/register/index.jsx  (hoặc src/screens/RegisterScreen.jsx)
import React, { useEffect, useMemo, useState } from "react";
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
import DateTimePicker from "@react-native-community/datetimepicker";
import { Picker } from "@react-native-picker/picker";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { Stack, router } from "expo-router";
import { useDispatch, useSelector } from "react-redux";

import { useRegisterMutation } from "@/slices/usersApiSlice";
import { useUploadAvatarMutation } from "@/slices/uploadApiSlice";
import { setCredentials } from "@/slices/authSlice";
import { normalizeUrl } from "@/utils/normalizeUri";

/* ---------- Constants ---------- */
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const GENDER_OPTIONS = [
  { value: "unspecified", label: "--" },
  { value: "male", label: "Nam" },
  { value: "female", label: "Nữ" },
  { value: "other", label: "Khác" },
];
const PROVINCES = [
  "An Giang","Bà Rịa-Vũng Tàu","Bạc Liêu","Bắc Giang","Bắc Kạn","Bắc Ninh","Bến Tre","Bình Dương","Bình Định","Bình Phước","Bình Thuận","Cà Mau","Cao Bằng","Cần Thơ","Đà Nẵng","Đắk Lắk","Đắk Nông","Điện Biên","Đồng Nai","Đồng Tháp","Gia Lai","Hà Giang","Hà Nam","Hà Nội","Hà Tĩnh","Hải Dương","Hải Phòng","Hậu Giang","Hòa Bình","Hưng Yên","Khánh Hòa","Kiên Giang","Kon Tum","Lai Châu","Lâm Đồng","Lạng Sơn","Lào Cai","Long An","Nam Định","Nghệ An","Ninh Bình","Ninh Thuận","Phú Thọ","Phú Yên","Quảng Bình","Quảng Nam","Quảng Ngãi","Quảng Ninh","Quảng Trị","Sóc Trăng","Sơn La","Tây Ninh","Thái Bình","Thái Nguyên","Thanh Hóa","Thừa Thiên Huế","Tiền Giang","TP Hồ Chí Minh","Trà Vinh","Tuyên Quang","Vĩnh Long","Vĩnh Phúc","Yên Bái",
];

/* ---------- Helpers ---------- */
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
  const name = asset.fileName || `avatar.${ext}`;
  const type = asset.mimeType || (ext === "png" ? "image/png" : "image/jpeg");
  return { uri, name, type, size: info.size };
}
function yyyyMMdd(d) {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/* ---------- Screen ---------- */
export default function RegisterScreen() {
  const scheme = useColorScheme() ?? "light";
  const isDark = scheme === "dark";

  const tint = isDark ? "#7cc0ff" : "#0a84ff";
  const cardBg = isDark ? "#16181c" : "#ffffff";
  const textPrimary = isDark ? "#fff" : "#111";
  const textSecondary = isDark ? "#c9c9c9" : "#444";
  const border = isDark ? "#2e2f33" : "#dfe3ea";
  const muted = isDark ? "#22252a" : "#f3f5f9";

  const dispatch = useDispatch();
  const { userInfo } = useSelector((s) => s.auth);

  const [register, { isLoading }] = useRegisterMutation();
  const [uploadAvatar, { isLoading: uploadingAvatar }] = useUploadAvatarMutation();

  useEffect(() => {
    if (userInfo) router.replace("/");
  }, [userInfo]);

  const [form, setForm] = useState({
    name: "",
    nickname: "",
    phone: "",
    dob: "",
    email: "",
    password: "",
    confirmPassword: "",
    cccd: "",
    province: "",
    gender: "unspecified",
  });

  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  const handleChange = (key, val) => setForm((p) => ({ ...p, [key]: val }));

  const errors = useMemo(() => {
    const {
      name, nickname, phone, dob, email, password, confirmPassword, cccd, province, gender,
    } = form;
    const errs = [];
    if (name && name.trim().length < 1) errs.push("Họ tên không hợp lệ.");
    if (nickname && nickname.trim().length < 1) errs.push("Biệt danh không hợp lệ.");
    if (phone && !/^0\d{9}$/.test(phone.trim()))
      errs.push("Số điện thoại phải bắt đầu bằng 0 và đủ 10 chữ số.");
    if (dob) {
      const d = new Date(dob);
      if (Number.isNaN(d.getTime())) errs.push("Ngày sinh không hợp lệ.");
      if (d > new Date()) errs.push("Ngày sinh không được ở tương lai.");
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      errs.push("Email không hợp lệ.");
    if (password && password.length < 6) errs.push("Mật khẩu tối thiểu 6 ký tự.");
    if (password !== confirmPassword) errs.push("Mật khẩu và xác nhận không khớp.");
    if (cccd && !/^\d{12}$/.test(cccd.trim())) errs.push("CCCD phải gồm 12 chữ số.");
    if (gender && !["male", "female", "unspecified", "other"].includes(gender))
      errs.push("Giới tính không hợp lệ.");
    return errs;
  }, [form]);

  const validateRequired = () => {
    const reqErrs = [];
    if (!form.name.trim()) reqErrs.push("Họ tên không được để trống.");
    if (!form.nickname.trim()) reqErrs.push("Biệt danh không được để trống.");
    if (!/^0\d{9}$/.test((form.phone || "").trim()))
      reqErrs.push("Số điện thoại phải bắt đầu bằng 0 và đủ 10 chữ số.");
    if (!form.dob) reqErrs.push("Vui lòng chọn ngày sinh.");
    if (!form.province) reqErrs.push("Vui lòng chọn tỉnh / thành.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((form.email || "").trim()))
      reqErrs.push("Email không hợp lệ.");
    if ((form.password || "").length < 6)
      reqErrs.push("Mật khẩu phải có ít nhất 6 ký tự.");
    if (form.password !== form.confirmPassword)
      reqErrs.push("Mật khẩu và xác nhận mật khẩu không khớp.");
    if (!/^\d{12}$/.test((form.cccd || "").trim()))
      reqErrs.push("CCCD phải bao gồm đúng 12 chữ số.");
    return reqErrs.concat(errors);
  };

  const onSubmit = async () => {
    // hiển thị tất cả lỗi
    const allErrs = validateRequired();
    if (allErrs.length) {
      Alert.alert("Lỗi", allErrs.join("\n"));
      return;
    }

    try {
      let uploadedUrl = avatarUrl;

      if (avatarFile && !uploadedUrl) {
        // slice sẽ tự wrap FormData field 'avatar'
        const up = await uploadAvatar(avatarFile).unwrap();
        uploadedUrl = up?.url || up?.data?.url || "";
        if (uploadedUrl) setAvatarUrl(uploadedUrl);
      }

      const cleaned = Object.fromEntries(
        Object.entries(form).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v])
      );

      const res = await register({ ...cleaned, avatar: uploadedUrl }).unwrap();
      dispatch(setCredentials(res));
      Alert.alert("Thành công", "Đăng ký thành công!");
      router.replace("/");
    } catch (err) {
      const raw = err?.data?.message || err?.error || "Đăng ký thất bại";
      const map = {
        Email: "Email đã được sử dụng",
        "Số điện thoại": "Số điện thoại đã được sử dụng",
        CCCD: "CCCD đã được sử dụng",
        nickname: "Nickname đã tồn tại",
      };
      const matched = Object.keys(map).find((k) => raw.includes(k));
      Alert.alert("Lỗi", matched ? map[matched] : raw);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: "Đăng ký", headerTitleAlign: "center" }} />
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: "padding", android: undefined })}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={[styles.card, { backgroundColor: cardBg, borderColor: border }]}>
            {/* Avatar */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 }}>
              <View
                style={[
                  styles.avatarWrap,
                  { backgroundColor: muted, borderColor: border },
                ]}
              >
                <Image
                  source={{
                    uri:
                      normalizeUrl(avatarPreview) ||
                      "https://dummyimage.com/160x160/cccccc/ffffff&text=?",
                  }}
                  style={{ width: 80, height: 80, borderRadius: 40 }}
                />
              </View>
              <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
                <Pressable
                  onPress={async () => {
                    const f = await pickImage();
                    if (!f) return;
                    setAvatarFile(f);
                    setAvatarPreview(f.uri);
                    setAvatarUrl("");
                  }}
                  style={({ pressed }) => [
                    styles.btn,
                    styles.btnOutline,
                    { borderColor: border, backgroundColor: muted },
                    pressed && { opacity: 0.95 },
                  ]}
                >
                  <Text style={[styles.btnText, { color: textPrimary }]}>
                    Chọn ảnh đại diện
                  </Text>
                </Pressable>

                {(avatarPreview || avatarUrl) ? (
                  <Pressable
                    onPress={() => {
                      setAvatarFile(null);
                      setAvatarPreview("");
                      setAvatarUrl("");
                    }}
                    style={({ pressed }) => [
                      styles.btn,
                      styles.btnTextOnly,
                      pressed && { opacity: 0.9 },
                    ]}
                  >
                    <Text style={[styles.btnText, { color: "#e53935" }]}>Xóa ảnh</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            {/* Fields */}
            <Field label="Họ và tên" value={form.name} onChangeText={(v) => handleChange("name", v)}
              border={border} textPrimary={textPrimary} textSecondary={textSecondary} required />
            <Field label="Nickname" value={form.nickname} onChangeText={(v) => handleChange("nickname", v)}
              border={border} textPrimary={textPrimary} textSecondary={textSecondary} required />
            <Field label="Số điện thoại" value={form.phone} onChangeText={(v) => handleChange("phone", v)}
              border={border} textPrimary={textPrimary} textSecondary={textSecondary} keyboardType="phone-pad" required />
            <DateField label="Ngày sinh" value={form.dob} onChange={(v) => handleChange("dob", v)}
              border={border} textPrimary={textPrimary} textSecondary={textSecondary} tint={tint} />
            <Field label="Email" value={form.email} onChangeText={(v) => handleChange("email", v)}
              border={border} textPrimary={textPrimary} textSecondary={textSecondary} keyboardType="email-address" required />
            <Field label="Mã định danh CCCD" value={form.cccd} onChangeText={(v) => handleChange("cccd", v)}
              border={border} textPrimary={textPrimary} textSecondary={textSecondary} keyboardType="number-pad" maxLength={12} required />
            <Field label="Mật khẩu" value={form.password} onChangeText={(v) => handleChange("password", v)}
              border={border} textPrimary={textPrimary} textSecondary={textSecondary} secureTextEntry required />
            <Field label="Xác nhận mật khẩu" value={form.confirmPassword} onChangeText={(v) => handleChange("confirmPassword", v)}
              border={border} textPrimary={textPrimary} textSecondary={textSecondary} secureTextEntry required />

            <SelectField
              label="Giới tính"
              value={form.gender}
              options={GENDER_OPTIONS}
              placeholder="--"
              onChange={(v) => handleChange("gender", v)}
              border={border}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
            />
            <SelectField
              label="Tỉnh / Thành phố"
              value={form.province}
              options={[{ value: "", label: "-- Chọn --" }, ...PROVINCES.map((p) => ({ value: p, label: p }))]}
              placeholder="-- Chọn --"
              onChange={(v) => handleChange("province", v)}
              border={border}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
            />

            {/* Submit */}
            <Pressable
              onPress={onSubmit}
              disabled={isLoading || uploadingAvatar}
              style={({ pressed }) => [
                styles.btn,
                {
                  backgroundColor: isLoading || uploadingAvatar ? "#9aa0a6" : tint,
                },
                pressed && { opacity: 0.95 },
              ]}
            >
              <Text style={styles.btnTextWhite}>
                {isLoading || uploadingAvatar ? "Đang xử lý…" : "Đăng ký"}
              </Text>
            </Pressable>

            {/* Link to Login */}
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
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

/* ---------- Subcomponents ---------- */
function Field({
  label,
  value,
  onChangeText,
  keyboardType = "default",
  secureTextEntry = false,
  maxLength,
  required = false,
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
        placeholder={label}
        placeholderTextColor="#9aa0a6"
        style={[styles.input, { borderColor: border, color: textPrimary }]}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        maxLength={maxLength}
      />
    </View>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder = "—",
  border,
  textPrimary,
  textSecondary,
}) {
  const [open, setOpen] = useState(false);
  const [temp, setTemp] = useState(value || "");

  useEffect(() => setTemp(value || ""), [value]);

  const display =
    options.find((o) => o.value === value)?.label || placeholder;

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

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
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
            <Picker selectedValue={temp} onValueChange={(v) => setTemp(String(v))}>
              {options.map((o) => (
                <Picker.Item key={o.value ?? o.label} label={o.label} value={o.value} />
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
  border,
  textPrimary,
  textSecondary,
  tint,
}) {
  const [open, setOpen] = useState(false);
  const [temp, setTemp] = useState(value ? new Date(value) : new Date(1990, 0, 1));

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

      {open && (
        <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, { borderColor: border }]}>
              <View style={styles.modalHeader}>
                <Pressable onPress={() => setOpen(false)} style={styles.modalBtn}>
                  <Text style={styles.modalBtnText}>Hủy</Text>
                </Pressable>
                <Text style={styles.modalTitle}>{label}</Text>
                <Pressable
                  onPress={() => {
                    onChange(yyyyMMdd(temp));
                    setOpen(false);
                  }}
                  style={[styles.modalBtn, { backgroundColor: tint, borderRadius: 8, paddingHorizontal: 10 }]}
                >
                  <Text style={[styles.modalBtnText, { color: "#fff" }]}>Xong</Text>
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

/* ---------- Styles ---------- */
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
  avatarWrap: {
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
  btn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  btnText: { fontWeight: "700" },
  btnTextWhite: { color: "#fff", fontWeight: "700" },
  btnOutline: { borderWidth: 1 },
  btnTextOnly: { backgroundColor: "transparent" },
  selectBox: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: "center",
  },
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
