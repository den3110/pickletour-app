import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  StatusBar,
  Animated, // ✅ Import Animated
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

// ✅ 1. Component Skeleton Item (Hiệu ứng thở - Pulse)
const SkeletonItem = ({ width, height, borderRadius = 4, style, colors }) => {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  // Màu nền của Skeleton tuỳ theo dark/light mode
  const skeletonColor = colors.border;

  return (
    <Animated.View
      style={[
        {
          width: width,
          height: height,
          borderRadius: borderRadius,
          backgroundColor: skeletonColor,
          opacity: opacity,
        },
        style,
      ]}
    />
  );
};

// ✅ 2. Layout Skeleton mô phỏng màn hình thật
const KycLoadingSkeleton = ({ colors }) => {
  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {/* Card Skeleton */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          {/* Label Họ tên */}
          <SkeletonItem width={60} height={14} colors={colors} />
          {/* Value Họ tên */}
          <SkeletonItem
            width={180}
            height={20}
            style={{ marginTop: 8 }}
            colors={colors}
          />

          <View style={{ height: 16 }} />

          {/* Label CCCD */}
          <SkeletonItem width={100} height={14} colors={colors} />
          {/* Value CCCD (To) */}
          <SkeletonItem
            width={220}
            height={32}
            style={{ marginTop: 8 }}
            colors={colors}
          />

          {/* Badge Status */}
          <SkeletonItem
            width={140}
            height={36}
            borderRadius={8}
            style={{ marginTop: 16 }}
            colors={colors}
          />
        </View>

        {/* Title Image */}
        <SkeletonItem
          width={150}
          height={20}
          style={{ marginBottom: 12 }}
          colors={colors}
        />

        {/* Image Grid Skeleton */}
        <View style={styles.imageGrid}>
          {/* Front Image */}
          <View
            style={[
              styles.imageWrapper,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View
              style={{
                padding: 20,
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
              }}
            >
              <SkeletonItem
                width="100%"
                height="100%"
                borderRadius={8}
                colors={colors}
                style={{ opacity: 0.1 }}
              />
            </View>
          </View>
          {/* Back Image */}
          <View
            style={[
              styles.imageWrapper,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View
              style={{
                padding: 20,
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
              }}
            >
              <SkeletonItem
                width="100%"
                height="100%"
                borderRadius={8}
                colors={colors}
                style={{ opacity: 0.1 }}
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

// ✅ 3. Wrapper cho ImageViewing
const CustomImageComponent = (props) => {
  return (
    <Image
      {...props}
      style={{ width: "100%", height: "100%" }}
      contentFit="contain"
      cachePolicy="memory-disk"
      transition={200}
    />
  );
};

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

  const getStatusInfo = (status) => {
    switch (status) {
      case "verified":
        return { label: "Đã xác thực", bg: "#E8F5E9", color: "#2E7D32" };
      case "rejected":
        return { label: "Bị từ chối", bg: "#FFEBEE", color: "#C62828" };
      case "pending":
        return { label: "Đang chờ duyệt", bg: "#FFF3E0", color: "#EF6C00" };
      case "unverified":
      default:
        return {
          label: "Chưa xác thực",
          bg: isDark ? "#333" : "#EEEEEE",
          color: isDark ? "#CCC" : "#757575",
        };
    }
  };

  // ✅ Thay thế ActivityIndicator bằng Skeleton Layout
  if (isLoading) {
    return (
      <>
        <Stack.Screen
          options={{
            title: "Duyệt định danh",
            headerStyle: { backgroundColor: colors.card },
            headerTintColor: colors.text,
          }}
        />
        <KycLoadingSkeleton colors={colors} />
      </>
    );
  }

  if (!data) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <Text style={{ color: colors.text }}>Không tìm thấy dữ liệu.</Text>
      </View>
    );
  }

  const statusMeta = getStatusInfo(data.cccdStatus);

  return (
    <>
      <Stack.Screen
        options={{
          title: "Duyệt định danh",
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.text,
        }}
      />
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
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
                  cachePolicy="memory-disk"
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
                  cachePolicy="memory-disk"
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

        <ImageViewing
          images={images}
          imageIndex={currentImageIndex}
          visible={isViewerOpen}
          onRequestClose={() => setIsViewerOpen(false)}
          backgroundColor={isDark ? "#000" : "#FFF"}
          ImageComponent={CustomImageComponent}
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
