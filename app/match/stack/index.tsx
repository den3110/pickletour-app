// app/matches/stack.jsx
import React, { useMemo, useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Modal,
} from "react-native";
import { Stack, router } from "expo-router";
import { useTheme, useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Calendar } from "react-native-calendars";
import { useGetMyUserMatchesQuery } from "@/slices/userMatchesApiSlice";
import { ScrollView } from "react-native-gesture-handler";

/* ====== Utils ====== */
const RANGE_OPTIONS = [
  { key: "7d", label: "7 ngày" },
  { key: "30d", label: "30 ngày" },
  { key: "90d", label: "90 ngày" },
];

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const computeRange = (key, fromDate, toDate) => {
  const now = new Date();

  // Custom range: dùng fromDate/toDate nếu đã chọn
  if (key === "custom" && fromDate && toDate) {
    return {
      from: fromDate.toISOString(),
      to: new Date(toDate.getTime() + ONE_DAY_MS - 1).toISOString(), // end of day
    };
  }

  // Fallback nếu custom nhưng chưa chọn đủ -> mặc định 30 ngày
  let days = 30;
  if (key === "7d") days = 7;
  if (key === "30d") days = 30;
  if (key === "90d") days = 90;

  const to = now.toISOString();
  const fromDateDefault = new Date(now.getTime() - days * ONE_DAY_MS);

  return {
    from: fromDateDefault.toISOString(),
    to,
  };
};

const formatDateTime = (value) => {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";

  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");

  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
};

// format date ngắn dd/MM/yyyy cho chip khoảng ngày
const formatDateShort = (value) => {
  if (!value) return "--/--";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "--/--";

  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

const toDateId = (d) => {
  if (!d) return null;
  try {
    const dt = d instanceof Date ? d : new Date(d);
    return dt.toISOString().slice(0, 10); // YYYY-MM-DD
  } catch {
    return null;
  }
};

const fromDateId = (id) => {
  if (!id) return null;
  return new Date(id + "T00:00:00");
};

const statusMeta = {
  scheduled: { label: "Chưa diễn ra", bg: "#E5E7EB", color: "#374151" },
  live: { label: "Đang diễn ra", bg: "#FEE2E2", color: "#B91C1C" },
  finished: { label: "Đã kết thúc", bg: "#E0E7FF", color: "#4F46E5" },
  canceled: { label: "Đã huỷ", bg: "#F3F4F6", color: "#4B5563" },
};

function StatusChip({ status }) {
  const meta =
    statusMeta[status] ||
    ({
      label: status || "Không rõ",
      bg: "#E5E7EB",
      color: "#374151",
    } as any);

  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: meta.bg,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: "600",
          color: meta.color,
        }}
      >
        {meta.label}
      </Text>
    </View>
  );
}

/* ====== Match Card ====== */
function MatchCard({ item, onPress }) {
  const theme = useTheme();
  const isDark = !!theme?.dark;
  const bg = theme?.colors?.card ?? (isDark ? "#1f2933" : "#ffffff");
  const text = theme?.colors?.text ?? (isDark ? "#f9fafb" : "#111827");
  const sub = isDark ? "#9CA3AF" : "#6B7280";
  const border = theme?.colors?.border ?? (isDark ? "#374151" : "#E5E7EB");
  const primaryColor = theme?.colors?.primary ?? "#2563EB";

  const hasScore = (item.score?.a ?? 0) > 0 || (item.score?.b ?? 0) > 0;

  // 👉 chỉ cho bắt trận nếu chưa end
  const canStart = item.status !== "finished" && item.status !== "canceled";

  const handleStartMatch = () => {
    router.push({
      pathname: `/match/${item._id}/referee`,
      params: {
        userMatch: "true", // truyền param userMatch true
      },
    });
  };

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[
        styles.card,
        {
          backgroundColor: bg,
          borderColor: border,
        },
      ]}
    >
      <View style={styles.cardHeaderRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.matchTitle, { color: text }]} numberOfLines={1}>
            {item.title || "Trận đấu tự do"}
          </Text>
          {item.location?.name ? (
            <Text style={[styles.matchSub, { color: sub }]}>
              {item.location.name}
            </Text>
          ) : null}
        </View>

        {item.liveSource && item.liveSource !== "NONE" ? (
          <View style={styles.liveBadge}>
            <Ionicons name="radio" size={14} color="#EF4444" />
            <Text style={styles.liveBadgeText}>Đang Live</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.cardMetaRow}>
        <Ionicons name="time-outline" size={14} color={sub} />
        <Text style={[styles.metaText, { color: sub }]}>
          {formatDateTime(item.scheduledAt)}
        </Text>
      </View>

      {hasScore && (
        <View style={styles.cardMetaRow}>
          <Ionicons name="tennisball-outline" size={14} color={sub} />
          <Text style={[styles.metaText, { color: sub }]}>
            Tỉ số: {item.score?.a ?? 0} - {item.score?.b ?? 0}
          </Text>
        </View>
      )}

      <View style={styles.cardFooterRow}>
        <StatusChip status={item.status} />

        {canStart && (
          <TouchableOpacity
            onPress={handleStartMatch}
            activeOpacity={0.85}
            style={[
              styles.startBtn,
              {
                backgroundColor: primaryColor,
              },
            ]}
          >
            <Ionicons name="play" size={14} color="#FFFFFF" />
            <Text style={styles.startBtnText}>Bắt trận</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

/* ====== Main Screen ====== */
export default function MatchesStackScreen() {
  const theme = useTheme();
  const isDark = !!theme?.dark;
  const bg = theme?.colors?.background ?? (isDark ? "#020617" : "#F3F4F6");
  const text = theme?.colors?.text ?? (isDark ? "#F9FAFB" : "#111827");
  const primaryColor = theme?.colors?.primary ?? "#2563EB";
  const cardBg = theme?.colors?.card ?? (isDark ? "#020617" : "#FFFFFF");
  const textSec = isDark ? "#9CA3AF" : "#6B7280";

  const [search, setSearch] = useState("");
  const [rangeKey, setRangeKey] = useState("30d");

  // custom range state
  const [fromDate, setFromDate] = useState(null); // Date | null
  const [toDate, setToDate] = useState(null); // Date | null
  const [dateModalVisible, setDateModalVisible] = useState(false);
  const [rangeDraft, setRangeDraft] = useState({ start: null, end: null }); // 'YYYY-MM-DD'

  // 🔥 key để ép recompute range & đổi queryArg -> tránh cảm giác cache
  const [refreshKey, setRefreshKey] = useState(0);

  const hasCustomRange = !!(fromDate && toDate);
  const canApply = !!(rangeDraft.start && rangeDraft.end);
  const isPickingStart = !rangeDraft.start;
  const isPickingEnd = !!rangeDraft.start && !rangeDraft.end;

  const stepLabel = isPickingStart
    ? "Chọn ngày bắt đầu"
    : isPickingEnd
    ? "Chọn ngày kết thúc"
    : "Đã chọn xong khoảng ngày";

  const hintLabel = isPickingStart
    ? "Chạm vào một ngày trong lịch để chọn ngày bắt đầu."
    : isPickingEnd
    ? "Chọn ngày kết thúc, sau đó bấm Áp dụng để lọc trận."
    : "Kiểm tra lại khoảng ngày rồi bấm Áp dụng để lọc trận.";

  const { from, to } = useMemo(
    () => computeRange(rangeKey, fromDate, toDate),
    [rangeKey, fromDate, toDate, refreshKey] // 🔥 thêm refreshKey
  );

  const { data, isLoading, isFetching } = useGetMyUserMatchesQuery(
    {
      search: search.trim(),
      from,
      to,
      refreshKey, // 🔥 đưa vào để mỗi lần đổi key là 1 queryArg mới
    },
    {
      refetchOnFocus: false,
    }
  );

  const matches = data?.items || [];
  const total = data?.total ?? matches.length;

  // 👇 ref khi màn hình được focus lại (back quay về),
  // nhưng bỏ qua lần focus đầu tiên (route tới màn này)
  const hasFocusedOnceRef = useRef(false);

  const handleRefresh = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (hasFocusedOnceRef.current) {
        // Đã từng focus trước đó -> màn này được back lại
        handleRefresh();
      } else {
        // Lần đầu vào màn hình
        hasFocusedOnceRef.current = true;
      }
    }, [handleRefresh])
  );

  // Loading chỉ cho lần load đầu (route vào), các lần refetch do focus chỉ dùng isFetching
  const showInitialLoading = isLoading;

  return (
    <>
      <Stack.Screen
        options={{
          title: "Trận đấu",
          headerTitleAlign: "center",
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.back()}
              style={{ paddingHorizontal: 8, paddingVertical: 4 }}
            >
              <Ionicons name="chevron-back" size={24} />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginRight: 8,
              }}
            >
              <TouchableOpacity
                onPress={() => router.push("/match/live-setup")}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 999,
                  backgroundColor: primaryColor,
                  marginRight: 8,
                }}
              >
                <Ionicons name="radio" size={16} color="#FFFFFF" />
                <Text
                  style={{
                    marginLeft: 6,
                    fontSize: 13,
                    fontWeight: "700",
                    color: "#FFFFFF",
                  }}
                >
                  Live
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.push("/match/user-match/create")}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 999,
                  backgroundColor: primaryColor,
                  marginRight: 8,
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="add" size={16} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          ),
        }}
      />
      <View style={[styles.container, { backgroundColor: bg }]}>
        {/* Search */}
        <View style={styles.searchContainer}>
          <View
            style={[
              styles.searchInputWrapper,
              {
                backgroundColor: cardBg,
                borderColor: isDark ? "#1F2937" : "#E5E7EB",
              },
            ]}
          >
            <Ionicons
              name="search"
              size={18}
              color={isDark ? "#9CA3AF" : "#9CA3AF"}
              style={{ marginRight: 8 }}
            />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Tìm theo tiêu đề, địa điểm..."
              placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
              style={[
                styles.searchInput,
                {
                  color: text,
                },
              ]}
              returnKeyType="search"
              onSubmitEditing={handleRefresh} // 🔥 enter là refresh luôn
            />
          </View>
        </View>

        {/* Time range */}
        <View style={styles.rangeContainer}>
          <Text style={[styles.rangeLabel, { color: text }]}>Bộ lọc</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.rangeRow}
          >
            {RANGE_OPTIONS.map((opt) => {
              const selected =
                opt.key === rangeKey &&
                (rangeKey !== "custom" || !hasCustomRange);
              return (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => {
                    setRangeKey(opt.key);
                    // bỏ custom khi chọn preset
                    setFromDate(null);
                    setToDate(null);
                    handleRefresh(); // đổi preset cũng refetch luôn
                  }}
                  activeOpacity={0.8}
                >
                  <View
                    style={[
                      styles.rangeChip,
                      selected && {
                        backgroundColor: primaryColor,
                        borderColor: primaryColor,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.rangeChipText,
                        {
                          color: selected ? "#FFFFFF" : text,
                        },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}

            {/* 👉 Chip "Khoảng ngày" cạnh nút 90 ngày */}
            <TouchableOpacity
              onPress={() => {
                setRangeKey("custom");
                setRangeDraft({
                  start: toDateId(fromDate),
                  end: toDateId(toDate),
                });
                setDateModalVisible(true);
              }}
              activeOpacity={0.8}
            >
              <View
                style={[
                  styles.rangeChip,
                  (rangeKey === "custom" || hasCustomRange) && {
                    backgroundColor: primaryColor,
                    borderColor: primaryColor,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.rangeChipText,
                    {
                      color:
                        rangeKey === "custom" || hasCustomRange
                          ? "#FFFFFF"
                          : text,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {hasCustomRange
                    ? `${formatDateShort(fromDate)} ~ ${formatDateShort(
                        toDate
                      )}`
                    : "Khoảng ngày"}
                </Text>
              </View>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* List header */}
        <View style={styles.listHeaderRow}>
          <Text style={[styles.listTitle, { color: text }]}>
            Trận đấu đã tạo
          </Text>
          <Text
            style={[
              styles.listCount,
              { color: isDark ? "#9CA3AF" : "#6B7280" },
            ]}
          >
            ({total})
          </Text>
        </View>

        {showInitialLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={primaryColor} />
          </View>
        ) : (
          <FlatList
            data={matches}
            keyExtractor={(item) => String(item._id)}
            renderItem={({ item }) => (
              <MatchCard
                item={item}
                onPress={() => {
                  // Sau này bạn có thể push sang màn chi tiết:
                  // router.push(`/matches/${item._id}`);
                }}
              />
            )}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons
                  name="tennisball-outline"
                  size={32}
                  color={isDark ? "#4B5563" : "#D1D5DB"}
                />
                <Text
                  style={[
                    styles.emptyText,
                    { color: isDark ? "#9CA3AF" : "#6B7280" },
                  ]}
                >
                  Bạn chưa tạo trận nào trong khoảng thời gian này
                </Text>
              </View>
            }
            // pull-to-refresh vẫn dùng refreshing/isFetching bình thường
            refreshing={isFetching && !isLoading}
            onRefresh={handleRefresh} // 🔥 kéo xuống là tăng refreshKey
          />
        )}
      </View>

      {/* Date range modal */}
      <Modal
        visible={dateModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setDateModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: cardBg,
              },
            ]}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: primaryColor,
                textAlign: "center",
                marginBottom: 2,
              }}
            >
              {stepLabel}
            </Text>

            <Text
              style={{
                fontSize: 11,
                color: textSec,
                textAlign: "center",
                marginBottom: 8,
              }}
            >
              {hintLabel}
            </Text>

            <Calendar
              markingType="period"
              onDayPress={(day) => {
                const date = day.dateString; // 'YYYY-MM-DD'
                setRangeDraft((prev) => {
                  // chưa chọn hoặc đã có đủ range -> bắt đầu range mới
                  if (!prev.start || (prev.start && prev.end)) {
                    return { start: date, end: null };
                  }

                  // đang chọn end
                  if (date < prev.start) {
                    // đảo nếu chọn ngày trước start
                    return { start: date, end: prev.start };
                  }

                  if (date === prev.start) {
                    // single-day range
                    return { start: date, end: date };
                  }

                  // bình thường: start < end
                  return { start: prev.start, end: date };
                });
              }}
              markedDates={(() => {
                const { start, end } = rangeDraft;
                if (!start && !end) return {};

                const marked = {};

                if (start && !end) {
                  marked[start] = {
                    startingDay: true,
                    endingDay: true,
                    color: "#0ea5e9",
                    textColor: "#fff",
                  };
                  return marked;
                }

                if (start && end) {
                  if (start === end) {
                    marked[start] = {
                      startingDay: true,
                      endingDay: true,
                      color: "#0ea5e9",
                      textColor: "#fff",
                    };
                    return marked;
                  }

                  const startDate = new Date(start);
                  const endDate = new Date(end);

                  for (
                    let d = new Date(startDate);
                    d <= endDate;
                    d = new Date(d.getTime() + ONE_DAY_MS)
                  ) {
                    const id = d.toISOString().slice(0, 10);
                    if (id === start) {
                      marked[id] = {
                        startingDay: true,
                        color: "#0ea5e9",
                        textColor: "#fff",
                      };
                    } else if (id === end) {
                      marked[id] = {
                        endingDay: true,
                        color: "#0ea5e9",
                        textColor: "#fff",
                      };
                    } else {
                      marked[id] = {
                        color: "#bae6fd",
                        textColor: "#0f172a",
                      };
                    }
                  }
                }

                return marked;
              })()}
              theme={{
                backgroundColor: cardBg,
                calendarBackground: cardBg,
                textSectionTitleColor: textSec,
                dayTextColor: text,
                monthTextColor: text,
                arrowColor: text,
                todayTextColor: primaryColor,
              }}
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                onPress={() => setDateModalVisible(false)}
                style={styles.modalTextBtn}
              >
                <Text
                  style={{
                    color: textSec,
                    fontWeight: "600",
                  }}
                >
                  Đóng
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={!canApply}
                onPress={() => {
                  if (!canApply) return;
                  const { start, end } = rangeDraft;
                  setFromDate(start ? fromDateId(start) : null);
                  setToDate(end ? fromDateId(end) : null);
                  setRangeKey("custom");
                  setDateModalVisible(false);
                  handleRefresh(); // chọn xong khoảng ngày thì refetch luôn
                }}
                style={[
                  styles.modalApplyBtn,
                  {
                    backgroundColor: canApply ? primaryColor : textSec,
                    opacity: canApply ? 1 : 0.6,
                  },
                ]}
              >
                <Text
                  style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}
                >
                  Áp dụng
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // search
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  searchInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
  },

  // range
  rangeContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  rangeLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
  },

  rangeChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.4)",
  },
  rangeChipText: {
    fontSize: 12,
    fontWeight: "600",
  },

  // list header
  listHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  listTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  listCount: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: "500",
  },

  // list
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    paddingTop: 8,
    gap: 12,
  },

  // card
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  matchTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  matchSub: {
    fontSize: 12,
    marginTop: 2,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#FEF2F2",
  },
  liveBadgeText: {
    marginLeft: 4,
    fontSize: 11,
    fontWeight: "700",
    color: "#B91C1C",
  },

  cardMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  metaText: {
    fontSize: 12,
  },

  cardFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },

  // 👉 nút Bắt trận
  startBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  startBtnText: {
    marginLeft: 4,
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  // loading / empty
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    paddingTop: 40,
    paddingHorizontal: 32,
  },
  emptyText: {
    marginTop: 8,
    textAlign: "center",
    fontSize: 13,
  },

  // modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 16,
    padding: 12,
  },
  modalBtnRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 12,
    gap: 8,
  },
  modalTextBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modalApplyBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  rangeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingRight: 16,
  },
});
