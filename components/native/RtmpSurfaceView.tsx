// src/components/native/RtmpSurfaceView.tsx
import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { requireNativeComponent, UIManager, findNodeHandle, ViewProps, Platform } from 'react-native';

type Props = ViewProps & {
  facing?: 'front' | 'back';
  autoPreview?: boolean;
};

export type RtmpSurfaceViewHandle = {
  startPreview(): void;
  stopPreview(): void;
  startStream(url: string, w?: number, h?: number, fps?: number, br?: number): void;
  stopStream(): void;
  switchCamera(): void;
};

const Native = requireNativeComponent<Props>('RtmpSurfaceView');

export default forwardRef<RtmpSurfaceViewHandle, Props>(function RtmpSurfaceView(props, ref) {
  const innerRef = useRef(null);

  const getCommands = () =>
    (UIManager.getViewManagerConfig?.('RtmpSurfaceView')?.Commands) ||
    { startPreview: 1, stopPreview: 2, startStream: 3, stopStream: 4, switchCamera: 5 };

  const dispatch = (cmd: string | number, args: any[] = []) => {
    const tag = findNodeHandle(innerRef.current);
    if (!tag) return;
    if (typeof cmd === 'string') {
      // New arch
      // @ts-ignore
      UIManager.dispatchViewManagerCommand(tag, cmd, args);
    } else {
      // Old arch
      // @ts-ignore
      UIManager.dispatchViewManagerCommand(tag, cmd, args);
    }
  };

  useImperativeHandle(ref, () => ({
    startPreview() {
      const c = getCommands();
      dispatch(c.startPreview ?? 'startPreview');
    },
    stopPreview() {
      const c = getCommands();
      dispatch(c.stopPreview ?? 'stopPreview');
    },
    startStream(url, w = 1280, h = 720, fps = 30, br = 2_500_000) {
      const c = getCommands();
      dispatch(c.startStream ?? 'startStream', [url, w, h, fps, br]);
    },
    stopStream() {
      const c = getCommands();
      dispatch(c.stopStream ?? 'stopStream');
    },
    switchCamera() {
      const c = getCommands();
      dispatch(c.switchCamera ?? 'switchCamera');
    },
  }));

  return <Native ref={innerRef} {...props} />;
});
