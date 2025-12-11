// ─────────────────────────────────────────────────────────────
// screens/ClubsListScreen.tsx (UPDATED WITH SKELETON)
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
  // ActivityIndicator, // ❌ Bỏ cái này đi vì ko dùng nữa
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
} from "react-native-reanimated"; // 🆕 Thêm withRepeat, withTiming, withSequence
import { Stack, useRouter } from "expo-router";
import { useListClubsQuery } from "@/slices/clubsApiSlice";
import ClubCard from "@/components/clubs/ClubCard";
import EmptyState from "@/components/clubs/EmptyState";
import TextInput from "@/components/ui/TextInput";
import { Chip } from "@/components/ui/Chip";
import Button from "@/components/ui/Button";
import type { Club } from "@/types/club.types";
import { Ionicons } from "@expo/vector-icons";
import ClubCreateModal from "@/components/clubs/ClubCreateModal";

const { width } = Dimensions.get("window");

const SPORT_OPTIONS: string[] = [];

// 🆕 COMPONENT SKELETON MỚI
const ClubSkeleton = () => {
  const opacity = useSharedValue(0.5);

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
    <Animated.View style={[styles.skeletonCard, animatedStyle]}>
      {/* Ảnh cover giả */}
      <View style={styles.skeletonCover} />
      {/* Nội dung bên dưới */}
      <View style={{ padding: 12 }}>
        <View style={styles.skeletonTitle} />
        <View style={styles.skeletonLine} />
        <View style={[styles.skeletonLine, { width: "60%" }]} />
        <View style={styles.skeletonTagsRow}>
          <View style={styles.skeletonChip} />
          <View style={styles.skeletonChip} />
        </View>
      </View>
    </Animated.View>
  );
};

export default function ClubsListScreen() {
  const router = useRouter();
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
              style={styles.backBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="chevron-back" size={24} color="#fff" />
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
            containerStyle={{ marginBottom: 0 }}
          />
        </View>

        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[styles.tab, tab === "all" && styles.tabActive]}
            onPress={() => setTab("all")}
          >
            <Text
              style={[styles.tabText, tab === "all" && styles.tabTextActive]}
            >
              Tất cả
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, tab === "mine" && styles.tabActive]}
            onPress={() => setTab("mine")}
          >
            <Text
              style={[styles.tabText, tab === "mine" && styles.tabTextActive]}
            >
              CLB của tôi
            </Text>
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
                style={{ marginRight: 8 }}
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
      <ClubCard club={item} onPress={() => router.push(`/clubs/${item._id}`)} />
    </Animated.View>
  );

  const renderEmpty = () => {
    // 🆕 SỬA LOGIC: Render Skeleton list khi loading
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

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />
      <View style={styles.container}>
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
              tintColor="#667eea"
            />
          }
          ListEmptyComponent={renderEmpty}
          showsVerticalScrollIndicator={false}
        />

        <TouchableOpacity
          style={styles.fab}
          onPress={() => setOpenCreate(true)}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={["#667eea", "#764ba2"]}
            style={styles.fabGradient}
          >
            <MaterialCommunityIcons name="plus" size={28} color="#fff" />
          </LinearGradient>
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
    backgroundColor: "#f5f5f5",
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
  },
  tabActive: {
    backgroundColor: "#fff",
  },
  tabText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  tabTextActive: {
    color: "#667eea",
  },
  filterContainer: {
    paddingLeft: 20,
  },
  filterList: {
    paddingRight: 20,
  },
  listContent: {
    padding: 16,
    paddingTop: 20,
  },
  // BỎ loadingContainer cũ đi cũng được vì giờ dùng Skeleton
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 100,
  },
  loadingText: {
    marginTop: 10,
    color: "#666",
    fontSize: 14,
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
    paddingRight: 8,
    paddingVertical: 4,
    marginRight: 4,
  },

  /* 🆕 SKELETON STYLES */
  skeletonCard: {
    backgroundColor: "#fff",
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
    backgroundColor: "#e1e4e8",
    width: "100%",
  },
  skeletonTitle: {
    height: 20,
    backgroundColor: "#e1e4e8",
    width: "70%",
    borderRadius: 4,
    marginBottom: 10,
  },
  skeletonLine: {
    height: 14,
    backgroundColor: "#e1e4e8",
    width: "90%",
    borderRadius: 4,
    marginBottom: 6,
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
    backgroundColor: "#e1e4e8",
  },
});
