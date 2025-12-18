import { apiSlice } from "./apiSlice";

export const supportApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getMyTickets: builder.query({
      query: () => ({ url: "/api/support/tickets" }),
      providesTags: (res) =>
        res
          ? [{ type: "SupportTicket", id: "LIST" }, ...res.map((t) => ({ type: "SupportTicket", id: t._id }))]
          : [{ type: "SupportTicket", id: "LIST" }],
    }),

    getTicketDetail: builder.query({
      query: (ticketId) => ({ url: `/api/support/tickets/${ticketId}` }),
      providesTags: (res, err, ticketId) => [{ type: "SupportTicket", id: ticketId }],
    }),

    createTicket: builder.mutation({
      query: (body) => ({
        url: "/api/support/tickets",
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "SupportTicket", id: "LIST" }],
    }),

    sendMessage: builder.mutation({
      query: ({ ticketId, ...body }) => ({
        url: `/api/support/tickets/${ticketId}/messages`,
        method: "POST",
        body,
      }),
      invalidatesTags: (res, err, arg) => [
        { type: "SupportTicket", id: "LIST" },
        { type: "SupportTicket", id: arg.ticketId },
      ],
    }),
  }),
});

export const {
  useGetMyTicketsQuery,
  useGetTicketDetailQuery,
  useCreateTicketMutation,
  useSendMessageMutation,
} = supportApiSlice;
