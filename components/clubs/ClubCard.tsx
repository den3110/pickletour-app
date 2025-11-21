import React from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Text,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Animated, { FadeIn } from "react-native-reanimated";
import { Chip } from "@/components/ui/Chip";
import type { Club } from "@/types/club.types";
import { Image as ExpoImage } from "expo-image";
import { normalizeUrl } from "@/utils/normalizeUri";

const { width } = Dimensions.get("window");
const CARD_WIDTH = width - 32;

interface ClubCardProps {
  club: Club;
  onPress: () => void;
}

export default function ClubCard({ club, onPress }: ClubCardProps) {
  const cover =
    club.coverUrl || club.logoUrl || "https://via.placeholder.com/400x200";
  const logo = club.logoUrl || "https://via.placeholder.com/80";
  const memberCount = club.stats?.memberCount || 0;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.9}>
      <Animated.View entering={FadeIn.duration(300)} style={styles.card}>
        {/* Cover Image with Gradient Overlay (expo-image) */}
        <View style={styles.coverContainer}>
          <ExpoImage
            source={{ uri: normalizeUrl(cover) }}
            style={styles.cover}
            contentFit="cover"
            transition={200}
            cachePolicy="memory-disk"
            recyclingKey={`cover-${cover}`}
          />
          <LinearGradient
            colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.4)"]}
            style={styles.coverGradient}
          />

          {/* Verified Badge */}
          {club.isVerified && (
            <View style={styles.verifiedBadge}>
              <MaterialCommunityIcons
                name="check-decagram"
                size={20}
                color="#fff"
              />
            </View>
          )}
        </View>

        {/* Content */}
        <View style={styles.content}>
          {/* Logo Avatar (expo-image, cached) */}
          <View style={styles.avatarContainer}>
            <ExpoImage
              source={{ uri: normalizeUrl(logo) }}
              style={styles.avatar}
              contentFit="cover"
              transition={150}
              cachePolicy="memory-disk"
              recyclingKey={`logo-${logo}`}
            />
            {club.isVerified && (
              <View style={styles.avatarBadge}>
                <MaterialCommunityIcons
                  name="check-circle"
                  size={18}
                  color="#4CAF50"
                />
              </View>
            )}
          </View>

          {/* Club Info */}
          <View style={styles.info}>
            <Text style={styles.clubName} numberOfLines={1}>
              {club.name}
            </Text>

            {/* Location */}
            {(club.province || club.city) && (
              <View style={styles.locationRow}>
                <MaterialCommunityIcons
                  name="map-marker"
                  size={14}
                  color="#999"
                />
                <Text style={styles.location} numberOfLines={1}>
                  {club.city ? `${club.city}, ` : ""}
                  {club.province || ""}
                </Text>
              </View>
            )}

            {/* Sport Types */}
            {club.sportTypes && club.sportTypes.length > 0 && (
              <View style={styles.sportsContainer}>
                {club.sportTypes.slice(0, 2).map((sport) => (
                  <Chip key={sport} label={sport} style={styles.sportChip} />
                ))}
                {club.sportTypes.length > 2 && (
                  <Text style={styles.moreSports}>
                    +{club.sportTypes.length - 2}
                  </Text>
                )}
              </View>
            )}

            {/* Stats */}
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <MaterialCommunityIcons
                  name="account-group"
                  size={16}
                  color="#667eea"
                />
                <Text style={styles.statText}>{memberCount} thành viên</Text>
              </View>

              {club.shortCode && (
                <View style={styles.shortCodeBadge}>
                  <Text style={styles.shortCodeText}>{club.shortCode}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Bottom Gradient Accent */}
        <LinearGradient
          colors={["rgba(102, 126, 234, 0)", "rgba(102, 126, 234, 0.1)"]}
          style={styles.bottomAccent}
        />
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    backgroundColor: "#fff",
    borderRadius: 20,
    marginBottom: 16,
    overflow: "hidden",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  coverContainer: {
    width: "100%",
    height: 140,
    backgroundColor: "#e0e0e0",
  },
  cover: {
    width: "100%",
    height: "100%",
  },
  coverGradient: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 80,
  },
  verifiedBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: "rgba(76, 175, 80, 0.9)",
    borderRadius: 15,
    width: 30,
    height: 30,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    padding: 16,
    paddingTop: 40,
  },
  avatarContainer: {
    position: "absolute",
    top: -32,
    left: 16,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#fff",
    borderWidth: 3,
    borderColor: "#fff",
    elevation: 3,
  },
  avatarBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    backgroundColor: "#fff",
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  info: {
    gap: 8,
  },
  clubName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  location: {
    fontSize: 13,
    color: "#999",
    flex: 1,
  },
  sportsContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  sportChip: {
    height: 24,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  moreSports: {
    fontSize: 11,
    color: "#999",
    fontWeight: "600",
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  stat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statText: {
    fontSize: 13,
    color: "#666",
    fontWeight: "500",
  },
  shortCodeBadge: {
    backgroundColor: "#f0f0f0",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  shortCodeText: {
    fontSize: 11,
    color: "#667eea",
    fontWeight: "600",
  },
  bottomAccent: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
  },
});
