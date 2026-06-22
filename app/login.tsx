import React, { useMemo, useState, useEffect } from "react";
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
  Keyboard, // ⬅️ THÊM
} from "react-native";
import { Image } from "expo-image";
import { router, Stack, Redirect, useLocalSearchParams } from "expo-router";
import { useDispatch, useSelector } from "react-redux";
import {
  useLazyGetMyRankQuery,
  useLoginMutation,
} from "@/slices/usersApiSlice";
import { setCredentials } from "@/slices/authSlice";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import LottieView from "lottie-react-native";
import {
  IOS_26_LIQUID_GLASS_ENABLED,
  normalizeAppRoutePath,
} from "@/utils/nativeTabs";
import { SHOULD_RENDER_NATIVE_LOTTIE } from "@/utils/runtimeSafety";
import AppleLiquidGlassView from "@/components/ui/AppleLiquidGlassView";

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
  return /^0\d{9}$/.test(s);
};

const getLoginErrorMessage = (err) => {
  if (err?.data?.message) return String(err.data.message);
  if (err?.data?.code === "UPGRADE_REQUIRED" || err?.status === 426) {
    return "Phiên bản ứng dụng này đã quá cũ hoặc bị chặn. Vui lòng cập nhật ứng dụng rồi thử lại.";
  }
  if (err?.data?.code === "MAINTENANCE" || err?.status === 503) {
    return "Hệ thống đang bảo trì. Vui lòng thử lại sau.";
  }
  if (err?.status === "FETCH_ERROR") {
    return "Không kết nối được tới máy chủ. Vui lòng kiểm tra mạng hoặc cập nhật ứng dụng.";
  }
  if (err?.status === "PARSING_ERROR") {
    return "Máy chủ trả về dữ liệu không hợp lệ. Vui lòng thử lại sau.";
  }
  if (err?.error) return String(err.error);
  return "Đăng nhập thất bại. Vui lòng kiểm tra lại.";
};

const LOGO_SRC = require("@/assets/images/icon.png");
const BG_LOTTIE = require("@/assets/lottie/animated-bg.json");

const BOTTOM_ACTIONS_H = 132;

function rgbaFromHex(color, alpha) {
  const hex = String(color || "").replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return color;
  const value = parseInt(hex, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function AuthGlassSurface({
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
        (isDark ? "rgba(22,24,29,0.62)" : "rgba(255,255,255,0.76)")
      }
      isInteractive={interactive}
      style={style}
    >
      {children}
    </AppleLiquidGlassView>
  );
}

export default function LoginScreen() {
  const params = useLocalSearchParams<{
    returnTo?: string | string[];
    redirectTo?: string | string[];
  }>();
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
  const [refreshMyRank] = useLazyGetMyRankQuery();
  const returnTo = useMemo(() => {
    const rawReturnTo = Array.isArray(params.returnTo)
      ? params.returnTo[0]
      : params.returnTo;
    const rawRedirectTo = Array.isArray(params.redirectTo)
      ? params.redirectTo[0]
      : params.redirectTo;
    const raw = String(rawReturnTo || rawRedirectTo || "/").trim();

    return normalizeAppRoutePath(raw || "/");
  }, [params.redirectTo, params.returnTo]);

  // State
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [keyboardVisible, setKeyboardVisible] = useState(false); // ⬅️ THÊM
  const passwordInputRef = React.useRef<TextInput>(null);

  // ⬅️ THÊM: Lắng nghe keyboard
  useEffect(() => {
    const showSubscription = Keyboard.addListener("keyboardDidShow", () => {
      setKeyboardVisible(true);
    });
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardVisible(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

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
        : kind === "phone" || /^[+\d\s().-]+$/.test((loginId || "").trim())
        ? "phone-pad"
        : "default",
    [kind, loginId]
  );

  const onSubmit = async () => {
    const id = (loginId || "").trim();
    const pass = typeof password === "string" ? password : "";

    if (!id || pass.length === 0) {
      Alert.alert("Thiếu thông tin", "Vui lòng nhập tài khoản và mật khẩu.");
      return;
    }

    const payload =
      kind === "email"
        ? { email: normEmail(id), password: pass }
        : kind === "phone"
        ? { phone: normPhone(id), password: pass }
        : { nickname: id, password: pass };

    try {
      const res = await login(payload).unwrap();
      const normalized = res?.user ? { ...res.user, token: res.token } : res;

      dispatch(setCredentials(normalized));
      void refreshMyRank()
        .unwrap()
        .catch(() => {});

      router.replace(returnTo as any);
    } catch (err) {
      console.log("[login] auth failed", err);
      Alert.alert("Lỗi", getLoginErrorMessage(err));
    }
  };

  const shouldRedirect = !!userInfo;

  return shouldRedirect ? (
    <Redirect href={returnTo as any} />
  ) : (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1 }}>
        {SHOULD_RENDER_NATIVE_LOTTIE ? (
          <LottieView
            source={BG_LOTTIE}
            autoPlay
            loop
            resizeMode="cover"
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />
        ) : null}
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
                  // ⬅️ SỬA: Chỉ padding khi keyboard KHÔNG hiện
                  paddingBottom:
                    Platform.OS === "ios"
                      ? 0
                      : keyboardVisible
                      ? 16
                      : BOTTOM_ACTIONS_H + insets.bottom + 16,
                },
              ]}
              keyboardShouldPersistTaps="handled"
            >
              <AuthGlassSurface
                isDark={isDark}
                effect="regular"
                tintColor={
                  isDark ? "rgba(22,24,29,0.68)" : "rgba(255,255,255,0.82)"
                }
                style={[
                  styles.card,
                  IOS_26_LIQUID_GLASS_ENABLED && styles.glassPanel,
                  { backgroundColor: cardBg, borderColor: border },
                ]}
              >
                <AuthGlassSurface
                  isDark={isDark}
                  tintColor={
                    isDark ? "rgba(32,35,41,0.7)" : "rgba(243,245,249,0.86)"
                  }
                  style={[
                    styles.logoWrap,
                    IOS_26_LIQUID_GLASS_ENABLED && styles.glassControl,
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
                </AuthGlassSurface>

                <Text style={[styles.title, { color: textPrimary }]}>
                  Đăng nhập
                </Text>

                <View style={styles.form}>
                  <Text style={[styles.label, { color: textSecondary }]}>
                    Email / Số điện thoại
                  </Text>
                  <AuthGlassSurface
                    isDark={isDark}
                    interactive
                    tintColor={
                      isDark
                        ? "rgba(32,35,41,0.62)"
                        : "rgba(255,255,255,0.78)"
                    }
                    style={[
                      styles.inputShell,
                      IOS_26_LIQUID_GLASS_ENABLED && styles.glassInput,
                      { borderColor: border },
                    ]}
                  >
                    <TextInput
                      value={loginId}
                      onChangeText={setLoginId}
                      placeholder="Email / Số điện thoại"
                      placeholderTextColor="#9aa0a6"
                      style={[styles.inputInside, { color: textPrimary }]}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType={kbType}
                      textContentType="username"
                      autoComplete="username"
                      returnKeyType="next"
                      blurOnSubmit={false}
                      onSubmitEditing={() => passwordInputRef.current?.focus()}
                    />
                  </AuthGlassSurface>

                  <Text
                    style={[
                      styles.label,
                      { color: textSecondary, marginTop: 12 },
                    ]}
                  >
                    Mật khẩu
                  </Text>
                  <AuthGlassSurface
                    isDark={isDark}
                    interactive
                    tintColor={
                      isDark
                        ? "rgba(32,35,41,0.62)"
                        : "rgba(255,255,255,0.78)"
                    }
                    style={[
                      styles.inputShell,
                      IOS_26_LIQUID_GLASS_ENABLED && styles.glassInput,
                      { borderColor: border },
                    ]}
                  >
                    <TextInput
                      ref={passwordInputRef}
                      value={password}
                      onChangeText={setPassword}
                      placeholder="••••••••"
                      placeholderTextColor="#9aa0a6"
                      style={[styles.inputInside, { color: textPrimary }]}
                      secureTextEntry
                      textContentType="password"
                      autoComplete="password"
                      returnKeyType="done"
                      onSubmitEditing={onSubmit}
                    />
                  </AuthGlassSurface>

                  <Pressable
                    onPress={onSubmit}
                    disabled={isLoading}
                    style={({ pressed }) => [
                      { opacity: isLoading ? 0.7 : pressed ? 0.9 : 1 },
                    ]}
                  >
                    <AuthGlassSurface
                      isDark={isDark}
                      interactive={!isLoading}
                      tintColor={rgbaFromHex(tint, isDark ? 0.72 : 0.62)}
                      style={[
                        styles.btnSolid,
                        IOS_26_LIQUID_GLASS_ENABLED && styles.glassPrimaryBtn,
                        { backgroundColor: tint },
                      ]}
                    >
                      {isLoading ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.btnTextWhite}>Đăng nhập</Text>
                      )}
                    </AuthGlassSurface>
                  </Pressable>

                  <Pressable
                    onPress={() => router.push("/forgot-password")}
                    style={{ alignSelf: "center", marginTop: 10 }}
                  >
                    <Text
                      style={{
                        color: textPrimary,
                        fontWeight: "700",
                      }}
                    >
                      Quên mật khẩu?
                    </Text>
                  </Pressable>
                </View>
              </AuthGlassSurface>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>

        {/* ⬅️ SỬA: Chỉ hiện 2 nút khi keyboard KHÔNG hiện */}
        {((!keyboardVisible && Platform.OS === "android") ||
          Platform.OS === "ios") && (
          <AuthGlassSurface
            isDark={isDark}
            tintColor={
              isDark ? "rgba(22,24,29,0.72)" : "rgba(255,255,255,0.86)"
            }
            style={[
              styles.bottomActions,
              IOS_26_LIQUID_GLASS_ENABLED && styles.bottomActionsGlass,
              {
                backgroundColor: cardBg,
                borderTopColor: border,
                paddingBottom: insets.bottom + 10,
              },
            ]}
          >
            <Pressable
              onPress={() => router.replace("/")}
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
          </AuthGlassSurface>
        )}
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
  glassPanel: {
    borderColor: "rgba(255,255,255,0.24)",
    overflow: "hidden",
    shadowOpacity: 0.16,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
  },
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
  glassControl: {
    borderColor: "rgba(255,255,255,0.22)",
    overflow: "hidden",
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
  inputShell: {
    borderWidth: 1,
    borderRadius: 12,
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
  btnSolid: {
    marginTop: 18,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    overflow: "hidden",
  },
  glassPrimaryBtn: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.32)",
    shadowColor: "#0a84ff",
    shadowOpacity: 0.24,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  btnTextWhite: { color: "#fff", fontWeight: "700", fontSize: 16 },
  bottomActions: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  bottomActionsGlass: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.26)",
    overflow: "hidden",
  },
  btnOutlinePill: {
    width: "100%",
    paddingVertical: 14,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  btnOutlineText: { fontWeight: "700", fontSize: 16 },
});
