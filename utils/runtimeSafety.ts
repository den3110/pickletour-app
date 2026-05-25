import { Platform } from "react-native";
import * as Device from "expo-device";

export const IS_ANDROID_EMULATOR =
  Platform.OS === "android" && Device.isDevice === false;

export const SHOULD_RENDER_NATIVE_LOTTIE = !IS_ANDROID_EMULATOR;
