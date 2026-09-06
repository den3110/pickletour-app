// slices/courtOwnerApiSlice.js — Đăng ký làm chủ sân (mobile)
import { apiSlice } from "./apiSlice";

export const courtOwnerApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getMyOwnerRequest: builder.query({
      query: () => ({ url: `/api/court-owner/request/mine` }),
      providesTags: ["CourtOwnerRequest"],
    }),
    submitOwnerRequest: builder.mutation({
      query: (body) => ({ url: `/api/court-owner/request`, method: "POST", body }),
      invalidatesTags: ["CourtOwnerRequest"],
    }),
  }),
  overrideExisting: false,
});

export const { useGetMyOwnerRequestQuery, useSubmitOwnerRequestMutation } = courtOwnerApiSlice;
