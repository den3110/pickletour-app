// components/social/OpenMessageButton.tsx
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Alert, Pressable, StyleSheet, Text } from "react-native";
import { useSelector } from "react-redux";

import { useOpenDmMutation } from "@/slices/messagesApiSlice";

export function OpenMessageButton({
  userId,
  compact = false,
  label = "Nhắn",
}: {
  userId: string;
  compact?: boolean;
  label?: string;
}) {
  const me = useSelector((s: any) => s.auth?.userInfo);
  const [openDm, { isLoading }] = useOpenDmMutation();
  if (!me || !userId || String(userId) === String(me._id)) return null;

  const onPress = async (e?: any) => {
    e?.stopPropagation?.();
    try {
      const conv: any = await openDm(userId).unwrap();
      router.push(`/messages/${conv._id}`);
    } catch (err: any) {
      Alert.alert("Lỗi", err?.data?.message || "Không mở được hội thoại");
    }
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={isLoading}
      style={[styles.btn, compact && styles.btnCompact]}
    >
      <Ionicons name="chatbubble-outline" size={16} color="#0066FF" />
      {!compact && <Text style={styles.text}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#DBEAFE",
    backgroundColor: "#EEF4FF",
  },
  btnCompact: {
    width: 34,
    height: 34,
    padding: 0,
    justifyContent: "center",
    borderRadius: 17,
  },
  text: { color: "#0066FF", fontWeight: "600", fontSize: 13 },
});
