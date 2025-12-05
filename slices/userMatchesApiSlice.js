// src/slices/userMatchesApiSlice.js
import { apiSlice } from "./apiSlice";

const buildQueryString = (params = {}) =>
  Object.entries(params)
    .filter(([_, v]) => v !== undefined && v !== null && v !== "")
    .map(
      ([k, v]) =>
        `${encodeURIComponent(k)}=${encodeURIComponent(
          typeof v === "string" ? v : String(v)
        )}`
    )
    .join("&");

export const userMatchesApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getMyUserMatches: builder.query({
      query: ({ search, from, to, status, page, limit } = {}) => {
        const qs = buildQueryString({
          search,
          from,
          to,
          status,
          page,
          limit,
        });
        return {
          url: `/api/user-matches${qs ? `?${qs}` : ""}`,
          method: "GET",
        };
      },
      keepUnusedDataFor: 0,
    }),

    // để dành sau dùng tạo match
    createUserMatch: builder.mutation({
      query: (body) => ({
        url: "/api/user-matches",
        method: "POST",
        body,
      }),
    }),

    // Search VĐV
    searchUserMatchPlayers: builder.query({
      query: ({ search, limit = 50 }) => ({
        url: "/api/user-matches/players",
        params: { search, limit },
      }),
    }),
  }),
});

export const {
  useGetMyUserMatchesQuery,
  useCreateUserMatchMutation,
  useSearchUserMatchPlayersQuery,
} = userMatchesApiSlice;
