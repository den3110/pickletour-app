import React, { useEffect, useState } from "react";
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
import { router, Stack } from "expo-router";
import { useDispatch, useSelector } from "react-redux";
import { useLoginMutation } from "@/slices/usersApiSlice";
import { setCredentials } from "@/slices/authSlice";

export default function LoginScreen() {
  const scheme = useColorScheme() ?? "light";
  const tint = scheme === "dark" ? "#7cc0ff" : "#0a84ff";
  const cardBg = scheme === "dark" ? "#16181c" : "#ffffff";
  const textPrimary = scheme === "dark" ? "#fff" : "#111";
  const textSecondary = scheme === "dark" ? "#c9c9c9" : "#444";
  const border = scheme === "dark" ? "#2e2f33" : "#dfe3ea";

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  const dispatch = useDispatch();
  const { userInfo } = useSelector((s: any) => s.auth);
  const [login, { isLoading }] = useLoginMutation();

  useEffect(() => {
    if (userInfo) {
      // Về Home (tabs index)
      router.replace("/");
    }
  }, [userInfo]);

  const onSubmit = async () => {
    const phoneClean = phone.replace(/\s+/g, "").trim();
    const passClean = password.trim();

    if (!phoneClean || !passClean) {
      Alert.alert(
        "Thiếu thông tin",
        "Vui lòng nhập số điện thoại và mật khẩu."
      );
      return;
    }
    try {
      const res = await login({
        phone: phoneClean,
        password: passClean,
      }).unwrap();
      // Chuẩn hóa payload để state.auth.userInfo có token (nếu server trả {token, user})
      const payload = res?.user ? { ...res.user, token: res.token } : res;
      dispatch(setCredentials(payload));
      router.replace("/"); // <-- thay vì '/(tabs)'
    } catch (err: any) {
      const msg = err?.data?.message || err?.error || "Đăng nhập thất bại";
      Alert.alert("Lỗi", String(msg));
    }
  };

  return (
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
            <Text style={[styles.title, { color: textPrimary }]}>
              Đăng nhập
            </Text>

            <View style={styles.form}>
              <Text style={[styles.label, { color: textSecondary }]}>
                Số điện thoại
              </Text>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="VD: 0987123456"
                placeholderTextColor="#9aa0a6"
                style={[
                  styles.input,
                  { borderColor: border, color: textPrimary },
                ]}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                autoComplete="tel"
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
