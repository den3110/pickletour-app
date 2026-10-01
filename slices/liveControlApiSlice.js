import { apiSlice } from "./apiSlice";

// Điều khiển luồng live từ app (qua backend proxy → control-server desktop trên Tailscale).
export const liveControlApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // Danh sách máy PC live đã đăng ký (online trước).
    getLiveMachines: builder.query({
      query: () => `/api/live-control/machines`,
      keepUnusedDataFor: 10,
    }),
    // Gọi 1 lệnh tới control-server của máy (path = endpoint control-server desktop).
    liveControlCall: builder.mutation({
      query: ({ machineId, path, method = "GET", body }) => ({
        url: `/api/live-control/${encodeURIComponent(machineId)}/call`,
        method: "POST",
        body: { path, method, body: body || {} },
      }),
    }),
    // Tạo liên kết bình luận viên (mic → luồng live) cho 1 sân đang live.
    createCommentaryToken: builder.mutation({
      query: ({ machineId, sid, courtName }) => ({
        url: `/api/live-control/${encodeURIComponent(machineId)}/commentary-token`,
        method: "POST",
        body: { sid, courtName: courtName || "" },
      }),
    }),
    // Gửi WebRTC offer (bình luận native trong app) → nhận answer. Token-gated.
    commentaryOffer: builder.mutation({
      query: ({ token, sdp, type }) => ({
        url: `/api/commentary/offer`,
        method: "POST",
        body: { token, sdp, type },
      }),
    }),
    // RTSP nguồn (admin) để xem trực tiếp mượt khi cùng Tailscale. direct=false nếu
    // nguồn local (Dahua P2P)/Imou/không RTSP → dùng WebRTC.
    getSessionRtsp: builder.query({
      query: ({ machineId, sid }) =>
        `/api/live-control/${encodeURIComponent(machineId)}/session-rtsp?sid=${encodeURIComponent(sid)}`,
      keepUnusedDataFor: 30,
    }),
  }),
});

export const {
  useGetLiveMachinesQuery,
  useLiveControlCallMutation,
  useCreateCommentaryTokenMutation,
  useCommentaryOfferMutation,
  useGetSessionRtspQuery,
} = liveControlApiSlice;
