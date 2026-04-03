import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Linking,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
  useColorScheme,
} from "react-native";
import { useTheme } from "@react-navigation/native";
import { Image as ExpoImage } from "expo-image";
import { WebView } from "react-native-webview";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";

import { CompatVideo as Video } from "@/lib/expoMediaCompat";
import { normalizeUrl } from "@/utils/normalizeUri";

import { getLiveMatchCourtText } from "./courtDisplay";
import InfoModal from "./InfoModal";
import {
  buildLiveInfoMatch,
  getLiveMatchSubtitle,
  getLiveMatchTitle,
  getLiveSessions,
  getLiveStatusLabel,
  getPreferredLiveSession,
  hostOf,
  sid,
  timeAgo,
} from "./liveUtils";

const BLURHASH = "|rF?hV%2WCj[ayj[a|j[az_NaeWBj@ayfRayfQfQM{M|azj[azf6fQfQfQIpWXo";

function useThemeTokens() {
  const navTheme = useTheme?.();
  const sysScheme = useColorScheme?.() ?? "light";
  const isDark = typeof navTheme?.dark === "boolean" ? navTheme.dark : sysScheme === "dark";

  return {
    isDark,
    accent: navTheme?.colors?.primary ?? (isDark ? "#6ee7d8" : "#0f766e"),
    textPrimary: navTheme?.colors?.text ?? (isDark ? "#ffffff" : "#102a26"),
    textSecondary: isDark ? "#b8c4c2" : "#5b6f6a",
    cardBg: navTheme?.colors?.card ?? (isDark ? "#10201d" : "#fffdf8"),
    pageBg: navTheme?.colors?.background ?? (isDark ? "#091513" : "#f5f3ec"),
    cardBorder: navTheme?.colors?.border ?? (isDark ? "#25423d" : "#d9e7e2"),
    softBg: isDark ? "#17312d" : "#eef6f3",
    liveBg: "rgba(220, 38, 38, 0.92)",
    liveText: "#ffffff",
    shadow: {
      shadowColor: "#08110f",
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: isDark ? 0.32 : 0.08,
      shadowRadius: 16,
      elevation: 4,
    },
  };
}

function showNotice(message: string) {
  if (Platform.OS === "android") {
    ToastAndroid.show(message, ToastAndroid.SHORT);
    return;
  }
  Alert.alert("Thông báo", message);
}

function buildPlayerHtml(embedHtml: string) {
  return `<!DOCTYPE html>
  <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      <style>
        html, body {
          margin: 0;
          padding: 0;
          background: #000;
          height: 100%;
          overflow: hidden;
        }
        body {
          display: flex;
          align-items: center;
          justify-content: center;
        }
        iframe, video {
          width: 100%;
          height: 100%;
          border: 0;
        }
      </style>
    </head>
    <body>${embedHtml}</body>
  </html>`;
}

function renderPlayer(activeSession: any) {
  if (!activeSession) return null;

  if (activeSession?.embedHtml) {
    return (
      <WebView
        source={{ html: buildPlayerHtml(activeSession.embedHtml) }}
        style={styles.player}
        javaScriptEnabled
        domStorageEnabled
        allowsFullscreenVideo
        mediaPlaybackRequiresUserAction={false}
      />
    );
  }

  if (activeSession?.pluginUrl) {
    return (
      <WebView
        source={{ uri: activeSession.pluginUrl }}
        style={styles.player}
        javaScriptEnabled
        domStorageEnabled
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
      />
    );
  }

  const directUrl = activeSession?.directUrl || activeSession?.manifestUrl;
  if (directUrl) {
    return (
      <Video
        style={styles.player}
        source={{ uri: directUrl }}
        useNativeControls
        shouldPlay
        resizeMode="contain"
      />
    );
  }

  return null;
}

const LiveMatchCard = memo(
  function LiveMatchCard({ item = {} }: any) {
    const T = useThemeTokens();
    const match = useMemo(() => item || {}, [item]);
    const fb = match?.facebookLive || {};
    const courtText = getLiveMatchCourtText(match);
    const sessions = useMemo(() => getLiveSessions(match), [match]);
    const preferredSession = useMemo(
      () => getPreferredLiveSession(match, sessions),
      [match, sessions]
    );
    const [activeSessionKey, setActiveSessionKey] = useState(preferredSession?.key || "");
    const [playerVisible, setPlayerVisible] = useState(false);
    const [infoVisible, setInfoVisible] = useState(false);

    useEffect(() => {
      if (!sessions.length) {
        setActiveSessionKey("");
        return;
      }

      const currentSession = sessions.find((session) => session?.key === activeSessionKey);
      if (!currentSession) {
        setActiveSessionKey(preferredSession?.key || sessions[0]?.key || "");
      }
    }, [activeSessionKey, preferredSession, sessions]);

    const activeSession =
      sessions.find((session) => session?.key === activeSessionKey) || preferredSession || null;
    const isLive = String(match?.status || "").toLowerCase() === "live";
    const title = getLiveMatchTitle(match);
    const subtitle = getLiveMatchSubtitle(match);
    const updatedText = timeAgo(match?.updatedAt);
    const thumbnail =
      match?.embed_thumbnail ||
      fb?.embed_thumbnail ||
      fb?.thumbnail_url ||
      fb?.picture ||
      (fb?.id ? `https://graph.facebook.com/${fb.id}/picture?type=large` : null);

    const handleCopy = useCallback(async (text: string, message = "Đã sao chép") => {
      if (!text) return;
      await Clipboard.setStringAsync(text);
      showNotice(message);
    }, []);

    const handleOpenExternal = useCallback(async (url?: string | null) => {
      if (!url) return;
      try {
        await Linking.openURL(url);
      } catch {
        showNotice("Không mở được liên kết");
      }
    }, []);

    const handleOpenPlayer = useCallback(() => {
      const playable =
        activeSession?.embedHtml ||
        activeSession?.pluginUrl ||
        activeSession?.directUrl ||
        activeSession?.manifestUrl;

      if (playable) {
        setPlayerVisible(true);
        return;
      }

      if (activeSession?.watchUrl || activeSession?.openUrl) {
        handleOpenExternal(activeSession?.watchUrl || activeSession?.openUrl);
      }
    }, [activeSession, handleOpenExternal]);

    const playerNode = renderPlayer(activeSession);
    const watchUrl = activeSession?.watchUrl || activeSession?.openUrl || "";
    const cardMeta = [getLiveStatusLabel(match?.status), courtText, updatedText && `Cập nhật ${updatedText}`]
      .filter(Boolean)
      .join(" • ");

    return (
      <>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={handleOpenPlayer}
          style={[
            styles.card,
            {
              backgroundColor: T.cardBg,
              borderColor: T.cardBorder,
              ...T.shadow,
            },
          ]}
        >
          <View style={styles.thumbnailWrap}>
            {thumbnail ? (
              <ExpoImage
                source={{ uri: normalizeUrl(thumbnail) }}
                style={styles.thumbnail}
                contentFit="cover"
                cachePolicy="memory-disk"
                placeholder={{ blurhash: BLURHASH }}
                transition={120}
              />
            ) : (
              <View style={[styles.thumbnailFallback, { backgroundColor: T.softBg }]}>
                <Ionicons name="videocam-outline" size={34} color={T.textSecondary} />
              </View>
            )}

            <View style={styles.overlay} />

            <View style={styles.topBadges}>
              <View style={[styles.badge, styles.liveBadge, isLive ? null : styles.defaultBadge]}>
                <View style={[styles.liveDot, !isLive && styles.offDot]} />
                <Text style={styles.liveBadgeText}>{isLive ? "LIVE" : getLiveStatusLabel(match?.status)}</Text>
              </View>

              {sessions.length > 0 ? (
                <View style={[styles.badge, styles.sessionBadge]}>
                  <Ionicons name="layers-outline" size={13} color="#ffffff" />
                  <Text style={styles.sessionBadgeText}>{sessions.length} nguồn</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.playHalo}>
              <View style={styles.playButton}>
                <Ionicons name="play" size={24} color="#ffffff" />
              </View>
            </View>
          </View>

          <View style={styles.body}>
            <View style={styles.titleRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.title, { color: T.textPrimary }]} numberOfLines={1}>
                  {title}
                </Text>
                <Text style={[styles.subtitle, { color: T.textSecondary }]} numberOfLines={2}>
                  {subtitle}
                </Text>
              </View>

              <View style={styles.iconRow}>
                <TouchableOpacity
                  onPress={() => setInfoVisible(true)}
                  style={[styles.iconBtn, { backgroundColor: T.softBg, borderColor: T.cardBorder }]}
                >
                  <Ionicons name="information-circle-outline" size={18} color={T.textPrimary} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleCopy(title, "Đã sao chép mã trận")}
                  style={[styles.iconBtn, { backgroundColor: T.softBg, borderColor: T.cardBorder }]}
                >
                  <Ionicons name="copy-outline" size={17} color={T.textPrimary} />
                </TouchableOpacity>
              </View>
            </View>

            <Text style={[styles.meta, { color: T.textSecondary }]} numberOfLines={2}>
              {cardMeta}
            </Text>

            {sessions.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.sessionList}
              >
                {sessions.map((session) => {
                  const active = activeSession?.key && session?.key === activeSession.key;
                  return (
                    <TouchableOpacity
                      key={sid(session?.key || session?.watchUrl)}
                      onPress={() => setActiveSessionKey(session?.key || "")}
                      style={[
                        styles.sessionChip,
                        {
                          backgroundColor: active ? T.accent : T.softBg,
                          borderColor: active ? T.accent : T.cardBorder,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.sessionChipText,
                          { color: active ? "#ffffff" : T.textPrimary },
                        ]}
                      >
                        {session?.label || session?.providerLabel || "Nguồn xem"}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : null}

            <View style={styles.actionsRow}>
              <TouchableOpacity
                onPress={handleOpenPlayer}
                style={[styles.primaryBtn, { backgroundColor: T.accent }]}
              >
                <Ionicons name="play-circle-outline" size={18} color="#ffffff" />
                <Text style={styles.primaryBtnText}>Xem ngay</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleOpenExternal(watchUrl)}
                disabled={!watchUrl}
                style={[
                  styles.secondaryBtn,
                  {
                    opacity: watchUrl ? 1 : 0.45,
                    backgroundColor: T.softBg,
                    borderColor: T.cardBorder,
                  },
                ]}
              >
                <Ionicons name="open-outline" size={17} color={T.textPrimary} />
                <Text style={[styles.secondaryBtnText, { color: T.textPrimary }]}>Mở ngoài</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>

        <Modal
          visible={playerVisible}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={() => setPlayerVisible(false)}
          statusBarTranslucent
        >
          <SafeAreaView style={[styles.modalRoot, { backgroundColor: "#050505" }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.modalTitle} numberOfLines={1}>
                  {title}
                </Text>
                <Text style={styles.modalSubtitle} numberOfLines={1}>
                  {watchUrl ? hostOf(watchUrl) || "Nguồn phát" : "Không có liên kết công khai"}
                </Text>
              </View>

              <View style={styles.modalActions}>
                {watchUrl ? (
                  <TouchableOpacity
                    style={styles.modalIconBtn}
                    onPress={() => handleCopy(watchUrl, "Đã sao chép liên kết")}
                  >
                    <Ionicons name="copy-outline" size={20} color="#ffffff" />
                  </TouchableOpacity>
                ) : null}
                {watchUrl ? (
                  <TouchableOpacity
                    style={styles.modalIconBtn}
                    onPress={() => handleOpenExternal(watchUrl)}
                  >
                    <Ionicons name="open-outline" size={20} color="#ffffff" />
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={styles.modalIconBtn}
                  onPress={() => setPlayerVisible(false)}
                >
                  <Ionicons name="close" size={22} color="#ffffff" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.playerWrap}>
              {playerNode ? (
                playerNode
              ) : activeSession?.disabledReason ? (
                <View style={styles.emptyPlayer}>
                  <Ionicons name="alert-circle-outline" size={54} color="rgba(255,255,255,0.72)" />
                  <Text style={styles.emptyPlayerTitle}>Nguồn phát chưa sẵn sàng</Text>
                  <Text style={styles.emptyPlayerText}>{activeSession.disabledReason}</Text>
                </View>
              ) : (
                <View style={styles.emptyPlayer}>
                  <Ionicons name="videocam-off-outline" size={54} color="rgba(255,255,255,0.72)" />
                  <Text style={styles.emptyPlayerTitle}>Không phát được trong ứng dụng</Text>
                  <Text style={styles.emptyPlayerText}>
                    Hãy mở liên kết ngoài để xem nếu nguồn này không hỗ trợ nhúng.
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.modalFooter}>
              {sessions.length > 1 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.modalSessionList}
                >
                  {sessions.map((session) => {
                    const active = activeSession?.key && session?.key === activeSession.key;
                    return (
                      <TouchableOpacity
                        key={sid(session?.key || session?.watchUrl)}
                        onPress={() => setActiveSessionKey(session?.key || "")}
                        style={[
                          styles.modalSessionChip,
                          { backgroundColor: active ? "#ffffff" : "rgba(255,255,255,0.08)" },
                        ]}
                      >
                        <Text
                          style={[
                            styles.modalSessionText,
                            { color: active ? "#041412" : "#ffffff" },
                          ]}
                        >
                          {session?.label || session?.providerLabel || "Nguồn xem"}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              ) : null}

              <View style={styles.footerMetaWrap}>
                <Text style={styles.footerMeta}>{cardMeta || "Trận phát trực tiếp"}</Text>
                {watchUrl ? (
                  <TouchableOpacity onPress={() => setInfoVisible(true)}>
                    <Text style={styles.footerLink}>Xem chi tiết</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </SafeAreaView>
        </Modal>

        <InfoModal
          visible={infoVisible}
          onClose={() => setInfoVisible(false)}
          match={buildLiveInfoMatch(match)}
          sessions={sessions}
          onCopy={handleCopy}
          onOpenUrl={handleOpenExternal}
        />
      </>
    );
  },
  (prev, next) =>
    sid(prev?.item?._id || prev?.item?.matchId) === sid(next?.item?._id || next?.item?.matchId) &&
    prev?.item?.status === next?.item?.status &&
    prev?.item?.updatedAt === next?.item?.updatedAt &&
    prev?.item?.defaultStreamKey === next?.item?.defaultStreamKey &&
    getLiveMatchCourtText(prev?.item) === getLiveMatchCourtText(next?.item)
);

export default LiveMatchCard;

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 16,
  },
  thumbnailWrap: {
    position: "relative",
    aspectRatio: 16 / 9,
    backgroundColor: "#071311",
  },
  thumbnail: {
    width: "100%",
    height: "100%",
  },
  thumbnailFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  topBadges: {
    position: "absolute",
    top: 14,
    left: 14,
    right: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  liveBadge: {
    backgroundColor: "rgba(220, 38, 38, 0.92)",
  },
  defaultBadge: {
    backgroundColor: "rgba(15, 23, 42, 0.72)",
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: "#ffffff",
  },
  offDot: {
    backgroundColor: "#94a3b8",
  },
  liveBadgeText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "800",
  },
  sessionBadge: {
    backgroundColor: "rgba(15, 23, 42, 0.72)",
  },
  sessionBadgeText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "700",
  },
  playHalo: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  playButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(4, 20, 18, 0.72)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.9)",
  },
  body: {
    paddingHorizontal: 16,
    paddingVertical: 15,
    gap: 12,
  },
  titleRow: {
    flexDirection: "row",
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
  },
  meta: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },
  iconRow: {
    flexDirection: "row",
    gap: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  sessionList: {
    gap: 8,
    paddingRight: 8,
  },
  sessionChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sessionChipText: {
    fontSize: 12,
    fontWeight: "800",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  primaryBtn: {
    flex: 1.15,
    minHeight: 46,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryBtnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
  secondaryBtn: {
    flex: 0.92,
    minHeight: 46,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: "800",
  },
  modalRoot: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 12,
  },
  modalTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 2,
  },
  modalSubtitle: {
    color: "rgba(255,255,255,0.64)",
    fontSize: 12,
    fontWeight: "600",
  },
  modalActions: {
    flexDirection: "row",
    gap: 8,
  },
  modalIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  playerWrap: {
    flex: 1,
    backgroundColor: "#000000",
  },
  player: {
    flex: 1,
    backgroundColor: "#000000",
  },
  emptyPlayer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  emptyPlayerTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "800",
    marginTop: 16,
    marginBottom: 10,
    textAlign: "center",
  },
  emptyPlayerText: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },
  modalFooter: {
    gap: 14,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 18,
    backgroundColor: "#050505",
  },
  modalSessionList: {
    gap: 8,
    paddingRight: 8,
  },
  modalSessionChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  modalSessionText: {
    fontSize: 12,
    fontWeight: "800",
  },
  footerMetaWrap: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  footerMeta: {
    flex: 1,
    color: "rgba(255,255,255,0.78)",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },
  footerLink: {
    color: "#6ee7d8",
    fontSize: 13,
    fontWeight: "800",
  },
});
