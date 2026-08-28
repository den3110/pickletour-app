// src/slices/rankingsApiSlice.js
import { apiSlice } from "./apiSlice";

export const rankingsApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getRankingsList: builder.query({
      query: ({
        cursor,
        page,
        limit = 12,
        keyword,
        scoreType,
        minScore,
        maxScore,
      } = {}) => {
        const params = new URLSearchParams();

        if (cursor) params.set("cursor", String(cursor));
        if (page !== undefined && page !== null) {
          params.set("page", String(page));
        }
        if (limit) params.set("limit", String(limit));
        if (keyword) params.set("keyword", String(keyword).trim());
        if (scoreType) params.set("scoreType", String(scoreType));
        if (minScore !== undefined && minScore !== null)
          params.set("minScore", String(minScore));
        if (maxScore !== undefined && maxScore !== null)
          params.set("maxScore", String(maxScore));

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
    getRankingsPodiumAnnouncements: builder.query({
      query: ({ days = 7, limit = 36 } = {}) => ({
        url: `/api/rankings/podium-announcements?days=${encodeURIComponent(
          days
        )}&limit=${encodeURIComponent(limit)}`,
        method: "GET",
      }),
      keepUnusedDataFor: 60,
    }),
  }),
});

export const {
  useGetRankingsListQuery,
  useGetRankingsPodiums30dQuery,
  useGetRankingsPodiumAnnouncementsQuery,
} = rankingsApiSlice;
