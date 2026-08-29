/* eslint-disable react/prop-types */
// ModernRoundElimBracketRN.tsx
// Bản v4 Round Elimination / Playoff mobile — mỗi seed round R+1 có thể lấy loser
// hoặc winner từ seed cụ thể ở round R (không phải seed 2i/2i+1 chuẩn).
// Cards absolute positioned, connectors bezier gradient. Reuse ModernSeedCard.

import React, { useMemo, useState } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import Svg, { Path, Defs, LinearGradient, Stop } from "react-native-svg";

import {
  ModernSeedCard,
  ModernRoundChip,
  MODERN_CARD_W,
  MODERN_CARD_MIN_H,
  accentForIndex,
  rgba,
  type ResolveSideLabel,
} from "./ModernBracketShared";

const CARD_W = MODERN_CARD_W;
const CARD_H = MODERN_CARD_MIN_H + 8;
const COL_GAP = 60;
const ROW_GAP = 24;
const HEADER_H = 48;
const SEED_PAD_X = 4;

type Seed = any;
type Round = { title?: string; seeds: Seed[] };

/* ================= layout helpers (mirror web) ================= */
function seedKeyOf(seed: any, fallbackRound: number, fallbackOrder: number) {
  const match = seed?.__match;
  const round = Number(match?.round ?? seed?.__round ?? fallbackRound);
  const order = Number(match?.order ?? fallbackOrder);
  if (!Number.isFinite(round) || !Number.isFinite(order)) return "";
  return `${round}:${order}`;
}

function sourceRefsOf(seed: any) {
  const match = seed?.__match;
  if (!match) return [];
  return [match.seedA, match.seedB]
    .map((source: any) => {
      const type = String(source?.type || "");
      if (
        type !== "stageMatchLoser" &&
        type !== "stageMatchWinner" &&
        type !== "matchLoser" &&
        type !== "matchWinner"
      ) {
        return null;
      }
      const round = Number(source?.ref?.round);
      const order = Number(source?.ref?.order);
      if (!Number.isFinite(round) || !Number.isFinite(order)) return null;
      return { round, order, isLoser: type.toLowerCase().includes("loser") };
    })
    .filter(Boolean) as { round: number; order: number; isLoser: boolean }[];
}

type Node = {
  key: string;
  seed: any;
  x: number;
  y: number;
  centerY: number;
};

function buildLayout(rounds: Round[]) {
  const positionsByKey = new Map<string, Node>();
  const columns: {
    title: string;
    x: number;
    roundIndex: number;
    nodes: Node[];
  }[] = [];
  const connectors: {
    key: string;
    d: string;
    isLoser: boolean;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    fromColor: string;
    toColor: string;
  }[] = [];
  let maxBottom = HEADER_H + CARD_H;

  (rounds || []).forEach((round, roundIndex) => {
    const x = roundIndex * (CARD_W + COL_GAP);
    const seeds = Array.isArray(round?.seeds) ? round.seeds : [];
    const nodes: Node[] = seeds.map((seed: any, seedIndex: number) => {
      const key = seedKeyOf(seed, roundIndex + 1, seedIndex);
      let centerY = HEADER_H + seedIndex * (CARD_H + ROW_GAP) + CARD_H / 2;

      if (roundIndex > 0) {
        const centers = sourceRefsOf(seed)
          .map((ref) => positionsByKey.get(`${ref.round}:${ref.order}`)?.centerY)
          .filter((v) => Number.isFinite(v)) as number[];
        if (centers.length) {
          centerY = centers.reduce((s, v) => s + v, 0) / centers.length;
        }
      }

      const y = Math.max(HEADER_H, centerY - CARD_H / 2);
      const node: Node = {
        key: key || `${roundIndex + 1}:${seedIndex}`,
        seed,
        x,
        y,
        centerY: y + CARD_H / 2,
      };
      if (key) positionsByKey.set(key, node);
      maxBottom = Math.max(maxBottom, y + CARD_H);
      return node;
    });

    columns.push({
      title: round?.title || "",
      x,
      roundIndex,
      nodes,
    });
  });

  columns.forEach((column, roundIndex) => {
    if (roundIndex === 0) return;
    column.nodes.forEach((target) => {
      sourceRefsOf(target.seed).forEach((ref) => {
        const source = positionsByKey.get(`${ref.round}:${ref.order}`);
        if (!source) return;
        const startX = source.x + CARD_W - SEED_PAD_X;
        const endX = target.x + SEED_PAD_X;
        const midX = (startX + endX) / 2;
        const d = `M ${startX} ${source.centerY} C ${midX} ${source.centerY}, ${midX} ${target.centerY}, ${endX} ${target.centerY}`;
        connectors.push({
          key: `${source.key}->${target.key}`,
          d,
          isLoser: !!ref.isLoser,
          x1: startX,
          y1: source.centerY,
          x2: endX,
          y2: target.centerY,
          fromColor: accentForIndex(roundIndex - 1),
          toColor: accentForIndex(roundIndex),
        });
      });
    });
  });

  return {
    columns,
    connectors,
    width:
      Math.max(1, columns.length) * CARD_W +
      Math.max(0, columns.length - 1) * COL_GAP,
    height: maxBottom + ROW_GAP,
  };
}

export default function ModernRoundElimBracketRN({
  rounds,
  onOpenMatch,
  championMatchId,
  resolveSideLabel,
  baseRoundStart = 1,
  isDark,
  zoom = 1,
}: {
  rounds: Round[];
  onOpenMatch?: (m: any) => void;
  championMatchId?: string | number | null;
  resolveSideLabel?: ResolveSideLabel;
  baseRoundStart?: number;
  isDark: boolean;
  zoom?: number;
}) {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const layout = useMemo(() => buildLayout(rounds || []), [rounds]);
  const hasLoserEdge = layout.connectors.some((c) => c.isLoser);

  if (!rounds?.length) {
    return (
      <View style={{ padding: 20, alignItems: "center" }}>
        <Text style={{ color: isDark ? "#94a3b8" : "#64748b" }}>
          Chưa có dữ liệu.
        </Text>
      </View>
    );
  }

  const loserColor = "#f59e0b";

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator
      contentContainerStyle={{
        paddingHorizontal: 8,
        paddingVertical: 8,
      }}
    >
      <View
        style={{
          width: Math.ceil((layout.width + 24) * safeZoom),
          height: Math.ceil((layout.height + 24) * safeZoom),
        }}
      >
      <View
        style={{
          width: layout.width + 24,
          minHeight: layout.height + 24,
          position: "relative",
          transform: [{ scale: safeZoom }],
          transformOrigin: "top left",
        }}
      >
        {/* Background subtle pattern */}
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            {
              backgroundColor: isDark
                ? "rgba(59,130,246,0.03)"
                : "rgba(59,130,246,0.025)",
              borderRadius: 12,
            },
          ]}
        />

        {/* connectors */}
        <Svg
          width={layout.width}
          height={layout.height}
          style={{ position: "absolute", left: 0, top: 0 }}
          pointerEvents="none"
        >
          <Defs>
            {layout.connectors
              .filter((c) => !c.isLoser)
              .map((c) => (
                <LinearGradient
                  key={`g-${c.key}`}
                  id={`re-grad-${c.key.replace(/[^a-zA-Z0-9]/g, "_")}`}
                  x1={c.x1}
                  y1={c.y1}
                  x2={c.x2}
                  y2={c.y2}
                  gradientUnits="userSpaceOnUse"
                >
                  <Stop
                    offset="0%"
                    stopColor={c.fromColor}
                    stopOpacity={0.55}
                  />
                  <Stop
                    offset="100%"
                    stopColor={c.toColor}
                    stopOpacity={0.85}
                  />
                </LinearGradient>
              ))}
          </Defs>
          {layout.connectors.map((c) => (
            <Path
              key={c.key}
              d={c.d}
              stroke={
                c.isLoser
                  ? loserColor
                  : `url(#re-grad-${c.key.replace(/[^a-zA-Z0-9]/g, "_")})`
              }
              strokeOpacity={c.isLoser ? 0.7 : 1}
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeDasharray={c.isLoser ? "6 5" : ""}
              fill="none"
            />
          ))}
        </Svg>

        {/* round headers */}
        {layout.columns.map((col) => (
          <View
            key={`h-${col.roundIndex}`}
            style={{
              position: "absolute",
              left: col.x,
              top: 4,
              width: CARD_W,
              alignItems: "center",
              zIndex: 2,
            }}
          >
            <ModernRoundChip
              title={col.title || `Vòng ${col.roundIndex + 1}`}
              count={col.nodes.length}
              accent={accentForIndex(col.roundIndex)}
              isFinal={false}
            />
          </View>
        ))}

        {/* Legend */}
        {hasLoserEdge && (
          <View
            style={[
              styles.legend,
              {
                backgroundColor: isDark
                  ? "rgba(22,24,28,0.85)"
                  : "rgba(255,255,255,0.9)",
                borderColor: isDark
                  ? "rgba(255,255,255,0.15)"
                  : "rgba(15,23,42,0.1)",
              },
            ]}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <View
                style={{
                  width: 16,
                  height: 2,
                  backgroundColor: rgba("#3b82f6", 0.7),
                }}
              />
              <Text
                style={{
                  fontSize: 10,
                  color: isDark ? "#cbd5e1" : "#64748b",
                }}
              >
                Thắng đi tiếp
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <View
                style={{
                  width: 16,
                  height: 2,
                  backgroundColor: "transparent",
                  borderTopWidth: 2,
                  borderTopColor: loserColor,
                  borderStyle: "dashed",
                }}
              />
              <Text
                style={{
                  fontSize: 10,
                  color: isDark ? "#cbd5e1" : "#64748b",
                }}
              >
                Thua xuống nhánh
              </Text>
            </View>
          </View>
        )}

        {/* seed cards */}
        {layout.columns.map((col) =>
          col.nodes.map((node) => (
            <View
              key={node.key}
              style={{
                position: "absolute",
                left: node.x,
                top: node.y,
                width: CARD_W,
                zIndex: 1,
              }}
            >
              <ModernSeedCard
                seed={node.seed}
                onOpenMatch={onOpenMatch}
                championMatchId={championMatchId}
                resolveSideLabel={resolveSideLabel}
                baseRoundStart={baseRoundStart}
                accent={accentForIndex(col.roundIndex)}
                isDark={isDark}
                cardWidth={CARD_W}
                nodeKey={node.key}
              />
            </View>
          )),
        )}
      </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  legend: {
    position: "absolute",
    right: 8,
    top: 8,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    zIndex: 3,
  },
});
