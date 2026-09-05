// slices/eventLiveApiSlice.js — Xem live giải đấu qua YouTube (public)
import { apiSlice } from "./apiSlice";

export const eventLiveApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getEventLive: builder.query({
      query: () => ({ url: `/api/event-live`, method: "GET" }),
      keepUnusedDataFor: 30,
    }),
    getEventLiveConfig: builder.query({
      query: () => ({ url: `/api/event-live/config`, method: "GET" }),
      keepUnusedDataFor: 120,
    }),
    trackEventLiveView: builder.mutation({
      query: (body) => ({
        url: `/api/event-live/track`,
        method: "POST",
        body: body || {},
      }),
    }),
    // Live comments
    getEventLiveComments: builder.query({
      query: ({ before, limit = 30 } = {}) => {
        const p = new URLSearchParams();
        if (limit) p.set("limit", String(limit));
        if (before) p.set("before", before);
        return { url: `/api/event-live/comments?${p.toString()}` };
      },
      keepUnusedDataFor: 10,
    }),
    postEventLiveComment: builder.mutation({
      query: (body) => ({
        url: `/api/event-live/comments`,
        method: "POST",
        body,
      }),
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetEventLiveQuery,
  useGetEventLiveConfigQuery,
  useTrackEventLiveViewMutation,
  useGetEventLiveCommentsQuery,
  usePostEventLiveCommentMutation,
} = eventLiveApiSlice;
