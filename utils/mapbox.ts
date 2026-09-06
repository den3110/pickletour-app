// utils/mapbox.ts — nạp Mapbox an toàn (không có trong Expo Go)
import Constants from "expo-constants";

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;
const isExpoGo = Constants.appOwnership === "expo";

let MapboxGL: any = null;
if (!isExpoGo) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@rnmapbox/maps");
    MapboxGL = mod.default ?? mod;
    MapboxGL.setAccessToken(MAPBOX_TOKEN || "");
  } catch (e) {
    if (__DEV__) console.warn("Mapbox not available:", e);
  }
}

export const mapboxAvailable = !!MapboxGL;
export default MapboxGL;
