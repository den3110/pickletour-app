// components/home/CourtBookingBanner.tsx — banner nổi bật "Đặt sân" ở trang chủ (cùng đẳng cấp banner LIVE giải).
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/i18nText";

const PERKS = [
  { icon: "time-outline", label: "Giờ trống realtime" },
  { icon: "qr-code-outline", label: "Thanh toán QR" },
  { icon: "ticket-outline", label: "Vé QR check-in" },
];

export default function CourtBookingBanner() {
  // Chuyển động vào cảnh một lần để giữ giao diện nhẹ và tập trung.
  const shine = useRef(new Animated.Value(-1)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const shineIntro = Animated.timing(shine, {
      toValue: 1.6,
      duration: 2200,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    });
    const badgeIntro = Animated.sequence([
      Animated.timing(pulse, { toValue: 1.06, duration: 550, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 550, useNativeDriver: true }),
    ]);
    shineIntro.start();
    badgeIntro.start();
    return () => {
      shineIntro.stop();
      badgeIntro.stop();
    };
  }, [shine, pulse]);

  const translateX = shine.interpolate({ inputRange: [-1, 1.6], outputRange: [-220, 520] });

  return (
    <View style={styles.wrap}>
      <Pressable onPress={() => router.push("/courts")} style={({ pressed }) => [styles.press, pressed && { transform: [{ scale: 0.985 }] }]}>
        <LinearGradient colors={["#06152B", "#0A354D", "#087C98"]} start={{ x: 0, y: 0 }} end={{ x: 1.1, y: 1 }} style={styles.card}>
          {/* Trang trí */}
          <View pointerEvents="none" style={styles.glowA} />
          <View pointerEvents="none" style={styles.glowB} />
          <Animated.View pointerEvents="none" style={[styles.shine, { transform: [{ translateX }, { rotate: "18deg" }] }]} />
          <View pointerEvents="none" style={styles.courtLines}>
            <View style={styles.courtOuter}>
              <View style={styles.courtMid} />
              <View style={styles.courtKitchen} />
            </View>
          </View>

          {/* Hàng trên: tag + tiêu đề */}
          <View style={styles.topRow}>
            <Animated.View style={[styles.tag, { transform: [{ scale: pulse }] }]}>
              <Ionicons name="sparkles" size={11} color="#06111f" />
              <Text style={styles.tagText}>MỚI</Text>
            </Animated.View>
            <View style={styles.badgeHot}>
              <Ionicons name="flame" size={11} color="#fde68a" />
              <Text style={styles.badgeHotText}>Đặt sân trực tuyến</Text>
            </View>
          </View>

          <Text style={styles.title}>Đặt sân Pickleball</Text>
          <Text style={styles.sub}>Tìm sân gần bạn, chọn khung giờ trống, chuyển khoản QR và nhận vé QR vào sân — chỉ trong 1 phút.</Text>

          {/* Perks */}
          <View style={styles.perks}>
            {PERKS.map((p) => (
              <View key={p.label} style={styles.perk}>
                <Ionicons name={p.icon as any} size={12} color="#a5f3fc" />
                <Text style={styles.perkText}>{p.label}</Text>
              </View>
            ))}
          </View>

          {/* CTA */}
          <View style={styles.ctaRow}>
            <View style={styles.cta}>
              <Text style={styles.ctaText}>Đặt sân ngay</Text>
              <Ionicons name="arrow-forward" size={16} color="#06111f" />
            </View>
            <Pressable hitSlop={6} onPress={() => router.push("/courts/my-bookings")} style={({ pressed }) => [styles.ghost, pressed && { opacity: 0.8 }]}>
              <Ionicons name="ticket-outline" size={15} color="#fff" />
              <Text style={styles.ghostText}>Vé của tôi</Text>
            </Pressable>
            <Pressable hitSlop={6} onPress={() => router.push("/owner")} style={({ pressed }) => [styles.ghost, pressed && { opacity: 0.8 }]}>
              <Ionicons name="business-outline" size={15} color="#fff" />
              <Text style={styles.ghostText}>Chủ sân</Text>
            </Pressable>
          </View>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, marginTop: 12, marginBottom: 4 },
  press: {
    borderRadius: 24,
    shadowColor: "#22c1d6",
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  card: {
    padding: 18,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(8,189,245,0.42)",
    overflow: "hidden",
  },
  glowA: { position: "absolute", width: 260, height: 260, borderRadius: 130, backgroundColor: "rgba(8,189,245,0.16)", top: -120, right: -70 },
  glowB: { position: "absolute", width: 180, height: 180, borderRadius: 90, backgroundColor: "rgba(245,179,1,0.14)", bottom: -90, left: -50 },
  shine: { position: "absolute", top: -40, bottom: -40, width: 90, backgroundColor: "rgba(255,255,255,0.10)" },
  courtLines: { position: "absolute", right: 14, top: 14, opacity: 0.35 },
  courtOuter: { width: 64, height: 120, borderWidth: 1.5, borderColor: "#fff", borderRadius: 4, justifyContent: "center" },
  courtMid: { position: "absolute", left: 0, right: 0, top: "50%", height: 1.5, backgroundColor: "#fff" },
  courtKitchen: { position: "absolute", left: 0, right: 0, top: "34%", height: "32%", borderTopWidth: 1.5, borderBottomWidth: 1.5, borderColor: "#fff" },
  topRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  tag: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#f5b301", paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  tagText: { color: "#06111f", fontWeight: "900", fontSize: 11, letterSpacing: 1 },
  badgeHot: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.28)", paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  badgeHotText: { color: "#fde68a", fontWeight: "700", fontSize: 11 },
  title: { color: "#fff", fontWeight: "900", fontSize: 22, letterSpacing: -0.45, marginTop: 12 },
  sub: { color: "rgba(255,255,255,0.82)", fontSize: 13, lineHeight: 19, marginTop: 6, paddingRight: 70 },
  perks: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 },
  perk: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.10)", borderWidth: 1, borderColor: "rgba(255,255,255,0.16)", paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
  perkText: { color: "#e0fbff", fontSize: 11.5, fontWeight: "600" },
  ctaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 16 },
  cta: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#35D7F7", paddingHorizontal: 16, paddingVertical: 11, borderRadius: 14 },
  ctaText: { color: "#06111f", fontWeight: "900", fontSize: 14 },
  ghost: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.35)" },
  ghostText: { color: "#fff", fontWeight: "700", fontSize: 12.5 },
});
