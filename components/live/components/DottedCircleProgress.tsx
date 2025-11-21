// DottedCircleProgress.tsx - Simple version
import React, { useMemo } from "react";
import { View } from "react-native";

type Props = {
  progress: number;
  size?: number;
  dotSize?: number;
  count?: number;
  color?: string;
  trackColor?: string;
};

// ✅ Version đơn giản, không dùng reanimated
const Dot = React.memo(
  ({
    cx,
    cy,
    dotSize,
    isActive,
    color,
    trackColor,
  }: {
    cx: number;
    cy: number;
    dotSize: number;
    isActive: boolean;
    color: string;
    trackColor: string;
  }) => {
    return (
      <View
        style={{
          position: "absolute",
          left: cx,
          top: cy,
          width: dotSize,
          height: dotSize,
          borderRadius: dotSize / 2,
          backgroundColor: isActive ? color : trackColor,
        }}
      />
    );
  },
  (prev, next) => prev.isActive === next.isActive
);

function DottedCircleProgress({
  progress,
  size = 140,
  dotSize = 8,
  count = 30,
  color = "#fff",
  trackColor = "rgba(255,255,255,0.2)",
}: Props) {
  const dots = useMemo(() => {
    const N = Math.max(6, count);
    const R = size / 2 - dotSize - 2;
    return Array.from({ length: N }).map((_, i) => {
      const t = (i / N) * Math.PI * 2 - Math.PI / 2;
      const cx = size / 2 + R * Math.cos(t) - dotSize / 2;
      const cy = size / 2 + R * Math.sin(t) - dotSize / 2;
      return { cx, cy, id: `dot-${i}` };
    });
  }, [size, dotSize, count]);

  const roundedProgress = useMemo(
    () => Math.round(progress * 100) / 100,
    [progress]
  );

  const lit = Math.round(
    Math.max(0, Math.min(1, roundedProgress)) * dots.length
  );

  return (
    <View style={{ width: size, height: size }}>
      {dots.map((p, i) => (
        <Dot
          key={p.id}
          cx={p.cx}
          cy={p.cy}
          dotSize={dotSize}
          isActive={i < lit}
          color={color}
          trackColor={trackColor}
        />
      ))}
    </View>
  );
}

export default React.memo(
  DottedCircleProgress,
  (prev, next) =>
    Math.abs(prev.progress - next.progress) < 0.01 &&
    prev.size === next.size &&
    prev.dotSize === next.dotSize &&
    prev.count === next.count
);
