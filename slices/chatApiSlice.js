import { apiSlice } from "./apiSlice";

function buildHistoryParams(arg = {}) {
  if (typeof arg === "number") {
    return { limit: String(arg) };
  }

  const params = {};

  if (arg?.before) {
    params.before = String(arg.before);
  }

  if (Number.isFinite(arg?.limit) && Number(arg.limit) > 0) {
    params.limit = String(arg.limit);
  }

  return params;
}

export const chatApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    sendMessage: builder.mutation({
      query: (data) => ({
        url: "/api/chat",
        method: "POST",
        body: data,
      }),
      invalidatesTags: [{ type: "ChatHistory", id: "LIST" }],
    }),
    getChatHistory: builder.query({
      query: (arg = {}) => ({
        url: "/api/chat/history",
        method: "GET",
        params: buildHistoryParams(arg),
      }),
      providesTags: (result) =>
        result?.messages
          ? [
              { type: "ChatHistory", id: "LIST" },
              ...result.messages.map((m) => ({
                type: "ChatHistory",
                id: m._id || m.id,
              })),
            ]
          : [{ type: "ChatHistory", id: "LIST" }],
    }),
    clearChatHistory: builder.mutation({
      query: () => ({
        url: "/api/chat/history",
        method: "DELETE",
      }),
      invalidatesTags: [{ type: "ChatHistory", id: "LIST" }],
    }),
    clearLearningMemory: builder.mutation({
      query: () => ({
        url: "/api/chat/learning",
        method: "DELETE",
      }),
    }),
    sendChatFeedback: builder.mutation({
      query: (data) => ({
        url: "/api/chat/feedback",
        method: "POST",
        body: data,
      }),
    }),
    sendChatTelemetryEvent: builder.mutation({
      query: (data) => ({
        url: "/api/chat/telemetry/event",
        method: "POST",
        body: data,
      }),
    }),
    commitChatMutation: builder.mutation({
      query: (data) => ({
        url: "/api/chat/mutation/commit",
        method: "POST",
        body: data,
      }),
    }),
  }),
  overrideExisting: true,
});

export const {
  useSendMessageMutation,
  useGetChatHistoryQuery,
  useLazyGetChatHistoryQuery,
  useClearChatHistoryMutation,
  useClearLearningMemoryMutation,
  useSendChatFeedbackMutation,
  useSendChatTelemetryEventMutation,
  useCommitChatMutationMutation,
} = chatApiSlice;

export const useSendChatMessageMutation = useSendMessageMutation;
