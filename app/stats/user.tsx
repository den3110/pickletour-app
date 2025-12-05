// app/(tabs)/user-stats.tsx
// Single-file User Stats (Expo + RN) dùng react-native-gifted-charts + SVG cho radar/heatmap
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
  SafeAreaView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSelector } from "react-redux";
import dayjs from "dayjs";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import Svg, {
  Rect,
  Circle,
  Polygon,
  Line as SvgLine,
  Text as SvgText,
} from "react-native-svg";
import { LineChart, BarChart, PieChart } from "react-native-gifted-charts";

import {
  useGetUserOverviewQuery,
  useGetUserSeriesQuery,
  useGetUserBreakdownQuery,
  useGetUserHeatmapQuery,
  useGetUserTopQuery,
  useGetUserProfileExQuery,
} from "@/slices/userStatsApiSlice";
import { Stack, router } from "expo-router";
import AuthGuard from "@/components/auth/AuthGuard";
import { Ionicons } from "@expo/vector-icons"; // 👈 thêm dòng này
/* =================== Consts & Utils =================== */
const tz = "Asia/Bangkok";
const W = Dimensions.get("window").width;
const PADX = 14;

const fmt = (n?: number) =>
  typeof n === "number" ? n.toLocaleString("vi-VN") : "-";
const fmtVND = (n?: number) =>
  typeof n === "number" ? `${n.toLocaleString("vi-VN")} ₫` : "0 ₫";

// tránh crash .reduce()/.map() khi dữ liệu rỗng
const safeArr = <T,>(arr: T[] | undefined | null, fallback: T[]): T[] =>
  Array.isArray(arr) && arr.length ? arr : fallback;

/* =================== Small UI =================== */
function KPI({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
    </View>
  );
}

function ChartCard({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <LinearGradient
        colors={["rgba(79,70,229,0.10)", "rgba(34,197,94,0.08)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{title}</Text>
          {!!subtitle && <Text style={styles.cardSub}>{subtitle}</Text>}
        </View>
        {!!right && <View>{right}</View>}
      </View>
      <View style={{ marginTop: 10 }}>{children}</View>
    </View>
  );
}

/* =================== Charts (gifted-charts + SVG) =================== */

// Area chart (matches/day)
function AreaMatches({ data }: { data: { x: string; y: number }[] }) {
  const chartData = useMemo(() => {
    const raw = safeArr(data, []);
    const mapped = raw.map((d) => ({ value: d.y, label: d.x }));
    return safeArr(mapped, [{ value: 0, label: "—" }]);
  }, [data]);

  return (
    <View>
      <LineChart
        width={W - PADX * 2 - 4}
        areaChart
        curved
        isAnimated
        thickness={3}
        hideDataPoints={false}
        data={chartData}
        startFillColor={"rgba(99,102,241,0.35)"}
        endFillColor={"rgba(99,102,241,0.05)"}
        startOpacity={1}
        endOpacity={0}
        color={"#818CF8"}
        yAxisTextStyle={{ color: "#bbb" }}
        xAxisLabelTextStyle={{ color: "#bbb", fontSize: 10 }}
        spacing={28}
        rulesColor={"rgba(255,255,255,0.1)"}
        initialSpacing={14}
      />
    </View>
  );
}

// Stacked bars (win/lose per day)
function StackedWL({
  days,
  wins,
  matches,
}: {
  days: string[];
  wins: Record<string, number>;
  matches: Record<string, number>;
}) {
  const stackData = useMemo(() => {
    const d = safeArr(days, []);
    const mapped = d.map((key) => {
      const w = wins?.[key] || 0;
      const m = matches?.[key] || 0;
      return {
        label: key,
        stacks: [
          { value: w, color: "#34D399" }, // Win
          { value: Math.max(m - w, 0), color: "#FCA5A5" }, // Lose
        ],
      };
    });
    return safeArr(mapped, [
      {
        label: "—",
        stacks: [
          { value: 0, color: "#34D399" },
          { value: 0, color: "#FCA5A5" },
        ],
      },
    ]);
  }, [days, wins, matches]);

  return (
    <BarChart
      width={W - PADX * 2 - 4}
      isAnimated
      stackData={stackData}
      barBorderRadius={6}
      barWidth={18}
      spacing={22}
      xAxisLabelTextStyle={{ color: "#bbb", fontSize: 10 }}
      yAxisTextStyle={{ color: "#bbb" }}
      rulesColor={"rgba(255,255,255,0.1)"}
      height={220}
    />
  );
}

// Line chart (spend/day)
function LineSpend({ data }: { data: { x: string; y: number }[] }) {
  const chartData = useMemo(() => {
    const raw = safeArr(data, []);
    const mapped = raw.map((d) => ({ value: d.y, label: d.x }));
    return safeArr(mapped, [{ value: 0, label: "—" }]);
  }, [data]);

  return (
    <LineChart
      width={W - PADX * 2 - 4}
      curved
      isAnimated
      data={chartData}
      hideDataPoints={false}
      color={"#60A5FA"}
      yAxisTextStyle={{ color: "#bbb" }}
      xAxisLabelTextStyle={{ color: "#bbb", fontSize: 10 }}
      spacing={28}
      rulesColor={"rgba(255,255,255,0.1)"}
      thickness={3}
    />
  );
}

// Donut (status/tournaments)
function Donut({
  items,
  centerTitle = "Tổng",
}: {
  items: { label: string; value: number }[];
  centerTitle?: string;
}) {
  const palette = [
    "#F59E0B",
    "#10B981",
    "#EF4444",
    "#6366F1",
    "#06B6D4",
    "#A78BFA",
    "#F472B6",
    "#22C55E",
    "#EAB308",
    "#FB7185",
  ];
  const itemsSafe = safeArr(items, [{ label: "—", value: 1 }]);
  const total = itemsSafe.reduce((s, x) => s + (x.value || 0), 0);
  const data = itemsSafe.map((x, i) => ({
    value: x.value || 0,
    color: palette[i % palette.length],
    text: x.label,
  }));

  return (
    <View style={{ alignItems: "center" }}>
      <PieChart
        donut
        radius={95}
        innerRadius={58}
        data={data}
        innerCircleColor="rgba(16,18,27,0.9)"
        showText={false}
        strokeColor="rgba(0,0,0,0)"
      />
      <View style={{ position: "absolute", top: 78, alignItems: "center" }}>
        <Text style={{ color: "#ddd", fontSize: 12 }}>{centerTitle}</Text>
        <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>
          {fmt(total)}
        </Text>
      </View>
      <View style={{ marginTop: 12, width: W - PADX * 2 - 4 }}>
        {itemsSafe.slice(0, 6).map((x, i) => (
          <View key={`${x.label}-${i}`} style={styles.legendRow}>
            <View
              style={[styles.legendDot, { backgroundColor: data[i].color }]}
            />
            <Text style={styles.legendLabel} numberOfLines={1}>
              {x.label}
            </Text>
            <Text style={styles.legendVal}>{fmt(x.value)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// Radar (single/double/mix) — SVG thuần
function Radar({
  single = 0,
  double = 0,
  mix = 0,
}: {
  single?: number;
  double?: number;
  mix?: number;
}) {
  const size = 260;
  const cx = size / 2;
  const cy = size / 2 + 8;
  const maxV = Math.max(8, single, double, mix) || 8;

  const toPoint = (val: number, idx: number) => {
    const r = (val / maxV) * 95;
    const angle = -Math.PI / 2 + idx * ((2 * Math.PI) / 3);
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  };

  const pts = [single, double, mix].map((v, i) => toPoint(v, i));
  const grid = [0.25, 0.5, 0.75, 1].map((k) =>
    [toPoint(maxV * k, 0), toPoint(maxV * k, 1), toPoint(maxV * k, 2)]
      .map((p) => `${p.x},${p.y}`)
      .join(" ")
  );

  return (
    <Svg width={size} height={size}>
      {grid.map((points, i) => (
        <Polygon
          key={`g-${i}`}
          points={points}
          fill="none"
          stroke="rgba(255,255,255,0.15)"
          strokeWidth={1}
        />
      ))}
      {[0, 1, 2].map((i) => {
        const p = toPoint(maxV, i);
        return (
          <SvgLine
            key={`ax-${i}`}
            x1={cx}
            y1={cy}
            x2={p.x}
            y2={p.y}
            stroke="rgba(255,255,255,0.2)"
            strokeWidth={1}
          />
        );
      })}
      {["Single", "Double", "Mix"].map((t, i) => {
        const p = toPoint(maxV + 0.6, i);
        return (
          <SvgText
            key={`lb-${i}`}
            x={p.x}
            y={p.y}
            fill="#ddd"
            fontSize="12"
            fontWeight="700"
            textAnchor="middle"
          >
            {t}
          </SvgText>
        );
      })}
      <Polygon
        points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
        fill="rgba(34,211,238,0.25)"
        stroke="#22D3EE"
        strokeWidth={2}
      />
      {pts.map((p, i) => (
        <Circle key={`pt-${i}`} cx={p.x} cy={p.y} r={3} fill="#22D3EE" />
      ))}
    </Svg>
  );
}

// Heatmap 7x24 — SVG
function Heatmap({ grid }: { grid: number[][] }) {
  const cell = 12,
    gap = 3,
    rows = 7,
    cols = 24;
  const w = cols * cell + (cols - 1) * gap;
  const h = rows * cell + (rows - 1) * gap;
  const flat = safeArr(
    grid,
    Array.from({ length: 7 }, () => Array(24).fill(0))
  );
  const max = Math.max(1, ...flat.flat());
  const color = (v: number) => {
    const t = v / max;
    const a = Math.round(40 + t * 180);
    return `rgba(99,102,241,${a / 255})`;
  };

  return (
    <View>
      <Svg width={w} height={h + 2}>
        {flat.map((row, r) =>
          row.map((v, c) => (
            <Rect
              key={`${r}-${c}`}
              x={c * (cell + gap)}
              y={r * (cell + gap)}
              width={cell}
              height={cell}
              rx={3}
              fill={v ? color(v) : "rgba(255,255,255,0.08)"}
            />
          ))
        )}
      </Svg>
      <Text
        style={{ textAlign: "right", opacity: 0.6, marginTop: 4, fontSize: 12 }}
      >
        Nhiều → đậm hơn
      </Text>
    </View>
  );
}

/* =================== Main screen =================== */
export default function UserStatsScreen() {
  const uid = useSelector((s: any) => s?.auth?.userInfo?._id);
  const name = useSelector((s: any) => s?.auth?.userInfo?.nickname);
  const { top } = useSafeAreaInsets();

  const [range, setRange] = useState(() => ({
    from: dayjs().subtract(29, "day").format("YYYY-MM-DD"),
    to: dayjs().format("YYYY-MM-DD"),
  }));
  const quick = (d: number) =>
    setRange({
      from: dayjs()
        .subtract(d - 1, "day")
        .format("YYYY-MM-DD"),
      to: dayjs().format("YYYY-MM-DD"),
    });

  const {
    data: ov,
    isFetching: f1,
    refetch: r1,
  } = useGetUserOverviewQuery({ uid, ...range }, { skip: !uid });
  const {
    data: se,
    isFetching: f2,
    refetch: r2,
  } = useGetUserSeriesQuery({ uid, ...range, tz }, { skip: !uid });
  const {
    data: br,
    isFetching: f3,
    refetch: r3,
  } = useGetUserBreakdownQuery({ uid, ...range }, { skip: !uid });
  const {
    data: hm,
    isFetching: f4,
    refetch: r4,
  } = useGetUserHeatmapQuery({ uid, ...range, tz }, { skip: !uid });
  const {
    data: tp,
    isFetching: f5,
    refetch: r5,
  } = useGetUserTopQuery({ uid, ...range, limit: 8 }, { skip: !uid });
  const {
    data: pf,
    isFetching: f6,
    refetch: r6,
  } = useGetUserProfileExQuery({ uid }, { skip: !uid });

  const refreshing = !!(f1 || f2 || f3 || f4 || f5 || f6);

  // Map series (chống rỗng)
  const seriesSafe = safeArr<any>(se?.series as any[], []);
  const days = useMemo(
    () => seriesSafe.map((x: any) => String(x.date).slice(5)),
    [seriesSafe]
  );
  const matchMap = useMemo(
    () =>
      Object.fromEntries(
        seriesSafe.map((x: any) => [String(x.date).slice(5), x.matches || 0])
      ),
    [seriesSafe]
  );
  const winMap = useMemo(
    () =>
      Object.fromEntries(
        seriesSafe.map((x: any) => [String(x.date).slice(5), x.wins || 0])
      ),
    [seriesSafe]
  );
  const areaData = useMemo(
    () =>
      seriesSafe.map((x: any) => ({
        x: String(x.date).slice(5),
        y: x.matches || 0,
      })),
    [seriesSafe]
  );
  const spendData = useMemo(
    () =>
      seriesSafe.map((x: any) => ({
        x: String(x.date).slice(5),
        y: x.spend || 0,
      })),
    [seriesSafe]
  );

  const topTours = safeArr<any>(br?.byTournament as any[], []);
  const byStatus = safeArr<any>(br?.byStatus as any[], []);
  const opps = safeArr<any>(tp?.topOpponents as any[], []);

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <AuthGuard>
        <Stack.Screen options={{ headerShown: false }} />
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: PADX,
          }}
        >
          <View style={styles.headerRow}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="chevron-back" size={22} color="#111827" />
            </TouchableOpacity>

            <View>
              <Text style={styles.h1}>Thống kê cá nhân</Text>
              <Text style={styles.h2}>{name || "User"}</Text>
            </View>
          </View>
          {/* Quick range */}
          <View style={styles.quickRow}>
            {[7, 14, 30, 90].map((d) => (
              <TouchableOpacity
                key={d}
                onPress={() => quick(d)}
                style={styles.quickBtn}
              >
                <Text style={styles.quickText}>{d}N</Text>
              </TouchableOpacity>
            ))}
            <Text style={styles.rangeTxt}>
              {range.from} → {range.to}
            </Text>
          </View>

          {/* Profile + Ranking mini */}
          <ChartCard title="Hồ sơ & Ranking" subtitle="Thông tin nhanh">
            <View style={styles.kpis}>
              <KPI label="Tier" value={pf?.ranking?.tierLabel || "-"} />
              <KPI label="Reputation" value={fmt(pf?.ranking?.reputation)} />
              <KPI
                label="Giải đã tham gia"
                value={fmt(ov?.kpis?.tournamentsPlayed)}
              />
              <KPI label="Đăng ký" value={fmt(ov?.kpis?.registrations)} />
            </View>
            <View style={{ marginTop: 8, alignItems: "center" }}>
              <Radar
                single={pf?.ranking?.single || 0}
                double={pf?.ranking?.double || 0}
                mix={pf?.ranking?.mix || 0}
              />
            </View>
          </ChartCard>

          {/* KPIs tổng quan */}
          <ChartCard title="Tổng quan" subtitle="Kết quả & thời lượng">
            <View style={styles.kpis}>
              <KPI label="Trận" value={fmt(ov?.kpis?.totalMatches)} />
              <KPI label="Winrate" value={`${ov?.kpis?.winrate ?? 0}%`} />
              <KPI label="Thắng" value={fmt(ov?.kpis?.wins)} />
              <KPI label="Thua" value={fmt(ov?.kpis?.losses)} />
              <KPI label="Đang live" value={fmt(ov?.kpis?.liveMatches)} />
              <KPI label="Đã xong" value={fmt(ov?.kpis?.finishedMatches)} />
              <KPI label="Tổng phút" value={fmt(ov?.kpis?.totalPlayMin)} />
              <KPI label="Phút/trận" value={fmt(ov?.kpis?.avgMatchMin)} />
            </View>
          </ChartCard>

          {/* Donut: status */}
          <ChartCard title="Phân bố trạng thái trận" subtitle="Donut">
            <Donut
              items={byStatus.map((x: any) => ({
                label: String(x.label ?? x._id ?? "Khác"),
                value: Number(x.value ?? 0),
              }))}
              centerTitle="Tổng trận"
            />
          </ChartCard>

          {/* Donut: top tournaments */}
          <ChartCard title="Giải tham gia nhiều" subtitle="Top 10">
            <Donut
              items={topTours.slice(0, 10).map((x: any) => ({
                label: String(x.label ?? x.name ?? "Giải"),
                value: Number(x.value ?? x.count ?? 0),
              }))}
              centerTitle="Số trận"
            />
          </ChartCard>

          {/* Heatmap */}
          <ChartCard title="Khung giờ hoạt động" subtitle="Heatmap 7×24">
            <Heatmap
              grid={safeArr(
                hm?.grid as number[][],
                Array.from({ length: 7 }, () => Array(24).fill(0))
              )}
            />
          </ChartCard>

          {/* Top đối thủ */}
          <ChartCard title="Top đối thủ" subtitle="Gặp nhiều nhất">
            {opps.map((x: any, i: number) => (
              <View
                key={`${x?._id || x?.name || "opp"}-${i}`}
                style={styles.row}
              >
                <Text style={{ color: "#fff", flex: 1 }} numberOfLines={1}>
                  {i + 1}. {x?.name || x?.nickname || "Ẩn danh"}
                </Text>
                <Text style={{ color: "#ddd" }}>
                  x{fmt(x?.times ?? x?.count ?? 0)}
                </Text>
              </View>
            ))}
          </ChartCard>

          <View style={{ height: 28 }} />
        </ScrollView>
      </AuthGuard>
    </SafeAreaView>
  );
}

/* =================== Styles =================== */
const styles = StyleSheet.create({
  h1: { fontSize: 22, fontWeight: "800", color: "#000" },
  h2: { fontSize: 14, marginBottom: 8 },

  quickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
    marginBottom: 6,
    flexWrap: "wrap",
  },
  quickBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(124,58,237,0.18)",
  },
  quickText: { color: "#C4B5FD", fontWeight: "800" },
  rangeTxt: { marginLeft: "auto", color: "#aaa" },

  card: {
    borderRadius: 16,
    padding: 14,
    marginTop: 14,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    backgroundColor: "rgba(16,18,27,0.6)",
  },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  cardTitle: { fontSize: 16, fontWeight: "800", color: "#fff" },
  cardSub: { color: "rgba(255,255,255,0.65)" },

  kpis: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 6,
  },
  kpi: {
    width: (W - PADX * 2 - 10 * 3) / 4, // 4 cột
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  kpiLabel: { color: "#aaa", fontSize: 12, marginBottom: 2 },
  kpiValue: { color: "#fff", fontSize: 16, fontWeight: "800" },

  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { color: "#ddd", flex: 1 },
  legendVal: { color: "#fff", fontWeight: "700" },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 8,
    columnGap: 6,
  },
  backBtn: {
    paddingRight: 6,
    paddingVertical: 4,
    marginRight: 2,
    // không background theo đúng yêu cầu
  },
});
