// app/news/[slug].jsx
import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  useWindowDimensions,
} from "react-native";
import { Stack, useLocalSearchParams, router } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { useHeaderHeight } from "@react-navigation/elements";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import RenderHTML from "react-native-render-html";
import { useGetNewsDetailQuery } from "@/slices/newsApiSlice";
import { openInApp } from "@/utils/openInApp"; // ⬅️ dùng in-app browser

const FALLBACK_IMG =
  "https://dummyimage.com/800x450/A29BFE/ffffff&text=Pickleball+News";

/* ========== Utils ========== */
function formatDate(d) {
  if (!d) return "-";
  try {
    const dt = new Date(d);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const day = String(dt.getDate()).padStart(2, "0");
    return `${day}/${m}/${y}`;
  } catch {
    return "-";
  }
}

function normalizeNewlines(s = "") {
  let x = String(s).replace(/\r\n?/g, "\n").replace(/\\n/g, "\n");
  return x.replace(/\n{3,}/g, "\n\n");
}

// Wrapper để mở link trong in-app browser
const openUrl = (url, title = "") => {
  if (!url) return;
  openInApp(url, { title });
};

/* ========== Screen ========== */
export default function NewsDetailScreen() {
  const { slug } = useLocalSearchParams();
  const theme = useTheme();
  const headerHeight = useHeaderHeight();
  const { width: screenWidth } = useWindowDimensions();

  const isDark = !!theme?.dark;
  const bg = theme?.colors?.background ?? (isDark ? "#0b0f14" : "#f5f7fb");
  const text = theme?.colors?.text ?? (isDark ? "#ffffff" : "#111111");
  const sub = isDark ? "#b0b0b0" : "#666666";
  const link = isDark ? "#7cc7ff" : "#1976d2";

  const {
    data: article,
    isLoading,
    isError,
    refetch,
  } = useGetNewsDetailQuery(slug, { skip: !slug });

  const title = article?.title || "Chi tiết bài viết";

  const tags = useMemo(
    () => (Array.isArray(article?.tags) ? article.tags.filter(Boolean) : []),
    [article]
  );

  const sourceLabel = useMemo(() => {
    if (!article) return "";
    if (article.sourceName) return article.sourceName;
    if (article.sourceUrl) {
      try {
        const u = new URL(article.sourceUrl);
        return u.hostname.replace(/^www\./, "");
      } catch {
        return "";
      }
    }
    return "";
  }, [article]);

  const plainText = useMemo(() => {
    return article?.contentText ? normalizeNewlines(article.contentText) : "";
  }, [article]);

  const htmlSource = useMemo(() => {
    if (article?.contentHtml) {
      const cleaned = String(article.contentHtml)
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
      return { html: cleaned };
    }
    return null;
  }, [article]);

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: "",
          headerTransparent: true,
          headerShadowVisible: false,
          headerStyle: { backgroundColor: "transparent" },
          headerBackground: () => (
            <LinearGradient
              colors={[
                "rgba(0,0,0,0.98)",
                "rgba(0,0,0,0.6)",
                "rgba(0,0,0,0.0)",
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={{ flex: 1 }}
            />
          ),
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.newsBackBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          ),
          headerRight: () =>
            sourceLabel || article?.sourceUrl ? (
              <View style={styles.newsHeaderRight}>
                {sourceLabel ? (
                  <View style={styles.newsHeaderSourceWrap}>
                    <Ionicons
                      name="newspaper-outline"
                      size={14}
                      color="#FFFFFF"
                    />
                    <Text style={styles.newsHeaderSourceText} numberOfLines={1}>
                      {sourceLabel}
                    </Text>
                  </View>
                ) : null}
                {article?.sourceUrl ? (
                  <TouchableOpacity
                    onPress={() => openUrl(article.sourceUrl, article.title)}
                    style={styles.headerRightIconBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="open-outline" size={16} color="#FFFFFF" />
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null,
        }}
      />

      <View style={[styles.container, { backgroundColor: bg }]}>
        {isLoading && (
          <View style={styles.center}>
            <ActivityIndicator />
            <Text style={[styles.loadingText, { color: sub }]}>
              Đang tải bài viết…
            </Text>
          </View>
        )}

        {isError && !isLoading && (
          <View style={styles.center}>
            <Text style={styles.errorText}>Không tải được bài viết.</Text>
            <TouchableOpacity onPress={refetch} style={styles.retryBtn}>
              <Text style={styles.retryText}>Thử lại</Text>
            </TouchableOpacity>
          </View>
        )}

        {!isLoading && !isError && !article && (
          <View style={styles.center}>
            <Text style={styles.errorText}>Không tìm thấy bài viết.</Text>
          </View>
        )}

        {article && (
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              { paddingTop: headerHeight + 8 },
            ]}
            contentInsetAdjustmentBehavior="never"
            showsVerticalScrollIndicator={false}
          >
            {/* Hero */}
            <View style={styles.heroWrap}>
              <Image
                source={{
                  uri:
                    article.heroImageUrl ||
                    article.thumbImageUrl ||
                    FALLBACK_IMG,
                }}
                style={styles.heroImage}
                contentFit="cover"
                transition={250}
              />
              <LinearGradient
                colors={["transparent", "rgba(0,0,0,0.8)"]}
                style={styles.heroOverlay}
              />
              <View style={styles.heroTitleWrap}>
                <Text style={styles.heroTitle} numberOfLines={3}>
                  {title}
                </Text>
              </View>
            </View>

            {/* Meta */}
            <View style={styles.metaWrap}>
              <View style={styles.metaRow}>
                <Ionicons name="time-outline" size={16} color={sub} />
                <Text style={[styles.metaText, { color: sub }]}>
                  {formatDate(article.originalPublishedAt || article.createdAt)}
                </Text>
              </View>

              {article.sourceName ? (
                <View style={styles.metaRow}>
                  <Ionicons name="newspaper-outline" size={16} color={sub} />
                  <Text
                    style={[styles.metaText, { color: sub }]}
                    numberOfLines={1}
                  >
                    {article.sourceName}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Tags */}
            {tags.length > 0 && (
              <View style={styles.tagsWrap}>
                {tags.map((tag) => (
                  <View key={tag} style={styles.tagChip}>
                    <Text style={styles.tagText}>#{tag}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Content */}
            <View style={styles.contentWrap}>
              {htmlSource ? (
                <RenderHTML
                  source={htmlSource}
                  contentWidth={screenWidth - 32}
                  defaultTextProps={{
                    selectable: false,
                    allowFontScaling: true,
                  }}
                  baseStyle={{
                    color: text,
                    fontSize: 14,
                    lineHeight: 22,
                  }}
                  tagsStyles={{
                    p: { marginTop: 0, marginBottom: 10 },
                    div: { marginBottom: 8 },
                    em: { fontStyle: "italic" },
                    i: { fontStyle: "italic" },
                    strong: { fontWeight: "700" },
                    b: { fontWeight: "700" },
                    a: { color: link, textDecorationLine: "underline" },
                    h1: { fontSize: 22, fontWeight: "800", marginBottom: 12 },
                    h2: { fontSize: 20, fontWeight: "800", marginBottom: 10 },
                    h3: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
                    h4: { fontSize: 16, fontWeight: "700", marginBottom: 6 },
                    ul: { marginBottom: 10, paddingLeft: 18 },
                    ol: { marginBottom: 10, paddingLeft: 18 },
                    li: { marginBottom: 6 },
                    blockquote: {
                      borderLeftWidth: 3,
                      borderLeftColor: isDark ? "#4a5568" : "#cbd5e0",
                      paddingLeft: 10,
                      marginBottom: 12,
                      opacity: 0.9,
                    },
                    img: {
                      marginVertical: 8,
                      borderRadius: 8,
                      overflow: "hidden",
                    },
                    figure: { marginBottom: 8 },
                    figcaption: {
                      color: sub,
                      fontSize: 12,
                      marginTop: 4,
                      textAlign: "center",
                    },
                  }}
                  renderersProps={{
                    a: {
                      onPress: (_event, href) => openUrl(href),
                    },
                  }}
                />
              ) : plainText ? (
                <Text style={[styles.contentText, { color: text }]}>
                  {plainText}
                </Text>
              ) : (
                <Text style={[styles.contentText, { color: sub }]}>
                  Nội dung bài viết không khả dụng. Vui lòng mở liên kết gốc.
                </Text>
              )}
            </View>

            {/* Link gốc (dưới) */}
            {article.sourceUrl && (
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => openUrl(article.sourceUrl, article.title)}
                style={styles.originBtnWrapper}
              >
                <LinearGradient
                  colors={["#4ECDC4", "#45B7D1"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.originBtn}
                >
                  <Ionicons name="open-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.originBtnText}>Đọc bản gốc</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}

            <View style={{ height: 24 }} />
          </ScrollView>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  heroWrap: {
    height: 220,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    overflow: "hidden",
    marginBottom: 12,
  },
  heroImage: { width: "100%", height: "100%" },
  heroOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 90,
  },
  heroTitleWrap: { position: "absolute", bottom: 14, left: 16, right: 16 },
  heroTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#FFFFFF",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  metaWrap: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 4, gap: 2 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: { fontSize: 12 },
  tagsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  tagChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(162,155,254,0.18)",
  },
  tagText: { fontSize: 11, color: "#A29BFE", fontWeight: "600" },
  contentWrap: { paddingHorizontal: 16, paddingTop: 4 },
  contentText: { fontSize: 14, lineHeight: 22 },
  originBtnWrapper: { marginTop: 16, paddingHorizontal: 16 },
  originBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 14,
    gap: 8,
  },
  originBtnText: { fontSize: 14, fontWeight: "700", color: "#FFFFFF" },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: 24,
  },
  loadingText: { fontSize: 13 },
  errorText: { fontSize: 14, color: "#ff4d4f", textAlign: "center" },
  retryBtn: {
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#A29BFE",
  },
  retryText: { color: "#fff", fontWeight: "600" },

  // Header
  newsBackBtn: {
    marginLeft: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  newsHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 8,
  },
  newsHeaderSourceWrap: {
    maxWidth: 180,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.5)",
    flexDirection: "row",
    alignItems: "center",
  },
  newsHeaderSourceText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "600",
    marginLeft: 4,
  },
  headerRightIconBtn: {
    marginLeft: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
});
