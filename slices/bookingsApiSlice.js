// slices/bookingsApiSlice.js — Đặt sân (mobile)
import { apiSlice } from "./apiSlice";

export const bookingsApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    createBooking: builder.mutation({
      query: (body) => ({ url: `/api/bookings`, method: "POST", body }),
      invalidatesTags: (r, e, arg) => [
        { type: "Booking", id: "MINE" },
        { type: "Booking", id: `AVAIL-${arg.venueId}-${arg.date}` },
        { type: "Booking", id: `VENUE-${arg.venueId}` },
      ],
    }),
    listMyBookings: builder.query({
      query: ({ status = "" } = {}) => ({
        url: `/api/bookings/mine${status ? `?status=${status}` : ""}`,
      }),
      providesTags: [{ type: "Booking", id: "MINE" }],
    }),
    getBooking: builder.query({
      query: (id) => ({ url: `/api/bookings/${id}` }),
      providesTags: (r, e, id) => [{ type: "Booking", id }],
    }),
    listVenueBookings: builder.query({
      query: ({ venueId, date = "", from = "", to = "", status = "" }) => {
        const p = new URLSearchParams();
        if (date) p.set("date", date);
        if (from) p.set("from", from);
        if (to) p.set("to", to);
        if (status) p.set("status", status);
        const qs = p.toString();
        return { url: `/api/venues/${venueId}/bookings${qs ? `?${qs}` : ""}` };
      },
      providesTags: (r, e, arg) => [{ type: "Booking", id: `VENUE-${arg.venueId}` }],
    }),
    updateBookingStatus: builder.mutation({
      query: ({ id, status, cancelReason }) => ({
        url: `/api/bookings/${id}/status`,
        method: "PATCH",
        body: { status, cancelReason },
      }),
      invalidatesTags: (r, e, arg) => [
        { type: "Booking", id: "MINE" },
        { type: "Booking", id: arg.id },
        { type: "Booking", id: `VENUE-${arg.venueId || ""}` },
      ],
    }),
    submitPaymentProof: builder.mutation({
      query: ({ id, imageUrl, note }) => ({
        url: `/api/bookings/${id}/payment-proof`,
        method: "POST",
        body: { imageUrl, note },
      }),
      invalidatesTags: (r, e, arg) => [
        { type: "Booking", id: "MINE" },
        { type: "Booking", id: arg.id },
      ],
    }),
    approveBooking: builder.mutation({
      query: ({ id }) => ({ url: `/api/bookings/${id}/approve`, method: "PATCH" }),
      invalidatesTags: (r, e, arg) => [
        { type: "Booking", id: arg.id },
        { type: "Booking", id: `VENUE-${arg.venueId || ""}` },
      ],
    }),
    rejectBooking: builder.mutation({
      query: ({ id, reason }) => ({
        url: `/api/bookings/${id}/reject`,
        method: "PATCH",
        body: { reason },
      }),
      invalidatesTags: (r, e, arg) => [
        { type: "Booking", id: arg.id },
        { type: "Booking", id: `VENUE-${arg.venueId || ""}` },
      ],
    }),
    checkInBooking: builder.mutation({
      query: ({ token }) => ({ url: `/api/bookings/checkin`, method: "POST", body: { token } }),
      invalidatesTags: (r, e, arg) => [{ type: "Booking", id: `VENUE-${arg.venueId || ""}` }],
    }),
    getVenueRevenue: builder.query({
      query: ({ venueId, from, to }) => ({
        url: `/api/venues/${venueId}/revenue?from=${from}&to=${to}`,
      }),
      providesTags: (r, e, arg) => [{ type: "Booking", id: `VENUE-${arg.venueId}` }],
    }),
    // Sân mở ghép (open play)
    listOpenPlay: builder.query({
      query: ({ province = "" } = {}) => ({
        url: `/api/bookings/open-play${province ? `?province=${encodeURIComponent(province)}` : ""}`,
      }),
      providesTags: [{ type: "Booking", id: "OPENPLAY" }],
    }),
    joinOpenPlay: builder.mutation({
      query: (id) => ({ url: `/api/bookings/${id}/open-play/join`, method: "POST" }),
      invalidatesTags: (r, e, id) => [
        { type: "Booking", id: "OPENPLAY" },
        { type: "Booking", id },
      ],
    }),
    leaveOpenPlay: builder.mutation({
      query: (id) => ({ url: `/api/bookings/${id}/open-play/leave`, method: "POST" }),
      invalidatesTags: (r, e, id) => [
        { type: "Booking", id: "OPENPLAY" },
        { type: "Booking", id },
      ],
    }),
    // Báo cáo khách bỏ hẹn (chủ sân)
    getNoShowReport: builder.query({
      query: ({ venueId, from = "", to = "" }) => {
        const p = new URLSearchParams();
        if (from) p.set("from", from);
        if (to) p.set("to", to);
        const qs = p.toString();
        return { url: `/api/venues/${venueId}/no-show-report${qs ? `?${qs}` : ""}` };
      },
    }),
  }),
  overrideExisting: false,
});

export const {
  useCreateBookingMutation,
  useListMyBookingsQuery,
  useGetBookingQuery,
  useListVenueBookingsQuery,
  useUpdateBookingStatusMutation,
  useSubmitPaymentProofMutation,
  useApproveBookingMutation,
  useRejectBookingMutation,
  useCheckInBookingMutation,
  useGetVenueRevenueQuery,
  useListOpenPlayQuery,
  useJoinOpenPlayMutation,
  useLeaveOpenPlayMutation,
  useGetNoShowReportQuery,
} = bookingsApiSlice;
