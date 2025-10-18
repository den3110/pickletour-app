import { apiSlice } from "./apiSlice";
import { setCredentials } from "./authSlice";

const USERS_URL = "/api/users";

export const userApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    login: builder.mutation({
      query: (data) => ({
        url: `${USERS_URL}/auth`,
        method: "POST",
        body: data,
      }),
    }),
    logout: builder.mutation({
      query: () => ({
        url: `${USERS_URL}/logout`,
        method: "POST",
      }),
    }),
    register: builder.mutation({
      query: (data) => ({
        url: `${USERS_URL}/`,
        method: "POST",
        body: data,
      }),
    }),
    updateUser: builder.mutation({
      query: (data) => ({
        url: `${USERS_URL}/profile`,
        method: "PUT",
        body: data,
      }),
    }),
    getPublicProfile: builder.query({
      query: (id) => `${USERS_URL}/${id}/public`,
    }),
    getRatingHistory: builder.query({
      query: (id) => `/api/users/${id}/ratings`,
      providesTags: (result, error, userId) => [
        { type: "RatingHistory", id: userId },
      ],
    }),
    getMatchHistory: builder.query({
      query: (id) => `/api/users/${id}/matches`,
    }),
    getProfile: builder.query({
      query: () => "/api/users/profile",
      providesTags: ["User"],
      keepUnusedDataFor: 0,
      forceRefetch: () => true,
      async onQueryStarted(arg, { dispatch, getState, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          const prev = getState().auth?.userInfo || {};
          const next = { ...prev, ...data };
          if (!data?.token && prev?.token) next.token = prev.token;
          dispatch(setCredentials(next));
        } catch {}
      },
    }),
    searchUser: builder.query({
      query: (q) => `/api/users/search?q=${encodeURIComponent(q)}`,
    }),
    // slices/usersApiSlice.ts
    deleteMe: builder.mutation({
      query: () => ({ url: "/api/users/me", method: "DELETE" }),
    }),
    // ... login, register đang có
    forgotPassword: builder.mutation({
      query: (body) => ({
        url: `${USERS_URL}/forgot-password`,
        method: "POST",
        body,
      }),
    }),
    resetPassword: builder.mutation({
      query: (body) => ({
        url: `${USERS_URL}/reset-password`,
        method: "POST",
        body,
      }),
    }),
    verifyResetOtp: builder.mutation({
      query: (body) => ({
        url: "/api/users/verify-reset-otp",
        method: "POST",
        body,
      }),
    }),
    getMe: builder.query({
      query: () => "/api/users/me",
      providesTags: ["Me"],
      keepUnusedDataFor: 30,
    }),
    getMeScore: builder.query({
      query: () => ({ url: "/api/users/me/score", method: "GET" }),
      providesTags: ["MeScore"],
    }),
    // Xoá 1 lịch sử điểm trình
    deleteRatingHistory: builder.mutation({
      query: ({ userId, historyId }) => ({
        url: `/api/users/${userId}/rating-history/${historyId}`,
        method: "DELETE",
      }),
      invalidatesTags: (r, e, { userId }) => [
        { type: "RatingHistory", id: userId },
      ],
    }),
     getUserAchievements: builder.query({
      query: (userId) => `/api/users/${userId}/achievements`,
      providesTags: (res, err, id) => [
        { type: "User", id },
        { type: "Achievements", id },
      ],
    }),
  }),
});

export const {
  useLoginMutation,
  useLogoutMutation,
  useRegisterMutation,
  useUpdateUserMutation,
  useGetPublicProfileQuery,
  useGetRatingHistoryQuery,
  useGetMatchHistoryQuery,
  useGetProfileQuery,
  useLazyGetProfileQuery,
  useLazySearchUserQuery,
  useDeleteMeMutation,
  useForgotPasswordMutation,
  useResetPasswordMutation,
  useVerifyResetOtpMutation,
  useGetMeQuery,
  useGetMeScoreQuery,
  useDeleteRatingHistoryMutation,
  useGetUserAchievementsQuery,

} = userApiSlice;
