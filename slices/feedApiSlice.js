// slices/feedApiSlice.js — Mobile RTK Query cho Bảng tin
import { apiSlice } from "./apiSlice";

export const feedApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    listFeed: builder.query({
      query: ({ cursor, tag, limit = 10 } = {}) => {
        const p = new URLSearchParams();
        if (cursor) p.set("cursor", String(cursor));
        if (tag) p.set("tag", String(tag).toLowerCase());
        if (limit) p.set("limit", String(limit));
        const qs = p.toString();
        return { url: `/api/feed${qs ? `?${qs}` : ""}`, method: "GET" };
      },
      // Cache theo (tag, limit) — bỏ cursor khỏi key để các page merge vào 1 cache entry
      serializeQueryArgs: ({ queryArgs }) => {
        const { cursor: _c, ...rest } = queryArgs || {};
        return rest;
      },
      merge: (currentCache, newResponse, { arg }) => {
        if (!arg?.cursor) {
          return newResponse;
        }
        const existingIds = new Set(
          (currentCache?.items || []).map((i) => String(i._id))
        );
        const appended = (newResponse?.items || []).filter(
          (i) => !existingIds.has(String(i._id))
        );
        return {
          ...newResponse,
          items: [...(currentCache?.items || []), ...appended],
        };
      },
      forceRefetch({ currentArg, previousArg }) {
        return currentArg?.cursor !== previousArg?.cursor;
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
    updateFeedPost: builder.mutation({
      query: ({ id, ...body }) => ({ url: `/api/feed/${id}`, method: "PATCH", body }),
    }),
    reactFeedPost: builder.mutation({
      query: ({ id, type }) => ({
        url: `/api/feed/${id}/reactions`,
        method: "POST",
        body: { type },
      }),
      invalidatesTags: (r, e, { id }) => [
        { type: "Feed", id: "LIST" },
        { type: "Feed", id },
      ],
      async onQueryStarted({ id, type }, { dispatch, queryFulfilled, getState }) {
        const patches = [];
        for (const { endpointName, originalArgs } of feedApiSlice.util.selectInvalidatedBy(
          getState(),
          [{ type: "Feed", id: "LIST" }]
        )) {
          if (endpointName !== "listFeed") continue;
          patches.push(
            dispatch(
              feedApiSlice.util.updateQueryData("listFeed", originalArgs, (draft) => {
                const item = (draft?.items || []).find((p) => String(p._id) === String(id));
                if (!item) return;
                const prev = item.myReaction;
                if (prev === type) {
                  item.myReaction = null;
                  item.reactionCount = Math.max(0, (item.reactionCount || 0) - 1);
                } else {
                  item.myReaction = type;
                  if (!prev) item.reactionCount = (item.reactionCount || 0) + 1;
                }
              })
            )
          );
        }
        patches.push(
          dispatch(
            feedApiSlice.util.updateQueryData("getFeedPost", id, (draft) => {
              if (!draft) return;
              const prev = draft.myReaction;
              if (prev === type) {
                draft.myReaction = null;
                draft.reactionCount = Math.max(0, (draft.reactionCount || 0) - 1);
              } else {
                draft.myReaction = type;
                if (!prev) draft.reactionCount = (draft.reactionCount || 0) + 1;
              }
            })
          )
        );
        try {
          await queryFulfilled;
        } catch {
          patches.forEach((p) => p.undo());
        }
      },
    }),
    saveFeedPost: builder.mutation({
      query: ({ id, save = true }) => ({
        url: `/api/feed/${id}/save`,
        method: "POST",
        body: { save },
      }),
    }),
    listSavedFeed: builder.query({
      query: (arg = {}) => {
        const p = new URLSearchParams();
        if (arg.cursor) p.set("cursor", arg.cursor);
        if (arg.limit) p.set("limit", String(arg.limit));
        const qs = p.toString();
        return { url: `/api/feed/saved${qs ? `?${qs}` : ""}`, method: "GET" };
      },
      providesTags: [{ type: "Feed", id: "SAVED" }],
    }),
    voteFeedPoll: builder.mutation({
      query: ({ id, optionIds }) => ({
        url: `/api/feed/${id}/vote`,
        method: "POST",
        body: { optionIds },
      }),
    }),
    shareFeedPost: builder.mutation({
      query: (id) => ({ url: `/api/feed/${id}/share`, method: "POST" }),
      async onQueryStarted(id, { dispatch, queryFulfilled, getState }) {
        const patches = [];
        for (const { endpointName, originalArgs } of feedApiSlice.util.selectInvalidatedBy(
          getState(),
          [{ type: "Feed", id: "LIST" }]
        )) {
          if (endpointName !== "listFeed") continue;
          patches.push(
            dispatch(
              feedApiSlice.util.updateQueryData("listFeed", originalArgs, (draft) => {
                const item = (draft?.items || []).find((p) => String(p._id) === String(id));
                if (item) item.shareCount = (item.shareCount || 0) + 1;
              })
            )
          );
        }
        patches.push(
          dispatch(
            feedApiSlice.util.updateQueryData("getFeedPost", id, (draft) => {
              if (draft) draft.shareCount = (draft.shareCount || 0) + 1;
            })
          )
        );
        try {
          await queryFulfilled;
        } catch {
          patches.forEach((p) => p.undo());
        }
      },
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
      query: ({ postId, content, parent, media }) => ({
        url: `/api/feed/${postId}/comments`,
        method: "POST",
        body: { content, parent, media },
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
    reportFeedComment: builder.mutation({
      query: ({ id, reason, note }) => ({
        url: `/api/feed/comments/${id}/reports`,
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
    reactFeedComment: builder.mutation({
      query: ({ cid, type }) => ({
        url: `/api/feed/comments/${cid}/reactions`,
        method: "POST",
        body: { type },
      }),
      invalidatesTags: (r, e, { postId }) =>
        postId
          ? [
              { type: "FeedComments", id: `${postId}:root` },
              { type: "FeedComments", id: `${postId}` },
            ]
          : ["FeedComments"],
    }),
    listPostReactors: builder.query({
      query: ({ postId, type }) => {
        const p = new URLSearchParams();
        if (type) p.set("type", String(type));
        const qs = p.toString();
        return {
          url: `/api/feed/${postId}/reactions${qs ? `?${qs}` : ""}`,
          method: "GET",
        };
      },
    }),
    listCommentReactors: builder.query({
      query: ({ cid, type }) => {
        const p = new URLSearchParams();
        if (type) p.set("type", String(type));
        const qs = p.toString();
        return {
          url: `/api/feed/comments/${cid}/reactions${qs ? `?${qs}` : ""}`,
          method: "GET",
        };
      },
    }),
  }),
});

export const {
  useListFeedQuery,
  useGetFeedPostQuery,
  useCreateFeedPostMutation,
  useDeleteFeedPostMutation,
  useUpdateFeedPostMutation,
  useReactFeedPostMutation,
  useShareFeedPostMutation,
  useSaveFeedPostMutation,
  useListSavedFeedQuery,
  useVoteFeedPollMutation,
  useListFeedCommentsQuery,
  useCreateFeedCommentMutation,
  useDeleteFeedCommentMutation,
  useReportFeedPostMutation,
  useReportFeedCommentMutation,
  useUploadFeedMediaMutation,
  useReactFeedCommentMutation,
  useListPostReactorsQuery,
  useLazyListPostReactorsQuery,
  useListCommentReactorsQuery,
  useLazyListCommentReactorsQuery,
} = feedApiSlice;
