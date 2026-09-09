// app/screens/ForgotPasswordScreen.jsx  (có thể đặt ở app/(auth)/forgot-password.jsx)
import { useUiVersion } from "@/hooks/uiVersion";
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
  TouchableWithoutFeedback,
  useColorScheme,
  View,
} from "react-native";
import { TextInput } from "@/components/ui/i18nTextInput";
import { Text } from "@/components/ui/i18nText";
import { useRouter } from "expo-router";
import {
  useForgotPasswordMutation,
  useResolveResetOptionsMutation,
} from "@/slices/usersApiSlice";
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
  // identifier = email HOẶC số điện thoại; app tự hỏi BE kênh khả dụng.
  const [identifier, setIdentifier] = useState("");
  const [forgotPassword, { isLoading: isSending }] = useForgotPasswordMutation();
  const [resolveOptions, { isLoading: isResolving }] =
    useResolveResetOptionsMutation();
  // opts: kết quả tra kênh { channels:{email,zalo}, maskedEmail, maskedPhone } | null
  const [opts, setOpts] = useState<any>(null);
  const isLoading = isSending || isResolving;

  const identValid = useMemo(() => {
    const v = identifier.trim();
    if (!v) return false;
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    const isPhone = /^(0\d{9}|(\+?84)\d{9})$/.test(v.replace(/\s/g, ""));
    return isEmail || isPhone;
  }, [identifier]);

  const colorScheme = useColorScheme();
  const v2 = useUiVersion() === "v2";
  const isDark = v2 || colorScheme === "dark";
  const router = useRouter();

  const themed = useMemo(
    () => ({
      bg: v2 ? "#040E20" : isDark ? "#0b0b0c" : "#f5f7fb",
      cardBg: v2 ? "#0A1B34" : isDark ? "#16181d" : "#ffffff",
      text: v2 ? "#EAF3FF" : isDark ? "#e6e6e9" : "#0f172a",
      subtext: v2 ? "#8CA6C8" : isDark ? "#a1a1aa" : "#475569",
      border: v2 ? "rgba(92,180,255,0.16)" : isDark ? "#2a2d33" : "#e5e7eb",
      primary: v2 ? "#12B6F3" : "#2563eb",
      primaryText: v2 ? "#04121f" : "#ffffff",
      muted: v2 ? "#0E2244" : isDark ? "#2b2f36" : "#f1f5f9",
    }),
    [isDark, v2]
  );

  // Gửi OTP qua kênh đã chọn (email | zalo) theo identifier, rồi sang màn nhập OTP.
  const sendOtp = useCallback(
    async (channel: "email" | "zalo") => {
      if (isLoading) return;
      const id = identifier.trim();
      try {
        const res: any = await forgotPassword({ identifier: id, channel }).unwrap();
        if (res?.exists === false || res?.ok === false) {
          RNAlert.alert(
            "Không thể tiếp tục",
            res?.message || "Không gửi được OTP. Vui lòng thử lại."
          );
          return;
        }
        const params = new URLSearchParams({
          identifier: id,
          channel,
          masked: res?.masked || "",
          expiresIn: String(
            typeof res?.expiresIn === "number" ? res.expiresIn : 600
          ),
        }).toString();
        router.push(`/reset-password?${params}`);
      } catch (err: any) {
        RNAlert.alert(
          "Thất bại",
          err?.data?.message || "Không gửi được OTP. Vui lòng thử lại sau."
        );
      }
    },
    [identifier, isLoading, forgotPassword, router]
  );

  // Bước 1: tra kênh khả dụng. Nếu chỉ 1 kênh -> gửi luôn; nếu 2 -> cho chọn.
  const handleContinue = useCallback(async () => {
    if (!identValid || isLoading) return;
    try {
      const res: any = await resolveOptions({
        identifier: identifier.trim(),
      }).unwrap();
      if (!res?.found) {
        setOpts(null);
        RNAlert.alert(
          "Không tìm thấy tài khoản",
          res?.message ||
            "Không có tài khoản khớp với email/số điện thoại này."
        );
        return;
      }
      const ch = res?.channels || {};
      if (ch.email && ch.zalo) {
        // Có cả hai -> hiển thị lựa chọn
        setOpts(res);
        return;
      }
      if (ch.zalo) return sendOtp("zalo");
      if (ch.email) return sendOtp("email");
      RNAlert.alert(
        "Không thể đặt lại",
        "Tài khoản này chưa có email hoặc số điện thoại đã kích hoạt để nhận OTP."
      );
    } catch (err: any) {
      RNAlert.alert(
        "Thất bại",
        err?.data?.message || "Không kiểm tra được tài khoản. Thử lại sau."
      );
    }
  }, [identValid, identifier, isLoading, resolveOptions, sendOtp]);

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
                Nhập <Text style={styles.bold}>email</Text> hoặc{" "}
                <Text style={styles.bold}>số điện thoại</Text> của tài khoản. Hệ
                thống sẽ gửi <Text style={styles.bold}>mã OTP 6 số</Text> để đặt
                lại mật khẩu.
              </Text>

              {opts?.found && opts?.channels?.email && opts?.channels?.zalo ? (
                // Có cả email và SĐT -> cho chọn kênh nhận OTP
                <View style={styles.form}>
                  <Text style={[styles.label, { color: themed.subtext }]}>
                    Chọn cách nhận mã OTP
                  </Text>

                  <Pressable
                    onPress={() => sendOtp("email")}
                    disabled={isLoading}
                    style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
                  >
                    <ForgotGlassSurface
                      isDark={isDark}
                      interactive={!isLoading}
                      tintColor={rgbaFromHex(themed.primary, isDark ? 0.72 : 0.62)}
                      style={[
                        styles.button,
                        IOS_26_LIQUID_GLASS_ENABLED && styles.glassPrimaryBtn,
                        { backgroundColor: themed.primary, marginTop: 8 },
                      ]}
                    >
                      <Text style={[styles.buttonText, { color: themed.primaryText }]}>
                        Gửi qua Email{opts?.maskedEmail ? ` (${opts.maskedEmail})` : ""}
                      </Text>
                    </ForgotGlassSurface>
                  </Pressable>

                  <Pressable
                    onPress={() => sendOtp("zalo")}
                    disabled={isLoading}
                    style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
                  >
                    <ForgotGlassSurface
                      isDark={isDark}
                      interactive={!isLoading}
                      tintColor={isDark ? "rgba(43,47,54,0.66)" : "rgba(255,255,255,0.78)"}
                      style={[
                        styles.button,
                        IOS_26_LIQUID_GLASS_ENABLED && styles.glassInput,
                        {
                          backgroundColor: themed.muted,
                          borderWidth: 1,
                          borderColor: themed.border,
                          marginTop: 10,
                        },
                      ]}
                    >
                      {isLoading ? (
                        <ActivityIndicator size="small" color={themed.text} />
                      ) : (
                        <Text style={[styles.buttonText, { color: themed.text }]}>
                          Gửi qua Zalo{opts?.maskedPhone ? ` (${opts.maskedPhone})` : ""}
                        </Text>
                      )}
                    </ForgotGlassSurface>
                  </Pressable>

                  <Pressable
                    onPress={() => setOpts(null)}
                    style={styles.backLink}
                    hitSlop={8}
                  >
                    <Text style={[styles.backText, { color: themed.primary }]}>
                      Đổi email / số điện thoại
                    </Text>
                  </Pressable>
                </View>
              ) : (
                // Bước nhập định danh
                <View style={styles.form}>
                  <Text style={[styles.label, { color: themed.subtext }]}>
                    Email hoặc số điện thoại
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
                      { backgroundColor: themed.muted, borderColor: themed.border },
                    ]}
                  >
                    <TextInput
                      style={[styles.inputInside, { color: themed.text }]}
                      value={identifier}
                      onChangeText={(v) => {
                        setIdentifier(v);
                        if (opts) setOpts(null);
                      }}
                      placeholder="you@example.com hoặc 0987654321"
                      placeholderTextColor={isDark ? "#6b7280" : "#94a3b8"}
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="send"
                      onSubmitEditing={handleContinue}
                      accessibilityLabel="Email hoặc số điện thoại"
                      autoFocus
                    />
                  </ForgotGlassSurface>

                  <Pressable
                    onPress={handleContinue}
                    disabled={!identValid || isLoading}
                    style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
                    accessibilityRole="button"
                    accessibilityLabel="Tiếp tục"
                    testID="submit-forgot"
                  >
                    <ForgotGlassSurface
                      isDark={isDark}
                      interactive={identValid && !isLoading}
                      tintColor={
                        !identValid || isLoading
                          ? "rgba(148,163,184,0.56)"
                          : rgbaFromHex(themed.primary, isDark ? 0.72 : 0.62)
                      }
                      style={[
                        styles.button,
                        IOS_26_LIQUID_GLASS_ENABLED && styles.glassPrimaryBtn,
                        {
                          backgroundColor:
                            !identValid || isLoading ? "#94a3b8" : themed.primary,
                        },
                      ]}
                    >
                      {isLoading ? (
                        <ActivityIndicator size="small" color={themed.primaryText} />
                      ) : (
                        <Text style={[styles.buttonText, { color: themed.primaryText }]}>
                          Tiếp tục
                        </Text>
                      )}
                    </ForgotGlassSurface>
                  </Pressable>

                  <Pressable onPress={goLogin} style={styles.backLink} hitSlop={8}>
                    <Text style={[styles.backText, { color: themed.primary }]}>
                      Quay lại đăng nhập
                    </Text>
                  </Pressable>
                </View>
              )}
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
