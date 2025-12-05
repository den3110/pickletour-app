// app/schedule/index.tsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
  Platform,
  Alert,
  StatusBar,
  Animated,
  LayoutAnimation,
  UIManager,
  Linking,
} from "react-native";
import { Calendar, LocaleConfig } from "react-native-calendars";
import { DateTime } from "luxon";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { router, Stack } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import {
  useGetMyScheduleQuery,
  useGetMarkedDatesQuery,
  useGetUpcomingMatchesQuery,
} from "@/slices/scheduleApiSlice";
import { useMatchCalendar } from "@/hooks/useMatchCalendar";
import AuthGuard from "@/components/auth/AuthGuard";
import { Ionicons } from "@expo/vector-icons";
// ===== CALENDAR LOCALE (VIETNAMESE) =====
LocaleConfig.locales["vi"] = {
  monthNames: [
    "Tháng 1",
    "Tháng 2",
    "Tháng 3",
    "Tháng 4",
    "Tháng 5",
    "Tháng 6",
    "Tháng 7",
    "Tháng 8",
    "Tháng 9",
    "Tháng 10",
    "Tháng 11",
    "Tháng 12",
  ],
  monthNamesShort: [
    "Thg 1",
    "Thg 2",
    "Thg 3",
    "Thg 4",
    "Thg 5",
    "Thg 6",
    "Thg 7",
    "Thg 8",
    "Thg 9",
    "Thg 10",
    "Thg 11",
    "Thg 12",
  ],
  dayNames: [
    "Chủ nhật",
    "Thứ hai",
    "Thứ ba",
    "Thứ tư",
    "Thứ năm",
    "Thứ sáu",
    "Thứ bảy",
  ],
  dayNamesShort: ["CN", "T2", "T3", "T4", "T5", "T6", "T7"],
  today: "Hôm nay",
};

LocaleConfig.defaultLocale = "vi";

// Enable LayoutAnimation for Android
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width, height } = Dimensions.get("window");
const CARD_MARGIN = 16;
const CARD_WIDTH = width - CARD_MARGIN * 2;

// ============= TYPES =============
interface Match {
  _id: string;
  code: string;
  round: number;
  order: number;
  status: "scheduled" | "queued" | "assigned" | "live" | "finished";
  scheduledAt: Date | string;
  localScheduledTime: string;
  startedAt?: Date;
  finishedAt?: Date;
  mySide: "A" | "B" | null;
  myTeam: any;
  opponentTeam: any;
  winner: "A" | "B" | "";
  isWinner?: boolean | null;
  gameScores: Array<{ a: number; b: number }>;
  court?: any;
  courtLabel?: string;
  referee?: any[];
  tournament: {
    _id: string;
    name: string;
    image: string;
    location: string;
    timezone: string;
  };
  bracket: {
    _id: string;
    name: string;
    type: string;
    stage: number;
    color: string;
  };
  rules: any;
  timeUntilMatch: string;
  isUpcoming: boolean;
  isPast: boolean;
  isToday: boolean;
}

interface DayData {
  date: string;
  dayOfWeek: string;
  matchCount: number;
  matches: Match[];
  tournaments: string[];
  brackets: string[];
  hasMultipleTournaments: boolean;
  hasMultipleBrackets: boolean;
}

const VI_WEEKDAYS = [
  "Thứ hai",
  "Thứ ba",
  "Thứ tư",
  "Thứ năm",
  "Thứ sáu",
  "Thứ bảy",
  "Chủ nhật",
];

function formatSelectedDateVi(isoDate: string) {
  if (!isoDate) return "";
  const dt = DateTime.fromISO(isoDate);
  if (!dt.isValid) return "";

  const dayLabel = VI_WEEKDAYS[dt.weekday - 1]; // weekday: 1 = Mon ... 7 = Sun

  // 20 tháng 11
  const day = dt.toFormat("dd");
  const month = dt.toFormat("MM");

  return `${dayLabel}, ${day} tháng ${month}`;
}

// ============= MAIN COMPONENT =============
export default function MatchScheduleScreen() {
  const [selectedDate, setSelectedDate] = useState(
    DateTime.now().toISODate() || ""
  );
  const [currentMonth, setCurrentMonth] = useState(
    DateTime.now().toFormat("yyyy-MM") || ""
  );
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");
  const [showCalendarPermissionModal, setShowCalendarPermissionModal] =
    useState(false);
  const fadeAnim = useState(new Animated.Value(0))[0];
  const slideAnim = useState(new Animated.Value(50))[0];

  // Calendar hook
  const {
    hasPermission: hasCalendarPermission,
    isLoading: calendarLoading,
    addToCalendar,
    checkInCalendar,
    syncToCalendar,
    openCalendarApp,
    checkPermission,
    requestPermission,
    removeFromCalendar,
  } = useMatchCalendar();

  // Queries
  const {
    data: scheduleData,
    isLoading,
    refetch,
    isFetching,
  } = useGetMyScheduleQuery({
    startDate: DateTime.fromISO(currentMonth).startOf("month").toISODate(),
    endDate: DateTime.fromISO(currentMonth).endOf("month").toISODate(),
    timezone: "Asia/Ho_Chi_Minh",
  });

  const { data: markedDatesData, refetch: refetchMarked } =
    useGetMarkedDatesQuery({
      month: currentMonth,
      timezone: "Asia/Ho_Chi_Minh",
    });

  const { data: upcomingData } = useGetUpcomingMatchesQuery({
    days: 7,
    timezone: "Asia/Ho_Chi_Minh",
  });

  // ✅ TỰ ĐỘNG XIN QUYỀN LỊCH KHI VÀO MÀN HÌNH
  useEffect(() => {
    const requestPermission = async () => {
      const hasPermission = await checkPermission();
      if (!hasPermission) {
        // Đợi 1s rồi mới show modal để UI render xong
        setTimeout(() => {
          setShowCalendarPermissionModal(true);
        }, 1000);
      }
    };

    requestPermission();
  }, []);

  // Entrance animation
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 20,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // ✅ PREPARE MARKED DATES - HIỆN TRẬN CỦA USER
  const markedDates = useMemo(() => {
    if (!markedDatesData?.markedDates) return {};

    const marked: any = {};

    // Đánh dấu các ngày có trận
    Object.keys(markedDatesData.markedDates).forEach((dateKey) => {
      const dayData = markedDatesData.markedDates[dateKey];

      marked[dateKey] = {
        marked: true,
        dots: dayData.dots || [],
        customStyles: {
          container: {
            backgroundColor: dayData.hasLive
              ? "#FEE2E2"
              : dayData.hasUpcoming
              ? "#DBEAFE"
              : undefined,
            borderRadius: 8,
          },
          text: {
            color: dayData.hasLive
              ? "#DC2626"
              : dayData.hasUpcoming
              ? "#2563EB"
              : "#1F2937",
            fontWeight: "600",
          },
        },
      };
    });

    // Selected date
    if (selectedDate) {
      marked[selectedDate] = {
        ...marked[selectedDate],
        selected: true,
        selectedColor: "#3B82F6",
        selectedTextColor: "#FFFFFF",
      };
    }

    // Today
    const today = DateTime.now().toISODate();
    if (today && today !== selectedDate) {
      marked[today] = {
        ...marked[today],
        marked: true,
        dotColor: "#EF4444",
        customStyles: {
          ...marked[today]?.customStyles,
          container: {
            ...marked[today]?.customStyles?.container,
            borderWidth: 2,
            borderColor: "#EF4444",
          },
        },
      };
    }

    return marked;
  }, [markedDatesData, selectedDate]);

  // Get matches for selected date
  const selectedDateMatches = useMemo(() => {
    if (!scheduleData?.schedule) return [];
    const dayData = scheduleData.schedule.find(
      (d: DayData) => d.date === selectedDate
    );
    return dayData?.matches || [];
  }, [scheduleData, selectedDate]);

  // ✅ GET ALL MATCHES FOR LIST VIEW
  const allMatchesByDate = useMemo(() => {
    if (!scheduleData?.schedule) return [];
    // Chỉ lấy những ngày có trận
    return scheduleData.schedule.filter(
      (day: DayData) => day.matches.length > 0
    );
  }, [scheduleData]);

  // Handle day press
  const handleDayPress = useCallback((day: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedDate(day.dateString);
  }, []);

  // Handle month change
  const handleMonthChange = useCallback((month: any) => {
    const newMonth = `${month.year}-${String(month.month).padStart(2, "0")}`;
    setCurrentMonth(newMonth);
  }, []);

  // Toggle view mode
  const handleToggleView = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setViewMode((prev) => (prev === "calendar" ? "list" : "calendar"));
  }, []);

  // Handle sync all
  const handleSyncAll = useCallback(() => {
    if (!scheduleData?.schedule) return;

    const allMatches = scheduleData.schedule.flatMap(
      (day: DayData) => day.matches
    );
    const upcomingMatches = allMatches.filter((m: Match) => m.isUpcoming);

    if (upcomingMatches.length === 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert("Thông báo", "Không có trận sắp tới để đồng bộ");
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      "📅 Đồng bộ lịch",
      `Thêm ${upcomingMatches.length} trận sắp tới vào lịch hệ thống?\n\n✓ Nhắc nhở tự động trước trận\n✓ Đồng bộ trên mọi thiết bị\n✓ Xem trong Calendar app`,
      [
        {
          text: "Hủy",
          style: "cancel",
          onPress: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
        },
        {
          text: "✨ Đồng bộ",
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            await syncToCalendar(upcomingMatches);
            refetchMarked();
          },
        },
      ]
    );
  }, [scheduleData, syncToCalendar, refetchMarked]);

  // Handle calendar permission request
  const handleRequestCalendarPermission = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowCalendarPermissionModal(false);

    // ✅ GỌI requestPermission() THAY VÌ checkPermission()
    const granted = await requestPermission();

    if (granted) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "Đã cấp quyền!",
        "Bạn có thể thêm trận đấu vào lịch hệ thống ngay bây giờ.",
        [{ text: "Đóng" }]
      );
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        "❌ Chưa cấp quyền",
        "Bạn cần cấp quyền truy cập lịch để sử dụng tính năng này.\n\nVui lòng vào Cài đặt > Quyền riêng tư > Lịch và bật quyền cho ứng dụng.",
        [
          { text: "Đóng", style: "cancel" },
          {
            text: "Mở Cài đặt",
            onPress: () => {
              // Import Linking nếu chưa có
              Linking.openSettings();
            },
          },
        ]
      );
    }
  }, [requestPermission]);

  return (
    <AuthGuard>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#1E40AF" />

        {/* Animated Container */}
        <Animated.View
          style={{
            flex: 1,
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          }}
        >
          {/* Header with Gradient */}
          <LinearGradient
            colors={["#1E40AF", "#3B82F6", "#60A5FA"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.header}
          >
            <View style={styles.headerContent}>
              <View style={styles.headerTop}>
                <View style={styles.headerLeft}>
                  <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.back();
                    }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="chevron-back" size={24} color="#FFF" />
                  </TouchableOpacity>

                  <View>
                    <Text style={styles.headerTitle}>Lịch Thi Đấu</Text>
                    <Text style={styles.headerSubtitle}>
                      Tháng{" "}
                      {DateTime.fromISO(currentMonth)
                        .setLocale("vi")
                        .toFormat("MM yyyy")}
                    </Text>
                  </View>
                </View>

                <View style={styles.headerActions}>
                  {/* Sync all */}
                  <TouchableOpacity
                    style={styles.headerIconButton}
                    onPress={handleSyncAll}
                    disabled={calendarLoading || !hasCalendarPermission}
                  >
                    <Icon
                      name="calendar-sync"
                      size={22}
                      color={
                        hasCalendarPermission ? "#FFF" : "rgba(255,255,255,0.4)"
                      }
                    />
                  </TouchableOpacity>

                  {/* Open calendar */}
                  <TouchableOpacity
                    style={styles.headerIconButton}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      openCalendarApp();
                    }}
                  >
                    <Icon
                      name="calendar-month-outline"
                      size={22}
                      color="#FFF"
                    />
                  </TouchableOpacity>

                  {/* Toggle view */}
                  <TouchableOpacity
                    style={[
                      styles.headerIconButton,
                      styles.headerIconButtonActive,
                    ]}
                    onPress={handleToggleView}
                  >
                    <Icon
                      name={viewMode === "calendar" ? "view-list" : "calendar"}
                      size={22}
                      color="#FFF"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Stats row */}
              {scheduleData?.summary && (
                <View style={styles.statsRow}>
                  <StatPill
                    icon="calendar-check"
                    label="Tổng"
                    value={scheduleData.summary.totalMatches}
                    color="#10B981"
                  />
                  <StatPill
                    icon="clock-outline"
                    label="Sắp tới"
                    value={scheduleData.summary.upcomingMatches}
                    color="#F59E0B"
                  />
                  <StatPill
                    icon="play-circle"
                    label="Live"
                    value={scheduleData.summary.liveMatches}
                    color="#EF4444"
                  />
                </View>
              )}
            </View>
          </LinearGradient>

          {/* Permission Banner */}
          {!hasCalendarPermission && (
            <TouchableOpacity
              style={styles.permissionBanner}
              onPress={handleRequestCalendarPermission}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={["#FEF3C7", "#FDE68A"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.permissionBannerGradient}
              >
                <Icon name="calendar-alert" size={20} color="#92400E" />
                <Text style={styles.permissionText}>
                  Cấp quyền lịch để thêm trận vào lịch hệ thống
                </Text>
                <Icon name="chevron-right" size={20} color="#92400E" />
              </LinearGradient>
            </TouchableOpacity>
          )}

          <ScrollView
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isFetching}
                onRefresh={refetch}
                tintColor="#3B82F6"
                colors={["#3B82F6"]}
              />
            }
          >
            {viewMode === "calendar" ? (
              <>
                {/* Calendar */}
                <View style={styles.calendarCard}>
                  <Calendar
                    current={selectedDate}
                    onDayPress={handleDayPress}
                    onMonthChange={handleMonthChange}
                    markedDates={markedDates}
                    markingType="multi-dot"
                    theme={calendarTheme}
                    enableSwipeMonths
                    hideExtraDays={false}
                    monthFormat={"MMMM yyyy"} // dùng monthNames tiếng Việt
                    firstDay={1} // tuỳ, cho tuần bắt đầu từ Thứ 2
                    style={styles.calendar}
                  />
                </View>

                {/* Selected Date Matches */}
                <View style={styles.selectedDateSection}>
                  <View style={styles.sectionHeader}>
                    <View style={styles.sectionTitleRow}>
                      <Icon name="calendar-today" size={22} color="#1F2937" />
                      <Text style={styles.sectionTitle}>
                        {formatSelectedDateVi(selectedDate)}
                      </Text>
                    </View>
                    {selectedDateMatches.length > 0 && (
                      <View style={styles.countBadge}>
                        <Text style={styles.countBadgeText}>
                          {selectedDateMatches.length}
                        </Text>
                      </View>
                    )}
                  </View>

                  {isLoading ? (
                    <SkeletonLoader />
                  ) : selectedDateMatches.length === 0 ? (
                    <EmptyState
                      icon="calendar-blank-outline"
                      title="Không có trận đấu"
                      subtitle="Chọn ngày khác để xem lịch thi đấu"
                    />
                  ) : (
                    selectedDateMatches.map((match: Match, index: number) => (
                      <EnhancedMatchCard
                        key={match._id}
                        match={match}
                        index={index}
                        onPress={() => {
                          Haptics.impactAsync(
                            Haptics.ImpactFeedbackStyle.Light
                          );
                          router.push({
                            pathname: `/match/${match._id}/home`,
                            params: { isBack: true },
                          });
                        }}
                        onAddToCalendar={addToCalendar}
                        checkInCalendar={checkInCalendar}
                        hasCalendarPermission={hasCalendarPermission}
                        openCalendarApp={openCalendarApp}
                        onRemoveFromCalendar={removeFromCalendar}
                      />
                    ))
                  )}
                </View>
              </>
            ) : (
              /* ✅ LIST VIEW - FIXED */
              <View style={styles.listViewContainer}>
                {isLoading ? (
                  <SkeletonLoader />
                ) : allMatchesByDate.length === 0 ? (
                  <EmptyState
                    icon="calendar-remove-outline"
                    title="Chưa có lịch thi đấu"
                    subtitle="Bạn chưa có trận đấu nào được xếp lịch"
                  />
                ) : (
                  allMatchesByDate.map((day: DayData, dayIndex: number) => (
                    <DaySection
                      key={day.date}
                      dayData={day}
                      dayIndex={dayIndex}
                      onMatchPress={(matchId: string) => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        router.push({
                          pathname: `/match/${matchId}/home`,
                          params: { isBack: true },
                        });
                      }}
                      onAddToCalendar={addToCalendar}
                      checkInCalendar={checkInCalendar}
                      hasCalendarPermission={hasCalendarPermission}
                      openCalendarApp={openCalendarApp}
                      onRemoveFromCalendar={removeFromCalendar}
                    />
                  ))
                )}
              </View>
            )}

            {/* Upcoming Matches Quick View */}
            {upcomingData?.matches &&
              upcomingData.matches.length > 0 &&
              viewMode === "calendar" && (
                <View style={styles.upcomingSection}>
                  <View style={styles.upcomingSectionHeader}>
                    <LinearGradient
                      colors={["#FEE2E2", "#FEF2F2"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.upcomingHeaderGradient}
                    >
                      <Icon name="fire" size={20} color="#DC2626" />
                      <Text style={styles.upcomingSectionTitle}>
                        Sắp diễn ra (7 ngày tới)
                      </Text>
                    </LinearGradient>
                  </View>

                  {upcomingData.matches
                    .slice(0, 3)
                    .map((match: any, index: number) => (
                      <CompactMatchCard
                        key={match._id}
                        match={match}
                        index={index}
                        onPress={() => {
                          Haptics.impactAsync(
                            Haptics.ImpactFeedbackStyle.Light
                          );
                          router.push({
                            pathname: `/match/${match._id}/home`,
                            params: { isBack: true },
                          });
                        }}
                      />
                    ))}

                  {upcomingData.matches.length > 3 && (
                    <TouchableOpacity
                      style={styles.viewAllButton}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        handleToggleView();
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.viewAllText}>
                        Xem tất cả {upcomingData.matches.length} trận
                      </Text>
                      <Icon name="arrow-right" size={18} color="#3B82F6" />
                    </TouchableOpacity>
                  )}
                </View>
              )}

            <View style={{ height: 40 }} />
          </ScrollView>
        </Animated.View>

        {/* Calendar Permission Modal */}
        {showCalendarPermissionModal && (
          <CalendarPermissionModal
            visible={showCalendarPermissionModal}
            onClose={() => setShowCalendarPermissionModal(false)}
            onRequestPermission={handleRequestCalendarPermission}
          />
        )}
      </View>
    </AuthGuard>
  );
}

// ============= SUB-COMPONENTS =============

// Stat Pill
const StatPill = ({ icon, label, value, color }: any) => (
  <View style={styles.statPill}>
    <Icon name={icon} size={16} color={color} />
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

// Enhanced Match Card
const EnhancedMatchCard = ({
  match,
  index,
  onPress,
  onAddToCalendar,
  checkInCalendar,
  hasCalendarPermission,
  openCalendarApp, // 👈 thêm prop này
  onRemoveFromCalendar,
}: any) => {
  const [inCalendar, setInCalendar] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const scaleAnim = useState(new Animated.Value(0))[0];
  useEffect(() => {
    // Entrance animation
    Animated.spring(scaleAnim, {
      toValue: 1,
      delay: index * 50,
      tension: 50,
      friction: 7,
      useNativeDriver: true,
    }).start();

    checkStatus();
  }, [match._id]);

  const checkStatus = async () => {
    const status = await checkInCalendar(match._id);
    setInCalendar(status);
  };

  const handleCalendarPress = async () => {
    if (isAdding) return;

    // Nếu đã nằm trong lịch rồi -> mở Calendar đúng giờ trận
    if (inCalendar) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      if (openCalendarApp) {
        const targetDate = new Date(match.scheduledAt);
        try {
          await openCalendarApp(targetDate);
        } catch (e) {
          console.log("openCalendarApp error:", e);
        }
      }

      return;
    }

    // Chưa trong lịch -> thêm rồi mở Calendar
    setIsAdding(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const success = await onAddToCalendar(match);
    if (success) {
      setInCalendar(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (openCalendarApp) {
        const targetDate = new Date(match.scheduledAt);
        try {
          await openCalendarApp(targetDate);
        } catch (e) {
          console.log("openCalendarApp error:", e);
        }
      }
    }

    setIsAdding(false);
  };

  const handleRemoveFromCalendar = async () => {
    if (!onRemoveFromCalendar || isRemoving) return;

    setIsRemoving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const ok = await onRemoveFromCalendar(match?._id);
      if (ok) {
        setInCalendar(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (e) {
      console.log("removeFromCalendar error:", e);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }

    setIsRemoving(false);
  };

  const status = getStatusConfig(match.status);
  const bracketColor = match.bracket.color || "#6B7280";

  return (
    <Animated.View
      style={[
        styles.enhancedMatchCard,
        {
          transform: [
            {
              scale: scaleAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.9, 1],
              }),
            },
          ],
          opacity: scaleAnim,
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onPress}
        style={styles.matchCardTouchable}
      >
        {/* Header with gradient background */}
        <LinearGradient
          colors={status.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.matchCardHeader}
        >
          <View style={styles.matchTimeRow}>
            <View style={styles.timeBadge}>
              <Icon name="clock-outline" size={16} color="#1F2937" />
              <Text style={styles.matchTime}>{match.localScheduledTime}</Text>
            </View>
            <View
              style={[styles.statusBadge, { backgroundColor: status.color }]}
            >
              <Icon name={status.icon} size={12} color="#FFF" />
              <Text style={styles.statusText}>{status.label}</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Content */}
        <View style={styles.matchCardContent}>
          {/* Tournament info */}
          <View style={styles.tournamentRow}>
            <View style={styles.tournamentInfo}>
              <Text style={styles.tournamentName} numberOfLines={1}>
                {match.tournament.name}
              </Text>
              <View style={styles.bracketRow}>
                <View
                  style={[styles.bracketDot, { backgroundColor: bracketColor }]}
                />
                <Text style={styles.bracketText} numberOfLines={1}>
                  {match.bracket.name}
                </Text>
              </View>
            </View>
          </View>

          {/* Teams */}
          <View style={styles.teamsSection}>
            <TeamRow
              team={match.myTeam}
              label="Tôi"
              icon="account-group"
              iconColor="#3B82F6"
              isHighlight={match.mySide === "A"}
              isWinner={match.winner === match.mySide}
            />

            <View style={styles.vsContainer}>
              <Text style={styles.vsText}>VS</Text>
            </View>

            <TeamRow
              team={match.opponentTeam}
              label="Đối thủ"
              icon="shield-account"
              iconColor="#EF4444"
              isHighlight={match.mySide === "B"}
              isWinner={match.winner && match.winner !== match.mySide}
            />
          </View>

          {/* Footer */}
          <View style={styles.matchCardFooter}>
            <View style={styles.matchMetaRow}>
              {match.courtLabel && (
                <View style={styles.metaBadge}>
                  <Icon name="map-marker" size={14} color="#6B7280" />
                  <Text style={styles.metaText}>{match.courtLabel}</Text>
                </View>
              )}
              {match.isUpcoming && (
                <View style={[styles.metaBadge, styles.metaBadgeWarning]}>
                  <Icon name="timer-sand" size={14} color="#D97706" />
                  <Text style={styles.metaTextWarning}>
                    {match.timeUntilMatch}
                  </Text>
                </View>
              )}
            </View>

            {/* Calendar button */}
            {match.isUpcoming && hasCalendarPermission && (
              <View style={styles.calendarActions}>
                {/* Nút thêm / mở lịch */}
                <TouchableOpacity
                  style={[
                    styles.calendarBtn,
                    inCalendar && styles.calendarBtnActive,
                  ]}
                  onPress={handleCalendarPress}
                  disabled={isAdding || isRemoving}
                  activeOpacity={0.7}
                >
                  {isAdding ? (
                    <ActivityIndicator size="small" color="#3B82F6" />
                  ) : (
                    <>
                      <Icon
                        name={inCalendar ? "calendar-check" : "calendar-plus"}
                        size={16}
                        color={inCalendar ? "#10B981" : "#3B82F6"}
                      />
                      <Text
                        style={[
                          styles.calendarBtnText,
                          inCalendar && styles.calendarBtnTextActive,
                        ]}
                      >
                        {inCalendar ? "Trong lịch" : "Thêm lịch"}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                {/* Nút xoá đặt lịch (icon-only) */}
                {inCalendar && onRemoveFromCalendar && (
                  <TouchableOpacity
                    style={styles.calendarDeleteBtn}
                    onPress={handleRemoveFromCalendar}
                    disabled={isRemoving}
                    activeOpacity={0.7}
                  >
                    {isRemoving ? (
                      <ActivityIndicator size="small" color="#EF4444" />
                    ) : (
                      <Icon name="calendar-remove" size={18} color="#EF4444" />
                    )}
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          {/* Scores */}
          {match.gameScores && match.gameScores.length > 0 && (
            <View style={styles.scoresRow}>
              {match.gameScores.map((game: any, idx: number) => (
                <View key={idx} style={styles.scoreChip}>
                  <Text style={styles.scoreText}>
                    {game.a} - {game.b}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

// Team Row Component
const TeamRow = ({
  team,
  label,
  icon,
  iconColor,
  isHighlight,
  isWinner,
}: any) => (
  <View style={[styles.teamRow, isHighlight && styles.teamRowHighlight]}>
    <View style={styles.teamLeft}>
      <Icon name={icon} size={16} color={iconColor} />
      <Text style={styles.teamLabel}>{label}</Text>
    </View>
    <Text style={styles.teamNameText} numberOfLines={1}>
      {getTeamName(team)}
    </Text>
    {isWinner && <Icon name="trophy" size={16} color="#F59E0B" />}
  </View>
);

// Compact Match Card
const CompactMatchCard = ({ match, index, onPress }: any) => {
  const scaleAnim = useState(new Animated.Value(0))[0];

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      delay: index * 80,
      tension: 50,
      friction: 7,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View
      style={{
        transform: [{ scale: scaleAnim }],
        opacity: scaleAnim,
      }}
    >
      <TouchableOpacity
        style={styles.compactCard}
        onPress={onPress}
        activeOpacity={0.8}
      >
        <View style={styles.compactLeft}>
          <Text style={styles.compactDate}>
            {DateTime.fromJSDate(new Date(match.scheduledAt)).toFormat("dd/MM")}
          </Text>
          <Text style={styles.compactTime}>
            {DateTime.fromJSDate(new Date(match.scheduledAt)).toFormat("HH:mm")}
          </Text>
        </View>

        <View style={styles.compactCenter}>
          <Text style={styles.compactTournament} numberOfLines={1}>
            {match.tournament?.name}
          </Text>
          <Text style={styles.compactBracket} numberOfLines={1}>
            {match.bracket?.name}
          </Text>
        </View>

        <View style={styles.compactRight}>
          <View style={styles.compactTimeBadge}>
            <Icon name="clock-fast" size={12} color="#D97706" />
            <Text style={styles.compactTimeText}>{match.timeUntilMatch}</Text>
          </View>
          <Icon name="chevron-right" size={18} color="#9CA3AF" />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

// Day Section (List View)
const DaySection = ({
  dayData,
  dayIndex,
  onMatchPress,
  onAddToCalendar,
  checkInCalendar,
  hasCalendarPermission,
  openCalendarApp,
  onRemoveFromCalendar,
}: any) => {
  const isToday = dayData.date === DateTime.now().toISODate();
  const fadeAnim = useState(new Animated.Value(0))[0];
  const dt = DateTime.fromISO(dayData.date);
  const weekdayLabel =
    dt.isValid && dt.weekday >= 1 && dt.weekday <= 7
      ? VI_WEEKDAYS[dt.weekday - 1]
      : dayData.date;
  const monthLabel = dt.isValid ? `Thg ${dt.toFormat("M")}` : "";
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      delay: dayIndex * 100,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View style={[styles.daySection, { opacity: fadeAnim }]}>
      {/* Day Header */}
      <View style={styles.daySectionHeader}>
        <View style={styles.dayHeaderLeft}>
          <View style={[styles.dayBadge, isToday && styles.dayBadgeToday]}>
            <Text style={[styles.dayNumber, isToday && styles.dayNumberToday]}>
              {dt.toFormat("dd")}
            </Text>
            <Text style={[styles.dayMonth, isToday && styles.dayMonthToday]}>
              {monthLabel}
            </Text>
          </View>
          <View style={styles.dayInfo}>
            <Text style={[styles.dayTitle, isToday && styles.dayTitleToday]}>
              {weekdayLabel}
              {isToday && " • Hôm nay"}
            </Text>
            <Text style={styles.daySubtitle} numberOfLines={1}>
              {dayData.tournaments.join(", ")}
            </Text>
          </View>
        </View>
        <View style={styles.dayCountBadge}>
          <Text style={styles.dayCountText}>{dayData.matchCount}</Text>
        </View>
      </View>

      {/* Matches */}
      {dayData.matches.map((match: Match, matchIndex: number) => (
        <EnhancedMatchCard
          key={match._id}
          match={match}
          index={matchIndex}
          onPress={() => onMatchPress(match._id)}
          onAddToCalendar={onAddToCalendar}
          checkInCalendar={checkInCalendar}
          hasCalendarPermission={hasCalendarPermission}
          openCalendarApp={openCalendarApp}
          onRemoveFromCalendar={onRemoveFromCalendar}
        />
      ))}
    </Animated.View>
  );
};

// Empty State
const EmptyState = ({ icon, title, subtitle }: any) => (
  <View style={styles.emptyState}>
    <View style={styles.emptyIconContainer}>
      <Icon name={icon} size={64} color="#D1D5DB" />
    </View>
    <Text style={styles.emptyTitle}>{title}</Text>
    <Text style={styles.emptySubtitle}>{subtitle}</Text>
  </View>
);

// Skeleton Loader
const SkeletonLoader = () => (
  <View style={styles.skeletonContainer}>
    {[1, 2].map((i) => (
      <View key={i} style={styles.skeletonCard}>
        <View style={styles.skeletonHeader} />
        <View style={styles.skeletonLine} />
        <View style={[styles.skeletonLine, { width: "70%" }]} />
        <View style={styles.skeletonFooter} />
      </View>
    ))}
  </View>
);

// Calendar Permission Modal
const CalendarPermissionModal = ({
  visible,
  onClose,
  onRequestPermission,
}: any) => {
  const [isRequesting, setIsRequesting] = useState(false);

  if (!visible) return null;

  const handleRequest = async () => {
    setIsRequesting(true);
    await onRequestPermission();
    setIsRequesting(false);
  };

  return (
    <View style={styles.modalOverlay}>
      <TouchableOpacity
        style={styles.modalBackdrop}
        activeOpacity={1}
        onPress={onClose}
      />
      <View style={styles.modalContent}>
        <LinearGradient
          colors={["#DBEAFE", "#EFF6FF"]}
          style={styles.modalHeader}
        >
          <Icon name="calendar-star" size={48} color="#3B82F6" />
          <Text style={styles.modalTitle}>Cấp quyền truy cập lịch</Text>
          <Text style={styles.modalSubtitle}>
            Để thêm trận đấu vào lịch hệ thống và nhận nhắc nhở tự động
          </Text>
        </LinearGradient>

        <View style={styles.modalBody}>
          <FeatureItem
            icon="bell-ring"
            title="Nhắc nhở tự động"
            subtitle="Trước 24h, 1h, 30m, 15m"
          />
          <FeatureItem
            icon="sync"
            title="Đồng bộ đa thiết bị"
            subtitle="iCloud, Google Calendar"
          />
          <FeatureItem
            icon="calendar-check"
            title="Xem mọi lúc"
            subtitle="Trong ứng dụng Lịch"
          />
        </View>

        <View style={styles.modalFooter}>
          <TouchableOpacity
            style={styles.modalButtonSecondary}
            onPress={onClose}
            activeOpacity={0.8}
            disabled={isRequesting}
          >
            <Text style={styles.modalButtonSecondaryText}>Để sau</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.modalButtonPrimary,
              isRequesting && { opacity: 0.6 },
            ]}
            onPress={handleRequest}
            activeOpacity={0.8}
            disabled={isRequesting}
          >
            <LinearGradient
              colors={["#3B82F6", "#2563EB"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.modalButtonPrimaryGradient}
            >
              {isRequesting ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Icon name="check-circle" size={20} color="#FFF" />
                  <Text style={styles.modalButtonPrimaryText}>Cấp quyền</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

// Feature Item for Modal
const FeatureItem = ({ icon, title, subtitle }: any) => (
  <View style={styles.featureItem}>
    <View style={styles.featureIcon}>
      <Icon name={icon} size={24} color="#3B82F6" />
    </View>
    <View style={styles.featureText}>
      <Text style={styles.featureTitle}>{title}</Text>
      <Text style={styles.featureSubtitle}>{subtitle}</Text>
    </View>
  </View>
);

// ============= HELPER FUNCTIONS =============

function getStatusConfig(status: string) {
  const configs: Record<string, any> = {
    scheduled: {
      label: "Đã lên lịch",
      color: "#3B82F6",
      icon: "calendar-clock",
      gradient: ["#DBEAFE", "#EFF6FF"],
    },
    queued: {
      label: "Chờ xếp",
      color: "#F59E0B",
      icon: "clock-outline",
      gradient: ["#FEF3C7", "#FEF9E6"],
    },
    assigned: {
      label: "Đã xếp sân",
      color: "#8B5CF6",
      icon: "map-marker-check",
      gradient: ["#EDE9FE", "#F5F3FF"],
    },
    live: {
      label: "Đang đấu",
      color: "#EF4444",
      icon: "play-circle",
      gradient: ["#FEE2E2", "#FEF2F2"],
    },
    finished: {
      label: "Kết thúc",
      color: "#6B7280",
      icon: "check-circle",
      gradient: ["#F3F4F6", "#F9FAFB"],
    },
  };
  return configs[status] || configs.scheduled;
}

function getTeamName(team: any): string {
  if (!team) return "TBA";
  if (team.teamName) return team.teamName;

  const p1 = team.player1?.nickname || team.player1?.name || "";
  const p2 = team.player2?.nickname || team.player2?.name || "";

  if (p1 && p2) return `${p1} / ${p2}`;
  return p1 || p2 || "TBA";
}

// ============= CALENDAR THEME =============
const calendarTheme = {
  backgroundColor: "transparent",
  calendarBackground: "transparent",
  textSectionTitleColor: "#6B7280",
  selectedDayBackgroundColor: "#3B82F6",
  selectedDayTextColor: "#FFFFFF",
  todayTextColor: "#EF4444",
  dayTextColor: "#1F2937",
  textDisabledColor: "#D1D5DB",
  dotColor: "#3B82F6",
  selectedDotColor: "#FFFFFF",
  arrowColor: "#3B82F6",
  monthTextColor: "#1F2937",
  indicatorColor: "#3B82F6",
  textDayFontFamily: "System",
  textMonthFontFamily: "System",
  textDayHeaderFontFamily: "System",
  textDayFontWeight: "600" as const,
  textMonthFontWeight: "bold" as const,
  textDayHeaderFontWeight: "600" as const,
  textDayFontSize: 15,
  textMonthFontSize: 18,
  textDayHeaderFontSize: 12,
};

// ============= STYLES (PHẦN 1) =============
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  scrollView: {
    flex: 1,
  },

  // Header
  header: {
    paddingTop:
      Platform.OS === "ios" ? 50 : (StatusBar.currentHeight || 0) + 10,
    paddingBottom: 20,
  },
  headerContent: {
    paddingHorizontal: 20,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#FFF",
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 15,
    color: "rgba(255,255,255,0.8)",
    fontWeight: "500",
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerIconButtonActive: {
    backgroundColor: "rgba(255,255,255,0.3)",
  },

  // Stats Row
  statsRow: {
    flexDirection: "row",
    gap: 10,
  },
  statPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.25)",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backdropFilter: "blur(10px)",
  },
  statValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFF",
  },
  statLabel: {
    fontSize: 12,
    color: "rgba(255,255,255,0.9)",
    fontWeight: "500",
  },

  // Permission Banner
  permissionBanner: {
    marginHorizontal: 16,
    marginTop: -10,
    marginBottom: 16,
    borderRadius: 12,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  permissionBannerGradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  permissionText: {
    flex: 1,
    fontSize: 14,
    color: "#92400E",
    fontWeight: "600",
  },

  // Calendar Card
  calendarCard: {
    backgroundColor: "#FFF",
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
      },
      android: {
        elevation: 5,
      },
    }),
  },
  calendar: {
    borderRadius: 16,
    padding: 10,
  },

  // Selected Date Section
  selectedDateSection: {
    paddingHorizontal: 16,
    marginTop: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1F2937",
  },
  countBadge: {
    backgroundColor: "#3B82F6",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    minWidth: 32,
    alignItems: "center",
  },
  countBadgeText: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#FFF",
  },

  // Enhanced Match Card
  enhancedMatchCard: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    marginBottom: 16,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  matchCardTouchable: {
    overflow: "hidden",
  },
  matchCardHeader: {
    padding: 14,
  },
  matchTimeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  timeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.95)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  matchTime: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1F2937",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFF",
  },

  // Match Card Content
  matchCardContent: {
    padding: 16,
  },
  tournamentRow: {
    marginBottom: 14,
  },
  tournamentInfo: {
    flex: 1,
  },
  tournamentName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1F2937",
    marginBottom: 6,
  },
  bracketRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  bracketDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  bracketText: {
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "600",
  },

  // Teams Section
  teamsSection: {
    marginBottom: 14,
  },
  teamRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#F9FAFB",
  },
  teamRowHighlight: {
    backgroundColor: "#EFF6FF",
    borderWidth: 2,
    borderColor: "#BFDBFE",
  },
  teamLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 80,
  },
  teamLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  teamNameText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: "#1F2937",
  },
  vsContainer: {
    alignItems: "center",
    paddingVertical: 6,
  },
  vsText: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#9CA3AF",
    letterSpacing: 2,
  },

  // Match Card Footer
  matchCardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  matchMetaRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  metaBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  metaBadgeWarning: {
    backgroundColor: "#FEF3C7",
  },
  metaText: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "600",
  },
  metaTextWarning: {
    fontSize: 12,
    color: "#D97706",
    fontWeight: "700",
  },

  // Calendar Button
  calendarBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
  },
  calendarBtnActive: {
    borderColor: "#86EFAC",
    backgroundColor: "#D1FAE5",
  },
  calendarBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#3B82F6",
  },
  calendarBtnTextActive: {
    color: "#10B981",
  },

  // Scores Row
  scoresRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  scoreChip: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
  },
  scoreText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1F2937",
  },

  // Compact Card
  compactCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFF",
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  compactLeft: {
    alignItems: "center",
    paddingRight: 12,
    borderRightWidth: 2,
    borderRightColor: "#E5E7EB",
  },
  compactDate: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1F2937",
  },
  compactTime: {
    fontSize: 13,
    fontWeight: "600",
    color: "#3B82F6",
    marginTop: 2,
  },
  compactCenter: {
    flex: 1,
  },
  compactTournament: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1F2937",
    marginBottom: 4,
  },
  compactBracket: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "500",
  },
  compactRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  compactTimeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  compactTimeText: {
    fontSize: 11,
    color: "#D97706",
    fontWeight: "700",
  },

  // List View Container
  listViewContainer: {
    paddingTop: 16,
    paddingHorizontal: 16,
  },

  // Day Section
  daySection: {
    marginBottom: 28,
  },
  daySectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    paddingBottom: 14,
    borderBottomWidth: 3,
    borderBottomColor: "#E5E7EB",
  },
  dayHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    flex: 1,
  },
  dayBadge: {
    backgroundColor: "#3B82F6",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: "center",
    minWidth: 60,
  },
  dayBadgeToday: {
    backgroundColor: "#EF4444",
  },
  dayNumber: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFF",
  },
  dayNumberToday: {
    color: "#FFF",
  },
  dayMonth: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFF",
    textTransform: "uppercase",
    marginTop: 2,
    letterSpacing: 0.5,
  },
  dayMonthToday: {
    color: "#FFF",
  },
  dayInfo: {
    flex: 1,
  },
  dayTitle: {
    fontSize: 19,
    fontWeight: "bold",
    color: "#1F2937",
    marginBottom: 3,
  },
  dayTitleToday: {
    color: "#EF4444",
  },
  daySubtitle: {
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "500",
  },
  dayCountBadge: {
    backgroundColor: "#3B82F6",
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  dayCountText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#FFF",
  },

  // Upcoming Section
  upcomingSection: {
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 10,
  },
  upcomingSectionHeader: {
    marginBottom: 14,
    borderRadius: 12,
    overflow: "hidden",
  },
  upcomingHeaderGradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  upcomingSectionTitle: {
    fontSize: 17,
    fontWeight: "bold",
    color: "#DC2626",
  },
  viewAllButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    marginTop: 10,
    borderRadius: 12,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  viewAllText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#3B82F6",
  },

  // Empty State
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#6B7280",
    marginBottom: 8,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 15,
    color: "#9CA3AF",
    textAlign: "center",
    lineHeight: 22,
  },

  // Skeleton Loader
  skeletonContainer: {
    padding: 16,
  },
  skeletonCard: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  skeletonHeader: {
    height: 20,
    backgroundColor: "#E5E7EB",
    borderRadius: 10,
    marginBottom: 12,
  },
  skeletonLine: {
    height: 16,
    backgroundColor: "#E5E7EB",
    borderRadius: 8,
    marginBottom: 8,
  },
  skeletonFooter: {
    height: 40,
    backgroundColor: "#E5E7EB",
    borderRadius: 10,
    marginTop: 12,
  },

  // Modal
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: height * 0.85,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.25,
        shadowRadius: 16,
      },
      android: {
        elevation: 16,
      },
    }),
  },
  modalHeader: {
    alignItems: "center",
    paddingTop: 32,
    paddingHorizontal: 24,
    paddingBottom: 24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1F2937",
    marginTop: 16,
    marginBottom: 8,
    textAlign: "center",
  },
  modalSubtitle: {
    fontSize: 15,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 22,
  },
  modalBody: {
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 4,
  },
  featureSubtitle: {
    fontSize: 14,
    color: "#6B7280",
  },
  modalFooter: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  modalButtonSecondary: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#E5E7EB",
    alignItems: "center",
  },
  modalButtonSecondaryText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#6B7280",
  },
  modalButtonPrimary: {
    flex: 2,
    borderRadius: 12,
    overflow: "hidden",
  },
  modalButtonPrimaryGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
  },
  modalButtonPrimaryText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFF",
  },
  calendarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  calendarDeleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.35)",
  },
});
