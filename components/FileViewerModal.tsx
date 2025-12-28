// components/FileViewerModal.jsx
import React, { useState, useCallback, useEffect, memo } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Platform,
  StatusBar,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useTheme } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import * as Sharing from "expo-sharing";
import * as LegacyFS from "expo-file-system/legacy";

/**
 * FileViewerModal - Xem PDF/Word trực tiếp trong app
 *
 * Props:
 * - visible: boolean
 * - uri: string (file path hoặc URL)
 * - fileName: string
 * - mimeType: 'application/pdf' | 'application/msword' | 'text/html'
 * - onClose: () => void
 * - onShare: () => void (optional)
 */
const FileViewerModal = memo(
  ({
    visible,
    uri,
    fileName,
    mimeType = "application/pdf",
    onClose,
    onShare,
  }) => {
    const { colors, dark } = useTheme();
    const insets = useSafeAreaInsets();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [htmlContent, setHtmlContent] = useState(null);

    const isPDF = mimeType === "application/pdf";
    const isWord =
      mimeType === "application/msword" || mimeType === "text/html";

    // Reset state khi modal đóng/mở
    useEffect(() => {
      if (!visible) {
        setLoading(true);
        setError(null);
        setHtmlContent(null);
      }
    }, [visible]);

    // Đọc nội dung file Word (HTML) khi mở
    useEffect(() => {
      if (!visible || !uri || !isWord) return;

      const loadWordContent = async () => {
        try {
          setLoading(true);
          setError(null);

          // Đọc nội dung file
          const content = await LegacyFS.readAsStringAsync(uri, {
            encoding: LegacyFS.EncodingType.UTF8,
          });

          if (!content) {
            throw new Error("File rỗng");
          }

          // Wrap content với style cho WebView
          const wrappedHtml = `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0, user-scalable=yes">
              <style>
                * { box-sizing: border-box; }
                html, body { 
                  margin: 0; 
                  padding: 0;
                  background: ${dark ? "#1a1a1a" : "#fff"};
                  color: ${dark ? "#e5e5e5" : "#1a1a1a"};
                }
                body {
                  padding: 16px;
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                  font-size: 14px;
                  line-height: 1.5;
                }
                table {
                  width: 100%;
                  border-collapse: collapse;
                  margin: 12px 0;
                  font-size: 12px;
                }
                th, td {
                  border: 1px solid ${dark ? "#444" : "#ddd"};
                  padding: 8px;
                  text-align: left;
                }
                th {
                  background: ${dark ? "#333" : "#f5f5f5"};
                  font-weight: 600;
                }
                h1 { font-size: 20px; margin: 0 0 8px; }
                h2 { font-size: 16px; margin: 16px 0 8px; }
                .sub { color: ${dark ? "#999" : "#666"}; font-size: 12px; }
              </style>
            </head>
            <body>
              ${content.replace(
                /<html>|<\/html>|<head>.*?<\/head>|<!DOCTYPE[^>]*>/gis,
                ""
              )}
            </body>
            </html>
          `;

          setHtmlContent(wrappedHtml);
          setLoading(false);
        } catch (err) {
          console.error("Load Word error:", err);
          setError(err?.message || "Không thể đọc file");
          setLoading(false);
        }
      };

      loadWordContent();
    }, [visible, uri, isWord, dark]);

    // Handle share
    const handleShare = useCallback(async () => {
      if (onShare) {
        onShare();
        return;
      }

      if (!uri) return;
      try {
        await Sharing.shareAsync(uri, {
          mimeType,
          dialogTitle: fileName || "Chia sẻ file",
          UTI: isPDF ? "com.adobe.pdf" : "com.microsoft.word.doc",
        });
      } catch (err) {
        console.error("Share error:", err);
      }
    }, [uri, mimeType, fileName, isPDF, onShare]);

    // Build source for WebView
    const getWebViewSource = useCallback(() => {
      if (!uri) return null;

      // File Word - dùng HTML content đã đọc
      if (isWord) {
        if (htmlContent) {
          return { html: htmlContent };
        }
        return null; // Đang loading
      }

      // File PDF
      const fileUri = uri.startsWith("file://") ? uri : `file://${uri}`;

      if (Platform.OS === "ios") {
        // iOS: WebView render PDF trực tiếp
        return { uri: fileUri };
      } else {
        // Android: Dùng PDF.js hoặc Google Docs Viewer
        // Option 1: Google Docs Viewer (cần internet, file phải public)
        // Option 2: Embed trực tiếp (không phải lúc nào cũng work)
        // Option 3: Dùng PDF.js (tốt nhất)

        // Dùng PDF.js CDN
        return {
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                html, body, #viewer { 
                  width: 100%; 
                  height: 100%; 
                  background: ${dark ? "#1a1a1a" : "#f5f5f5"};
                }
                #viewer {
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  padding: 8px;
                  overflow: auto;
                }
                canvas {
                  max-width: 100%;
                  height: auto !important;
                  margin-bottom: 8px;
                  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
                  background: white;
                }
                .loading {
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  height: 100%;
                  color: ${dark ? "#999" : "#666"};
                  font-family: sans-serif;
                }
                .error {
                  color: #ef4444;
                  text-align: center;
                  padding: 20px;
                  font-family: sans-serif;
                }
              </style>
            </head>
            <body>
              <div id="viewer">
                <div class="loading">Đang tải PDF...</div>
              </div>
              <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
              <script>
                pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                
                async function renderPDF() {
                  const viewer = document.getElementById('viewer');
                  try {
                    const pdf = await pdfjsLib.getDocument('${fileUri}').promise;
                    viewer.innerHTML = '';
                    
                    for (let i = 1; i <= pdf.numPages; i++) {
                      const page = await pdf.getPage(i);
                      const scale = (window.innerWidth - 16) / page.getViewport({ scale: 1 }).width;
                      const viewport = page.getViewport({ scale: Math.min(scale, 2) });
                      
                      const canvas = document.createElement('canvas');
                      const context = canvas.getContext('2d');
                      canvas.width = viewport.width;
                      canvas.height = viewport.height;
                      
                      await page.render({ canvasContext: context, viewport }).promise;
                      viewer.appendChild(canvas);
                    }
                  } catch (err) {
                    console.error('PDF Error:', err);
                    viewer.innerHTML = '<div class="error">Không thể tải PDF<br><small>' + err.message + '</small></div>';
                  }
                }
                
                renderPDF();
              </script>
            </body>
            </html>
          `,
          baseUrl: "",
        };
      }
    }, [uri, isPDF, isWord, htmlContent, dark]);

    const webViewSource = getWebViewSource();

    // Không render nếu không visible
    if (!visible) return null;

    return (
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={onClose}
      >
        <View
          style={[
            styles.container,
            { backgroundColor: dark ? "#000" : "#fff" },
          ]}
        >
          <StatusBar barStyle={dark ? "light-content" : "dark-content"} />

          {/* Header */}
          <View
            style={[
              styles.header,
              {
                paddingTop: insets.top + 8,
                backgroundColor: dark ? "#1a1a1a" : "#fff",
                borderBottomColor: dark ? "#333" : "#e5e5e5",
              },
            ]}
          >
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [
                styles.headerBtn,
                pressed && { opacity: 0.7 },
              ]}
              hitSlop={12}
            >
              <MaterialIcons name="close" size={24} color={colors.text} />
            </Pressable>

            <View style={styles.headerCenter}>
              <Text
                style={[styles.headerTitle, { color: colors.text }]}
                numberOfLines={1}
              >
                {fileName || "Xem file"}
              </Text>
              <Text
                style={[styles.headerSubtitle, { color: colors.text + "80" }]}
              >
                {isPDF ? "PDF" : "Document"}
              </Text>
            </View>

            <Pressable
              onPress={handleShare}
              style={({ pressed }) => [
                styles.headerBtn,
                pressed && { opacity: 0.7 },
              ]}
              hitSlop={12}
            >
              <MaterialIcons
                name={Platform.OS === "ios" ? "ios-share" : "share"}
                size={24}
                color={colors.primary}
              />
            </Pressable>
          </View>

          {/* Content */}
          <View style={styles.content}>
            {/* Loading overlay */}
            {loading && (
              <View
                style={[
                  styles.loadingOverlay,
                  { backgroundColor: dark ? "#1a1a1a" : "#fff" },
                ]}
              >
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.loadingText, { color: colors.text }]}>
                  Đang tải {isPDF ? "PDF" : "tài liệu"}...
                </Text>
              </View>
            )}

            {/* Error */}
            {error && !loading && (
              <View
                style={[
                  styles.errorContainer,
                  { backgroundColor: dark ? "#1a1a1a" : "#fff" },
                ]}
              >
                <MaterialIcons name="error-outline" size={48} color="#ef4444" />
                <Text style={[styles.errorText, { color: colors.text }]}>
                  Không thể tải file
                </Text>
                <Text
                  style={[styles.errorSubtext, { color: colors.text + "80" }]}
                >
                  {error}
                </Text>
                <Pressable
                  onPress={handleShare}
                  style={({ pressed }) => [
                    styles.errorBtn,
                    { backgroundColor: colors.primary },
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <MaterialIcons name="open-in-new" size={18} color="#fff" />
                  <Text style={styles.errorBtnText}>Mở bằng app khác</Text>
                </Pressable>
              </View>
            )}

            {/* WebView */}
            {webViewSource && !error && (
              <WebView
                source={webViewSource}
                style={[styles.webview, { opacity: loading ? 0 : 1 }]}
                originWhitelist={["*"]}
                allowFileAccess={true}
                allowFileAccessFromFileURLs={true}
                allowUniversalAccessFromFileURLs={true}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                startInLoadingState={false}
                scalesPageToFit={true}
                mixedContentMode="always"
                onLoadStart={() => {
                  if (isPDF) setLoading(true);
                }}
                onLoadEnd={() => setLoading(false)}
                onError={(syntheticEvent) => {
                  const { nativeEvent } = syntheticEvent;
                  console.error("WebView error:", nativeEvent);
                  setLoading(false);
                  setError(nativeEvent.description || "Lỗi không xác định");
                }}
                onMessage={(event) => {
                  // Có thể nhận message từ WebView nếu cần
                  console.log("WebView message:", event.nativeEvent.data);
                }}
              />
            )}
          </View>

          {/* Bottom safe area */}
          <View
            style={[
              styles.bottomSafe,
              {
                height: insets.bottom,
                backgroundColor: dark ? "#1a1a1a" : "#fff",
              },
            ]}
          />
        </View>
      </Modal>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  content: {
    flex: 1,
    position: "relative",
  },
  webview: {
    flex: 1,
    backgroundColor: "transparent",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  errorContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    zIndex: 10,
  },
  errorText: {
    fontSize: 18,
    fontWeight: "700",
    marginTop: 16,
  },
  errorSubtext: {
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
  },
  errorBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  errorBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  bottomSafe: {
    width: "100%",
  },
});

export default FileViewerModal;
