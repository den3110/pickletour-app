/* eslint-disable react/prop-types */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  FlatList,
  Dimensions,
  Platform,
  StatusBar,
  useColorScheme,
  SafeAreaView,
  Modal,
  TouchableWithoutFeedback,
  Image,
  Linking,
} from "react-native";
import { useRouter } from "expo-router";
import MapboxGL from "@rnmapbox/maps";
import * as Location from "expo-location";
import { Image as ExpoImage } from "expo-image";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";

import {
  useGetRadarExploreQuery,
  useUpsertMyPresenceMutation,
} from "@/slices/radarApiSlice";

// --- CONFIG ---
const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;
MapboxGL.setAccessToken(MAPBOX_TOKEN || "");

const { width } = Dimensions.get("window");
const CARD_WIDTH = width * 0.82;

// --- COLORS ---
const THEME_COLOR = "#F97316";
const NEON_BLUE = "#0EA5E9";

// Default center (không xin được vị trí vẫn xem map bình thường)
const DEFAULT_CENTER = [100.5018, 13.7563]; // Bangkok

const PLAY_TYPES = [
  { key: "any", label: "Tất cả" },
  { key: "single", label: "Single" },
  { key: "double", label: "Double" },
  { key: "mixed", label: "Mixed" },
];

const ENTITY_TYPES = [
  { key: "all", label: "Mọi thứ" },
  { key: "user", label: "VĐV" },
  { key: "tournament", label: "Giải" },
  { key: "club", label: "CLB" },
  { key: "court", label: "Sân" }, // bạn thêm sau (backend trả về là chạy)
];

const RANGE_OPTIONS = [2, 5, 10, 20];

// --- HELPERS ---
const getBoundsFromRadius = (center, radiusKm) => {
  if (!center) return null;
  const [lng, lat] = center;
  const latDelta = radiusKm / 111.0;
  const lngDelta = radiusKm / (111.0 * Math.cos(lat * (Math.PI / 180)));
  return {
    ne: [lng + lngDelta, lat + latDelta],
    sw: [lng - lngDelta, lat - latDelta],
  };
};

const createGeoJSONCircle = (center, radiusInKm, points = 64) => {
  if (!center) return null;
  const coords = { latitude: center[1], longitude: center[0] };
  const km = radiusInKm;
  const ret = [];
  const distanceX = km / (111.32 * Math.cos((coords.latitude * Math.PI) / 180));
  const distanceY = km / 110.574;

  let theta, x, y;
  for (let i = 0; i < points; i++) {
    theta = (i / points) * (2 * Math.PI);
    x = distanceX * Math.cos(theta);
    y = distanceY * Math.sin(theta);
    ret.push([coords.longitude + x, coords.latitude + y]);
  }
  ret.push(ret[0]);
  return {
    type: "FeatureCollection",
    features: [
      { type: "Feature", geometry: { type: "Polygon", coordinates: [ret] } },
    ],
  };
};

const formatKm = (meters) => {
  if (!Number.isFinite(meters)) return "";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
};

const typeIcon = (type) => {
  switch (type) {
    case "user":
      return { name: "account", color: THEME_COLOR };
    case "tournament":
      return { name: "trophy", color: "#FACC15" };
    case "club":
      return { name: "shield-star", color: "#22C55E" };
    case "court":
      return { name: "map-marker", color: NEON_BLUE };
    default:
      return { name: "map-marker", color: "#64748B" };
  }
};

const safeAvatarFallback = (title = "PK") =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(
    title
  )}&background=0EA5E9&color=fff&size=128`;

// --- COMPONENTS ---
const RadarLoading = ({ isDark }) => (
  <View
    style={[
      styles.centerFill,
      { backgroundColor: isDark ? "#020617" : "#F8FAFC" },
    ]}
  >
    <ActivityIndicator size="large" color={THEME_COLOR} />
    <Text style={[styles.loadingText, { color: isDark ? "#FFF" : "#333" }]}>
      Đang tải radar...
    </Text>
  </View>
);

const PermissionHintBanner = ({ isDark, onEnable }) => (
  <View
    style={[
      styles.permissionBanner,
      {
        backgroundColor: isDark
          ? "rgba(15,23,42,0.92)"
          : "rgba(255,255,255,0.95)",
      },
    ]}
  >
    <MaterialCommunityIcons name="map-marker-off" size={18} color="#64748B" />
    <Text
      style={{
        flex: 1,
        marginLeft: 8,
        color: isDark ? "#E5E7EB" : "#111827",
        fontSize: 12,
      }}
    >
      Bật định vị để quét xung quanh bạn.
    </Text>
    <TouchableOpacity onPress={onEnable} style={styles.permissionBannerBtn}>
      <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 12 }}>
        Bật
      </Text>
    </TouchableOpacity>
  </View>
);

const RadarPulse = () => {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(1);
  useEffect(() => {
    scale.value = withRepeat(
      withTiming(4, { duration: 3000, easing: Easing.out(Easing.ease) }),
      -1,
      false
    );
    opacity.value = withRepeat(
      withTiming(0, { duration: 3000, easing: Easing.out(Easing.ease) }),
      -1,
      false
    );
  }, []);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));
  return (
    <View style={styles.radarContainer} pointerEvents="none">
      <View style={styles.radarStaticCircle} />
      <Animated.View style={[styles.radarPulse, animatedStyle]} />
    </View>
  );
};

const StatusBubble = ({ message, emoji }) => {
  return (
    <View style={styles.bubbleContainer}>
      <View style={styles.bubbleContent}>
        {!!emoji && <Text style={styles.bubbleEmoji}>{emoji}</Text>}
        <Text style={styles.bubbleText} numberOfLines={1}>
          {message}
        </Text>
      </View>
      <View style={styles.bubbleArrow} />
    </View>
  );
};

// --- MAIN SCREEN ---
export default function PickleRadarScreen() {
  const router = useRouter();
  const theme = useColorScheme();
  const isDark = theme === "dark";

  // State
  const [myLocation, setMyLocation] = useState(null); // [lng, lat] | null
  const [hasLocationPermission, setHasLocationPermission] = useState(null); // null | true | false

  const [selectedId, setSelectedId] = useState(null);
  const [pingedIds, setPingedIds] = useState([]);

  // Filters
  const [radiusKm, setRadiusKm] = useState(5);
  const [playTypeFilter, setPlayTypeFilter] = useState("any");
  const [entityType, setEntityType] = useState("all");

  const [showRadiusModal, setShowRadiusModal] = useState(false);
  const [circleGeoJSON, setCircleGeoJSON] = useState(null);

  // Refs
  const cameraRef = useRef(null);
  const listRef = useRef(null);
  const isUserInteracting = useRef(false);

  // API
  const typesParam = useMemo(() => {
    if (entityType === "all") return "user,tournament,club";
    return entityType; // "user" | "tournament" | "club" | "court"
  }, [entityType]);

  const shouldQuery = !!myLocation;

  const {
    data: exploreData,
    isLoading: isExploreLoading,
    isFetching: isExploreFetching,
    refetch,
  } = useGetRadarExploreQuery(
    {
      lng: myLocation?.[0],
      lat: myLocation?.[1],
      radiusKm,
      playType: playTypeFilter,
      types: typesParam,
    },
    { skip: !shouldQuery }
  );

  const [upsertPresence, { isLoading: isPresenceSaving }] =
    useUpsertMyPresenceMutation();

  const radarItems = useMemo(() => {
    const items = Array.isArray(exploreData?.items) ? exploreData.items : [];
    // UI-side filter nhẹ: nếu item.type != selected type thì bỏ (server đã làm rồi, nhưng giữ cho chắc)
    const filtered =
      entityType === "all"
        ? items
        : items.filter((it) => it?.type === entityType);

    // playTypeFilter hiện chủ yếu cho user; nếu bạn muốn strict hơn thì backend lọc theo profile
    if (playTypeFilter === "any") return filtered;

    return filtered.map((it) => it); // giữ nguyên cho hiện tại
  }, [exploreData, entityType, playTypeFilter]);

  // Auto select first item
  useEffect(() => {
    if (!selectedId && radarItems.length > 0) {
      setSelectedId(String(radarItems[0]?.id));
    }
  }, [radarItems, selectedId]);

  // Circle
  useEffect(() => {
    if (myLocation) setCircleGeoJSON(createGeoJSONCircle(myLocation, radiusKm));
    else setCircleGeoJSON(null);
  }, [myLocation, radiusKm]);

  // --- LOGIC: LOCATION ---
  const getCurrentLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      const granted = status === "granted";
      setHasLocationPermission(granted);

      if (!granted) return null;

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      return [loc.coords.longitude, loc.coords.latitude];
    } catch (e) {
      console.log("Location Error:", e);
      setHasLocationPermission(false);
      return null;
    }
  }, []);

  const ensureLocationAndFetch = useCallback(async () => {
    const loc = await getCurrentLocation();
    if (loc) {
      setMyLocation(loc);

      // upsert presence (best-effort)
      try {
        await upsertPresence({
          lng: loc[0],
          lat: loc[1],
          source: "gps",
          visibility: "venue_only",
          status: "looking_partner",
          preferredRadiusKm: radiusKm,
        }).unwrap();
      } catch (e) {
        // không block UX
        console.log("Presence upsert failed:", e?.data || e?.message || e);
      }
    }
  }, [getCurrentLocation, upsertPresence, radiusKm]);

  // Init: không block map nếu denied
  const [bootLoading, setBootLoading] = useState(true);
  useEffect(() => {
    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      const granted = status === "granted";
      setHasLocationPermission(granted);

      if (granted) {
        await ensureLocationAndFetch();
      }
      setBootLoading(false);
    })();
  }, [ensureLocationAndFetch]);

  // --- ACTIONS ---
  const zoomToRadius = (center, rKm) => {
    if (!cameraRef.current || !center) return;
    isUserInteracting.current = false;
    const { ne, sw } = getBoundsFromRadius(center, rKm);
    cameraRef.current.fitBounds(ne, sw, [150, 60, 350, 60], 800);
  };

  const handleSelectItem = (it, index) => {
    isUserInteracting.current = false;
    setSelectedId(String(it.id));

    const coords = it?.location?.coordinates;
    if (Array.isArray(coords) && coords.length === 2) {
      cameraRef.current?.flyTo(coords, 800);
    }

    if (listRef.current && index != null) {
      listRef.current.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0.5,
      });
    }
  };

  const handlePing = async (it) => {
    if (pingedIds.includes(String(it.id))) return;
    if (Platform.OS !== "web") {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    setPingedIds((prev) => [...prev, String(it.id)]);
  };

  const handleOpenDetail = (it) => {
    const id = String(it?.id || "");
    if (!id) return;

    if (it.type === "user") return router.push(`/profile/${id}`);
    if (it.type === "tournament") return router.push(`/tournaments/${id}`);
    if (it.type === "club") return router.push(`/clubs/${id}`);
    if (it.type === "court") return router.push(`/courts/${id}`);
  };

  const handleRecenter = async () => {
    // Nếu chưa có location -> xin quyền + lấy location
    if (!myLocation) {
      await ensureLocationAndFetch();
      return;
    }
    zoomToRadius(myLocation, radiusKm);
    refetch?.();
  };

  // --- STYLES ---
  const dynamicStyles = {
    container: { backgroundColor: isDark ? "#020617" : "#FFF" },
    cardBg: isDark ? "rgba(15, 23, 42, 0.9)" : "rgba(255, 255, 255, 0.95)",
    cardBorder: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)",
    textMain: isDark ? "#FFF" : "#1F2937",
    textSub: isDark ? "#94A3B8" : "#6B7280",
    chipBg: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)",
    pillBg: isDark ? "rgba(30, 41, 59, 0.9)" : "rgba(255, 255, 255, 0.95)",
    modalBg: isDark ? "rgba(15, 23, 42, 0.95)" : "rgba(255,255,255, 0.95)",
  };

  // --- RENDERERS ---
  const renderMarker = (it) => {
    const coords = it?.location?.coordinates;
    if (!Array.isArray(coords) || coords.length !== 2) return null; // không có geo thì không vẽ marker

    const isSelected = String(it.id) === String(selectedId);

    // bubble ưu tiên statusMessage, fallback theo type
    const bubbleText =
      it?.statusMessage ||
      (it.type === "tournament"
        ? "Giải đấu gần bạn"
        : it.type === "club"
        ? "CLB"
        : "");

    const bubbleEmoji =
      it?.statusEmoji ||
      (it.type === "tournament" ? "🏆" : it.type === "club" ? "🛡️" : "");

    const showBubble = !!bubbleText && !isSelected;

    const imgUri =
      it.avatarUrl || it.imageUrl || safeAvatarFallback(it.title || "PK");

    return (
      <MapboxGL.PointAnnotation
        key={`${it.type}-${String(it.id)}`}
        id={`radar-${it.type}-${String(it.id)}`}
        coordinate={coords}
        onSelected={() => handleSelectItem(it, radarItems.indexOf(it))}
        anchor={{ x: 0.5, y: 1 }}
      >
        <View style={styles.markerContainerFixed}>
          {showBubble && (
            <StatusBubble message={bubbleText} emoji={bubbleEmoji} />
          )}
          <View
            style={[
              styles.markerRoot,
              isSelected && { transform: [{ scale: 1.25 }], zIndex: 99 },
            ]}
          >
            <View
              style={[
                styles.markerRing,
                {
                  borderColor: isSelected ? THEME_COLOR : "#FFF",
                  backgroundColor: "#FFF",
                },
              ]}
            >
              <Image
                source={{ uri: imgUri }}
                style={styles.markerImg}
                resizeMode="cover"
              />
            </View>
            {isSelected && <View style={styles.markerArrow} />}
          </View>
        </View>
      </MapboxGL.PointAnnotation>
    );
  };

  const renderCard = ({ item, index }) => {
    const isSelected = String(item.id) === String(selectedId);
    const isPinged = pingedIds.includes(String(item.id));

    const icon = typeIcon(item.type);
    const distText = formatKm(item.distanceMeters);

    const avatar =
      item.avatarUrl || item.imageUrl || safeAvatarFallback(item.title || "PK");

    const showScore = item.type === "user" && Number.isFinite(item.score);
    const scoreVal = showScore ? item.score : 0;

    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => handleSelectItem(item, index)}
        style={styles.cardWrapper}
      >
        <BlurView
          intensity={80}
          tint={isDark ? "dark" : "light"}
          style={[
            styles.cardBlur,
            {
              borderColor: isSelected ? THEME_COLOR : dynamicStyles.cardBorder,
              backgroundColor:
                Platform.OS === "android" ? dynamicStyles.cardBg : undefined,
            },
          ]}
        >
          <View style={styles.cardHeader}>
            <ExpoImage
              source={{ uri: avatar }}
              style={[styles.cardAvatar, { backgroundColor: "#FFF" }]}
            />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <View style={styles.nameRow}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    flex: 1,
                  }}
                >
                  <MaterialCommunityIcons
                    name={icon.name}
                    size={14}
                    color={icon.color}
                  />
                  <Text
                    style={[styles.cardName, { color: dynamicStyles.textMain }]}
                    numberOfLines={1}
                  >
                    {item.title}
                  </Text>
                </View>

                {item.type === "user" && item.rating ? (
                  <View style={styles.ratingPill}>
                    <Ionicons name="star" size={10} color="#FACC15" />
                    <Text style={styles.ratingText}>{item.rating}</Text>
                  </View>
                ) : null}
              </View>

              {!!item.statusMessage ? (
                <Text
                  style={{
                    color: THEME_COLOR,
                    fontSize: 12,
                    fontWeight: "600",
                    marginTop: 2,
                  }}
                  numberOfLines={1}
                >
                  {item.statusEmoji ? `${item.statusEmoji} ` : ""}
                  {item.statusMessage}
                </Text>
              ) : (
                <Text
                  style={[styles.cardClub, { color: dynamicStyles.textSub }]}
                  numberOfLines={1}
                >
                  {item.subtitle || "—"}
                  {distText ? ` • ${distText}` : ""}
                </Text>
              )}
            </View>
          </View>

          {showScore ? (
            <View style={styles.statsRow}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={{ fontSize: 10, color: dynamicStyles.textSub }}>
                  Độ hợp:{" "}
                  <Text style={{ fontWeight: "bold", color: THEME_COLOR }}>
                    {scoreVal}%
                  </Text>
                </Text>
                <View style={[styles.scoreTrack, { marginTop: 6 }]}>
                  <View style={[styles.scoreFill, { width: `${scoreVal}%` }]} />
                </View>
              </View>

              <View
                style={[
                  styles.intentBadge,
                  { backgroundColor: dynamicStyles.chipBg },
                ]}
              >
                <MaterialCommunityIcons
                  name="target"
                  size={12}
                  color={dynamicStyles.textMain}
                />
                <Text
                  style={[styles.intentText, { color: dynamicStyles.textMain }]}
                >
                  {item.intentKind || item.type}
                </Text>
              </View>
            </View>
          ) : (
            <View
              style={[
                styles.intentBadge,
                {
                  backgroundColor: dynamicStyles.chipBg,
                  alignSelf: "flex-start",
                  marginBottom: 12,
                },
              ]}
            >
              <MaterialCommunityIcons
                name="information"
                size={12}
                color={dynamicStyles.textMain}
              />
              <Text
                style={[styles.intentText, { color: dynamicStyles.textMain }]}
              >
                {item.type}
              </Text>
            </View>
          )}

          <View style={styles.actionRow}>
            {item.type === "user" ? (
              <>
                <TouchableOpacity
                  style={[
                    styles.btnAction,
                    { backgroundColor: isPinged ? "#374151" : THEME_COLOR },
                  ]}
                  onPress={() => handlePing(item)}
                  disabled={isPinged}
                >
                  {isPinged ? (
                    <View
                      style={{ flexDirection: "row", alignItems: "center" }}
                    >
                      <Ionicons name="checkmark" size={16} color="#9CA3AF" />
                      <Text
                        style={[
                          styles.btnTextPrimary,
                          { color: "#9CA3AF", marginLeft: 4 },
                        ]}
                      >
                        Đã Ping
                      </Text>
                    </View>
                  ) : (
                    <Text style={[styles.btnTextPrimary, { color: "#FFF" }]}>
                      Ping ⚡️
                    </Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.btnAction,
                    { backgroundColor: dynamicStyles.chipBg, flex: 2 },
                  ]}
                  onPress={() => handleOpenDetail(item)}
                >
                  <Text
                    style={[
                      styles.btnTextSecondary,
                      { color: dynamicStyles.textMain },
                    ]}
                  >
                    Xem Profile
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={[
                    styles.btnAction,
                    { backgroundColor: THEME_COLOR, flex: 2 },
                  ]}
                  onPress={() => handleOpenDetail(item)}
                >
                  <Text style={[styles.btnTextPrimary, { color: "#FFF" }]}>
                    Xem chi tiết
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.btnAction,
                    { backgroundColor: dynamicStyles.chipBg },
                  ]}
                  onPress={() => {
                    // nếu item có location thì mở maps
                    const coords = item?.location?.coordinates;
                    if (!Array.isArray(coords) || coords.length !== 2) return;
                    const [lng, lat] = coords;
                    const url =
                      Platform.OS === "ios"
                        ? `http://maps.apple.com/?ll=${lat},${lng}`
                        : `geo:${lat},${lng}?q=${lat},${lng}`;
                    Linking.openURL(url).catch(() => {});
                  }}
                >
                  <Text
                    style={[
                      styles.btnTextSecondary,
                      { color: dynamicStyles.textMain },
                    ]}
                  >
                    Maps
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          {(isExploreFetching || isPresenceSaving) && isSelected ? (
            <View
              style={{
                marginTop: 10,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <ActivityIndicator size="small" color={THEME_COLOR} />
              <Text style={{ color: dynamicStyles.textSub, fontSize: 12 }}>
                Đang cập nhật…
              </Text>
            </View>
          ) : null}
        </BlurView>
      </TouchableOpacity>
    );
  };

  // --- UI STATES ---
  if (bootLoading) return <RadarLoading isDark={isDark} />;

  const centerCoordinate = myLocation || DEFAULT_CENTER;

  return (
    <View style={[styles.container, dynamicStyles.container]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />

      <MapboxGL.MapView
        style={styles.map}
        styleURL={isDark ? MapboxGL.StyleURL.Dark : MapboxGL.StyleURL.Street}
        logoEnabled={false}
        attributionEnabled={false}
        onTouchStart={() => {
          isUserInteracting.current = true;
        }}
      >
        <MapboxGL.Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate,
            zoomLevel: myLocation ? 14 : 11,
          }}
        />

        {myLocation && circleGeoJSON ? (
          <MapboxGL.ShapeSource id="radiusSource" shape={circleGeoJSON}>
            <MapboxGL.FillLayer
              id="radiusFill"
              style={{ fillColor: NEON_BLUE, fillOpacity: 0.08 }}
            />
            <MapboxGL.LineLayer
              id="radiusStroke"
              style={{
                lineColor: NEON_BLUE,
                lineWidth: 1.5,
                lineOpacity: 0.6,
                lineDasharray: [2, 2],
              }}
            />
          </MapboxGL.ShapeSource>
        ) : null}

        {myLocation ? (
          <MapboxGL.PointAnnotation id="me" coordinate={myLocation}>
            <RadarPulse />
          </MapboxGL.PointAnnotation>
        ) : null}

        {radarItems.map(renderMarker)}
      </MapboxGL.MapView>

      <SafeAreaView style={styles.headerSafe} pointerEvents="box-none">
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.roundBtn, { backgroundColor: dynamicStyles.pillBg }]}
          >
            <Ionicons
              name="chevron-back"
              size={22}
              color={dynamicStyles.textMain}
            />
          </TouchableOpacity>

          <View style={{ flex: 1, marginHorizontal: 8, gap: 8 }}>
            {/* Entity types */}
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={ENTITY_TYPES}
              keyExtractor={(item) => item.key}
              renderItem={({ item }) => {
                const active = entityType === item.key;
                return (
                  <TouchableOpacity
                    onPress={() => setEntityType(item.key)}
                    style={[
                      styles.pill,
                      {
                        paddingVertical: 8,
                        backgroundColor: active
                          ? THEME_COLOR
                          : dynamicStyles.pillBg,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.pillText,
                        {
                          color: active ? "#FFF" : dynamicStyles.textMain,
                          fontWeight: active ? "700" : "400",
                        },
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />

            {/* Play types */}
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={PLAY_TYPES}
              keyExtractor={(item) => item.key}
              renderItem={({ item }) => {
                const active = playTypeFilter === item.key;
                return (
                  <TouchableOpacity
                    onPress={() => setPlayTypeFilter(item.key)}
                    style={[
                      styles.pill,
                      {
                        backgroundColor: active
                          ? THEME_COLOR
                          : dynamicStyles.pillBg,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.pillText,
                        {
                          color: active ? "#FFF" : dynamicStyles.textMain,
                          fontWeight: active ? "700" : "400",
                        },
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>

          <TouchableOpacity
            onPress={() => setShowRadiusModal(true)}
            style={[
              styles.radiusBtn,
              { backgroundColor: dynamicStyles.pillBg },
            ]}
          >
            <MaterialCommunityIcons name="radar" size={18} color={NEON_BLUE} />
            <Text
              style={{
                fontSize: 10,
                fontWeight: "700",
                color: dynamicStyles.textMain,
                marginLeft: 4,
              }}
            >
              {radiusKm}km
            </Text>
          </TouchableOpacity>
        </View>

        {hasLocationPermission === false ? (
          <PermissionHintBanner
            isDark={isDark}
            onEnable={ensureLocationAndFetch}
          />
        ) : null}
      </SafeAreaView>

      <Modal
        animationType="fade"
        transparent={true}
        visible={showRadiusModal}
        onRequestClose={() => setShowRadiusModal(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowRadiusModal(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <BlurView
                intensity={40}
                tint={isDark ? "dark" : "light"}
                style={[
                  styles.modalContent,
                  { backgroundColor: dynamicStyles.modalBg },
                ]}
              >
                <Text
                  style={[styles.modalTitle, { color: dynamicStyles.textMain }]}
                >
                  Quét trong
                </Text>

                <View style={styles.modalGrid}>
                  {RANGE_OPTIONS.map((opt) => {
                    const isActive = radiusKm === opt;
                    return (
                      <TouchableOpacity
                        key={opt}
                        style={[
                          styles.modalOption,
                          isActive && styles.modalOptionActive,
                          {
                            borderColor: isActive
                              ? THEME_COLOR
                              : dynamicStyles.cardBorder,
                          },
                        ]}
                        onPress={() => {
                          setRadiusKm(opt);
                          setShowRadiusModal(false);
                          if (myLocation) zoomToRadius(myLocation, opt);
                          // Query tự refetch vì args đổi
                        }}
                      >
                        <Text
                          style={[
                            styles.modalOptionText,
                            isActive
                              ? { color: "#FFF", fontWeight: "bold" }
                              : { color: dynamicStyles.textSub },
                          ]}
                        >
                          {opt} km
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <TouchableOpacity
                  style={styles.modalCloseBtn}
                  onPress={() => setShowRadiusModal(false)}
                >
                  <Text style={{ color: dynamicStyles.textSub, fontSize: 13 }}>
                    Đóng
                  </Text>
                </TouchableOpacity>
              </BlurView>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <TouchableOpacity
        style={[styles.recenterBtn, { backgroundColor: dynamicStyles.pillBg }]}
        onPress={handleRecenter}
        activeOpacity={0.8}
      >
        <MaterialCommunityIcons
          name="crosshairs-gps"
          size={24}
          color={NEON_BLUE}
        />
      </TouchableOpacity>

      {/* Bottom list */}
      <View style={styles.bottomListContainer}>
        {isExploreLoading && myLocation ? (
          <View style={{ paddingVertical: 16 }}>
            <ActivityIndicator color={THEME_COLOR} />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={radarItems}
            renderItem={renderCard}
            keyExtractor={(item) => `${item.type}-${String(item.id)}`}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={CARD_WIDTH + 12}
            decelerationRate="fast"
            contentContainerStyle={{
              paddingHorizontal: (width - CARD_WIDTH) / 2,
            }}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(
                e.nativeEvent.contentOffset.x / (CARD_WIDTH + 12)
              );
              if (radarItems[idx]) handleSelectItem(radarItems[idx], null);
            }}
            ListEmptyComponent={
              <View style={{ paddingVertical: 18, alignItems: "center" }}>
                <Text style={{ color: dynamicStyles.textSub, fontSize: 12 }}>
                  {myLocation
                    ? "Không có dữ liệu quanh bạn."
                    : "Bật định vị để quét quanh bạn."}
                </Text>
              </View>
            }
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerFill: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { marginTop: 10, fontSize: 14, fontWeight: "500" },

  map: { flex: 1 },

  permissionBanner: {
    marginTop: 8,
    marginHorizontal: 16,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  permissionBannerBtn: {
    backgroundColor: THEME_COLOR,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },

  markerContainerFixed: {
    alignItems: "center",
    justifyContent: "flex-end",
    minWidth: 100,
    minHeight: 100,
  },
  markerRoot: { alignItems: "center", justifyContent: "center" },
  markerRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    overflow: "hidden",
    backgroundColor: "#FFF",
  },
  markerImg: { width: "100%", height: "100%" },
  markerArrow: {
    width: 0,
    height: 0,
    backgroundColor: "transparent",
    borderStyle: "solid",
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderBottomWidth: 0,
    borderTopWidth: 9,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: THEME_COLOR,
    marginTop: 2,
  },

  bubbleContainer: { marginBottom: 8, alignItems: "center", zIndex: 100 },
  bubbleContent: {
    backgroundColor: "#FFF",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  bubbleEmoji: { fontSize: 14, marginRight: 4 },
  bubbleText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1F2937",
    maxWidth: 130,
  },
  bubbleArrow: {
    width: 0,
    height: 0,
    backgroundColor: "transparent",
    borderStyle: "solid",
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 6,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#FFF",
    marginTop: -1,
  },

  headerSafe: { position: "absolute", top: 0, left: 0, right: 0 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "android" ? 12 : 6,
    paddingBottom: 8,
  },
  roundBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 8,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  pillText: { fontSize: 13 },
  radiusBtn: {
    flexDirection: "row",
    alignItems: "center",
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: width * 0.8,
    padding: 20,
    borderRadius: 24,
    alignItems: "center",
    overflow: "hidden",
  },
  modalTitle: { fontSize: 16, fontWeight: "700", marginBottom: 16 },
  modalGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 12,
  },
  modalOption: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  modalOptionActive: { backgroundColor: THEME_COLOR, borderWidth: 0 },
  modalOptionText: { fontSize: 14, fontWeight: "500" },
  modalCloseBtn: { marginTop: 20, padding: 10 },

  recenterBtn: {
    position: "absolute",
    right: 16,
    bottom: 240,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
    zIndex: 10,
  },

  bottomListContainer: { position: "absolute", bottom: 30, width: "100%" },
  cardWrapper: { width: CARD_WIDTH, marginHorizontal: 6 },
  cardBlur: {
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  cardHeader: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  cardAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#CCC",
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "90%",
  },
  cardName: { fontSize: 16, fontWeight: "700", flexShrink: 1 },
  cardClub: { fontSize: 12, marginTop: 2 },
  ratingPill: {
    flexDirection: "row",
    backgroundColor: "#111",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    alignItems: "center",
  },
  ratingText: {
    color: "#FACC15",
    fontSize: 10,
    fontWeight: "bold",
    marginLeft: 2,
  },
  statsRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  scoreTrack: {
    width: "100%",
    height: 4,
    backgroundColor: "rgba(100,100,100,0.2)",
    borderRadius: 2,
  },
  scoreFill: { height: 4, backgroundColor: THEME_COLOR, borderRadius: 2 },
  intentBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 6,
  },
  intentText: { fontSize: 11, fontWeight: "500" },
  actionRow: { flexDirection: "row", gap: 8 },
  btnAction: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  btnTextPrimary: { fontWeight: "700", fontSize: 13, color: "#000" },
  btnTextSecondary: { fontWeight: "600", fontSize: 13 },

  radarContainer: {
    alignItems: "center",
    justifyContent: "center",
    width: 200,
    height: 200,
  },
  radarStaticCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: NEON_BLUE,
    borderWidth: 2,
    borderColor: "#FFF",
    zIndex: 10,
  },
  radarPulse: {
    position: "absolute",
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(14, 165, 233, 0.4)",
    borderColor: NEON_BLUE,
    borderWidth: 1,
  },
});
