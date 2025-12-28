// app/components/RankingChart.jsx
import React, {
  memo,
  useMemo,
  useRef,
  useState,
  useCallback,
  useEffect,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  InteractionManager,
  Platform,
} from "react-native";
import Svg, {
  Path,
  Line,
  Circle,
  Defs,
  LinearGradient,
  Stop,
} from "react-native-svg";
import { Image as ExpoImage } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { normalizeUrl } from "@/utils/normalizeUri";
import * as Haptics from "expo-haptics";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const PLACE = "https://dummyimage.com/100x100/cccccc/ffffff&text=?";

// --- Constants ---
const CHART_HEIGHT = 400;
const PADDING_TOP = 40;
const PADDING_BOTTOM = 40;
const PADDING_LEFT = 10;
const PADDING_RIGHT = 60;
const MIN_POINT_WIDTH = 40;
const MAX_POINT_WIDTH = 180;
const DEFAULT_POINT_WIDTH = 70;

const COLORS = {
  double: "#F6465D",
  single: "#F0B90B",
  verified: "#0ECB81",
  pending: "#F0B90B",
  unverified: "#9CA3AF",
  borderVerified: "#F0B90B",
  borderSelf: "#EF4444",
  borderNone: "#9CA3AF",
};

// --- Helpers ---
const createSmoothPath = (points) => {
  if (points.length < 2) return "";
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const midX = (p0.x + p1.x) / 2;
    path += ` C ${midX} ${p0.y}, ${midX} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  return path;
};

const createAreaPath = (points, bottomY) => {
  if (points.length < 2) return "";
  const linePath = createSmoothPath(points);
  const lastPoint = points[points.length - 1];
  const firstPoint = points[0];
  return `${linePath} L ${lastPoint.x} ${bottomY} L ${firstPoint.x} ${bottomY} Z`;
};

// --- Sub-components ---
const ChartAvatar = memo(
  ({ x, y, uri, cccdStatus, tierColor, size = 40, onPress, colors }) => {
    const containerStyle = useMemo(
      () => ({
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
      }),
      [x, y, size]
    );

    let borderColor = COLORS.borderNone;
    if (tierColor === "yellow") borderColor = COLORS.borderVerified;
    else if (tierColor === "red") borderColor = COLORS.borderSelf;

    let verifiedIcon = "alert-circle";
    let verifiedColor = COLORS.unverified;
    if (cccdStatus === "verified") {
      verifiedIcon = "checkmark-circle";
      verifiedColor = COLORS.verified;
    } else if (cccdStatus === "pending") {
      verifiedIcon = "time";
      verifiedColor = COLORS.pending;
    }

    const iconSize = size / 2.5;

    return (
      <TouchableOpacity
        style={[styles.avatarContainer, containerStyle]}
        onPress={onPress}
        activeOpacity={0.8}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <View
          style={[
            styles.avatarGlow,
            {
              width: size + 6,
              height: size + 6,
              borderRadius: (size + 6) / 2,
              backgroundColor: borderColor,
              opacity: 0.2,
              top: -3,
              left: -3,
            },
          ]}
        />
        <View
          style={[
            styles.avatarRing,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderColor: borderColor,
              borderWidth: 1.5,
              backgroundColor: colors.cardBg,
            },
          ]}
        >
          <ExpoImage
            source={normalizeUrl(uri) || PLACE}
            style={{
              width: size - 4,
              height: size - 4,
              borderRadius: (size - 4) / 2,
            }}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        </View>
        <View
          style={[
            styles.miniBadge,
            {
              backgroundColor: colors.cardBg,
              width: iconSize,
              height: iconSize,
              borderRadius: iconSize / 2,
              top: -2,
              right: -2,
            },
          ]}
        >
          <Ionicons name={verifiedIcon} size={iconSize} color={verifiedColor} />
        </View>
      </TouchableOpacity>
    );
  },
  (prev, next) =>
    prev.x === next.x &&
    prev.y === next.y &&
    prev.size === next.size &&
    prev.uri === next.uri &&
    prev.cccdStatus === next.cccdStatus &&
    prev.tierColor === next.tierColor
);

const SelectedUserCard = memo(
  ({ user, scoreDouble, scoreSingle, colors, onPress, onClose }) => {
    if (!user) return null;
    const isVerified = user?.cccdStatus === "verified";

    return (
      <View
        style={[
          styles.userCard,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            shadowColor: colors.shadow,
          },
        ]}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <View style={styles.bigAvatarContainer}>
              <ExpoImage
                source={normalizeUrl(user?.avatar) || PLACE}
                style={styles.bigAvatar}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
              {isVerified && (
                <View style={styles.bigVerifiedBadge}>
                  <Ionicons name="checkmark" size={10} color="#fff" />
                </View>
              )}
            </View>
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text
                style={[styles.cardName, { color: colors.text }]}
                numberOfLines={1}
              >
                {user?.nickname || "Vận động viên"}
              </Text>
              {user?.province && (
                <View style={styles.provinceRow}>
                  <Ionicons
                    name="location-sharp"
                    size={12}
                    color={colors.subText}
                    style={{ marginRight: 2 }}
                  />
                  <Text
                    style={[styles.cardProvince, { color: colors.subText }]}
                  >
                    {user.province}
                  </Text>
                </View>
              )}
            </View>
          </View>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={15}
            style={styles.closeBtn}
          >
            <Ionicons name="close" size={20} color={colors.subText} />
          </TouchableOpacity>
        </View>

        <View style={[styles.cardBody, { backgroundColor: colors.bg }]}>
          <View style={styles.statColumn}>
            <Text style={[styles.statLabel, { color: colors.subText }]}>
              TRÌNH ĐÔI
            </Text>
            <Text style={[styles.statValue, { color: COLORS.double }]}>
              {scoreDouble?.toFixed(3) || "---"}
            </Text>
          </View>
          <View
            style={[styles.verticalDivider, { backgroundColor: colors.border }]}
          />
          <View style={styles.statColumn}>
            <Text style={[styles.statLabel, { color: colors.subText }]}>
              TRÌNH ĐƠN
            </Text>
            <Text style={[styles.statValue, { color: COLORS.single }]}>
              {scoreSingle?.toFixed(3) || "---"}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.cardFooterBtn, { borderTopColor: colors.border }]}
          onPress={onPress}
          activeOpacity={0.7}
        >
          <Text style={[styles.cardActionText, { color: colors.text }]}>
            Xem hồ sơ chi tiết
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.text} />
        </TouchableOpacity>
      </View>
    );
  }
);

const YAxis = memo(
  ({ minScore, maxScore, height, paddingTop, paddingBottom, colors }) => {
    const labels = useMemo(() => {
      const steps = 4;
      const range = maxScore - minScore || 1;
      const effectiveHeight = height - paddingTop - paddingBottom;
      const result = [];

      for (let i = 0; i <= steps; i++) {
        const ratio = i / steps;
        const y = paddingTop + effectiveHeight * (1 - ratio);
        const value = minScore + range * ratio;
        result.push({ y, value });
      }
      return result;
    }, [minScore, maxScore, height, paddingTop, paddingBottom]);

    return (
      <View style={[styles.yAxisContainer, { height }]}>
        {labels.map((label, i) => (
          <Text
            key={`y-label-${i}`}
            style={[
              styles.yAxisLabel,
              { color: colors.gridText, top: label.y - 6 },
            ]}
          >
            {label.value.toFixed(2)}
          </Text>
        ))}
      </View>
    );
  }
);

// Memoized SVG Chart - tách riêng để không re-render khi scroll
const ChartSVG = memo(
  ({
    doublePoints,
    singlePoints,
    chartWidth,
    showDouble,
    showSingle,
    colors,
  }) => {
    const bottomY = CHART_HEIGHT - PADDING_BOTTOM;

    const doublePath = useMemo(
      () =>
        showDouble && doublePoints.length > 1
          ? createSmoothPath(doublePoints)
          : "",
      [showDouble, doublePoints]
    );

    const doubleAreaPath = useMemo(
      () =>
        showDouble && doublePoints.length > 1
          ? createAreaPath(doublePoints, bottomY)
          : "",
      [showDouble, doublePoints, bottomY]
    );

    const singlePath = useMemo(
      () =>
        showSingle && singlePoints.length > 1
          ? createSmoothPath(singlePoints)
          : "",
      [showSingle, singlePoints]
    );

    const singleAreaPath = useMemo(
      () =>
        showSingle && singlePoints.length > 1
          ? createAreaPath(singlePoints, bottomY)
          : "",
      [showSingle, singlePoints, bottomY]
    );

    return (
      <Svg width={chartWidth} height={CHART_HEIGHT + 20}>
        <Defs>
          <LinearGradient id="gradDouble" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor={COLORS.double} stopOpacity={0.25} />
            <Stop offset="100%" stopColor={COLORS.double} stopOpacity={0.02} />
          </LinearGradient>
          <LinearGradient id="gradSingle" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor={COLORS.single} stopOpacity={0.25} />
            <Stop offset="100%" stopColor={COLORS.single} stopOpacity={0.02} />
          </LinearGradient>
        </Defs>

        {/* Base line */}
        <Line
          x1={PADDING_LEFT}
          y1={bottomY}
          x2={chartWidth}
          y2={bottomY}
          stroke={colors.grid}
          strokeWidth={1}
        />

        {/* Single Chart */}
        {showSingle && singlePoints.length > 1 && (
          <>
            <Path d={singleAreaPath} fill="url(#gradSingle)" />
            <Path
              d={singlePath}
              stroke={COLORS.single}
              strokeWidth={3}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {singlePoints.map((p, i) => (
              <Circle
                key={`sdot-${i}`}
                cx={p.x}
                cy={p.y}
                r={3}
                fill={COLORS.single}
                stroke={colors.cardBg}
                strokeWidth={1}
              />
            ))}
          </>
        )}

        {/* Double Chart */}
        {showDouble && doublePoints.length > 1 && (
          <>
            <Path d={doubleAreaPath} fill="url(#gradDouble)" />
            <Path
              d={doublePath}
              stroke={colors.lineGlow}
              strokeWidth={6}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Path
              d={doublePath}
              stroke={COLORS.double}
              strokeWidth={2.5}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Line
              x1={doublePoints[doublePoints.length - 1].x}
              y1={doublePoints[doublePoints.length - 1].y}
              x2={chartWidth}
              y2={doublePoints[doublePoints.length - 1].y}
              stroke={colors.grid}
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          </>
        )}
      </Svg>
    );
  }
);

// --- MAIN CHART ---
const RankingChart = memo(
  ({
    rankings = [],
    theme,
    onUserPress,
    onLoadMore,
    hasMore = true,
    isLoadingMore = false,
  }) => {
    const scrollRef = useRef(null);
    const [selectedUser, setSelectedUser] = useState(null);
    const [pointWidth, setPointWidth] = useState(DEFAULT_POINT_WIDTH);
    const [scrollEnabled, setScrollEnabled] = useState(true);
    const [showDouble, setShowDouble] = useState(true);
    const [showSingle, setShowSingle] = useState(false);

    // Scroll state - dùng ref để không trigger re-render
    const scrollXRef = useRef(0);
    const viewportWidthRef = useRef(SCREEN_WIDTH - 60);
    const [avatarRenderKey, setAvatarRenderKey] = useState(0);

    // Debounced Y-axis range
    const [yAxisRange, setYAxisRange] = useState({ minScore: 0, maxScore: 10 });
    const yAxisDebounceRef = useRef(null);

    // Refs for pinch zoom
    const savedPointWidth = useRef(DEFAULT_POINT_WIDTH);
    const lastDistance = useRef(0);
    const loadMoreTriggered = useRef(false);

    // --- Colors ---
    const colors = useMemo(() => {
      const isDark = theme?.isDark ?? true;
      return {
        line: COLORS.double,
        lineGlow: "rgba(246, 70, 93, 0.3)",
        singleLine: COLORS.single,
        grid: isDark ? "rgba(132, 142, 156, 0.2)" : "rgba(107, 114, 128, 0.15)",
        gridText: isDark ? "#848E9C" : "#6B7280",
        bg: isDark ? "#0B0E11" : "#F8FAFC",
        cardBg: isDark ? "#1E2329" : "#FFFFFF",
        card: isDark ? "#181a20" : "#FFFFFF",
        text: isDark ? "#FFFFFF" : "#1A1D1E",
        subText: isDark ? "#848E9C" : "#6B7280",
        border: isDark ? "#262932" : "#E5E7EB",
        shadow: isDark ? "#000" : "#ccc",
      };
    }, [theme?.isDark]);

    // --- GLOBAL Range (cố định, không đổi khi scroll) ---
    const globalRange = useMemo(() => {
      if (!rankings.length) return { minScore: 0, maxScore: 10 };

      const scores = [];
      rankings.forEach((r) => {
        if (showDouble) {
          const val = Number(r.double);
          if (!isNaN(val) && val > 0) scores.push(val);
        }
        if (showSingle) {
          const val = Number(r.single);
          if (!isNaN(val) && val > 0) scores.push(val);
        }
      });

      if (!scores.length) return { minScore: 0, maxScore: 10 };

      const minVal = Math.min(...scores);
      const maxVal = Math.max(...scores);
      const padding = (maxVal - minVal) * 0.1 || 0.5;

      return {
        minScore: Math.max(0, minVal - padding),
        maxScore: maxVal + padding,
      };
    }, [rankings, showDouble, showSingle]);

    // --- Chart Data (dùng global range - không đổi khi scroll) ---
    const chartData = useMemo(() => {
      if (!rankings.length) {
        return { doublePoints: [], singlePoints: [], chartWidth: 0 };
      }

      const { minScore, maxScore } = globalRange;
      const range = maxScore - minScore || 1;
      const effectiveHeight = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

      const doublePoints = [];
      const singlePoints = [];

      rankings.forEach((item, index) => {
        const x = PADDING_LEFT + index * pointWidth;

        // Double
        const dScore = Number(item.double) || 0;
        const dNorm = (dScore - minScore) / range;
        const dY = PADDING_TOP + effectiveHeight - dNorm * effectiveHeight;
        doublePoints.push({
          x,
          y: dY,
          score: dScore,
          user: item.user,
          cccdStatus: item.user?.cccdStatus,
          tierColor: item.tierColor,
        });

        // Single
        const sScore = Number(item.single) || 0;
        const sNorm = (sScore - minScore) / range;
        const sY = PADDING_TOP + effectiveHeight - sNorm * effectiveHeight;
        singlePoints.push({ x, y: sY, score: sScore });
      });

      const chartWidth =
        PADDING_LEFT +
        PADDING_RIGHT +
        Math.max(0, rankings.length - 1) * pointWidth;

      return { doublePoints, singlePoints, chartWidth };
    }, [rankings, pointWidth, globalRange]);

    // --- Update Y-axis range with debounce (chỉ khi scroll dừng) ---
    const updateYAxisRange = useCallback(
      (scrollX, viewportWidth) => {
        if (yAxisDebounceRef.current) {
          clearTimeout(yAxisDebounceRef.current);
        }

        yAxisDebounceRef.current = setTimeout(() => {
          const buffer = pointWidth * 2;
          const startIndex = Math.max(
            0,
            Math.floor((scrollX - buffer - PADDING_LEFT) / pointWidth)
          );
          const endIndex = Math.min(
            rankings.length - 1,
            Math.ceil(
              (scrollX + viewportWidth + buffer - PADDING_LEFT) / pointWidth
            )
          );

          if (startIndex > endIndex || !rankings.length) return;

          const visibleScores = [];
          for (let i = startIndex; i <= endIndex; i++) {
            const r = rankings[i];
            if (!r) continue;
            if (showDouble) {
              const val = Number(r.double);
              if (!isNaN(val) && val > 0) visibleScores.push(val);
            }
            if (showSingle) {
              const val = Number(r.single);
              if (!isNaN(val) && val > 0) visibleScores.push(val);
            }
          }

          if (visibleScores.length) {
            const minVal = Math.min(...visibleScores);
            const maxVal = Math.max(...visibleScores);
            const padding = (maxVal - minVal) * 0.15 || 0.5;

            setYAxisRange({
              minScore: Math.max(0, minVal - padding),
              maxScore: maxVal + padding,
            });
          }
        }, 200); // Debounce 200ms - chỉ update khi dừng scroll
      },
      [pointWidth, rankings, showDouble, showSingle]
    );

    // Initialize Y-axis range
    useEffect(() => {
      setYAxisRange(globalRange);
    }, [globalRange]);

    // Cleanup debounce
    useEffect(() => {
      return () => {
        if (yAxisDebounceRef.current) {
          clearTimeout(yAxisDebounceRef.current);
        }
      };
    }, []);

    // --- Điểm cao nhất (header) ---
    const highestUserScore = useMemo(() => {
      if (!rankings.length) return 0;

      if (showDouble) {
        const vals = rankings.map((r) => Number(r.double ?? 0));
        return Math.max(...vals);
      }
      if (showSingle) {
        const vals = rankings.map((r) => Number(r.single ?? 0));
        return Math.max(...vals);
      }
      return 0;
    }, [rankings, showDouble, showSingle]);

    // --- Handlers ---
    const handleScroll = useCallback(
      (event) => {
        const { contentOffset, contentSize, layoutMeasurement } =
          event.nativeEvent;
        const currentScrollX = contentOffset.x;

        // Update refs (không trigger re-render)
        scrollXRef.current = currentScrollX;
        viewportWidthRef.current = layoutMeasurement.width;

        // Load more check
        const scrollPercent =
          (currentScrollX + layoutMeasurement.width) / contentSize.width;

        if (
          scrollPercent >= 0.75 &&
          hasMore &&
          !isLoadingMore &&
          scrollEnabled
        ) {
          if (!loadMoreTriggered.current) {
            loadMoreTriggered.current = true;
            InteractionManager.runAfterInteractions(() => {
              onLoadMore?.();
              setTimeout(() => {
                loadMoreTriggered.current = false;
              }, 500);
            });
          }
        }
      },
      [hasMore, isLoadingMore, onLoadMore, scrollEnabled]
    );

    // Update khi scroll dừng
    const handleScrollEnd = useCallback(() => {
      // Update avatars
      setAvatarRenderKey((k) => k + 1);
      // Update Y-axis range
      updateYAxisRange(scrollXRef.current, viewportWidthRef.current);
    }, [updateYAxisRange]);

    const handleTouchStart = useCallback(
      (e) => {
        if (e.nativeEvent.touches.length === 2) {
          setScrollEnabled(false);
          const touch1 = e.nativeEvent.touches[0];
          const touch2 = e.nativeEvent.touches[1];
          const distance = Math.sqrt(
            Math.pow(touch2.pageX - touch1.pageX, 2) +
              Math.pow(touch2.pageY - touch1.pageY, 2)
          );
          lastDistance.current = distance;
          savedPointWidth.current = pointWidth;
        }
      },
      [pointWidth]
    );

    const handleTouchMove = useCallback(
      (e) => {
        if (e.nativeEvent.touches.length === 2 && lastDistance.current > 0) {
          const touch1 = e.nativeEvent.touches[0];
          const touch2 = e.nativeEvent.touches[1];
          const distance = Math.sqrt(
            Math.pow(touch2.pageX - touch1.pageX, 2) +
              Math.pow(touch2.pageY - touch1.pageY, 2)
          );

          const scale = distance / lastDistance.current;
          const newWidth = savedPointWidth.current * scale;
          const clampedWidth = Math.min(
            MAX_POINT_WIDTH,
            Math.max(MIN_POINT_WIDTH, newWidth)
          );

          if (Math.abs(clampedWidth - pointWidth) > 3) {
            setPointWidth(clampedWidth);
          }
        }
      },
      [pointWidth]
    );

    const handleTouchEnd = useCallback(() => {
      if (!scrollEnabled && lastDistance.current > 0) {
        setScrollEnabled(true);
        lastDistance.current = 0;
      }
    }, [scrollEnabled]);

    const handleAvatarPress = useCallback(
      (point, idx) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const singleP = chartData.singlePoints[idx];
        setSelectedUser({
          ...point,
          scoreDouble: point.score,
          scoreSingle: singleP?.score,
        });
      },
      [chartData.singlePoints]
    );

    const handleCardPress = useCallback(() => {
      if (selectedUser?.user?._id) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onUserPress?.(selectedUser.user);
      }
    }, [selectedUser, onUserPress]);

    const handleCloseUser = useCallback(() => setSelectedUser(null), []);

    const avatarSize = useMemo(() => {
      if (pointWidth < 50) return 24;
      if (pointWidth < 80) return 32;
      return 40;
    }, [pointWidth]);

    // --- Render Avatars (Virtualized) ---
    const visibleAvatars = useMemo(() => {
      if (!showDouble) return null;

      const scrollX = scrollXRef.current;
      const viewportWidth = viewportWidthRef.current;
      const buffer = 150;
      const minX = scrollX - buffer;
      const maxX = scrollX + viewportWidth + buffer;

      return chartData.doublePoints
        .map((point, i) => {
          if (point.x < minX || point.x > maxX) return null;

          return (
            <ChartAvatar
              key={`avatar-${point.user?._id || i}`}
              x={point.x}
              y={point.y}
              uri={point.user?.avatar}
              cccdStatus={point.cccdStatus}
              tierColor={point.tierColor}
              size={avatarSize}
              onPress={() => handleAvatarPress(point, i)}
              colors={colors}
            />
          );
        })
        .filter(Boolean);
    }, [
      showDouble,
      chartData.doublePoints,
      avatarSize,
      handleAvatarPress,
      colors,
      avatarRenderKey,
    ]);

    // --- Empty State ---
    if (!rankings.length) {
      return (
        <View style={[styles.emptyContainer, { backgroundColor: colors.card }]}>
          <Ionicons name="analytics-outline" size={48} color={colors.subText} />
          <Text style={[styles.emptyText, { color: colors.subText }]}>
            Không có dữ liệu
          </Text>
        </View>
      );
    }

    return (
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.container, { backgroundColor: colors.bg }]}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={[styles.headerValue, { color: colors.text }]}>
                {highestUserScore.toFixed(3)}
              </Text>
              <Text style={[styles.headerLabel, { color: colors.subText }]}>
                Điểm cao nhất
              </Text>
            </View>

            <View style={styles.headerRight}>
              <TouchableOpacity
                style={[
                  styles.toggleBadge,
                  {
                    backgroundColor: showDouble ? COLORS.double : colors.cardBg,
                    borderColor: COLORS.double,
                  },
                ]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setShowDouble(!showDouble);
                }}
              >
                <Text
                  style={[
                    styles.toggleText,
                    { color: showDouble ? "#fff" : COLORS.double },
                  ]}
                >
                  Đôi
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.toggleBadge,
                  {
                    backgroundColor: showSingle ? COLORS.single : colors.cardBg,
                    borderColor: COLORS.single,
                  },
                ]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setShowSingle(!showSingle);
                }}
              >
                <Text
                  style={[
                    styles.toggleText,
                    { color: showSingle ? "#fff" : COLORS.single },
                  ]}
                >
                  Đơn
                </Text>
              </TouchableOpacity>

              <View
                style={[
                  styles.zoomIndicator,
                  { backgroundColor: colors.cardBg },
                ]}
              >
                <Ionicons
                  name="expand-outline"
                  size={14}
                  color={colors.subText}
                />
                <Text style={[styles.zoomText, { color: colors.subText }]}>
                  {Math.round((pointWidth / DEFAULT_POINT_WIDTH) * 100)}%
                </Text>
              </View>
            </View>
          </View>

          {/* Chart Area */}
          <View style={[styles.chartRow, { height: CHART_HEIGHT + 20 }]}>
            <YAxis
              minScore={yAxisRange.minScore}
              maxScore={yAxisRange.maxScore}
              height={CHART_HEIGHT}
              paddingTop={PADDING_TOP}
              paddingBottom={PADDING_BOTTOM}
              colors={colors}
            />

            <View style={styles.chartScrollContainer}>
              <ScrollView
                ref={scrollRef}
                horizontal
                scrollEnabled={scrollEnabled}
                showsHorizontalScrollIndicator={false}
                onScroll={handleScroll}
                onMomentumScrollEnd={handleScrollEnd}
                onScrollEndDrag={handleScrollEnd}
                scrollEventThrottle={64}
                contentContainerStyle={{ width: chartData.chartWidth }}
                bounces={true}
                overScrollMode="always"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                removeClippedSubviews={Platform.OS === "android"}
              >
                <View
                  style={{
                    width: chartData.chartWidth,
                    height: CHART_HEIGHT + 20,
                  }}
                >
                  <ChartSVG
                    doublePoints={chartData.doublePoints}
                    singlePoints={chartData.singlePoints}
                    chartWidth={chartData.chartWidth}
                    showDouble={showDouble}
                    showSingle={showSingle}
                    colors={colors}
                  />
                  {visibleAvatars}
                </View>

                {isLoadingMore && (
                  <View
                    style={[
                      styles.loadingMore,
                      { left: chartData.chartWidth - 40 },
                    ]}
                  >
                    <ActivityIndicator size="small" color={colors.line} />
                  </View>
                )}
              </ScrollView>
            </View>
          </View>

          {/* Legend */}
          <View style={[styles.legend, { borderTopColor: colors.border }]}>
            <View style={styles.legendItem}>
              <View
                style={[
                  styles.legendDot,
                  { backgroundColor: COLORS.borderVerified },
                ]}
              />
              <Text style={[styles.legendText, { color: colors.subText }]}>
                Điểm xác thực
              </Text>
            </View>
            <View style={styles.legendItem}>
              <View
                style={[
                  styles.legendDot,
                  { backgroundColor: COLORS.borderSelf },
                ]}
              />
              <Text style={[styles.legendText, { color: colors.subText }]}>
                Tự chấm
              </Text>
            </View>
            <View style={styles.legendItem}>
              <View
                style={[
                  styles.legendDot,
                  { backgroundColor: COLORS.borderNone },
                ]}
              />
              <Text style={[styles.legendText, { color: colors.subText }]}>
                Chưa có điểm
              </Text>
            </View>
          </View>

          {/* Selected User Card */}
          <SelectedUserCard
            user={selectedUser?.user}
            scoreDouble={selectedUser?.scoreDouble}
            scoreSingle={selectedUser?.scoreSingle}
            colors={colors}
            onPress={handleCardPress}
            onClose={handleCloseUser}
          />

          {/* Hints */}
          {!selectedUser && (
            <Text style={[styles.hintText, { color: colors.subText }]}>
              Chạm avatar xem chi tiết • Vuốt trái xem thêm • Chụm để Zoom
            </Text>
          )}

          <Text style={[styles.debugText, { color: colors.subText }]}>
            {rankings.length} người •{" "}
            {hasMore ? "Kéo để tải thêm" : "Hết danh sách"}
          </Text>
        </View>
      </ScrollView>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: 16,
    paddingTop: 16,
    paddingBottom: 60,
    marginBottom: 16,
  },
  emptyContainer: {
    height: 200,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 16,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: "500",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  headerValue: {
    fontSize: 28,
    fontWeight: "800",
  },
  headerLabel: {
    fontSize: 12,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  zoomIndicator: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  zoomText: {
    fontSize: 12,
    fontWeight: "600",
  },
  toggleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  toggleText: {
    fontSize: 11,
    fontWeight: "700",
  },
  chartRow: {
    flexDirection: "row",
  },
  yAxisContainer: {
    width: 45,
    position: "relative",
    zIndex: 10,
  },
  yAxisLabel: {
    position: "absolute",
    right: 6,
    fontSize: 10,
    fontWeight: "500",
    textAlign: "right",
  },
  chartScrollContainer: {
    flex: 1,
  },
  avatarContainer: {
    position: "absolute",
    zIndex: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarGlow: {
    position: "absolute",
  },
  avatarRing: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  miniBadge: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  legend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    marginTop: 12,
    paddingTop: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    flexWrap: "wrap",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  legendText: {
    fontSize: 11,
    fontWeight: "500",
  },
  loadingMore: {
    position: "absolute",
    top: "50%",
    width: 40,
    height: 40,
    marginTop: -20,
    justifyContent: "center",
    alignItems: "center",
  },
  hintText: {
    fontSize: 11,
    textAlign: "center",
    marginTop: 8,
    paddingHorizontal: 16,
    fontStyle: "italic",
    opacity: 0.8,
  },
  debugText: {
    fontSize: 10,
    textAlign: "center",
    marginTop: 4,
    opacity: 0.5,
  },
  userCard: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 16,
    paddingBottom: 12,
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  bigAvatarContainer: {
    position: "relative",
  },
  bigAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
  },
  bigVerifiedBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: COLORS.verified,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  cardName: {
    fontSize: 17,
    fontWeight: "800",
  },
  provinceRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  cardProvince: {
    fontSize: 13,
    fontWeight: "500",
  },
  closeBtn: {
    padding: 4,
  },
  cardBody: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "space-evenly",
  },
  statColumn: {
    alignItems: "center",
    flex: 1,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 4,
    opacity: 0.7,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "900",
  },
  verticalDivider: {
    width: 1,
    height: "60%",
    opacity: 0.2,
  },
  cardFooterBtn: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  cardActionText: {
    fontSize: 13,
    fontWeight: "600",
  },
});

export default RankingChart;
