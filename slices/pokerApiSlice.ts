// slices/pokerApiSlice.ts — Texas Hold'em poker API.
import { apiSlice } from "./apiSlice";

export const pokerApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    listPokerRooms: builder.query({
      query: () => ({ url: "/api/poker/rooms" }),
      providesTags: [{ type: "PokerRoom" as any, id: "LIST" }],
    }),
    createPokerRoom: builder.mutation({
      query: (body: any) => ({
        url: "/api/poker/rooms",
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "PokerRoom" as any, id: "LIST" }],
    }),
    getPokerRoom: builder.query({
      query: (id: string) => ({ url: `/api/poker/rooms/${id}` }),
      providesTags: (r, e, id) => [{ type: "PokerRoom" as any, id }],
    }),
    sitPokerRoom: builder.mutation({
      query: ({ roomId, seatIndex }: { roomId: string; seatIndex: number }) => ({
        url: `/api/poker/rooms/${roomId}/sit`,
        method: "POST",
        body: { seatIndex },
      }),
      invalidatesTags: (r, e, { roomId }) => [
        { type: "PokerRoom" as any, id: roomId },
      ],
    }),
    leavePokerRoom: builder.mutation({
      query: (roomId: string) => ({
        url: `/api/poker/rooms/${roomId}/leave`,
        method: "POST",
      }),
      invalidatesTags: (r, e, roomId) => [
        { type: "PokerRoom" as any, id: roomId },
      ],
    }),
    startPokerHand: builder.mutation({
      query: (roomId: string) => ({
        url: `/api/poker/rooms/${roomId}/start`,
        method: "POST",
      }),
      invalidatesTags: (r, e, roomId) => [
        { type: "PokerRoom" as any, id: roomId },
      ],
    }),
    pokerAction: builder.mutation({
      query: ({
        roomId,
        action,
        amount,
      }: {
        roomId: string;
        action: string;
        amount?: number;
      }) => ({
        url: `/api/poker/rooms/${roomId}/action`,
        method: "POST",
        body: { action, amount },
      }),
      invalidatesTags: (r, e, { roomId }) => [
        { type: "PokerRoom" as any, id: roomId },
      ],
    }),
    chatPokerRoom: builder.mutation({
      query: ({ roomId, text }: { roomId: string; text: string }) => ({
        url: `/api/poker/rooms/${roomId}/chat`,
        method: "POST",
        body: { text },
      }),
    }),
    emojiPokerRoom: builder.mutation({
      query: ({ roomId, emoji }: { roomId: string; emoji: string }) => ({
        url: `/api/poker/rooms/${roomId}/emoji`,
        method: "POST",
        body: { emoji },
      }),
    }),
    revealPokerCards: builder.mutation({
      query: (roomId: string) => ({
        url: `/api/poker/rooms/${roomId}/reveal`,
        method: "POST",
      }),
      invalidatesTags: (r, e, roomId) => [
        { type: "PokerRoom" as any, id: roomId },
      ],
    }),
  }),
});

export const {
  useListPokerRoomsQuery,
  useCreatePokerRoomMutation,
  useGetPokerRoomQuery,
  useSitPokerRoomMutation,
  useLeavePokerRoomMutation,
  useStartPokerHandMutation,
  usePokerActionMutation,
  useChatPokerRoomMutation,
  useEmojiPokerRoomMutation,
  useRevealPokerCardsMutation,
} = pokerApiSlice;
