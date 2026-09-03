// components/home/EventLiveBanner.tsx — banner "cực hot" trang chủ -> màn xem live giải.
import {
  Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React,
  { useEffect,
  useRef } from "react";
import { Animated,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "@/components/ui/i18nText";

import { useGetEventLiveConfigQuery } from "@/slices/eventLiveApiSlice";

export default function EventLiveBanner() {
  const { data } = useGetEventLiveConfigQuery(undefined, {
    refetchOnMountOrArgChange: true,
  });
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.3, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  if (!data?.enabled || !data?.configured) return null;
  const name = data.eventName || "Giải đấu đang diễn ra";

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => router.push("/live/event")}
        style={({ pressed }) => [styles.press, pressed && { opacity: 0.92 }]}
      >
        <LinearGradient
          colors={["#0b1220", "#7f1d1d", "#dc2626"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <View style={styles.liveTag}>
            <Animated.View style={[styles.dot, { opacity: pulse }]} />
            <Text style={styles.liveTagText}>LIVE</Text>
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.title} numberOfLines={1}>
              {name}
            </Text>
            <Text style={styles.sub} numberOfLines={1}>
              Xem trực tiếp · nhiều sân · nhiều góc camera
            </Text>
          </View>

          <View style={styles.cta}>
            <Ionicons name="play" size={16} color="#dc2626" />
            <Text style={styles.ctaText}>Xem</Text>
          </View>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, marginBottom: 4 },
  press: {
    borderRadius: 16,
    shadowColor: "#dc2626",
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  liveTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#ff2d2d" },
  liveTagText: { color: "#fff", fontWeight: "900", fontSize: 12, letterSpacing: 1 },
  title: { color: "#fff", fontWeight: "900", fontSize: 15 },
  sub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  ctaText: { color: "#dc2626", fontWeight: "900", fontSize: 13 },
});
