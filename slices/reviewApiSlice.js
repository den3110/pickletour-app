// slices/reviewApiSlice.js — Đánh giá giải đấu / sân chơi
import { apiSlice } from "./apiSlice";

export const reviewApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getReviews: builder.query({
      query: ({ targetType, targetId, page = 1, limit = 20 }) => ({
        url: `/api/reviews/${targetType}/${targetId}`,
        params: { page, limit },
      }),
      providesTags: (result, error, { targetType, targetId }) => [
        { type: "Reviews", id: `${targetType}:${targetId}` },
      ],
    }),
    getReviewSummary: builder.query({
      query: ({ targetType, targetId }) => ({
        url: `/api/reviews/${targetType}/${targetId}/summary`,
      }),
      providesTags: (result, error, { targetType, targetId }) => [
        { type: "Reviews", id: `sum:${targetType}:${targetId}` },
      ],
    }),
    upsertReview: builder.mutation({
      query: ({ targetType, targetId, rating, comment, aspects }) => ({
        url: `/api/reviews/${targetType}/${targetId}`,
        method: "POST",
        body: { rating, comment, aspects },
      }),
      invalidatesTags: (result, error, { targetType, targetId }) => [
        { type: "Reviews", id: `${targetType}:${targetId}` },
        { type: "Reviews", id: `sum:${targetType}:${targetId}` },
      ],
    }),
    deleteMyReview: builder.mutation({
      query: ({ targetType, targetId }) => ({
        url: `/api/reviews/${targetType}/${targetId}`,
        method: "DELETE",
      }),
      invalidatesTags: (result, error, { targetType, targetId }) => [
        { type: "Reviews", id: `${targetType}:${targetId}` },
        { type: "Reviews", id: `sum:${targetType}:${targetId}` },
      ],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetReviewsQuery,
  useGetReviewSummaryQuery,
  useUpsertReviewMutation,
  useDeleteMyReviewMutation,
} = reviewApiSlice;
