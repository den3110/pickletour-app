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
} from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useDispatch } from "react-redux";
import { setCredentials } from "@/slices/authSlice";
import { saveUserInfo } from "@/utils/authStorage";
import {
  useVerifyRegisterOtpMutation,
  useResendRegisterOtpMutation,
} from "@/slices/usersApiSlice";

export default function VerifyOtpScreen() {
  const dispatch = useDispatch();
  const params = useLocalSearchParams();

  const registerToken = String(params.registerToken || "");
  const phoneMasked = String(params.phoneMasked || "");
  const devOtp = String(params.devOtp || "");

  const otpRef = useRef(null);

  const [otp, setOtp] = useState("");
  const [cooldown, setCooldown] = useState(0);

  const [verifyOtp, { isLoading: verifying }] = useVerifyRegisterOtpMutation();
  const [resendOtp, { isLoading: resending }] = useResendRegisterOtpMutation();

  const dismissKeyboard = useCallback(() => {
    otpRef.current?.blur?.();
    Keyboard.dismiss();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  // đủ 6 số thì tự ẩn bàn phím (đỡ iOS number-pad không có Done)
  useEffect(() => {
    if (otp.trim().length === 6) dismissKeyboard();
  }, [otp, dismissKeyboard]);

  const canSubmit = useMemo(
    () => otp.trim().length === 6 && !verifying,
    [otp, verifying]
  );

  const onVerify = useCallback(async () => {
    dismissKeyboard();
    try {
      const res = await verifyOtp({ registerToken, otp: otp.trim() }).unwrap();
      const normalized = res ? { ...res, token: res.token } : res;

      dispatch(setCredentials(normalized));
      await saveUserInfo(normalized);

      router.replace("/(tabs)/profile");
    } catch (err) {
      Alert.alert(
        "Lỗi",
        err?.data?.message || err?.error || "Xác thực OTP thất bại"
      );
    }
  }, [dismissKeyboard, verifyOtp, registerToken, otp, dispatch]);

  const onResend = useCallback(async () => {
    dismissKeyboard();
    try {
      await resendOtp({ registerToken }).unwrap();
      setCooldown(30);
      Alert.alert("Thành công", "OTP mới đã được gửi.");
    } catch (err) {
      Alert.alert(
        "Lỗi",
        err?.data?.message || err?.error || "Gửi lại OTP thất bại"
      );
    }
  }, [dismissKeyboard, resendOtp, registerToken]);

  return (
    <>
      <Stack.Screen
        options={{ title: "Xác thực OTP", headerTitleAlign: "center" }}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={{ flex: 1 }} onPress={dismissKeyboard}>
          <View style={styles.wrap}>
            <Text style={styles.title}>Nhập mã OTP</Text>
            <Text style={styles.sub}>
              {phoneMasked
                ? `Mã đã gửi tới: ${phoneMasked}`
                : "Mã OTP đã được gửi tới số điện thoại của bạn."}
            </Text>

            {!!devOtp && (
              <Text style={[styles.sub, { marginTop: 6 }]}>
                DEV OTP: <Text style={{ fontWeight: "800" }}>{devOtp}</Text>
              </Text>
            )}

            <TextInput
              ref={otpRef}
              value={otp}
              onChangeText={(v) => setOtp(v.replace(/[^\d]/g, "").slice(0, 6))}
              keyboardType="number-pad"
              placeholder="------"
              style={styles.otp}
              maxLength={6}
              autoFocus
              blurOnSubmit
              returnKeyType="done"
              onSubmitEditing={() => {
                dismissKeyboard();
                if (canSubmit) onVerify();
              }}
            />

            <Pressable
              disabled={!canSubmit}
              onPress={onVerify}
              style={[styles.btn, !canSubmit && { opacity: 0.5 }]}
            >
              {verifying ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>Xác nhận</Text>
              )}
            </Pressable>

            <Pressable
              disabled={cooldown > 0 || resending}
              onPress={onResend}
              style={[
                styles.linkBtn,
                (cooldown > 0 || resending) && { opacity: 0.5 },
              ]}
            >
              {resending ? (
                <Text style={styles.link}>Đang gửi lại...</Text>
              ) : (
                <Text style={styles.link}>
                  {cooldown > 0 ? `Gửi lại OTP (${cooldown}s)` : "Gửi lại OTP"}
                </Text>
              )}
            </Pressable>

            <Pressable
              onPress={() => {
                dismissKeyboard();
                router.replace("/login");
              }}
              style={styles.linkBtn}
            >
              <Text style={styles.link}>Quay về đăng nhập</Text>
            </Pressable>
          </View>
        </Pressable>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 16, justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "800", textAlign: "center" },
  sub: { marginTop: 8, textAlign: "center", color: "#6b7280" },
  otp: {
    marginTop: 18,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 14,
    paddingVertical: 14,
    fontSize: 22,
    letterSpacing: 8,
    textAlign: "center",
  },
  btn: {
    marginTop: 14,
    backgroundColor: "#0a84ff",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "800" },
  linkBtn: { marginTop: 12, alignItems: "center" },
  link: { color: "#0a84ff", fontWeight: "700" },
});