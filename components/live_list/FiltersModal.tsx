import React, {
  forwardRef,
  useImperativeHandle,
  useState,
  useEffect,
  useMemo,
  useCallback,
  memo,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  useColorScheme,
} from "react-native";
import {
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetBackdrop,
} from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@react-navigation/native";

const STATUS_OPTIONS = ["scheduled", "queued", "assigned", "live", "finished"];
const HOUR_PRESETS = [2, 4, 8, 24];
const REFRESH_PRESETS = [10, 15, 30, 60];

/* ============================
 * THEME TOKENS
 * ============================ */
function useThemeTokens() {
  // Ưu tiên theme từ react-navigation; fallback theo hệ thống
  const navTheme = useTheme?.();
  const sysScheme = useColorScheme?.() ?? "light";
  const isDark =
    typeof navTheme?.dark === "boolean" ? navTheme.dark : sysScheme === "dark";
  const scheme = isDark ? "dark" : "light";

  const tint = navTheme?.colors?.primary ?? (isDark ? "#7cc0ff" : "#0a84ff");
  const textPrimary =
    navTheme?.colors?.text ?? (isDark ? "#ffffff" : "#0f172a");
  const textSecondary = isDark ? "#cbd5e1" : "#475569";

  // Đồng bộ với màu trong NavigationContainer
  const sheetBg = navTheme?.colors?.card ?? (isDark ? "#111214" : "#ffffff");
  const border = navTheme?.colors?.border ?? (isDark ? "#3a3b40" : "#e0e0e0");
  const handle = isDark ? "#6b7280" : "#dddddd";
  const softBg = isDark ? "#1e1f23" : "#f5f5f5";

  return {
    scheme,
    tint,
    textPrimary,
    textSecondary,
    sheetBg,
    border,
    handle,
    softBg,
  };
}

const FiltersBottomSheet = forwardRef(function FiltersBottomSheet(
  { initial, onApply }: any,
  ref
) {
  const T = useThemeTokens();
  const insets = useSafeAreaInsets();
  const modalRef = React.useRef<BottomSheetModal>(null);

  // Snap points — modal luôn phủ lên trên tab bar nhờ portal
  const snapPoints = useMemo(() => ["90%", "100%"], []);

  const [statuses, setStatuses] = useState<string[]>(initial.statuses);
  const [excludeFinished, setExcludeFinished] = useState<boolean>(
    initial.excludeFinished
  );
  const [windowHours, setWindowHours] = useState<number>(initial.windowHours);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(initial.autoRefresh);
  const [refreshSec, setRefreshSec] = useState<number>(initial.refreshSec);

  // 🔧 FIX: chỉ sync khi nội dung initial thực sự đổi (không dựa vào object identity)
  const initialKey = useMemo(() => JSON.stringify(initial), [initial]);
  const syncFromInitial = useCallback((src: any) => {
    setStatuses(src?.statuses ?? [...STATUS_OPTIONS]);
    setExcludeFinished(
      typeof src?.excludeFinished === "boolean" ? src.excludeFinished : true
    );
    setWindowHours(src?.windowHours ?? 8);
    setAutoRefresh(
      typeof src?.autoRefresh === "boolean" ? src.autoRefresh : true
    );
    setRefreshSec(src?.refreshSec ?? 15);
  }, []);
  useEffect(() => {
    syncFromInitial(initial);
  }, [initialKey, syncFromInitial]);

  useImperativeHandle(ref, () => ({
    // API cũ
    expand: () => modalRef.current?.present(),
    close: () => modalRef.current?.dismiss(),
  }));

  const handleReset = useCallback(() => {
    setStatuses([...STATUS_OPTIONS]);
    setExcludeFinished(true);
    setWindowHours(8);
    setAutoRefresh(true);
    setRefreshSec(15);
  }, []);

  const toggleStatus = useCallback((status: string) => {
    setStatuses((prev) => {
      if (prev.includes(status)) {
        const next = prev.filter((s) => s !== status);
        return next.length ? next : [...STATUS_OPTIONS];
      }
      return [...prev, status];
    });
  }, []);

  const handleApply = useCallback(() => {
    onApply({
      statuses,
      excludeFinished,
      windowHours,
      autoRefresh,
      refreshSec,
    });
    modalRef.current?.dismiss();
  }, [
    statuses,
    excludeFinished,
    windowHours,
    autoRefresh,
    refreshSec,
    onApply,
  ]);

  const allSelected = statuses.length === STATUS_OPTIONS.length;

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
      />
    ),
    []
  );

  return (
    <BottomSheetModal
      ref={modalRef}
      snapPoints={snapPoints}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      backgroundStyle={[
        styles.bottomSheetBackground,
        { backgroundColor: T.sheetBg, borderTopColor: T.border },
      ]}
      handleIndicatorStyle={[
        styles.handleIndicator,
        { backgroundColor: T.handle },
      ]}
      topInset={insets.top}
      android_keyboardInputMode="adjustResize"
    >
      <BottomSheetScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 80 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: T.textPrimary }]}>Bộ lọc</Text>
          <TouchableOpacity
            onPress={handleReset}
            style={[styles.resetBtn, { backgroundColor: T.softBg }]}
            activeOpacity={0.7}
          >
            <Text style={[styles.resetBtnText, { color: T.tint }]}>
              🔄 Mặc định
            </Text>
          </TouchableOpacity>
        </View>

        {/* Trạng thái */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: T.textPrimary }]}>
            Trạng thái
          </Text>

          <TouchableOpacity
            style={styles.optionRow}
            onPress={() => setStatuses(allSelected ? [] : [...STATUS_OPTIONS])}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, { borderColor: T.tint }]}>
              {allSelected && (
                <View
                  style={[styles.checkboxInner, { backgroundColor: T.tint }]}
                />
              )}
            </View>
            <Text style={[styles.optionText, { color: T.textPrimary }]}>
              Tất cả
            </Text>
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: T.border }]} />

          {STATUS_OPTIONS.map((status) => (
            <TouchableOpacity
              key={status}
              style={styles.optionRow}
              onPress={() => toggleStatus(status)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, { borderColor: T.tint }]}>
                {statuses.includes(status) && (
                  <View
                    style={[styles.checkboxInner, { backgroundColor: T.tint }]}
                  />
                )}
              </View>
              <Text style={[styles.optionText, { color: T.textPrimary }]}>
                {status}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Cửa sổ thời gian */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: T.textPrimary }]}>
            Cửa sổ thời gian
          </Text>

          <View style={styles.buttonGrid}>
            {HOUR_PRESETS.map((h) => (
              <TouchableOpacity
                key={h}
                style={[
                  styles.gridButton,
                  { backgroundColor: T.sheetBg, borderColor: T.border },
                  windowHours === h && {
                    backgroundColor: T.tint,
                    borderColor: T.tint,
                  },
                ]}
                onPress={() => setWindowHours(h)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.gridButtonText,
                    { color: T.textSecondary },
                    windowHours === h && styles.gridButtonTextActive,
                  ]}
                >
                  {h} giờ
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.switchRow}>
            <Text style={[styles.switchLabel, { color: T.textPrimary }]}>
              {excludeFinished ? "Loại trận finished" : "Gồm cả finished"}
            </Text>
            <Switch
              value={!excludeFinished}
              onValueChange={(val) => setExcludeFinished(!val)}
              trackColor={{ false: T.border, true: T.tint }}
              thumbColor={
                !excludeFinished
                  ? "#fff"
                  : T.scheme === "dark"
                  ? "#1f2937"
                  : "#f4f3f4"
              }
            />
          </View>
        </View>

        {/* Tự động làm mới */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: T.textPrimary }]}>
            Tự động làm mới
          </Text>

          <View style={styles.switchRow}>
            <Text style={[styles.switchLabel, { color: T.textPrimary }]}>
              Bật tự động làm mới
            </Text>
            <Switch
              value={autoRefresh}
              onValueChange={setAutoRefresh}
              trackColor={{ false: T.border, true: T.tint }}
              thumbColor={
                autoRefresh
                  ? "#fff"
                  : T.scheme === "dark"
                  ? "#1f2937"
                  : "#f4f3f4"
              }
            />
          </View>

          <View style={styles.buttonGrid}>
            {REFRESH_PRESETS.map((sec) => (
              <TouchableOpacity
                key={sec}
                style={[
                  styles.gridButton,
                  { backgroundColor: T.sheetBg, borderColor: T.border },
                  refreshSec === sec &&
                    autoRefresh && {
                      backgroundColor: T.tint,
                      borderColor: T.tint,
                    },
                  !autoRefresh && styles.gridButtonDisabled,
                ]}
                onPress={() => autoRefresh && setRefreshSec(sec)}
                disabled={!autoRefresh}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.gridButtonText,
                    { color: T.textSecondary },
                    refreshSec === sec &&
                      autoRefresh &&
                      styles.gridButtonTextActive,
                    !autoRefresh && styles.gridButtonTextDisabled,
                  ]}
                >
                  {sec}s
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </BottomSheetScrollView>

      {/* Footer */}
      <View
        style={[
          styles.footer,
          {
            paddingBottom: insets.bottom + 16,
            borderTopColor: T.border,
            backgroundColor: T.sheetBg,
          },
        ]}
      >
        <TouchableOpacity
          style={[styles.cancelBtn, { backgroundColor: T.softBg }]}
          onPress={() => modalRef.current?.dismiss()}
          activeOpacity={0.7}
        >
          <Text style={[styles.cancelBtnText, { color: T.tint }]}>Hủy</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.applyBtn, { backgroundColor: T.tint }]}
          onPress={handleApply}
          activeOpacity={0.7}
        >
          <Text style={styles.applyBtnText}>Áp dụng</Text>
        </TouchableOpacity>
      </View>
    </BottomSheetModal>
  );
});

const styles = StyleSheet.create({
  bottomSheetBackground: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  handleIndicator: { width: 40, height: 4, borderRadius: 999 },
  content: { paddingHorizontal: 16 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
    paddingTop: 8,
  },
  title: { fontSize: 24, fontWeight: "700" },
  resetBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8 },
  resetBtnText: { fontSize: 14, fontWeight: "600" },
  section: { marginBottom: 28 },
  sectionTitle: { fontSize: 17, fontWeight: "600", marginBottom: 14 },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    marginRight: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxInner: { width: 14, height: 14, borderRadius: 3 },
  optionText: { fontSize: 16 },
  divider: { height: 1, marginVertical: 8 },
  buttonGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  gridButton: {
    flex: 1,
    minWidth: "47%",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
  },
  gridButtonDisabled: { opacity: 0.4 },
  gridButtonText: { fontSize: 15, fontWeight: "600" },
  gridButtonTextActive: { color: "#fff" },
  gridButtonTextDisabled: { color: "#999" },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  switchLabel: { fontSize: 16, flex: 1 },
  footer: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  cancelBtnText: { fontSize: 16, fontWeight: "600" },
  applyBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  applyBtnText: { fontSize: 16, color: "#fff", fontWeight: "700" },
});

export default memo(FiltersBottomSheet);
