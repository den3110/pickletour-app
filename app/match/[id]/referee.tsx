// app/(app)/admin/match/[id]/referee.jsx
import React, { useMemo, useCallback, useRef } from "react";
import {
  ActivityIndicator,
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  useColorScheme,
  AppState,
  InteractionManager,
} from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useSelector } from "react-redux";
import { MaterialIcons } from "@expo/vector-icons";
import { useTheme, useFocusEffect } from "@react-navigation/native";
import * as ScreenOrientation from "expo-screen-orientation";

import { useGetMatchQuery } from "@/slices/tournamentsApiSlice";
import RefereeJudgePanel from "@/components/match/RefereeScorePanel.native";
import { useUserMatchHeader } from "@/hooks/useUserMatchHeader";

/* ---------------- theme tokens (giống AssignCourtSheet) ---------------- */
function useTokens() {
  const navTheme = useTheme?.() || {};
  const scheme = useColorScheme?.() || "light";
  const dark =
    typeof navTheme.dark === "boolean" ? navTheme.dark : scheme === "dark";

  const primary = navTheme?.colors?.primary ?? (dark ? "#7cc0ff" : "#0a84ff");
  const text = navTheme?.colors?.text ?? (dark ? "#f7f7f7" : "#111");
  const card = navTheme?.colors?.card ?? (dark ? "#16181c" : "#ffffff");
  const border = navTheme?.colors?.border ?? (dark ? "#2e2f33" : "#e5e7eb");
  const background =
    navTheme?.colors?.background ?? (dark ? "#0b0d10" : "#f6f8fc");

  return {
    dark,
    colors: { primary, text, card, border, background },
    muted: dark ? "#9aa0a6" : "#6b7280",

    chipDefaultBg: dark ? "#1f2937" : "#eef2f7",
    chipDefaultFg: dark ? "#e5e7eb" : "#263238",
    chipDefaultBd: dark ? "#334155" : "#e2e8f0",

    chipErrBg: dark ? "#3b0d0d" : "#fee2e2",
    chipErrFg: dark ? "#fecaca" : "#991b1b",
    chipErrBd: dark ? "#7f1d1d" : "#fecaca",

    // cảnh báo
    warnBg: dark ? "#2a1f0a" : "#fffbeb",
    warnFg: dark ? "#facc15" : "#92400e",
    warnBd: dark ? "#4d3b0a" : "#fef3c7",
  };
}

const Row = ({ children, style }) => (
  <View style={[{ flexDirection: "row" }, style]} />
);

/* ---------------- helpers ---------------- */
const textOf = (v) => {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
    return String(v);
  if (typeof v === "object")
    return v.name || v.label || v.title || v.message || v.error || "";
  return "";
};

const extractRefereeIds = (m) => {
  if (!m) return [];
  const raw = m.referees ?? m.referee ?? m.judges ?? [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr
    .map((r) => String(r?.user?._id ?? r?.user ?? r?._id ?? r?.id ?? (r || "")))
    .filter(Boolean);
};

const isMeAdmin = (me) =>
  !!(me?.isAdmin || me?.role === "admin" || me?.roles?.includes?.("admin"));

const isMeManagerOfTournament = (me, match) => {
  if (!me?._id || !match?.tournament) return false;
  const t = match.tournament;
  if (String(t.createdBy) === String(me._id)) return true;
  if (Array.isArray(t.managers)) {
    return t.managers.some((m) => String(m?.user ?? m) === String(me._id));
  }
  return !!t?.isManager;
};

const isMeRefereeOfMatch = (me, match) => {
  if (!me?._id || !match) return false;
  const myId = String(me._id);
  return extractRefereeIds(match).includes(myId);
};

/* ---------------- small atoms theo theme ---------------- */
function IconBtn({ name, onPress, size = 20, color, bg }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        { padding: 6, borderRadius: 8, backgroundColor: bg },
        pressed && { opacity: 0.85 },
      ]}
    >
      <MaterialIcons name={name} size={size} color={color} />
    </Pressable>
  );
}

function OutlineBtn({ children, onPress, color, border }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          borderWidth: 1,
          borderColor: border,
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderRadius: 10,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          backgroundColor: "transparent",
        },
        pressed && { opacity: 0.9 },
      ]}
    >
      {children}
    </Pressable>
  );
}

/* ---------------- header refresh ---------------- */
function HeaderRefresh({ isFetching, onPress }) {
  const t = useTokens();
  return isFetching ? (
    <ActivityIndicator size="small" color={t.colors.primary} />
  ) : (
    <IconBtn
      name="refresh"
      onPress={onPress}
      color={t.colors.text}
      bg={t.chipDefaultBg}
    />
  );
}

/* ---------------- page ---------------- */
export default function RefereeScreen() {
  
  const t = useTokens();
  const styles = useMemo(() => makeStyles(t), [t]);

  const params = useLocalSearchParams();
  const {userMatch }= params
  useUserMatchHeader(userMatch=== "true" && "user");
  const matchId = useMemo(() => String(params?.id ?? ""), [params?.id]);
  const me = useSelector((s) => s.auth?.userInfo || null);

  const {
    data: match,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useGetMatchQuery(matchId, {
    skip: !matchId,
    refetchOnFocus: false,
    refetchOnReconnect: false,
    pollingInterval: 0,
  });

  const canControl = useMemo(() => {
    if (!me || !match) return false;
    return (
      isMeAdmin(me) ||
      isMeManagerOfTournament(me, match) ||
      isMeRefereeOfMatch(me, match)
    );
  }, [me, match]);

  const title = useMemo(
    () =>
      match?.code
        ? `Trọng tài: ${match.code}`
        : `Trọng tài #${matchId.slice(-6)}`,
    [match?.code, matchId]
  );

  const handleRefetch = useCallback(() => refetch(), [refetch]);

  // 👇 FIX TRIỆT ĐỂ: Xử lý orientation mượt mà với debounce và cleanup an toàn
  const appState = useRef(AppState.currentState);
  const isUnmounting = useRef(false);
  const orientationTimeouts = useRef([]);

  useFocusEffect(
    useCallback(() => {
      // Reset flag và clear tất cả timeouts cũ
      isUnmounting.current = false;
      orientationTimeouts.current.forEach(clearTimeout);
      orientationTimeouts.current = [];

      // Lock landscape khi vào màn
      (async () => {
        try {
          await ScreenOrientation.unlockAsync();
          await ScreenOrientation.lockAsync(
            ScreenOrientation.OrientationLock.LANDSCAPE
          );
        } catch (err) {
          console.warn("Lock landscape error:", err);
        }
      })();

      // Listener giữ landscape khi app active trở lại
      const subscription = AppState.addEventListener(
        "change",
        (nextAppState) => {
          if (
            appState.current.match(/inactive|background/) &&
            nextAppState === "active" &&
            !isUnmounting.current
          ) {
            (async () => {
              try {
                await ScreenOrientation.lockAsync(
                  ScreenOrientation.OrientationLock.LANDSCAPE
                );
              } catch (err) {
                console.warn("Re-lock landscape error:", err);
              }
            })();
          }
          appState.current = nextAppState;
        }
      );

      // Cleanup: đợi animation và các interactions hoàn tất
      return () => {
        isUnmounting.current = true;
        subscription.remove();

        // Clear tất cả timeout cũ
        orientationTimeouts.current.forEach(clearTimeout);
        orientationTimeouts.current = [];

        // Dùng InteractionManager để chờ animation + thêm delay để chắc chắn
        InteractionManager.runAfterInteractions(() => {
          if (!isUnmounting.current) return;

          const timeoutId = setTimeout(async () => {
            if (isUnmounting.current) {
              try {
                await ScreenOrientation.unlockAsync();
                await ScreenOrientation.lockAsync(
                  ScreenOrientation.OrientationLock.PORTRAIT_UP
                );
              } catch (err) {
                console.warn("Cleanup orientation error:", err);
              }
            }
          }, 200); // Thêm 200ms delay sau khi InteractionManager xong

          orientationTimeouts.current.push(timeoutId);
        });
      };
    }, [])
  );
  // 👆 Xong phần xử lý orientation mượt mà và an toàn

  // ---------- loading ----------
  if (isLoading && !match) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.center, { backgroundColor: t.colors.background }]}>
          <ActivityIndicator color={t.colors.primary} />
        </View>
      </>
    );
  }

  // ---------- error ----------
  if (error) {
    return (
      <>
        <Stack.Screen
          options={{
            title: "Trọng tài",
            headerStyle: { backgroundColor: t.colors.card },
            headerTitleStyle: { color: t.colors.text },
            headerTintColor: t.colors.text,
          }}
        />
        <View style={[styles.screen]}>
          <View
            style={[
              styles.card,
              {
                backgroundColor: t.chipErrBg,
                borderColor: t.chipErrBd,
                alignItems: "center",
              },
            ]}
          >
            <Text style={{ color: t.chipErrFg, textAlign: "center" }}>
              {textOf(error?.data?.message) ||
                textOf(error?.error) ||
                "Lỗi tải trận"}
            </Text>
            <View style={{ height: 8 }} />
            <OutlineBtn
              onPress={handleRefetch}
              color={t.colors.text}
              border={t.colors.border}
            >
              <MaterialIcons name="refresh" size={16} color={t.colors.text} />
              <Text style={{ color: t.colors.text, fontWeight: "700" }}>
                Thử lại
              </Text>
            </OutlineBtn>
          </View>
        </View>
      </>
    );
  }

  if (!match) return null;

  return (
    <>
      <RefereeJudgePanel matchId={matchId} />
    </>
  );
}

/* ---------------- styles ---------------- */
function makeStyles(t) {
  return StyleSheet.create({
    screen: { flex: 1, padding: 12, backgroundColor: t.colors.background },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },

    card: {
      backgroundColor: t.colors.card,
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: t.colors.border,
      marginBottom: 12,
    },
  });
}
