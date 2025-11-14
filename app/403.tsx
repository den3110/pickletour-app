// app/403.jsx
import React, { useMemo } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Pressable,
  useColorScheme,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";

function Btn({
  variant = "contained",
  onPress,
  children,
}: {
  variant?: "contained" | "outlined" | "text";
  onPress: () => void;
  children: React.ReactNode;
}) {
  const bg =
    variant === "contained" ? "#2563eb" : variant === "outlined" ? "transparent" : "transparent";
  const color = variant === "contained" ? "#fff" : "#2563eb";
  const borderW = variant === "outlined" ? 1 : 0;
  const borderC = variant === "outlined" ? "#2563eb" : "transparent";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, borderWidth: borderW, borderColor: borderC },
        pressed && { opacity: 0.9 },
      ]}
    >
      <Text style={[styles.btnText, { color }]}>{children}</Text>
    </Pressable>
  );
}

export default function Forbidden403() {
  const scheme = useColorScheme() ?? "light";
  const isDark = scheme === "dark";
  const bg = isDark ? "#0b0d12" : "#f7f9fc";
  const card = isDark ? "#12151b" : "#ffffff";
  const text = isDark ? "#ffffff" : "#111827";
  const sub = isDark ? "#cbd5e1" : "#4b5563";
  const error = "#ef4444";

  // nhận ?from=/duong-dan-cu nếu có
  const { from } = useLocalSearchParams<{ from?: string }>();
  const redirectTo = typeof from === "string" && from ? from : "/";

  const stamped = useMemo(
    () => new Date().toLocaleString("vi-VN"),
    []
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <View style={styles.wrap}>
        <View style={[styles.card, { backgroundColor: card }]}>
          <MaterialIcons
            name="block"
            size={72}
            color={error}
            style={{ marginBottom: 8 }}
          />

          <Text
            style={[
              styles.code,
              { color: text },
            ]}
          >
            403
          </Text>

          <Text style={[styles.title, { color: text }]}>
            Truy cập bị từ chối
          </Text>

          <Text style={[styles.desc, { color: sub }]}>
            Bạn không có quyền truy cập trang này. Hãy đăng nhập bằng tài khoản
            hoặc quay lại trang trước.
          </Text>

          <View style={styles.actions}>
            <Btn variant="contained" onPress={() => router.replace("/(tabs)")}>
              Về trang chủ
            </Btn>
            <Btn variant="outlined" onPress={() => router.back()}>
              Quay lại
            </Btn>
            <Btn
              variant="text"
              onPress={() => router.push({ pathname: "/login", params: { redirectTo } })}
            >
              Đăng nhập
            </Btn>
          </View>

          <Text style={[styles.meta, { color: sub }]}>
            Mã lỗi: 403 • {stamped}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  wrap: {
    flex: 1,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    width: "100%",
    maxWidth: 720,
    borderRadius: 16,
    paddingVertical: 32,
    paddingHorizontal: 20,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  code: {
    fontWeight: "800",
    letterSpacing: -2,
    marginBottom: 6,
    // kích thước linh hoạt (gần giống clamp trên web)
    fontSize: 96,
  },
  title: { fontWeight: "800", fontSize: 20, marginTop: 2 },
  desc: { textAlign: "center", marginTop: 10, lineHeight: 20 },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
    marginTop: 18,
  },
  btn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    minWidth: 120,
    alignItems: "center",
  },
  btnText: { fontWeight: "700" },
  meta: { marginTop: 16, fontSize: 12 },
});
