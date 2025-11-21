// src/slices/assessmentsApiSlice.js
import { apiSlice } from "./apiSlice";

const ASSESSMENTS_URL = "/api/assessments";

// helper tạo tag theo user
const tagLatest = (userId) => ({ type: "Assessment", id: `LATEST_${userId}` });
const tagHistory = (userId) => ({
  type: "Assessment",
  id: `HISTORY_${userId}`,
});
const tagRanking = (userId) => ({ type: "Ranking", id: userId });

export const assessmentsApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // Tạo bản chấm mới cho 1 user (simple mode)
    createAssessment: builder.mutation({
      // arg: { userId, singleLevel, doubleLevel, meta, note }
      query: ({ userId, singleLevel, doubleLevel, meta, note = "" }) => ({
        url: `${ASSESSMENTS_URL}/${userId}`,
        method: "POST",
        body: {
          singleLevel,
          doubleLevel,
          ...(meta ? { meta } : {}),
          note,
        },
      }),
      // Sau khi tạo -> invalidates các query liên quan để tự refetch
      invalidatesTags: (result, error, arg) => [
        tagLatest(arg.userId),
        tagHistory(arg.userId),
        tagRanking(arg.userId),
      ],
    }),

    // Lấy bản chấm mới nhất của 1 user
    getLatestAssessment: builder.query({
      // arg: userId
      query: (userId) => `${ASSESSMENTS_URL}/${userId}/latest`,
      providesTags: (result, error, userId) => [tagLatest(userId)],
      keepUnusedDataFor: 0, // rời màn là sớm bị GC -> vào lại sẽ refetch
    }),

    // Lịch sử các lần chấm (có limit)
    getAssessmentHistory: builder.query({
      // arg: { userId, limit }
      query: ({ userId, limit = 20 }) =>
        `${ASSESSMENTS_URL}/${userId}/history?limit=${limit}`,
      providesTags: (result, error, arg) => [tagHistory(arg.userId)],
    }),

    // Cập nhật một bản chấm theo id (simple mode)
    updateAssessment: builder.mutation({
      // ⚠️ nhận thêm userId để biết invalidates tag nào
      // arg: { id, userId, singleLevel, doubleLevel, meta, note }
      query: ({ id, singleLevel, doubleLevel, meta, note }) => ({
        url: `${ASSESSMENTS_URL}/${id}`,
        method: "PUT",
        body: {
          ...(singleLevel !== undefined ? { singleLevel } : {}),
          ...(doubleLevel !== undefined ? { doubleLevel } : {}),
          ...(meta ? { meta } : {}),
          ...(typeof note === "string" ? { note } : {}),
        },
      }),
      invalidatesTags: (result, error, arg) => [
        tagLatest(arg.userId),
        tagHistory(arg.userId),
        tagRanking(arg.userId),
      ],
    }),

    // (tuỳ chọn) Lấy ranking hiện tại của user – nếu bạn có route này
    getRankingByUser: builder.query({
      // arg: userId
      query: (userId) => `/api/rankings/${userId}`,
      providesTags: (result, error, userId) => [tagRanking(userId)],
    }),
  }),
});

export const {
  useCreateAssessmentMutation,
  useGetLatestAssessmentQuery,
  useGetAssessmentHistoryQuery,
  useUpdateAssessmentMutation,
  useGetRankingByUserQuery,
} = assessmentsApiSlice;
