import { apiSlice } from "./apiSlice";

const CHECKPOINT_URL = "/api/checkpoints";

export const checkpointApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getActiveCheckpointRequirement: builder.query({
      query: () => `${CHECKPOINT_URL}/me/active`,
      providesTags: ["Checkpoint"],
      extraOptions: {
        skip404Redirect: true,
      },
    }),
    startActiveCheckpoint: builder.mutation({
      query: () => ({
        url: `${CHECKPOINT_URL}/me/start`,
        method: "POST",
      }),
      invalidatesTags: ["Checkpoint"],
      extraOptions: {
        skip404Redirect: true,
      },
    }),
    getCheckpoint: builder.query({
      query: (token) => `${CHECKPOINT_URL}/${encodeURIComponent(token)}`,
      providesTags: (_result, _error, token) => [
        { type: "Checkpoint", id: token || "current" },
      ],
      extraOptions: {
        skip404Redirect: true,
      },
    }),
    startCheckpointOtp: builder.mutation({
      query: (token) => ({
        url: `${CHECKPOINT_URL}/${encodeURIComponent(token)}/start`,
        method: "POST",
      }),
      invalidatesTags: (_result, _error, token) => [
        { type: "Checkpoint", id: token || "current" },
      ],
      extraOptions: {
        skip404Redirect: true,
      },
    }),
    resendCheckpoint: builder.mutation({
      query: (token) => ({
        url: `${CHECKPOINT_URL}/${encodeURIComponent(token)}/resend`,
        method: "POST",
      }),
      invalidatesTags: (_result, _error, token) => [
        { type: "Checkpoint", id: token || "current" },
      ],
      extraOptions: {
        skip404Redirect: true,
      },
    }),
    verifyCheckpointOtp: builder.mutation({
      query: ({ token, code }) => ({
        url: `${CHECKPOINT_URL}/${encodeURIComponent(token)}/phone`,
        method: "POST",
        body: { code },
      }),
      invalidatesTags: (_result, _error, arg) => [
        { type: "Checkpoint", id: arg?.token || "current" },
        "User",
        "Auth",
      ],
      extraOptions: {
        skip404Redirect: true,
      },
    }),
    uploadCheckpointEvidence: builder.mutation({
      query: ({ token, factor, files }) => {
        const body = new FormData();
        body.append("factor", factor);
        Object.entries(files || {}).forEach(([key, file]) => {
          if (file) body.append(key, file);
        });

        return {
          url: `${CHECKPOINT_URL}/${encodeURIComponent(token)}/evidence`,
          method: "POST",
          body,
        };
      },
      invalidatesTags: (_result, _error, arg) => [
        { type: "Checkpoint", id: arg?.token || "current" },
      ],
      extraOptions: {
        skip404Redirect: true,
      },
    }),
    recordCheckpointEvent: builder.mutation({
      query: (body) => ({
        url: `${CHECKPOINT_URL}/events`,
        method: "POST",
        body,
      }),
    }),
  }),
});

export const {
  useGetActiveCheckpointRequirementQuery,
  useStartActiveCheckpointMutation,
  useGetCheckpointQuery,
  useStartCheckpointOtpMutation,
  useResendCheckpointMutation,
  useVerifyCheckpointOtpMutation,
  useUploadCheckpointEvidenceMutation,
  useRecordCheckpointEventMutation,
} = checkpointApiSlice;
