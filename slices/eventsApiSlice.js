// slices/eventsApiSlice.js — Sự kiện xé vé / đánh social (chủ sân + người chơi)
import { apiSlice } from "./apiSlice";

export const eventsApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    /* -------- Người chơi -------- */
    listPublicEvents: builder.query({
      query: (venueId) => ({ url: `/api/events${venueId ? `?venue=${venueId}` : ""}` }),
      providesTags: [{ type: "Event", id: "PUBLIC" }],
    }),
    getEvent: builder.query({
      query: (eventId) => ({ url: `/api/events/${eventId}` }),
      providesTags: (r, e, id) => [{ type: "Event", id }],
    }),
    registerEvent: builder.mutation({
      query: ({ eventId, ...body }) => ({ url: `/api/events/${eventId}/register`, method: "POST", body }),
      invalidatesTags: (r, e, a) => [{ type: "Event", id: a.eventId }, { type: "Event", id: "MINE" }, { type: "Event", id: "PUBLIC" }],
    }),
    listMyEventRegs: builder.query({
      query: () => ({ url: `/api/events/mine` }),
      providesTags: [{ type: "Event", id: "MINE" }],
    }),
    submitEventProof: builder.mutation({
      query: ({ regId, ...body }) => ({ url: `/api/events/registrations/${regId}/proof`, method: "POST", body }),
      invalidatesTags: [{ type: "Event", id: "MINE" }],
    }),
    cancelMyEventReg: builder.mutation({
      query: (regId) => ({ url: `/api/events/registrations/${regId}`, method: "DELETE" }),
      invalidatesTags: [{ type: "Event", id: "MINE" }, { type: "Event", id: "PUBLIC" }],
    }),
    /* -------- Chủ sân -------- */
    listVenueEvents: builder.query({
      query: (venueId) => ({ url: `/api/venues/${venueId}/events` }),
      providesTags: (r, e, venueId) => [{ type: "Event", id: `VENUE-${venueId}` }],
    }),
    createEvent: builder.mutation({
      query: ({ venueId, ...body }) => ({ url: `/api/venues/${venueId}/events`, method: "POST", body }),
      invalidatesTags: (r, e, a) => [{ type: "Event", id: `VENUE-${a.venueId}` }, { type: "Event", id: "PUBLIC" }],
    }),
    updateEvent: builder.mutation({
      query: ({ venueId, eventId, ...body }) => ({ url: `/api/venues/${venueId}/events/${eventId}`, method: "PATCH", body }),
      invalidatesTags: (r, e, a) => [{ type: "Event", id: `VENUE-${a.venueId}` }, { type: "Event", id: a.eventId }],
    }),
    cancelEvent: builder.mutation({
      query: ({ venueId, eventId }) => ({ url: `/api/venues/${venueId}/events/${eventId}`, method: "DELETE" }),
      invalidatesTags: (r, e, a) => [{ type: "Event", id: `VENUE-${a.venueId}` }, { type: "Event", id: "PUBLIC" }],
    }),
    listEventRegistrations: builder.query({
      query: ({ venueId, eventId }) => ({ url: `/api/venues/${venueId}/events/${eventId}/registrations` }),
      providesTags: (r, e, a) => [{ type: "Event", id: `REG-${a.eventId}` }],
    }),
    updateRegistration: builder.mutation({
      query: ({ venueId, eventId, regId, ...body }) => ({ url: `/api/venues/${venueId}/events/${eventId}/registrations/${regId}`, method: "PATCH", body }),
      invalidatesTags: (r, e, a) => [{ type: "Event", id: `REG-${a.eventId}` }, { type: "Event", id: `VENUE-${a.venueId}` }],
    }),
    checkInEvent: builder.mutation({
      query: (body) => ({ url: `/api/events/checkin`, method: "POST", body }),
      invalidatesTags: (r, e, a) => (a.eventId ? [{ type: "Event", id: `REG-${a.eventId}` }] : []),
    }),
  }),
  overrideExisting: false,
});

export const {
  useListPublicEventsQuery,
  useGetEventQuery,
  useRegisterEventMutation,
  useListMyEventRegsQuery,
  useSubmitEventProofMutation,
  useCancelMyEventRegMutation,
  useListVenueEventsQuery,
  useCreateEventMutation,
  useUpdateEventMutation,
  useCancelEventMutation,
  useListEventRegistrationsQuery,
  useUpdateRegistrationMutation,
  useCheckInEventMutation,
} = eventsApiSlice;
