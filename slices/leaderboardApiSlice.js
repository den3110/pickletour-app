// slices/leaderboardApiSlice.js
import { apiSlice } from "./apiSlice";

const LEADERBOARD_URL = "/api/leaderboards";

export const leaderboardApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // 📊 Lấy bảng xếp hạng nổi bật
    getFeaturedLeaderboard: builder.query({
      query: ({
        sinceDays = 90,
        limit = 10,
        minMatches = 3,
        sportType = "2",
      } = {}) => ({
        url: `${LEADERBOARD_URL}`,
        params: {
          sinceDays,
          limit,
          minMatches,
          sportType,
        },
      }),
      transformResponse: (response) => {
        // Transform nếu cần
        console.log("📊 Leaderboard data:", response);
        return response;
      },
      providesTags: ["Leaderboard"],
      // Cache 5 phút
      keepUnusedDataFor: 300,
    }),
  }),
});

export const { useGetFeaturedLeaderboardQuery, useDebugLeaderboardQuery } =
  leaderboardApiSlice;
