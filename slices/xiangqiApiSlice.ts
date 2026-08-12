// slices/xiangqiApiSlice.ts — Cờ tướng
import { apiSlice } from "./apiSlice";

export const xiangqiApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    listXiangqiRooms: builder.query({
      query: () => ({ url: "/api/xiangqi/rooms" }),
      providesTags: [{ type: "XiangqiRoom" as any, id: "LIST" }],
    }),
    createXiangqiRoom: builder.mutation({
      query: (body: any) => ({
        url: "/api/xiangqi/rooms",
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "XiangqiRoom" as any, id: "LIST" }],
    }),
    getXiangqiRoom: builder.query({
      query: (id: string) => ({ url: `/api/xiangqi/rooms/${id}` }),
      providesTags: (r, e, id) => [{ type: "XiangqiRoom" as any, id }],
    }),
    sitXiangqiRoom: builder.mutation({
      query: ({ roomId, seatIndex }: { roomId: string; seatIndex: number }) => ({
        url: `/api/xiangqi/rooms/${roomId}/sit`,
        method: "POST",
        body: { seatIndex },
      }),
      invalidatesTags: (r, e, { roomId }) => [{ type: "XiangqiRoom" as any, id: roomId }],
    }),
    leaveXiangqiRoom: builder.mutation({
      query: (roomId: string) => ({
        url: `/api/xiangqi/rooms/${roomId}/leave`,
        method: "POST",
      }),
      invalidatesTags: (r, e, roomId) => [{ type: "XiangqiRoom" as any, id: roomId }],
    }),
    startXiangqiHand: builder.mutation({
      query: (roomId: string) => ({
        url: `/api/xiangqi/rooms/${roomId}/start`,
        method: "POST",
      }),
      invalidatesTags: (r, e, roomId) => [{ type: "XiangqiRoom" as any, id: roomId }],
    }),
    xiangqiMove: builder.mutation({
      query: ({ roomId, from, to }: any) => ({
        url: `/api/xiangqi/rooms/${roomId}/move`,
        method: "POST",
        body: { from, to },
      }),
      invalidatesTags: (r, e, { roomId }) => [{ type: "XiangqiRoom" as any, id: roomId }],
    }),
    xiangqiResign: builder.mutation({
      query: (roomId: string) => ({
        url: `/api/xiangqi/rooms/${roomId}/resign`,
        method: "POST",
      }),
      invalidatesTags: (r, e, roomId) => [{ type: "XiangqiRoom" as any, id: roomId }],
    }),
    chatXiangqiRoom: builder.mutation({
      query: ({ roomId, text }: any) => ({
        url: `/api/xiangqi/rooms/${roomId}/chat`,
        method: "POST",
        body: { text },
      }),
    }),
    inviteXiangqiRoom: builder.mutation({
      query: ({ roomId, userIds }: any) => ({
        url: `/api/xiangqi/rooms/${roomId}/invite`,
        method: "POST",
        body: { userIds },
      }),
    }),
  }),
});

export const {
  useListXiangqiRoomsQuery,
  useCreateXiangqiRoomMutation,
  useGetXiangqiRoomQuery,
  useSitXiangqiRoomMutation,
  useLeaveXiangqiRoomMutation,
  useStartXiangqiHandMutation,
  useXiangqiMoveMutation,
  useXiangqiResignMutation,
  useChatXiangqiRoomMutation,
  useInviteXiangqiRoomMutation,
} = xiangqiApiSlice;
