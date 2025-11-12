// src/slices/leaderboardApiSlice.js
import { apiSlice } from "./apiSlice";

export const leaderboardApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getFeaturedLeaderboard: builder.query({
      query: (params = {}) => ({
        url: "/api/leaderboards",
        params, // { sinceDays, limit, minMatches, sportType }
      }),
      providesTags: ["FeaturedLeaderboard"],
    }),
  }),
});

export const { useGetFeaturedLeaderboardQuery } = leaderboardApiSlice;
