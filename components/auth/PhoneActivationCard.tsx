import React, { useState } from "react";
import {
  View,
  Pressable,
  StyleSheet,
} from "react-native";
import { Text } from "@/components/ui/i18nText";
import { Ionicons } from "@expo/vector-icons";
import { useSelector } from "react-redux";
import { useGetRegistrationSettingsQuery } from "@/slices/settingsApiSlice";
import { useGetMeQuery } from "@/slices/usersApiSlice";
import PhoneActivationModal from "./PhoneActivationModal";

// Thẻ kích hoạt SĐT trong hồ sơ. Ẩn khi ZNS tắt; hiện trạng thái + nút kích hoạt.
export default function PhoneActivationCard() {
  const userInfo: any = useSelector((s: any) => s.auth?.userInfo);
  const { data: regSettings } = useGetRegistrationSettingsQuery(undefined);
  const { data: me } = useGetMeQuery(undefined, { skip: !userInfo });
  const [open, setOpen] = useState(false);

  const phoneOtpEnabled = (regSettings as any)?.phoneOtpEnabled === true;
  if (!phoneOtpEnabled || !userInfo) return null;

  const verified = (me?.phoneVerified ?? userInfo?.phoneVerified) === true;

  if (verified) {
    return (
      <View style={[styles.card, styles.okCard]}>
        <Ionicons name="checkmark-circle" size={20} color="#16a34a" />
        <Text style={styles.okText}>Số điện thoại đã được kích hoạt</Text>
      </View>
    );
  }

  return (
    <>
      <View style={[styles.card, styles.warnCard]}>
        <Ionicons name="alert-circle" size={22} color="#b45309" />
        <View style={{ flex: 1 }}>
          <Text style={styles.warnTitle}>Số điện thoại chưa kích hoạt</Text>
          <Text style={styles.warnSub}>
            Kích hoạt SĐT qua Zalo (hoặc đổi số khác nếu không nhận được mã).
          </Text>
        </View>
        <Pressable style={styles.btn} onPress={() => setOpen(true)}>
          <Text style={styles.btnText}>Kích hoạt</Text>
        </Pressable>
      </View>
      <PhoneActivationModal visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 12,
  },
  okCard: { backgroundColor: "rgba(22,163,74,0.10)" },
  okText: { color: "#16a34a", fontWeight: "700" },
  warnCard: { backgroundColor: "#FEF3C7" },
  warnTitle: { color: "#92400E", fontWeight: "800", fontSize: 13.5 },
  warnSub: { color: "#92400E", fontSize: 12, marginTop: 2 },
  btn: { backgroundColor: "#b45309", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 12.5 },
});
