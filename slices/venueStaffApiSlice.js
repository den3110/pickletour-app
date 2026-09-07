// slices/venueStaffApiSlice.js — Nhân viên & phân quyền cụm sân + quyền của tôi
import { apiSlice } from "./apiSlice";

export const venueStaffApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // Quyền của user hiện tại với 1 venue (để ẩn/hiện menu quản lý)
    getMyVenueAccess: builder.query({
      query: (venueId) => ({ url: `/api/venues/${venueId}/my-access` }),
      providesTags: (r, e, venueId) => [{ type: "VenueAccess", id: venueId }],
    }),
    listStaff: builder.query({
      query: (venueId) => ({ url: `/api/venues/${venueId}/staff` }),
      providesTags: (r, e, venueId) => [{ type: "VenueStaff", id: venueId }],
    }),
    addStaff: builder.mutation({
      query: ({ venueId, ...body }) => ({ url: `/api/venues/${venueId}/staff`, method: "POST", body }),
      invalidatesTags: (r, e, a) => [{ type: "VenueStaff", id: a.venueId }],
    }),
    updateStaff: builder.mutation({
      query: ({ venueId, staffId, ...body }) => ({ url: `/api/venues/${venueId}/staff/${staffId}`, method: "PATCH", body }),
      invalidatesTags: (r, e, a) => [{ type: "VenueStaff", id: a.venueId }],
    }),
    removeStaff: builder.mutation({
      query: ({ venueId, staffId }) => ({ url: `/api/venues/${venueId}/staff/${staffId}`, method: "DELETE" }),
      invalidatesTags: (r, e, a) => [{ type: "VenueStaff", id: a.venueId }],
    }),
    // Tìm user PickleTour để thêm làm nhân viên (theo tên/sđt)
    searchUsers: builder.query({
      query: (q) => ({ url: `/api/users/search?q=${encodeURIComponent(q)}&limit=15` }),
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetMyVenueAccessQuery,
  useListStaffQuery,
  useAddStaffMutation,
  useUpdateStaffMutation,
  useRemoveStaffMutation,
  useLazySearchUsersQuery,
} = venueStaffApiSlice;
