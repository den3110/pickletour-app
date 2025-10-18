import { NativeModules } from "react-native";
const { FacebookLiveModule } = NativeModules;

/**
 * Giữ API cũ cho UI: start({ url, width, height, fps, bitrateKbps })
 * nhưng map sang native mới: start(url, bitrate(bps), width, height, fps)
 */
export const FacebookLive = {
  start: (opts: {
    url: string;
    width?: number;
    height?: number;
    fps?: number;
    bitrateKbps?: number;
  }) => {
    const width  = opts.width  ?? 1280;
    const height = opts.height ?? 720;
    const fps    = opts.fps    ?? 30;
    const bitrate = (opts.bitrateKbps ?? 3800) * 1000; // chuyển Kbps -> bps
    return FacebookLiveModule.start(opts.url, bitrate, width, height, fps);
  },

  stop: () => FacebookLiveModule.stop(),
  switchCamera: () => FacebookLiveModule.switchCamera(),

  // Nếu cần đổi bitrate lúc đang live:
  setBitrateKbps: (kbps: number) =>
    FacebookLiveModule.setVideoBitrateOnFly(kbps * 1000),
};
