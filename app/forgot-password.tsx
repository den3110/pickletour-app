// app/screens/ForgotPasswordScreen.jsx  (có thể đặt ở app/(auth)/forgot-password.jsx)
import React, { useMemo, useState, useCallback } from "react";
import {
  Alert as RNAlert,
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  useColorScheme,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useForgotPasswordMutation } from "@/slices/usersApiSlice";

function SuccessBanner({ children }) {
  return (
    <View style={styles.successBanner}>
      <Text style={styles.successBannerText}>{children}</Text>
    </View>
  );
}

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [forgotPassword, { isLoading }] = useForgotPasswordMutation();

  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();

  const themed = useMemo(
    () => ({
      bg: isDark ? "#0b0b0c" : "#f5f7fb",
      cardBg: isDark ? "#16181d" : "#ffffff",
      text: isDark ? "#e6e6e9" : "#0f172a",
      subtext: isDark ? "#a1a1aa" : "#475569",
      border: isDark ? "#2a2d33" : "#e5e7eb",
      primary: "#2563eb",
      primaryText: "#ffffff",
      muted: isDark ? "#2b2f36" : "#f1f5f9",
    }),
    [isDark]
  );

  const emailValid = useMemo(() => {
    const v = email.trim();
    if (!v) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }, [email]);

  const handleSubmit = useCallback(async () => {
    if (!emailValid || isLoading) return;
    const normEmail = email.trim().toLowerCase();
    try {
      const res = await forgotPassword({
        email: normEmail,
        platform: "app", // yêu cầu BE check tồn tại & gửi OTP
      }).unwrap();

      // Lưu để hiện banner nếu cần
      if (res?.masked) setSentTo(res.masked);

      // ✅ Chỉ đi tiếp khi email tồn tại & đã gửi OTP
      if (res?.exists === true && res?.channel === "otp") {
        const params = new URLSearchParams({
          email: normEmail,
          masked: res?.masked || "",
          expiresIn: String(
            typeof res?.expiresIn === "number" ? res.expiresIn : 600
          ),
        }).toString();
        router.push(`/reset-password?${params}`);
        return;
      }

      // ❌ Không tồn tại hoặc không gửi được OTP
      RNAlert.alert(
        "Không thể tiếp tục",
        res?.message || "Email không tồn tại hoặc không gửi được OTP."
      );
    } catch (err) {
      RNAlert.alert(
        "Thất bại",
        err?.data?.message || "Không gửi được yêu cầu. Vui lòng thử lại sau."
      );
    }
  }, [emailValid, email, isLoading, forgotPassword, router]);

  const goLogin = useCallback(() => {
    // Tuỳ flow: quay lại, hoặc replace trực tiếp tới /login
    router.back();
    // router.replace("/login");
  }, [router]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: themed.bg }]}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.kav}
          keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
        >
          <ScrollView
            contentContainerStyle={styles.container}
            keyboardShouldPersistTaps="handled"
          >
            <View
              style={[
                styles.card,
                { backgroundColor: themed.cardBg, borderColor: themed.border },
              ]}
            >
              <Text style={[styles.title, { color: themed.text }]}>
                Quên mật khẩu
              </Text>
              <Text style={[styles.desc, { color: themed.subtext }]}>
                Nhập <Text style={styles.bold}>email</Text> bạn đã đăng ký. Hệ
                thống sẽ gửi <Text style={styles.bold}>mã OTP 6 số</Text> đến
                email <Text style={styles.bold}>nếu tài khoản tồn tại</Text>.
              </Text>

              {!!sentTo && (
                <SuccessBanner>
                  Nếu email tồn tại, hướng dẫn đã được gửi tới:{" "}
                  <Text style={styles.bold}>{sentTo}</Text>.
                </SuccessBanner>
              )}

              <View style={styles.form}>
                <Text style={[styles.label, { color: themed.subtext }]}>
                  Email
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      color: themed.text,
                      backgroundColor: themed.muted,
                      borderColor: themed.border,
                    },
                  ]}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor={isDark ? "#6b7280" : "#94a3b8"}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="send"
                  onSubmitEditing={handleSubmit}
                  textContentType="emailAddress"
                  accessibilityLabel="Email"
                  autoFocus
                />

                <Pressable
                  onPress={handleSubmit}
                  disabled={!emailValid || isLoading}
                  style={({ pressed }) => [
                    styles.button,
                    {
                      backgroundColor:
                        !emailValid || isLoading ? "#94a3b8" : themed.primary,
                      opacity: pressed ? 0.9 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Gửi OTP"
                  testID="submit-forgot"
                >
                  {isLoading ? (
                    <ActivityIndicator
                      size="small"
                      color={themed.primaryText}
                    />
                  ) : (
                    <Text
                      style={[styles.buttonText, { color: themed.primaryText }]}
                    >
                      Gửi OTP
                    </Text>
                  )}
                </Pressable>

                <Pressable
                  onPress={goLogin}
                  style={styles.backLink}
                  hitSlop={8}
                >
                  <Text style={[styles.backText, { color: themed.primary }]}>
                    Quay lại đăng nhập
                  </Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  kav: { flex: 1 },
  container: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingVertical: 24,
    justifyContent: "center",
  },
  card: {
    borderRadius: 16,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 6,
  },
  desc: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  bold: { fontWeight: "700" },
  successBanner: {
    backgroundColor: "#e6f4ea",
    borderColor: "#c7e6d1",
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  successBannerText: {
    color: "#14532d",
    fontSize: 13.5,
  },
  form: { marginTop: 4 },
  label: {
    fontSize: 13,
    marginBottom: 6,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: Platform.select({ ios: 12, android: 10 }),
    fontSize: 16,
  },
  button: {
    marginTop: 14,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { fontSize: 16, fontWeight: "700" },
  backLink: { marginTop: 12, alignSelf: "flex-start" },
  backText: { fontSize: 14, fontWeight: "600" },
});
