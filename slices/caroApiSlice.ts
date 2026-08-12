// slices/caroApiSlice.ts — Cờ Caro
import { apiSlice } from "./apiSlice";

export const caroApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    listCaroRooms: builder.query({
      query: () => ({ url: "/api/caro/rooms" }),
      providesTags: [{ type: "CaroRoom" as any, id: "LIST" }],
    }),
    createCaroRoom: builder.mutation({
      query: (body: any) => ({
        url: "/api/caro/rooms",
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "CaroRoom" as any, id: "LIST" }],
    }),
    getCaroRoom: builder.query({
      query: (id: string) => ({ url: `/api/caro/rooms/${id}` }),
      providesTags: (r, e, id) => [{ type: "CaroRoom" as any, id }],
    }),
    sitCaroRoom: builder.mutation({
      query: ({ roomId, seatIndex }: { roomId: string; seatIndex: number }) => ({
        url: `/api/caro/rooms/${roomId}/sit`,
        method: "POST",
        body: { seatIndex },
      }),
      invalidatesTags: (r, e, { roomId }) => [
        { type: "CaroRoom" as any, id: roomId },
      ],
    }),
    leaveCaroRoom: builder.mutation({
      query: (roomId: string) => ({
        url: `/api/caro/rooms/${roomId}/leave`,
        method: "POST",
      }),
      invalidatesTags: (r, e, roomId) => [
        { type: "CaroRoom" as any, id: roomId },
      ],
    }),
    startCaroHand: builder.mutation({
      query: (roomId: string) => ({
        url: `/api/caro/rooms/${roomId}/start`,
        method: "POST",
      }),
      invalidatesTags: (r, e, roomId) => [
        { type: "CaroRoom" as any, id: roomId },
      ],
    }),
    caroMove: builder.mutation({
      query: ({
        roomId,
        row,
        col,
      }: {
        roomId: string;
        row: number;
        col: number;
      }) => ({
        url: `/api/caro/rooms/${roomId}/move`,
        method: "POST",
        body: { row, col },
      }),
      invalidatesTags: (r, e, { roomId }) => [
        { type: "CaroRoom" as any, id: roomId },
      ],
    }),
    chatCaroRoom: builder.mutation({
      query: ({ roomId, text }: { roomId: string; text: string }) => ({
        url: `/api/caro/rooms/${roomId}/chat`,
        method: "POST",
        body: { text },
      }),
    }),
    emojiCaroRoom: builder.mutation({
      query: ({ roomId, emoji }: { roomId: string; emoji: string }) => ({
        url: `/api/caro/rooms/${roomId}/emoji`,
        method: "POST",
        body: { emoji },
      }),
    }),
    inviteCaroRoom: builder.mutation({
      query: ({ roomId, userIds }: { roomId: string; userIds: string[] }) => ({
        url: `/api/caro/rooms/${roomId}/invite`,
        method: "POST",
        body: { userIds },
      }),
    }),
  }),
});

export const {
  useListCaroRoomsQuery,
  useCreateCaroRoomMutation,
  useGetCaroRoomQuery,
  useSitCaroRoomMutation,
  useLeaveCaroRoomMutation,
  useStartCaroHandMutation,
  useCaroMoveMutation,
  useChatCaroRoomMutation,
  useEmojiCaroRoomMutation,
  useInviteCaroRoomMutation,
} = caroApiSlice;
