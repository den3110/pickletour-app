// components/RangeSlider.tsx
// Thanh kéo chọn khoảng (2 nút) tự dựng bằng PanResponder — không cần lib native, OTA được.
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  PanResponder,
  LayoutChangeEvent,
  StyleSheet,
} from "react-native";

type Props = {
  min: number;
  max: number;
  step?: number;
  values: [number, number];
  onChange?: (v: [number, number]) => void; // kéo (live)
  onCommit?: (v: [number, number]) => void; // thả tay
  trackColor?: string;
  activeColor?: string;
  thumbColor?: string;
  thumbBorder?: string;
};

const THUMB = 26;

export default function RangeSlider({
  min,
  max,
  step = 0.1,
  values,
  onChange,
  onCommit,
  trackColor = "#3a3f4b",
  activeColor = "#3E9EFB",
  thumbColor = "#ffffff",
  thumbBorder = "#3E9EFB",
}: Props) {
  const [width, setWidth] = useState(0);
  const [lo, setLo] = useState(values[0]);
  const [hi, setHi] = useState(values[1]);

  // refs để handler (tạo 1 lần) luôn đọc giá trị mới nhất
  const loRef = useRef(lo);
  const hiRef = useRef(hi);
  const widthRef = useRef(width);
  const draggingRef = useRef(false);
  loRef.current = lo;
  hiRef.current = hi;
  widthRef.current = width;

  const onChangeRef = useRef(onChange);
  const onCommitRef = useRef(onCommit);
  onChangeRef.current = onChange;
  onCommitRef.current = onCommit;

  // đồng bộ khi props đổi từ ngoài (khi không kéo)
  useEffect(() => {
    if (draggingRef.current) return;
    setLo(values[0]);
    setHi(values[1]);
  }, [values[0], values[1]]);

  const usable = () => Math.max(1, widthRef.current - THUMB);
  const span = max - min || 1;

  const snap = (v: number) => {
    const s = Math.round((v - min) / step) * step + min;
    return Math.min(max, Math.max(min, Math.round(s * 1000) / 1000));
  };
  const valToX = (v: number) => ((v - min) / span) * Math.max(1, width - THUMB);
  const xToVal = (x: number) => snap(min + (x / usable()) * span);

  const startXRef = useRef(0);

  const loResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        draggingRef.current = true;
        startXRef.current = ((loRef.current - min) / span) * usable();
      },
      onPanResponderMove: (_e, g) => {
        const nv = Math.min(hiRef.current, xToVal(startXRef.current + g.dx));
        setLo(nv);
        onChangeRef.current?.([nv, hiRef.current]);
      },
      onPanResponderRelease: () => {
        draggingRef.current = false;
        onCommitRef.current?.([loRef.current, hiRef.current]);
      },
      onPanResponderTerminate: () => {
        draggingRef.current = false;
        onCommitRef.current?.([loRef.current, hiRef.current]);
      },
    }),
  ).current;

  const hiResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        draggingRef.current = true;
        startXRef.current = ((hiRef.current - min) / span) * usable();
      },
      onPanResponderMove: (_e, g) => {
        const nv = Math.max(loRef.current, xToVal(startXRef.current + g.dx));
        setHi(nv);
        onChangeRef.current?.([loRef.current, nv]);
      },
      onPanResponderRelease: () => {
        draggingRef.current = false;
        onCommitRef.current?.([loRef.current, hiRef.current]);
      },
      onPanResponderTerminate: () => {
        draggingRef.current = false;
        onCommitRef.current?.([loRef.current, hiRef.current]);
      },
    }),
  ).current;

  const onLayout = (e: LayoutChangeEvent) =>
    setWidth(e.nativeEvent.layout.width);

  const loX = valToX(lo);
  const hiX = valToX(hi);

  return (
    <View style={styles.wrap} onLayout={onLayout}>
      <View style={[styles.track, { backgroundColor: trackColor }]} />
      <View
        style={[
          styles.track,
          {
            backgroundColor: activeColor,
            left: loX + THUMB / 2,
            right: undefined,
            width: Math.max(0, hiX - loX),
          },
        ]}
      />
      <View
        {...loResponder.panHandlers}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={[
          styles.thumb,
          { left: loX, borderColor: thumbBorder, backgroundColor: thumbColor },
        ]}
      />
      <View
        {...hiResponder.panHandlers}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={[
          styles.thumb,
          { left: hiX, borderColor: thumbBorder, backgroundColor: thumbColor },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: THUMB + 8, justifyContent: "center" },
  track: {
    position: "absolute",
    left: THUMB / 2,
    right: THUMB / 2,
    height: 4,
    borderRadius: 2,
  },
  thumb: {
    position: "absolute",
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    borderWidth: 3,
    top: 4,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
});
