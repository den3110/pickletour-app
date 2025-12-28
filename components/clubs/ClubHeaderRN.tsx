// components/clubs/ClubHeaderRN.tsx
import React, { useMemo } from "react";
import { View, Text, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@react-navigation/native"; // Import useTheme
import { normalizeUrl } from "@/utils/normalizeUri";

const VI = {
  visibility: { public: "Công khai", private: "Riêng tư", hidden: "Ẩn" },
  joinPolicy: {
    open: "Mở tự do",
    approval: "Duyệt trước",
    invite_only: "Chỉ mời",
  },
};

// Component Pill nhận thêm prop màu sắc dynamic
function SoftPill({
  text,
  style,
  colors,
}: {
  text: string;
  style?: StyleProp<ViewStyle>;
  colors: { bg: string; border: string; text: string };
}) {
  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: colors.bg,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      <Text style={[styles.pillText, { color: colors.text }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

export default function ClubHeaderRN({ club }: { club: any }) {
  // 1. Lấy theme hiện tại
  const theme = useTheme();
  const isDark = theme.dark;

  // 2. Định nghĩa màu sắc dựa trên theme
  // Dùng useMemo để không phải tính lại mỗi lần render nếu theme không đổi
  const dynamicColors = useMemo(() => {
    return {
      pill: {
        bg: isDark ? "rgba(30, 41, 59, 0.85)" : "rgba(255, 255, 255, 0.9)",
        border: isDark ? "rgba(255,255,255,0.15)" : "#E6E8F5",
        text: isDark ? "#E2E8F0" : "#41466A",
      },
      placeholder: {
        bg: isDark ? "#1E293B" : "#F3F4F6", // Màu nền chỗ logo fallback
        icon: isDark ? "#A78BFA" : "#764ba2", // Màu icon logo fallback
      },
    };
  }, [isDark]);

  const hasCover = !!club?.coverUrl;
  const hasLogo = !!club?.logoUrl;

  return (
    <View style={styles.wrap}>
      {/* --- COVER --- */}
      {hasCover ? (
        <Image
          source={{ uri: normalizeUrl(club.coverUrl) }}
          style={styles.cover}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.cover, styles.coverPlaceholder]}>
          <Ionicons
            name="images-outline"
            size={64}
            color="rgba(255,255,255,0.25)"
          />
        </View>
      )}

      {/* Overlay Gradient: Giữ nguyên vì nó tạo nền cho Text trắng */}
      <LinearGradient
        colors={["#667eea", "#764ba2"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View style={styles.info}>
        {/* --- LOGO / AVATAR --- */}
        <View
          style={[
            styles.avatarWrap,
            // Dark mode thì viền tối hơn chút hoặc giữ trắng cho nổi trên nền gradient
            {
              backgroundColor: dynamicColors.placeholder.bg,
              borderColor: "rgba(255,255,255,0.8)",
            },
          ]}
        >
          {hasLogo ? (
            <Image
              source={{ uri: normalizeUrl(club.logoUrl) }}
              style={styles.avatar}
              contentFit="cover"
            />
          ) : (
            <View
              style={[
                styles.avatarPlaceholder,
                { backgroundColor: dynamicColors.placeholder.bg },
              ]}
            >
              <Ionicons
                name="shield-outline"
                size={40}
                color={dynamicColors.placeholder.icon}
              />
            </View>
          )}
        </View>

        {/* Text Name & Desc giữ màu trắng vì nằm trên Gradient */}
        <Text style={styles.name} numberOfLines={2}>
          {club?.name}
        </Text>

        <View style={styles.badges}>
          {club?.shortCode ? (
            <SoftPill
              text={`Mã: ${club.shortCode}`}
              colors={dynamicColors.pill}
            />
          ) : null}
          <SoftPill
            text={VI.visibility[club?.visibility] || "—"}
            colors={dynamicColors.pill}
          />
          <SoftPill
            text={`Tham gia: ${VI.joinPolicy[club?.joinPolicy] || "—"}`}
            colors={dynamicColors.pill}
          />
        </View>

        {!!club?.description && (
          <Text style={styles.desc} numberOfLines={3}>
            {club.description}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 20, overflow: "hidden", margin: 16 },

  cover: { width: "100%", height: 220 },
  coverPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
  },

  info: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 10,
    alignItems: "center",
  },

  avatarWrap: {
    width: 92,
    height: 92,
    borderRadius: 46,
    overflow: "hidden",
    borderWidth: 2,
    marginBottom: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  avatar: { width: "100%", height: "100%" },
  avatarPlaceholder: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },

  name: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
    textShadowColor: "rgba(0, 0, 0, 0.1)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  badges: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "center",
    marginTop: 6,
  },

  pill: {
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 999,
    justifyContent: "center",
    alignItems: "center",
    minWidth: 64,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 1,
  },
  pillText: {
    fontWeight: "700",
    fontSize: 12,
  },

  desc: {
    color: "#f1f6ff",
    marginTop: 6,
    textAlign: "center",
    opacity: 0.9,
  },
});