// src/slices/settingsApiSlice.js
import { apiSlice } from "./apiSlice";

export const settingsApiSlice = apiSlice.injectEndpoints({
  overrideExisting: false,
  endpoints: (builder) => ({
    /* ================== Admin: System Settings ================== */
    getSystemSettings: builder.query({
      query: () => ({
        url: "/api/settings/system",
      }),
      providesTags: ["SystemSettings"],
    }),

    updateSystemSettings: builder.mutation({
      query: (body) => ({
        url: "/api/settings/system",
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["SystemSettings"],
    }),

    /* ================== Mobile: Registration Settings ============ */
    // dùng chung /api/settings/system, nhưng chỉ trả về flag cần thiết
    getRegistrationSettings: builder.query({
      query: () => ({
        url: "/api/auth/system/registration",
      }),
      providesTags: ["SystemSettings"],
    }),

    /* ================== Public: Guide link (nếu cần) ============= */
    getGuideLink: builder.query({
      query: () => ({
        url: "/api/settings/guide-link",
      }),
    }),
     /* ================== Mobile: OTA Allowed ====================== */
    // allowed=true => cho hiện prompt update (bắt update theo bạn hiểu)
    // allowed=false => vào app bình thường
    getOtaAllowed: builder.query({
      query: () => ({
        url: "/api/auth/system/ota/allowed",
      }),
      providesTags: ["SystemSettings"],
    }),
  }),
});

export const {
  useGetSystemSettingsQuery,
  useUpdateSystemSettingsMutation,
  useGetRegistrationSettingsQuery,
  useGetGuideLinkQuery,
  useGetOtaAllowedQuery,
} = settingsApiSlice;
