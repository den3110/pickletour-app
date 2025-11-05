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
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import { Image as ExpoImage } from "expo-image";
import ImageView from "react-native-image-viewing";
import { MaterialIcons } from "@expo/vector-icons";
import { Stack, router, Redirect } from "expo-router";
import { useDispatch, useSelector } from "react-redux";

import { useRegisterMutation } from "@/slices/usersApiSlice";
import { useUploadAvatarMutation } from "@/slices/uploadApiSlice";
import { setCredentials } from "@/slices/authSlice";
import { normalizeUrl } from "@/utils/normalizeUri";
import { saveUserInfo } from "@/utils/authStorage";

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
    quality: 0.9,
    allowsEditing: false,
    exif: false,
  });
  if (res.canceled) return null;

  let asset = res.assets?.[0];
  if (!asset?.uri) return null;

  let uri = asset.uri;
  // Lấy tên + phần mở rộng an toàn
  let name =
    asset.fileName || uri.split(/[\\/]/).pop() || `image_${Date.now()}.jpg`;

  let ext = (name.split(".").pop() || "").toLowerCase();
  let type =
    asset.mimeType ||
    (ext === "png"
      ? "image/png"
      : ext === "webp"
      ? "image/webp"
      : "image/jpeg");

  // Chuyển HEIC/HEIF → JPEG
  const isHeic = /heic|heif$/i.test(ext) || /heic|heif/i.test(type || "");
  if (isHeic) {
    const out = await ImageManipulator.manipulateAsync(uri, [], {
      compress: 0.9,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    uri = out.uri;
    name = name.replace(/\.(heic|heif)$/i, ".jpg");
    type = "image/jpeg";
    ext = "jpg";
  }

  // Kiểm tra size
  const info = await FileSystem.getInfoAsync(uri, { size: true });
  const size = info.size || 0;
  if (size > maxBytes) {
    Alert.alert("Ảnh quá lớn", "Ảnh không được vượt quá 10MB.");
    return null;
  }

  // Bảo đảm có đuôi hợp lệ
  if (!/\.(png|jpe?g|webp)$/i.test(name)) {
    const suf = /png/i.test(type) ? "png" : /webp/i.test(type) ? "webp" : "jpg";
    if (!name.includes(".")) name = `${name}.${suf}`;
  }

  return { uri, name, type, size };
}

function validateAll(form, avatarUrl, accepted) {
  const name = (form.name || "").trim();
  const nickname = (form.nickname || "").trim();
  const phoneRaw = cleanPhone(form.phone || "");
  const email = (form.email || "").trim();
  const province = form.province || "";
  const password = form.password || "";
  const confirmPassword = form.confirmPassword || "";

  const fields = {
    name: "",
    nickname: "",
    email: "",
    phone: "",
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

  if (!phoneRaw) fields.phone = "Vui lòng nhập số điện thoại.";
  else if (!/^0\d{9}$/.test(phoneRaw))
    fields.phone = "SĐT phải bắt đầu bằng 0 và đủ 10 số.";

  if (!province) fields.province = "Vui lòng chọn Tỉnh/Thành phố.";

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

  const dispatch = useDispatch();
  const userInfo = useSelector((s) => s.auth?.userInfo);

  const [register, { isLoading }] = useRegisterMutation();
  const [uploadAvatar, { isLoading: uploadingAvatar }] =
    useUploadAvatarMutation();

  const [form, setForm] = useState({
    name: "",
    nickname: "",
    email: "",
    phone: "",
    province: "",
    password: "",
    confirmPassword: "",
  });
  const handleChange = (key, val) => setForm((p) => ({ ...p, [key]: val }));

  const [accepted, setAccepted] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  // ===== Avatar (giống profile): preview modal -> upload -> lưu URL
  const [avatarUrl, setAvatarUrl] = useState(""); // URL remote sau upload
  const [avatarTemp, setAvatarTemp] = useState(null); // file tạm trước khi upload
  const [avatarConfirmOpen, setAvatarConfirmOpen] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false); // phóng to ảnh

  const [showErrors, setShowErrors] = useState(false);

  const validation = useMemo(
    () => validateAll(form, avatarUrl, accepted),
    [form, avatarUrl, accepted]
  );
  const errorsList = useMemo(() => validation.messages, [validation]);

  const doRegister = async () => {
    try {
      const cleaned = {
        name: (form.name || "").trim(),
        nickname: (form.nickname || "").trim(),
        email: (form.email || "").trim(),
        phone: cleanPhone(form.phone || ""),
        province: form.province,
        password: form.password,
        avatar: avatarUrl, // gửi kèm avatar đã upload
      };

      const res = await register(cleaned).unwrap();
      dispatch(setCredentials(res));
      await saveUserInfo(res);

      router.replace("/(tabs)/profile");
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
    await doRegister();
  };

  const submitDisabled = isLoading || uploadingAvatar || avatarSaving;
  const shouldRedirect = !!userInfo;

  // safe avatar uri (tránh null → lỗi handler)
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
        <ScrollView contentContainerStyle={styles.scroll}>
          <View
            style={[
              styles.card,
              { backgroundColor: cardBg, borderColor: border },
            ]}
          >
            {/* Avatar (giống profile) */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                marginBottom: 8,
              }}
            >
              <Pressable
                onPress={() => safeAvatar && setViewerOpen(true)}
                style={({ pressed }) => [{ opacity: pressed ? 0.97 : 1 }]}
              >
                <View
                  style={[
                    styles.avatarWrap,
                    {
                      backgroundColor: isDark ? "#22252a" : "#f3f5f9",
                      borderColor: border,
                    },
                  ]}
                >
                  {safeAvatar ? (
                    <ExpoImage
                      source={{ uri: safeAvatar }}
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
                </View>
              </Pressable>

              <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
                <Pressable
                  onPress={async () => {
                    const f = await pickImage();
                    if (!f) return;
                    setAvatarTemp(f); // giữ file để xem trước
                    setAvatarConfirmOpen(true); // mở modal xác nhận
                  }}
                  style={({ pressed }) => [
                    styles.btn,
                    styles.btnOutline,
                    {
                      borderColor: border,
                      backgroundColor: isDark ? "#22252a" : "#f3f5f9",
                    },
                    pressed && { opacity: 0.95 },
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
                </Pressable>

                {!!safeAvatar && (
                  <Pressable
                    onPress={() => setAvatarUrl("")}
                    style={({ pressed }) => [
                      styles.btn,
                      styles.btnTextOnly,
                      pressed && { opacity: 0.9 },
                    ]}
                  >
                    <Text style={[styles.btnText, { color: danger }]}>
                      Xóa ảnh
                    </Text>
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
              required
              error={showErrors && !!validation.fields.phone}
              helperText={showErrors ? validation.fields.phone : ""}
            />

            {/* Province (required select) */}
            <FieldSelect
              label="Tỉnh/Thành phố"
              value={form.province}
              onSelect={(val) => handleChange("province", val)}
              options={PROVINCES}
              border={border}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
              tint={tint}
              required
              error={showErrors && !!validation.fields.province}
              helperText={showErrors ? validation.fields.province : ""}
            />

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
                <View
                  style={[
                    styles.checkboxBox,
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
                </View>
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
                styles.btn,
                { backgroundColor: submitDisabled ? "#9aa0a6" : tint },
                pressed && !submitDisabled && { opacity: 0.95 },
              ]}
            >
              <Text style={styles.btnTextWhite}>
                {isLoading || uploadingAvatar || avatarSaving
                  ? "Đang xử lý…"
                  : "Đăng ký"}
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

      {/* Terms Modal */}
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

      {/* ===== Avatar Preview Modal (Xác nhận → upload) ===== */}
      <Modal
        visible={avatarConfirmOpen}
        transparent
        animationType="fade"
        onRequestClose={() => !avatarSaving && setAvatarConfirmOpen(false)}
      >
        <View style={styles.modalBackdropCenter}>
          <View
            style={[
              styles.previewCard,
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
              Ảnh sẽ được tải lên và cập nhật ngay khi bạn bấm “Xác nhận”.
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
                  styles.btn,
                  styles.btnOutline,
                  {
                    borderColor: border,
                    minWidth: 100,
                    opacity: avatarSaving ? 0.6 : pressed ? 0.95 : 1,
                  },
                ]}
              >
                <Text style={[styles.btnText, { color: textPrimary }]}>
                  Huỷ
                </Text>
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
                  styles.btn,
                  {
                    backgroundColor: tint,
                    minWidth: 120,
                    opacity: avatarSaving ? 0.7 : pressed ? 0.92 : 1,
                  },
                ]}
              >
                {avatarSaving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnTextWhite}>Xác nhận</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== Viewer phóng to avatar ===== */}
      <ImageView
        images={safeAvatar ? [{ uri: safeAvatar }] : []}
        visible={viewerOpen}
        onRequestClose={() => setViewerOpen(false)}
        backgroundColor={isDark ? "#0b0b0c" : "#ffffff"}
      />
    </>
  );
}

/* ==================== Subcomponents ==================== */
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
  error = false,
  helperText = "",
}) {
  const danger = "#e53935";
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
        style={[
          styles.input,
          {
            borderColor: error ? danger : border,
            color: textPrimary,
          },
        ]}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        maxLength={maxLength}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {error ? (
        <Text style={[styles.errorText, { color: danger }]}>{helperText}</Text>
      ) : null}
    </View>
  );
}

function FieldSelect({
  label,
  value,
  onSelect,
  options = [],
  border,
  textPrimary,
  textSecondary,
  tint = "#0a84ff",
  required = false,
  error = false,
  helperText = "",
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [kbHeight, setKbHeight] = useState(0);
  const searchRef = useRef(null);
  const danger = "#e53935";

  const unaccentVN = (s = "") =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D");
  const norm = (s = "") =>
    unaccentVN(s).toLowerCase().replace(/\s+/g, " ").trim();

  const filtered = useMemo(() => {
    const nq = norm(q);
    if (!nq) return options;
    return options.filter((name) => norm(name).includes(nq));
  }, [q, options]);

  useEffect(() => {
    const onShow = (e) => setKbHeight(e.endCoordinates?.height ?? 0);
    const onHide = () => setKbHeight(0);
    const s1 =
      Platform.OS === "ios"
        ? Keyboard.addListener("keyboardWillShow", onShow)
        : Keyboard.addListener("keyboardDidShow", onShow);
    const s2 =
      Platform.OS === "ios"
        ? Keyboard.addListener("keyboardWillHide", onHide)
        : Keyboard.addListener("keyboardDidHide", onHide);
    return () => {
      s1.remove();
      s2.remove();
    };
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 50);
    else setQ("");
  }, [open]);

  const handleSelect = (name) => {
    onSelect(name);
    setOpen(false);
    setQ("");
    Keyboard.dismiss();
  };

  const renderItem = ({ item: name }) => {
    const selected = name === value;
    return (
      <Pressable
        onStartShouldSetResponder={() => true}
        onResponderGrant={() => handleSelect(name)}
        onPress={() => handleSelect(name)}
        style={({ pressed }) => [
          {
            paddingVertical: 12,
            paddingHorizontal: 16,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          },
          pressed && { backgroundColor: "#f2f4f7" },
        ]}
      >
        <Text style={{ color: textPrimary, fontSize: 16 }}>{name}</Text>
        {selected ? (
          <Text style={{ color: tint, fontWeight: "700" }}>✓</Text>
        ) : null}
      </Pressable>
    );
  };

  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={[styles.label, { color: textSecondary }]}>
        {label}
        {required ? " *" : ""}
      </Text>

      {/* Trigger */}
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.input,
          {
            borderColor: error ? danger : border,
            flexDirection: "row",
            alignItems: "center",
          },
          pressed && { opacity: 0.95 },
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
          {value || "Chọn tỉnh/thành"}
        </Text>
        <Text style={{ color: "#9aa0a6" }}>▼</Text>
      </Pressable>
      {error ? (
        <Text style={[styles.errorText, { color: danger }]}>{helperText}</Text>
      ) : null}

      {/* Modal */}
      <Modal
        visible={open}
        animationType="slide"
        transparent
        onRequestClose={() => setOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.select({ ios: "padding", android: "height" })}
          keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
          style={styles.modalBackdrop}
        >
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: "#fff",
                borderColor: border,
                paddingBottom: 0,
                maxHeight: "85%",
              },
            ]}
          >
            {/* Header */}
            <View
              style={[
                styles.modalHeader,
                { borderBottomWidth: 1, borderColor: border },
              ]}
            >
              <Pressable onPress={() => setOpen(false)} style={styles.modalBtn}>
                <Text style={[styles.modalBtnText, { color: textPrimary }]}>
                  Đóng
                </Text>
              </Pressable>
              <Text style={[styles.modalTitle, { color: textPrimary }]}>
                Chọn tỉnh/thành
              </Text>
              <View style={styles.modalBtn}>
                <Text style={[styles.modalBtnText, { color: "transparent" }]}>
                  .
                </Text>
              </View>
            </View>

            {/* Search */}
            <View
              style={{
                paddingHorizontal: 14,
                paddingTop: 10,
                paddingBottom: 6,
              }}
            >
              <TextInput
                ref={searchRef}
                placeholder="Tìm tỉnh/thành…"
                placeholderTextColor="#9aa0a6"
                value={q}
                onChangeText={setQ}
                autoCapitalize="none"
                returnKeyType="search"
                blurOnSubmit={false}
                style={[
                  styles.input,
                  {
                    borderColor: border,
                    color: textPrimary,
                    paddingVertical: 10,
                  },
                ]}
              />
            </View>

            {/* List */}
            <FlatList
              data={filtered}
              keyExtractor={(item) => item}
              renderItem={renderItem}
              keyboardShouldPersistTaps="always"
              keyboardDismissMode="none"
              initialNumToRender={20}
              windowSize={8}
              style={{ maxHeight: 420 }}
              contentContainerStyle={{ paddingBottom: Math.max(16, kbHeight) }}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

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
  return (
    <Modal
      visible={open}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View
          style={[
            styles.modalCard,
            { backgroundColor: cardBg, borderColor: border },
          ]}
        >
          <View style={styles.modalHeader}>
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
                Đồng ý
              </Text>
            </Pressable>
          </View>

          <ScrollView style={{ paddingHorizontal: 14, paddingBottom: 16 }}>
            <Text style={{ color: textSecondary, fontSize: 12, marginTop: 4 }}>
              Cập nhật lần cuối: 04/09/2025
            </Text>

            <Text
              style={{ color: textPrimary, fontWeight: "700", marginTop: 10 }}
            >
              1) Giới thiệu
            </Text>
            <Text style={{ color: textSecondary, marginTop: 4 }}>
              Ứng dụng dùng để quản lý/tham gia hoạt động pickleball. Bằng việc
              tạo tài khoản hoặc tiếp tục sử dụng, bạn đồng ý với tài liệu này.
            </Text>

            <Text
              style={{ color: textPrimary, fontWeight: "700", marginTop: 10 }}
            >
              2) Tài khoản
            </Text>
            <Text style={{ color: textSecondary, marginTop: 4 }}>
              • Cung cấp thông tin chính xác và cập nhật.{"\n"}• Tự bảo mật mật
              khẩu; thông báo ngay nếu nghi ngờ truy cập trái phép.
            </Text>

            <Text
              style={{ color: textPrimary, fontWeight: "700", marginTop: 10 }}
            >
              3) Hành vi bị cấm
            </Text>
            <Text style={{ color: textSecondary, marginTop: 4 }}>
              • Mạo danh, quấy rối, phát tán nội dung vi phạm pháp luật.{"\n"}•
              Can thiệp hệ thống, dò quét lỗ hổng, truy cập trái phép.
            </Text>

            <Text
              style={{ color: textPrimary, fontWeight: "700", marginTop: 10 }}
            >
              4) Nội dung do bạn cung cấp
            </Text>
            <Text style={{ color: textSecondary, marginTop: 4 }}>
              • Bạn chịu trách nhiệm về thông tin/ảnh đã tải lên.{"\n"}• Chúng
              tôi có quyền sử dụng nội dung ở mức cần thiết để vận hành dịch vụ.
              {"\n"}• Ảnh CCCD (nếu cung cấp) chỉ dùng cho mục đích xác minh.
            </Text>

            <Text
              style={{ color: textPrimary, fontWeight: "700", marginTop: 10 }}
            >
              5) Quyền riêng tư (tóm tắt)
            </Text>
            <Text style={{ color: textSecondary, marginTop: 4 }}>
              <Text style={{ fontWeight: "700", color: textPrimary }}>
                Dữ liệu thu thập
              </Text>
              {"\n"}• Tài khoản: nickname, mật khẩu (được băm), email/SĐT.{"\n"}
              • Hồ sơ (nếu bổ sung): họ tên, ngày sinh, giới tính, tỉnh/thành,
              CCCD & ảnh CCCD.{"\n"}• Kỹ thuật: thiết bị, thời gian đăng nhập,
              IP, log lỗi, thống kê sử dụng.{"\n\n"}
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
              style={{ color: textPrimary, fontWeight: "700", marginTop: 10 }}
            >
              6) Camera & Quét QR CCCD
            </Text>
            <Text style={{ color: textSecondary, marginTop: 4 }}>
              • Quét QR xử lý trên thiết bị, không lưu khung hình.{"\n"}• Ảnh
              CCCD chỉ dùng xác minh; có thể yêu cầu xoá sau khi hoàn tất.
            </Text>

            <Text
              style={{ color: textPrimary, fontWeight: "700", marginTop: 10 }}
            >
              7) Lưu phiên (SecureStore/AsyncStorage)
            </Text>
            <Text style={{ color: textSecondary, marginTop: 4 }}>
              • Ứng dụng lưu phiên để đăng nhập nhanh. Đăng xuất để xoá phiên
              trên thiết bị.
            </Text>

            <Text
              style={{ color: textPrimary, fontWeight: "700", marginTop: 10 }}
            >
              8) Chấm dứt & Đình chỉ
            </Text>
            <Text style={{ color: textSecondary, marginTop: 4 }}>
              • Bạn có thể xoá tài khoản bất cứ lúc nào.{"\n"}• Chúng tôi có thể
              tạm ngưng/chấm dứt nếu có vi phạm hoặc rủi ro an ninh.
            </Text>

            <Text
              style={{ color: textPrimary, fontWeight: "700", marginTop: 10 }}
            >
              9) Miễn trừ & Giới hạn trách nhiệm
            </Text>
            <Text style={{ color: textSecondary, marginTop: 4 }}>
              • Dịch vụ cung cấp “như hiện có”. Trong phạm vi luật cho phép,
              chúng tôi không chịu trách nhiệm cho thiệt hại gián tiếp/phát sinh
              do việc sử dụng.{"\n"}• Không điều nào ở đây loại trừ trách nhiệm
              pháp lý bắt buộc.
            </Text>

            <Text
              style={{ color: textPrimary, fontWeight: "700", marginTop: 10 }}
            >
              10) Thay đổi điều khoản
            </Text>
            <Text style={{ color: textSecondary, marginTop: 4 }}>
              • Khi cập nhật đáng kể, ứng dụng sẽ thông báo; tiếp tục sử dụng
              tức là bạn chấp nhận bản mới.
            </Text>

            <Text
              style={{ color: textPrimary, fontWeight: "700", marginTop: 10 }}
            >
              11) Luật áp dụng & Liên hệ
            </Text>
            <Text
              style={{ color: textSecondary, marginBottom: 10, marginTop: 4 }}
            >
              • Áp dụng pháp luật Việt Nam; tranh chấp ưu tiên thương lượng, sau
              đó theo thẩm quyền.{"\n"}• Liên hệ: pickletour@gmail.com
            </Text>

            <Text
              style={{
                color: textSecondary,
                fontStyle: "italic",
                marginTop: 6,
                marginBottom: 10,
              }}
            >
              Nhấn “Đồng ý” nghĩa là bạn đã đọc và chấp nhận Điều khoản & Chính
              sách.
            </Text>
          </ScrollView>
        </View>
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
  avatarWrap: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
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

  checkboxRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  checkboxBox: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxTick: { color: "#fff", fontWeight: "900", lineHeight: 18 },

  errorText: { fontSize: 12, marginTop: 6 },

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
  modalBtnText: { fontWeight: "700" },
  modalTitle: { fontWeight: "700", fontSize: 16 },
});
