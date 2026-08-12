// slices/samApiSlice.ts — Sâm Lốc
import { apiSlice } from "./apiSlice";

export const samApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    listSamRooms: builder.query({
      query: () => ({ url: "/api/sam/rooms" }),
      providesTags: [{ type: "SamRoom" as any, id: "LIST" }],
    }),
    createSamRoom: builder.mutation({
      query: (body: any) => ({
        url: "/api/sam/rooms",
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "SamRoom" as any, id: "LIST" }],
    }),
    getSamRoom: builder.query({
      query: (id: string) => ({ url: `/api/sam/rooms/${id}` }),
      providesTags: (r, e, id) => [{ type: "SamRoom" as any, id }],
    }),
    sitSamRoom: builder.mutation({
      query: ({ roomId, seatIndex }: { roomId: string; seatIndex: number }) => ({
        url: `/api/sam/rooms/${roomId}/sit`,
        method: "POST",
        body: { seatIndex },
      }),
      invalidatesTags: (r, e, { roomId }) => [
        { type: "SamRoom" as any, id: roomId },
      ],
    }),
    leaveSamRoom: builder.mutation({
      query: (roomId: string) => ({
        url: `/api/sam/rooms/${roomId}/leave`,
        method: "POST",
      }),
      invalidatesTags: (r, e, roomId) => [
        { type: "SamRoom" as any, id: roomId },
      ],
    }),
    startSamHand: builder.mutation({
      query: (roomId: string) => ({
        url: `/api/sam/rooms/${roomId}/start`,
        method: "POST",
      }),
      invalidatesTags: (r, e, roomId) => [
        { type: "SamRoom" as any, id: roomId },
      ],
    }),
    samAction: builder.mutation({
      query: ({
        roomId,
        action,
        cards,
      }: {
        roomId: string;
        action: string;
        cards?: string[];
      }) => ({
        url: `/api/sam/rooms/${roomId}/action`,
        method: "POST",
        body: { action, cards },
      }),
      invalidatesTags: (r, e, { roomId }) => [
        { type: "SamRoom" as any, id: roomId },
      ],
    }),
    chatSamRoom: builder.mutation({
      query: ({ roomId, text }: { roomId: string; text: string }) => ({
        url: `/api/sam/rooms/${roomId}/chat`,
        method: "POST",
        body: { text },
      }),
    }),
    emojiSamRoom: builder.mutation({
      query: ({ roomId, emoji }: { roomId: string; emoji: string }) => ({
        url: `/api/sam/rooms/${roomId}/emoji`,
        method: "POST",
        body: { emoji },
      }),
    }),
    inviteSamRoom: builder.mutation({
      query: ({ roomId, userIds }: { roomId: string; userIds: string[] }) => ({
        url: `/api/sam/rooms/${roomId}/invite`,
        method: "POST",
        body: { userIds },
      }),
    }),
    xinSam: builder.mutation({
      query: (roomId: string) => ({
        url: `/api/sam/rooms/${roomId}/xin-sam`,
        method: "POST",
      }),
      invalidatesTags: (r, e, roomId) => [
        { type: "SamRoom" as any, id: roomId },
      ],
    }),
    batSam: builder.mutation({
      query: (roomId: string) => ({
        url: `/api/sam/rooms/${roomId}/bat-sam`,
        method: "POST",
      }),
      invalidatesTags: (r, e, roomId) => [
        { type: "SamRoom" as any, id: roomId },
      ],
    }),
    skipXinSam: builder.mutation({
      query: (roomId: string) => ({
        url: `/api/sam/rooms/${roomId}/skip-xin-sam`,
        method: "POST",
      }),
      invalidatesTags: (r, e, roomId) => [
        { type: "SamRoom" as any, id: roomId },
      ],
    }),
  }),
});

export const {
  useListSamRoomsQuery,
  useCreateSamRoomMutation,
  useGetSamRoomQuery,
  useSitSamRoomMutation,
  useLeaveSamRoomMutation,
  useStartSamHandMutation,
  useSamActionMutation,
  useChatSamRoomMutation,
  useEmojiSamRoomMutation,
  useInviteSamRoomMutation,
  useXinSamMutation,
  useBatSamMutation,
  useSkipXinSamMutation,
} = samApiSlice;
