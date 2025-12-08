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
    // 1. Lấy danh sách trận đấu
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
      // Quan trọng: Gắn tag để biết danh sách này tên là "UserMatch"
      providesTags: ["UserMatch"], 
    }),

    // 2. Tạo trận đấu
    createUserMatch: builder.mutation({
      query: (body) => ({
        url: "/api/user-matches",
        method: "POST",
        body,
      }),
      // Tạo xong thì báo hiệu tag "UserMatch" đã cũ -> tự động fetch lại getMyUserMatches
      invalidatesTags: ["UserMatch"], 
    }),

    // 3. Xoá trận đấu (Mới thêm)
    deleteUserMatch: builder.mutation({
      query: (id) => ({
        url: `/api/user-matches/${id}`, // Đảm bảo Backend có route DELETE /api/user-matches/:id
        method: "DELETE",
      }),
      // Xoá xong cũng tự động fetch lại danh sách
      invalidatesTags: ["UserMatch"], 
    }),

    // 4. Search VĐV
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
  useDeleteUserMatchMutation, // <--- Export hook xoá mới
  useSearchUserMatchPlayersQuery,
} = userMatchesApiSlice;