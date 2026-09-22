// slices/clipsApiSlice.js — Mobile RTK Query cho "Cắt clip camera sân".
// Backend: /api/clips (xử lý TUẦN TỰ ở server). Base URL đã có /api → thêm /api nữa
// theo convention app (bookings/play cũng vậy).
import { apiSlice } from "./apiSlice";

export const clipsApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // Camera của sân + khung giờ đã đặt (để UI giới hạn thanh chọn thời gian).
    getBookingClipInfo: builder.query({
      query: (bookingId) => ({ url: `/api/clips/cams?bookingId=${bookingId}` }),
      providesTags: (r, e, bookingId) => [{ type: "Clip", id: `CAMS-${bookingId}` }],
    }),
    // Danh sách clip của user cho 1 booking (mới nhất trước).
    listMyClips: builder.query({
      query: (bookingId) => ({ url: `/api/clips/mine?bookingId=${bookingId}` }),
      providesTags: (r, e, bookingId) => [{ type: "Clip", id: `BOOKING-${bookingId}` }],
    }),
    getClip: builder.query({
      query: (id) => ({ url: `/api/clips/${id}` }),
      providesTags: (r, e, id) => [{ type: "Clip", id }],
    }),
    // Tạo yêu cầu cắt: { bookingId, deviceId, startAt (ISO), endAt (ISO) }.
    createClip: builder.mutation({
      query: (body) => ({ url: `/api/clips`, method: "POST", body }),
      invalidatesTags: (r, e, arg) => [{ type: "Clip", id: `BOOKING-${arg.bookingId}` }],
    }),
    deleteClip: builder.mutation({
      query: ({ id }) => ({ url: `/api/clips/${id}`, method: "DELETE" }),
      invalidatesTags: (r, e, arg) => [
        { type: "Clip", id: arg.id },
        { type: "Clip", id: `BOOKING-${arg.bookingId}` },
      ],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetBookingClipInfoQuery,
  useListMyClipsQuery,
  useGetClipQuery,
  useCreateClipMutation,
  useDeleteClipMutation,
} = clipsApiSlice;
