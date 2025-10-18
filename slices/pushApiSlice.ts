// slices/pushApiSlice.ts
import { apiSlice } from "./apiSlice";

export const pushApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    registerPushToken: builder.mutation<
      { ok: boolean },
      {
        token: string;
        platform?: "ios" | "android" | "web";
        deviceId?: string;
        appVersion?: string;
      }
    >({
      query: (body) => ({
        url: "/api/push/me/push-token", // bạn đang mount: app.use("/api/push", pushTokenRoutes)
        method: "POST",
        body,
      }),
    }),

    // dùng khi muốn “tắt” token của thiết bị hiện tại lúc logout
    unregisterPushToken: builder.mutation<
      { ok: boolean; matched?: number; modified?: number },
      { deviceId?: string; token?: string }
    >({
      query: (body) => ({
        url: "/api/push/me/push-token",
        method: "DELETE",
        body,
      }),
    }),

    // (tùy chọn) tắt toàn bộ token của user hiện tại
    unregisterAllMyTokens: builder.mutation<
      { ok: boolean; modified?: number },
      void
    >({
      query: () => ({
        url: "/api/push/me/push-token/all",
        method: "DELETE",
      }),
    }),
  }),
});

export const {
  useRegisterPushTokenMutation,
  useUnregisterPushTokenMutation,
  useUnregisterAllMyTokensMutation,
} = pushApiSlice;
