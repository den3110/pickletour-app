// slices/feedApiSlice.js — Mobile RTK Query cho Bảng tin
import { apiSlice } from "./apiSlice";

export const feedApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    listFeed: builder.query({
      query: ({ cursor, tag, limit = 20 } = {}) => {
        const p = new URLSearchParams();
        if (cursor) p.set("cursor", String(cursor));
        if (tag) p.set("tag", String(tag).toLowerCase());
        if (limit) p.set("limit", String(limit));
        const qs = p.toString();
        return { url: `/api/feed${qs ? `?${qs}` : ""}`, method: "GET" };
      },
      providesTags: [{ type: "Feed", id: "LIST" }],
      keepUnusedDataFor: 30,
    }),
    getFeedPost: builder.query({
      query: (id) => ({ url: `/api/feed/${id}`, method: "GET" }),
      providesTags: (r, e, id) => [{ type: "Feed", id }],
    }),
    createFeedPost: builder.mutation({
      query: (body) => ({ url: `/api/feed`, method: "POST", body }),
      invalidatesTags: [{ type: "Feed", id: "LIST" }],
    }),
    deleteFeedPost: builder.mutation({
      query: (id) => ({ url: `/api/feed/${id}`, method: "DELETE" }),
      invalidatesTags: [{ type: "Feed", id: "LIST" }],
    }),
    reactFeedPost: builder.mutation({
      query: ({ id, type }) => ({
        url: `/api/feed/${id}/reactions`,
        method: "POST",
        body: { type },
      }),
    }),
    listFeedComments: builder.query({
      query: ({ postId, parent = null, limit = 20 } = {}) => {
        const p = new URLSearchParams();
        if (parent) p.set("parent", String(parent));
        if (limit) p.set("limit", String(limit));
        const qs = p.toString();
        return {
          url: `/api/feed/${postId}/comments${qs ? `?${qs}` : ""}`,
          method: "GET",
        };
      },
      providesTags: (r, e, { postId, parent }) => [
        { type: "FeedComments", id: `${postId}:${parent || "root"}` },
      ],
    }),
    createFeedComment: builder.mutation({
      query: ({ postId, content, parent }) => ({
        url: `/api/feed/${postId}/comments`,
        method: "POST",
        body: { content, parent },
      }),
      invalidatesTags: (r, e, { postId, parent }) => [
        { type: "FeedComments", id: `${postId}:${parent || "root"}` },
        { type: "Feed", id: postId },
      ],
    }),
    deleteFeedComment: builder.mutation({
      query: (cid) => ({ url: `/api/feed/comments/${cid}`, method: "DELETE" }),
    }),
    reportFeedPost: builder.mutation({
      query: ({ id, reason, note }) => ({
        url: `/api/feed/${id}/reports`,
        method: "POST",
        body: { reason, note },
      }),
    }),
    uploadFeedMedia: builder.mutation({
      query: (formData) => ({
        url: `/api/feed/upload/media`,
        method: "POST",
        body: formData,
      }),
    }),
  }),
});

export const {
  useListFeedQuery,
  useGetFeedPostQuery,
  useCreateFeedPostMutation,
  useDeleteFeedPostMutation,
  useReactFeedPostMutation,
  useListFeedCommentsQuery,
  useCreateFeedCommentMutation,
  useDeleteFeedCommentMutation,
  useReportFeedPostMutation,
  useUploadFeedMediaMutation,
} = feedApiSlice;
