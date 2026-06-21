// app/(tabs)/user-stats.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  useColorScheme,
  Pressable,
  Platform,
  LayoutAnimation,
  UIManager,
  SafeAreaView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSelector } from "react-redux";
import dayjs from "dayjs";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Svg, {
  Circle,
  Polygon,
  Text as SvgText,
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  G,
} from "react-native-svg";
import { LineChart, PieChart, BarChart } from "react-native-gifted-charts";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Stack, router } from "expo-router";

import {
  useGetUserOverviewQuery,
  useGetUserSeriesQuery,
  useGetUserBreakdownQuery,
  useGetUserTopQuery,
  useGetUserProfileExQuery,
} from "@/slices/userStatsApiSlice";
import AuthGuard from "@/components/auth/AuthGuard";
import AppleLiquidGlassView from "@/components/ui/AppleLiquidGlassView";
import { IOS_26_LIQUID_GLASS_ENABLED } from "@/utils/nativeTabs";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/* =================== CONFIG & THEME =================== */
const tz = "Asia/Bangkok";
const W = Dimensions.get("window").width;
const PADX = 16;
const ACCENT = "#6366f1";

const fmt = (n?: number) =>
  typeof n === "number" ? n.toLocaleString("vi-VN") : "0";

const safeArr = <T,>(arr: T[] | undefined | null, fallback: T[]): T[] =>
  Array.isArray(arr) && arr.length ? arr : fallback;

function useThemeColors() {
  const scheme = useColorScheme() ?? "light";
  const isDark = scheme === "dark";
  return {
    isDark,
    bg: isDark ? "#0f1115" : "#F5F7FA",
    bgGradient: isDark
      ? ["#0f1115", "#181a20", "#0f1115"]
      : ["#F5F7FA", "#FFFFFF", "#F5F7FA"],
    text: isDark ? "#f8fafc" : "#0f172a",
    subText: isDark ? "#848E9C" : "#6B7280",
    cardBg: isDark ? "rgba(24,26,32,0.72)" : "rgba(255,255,255,0.74)",
    cardBorder: isDark ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.72)",
    cardGradient: isDark
      ? ["rgba(255,255,255,0.08)", "rgba(255,255,255,0.01)"]
      : ["rgba(255,255,255,0.82)", "rgba(255,255,255,0.18)"],
    blurTint: (isDark ? "dark" : "light") as "dark" | "light" | "default",
    chartGrid: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)",
    chartText: isDark ? "#94a3b8" : "#64748b",
    iconBg: isDark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.68)",
    kpiBg: isDark ? "rgba(32,35,43,0.62)" : "rgba(255,255,255,0.7)",
    segmentBg: isDark ? "rgba(24,26,32,0.72)" : "rgba(255,255,255,0.74)",
    tooltipBg: isDark ? "#181a20" : "#ffffff",
  };
}

const statsGlassScheme = (theme: any) => (theme.isDark ? "dark" : "light");
const statsGlassSurfaceTint = (theme: any, light = 0.58, dark = 0.54) =>
  theme.isDark
    ? `rgba(24,26,32,${dark})`
    : `rgba(255,255,255,${light})`;
const statsGlassAccentTint = (alpha = 0.26) =>
  `rgba(99,102,241,${alpha})`;

function StatsLiquidBackdrop({ theme }: any) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!IOS_26_LIQUID_GLASS_ENABLED) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 2600,
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: 2600,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  if (!IOS_26_LIQUID_GLASS_ENABLED) return null;

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-10, 16],
  });
  const opacity = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.28, 0.48],
  });

  return (
    <View pointerEvents="none" style={styles.ambientBackdrop}>
      <Animated.View
        style={[
          styles.ambientBand,
          {
            backgroundColor: theme.isDark
              ? "rgba(59,130,246,0.18)"
              : "rgba(37,99,235,0.14)",
            opacity,
            transform: [{ translateY }, { rotate: "-8deg" }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.ambientBand,
          styles.ambientBandAlt,
          {
            backgroundColor: theme.isDark
              ? "rgba(245,158,11,0.12)"
              : "rgba(245,158,11,0.1)",
            opacity,
            transform: [{ translateY }, { rotate: "7deg" }],
          },
        ]}
      />
    </View>
  );
}

/* =================== COMPONENTS =================== */

const ScaleBtn = ({ onPress, style, children, disabled }: any) => {
  return (
    <Pressable
      onPress={(e) => {
        if (!disabled) {
          Haptics.selectionAsync();
          onPress && onPress(e);
        }
      }}
      disabled={disabled}
    >
      <View style={style}>{children}</View>
    </Pressable>
  );
};

const IconButton = ({ icon, onPress, theme }: any) => (
  <ScaleBtn
    onPress={onPress}
    style={{
      width: 40,
      height: 40,
      borderRadius: 20,
    }}
  >
    <AppleLiquidGlassView
      fallback="view"
      glassColorScheme={statsGlassScheme(theme)}
      glassEffectStyle="clear"
      glassTintColor={statsGlassSurfaceTint(theme, 0.58, 0.48)}
      isInteractive
      style={[
        styles.iconButtonGlass,
        { backgroundColor: theme.iconBg, borderColor: theme.cardBorder },
        IOS_26_LIQUID_GLASS_ENABLED && styles.glassControl,
      ]}
    >
      <Ionicons name={icon} size={20} color={theme.text} />
    </AppleLiquidGlassView>
  </ScaleBtn>
);

const EmptyChart = ({ theme }: any) => (
  <View style={{ height: 180, alignItems: "center", justifyContent: "center" }}>
    <MaterialCommunityIcons
      name="chart-timeline-variant"
      size={40}
      color={theme.subText}
      style={{ opacity: 0.3 }}
    />
    <Text
      style={{ color: theme.subText, fontSize: 12, marginTop: 8, opacity: 0.7 }}
    >
      Chưa có dữ liệu
    </Text>
  </View>
);

function GlassCard({
  title,
  subtitle,
  children,
  icon,
  theme,
  rightAction,
  style,
}: any) {
  return (
    <AppleLiquidGlassView
      fallback="blur"
      intensity={theme.isDark ? 24 : 42}
      tint={theme.blurTint}
      glassColorScheme={statsGlassScheme(theme)}
      glassEffectStyle="regular"
      glassTintColor={statsGlassSurfaceTint(theme, 0.62, 0.52)}
      isInteractive
      style={[
        styles.cardContainer,
        { borderColor: theme.cardBorder, backgroundColor: theme.cardBg },
        IOS_26_LIQUID_GLASS_ENABLED && styles.liquidCard,
        style,
      ]}
    >
      <LinearGradient
        colors={theme.cardGradient}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.cardHeader}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {icon && (
            <View style={styles.iconBox}>
              <Ionicons name={icon} size={18} color={ACCENT} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>
              {title}
            </Text>
            {!!subtitle && (
              <Text style={[styles.cardSub, { color: theme.subText }]}>
                {subtitle}
              </Text>
            )}
          </View>
          {rightAction}
        </View>
      </View>
      <View style={styles.cardBody}>{children}</View>
    </AppleLiquidGlassView>
  );
}

function KPI({ label, value, color, theme }: any) {
  return (
    <AppleLiquidGlassView
      fallback="blur"
      intensity={theme.isDark ? 18 : 34}
      tint={theme.blurTint}
      glassColorScheme={statsGlassScheme(theme)}
      glassEffectStyle="clear"
      glassTintColor={statsGlassSurfaceTint(theme, 0.48, 0.38)}
      isInteractive
      style={[
        styles.kpiBox,
        { backgroundColor: theme.kpiBg, borderColor: theme.cardBorder },
        IOS_26_LIQUID_GLASS_ENABLED && styles.innerGlass,
      ]}
    >
      <Text
        style={[styles.kpiValue, { color: color || theme.text }]}
        numberOfLines={1}
      >
        {value}
      </Text>
      <Text style={[styles.kpiLabel, { color: theme.subText }]}>{label}</Text>
    </AppleLiquidGlassView>
  );
}

/* =================== CHARTS (NO ZOOM) =================== */

const SimpleLineChart = ({ data, theme }: any) => {
  const contentWidth = Math.max(W - PADX * 4, data.length * 50);

  return (
    <View style={{ height: 240 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <LineChart
          areaChart
          curved
          data={data}
          height={200}
          width={contentWidth}
          spacing={50}
          initialSpacing={20}
          color1={ACCENT}
          startFillColor1={ACCENT}
          endFillColor1={
            theme.isDark
              ? "rgba(99, 102, 241, 0.05)"
              : "rgba(99, 102, 241, 0.1)"
          }
          startOpacity1={0.5}
          endOpacity1={0.1}
          noOfSections={4}
          yAxisTextStyle={{ color: theme.chartText, fontSize: 10 }}
          xAxisLabelTextStyle={{ color: theme.chartText, fontSize: 10 }}
          rulesColor={theme.chartGrid}
          hideDataPoints={false}
          dataPointsColor1={theme.isDark ? "#fff" : ACCENT}
          thickness1={3}
          paddingBottom={20}
          paddingTop={40}
          pointerConfig={{
            pointerStripHeight: 180,
            pointerStripColor: theme.subText,
            pointerStripWidth: 2,
            pointerColor: theme.subText,
            radius: 6,
            pointerLabelWidth: 100,
            pointerLabelHeight: 90,
            activatePointersOnLongPress: false,
            autoAdjustPointerLabelPosition: true,
            pointerLabelComponent: (items: any) => {
              const item = items[0];
              return (
                <View
                  style={{
                    height: 90,
                    width: 100,
                    justifyContent: "center",
                    marginTop: -40,
                    marginLeft: -40,
                  }}
                >
                  <View
                    style={{
                      padding: 8,
                      borderRadius: 8,
                      backgroundColor: theme.tooltipBg,
                      shadowColor: "#000",
                      shadowOpacity: 0.2,
                      shadowRadius: 4,
                      elevation: 5,
                      borderWidth: 1,
                      borderColor: theme.cardBorder,
                    }}
                  >
                    <Text
                      style={{
                        color: theme.subText,
                        fontSize: 10,
                        marginBottom: 2,
                      }}
                    >
                      {dayjs(item.dateFull).format("DD/MM")}
                    </Text>
                    <Text
                      style={{
                        color: theme.text,
                        fontSize: 14,
                        fontWeight: "bold",
                      }}
                    >
                      {item.value} trận
                    </Text>
                    {item.wins !== undefined && (
                      <Text
                        style={{
                          color: "#10b981",
                          fontSize: 11,
                          fontWeight: "600",
                        }}
                      >
                        Thắng: {item.wins}
                      </Text>
                    )}
                  </View>
                </View>
              );
            },
          }}
        />
      </ScrollView>
    </View>
  );
};

/* =================== INTERACTIVE RADAR =================== */

function InteractiveRadar({ single = 0, double = 0, mix = 0, theme }: any) {
  const size = 300;
  const cx = 150;
  const cy = 150;
  const maxV = Math.max(8, single, double, mix) || 8;
  const R = 110;

  const [selected, setSelected] = useState<{
    label: string;
    val: number;
  } | null>(null);

  const toPoint = (val: number, idx: number) => {
    const r = (val / maxV) * R;
    const angle = -Math.PI / 2 + idx * ((2 * Math.PI) / 3);
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  };

  const pts = [single, double, mix].map((v, i) => toPoint(v, i));
  const polyPoints = pts.map((p) => `${p.x},${p.y}`).join(" ");
  const LABELS = ["Đơn", "Đôi", "Mix"];
  const RAW_VALS = [single, double, mix];

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        minHeight: 150,
      }}
    >
      <Svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <SvgLinearGradient id="radarGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={ACCENT} stopOpacity="0.6" />
            <Stop offset="1" stopColor={ACCENT} stopOpacity="0.1" />
          </SvgLinearGradient>
        </Defs>

        {[0.3, 0.6, 1].map((k, i) => {
          const gridPts = [0, 1, 2]
            .map((idx) => toPoint(maxV * k, idx))
            .map((p) => `${p.x},${p.y}`)
            .join(" ");
          return (
            <Polygon
              key={i}
              points={gridPts}
              fill="none"
              stroke={theme.chartGrid}
              strokeWidth={1}
              strokeDasharray="4,4"
            />
          );
        })}

        <Polygon
          points={polyPoints}
          fill="url(#radarGrad)"
          stroke={ACCENT}
          strokeWidth={2}
        />

        {pts.map((p, i) => (
          <G
            key={`grp-${i}`}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSelected({ label: LABELS[i], val: RAW_VALS[i] });
              setTimeout(() => setSelected(null), 2000);
            }}
          >
            <Circle cx={p.x} cy={p.y} r={25} fill="transparent" />
            <Circle
              cx={p.x}
              cy={p.y}
              r={5}
              fill={theme.isDark ? "#fff" : "#fff"}
              stroke={ACCENT}
              strokeWidth={2}
            />
          </G>
        ))}

        {LABELS.map((t, i) => {
          const labelR = R + 25;
          const angle = -Math.PI / 2 + i * ((2 * Math.PI) / 3);
          const lx = cx + labelR * Math.cos(angle);
          const ly = cy + labelR * Math.sin(angle);
          const yAdj = i === 0 ? 0 : 5;
          return (
            <SvgText
              key={`lbl-${i}`}
              x={lx}
              y={ly + yAdj}
              fill={theme.subText}
              fontSize="14"
              fontWeight="bold"
              textAnchor="middle"
            >
              {t}
            </SvgText>
          );
        })}
      </Svg>

      {selected && (
        <View style={styles.radarTooltip} pointerEvents="none">
          <AppleLiquidGlassView
            intensity={90}
            tint={theme.isDark ? "dark" : "light"}
            style={StyleSheet.absoluteFill}
          />
          <View style={{ padding: 6, alignItems: "center" }}>
            <Text
              style={{
                color: theme.subText,
                fontSize: 10,
                textTransform: "uppercase",
              }}
            >
              {selected.label}
            </Text>
            <Text style={{ color: ACCENT, fontSize: 18, fontWeight: "900" }}>
              {selected.val.toFixed(1)}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

/* =================== INTERACTIVE DONUT =================== */

function InteractiveDonut({ data, centerTitle, theme }: any) {
  const [hiddenKeys, setHiddenKeys] = useState<string[]>([]);
  if (!data || data.length === 0) return <EmptyChart theme={theme} />;

  const activeData = data.filter(
    (item: any) => !hiddenKeys.includes(item.text)
  );
  const total = activeData.reduce((acc: any, cur: any) => acc + cur.value, 0);

  const toggleSlice = (key: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (hiddenKeys.includes(key)) {
      setHiddenKeys((prev) => prev.filter((k) => k !== key));
    } else {
      if (activeData.length === 1 && activeData[0].text === key) return;
      setHiddenKeys((prev) => [...prev, key]);
    }
  };

  return (
    <View>
      {hiddenKeys.length > 0 && (
        <TouchableOpacity
          onPress={() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setHiddenKeys([]);
          }}
          style={{ position: "absolute", right: 0, top: -10, zIndex: 10 }}
        >
          <Text style={{ color: ACCENT, fontSize: 11, fontWeight: "600" }}>
            Hiện tất cả
          </Text>
        </TouchableOpacity>
      )}
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ alignItems: "center", justifyContent: "center" }}>
          {activeData.length > 0 ? (
            <PieChart
              data={activeData}
              donut
              radius={70}
              innerRadius={55}
              innerCircleColor={theme.isDark ? "#1e293b" : "#f1f5f9"}
              strokeWidth={2}
              strokeColor={theme.cardBg}
              animate
            />
          ) : (
            <View
              style={{
                width: 140,
                height: 140,
                borderRadius: 70,
                borderWidth: 2,
                borderColor: theme.subText,
                opacity: 0.3,
              }}
            />
          )}
          <View
            style={{ position: "absolute", alignItems: "center" }}
            pointerEvents="none"
          >
            <Text
              style={{ color: theme.subText, fontSize: 10, fontWeight: "600" }}
            >
              {centerTitle.toUpperCase()}
            </Text>
            <Text
              style={{ color: theme.text, fontWeight: "800", fontSize: 18 }}
            >
              {fmt(total)}
            </Text>
          </View>
        </View>
        <View style={{ flex: 1, paddingLeft: 20, gap: 8 }}>
          {data.map((item: any, idx: number) => {
            const isHidden = hiddenKeys.includes(item.text);
            return (
              <TouchableOpacity
                key={idx}
                onPress={() => toggleSlice(item.text)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  opacity: isHidden ? 0.3 : 1,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    flex: 1,
                  }}
                >
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 4,
                      backgroundColor: item.color,
                      borderWidth: isHidden ? 1 : 0,
                      borderColor: theme.subText,
                    }}
                  />
                  <Text
                    style={{
                      color: isHidden ? theme.subText : theme.text,
                      fontSize: 12,
                      textDecorationLine: isHidden ? "line-through" : "none",
                    }}
                    numberOfLines={1}
                  >
                    {item.text}
                  </Text>
                </View>
                <Text
                  style={{
                    color: isHidden ? theme.subText : theme.text,
                    fontWeight: "700",
                    fontSize: 12,
                  }}
                >
                  {fmt(item.value)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

/* =================== MAIN SCREEN =================== */

export default function UserStatsScreen() {
  const T = useThemeColors();
  const { top, bottom } = useSafeAreaInsets();
  const uid = useSelector((s: any) => s?.auth?.userInfo?._id);
  const name = useSelector((s: any) => s?.auth?.userInfo?.nickname);
  const [rangeVal, setRangeVal] = useState(30);
  const [range, setRange] = useState(() => ({
    from: dayjs().subtract(29, "day").format("YYYY-MM-DD"),
    to: dayjs().format("YYYY-MM-DD"),
  }));

  const queryOpts = { skip: !uid };
  const { data: ov } = useGetUserOverviewQuery({ uid, ...range }, queryOpts);
  const { data: se } = useGetUserSeriesQuery({ uid, ...range, tz }, queryOpts);
  const { data: br } = useGetUserBreakdownQuery({ uid, ...range }, queryOpts);
  const { data: tp } = useGetUserTopQuery(
    { uid, ...range, limit: 8 },
    queryOpts
  );
  const { data: pf } = useGetUserProfileExQuery({ uid }, queryOpts);

  const seriesSafe = safeArr<any>(se?.series as any[], []);
  const areaData = useMemo(() => {
    if (!seriesSafe.length) return [];
    return seriesSafe.map((x: any) => ({
      value: x.matches || 0,
      label: String(x.date).slice(8),
      dateFull: x.date,
      wins: x.wins,
    }));
  }, [seriesSafe]);

  const stackData = useMemo(() => {
    if (!seriesSafe.length) return [];
    return seriesSafe.map((x: any) => ({
      label: String(x.date).slice(8),
      stacks: [
        { value: x.wins || 0, color: "#10b981", marginBottom: 2 },
        { value: (x.matches || 0) - (x.wins || 0), color: "#f43f5e" },
      ],
    }));
  }, [seriesSafe]);

  const byStatus = safeArr<any>(br?.byStatus as any[], []).map((x: any, i) => ({
    value: x.value || 0,
    color: ["#f59e0b", "#10b981", "#ef4444", "#3b82f6"][i % 4],
    text: x.label || "Khác",
  }));

  const topTours = safeArr<any>(br?.byTournament as any[], [])
    .slice(0, 10)
    .map((x: any, i) => ({
      value: x.value || x.count || 0,
      text: x.label || x.name || "Giải đấu",
      color: ["#a855f7", "#ec4899", "#8b5cf6", "#6366f1", "#3b82f6"][i % 5],
      id: x.id || x._id,
    }));

  const opps = safeArr<any>(tp?.topOpponents as any[], []);

  const changeRange = (days: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRangeVal(days);
    setRange({
      from: dayjs()
        .subtract(days - 1, "day")
        .format("YYYY-MM-DD"),
      to: dayjs().format("YYYY-MM-DD"),
    });
  };

  const headerTopPadding = top + (Platform.OS === "ios" ? 6 : 8);
  const headerHeight = top + (Platform.OS === "ios" ? 104 : 122);

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <StatusBar barStyle={T.isDark ? "light-content" : "dark-content"} />
      <AuthGuard>
        <Stack.Screen options={{ headerShown: false }} />
        <StatsLiquidBackdrop theme={T} />

        {/* Header */}
        <AppleLiquidGlassView
          fallback="view"
          glassColorScheme={statsGlassScheme(T)}
          glassEffectStyle="regular"
          glassTintColor={statsGlassSurfaceTint(T, 0.62, 0.52)}
          isInteractive
          style={[
            styles.headerGlass,
            {
              height: headerHeight,
              paddingTop: headerTopPadding,
              backgroundColor: T.cardBg,
              borderColor: T.cardBorder,
            },
            IOS_26_LIQUID_GLASS_ENABLED && styles.glassControl,
          ]}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <IconButton
              icon="chevron-back"
              onPress={() => router.back()}
              theme={T}
            />
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ color: T.text, fontWeight: "900", fontSize: 22 }}>
                Thống kê
              </Text>
              <Text style={{ color: ACCENT, fontSize: 13, fontWeight: "600" }}>
                {name ? `@${String(name).toUpperCase()}` : "PickleTour"}
              </Text>
            </View>
          </View>

          {/* Range selector */}
          <AppleLiquidGlassView
            fallback="view"
            glassColorScheme={statsGlassScheme(T)}
            glassEffectStyle="clear"
            glassTintColor={statsGlassSurfaceTint(T, 0.48, 0.38)}
            isInteractive
            style={[
              styles.segmentContainer,
              { backgroundColor: T.segmentBg, borderColor: T.cardBorder },
              IOS_26_LIQUID_GLASS_ENABLED && styles.innerGlass,
            ]}
          >
            {[7, 14, 30, 90].map((d) => {
              const isActive = rangeVal === d;
              return (
                <TouchableOpacity
                  key={d}
                  onPress={() => changeRange(d)}
                  style={styles.segmentBtn}
                >
                  <AppleLiquidGlassView
                    fallback="view"
                    glassColorScheme={statsGlassScheme(T)}
                    glassEffectStyle="clear"
                    glassTintColor={
                      isActive
                        ? statsGlassAccentTint(0.34)
                        : "rgba(255,255,255,0)"
                    }
                    isInteractive={isActive}
                    style={[
                      styles.segmentPill,
                      isActive && {
                        backgroundColor: T.isDark
                          ? "rgba(99, 102, 241, 0.22)"
                          : "rgba(255,255,255,0.74)",
                      },
                      isActive && IOS_26_LIQUID_GLASS_ENABLED && styles.innerGlass,
                      isActive && !T.isDark && styles.shadowSm,
                    ]}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        { color: isActive ? ACCENT : T.subText },
                        isActive && { fontWeight: "700" },
                      ]}
                    >
                      {d} ngày
                    </Text>
                  </AppleLiquidGlassView>
                </TouchableOpacity>
              );
            })}
          </AppleLiquidGlassView>
        </AppleLiquidGlassView>

        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: PADX,
            paddingBottom: bottom + 40,
          }}
          showsVerticalScrollIndicator={false}
          scrollEnabled
        >
          {/* 1. Ranking & Radar */}
          <View
            style={{
              flexDirection: "row",
              gap: 12,
              marginBottom: 16,
              height: 260,
            }}
          >
            {/* CARD HẠNG – ĐÃ THÊM NỘI DUNG */}
            <GlassCard
              title="Hạng"
              icon="shield-checkmark-outline"
              theme={T}
              style={{ flex: 1 }}
            >
              {(() => {
                const tierLabel = pf?.ranking?.tierLabel || "Chưa xếp hạng";
                const hasRanking = !!pf?.ranking?.tierLabel;
                const reputation = pf?.ranking?.reputation ?? 0;
                const totalMatches = ov?.kpis?.totalMatches ?? 0;
                const winrate = ov?.kpis?.winrate ?? 0;
                const tournaments = ov?.kpis?.tournamentsPlayed ?? 0;

                return (
                  <View
                    style={{
                      flex: 1,
                      justifyContent: "center",
                    }}
                  >
                    {/* Tier + badge */}
                    <View
                      style={{
                        alignItems: "center",
                        marginBottom: 12,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 32,
                          fontWeight: "900",
                          color: "#fbbf24",
                          textAlign: "center",
                        }}
                        numberOfLines={1}
                      >
                        {tierLabel}
                      </Text>

                      <View
                        style={{
                          marginTop: 6,
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                          borderRadius: 999,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                          backgroundColor: T.isDark
                            ? "rgba(250, 250, 250, 0.06)"
                            : "rgba(15, 23, 42, 0.04)",
                        }}
                      >
                        <Ionicons
                          name={
                            hasRanking ? "ribbon-outline" : "sparkles-outline"
                          }
                          size={14}
                          color={ACCENT}
                        />
                        <Text
                          style={{
                            color: T.subText,
                            fontSize: 11,
                            fontWeight: "600",
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                          }}
                        >
                          {hasRanking ? "Hạng hiện tại" : "New player"}
                        </Text>
                      </View>
                    </View>

                    {/* Chỉ số chính */}
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        gap: 12,
                      }}
                    >
                      <View style={{ flex: 1, gap: 8 }}>
                        <View>
                          <Text
                            style={[styles.tinyLabel, { color: T.subText }]}
                          >
                            Uy tín
                          </Text>
                          <Text
                            style={[
                              styles.boldVal,
                              { color: T.text, fontSize: 15 },
                            ]}
                          >
                            {fmt(reputation)}
                          </Text>
                        </View>

                        <View>
                          <Text
                            style={[styles.tinyLabel, { color: T.subText }]}
                          >
                            Tỉ lệ thắng
                          </Text>
                          <Text
                            style={[
                              styles.boldVal,
                              { color: "#3b82f6", fontSize: 15 },
                            ]}
                          >
                            {winrate || 0}%
                          </Text>
                        </View>
                      </View>

                      <View style={{ flex: 1, gap: 8, alignItems: "flex-end" }}>
                        <View style={{ alignItems: "flex-end" }}>
                          <Text
                            style={[styles.tinyLabel, { color: T.subText }]}
                          >
                            Tổng trận
                          </Text>
                          <Text
                            style={[
                              styles.boldVal,
                              { color: T.text, fontSize: 15 },
                            ]}
                          >
                            {fmt(totalMatches)}
                          </Text>
                        </View>

                        <View style={{ alignItems: "flex-end" }}>
                          <Text
                            style={[styles.tinyLabel, { color: T.subText }]}
                          >
                            Giải đấu đã chơi
                          </Text>
                          <Text
                            style={[
                              styles.boldVal,
                              { color: T.text, fontSize: 15 },
                            ]}
                          >
                            {fmt(tournaments)}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Hint khi chưa có hạng */}
                    {!hasRanking && (
                      <View style={{ marginTop: 10 }}>
                        <Text
                          style={{
                            color: T.subText,
                            fontSize: 11,
                            fontStyle: "italic",
                          }}
                        >
                          Thi đấu thêm vài trận ở giải chính thức để được xếp
                          hạng bạn nhé!
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })()}
            </GlassCard>

            {/* Radar kỹ năng */}
            <GlassCard
              title="Kỹ năng"
              icon="radio-outline"
              theme={T}
              style={{ width: W * 0.44 }}
            >
              <InteractiveRadar
                single={pf?.ranking?.single}
                double={pf?.ranking?.double}
                mix={pf?.ranking?.mix}
                theme={T}
              />
            </GlassCard>
          </View>

          {/* 2. KPI */}
          <View style={{ marginBottom: 16 }}>
            <Text style={[styles.sectionTitle, { color: T.subText }]}>
              HIỆU SUẤT
            </Text>
            <View style={styles.kpiGrid}>
              <KPI
                label="Tổng trận"
                value={fmt(ov?.kpis?.totalMatches)}
                theme={T}
              />
              <KPI
                label="Thắng"
                value={fmt(ov?.kpis?.wins)}
                color="#10b981"
                theme={T}
              />
              <KPI
                label="Tỉ lệ thắng"
                value={`${ov?.kpis?.winrate ?? 0}%`}
                color="#3b82f6"
                theme={T}
              />
              <KPI
                label="Thời lượng"
                value={`${Math.round((ov?.kpis?.totalPlayMin || 0) / 60)}h`}
                theme={T}
              />
              <KPI
                label="Đang đấu"
                value={fmt(ov?.kpis?.liveMatches)}
                color="#ef4444"
                theme={T}
              />
              <KPI
                label="Đăng ký"
                value={fmt(ov?.kpis?.registrations)}
                theme={T}
              />
            </View>
          </View>

          {/* 3. Line Chart */}
          <GlassCard
            title="Xu hướng thi đấu"
            subtitle="Trượt ngang để xem thêm"
            icon="trending-up-outline"
            theme={T}
          >
            {areaData.length > 0 ? (
              <SimpleLineChart data={areaData} theme={T} />
            ) : (
              <EmptyChart theme={T} />
            )}
          </GlassCard>
          <View style={{ height: 16 }} />

          {/* 4. Bar Chart */}
          <GlassCard
            title="Kết quả chi tiết"
            subtitle="Thắng (Xanh) vs Thua (Đỏ)"
            icon="bar-chart-outline"
            theme={T}
          >
            {stackData.length > 0 ? (
              <BarChart
                stackData={stackData}
                height={180}
                width={W - PADX * 4}
                spacing={24}
                barWidth={12}
                barBorderRadius={4}
                yAxisTextStyle={{ color: T.chartText, fontSize: 10 }}
                xAxisLabelTextStyle={{ color: T.chartText, fontSize: 10 }}
                rulesColor={T.chartGrid}
              />
            ) : (
              <EmptyChart theme={T} />
            )}
          </GlassCard>
          <View style={{ height: 16 }} />

          {/* 5. Donuts */}
          <GlassCard
            title="Phân bố trạng thái"
            icon="pie-chart-outline"
            theme={T}
          >
            <InteractiveDonut
              data={byStatus}
              centerTitle="Trạng thái"
              theme={T}
            />
          </GlassCard>
          <View style={{ height: 16 }} />

          <GlassCard title="Giải đấu yêu thích" icon="trophy-outline" theme={T}>
            <InteractiveDonut
              data={topTours}
              centerTitle="Tham gia"
              theme={T}
            />
          </GlassCard>
          <View style={{ height: 16 }} />

          {/* 6. Opponents */}
          <GlassCard
            title="Top Đối Thủ"
            subtitle="Chạm để xem chi tiết"
            icon="people-outline"
            theme={T}
          >
            {opps.length > 0 ? (
              opps.map((x: any, i: number) => (
                <ScaleBtn
                  key={i}
                  onPress={() => router.push(`/profile/${x._id}`)}
                  style={[styles.oppRow, { borderBottomColor: T.cardBorder }]}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <View
                      style={[
                        styles.rankBadge,
                        { backgroundColor: T.iconBg },
                        i < 3 && styles.rankTop,
                      ]}
                    >
                      <Text
                        style={{
                          color: i < 3 ? "#000" : T.text,
                          fontWeight: "bold",
                          fontSize: 12,
                        }}
                      >
                        {i + 1}
                      </Text>
                    </View>
                    <Text
                      style={[styles.oppName, { color: T.text }]}
                      numberOfLines={1}
                    >
                      {x?.name || x?.nickname || "Ẩn danh"}
                    </Text>
                  </View>
                  <View style={styles.oppTag}>
                    <Text style={styles.oppVal}>
                      {fmt(x?.times ?? x?.count ?? 0)} trận
                    </Text>
                  </View>
                </ScaleBtn>
              ))
            ) : (
              <View style={{ padding: 20 }}>
                <Text
                  style={{
                    color: T.subText,
                    textAlign: "center",
                    fontStyle: "italic",
                  }}
                >
                  Chưa có đối thủ nào
                </Text>
              </View>
            )}
          </GlassCard>
        </ScrollView>
      </AuthGuard>
    </View>
  );
}

/* =================== STYLES =================== */

const styles = StyleSheet.create({
  ambientBackdrop: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  ambientBand: {
    position: "absolute",
    top: 72,
    left: -40,
    right: -40,
    height: 120,
    borderRadius: 28,
  },
  ambientBandAlt: {
    top: 210,
    height: 86,
  },
  headerGlass: {
    paddingBottom: 8,
    paddingHorizontal: PADX,
    borderBottomWidth: 1,
  },
  iconButtonGlass: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  glassControl: {
    borderColor: "rgba(255,255,255,0.28)",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  liquidCard: {
    borderColor: "rgba(255,255,255,0.26)",
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  innerGlass: {
    borderColor: "rgba(255,255,255,0.22)",
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 10,
    letterSpacing: 1,
  },
  cardContainer: { borderRadius: 20, overflow: "hidden", borderWidth: 1 },
  cardHeader: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  cardTitle: { fontSize: 15, fontWeight: "700" },
  cardSub: { fontSize: 11, marginTop: 2 },
  cardBody: { padding: 16, paddingTop: 8 },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(99, 102, 241, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  segmentContainer: {
    flexDirection: "row",
    padding: 4,
    borderRadius: 16,
    marginTop: 8,
    borderWidth: 1,
  },
  segmentBtn: {
    flex: 1,
    alignItems: "center",
    borderRadius: 12,
  },
  segmentPill: {
    width: "100%",
    minHeight: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  segmentText: { fontWeight: "600", fontSize: 13 },
  shadowSm: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  kpiBox: {
    width: (W - PADX * 2 - 20) / 3,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
  },
  kpiValue: { fontWeight: "800", fontSize: 16, marginBottom: 4 },
  kpiLabel: { fontSize: 11 },
  tinyLabel: { fontSize: 10, marginBottom: 2 },
  boldVal: { fontSize: 14, fontWeight: "700" },
  oppRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  rankBadge: {
    width: 20,
    height: 20,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  rankTop: { backgroundColor: "#fbbf24" },
  oppName: { fontWeight: "600", fontSize: 14, width: 140 },
  oppTag: {
    backgroundColor: "rgba(99, 102, 241, 0.1)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  oppVal: { color: "#818cf8", fontSize: 11, fontWeight: "700" },
  radarTooltip: {
    position: "absolute",
    top: "40%",
    alignSelf: "center",
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: ACCENT,
    width: 80,
    height: 60,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },
});
