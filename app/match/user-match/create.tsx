import React, { useMemo, useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  FlatList,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
  useColorScheme,
  Dimensions,
  StatusBar,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Stack, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  useCreateUserMatchMutation,
  useSearchUserMatchPlayersQuery,
} from "@/slices/userMatchesApiSlice";
import { Image } from "expo-image";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";

// --- CẤU HÌNH THEME & RESPONSIVE ---
const { width: SCREEN_WIDTH } = Dimensions.get("window");
const IS_SMALL_SCREEN = SCREEN_WIDTH < 380;

// Kích thước linh hoạt theo màn hình
const SPACING = IS_SMALL_SCREEN ? 12 : 16;
const FONT_SIZE_NORMAL = IS_SMALL_SCREEN ? 13 : 15;
const FONT_SIZE_TITLE = IS_SMALL_SCREEN ? 16 : 18;
const INPUT_HEIGHT = IS_SMALL_SCREEN ? 44 : 50;

const THEME = {
  light: {
    primary: "#2563EB",
    primaryDark: "#1E40AF",
    secondary: "#F59E0B",
    background: "#F3F4F6",
    card: "#FFFFFF",
    text: "#1F2937",
    textSub: "#6B7280",
    border: "#E5E7EB",
    inputBg: "#F9FAFB",
    cardSub: "#F3F4F6",
    placeholder: "#9CA3AF",
    modalOverlay: "rgba(0,0,0,0.5)",
  },
  dark: {
    primary: "#3B82F6", // Sáng hơn chút để nổi trên nền đen
    primaryDark: "#60A5FA",
    secondary: "#FBBF24",
    background: "#121212", // Màu nền tối chuẩn
    card: "#1E1E1E", // Màu card tối
    text: "#F3F4F6", // Chữ trắng xám
    textSub: "#9CA3AF", // Chữ phụ xám nhạt
    border: "#374151", // Viền xám tối
    inputBg: "#27272A", // Nền input tối
    cardSub: "#2C2C2E",
    placeholder: "#6B7280",
    modalOverlay: "rgba(0,0,0,0.7)",
  },
};

const ADDRESS_API_BASE = process.env.EXPO_PUBLIC_BASE_URL + "/v1/address";

const getRowName = (row) =>
  row?.name ||
  row?.full_name ||
  row?.province_name ||
  row?.district_name ||
  row?.title ||
  "";

const getProvinceId = (row) =>
  row?.province_id ?? row?.id ?? row?.code ?? row?.provinceCode ?? null;

/* ======= 1. COMPONENT: MODAL CHỌN DANH SÁCH (SELECT) ======= */
function SelectionModal({
  visible,
  title,
  data,
  onSelect,
  onClose,
  renderItemText,
  loading,
  colors, // Nhận colors từ props
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <View
        style={[styles.modalOverlay, { backgroundColor: colors.modalOverlay }]}
      >
        <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
          {/* Header */}
          <View style={[styles.modalHeader, { borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {title}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* List Item */}
          <FlatList
            data={data}
            keyExtractor={(item, index) => `${getProvinceId(item) || index}`}
            style={{ maxHeight: 400 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.selectItem, { borderColor: colors.border }]}
                onPress={() => {
                  onSelect(item);
                  onClose();
                }}
              >
                <Text style={[styles.selectItemText, { color: colors.text }]}>
                  {renderItemText ? renderItemText(item) : getRowName(item)}
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.textSub}
                />
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={{ padding: 20, alignItems: "center" }}>
                {loading ? (
                  <>
                    <ActivityIndicator color={colors.primary} />
                    <Text style={{ color: colors.textSub, marginTop: 8 }}>
                      Đang tải dữ liệu...
                    </Text>
                  </>
                ) : (
                  <Text style={{ color: colors.textSub }}>
                    Không có dữ liệu
                  </Text>
                )}
              </View>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

/* ======= AVATAR VĐV ======= */
function PlayerAvatar({ player, colors }) {
  const [error, setError] = useState(false);

  const avatarUri =
    player.avatar ||
    player.avatarUrl ||
    player.photoUrl ||
    player.photoURL ||
    null;

  const baseName = (
    player.displayName ||
    player.nickname ||
    player.name ||
    ""
  ).trim();

  const fallbackText = baseName ? baseName[0].toUpperCase() : "?";
  const shouldShowFallback = !avatarUri || error;

  return (
    <View style={[styles.avatar, { backgroundColor: colors.cardSub }]}>
      {shouldShowFallback ? (
        <Text style={[styles.avatarText, { color: colors.primary }]}>
          {fallbackText}
        </Text>
      ) : (
        <Image
          source={{ uri: avatarUri }}
          style={{ width: "100%", height: "100%", borderRadius: 999 }}
          contentFit="cover"
          onError={() => setError(true)}
        />
      )}
    </View>
  );
}

/* ======= MODAL CHỌN VĐV ======= */
/* ======= MODAL CHỌN VĐV (có thêm nhập tên thủ công) ======= */
function PlayerSelectModal({ visible, onClose, onSelect, colors }) {
  const [tab, setTab] = useState("list"); // "list" | "manual"
  const [search, setSearch] = useState("");
  const [manualName, setManualName] = useState("");

  const searchInputRef = useRef(null);
  const manualInputRef = useRef(null);

  useEffect(() => {
    if (!visible) {
      setTab("list");
      setSearch("");
      setManualName("");
    }
  }, [visible]);

  const { data, isLoading } = useSearchUserMatchPlayersQuery(
    { search: search.trim(), limit: 50 },
    {
      skip: !visible || tab !== "list" || !search.trim(),
    }
  );

  const players = data?.items || [];

  const handleClose = () => {
    setTab("list");
    setSearch("");
    setManualName("");
    onClose && onClose();
  };

  const handleUseManual = () => {
    const name = manualName.trim();
    if (!name) return;
    onSelect?.({ displayName: name }); // không có id => coi như VĐV nhập tay
    handleClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onShow={() => {
        setTimeout(() => {
          if (tab === "manual") manualInputRef.current?.focus();
          else searchInputRef.current?.focus();
        }, 80);
      }}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.card }}>
        <StatusBar
          barStyle={
            colors.text === "#F3F4F6" ? "light-content" : "dark-content"
          }
        />

        <View style={[styles.fullModalHeader, { borderColor: colors.border }]}>
          <TouchableOpacity onPress={handleClose}>
            <Ionicons name="close" size={28} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.fullModalTitle, { color: colors.text }]}>
            Chọn Vận Động Viên
          </Text>
          <View style={{ width: 28 }} />
        </View>

        {/* Tabs */}
        <View style={[styles.psTabsWrap, { backgroundColor: colors.inputBg }]}>
          <TouchableOpacity
            onPress={() => {
              setTab("list");
              setTimeout(() => searchInputRef.current?.focus(), 60);
            }}
            style={[
              styles.psTabBtn,
              tab === "list" && { backgroundColor: colors.primary },
            ]}
          >
            <Text
              style={[
                styles.psTabText,
                { color: tab === "list" ? "#fff" : colors.textSub },
              ]}
            >
              Chọn từ danh sách
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              setTab("manual");
              setTimeout(() => manualInputRef.current?.focus(), 60);
            }}
            style={[
              styles.psTabBtn,
              tab === "manual" && { backgroundColor: colors.primary },
            ]}
          >
            <Text
              style={[
                styles.psTabText,
                { color: tab === "manual" ? "#fff" : colors.textSub },
              ]}
            >
              Nhập tên
            </Text>
          </TouchableOpacity>
        </View>

        {/* Manual tab */}
        {tab === "manual" ? (
          <View style={{ padding: 16 }}>
            <View
              style={[styles.searchBox, { backgroundColor: colors.inputBg }]}
            >
              <Ionicons
                name="create-outline"
                size={20}
                color={colors.textSub}
              />
              <TextInput
                ref={manualInputRef}
                style={[styles.searchInput, { color: colors.text }]}
                value={manualName}
                onChangeText={setManualName}
                placeholder="Nhập tên vận động viên..."
                placeholderTextColor={colors.placeholder}
                returnKeyType="done"
                onSubmitEditing={handleUseManual}
              />
              {!!manualName && (
                <TouchableOpacity
                  onPress={() => setManualName("")}
                  style={styles.clearSearchBtn}
                >
                  <Ionicons
                    name="close-circle"
                    size={18}
                    color={colors.textSub}
                  />
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              onPress={handleUseManual}
              disabled={!manualName.trim()}
              style={[
                styles.psUseManualBtn,
                { backgroundColor: colors.primary },
                !manualName.trim() && { opacity: 0.5 },
              ]}
            >
              <Text style={styles.psUseManualText}>Dùng tên này</Text>
            </TouchableOpacity>

            <Text
              style={{ marginTop: 10, color: colors.textSub, fontSize: 13 }}
            >
              *VĐV nhập tay sẽ không phải user hệ thống, chỉ lưu theo tên.
            </Text>
          </View>
        ) : (
          <>
            {/* List tab */}
            <View style={styles.searchContainer}>
              <View
                style={[styles.searchBox, { backgroundColor: colors.inputBg }]}
              >
                <Ionicons name="search" size={20} color={colors.textSub} />
                <TextInput
                  ref={searchInputRef}
                  style={[styles.searchInput, { color: colors.text }]}
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Tìm tên, nickname, email..."
                  placeholderTextColor={colors.placeholder}
                  autoFocus={false}
                  returnKeyType="search"
                />
                {!!search && (
                  <TouchableOpacity
                    onPress={() => setSearch("")}
                    style={styles.clearSearchBtn}
                  >
                    <Ionicons
                      name="close-circle"
                      size={18}
                      color={colors.textSub}
                    />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {isLoading ? (
              <ActivityIndicator
                size="large"
                color={colors.primary}
                style={{ marginTop: 20 }}
              />
            ) : (
              <FlatList
                data={players}
                keyExtractor={(item) =>
                  String(item.userId || item._id || item.id)
                }
                contentContainerStyle={{ padding: 16 }}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const displayName =
                    item.displayName ||
                    item.nickname ||
                    item.name ||
                    "Không tên";
                  const subText = item.email || item.province || "";

                  return (
                    <TouchableOpacity
                      style={[
                        styles.playerItem,
                        { borderColor: colors.border },
                      ]}
                      onPress={() => onSelect(item)}
                    >
                      <PlayerAvatar player={item} colors={colors} />

                      <View style={{ flex: 1 }}>
                        <Text
                          style={[styles.playerName, { color: colors.text }]}
                        >
                          {displayName}
                        </Text>
                        {subText ? (
                          <Text
                            style={[
                              styles.playerEmail,
                              { color: colors.textSub },
                            ]}
                          >
                            {subText}
                          </Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  <View style={{ padding: 20, alignItems: "center" }}>
                    <Text style={{ color: colors.textSub }}>
                      {search.trim()
                        ? "Không tìm thấy vận động viên phù hợp"
                        : "Nhập từ khoá để bắt đầu tìm kiếm"}
                    </Text>
                  </View>
                }
              />
            )}
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
}

/* ======= 3. MAIN SCREEN ======= */
export default function CreateUserMatchScreen() {
  const headerHeight = useHeaderHeight();

  // --- THEME SETUP ---
  const systemScheme = useColorScheme();
  const theme = systemScheme === "dark" ? "dark" : "light";
  const colors = THEME[theme];

  const [matchDate, setMatchDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateMode, setDateMode] = useState("date");
  const [matchType, setMatchType] = useState("double");

  // Address State
  const [province, setProvince] = useState(null);
  const [district, setDistrict] = useState(null);
  const [provinces, setProvinces] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [loadingProvinces, setLoadingProvinces] = useState(false);
  const [loadingDistricts, setLoadingDistricts] = useState(false);

  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");

  const [showProvinceModal, setShowProvinceModal] = useState(false);
  const [showDistrictModal, setShowDistrictModal] = useState(false);

  // Score & Players
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [playerA1, setPlayerA1] = useState(null);
  const [playerA2, setPlayerA2] = useState(null);
  const [playerB1, setPlayerB1] = useState(null);
  const [playerB2, setPlayerB2] = useState(null);

  const [activeSlot, setActiveSlot] = useState(null);
  const [playerModalVisible, setPlayerModalVisible] = useState(false);
  const [createUserMatch, { isLoading: isCreating }] =
    useCreateUserMatchMutation();

  useEffect(() => {
    fetchProvinces();
  }, []);

  async function fetchProvinces() {
    try {
      setLoadingProvinces(true);
      const res = await fetch(`${ADDRESS_API_BASE}/api/v1/province`);
      const json = await res.json();
      setProvinces(json?.results || []);
    } catch (err) {
      console.log("fetchProvinces error:", err);
    } finally {
      setLoadingProvinces(false);
    }
  }

  async function fetchDistrictsByProvinceId(provinceId) {
    if (!provinceId) return;
    try {
      setLoadingDistricts(true);
      const res = await fetch(
        `${ADDRESS_API_BASE}/api/v1/province/district/${provinceId}`
      );
      const json = await res.json();
      setDistricts(json?.results || []);
    } catch (err) {
      console.log("fetchDistricts error:", err);
    } finally {
      setLoadingDistricts(false);
    }
  }

  const onDateChange = (event, selectedDate) => {
    if (Platform.OS === "android") {
      setShowDatePicker(false);
      if (selectedDate) {
        if (dateMode === "date") {
          setMatchDate(selectedDate);
          setDateMode("time");
          setTimeout(() => setShowDatePicker(true), 100);
        } else {
          const newDate = new Date(matchDate);
          newDate.setHours(selectedDate.getHours());
          newDate.setMinutes(selectedDate.getMinutes());
          setMatchDate(newDate);
          setDateMode("date");
        }
      }
    } else {
      if (selectedDate) setMatchDate(selectedDate);
      setShowDatePicker(false);
    }
  };

  const handleShowPicker = () => {
    if (Platform.OS === "ios") {
      setShowDatePicker(true);
    } else {
      setDateMode("date");
      setShowDatePicker(true);
    }
  };

  const handleSelectPlayer = (p) => {
    const displayName = String(
      p?.displayName || p?.nickname || p?.name || "Vận động viên"
    ).trim();

    const id = p?.userId || p?._id || p?.id || null;

    const minimal = { id, displayName };

    if (activeSlot === "A1") setPlayerA1(minimal);
    if (activeSlot === "A2") setPlayerA2(minimal);
    if (activeSlot === "B1") setPlayerB1(minimal);
    if (activeSlot === "B2") setPlayerB2(minimal);

    setPlayerModalVisible(false);
  };

  const handleSubmit = async (mode) => {
    try { 
      // ✅ CHỈ BẮT BUỘC VĐV khi normal/live
      if (mode === "normal" || mode === "live") {
        if (matchType === "double") {
          if (!playerA1 || !playerA2 || !playerB1 || !playerB2) {
            alert("Vui lòng chọn đủ 4 vận động viên.");
            return;
          }
        } else {
          if (!playerA1 || !playerB1) {
            alert("Vui lòng chọn đủ 2 vận động viên.");
            return;
          }
        }
      }

      // location TUỲ CHỌN
      const provinceName = province ? getRowName(province) : "";
      const districtName = district ? getRowName(district) : "";
      const locName = provinceName
        ? `${provinceName}${districtName ? " - " + districtName : ""}`
        : "";

      const participants = [];
      const addP = (p, side, order) => {
        if (!p) return;
        const row = {
          displayName: p.displayName,
          side,
          order,
        };
        if (p.id) row.user = p.id; // chỉ gửi user nếu có id
        participants.push(row);
      };

      addP(playerA1, "A", 1);
      if (matchType === "double") addP(playerA2, "A", 2);
      addP(playerB1, "B", 1);
      if (matchType === "double") addP(playerB2, "B", 2);

      const payload = {
        title: "Trận đấu tự do",
        note,
        sportType: "pickleball",
        scheduledAt: matchDate.toISOString(),
        participants,
      };

      // ✅ chỉ set location nếu có dữ liệu
      const addr = String(address || "").trim();
      if (locName) payload.locationName = locName;
      if (addr) payload.locationAddress = addr;

      if (scoreA > 0 || scoreB > 0) payload.score = { a: scoreA, b: scoreB };

      const created = await createUserMatch(payload).unwrap();

      if (mode === "live" && created?._id) {
        router.replace({
          pathname: `/match/${created._id}/referee`,
          params: { userMatch: "true" },
        });
      } else {
        router.back();
      }
    } catch (err) {
      console.log(err);
    }
  };

  const provinceLabel = province ? getRowName(province) : "Chọn...";
  const districtLabel = district ? getRowName(district) : "Chọn...";

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={["bottom"]}
    >
      <StatusBar
        barStyle={theme === "dark" ? "light-content" : "dark-content"}
      />
      <Stack.Screen
        options={{
          headerTitle: "Tạo trận đấu",
          headerTitleAlign: "center",
          headerStyle: { backgroundColor: colors.card },
          headerTitleStyle: { color: colors.text, fontSize: FONT_SIZE_TITLE },
          headerShadowVisible: true,
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.back()}
              style={{ paddingHorizontal: 8, paddingVertical: 4 }}
            >
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </TouchableOpacity>
          ),
        }}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? headerHeight : 0}
      >
        <View style={{ flex: 1 }}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 200 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* 1. Thời gian */}
            <SectionBlock title="Thời gian" colors={colors}>
              <TouchableOpacity
                style={[
                  styles.selectInput,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
                onPress={handleShowPicker}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Ionicons
                    name="calendar-outline"
                    size={20}
                    color={colors.primary}
                    style={{ marginRight: 10 }}
                  />
                  <Text style={[styles.inputText, { color: colors.text }]}>
                    {matchDate.toLocaleString("vi-VN", {
                      hour: "2-digit",
                      minute: "2-digit",
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </Text>
                </View>
                <Ionicons
                  name="chevron-down"
                  size={20}
                  color={colors.textSub}
                />
              </TouchableOpacity>
            </SectionBlock>

            {/* 2. Tỉ số & VĐV */}
            <SectionBlock title="Tỉ số & VĐV" colors={colors}>
              <View
                style={[styles.modeTabs, { backgroundColor: colors.inputBg }]}
              >
                <TouchableOpacity
                  style={[
                    styles.modeTab,
                    matchType === "double" && {
                      backgroundColor: colors.primary,
                    },
                  ]}
                  onPress={() => setMatchType("double")}
                >
                  <Text
                    style={[
                      styles.modeTabText,
                      { color: colors.textSub },
                      matchType === "double" && { color: "#fff" },
                    ]}
                  >
                    Trận đôi
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modeTab,
                    matchType === "single" && {
                      backgroundColor: colors.primary,
                    },
                  ]}
                  onPress={() => setMatchType("single")}
                >
                  <Text
                    style={[
                      styles.modeTabText,
                      { color: colors.textSub },
                      matchType === "single" && { color: "#fff" },
                    ]}
                  >
                    Trận đơn
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={[styles.vsCard, { backgroundColor: colors.card }]}>
                <View style={styles.teamCol}>
                  <Text style={[styles.teamLabel, { color: colors.primary }]}>
                    TEAM A
                  </Text>
                  <PlayerBox
                    value={playerA1}
                    placeholder="VĐV A1"
                    colors={colors}
                    onPress={() => {
                      setActiveSlot("A1");
                      setPlayerModalVisible(true);
                    }}
                  />
                  {matchType === "double" && (
                    <PlayerBox
                      value={playerA2}
                      placeholder="VĐV A2"
                      colors={colors}
                      onPress={() => {
                        setActiveSlot("A2");
                        setPlayerModalVisible(true);
                      }}
                    />
                  )}
                  <ScoreControl
                    value={scoreA}
                    onChange={setScoreA}
                    color={colors.primary}
                    colors={colors}
                  />
                </View>

                <View style={styles.vsMid}>
                  <Text style={styles.vsText}>VS</Text>
                </View>

                <View style={styles.teamCol}>
                  <Text style={[styles.teamLabel, { color: colors.secondary }]}>
                    TEAM B
                  </Text>
                  <PlayerBox
                    value={playerB1}
                    placeholder="VĐV B1"
                    colors={colors}
                    onPress={() => {
                      setActiveSlot("B1");
                      setPlayerModalVisible(true);
                    }}
                  />
                  {matchType === "double" && (
                    <PlayerBox
                      value={playerB2}
                      placeholder="VĐV B2"
                      colors={colors}
                      onPress={() => {
                        setActiveSlot("B2");
                        setPlayerModalVisible(true);
                      }}
                    />
                  )}
                  <ScoreControl
                    value={scoreB}
                    onChange={setScoreB}
                    color={colors.secondary}
                    colors={colors}
                  />
                </View>
              </View>
            </SectionBlock>

            {/* 3. Địa điểm */}
            <SectionBlock title="Địa điểm thi đấu" colors={colors}>
              <View
                style={{ flexDirection: "row", gap: IS_SMALL_SCREEN ? 8 : 12 }}
              >
                <TouchableOpacity
                  style={[
                    styles.selectInput,
                    {
                      flex: 1,
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                  onPress={() => setShowProvinceModal(true)}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.labelSmall, { color: colors.textSub }]}
                    >
                      Tỉnh/Thành
                    </Text>
                    <Text
                      style={[styles.inputText, { color: colors.text }]}
                      numberOfLines={1}
                    >
                      {provinceLabel}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-down"
                    size={16}
                    color={colors.textSub}
                  />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.selectInput,
                    {
                      flex: 1,
                      opacity: province ? 1 : 0.5,
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                  onPress={() => province && setShowDistrictModal(true)}
                  disabled={!province}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.labelSmall, { color: colors.textSub }]}
                    >
                      Quận/Huyện
                    </Text>
                    <Text
                      style={[styles.inputText, { color: colors.text }]}
                      numberOfLines={1}
                    >
                      {districtLabel}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-down"
                    size={16}
                    color={colors.textSub}
                  />
                </TouchableOpacity>
              </View>

              <View
                style={[
                  styles.inputContainer,
                  {
                    marginTop: 12,
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                  },
                ]}
              >
                <TextInput
                  style={[styles.textInput, { color: colors.text }]}
                  placeholder="Số nhà, tên sân, đường..."
                  placeholderTextColor={colors.placeholder}
                  value={address}
                  onChangeText={setAddress}
                />
              </View>
            </SectionBlock>

            {/* 4. Ghi chú */}
            <SectionBlock title="Ghi chú" colors={colors}>
              <View
                style={[
                  styles.inputContainer,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <TextInput
                  style={[
                    styles.textInput,
                    {
                      minHeight: 80,
                      textAlignVertical: "top",
                      color: colors.text,
                    },
                  ]}
                  placeholder="Nhập ghi chú trận đấu..."
                  placeholderTextColor={colors.placeholder}
                  value={note}
                  onChangeText={setNote}
                  multiline
                />
              </View>
            </SectionBlock>
          </ScrollView>

          {/* Bottom Buttons */}
          <View
            style={[
              styles.bottomBar,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.btnDraft,
                { backgroundColor: colors.inputBg },
                isCreating && styles.btnDisabled,
              ]}
              onPress={() => handleSubmit("draft")}
              disabled={isCreating}
            >
              <Text style={[styles.btnDraftText, { color: colors.primary }]}>
                {IS_SMALL_SCREEN ? "Nháp" : "Lưu nháp"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.btnCreate,
                { backgroundColor: colors.card, borderColor: colors.primary },
                isCreating && styles.btnDisabled,
              ]}
              onPress={() => handleSubmit("normal")}
              disabled={isCreating}
            >
              <Text style={[styles.btnCreateText, { color: colors.primary }]}>
                Tạo
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.btnPrimary,
                { backgroundColor: colors.primary },
                isCreating && styles.btnDisabled,
              ]}
              onPress={() => handleSubmit("live")}
              disabled={isCreating}
            >
              {isCreating ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.btnPrimaryText}>
                  {IS_SMALL_SCREEN ? "Live ngay" : "Tạo & Live Ngay"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Date Pickers */}
        {Platform.OS === "ios" && showDatePicker && (
          <Modal transparent animationType="fade">
            <View style={styles.iosDatePickerOverlay}>
              <View
                style={[
                  styles.iosDatePickerContainer,
                  { backgroundColor: colors.card },
                ]}
              >
                <DateTimePicker
                  value={matchDate}
                  mode="datetime"
                  display="spinner"
                  onChange={onDateChange}
                  locale="vi-VN"
                  textColor={colors.text}
                  themeVariant={theme} // iOS 13+ support dark mode picker
                />
                <TouchableOpacity
                  onPress={() => setShowDatePicker(false)}
                  style={[
                    styles.iosConfirmBtn,
                    { backgroundColor: colors.primary },
                  ]}
                >
                  <Text style={{ color: "#FFF", fontWeight: "bold" }}>
                    Xong
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        )}
        {Platform.OS === "android" && showDatePicker && (
          <DateTimePicker
            value={matchDate}
            mode={dateMode}
            display="default"
            onChange={onDateChange}
            is24Hour={true}
          />
        )}

        <SelectionModal
          visible={showProvinceModal}
          title="Chọn Tỉnh/Thành phố"
          data={provinces}
          renderItemText={(item) => getRowName(item)}
          loading={loadingProvinces}
          onSelect={(item) => {
            setProvince(item);
            setDistrict(null);
            setDistricts([]);
            const pid = getProvinceId(item);
            if (pid) fetchDistrictsByProvinceId(pid);
          }}
          onClose={() => setShowProvinceModal(false)}
          colors={colors}
        />

        <SelectionModal
          visible={showDistrictModal}
          title="Chọn Quận/Huyện"
          data={districts}
          loading={loadingDistricts}
          onSelect={(item) => setDistrict(item)}
          onClose={() => setShowDistrictModal(false)}
          colors={colors}
        />

        <PlayerSelectModal
          visible={playerModalVisible}
          onClose={() => setPlayerModalVisible(false)}
          onSelect={handleSelectPlayer}
          colors={colors}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ======= COMPONENT CON ======= */
const SectionBlock = ({ title, children, colors }) => (
  <View style={{ marginTop: 20, paddingHorizontal: SPACING }}>
    <Text
      style={{
        fontSize: FONT_SIZE_NORMAL - 1,
        fontWeight: "600",
        color: colors.textSub,
        marginBottom: 8,
      }}
    >
      {title}
    </Text>
    {children}
  </View>
);

const PlayerBox = ({ value, placeholder, onPress, colors }) => (
  <TouchableOpacity
    onPress={onPress}
    style={[styles.playerBox, { backgroundColor: colors.inputBg }]}
  >
    {value ? (
      <Text
        style={{
          fontWeight: "600",
          color: colors.text,
          fontSize: FONT_SIZE_NORMAL - 2,
        }}
        numberOfLines={1}
      >
        {value.displayName}
      </Text>
    ) : (
      <Text
        style={{
          color: colors.textSub,
          fontSize: FONT_SIZE_NORMAL - 2,
          fontStyle: "italic",
        }}
      >
        {placeholder}
      </Text>
    )}
  </TouchableOpacity>
);

const ScoreControl = ({ value, onChange, color, colors }) => (
  <View
    style={{
      flexDirection: "row",
      alignItems: "center",
      marginTop: 8,
      alignSelf: "center",
      backgroundColor: colors.inputBg,
      borderRadius: 20,
    }}
  >
    <TouchableOpacity
      onPress={() => onChange((v) => Math.max(0, v - 1))}
      style={{ padding: 6 }} // Giảm padding cho màn hình nhỏ
    >
      <Ionicons name="remove" size={18} color={colors.text} />
    </TouchableOpacity>
    <Text
      style={{
        fontSize: 16,
        fontWeight: "bold",
        minWidth: 20,
        textAlign: "center",
        color: color,
      }}
    >
      {value}
    </Text>
    <TouchableOpacity
      onPress={() => onChange((v) => v + 1)}
      style={{ padding: 6 }}
    >
      <Ionicons name="add" size={18} color={colors.text} />
    </TouchableOpacity>
  </View>
);

/* ======= STYLES (Layout) ======= */
const styles = StyleSheet.create({
  selectInput: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: IS_SMALL_SCREEN ? 10 : 12,
    minHeight: INPUT_HEIGHT,
  },
  inputText: { fontSize: FONT_SIZE_NORMAL, fontWeight: "500" },
  labelSmall: { fontSize: 10 },
  inputContainer: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  textInput: {
    paddingVertical: IS_SMALL_SCREEN ? 10 : 12,
    fontSize: FONT_SIZE_NORMAL,
  },
  modeTabs: {
    flexDirection: "row",
    alignSelf: "center",
    borderRadius: 999,
    padding: 4,
    gap: 4,
  },
  modeTab: {
    paddingVertical: 6,
    paddingHorizontal: IS_SMALL_SCREEN ? 12 : 16,
    borderRadius: 999,
  },
  modeTabText: {
    fontSize: 12,
    fontWeight: "600",
  },
  vsCard: {
    marginTop: 12,
    flexDirection: "row",
    padding: IS_SMALL_SCREEN ? 12 : 16,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  teamCol: { flex: 1, gap: 8 },
  teamLabel: {
    textAlign: "center",
    fontWeight: "bold",
    fontSize: 12,
    marginBottom: 4,
  },
  vsMid: {
    width: IS_SMALL_SCREEN ? 30 : 40,
    justifyContent: "center",
    alignItems: "center",
  },
  vsText: {
    fontWeight: "900",
    color: "#E5E7EB",
    fontSize: IS_SMALL_SCREEN ? 16 : 20,
    fontStyle: "italic",
  },
  playerBox: {
    padding: 10,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    height: IS_SMALL_SCREEN ? 36 : 40,
  },
  bottomBar: {
    padding: SPACING,
    flexDirection: "row",
    gap: 8,
    borderTopWidth: 1,
    paddingBottom: Platform.OS === "ios" ? 0 : SPACING, // SafeAreaView sẽ lo phần bottom
  },
  btnDraft: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  btnDraftText: { fontWeight: "700", fontSize: 13 },
  btnCreate: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1,
    justifyContent: "center",
  },
  btnCreateText: { fontWeight: "700", fontSize: 13 },
  btnPrimary: {
    flex: 2,
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimaryText: { color: "#FFF", fontWeight: "700", fontSize: 13 },
  btnDisabled: { opacity: 0.6 },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "center",
  },
  closeBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  selectItem: {
    padding: 16,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  selectItemText: { fontSize: 16 },
  fullModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
  },
  fullModalTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
  },
  searchContainer: { padding: 16 },
  playerItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 999,
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontWeight: "bold" },
  playerName: { fontSize: 15, fontWeight: "600" },
  playerEmail: { fontSize: 13 },
  iosDatePickerOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  iosDatePickerContainer: {
    padding: 16,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  iosConfirmBtn: {
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 10,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 15 },
  clearSearchBtn: { paddingLeft: 4, paddingVertical: 4 },
  psTabsWrap: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 999,
    padding: 4,
    gap: 4,
  },
  psTabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  psTabText: {
    fontSize: 12,
    fontWeight: "700",
  },
  psUseManualBtn: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  psUseManualText: {
    color: "#fff",
    fontWeight: "800",
  },
});
