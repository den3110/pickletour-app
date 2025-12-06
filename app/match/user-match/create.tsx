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

// --- CONFIG MÀU SẮC ---
const COLORS = {
  primary: "#2563EB",
  primaryDark: "#1E40AF",
  secondary: "#F59E0B",
  background: "#F3F4F6",
  card: "#FFFFFF",
  text: "#1F2937",
  textSub: "#6B7280",
  border: "#E5E7EB",
  inputBg: "#F9FAFB",
  cardSub: "#1f2933",
};

// ✅ base path cho address API (tuỳ backend map mà chỉnh lại):
// ví dụ: app.use("/v1/address", addressRouter);
// trong router bạn đang để: router.get("/api/v1/province", ...)
const ADDRESS_API_BASE = process.env.EXPO_PUBLIC_BASE_URL + "/v1/address";

// helper lấy name/id linh hoạt theo cột trong DB
const getRowName = (row) =>
  row?.name ||
  row?.full_name ||
  row?.province_name ||
  row?.district_name ||
  row?.title ||
  "";

const getProvinceId = (row) =>
  row?.province_id ?? row?.id ?? row?.code ?? row?.provinceCode ?? null;

const getDistrictId = (row) =>
  row?.district_id ?? row?.id ?? row?.code ?? row?.districtCode ?? null;

/* ======= 1. COMPONENT: MODAL CHỌN DANH SÁCH (SELECT) ======= */
function SelectionModal({
  visible,
  title,
  data,
  onSelect,
  onClose,
  renderItemText,
  loading,
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          {/* List Item */}
          <FlatList
            data={data}
            keyExtractor={(item, index) =>
              `${
                item.province_id ??
                item.district_id ??
                item.id ??
                item.code ??
                "row"
              }-${index}`
            }
            style={{ maxHeight: 400 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.selectItem}
                onPress={() => {
                  onSelect(item);
                  onClose();
                }}
              >
                <Text style={styles.selectItemText}>
                  {renderItemText ? renderItemText(item) : getRowName(item)}
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={COLORS.textSub}
                />
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={{ padding: 20, alignItems: "center" }}>
                {loading ? (
                  <>
                    <ActivityIndicator color={COLORS.primary} />
                    <Text
                      style={{
                        color: COLORS.textSub,
                        marginTop: 8,
                        fontSize: 13,
                      }}
                    >
                      Đang tải dữ liệu...
                    </Text>
                  </>
                ) : (
                  <Text style={{ color: COLORS.textSub }}>
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

/* ======= AVATAR VĐV (map với ES / Mongo mới) ======= */
function PlayerAvatar({ player }) {
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
    <View style={styles.avatar}>
      {shouldShowFallback ? (
        <Text style={styles.avatarText}>{fallbackText}</Text>
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

/* ======= MODAL CHỌN VĐV (dùng response ES mới) ======= */
function PlayerSelectModal({ visible, onClose, onSelect }) {
  const [search, setSearch] = useState("");
  const searchInputRef = useRef(null);

  // đóng modal thì clear luôn text search
  useEffect(() => {
    if (!visible) {
      setSearch("");
    }
  }, [visible]);

  const { data, isLoading } = useSearchUserMatchPlayersQuery(
    { search: search.trim(), limit: 50 },
    {
      skip: !visible || !search.trim(), // tránh call khi chưa gõ gì
    }
  );

  const players = data?.items || [];

  const handleClose = () => {
    setSearch(""); // clear input
    onClose && onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onShow={() => {
        // đợi modal show xong rồi mới focus cho chắc
        setTimeout(() => {
          searchInputRef.current?.focus();
        }, 80);
      }}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.card }}>
        <View style={styles.fullModalHeader}>
          <TouchableOpacity onPress={handleClose}>
            <Ionicons name="close" size={28} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.fullModalTitle}>Chọn Vận Động Viên</Text>
          <View style={{ width: 28 }} />
        </View>

        <View style={styles.searchContainer}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={20} color={COLORS.textSub} />
            <TextInput
              ref={searchInputRef}
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Tìm tên, nickname, email..."
              autoFocus={false} // để đây false, mình tự focus bằng ref
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
                  color={COLORS.textSub}
                />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {isLoading ? (
          <ActivityIndicator
            size="large"
            color={COLORS.primary}
            style={{ marginTop: 20 }}
          />
        ) : (
          <FlatList
            data={players}
            keyExtractor={(item) => String(item.userId || item._id || item.id)}
            contentContainerStyle={{ padding: 16 }}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const displayName =
                item.displayName || item.nickname || item.name || "Không tên";
              const subText = item.email || item.province || "";

              return (
                <TouchableOpacity
                  style={styles.playerItem}
                  onPress={() => onSelect(item)} // parent sẽ tự đóng modal
                >
                  <PlayerAvatar player={item} />

                  <View style={{ flex: 1 }}>
                    <Text style={styles.playerName}>{displayName}</Text>
                    {subText ? (
                      <Text style={styles.playerEmail}>{subText}</Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              search.trim() ? (
                <View style={{ padding: 20, alignItems: "center" }}>
                  <Text style={{ color: COLORS.textSub }}>
                    Không tìm thấy vận động viên phù hợp
                  </Text>
                </View>
              ) : (
                <View style={{ padding: 20, alignItems: "center" }}>
                  <Text style={{ color: COLORS.textSub }}>
                    Nhập từ khoá để bắt đầu tìm kiếm
                  </Text>
                </View>
              )
            }
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

/* ======= 3. MAIN SCREEN ======= */
export default function CreateUserMatchScreen() {
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const [matchDate, setMatchDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateMode, setDateMode] = useState<"date" | "time">("date");

  // ✅ match type: single / double (mặc định: đôi)
  const [matchType, setMatchType] = useState<"single" | "double">("double");

  // ✅ state địa chỉ từ API
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

  // ====== CALL API ĐỊA CHỈ ======
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
    const displayName =
      p.displayName || p.nickname || p.name || "Vận động viên";
    const minimal = {
      id: p.userId || p._id || p.id,
      displayName,
    };

    if (activeSlot === "A1") setPlayerA1(minimal);
    if (activeSlot === "A2") setPlayerA2(minimal);
    if (activeSlot === "B1") setPlayerB1(minimal);
    if (activeSlot === "B2") setPlayerB2(minimal);
    setPlayerModalVisible(false);
  };

  const handleSubmit = async (
    mode: "draft" | "normal" | "live"
  ): Promise<void> => {
    try {
      if (!province) {
        Keyboard.dismiss();
        alert("Vui lòng chọn Tỉnh/Thành phố");
        return;
      }

      // ✅ Nếu là Tạo / Tạo & Live thì bắt buộc đủ VĐV theo loại trận
      if (mode === "normal" || mode === "live") {
        if (matchType === "double") {
          if (!playerA1 || !playerA2 || !playerB1 || !playerB2) {
            alert(
              "Vui lòng chọn đủ 4 vận động viên cho trận đôi (A1, A2, B1, B2)."
            );
            return;
          }
        } else {
          if (!playerA1 || !playerB1) {
            alert("Vui lòng chọn đủ 2 vận động viên cho trận đơn (A1, B1).");
            return;
          }
        }
      }

      const provinceName = getRowName(province);
      const districtName = district ? getRowName(district) : "";

      const participants: any[] = [];
      const addP = (p, side, order) =>
        p &&
        participants.push({
          user: p.id,
          displayName: p.displayName,
          side,
          order,
        });

      // ✅ singles / doubles: chỉ push theo loại trận
      addP(playerA1, "A", 1);
      if (matchType === "double") addP(playerA2, "A", 2);
      addP(playerB1, "B", 1);
      if (matchType === "double") addP(playerB2, "B", 2);

      const payload: any = {
        title: "Trận đấu tự do",
        note,
        sportType: "pickleball",
        locationName: `${provinceName}${
          districtName ? " - " + districtName : ""
        }`,
        locationAddress: address,
        scheduledAt: matchDate.toISOString(),
        participants,
      };

      if (scoreA > 0 || scoreB > 0) payload.score = { a: scoreA, b: scoreB };
      // nếu backend có hỗ trợ draft / matchType thì có thể thêm:
      // payload.status = mode === "draft" ? "draft" : "normal";
      // payload.matchType = matchType;

      const created = await createUserMatch(payload).unwrap();

      if (mode === "live" && created?._id) {
        router.replace({
          pathname: `/match/${created._id}/referee`,
          params: {
            userMatch: "true", // truyền param userMatch true
          },
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
    <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
      <Stack.Screen
        options={{
          headerTitle: "Tạo trận đấu",
          headerTitleAlign: "center",
          headerStyle: { backgroundColor: COLORS.card },
          headerShadowVisible: true,
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.back()}
              style={{ paddingHorizontal: 8, paddingVertical: 4 }}
            >
              <Ionicons name="chevron-back" size={24} />
            </TouchableOpacity>
          ),
        }}
      />

      {/* ✅ Bọc toàn bộ content bằng KeyboardAvoidingView */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        // offset này để chừa chỗ cho header trên iOS (tuỳ app, có thể chỉnh 64/80)
        keyboardVerticalOffset={Platform.OS === "ios" ? headerHeight : 0}
      >
        <View style={{ flex: 1 }}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              paddingBottom: 200, // ✅ đủ lớn để input cuối cùng scroll lên trên keyboard
            }}
            keyboardShouldPersistTaps="handled"
          >
            {/* 1. Thời gian */}
            <SectionBlock title="Thời gian">
              <TouchableOpacity
                style={styles.selectInput}
                onPress={handleShowPicker}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Ionicons
                    name="calendar-outline"
                    size={20}
                    color={COLORS.primary}
                    style={{ marginRight: 10 }}
                  />
                  <Text style={styles.inputText}>
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
                  color={COLORS.textSub}
                />
              </TouchableOpacity>
            </SectionBlock>

            {/* 2. Tỉ số & VĐV */}
            <SectionBlock title="Tỉ số & VĐV">
              {/* Tab chọn Đôi / Đơn */}
              <View style={styles.modeTabs}>
                <TouchableOpacity
                  style={[
                    styles.modeTab,
                    matchType === "double" && styles.modeTabActive,
                  ]}
                  onPress={() => setMatchType("double")}
                >
                  <Text
                    style={[
                      styles.modeTabText,
                      matchType === "double" && styles.modeTabTextActive,
                    ]}
                  >
                    Trận đôi
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modeTab,
                    matchType === "single" && styles.modeTabActive,
                  ]}
                  onPress={() => setMatchType("single")}
                >
                  <Text
                    style={[
                      styles.modeTabText,
                      matchType === "single" && styles.modeTabTextActive,
                    ]}
                  >
                    Trận đơn
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.vsCard}>
                <View style={styles.teamCol}>
                  <Text style={[styles.teamLabel, { color: COLORS.primary }]}>
                    TEAM A
                  </Text>
                  <PlayerBox
                    value={playerA1}
                    placeholder="VĐV A1"
                    onPress={() => {
                      setActiveSlot("A1");
                      setPlayerModalVisible(true);
                    }}
                  />
                  {matchType === "double" && (
                    <PlayerBox
                      value={playerA2}
                      placeholder="VĐV A2"
                      onPress={() => {
                        setActiveSlot("A2");
                        setPlayerModalVisible(true);
                      }}
                    />
                  )}
                  <ScoreControl
                    value={scoreA}
                    onChange={setScoreA}
                    color={COLORS.primary}
                  />
                </View>

                <View style={styles.vsMid}>
                  <Text style={styles.vsText}>VS</Text>
                </View>

                <View style={styles.teamCol}>
                  <Text style={[styles.teamLabel, { color: COLORS.secondary }]}>
                    TEAM B
                  </Text>
                  <PlayerBox
                    value={playerB1}
                    placeholder="VĐV B1"
                    onPress={() => {
                      setActiveSlot("B1");
                      setPlayerModalVisible(true);
                    }}
                  />
                  {matchType === "double" && (
                    <PlayerBox
                      value={playerB2}
                      placeholder="VĐV B2"
                      onPress={() => {
                        setActiveSlot("B2");
                        setPlayerModalVisible(true);
                      }}
                    />
                  )}
                  <ScoreControl
                    value={scoreB}
                    onChange={setScoreB}
                    color={COLORS.secondary}
                  />
                </View>
              </View>
            </SectionBlock>

            {/* 3. Địa điểm */}
            <SectionBlock title="Địa điểm thi đấu">
              <View style={{ flexDirection: "row", gap: 12 }}>
                <TouchableOpacity
                  style={[styles.selectInput, { flex: 1 }]}
                  onPress={() => setShowProvinceModal(true)}
                >
                  <View>
                    <Text style={styles.labelSmall}>Tỉnh/Thành</Text>
                    <Text style={styles.inputText} numberOfLines={1}>
                      {provinceLabel}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-down"
                    size={16}
                    color={COLORS.textSub}
                  />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.selectInput,
                    { flex: 1, opacity: province ? 1 : 0.5 },
                  ]}
                  onPress={() => province && setShowDistrictModal(true)}
                  disabled={!province}
                >
                  <View>
                    <Text style={styles.labelSmall}>Quận/Huyện</Text>
                    <Text style={styles.inputText} numberOfLines={1}>
                      {districtLabel}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-down"
                    size={16}
                    color={COLORS.textSub}
                  />
                </TouchableOpacity>
              </View>

              <View style={[styles.inputContainer, { marginTop: 12 }]}>
                <TextInput
                  style={styles.textInput}
                  placeholder="Số nhà, tên sân, đường..."
                  value={address}
                  onChangeText={setAddress}
                />
              </View>
            </SectionBlock>

            {/* 4. Ghi chú */}
            <SectionBlock title="Ghi chú">
              <View style={styles.inputContainer}>
                <TextInput
                  style={[
                    styles.textInput,
                    { minHeight: 80, textAlignVertical: "top" },
                  ]}
                  placeholder="Nhập ghi chú trận đấu..."
                  value={note}
                  onChangeText={setNote}
                  multiline
                />
              </View>
            </SectionBlock>
          </ScrollView>

          {/* ✅ Bottom buttons: nằm trong KeyboardAvoidingView nên sẽ nhảy lên theo keyboard */}
          <View style={styles.bottomBar}>
            {/* Lưu nháp */}
            <TouchableOpacity
              style={[styles.btnDraft, isCreating && styles.btnDisabled]}
              onPress={() => handleSubmit("draft")}
              disabled={isCreating}
            >
              <Text style={styles.btnDraftText}>Lưu nháp</Text>
            </TouchableOpacity>

            {/* Tạo (chỉ tạo trận, không vào live setup) */}
            <TouchableOpacity
              style={[styles.btnCreate, isCreating && styles.btnDisabled]}
              onPress={() => handleSubmit("normal")}
              disabled={isCreating}
            >
              <Text style={styles.btnCreateText}>Tạo</Text>
            </TouchableOpacity>

            {/* Tạo & Live ngay */}
            <TouchableOpacity
              style={[styles.btnPrimary, isCreating && styles.btnDisabled]}
              onPress={() => handleSubmit("live")}
              disabled={isCreating}
            >
              {isCreating ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.btnPrimaryText}>Tạo & Live Ngay</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* iOS Date Picker */}
        {Platform.OS === "ios" && showDatePicker && (
          <Modal transparent animationType="fade">
            <View style={styles.iosDatePickerOverlay}>
              <View style={styles.iosDatePickerContainer}>
                <DateTimePicker
                  value={matchDate}
                  mode="datetime"
                  display="spinner"
                  onChange={onDateChange}
                  locale="vi-VN"
                />
                <TouchableOpacity
                  onPress={() => setShowDatePicker(false)}
                  style={styles.iosConfirmBtn}
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

        {/* Select Province */}
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
            if (pid) {
              fetchDistrictsByProvinceId(pid);
            }
          }}
          onClose={() => setShowProvinceModal(false)}
        />

        {/* Select District */}
        <SelectionModal
          visible={showDistrictModal}
          title="Chọn Quận/Huyện"
          data={districts}
          loading={loadingDistricts}
          onSelect={(item) => setDistrict(item)}
          onClose={() => setShowDistrictModal(false)}
        />

        <PlayerSelectModal
          visible={playerModalVisible}
          onClose={() => setPlayerModalVisible(false)}
          onSelect={handleSelectPlayer}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ======= COMPONENT CON ======= */
const SectionBlock = ({ title, children }) => (
  <View style={{ marginTop: 20, paddingHorizontal: 16 }}>
    <Text
      style={{
        fontSize: 14,
        fontWeight: "600",
        color: COLORS.textSub,
        marginBottom: 8,
      }}
    >
      {title}
    </Text>
    {children}
  </View>
);

const PlayerBox = ({ value, placeholder, onPress }) => (
  <TouchableOpacity onPress={onPress} style={styles.playerBox}>
    {value ? (
      <Text
        style={{ fontWeight: "600", color: COLORS.text, fontSize: 13 }}
        numberOfLines={1}
      >
        {value.displayName}
      </Text>
    ) : (
      <Text
        style={{ color: COLORS.textSub, fontSize: 13, fontStyle: "italic" }}
      >
        {placeholder}
      </Text>
    )}
  </TouchableOpacity>
);

const ScoreControl = ({ value, onChange, color }) => (
  <View
    style={{
      flexDirection: "row",
      alignItems: "center",
      marginTop: 8,
      alignSelf: "center",
      backgroundColor: COLORS.inputBg,
      borderRadius: 20,
    }}
  >
    <TouchableOpacity
      onPress={() => onChange((v) => Math.max(0, v - 1))}
      style={{ padding: 8 }}
    >
      <Ionicons name="remove" size={20} />
    </TouchableOpacity>
    <Text
      style={{
        fontSize: 18,
        fontWeight: "bold",
        minWidth: 24,
        textAlign: "center",
        color: color,
      }}
    >
      {value}
    </Text>
    <TouchableOpacity
      onPress={() => onChange((v) => v + 1)}
      style={{ padding: 8 }}
    >
      <Ionicons name="add" size={20} />
    </TouchableOpacity>
  </View>
);

/* ======= STYLES ======= */
const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
  },
  headerBtn: {
    width: 40,
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "700",
  },

  selectInput: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 48,
  },
  inputText: { fontSize: 15, color: COLORS.text, fontWeight: "500" },
  labelSmall: { fontSize: 10, color: COLORS.textSub },
  inputContainer: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  textInput: { paddingVertical: 12, fontSize: 15, color: COLORS.text },

  // Tabs Đôi / Đơn
  modeTabs: {
    flexDirection: "row",
    alignSelf: "center",
    backgroundColor: COLORS.inputBg,
    borderRadius: 999,
    padding: 4,
    gap: 4,
  },
  modeTab: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 999,
  },
  modeTabActive: {
    backgroundColor: COLORS.primary,
  },
  modeTabText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textSub,
  },
  modeTabTextActive: {
    color: "#fff",
  },

  vsCard: {
    marginTop: 12,
    flexDirection: "row",
    backgroundColor: COLORS.card,
    padding: 16,
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
  vsMid: { width: 40, justifyContent: "center", alignItems: "center" },
  vsText: {
    fontWeight: "900",
    color: "#E5E7EB",
    fontSize: 20,
    fontStyle: "italic",
  },
  playerBox: {
    backgroundColor: COLORS.inputBg,
    padding: 10,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    height: 40,
  },

  bottomBar: {
    padding: 16,
    backgroundColor: COLORS.card,
    flexDirection: "row",
    gap: 12,
    borderTopWidth: 1,
    borderColor: COLORS.border,
  },
  btnDraft: {
    flex: 1,
    backgroundColor: "#EFF6FF",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  btnDraftText: { color: COLORS.primary, fontWeight: "700" },

  // 👇 Nút Tạo ở giữa
  btnCreate: {
    flex: 1,
    backgroundColor: COLORS.card,
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  btnCreateText: {
    color: COLORS.primary,
    fontWeight: "700",
  },

  btnPrimary: {
    flex: 2,
    backgroundColor: COLORS.primary,
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  btnPrimaryText: { color: "#FFF", fontWeight: "700" },

  btnDisabled: {
    opacity: 0.6,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "center",
  },
  closeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  selectItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  selectItemText: { fontSize: 16, color: COLORS.text },

  fullModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
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
    borderColor: COLORS.border,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 999,
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.cardSub,
  },
  avatarText: { color: COLORS.primary, fontWeight: "bold" },
  playerName: { fontSize: 15, fontWeight: "600" },
  playerEmail: { fontSize: 13, color: COLORS.textSub },

  iosDatePickerOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  iosDatePickerContainer: {
    backgroundColor: "white",
    padding: 16,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  iosConfirmBtn: {
    backgroundColor: COLORS.primary,
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 10,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.inputBg,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 15 },

  clearSearchBtn: {
    paddingLeft: 4,
    paddingVertical: 4,
  },
});
