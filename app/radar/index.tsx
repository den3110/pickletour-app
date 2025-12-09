/* eslint-disable react/prop-types */
import React, { useCallback, useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  FlatList,
  Dimensions,
  SafeAreaView,
  Alert,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSelector } from "react-redux";
import MapboxGL from "@rnmapbox/maps";
import * as Location from "expo-location";
import { Image as ExpoImage } from "expo-image";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

const { width } = Dimensions.get("window");

const DEFAULT_CENTER = [105.804817, 21.028511]; // Hà Nội [lng, lat]
const RANGE_OPTIONS = [2, 5, 10, 20];
const PRESENCE_INTERVAL_MS = 2 * 60 * 1000;

const PLAY_TYPES = [
  { key: "any", label: "Tất cả" },
  { key: "single", label: "Single" },
  { key: "double", label: "Double" },
  { key: "mixed", label: "Mixed" },
];

export default function PickleRadarScreen() {
  const router = useRouter();
  const { userInfo } = useSelector((state) => state.auth || {});
  const token = userInfo?.token;

  const [radarEnabled, setRadarEnabled] = useState(false);
  const [radiusKm, setRadiusKm] = useState(5);
  const [playTypeFilter, setPlayTypeFilter] = useState("any");

  const [center, setCenter] = useState(null); // [lng, lat]
  const [playersRaw, setPlayersRaw] = useState([]);
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [error, setError] = useState(null);

  const [selectedPlayerId, setSelectedPlayerId] = useState(null);

  const presenceTimerRef = useRef(null);
  const cameraRef = useRef(null);
  const listRef = useRef(null);

  const apiBase = process.env.EXPO_PUBLIC_API_URL;

  const authFetch = useCallback(
    async (url, options = {}) => {
      const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch(url, {
        ...options,
        headers,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      return res.json();
    },
    [token]
  );

  const applyFilters = useCallback(
    (list) => {
      let filtered = list;
      if (playTypeFilter !== "any") {
        filtered = filtered.filter((p) => {
          const pt =
            p.preferredPlayType ||
            p.matchPreferences?.preferredPlayType ||
            "any";
          return pt === playTypeFilter || pt === "any";
        });
      }
      setPlayers(filtered);
      if (
        selectedPlayerId &&
        !filtered.some((p) => String(p.userId) === String(selectedPlayerId))
      ) {
        setSelectedPlayerId(filtered[0]?.userId ?? null);
      }
    },
    [playTypeFilter, selectedPlayerId]
  );

  const getCurrentLocation = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Quyền vị trí",
        "Bạn cần cho phép ứng dụng truy cập vị trí để dùng PickleRadar."
      );
      setCenter(DEFAULT_CENTER);
      return DEFAULT_CENTER;
    }
    const loc = await Location.getCurrentPositionAsync({});
    const c = [loc.coords.longitude, loc.coords.latitude];
    setCenter(c);
    return c;
  }, []);

  const sendPresence = useCallback(
    async (lng, lat) => {
      try {
        await authFetch(`${apiBase}/api/radar/presence`, {
          method: "POST",
          body: JSON.stringify({
            lng,
            lat,
            status: "looking_partner",
            visibility: "venue_only",
            source: "gps",
          }),
        });
      } catch (err) {
        console.log("sendPresence error", err.message);
      }
    },
    [authFetch, apiBase]
  );

  const fetchNearby = useCallback(
    async (lng, lat, rKm = radiusKm) => {
      try {
        setLoading(true);
        setError(null);
        const data = await authFetch(
          `${apiBase}/api/radar/nearby?lng=${lng}&lat=${lat}&radiusKm=${rKm}`
        );
        const list = data.players || [];
        setPlayersRaw(list);
        applyFilters(list);
        if (!selectedPlayerId && list.length) {
          setSelectedPlayerId(list[0].userId);
        }
      } catch (err) {
        console.log("fetchNearby error", err.message);
        setError("Không tải được danh sách người chơi.");
        setPlayersRaw([]);
        setPlayers([]);
      } finally {
        setLoading(false);
      }
    },
    [authFetch, apiBase, radiusKm, applyFilters, selectedPlayerId]
  );

  const loadRadarSettings = useCallback(async () => {
    try {
      setLoadingSettings(true);
      const data = await authFetch(`${apiBase}/api/radar/settings`);
      if (data?.radarSettings) {
        setRadarEnabled(!!data.radarSettings.enabled);
        setRadiusKm(data.radarSettings.radiusKm || 5);
        setPlayTypeFilter(data.radarSettings.preferredPlayType || "any");
      }
    } catch (err) {
      console.log("loadRadarSettings error", err.message);
    } finally {
      setLoadingSettings(false);
    }
  }, [authFetch, apiBase]);

  const updateRadarSettings = useCallback(
    async (nextEnabled = radarEnabled) => {
      try {
        setLoadingSettings(true);
        const data = await authFetch(`${apiBase}/api/radar/settings`, {
          method: "PATCH",
          body: JSON.stringify({
            enabled: nextEnabled,
            radiusKm,
            preferredPlayType: playTypeFilter,
          }),
        });
        setRadarEnabled(data.radarSettings.enabled);
      } catch (err) {
        console.log("updateRadarSettings error", err.message);
        Alert.alert("Lỗi", "Không cập nhật được trạng thái radar.");
      } finally {
        setLoadingSettings(false);
      }
    },
    [authFetch, apiBase, radarEnabled, radiusKm, playTypeFilter]
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;

      (async () => {
        if (!token) {
          setError("Bạn cần đăng nhập để dùng PickleRadar.");
          setLoading(false);
          return;
        }
        await loadRadarSettings();
        const c = await getCurrentLocation();
        if (!active) return;
        await fetchNearby(c[0], c[1]);
        if (!radarEnabled) {
          await updateRadarSettings(true);
        }
        await sendPresence(c[0], c[1]);
      })();

      return () => {
        active = false;
      };
    }, [
      token,
      loadRadarSettings,
      getCurrentLocation,
      fetchNearby,
      sendPresence,
      updateRadarSettings,
      radarEnabled,
    ])
  );

  useEffect(() => {
    if (!radarEnabled || !center) {
      if (presenceTimerRef.current) {
        clearInterval(presenceTimerRef.current);
        presenceTimerRef.current = null;
      }
      return;
    }
    presenceTimerRef.current = setInterval(() => {
      const [lng, lat] = center;
      sendPresence(lng, lat);
      fetchNearby(lng, lat);
    }, PRESENCE_INTERVAL_MS);

    return () => {
      if (presenceTimerRef.current) {
        clearInterval(presenceTimerRef.current);
        presenceTimerRef.current = null;
      }
    };
  }, [radarEnabled, center, sendPresence, fetchNearby]);

  useEffect(() => {
    applyFilters(playersRaw);
  }, [applyFilters, playersRaw]);

  const onChangeRadius = async (value) => {
    setRadiusKm(value);
    if (!center) return;
    const [lng, lat] = center;
    await fetchNearby(lng, lat, value);
    await updateRadarSettings(radarEnabled);
  };

  const flyToPlayer = (p) => {
    if (!p?.location || !cameraRef.current) return;
    const [lng, lat] = p.location.coordinates;
    cameraRef.current.flyTo([lng, lat], 1000);
  };

  const handleSelectPlayer = (p, index) => {
    setSelectedPlayerId(p.userId);
    flyToPlayer(p);
    if (listRef.current && index != null) {
      listRef.current.scrollToIndex({ index, animated: true });
    }
  };

  const sendPing = async (targetUserId) => {
    try {
      await authFetch(`${apiBase}/api/radar/ping`, {
        method: "POST",
        body: JSON.stringify({ targetUserId }),
      });
      Alert.alert("Đã ping", "Đã gửi tín hiệu tới người chơi này.");
    } catch (err) {
      console.log("ping error", err.message);
      Alert.alert("Lỗi", "Không gửi được ping.");
    }
  };

  const renderMarker = (p) => {
    const isSelected = String(p.userId) === String(selectedPlayerId);
    const distanceKm = (p.distance || 0) / 1000;

    return (
      <MapboxGL.PointAnnotation
        key={String(p.userId)}
        id={`radar-${p.userId}`}
        coordinate={[p.location.coordinates[0], p.location.coordinates[1]]}
        onSelected={() => {
          const idx = players.findIndex(
            (x) => String(x.userId) === String(p.userId)
          );
          handleSelectPlayer(p, idx === -1 ? null : idx);
        }}
      >
        <View
          style={[styles.pinWrapper, isSelected && styles.pinWrapperSelected]}
        >
          <ExpoImage source={{ uri: p.avatarUrl }} style={styles.pinAvatar} />
          <View style={styles.pinInfo}>
            <Text style={styles.pinName} numberOfLines={1}>
              {p.displayName || "Người chơi"}
            </Text>
            <Text style={styles.pinSub} numberOfLines={1}>
              {distanceKm.toFixed(1)} km
            </Text>
          </View>
        </View>
      </MapboxGL.PointAnnotation>
    );
  };

  const renderCard = ({ item, index }) => {
    const isSelected = String(item.userId) === String(selectedPlayerId);
    const distanceKm = (item.distance || 0) / 1000;
    const score = item.score || 0;

    return (
      <TouchableOpacity
        activeOpacity={0.9}
        style={[styles.card, isSelected && styles.cardSelected]}
        onPress={() => handleSelectPlayer(item, index)}
      >
        <View style={styles.cardHeader}>
          <ExpoImage
            source={{ uri: item.avatarUrl }}
            style={styles.cardAvatar}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.cardName} numberOfLines={1}>
              {item.displayName || "Người chơi PickleTour"}
            </Text>
            <View style={styles.cardMetaRow}>
              {item.rating && (
                <View style={styles.badgeSmall}>
                  <MaterialCommunityIcons
                    name="star-circle"
                    size={12}
                    color="#FACC15"
                    style={{ marginRight: 4 }}
                  />
                  <Text style={styles.badgeSmallText}>{item.rating}</Text>
                </View>
              )}
              <Text style={styles.cardMetaText}>
                {distanceKm.toFixed(1)} km
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.scoreRow}>
          <View style={styles.scoreBarBg}>
            <View style={[styles.scoreBarFill, { width: `${score}%` }]} />
          </View>
          <Text style={styles.scoreText}>
            Match score: {score.toFixed(0)} / 100
          </Text>
        </View>

        <View style={styles.cardBody}>
          {item.mainClubName && (
            <View style={styles.infoRow}>
              <Ionicons
                name="tennisball"
                size={14}
                color="#22C55E"
                style={{ marginRight: 6 }}
              />
              <Text style={styles.infoText} numberOfLines={1}>
                {item.mainClubName}
              </Text>
            </View>
          )}
          <View style={styles.infoRow}>
            <Ionicons
              name="time-outline"
              size={14}
              color="#9CA3AF"
              style={{ marginRight: 6 }}
            />
            <Text style={styles.infoText} numberOfLines={1}>
              Trạng thái:{" "}
              {item.status === "looking_partner"
                ? "Đang tìm partner"
                : item.status === "in_match"
                ? "Đang thi đấu"
                : "Đang rảnh"}
            </Text>
          </View>
          {item.intentKind && (
            <View style={styles.infoRow}>
              <Ionicons
                name="flash-outline"
                size={14}
                color="#F97316"
                style={{ marginRight: 6 }}
              />
              <Text style={styles.infoText} numberOfLines={1}>
                Đang tìm:{" "}
                {item.intentKind === "practice"
                  ? "Luyện tập"
                  : item.intentKind === "tournament"
                  ? "Đánh giải"
                  : item.intentKind === "friendly"
                  ? "Friendly"
                  : "Cafe / trò chuyện"}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.cardActions}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.pingBtn]}
            onPress={() => sendPing(item.userId)}
          >
            <Text style={styles.pingText}>Ping</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.primaryBtn]}
            onPress={() => router.push(`/profile/${item.userId}`)}
          >
            <Text style={styles.actionTextPrimary}>Xem hồ sơ</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.secondaryBtn]}
            onPress={() =>
              Alert.alert("Chat", "Hook vào màn chat tại đây nhé.")
            }
          >
            <Text style={styles.actionTextSecondary}>Nhắn tin</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => {
    if (loading || error || !center) return null;
    if (!players.length) {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Chưa có ai quanh đây</Text>
          <Text style={styles.emptyText}>
            Bạn đang là người đầu tiên bật PickleRadar. Rủ bạn bè bật để dễ ghép
            cặp hơn nhé!
          </Text>
        </View>
      );
    }
    return null;
  };

  if (!token) {
    return (
      <SafeAreaView style={styles.fullCenter}>
        <Text style={styles.infoText}>
          Bạn cần đăng nhập để dùng PickleRadar.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      {/* Map */}
      {center ? (
        <MapboxGL.MapView
          style={styles.map}
          styleURL={MapboxGL.StyleURL.Street}
          logoEnabled={false}
          attributionEnabled={false}
        >
          <MapboxGL.Camera
            ref={cameraRef}
            centerCoordinate={center}
            zoomLevel={13}
          />

          {/* vị trí mình */}
          <MapboxGL.PointAnnotation id="me" coordinate={center}>
            <View style={styles.mePulseOuter}>
              <View style={styles.mePulseInner} />
            </View>
          </MapboxGL.PointAnnotation>

          {/* người chơi */}
          {players.map(renderMarker)}
        </MapboxGL.MapView>
      ) : (
        <View style={styles.fullCenter}>
          <ActivityIndicator />
          <Text style={styles.infoText}>Đang lấy vị trí...</Text>
        </View>
      )}

      {/* overlay radar vòng tròn (static, đủ tạo vibe) */}
      <View pointerEvents="none" style={styles.radarOverlay}>
        <View style={styles.radarCircleBig} />
        <View style={styles.radarCircleMid} />
        <View style={styles.radarCircleSmall} />
      </View>

      {/* Hero + filter */}
      <SafeAreaView style={styles.topSafe}>
        <View style={styles.heroRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>PickleRadar</Text>
            <Text style={styles.heroSubtitle}>
              Tìm người chơi quanh bạn để ghép cặp, đặt trận và kết bạn dễ dàng
              hơn.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.statusPill]}
            disabled={loadingSettings}
            onPress={() => updateRadarSettings(!radarEnabled)}
          >
            <View
              style={[styles.statusDot, radarEnabled && styles.statusDotOn]}
            />
            <Text
              style={[styles.statusText, radarEnabled && styles.statusTextOn]}
            >
              {radarEnabled ? "Đang hiển thị" : "Đang ẩn"}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.filtersRow}>
          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>Bán kính</Text>
            <View style={styles.filterChipsRow}>
              {RANGE_OPTIONS.map((r) => {
                const active = r === radiusKm;
                return (
                  <TouchableOpacity
                    key={r}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => onChangeRadius(r)}
                  >
                    <Text
                      style={[styles.chipText, active && styles.chipTextActive]}
                    >
                      {r} km
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>Kiểu chơi</Text>
            <View style={styles.filterChipsRow}>
              {PLAY_TYPES.map((pt) => {
                const active = pt.key === playTypeFilter;
                return (
                  <TouchableOpacity
                    key={pt.key}
                    style={[styles.chip, active && styles.chipActiveSoft]}
                    onPress={() => setPlayTypeFilter(pt.key)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        active && styles.chipTextActiveSoft,
                      ]}
                    >
                      {pt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </SafeAreaView>

      {/* Cards */}
      <View style={styles.cardsContainer}>
        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator />
          </View>
        )}
        {error && !loading && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
        {renderEmpty()}

        {!!players.length && (
          <>
            <FlatList
              ref={listRef}
              data={players}
              keyExtractor={(item) => String(item.userId)}
              renderItem={renderCard}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16 }}
              snapToInterval={width * 0.8 + 12}
              decelerationRate="fast"
              onMomentumScrollEnd={(e) => {
                const index = Math.round(
                  e.nativeEvent.contentOffset.x / (width * 0.8 + 12)
                );
                const p = players[index];
                if (p) {
                  setSelectedPlayerId(p.userId);
                  flyToPlayer(p);
                }
              }}
            />

            <View style={styles.rightIndicator}>
              <View style={styles.rightIndicatorInner}>
                <Ionicons
                  name="people-circle-outline"
                  size={16}
                  color="#E5E7EB"
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.rightIndicatorText}>
                  {players.length} người chơi
                </Text>
              </View>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#020617" },
  map: { flex: 1 },

  fullCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#020617",
  },

  topSafe: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
  },

  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  heroTitle: {
    color: "#F9FAFB",
    fontSize: 20,
    fontWeight: "800",
  },
  heroSubtitle: {
    color: "#9CA3AF",
    fontSize: 12,
    marginTop: 4,
    maxWidth: width * 0.6,
  },

  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(31,41,55,0.9)",
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#6B7280",
    marginRight: 6,
  },
  statusDotOn: {
    backgroundColor: "#22C55E",
  },
  statusText: {
    color: "#E5E7EB",
    fontSize: 12,
  },
  statusTextOn: {
    fontWeight: "600",
  },

  filtersRow: {
    borderRadius: 16,
    backgroundColor: "rgba(15,23,42,0.92)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 4,
  },
  filterGroup: {
    marginBottom: 6,
  },
  filterLabel: {
    color: "#9CA3AF",
    fontSize: 11,
    marginBottom: 2,
  },
  filterChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#374151",
    marginRight: 6,
    marginTop: 4,
  },
  chipActive: {
    backgroundColor: "#10B981",
    borderColor: "#10B981",
  },
  chipActiveSoft: {
    backgroundColor: "rgba(59,130,246,0.25)",
    borderColor: "#3B82F6",
  },
  chipText: {
    fontSize: 11,
    color: "#E5E7EB",
  },
  chipTextActive: {
    color: "#022C22",
    fontWeight: "600",
  },
  chipTextActiveSoft: {
    color: "#E5E7EB",
    fontWeight: "600",
  },

  mePulseOuter: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(56,189,248,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  mePulseInner: {
    width: 13,
    height: 13,
    borderRadius: 6.5,
    backgroundColor: "#0EA5E9",
  },

  radarOverlay: {
    position: "absolute",
    top: "25%",
    left: "10%",
    right: "10%",
    bottom: "32%",
    justifyContent: "center",
    alignItems: "center",
  },
  radarCircleBig: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.3)",
  },
  radarCircleMid: {
    position: "absolute",
    width: "66%",
    aspectRatio: 1,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.4)",
  },
  radarCircleSmall: {
    position: "absolute",
    width: "35%",
    aspectRatio: 1,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: "rgba(56,189,248,0.7)",
  },

  pinWrapper: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(15,23,42,0.9)",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.6)",
  },
  pinWrapperSelected: {
    borderColor: "#22C55E",
    backgroundColor: "rgba(22,163,74,0.85)",
  },
  pinAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 4,
  },
  pinInfo: {
    maxWidth: 100,
  },
  pinName: {
    fontSize: 11,
    color: "#F9FAFB",
  },
  pinSub: {
    fontSize: 10,
    color: "#E5E7EB",
  },

  cardsContainer: {
    position: "absolute",
    bottom: 24,
    left: 0,
    right: 0,
  },
  card: {
    width: width * 0.8,
    marginRight: 12,
    borderRadius: 18,
    backgroundColor: "rgba(15,23,42,0.95)",
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(55,65,81,0.9)",
  },
  cardSelected: {
    borderColor: "#22C55E",
    shadowColor: "#22C55E",
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 8,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  cardAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 10,
  },
  cardName: {
    color: "#F9FAFB",
    fontSize: 16,
    fontWeight: "700",
  },
  cardMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  cardMetaText: {
    color: "#9CA3AF",
    fontSize: 11,
    marginLeft: 8,
  },

  scoreRow: {
    marginTop: 8,
  },
  scoreBarBg: {
    width: "100%",
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(31,41,55,0.9)",
    overflow: "hidden",
  },
  scoreBarFill: {
    height: 4,
    backgroundColor: "#22C55E",
  },
  scoreText: {
    color: "#9CA3AF",
    fontSize: 11,
    marginTop: 4,
  },

  cardBody: {
    marginTop: 8,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
 

  badgeSmall: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(120,53,15,0.35)",
  },
  badgeSmallText: {
    color: "#FACC15",
    fontSize: 11,
  },

  cardActions: {
    flexDirection: "row",
    marginTop: 10,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 3,
  },
  pingBtn: {
    borderWidth: 1,
    borderColor: "#F97316",
    backgroundColor: "rgba(248,113,113,0.1)",
  },
  primaryBtn: {
    backgroundColor: "#22C55E",
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: "#4B5563",
  },
  pingText: {
    color: "#F97316",
    fontWeight: "600",
    fontSize: 13,
  },
  actionTextPrimary: {
    color: "#022C22",
    fontWeight: "600",
    fontSize: 13,
  },
  actionTextSecondary: {
    color: "#E5E7EB",
    fontWeight: "500",
    fontSize: 13,
  },

  loadingOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 80,
    alignItems: "center",
  },
  errorBox: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 84,
    padding: 8,
    borderRadius: 10,
    backgroundColor: "rgba(127,29,29,0.9)",
  },
  errorText: {
    color: "#FEE2E2",
    fontSize: 12,
    textAlign: "center",
  },

  emptyState: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 84,
    padding: 10,
    borderRadius: 12,
    backgroundColor: "rgba(15,23,42,0.96)",
  },
  emptyTitle: {
    color: "#F9FAFB",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  emptyText: {
    color: "#9CA3AF",
    fontSize: 12,
  },

  rightIndicator: {
    position: "absolute",
    right: 18,
    bottom: 190,
  },
  rightIndicatorInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(15,23,42,0.9)",
  },
  rightIndicatorText: {
    color: "#E5E7EB",
    fontSize: 11,
  },

  infoText: {
    color: "#E5E7EB",
    fontSize: 14,
  },
});
