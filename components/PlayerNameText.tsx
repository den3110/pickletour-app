// components/PlayerNameText.tsx
// Render tên VĐV có "hiệu ứng tên" (màu / gradient / cầu vồng) do admin cấu hình.
//  - none  -> <Text>
//  - solid -> <Text style={{ color }}>
//  - gradient -> vẽ bằng react-native-svg (SvgText + LinearGradient)
// Không cần @react-native-masked-view -> OTA được (react-native-svg đã có sẵn trong build).
import React, { useMemo, useState } from "react";
import { Text, View, StyleSheet } from "react-native";
import Svg, {
  Text as SvgText,
  Defs,
  LinearGradient,
  Stop,
} from "react-native-svg";
import { useGetNameStylesQuery } from "../slices/nameStyleApiSlice";
import { resolveNameStyle, angleToSvgVector } from "../utils/nameStyle";
import { getPlayerDisplayName } from "../utils/matchDisplay";

let _gidSeq = 0;

function GradientName({
  text,
  textStyle,
  colors,
  angle,
  bold,
  numberOfLines,
}: any) {
  const [m, setM] = useState<{ w: number; h: number } | null>(null);
  const gid = useMemo(() => `pkgrad_${++_gidSeq}`, []);

  const flat: any = StyleSheet.flatten(textStyle) || {};
  const fontSize = Number(flat.fontSize) || 14;
  const fontWeight = String(bold ? "800" : flat.fontWeight || "600");
  const fontStyle = flat.fontStyle;
  const fontFamily = flat.fontFamily;
  // màu đại diện hiển thị trong lúc chờ đo (không bao giờ để trống/vô hình)
  const repColor = colors[Math.floor(colors.length / 2)] || colors[0];
  const { x1, y1, x2, y2 } = angleToSvgVector(angle);

  return (
    <View style={{ alignSelf: "flex-start" }}>
      <Text
        style={[textStyle, { color: repColor, opacity: m ? 0 : 1 }, bold ? { fontWeight: "800" } : null]}
        numberOfLines={numberOfLines || 1}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          if (
            width > 0 &&
            height > 0 &&
            (!m || Math.abs(m.w - width) > 0.5 || Math.abs(m.h - height) > 0.5)
          ) {
            setM({ w: width, h: height });
          }
        }}
      >
        {text}
      </Text>

      {m ? (
        <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0 }}>
          <Svg width={Math.ceil(m.w) + 2} height={Math.ceil(m.h)}>
            <Defs>
              <LinearGradient id={gid} x1={x1} y1={y1} x2={x2} y2={y2}>
                {colors.map((c: string, i: number) => (
                  <Stop
                    key={i}
                    offset={colors.length === 1 ? 0 : i / (colors.length - 1)}
                    stopColor={c}
                    stopOpacity={1}
                  />
                ))}
              </LinearGradient>
            </Defs>
            <SvgText
              fill={`url(#${gid})`}
              x={0}
              y={m.h / 2}
              fontSize={fontSize}
              fontWeight={fontWeight}
              fontStyle={fontStyle}
              fontFamily={fontFamily}
              textAnchor="start"
              alignmentBaseline="central"
            >
              {text}
            </SvgText>
          </Svg>
        </View>
      ) : null}
    </View>
  );
}

export default function PlayerNameText({
  user,
  player,
  name,
  nickname,
  source,
  mode,
  style,
  numberOfLines,
  ...rest
}: any) {
  const { data: map } = useGetNameStylesQuery(undefined, {
    refetchOnMountOrArgChange: false,
  });

  const target = user || player || null;

  // 1) Chuỗi tên
  let text = name;
  if (text == null) {
    if (target) {
      const src = source || (mode ? { nameDisplayMode: mode } : undefined);
      text = getPlayerDisplayName(target, src) || nickname || "";
    } else {
      text = nickname || "";
    }
  }

  // 2) Hiệu ứng
  const ns = useMemo(
    () => resolveNameStyle(map, target, { nickname: nickname || name }),
    [map, target, nickname, name],
  );

  if (!ns) {
    return (
      <Text style={style} numberOfLines={numberOfLines} {...rest}>
        {text}
      </Text>
    );
  }

  if (ns.effect === "solid") {
    return (
      <Text
        style={[style, { color: ns.color }, ns.bold ? { fontWeight: "800" } : null]}
        numberOfLines={numberOfLines}
        {...rest}
      >
        {text}
      </Text>
    );
  }

  // gradient
  return (
    <GradientName
      text={text}
      textStyle={style}
      colors={ns.colors}
      angle={ns.angle}
      bold={ns.bold}
      numberOfLines={numberOfLines}
    />
  );
}
