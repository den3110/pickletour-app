import React, { forwardRef, useImperativeHandle, useRef } from "react";
import { requireNativeComponent, findNodeHandle, ViewStyle } from "react-native";

type Props = { style?: ViewStyle };

const NativeSurface = requireNativeComponent<Props>("RtmpSurfaceView");

export type CameraViewHandle = { getTag: () => number | null };

export default forwardRef<CameraViewHandle, Props>((props, ref) => {
  const innerRef = useRef<any>(null);
  useImperativeHandle(ref, () => ({
    getTag: () => {
      const tag = findNodeHandle(innerRef.current);
      return typeof tag === "number" ? tag : null;
    },
  }));
  return <NativeSurface ref={innerRef} {...props} />;
});
