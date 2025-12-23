// app/matches/live-setup/index.tsx
import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Switch,
  Platform,
  Pressable,
  useColorScheme,
  Modal,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { Stack, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "@react-navigation/native";
import * as Device from "expo-device";
import { Image } from "expo-image";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

// 🔹 Import API slices & Utils (Chỉnh lại path nếu cần)
import { useGetFacebookPagesQuery } from "@/slices/facebookApiSlice";
import { normalizeUrl } from "@/utils/normalizeUri";
import { useGetMyUserMatchesQuery } from "@/slices/userMatchesApiSlice";

// ==========================================
// CẤU HÌNH & HELPER
// ==========================================

const RESOLUTION_PRESETS = [
  { id: "1080p30", label: "1080p 30fps", minGB: 6 },
  { id: "720p30", label: "720p 30fps", minGB: 4 },
  { id: "480p30", label: "480p 30fps", minGB: 2 },
];

const THEME_COLORS = {
  light: {
    background: "#ffffff",
    text: "#111827",
    subText: "#6b7280",
    inputBg: "#f9fafb",
    inputBorder: "#e5e7eb",
    cardBg: "#ffffff",
    divider: "#e5e7eb",
    placeholder: "#9ca3af",
    activeItemBg: "#eff6ff",
    activeItemText: "#1d4ed8",
    warningBg: "#fff7e6",
    warningBorder: "#ffe4b5",
    warningText: "#92400e",
    headerBg: "#ffffff",
    headerTint: "#000000",
  },
  dark: {
    background: "#121212",
    text: "#f9fafb",
    subText: "#9ca3af",
    inputBg: "#1f2937",
    inputBorder: "#374151",
    cardBg: "#1f2937",
    divider: "#374151",
    placeholder: "#6b7280",
    activeItemBg: "#1e3a8a",
    activeItemText: "#60a5fa",
    warningBg: "#451a03",
    warningBorder: "#78350f",
    warningText: "#fcd34d",
    headerBg: "#121212",
    headerTint: "#ffffff",
  },
};

type TournamentLite = {
  _id?: string;
  id?: string;
  name?: string;
  title?: string;
  tournamentName?: string;
  cover?: string;
  coverUrl?: string;
  banner?: string;
  image?: string;
  startAt?: string;
  startDate?: string;
  createdAt?: string;
  location?: { name?: string };
  locationName?: string;
  status?: string;
};

function getTournamentId(t: TournamentLite) {
  return String(t?._id || t?.id || "");
}
function getTournamentName(t: TournamentLite) {
  return t?.name || t?.title || t?.tournamentName || "Giải đấu (không tên)";
}
function getTournamentCover(t: TournamentLite) {
  return t?.coverUrl || t?.cover || t?.banner || t?.image || "";
}
function getTournamentLocation(t: TournamentLite) {
  return t?.location?.name || t?.locationName || "";
}
function formatDateTime(value?: string) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

// ==========================================
// MAIN COMPONENT
// ==========================================
export default function UserMatchLiveSetupScreen() {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets(); // ✅ Lấy safe area để xử lý footer
  const isDark = colorScheme === "dark";
  const theme = THEME_COLORS[isDark ? "dark" : "light"];

  // State Form
  const [selectedResolutionId, setSelectedResolutionId] = useState<
    string | null
  >(null);
  const [recommendedResolutionId, setRecommendedResolutionId] = useState<
    string | null
  >(null);
  const [isResolutionOpen, setIsResolutionOpen] = useState(false);

  const [courtName, setCourtName] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [waitReferee, setWaitReferee] = useState(false);
  const [batterySaving, setBatterySaving] = useState(true);

  // Facebook Pages
  const {
    data: pages = [],
    isLoading: pagesLoading,
    refetch: refetchPages,
  } = useGetFacebookPagesQuery(undefined, {
    refetchOnMountOrArgChange: true,
  });

  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [isPageSelectOpen, setIsPageSelectOpen] = useState(false);
  const hasAnyPage = pages && pages.length > 0;

  useFocusEffect(
    useCallback(() => {
      refetchPages();
    }, [refetchPages])
  );

  // Auto detect resolution
  useEffect(() => {
    const totalMemBytes = Device.totalMemory || 0;
    const totalGB = totalMemBytes / 1024 / 1024 / 1024;

    let best = RESOLUTION_PRESETS[RESOLUTION_PRESETS.length - 1];
    for (const preset of [...RESOLUTION_PRESETS].sort(
      (a, b) => b.minGB - a.minGB
    )) {
      if (!preset.minGB || totalGB >= preset.minGB) {
        best = preset;
        break;
      }
    }
    setRecommendedResolutionId(best.id);
    setSelectedResolutionId((prev) => prev || best.id);
  }, []);

  const selectedResolution =
    RESOLUTION_PRESETS.find((p) => p.id === selectedResolutionId) ||
    RESOLUTION_PRESETS[0];

  // Sync Default Page
  useEffect(() => {
    if (!hasAnyPage) {
      setSelectedPageId(null);
      return;
    }
    const defaultPage = pages.find((p: any) => p.isDefault) || pages[0];
    setSelectedPageId((prev) => {
      if (prev && pages.some((p: any) => p.id === prev)) return prev;
      return defaultPage.id;
    });
  }, [hasAnyPage, pages]);

  const selectedPage =
    (hasAnyPage && pages.find((p: any) => p.id === selectedPageId)) || null;

  // Handle Start Live
  const handleStartLive = useCallback(
    (pickedTournament: TournamentLite | null) => {
      console.log("Start user match live with:", {
        tournament: pickedTournament
          ? {
              id: getTournamentId(pickedTournament),
              name: getTournamentName(pickedTournament),
            }
          : null,
        resolution: selectedResolution?.id,
        courtName,
        title,
        content,
        waitReferee,
        batterySaving,
        page: selectedPage,
      });
      router.push({
        pathname: `/match/user-match/${getTournamentId(pickedTournament)}/live`,
        params: {
          userMatch: "true",
        },
      });
      // TODO: Navigate to Camera / Backend logic here
    },
    [
      selectedResolution?.id,
      courtName,
      title,
      content,
      waitReferee,
      batterySaving,
      selectedPage,
    ]
  );

  const handleGoConnectPage = () => {
    router.push("/settings/facebook-pages");
  };

  /* =========================================================
   * TOURNAMENT MODAL LOGIC
   * =======================================================*/
  const [tournamentModalOpen, setTournamentModalOpen] = useState(false);
  const [tournamentSearch, setTournamentSearch] = useState("");
  const [pickedTournamentId, setPickedTournamentId] = useState<string | null>(
    null
  );

  const {
    data: myTournamentsData,
    isLoading: tournamentsLoading,
    isFetching: tournamentsFetching,
    refetch: refetchTournaments,
  } = useGetMyUserMatchesQuery(
    { search: tournamentSearch.trim() || undefined } as any,
    { refetchOnMountOrArgChange: true } as any
  );

  const tournaments: TournamentLite[] = useMemo(() => {
    const d: any = myTournamentsData;
    if (!d) return [];
    if (Array.isArray(d)) return d;
    if (Array.isArray(d.items)) return d.items;
    if (Array.isArray(d.data)) return d.data;
    if (Array.isArray(d.results)) return d.results;
    return [];
  }, [myTournamentsData]);

  const filteredTournaments = useMemo(() => {
    const q = tournamentSearch.trim().toLowerCase();
    if (!q) return tournaments;
    return tournaments.filter((t) => {
      const name = getTournamentName(t).toLowerCase();
      const loc = getTournamentLocation(t).toLowerCase();
      return name.includes(q) || loc.includes(q);
    });
  }, [tournaments, tournamentSearch]);

  const pickedTournament = useMemo(() => {
    if (!pickedTournamentId) return null;
    return (
      tournaments.find((t) => getTournamentId(t) === pickedTournamentId) || null
    );
  }, [tournaments, pickedTournamentId]);

  const openTournamentModal = useCallback(() => {
    setIsResolutionOpen(false);
    setIsPageSelectOpen(false);
    setTournamentModalOpen(true);
    try {
      refetchTournaments();
    } catch {}
  }, [refetchTournaments]);

  const closeTournamentModal = useCallback(() => {
    setTournamentModalOpen(false);
  }, []);

  const handleConfirmTournamentAndLive = useCallback(() => {
    const t = pickedTournament;
    closeTournamentModal();
    if (t) {
      const name = getTournamentName(t);
      setTitle((prev) => prev || name);
      setContent((prev) => prev || `Livestream giải: ${name}`);
    }
    handleStartLive(t);
  }, [pickedTournament, closeTournamentModal, handleStartLive]);

  // Render Item
  const TournamentRow = useCallback(
    ({ item }: { item: TournamentLite }) => {
      const id = getTournamentId(item);
      const isActive = id && id === pickedTournamentId;
      const name = getTournamentName(item);
      const cover = getTournamentCover(item);
      const location = getTournamentLocation(item);
      const timeStr = formatDateTime(
        item?.startAt || item?.startDate || item?.createdAt
      );

      return (
        <Pressable
          onPress={() => setPickedTournamentId(id)}
          style={[
            modalStyles.tCard,
            { backgroundColor: theme.cardBg, borderColor: theme.inputBorder },
            isActive && {
              borderColor: isDark ? "#60a5fa" : "#2563EB",
              borderWidth: 1.5,
            },
          ]}
        >
          {cover ? (
            <Image
              source={{ uri: normalizeUrl(cover) }}
              style={modalStyles.tAvatar}
              contentFit="cover"
              transition={120}
            />
          ) : (
            <View style={modalStyles.tAvatarFallback}>
              <Ionicons name="trophy-outline" size={18} color="#fff" />
            </View>
          )}

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={[
                modalStyles.tName,
                { color: theme.text },
                isActive && { color: theme.activeItemText, fontWeight: "800" },
              ]}
            >
              {name}
            </Text>
            {!!location && (
              <Text
                numberOfLines={1}
                style={[modalStyles.tSub, { color: theme.subText }]}
              >
                <Ionicons
                  name="location-outline"
                  size={12}
                  color={theme.subText}
                />{" "}
                {location}
              </Text>
            )}
            {!!timeStr && (
              <Text
                numberOfLines={1}
                style={[
                  modalStyles.tSub,
                  { color: theme.subText, marginTop: 2 },
                ]}
              >
                <Ionicons name="time-outline" size={12} color={theme.subText} />{" "}
                {timeStr}
              </Text>
            )}
          </View>

          {isActive ? (
            <View
              style={[
                modalStyles.checkBadge,
                { backgroundColor: isDark ? "#0c4a6e" : "#dbeafe" },
              ]}
            >
              <Ionicons
                name="checkmark"
                size={14}
                color={isDark ? "#38bdf8" : "#2563EB"}
              />
            </View>
          ) : (
            <Ionicons name="chevron-forward" size={18} color={theme.subText} />
          )}
        </Pressable>
      );
    },
    [pickedTournamentId, theme, isDark]
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: "Livestream",
          headerTitleAlign: "center",
          headerStyle: { backgroundColor: theme.headerBg },
          headerTintColor: theme.headerTint,
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.back()}
              style={{ paddingHorizontal: 8 }}
            >
              <Ionicons
                name="chevron-back"
                size={24}
                color={theme.headerTint}
              />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView
        style={{ flex: 1, backgroundColor: theme.background }}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* Nút Live */}
        <LinearGradient
          colors={["#0a84ff", "#4ECDC4"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.liveButtonWrapper}
        >
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={openTournamentModal}
            style={styles.liveButtonInner}
          >
            <Ionicons name="radio-outline" size={18} color="#fff" />
            <Text style={styles.liveButtonText}>Live ngay</Text>
          </TouchableOpacity>
        </LinearGradient>

        {/* --- CÁC FORM NHẬP LIỆU (Giữ nguyên) --- */}
        {/* Độ phân giải */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: theme.text }]}>
            Độ phân giải
          </Text>
          <View
            style={[
              styles.selectBox,
              {
                backgroundColor: theme.inputBg,
                borderColor: theme.inputBorder,
              },
            ]}
          >
            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.selectPress}
              onPress={() => setIsResolutionOpen((o) => !o)}
            >
              <Text style={[styles.selectText, { color: theme.text }]}>
                {selectedResolution
                  ? `${selectedResolution.label}${
                      selectedResolution.id === recommendedResolutionId
                        ? " • Khuyến nghị"
                        : ""
                    }`
                  : "Chọn độ phân giải"}
              </Text>
              <Ionicons
                name={
                  Platform.OS === "ios" ? "chevron-forward" : "chevron-down"
                }
                size={18}
                color={theme.subText}
              />
            </TouchableOpacity>
          </View>
          {isResolutionOpen && (
            <View
              style={[
                styles.optionsBox,
                {
                  backgroundColor: theme.cardBg,
                  borderColor: theme.inputBorder,
                },
              ]}
            >
              {RESOLUTION_PRESETS.map((preset) => {
                const isActive = preset.id === selectedResolutionId;
                return (
                  <Pressable
                    key={preset.id}
                    onPress={() => {
                      setSelectedResolutionId(preset.id);
                      setIsResolutionOpen(false);
                    }}
                    style={[
                      styles.optionItem,
                      isActive && { backgroundColor: theme.activeItemBg },
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        { color: theme.text },
                        isActive && {
                          fontWeight: "600",
                          color: theme.activeItemText,
                        },
                      ]}
                    >
                      {preset.label}
                      {preset.id === recommendedResolutionId
                        ? " (Khuyến nghị)"
                        : ""}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          <Text style={[styles.helperText, { color: theme.subText }]}>
            Hệ thống tự đề xuất độ phân giải phù hợp với cấu hình thiết bị.
          </Text>
        </View>

        {/* Tên sân */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: theme.text }]}>Tên sân</Text>
          <TextInput
            value={courtName}
            onChangeText={setCourtName}
            placeholder="VD: Sân 1..."
            placeholderTextColor={theme.placeholder}
            style={[
              styles.input,
              {
                backgroundColor: theme.inputBg,
                borderColor: theme.inputBorder,
                color: theme.text,
              },
            ]}
          />
        </View>

        {/* Tiêu đề */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: theme.text }]}>Tiêu đề</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Nhập tiêu đề..."
            placeholderTextColor={theme.placeholder}
            style={[
              styles.input,
              {
                backgroundColor: theme.inputBg,
                borderColor: theme.inputBorder,
                color: theme.text,
              },
            ]}
          />
        </View>

        {/* Nội dung */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: theme.text }]}>Nội dung</Text>
          <TextInput
            value={content}
            onChangeText={setContent}
            placeholder="Mô tả ngắn..."
            placeholderTextColor={theme.placeholder}
            style={[
              styles.input,
              styles.textArea,
              {
                backgroundColor: theme.inputBg,
                borderColor: theme.inputBorder,
                color: theme.text,
              },
            ]}
            multiline
          />
        </View>

        {/* Chọn Page */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: theme.text }]}>Chọn Page</Text>
          {pagesLoading && !hasAnyPage && (
            <Text style={[styles.helperText, { color: theme.subText }]}>
              Đang tải...
            </Text>
          )}
          {hasAnyPage ? (
            <>
              <View
                style={[
                  styles.selectBox,
                  {
                    backgroundColor: theme.inputBg,
                    borderColor: theme.inputBorder,
                  },
                ]}
              >
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={styles.selectPress}
                  onPress={() => setIsPageSelectOpen((o) => !o)}
                >
                  <Text style={[styles.selectText, { color: theme.text }]}>
                    {selectedPage?.pageName || "Chọn Page"}
                  </Text>
                  <Ionicons
                    name={
                      Platform.OS === "ios" ? "chevron-forward" : "chevron-down"
                    }
                    size={18}
                    color={theme.subText}
                  />
                </TouchableOpacity>
              </View>
              {isPageSelectOpen && (
                <View
                  style={[
                    styles.optionsBox,
                    {
                      backgroundColor: theme.cardBg,
                      borderColor: theme.inputBorder,
                    },
                  ]}
                >
                  {pages.map((p: any) => {
                    const isActive = p.id === selectedPageId;
                    return (
                      <Pressable
                        key={p.id}
                        style={[
                          styles.optionItem,
                          styles.pageOptionItem,
                          isActive && { backgroundColor: theme.activeItemBg },
                        ]}
                        onPress={() => {
                          setSelectedPageId(p.id);
                          setIsPageSelectOpen(false);
                        }}
                      >
                        {p.pagePicture ? (
                          <Image
                            source={{ uri: normalizeUrl(p.pagePicture) }}
                            style={styles.pageAvatar}
                            contentFit="cover"
                          />
                        ) : (
                          <View style={styles.pageAvatarFallback}>
                            <Ionicons
                              name="logo-facebook"
                              size={16}
                              color="#fff"
                            />
                          </View>
                        )}
                        <Text
                          style={[
                            styles.pageName,
                            { color: theme.text },
                            isActive && {
                              fontWeight: "600",
                              color: theme.activeItemText,
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {p.pageName}
                        </Text>
                        {p.isDefault && (
                          <View
                            style={[
                              styles.badge,
                              {
                                backgroundColor: isDark ? "#0c4a6e" : "#e0f2fe",
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.badgeText,
                                { color: isDark ? "#38bdf8" : "#0369a1" },
                              ]}
                            >
                              Mặc định
                            </Text>
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </>
          ) : (
            <View
              style={[
                styles.noPageBox,
                {
                  backgroundColor: theme.warningBg,
                  borderColor: theme.warningBorder,
                },
              ]}
            >
              <Ionicons
                name="warning-outline"
                size={18}
                color={theme.warningText}
              />
              <Text style={[styles.noPageText, { color: theme.warningText }]}>
                Bạn chưa kết nối Facebook Page.
              </Text>
            </View>
          )}
          <TouchableOpacity
            activeOpacity={0.9}
            style={styles.connectBtn}
            onPress={handleGoConnectPage}
          >
            <Ionicons name="logo-facebook" size={18} color="#fff" />
            <Text style={styles.connectBtnText}>Kết nối Page</Text>
          </TouchableOpacity>
        </View>

        {/* Các Switch */}
        <View style={styles.switchRow}>
          <View style={styles.switchLabelBox}>
            <Text style={[styles.label, { color: theme.text }]}>
              Chờ trọng tài
            </Text>
            <Text style={[styles.switchSubText, { color: theme.subText }]}>
              Màn hình chờ trước trận.
            </Text>
          </View>
          <Switch
            value={waitReferee}
            onValueChange={setWaitReferee}
            trackColor={{
              true: "#34c759",
              false: isDark ? "#4b5563" : "#d1d1d6",
            }}
          />
        </View>

        <View style={styles.switchRow}>
          <View style={styles.switchLabelBox}>
            <Text style={[styles.label, { color: theme.text }]}>
              Tiết kiệm PIN
            </Text>
            <Text style={[styles.switchSubText, { color: theme.subText }]}>
              Giảm hiệu ứng khi live.
            </Text>
          </View>
          <Switch
            value={batterySaving}
            onValueChange={setBatterySaving}
            trackColor={{
              true: "#34c759",
              false: isDark ? "#4b5563" : "#d1d1d6",
            }}
          />
        </View>
      </ScrollView>

      {/* =========================================================
       * FULL SCREEN MODAL: CHỌN GIẢI
       * =======================================================*/}
      <Modal
        visible={tournamentModalOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={closeTournamentModal}
      >
        <SafeAreaView
          style={[modalStyles.safe, { backgroundColor: theme.background }]}
          edges={["left", "right"]} // ⚠️ QUAN TRỌNG: Không để safe area ở bottom tự động, mình sẽ chỉnh tay ở footer
        >
          <View
            style={{
              flex: 1,
              paddingTop: insets.top,
              paddingBottom: insets.bottom,
            }}
          >
            {/* Header Modal */}
            <View
              style={[
                modalStyles.header,
                {
                  borderBottomColor: theme.inputBorder,
                  backgroundColor: theme.background,
                },
              ]}
            >
              <TouchableOpacity
                onPress={closeTournamentModal}
                style={modalStyles.headerBtn}
              >
                <Ionicons name="chevron-back" size={24} color={theme.text} />
              </TouchableOpacity>
              <Text style={[modalStyles.headerTitle, { color: theme.text }]}>
                Chọn giải đấu
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setPickedTournamentId(null);
                  closeTournamentModal();
                  handleStartLive(null);
                }}
                style={modalStyles.headerRightBtn}
              >
                <Text
                  style={[
                    modalStyles.headerRightText,
                    { color: theme.subText },
                  ]}
                >
                  Live tự do
                </Text>
              </TouchableOpacity>
            </View>

            {/* Search */}
            <View style={modalStyles.searchWrap}>
              <View
                style={[
                  modalStyles.searchBox,
                  {
                    backgroundColor: theme.inputBg,
                    borderColor: theme.inputBorder,
                  },
                ]}
              >
                <Ionicons name="search" size={18} color={theme.subText} />
                <TextInput
                  value={tournamentSearch}
                  onChangeText={setTournamentSearch}
                  placeholder="Tìm tên giải, địa điểm..."
                  placeholderTextColor={theme.placeholder}
                  style={[modalStyles.searchInput, { color: theme.text }]}
                  returnKeyType="search"
                  onSubmitEditing={() => {
                    try {
                      refetchTournaments();
                    } catch {}
                  }}
                />
                {!!tournamentSearch && (
                  <TouchableOpacity onPress={() => setTournamentSearch("")}>
                    <Ionicons
                      name="close-circle"
                      size={18}
                      color={theme.subText}
                    />
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity
                onPress={() => {
                  try {
                    refetchTournaments();
                  } catch {}
                }}
                style={modalStyles.refreshBtn}
              >
                <Ionicons
                  name="refresh"
                  size={18}
                  color={tournamentsFetching ? "#0a84ff" : theme.subText}
                />
              </TouchableOpacity>
            </View>

            {/* List Content */}
            {tournamentsLoading ? (
              <View style={modalStyles.center}>
                <ActivityIndicator size="large" color="#0a84ff" />
                <Text
                  style={[modalStyles.centerText, { color: theme.subText }]}
                >
                  Đang tải giải đấu...
                </Text>
              </View>
            ) : (
              <FlatList
                data={filteredTournaments}
                keyExtractor={(item) => getTournamentId(item)}
                renderItem={TournamentRow}
                // ✅ Tăng padding bottom để list không bị footer che, + thêm safe area
                contentContainerStyle={[
                  modalStyles.listContent,
                  { paddingBottom: insets.bottom + 90 },
                ]}
                ListEmptyComponent={
                  <View style={modalStyles.center}>
                    <Ionicons
                      name="trophy-outline"
                      size={36}
                      color={isDark ? "#4b5563" : "#cbd5e1"}
                    />
                    <Text
                      style={[modalStyles.centerText, { color: theme.subText }]}
                    >
                      Không có giải đấu nào
                    </Text>
                  </View>
                }
              />
            )}

            {/* 🔹 FOOTER: Đã chỉnh sửa để floating đẹp hơn */}
            <View
              style={[
                modalStyles.footer,
                {
                  borderTopColor: theme.inputBorder,
                  backgroundColor: theme.background,
                  // ✅ KEY FIX: Padding bottom = insets.bottom (tai thỏ/vuốt) + 12px (khoảng hở)
                  paddingBottom: insets.bottom > 0 ? insets.bottom + 4 : 20,
                },
              ]}
            >
              {/* Nếu có chọn giải thì hiện ảnh cover nhỏ */}
              {pickedTournament && (
                <Image
                  source={{
                    uri: normalizeUrl(getTournamentCover(pickedTournament)),
                  }}
                  style={modalStyles.footerCover}
                  contentFit="cover"
                />
              )}

              <View style={{ flex: 1 }}>
                <Text
                  style={[modalStyles.footerLabel, { color: theme.subText }]}
                >
                  {pickedTournament ? "Đã chọn:" : "Chưa chọn giải"}
                </Text>
                <Text
                  style={[
                    modalStyles.footerPicked,
                    { color: theme.text },
                    !pickedTournament && { fontStyle: "italic", opacity: 0.7 },
                  ]}
                  numberOfLines={1}
                >
                  {pickedTournament
                    ? getTournamentName(pickedTournament)
                    : "Vui lòng chọn giải để tiếp tục"}
                </Text>
              </View>

              <TouchableOpacity
                activeOpacity={0.9}
                disabled={!pickedTournament}
                onPress={handleConfirmTournamentAndLive}
                style={[
                  modalStyles.liveActionBtn,
                  {
                    opacity: pickedTournament ? 1 : 0.5,
                    backgroundColor: pickedTournament
                      ? "#ef4444"
                      : theme.inputBorder,
                  },
                ]}
              >
                <Ionicons name="radio" size={18} color="#fff" />
                <Text style={modalStyles.liveActionText}>Live</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}

// ==========================================
// STYLES
// ==========================================
const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 32 },
  liveButtonWrapper: { borderRadius: 14, marginBottom: 24, overflow: "hidden" },
  liveButtonInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  liveButtonText: {
    marginLeft: 6,
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  fieldGroup: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: "600", marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  selectBox: { borderWidth: 1, borderRadius: 10, overflow: "hidden" },
  selectPress: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectText: { fontSize: 14, flex: 1, marginRight: 8 },
  helperText: { fontSize: 12, marginTop: 4 },
  optionsBox: {
    marginTop: 6,
    borderWidth: 1,
    borderRadius: 10,
    overflow: "hidden",
  },
  optionItem: { paddingHorizontal: 12, paddingVertical: 9 },
  optionText: { fontSize: 14 },
  pageOptionItem: { flexDirection: "row", alignItems: "center", columnGap: 8 },
  pageAvatar: { width: 28, height: 28, borderRadius: 14, marginRight: 8 },
  pageAvatarFallback: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1877F2",
  },
  pageName: { fontSize: 14, flex: 1 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    marginLeft: 8,
  },
  badgeText: { fontSize: 11, fontWeight: "600" },
  noPageBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  noPageText: { flex: 1, marginLeft: 8, fontSize: 13 },
  connectBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#1877F2",
  },
  connectBtnText: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  switchLabelBox: { flex: 1, paddingRight: 12 },
  switchSubText: { fontSize: 12, marginTop: 2 },
});

const modalStyles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    height: 54,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    paddingHorizontal: 10,
  },
  headerBtn: { paddingVertical: 6, paddingRight: 8 },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
  },
  headerRightBtn: { paddingVertical: 6, paddingLeft: 8 },
  headerRightText: { fontSize: 13, fontWeight: "700" },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 6,
    gap: 10,
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 0 },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: { paddingHorizontal: 12, paddingTop: 8, gap: 10 },
  tCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },
  tAvatar: { width: 44, height: 44, borderRadius: 12 },
  tAvatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#0ea5e9",
    alignItems: "center",
    justifyContent: "center",
  },
  tName: { fontSize: 14, fontWeight: "800" },
  tSub: { fontSize: 12, marginTop: 2 },
  checkBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  centerText: {
    marginTop: 10,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "600",
  },

  // Footer Styles Mới
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    // Shadow cho đẹp
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 10,
  },
  footerCover: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: "rgba(0,0,0,0.1)",
    backgroundColor: "#eee",
  },
  footerLabel: {
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  footerPicked: { fontSize: 14, fontWeight: "800" },
  liveActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    gap: 6,
    minWidth: 90,
  },
  liveActionText: { color: "#fff", fontSize: 14, fontWeight: "900" },
});
