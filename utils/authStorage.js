import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const KEY = "userInfo";

export async function saveUserInfo(obj) {
  const v = JSON.stringify(obj ?? null);
  if (Platform.OS === "web") return AsyncStorage.setItem(KEY, v);
  return SecureStore.setItemAsync(KEY, v);
}

export async function loadUserInfo() {
  const raw =
    Platform.OS === "web"
      ? await AsyncStorage.getItem(KEY)
      : await SecureStore.getItemAsync(KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function clearUserInfo() {
  if (Platform.OS === "web") return AsyncStorage.removeItem(KEY);
  return SecureStore.deleteItemAsync(KEY);
}
