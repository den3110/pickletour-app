// app/components/UserInfoGate.tsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  useColorScheme,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
// NOTE: chỉnh path slice này cho khớp repo của bạn
import { useGetProfileQuery } from "@/slices/usersApiSlice";

/** Helper: lấy safely các field phổ biến trong repo của bạn */
function pickAvatar(u) {
  return (
    u?.avatar?.url ||
    u?.avatarUrl ||
    (typeof u?.avatar === "string" ? u.avatar : null)
  );
}
function pickName(u) {
  return u?.fullName || u?.name || u?.hoTen || null;
}
function pickProvince(u) {
  return u?.province || u?.tinh || u?.address?.province || null;
}
function pickCccdNumber(u) {
  return u?.cccd?.number || u?.cccdNumber || u?.cmnd || null;
}
function pickCccdFront(u) {
  return (
    u?.cccd?.front?.url ||
    u?.cccd?.frontUrl ||
    u?.cccdFront ||
    u?.cccdFrontUrl ||
    null
  );
}
function pickCccdBack(u) {
  return (
    u?.cccd?.back?.url ||
    u?.cccd?.backUrl ||
    u?.cccdBack ||
    u?.cccdBackUrl ||
    null
  );
}

function computeMissingFields(profile) {
  const missing = [];

  const fullName = pickName(profile);
  const province = pickProvince(profile);
  const cccdNumber = pickCccdNumber(profile);
  const cccdFront = pickCccdFront(profile);
  const cccdBack = pickCccdBack(profile);
  const avatar = pickAvatar(profile);

  if (!fullName) missing.push("Họ tên");
  if (!province) missing.push("Tỉnh/Thành phố");
  if (!avatar) missing.push("Ảnh đại diện");
  if (!cccdNumber) missing.push("Số CCCD");
  if (!cccdFront) missing.push("Ảnh CCCD mặt trước");
  if (!cccdBack) missing.push("Ảnh CCCD mặt sau");

  return missing;
}

export default function UserInfoGate() {
  const scheme = useColorScheme();
  const { data: profile, isFetching, refetch } = useGetProfileQuery();
  const [open, setOpen] = useState(false);

  const missing = useMemo(
    () => (profile ? computeMissingFields(profile) : ["loading"]),
    [profile]
  );

  const isComplete = useMemo(
    () => profile && missing.length === 0,
    [profile, missing]
  );

  // Refetch khi màn hình root lấy lại focus (từ trang Profile quay về)
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  // Điều khiển mở/đóng modal theo trạng thái dữ liệu
  useEffect(() => {
    if (isFetching) return; // đợi load xong
    if (!profile) {
      // Chưa có profile → không mở modal (hoặc tuỳ logic login)
      setOpen(false);
      return;
    }
    setOpen(!isComplete);
  }, [profile, isComplete, isFetching]);

  const goToProfile = () => {
    // Đóng modal để user thao tác ở trang Profile; nếu chưa đủ khi quay lại, gate sẽ mở lại.
    setOpen(false);
    // Đường dẫn tới trang profile của bạn: app/(tabs)/profile/index.jsx
    router.push("/(tabs)/profile");
  };

  if (isComplete || isFetching) return null;

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={() => {
        // Không cho đóng bằng back nếu chưa đủ thông tin
        if (isComplete) setOpen(false);
      }}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            scheme === "dark" ? styles.cardDark : styles.cardLight,
          ]}
        >
          <Text style={[styles.title, scheme === "dark" && { color: "#fff" }]}>
            Cần hoàn tất hồ sơ
          </Text>

          <Text
            style={[styles.desc, scheme === "dark" && { color: "#e5e7eb" }]}
          >
            Để tiếp tục sử dụng ứng dụng, vui lòng cập nhật đầy đủ thông tin bắt
            buộc:
          </Text>

          {/* Danh sách thiếu */}
          <View style={styles.missingWrap}>
            {missing.map((label) =>
              label === "loading" ? null : (
                <View key={label} style={styles.chip}>
                  <Text style={styles.chipText}>{label}</Text>
                </View>
              )
            )}
          </View>

          <Pressable
            onPress={goToProfile}
            style={({ pressed }) => [
              styles.btnPrimary,
              pressed && { opacity: 0.9 },
              Platform.OS === "android" && { elevation: 1 },
            ]}
          >
            <Text style={styles.btnPrimaryText}>Cập nhật ngay</Text>
          </Pressable>

          <Text
            style={[styles.note, scheme === "dark" && { color: "#cbd5e1" }]}
          >
            Sau khi bạn cập nhật đủ, thông báo này sẽ tự tắt.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "#00000066",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  card: {
    width: "100%",
    maxWidth: 440,
    borderRadius: 16,
    padding: 16,
  },
  cardLight: { backgroundColor: "#ffffff" },
  cardDark: {
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  title: { fontSize: 18, fontWeight: "800", color: "#0f172a" },
  desc: { marginTop: 8, color: "#374151" },
  missingWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  chip: {
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: "#ef44441A", // đỏ nhạt
    borderWidth: 1,
    borderColor: "#ef4444",
  },
  chipText: { color: "#b91c1c", fontWeight: "700", fontSize: 12 },
  btnPrimary: {
    marginTop: 16,
    backgroundColor: "#2563eb",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  btnPrimaryText: { color: "#fff", fontWeight: "800" },
  note: { marginTop: 10, fontSize: 12, color: "#6b7280" },
});
