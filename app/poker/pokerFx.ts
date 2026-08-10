// Poker FX helper: haptic + audio.
// Haptic: expo-haptics (native, có sẵn trong binary).
// Sound: expo-audio wrapper qua pokerSounds — dùng click4.mp3 với volume/rate
// khác nhau cho từng action (OTA-safe vì require asset static).
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import { playSound } from "./pokerSounds";

export type FxKind =
  | "chip"
  | "deal"
  | "fold"
  | "check"
  | "call"
  | "raise"
  | "allin"
  | "win"
  | "lose"
  | "tick"
  | "warning";

export function playFx(kind: FxKind) {
  // Sound
  try {
    if (kind !== "tick") {
      playSound(kind as any);
    }
  } catch {}
  // Haptic
  try {
    switch (kind) {
      case "chip":
      case "call":
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
      case "deal":
        Haptics.selectionAsync();
        break;
      case "fold":
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
        break;
      case "check":
        Haptics.selectionAsync();
        break;
      case "raise":
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      case "allin":
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        break;
      case "win":
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case "lose":
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        break;
      case "tick":
        if (Platform.OS === "ios")
          Haptics.selectionAsync();
        break;
      case "warning":
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        break;
    }
  } catch {}
}
