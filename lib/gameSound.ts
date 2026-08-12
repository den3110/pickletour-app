// Standalone game sound — không phụ thuộc pokerSounds nữa (require @/ alias
// hay lỗi trong OTA bundle). Dùng relative require + verbose error log +
// fallback remote URL.
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";

export type SoundKind =
  | "chip"
  | "deal"
  | "fold"
  | "check"
  | "call"
  | "raise"
  | "allin"
  | "win"
  | "lose"
  | "warning";

const PRESET: Record<SoundKind, { vol: number; rate: number }> = {
  chip: { vol: 0.55, rate: 1.4 },
  deal: { vol: 0.42, rate: 1.0 },
  fold: { vol: 0.35, rate: 0.7 },
  check: { vol: 0.32, rate: 1.05 },
  call: { vol: 0.55, rate: 1.15 },
  raise: { vol: 0.75, rate: 0.9 },
  allin: { vol: 0.9, rate: 0.75 },
  win: { vol: 0.85, rate: 1.3 },
  lose: { vol: 0.4, rate: 0.7 },
  warning: { vol: 0.5, rate: 1.6 },
};

// URL fallback nếu bundled asset không load được (VD sau khi OTA). File này
// phải được host tại backend hoặc CDN — pickletour.vn/uploads/sfx/click.mp3.
// (Nếu backend chưa serve, sẽ silent fail lần đầu, thử lại lần sau.)
const REMOTE_FALLBACK_URL = "https://pickletour.vn/uploads/sfx/click.mp3";

let pool: any[] = [];
let poolIdx = 0;
let ready = false;
let readyPromise: Promise<void> | null = null;
let debugLogged = false;
const POOL_SIZE = 4;

function log(...args: any[]) {
  try {
    // eslint-disable-next-line no-console
    console.log("[gameSound]", ...args);
  } catch {}
}

async function ensureReady() {
  if (ready) return;
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    try {
      await setAudioModeAsync({
        allowsRecording: false,
        interruptionMode: "mixWithOthers",
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
      } as any);
      // Bundled mp3 — require relative để tránh @/ alias không resolve
      // trong OTA bundle. Nếu asset không có → fallback remote.
      let source: any = null;
      try {
        source = require("../assets/sfx/click4.mp3");
      } catch (err) {
        log("bundled asset FAILED, using remote fallback:", err);
        source = { uri: REMOTE_FALLBACK_URL };
      }
      for (let i = 0; i < POOL_SIZE; i++) {
        try {
          const p = createAudioPlayer(source, {
            keepAudioSessionActive: true,
          } as any);
          p.loop = false;
          p.volume = 0.5;
          pool.push(p);
        } catch (err) {
          log("createAudioPlayer failed:", err);
        }
      }
      if (pool.length === 0) {
        // Retry với remote URL
        try {
          for (let i = 0; i < POOL_SIZE; i++) {
            const p = createAudioPlayer({ uri: REMOTE_FALLBACK_URL } as any, {
              keepAudioSessionActive: true,
            } as any);
            p.loop = false;
            pool.push(p);
          }
        } catch (err) {
          log("remote fallback also failed:", err);
        }
      }
      ready = pool.length > 0;
      if (!debugLogged) {
        log(
          "audio init:",
          ready ? "OK" : "FAILED",
          "pool size:",
          pool.length,
        );
        debugLogged = true;
      }
    } catch (err) {
      log("ensureReady error:", err);
    }
  })();
  return readyPromise;
}

export function playSound(kind: SoundKind) {
  ensureReady().then(() => {
    if (!ready || !pool.length) return;
    try {
      const p = pool[poolIdx];
      poolIdx = (poolIdx + 1) % pool.length;
      const cfg = PRESET[kind];
      p.volume = cfg.vol;
      if (typeof p.setPlaybackRate === "function") {
        p.setPlaybackRate(cfg.rate).catch?.(() => {});
      } else if ("playbackRate" in p) {
        p.playbackRate = cfg.rate;
      }
      p.seekTo?.(0);
      p.play?.();
    } catch (err) {
      log("playSound error:", err);
    }
  });
}

export function warmupSounds() {
  ensureReady().catch(() => {});
}

// Phát 1 mp3 từ URL bên ngoài (VD sound mới bổ sung qua backend).
const remoteCache = new Map<string, any>();
export async function playRemoteSound(url: string, volume = 0.6) {
  try {
    await setAudioModeAsync({
      allowsRecording: false,
      interruptionMode: "mixWithOthers",
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
    } as any);
    let p = remoteCache.get(url);
    if (!p) {
      p = createAudioPlayer({ uri: url } as any, {
        keepAudioSessionActive: true,
      } as any);
      p.loop = false;
      remoteCache.set(url, p);
    }
    p.volume = volume;
    p.seekTo?.(0);
    p.play?.();
  } catch (err) {
    log("playRemoteSound error:", err);
  }
}
