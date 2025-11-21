// app/browser.tsx
import React, { useMemo, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
  ActivityIndicator,
  Share,
  Linking,
  TextInput,
  KeyboardAvoidingView,
} from "react-native";
import { useLocalSearchParams, Stack, router } from "expo-router";
import { WebView } from "react-native-webview";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as IntentLauncher from "expo-intent-launcher";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@react-navigation/native";

function decodeParam(p?: string | string[]) {
  const v = Array.isArray(p) ? p[0] : p || "";
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0 Safari/537.36";

export default function InAppBrowserScreen() {
  const insets = useSafeAreaInsets();
  const { colors, dark } = useTheme();
  const params = useLocalSearchParams<{
    url?: string;
    title?: string;
    incognito?: string;
  }>();
  const incognito = params?.incognito === "1";

  const initialUrl = useMemo(
    () => decodeParam(params.url) || "about:blank",
    [params.url]
  );
  const titleParam = useMemo(() => decodeParam(params.title), [params.title]);

  const C = {
    bg: colors?.background || (dark ? "#0b0b0c" : "#f7f7f7"),
    text: colors?.text || (dark ? "#fff" : "#111"),
    sub: dark ? "#9aa0a6" : "#5f6368",
    icon: dark ? "#fff" : "#111",
    iconDisabled: dark ? "#6b7280" : "#c0c0c0",
    chipBg: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
    headerBg: dark ? "rgba(20,20,20,0.9)" : "rgba(255,255,255,0.92)",
    headerBorder: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
    toolBg: dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
    border: dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)",
    progressBg: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
    progress: dark ? "#22c55e" : "#0ea5e9",
    secureDotOk: "#22c55e",
    secureDotWarn: "#f59e0b",
    menuBg: dark ? "rgba(28,28,30,0.98)" : "#ffffff",
    menuBorder: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
    menuShadow: dark ? "#000000" : "#000000",
    divider: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
    highlight: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
  };

  const webRef = useRef<WebView>(null);

  const [url, setUrl] = useState(initialUrl);
  const [pageTitle, setPageTitle] = useState<string>(titleParam);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [webKey, setWebKey] = useState(0);
  const [desktopMode, setDesktopMode] = useState(false);
  const [readerOn, setReaderOn] = useState(false);

  // Dropdown menu
  const [menuOpen, setMenuOpen] = useState(false);

  // Find-in-page
  const [findVisible, setFindVisible] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findCount, setFindCount] = useState<number | null>(null);

  const onNavChange = useCallback(
    (navState: any) => {
      setUrl(navState.url);
      setCanGoBack(navState.canGoBack);
      setCanGoForward(navState.canGoForward);
      if (navState.title && !titleParam) setPageTitle(navState.title);
    },
    [titleParam]
  );

  const onShouldStart = useCallback((req: any) => {
    const u: string = req?.url || "";
    if (/^(https?:|about:|file:|data:|blob:)/i.test(u)) return true;
    Linking.openURL(u).catch(() => {
      // Alert.alert("Không mở được liên kết", u);
    });
    return false;
  }, []);

  const doGoBack = () => canGoBack && webRef.current?.goBack();
  const doGoForward = () => canGoForward && webRef.current?.goForward();
  const doReload = () => webRef.current?.reload();

  // Share URL/text
  const doShare = async () => {
    try {
      const message = pageTitle ? `${pageTitle}\n${url}` : url;
      await Share.share(
        Platform.select({
          ios: { url, message, title: pageTitle || "Chia sẻ liên kết" },
          android: { message, title: pageTitle || "Chia sẻ liên kết" },
          default: { message },
        }) as any
      );
    } catch {
      await Clipboard.setStringAsync(url);
      Alert.alert("Đã sao chép URL", url);
    }
  };

  const doCopy = async () => {
    await Clipboard.setStringAsync(url);
    Alert.alert("Đã copy URL", url);
  };

  const doCopyTitle = async () => {
    const t = pageTitle || url;
    await Clipboard.setStringAsync(t);
    Alert.alert("Đã copy tiêu đề", t);
  };

  const clearAndReload = useCallback(async () => {
    try {
      webRef.current?.injectJavaScript(`
        (function(){
          try {
            localStorage && localStorage.clear && localStorage.clear();
            sessionStorage && sessionStorage.clear && sessionStorage.clear();
            if (window.caches) { caches.keys().then(ks => ks.forEach(k => caches.delete(k))); }
            if (indexedDB && indexedDB.databases) {
              indexedDB.databases().then(dbs => dbs.forEach(db => db && db.name && indexedDB.deleteDatabase(db.name)));
            }
          } catch (e) {}
          true;
        })();
      `);
    } finally {
      setMenuOpen(false);
      setWebKey((k) => k + 1);
    }
  }, []);

  const onFileDownload = useCallback(async (event: any) => {
    try {
      const downloadUrl =
        event?.nativeEvent?.downloadUrl || event?.nativeEvent?.url;
      if (!downloadUrl) return;

      const filename = downloadUrl.split("/").pop() || `download-${Date.now()}`;
      const dest = FileSystem.documentDirectory + filename;

      const dl = FileSystem.createDownloadResumable(downloadUrl, dest);
      const { uri } = await dl.downloadAsync();

      if (Platform.OS === "android") {
        try {
          await IntentLauncher.startActivityAsync(
            "android.intent.action.VIEW",
            { data: uri, flags: 1 }
          );
        } catch {
          await Sharing.shareAsync(uri);
        }
      } else {
        await Sharing.shareAsync(uri);
      }
    } catch (e: any) {
      Alert.alert("Tải xuống thất bại", e?.message || "Có lỗi xảy ra.");
    }
  }, []);

  const secure = /^https:\/\//i.test(url);

  // Reader mode
  const toggleReader = () => {
    setReaderOn((v) => !v);
    const js = `
      (function(){
        const ID = "pt-reader-css";
        const old = document.getElementById(ID);
        if (old) { old.remove(); return true; }
        const st = document.createElement('style');
        st.id = ID;
        st.innerHTML = \`
          * { max-width: 100% !important; }
          img, video { border-radius: 8px; }
          body { margin: 0 auto !important; padding: 12px !important; line-height: 1.6 !important; max-width: 760px !important; font-size: 18px !important; }
          header, nav, footer, aside, .sidebar, .sticky, .advert, [role="banner"], [role="navigation"], [role="complementary"] { display: none !important; }
        \`;
        document.documentElement.appendChild(st);
        true;
      })();
    `;
    webRef.current?.injectJavaScript(js);
    setMenuOpen(false);
  };

  // Desktop mode
  const toggleDesktop = () => {
    setDesktopMode((v) => !v);
    setMenuOpen(false);
    setTimeout(() => setWebKey((k) => k + 1), 0);
  };

  // Find-in-page
  const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const runFind = (q: string, backward = false) => {
    if (!q) return;
    const js = `
      (function(){
        try {
          var q = ${JSON.stringify(q)};
          var count = (document.body.innerText.match(new RegExp("${escapeRegex(
            q
          )}","gi")) || []).length;
          window.find(q, false, ${
            backward ? "true" : "false"
          }, true, false, false, false);
          window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({type:"findCount", count: count}));
        } catch(e) {}
        true;
      })();
    `;
    webRef.current?.injectJavaScript(js);
  };

  const onMessage = (e: any) => {
    try {
      const data = JSON.parse(e?.nativeEvent?.data || "{}");
      if (data?.type === "findCount") {
        setFindCount(typeof data.count === "number" ? data.count : null);
      }
    } catch {}
  };

  const openFind = () => {
    setMenuOpen(false);
    setFindVisible(true);
    setFindCount(null);
    setFindQuery("");
  };

  const closeFind = () => {
    setFindVisible(false);
    setFindCount(null);
    setFindQuery("");
  };

  // Dropdown items
  const menuItems = [
    {
      key: "desktop",
      label: desktopMode ? "Tắt Desktop mode" : "Bật Desktop mode",
      icon: <Ionicons name="desktop-outline" size={16} color={C.icon} />,
      onPress: toggleDesktop,
    },
    {
      key: "reader",
      label: readerOn ? "Tắt Reader mode" : "Bật Reader mode",
      icon: <Ionicons name="book-outline" size={16} color={C.icon} />,
      onPress: toggleReader,
    },
    {
      key: "find",
      label: "Tìm trong trang",
      icon: <Ionicons name="search" size={16} color={C.icon} />,
      onPress: openFind,
    },
    {
      key: "openExternal",
      label: "Mở ngoài trình duyệt",
      icon: <Ionicons name="open-outline" size={16} color={C.icon} />,
      onPress: () => {
        setMenuOpen(false);
        Linking.openURL(url).catch(() => Alert.alert("Không mở được", url));
      },
    },
    {
      key: "copyTitle",
      label: "Sao chép tiêu đề",
      icon: (
        <MaterialCommunityIcons name="format-title" size={16} color={C.icon} />
      ),
      onPress: () => {
        setMenuOpen(false);
        doCopyTitle();
      },
    },
    {
      key: "clear",
      label: "Xoá dữ liệu trang",
      icon: <Ionicons name="trash-outline" size={16} color={C.icon} />,
      danger: true,
      onPress: () => {
        setMenuOpen(false);
        Alert.alert(
          "Xoá dữ liệu trang?",
          "Bạn có chắc muốn xoá cache dữ liệu trang này?",
          [
            { text: "Huỷ", style: "cancel" },
            { text: "Xoá", style: "destructive", onPress: clearAndReload },
          ]
        );
      },
    },
  ];

  return (
    <KeyboardAvoidingView
      style={[styles.container]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <View
        style={[
          styles.container,
          { paddingTop: insets.top, backgroundColor: C.bg },
        ]}
      >
        <Stack.Screen
          options={{
            headerShown: false,
            animation: "slide_from_right",
            presentation: "card",
          }}
        />

        {/* Header */}
        <View
          style={[
            styles.header,
            {
              backgroundColor: C.headerBg,
              borderBottomColor: C.headerBorder,
              borderBottomWidth: StyleSheet.hairlineWidth,
            },
          ]}
        >
          <View style={styles.headerLeftGroup}>
            <TouchableOpacity
              style={[styles.headerBtn, { backgroundColor: C.chipBg }]}
              onPress={() => router.back()}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="chevron-back" size={20} color={C.icon} />
              <Text style={[styles.headerBtnText, { color: C.text }]}>
                Đóng
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.headerTitleWrap}>
            <View
              style={[
                styles.secureDot,
                { backgroundColor: secure ? C.secureDotOk : C.secureDotWarn },
              ]}
            />
            <Text
              numberOfLines={1}
              style={[styles.headerTitle, { color: C.text }]}
            >
              {pageTitle || url.replace(/^https?:\/\//, "")}
            </Text>
          </View>

          <View style={styles.headerRight}>
            <TouchableOpacity
              onPress={doCopy}
              style={[styles.iconBtn, { backgroundColor: C.chipBg }]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialCommunityIcons
                name="content-copy"
                size={18}
                color={C.icon}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={doShare}
              style={[styles.iconBtn, { backgroundColor: C.chipBg }]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="share-outline" size={18} color={C.icon} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setMenuOpen((v) => !v)}
              style={[styles.iconBtn, { backgroundColor: C.chipBg }]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="ellipsis-vertical" size={18} color={C.icon} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Progress bar */}
        <View style={[styles.progressBar, { backgroundColor: C.progressBg }]}>
          <View
            style={[
              styles.progressInner,
              {
                width: `${Math.max(progress * 100, loading ? 5 : 0)}%`,
                backgroundColor: C.progress,
              },
            ]}
          />
        </View>

        {/* WebView */}
        <WebView
          key={`${webKey}-${desktopMode ? "d" : "m"}`}
          ref={webRef}
          source={{ uri: initialUrl }}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => {
            setLoading(false);
            setProgress(0);
          }}
          onLoadProgress={({ nativeEvent }) =>
            setProgress(nativeEvent.progress || 0)
          }
          onNavigationStateChange={onNavChange}
          onShouldStartLoadWithRequest={onShouldStart}
          onMessage={onMessage}
          setSupportMultipleWindows={false}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled
          decelerationRate={
            Platform.OS === "ios" ? "normal" : 0.985 // hoặc bỏ luôn cho Android
          }
          pullToRefreshEnabled={Platform.OS === "android"}
          startInLoadingState={false}
          originWhitelist={["*"]}
          onFileDownload={onFileDownload}
          cacheEnabled={!incognito}
          sharedCookiesEnabled={!incognito}
          thirdPartyCookiesEnabled={!incognito}
          userAgent={desktopMode ? DESKTOP_UA : undefined}
          contentMode="recommended"
          allowsBackForwardNavigationGestures
          style={{ flex: 1, backgroundColor: C.bg }}
        />

        {/* Find-in-page bar */}
        {findVisible && (
          <View
            style={[
              styles.findBar,
              {
                backgroundColor: C.headerBg,
                borderColor: C.headerBorder,
                bottom: (insets.bottom || 8) + 56,
              },
            ]}
          >
            <Ionicons name="search" size={16} color={C.sub} />
            <TextInput
              value={findQuery}
              onChangeText={(t) => {
                setFindQuery(t);
                setFindCount(null);
              }}
              onSubmitEditing={() => runFind(findQuery, false)}
              placeholder="Tìm trong trang…"
              placeholderTextColor={C.sub}
              style={[styles.findInput, { color: C.text }]}
              returnKeyType="search"
            />
            <Text style={{ color: C.sub, fontSize: 12 }}>
              {findCount != null ? `${findCount}` : ""}
            </Text>
            <TouchableOpacity
              onPress={() => runFind(findQuery, true)}
              style={[styles.findBtn, { backgroundColor: C.highlight }]}
            >
              <Ionicons name="chevron-up" size={16} color={C.icon} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => runFind(findQuery, false)}
              style={[styles.findBtn, { backgroundColor: C.highlight }]}
            >
              <Ionicons name="chevron-down" size={16} color={C.icon} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={closeFind}
              style={[styles.findBtn, { backgroundColor: C.highlight }]}
            >
              <Ionicons name="close" size={16} color={C.icon} />
            </TouchableOpacity>
          </View>
        )}

        {/* Dropdown menu */}
        {menuOpen && (
          <>
            {/* backdrop */}
            <TouchableOpacity
              style={styles.menuBackdrop}
              activeOpacity={1}
              onPress={() => setMenuOpen(false)}
            />
            <View
              style={[
                styles.menuPanel,
                {
                  top: insets.top + 56 + 6,
                  right: 8,
                  backgroundColor: C.menuBg,
                  borderColor: C.menuBorder,
                  shadowColor: C.menuShadow,
                },
              ]}
            >
              {menuItems.map((it, idx) => (
                <TouchableOpacity
                  key={it.key}
                  onPress={it.onPress}
                  style={[styles.menuItem, { backgroundColor: "transparent" }]}
                  activeOpacity={0.8}
                >
                  <View style={styles.menuItemLeft}>
                    {it.icon}
                    <Text
                      style={[
                        styles.menuItemText,
                        { color: it.danger ? "#ef4444" : C.text },
                      ]}
                    >
                      {it.label}
                    </Text>
                  </View>
                  {/* trạng thái cho toggle */}
                  {it.key === "desktop" && (
                    <Ionicons
                      name={desktopMode ? "checkmark" : "chevron-forward"}
                      size={16}
                      color={C.sub}
                    />
                  )}
                  {it.key === "reader" && (
                    <Ionicons
                      name={readerOn ? "checkmark" : "chevron-forward"}
                      size={16}
                      color={C.sub}
                    />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Toolbar */}
        <View
          style={[
            styles.toolbar,
            {
              paddingBottom: insets.bottom || 8,
              backgroundColor: C.toolBg,
              borderTopColor: C.border,
              borderTopWidth: StyleSheet.hairlineWidth,
            },
          ]}
        >
          <TouchableOpacity
            onPress={doGoBack}
            disabled={!canGoBack}
            style={[styles.toolBtn, { backgroundColor: C.chipBg }]}
          >
            <Ionicons
              name="arrow-back"
              size={20}
              color={canGoBack ? C.icon : C.iconDisabled}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={doGoForward}
            disabled={!canGoForward}
            style={[styles.toolBtn, { backgroundColor: C.chipBg }]}
          >
            <Ionicons
              name="arrow-forward"
              size={20}
              color={canGoForward ? C.icon : C.iconDisabled}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={doReload}
            style={[styles.toolBtn, { backgroundColor: C.chipBg }]}
          >
            {loading ? (
              <ActivityIndicator />
            ) : (
              <Ionicons name="reload" size={20} color={C.icon} />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    height: 56,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerLeftGroup: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  headerBtnText: { fontSize: 14, fontWeight: "600" },
  headerTitleWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 60,
  },
  headerTitle: { fontSize: 14, fontWeight: "600" },
  secureDot: { width: 8, height: 8, borderRadius: 999 },

  headerRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  iconBtn: { padding: 8, borderRadius: 12 },

  progressBar: { height: 2 },
  progressInner: { height: "100%" },

  // Find-in-page
  findBar: {
    position: "absolute",
    left: 10,
    right: 10,
    height: 44,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
  },
  findInput: { flex: 1, paddingVertical: 6, fontSize: 14 },
  findBtn: { padding: 8, borderRadius: 8 },

  // Dropdown menu
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  menuPanel: {
    position: "absolute",
    minWidth: 240,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
    paddingHorizontal: 6,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  menuItem: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  menuItemLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  menuItemText: { fontSize: 14, fontWeight: "500" },

  // Toolbar
  toolbar: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: 10,
    paddingTop: 8,
  },
  toolBtn: { padding: 10, borderRadius: 12 },
});
