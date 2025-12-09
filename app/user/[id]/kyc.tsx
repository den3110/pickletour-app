import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StatusBar,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, router, Stack } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import ImageViewing from "react-native-image-viewing";
import {
  useGetKycCheckDataQuery,
  useUpdateKycStatusMutation,
} from "@/slices/usersApiSlice";
import { normalizeUrl } from "@/utils/normalizeUri";

export default function KycCheckScreen() {
  const { id } = useLocalSearchParams();
  const theme = useTheme();
  const isDark = theme.dark;

  // --- Theme Colors ---
  const colors = {
    bg: isDark ? "#121212" : "#F5F7FA",
    card: isDark ? "#1E1E1E" : "#FFFFFF",
    text: isDark ? "#FFFFFF" : "#333333",
    subText: isDark ? "#A0A0A0" : "#666666",
    border: isDark ? "#333333" : "#E0E0E0",
  };

  // --- API ---
  const { data, isLoading, refetch } = useGetKycCheckDataQuery(id);
  const [updateStatus, { isLoading: isUpdating }] =
    useUpdateKycStatusMutation();

  // --- Viewer State ---
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Chuẩn bị ảnh
  const frontImg = normalizeUrl(data?.cccdImages?.front);
  const backImg = normalizeUrl(data?.cccdImages?.back);

  const images = [
    ...(frontImg ? [{ uri: frontImg }] : []),
    ...(backImg ? [{ uri: backImg }] : []),
  ];

  const handleImagePress = (index) => {
    if (images.length === 0) return;
    setCurrentImageIndex(index);
    setIsViewerOpen(true);
  };

  const handleProcess = (status) => {
    Alert.alert(
      "Xác nhận",
      `Bạn muốn ${status === "verified" ? "DUYỆT" : "TỪ CHỐI"} hồ sơ này?`,
      [
        { text: "Huỷ", style: "cancel" },
        {
          text: "Đồng ý",
          style: status === "rejected" ? "destructive" : "default",
          onPress: async () => {
            try {
              await updateStatus({ userId: id, status }).unwrap();
              Alert.alert("Thành công", "Đã cập nhật trạng thái.");
              router.back();
            } catch (err) {
              Alert.alert("Lỗi", "Không thể cập nhật.");
            }
          },
        },
      ]
    );
  };

  // --- Helper lấy thông tin hiển thị trạng thái ---
  const getStatusInfo = (status) => {
    switch (status) {
      case "verified":
        return {
          label: "Đã xác thực",
          bg: "#E8F5E9",
          color: "#2E7D32",
        };
      case "rejected":
        return {
          label: "Bị từ chối",
          bg: "#FFEBEE",
          color: "#C62828",
        };
      case "pending":
        return {
          label: "Đang chờ duyệt",
          bg: "#FFF3E0",
          color: "#EF6C00",
        };
      case "unverified":
      default:
        return {
          label: "Chưa xác thực",
          bg: isDark ? "#333" : "#EEEEEE", // Màu xám cho chưa xác thực
          color: isDark ? "#CCC" : "#757575",
        };
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <Text style={{ color: colors.text }}>Không tìm thấy dữ liệu.</Text>
      </View>
    );
  }

  // Lấy info trạng thái hiện tại
  const statusMeta = getStatusInfo(data.cccdStatus);

  return (
    <>
      <Stack.Screen
        options={{
          title: "Kyc",
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.back()}
              style={{
                paddingHorizontal: 8,
                paddingVertical: 4,
              }}
            >
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </TouchableOpacity>
          ),
        }}
      />
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <Stack.Screen
          options={{
            title: "Duyệt định danh",
            headerStyle: { backgroundColor: colors.card },
            headerTintColor: colors.text,
          }}
        />
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
          {/* Info Card */}
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <Text style={[styles.label, { color: colors.subText }]}>
              Họ tên:{" "}
              <Text style={{ color: colors.text, fontWeight: "700" }}>
                {data.name}
              </Text>
            </Text>
            <Text
              style={[styles.label, { color: colors.subText, marginTop: 8 }]}
            >
              Số CCCD khai báo:
            </Text>
            <Text style={[styles.cccdText, { color: "#6366F1" }]}>
              {data.cccd || "Chưa nhập"}
            </Text>

            {/* Badge hiển thị trạng thái đã Việt hóa */}
            <View
              style={[styles.statusBadge, { backgroundColor: statusMeta.bg }]}
            >
              <Text
                style={{
                  fontWeight: "700",
                  color: statusMeta.color,
                }}
              >
                Trạng thái: {statusMeta.label.toUpperCase()}
              </Text>
            </View>
          </View>

          {/* Images Area */}
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Ảnh CCCD/CMND
          </Text>

          <View style={styles.imageGrid}>
            {/* Mặt trước */}
            <TouchableOpacity
              style={[
                styles.imageWrapper,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
              onPress={() => handleImagePress(0)}
            >
              <Text style={styles.imageTag}>Mặt trước</Text>
              {frontImg ? (
                <Image
                  source={{ uri: frontImg }}
                  style={styles.image}
                  contentFit="contain"
                />
              ) : (
                <View style={styles.noImage}>
                  <Ionicons
                    name="image-outline"
                    size={32}
                    color={colors.subText}
                  />
                  <Text style={{ color: colors.subText, fontSize: 12 }}>
                    Trống
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Mặt sau */}
            <TouchableOpacity
              style={[
                styles.imageWrapper,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
              onPress={() => handleImagePress(frontImg ? 1 : 0)}
            >
              <Text style={styles.imageTag}>Mặt sau</Text>
              {backImg ? (
                <Image
                  source={{ uri: backImg }}
                  style={styles.image}
                  contentFit="contain"
                />
              ) : (
                <View style={styles.noImage}>
                  <Ionicons
                    name="image-outline"
                    size={32}
                    color={colors.subText}
                  />
                  <Text style={{ color: colors.subText, fontSize: 12 }}>
                    Trống
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          <Text
            style={{
              textAlign: "center",
              color: colors.subText,
              marginTop: 12,
              fontSize: 12,
            }}
          >
            Chạm vào ảnh để phóng to
          </Text>
        </ScrollView>

        {/* Action Buttons */}
        <View
          style={[
            styles.footer,
            { backgroundColor: colors.card, borderTopColor: colors.border },
          ]}
        >
          <TouchableOpacity
            style={[styles.btn, styles.btnReject]}
            onPress={() => handleProcess("rejected")}
            disabled={isUpdating}
          >
            <Ionicons name="close-circle" size={20} color="#D32F2F" />
            <Text style={styles.btnRejectText}>TỪ CHỐI</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, styles.btnApprove]}
            onPress={() => handleProcess("verified")}
            disabled={isUpdating}
          >
            {isUpdating ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                <Text style={styles.btnApproveText}>DUYỆT</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Image Viewer */}
        <ImageViewing
          images={images}
          imageIndex={currentImageIndex}
          visible={isViewerOpen}
          onRequestClose={() => setIsViewerOpen(false)}
          backgroundColor={isDark ? "#000" : "#FFF"}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  card: {
    padding: 20,
    borderRadius: 16,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  label: { fontSize: 14 },
  cccdText: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 1,
    marginTop: 4,
  },
  statusBadge: {
    marginTop: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 12 },
  imageGrid: { gap: 16 },
  imageWrapper: {
    height: 220,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    position: "relative",
  },
  imageTag: {
    position: "absolute",
    top: 10,
    left: 10,
    zIndex: 10,
    backgroundColor: "rgba(0,0,0,0.6)",
    color: "#fff",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    fontSize: 12,
    fontWeight: "600",
  },
  image: { width: "100%", height: "100%" },
  noImage: { flex: 1, justifyContent: "center", alignItems: "center" },

  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    padding: 16,
    paddingBottom: 30,
    borderTopWidth: 1,
    gap: 12,
  },
  btn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 50,
    borderRadius: 12,
    gap: 8,
  },
  btnReject: {
    backgroundColor: "#FFEBEE",
    borderWidth: 1,
    borderColor: "#FFCDD2",
  },
  btnRejectText: { color: "#D32F2F", fontWeight: "700" },
  btnApprove: {
    backgroundColor: "#4CAF50",
    shadowColor: "#4CAF50",
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  btnApproveText: { color: "#FFF", fontWeight: "700" },
});
