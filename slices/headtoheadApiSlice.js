// slices/head2headApiSlice.js
import { apiSlice } from "./apiSlice";

export const head2headApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // Lấy thống kê đối đầu giữa 2 người chơi
    getHead2Head: builder.query({
      query: ({ player1Id, player2Id }) => ({
        url: `/api/head2head/${player1Id}/${player2Id}`,
        method: "GET",
      }),
      transformResponse: (response) => response?.data || response,
      providesTags: (result, error, { player1Id, player2Id }) => [
        { type: "Head2Head", id: `${player1Id}-${player2Id}` },
      ],
    }),

    // Lấy lịch sử các trận đấu giữa 2 người chơi
    getHead2HeadMatches: builder.query({
      query: ({ player1Id, player2Id, page = 1, limit = 10 }) => ({
        url: `/api/head2head/${player1Id}/${player2Id}/matches`,
        method: "GET",
        params: { page, limit },
      }),
      transformResponse: (response) => response?.data || response,
      providesTags: (result, error, { player1Id, player2Id }) => [
        { type: "Head2HeadMatches", id: `${player1Id}-${player2Id}` },
      ],
    }),

    // Lấy danh sách đối thủ thường xuyên của 1 người chơi
    getFrequentOpponents: builder.query({
      query: ({ playerId, limit = 10 }) => ({
        url: `/api/head2head/${playerId}/opponents`,
        method: "GET",
        params: { limit },
      }),
      transformResponse: (response) => response?.data || response,
      providesTags: (result, error, { playerId }) => [
        { type: "FrequentOpponents", id: playerId },
      ],
    }),

    // Lấy stats tổng hợp của 1 người chơi (win rate, avg score, etc.)
    getPlayerStats: builder.query({
      query: ({ playerId }) => ({
        url: `/api/head2head/${playerId}/stats`,
        method: "GET",
      }),
      transformResponse: (response) => response?.data || response,
      providesTags: (result, error, { playerId }) => [
        { type: "PlayerStats", id: playerId },
      ],
    }),
  }),
});

export const {
  useGetHead2HeadQuery,
  useGetHead2HeadMatchesQuery,
  useGetFrequentOpponentsQuery,
  useGetPlayerStatsQuery,
} = head2headApiSlice;
