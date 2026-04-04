import { apiSlice } from "./apiSlice";
import { setCredentials } from "./authSlice";

const USERS_URL = "/api/users";

const normalizeUserScopedArg = (arg) => {
  if (typeof arg === "string") return { id: arg };
  if (arg && typeof arg === "object") return arg;
  return {};
};

export const userApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    login: builder.mutation({
      query: (data) => ({
        url: `${USERS_URL}/auth`,
        method: "POST",
        body: data,
      }),
    }),
     reauth: builder.query({
      query: () => ({
        url: "/api/users/reauth",
        method: "GET",
      }),
      // nếu dùng cookie httpOnly: thêm credentials
      // queryFn: async(...) => ...
      providesTags: ["Auth"],
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
      query: (arg) => {
        const { id, page, limit, all } = normalizeUserScopedArg(arg);
        return {
          url: `${USERS_URL}/${id}/ratings`,
          params: {
            ...(page ? { page } : {}),
            ...(limit ? { limit } : {}),
            ...(all ? { all: 1 } : {}),
          },
        };
      },
      providesTags: (result, error, arg) => {
        const { id } = normalizeUserScopedArg(arg);
        return [{ type: "RatingHistory", id }];
      },
    }),
    getMatchHistory: builder.query({
      query: (arg) => {
        const { id, page, limit, all } = normalizeUserScopedArg(arg);
        return {
          url: `${USERS_URL}/${id}/matches`,
          params: {
            ...(page ? { page } : {}),
            ...(limit ? { limit } : {}),
            ...(all ? { all: 1 } : {}),
          },
        };
      },
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
      query: (body) => ({
        url: "/api/users/me",
        method: "DELETE",
        body: body ?? {},
      }),
    }),
    issueOsAuthToken: builder.mutation({
      query: () => ({
        url: "/api/users/auth/os-auth-token",
        method: "POST",
      }),
    }),
    getOAuthAuthorizeContext: builder.query({
      query: (search = "") => ({
        url: `/api/oauth/authorize/context${search ? `?${search}` : ""}`,
        method: "GET",
      }),
      keepUnusedDataFor: 0,
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
      query: (arg) => {
        const { id, userId } = normalizeUserScopedArg(arg);
        const resolvedId = userId || id;
        return `${USERS_URL}/${resolvedId}/achievements`;
      },
      providesTags: (res, err, arg) => {
        const { id, userId } = normalizeUserScopedArg(arg);
        const resolvedId = userId || id;
        return [
          { type: "User", id: resolvedId },
          { type: "Achievements", id: resolvedId },
        ];
      },
    }),
    getKycCheckData: builder.query({
      query: (userId) => ({
        url: `/api/users/kyc/status/${userId}`,
        method: "GET",
      }),
      keepUnusedDataFor: 0, // Không cache để luôn lấy data mới nhất khi vào màn hình
    }),
    // Update trạng thái
    updateKycStatus: builder.mutation({
      query: ({ userId, status }) => ({
        url: `/api/users/kyc/status/${userId}`,
        method: "PUT",
        body: { status },
      }),
      // Invalidate tag User để màn hình Profile tự cập nhật lại badge
      invalidatesTags: ["User"], 
    }),
    verifyRegisterOtp: builder.mutation({
      query: (body) => ({
        url: "/api/users/register/verify-otp",
        method: "POST",
        body,
      }),
    }),

    resendRegisterOtp: builder.mutation({
      query: (body) => ({
        url: "/api/users/register/resend-otp",
        method: "POST",
        body,
      }),
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
  useSearchUserQuery,
  useDeleteMeMutation,
  useForgotPasswordMutation,
  useResetPasswordMutation,
  useVerifyResetOtpMutation,
  useGetMeQuery,
  useGetMeScoreQuery,
  useDeleteRatingHistoryMutation,
  useGetUserAchievementsQuery,
  useIssueOsAuthTokenMutation,
  useLazyGetOAuthAuthorizeContextQuery,
  useReauthQuery,
  useGetKycCheckDataQuery,
  useUpdateKycStatusMutation,
  useVerifyRegisterOtpMutation,
  useResendRegisterOtpMutation
} = userApiSlice;
