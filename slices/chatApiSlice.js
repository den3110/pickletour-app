// slices/chatApiSlice.js
import { apiSlice } from "./apiSlice";

export const chatApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    sendChatMessage: builder.mutation({
      query: (message) => ({
        url: "/api/chat",
        method: "POST",
        body: { message },
      }),
      invalidatesTags: [{ type: "ChatHistory", id: "LIST" }],
    }),
    // LẤY LỊCH SỬ CHAT
    getChatHistory: builder.query({
      // truyền tham số limit (optional), default = 100
      query: (limit = 100) => ({
        // ⚠️ SỬA LẠI path NÀY CHO KHỚP BACKEND CỦA BẠN
        url: `/api/chat/history?limit=${limit}`,
        method: "GET",
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

    // XOÁ TOÀN BỘ LỊCH SỬ CHAT
    clearChatHistory: builder.mutation({
      query: () => ({
        // ⚠️ path delete history
        url: "/api/chat/history",
        method: "DELETE",
      }),
      invalidatesTags: [{ type: "ChatHistory", id: "LIST" }],
    }),

    // GỬI FEEDBACK
    sendChatFeedback: builder.mutation({
      // payload tuỳ bạn shape thế nào
      query: (payload) => ({
        // ⚠️ chỉnh path nếu cần
        url: "/api/chat/feedback",
        method: "POST",
        body: payload,
      }),
    }),
  }),
  overrideExisting: false,
});

export const {
  useSendChatMessageMutation,
  useGetChatHistoryQuery,
  useClearChatHistoryMutation,
  useSendChatFeedbackMutation,
} = chatApiSlice;
