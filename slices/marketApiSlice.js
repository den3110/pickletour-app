// slices/marketApiSlice.js — Mobile RTK Query cho Chợ PickleTour
import { apiSlice } from "./apiSlice";

export const marketApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    listMarket: builder.query({
      query: (params = {}) => {
        const p = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => {
          if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
        });
        const qs = p.toString();
        return { url: `/api/market${qs ? `?${qs}` : ""}`, method: "GET" };
      },
      serializeQueryArgs: ({ queryArgs }) => {
        const { page: _p, ...rest } = queryArgs || {};
        return rest;
      },
      merge: (cache, res, { arg }) => {
        if (!arg?.page || arg.page <= 1) return res;
        const ids = new Set((cache?.items || []).map((i) => String(i._id)));
        const add = (res?.items || []).filter((i) => !ids.has(String(i._id)));
        return { ...res, items: [...(cache?.items || []), ...add] };
      },
      forceRefetch({ currentArg, previousArg }) {
        return currentArg?.page !== previousArg?.page;
      },
    }),
    getMarketListing: builder.query({
      query: (id) => ({ url: `/api/market/${id}`, method: "GET" }),
    }),
    myMarketListings: builder.query({
      query: (status) => ({
        url: `/api/market/mine${status ? `?status=${status}` : ""}`,
        method: "GET",
      }),
    }),
    savedMarketListings: builder.query({
      query: (page = 1) => ({ url: `/api/market/saved?page=${page}`, method: "GET" }),
    }),
    marketCanPost: builder.query({
      query: () => ({ url: `/api/market/me/can-post`, method: "GET" }),
    }),
    uploadMarketMedia: builder.mutation({
      query: (formData) => ({
        url: `/api/market/upload`,
        method: "POST",
        body: formData,
      }),
    }),
    createMarketListing: builder.mutation({
      query: (body) => ({ url: `/api/market`, method: "POST", body }),
    }),
    updateMarketListing: builder.mutation({
      query: ({ id, ...body }) => ({ url: `/api/market/${id}`, method: "PUT", body }),
    }),
    updateMarketStatus: builder.mutation({
      query: ({ id, status }) => ({
        url: `/api/market/${id}/status`,
        method: "PATCH",
        body: { status },
      }),
    }),
    deleteMarketListing: builder.mutation({
      query: (id) => ({ url: `/api/market/${id}`, method: "DELETE" }),
    }),
    toggleSaveMarket: builder.mutation({
      query: (id) => ({ url: `/api/market/${id}/save`, method: "POST" }),
    }),
    createMarketOffer: builder.mutation({
      query: ({ id, amount, message }) => ({
        url: `/api/market/${id}/offers`,
        method: "POST",
        body: { amount, message },
      }),
    }),
    listMarketOffers: builder.query({
      query: (id) => ({ url: `/api/market/${id}/offers`, method: "GET" }),
    }),
    respondMarketOffer: builder.mutation({
      query: ({ offerId, action }) => ({
        url: `/api/market/offers/${offerId}`,
        method: "PATCH",
        body: { action },
      }),
    }),
    myMarketOffers: builder.query({
      query: () => ({ url: `/api/market/offers/mine`, method: "GET" }),
    }),
    cancelMarketOffer: builder.mutation({
      query: (offerId) => ({
        url: `/api/market/offers/${offerId}`,
        method: "DELETE",
      }),
    }),
  }),
  overrideExisting: false,
});

export const {
  useListMarketQuery,
  useGetMarketListingQuery,
  useMyMarketListingsQuery,
  useSavedMarketListingsQuery,
  useMarketCanPostQuery,
  useUploadMarketMediaMutation,
  useCreateMarketListingMutation,
  useUpdateMarketListingMutation,
  useUpdateMarketStatusMutation,
  useDeleteMarketListingMutation,
  useToggleSaveMarketMutation,
  useCreateMarketOfferMutation,
  useListMarketOffersQuery,
  useRespondMarketOfferMutation,
  useMyMarketOffersQuery,
  useCancelMarketOfferMutation,
} = marketApiSlice;
