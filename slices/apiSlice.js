import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import Constants from "expo-constants";
import { router } from "expo-router";

// Lấy base URL từ env của Expo
const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  Constants.expoConfig?.extra?.API_URL ||
  "http://192.168.0.105:5001";

// BaseQuery cho RN: chèn token vào header; không dựa vào cookie
const rawBaseQuery = fetchBaseQuery({
  baseUrl: BASE_URL,
  prepareHeaders: (headers, { getState }) => {
    const token = getState()?.auth?.userInfo?.token;
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return headers;
  },
});

// Điều hướng 404 bằng expo-router
function redirectTo404() {
  try {
    // Tạo file app/404.tsx (hoặc .js) để màn này hoạt động
    router.replace("/404");
  } catch (e) {
    console.log("redirectTo404 error:", e);
    // Fallback: về trang chủ tabs nếu chưa tạo /404
    router.replace("/(tabs)");
  }
}

// Wrapper: 401 -> logout + reset cache; 404 -> điều hướng 404 (có thể skip)
const baseQuery = async (args, api, extraOptions) => {
  const result = await rawBaseQuery(args, api, extraOptions);
  const status = result?.error?.status;

  if (status === 401) {
    try {
      api.dispatch({ type: "auth/logout" });
      api.dispatch(apiSlice.util.resetApiState());
    } catch {}
    return result;
  }

  if (status === 404 && !extraOptions?.skip404Redirect) {
    redirectTo404();
  }

  return result;
};

export const apiSlice = createApi({
  reducerPath: "api",
  baseQuery,
  tagTypes: [
    "User",
    "Assessment",
    "Ranking",
    "Tournaments",
    "Registrations",
    "RegInvites",
    "Draw",
    "Match",
    "ADMIN_BRACKETS",
    "ADMIN_MATCHES",
    "TournamentMatches",
    "MyTournaments",
    "Matches",
  ],
  endpoints: () => ({}),
});

export default apiSlice;
