// app/matches/live-setup/index.tsx
import React, { useEffect, useState, useCallback } from "react";
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
  useColorScheme, // 🔹 Import hook
} from "react-native";
import { Stack, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "@react-navigation/native";
import * as Device from "expo-device";
import { Image } from "expo-image";

// chỉnh lại path nếu khác
import { useGetFacebookPagesQuery } from "@/slices/facebookApiSlice";
import { normalizeUrl } from "@/utils/normalizeUri";

const RESOLUTION_PRESETS = [
  { id: "1080p30", label: "1080p 30fps", minGB: 6 },
  { id: "720p30", label: "720p 30fps", minGB: 4 },
  { id: "480p30", label: "480p 30fps", minGB: 2 },
];

// 🔹 CẤU HÌNH MÀU SẮC
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
    activeItemBg: "#1e3a8a", // Xanh đậm hơn cho dark mode
    activeItemText: "#60a5fa", // Xanh sáng cho text
    warningBg: "#451a03", // Nâu tối
    warningBorder: "#78350f",
    warningText: "#fcd34d", // Vàng sáng
    headerBg: "#121212",
    headerTint: "#ffffff",
  },
};

export default function UserMatchLiveSetupScreen() {
  // 🔹 Detect theme
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = THEME_COLORS[isDark ? "dark" : "light"];

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

  // Page FB
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

  // refetch mỗi khi màn hình focus lại
  useFocusEffect(
    useCallback(() => {
      refetchPages();
    }, [refetchPages])
  );

  // Auto chọn độ phân giải khuyến nghị theo RAM máy
  useEffect(() => {
    const totalMemBytes = Device.totalMemory || 0;
    const totalGB = totalMemBytes / 1024 / 1024 / 1024;

    let best = RESOLUTION_PRESETS[RESOLUTION_PRESETS.length - 1]; // thấp nhất
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

  // Sync selectedPageId theo list pages (ưu tiên isDefault)
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

  const handleStartLive = () => {
    console.log("Start user match live with:", {
      resolution: selectedResolution?.id,
      courtName,
      title,
      content,
      waitReferee,
      batterySaving,
      page: selectedPage,
    });
    // TODO: nối với native FacebookLiveModule + backend
  };

  const handleGoConnectPage = () => {
    router.push("/settings/facebook-pages");
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "Livestream",
          headerTitleAlign: "center",
          headerStyle: { backgroundColor: theme.headerBg }, // 🔹 Header bg
          headerTintColor: theme.headerTint, // 🔹 Header text/icon color
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.back()}
              style={{ paddingHorizontal: 8, paddingVertical: 4 }}
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
        style={{ flex: 1, backgroundColor: theme.background }} // 🔹 Main BG
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
            onPress={handleStartLive}
            style={styles.liveButtonInner}
          >
            <Ionicons name="radio-outline" size={18} color="#fff" />
            <Text style={styles.liveButtonText}>Live ngay</Text>
          </TouchableOpacity>
        </LinearGradient>

        {/* Độ phân giải - select option */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: theme.text }]}>
            Độ phân giải
          </Text>

          <View
            style={[
              styles.selectBox,
              { backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
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
                const isRecommended = preset.id === recommendedResolutionId;
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
                      {isRecommended ? " (Khuyến nghị)" : ""}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          <Text style={[styles.helperText, { color: theme.subText }]}>
            Hệ thống tự đề xuất độ phân giải phù hợp với cấu hình thiết bị, bạn
            vẫn có thể đổi nếu cần.
          </Text>
        </View>

        {/* Tên sân */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: theme.text }]}>Tên sân</Text>
          <TextInput
            value={courtName}
            onChangeText={setCourtName}
            placeholder="VD: Sân 1, Sân trung tâm..."
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
            placeholder="Nhập tiêu đề livestream"
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
            placeholder="Mô tả ngắn về trận đấu / giải"
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

        {/* Chọn Page Facebook - select option */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: theme.text }]}>Chọn Page</Text>

          {pagesLoading && !hasAnyPage ? (
            <Text style={[styles.helperText, { color: theme.subText }]}>
              Đang tải danh sách Page...
            </Text>
          ) : null}

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
                    {selectedPage?.pageName || "Chọn Page để phát live"}
                  </Text>
                  <Ionicons
                    name={
                      Platform.OS === "ios"
                        ? "chevron-forward"
                        : "chevron-down"
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
                            transition={100}
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
                        <View style={{ flex: 1 }}>
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
                          {p.pageCategory ? (
                            <Text
                              style={[
                                styles.pageCategory,
                                { color: theme.subText },
                              ]}
                              numberOfLines={1}
                            >
                              {p.pageCategory}
                            </Text>
                          ) : null}
                        </View>
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
                                {
                                  color: isDark ? "#38bdf8" : "#0369a1",
                                },
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
                Bạn chưa kết nối Facebook Page để livestream.
              </Text>
            </View>
          )}

          <TouchableOpacity
            activeOpacity={0.9}
            style={styles.connectBtn}
            onPress={handleGoConnectPage}
          >
            <Ionicons name="logo-facebook" size={18} color="#fff" />
            <Text style={styles.connectBtnText}>Thiết lập / kết nối Page</Text>
          </TouchableOpacity>
        </View>

        {/* Chờ trọng tài */}
        <View style={styles.switchRow}>
          <View style={styles.switchLabelBox}>
            <Text style={[styles.label, { color: theme.text }]}>
              Chờ trọng tài
            </Text>
            <Text style={[styles.switchSubText, { color: theme.subText }]}>
              Bật nếu bạn muốn màn hình chờ trước khi trận bắt đầu.
            </Text>
          </View>
          <Switch
            value={waitReferee}
            onValueChange={setWaitReferee}
            thumbColor={waitReferee ? "#fff" : "#f4f3f4"}
            trackColor={{
              false: isDark ? "#4b5563" : "#d1d1d6", // Darker gray for dark mode
              true: "#34c759",
            }}
          />
        </View>

        {/* Tiết kiệm PIN */}
        <View style={styles.switchRow}>
          <View style={styles.switchLabelBox}>
            <Text style={[styles.label, { color: theme.text }]}>
              Tiết kiệm PIN
            </Text>
            <Text style={[styles.switchSubText, { color: theme.subText }]}>
              Giảm bớt hiệu ứng để tối ưu thời lượng pin khi live lâu.
            </Text>
          </View>
          <Switch
            value={batterySaving}
            onValueChange={setBatterySaving}
            thumbColor={batterySaving ? "#fff" : "#f4f3f4"}
            trackColor={{
              false: isDark ? "#4b5563" : "#d1d1d6",
              true: "#34c759",
            }}
          />
        </View>

        {/* Chú thích mới */}
        <View style={styles.noteBox}>
          <Ionicons
            name="information-circle-outline"
            size={18}
            color="#fff"
          />
          <Text style={styles.noteText}>
            Live stream hoạt động trên mọi nền tảng (Android & iOS). Hãy đảm bảo
            kết nối mạng ổn định trước khi bắt đầu.
          </Text>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 32,
  },

  // Live button
  liveButtonWrapper: {
    borderRadius: 14,
    marginBottom: 24,
    overflow: "hidden",
  },
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

  fieldGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },

  selectBox: {
    borderWidth: 1,
    borderRadius: 10,
    overflow: "hidden",
  },
  selectPress: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectText: {
    fontSize: 14,
    flex: 1,
    marginRight: 8,
  },
  helperText: {
    fontSize: 12,
    marginTop: 4,
  },

  optionsBox: {
    marginTop: 6,
    borderWidth: 1,
    borderRadius: 10,
    overflow: "hidden",
  },
  optionItem: {
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  optionText: {
    fontSize: 14,
  },

  // Page select
  pageOptionItem: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 8,
  },
  pageAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 8,
  },
  pageAvatarFallback: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1877F2",
  },
  pageName: {
    fontSize: 14,
  },
  pageCategory: {
    fontSize: 12,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    marginLeft: 8,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "600",
  },

  noPageBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  noPageText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 13,
  },
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
  switchLabelBox: {
    flex: 1,
    paddingRight: 12,
  },
  switchSubText: {
    fontSize: 12,
    marginTop: 2,
  },

  noteBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#f97316",
    marginTop: 16,
  },
  noteText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 12,
    color: "#fff",
    lineHeight: 16,
  },
});