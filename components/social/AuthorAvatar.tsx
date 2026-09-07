import React, { useMemo } from "react";
import {
  Image,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "@/components/ui/i18nText";
import { useThemeTokens, type ThemeTokens } from "@/hooks/useThemeTokens";

type Author =
  | { avatar?: string | null; nickname?: string; name?: string }
  | null
  | undefined;

const nameOf = (u: Author) => u?.nickname || u?.name || "Người dùng";

export function AuthorAvatar({
  user,
  size = 40,
}: {
  user: Author;
  size?: number;
}) {
  const C = useThemeTokens();
  const styles = useMemo(() => mk_styles(C), [C]);
  const url = typeof user?.avatar === "string" ? user.avatar.trim() : "";
  const style = {
    width: size,
    height: size,
    borderRadius: size / 2,
  };

  if (url) {
    return <Image source={{ uri: url }} style={[styles.img, style]} />;
  }
  return (
    <View style={[styles.fallback, style]}>
      <Text style={[styles.letter, { fontSize: Math.max(10, size * 0.45) }]}>
        {nameOf(user)[0]?.toUpperCase()}
      </Text>
    </View>
  );
}

const mk_styles = (C: ThemeTokens) => StyleSheet.create({
  img: { backgroundColor: C.border },
  fallback: {
    backgroundColor: "#0066FF",
    alignItems: "center",
    justifyContent: "center",
  },
  letter: { color: "#fff", fontWeight: "700" },
});
