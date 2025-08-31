// app/screens/PickleBall/match/ResponsiveMatchViewer.native.jsx
import React, { useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  InteractionManager,
} from "react-native";
import { useSelector } from "react-redux";
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";

import { useLiveMatch } from "@/hooks/useLiveMatch";
import { useGetMatchPublicQuery } from "@/slices/tournamentsApiSlice";
import MatchContent from "./MatchContent";

function StatusPill({ status }) {
  const map = {
    live: {
      bg: "#fff7ed",
      bd: "#fdba74",
      color: "#9a3412",
      label: "Đang diễn ra",
    },
    finished: {
      bg: "#ecfdf5",
      bd: "#86efac",
      color: "#065f46",
      label: "Hoàn thành",
    },
    default: {
      bg: "#f1f5f9",
      bd: "#cbd5e1",
      color: "#334155",
      label: "Dự kiến",
    },
  };
  const sty = map[status] || map.default;
  return (
    <View
      style={[styles.pill, { backgroundColor: sty.bg, borderColor: sty.bd }]}
    >
      <Text style={[styles.pillText, { color: sty.color }]}>{sty.label}</Text>
    </View>
  );
}

export default function ResponsiveMatchViewer({ open, matchId, onClose }) {
  const { userInfo } = useSelector((s) => s.auth || {});
  const token = userInfo?.token;
  const insets = useSafeAreaInsets();

  const sheetRef = useRef(null);
  const snapPoints = useMemo(() => ["80%", "92%"], []);
  const DEFAULT_INDEX = 0; // 80%

  const { data: base, isLoading } = useGetMatchPublicQuery(matchId, {
    skip: !matchId || !open,
  });
  const { loading: liveLoading, data: live } = useLiveMatch(
    open ? matchId : null,
    token
  );

  const m = live || base;
  const status = m?.status || "scheduled";

  useEffect(() => {
    if (!sheetRef.current) return;

    if (open) {
      // 1) Thử API mới: present(index)
      const presented = sheetRef.current.present?.(DEFAULT_INDEX);
      // 2) Với bản không hỗ trợ param index:
      //    chạy sau khi hoàn tất tương tác + 2 khung hình để chắc chắn đã mount
      InteractionManager.runAfterInteractions(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            sheetRef.current?.snapToIndex?.(DEFAULT_INDEX);
          });
        });
      });
    } else {
      sheetRef.current.dismiss();
    }
  }, [open]);

  // Nếu đổi matchId khi đang mở, vẫn giữ 80%
  useEffect(() => {
    if (open && sheetRef.current) {
      sheetRef.current?.snapToIndex?.(DEFAULT_INDEX);
    }
  }, [open, matchId]);

  const title = `Trận đấu • ${m ? `R${m.round || 1} #${m.order ?? 0}` : ""}`;

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={snapPoints}
      enablePanDownToClose
      onDismiss={onClose}
      backdropComponent={(props) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          pressBehavior="close"
        />
      )}
      topInset={Math.max(insets.top, Platform.OS === "android" ? 12 : 0)}
      handleIndicatorStyle={{ backgroundColor: "#94a3b8" }}
      backgroundStyle={{ backgroundColor: "#fff" }}
      enableDynamicSizing={false}
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
          <StatusPill status={status} />
        </View>
        <TouchableOpacity
          onPress={() => sheetRef.current?.dismiss()}
          style={styles.closeBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialIcons name="close" size={22} color="#0f172a" />
        </TouchableOpacity>
      </View>

      {/* Lưu ý: KHÔNG set style={{flex:1}} cho BottomSheetScrollView */}
      <BottomSheetScrollView
        contentContainerStyle={{
          paddingBottom: Math.max(insets.bottom, 16),
          paddingHorizontal: 12,
          gap: 12,
        }}
      >
        <MatchContent m={m} isLoading={isLoading} liveLoading={liveLoading} />
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 4,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  pill: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 12,
    fontWeight: "600",
  },
});
