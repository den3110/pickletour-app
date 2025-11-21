import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  useColorScheme,
  Platform,
} from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function NotFound() {
  const scheme = useColorScheme() ?? "light";
  const textPrimary = scheme === "dark" ? "#fff" : "#111";
  const textSecondary = scheme === "dark" ? "#c9c9c9" : "#444";
  const border = scheme === "dark" ? "#2e2f33" : "#e5e9f0";
  const cardBg = scheme === "dark" ? "#16181c" : "#fff";
  const tint = scheme === "dark" ? "#7cc0ff" : "#0a84ff";

  const params = useLocalSearchParams<{ origin?: string }>();
  const [storedOrigin, setStoredOrigin] = useState<string>("");

  // Fallback lấy origin đã lưu (nếu trước đó bạn set 'nf_origin')
  useEffect(() => {
    (async () => {
      try {
        const v = await AsyncStorage.getItem("nf_origin");
        if (v) setStoredOrigin(v);
      } catch {}
    })();
  }, []);

  const origin = useMemo(() => {
    if (params?.origin) return String(params.origin);
    return storedOrigin || "";
  }, [params?.origin, storedOrigin]);

  const goHome = () => router.replace("/");
  const goBack = () => router.back();
  const tryAgain = () => {
    if (origin) {
      // nếu origin là route nội bộ thì replace được luôn
      router.replace(origin);
    } else {
      router.replace("/");
    }
  };
  const contact = () => router.push("/contact"); // sửa path nếu khác

  return (
    <>
      <Stack.Screen
        options={{
          title: "Không tìm thấy",
          headerTitleAlign: "center",
          headerShadowVisible: false,
        }}
      />
      <View style={styles.container}>
        <View
          style={[
            styles.card,
            { backgroundColor: cardBg, borderColor: border },
          ]}
        >
          <Text style={[styles.h1, { color: textPrimary }]}>404</Text>

          <Text style={[styles.title, { color: textPrimary }]}>
            Không tìm thấy nội dung
          </Text>

          <Text style={[styles.desc, { color: textSecondary }]}>
            Tài nguyên bạn yêu cầu không tồn tại, đã bị xoá hoặc đường dẫn không
            hợp lệ.
          </Text>

          {!!origin && (
            <Text style={[styles.origin, { color: textSecondary }]}>
              <Text style={{ fontWeight: "700", color: textPrimary }}>
                URL gốc:{" "}
              </Text>
              <Text
                style={{
                  fontFamily: Platform.select({
                    ios: "Courier",
                    android: "monospace",
                  }),
                }}
              >
                {origin}
              </Text>
            </Text>
          )}

          <View style={styles.actions}>
            <PrimaryButton label="Về trang chủ" onPress={goHome} tint={tint} />
            <OutlineButton
              label="Quay lại"
              onPress={goBack}
              border={border}
              textColor={textPrimary}
            />
            <TextButton label="Thử tải lại" onPress={tryAgain} tint={tint} />
            <TextButton
              label="Liên hệ hỗ trợ"
              onPress={contact}
              tint={tint}
              hideOnSmall={false} // để luôn hiện; đổi true nếu muốn ẩn trên màn nhỏ
            />
          </View>
        </View>
      </View>
    </>
  );
}

/* ---------- Buttons ---------- */
function PrimaryButton({ label, onPress, tint }: any) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: tint },
        pressed && { opacity: 0.92 },
      ]}
    >
      <Text style={styles.btnPrimaryText}>{label}</Text>
    </Pressable>
  );
}
function OutlineButton({ label, onPress, border, textColor }: any) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        styles.btnOutline,
        { borderColor: border },
        pressed && { opacity: 0.95 },
      ]}
    >
      <Text style={[styles.btnText, { color: textColor }]}>{label}</Text>
    </Pressable>
  );
}
function TextButton({ label, onPress, tint, hideOnSmall = false }: any) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.btnTextOnly,
        pressed && { opacity: 0.85 },
      ]}
    >
      <Text
        style={[
          styles.link,
          { color: tint },
          hideOnSmall && { display: "none" }, // RN không có responsive display; giữ tham số để bạn dễ chỉnh
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/* ---------- Styles ---------- */
const styles = StyleSheet.create({
  container: {
    minHeight: "80%",
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  card: {
    width: "100%",
    maxWidth: 720,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 24,
    alignItems: "center",
  },
  h1: {
    fontSize: 96,
    fontWeight: "800",
    letterSpacing: -2,
    lineHeight: 98,
  },
  title: { marginTop: 6, fontSize: 18, fontWeight: "700" },
  desc: { marginTop: 10, fontSize: 14, textAlign: "center" },
  origin: { marginTop: 8, fontSize: 13, textAlign: "center" },

  actions: {
    marginTop: 18,
    width: "100%",
    gap: 10,
    alignItems: "center",
  },
  btn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    minWidth: 180,
    alignItems: "center",
  },
  btnOutline: { borderWidth: 1, backgroundColor: "transparent" },
  btnText: { fontWeight: "700" },
  btnPrimaryText: { color: "#fff", fontWeight: "700" },
  btnTextOnly: { paddingVertical: 8 },
  link: { fontSize: 14, fontWeight: "700" },
});
