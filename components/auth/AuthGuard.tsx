// components/auth/AuthGuard.jsx
import React, { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useSelector } from "react-redux";
import { useRouter, usePathname } from "expo-router";

export default function AuthGuard({ children }) {
  const { userInfo } = useSelector((s) => s.auth || {});
  const isAuthed = !!(userInfo?.token || userInfo?._id || userInfo?.email);

  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isAuthed) {
      // đá sang login, kèm theo đường dẫn hiện tại để login xong quay lại
      router.replace({
        pathname: "/login",
        params: { redirectTo: pathname },
      });
    }
  }, [isAuthed, router, pathname]);

  // Chưa authed thì show tí loading, chờ router.replace
  if (!isAuthed) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#00000000",
        }}
      >
        <ActivityIndicator />
      </View>
    );
  }

  // Đăng nhập rồi => render children bình thường
  return children;
}
