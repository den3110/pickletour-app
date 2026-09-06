// slices/venueOwnerApiSlice.js — Quản lý cụm sân cho chủ sân (mobile)
import { apiSlice } from "./apiSlice";

export const venueOwnerApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    myVenuesOverview: builder.query({
      query: () => ({ url: `/api/venues/mine/overview` }),
      providesTags: [{ type: "Venue", id: "OVERVIEW" }],
    }),
    createVenue: builder.mutation({
      query: (body) => ({ url: `/api/venues`, method: "POST", body }),
      invalidatesTags: [{ type: "Venue", id: "MINE" }, { type: "Venue", id: "OVERVIEW" }],
    }),
    updateVenue: builder.mutation({
      query: ({ id, ...body }) => ({ url: `/api/venues/${id}`, method: "PUT", body }),
      invalidatesTags: (r, e, arg) => [{ type: "Venue", id: arg.id }, { type: "Venue", id: "MINE" }],
    }),
    addCourt: builder.mutation({
      query: ({ venueId, ...body }) => ({ url: `/api/venues/${venueId}/courts`, method: "POST", body }),
      invalidatesTags: (r, e, arg) => [{ type: "Venue", id: arg.venueId }],
    }),
    updateCourt: builder.mutation({
      query: ({ venueId, courtId, ...body }) => ({ url: `/api/venues/${venueId}/courts/${courtId}`, method: "PUT", body }),
      invalidatesTags: (r, e, arg) => [{ type: "Venue", id: arg.venueId }],
    }),
    deleteCourt: builder.mutation({
      query: ({ venueId, courtId }) => ({ url: `/api/venues/${venueId}/courts/${courtId}`, method: "DELETE" }),
      invalidatesTags: (r, e, arg) => [{ type: "Venue", id: arg.venueId }],
    }),
    // Khoá sân / bảo trì
    listBlocks: builder.query({
      query: ({ venueId, from, to }) => {
        const p = new URLSearchParams();
        if (from) p.set("from", from);
        if (to) p.set("to", to);
        return { url: `/api/venues/${venueId}/blocks?${p.toString()}` };
      },
      providesTags: (r, e, arg) => [{ type: "Venue", id: `BLOCKS-${arg.venueId}` }],
    }),
    createBlock: builder.mutation({
      query: ({ venueId, ...body }) => ({ url: `/api/venues/${venueId}/blocks`, method: "POST", body }),
      invalidatesTags: (r, e, arg) => [{ type: "Venue", id: `BLOCKS-${arg.venueId}` }],
    }),
    deleteBlock: builder.mutation({
      query: ({ venueId, blockId }) => ({ url: `/api/venues/${venueId}/blocks/${blockId}`, method: "DELETE" }),
      invalidatesTags: (r, e, arg) => [{ type: "Venue", id: `BLOCKS-${arg.venueId}` }],
    }),
    // Mã giảm giá
    listPromos: builder.query({
      query: (venueId) => ({ url: `/api/venues/${venueId}/promos` }),
      providesTags: (r, e, venueId) => [{ type: "Venue", id: `PROMOS-${venueId}` }],
    }),
    createPromo: builder.mutation({
      query: ({ venueId, ...body }) => ({ url: `/api/venues/${venueId}/promos`, method: "POST", body }),
      invalidatesTags: (r, e, arg) => [{ type: "Venue", id: `PROMOS-${arg.venueId}` }],
    }),
    updatePromo: builder.mutation({
      query: ({ venueId, promoId, ...body }) => ({ url: `/api/venues/${venueId}/promos/${promoId}`, method: "PATCH", body }),
      invalidatesTags: (r, e, arg) => [{ type: "Venue", id: `PROMOS-${arg.venueId}` }],
    }),
    deletePromo: builder.mutation({
      query: ({ venueId, promoId }) => ({ url: `/api/venues/${venueId}/promos/${promoId}`, method: "DELETE" }),
      invalidatesTags: (r, e, arg) => [{ type: "Venue", id: `PROMOS-${arg.venueId}` }],
    }),
    validatePromo: builder.query({
      query: ({ venueId, code, total }) => ({
        url: `/api/venues/${venueId}/promos/validate?code=${encodeURIComponent(code)}&total=${total}`,
      }),
    }),
    // Đặt định kỳ
    createRecurring: builder.mutation({
      query: ({ venueId, ...body }) => ({ url: `/api/venues/${venueId}/recurring`, method: "POST", body }),
      invalidatesTags: (r, e, arg) => [{ type: "Booking", id: `VENUE-${arg.venueId}` }],
    }),
  }),
  overrideExisting: false,
});

export const {
  useMyVenuesOverviewQuery,
  useCreateVenueMutation,
  useUpdateVenueMutation,
  useAddCourtMutation,
  useUpdateCourtMutation,
  useDeleteCourtMutation,
  useListBlocksQuery,
  useCreateBlockMutation,
  useDeleteBlockMutation,
  useListPromosQuery,
  useCreatePromoMutation,
  useUpdatePromoMutation,
  useDeletePromoMutation,
  useLazyValidatePromoQuery,
  useCreateRecurringMutation,
} = venueOwnerApiSlice;
