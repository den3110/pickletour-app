import React, { useMemo, useState } from "react";
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
import { Image } from "expo-image";
import { router, Stack, Redirect } from "expo-router";
import { useDispatch, useSelector } from "react-redux";
import { useLoginMutation } from "@/slices/usersApiSlice";
import { setCredentials } from "@/slices/authSlice";
import { saveUserInfo } from "@/utils/authStorage";
import apiSlice from "@/slices/apiSlice";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import LottieView from "lottie-react-native"; // ⬅️ NEW

/* ---------- Helpers ---------- */
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

/** Logo cục bộ: đặt file ở /assets/logo.png */
const LOGO_SRC = require("@/assets/images/icon.png");
/** Lottie background */
const BG_LOTTIE = require("@/assets/lottie/animated-bg.json");

/** Chiều cao vùng nút cố định dưới cùng (để chừa khoảng trống ScrollView) */
const BOTTOM_ACTIONS_H = 132;

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme() ?? "light";
  const isDark = scheme === "dark";
  const tint = isDark ? "#7cc0ff" : "#0a84ff";
  const cardBg = isDark ? "#16181c" : "#ffffff";
  const textPrimary = isDark ? "#fff" : "#111";
  const textSecondary = isDark ? "#c9c9c9" : "#444";
  const border = isDark ? "#2e2f33" : "#dfe3ea";
  const logoBg = isDark ? "#202329" : "#f3f5f9";

  const dispatch = useDispatch();
  const userInfo = useSelector((s) => s.auth?.userInfo);
  const [login, { isLoading }] = useLoginMutation();

  // State
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");

  // Loại input
  const kind = useMemo(() => {
    const v = (loginId || "").trim();
    if (v.includes("@")) return "email";
    if (isLikelyPhone(v)) return "phone";
    return "nickname";
  }, [loginId]);

  const kbType = useMemo(
    () =>
      kind === "email"
        ? "email-address"
        : kind === "phone"
        ? "phone-pad"
        : "default",
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

      dispatch(setCredentials(normalized));
      dispatch(apiSlice.util.resetApiState());
      await saveUserInfo(normalized);

      router.replace("/(tabs)");
    } catch (err) {
      const msg =
        err?.data?.message ||
        err?.error ||
        "Đăng nhập thất bại. Vui lòng kiểm tra lại.";
      Alert.alert("Lỗi", String(msg));
    }
  };

  const shouldRedirect = !!userInfo;

  return shouldRedirect ? (
    <Redirect href="/(tabs)" />
  ) : (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      {/* ===== Root container để đặt BG Lottie phía sau toàn bộ ===== */}
      <View style={{ flex: 1 }}>
        {/* BG Lottie (absolute, không chặn touch) */}
        <LottieView
          source={BG_LOTTIE}
          autoPlay
          loop
          resizeMode="cover"
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
        {/* Scrim nhẹ để nội dung nổi bật hơn */}
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            {
              backgroundColor: isDark
                ? "rgba(0,0,0,0.28)"
                : "rgba(255,255,255,0.58)",
            },
          ]}
        />

        <KeyboardAvoidingView
          behavior={Platform.select({ ios: "padding", android: undefined })}
          style={{ flex: 1 }}
        >
          <View style={{ flex: 1 }}>
            <ScrollView
              contentContainerStyle={[
                styles.scroll,
                {
                  paddingBottom: BOTTOM_ACTIONS_H + insets.bottom + 16, // chừa chỗ cho nút cố định
                },
              ]}
              keyboardShouldPersistTaps="handled"
            >
              <View
                style={[
                  styles.card,
                  { backgroundColor: cardBg, borderColor: border },
                ]}
              >
                {/* Logo (Expo Image) */}
                <View
                  style={[
                    styles.logoWrap,
                    { backgroundColor: logoBg, borderColor: border },
                  ]}
                >
                  <Image
                    source={LOGO_SRC}
                    style={styles.logo}
                    contentFit="contain"
                    transition={150}
                    cachePolicy="memory-disk"
                  />
                </View>

                <Text style={[styles.title, { color: textPrimary }]}>
                  Đăng nhập
                </Text>

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
                    keyboardType={"default"}
                    textContentType="username"
                    autoComplete="username"
                    returnKeyType="next"
                  />

                  <Text
                    style={[
                      styles.label,
                      { color: textSecondary, marginTop: 12 },
                    ]}
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

                  {/* Đăng nhập */}
                  <Pressable
                    onPress={onSubmit}
                    disabled={isLoading}
                    style={({ pressed }) => [
                      styles.btnSolid,
                      {
                        backgroundColor: tint,
                        opacity: isLoading ? 0.7 : pressed ? 0.9 : 1,
                      },
                    ]}
                  >
                    {isLoading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.btnTextWhite}>Đăng nhập</Text>
                    )}
                  </Pressable>

                  {/* Quên mật khẩu — dưới nút đăng nhập, căn giữa, màu đen */}
                  <Pressable
                    onPress={() => router.push("/forgot-password")}
                    style={{ alignSelf: "center", marginTop: 10 }}
                  >
                    <Text
                      style={{
                        color: "#111",
                        fontWeight: "700",
                      }}
                    >
                      Quên mật khẩu?
                    </Text>
                  </Pressable>
                </View>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>

        {/* ===== Nút cố định dưới cùng (nằm trên BG) ===== */}
        <View
          style={[
            styles.bottomActions,
            {
              backgroundColor: cardBg,
              borderTopColor: border,
              paddingBottom: insets.bottom + 10,
            },
          ]}
        >
          {/* Trang chủ (outline đen) */}
          <Pressable
            onPress={() => router.push("/(tabs)")}
            style={({ pressed }) => [
              styles.btnOutlinePill,
              {
                borderColor: border,
                opacity: pressed ? 0.92 : 1,
              },
            ]}
          >
            <Text style={[styles.btnOutlineText, { color: "#555" }]}>
              Trang chủ
            </Text>
          </Pressable>

          {/* Đăng ký (outline xanh) */}
          <Pressable
            onPress={() => router.push("/register")}
            style={({ pressed }) => [
              styles.btnOutlinePill,
              {
                borderColor: tint,
                opacity: pressed ? 0.92 : 1,
                marginTop: 10,
              },
            ]}
          >
            <Text style={[styles.btnOutlineText, { color: tint }]}>
              Đăng ký
            </Text>
          </Pressable>
        </View>
      </View>
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
  /* Logo container: nền nhẹ + viền */
  logoWrap: {
    alignSelf: "center",
    width: 110,
    height: 110,
    borderRadius: 60,
    marginBottom: 10,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  logo: { width: 88, height: 88, borderRadius: 18 },
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

  /* Buttons */
  btnSolid: {
    marginTop: 18,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  btnTextWhite: { color: "#fff", fontWeight: "700", fontSize: 16 },

  /* Bottom fixed actions */
  bottomActions: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  btnOutlinePill: {
    width: "100%",
    paddingVertical: 14,
    borderRadius: 999, // góc 50% (pill)
    borderWidth: 1, // viền rõ ràng
    alignItems: "center",
    justifyContent: "center",
  },
  btnOutlineText: { fontWeight: "700", fontSize: 16 },
});
