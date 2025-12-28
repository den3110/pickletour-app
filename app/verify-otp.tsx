// app/(auth)/verify-otp.jsx
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useDispatch } from "react-redux";
import { setCredentials } from "@/slices/authSlice";
import { saveUserInfo } from "@/utils/authStorage";
import {
  useVerifyRegisterOtpMutation,
  useResendRegisterOtpMutation,
} from "@/slices/usersApiSlice";
// Theme & Icons
import { useTheme } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";

const OTP_LENGTH = 6;

export default function VerifyOtpScreen() {
  const dispatch = useDispatch();
  const params = useLocalSearchParams();

  // Theme Setup
  const { dark } = useTheme();
  const colors = useMemo(
    () => ({
      bg: dark ? "#121212" : "#FFFFFF",
      text: dark ? "#FFFFFF" : "#1F2937",
      subText: dark ? "#9CA3AF" : "#6B7280",
      primary: "#667eea", // Màu chủ đạo tím xanh
      cellBg: dark ? "#2C2C2E" : "#F3F4F6",
      cellBorder: dark ? "#444" : "#E5E7EB",
      cellActive: "#667eea",
      error: "#EF4444",
    }),
    [dark]
  );

  const registerToken = String(params.registerToken || "");
  const phoneMasked = String(params.phoneMasked || "");
  const devOtp = String(params.devOtp || "");

  // Ref cho input ẩn
  const inputRef = useRef(null);

  const [otp, setOtp] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [isFocused, setIsFocused] = useState(true); // Mặc định focus

  const [verifyOtp, { isLoading: verifying }] = useVerifyRegisterOtpMutation();
  const [resendOtp, { isLoading: resending }] = useResendRegisterOtpMutation();

  const handlePressContainer = () => {
    setIsFocused(true);
    inputRef.current?.focus();
  };

  const dismissKeyboard = useCallback(() => {
    setIsFocused(false);
    Keyboard.dismiss();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  // Tự động submit khi đủ 6 số
  useEffect(() => {
    if (otp.length === OTP_LENGTH) {
      dismissKeyboard();
      onVerify();
    }
  }, [otp]);

  const canSubmit = useMemo(
    () => otp.length === OTP_LENGTH && !verifying,
    [otp, verifying]
  );

  const onVerify = useCallback(async () => {
    // Nếu gọi từ useEffect thì không cần check length lại, nhưng bấm nút thì cần
    if (otp.length !== OTP_LENGTH) return;

    dismissKeyboard();
    try {
      const res = await verifyOtp({ registerToken, otp: otp.trim() }).unwrap();
      const normalized = res ? { ...res, token: res.token } : res;

      dispatch(setCredentials(normalized));
      await saveUserInfo(normalized);

      router.replace("/(tabs)/profile");
    } catch (err) {
      Alert.alert(
        "Lỗi xác thực",
        err?.data?.message || err?.error || "Mã OTP không chính xác"
      );
      // Reset OTP để nhập lại
      setOtp("");
      inputRef.current?.focus();
      setIsFocused(true);
    }
  }, [verifyOtp, registerToken, otp, dispatch]);

  const onResend = useCallback(async () => {
    try {
      await resendOtp({ registerToken }).unwrap();
      setCooldown(30);
      Alert.alert("Đã gửi lại", "Vui lòng kiểm tra tin nhắn.");
      inputRef.current?.focus();
    } catch (err) {
      Alert.alert(
        "Lỗi",
        err?.data?.message || err?.error || "Gửi lại OTP thất bại"
      );
    }
  }, [resendOtp, registerToken]);

  // Render 6 ô vuông
  const renderCells = () => {
    return (
      <View style={styles.cellContainer}>
        {Array(OTP_LENGTH)
          .fill(0)
          .map((_, index) => {
            const digit = otp[index];
            const isCurrent = index === otp.length && isFocused; // Ô đang nhập
            const isFilled = !!digit;

            return (
              <View
                key={index}
                style={[
                  styles.cell,
                  {
                    backgroundColor: colors.cellBg,
                    borderColor: colors.cellBorder,
                  },
                  isFilled && { borderColor: colors.text }, // Đã nhập -> Viền đậm hơn chút
                  isCurrent && {
                    borderColor: colors.primary,
                    borderWidth: 2,
                    backgroundColor: dark
                      ? "rgba(102, 126, 234, 0.1)"
                      : "#EEF2FF",
                  },
                ]}
              >
                <Text style={[styles.cellText, { color: colors.text }]}>
                  {digit || ""}
                </Text>
              </View>
            );
          })}
      </View>
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false, // Ẩn header mặc định để tự custom cho đẹp hoặc dùng SafeArea
        }}
      />

      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.bg }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Pressable style={styles.container} onPress={dismissKeyboard}>
          {/* Header Icon */}
          <View style={styles.iconWrapper}>
            <View
              style={[
                styles.iconCircle,
                { backgroundColor: dark ? "#333" : "#EEF2FF" },
              ]}
            >
              <Ionicons
                name="shield-checkmark"
                size={40}
                color={colors.primary}
              />
            </View>
          </View>

          <View style={styles.content}>
            <Text style={[styles.title, { color: colors.text }]}>
              Xác thực OTP
            </Text>

            <Text style={[styles.sub, { color: colors.subText }]}>
              {phoneMasked
                ? `Mã xác thực đã được gửi tới số\n${phoneMasked} trên Zalo`
                : "Vui lòng nhập mã OTP 6 số đã được gửi tới điện thoại của bạn."}
            </Text>

            {/* Dev OTP Hint */}
            {/* {!!devOtp && (
              <View style={styles.devTag}>
                <Text style={styles.devTagText}>DEV MODE: {devOtp}</Text>
              </View>
            )} */}

            {/* INPUT AREA */}
            <Pressable
              onPress={handlePressContainer}
              style={styles.inputWrapper}
            >
              {renderCells()}
              {/* Input ẩn nằm đè lên hoặc ẩn đi nhưng vẫn focus được */}
              <TextInput
                ref={inputRef}
                value={otp}
                onChangeText={(v) =>
                  setOtp(v.replace(/[^\d]/g, "").slice(0, OTP_LENGTH))
                }
                keyboardType="number-pad"
                textContentType="oneTimeCode" // iOS Auto-fill OTP
                maxLength={OTP_LENGTH}
                style={styles.hiddenInput}
                autoFocus
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
              />
            </Pressable>

            {/* Verify Button */}
            <TouchableOpacity
              disabled={!canSubmit}
              onPress={onVerify}
              activeOpacity={0.8}
              style={[
                styles.btn,
                { backgroundColor: colors.primary },
                !canSubmit && styles.btnDisabled,
              ]}
            >
              {verifying ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>Xác nhận</Text>
              )}
            </TouchableOpacity>

            {/* Resend Link */}
            <View style={styles.footer}>
              <Text style={{ color: colors.subText }}>
                Bạn chưa nhận được mã?{" "}
              </Text>
              <TouchableOpacity
                disabled={cooldown > 0 || resending}
                onPress={onResend}
              >
                <Text
                  style={[
                    styles.link,
                    {
                      color:
                        cooldown > 0 || resending
                          ? colors.subText
                          : colors.primary,
                    },
                  ]}
                >
                  {resending
                    ? "Đang gửi..."
                    : cooldown > 0
                    ? `Gửi lại (${cooldown}s)`
                    : "Gửi lại"}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Back to Login */}
            <TouchableOpacity
              onPress={() => router.replace("/login")}
              style={styles.backBtn}
            >
              <Text style={[styles.backText, { color: colors.subText }]}>
                Quay lại đăng nhập
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "center",
  },
  iconWrapper: {
    alignItems: "center",
    marginBottom: 24,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    alignItems: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 8,
    textAlign: "center",
  },
  sub: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 32,
    lineHeight: 22,
  },
  devTag: {
    marginBottom: 20,
    backgroundColor: "#FFEDD5",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  devTagText: {
    color: "#C2410C",
    fontWeight: "700",
    fontSize: 12,
  },

  // OTP Styles
  inputWrapper: {
    width: "100%",
    marginBottom: 32,
    position: "relative", // Để chứa hidden input
  },
  cellContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  cell: {
    width: 48,
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cellText: {
    fontSize: 24,
    fontWeight: "700",
  },
  hiddenInput: {
    position: "absolute",
    width: "100%",
    height: "100%",
    opacity: 0, // Ẩn input đi nhưng vẫn nhận touch
  },

  // Button Styles
  btn: {
    width: "100%",
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#667eea",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  btnDisabled: {
    opacity: 0.6,
    shadowOpacity: 0,
    elevation: 0,
  },
  btnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },

  // Footer
  footer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 24,
  },
  link: {
    fontWeight: "700",
  },
  backBtn: {
    marginTop: 32,
    padding: 8,
  },
  backText: {
    fontSize: 14,
    fontWeight: "500",
  },
});
