// slices/chessApiSlice.ts — Cờ vua
import { apiSlice } from "./apiSlice";

export const chessApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    listChessRooms: builder.query({
      query: () => ({ url: "/api/chess/rooms" }),
      providesTags: [{ type: "ChessRoom" as any, id: "LIST" }],
    }),
    createChessRoom: builder.mutation({
      query: (body: any) => ({
        url: "/api/chess/rooms",
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "ChessRoom" as any, id: "LIST" }],
    }),
    getChessRoom: builder.query({
      query: (id: string) => ({ url: `/api/chess/rooms/${id}` }),
      providesTags: (r, e, id) => [{ type: "ChessRoom" as any, id }],
    }),
    sitChessRoom: builder.mutation({
      query: ({ roomId, seatIndex }: { roomId: string; seatIndex: number }) => ({
        url: `/api/chess/rooms/${roomId}/sit`,
        method: "POST",
        body: { seatIndex },
      }),
      invalidatesTags: (r, e, { roomId }) => [{ type: "ChessRoom" as any, id: roomId }],
    }),
    leaveChessRoom: builder.mutation({
      query: (roomId: string) => ({
        url: `/api/chess/rooms/${roomId}/leave`,
        method: "POST",
      }),
      invalidatesTags: (r, e, roomId) => [{ type: "ChessRoom" as any, id: roomId }],
    }),
    startChessHand: builder.mutation({
      query: (roomId: string) => ({
        url: `/api/chess/rooms/${roomId}/start`,
        method: "POST",
      }),
      invalidatesTags: (r, e, roomId) => [{ type: "ChessRoom" as any, id: roomId }],
    }),
    chessMove: builder.mutation({
      query: ({ roomId, from, to, promotion }: any) => ({
        url: `/api/chess/rooms/${roomId}/move`,
        method: "POST",
        body: { from, to, promotion },
      }),
      invalidatesTags: (r, e, { roomId }) => [{ type: "ChessRoom" as any, id: roomId }],
    }),
    chessResign: builder.mutation({
      query: (roomId: string) => ({
        url: `/api/chess/rooms/${roomId}/resign`,
        method: "POST",
      }),
      invalidatesTags: (r, e, roomId) => [{ type: "ChessRoom" as any, id: roomId }],
    }),
    chatChessRoom: builder.mutation({
      query: ({ roomId, text }: any) => ({
        url: `/api/chess/rooms/${roomId}/chat`,
        method: "POST",
        body: { text },
      }),
    }),
    inviteChessRoom: builder.mutation({
      query: ({ roomId, userIds }: any) => ({
        url: `/api/chess/rooms/${roomId}/invite`,
        method: "POST",
        body: { userIds },
      }),
    }),
  }),
});

export const {
  useListChessRoomsQuery,
  useCreateChessRoomMutation,
  useGetChessRoomQuery,
  useSitChessRoomMutation,
  useLeaveChessRoomMutation,
  useStartChessHandMutation,
  useChessMoveMutation,
  useChessResignMutation,
  useChatChessRoomMutation,
  useInviteChessRoomMutation,
} = chessApiSlice;
