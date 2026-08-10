// Poker audio layer. Dùng expo-audio với duy nhất 1 file MP3 sẵn có
// (assets/sfx/click4.mp3) — mỗi hành động có volume + rate khác nhau để
// phân biệt. Sau này có thể bổ sung các file .mp3 riêng cho chip, cardShuffle,
// win… vào assets/sfx/ và map ở đây (OTA-safe vì require() static).
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";

type Kind =
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

// Preset {volume, rate} — rate < 1 = trầm hơn (raise), > 1 = cao hơn (chip).
const PRESET: Record<Kind, { vol: number; rate: number }> = {
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

let pool: any[] = [];
let poolIdx = 0;
let ready = false;
const POOL_SIZE = 4; // round-robin để trigger nhanh liên tiếp

async function ensureReady() {
  if (ready) return;
  try {
    await setAudioModeAsync({
      allowsRecording: false,
      interruptionMode: "mixWithOthers",
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
    } as any);
    for (let i = 0; i < POOL_SIZE; i++) {
      const p = createAudioPlayer(
        require("@/assets/sfx/click4.mp3"),
        { keepAudioSessionActive: true },
      );
      p.loop = false;
      p.volume = 0.5;
      pool.push(p);
    }
    ready = true;
  } catch (err) {
    // Silent fail — game vẫn chơi được không có sound.
  }
}

export function playSound(kind: Kind) {
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
    } catch {}
  });
}

// Preload — gọi 1 lần khi vào bàn để giảm delay lần đầu.
export function warmupSounds() {
  ensureReady().catch(() => {});
}
