// src/screens/settings/FacebookLiveSettingsScreen.jsx
import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  SafeAreaView,
  useColorScheme, // 🔹 Import hook
} from "react-native";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import {
  useGetFacebookLoginUrlMutation,
  useGetFacebookPagesQuery,
  useSetDefaultFacebookPageMutation,
  useDeleteFacebookPageMutation,
} from "@/slices/facebookApiSlice";
import { Stack, useRouter } from "expo-router";
import { normalizeUrl } from "@/utils/normalizeUri";

// 🔹 CẤU HÌNH MÀU SẮC
const THEME_COLORS = {
  light: {
    background: "#f9fafb",
    cardBg: "#ffffff",
    text: "#111827",
    subText: "#6b7280",
    border: "#e5e7eb",
    infoBg: "#dbeafe",
    infoText: "#1e40af",
    headerBg: "#ffffff",
    headerTint: "#000000",
    loadingBg: "#ffffff",
    modalHeaderBorder: "#e5e7eb",
    iconDefault: "#d1d5db",
  },
  dark: {
    background: "#111827",
    cardBg: "#1f2937",
    text: "#f9fafb",
    subText: "#9ca3af",
    border: "#374151",
    infoBg: "#1e3a8a", // Xanh đậm hơn
    infoText: "#bfdbfe", // Chữ sáng hơn
    headerBg: "#1f2937",
    headerTint: "#ffffff",
    loadingBg: "#1f2937",
    modalHeaderBorder: "#374151",
    iconDefault: "#4b5563",
  },
};

const FacebookLiveSettingsScreen = () => {
  // 🔹 Detect theme
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = THEME_COLORS[isDark ? "dark" : "light"];

  const router = useRouter();
  const [showWebView, setShowWebView] = useState(false);
  const [authUrl, setAuthUrl] = useState("");

  const {
    data: pages = [],
    isLoading,
    isFetching,
    error,
    refetch,
  } = useGetFacebookPagesQuery();

  const [getLoginUrl, { isLoading: isConnecting }] =
    useGetFacebookLoginUrlMutation();

  const [setDefaultPage, { isLoading: isSettingDefault }] =
    useSetDefaultFacebookPageMutation();

  const [deletePage, { isLoading: isDeleting }] =
    useDeleteFacebookPageMutation();

  const handleConnectFacebook = useCallback(async () => {
    try {
      const res = await getLoginUrl().unwrap();

      if (res?.url) {
        setAuthUrl(res.url);
        setShowWebView(true);
      }
    } catch (err) {
      console.error("getLoginUrl error", err);
      Alert.alert("Lỗi", "Không lấy được link kết nối Facebook");
    }
  }, [getLoginUrl]);

  const handleWebViewNavigationStateChange = useCallback(
    (navState) => {
      const { url } = navState;

      console.log("WebView navigated to:", url);

      // Detect khi OAuth success - Facebook redirect về frontend URL
      if (url.includes("/settings/facebook") && url.includes("connected=1")) {
        console.log("OAuth success detected, closing WebView");
        setShowWebView(false);
        setAuthUrl("");

        // Refetch pages sau một chút
        setTimeout(() => {
          refetch();
          Alert.alert("Thành công", "Đã kết nối Facebook!");
        }, 500);
      }

      // Detect error
      if (url.includes("/settings/facebook") && url.includes("error=")) {
        console.log("OAuth error detected");
        setShowWebView(false);
        setAuthUrl("");
        Alert.alert("Lỗi", "Không thể kết nối Facebook. Vui lòng thử lại.");
      }
    },
    [refetch]
  );

  const handleCloseWebView = useCallback(() => {
    setShowWebView(false);
    setAuthUrl("");
  }, []);

  const handleSetDefault = useCallback(
    async (pageConnectionId) => {
      try {
        await setDefaultPage(pageConnectionId).unwrap();
        refetch();
        Alert.alert("Thành công", "Đã đặt fanpage mặc định");
      } catch (err) {
        console.error("setDefaultPage error", err);
        Alert.alert("Lỗi", "Không đặt được page mặc định");
      }
    },
    [setDefaultPage, refetch]
  );

  const handleDelete = useCallback(
    async (id, pageName) => {
      Alert.alert("Xác nhận", `Bạn có chắc muốn xóa kết nối "${pageName}"?`, [
        { text: "Hủy", style: "cancel" },
        {
          text: "Xóa",
          style: "destructive",
          onPress: async () => {
            try {
              await deletePage(id).unwrap();
              refetch();
              Alert.alert("Thành công", "Đã xóa kết nối");
            } catch (err) {
              console.error("deletePage error", err);
              Alert.alert("Lỗi", "Không xóa được kết nối");
            }
          },
        },
      ]);
    },
    [deletePage, refetch]
  );

  const renderPage = ({ item }) => {
    const isDefault = Boolean(item.isDefault);

    // ✅ Bọc URL vào normalizeUrl
    const avatarUri = normalizeUrl(
      item.pagePicture || "https://via.placeholder.com/50"
    );

    return (
      <>
        <View style={[styles.pageItem, { backgroundColor: theme.cardBg }]}>
          <Image
            source={{ uri: avatarUri }}
            style={styles.pageAvatar}
            contentFit="cover" // ✅ expo-image prop
            transition={100} // ✅ fade nhẹ cho mượt
          />

          <View style={styles.pageInfo}>
            <View style={styles.pageNameRow}>
              <Text style={[styles.pageName, { color: theme.text }]} numberOfLines={1}>
                {item.pageName}
              </Text>
              {isDefault && (
                <View style={styles.defaultBadge}>
                  <Text style={styles.defaultBadgeText}>Mặc định</Text>
                </View>
              )}
            </View>
            <Text style={[styles.pageCategory, { color: theme.subText }]} numberOfLines={1}>
              {item.pageCategory ? `${item.pageCategory} • ` : ""}
              ID: {item.pageId}
            </Text>
          </View>

          <View style={styles.pageActions}>
            <TouchableOpacity
              onPress={() => handleSetDefault(item.id)}
              disabled={isDefault || isSettingDefault || isDeleting}
              style={styles.actionButton}
            >
              <Ionicons
                name={isDefault ? "star" : "star-outline"}
                size={24}
                color={isDefault ? "#f59e0b" : theme.subText}
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleDelete(item.id, item.pageName)}
              disabled={isDeleting}
              style={styles.actionButton}
            >
              <Ionicons name="trash-outline" size={24} color="#ef4444" />
            </TouchableOpacity>
          </View>
        </View>
      </>
    );
  };
  const renderEmptyList = () => {
    if (isLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={[styles.loadingText, { color: theme.subText }]}>
            Đang tải danh sách fanpage...
          </Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color="#ef4444" />
          <Text style={styles.errorText}>Không tải được danh sách</Text>
          <TouchableOpacity style={styles.retryButton} onPress={refetch}>
            <Text style={styles.retryButtonText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="logo-facebook" size={64} color={theme.iconDefault} />
        <Text style={[styles.emptyText, { color: theme.text }]}>
          Chưa có fanpage nào
        </Text>
        <Text style={[styles.emptySubtext, { color: theme.subText }]}>
          Bấm &quot;Kết nối Facebook&quot; để bắt đầu
        </Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{
          title: "Thiết lập LIVE",
          headerTitleAlign: "center",
          headerStyle: { backgroundColor: theme.headerBg }, // 🔹 Header bg
          headerTintColor: theme.headerTint, // 🔹 Header text/icon color
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.back()}
              style={{ paddingHorizontal: 8, paddingVertical: 4 }}
            >
              <Ionicons name="chevron-back" size={24} color={theme.headerTint} />
            </TouchableOpacity>
          ),
        }}
      />
      {/* Header */}
      <View style={[
          styles.header, 
          { backgroundColor: theme.cardBg, borderBottomColor: theme.border }
        ]}>
        <View style={styles.headerInfo}>
          <Text style={[styles.title, { color: theme.text }]}>Facebook Live</Text>
          <Text style={[styles.subtitle, { color: theme.subText }]}>
            Kết nối Facebook để livestream match trực tiếp
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.connectButton, isConnecting && styles.buttonDisabled]}
          onPress={handleConnectFacebook}
          disabled={isConnecting}
        >
          {isConnecting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons
                name="logo-facebook"
                size={20}
                color="#fff"
                style={styles.buttonIcon}
              />
              <Text style={styles.connectButtonText}>Kết nối Facebook</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Info */}
      <View style={[styles.infoBox, { backgroundColor: theme.infoBg }]}>
        <Ionicons name="information-circle" size={20} color={isDark ? "#3b82f6" : "#3b82f6"} />
        <Text style={[styles.infoText, { color: theme.infoText }]}>
          Bấm &quot;Kết nối Facebook&quot; để cấp quyền quản lý livestream trên
          fanpage của bạn.
        </Text>
      </View>

      {/* Pages List */}
      {pages.length === 0 ? (
        renderEmptyList()
      ) : (
        <FlatList
          data={pages}
          keyExtractor={(item) => item.id}
          renderItem={renderPage}
          contentContainerStyle={styles.listContent}
          refreshing={isFetching}
          onRefresh={refetch}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      {/* WebView Modal */}
      <Modal
        visible={showWebView}
        animationType="slide"
        onRequestClose={handleCloseWebView}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={[
              styles.modalHeader, 
              { backgroundColor: theme.headerBg, borderBottomColor: theme.modalHeaderBorder }
            ]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Kết nối Facebook</Text>
            <TouchableOpacity
              onPress={handleCloseWebView}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={28} color={theme.text} />
            </TouchableOpacity>
          </View>

          {authUrl ? (
            <WebView
              source={{ uri: authUrl }}
              onNavigationStateChange={handleWebViewNavigationStateChange}
              startInLoadingState
              renderLoading={() => (
                <View style={[styles.webViewLoading, { backgroundColor: theme.loadingBg }]}>
                  <ActivityIndicator size="large" color="#1877f2" />
                  <Text style={[styles.webViewLoadingText, { color: theme.subText }]}>
                    Đang tải Facebook...
                  </Text>
                </View>
              )}
              // Cho phép cookies để OAuth work
              sharedCookiesEnabled={true}
              thirdPartyCookiesEnabled={true}
              cacheEnabled={true}
              userAgent="Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36"
            />
          ) : null}
        </SafeAreaView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // bg handled by theme
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    // bg and border handled by theme
  },
  headerInfo: {
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  connectButton: {
    backgroundColor: "#1877f2",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonIcon: {
    marginRight: 8,
  },
  connectButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  infoBox: {
    margin: 16,
    padding: 12,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  infoText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    lineHeight: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  errorText: {
    marginTop: 12,
    fontSize: 16,
    color: "#ef4444",
    fontWeight: "500",
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: "#3b82f6",
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: "600",
  },
  emptySubtext: {
    marginTop: 4,
    fontSize: 14,
    textAlign: "center",
  },
  listContent: {
    padding: 16,
  },
  pageItem: {
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  pageAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#e5e7eb",
  },
  pageInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  pageNameRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  pageName: {
    fontSize: 16,
    fontWeight: "600",
    marginRight: 8,
    flex: 1,
  },
  defaultBadge: {
    backgroundColor: "#dbeafe",
    borderColor: "#3b82f6",
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  defaultBadgeText: {
    fontSize: 12,
    color: "#1e40af",
    fontWeight: "500",
  },
  pageCategory: {
    fontSize: 14,
  },
  pageActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  actionButton: {
    padding: 8,
    marginLeft: 4,
  },
  separator: {
    height: 12,
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  closeButton: {
    padding: 4,
  },
  webViewLoading: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  webViewLoadingText: {
    marginTop: 12,
    fontSize: 14,
  },
});

export default FacebookLiveSettingsScreen;