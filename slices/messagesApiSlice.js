// slices/messagesApiSlice.js — Nhắn tin (khác với chatApiSlice là AI chat Pikora).
import { apiSlice } from "./apiSlice";

export const messagesApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    listConversations: builder.query({
      query: ({ cursor, limit = 20 } = {}) => {
        const p = new URLSearchParams();
        if (cursor) p.set("cursor", String(cursor));
        if (limit) p.set("limit", String(limit));
        const qs = p.toString();
        return {
          url: `/api/chat/conversations${qs ? `?${qs}` : ""}`,
          method: "GET",
        };
      },
      providesTags: [{ type: "Chat", id: "LIST" }],
    }),
    openDm: builder.mutation({
      query: (peerUserId) => ({
        url: `/api/chat/conversations/dm`,
        method: "POST",
        body: { peerUserId },
      }),
      invalidatesTags: [{ type: "Chat", id: "LIST" }],
    }),
    openTournamentChat: builder.mutation({
      query: (tid) => ({
        url: `/api/chat/conversations/tournament/${tid}`,
        method: "POST",
      }),
      invalidatesTags: [{ type: "Chat", id: "LIST" }],
    }),
    getConversation: builder.query({
      query: (cid) => ({ url: `/api/chat/conversations/${cid}`, method: "GET" }),
      providesTags: (r, e, cid) => [{ type: "Chat", id: cid }],
    }),
    patchConversation: builder.mutation({
      query: ({ cid, ...body }) => ({
        url: `/api/chat/conversations/${cid}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: (r, e, { cid }) => [
        { type: "Chat", id: cid },
        { type: "Chat", id: "LIST" },
      ],
    }),
    listMessages: builder.query({
      query: ({ cid, cursor, limit = 30 } = {}) => {
        const p = new URLSearchParams();
        if (cursor) p.set("cursor", String(cursor));
        if (limit) p.set("limit", String(limit));
        const qs = p.toString();
        return {
          url: `/api/chat/conversations/${cid}/messages${qs ? `?${qs}` : ""}`,
          method: "GET",
        };
      },
      providesTags: (r, e, { cid }) => [{ type: "ChatMessages", id: cid }],
    }),
    // Tên `sendDmMessage` (không phải `sendMessage`) để tránh đụng với
    // `sendMessage` của Pikora AI chat (slices/chatApiSlice.js).
    sendDmMessage: builder.mutation({
      query: ({ cid, content, attachments, replyTo }) => ({
        url: `/api/chat/conversations/${cid}/messages`,
        method: "POST",
        body: { content, attachments, replyTo },
      }),
      invalidatesTags: (r, e, { cid }) => [
        { type: "ChatMessages", id: cid },
        { type: "Chat", id: "LIST" },
      ],
    }),
    markRead: builder.mutation({
      query: (cid) => ({
        url: `/api/chat/conversations/${cid}/read`,
        method: "POST",
      }),
      invalidatesTags: [{ type: "Chat", id: "LIST" }],
    }),
    deleteMessage: builder.mutation({
      query: (mid) => ({ url: `/api/chat/messages/${mid}`, method: "DELETE" }),
    }),
    uploadChatMedia: builder.mutation({
      query: (formData) => ({
        url: `/api/chat/upload`,
        method: "POST",
        body: formData,
      }),
    }),
    typing: builder.mutation({
      query: (cid) => ({
        url: `/api/chat/conversations/${cid}/typing`,
        method: "POST",
      }),
    }),
  }),
});

export const {
  useListConversationsQuery,
  useOpenDmMutation,
  useOpenTournamentChatMutation,
  useGetConversationQuery,
  usePatchConversationMutation,
  useListMessagesQuery,
  useSendDmMessageMutation,
  useMarkReadMutation,
  useDeleteMessageMutation,
  useUploadChatMediaMutation,
  useTypingMutation,
} = messagesApiSlice;
