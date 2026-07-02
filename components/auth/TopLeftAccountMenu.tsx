import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useTheme } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { router, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSelector } from "react-redux";

const HIDDEN_PATH_PREFIXES = [
  "/login",
  "/logout",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-otp",
];

const isAuthed = (userInfo: any) =>
  Boolean(userInfo?.token || userInfo?._id || userInfo?.id || userInfo?.email);

export default function TopLeftAccountMenu() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const pathname = usePathname();
  const userInfo = useSelector((state: any) => state.auth?.userInfo || null);
  const [open, setOpen] = React.useState(false);

  const shouldHide =
    !isAuthed(userInfo) ||
    HIDDEN_PATH_PREFIXES.some((prefix) => pathname?.startsWith(prefix));

  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  if (shouldHide) return null;

  const isDark = Boolean(theme.dark);
  const panelBg = isDark ? "rgba(20,22,29,0.98)" : "rgba(255,255,255,0.98)";
  const textColor = isDark ? "#f8fafc" : "#0f172a";
  const mutedColor = isDark ? "#a7b0c0" : "#64748b";
  const borderColor = isDark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.1)";
  const top = Math.max(insets.top + 8, 14);
  const left = 12;

  const title =
    userInfo?.name || userInfo?.nickname || userInfo?.email || "Tài khoản";

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFillObject}>
      {open ? (
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={() => setOpen(false)}
        />
      ) : null}

      <View style={[styles.anchor, { top, left }]}>
        <TouchableOpacity
          activeOpacity={0.82}
          onPress={() => setOpen((value) => !value)}
          style={[
            styles.menuButton,
            {
              backgroundColor: panelBg,
              borderColor,
            },
          ]}
        >
          <Ionicons name="menu" size={22} color={textColor} />
        </TouchableOpacity>

        {open ? (
          <View
            style={[
              styles.panel,
              {
                backgroundColor: panelBg,
                borderColor,
              },
            ]}
          >
            <View style={styles.identityRow}>
              <View style={styles.avatar}>
                <Ionicons name="person" size={18} color="#ffffff" />
              </View>
              <View style={styles.identityText}>
                <Text
                  numberOfLines={1}
                  style={[styles.identityName, { color: textColor }]}
                >
                  {title}
                </Text>
                <Text style={[styles.identityMeta, { color: mutedColor }]}>
                  Đang đăng nhập
                </Text>
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: borderColor }]} />

            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.menuItem}
              onPress={() => {
                setOpen(false);
                router.replace("/logout" as any);
              }}
            >
              <Ionicons name="log-out-outline" size={20} color="#ef4444" />
              <Text style={styles.logoutText}>Đăng xuất</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: "absolute",
    zIndex: 12000,
    elevation: 12000,
  },
  menuButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  panel: {
    marginTop: 8,
    width: 226,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 10,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 6,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1877f2",
  },
  identityText: {
    flex: 1,
    minWidth: 0,
  },
  identityName: {
    fontSize: 14,
    fontWeight: "800",
  },
  identityMeta: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "600",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 6,
  },
  menuItem: {
    minHeight: 44,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
  },
  logoutText: {
    color: "#ef4444",
    fontSize: 15,
    fontWeight: "800",
  },
});
