import { DeviceEventEmitter } from "react-native";
import * as SecureStore from "expo-secure-store";

const PREF_TOURNAMENT_CONSOLE_ENABLED = "PREF_TOURNAMENT_CONSOLE_ENABLED";

export const TOURNAMENT_CONSOLE_PREF_EVENT =
  "tournament-console-pref:changed";

export async function getTournamentConsoleEnabled() {
  return (
    (await SecureStore.getItemAsync(PREF_TOURNAMENT_CONSOLE_ENABLED)) === "1"
  );
}

export async function setTournamentConsoleEnabled(enabled: boolean) {
  await SecureStore.setItemAsync(
    PREF_TOURNAMENT_CONSOLE_ENABLED,
    enabled ? "1" : "0",
  );
  DeviceEventEmitter.emit(TOURNAMENT_CONSOLE_PREF_EVENT, enabled);
}
