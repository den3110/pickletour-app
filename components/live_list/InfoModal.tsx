import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
} from "react-native";
import { useTheme } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { Ionicons } from "@expo/vector-icons";

import {
  getLiveStatusLabel,
  hostOf,
  sid,
  timeAgo,
} from "./liveUtils";

function useThemeTokens() {
  const navTheme = useTheme?.();
  const sysScheme = useColorScheme?.() ?? "light";
  const isDark = typeof navTheme?.dark === "boolean" ? navTheme.dark : sysScheme === "dark";

  return {
    isDark,
    tint: navTheme?.colors?.primary ?? (isDark ? "#6ee7d8" : "#0f766e"),
    textPrimary: navTheme?.colors?.text ?? (isDark ? "#ffffff" : "#102a26"),
    textSecondary: isDark ? "#b8c4c2" : "#536865",
    sheetBg: navTheme?.colors?.card ?? (isDark ? "#10201d" : "#fffdf8"),
    border: navTheme?.colors?.border ?? (isDark ? "#23403a" : "#dce8e4"),
    softBg: isDark ? "#18302c" : "#f1f7f5",
    handle: isDark ? "#4e6b65" : "#b3c8c3",
  };
}

function formatDate(value: any) {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return date.toLocaleString("vi-VN");
}

function providerLabel(session: any) {
  const key = String(session?.provider || session?.kind || "").toLowerCase();
  if (key.includes("facebook")) return "Facebook";
  if (key.includes("youtube")) return "YouTube";
  if (key.includes("server2")) return "PickleTour CDN";
  if (key.includes("file") || key.includes("hls")) return "PickleTour";
  return session?.providerLabel || session?.label || "Stream";
}

export default function InfoModal({
  visible,
  onClose,
  match = {},
  sessions = [],
  onCopy,
  onOpenUrl,
}: any) {
  const T = useThemeTokens();
  const insets = useSafeAreaInsets();
  const modalRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ["82%"], []);

  useEffect(() => {
    if (visible) modalRef.current?.present();
    else modalRef.current?.dismiss();
  }, [visible]);

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
      enablePanDownToClose
      topInset={insets.top}
      onDismiss={onClose}
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
      <View style={[styles.header, { borderBottomColor: T.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.eyebrow, { color: T.tint }]}>Thông tin phát sóng</Text>
          <Text style={[styles.title, { color: T.textPrimary }]} numberOfLines={2}>
            {match?.displayCode || match?.code || "Trận đấu"}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => modalRef.current?.dismiss()}
          style={[styles.closeBtn, { backgroundColor: T.softBg, borderColor: T.border }]}
        >
          <Ionicons name="close" size={18} color={T.textPrimary} />
        </TouchableOpacity>
      </View>

      <BottomSheetScrollView
        contentContainerStyle={{
          paddingHorizontal: 18,
          paddingTop: 18,
          paddingBottom: insets.bottom + 24,
          gap: 18,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.panel, { backgroundColor: T.softBg, borderColor: T.border }]}>
          <InfoRow
            label="Mã trận"
            value={match?.displayCode || match?.code || "-"}
            T={T}
            onCopy={
              match?.displayCode || match?.code
                ? () => onCopy?.(match?.displayCode || match?.code, "Đã sao chép mã trận")
                : undefined
            }
          />
          <InfoRow label="Trạng thái" value={getLiveStatusLabel(match?.status)} T={T} />
          <InfoRow label="Sân" value={match?.courtLabel || "-"} T={T} />
          <InfoRow label="Giải đấu" value={match?.tournament?.name || "-"} T={T} />
          <InfoRow label="Cập nhật" value={timeAgo(match?.updatedAt) || "-"} T={T} />
          <InfoRow label="Lịch" value={formatDate(match?.scheduledAt)} T={T} />
          <InfoRow label="Bắt đầu" value={formatDate(match?.startedAt)} T={T} />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: T.textPrimary }]}>Nguồn xem</Text>
          {Array.isArray(sessions) && sessions.length > 0 ? (
            sessions.map((session: any) => {
              const key = sid(session?.key || session?.watchUrl || session?.openUrl);
              const label = providerLabel(session);
              const targetUrl = session?.watchUrl || session?.openUrl || "";

              return (
                <View
                  key={key || label}
                  style={[styles.sessionCard, { backgroundColor: T.softBg, borderColor: T.border }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.sessionTitle, { color: T.textPrimary }]}>
                      {session?.label || label}
                    </Text>
                    <Text
                      style={[styles.sessionMeta, { color: T.textSecondary }]}
                      numberOfLines={1}
                    >
                      {label}
                      {hostOf(targetUrl) ? ` • ${hostOf(targetUrl)}` : ""}
                    </Text>
                  </View>

                  <View style={styles.sessionActions}>
                    {!!targetUrl && (
                      <TouchableOpacity
                        style={[styles.actionBtn, { borderColor: T.border, backgroundColor: T.sheetBg }]}
                        onPress={() => onOpenUrl?.(targetUrl)}
                      >
                        <Ionicons name="open-outline" size={16} color={T.textPrimary} />
                      </TouchableOpacity>
                    )}
                    {!!targetUrl && (
                      <TouchableOpacity
                        style={[styles.actionBtn, { borderColor: T.border, backgroundColor: T.sheetBg }]}
                        onPress={() => onCopy?.(targetUrl, "Đã sao chép liên kết")}
                      >
                        <Ionicons name="copy-outline" size={16} color={T.textPrimary} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })
          ) : (
            <View style={[styles.emptyBox, { backgroundColor: T.softBg, borderColor: T.border }]}>
              <Text style={[styles.emptyText, { color: T.textSecondary }]}>
                Trận này chưa có liên kết phát công khai.
              </Text>
            </View>
          )}
        </View>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

function InfoRow({ label, value, onCopy, T }: any) {
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: T.textSecondary }]}>{label}</Text>
      <View style={styles.infoValueWrap}>
        <Text style={[styles.infoValue, { color: T.textPrimary }]} numberOfLines={2}>
          {value || "-"}
        </Text>
        {onCopy ? (
          <TouchableOpacity onPress={onCopy} style={styles.inlineCopy}>
            <Ionicons name="copy-outline" size={15} color={T.textSecondary} />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

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
    gap: 12,
    paddingHorizontal: 18,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  panel: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  infoRow: {
    paddingVertical: 10,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  infoValueWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  infoValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
  },
  inlineCopy: {
    padding: 4,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  sessionCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  sessionTitle: {
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 4,
  },
  sessionMeta: {
    fontSize: 12,
    fontWeight: "500",
  },
  sessionActions: {
    flexDirection: "row",
    gap: 8,
  },
  actionBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  emptyBox: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
  },
});
