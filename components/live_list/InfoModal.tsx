// InfoModalBottomSheet.jsx (Expo SDK 54)
// Uses @gorhom/bottom-sheet modal (portal) + sticky footer + safe-area

import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { useTheme } from "@react-navigation/native";

const { height } = Dimensions.get("window");

/* ============================
 * THEME TOKENS
 * ============================ */
function useThemeTokens() {
  // Ưu tiên theme từ react-navigation; fallback hệ thống
  const navTheme = useTheme?.();
  const sysScheme = useColorScheme?.() ?? "light";
  const isDark =
    typeof navTheme?.dark === "boolean" ? navTheme.dark : sysScheme === "dark";
  const scheme = isDark ? "dark" : "light";

  const tint = navTheme?.colors?.primary ?? (isDark ? "#7cc0ff" : "#0a84ff");
  const textPrimary =
    navTheme?.colors?.text ?? (isDark ? "#ffffff" : "#0f172a");
  const textSecondary = isDark ? "#cbd5e1" : "#475569";
  const muted = isDark ? "#9aa4b2" : "#666";

  // Dùng màu 'card' & 'border' của navigation cho sheet để đồng bộ toàn app
  const sheetBg = navTheme?.colors?.card ?? (isDark ? "#111214" : "#ffffff");
  const sheetBorder =
    navTheme?.colors?.border ?? (isDark ? "#3a3b40" : "#e0e0e0");
  const handle = isDark ? "#6b7280" : "#ddd";

  const softBg = isDark ? "#1e1f23" : "#eef3f8";

  return {
    scheme,
    tint,
    textPrimary,
    textSecondary,
    muted,
    sheetBg,
    sheetBorder,
    handle,
    softBg,
  };
}

// ---------- utils ----------
function timeAgo(date) {
  if (!date) return "";
  const d = new Date(date);
  const diff = Math.max(0, Date.now() - d.getTime());
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s trước`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m trước`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h trước`;
  const day = Math.floor(hr / 24);
  return `${day}d trước`;
}

const providerMeta = (p) =>
  p === "youtube"
    ? { label: "YouTube", icon: "▶️" }
    : p === "facebook"
    ? { label: "Facebook", icon: "👥" }
    : { label: p || "Stream", icon: "📺" };

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

const VI_STATUS_LABELS = {
  scheduled: "Đã lên lịch",
  queued: "Chờ thi đấu",
  assigned: "Đã gán sân",
  finished: "Đã kết thúc",
  ended: "Đã kết thúc",
  paused: "Tạm dừng",
  canceled: "Đã hủy",
};

function viStatus(s) {
  if (!s) return "-";
  const key = String(s).toLowerCase();
  if (key === "live") return "LIVE";
  return VI_STATUS_LABELS[key] || s;
}

// ---------- component ----------
/**
 * Props:
 * - visible: boolean
 * - onClose: () => void
 * - match: object
 * - sessions: array
 * - onCopy: (text: string, toast?: string) => void
 * - onOpenUrl: (url: string) => void
 */
export default function InfoModal({
  visible,
  onClose,
  match = {},
  sessions = [],
  onCopy,
  onOpenUrl,
}) {
  const T = useThemeTokens();
  const insets = useSafeAreaInsets();
  const modalRef = React.useRef(null);
  const [footerH, setFooterH] = React.useState(0);

  // default 80% height
  const snapPoints = React.useMemo(() => ["80%"], []);

  React.useEffect(() => {
    if (visible) modalRef.current?.present();
    else modalRef.current?.dismiss();
  }, [visible]);

  const renderBackdrop = React.useCallback(
    (props) => (
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
      backgroundStyle={[
        styles.sheetBg,
        { backgroundColor: T.sheetBg, borderTopColor: T.sheetBorder },
      ]}
      handleIndicatorStyle={[
        styles.handleIndicator,
        { backgroundColor: T.handle },
      ]}
      backdropComponent={renderBackdrop}
      topInset={insets.top}
      onDismiss={onClose}
      android_keyboardInputMode="adjustResize"
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: T.sheetBorder }]}>
        <Text style={[styles.title, { color: T.textPrimary }]}>
          Thông tin trận
        </Text>
        <TouchableOpacity
          onPress={() => modalRef.current?.dismiss()}
          style={styles.closeBtn}
        >
          <Text style={[styles.closeIcon, { color: T.textSecondary }]}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <BottomSheetScrollView
        style={styles.content}
        contentContainerStyle={{
          paddingBottom: (insets.bottom || 0) + footerH + 12,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Match Info */}
        <View style={styles.section}>
          <InfoRow
            label="Mã VT/VBT"
            value={match.code || "-"}
            onCopy={
              match.code ? () => onCopy?.(match.code, "Đã copy mã trận!") : null
            }
            T={T}
          />

          {match.labelKey ? (
            <InfoRow label="Label Key" value={match.labelKey} T={T} />
          ) : null}

          <InfoRow label="Trạng thái" value={viStatus(match.status)} T={T} />
          <InfoRow label="Sân" value={match.courtLabel || "-"} T={T} />

          {match.startedAt ? (
            <InfoRow
              label="Bắt đầu"
              value={new Date(match.startedAt).toLocaleString("vi-VN")}
              T={T}
            />
          ) : null}

          {match.scheduledAt ? (
            <InfoRow
              label="Lịch"
              value={new Date(match.scheduledAt).toLocaleString("vi-VN")}
              T={T}
            />
          ) : null}

          {match.updatedAt ? (
            <InfoRow label="Cập nhật" value={timeAgo(match.updatedAt)} T={T} />
          ) : null}
        </View>

        {/* Platforms */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: T.textPrimary }]}>
            Nền tảng
          </Text>

          {Array.isArray(sessions) && sessions.length > 0 ? (
            sessions.map((session, i) => {
              const meta = providerMeta(session.provider);
              return (
                <View
                  key={`${session.provider}-${i}`}
                  style={[
                    styles.platformRow,
                    { borderBottomColor: T.sheetBorder },
                  ]}
                >
                  <View style={styles.platformInfo}>
                    <Text
                      style={[styles.platformIcon, { color: T.textPrimary }]}
                    >
                      {meta.icon}
                    </Text>
                    <View style={styles.platformText}>
                      <Text
                        style={[styles.platformName, { color: T.textPrimary }]}
                      >
                        {meta.label}
                      </Text>
                      <Text
                        style={[
                          styles.platformHost,
                          { color: T.textSecondary },
                        ]}
                        numberOfLines={1}
                      >
                        {hostOf(session.watchUrl)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.platformActions}>
                    <TouchableOpacity
                      style={[styles.openBtn, { borderColor: T.tint }]}
                      onPress={() => onOpenUrl?.(session.watchUrl)}
                    >
                      <Text style={[styles.openBtnText, { color: T.tint }]}>
                        🔗 Mở
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.copyBtn,
                        {
                          borderColor: T.sheetBorder,
                          backgroundColor: T.softBg,
                        },
                      ]}
                      onPress={() => onCopy?.(session.watchUrl)}
                    >
                      <Text
                        style={[styles.copyBtnText, { color: T.textPrimary }]}
                      >
                        📋
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          ) : (
            <Text style={[styles.noSessions, { color: T.muted }]}>
              Không có URL phát hợp lệ.
            </Text>
          )}
        </View>
      </BottomSheetScrollView>

      {/* Sticky Footer */}
      <View
        style={[
          styles.footer,
          {
            paddingBottom: (insets.bottom || 0) + 16,
            borderTopColor: T.sheetBorder,
            backgroundColor: T.sheetBg,
          },
        ]}
        onLayout={(e) => setFooterH(e.nativeEvent.layout.height)}
      >
        <View style={styles.footerRow}>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: T.softBg }]}
            onPress={() => modalRef.current?.dismiss()}
          >
            <Text style={[styles.secondaryText, { color: T.tint }]}>Hủy</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: T.tint }]}
            onPress={() => modalRef.current?.dismiss()}
          >
            <Text style={styles.primaryText}>Đóng</Text>
          </TouchableOpacity>
        </View>
      </View>
    </BottomSheetModal>
  );
}

// ---------- sub components ----------
function InfoRow({ label, value, onCopy, T }) {
  return (
    <View style={[styles.infoRow, { borderBottomColor: T.sheetBorder }]}>
      <Text style={[styles.infoLabel, { color: T.textSecondary }]}>
        {label}
      </Text>
      <View style={styles.infoValueContainer}>
        <Text
          style={[styles.infoValue, { color: T.textPrimary }]}
          numberOfLines={2}
        >
          {value}
        </Text>
        {!!onCopy && (
          <TouchableOpacity style={styles.infoCopyBtn} onPress={onCopy}>
            <Text style={[styles.infoCopyIcon, { color: T.textSecondary }]}>
              📋
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ---------- styles ----------
const styles = StyleSheet.create({
  sheetBg: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  handleIndicator: {
    width: 40,
    height: 4,
    borderRadius: 999,
    alignSelf: "center",
    marginTop: 8,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 20, fontWeight: "700" },
  closeBtn: { padding: 4 },
  closeIcon: { fontSize: 24 },

  // Content
  content: { paddingHorizontal: 16 },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },

  // Info rows
  infoRow: {
    flexDirection: "row",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  infoLabel: {
    width: 100,
    fontSize: 14,
    fontWeight: "500",
  },
  infoValueContainer: { flex: 1, flexDirection: "row", alignItems: "center" },
  infoValue: { flex: 1, fontSize: 14 },
  infoCopyBtn: { marginLeft: 8, padding: 4 },
  infoCopyIcon: { fontSize: 16 },

  // Platform rows
  platformRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  platformInfo: { flex: 1, flexDirection: "row", alignItems: "center" },
  platformIcon: { fontSize: 20, marginRight: 12 },
  platformText: { flex: 1 },
  platformName: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 2,
  },
  platformHost: { fontSize: 12 },
  platformActions: { flexDirection: "row", gap: 8 },
  openBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  openBtnText: { fontSize: 12, fontWeight: "600" },
  copyBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  copyBtnText: { fontSize: 14 },
  noSessions: {
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 20,
  },

  // Footer
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  footerRow: { flexDirection: "row", gap: 12 },
  actionButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { fontSize: 16, color: "#fff", fontWeight: "700" },
  secondaryText: { fontSize: 16, fontWeight: "700" },
});
