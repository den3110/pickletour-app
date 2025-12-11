import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@react-navigation/native";
import { router } from "expo-router";
import LottieView from "lottie-react-native";
import { useGetFeaturedLeaderboardQuery } from "@/slices/leaderboardApiSlice";
import { normalizeUrl } from "@/utils/normalizeUri";

const BG_3D = require("@/assets/lottie/bg-3d.json"); // Adjust path

/* ---------- Leaderboard Card Component ---------- */
function LeaderboardCard({ athlete, theme }) {
  const isDark = !!theme?.dark;
  const bg = theme?.colors?.card ?? (isDark ? "#1a1d23" : "#ffffff");
  const text = theme?.colors?.text ?? (isDark ? "#ffffff" : "#111111");
  const subtext = isDark ? "#b0b0b0" : "#666666";

  const borderColors = {
    gold: ["#FFD700", "#FFA500", "#FFD700"],
    silver: ["#C0C0C0", "#E8E8E8", "#C0C0C0"],
    bronze: ["#CD7F32", "#E9967A", "#CD7F32"],
  };

  // Format achievements array
  const renderAchievements = () => {
    if (!Array.isArray(athlete.achievements)) return null;

    return (
      <View style={styles.achievementsContainer}>
        {athlete.achievements.slice(0, 4).map((achievement, idx) => {
          // Skip period (hiển thị riêng nếu cần)
          if (achievement.type === "period") return null;

          return (
            <View key={idx} style={styles.achievementItem}>
              <Text style={styles.achievementIcon}>{achievement.icon}</Text>
              <View style={styles.achievementInfo}>
                {achievement.type === "wins" ? (
                  <>
                    <Text style={[styles.achievementValue, { color: text }]}>
                      {achievement.value}/{achievement.total}
                    </Text>
                    <Text style={[styles.achievementLabel, { color: subtext }]}>
                      {achievement.label} ({achievement.winRate}%)
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={[styles.achievementValue, { color: text }]}>
                      {achievement.value}
                    </Text>
                    <Text style={[styles.achievementLabel, { color: subtext }]}>
                      {achievement.label}
                    </Text>
                  </>
                )}
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <LinearGradient
      colors={borderColors[athlete.tier]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.leaderboardCardGradient}
    >
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => {
          console.log(`/profile/${athlete.id}/index`);
          router.push(`/profile/${athlete.id}`);
        }}
      >
        <View style={[styles.leaderboardCard, { backgroundColor: bg }]}>
          {/* Header: Rank + Avatar + Name */}
          <View style={styles.cardHeader}>
            <View style={styles.rankBadge}>
              <Text style={styles.rankText}>#{athlete.rank}</Text>
            </View>

            <Image
              source={{ uri: athlete.avatar }}
              style={styles.avatarImage}
              contentFit="cover"
              transition={200}
            />

            <View style={styles.nameContainer}>
              <Text
                style={[styles.athleteName, { color: text }]}
                numberOfLines={1}
              >
                {athlete.name}
              </Text>
              {athlete.nickname ? (
                <Text
                  style={[styles.athleteNickname, { color: subtext }]}
                  numberOfLines={1}
                >
                  @{athlete.nickname}
                </Text>
              ) : null}
            </View>
          </View>

          {/* Stats Row */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: text }]}>
                {athlete.score?.toFixed(1) || 0}
              </Text>
              <Text style={[styles.statLabel, { color: subtext }]}>Điểm</Text>
            </View>

            <View style={styles.statDivider} />

            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: text }]}>
                {athlete.winRate || 0}%
              </Text>
              <Text style={[styles.statLabel, { color: subtext }]}>
                Tỷ lệ thắng
              </Text>
            </View>

            {athlete.finalWins > 0 && (
              <>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: "#FFD700" }]}>
                    {athlete.finalWins}
                  </Text>
                  <Text style={[styles.statLabel, { color: subtext }]}>
                    Vô địch
                  </Text>
                </View>
              </>
            )}
          </View>

          {/* Achievements */}
          {renderAchievements()}

          {/* Tournaments Preview */}
          {athlete.tournaments && athlete.tournaments.length > 0 && (
            <View style={styles.tournamentsPreview}>
              <Text style={[styles.tournamentsTitle, { color: subtext }]}>
                Giải đấu gần đây:
              </Text>
              <View style={styles.tournamentsGrid}>
                {athlete.tournaments.slice(0, 2).map((tournament) => (
                  <View key={tournament.id} style={styles.tournamentChip}>
                    <Text
                      style={[styles.tournamentName, { color: text }]}
                      numberOfLines={1}
                    >
                      {tournament.name}
                    </Text>
                  </View>
                ))}
                {athlete.tournaments.length > 2 && (
                  <Text style={[styles.tournamentMore, { color: subtext }]}>
                    +{athlete.tournaments.length - 2} giải khác
                  </Text>
                )}
              </View>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </LinearGradient>
  );
}

/* ---------- Leaderboard Section Component ---------- */
export default function LeaderboardSection() {
  const theme = useTheme();
  const { data, isLoading, isError } = useGetFeaturedLeaderboardQuery({
    sinceDays: 90,
    limit: 5,
    minMatches: 3,
  });

  const items = Array.isArray(data?.items) ? data.items : [];

  const decorateTier = (rank) =>
    rank === 1
      ? "gold"
      : rank === 2
      ? "silver"
      : rank === 3
      ? "bronze"
      : "bronze";

  return (
    <View style={styles.leaderboardSection}>
      {/* Background Animation */}
      <View style={styles.leaderboardBackground}>
        <LottieView
          source={BG_3D}
          autoPlay
          speed={0.5}
          loop
          resizeMode="cover"
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
        <View style={styles.leaderboardOverlay} />
      </View>

      {/* Header */}
      <View style={styles.leaderboardHeaderContainer}>
        <LinearGradient
          colors={["#FFD700", "#FFA500"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.leaderboardHeader}
        >
          <Ionicons name="podium" size={28} color="#FFFFFF" />
          <Text style={styles.leaderboardHeaderText}>
            Bảng xếp hạng nổi bật
          </Text>
          <Ionicons name="podium" size={28} color="#FFFFFF" />
        </LinearGradient>
      </View>

      {/* Cards Container */}
      <View style={styles.leaderboardCards}>
        {/* Loading State */}
        {isLoading && (
          <>
            {[1, 2, 3].map((i) => (
              <View
                key={i}
                style={[styles.leaderboardCardGradient, { opacity: 0.6 }]}
              >
                <View
                  style={[
                    styles.leaderboardCard,
                    { backgroundColor: "#00000020", height: 200 },
                  ]}
                />
              </View>
            ))}
          </>
        )}

        {/* Error State */}
        {isError && (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={48} color="#FF6B6B" />
            <Text style={styles.errorText}>Không thể tải bảng xếp hạng</Text>
          </View>
        )}

        {/* Empty State */}
        {!isLoading && !isError && items.length === 0 && (
          <View style={styles.emptyContainer}>
            <Ionicons name="trophy-outline" size={48} color="#999999" />
            <Text style={styles.emptyText}>Chưa có dữ liệu xếp hạng</Text>
          </View>
        )}

        {/* Data State */}
        {!isLoading &&
          !isError &&
          items.map((u) => (
            <LeaderboardCard
              key={String(u.userId)}
              theme={theme}
              athlete={{
                id: String(u.userId),
                rank: u.rank,
                name: u.name,
                nickname: u.nickname,
                avatar:
                  normalizeUrl(u.avatar) || "https://i.pravatar.cc/150?img=12",
                score: u.score,
                winRate: u.winRate,
                finalWins: u.finalWins,
                achievements: u.achievements,
                tournaments: u.tournaments,
                tier: decorateTier(u.rank),
              }}
            />
          ))}
      </View>

      {/* View All Button */}
      {!isLoading && !isError && items.length > 0 && (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => router.push("/rankings/stack")}
          style={styles.viewAllButton}
        >
          <LinearGradient
            colors={["#FFD700", "#FFA500"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.viewAllGradient}
          >
            <Text style={styles.viewAllText}>Xem toàn bộ xếp hạng</Text>
            <Ionicons name="arrow-forward-circle" size={24} color="#FFFFFF" />
          </LinearGradient>
        </TouchableOpacity>
      )}
    </View>
  );
}

/* ---------- Styles ---------- */
const styles = StyleSheet.create({
  leaderboardSection: {
    marginVertical: 24,
    paddingVertical: 20,
    position: "relative",
  },
  leaderboardBackground: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
    borderRadius: 24,
  },
  leaderboardOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  leaderboardHeaderContainer: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  leaderboardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 16,
    gap: 12,
  },
  leaderboardHeaderText: {
    fontSize: 20,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  leaderboardCards: {
    paddingHorizontal: 16,
    gap: 12,
  },
  leaderboardCardGradient: {
    borderRadius: 16,
    padding: 2,
  },
  leaderboardCard: {
    borderRadius: 14,
    padding: 16,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  rankBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 215, 0, 0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  rankText: {
    fontSize: 18,
    fontWeight: "900",
    color: "#FFD700",
  },
  avatarImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#f0f0f0",
    marginRight: 12,
  },
  nameContainer: {
    flex: 1,
  },
  athleteName: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 2,
  },
  athleteNickname: {
    fontSize: 12,
    fontWeight: "500",
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(128, 128, 128, 0.1)",
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "500",
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: "rgba(128, 128, 128, 0.2)",
  },
  achievementsContainer: {
    marginTop: 12,
    gap: 8,
  },
  achievementItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  achievementIcon: {
    fontSize: 20,
  },
  achievementInfo: {
    flex: 1,
  },
  achievementValue: {
    fontSize: 14,
    fontWeight: "700",
  },
  achievementLabel: {
    fontSize: 11,
    fontWeight: "500",
  },
  tournamentsPreview: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: "rgba(128, 128, 128, 0.1)",
  },
  tournamentsTitle: {
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 6,
  },
  tournamentsGrid: {
    gap: 6,
  },
  tournamentChip: {
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  tournamentName: {
    fontSize: 11,
    fontWeight: "500",
  },
  tournamentMore: {
    fontSize: 10,
    fontStyle: "italic",
    marginTop: 4,
  },
  errorContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  errorText: {
    fontSize: 14,
    color: "#FF6B6B",
    marginTop: 12,
    fontWeight: "600",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    color: "#999999",
    marginTop: 12,
    fontWeight: "600",
  },
  viewAllButton: {
    marginTop: 16,
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: "hidden",
  },
  viewAllGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 24,
    gap: 10,
  },
  viewAllText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
});
