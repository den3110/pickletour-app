// src/slices/facebookApiSlice.js
import { apiSlice } from "./apiSlice";

export const facebookApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // Lấy URL OAuth
    getFacebookLoginUrl: builder.mutation({
      query: () => ({
        url: "/api/fb/me/facebook/login-url",
        method: "GET",
      }),
    }),

    // Lấy danh sách pages
    getFacebookPages: builder.query({
      query: () => ({
        url: "/api/fb/me/facebook/pages",
        method: "GET",
      }),
      providesTags: ["FacebookPages"],
    }),

    // Đặt page mặc định
    setDefaultFacebookPage: builder.mutation({
      query: (pageConnectionId) => ({
        url: "/api/fb/me/facebook/default-page",
        method: "POST",
        body: { pageConnectionId },
      }),
      invalidatesTags: ["FacebookPages"],
    }),

    // Xoá page
    deleteFacebookPage: builder.mutation({
      query: (id) => ({
        url: `/api/fb/me/facebook/pages/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: ["FacebookPages"],
    }),
  }),
});

export const {
  useGetFacebookLoginUrlMutation,
  useGetFacebookPagesQuery,
  useSetDefaultFacebookPageMutation,
  useDeleteFacebookPageMutation,
} = facebookApiSlice;