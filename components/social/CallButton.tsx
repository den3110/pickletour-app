// components/social/CallButton.tsx
// Nút gọi điện trong header chat DM — mở menu 2 lựa chọn:
//   1. Gọi qua Zalo (deep-link zalo.me/{phone}, fallback browser)
//   2. Gọi điện thoại (tel:{phone})
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Alert, Linking, Pressable, StyleSheet } from "react-native";

function normalizePhone(raw?: string | null) {
  const digits = String(raw || "").replace(/[^\d+]/g, "");
  if (!digits) return "";
  // Zalo format: bỏ +84 và giữ 0xxxxxxxxx
  if (digits.startsWith("+84")) return "0" + digits.slice(3);
  if (digits.startsWith("84") && digits.length >= 11) return "0" + digits.slice(2);
  return digits;
}

async function openZaloWithPhone(phone: string, displayName: string) {
  const p = normalizePhone(phone);
  if (!p) {
    Alert.alert("Không có số điện thoại", `${displayName} chưa công khai số điện thoại.`);
    return;
  }
  // Thử Zalo app scheme trước, fallback zalo.me web
  const appUrl = `zalo://qr/p/${p}`;
  const webUrl = `https://zalo.me/${p}`;
  try {
    const canOpenApp = await Linking.canOpenURL(appUrl);
    if (canOpenApp) {
      await Linking.openURL(appUrl);
      return;
    }
  } catch {}
  try {
    await Linking.openURL(webUrl);
  } catch (err: any) {
    Alert.alert("Không mở được Zalo", err?.message || "Vui lòng thử lại.");
  }
}

async function openPhoneCall(phone: string, displayName: string) {
  const p = normalizePhone(phone);
  if (!p) {
    Alert.alert("Không có số điện thoại", `${displayName} chưa công khai số điện thoại.`);
    return;
  }
  const url = `tel:${p}`;
  try {
    await Linking.openURL(url);
  } catch (err: any) {
    Alert.alert("Không mở được ứng dụng gọi", err?.message || "");
  }
}

export function CallButton({
  phone,
  userName,
}: {
  phone?: string | null;
  userName?: string;
}) {
  const displayName = userName || "user này";

  const openMenu = () => {
    if (!phone) {
      Alert.alert(
        "Không có số điện thoại",
        `${displayName} chưa công khai số điện thoại nên không thể gọi.`
      );
      return;
    }
    Alert.alert("Gọi cho " + displayName, normalizePhone(phone), [
      {
        text: "📞 Gọi qua Zalo",
        onPress: () => openZaloWithPhone(phone, displayName),
      },
      {
        text: "☎️ Gọi điện thoại",
        onPress: () => openPhoneCall(phone, displayName),
      },
      { text: "Huỷ", style: "cancel" as const },
    ]);
  };

  return (
    <Pressable onPress={openMenu} hitSlop={10} style={styles.btn}>
      <Ionicons name="call" size={20} color="#1877F2" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },
});
