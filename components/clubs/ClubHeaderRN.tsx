// components/clubs/ClubHeaderRN.tsx
import React from "react";
import { View, Text, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { normalizeUrl } from "@/utils/normalizeUri";

const FALLBACK_COVER =
  "https://dummyimage.com/1600x900/161a24/2b3340&text=Club+Cover";
const FALLBACK_LOGO = "https://dummyimage.com/600x400/4ECDC4/ffffff&text=Logo";

const VI = {
  visibility: { public: "Công khai", private: "Riêng tư", hidden: "Ẩn" },
  joinPolicy: {
    open: "Mở tự do",
    approval: "Duyệt trước",
    invite_only: "Chỉ mời",
  },
};

// Pill nền sáng (hợp nền sáng, không gradient)
function SoftPill({
  text,
  style,
}: {
  text: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.pill, style]}>
      <Text style={styles.pillText} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

export default function ClubHeaderRN({ club }: { club: any }) {
  const cover = club?.coverUrl || FALLBACK_COVER;
  const logo = club?.logoUrl || FALLBACK_LOGO;

  return (
    <View style={styles.wrap}>
      <Image source={{ uri: normalizeUrl(cover) }} style={styles.cover} contentFit="cover" />
      {/* Giữ overlay gradient nền sau như bạn gửi */}
      <LinearGradient
        colors={["#667eea", "#764ba2"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View style={styles.info}>
        <View style={styles.avatarWrap}>
          <Image source={{ uri: normalizeUrl(logo) }} style={styles.avatar} contentFit="cover" />
        </View>

        <Text style={styles.name} numberOfLines={2}>
          {club?.name}
        </Text>

        <View style={styles.badges}>
          {club?.shortCode ? <SoftPill text={`Mã: ${club.shortCode}`} /> : null}
          <SoftPill text={VI.visibility[club?.visibility] || "—"} />
          <SoftPill text={`Tham gia: ${VI.joinPolicy[club?.joinPolicy] || "—"}`} />
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
    borderColor: "#ffffffaa",
    backgroundColor: "#fff",
    marginBottom: 8,
  },
  avatar: { width: "100%", height: "100%" },

  name: { color: "#FFFFFF", fontSize: 20, fontWeight: "800", textAlign: "center" },

  badges: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "center",
    marginTop: 6,
  },

  // ===== Nút/nhãn nền sáng
  pill: {
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 999,
    justifyContent: "center",
    alignItems: "center",
    minWidth: 64,
    backgroundColor: "#ffffffee",        // nền sáng
    borderWidth: 1,
    borderColor: "#E6E8F5",              // viền nhạt
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 1,
  },
  pillText: {
    color: "#41466A",                    // chữ đậm vừa trên nền sáng
    fontWeight: "700",
    fontSize: 12,
  },

  desc: { color: "#f1f6ff", marginTop: 6, textAlign: "center" },
});
