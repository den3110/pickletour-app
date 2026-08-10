// Poker FX helper: haptic + optional audio.
// Dùng expo-haptics (native module đã có sẵn trong binary) — không cần
// bundle mp3 assets nên OTA-safe. Nếu sau này add asset audio, load thêm
// ở đây (require('@/assets/sounds/x.mp3')).
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

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
