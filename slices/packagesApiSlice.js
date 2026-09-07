// slices/packagesApiSlice.js — Gói giờ / thẻ tháng (phía khách)
import { apiSlice } from "./apiSlice";

export const packagesApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    listVenuePackages: builder.query({
      query: (venueId) => ({ url: `/api/venues/${venueId}/packages` }),
      providesTags: (r, e, venueId) => [{ type: "Venue", id: `PKGPUB-${venueId}` }],
    }),
    purchasePackage: builder.mutation({
      query: ({ venueId, packageId }) => ({ url: `/api/venues/${venueId}/packages/${packageId}/purchase`, method: "POST" }),
      invalidatesTags: ["MyPackages"],
    }),
    myPackages: builder.query({
      query: () => ({ url: `/api/packages/mine` }),
      providesTags: ["MyPackages"],
    }),
  }),
  overrideExisting: false,
});

export const { useListVenuePackagesQuery, usePurchasePackageMutation, useMyPackagesQuery } = packagesApiSlice;
