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
  }),
  overrideExisting: false,
});

export const {
  useGetEventLiveQuery,
  useGetEventLiveConfigQuery,
  useTrackEventLiveViewMutation,
} = eventLiveApiSlice;
