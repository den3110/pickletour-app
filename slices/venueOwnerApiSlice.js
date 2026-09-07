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
    // Đặt định kỳ / lịch cố định
    listRecurring: builder.query({
      query: (venueId) => ({ url: `/api/venues/${venueId}/recurring` }),
      providesTags: (r, e, venueId) => [{ type: "Venue", id: `RECUR-${venueId}` }],
    }),
    createRecurring: builder.mutation({
      query: ({ venueId, ...body }) => ({ url: `/api/venues/${venueId}/recurring`, method: "POST", body }),
      invalidatesTags: (r, e, arg) => [{ type: "Booking", id: `VENUE-${arg.venueId}` }, { type: "Venue", id: `RECUR-${arg.venueId}` }],
    }),
    cancelRecurring: builder.mutation({
      query: ({ venueId, group, scope }) => ({ url: `/api/venues/${venueId}/recurring/${group}${scope ? `?scope=${scope}` : ""}`, method: "DELETE" }),
      invalidatesTags: (r, e, arg) => [{ type: "Booking", id: `VENUE-${arg.venueId}` }, { type: "Venue", id: `RECUR-${arg.venueId}` }],
    }),
    // POS — sản phẩm
    listProducts: builder.query({
      query: (venueId) => ({ url: `/api/venues/${venueId}/products?all=1` }),
      providesTags: (r, e, venueId) => [{ type: "Venue", id: `PROD-${venueId}` }],
    }),
    createProduct: builder.mutation({
      query: ({ venueId, ...body }) => ({ url: `/api/venues/${venueId}/products`, method: "POST", body }),
      invalidatesTags: (r, e, a) => [{ type: "Venue", id: `PROD-${a.venueId}` }],
    }),
    updateProduct: builder.mutation({
      query: ({ venueId, productId, ...body }) => ({ url: `/api/venues/${venueId}/products/${productId}`, method: "PATCH", body }),
      invalidatesTags: (r, e, a) => [{ type: "Venue", id: `PROD-${a.venueId}` }],
    }),
    deleteProduct: builder.mutation({
      query: ({ venueId, productId }) => ({ url: `/api/venues/${venueId}/products/${productId}`, method: "DELETE" }),
      invalidatesTags: (r, e, a) => [{ type: "Venue", id: `PROD-${a.venueId}` }],
    }),
    listSales: builder.query({
      query: ({ venueId, date }) => ({ url: `/api/venues/${venueId}/sales${date ? `?date=${date}` : ""}` }),
      providesTags: (r, e, a) => [{ type: "Venue", id: `SALES-${a.venueId}` }],
    }),
    createSale: builder.mutation({
      query: ({ venueId, ...body }) => ({ url: `/api/venues/${venueId}/sales`, method: "POST", body }),
      invalidatesTags: (r, e, a) => [{ type: "Venue", id: `SALES-${a.venueId}` }, { type: "Venue", id: `PROD-${a.venueId}` }],
    }),
    // Gói giờ / thẻ tháng (chủ sân)
    listPackagesOwner: builder.query({
      query: (venueId) => ({ url: `/api/venues/${venueId}/packages?all=1` }),
      providesTags: (r, e, venueId) => [{ type: "Venue", id: `PKG-${venueId}` }],
    }),
    createPackage: builder.mutation({
      query: ({ venueId, ...body }) => ({ url: `/api/venues/${venueId}/packages`, method: "POST", body }),
      invalidatesTags: (r, e, a) => [{ type: "Venue", id: `PKG-${a.venueId}` }],
    }),
    updatePackage: builder.mutation({
      query: ({ venueId, packageId, ...body }) => ({ url: `/api/venues/${venueId}/packages/${packageId}`, method: "PATCH", body }),
      invalidatesTags: (r, e, a) => [{ type: "Venue", id: `PKG-${a.venueId}` }],
    }),
    deletePackage: builder.mutation({
      query: ({ venueId, packageId }) => ({ url: `/api/venues/${venueId}/packages/${packageId}`, method: "DELETE" }),
      invalidatesTags: (r, e, a) => [{ type: "Venue", id: `PKG-${a.venueId}` }],
    }),
    listVenuePurchases: builder.query({
      query: ({ venueId, status }) => ({ url: `/api/venues/${venueId}/package-purchases${status ? `?status=${status}` : ""}` }),
      providesTags: (r, e, a) => [{ type: "Venue", id: `PUR-${a.venueId}` }],
    }),
    activatePurchase: builder.mutation({
      query: ({ venueId, purchaseId }) => ({ url: `/api/venues/${venueId}/package-purchases/${purchaseId}/activate`, method: "PATCH" }),
      invalidatesTags: (r, e, a) => [{ type: "Venue", id: `PUR-${a.venueId}` }],
    }),
    // Phân tích
    getAnalytics: builder.query({
      query: ({ venueId, from, to }) => ({ url: `/api/venues/${venueId}/analytics?from=${from}&to=${to}` }),
      providesTags: (r, e, a) => [{ type: "Venue", id: `ANALYTICS-${a.venueId}` }],
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
  useListRecurringQuery,
  useCreateRecurringMutation,
  useCancelRecurringMutation,
  useListProductsQuery,
  useCreateProductMutation,
  useUpdateProductMutation,
  useDeleteProductMutation,
  useListSalesQuery,
  useCreateSaleMutation,
  useListPackagesOwnerQuery,
  useCreatePackageMutation,
  useUpdatePackageMutation,
  useDeletePackageMutation,
  useListVenuePurchasesQuery,
  useActivatePurchaseMutation,
  useGetAnalyticsQuery,
} = venueOwnerApiSlice;
