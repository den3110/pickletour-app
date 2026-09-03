/* eslint-disable react/prop-types */
// ModernKnockoutBracketRN.tsx
// Bản v4 knockout mobile — layout linear L→R với card đẹp, connector bezier gradient.
// KHÔNG đụng logic; chỉ layer hiển thị.

import React, { useMemo, useState, useCallback } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
} from "react-native";
import { Text } from "@/components/ui/i18nText";
import Svg, { Path, Defs, LinearGradient, Stop } from "react-native-svg";

import {
  ModernSeedCard,
  ModernRoundChip,
  MODERN_CARD_W,
  MODERN_CARD_MIN_H,
  accentForRound,
  rgba,
  type ResolveSideLabel,
} from "./ModernBracketShared";

const CARD_W = MODERN_CARD_W;
const CARD_H = MODERN_CARD_MIN_H;
const ROW_GAP = 24;
const COL_GAP = 44;
const HEADER_H = 44;
const PAD_TOP = 8;

type Seed = any;
type Round = { title?: string; seeds: Seed[] };

export default function ModernKnockoutBracketRN({
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
  const [cardRects, setCardRects] = useState<
    Map<string, { x: number; y: number; w: number; h: number }>
  >(new Map());

  const totalCols = rounds?.length || 0;
  const totalPairs = useMemo(() => {
    if (!rounds?.length) return 1;
    return Math.max(1, ...rounds.map((r) => r?.seeds?.length || 0));
  }, [rounds]);

  const columnHeight = totalPairs * (CARD_H + ROW_GAP);
  const rootWidth =
    Math.max(1, totalCols) * CARD_W +
    Math.max(0, totalCols - 1) * COL_GAP +
    24;
  const rootHeight = columnHeight + HEADER_H + PAD_TOP + 24;

  const onCardLayout = useCallback(
    (key: string, x: number, y: number, w: number, h: number) => {
      setCardRects((prev) => {
        const cur = prev.get(key);
        if (
          cur &&
          Math.abs(cur.x - x) < 0.5 &&
          Math.abs(cur.y - y) < 0.5 &&
          Math.abs(cur.w - w) < 0.5 &&
          Math.abs(cur.h - h) < 0.5
        ) {
          return prev;
        }
        const next = new Map(prev);
        next.set(key, { x, y, w, h });
        return next;
      });
    },
    [],
  );

  // build connectors from cardRects
  const connectors = useMemo(() => {
    const out: {
      key: string;
      d: string;
      fromColor: string;
      toColor: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    }[] = [];
    if (!rounds?.length) return out;
    for (let ci = 0; ci < rounds.length - 1; ci++) {
      const seedsCur = rounds[ci]?.seeds || [];
      const seedsNext = rounds[ci + 1]?.seeds || [];
      for (let si = 0; si < seedsCur.length; si++) {
        if (seedsCur[si]?.__symmetricSpacer) continue;
        const targetIndex = Math.floor(si / 2);
        const targetSeed = seedsNext[targetIndex];
        if (!targetSeed || targetSeed.__symmetricSpacer) continue;
        const fromRect = cardRects.get(`c-${ci}-${si}`);
        const toRect = cardRects.get(`c-${ci + 1}-${targetIndex}`);
        if (!fromRect || !toRect) continue;
        const x1 = fromRect.x + fromRect.w;
        const y1 = fromRect.y + fromRect.h / 2;
        const x2 = toRect.x;
        const y2 = toRect.y + toRect.h / 2;
        const midX = (x1 + x2) / 2;
        const d = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
        out.push({
          key: `conn-${ci}-${si}`,
          d,
          fromColor: accentForRound(ci, totalCols),
          toColor: accentForRound(ci + 1, totalCols),
          x1,
          y1,
          x2,
          y2,
        });
      }
    }
    return out;
  }, [rounds, cardRects, totalCols]);

  if (!rounds?.length) {
    return (
      <View style={{ padding: 20, alignItems: "center" }}>
        <Text style={{ color: isDark ? "#94a3b8" : "#64748b" }}>
          Chưa có dữ liệu.
        </Text>
      </View>
    );
  }

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
          width: Math.ceil(rootWidth * safeZoom),
          height: Math.ceil(rootHeight * safeZoom),
        }}
      >
      <View
        style={{
          width: rootWidth,
          minHeight: rootHeight,
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

        {/* SVG connectors */}
        <Svg
          width={rootWidth}
          height={rootHeight}
          style={{ position: "absolute", left: 0, top: 0 }}
          pointerEvents="none"
        >
          <Defs>
            {connectors.map((c) => (
              <LinearGradient
                key={`g-${c.key}`}
                id={`grad-${c.key}`}
                x1={c.x1}
                y1={c.y1}
                x2={c.x2}
                y2={c.y2}
                gradientUnits="userSpaceOnUse"
              >
                <Stop offset="0%" stopColor={c.fromColor} stopOpacity={0.55} />
                <Stop offset="100%" stopColor={c.toColor} stopOpacity={0.85} />
              </LinearGradient>
            ))}
          </Defs>
          {connectors.map((c) => (
            <Path
              key={c.key}
              d={c.d}
              stroke={`url(#grad-${c.key})`}
              strokeWidth={2.2}
              strokeLinecap="round"
              fill="none"
            />
          ))}
        </Svg>

        {/* Columns */}
        <View style={{ flexDirection: "row", gap: COL_GAP }}>
          {rounds.map((round, ci) => {
            const seeds = round?.seeds || [];
            const accent = accentForRound(ci, totalCols);
            const isFinal = ci === totalCols - 1;
            return (
              <View key={`col-${ci}`} style={{ width: CARD_W }}>
                {/* Round header */}
                <View
                  style={{
                    height: HEADER_H,
                    alignItems: "center",
                    justifyContent: "center",
                    marginTop: PAD_TOP,
                  }}
                >
                  <ModernRoundChip
                    title={round?.title || `Vòng ${ci + 1}`}
                    count={seeds.length}
                    accent={accent}
                    isFinal={isFinal}
                  />
                </View>

                {/* Seeds container, distribute evenly */}
                <View
                  style={{
                    height: columnHeight,
                    justifyContent: "space-around",
                  }}
                >
                  {seeds.map((seed: any, si: number) => {
                    const key = `c-${ci}-${si}`;
                    if (seed?.__symmetricSpacer) {
                      return (
                        <View
                          key={String(seed?.id || key)}
                          style={{ minHeight: CARD_H, opacity: 0 }}
                          pointerEvents="none"
                        />
                      );
                    }
                    return (
                      <View
                        key={String(seed?.id || key)}
                        onLayout={(e) => {
                          const { x, y, width, height } = e.nativeEvent.layout;
                          // x/y here are relative to parent (the column View).
                          // Need to offset by column x to get root-relative:
                          const colX = ci * (CARD_W + COL_GAP);
                          onCardLayout(
                            key,
                            colX + x,
                            HEADER_H + PAD_TOP + y,
                            width,
                            height,
                          );
                        }}
                        style={{ alignItems: "center" }}
                      >
                        <ModernSeedCard
                          seed={seed}
                          onOpenMatch={onOpenMatch}
                          championMatchId={championMatchId}
                          resolveSideLabel={resolveSideLabel}
                          baseRoundStart={baseRoundStart}
                          accent={accent}
                          isDark={isDark}
                          cardWidth={CARD_W}
                          nodeKey={key}
                        />
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </View>
      </View>
      </View>
    </ScrollView>
  );
}
