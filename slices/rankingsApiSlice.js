// src/slices/rankingsApiSlice.js
import { apiSlice } from "./apiSlice";

export const rankingsApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getRankingsList: builder.query({
      query: ({ cursor, page, limit = 12, keyword } = {}) => {
        const params = new URLSearchParams();

        if (cursor) params.set("cursor", String(cursor));
        if (page !== undefined && page !== null) {
          params.set("page", String(page));
        }
        if (limit) params.set("limit", String(limit));
        if (keyword) params.set("keyword", String(keyword).trim());

        const qs = params.toString();

        return {
          url: `/api/rankings/rankings/v2${qs ? `?${qs}` : ""}`,
          method: "GET",
        };
      },
      keepUnusedDataFor: 10,
    }),
    getRankingsPodiums30d: builder.query({
      query: () => ({
        url: "/api/rankings/podium30d",
        method: "GET",
      }),
      keepUnusedDataFor: 30,
    }),
  }),
});

export const {
  useGetRankingsListQuery,
  useGetRankingsPodiums30dQuery,
} = rankingsApiSlice;
