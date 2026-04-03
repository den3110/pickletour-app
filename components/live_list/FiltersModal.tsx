import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  useColorScheme,
} from "react-native";
import { useTheme } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";

const STATUS_OPTIONS = ["scheduled", "queued", "assigned", "live", "finished"];
const HOUR_PRESETS = [4, 8, 24, 72];
const REFRESH_PRESETS = [10, 15, 30, 60];
const DEFAULT_FILTERS = {
  statuses: [...STATUS_OPTIONS],
  excludeFinished: true,
  windowHours: 24,
  autoRefresh: true,
  refreshSec: 15,
};

function useThemeTokens() {
  const navTheme = useTheme?.();
  const sysScheme = useColorScheme?.() ?? "light";
  const isDark = typeof navTheme?.dark === "boolean" ? navTheme.dark : sysScheme === "dark";

  return {
    isDark,
    tint: navTheme?.colors?.primary ?? (isDark ? "#6ee7d8" : "#0f766e"),
    textPrimary: navTheme?.colors?.text ?? (isDark ? "#ffffff" : "#102a26"),
    textSecondary: isDark ? "#b8c4c2" : "#5a6f6a",
    sheetBg: navTheme?.colors?.card ?? (isDark ? "#10201d" : "#fffdf8"),
    border: navTheme?.colors?.border ?? (isDark ? "#23403a" : "#dce8e4"),
    softBg: isDark ? "#18302c" : "#f1f7f5",
    handle: isDark ? "#4e6b65" : "#b3c8c3",
  };
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    scheduled: "Đã lên lịch",
    queued: "Chờ thi đấu",
    assigned: "Đã gán sân",
    live: "Đang phát",
    finished: "Đã kết thúc",
  };
  return map[status] || status;
}

const FiltersBottomSheet = forwardRef(function FiltersBottomSheet(
  { initial, defaults = DEFAULT_FILTERS, onApply }: any,
  ref
) {
  const T = useThemeTokens();
  const insets = useSafeAreaInsets();
  const modalRef = React.useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ["90%"], []);

  const [statuses, setStatuses] = useState<string[]>(
    initial?.statuses || defaults?.statuses || [...STATUS_OPTIONS]
  );
  const [excludeFinished, setExcludeFinished] = useState<boolean>(
    typeof initial?.excludeFinished === "boolean"
      ? initial.excludeFinished
      : typeof defaults?.excludeFinished === "boolean"
      ? defaults.excludeFinished
      : true
  );
  const [windowHours, setWindowHours] = useState<number>(
    initial?.windowHours || defaults?.windowHours || 24
  );
  const [autoRefresh, setAutoRefresh] = useState<boolean>(
    typeof initial?.autoRefresh === "boolean"
      ? initial.autoRefresh
      : typeof defaults?.autoRefresh === "boolean"
      ? defaults.autoRefresh
      : true
  );
  const [refreshSec, setRefreshSec] = useState<number>(
    initial?.refreshSec || defaults?.refreshSec || 15
  );

  const initialKey = useMemo(() => JSON.stringify(initial || {}), [initial]);
  const defaultKey = useMemo(() => JSON.stringify(defaults || {}), [defaults]);

  useEffect(() => {
    setStatuses(initial?.statuses || defaults?.statuses || [...STATUS_OPTIONS]);
    setExcludeFinished(
      typeof initial?.excludeFinished === "boolean"
        ? initial.excludeFinished
        : typeof defaults?.excludeFinished === "boolean"
        ? defaults.excludeFinished
        : true
    );
    setWindowHours(initial?.windowHours || defaults?.windowHours || 24);
    setAutoRefresh(
      typeof initial?.autoRefresh === "boolean"
        ? initial.autoRefresh
        : typeof defaults?.autoRefresh === "boolean"
        ? defaults.autoRefresh
        : true
    );
    setRefreshSec(initial?.refreshSec || defaults?.refreshSec || 15);
  }, [defaultKey, defaults, initial, initialKey]);

  useImperativeHandle(ref, () => ({
    expand: () => modalRef.current?.present(),
    close: () => modalRef.current?.dismiss(),
  }));

  const toggleStatus = useCallback((status: string) => {
    setStatuses((prev) => {
      if (prev.includes(status)) {
        const next = prev.filter((item) => item !== status);
        return next.length ? next : [...STATUS_OPTIONS];
      }
      return [...prev, status];
    });
  }, []);

  const handleReset = useCallback(() => {
    setStatuses(defaults?.statuses || [...STATUS_OPTIONS]);
    setExcludeFinished(
      typeof defaults?.excludeFinished === "boolean" ? defaults.excludeFinished : true
    );
    setWindowHours(defaults?.windowHours || 24);
    setAutoRefresh(
      typeof defaults?.autoRefresh === "boolean" ? defaults.autoRefresh : true
    );
    setRefreshSec(defaults?.refreshSec || 15);
  }, [defaults]);

  const handleApply = useCallback(() => {
    onApply?.({
      statuses,
      excludeFinished,
      windowHours,
      autoRefresh,
      refreshSec,
    });
    modalRef.current?.dismiss();
  }, [autoRefresh, excludeFinished, onApply, refreshSec, statuses, windowHours]);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.48}
      />
    ),
    []
  );

  return (
    <BottomSheetModal
      ref={modalRef}
      snapPoints={snapPoints}
      topInset={insets.top}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={[styles.handle, { backgroundColor: T.handle }]}
      backgroundStyle={[
        styles.sheet,
        {
          backgroundColor: T.sheetBg,
          borderTopColor: T.border,
        },
      ]}
      android_keyboardInputMode="adjustResize"
    >
      <BottomSheetScrollView
        contentContainerStyle={{
          paddingHorizontal: 18,
          paddingTop: 12,
          paddingBottom: insets.bottom + 84,
          gap: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={[styles.eyebrow, { color: T.tint }]}>Điều chỉnh feed</Text>
            <Text style={[styles.title, { color: T.textPrimary }]}>Bộ lọc live</Text>
          </View>
          <TouchableOpacity
            onPress={handleReset}
            style={[styles.resetBtn, { backgroundColor: T.softBg, borderColor: T.border }]}
          >
            <Text style={[styles.resetText, { color: T.tint }]}>Mặc định</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: T.textPrimary }]}>Trạng thái</Text>
          <View style={styles.chipWrap}>
            {STATUS_OPTIONS.map((status) => {
              const active = statuses.includes(status);
              return (
                <TouchableOpacity
                  key={status}
                  onPress={() => toggleStatus(status)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? T.tint : T.softBg,
                      borderColor: active ? T.tint : T.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: active ? "#ffffff" : T.textPrimary },
                    ]}
                  >
                    {statusLabel(status)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: T.textPrimary }]}>Cửa sổ thời gian</Text>
          <View style={styles.chipWrap}>
            {HOUR_PRESETS.map((hours) => {
              const active = windowHours === hours;
              return (
                <TouchableOpacity
                  key={hours}
                  onPress={() => setWindowHours(hours)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? T.tint : T.softBg,
                      borderColor: active ? T.tint : T.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: active ? "#ffffff" : T.textPrimary },
                    ]}
                  >
                    {hours} giờ
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={[styles.switchRow, { backgroundColor: T.softBg, borderColor: T.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.switchTitle, { color: T.textPrimary }]}>Ẩn trận đã xong</Text>
              <Text style={[styles.switchHint, { color: T.textSecondary }]}>
                Bật nếu bạn chỉ muốn xem các trận sắp diễn ra hoặc đang phát.
              </Text>
            </View>
            <Switch
              value={excludeFinished}
              onValueChange={setExcludeFinished}
              trackColor={{ false: T.border, true: T.tint }}
              thumbColor={excludeFinished ? "#ffffff" : T.isDark ? "#1d2d29" : "#f8fafc"}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: T.textPrimary }]}>Tự làm mới</Text>
          <View style={[styles.switchRow, { backgroundColor: T.softBg, borderColor: T.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.switchTitle, { color: T.textPrimary }]}>Bật tự đồng bộ</Text>
              <Text style={[styles.switchHint, { color: T.textSecondary }]}>
                Feed sẽ tự cập nhật khi có thay đổi từ sân hoặc giải đấu.
              </Text>
            </View>
            <Switch
              value={autoRefresh}
              onValueChange={setAutoRefresh}
              trackColor={{ false: T.border, true: T.tint }}
              thumbColor={autoRefresh ? "#ffffff" : T.isDark ? "#1d2d29" : "#f8fafc"}
            />
          </View>

          <View style={styles.chipWrap}>
            {REFRESH_PRESETS.map((seconds) => {
              const active = autoRefresh && refreshSec === seconds;
              return (
                <TouchableOpacity
                  key={seconds}
                  disabled={!autoRefresh}
                  onPress={() => setRefreshSec(seconds)}
                  style={[
                    styles.chip,
                    {
                      opacity: autoRefresh ? 1 : 0.45,
                      backgroundColor: active ? T.tint : T.softBg,
                      borderColor: active ? T.tint : T.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: active ? "#ffffff" : T.textPrimary },
                    ]}
                  >
                    {seconds}s
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </BottomSheetScrollView>

      <View
        style={[
          styles.footer,
          {
            paddingBottom: insets.bottom + 14,
            backgroundColor: T.sheetBg,
            borderTopColor: T.border,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => modalRef.current?.dismiss()}
          style={[styles.footerBtn, { backgroundColor: T.softBg, borderColor: T.border }]}
        >
          <Text style={[styles.footerBtnText, { color: T.textPrimary }]}>Hủy</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleApply}
          style={[styles.footerBtn, styles.primaryBtn, { backgroundColor: T.tint, borderColor: T.tint }]}
        >
          <Text style={[styles.footerBtnText, { color: "#ffffff" }]}>Áp dụng</Text>
        </TouchableOpacity>
      </View>
    </BottomSheetModal>
  );
});

const styles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 999,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
  },
  resetBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
  },
  resetText: {
    fontSize: 13,
    fontWeight: "700",
  },
  section: {
    gap: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "700",
  },
  switchRow: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  switchTitle: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
  },
  switchHint: {
    fontSize: 12,
    lineHeight: 18,
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  primaryBtn: {
    flex: 1.3,
  },
  footerBtnText: {
    fontSize: 15,
    fontWeight: "800",
  },
});

export default memo(FiltersBottomSheet);
