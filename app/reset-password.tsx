// app/(auth)/reset-password-otp.jsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
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
  Alert as RNAlert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  useForgotPasswordMutation,
  useVerifyResetOtpMutation,
  useResetPasswordMutation,
} from "@/slices/usersApiSlice";
import LottieView from "lottie-react-native"; // ⬅️ NEW

const OTP_LOTTIE = require("@/assets/lottie/otp-verification.json"); // ⬅️ NEW

const OTP_LEN = 6;

function SuccessBanner({ children }) {
  return (
    <View style={styles.successBanner}>
      <Text style={styles.successBannerText}>{children}</Text>
    </View>
  );
}

function OtpCells({ value, setValue, themed, editable = true }) {
  const inputsRef = useRef([]);

  const focusIndex = (idx) => {
    const r = inputsRef.current[idx];
    if (r && r.focus) r.focus();
  };

  const handleChange = (text, idx) => {
    if (!editable) return;
    let cleaned = String(text || "").replace(/\D/g, "");
    if (cleaned.length > 1) {
      const chars = cleaned.slice(0, OTP_LEN).split("");
      const current = value.split("");
      for (let i = 0; i < OTP_LEN; i++) {
        if (i >= idx && chars.length) current[i] = chars.shift();
      }
      setValue(current.join("").slice(0, OTP_LEN));
      const next = Math.min(OTP_LEN - 1, idx + cleaned.length);
      focusIndex(next);
      return;
    }
    const current = value.split("");
    current[idx] = cleaned;
    const joined = current.join("").slice(0, OTP_LEN);
    setValue(joined);
    if (cleaned && idx < OTP_LEN - 1) focusIndex(idx + 1);
  };

  const handleKeyPress = (e, idx) => {
    if (!editable) return;
    if (e.nativeEvent.key === "Backspace") {
      if (!value[idx] && idx > 0) {
        const current = value.split("");
        current[idx - 1] = "";
        setValue(current.join(""));
        focusIndex(idx - 1);
      }
    }
  };

  return (
    <View style={styles.otpRow}>
      {Array.from({ length: OTP_LEN }).map((_, i) => (
        <TextInput
          key={i}
          ref={(r) => (inputsRef.current[i] = r)}
          value={value[i] || ""}
          onChangeText={(t) => handleChange(t, i)}
          onKeyPress={(e) => handleKeyPress(e, i)}
          keyboardType="number-pad"
          returnKeyType={i === OTP_LEN - 1 ? "done" : "next"}
          maxLength={1}
          editable={editable}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          style={[
            styles.otpCell,
            {
              color: themed.text,
              backgroundColor: themed.muted,
              borderColor: themed.border,
              opacity: editable ? 1 : 0.6,
            },
          ]}
        />
      ))}
    </View>
  );
}

export default function ResetPasswordOtpScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const getParam = (k, def = "") => {
    const v = params?.[k];
    if (Array.isArray(v)) return v[0] ?? def;
    return v ?? def;
  };

  const initialEmail = String(getParam("email", "")).toLowerCase().trim();
  const masked = String(getParam("masked", ""));
  const initialTTL = Number(getParam("expiresIn", 600)) || 600;

  const [forgotPassword, { isLoading: isResending }] =
    useForgotPasswordMutation();
  const [verifyResetOtp, { isLoading: isVerifying }] =
    useVerifyResetOtpMutation();
  const [resetPassword, { isLoading: isResetting }] =
    useResetPasswordMutation();

  const [otp, setOtp] = useState("");
  const [phase, setPhase] = useState("otp"); // "otp" | "pwd"
  const [secondsLeft, setSecondsLeft] = useState(initialTTL);
  const [resendCooldown, setResendCooldown] = useState(0);

  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [showPwd2, setShowPwd2] = useState(false);

  // Mutex chống spam resend
  const resendBusyRef = useRef(false);
  const [resendBusy, setResendBusy] = useState(false);
  const setResendBusySafe = (v) => {
    resendBusyRef.current = v;
    setResendBusy(v);
  };

  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const themed = useMemo(
    () => ({
      bg: isDark ? "#0b0b0c" : "#f5f7fb",
      cardBg: isDark ? "#16181d" : "#ffffff",
      text: isDark ? "#e6e6e9" : "#0f172a",
      subtext: isDark ? "#a1a1aa" : "#475569",
      border: isDark ? "#2a2d33" : "#e5e7eb",
      primary: "#2563eb",
      danger: "#dc2626",
      primaryText: "#ffffff",
      muted: isDark ? "#2b2f36" : "#f1f5f9",
    }),
    [isDark]
  );

  // ⬇️ NEW: điều khiển OTP animation
  const otpAnimRef = useRef<LottieView>(null);
  useEffect(() => {
    if (phase === "otp") {
      requestAnimationFrame(() => {
        otpAnimRef.current?.reset?.();
        otpAnimRef.current?.play?.();
      });
    }
  }, [phase]);

  useEffect(() => {
    const id = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
      setResendCooldown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  const canVerify =
    otp && otp.length === OTP_LEN && !isVerifying && secondsLeft > 0;
  const canReset =
    phase === "pwd" && pwd.length >= 6 && pwd === pwd2 && !isResetting;

  const handleVerify = useCallback(async () => {
    if (!canVerify) return;
    try {
      const res = await verifyResetOtp({
        email: initialEmail,
        otp,
        platform: "app",
      }).unwrap();
      if (typeof res?.expiresIn === "number") setSecondsLeft(res.expiresIn);
      setPhase("pwd");
      RNAlert.alert("Thành công", "OTP hợp lệ. Vui lòng nhập mật khẩu mới.");
    } catch (err) {
      RNAlert.alert(
        "Thất bại",
        err?.data?.message || "OTP không hợp lệ hoặc đã hết hạn."
      );
      // gợi ý: có thể reset & play lại anim để nhấn mạnh
      otpAnimRef.current?.reset?.();
      otpAnimRef.current?.play?.();
    }
  }, [canVerify, verifyResetOtp, initialEmail, otp]);

  const handleResend = useCallback(async () => {
    if (
      !initialEmail ||
      resendCooldown > 0 ||
      isResending ||
      resendBusyRef.current
    )
      return;
    try {
      setResendBusySafe(true);
      const res = await forgotPassword({
        email: initialEmail,
        platform: "app",
      }).unwrap();

      const ttl = typeof res?.expiresIn === "number" ? res.expiresIn : 600;
      setSecondsLeft(ttl);
      setResendCooldown(30);
      setPhase("otp");
      setOtp("");
      RNAlert.alert(
        "Đã gửi lại OTP",
        `Kiểm tra email ${masked || initialEmail}.`
      );
      // replay anim sau khi gửi lại
      requestAnimationFrame(() => {
        otpAnimRef.current?.reset?.();
        otpAnimRef.current?.play?.();
      });
    } catch (err) {
      RNAlert.alert(
        "Lỗi",
        err?.data?.message || "Không gửi lại được OTP. Thử lại sau."
      );
    } finally {
      setResendBusySafe(false);
    }
  }, [forgotPassword, initialEmail, resendCooldown, isResending, masked]);

  const handleReset = useCallback(async () => {
    if (!canReset) return;
    try {
      await resetPassword({
        platform: "app",
        email: initialEmail,
        otp,
        password: pwd,
      }).unwrap();

      RNAlert.alert(
        "Thành công",
        "Đổi mật khẩu thành công. Vui lòng đăng nhập lại.",
        [{ text: "OK", onPress: () => router.replace("/login") }]
      );
    } catch (err) {
      RNAlert.alert(
        "Thất bại",
        err?.data?.message || "Không đổi được mật khẩu. Có thể OTP đã hết hạn."
      );
    }
  }, [canReset, resetPassword, initialEmail, otp, pwd, router]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: themed.bg }}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
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
                {phase === "otp" ? "Xác minh OTP" : "Đặt mật khẩu mới"}
              </Text>
              <Text style={[styles.desc, { color: themed.subtext }]}>
                Mã OTP đã gửi tới{" "}
                <Text style={styles.bold}>{masked || initialEmail}</Text>. Hết
                hạn sau{" "}
                <Text style={styles.bold}>
                  {minutes}:{String(seconds).padStart(2, "0")}
                </Text>
                .
              </Text>

              {/* ⬇️ NEW: Lottie OTP — chỉ hiện ở phase OTP */}
              {phase === "otp" && (
                <View style={styles.otpAnimWrap}>
                  <LottieView
                    ref={otpAnimRef}
                    source={OTP_LOTTIE}
                    autoPlay
                    loop
                    resizeMode="contain"
                    style={styles.otpAnim}
                    pointerEvents="none"
                  />
                </View>
              )}

              {/* Bước 1: OTP (luôn render), editable tuỳ phase */}
              <OtpCells
                value={otp}
                setValue={setOtp}
                themed={themed}
                editable={phase === "otp"}
              />

              {phase === "otp" ? (
                <>
                  <Pressable
                    onPress={handleVerify}
                    disabled={!canVerify}
                    style={({ pressed }) => [
                      styles.button,
                      {
                        backgroundColor: canVerify ? themed.primary : "#94a3b8",
                        opacity: pressed ? 0.9 : 1,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Xác minh OTP"
                    testID="verify-otp"
                  >
                    {isVerifying ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.buttonText}>Xác minh OTP</Text>
                    )}
                  </Pressable>

                  <View style={styles.inlineRow}>
                    <Text style={{ color: themed.subtext, fontSize: 13 }}>
                      Không nhận được mã?
                    </Text>
                    <Pressable
                      onPress={handleResend}
                      disabled={resendCooldown > 0 || isResending || resendBusy}
                      hitSlop={8}
                    >
                      <Text
                        style={{
                          color:
                            resendCooldown > 0 || isResending || resendBusy
                              ? "#94a3b8"
                              : themed.primary,
                          fontWeight: "600",
                          marginLeft: 6,
                          fontSize: 13,
                        }}
                      >
                        {resendCooldown > 0
                          ? `Gửi lại (${resendCooldown}s)`
                          : isResending || resendBusy
                          ? "Đang gửi..."
                          : "Gửi lại OTP"}
                      </Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <>
                  <SuccessBanner>
                    OTP hợp lệ. Nhập mật khẩu mới bên dưới.
                  </SuccessBanner>

                  <Text style={[styles.label, { color: themed.subtext }]}>
                    Mật khẩu mới
                  </Text>
                  <View
                    style={[
                      styles.inputWrap,
                      {
                        backgroundColor: themed.muted,
                        borderColor: themed.border,
                      },
                    ]}
                  >
                    <TextInput
                      style={[styles.inputFlex, { color: themed.text }]}
                      value={pwd}
                      onChangeText={setPwd}
                      placeholder="Tối thiểu 6 ký tự"
                      placeholderTextColor={isDark ? "#6b7280" : "#94a3b8"}
                      secureTextEntry={!showPwd}
                      autoCapitalize="none"
                      autoCorrect={false}
                      textContentType="newPassword"
                      returnKeyType="next"
                    />
                    <Pressable
                      onPress={() => setShowPwd((v) => !v)}
                      hitSlop={8}
                    >
                      <Text style={{ color: themed.subtext }}>
                        {showPwd ? "Ẩn" : "Hiện"}
                      </Text>
                    </Pressable>
                  </View>

                  <Text
                    style={[
                      styles.label,
                      { color: themed.subtext, marginTop: 12 },
                    ]}
                  >
                    Nhập lại mật khẩu
                  </Text>
                  <View
                    style={[
                      styles.inputWrap,
                      {
                        backgroundColor: themed.muted,
                        borderColor: themed.border,
                      },
                    ]}
                  >
                    <TextInput
                      style={[styles.inputFlex, { color: themed.text }]}
                      value={pwd2}
                      onChangeText={setPwd2}
                      placeholder="Nhập lại mật khẩu"
                      placeholderTextColor={isDark ? "#6b7280" : "#94a3b8"}
                      secureTextEntry={!showPwd2}
                      autoCapitalize="none"
                      autoCorrect={false}
                      textContentType="newPassword"
                      returnKeyType="done"
                      onSubmitEditing={handleReset}
                    />
                    <Pressable
                      onPress={() => setShowPwd2((v) => !v)}
                      hitSlop={8}
                    >
                      <Text style={{ color: themed.subtext }}>
                        {showPwd2 ? "Ẩn" : "Hiện"}
                      </Text>
                    </Pressable>
                  </View>

                  {pwd && pwd2 && pwd !== pwd2 && (
                    <Text
                      style={{
                        marginTop: 6,
                        color: themed.danger,
                        fontSize: 12,
                      }}
                    >
                      Mật khẩu nhập lại không khớp.
                    </Text>
                  )}

                  <Pressable
                    onPress={handleReset}
                    disabled={!canReset}
                    style={({ pressed }) => [
                      styles.button,
                      {
                        backgroundColor: canReset ? themed.primary : "#94a3b8",
                        opacity: pressed ? 0.9 : 1,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Đổi mật khẩu"
                    testID="submit-reset"
                  >
                    {isResetting ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.buttonText}>Đổi mật khẩu</Text>
                    )}
                  </Pressable>
                </>
              )}

              <Pressable
                onPress={() => router.back()}
                style={{ marginTop: 10, alignSelf: "flex-start" }}
                hitSlop={8}
              >
                <Text style={{ color: themed.primary, fontWeight: "600" }}>
                  Quay lại
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  title: { fontSize: 20, fontWeight: "800", marginBottom: 6 },
  desc: { fontSize: 14, lineHeight: 20, marginBottom: 12 },
  bold: { fontWeight: "700" },

  // OTP anim (NEW)
  otpAnimWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
    marginBottom: 8,
  },
  otpAnim: { width: 130, height: 130 },

  successBanner: {
    backgroundColor: "#e6f4ea",
    borderColor: "#c7e6d1",
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  successBannerText: { color: "#14532d", fontSize: 13.5 },
  otpRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 2,
    marginBottom: 12,
  },
  otpCell: {
    width: 48,
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    textAlign: "center",
    fontSize: 20,
    fontWeight: "700",
    includeFontPadding: false,
    paddingVertical: Platform.select({ ios: 10, android: 6 }),
  },
  label: { fontSize: 13, marginBottom: 6 },
  inputWrap: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: Platform.select({ ios: 10, android: 4 }),
    flexDirection: "row",
    alignItems: "center",
  },
  inputFlex: {
    flex: 1,
    fontSize: 16,
    paddingVertical: Platform.select({ ios: 8, android: 4 }),
    marginRight: 8,
  },
  button: {
    marginTop: 16,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  inlineRow: { marginTop: 12, flexDirection: "row", alignItems: "center" },
});
