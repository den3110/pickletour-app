// slices/phomApiSlice.ts — Phỏm (Tá lả)
import { apiSlice } from "./apiSlice";

export const phomApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    listPhomRooms: builder.query({
      query: () => ({ url: "/api/phom/rooms" }),
      providesTags: [{ type: "PhomRoom" as any, id: "LIST" }],
    }),
    createPhomRoom: builder.mutation({
      query: (body: any) => ({
        url: "/api/phom/rooms",
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "PhomRoom" as any, id: "LIST" }],
    }),
    getPhomRoom: builder.query({
      query: (id: string) => ({ url: `/api/phom/rooms/${id}` }),
      providesTags: (r, e, id) => [{ type: "PhomRoom" as any, id }],
    }),
    sitPhomRoom: builder.mutation({
      query: ({ roomId, seatIndex }: { roomId: string; seatIndex: number }) => ({
        url: `/api/phom/rooms/${roomId}/sit`,
        method: "POST",
        body: { seatIndex },
      }),
      invalidatesTags: (r, e, { roomId }) => [
        { type: "PhomRoom" as any, id: roomId },
      ],
    }),
    leavePhomRoom: builder.mutation({
      query: (roomId: string) => ({
        url: `/api/phom/rooms/${roomId}/leave`,
        method: "POST",
      }),
      invalidatesTags: (r, e, roomId) => [
        { type: "PhomRoom" as any, id: roomId },
      ],
    }),
    startPhomHand: builder.mutation({
      query: (roomId: string) => ({
        url: `/api/phom/rooms/${roomId}/start`,
        method: "POST",
      }),
      invalidatesTags: (r, e, roomId) => [
        { type: "PhomRoom" as any, id: roomId },
      ],
    }),
    phomAction: builder.mutation({
      query: ({
        roomId,
        action,
        card,
        cards,
      }: {
        roomId: string;
        action: string;
        card?: string;
        cards?: string[];
      }) => ({
        url: `/api/phom/rooms/${roomId}/action`,
        method: "POST",
        body: { action, card, cards },
      }),
      invalidatesTags: (r, e, { roomId }) => [
        { type: "PhomRoom" as any, id: roomId },
      ],
    }),
    chatPhomRoom: builder.mutation({
      query: ({ roomId, text }: { roomId: string; text: string }) => ({
        url: `/api/phom/rooms/${roomId}/chat`,
        method: "POST",
        body: { text },
      }),
    }),
    emojiPhomRoom: builder.mutation({
      query: ({ roomId, emoji }: { roomId: string; emoji: string }) => ({
        url: `/api/phom/rooms/${roomId}/emoji`,
        method: "POST",
        body: { emoji },
      }),
    }),
    invitePhomRoom: builder.mutation({
      query: ({ roomId, userIds }: { roomId: string; userIds: string[] }) => ({
        url: `/api/phom/rooms/${roomId}/invite`,
        method: "POST",
        body: { userIds },
      }),
    }),
  }),
});

export const {
  useListPhomRoomsQuery,
  useCreatePhomRoomMutation,
  useGetPhomRoomQuery,
  useSitPhomRoomMutation,
  useLeavePhomRoomMutation,
  useStartPhomHandMutation,
  usePhomActionMutation,
  useChatPhomRoomMutation,
  useEmojiPhomRoomMutation,
  useInvitePhomRoomMutation,
} = phomApiSlice;
