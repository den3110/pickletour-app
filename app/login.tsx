// app/(auth)/login.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  useColorScheme,
} from "react-native";
import { router, Stack, Redirect } from "expo-router";
import { useDispatch, useSelector } from "react-redux";
import { useLoginMutation } from "@/slices/usersApiSlice";
import { setCredentials } from "@/slices/authSlice";
import { saveUserInfo } from "@/utils/authStorage";

/* ---------- Helpers (JS thuần, không TS) ---------- */
const normEmail = (v) => (typeof v === "string" ? v.trim().toLowerCase() : v);
const normPhone = (v) => {
  if (typeof v !== "string") return v;
  let s = v.trim();
  if (!s) return s;
  if (s.startsWith("+84")) s = "0" + s.slice(3);
  s = s.replace(/[^\d]/g, "");
  return s;
};
const isLikelyPhone = (raw) => {
  if (!raw) return false;
  const s = normPhone(raw);
  return /^0\d{8,10}$/.test(s); // 9–11 số tuỳ mạng
};

export default function LoginScreen() {
  const scheme = useColorScheme() ?? "light";
  const tint = scheme === "dark" ? "#7cc0ff" : "#0a84ff";
  const cardBg = scheme === "dark" ? "#16181c" : "#ffffff";
  const textPrimary = scheme === "dark" ? "#fff" : "#111";
  const textSecondary = scheme === "dark" ? "#c9c9c9" : "#444";
  const border = scheme === "dark" ? "#2e2f33" : "#dfe3ea";

  const dispatch = useDispatch();
  const userInfo = useSelector((s) => s.auth?.userInfo);
  const [login, { isLoading }] = useLoginMutation();

  // State
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");

  // Xác định loại input để set keyboardType & payload
  const kind = useMemo(() => {
    const v = (loginId || "").trim();
    if (v.includes("@")) return "email";
    if (isLikelyPhone(v)) return "phone";
    return "nickname";
  }, [loginId]);

  const kbType = useMemo(
    () => (kind === "email" ? "email-address" : kind === "phone" ? "phone-pad" : "default"),
    [kind]
  );

  const onSubmit = async () => {
    const id = (loginId || "").trim();
    const pass = (password || "").trim();

    if (!id || !pass) {
      Alert.alert("Thiếu thông tin", "Vui lòng nhập tài khoản và mật khẩu.");
      return;
    }

    const payload =
      kind === "email"
        ? { email: normEmail(id), password: pass }
        : kind === "phone"
        ? { phone: normPhone(id), password: pass }
        : { nickname: id, password: pass }; // BE cần hỗ trợ nickname

    try {
      const res = await login(payload).unwrap();
      const normalized = res?.user ? { ...res.user, token: res.token } : res;

      // Redux + persist vào storage (SecureStore/AsyncStorage)
      dispatch(setCredentials(normalized));
      await saveUserInfo(normalized);

      // Điều hướng sau khi đã persist
      router.replace("/(tabs)");
    } catch (err) {
      const msg =
        err?.data?.message ||
        err?.error ||
        "Đăng nhập thất bại. Vui lòng kiểm tra lại.";
      Alert.alert("Lỗi", String(msg));
    }
  };

  // QUYẾT ĐỊNH UI Ở CUỐI — không return sớm trước khi gọi hooks
  const shouldRedirect = !!userInfo;

  return shouldRedirect ? (
    <Redirect href="/(tabs)" />
  ) : (
    <>
      <Stack.Screen options={{ headerShown: false }} />
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
            <Text style={[styles.title, { color: textPrimary }]}>Đăng nhập</Text>

            <View style={styles.form}>
              <Text style={[styles.label, { color: textSecondary }]}>
                Email / Số điện thoại hoặc Nickname
              </Text>
              <TextInput
                value={loginId}
                onChangeText={setLoginId}
                placeholder="Email / Số điện thoại hoặc Nickname"
                placeholderTextColor="#9aa0a6"
                style={[
                  styles.input,
                  { borderColor: border, color: textPrimary },
                ]}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType={kbType}
                textContentType="username"
                autoComplete="username"
                returnKeyType="next"
              />

              <Text
                style={[styles.label, { color: textSecondary, marginTop: 12 }]}
              >
                Mật khẩu
              </Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor="#9aa0a6"
                style={[
                  styles.input,
                  { borderColor: border, color: textPrimary },
                ]}
                secureTextEntry
                textContentType="password"
                autoComplete="password"
                returnKeyType="done"
                onSubmitEditing={onSubmit}
              />

              <Pressable
                onPress={onSubmit}
                disabled={isLoading}
                style={({ pressed }) => [
                  styles.btn,
                  { backgroundColor: tint },
                  pressed && { opacity: 0.9 },
                  isLoading && { opacity: 0.7 },
                ]}
              >
                {isLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnText}>Đăng nhập</Text>
                )}
              </Pressable>
            </View>

            <View style={styles.footerRow}>
              <Pressable onPress={() => router.push("/register")}>
                <Text style={[styles.link, { color: tint }]}>
                  Chưa có tài khoản? Đăng ký ngay
                </Text>
              </Pressable>

              <View
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  width: "100%",
                  marginTop: 20,
                }}
              >
                <Pressable onPress={() => router.push("/(tabs)")}>
                  <Text style={[styles.link, { color: tint }]}>
                    Quay lại trang chủ
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, padding: 16, justifyContent: "center" },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 16,
  },
  form: { marginTop: 4 },
  label: { fontSize: 13, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.select({ ios: 12, android: 10 }),
    fontSize: 16,
  },
  btn: {
    marginTop: 18,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  footerRow: { marginTop: 12, alignItems: "flex-end" },
  link: { fontSize: 14, fontWeight: "600" },
});
