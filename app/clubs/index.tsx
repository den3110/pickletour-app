// ─────────────────────────────────────────────────────────────
// screens/ClubsListScreen.tsx (UPDATED WITH DARK MODE)
// ─────────────────────────────────────────────────────────────
import React, { useState, useEffect } from "react";
import {
  View,
  FlatList,
  StyleSheet,
  Dimensions,
  RefreshControl,
  TouchableOpacity,
  StatusBar,
  ScrollView,
} from "react-native";
import { Text } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  withSpring,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
} from "react-native-reanimated";
import { Stack, useRouter } from "expo-router";
import { useListClubsQuery } from "@/slices/clubsApiSlice";
import ClubCard from "@/components/clubs/ClubCard";
import EmptyState from "@/components/clubs/EmptyState";
import TextInput from "@/components/ui/TextInput";
import { Chip } from "@/components/ui/Chip";
import { Ionicons } from "@expo/vector-icons";
import ClubCreateModal from "@/components/clubs/ClubCreateModal";
// 🆕 Import Theme Hook
import { useTheme } from "@react-navigation/native";
import LiquidGlassSurface from "@/components/ui/LiquidGlassSurface";

const { width } = Dimensions.get("window");

const SPORT_OPTIONS: string[] = [];

// 🆕 COMPONENT SKELETON (Đã update Theme)
const ClubSkeleton = () => {
  const { dark, colors } = useTheme(); // Lấy theme
  const opacity = useSharedValue(0.5);

  // Màu sắc dựa trên theme
  const cardBg = dark ? "#1E1E1E" : "#fff";
  const shapeBg = dark ? "#333" : "#e1e4e8";

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 800 }),
        withTiming(0.5, { duration: 800 })
      ),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.skeletonCard,
        animatedStyle,
        { backgroundColor: cardBg }, // Dynamic background
      ]}
    >
      <View style={[styles.skeletonCover, { backgroundColor: shapeBg }]} />
      <View style={{ padding: 12 }}>
        <View style={[styles.skeletonTitle, { backgroundColor: shapeBg }]} />
        <View style={[styles.skeletonLine, { backgroundColor: shapeBg }]} />
        <View
          style={[
            styles.skeletonLine,
            { width: "60%", backgroundColor: shapeBg },
          ]}
        />
        <View style={styles.skeletonTagsRow}>
          <View style={[styles.skeletonChip, { backgroundColor: shapeBg }]} />
          <View style={[styles.skeletonChip, { backgroundColor: shapeBg }]} />
        </View>
      </View>
    </Animated.View>
  );
};

export default function ClubsListScreen() {
  const router = useRouter();
  // 🆕 Lấy theme hiện tại
  const { colors, dark } = useTheme();

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedSport, setSelectedSport] = useState("");
  const [province, setProvince] = useState("");
  const [tab, setTab] = useState<"all" | "mine">("all");

  const [openCreate, setOpenCreate] = useState(false);

  const scrollY = useSharedValue(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const params: any = {};
  if (debouncedQuery) params.q = debouncedQuery;
  if (selectedSport) params.sport = selectedSport;
  if (province) params.province = province;
  if (tab === "mine") params.mine = true;

  const { data, isLoading, isFetching, refetch } = useListClubsQuery(params);

  const clubs = data?.items || [];

  const handleScroll = (event: any) => {
    scrollY.value = event.nativeEvent.contentOffset.y;
  };

  const headerStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: withSpring(scrollY.value > 50 ? -20 : 0) }],
      opacity: withSpring(scrollY.value > 50 ? 0.9 : 1),
    };
  });

  const renderHeader = () => (
    <Animated.View style={[styles.headerContainer, headerStyle]}>
      <LinearGradient
        colors={["#667eea", "#764ba2"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <StatusBar barStyle="light-content" />
        <View style={styles.headerContent}>
          <View style={styles.headerTopRow}>
            <TouchableOpacity
              onPress={() => router.back()}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <LiquidGlassSurface
                active
                effect="clear"
                isDark={dark}
                style={styles.backBtn}
              >
                <Ionicons name="chevron-back" size={24} color="#fff" />
              </LiquidGlassSurface>
            </TouchableOpacity>

            <Text style={styles.headerTitle}>Câu lạc bộ</Text>
          </View>

          <Text style={styles.headerSubtitle}>
            Tìm và tham gia cộng đồng của bạn
          </Text>
        </View>

        <View style={styles.searchContainer}>
          <TextInput
            placeholder="Tìm kiếm câu lạc bộ..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            leftIcon={
              <MaterialCommunityIcons name="magnify" size={20} color="#999" />
            }
            containerStyle={{
              marginBottom: 0,
              // Giữ nền trắng mờ để nổi bật trên gradient, hoặc dùng màu theme
              borderWidth: 0,
            }}
            style={{ color: dark ? "#fff" : "#333" }}
            placeholderTextColor={dark ? "#ccc" : "#999"}
          />
        </View>

        <View style={styles.tabsContainer}>
          <TouchableOpacity
            onPress={() => setTab("all")}
            activeOpacity={0.85}
          >
            <LiquidGlassSurface
              active={tab === "all"}
              effect="clear"
              isDark={dark}
              style={[styles.tab, tab === "all" && styles.tabActive]}
            >
              <Text
                style={[
                  styles.tabText,
                  tab === "all" && { color: "#667eea" },
                ]}
              >
                Tất cả
              </Text>
            </LiquidGlassSurface>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setTab("mine")}
            activeOpacity={0.85}
          >
            <LiquidGlassSurface
              active={tab === "mine"}
              effect="clear"
              isDark={dark}
              style={[styles.tab, tab === "mine" && styles.tabActive]}
            >
              <Text
                style={[
                  styles.tabText,
                  tab === "mine" && { color: "#667eea" },
                ]}
              >
                CLB của tôi
              </Text>
            </LiquidGlassSurface>
          </TouchableOpacity>
        </View>

        <View style={styles.filterContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterList}
          >
            {SPORT_OPTIONS.map((sport) => (
              <Chip
                key={sport}
                label={sport}
                selected={selectedSport === sport}
                onPress={() =>
                  setSelectedSport(selectedSport === sport ? "" : sport)
                }
                style={{
                  marginRight: 8,
                  // Tùy chỉnh chip trên nền gradient nếu cần
                  backgroundColor:
                    selectedSport === sport ? "#fff" : "rgba(255,255,255,0.2)",
                  borderColor: "transparent",
                }}
                labelStyle={{
                  color: selectedSport === sport ? "#667eea" : "#fff",
                }}
              />
            ))}
          </ScrollView>
        </View>
      </LinearGradient>
    </Animated.View>
  );

  const renderClubCard = ({ item, index }: { item: Club; index: number }) => (
    <Animated.View
      entering={FadeInDown.delay(index * 100)
        .duration(400)
        .springify()}
    >
      <ClubCard
        club={item}
        onPress={() => router.push(`/clubs/${item._id}`)}
        // Nếu ClubCard hỗ trợ style đè hoặc tự xử lý theme thì tốt
        // Nếu không, card sẽ tự động dùng màu của ThemeProvider nếu được cấu hình đúng
      />
    </Animated.View>
  );

  const renderEmpty = () => {
    if (isLoading) {
      return (
        <View style={{ gap: 16 }}>
          {[1, 2, 3, 4, 5].map((item) => (
            <ClubSkeleton key={item} />
          ))}
        </View>
      );
    }

    return (
      <EmptyState
        icon={tab === "mine" ? "account-group-outline" : "magnify"}
        title={
          tab === "mine"
            ? "Chưa có CLB nào"
            : debouncedQuery || selectedSport
            ? "Không tìm thấy"
            : "Danh sách trống"
        }
        subtitle={
          tab === "mine"
            ? "Hãy tạo CLB mới hoặc tham gia CLB khác"
            : debouncedQuery || selectedSport
            ? "Thử thay đổi bộ lọc"
            : "Chưa có CLB nào được tạo"
        }
        onAction={() => setOpenCreate(true)}
        actionText="Tạo CLB"
      />
    );
  };

  // Màu nền chính của màn hình
  const mainBackgroundColor = dark ? "#121212" : "#f5f5f5";

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />
      <View
        style={[styles.container, { backgroundColor: mainBackgroundColor }]}
      >
        {renderHeader()}

        <FlatList
          data={clubs}
          renderItem={renderClubCard}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.listContent}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading}
              onRefresh={refetch}
              colors={["#667eea"]}
              tintColor={dark ? "#fff" : "#667eea"} // Spinner màu trắng trên nền tối
            />
          }
          ListEmptyComponent={renderEmpty}
          showsVerticalScrollIndicator={false}
        />

        <TouchableOpacity
          onPress={() => setOpenCreate(true)}
          activeOpacity={0.8}
        >
          <LiquidGlassSurface
            active
            isDark={dark}
            style={styles.fab}
          >
            <LinearGradient
              colors={["#667eea", "#764ba2"]}
              style={styles.fabGradient}
            >
              <MaterialCommunityIcons name="plus" size={28} color="#fff" />
            </LinearGradient>
          </LiquidGlassSurface>
        </TouchableOpacity>

        <ClubCreateModal
          visible={openCreate}
          onClose={(changed) => {
            setOpenCreate(false);
            if (changed) refetch();
          }}
          onCreated={(club) => {
            if (club?._id) {
              router.push(`/clubs/${club._id}`);
            }
          }}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // backgroundColor được set inline để dynamic
  },
  headerContainer: {
    zIndex: 10,
  },
  gradient: {
    paddingTop: 50,
    paddingBottom: 20,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  headerContent: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.9)",
  },
  searchContainer: {
    paddingHorizontal: 20,
    marginBottom: 15,
  },
  tabsContainer: {
    flexDirection: "row",
    paddingHorizontal: 20,
    marginBottom: 15,
    gap: 10,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  tabActive: {
    backgroundColor: "#fff",
  },
  tabText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  // tabTextActive xử lý inline để dùng màu brand chính xác
  filterContainer: {
    paddingLeft: 20,
  },
  filterList: {
    paddingRight: 20,
  },
  listContent: {
    padding: 16,
    paddingTop: 20,
    paddingBottom: 100, // Thêm padding dưới để tránh FAB che nội dung
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 20,
    borderRadius: 30,
    overflow: "hidden",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  fabGradient: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    marginRight: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
  },

  /* SKELETON STYLES */
  skeletonCard: {
    // backgroundColor handled inline
    borderRadius: 16,
    marginBottom: 16,
    overflow: "hidden",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  skeletonCover: {
    height: 140,
    width: "100%",
    // backgroundColor handled inline
  },
  skeletonTitle: {
    height: 20,
    width: "70%",
    borderRadius: 4,
    marginBottom: 10,
    // backgroundColor handled inline
  },
  skeletonLine: {
    height: 14,
    width: "90%",
    borderRadius: 4,
    marginBottom: 6,
    // backgroundColor handled inline
  },
  skeletonTagsRow: {
    flexDirection: "row",
    marginTop: 10,
    gap: 8,
  },
  skeletonChip: {
    width: 60,
    height: 24,
    borderRadius: 12,
    // backgroundColor handled inline
  },
});
