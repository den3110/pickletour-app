// slices/playApiSlice.js — Mobile RTK Query cho "Tìm bạn đánh"
import { apiSlice } from "./apiSlice";

export const playApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    listInvites: builder.query({
      query: (params = {}) => {
        const p = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => {
          if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
        });
        const qs = p.toString();
        return { url: `/api/play${qs ? `?${qs}` : ""}`, method: "GET" };
      },
      serializeQueryArgs: ({ queryArgs }) => {
        const { page: _p, ...rest } = queryArgs || {};
        return rest;
      },
      merge: (cache, res, { arg }) => {
        if (!arg?.page || arg.page <= 1) return res;
        const ids = new Set((cache?.items || []).map((i) => String(i._id)));
        const add = (res?.items || []).filter((i) => !ids.has(String(i._id)));
        return { ...res, items: [...(cache?.items || []), ...add] };
      },
      forceRefetch: ({ currentArg, previousArg }) => currentArg?.page !== previousArg?.page,
    }),
    getInvite: builder.query({
      query: (id) => ({ url: `/api/play/${id}`, method: "GET" }),
    }),
    createInvite: builder.mutation({
      query: (body) => ({ url: `/api/play`, method: "POST", body }),
    }),
    updateInvite: builder.mutation({
      query: ({ id, ...body }) => ({ url: `/api/play/${id}`, method: "PUT", body }),
    }),
    deleteInvite: builder.mutation({
      query: (id) => ({ url: `/api/play/${id}`, method: "DELETE" }),
    }),
    requestJoin: builder.mutation({
      query: ({ id, note }) => ({ url: `/api/play/${id}/join`, method: "POST", body: { note } }),
    }),
    respondJoin: builder.mutation({
      query: ({ id, userId, action }) => ({
        url: `/api/play/${id}/join/${userId}`,
        method: "PATCH",
        body: { action },
      }),
    }),
    leaveInvite: builder.mutation({
      query: (id) => ({ url: `/api/play/${id}/join`, method: "DELETE" }),
    }),
  }),
  overrideExisting: false,
});

export const {
  useListInvitesQuery,
  useGetInviteQuery,
  useCreateInviteMutation,
  useUpdateInviteMutation,
  useDeleteInviteMutation,
  useRequestJoinMutation,
  useRespondJoinMutation,
  useLeaveInviteMutation,
} = playApiSlice;
