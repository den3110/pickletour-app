// app/clubs/[id].tsx
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  Platform,
  StatusBar,
} from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import LottieView from "lottie-react-native";

// RTK Query
import { useGetClubQuery } from "@/slices/clubsApiSlice";

// RN components
import ClubHeaderRN from "@/components/clubs/ClubHeaderRN";
import ClubActionsRN from "@/components/clubs/ClubActionsRN";
import ClubAnnouncementsRN from "@/components/clubs/ClubAnnouncementsRN";
import ClubEventsRN from "@/components/clubs/ClubEventsRN";
import ClubPollsRN from "@/components/clubs/ClubPollsRN";
import ClubMembersCarouselRN from "@/components/clubs/ClubMembersCarouselRN";
import JoinRequestsSheetRN from "@/components/clubs/JoinRequestsSheetRN";
import ClubCreateModal from "@/components/clubs/ClubCreateModal";

const { width: W } = Dimensions.get("window");
const TABS = ["news", "events", "polls"] as const;
type TabKey = (typeof TABS)[number];
const LOTTIE_OPACITY = 0.12; // nền Lottie nhạt

// ===== helpers =====
function calcCanSeeMembers(club: any, my: any) {
  const vis = club?.memberVisibility || "admins";
  const canManage = !!my?.canManage;
  const isMember =
    !!my?.isMember ||
    my?.membershipRole === "owner" ||
    my?.membershipRole === "admin";
  if (vis === "admins") return canManage;
  if (vis === "members") return isMember || canManage;
  if (vis === "public") return true;
  return false;
}
function memberGuardMessage(club: any) {
  const vis = club?.memberVisibility || "admins";
  if (vis === "admins")
    return "Danh sách thành viên chỉ hiển thị với quản trị viên CLB.";
  if (vis === "members")
    return "Danh sách thành viên chỉ hiển thị với thành viên CLB.";
  return "Danh sách thành viên hiện không thể hiển thị.";
}

// ===== local UI: GradientCard =====
function GradientCard({
  children,
  style,
  pad = 12,
}: {
  children: React.ReactNode;
  style?: any;
  pad?: number;
}) {
  return (
    <View style={[styles.gradCard, style]}>
      <LinearGradient
        colors={["#667eea", "#764ba2"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={{ padding: pad }}>{children}</View>
    </View>
  );
}

export default function ClubDetailPageRN() {
  const params = useLocalSearchParams<{ id?: string; tab?: string }>();
  const id = String(params?.id || "");
  const initialTab = (params?.tab || "").toLowerCase();
  const [tab, setTab] = useState<TabKey>(
    TABS.includes(initialTab as TabKey) ? (initialTab as TabKey) : "news"
  );

  const { data: club, isLoading, refetch } = useGetClubQuery(id, { skip: !id });
  const my = club?._my || null;
  const canManage = !!my?.canManage;
  const isOwnerOrAdmin =
    my && (my.membershipRole === "owner" || my.membershipRole === "admin");
  const canSeeMembers = calcCanSeeMembers(club, my);

  // Animations
  const scrollY = useRef(new Animated.Value(0)).current;
  const headerTranslate = scrollY.interpolate({
    inputRange: [0, 120],
    outputRange: [0, -40],
    extrapolate: "clamp",
  });
  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 120],
    outputRange: [1, 0.9],
    extrapolate: "clamp",
  });

  // Segmented control (indicator dưới, label trên)
  const OUT_PAD = 16;
  const SEG_H = 44;
  const TRACK_PAD = 2;
  const trackW = W - OUT_PAD * 2;
  const itemW = (trackW - TRACK_PAD * 2) / TABS.length;
  const [tabIdx, setTabIdx] = useState<number>(TABS.indexOf(tab));
  const indicatorX = useRef(new Animated.Value(itemW * tabIdx)).current;
  const trackPadAnim = useRef(new Animated.Value(TRACK_PAD)).current;

  useEffect(() => {
    const i = TABS.indexOf(tab);
    setTabIdx(i);
    Animated.spring(indicatorX, {
      toValue: itemW * i,
      useNativeDriver: false,
      damping: 16,
      stiffness: 220,
      mass: 0.9,
    }).start();
  }, [tab]);

  // Admin sheets/modals
  const [openEdit, setOpenEdit] = useState(false);
  const joinSheetRef = useRef<BottomSheetModal>(null);
  const openJR = () => {
    Haptics.selectionAsync();
    joinSheetRef.current?.present();
  };
  const closeJR = () => joinSheetRef.current?.dismiss();

  // Loading
  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <Stack.Screen options={{ headerShown: false }} />
        {/* Lottie BG while loading */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <LottieView
            source={require("@/assets/lottie/animated-bg.json")}
            autoPlay
            loop
            speed={0.8}
            style={[StyleSheet.absoluteFill, { opacity: LOTTIE_OPACITY }]}
          />
        </View>

        <View style={styles.centered}>
          <ActivityIndicator />
          <Text style={{ marginTop: 8, color: "#666" }}>Đang tải CLB…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!club?._id) {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <Stack.Screen options={{ headerShown: false }} />
        {/* Lottie BG */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <LottieView
            source={require("@/assets/lottie/animated-bg.json")}
            autoPlay
            loop
            speed={0.8}
            style={[StyleSheet.absoluteFill, { opacity: LOTTIE_OPACITY }]}
          />
        </View>

        <View style={styles.centered}>
          <GradientCard>
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>
              Không tìm thấy CLB
            </Text>
          </GradientCard>
        </View>
      </SafeAreaView>
    );
  }

  // FAB quản trị
  const AdminFAB = isOwnerOrAdmin ? (
    <View style={styles.fabWrap}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setOpenEdit(true);
        }}
        style={[styles.fabBtn, { right: 94 }]}
      >
        <LinearGradient
          colors={["#667eea", "#764ba2"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <Text style={styles.fabText}>Sửa CLB</Text>
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.9}
        onPress={openJR}
        style={[styles.fabBtn, { right: 16 }]}
      >
        <LinearGradient
          colors={["#667eea", "#764ba2"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <Text style={styles.fabText}>Duyệt</Text>
      </TouchableOpacity>
    </View>
  ) : null;

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <StatusBar barStyle="dark-content" />
      <Stack.Screen options={{ headerShown: false }} />

      <View style={{ flex: 1 }}>
        {/* ===== LOTTIE BACKGROUND (toàn trang) ===== */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <LottieView
            source={require("@/assets/lottie/animated-bg.json")}
            autoPlay
            loop
            speed={0.8}
            style={[StyleSheet.absoluteFill, { opacity: LOTTIE_OPACITY }]}
          />
        </View>

        {/* ===== Content ===== */}
        <Animated.ScrollView
          scrollEventThrottle={16}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: false }
          )}
          contentContainerStyle={{ paddingBottom: 120 }}
        >
          {/* Parallax header */}
          <Animated.View
            style={{
              transform: [{ translateY: headerTranslate }],
              opacity: headerOpacity,
            }}
          >
            <ClubHeaderRN club={club} />
          </Animated.View>

          {/* Actions (Card có gradient) */}
          <View style={{ paddingHorizontal: OUT_PAD }}>
            <GradientCard>
              <ClubActionsRN club={club} my={my} />
            </GradientCard>
          </View>

          {/* Segmented Tabs (Card có gradient) */}
          <View style={{ marginTop: 12, paddingHorizontal: OUT_PAD }}>
            <GradientCard pad={8}>
              <View style={[styles.track, { height: SEG_H }]}>
                {/* indicator dưới */}
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.indicator,
                    {
                      width: itemW,
                      height: SEG_H - TRACK_PAD * 2,
                      transform: [
                        {
                          translateX: Animated.add(indicatorX, trackPadAnim),
                        },
                      ],
                    },
                  ]}
                >
                  <LinearGradient
                    colors={[
                      "rgba(255,255,255,0.98)",
                      "rgba(255,255,255,0.98)",
                    ]}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                  />
                </Animated.View>

                {/* labels trên */}
                <View style={styles.row} pointerEvents="box-none">
                  {TABS.map((k) => {
                    const active = tab === k;
                    return (
                      <TouchableOpacity
                        key={k}
                        activeOpacity={0.9}
                        onPress={() => {
                          setTab(k);
                          Haptics.selectionAsync();
                        }}
                        style={[styles.tabBtn, { height: SEG_H }]}
                      >
                        <Text
                          style={[
                            styles.tabText,
                            active && styles.tabTextActive,
                          ]}
                          numberOfLines={1}
                        >
                          {k === "news"
                            ? "Bảng tin"
                            : k === "events"
                            ? "Sự kiện"
                            : "Khảo sát"}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </GradientCard>
          </View>

          {/* Tab content */}
          <View style={{ height: 10 }} />
          {tab === "news" && (
            <>
              <ClubAnnouncementsRN club={club} canManage={canManage} />
              <View style={{ height: 8 }} />
              {canSeeMembers ? (
                <ClubMembersCarouselRN club={club} canManage={canManage} />
              ) : (
                <View style={{ paddingHorizontal: OUT_PAD }}>
                  <GradientCard>
                    <Text style={{ color: "#fff" }}>
                      {memberGuardMessage(club)}
                    </Text>
                  </GradientCard>
                </View>
              )}
            </>
          )}

          {tab === "events" && (
            <ClubEventsRN club={club} canManage={canManage} />
          )}

          {tab === "polls" && <ClubPollsRN club={club} canManage={canManage} />}
        </Animated.ScrollView>

        {/* Admin FAB */}
        {AdminFAB}
      </View>

      {/* Modal: Edit/Create Club */}
      <ClubCreateModal
        visible={openEdit}
        initial={club}
        onClose={(ok) => {
          setOpenEdit(false);
          if (ok) refetch();
        }}
      />

      {/* Bottom Sheet: Join Requests */}
      <BottomSheetModal
        ref={joinSheetRef}
        index={0}
        snapPoints={["50%", "80%"]}
        backgroundStyle={{ backgroundColor: "#fff" }}
        handleIndicatorStyle={{ backgroundColor: "#ccc" }}
      >
        <JoinRequestsSheetRN clubId={club._id} onClose={closeJR} />
      </BottomSheetModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },

  // gradient card
  gradCard: {
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.06)",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 14,
    elevation: 6,
    backgroundColor: "transparent",
  },

  // segmented
  track: {
    borderRadius: 12,
    overflow: "hidden",
    padding: 2,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  indicator: {
    position: "absolute",
    top: 2,
    left: 0,
    borderRadius: 10,
    zIndex: 1, // dưới labels
  },
  row: {
    flexDirection: "row",
    zIndex: 2,
  },
  tabBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  // chữ mặc định sáng để nổi trên gradient, active thì đậm tối để không "mất chữ" trên nền trắng
  tabText: { color: "#ffffffd9", fontWeight: "700" },
  tabTextActive: { color: "#2f2a86", fontWeight: "800" },

  // FAB
  fabWrap: {
    position: "absolute",
    bottom: 18 + (Platform.OS === "ios" ? 6 : 0),
    right: 0,
    left: 0,
    alignItems: "flex-end",
  },
  fabBtn: {
    height: 42,
    paddingHorizontal: 16,
    borderRadius: 999,
    justifyContent: "center",
    alignItems: "center",
    position: "absolute",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 12,
    elevation: 10,
    overflow: "hidden",
    backgroundColor: "#0000",
  },
  fabText: { color: "#fff", fontWeight: "800" },
});
