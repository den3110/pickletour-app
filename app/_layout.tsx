import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { ActivityIndicator, View } from "react-native";
import "react-native-reanimated";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { useColorScheme } from "@/hooks/useColorScheme";
import { setCredentials } from "@/slices/authSlice";
import store from "@/store";
import { loadUserInfo } from "@/utils/authStorage";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Provider } from "react-redux";
import { SocketProvider } from "../context/SocketContext";

if (__DEV__) {
  // dùng đường dẫn từ file _layout.tsx tới file dev/reactotron

  require("./dev/reactotron");
  require("./dev/ws-logger");
}

function Boot({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      try {
        const cached = await loadUserInfo();
        if (cached) store.dispatch(setCredentials(cached));
      } finally {
        setReady(true);
      }
    })();
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }
  return <>{children}</>;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });
  if (!loaded) return null;

  return (
    <Provider store={store}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <BottomSheetModalProvider>
          <SocketProvider>
            <Boot>
              <SafeAreaProvider>
                <SafeAreaView
                  style={{ flex: 1 }}
                  edges={["top", "left", "right"]}
                >
                  <ThemeProvider
                    value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
                  >
                    <Stack>
                      <Stack.Screen
                        name="(tabs)"
                        options={{ headerShown: false }}
                      />
                      <Stack.Screen
                        name="login"
                        options={{ headerShown: false }}
                      />
                      <Stack.Screen
                        name="levelpoint"
                        options={{
                          title: "Tự chấm trình",
                          headerTitleAlign: "center",
                          headerTintColor: "#1976d2", // màu mũi tên
                          headerBackVisible: true, // hiện mũi tên (nếu có thể quay lại)
                          headerBackTitle: "Quay lại", // iOS: chữ cạnh mũi tên
                          headerBackTitleVisible: true,
                          headerTitleStyle: {
                            // 👈 màu title riêng
                            color: "#000",
                            fontWeight: "700",
                          },
                        }}
                      />
                      <Stack.Screen
                        name="tournament/[id]/register"
                        options={{
                          title: "Đăng ký giải đấu",
                          headerTitleAlign: "center",
                          headerBackTitle: "Quay lại",
                          headerTintColor: "#1976d2",
                          headerTitleStyle: {
                            // 👈 màu title riêng
                            color: "#000",
                            fontWeight: "700",
                          },
                        }}
                      />
                      <Stack.Screen
                        name="tournament/[id]/checkin"
                        options={{
                          title: "Check-in giải đấu",
                          headerTitleAlign: "center",
                          headerBackTitle: "Quay lại",
                          headerTintColor: "#1976d2",
                          headerTitleStyle: {
                            // 👈 màu title riêng
                            color: "#000",
                            fontWeight: "700",
                          },
                        }}
                      />

                      <Stack.Screen
                        name="tournament/[id]/draw"
                        options={{
                          title: "Check-in giải đấu",
                          headerTitleAlign: "center",
                          headerBackTitle: "Quay lại",
                          headerTintColor: "#1976d2",
                          headerTitleStyle: {
                            // 👈 màu title riêng
                            color: "#000",
                            fontWeight: "700",
                          },
                        }}
                      />
                      <Stack.Screen
                        name="tournament/[id]/bracket"
                        options={{
                          title: "Sơ đồ giải đấu",
                          headerTitleAlign: "center",
                          headerBackTitle: "Quay lại",
                          headerTintColor: "#1976d2",
                          headerTitleStyle: {
                            // 👈 màu title riêng
                            color: "#000",
                            fontWeight: "700",
                          },
                        }}
                      />
                      <Stack.Screen
                        name="tournament/[id]/manage"
                        options={{
                          headerTitleAlign: "center",
                          headerBackTitle: "Quay lại",
                          headerTintColor: "#1976d2",
                          headerTitleStyle: {
                            // 👈 màu title riêng
                            color: "#000",
                            fontWeight: "700",
                          },
                        }}
                      />
                      <Stack.Screen
                        name="tournament/[id]/schedule"
                        options={{
                          headerTitleAlign: "center",
                          headerBackTitle: "Quay lại",
                          headerTintColor: "#1976d2",
                          headerTitleStyle: {
                            // 👈 màu title riêng
                            color: "#000",
                            fontWeight: "700",
                          },
                        }}
                      />
                      <Stack.Screen
                        name="404"
                        options={{
                          headerTitleAlign: "center",
                          headerBackTitle: "Quay lại",
                          headerTintColor: "#1976d2",
                          headerTitleStyle: {
                            // 👈 màu title riêng
                            color: "#000",
                            fontWeight: "700",
                          },
                        }}
                      />

                      <Stack.Screen name="+not-found" />
                    </Stack>
                    <StatusBar style="auto" />
                  </ThemeProvider>
                </SafeAreaView>
              </SafeAreaProvider>
            </Boot>
          </SocketProvider>
        </BottomSheetModalProvider>
      </GestureHandlerRootView>
    </Provider>
  );
}
