// Shared game sound cho tất cả bàn (Poker/Phỏm/Sâm/Caro/Chess/Xiangqi).
// Layer trên pokerSounds (đã bundled với @/assets/sfx/click4.mp3). Nếu cần
// bổ sung sound riêng qua OTA thì load remote URL bằng loadRemoteSound.
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { playSound as _play, warmupSounds as _warmup } from "@/app/poker/pokerSounds";

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

export function playSound(kind: SoundKind) {
  try {
    _play(kind as any);
  } catch {}
}

export function warmupSounds() {
  try {
    _warmup();
  } catch {}
}

// Cache remote sounds theo url (dùng khi muốn phát 1 mp3 online, VD sound
// mới nhưng chưa rebuild app).
const remoteCache = new Map<string, any>();
let remoteReady = false;
async function ensureRemoteReady() {
  if (remoteReady) return;
  try {
    await setAudioModeAsync({
      allowsRecording: false,
      interruptionMode: "mixWithOthers",
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
    } as any);
    remoteReady = true;
  } catch {}
}

// Phát 1 mp3 từ URL (VD https://pickletour.vn/sfx/win.mp3).
// Player được cache để lần sau nhanh.
export async function playRemoteSound(url: string, volume = 0.6) {
  try {
    await ensureRemoteReady();
    let p = remoteCache.get(url);
    if (!p) {
      p = createAudioPlayer({ uri: url } as any, {
        keepAudioSessionActive: true,
      });
      p.loop = false;
      remoteCache.set(url, p);
    }
    p.volume = volume;
    p.seekTo?.(0);
    p.play?.();
  } catch {}
}
