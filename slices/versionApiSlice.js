// src/slices/versionApiSlice.js
import { apiSlice } from "./apiSlice";
import { Platform } from "react-native";

const VERSION_URL = "/api/app/version";

export const versionApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // Lấy cấu hình version/changelog từ server (không force ở đây; force đến từ 426)
    getAppVersion: builder.query({
      query: () => `${VERSION_URL}?platform=${Platform.OS}`,
      providesTags: () => [{ type: "AppVersion", id: "CONFIG" }],
      keepUnusedDataFor: 0,
    }),

    // (Tuỳ chọn) admin cập nhật cấu hình (nếu app bạn có role admin trên mobile)
    upsertAppVersion: builder.mutation({
      // body: { platform, latestVersion, latestBuild, minSupportedBuild, storeUrl, rollout, blockedBuilds, changelog }
      query: (body) => ({
        url: VERSION_URL,
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "AppVersion", id: "CONFIG" }],
    }),
  }),
});

export const { useGetAppVersionQuery, useUpsertAppVersionMutation } =
  versionApiSlice;
