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
import LottieView from "lottie-react-native"; // ⬅️ NEW
import { SHOULD_RENDER_NATIVE_LOTTIE } from "@/utils/runtimeSafety";
import AppleLiquidGlassView from "@/components/ui/AppleLiquidGlassView";
import { IOS_26_LIQUID_GLASS_ENABLED } from "@/utils/nativeTabs";

// ⬅️ NEW: asset Lottie
const FORGOT_LOTTIE = require("@/assets/lottie/forgot-password.json");

function rgbaFromHex(color, alpha) {
  const hex = String(color || "").replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return color;
  const value = parseInt(hex, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function ForgotGlassSurface({
  children,
  isDark,
  style,
  tintColor,
  effect = "clear",
  interactive = false,
}) {
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

function SuccessBanner({ children, isDark }) {
  return (
    <ForgotGlassSurface
      isDark={isDark}
      tintColor={
        isDark ? "rgba(34,197,94,0.2)" : "rgba(220,252,231,0.82)"
      }
      style={[
        styles.successBanner,
        IOS_26_LIQUID_GLASS_ENABLED && styles.glassPill,
      ]}
    >
      <Text style={styles.successBannerText}>{children}</Text>
    </ForgotGlassSurface>
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

      if (res?.masked) setSentTo(res.masked);

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
            <ForgotGlassSurface
              isDark={isDark}
              effect="regular"
              tintColor={
                isDark ? "rgba(22,24,29,0.68)" : "rgba(255,255,255,0.84)"
              }
              style={[
                styles.card,
                IOS_26_LIQUID_GLASS_ENABLED && styles.glassPanel,
                { backgroundColor: themed.cardBg, borderColor: themed.border },
              ]}
            >
              {/* ⬇️ NEW: Lottie ở trên đầu, căn giữa */}
              {SHOULD_RENDER_NATIVE_LOTTIE ? (
                <View style={styles.animWrap}>
                  <LottieView
                    source={FORGOT_LOTTIE}
                    autoPlay
                    loop
                    resizeMode="contain"
                    style={styles.anim}
                    pointerEvents="none"
                  />
                </View>
              ) : null}

              <Text style={[styles.title, { color: themed.text }]}>
                Quên mật khẩu
              </Text>
              <Text style={[styles.desc, { color: themed.subtext }]}>
                Nhập <Text style={styles.bold}>email</Text> bạn đã đăng ký. Hệ
                thống sẽ gửi <Text style={styles.bold}>mã OTP 6 số</Text> đến
                email <Text style={styles.bold}>nếu tài khoản tồn tại</Text>.
              </Text>

              {!!sentTo && (
                <SuccessBanner isDark={isDark}>
                  Nếu email tồn tại, hướng dẫn đã được gửi tới:{" "}
                  <Text style={styles.bold}>{sentTo}</Text>.
                </SuccessBanner>
              )}

              <View style={styles.form}>
                <Text style={[styles.label, { color: themed.subtext }]}>
                  Email
                </Text>
                <ForgotGlassSurface
                  isDark={isDark}
                  interactive
                  tintColor={
                    isDark ? "rgba(43,47,54,0.66)" : "rgba(255,255,255,0.78)"
                  }
                  style={[
                    styles.inputShell,
                    IOS_26_LIQUID_GLASS_ENABLED && styles.glassInput,
                    {
                      backgroundColor: themed.muted,
                      borderColor: themed.border,
                    },
                  ]}
                >
                  <TextInput
                    style={[styles.inputInside, { color: themed.text }]}
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
                </ForgotGlassSurface>

                <Pressable
                  onPress={handleSubmit}
                  disabled={!emailValid || isLoading}
                  style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Gửi OTP"
                  testID="submit-forgot"
                >
                  <ForgotGlassSurface
                    isDark={isDark}
                    interactive={emailValid && !isLoading}
                    tintColor={
                      !emailValid || isLoading
                        ? "rgba(148,163,184,0.56)"
                        : rgbaFromHex(themed.primary, isDark ? 0.72 : 0.62)
                    }
                    style={[
                      styles.button,
                      IOS_26_LIQUID_GLASS_ENABLED && styles.glassPrimaryBtn,
                      {
                        backgroundColor:
                          !emailValid || isLoading
                            ? "#94a3b8"
                            : themed.primary,
                      },
                    ]}
                  >
                    {isLoading ? (
                      <ActivityIndicator
                        size="small"
                        color={themed.primaryText}
                      />
                    ) : (
                      <Text
                        style={[
                          styles.buttonText,
                          { color: themed.primaryText },
                        ]}
                      >
                        Gửi OTP
                      </Text>
                    )}
                  </ForgotGlassSurface>
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
            </ForgotGlassSurface>
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
  glassPanel: {
    borderColor: "rgba(255,255,255,0.24)",
    overflow: "hidden",
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  // ⬇️ NEW
  animWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  anim: { width: 180, height: 180 },

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
  glassPill: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    overflow: "hidden",
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
  inputShell: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  glassInput: {
    borderColor: "rgba(255,255,255,0.24)",
  },
  inputInside: {
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
    overflow: "hidden",
  },
  glassPrimaryBtn: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.32)",
    shadowColor: "#2563eb",
    shadowOpacity: 0.24,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  buttonText: { fontSize: 16, fontWeight: "700" },
  backLink: { marginTop: 12, alignSelf: "flex-start" },
  backText: { fontSize: 14, fontWeight: "600" },
});
