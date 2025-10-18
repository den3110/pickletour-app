// app/(auth)/register.jsx
import React, { useMemo, useState } from "react";
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
  Keyboard,
  FlatList,
  TouchableOpacity,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
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

function vnNormalize(s = "") {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
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
  const ext = asset.fileName?.split(".").pop() || uri.split(".").pop() || "jpg";
  const name = asset.fileName || `avatar.${ext}`;
  const type =
    asset.mimeType ||
    (ext.toLowerCase() === "png" ? "image/png" : "image/jpeg");
  return { uri, name, type, size: info.size };
}

function cleanPhone(v) {
  if (typeof v !== "string") return "";
  let s = v.trim();
  if (!s) return "";
  if (s.startsWith("+84")) s = "0" + s.slice(3);
  s = s.replace(/[^\d]/g, "");
  return s;
}

// ---- Các trường optional cần nhắc (tuỳ bạn) ----
function getMissingOptional(form, hasAvatar) {
  const missing = [];
  if (!(form?.email || "").trim()) missing.push("Email");
  if (!cleanPhone(form?.phone || "")) missing.push("Số điện thoại");
  if (!form?.province) missing.push("Tỉnh/Thành phố");
  if (!hasAvatar) missing.push("Ảnh đại diện");
  return missing;
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

  const dispatch = useDispatch();
  const userInfo = useSelector((s) => s.auth?.userInfo);

  const [register, { isLoading }] = useRegisterMutation();
  const [uploadAvatar, { isLoading: uploadingAvatar }] =
    useUploadAvatarMutation();

  const [form, setForm] = useState({
    nickname: "",
    email: "",
    phone: "",
    province: "", // optional
    password: "",
    confirmPassword: "",
  });
  const handleChange = (key, val) => setForm((p) => ({ ...p, [key]: val }));

  const [accepted, setAccepted] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState("");

  const errors = useMemo(() => {
    const nickname = (form.nickname || "").trim();
    const phone = cleanPhone(form.phone || "");
    const email = (form.email || "").trim();
    const password = form.password || "";
    const confirmPassword = form.confirmPassword || "";

    const errs = [];
    if (nickname && nickname.length < 1) errs.push("Biệt danh không hợp lệ.");
    if (phone && !/^0\d{9}$/.test(phone))
      errs.push("SĐT phải bắt đầu 0 và đủ 10 số.");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      errs.push("Email không hợp lệ.");
    if (password && password.length < 6)
      errs.push("Mật khẩu tối thiểu 6 ký tự.");
    if (password !== confirmPassword)
      errs.push("Mật khẩu và xác nhận không khớp.");
    return errs;
  }, [form]);

  const validateRequired = () => {
    const nickname = (form.nickname || "").trim();
    const password = form.password || "";
    const confirmPassword = form.confirmPassword || "";
    const reqErrs = [];
    if (!nickname) reqErrs.push("Biệt danh không được để trống.");
    if (password.length < 6) reqErrs.push("Mật khẩu phải có ít nhất 6 ký tự.");
    if (password !== confirmPassword)
      reqErrs.push("Mật khẩu và xác nhận mật khẩu không khớp.");
    if (!accepted) reqErrs.push("Bạn cần đồng ý Điều khoản & Chính sách.");
    return reqErrs.concat(errors);
  };

  const doRegister = async () => {
    try {
      const cleaned = {
        nickname: (form.nickname || "").trim(),
        email: (form.email || "").trim() || undefined,
        phone: cleanPhone(form.phone || "") || undefined,
        province: form.province || undefined, // optional
        password: form.password,
      };

      const res = await register(cleaned).unwrap();
      dispatch(setCredentials(res));
      await saveUserInfo(res);

      if (avatarFile) {
        try {
          await uploadAvatar(avatarFile).unwrap();
        } catch {}
      }

      router.replace("/(tabs)/profile");
    } catch (err) {
      const raw = err?.data?.message || err?.error || "Đăng ký thất bại";
      Alert.alert("Lỗi", raw);
    }
  };

  const onSubmit = async () => {
    const allErrs = validateRequired(); // chỉ check trường bắt buộc
    if (allErrs.length) {
      Alert.alert("Lỗi", allErrs.join("\n"));
      return;
    }

    // === Nhắc các trường KHÔNG bắt buộc ===
    const hasAvatar = !!avatarFile || !!avatarPreview;
    const missingOptional = getMissingOptional(form, hasAvatar);

    if (missingOptional.length) {
      Alert.alert(
        "Thiếu thông tin",
        `Bạn chưa nhập:\n• ${missingOptional.join(
          "\n• "
        )}\n\nBạn có thể bổ sung sau tại trang Hồ sơ.`,
        [
          { text: "Bổ sung", style: "default" },
          {
            text: "Bỏ qua & đăng ký",
            style: "destructive",
            onPress: () => doRegister(),
          },
        ]
      );
      return;
    }

    // Không thiếu optional → đăng ký luôn
    doRegister();
  };

  const submitDisabled = isLoading || uploadingAvatar || !accepted;
  const shouldRedirect = !!userInfo;

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
            {/* Avatar */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                marginBottom: 8,
              }}
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
                  <Text style={[styles.btnText, { color: textPrimary }]}>
                    Chọn ảnh đại diện
                  </Text>
                </Pressable>

                {avatarPreview ? (
                  <Pressable
                    onPress={() => {
                      setAvatarFile(null);
                      setAvatarPreview("");
                    }}
                    style={({ pressed }) => [
                      styles.btn,
                      styles.btnTextOnly,
                      pressed && { opacity: 0.9 },
                    ]}
                  >
                    <Text style={[styles.btnText, { color: "#e53935" }]}>
                      Xóa ảnh
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            {/* Fields */}
            <Field
              label="Nickname"
              value={form.nickname}
              onChangeText={(v) => handleChange("nickname", v)}
              border={border}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
              required
            />
            <Field
              label="Email (tuỳ chọn)"
              value={form.email}
              onChangeText={(v) => handleChange("email", v)}
              border={border}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
              keyboardType="email-address"
            />
            <Field
              label="Số điện thoại (tuỳ chọn)"
              value={form.phone}
              onChangeText={(v) => handleChange("phone", v)}
              border={border}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
              keyboardType="phone-pad"
            />

            {/* Province (optional select) */}
            <FieldSelect
              label="Tỉnh/Thành phố (tuỳ chọn)"
              value={form.province}
              onSelect={(val) => handleChange("province", val)}
              options={PROVINCES}
              border={border}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
              tint={tint}
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
                      borderColor: accepted ? tint : border,
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
        autoCapitalize="none"
      />
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
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [kbHeight, setKbHeight] = useState(0);
  const searchRef = React.useRef(null);

  // --- bỏ dấu & normalize ---
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

  // Bàn phím
  React.useEffect(() => {
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

  React.useEffect(() => {
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
      <Text style={[styles.label, { color: textSecondary }]}>{label}</Text>

      {/* Trigger */}
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.input,
          { borderColor: border, flexDirection: "row", alignItems: "center" },
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
          {value || "Chọn tỉnh/thành (không bắt buộc)"}
        </Text>
        <Text style={{ color: "#9aa0a6" }}>▼</Text>
      </Pressable>

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
              {"\n"}• Tài khoản: nickname, mật khẩu (được băm), email/SĐT (tuỳ
              chọn).{"\n"}• Hồ sơ (nếu bổ sung): họ tên, ngày sinh, giới tính,
              tỉnh/thành, CCCD & ảnh CCCD.{"\n"}• Kỹ thuật: thiết bị, thời gian
              đăng nhập, IP, log lỗi, thống kê sử dụng.{"\n\n"}
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
              style={{ color: textSecondary, marginTop: 4, marginBottom: 10 }}
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

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  modalCard: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    maxHeight: "85%",
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
