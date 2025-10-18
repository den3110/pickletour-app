// hooks/usePlatform.ts
import { useCallback, useMemo } from "react";
import { Platform } from "react-native";

type OS = "ios" | "android" | "web";

export function usePlatform() {
  const os = Platform.OS as OS;
  const version = Platform.Version;

  const isIOS = os === "ios";
  const isAndroid = os === "android";
  const isWeb = os === "web";

  // Giống Platform.select nhưng dùng được trong JSX dễ hơn
  const select = useCallback(<T>(map: Partial<Record<OS | "default", T>>) => {
    return (Platform.select(map as any) as T) ?? (map.default as T);
  }, []);

  return useMemo(
    () => ({ os, version, isIOS, isAndroid, isWeb, select }),
    [os, version, isIOS, isAndroid, isWeb, select]
  );
}
