// Owner: liên kết tài khoản Imou để quản lý camera trên PickleTour.
import React, { useEffect, useMemo, useState } from "react";
import {
  View, ScrollView, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { Text } from "@/components/ui/i18nText";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, router } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { pal } from "@/utils/courtFormat";
import { useGetVenueQuery } from "@/slices/venuesApiSlice";
import {
  useLinkImouAccountMutation,
  useUnlinkImouAccountMutation,
  useUploadImouSessionMutation,
  useUploadImouCredsMutation,
} from "@/slices/imouApiSlice";

function loadImouNative(): any | null {
  try { return require("imou-rn-native").default || require("imou-rn-native"); }
  catch { return null; }
}

export default function ImouLoginScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const C = useMemo(() => pal(!!theme.dark), [theme.dark]);
  const { data: venue, refetch } = useGetVenueQuery(id, { skip: !id });
  const [linkAcc] = useLinkImouAccountMutation();
  const [unlinkAcc] = useUnlinkImouAccountMutation();
  const [uploadSess] = useUploadImouSessionMutation();
  const [uploadCreds] = useUploadImouCredsMutation();

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [areaCode] = useState("84");
  const [busy, setBusy] = useState(false);
  const [isLogged, setIsLogged] = useState<boolean | null>(null);

  const ImouNative = loadImouNative();

  useEffect(() => {
    (async () => {
      if (!ImouNative) { setIsLogged(false); return; }
      try { setIsLogged(!!(await ImouNative.isLoggedIn())); }
      catch { setIsLogged(false); }
    })();
  }, []);

  const doLogin = async () => {
    if (!ImouNative) return Alert.alert("Chưa hỗ trợ", "Module Imou chưa build vào app này. Cần bản build 1.1.17+.");
    if (!phone.trim() || !password) return Alert.alert("Thiếu", "Nhập SĐT + mật khẩu Imou");
    setBusy(true);
    try {
      await ImouNative.login({
        phone: phone.trim(),
        password,
        areaCode,
        captchaSolver: { mode: "webview" },
      });
      await linkAcc({ venueId: id, phone: phone.trim(), areaCode }).unwrap();
      try {
        const sess = await ImouNative.getSessionInfo();
        await uploadSess({ venueId: id, session: sess }).unwrap();
      } catch (e: any) {
        console.warn("[Imou] uploadSession skip:", e?.message);
      }
      try {
        await uploadCreds({ venueId: id, phone: phone.trim(), password, areaCode }).unwrap();
      } catch (e: any) {
        console.warn("[Imou] uploadCreds skip:", e?.message);
      }
      setIsLogged(true);
      setPassword("");
      refetch();
      Alert.alert("✓", "Đã liên kết tài khoản Imou");
    } catch (e: any) {
      Alert.alert("Đăng nhập Imou lỗi", e?.message || "Không xác định");
    } finally { setBusy(false); }
  };

  const doLogout = () => {
    Alert.alert("Ngắt liên kết Imou?", "Sẽ bỏ liên kết mọi camera đã gắn với sân.", [
      { text: "Huỷ" },
      { text: "Ngắt", style: "destructive", onPress: async () => {
        setBusy(true);
        try {
          if (ImouNative) await ImouNative.logout().catch(() => {});
          await unlinkAcc(id!).unwrap();
          setIsLogged(false);
          refetch();
          Alert.alert("✓", "Đã ngắt liên kết Imou");
        } catch (e: any) { Alert.alert("Lỗi", e?.message || "Không thành công"); }
        finally { setBusy(false); }
      }},
    ]);
  };

  const account = venue?.imouAccount;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: C.bg }}
    >
      <Stack.Screen options={{ title: "Kết nối camera Imou" }} />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16 }}
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
          <Text style={{ color: C.text, fontWeight: "800", fontSize: 16 }}>Trạng thái</Text>
          {isLogged === null ? (
            <ActivityIndicator style={{ marginTop: 8 }} />
          ) : isLogged && account?.phone ? (
            <>
              <Text style={{ color: C.text, marginTop: 8 }}>Đã liên kết SĐT: <Text style={{ fontWeight: "800" }}>+{account.areaCode || "84"} {account.phone}</Text></Text>
              <TouchableOpacity
                onPress={doLogout}
                disabled={busy}
                style={[styles.btn, { backgroundColor: "#EF4444", marginTop: 12 }]}
              >
                <Ionicons name="unlink" size={14} color="#fff" />
                <Text style={styles.btnText}>Ngắt liên kết</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.push(`/owner/venue/${id}/imou-attach` as any)}
                style={[styles.btn, { backgroundColor: "#0066FF", marginTop: 8 }]}
              >
                <Ionicons name="videocam" size={14} color="#fff" />
                <Text style={styles.btnText}>Gắn camera vào sân</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={{ color: C.sub, marginTop: 8 }}>Chưa liên kết. Đăng nhập tài khoản Imou để đưa camera vào sân.</Text>
          )}
        </View>

        {!(isLogged && account?.phone) && (
          <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={{ color: C.text, fontWeight: "800", fontSize: 16 }}>Đăng nhập Imou</Text>
            <Text style={{ color: C.sub, marginTop: 4, fontSize: 12 }}>SĐT dùng cho tài khoản Imou Life (đầu +84).</Text>
            <TextInput
              placeholder="Số điện thoại"
              placeholderTextColor={C.sub}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              style={[styles.input, { color: C.text, borderColor: C.border }]}
            />
            <TextInput
              placeholder="Mật khẩu Imou"
              placeholderTextColor={C.sub}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              style={[styles.input, { color: C.text, borderColor: C.border }]}
            />
            <TouchableOpacity
              onPress={doLogin}
              disabled={busy}
              style={[styles.btn, { backgroundColor: "#0066FF" }]}
            >
              {busy ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="log-in" size={14} color="#fff" />
                  <Text style={styles.btnText}>Đăng nhập Imou</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12, borderWidth: 1, padding: 16,
  },
  input: {
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    marginTop: 10, fontSize: 15,
  },
  btn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 12, borderRadius: 10, marginTop: 12,
  },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
});
