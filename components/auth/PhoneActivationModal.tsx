import React, { useState, useMemo } from "react";
import {
  Modal,
  View,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { TextInput } from "@/components/ui/i18nTextInput";
import { Text } from "@/components/ui/i18nText";
import { useDispatch, useSelector } from "react-redux";
import Toast from "react-native-toast-message";
import {
  useRequestPhoneOtpMutation,
  useVerifyPhoneActivationOtpMutation,
} from "@/slices/usersApiSlice";
import { setCredentials, logout } from "@/slices/authSlice";
import { useThemeTokens, type ThemeTokens } from "@/hooks/useThemeTokens";

// Modal kích hoạt/đổi SĐT bằng OTP Zalo. force=true => không cho đóng (bắt buộc).
export default function PhoneActivationModal({
  visible,
  force = false,
  onClose,
  onSuccess,
}: {
  visible: boolean;
  force?: boolean;
  onClose?: () => void;
  onSuccess?: () => void;
}) {
  const C = useThemeTokens();
  const styles = useMemo(() => mk_styles(C), [C]);
  const dispatch = useDispatch();
  const userInfo: any = useSelector((s: any) => s.auth?.userInfo);
  const [requestOtp, { isLoading: sending }] = useRequestPhoneOtpMutation();
  const [verifyOtp, { isLoading: verifying }] =
    useVerifyPhoneActivationOtpMutation();

  const [step, setStep] = useState<"start" | "otp">("start");
  const [changing, setChanging] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [phoneMasked, setPhoneMasked] = useState("");

  const currentPhone = userInfo?.phone || "";
  const useNewPhone = changing || !currentPhone;

  const send = async () => {
    try {
      const body = useNewPhone && newPhone.trim() ? { phone: newPhone.trim() } : {};
      const res: any = await requestOtp(body).unwrap();
      setPhoneMasked(res?.phoneMasked || "");
      setStep("otp");
      Toast.show({ type: "success", text1: "Đã gửi mã OTP qua Zalo." });
    } catch (e: any) {
      Toast.show({ type: "error", text1: e?.data?.message || "Gửi OTP thất bại" });
    }
  };

  const verify = async () => {
    if (!otp.trim()) return;
    try {
      const res: any = await verifyOtp({ otp: otp.trim() }).unwrap();
      dispatch(
        setCredentials({
          ...userInfo,
          phone: res?.phone || userInfo?.phone,
          phoneVerified: true,
        })
      );
      Toast.show({ type: "success", text1: "Kích hoạt số điện thoại thành công!" });
      setStep("start");
      setOtp("");
      onSuccess && onSuccess();
      onClose && onClose();
    } catch (e: any) {
      Toast.show({ type: "error", text1: e?.data?.message || "Xác thực thất bại" });
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => (force ? null : onClose && onClose())}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Kích hoạt số điện thoại</Text>
          {force && (
            <Text style={styles.warn}>
              Bạn cần kích hoạt số điện thoại để tiếp tục sử dụng ứng dụng.
            </Text>
          )}

          {step === "start" ? (
            <>
              <Text style={styles.body}>
                Gửi mã OTP qua Zalo tới số:{" "}
                <Text style={styles.bold}>
                  {useNewPhone ? newPhone || "(nhập số bên dưới)" : currentPhone || "chưa có SĐT"}
                </Text>
              </Text>
              {useNewPhone && (
                <TextInput
                  style={styles.input}
                  value={newPhone}
                  onChangeText={(v) => setNewPhone(v.replace(/[^\d]/g, ""))}
                  placeholder="0987654321"
                  placeholderTextColor={C.muted}
                  keyboardType="number-pad"
                  maxLength={11}
                />
              )}
              {!changing && !!currentPhone && (
                <Pressable onPress={() => setChanging(true)}>
                  <Text style={styles.link}>Số này không nhận được mã? Dùng số khác</Text>
                </Pressable>
              )}
              {changing && !!currentPhone && (
                <Pressable onPress={() => { setChanging(false); setNewPhone(""); }}>
                  <Text style={styles.link}>Dùng lại số hiện tại ({currentPhone})</Text>
                </Pressable>
              )}
              <Pressable
                style={[styles.btnPrimary, (sending || (useNewPhone && !newPhone.trim())) && styles.btnDisabled]}
                disabled={sending || (useNewPhone && !newPhone.trim())}
                onPress={send}
              >
                {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Gửi mã OTP</Text>}
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.body}>
                Nhập mã OTP đã gửi tới <Text style={styles.bold}>{phoneMasked}</Text>
              </Text>
              <TextInput
                style={[styles.input, { letterSpacing: 6, textAlign: "center", fontSize: 20 }]}
                value={otp}
                onChangeText={(v) => setOtp(v.replace(/\D/g, ""))}
                placeholder="••••••"
                placeholderTextColor={C.muted}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
              />
              <View style={styles.row}>
                <Pressable onPress={() => setStep("start")}>
                  <Text style={styles.link}>Đổi số</Text>
                </Pressable>
                <Pressable onPress={send} disabled={sending}>
                  <Text style={styles.link}>Gửi lại mã</Text>
                </Pressable>
              </View>
              <Pressable
                style={[styles.btnPrimary, (verifying || otp.length < 4) && styles.btnDisabled]}
                disabled={verifying || otp.length < 4}
                onPress={verify}
              >
                {verifying ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Xác nhận</Text>}
              </Pressable>
            </>
          )}

          {force ? (
            <Pressable style={styles.logout} onPress={() => dispatch(logout())}>
              <Text style={styles.logoutText}>Đăng xuất</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.logout} onPress={() => onClose && onClose()}>
              <Text style={styles.logoutText}>Để sau</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const mk_styles = (C: ThemeTokens) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: C.overlay, justifyContent: "center", padding: 20 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 20 },
  title: { fontSize: 18, fontWeight: "800", color: C.text, marginBottom: 8 },
  warn: { backgroundColor: C.amberSoft, color: C.amberText, padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 14 },
  body: { fontSize: 14, color: C.text2, marginBottom: 10 },
  bold: { fontWeight: "700", color: C.text },
  input: { borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: C.text, marginBottom: 10 },
  link: { color: "#0066FF", fontWeight: "600", fontSize: 13, marginBottom: 10 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  btnPrimary: { backgroundColor: "#0066FF", borderRadius: 10, paddingVertical: 13, alignItems: "center", marginTop: 6 },
  btnPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  btnDisabled: { opacity: 0.5 },
  logout: { alignItems: "center", marginTop: 14 },
  logoutText: { color: C.sub, fontWeight: "600" },
});
