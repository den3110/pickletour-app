// slices/venuesApiSlice.js — Sân/cụm sân đặt chỗ (mobile)
import { apiSlice } from "./apiSlice";

export const venuesApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    listVenues: builder.query({
      query: (params = {}) => {
        const p = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => {
          if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
        });
        const qs = p.toString();
        return { url: `/api/venues${qs ? `?${qs}` : ""}` };
      },
      providesTags: [{ type: "Venue", id: "LIST" }],
    }),
    getVenue: builder.query({
      query: (id) => ({ url: `/api/venues/${id}` }),
      providesTags: (r, e, id) => [{ type: "Venue", id }],
    }),
    getVenueAvailability: builder.query({
      query: ({ venueId, date }) => ({
        url: `/api/venues/${venueId}/availability?date=${date}`,
      }),
      providesTags: (r, e, { venueId, date }) => [
        { type: "Booking", id: `AVAIL-${venueId}-${date}` },
      ],
    }),
    listMyVenues: builder.query({
      query: () => ({ url: `/api/venues/mine` }),
      providesTags: [{ type: "Venue", id: "MINE" }],
    }),
  }),
  overrideExisting: false,
});

export const {
  useListVenuesQuery,
  useGetVenueQuery,
  useGetVenueAvailabilityQuery,
  useListMyVenuesQuery,
} = venuesApiSlice;
